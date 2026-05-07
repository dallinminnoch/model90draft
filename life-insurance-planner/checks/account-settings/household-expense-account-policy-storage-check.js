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
  "household-expense-account-policy-storage.js"
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

const storageModule = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
assert.ok(storageModule, "household expense account policy storage should load");

[
  "HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION",
  "HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_TYPE",
  "HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_PREFIX",
  "createHouseholdExpenseAccountPolicyStorageKey",
  "createEmptyHouseholdExpenseAccountPolicy",
  "loadHouseholdExpenseAccountPolicy",
  "saveHouseholdExpenseAccountPolicy",
  "removeHouseholdExpenseAccountPolicy"
].forEach(function (key) {
  assert.ok(Object.prototype.hasOwnProperty.call(storageModule, key), `${key} export should exist`);
});

assert.equal(storageModule.HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION, 1, "storage version should be V1");
assert.equal(storageModule.HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_TYPE, "householdExpensePolicy", "policy type should be stable");

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

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error("read blocked");
    },
    setItem() {
      throw new Error("write blocked");
    },
    removeItem() {
      throw new Error("remove blocked");
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasWarning(result, code) {
  return Array.isArray(result.warnings) && result.warnings.some((warning) => warning.code === code);
}

function assertEmptyArray(value, message) {
  assert.equal(Array.isArray(value), true, message);
  assert.equal(value.length, 0, message);
}

const keyA = storageModule.createHouseholdExpenseAccountPolicyStorageKey("account-a");
const keyB = storageModule.createHouseholdExpenseAccountPolicyStorageKey("account-b");
assert.notEqual(keyA, keyB, "storage keys should be account scoped");
assert.ok(keyA.includes(encodeURIComponent("account-a")), "storage key should include encoded account id");

const emptyPolicy = storageModule.createEmptyHouseholdExpenseAccountPolicy({ accountId: "account-a" });
assertEmptyArray(emptyPolicy.lifestyleRangeOverrides, "empty policy should include lifestyle namespace");
assertEmptyArray(emptyPolicy.compressionThresholdOverrides, "empty policy should include threshold namespace");
assertEmptyArray(emptyPolicy.compressionPolicyOverrides, "empty policy should include compression policy namespace");
assert.equal(Object.keys(emptyPolicy.guardrails).length, 0, "empty policy should include guardrails namespace");
assert.equal(emptyPolicy.metadata.accountId, "account-a", "empty policy metadata should include account id");

const fakeStorage = createFakeStorage();
const accountPolicy = {
  version: 7,
  lifestyleRangeOverrides: [
    { expenseTypeKey: "groceries", conservativeFloorRatio: 0.72 }
  ],
  compressionThresholdOverrides: [
    { expenseTypeKey: "groceries", tiers: { minimum: 175 } }
  ],
  compressionPolicyOverrides: [
    { expenseTypeKey: "streamingDigitalSubscriptions", canReduceToZero: false }
  ],
  guardrails: {
    maxElevatedCeilingRatio: 1.8
  },
  metadata: {
    owner: "admin"
  }
};
const originalPolicy = clone(accountPolicy);

const saveResult = storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  accountPolicy,
  metadata: {
    updatedAt: "2026-05-07T00:00:00.000Z",
    updatedBy: "admin@example.test"
  },
  storage: fakeStorage
});

assert.equal(saveResult.status, "saved", "save should succeed");
assert.equal(saveResult.saved, true, "save should report saved");
assert.equal(saveResult.envelope.version, 1, "saved envelope should be versioned");
assert.equal(saveResult.envelope.policyType, "householdExpensePolicy", "saved envelope should include policy type");
assert.equal(saveResult.envelope.accountId, "account-a", "saved envelope should include account id");
assert.equal(saveResult.envelope.metadata.source, "browserLocalV1", "saved envelope should include browser-local source");
assert.equal(saveResult.envelope.metadata.updatedAt, "2026-05-07T00:00:00.000Z", "saved envelope should preserve updatedAt");
assert.equal(saveResult.envelope.metadata.updatedBy, "admin@example.test", "saved envelope should preserve updatedBy");
assert.deepEqual(accountPolicy, originalPolicy, "save should not mutate input account policy");
assert.ok(fakeStorage.has(keyA), "save should write to account-scoped key");

const loadResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  storage: fakeStorage
});

assert.equal(loadResult.status, "loaded", "load should succeed after save");
assert.equal(loadResult.accountId, "account-a", "load should return account id");
assert.equal(loadResult.accountPolicy.version, 7, "policy version namespace should be preserved");
assert.equal(loadResult.accountPolicy.lifestyleRangeOverrides.length, 1, "lifestyle namespace should round trip");
assert.equal(loadResult.accountPolicy.compressionThresholdOverrides.length, 1, "threshold namespace should round trip");
assert.equal(loadResult.accountPolicy.compressionPolicyOverrides.length, 1, "compression policy namespace should round trip");
assert.equal(loadResult.accountPolicy.guardrails.maxElevatedCeilingRatio, 1.8, "guardrails namespace should round trip");
assert.equal(loadResult.accountPolicy.metadata.owner, "admin", "policy metadata namespace should round trip");
assert.doesNotThrow(() => JSON.stringify(loadResult), "load output should be JSON serializable");

const missingResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "missing-account",
  storage: fakeStorage
});
assert.equal(missingResult.status, "fallback", "missing saved policy should fall back");
assert.ok(hasWarning(missingResult, "missing-account-policy"), "missing saved policy should warn");
assertEmptyArray(missingResult.accountPolicy.lifestyleRangeOverrides, "missing fallback should be empty");
assert.equal(missingResult.metadata.fallback, true, "missing fallback should include fallback metadata");

const corruptStorage = createFakeStorage();
const corruptKey = storageModule.createHouseholdExpenseAccountPolicyStorageKey("corrupt-account");
corruptStorage.setRaw(corruptKey, "{not-json");
const corruptResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "corrupt-account",
  storage: corruptStorage
});
assert.equal(corruptResult.status, "fallback", "corrupt JSON should fall back");
assert.ok(hasWarning(corruptResult, "corrupt-account-policy-json"), "corrupt JSON should warn");

const invalidVersionStorage = createFakeStorage();
const invalidVersionKey = storageModule.createHouseholdExpenseAccountPolicyStorageKey("old-account");
invalidVersionStorage.setRaw(invalidVersionKey, JSON.stringify({
  version: 999,
  policyType: "householdExpensePolicy",
  accountId: "old-account",
  accountPolicy: {}
}));
const invalidVersionResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "old-account",
  storage: invalidVersionStorage
});
assert.equal(invalidVersionResult.status, "fallback", "invalid envelope version should fall back");
assert.ok(hasWarning(invalidVersionResult, "unsupported-account-policy-envelope-version"), "invalid envelope version should warn");

const noStorageLoadResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "account-a"
});
assert.equal(noStorageLoadResult.status, "fallback", "missing storage should fall back");
assert.ok(hasWarning(noStorageLoadResult, "storage-unavailable"), "missing storage should warn");

const throwingStorage = createThrowingStorage();
const throwingLoadResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  storage: throwingStorage
});
assert.equal(throwingLoadResult.status, "fallback", "throwing storage read should fall back");
assert.ok(hasWarning(throwingLoadResult, "storage-read-failed"), "throwing storage read should warn");

const noStorageSaveResult = storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  accountPolicy
});
assert.equal(noStorageSaveResult.status, "notSaved", "missing storage save should not throw");
assert.equal(noStorageSaveResult.saved, false, "missing storage save should report unsaved");
assert.ok(hasWarning(noStorageSaveResult, "storage-unavailable"), "missing storage save should warn");
assertEmptyArray(noStorageSaveResult.accountPolicy.lifestyleRangeOverrides, "missing storage save should return safe empty policy");

const throwingSaveResult = storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  accountPolicy,
  storage: throwingStorage
});
assert.equal(throwingSaveResult.status, "notSaved", "throwing storage save should not throw");
assert.ok(hasWarning(throwingSaveResult, "storage-write-failed"), "throwing storage save should warn");
assertEmptyArray(throwingSaveResult.accountPolicy.lifestyleRangeOverrides, "throwing storage save should return safe empty policy");

const removeResult = storageModule.removeHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  storage: fakeStorage
});
assert.equal(removeResult.status, "removed", "remove should succeed");
assert.equal(removeResult.removed, true, "remove should report removed");
assert.equal(fakeStorage.has(keyA), false, "remove should delete account-scoped key");

const throwingRemoveResult = storageModule.removeHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  storage: throwingStorage
});
assert.equal(throwingRemoveResult.status, "notRemoved", "throwing storage remove should not throw");
assert.ok(hasWarning(throwingRemoveResult, "storage-remove-failed"), "throwing storage remove should warn");

assert.equal(
  storageSource.includes("analysisSettings"),
  false,
  "storage adapter source should not use analysisSettings as a storage target"
);
assert.equal(
  storageSource.includes("clientRecords"),
  false,
  "storage adapter source should not use client record storage as a target"
);
assert.equal(
  storageSource.includes("profile"),
  false,
  "storage adapter source should not use profile storage as a target"
);

[
  "income-loss-impact-display",
  "income-impact-timeline-graph-model",
  "Layer 5",
  "triage",
  "normalize-lens-model",
  "formula",
  "methods/",
  "pages/",
  "components.css",
  "styles.css",
  "household-expense-account-policy-resolver"
].forEach(function (forbiddenText) {
  assert.equal(
    storageSource.includes(forbiddenText),
    false,
    `storage adapter should not import or reference ${forbiddenText}`
  );
});

assert.equal(
  /require\s*\(|import\s+/.test(storageSource),
  false,
  "storage adapter should not import modules"
);

console.log("household expense account policy storage checks passed");
