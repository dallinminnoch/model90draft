#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
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

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

const taxonomySource = loadScript("app/features/lens-analysis/expense-taxonomy.js");
const librarySource = loadScript("app/features/lens-analysis/expense-library.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const taxonomy = lensAnalysis.expenseTaxonomy;
const library = lensAnalysis.expenseLibrary;

assert.ok(taxonomy, "expense taxonomy should export on LensApp.lensAnalysis");
assert.ok(library, "expense library should export on LensApp.lensAnalysis");
assert.ok(Array.isArray(taxonomy.DEFAULT_EXPENSE_CATEGORIES), "taxonomy categories should be an array");
assert.ok(Array.isArray(library.EXPENSE_LIBRARY_ENTRIES), "library entries should be an array");
assert.equal(typeof taxonomy.getExpenseCategories, "function");
assert.equal(typeof taxonomy.getExpenseCategory, "function");
assert.equal(typeof taxonomy.isValidExpenseCategory, "function");
assert.equal(typeof taxonomy.isValidExpenseFrequency, "function");
assert.equal(typeof taxonomy.isValidExpenseTermType, "function");
assert.equal(typeof taxonomy.normalizeExpenseFrequency, "function");
assert.equal(typeof taxonomy.normalizeExpenseTermType, "function");
assert.equal(typeof library.getExpenseLibraryEntries, "function");
assert.equal(typeof library.getExpenseLibraryEntry, "function");
assert.equal(typeof library.findExpenseLibraryEntry, "function");

const expectedCategoryKeys = [
  "medicalFinalExpense",
  "funeralBurial",
  "estateSettlement",
  "otherFinalExpense",
  "ongoingHealthcare",
  "dentalCare",
  "visionCare",
  "mentalHealthCare",
  "longTermCare",
  "homeHealthCare",
  "medicalEquipment",
  "otherHealthcare",
  "housingExpense",
  "utilities",
  "foodGroceries",
  "transportation",
  "insurancePremiums",
  "childcare",
  "dependentSupport",
  "personalLiving",
  "otherLivingExpense",
  "educationExpense",
  "childActivityExpense",
  "childcareEducation",
  "businessOverhead",
  "professionalServices",
  "keyPersonReplacementExpense",
  "customExpense"
];

const categories = Array.from(taxonomy.getExpenseCategories());
const categoryKeys = Array.from(categories, (category) => category.categoryKey);
assert.deepEqual(categoryKeys, expectedCategoryKeys, "taxonomy should use the approved expense buckets");
assert.ok(uniqueValues(categoryKeys), "category keys should be unique");

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

const healthcareSensitiveBuckets = [
  "medicalFinalExpense",
  "ongoingHealthcare",
  "dentalCare",
  "visionCare",
  "mentalHealthCare",
  "longTermCare",
  "homeHealthCare",
  "medicalEquipment",
  "otherHealthcare"
];

const finalExpenseBuckets = [
  "medicalFinalExpense",
  "funeralBurial",
  "estateSettlement",
  "otherFinalExpense"
];

healthcareSensitiveBuckets.forEach((key) => {
  const category = taxonomy.getExpenseCategory(key);
  assert.equal(category.isHealthcareSensitive, true, `${key} should be healthcare-sensitive`);
  assert.equal(category.defaultInflationRole, "healthcareInflation", `${key} should default to healthcare inflation`);
});

finalExpenseBuckets.forEach((key) => {
  const category = taxonomy.getExpenseCategory(key);
  assert.equal(category.isFinalExpenseComponent, true, `${key} should be a final expense component`);
});

["weekly", "monthly", "quarterly", "semiAnnual", "annual", "oneTime"].forEach((frequency) => {
  assert.equal(taxonomy.isValidExpenseFrequency(frequency), true, `${frequency} should be a valid expense frequency`);
  assert.equal(taxonomy.normalizeExpenseFrequency(frequency), frequency);
});

["ongoing", "fixedYears", "untilAge", "untilDate", "oneTime"].forEach((termType) => {
  assert.equal(taxonomy.isValidExpenseTermType(termType), true, `${termType} should be a valid expense term type`);
  assert.equal(taxonomy.normalizeExpenseTermType(termType), termType);
});

assert.equal(taxonomy.normalizeExpenseFrequency("bad", "annual"), "annual");
assert.equal(taxonomy.normalizeExpenseTermType("bad", "fixedYears"), "fixedYears");

const entries = Array.from(library.getExpenseLibraryEntries());
const typeKeys = Array.from(entries, (entry) => entry.typeKey);
const entryKeys = Array.from(entries, (entry) => entry.libraryEntryKey);
assert.ok(uniqueValues(typeKeys), "library typeKeys should be unique");
assert.ok(uniqueValues(entryKeys), "library entry keys should be unique");

entries.forEach((entry) => {
  assert.equal(entry.libraryEntryKey, entry.typeKey, `${entry.typeKey} should keep libraryEntryKey and typeKey aligned`);
  assert.ok(categoryKeys.includes(entry.categoryKey), `${entry.typeKey} should reference a valid category`);
  assert.ok(entry.label, `${entry.typeKey} should have a label`);
  assert.ok(entry.description, `${entry.typeKey} should have a description`);
  assert.equal(taxonomy.isValidExpenseFrequency(entry.defaultFrequency), true, `${entry.typeKey} should have a valid defaultFrequency`);
  assert.equal(taxonomy.isValidExpenseTermType(entry.defaultTermType), true, `${entry.typeKey} should have a valid defaultTermType`);
  assert.ok(Array.isArray(entry.tags), `${entry.typeKey} should expose tags`);
  assert.ok(Array.isArray(entry.searchTerms), `${entry.typeKey} should expose searchTerms`);
});

const protectedScalarRows = [
  {
    typeKey: "funeralBurialEstimate",
    categoryKey: "funeralBurial",
    ownedByField: "funeralBurialEstimate",
    sourcePath: "protectionModeling.data.funeralBurialEstimate",
    duplicateProtection: "funeralBurialEstimate-remains-single-source"
  },
  {
    typeKey: "medicalEndOfLifeCosts",
    categoryKey: "medicalFinalExpense",
    ownedByField: "medicalEndOfLifeCosts",
    sourcePath: "protectionModeling.data.medicalEndOfLifeCosts",
    duplicateProtection: "medicalEndOfLifeCosts-remains-single-source"
  },
  {
    typeKey: "estateSettlementCosts",
    categoryKey: "estateSettlement",
    ownedByField: "estateSettlementCosts",
    sourcePath: "protectionModeling.data.estateSettlementCosts",
    duplicateProtection: "estateSettlementCosts-remains-single-source"
  },
  {
    typeKey: "otherFinalExpenses",
    categoryKey: "otherFinalExpense",
    ownedByField: "otherFinalExpenses",
    sourcePath: "protectionModeling.data.otherFinalExpenses",
    duplicateProtection: "otherFinalExpenses-remains-single-source"
  }
];

protectedScalarRows.forEach((expected) => {
  const entry = library.getExpenseLibraryEntry(expected.typeKey);
  assert.ok(entry, `${expected.typeKey} protected scalar row should exist`);
  assert.equal(entry.categoryKey, expected.categoryKey);
  assert.equal(entry.isDefaultExpense, true);
  assert.equal(entry.isScalarFieldOwned, true);
  assert.equal(entry.isProtected, true);
  assert.equal(entry.isAddable, false);
  assert.equal(entry.ownedByField, expected.ownedByField);
  assert.equal(entry.sourcePath, expected.sourcePath);
  assert.equal(entry.duplicateProtection, expected.duplicateProtection);
  assert.equal(entry.defaultFrequency, "oneTime");
  assert.equal(entry.defaultTermType, "oneTime");
});

const addableEntries = entries.filter((entry) => entry.isAddable === true);
protectedScalarRows.forEach((protectedRow) => {
  assert.equal(
    addableEntries.some((entry) => entry.typeKey === protectedRow.typeKey),
    false,
    `${protectedRow.typeKey} should not be duplicated by an addable entry`
  );
});

[
  "healthInsurancePremiums",
  "medicalOutOfPocket",
  "prescriptionMedications",
  "specialistVisits",
  "therapyCounseling",
  "physicalTherapy",
  "dentalInsurance",
  "dentalOutOfPocket",
  "orthodontics",
  "visionInsurance",
  "visionOutOfPocket",
  "hearingAidsAudiology",
  "durableMedicalEquipment",
  "homeHealthAide",
  "nursingCare",
  "assistedLiving",
  "memoryCare",
  "hospiceCare",
  "hospitalFinalBill",
  "endOfLifePrescriptionCosts",
  "otherHealthcareExpense"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist as a healthcare expense entry`);
  assert.equal(entry.isAddable, true, `${typeKey} should be addable`);
  assert.equal(taxonomy.getExpenseCategory(entry.categoryKey).isHealthcareSensitive, true, `${typeKey} should map to a healthcare-sensitive bucket`);
});

[
  "cremation",
  "burialPlot",
  "headstoneMarker",
  "memorialService",
  "obituaryDeathCertificates",
  "travelForFamilyFinalArrangements",
  "probateAttorney",
  "executorFees",
  "finalTaxPreparation",
  "estateAdministrationCosts"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist as a funeral/estate expense entry`);
  assert.equal(entry.isAddable, true, `${typeKey} should be addable`);
  assert.equal(taxonomy.getExpenseCategory(entry.categoryKey).isFinalExpenseComponent, true, `${typeKey} should map to a final-expense bucket`);
});

const customExpense = library.getExpenseLibraryEntry("customExpense");
assert.ok(customExpense, "customExpense should exist");
assert.equal(customExpense.categoryKey, "customExpense");
assert.equal(customExpense.isAddable, true);
assert.equal(customExpense.isCustomType, true);

const bannedRuntimeReferences = [
  "runNeedsAnalysis",
  "runDimeAnalysis",
  "runHumanLifeValueAnalysis",
  "analysisMethods",
  "analysisSettings",
  "step-three",
  "stepThree",
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

console.log("expense-taxonomy-library-check passed");
