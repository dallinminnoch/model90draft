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

function createContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function createHealthcareFact(overrides = {}) {
  return {
    expenseFactId: overrides.expenseFactId || `expense_record_${overrides.typeKey || "healthcare"}`,
    expenseRecordId: overrides.expenseRecordId || `record_${overrides.typeKey || "healthcare"}`,
    typeKey: overrides.typeKey || "medicalOutOfPocket",
    categoryKey: overrides.categoryKey || "ongoingHealthcare",
    label: overrides.label || "Medical Out-of-Pocket",
    amount: overrides.amount === undefined ? 100 : overrides.amount,
    frequency: overrides.frequency || "monthly",
    termType: overrides.termType || "ongoing",
    annualizedAmount: overrides.annualizedAmount,
    oneTimeAmount: overrides.oneTimeAmount,
    sourcePath: overrides.sourcePath || "expenseFacts.expenses[0]",
    isDefaultExpense: false,
    isScalarFieldOwned: false,
    isProtected: false,
    isAddable: true,
    isRepeatableExpenseRecord: true,
    isCustomExpense: false,
    isFinalExpenseComponent: overrides.isFinalExpenseComponent === true,
    isHealthcareSensitive: overrides.isHealthcareSensitive !== false,
    defaultInflationRole: "healthcareInflation",
    uiAvailability: "initial"
  };
}

function createLensModel(extraExpenses = []) {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "valid"
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 12000,
      annualDiscretionaryPersonalSpending: 0,
      monthlyHealthcareOutOfPocketCost: 250
    },
    educationSupport: {
      totalEducationFundingNeed: 0,
      linkedDependentEducationFundingNeed: 0,
      desiredAdditionalDependentEducationFundingNeed: 0,
      desiredAdditionalDependentCount: 0,
      currentDependentDetails: []
    },
    finalExpenses: {
      medicalEndOfLifeCost: 10000,
      funeralAndBurialCost: 10000,
      estateSettlementCost: 5000,
      otherFinalExpenses: 5000,
      totalFinalExpenseNeed: 30000
    },
    expenseFacts: {
      expenses: extraExpenses,
      totalsByBucket: {},
      metadata: {
        source: "healthcare-expense-assumptions-readiness-check"
      }
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    existingCoverage: {
      totalExistingCoverage: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 0,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 0,
      metadata: {
        consumedByMethods: true
      }
    }
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
      healthcareInflationRatePercent: 0,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "healthcare-expense-assumptions-readiness-check",
      ...(overrides.inflationAssumptions || {})
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: false,
        includeProjectedDependents: false,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "healthcare-expense-assumptions-readiness-check"
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
      source: "healthcare-expense-assumptions-readiness-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    },
    ...overrides
  };
}

function createMethodSettings(adapter, analysisSettings, lensModel) {
  return adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord: {}
  });
}

function runAll(context, analysisSettings, lensModel) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const methodSettings = createMethodSettings(
    lensAnalysis.analysisSettingsAdapter,
    analysisSettings,
    lensModel
  );
  return {
    methodSettings,
    results: {
      dime: lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, cloneJson(methodSettings.dimeSettings)),
      needs: lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, cloneJson(methodSettings.needsAnalysisSettings)),
      hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(lensModel, cloneJson(methodSettings.humanLifeValueSettings))
    }
  };
}

function findTrace(result, key) {
  return (Array.isArray(result?.trace) ? result.trace : []).find(function (entry) {
    return entry?.key === key;
  });
}

const html = readRepoFile("pages/analysis-setup.html");
assert.doesNotMatch(html, /Healthcare Expense Assumptions/);
assert.doesNotMatch(html, /data-analysis-healthcare-expense-field/);
assert.doesNotMatch(html, /Enable healthcare expense component/);
assert.doesNotMatch(html, /Default healthcare expense projection years/);
assert.doesNotMatch(html, /Include one-time healthcare expenses/);
assert.match(html, /Healthcare inflation/);
assert.match(html, /eligible non-final healthcare bucket expenses/);

const setupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
assert.doesNotMatch(setupSource, /getHealthcareExpenseFieldMap/);
assert.doesNotMatch(setupSource, /readValidatedHealthcareExpenseAssumptions/);
assert.doesNotMatch(setupSource, /data-analysis-healthcare-expense-field/);
assert.doesNotMatch(setupSource, /healthcareExpenseAssumptions,\s*$/m);

const context = createContext();
const adapter = context.LensApp.lensAnalysis.analysisSettingsAdapter;
assert.deepEqual(
  cloneJson(adapter.DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS),
  {
    enabled: true,
    projectionYears: 10,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "healthcare-bucket-automatic"
  }
);

const baselineModel = createLensModel();
const baselineRun = runAll(context, createAnalysisSettings(), baselineModel);
assert.equal(baselineRun.results.needs.components.healthcareExpenses, 0);
assert.equal(findTrace(baselineRun.results.needs, "healthcareExpenses").inputs.warningCode, "no-eligible-healthcare-expense-records");

const healthcareModel = createLensModel([
  createHealthcareFact({
    typeKey: "automaticHealthcare",
    amount: 100,
    frequency: "monthly",
    annualizedAmount: 1200
  })
]);
const legacyDisabledRun = runAll(context, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: false,
    projectionYears: 60,
    includeOneTimeHealthcareExpenses: false,
    source: "legacy-saved-disabled"
  }
}), healthcareModel);
const healthcareTrace = findTrace(legacyDisabledRun.results.needs, "healthcareExpenses");
assert.equal(legacyDisabledRun.results.needs.components.healthcareExpenses, 12000);
assert.equal(healthcareTrace.inputs.enabled, true);
assert.equal(healthcareTrace.inputs.projectionYears, 10);
assert.equal(healthcareTrace.inputs.includeOneTimeHealthcareExpenses, true);
assert.equal(healthcareTrace.inputs.includedRecordCount, 1);
assert.equal(hasOwn(legacyDisabledRun.methodSettings.dimeSettings, "healthcareExpenseAssumptions"), false);
assert.equal(hasOwn(legacyDisabledRun.methodSettings.humanLifeValueSettings, "healthcareExpenseAssumptions"), false);
assert.deepEqual(
  {
    grossNeed: legacyDisabledRun.results.dime.grossNeed,
    netCoverageGap: legacyDisabledRun.results.dime.netCoverageGap,
    components: legacyDisabledRun.results.dime.components
  },
  {
    grossNeed: baselineRun.results.dime.grossNeed,
    netCoverageGap: baselineRun.results.dime.netCoverageGap,
    components: baselineRun.results.dime.components
  }
);
assert.deepEqual(
  {
    grossHumanLifeValue: legacyDisabledRun.results.hlv.grossHumanLifeValue,
    netCoverageGap: legacyDisabledRun.results.hlv.netCoverageGap,
    components: legacyDisabledRun.results.hlv.components
  },
  {
    grossHumanLifeValue: baselineRun.results.hlv.grossHumanLifeValue,
    netCoverageGap: baselineRun.results.hlv.netCoverageGap,
    components: baselineRun.results.hlv.components
  }
);

console.log("Healthcare expense automatic-bucket readiness check passed.");
