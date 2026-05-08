#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_CLEAN_BUCKET_CANDIDATES = Object.freeze([
  "communicationsConnectivity",
  "householdConsumables",
  "personalLivingClothing",
  "petsDiscretionary",
  "savingsGoalContributions"
]);

const EXPECTED_MIXED_OR_EXCEPTION_BUCKETS = Object.freeze([
  "foodAtHomeConsumables",
  "diningTakeout",
  "transportationBasics",
  "householdServices",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations"
]);

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
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadSummaryContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function clonePlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getBucket(summary, planningBucketKey) {
  const bucket = summary.buckets.find(function (candidate) {
    return candidate.planningBucketKey === planningBucketKey;
  });
  assert.ok(bucket, `${planningBucketKey} bucket summary should exist`);
  return bucket;
}

function assertNoForbiddenDiffs() {
  const forbiddenFiles = [
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/household-expense-compression-calculations.js",
    "app/features/lens-analysis/income-impact-compression-reporting-prep.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/household-expense-account-policy-resolver.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js",
    "app/features/account-settings/household-expense-account-policy-admin-editor.js",
    "app/features/account-settings/household-expense-account-policy-storage.js",
    "pages",
    "app.js",
    "styles.css",
    "app/styles"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(forbiddenFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "runtime, admin, storage, compression, threshold, display, page, and CSS files should not have diffs");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js");
  [
    "require(",
    "import ",
    "localStorage",
    "document.",
    "querySelector",
    "addEventListener",
    "fetch("
  ].forEach(function (forbiddenToken) {
    assert.equal(source.includes(forbiddenToken), false, `summary helper should not use forbidden token ${forbiddenToken}`);
  });
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadSummaryContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const library = lensAnalysis.expenseLibrary;
const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;
const summaryApi = lensAnalysis.householdExpensePlanningBucketPolicySummary;

assert.ok(summaryApi, "planning bucket policy summary API should load");
assert.equal(summaryApi.SUMMARY_VERSION, 1, "summary API should expose version 1");
assert.equal(typeof summaryApi.summarizeHouseholdExpensePlanningBucketPolicy, "function", "summary function should be exported");
assert.equal(typeof lensAnalysis.summarizeHouseholdExpensePlanningBucketPolicy, "function", "legacy direct summary function should be exported");

const libraryRows = library.getExpenseLibraryEntries();
const lifestyleRows = lifestylePolicy.listLifestyleRangePolicies();
const planningBuckets = library.getExpensePlanningBuckets();
const summary = summaryApi.summarizeHouseholdExpensePlanningBucketPolicy();

assert.equal(libraryRows.length, 349, "expense library row count should remain unchanged");
assert.equal(lifestyleRows.length, 86, "lifestyle policy row count should remain unchanged");
assert.equal(lifestyleRows.filter(function (row) { return row.sliderEligible === true; }).length, 41, "slider/admin editable row count should remain unchanged");
assert.equal(summary.lifestylePolicyRowCount, 86, "summary should report current lifestyle row count");
assert.equal(summary.sliderEligibleRowCount, 41, "summary should report current slider row count");

const libraryByType = new Map(libraryRows.map(function (row) {
  return [row.typeKey, row];
}));
const approvedBucketKeys = new Set(library.EXPENSE_PLANNING_BUCKET_KEYS);
lifestyleRows.forEach(function (row) {
  const libraryRow = libraryByType.get(row.expenseTypeKey);
  assert.ok(libraryRow, `${row.expenseTypeKey} lifestyle policy row should resolve to expense library`);
  assert.ok(approvedBucketKeys.has(libraryRow.planningBucketKey), `${row.expenseTypeKey} should resolve to a valid planningBucketKey`);
});
assert.equal(summary.unresolvedLifestylePolicyRows.length, 0, "summary should resolve every lifestyle policy row");

EXPECTED_CLEAN_BUCKET_CANDIDATES.forEach(function (planningBucketKey) {
  const bucket = getBucket(summary, planningBucketKey);
  assert.equal(bucket.cleanBucketCandidate, true, `${planningBucketKey} should be a clean bucket-level candidate`);
  assert.equal(bucket.exceptionCandidates.length, 0, `${planningBucketKey} should not report exception candidates`);
});
assert.deepEqual(
  EXPECTED_CLEAN_BUCKET_CANDIDATES.filter(function (planningBucketKey) {
    return !summary.cleanBucketCandidates.includes(planningBucketKey);
  }),
  [],
  "summary should include expected clean bucket candidates"
);

EXPECTED_MIXED_OR_EXCEPTION_BUCKETS.forEach(function (planningBucketKey) {
  const bucket = getBucket(summary, planningBucketKey);
  assert.equal(
    bucket.cleanBucketCandidate,
    false,
    `${planningBucketKey} should remain mixed or require row-level exception handling`
  );
  assert.ok(
    bucket.distinctRatioSets.length > 1 || bucket.exceptionCandidates.length > 0,
    `${planningBucketKey} should show either multiple ratio sets or exception candidates`
  );
});

const entertainment = getBucket(summary, "entertainmentRecreation");
assert.equal(
  entertainment.exceptionCandidates.some(function (candidate) {
    return candidate.expenseTypeKey === "weddingsFamilyEvents";
  }),
  false,
  "weddingsFamilyEvents should no longer be flagged as lifestyle policy drift"
);

const petsCoreCare = getBucket(summary, "petsCoreCare");
assert.equal(
  petsCoreCare.exceptionCandidates.some(function (candidate) {
    return candidate.expenseTypeKey === "petFoodSupplies";
  }),
  false,
  "petFoodSupplies should no longer be flagged as lifestyle policy drift"
);

const noPolicyBucketKeys = summary.noPolicyRows.map(function (bucket) {
  return bucket.planningBucketKey;
});
[
  "finalExpenses",
  "vehicleOwnershipMaintenance",
  "businessSelfEmployment",
  "financialFeesTransactionCosts",
  "periodicSinkingFundOneTime",
  "customUnknown"
].forEach(function (planningBucketKey) {
  assert.ok(noPolicyBucketKeys.includes(planningBucketKey), `${planningBucketKey} should be reported as noPolicyRows`);
});

const explicitLibraryRows = clonePlainValue(libraryRows);
const explicitLifestyleRows = clonePlainValue(lifestyleRows);
const explicitPlanningBuckets = clonePlainValue(planningBuckets);
const beforeLibraryJson = JSON.stringify(explicitLibraryRows);
const beforeLifestyleJson = JSON.stringify(explicitLifestyleRows);
const beforeBucketJson = JSON.stringify(explicitPlanningBuckets);
const explicitSummary = summaryApi.summarizeHouseholdExpensePlanningBucketPolicy({
  libraryRows: explicitLibraryRows,
  lifestylePolicyRows: explicitLifestyleRows,
  planningBuckets: explicitPlanningBuckets
});

assert.equal(JSON.stringify(explicitLibraryRows), beforeLibraryJson, "summary helper should not mutate libraryRows input");
assert.equal(JSON.stringify(explicitLifestyleRows), beforeLifestyleJson, "summary helper should not mutate lifestylePolicyRows input");
assert.equal(JSON.stringify(explicitPlanningBuckets), beforeBucketJson, "summary helper should not mutate planningBuckets input");
assert.equal(JSON.stringify(explicitSummary), JSON.stringify(summary), "explicit inputs and module defaults should produce the same summary");

const repeatSummary = summaryApi.summarizeHouseholdExpensePlanningBucketPolicy({
  libraryRows: explicitLibraryRows,
  lifestylePolicyRows: explicitLifestyleRows,
  planningBuckets: explicitPlanningBuckets
});
assert.equal(JSON.stringify(repeatSummary), JSON.stringify(explicitSummary), "summary output should be deterministic");
assert.equal(JSON.stringify(JSON.parse(JSON.stringify(summary))), JSON.stringify(summary), "summary output should be JSON serializable");

console.log("household-expense-planning-bucket-policy-summary-check passed");
