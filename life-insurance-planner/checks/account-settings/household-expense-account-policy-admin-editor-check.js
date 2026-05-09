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

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function assertScriptOrder(scriptSources, orderedScripts) {
  let lastIndex = -1;
  orderedScripts.forEach(function (scriptPath) {
    const index = scriptSources.indexOf(scriptPath);
    assert.ok(index >= 0, `${scriptPath} should be loaded`);
    assert.ok(index > lastIndex, `${scriptPath} should load after the previous script`);
    lastIndex = index;
  });
}

function createFakeStorage() {
  const values = new Map();
  const writes = [];
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      writes.push({ op: "setItem", key: String(key) });
      values.set(key, String(value));
    },
    removeItem(key) {
      writes.push({ op: "removeItem", key: String(key) });
      values.delete(key);
    },
    setRaw(key, value) {
      values.set(key, String(value));
    },
    getWrites() {
      return writes.slice();
    }
  };
}

function loadScript(context, relativePath) {
  const source = readRepoFile(relativePath);
  vm.runInContext(source, context, { filename: relativePath });
  return source;
}

function draftRowsFromModel(model, overrideByType) {
  const overrides = overrideByType || {};
  return model.rows.map(function (row) {
    const override = overrides[row.expenseTypeKey] || {};
    return {
      expenseTypeKey: row.expenseTypeKey,
      conservativeFloorRatio: Object.prototype.hasOwnProperty.call(override, "conservativeFloorRatio")
        ? override.conservativeFloorRatio
        : row.defaultConservativeFloorRatio,
      elevatedCeilingRatio: Object.prototype.hasOwnProperty.call(override, "elevatedCeilingRatio")
        ? override.elevatedCeilingRatio
        : row.defaultElevatedCeilingRatio
    };
  });
}

function draftGraphAdjustmentRowsFromModel(model, overrideByType) {
  const overrides = overrideByType || {};
  return model.rows.map(function (row) {
    const override = overrides[row.expenseTypeKey] || {};
    return {
      expenseTypeKey: row.expenseTypeKey,
      adjustmentClass: Object.prototype.hasOwnProperty.call(override, "adjustmentClass")
        ? override.adjustmentClass
        : row.adjustmentClass,
      minimumFloorMode: Object.prototype.hasOwnProperty.call(override, "minimumFloorMode")
        ? override.minimumFloorMode
        : row.minimumFloorMode,
      source: Object.prototype.hasOwnProperty.call(override, "source")
        ? override.source
        : "ADMIN_ENTERED"
    };
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFoodAtHomeDraft(overrides) {
  return {
    source: "USDA_FOOD_PLAN",
    sourcePeriod: "2026-01",
    monthlyAmountsByBand: Object.assign({
      infantToddler: "180",
      youngChild: "225",
      olderChild: "285",
      teenMale: "355",
      teenFemale: "315",
      adultMale: "390",
      adultFemale: "345",
      adultUnknown: "365",
      childUnknown: "265"
    }, overrides?.monthlyAmountsByBand || {}),
    householdSizeAdjustmentFactors: Object.assign({
      "1": "1.2",
      "2": "1",
      "3": "0.95",
      "4": "0.9",
      "5": "0.85",
      "6Plus": "0.8"
    }, overrides?.householdSizeAdjustmentFactors || {})
  };
}

function buildStateCostAdjustmentMultiplierDraft(overrides) {
  const options = overrides || {};
  return {
    defaultMultiplier: Object.prototype.hasOwnProperty.call(options, "defaultMultiplier")
      ? options.defaultMultiplier
      : "1.05",
    globalStateRows: Object.prototype.hasOwnProperty.call(options, "globalStateRows")
      ? options.globalStateRows
      : [{
        stateCode: "co",
        multiplier: "1.08",
        source: "",
        sourcePeriod: "2026",
        notes: "Colorado admin assumption"
      }]
  };
}

function buildModel90DefaultBucketFloorsDraft(overrides) {
  return Object.assign({
    householdConsumables: {
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: "120",
      monthlyPerMemberAmount: "40",
      stateAdjustmentEnabled: true,
      notes: "Household supply default"
    },
    communicationsConnectivity: {
      source: "",
      sourcePeriod: "2026",
      monthlyBaseAmount: "95",
      monthlyPerMemberAmount: "15",
      stateAdjustmentEnabled: false,
      notes: ""
    },
    transportationBasics: {
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: "160",
      monthlyPerAdultDriverAmount: "80",
      stateAdjustmentEnabled: true,
      notes: "Driver weighted"
    }
  }, overrides || {});
}

const preservedLivingFloorAssumptions = {
  version: 1,
  foodAtHome: {
    planningBucketKey: "foodAtHomeConsumables",
    source: "USDA_FOOD_PLAN",
    sourcePeriod: "2026",
    monthlyAmountsByBand: {
      infantToddler: 180,
      youngChild: 225,
      olderChild: 285,
      teenMale: 355,
      teenFemale: 315,
      adultMale: 390,
      adultFemale: 345,
      adultUnknown: null,
      childUnknown: null
    },
    householdSizeAdjustmentFactors: {
      "1": 1.2,
      "2": 1,
      "3": 0.95,
      "4": 0.9,
      "5": 0.85,
      "6Plus": 0.8
    }
  },
  stateCostAdjustmentMultipliers: {
    version: 1,
    appliesToAdjustmentClass: "moneyFloorAdjusted",
    defaultMultiplier: 1,
    globalStateAdjustmentMultipliersByState: {
      CO: {
        multiplier: 1.08,
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        notes: null
      }
    },
    bucketStateAdjustmentMultipliers: {
      transportationBasics: {
        CO: {
          multiplier: 1.12,
          source: "ADMIN_ENTERED",
          sourcePeriod: "2026",
          notes: "Preserved bucket-specific draft"
        }
      }
    }
  },
  model90DefaultBucketFloors: {
    householdConsumables: {
      planningBucketKey: "householdConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 110,
      monthlyPerMemberAmount: 35,
      stateAdjustmentEnabled: true,
      notes: null
    },
    communicationsConnectivity: {
      planningBucketKey: "communicationsConnectivity",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 95,
      monthlyPerMemberAmount: 12,
      stateAdjustmentEnabled: true,
      notes: null
    },
    transportationBasics: {
      planningBucketKey: "transportationBasics",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 125,
      monthlyPerAdultDriverAmount: 75,
      stateAdjustmentEnabled: true,
      notes: null
    }
  }
};

const pageSource = readRepoFile("pages/admin-accounts.html");
const editorSource = readRepoFile("app/features/account-settings/household-expense-account-policy-admin-editor.js");
const scripts = getScriptSources(pageSource);
const policyPanelMatch = pageSource.match(/<section class="admin-accounts-panel" data-household-expense-account-policy-panel>[\s\S]*?<\/section>/);

assert.ok(policyPanelMatch, "household expense policy panel should exist");
assert.match(policyPanelMatch[0], /data-household-expense-account-policy-editor/);
assertScriptOrder(scripts, [
  "../app/features/account-settings/household-expense-account-policy-storage.js",
  "../app/features/lens-analysis/expense-taxonomy.js",
  "../app/features/lens-analysis/expense-library.js",
  "../app/features/lens-analysis/expense-compression-thresholds.js",
  "../app/features/lens-analysis/household-expense-compression-policy.js",
  "../app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
  "../app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js",
  "../app/features/lens-analysis/household-expense-living-floor-metadata.js",
  "../app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
  "../app/features/lens-analysis/household-expense-account-policy-resolver.js",
  "../app/features/account-settings/household-expense-account-policy-admin-display.js",
  "../app/features/account-settings/household-expense-account-policy-admin-editor.js"
]);

assert.match(editorSource, /householdExpenseAccountPolicyStorage/);
assert.match(editorSource, /householdExpenseAccountPolicyResolver/);
assert.match(editorSource, /householdExpenseGraphAdjustmentPolicyResolver/);
assert.match(editorSource, /resolveHouseholdExpenseGraphAdjustmentPolicy/);
assert.match(editorSource, /TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID/);
assert.match(editorSource, /temporaryLocalAdminFallback/);
assert.match(editorSource, /"livingFloorAssumptions\.foodAtHome"/);
assert.match(editorSource, /"livingFloorAssumptions\.stateCostAdjustmentMultipliers"/);
assert.match(editorSource, /"foodAtHome\.monthlyAmountsByBand"/);
assert.match(editorSource, /"foodAtHome\.householdSizeAdjustmentFactors"/);
assert.match(editorSource, /"stateCostAdjustmentMultipliers\.defaultMultiplier"/);
assert.match(editorSource, /"stateCostAdjustmentMultipliers\.globalStateAdjustmentMultipliersByState"/);
assert.match(editorSource, /"model90DefaultBucketFloors\.monthlyBaseAmount"/);
assert.match(editorSource, /"model90DefaultBucketFloors\.monthlyPerMemberAmount"/);
assert.match(editorSource, /"model90DefaultBucketFloors\.monthlyPerAdultDriverAmount"/);
assert.match(editorSource, /"model90DefaultBucketFloors\.stateAdjustmentEnabled"/);
assert.match(editorSource, /saveHouseholdExpenseAccountPolicy/);
assert.match(editorSource, /initializeHouseholdExpenseAccountPolicyAdminDisplay/);
assert.match(editorSource, /data-food-at-home-floor-save/);
assert.match(editorSource, /data-food-at-home-floor-reset/);
assert.match(editorSource, /data-state-cost-adjustment-multipliers-editor/);
assert.match(editorSource, /data-state-cost-adjustment-default-multiplier/);
assert.match(editorSource, /data-state-cost-adjustment-add-row/);
assert.match(editorSource, /data-state-cost-adjustment-save/);
assert.match(editorSource, /data-state-cost-adjustment-reset/);
assert.match(editorSource, /data-model90-default-bucket-floors-editor/);
assert.match(editorSource, /data-model90-default-bucket-floors-save/);
assert.match(editorSource, /data-model90-default-bucket-floors-reset/);
assert.match(editorSource, /data-model90-default-bucket-floor-monthly-base-amount/);
assert.match(editorSource, /data-model90-default-bucket-floor-per-unit-amount/);
assert.match(editorSource, /"graphAdjustmentOverrides"/);
assert.match(editorSource, /data-graph-adjustment-type-input/);
assert.match(editorSource, /data-graph-adjustment-save/);
assert.match(editorSource, /data-graph-adjustment-reset-row/);
assert.match(editorSource, /buildGraphAdjustmentSavePayload/);
assert.doesNotMatch(
  editorSource,
  /removeHouseholdExpenseAccountPolicy|\.setItem\s*\(|\.removeItem\s*\(|analysisSettings|clientRecords|profileRecord|updateClientRecord|saveAnalysisSetupSettings/
);
assert.doesNotMatch(
  editorSource,
  /income-loss-impact-display|timeline-graph|graph-model|Layer 5|normalize-lens-model|formulas|methods|app\.js|styles\.css|components\.css/
);
assert.doesNotMatch(
  editorSource,
  /data-state-cost-adjustment-multiplier-input|data-bucket-state-adjustment-multiplier-input/
);
assert.doesNotMatch(
  editorSource,
  /function formatMinimumFloorDisplay\(|function formatFloorStatusDisplay\(|function buildPlanningContextForPolicy\(/,
  "admin editor should not keep duplicated local floor/status policy mapping"
);

const host = {
  innerHTML: "",
  dataset: {},
  addEventListener(type, handler) {
    this.listenerType = type;
    this.listener = handler;
  }
};
const context = {
  console,
  document: {
    addEventListener() {},
    querySelector(selector) {
      return selector === "[data-household-expense-account-policy-editor]" ? host : null;
    }
  },
  localStorage: createFakeStorage(),
  LensApp: {
    accountSettings: {},
    lensAnalysis: {}
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

loadScript(context, "app/features/account-settings/household-expense-account-policy-storage.js");
loadScript(context, "app/features/lens-analysis/expense-taxonomy.js");
loadScript(context, "app/features/lens-analysis/expense-library.js");
loadScript(context, "app/features/lens-analysis/expense-compression-thresholds.js");
loadScript(context, "app/features/lens-analysis/household-expense-compression-policy.js");
loadScript(context, "app/features/lens-analysis/household-expense-lifestyle-range-policy.js");
loadScript(context, "app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js");
loadScript(context, "app/features/lens-analysis/household-expense-living-floor-metadata.js");
loadScript(context, "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js");
loadScript(context, "app/features/lens-analysis/household-expense-account-policy-resolver.js");
loadScript(context, "app/features/account-settings/household-expense-account-policy-admin-display.js");
loadScript(context, "app/features/account-settings/household-expense-account-policy-admin-editor.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const storage = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
const display = context.LensApp.accountSettings.householdExpenseAccountPolicyAdminDisplay;
const editor = context.LensApp.accountSettings.householdExpenseAccountPolicyAdminEditor;
assert.ok(editor, "admin editor module should load");
assert.ok(display, "admin display module should load for saved-value refresh checks");
assert.equal(typeof editor.buildHouseholdExpensePolicyEditorModel, "function");
assert.equal(typeof editor.renderHouseholdExpensePolicyEditor, "function");
assert.equal(typeof editor.buildLifestyleRangeSavePayload, "function");
assert.equal(typeof editor.buildFoodAtHomeFloorAssumptionsEditorModel, "function");
assert.equal(typeof editor.buildStateCostAdjustmentMultipliersEditorModel, "function");
assert.equal(typeof editor.buildModel90DefaultBucketFloorsEditorModel, "function");
assert.equal(typeof editor.validateFoodAtHomeFloorAssumptionsDraft, "function");
assert.equal(typeof editor.validateStateCostAdjustmentMultipliersDraft, "function");
assert.equal(typeof editor.validateModel90DefaultBucketFloorsDraft, "function");
assert.equal(typeof editor.buildFoodAtHomeFloorAssumptionsSavePayload, "function");
assert.equal(typeof editor.buildFoodAtHomeFloorAssumptionsResetPayload, "function");
assert.equal(typeof editor.buildStateCostAdjustmentMultipliersSavePayload, "function");
assert.equal(typeof editor.buildStateCostAdjustmentMultipliersResetPayload, "function");
assert.equal(typeof editor.buildModel90DefaultBucketFloorsSavePayload, "function");
assert.equal(typeof editor.buildModel90DefaultBucketFloorsResetPayload, "function");
assert.equal(typeof editor.buildSparseGraphAdjustmentSavePlan, "function");
assert.equal(typeof editor.buildGraphAdjustmentSavePayload, "function");
assert.equal(typeof editor.buildGraphAdjustmentRowResetPayload, "function");
assert.equal(typeof editor.saveFoodAtHomeFloorAssumptions, "function");
assert.equal(typeof editor.resetFoodAtHomeFloorAssumptions, "function");
assert.equal(typeof editor.saveStateCostAdjustmentMultipliers, "function");
assert.equal(typeof editor.resetStateCostAdjustmentMultipliers, "function");
assert.equal(typeof editor.saveModel90DefaultBucketFloors, "function");
assert.equal(typeof editor.resetModel90DefaultBucketFloors, "function");
assert.equal(typeof editor.saveGraphAdjustmentTypeChanges, "function");
assert.equal(typeof editor.resetGraphAdjustmentTypeRow, "function");
assert.equal(typeof editor.initializeHouseholdExpenseAccountPolicyAdminEditor, "function");
assert.deepEqual(plain(editor.GRAPH_ADJUSTMENT_TYPE_OPTIONS.map((option) => option.label)), [
  "Included with floor",
  "Included ratio-only",
  "Excluded / protected"
], "graph adjustment editor should expose the three approved adjustment type labels");
assert.deepEqual(plain(editor.FOOD_AT_HOME_BAND_KEYS), [
  "infantToddler",
  "youngChild",
  "olderChild",
  "teenMale",
  "teenFemale",
  "adultMale",
  "adultFemale",
  "adultUnknown",
  "childUnknown"
], "Food at Home editor should expose all nine approved band keys");
assert.deepEqual(plain(editor.HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS), ["1", "2", "3", "4", "5", "6Plus"], "Food at Home editor should expose all six household-size factor keys");
assert.deepEqual(plain(editor.MODEL90_DEFAULT_BUCKET_FLOOR_KEYS), [
  "householdConsumables",
  "communicationsConnectivity",
  "transportationBasics"
], "MODEL90 default floor editor should expose the three money-floor default buckets");
assert.ok(plain(editor.STATE_CODE_VALUES).includes("CO"), "State multiplier editor should expose USPS state codes");

const defaultLifestyleRows = lensAnalysis.householdExpenseLifestyleRangePolicy.listLifestyleRangePolicies();
const defaultSliderEligibleRows = defaultLifestyleRows.filter((row) => row.sliderEligible === true);
assert.ok(defaultSliderEligibleRows.length > 0, "seed policy should have slider-eligible rows for editor preview");
assert.equal(defaultSliderEligibleRows.length, 41, "seed policy should preserve the 41 graph-affecting slider rows");

const accountId = editor.TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
const missingModel = editor.buildHouseholdExpensePolicyEditorModel({
  accountId,
  storage: context.localStorage
});
assert.equal(missingModel.status.code, "defaultSeedPolicy", "missing saved policy should show default seed policy source");
assert.equal(missingModel.rows.length, defaultSliderEligibleRows.length, "editor should render only seed slider-eligible rows");
assert.equal(missingModel.rows.every((row) => row.overrideStatus === "defaultSeedPolicy"), true, "missing policy rows should be default-only");
assert.equal(missingModel.counts.graphAdjustmentOverrides, 0, "missing policy should have no saved graph adjustment overrides");
assert.equal(missingModel.counts.rowsWithGraphAdjustmentOverrides, 0, "missing policy should have no graph adjustment override rows");
assert.equal(missingModel.trace.graphAdjustmentPolicyPreviewResolverAvailable, true, "admin editor should use the graph adjustment preview resolver");
assert.equal(missingModel.trace.graphAdjustmentPolicyPreviewRows, 41, "graph adjustment preview resolver should return the 41 graph rows");
assert.equal(missingModel.trace.graphAdjustmentPolicyPreviewActiveRuntimeConsumer, false, "graph adjustment preview should remain inactive for runtime");
assert.equal(
  missingModel.trace.graphAdjustmentPolicyDisplaySource,
  "householdExpenseGraphAdjustmentPolicyResolver",
  "display columns should be sourced from the graph adjustment preview resolver"
);
assert.equal(missingModel.foodAtHomeFloorAssumptions.source, "ADMIN_ENTERED", "Food at Home editor should default source to ADMIN_ENTERED");
assert.equal(missingModel.foodAtHomeFloorAssumptions.sourcePeriod, null, "empty Food at Home editor should have blank source period");
assert.equal(missingModel.foodAtHomeFloorAssumptions.bandRows.length, 9, "Food at Home editor should render nine band rows");
assert.equal(missingModel.foodAtHomeFloorAssumptions.householdSizeAdjustmentFactorRows.length, 6, "Food at Home editor should render six household-size factor rows");
assert.equal(missingModel.stateCostAdjustmentMultipliers.defaultMultiplier, 1, "empty State Cost editor should default multiplier to 1");
assert.equal(missingModel.stateCostAdjustmentMultipliers.defaultMultiplierInputValue, "1", "empty State Cost editor should render default multiplier value");
assert.equal(missingModel.stateCostAdjustmentMultipliers.globalStateRows.length, 0, "empty State Cost editor should render no state rows");
assert.deepEqual(plain(missingModel.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers), {}, "empty State Cost editor should have no bucket-specific state rows");
assert.equal(missingModel.model90DefaultBucketFloors.rows.length, 3, "empty MODEL90 default floor editor should render three bucket rows");
assert.deepEqual(
  plain(missingModel.model90DefaultBucketFloors.rows.map((row) => row.planningBucketKey)),
  ["householdConsumables", "communicationsConnectivity", "transportationBasics"],
  "MODEL90 default floor editor should render the required bucket keys"
);
assert.equal(
  missingModel.model90DefaultBucketFloors.rows.every((row) => row.monthlyBaseAmountInputValue === "" && row.perUnitAmountInputValue === ""),
  true,
  "empty MODEL90 default floor amount inputs should render blank"
);
assert.equal(
  missingModel.model90DefaultBucketFloors.rows.every((row) => row.stateAdjustmentEnabled === true),
  true,
  "empty MODEL90 default floor rows should default to state adjustment enabled"
);
assert.equal(
  missingModel.foodAtHomeFloorAssumptions.bandRows.every((row) => row.inputValue === ""),
  true,
  "empty Food at Home band inputs should render blank"
);
assert.equal(
  missingModel.foodAtHomeFloorAssumptions.householdSizeAdjustmentFactorRows.every((row) => row.inputValue === ""),
  true,
  "empty Food at Home factor inputs should render blank"
);
assert.ok(missingModel.rows.some((row) => row.expenseTypeKey === "groceries"), "slider-eligible groceries should render");
assert.ok(missingModel.rows.some((row) => row.expenseTypeKey === "streamingDigitalSubscriptions"), "slider-eligible subscriptions should render");
assert.ok(missingModel.rows.some((row) => row.expenseTypeKey === "diningTakeout"), "broad Dining / Takeout parent should render as an editable slider row");
assert.ok(missingModel.rows.some((row) => row.expenseTypeKey === "householdServices"), "broad Household Services parent should render as an editable slider row");

const groceriesEditorRow = missingModel.rows.find((row) => row.expenseTypeKey === "groceries");
const diningTakeoutEditorRow = missingModel.rows.find((row) => row.expenseTypeKey === "diningTakeout");
const householdServicesEditorRow = missingModel.rows.find((row) => row.expenseTypeKey === "householdServices");
assert.equal(groceriesEditorRow.planningBucketKey, "foodAtHomeConsumables", "graph row context should include planning bucket metadata");
assert.equal(groceriesEditorRow.defaultAdjustmentClass, "moneyFloorAdjusted", "food-at-home seed adjustment class should come from living-floor metadata");
assert.equal(groceriesEditorRow.defaultMinimumFloorMode, "estimatedDollarFloor", "food-at-home seed minimum floor mode should come from living-floor metadata");
assert.equal(groceriesEditorRow.adjustmentClass, "moneyFloorAdjusted", "food-at-home dropdown should default to included-with-floor behavior");
assert.equal(groceriesEditorRow.minimumFloorMode, "estimatedDollarFloor", "food-at-home dropdown should default to estimated dollar floor mode");
assert.equal(groceriesEditorRow.adjustmentOverrideStatus, "defaultSeedPolicy", "food-at-home dropdown should default to seed policy status");
assert.equal(groceriesEditorRow.adjustmentTypeDisplay, "Included with floor", "food-at-home graph rows should display money-floor adjustment context");
assert.equal(groceriesEditorRow.minimumFloorDisplay, "Food at Home model / USDA Food Plan", "food-at-home graph rows should display the resolver Food at Home floor model");
assert.equal(groceriesEditorRow.floorSourceLabel, "Food at Home model / USDA Food Plan", "food-at-home floor source label should come from resolver output");
assert.equal(groceriesEditorRow.floorSourceStatus, "notConfigured", "food-at-home floor source status should come from resolver output");
assert.equal(groceriesEditorRow.graphAdjustable, true, "money-floor graph rows should remain graph-adjustable by default");
assert.equal(
  groceriesEditorRow.graphAdjustmentSourceTrace.adjustmentClassSource,
  "livingFloorMetadata",
  "seed adjustment class should be traced to living-floor metadata"
);
assert.equal(
  groceriesEditorRow.graphAdjustmentSourceTrace.floorSourceStatusSource,
  "livingFloorAssumptions",
  "floor source status should be traced to living-floor assumptions"
);
assert.equal(diningTakeoutEditorRow.adjustmentClass, "ratioAdjusted", "zero-floor buckets should default to ratio-adjusted behavior");
assert.equal(diningTakeoutEditorRow.minimumFloorMode, "zeroFloor", "zero-floor buckets should default to zeroFloor mode");
assert.equal(diningTakeoutEditorRow.minimumFloorDisplay, "$0 floor / no dollar source", "zero-floor ratio buckets should display resolver zero-floor label");
assert.equal(householdServicesEditorRow.adjustmentClass, "ratioAdjusted", "ratio-floor-only buckets should default to ratio-adjusted behavior");
assert.equal(householdServicesEditorRow.minimumFloorMode, "ratioFloorOnly", "household services should default to ratioFloorOnly mode");
assert.equal(householdServicesEditorRow.minimumFloorDisplay, "Ratio floor only / no dollar source", "ratio-floor-only buckets should display resolver ratio-floor-only label");
assert.equal(
  missingModel.rows.every((row) => row.adjustmentTypeDisplay && row.minimumFloorDisplay && row.floorStatusDisplay),
  true,
  "every graph adjustment row should have display-only adjustment and floor context"
);
assert.equal(
  missingModel.rows.every((row) => row.graphAdjustable === true),
  true,
  "default 41 graph adjustment rows should render as graph-adjustable"
);

function assertEditorBucketRows(bucketKey, expected, message) {
  const rows = missingModel.rows.filter((row) => row.planningBucketKey === bucketKey);
  assert.ok(rows.length > 0, `${bucketKey} should have graph adjustment rows`);
  rows.forEach(function (row) {
    assert.equal(row.adjustmentTypeDisplay, expected.adjustmentTypeDisplay, `${message}: ${row.expenseTypeKey} adjustment type`);
    assert.equal(row.minimumFloorDisplay, expected.minimumFloorDisplay, `${message}: ${row.expenseTypeKey} minimum floor`);
    assert.equal(row.floorStatusDisplay, expected.floorStatusDisplay, `${message}: ${row.expenseTypeKey} floor source/status`);
  });
}

assertEditorBucketRows("foodAtHomeConsumables", {
  adjustmentTypeDisplay: "Included with floor",
  minimumFloorDisplay: "Food at Home model / USDA Food Plan",
  floorStatusDisplay: "Food at Home model / USDA Food Plan / not configured"
}, "Food at Home rows");
[
  "householdConsumables",
  "communicationsConnectivity",
  "transportationBasics"
].forEach(function (bucketKey) {
  assertEditorBucketRows(bucketKey, {
    adjustmentTypeDisplay: "Included with floor",
    minimumFloorDisplay: "MODEL90 default floor",
    floorStatusDisplay: "MODEL90 default floor / not configured"
  }, `${bucketKey} rows`);
});
[
  "diningTakeout",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations",
  "petsDiscretionary"
].forEach(function (bucketKey) {
  assertEditorBucketRows(bucketKey, {
    adjustmentTypeDisplay: "Included ratio-only",
    minimumFloorDisplay: "$0 floor / no dollar source",
    floorStatusDisplay: "$0 floor / no dollar source / not applicable"
  }, `${bucketKey} rows`);
});
assertEditorBucketRows("savingsGoalContributions", {
  adjustmentTypeDisplay: "Included ratio-only",
  minimumFloorDisplay: "Pauseable / $0 floor",
  floorStatusDisplay: "Pauseable / $0 floor / not applicable"
}, "pauseable savings rows");
[
  "personalLivingClothing",
  "householdServices"
].forEach(function (bucketKey) {
  assertEditorBucketRows(bucketKey, {
    adjustmentTypeDisplay: "Included ratio-only",
    minimumFloorDisplay: "Ratio floor only / no dollar source",
    floorStatusDisplay: "Ratio floor only / no dollar source / not applicable"
  }, `${bucketKey} rows`);
});

[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "daycareChildcare",
  "educationEnrichment",
  "healthInsurancePremiums",
  "charitableGiving",
  "federalStateLocalIncomeTaxPayments"
].forEach(function (typeKey) {
  assert.equal(
    missingModel.rows.some((row) => row.expenseTypeKey === typeKey),
    false,
    `${typeKey} should be excluded from the editable grid`
  );
});

const missingHtml = editor.renderHouseholdExpensePolicyEditor(missingModel);
assert.match(missingHtml, /Income Impact Adjustment Controls/);
assert.match(missingHtml, /Graph-Affecting Ratio Controls/);
assert.match(missingHtml, /Affects all users on this account/);
assert.match(missingHtml, /data-household-expense-graph-adjustment-controls/);
assert.match(missingHtml, /Planning Bucket/);
assert.match(missingHtml, /Adjustment Type/);
assert.match(missingHtml, /Minimum Floor/);
assert.match(missingHtml, /Floor Source \/ Status/);
assert.match(missingHtml, /Graph Adjustable/);
assert.match(missingHtml, /Food at Home model \/ USDA Food Plan/);
assert.match(missingHtml, /MODEL90 default floor|\$0 floor \/ no dollar source|Ratio floor only \/ no dollar source/);
assert.match(missingHtml, /data-graph-adjustable="true"/);
assert.doesNotMatch(missingHtml, /review/i, "graph adjustment controls should not show review as a runtime mode");
assert.match(missingHtml, /Default Floor/);
assert.match(missingHtml, /Resolved Ceiling/);
assert.match(missingHtml, /data-household-expense-policy-save/);
assert.match(missingHtml, /data-graph-adjustment-save/);
assert.match(missingHtml, /Save Adjustment Types/);
assert.match(missingHtml, /data-household-expense-policy-reset-row/);
assert.match(missingHtml, /data-graph-adjustment-reset-row/);
assert.match(missingHtml, /data-ratio-field="conservativeFloorRatio"/);
assert.match(missingHtml, /data-ratio-field="elevatedCeilingRatio"/);
assert.match(missingHtml, /Food at Home Floor Assumptions/);
assert.match(missingHtml, /USDA-Style Band Values/);
assert.match(missingHtml, /data-food-at-home-floor-save/);
assert.match(missingHtml, /data-food-at-home-floor-reset/);
assert.match(missingHtml, /data-food-at-home-floor-source/);
assert.match(missingHtml, /data-food-at-home-floor-source-period/);
assert.match(missingHtml, /data-food-at-home-band-key="infantToddler"/);
assert.match(missingHtml, /data-food-at-home-band-key="childUnknown"/);
assert.match(missingHtml, /data-food-at-home-household-size-factor-key="1"/);
assert.match(missingHtml, /data-food-at-home-household-size-factor-key="6Plus"/);
assert.match(missingHtml, /State Cost Adjustment Multipliers/);
assert.match(missingHtml, /data-state-cost-adjustment-multipliers-editor/);
assert.match(missingHtml, /data-state-cost-adjustment-default-multiplier/);
assert.match(missingHtml, /data-state-cost-adjustment-save/);
assert.match(missingHtml, /data-state-cost-adjustment-add-row/);
assert.match(missingHtml, /data-state-cost-adjustment-reset/);
assert.match(missingHtml, /data-state-cost-adjustment-empty-row/);
assert.match(missingHtml, /Bucket-specific state multipliers are preserved but not editable/);
assert.match(missingHtml, /MODEL90 Default Floor Assumptions/);
assert.match(missingHtml, /Money-Floor Bucket Defaults/);
assert.match(missingHtml, /data-model90-default-bucket-floors-editor/);
assert.match(missingHtml, /data-model90-default-bucket-floors-save/);
assert.match(missingHtml, /data-model90-default-bucket-floors-reset/);
assert.match(missingHtml, /data-model90-default-bucket-floor-bucket-key="householdConsumables"/);
assert.match(missingHtml, /data-model90-default-bucket-floor-bucket-key="communicationsConnectivity"/);
assert.match(missingHtml, /data-model90-default-bucket-floor-bucket-key="transportationBasics"/);
assert.match(missingHtml, /data-model90-default-bucket-floor-per-unit-field="monthlyPerMemberAmount"/);
assert.match(missingHtml, /data-model90-default-bucket-floor-per-unit-field="monthlyPerAdultDriverAmount"/);
assert.equal(
  (missingHtml.match(/data-household-expense-policy-ratio-input/g) || []).length,
  defaultSliderEligibleRows.length * 2,
  "only the two ratio controls should render for each slider-eligible row"
);
assert.equal(
  (missingHtml.match(/data-graph-adjustment-type-input/g) || []).length,
  defaultSliderEligibleRows.length,
  "each slider-eligible graph row should render exactly one adjustment type dropdown"
);
assert.equal(
  (missingHtml.match(/data-graph-adjustment-reset-row/g) || []).length,
  defaultSliderEligibleRows.length,
  "each slider-eligible graph row should render one adjustment type reset control"
);
assert.equal(
  (missingHtml.match(/data-food-at-home-band-key="/g) || []).length,
  9,
  "Food at Home editor should render one input per band"
);
assert.equal(
  (missingHtml.match(/data-food-at-home-household-size-factor-key="/g) || []).length,
  6,
  "Food at Home editor should render one input per household-size factor"
);
assert.equal(
  (missingHtml.match(/data-state-cost-adjustment-default-multiplier/g) || []).length,
  1,
  "State Cost editor should render one default multiplier input"
);
assert.equal(
  (missingHtml.match(/data-state-cost-adjustment-multiplier\b/g) || []).length,
  0,
  "State Cost editor should render no saved state-row multiplier inputs when empty"
);
assert.equal(
  (missingHtml.match(/data-model90-default-bucket-floor-row/g) || []).length,
  3,
  "MODEL90 default floor editor should render one row per bucket"
);
assert.equal(
  (missingHtml.match(/data-model90-default-bucket-floor-monthly-base-amount/g) || []).length,
  3,
  "MODEL90 default floor editor should render one monthly base input per bucket"
);
assert.equal(
  (missingHtml.match(/data-model90-default-bucket-floor-per-unit-amount/g) || []).length,
  3,
  "MODEL90 default floor editor should render one per-unit input per bucket"
);
assert.doesNotMatch(
  missingHtml,
  /data-ratio-field="sliderEligible"|data-ratio-field="rangeBehavior"|data-ratio-field="canPause"|data-ratio-field="canReduceToZero"|data-ratio-field="compressionOrderGroup"|data-ratio-field="compressionOrderRank"|data-ratio-field="sourcePolicyDecision"|data-ratio-field="threshold/
);
assert.equal(
  (missingHtml.match(/<select\b/g) || []).length,
  defaultSliderEligibleRows.length,
  "only the 41 graph adjustment type dropdowns should render as selects in the editor"
);
assert.doesNotMatch(
  missingHtml,
  /data-state-cost-adjustment-multiplier-input|data-bucket-state-adjustment-multiplier-input/,
  "Admin floor editor should not render bucket-specific state multiplier inputs"
);

const existingAccountPolicy = {
  version: 1,
  lifestyleRangeOverrides: [],
  graphAdjustmentOverrides: [{
    expenseTypeKey: "diningTakeout",
    adjustmentClass: "excludedFromAdjustment",
    minimumFloorMode: "notAdjusted",
    updatedAt: "2026-05-09T00:00:00.000Z",
    source: "ADMIN_ENTERED"
  }],
  compressionThresholdOverrides: [{ thresholdId: "streamingDigitalSubscriptions", tiers: { average: 95 } }],
  compressionPolicyOverrides: [{ policyId: "travelVacations", notes: "preserve me" }],
  guardrails: { maxElevatedCeilingRatio: 1.9 },
  livingFloorAssumptions: plain(preservedLivingFloorAssumptions),
  metadata: { source: "existing-policy" }
};

const graphAdjustmentPayload = editor.buildGraphAdjustmentSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  rows: missingModel.rows,
  draftRows: draftGraphAdjustmentRowsFromModel(missingModel, {
    groceries: {
      adjustmentClass: "excludedFromAdjustment"
    },
    householdServices: {
      adjustmentClass: "ratioAdjusted"
    }
  }),
  updatedAt: "2026-05-09T00:00:00.000Z"
});
assert.equal(graphAdjustmentPayload.valid, true, "valid graph adjustment type edits should be accepted");
assert.deepEqual(plain(graphAdjustmentPayload.accountPolicy.lifestyleRangeOverrides), [], "graph adjustment save should preserve ratio namespace");
assert.deepEqual(plain(graphAdjustmentPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "graph adjustment save should preserve threshold namespace");
assert.deepEqual(plain(graphAdjustmentPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "graph adjustment save should preserve compression namespace");
assert.deepEqual(plain(graphAdjustmentPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "graph adjustment save should preserve guardrails");
assert.deepEqual(plain(graphAdjustmentPayload.accountPolicy.livingFloorAssumptions), preservedLivingFloorAssumptions, "graph adjustment save should preserve living-floor assumptions");
assert.equal(graphAdjustmentPayload.accountPolicy.metadata.lastEditedNamespace, "graphAdjustmentOverrides", "graph adjustment save should mark the edited namespace");
assert.equal(graphAdjustmentPayload.accountPolicy.graphAdjustmentOverrides.length, 1, "graph adjustment save should store sparse row-level behavior overrides only");
assert.deepEqual(plain(graphAdjustmentPayload.accountPolicy.graphAdjustmentOverrides[0]), {
  expenseTypeKey: "groceries",
  adjustmentClass: "excludedFromAdjustment",
  minimumFloorMode: "notAdjusted",
  updatedAt: "2026-05-09T00:00:00.000Z",
  source: "ADMIN_ENTERED"
}, "Included-with-floor rows should save an excluded override with notAdjusted mode");
assert.equal(JSON.parse(JSON.stringify(graphAdjustmentPayload)).valid, true, "graph adjustment save payload should be JSON serializable");

const graphAdjustmentPreviewStorage = createFakeStorage();
storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: graphAdjustmentPayload.accountPolicy,
  metadata: { updatedBy: "graph-adjustment-preview-check" },
  storage: graphAdjustmentPreviewStorage
});
const graphAdjustmentPreviewModel = editor.buildHouseholdExpensePolicyEditorModel({
  accountId,
  storage: graphAdjustmentPreviewStorage
});
const excludedGroceriesPreviewRow = graphAdjustmentPreviewModel.rows.find((row) => row.expenseTypeKey === "groceries");
assert.equal(excludedGroceriesPreviewRow.adjustmentOverrideStatus, "accountOverride", "saved graph adjustment override should mark resolver-backed row status");
assert.equal(excludedGroceriesPreviewRow.adjustmentClass, "excludedFromAdjustment", "saved graph adjustment override should update resolver-backed adjustment class");
assert.equal(excludedGroceriesPreviewRow.minimumFloorDisplay, "Not adjusted", "saved graph adjustment override should update resolver-backed floor display");
assert.equal(excludedGroceriesPreviewRow.floorStatusDisplay, "Not adjusted / not applicable", "saved graph adjustment override should update resolver-backed floor status");
assert.equal(excludedGroceriesPreviewRow.graphAdjustable, false, "saved excluded graph adjustment override should update resolver-backed graphAdjustable value");
assert.match(
  editor.renderHouseholdExpensePolicyEditor(graphAdjustmentPreviewModel),
  /data-expense-type-key="groceries"[\s\S]*data-graph-adjustable="false"/,
  "rendered row should expose resolver-backed graphAdjustable false state"
);

const graphAdjustmentResetPayload = editor.buildGraphAdjustmentRowResetPayload({
  accountId,
  accountPolicy: graphAdjustmentPayload.accountPolicy,
  rows: missingModel.rows,
  expenseTypeKey: "groceries"
});
assert.equal(graphAdjustmentResetPayload.valid, true, "graph adjustment row reset payload should be valid");
assert.deepEqual(plain(graphAdjustmentResetPayload.accountPolicy.graphAdjustmentOverrides), [], "graph adjustment row reset should restore seed/default adjustment type");
assert.deepEqual(plain(graphAdjustmentResetPayload.accountPolicy.lifestyleRangeOverrides), [], "graph adjustment row reset should preserve ratio namespace");
assert.deepEqual(plain(graphAdjustmentResetPayload.accountPolicy.livingFloorAssumptions), preservedLivingFloorAssumptions, "graph adjustment row reset should preserve living-floor assumptions");

const invalidGraphAdjustmentPayload = editor.buildGraphAdjustmentSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  rows: missingModel.rows,
  draftRows: draftGraphAdjustmentRowsFromModel(missingModel, {
    groceries: {
      adjustmentClass: "reviewOnly"
    }
  }),
  updatedAt: "2026-05-09T00:00:00.000Z"
});
assert.equal(invalidGraphAdjustmentPayload.valid, false, "invalid graph adjustment classes should be rejected before save");
assert.match(invalidGraphAdjustmentPayload.validationMessages.groceries.join(" "), /valid adjustment type/);
assert.equal(Object.prototype.hasOwnProperty.call(invalidGraphAdjustmentPayload, "accountPolicy"), false, "invalid graph adjustment payload should not produce a storage payload");

const unknownGraphAdjustmentPayload = editor.buildGraphAdjustmentSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  rows: missingModel.rows,
  draftRows: [{
    expenseTypeKey: "notASeedGraphRow",
    adjustmentClass: "excludedFromAdjustment"
  }],
  updatedAt: "2026-05-09T00:00:00.000Z"
});
assert.equal(unknownGraphAdjustmentPayload.valid, true, "unknown graph adjustment rows should be ignored safely");
assert.deepEqual(plain(unknownGraphAdjustmentPayload.accountPolicy.graphAdjustmentOverrides), [], "unknown graph adjustment rows should not create saved overrides");

const foodAtHomePayload = editor.buildFoodAtHomeFloorAssumptionsSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftFoodAtHome: buildFoodAtHomeDraft()
});
assert.equal(foodAtHomePayload.valid, true, "valid Food at Home assumptions should be accepted");
assert.equal(foodAtHomePayload.accountPolicy.livingFloorAssumptions.foodAtHome.source, "USDA_FOOD_PLAN", "Food at Home source should save");
assert.equal(foodAtHomePayload.accountPolicy.livingFloorAssumptions.foodAtHome.sourcePeriod, "2026-01", "Food at Home source period should save");
assert.equal(foodAtHomePayload.accountPolicy.livingFloorAssumptions.foodAtHome.monthlyAmountsByBand.infantToddler, 180, "Food band numeric strings should normalize to dollars");
assert.equal(foodAtHomePayload.accountPolicy.livingFloorAssumptions.foodAtHome.monthlyAmountsByBand.teenMale, 355, "Food band values should save by band key");
assert.equal(foodAtHomePayload.accountPolicy.livingFloorAssumptions.foodAtHome.householdSizeAdjustmentFactors["6Plus"], 0.8, "Household-size factors should save by factor key");
assert.deepEqual(plain(foodAtHomePayload.accountPolicy.lifestyleRangeOverrides), [], "Food at Home save should preserve lifestyle overrides");
assert.deepEqual(plain(foodAtHomePayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "Food at Home save should preserve graph adjustment overrides");
assert.deepEqual(plain(foodAtHomePayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "Food at Home save should preserve threshold namespace");
assert.deepEqual(plain(foodAtHomePayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "Food at Home save should preserve compression namespace");
assert.deepEqual(plain(foodAtHomePayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "Food at Home save should preserve guardrails");
assert.deepEqual(
  plain(foodAtHomePayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers),
  preservedLivingFloorAssumptions.stateCostAdjustmentMultipliers,
  "Food at Home save should preserve state multiplier assumptions"
);
assert.deepEqual(
  plain(foodAtHomePayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors),
  preservedLivingFloorAssumptions.model90DefaultBucketFloors,
  "Food at Home save should preserve MODEL90 default bucket floor assumptions"
);
assert.equal(foodAtHomePayload.accountPolicy.metadata.source, "existing-policy", "Food at Home save should preserve metadata source");
assert.equal(foodAtHomePayload.accountPolicy.metadata.lastEditedNamespace, "livingFloorAssumptions.foodAtHome");
assert.equal(JSON.parse(JSON.stringify(foodAtHomePayload)).valid, true, "Food at Home save payload should be JSON serializable");

const foodAtHomeStorage = createFakeStorage();
const foodAtHomeSaveResult = storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: foodAtHomePayload.accountPolicy,
  metadata: { updatedBy: "food-at-home-check" },
  storage: foodAtHomeStorage
});
assert.equal(foodAtHomeSaveResult.saved, true, "valid Food at Home assumptions should save through the storage adapter");
assert.deepEqual(
  foodAtHomeStorage.getWrites().map((write) => write.key),
  [storage.createHouseholdExpenseAccountPolicyStorageKey(accountId)],
  "Food at Home save should write only the household expense account policy key"
);
const foodAtHomeDisplayModel = display.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: foodAtHomeStorage
});
assert.equal(foodAtHomeDisplayModel.savedLivingFloorAssumptions.status.code, "configured", "read-only saved assumptions display should reflect saved Food at Home values");
assert.equal(foodAtHomeDisplayModel.savedLivingFloorAssumptions.counts.configuredFoodAtHomeBands, 9, "display should count saved Food at Home bands");
assert.equal(foodAtHomeDisplayModel.savedLivingFloorAssumptions.counts.configuredHouseholdSizeFactors, 6, "display should count saved Food at Home factors");
assert.match(display.renderHouseholdExpensePolicyDisplay(foodAtHomeDisplayModel), /\$180\.00/, "read-only display should render saved Food at Home dollar values");

const foodAtHomeResetPayload = editor.buildFoodAtHomeFloorAssumptionsResetPayload({
  accountId,
  accountPolicy: foodAtHomePayload.accountPolicy
});
assert.equal(foodAtHomeResetPayload.valid, true, "Food at Home reset payload should be valid");
assert.equal(foodAtHomeResetPayload.accountPolicy.livingFloorAssumptions.foodAtHome.source, "ADMIN_ENTERED", "Food at Home reset should restore default source");
assert.equal(foodAtHomeResetPayload.accountPolicy.livingFloorAssumptions.foodAtHome.sourcePeriod, null, "Food at Home reset should clear source period");
assert.equal(foodAtHomeResetPayload.accountPolicy.livingFloorAssumptions.foodAtHome.monthlyAmountsByBand.infantToddler, null, "Food at Home reset should clear band values");
assert.equal(foodAtHomeResetPayload.accountPolicy.livingFloorAssumptions.foodAtHome.householdSizeAdjustmentFactors["6Plus"], null, "Food at Home reset should clear factor values");
assert.deepEqual(
  plain(foodAtHomeResetPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers),
  preservedLivingFloorAssumptions.stateCostAdjustmentMultipliers,
  "Food at Home reset should preserve state multiplier assumptions"
);
assert.deepEqual(
  plain(foodAtHomeResetPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors),
  preservedLivingFloorAssumptions.model90DefaultBucketFloors,
  "Food at Home reset should preserve MODEL90 default bucket floor assumptions"
);
assert.deepEqual(plain(foodAtHomeResetPayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "Food at Home reset should preserve graph adjustment overrides");
assert.deepEqual(plain(foodAtHomeResetPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "Food at Home reset should preserve threshold namespace");
assert.deepEqual(plain(foodAtHomeResetPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "Food at Home reset should preserve compression namespace");
assert.deepEqual(plain(foodAtHomeResetPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "Food at Home reset should preserve guardrails");

const stateMultiplierModel = editor.buildStateCostAdjustmentMultipliersEditorModel(existingAccountPolicy);
assert.equal(stateMultiplierModel.defaultMultiplier, 1, "State Cost editor should read saved default multiplier");
assert.equal(stateMultiplierModel.globalStateRows.length, 1, "State Cost editor should render saved global state rows");
assert.equal(stateMultiplierModel.globalStateRows[0].stateCode, "CO", "State Cost editor should render saved state code");
assert.equal(stateMultiplierModel.globalStateRows[0].multiplierInputValue, "1.08", "State Cost editor should render saved state multiplier");
assert.deepEqual(
  plain(stateMultiplierModel.bucketStateAdjustmentMultipliers),
  preservedLivingFloorAssumptions.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers,
  "State Cost editor should keep bucket-specific state multipliers in the model but not render editable inputs for them"
);
const stateMultiplierHtml = editor.renderStateCostAdjustmentMultipliersEditor(stateMultiplierModel);
assert.match(stateMultiplierHtml, /data-state-cost-adjustment-state-code/);
assert.match(stateMultiplierHtml, /value="CO"/);
assert.match(stateMultiplierHtml, /value="1.08"/);
assert.doesNotMatch(stateMultiplierHtml, /data-bucket-state-adjustment-multiplier-input|data-model90-default-bucket-floor-input/);

const stateMultiplierPayload = editor.buildStateCostAdjustmentMultipliersSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftStateCostAdjustmentMultipliers: buildStateCostAdjustmentMultiplierDraft()
});
assert.equal(stateMultiplierPayload.valid, true, "valid State Cost multipliers should be accepted");
assert.equal(stateMultiplierPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.defaultMultiplier, 1.05, "default multiplier should save");
assert.equal(
  stateMultiplierPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState.CO.multiplier,
  1.08,
  "lowercase state codes should normalize to uppercase before save"
);
assert.equal(
  stateMultiplierPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState.CO.source,
  "ADMIN_ENTERED",
  "blank state multiplier source should default to ADMIN_ENTERED"
);
assert.equal(
  stateMultiplierPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState.CO.sourcePeriod,
  "2026",
  "state multiplier source period should save"
);
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.livingFloorAssumptions.foodAtHome), existingAccountPolicy.livingFloorAssumptions.foodAtHome, "State Cost save should preserve Food at Home assumptions");
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors), existingAccountPolicy.livingFloorAssumptions.model90DefaultBucketFloors, "State Cost save should preserve MODEL90 default bucket floors");
assert.deepEqual(
  plain(stateMultiplierPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers),
  existingAccountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers,
  "State Cost save should preserve bucket-specific state multipliers"
);
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.lifestyleRangeOverrides), [], "State Cost save should preserve lifestyle overrides");
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "State Cost save should preserve graph adjustment overrides");
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "State Cost save should preserve threshold namespace");
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "State Cost save should preserve compression namespace");
assert.deepEqual(plain(stateMultiplierPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "State Cost save should preserve guardrails");
assert.equal(stateMultiplierPayload.accountPolicy.metadata.source, "existing-policy", "State Cost save should preserve metadata source");
assert.equal(stateMultiplierPayload.accountPolicy.metadata.lastEditedNamespace, "livingFloorAssumptions.stateCostAdjustmentMultipliers");
assert.equal(JSON.parse(JSON.stringify(stateMultiplierPayload)).valid, true, "State Cost save payload should be JSON serializable");

const stateMultiplierStorage = createFakeStorage();
const stateMultiplierSaveResult = storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: stateMultiplierPayload.accountPolicy,
  metadata: { updatedBy: "state-multiplier-check" },
  storage: stateMultiplierStorage
});
assert.equal(stateMultiplierSaveResult.saved, true, "valid State Cost assumptions should save through the storage adapter");
assert.deepEqual(
  stateMultiplierStorage.getWrites().map((write) => write.key),
  [storage.createHouseholdExpenseAccountPolicyStorageKey(accountId)],
  "State Cost save should write only the household expense account policy key"
);
const stateMultiplierDisplayModel = display.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: stateMultiplierStorage
});
assert.equal(stateMultiplierDisplayModel.savedLivingFloorAssumptions.counts.globalStateMultiplierRows, 1, "read-only display should count saved state multiplier rows");
assert.equal(stateMultiplierDisplayModel.savedLivingFloorAssumptions.counts.bucketStateMultiplierGroups, 1, "read-only display should preserve bucket-specific state multiplier groups");
const stateMultiplierDisplayHtml = display.renderHouseholdExpensePolicyDisplay(stateMultiplierDisplayModel);
assert.match(stateMultiplierDisplayHtml, /Default multiplier: 1\.05/, "read-only display should render saved default multiplier");
assert.match(stateMultiplierDisplayHtml, /CO/, "read-only display should render saved state code");
assert.match(stateMultiplierDisplayHtml, /1\.08/, "read-only display should render saved state multiplier");
assert.match(stateMultiplierDisplayHtml, /transportationBasics/, "read-only display should still show preserved bucket-specific state multipliers");

const stateMultiplierResetPayload = editor.buildStateCostAdjustmentMultipliersResetPayload({
  accountId,
  accountPolicy: stateMultiplierPayload.accountPolicy
});
assert.equal(stateMultiplierResetPayload.valid, true, "State Cost reset payload should be valid");
assert.equal(stateMultiplierResetPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.defaultMultiplier, 1, "State Cost reset should restore default multiplier");
assert.deepEqual(
  plain(stateMultiplierResetPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState),
  {},
  "State Cost reset should clear only global state rows"
);
assert.deepEqual(
  plain(stateMultiplierResetPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers),
  preservedLivingFloorAssumptions.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers,
  "State Cost reset should preserve bucket-specific state multipliers"
);
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.livingFloorAssumptions.foodAtHome), existingAccountPolicy.livingFloorAssumptions.foodAtHome, "State Cost reset should preserve Food at Home assumptions");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors), existingAccountPolicy.livingFloorAssumptions.model90DefaultBucketFloors, "State Cost reset should preserve MODEL90 default bucket floors");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "State Cost reset should preserve graph adjustment overrides");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "State Cost reset should preserve threshold namespace");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "State Cost reset should preserve compression namespace");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "State Cost reset should preserve guardrails");

const model90DefaultFloorsModel = editor.buildModel90DefaultBucketFloorsEditorModel(existingAccountPolicy);
assert.equal(model90DefaultFloorsModel.rows.length, 3, "MODEL90 default floor model should render three rows");
assert.equal(
  model90DefaultFloorsModel.rows.find((row) => row.planningBucketKey === "householdConsumables").monthlyBaseAmountInputValue,
  "110",
  "MODEL90 default floor model should read saved household consumables base amount"
);
assert.equal(
  model90DefaultFloorsModel.rows.find((row) => row.planningBucketKey === "transportationBasics").perUnitField,
  "monthlyPerAdultDriverAmount",
  "transportationBasics should use monthlyPerAdultDriverAmount"
);
const model90DefaultFloorsHtml = editor.renderModel90DefaultBucketFloorsEditor(model90DefaultFloorsModel);
assert.match(model90DefaultFloorsHtml, /householdConsumables/);
assert.match(model90DefaultFloorsHtml, /communicationsConnectivity/);
assert.match(model90DefaultFloorsHtml, /transportationBasics/);
assert.match(model90DefaultFloorsHtml, /value="110"/);
assert.match(model90DefaultFloorsHtml, /monthlyPerAdultDriverAmount/);
assert.doesNotMatch(model90DefaultFloorsHtml, /data-bucket-state-adjustment-multiplier-input/);

const model90DefaultFloorsPayload = editor.buildModel90DefaultBucketFloorsSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftModel90DefaultBucketFloors: buildModel90DefaultBucketFloorsDraft()
});
assert.equal(model90DefaultFloorsPayload.valid, true, "valid MODEL90 default bucket floors should be accepted");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.householdConsumables.monthlyBaseAmount, 120, "householdConsumables base amount should save");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.householdConsumables.monthlyPerMemberAmount, 40, "householdConsumables per-member amount should save");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.communicationsConnectivity.monthlyBaseAmount, 95, "communications base amount should save");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.communicationsConnectivity.monthlyPerMemberAmount, 15, "communications per-member amount should save");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.communicationsConnectivity.stateAdjustmentEnabled, false, "stateAdjustmentEnabled should save as a boolean");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.communicationsConnectivity.source, "ADMIN_ENTERED", "blank MODEL90 default floor source should default to ADMIN_ENTERED");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.transportationBasics.monthlyBaseAmount, 160, "transportation base amount should save");
assert.equal(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.transportationBasics.monthlyPerAdultDriverAmount, 80, "transportation adult-driver amount should save");
assert.deepEqual(plain(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.foodAtHome), existingAccountPolicy.livingFloorAssumptions.foodAtHome, "MODEL90 default floor save should preserve Food at Home assumptions");
assert.deepEqual(
  plain(model90DefaultFloorsPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers),
  existingAccountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers,
  "MODEL90 default floor save should preserve state multipliers including bucket-specific rows"
);
assert.deepEqual(plain(model90DefaultFloorsPayload.accountPolicy.lifestyleRangeOverrides), [], "MODEL90 default floor save should preserve lifestyle overrides");
assert.deepEqual(plain(model90DefaultFloorsPayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "MODEL90 default floor save should preserve graph adjustment overrides");
assert.deepEqual(plain(model90DefaultFloorsPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "MODEL90 default floor save should preserve threshold namespace");
assert.deepEqual(plain(model90DefaultFloorsPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "MODEL90 default floor save should preserve compression namespace");
assert.deepEqual(plain(model90DefaultFloorsPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "MODEL90 default floor save should preserve guardrails");
assert.equal(model90DefaultFloorsPayload.accountPolicy.metadata.source, "existing-policy", "MODEL90 default floor save should preserve metadata source");
assert.equal(model90DefaultFloorsPayload.accountPolicy.metadata.lastEditedNamespace, "livingFloorAssumptions.model90DefaultBucketFloors");
assert.equal(JSON.parse(JSON.stringify(model90DefaultFloorsPayload)).valid, true, "MODEL90 default floor save payload should be JSON serializable");

const model90DefaultFloorsStorage = createFakeStorage();
const model90DefaultFloorsSaveResult = storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: model90DefaultFloorsPayload.accountPolicy,
  metadata: { updatedBy: "model90-default-floors-check" },
  storage: model90DefaultFloorsStorage
});
assert.equal(model90DefaultFloorsSaveResult.saved, true, "valid MODEL90 default floors should save through the storage adapter");
assert.deepEqual(
  model90DefaultFloorsStorage.getWrites().map((write) => write.key),
  [storage.createHouseholdExpenseAccountPolicyStorageKey(accountId)],
  "MODEL90 default floor save should write only the household expense account policy key"
);
const model90DefaultFloorsDisplayModel = display.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: model90DefaultFloorsStorage
});
const model90DefaultFloorsDisplayHtml = display.renderHouseholdExpensePolicyDisplay(model90DefaultFloorsDisplayModel);
assert.match(model90DefaultFloorsDisplayHtml, /\$120\.00/, "read-only display should render saved household consumables base amount");
assert.match(model90DefaultFloorsDisplayHtml, /\$80\.00/, "read-only display should render saved transportation adult-driver amount");

const model90DefaultFloorsResetPayload = editor.buildModel90DefaultBucketFloorsResetPayload({
  accountId,
  accountPolicy: model90DefaultFloorsPayload.accountPolicy
});
assert.equal(model90DefaultFloorsResetPayload.valid, true, "MODEL90 default floor reset payload should be valid");
assert.equal(model90DefaultFloorsResetPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.householdConsumables.monthlyBaseAmount, null, "MODEL90 default floor reset should clear base amount");
assert.equal(model90DefaultFloorsResetPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.householdConsumables.monthlyPerMemberAmount, null, "MODEL90 default floor reset should clear per-member amount");
assert.equal(model90DefaultFloorsResetPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.transportationBasics.monthlyPerAdultDriverAmount, null, "MODEL90 default floor reset should clear adult-driver amount");
assert.equal(model90DefaultFloorsResetPayload.accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors.transportationBasics.stateAdjustmentEnabled, true, "MODEL90 default floor reset should restore state adjustment enabled");
assert.deepEqual(plain(model90DefaultFloorsResetPayload.accountPolicy.livingFloorAssumptions.foodAtHome), existingAccountPolicy.livingFloorAssumptions.foodAtHome, "MODEL90 default floor reset should preserve Food at Home assumptions");
assert.deepEqual(
  plain(model90DefaultFloorsResetPayload.accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers),
  existingAccountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers,
  "MODEL90 default floor reset should preserve state multipliers including bucket-specific rows"
);
assert.deepEqual(plain(model90DefaultFloorsResetPayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "MODEL90 default floor reset should preserve graph adjustment overrides");
assert.deepEqual(plain(model90DefaultFloorsResetPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "MODEL90 default floor reset should preserve threshold namespace");
assert.deepEqual(plain(model90DefaultFloorsResetPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "MODEL90 default floor reset should preserve compression namespace");
assert.deepEqual(plain(model90DefaultFloorsResetPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "MODEL90 default floor reset should preserve guardrails");

const invalidModel90DefaultFloorPayload = editor.buildModel90DefaultBucketFloorsSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftModel90DefaultBucketFloors: buildModel90DefaultBucketFloorsDraft({
    householdConsumables: {
      monthlyBaseAmount: "-1",
      monthlyPerMemberAmount: "40",
      stateAdjustmentEnabled: true
    }
  })
});
assert.equal(invalidModel90DefaultFloorPayload.valid, false, "negative MODEL90 default floor dollar values should be rejected before save");
assert.match(invalidModel90DefaultFloorPayload.validationMessages.join(" "), /householdConsumables monthlyBaseAmount/);
assert.equal(Object.prototype.hasOwnProperty.call(invalidModel90DefaultFloorPayload, "accountPolicy"), false, "invalid MODEL90 default floor payload should not produce a storage payload");

const invalidStateCodePayload = editor.buildStateCostAdjustmentMultipliersSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftStateCostAdjustmentMultipliers: buildStateCostAdjustmentMultiplierDraft({
    globalStateRows: [{ stateCode: "ZZ", multiplier: "1.1" }]
  })
});
assert.equal(invalidStateCodePayload.valid, false, "invalid state codes should be rejected before save");
assert.match(invalidStateCodePayload.validationMessages.join(" "), /valid USPS state code/);
assert.equal(Object.prototype.hasOwnProperty.call(invalidStateCodePayload, "accountPolicy"), false, "invalid state code payload should not produce a storage payload");

const invalidLowMultiplierPayload = editor.buildStateCostAdjustmentMultipliersSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftStateCostAdjustmentMultipliers: buildStateCostAdjustmentMultiplierDraft({
    globalStateRows: [{ stateCode: "CO", multiplier: "0.24" }]
  })
});
assert.equal(invalidLowMultiplierPayload.valid, false, "state multipliers below 0.25 should be rejected before save");
assert.match(invalidLowMultiplierPayload.validationMessages.join(" "), /between 0\.25 and 3\.00/);

const invalidHighDefaultMultiplierPayload = editor.buildStateCostAdjustmentMultipliersSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftStateCostAdjustmentMultipliers: buildStateCostAdjustmentMultiplierDraft({
    defaultMultiplier: "3.01"
  })
});
assert.equal(invalidHighDefaultMultiplierPayload.valid, false, "default multipliers above 3.00 should be rejected before save");
assert.match(invalidHighDefaultMultiplierPayload.validationMessages.join(" "), /defaultMultiplier must be between 0\.25 and 3\.00/);

const duplicateStatePayload = editor.buildStateCostAdjustmentMultipliersSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftStateCostAdjustmentMultipliers: buildStateCostAdjustmentMultiplierDraft({
    globalStateRows: [
      { stateCode: "CO", multiplier: "1.08" },
      { stateCode: "co", multiplier: "1.09" }
    ]
  })
});
assert.equal(duplicateStatePayload.valid, false, "duplicate state rows should be rejected before save");
assert.match(duplicateStatePayload.validationMessages.join(" "), /duplicate state multiplier rows/);

const invalidFoodAtHomeDollarPayload = editor.buildFoodAtHomeFloorAssumptionsSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftFoodAtHome: buildFoodAtHomeDraft({
    monthlyAmountsByBand: {
      infantToddler: "-1"
    }
  })
});
assert.equal(invalidFoodAtHomeDollarPayload.valid, false, "negative Food at Home dollar values should be rejected before save");
assert.match(invalidFoodAtHomeDollarPayload.validationMessages.join(" "), /infantToddler monthly amount/);
assert.equal(Object.prototype.hasOwnProperty.call(invalidFoodAtHomeDollarPayload, "accountPolicy"), false, "invalid Food at Home dollar payload should not produce a storage payload");

const invalidFoodAtHomeFactorPayload = editor.buildFoodAtHomeFloorAssumptionsSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  draftFoodAtHome: buildFoodAtHomeDraft({
    householdSizeAdjustmentFactors: {
      "2": "0"
    }
  })
});
assert.equal(invalidFoodAtHomeFactorPayload.valid, false, "invalid Food at Home household factor values should be rejected before save");
assert.match(invalidFoodAtHomeFactorPayload.validationMessages.join(" "), /2 household-size factor/);
assert.equal(Object.prototype.hasOwnProperty.call(invalidFoodAtHomeFactorPayload, "accountPolicy"), false, "invalid Food at Home factor payload should not produce a storage payload");

const savePayload = editor.buildLifestyleRangeSavePayload({
  accountId,
  accountPolicy: existingAccountPolicy,
  rows: missingModel.rows,
  draftRows: draftRowsFromModel(missingModel, {
    groceries: {
      conservativeFloorRatio: 0.73,
      elevatedCeilingRatio: 1.22
    }
  }),
  maxElevatedCeilingRatio: 2
});
assert.equal(savePayload.valid, true, "valid grocery ratio edit should be accepted");
assert.deepEqual(plain(savePayload.accountPolicy.lifestyleRangeOverrides), [{
  conservativeFloorRatio: 0.73,
  elevatedCeilingRatio: 1.22,
  expenseTypeKey: "groceries"
}], "save payload should contain sparse lifestyleRangeOverrides only for changed rows");
assert.deepEqual(plain(savePayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "threshold namespace should be preserved");
assert.deepEqual(plain(savePayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "compression namespace should be preserved");
assert.deepEqual(plain(savePayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "guardrails should be preserved");
assert.deepEqual(plain(savePayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "ratio save payload should preserve graph adjustment overrides");
assert.deepEqual(plain(savePayload.accountPolicy.livingFloorAssumptions), preservedLivingFloorAssumptions, "living-floor assumptions namespace should be preserved by ratio save payload");
assert.equal(savePayload.accountPolicy.metadata.source, "existing-policy", "metadata should be preserved");
assert.equal(savePayload.accountPolicy.metadata.lastEditedNamespace, "lifestyleRangeOverrides");
assert.equal(savePayload.accountPolicy.lifestyleRangeOverrides.some((row) => row.expenseTypeKey === "streamingDigitalSubscriptions"), false, "unchanged rows should not be saved as overrides");
assert.equal(JSON.parse(JSON.stringify(savePayload)).valid, true, "save payload should be JSON serializable");

const saveResult = storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: savePayload.accountPolicy,
  metadata: { updatedBy: "check" },
  storage: context.localStorage
});
assert.equal(saveResult.saved, true, "valid ratio edit should save through the storage adapter");

const validModel = editor.buildHouseholdExpensePolicyEditorModel({
  accountId,
  storage: context.localStorage
});
const validGroceries = validModel.rows.find((row) => row.expenseTypeKey === "groceries");
assert.ok(validGroceries, "groceries should still render with account override");
assert.equal(validModel.status.code, "accountOverride", "valid saved policy should show account override source");
assert.equal(validGroceries.overrideStatus, "accountOverride", "valid saved override should mark row status");
assert.equal(validGroceries.resolvedConservativeFloorRatio, 0.73, "valid saved override should affect resolved floor");
assert.equal(validGroceries.resolvedElevatedCeilingRatio, 1.22, "valid saved override should affect resolved ceiling");
assert.deepEqual(plain(validModel.accountPolicy.livingFloorAssumptions), preservedLivingFloorAssumptions, "saved ratio edit should not drop living-floor assumptions");
assert.deepEqual(plain(validModel.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "saved ratio edit should not drop graph adjustment overrides");
assert.match(editor.renderHouseholdExpensePolicyEditor(validModel), /Account override/);

const resetPayload = editor.buildLifestyleRangeSavePayload({
  accountId,
  accountPolicy: validModel.accountPolicy,
  rows: validModel.rows,
  draftRows: draftRowsFromModel(validModel),
  maxElevatedCeilingRatio: 2
});
assert.equal(resetPayload.valid, true, "reset draft should be valid");
assert.deepEqual(plain(resetPayload.accountPolicy.lifestyleRangeOverrides), [], "reset row should remove lifestyle range override");
assert.deepEqual(plain(resetPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "reset should preserve threshold namespace");
assert.deepEqual(plain(resetPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "reset should preserve compression namespace");
assert.deepEqual(plain(resetPayload.accountPolicy.livingFloorAssumptions), preservedLivingFloorAssumptions, "reset row save payload should preserve living-floor assumptions");
assert.deepEqual(plain(resetPayload.accountPolicy.graphAdjustmentOverrides), existingAccountPolicy.graphAdjustmentOverrides, "reset row save payload should preserve graph adjustment overrides");

const invalidPayload = editor.buildLifestyleRangeSavePayload({
  accountId,
  accountPolicy: missingModel.accountPolicy,
  rows: missingModel.rows,
  draftRows: draftRowsFromModel(missingModel, {
    groceries: {
      conservativeFloorRatio: 1.25,
      elevatedCeilingRatio: 0.95
    }
  }),
  maxElevatedCeilingRatio: 2
});
assert.equal(invalidPayload.valid, false, "invalid ratios should be rejected before save");
assert.ok(invalidPayload.validationMessages.groceries.length >= 2, "invalid row should expose row-level validation messages");
assert.equal(Object.prototype.hasOwnProperty.call(invalidPayload, "accountPolicy"), false, "invalid save should not produce a storage payload");

const overMaxPayload = editor.buildLifestyleRangeSavePayload({
  accountId,
  accountPolicy: missingModel.accountPolicy,
  rows: missingModel.rows,
  draftRows: draftRowsFromModel(missingModel, {
    groceries: {
      conservativeFloorRatio: 0.7,
      elevatedCeilingRatio: 2.2
    }
  }),
  maxElevatedCeilingRatio: 2
});
assert.equal(overMaxPayload.valid, false, "ceiling above hard max should be rejected before save");

const policyInputs = {
  defaultLifestyleRangePolicies: lensAnalysis.householdExpenseLifestyleRangePolicy.listLifestyleRangePolicies(),
  defaultCompressionPolicyRules: lensAnalysis.householdExpenseCompressionPolicy.getHouseholdExpenseCompressionPolicyRules(),
  defaultCompressionThresholdRules: lensAnalysis.expenseCompressionThresholds.getExpenseCompressionThresholdRules()
};
const maliciousPolicy = {
  version: 1,
  lifestyleRangeOverrides: [{
    expenseTypeKey: "rentOrMortgagePayment",
    sliderEligible: true,
    conservativeFloorRatio: 0,
    elevatedCeilingRatio: 2
  }],
  compressionThresholdOverrides: [],
  compressionPolicyOverrides: [],
  guardrails: {},
  metadata: { source: "malicious-check" }
};
const maliciousResolved = lensAnalysis.householdExpenseAccountPolicyResolver.resolveHouseholdExpenseAccountPolicy(Object.assign({}, policyInputs, {
  accountPolicy: maliciousPolicy
}));
const rentPolicy = maliciousResolved.resolvedLifestyleRangePolicies.find((row) => row.expenseTypeKey === "rentOrMortgagePayment");
assert.ok(rentPolicy, "rent policy should resolve");
assert.equal(rentPolicy.sliderEligible, false, "resolver should still protect mortgage/rent from malicious override");

storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: maliciousPolicy,
  metadata: { updatedBy: "check" },
  storage: context.localStorage
});
const maliciousModel = editor.buildHouseholdExpensePolicyEditorModel({
  accountId,
  storage: context.localStorage
});
assert.equal(
  maliciousModel.rows.some((row) => row.expenseTypeKey === "rentOrMortgagePayment"),
  false,
  "malicious protected override should not create an editable row"
);

const corruptStorage = createFakeStorage();
const corruptKey = storage.createHouseholdExpenseAccountPolicyStorageKey(accountId);
corruptStorage.setRaw(corruptKey, "{not-json");
const corruptModel = editor.buildHouseholdExpensePolicyEditorModel({
  accountId,
  storage: corruptStorage
});
assert.equal(corruptModel.status.code, "fallbackPolicy", "corrupt saved policy should show fallback policy source");
assert.equal(corruptModel.rows.length, defaultSliderEligibleRows.length, "corrupt policy should fall back to seed rows");
assert.ok(corruptModel.counts.warnings > 0, "corrupt policy should expose warning count");
assert.equal(corruptModel.rows.every((row) => row.overrideStatus === "defaultSeedPolicy"), true, "corrupt policy should discard override statuses");

const initializeModel = editor.initializeHouseholdExpenseAccountPolicyAdminEditor();
assert.ok(initializeModel, "initializer should return a model when host exists");
assert.equal(host.listenerType, "click", "initializer should attach a delegated click handler once");
assert.match(host.innerHTML, /Income Impact Adjustment Controls/);
assert.match(host.innerHTML, /Food at Home Floor Assumptions/);
assert.match(host.innerHTML, /data-household-expense-policy-save/);
assert.match(host.innerHTML, /data-household-expense-policy-ratio-input/);
assert.match(host.innerHTML, /data-graph-adjustment-type-input/);
assert.match(host.innerHTML, /data-graph-adjustment-save/);
assert.match(host.innerHTML, /data-graph-adjustment-reset-row/);
assert.match(host.innerHTML, /data-food-at-home-floor-save/);
assert.match(host.innerHTML, /data-food-at-home-floor-reset/);
assert.match(host.innerHTML, /State Cost Adjustment Multipliers/);
assert.match(host.innerHTML, /data-state-cost-adjustment-save/);
assert.match(host.innerHTML, /data-state-cost-adjustment-add-row/);
assert.match(host.innerHTML, /data-state-cost-adjustment-reset/);
assert.match(host.innerHTML, /MODEL90 Default Floor Assumptions/);
assert.match(host.innerHTML, /data-model90-default-bucket-floors-save/);
assert.match(host.innerHTML, /data-model90-default-bucket-floors-reset/);
assert.equal(
  (host.innerHTML.match(/data-graph-adjustment-type-input/g) || []).length,
  defaultSliderEligibleRows.length,
  "initializer should render one graph adjustment dropdown per graph-affecting row"
);
assert.doesNotMatch(host.innerHTML, /data-state-cost-adjustment-multiplier-input|data-bucket-state-adjustment-multiplier-input/);

console.log("household expense account policy admin editor checks passed");
