#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_MONEY_FLOOR_BUCKETS = Object.freeze([
  "communicationsConnectivity",
  "foodAtHomeConsumables",
  "householdConsumables",
  "transportationBasics"
]);

const EXPECTED_ZERO_FLOOR_RATIO_BUCKETS = Object.freeze([
  "diningTakeout",
  "entertainmentRecreation",
  "petsDiscretionary",
  "savingsGoalContributions",
  "subscriptionsMemberships",
  "travelVacations"
]);

const EXPECTED_RATIO_FLOOR_ONLY_BUCKETS = Object.freeze([
  "householdServices",
  "personalLivingClothing"
]);

const EXPECTED_EXCLUDED_BUCKETS = Object.freeze([
  "basicUtilities",
  "businessSelfEmployment",
  "childcareDependentSupport",
  "customUnknown",
  "debtObligations",
  "educationEnrichment",
  "finalExpenses",
  "financialFeesTransactionCosts",
  "givingCommunity",
  "healthcareCare",
  "housingCore",
  "insurancePremiums",
  "periodicSinkingFundOneTime",
  "petsCoreCare",
  "taxesLegalAdministrative",
  "vehicleOwnershipMaintenance"
]);

const EXPECTED_FOOD_BAND_KEYS = Object.freeze([
  "infantToddler",
  "youngChild",
  "olderChild",
  "teenMale",
  "teenFemale",
  "adultMale",
  "adultFemale",
  "adultUnknown",
  "childUnknown"
]);

const EXPECTED_STATE_SOURCE_PRIORITY = Object.freeze([
  "profileAddressState",
  "pmiIncomeTaxState",
  "accountDefaultState",
  "nationalDefault"
]);

const EXPECTED_TRACE_FIELDS = Object.freeze([
  "profileAddressState",
  "pmiIncomeTaxState",
  "stateUsed",
  "stateSource",
  "stateMismatchWarning",
  "totalCurrentHouseholdMembers",
  "survivingHouseholdMembers",
  "deceasedInsuredCount",
  "householdMemberBandCounts",
  "noSurvivingAdultDetected",
  "missingAgeFallbackUsed",
  "missingSexFallbackUsed",
  "nationalFallbackUsed"
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

function loadContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function assertNoForbiddenDiffs() {
  const forbiddenFiles = [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js",
    "app/features/account-settings",
    "pages",
    "app.js",
    "styles.css",
    "app/styles"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(forbiddenFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim().split(/\r?\n/)
    .filter(Boolean)
    .filter(function (line) {
      return !line.endsWith("app/features/account-settings/household-expense-account-policy-admin-display.js")
        && !line.endsWith("app/features/account-settings/household-expense-account-policy-admin-editor.js")
        && !line.endsWith("app/features/account-settings/household-expense-account-policy-storage.js")
        && !line.endsWith("pages/admin-accounts.html");
    })
    .join("\n");

  assert.equal(status, "", "runtime, normalization, graph/display, policy, compression, unrelated account-settings, non-admin page, and CSS files should not have diffs");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/household-expense-living-floor-metadata.js");
  [
    "require(",
    "import ",
    "localStorage",
    "document.",
    "querySelector",
    "addEventListener",
    "fetch(",
    "XMLHttpRequest"
  ].forEach(function (forbiddenToken) {
    assert.equal(source.includes(forbiddenToken), false, `living-floor metadata should not use forbidden token ${forbiddenToken}`);
  });
}

function metadataByBucket(rows) {
  return new Map(rows.map(function (row) {
    return [row.planningBucketKey, row];
  }));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSortedEqual(actual, expected, message) {
  assert.deepEqual(
    plain(actual.slice().sort()),
    expected.slice().sort(),
    message
  );
}

function assertValidValues(row, api) {
  assert.ok(api.ADJUSTMENT_CLASS_VALUES.includes(row.adjustmentClass), `${row.planningBucketKey} adjustmentClass should be valid`);
  assert.ok(api.MINIMUM_FLOOR_MODE_VALUES.includes(row.minimumFloorMode), `${row.planningBucketKey} minimumFloorMode should be valid`);
  assert.equal(typeof row.benchmarkAvailable, "boolean", `${row.planningBucketKey} benchmarkAvailable should be boolean`);
  assert.ok(api.BENCHMARK_SOURCE_VALUES.includes(row.benchmarkSource), `${row.planningBucketKey} benchmarkSource should be valid`);
  assert.ok(api.BENCHMARK_SOURCE_VALUES.includes(row.floorSource), `${row.planningBucketKey} floorSource should be valid`);
  assert.ok(api.STATE_ADJUSTMENT_SOURCE_VALUES.includes(row.stateAdjustmentSource), `${row.planningBucketKey} stateAdjustmentSource should be valid`);
  assert.equal(typeof row.adminEditable, "boolean", `${row.planningBucketKey} adminEditable should be boolean`);
  assert.equal(typeof row.adminDollarInputsRequired, "boolean", `${row.planningBucketKey} adminDollarInputsRequired should be boolean`);
  assert.ok(api.SOURCE_DATA_STATUS_VALUES.includes(row.sourceDataStatus), `${row.planningBucketKey} sourceDataStatus should be valid`);
  assert.equal(typeof row.usesSurvivingHousehold, "boolean", `${row.planningBucketKey} usesSurvivingHousehold should be boolean`);
  assert.equal(typeof row.notes, "string", `${row.planningBucketKey} notes should be string`);
}

function assertNoConfidenceField(value, pathLabel) {
  if (Array.isArray(value)) {
    value.forEach(function (item, index) {
      assertNoConfidenceField(item, `${pathLabel}[${index}]`);
    });
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.keys(value).forEach(function (key) {
    assert.equal(/confidence/i.test(key), false, `${pathLabel}.${key} should not be a confidence field`);
    assertNoConfidenceField(value[key], `${pathLabel}.${key}`);
  });
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const library = lensAnalysis.expenseLibrary;
const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;
const summaryApi = lensAnalysis.householdExpensePlanningBucketPolicySummary;
const livingFloorApi = lensAnalysis.householdExpenseLivingFloorMetadata;

assert.ok(library, "expense library should load");
assert.ok(lifestylePolicy, "lifestyle policy should load");
assert.ok(summaryApi, "planning bucket policy summary should load");
assert.ok(livingFloorApi, "living-floor metadata should load");
assert.equal(livingFloorApi.LIVING_FLOOR_METADATA_VERSION, 1, "living-floor metadata version should be 1");

const expenseRows = library.getExpenseLibraryEntries();
const planningBuckets = library.getExpensePlanningBuckets();
const lifestyleRows = lifestylePolicy.listLifestyleRangePolicies();
const summary = summaryApi.summarizeHouseholdExpensePlanningBucketPolicy();
const metadataRows = livingFloorApi.getHouseholdExpenseLivingFloorMetadata();
const metadataMap = metadataByBucket(metadataRows);

assert.equal(expenseRows.length, 349, "existing expense-library row count should remain 349");
assert.equal(lifestyleRows.length, 86, "existing lifestyle policy row count should remain 86");
assert.equal(
  lifestyleRows.filter(function (row) {
    return row.sliderEligible === true;
  }).length,
  41,
  "existing slider/admin editable count should remain 41"
);
assert.equal(summary.lifestylePolicyRowCount, 86, "summary helper should still report 86 lifestyle rows");
assert.equal(summary.sliderEligibleRowCount, 41, "summary helper should still report 41 slider/admin editable rows");

assert.equal(metadataRows.length, planningBuckets.length, "every current planning bucket should have living-floor metadata");
planningBuckets.forEach(function (bucket) {
  assert.ok(metadataMap.has(bucket.planningBucketKey), `${bucket.planningBucketKey} should have living-floor metadata`);
});
metadataRows.forEach(function (row) {
  assert.ok(library.EXPENSE_PLANNING_BUCKET_KEYS.includes(row.planningBucketKey), `${row.planningBucketKey} should be a current planning bucket`);
  assertValidValues(row, livingFloorApi);
});

assertNoConfidenceField(metadataRows, "livingFloorMetadata");
assertNoConfidenceField(livingFloorApi.getFoodAtHomeHouseholdMemberBands(), "foodAtHomeBands");
assertNoConfidenceField(livingFloorApi.getHouseholdExpenseLivingFloorHouseholdSizingRule(), "householdSizingRule");

assertSortedEqual(
  metadataRows.filter(function (row) { return row.adjustmentClass === "moneyFloorAdjusted"; }).map(function (row) { return row.planningBucketKey; }),
  EXPECTED_MONEY_FLOOR_BUCKETS,
  "moneyFloorAdjusted buckets should match approved set"
);
EXPECTED_MONEY_FLOOR_BUCKETS.forEach(function (bucketKey) {
  const row = metadataMap.get(bucketKey);
  assert.equal(row.minimumFloorMode, "estimatedDollarFloor", `${bucketKey} should use estimatedDollarFloor`);
  assert.equal(row.benchmarkAvailable, true, `${bucketKey} should have a benchmark available`);
  assert.equal(row.adminEditable, true, `${bucketKey} should be admin editable for future floor controls`);
  assert.equal(row.adminDollarInputsRequired, true, `${bucketKey} should require future admin dollar inputs`);
  assert.equal(row.sourceDataStatus, "notLoaded", `${bucketKey} source data should not be loaded yet`);
  assert.equal(row.usesSurvivingHousehold, true, `${bucketKey} should use surviving household sizing`);
  assert.notEqual(row.benchmarkSource, "NONE", `${bucketKey} should have a benchmark source`);
  assert.notEqual(row.floorSource, "NONE", `${bucketKey} should have a floor source`);
});

const basicUtilities = metadataMap.get("basicUtilities");
assert.equal(basicUtilities.adjustmentClass, "excludedFromAdjustment", "basicUtilities must be excluded from adjustment");
assert.equal(basicUtilities.minimumFloorMode, "notAdjusted", "basicUtilities should not have an active floor mode");
assert.equal(basicUtilities.benchmarkAvailable, true, "basicUtilities can have reference benchmark metadata");
assert.equal(basicUtilities.adminEditable, false, "basicUtilities should not be adjustment editable");

const debtObligations = metadataMap.get("debtObligations");
assert.equal(debtObligations.adjustmentClass, "excludedFromAdjustment", "debtObligations must be excluded from adjustment");
assert.equal(debtObligations.adminEditable, false, "debtObligations must not be admin editable for adjustment");
assert.notEqual(debtObligations.adjustmentClass, "ratioAdjusted", "debtObligations must not be ratio-adjusted");
assert.notEqual(debtObligations.adjustmentClass, "moneyFloorAdjusted", "debtObligations must not be money-floor adjusted");

EXPECTED_ZERO_FLOOR_RATIO_BUCKETS.forEach(function (bucketKey) {
  const row = metadataMap.get(bucketKey);
  assert.equal(row.adjustmentClass, "ratioAdjusted", `${bucketKey} should be ratioAdjusted`);
  assert.equal(row.minimumFloorMode, "zeroFloor", `${bucketKey} should use zeroFloor`);
  assert.equal(row.benchmarkAvailable, false, `${bucketKey} should not have benchmark metadata`);
  assert.equal(row.benchmarkSource, "NONE", `${bucketKey} benchmark source should be NONE`);
  assert.equal(row.floorSource, "NONE", `${bucketKey} floor source should be NONE`);
  assert.equal(row.stateAdjustmentSource, "NONE", `${bucketKey} state adjustment source should be NONE`);
  assert.equal(row.householdSizingMethod, "none", `${bucketKey} should not use household sizing`);
  assert.equal(row.adminEditable, true, `${bucketKey} should be adjustment editable`);
  assert.equal(row.adminDollarInputsRequired, false, `${bucketKey} should not require dollar inputs`);
  assert.equal(row.sourceDataStatus, "notApplicable", `${bucketKey} source data should be notApplicable`);
  assert.equal(row.usesSurvivingHousehold, false, `${bucketKey} should not use surviving household sizing`);
});

EXPECTED_RATIO_FLOOR_ONLY_BUCKETS.forEach(function (bucketKey) {
  const row = metadataMap.get(bucketKey);
  assert.equal(row.adjustmentClass, "ratioAdjusted", `${bucketKey} should be ratioAdjusted`);
  assert.equal(row.minimumFloorMode, "ratioFloorOnly", `${bucketKey} should use ratioFloorOnly`);
  assert.equal(row.adminEditable, true, `${bucketKey} should be adjustment editable`);
  assert.equal(row.adminDollarInputsRequired, false, `${bucketKey} should not require dollar inputs`);
  assert.equal(row.usesSurvivingHousehold, false, `${bucketKey} should not use surviving household sizing`);
});

EXPECTED_EXCLUDED_BUCKETS.forEach(function (bucketKey) {
  const row = metadataMap.get(bucketKey);
  assert.equal(row.adjustmentClass, "excludedFromAdjustment", `${bucketKey} should be excludedFromAdjustment`);
  assert.equal(row.minimumFloorMode, "notAdjusted", `${bucketKey} should use notAdjusted`);
  assert.equal(row.adminEditable, false, `${bucketKey} should not be adjustment editable`);
  assert.equal(row.adminDollarInputsRequired, false, `${bucketKey} should not require adjustment dollar inputs`);
});

const foodAtHome = metadataMap.get("foodAtHomeConsumables");
assert.equal(foodAtHome.householdSizingMethod, "usdaAgeSexBandWeighted", "foodAtHomeConsumables should use USDA age/sex weighted sizing");
assert.equal(foodAtHome.benchmarkSource, "USDA_FOOD_PLAN", "foodAtHomeConsumables should use USDA food plan benchmark");
assert.equal(foodAtHome.floorSource, "USDA_FOOD_PLAN", "foodAtHomeConsumables floor source should be USDA food plan");
assert.equal(foodAtHome.stateAdjustmentSource, "BEA_RPP_ADJUSTED", "foodAtHomeConsumables should use BEA state adjustment metadata");
assert.equal(foodAtHome.sourceDataStatus, "notLoaded", "foodAtHomeConsumables source data should not be loaded");
assert.equal(foodAtHome.adminDollarInputsRequired, true, "foodAtHomeConsumables should require future admin dollar inputs");

const bands = livingFloorApi.getFoodAtHomeHouseholdMemberBands();
assert.deepEqual(
  plain(bands.map(function (band) { return band.bandKey; })),
  EXPECTED_FOOD_BAND_KEYS,
  "food-at-home bands should use the approved band keys in order"
);
assert.deepEqual(plain(bands[0]), { bandKey: "infantToddler", minAge: 0, maxAge: 3, sex: "any" }, "infantToddler band should cover ages 0-3");
assert.deepEqual(plain(bands[1]), { bandKey: "youngChild", minAge: 4, maxAge: 8, sex: "any" }, "youngChild band should cover ages 4-8");
assert.deepEqual(plain(bands[2]), { bandKey: "olderChild", minAge: 9, maxAge: 13, sex: "any" }, "olderChild band should cover ages 9-13");
assert.deepEqual(plain(bands[3]), { bandKey: "teenMale", minAge: 14, maxAge: 18, sex: "male" }, "teenMale band should cover ages 14-18 male");
assert.deepEqual(plain(bands[4]), { bandKey: "teenFemale", minAge: 14, maxAge: 18, sex: "female" }, "teenFemale band should cover ages 14-18 female");
assert.deepEqual(plain(bands[5]), { bandKey: "adultMale", minAge: 19, maxAge: null, sex: "male" }, "adultMale band should cover ages 19+ male");
assert.deepEqual(plain(bands[6]), { bandKey: "adultFemale", minAge: 19, maxAge: null, sex: "female" }, "adultFemale band should cover ages 19+ female");
assert.deepEqual(plain(bands[7]), { bandKey: "adultUnknown", minAge: 19, maxAge: null, sex: "unknown" }, "adultUnknown band should cover ages 19+ unknown sex");
assert.deepEqual(plain(bands[8]), { bandKey: "childUnknown", minAge: 0, maxAge: 18, sex: "unknown" }, "childUnknown band should cover under-19 fallback");

assert.deepEqual(
  plain(livingFloorApi.getHouseholdExpenseLivingFloorStateSourcePriority()),
  EXPECTED_STATE_SOURCE_PRIORITY,
  "state source priority should prefer profile address, then PMI income/tax, then account default, then national default"
);

const sizingRule = livingFloorApi.getHouseholdExpenseLivingFloorHouseholdSizingRule();
assert.equal(sizingRule.householdSizingRuleKey, "remainingHouseholdAfterInsuredDeath", "household sizing should use remaining-household rule");
assert.equal(sizingRule.remainingHouseholdMembersFormula, "currentHouseholdMembers - deceasedInsured", "household sizing formula should remove deceased insured");
assert.equal(sizingRule.deceasedInsuredCountDefault, 1, "household sizing should default to one deceased insured");
assert.equal(sizingRule.defaultDeceasedInsuredIdentity, "client", "client should be default deceased insured identity");
assert.equal(sizingRule.assumeClientIsDeceasedInsuredUnlessScenarioDataIdentifiesAnotherInsured, true, "client should be assumed deceased unless scenario data says otherwise");
assert.equal(sizingRule.includeSurvivingSpousePartnerIfPresent, true, "sizing should include surviving spouse/partner if present");
assert.equal(sizingRule.includeCurrentDependents, true, "sizing should include current dependents");
assert.equal(sizingRule.includeProjectedFutureDependents, false, "sizing should exclude projected/future dependents");
assert.equal(sizingRule.survivingHouseholdSizeMinimum, 1, "surviving household size should clamp to at least one");
assert.equal(sizingRule.noSurvivingAdultDependentFallback, "safeAdultEquivalent", "dependent-only surviving household should use safe adult-equivalent fallback");

assert.deepEqual(
  plain(livingFloorApi.getHouseholdExpenseLivingFloorTraceFields()),
  EXPECTED_TRACE_FIELDS,
  "living-floor trace fields should match approved future trace fields"
);

const serializedA = JSON.stringify({
  metadataRows,
  bands,
  stateSourcePriority: livingFloorApi.getHouseholdExpenseLivingFloorStateSourcePriority(),
  sizingRule,
  traceFields: livingFloorApi.getHouseholdExpenseLivingFloorTraceFields()
});
const serializedB = JSON.stringify({
  metadataRows: livingFloorApi.getHouseholdExpenseLivingFloorMetadata(),
  bands: livingFloorApi.getFoodAtHomeHouseholdMemberBands(),
  stateSourcePriority: livingFloorApi.getHouseholdExpenseLivingFloorStateSourcePriority(),
  sizingRule: livingFloorApi.getHouseholdExpenseLivingFloorHouseholdSizingRule(),
  traceFields: livingFloorApi.getHouseholdExpenseLivingFloorTraceFields()
});
assert.equal(serializedA, serializedB, "living-floor metadata output should be deterministic");
assert.deepEqual(JSON.parse(serializedA), JSON.parse(serializedB), "living-floor metadata should be JSON-serializable");

console.log("household-expense-living-floor-metadata-check passed");
