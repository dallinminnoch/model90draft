#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const composerPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-gap-surplus-composer.js"
);
const composerSource = fs.readFileSync(composerPath, "utf8");

function loadComposer() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(composerSource, context, { filename: composerPath });
  return context.LensApp.lensAnalysis.buildCoverageStrategyGapSurplus;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.code);
}

const buildCoverageStrategyGapSurplus = loadComposer();
assert.equal(typeof buildCoverageStrategyGapSurplus, "function", "composer should export buildCoverageStrategyGapSurplus");

assert.doesNotMatch(composerSource, /\bdocument\b/);
assert.doesNotMatch(composerSource, /\blocalStorage\b/);
assert.doesNotMatch(composerSource, /\bsessionStorage\b/);
assert.doesNotMatch(composerSource, /\bquerySelector\b/);
assert.doesNotMatch(composerSource, /coverage-strategy-page/);
assert.doesNotMatch(composerSource, /calculateHouseholdSurvivorRunway|income-loss-impact|survivor-runway/i);
assert.doesNotMatch(composerSource, /\bnetWorth\b/);
assert.doesNotMatch(composerSource, /proposedCoverageAmount|recommendationScore|strategyScore/i);

const needPoints = [
  { yearIndex: 0, date: "2026-01-01", calendarYear: 2026, age: 40, needAmount: 1000000 },
  { yearIndex: 1, date: "2027-01-01", calendarYear: 2027, age: 41, needAmount: 800000 },
  { yearIndex: 2, date: "2028-01-01", calendarYear: 2028, age: 42, needAmount: 500000 }
];
const resourcePoints = [
  { yearIndex: 2, date: "2028-01-01", calendarYear: 2028, age: 42, resourceAmount: 300000 },
  { yearIndex: 0, date: "2026-01-01", calendarYear: 2026, age: 40, resourceAmount: 200000 },
  { yearIndex: 1, date: "2027-01-01", calendarYear: 2027, age: 41, resourceAmount: 300000 }
];
const existingCoveragePoints = [
  { yearIndex: 1, existingCoverageAmount: 600000 },
  { yearIndex: 0, existingCoverageAmount: 500000 },
  { yearIndex: 2, existingCoverageAmount: 300000 }
];
const originalNeedPoints = cloneJson(needPoints);
const originalResourcePoints = cloneJson(resourcePoints);
const originalExistingCoveragePoints = cloneJson(existingCoveragePoints);

const result = buildCoverageStrategyGapSurplus({
  needPoints,
  resourcePoints,
  existingCoveragePoints,
  valuationDate: "2026-01-01"
});

assert.deepEqual(needPoints, originalNeedPoints, "composer must not mutate need points");
assert.deepEqual(resourcePoints, originalResourcePoints, "composer must not mutate resource points");
assert.deepEqual(existingCoveragePoints, originalExistingCoveragePoints, "composer must not mutate existing coverage points");
assert.equal(result.status, "complete");
assert.equal(result.cadence, "annual");
assert.equal(result.gapSurplusPoints.length, 3);

assert.deepEqual(
  result.gapSurplusPoints.map((point) => point.yearIndex),
  [0, 1, 2],
  "composer should follow Need Line order while aligning supporting lines by yearIndex"
);
assert.equal(result.gapSurplusPoints[0].needAmount, 1000000);
assert.equal(result.gapSurplusPoints[0].resourceAmount, 200000);
assert.equal(result.gapSurplusPoints[0].existingCoverageAmount, 500000);
assert.equal(result.gapSurplusPoints[0].totalAvailableAmount, 700000);
assert.equal(result.gapSurplusPoints[0].remainingExposureAmount, 300000);
assert.equal(result.gapSurplusPoints[0].surplusAmount, 0);
assert.equal(result.gapSurplusPoints[0].coverageRatio, 0.7);
assert.equal(result.gapSurplusPoints[0].resourceRatio, 0.2);
assert.equal(result.gapSurplusPoints[0].existingCoverageRatio, 0.5);
assert.equal(result.gapSurplusPoints[0].status, "gap");

assert.equal(result.gapSurplusPoints[1].totalAvailableAmount, 900000);
assert.equal(result.gapSurplusPoints[1].remainingExposureAmount, 0);
assert.equal(result.gapSurplusPoints[1].surplusAmount, 100000);
assert.equal(result.gapSurplusPoints[1].status, "surplus");

assert.equal(result.gapSurplusPoints[2].totalAvailableAmount, 600000);
assert.equal(result.gapSurplusPoints[2].remainingExposureAmount, 0);
assert.equal(result.gapSurplusPoints[2].surplusAmount, 100000);
assert.equal(result.gapSurplusPoints[2].status, "surplus");

assert.ok(
  result.gapSurplusPoints.every((point) => point.remainingExposureAmount >= 0 && point.surplusAmount >= 0),
  "gap and surplus should never be negative"
);
assert.equal(result.summary.currentRemainingExposure, 300000);
assert.equal(result.summary.finalRemainingExposure, 0);
assert.equal(result.summary.maxRemainingExposure, 300000);
assert.equal(result.summary.firstSurplusYear, 2027);
assert.equal(result.summary.firstFullyCoveredYear, 2027);
assert.equal(result.summary.yearsWithGap, 1);
assert.equal(result.summary.yearsWithSurplus, 2);
assert.equal(result.assumptionsUsed.resourcesAreSeparateInput, true);
assert.equal(result.assumptionsUsed.existingCoverageIsSeparateInput, true);
assert.equal(result.trace.coverageTimelineEngineReplaced, false);
assert.equal(result.trace.rawAggregateWealthUsed, false);
assert.equal(result.trace.incomeImpactRunwayUsed, false);
assert.equal(result.trace.proposedCoverageIncluded, false);
assert.equal(result.trace.recommendationScoringIncluded, false);

const noExistingCoverage = buildCoverageStrategyGapSurplus({
  needPoints: [{ yearIndex: 0, needAmount: 100000 }],
  resourcePoints: [{ yearIndex: 0, resourceAmount: 25000 }],
  existingCoveragePoints: []
});
assert.equal(noExistingCoverage.gapSurplusPoints[0].existingCoverageAmount, 0);
assert.equal(noExistingCoverage.gapSurplusPoints[0].remainingExposureAmount, 75000);
assert.equal(noExistingCoverage.gapSurplusPoints[0].trace.existingCoverageSource, "missing-or-no-coverage-treated-as-zero");

const missingResource = buildCoverageStrategyGapSurplus({
  needPoints: [{ yearIndex: 0, needAmount: 100000 }],
  resourcePoints: [],
  existingCoveragePoints: [{ yearIndex: 0, existingCoverageAmount: 25000 }]
});
assert.ok(issueCodes(missingResource.dataGaps).includes("missing-resource-points"));
assert.ok(issueCodes(missingResource.gapSurplusPoints[0].warnings).includes("missing-resource-amount"));
assert.equal(missingResource.gapSurplusPoints[0].resourceAmount, 0);
assert.equal(missingResource.gapSurplusPoints[0].remainingExposureAmount, 75000);

const missingNeed = buildCoverageStrategyGapSurplus({
  needPoints: [{ yearIndex: 0 }],
  resourcePoints: [{ yearIndex: 0, resourceAmount: 100000 }],
  existingCoveragePoints: [{ yearIndex: 0, existingCoverageAmount: 100000 }]
});
assert.equal(missingNeed.status, "partial");
assert.equal(missingNeed.gapSurplusPoints[0].status, "unknown");
assert.equal(missingNeed.gapSurplusPoints[0].coverageRatio, null);
assert.ok(issueCodes(missingNeed.gapSurplusPoints[0].dataGaps).includes("missing-need-amount"));

const indexFallback = buildCoverageStrategyGapSurplus({
  needPoints: [{ needAmount: 100000 }],
  resourcePoints: [{ resourceAmount: 10000 }],
  existingCoveragePoints: [{ existingCoverageAmount: 15000 }]
});
assert.equal(indexFallback.gapSurplusPoints[0].yearIndex, 0);
assert.ok(issueCodes(indexFallback.warnings).includes("need-year-index-missing-index-alignment"));
assert.ok(issueCodes(indexFallback.warnings).includes("resource-year-index-missing-index-alignment"));
assert.ok(issueCodes(indexFallback.warnings).includes("existing-coverage-year-index-missing-index-alignment"));

const layerDerived = buildCoverageStrategyGapSurplus({
  needPoints: [
    { yearIndex: 0, needAmount: 500000 },
    { yearIndex: 1, needAmount: 500000 },
    { yearIndex: 3, needAmount: 500000 }
  ],
  resourcePoints: [
    { yearIndex: 0, resourceAmount: 100000 },
    { yearIndex: 1, resourceAmount: 100000 },
    { yearIndex: 3, resourceAmount: 100000 }
  ],
  existingCoverageLayers: [
    {
      id: "existing-term",
      source: "existing",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 1,
      deathBenefit: 250000,
      included: true
    }
  ]
});
assert.ok(issueCodes(layerDerived.warnings).includes("existing-coverage-points-derived-from-layers"));
assert.equal(layerDerived.gapSurplusPoints[0].existingCoverageAmount, 250000);
assert.equal(layerDerived.gapSurplusPoints[1].existingCoverageAmount, 250000);
assert.equal(layerDerived.gapSurplusPoints[2].existingCoverageAmount, 0);

console.log("coverage strategy gap surplus composer check passed");
