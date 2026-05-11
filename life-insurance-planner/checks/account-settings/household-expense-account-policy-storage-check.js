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
const usdaImportContractPath = path.join(
  repoRoot,
  "app",
  "features",
  "account-settings",
  "usda-food-plan-import-contract.js"
);
const storageSource = fs.readFileSync(storagePath, "utf8");
const usdaImportContractSource = fs.readFileSync(usdaImportContractPath, "utf8");

const context = {
  LensApp: {
    accountSettings: {}
  },
  console
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(storageSource, context, { filename: storagePath });
vm.runInContext(usdaImportContractSource, context, { filename: usdaImportContractPath });

const storageModule = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
const usdaImportContract = context.LensApp.accountSettings.usdaFoodPlanImportContract;
assert.ok(storageModule, "household expense account policy storage should load");
assert.ok(usdaImportContract, "USDA Food Plan import contract should load");

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

const FOOD_AT_HOME_BAND_KEYS = [
  "infantToddler",
  "youngChild",
  "olderChild",
  "teenMale",
  "teenFemale",
  "adultMale",
  "adultFemale",
  "adultUnknown",
  "childUnknown"
];
const HOUSEHOLD_SIZE_FACTOR_KEYS = ["1", "2", "3", "4", "5", "6Plus"];

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
    assert.equal(/confidence/i.test(key), false, `${pathLabel}.${key} should not preserve confidence fields`);
    assertNoConfidenceField(value[key], `${pathLabel}.${key}`);
  });
}

function createExpectedEmptyLivingFloorAssumptions() {
  return {
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: null,
      planLevel: null,
      sourceUrl: null,
      sourceFileName: null,
      importedAt: null,
      approvedAt: null,
      monthlyAmountsByBand: FOOD_AT_HOME_BAND_KEYS.reduce(function (amounts, bandKey) {
        amounts[bandKey] = null;
        return amounts;
      }, {}),
      householdSizeAdjustmentFactors: HOUSEHOLD_SIZE_FACTOR_KEYS.reduce(function (factors, factorKey) {
        factors[factorKey] = null;
        return factors;
      }, {})
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: null,
        monthlyBaseAmount: null,
        notes: null,
        monthlyPerMemberAmount: null
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: null,
        monthlyBaseAmount: null,
        notes: null,
        monthlyPerMemberAmount: null
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: null,
        monthlyBaseAmount: null,
        notes: null,
        monthlyPerAdultDriverAmount: null
      }
    }
  };
}

const validLivingFloorAssumptions = {
  version: 1,
  foodAtHome: {
    planningBucketKey: "foodAtHomeConsumables",
    source: "USDA_FOOD_PLAN",
    sourcePeriod: "2026-01",
    planLevel: "lowCost",
    sourceUrl: "https://fns-prod.azureedge.us/sites/default/files/resource-files/usda-lowcostplan-sept2007-present.xlsx",
    sourceFileName: "usda-lowcostplan-sept2007-present.xlsx",
    importedAt: "2026-05-10T18:30:00.000Z",
    approvedAt: "2026-05-10T18:35:00.000Z",
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
  model90DefaultBucketFloors: {
    householdConsumables: {
      planningBucketKey: "householdConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 110,
      monthlyPerMemberAmount: 35,
      notes: "Household goods placeholder"
    },
    communicationsConnectivity: {
      planningBucketKey: "communicationsConnectivity",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 95,
      monthlyPerMemberAmount: 12,
      notes: "Connectivity placeholder"
    },
    transportationBasics: {
      planningBucketKey: "transportationBasics",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 125,
      monthlyPerAdultDriverAmount: 75,
      notes: "Transportation placeholder"
    }
  }
};

function createUsdaFoodPlanPreview() {
  return {
    sourceFormat: "MODEL90_USDA_FOOD_PLAN_PREVIEW_V1",
    planLevel: "moderateCost",
    sourcePeriod: "2026-02",
    sourceUrl: "https://fns-prod.azureedge.us/sites/default/files/resource-files/usda-moderatecostplan-sept2007-present.xlsx",
    sourceFileName: "usda-moderatecostplan-sept2007-present.xlsx",
    importedAt: "2026-05-10T19:30:00.000Z",
    approvedAt: "2026-05-10T19:35:00.000Z",
    monthlyAmountsByBand: {
      infantToddler: 190,
      youngChild: 240,
      olderChild: 310,
      teenMale: 385,
      teenFemale: 340,
      adultMale: 420,
      adultFemale: 370,
      adultUnknown: 395,
      childUnknown: 285
    },
    householdSizeAdjustmentFactors: {
      "1": 1.2,
      "2": 1.1,
      "3": 1.05,
      "4": 1,
      "5": 0.95,
      "6Plus": 0.9
    }
  };
}

const keyA = storageModule.createHouseholdExpenseAccountPolicyStorageKey("account-a");
const keyB = storageModule.createHouseholdExpenseAccountPolicyStorageKey("account-b");
assert.notEqual(keyA, keyB, "storage keys should be account scoped");
assert.ok(keyA.includes(encodeURIComponent("account-a")), "storage key should include encoded account id");

const emptyPolicy = storageModule.createEmptyHouseholdExpenseAccountPolicy({ accountId: "account-a" });
assertEmptyArray(emptyPolicy.lifestyleRangeOverrides, "empty policy should include lifestyle namespace");
assertEmptyArray(emptyPolicy.graphAdjustmentOverrides, "empty policy should include graph adjustment namespace");
assertEmptyArray(emptyPolicy.compressionThresholdOverrides, "empty policy should include threshold namespace");
assertEmptyArray(emptyPolicy.compressionPolicyOverrides, "empty policy should include compression policy namespace");
assert.equal(Object.keys(emptyPolicy.guardrails).length, 0, "empty policy should include guardrails namespace");
assert.deepEqual(
  clone(emptyPolicy.livingFloorAssumptions),
  createExpectedEmptyLivingFloorAssumptions(),
  "empty policy should include deterministic living-floor assumptions namespace"
);
assert.equal(emptyPolicy.metadata.accountId, "account-a", "empty policy metadata should include account id");

const fakeStorage = createFakeStorage();
const accountPolicy = {
  version: 7,
  lifestyleRangeOverrides: [
    { expenseTypeKey: "groceries", conservativeFloorRatio: 0.72 }
  ],
  graphAdjustmentOverrides: [
    {
      expenseTypeKey: "groceries",
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode: "zeroFloor",
      source: "ADMIN_ENTERED",
      updatedAt: "2026-05-07T00:00:00.000Z"
    }
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
  livingFloorAssumptions: clone(validLivingFloorAssumptions),
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
assert.deepEqual(
  clone(loadResult.accountPolicy.graphAdjustmentOverrides),
  clone(accountPolicy.graphAdjustmentOverrides),
  "graph adjustment namespace should round trip"
);
assert.equal(loadResult.accountPolicy.compressionThresholdOverrides.length, 1, "threshold namespace should round trip");
assert.equal(loadResult.accountPolicy.compressionPolicyOverrides.length, 1, "compression policy namespace should round trip");
assert.equal(loadResult.accountPolicy.guardrails.maxElevatedCeilingRatio, 1.8, "guardrails namespace should round trip");
assert.deepEqual(clone(loadResult.accountPolicy.livingFloorAssumptions), validLivingFloorAssumptions, "living-floor assumptions namespace should round trip");
assert.equal(loadResult.accountPolicy.metadata.owner, "admin", "policy metadata namespace should round trip");
assert.doesNotThrow(() => JSON.stringify(loadResult), "load output should be JSON serializable");
assert.equal(
  loadResult.trace.details.namespaceCounts.graphAdjustmentOverrides,
  1,
  "load trace should count graph adjustment overrides"
);
assert.equal(
  loadResult.trace.details.namespaceCounts.livingFloorAssumptions,
  3,
  "load trace should count living-floor assumptions namespace keys"
);

const mappedUsdaFoodAtHome = usdaImportContract.mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions(createUsdaFoodPlanPreview());
assert.equal(mappedUsdaFoodAtHome.valid, true, "USDA contract fixture should map before storage normalization");
const usdaContractStorage = createFakeStorage();
storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "usda-contract-policy",
  accountPolicy: {
    version: 1,
    livingFloorAssumptions: {
      version: 1,
      foodAtHome: mappedUsdaFoodAtHome.foodAtHome
    }
  },
  storage: usdaContractStorage
});
const usdaContractLoad = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "usda-contract-policy",
  storage: usdaContractStorage
});
assert.deepEqual(
  clone(usdaContractLoad.accountPolicy.livingFloorAssumptions.foodAtHome),
  clone(mappedUsdaFoodAtHome.foodAtHome),
  "USDA contract mapper output should survive storage normalization"
);

const invalidLivingFloorStorage = createFakeStorage();
storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "invalid-living-floor",
  accountPolicy: {
    version: 1,
    graphAdjustmentOverrides: [
      {
        expenseTypeKey: "",
        adjustmentClass: "moneyFloorAdjusted"
      },
      {
        expenseTypeKey: "groceries",
        adjustmentClass: "reviewOnly",
        minimumFloorMode: "estimatedDollarFloor",
        confidence: "do not preserve"
      },
      {
        expenseTypeKey: "personalCare",
        adjustmentClass: "ratioAdjusted",
        minimumFloorMode: "ratioFloorOnly",
        confidence: "do not preserve"
      },
      {
        expenseTypeKey: "groceries",
        adjustmentClass: "ratioAdjusted",
        minimumFloorMode: "ratioFloorOnly"
      },
      {
        expenseTypeKey: "groceries",
        adjustmentClass: "excludedFromAdjustment",
        minimumFloorMode: "zeroFloor",
        source: ""
      },
      {
        expenseTypeKey: "diningTakeout",
        adjustmentClass: "moneyFloorAdjusted",
        minimumFloorMode: "zeroFloor"
      }
    ],
    livingFloorAssumptions: {
      version: "not-a-version",
      confidence: "do not preserve",
      foodAtHome: {
        confidence: "do not preserve",
        sourcePeriod: "",
        planLevel: "not-a-usda-plan-level",
        sourceUrl: "",
        sourceFileName: "",
        importedAt: "",
        approvedAt: "",
        sourceDocumentUrl: "do-not-preserve",
        monthlyAmountsByBand: {
          infantToddler: -50,
          youngChild: "",
          olderChild: "275",
          confidence: "do not preserve"
        },
        householdSizeAdjustmentFactors: {
          "1": 0.1,
          "2": 3.5,
          "3": "1.15",
          confidence: "do not preserve"
        }
      },
      stateCostAdjustmentMultipliers: {
        defaultMultiplier: 1.25,
        globalStateAdjustmentMultipliersByState: {
          CO: { multiplier: 1.2 }
        }
      },
      model90DefaultBucketFloors: {
        householdConsumables: {
          monthlyBaseAmount: -1,
          monthlyPerMemberAmount: "12",
          confidence: "do not preserve"
        },
        communicationsConnectivity: "invalid",
        transportationBasics: {
          monthlyBaseAmount: 125,
          monthlyPerAdultDriverAmount: -75
        }
      }
    }
  },
  storage: invalidLivingFloorStorage
});

const invalidLivingFloorLoad = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "invalid-living-floor",
  storage: invalidLivingFloorStorage
});
const normalizedGraphAdjustments = invalidLivingFloorLoad.accountPolicy.graphAdjustmentOverrides;
assert.deepEqual(
  clone(normalizedGraphAdjustments.map((row) => row.expenseTypeKey)),
  ["diningTakeout", "groceries", "personalCare"],
  "graph adjustment overrides should drop invalid rows, de-dupe by expense type, and sort deterministically"
);
assert.equal(normalizedGraphAdjustments[0].adjustmentClass, "moneyFloorAdjusted", "money-floor adjustment class should be preserved");
assert.equal(normalizedGraphAdjustments[0].minimumFloorMode, "estimatedDollarFloor", "money-floor adjustment should force estimated dollar floor mode");
assert.equal(normalizedGraphAdjustments[1].adjustmentClass, "excludedFromAdjustment", "duplicate graph adjustment rows should use the last valid row");
assert.equal(normalizedGraphAdjustments[1].minimumFloorMode, "notAdjusted", "excluded graph adjustments should force notAdjusted mode");
assert.equal(normalizedGraphAdjustments[1].source, "ADMIN_ENTERED", "blank graph adjustment source should default to ADMIN_ENTERED");
assert.equal(normalizedGraphAdjustments[2].minimumFloorMode, "ratioFloorOnly", "ratio graph adjustments should preserve ratioFloorOnly mode");
assertNoConfidenceField(normalizedGraphAdjustments, "graphAdjustmentOverrides");
const normalizedLivingFloor = invalidLivingFloorLoad.accountPolicy.livingFloorAssumptions;
assert.equal(normalizedLivingFloor.version, 1, "invalid living-floor version should normalize to V1");
assert.equal(normalizedLivingFloor.foodAtHome.planLevel, null, "invalid USDA Food Plan level should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.sourceUrl, null, "blank sourceUrl should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.sourceFileName, null, "blank sourceFileName should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.importedAt, null, "blank importedAt should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.approvedAt, null, "blank approvedAt should normalize to null");
assert.equal(
  Object.prototype.hasOwnProperty.call(normalizedLivingFloor.foodAtHome, "sourceDocumentUrl"),
  false,
  "unsupported Food at Home source metadata should be dropped"
);
assert.equal(normalizedLivingFloor.foodAtHome.monthlyAmountsByBand.infantToddler, null, "negative dollar values should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.monthlyAmountsByBand.youngChild, null, "blank dollar values should remain allowed as null");
assert.equal(normalizedLivingFloor.foodAtHome.monthlyAmountsByBand.olderChild, 275, "numeric string dollar values should normalize to numbers");
assert.equal(normalizedLivingFloor.foodAtHome.householdSizeAdjustmentFactors["1"], null, "too-low household factors should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.householdSizeAdjustmentFactors["2"], null, "too-high household factors should normalize to null");
assert.equal(normalizedLivingFloor.foodAtHome.householdSizeAdjustmentFactors["3"], 1.15, "valid household factors should normalize to numbers");
assert.equal(
  Object.prototype.hasOwnProperty.call(normalizedLivingFloor, "stateCostAdjustmentMultipliers"),
  false,
  "retired state multiplier data should be dropped during normalization"
);
assert.equal(
  normalizedLivingFloor.model90DefaultBucketFloors.householdConsumables.monthlyBaseAmount,
  null,
  "negative MODEL90 default base amounts should normalize to null"
);
assert.equal(
  normalizedLivingFloor.model90DefaultBucketFloors.householdConsumables.monthlyPerMemberAmount,
  12,
  "valid MODEL90 default per-member amounts should normalize to numbers"
);
assert.equal(
  normalizedLivingFloor.model90DefaultBucketFloors.transportationBasics.monthlyPerAdultDriverAmount,
  null,
  "negative transportation per-driver amounts should normalize to null"
);
assertNoConfidenceField(normalizedLivingFloor, "livingFloorAssumptions");

const invalidLivingFloorShapeStorage = createFakeStorage();
storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "invalid-living-floor-shape",
  accountPolicy: {
    version: 1,
    livingFloorAssumptions: ["invalid"]
  },
  storage: invalidLivingFloorShapeStorage
});
assert.deepEqual(
  clone(storageModule.loadHouseholdExpenseAccountPolicy({
    accountId: "invalid-living-floor-shape",
    storage: invalidLivingFloorShapeStorage
  }).accountPolicy.livingFloorAssumptions),
  createExpectedEmptyLivingFloorAssumptions(),
  "invalid living-floor assumptions shape should normalize to deterministic empty assumptions"
);

const missingResult = storageModule.loadHouseholdExpenseAccountPolicy({
  accountId: "missing-account",
  storage: fakeStorage
});
assert.equal(missingResult.status, "fallback", "missing saved policy should fall back");
assert.ok(hasWarning(missingResult, "missing-account-policy"), "missing saved policy should warn");
assertEmptyArray(missingResult.accountPolicy.lifestyleRangeOverrides, "missing fallback should be empty");
assertEmptyArray(missingResult.accountPolicy.graphAdjustmentOverrides, "missing fallback should include empty graph adjustments");
assert.deepEqual(
  clone(missingResult.accountPolicy.livingFloorAssumptions),
  createExpectedEmptyLivingFloorAssumptions(),
  "missing fallback should include deterministic living-floor assumptions namespace"
);
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
assert.deepEqual(
  clone(noStorageSaveResult.accountPolicy.livingFloorAssumptions),
  createExpectedEmptyLivingFloorAssumptions(),
  "missing storage save should return safe empty living-floor assumptions"
);

const throwingSaveResult = storageModule.saveHouseholdExpenseAccountPolicy({
  accountId: "account-a",
  accountPolicy,
  storage: throwingStorage
});
assert.equal(throwingSaveResult.status, "notSaved", "throwing storage save should not throw");
assert.ok(hasWarning(throwingSaveResult, "storage-write-failed"), "throwing storage save should warn");
assertEmptyArray(throwingSaveResult.accountPolicy.lifestyleRangeOverrides, "throwing storage save should return safe empty policy");
assert.deepEqual(
  clone(throwingSaveResult.accountPolicy.livingFloorAssumptions),
  createExpectedEmptyLivingFloorAssumptions(),
  "throwing storage save should return safe empty living-floor assumptions"
);

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
