#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const pagePath = "pages/income-loss-impact.html";
const helperScript = "../app/features/lens-analysis/existing-coverage-treatment-calculations.js";
const modelBuilderScript = "../app/features/lens-analysis/lens-model-builder.js";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function toRepoRelativeScriptPath(scriptSource) {
  return scriptSource.replace(/^\.\.\//, "");
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    return output
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createContext() {
  const context = {
    console,
    Intl,
    URL,
    URLSearchParams,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  const source = readRepoFile(relativePath);
  vm.runInContext(source, context, { filename: relativePath });
}

function createSourceData() {
  return {
    grossAnnualIncome: 120000,
    netAnnualIncome: 90000,
    spouseIncome: 45000,
    spouseNetAnnualIncome: 30000,
    survivorIncome: 45000,
    survivorNetAnnualIncome: 30000,
    survivorIncomeStartDelayMonths: 0,
    housingStatus: "Renter",
    monthlyHousingCost: 2000,
    utilitiesCost: 300,
    housingInsuranceCost: 200,
    calculatedMonthlyMortgagePayment: 2500,
    insuranceCost: 500,
    healthcareOutOfPocketCost: 500,
    foodCost: 1200,
    transportationCost: 800,
    childcareDependentCareCost: 1000,
    phoneInternetCost: 200,
    householdSuppliesCost: 300,
    otherHouseholdExpenses: 500,
    cashSavings: 100000,
    cashSavingsIncludeInOffset: true,
    cashSavingsLiquidityType: "liquid",
    cashSavingsPercentAvailable: 100,
    funeralBurialEstimate: 25000,
    medicalEndOfLifeCosts: 0,
    estateSettlementCosts: 0,
    otherFinalExpenses: 0,
    immediateLiquidityBuffer: 15000,
    desiredEmergencyFund: 0,
    relocationReserve: 0,
    otherTransitionNeeds: 0,
    creditCardDebt: 10000,
    autoLoans: 10000,
    studentLoans: 0,
    personalLoans: 0,
    taxLiabilities: 0,
    businessDebt: 0,
    otherLoanObligations: 0,
    mortgageBalance: 0
  };
}

function createCoveragePolicies() {
  return [
    {
      id: "group-policy",
      coverageSource: "groupEmployer",
      policyType: "Group Life",
      effectiveDate: "2020-01-01",
      faceAmount: "100000"
    },
    {
      id: "term-policy",
      coverageSource: "individual",
      policyType: "Term Life",
      termLength: "20",
      effectiveDate: "2020-01-01",
      faceAmount: "200000"
    }
  ];
}

const incomeImpactHtml = readRepoFile(pagePath);
const scriptSources = getScriptSources(incomeImpactHtml);
const helperIndex = scriptSources.indexOf(helperScript);
const modelBuilderIndex = scriptSources.indexOf(modelBuilderScript);

assert.ok(helperIndex >= 0, "Income Impact should load existing-coverage-treatment-calculations.js.");
assert.ok(modelBuilderIndex >= 0, "Income Impact should load lens-model-builder.js.");
assert.ok(
  helperIndex < modelBuilderIndex,
  "Income Impact should load existing coverage treatment before lens-model-builder.js."
);

const context = createContext();
scriptSources
  .map(toRepoRelativeScriptPath)
  .filter(function (relativePath) {
    return [
      "app/features/coverage/coverage-policy-utils.js",
      "app/features/lens-analysis/schema.js",
      "app/features/lens-analysis/asset-taxonomy.js",
      "app/features/lens-analysis/asset-library.js",
      "app/features/lens-analysis/debt-taxonomy.js",
      "app/features/lens-analysis/debt-library.js",
      "app/features/lens-analysis/expense-taxonomy.js",
      "app/features/lens-analysis/expense-library.js",
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
      "app/features/lens-analysis/asset-growth-projection-calculations.js",
      "app/features/lens-analysis/cash-reserve-calculations.js",
      "app/features/lens-analysis/lens-model-builder.js",
      "app/features/lens-analysis/income-impact-warning-events-library.js",
      "app/features/lens-analysis/income-loss-impact-timeline-calculations.js"
    ].includes(relativePath);
  })
  .forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(
  typeof lensAnalysis.calculateExistingCoverageTreatment,
  "function",
  "Income Impact page script stack should make calculateExistingCoverageTreatment available."
);
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.calculateIncomeLossImpactTimeline, "function");

const profileRecord = {
  dateOfBirth: "1980-06-15",
  coveragePolicies: createCoveragePolicies(),
  analysisSettings: {
    valuationDate: "2026-01-01",
    existingCoverageAssumptions: {
      includeExistingCoverage: true,
      groupCoverageTreatment: {
        include: true,
        reliabilityDiscountPercent: 25
      },
      individualTermTreatment: {
        include: true,
        reliabilityDiscountPercent: 0,
        excludeIfExpiresWithinYears: null
      },
      source: "income-impact-existing-coverage-treatment-load-check"
    }
  }
};

const builderResult = lensAnalysis.buildLensModelFromSavedProtectionModeling({
  profileRecord,
  protectionModelingPayload: {
    data: createSourceData()
  },
  analysisSettings: profileRecord.analysisSettings,
  taxConfig: {
    federalTaxBrackets: []
  }
});

assert.ok(builderResult.lensModel, "Income Impact page runtime path should build a Lens model.");
assert.equal(builderResult.lensModel.existingCoverage.totalExistingCoverage, 300000);
assert.equal(
  builderResult.lensModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset,
  275000,
  "Seeded coveragePolicies[] should produce a non-null treated existing coverage offset."
);
assert.equal(
  builderResult.lensModel.treatedExistingCoverageOffset.metadata.methodOffsetSourcePath,
  "treatedExistingCoverageOffset.totalTreatedCoverageOffset"
);

const timelineResult = lensAnalysis.calculateIncomeLossImpactTimeline({
  lensModel: builderResult.lensModel,
  profileRecord,
  valuationDate: "2026-01-01",
  options: {
    scenario: {
      deathAge: 50,
      projectionHorizonYears: 40,
      mortgageTreatmentOverride: "followAssumptions"
    }
  }
});

assert.equal(timelineResult.financialRunway.existingCoverage, 275000);
assert.equal(
  timelineResult.financialRunway.inputs.availableAtDeath.coverage.sourcePath,
  "treatedExistingCoverageOffset.totalTreatedCoverageOffset",
  "Income Impact should prefer the treated coverage bucket for financial runway coverage."
);
assert.deepEqual(
  Array.from(timelineResult.financialRunway.inputs.availableAtDeath.coverage.sourcePaths || []),
  ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"],
  "Raw existingCoverage should not be part of the source path when treated coverage is available."
);
assert.equal(
  timelineResult.financialRunway.inputs.availableAtDeath.coverage.status,
  "treated"
);

const fallbackContext = createContext();
scriptSources
  .map(toRepoRelativeScriptPath)
  .filter(function (relativePath) {
    return [
      "app/features/coverage/coverage-policy-utils.js",
      "app/features/lens-analysis/schema.js",
      "app/features/lens-analysis/asset-taxonomy.js",
      "app/features/lens-analysis/asset-library.js",
      "app/features/lens-analysis/debt-taxonomy.js",
      "app/features/lens-analysis/debt-library.js",
      "app/features/lens-analysis/expense-taxonomy.js",
      "app/features/lens-analysis/expense-library.js",
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
      "app/features/lens-analysis/asset-growth-projection-calculations.js",
      "app/features/lens-analysis/cash-reserve-calculations.js",
      "app/features/lens-analysis/lens-model-builder.js",
      "app/features/lens-analysis/income-impact-warning-events-library.js",
      "app/features/lens-analysis/income-loss-impact-timeline-calculations.js"
    ].includes(relativePath);
  })
  .forEach(function (relativePath) {
    loadScript(fallbackContext, relativePath);
  });

const fallbackBuilderResult = fallbackContext.LensApp.lensAnalysis.buildLensModelFromSavedProtectionModeling({
  profileRecord,
  protectionModelingPayload: {
    data: createSourceData()
  },
  analysisSettings: profileRecord.analysisSettings,
  taxConfig: {
    federalTaxBrackets: []
  }
});
const fallbackTimelineResult = fallbackContext.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline({
  lensModel: fallbackBuilderResult.lensModel,
  profileRecord,
  valuationDate: "2026-01-01",
  options: {
    scenario: {
      deathAge: 50,
      projectionHorizonYears: 40,
      mortgageTreatmentOverride: "followAssumptions"
    }
  }
});

assert.equal(
  fallbackTimelineResult.financialRunway.inputs.availableAtDeath.coverage.sourcePath,
  "existingCoverage.totalExistingCoverage",
  "Raw existingCoverage should remain the fallback source when treated coverage is unavailable."
);
assert.deepEqual(
  Array.from(fallbackTimelineResult.financialRunway.inputs.availableAtDeath.coverage.sourcePaths || []),
  [
    "treatedExistingCoverageOffset.totalTreatedCoverageOffset",
    "existingCoverage.totalExistingCoverage"
  ]
);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js",
  "app/features/lens-analysis/income-loss-impact-display.js",
  "components.css",
  "layout.css",
  "styles.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Existing coverage helper load pass should not change model-builder, timeline, warning, display, or CSS files."
);

console.log("income-loss-impact-existing-coverage-treatment-load-check passed");
