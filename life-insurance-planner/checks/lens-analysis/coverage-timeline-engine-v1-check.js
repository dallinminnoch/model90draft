#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const enginePath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-engine.js"
);
const engineSource = fs.readFileSync(enginePath, "utf8");

function loadEngine() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(engineSource, context, { filename: enginePath });
  return context.LensApp.lensAnalysis.calculateCoverageTimeline;
}

function warningCodes(result) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).map((warning) => warning.code);
}

function eventTypes(result) {
  return (Array.isArray(result?.events) ? result.events : []).map((event) => event.type);
}

function contribution(point, layerId) {
  return point.layerContributions.find((entry) => entry.layerId === layerId);
}

function createNeedPoints(count, amount = 500000) {
  return Array.from({ length: count }, function (_, index) {
    return {
      yearIndex: index,
      age: 40 + index,
      date: `${2026 + index}-01-01`,
      needAmount: amount,
      trace: {
        source: "coverage-timeline-engine-check"
      }
    };
  });
}

function runScenario(overrides = {}) {
  const calculateCoverageTimeline = loadEngine();
  return calculateCoverageTimeline({
    valuationDate: "2026-01-01",
    horizonYears: 5,
    cadence: "annual",
    client: {
      currentAge: 40
    },
    needPoints: createNeedPoints(6, 500000),
    policyLayers: [],
    ...overrides
  });
}

assert.doesNotMatch(engineSource, /\bdocument\b/);
assert.doesNotMatch(engineSource, /\blocalStorage\b/);
assert.doesNotMatch(engineSource, /\bsessionStorage\b/);
assert.doesNotMatch(engineSource, /\bquerySelector\b/);
assert.doesNotMatch(engineSource, /income-loss-impact-display|step-three-analysis-display/);
assert.match(engineSource, /module\.exports/);

const levelTerm = runScenario({
  policyLayers: [
    {
      id: "existing-term",
      source: "existing",
      name: "Existing Term",
      policyType: "term",
      startYearIndex: 1,
      endYearIndex: 3,
      deathBenefit: 300000
    }
  ]
});
assert.equal(levelTerm.status, "complete");
assert.equal(contribution(levelTerm.points[0], "existing-term").amount, 0);
assert.equal(contribution(levelTerm.points[1], "existing-term").amount, 300000);
assert.equal(contribution(levelTerm.points[3], "existing-term").amount, 300000);
assert.equal(contribution(levelTerm.points[4], "existing-term").amount, 0);
assert.equal(levelTerm.points[2].existingCoverageAmount, 300000);
assert.equal(levelTerm.points[2].hypotheticalCoverageAmount, 0);

const decreasing = runScenario({
  policyLayers: [
    {
      id: "decreasing-term",
      source: "hypothetical",
      policyType: "decreasingTerm",
      startYearIndex: 0,
      endYearIndex: 4,
      deathBenefit: 400000
    }
  ]
});
assert.equal(contribution(decreasing.points[0], "decreasing-term").amount, 400000);
assert.equal(contribution(decreasing.points[1], "decreasing-term").amount, 300000);
assert.equal(contribution(decreasing.points[2], "decreasing-term").amount, 200000);
assert.equal(contribution(decreasing.points[3], "decreasing-term").amount, 100000);
assert.equal(contribution(decreasing.points[4], "decreasing-term").amount, 0);
assert.ok(eventTypes(decreasing).includes("decreasing-term-reaches-zero"));

const permanent = runScenario({
  policyLayers: [
    {
      id: "whole-life",
      source: "existing",
      policyType: "wholeLife",
      startYearIndex: 2,
      deathBenefit: 250000
    }
  ]
});
assert.equal(contribution(permanent.points[1], "whole-life").amount, 0);
assert.equal(contribution(permanent.points[2], "whole-life").amount, 250000);
assert.equal(contribution(permanent.points[5], "whole-life").amount, 250000);

const separatedSources = runScenario({
  policyLayers: [
    {
      id: "existing",
      source: "existing",
      policyType: "wholeLife",
      startYearIndex: 0,
      deathBenefit: 100000
    },
    {
      id: "hypothetical",
      source: "hypothetical",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 5,
      deathBenefit: 200000
    },
    {
      id: "recommended",
      source: "recommended",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 5,
      deathBenefit: 50000
    },
    {
      id: "excluded",
      source: "hypothetical",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 5,
      deathBenefit: 900000,
      included: false
    }
  ]
});
assert.equal(separatedSources.points[0].existingCoverageAmount, 100000);
assert.equal(separatedSources.points[0].hypotheticalCoverageAmount, 200000);
assert.equal(separatedSources.points[0].recommendedCoverageAmount, 50000);
assert.equal(separatedSources.points[0].totalCoverageAmount, 350000);
assert.equal(contribution(separatedSources.points[0], "excluded").amount, 0);
assert.equal(separatedSources.summary.includedLayerCount, 3);

const gapAndSurplus = runScenario({
  needPoints: createNeedPoints(6, 300000),
  policyLayers: [
    {
      id: "layer",
      source: "existing",
      policyType: "wholeLife",
      startYearIndex: 0,
      deathBenefit: 400000
    }
  ]
});
assert.equal(gapAndSurplus.points[0].coverageGap, 0);
assert.equal(gapAndSurplus.points[0].surplusCoverage, 100000);
assert.equal(gapAndSurplus.summary.peakSurplus, 100000);
assert.equal(gapAndSurplus.summary.gapCoveredPercentOverall, 100);
assert.ok(eventTypes(gapAndSurplus).includes("surplus-begins"));

const gapFormula = runScenario({
  needPoints: createNeedPoints(6, 500000),
  policyLayers: [
    {
      id: "layer",
      source: "existing",
      policyType: "wholeLife",
      startYearIndex: 0,
      deathBenefit: 125000
    }
  ]
});
assert.equal(gapFormula.points[0].coverageGap, 375000);
assert.equal(gapFormula.points[0].surplusCoverage, 0);
assert.ok(eventTypes(gapFormula).includes("coverage-gap-begins"));

const cliff = runScenario({
  needPoints: createNeedPoints(6, 500000),
  policyLayers: [
    {
      id: "short-term",
      source: "existing",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 2,
      deathBenefit: 500000
    }
  ]
});
assert.ok(eventTypes(cliff).includes("policy-expires"));
assert.ok(eventTypes(cliff).includes("coverage-cliff"));
assert.ok(eventTypes(cliff).includes("coverage-gap-begins"));
assert.equal(cliff.summary.largestCoverageCliff, 500000);

const traceScenario = runScenario({
  policyLayers: [
    {
      id: "trace-layer",
      source: "hypothetical",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 5,
      deathBenefit: 100000
    }
  ]
});
assert.equal(traceScenario.points[0].layerContributions[0].layerId, "trace-layer");
assert.equal(traceScenario.points[0].layerContributions[0].source, "hypothetical");
assert.equal(traceScenario.points[0].layerContributions[0].policyType, "term");
assert.equal(traceScenario.trace.needSource, "supplied-need-points");
assert.equal(traceScenario.trace.normalizedLayerCount, 1);

const invalidInputs = runScenario({
  needPoints: [],
  policyLayers: [
    {
      id: "bad",
      source: "existing",
      policyType: "term",
      startYearIndex: 0,
      endYearIndex: 5,
      deathBenefit: -1
    },
    {
      id: "group-missing-end",
      source: "existing",
      policyType: "groupLife",
      startYearIndex: 0,
      deathBenefit: 100000
    },
    {
      id: "custom-missing-schedule",
      source: "hypothetical",
      policyType: "custom",
      startYearIndex: 0
    }
  ]
});
assert.equal(invalidInputs.status, "partial");
assert.ok(invalidInputs.dataGaps.some((gap) => gap.code === "missing-need-points"));
assert.ok(warningCodes(invalidInputs).includes("invalid-death-benefit"));
assert.ok(warningCodes(invalidInputs).includes("group-life-missing-end"));
assert.ok(warningCodes(invalidInputs).includes("custom-layer-missing-schedule"));
assert.equal(contribution(invalidInputs.points[0], "custom-missing-schedule").amount, 0);

const customSchedule = runScenario({
  policyLayers: [
    {
      id: "custom",
      source: "hypothetical",
      policyType: "custom",
      startYearIndex: 0,
      benefitSchedule: [
        { yearIndex: 0, amount: 100000 },
        { yearIndex: 2, amount: 50000 }
      ]
    }
  ]
});
assert.equal(contribution(customSchedule.points[0], "custom").amount, 100000);
assert.equal(contribution(customSchedule.points[1], "custom").amount, 0);
assert.equal(contribution(customSchedule.points[2], "custom").amount, 50000);

console.log("coverage timeline engine v1 check passed");
