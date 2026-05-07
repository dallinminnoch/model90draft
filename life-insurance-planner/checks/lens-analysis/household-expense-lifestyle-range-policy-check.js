#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const policyPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "household-expense-lifestyle-range-policy.js"
);
const policySource = fs.readFileSync(policyPath, "utf8");

const context = {
  LensApp: {
    lensAnalysis: {}
  },
  console
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(policySource, context, { filename: policyPath });

const policy = context.LensApp.lensAnalysis.householdExpenseLifestyleRangePolicy;
assert.ok(policy, "household expense lifestyle range policy should load");

[
  "HOUSEHOLD_EXPENSE_LIFESTYLE_RANGE_POLICY_VERSION",
  "LIFESTYLE_RANGE_BEHAVIORS",
  "SOURCE_POLICY_DECISIONS",
  "TIER_KEYS",
  "householdExpenseLifestyleRangePolicyRules",
  "listLifestyleRangePolicies",
  "resolveLifestyleRangePolicy"
].forEach(function (key) {
  assert.ok(Object.prototype.hasOwnProperty.call(policy, key), `${key} export should exist`);
});

assert.equal(policy.HOUSEHOLD_EXPENSE_LIFESTYLE_RANGE_POLICY_VERSION, 1, "policy version should be V1");
assert.equal(typeof policy.listLifestyleRangePolicies, "function", "list accessor should be exported");
assert.equal(typeof policy.resolveLifestyleRangePolicy, "function", "resolver should be exported");

const behaviors = new Set(Object.values(policy.LIFESTYLE_RANGE_BEHAVIORS));
const sourceDecisions = new Set(Object.values(policy.SOURCE_POLICY_DECISIONS));
const tierKeys = new Set(Object.values(policy.TIER_KEYS));
const rules = policy.listLifestyleRangePolicies();
const fixed = policy.LIFESTYLE_RANGE_BEHAVIORS.FIXED;
const reviewOnly = policy.LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY;

function byType(expenseTypeKey) {
  const rule = policy.resolveLifestyleRangePolicy({ expenseTypeKey });
  assert.ok(rule, `${expenseTypeKey} policy should resolve`);
  return rule;
}

function assertEligibleRange(expenseTypeKey, expected) {
  const rule = byType(expenseTypeKey);
  assert.equal(rule.sliderEligible, true, `${expenseTypeKey} should be slider eligible`);
  assert.ok(rule.conservativeFloorRatio <= expected.maxFloorRatio, `${expenseTypeKey} should have conservative floor ratio`);
  assert.ok(rule.elevatedCeilingRatio >= expected.minCeilingRatio, `${expenseTypeKey} should have elevated ceiling ratio`);
  assert.equal(rule.allowBelowBaseline, true, `${expenseTypeKey} should allow below-baseline movement`);
  assert.equal(rule.allowAboveBaseline, true, `${expenseTypeKey} should allow above-baseline movement`);
  return rule;
}

function assertNotEligible(expenseTypeKey, expectedBehavior) {
  const rule = byType(expenseTypeKey);
  assert.equal(rule.sliderEligible, false, `${expenseTypeKey} should not be slider eligible`);
  assert.equal(rule.allowBelowBaseline, false, `${expenseTypeKey} should not move below baseline`);
  assert.equal(rule.allowAboveBaseline, false, `${expenseTypeKey} should not move above baseline`);
  if (expectedBehavior) {
    assert.equal(rule.rangeBehavior, expectedBehavior, `${expenseTypeKey} should be ${expectedBehavior}`);
  }
  return rule;
}

assert.ok(rules.length >= 70, "policy should cover core lifestyle/fixed/review categories");
assert.equal(new Set(rules.map((rule) => rule.rangePolicyId)).size, rules.length, "policy ids should be unique");
assert.equal(new Set(rules.map((rule) => rule.expenseTypeKey)).size, rules.length, "expense type keys should be unique");

rules.forEach(function (rule) {
  assert.ok(rule.rangePolicyId, "rangePolicyId should exist");
  assert.ok(rule.expenseTypeKey, `${rule.rangePolicyId} should have expenseTypeKey`);
  assert.ok(rule.categoryKey, `${rule.rangePolicyId} should have categoryKey`);
  assert.ok(rule.displayName, `${rule.rangePolicyId} should have displayName`);
  assert.equal(typeof rule.sliderEligible, "boolean", `${rule.rangePolicyId} sliderEligible should be boolean`);
  assert.ok(behaviors.has(rule.rangeBehavior), `${rule.rangePolicyId} should use a valid rangeBehavior`);
  assert.ok(tierKeys.has(rule.floorTierKey), `${rule.rangePolicyId} should use a valid floorTierKey`);
  assert.ok(tierKeys.has(rule.ceilingTierKey), `${rule.rangePolicyId} should use a valid ceilingTierKey`);
  assert.ok(rule.protectedFloorPolicy, `${rule.rangePolicyId} should have protectedFloorPolicy`);
  assert.equal(typeof rule.allowBelowBaseline, "boolean", `${rule.rangePolicyId} allowBelowBaseline should be boolean`);
  assert.equal(typeof rule.allowAboveBaseline, "boolean", `${rule.rangePolicyId} allowAboveBaseline should be boolean`);
  assert.equal(typeof rule.requiresAdvisorReview, "boolean", `${rule.rangePolicyId} requiresAdvisorReview should be boolean`);
  assert.ok(sourceDecisions.has(rule.sourcePolicyDecision), `${rule.rangePolicyId} should use a valid sourcePolicyDecision`);
  assert.equal(rule.version, 1, `${rule.rangePolicyId} should carry version`);

  if (rule.sliderEligible) {
    assert.equal(typeof rule.conservativeFloorRatio, "number", `${rule.rangePolicyId} should have numeric conservativeFloorRatio`);
    assert.equal(typeof rule.elevatedCeilingRatio, "number", `${rule.rangePolicyId} should have numeric elevatedCeilingRatio`);
    assert.ok(rule.conservativeFloorRatio >= 0, `${rule.rangePolicyId} floor ratio should be nonnegative`);
    assert.ok(rule.conservativeFloorRatio <= 1, `${rule.rangePolicyId} floor ratio should be <= 1`);
    assert.ok(rule.elevatedCeilingRatio >= 1, `${rule.rangePolicyId} ceiling ratio should be >= 1`);
    assert.notEqual(rule.rangeBehavior, fixed, `${rule.rangePolicyId} eligible rule should not be fixed`);
    assert.notEqual(rule.rangeBehavior, reviewOnly, `${rule.rangePolicyId} eligible rule should not be reviewOnly`);
    assert.equal(rule.allowBelowBaseline, true, `${rule.rangePolicyId} eligible rule should allow conservative movement`);
    if (rule.allowAboveBaseline) {
      assert.ok(rule.elevatedCeilingRatio >= 1, `${rule.rangePolicyId} above-baseline rule should have ceiling >= 1`);
    }
  } else {
    assert.ok(
      rule.rangeBehavior === fixed || rule.rangeBehavior === reviewOnly,
      `${rule.rangePolicyId} non-eligible rule should be fixed or reviewOnly`
    );
    assert.equal(rule.allowBelowBaseline, false, `${rule.rangePolicyId} non-eligible rule should not move below baseline`);
    assert.equal(rule.allowAboveBaseline, false, `${rule.rangePolicyId} non-eligible rule should not move above baseline`);
  }
});

const mortgage = assertNotEligible("rentOrMortgagePayment", fixed);
assert.equal(mortgage.sourcePolicyDecision, "INTERVENTION", "mortgage/rent should remain intervention-owned");

const groceries = assertEligibleRange("groceries", { maxFloorRatio: 0.8, minCeilingRatio: 1.1 });
assert.equal(groceries.protectedFloorPolicy, "useThresholdProtectedFloor", "groceries should use protected floor");
assert.equal(groceries.rangeBehavior, "compressible", "groceries should be compressible");

const householdConsumables = assertEligibleRange("householdConsumablesSupplies", { maxFloorRatio: 0.75, minCeilingRatio: 1.1 });
assert.equal(householdConsumables.protectedFloorPolicy, "useThresholdProtectedFloor", "household consumables should preserve protected floor");

[
  "diningOutRestaurants",
  "takeoutConvenienceFood",
  "mealDeliveryServices",
  "streamingDigitalSubscriptions",
  "subscriptionsMemberships",
  "vacationsTravel",
  "weekendShortTrips",
  "travelTransportation",
  "lodging",
  "travelFoodEntertainment"
].forEach(function (typeKey) {
  const rule = assertEligibleRange(typeKey, { maxFloorRatio: 0.25, minCeilingRatio: 1.35 });
  assert.equal(rule.rangeBehavior, "expandable", `${typeKey} should be an expandable lifestyle range`);
});

[
  "internet",
  "mobilePhone"
].forEach(function (typeKey) {
  const rule = assertEligibleRange(typeKey, { maxFloorRatio: 0.8, minCeilingRatio: 1.15 });
  assert.equal(rule.rangeBehavior, "compressible", `${typeKey} should have narrow plan-level movement`);
});

[
  "electricity",
  "gasHeatingFuelPropaneOil",
  "waterSewer",
  "trashRecycling"
].forEach(function (typeKey) {
  assertNotEligible(typeKey, reviewOnly);
});

[
  "daycareChildcare",
  "nannyInHomeChildcare",
  "afterSchoolCare",
  "privateSchoolTuition",
  "collegeTuition",
  "specialEducationServices"
].forEach(function (typeKey) {
  const rule = assertNotEligible(typeKey, reviewOnly);
  assert.equal(rule.requiresAdvisorReview, true, `${typeKey} should require review`);
});

[
  "autoLoanPayment",
  "autoLeasePayment",
  "creditCardMinimumPayment",
  "studentLoanPayment",
  "personalLoanPayment",
  "medicalDebtPayment",
  "businessDebtPayment",
  "otherDebtPayment"
].forEach(function (typeKey) {
  assertNotEligible(typeKey, fixed);
});

[
  "charitableGiving",
  "tithingReligiousGiving",
  "remittancesFamilyAssistance",
  "weddingsFamilyEvents"
].forEach(function (typeKey) {
  const rule = assertNotEligible(typeKey, reviewOnly);
  assert.equal(rule.requiresAdvisorReview, true, `${typeKey} should be values-sensitive review-only`);
});

[
  "federalStateLocalIncomeTaxPayments",
  "quarterlyEstimatedTaxes",
  "selfEmploymentTax",
  "taxPreparationFees",
  "taxDebtIrsPaymentPlan"
].forEach(function (typeKey) {
  assertNotEligible(typeKey, fixed);
});

[
  "healthInsurancePremiums",
  "lifeInsurancePremiums",
  "termLifePremiums",
  "permanentLifePremiums",
  "disabilityInsurancePremiums",
  "longTermCareInsurance",
  "copaysCoinsurance",
  "prescriptionsMedicalSupplies",
  "mentalHealthCare",
  "dentalVisionOrthodontics"
].forEach(function (typeKey) {
  const rule = assertNotEligible(typeKey, reviewOnly);
  assert.equal(rule.requiresAdvisorReview, true, `${typeKey} should be health/protection review-only`);
});

const petFood = assertEligibleRange("petFoodSupplies", { maxFloorRatio: 0.85, minCeilingRatio: 1.1 });
assert.equal(petFood.rangeBehavior, "compressible", "core pet supplies should be narrow compressible");
assertEligibleRange("petGroomingTraining", { maxFloorRatio: 0, minCeilingRatio: 1.25 });
assertNotEligible("veterinaryCare", reviewOnly);
assertNotEligible("petMedication", reviewOnly);

[
  "houseCleaning",
  "lawnSnowPestPoolServices",
  "dryCleaningLaundry",
  "personalCare"
].forEach(function (typeKey) {
  assert.equal(byType(typeKey).sliderEligible, true, `${typeKey} should be eligible household/service lifestyle spend`);
});

[
  "homeRepairReserveContributions",
  "educationSavingsContributions",
  "retirementContributions",
  "emergencyFundContributions",
  "brokerageInvestmentContributions",
  "vacationLifestyleGoalContributions",
  "vehicleReplacementContributions",
  "sinkingFundContributions",
  "otherGoalSavings"
].forEach(function (typeKey) {
  const rule = byType(typeKey);
  assert.equal(rule.sliderEligible, true, `${typeKey} should be slider eligible as pauseable`);
  assert.equal(rule.rangeBehavior, "pauseable", `${typeKey} should be pauseable`);
  assert.equal(rule.conservativeFloorRatio, 0, `${typeKey} may approach zero at full conservative`);
  assert.equal(rule.allowAboveBaseline, false, `${typeKey} should not increase contributions by lifestyle slider V1`);
});

const input = {
  expenseTypeKey: "groceries",
  categoryKey: "foodGroceries",
  nested: {
    value: 1
  }
};
const before = JSON.stringify(input);
const resolved = policy.resolveLifestyleRangePolicy(input);
assert.equal(JSON.stringify(input), before, "resolver should not mutate input");
resolved.displayName = "Broken";
assert.equal(policy.resolveLifestyleRangePolicy({ expenseTypeKey: "groceries" }).displayName, "Groceries", "resolver should return a clone");

assert.equal(
  policy.resolveLifestyleRangePolicy({ typeKey: "diningOutRestaurants" }).expenseTypeKey,
  "diningOutRestaurants",
  "resolver should also match typeKey"
);
assert.equal(
  policy.resolveLifestyleRangePolicy({ categoryKey: "taxes" }).rangeBehavior,
  fixed,
  "resolver should match categoryKey when type is absent"
);
assert.equal(policy.resolveLifestyleRangePolicy({ expenseTypeKey: "unknownType" }), null, "unknown type should return null");

[
  /income-impact-timeline-graph-model/,
  /income-loss-impact-display/,
  /income-impact-triage-intervention-calculations/,
  /normalize-lens-model/,
  /household-survivor-runway-calculations/,
  /formula/i,
  /\brequire\s*\(/,
  /\bimport\b/,
  /\blocalStorage\b|\bsessionStorage\b|\bdocument\b|\bquerySelector\b|\baddEventListener\b|\bfetch\b/
].forEach(function (pattern) {
  assert.equal(pattern.test(policySource), false, `policy source should not include ${pattern}`);
});

console.log("household-expense-lifestyle-range-policy-check passed");
