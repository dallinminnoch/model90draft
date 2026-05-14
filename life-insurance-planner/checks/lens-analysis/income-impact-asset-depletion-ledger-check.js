#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const helper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js"
));

const {
  buildIncomeImpactAssetDepletionLedger,
  INCOME_IMPACT_ASSET_DEPLETION_LEDGER_VERSION: VERSION,
  INCOME_IMPACT_ASSET_DEPLETION_LEDGER_DEFAULT_ORDER: DEFAULT_ORDER,
  INCOME_IMPACT_ASSET_DEPLETION_LEDGER_EVENT_TYPES: EVENT_TYPES
} = helper;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventFamilies(result, eventType) {
  return result.bucketEvents
    .filter((event) => event.eventType === eventType)
    .map((event) => event.family);
}

function findEvent(result, eventType, bucketId) {
  return result.bucketEvents.find((event) => event.eventType === eventType && event.bucketId === bucketId);
}

function assertLedgerReconciles(result) {
  result.ledgerMonths.forEach((month) => {
    const endingTotal = Number(month.endingBuckets.reduce((total, bucket) => total + bucket.balance, 0).toFixed(2));
    assert.equal(
      month.totalAvailableResources,
      endingTotal,
      `month ${month.monthIndex} totalAvailableResources should equal sum of ending bucket balances`
    );
  });
}

assert.equal(typeof buildIncomeImpactAssetDepletionLedger, "function", "asset depletion ledger helper export should exist");
assert.equal(VERSION, "income-impact-asset-depletion-ledger-v1");
assert.ok(Array.isArray(DEFAULT_ORDER), "default depletion order should be exported");
assert.equal(EVENT_TYPES.bucketTapped, "bucket-tapped");
assert.equal(EVENT_TYPES.bucketDepleted, "bucket-depleted");

const orderedInput = {
  existingCoverageBucket: {
    id: "coverage",
    startingValue: 100,
    evidenceLevel: "calculated",
    sourcePath: "coverage.treated"
  },
  startingBuckets: [
    {
      id: "retirement",
      family: "retirementAssets",
      label: "Treated retirement",
      startingValue: 500,
      evidenceLevel: "trace-backed",
      sourcePath: "treatedAssetOffsets.assets.retirement"
    },
    {
      id: "cash",
      family: "cash",
      label: "Cash",
      startingValue: 100,
      evidenceLevel: "trace-backed",
      sourcePath: "treatedAssetOffsets.assets.cash"
    },
    {
      id: "taxable",
      family: "taxableInvestments",
      label: "Taxable brokerage",
      startingValue: 300,
      evidenceLevel: "trace-backed",
      sourcePath: "treatedAssetOffsets.assets.taxable",
      trace: { rawValue: 1000, treatedValue: 300 }
    },
    {
      id: "education",
      family: "educationSavings",
      label: "529 plan",
      startingValue: 400,
      evidenceLevel: "trace-backed",
      sourcePath: "treatedAssetOffsets.assets.education"
    },
    {
      id: "emergency",
      family: "emergencyFund",
      label: "Emergency reserve",
      startingValue: 200,
      evidenceLevel: "trace-backed",
      sourcePath: "treatedAssetOffsets.assets.emergency"
    },
    {
      id: "excluded-cash",
      family: "cash",
      label: "Excluded cash",
      startingValue: 999,
      included: false,
      sourcePath: "treatedAssetOffsets.assets.excludedCash"
    }
  ],
  monthlyNeeds: 100,
  monthlyIncome: 0,
  options: {
    maxMonths: 18,
    allowEducationSavingsRedirect: true,
    growthPolicy: "none"
  }
};
const orderedSnapshot = JSON.stringify(orderedInput);
const orderedResult = buildIncomeImpactAssetDepletionLedger(orderedInput);

assert.equal(orderedResult.version, VERSION);
assert.equal(orderedResult.status, "ready");
assert.equal(JSON.stringify(orderedInput), orderedSnapshot, "helper should not mutate inputs");
assert.deepEqual(
  eventFamilies(orderedResult, EVENT_TYPES.bucketTapped),
  ["existingCoverage", "cash", "emergencyFund", "taxableInvestments", "educationSavings", "retirementAssets"],
  "default depletion order should tap existing coverage, liquid buckets, education when allowed, then retirement"
);
assert.deepEqual(
  eventFamilies(orderedResult, EVENT_TYPES.bucketDepleted),
  ["existingCoverage", "cash", "emergencyFund", "taxableInvestments", "educationSavings", "retirementAssets"],
  "default depletion order should deplete buckets in the same order"
);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketTapped, "coverage").monthIndex, 0);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketDepleted, "coverage").monthIndex, 0);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketTapped, "cash").monthIndex, 1);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketDepleted, "cash").monthIndex, 1);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketTapped, "education").monthIndex, 7);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketDepleted, "education").monthIndex, 10);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketTapped, "retirement").monthIndex, 11);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketDepleted, "retirement").monthIndex, 15);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketTapped, "education").amountAtTap, 400);
assert.equal(findEvent(orderedResult, EVENT_TYPES.bucketDepleted, "education").amountDepleted, 100);
assert.equal(
  orderedResult.bucketEvents
    .filter((event) => event.bucketId === "coverage")
    .every((event) => event.trace.mechanicalLedgerEvent === true && event.trace.visibleStorylineEligible === false),
  true,
  "existing coverage should remain a mechanical ledger source rather than a visible storyline assumption"
);
assert.equal(
  orderedResult.ledgerMonths[0].startingBuckets.find((bucket) => bucket.id === "taxable").balance,
  300,
  "ledger should use treated startingValue as spendable value"
);
assert.ok(
  orderedResult.excludedBuckets.some((bucket) => bucket.id === "excluded-cash" && bucket.reason === "bucket-marked-not-included"),
  "included:false bucket should be excluded from spendable resources"
);
assertLedgerReconciles(orderedResult);

const educationExcludedResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100 },
    { id: "education", family: "educationSavings", startingValue: 400 }
  ],
  monthlyNeeds: 100,
  options: {
    maxMonths: 3,
    allowEducationSavingsRedirect: false
  }
});
assert.ok(
  educationExcludedResult.excludedBuckets.some((bucket) => bucket.id === "education" && bucket.reason === "education-redirect-disabled"),
  "education savings should be excluded unless redirect is explicitly enabled"
);
assert.equal(
  educationExcludedResult.bucketEvents.some((event) => event.family === "educationSavings"),
  false,
  "education savings should not emit tap/depletion events when redirect is disabled"
);

const growthInput = {
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100 },
    {
      id: "taxable-growth",
      family: "taxableInvestments",
      startingValue: 1000,
      growthActive: true,
      monthlyGrowthRate: 0.1
    }
  ],
  monthlyNeeds: 100,
  options: {
    maxMonths: 3,
    growthPolicy: "growth-until-tapped"
  }
};
const growthResult = buildIncomeImpactAssetDepletionLedger(growthInput);
assert.deepEqual(
  growthResult.ledgerMonths.map((month) => month.growthAppliedByBucket.map((growth) => growth.bucketId)),
  [["taxable-growth"], ["taxable-growth"], []],
  "growth should apply before withdrawal while active and stop after first tap"
);
assert.equal(growthResult.ledgerMonths[0].growthAppliedByBucket[0].amount, 100);
assert.equal(growthResult.ledgerMonths[1].growthAppliedByBucket[0].amount, 110);
assert.equal(findEvent(growthResult, EVENT_TYPES.bucketTapped, "taxable-growth").monthIndex, 1);
assertLedgerReconciles(growthResult);

const noGrowthResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    {
      id: "taxable-growth",
      family: "taxableInvestments",
      startingValue: 1000,
      growthActive: true,
      monthlyGrowthRate: 0.1
    }
  ],
  monthlyNeeds: 0,
  options: {
    maxMonths: 2,
    growthPolicy: "none"
  }
});
assert.deepEqual(
  noGrowthResult.ledgerMonths.map((month) => month.growthAppliedByBucket.length),
  [0, 0],
  "growthPolicy:none should prevent post-death growth"
);

const unmetResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100 }
  ],
  monthlyNeeds: 75,
  options: { maxMonths: 3 }
});
assert.equal(unmetResult.ledgerMonths[0].unmetNeed, 0);
assert.equal(unmetResult.ledgerMonths[1].totalAvailableResources, 0);
assert.equal(unmetResult.ledgerMonths[1].unmetNeed, 50);
assert.equal(unmetResult.ledgerMonths[2].unmetNeed, 75);
assertLedgerReconciles(unmetResult);

const unknownExcludedResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    { id: "custom", family: "unknown", startingValue: 250, sourcePath: "assetFacts.assets.custom" },
    { id: "home", family: "homeEquity", startingValue: 500000, sourcePath: "assetFacts.assets.home" }
  ],
  monthlyNeeds: 100,
  options: { maxMonths: 1 }
});
assert.equal(unknownExcludedResult.status, "not-applicable");
assert.ok(
  unknownExcludedResult.warnings.some((warning) => warning.code === "unknown-assets-excluded"),
  "unknown assets should warn and exclude by default"
);
assert.ok(
  unknownExcludedResult.warnings.some((warning) => warning.code === "illiquid-assets-excluded"),
  "illiquid assets should warn and exclude by default"
);

const unknownIncludedResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    { id: "custom", family: "unknown", startingValue: 250, sourcePath: "assetFacts.assets.custom" }
  ],
  monthlyNeeds: 100,
  options: {
    maxMonths: 1,
    includeUnknownAssets: true
  }
});
assert.equal(unknownIncludedResult.status, "ready");
assert.equal(findEvent(unknownIncludedResult, EVENT_TYPES.bucketTapped, "custom").family, "unknown");

const scheduledObligationResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 200 }
  ],
  monthlyNeeds: [50, 50],
  monthlyIncome: [10, 60],
  scheduledObligations: [
    { monthIndex: 0, amount: 25, label: "Support obligation" }
  ],
  options: { maxMonths: 2 }
});
assert.equal(scheduledObligationResult.ledgerMonths[0].monthlyNetUse, 65);
assert.equal(scheduledObligationResult.ledgerMonths[1].monthlyNetUse, 0);

const insufficientResult = buildIncomeImpactAssetDepletionLedger({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100 }
  ],
  options: { maxMonths: 1 }
});
assert.equal(insufficientResult.status, "insufficient-data");
assert.ok(insufficientResult.warnings.some((warning) => warning.code === "monthly-needs-missing"));

assert.deepEqual(
  buildIncomeImpactAssetDepletionLedger(growthInput),
  buildIncomeImpactAssetDepletionLedger(growthInput),
  "ledger output should be deterministic for repeated calls"
);

console.log("income-impact-asset-depletion-ledger-check passed");
