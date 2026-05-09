#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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
  Object.defineProperty(context, "localStorage", {
    get() {
      throw new Error("adjustment engine must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("adjustment engine must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("adjustment engine must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("adjustment engine must not read client records directly");
    }
  });
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadContext() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js");
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function getRow(result, expenseTypeKey) {
  const row = result.rowAdjustments.find(function (candidate) {
    return candidate.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(row, `${expenseTypeKey} row should exist`);
  return row;
}

function getBucket(result, planningBucketKey) {
  const bucket = result.bucketAdjustments.find(function (candidate) {
    return candidate.planningBucketKey === planningBucketKey;
  });
  assert.ok(bucket, `${planningBucketKey} bucket should exist`);
  return bucket;
}

function hasIssue(list, code) {
  return Array.isArray(list) && list.some(function (issue) {
    return issue.code === code;
  });
}

function createExpenses() {
  return [
    {
      id: "groceries-1",
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Groceries",
      monthlyAmount: 600
    },
    {
      id: "school-meals-1",
      expenseTypeKey: "schoolMeals",
      categoryKey: "foodGroceries",
      label: "School meals",
      monthlyAmount: 200
    },
    {
      id: "dining-1",
      expenseTypeKey: "diningOutRestaurants",
      categoryKey: "foodGroceries",
      label: "Dining",
      monthlyAmount: 300
    },
    {
      id: "streaming-1",
      expenseTypeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      label: "Streaming",
      monthlyAmount: 120
    },
    {
      id: "clothing-1",
      expenseTypeKey: "adultClothingShoes",
      categoryKey: "personalLivingClothing",
      label: "Clothing",
      monthlyAmount: 250
    },
    {
      id: "debt-1",
      expenseTypeKey: "autoLoanPayment",
      categoryKey: "debtObligations",
      label: "Auto loan",
      monthlyAmount: 500,
      sourceOwnedBy: "debtRecords",
      isDebtPaymentExpense: true
    },
    {
      id: "housing-1",
      expenseTypeKey: "rentOrMortgagePayment",
      categoryKey: "housingExpense",
      label: "Mortgage",
      monthlyAmount: 2000
    },
    {
      id: "healthcare-1",
      expenseTypeKey: "copaysCoinsurance",
      categoryKey: "ongoingHealthcare",
      label: "Copays",
      monthlyAmount: 100
    }
  ];
}

function createResolvedPolicyRows() {
  return [
    {
      expenseTypeKey: "groceries",
      label: "Groceries",
      planningBucketKey: "foodAtHomeConsumables",
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      conservativeFloorRatio: 0.5,
      elevatedCeilingRatio: 1.1,
      floorSourceLabel: "Food at Home model / USDA Food Plan",
      floorSourceStatus: "configured",
      graphAdjustable: true
    },
    {
      expenseTypeKey: "schoolMeals",
      label: "School meals",
      planningBucketKey: "foodAtHomeConsumables",
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      conservativeFloorRatio: 0.5,
      elevatedCeilingRatio: 1.1,
      floorSourceLabel: "Food at Home model / USDA Food Plan",
      floorSourceStatus: "configured",
      graphAdjustable: true
    },
    {
      expenseTypeKey: "diningOutRestaurants",
      label: "Dining",
      planningBucketKey: "diningTakeout",
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.2,
      floorSourceLabel: "$0 floor / no dollar source",
      floorSourceStatus: "notApplicable",
      graphAdjustable: true
    },
    {
      expenseTypeKey: "streamingDigitalSubscriptions",
      label: "Streaming",
      planningBucketKey: "subscriptionsMemberships",
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.2,
      floorSourceLabel: "$0 floor / no dollar source",
      floorSourceStatus: "notApplicable",
      graphAdjustable: true
    },
    {
      expenseTypeKey: "adultClothingShoes",
      label: "Clothing",
      planningBucketKey: "personalLivingClothing",
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "ratioFloorOnly",
      conservativeFloorRatio: 0.4,
      elevatedCeilingRatio: 1.1,
      floorSourceLabel: "Ratio floor only / no dollar source",
      floorSourceStatus: "notApplicable",
      graphAdjustable: true
    },
    {
      expenseTypeKey: "autoLoanPayment",
      label: "Auto loan",
      planningBucketKey: "debtObligations",
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      conservativeFloorRatio: 1,
      elevatedCeilingRatio: 1,
      floorSourceLabel: "Not adjusted",
      floorSourceStatus: "notApplicable",
      graphAdjustable: false
    },
    {
      expenseTypeKey: "rentOrMortgagePayment",
      label: "Mortgage",
      planningBucketKey: "housingCore",
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      conservativeFloorRatio: 0.5,
      elevatedCeilingRatio: 1,
      floorSourceLabel: "HUD FMR reference",
      floorSourceStatus: "configured",
      graphAdjustable: true
    },
    {
      expenseTypeKey: "copaysCoinsurance",
      label: "Copays",
      planningBucketKey: "healthcareCare",
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1,
      floorSourceLabel: "$0 floor / no dollar source",
      floorSourceStatus: "notApplicable",
      graphAdjustable: true
    }
  ];
}

function createCompleteInput(overrides) {
  return Object.assign({
    expenseFacts: {
      expenses: createExpenses()
    },
    resolvedGraphAdjustmentPolicy: {
      rows: createResolvedPolicyRows()
    },
    livingFloorCalculationPreview: {
      buckets: {
        foodAtHomeConsumables: {
          planningBucketKey: "foodAtHomeConsumables",
          floorAmountMonthly: 500,
          floorSource: "USDA_FOOD_PLAN",
          stateAdjustmentMultiplier: 1.2
        }
      }
    },
    sliderValue: -100
  }, overrides || {});
}

function assertNoForbiddenDiffs() {
  const forbiddenPaths = [
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js",
    "app/features/lens-analysis/income-impact-compression-reporting-prep.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js",
    "app/features/account-settings",
    "pages",
    "app.js",
    "styles.css",
    "app/styles"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(forbiddenPaths), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();
  assert.equal(status, "", "adjustment engine pass should not touch runtime, display, graph, admin, storage schema, normalization, page, or CSS files");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js");
  [
    "require(",
    "import ",
    "localStorage",
    "sessionStorage",
    "document.",
    "querySelector",
    "addEventListener",
    "fetch(",
    "XMLHttpRequest",
    "saveHouseholdExpenseAccountPolicy",
    "loadHouseholdExpenseAccountPolicy",
    "income-loss-impact-display",
    "timeline-graph",
    "admin-editor",
    "admin-display"
  ].forEach(function (forbiddenToken) {
    assert.equal(source.includes(forbiddenToken), false, `engine should not use forbidden token ${forbiddenToken}`);
  });
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadContext();
const engineApi = context.LensApp.lensAnalysis.incomeImpactHouseholdExpenseAdjustmentEngine;
assert.ok(engineApi, "adjustment engine module should load");
assert.equal(engineApi.ADJUSTMENT_ENGINE_VERSION, 1, "adjustment engine should expose V1");
assert.equal(typeof engineApi.calculateIncomeImpactHouseholdExpenseAdjustments, "function", "adjustment engine function should export");

const input = createCompleteInput();
const originalInput = clone(input);
const result = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(input);
assert.deepEqual(plain(input), originalInput, "engine should not mutate inputs");
assert.deepEqual(
  engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(input),
  result,
  "engine output should be deterministic"
);
assert.doesNotThrow(() => JSON.stringify(result), "engine output should be JSON serializable");
assert.equal(result.metadata.activeRuntimeConsumer, false, "engine should be inactive for runtime");
assert.equal(result.trace.graphSeriesConstructed, false, "engine should not construct graph series");
assert.equal(result.trace.graphDeltaApplied, false, "engine should not apply graph deltas");
assert.equal(result.trace.floorsAppliedAtPlanningBucketLevel, true, "engine should apply money floors at planning-bucket level");
assert.equal(result.trace.perRowDollarFloorApplied, false, "engine should not apply dollar floors per row");

assert.equal(result.rowAdjustments.length, 8, "all fixture rows should be represented");
const foodBucket = getBucket(result, "foodAtHomeConsumables");
assert.equal(foodBucket.rowCount, 2, "Food at Home bucket should aggregate two rows");
assert.equal(foodBucket.baselineMonthlyAmount, 800, "Food at Home baseline should aggregate row baselines");
assert.equal(foodBucket.ratioFloorMonthlyAmount, 400, "Food at Home ratio floor should aggregate row ratio floors");
assert.equal(foodBucket.estimatedDollarPlanningFloorMonthly, 500, "Food at Home dollar floor should apply once at bucket level");
assert.equal(foodBucket.effectiveConservativeFloorMonthly, 500, "Food at Home effective floor should use higher dollar floor");
assert.equal(foodBucket.adjustedMonthlyAmount, 500, "Food at Home bucket should adjust to one bucket-level floor at -100 slider");
assert.equal(foodBucket.floorApplied, true, "Food at Home bucket floor should be marked applied");
assert.equal(foodBucket.trace.floorAppliedOncePerPlanningBucket, true, "Food floor should be traced as bucket-level");

const groceryRow = getRow(result, "groceries");
const schoolMealsRow = getRow(result, "schoolMeals");
assert.equal(groceryRow.adjustedMonthlyAmount + schoolMealsRow.adjustedMonthlyAmount, 500, "Food row adjustments should reconcile to bucket floor");
assert.equal(groceryRow.estimatedDollarPlanningFloorMonthly, null, "Food dollar floor should not be stored as a row-level floor");
assert.equal(schoolMealsRow.estimatedDollarPlanningFloorMonthly, null, "Food dollar floor should not duplicate per detailed row");
assert.equal(groceryRow.trace.perRowDollarFloorApplied, false, "Food row should trace no per-row dollar floor");
assert.equal(schoolMealsRow.trace.perRowDollarFloorApplied, false, "Second Food row should trace no per-row dollar floor");

const diningRow = getRow(result, "diningOutRestaurants");
assert.equal(diningRow.adjustmentClass, "ratioAdjusted", "dining should be ratio adjusted");
assert.equal(diningRow.minimumFloorMode, "zeroFloor", "dining should use zero floor");
assert.equal(diningRow.adjustedMonthlyAmount, 0, "zero-floor ratio row should be able to go to zero at -100 slider");
const streamingRow = getRow(result, "streamingDigitalSubscriptions");
assert.equal(streamingRow.adjustedMonthlyAmount, 0, "subscription zero-floor row should be able to go to zero");
const clothingRow = getRow(result, "adultClothingShoes");
assert.equal(clothingRow.minimumFloorMode, "ratioFloorOnly", "clothing should be ratio-floor only");
assert.equal(clothingRow.adjustedMonthlyAmount, 100, "ratio-floor-only row should adjust to its ratio floor");

const debtRow = getRow(result, "autoLoanPayment");
assert.equal(debtRow.adjustmentClass, "excludedFromAdjustment", "debt should remain excluded");
assert.equal(debtRow.adjustedMonthlyAmount, debtRow.baselineMonthlyAmount, "debt should not move");
assert.equal(debtRow.graphAdjustable, false, "debt should not be graph adjustable");
const housingRow = getRow(result, "rentOrMortgagePayment");
assert.equal(housingRow.adjustmentClass, "excludedFromAdjustment", "housing should be hard protected even if policy row is adjustable");
assert.equal(housingRow.adjustedMonthlyAmount, housingRow.baselineMonthlyAmount, "housing should not move");
assert.equal(housingRow.reasonCode, "protected-planning-bucket", "housing should trace protected planning bucket");
const healthcareRow = getRow(result, "copaysCoinsurance");
assert.equal(healthcareRow.adjustmentClass, "excludedFromAdjustment", "healthcare should be hard protected");
assert.equal(healthcareRow.adjustedMonthlyAmount, healthcareRow.baselineMonthlyAmount, "healthcare should not move");
assert.ok(hasIssue(result.warnings, "protected-bucket-adjustment-ignored"), "protected adjustable policy rows should warn when ignored");

assert.equal(result.totals.totalBaselineMonthlyExpenses, 4070, "total baseline should sum rows");
assert.equal(result.totals.totalAdjustedMonthlyExpenses, 3200, "total adjusted should sum row outputs");
assert.equal(result.totals.floorAppliedBucketCount, 1, "only Food at Home should have a dollar floor applied");

const missingFloorResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(createCompleteInput({
  livingFloorCalculationPreview: {
    buckets: {}
  }
}));
const missingFoodBucket = getBucket(missingFloorResult, "foodAtHomeConsumables");
assert.equal(missingFoodBucket.adjustedMonthlyAmount, 400, "missing Food floor should fall back to ratio floor");
assert.equal(missingFoodBucket.floorApplied, false, "missing Food floor should not be marked applied");
assert.equal(missingFoodBucket.floorSkippedReason, "missing-estimated-dollar-floor-ratio-fallback", "missing Food floor should trace ratio fallback");
assert.ok(hasIssue(missingFloorResult.warnings, "money-floor-bucket-missing-dollar-floor-ratio-fallback"), "missing floor should warn");
assert.ok(hasIssue(missingFloorResult.dataGaps, "money-floor-bucket-missing-dollar-floor-ratio-fallback"), "missing floor should produce data gap");

const positiveResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(createCompleteInput({
  sliderValue: 50
}));
assert.equal(getBucket(positiveResult, "foodAtHomeConsumables").floorApplied, true, "floor availability should remain traced on elevated scenario");
assert.equal(getBucket(positiveResult, "foodAtHomeConsumables").adjustedMonthlyAmount, 840, "positive slider should use elevated row ceilings, not conservative floor movement");
assert.equal(getRow(positiveResult, "diningOutRestaurants").adjustedMonthlyAmount, 330, "ratio-only row should increase toward ceiling on positive slider");

const missingPolicyResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments({
  expenses: [
    { id: "unknown-1", expenseTypeKey: "unknownExpense", monthlyAmount: 100 }
  ],
  resolvedGraphAdjustmentPolicy: { rows: [] },
  sliderValue: -100
});
const unknownRow = getRow(missingPolicyResult, "unknownExpense");
assert.equal(unknownRow.adjustmentClass, "excludedFromAdjustment", "unknown policy rows should be safely excluded");
assert.equal(unknownRow.adjustedMonthlyAmount, 100, "unknown policy rows should not move");
assert.ok(hasIssue(missingPolicyResult.dataGaps, "missing-resolved-graph-policy-row"), "unknown policy rows should produce data gap");

console.log("income-impact-household-expense-adjustment-engine-check passed");
