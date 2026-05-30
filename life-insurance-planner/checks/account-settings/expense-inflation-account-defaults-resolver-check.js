#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const resolverPath = path.join(
  repoRoot,
  "app",
  "features",
  "account-settings",
  "expense-inflation-account-defaults-resolver.js"
);
const resolverSource = fs.readFileSync(resolverPath, "utf8");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const context = {
  LensApp: {
    accountSettings: {}
  },
  console
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(resolverSource, context, { filename: resolverPath });

const resolverModule = context.LensApp.accountSettings.expenseInflationAccountDefaultsResolver;
assert.ok(resolverModule, "expense inflation account defaults resolver should load");
assert.equal(typeof resolverModule.resolveExpenseInflationDefaults, "function");
assert.equal(resolverModule.EXPENSE_INFLATION_ACCOUNT_DEFAULTS_RESOLVER_VERSION, 1);

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasWarning(result, code) {
  return Array.isArray(result.warnings) && result.warnings.some((warning) => warning.code === code);
}

function hasDataGap(result, code) {
  return Array.isArray(result.dataGaps) && result.dataGaps.some((dataGap) => dataGap.code === code);
}

function traceEntry(result, fieldName) {
  const entry = result.trace.entries.find((candidate) => candidate.fieldName === fieldName);
  assert.ok(entry, `${fieldName} should have trace entry`);
  return entry;
}

function serializable(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepEqual(serializable(resolverModule.getExpenseInflationSystemDefaults()), expectedDefaults);
assert.equal(
  Object.prototype.hasOwnProperty.call(resolverModule.getExpenseInflationSystemDefaults(), "householdExpenseInflationRatePercent"),
  false,
  "legacy household expense inflation should not be part of final account defaults"
);

const fallbackFirst = resolverModule.resolveExpenseInflationDefaults({});
const fallbackSecond = resolverModule.resolveExpenseInflationDefaults({});
assert.deepEqual(serializable(fallbackFirst), serializable(fallbackSecond), "default-only resolution should be deterministic");
assert.deepEqual(serializable(fallbackFirst.resolvedDefaults), expectedDefaults, "system fallback should resolve all nine defaults");
assert.equal(fallbackFirst.fieldSources.generalInflationRatePercent, "system-fallback");
assert.ok(hasDataGap(fallbackFirst, "missing-account-expense-inflation-defaults"));
assert.doesNotThrow(function () {
  JSON.stringify(fallbackFirst);
});

const accountDefaults = {
  generalInflationRatePercent: 2.5,
  healthcareInflationRatePercent: 4.75,
  longTermCareInflationRatePercent: 5.5,
  educationInflationRatePercent: 5.25,
  housingOperatingInflationRatePercent: 3.75,
  childcareDependentCareInflationRatePercent: 4.5,
  foodInflationRatePercent: 3.1,
  transportationOperatingInflationRatePercent: 3.8,
  finalExpenseInflationRatePercent: 4
};
const accountResult = resolverModule.resolveExpenseInflationDefaults({
  accountDefaults
});
assert.equal(accountResult.resolvedDefaults.generalInflationRatePercent, 2.5);
assert.equal(accountResult.resolvedDefaults.healthcareInflationRatePercent, 4.75);
assert.equal(accountResult.fieldSources.generalInflationRatePercent, "account-default");
assert.equal(traceEntry(accountResult, "generalInflationRatePercent").source, "account-default");

const analysisInflationAssumptions = {
  generalInflationRatePercent: 1.75,
  healthcareInflationRatePercent: 4.25,
  foodInflationRatePercent: 2.95
};
const analysisResult = resolverModule.resolveExpenseInflationDefaults({
  accountDefaults,
  analysisInflationAssumptions
});
assert.equal(analysisResult.resolvedDefaults.generalInflationRatePercent, 1.75);
assert.equal(analysisResult.resolvedDefaults.healthcareInflationRatePercent, 4.25);
assert.equal(analysisResult.resolvedDefaults.foodInflationRatePercent, 2.95);
assert.equal(analysisResult.resolvedDefaults.educationInflationRatePercent, accountDefaults.educationInflationRatePercent);
assert.equal(analysisResult.fieldSources.generalInflationRatePercent, "analysis-saved");
assert.equal(analysisResult.fieldSources.educationInflationRatePercent, "account-default");

const mutationAccountDefaults = clone(accountDefaults);
const mutationAnalysis = clone(analysisInflationAssumptions);
resolverModule.resolveExpenseInflationDefaults({
  accountDefaults: mutationAccountDefaults,
  analysisInflationAssumptions: mutationAnalysis
});
assert.deepEqual(mutationAccountDefaults, accountDefaults, "resolver should not mutate account defaults input");
assert.deepEqual(mutationAnalysis, analysisInflationAssumptions, "resolver should not mutate analysis assumptions input");

const invalidAnalysisResult = resolverModule.resolveExpenseInflationDefaults({
  accountDefaults,
  analysisInflationAssumptions: {
    generalInflationRatePercent: "invalid"
  }
});
assert.equal(invalidAnalysisResult.resolvedDefaults.generalInflationRatePercent, accountDefaults.generalInflationRatePercent);
assert.equal(invalidAnalysisResult.fieldSources.generalInflationRatePercent, "invalid-analysis-fallback");
assert.ok(hasWarning(invalidAnalysisResult, "invalid-analysis-expense-inflation-default"));
assert.equal(traceEntry(invalidAnalysisResult, "generalInflationRatePercent").reason, "analysis-saved-value-invalid");

const invalidAccountResult = resolverModule.resolveExpenseInflationDefaults({
  accountDefaults: {
    generalInflationRatePercent: -1,
    healthcareInflationRatePercent: 99
  }
});
assert.equal(invalidAccountResult.resolvedDefaults.generalInflationRatePercent, expectedDefaults.generalInflationRatePercent);
assert.equal(invalidAccountResult.resolvedDefaults.healthcareInflationRatePercent, expectedDefaults.healthcareInflationRatePercent);
assert.equal(invalidAccountResult.fieldSources.generalInflationRatePercent, "invalid-account-fallback");
assert.ok(hasWarning(invalidAccountResult, "invalid-account-expense-inflation-default"));
assert.ok(hasDataGap(invalidAccountResult, "missing-account-expense-inflation-default"));

const envelopeShapeResult = resolverModule.resolveExpenseInflationDefaults({
  accountDefaults: {
    accountDefaults: {
      expenseInflationDefaults: accountDefaults
    }
  }
});
assert.equal(envelopeShapeResult.resolvedDefaults.generalInflationRatePercent, accountDefaults.generalInflationRatePercent);
assert.equal(envelopeShapeResult.fieldSources.generalInflationRatePercent, "account-default");

assert.deepEqual(serializable(resolverModule.EXPENSE_INFLATION_RATE_FIELDS), [
  "generalInflationRatePercent",
  "healthcareInflationRatePercent",
  "longTermCareInflationRatePercent",
  "educationInflationRatePercent",
  "housingOperatingInflationRatePercent",
  "childcareDependentCareInflationRatePercent",
  "foodInflationRatePercent",
  "transportationOperatingInflationRatePercent",
  "finalExpenseInflationRatePercent"
]);

[
  "pages/admin-accounts.html",
  "pages/analysis-setup.html",
  "app/features/lens-analysis/analysis-setup.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-obligation-ledger.js",
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
  "app/features/lens-analysis/final-expense-inflation-calculations.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /expenseInflationAccountDefaults(?:Resolver|Storage)|resolveExpenseInflationDefaults|loadExpenseInflationAccountDefaults|saveExpenseInflationAccountDefaults/,
    `${relativePath} should not consume account expense inflation defaults in this storage/resolver-only pass.`
  );
});

console.log("Expense inflation account defaults resolver check passed.");
