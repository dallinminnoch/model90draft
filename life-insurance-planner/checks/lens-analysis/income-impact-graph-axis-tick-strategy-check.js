#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadGraphModel() {
  const source = readRepoFile("app/features/lens-analysis/income-impact-timeline-graph-model.js");
  const sandbox = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, {
    filename: "income-impact-timeline-graph-model.js"
  });
  return {
    source,
    buildIncomeImpactTimelineGraphModel: sandbox.LensApp.lensAnalysis.buildIncomeImpactTimelineGraphModel
  };
}

function loadDisplayHarness() {
  const source = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactAxisTickHarness = { renderTimeline };\n})(window);\n"
  );
  const sandbox = {
    console,
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      }
    },
    Intl,
    URL,
    URLSearchParams,
    window: {
      LensApp: {}
    }
  };
  vm.runInNewContext(instrumentedSource, sandbox, {
    filename: "income-loss-impact-display.js"
  });
  return {
    source,
    harness: sandbox.window.__incomeImpactAxisTickHarness
  };
}

function formatDate(date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function addRelativeMonths(dateValue, months) {
  const source = new Date(`${dateValue}T00:00:00`);
  if (Math.abs(months) < 1) {
    source.setDate(source.getDate() + Math.round(months * 30.4375));
    return formatDate(source);
  }
  const wholeMonths = Math.round(months);
  source.setMonth(source.getMonth() + wholeMonths);
  return formatDate(source);
}

function makeScenario(config) {
  const deathDate = "2031-04-29";
  const points = config.points.map(function (point) {
    return {
      date: addRelativeMonths(deathDate, point.month),
      monthIndex: point.month,
      endingResources: point.value,
      accumulatedUnmetNeed: point.value < 0 ? Math.abs(point.value) : 0
    };
  });
  const depletion = config.depletionMonth == null
    ? {
      depleted: false,
      monthsCovered: null,
      depletionMonthIndex: null
    }
    : {
      depleted: true,
      depletionDate: addRelativeMonths(deathDate, config.depletionMonth),
      monthsCovered: config.depletionMonth,
      depletionMonthIndex: config.depletionMonth
    };
  return {
    status: "complete",
    scenario: {
      valuationDate: "2026-04-29",
      selectedDeathDate: deathDate,
      selectedDeathAge: 51,
      projectionHorizonMonths: config.projectionHorizonMonths || 480
    },
    preDeathSeries: {
      mode: "forward-projection",
      precision: "monthly",
      points: [],
      targetPoint: {
        date: deathDate,
        endingAssets: config.assetsBeforeDeath || 500000
      }
    },
    deathEvent: {
      date: deathDate,
      age: 51,
      assetsBeforeDeath: config.assetsBeforeDeath || 500000,
      survivorAvailableTreatedAssets: config.startResources,
      coverageAdded: 0,
      immediateObligations: 0,
      resourcesAfterObligations: config.startResources,
      layer2: {
        resources: {
          totalResourcesBeforeObligations: config.startResources
        }
      }
    },
    postDeathSeries: {
      points,
      depletion
    },
    timelineFacts: {
      assetsBeforeDeath: config.assetsBeforeDeath || 500000,
      survivorAvailableTreatedAssets: config.startResources,
      resourcesAfterObligations: config.startResources,
      depletionDate: depletion.depletionDate || null,
      monthsCovered: depletion.monthsCovered,
      accumulatedUnmetNeed: points.reduce(function (max, point) {
        return Math.max(max, point.accumulatedUnmetNeed || 0);
      }, 0)
    },
    warnings: [],
    dataGaps: []
  };
}

function buildModel(buildIncomeImpactTimelineGraphModel, id, scenario) {
  return buildIncomeImpactTimelineGraphModel({
    appliedScenarios: [
      {
        scenarioId: id,
        label: id,
        settings: {
          selectedDeathAge: 51,
          selectedDeathDate: scenario.scenario.selectedDeathDate,
          projectionHorizonYears: 40,
          mortgageTreatmentOverride: "followAssumptions",
          lifestyleSliderValue: 0,
          autoCompressBaselineEnabled: false
        },
        scenario,
        riskEvaluation: {
          events: [],
          stableEvents: [],
          warnings: [],
          dataGaps: []
        }
      }
    ],
    selectedScenarioId: id,
    options: {
      preserveSignedResources: true,
      currentAgeMode: "death-event-only"
    }
  });
}

function getLabels(ticks) {
  return ticks.map(function (tick) {
    return tick.label;
  });
}

function getValues(ticks) {
  return ticks.map(function (tick) {
    return tick.value;
  });
}

function assertNoDuplicateLabels(ticks, message) {
  const labels = getLabels(ticks).filter(Boolean);
  assert.equal(new Set(labels).size, labels.length, message);
}

function assertNoExactRunoutAnchorTick(frame, depletionMonth, message) {
  const target = Number(depletionMonth);
  assert.ok(Number.isFinite(target), `${message}: test depletion month should be finite.`);
  const matchingTick = frame.xTicks.find(function (tick) {
    return tick && tick.key !== "death" && Math.abs(Number(tick.relativeMonths) - target) <= 0.000001;
  });
  assert.equal(matchingTick, undefined, `${message}: x-axis ticks should not include the exact runout/depletion anchor.`);
}

function assertIncludesZeroAndDeficitContext(frame, message) {
  const values = getValues(frame.yTicks);
  assert.ok(values.some(function (value) { return Math.abs(value) <= 0.000001; }), `${message}: y ticks should include zero.`);
  if (frame.yDomain.min < 0) {
    assert.ok(values.some(function (value) { return value < 0; }), `${message}: y ticks should include below-zero context.`);
  }
}

function assertRunwayGeometryStillSigned(model, message) {
  const runway = model.series.appliedRunwayScenarios[0];
  assert.ok(runway.depletionPoint, `${message}: runout/depletion marker source should remain available.`);
  assert.ok(runway.runwayLinePoints.some(function (point) {
    return Math.abs(point.value || 0) <= 0.000001;
  }), `${message}: runway line should retain the explicit zero anchor.`);
  assert.ok(runway.runwayLinePoints.some(function (point) {
    return point.value < 0;
  }), `${message}: runway line should retain below-zero continuation.`);
}

const { source: modelSource, buildIncomeImpactTimelineGraphModel } = loadGraphModel();
const { source: displaySource, harness } = loadDisplayHarness();
assert.match(modelSource, /getAdaptiveGraphViewFrameXTickMonths/);
assert.match(modelSource, /makeGraphViewFrameYTicks/);
assert.match(displaySource, /makeAxesFromGraphViewFrame/);

const cases = {
  day: makeScenario({
    startResources: 6000,
    depletionMonth: 0.15,
    projectionHorizonMonths: 12,
    points: [
      { month: 0.1, value: 2000 },
      { month: 0.2, value: -2000 },
      { month: 1, value: -26000 }
    ]
  }),
  underSixMonths: makeScenario({
    startResources: 15000,
    depletionMonth: 2.666666,
    projectionHorizonMonths: 24,
    points: [
      { month: 1, value: 10000 },
      { month: 2, value: 5000 },
      { month: 3, value: -2500 },
      { month: 6, value: -17500 }
    ]
  }),
  medium: makeScenario({
    startResources: 90000,
    depletionMonth: 27,
    projectionHorizonMonths: 120,
    points: [
      { month: 12, value: 50000 },
      { month: 24, value: 10000 },
      { month: 30, value: -10000 },
      { month: 42, value: -50000 }
    ]
  }),
  long: makeScenario({
    startResources: 600000,
    depletionMonth: 160,
    projectionHorizonMonths: 480,
    points: [
      { month: 60, value: 400000 },
      { month: 120, value: 200000 },
      { month: 180, value: -100000 },
      { month: 240, value: -300000 }
    ]
  }),
  neverDepletes: makeScenario({
    startResources: 500000,
    depletionMonth: null,
    projectionHorizonMonths: 480,
    points: [
      { month: 120, value: 350000 },
      { month: 240, value: 200000 },
      { month: 480, value: 100000 }
    ]
  })
};

const dayModel = buildModel(buildIncomeImpactTimelineGraphModel, "day-scale", cases.day);
const dayFrame = dayModel.viewFrames.postDeathFocus;
assert.equal(dayFrame.xTicks[0].label, "Death");
assert.ok(getLabels(dayFrame.xTicks).some(function (label) { return /\+\d+ days?/.test(label); }), "Day-scale focus frame should use day ticks.");
assertNoDuplicateLabels(dayFrame.xTicks, "Day-scale x tick labels should not duplicate.");
assertNoExactRunoutAnchorTick(dayFrame, 0.15, "Day-scale focus frame");
assertIncludesZeroAndDeficitContext(dayFrame, "Day-scale focus frame");
assertRunwayGeometryStillSigned(dayModel, "Day-scale model");

const underSixModel = buildModel(buildIncomeImpactTimelineGraphModel, "under-six-months", cases.underSixMonths);
const underSixFrame = underSixModel.viewFrames.postDeathFocus;
assertNoDuplicateLabels(underSixFrame.xTicks, "Under-six-month x tick labels should not duplicate.");
assert.ok(getLabels(underSixFrame.xTicks).includes("+1 mo"), "Under-six-month frame should include monthly context.");
assert.ok(getLabels(underSixFrame.xTicks).some(function (label) { return label === "+2 mo" || label === "+3 mo"; }), "Under-six-month frame should include useful month spacing near runout.");
assertNoExactRunoutAnchorTick(underSixFrame, 2.666666, "Under-six-month focus frame");
assertIncludesZeroAndDeficitContext(underSixFrame, "Under-six-month focus frame");
assertRunwayGeometryStillSigned(underSixModel, "Under-six-month model");

const mediumModel = buildModel(buildIncomeImpactTimelineGraphModel, "medium-runway", cases.medium);
const mediumFrame = mediumModel.viewFrames.postDeathFocus;
assertNoDuplicateLabels(mediumFrame.xTicks, "Medium runway x tick labels should not duplicate.");
assert.ok(mediumFrame.xTicks.length >= 6, "A 1-3 year focused frame should have enough x ticks to orient the user.");
assert.ok(getLabels(mediumFrame.xTicks).includes("+1 year"), "Medium runway should include one-year context.");
assert.ok(getLabels(mediumFrame.xTicks).includes("+2 years"), "Medium runway should include two-year context.");
assert.ok(!getLabels(mediumFrame.xTicks).includes("+2.3 years"), "Medium runway should not include the exact runout month as a special x-axis tick.");
assertNoExactRunoutAnchorTick(mediumFrame, 27, "Medium focus frame");
assertIncludesZeroAndDeficitContext(mediumFrame, "Medium focus frame");
assertRunwayGeometryStillSigned(mediumModel, "Medium model");

const longModel = buildModel(buildIncomeImpactTimelineGraphModel, "long-runway", cases.long);
const longFrame = longModel.viewFrames.postDeathFocus;
assertNoDuplicateLabels(longFrame.xTicks, "Long runway x tick labels should not duplicate.");
assert.ok(longFrame.xTicks.length >= 4 && longFrame.xTicks.length <= 12, "A 10+ year frame should remain readable.");
assert.ok(getLabels(longFrame.xTicks).some(function (label) { return /\+\d+ years/.test(label); }), "Long runway should use year labels.");
assertNoExactRunoutAnchorTick(longFrame, 160, "Long focus frame");
assertIncludesZeroAndDeficitContext(longFrame, "Long focus frame");
assertRunwayGeometryStillSigned(longModel, "Long model");

const neverModel = buildModel(buildIncomeImpactTimelineGraphModel, "never-depletes", cases.neverDepletes);
const neverFrame = neverModel.viewFrames.postDeathFocus;
assertNoDuplicateLabels(neverFrame.xTicks, "Never-depletes x tick labels should not duplicate.");
assert.ok(neverFrame.xTicks.length >= 4 && neverFrame.xTicks.length <= 8, "Never-depletes long frame should remain readable.");
assert.ok(getValues(neverFrame.yTicks).some(function (value) { return Math.abs(value) <= 0.000001; }), "Never-depletes y ticks should still include zero.");

const rendered = harness.renderTimeline({
  status: "complete",
  graphViewMode: "postDeathFocus",
  graphModel: mediumModel,
  scenario: cases.medium,
  transitionOutlook: {
    status: "Stable",
    windowMonths: 3
  },
  financialStoryline: {
    majorStoryCandidates: [],
    graphDotCandidates: []
  },
  warnings: [],
  dataGaps: [],
  timelineFacts: cases.medium.timelineFacts
});
assert.match(rendered, /data-income-impact-active-view-frame-mode="postDeathFocus"/);
assert.match(rendered, /data-income-impact-view-frame-owner="graph-model"/);
getLabels(mediumFrame.xTicks).forEach(function (label) {
  assert.match(rendered, new RegExp(`data-income-impact-graph-x-tick-label="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
});

console.log("income-impact-graph-axis-tick-strategy-check passed");
