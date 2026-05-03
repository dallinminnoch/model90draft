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
    "app/features/lens-analysis/final-expense-inflation-calculations.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "runtime, page, method, display, adapter, and normalization files should not have diffs");
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
assert.deepEqual(
  Array.from(library.EXPENSE_UI_AVAILABILITY_VALUES),
  ["initial", "advanced", "future"],
  "library should expose the approved UI availability enum"
);
assert.deepEqual(
  Array.from(library.EXPENSE_CONTINUATION_STATUS_VALUES),
  ["continues", "stops", "review"],
  "library should expose the approved continuationStatus enum"
);
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
const allowedUiAvailabilityValues = Array.from(library.EXPENSE_UI_AVAILABILITY_VALUES);
const allowedContinuationStatusValues = Array.from(library.EXPENSE_CONTINUATION_STATUS_VALUES);
assert.ok(uniqueValues(typeKeys), "library typeKeys should be unique");
assert.ok(uniqueValues(entryKeys), "library entry keys should be unique");

entries.forEach((entry) => {
  assert.equal(entry.libraryEntryKey, entry.typeKey, `${entry.typeKey} should keep libraryEntryKey and typeKey aligned`);
  assert.ok(categoryKeys.includes(entry.categoryKey), `${entry.typeKey} should reference a valid category`);
  assert.ok(entry.label, `${entry.typeKey} should have a label`);
  assert.ok(entry.description, `${entry.typeKey} should have a description`);
  assert.equal(taxonomy.isValidExpenseFrequency(entry.defaultFrequency), true, `${entry.typeKey} should have a valid defaultFrequency`);
  assert.equal(taxonomy.isValidExpenseTermType(entry.defaultTermType), true, `${entry.typeKey} should have a valid defaultTermType`);
  assert.ok(allowedUiAvailabilityValues.includes(entry.uiAvailability), `${entry.typeKey} should have a valid uiAvailability`);
  assert.equal(library.EXPENSE_UI_AVAILABILITY_BY_TYPE_KEY[entry.typeKey], entry.uiAvailability, `${entry.typeKey} should have explicit UI availability metadata`);
  assert.ok(allowedContinuationStatusValues.includes(entry.defaultContinuationStatus), `${entry.typeKey} should have a valid defaultContinuationStatus`);
  assert.ok(Array.isArray(entry.tags), `${entry.typeKey} should expose tags`);
  assert.ok(Array.isArray(entry.searchTerms), `${entry.typeKey} should expose searchTerms`);
  if (entry.defaultTermType === "fixedYears") {
    assert.equal(Number.isFinite(entry.suggestedTermYears), true, `${entry.typeKey} fixedYears default should include suggestedTermYears`);
    assert.ok(entry.suggestedTermYears > 0, `${entry.typeKey} suggestedTermYears should be positive`);
  }
});

const initialUiTypeKeys = [
  "healthInsurancePremiums",
  "medicarePartBPremiums",
  "medicarePartDPremiums",
  "medigapPremiums",
  "medicareAdvantagePremiums",
  "cobraPremiums",
  "medicalOutOfPocket",
  "prescriptionMedications",
  "specialistVisits",
  "therapyCounseling",
  "psychiatricMedicationManagement",
  "physicalTherapy",
  "dentalInsurance",
  "dentalOutOfPocket",
  "orthodontics",
  "majorDentalWork",
  "denturesImplants",
  "visionInsurance",
  "visionOutOfPocket",
  "glassesContacts",
  "eyeSurgery",
  "longTermCareInsurancePremiums",
  "adultDayCare",
  "respiteCare",
  "specialNeedsCare",
  "homeHealthAide",
  "medicalAlertMonitoring",
  "hearingAidsAudiology",
  "durableMedicalEquipment",
  "adaptiveHomeModification",
  "mobilityVehicleModification",
  "mobilityAids",
  "otherHealthcareExpense",
  "rentOrMortgagePayment",
  "propertyTaxes",
  "homeownersInsurance",
  "homeMaintenanceRepairs",
  "propertyAssessments",
  "hoaDues",
  "householdUtilities",
  "internetPhone",
  "groceries",
  "transportationFuel",
  "vehicleInsurance",
  "vehicleMaintenance",
  "rentersInsurance",
  "umbrellaInsurance",
  "disabilityInsurancePremiums",
  "petInsurance",
  "householdSupplies",
  "clothing",
  "subscriptionsMemberships",
  "petCare",
  "childcareExpense",
  "dependentSupportExpense",
  "personalCare",
  "privateSchoolTuition",
  "tutoring",
  "schoolSupplies",
  "childActivitiesSports",
  "earlyEducationChildcare",
  "customExpenseRecord"
];

const futureUiTypeKeys = [
  "funeralBurialEstimate",
  "medicalEndOfLifeCosts",
  "estateSettlementCosts",
  "otherFinalExpenses",
  "healthcareOutOfPocketSupportDefault",
  "businessOverheadRent",
  "businessPayrollCoverage",
  "professionalLicensingFees",
  "professionalAdvisorFees",
  "keyPersonRecruitingReplacement",
  "hospiceCare",
  "hospitalFinalBill",
  "endOfLifePrescriptionCosts",
  "cremation",
  "burialPlot",
  "headstoneMarker",
  "memorialService",
  "probateAttorney",
  "executorFees",
  "finalTaxPreparation",
  "estateAdministrationCosts",
  "obituaryDeathCertificates",
  "travelForFamilyFinalArrangements",
  "lifeInsurancePremiums",
  "hsaContributions",
  "householdInsurancePremiums",
  "householdTransportation",
  "otherHouseholdExpenseDefault",
  "discretionaryTravelEntertainment",
  "recurringPersonalSpendingDefault",
  "housingInsuranceDefault",
  "monthlyPropertyTaxDefault",
  "monthlyHomeMaintenanceDefault"
];

const advancedUiTypeKeys = [
  "inpatientMentalHealthCare",
  "nursingCare",
  "assistedLiving",
  "memoryCare",
  "collegeApplicationTesting"
];

[
  [initialUiTypeKeys, "initial"],
  [futureUiTypeKeys, "future"],
  [advancedUiTypeKeys, "advanced"]
].forEach(([expectedTypeKeys, expectedAvailability]) => {
  expectedTypeKeys.forEach((typeKey) => {
    const entry = library.getExpenseLibraryEntry(typeKey);
    assert.ok(entry, `${typeKey} should exist for UI availability validation`);
    assert.equal(entry.uiAvailability, expectedAvailability, `${typeKey} should be ${expectedAvailability}`);
  });
});

assert.deepEqual(
  typeKeys.slice().sort(),
  initialUiTypeKeys.concat(futureUiTypeKeys, advancedUiTypeKeys).slice().sort(),
  "every library entry should have an explicit expected UI availability"
);

const ltcPremiums = library.getExpenseLibraryEntry("longTermCareInsurancePremiums");
assert.equal(ltcPremiums.defaultFrequency, "monthly");
assert.equal(ltcPremiums.defaultTermType, "ongoing");

const inpatientMentalHealthCare = library.getExpenseLibraryEntry("inpatientMentalHealthCare");
assert.equal(inpatientMentalHealthCare.defaultFrequency, "oneTime");
assert.equal(inpatientMentalHealthCare.defaultTermType, "oneTime");

const futureSupportDefaultEntries = [
  {
    typeKey: "householdInsurancePremiums",
    categoryKey: "insurancePremiums",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "review"
  },
  {
    typeKey: "householdTransportation",
    categoryKey: "transportation",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "review"
  },
  {
    typeKey: "otherHouseholdExpenseDefault",
    categoryKey: "otherLivingExpense",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "continues"
  },
  {
    typeKey: "discretionaryTravelEntertainment",
    categoryKey: "personalLiving",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "review"
  },
  {
    typeKey: "recurringPersonalSpendingDefault",
    categoryKey: "personalLiving",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "review"
  },
  {
    typeKey: "housingInsuranceDefault",
    categoryKey: "housingExpense",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "continues"
  },
  {
    typeKey: "monthlyPropertyTaxDefault",
    categoryKey: "housingExpense",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "continues"
  },
  {
    typeKey: "monthlyHomeMaintenanceDefault",
    categoryKey: "housingExpense",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "continues"
  },
  {
    typeKey: "healthcareOutOfPocketSupportDefault",
    categoryKey: "ongoingHealthcare",
    defaultFrequency: "monthly",
    defaultTermType: "ongoing",
    defaultContinuationStatus: "review"
  }
];

futureSupportDefaultEntries.forEach((expected) => {
  const entry = library.getExpenseLibraryEntry(expected.typeKey);
  assert.ok(entry, `${expected.typeKey} future support default entry should exist`);
  assert.equal(entry.categoryKey, expected.categoryKey, `${expected.typeKey} should map to the intended support category`);
  assert.ok(categoryKeys.includes(entry.categoryKey), `${expected.typeKey} should map to a valid taxonomy category`);
  assert.equal(entry.defaultFrequency, expected.defaultFrequency, `${expected.typeKey} should use the scalar-support frequency`);
  assert.equal(entry.defaultTermType, expected.defaultTermType, `${expected.typeKey} should use the scalar-support term type`);
  assert.equal(entry.defaultContinuationStatus, expected.defaultContinuationStatus, `${expected.typeKey} should use the intended continuationStatus default`);
  assert.equal(entry.uiAvailability, "future", `${expected.typeKey} should remain future UI metadata only`);
  assert.equal(entry.isAddable, true, `${expected.typeKey} should remain addable metadata for future default expense rows`);
  assert.equal(entry.isProtected, false, `${expected.typeKey} should not become a protected scalar row in this prep pass`);
  assert.equal(entry.isScalarFieldOwned, false, `${expected.typeKey} should not become scalar-owned until a future projection pass`);
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
  assert.equal(entry.uiAvailability, "future");
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
  "medicarePartBPremiums",
  "medicarePartDPremiums",
  "medigapPremiums",
  "medicareAdvantagePremiums",
  "cobraPremiums",
  "hsaContributions",
  "medicalOutOfPocket",
  "prescriptionMedications",
  "specialistVisits",
  "therapyCounseling",
  "psychiatricMedicationManagement",
  "inpatientMentalHealthCare",
  "physicalTherapy",
  "dentalInsurance",
  "dentalOutOfPocket",
  "orthodontics",
  "majorDentalWork",
  "denturesImplants",
  "visionInsurance",
  "visionOutOfPocket",
  "glassesContacts",
  "eyeSurgery",
  "hearingAidsAudiology",
  "durableMedicalEquipment",
  "adaptiveHomeModification",
  "mobilityVehicleModification",
  "mobilityAids",
  "homeHealthAide",
  "medicalAlertMonitoring",
  "longTermCareInsurancePremiums",
  "nursingCare",
  "assistedLiving",
  "memoryCare",
  "adultDayCare",
  "respiteCare",
  "specialNeedsCare",
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
  "rentOrMortgagePayment",
  "propertyTaxes",
  "homeownersInsurance",
  "homeMaintenanceRepairs",
  "hoaDues",
  "propertyAssessments",
  "householdUtilities",
  "internetPhone",
  "groceries",
  "transportationFuel",
  "vehicleInsurance",
  "vehicleMaintenance",
  "rentersInsurance",
  "umbrellaInsurance",
  "disabilityInsurancePremiums",
  "lifeInsurancePremiums",
  "petInsurance",
  "childcareExpense",
  "dependentSupportExpense",
  "householdInsurancePremiums",
  "householdTransportation",
  "otherHouseholdExpenseDefault",
  "discretionaryTravelEntertainment",
  "recurringPersonalSpendingDefault",
  "housingInsuranceDefault",
  "monthlyPropertyTaxDefault",
  "monthlyHomeMaintenanceDefault",
  "personalCare",
  "householdSupplies",
  "clothing",
  "subscriptionsMemberships",
  "petCare",
  "schoolSupplies",
  "earlyEducationChildcare"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist as a living, household, insurance, or education expense entry`);
  assert.equal(entry.isAddable, true, `${typeKey} should be addable`);
});

[
  "hospiceCare",
  "hospitalFinalBill",
  "endOfLifePrescriptionCosts",
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

[
  ["utilities", "householdUtilities"],
  ["childcare", "childcareExpense"],
  ["dependentSupport", "dependentSupportExpense"],
  ["childcareEducation", "earlyEducationChildcare"],
  ["keyPersonReplacementExpense", "keyPersonRecruitingReplacement"],
  ["customExpense", "customExpenseRecord"]
].forEach(([oldTypeKey, newTypeKey]) => {
  assert.equal(library.getExpenseLibraryEntry(oldTypeKey), null, `${oldTypeKey} typeKey should be retired to avoid category/type key collision`);
  assert.ok(library.getExpenseLibraryEntry(newTypeKey), `${newTypeKey} replacement typeKey should exist`);
});

const customExpense = library.getExpenseLibraryEntry("customExpenseRecord");
assert.ok(customExpense, "customExpenseRecord should exist");
assert.equal(customExpense.categoryKey, "customExpense");
assert.equal(customExpense.isAddable, true);
assert.equal(customExpense.isCustomType, true);
assert.equal(customExpense.defaultContinuationStatus, "review", "customExpenseRecord should default continuationStatus to review");

[
  "funeralBurialEstimate",
  "medicalEndOfLifeCosts",
  "hospiceCare",
  "cremation",
  "probateAttorney"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.defaultContinuationStatus, "continues", `${typeKey} should default continuationStatus to continues`);
});

[
  "healthInsurancePremiums",
  "medicalOutOfPocket",
  "healthcareOutOfPocketSupportDefault",
  "dentalOutOfPocket",
  "therapyCounseling",
  "longTermCareInsurancePremiums",
  "homeHealthAide",
  "durableMedicalEquipment",
  "otherHealthcareExpense"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.defaultContinuationStatus, "review", `${typeKey} healthcare continuationStatus should default to review`);
});

[
  "rentOrMortgagePayment",
  "propertyTaxes",
  "householdUtilities",
  "internetPhone",
  "groceries",
  "householdSupplies",
  "otherHouseholdExpenseDefault",
  "housingInsuranceDefault",
  "monthlyPropertyTaxDefault",
  "monthlyHomeMaintenanceDefault",
  "childcareExpense",
  "dependentSupportExpense"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.defaultContinuationStatus, "continues", `${typeKey} household/dependent continuationStatus should default to continues`);
});

[
  "disabilityInsurancePremiums",
  "lifeInsurancePremiums"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.defaultContinuationStatus, "stops", `${typeKey} continuationStatus should default to stops`);
});

[
  "transportationFuel",
  "householdTransportation",
  "vehicleInsurance",
  "vehicleMaintenance",
  "householdInsurancePremiums",
  "rentersInsurance",
  "umbrellaInsurance",
  "petInsurance",
  "personalCare",
  "clothing",
  "subscriptionsMemberships",
  "recurringPersonalSpendingDefault",
  "discretionaryTravelEntertainment",
  "petCare",
  "businessOverheadRent"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.defaultContinuationStatus, "review", `${typeKey} ambiguous continuationStatus should default to review`);
});

[
  "privateSchoolTuition",
  "tutoring",
  "collegeApplicationTesting",
  "schoolSupplies",
  "childActivitiesSports",
  "earlyEducationChildcare"
].forEach((typeKey) => {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.defaultContinuationStatus, "continues", `${typeKey} education continuationStatus should default to continues`);
});

const bannedRuntimeReferences = [
  "runNeedsAnalysis",
  "runDimeAnalysis",
  "runHumanLifeValueAnalysis",
  "analysisMethods",
  "analysisSettings",
  "Analysis Setup",
  "analysis-setup",
  "method formulas",
  "Step 3",
  "step-three",
  "stepThree",
  "storage",
  "localStorage",
  "sessionStorage",
  "DOM",
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
