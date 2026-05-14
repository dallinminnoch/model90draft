#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const context = {
  LensApp: {
    lensAnalysis: {}
  },
  console
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: absolutePath });
  return source;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRawBaselineScenario(overrides = {}) {
  const points = overrides.points || [
    {
      monthIndex: 0,
      date: "2031-01-01",
      survivorNeeds: 4000,
      netUse: 3500,
      endingResources: 100000,
      availableResources: 100000,
      accumulatedUnmetNeed: 0
    },
    {
      monthIndex: 2,
      date: "2031-03-01",
      survivorNeeds: 4000,
      netUse: 3500,
      endingResources: 80000,
      availableResources: 80000,
      accumulatedUnmetNeed: 0
    },
    {
      monthIndex: 4,
      date: "2031-05-01",
      survivorNeeds: 4000,
      netUse: 3500,
      endingResources: -1000,
      availableResources: 0,
      accumulatedUnmetNeed: 1000
    }
  ];
  return {
    scenario: {
      projectionHorizonMonths: overrides.projectionHorizonMonths ?? 120
    },
    postDeathSeries: {
      points,
      summary: {
        totalSurvivorNeeds: points.reduce((total, point) => total + point.survivorNeeds, 0),
        totalNetUse: points.reduce((total, point) => total + point.netUse, 0),
        accumulatedUnmetNeed: points[points.length - 1].accumulatedUnmetNeed
      },
      depletion: overrides.depletion || {
        depleted: true,
        depletionDate: "2031-05-01",
        depletionMonthIndex: 4,
        monthsCovered: 4,
        precision: "monthly"
      }
    },
    timelineFacts: {
      depletionDate: "2031-05-01",
      monthsCovered: 4,
      accumulatedUnmetNeed: 1000
    },
    trace: {
      source: "fixture-raw-baseline"
    }
  };
}

function makeInput(overrides = {}) {
  const rawBaselineScenario = overrides.rawBaselineScenario || makeRawBaselineScenario(overrides.scenarioOverrides);
  return {
    rawBaselineScenario,
    postDeathSeries: overrides.postDeathSeries || rawBaselineScenario.postDeathSeries,
    compressionPolicy: Object.prototype.hasOwnProperty.call(overrides, "compressionPolicy")
      ? overrides.compressionPolicy
      : {
          source: "fixture-policy",
          currentMonthlySurvivorNeed: 4000,
          conservativeMonthlySurvivorNeed: 3400,
          currentSliderValue: 0,
          conservativeSliderValue: -100
        },
    options: Object.assign({
      projectionHorizonMonths: 120
    }, overrides.options || {})
  };
}

const helperSource = loadScript("app/features/lens-analysis/income-impact-auto-compressed-baseline-calculations.js");
const displaySource = fs.readFileSync(
  path.join(repoRoot, "app/features/lens-analysis/income-loss-impact-display.js"),
  "utf8"
);
const calculations = context.LensApp.lensAnalysis.incomeImpactAutoCompressedBaselineCalculations;
const directHelper = context.LensApp.lensAnalysis.buildIncomeImpactAutoCompressedBaseline;

assert.ok(calculations, "auto-compressed baseline namespace should load");
assert.equal(typeof calculations.buildIncomeImpactAutoCompressedBaseline, "function", "helper export should exist");
assert.equal(typeof directHelper, "function", "direct helper export should exist");
assert.doesNotMatch(helperSource, /document\.|querySelector|localStorage|sessionStorage/, "helper should stay pure and browser-free");

const input = makeInput();
const before = cloneJson(input);
const result = calculations.buildIncomeImpactAutoCompressedBaseline(input);
assert.deepEqual(input, before, "raw baseline input should not be mutated");
assert.equal(result.version, "income-impact-auto-compressed-baseline-v1");
assert.equal(result.status, "ready");
assert.equal(result.rawBaselineMutated, false);
assert.equal(result.trace.rawBaselineMutated, false);
assert.equal(result.trace.visibleBaselineReplacement, false);
assert.equal(result.trace.manualLifestyleComparisonPreserved, true);
assert.equal(result.compressionHorizon.source, "rawBaselineDepletionMonth");
assert.equal(result.compressionHorizon.months, 4);
assert.equal(result.compressionPath.formula, "linear-monthly-slider-ramp");
assert.equal(result.compressionPath.startSliderValue, 0);
assert.equal(result.compressionPath.endSliderValue, -100);
assert.equal(result.autoCompressedScenario.kind, "autoCompressedBaseline");
assert.notStrictEqual(result.autoCompressedScenario, input.rawBaselineScenario, "derived scenario should be a new object");
assert.equal(input.rawBaselineScenario.postDeathSeries.points[2].survivorNeeds, 4000, "raw baseline values should be preserved");

const adjustedPoints = result.autoCompressedScenario.postDeathSeries.points;
assert.equal(adjustedPoints[0].autoCompressionSliderValue, 0, "ramp should start at current lifestyle");
assert.equal(adjustedPoints[0].monthlyHouseholdExpenseDelta, 0, "month zero should preserve current spending");
assert.equal(adjustedPoints[1].autoCompressionSliderValue, -50, "ramp should linearly interpolate by month");
assert.equal(adjustedPoints[1].monthlyHouseholdExpenseDelta, -300, "halfway month should apply half conservative delta");
assert.equal(adjustedPoints[2].autoCompressionSliderValue, -100, "ramp should end at conservative lifestyle");
assert.equal(adjustedPoints[2].monthlyHouseholdExpenseDelta, -600, "horizon month should apply full conservative delta");
assert.equal(adjustedPoints[2].endingResources, -100, "cumulative spending reduction should improve resources deterministically");
assert.equal(adjustedPoints[2].accumulatedUnmetNeed, 100);
assert.equal(result.autoCompressedScenario.timelineFacts.monthsCovered, 4);

const repeated = calculations.buildIncomeImpactAutoCompressedBaseline(input);
assert.deepEqual(repeated, result, "helper output should be deterministic");

const noDepletionScenario = makeRawBaselineScenario({
  points: [
    { monthIndex: 0, date: "2031-01-01", survivorNeeds: 4000, netUse: 3500, endingResources: 100000 },
    { monthIndex: 6, date: "2031-07-01", survivorNeeds: 4000, netUse: 3500, endingResources: 70000 }
  ],
  depletion: {
    depleted: false,
    depletionDate: null,
    depletionMonthIndex: null,
    monthsCovered: 6,
    precision: "monthly"
  }
});
const fallback = calculations.buildIncomeImpactAutoCompressedBaseline(makeInput({
  rawBaselineScenario: noDepletionScenario,
  options: { projectionHorizonMonths: 12 }
}));
assert.equal(fallback.status, "ready");
assert.equal(fallback.compressionHorizon.source, "projectionHorizon");
assert.equal(fallback.compressionHorizon.months, 12);

const immediate = calculations.buildIncomeImpactAutoCompressedBaseline(makeInput({
  scenarioOverrides: {
    depletion: {
      depleted: true,
      depletionDate: "2031-01-01",
      depletionMonthIndex: 0,
      monthsCovered: 0,
      precision: "monthly"
    }
  }
}));
assert.equal(immediate.status, "not-applicable");
assert.equal(immediate.compressionHorizon.source, "immediateDepletion");
assert.equal(immediate.compressionHorizon.months, 0);
assert.ok(immediate.warnings.some((warning) => warning.code === "immediate-depletion-no-gradual-runway"));
assert.equal(immediate.autoCompressedScenario, null);

const missingPolicy = calculations.buildIncomeImpactAutoCompressedBaseline(makeInput({
  compressionPolicy: {}
}));
assert.equal(missingPolicy.status, "insufficient-data");
assert.ok(missingPolicy.warnings.some((warning) => warning.code === "missing-conservative-lifestyle-target"));
assert.equal(missingPolicy.autoCompressedScenario, null);

const invalidPolicy = calculations.buildIncomeImpactAutoCompressedBaseline(makeInput({
  compressionPolicy: {
    monthlyDeltaAtConservative: 100
  }
}));
assert.equal(invalidPolicy.status, "insufficient-data");
assert.ok(invalidPolicy.warnings.some((warning) => warning.code === "invalid-conservative-lifestyle-target"));

const clamped = calculations.buildIncomeImpactAutoCompressedBaseline(makeInput({
  compressionPolicy: {
    monthlyDeltaAtConservative: -600,
    currentSliderValue: 50,
    conservativeSliderValue: -250
  }
}));
assert.equal(clamped.autoCompressedScenario.postDeathSeries.points[0].autoCompressionSliderValue, 0, "current lifestyle should be clamped to zero");
assert.equal(clamped.autoCompressedScenario.postDeathSeries.points[2].autoCompressionSliderValue, -100, "conservative target should be clamped to -100");

const disabled = calculations.buildIncomeImpactAutoCompressedBaseline(makeInput({
  options: {
    autoCompressionEnabled: false
  }
}));
assert.equal(disabled.status, "not-applicable");
assert.equal(disabled.autoCompressionEnabled, false);
assert.equal(disabled.autoCompressedScenario, null);
assert.ok(disabled.warnings.some((warning) => warning.code === "auto-compression-disabled"));

assert.match(
  displaySource,
  /autoCompressBaselineEnabled:\s*\(sourceControls\.autoCompressBaselineEnabled\s*\?\?\s*scenarioState\.autoCompressBaselineEnabled\)\s*!==\s*false/,
  "scenario controls should default autoCompressBaselineEnabled to true"
);
assert.match(
  displaySource,
  /scenarioState\.autoCompressBaselineEnabled\s*=\s*controls\.autoCompressBaselineEnabled\s*!==\s*false/,
  "runtime scenario state should sync autoCompressBaselineEnabled independently"
);
assert.match(
  displaySource,
  /lifestyleSliderValue:\s*clampLifestyleSliderValue\(safeSettings\.lifestyleSliderValue\),\s*autoCompressBaselineEnabled:\s*safeSettings\.autoCompressBaselineEnabled\s*!==\s*false/s,
  "settings key should keep auto-compression independent from manual lifestyle slider"
);
assert.match(
  displaySource,
  /autoCompressBaselineEnabled:\s*true,\s*bannerCollapsed:\s*false/s,
  "initial scenario state should default autoCompressBaselineEnabled to true"
);
assert.doesNotMatch(
  displaySource,
  /buildIncomeImpactAutoCompressedBaseline\(/,
  "foundation pass should not make the graph or display use the auto-compressed scenario yet"
);

console.log("income-impact-auto-compressed-baseline-check passed");
