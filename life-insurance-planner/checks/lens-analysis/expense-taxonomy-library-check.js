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
  return source;
}

function assertNoProtectedDiffs() {
  const protectedFiles = [
    "pages/next-step.html",
    "pages/confidential-inputs.html",
    "pages/manual-protection-modeling-inputs.html",
    "pages/analysis-setup.html",
    "pages/analysis-estimate.html",
    "pages/income-loss-impact.html",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "app/features/lens-analysis/household-survivor-runway-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "runtime, page, method, display, adapter, model-builder, and normalization files should not have diffs");
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function byType(typeKey) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  return entry;
}

function assertEntry(typeKey, expected) {
  const entry = byType(typeKey);
  Object.entries(expected).forEach(([key, value]) => {
    assert.equal(entry[key], value, `${typeKey}.${key} should be ${value}`);
  });
  return entry;
}

function assertSearchTerms(typeKey, terms) {
  const entry = byType(typeKey);
  const search = entry.searchTerms.join("|").toLowerCase();
  terms.forEach((term) => {
    assert.ok(search.includes(term.toLowerCase()), `${typeKey} should include search term ${term}`);
  });
}

const taxonomySource = loadScript("app/features/lens-analysis/expense-taxonomy.js");
const librarySource = loadScript("app/features/lens-analysis/expense-library.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const taxonomy = lensAnalysis.expenseTaxonomy;
const library = lensAnalysis.expenseLibrary;

assert.ok(taxonomy, "expense taxonomy should export on LensApp.lensAnalysis");
assert.ok(library, "expense library should export on LensApp.lensAnalysis");
assert.equal(typeof taxonomy.getExpenseCategory, "function");
assert.equal(typeof taxonomy.isValidExpenseCategory, "function");
assert.equal(typeof taxonomy.isValidExpenseFrequency, "function");
assert.equal(typeof taxonomy.isValidExpenseTermType, "function");
assert.equal(typeof library.getExpenseLibraryEntries, "function");
assert.equal(typeof library.getExpenseLibraryEntry, "function");
assert.equal(typeof library.findExpenseLibraryEntry, "function");

const categories = taxonomy.getExpenseCategories();
const entries = library.getExpenseLibraryEntries();
const categoryKeys = categories.map((category) => category.categoryKey);
const typeKeys = entries.map((entry) => entry.typeKey);
const entryKeys = entries.map((entry) => entry.libraryEntryKey);

assert.ok(uniqueValues(categoryKeys), "category keys should be unique");
assert.ok(uniqueValues(typeKeys), "library typeKeys should be unique");
assert.ok(uniqueValues(entryKeys), "library entry keys should be unique");
assert.ok(entries.length > 250, "compressed advisor-facing expense library should be materially expanded");

const compressedGroupLabels = [
  "Food & Household Consumables",
  "Discretionary Lifestyle",
  "Travel & Vacations",
  "Transportation & Vehicle Ownership",
  "Debt Obligations",
  "Savings, Investing & Goal Contributions",
  "Taxes",
  "Insurance Premiums",
  "Housing",
  "Utilities & Communications",
  "Child, Dependent & Family Support",
  "Education & Enrichment",
  "Healthcare",
  "Personal Living",
  "Giving, Gifts & Community Obligations",
  "Pets",
  "Legal, Professional & Administrative",
  "Business & Self-Employment",
  "Banking, Finance Charges & Transaction Costs",
  "Periodic, One-Time & Sinking-Fund Expenses",
  "Custom Expense"
];

const categoryLabels = categories.map((category) => category.label);
const libraryGroups = new Set(entries.map((entry) => entry.group));
compressedGroupLabels.forEach((label) => {
  assert.ok(
    categoryLabels.includes(label) || libraryGroups.has(label),
    `${label} compressed group should exist in taxonomy/library metadata`
  );
});

categories.forEach((category) => {
  assert.ok(category.label, `${category.categoryKey} should have a label`);
  assert.ok(category.description, `${category.categoryKey} should have a description`);
  assert.ok(category.domain, `${category.categoryKey} should have a domain`);
  assert.ok(["oneTime", "recurring", "mixed"].includes(category.timingRole), `${category.categoryKey} should have a valid timingRole`);
  assert.equal(typeof category.isHealthcareSensitive, "boolean", `${category.categoryKey} should flag healthcare sensitivity`);
  assert.equal(typeof category.isFinalExpenseComponent, "boolean", `${category.categoryKey} should flag final expense component status`);
  assert.ok(category.defaultInflationRole, `${category.categoryKey} should have a default inflation role`);
  assert.ok(Number.isFinite(category.sortOrder), `${category.categoryKey} should have a sortOrder`);
});

entries.forEach((entry) => {
  assert.equal(entry.libraryEntryKey, entry.typeKey, `${entry.typeKey} should keep libraryEntryKey and typeKey aligned`);
  assert.ok(categoryKeys.includes(entry.categoryKey), `${entry.typeKey} should reference a valid category`);
  assert.ok(entry.label, `${entry.typeKey} should have a label`);
  assert.ok(entry.description, `${entry.typeKey} should have a description`);
  assert.equal(taxonomy.isValidExpenseFrequency(entry.defaultFrequency), true, `${entry.typeKey} should have a valid defaultFrequency`);
  assert.equal(taxonomy.isValidExpenseTermType(entry.defaultTermType), true, `${entry.typeKey} should have a valid defaultTermType`);
  assert.ok(library.EXPENSE_UI_AVAILABILITY_VALUES.includes(entry.uiAvailability), `${entry.typeKey} should have valid uiAvailability`);
  assert.ok(library.EXPENSE_CONTINUATION_STATUS_VALUES.includes(entry.defaultContinuationStatus), `${entry.typeKey} should have valid continuationStatus`);
  assert.ok(Array.isArray(entry.tags), `${entry.typeKey} should expose tags`);
  assert.ok(Array.isArray(entry.searchTerms), `${entry.typeKey} should expose searchTerms`);
  assert.ok(entry.searchTerms.includes(entry.group), `${entry.typeKey} should be searchable by group label`);
});

[
  "medicalFinalExpense",
  "ongoingHealthcare",
  "dentalCare",
  "visionCare",
  "mentalHealthCare",
  "longTermCare",
  "homeHealthCare",
  "medicalEquipment",
  "otherHealthcare"
].forEach((key) => {
  const category = taxonomy.getExpenseCategory(key);
  assert.equal(category.isHealthcareSensitive, true, `${key} should remain healthcare-sensitive`);
  assert.equal(category.defaultInflationRole, "healthcareInflation", `${key} should keep healthcare inflation role`);
});

[
  "medicalFinalExpense",
  "funeralBurial",
  "estateSettlement",
  "otherFinalExpense"
].forEach((key) => {
  assert.equal(taxonomy.getExpenseCategory(key).isFinalExpenseComponent, true, `${key} should remain a final expense component`);
});

[
  "funeralBurialEstimate",
  "medicalEndOfLifeCosts",
  "estateSettlementCosts",
  "otherFinalExpenses"
].forEach((typeKey) => {
  const entry = byType(typeKey);
  assert.equal(entry.isDefaultExpense, true);
  assert.equal(entry.isScalarFieldOwned, true);
  assert.equal(entry.isProtected, true);
  assert.equal(entry.isAddable, false);
  assert.equal(entry.uiAvailability, "future");
});

const priorityEntries = {
  groceries: "Food & Household Consumables",
  diningOutRestaurants: "Food & Household Consumables",
  takeoutConvenienceFood: "Food & Household Consumables",
  householdConsumablesSupplies: "Food & Household Consumables",
  entertainmentRecreation: "Discretionary Lifestyle",
  streamingDigitalSubscriptions: "Discretionary Lifestyle",
  vacationsTravel: "Travel & Vacations",
  weekendShortTrips: "Travel & Vacations",
  fuel: "Transportation & Vehicle Ownership",
  publicTransit: "Transportation & Vehicle Ownership",
  rideshareTaxi: "Transportation & Vehicle Ownership",
  vehicleReplacementFund: "Transportation & Vehicle Ownership",
  retirementContributions: "Savings, Investing & Goal Contributions",
  educationSavingsContributions: "Savings, Investing & Goal Contributions",
  emergencyFundContributions: "Savings, Investing & Goal Contributions",
  quarterlyEstimatedTaxes: "Taxes",
  payrollTaxWithholdingGap: "Taxes",
  termLifePremiums: "Insurance Premiums",
  permanentLifePremiums: "Insurance Premiums",
  mortgageInsurancePmi: "Housing",
  utilitiesEscrowUtilityArrears: "Housing",
  electricity: "Utilities & Communications",
  mobilePhone: "Utilities & Communications",
  daycareChildcare: "Child, Dependent & Family Support",
  alimonyPaid: "Child, Dependent & Family Support",
  collegeTuition: "Education & Enrichment",
  specialEducationServices: "Education & Enrichment",
  deductibleAnnualExposureReserve: "Healthcare",
  chronicConditionSupplies: "Healthcare",
  mentalHealthCare: "Healthcare",
  dryCleaningLaundry: "Personal Living",
  diapersBabySupplies: "Personal Living",
  charitableGiving: "Giving, Gifts & Community Obligations",
  tithingReligiousGiving: "Giving, Gifts & Community Obligations",
  petFoodSupplies: "Pets",
  emergencyVetReserve: "Pets",
  financialPlanningFees: "Legal, Professional & Administrative",
  legalFeesCourtFees: "Legal, Professional & Administrative",
  softwareSaasWebsiteHosting: "Business & Self-Employment",
  ownerDrawGap: "Business & Self-Employment",
  bankFees: "Banking, Finance Charges & Transaction Costs",
  creditCardInterest: "Banking, Finance Charges & Transaction Costs",
  holidaySeasonalSpending: "Periodic, One-Time & Sinking-Fund Expenses",
  taxBillTrueUp: "Periodic, One-Time & Sinking-Fund Expenses",
  otherCustomExpense: "Custom Expense"
};

Object.entries(priorityEntries).forEach(([typeKey, group]) => {
  const entry = byType(typeKey);
  assert.equal(entry.group, group, `${typeKey} should be in ${group}`);
  assert.equal(entry.isAddable, true, `${typeKey} should be advisor-addable raw/library metadata`);
});

assertSearchTerms("householdConsumablesSupplies", ["paper goods", "cleaning supplies", "toiletries", "laundry supplies"]);
assertSearchTerms("diningOutRestaurants", ["restaurants", "eating out"]);
assertSearchTerms("educationSavingsContributions", ["529", "college savings"]);
assertSearchTerms("tithingReligiousGiving", ["tithing", "religious giving"]);
assertSearchTerms("softwareSaasWebsiteHosting", ["saas", "hosting"]);

[
  "autoLoanPayment",
  "autoLeasePayment",
  "creditCardMinimumPayment",
  "studentLoanPayment",
  "personalLoanPayment",
  "taxDebtIrsPaymentPlan",
  "medicalDebtPayment",
  "businessDebtPayment",
  "otherDebtPayment",
  "businessLoanCreditCardPayment"
].forEach((typeKey) => {
  assertEntry(typeKey, {
    isAddable: false,
    uiAvailability: "future",
    sourcePath: "protectionModeling.data.debtRecords",
    duplicateProtection: "debtRecords-generated-payment-source"
  });
});

[
  "healthInsurancePremiums",
  "medicalOutOfPocket",
  "medicalEndOfLifeCosts",
  "funeralBurialEstimate",
  "estateSettlementCosts",
  "groceries",
  "rentOrMortgagePayment",
  "propertyTaxes",
  "householdUtilities",
  "customExpenseRecord"
].forEach((typeKey) => {
  assert.ok(byType(typeKey), `${typeKey} existing key should be preserved`);
});

const bannedRuntimeReferences = [
  "runNeedsAnalysis",
  "runDimeAnalysis",
  "runHumanLifeValueAnalysis",
  "analysisMethods",
  "analysisSettings",
  "localStorage",
  "sessionStorage",
  "document.",
  "querySelector",
  "addEventListener",
  "calculateFinalExpenseInflationProjection",
  "calculateInflationProjection"
];

bannedRuntimeReferences.forEach((token) => {
  assert.equal(taxonomySource.includes(token), false, `expense taxonomy should not reference ${token}`);
  assert.equal(librarySource.includes(token), false, `expense library should not reference ${token}`);
});

assertNoProtectedDiffs();

console.log("expense-taxonomy-library-check passed");
