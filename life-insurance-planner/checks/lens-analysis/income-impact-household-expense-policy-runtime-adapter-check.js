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
      throw new Error("runtime adapter preview must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("runtime adapter preview must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("runtime adapter preview must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("runtime adapter preview must not read client records directly");
    }
  });
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadAdapterContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function loadScenarioParityContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function hasIssue(list, code) {
  return Array.isArray(list) && list.some(function (issue) {
    return issue.code === code;
  });
}

function getNoticeCodes(result) {
  return (result.readinessNotices.notices || []).map(function (notice) {
    return notice.code;
  });
}

function getWarningCodes(result) {
  return (result.warnings || []).map(function (warning) {
    return warning.code;
  });
}

function getBucket(result, planningBucketKey) {
  const bucket = result.livingFloorCalculationPreview.buckets[planningBucketKey];
  assert.ok(bucket, `${planningBucketKey} floor preview should exist`);
  return bucket;
}

function getProtectedPreview(result, planningBucketKey) {
  const preview = result.protectedExcludedBucketPreview.find(function (bucket) {
    return bucket.planningBucketKey === planningBucketKey;
  });
  assert.ok(preview, `${planningBucketKey} should be represented in protected bucket preview`);
  return preview;
}

function createCompleteLivingFloorAssumptions(overrides) {
  return Object.assign({
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyAmountsByBand: {
        infantToddler: 100,
        youngChild: 200,
        olderChild: 210,
        teenMale: 300,
        teenFemale: 280,
        adultMale: 300,
        adultFemale: 250,
        adultUnknown: 275,
        childUnknown: 190
      },
      householdSizeAdjustmentFactors: {
        "1": 1.1,
        "2": 1.05,
        "3": 1,
        "4": 0.95,
        "5": 0.9,
        "6Plus": 0.85
      }
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 100,
        monthlyPerMemberAmount: 25,
        notes: "Household supplies"
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 80,
        monthlyPerMemberAmount: 10,
        notes: "Connectivity"
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 150,
        monthlyPerAdultDriverAmount: 50,
        notes: "Basic transportation"
      }
    }
  }, overrides || {});
}

function createMarriedFixture(overrides) {
  return Object.assign({
    valuationDate: "2026-01-01",
    adultDriverCount: 1,
    profileRecord: {
      maritalStatus: "Married",
      spouseDateOfBirth: "1986-06-15",
      spouseGender: "female",
      dependentDetails: [
        { id: "young", dateOfBirth: "2018-05-01", sex: "male" },
        { id: "teen", age: 15, sex: "female" }
      ]
    },
    pmiFacts: {}
  }, overrides || {});
}

function createScenarioExpenses() {
  return [
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
      id: "debt-1",
      expenseTypeKey: "autoLoanPayment",
      categoryKey: "debtObligations",
      label: "Auto Loan",
      monthlyAmount: 350,
      sourceOwnedBy: "debtRecords",
      isDebtPaymentExpense: true,
      sourcePath: "fixture.debt"
    }
  ];
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
  assert.equal(status, "", "runtime adapter pass should not touch runtime, display, graph, admin, storage schema, page, or CSS files outside the approved Income Impact plumbing files");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js");
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
    assert.equal(source.includes(forbiddenToken), false, `adapter should not use forbidden token ${forbiddenToken}`);
  });
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadAdapterContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const adapterApi = lensAnalysis.incomeImpactHouseholdExpensePolicyRuntimeAdapter;
assert.ok(adapterApi, "runtime adapter module should load");
assert.equal(adapterApi.ADAPTER_VERSION, 1, "adapter version should be V1");
assert.equal(typeof adapterApi.prepareIncomeImpactHouseholdExpensePolicyPreview, "function", "adapter function should export");

const completeAccountPolicy = {
  version: 1,
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "groceries",
      conservativeFloorRatio: 0.55,
      elevatedCeilingRatio: 1.2
    }
  ],
  graphAdjustmentOverrides: [
    {
      expenseTypeKey: "diningOutRestaurants",
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      source: "ADMIN_ENTERED",
      updatedAt: "2026-01-02T00:00:00.000Z"
    }
  ],
  livingFloorAssumptions: createCompleteLivingFloorAssumptions()
};
const adapterInput = Object.assign(createMarriedFixture(), {
  accountPolicy: clone(completeAccountPolicy)
});
const originalInput = clone(adapterInput);
const completeResult = adapterApi.prepareIncomeImpactHouseholdExpensePolicyPreview(adapterInput);

assert.deepEqual(plain(adapterInput), originalInput, "adapter should not mutate inputs");
assert.deepEqual(
  adapterApi.prepareIncomeImpactHouseholdExpensePolicyPreview(adapterInput),
  completeResult,
  "adapter output should be deterministic"
);
assert.doesNotThrow(() => JSON.stringify(completeResult), "adapter output should be JSON serializable");
assert.equal(completeResult.metadata.activeRuntimeConsumer, false, "adapter should be inactive for runtime");
assert.equal(completeResult.metadata.previewOnly, true, "adapter should identify preview-only output");
assert.equal(completeResult.trace.effectiveConservativeFloorCalculated, false, "adapter should not calculate effective conservative floor");
assert.equal(completeResult.trace.floorsAppliedToGraph, false, "adapter should not apply floors to graph");
assert.equal(completeResult.trace.planningBucketFloorAggregationApplied, false, "adapter should not aggregate/apply planning-bucket floors");
assert.equal(completeResult.trace.perRowFloorApplication, false, "adapter should not include per-row floor application");
assert.equal(completeResult.trace.scenarioHelperCalled, false, "adapter should not call the lifestyle scenario helper");
assert.equal(completeResult.trace.storageTouched, false, "adapter should not touch storage");

assert.ok(Array.isArray(completeResult.resolvedGraphAdjustmentPolicy.rows), "adapter should combine graph policy resolver output");
assert.ok(completeResult.resolvedGraphAdjustmentPolicy.rows.length > 41, "adapter should include inactive non-graph policy rows for protected-bucket preview");
assert.equal(completeResult.resolvedGraphAdjustmentPolicy.metadata.activeRuntimeConsumer, false, "graph policy resolver output should remain inactive");
const groceriesRow = completeResult.resolvedGraphAdjustmentPolicy.rows.find((row) => row.expenseTypeKey === "groceries");
assert.ok(groceriesRow, "resolved graph policy should include groceries");
assert.equal(groceriesRow.conservativeFloorRatio, 0.55, "lifestyle range override should flow into resolved graph policy preview");
const diningRow = completeResult.resolvedGraphAdjustmentPolicy.rows.find((row) => row.expenseTypeKey === "diningOutRestaurants");
assert.ok(diningRow, "resolved graph policy should include dining row");
assert.equal(diningRow.adjustmentClass, "excludedFromAdjustment", "graph adjustment override should flow into resolved graph policy preview");
assert.equal(diningRow.minimumFloorMode, "notAdjusted", "graph adjustment override minimum floor should flow into preview");

assert.equal(completeResult.livingFloorContext.metadata.activeRuntimeConsumer, false, "context resolver output should remain inactive");
assert.equal(Object.prototype.hasOwnProperty.call(completeResult.livingFloorContext, "stateContext"), false, "context resolver output should not include retired state context");
assert.equal(completeResult.livingFloorContext.householdContext.survivingHouseholdMembers, 3, "remaining household should include spouse plus dependents, not one survivor only");
assert.equal(completeResult.livingFloorContext.householdContext.dependentCount, 2, "remaining household should count current dependents");

assert.equal(completeResult.livingFloorCalculationPreview.metadata.activeRuntimeConsumer, false, "living-floor calculation preview should remain inactive");
assert.deepEqual(
  Object.keys(completeResult.livingFloorCalculationPreview.buckets).sort(),
  [
    "communicationsConnectivity",
    "foodAtHomeConsumables",
    "householdConsumables",
    "transportationBasics"
  ],
  "adapter should calculate preview floors only for money-floor buckets"
);
assert.equal(getBucket(completeResult, "foodAtHomeConsumables").floorAmountMonthly, 730, "Food at Home preview should calculate with band counts and household-size factor only");
assert.equal(getBucket(completeResult, "householdConsumables").floorAmountMonthly, 175, "householdConsumables preview should use direct base + per member amounts");
assert.equal(getBucket(completeResult, "communicationsConnectivity").floorAmountMonthly, 110, "communicationsConnectivity preview should use direct base + per member amounts");
assert.equal(getBucket(completeResult, "transportationBasics").floorAmountMonthly, 200, "transportationBasics preview should use direct base + per adult driver amounts");
assert.equal(completeResult.readinessNotices.metadata.activeRuntimeConsumer, false, "readiness notices should remain inactive");
assert.ok(getNoticeCodes(completeResult).includes("livingFloorAssumptionsReady"), "complete preview should include readiness info notice");
assert.equal(hasIssue(completeResult.livingFloorCalculationPreview.buckets, "basicUtilities"), false, "basicUtilities should not be calculated");
assert.equal(completeResult.livingFloorCalculationPreview.buckets.basicUtilities, undefined, "basicUtilities should not have an active floor preview");
assert.equal(completeResult.livingFloorCalculationPreview.buckets.debtObligations, undefined, "debtObligations should not have an active floor preview");

adapterApi.PROTECTED_EXCLUDED_PLANNING_BUCKET_KEYS.forEach(function (planningBucketKey) {
  const preview = getProtectedPreview(completeResult, planningBucketKey);
  assert.equal(preview.activeInPreview, false, `${planningBucketKey} should remain inactive in preview`);
  assert.equal(preview.graphAdjustableRowCount, 0, `${planningBucketKey} should have no graph-adjustable protected rows`);
});

assert.equal(Object.prototype.hasOwnProperty.call(completeResult, "effectiveConservativeFloor"), false, "adapter should not return an active effectiveConservativeFloor value");
assert.equal(Object.prototype.hasOwnProperty.call(completeResult, "appliedRowFloors"), false, "adapter should not return active per-row floor application");

const emptyResult = adapterApi.prepareIncomeImpactHouseholdExpensePolicyPreview(createMarriedFixture({
  accountPolicy: {}
}));
assert.equal(emptyResult.metadata.activeRuntimeConsumer, false, "empty policy preview should still be inactive");
assert.ok(Array.isArray(emptyResult.readinessNotices.notices), "empty policy preview should still build readiness notices");
assert.ok(getWarningCodes(emptyResult).length > 0, "empty policy preview should surface warnings/data gaps without throwing");
assert.ok(getNoticeCodes(emptyResult).includes("foodAtHomeBandValuesMissing"), "empty policy should report missing Food at Home bands");
assert.ok(getNoticeCodes(emptyResult).includes("foodAtHomeHouseholdSizeFactorsMissing"), "empty policy should report missing Food at Home household-size factors");
assert.equal(getBucket(emptyResult, "foodAtHomeConsumables").floorAmountMonthly, null, "incomplete Food at Home assumptions should produce null preview floor");

const singleParentResult = adapterApi.prepareIncomeImpactHouseholdExpensePolicyPreview({
  accountPolicy: completeAccountPolicy,
  valuationDate: "2026-01-01",
  profileRecord: {
    maritalStatus: "Single",
    dependentDetails: [{ age: 8 }]
  }
});
assert.equal(Object.prototype.hasOwnProperty.call(singleParentResult.livingFloorContext, "stateContext"), false, "PMI/profile state should not affect living-floor preview after multiplier retirement");
assert.equal(singleParentResult.livingFloorContext.householdContext.noSurvivingAdultDetected, true, "single parent with dependents should trace no surviving adult");

const accountPolicyContextResult = adapterApi.prepareIncomeImpactHouseholdExpensePolicyPreview(Object.assign(createMarriedFixture(), {
  accountPolicyContext: {
    storageResult: {
      status: "loaded",
      accountPolicy: completeAccountPolicy
    }
  }
}));
assert.equal(accountPolicyContextResult.trace.accountPolicySource, "accountPolicyContext.storageResult.accountPolicy", "adapter should accept current runtime account policy context shape");
assert.equal(accountPolicyContextResult.trace.livingFloorAssumptionsSource, "accountPolicy.livingFloorAssumptions", "adapter should source assumptions from account policy context");
assert.equal(getBucket(accountPolicyContextResult, "foodAtHomeConsumables").floorAmountMonthly, 730, "account policy context assumptions should calculate floor previews");

const parityContext = loadScenarioParityContext();
const scenarioApi = parityContext.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;
const scenarioInput = {
  expenses: createScenarioExpenses(),
  sliderValue: -50,
  householdExpenseStreamPolicyMode: "legacy"
};
const beforeAdapterImport = scenarioApi.calculateIncomeImpactLifestyleScenario(clone(scenarioInput));
[
  "app/features/lens-analysis/household-expense-living-floor-metadata.js",
  "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
  "app/features/lens-analysis/household-expense-living-floor-calculations.js",
  "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
  "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js"
].forEach(function (relativePath) {
  loadScript(parityContext, relativePath);
});
const afterAdapterImport = scenarioApi.calculateIncomeImpactLifestyleScenario(clone(scenarioInput));
assert.deepEqual(afterAdapterImport, beforeAdapterImport, "importing adapter should not change existing Income Impact lifestyle scenario output");
parityContext.LensApp.lensAnalysis.incomeImpactHouseholdExpensePolicyRuntimeAdapter.prepareIncomeImpactHouseholdExpensePolicyPreview({
  accountPolicy: completeAccountPolicy,
  profileRecord: createMarriedFixture().profileRecord,
  pmiFacts: createMarriedFixture().pmiFacts,
  valuationDate: "2026-01-01"
});
const afterAdapterCall = scenarioApi.calculateIncomeImpactLifestyleScenario(clone(scenarioInput));
assert.deepEqual(afterAdapterCall, beforeAdapterImport, "calling adapter should not change existing Income Impact lifestyle scenario output");

console.log("income-impact-household-expense-policy-runtime-adapter-check passed");
