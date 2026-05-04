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

function createFinalExpenseFact(typeKey, categoryKey, amount) {
  const isMedical = categoryKey === "medicalFinalExpense";
  return {
    expenseFactId: `scalar_${typeKey}`,
    typeKey,
    categoryKey,
    label: typeKey,
    amount,
    frequency: "oneTime",
    termType: "oneTime",
    sourcePath: `protectionModeling.data.${typeKey}`,
    isDefaultExpense: true,
    isScalarFieldOwned: true,
    isProtected: true,
    isAddable: false,
    isRepeatableExpenseRecord: false,
    isCustomExpense: false,
    isFinalExpenseComponent: true,
    isHealthcareSensitive: isMedical,
    defaultInflationRole: isMedical ? "healthcareInflation" : "finalExpenseInflation",
    oneTimeAmount: amount,
    annualizedAmount: null
  };
}

function createHealthcareFact(overrides = {}) {
  const categoryKey = overrides.categoryKey || "ongoingHealthcare";
  return {
    expenseFactId: overrides.expenseFactId || `expense_record_${overrides.typeKey || categoryKey}`,
    expenseRecordId: overrides.expenseRecordId || `record_${overrides.typeKey || categoryKey}`,
    typeKey: overrides.typeKey || categoryKey,
    categoryKey,
    label: overrides.label || overrides.typeKey || categoryKey,
    amount: overrides.amount === undefined ? 100 : overrides.amount,
    frequency: overrides.frequency || "monthly",
    termType: overrides.termType || "ongoing",
    annualizedAmount: overrides.annualizedAmount,
    oneTimeAmount: overrides.oneTimeAmount,
    termYears: overrides.termYears,
    endAge: overrides.endAge,
    endDate: overrides.endDate,
    sourcePath: overrides.sourcePath || `expenseFacts.expenses.${overrides.typeKey || categoryKey}`,
    isDefaultExpense: false,
    isScalarFieldOwned: false,
    isProtected: false,
    isAddable: true,
    isRepeatableExpenseRecord: true,
    isCustomExpense: overrides.isCustomExpense === true,
    isFinalExpenseComponent: overrides.isFinalExpenseComponent === true,
    isHealthcareSensitive: overrides.isHealthcareSensitive !== false,
    defaultInflationRole: "healthcareInflation",
    uiAvailability: "initial"
  };
}

function createNonHealthcareFact() {
  return {
    ...createHealthcareFact({
      typeKey: "livingExpense",
      categoryKey: "housingExpense",
      amount: 999999,
      annualizedAmount: 999999 * 12,
      isHealthcareSensitive: false
    }),
    defaultInflationRole: "householdInflation"
  };
}

function createExpenseFacts(extraExpenses = []) {
  return {
    expenses: [
      createFinalExpenseFact("medicalEndOfLifeCosts", "medicalFinalExpense", 10000),
      createFinalExpenseFact("funeralBurialEstimate", "funeralBurial", 10000),
      createFinalExpenseFact("estateSettlementCosts", "estateSettlement", 5000),
      createFinalExpenseFact("otherFinalExpenses", "otherFinalExpense", 5000),
      ...extraExpenses
    ],
    totalsByBucket: {},
    metadata: {
      source: "healthcare-expense-needs-activation-check"
    }
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
      monthlyHealthcareOutOfPocketCost: 250,
      annualDiscretionaryPersonalSpending: 0
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
    expenseFacts: createExpenseFacts(extraExpenses),
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

function createAnalysisSettings(options = {}) {
  return {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 0,
      householdExpenseInflationRatePercent: 0,
      educationInflationRatePercent: 0,
      healthcareInflationRatePercent: 0,
      finalExpenseInflationRatePercent: 0,
      finalExpenseTargetAge: 85,
      source: "healthcare-expense-needs-activation-check",
      ...(options.inflationAssumptions || {})
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: false,
        includeProjectedDependents: false,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "healthcare-expense-needs-activation-check"
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
      source: "healthcare-expense-needs-activation-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    },
    ...options
  };
}

function createMethodSettings(context, analysisSettings, lensModel) {
  return context.LensApp.lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord: {}
  });
}

function runAll(context, options = {}) {
  const methods = context.LensApp.lensAnalysis.analysisMethods;
  const lensModel = options.lensModel || createLensModel(options.extraExpenses || []);
  const analysisSettings = createAnalysisSettings(options.analysisSettings || {});
  const methodSettings = createMethodSettings(context, analysisSettings, lensModel);
  return {
    lensModel,
    analysisSettings,
    methodSettings,
    results: {
      dime: methods.runDimeAnalysis(lensModel, cloneJson(methodSettings.dimeSettings)),
      needs: methods.runNeedsAnalysis(lensModel, cloneJson(methodSettings.needsAnalysisSettings)),
      hlv: methods.runHumanLifeValueAnalysis(lensModel, cloneJson(methodSettings.humanLifeValueSettings))
    }
  };
}

function findTrace(result, key) {
  return (Array.isArray(result?.trace) ? result.trace : []).find(function (entry) {
    return entry?.key === key;
  });
}

function outputSnapshot(results) {
  return {
    dime: {
      grossNeed: results.dime.grossNeed,
      netCoverageGap: results.dime.netCoverageGap,
      components: results.dime.components
    },
    hlv: {
      grossHumanLifeValue: results.hlv.grossHumanLifeValue,
      netCoverageGap: results.hlv.netCoverageGap,
      components: results.hlv.components
    }
  };
}

const context = createContext();
assert.equal(typeof context.LensApp.lensAnalysis.calculateHealthcareExpenseProjection, "function");

const baselineRun = runAll(context, {
  extraExpenses: []
});
assert.equal(baselineRun.results.needs.components.healthcareExpenses, 0);
assert.equal(findTrace(baselineRun.results.needs, "healthcareExpenses").inputs.warningCode, "no-eligible-healthcare-expense-records");

const monthlyAnnualRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "monthlyHealthcare", amount: 100, frequency: "monthly", annualizedAmount: 1200 }),
    createHealthcareFact({ typeKey: "annualHealthcare", amount: 600, frequency: "annual", annualizedAmount: 600 })
  ]
});
const monthlyAnnualTrace = findTrace(monthlyAnnualRun.results.needs, "healthcareExpenses");
assert.equal(monthlyAnnualRun.results.needs.components.healthcareExpenses, 18000);
assert.equal(monthlyAnnualTrace.inputs.enabled, true);
assert.equal(monthlyAnnualTrace.inputs.projectionYears, 10);
assert.equal(monthlyAnnualTrace.inputs.projectionYearsSource, "internalHealthcareExpenseDefaults.projectionYears");
assert.equal(monthlyAnnualTrace.inputs.includedRecordCount, 2);
assert.ok(monthlyAnnualTrace.inputs.warnings.some((warning) => warning.code === "healthcare-expense-overlap-review"));

const healthcareLowRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "rateSensitiveHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
const healthcareHighRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "rateSensitiveHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 10
    }
  }
});
assert.ok(
  healthcareHighRun.results.needs.components.healthcareExpenses
    > healthcareLowRun.results.needs.components.healthcareExpenses,
  "Healthcare inflation rate should change automatic healthcare bucket expenses."
);

const inflationDisabledRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "inflationDisabledHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    inflationAssumptions: {
      enabled: false,
      healthcareInflationRatePercent: 99
    }
  }
});
assert.equal(inflationDisabledRun.results.needs.components.healthcareExpenses, 12000);
assert.ok(
  findTrace(inflationDisabledRun.results.needs, "healthcareExpenses").inputs.warnings.some(function (warning) {
    return warning.code === "healthcare-inflation-disabled-current-dollar";
  }),
  "Disabled Healthcare Inflation should fall back to current-dollar healthcare bucket projection."
);

const invalidInflationRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "invalidRateHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: -1
    }
  }
});
assert.equal(invalidInflationRun.results.needs.components.healthcareExpenses, 12000);
assert.ok(
  findTrace(invalidInflationRun.results.needs, "healthcareExpenses").inputs.warnings.some(function (warning) {
    return warning.code === "invalid-healthcare-inflation-rate-current-dollar";
  }),
  "Invalid Healthcare Inflation should fall back to current-dollar healthcare bucket projection."
);

const oneTimeRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({
      typeKey: "adaptiveEquipment",
      categoryKey: "medicalEquipment",
      amount: 5000,
      frequency: "oneTime",
      termType: "oneTime",
      oneTimeAmount: 5000
    })
  ],
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 20
    }
  }
});
assert.equal(oneTimeRun.results.needs.components.healthcareExpenses, 5000);
assert.equal(findTrace(oneTimeRun.results.needs, "healthcareExpenses").inputs.includedOneTimeHealthcareExpenseAmount, 5000);

const excludedRun = runAll(context, {
  extraExpenses: [
    createFinalExpenseFact("medicalFinalExpenseRecord", "medicalFinalExpense", 999999),
    createFinalExpenseFact("funeralFinalExpenseRecord", "funeralBurial", 999999),
    createNonHealthcareFact()
  ]
});
const excludedTrace = findTrace(excludedRun.results.needs, "healthcareExpenses");
assert.equal(excludedRun.results.needs.components.healthcareExpenses, 0);
assert.ok(excludedTrace.inputs.excludedRecords.some((record) => record.warningCode === "medical-final-expense-excluded"));
assert.ok(excludedTrace.inputs.excludedRecords.some((record) => record.warningCode === "final-expense-bucket-excluded"));
assert.ok(excludedTrace.inputs.excludedRecords.some((record) => record.warningCode === "non-healthcare-bucket-excluded"));
assert.ok(excludedRun.results.needs.components.finalExpenses > 30000);

assert.deepEqual(outputSnapshot(monthlyAnnualRun.results).dime, outputSnapshot(baselineRun.results).dime);
assert.deepEqual(outputSnapshot(monthlyAnnualRun.results).hlv, outputSnapshot(baselineRun.results).hlv);
assert.equal(Object.prototype.hasOwnProperty.call(monthlyAnnualRun.methodSettings.dimeSettings, "healthcareExpenseAssumptions"), false);
assert.equal(Object.prototype.hasOwnProperty.call(monthlyAnnualRun.methodSettings.humanLifeValueSettings, "healthcareExpenseAssumptions"), false);

const savedHelper = context.LensApp.lensAnalysis.calculateHealthcareExpenseProjection;
delete context.LensApp.lensAnalysis.calculateHealthcareExpenseProjection;
const helperUnavailableSettings = createMethodSettings(
  context,
  createAnalysisSettings(),
  monthlyAnnualRun.lensModel
);
const helperUnavailableNeeds = context.LensApp.lensAnalysis.analysisMethods.runNeedsAnalysis(
  monthlyAnnualRun.lensModel,
  cloneJson(helperUnavailableSettings.needsAnalysisSettings)
);
context.LensApp.lensAnalysis.calculateHealthcareExpenseProjection = savedHelper;
assert.equal(helperUnavailableNeeds.components.healthcareExpenses, 0);
assert.equal(
  findTrace(helperUnavailableNeeds, "healthcareExpenses").inputs.warningCode,
  "healthcare-expense-inflation-helper-unavailable"
);

console.log("healthcare-expense-needs-activation-check passed");
