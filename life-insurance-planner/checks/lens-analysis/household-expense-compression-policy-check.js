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

loadScript("app/features/lens-analysis/expense-taxonomy.js");
loadScript("app/features/lens-analysis/expense-library.js");
const policySource = loadScript("app/features/lens-analysis/household-expense-compression-policy.js");

const library = context.LensApp.lensAnalysis.expenseLibrary;
const policy = context.LensApp.lensAnalysis.householdExpenseCompressionPolicy;

assert.ok(library, "expense library should load");
assert.ok(policy, "household expense compression policy should load");

const requiredExports = [
  "HOUSEHOLD_EXPENSE_COMPRESSION_POLICY_VERSION",
  "EXPENSE_COMPRESSION_DECISIONS",
  "EXPENSE_COMPRESSION_ORDER_GROUPS",
  "householdExpenseCompressionPolicyRules",
  "getHouseholdExpenseCompressionPolicyRules",
  "getHouseholdExpenseCompressionPolicyByExpenseType",
  "getHouseholdExpenseCompressionPoliciesByDecision"
];
requiredExports.forEach((key) => {
  assert.ok(Object.prototype.hasOwnProperty.call(policy, key), `${key} export should exist`);
});

assert.equal(policy.HOUSEHOLD_EXPENSE_COMPRESSION_POLICY_VERSION, 1, "policy version should be V1");
assert.equal(typeof policy.getHouseholdExpenseCompressionPolicyRules, "function");
assert.equal(typeof policy.getHouseholdExpenseCompressionPolicyByExpenseType, "function");
assert.equal(typeof policy.getHouseholdExpenseCompressionPoliciesByDecision, "function");

const decisions = policy.EXPENSE_COMPRESSION_DECISIONS;
const validDecisions = new Set(Object.values(decisions));
const groups = policy.EXPENSE_COMPRESSION_ORDER_GROUPS;
const rules = policy.getHouseholdExpenseCompressionPolicyRules();
const internalRules = policy.householdExpenseCompressionPolicyRules;
const allowedSyntheticTypes = new Set([
  "vehicleSaleCandidate",
  "housingDecisionWindow",
  "educationGoalReduction",
  "survivorReturnToWork",
  "debtRestructuringDefaultRisk",
  "financialCrisisProtectedEssentialsUnfunded"
]);

function byType(typeKey) {
  const rule = policy.getHouseholdExpenseCompressionPolicyByExpenseType(typeKey);
  assert.ok(rule, `${typeKey} policy should exist`);
  return rule;
}

function byDecision(decision) {
  return policy.getHouseholdExpenseCompressionPoliciesByDecision(decision);
}

function rank(typeKey) {
  return byType(typeKey).compressionOrderRank;
}

function assertDecision(typeKey, decision) {
  assert.equal(byType(typeKey).decision, decision, `${typeKey} should be ${decision}`);
}

function assertNoSourceMatch(pattern, message) {
  assert.equal(pattern.test(policySource), false, message);
}

assert.ok(rules.length > 90, "policy should include the requested deterministic expense/intervention rows");
assert.equal(new Set(rules.map((rule) => rule.policyId)).size, rules.length, "policy ids should be unique");
assert.equal(new Set(rules.map((rule) => rule.expenseTypeKey)).size, rules.length, "expense type keys should be unique");

[
  "dataQuality",
  "earlyDiscretionary",
  "travelLifestyle",
  "foodLifestyleBeforeGroceries",
  "pauseContributions",
  "flexibleLifestyleServices",
  "flexibleEssentials",
  "groceriesAndProtectedFlexibleEssentials",
  "transportationFlex",
  "utilitiesBasicServices",
  "pets",
  "financialLeakage",
  "healthcareProtected",
  "childcareAndDependentSupport",
  "education",
  "valuesSensitiveGiving",
  "protectionInsurance",
  "taxesAndLegal",
  "debtObligations",
  "businessIncomePreserving",
  "housingProtected",
  "majorInterventions"
].forEach((groupKey, expectedRank) => {
  assert.ok(groups[groupKey], `${groupKey} order group should exist`);
  assert.equal(groups[groupKey].rank, expectedRank, `${groupKey} should keep deterministic rank ${expectedRank}`);
});

rules.forEach((rule) => {
  assert.ok(rule.policyId, `${rule.expenseTypeKey} should have policyId`);
  assert.ok(rule.expenseTypeKey, `${rule.policyId} should have expenseTypeKey`);
  assert.ok(rule.displayName, `${rule.policyId} should have displayName`);
  assert.ok(rule.behaviorClass, `${rule.policyId} should have behaviorClass`);
  assert.ok(validDecisions.has(rule.decision), `${rule.policyId} should use deterministic decision`);
  assert.notEqual(rule.decision, "MAYBE", `${rule.policyId} should not have MAYBE decision`);
  assert.notEqual(rule.decision, "ADVISOR_CONFIRMED", `${rule.policyId} should not have advisor-confirm decision`);
  assert.ok(groups[rule.compressionOrderGroup], `${rule.policyId} should use a known order group`);
  assert.equal(rule.compressionOrderRank, groups[rule.compressionOrderGroup].rank, `${rule.policyId} rank should match order group`);
  assert.ok(rule.compressionAction, `${rule.policyId} should have compressionAction`);
  assert.ok(rule.maxStepPerPass, `${rule.policyId} should have maxStepPerPass`);
  assert.equal(typeof rule.canAutoReduce, "boolean", `${rule.policyId} canAutoReduce should be boolean`);
  assert.equal(typeof rule.requiresAdvisorConfirmation, "boolean", `${rule.policyId} requiresAdvisorConfirmation should be boolean`);
  assert.equal(typeof rule.canPause, "boolean", `${rule.policyId} canPause should be boolean`);
  assert.equal(typeof rule.canReduceToZero, "boolean", `${rule.policyId} canReduceToZero should be boolean`);
  assert.ok(rule.protectedFloorPolicy, `${rule.policyId} should have protectedFloorPolicy`);
  assert.ok(rule.projectionEffect, `${rule.policyId} should have projectionEffect`);
  assert.ok(rule.timelineTreatment, `${rule.policyId} should have timelineTreatment`);

  if (!allowedSyntheticTypes.has(rule.expenseTypeKey)) {
    assert.ok(
      library.getExpenseLibraryEntry(rule.expenseTypeKey),
      `${rule.expenseTypeKey} should refer to an expense library entry or known future intervention key`
    );
  }

  if (rule.decision === decisions.YES) {
    assert.equal(rule.canAutoReduce, true, `${rule.expenseTypeKey} YES should auto-reduce`);
    assert.notEqual(rule.projectionEffect, "alternateScenario", `${rule.expenseTypeKey} YES should not be an alternate scenario`);
  }
  if (rule.decision === decisions.NO) {
    assert.equal(rule.canAutoReduce, false, `${rule.expenseTypeKey} NO should not auto-reduce`);
    assert.equal(rule.canPause, false, `${rule.expenseTypeKey} NO should not pause`);
  }
  if (rule.decision === decisions.PAUSE) {
    assert.equal(rule.canPause, true, `${rule.expenseTypeKey} PAUSE should pause`);
    assert.equal(rule.canAutoReduce, false, `${rule.expenseTypeKey} PAUSE should not auto-reduce`);
    assert.equal(rule.projectionEffect, "pauseContribution", `${rule.expenseTypeKey} PAUSE should use pauseContribution`);
  }
  if (rule.decision === decisions.INTERVENTION) {
    assert.equal(rule.canAutoReduce, false, `${rule.expenseTypeKey} INTERVENTION should not auto-reduce`);
    assert.ok(
      rule.projectionEffect === "alternateScenario" || rule.projectionEffect === "crisisMarker",
      `${rule.expenseTypeKey} INTERVENTION should be alternateScenario or crisisMarker`
    );
  }
});

[
  "diningTakeout",
  "diningOutRestaurants",
  "takeoutConvenienceFood",
  "mealDeliveryServices",
  "vacationsTravel",
  "weekendShortTrips",
  "entertainmentRecreation",
  "streamingDigitalSubscriptions",
  "luxuryPurchases"
].forEach((typeKey) => {
  assert.ok(rank(typeKey) < rank("groceries"), `${typeKey} should come before groceries`);
});

assertDecision("diningTakeout", decisions.YES);
assert.equal(byType("diningTakeout").compressionOrderGroup, "foodLifestyleBeforeGroceries", "diningTakeout should use the food-away-from-home group");
assert.equal(byType("diningTakeout").canReduceToZero, true, "diningTakeout should be reducible to zero like detailed food-away-from-home rows");

assertDecision("householdServices", decisions.YES);
assert.equal(byType("householdServices").compressionOrderGroup, "flexibleLifestyleServices", "householdServices should use the household service group");
assert.equal(byType("householdServices").canReduceToZero, false, "householdServices should preserve the default nonzero service review posture");

assertDecision("educationEnrichment", decisions.NO);
assert.equal(byType("educationEnrichment").compressionOrderGroup, "education", "educationEnrichment should be protected education behavior");
assert.equal(byType("educationEnrichment").canAutoReduce, false, "educationEnrichment should not auto-compress");

const groceries = byType("groceries");
assert.equal(groceries.decision, decisions.YES, "groceries should be deterministic YES");
assert.equal(groceries.compressionOrderGroup, "groceriesAndProtectedFlexibleEssentials", "groceries should be late");
assert.equal(groceries.maxStepPerPass, "oneTier", "groceries should be one-tier step-down only");
assert.equal(groceries.protectedFloorPolicy, "useThresholdProtectedFloor", "groceries should preserve protected floor policy");

[
  "creditCardMinimumPayment",
  "autoLoanPayment",
  "autoLeasePayment",
  "studentLoanPayment",
  "personalLoanPayment",
  "taxDebtIrsPaymentPlan",
  "medicalDebtPayment",
  "businessDebtPayment",
  "otherDebtPayment"
].forEach((typeKey) => {
  assertDecision(typeKey, decisions.NO);
  assert.equal(byType(typeKey).compressionOrderGroup === "debtObligations" || byType(typeKey).compressionOrderGroup === "taxesAndLegal", true);
});

[
  "healthInsurancePremiums",
  "copaysCoinsurance",
  "prescriptionsMedicalSupplies",
  "chronicConditionSupplies",
  "mentalHealthCare",
  "dentalVisionOrthodontics",
  "medicalTravel"
].forEach((typeKey) => assertDecision(typeKey, decisions.NO));

[
  "federalStateLocalIncomeTaxPayments",
  "quarterlyEstimatedTaxes",
  "selfEmploymentTax",
  "taxPreparationFees",
  "legalFeesCourtFees"
].forEach((typeKey) => assertDecision(typeKey, decisions.NO));

[
  "retirementContributions",
  "emergencyFundContributions",
  "educationSavingsContributions",
  "brokerageInvestmentContributions",
  "vacationLifestyleGoalContributions",
  "vehicleReplacementContributions",
  "sinkingFundContributions",
  "homeRepairReserveContributions",
  "otherGoalSavings"
].forEach((typeKey) => assertDecision(typeKey, decisions.PAUSE));

assertDecision("rentOrMortgagePayment", decisions.INTERVENTION);
assert.equal(byType("rentOrMortgagePayment").projectionEffect, "alternateScenario", "housing payment should be alternate scenario");
assertDecision("educationGoalReduction", decisions.INTERVENTION);
assertDecision("financialCrisisProtectedEssentialsUnfunded", decisions.INTERVENTION);
assert.equal(byType("financialCrisisProtectedEssentialsUnfunded").projectionEffect, "crisisMarker", "financial crisis should be crisis marker");
assert.equal(byType("financialCrisisProtectedEssentialsUnfunded").timelineTreatment, "crisisState", "financial crisis should be crisis state");

const clonedRules = policy.getHouseholdExpenseCompressionPolicyRules();
clonedRules[0].decision = "BROKEN";
assert.notEqual(policy.getHouseholdExpenseCompressionPolicyRules()[0].decision, "BROKEN", "rules accessor should return clones");
const clonedDebtPolicy = policy.getHouseholdExpenseCompressionPolicyByExpenseType("autoLoanPayment");
clonedDebtPolicy.decision = "BROKEN";
assert.equal(byType("autoLoanPayment").decision, decisions.NO, "by-type accessor should return clone");
const clonedYesPolicies = byDecision(decisions.YES);
clonedYesPolicies[0].decision = "BROKEN";
assert.equal(byDecision(decisions.YES)[0].decision, decisions.YES, "by-decision accessor should return clones");
assert.equal(byDecision("UNKNOWN").length, 0, "unknown decision should return empty list");

assertNoSourceMatch(/\bwindow\b|\blocalStorage\b|\bsessionStorage\b|\bdocument\b|\bquerySelector\b|\baddEventListener\b/, "policy should not read storage or UI");
assertNoSourceMatch(/\brequire\s*\(|\bimport\b/, "policy should not import dependencies");
assertNoSourceMatch(/calculateIncomeImpact|triagePolicy|postDeathSeries|Layer 5|layer 5|normalizeLensModel|createLensModelFromBlockOutputs|analysisMethods|dime|hlv|needs-calculations|graph|analysis-estimate|step-three-analysis-display|render[A-Z]/i, "policy should not wire Layer 5, graph, display, formulas, or normalization");
assertNoSourceMatch(/caseOverrideAllowed|case-level threshold|caseLevel/, "policy should not add case-level override support");

assert.equal(internalRules[0].decision, policy.getHouseholdExpenseCompressionPolicyRules()[0].decision, "internal rules remain intact");

console.log("Household expense compression policy check passed.");
