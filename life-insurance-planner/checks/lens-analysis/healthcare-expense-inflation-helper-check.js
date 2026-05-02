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
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createExpenseFacts(facts) {
  return {
    expenses: facts,
    totalsByBucket: {},
    metadata: {
      source: "healthcare-expense-inflation-helper-check"
    }
  };
}

function createFact(overrides = {}) {
  const categoryKey = overrides.categoryKey || "ongoingHealthcare";
  const frequency = overrides.frequency || "monthly";
  const termType = overrides.termType || "ongoing";
  return {
    expenseFactId: overrides.expenseFactId || `fact_${overrides.typeKey || categoryKey}_${frequency}_${termType}`,
    typeKey: overrides.typeKey || "medicalOutOfPocket",
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
    isFinalExpenseComponent: overrides.isFinalExpenseComponent === true,
    isHealthcareSensitive: overrides.isHealthcareSensitive !== false,
    isCustomExpense: overrides.isCustomExpense === true,
    sourcePath: overrides.sourcePath || "expenseFacts.expenses[0]"
  };
}

function createInput(overrides = {}) {
  return {
    expenseFacts: overrides.expenseFacts || createExpenseFacts([
      createFact()
    ]),
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 10,
      includeOneTimeHealthcareExpenses: false,
      oneTimeProjectionMode: "currentDollarOnly",
      ...(overrides.healthcareExpenseAssumptions || {})
    },
    inflationAssumptions: {
      healthcareInflationRatePercent: 5,
      ...(overrides.inflationAssumptions || {})
    },
    profileFacts: {
      clientDateOfBirth: "1980-06-15",
      clientDateOfBirthStatus: "valid",
      ...(overrides.profileFacts || {})
    },
    valuationDate: overrides.valuationDate === undefined ? "2026-01-01" : overrides.valuationDate,
    valuationDateSource: overrides.valuationDateSource || "analysisSettings.valuationDate",
    valuationDateDefaulted: overrides.valuationDateDefaulted === true
  };
}

function findWarning(result, code) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).find(function (warning) {
    return warning?.code === code;
  });
}

function findIncluded(result, typeKey) {
  return (Array.isArray(result?.includedRecords) ? result.includedRecords : []).find(function (record) {
    return record?.typeKey === typeKey;
  });
}

function run(helper, input) {
  return cloneJson(helper(input));
}

const context = createContext();
const helper = context.LensApp.lensAnalysis.calculateHealthcareExpenseProjection;
assert.equal(typeof helper, "function", "Healthcare expense projection helper export should exist.");

const disabledResult = run(helper, createInput({
  healthcareExpenseAssumptions: {
    enabled: false
  }
}));
assert.equal(disabledResult.enabled, false);
assert.equal(disabledResult.applied, false);
assert.equal(disabledResult.projectedHealthcareExpenseAmount, 0);
assert.equal(disabledResult.warningCode, "healthcare-expense-assumptions-disabled");
assert.match(disabledResult.reason, /disabled/);

const monthlyOngoingResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({
      typeKey: "monthlyOngoing",
      amount: 100,
      frequency: "monthly",
      termType: "ongoing"
    })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 2
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 10
  }
}));
assert.equal(monthlyOngoingResult.applied, true);
assert.equal(monthlyOngoingResult.currentAnnualHealthcareExpenseAmount, 1200);
assert.equal(monthlyOngoingResult.projectedHealthcareExpenseAmount, 2772);
assert.equal(findIncluded(monthlyOngoingResult, "monthlyOngoing").durationSource, "healthcareExpenseAssumptions.projectionYears");

const annualizationResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "weeklyHealthcare", amount: 10, frequency: "weekly" }),
    createFact({ typeKey: "monthlyHealthcare", amount: 10, frequency: "monthly" }),
    createFact({ typeKey: "quarterlyHealthcare", amount: 10, frequency: "quarterly" }),
    createFact({ typeKey: "semiAnnualHealthcare", amount: 10, frequency: "semiAnnual" }),
    createFact({ typeKey: "annualHealthcare", amount: 10, frequency: "annual" })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 1
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(annualizationResult.currentAnnualHealthcareExpenseAmount, 710);
assert.equal(annualizationResult.projectedHealthcareExpenseAmount, 710);

const fixedYearsResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "fixedYearsHealthcare", amount: 100, termType: "fixedYears", termYears: 3 })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 10
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(fixedYearsResult, "fixedYearsHealthcare").durationYears, 3);
assert.equal(findIncluded(fixedYearsResult, "fixedYearsHealthcare").durationSource, "termYears");
assert.equal(fixedYearsResult.projectedHealthcareExpenseAmount, 3600);

const fixedYearsFallbackResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "fixedYearsFallback", amount: 100, termType: "fixedYears" })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 4
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(fixedYearsFallbackResult, "fixedYearsFallback").durationYears, 4);
assert.equal(findIncluded(fixedYearsFallbackResult, "fixedYearsFallback").durationSource, "healthcareExpenseAssumptions.projectionYears-fallback");
assert.ok(findWarning(fixedYearsFallbackResult, "fixed-years-term-years-fallback"));

const ongoingResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "ongoingProjectionYears", amount: 100, termType: "ongoing" })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 7
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(ongoingResult, "ongoingProjectionYears").durationYears, 7);
assert.equal(findIncluded(ongoingResult, "ongoingProjectionYears").durationSource, "healthcareExpenseAssumptions.projectionYears");

const untilAgeResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "untilAgeHealthcare", amount: 100, termType: "untilAge", endAge: 50 })
  ]),
  valuationDate: "2026-01-01",
  profileFacts: {
    clientDateOfBirth: "1980-06-15",
    clientDateOfBirthStatus: "valid"
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(untilAgeResult, "untilAgeHealthcare").durationYears, 5);
assert.equal(findIncluded(untilAgeResult, "untilAgeHealthcare").durationSource, "endAge-clientDateOfBirth-valuationDate");

const untilAgeFallbackResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "untilAgeFallback", amount: 100, termType: "untilAge", endAge: 50 })
  ]),
  profileFacts: {
    clientDateOfBirth: "not-a-date",
    clientDateOfBirthStatus: "invalid"
  },
  healthcareExpenseAssumptions: {
    projectionYears: 8
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(untilAgeFallbackResult, "untilAgeFallback").durationYears, 8);
assert.ok(findWarning(untilAgeFallbackResult, "until-age-duration-fallback"));

const untilDateResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "untilDateHealthcare", amount: 100, termType: "untilDate", endDate: "2029-01-01" })
  ]),
  valuationDate: "2026-01-01",
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(untilDateResult, "untilDateHealthcare").durationYears, 3);
assert.equal(findIncluded(untilDateResult, "untilDateHealthcare").durationSource, "endDate-valuationDate");

const untilDateFallbackResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "untilDateFallback", amount: 100, termType: "untilDate", endDate: "not-a-date" })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 9
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(findIncluded(untilDateFallbackResult, "untilDateFallback").durationYears, 9);
assert.ok(findWarning(untilDateFallbackResult, "until-date-duration-fallback"));

const oneTimeExcludedResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({
      typeKey: "oneTimeExcluded",
      amount: 5000,
      frequency: "oneTime",
      termType: "oneTime",
      oneTimeAmount: 5000,
      categoryKey: "medicalEquipment"
    })
  ]),
  healthcareExpenseAssumptions: {
    includeOneTimeHealthcareExpenses: false
  }
}));
assert.equal(oneTimeExcludedResult.projectedHealthcareExpenseAmount, 0);
assert.equal(oneTimeExcludedResult.excludedRecords[0].warningCode, "one-time-healthcare-expense-excluded");

const oneTimeIncludedResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({
      typeKey: "oneTimeIncluded",
      amount: 5000,
      frequency: "oneTime",
      termType: "oneTime",
      oneTimeAmount: 5000,
      categoryKey: "medicalEquipment"
    })
  ]),
  healthcareExpenseAssumptions: {
    includeOneTimeHealthcareExpenses: true
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 50
  }
}));
assert.equal(oneTimeIncludedResult.projectedHealthcareExpenseAmount, 5000);
assert.equal(oneTimeIncludedResult.includedOneTimeHealthcareExpenseAmount, 5000);
assert.equal(findIncluded(oneTimeIncludedResult, "oneTimeIncluded").projectedAmount, 5000);
assert.equal(findIncluded(oneTimeIncludedResult, "oneTimeIncluded").durationSource, "oneTime-current-dollar");

const excludedBucketResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "medicalFinal", categoryKey: "medicalFinalExpense", isFinalExpenseComponent: true }),
    createFact({ typeKey: "funeralFinal", categoryKey: "funeralBurial", isFinalExpenseComponent: true }),
    createFact({ typeKey: "estateFinal", categoryKey: "estateSettlement", isFinalExpenseComponent: true }),
    createFact({ typeKey: "otherFinal", categoryKey: "otherFinalExpense", isFinalExpenseComponent: true }),
    createFact({ typeKey: "livingExpense", categoryKey: "livingExpense" }),
    createFact({ typeKey: "educationExpense", categoryKey: "educationExpense" }),
    createFact({ typeKey: "businessExpense", categoryKey: "businessExpense" }),
    createFact({ typeKey: "customNonHealthcare", categoryKey: "customExpense", isCustomExpense: true })
  ])
}));
assert.equal(excludedBucketResult.includedRecordCount, 0);
assert.equal(excludedBucketResult.excludedRecordCount, 8);
assert.ok(excludedBucketResult.excludedRecords.some((record) => record.warningCode === "medical-final-expense-excluded"));
assert.ok(excludedBucketResult.excludedRecords.some((record) => record.warningCode === "final-expense-bucket-excluded"));
assert.ok(excludedBucketResult.excludedRecords.some((record) => record.warningCode === "non-healthcare-bucket-excluded"));

const healthcareBuckets = [
  "ongoingHealthcare",
  "dentalCare",
  "visionCare",
  "mentalHealthCare",
  "longTermCare",
  "homeHealthCare",
  "medicalEquipment",
  "otherHealthcare"
];
const includedBucketResult = run(helper, createInput({
  expenseFacts: createExpenseFacts(healthcareBuckets.map(function (bucket) {
    return createFact({
      typeKey: bucket,
      categoryKey: bucket,
      frequency: "annual",
      amount: 10,
      isCustomExpense: bucket === "otherHealthcare"
    });
  })),
  healthcareExpenseAssumptions: {
    projectionYears: 1
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: 0
  }
}));
assert.equal(includedBucketResult.includedRecordCount, healthcareBuckets.length);
assert.deepEqual(includedBucketResult.includedBuckets.sort(), healthcareBuckets.slice().sort());
assert.equal(includedBucketResult.projectedHealthcareExpenseAmount, 80);

const invalidRateResult = run(helper, createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "invalidRateCurrentDollar", amount: 100, frequency: "monthly" })
  ]),
  healthcareExpenseAssumptions: {
    projectionYears: 2
  },
  inflationAssumptions: {
    healthcareInflationRatePercent: "invalid"
  }
}));
assert.equal(invalidRateResult.healthcareInflationApplied, false);
assert.equal(invalidRateResult.projectedHealthcareExpenseAmount, 2400);
assert.ok(findWarning(invalidRateResult, "invalid-healthcare-inflation-rate-current-dollar"));

const projectionClampHighResult = run(helper, createInput({
  healthcareExpenseAssumptions: {
    projectionYears: 99
  }
}));
assert.equal(projectionClampHighResult.projectionYears, 60);
assert.equal(projectionClampHighResult.projectionYearsSource, "clamped");
assert.ok(findWarning(projectionClampHighResult, "clamped-healthcare-expense-projection-years"));

const projectionClampLowResult = run(helper, createInput({
  healthcareExpenseAssumptions: {
    projectionYears: 0
  }
}));
assert.equal(projectionClampLowResult.projectionYears, 1);
assert.equal(projectionClampLowResult.projectionYearsSource, "clamped");

const projectionInvalidDefaultResult = run(helper, createInput({
  healthcareExpenseAssumptions: {
    projectionYears: "not-a-number"
  }
}));
assert.equal(projectionInvalidDefaultResult.projectionYears, 10);
assert.equal(projectionInvalidDefaultResult.projectionYearsSource, "default");
assert.ok(findWarning(projectionInvalidDefaultResult, "invalid-healthcare-expense-projection-years"));

const projectionMissingDefaultResult = run(helper, createInput({
  healthcareExpenseAssumptions: {
    enabled: true,
    projectionYears: undefined
  }
}));
assert.equal(projectionMissingDefaultResult.projectionYears, 10);
assert.equal(projectionMissingDefaultResult.projectionYearsSource, "default");

const invalidOneTimeProjectionModeResult = run(helper, createInput({
  healthcareExpenseAssumptions: {
    oneTimeProjectionMode: "futureInflated"
  }
}));
assert.equal(invalidOneTimeProjectionModeResult.oneTimeProjectionMode, "currentDollarOnly");
assert.ok(findWarning(invalidOneTimeProjectionModeResult, "invalid-healthcare-one-time-projection-mode"));

const mutationInput = createInput({
  expenseFacts: createExpenseFacts([
    createFact({ typeKey: "mutationRecord", amount: 100 })
  ])
});
const beforeMutation = JSON.stringify(mutationInput);
run(helper, mutationInput);
assert.equal(JSON.stringify(mutationInput), beforeMutation, "Healthcare helper should not mutate input objects.");

const helperSource = readRepoFile("app/features/lens-analysis/healthcare-expense-inflation-calculations.js");
[
  /\bdocument\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /analysisMethods/,
  /analysis-methods/,
  /runDimeAnalysis/,
  /runNeedsAnalysis/,
  /runHumanLifeValueAnalysis/,
  /step-three/,
  /stepThree/
].forEach(function (pattern) {
  assert.equal(
    pattern.test(helperSource),
    false,
    `Healthcare helper should not reference ${pattern}.`
  );
});

console.log("healthcare-expense-inflation-helper-check passed");
