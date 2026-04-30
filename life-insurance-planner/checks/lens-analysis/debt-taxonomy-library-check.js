#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const context = {
  console,
  window: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;

vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function assertNoProtectedDiffs() {
  const protectedFiles = [
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/asset-treatment-calculations.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "protected formula/model/setup files should not have diffs");
}

loadScript("app/features/lens-analysis/debt-taxonomy.js");
loadScript("app/features/lens-analysis/debt-library.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const taxonomy = lensAnalysis.debtTaxonomy;
const library = lensAnalysis.debtLibrary;

assert.ok(taxonomy, "debt taxonomy should export on LensApp.lensAnalysis");
assert.ok(library, "debt library should export on LensApp.lensAnalysis");
assert.ok(Array.isArray(taxonomy.DEFAULT_DEBT_CATEGORIES), "taxonomy categories should be an array");
assert.ok(Array.isArray(library.DEBT_LIBRARY_ENTRIES), "library entries should be an array");
assert.equal(typeof library.getDebtLibraryEntries, "function");
assert.equal(typeof library.findDebtLibraryEntry, "function");

const categories = Array.from(taxonomy.DEFAULT_DEBT_CATEGORIES);
const categoryKeys = Array.from(categories, (category) => category.categoryKey);
const expectedCategoryKeys = [
  "realEstateSecuredDebt",
  "securedConsumerDebt",
  "unsecuredConsumerDebt",
  "educationDebt",
  "medicalDebt",
  "taxLegalDebt",
  "businessDebt",
  "privatePersonalDebt",
  "consumerFinanceDebt",
  "otherDebt"
];

assert.deepEqual(categoryKeys, expectedCategoryKeys, "taxonomy should use the approved broad category buckets");
assert.ok(uniqueValues(categoryKeys), "category keys should be unique");

const bannedEquityKeys = ["primaryResidenceEquity", "realEstateEquity", "otherRealEstateEquity"];
bannedEquityKeys.forEach((key) => {
  assert.equal(categoryKeys.includes(key), false, `${key} must not be a debt category`);
});

const narrowTypeKeys = [
  "autoLoan",
  "motorcycleLoan",
  "rvLoan",
  "boatLoan",
  "storeCard",
  "chargeCard",
  "federalStudentLoan",
  "privateStudentLoan",
  "parentPlusLoan",
  "studentLoanRefinance",
  "medicalPaymentPlan",
  "dentalBill",
  "equipmentLoan",
  "sbaLoan",
  "privateNote",
  "buyNowPayLater",
  "paydayLoan"
];

narrowTypeKeys.forEach((key) => {
  assert.equal(categoryKeys.includes(key), false, `${key} should be a library type, not a taxonomy bucket`);
});

const entries = Array.from(library.getDebtLibraryEntries());
const entryKeys = Array.from(entries, (entry) => entry.libraryEntryKey);
const typeKeys = Array.from(entries, (entry) => entry.typeKey);
assert.ok(uniqueValues(entryKeys), "library entry keys should be unique");
assert.ok(uniqueValues(typeKeys), "library type keys should be unique");

entries.forEach((entry) => {
  assert.ok(categoryKeys.includes(entry.categoryKey), `${entry.libraryEntryKey} should reference a valid category`);
  assert.equal(entry.libraryEntryKey, entry.typeKey, `${entry.libraryEntryKey} should keep libraryEntryKey and typeKey aligned`);
  bannedEquityKeys.forEach((key) => {
    assert.notEqual(entry.libraryEntryKey, key, `${key} must not be a debt library entry`);
    assert.notEqual(entry.typeKey, key, `${key} must not be a debt library type`);
    assert.notEqual(entry.categoryKey, key, `${key} must not be a debt library category`);
  });
});

narrowTypeKeys.forEach((key) => {
  assert.ok(library.findDebtLibraryEntry(key), `${key} should exist as a searchable debt library entry`);
});

const customDebt = library.findDebtLibraryEntry("customDebt");
assert.ok(customDebt, "custom debt entry should exist");
assert.equal(customDebt.categoryKey, "otherDebt");
assert.equal(customDebt.isCustomType, true);
assert.equal(customDebt.isAddable, true);

const primaryMortgage = library.findDebtLibraryEntry("primaryResidenceMortgage");
assert.ok(primaryMortgage, "primary residence mortgage library metadata should exist");
assert.equal(primaryMortgage.categoryKey, "realEstateSecuredDebt");
assert.equal(primaryMortgage.isHousingFieldOwned, true);
assert.equal(primaryMortgage.isAddable, false);
assert.equal(primaryMortgage.ownedByField, "mortgageBalance");
assert.equal(primaryMortgage.duplicateProtection, "mortgageBalance-remains-single-source");

assertNoProtectedDiffs();

console.log("debt-taxonomy-library-check passed");
