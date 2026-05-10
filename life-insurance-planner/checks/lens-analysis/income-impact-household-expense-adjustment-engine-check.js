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
      expenseTypeKey: "householdConsumablesSupplies",
      label: "Household Supplies",
      planningBucketKey: "householdConsumables",
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      conservativeFloorRatio: 0.5,
      elevatedCeilingRatio: 1.1,
      floorSourceLabel: "MODEL90 default floor",
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

function createBaseHouseholdExpenseStream() {
  const representedRows = [
    {
      expenseTypeKey: "groceries",
      planningBucketKey: "foodAtHomeConsumables",
      categoryKey: "foodGroceries",
      label: "Groceries",
      baselineMonthlyAmount: 600,
      representedInBase: true,
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "schoolMeals",
      planningBucketKey: "foodAtHomeConsumables",
      categoryKey: "foodGroceries",
      label: "School meals",
      baselineMonthlyAmount: 200,
      representedInBase: true,
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "householdConsumablesSupplies",
      planningBucketKey: "householdConsumables",
      categoryKey: "foodGroceries",
      label: "Household Supplies",
      baselineMonthlyAmount: 150,
      representedInBase: true,
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "diningOutRestaurants",
      planningBucketKey: "diningTakeout",
      categoryKey: "foodGroceries",
      label: "Dining",
      baselineMonthlyAmount: 300,
      representedInBase: true,
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "streamingDigitalSubscriptions",
      planningBucketKey: "subscriptionsMemberships",
      categoryKey: "discretionaryLifestyle",
      label: "Streaming",
      baselineMonthlyAmount: 120,
      representedInBase: true,
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "adultClothingShoes",
      planningBucketKey: "personalLivingClothing",
      categoryKey: "personalLivingClothing",
      label: "Clothing",
      baselineMonthlyAmount: 250,
      representedInBase: true,
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "ratioFloorOnly",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "autoLoanPayment",
      planningBucketKey: "debtObligations",
      categoryKey: "debtObligations",
      label: "Auto loan",
      baselineMonthlyAmount: 500,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      sourceOwner: "debtRecords",
      isDebtPaymentExpense: true,
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "ongoingSupportHousingReconciliation",
      planningBucketKey: "housingCore",
      categoryKey: "housingExpense",
      label: "Housing support reconciliation",
      baselineMonthlyAmount: 1000,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      sourceOwner: "scalarOngoingSupport",
      trace: { rowSource: "scalar-ongoing-support-reconciliation" }
    },
    {
      expenseTypeKey: "gasHeatingFuelPropaneOil",
      planningBucketKey: "basicUtilities",
      categoryKey: "utilities",
      label: "Gas Utility",
      baselineMonthlyAmount: 140,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "copaysCoinsurance",
      planningBucketKey: "healthcareCare",
      categoryKey: "ongoingHealthcare",
      label: "Copays",
      baselineMonthlyAmount: 100,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "funeralBurialEstimate",
      planningBucketKey: "finalExpenses",
      categoryKey: "funeralBurial",
      label: "Funeral",
      baselineMonthlyAmount: 80,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "privateSchoolTuition",
      planningBucketKey: "educationEnrichment",
      categoryKey: "education",
      label: "Education",
      baselineMonthlyAmount: 90,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "householdInsurancePremiums",
      planningBucketKey: "insurancePremiums",
      categoryKey: "insurancePremiums",
      label: "Insurance",
      baselineMonthlyAmount: 110,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "taxPreparationFees",
      planningBucketKey: "taxesLegalAdministrative",
      categoryKey: "taxes",
      label: "Tax preparation",
      baselineMonthlyAmount: 70,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    },
    {
      expenseTypeKey: "charitableGiving",
      planningBucketKey: "givingCommunity",
      categoryKey: "givingCommunity",
      label: "Giving",
      baselineMonthlyAmount: 60,
      representedInBase: true,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      trace: { rowSource: "expenseFacts" }
    }
  ];

  const referenceRows = [
    {
      expenseTypeKey: "vacationsTravel",
      planningBucketKey: "travelVacations",
      categoryKey: "travelVacations",
      label: "Travel",
      baselineMonthlyAmount: 1000,
      representedInBase: false,
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      trace: { rowSource: "expenseFacts" }
    }
  ];

  return {
    rows: representedRows.concat(referenceRows),
    representedRows,
    referenceRows,
    monthlyTotal: 3770
  };
}

function createCompleteInput(overrides) {
  return Object.assign({
    baseHouseholdExpenseStream: createBaseHouseholdExpenseStream(),
    resolvedGraphAdjustmentPolicy: {
      rows: createResolvedPolicyRows()
    },
    livingFloorCalculationPreview: {
      buckets: {
        foodAtHomeConsumables: {
          planningBucketKey: "foodAtHomeConsumables",
          floorAmountMonthly: 500,
          floorSource: "USDA_FOOD_PLAN"
        },
        householdConsumables: {
          planningBucketKey: "householdConsumables",
          floorAmountMonthly: 100,
          floorSource: "MODEL90_DEFAULT"
        }
      }
    },
    sliderValue: -100
  }, overrides || {});
}

function assertNoForbiddenDiffs() {
  const allowedRuntimePlumbingFiles = new Set([
    "app/features/account-settings/household-expense-account-policy-admin-display.js",
    "app/features/account-settings/household-expense-account-policy-admin-editor.js",
    "app/features/account-settings/household-expense-account-policy-storage.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "pages/income-loss-impact.html",
    "components.css"
  ]);
  const forbiddenPaths = [
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
  }).trim().split(/\r?\n/)
    .filter(Boolean)
    .filter(function (line) {
      return !allowedRuntimePlumbingFiles.has(line.replace(/^[ MADRCU?!]+/, "").trim());
    })
    .join("\n");
  assert.equal(status, "", "adjustment engine pass should not touch runtime, display, graph, admin, storage schema, normalization, page, or CSS files outside the approved Income Impact plumbing files");
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
assert.equal(result.trace.bucketAggregationApplied, true, "engine should trace bucket aggregation for floor handling");
assert.equal(result.trace.perRowDollarFloorApplied, false, "engine should not apply dollar floors per row");
assert.deepEqual(plain(result.trace.floorAppliedBuckets), ["foodAtHomeConsumables", "householdConsumables"], "engine should trace applied floor buckets");
assert.deepEqual(plain(result.trace.floorSkippedBuckets), [], "complete fixture should not skip money-floor buckets");
assert.deepEqual(plain(result.trace.missingFloorBuckets), [], "complete fixture should not have missing money-floor buckets");
assert.equal(result.trace.baseHouseholdExpenseStreamUsed, true, "engine should accept baseHouseholdExpenseStream input");
assert.equal(result.trace.streamMonthlyTotal, 3770, "engine should trace provided stream monthly total");
assert.equal(result.trace.streamParityDifference, 0, "represented rows should reconcile to stream monthly total");

assert.equal(result.rowAdjustments.length, 15, "only represented stream rows should be adjusted");
assert.equal(result.skippedRows.length, 1, "reference rows should be skipped");
assert.equal(result.skippedRows[0].expenseTypeKey, "vacationsTravel", "reference row should be retained in skipped rows");
assert.equal(result.skippedRows[0].baselineMonthlyAmount, 1000, "reference row baseline should be traced but excluded from totals");
assert.equal(result.baselineMonthlyTotal, 3770, "top-level baseline should match stream represented monthly total");
assert.equal(result.totals.baselineMonthlyTotal, 3770, "totals baseline should match stream represented monthly total");
assert.equal(result.totals.totalBaselineMonthlyExpenses, 3770, "legacy total baseline alias should remain populated");
const foodBucket = getBucket(result, "foodAtHomeConsumables");
assert.equal(foodBucket.rowCount, 2, "Food at Home bucket should aggregate two rows");
assert.equal(foodBucket.baselineMonthlyAmount, 800, "Food at Home baseline should aggregate row baselines");
assert.equal(foodBucket.ratioFloorMonthlyAmount, 400, "Food at Home ratio floor should aggregate row ratio floors");
assert.equal(foodBucket.ratioAdjustedMonthlyAmount, 400, "Food at Home ratio-adjusted amount should be calculated before dollar floor overlay");
assert.equal(foodBucket.estimatedDollarPlanningFloorMonthly, 500, "Food at Home dollar floor should apply once at bucket level");
assert.equal(foodBucket.effectiveConservativeFloorMonthly, 500, "Food at Home effective floor should use higher dollar floor");
assert.equal(foodBucket.adjustedMonthlyAmount, 500, "Food at Home bucket should use max of ratio-adjusted amount and one bucket-level floor");
assert.equal(foodBucket.floorApplied, true, "Food at Home bucket floor should be marked applied");
assert.equal(foodBucket.trace.floorAppliedOncePerPlanningBucket, true, "Food floor should be traced as bucket-level");
const householdBucket = getBucket(result, "householdConsumables");
assert.equal(householdBucket.rowCount, 1, "MODEL90 default floor bucket should use one household row");
assert.equal(householdBucket.baselineMonthlyAmount, 150, "household consumables baseline should be represented");
assert.equal(householdBucket.ratioAdjustedMonthlyAmount, 75, "household consumables ratio amount should be calculated before floor overlay");
assert.equal(householdBucket.adjustedMonthlyAmount, 100, "MODEL90 default floor should apply once at bucket level");
assert.equal(householdBucket.floorApplied, true, "MODEL90 default floor should be marked applied");

const groceryRow = getRow(result, "groceries");
const schoolMealsRow = getRow(result, "schoolMeals");
assert.equal(groceryRow.adjustedMonthlyAmount + schoolMealsRow.adjustedMonthlyAmount, 500, "Food row adjustments should reconcile to bucket floor");
assert.equal(groceryRow.estimatedDollarPlanningFloorMonthly, null, "Food dollar floor should not be stored as a row-level floor");
assert.equal(schoolMealsRow.estimatedDollarPlanningFloorMonthly, null, "Food dollar floor should not duplicate per detailed row");
assert.equal(groceryRow.trace.perRowDollarFloorApplied, false, "Food row should trace no per-row dollar floor");
assert.equal(schoolMealsRow.trace.perRowDollarFloorApplied, false, "Second Food row should trace no per-row dollar floor");
const householdSuppliesRow = getRow(result, "householdConsumablesSupplies");
assert.equal(householdSuppliesRow.adjustedMonthlyAmount, 100, "MODEL90 floor uplift should stay at bucket level and allocate to represented row");
assert.equal(householdSuppliesRow.trace.perRowDollarFloorApplied, false, "MODEL90 floor should not be treated as a per-row dollar floor");

const diningRow = getRow(result, "diningOutRestaurants");
assert.equal(diningRow.adjustmentClass, "ratioAdjusted", "dining should be ratio adjusted");
assert.equal(diningRow.minimumFloorMode, "zeroFloor", "dining should use zero floor");
assert.equal(diningRow.adjustedMonthlyAmount, 0, "zero-floor ratio row should be able to go to zero at -100 slider");
const streamingRow = getRow(result, "streamingDigitalSubscriptions");
assert.equal(streamingRow.adjustedMonthlyAmount, 0, "subscription zero-floor row should be able to go to zero");
const clothingRow = getRow(result, "adultClothingShoes");
assert.equal(clothingRow.minimumFloorMode, "ratioFloorOnly", "clothing should be ratio-floor only");
assert.equal(clothingRow.adjustedMonthlyAmount, 100, "ratio-floor-only row should adjust to its ratio floor");

[
  ["autoLoanPayment", "debt should remain fixed"],
  ["ongoingSupportHousingReconciliation", "scalar housing reconciliation should remain fixed"],
  ["gasHeatingFuelPropaneOil", "basic utilities should remain fixed"],
  ["copaysCoinsurance", "healthcare should remain fixed"],
  ["funeralBurialEstimate", "final expense should remain fixed"],
  ["privateSchoolTuition", "education should remain fixed"],
  ["householdInsurancePremiums", "insurance should remain fixed"],
  ["taxPreparationFees", "tax/legal should remain fixed"],
  ["charitableGiving", "giving should remain fixed"]
].forEach(function (entry) {
  const row = getRow(result, entry[0]);
  assert.equal(row.adjustmentClass, "excludedFromAdjustment", entry[1]);
  assert.equal(row.minimumFloorMode, "notAdjusted", entry[1]);
  assert.equal(row.adjustedMonthlyAmount, row.baselineMonthlyAmount, entry[1]);
  assert.equal(row.monthlyDelta, 0, entry[1]);
  assert.equal(row.graphAdjustable, false, entry[1]);
});

assert.equal(result.adjustedMonthlyTotal, 2850, "top-level adjusted total should sum represented row outputs");
assert.equal(result.monthlyDelta, -920, "negative monthlyDelta should mean lower expenses");
assert.equal(result.totals.totalAdjustedMonthlyExpenses, 2850, "legacy adjusted total alias should remain populated");
assert.equal(result.totals.floorAppliedBucketCount, 2, "Food and household consumables should each have one bucket-level floor applied");

const missingFloorResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(createCompleteInput({
  livingFloorCalculationPreview: {
    buckets: {}
  }
}));
const missingFoodBucket = getBucket(missingFloorResult, "foodAtHomeConsumables");
assert.equal(missingFoodBucket.adjustedMonthlyAmount, 400, "missing Food floor should fall back to ratio floor");
assert.equal(missingFoodBucket.floorApplied, false, "missing Food floor should not be marked applied");
assert.equal(missingFoodBucket.floorSkippedReason, "missing-estimated-dollar-floor-ratio-fallback", "missing Food floor should trace ratio fallback");
assert.equal(getBucket(missingFloorResult, "householdConsumables").adjustedMonthlyAmount, 75, "missing MODEL90 floor should fall back to ratio behavior");
assert.deepEqual(plain(missingFloorResult.trace.floorAppliedBuckets), [], "missing floors should not trace applied floor buckets");
assert.deepEqual(plain(missingFloorResult.trace.missingFloorBuckets), ["foodAtHomeConsumables", "householdConsumables"], "missing floors should trace missing money-floor buckets");
assert.ok(hasIssue(missingFloorResult.warnings, "money-floor-bucket-missing-dollar-floor-ratio-fallback"), "missing floor should warn");
assert.ok(hasIssue(missingFloorResult.dataGaps, "money-floor-bucket-missing-dollar-floor-ratio-fallback"), "missing floor should produce data gap");

const disabledFloorResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(createCompleteInput({
  applyEstimatedDollarFloors: false
}));
const disabledFoodBucket = getBucket(disabledFloorResult, "foodAtHomeConsumables");
assert.equal(disabledFloorResult.trace.estimatedDollarFloorsEnabled, false, "engine should trace disabled dollar floors");
assert.equal(disabledFloorResult.trace.livingFloorCalculationPreviewUsedForDollarFloors, false, "disabled mode should not consume living floor preview for amounts");
assert.equal(disabledFoodBucket.estimatedDollarPlanningFloorMonthly, null, "disabled mode should not expose a bucket dollar floor as applied input");
assert.equal(disabledFoodBucket.adjustedMonthlyAmount, 400, "disabled Food floor should use ratio behavior only");
assert.equal(disabledFoodBucket.floorApplied, false, "disabled Food floor should not be applied");
assert.equal(disabledFoodBucket.floorSkippedReason, "estimated-dollar-floors-disabled-ratio-behavior", "disabled Food floor should trace disabled ratio behavior");
assert.equal(getBucket(disabledFloorResult, "householdConsumables").adjustedMonthlyAmount, 75, "disabled MODEL90 default floor should use ratio behavior only");
assert.deepEqual(plain(disabledFloorResult.trace.floorAppliedBuckets), [], "disabled floors should not trace applied floor buckets");
assert.deepEqual(plain(disabledFloorResult.trace.floorSkippedBuckets), ["foodAtHomeConsumables", "householdConsumables"], "disabled floors should trace skipped money-floor buckets");
assert.deepEqual(plain(disabledFloorResult.trace.missingFloorBuckets), [], "disabled floors should not trace missing assumptions");
assert.equal(hasIssue(disabledFloorResult.dataGaps, "money-floor-bucket-missing-dollar-floor-ratio-fallback"), false, "disabled floors should not be reported as missing floor assumptions");

const positiveResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(createCompleteInput({
  sliderValue: 50
}));
assert.equal(getBucket(positiveResult, "foodAtHomeConsumables").floorApplied, false, "floorApplied should mean floor changed the adjusted amount");
assert.equal(getBucket(positiveResult, "foodAtHomeConsumables").adjustedMonthlyAmount, 840, "positive slider should use elevated row ceilings, not conservative floor movement");
assert.equal(getRow(positiveResult, "diningOutRestaurants").adjustedMonthlyAmount, 330, "ratio-only row should increase toward ceiling on positive slider");
assert.equal(positiveResult.monthlyDelta, 102, "positive monthlyDelta should mean higher expenses");

const partialFloorResult = engineApi.calculateIncomeImpactHouseholdExpenseAdjustments(createCompleteInput({
  sliderValue: -50
}));
assert.equal(getBucket(partialFloorResult, "foodAtHomeConsumables").ratioAdjustedMonthlyAmount, 600, "partial conservative slider should calculate ratio-adjusted amount first");
assert.equal(getBucket(partialFloorResult, "foodAtHomeConsumables").adjustedMonthlyAmount, 600, "bucket floor should not pull partial conservative movement below the ratio-adjusted amount");

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
