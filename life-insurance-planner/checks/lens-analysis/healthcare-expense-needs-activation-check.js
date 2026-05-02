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
    sourcePath: options.sourcePath || `protectionModeling.data.${typeKey}`,
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
  const frequency = overrides.frequency || "monthly";
  const termType = overrides.termType || "ongoing";
  return {
    expenseFactId: overrides.expenseFactId || `expense_record_${overrides.typeKey || categoryKey}`,
    expenseRecordId: overrides.expenseRecordId || `record_${overrides.typeKey || categoryKey}`,
    typeKey: overrides.typeKey || categoryKey,
    categoryKey,
    label: overrides.label || overrides.typeKey || categoryKey,
    amount: overrides.amount === undefined ? 100 : overrides.amount,
    frequency,
    termType,
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

function createNonHealthcareFact(overrides = {}) {
  return {
    ...createHealthcareFact({
      typeKey: overrides.typeKey || "nonHealthcareExpense",
      categoryKey: overrides.categoryKey || "livingExpense",
      amount: overrides.amount === undefined ? 100000 : overrides.amount,
      frequency: overrides.frequency || "monthly",
      termType: overrides.termType || "ongoing",
      isHealthcareSensitive: false,
      isCustomExpense: overrides.isCustomExpense === true
    }),
    defaultInflationRole: "none"
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

function createLensModel(extraExpenses = [], overrides = {}) {
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
    },
    ...overrides
  };
}

function createAnalysisSettings(options = {}) {
  const settings = {
    valuationDate: options.valuationDate === undefined ? "2026-01-01" : options.valuationDate,
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
    healthcareExpenseAssumptions: {
      enabled: false,
      projectionYears: 2,
      includeOneTimeHealthcareExpenses: false,
      oneTimeProjectionMode: "currentDollarOnly",
      source: "healthcare-expense-needs-activation-check",
      ...(options.healthcareExpenseAssumptions || {})
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
    }
  };

  return settings;
}

function createMethodSettings(adapter, analysisSettings, lensModel) {
  return adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord: {}
  });
}

function runAll(context, options = {}) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const methods = lensAnalysis.analysisMethods;
  const adapter = lensAnalysis.analysisSettingsAdapter;
  const lensModel = options.lensModel || createLensModel(options.extraExpenses || []);
  const analysisSettings = createAnalysisSettings(options.analysisSettings || {});
  const methodSettings = createMethodSettings(adapter, analysisSettings, lensModel);
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

function runNeedsWithSettings(context, lensModel, needsAnalysisSettings) {
  return context.LensApp.lensAnalysis.analysisMethods.runNeedsAnalysis(
    lensModel,
    cloneJson(needsAnalysisSettings)
  );
}

function findTrace(result, key) {
  return (Array.isArray(result?.trace) ? result.trace : []).find(function (entry) {
    return entry?.key === key;
  });
}

function findWarning(result, code) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).find(function (entry) {
    return entry?.code === code;
  });
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

function assertDimeHlvUnchanged(left, right, label) {
  assert.deepEqual(outputSnapshot(left.results).dime, outputSnapshot(right.results).dime, `${label}: DIME should remain unchanged.`);
  assert.deepEqual(outputSnapshot(left.results).hlv, outputSnapshot(right.results).hlv, `${label}: HLV should remain unchanged.`);
}

function helperProjection(context, run) {
  return context.LensApp.lensAnalysis.calculateHealthcareExpenseProjection({
    expenseFacts: run.lensModel.expenseFacts,
    healthcareExpenseAssumptions: run.methodSettings.needsAnalysisSettings.healthcareExpenseAssumptions,
    inflationAssumptions: run.methodSettings.needsAnalysisSettings.inflationAssumptions,
    profileFacts: run.lensModel.profileFacts,
    valuationDate: run.methodSettings.needsAnalysisSettings.valuationDate,
    valuationDateSource: run.methodSettings.needsAnalysisSettings.valuationDateSource,
    valuationDateDefaulted: run.methodSettings.needsAnalysisSettings.valuationDateDefaulted
  });
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const methods = lensAnalysis.analysisMethods;
const adapter = lensAnalysis.analysisSettingsAdapter;

assert.equal(typeof lensAnalysis.calculateHealthcareExpenseProjection, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");
assert.equal(typeof adapter?.createAnalysisMethodSettings, "function");

const priorBehaviorRun = runAll(context, {
  extraExpenses: [],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: false
    }
  }
});
const disabledRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({
      typeKey: "disabledMonthlyHealthcare",
      amount: 100,
      frequency: "monthly",
      annualizedAmount: 1200
    })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: false,
      projectionYears: 2
    }
  }
});
assert.equal(disabledRun.results.needs.components.healthcareExpenses, 0);
assert.equal(findTrace(disabledRun.results.needs, "healthcareExpenses").inputs.warningCode, "healthcare-expense-assumptions-disabled");
assert.deepEqual(
  outputSnapshot(disabledRun.results).needs,
  outputSnapshot(priorBehaviorRun.results).needs,
  "Disabled healthcareExpenseAssumptions should leave Needs output unchanged from prior behavior."
);

const enabledMonthlyAnnualRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({
      typeKey: "monthlyHealthcare",
      amount: 100,
      frequency: "monthly",
      annualizedAmount: 1200
    }),
    createHealthcareFact({
      typeKey: "annualHealthcare",
      amount: 600,
      frequency: "annual",
      annualizedAmount: 600
    })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 1
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
const enabledTrace = findTrace(enabledMonthlyAnnualRun.results.needs, "healthcareExpenses");
const expectedProjection = helperProjection(context, enabledMonthlyAnnualRun);
assert.equal(hasOwn(enabledMonthlyAnnualRun.results.needs.components, "healthcareExpenses"), true);
assert.equal(enabledMonthlyAnnualRun.results.needs.components.healthcareExpenses, expectedProjection.projectedHealthcareExpenseAmount);
assert.equal(enabledMonthlyAnnualRun.results.needs.components.healthcareExpenses, 1800);
assert.equal(enabledTrace.inputs.projectedHealthcareExpenseAmount, 1800);
assert.equal(enabledTrace.inputs.currentAnnualHealthcareExpenseAmount, 1800);
assert.equal(enabledTrace.inputs.includedRecordCount, 2);
assert.ok(findWarning(enabledMonthlyAnnualRun.results.needs, "healthcare-expense-overlap-review"));
assert.ok(
  enabledTrace.inputs.warnings.some(function (warning) {
    return warning.code === "healthcare-expense-overlap-review";
  }),
  "Healthcare expense trace should include overlap review warning."
);

const includedBucketRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "ongoing", categoryKey: "ongoingHealthcare", amount: 10 }),
    createHealthcareFact({ typeKey: "dental", categoryKey: "dentalCare", amount: 10 }),
    createHealthcareFact({ typeKey: "vision", categoryKey: "visionCare", amount: 10 }),
    createHealthcareFact({ typeKey: "mental", categoryKey: "mentalHealthCare", amount: 10 }),
    createHealthcareFact({ typeKey: "ltc", categoryKey: "longTermCare", amount: 10 }),
    createHealthcareFact({ typeKey: "homeHealth", categoryKey: "homeHealthCare", amount: 10 }),
    createHealthcareFact({ typeKey: "equipment", categoryKey: "medicalEquipment", amount: 10 }),
    createHealthcareFact({ typeKey: "otherHealthcare", categoryKey: "otherHealthcare", amount: 10 })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 1
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
assert.equal(includedBucketRun.results.needs.components.healthcareExpenses, 960);
assert.deepEqual(
  cloneJson(findTrace(includedBucketRun.results.needs, "healthcareExpenses").inputs.includedBuckets).sort(),
  [
    "dentalCare",
    "homeHealthCare",
    "longTermCare",
    "medicalEquipment",
    "mentalHealthCare",
    "ongoingHealthcare",
    "otherHealthcare",
    "visionCare"
  ].sort(),
  "All eligible non-final healthcare buckets should be included."
);

const excludedBucketRun = runAll(context, {
  extraExpenses: [
    createFinalExpenseFact("medicalFinalExpenseRecord", "medicalFinalExpense", 999999),
    createFinalExpenseFact("funeralFinalExpenseRecord", "funeralBurial", 999999),
    createNonHealthcareFact({ typeKey: "livingExpense", categoryKey: "livingExpense" }),
    createNonHealthcareFact({ typeKey: "educationExpense", categoryKey: "educationExpense" }),
    createNonHealthcareFact({ typeKey: "businessExpense", categoryKey: "businessExpense" }),
    createNonHealthcareFact({ typeKey: "customNonHealthcare", categoryKey: "customExpense", isCustomExpense: true })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 1
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
const excludedTrace = findTrace(excludedBucketRun.results.needs, "healthcareExpenses");
assert.equal(excludedBucketRun.results.needs.components.healthcareExpenses, 0);
assert.ok(
  excludedTrace.inputs.excludedRecords.some(function (record) {
    return record.warningCode === "medical-final-expense-excluded";
  }),
  "medicalFinalExpense should be excluded from healthcareExpenses."
);
assert.ok(
  excludedTrace.inputs.excludedRecords.some(function (record) {
    return record.warningCode === "final-expense-bucket-excluded";
  }),
  "Final expense buckets should be excluded from healthcareExpenses."
);
assert.equal(
  excludedTrace.inputs.excludedRecords.filter(function (record) {
    return record.warningCode === "non-healthcare-bucket-excluded";
  }).length,
  4,
  "Living, education, business, and custom non-healthcare records should be excluded."
);

const finalExpenseSplitBaseline = runAll(context, {
  extraExpenses: [],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: false
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3
    }
  }
});
const finalExpenseSplitWithHealthcare = runAll(context, {
  extraExpenses: [
    createHealthcareFact({
      typeKey: "separateHealthcare",
      amount: 100,
      frequency: "monthly",
      annualizedAmount: 1200
    })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 1
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3
    }
  }
});
assert.deepEqual(
  findTrace(finalExpenseSplitWithHealthcare.results.needs, "finalExpenses").inputs,
  findTrace(finalExpenseSplitBaseline.results.needs, "finalExpenses").inputs,
  "Recurring healthcare activation should not alter final expense split trace."
);
assert.ok(finalExpenseSplitWithHealthcare.results.needs.components.finalExpenses > 30000);
assert.ok(finalExpenseSplitWithHealthcare.results.needs.components.healthcareExpenses > 0);

const oneTimeExcludedRun = runAll(context, {
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
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 10,
      includeOneTimeHealthcareExpenses: false
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 20
    }
  }
});
assert.equal(oneTimeExcludedRun.results.needs.components.healthcareExpenses, 0);

const oneTimeIncludedRun = runAll(context, {
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
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 10,
      includeOneTimeHealthcareExpenses: true
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 20
    }
  }
});
assert.equal(oneTimeIncludedRun.results.needs.components.healthcareExpenses, 5000);
assert.equal(findTrace(oneTimeIncludedRun.results.needs, "healthcareExpenses").inputs.includedOneTimeHealthcareExpenseAmount, 5000);

const healthcareInflationLowRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "rateSensitiveHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 2
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
const healthcareInflationHighRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "rateSensitiveHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 2
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 10
    }
  }
});
assert.ok(
  healthcareInflationHighRun.results.needs.components.healthcareExpenses
    > healthcareInflationLowRun.results.needs.components.healthcareExpenses,
  "Healthcare inflation rate should change healthcareExpenses when enabled."
);
assertDimeHlvUnchanged(healthcareInflationHighRun, healthcareInflationLowRun, "healthcare inflation rate");

const projectionYearsOneRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "projectionYearsHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 1
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
const projectionYearsThreeRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({ typeKey: "projectionYearsHealthcare", amount: 100, annualizedAmount: 1200 })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 3
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
assert.equal(projectionYearsOneRun.results.needs.components.healthcareExpenses, 1200);
assert.equal(projectionYearsThreeRun.results.needs.components.healthcareExpenses, 3600);

const fixedYearsRun = runAll(context, {
  extraExpenses: [
    createHealthcareFact({
      typeKey: "fixedYearsHealthcare",
      amount: 100,
      annualizedAmount: 1200,
      termType: "fixedYears",
      termYears: 3
    })
  ],
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 10
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 0
    }
  }
});
assert.equal(fixedYearsRun.results.needs.components.healthcareExpenses, 3600);
assert.equal(
  findTrace(fixedYearsRun.results.needs, "healthcareExpenses").inputs.includedRecords[0].durationSource,
  "termYears"
);

assert.equal(hasOwn(enabledMonthlyAnnualRun.methodSettings.dimeSettings, "healthcareExpenseAssumptions"), false);
assert.equal(hasOwn(enabledMonthlyAnnualRun.methodSettings.humanLifeValueSettings, "healthcareExpenseAssumptions"), false);
assertDimeHlvUnchanged(enabledMonthlyAnnualRun, disabledRun, "healthcare expense assumptions enabled state");

const savedHelper = lensAnalysis.calculateHealthcareExpenseProjection;
delete lensAnalysis.calculateHealthcareExpenseProjection;
const helperUnavailableSettings = createMethodSettings(
  adapter,
  createAnalysisSettings({
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 2
    }
  }),
  enabledMonthlyAnnualRun.lensModel
);
const helperUnavailableNeeds = runNeedsWithSettings(
  context,
  enabledMonthlyAnnualRun.lensModel,
  helperUnavailableSettings.needsAnalysisSettings
);
lensAnalysis.calculateHealthcareExpenseProjection = savedHelper;
assert.equal(helperUnavailableNeeds.components.healthcareExpenses, 0);
assert.equal(
  findTrace(helperUnavailableNeeds, "healthcareExpenses").inputs.warningCode,
  "healthcare-expense-inflation-helper-unavailable"
);
assert.ok(findWarning(helperUnavailableNeeds, "healthcare-expense-inflation-helper-unavailable"));

console.log("healthcare-expense-needs-activation-check passed");
