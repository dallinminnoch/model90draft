#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function createContext(options = {}) {
  const context = {
    console,
    window: null,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {}
    }
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  function loadScript(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  if (options.includeTaxUtils) {
    loadScript("pmi-tax-utils.js");
  }

  [
    "app/features/coverage/coverage-policy-utils.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/block-outputs.js",
    "app/features/lens-analysis/helpers/income-tax-calculations.js",
    "app/features/lens-analysis/helpers/housing-support-calculations.js",
    "app/features/lens-analysis/blocks/existing-coverage.js",
    "app/features/lens-analysis/blocks/offset-assets.js",
    "app/features/lens-analysis/blocks/survivor-scenario.js",
    "app/features/lens-analysis/blocks/tax-context.js",
    "app/features/lens-analysis/blocks/income-net-income.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/blocks/housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/non-housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/education-support.js",
    "app/features/lens-analysis/blocks/final-expenses.js",
    "app/features/lens-analysis/blocks/transition-needs.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js"
  ].forEach(loadScript);

  return context;
}

function createAnalysisSettings(overrides = {}) {
  return {
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: true,
        applyStartDelay: true,
        ...(overrides.survivorIncomeTreatment || {})
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: true,
        includeDiscretionarySupport: false
      },
      survivorScenario: {
        survivorContinuesWorking: true,
        expectedSurvivorWorkReductionPercent: 25,
        survivorIncomeStartDelayMonths: 3,
        ...(overrides.survivorScenario || {})
      }
    }
  };
}

function buildModel(context, options = {}) {
  const sourceData = {
    grossAnnualIncome: 150000,
    spouseIncome: 300000,
    stateOfResidence: "UT",
    filingStatus: "Married Filing Jointly",
    monthlyNonHousingEssentialExpenses: 8000,
    ...(options.sourceData || {})
  };
  const input = {
    sourceData,
    profileRecord: {
      state: "UT",
      maritalStatus: "Married",
      analysisSettings: createAnalysisSettings(options.analysisOverrides || {})
    },
    analysisSettings: createAnalysisSettings(options.analysisOverrides || {})
  };
  if (options.taxConfig) {
    input.taxConfig = options.taxConfig;
  }
  const result = context.LensApp.lensAnalysis.buildLensModelFromSavedProtectionModeling(input);
  assert.ok(result.lensModel, "Lens model should build.");
  return result.lensModel;
}

function createTaxConfig(context) {
  return context.LensApp.lensAnalysis.incomeTaxCalculations.createDefaultPmiTaxConfig({
    taxUtils: context.LensPmiTaxUtils
  });
}

const taxContext = createContext({ includeTaxUtils: true });
const explicitNetModel = buildModel(taxContext, {
  taxConfig: createTaxConfig(taxContext),
  sourceData: {
    spouseIncome: "",
    spouseNetAnnualIncome: 180000
  }
});
assert.equal(explicitNetModel.survivorScenario.survivorNetAnnualIncome, 135000);
assert.equal(explicitNetModel.survivorScenario.survivorIncomeDerivation.survivorIncomeSource, "derived-from-spouse-net-income");
assert.equal(
  explicitNetModel.survivorScenario.survivorIncomeDerivation.baseSurvivorNetIncomeSource,
  "protectionModeling.data.spouseNetAnnualIncome"
);
assert.equal(explicitNetModel.survivorScenario.survivorIncomeDerivation.survivorNetIncomeWorkReductionAppliedAfterTax, true);

const taxCalculatedModel = buildModel(taxContext, {
  taxConfig: createTaxConfig(taxContext)
});
assert.ok(taxCalculatedModel.survivorScenario.survivorNetAnnualIncome > 0);
assert.equal(
  taxCalculatedModel.survivorScenario.survivorIncomeDerivation.baseSurvivorNetIncomeSource,
  "calculated-tax-net-from-spouse-income"
);
assert.equal(taxCalculatedModel.survivorScenario.survivorIncomeDerivation.conservativeGrossIncomeFallbackUsed, false);
assert.ok(
  taxCalculatedModel.survivorScenario.survivorNetAnnualIncome
    < taxCalculatedModel.survivorScenario.survivorIncomeDerivation.baseSurvivorNetAnnualIncomeBeforeWorkReduction,
  "Work reduction should lower survivor net income after base net income is prepared."
);

const janeLikeNoTaxUtilsContext = createContext({ includeTaxUtils: false });
const janeLikeModel = buildModel(janeLikeNoTaxUtilsContext);
assert.equal(janeLikeModel.survivorScenario.survivorNetAnnualIncome, 168750);
assert.equal(
  janeLikeModel.survivorScenario.survivorIncomeDerivation.baseSurvivorNetIncomeSource,
  "conservative-gross-income-fallback"
);
assert.equal(janeLikeModel.survivorScenario.survivorIncomeDerivation.conservativeGrossIncomeFallbackUsed, true);
assert.equal(janeLikeModel.survivorScenario.survivorIncomeDerivation.survivorNetIncomeFailureReason, "missing-tax-config");
assert.ok(
  janeLikeModel.survivorScenario.survivorIncomeDerivation.warnings.some((warning) => warning.code === "missing-tax-config"),
  "Missing tax utilities should leave a trace warning instead of silently producing null survivor income."
);

const incomeOffModel = buildModel(taxContext, {
  taxConfig: createTaxConfig(taxContext),
  analysisOverrides: {
    survivorIncomeTreatment: {
      includeSurvivorIncome: false
    }
  }
});
assert.equal(incomeOffModel.survivorScenario.survivorNetAnnualIncome, null);
assert.equal(
  incomeOffModel.survivorScenario.survivorIncomeDerivation.survivorIncomeSource,
  "suppressed-survivor-income-offset-disabled"
);

console.log("survivor-income-gross-to-net-derivation-check passed");
