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
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
  });

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function roundMoney(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function createFinalExpenseFact(typeKey, categoryKey, amount, options = {}) {
  const isMedical = categoryKey === "medicalFinalExpense";
  return {
    expenseFactId: `scalar_${typeKey}`,
    typeKey,
    categoryKey,
    label: options.label || typeKey,
    amount,
    frequency: "oneTime",
    termType: "oneTime",
    source: "protectionModeling.data",
    sourceKey: typeKey,
    sourcePath: options.sourcePath || `protectionModeling.data.${typeKey}`,
    ownedByField: typeKey,
    isDefaultExpense: options.isDefaultExpense !== false,
    isScalarFieldOwned: options.isScalarFieldOwned !== false,
    isProtected: options.isProtected !== false,
    isAddable: false,
    isRepeatableExpenseRecord: options.isRepeatableExpenseRecord === true,
    isCustomExpense: false,
    isFinalExpenseComponent: true,
    isHealthcareSensitive: isMedical,
    defaultInflationRole: isMedical ? "healthcareInflation" : "finalExpenseInflation",
    uiAvailability: options.uiAvailability || "future",
    oneTimeAmount: amount,
    annualizedAmount: null,
    metadata: {
      recordSource: options.recordSource || "final-expense-scalar-field"
    }
  };
}

function createNonFinalExpenseFact(typeKey, categoryKey, amount, options = {}) {
  return {
    expenseFactId: `expense_record_${typeKey}`,
    expenseRecordId: `record_${typeKey}`,
    typeKey,
    categoryKey,
    label: options.label || typeKey,
    amount,
    frequency: options.frequency || "monthly",
    termType: "ongoing",
    source: "protectionModeling.data.expenseRecords",
    sourceKey: "expenseRecords",
    sourcePath: `protectionModeling.data.expenseRecords[${options.sourceIndex || 0}]`,
    sourceIndex: options.sourceIndex || 0,
    isDefaultExpense: false,
    isScalarFieldOwned: false,
    isProtected: false,
    isAddable: true,
    isRepeatableExpenseRecord: true,
    isCustomExpense: false,
    isFinalExpenseComponent: false,
    isHealthcareSensitive: categoryKey !== "housingExpense",
    defaultInflationRole: categoryKey === "housingExpense" ? "householdInflation" : "healthcareInflation",
    uiAvailability: "initial",
    annualizedAmount: amount * 12,
    oneTimeAmount: null
  };
}

function createExpenseFacts(options = {}) {
  const medicalAmount = options.medicalAmount ?? 10000;
  const nonMedicalAmounts = options.nonMedicalAmounts || {
    funeral: 10000,
    estate: 5000,
    other: 5000
  };
  const finalExpenseFacts = [
    createFinalExpenseFact("medicalEndOfLifeCosts", "medicalFinalExpense", medicalAmount),
    createFinalExpenseFact("funeralBurialEstimate", "funeralBurial", nonMedicalAmounts.funeral),
    createFinalExpenseFact("estateSettlementCosts", "estateSettlement", nonMedicalAmounts.estate),
    createFinalExpenseFact("otherFinalExpenses", "otherFinalExpense", nonMedicalAmounts.other)
  ];

  return {
    expenses: [
      ...finalExpenseFacts,
      ...(options.extraExpenses || [])
    ],
    totalsByBucket: {},
    metadata: {
      source: "protectionModeling.data"
    }
  };
}

function createLensModel(overrides = {}) {
  const finalExpenses = {
    medicalEndOfLifeCost: 10000,
    funeralAndBurialCost: 10000,
    estateSettlementCost: 5000,
    otherFinalExpenses: 5000,
    totalFinalExpenseNeed: 30000,
    ...(overrides.finalExpenses || {})
  };
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "valid",
      ...(overrides.profileFacts || {})
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      annualNetIncome: 90000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 0,
      annualDiscretionaryPersonalSpending: 0
    },
    educationSupport: {
      totalEducationFundingNeed: 0,
      linkedDependentEducationFundingNeed: 0,
      desiredAdditionalDependentEducationFundingNeed: 0,
      desiredAdditionalDependentCount: 0,
      currentDependentDetails: []
    },
    finalExpenses,
    expenseFacts: Object.prototype.hasOwnProperty.call(overrides, "expenseFacts")
      ? overrides.expenseFacts
      : createExpenseFacts(),
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
    valuationDate: options.valuationDate === undefined ? "2026-01-01" : options.valuationDate,
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 0,
      householdExpenseInflationRatePercent: 0,
      educationInflationRatePercent: 0,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "healthcare-final-expense-split-current-output-check",
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
      source: "healthcare-final-expense-split-current-output-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: false,
        includeTransitionNeeds: false,
        includeDiscretionarySupport: false
      },
      source: "healthcare-final-expense-split-current-output-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    }
  };
}

function runAll(context, options = {}) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const adapter = lensAnalysis.analysisSettingsAdapter;
  const methods = lensAnalysis.analysisMethods;
  const lensModel = createLensModel(options.lensModel || {});
  const analysisSettings = createAnalysisSettings(options.analysisSettings || {});
  const methodSettings = adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord: {}
  });

  if (options.needsInflationOverrides) {
    methodSettings.needsAnalysisSettings.inflationAssumptions = {
      ...methodSettings.needsAnalysisSettings.inflationAssumptions,
      ...options.needsInflationOverrides
    };
  }

  return {
    lensModel,
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

function dimeSnapshot(results) {
  return {
    grossNeed: results.dime.grossNeed,
    netCoverageGap: results.dime.netCoverageGap,
    components: results.dime.components
  };
}

function hlvSnapshot(results) {
  return {
    grossHumanLifeValue: results.hlv.grossHumanLifeValue,
    netCoverageGap: results.hlv.netCoverageGap,
    components: results.hlv.components
  };
}

function assertDimeHlvUnchanged(left, right, label) {
  assert.deepEqual(dimeSnapshot(left.results), dimeSnapshot(right.results), `${label}: DIME should remain unchanged.`);
  assert.deepEqual(hlvSnapshot(left.results), hlvSnapshot(right.results), `${label}: HLV should remain unchanged.`);
}

function assertCombinedProjection(trace) {
  assert.equal(
    trace.inputs.projectedFinalExpenseAmount,
    roundMoney(trace.inputs.projectedMedicalFinalExpenseAmount + trace.inputs.projectedNonMedicalFinalExpenseAmount),
    "Combined projected final expense should equal projected medical plus projected non-medical."
  );
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.calculateFinalExpenseBucketInflationProjection, "function");
assert.equal(typeof lensAnalysis.calculateFinalExpenseInflationProjection, "function");

const baseline = runAll(context);
const baselineTrace = findTrace(baseline.results.needs, "finalExpenses");
assert.equal(baselineTrace.inputs.sourceMode, "expenseFacts-final-expense-components");
assert.equal(baselineTrace.inputs.currentMedicalFinalExpenseAmount, 10000);
assert.equal(baselineTrace.inputs.currentNonMedicalFinalExpenseAmount, 20000);
assert.equal(baselineTrace.inputs.currentFinalExpenseAmount, 30000);
assert.equal(baselineTrace.inputs.healthcareInflationRatePercent, 5);
assert.equal(baselineTrace.inputs.finalExpenseInflationRatePercent, 3);
assert.equal(baselineTrace.inputs.medicalApplied, true);
assert.equal(baselineTrace.inputs.nonMedicalApplied, true);
assert.equal(baseline.results.needs.components.finalExpenses, baselineTrace.inputs.projectedFinalExpenseAmount);
assertCombinedProjection(baselineTrace);

const healthcareLow = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 1,
      finalExpenseInflationRatePercent: 3
    }
  }
});
const healthcareHigh = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 9,
      finalExpenseInflationRatePercent: 3
    }
  }
});
const healthcareLowTrace = findTrace(healthcareLow.results.needs, "finalExpenses");
const healthcareHighTrace = findTrace(healthcareHigh.results.needs, "finalExpenses");
assert.ok(
  healthcareHighTrace.inputs.projectedMedicalFinalExpenseAmount > healthcareLowTrace.inputs.projectedMedicalFinalExpenseAmount,
  "Medical final expense should change with healthcare inflation."
);
assert.equal(
  healthcareHighTrace.inputs.projectedNonMedicalFinalExpenseAmount,
  healthcareLowTrace.inputs.projectedNonMedicalFinalExpenseAmount,
  "Healthcare inflation should not change non-medical final expense."
);
assertDimeHlvUnchanged(healthcareHigh, healthcareLow, "healthcare inflation");

const finalExpenseLow = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 1
    }
  }
});
const finalExpenseHigh = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 9
    }
  }
});
const finalExpenseLowTrace = findTrace(finalExpenseLow.results.needs, "finalExpenses");
const finalExpenseHighTrace = findTrace(finalExpenseHigh.results.needs, "finalExpenses");
assert.ok(
  finalExpenseHighTrace.inputs.projectedNonMedicalFinalExpenseAmount > finalExpenseLowTrace.inputs.projectedNonMedicalFinalExpenseAmount,
  "Non-medical final expense should change with final expense inflation."
);
assert.equal(
  finalExpenseHighTrace.inputs.projectedMedicalFinalExpenseAmount,
  finalExpenseLowTrace.inputs.projectedMedicalFinalExpenseAmount,
  "Final expense inflation should not change medical final expense."
);
assertDimeHlvUnchanged(finalExpenseHigh, finalExpenseLow, "final expense inflation");

const rawOnlyExpenses = createExpenseFacts({
  extraExpenses: [
    createNonFinalExpenseFact("medicalOutOfPocket", "ongoingHealthcare", 100000, { sourceIndex: 4 }),
    createNonFinalExpenseFact("propertyTaxes", "housingExpense", 100000, { sourceIndex: 5 })
  ]
});
const rawOnlyRun = runAll(context, {
  lensModel: {
    expenseFacts: rawOnlyExpenses
  }
});
assert.deepEqual(
  findTrace(rawOnlyRun.results.needs, "finalExpenses").inputs,
  baselineTrace.inputs,
  "Recurring healthcare and non-final expense facts should remain raw-only for Needs final expense."
);
assertDimeHlvUnchanged(rawOnlyRun, baseline, "raw-only non-final expense facts");

const noDoubleCountRun = runAll(context, {
  lensModel: {
    finalExpenses: {
      medicalEndOfLifeCost: 999999,
      funeralAndBurialCost: 999999,
      estateSettlementCost: 999999,
      otherFinalExpenses: 999999,
      totalFinalExpenseNeed: 3999996
    }
  }
});
const noDoubleCountTrace = findTrace(noDoubleCountRun.results.needs, "finalExpenses");
assert.equal(noDoubleCountTrace.inputs.sourceMode, "expenseFacts-final-expense-components");
assert.equal(noDoubleCountTrace.inputs.currentFinalExpenseAmount, 30000);
assert.ok(
  noDoubleCountTrace.inputs.projectedFinalExpenseAmount < 3999996,
  "Needs should not sum expenseFacts and finalExpenses together."
);

const fallbackRun = runAll(context, {
  lensModel: {
    expenseFacts: undefined
  }
});
const fallbackTrace = findTrace(fallbackRun.results.needs, "finalExpenses");
assert.equal(fallbackTrace.inputs.sourceMode, "finalExpenses-fallback");
assert.equal(fallbackTrace.inputs.currentMedicalFinalExpenseAmount, 10000);
assert.equal(fallbackTrace.inputs.currentNonMedicalFinalExpenseAmount, 20000);

const missingDobRun = runAll(context, {
  lensModel: {
    profileFacts: {
      clientDateOfBirth: null,
      clientDateOfBirthSourcePath: null,
      clientDateOfBirthStatus: "missing"
    }
  }
});
let trace = findTrace(missingDobRun.results.needs, "finalExpenses");
assert.equal(missingDobRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "client-date-of-birth-missing");
assert.equal(trace.inputs.applied, false);

const invalidDobRun = runAll(context, {
  lensModel: {
    profileFacts: {
      clientDateOfBirth: "not-a-date",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "invalid"
    }
  }
});
trace = findTrace(invalidDobRun.results.needs, "finalExpenses");
assert.equal(invalidDobRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "client-date-of-birth-invalid");

const invalidValuationRun = runAll(context, {
  analysisSettings: {
    valuationDate: "not-a-date"
  }
});
trace = findTrace(invalidValuationRun.results.needs, "finalExpenses");
assert.equal(invalidValuationRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "valuation-date-unavailable");

const defaultedValuationRun = runAll(context, {
  needsInflationOverrides: {},
  analysisSettings: {
    valuationDate: "2026-01-01"
  }
});
defaultedValuationRun.methodSettings.needsAnalysisSettings.valuationDateDefaulted = true;
const defaultedValuationNeeds = context.LensApp.lensAnalysis.analysisMethods.runNeedsAnalysis(
  defaultedValuationRun.lensModel,
  cloneJson(defaultedValuationRun.methodSettings.needsAnalysisSettings)
);
trace = findTrace(defaultedValuationNeeds, "finalExpenses");
assert.equal(defaultedValuationNeeds.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "valuation-date-unavailable");

const targetAgeNotGreaterRun = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseTargetAge: 40
    }
  }
});
trace = findTrace(targetAgeNotGreaterRun.results.needs, "finalExpenses");
assert.equal(targetAgeNotGreaterRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "target-age-not-greater-than-current-age");

const invalidHealthcareRun = runAll(context, {
  needsInflationOverrides: {
    healthcareInflationRatePercent: "invalid",
    finalExpenseInflationRatePercent: 3
  }
});
trace = findTrace(invalidHealthcareRun.results.needs, "finalExpenses");
assert.equal(trace.inputs.projectedMedicalFinalExpenseAmount, 10000);
assert.ok(trace.inputs.projectedNonMedicalFinalExpenseAmount > 20000);
assert.equal(trace.inputs.medicalApplied, false);
assert.equal(trace.inputs.nonMedicalApplied, true);
assert.equal(trace.inputs.medicalReason, "healthcare-inflation-rate-unavailable");

const invalidFinalExpenseRateRun = runAll(context, {
  needsInflationOverrides: {
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: "invalid"
  }
});
trace = findTrace(invalidFinalExpenseRateRun.results.needs, "finalExpenses");
assert.ok(trace.inputs.projectedMedicalFinalExpenseAmount > 10000);
assert.equal(trace.inputs.projectedNonMedicalFinalExpenseAmount, 20000);
assert.equal(trace.inputs.medicalApplied, true);
assert.equal(trace.inputs.nonMedicalApplied, false);
assert.equal(trace.inputs.nonMedicalReason, "final-expense-inflation-rate-unavailable");

console.log("healthcare-final-expense-split-current-output-check passed");
