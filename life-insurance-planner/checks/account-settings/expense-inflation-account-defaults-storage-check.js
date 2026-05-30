#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const storagePath = path.join(
  repoRoot,
  "app",
  "features",
  "account-settings",
  "expense-inflation-account-defaults-storage.js"
);
const storageSource = fs.readFileSync(storagePath, "utf8");

const context = {
  LensApp: {
    accountSettings: {}
  },
  console
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(storageSource, context, { filename: storagePath });

const storageModule = context.LensApp.accountSettings.expenseInflationAccountDefaultsStorage;
assert.ok(storageModule, "expense inflation account defaults storage should load");

[
  "EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION",
  "EXPENSE_INFLATION_ACCOUNT_DEFAULTS_SETTINGS_TYPE",
  "EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_PREFIX",
  "EXPENSE_INFLATION_RATE_FIELDS",
  "createExpenseInflationAccountDefaultsStorageKey",
  "getExpenseInflationSystemDefaults",
  "loadExpenseInflationAccountDefaults",
  "saveExpenseInflationAccountDefaults",
  "removeExpenseInflationAccountDefaults"
].forEach(function (key) {
  assert.ok(Object.prototype.hasOwnProperty.call(storageModule, key), `${key} export should exist`);
});

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
const expectedDefaults = {
  version: 1,
  generalInflationRatePercent: 3,
  healthcareInflationRatePercent: 5,
  longTermCareInflationRatePercent: 5,
  educationInflationRatePercent: 5,
  housingOperatingInflationRatePercent: 3.5,
  childcareDependentCareInflationRatePercent: 4,
  foodInflationRatePercent: 3.25,
  transportationOperatingInflationRatePercent: 3.5,
  finalExpenseInflationRatePercent: 3.75
};

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
    has(key) {
      return values.has(key);
    },
    setRaw(key, value) {
      values.set(key, value);
    }
  };
}

function hasWarning(result, code) {
  return Array.isArray(result.warnings) && result.warnings.some((warning) => warning.code === code);
}

function hasDataGap(result, code) {
  return Array.isArray(result.dataGaps) && result.dataGaps.some((dataGap) => dataGap.code === code);
}

function serializable(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.equal(storageModule.EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION, 1);
assert.equal(storageModule.EXPENSE_INFLATION_ACCOUNT_DEFAULTS_SETTINGS_TYPE, "expenseInflationDefaults");
assert.deepEqual(serializable(storageModule.EXPENSE_INFLATION_RATE_FIELDS), expectedFields);

const systemDefaults = storageModule.getExpenseInflationSystemDefaults();
assert.deepEqual(serializable(systemDefaults), expectedDefaults, "system defaults should include exactly the nine final expense inflation rates");
assert.equal(
  Object.prototype.hasOwnProperty.call(systemDefaults, "householdExpenseInflationRatePercent"),
  false,
  "legacy household expense inflation should not be part of account defaults"
);

const keyA = storageModule.createExpenseInflationAccountDefaultsStorageKey("account-a");
const keyB = storageModule.createExpenseInflationAccountDefaultsStorageKey("account-b");
assert.notEqual(keyA, keyB, "storage key should be account-scoped");
assert.match(keyA, /^model90\.expenseInflationAccountDefaults\.v1:/);

const fakeStorage = createFakeStorage();
const customDefaults = {
  generalInflationRatePercent: 2.75,
  healthcareInflationRatePercent: 4.5,
  longTermCareInflationRatePercent: 5.25,
  educationInflationRatePercent: 5.5,
  housingOperatingInflationRatePercent: 3.75,
  childcareDependentCareInflationRatePercent: 4.25,
  foodInflationRatePercent: 3.5,
  transportationOperatingInflationRatePercent: 3.85,
  finalExpenseInflationRatePercent: 4.1
};

const saveResult = storageModule.saveExpenseInflationAccountDefaults({
  accountId: "account-a",
  defaults: customDefaults,
  metadata: {
    source: "check",
    updatedAt: "2026-05-30T12:00:00.000Z",
    updatedBy: "storage-check"
  },
  storage: fakeStorage
});
assert.equal(saveResult.status, "saved");
assert.equal(saveResult.saved, true);
assert.equal(saveResult.accountId, "account-a");
assert.equal(saveResult.envelope.settingsType, "expenseInflationDefaults");
assert.deepEqual(serializable(saveResult.accountDefaults.expenseInflationDefaults), {
  version: 1,
  ...customDefaults
});
assert.equal(fakeStorage.has(keyA), true, "save should write account-scoped key");

const loadResult = storageModule.loadExpenseInflationAccountDefaults({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(loadResult.status, "loaded");
assert.deepEqual(serializable(loadResult.accountDefaults.expenseInflationDefaults), {
  version: 1,
  ...customDefaults
});
assert.equal(loadResult.metadata.source, "check");
assert.doesNotThrow(function () {
  JSON.stringify(loadResult);
});

const removeResult = storageModule.removeExpenseInflationAccountDefaults({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(removeResult.status, "removed");
assert.equal(removeResult.removed, true);
assert.equal(fakeStorage.has(keyA), false, "remove should delete account-scoped key");

const missingResult = storageModule.loadExpenseInflationAccountDefaults({
  accountId: "missing-account",
  storage: fakeStorage
});
assert.equal(missingResult.status, "fallback");
assert.ok(hasWarning(missingResult, "missing-expense-inflation-account-defaults"));
assert.deepEqual(serializable(missingResult.accountDefaults.expenseInflationDefaults), expectedDefaults);

fakeStorage.setRaw(keyA, "{bad json");
const corruptResult = storageModule.loadExpenseInflationAccountDefaults({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(corruptResult.status, "fallback");
assert.ok(hasWarning(corruptResult, "corrupt-expense-inflation-account-defaults"));

fakeStorage.setRaw(keyA, JSON.stringify({
  version: 1,
  settingsType: "wrongType",
  accountId: "account-a",
  accountDefaults: {
    expenseInflationDefaults: customDefaults
  }
}));
const wrongTypeResult = storageModule.loadExpenseInflationAccountDefaults({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(wrongTypeResult.status, "fallback");
assert.ok(hasWarning(wrongTypeResult, "wrong-expense-inflation-account-defaults-type"));

fakeStorage.setRaw(keyA, JSON.stringify({
  version: 99,
  settingsType: "expenseInflationDefaults",
  accountId: "account-a",
  accountDefaults: {
    expenseInflationDefaults: customDefaults
  }
}));
const wrongVersionResult = storageModule.loadExpenseInflationAccountDefaults({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(wrongVersionResult.status, "fallback");
assert.ok(hasWarning(wrongVersionResult, "unsupported-expense-inflation-account-defaults-version"));

fakeStorage.setRaw(keyA, JSON.stringify({
  version: 1,
  settingsType: "expenseInflationDefaults",
  accountId: "other-account",
  accountDefaults: {
    expenseInflationDefaults: customDefaults
  }
}));
const mismatchResult = storageModule.loadExpenseInflationAccountDefaults({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(mismatchResult.status, "fallback");
assert.ok(hasWarning(mismatchResult, "expense-inflation-account-defaults-account-mismatch"));
assert.ok(hasDataGap(mismatchResult, "expense-inflation-account-defaults-account-mismatch"));

const invalidDefaults = {
  ...customDefaults,
  foodInflationRatePercent: "not-a-number",
  transportationOperatingInflationRatePercent: 99
};
const invalidSaveResult = storageModule.saveExpenseInflationAccountDefaults({
  accountId: "invalid-account",
  defaults: invalidDefaults,
  storage: fakeStorage
});
assert.equal(invalidSaveResult.status, "saved");
assert.ok(hasWarning(invalidSaveResult, "invalid-expense-inflation-default"));
assert.equal(
  invalidSaveResult.accountDefaults.expenseInflationDefaults.foodInflationRatePercent,
  expectedDefaults.foodInflationRatePercent,
  "invalid field should fall back to system default"
);
assert.equal(
  invalidSaveResult.accountDefaults.expenseInflationDefaults.transportationOperatingInflationRatePercent,
  expectedDefaults.transportationOperatingInflationRatePercent,
  "out-of-range field should fall back to system default"
);

const partialSaveResult = storageModule.saveExpenseInflationAccountDefaults({
  accountId: "partial-account",
  defaults: {
    generalInflationRatePercent: 2
  },
  storage: fakeStorage
});
assert.ok(hasDataGap(partialSaveResult, "missing-expense-inflation-default"));
assert.equal(partialSaveResult.accountDefaults.expenseInflationDefaults.generalInflationRatePercent, 2);
assert.equal(
  partialSaveResult.accountDefaults.expenseInflationDefaults.healthcareInflationRatePercent,
  expectedDefaults.healthcareInflationRatePercent
);

console.log("Expense inflation account defaults storage check passed.");
