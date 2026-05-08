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
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    setRaw(key, value) {
      values.set(key, String(value));
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
assert.match(editorSource, /editableNamespace:\s*"lifestyleRangeOverrides"/);
assert.match(editorSource, /editableFields:\s*\["conservativeFloorRatio",\s*"elevatedCeilingRatio"\]/);
assert.match(editorSource, /saveHouseholdExpenseAccountPolicy/);
assert.match(editorSource, /initializeHouseholdExpenseAccountPolicyAdminDisplay/);
assert.doesNotMatch(
  editorSource,
  /removeHouseholdExpenseAccountPolicy|\.setItem\s*\(|\.removeItem\s*\(|analysisSettings|clientRecords|profileRecord|updateClientRecord|saveAnalysisSetupSettings/
);
assert.doesNotMatch(
  editorSource,
  /income-loss-impact-display|timeline-graph|graph-model|Layer 5|normalize-lens-model|formulas|methods|app\.js|styles\.css|components\.css/
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
const editor = context.LensApp.accountSettings.householdExpenseAccountPolicyAdminEditor;
assert.ok(editor, "admin editor module should load");
assert.equal(typeof editor.buildHouseholdExpensePolicyEditorModel, "function");
assert.equal(typeof editor.renderHouseholdExpensePolicyEditor, "function");
assert.equal(typeof editor.buildLifestyleRangeSavePayload, "function");
assert.equal(typeof editor.initializeHouseholdExpenseAccountPolicyAdminEditor, "function");

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
assert.equal(
  (missingHtml.match(/data-household-expense-policy-ratio-input/g) || []).length,
  defaultSliderEligibleRows.length * 2,
  "only the two ratio controls should render for each slider-eligible row"
);
assert.doesNotMatch(
  missingHtml,
  /data-ratio-field="sliderEligible"|data-ratio-field="rangeBehavior"|data-ratio-field="canPause"|data-ratio-field="canReduceToZero"|data-ratio-field="compressionOrderGroup"|data-ratio-field="compressionOrderRank"|data-ratio-field="sourcePolicyDecision"|data-ratio-field="threshold/
);
assert.doesNotMatch(missingHtml, /<select\b/);

const existingAccountPolicy = {
  version: 1,
  lifestyleRangeOverrides: [],
  compressionThresholdOverrides: [{ thresholdId: "streamingDigitalSubscriptions", tiers: { average: 95 } }],
  compressionPolicyOverrides: [{ policyId: "travelVacations", notes: "preserve me" }],
  guardrails: { maxElevatedCeilingRatio: 1.9 },
  metadata: { source: "existing-policy" }
};

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
assert.match(host.innerHTML, /data-household-expense-policy-save/);
assert.match(host.innerHTML, /data-household-expense-policy-ratio-input/);
assert.doesNotMatch(host.innerHTML, /<select\b/);

console.log("household expense account policy admin editor checks passed");
