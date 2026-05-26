#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-hypothetical-policy-layer-helper.js"
);
const enginePath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-engine.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");
const engineSource = fs.readFileSync(enginePath, "utf8");

function loadContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(engineSource, context, { filename: enginePath });
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context;
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

function runTimeline(layers, needAmount = 500000) {
  const context = loadContext();
  return context.LensApp.lensAnalysis.calculateCoverageTimeline({
    valuationDate: "2026-01-01",
    horizonYears: 5,
    cadence: "annual",
    client: {
      currentAge: 40
    },
    needPoints: createNeedPoints(6, needAmount),
    policyLayers: layers
  });
}

function warningCodes(result) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).map((warning) => warning.code);
}

function dataGapCodes(result) {
  return (Array.isArray(result?.dataGaps) ? result.dataGaps : []).map((gap) => gap.code);
}

function contribution(point, layerId) {
  return point.layerContributions.find((entry) => entry.layerId === layerId);
}

assert.doesNotMatch(helperSource, /\bdocument\b/);
assert.doesNotMatch(helperSource, /\blocalStorage\b/);
assert.doesNotMatch(helperSource, /\bsessionStorage\b/);
assert.doesNotMatch(helperSource, /\bquerySelector\b/);
assert.doesNotMatch(helperSource, /income-loss-impact|step-three-analysis-display/);
assert.match(helperSource, /module\.exports/);

const context = loadContext();
const helper = context.LensApp.lensAnalysis;

const term = helper.buildHypotheticalPolicyLayer({
  id: "level-term",
  name: "20 Year Term",
  policyType: "term",
  startYearIndex: 1,
  durationYears: 3,
  deathBenefit: 300000,
  premium: {
    amount: 1200,
    mode: "annual"
  }
});
assert.equal(term.layer.source, "hypothetical");
assert.equal(term.layer.policyType, "term");
assert.equal(term.layer.startYearIndex, 1);
assert.equal(term.layer.endYearIndex, 4);
assert.equal(term.layer.deathBenefit, 300000);
assert.equal(term.layer.included, true);
assert.equal(term.layer.premium.displayOnly, true);
assert.equal(term.layer.premium.mode, "annual");
assert.ok(warningCodes(term).includes("premium-display-only"));
const termTimeline = runTimeline([term.layer]);
assert.equal(contribution(termTimeline.points[0], "level-term").amount, 0);
assert.equal(contribution(termTimeline.points[1], "level-term").amount, 300000);
assert.equal(contribution(termTimeline.points[4], "level-term").amount, 300000);
assert.equal(contribution(termTimeline.points[5], "level-term").amount, 0);

const decreasing = helper.buildHypotheticalPolicyLayer({
  id: "decreasing",
  policyType: "decreasingTerm",
  startYearIndex: 0,
  durationYears: 4,
  initialDeathBenefit: 400000,
  finalDeathBenefit: 0
});
assert.equal(decreasing.layer.policyType, "decreasingTerm");
assert.deepEqual(
  JSON.parse(JSON.stringify(decreasing.layer.benefitSchedule.map((point) => point.amount))),
  [400000, 300000, 200000, 100000, 0]
);
assert.equal(decreasing.layer.trace.benefitScheduleMode, "linear-decreasing");
const decreasingTimeline = runTimeline([decreasing.layer]);
assert.equal(contribution(decreasingTimeline.points[0], "decreasing").amount, 400000);
assert.equal(contribution(decreasingTimeline.points[1], "decreasing").amount, 300000);
assert.equal(contribution(decreasingTimeline.points[2], "decreasing").amount, 200000);
assert.equal(contribution(decreasingTimeline.points[3], "decreasing").amount, 100000);
assert.equal(contribution(decreasingTimeline.points[4], "decreasing").amount, 0);

const badDecrease = helper.buildHypotheticalPolicyLayer({
  id: "bad-decrease",
  policyType: "decreasingTerm",
  startYearIndex: 0,
  durationYears: 5,
  initialDeathBenefit: 100000,
  finalDeathBenefit: 200000
});
assert.ok(warningCodes(badDecrease).includes("decreasing-final-benefit-greater-than-initial"));

const permanent = helper.buildHypotheticalPolicyLayer({
  id: "permanent-base",
  policyType: "wholeLife",
  startYearIndex: 2,
  deathBenefit: 150000,
  cashValue: {
    amount: 10000,
    projectedValues: [{ yearIndex: 5, amount: 14000 }]
  }
});
assert.equal(permanent.layer.cashValue.displayOnly, true);
assert.ok(warningCodes(permanent).includes("cash-value-display-only"));
const permanentTimeline = runTimeline([permanent.layer]);
assert.equal(contribution(permanentTimeline.points[1], "permanent-base").amount, 0);
assert.equal(contribution(permanentTimeline.points[2], "permanent-base").amount, 150000);
assert.equal(contribution(permanentTimeline.points[5], "permanent-base").amount, 150000);

const universal = helper.buildHypotheticalPolicyLayer({
  id: "ul",
  policyType: "universal life",
  startYearIndex: 0,
  deathBenefit: 125000
});
assert.equal(universal.layer.policyType, "universalLife");

const excluded = helper.buildHypotheticalPolicyLayer({
  id: "excluded",
  policyType: "term",
  startYearIndex: 0,
  durationYears: 5,
  deathBenefit: 900000,
  included: false
});
assert.equal(excluded.layer.included, false);
const excludedTimeline = runTimeline([excluded.layer]);
assert.equal(contribution(excludedTimeline.points[0], "excluded").amount, 0);

const custom = helper.buildHypotheticalPolicyLayer({
  id: "custom-good",
  policyType: "custom",
  startYearIndex: 0,
  benefitSchedule: [
    { yearIndex: 0, amount: 100000 },
    { yearIndex: 2, amount: 50000 },
    { yearIndex: 5, amount: 25000 }
  ]
});
assert.equal(custom.layer.policyType, "custom");
assert.equal(custom.layer.included, true);
const customTimeline = runTimeline([custom.layer]);
assert.equal(contribution(customTimeline.points[0], "custom-good").amount, 100000);
assert.equal(contribution(customTimeline.points[1], "custom-good").amount, 0);
assert.equal(contribution(customTimeline.points[2], "custom-good").amount, 50000);
assert.equal(contribution(customTimeline.points[5], "custom-good").amount, 25000);

const customBad = helper.buildHypotheticalPolicyLayer({
  id: "custom-bad",
  policyType: "custom",
  startYearIndex: 0
});
assert.equal(customBad.layer.included, false);
assert.ok(dataGapCodes(customBad).includes("custom-schedule-missing"));
const customBadTimeline = runTimeline([customBad.layer]);
assert.equal(contribution(customBadTimeline.points[0], "custom-bad").amount, 0);

const invalidTerm = helper.buildHypotheticalPolicyLayer({
  policyType: "term",
  startYearIndex: 0
});
assert.equal(invalidTerm.layer.included, false);
assert.ok(warningCodes(invalidTerm).includes("missing-id-name"));
assert.ok(dataGapCodes(invalidTerm).includes("missing-death-benefit"));
assert.ok(dataGapCodes(invalidTerm).includes("missing-duration-end"));

const groupMissingEnd = helper.buildHypotheticalPolicyLayer({
  id: "group",
  policyType: "groupLife",
  startYearIndex: 0,
  deathBenefit: 50000
});
assert.equal(groupMissingEnd.layer.included, false);
assert.ok(dataGapCodes(groupMissingEnd).includes("missing-duration-end"));

const groupWithEnd = helper.buildHypotheticalPolicyLayer({
  id: "group-with-end",
  policyType: "groupLife",
  startYearIndex: 0,
  endYearIndex: 2,
  deathBenefit: 50000
});
assert.equal(groupWithEnd.layer.included, true);
assert.equal(groupWithEnd.layer.endYearIndex, 2);

const batch = helper.buildHypotheticalPolicyLayers([
  term.layer,
  permanent.layer,
  customBad.layer
]);
assert.equal(batch.layers.length, 3);
assert.equal(batch.trace.inputCount, 3);
assert.equal(batch.trace.layerCount, 3);
assert.equal(batch.trace.includedCount, 2);

assert.equal(term.layer.trace.sourceInputId, "level-term");
assert.equal(term.layer.trace.normalizedPolicyType, "term");
assert.equal(term.layer.trace.startEndAssumptions.endSource, "startYearIndex-plus-durationYears");
assert.equal(term.layer.trace.premiumTreatment, "display-only-not-modeled");
assert.equal(permanent.layer.trace.cashValueTreatment, "display-only-not-modeled");

const closingLayer = helper.buildHypotheticalPolicyLayer({
  id: "close-gap",
  policyType: "term",
  startYearIndex: 0,
  durationYears: 2,
  deathBenefit: 500000
}).layer;
const closingTimeline = runTimeline([closingLayer], 500000);
assert.equal(closingTimeline.points[0].coverageGap, 0);
assert.equal(closingTimeline.points[1].coverageGap, 0);
assert.equal(closingTimeline.points[3].coverageGap, 500000);

console.log("coverage timeline hypothetical policy layer helper check passed");
