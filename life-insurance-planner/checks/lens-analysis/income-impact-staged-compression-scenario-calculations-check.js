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

const policySource = readRepoFile("app/features/lens-analysis/household-expense-compression-policy.js");
const stagePolicySource = readRepoFile("app/features/lens-analysis/household-expense-compression-stage-policy.js");
const helperSource = readRepoFile("app/features/lens-analysis/income-impact-staged-compression-scenario-calculations.js");

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(policySource, context, { filename: "household-expense-compression-policy.js" });
  vm.runInContext(stagePolicySource, context, { filename: "household-expense-compression-stage-policy.js" });
  vm.runInContext(helperSource, context, { filename: "income-impact-staged-compression-scenario-calculations.js" });
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

function codes(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return item.code;
  });
}

function byType(items, typeKey) {
  return (Array.isArray(items) ? items : []).find(function (item) {
    return item.typeKey === typeKey;
  });
}

function stageById(items, stageId) {
  return (Array.isArray(items) ? items : []).find(function (item) {
    return item.stageId === stageId;
  });
}

function pointByMonth(points, monthIndex) {
  return (Array.isArray(points) ? points : []).find(function (point) {
    return point.monthIndex === monthIndex;
  });
}

function createScenario(overrides = {}) {
  const points = [];
  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
    points.push({
      date: `2030-${String(monthIndex).padStart(2, "0")}-01`,
      monthIndex,
      startingResources: 20000 - ((monthIndex - 1) * 3000),
      survivorIncome: 1000,
      essentialNeeds: 2500,
      discretionaryNeeds: 1500,
      survivorNeeds: 4000,
      scheduledObligations: 0,
      netUse: 3000,
      endingResources: 20000 - (monthIndex * 3000),
      availableResources: Math.max(0, 20000 - (monthIndex * 3000)),
      accumulatedUnmetNeed: Math.max(0, (monthIndex * 3000) - 20000),
      status: 20000 - (monthIndex * 3000) <= 0 ? "depleted" : "available"
    });
  }

  const scenario = {
    status: "complete",
    deathEvent: {
      date: "2029-12-01",
      resourcesAfterObligations: 20000
    },
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionDate: "2030-07-01",
        depletionMonthIndex: 7,
        monthsCovered: 7,
        precision: "monthly"
      },
      summary: {
        totalSurvivorIncome: 12000,
        totalEssentialNeeds: 30000,
        totalDiscretionaryNeeds: 18000,
        totalSurvivorNeeds: 48000,
        totalScheduledObligations: 0,
        totalNetUse: 36000,
        endingResources: -16000,
        accumulatedUnmetNeed: 16000
      },
      points
    },
    timelineFacts: {
      monthsCovered: 7,
      accumulatedUnmetNeed: 16000
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
        expenseFactId: "dining-fact",
        typeKey: "diningOutRestaurants",
        label: "Dining Out",
        currentMonthlyAmount: 650,
        possibleMonthlyReduction: 200,
        defaultNeedType: "discretionary",
        sourcePath: "expenseFacts.expenses[0]"
      },
      {
        expenseFactId: "house-cleaning-fact",
        typeKey: "houseCleaning",
        label: "House Cleaning",
        currentMonthlyAmount: 240,
        possibleMonthlyReduction: 100,
        defaultNeedType: "discretionary",
        sourcePath: "expenseFacts.expenses[1]"
      },
      {
        expenseFactId: "school-lunches-fact",
        typeKey: "schoolLunches",
        label: "School Lunches",
        currentMonthlyAmount: 180,
        possibleMonthlyReduction: 80,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[2]"
      },
      {
        expenseFactId: "groceries-fact",
        typeKey: "groceries",
        label: "Groceries",
        currentMonthlyAmount: 1200,
        possibleMonthlyReduction: 150,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[3]"
      },
      {
        expenseFactId: "fuel-fact",
        typeKey: "fuel",
        label: "Fuel",
        currentMonthlyAmount: 420,
        possibleMonthlyReduction: 120,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[4]"
      },
      {
        expenseFactId: "auto-insurance-fact",
        typeKey: "autoInsurance",
        label: "Auto Insurance",
        currentMonthlyAmount: 220,
        possibleMonthlyReduction: 60,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[5]"
      }
    ],
    pauseCandidates: [
      {
        expenseFactId: "retirement-fact",
        typeKey: "retirementContributions",
        label: "Retirement Contributions",
        currentMonthlyAmount: 300,
        possibleMonthlyPauseAmount: 300,
        defaultNeedType: "contribution",
        sourcePath: "expenseFacts.expenses[6]"
      }
    ],
    advisorReviewItems: [
      {
        expenseFactId: "housing-window",
        typeKey: "housingDecisionWindow",
        label: "Housing Decision Window",
        status: "advisor-review",
        sourcePath: "compressionPolicy.housingDecisionWindow"
      }
    ],
    protectedItems: [
      {
        typeKey: "healthInsurancePremiums",
        label: "Health Insurance",
        currentMonthlyAmount: 800,
        reasonCode: "protected-expense-not-auto-reducible",
        sourcePath: "expenseFacts.expenses[7]"
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
        sourcePath: "expenseFacts.expenses[8]"
      }
    ],
    dataGaps: [],
    warnings: [],
    trace: {
      calculationMethod: "household-expense-compression-opportunities-v1"
    }
  };

  return {
    ...report,
    ...overrides,
    opportunities: overrides.opportunities || report.opportunities,
    pauseCandidates: overrides.pauseCandidates || report.pauseCandidates,
    advisorReviewItems: overrides.advisorReviewItems || report.advisorReviewItems,
    protectedItems: overrides.protectedItems || report.protectedItems,
    excludedItems: overrides.excludedItems || report.excludedItems,
    dataGaps: overrides.dataGaps || report.dataGaps,
    warnings: overrides.warnings || report.warnings
  };
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const calculateIncomeImpactStagedCompressionScenario = lensAnalysis.calculateIncomeImpactStagedCompressionScenario;
const policyRules = lensAnalysis.householdExpenseCompressionPolicy.getHouseholdExpenseCompressionPolicyRules();
const stagePolicyRules = lensAnalysis.householdExpenseCompressionStagePolicy.getHouseholdExpenseCompressionStagePolicyRules();

assert.equal(typeof calculateIncomeImpactStagedCompressionScenario, "function", "staged helper export should exist");
assert.equal(
  typeof lensAnalysis.incomeImpactStagedCompressionScenarioCalculations.calculateIncomeImpactStagedCompressionScenario,
  "function",
  "namespace export should exist"
);

[
  /require\s*\(/,
  /\bimport\b/,
  /calculateIncomeImpactTriageInterventions/,
  /calculateIncomeImpactCompressionScenario/,
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
  assert.equal(pattern.test(helperSource), false, `staged helper source should not include ${pattern}`);
});
assert.equal(/\bAI\b|\bOpenAI\b/.test(helperSource), false, "staged helper should not use AI as calculation authority");

const scenario = createScenario();
const compressionReport = createCompressionReport();
const scenarioBefore = clone(scenario);
const reportBefore = clone(compressionReport);
const policyBefore = clone(policyRules);
const stagePolicyBefore = clone(stagePolicyRules);

const first = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario,
  compressionReport,
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules,
  options: {
    scenarioId: "staged-compression-fixture",
    requireCompleteItemization: true,
    applyPauseCandidates: true,
    includeMarkerOnlyEvents: true
  }
}));
const second = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: clone(scenario),
  compressionReport: clone(compressionReport),
  compressionPolicyRules: clone(policyRules),
  compressionStagePolicyRules: clone(stagePolicyRules),
  options: {
    scenarioId: "staged-compression-fixture",
    requireCompleteItemization: true,
    applyPauseCandidates: true,
    includeMarkerOnlyEvents: true
  }
}));

assert.deepEqual(scenario, scenarioBefore, "base scenario should not be mutated");
assert.deepEqual(compressionReport, reportBefore, "compressionReport should not be mutated");
assert.deepEqual(clone(policyRules), policyBefore, "compression policy rules should not be mutated");
assert.deepEqual(clone(stagePolicyRules), stagePolicyBefore, "stage policy rules should not be mutated");
assert.deepEqual(first, second, "staged output should be deterministic");
assertSerializable(first);

assert.equal(first.status, "complete");
assert.equal(first.baseScenarioUnchanged, true);
assert.equal(first.trace.calculationMethod, "income-impact-staged-compression-scenario-v1");
assert.equal(first.trace.mode, "stagedAlternateScenarioOnly");
assert.equal(first.trace.noAiDecisionMaking, true);
assert.equal(first.trace.stagePolicySource, "explicit-input");
assert.equal(first.trace.baseScenarioMutated, false);
assert.equal(first.trace.graphPathChanged, false);

const staged = first.stagedCompressionScenario;
assert.ok(staged, "complete fixture should create staged compression scenario");
assert.equal(staged.scenarioId, "staged-compression-fixture");
assert.equal(staged.stagePolicyVersion, 1);
assert.equal(staged.reductionsApplied.length, 5);
assert.equal(staged.pausesApplied.length, 1);
assert.equal(staged.markerOnlyEvents.length, 1);
assert.equal(staged.trace.reductionsAppliedCount, 5);
assert.equal(staged.trace.pausesAppliedCount, 1);
assert.equal(staged.trace.markerOnlyEventCount, 1);
assert.equal(staged.trace.thresholdRecomputed, false);
assert.equal(staged.trace.emergencyFundAssetsSpent, false);
assert.equal(staged.trace.interventionsAppliedAsMath, false);

assert.equal(byType(staged.reductionsApplied, "diningOutRestaurants").effectiveMonthAfterDeath, 1, "stage 1 discretionary starts at month 1");
assert.equal(byType(staged.pausesApplied, "retirementContributions").effectiveMonthAfterDeath, 2, "stage 2 pause starts at month 2");
assert.equal(byType(staged.reductionsApplied, "houseCleaning").effectiveMonthAfterDeath, 3, "flexible services start at month 3");
assert.equal(byType(staged.reductionsApplied, "schoolLunches").effectiveMonthAfterDeath, 6, "flexible essentials start at month 6");
assert.equal(byType(staged.reductionsApplied, "groceries").effectiveMonthAfterDeath, 9, "groceries start at late protected stage");
assert.equal(byType(staged.reductionsApplied, "groceries").monthlyAmount, 150, "groceries should use supplied one-tier amount");
assert.equal(byType(staged.reductionsApplied, "groceries").trace.groceriesOneTierReductionPreserved, true, "groceries trace should preserve one-tier policy");
assert.equal(byType(staged.reductionsApplied, "fuel").effectiveMonthAfterDeath, 12, "transportation flex starts at month 12");
assert.equal(byType(staged.reductionsApplied, "autoInsurance"), undefined, "NO items never apply");
assert.equal(byType(staged.markerOnlyEvents, "housingDecisionWindow").effectiveMonthAfterDeath, 12, "INTERVENTION rows become marker-only events");
assert.equal(byType(staged.markerOnlyEvents, "housingDecisionWindow").trace.appliesMath, false, "marker-only intervention should not apply math");
assert.equal(byType(staged.reductionsApplied, "housingDecisionWindow"), undefined, "INTERVENTION rows should not be reductions");

const stage1 = stageById(staged.stageEvents, "immediate-discretionary-compression");
const stage2 = stageById(staged.stageEvents, "contribution-pauses");
const stage3 = stageById(staged.stageEvents, "flexible-lifestyle-services");
const stage4 = stageById(staged.stageEvents, "flexible-essentials-compression");
const stage5 = stageById(staged.stageEvents, "groceries-protected-flexible-compression");
const stage6 = stageById(staged.stageEvents, "transportation-utilities-pets-financial-leakage");
const stage7 = stageById(staged.stageEvents, "intervention-window-candidates");
assert.equal(stage1.monthlyReliefAdded, 200);
assert.equal(stage2.monthlyReliefAdded, 300);
assert.equal(stage3.monthlyReliefAdded, 100);
assert.equal(stage4.monthlyReliefAdded, 80);
assert.equal(stage5.monthlyReliefAdded, 150);
assert.equal(stage6.monthlyReliefAdded, 120);
assert.equal(stage7.markerOnlyActions.length, 1);
assert.equal(stage7.monthlyReliefAdded, 0);
assert.equal(stage6.cumulativeMonthlyReliefAfterStage, 950);
assert.ok(stage5.remainingProjectedOutcome, "stage events should include remaining projected outcome");

assert.deepEqual(
  staged.trace.monthlyReliefSchedule.map(function (entry) {
    return [entry.stageId, entry.effectiveMonthAfterDeath, entry.monthlyReliefAdded, entry.cumulativeMonthlyReliefAfterStage];
  }),
  [
    ["immediate-discretionary-compression", 1, 200, 200],
    ["contribution-pauses", 2, 300, 500],
    ["flexible-lifestyle-services", 3, 100, 600],
    ["flexible-essentials-compression", 6, 80, 680],
    ["groceries-protected-flexible-compression", 9, 150, 830],
    ["transportation-utilities-pets-financial-leakage", 12, 120, 950]
  ],
  "monthly relief schedule should be stage ordered"
);

const alternatePoints = staged.postDeathSeries.points;
assert.equal(pointByMonth(alternatePoints, 1).trace.activeMonthlyReliefApplied, 200, "only month 1 relief should apply at month 1");
assert.equal(pointByMonth(alternatePoints, 2).trace.activeMonthlyReliefApplied, 500, "pause relief should start at month 2");
assert.equal(pointByMonth(alternatePoints, 3).trace.activeMonthlyReliefApplied, 600, "stage 3 relief should start at month 3");
assert.equal(pointByMonth(alternatePoints, 5).trace.activeMonthlyReliefApplied, 600, "later stages should not apply before their effective month");
assert.equal(pointByMonth(alternatePoints, 6).trace.activeMonthlyReliefApplied, 680, "stage 4 relief should start at month 6");
assert.equal(pointByMonth(alternatePoints, 8).trace.activeMonthlyReliefApplied, 680, "grocery relief should not apply before month 9");
assert.equal(pointByMonth(alternatePoints, 9).trace.activeMonthlyReliefApplied, 830, "grocery relief should start at month 9");
assert.equal(pointByMonth(alternatePoints, 12).trace.activeMonthlyReliefApplied, 950, "stage 6 relief should start at month 12");
assert.equal(pointByMonth(alternatePoints, 1).endingResources, 17200);
assert.equal(pointByMonth(alternatePoints, 2).endingResources, 14700);
assert.equal(pointByMonth(alternatePoints, 2).endingResources === 15900, false, "staged path should not apply all relief immediately");
assert.equal(pointByMonth(alternatePoints, 12).trace.activeReliefByStage.includes("transportation-utilities-pets-financial-leakage"), true);
assert.notDeepEqual(alternatePoints, scenario.postDeathSeries.points, "staged postDeathSeries should differ from base");
assert.deepEqual(scenario.postDeathSeries.points, scenarioBefore.postDeathSeries.points, "base postDeathSeries points remain unchanged");

const noPause = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules,
  options: {
    applyPauseCandidates: false
  }
}));
assert.equal(noPause.status, "complete");
assert.equal(noPause.stagedCompressionScenario.pausesApplied.length, 0, "PAUSE candidates should apply only when enabled");
assert.equal(stageById(noPause.stagedCompressionScenario.stageEvents, "contribution-pauses"), undefined, "pause stage should not emit when pauses are disabled and no actions exist");

const noMarkerOnly = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules,
  options: {
    includeMarkerOnlyEvents: false
  }
}));
assert.equal(noMarkerOnly.status, "complete");
assert.equal(noMarkerOnly.stagedCompressionScenario.markerOnlyEvents.length, 0, "marker-only events should be optional");

const missingPoints = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario({
    postDeathSeries: {
      points: []
    }
  }),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules
}));
assert.equal(missingPoints.status, "blocked");
assert.ok(codes(missingPoints.dataGaps).includes("missing-post-death-points-for-staged-compression-scenario"));

const scalarBlocked = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    dataGaps: [
      {
        code: "scalar-household-expenses-not-itemized-for-compression",
        message: "Scalar household ongoingSupport expenses are not fully itemized."
      }
    ]
  }),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules,
  options: {
    requireCompleteItemization: true
  }
}));
assert.equal(scalarBlocked.status, "blocked");
assert.ok(codes(scalarBlocked.dataGaps).includes("active-staged-compression-blocked-by-scalar-household-itemization-gap"));

const scalarAllowed = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    dataGaps: [
      {
        code: "scalar-household-expenses-not-itemized-for-compression",
        message: "Scalar household ongoingSupport expenses are not fully itemized."
      }
    ]
  }),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules,
  options: {
    requireCompleteItemization: false
  }
}));
assert.equal(scalarAllowed.status, "complete", "scalar itemization gap should block only when required");

const missingReduction = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    opportunities: [
      {
        typeKey: "diningOutRestaurants",
        label: "Dining Out",
        sourcePath: "expenseFacts.expenses[0]"
      }
    ],
    pauseCandidates: [],
    advisorReviewItems: []
  }),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules
}));
assert.equal(missingReduction.status, "blocked");
assert.ok(codes(missingReduction.dataGaps).includes("missing-eligible-staged-monthly-reduction-amount"));

const generatedDebtEligible = clone(calculateIncomeImpactStagedCompressionScenario({
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
    pauseCandidates: [],
    advisorReviewItems: []
  }),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules
}));
assert.equal(generatedDebtEligible.status, "blocked");
assert.ok(codes(generatedDebtEligible.dataGaps).includes("generated-debt-payment-in-eligible-staged-compression-opportunities"));

const noEligible = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    opportunities: [
      {
        typeKey: "autoInsurance",
        label: "Auto Insurance",
        possibleMonthlyReduction: 60,
        defaultNeedType: "essential",
        sourcePath: "expenseFacts.expenses[0]"
      }
    ],
    pauseCandidates: [],
    advisorReviewItems: []
  }),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules
}));
assert.equal(noEligible.status, "blocked");
assert.ok(codes(noEligible.dataGaps).includes("no-eligible-staged-compression-actions-or-marker-events"));

const markerOnlyOnly = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport({
    opportunities: [],
    pauseCandidates: [],
    advisorReviewItems: [
      {
        typeKey: "housingDecisionWindow",
        label: "Housing Decision Window",
        sourcePath: "compressionPolicy.housingDecisionWindow"
      }
    ]
  }),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: stagePolicyRules
}));
assert.equal(markerOnlyOnly.status, "complete", "marker-only intervention windows should be valid output");
assert.equal(markerOnlyOnly.stagedCompressionScenario.reductionsApplied.length, 0);
assert.equal(markerOnlyOnly.stagedCompressionScenario.markerOnlyEvents.length, 1);
assert.deepEqual(
  markerOnlyOnly.stagedCompressionScenario.postDeathSeries.points.map((point) => point.endingResources),
  createScenario().postDeathSeries.points.map((point) => point.endingResources),
  "marker-only scenario should not change resource path"
);

const missingPolicyRules = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: [],
  compressionStagePolicyRules: stagePolicyRules
}));
assert.equal(missingPolicyRules.status, "blocked");
assert.ok(codes(missingPolicyRules.dataGaps).includes("missing-compression-policy-rules"));

const missingStageRules = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: []
}));
assert.equal(missingStageRules.status, "blocked");
assert.ok(codes(missingStageRules.dataGaps).includes("missing-compression-stage-policy-rules"));

const invalidStageRules = clone(calculateIncomeImpactStagedCompressionScenario({
  scenario: createScenario(),
  compressionReport: createCompressionReport(),
  compressionPolicyRules: policyRules,
  compressionStagePolicyRules: [
    {
      stageId: "broken",
      stageOrder: 1,
      stageType: "reduction",
      effectiveMonthAfterDeath: 1,
      triggerMode: "ai-decides",
      decisionsAllowed: ["YES"],
      compressionOrderGroups: ["earlyDiscretionary"],
      appliesMath: true,
      markerOnly: false
    }
  ]
}));
assert.equal(invalidStageRules.status, "blocked");
assert.ok(codes(invalidStageRules.dataGaps).includes("invalid-compression-stage-policy-rules-block-staged-scenario"));

console.log("income-impact-staged-compression-scenario-calculations-check passed");
