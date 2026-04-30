#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    "  LensApp.__finalExpenseInflationPrepHarness = { readValidatedAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );
  const context = {
    console,
    document: {
      addEventListener() {}
    },
    Intl,
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {};
  vm.createContext(context);
  vm.runInContext(instrumentedSource, context, {
    filename: "app/features/lens-analysis/analysis-setup.js"
  });
  return context;
}

function createLensAnalysisContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/coverage/coverage-policy-utils.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/debt-taxonomy.js",
    "app/features/lens-analysis/debt-library.js",
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
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach((relativePath) => loadScript(context, relativePath));

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function createSourceData(overrides = {}) {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    monthlyHousingCost: 2000,
    monthlyNonHousingEssentialExpenses: 3000,
    totalDebtPayoffNeed: 0,
    mortgageBalance: 0,
    funeralBurialEstimate: 15000,
    medicalEndOfLifeCosts: 15000,
    estateSettlementCosts: 10000,
    otherFinalExpenses: 5000,
    ...overrides
  };
}

function createAnalysisSettings(overrides = {}) {
  return {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      householdExpenseInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "final-expense-inflation-prep-check",
      ...(overrides.inflationAssumptions || {})
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: false,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "final-expense-inflation-prep-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: false,
        includeDiscretionarySupport: false
      },
      source: "final-expense-inflation-prep-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    },
    ...(overrides.analysisSettings || {})
  };
}

function createProfileRecord(overrides = {}, analysisSettings = createAnalysisSettings()) {
  return {
    id: "final-expense-inflation-prep-profile",
    caseRef: "CL/99120",
    displayName: "Final Expense Inflation Prep",
    dateOfBirth: "1980-06-15",
    analysisSettings,
    coveragePolicies: [],
    ...overrides
  };
}

function buildModel(lensAnalysis, options = {}) {
  const analysisSettings = options.analysisSettings || createAnalysisSettings();
  const profileRecord = options.profileRecord || createProfileRecord({}, analysisSettings);
  return lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: options.sourceData || createSourceData(),
    profileRecord,
    analysisSettings
  });
}

function createMethodSettings(adapter, analysisSettings, lensModel, profileRecord) {
  return adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord
  });
}

function runAll(context, options = {}) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const methods = lensAnalysis.analysisMethods;
  const adapter = lensAnalysis.analysisSettingsAdapter;
  const analysisSettings = options.analysisSettings || createAnalysisSettings();
  const profileRecord = options.profileRecord || createProfileRecord({}, analysisSettings);
  const builderResult = buildModel(lensAnalysis, {
    analysisSettings,
    profileRecord,
    sourceData: options.sourceData
  });
  const methodSettings = createMethodSettings(
    adapter,
    analysisSettings,
    builderResult.lensModel,
    profileRecord
  );

  return {
    builderResult,
    methodSettings,
    results: {
      dime: methods.runDimeAnalysis(builderResult.lensModel, cloneJson(methodSettings.dimeSettings)),
      needs: methods.runNeedsAnalysis(builderResult.lensModel, cloneJson(methodSettings.needsAnalysisSettings)),
      hlv: methods.runHumanLifeValueAnalysis(builderResult.lensModel, cloneJson(methodSettings.humanLifeValueSettings))
    }
  };
}

function outputSnapshot(results) {
  return {
    dime: {
      grossNeed: results.dime.grossNeed,
      netCoverageGap: results.dime.netCoverageGap,
      components: results.dime.components
    },
    needs: {
      grossNeed: results.needs.grossNeed,
      netCoverageGap: results.needs.netCoverageGap,
      components: results.needs.components
    },
    hlv: {
      grossHumanLifeValue: results.hlv.grossHumanLifeValue,
      netCoverageGap: results.hlv.netCoverageGap,
      components: results.hlv.components
    }
  };
}

const html = readRepoFile("pages/analysis-setup.html");
assert.match(html, /data-analysis-inflation-field="finalExpenseTargetAge"/);
assert.match(html, /Final expense target age \(future use\)/);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const setupHarness = setupContext.LensApp.__finalExpenseInflationPrepHarness;
assert.equal(analysisSetup.DEFAULT_INFLATION_ASSUMPTIONS.finalExpenseTargetAge, 85);

const loadedInflation = analysisSetup.getInflationAssumptions({
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseTargetAge: 92
    }
  }
});
assert.equal(loadedInflation.finalExpenseTargetAge, 92);

const invalidLoadedInflation = analysisSetup.getInflationAssumptions({
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseTargetAge: "not-a-number"
    }
  }
});
assert.equal(invalidLoadedInflation.finalExpenseTargetAge, 85);

const validatedInflation = setupHarness.readValidatedAssumptions({
  enabled: { checked: true },
  generalInflationRatePercent: { value: "3" },
  householdExpenseInflationRatePercent: { value: "3" },
  educationInflationRatePercent: { value: "5" },
  healthcareInflationRatePercent: { value: "5" },
  finalExpenseInflationRatePercent: { value: "3" },
  finalExpenseTargetAge: { value: "91" }
});
assert.equal(validatedInflation.error, undefined);
assert.equal(validatedInflation.value.finalExpenseTargetAge, 91);

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings, "function");

const validDobRun = runAll(context);
assert.equal(validDobRun.builderResult.lensModel.profileFacts.clientDateOfBirth, "1980-06-15");
assert.equal(validDobRun.builderResult.lensModel.profileFacts.clientDateOfBirthSourcePath, "profileRecord.dateOfBirth");
assert.equal(validDobRun.builderResult.lensModel.profileFacts.clientDateOfBirthStatus, "valid");

const invalidDobBuild = buildModel(lensAnalysis, {
  profileRecord: createProfileRecord({ dateOfBirth: "not-a-date" })
});
assert.equal(invalidDobBuild.lensModel.profileFacts.clientDateOfBirth, null);
assert.equal(invalidDobBuild.lensModel.profileFacts.clientDateOfBirthSourcePath, "profileRecord.dateOfBirth");
assert.equal(invalidDobBuild.lensModel.profileFacts.clientDateOfBirthStatus, "invalid");

const missingDobProfile = createProfileRecord();
delete missingDobProfile.dateOfBirth;
const missingDobBuild = buildModel(lensAnalysis, {
  profileRecord: missingDobProfile
});
assert.equal(missingDobBuild.lensModel.profileFacts.clientDateOfBirth, null);
assert.equal(missingDobBuild.lensModel.profileFacts.clientDateOfBirthSourcePath, null);
assert.equal(missingDobBuild.lensModel.profileFacts.clientDateOfBirthStatus, "missing");

assert.equal(
  validDobRun.methodSettings.needsAnalysisSettings.inflationAssumptions.finalExpenseTargetAge,
  85
);
assert.equal(hasOwn(validDobRun.methodSettings.dimeSettings, "inflationAssumptions"), false);
assert.equal(hasOwn(validDobRun.methodSettings.humanLifeValueSettings, "inflationAssumptions"), false);

const targetAge85 = runAll(context, {
  analysisSettings: createAnalysisSettings({
    inflationAssumptions: {
      finalExpenseTargetAge: 85
    }
  })
});
const targetAge95 = runAll(context, {
  analysisSettings: createAnalysisSettings({
    inflationAssumptions: {
      finalExpenseTargetAge: 95
    }
  })
});
assert.deepEqual(
  outputSnapshot(targetAge95.results),
  outputSnapshot(targetAge85.results),
  "Changing finalExpenseTargetAge should not alter current DIME, Needs, or HLV outputs before activation."
);
assert.equal(
  targetAge95.methodSettings.needsAnalysisSettings.inflationAssumptions.finalExpenseTargetAge,
  95,
  "Needs settings should preserve saved finalExpenseTargetAge for later activation."
);

const dob1980 = runAll(context, {
  profileRecord: createProfileRecord({ dateOfBirth: "1980-06-15" })
});
const dob1990 = runAll(context, {
  profileRecord: createProfileRecord({ dateOfBirth: "1990-06-15" })
});
assert.deepEqual(
  outputSnapshot(dob1990.results),
  outputSnapshot(dob1980.results),
  "Changing normalized client DOB should not alter current outputs before final expense inflation activation."
);

console.log("Final Expense Inflation prep check passed.");
