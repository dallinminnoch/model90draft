#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const helper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-resource-waterfall-calculations.js"
));

const {
  buildIncomeImpactResourceWaterfall,
  INCOME_IMPACT_RESOURCE_WATERFALL_BUCKET_FAMILIES: FAMILIES,
  INCOME_IMPACT_RESOURCE_WATERFALL_DEFAULT_ORDER: DEFAULT_ORDER,
  INCOME_IMPACT_RESOURCE_WATERFALL_EVENT_TYPES: EVENT_TYPES
} = helper;

assert.equal(typeof buildIncomeImpactResourceWaterfall, "function", "resource waterfall helper export should exist");
assert.ok(Array.isArray(DEFAULT_ORDER), "default waterfall order should be exported");

const explicitInput = {
  resourceBuckets: [
    { id: "retirement", family: FAMILIES.retirementAssets, startingValue: 6000, evidenceLevel: "trace-backed" },
    { id: "cash", family: FAMILIES.cash, startingValue: 1000, evidenceLevel: "trace-backed" },
    { id: "unknown", family: FAMILIES.unknown, startingValue: 999, evidenceLevel: "trace-backed" },
    { id: "education", family: FAMILIES.educationSavings, startingValue: 3000, evidenceLevel: "trace-backed" },
    { id: "home-equity", family: FAMILIES.homeEquity, startingValue: 5000, evidenceLevel: "trace-backed" },
    { id: "emergency", family: FAMILIES.emergencyFund, startingValue: 2000, evidenceLevel: "trace-backed" },
    { id: "taxable", family: FAMILIES.taxableInvestments, startingValue: 1000, evidenceLevel: "trace-backed" }
  ],
  scenario: {
    scenario: {
      selectedDeathDate: "2030-01-15"
    }
  },
  options: {
    monthlyBurnRate: 1000
  }
};
const snapshot = JSON.stringify(explicitInput);
const result = buildIncomeImpactResourceWaterfall(explicitInput);

assert.equal(result.version, "income-impact-resource-waterfall-v1");
assert.equal(result.trace.source, "income-impact-resource-waterfall-calculations");
assert.equal(JSON.stringify(explicitInput), snapshot, "helper should not mutate inputs");

assert.deepEqual(
  result.buckets.map((bucket) => bucket.family),
  [
    FAMILIES.cash,
    FAMILIES.emergencyFund,
    FAMILIES.taxableInvestments,
    FAMILIES.educationSavings,
    FAMILIES.retirementAssets,
    FAMILIES.homeEquity,
    FAMILIES.unknown
  ],
  "explicit buckets should be ordered by the default resource waterfall order"
);
assert.ok(
  result.buckets.findIndex((bucket) => bucket.family === FAMILIES.unknown)
    > result.buckets.findIndex((bucket) => bucket.family === FAMILIES.cash),
  "unknown buckets should not outrank known liquid buckets"
);

const labels = result.timelineEvents.map((event) => event.displayLabel);
assert.ok(labels.includes("Cash Savings Depleted"), "cash bucket should produce a cash depleted event");
assert.ok(labels.includes("Emergency Fund Depleted"), "emergency bucket should produce an emergency fund depleted event");
assert.ok(labels.includes("Education Savings Used for Living Needs"), "education bucket should produce a start-use event");
assert.ok(labels.includes("Education Savings Depleted"), "education bucket should produce a depletion event");
assert.ok(labels.includes("Retirement Assets Tapped"), "retirement bucket should produce a tapped event");
assert.ok(labels.includes("Retirement Assets Depleted"), "retirement bucket should produce a depletion event");
assert.ok(labels.includes("Home Equity Becomes Last Resort"), "home equity should produce last-resort event when reached");
assert.ok(labels.includes("Home Equity Depleted"), "home equity depletion should appear only when the bucket exhausts");

const cashDepletion = result.timelineEvents.find((event) => event.displayLabel === "Cash Savings Depleted");
const emergencyDepletion = result.timelineEvents.find((event) => event.displayLabel === "Emergency Fund Depleted");
const educationUse = result.timelineEvents.find((event) => event.displayLabel === "Education Savings Used for Living Needs");
const educationDepletion = result.timelineEvents.find((event) => event.displayLabel === "Education Savings Depleted");
const retirementTap = result.timelineEvents.find((event) => event.displayLabel === "Retirement Assets Tapped");
const retirementDepletion = result.timelineEvents.find((event) => event.displayLabel === "Retirement Assets Depleted");
const homeEquityLastResort = result.timelineEvents.find((event) => event.displayLabel === "Home Equity Becomes Last Resort");

assert.equal(cashDepletion.monthOffset, 1, "cash depletion month should be cumulative");
assert.equal(emergencyDepletion.monthOffset, 3, "emergency depletion month should be cumulative");
assert.equal(educationUse.monthOffset, 4, "education use should begin after earlier liquid buckets");
assert.equal(educationDepletion.monthOffset, 7, "education depletion month should include its bucket amount");
assert.equal(retirementTap.monthOffset, 7, "retirement tap should begin after education is exhausted");
assert.equal(retirementDepletion.monthOffset, 13, "retirement depletion month should include its bucket amount");
assert.equal(homeEquityLastResort.monthOffset, 13, "home equity should be reached after retirement assets");
assert.equal(cashDepletion.date, "2030-02-15", "event date should be derived from death date plus month offset");
assert.equal(retirementDepletion.date, "2031-02-15", "later event date should be deterministic");
assert.ok(result.timelineEvents.every((event) => event.safeToRender), "events with value and burn evidence should be safe renderable");
assert.ok(result.depletionEvents.every((event) => event.eventType === EVENT_TYPES.bucketDepleted));

const crisisText = result.timelineEvents.map((event) => event.displayLabel).join(" | ").toLowerCase();
["foreclosure", "eviction", "credit crisis", "bankruptcy"].forEach((forbidden) => {
  assert.equal(crisisText.includes(forbidden), false, `${forbidden} should never be emitted by the resource waterfall helper`);
});

const earlyStop = buildIncomeImpactResourceWaterfall({
  resourceBuckets: [
    { id: "cash-only", family: FAMILIES.cash, startingValue: 1000 },
    { id: "education-later", family: FAMILIES.educationSavings, startingValue: 5000 }
  ],
  options: {
    monthlyBurnRate: 1000
  }
});
assert.equal(
  earlyStop.timelineEvents.some((event) => event.displayLabel === "Education Savings Used for Living Needs"),
  true,
  "education use should appear when the education bucket is reached"
);

const noEducation = buildIncomeImpactResourceWaterfall({
  resourceBuckets: [
    { id: "cash-only", family: FAMILIES.cash, startingValue: 1000 }
  ],
  options: {
    monthlyBurnRate: 1000
  }
});
assert.equal(
  noEducation.timelineEvents.some((event) => event.displayLabel.includes("Education Savings")),
  false,
  "education events should not appear without an education bucket"
);
assert.equal(
  noEducation.timelineEvents.some((event) => event.displayLabel.includes("Retirement Assets")),
  false,
  "retirement events should not appear without a retirement bucket"
);
assert.equal(
  noEducation.timelineEvents.some((event) => event.displayLabel.includes("Home Equity")),
  false,
  "home equity events should not appear without a home equity bucket"
);

const missingBurn = buildIncomeImpactResourceWaterfall({
  resourceBuckets: [
    { id: "cash", family: FAMILIES.cash, startingValue: 1000 }
  ]
});
assert.equal(missingBurn.depletionEvents.length, 0, "missing burn rate should not emit depletion events");
assert.equal(missingBurn.timelineEvents.length, 0, "missing burn rate should not emit timeline events");
assert.ok(
  missingBurn.warnings.some((warning) => warning.id === "missing-monthly-burn-rate"),
  "missing burn rate should produce a warning"
);
assert.equal(
  missingBurn.timelineEvents.some((event) => event.safeToRender),
  false,
  "no event should be safe renderable when timing evidence is missing"
);

const nonPositiveBurn = buildIncomeImpactResourceWaterfall({
  resourceBuckets: [
    { id: "cash", family: FAMILIES.cash, startingValue: 1000 }
  ],
  options: {
    monthlyBurnRate: 0
  }
});
assert.equal(nonPositiveBurn.depletionEvents.length, 0, "zero burn rate should not emit depletion events");
assert.ok(
  nonPositiveBurn.warnings.some((warning) => warning.id === "nonpositive-monthly-burn-rate"),
  "zero burn rate should produce a nonpositive burn warning"
);

const ambiguous = buildIncomeImpactResourceWaterfall({
  resourceBuckets: [
    { id: "mystery", label: "Mystery holdings", startingValue: 5000 },
    { id: "no-value", family: FAMILIES.cash }
  ],
  options: {
    monthlyBurnRate: 1000
  }
});
assert.ok(
  ambiguous.warnings.some((warning) => warning.id === "unknown-bucket-family"),
  "ambiguous bucket family should produce warnings"
);
assert.ok(
  ambiguous.warnings.some((warning) => warning.id === "missing-bucket-value"),
  "missing bucket value should produce warnings"
);

const aggregateOnly = buildIncomeImpactResourceWaterfall({
  scenario: {
    timelineFacts: {
      resourcesAfterObligations: 12000,
      monthsCovered: 12
    }
  }
});
assert.equal(aggregateOnly.buckets.length, 1, "aggregate-only resources should produce one conservative bucket");
assert.equal(aggregateOnly.buckets[0].family, FAMILIES.unknown, "aggregate-only resources should remain unclassified");
assert.ok(
  aggregateOnly.warnings.some((warning) => warning.id === "aggregate-resource-only"),
  "aggregate-only derivation should warn instead of inventing bucket categories"
);

const assetFactDerived = buildIncomeImpactResourceWaterfall({
  assetFacts: {
    assets: [
      { id: "checking", label: "Checking and savings", value: 1500 },
      { id: "college-529", label: "529 college plan", value: 2500 }
    ]
  },
  options: {
    monthlyBurnRate: 1000
  }
});
assert.deepEqual(
  assetFactDerived.buckets.map((bucket) => bucket.family),
  [FAMILIES.cash, FAMILIES.educationSavings],
  "best-effort assetFacts derivation should classify only clear bucket families"
);

const slopeDerived = buildIncomeImpactResourceWaterfall({
  resourceBuckets: [
    { id: "cash", family: FAMILIES.cash, startingValue: 1000 }
  ],
  postDeathSeries: {
    points: [
      { monthIndex: 0, endingResources: 3000 },
      { monthIndex: 2, endingResources: 1000 }
    ]
  }
});
assert.equal(slopeDerived.trace.burnRateSource, "postDeathSeries.points");
assert.equal(slopeDerived.timelineEvents[0].monthOffset, 1);

console.log("income-impact-resource-waterfall-check passed");
