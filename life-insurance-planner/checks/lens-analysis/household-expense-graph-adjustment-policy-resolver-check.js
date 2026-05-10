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
      throw new Error("graph adjustment preview resolver must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("graph adjustment preview resolver must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("graph adjustment preview resolver must not read the DOM");
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
  [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js"
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

function getRow(result, expenseTypeKey) {
  const row = result.rows.find(function (candidate) {
    return candidate.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(row, `${expenseTypeKey} should resolve`);
  return row;
}

function hasIssue(list, code) {
  return Array.isArray(list) && list.some(function (issue) {
    return issue.code === code;
  });
}

function createCompleteFoodAtHomeAssumptions(overrides) {
  return Object.assign({
    planningBucketKey: "foodAtHomeConsumables",
    source: "ADMIN_ENTERED",
    sourcePeriod: "2026",
    monthlyAmountsByBand: {
      infantToddler: 180,
      youngChild: 225,
      olderChild: 285,
      teenMale: 355,
      teenFemale: 315,
      adultMale: 390,
      adultFemale: 345,
      adultUnknown: 365,
      childUnknown: 265
    },
    householdSizeAdjustmentFactors: {
      "1": 1.2,
      "2": 1,
      "3": 0.95,
      "4": 0.9,
      "5": 0.85,
      "6Plus": 0.8
    }
  }, overrides || {});
}

function createCompleteLivingFloorAssumptions(overrides) {
  return Object.assign({
    version: 1,
    foodAtHome: createCompleteFoodAtHomeAssumptions(),
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        monthlyBaseAmount: 120,
        monthlyPerMemberAmount: 40
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        monthlyBaseAmount: 95,
        monthlyPerMemberAmount: 15
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        monthlyBaseAmount: 160,
        monthlyPerAdultDriverAmount: 80
      }
    }
  }, overrides || {});
}

function createBlankLivingFloorAssumptions() {
  return {
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: null,
      monthlyAmountsByBand: {
        infantToddler: null,
        youngChild: null,
        olderChild: null,
        teenMale: null,
        teenFemale: null,
        adultMale: null,
        adultFemale: null,
        adultUnknown: null,
        childUnknown: null
      },
      householdSizeAdjustmentFactors: {
        "1": null,
        "2": null,
        "3": null,
        "4": null,
        "5": null,
        "6Plus": null
      }
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        monthlyBaseAmount: null,
        monthlyPerMemberAmount: null
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        monthlyBaseAmount: null,
        monthlyPerMemberAmount: null
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        monthlyBaseAmount: null,
        monthlyPerAdultDriverAmount: null
      }
    }
  };
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
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "pages",
    "app.js",
    "styles.css"
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
  assert.equal(status, "", "graph adjustment preview resolver pass should not touch runtime/admin/storage/schema/page/CSS files outside the approved Income Impact plumbing files");
}

const resolverSource = readRepoFile("app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js");
assert.doesNotMatch(resolverSource, /localStorage|sessionStorage|document|querySelector|addEventListener/);
assert.doesNotMatch(
  resolverSource,
  /income-impact-lifestyle-scenario-calculations|income-loss-impact-display|timeline-graph|normalize-lens-model|pmi-expense-records|saveHouseholdExpenseAccountPolicy|household-expense-account-policy-storage|admin-editor|admin-display/
);

const context = loadContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const resolver = lensAnalysis.householdExpenseGraphAdjustmentPolicyResolver;
assert.ok(resolver, "graph adjustment policy resolver module should load");
assert.equal(typeof resolver.resolveHouseholdExpenseGraphAdjustmentPolicy, "function", "resolver function should export");
assert.equal(resolver.HOUSEHOLD_EXPENSE_GRAPH_ADJUSTMENT_POLICY_RESOLVER_VERSION, 1, "resolver version should be V1");
assert.deepEqual(plain(resolver.ADJUSTMENT_CLASS_VALUES), [
  "moneyFloorAdjusted",
  "ratioAdjusted",
  "excludedFromAdjustment"
], "resolver should expose valid adjustment classes");
assert.deepEqual(plain(resolver.MINIMUM_FLOOR_MODE_VALUES), [
  "estimatedDollarFloor",
  "zeroFloor",
  "ratioFloorOnly",
  "notAdjusted"
], "resolver should expose valid minimum floor modes");

const expenseLibraryRows = lensAnalysis.expenseLibrary.getExpenseLibraryEntries();
const lifestylePolicyRows = lensAnalysis.householdExpenseLifestyleRangePolicy.listLifestyleRangePolicies();
const livingFloorMetadata = lensAnalysis.householdExpenseLivingFloorMetadata.getHouseholdExpenseLivingFloorMetadata();
const explicitInput = {
  expenseLibraryRows: clone(expenseLibraryRows),
  lifestylePolicyRows: clone(lifestylePolicyRows),
  livingFloorMetadata: clone(livingFloorMetadata),
  accountPolicy: {
    version: 1,
    lifestyleRangeOverrides: [],
    graphAdjustmentOverrides: [],
    livingFloorAssumptions: {}
  }
};
const originalInput = clone(explicitInput);
const defaultResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy(explicitInput);
assert.deepEqual(plain(explicitInput), originalInput, "resolver should not mutate explicit input");
assert.deepEqual(
  resolver.resolveHouseholdExpenseGraphAdjustmentPolicy(explicitInput),
  defaultResult,
  "resolver output should be deterministic"
);
assert.doesNotThrow(() => JSON.stringify(defaultResult), "resolver output should be JSON serializable");
assert.equal(defaultResult.metadata.activeRuntimeConsumer, false, "preview resolver should be inactive for runtime");
assert.equal(defaultResult.metadata.duplicateOverridePolicy, "lastValidWins", "duplicate graph overrides should be documented as last-valid-wins");
assert.equal(defaultResult.rows.length, 41, "default preview should resolve the 41 graph-affecting rows");
assert.equal(defaultResult.counts.totalRows, 41, "counts should include 41 preview rows");
assert.equal(defaultResult.counts.graphRows, 41, "counts should identify 41 graph rows");

const groceries = getRow(defaultResult, "groceries");
assert.equal(groceries.planningBucketKey, "foodAtHomeConsumables", "groceries should resolve to Food at Home planning bucket");
assert.equal(groceries.adjustmentClass, "moneyFloorAdjusted", "food-at-home rows should default to money-floor adjusted");
assert.equal(groceries.minimumFloorMode, "estimatedDollarFloor", "food-at-home rows should default to estimated dollar floor");
assert.equal(groceries.floorSourceLabel, "Food at Home model / USDA Food Plan", "food-at-home rows should show USDA floor source label");
assert.equal(groceries.floorSourceStatus, "notConfigured", "empty Food at Home assumptions should be not configured");
assert.equal(groceries.graphAdjustable, true, "default graph rows should be graph adjustable");
assert.equal(groceries.sourceTrace.adjustmentClassSource, "livingFloorMetadata", "default adjustment source should be living-floor metadata");
assert.equal(groceries.sourceTrace.ratioSource, "seedLifestylePolicy", "default ratio source should be seed policy");

const householdConsumables = getRow(defaultResult, "householdConsumablesSupplies");
assert.equal(householdConsumables.adjustmentClass, "moneyFloorAdjusted", "household consumables should default to money-floor adjusted");
assert.equal(householdConsumables.floorSourceLabel, "MODEL90 default floor", "household consumables should use MODEL90 default floor source");
assert.equal(householdConsumables.floorSourceStatus, "notConfigured", "empty MODEL90 default assumptions should be not configured");

const blankShellResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    livingFloorAssumptions: createBlankLivingFloorAssumptions()
  }
});
assert.equal(
  getRow(blankShellResult, "groceries").floorSourceStatus,
  "notConfigured",
  "blank storage-shell Food at Home null values should be notConfigured"
);
assert.equal(
  getRow(blankShellResult, "householdConsumablesSupplies").floorSourceStatus,
  "notConfigured",
  "blank storage-shell MODEL90 null values should be notConfigured"
);

const internet = getRow(defaultResult, "internet");
assert.equal(internet.floorSourceLabel, "MODEL90 default floor", "communications rows should use MODEL90 default floor source");

const fuel = getRow(defaultResult, "fuel");
assert.equal(fuel.floorSourceLabel, "MODEL90 default floor", "transportation basics rows should use MODEL90 default floor source");

const diningTakeout = getRow(defaultResult, "diningTakeout");
assert.equal(diningTakeout.adjustmentClass, "ratioAdjusted", "dining/takeout should default to ratio adjusted");
assert.equal(diningTakeout.minimumFloorMode, "zeroFloor", "dining/takeout should default to zero floor");
assert.equal(diningTakeout.floorSourceLabel, "$0 floor / no dollar source", "zero-floor rows should show $0 source label");
assert.equal(diningTakeout.floorSourceStatus, "notApplicable", "zero-floor rows should have notApplicable source status");

const householdServices = getRow(defaultResult, "householdServices");
assert.equal(householdServices.adjustmentClass, "ratioAdjusted", "household services should default to ratio adjusted");
assert.equal(householdServices.minimumFloorMode, "ratioFloorOnly", "household services should default to ratio floor only");
assert.equal(householdServices.floorSourceLabel, "Ratio floor only / no dollar source", "ratio-floor-only rows should show ratio floor label");

const savings = getRow(defaultResult, "emergencyFundContributions");
assert.equal(savings.planningBucketKey, "savingsGoalContributions", "savings rows should resolve to savings goal bucket");
assert.equal(savings.floorSourceLabel, "Pauseable / $0 floor", "pauseable savings rows should show pauseable zero-floor label");

const overrideResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    version: 1,
    graphAdjustmentOverrides: [{
      expenseTypeKey: "groceries",
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      source: "ADMIN_ENTERED",
      updatedAt: "2026-05-09T00:00:00.000Z"
    }],
    lifestyleRangeOverrides: [{
      expenseTypeKey: "groceries",
      conservativeFloorRatio: 0.73,
      elevatedCeilingRatio: 1.22
    }],
    livingFloorAssumptions: createCompleteLivingFloorAssumptions()
  }
});
const overriddenGroceries = getRow(overrideResult, "groceries");
assert.equal(overriddenGroceries.adjustmentClass, "excludedFromAdjustment", "graph override should override adjustment class");
assert.equal(overriddenGroceries.minimumFloorMode, "notAdjusted", "excluded graph override should resolve notAdjusted mode");
assert.equal(overriddenGroceries.conservativeFloorRatio, 0.73, "ratio override should coexist with graph adjustment override");
assert.equal(overriddenGroceries.elevatedCeilingRatio, 1.22, "ratio override should preserve elevated ceiling");
assert.equal(overriddenGroceries.floorSourceLabel, "Not adjusted", "excluded override should report not adjusted");
assert.equal(overriddenGroceries.floorSourceStatus, "notApplicable", "excluded override should not report dollar source status");
assert.equal(overriddenGroceries.graphAdjustable, false, "excluded override should not be graph adjustable");
assert.equal(overriddenGroceries.sourceTrace.adjustmentClassSource, "graphAdjustmentOverrides", "graph override should be traced");
assert.equal(overriddenGroceries.sourceTrace.ratioSource, "lifestyleRangeOverrides", "ratio override should be traced");

const invalidOverrideResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    graphAdjustmentOverrides: [
      { expenseTypeKey: "groceries", adjustmentClass: "reviewOnly", minimumFloorMode: "notAdjusted" },
      { expenseTypeKey: "notASeedRow", adjustmentClass: "excludedFromAdjustment", minimumFloorMode: "notAdjusted" }
    ]
  }
});
assert.equal(getRow(invalidOverrideResult, "groceries").adjustmentClass, "moneyFloorAdjusted", "invalid graph override should leave seed adjustment class intact");
assert.ok(hasIssue(invalidOverrideResult.warnings, "invalid-graph-adjustment-class"), "invalid graph override should warn");
assert.ok(hasIssue(invalidOverrideResult.warnings, "unknown-graph-adjustment-expense-type-key"), "unknown graph override should warn");

const duplicateOverrideResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    graphAdjustmentOverrides: [
      { expenseTypeKey: "diningTakeout", adjustmentClass: "excludedFromAdjustment", minimumFloorMode: "notAdjusted" },
      { expenseTypeKey: "diningTakeout", adjustmentClass: "moneyFloorAdjusted", minimumFloorMode: "estimatedDollarFloor" }
    ]
  }
});
assert.equal(getRow(duplicateOverrideResult, "diningTakeout").adjustmentClass, "moneyFloorAdjusted", "duplicate graph overrides should use last valid row");
assert.equal(getRow(duplicateOverrideResult, "diningTakeout").minimumFloorMode, "estimatedDollarFloor", "last valid duplicate should drive minimum floor mode");
assert.ok(hasIssue(duplicateOverrideResult.warnings, "duplicate-graph-adjustment-override"), "duplicate graph overrides should warn");

const lockedOverrideResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    graphAdjustmentOverrides: [{
      expenseTypeKey: "federalStateLocalIncomeTaxPayments",
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor"
    }]
  },
  includeOnlyGraphRows: false
});
const lockedTaxes = getRow(lockedOverrideResult, "federalStateLocalIncomeTaxPayments");
assert.equal(lockedTaxes.adjustmentClass, "excludedFromAdjustment", "locked/protected rows should ignore graph adjustment overrides");
assert.equal(lockedTaxes.minimumFloorMode, "notAdjusted", "locked/protected rows should remain notAdjusted after ignored override");
assert.equal(lockedTaxes.floorSourceLabel, "Not adjusted", "locked/protected rows should continue to report not adjusted");
assert.equal(lockedTaxes.graphAdjustable, false, "locked/protected rows should remain non-adjustable");
assert.ok(hasIssue(lockedOverrideResult.warnings, "locked-graph-adjustment-override"), "locked graph override should warn");

const partialFoodResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    livingFloorAssumptions: {
      foodAtHome: {
        monthlyAmountsByBand: { infantToddler: 100 },
        householdSizeAdjustmentFactors: {}
      }
    }
  }
});
assert.equal(getRow(partialFoodResult, "groceries").floorSourceStatus, "partiallyConfigured", "partial Food at Home assumptions should be partiallyConfigured");

const completeFoodResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    livingFloorAssumptions: createCompleteLivingFloorAssumptions()
  }
});
assert.equal(getRow(completeFoodResult, "groceries").floorSourceStatus, "configured", "complete Food at Home assumptions should be configured");
assert.equal(getRow(completeFoodResult, "householdConsumablesSupplies").floorSourceStatus, "configured", "complete MODEL90 household consumables assumptions should be configured");
assert.equal(getRow(completeFoodResult, "internet").floorSourceStatus, "configured", "complete MODEL90 communications assumptions should be configured");
assert.equal(getRow(completeFoodResult, "fuel").floorSourceStatus, "configured", "complete MODEL90 transportation assumptions should be configured");

const partialModel90Result = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {
    livingFloorAssumptions: {
      model90DefaultBucketFloors: {
        householdConsumables: { monthlyBaseAmount: 120 }
      }
    }
  }
});
assert.equal(getRow(partialModel90Result, "householdConsumablesSupplies").floorSourceStatus, "partiallyConfigured", "partial MODEL90 bucket assumptions should be partiallyConfigured");

const allRowsResult = resolver.resolveHouseholdExpenseGraphAdjustmentPolicy({
  expenseLibraryRows,
  lifestylePolicyRows,
  livingFloorMetadata,
  accountPolicy: {},
  includeOnlyGraphRows: false
});
assert.ok(allRowsResult.rows.length > 41, "includeOnlyGraphRows false should include locked/excluded rows");
const taxes = getRow(allRowsResult, "federalStateLocalIncomeTaxPayments");
assert.equal(taxes.adjustmentClass, "excludedFromAdjustment", "excluded rows should resolve excluded adjustment class");
assert.equal(taxes.minimumFloorMode, "notAdjusted", "excluded rows should resolve notAdjusted mode");
assert.equal(taxes.floorSourceLabel, "Not adjusted", "excluded rows should report not adjusted");
assert.equal(taxes.graphAdjustable, false, "excluded rows should not be graph adjustable");

assertNoForbiddenDiffs();

console.log("household-expense-graph-adjustment-policy-resolver-check passed");
