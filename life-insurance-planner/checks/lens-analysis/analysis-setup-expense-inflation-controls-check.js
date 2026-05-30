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

function countMatches(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    "  LensApp.__expenseInflationHarness = { readValidatedAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );
  const context = {
    console,
    document: {
      addEventListener() {}
    },
    Intl,
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {};
  vm.createContext(context);
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

const html = readRepoFile("pages/analysis-setup.html");
const setupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const adapterSource = readRepoFile("app/features/lens-analysis/analysis-settings-adapter.js");

const finalExpenseInflationFields = [
  {
    fieldName: "generalInflationRatePercent",
    label: "General inflation",
    defaultValue: 3
  },
  {
    fieldName: "healthcareInflationRatePercent",
    label: "Healthcare inflation",
    defaultValue: 5
  },
  {
    fieldName: "longTermCareInflationRatePercent",
    label: "Long-term care inflation",
    defaultValue: 5
  },
  {
    fieldName: "educationInflationRatePercent",
    label: "Education inflation",
    defaultValue: 5
  },
  {
    fieldName: "housingOperatingInflationRatePercent",
    label: "Housing operating inflation",
    defaultValue: 3.5
  },
  {
    fieldName: "childcareDependentCareInflationRatePercent",
    label: "Childcare / dependent-care inflation",
    defaultValue: 4
  },
  {
    fieldName: "foodInflationRatePercent",
    label: "Food inflation",
    defaultValue: 3.25
  },
  {
    fieldName: "transportationOperatingInflationRatePercent",
    label: "Transportation operating inflation",
    defaultValue: 3.5
  },
  {
    fieldName: "finalExpenseInflationRatePercent",
    label: "Final expense inflation",
    defaultValue: 3.75
  }
];

const existingCurrentOutputField = {
  fieldName: "householdExpenseInflationRatePercent",
  label: "Household expense inflation",
  defaultValue: 3
};

[...finalExpenseInflationFields, existingCurrentOutputField].forEach(function (field) {
  assert.equal(
    countMatches(html, new RegExp(`data-analysis-inflation-field="${field.fieldName}"`, "g")),
    1,
    `${field.fieldName} should have exactly one editable percent input.`
  );
  assert.equal(
    countMatches(html, new RegExp(`data-analysis-inflation-slider="${field.fieldName}"`, "g")),
    1,
    `${field.fieldName} should have exactly one slider.`
  );
  assert.match(html, new RegExp(field.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(setupSource, new RegExp(`${field.fieldName}: ${String(field.defaultValue).replace(".", "\\.")}`));
  assert.match(adapterSource, new RegExp(`${field.fieldName}: ${String(field.defaultValue).replace(".", "\\.")}`));
});

assert.equal(countMatches(html, /data-analysis-inflation-field="generalInflationRatePercent"/g), 1);
assert.equal(countMatches(html, /data-analysis-inflation-field="healthcareInflationRatePercent"/g), 1);
assert.equal(countMatches(html, /data-analysis-inflation-field="educationInflationRatePercent"/g), 1);
assert.equal(countMatches(html, /data-analysis-inflation-field="finalExpenseInflationRatePercent"/g), 1);
assert.doesNotMatch(html, /future use|coming soon/i);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
assert.ok(analysisSetup?.DEFAULT_INFLATION_ASSUMPTIONS);
assert.equal(typeof analysisSetup.getInflationAssumptions, "function");
assert.equal(typeof setupContext.LensApp.__expenseInflationHarness.readValidatedAssumptions, "function");

finalExpenseInflationFields.forEach(function (field) {
  assert.equal(
    analysisSetup.DEFAULT_INFLATION_ASSUMPTIONS[field.fieldName],
    field.defaultValue,
    `${field.fieldName} default should match the final-version assumption default.`
  );
});

const savedRecord = {
  analysisSettings: {
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 2.75,
      householdExpenseInflationRatePercent: 3,
      healthcareInflationRatePercent: 4.75,
      longTermCareInflationRatePercent: 5.25,
      educationInflationRatePercent: 5.5,
      housingOperatingInflationRatePercent: 3.75,
      childcareDependentCareInflationRatePercent: 4.25,
      foodInflationRatePercent: 3.5,
      transportationOperatingInflationRatePercent: 3.85,
      finalExpenseInflationRatePercent: 4.1,
      finalExpenseTargetAge: 88,
      source: "check"
    }
  }
};
const loaded = analysisSetup.getInflationAssumptions(savedRecord);
finalExpenseInflationFields.forEach(function (field) {
  assert.equal(
    loaded[field.fieldName],
    savedRecord.analysisSettings.inflationAssumptions[field.fieldName],
    `${field.fieldName} should load from saved analysis settings.`
  );
});

const fallbackLoaded = analysisSetup.getInflationAssumptions({ analysisSettings: { inflationAssumptions: {} } });
finalExpenseInflationFields.forEach(function (field) {
  assert.equal(
    fallbackLoaded[field.fieldName],
    field.defaultValue,
    `${field.fieldName} should fall back to its default when missing.`
  );
});

const validationFields = {
  enabled: {
    checked: true
  },
  finalExpenseTargetAge: createField(85)
};
[...finalExpenseInflationFields, existingCurrentOutputField].forEach(function (field, index) {
  validationFields[field.fieldName] = createField(1 + index / 10);
});
const validated = setupContext.LensApp.__expenseInflationHarness.readValidatedAssumptions(validationFields);
assert.equal(validated.error, undefined);
finalExpenseInflationFields.forEach(function (field) {
  assert.equal(
    validated.value[field.fieldName],
    Number(validationFields[field.fieldName].value),
    `${field.fieldName} should save validated user-entered values.`
  );
});

const invalidFields = {
  ...validationFields,
  foodInflationRatePercent: createField("invalid")
};
const invalidResult = setupContext.LensApp.__expenseInflationHarness.readValidatedAssumptions(invalidFields);
assert.match(invalidResult.error, /Food inflation must be a numeric percentage/);

const newSavedOnlyFields = [
  "longTermCareInflationRatePercent",
  "housingOperatingInflationRatePercent",
  "childcareDependentCareInflationRatePercent",
  "foodInflationRatePercent",
  "transportationOperatingInflationRatePercent"
];
const engineFiles = [
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-resource-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-obligation-ledger.js",
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
  "app/features/lens-analysis/final-expense-inflation-calculations.js"
];
engineFiles.forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  newSavedOnlyFields.forEach(function (fieldName) {
    assert.doesNotMatch(
      source,
      new RegExp(fieldName),
      `${relativePath} should not consume new saved-only expense inflation control ${fieldName}.`
    );
  });
});

console.log("Analysis Setup expense inflation controls check passed.");
