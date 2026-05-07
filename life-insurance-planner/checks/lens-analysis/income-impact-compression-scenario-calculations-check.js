#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-impact-compression-scenario-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSerializable(value) {
  assert.doesNotThrow(function () {
    JSON.parse(JSON.stringify(value));
  });
}

function byType(items, typeKey) {
  return (Array.isArray(items) ? items : []).find(function (item) {
    return item.typeKey === typeKey;
  });
}

function codes(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return item.code;
  });
}

function createScenario(overrides = {}) {
  const scenario = {
    status: "complete",
    preDeathSeries: {
      points: [
        {
          monthIndex: 0,
          endingAssets: 120000
        }
      ]
    },
    deathEvent: {
      date: "2030-01-01",
      resourcesAfterObligations: 10000
    },
    postDeathSeries: {
      depletion: {
        depleted: false,
        depletionDate: null,
        depletionMonthIndex: null,
        monthsCovered: 3,
        precision: "monthly"
      },
      summary: {
        totalSurvivorIncome: 3000,
        totalEssentialNeeds: 6000,
        totalDiscretionaryNeeds: 3000,
        totalSurvivorNeeds: 9000,
        totalScheduledObligations: 0,
        totalNetUse: 6000,
        endingResources: 4000,
        accumulatedUnmetNeed: 0
      },
      points: [
        {
          date: "2030-02-01",
          monthIndex: 1,
          startingResources: 10000,
          survivorIncome: 1000,
          essentialNeeds: 2000,
          discretionaryNeeds: 1000,
          survivorNeeds: 3000,
          scheduledObligations: 0,
          netUse: 2000,
          endingResources: 8000,
          availableResources: 8000,
          accumulatedUnmetNeed: 0,
          status: "available"
        },
        {
          date: "2030-03-01",
          monthIndex: 2,
          startingResources: 8000,
          survivorIncome: 1000,
          essentialNeeds: 2000,
          discretionaryNeeds: 1000,
          survivorNeeds: 3000,
          scheduledObligations: 0,
          netUse: 2000,
          endingResources: 6000,
          availableResources: 6000,
          accumulatedUnmetNeed: 0,
          status: "available"
        },
        {
          date: "2030-04-01",
          monthIndex: 3,
          startingResources: 6000,
          survivorIncome: 1000,
          essentialNeeds: 2000,
          discretionaryNeeds: 1000,
          survivorNeeds: 3000,
          scheduledObligations: 0,
          netUse: 2000,
          endingResources: 4000,
          availableResources: 4000,
          accumulatedUnmetNeed: 0,
          status: "available"
        }
      ],
      layer3: {
        status: "complete",
        trace: {
          helper: "household-survivor-runway-v1"
        }
      }
    },
    timelineFacts: {
      monthsCovered: 3,
      accumulatedUnmetNeed: 0
    },
    warnings: [],
    dataGaps: []
  };

  return {
    ...scenario,
    ...overrides,
    deathEvent: {
      ...scenario.deathEvent,
      ...(overrides.deathEvent || {})
    },
    postDeathSeries: {
      ...scenario.postDeathSeries,
      ...(overrides.postDeathSeries || {})
    },
    timelineFacts: {
      ...scenario.timelineFacts,
      ...(overrides.timelineFacts || {})
    },
    warnings: overrides.warnings || scenario.warnings,
    dataGaps: overrides.dataGaps || scenario.dataGaps
  };
}

function createCompressionReport(overrides = {}) {
  const report = {
    status: "complete",
    opportunities: [
      {
        expenseFactId: "groceries-fact",
        typeKey: "groceries",
        label: "Groceries",
        currentMonthlyAmount: 1000,
        possibleMonthlyReduction: 100,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[1]"
      },
      {
        expenseFactId: "dining-fact",
        typeKey: "diningOutRestaurants",
        label: "Dining Out",
        currentMonthlyAmount: 650,
        possibleMonthlyReduction: 150,
        defaultNeedType: "discretionary",
        sourcePath: "expenseFacts.expenses[0]"
      },
      {
        expenseFactId: "auto-insurance-fact",
        typeKey: "autoInsurance",
        label: "Auto Insurance",
        currentMonthlyAmount: 200,
        possibleMonthlyReduction: 50,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[2]"
      },
      {
        expenseFactId: "housing-fact",
        typeKey: "housingPaymentRentMortgage",
        label: "Housing Payment",
        currentMonthlyAmount: 2500,
        possibleMonthlyReduction: 500,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[3]"
      }
    ],
    pauseCandidates: [
      {
        expenseFactId: "retirement-fact",
        typeKey: "retirementContributions",
        label: "Retirement Contributions",
        currentMonthlyAmount: 400,
        possibleMonthlyPauseAmount: 400,
        defaultNeedType: "contribution",
        sourcePath: "expenseFacts.expenses[4]"
      }
    ],
    protectedItems: [
      {
        typeKey: "healthInsurancePremiums",
        label: "Health Insurance",
        currentMonthlyAmount: 800,
        reasonCode: "protected-expense-not-auto-reducible",
        sourcePath: "expenseFacts.expenses[5]"
      }
    ],
    excludedItems: [
      {
        typeKey: "autoLoanPayment",
        label: "Auto Loan Payment",
        currentMonthlyAmount: 425,
        isGeneratedExpense: true,
        isDebtPaymentExpense: true,
        sourceKey: "debtRecords",
        sourcePath: "expenseFacts.expenses[6]"
      }
    ],
    advisorReviewItems: [
      {
        typeKey: "tithingReligiousGiving",
        label: "Tithing",
        currentMonthlyAmount: 250,
        reasonCode: "advisor-confirmation-required",
        sourcePath: "expenseFacts.expenses[7]"
      }
    ],
    dataGaps: [],
    warnings: [],
    trace: {
      calculationMethod: "household-expense-compression-opportunities-v1",
      mode: "reportingOnly"
    }
  };

  return {
    ...report,
    ...overrides,
    opportunities: overrides.opportunities || report.opportunities,
    pauseCandidates: overrides.pauseCandidates || report.pauseCandidates,
    protectedItems: overrides.protectedItems || report.protectedItems,
    excludedItems: overrides.excludedItems || report.excludedItems,
    advisorReviewItems: overrides.advisorReviewItems || report.advisorReviewItems,
    dataGaps: overrides.dataGaps || report.dataGaps,
    warnings: overrides.warnings || report.warnings
  };
}

function createPolicyRules(overrides = []) {
  const rules = [
    {
      policyId: "policy-dining",
      expenseTypeKey: "diningOutRestaurants",
      decision: "YES",
      compressionOrderGroup: "earlyDiscretionary",
      compressionOrderRank: 1
    },
    {
      policyId: "policy-groceries",
      expenseTypeKey: "groceries",
      decision: "YES",
      compressionOrderGroup: "groceriesAndProtectedFlexibleEssentials",
      compressionOrderRank: 7
    },
    {
      policyId: "policy-retirement",
      expenseTypeKey: "retirementContributions",
      decision: "PAUSE",
      compressionOrderGroup: "pauseContributions",
      compressionOrderRank: 4
    },
    {
      policyId: "policy-auto-insurance",
      expenseTypeKey: "autoInsurance",
      decision: "NO",
      compressionOrderGroup: "protectionInsurance",
      compressionOrderRank: 16
    },
    {
      policyId: "policy-housing",
      expenseTypeKey: "housingPaymentRentMortgage",
      decision: "INTERVENTION",
      compressionOrderGroup: "majorInterventions",
      compressionOrderRank: 21
    },
    {
      policyId: "policy-health",
      expenseTypeKey: "healthInsurancePremiums",
      decision: "NO",
      compressionOrderGroup: "healthcareProtected",
      compressionOrderRank: 12
    },
    {
      policyId: "policy-auto-loan",
      expenseTypeKey: "autoLoanPayment",
      decision: "NO",
      compressionOrderGroup: "debtObligations",
      compressionOrderRank: 18
    },
    {
      policyId: "policy-tithing",
      expenseTypeKey: "tithingReligiousGiving",
      decision: "NO",
      compressionOrderGroup: "valuesSensitiveGiving",
      compressionOrderRank: 15
    }
  ];

  return rules.concat(overrides);
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const calculateIncomeImpactCompressionScenario = lensAnalysis.calculateIncomeImpactCompressionScenario;

assert.equal(typeof calculateIncomeImpactCompressionScenario, "function", "helper export should exist");
assert.equal(
  typeof lensAnalysis.incomeImpactCompressionScenarioCalculations.calculateIncomeImpactCompressionScenario,
  "function",
  "namespace export should exist"
);

[
  /require\s*\(/,
  /\bimport\b/,
  /income-impact-triage-intervention-calculations/,
  /income-loss-impact-display/,
  /income-impact-timeline-graph-model/,
  /income-impact-scenario-composer-calculations/,
  /normalize-lens-model/,
  /household-survivor-runway-calculations/,
  /calculateHouseholdSurvivorRunway/,
  /localStorage/,
  /sessionStorage/,
  /document\./,
  /querySelector/,
  /addEventListener/
].forEach(function (pattern) {
  assert.equal(pattern.test(helperSource), false, `source should not include ${pattern}`);
});

const scenario = createScenario();
const compressionReport = createCompressionReport();
const policyRules = createPolicyRules();
const scenarioBefore = clone(scenario);
const reportBefore = clone(compressionReport);
const policyBefore = clone(policyRules);

const first = calculateIncomeImpactCompressionScenario({
  scenario,
  compressionReport,
  compressionPolicyRules: policyRules,
  options: {
    scenarioId: "compression-alt-fixture",
    applyPauseCandidates: true,
    requireCompleteItemization: true
  }
});
const second = calculateIncomeImpactCompressionScenario({
  scenario: clone(scenario),
  compressionReport: clone(compressionReport),
  compressionPolicyRules: clone(policyRules),
  options: {
    scenarioId: "compression-alt-fixture",
    applyPauseCandidates: true,
    requireCompleteItemization: true
  }
});

assert.deepEqual(scenario, scenarioBefore, "base scenario should not be mutated");
assert.deepEqual(compressionReport, reportBefore, "compressionReport should not be mutated");
assert.deepEqual(policyRules, policyBefore, "policy rules should not be mutated");
assert.deepEqual(first, second, "output should be deterministic");
assertSerializable(first);

assert.equal(first.status, "complete");
assert.equal(first.baseScenarioUnchanged, true);
assert.equal(first.trace.calculationMethod, "income-impact-compression-scenario-v1");
assert.equal(first.trace.mode, "alternateScenarioOnly");
assert.equal(first.trace.baseScenarioMutated, false);
assert.equal(first.trace.postDeathSeriesReplaced, false);
assert.equal(first.trace.graphPathChanged, false);
assert.equal(first.trace.layer5Wired, false);
assert.equal(first.trace.displayWired, false);
assert.equal(first.trace.reductionsAppliedCount, 2);
assert.equal(first.trace.pausesAppliedCount, 1);
assert.equal(first.trace.monthlyReliefTotal, 650);

const alternate = first.compressionScenario;
assert.ok(alternate, "complete fixture should create an alternate scenario");
assert.equal(alternate.scenarioId, "compression-alt-fixture");
assert.equal(alternate.reductionsApplied.length, 2);
assert.equal(alternate.reductionsApplied[0].typeKey, "diningOutRestaurants", "YES reductions should apply in policy order");
assert.equal(alternate.reductionsApplied[1].typeKey, "groceries");
assert.equal(byType(alternate.reductionsApplied, "groceries").monthlyAmount, 100, "groceries should use supplied one-pass reduction only");
assert.equal(alternate.pausesApplied.length, 1);
assert.equal(alternate.pausesApplied[0].typeKey, "retirementContributions");
assert.equal(alternate.pausesApplied[0].trace.assetLiquidation, false, "pauses should not liquidate assets");
assert.equal(byType(alternate.reductionsApplied, "autoInsurance"), undefined, "NO item should not apply");
assert.equal(byType(alternate.reductionsApplied, "housingPaymentRentMortgage"), undefined, "INTERVENTION item should not apply");
assert.equal(byType(alternate.reductionsApplied, "healthInsurancePremiums"), undefined, "protected item should not apply");
assert.equal(byType(alternate.reductionsApplied, "tithingReligiousGiving"), undefined, "advisor-review item should not apply");
assert.equal(byType(alternate.reductionsApplied, "autoLoanPayment"), undefined, "generated debt item should not apply");
assert.notDeepEqual(alternate.postDeathSeries.points, scenario.postDeathSeries.points, "alternate postDeathSeries should differ from base");
assert.deepEqual(scenario.postDeathSeries.points, scenarioBefore.postDeathSeries.points, "base postDeathSeries points remain unchanged");
assert.equal(alternate.postDeathSeries.points[0].survivorNeeds, 2350);
assert.equal(alternate.postDeathSeries.points[0].essentialNeeds, 1900);
assert.equal(alternate.postDeathSeries.points[0].discretionaryNeeds, 450);
assert.equal(alternate.postDeathSeries.points[0].endingResources, 8650);
assert.equal(alternate.postDeathSeries.points[1].endingResources, 7300);
assert.equal(alternate.adjustedMonthlyNeed, 2350);
assert.equal(alternate.adjustedAnnualNeed, 28200);
assert.equal(alternate.trace.emergencyFundAssetsSpent, false);
assert.equal(scenario.timelineFacts.monthsCovered, scenarioBefore.timelineFacts.monthsCovered, "timelineFacts should not be replaced");
assert.deepEqual(scenario.preDeathSeries, scenarioBefore.preDeathSeries, "preDeathSeries should not be modified");
assert.deepEqual(scenario.deathEvent, scenarioBefore.deathEvent, "deathEvent should not be modified");

const noPause = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: createPolicyRules(),
  options: {
    applyPauseCandidates: false,
    requireCompleteItemization: true
  }
});
assert.equal(noPause.status, "complete");
assert.equal(noPause.compressionScenario.pausesApplied.length, 0, "PAUSE candidates should apply only when enabled");
assert.equal(noPause.trace.monthlyReliefTotal, 250);

const scalarBlocked = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    dataGaps: [
      {
        code: "scalar-household-expenses-not-itemized-for-compression",
        message: "Scalar household ongoingSupport expenses are present but are not fully itemized as compression-ready expense facts."
      }
    ]
  }),
  compressionPolicyRules: createPolicyRules(),
  options: {
    requireCompleteItemization: true
  }
});
assert.equal(scalarBlocked.status, "blocked");
assert.equal(scalarBlocked.compressionScenario, null);
assert.ok(codes(scalarBlocked.dataGaps).includes("active-compression-blocked-by-scalar-household-itemization-gap"));

const scalarAllowed = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    dataGaps: [
      {
        code: "scalar-household-expenses-not-itemized-for-compression",
        message: "Scalar household ongoingSupport expenses are present but are not fully itemized as compression-ready expense facts."
      }
    ]
  }),
  compressionPolicyRules: createPolicyRules(),
  options: {
    requireCompleteItemization: false
  }
});
assert.equal(scalarAllowed.status, "complete", "scalar itemization gap should only block when requireCompleteItemization is true");

const missingPoints = calculateIncomeImpactCompressionScenario({
  scenario: createScenario({
    postDeathSeries: {
      points: []
    }
  }),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: createPolicyRules()
});
assert.equal(missingPoints.status, "blocked");
assert.ok(codes(missingPoints.dataGaps).includes("missing-post-death-points-for-compression-scenario"));

const missingReduction = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    opportunities: [
      {
        typeKey: "diningOutRestaurants",
        label: "Dining Out",
        sourcePath: "expenseFacts.expenses[0]"
      }
    ],
    pauseCandidates: []
  }),
  compressionPolicyRules: createPolicyRules()
});
assert.equal(missingReduction.status, "blocked");
assert.ok(codes(missingReduction.dataGaps).includes("missing-eligible-monthly-reduction-amount"));

const generatedDebtEligible = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    opportunities: [
      {
        typeKey: "autoLoanPayment",
        label: "Auto Loan Payment",
        possibleMonthlyReduction: 425,
        isGeneratedExpense: true,
        isDebtPaymentExpense: true,
        sourceKey: "debtRecords",
        sourcePath: "expenseFacts.expenses[0]"
      }
    ],
    pauseCandidates: []
  }),
  compressionPolicyRules: createPolicyRules()
});
assert.equal(generatedDebtEligible.status, "blocked");
assert.ok(codes(generatedDebtEligible.dataGaps).includes("generated-debt-payment-in-eligible-compression-opportunities"));

const missingPolicyRules = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: []
});
assert.equal(missingPolicyRules.status, "blocked");
assert.ok(codes(missingPolicyRules.dataGaps).includes("missing-compression-policy-rules"));

const invalidPolicyRules = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: createPolicyRules([{ expenseTypeKey: "customExpenseRecord", decision: "MAYBE" }])
});
assert.equal(invalidPolicyRules.status, "blocked");
assert.ok(codes(invalidPolicyRules.dataGaps).includes("invalid-compression-policy-rules-block-alternate-scenario"));

const unclearBucket = calculateIncomeImpactCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    opportunities: [
      {
        typeKey: "customCompressibleExpense",
        label: "Custom Compressible",
        possibleMonthlyReduction: 100,
        sourcePath: "expenseFacts.expenses[0]"
      }
    ],
    pauseCandidates: []
  }),
  compressionPolicyRules: createPolicyRules([
    {
      policyId: "policy-custom-compressible",
      expenseTypeKey: "customCompressibleExpense",
      decision: "YES",
      compressionOrderGroup: "dataQuality",
      compressionOrderRank: 0
    }
  ]),
  options: {
    requireCompleteItemization: true
  }
});
assert.equal(unclearBucket.status, "blocked");
assert.ok(codes(unclearBucket.dataGaps).includes("unclear-compression-item-base-scenario-bucket"));

console.log("income-impact-compression-scenario-calculations-check passed");
