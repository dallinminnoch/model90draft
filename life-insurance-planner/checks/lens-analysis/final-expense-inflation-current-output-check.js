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

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
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
      totalFinalExpenseNeed: 10000,
      ...(overrides.finalExpenses || {})
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
  const inflationOverrides = options.inflationAssumptions || {};
  return {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 0,
      householdExpenseInflationRatePercent: 0,
      educationInflationRatePercent: 0,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "final-expense-inflation-current-output-check",
      ...inflationOverrides
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
    },
    ...(options.analysisSettings || {})
  };
}

function runAll(context, options = {}) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const adapter = lensAnalysis.analysisSettingsAdapter;
  const methods = lensAnalysis.analysisMethods;
  const lensModel = createLensModel(options.lensModel || {});
  const analysisSettings = createAnalysisSettings(options);
  const methodSettings = adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord: {}
  });

  return {
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

function assertNoInflationMappedToDimeOrHlv(methodSettings) {
  assert.equal(hasOwn(methodSettings.dimeSettings, "inflationAssumptions"), false);
  assert.equal(hasOwn(methodSettings.humanLifeValueSettings, "inflationAssumptions"), false);
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.calculateFinalExpenseInflationProjection, "function");
assert.equal(typeof lensAnalysis.analysisMethods?.runNeedsAnalysis, "function");
assert.equal(typeof lensAnalysis.analysisSettingsAdapter?.createAnalysisMethodSettings, "function");

const appliedRun = runAll(context, {
  inflationAssumptions: {
    enabled: true,
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 85
  }
});
const appliedTrace = findTrace(appliedRun.results.needs, "finalExpenses");
assert.ok(appliedRun.results.needs.components.finalExpenses > 10000, "Valid DOB, rate, and target age should increase Needs final expenses.");
assert.ok(appliedRun.results.needs.grossNeed > 10000, "Projected final expense should flow into Needs gross need.");
assert.equal(appliedTrace.inputs.applied, true);
assert.equal(appliedTrace.inputs.currentFinalExpenseAmount, 10000);
assert.equal(appliedTrace.inputs.projectedFinalExpenseAmount, appliedRun.results.needs.components.finalExpenses);
assert.equal(appliedTrace.inputs.finalExpenseInflationRatePercent, 3);
assert.equal(appliedTrace.inputs.finalExpenseTargetAge, 85);
assert.equal(appliedTrace.inputs.clientDateOfBirth, "1980-01-01");
assert.equal(appliedTrace.inputs.clientDateOfBirthSourcePath, "profileRecord.dateOfBirth");
assert.equal(appliedTrace.inputs.clientDateOfBirthStatus, "valid");
assert.equal(appliedTrace.inputs.valuationDate, "2026-01-01");
assert.equal(appliedTrace.inputs.currentAge, 46);
assert.equal(appliedTrace.inputs.projectionYears, 39);
assert.equal(appliedTrace.inputs.rateSourcePath, "settings.inflationAssumptions.finalExpenseInflationRatePercent");
assert.equal(appliedTrace.inputs.targetAgeSourcePath, "settings.inflationAssumptions.finalExpenseTargetAge");
assertNoInflationMappedToDimeOrHlv(appliedRun.methodSettings);

const lowRateRun = runAll(context, {
  inflationAssumptions: {
    finalExpenseInflationRatePercent: 1,
    finalExpenseTargetAge: 85
  }
});
const highRateRun = runAll(context, {
  inflationAssumptions: {
    finalExpenseInflationRatePercent: 9,
    finalExpenseTargetAge: 85
  }
});
assert.ok(
  highRateRun.results.needs.components.finalExpenses > lowRateRun.results.needs.components.finalExpenses,
  "Changing finalExpenseInflationRatePercent should change Needs final expenses."
);
assert.ok(
  highRateRun.results.needs.grossNeed > lowRateRun.results.needs.grossNeed,
  "Changing finalExpenseInflationRatePercent should change Needs gross need."
);
assertDimeHlvUnchanged(highRateRun, lowRateRun, "final expense inflation rate");

const target85Run = runAll(context, {
  inflationAssumptions: {
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 85
  }
});
const target95Run = runAll(context, {
  inflationAssumptions: {
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 95
  }
});
assert.ok(
  target95Run.results.needs.components.finalExpenses > target85Run.results.needs.components.finalExpenses,
  "Changing finalExpenseTargetAge should change Needs final expenses."
);
assertDimeHlvUnchanged(target95Run, target85Run, "final expense target age");

const disabledRun = runAll(context, {
  inflationAssumptions: {
    enabled: false,
    finalExpenseInflationRatePercent: 9,
    finalExpenseTargetAge: 95
  }
});
const disabledTrace = findTrace(disabledRun.results.needs, "finalExpenses");
assert.equal(disabledRun.results.needs.components.finalExpenses, 10000);
assert.equal(disabledTrace.inputs.applied, false);
assert.equal(disabledTrace.inputs.reason, "inflation-assumptions-disabled");

const missingDobRun = runAll(context, {
  lensModel: {
    profileFacts: {
      clientDateOfBirth: null,
      clientDateOfBirthSourcePath: null,
      clientDateOfBirthStatus: "missing"
    }
  }
});
const missingDobTrace = findTrace(missingDobRun.results.needs, "finalExpenses");
assert.equal(missingDobRun.results.needs.components.finalExpenses, 10000);
assert.equal(missingDobTrace.inputs.applied, false);
assert.equal(missingDobTrace.inputs.reason, "client-date-of-birth-missing");
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
const invalidDobTrace = findTrace(invalidDobRun.results.needs, "finalExpenses");
assert.equal(invalidDobRun.results.needs.components.finalExpenses, 10000);
assert.equal(invalidDobTrace.inputs.reason, "client-date-of-birth-invalid");
assert.ok(findWarning(invalidDobRun.results.needs, "invalid-client-date-of-birth"));

const missingValuationRun = runAll(context, {
  analysisSettings: {
    valuationDate: null
  }
});
const missingValuationTrace = findTrace(missingValuationRun.results.needs, "finalExpenses");
assert.equal(missingValuationRun.results.needs.components.finalExpenses, 10000);
assert.equal(missingValuationTrace.inputs.applied, false);
assert.equal(missingValuationTrace.inputs.reason, "valuation-date-unavailable");

const invalidValuationRun = runAll(context, {
  analysisSettings: {
    valuationDate: "not-a-date"
  }
});
const invalidValuationTrace = findTrace(invalidValuationRun.results.needs, "finalExpenses");
assert.equal(invalidValuationRun.results.needs.components.finalExpenses, 10000);
assert.equal(invalidValuationTrace.inputs.reason, "valuation-date-unavailable");

const targetAgeNotGreaterRun = runAll(context, {
  inflationAssumptions: {
    finalExpenseTargetAge: 40
  }
});
const targetAgeNotGreaterTrace = findTrace(targetAgeNotGreaterRun.results.needs, "finalExpenses");
assert.equal(targetAgeNotGreaterRun.results.needs.components.finalExpenses, 10000);
assert.equal(targetAgeNotGreaterTrace.inputs.reason, "target-age-not-greater-than-current-age");
assert.equal(targetAgeNotGreaterTrace.inputs.projectionYears, 0);

const zeroFinalExpenseRun = runAll(context, {
  lensModel: {
    finalExpenses: {
      totalFinalExpenseNeed: 0
    }
  }
});
const zeroFinalExpenseTrace = findTrace(zeroFinalExpenseRun.results.needs, "finalExpenses");
assert.equal(zeroFinalExpenseRun.results.needs.components.finalExpenses, 0);
assert.equal(zeroFinalExpenseTrace.inputs.reason, "zero-or-missing-current-final-expense");

const invalidRateRun = runAll(context, {
  inflationAssumptions: {
    finalExpenseInflationRatePercent: "not-a-number"
  }
});
const invalidRateTrace = findTrace(invalidRateRun.results.needs, "finalExpenses");
assert.equal(invalidRateRun.results.needs.components.finalExpenses, 10000);
assert.equal(invalidRateTrace.inputs.reason, "final-expense-inflation-rate-unavailable");

const invalidTargetAgeRun = runAll(context, {
  inflationAssumptions: {
    finalExpenseTargetAge: "not-a-number"
  }
});
const invalidTargetAgeTrace = findTrace(invalidTargetAgeRun.results.needs, "finalExpenses");
assert.equal(invalidTargetAgeRun.results.needs.components.finalExpenses, 10000);
assert.equal(invalidTargetAgeTrace.inputs.reason, "final-expense-target-age-unavailable");

const helper = lensAnalysis.calculateFinalExpenseInflationProjection;
delete lensAnalysis.calculateFinalExpenseInflationProjection;
const helperUnavailableRun = runAll(context, {
  inflationAssumptions: {
    finalExpenseInflationRatePercent: 9,
    finalExpenseTargetAge: 95
  }
});
lensAnalysis.calculateFinalExpenseInflationProjection = helper;
const helperUnavailableTrace = findTrace(helperUnavailableRun.results.needs, "finalExpenses");
assert.equal(helperUnavailableRun.results.needs.components.finalExpenses, 10000);
assert.equal(helperUnavailableTrace.inputs.reason, "final-expense-inflation-helper-unavailable");

const healthcareLowRun = runAll(context, {
  inflationAssumptions: {
    healthcareInflationRatePercent: 1,
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 85
  }
});
const healthcareHighRun = runAll(context, {
  inflationAssumptions: {
    healthcareInflationRatePercent: 9,
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 85
  }
});
assert.deepEqual(
  healthcareHighRun.results,
  healthcareLowRun.results,
  "Healthcare inflation should remain separate and should not affect current DIME, Needs, or HLV outputs."
);

console.log("Final Expense Inflation current-output check passed.");
