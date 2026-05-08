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
  "../app/features/lens-analysis/household-expense-account-policy-resolver.js",
  "../app/features/account-settings/household-expense-account-policy-admin-display.js",
  "../app/features/account-settings/household-expense-account-policy-admin-editor.js"
]);

assert.match(editorSource, /householdExpenseAccountPolicyStorage/);
assert.match(editorSource, /householdExpenseAccountPolicyResolver/);
assert.match(editorSource, /TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID/);
assert.match(editorSource, /temporaryLocalAdminFallback/);
assert.match(editorSource, /"livingFloorAssumptions\.foodAtHome"/);
assert.match(editorSource, /"livingFloorAssumptions\.stateCostAdjustmentMultipliers"/);
assert.match(editorSource, /"foodAtHome\.monthlyAmountsByBand"/);
assert.match(editorSource, /"foodAtHome\.householdSizeAdjustmentFactors"/);
assert.match(editorSource, /"stateCostAdjustmentMultipliers\.defaultMultiplier"/);
assert.match(editorSource, /"stateCostAdjustmentMultipliers\.globalStateAdjustmentMultipliersByState"/);
assert.match(editorSource, /saveHouseholdExpenseAccountPolicy/);
assert.match(editorSource, /initializeHouseholdExpenseAccountPolicyAdminDisplay/);
assert.match(editorSource, /data-food-at-home-floor-save/);
assert.match(editorSource, /data-food-at-home-floor-reset/);
assert.match(editorSource, /data-state-cost-adjustment-multipliers-editor/);
assert.match(editorSource, /data-state-cost-adjustment-default-multiplier/);
assert.match(editorSource, /data-state-cost-adjustment-add-row/);
assert.match(editorSource, /data-state-cost-adjustment-save/);
assert.match(editorSource, /data-state-cost-adjustment-reset/);
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
  /data-state-cost-adjustment-multiplier-input|data-model90-default-bucket-floor-input|data-bucket-state-adjustment-multiplier-input/
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
assert.equal(typeof editor.validateFoodAtHomeFloorAssumptionsDraft, "function");
assert.equal(typeof editor.validateStateCostAdjustmentMultipliersDraft, "function");
assert.equal(typeof editor.buildFoodAtHomeFloorAssumptionsSavePayload, "function");
assert.equal(typeof editor.buildFoodAtHomeFloorAssumptionsResetPayload, "function");
assert.equal(typeof editor.buildStateCostAdjustmentMultipliersSavePayload, "function");
assert.equal(typeof editor.buildStateCostAdjustmentMultipliersResetPayload, "function");
assert.equal(typeof editor.saveFoodAtHomeFloorAssumptions, "function");
assert.equal(typeof editor.resetFoodAtHomeFloorAssumptions, "function");
assert.equal(typeof editor.saveStateCostAdjustmentMultipliers, "function");
assert.equal(typeof editor.resetStateCostAdjustmentMultipliers, "function");
assert.equal(typeof editor.initializeHouseholdExpenseAccountPolicyAdminEditor, "function");
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
assert.ok(plain(editor.STATE_CODE_VALUES).includes("CO"), "State multiplier editor should expose USPS state codes");

const defaultLifestyleRows = lensAnalysis.householdExpenseLifestyleRangePolicy.listLifestyleRangePolicies();
const defaultSliderEligibleRows = defaultLifestyleRows.filter((row) => row.sliderEligible === true);
assert.ok(defaultSliderEligibleRows.length > 0, "seed policy should have slider-eligible rows for editor preview");

const accountId = editor.TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
const missingModel = editor.buildHouseholdExpensePolicyEditorModel({
  accountId,
  storage: context.localStorage
});
assert.equal(missingModel.status.code, "defaultSeedPolicy", "missing saved policy should show default seed policy source");
assert.equal(missingModel.rows.length, defaultSliderEligibleRows.length, "editor should render only seed slider-eligible rows");
assert.equal(missingModel.rows.every((row) => row.overrideStatus === "defaultSeedPolicy"), true, "missing policy rows should be default-only");
assert.equal(missingModel.foodAtHomeFloorAssumptions.source, "ADMIN_ENTERED", "Food at Home editor should default source to ADMIN_ENTERED");
assert.equal(missingModel.foodAtHomeFloorAssumptions.sourcePeriod, null, "empty Food at Home editor should have blank source period");
assert.equal(missingModel.foodAtHomeFloorAssumptions.bandRows.length, 9, "Food at Home editor should render nine band rows");
assert.equal(missingModel.foodAtHomeFloorAssumptions.householdSizeAdjustmentFactorRows.length, 6, "Food at Home editor should render six household-size factor rows");
assert.equal(missingModel.stateCostAdjustmentMultipliers.defaultMultiplier, 1, "empty State Cost editor should default multiplier to 1");
assert.equal(missingModel.stateCostAdjustmentMultipliers.defaultMultiplierInputValue, "1", "empty State Cost editor should render default multiplier value");
assert.equal(missingModel.stateCostAdjustmentMultipliers.globalStateRows.length, 0, "empty State Cost editor should render no state rows");
assert.deepEqual(plain(missingModel.stateCostAdjustmentMultipliers.bucketStateAdjustmentMultipliers), {}, "empty State Cost editor should have no bucket-specific state rows");
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
assert.match(missingHtml, /Lifestyle Range Overrides/);
assert.match(missingHtml, /Ratio Controls/);
assert.match(missingHtml, /Affects all users on this account/);
assert.match(missingHtml, /Default Floor/);
assert.match(missingHtml, /Resolved Ceiling/);
assert.match(missingHtml, /data-household-expense-policy-save/);
assert.match(missingHtml, /data-household-expense-policy-reset-row/);
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
assert.equal(
  (missingHtml.match(/data-household-expense-policy-ratio-input/g) || []).length,
  defaultSliderEligibleRows.length * 2,
  "only the two ratio controls should render for each slider-eligible row"
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
assert.doesNotMatch(
  missingHtml,
  /data-ratio-field="sliderEligible"|data-ratio-field="rangeBehavior"|data-ratio-field="canPause"|data-ratio-field="canReduceToZero"|data-ratio-field="compressionOrderGroup"|data-ratio-field="compressionOrderRank"|data-ratio-field="sourcePolicyDecision"|data-ratio-field="threshold/
);
assert.doesNotMatch(missingHtml, /<select\b/);
assert.doesNotMatch(
  missingHtml,
  /data-state-cost-adjustment-multiplier-input|data-model90-default-bucket-floor-input|data-bucket-state-adjustment-multiplier-input/,
  "Food at Home slice should not render state multiplier or MODEL90 bucket floor inputs"
);

const existingAccountPolicy = {
  version: 1,
  lifestyleRangeOverrides: [],
  compressionThresholdOverrides: [{ thresholdId: "streamingDigitalSubscriptions", tiers: { average: 95 } }],
  compressionPolicyOverrides: [{ policyId: "travelVacations", notes: "preserve me" }],
  guardrails: { maxElevatedCeilingRatio: 1.9 },
  livingFloorAssumptions: plain(preservedLivingFloorAssumptions),
  metadata: { source: "existing-policy" }
};

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
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.compressionThresholdOverrides), existingAccountPolicy.compressionThresholdOverrides, "State Cost reset should preserve threshold namespace");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.compressionPolicyOverrides), existingAccountPolicy.compressionPolicyOverrides, "State Cost reset should preserve compression namespace");
assert.deepEqual(plain(stateMultiplierResetPayload.accountPolicy.guardrails), existingAccountPolicy.guardrails, "State Cost reset should preserve guardrails");

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
assert.match(host.innerHTML, /Lifestyle Range Overrides/);
assert.match(host.innerHTML, /Food at Home Floor Assumptions/);
assert.match(host.innerHTML, /data-household-expense-policy-save/);
assert.match(host.innerHTML, /data-household-expense-policy-ratio-input/);
assert.match(host.innerHTML, /data-food-at-home-floor-save/);
assert.match(host.innerHTML, /data-food-at-home-floor-reset/);
assert.match(host.innerHTML, /State Cost Adjustment Multipliers/);
assert.match(host.innerHTML, /data-state-cost-adjustment-save/);
assert.match(host.innerHTML, /data-state-cost-adjustment-add-row/);
assert.match(host.innerHTML, /data-state-cost-adjustment-reset/);
assert.doesNotMatch(host.innerHTML, /<select\b/);
assert.doesNotMatch(host.innerHTML, /data-state-cost-adjustment-multiplier-input|data-model90-default-bucket-floor-input|data-bucket-state-adjustment-multiplier-input/);

console.log("household expense account policy admin editor checks passed");
