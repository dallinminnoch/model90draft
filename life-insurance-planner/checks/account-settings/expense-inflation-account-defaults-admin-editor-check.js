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
    getWrites() {
      return writes.slice();
    },
    clearWrites() {
      writes.length = 0;
    }
  };
}

function createContext(storage) {
  const context = {
    console,
    localStorage: storage || createFakeStorage(),
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      }
    },
    LensApp: {
      accountSettings: {}
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  const source = readRepoFile(relativePath);
  vm.runInContext(source, context, { filename: relativePath });
  return source;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createField(fieldName, value) {
  return {
    value: String(value),
    getAttribute(name) {
      return name === "data-expense-inflation-default-field" ? fieldName : null;
    }
  };
}

function createHost(fields, accountId) {
  const feedback = { textContent: "" };
  return {
    innerHTML: "",
    querySelector(selector) {
      if (selector === "[data-expense-inflation-defaults-feedback]") {
        return feedback;
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-expense-inflation-default-field]" ? fields : [];
    },
    getAttribute(name) {
      return name === "data-expense-inflation-account-id" ? accountId : null;
    },
    setAttribute() {},
    feedback
  };
}

const pageSource = readRepoFile("pages/admin-accounts.html");
const editorSource = readRepoFile("app/features/account-settings/expense-inflation-account-defaults-admin-editor.js");
const scripts = getScriptSources(pageSource);

assertScriptOrder(scripts, [
  "../app/features/account-settings/expense-inflation-account-defaults-storage.js",
  "../app/features/account-settings/expense-inflation-account-defaults-resolver.js",
  "../app/features/account-settings/expense-inflation-account-defaults-admin-editor.js"
]);

assert.match(pageSource, /data-expense-inflation-account-defaults-panel/);
assert.match(pageSource, /data-expense-inflation-account-defaults-editor/);
assert.doesNotMatch(pageSource, /function\s+initializeExpenseInflationAccountDefaultsAdminEditor/);
assert.match(editorSource, /Owner: admin editor for browser-local account expense inflation defaults/);
assert.doesNotMatch(editorSource, /householdExpenseInflationRatePercent/);

const storage = createFakeStorage();
const context = createContext(storage);
loadScript(context, "app/features/account-settings/expense-inflation-account-defaults-storage.js");
loadScript(context, "app/features/account-settings/expense-inflation-account-defaults-resolver.js");
loadScript(context, "app/features/account-settings/expense-inflation-account-defaults-admin-editor.js");

const accountSettings = context.LensApp.accountSettings;
const storageApi = accountSettings.expenseInflationAccountDefaultsStorage;
const adminEditor = accountSettings.expenseInflationAccountDefaultsAdminEditor;
assert.ok(adminEditor, "admin editor module should load");
assert.equal(typeof adminEditor.buildExpenseInflationAccountDefaultsEditorModel, "function");
assert.equal(typeof adminEditor.renderExpenseInflationAccountDefaultsEditor, "function");
assert.equal(typeof adminEditor.readExpenseInflationDefaultsDraft, "function");
assert.equal(typeof adminEditor.saveExpenseInflationAccountDefaultsFromHost, "function");
assert.equal(typeof adminEditor.resetExpenseInflationAccountDefaultsFromHost, "function");
assert.equal(typeof adminEditor.initializeExpenseInflationAccountDefaultsAdminEditor, "function");

const expectedFields = [
  "generalInflationRatePercent",
  "healthcareInflationRatePercent",
  "longTermCareInflationRatePercent",
  "educationInflationRatePercent",
  "housingOperatingInflationRatePercent",
  "childcareDependentCareInflationRatePercent",
  "foodInflationRatePercent",
  "transportationOperatingInflationRatePercent",
  "finalExpenseInflationRatePercent"
];
assert.deepEqual(
  plain(adminEditor.FIELD_DEFINITIONS).map(function (definition) { return definition.fieldName; }),
  expectedFields,
  "editor should define exactly the nine account-level expense inflation fields"
);

const systemModel = adminEditor.buildExpenseInflationAccountDefaultsEditorModel({
  accountId: "account-demo",
  storage
});
assert.equal(systemModel.status.code, "systemDefault");
assert.equal(systemModel.rows.length, 9);
assert.equal(systemModel.rows.find((row) => row.fieldName === "generalInflationRatePercent").value, 3);
assert.equal(systemModel.rows.find((row) => row.fieldName === "foodInflationRatePercent").value, 3.25);

const html = adminEditor.renderExpenseInflationAccountDefaultsEditor(systemModel);
expectedFields.forEach(function (fieldName) {
  assert.equal(
    (html.match(new RegExp(`data-expense-inflation-default-field="${fieldName}"`, "g")) || []).length,
    1,
    `${fieldName} should render exactly one control`
  );
});
assert.doesNotMatch(html, /householdExpenseInflationRatePercent/);
assert.match(html, /Expense Inflation Defaults/);
assert.match(html, /General inflation/);
assert.match(html, /Final expense inflation/);

const fields = expectedFields.map(function (fieldName, index) {
  return createField(fieldName, 1 + index / 10);
});
const host = createHost(fields, "account-demo");
const draft = adminEditor.readExpenseInflationDefaultsDraft(host);
assert.equal(draft.error, undefined);
assert.equal(draft.defaults.generalInflationRatePercent, 1);
assert.equal(draft.defaults.finalExpenseInflationRatePercent, 1.8);

storage.clearWrites();
const saveResult = adminEditor.saveExpenseInflationAccountDefaultsFromHost(host);
assert.equal(saveResult.saved, true);
assert.equal(storage.getWrites().length, 1, "valid save should write storage once");
assert.equal(storage.getWrites()[0].op, "setItem");
assert.match(storage.getWrites()[0].key, /^model90\.expenseInflationAccountDefaults\.v1:account-demo$/);

const reloaded = storageApi.loadExpenseInflationAccountDefaults({
  accountId: "account-demo",
  storage
});
assert.equal(reloaded.status, "loaded");
assert.equal(reloaded.accountDefaults.expenseInflationDefaults.generalInflationRatePercent, 1);
assert.equal(reloaded.accountDefaults.expenseInflationDefaults.finalExpenseInflationRatePercent, 1.8);

const savedModel = adminEditor.buildExpenseInflationAccountDefaultsEditorModel({
  accountId: "account-demo",
  storage
});
assert.equal(savedModel.status.code, "accountDefault");
assert.equal(savedModel.rows.find((row) => row.fieldName === "finalExpenseInflationRatePercent").value, 1.8);

storage.clearWrites();
const resetResult = adminEditor.resetExpenseInflationAccountDefaultsFromHost(host);
assert.equal(resetResult.removed, true);
assert.equal(storage.getWrites().length, 1, "reset should remove storage once");
assert.equal(storage.getWrites()[0].op, "removeItem");

const resetModel = adminEditor.buildExpenseInflationAccountDefaultsEditorModel({
  accountId: "account-demo",
  storage
});
assert.equal(resetModel.status.code, "systemDefault");
assert.equal(resetModel.rows.find((row) => row.fieldName === "finalExpenseInflationRatePercent").value, 3.75);

storage.clearWrites();
const invalidHost = createHost(
  expectedFields.map(function (fieldName) {
    return createField(fieldName, fieldName === "foodInflationRatePercent" ? "invalid" : 3);
  }),
  "invalid-account"
);
const invalidSaveResult = adminEditor.saveExpenseInflationAccountDefaultsFromHost(invalidHost);
assert.equal(invalidSaveResult.status, "validationFailed");
assert.equal(invalidSaveResult.saved, false);
assert.match(invalidSaveResult.error, /Food inflation must be a numeric percentage/);
assert.equal(storage.getWrites().length, 0, "invalid input should not write storage");

[
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-obligation-ledger.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /expenseInflationAccountDefaults(?:AdminEditor|Resolver|Storage)|loadExpenseInflationAccountDefaults|resolveExpenseInflationDefaults/,
    `${relativePath} should not consume account expense inflation defaults outside Analysis Setup seeding.`
  );
});

console.log("Expense inflation account defaults admin editor check passed.");
