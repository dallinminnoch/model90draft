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

loadScript("app/features/lens-analysis/household-expense-lifestyle-range-policy.js");
loadScript("app/features/lens-analysis/household-expense-compression-policy.js");
loadScript("app/features/lens-analysis/expense-compression-thresholds.js");
const resolverSource = loadScript("app/features/lens-analysis/household-expense-account-policy-resolver.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;
const compressionPolicy = lensAnalysis.householdExpenseCompressionPolicy;
const thresholds = lensAnalysis.expenseCompressionThresholds;
const resolver = lensAnalysis.householdExpenseAccountPolicyResolver;

assert.ok(resolver, "household expense account policy resolver should load");
assert.equal(typeof resolver.resolveHouseholdExpenseAccountPolicy, "function", "resolver export should exist");
assert.equal(resolver.HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_RESOLVER_VERSION, 1, "resolver version should be V1");

const defaultLifestyleRangePolicies = lifestylePolicy.listLifestyleRangePolicies();
const defaultCompressionPolicyRules = compressionPolicy.getHouseholdExpenseCompressionPolicyRules();
const defaultCompressionThresholdRules = thresholds.getExpenseCompressionThresholdRules();

function resolve(accountPolicy, hardGuardrails) {
  return resolver.resolveHouseholdExpenseAccountPolicy({
    defaultLifestyleRangePolicies,
    defaultCompressionPolicyRules,
    defaultCompressionThresholdRules,
    accountPolicy,
    hardGuardrails: hardGuardrails || {
      minConservativeFloorRatio: 0,
      minNonZeroConservativeFloorRatio: 0.2,
      maxElevatedCeilingRatio: 2,
      maxCeilingTierMultiplier: 1.75,
      minThresholdTierValue: 0,
      maxThresholdTierValue: 1000
    }
  });
}

function byType(rows, typeKey) {
  const row = rows.find((candidate) => candidate.expenseTypeKey === typeKey);
  assert.ok(row, `${typeKey} should resolve`);
  return row;
}

function byThreshold(rows, thresholdId) {
  const row = rows.find((candidate) => candidate.thresholdId === thresholdId);
  assert.ok(row, `${thresholdId} should resolve`);
  return row;
}

function traceHas(result, source, field) {
  return result.trace.entries.some((entry) => entry.source === source && (!field || entry.field === field));
}

const defaultOnlyFirst = resolve(null);
const defaultOnlySecond = resolve(null);
assert.deepEqual(defaultOnlyFirst, defaultOnlySecond, "default-only resolution should be deterministic");
assert.equal(
  defaultOnlyFirst.resolvedLifestyleRangePolicies.length,
  defaultLifestyleRangePolicies.length,
  "default-only resolution should return lifestyle seed rows"
);
assert.equal(
  defaultOnlyFirst.resolvedCompressionPolicyRules.length,
  defaultCompressionPolicyRules.length,
  "default-only resolution should return compression seed rows"
);
assert.equal(
  defaultOnlyFirst.resolvedCompressionThresholdRules.length,
  defaultCompressionThresholdRules.length,
  "default-only resolution should return threshold seed rows"
);
assert.ok(defaultOnlyFirst.warnings.some((warning) => warning.code === "missing-account-policy"), "missing account policy should warn");
assert.ok(traceHas(defaultOnlyFirst, "defaultPolicy"), "default trace should include seed policy source");

const validOverrideResult = resolve({
  version: 1,
  metadata: { accountId: "account-demo" },
  guardrails: {
    maxElevatedCeilingRatio: 1.8
  },
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "groceries",
      conservativeFloorRatio: 0.72,
      elevatedCeilingRatio: 1.25,
      floorTierKey: "conservative",
      ceilingTierKey: "comfortable",
      ceilingTierMultiplier: 1.2,
      notes: "Account grocery range"
    },
    {
      expenseTypeKey: "diningOutRestaurants",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.65
    }
  ],
  compressionThresholdOverrides: [
    {
      expenseTypeKey: "groceries",
      tiers: {
        minimum: 175,
        conservative: 275,
        average: 375,
        comfortable: 475
      },
      protectedFloor: 175
    }
  ],
  compressionPolicyOverrides: [
    {
      expenseTypeKey: "streamingDigitalSubscriptions",
      canReduceToZero: false,
      requiresAdvisorConfirmation: true,
      notes: "Account wants advisor confirmation before cutting subscription bundles."
    }
  ]
});

const resolvedGroceries = byType(validOverrideResult.resolvedLifestyleRangePolicies, "groceries");
assert.equal(resolvedGroceries.conservativeFloorRatio, 0.72, "valid grocery floor override should apply");
assert.equal(resolvedGroceries.elevatedCeilingRatio, 1.25, "valid grocery ceiling override should apply");
assert.equal(resolvedGroceries.notes, "Account grocery range", "valid lifestyle notes should apply");

const resolvedDining = byType(validOverrideResult.resolvedLifestyleRangePolicies, "diningOutRestaurants");
assert.equal(resolvedDining.conservativeFloorRatio, 0, "zero floor should remain allowed for zero-eligible discretionary rows");
assert.equal(resolvedDining.elevatedCeilingRatio, 1.65, "valid discretionary elevated ceiling should apply");

const groceriesThreshold = byType(validOverrideResult.resolvedCompressionThresholdRules, "groceries");
assert.equal(groceriesThreshold.tiers.minimum, 175, "valid threshold minimum override should apply");
assert.equal(groceriesThreshold.tiers.conservative, 275, "valid threshold conservative override should apply");
assert.equal(groceriesThreshold.tiers.average, 375, "valid threshold average override should apply");
assert.equal(groceriesThreshold.tiers.comfortable, 475, "valid threshold comfortable override should apply");
assert.equal(groceriesThreshold.protectedFloor, 175, "valid protected floor override should apply");

const streamingPolicy = byType(validOverrideResult.resolvedCompressionPolicyRules, "streamingDigitalSubscriptions");
assert.equal(streamingPolicy.canReduceToZero, false, "account can make eligible compression policy stricter");
assert.equal(streamingPolicy.requiresAdvisorConfirmation, true, "account can require advisor confirmation");
assert.ok(traceHas(validOverrideResult, "accountOverride"), "valid overrides should trace accountOverride");

const maliciousResult = resolve({
  version: 1,
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "rentOrMortgagePayment",
      sliderEligible: true,
      rangeBehavior: "expandable",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 3,
      allowBelowBaseline: true,
      allowAboveBaseline: true,
      protectedFloorPolicy: "allowZero"
    },
    {
      expenseTypeKey: "autoLoanPayment",
      sliderEligible: true,
      rangeBehavior: "expandable"
    },
    {
      expenseTypeKey: "federalStateLocalIncomeTaxPayments",
      sliderEligible: true,
      rangeBehavior: "compressible"
    },
    {
      expenseTypeKey: "healthInsurancePremiums",
      sliderEligible: true,
      rangeBehavior: "compressible"
    },
    {
      expenseTypeKey: "daycareChildcare",
      sliderEligible: true,
      rangeBehavior: "compressible"
    },
    {
      expenseTypeKey: "lifeInsurancePremiums",
      sliderEligible: true,
      rangeBehavior: "expandable"
    }
  ],
  compressionPolicyOverrides: [
    {
      expenseTypeKey: "autoLoanPayment",
      decision: "YES",
      canAutoReduce: true,
      canReduceToZero: true,
      canPause: true
    },
    {
      expenseTypeKey: "healthInsurancePremiums",
      decision: "YES",
      canAutoReduce: true
    },
    {
      expenseTypeKey: "rentOrMortgagePayment",
      decision: "YES",
      canAutoReduce: true
    }
  ]
});

[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "federalStateLocalIncomeTaxPayments",
  "healthInsurancePremiums",
  "daycareChildcare",
  "lifeInsurancePremiums"
].forEach((typeKey) => {
  const row = byType(maliciousResult.resolvedLifestyleRangePolicies, typeKey);
  assert.equal(row.sliderEligible, false, `${typeKey} should remain slider-ineligible`);
  assert.equal(row.allowBelowBaseline, false, `${typeKey} should not move below baseline`);
  assert.equal(row.allowAboveBaseline, false, `${typeKey} should not move above baseline`);
});

[
  "autoLoanPayment",
  "healthInsurancePremiums",
  "rentOrMortgagePayment"
].forEach((typeKey) => {
  const row = byType(maliciousResult.resolvedCompressionPolicyRules, typeKey);
  assert.notEqual(row.decision, "YES", `${typeKey} should not become a YES compression row`);
  assert.equal(row.canAutoReduce, false, `${typeKey} should not become auto-compressible`);
  assert.equal(row.canPause, false, `${typeKey} should not become pauseable`);
});
assert.ok(traceHas(maliciousResult, "fallbackGuardrail"), "malicious overrides should trace fallbackGuardrail");

const invalidRatioResult = resolve({
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "groceries",
      conservativeFloorRatio: -2,
      elevatedCeilingRatio: 9,
      ceilingTierMultiplier: 4
    },
    {
      expenseTypeKey: "diningOutRestaurants",
      conservativeFloorRatio: -1,
      elevatedCeilingRatio: 9
    }
  ]
});

const clampedGroceries = byType(invalidRatioResult.resolvedLifestyleRangePolicies, "groceries");
assert.equal(clampedGroceries.conservativeFloorRatio, 0.2, "nonzero-protected conservative floor should clamp to hard minimum");
assert.equal(clampedGroceries.elevatedCeilingRatio, 2, "elevated ceiling should clamp to hard maximum");
assert.equal(clampedGroceries.ceilingTierMultiplier, 1.75, "ceiling multiplier should clamp to hard maximum");
const clampedDining = byType(invalidRatioResult.resolvedLifestyleRangePolicies, "diningOutRestaurants");
assert.equal(clampedDining.conservativeFloorRatio, 0, "zero-eligible category may clamp to zero");
assert.equal(clampedDining.elevatedCeilingRatio, 2, "discretionary ceiling should still respect hard maximum");
assert.ok(traceHas(invalidRatioResult, "clampedAccountOverride"), "invalid ratios should trace clampedAccountOverride");

const thresholdClampResult = resolve({
  compressionThresholdOverrides: [
    {
      thresholdId: "groceries-per-member-monthly-v1",
      tiers: {
        minimum: -50,
        conservative: 1200,
        average: 10,
        comfortable: 9999
      },
      protectedFloor: 9999,
      canAutoReduce: false
    }
  ]
});

const clampedThreshold = byThreshold(thresholdClampResult.resolvedCompressionThresholdRules, "groceries-per-member-monthly-v1");
assert.equal(clampedThreshold.tiers.minimum, 0, "threshold minimum should clamp to hard minimum");
assert.equal(clampedThreshold.tiers.conservative, 1000, "threshold conservative should clamp to hard maximum");
assert.equal(clampedThreshold.tiers.average, 1000, "threshold average should preserve ordered tiers after clamp");
assert.equal(clampedThreshold.tiers.comfortable, 1000, "threshold comfortable should clamp to hard maximum");
assert.equal(clampedThreshold.protectedFloor, 1000, "protected floor should clamp to safe threshold bounds");
assert.equal(clampedThreshold.canAutoReduce, true, "unsupported threshold policy field should remain locked");

const separatedResult = resolve({
  lifestyleRangeOverrides: {
    groceries: {
      conservativeFloorRatio: 0.77
    }
  },
  compressionPolicyOverrides: {
    groceries: {
      canReduceToZero: true
    }
  },
  compressionThresholdOverrides: {
    "groceries-per-member-monthly-v1": {
      tiers: {
        minimum: 180
      }
    }
  }
});
assert.equal(byType(separatedResult.resolvedLifestyleRangePolicies, "groceries").conservativeFloorRatio, 0.77);
assert.equal(byType(separatedResult.resolvedCompressionPolicyRules, "groceries").canReduceToZero, false, "compression policy namespace should not inherit lifestyle behavior");
assert.equal(byThreshold(separatedResult.resolvedCompressionThresholdRules, "groceries-per-member-monthly-v1").tiers.minimum, 180);
assert.equal(byType(separatedResult.resolvedLifestyleRangePolicies, "groceries").sourcePolicyDecision, "YES", "lifestyle namespace should keep source decision separate from compression policy row");

const corruptPolicyResult = resolve("not-an-object");
assert.ok(corruptPolicyResult.warnings.some((warning) => warning.code === "invalid-account-policy"), "corrupt account policy should warn");
assert.deepEqual(
  byType(corruptPolicyResult.resolvedLifestyleRangePolicies, "groceries"),
  byType(defaultOnlyFirst.resolvedLifestyleRangePolicies, "groceries"),
  "corrupt account policy should fall back to defaults"
);

const originalInputs = {
  defaultLifestyleRangePolicies,
  defaultCompressionPolicyRules,
  defaultCompressionThresholdRules,
  accountPolicy: {
    lifestyleRangeOverrides: [
      { expenseTypeKey: "groceries", conservativeFloorRatio: 0.73 }
    ],
    compressionThresholdOverrides: [
      { expenseTypeKey: "groceries", tiers: { minimum: 190 } }
    ],
    compressionPolicyOverrides: [
      { expenseTypeKey: "streamingDigitalSubscriptions", canReduceToZero: false }
    ]
  }
};
const beforeInputs = JSON.stringify(originalInputs);
resolver.resolveHouseholdExpenseAccountPolicy(originalInputs);
assert.equal(JSON.stringify(originalInputs), beforeInputs, "resolver should not mutate inputs");

const serializedResult = JSON.stringify(validOverrideResult);
const serializable = JSON.parse(serializedResult);
assert.ok(serializedResult.length > 0, "resolved output should stringify");
assert.equal(serializable.metadata.resolverVersion, 1, "resolved output should JSON round-trip metadata");
assert.equal(serializable.resolvedLifestyleRangePolicies.length, validOverrideResult.resolvedLifestyleRangePolicies.length, "resolved output should JSON round-trip lifestyle rows");
assert.equal(serializable.resolvedCompressionPolicyRules.length, validOverrideResult.resolvedCompressionPolicyRules.length, "resolved output should JSON round-trip compression policy rows");
assert.equal(serializable.resolvedCompressionThresholdRules.length, validOverrideResult.resolvedCompressionThresholdRules.length, "resolved output should JSON round-trip threshold rows");

[
  /require\s*\(/,
  /\bimport\s+/,
  /income-loss-impact-display/,
  /income-impact-timeline-graph-model/,
  /localStorage/,
  /sessionStorage/,
  /document\./,
  /window\./,
  /Layer 5/,
  /normalize-lens-model/,
  /formula/,
  /styles\.css/,
  /components\.css/,
  /app\.js/
].forEach((pattern) => {
  assert.equal(pattern.test(resolverSource), false, `resolver source should not contain forbidden dependency pattern ${pattern}`);
});

console.log("household-expense-account-policy-resolver-check passed");
