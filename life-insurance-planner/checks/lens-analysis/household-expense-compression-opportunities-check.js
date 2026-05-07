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
loadScript("app/features/lens-analysis/expense-compression-thresholds.js");
loadScript("app/features/lens-analysis/household-expense-compression-policy.js");
loadScript("app/features/lens-analysis/household-expense-account-policy-resolver.js");
const classifierSource = loadScript("app/features/lens-analysis/household-expense-compression-calculations.js");

const library = context.LensApp.lensAnalysis.expenseLibrary;
const thresholds = context.LensApp.lensAnalysis.expenseCompressionThresholds;
const compressionPolicy = context.LensApp.lensAnalysis.householdExpenseCompressionPolicy;
const accountPolicyResolver = context.LensApp.lensAnalysis.householdExpenseAccountPolicyResolver;
const classifier = context.LensApp.lensAnalysis.householdExpenseCompressionCalculations;

assert.ok(library, "expense library should load");
assert.ok(thresholds, "expense threshold defaults should load");
assert.ok(compressionPolicy, "compression policy defaults should load");
assert.ok(accountPolicyResolver, "account policy resolver should load for resolved policy fixtures");
assert.ok(classifier, "household expense compression classifier should load");
assert.equal(
  typeof classifier.calculateHouseholdExpenseCompressionOpportunities,
  "function",
  "classifier export should exist"
);
assert.equal(
  typeof context.LensApp.lensAnalysis.calculateHouseholdExpenseCompressionOpportunities,
  "function",
  "top-level classifier export should exist"
);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function run(input) {
  return classifier.calculateHouseholdExpenseCompressionOpportunities(input);
}

function byType(items, typeKey) {
  return items.find((item) => item.typeKey === typeKey);
}

function hasDataGap(result, code) {
  return result.dataGaps.some((item) => item.code === code);
}

function assertSerializable(value) {
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(value)), "output should be JSON serializable");
}

function assertNoSourceMatch(pattern, message) {
  assert.equal(pattern.test(classifierSource), false, message);
}

const defaultRules = thresholds.getExpenseCompressionThresholdRules();
const defaultCompressionPolicyRules = compressionPolicy.getHouseholdExpenseCompressionPolicyRules();
const expenseFacts = {
  expenses: [
    {
      expenseFactId: "dining_fact",
      typeKey: "diningOutRestaurants",
      categoryKey: "foodGroceries",
      label: "Dining Out",
      amount: 500,
      frequency: "monthly",
      sourcePath: "test.dining"
    },
    {
      expenseFactId: "travel_fact",
      typeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      label: "Travel",
      amount: 700,
      frequency: "monthly",
      sourcePath: "test.travel"
    },
    {
      expenseFactId: "groceries_fact",
      typeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Groceries",
      amount: 1000,
      frequency: "monthly",
      sourcePath: "test.groceries"
    },
    {
      expenseFactId: "retirement_fact",
      typeKey: "retirementContributions",
      categoryKey: "savingsGoalContributions",
      label: "401k",
      amount: 400,
      frequency: "monthly",
      sourcePath: "test.retirement"
    },
    {
      expenseFactId: "health_fact",
      typeKey: "healthInsurancePremiums",
      categoryKey: "ongoingHealthcare",
      label: "Health Premium",
      amount: 800,
      frequency: "monthly",
      sourcePath: "test.health"
    },
    {
      expenseFactId: "tax_fact",
      typeKey: "federalStateLocalIncomeTaxPayments",
      categoryKey: "taxes",
      label: "Tax Payment",
      amount: 300,
      frequency: "monthly",
      sourcePath: "test.tax"
    },
    {
      expenseFactId: "education_fact",
      typeKey: "collegeTuition",
      categoryKey: "educationExpense",
      label: "College Tuition",
      amount: 12000,
      frequency: "annual",
      sourcePath: "test.education"
    },
    {
      expenseFactId: "giving_fact",
      typeKey: "tithingReligiousGiving",
      categoryKey: "givingCommunity",
      label: "Tithing",
      amount: 250,
      frequency: "monthly",
      sourcePath: "test.giving"
    },
    {
      expenseFactId: "business_fact",
      typeKey: "officeRentCoworking",
      categoryKey: "businessSelfEmployment",
      label: "Office Rent",
      amount: 600,
      frequency: "monthly",
      sourcePath: "test.business"
    },
    {
      expenseFactId: "legal_fact",
      typeKey: "legalFeesCourtFees",
      categoryKey: "legalAdministrative",
      label: "Legal Fees",
      amount: 900,
      frequency: "oneTime",
      oneTimeAmount: 900,
      sourcePath: "test.legal"
    },
    {
      expenseFactId: "custom_fact",
      typeKey: "customExpenseRecord",
      categoryKey: "customExpense",
      label: "Custom Expense",
      amount: 200,
      frequency: "monthly",
      sourcePath: "test.custom"
    },
    {
      expenseFactId: "one_time_fact",
      typeKey: "entertainmentRecreation",
      categoryKey: "discretionaryLifestyle",
      label: "One-Time Entertainment",
      amount: 1000,
      frequency: "oneTime",
      oneTimeAmount: 1000,
      sourcePath: "test.oneTime"
    },
    {
      expenseFactId: "other_frequency_fact",
      typeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      label: "Streaming Other",
      amount: 100,
      frequency: "other",
      sourcePath: "test.otherFrequency"
    },
    {
      expenseFactId: "generated_scalar_streaming_fact",
      typeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      label: "Streaming Scalar",
      amount: 450,
      frequency: "monthly",
      sourceKey: "subscriptionsCost",
      sourceOwnedBy: "ongoingSupport",
      sourcePath: "protectionModeling.data.subscriptionsCost",
      ownedByField: "monthlySubscriptionsCost",
      duplicateProtectionKey: "scalar-household-expense:subscriptionsCost",
      isGeneratedExpense: true,
      isScalarHouseholdExpense: true,
      isCompressionEligibleSource: true,
      isFormulaEligible: false
    },
    {
      expenseFactId: "generated_debt_fact",
      typeKey: "autoLoanPayment",
      categoryKey: "debtObligations",
      label: "Auto Loan Payment",
      amount: 425,
      frequency: "monthly",
      sourceKey: "debtRecords",
      sourcePath: "protectionModeling.data.debtRecords[0]",
      duplicateProtectionKey: "debt-payment:debt-auto:autoLoan:required-payment",
      isGeneratedExpense: true,
      isDebtPaymentExpense: true,
      isFormulaEligible: false
    }
  ]
};

function resolveAccountPolicy(accountPolicy, hardGuardrails) {
  return accountPolicyResolver.resolveHouseholdExpenseAccountPolicy({
    defaultLifestyleRangePolicies: [],
    defaultCompressionPolicyRules,
    defaultCompressionThresholdRules: defaultRules,
    accountPolicy,
    hardGuardrails: hardGuardrails || {
      minThresholdTierValue: 0,
      maxThresholdTierValue: 2000
    }
  });
}

const input = {
  expenseFacts,
  expenseLibrary: library,
  resolvedThresholds: { rules: defaultRules },
  householdFacts: {
    householdMemberCount: 2,
    dependentCount: 1,
    netAnnualIncome: 100000,
    survivorNetAnnualIncome: 60000,
    valuationDate: "2026-05-06",
    sourcePaths: {
      householdMemberCount: "test.householdMemberCount"
    }
  },
  options: {
    mode: "reportingOnly",
    includeAdvisorConfirmed: false,
    includeGeneratedDebtPayments: true,
    includePauseCandidates: true
  }
};

const beforeInputJson = JSON.stringify(input);
const firstResult = run(input);
const secondResult = run(input);

assert.equal(JSON.stringify(input), beforeInputJson, "classifier should not mutate serializable input data");
assert.deepEqual(firstResult, secondResult, "classifier output should be deterministic");
assertSerializable(firstResult);

assert.equal(firstResult.trace.calculationMethod, "household-expense-compression-opportunities-v1");
assert.equal(firstResult.trace.mode, "reportingOnly");
assert.equal(firstResult.trace.baseExpenseFactsMutated, false);
assert.equal(firstResult.trace.baseScenarioMutated, false);
assert.equal(firstResult.trace.resolvedThresholdSource, "explicit-input");
assert.equal(firstResult.trace.thresholdPolicySource, "fallbackPolicy", "legacy explicit resolvedThresholds should trace fallbackPolicy");
assert.equal(firstResult.trace.compressionPolicySource, "defaultSeedPolicy", "missing explicit compression policy should use seed policy source");
assert.equal(firstResult.trace.resolvedAccountPolicyUsed, false);
assert.equal(firstResult.trace.layer5Wired, false);
assert.ok(
  firstResult.warnings.some((warning) => warning.code === "generated-debt-payments-forced-excluded"),
  "generated debt option should be warning-backed and forced excluded"
);

assert.ok(byType(firstResult.excludedItems, "autoLoanPayment"), "generated debt-payment fact should be excluded");
assert.equal(
  byType(firstResult.excludedItems, "autoLoanPayment").reasonCode,
  "generated-debt-payment-source-owned",
  "generated debt exclusion should be source-owned"
);

assert.ok(byType(firstResult.opportunities, "diningOutRestaurants"), "dining out should create an opportunity");
assert.ok(byType(firstResult.opportunities, "vacationsTravel"), "travel should create an opportunity");
const scalarStreaming = firstResult.opportunities.find((item) => item.expenseFactId === "generated_scalar_streaming_fact");
assert.ok(scalarStreaming, "generated scalar household subscription fact should be compression-visible");
assert.equal(scalarStreaming.isGeneratedExpense, true);
assert.equal(scalarStreaming.isScalarHouseholdExpense, true);
assert.equal(scalarStreaming.sourceOwnedBy, "ongoingSupport");
assert.equal(scalarStreaming.duplicateProtectionKey, "scalar-household-expense:subscriptionsCost");
const groceries = byType(firstResult.opportunities, "groceries");
assert.ok(groceries, "protected groceries above threshold should create a safe opportunity");
assert.equal(groceries.thresholdMonthlyAmount, 900, "groceries threshold should use household member count");
assert.equal(groceries.protectedFloor, 300, "groceries protected floor should scale by household member count");
assert.equal(groceries.possibleMonthlyReduction, 100, "groceries should not reduce below the threshold/floor boundary");

const retirement = byType(firstResult.pauseCandidates, "retirementContributions");
assert.ok(retirement, "savings contribution should be a pause candidate");
assert.equal(retirement.possibleMonthlyPauseAmount, 400, "pause candidate should expose monthly pause amount");

[
  "healthInsurancePremiums",
  "federalStateLocalIncomeTaxPayments",
  "collegeTuition",
  "tithingReligiousGiving",
  "officeRentCoworking",
  "legalFeesCourtFees"
].forEach((typeKey) => {
  assert.ok(byType(firstResult.advisorReviewItems, typeKey), `${typeKey} should be advisor review only`);
});

assert.ok(byType(firstResult.advisorReviewItems, "customExpenseRecord"), "custom expense should require review");
assert.ok(hasDataGap(firstResult, "custom-expense-classification-required"), "custom expense should create data gap");
assert.ok(byType(firstResult.advisorReviewItems, "entertainmentRecreation"), "one-time expense should require review");
assert.ok(byType(firstResult.advisorReviewItems, "streamingDigitalSubscriptions"), "other-frequency expense should require review");
assert.ok(hasDataGap(firstResult, "expense-frequency-review-required"), "one-time/other frequency should create data gap");

const missingHouseholdResult = run({
  expenseFacts: {
    expenses: [
      {
        expenseFactId: "groceries_missing_household",
        typeKey: "groceries",
        categoryKey: "foodGroceries",
        label: "Groceries",
        amount: 1000,
        frequency: "monthly"
      }
    ]
  },
  expenseLibrary: library,
  resolvedThresholds: { rules: defaultRules },
  householdFacts: {},
  options: { mode: "reportingOnly" }
});
assert.ok(
  hasDataGap(missingHouseholdResult, "missing-household-member-count"),
  "missing householdMemberCount should create data gap for per-member threshold"
);
assert.ok(
  byType(missingHouseholdResult.advisorReviewItems, "groceries"),
  "missing householdMemberCount should push per-member expense to advisor review"
);

const resolvedAccountPolicy = resolveAccountPolicy({
  version: 1,
  compressionThresholdOverrides: [
    {
      expenseTypeKey: "groceries",
      tiers: {
        minimum: 150,
        conservative: 250,
        average: 350,
        comfortable: 600
      },
      protectedFloor: 150
    }
  ],
  compressionPolicyOverrides: [
    {
      expenseTypeKey: "streamingDigitalSubscriptions",
      requiresAdvisorConfirmation: true,
      notes: "Account review before subscription compression."
    }
  ]
});
const resolvedPolicyResult = run({
  expenseFacts,
  expenseLibrary: library,
  resolvedCompressionThresholdRules: resolvedAccountPolicy.resolvedCompressionThresholdRules,
  resolvedCompressionPolicyRules: resolvedAccountPolicy.resolvedCompressionPolicyRules,
  householdFacts: input.householdFacts,
  options: input.options
});
assert.equal(resolvedPolicyResult.trace.thresholdPolicySource, "resolvedAccountPolicy", "resolved threshold rules should trace account policy source");
assert.equal(resolvedPolicyResult.trace.compressionPolicySource, "resolvedAccountPolicy", "resolved compression policy rules should trace account policy source");
assert.equal(resolvedPolicyResult.trace.resolvedAccountPolicyUsed, true, "resolved account policy should be marked used");
assert.equal(
  byType(resolvedPolicyResult.protectedItems, "groceries").thresholdMonthlyAmount,
  1200,
  "resolved account thresholds should change the grocery comparison threshold"
);
assert.equal(
  byType(resolvedPolicyResult.opportunities, "groceries"),
  undefined,
  "resolved account thresholds should remove grocery opportunity when within threshold"
);
assert.ok(
  resolvedPolicyResult.advisorReviewItems.some((item) => item.expenseFactId === "generated_scalar_streaming_fact"),
  "resolved compression policy can require advisor review for an otherwise eligible category"
);

const maliciousResolvedPolicy = resolveAccountPolicy({
  version: 1,
  compressionPolicyOverrides: [
    {
      expenseTypeKey: "autoLoanPayment",
      decision: "YES",
      canAutoReduce: true,
      canPause: true,
      canReduceToZero: true
    },
    {
      expenseTypeKey: "healthInsurancePremiums",
      decision: "YES",
      canAutoReduce: true
    },
    {
      expenseTypeKey: "federalStateLocalIncomeTaxPayments",
      decision: "YES",
      canAutoReduce: true
    }
  ]
});
const protectedPolicyResult = run({
  expenseFacts,
  expenseLibrary: library,
  resolvedCompressionThresholdRules: maliciousResolvedPolicy.resolvedCompressionThresholdRules,
  resolvedCompressionPolicyRules: maliciousResolvedPolicy.resolvedCompressionPolicyRules,
  householdFacts: input.householdFacts,
  options: input.options
});
assert.ok(byType(protectedPolicyResult.excludedItems, "autoLoanPayment"), "generated debt should remain excluded with resolved policy");
assert.ok(byType(protectedPolicyResult.advisorReviewItems, "healthInsurancePremiums"), "healthcare should remain protected/review-only with resolver guardrails");
assert.ok(byType(protectedPolicyResult.advisorReviewItems, "federalStateLocalIncomeTaxPayments"), "tax should remain protected/review-only with resolver guardrails");

const corruptResolvedPolicyResult = run({
  expenseFacts,
  expenseLibrary: library,
  resolvedCompressionThresholdRules: { bad: true },
  resolvedCompressionPolicyRules: { bad: true },
  householdFacts: input.householdFacts,
  options: input.options
});
assert.equal(corruptResolvedPolicyResult.trace.thresholdPolicySource, "fallbackPolicy", "corrupt resolved threshold policy should fall back safely");
assert.equal(corruptResolvedPolicyResult.trace.compressionPolicySource, "fallbackPolicy", "corrupt resolved compression policy should fall back safely");
assert.equal(corruptResolvedPolicyResult.trace.fallbackPolicyUsed, true, "corrupt resolved policy should mark fallback used");
assert.ok(hasDataGap(corruptResolvedPolicyResult, "invalid-resolved-compression-threshold-rules"), "corrupt threshold policy should create data gap");
assert.ok(hasDataGap(corruptResolvedPolicyResult, "invalid-resolved-compression-policy-rules"), "corrupt compression policy should create data gap");
assert.ok(
  corruptResolvedPolicyResult.warnings.some((warning) => warning.code === "invalid-resolved-compression-threshold-rules"),
  "corrupt threshold policy should warn"
);
assert.ok(
  corruptResolvedPolicyResult.warnings.some((warning) => warning.code === "invalid-resolved-compression-policy-rules"),
  "corrupt compression policy should warn"
);

assertNoSourceMatch(/\blocalStorage\b|\bsessionStorage\b|\bdocument\b|\bquerySelector\b|\baddEventListener\b/, "classifier should not read storage or UI");
assertNoSourceMatch(/\brequire\s*\(|\bimport\b/, "classifier should not import runtime dependencies");
assertNoSourceMatch(/calculateIncomeImpact|triagePolicy|postDeathSeries|Layer 5|layer 5|normalizeLensModel|createLensModelFromBlockOutputs|analysisMethods|DIME|HLV|Needs/, "classifier should not wire Layer 5, model building, formulas, or normalizer paths");
assertNoSourceMatch(/caseOverrideAllowed|case-level threshold|caseLevel/, "classifier should not add case-level override support");

console.log("Household expense compression opportunities check passed.");
