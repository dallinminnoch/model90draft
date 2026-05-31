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
    document: {
      addEventListener() {}
    },
    Intl,
    localStorage: storage || createFakeStorage(),
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {};
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createAnalysisSetupContext(storage) {
  const context = createContext(storage);
  loadScript(context, "app/features/account-settings/expense-inflation-account-defaults-storage.js");
  loadScript(context, "app/features/account-settings/expense-inflation-account-defaults-resolver.js");
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    "  LensApp.__expenseInflationSeedingHarness = { readValidatedAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );
  vm.runInContext(instrumentedSource, context, {
    filename: "app/features/lens-analysis/analysis-setup.js"
  });
  return context;
}

function createField(value) {
  return {
    value: String(value)
  };
}

const accountId = "analysis-seeding-account";
const finalExpenseInflationFields = [
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
const accountDefaultValues = {
  version: 1,
  generalInflationRatePercent: 1.25,
  healthcareInflationRatePercent: 6.5,
  longTermCareInflationRatePercent: 6.75,
  educationInflationRatePercent: 6.25,
  housingOperatingInflationRatePercent: 4.25,
  childcareDependentCareInflationRatePercent: 4.75,
  foodInflationRatePercent: 3.95,
  transportationOperatingInflationRatePercent: 4.1,
  finalExpenseInflationRatePercent: 4.35
};

const pageSource = readRepoFile("pages/analysis-setup.html");
const scriptSources = getScriptSources(pageSource);
assertScriptOrder(scriptSources, [
  "../app/features/account-settings/expense-inflation-account-defaults-storage.js",
  "../app/features/account-settings/expense-inflation-account-defaults-resolver.js",
  "../app/features/lens-analysis/analysis-setup.js"
]);

const storage = createFakeStorage();
const context = createAnalysisSetupContext(storage);
const storageApi = context.LensApp.accountSettings.expenseInflationAccountDefaultsStorage;
const analysisSetup = context.LensApp.analysisSetup;
assert.equal(typeof analysisSetup.resolveAnalysisSetupExpenseInflationDefaults, "function");
assert.equal(typeof analysisSetup.getInflationAssumptions, "function");
assert.equal(typeof context.LensApp.__expenseInflationSeedingHarness.readValidatedAssumptions, "function");

storageApi.saveExpenseInflationAccountDefaults({
  accountId,
  defaults: accountDefaultValues,
  metadata: {
    updatedBy: "check"
  },
  storage
});
storage.clearWrites();

const missingAnalysisValues = analysisSetup.getInflationAssumptions({
  analysisSettings: {
    inflationAssumptions: {
      enabled: true
    }
  }
}, {
  accountId,
  storage
});
finalExpenseInflationFields.forEach(function (fieldName) {
  assert.equal(
    missingAnalysisValues[fieldName],
    accountDefaultValues[fieldName],
    `${fieldName} should seed from account defaults when missing from analysis settings.`
  );
  assert.equal(
    missingAnalysisValues.expenseInflationDefaultSeedTrace.fieldSources[fieldName],
    "account-default",
    `${fieldName} source should trace account-default.`
  );
});
assert.equal(
  missingAnalysisValues.householdExpenseInflationRatePercent,
  analysisSetup.DEFAULT_INFLATION_ASSUMPTIONS.householdExpenseInflationRatePercent,
  "legacy household expense inflation should not seed from final account defaults."
);
assert.equal(storage.getWrites().length, 0, "loading account defaults should not write storage.");

const savedAnalysisRecord = {
  analysisSettings: {
    inflationAssumptions: {
      generalInflationRatePercent: 2.2,
      healthcareInflationRatePercent: 2.3,
      longTermCareInflationRatePercent: 2.4,
      educationInflationRatePercent: 2.5,
      housingOperatingInflationRatePercent: 2.6,
      childcareDependentCareInflationRatePercent: 2.7,
      foodInflationRatePercent: 2.8,
      transportationOperatingInflationRatePercent: 2.9,
      finalExpenseInflationRatePercent: 3.1,
      householdExpenseInflationRatePercent: 3.3
    }
  }
};
const savedAnalysisValues = analysisSetup.getInflationAssumptions(savedAnalysisRecord, {
  accountId,
  storage
});
finalExpenseInflationFields.forEach(function (fieldName) {
  assert.equal(
    savedAnalysisValues[fieldName],
    savedAnalysisRecord.analysisSettings.inflationAssumptions[fieldName],
    `${fieldName} saved analysis value should win over account default.`
  );
  assert.equal(
    savedAnalysisValues.expenseInflationDefaultSeedTrace.fieldSources[fieldName],
    "analysis-saved",
    `${fieldName} source should trace analysis-saved.`
  );
});
assert.equal(savedAnalysisValues.householdExpenseInflationRatePercent, 3.3);

const systemFallbackContext = createAnalysisSetupContext(createFakeStorage());
const systemFallback = systemFallbackContext.LensApp.analysisSetup.getInflationAssumptions({
  analysisSettings: {
    inflationAssumptions: {}
  }
}, {
  accountId,
  storage: systemFallbackContext.localStorage
});
finalExpenseInflationFields.forEach(function (fieldName) {
  assert.equal(
    systemFallback[fieldName],
    systemFallbackContext.LensApp.analysisSetup.DEFAULT_INFLATION_ASSUMPTIONS[fieldName],
    `${fieldName} should use system fallback when no account default exists.`
  );
  assert.equal(systemFallback.expenseInflationDefaultSeedTrace.fieldSources[fieldName], "system-fallback");
});

const invalidAccountDefault = analysisSetup.getInflationAssumptions({
  analysisSettings: {
    inflationAssumptions: {}
  }
}, {
  accountId,
  storage,
  accountDefaults: {
    generalInflationRatePercent: "invalid"
  }
});
assert.equal(invalidAccountDefault.generalInflationRatePercent, 3);
assert.equal(
  invalidAccountDefault.expenseInflationDefaultSeedTrace.fieldSources.generalInflationRatePercent,
  "invalid-account-fallback"
);
assert.ok(
  invalidAccountDefault.expenseInflationDefaultSeedTrace.warnings.some(function (warning) {
    return warning.code === "invalid-account-expense-inflation-default";
  }),
  "invalid account default should produce a warning trace."
);

const validationFields = {
  enabled: {
    checked: true
  },
  finalExpenseTargetAge: createField(85)
};
finalExpenseInflationFields.forEach(function (fieldName) {
  validationFields[fieldName] = createField(missingAnalysisValues[fieldName]);
});
validationFields.householdExpenseInflationRatePercent = createField(3);
const validated = context.LensApp.__expenseInflationSeedingHarness.readValidatedAssumptions(validationFields);
assert.equal(validated.error, undefined);
finalExpenseInflationFields.forEach(function (fieldName) {
  assert.equal(
    validated.value[fieldName],
    accountDefaultValues[fieldName],
    `${fieldName} should save the displayed account-seeded value only through user save validation.`
  );
});
assert.equal(validated.value.householdExpenseInflationRatePercent, 3);

assert.doesNotMatch(
  readRepoFile("app/features/account-settings/expense-inflation-account-defaults-storage.js"),
  /householdExpenseInflationRatePercent/,
  "account defaults storage should not include the legacy household expense inflation field."
);
assert.doesNotMatch(
  readRepoFile("app/features/account-settings/expense-inflation-account-defaults-resolver.js"),
  /householdExpenseInflationRatePercent/,
  "account defaults resolver should not include the legacy household expense inflation field."
);

[
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-obligation-ledger.js",
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
  "app/features/lens-analysis/final-expense-inflation-calculations.js",
  "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-transition-needs-lifetime-projection.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /expenseInflationAccountDefaults(?:Resolver|Storage)|loadExpenseInflationAccountDefaults|resolveExpenseInflationDefaults/,
    `${relativePath} should not consume account expense inflation defaults.`
  );
});

console.log("Analysis Setup expense inflation account default seeding check passed.");
