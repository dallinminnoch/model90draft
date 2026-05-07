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
const resolverSource = loadScript("app/features/lens-analysis/expense-compression-threshold-resolver.js");

const library = context.LensApp.lensAnalysis.expenseLibrary;
const thresholds = context.LensApp.lensAnalysis.expenseCompressionThresholds;
const resolver = context.LensApp.lensAnalysis.expenseCompressionThresholdResolver;

assert.ok(library, "expense library should load");
assert.ok(thresholds, "expense compression threshold defaults should load");
assert.ok(resolver, "expense compression threshold resolver should load");
assert.equal(typeof resolver.resolveExpenseCompressionThresholds, "function", "resolver export should exist");

const defaultRules = thresholds.getExpenseCompressionThresholdRules();

function resolve(advisorOverrides) {
  return resolver.resolveExpenseCompressionThresholds({
    defaultThresholds: defaultRules,
    advisorOverrides
  });
}

function byType(result, expenseTypeKey) {
  const rule = result.rules.find((item) => item.expenseTypeKey === expenseTypeKey);
  assert.ok(rule, `${expenseTypeKey} should exist in resolved threshold rules`);
  return rule;
}

function warningCodes(result) {
  return result.warnings.map((warning) => warning.code);
}

function assertNoSourceMatch(pattern, message) {
  assert.equal(pattern.test(resolverSource), false, message);
}

const defaultOnly = resolve(null);
assert.equal(defaultOnly.rules.length, defaultRules.length, "default-only resolution should keep every default rule");
assert.equal(defaultOnly.metadata.source, "explicit-input");
assert.equal(JSON.stringify(defaultOnly.metadata.precedence), JSON.stringify(["advisorAccountOverrides", "model90Defaults"]));
assert.equal(defaultOnly.metadata.advisorOverrideCount, 0);
assert.equal(defaultOnly.metadata.appliedAdvisorOverrideCount, 0);
assert.equal(defaultOnly.warnings.length, 0);

const defaultGroceries = byType(defaultOnly, "groceries");
defaultGroceries.tiers.minimum = 999;
assert.equal(byType(resolve(null), "groceries").tiers.minimum, 150, "resolved rules should be cloned");

const groceryOverride = resolve({
  schemaVersion: 1,
  defaultsVersion: 1,
  rulesByThresholdId: {
    "groceries-per-member-monthly-v1": {
      tiers: {
        minimum: 175,
        conservative: 275,
        average: 375,
        comfortable: 500
      },
      protectedFloor: 175,
      updatedBy: "advisor@example.com",
      updatedAt: "2026-05-06T00:00:00.000Z"
    }
  }
});
const resolvedGroceries = byType(groceryOverride, "groceries");
assert.equal(resolvedGroceries.tiers.minimum, 175, "advisor tier override should win over MODEL90 default");
assert.equal(resolvedGroceries.tiers.comfortable, 500, "advisor comfortable tier override should apply");
assert.equal(resolvedGroceries.protectedFloor, 175, "advisor protectedFloor override should apply");
assert.equal(resolvedGroceries.canAutoReduce, true, "advisor tier override should not alter policy fields");
assert.equal(groceryOverride.metadata.appliedAdvisorOverrideCount, 1);
assert.equal(
  JSON.stringify(groceryOverride.metadata.appliedAdvisorOverrideThresholdIds),
  JSON.stringify(["groceries-per-member-monthly-v1"])
);

const partialOverride = resolve({
  rulesByThresholdId: {
    "streaming-digital-subscriptions-household-monthly-v1": {
      tiers: {
        average: 80
      }
    }
  }
});
const streaming = byType(partialOverride, "streamingDigitalSubscriptions");
assert.equal(streaming.tiers.minimum, 0, "partial override should preserve default minimum tier");
assert.equal(streaming.tiers.conservative, 25, "partial override should preserve default conservative tier");
assert.equal(streaming.tiers.average, 80, "partial override should apply changed average tier");
assert.equal(streaming.tiers.comfortable, 120, "partial override should preserve default comfortable tier");

const resetByOmission = resolve({
  rulesByThresholdId: {}
});
assert.equal(byType(resetByOmission, "groceries").tiers.minimum, 150, "omitting an override should reset to MODEL90 default");
assert.equal(resetByOmission.metadata.appliedAdvisorOverrideCount, 0, "reset-by-omission should not apply copied defaults");

const unknownOverride = resolve({
  rulesByThresholdId: {
    "unknown-threshold-v1": {
      tiers: { minimum: 1 }
    }
  }
});
assert.ok(warningCodes(unknownOverride).includes("unknown-advisor-threshold-id"), "unknown threshold ids should warn");
assert.equal(unknownOverride.rules.length, defaultRules.length, "unknown threshold ids should not create new rules");
assert.equal(unknownOverride.metadata.ignoredAdvisorOverrideCount, 1);

const invalidTierValue = resolve({
  rulesByThresholdId: {
    "meal-delivery-services-household-monthly-v1": {
      tiers: { minimum: -1 }
    }
  }
});
assert.ok(warningCodes(invalidTierValue).includes("invalid-advisor-threshold-tier-value"), "negative tier value should warn");
assert.equal(byType(invalidTierValue, "mealDeliveryServices").tiers.minimum, 0, "invalid tier should not mutate default");

const invalidTierOrder = resolve({
  rulesByThresholdId: {
    "takeout-convenience-food-per-member-monthly-v1": {
      tiers: {
        minimum: 200,
        conservative: 100
      }
    }
  }
});
assert.ok(warningCodes(invalidTierOrder).includes("invalid-advisor-threshold-tier-order"), "out-of-order tiers should warn");
assert.equal(byType(invalidTierOrder, "takeoutConvenienceFood").tiers.minimum, 0, "out-of-order tier override should be ignored");

const invalidProtectedFloor = resolve({
  rulesByThresholdId: {
    "internet-household-monthly-v1": {
      protectedFloor: 9999
    }
  }
});
assert.ok(warningCodes(invalidProtectedFloor).includes("invalid-advisor-threshold-protected-floor"), "protectedFloor above comfortable tier should warn");
assert.equal(byType(invalidProtectedFloor, "internet").protectedFloor, 50, "invalid protectedFloor should not mutate default");

const unsupportedPolicyField = resolve({
  rulesByThresholdId: {
    "fuel-household-monthly-v1": {
      canAutoReduce: true,
      requiresAdvisorConfirmation: false,
      behaviorClass: "discretionary",
      tiers: {
        conservative: 225
      }
    }
  }
});
const fuel = byType(unsupportedPolicyField, "fuel");
assert.ok(warningCodes(unsupportedPolicyField).includes("unsupported-advisor-threshold-override-field"), "unsupported policy fields should warn");
assert.equal(fuel.canAutoReduce, false, "advisor overrides should not make protected fuel auto-compressible");
assert.equal(fuel.requiresAdvisorConfirmation, false, "unsupported advisor field should not alter confirmation metadata");
assert.equal(fuel.behaviorClass, "protectedEssential", "unsupported advisor field should not alter behavior class");
assert.equal(fuel.tiers.conservative, 225, "supported tier override should still apply when unsupported fields are ignored");

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
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.generatedOnly, true, `${typeKey} should remain generated-only in expense library`);
  assert.equal(thresholds.getExpenseCompressionThresholdRuleByType(typeKey), null, `${typeKey} should not have a default threshold`);
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
  const entry = library.getExpenseLibraryEntry(typeKey);
  assert.equal(entry.requiresAdvisorConfirmation, true, `${typeKey} should remain advisor-confirmed in expense metadata`);
  assert.equal(thresholds.getExpenseCompressionThresholdRuleByType(typeKey), null, `${typeKey} should not have a V1 auto-compression threshold`);
});

const maliciousSourceOwnedOverride = resolve({
  rulesByThresholdId: {
    "auto-loan-payment-generated-v1": {
      canAutoReduce: true,
      tiers: { minimum: 0 }
    },
    "health-insurance-generated-v1": {
      canAutoReduce: true,
      tiers: { minimum: 0 }
    }
  }
});
assert.equal(maliciousSourceOwnedOverride.metadata.appliedAdvisorOverrideCount, 0, "unknown source-owned/protected ids should not apply");
assert.ok(
  warningCodes(maliciousSourceOwnedOverride).every((code) => code === "unknown-advisor-threshold-id"),
  "malicious unknown protected/source-owned overrides should only produce unknown-id warnings"
);

const invalidInput = resolver.resolveExpenseCompressionThresholds({
  defaultThresholds: null,
  advisorOverrides: []
});
assert.ok(warningCodes(invalidInput).includes("invalid-default-thresholds"), "invalid default input should warn");
assert.ok(warningCodes(invalidInput).includes("invalid-advisor-threshold-overrides"), "invalid advisor override input should warn");

assertNoSourceMatch(/caseOverrideAllowed/, "resolver should not include caseOverrideAllowed");
assertNoSourceMatch(/localStorage|sessionStorage|document|querySelector|addEventListener/, "resolver should not read storage or UI");
assertNoSourceMatch(/triagePolicy|calculateIncomeImpact|expenseFacts|normalizeLensModel|model-builder|analysisMethods|DIME|HLV|Needs/, "resolver should not wire formulas, normalization, or Layer 5");
assertNoSourceMatch(/app\.js|settings\.html|analysis-setup\.html/, "resolver should not depend on pages or app bootstrap");

console.log("Expense compression threshold resolver check passed.");
