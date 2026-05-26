#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const adapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-existing-coverage-adapter.js"
);
const coverageUtilsPath = path.join(
  repoRoot,
  "app",
  "features",
  "coverage",
  "coverage-policy-utils.js"
);
const enginePath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-engine.js"
);
const adapterSource = fs.readFileSync(adapterPath, "utf8");
const coverageUtilsSource = fs.readFileSync(coverageUtilsPath, "utf8");
const engineSource = fs.readFileSync(enginePath, "utf8");

function loadContext() {
  const context = {
    console,
    LensApp: {
      coverage: {},
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(coverageUtilsSource, context, { filename: coverageUtilsPath });
  vm.runInContext(engineSource, context, { filename: enginePath });
  vm.runInContext(adapterSource, context, { filename: adapterPath });
  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function warningCodes(result) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).map((warning) => warning.code);
}

function dataGapCodes(result) {
  return (Array.isArray(result?.dataGaps) ? result.dataGaps : []).map((gap) => gap.code);
}

function createNeedPoints(count, amount) {
  return Array.from({ length: count }, function (_, yearIndex) {
    return {
      yearIndex,
      date: `${2026 + yearIndex}-01-01`,
      age: 40 + yearIndex,
      needAmount: amount
    };
  });
}

function buildLayers(coveragePolicies, extra = {}) {
  const context = loadContext();
  return context.LensApp.lensAnalysis.buildExistingCoverageTimelineLayers({
    valuationDate: "2026-01-01",
    clientDateOfBirth: "1986-01-01",
    coveragePolicies,
    ...extra
  });
}

assert.doesNotMatch(adapterSource, /\bdocument\b/);
assert.doesNotMatch(adapterSource, /\blocalStorage\b/);
assert.doesNotMatch(adapterSource, /\bsessionStorage\b/);
assert.doesNotMatch(adapterSource, /\bquerySelector\b/);
assert.doesNotMatch(adapterSource, /household-wealth-projection|calculateHouseholdWealthProjection/);
assert.match(adapterSource, /coverageUtils\.normalizeCoveragePolicyRecord/);
assert.match(adapterSource, /coverageUtils\.classifyCoveragePolicy/);
assert.match(adapterSource, /coverageUtils\.getCoverageDeathBenefitAmount/);

const termResult = buildLayers([
  {
    id: "term-derived",
    coverageSource: "individual",
    policyType: "Term Life",
    faceAmount: "500000",
    effectiveDate: "2020-01-01",
    termLength: "20",
    status: "Active"
  }
]);
assert.equal(termResult.layers.length, 1);
assert.equal(termResult.layers[0].policyType, "term");
assert.equal(termResult.layers[0].source, "existing");
assert.equal(termResult.layers[0].startYearIndex, 0);
assert.equal(termResult.layers[0].endYearIndex, 14);
assert.equal(termResult.layers[0].endDate, "2040-01-01");
assert.equal(termResult.layers[0].deathBenefit, 500000);
assert.equal(termResult.layers[0].included, true);
assert.equal(termResult.layers[0].trace.sourcePolicyId, "term-derived");

const explicitExpiration = buildLayers([
  {
    id: "term-explicit",
    coverageSource: "individual",
    policyType: "Term Life",
    faceAmount: "300000",
    effectiveDate: "2020-01-01",
    termLength: "30",
    expirationDate: "2031-01-01",
    status: "in force"
  }
]);
assert.equal(explicitExpiration.layers[0].endYearIndex, 5);
assert.equal(explicitExpiration.layers[0].endDate, "2031-01-01");
assert.equal(explicitExpiration.layers[0].trace.dateAssumptions.endDateSource, "explicit-end-date");

const permanentResult = buildLayers([
  {
    id: "whole",
    policyType: "Whole Life",
    faceAmount: "250000",
    effectiveDate: "2022-01-01",
    status: "Active",
    currentCashValue: "12000"
  }
]);
assert.equal(permanentResult.layers[0].policyType, "wholeLife");
assert.equal(permanentResult.layers[0].endYearIndex, null);
assert.equal(permanentResult.layers[0].included, true);
assert.equal(permanentResult.layers[0].cashValue.displayOnly, true);
assert.ok(warningCodes(permanentResult).includes("cash-value-display-only"));

const universalResult = buildLayers([
  {
    id: "iul",
    policyType: "Indexed Universal Life",
    faceAmount: "200000",
    effectiveDate: "2022-01-01",
    status: "Active"
  }
]);
assert.equal(universalResult.layers[0].policyType, "universalLife");

const groupDefault = buildLayers([
  {
    id: "group-default",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    faceAmount: "150000",
    effectiveDate: "2021-01-01",
    status: "Active"
  }
], {
  defaultGroupCoverageEndAge: 65
});
assert.equal(groupDefault.layers[0].policyType, "groupLife");
assert.equal(groupDefault.layers[0].endAge, 65);
assert.equal(groupDefault.layers[0].endDate, "2051-01-01");
assert.equal(groupDefault.layers[0].endYearIndex, 25);
assert.ok(warningCodes(groupDefault).includes("group-coverage-end-defaulted"));
assert.equal(groupDefault.layers[0].trace.dateAssumptions.endDateSource, "default-group-end-age");

const invalidBenefit = buildLayers([
  {
    id: "missing-benefit",
    policyType: "Term Life",
    effectiveDate: "2020-01-01",
    termLength: "20",
    status: "Active"
  }
]);
assert.equal(invalidBenefit.layers.length, 0);
assert.ok(dataGapCodes(invalidBenefit).includes("missing-death-benefit"));
assert.equal(invalidBenefit.trace.skippedPolicies[0].policyId, "missing-benefit");

const lapsedResult = buildLayers([
  {
    id: "lapsed",
    policyType: "Term Life",
    faceAmount: "500000",
    effectiveDate: "2020-01-01",
    termLength: "20",
    status: "Lapsed"
  }
]);
assert.equal(lapsedResult.layers[0].included, false);
assert.ok(warningCodes(lapsedResult).includes("inactive-policy-excluded"));

const pendingResult = buildLayers([
  {
    id: "pending",
    policyType: "Term Life",
    faceAmount: "500000",
    effectiveDate: "2027-01-01",
    termLength: "20",
    status: "Pending"
  }
]);
assert.equal(pendingResult.layers[0].included, false);
assert.ok(warningCodes(pendingResult).includes("pending-policy-excluded"));

const groupUnknown = buildLayers([
  {
    id: "group-unknown",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    faceAmount: "100000",
    effectiveDate: "2021-01-01",
    status: "Active"
  }
]);
assert.equal(groupUnknown.layers[0].included, false);
assert.ok(dataGapCodes(groupUnknown).includes("group-coverage-end-unknown"));

const originalPolicies = [
  {
    id: "no-mutation",
    policyType: "Term Life",
    faceAmount: "100000",
    effectiveDate: "2020-01-01",
    termLength: "20",
    status: "Active"
  }
];
const originalClone = cloneJson(originalPolicies);
buildLayers(originalPolicies);
assert.deepEqual(originalPolicies, originalClone);

const integrationContext = loadContext();
const adapter = integrationContext.LensApp.lensAnalysis.buildExistingCoverageTimelineLayers;
const calculateTimeline = integrationContext.LensApp.lensAnalysis.calculateCoverageTimeline;
const adapted = adapter({
  valuationDate: "2026-01-01",
  clientDateOfBirth: "1986-01-01",
  coveragePolicies: [
    {
      id: "integrated-term",
      policyType: "Term Life",
      faceAmount: "300000",
      effectiveDate: "2020-01-01",
      termLength: "20",
      status: "Active"
    }
  ]
});
const timeline = calculateTimeline({
  valuationDate: "2026-01-01",
  horizonYears: 3,
  cadence: "annual",
  client: {
    currentAge: 40
  },
  needPoints: createNeedPoints(4, 500000),
  policyLayers: adapted.layers
});
assert.equal(timeline.points[0].existingCoverageAmount, 300000);
assert.equal(timeline.points[0].hypotheticalCoverageAmount, 0);
assert.equal(timeline.points[0].coverageGap, 200000);

assert.equal(adapted.trace.utilityReuse.coveragePolicyUtils.normalizeCoveragePolicyRecord, true);
assert.equal(adapted.trace.utilityReuse.coveragePolicyUtils.classifyCoveragePolicy, true);
assert.equal(adapted.trace.utilityReuse.coveragePolicyUtils.getCoverageDeathBenefitAmount, true);
assert.equal(adapted.trace.utilityReuse.householdWealthProjection, "not-imported-coverage-layer-math-owner-is-coverage-timeline");

console.log("coverage timeline existing coverage adapter check passed");
