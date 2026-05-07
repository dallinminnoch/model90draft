#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const context = {
  LensApp: {
    lensAnalysis: {}
  },
  console
};
context.globalThis = context;
vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: absolutePath });
  return source;
}

loadScript("app/features/lens-analysis/household-expense-lifestyle-range-policy.js");
const helperSource = loadScript("app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js");

const policy = context.LensApp.lensAnalysis.householdExpenseLifestyleRangePolicy;
const calculations = context.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;
assert.ok(policy, "lifestyle range policy should load");
assert.ok(calculations, "lifestyle scenario calculations should load");
assert.equal(typeof calculations.calculateIncomeImpactLifestyleScenario, "function", "helper export should exist");
assert.equal(typeof calculations.calculateIncomeImpactLifestyleComparisonScenario, "function", "comparison helper export should exist");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeFixtureExpenses() {
  return [
    {
      id: "housing-1",
      expenseTypeKey: "rentOrMortgagePayment",
      categoryKey: "housingExpense",
      label: "Mortgage",
      monthlyAmount: 2000,
      sourcePath: "fixture.housing"
    },
    {
      id: "groceries-1",
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Groceries",
      monthlyAmount: 1000,
      sourcePath: "fixture.groceries"
    },
    {
      id: "dining-1",
      expenseTypeKey: "diningOutRestaurants",
      categoryKey: "foodGroceries",
      label: "Dining",
      monthlyAmount: 400,
      sourcePath: "fixture.dining"
    },
    {
      id: "subscriptions-1",
      expenseTypeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      label: "Streaming",
      monthlyAmount: 120,
      sourcePath: "fixture.streaming"
    },
    {
      id: "travel-1",
      expenseTypeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      label: "Travel",
      monthlyAmount: 600,
      sourcePath: "fixture.travel"
    },
    {
      id: "debt-1",
      expenseTypeKey: "autoLoanPayment",
      categoryKey: "debtObligations",
      label: "Auto Loan",
      monthlyAmount: 350,
      sourceOwnedBy: "debtRecords",
      isDebtPaymentExpense: true,
      sourcePath: "protectionModeling.data.debtRecords[0]"
    },
    {
      id: "childcare-1",
      expenseTypeKey: "daycareChildcare",
      categoryKey: "familySupport",
      label: "Daycare",
      monthlyAmount: 800,
      sourcePath: "fixture.childcare"
    },
    {
      id: "tax-1",
      expenseTypeKey: "federalStateLocalIncomeTaxPayments",
      categoryKey: "taxes",
      label: "Taxes",
      monthlyAmount: 300,
      sourcePath: "fixture.taxes"
    },
    {
      id: "insurance-1",
      expenseTypeKey: "healthInsurancePremiums",
      categoryKey: "insurancePremiums",
      label: "Health Insurance",
      monthlyAmount: 500,
      sourcePath: "fixture.insurance"
    },
    {
      id: "healthcare-1",
      expenseTypeKey: "copaysCoinsurance",
      categoryKey: "ongoingHealthcare",
      label: "Copays",
      monthlyAmount: 90,
      sourcePath: "fixture.healthcare"
    },
    {
      id: "giving-1",
      expenseTypeKey: "charitableGiving",
      categoryKey: "givingCommunity",
      label: "Charitable Giving",
      monthlyAmount: 200,
      sourcePath: "fixture.giving"
    },
    {
      id: "reserve-1",
      expenseTypeKey: "emergencyFundContributions",
      categoryKey: "savingsGoalContributions",
      label: "Emergency Fund Contribution",
      monthlyAmount: 150,
      sourcePath: "fixture.reserve"
    }
  ];
}

function calculate(sliderValue, extraInput) {
  return calculations.calculateIncomeImpactLifestyleScenario(Object.assign({
    expenses: makeFixtureExpenses(),
    sliderValue
  }, extraInput || {}));
}

function makeBasePostDeathSeries(monthIndexes) {
  const indexes = monthIndexes || [1, 2, 3];
  return {
    points: indexes.map((monthIndex, index) => ({
      monthIndex,
      date: `2031-${String(index + 6).padStart(2, "0")}-06`,
      survivorNeeds: 4000,
      essentialNeeds: 3000,
      discretionaryNeeds: 1000,
      netUse: 3500,
      startingResources: 100000 - (index * 2000),
      endingResources: 98000 - (index * 2000),
      availableResources: 98000 - (index * 2000),
      accumulatedUnmetNeed: 0,
      sourcePaths: ["scenario.postDeathSeries.points"]
    })),
    summary: {
      totalSurvivorNeeds: 12000,
      totalNetUse: 10500,
      accumulatedUnmetNeed: 0
    },
    depletion: {
      depleted: false,
      depletionDate: null,
      monthsCovered: indexes[indexes.length - 1],
      precision: "monthly"
    }
  };
}

function makeSafeScalarLifestyleExpenses() {
  return [
    {
      id: "scalar-food",
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Scalar Groceries",
      monthlyAmount: 1000,
      sourceKey: "foodCost",
      sourceOwnedBy: "ongoingSupport",
      ownedByField: "monthlyFoodCost",
      sourcePath: "protectionModeling.data.foodCost",
      isGeneratedExpense: true,
      isScalarHouseholdExpense: true,
      isCompressionEligibleSource: true,
      metadata: {
        normalizedSourcePath: "lensModel.ongoingSupport.monthlyFoodCost"
      }
    },
    {
      id: "scalar-travel",
      expenseTypeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      label: "Scalar Travel",
      monthlyAmount: 500,
      sourceKey: "travelDiscretionaryCost",
      sourceOwnedBy: "ongoingSupport",
      ownedByField: "monthlyTravelAndDiscretionaryCost",
      sourcePath: "protectionModeling.data.travelDiscretionaryCost",
      isGeneratedExpense: true,
      isScalarHouseholdExpense: true,
      isCompressionEligibleSource: true,
      metadata: {
        normalizedSourcePath: "lensModel.ongoingSupport.monthlyTravelAndDiscretionaryCost"
      }
    }
  ];
}

function byType(result, typeKey) {
  const item = result.adjustedExpenses.find((candidate) => candidate.expenseTypeKey === typeKey);
  assert.ok(item, `${typeKey} adjusted item should exist`);
  return item;
}

const baseline = calculate(0);
assert.equal(baseline.status, "complete", "baseline fixture should be complete");
assert.equal(baseline.sliderValue, 0);
assert.equal(baseline.totalBaselineMonthlyExpenses, baseline.totalAdjustedMonthlyExpenses, "slider 0 should preserve exact baseline");
assert.equal(baseline.monthlyDelta, 0, "slider 0 delta should be zero");
baseline.adjustedExpenses.forEach((item) => {
  assert.equal(item.adjustedMonthlyAmount, item.baselineMonthlyAmount, `${item.expenseTypeKey} should preserve baseline at slider 0`);
});
assert.equal(baseline.trace.baselinePreservedAtZero, true, "trace should prove baseline preservation");

const conservative = calculate(-100);
assert.equal(byType(conservative, "groceries").adjustedMonthlyAmount, 800, "groceries should move to conservative floor");
assert.equal(byType(conservative, "diningOutRestaurants").adjustedMonthlyAmount, 0, "dining should move to floor");
assert.equal(byType(conservative, "streamingDigitalSubscriptions").adjustedMonthlyAmount, 0, "subscriptions should move to floor");
assert.equal(byType(conservative, "vacationsTravel").adjustedMonthlyAmount, 0, "travel should move to floor");
assert.equal(byType(conservative, "emergencyFundContributions").adjustedMonthlyAmount, 0, "pauseable contribution should approach zero");
assert.ok(conservative.monthlyDelta < 0, "conservative slider should reduce eligible expense total");

const elevated = calculate(100);
assert.equal(byType(elevated, "groceries").adjustedMonthlyAmount, 1150, "groceries should move to modest elevated ceiling");
assert.equal(byType(elevated, "diningOutRestaurants").adjustedMonthlyAmount, 700, "dining should move to elevated ceiling");
assert.equal(byType(elevated, "streamingDigitalSubscriptions").adjustedMonthlyAmount, 180, "subscriptions should move to elevated ceiling");
assert.equal(byType(elevated, "vacationsTravel").adjustedMonthlyAmount, 1080, "travel should move to elevated ceiling");
assert.equal(byType(elevated, "emergencyFundContributions").adjustedMonthlyAmount, 150, "pauseable contribution should not elevate in V1");
assert.ok(elevated.monthlyDelta > 0, "elevated slider should increase eligible lifestyle expense total");

const partialConservative = calculate(-50);
assert.equal(byType(partialConservative, "groceries").adjustedMonthlyAmount, 900, "partial conservative groceries should interpolate");
assert.equal(byType(partialConservative, "diningOutRestaurants").adjustedMonthlyAmount, 200, "partial conservative dining should interpolate");
assert.equal(byType(partialConservative, "streamingDigitalSubscriptions").adjustedMonthlyAmount, 60, "partial conservative subscriptions should interpolate");

const partialElevated = calculate(50);
assert.equal(byType(partialElevated, "groceries").adjustedMonthlyAmount, 1075, "partial elevated groceries should interpolate");
assert.equal(byType(partialElevated, "diningOutRestaurants").adjustedMonthlyAmount, 550, "partial elevated dining should interpolate");
assert.equal(byType(partialElevated, "vacationsTravel").adjustedMonthlyAmount, 840, "partial elevated travel should interpolate");

const clampedHigh = calculate(150);
assert.equal(clampedHigh.sliderValue, 100, "slider above range should clamp to 100");
assert.equal(byType(clampedHigh, "diningOutRestaurants").adjustedMonthlyAmount, byType(clampedHigh, "diningOutRestaurants").ceilingMonthlyAmount, "adjusted value should clamp to ceiling");
assert.equal(clampedHigh.warnings.some((warning) => warning.code === "lifestyle-slider-value-clamped"), true, "clamp warning should be emitted");

const clampedLow = calculate(-150);
assert.equal(clampedLow.sliderValue, -100, "slider below range should clamp to -100");
assert.equal(byType(clampedLow, "groceries").adjustedMonthlyAmount, byType(clampedLow, "groceries").floorMonthlyAmount, "adjusted value should clamp to floor");

[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "daycareChildcare",
  "federalStateLocalIncomeTaxPayments",
  "healthInsurancePremiums",
  "copaysCoinsurance",
  "charitableGiving"
].forEach((typeKey) => {
  const item = byType(elevated, typeKey);
  assert.equal(item.adjustedMonthlyAmount, item.baselineMonthlyAmount, `${typeKey} should stay fixed/review-only`);
  assert.equal(item.monthlyDelta, 0, `${typeKey} should have zero delta`);
  assert.equal(item.sliderEligible, false, `${typeKey} should not be slider eligible`);
});
assert.equal(byType(elevated, "autoLoanPayment").reasonCode, "generated-debt-fixed", "generated debt payment should use specific fixed reason");
assert.equal(byType(elevated, "rentOrMortgagePayment").reasonCode, "housing-payment-fixed", "mortgage/rent should use housing fixed reason");

const baselineTotalFromItems = baseline.adjustedExpenses.reduce((total, item) => total + item.baselineMonthlyAmount, 0);
const adjustedTotalFromItems = elevated.adjustedExpenses.reduce((total, item) => total + item.adjustedMonthlyAmount, 0);
const deltaFromItems = elevated.adjustedExpenses.reduce((total, item) => total + item.monthlyDelta, 0);
assert.equal(baseline.totalBaselineMonthlyExpenses, Number(baselineTotalFromItems.toFixed(2)), "baseline total should reconcile");
assert.equal(elevated.totalAdjustedMonthlyExpenses, Number(adjustedTotalFromItems.toFixed(2)), "adjusted total should reconcile");
assert.equal(elevated.monthlyDelta, Number(deltaFromItems.toFixed(2)), "delta total should reconcile");
assert.equal(
  elevated.fixedExpensesTotal + elevated.sliderEligibleExpensesTotal,
  elevated.totalBaselineMonthlyExpenses,
  "fixed plus eligible baseline totals should reconcile"
);
assert.ok(elevated.conservativeFloorTotal <= elevated.totalBaselineMonthlyExpenses, "floor total should be at or below baseline");
assert.ok(elevated.elevatedCeilingTotal >= elevated.totalBaselineMonthlyExpenses, "ceiling total should be at or above baseline");

const mutableInput = {
  expenses: makeFixtureExpenses(),
  sliderValue: -50,
  householdFacts: {
    householdMemberCount: 3
  }
};
const mutableBefore = cloneJson(mutableInput);
const mutableResult = calculations.calculateIncomeImpactLifestyleScenario(mutableInput);
assert.deepEqual(mutableInput, mutableBefore, "helper should not mutate input");
mutableResult.adjustedExpenses[0].label = "Broken";
assert.notEqual(calculate(-50).adjustedExpenses[0].label, "Broken", "output should be independent per calculation");

const rules = policy.listLifestyleRangePolicies();
const byRules = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: 100,
  lifestyleRangePolicies: rules
});
assert.equal(byType(byRules, "diningOutRestaurants").adjustedMonthlyAmount, 700, "helper should support explicit policy rules");

const byOverrideResolver = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: [{ expenseTypeKey: "customLifestyle", categoryKey: "custom", monthlyAmount: 100 }],
  sliderValue: 100,
  policyResolver: () => ({
    expenseTypeKey: "customLifestyle",
    categoryKey: "custom",
    displayName: "Custom Lifestyle",
    sliderEligible: true,
    rangeBehavior: "expandable",
    conservativeFloorRatio: 0.5,
    elevatedCeilingRatio: 1.2,
    floorTierKey: "notApplicable",
    ceilingTierKey: "notApplicable",
    ceilingTierMultiplier: null,
    protectedFloorPolicy: "allowModerateReduction",
    allowBelowBaseline: true,
    allowAboveBaseline: true,
    requiresAdvisorReview: false,
    sourcePolicyDecision: "YES",
    version: 1
  })
});
assert.equal(byType(byOverrideResolver, "customLifestyle").adjustedMonthlyAmount, 120, "helper should support resolver override");

const partialMissing = calculations.calculateIncomeImpactLifestyleScenario({ sliderValue: 0 });
assert.equal(partialMissing.status, "partial", "missing expenses should return partial");
assert.equal(partialMissing.dataGaps.some((gap) => gap.code === "missing-lifestyle-expenses"), true, "missing expense gap should be emitted");

const basePostDeathSeries = makeBasePostDeathSeries();
const safeCurrent = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: 0,
  basePostDeathSeries
});
assert.equal(safeCurrent.status, "complete", "current lifestyle comparison with safe scalar facts should be complete");
assert.ok(safeCurrent.comparisonScenario, "helper should return a graph comparison scenario when base series is provided");
assert.deepEqual(
  safeCurrent.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "slider 0 comparison series should exactly match baseline"
);
assert.equal(safeCurrent.comparisonScenario.trace.graphMonthlyDelta, 0);
assert.equal(safeCurrent.comparisonScenario.trace.noOpComparison, true);

const safeConservative = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: -100,
  basePostDeathSeries
});
assert.equal(safeConservative.status, "complete", "safe scalar lifestyle deltas should reconcile to base survivor needs");
assert.equal(safeConservative.monthlyDelta, -700, "safe scalar fixture should reduce monthly expense total");
assert.equal(safeConservative.comparisonScenario.trace.graphMonthlyDelta, -700, "reconciled graph delta should match safe scalar monthly delta");
assert.equal(
  safeConservative.comparisonScenario.trace.baseNeedReconciliation.graphAdjustmentItemCount,
  2,
  "both safe scalar items should be graph-adjustment eligible"
);
assert.deepEqual(
  safeConservative.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  [98700, 97400, 96100],
  "conservative comparison should apply cumulative delta by explicit monthIndex"
);
assert.equal(
  safeConservative.comparisonScenario.postDeathSeries.points[2].trace.elapsedMonthIndexUsed,
  3,
  "comparison trace should record explicit elapsed month index"
);

const sparseBasePostDeathSeries = makeBasePostDeathSeries([1, 3, 6]);
const sparseResult = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: -100,
  basePostDeathSeries: sparseBasePostDeathSeries
});
assert.deepEqual(
  sparseResult.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  [98700, 98100, 98200],
  "sparse/non-contiguous series should use explicit monthIndex, not array position"
);
assert.equal(
  sparseResult.comparisonScenario.postDeathSeries.points[2].trace.cumulativeExpenseDeltaApplied,
  -4200,
  "month 6 should carry six months of reconciled monthly delta"
);

const unreconciled = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: -100,
  basePostDeathSeries
});
assert.equal(unreconciled.status, "partial", "unreconciled graph-moving expense facts should mark output partial");
assert.ok(
  unreconciled.dataGaps.some((gap) => gap.code === "unreconciled-lifestyle-expense-facts-excluded-from-graph"),
  "unreconciled expense facts should create a data gap"
);
assert.equal(unreconciled.comparisonScenario.trace.graphMonthlyDelta, 0, "unreconciled deltas should not move graph");
assert.deepEqual(
  unreconciled.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "unreconciled deltas should produce a safe baseline/no-op comparison"
);

const allFixed = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses().filter((expense) => [
    "rentOrMortgagePayment",
    "autoLoanPayment",
    "daycareChildcare",
    "federalStateLocalIncomeTaxPayments",
    "healthInsurancePremiums",
    "copaysCoinsurance",
    "charitableGiving"
  ].includes(expense.expenseTypeKey)),
  sliderValue: 100,
  basePostDeathSeries
});
assert.equal(allFixed.status, "complete", "all fixed/review-only expenses should be a safe complete no-op");
assert.equal(allFixed.monthlyDelta, 0);
assert.equal(allFixed.comparisonScenario.trace.noOpComparison, true);
assert.deepEqual(
  allFixed.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "all fixed/review-only expenses should not move the graph"
);

const missingMonthIndexSeries = cloneJson(basePostDeathSeries);
delete missingMonthIndexSeries.points[1].monthIndex;
const missingMonthIndex = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: -100,
  basePostDeathSeries: missingMonthIndexSeries
});
assert.equal(missingMonthIndex.status, "partial", "missing monthIndex should create a partial comparison");
assert.ok(
  missingMonthIndex.dataGaps.some((gap) => gap.code === "missing-post-death-month-index-for-lifestyle-comparison"),
  "missing monthIndex should create a data gap"
);
assert.equal(missingMonthIndex.comparisonScenario.trace.graphMonthlyDelta, 0, "missing monthIndex should keep graph adjustment no-op");
assert.deepEqual(
  missingMonthIndex.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "missing monthIndex should not silently move graph"
);

const comparisonDirectInput = {
  lifestyleScenario: cloneJson(safeConservative),
  basePostDeathSeries
};
const directInputBefore = cloneJson(comparisonDirectInput);
const directComparison = calculations.calculateIncomeImpactLifestyleComparisonScenario(comparisonDirectInput);
assert.deepEqual(comparisonDirectInput, directInputBefore, "comparison helper should not mutate input");
assert.deepEqual(
  directComparison.postDeathSeries.points.map((point) => point.endingResources),
  safeConservative.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  "direct comparison helper should match embedded comparison output"
);

assert.equal(baseline.trace.projectionSeriesApplied, false, "projection series should not be applied in this pass");
assert.equal(baseline.trace.projectionSeriesDeferred, true, "projection series should be explicitly deferred");
assert.equal(baseline.trace.timingApplied, false, "no timing behavior should be applied");
assert.equal(baseline.trace.graphPathChanged, false, "graph path should not change");
assert.equal(baseline.trace.displayWired, false, "display should not be wired");
assert.equal(baseline.trace.storageTouched, false, "storage should not be touched");
assert.equal(baseline.trace.inputsMutated, false, "trace should state inputs were not mutated");

[
  /income-impact-timeline-graph-model/,
  /income-loss-impact-display/,
  /income-impact-triage-intervention-calculations/,
  /normalize-lens-model/,
  /household-survivor-runway-calculations/,
  /pages\//,
  /\.css\b/,
  /localStorage|sessionStorage|document|querySelector|addEventListener|fetch/,
  /\brequire\s*\(/,
  /\bimport\b/,
  /effectiveMonthAfterDeath|stageEvents|monthlyReliefSchedule|stepDown|step-down/i
].forEach((pattern) => {
  assert.equal(pattern.test(helperSource), false, `helper source should not include ${pattern}`);
});

console.log("income-impact-lifestyle-scenario-calculations-check passed");
