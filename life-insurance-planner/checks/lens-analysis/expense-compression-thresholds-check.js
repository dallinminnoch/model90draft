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

const taxonomySource = loadScript("app/features/lens-analysis/expense-taxonomy.js");
const librarySource = loadScript("app/features/lens-analysis/expense-library.js");
const thresholdSource = loadScript("app/features/lens-analysis/expense-compression-thresholds.js");

const taxonomy = context.LensApp.lensAnalysis.expenseTaxonomy;
const library = context.LensApp.lensAnalysis.expenseLibrary;
const thresholdLibrary = context.LensApp.lensAnalysis.expenseCompressionThresholds;

assert.ok(taxonomy, "expense taxonomy should load");
assert.ok(library, "expense library should load");
assert.ok(thresholdLibrary, "expense compression threshold library should load");

function assertNoProtectedDiffs() {
  const protectedFiles = [
    "pages/next-step.html",
    "pages/confidential-inputs.html",
    "pages/manual-protection-modeling-inputs.html",
    "pages/analysis-setup.html",
    "pages/analysis-estimate.html",
    "pages/income-loss-impact.html",
    "components.css",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/income-impact-triage-intervention-calculations.js",
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "app/features/lens-analysis/household-survivor-runway-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "runtime, page, CSS, formula, adapter, model-builder, and normalization files should not have diffs");
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function byType(typeKey) {
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.ok(entry, `${typeKey} should exist in the expense library`);
  return entry;
}

function thresholdByType(typeKey) {
  const rule = thresholdLibrary.getExpenseCompressionThresholdRuleByType(typeKey);
  assert.ok(rule, `${typeKey} should have a threshold rule`);
  return rule;
}

function assertRule(typeKey, expected) {
  const rule = thresholdByType(typeKey);
  Object.entries(expected).forEach(([key, value]) => {
    assert.deepEqual(rule[key], value, `${typeKey}.${key} should be ${JSON.stringify(value)}`);
  });
  return rule;
}

function assertTiersOrdered(rule) {
  const tiers = rule.tiers;
  assert.ok(tiers.minimum <= tiers.conservative, `${rule.thresholdId} minimum should be <= conservative`);
  assert.ok(tiers.conservative <= tiers.average, `${rule.thresholdId} conservative should be <= average`);
  assert.ok(tiers.average <= tiers.comfortable, `${rule.thresholdId} average should be <= comfortable`);
}

function assertSourceDoesNotContain(source, pattern, message) {
  assert.equal(pattern.test(source), false, message);
}

assert.equal(typeof thresholdLibrary.getExpenseCompressionThresholdRules, "function", "threshold rules accessor should exist");
assert.equal(typeof thresholdLibrary.getExpenseCompressionThresholdRule, "function", "threshold by id accessor should exist");
assert.equal(typeof thresholdLibrary.getExpenseCompressionThresholdRuleByType, "function", "threshold by type accessor should exist");

[
  "perHouseholdMemberMonthly",
  "perHouseholdMonthly",
  "perDependentMonthly",
  "percentOfIncome",
  "fixedMonthly",
  "advisorDefined",
  "notThresholdBased"
].forEach((basis) => {
  assert.ok(thresholdLibrary.EXPENSE_THRESHOLD_BASIS_VALUES.includes(basis), `${basis} basis should be exported`);
});

[
  "protectedEssential",
  "flexibleEssential",
  "discretionary",
  "pauseCandidate",
  "advisorConfirmed",
  "generatedDebt",
  "customReview",
  "notThresholdBased"
].forEach((behaviorClass) => {
  assert.ok(thresholdLibrary.EXPENSE_THRESHOLD_BEHAVIOR_CLASS_VALUES.includes(behaviorClass), `${behaviorClass} behavior class should be exported`);
});

assert.ok(thresholdLibrary.EXPENSE_THRESHOLD_UNIT_VALUES.includes("usdMonthly"), "usdMonthly unit should be exported");

const rules = thresholdLibrary.getExpenseCompressionThresholdRules();
assert.equal(rules.length, 32, "V1 should include default household threshold rules plus the approved broad parent rows");
assert.ok(uniqueValues(rules.map((rule) => rule.thresholdId)), "threshold ids should be unique");
assert.ok(uniqueValues(rules.map((rule) => rule.expenseTypeKey)), "each V1 rule should target one unique expense type");

const categoriesByKey = new Map(taxonomy.getExpenseCategories().map((category) => [category.categoryKey, category]));

rules.forEach((rule) => {
  assert.ok(rule.thresholdId, "threshold rule should have thresholdId");
  assert.ok(rule.expenseTypeKey, `${rule.thresholdId} should have expenseTypeKey`);
  assert.ok(rule.categoryKey, `${rule.thresholdId} should have categoryKey`);
  assert.ok(categoriesByKey.has(rule.categoryKey), `${rule.thresholdId} category should exist`);
  const entry = byType(rule.expenseTypeKey);
  assert.equal(entry.categoryKey, rule.categoryKey, `${rule.thresholdId} should match expense library category`);
  assert.ok(thresholdLibrary.EXPENSE_THRESHOLD_BASIS_VALUES.includes(rule.thresholdBasis), `${rule.thresholdId} should use a valid basis`);
  assert.ok(thresholdLibrary.EXPENSE_THRESHOLD_BEHAVIOR_CLASS_VALUES.includes(rule.behaviorClass), `${rule.thresholdId} should use a valid behavior class`);
  assert.ok(thresholdLibrary.EXPENSE_THRESHOLD_UNIT_VALUES.includes(rule.unit), `${rule.thresholdId} should use a valid unit`);
  thresholdLibrary.EXPENSE_THRESHOLD_TIER_KEYS.forEach((tierKey) => {
    assert.equal(typeof rule.tiers[tierKey], "number", `${rule.thresholdId}.${tierKey} should be numeric`);
  });
  assertTiersOrdered(rule);
  assert.equal(typeof rule.canAutoReduce, "boolean", `${rule.thresholdId} should expose canAutoReduce`);
  assert.equal(typeof rule.requiresAdvisorConfirmation, "boolean", `${rule.thresholdId} should expose requiresAdvisorConfirmation`);
  assert.equal(typeof rule.canPause, "boolean", `${rule.thresholdId} should expose canPause`);
  assert.equal(typeof rule.canReduceToZero, "boolean", `${rule.thresholdId} should expose canReduceToZero`);
  assert.ok(rule.protectedFloor == null || typeof rule.protectedFloor === "number", `${rule.thresholdId} should expose protectedFloor as number or null`);
  assert.equal(typeof rule.advisorEditable, "boolean", `${rule.thresholdId} should expose advisorEditable`);
  assert.equal(rule.advisorEditable, true, `${rule.thresholdId} should be advisor-editable later`);
  assert.equal(rule.version, 1, `${rule.thresholdId} should use V1 defaults`);
  assert.ok(rule.notes == null || typeof rule.notes === "string", `${rule.thresholdId} should expose passive notes`);
  assert.equal(Object.prototype.hasOwnProperty.call(rule, "caseOverrideAllowed"), false, `${rule.thresholdId} should not expose caseOverrideAllowed`);
});

[
  "groceries",
  "householdConsumablesSupplies"
].forEach((typeKey) => {
  const rule = assertRule(typeKey, {
    behaviorClass: "protectedEssential",
    thresholdBasis: "perHouseholdMemberMonthly",
    canAutoReduce: true,
    canReduceToZero: false
  });
  assert.ok(rule.protectedFloor > 0, `${typeKey} should preserve a protected floor`);
});

assert.equal(JSON.stringify(thresholdByType("groceries").tiers), JSON.stringify({
  minimum: 150,
  conservative: 250,
  average: 350,
  comfortable: 450
}));

[
  "diningTakeout",
  "diningOutRestaurants",
  "takeoutConvenienceFood",
  "mealDeliveryServices",
  "alcoholSocialBeverages",
  "entertainmentRecreation",
  "streamingDigitalSubscriptions",
  "gymFitnessMemberships",
  "clubsSocialMemberships",
  "hobbiesRecreationGear",
  "eventsConcertsSportingEvents",
  "gamingInAppPurchases",
  "dateNightsFamilyOutings",
  "luxuryPurchases",
  "vacationsTravel",
  "weekendShortTrips",
  "lodging",
  "travelFoodEntertainment"
].forEach((typeKey) => {
  assertRule(typeKey, {
    behaviorClass: "discretionary",
    canAutoReduce: true,
    canReduceToZero: true
  });
});

assert.equal(thresholdByType("diningTakeout").thresholdBasis, "perHouseholdMemberMonthly", "diningTakeout should use per-member food-away-from-home thresholds");

[
  "fuel",
  "publicTransit",
  "internet",
  "mobilePhone",
  "electricity",
  "petFoodSupplies"
].forEach((typeKey) => {
  const rule = thresholdByType(typeKey);
  assert.equal(rule.canAutoReduce, false, `${typeKey} should not be auto-reduced in V1`);
  assert.ok(rule.protectedFloor > 0, `${typeKey} should preserve a protected floor`);
});

assertRule("rideshareTaxi", {
  behaviorClass: "flexibleEssential",
  canAutoReduce: true,
  canReduceToZero: false
});

assertRule("personalCare", {
  behaviorClass: "flexibleEssential",
  canAutoReduce: true,
  canReduceToZero: false
});

assertRule("householdServices", {
  behaviorClass: "flexibleEssential",
  thresholdBasis: "perHouseholdMonthly",
  canAutoReduce: true,
  canReduceToZero: false
});
assert.equal(thresholdByType("householdServices").categoryKey, "personalLiving", "householdServices threshold should align to the library taxonomy category");
assert.equal(thresholdLibrary.getExpenseCompressionThresholdRuleByType("educationEnrichment"), null, "educationEnrichment should not have an auto-reduction threshold");

assertRule("petGroomingTraining", {
  behaviorClass: "flexibleEssential",
  canAutoReduce: true,
  canReduceToZero: false
});

assertRule("bankFees", {
  behaviorClass: "flexibleEssential",
  thresholdBasis: "fixedMonthly",
  canAutoReduce: true,
  canReduceToZero: true
});

[
  "autoLoanPayment",
  "autoLeasePayment",
  "creditCardMinimumPayment",
  "studentLoanPayment",
  "personalLoanPayment",
  "taxDebtIrsPaymentPlan",
  "medicalDebtPayment",
  "businessDebtPayment",
  "otherDebtPayment"
].forEach((typeKey) => {
  const entry = byType(typeKey);
  assert.equal(entry.generatedOnly, true, `${typeKey} should remain generated-only`);
  assert.equal(entry.sourceOwnedBy, "debtRecords", `${typeKey} should remain source-owned by Debt Records`);
  assert.equal(entry.isAddable, false, `${typeKey} should not be manually addable`);
  assert.equal(thresholdLibrary.getExpenseCompressionThresholdRuleByType(typeKey), null, `${typeKey} should not have an auto-reduction threshold rule`);
});

[
  "healthInsurancePremiums",
  "medicalOutOfPocket",
  "collegeTuition",
  "tithingReligiousGiving",
  "remittancesFamilyAssistance",
  "federalStateLocalIncomeTaxPayments",
  "legalFeesCourtFees",
  "officeRentCoworking",
  "businessInsuranceProfessionalLiability"
].forEach((typeKey) => {
  const entry = byType(typeKey);
  assert.equal(entry.requiresAdvisorConfirmation, true, `${typeKey} should require advisor confirmation in expense metadata`);
  const thresholdRule = thresholdLibrary.getExpenseCompressionThresholdRuleByType(typeKey);
  assert.ok(!thresholdRule || thresholdRule.requiresAdvisorConfirmation === true, `${typeKey} should not get an unconfirmed auto-reduction threshold`);
});

[
  "retirementContributions",
  "educationSavingsContributions",
  "emergencyFundContributions",
  "sinkingFundContributions"
].forEach((typeKey) => {
  const entry = byType(typeKey);
  assert.equal(entry.defaultNeedType, "savingsContribution", `${typeKey} should remain a savings contribution`);
  assert.equal(entry.compressionTier, "pauseCandidate", `${typeKey} should remain a pause candidate`);
  assert.equal(thresholdLibrary.getExpenseCompressionThresholdRuleByType(typeKey), null, `${typeKey} should not have an ordinary reduction threshold`);
});

[
  "customExpenseRecord",
  "otherCustomExpense"
].forEach((typeKey) => {
  const entry = byType(typeKey);
  assert.equal(entry.defaultNeedType, "custom", `${typeKey} should remain custom/raw review metadata`);
  assert.equal(entry.compressionTier, "rawReview", `${typeKey} should require classification before compression`);
  assert.equal(thresholdLibrary.getExpenseCompressionThresholdRuleByType(typeKey), null, `${typeKey} should not have a default compression threshold`);
});

assertSourceDoesNotContain(thresholdSource, /caseOverrideAllowed/, "threshold defaults should not include caseOverrideAllowed");
assertSourceDoesNotContain(thresholdSource, /case[-_ ]level/i, "threshold defaults should not include case-level override behavior");
assertSourceDoesNotContain(thresholdSource, /merge/i, "threshold defaults should not include override merge helpers");
assertSourceDoesNotContain(thresholdSource, /triagePolicy|calculateIncomeImpact|expenseFacts|normalizeLensModel/, "threshold defaults should not wire runtime formula or normalization behavior");
assertSourceDoesNotContain(taxonomySource + librarySource, /expenseCompressionThresholds/, "taxonomy and expense library should not consume threshold defaults");

const clonedRule = thresholdByType("groceries");
clonedRule.tiers.minimum = 999;
assert.equal(thresholdByType("groceries").tiers.minimum, 150, "threshold accessors should return cloned rules");

assertNoProtectedDiffs();

console.log("Expense compression threshold defaults check passed.");
