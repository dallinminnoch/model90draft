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
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
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

function createFact(typeKey, categoryKey, amount) {
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
    isFinalExpenseComponent: true,
    isHealthcareSensitive: isMedical,
    defaultInflationRole: isMedical ? "healthcareInflation" : "finalExpenseInflation",
    uiAvailability: "future",
    oneTimeAmount: amount,
    annualizedAmount: null
  };
}

function createLensModel(overrides = {}) {
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
    finalExpenses: {
      medicalEndOfLifeCost: 10000,
      funeralAndBurialCost: 10000,
      estateSettlementCost: 5000,
      otherFinalExpenses: 5000,
      totalFinalExpenseNeed: 30000,
      ...(overrides.finalExpenses || {})
    },
    expenseFacts: Object.prototype.hasOwnProperty.call(overrides, "expenseFacts")
      ? overrides.expenseFacts
      : {
          expenses: [
            createFact("medicalEndOfLifeCosts", "medicalFinalExpense", 10000),
            createFact("funeralBurialEstimate", "funeralBurial", 10000),
            createFact("estateSettlementCosts", "estateSettlement", 5000),
            createFact("otherFinalExpenses", "otherFinalExpense", 5000)
          ],
          totalsByBucket: {},
          metadata: {}
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
      source: "final-expense-inflation-current-output-check",
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
      source: "final-expense-inflation-current-output-check"
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
      source: "final-expense-inflation-current-output-check"
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
  const lensModel = createLensModel(options.lensModel || {});
  const analysisSettings = createAnalysisSettings(options.analysisSettings || {});
  const methodSettings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
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

function findWarning(result, code) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).find(function (warning) {
    return warning?.code === code;
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

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.calculateFinalExpenseBucketInflationProjection, "function");
assert.equal(typeof lensAnalysis.calculateFinalExpenseInflationProjection, "function");
assert.equal(typeof lensAnalysis.analysisMethods?.runNeedsAnalysis, "function");
assert.equal(typeof lensAnalysis.analysisSettingsAdapter?.createAnalysisMethodSettings, "function");

const appliedRun = runAll(context);
const appliedTrace = findTrace(appliedRun.results.needs, "finalExpenses");
assert.equal(appliedTrace.inputs.sourceMode, "expenseFacts-final-expense-components");
assert.equal(appliedTrace.inputs.currentMedicalFinalExpenseAmount, 10000);
assert.equal(appliedTrace.inputs.currentNonMedicalFinalExpenseAmount, 20000);
assert.equal(appliedTrace.inputs.medicalApplied, true);
assert.equal(appliedTrace.inputs.nonMedicalApplied, true);
assert.ok(appliedRun.results.needs.components.finalExpenses > 30000, "Valid split projection should increase Needs final expenses.");
assert.equal(appliedTrace.inputs.projectedFinalExpenseAmount, appliedRun.results.needs.components.finalExpenses);
assert.equal(appliedTrace.inputs.finalExpenseTargetAge, 85);
assert.equal(appliedTrace.inputs.currentAge, 46);
assert.equal(appliedTrace.inputs.projectionYears, 39);
assert.equal(appliedTrace.inputs.healthcareRateSourcePath, "settings.inflationAssumptions.healthcareInflationRatePercent");
assert.equal(appliedTrace.inputs.finalExpenseRateSourcePath, "settings.inflationAssumptions.finalExpenseInflationRatePercent");
assert.equal(appliedTrace.inputs.targetAgeSourcePath, "settings.inflationAssumptions.finalExpenseTargetAge");

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
assert.ok(
  findTrace(healthcareHigh.results.needs, "finalExpenses").inputs.projectedMedicalFinalExpenseAmount
    > findTrace(healthcareLow.results.needs, "finalExpenses").inputs.projectedMedicalFinalExpenseAmount,
  "Changing healthcareInflationRatePercent should change Needs medical final expense."
);
assertDimeHlvUnchanged(healthcareHigh, healthcareLow, "healthcare inflation rate");

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
assert.ok(
  findTrace(finalExpenseHigh.results.needs, "finalExpenses").inputs.projectedNonMedicalFinalExpenseAmount
    > findTrace(finalExpenseLow.results.needs, "finalExpenses").inputs.projectedNonMedicalFinalExpenseAmount,
  "Changing finalExpenseInflationRatePercent should change Needs non-medical final expense."
);
assertDimeHlvUnchanged(finalExpenseHigh, finalExpenseLow, "final expense inflation rate");

const target85Run = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseTargetAge: 85
    }
  }
});
const target95Run = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseTargetAge: 95
    }
  }
});
assert.ok(
  target95Run.results.needs.components.finalExpenses > target85Run.results.needs.components.finalExpenses,
  "Changing finalExpenseTargetAge should change Needs final expenses."
);
assertDimeHlvUnchanged(target95Run, target85Run, "final expense target age");

const disabledRun = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      enabled: false,
      healthcareInflationRatePercent: 9,
      finalExpenseInflationRatePercent: 9,
      finalExpenseTargetAge: 95
    }
  }
});
let trace = findTrace(disabledRun.results.needs, "finalExpenses");
assert.equal(disabledRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "inflation-assumptions-disabled");

const missingDobRun = runAll(context, {
  lensModel: {
    profileFacts: {
      clientDateOfBirth: null,
      clientDateOfBirthSourcePath: null,
      clientDateOfBirthStatus: "missing"
    }
  }
});
trace = findTrace(missingDobRun.results.needs, "finalExpenses");
assert.equal(missingDobRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "client-date-of-birth-missing");
assert.ok(findWarning(missingDobRun.results.needs, "missing-client-date-of-birth"));

const invalidDobRun = runAll(context, {
  lensModel: {
    profileFacts: {
      clientDateOfBirth: null,
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "invalid"
    }
  }
});
trace = findTrace(invalidDobRun.results.needs, "finalExpenses");
assert.equal(invalidDobRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "client-date-of-birth-invalid");
assert.ok(findWarning(invalidDobRun.results.needs, "invalid-client-date-of-birth"));

const invalidValuationRun = runAll(context, {
  analysisSettings: {
    valuationDate: "not-a-date"
  }
});
trace = findTrace(invalidValuationRun.results.needs, "finalExpenses");
assert.equal(invalidValuationRun.results.needs.components.finalExpenses, 30000);
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

const zeroFinalExpenseRun = runAll(context, {
  lensModel: {
    finalExpenses: {
      medicalEndOfLifeCost: 0,
      funeralAndBurialCost: 0,
      estateSettlementCost: 0,
      otherFinalExpenses: 0,
      totalFinalExpenseNeed: 0
    },
    expenseFacts: {
      expenses: [],
      totalsByBucket: {},
      metadata: {}
    }
  }
});
trace = findTrace(zeroFinalExpenseRun.results.needs, "finalExpenses");
assert.equal(zeroFinalExpenseRun.results.needs.components.finalExpenses, 0);
assert.equal(trace.inputs.reason, "zero-or-missing-current-final-expense");

const invalidHealthcareRun = runAll(context, {
  needsInflationOverrides: {
    healthcareInflationRatePercent: "not-a-number",
    finalExpenseInflationRatePercent: 3
  }
});
trace = findTrace(invalidHealthcareRun.results.needs, "finalExpenses");
assert.equal(trace.inputs.projectedMedicalFinalExpenseAmount, 10000);
assert.ok(trace.inputs.projectedNonMedicalFinalExpenseAmount > 20000);
assert.equal(trace.inputs.medicalReason, "healthcare-inflation-rate-unavailable");

const invalidFinalExpenseRun = runAll(context, {
  needsInflationOverrides: {
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: "not-a-number"
  }
});
trace = findTrace(invalidFinalExpenseRun.results.needs, "finalExpenses");
assert.ok(trace.inputs.projectedMedicalFinalExpenseAmount > 10000);
assert.equal(trace.inputs.projectedNonMedicalFinalExpenseAmount, 20000);
assert.equal(trace.inputs.nonMedicalReason, "final-expense-inflation-rate-unavailable");

const helper = lensAnalysis.calculateFinalExpenseBucketInflationProjection;
delete lensAnalysis.calculateFinalExpenseBucketInflationProjection;
const helperUnavailableRun = runAll(context, {
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 9,
      finalExpenseInflationRatePercent: 9,
      finalExpenseTargetAge: 95
    }
  }
});
lensAnalysis.calculateFinalExpenseBucketInflationProjection = helper;
trace = findTrace(helperUnavailableRun.results.needs, "finalExpenses");
assert.equal(helperUnavailableRun.results.needs.components.finalExpenses, 30000);
assert.equal(trace.inputs.reason, "final-expense-bucket-inflation-helper-unavailable");

console.log("Final Expense Inflation current-output check passed.");
