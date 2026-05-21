#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const helper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js"
));

const {
  buildIncomeImpactCanonicalRunwayAssetWaterfall,
  INCOME_IMPACT_CANONICAL_RUNWAY_ASSET_WATERFALL_DEFAULT_ORDER: DEFAULT_ORDER
} = helper;

assert.equal(typeof buildIncomeImpactCanonicalRunwayAssetWaterfall, "function");
assert.deepEqual(
  DEFAULT_ORDER.slice(0, 6),
  ["existingCoverage", "preDeathSavedCash", "cash", "emergencyFund", "otherLiquid", "taxableInvestments"]
);

function familiesFor(result, eventType) {
  return result.bucketEvents
    .filter((event) => event.eventType === eventType)
    .map((event) => event.family);
}

const ordered = buildIncomeImpactCanonicalRunwayAssetWaterfall({
  existingCoverageBucket: {
    id: "coverage",
    label: "Existing coverage proceeds",
    startingValue: 100,
    included: true,
    sourcePath: "layer2.existingCoverage.treatedCoverageAmount"
  },
  startingBuckets: [
    {
      id: "taxable",
      family: "taxableInvestments",
      label: "Taxable investments",
      startingValue: 100,
      included: true,
      sourcePath: "layer2.assets.taxable"
    },
    {
      id: "cash",
      family: "cash",
      label: "Cash",
      startingValue: 100,
      included: true,
      sourcePath: "layer2.assets.cash"
    },
    {
      id: "pre-death-cash",
      family: "preDeathSavedCash",
      label: "Pre-death saved cash",
      startingValue: 100,
      included: true,
      sourcePath: "layer2.assets.cashFlowContribution"
    },
    {
      id: "emergency",
      family: "emergencyFund",
      label: "Emergency fund",
      startingValue: 100,
      included: true,
      sourcePath: "layer2.assets.emergency"
    }
  ],
  monthlyNeeds: 100,
  monthlyIncome: 0,
  options: { maxMonths: 5 }
});

assert.equal(ordered.status, "ready");
assert.equal(ordered.trace.canonicalWaterfall, true);
assert.deepEqual(
  familiesFor(ordered, "bucket-tapped"),
  ["existingCoverage", "preDeathSavedCash", "cash", "emergencyFund", "taxableInvestments"],
  "canonical drawdown should spend coverage, pre-death saved cash, ordinary cash, emergency fund, then taxable investments"
);
assert.deepEqual(
  ordered.orderedBuckets.map((bucket) => bucket.family),
  ["preDeathSavedCash", "cash", "emergencyFund", "taxableInvestments"],
  "orderedBuckets should exclude mechanical coverage but preserve canonical asset order"
);
assert.equal(ordered.mechanicalSources.some((source) => source.family === "existingCoverage"), true);
assert.equal(ordered.bucketEvents.some((event) => event.family === "existingCoverage" && event.trace.visibleStorylineEligible === false), true);

const gated = buildIncomeImpactCanonicalRunwayAssetWaterfall({
  startingBuckets: [
    { id: "education", family: "educationSavings", startingValue: 100, sourcePath: "layer2.assets.education" },
    { id: "retirement", family: "retirementAssets", startingValue: 100, sourcePath: "layer2.assets.retirement" },
    { id: "home", family: "homeEquity", startingValue: 100, sourcePath: "layer2.assets.home" },
    { id: "custom", family: "unknown", startingValue: 100, sourcePath: "layer2.assets.custom" }
  ],
  monthlyNeeds: 100,
  monthlyIncome: 0,
  options: { maxMonths: 2 }
});

assert.equal(gated.status, "not-applicable");
["educationSavings", "retirementAssets", "homeEquity", "unknown"].forEach((family) => {
  assert.ok(
    gated.excludedBuckets.some((bucket) => bucket.family === family && bucket.reason === "gated-family-not-treatment-included"),
    `${family} should be excluded unless existing treatment output marks it included`
  );
});

const permitted = buildIncomeImpactCanonicalRunwayAssetWaterfall({
  startingBuckets: [
    { id: "education", family: "educationSavings", startingValue: 100, included: true, sourcePath: "layer2.assets.education" },
    { id: "retirement", family: "retirementAssets", startingValue: 100, included: true, sourcePath: "layer2.assets.retirement" },
    { id: "home", family: "homeEquity", startingValue: 100, included: true, sourcePath: "layer2.assets.home" }
  ],
  monthlyNeeds: 100,
  monthlyIncome: 0,
  options: { maxMonths: 4 }
});

assert.deepEqual(
  familiesFor(permitted, "bucket-tapped"),
  ["educationSavings", "retirementAssets", "homeEquity"],
  "gated buckets should enter the canonical waterfall only when treatment marks them included"
);
assert.equal(permitted.bucketEvents.some((event) => event.family === "homeEquity"), true);

console.log("income-impact-canonical-runway-asset-waterfall-check passed");
