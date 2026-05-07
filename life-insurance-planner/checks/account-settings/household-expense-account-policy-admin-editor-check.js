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

const pageSource = readRepoFile("pages/admin-accounts.html");
const editorSource = readRepoFile("app/features/account-settings/household-expense-account-policy-admin-editor.js");
const scripts = getScriptSources(pageSource);
const policyPanelMatch = pageSource.match(/<section class="admin-accounts-panel" data-household-expense-account-policy-panel>[\s\S]*?<\/section>/);

assert.ok(policyPanelMatch, "household expense policy panel should exist");
assert.match(policyPanelMatch[0], /data-household-expense-account-policy-editor/);
assertScriptOrder(scripts, [
  "../app/features/account-settings/household-expense-account-policy-storage.js",
  "../app/features/lens-analysis/expense-compression-thresholds.js",
  "../app/features/lens-analysis/household-expense-compression-policy.js",
  "../app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
  "../app/features/lens-analysis/household-expense-account-policy-resolver.js",
  "../app/features/account-settings/household-expense-account-policy-admin-display.js",
  "../app/features/account-settings/household-expense-account-policy-admin-editor.js"
]);

assert.match(editorSource, /householdExpenseAccountPolicyStorage/);
assert.match(editorSource, /householdExpenseAccountPolicyResolver/);
assert.match(editorSource, /TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID/);
assert.match(editorSource, /temporaryLocalAdminFallback/);
assert.match(editorSource, /sparseOverridePreviewOnly:\s*true/);
assert.match(editorSource, /editableControlsRendered:\s*false/);
assert.match(editorSource, /saveControlsRendered:\s*false/);
assert.match(editorSource, /storageWrites:\s*false/);
assert.doesNotMatch(
  editorSource,
  /saveHouseholdExpenseAccountPolicy|removeHouseholdExpenseAccountPolicy|\.setItem\s*\(|\.removeItem\s*\(|analysisSettings|clientRecords|profileRecord|updateClientRecord|saveAnalysisSetupSettings/
);
assert.doesNotMatch(
  editorSource,
  /income-loss-impact-display|timeline-graph|graph-model|Layer 5|normalize-lens-model|formulas|methods|app\.js|styles\.css|components\.css/
);

const host = {
  innerHTML: ""
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
loadScript(context, "app/features/lens-analysis/expense-compression-thresholds.js");
loadScript(context, "app/features/lens-analysis/household-expense-compression-policy.js");
loadScript(context, "app/features/lens-analysis/household-expense-lifestyle-range-policy.js");
loadScript(context, "app/features/lens-analysis/household-expense-account-policy-resolver.js");
loadScript(context, "app/features/account-settings/household-expense-account-policy-admin-display.js");
loadScript(context, "app/features/account-settings/household-expense-account-policy-admin-editor.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const storage = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
const editor = context.LensApp.accountSettings.householdExpenseAccountPolicyAdminEditor;
assert.ok(editor, "admin editor module should load");
assert.equal(typeof editor.buildHouseholdExpensePolicyEditorModel, "function");
assert.equal(typeof editor.renderHouseholdExpensePolicyEditor, "function");
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

[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "daycareChildcare",
  "healthInsurancePremiums",
  "charitableGiving",
  "federalStateLocalIncomeTaxPayments"
].forEach(function (typeKey) {
  assert.equal(
    missingModel.rows.some((row) => row.expenseTypeKey === typeKey),
    false,
    `${typeKey} should be excluded from the editable-preview grid`
  );
});

const missingHtml = editor.renderHouseholdExpensePolicyEditor(missingModel);
assert.match(missingHtml, /Lifestyle Range Overrides/);
assert.match(missingHtml, /Editable Preview/);
assert.match(missingHtml, /Default Floor/);
assert.match(missingHtml, /Resolved Ceiling/);
assert.match(missingHtml, /groceries/);
assert.doesNotMatch(missingHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save/);

const validPolicy = {
  version: 1,
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "groceries",
      conservativeFloorRatio: 0.73,
      elevatedCeilingRatio: 1.22
    }
  ],
  compressionThresholdOverrides: [],
  compressionPolicyOverrides: [],
  guardrails: {},
  metadata: { source: "editor-check" }
};

storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: validPolicy,
  metadata: { updatedBy: "check" },
  storage: context.localStorage
});

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
assert.equal(JSON.stringify(validGroceries.sparseOverridePreview), JSON.stringify({
  conservativeFloorRatio: 0.73,
  elevatedCeilingRatio: 1.22,
  expenseTypeKey: "groceries"
}));
assert.match(editor.renderHouseholdExpensePolicyEditor(validModel), /Account override/);

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
assert.match(host.innerHTML, /Lifestyle Range Overrides/);
assert.doesNotMatch(host.innerHTML, /<input\b|<select\b|<button\b|data-household-expense-policy-save/);

console.log("household expense account policy admin editor checks passed");
