#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const APPROVED_PLANNING_BUCKET_KEYS = Object.freeze([
  "finalExpenses",
  "healthcareCare",
  "housingCore",
  "basicUtilities",
  "communicationsConnectivity",
  "foodAtHomeConsumables",
  "householdConsumables",
  "diningTakeout",
  "transportationBasics",
  "vehicleOwnershipMaintenance",
  "insurancePremiums",
  "childcareDependentSupport",
  "educationEnrichment",
  "personalLivingClothing",
  "householdServices",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations",
  "petsCoreCare",
  "petsDiscretionary",
  "givingCommunity",
  "taxesLegalAdministrative",
  "debtObligations",
  "savingsGoalContributions",
  "businessSelfEmployment",
  "financialFeesTransactionCosts",
  "periodicSinkingFundOneTime",
  "customUnknown"
]);

const APPROVED_INFLATION_BUCKET_KEYS = Object.freeze([
  "householdExpenseInflation",
  "generalInflation",
  "healthcareInflation",
  "finalExpenseInflation",
  "educationInflation",
  "noInflationCurrentDollar"
]);

const APPROVED_LIFESTYLE_TREATMENT_REASONS = Object.freeze([
  "lifestyleFlexible",
  "pauseableGoalContribution",
  "protectedNeed",
  "contractualObligation",
  "legalTax",
  "sourceOwnedDebt",
  "sourceOwnedFinalExpense",
  "sourceOwnedHealthcare",
  "sourceOwnedEducation",
  "valuesBased",
  "businessOrIncomePreserving",
  "unknownExcluded"
]);

const EXPECTED_BUCKET_INFLATION = Object.freeze({
  finalExpenses: "finalExpenseInflation",
  healthcareCare: "healthcareInflation",
  housingCore: "householdExpenseInflation",
  basicUtilities: "householdExpenseInflation",
  communicationsConnectivity: "householdExpenseInflation",
  foodAtHomeConsumables: "householdExpenseInflation",
  householdConsumables: "householdExpenseInflation",
  diningTakeout: "householdExpenseInflation",
  transportationBasics: "householdExpenseInflation",
  vehicleOwnershipMaintenance: "householdExpenseInflation",
  insurancePremiums: "householdExpenseInflation",
  childcareDependentSupport: "householdExpenseInflation",
  educationEnrichment: "educationInflation",
  personalLivingClothing: "householdExpenseInflation",
  householdServices: "householdExpenseInflation",
  subscriptionsMemberships: "householdExpenseInflation",
  entertainmentRecreation: "householdExpenseInflation",
  travelVacations: "householdExpenseInflation",
  petsCoreCare: "householdExpenseInflation",
  petsDiscretionary: "householdExpenseInflation",
  givingCommunity: "householdExpenseInflation",
  taxesLegalAdministrative: "noInflationCurrentDollar",
  debtObligations: "noInflationCurrentDollar",
  savingsGoalContributions: "noInflationCurrentDollar",
  businessSelfEmployment: "generalInflation",
  financialFeesTransactionCosts: "noInflationCurrentDollar",
  periodicSinkingFundOneTime: "noInflationCurrentDollar",
  customUnknown: "noInflationCurrentDollar"
});

const EXPECTED_ENTRY_INFLATION_OVERRIDES = Object.freeze({
  utilityArrearsPaymentPlan: "noInflationCurrentDollar",
  solarLoanLeasePayment: "noInflationCurrentDollar"
});

const HEALTHCARE_PREMIUM_TYPE_KEYS = Object.freeze([
  "healthInsurancePremiums",
  "medicarePartBPremiums",
  "medicarePartDPremiums",
  "medigapPremiums",
  "medicareAdvantagePremiums",
  "cobraPremiums",
  "dentalInsurance",
  "visionInsurance",
  "longTermCareInsurancePremiums"
]);

const APPROVED_PRODUCT_DECISION_METADATA = Object.freeze({
  schoolMeals: Object.freeze({
    planningBucketKey: "foodAtHomeConsumables",
    planningBucketLabel: "Food at Home / Consumables",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  childActivitiesSports: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  extracurricularLessonsActivities: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  youthSportsTravelSports: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  activityFieldTripFees: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  musicSportsClubEnrichment: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  healthInsurancePremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  medicarePartBPremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  medicarePartDPremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  medigapPremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  medicareAdvantagePremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  cobraPremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  dentalInsurance: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  visionInsurance: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  longTermCareInsurancePremiums: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  homeownersInsurance: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  housingInsuranceDefault: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  vehicleInsurance: Object.freeze({
    planningBucketKey: "insurancePremiums",
    planningBucketLabel: "Insurance Premiums",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  financialPlanningFees: Object.freeze({
    planningBucketKey: "financialFeesTransactionCosts",
    planningBucketLabel: "Financial Fees / Transaction Costs",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "unknownExcluded",
    inflationBucketKey: "noInflationCurrentDollar"
  }),
  investmentAdvisoryFees: Object.freeze({
    planningBucketKey: "financialFeesTransactionCosts",
    planningBucketLabel: "Financial Fees / Transaction Costs",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "unknownExcluded",
    inflationBucketKey: "noInflationCurrentDollar"
  }),
  bookkeeping: Object.freeze({
    planningBucketKey: "financialFeesTransactionCosts",
    planningBucketLabel: "Financial Fees / Transaction Costs",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "unknownExcluded",
    inflationBucketKey: "noInflationCurrentDollar"
  }),
  licensingCredentialFees: Object.freeze({
    planningBucketKey: "businessSelfEmployment",
    planningBucketLabel: "Business / Self-Employment",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "businessOrIncomePreserving",
    inflationBucketKey: "generalInflation"
  }),
  unionDues: Object.freeze({
    planningBucketKey: "businessSelfEmployment",
    planningBucketLabel: "Business / Self-Employment",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "businessOrIncomePreserving",
    inflationBucketKey: "generalInflation"
  }),
  professionalAssociationDues: Object.freeze({
    planningBucketKey: "businessSelfEmployment",
    planningBucketLabel: "Business / Self-Employment",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "businessOrIncomePreserving",
    inflationBucketKey: "generalInflation"
  }),
  continuingEducation: Object.freeze({
    planningBucketKey: "businessSelfEmployment",
    planningBucketLabel: "Business / Self-Employment",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "businessOrIncomePreserving",
    inflationBucketKey: "generalInflation"
  }),
  giftsHolidaysCelebrations: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  holidaySeasonalSpending: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  weddingsFamilyEvents: Object.freeze({
    planningBucketKey: "entertainmentRecreation",
    planningBucketLabel: "Entertainment / Recreation",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  homeSecurityMonitoring: Object.freeze({
    planningBucketKey: "householdServices",
    planningBucketLabel: "Household Services",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  securitySystem: Object.freeze({
    planningBucketKey: "householdServices",
    planningBucketLabel: "Household Services",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: "householdExpenseInflation"
  }),
  timeshareVacationClubFees: Object.freeze({
    planningBucketKey: "travelVacations",
    planningBucketLabel: "Travel / Vacations",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }),
  utilityArrearsPaymentPlan: Object.freeze({
    planningBucketKey: "basicUtilities",
    planningBucketLabel: "Basic Utilities",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "noInflationCurrentDollar"
  }),
  solarLoanLeasePayment: Object.freeze({
    planningBucketKey: "basicUtilities",
    planningBucketLabel: "Basic Utilities",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "noInflationCurrentDollar"
  }),
  familyEventWeddingSavings: Object.freeze({
    planningBucketKey: "savingsGoalContributions",
    planningBucketLabel: "Savings / Goal Contributions",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "pauseableGoalContribution",
    inflationBucketKey: "noInflationCurrentDollar"
  }),
  generatorBackupPower: Object.freeze({
    planningBucketKey: "basicUtilities",
    planningBucketLabel: "Basic Utilities",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "protectedNeed",
    inflationBucketKey: "householdExpenseInflation"
  }),
  businessAccountingBookkeeping: Object.freeze({
    planningBucketKey: "businessSelfEmployment",
    planningBucketLabel: "Business / Self-Employment",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "businessOrIncomePreserving",
    inflationBucketKey: "generalInflation"
  })
});

const GIVING_VALUES_BASED_TYPE_KEYS = Object.freeze([
  "charitableGiving",
  "tithingReligiousGiving",
  "remittancesFamilyAssistance",
  "communityDues",
  "politicalContributions"
]);

const EDUCATION_CATEGORY_METADATA_EXCEPTION_TYPE_KEYS = Object.freeze([
  "schoolMeals",
  "childActivitiesSports",
  "extracurricularLessonsActivities",
  "youthSportsTravelSports",
  "activityFieldTripFees",
  "musicSportsClubEnrichment"
]);

const TAX_LEGAL_METADATA_EXCEPTION_TYPE_KEYS = Object.freeze([
  "financialPlanningFees",
  "investmentAdvisoryFees",
  "licensingCredentialFees",
  "unionDues",
  "professionalAssociationDues",
  "continuingEducation",
  "bookkeeping"
]);

const FINAL_EXPENSE_CATEGORY_KEYS = Object.freeze([
  "medicalFinalExpense",
  "funeralBurial",
  "estateSettlement",
  "otherFinalExpense"
]);

const HEALTHCARE_CARE_CATEGORY_KEYS = Object.freeze([
  "ongoingHealthcare",
  "dentalCare",
  "visionCare",
  "mentalHealthCare",
  "longTermCare",
  "homeHealthCare",
  "medicalEquipment",
  "otherHealthcare"
]);

const EDUCATION_CATEGORY_KEYS = Object.freeze([
  "educationExpense",
  "childActivityExpense",
  "childcareEducation"
]);

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath, sourceOverride) {
  const source = typeof sourceOverride === "string" ? sourceOverride : readRepoFile(relativePath);
  vm.runInContext(source, context, { filename: relativePath });
  return source;
}

function createLibraryContext(librarySourceOverride) {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/expense-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/expense-library.js", librarySourceOverride);
  return context;
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function mapEntriesByType(entries, selector) {
  return entries.reduce(function (map, entry) {
    map[entry.typeKey] = selector(entry);
    return map;
  }, {});
}

function assertNoForbiddenDiffs() {
  const forbiddenFiles = [
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/household-expense-compression-calculations.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/account-settings/household-expense-account-policy-admin-editor.js",
    "app/features/account-settings/household-expense-account-policy-admin-display.js",
    "app/features/account-settings/household-expense-account-policy-storage.js",
    "app/features/lens-analysis/household-expense-account-policy-resolver.js",
    "pages",
    "app.js",
    "styles.css",
    "app/styles"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(forbiddenFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "runtime, normalization, UI, storage, CSS, page, and bootstrap files should not have diffs");
}

function readHeadExpenseLibrarySource() {
  const topLevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();
  const libraryPath = path.join(repoRoot, "app/features/lens-analysis/expense-library.js");
  const gitPath = path.relative(topLevel, libraryPath).replace(/\\/g, "/");
  return execFileSync("git", ["show", `HEAD:${gitPath}`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function assertEntry(entry, expected) {
  Object.entries(expected).forEach(function ([key, value]) {
    assert.equal(entry[key], value, `${entry.typeKey}.${key} should be ${value}`);
  });
}

function assertEntriesWithCategory(entries, categoryKeys, expected) {
  const categoryKeySet = new Set(categoryKeys);
  entries
    .filter(function (entry) {
      return categoryKeySet.has(entry.categoryKey);
    })
    .forEach(function (entry) {
      assertEntry(entry, expected);
    });
}

function assertNonConsumingInflationMetadata() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/analysis-settings-adapter.js");

  const adapter = context.LensApp.lensAnalysis.analysisSettingsAdapter;
  const result = adapter.createAnalysisMethodSettings({
    analysisSettings: {
      inflationAssumptions: {
        enabled: true,
        householdExpenseInflationRatePercent: 3,
        generalInflationRatePercent: 3,
        healthcareInflationRatePercent: 5,
        finalExpenseInflationRatePercent: 3,
        educationInflationRatePercent: 5
      }
    },
    lensModel: {},
    profileRecord: {}
  });

  assert.equal(Object.prototype.hasOwnProperty.call(result.dimeSettings, "inflationAssumptions"), false, "DIME settings should not receive inflation assumptions");
  assert.equal(Object.prototype.hasOwnProperty.call(result.humanLifeValueSettings, "inflationAssumptions"), false, "HLV settings should not receive inflation assumptions");
  assert.ok(result.needsAnalysisSettings.inflationAssumptions, "Needs settings should remain the current inflation-assumption consumer");
}

function assertRepeatableExpenseRecordsRemainUnwired() {
  const context = createLibraryContext();
  loadScript(context, "app/features/lens-analysis/normalize-lens-model.js");

  const taxonomy = context.LensApp.lensAnalysis.expenseTaxonomy;
  const projection = context.LensApp.lensAnalysis.createExpenseFactsFromSourceData({
    expenseRecords: [{
      typeKey: "groceries",
      amount: 250,
      frequency: "monthly",
      termType: "ongoing"
    }]
  });
  const expense = projection.expenses.find(function (candidate) {
    return candidate.typeKey === "groceries";
  });

  assert.ok(expense, "repeatable groceries expense record should still normalize into expenseFacts");
  assert.equal(expense.isRepeatableExpenseRecord, true, "repeatable expense record should remain a repeatable expense fact");
  assert.equal(expense.isHealthcareSensitive, false, "non-healthcare repeatable expense record should not become healthcare-sensitive");
  assert.equal(expense.isFinalExpenseComponent, false, "non-final repeatable expense record should not become a final expense component");
  assert.equal(Object.prototype.hasOwnProperty.call(expense, "planningBucketKey"), false, "normalization should not consume planningBucketKey metadata yet");
  assert.equal(Object.prototype.hasOwnProperty.call(expense, "inflationBucketKey"), false, "normalization should not consume inflationBucketKey metadata yet");
  assert.equal(Object.prototype.hasOwnProperty.call(expense, "lifestyleTreatmentIncluded"), false, "normalization should not consume lifestyle treatment metadata yet");
  assert.equal(
    expense.defaultInflationRole,
    taxonomy.getExpenseCategory("foodGroceries").defaultInflationRole,
    "repeatable expense fact should still expose taxonomy defaultInflationRole rather than new planning inflation metadata"
  );
}

assertNoForbiddenDiffs();

const currentContext = createLibraryContext();
loadScript(currentContext, "app/features/lens-analysis/household-expense-lifestyle-range-policy.js");

const library = currentContext.LensApp.lensAnalysis.expenseLibrary;
const lifestylePolicy = currentContext.LensApp.lensAnalysis.householdExpenseLifestyleRangePolicy;
const entries = library.getExpenseLibraryEntries();
const buckets = library.getExpensePlanningBuckets();

assert.deepEqual(Array.from(library.EXPENSE_PLANNING_BUCKET_KEYS), APPROVED_PLANNING_BUCKET_KEYS, "planning bucket key export should match the approved list");
assert.deepEqual(Array.from(library.EXPENSE_INFLATION_BUCKET_KEYS), APPROVED_INFLATION_BUCKET_KEYS, "inflation bucket enum should match the approved list");
assert.deepEqual(Array.from(library.EXPENSE_LIFESTYLE_TREATMENT_REASONS), APPROVED_LIFESTYLE_TREATMENT_REASONS, "lifestyle treatment reasons should match the approved list");
assert.equal(entries.length, 349, "current expense library row count should remain unchanged");
assert.equal(uniqueValues(entries.map(function (entry) { return entry.typeKey; })), true, "expense library typeKeys should remain unique");

const bucketKeys = Array.from(buckets, function (bucket) {
  return bucket.planningBucketKey;
});
assert.equal(uniqueValues(bucketKeys), true, "planning bucket keys should be unique");
assert.deepEqual(bucketKeys, APPROVED_PLANNING_BUCKET_KEYS, "planning bucket metadata should expose exactly the approved keys");

buckets.forEach(function (bucket) {
  assert.ok(bucket.planningBucketLabel, `${bucket.planningBucketKey} should have a planningBucketLabel`);
  assert.equal(typeof bucket.lifestyleTreatmentIncluded, "boolean", `${bucket.planningBucketKey} should have a boolean lifestyleTreatmentIncluded`);
  assert.ok(APPROVED_LIFESTYLE_TREATMENT_REASONS.includes(bucket.lifestyleTreatmentReason), `${bucket.planningBucketKey} should have an approved lifestyleTreatmentReason`);
  assert.notEqual(bucket.lifestyleTreatmentReason, "reviewOnly", `${bucket.planningBucketKey} should not use reviewOnly treatment`);
  assert.equal(bucket.inflationBucketKey, EXPECTED_BUCKET_INFLATION[bucket.planningBucketKey], `${bucket.planningBucketKey} should have the approved default inflationBucketKey`);
  assert.ok(APPROVED_INFLATION_BUCKET_KEYS.includes(bucket.inflationBucketKey), `${bucket.planningBucketKey} should have an approved inflationBucketKey`);
});

entries.forEach(function (entry) {
  assert.ok(APPROVED_PLANNING_BUCKET_KEYS.includes(entry.planningBucketKey), `${entry.typeKey} should have an approved planningBucketKey`);
  assert.ok(entry.planningBucketLabel, `${entry.typeKey} should have planningBucketLabel`);
  assert.equal(typeof entry.lifestyleTreatmentIncluded, "boolean", `${entry.typeKey} should have boolean lifestyleTreatmentIncluded`);
  assert.ok(APPROVED_LIFESTYLE_TREATMENT_REASONS.includes(entry.lifestyleTreatmentReason), `${entry.typeKey} should have an approved lifestyleTreatmentReason`);
  assert.notEqual(entry.lifestyleTreatmentReason, "reviewOnly", `${entry.typeKey} should not preserve reviewOnly as planning treatment`);
  assert.ok(APPROVED_INFLATION_BUCKET_KEYS.includes(entry.inflationBucketKey), `${entry.typeKey} should have an approved inflationBucketKey`);
  assert.equal(
    entry.inflationBucketKey,
    EXPECTED_ENTRY_INFLATION_OVERRIDES[entry.typeKey] || EXPECTED_BUCKET_INFLATION[entry.planningBucketKey],
    `${entry.typeKey} inflationBucketKey should match its approved bucket default or row-level exception`
  );
});

const headContext = createLibraryContext(readHeadExpenseLibrarySource());
const headEntries = headContext.LensApp.lensAnalysis.expenseLibrary.getExpenseLibraryEntries();
const headCategoryByType = mapEntriesByType(headEntries, function (entry) {
  return entry.categoryKey;
});
const currentCategoryByType = mapEntriesByType(entries, function (entry) {
  return entry.categoryKey;
});
assert.deepEqual(currentCategoryByType, headCategoryByType, "expense library categoryKey values should not change in this metadata-only pass");

const rules = lifestylePolicy.listLifestyleRangePolicies();
assert.equal(rules.length, 86, "lifestyle policy row count should remain unchanged");
assert.equal(
  rules.filter(function (rule) {
    return rule.sliderEligible === true;
  }).length,
  41,
  "admin-editable slider-eligible row count should remain unchanged"
);

assertEntriesWithCategory(entries, FINAL_EXPENSE_CATEGORY_KEYS, {
  planningBucketKey: "finalExpenses",
  lifestyleTreatmentIncluded: false,
  lifestyleTreatmentReason: "sourceOwnedFinalExpense",
  inflationBucketKey: "finalExpenseInflation"
});
entries
  .filter(function (entry) {
    return HEALTHCARE_CARE_CATEGORY_KEYS.includes(entry.categoryKey)
      && entry.typeKey !== "hsaContributions"
      && !HEALTHCARE_PREMIUM_TYPE_KEYS.includes(entry.typeKey);
  })
  .forEach(function (entry) {
    assertEntry(entry, {
      planningBucketKey: "healthcareCare",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedHealthcare",
      inflationBucketKey: "healthcareInflation"
    });
  });
entries
  .filter(function (entry) {
    return EDUCATION_CATEGORY_KEYS.includes(entry.categoryKey)
      && !EDUCATION_CATEGORY_METADATA_EXCEPTION_TYPE_KEYS.includes(entry.typeKey);
  })
  .forEach(function (entry) {
    assertEntry(entry, {
      planningBucketKey: "educationEnrichment",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedEducation",
      inflationBucketKey: "educationInflation"
    });
  });
assertEntriesWithCategory(entries, ["debtObligations"], {
  planningBucketKey: "debtObligations",
  lifestyleTreatmentIncluded: false,
  lifestyleTreatmentReason: "sourceOwnedDebt",
  inflationBucketKey: "noInflationCurrentDollar"
});
entries
  .filter(function (entry) {
    return entry.sourceOwnedBy === "debtRecords";
  })
  .forEach(function (entry) {
    assertEntry(entry, {
      planningBucketKey: "debtObligations",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedDebt",
      inflationBucketKey: "noInflationCurrentDollar"
    });
  });
entries
  .filter(function (entry) {
    return ["taxes", "legalAdministrative"].includes(entry.categoryKey)
      && !TAX_LEGAL_METADATA_EXCEPTION_TYPE_KEYS.includes(entry.typeKey);
  })
  .forEach(function (entry) {
    assertEntry(entry, {
      planningBucketKey: "taxesLegalAdministrative",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "legalTax",
      inflationBucketKey: "noInflationCurrentDollar"
    });
  });
assertEntriesWithCategory(entries, ["insurancePremiums"], {
  planningBucketKey: "insurancePremiums",
  lifestyleTreatmentIncluded: false,
  lifestyleTreatmentReason: "contractualObligation",
  inflationBucketKey: "householdExpenseInflation"
});
assertEntriesWithCategory(entries, ["savingsGoalContributions"], {
  planningBucketKey: "savingsGoalContributions",
  lifestyleTreatmentIncluded: true,
  lifestyleTreatmentReason: "pauseableGoalContribution",
  inflationBucketKey: "noInflationCurrentDollar"
});

[
  ["hsaContributions", {
    planningBucketKey: "savingsGoalContributions",
    planningBucketLabel: "Savings / Goal Contributions",
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "pauseableGoalContribution",
    inflationBucketKey: "noInflationCurrentDollar"
  }],
  ["annualPropertyTaxes", {
    planningBucketKey: "housingCore",
    planningBucketLabel: "Housing",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "protectedNeed",
    inflationBucketKey: "householdExpenseInflation"
  }],
  ["annualVehicleRegistration", {
    planningBucketKey: "vehicleOwnershipMaintenance",
    planningBucketLabel: "Vehicle Ownership / Maintenance",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "contractualObligation",
    inflationBucketKey: "householdExpenseInflation"
  }]
].forEach(function ([typeKey, expected]) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  assertEntry(entry, expected);
});

Object.entries(APPROVED_PRODUCT_DECISION_METADATA).forEach(function ([typeKey, expected]) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  assertEntry(entry, expected);
});

GIVING_VALUES_BASED_TYPE_KEYS.forEach(function (typeKey) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  assertEntry(entry, {
    planningBucketKey: "givingCommunity",
    planningBucketLabel: "Giving / Community",
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason: "valuesBased",
    inflationBucketKey: "householdExpenseInflation"
  });
});

[
  ["groceries", "foodAtHomeConsumables"],
  ["schoolLunches", "foodAtHomeConsumables"],
  ["groceryDeliveryFeesTips", "foodAtHomeConsumables"],
  ["specialtyDietAllergyFoodPremium", "foodAtHomeConsumables"],
  ["householdConsumablesSupplies", "householdConsumables"],
  ["householdSupplies", "householdConsumables"],
  ["diningTakeout", "diningTakeout"],
  ["householdServices", "householdServices"],
  ["houseCleaning", "householdServices"],
  ["dryCleaningLaundry", "householdServices"],
  ["homeSecurityMonitoring", "householdServices"],
  ["securitySystem", "householdServices"],
  ["internetPhone", "communicationsConnectivity"],
  ["streamingDigitalSubscriptions", "subscriptionsMemberships"],
  ["subscriptionsMemberships", "subscriptionsMemberships"],
  ["entertainmentRecreation", "entertainmentRecreation"],
  ["giftsHolidaysCelebrations", "entertainmentRecreation"],
  ["holidaySeasonalSpending", "entertainmentRecreation"],
  ["weddingsFamilyEvents", "entertainmentRecreation"],
  ["vacationsTravel", "travelVacations"],
  ["petBoarding", "petsDiscretionary"],
  ["petGroomingTraining", "petsDiscretionary"]
].forEach(function ([typeKey, planningBucketKey]) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  assertEntry(entry, {
    planningBucketKey,
    lifestyleTreatmentIncluded: true,
    lifestyleTreatmentReason: "lifestyleFlexible",
    inflationBucketKey: EXPECTED_BUCKET_INFLATION[planningBucketKey]
  });
});

[
  ["rentOrMortgagePayment", "housingCore", "protectedNeed"],
  ["householdUtilities", "basicUtilities", "protectedNeed"],
  ["vehicleMaintenance", "vehicleOwnershipMaintenance", "contractualObligation"],
  ["childcareExpense", "childcareDependentSupport", "protectedNeed"],
  ["petFoodSupplies", "petsCoreCare", "protectedNeed"],
  ["charitableGiving", "givingCommunity", "valuesBased"],
  ["officeRentCoworking", "businessSelfEmployment", "businessOrIncomePreserving"],
  ["bankFees", "financialFeesTransactionCosts", "unknownExcluded"],
  ["customExpenseRecord", "customUnknown", "unknownExcluded"]
].forEach(function ([typeKey, planningBucketKey, lifestyleTreatmentReason]) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  assertEntry(entry, {
    planningBucketKey,
    lifestyleTreatmentIncluded: false,
    lifestyleTreatmentReason,
    inflationBucketKey: EXPECTED_BUCKET_INFLATION[planningBucketKey]
  });
});

[
  ["specialtyDietAllergyFoodPremium", "foodAtHomeConsumables", "lifestyleFlexible"],
  ["schoolMeals", "foodAtHomeConsumables", "lifestyleFlexible"],
  ["earlyEducationChildcare", "educationEnrichment", "sourceOwnedEducation"],
  ["childActivitiesSports", "entertainmentRecreation", "lifestyleFlexible"],
  ["extracurricularLessonsActivities", "entertainmentRecreation", "lifestyleFlexible"],
  ["youthSportsTravelSports", "entertainmentRecreation", "lifestyleFlexible"],
  ["activityFieldTripFees", "entertainmentRecreation", "lifestyleFlexible"],
  ["musicSportsClubEnrichment", "entertainmentRecreation", "lifestyleFlexible"],
  ["personalHygieneProducts", "personalLivingClothing", "lifestyleFlexible"],
  ["diapersBabySupplies", "childcareDependentSupport", "protectedNeed"],
  ["formulaInfantSupplies", "childcareDependentSupport", "protectedNeed"],
  ["dryCleaningLaundry", "householdServices", "lifestyleFlexible"],
  ["petFoodSupplies", "petsCoreCare", "protectedNeed"],
  ["financialPlanningFees", "financialFeesTransactionCosts", "unknownExcluded"],
  ["investmentAdvisoryFees", "financialFeesTransactionCosts", "unknownExcluded"],
  ["clientEntertainment", "businessSelfEmployment", "businessOrIncomePreserving"],
  ["timeshareVacationClubFees", "travelVacations", "contractualObligation"]
].forEach(function ([typeKey, planningBucketKey, lifestyleTreatmentReason]) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist`);
  assertEntry(entry, {
    planningBucketKey,
    lifestyleTreatmentIncluded: lifestyleTreatmentReason === "lifestyleFlexible",
    lifestyleTreatmentReason,
    inflationBucketKey: EXPECTED_BUCKET_INFLATION[planningBucketKey]
  });
});

assertNonConsumingInflationMetadata();
assertRepeatableExpenseRecordsRemainUnwired();

console.log("household-expense-planning-bucket-metadata-check passed");
