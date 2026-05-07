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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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

function makeScenario(yearsOut) {
  const currentAge = 46;
  const selectedDeathAge = currentAge + yearsOut;
  const deathYear = 2026 + yearsOut;
  const selectedDeathDate = `${deathYear}-04-29`;
  const preDeathPoints = [];
  const monthCount = yearsOut * 12;
  for (let index = 1; index <= monthCount; index += 1) {
    const date = new Date(2026, 3 + index, 29);
    preDeathPoints.push({
      date: [
        String(date.getFullYear()).padStart(4, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-"),
      monthIndex: index,
      endingAssets: 500000 + (index * 1200),
      sourcePaths: ["layer1.points"]
    });
  }

  return {
    status: "complete",
    scenario: {
      valuationDate: "2026-04-29",
      selectedDeathDate,
      selectedDeathAge,
      projectionHorizonMonths: 480
    },
    preDeathSeries: {
      mode: yearsOut === 0 ? "current-point-only" : "forward-projection",
      precision: "monthly",
      points: yearsOut === 0 ? [] : preDeathPoints,
      targetPoint: {
        date: selectedDeathDate,
        endingAssets: 500000 + (monthCount * 1200)
      }
    },
    deathEvent: {
      date: selectedDeathDate,
      age: selectedDeathAge,
      assetsBeforeDeath: 500000 + (monthCount * 1200),
      survivorAvailableTreatedAssets: 420000 + (monthCount * 800),
      coverageAdded: 400000,
      immediateObligations: 100000,
      resourcesAfterObligations: 720000 + (monthCount * 800),
      layer2: {
        resources: {
          totalResourcesBeforeObligations: 820000 + (monthCount * 800)
        }
      }
    },
    postDeathSeries: {
      points: [
        {
          date: `${deathYear + 1}-04-29`,
          monthIndex: 12,
          endingResources: 650000 + (monthCount * 800),
          sourcePaths: ["layer3.points"]
        },
        {
          date: `${deathYear + 10}-04-29`,
          monthIndex: 120,
          endingResources: 100000 + (monthCount * 200),
          sourcePaths: ["layer3.points"]
        },
        {
          date: `${deathYear + 15}-04-29`,
          monthIndex: 180,
          endingResources: -150000,
          sourcePaths: ["layer3.points"]
        }
      ],
      depletion: {
        depleted: true,
        depletionDate: `${deathYear + 12}-04-29`,
        monthsCovered: 144
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 500000 + (monthCount * 1200),
      survivorAvailableTreatedAssets: 420000 + (monthCount * 800),
      coverageAdded: 400000,
      resourcesAfterObligations: 720000 + (monthCount * 800),
      depletionDate: `${deathYear + 12}-04-29`,
      monthsCovered: 144,
      accumulatedUnmetNeed: 150000
    },
    warnings: [],
    dataGaps: []
  };
}

const { source, buildIncomeImpactTimelineGraphModel } = loadGraphModel();
assert.equal(typeof buildIncomeImpactTimelineGraphModel, "function");
assert.doesNotMatch(source, /scenarioTimeline|financialRunway|income-loss-impact-timeline-calculations|household-financial-position|income-impact-warning-events-library/);
assert.doesNotMatch(source, /RUNWAY_CHART_|renderFinancialRunwayChart|buildRunwayChartModel/);
assert.doesNotMatch(source, /localStorage|sessionStorage|document\.|querySelector|<svg|<path|<circle/);
assert.doesNotMatch(source, /height.*500000|500000.*height|dynamic.*height/i);

const riskEvaluation = {
  events: [
    {
      id: "survivor-resources-depleted",
      ruleId: "survivor-resources-depleted",
      category: "runway",
      severity: "critical",
      title: "Survivor resources depleted",
      summary: "Resources deplete inside the selected horizon.",
      date: "2038-04-29",
      monthIndex: 144,
      phase: "postDeath",
      evidence: [
        {
          path: "timelineFacts.monthsCovered",
          value: 144
        }
      ],
      sourcePaths: ["timelineFacts.monthsCovered"]
    },
    {
      id: "data-quality",
      ruleId: "major-composer-data-gaps",
      category: "dataQuality",
      severity: "caution",
      title: "Data quality",
      summary: "Review the missing facts.",
      phase: "dataQuality",
      evidence: []
    }
  ],
  stableEvents: [
    {
      id: "coverage-added-at-death",
      ruleId: "coverage-added-at-death",
      category: "coverage",
      severity: "stable",
      title: "Coverage added at death",
      summary: "Coverage enters at the death event.",
      phase: "deathEvent",
      evidence: [
        {
          path: "deathEvent.coverageAdded",
          value: 400000
        }
      ],
      sourcePaths: ["deathEvent.coverageAdded"]
    }
  ],
  warnings: [],
  dataGaps: []
};

const fiveYearScenario = makeScenario(5);
const fiveYearInput = {
  scenario: cloneJson(fiveYearScenario),
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
};
const fiveYearInputBefore = cloneJson(fiveYearInput);
const fiveYearModel = buildIncomeImpactTimelineGraphModel(fiveYearInput);
assert.deepEqual(fiveYearInput, fiveYearInputBefore, "Graph model should not mutate composer or risk outputs.");
assert.deepEqual(
  buildIncomeImpactTimelineGraphModel(cloneJson(fiveYearInput)),
  fiveYearModel,
  "Graph model output should be unchanged when comparisonScenarios is absent."
);
assert.equal(fiveYearModel.status, "complete");
assert.equal(fiveYearModel.trace.calculationMethod, "income-impact-timeline-graph-model-v1");
assert.equal(fiveYearModel.trace.noFinancialCalculationsPerformed, true);
assert.equal(fiveYearModel.trace.noFakePoints, true);
assert.equal(fiveYearModel.series.preDeathAssets.length, fiveYearScenario.preDeathSeries.points.length);
assert.equal(fiveYearModel.series.preDeathAssets[0].value, fiveYearScenario.preDeathSeries.points[0].endingAssets);
assert.equal(
  fiveYearModel.series.preDeathAssets.at(-1).value,
  fiveYearScenario.preDeathSeries.points.at(-1).endingAssets
);
assert.deepEqual(
  cloneJson(fiveYearModel.series.deathTransition.map(function (stage) { return stage.value; })),
  [
    fiveYearScenario.deathEvent.assetsBeforeDeath,
    fiveYearScenario.deathEvent.survivorAvailableTreatedAssets,
    fiveYearScenario.deathEvent.layer2.resources.totalResourcesBeforeObligations,
    fiveYearScenario.deathEvent.resourcesAfterObligations
  ]
);
assert.equal(fiveYearModel.series.postDeathResources.length, fiveYearScenario.postDeathSeries.points.length);
assert.equal(fiveYearModel.series.postDeathResources[0].value, fiveYearScenario.postDeathSeries.points[0].endingResources);
assert.equal(fiveYearModel.axes.y.signed, true);
assert.ok(fiveYearModel.axes.y.zeroYRatio > 0 && fiveYearModel.axes.y.zeroYRatio < 1);
assert.equal(fiveYearModel.markers.filter(function (marker) { return marker.kind === "risk"; }).length, 2);
assert.equal(fiveYearModel.markers.filter(function (marker) { return marker.kind === "stable"; }).length, 1);
assert.equal(
  fiveYearModel.markers.find(function (marker) { return marker.ruleId === "major-composer-data-gaps"; }).positionable,
  false,
  "Data-quality events without dates should stay panel-only."
);
assert.equal(
  fiveYearModel.markers.find(function (marker) { return marker.ruleId === "coverage-added-at-death"; }).positionable,
  true,
  "Death-event stable coverage marker should be positionable."
);
assert.ok(fiveYearModel.selectedEvent);
assert.ok(fiveYearModel.callouts.some(function (callout) { return callout.id === "resources-after-obligations"; }));
assert.doesNotThrow(function () {
  JSON.stringify(fiveYearModel);
});
assert.equal(
  Object.prototype.hasOwnProperty.call(fiveYearModel.series, "comparisonPostDeathResources"),
  false,
  "Comparison series should not be emitted without explicit comparisonScenarios input."
);
assert.deepEqual(cloneJson(fiveYearModel.comparisonMarkers), [], "Comparison markers should be empty without a complete compression comparison scenario.");

const comparisonScenario = {
  scenarioId: "income-impact-expense-compression-alternate",
  kind: "compression",
  pathId: "compression-post-death-resources",
  label: "Immediate compression",
  reductionsApplied: [
    {
      typeKey: "diningOutRestaurants",
      label: "Dining Out",
      monthlyAmount: 240
    }
  ],
  pausesApplied: [
    {
      typeKey: "retirementContributions",
      label: "Retirement Contributions",
      monthlyAmount: 500
    }
  ],
  postDeathSeries: {
    points: [
      {
        date: `${2032}-04-29`,
        monthIndex: 12,
        endingResources: 760000,
        sourcePaths: ["compressionScenario.postDeathSeries.points"]
      },
      {
        date: `${2040}-04-29`,
        monthIndex: 108,
        endingResources: 260000,
        sourcePaths: ["compressionScenario.postDeathSeries.points"]
      },
      {
        date: `${2048}-04-29`,
        monthIndex: 204,
        endingResources: -20000,
        sourcePaths: ["compressionScenario.postDeathSeries.points"]
      }
    ],
    depletion: {
      depleted: true,
      depletionDate: `${2048}-04-29`,
      depletionMonthIndex: 204,
      monthsCovered: 204
    },
    summary: {
      accumulatedUnmetNeed: 20000
    }
  },
  depletion: {
    depleted: true,
    depletionDate: `${2048}-04-29`,
    depletionMonthIndex: 204,
    monthsCovered: 204
  },
  accumulatedUnmetNeed: 20000,
  trace: {
    baseScenarioMutated: false
  }
};
const comparisonInput = Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [cloneJson(comparisonScenario)]
});
const comparisonInputBefore = cloneJson(comparisonInput);
const comparisonModel = buildIncomeImpactTimelineGraphModel(comparisonInput);
assert.deepEqual(comparisonInput, comparisonInputBefore, "Graph model should not mutate comparisonScenarios.");
assert.equal(comparisonModel.series.comparisonPostDeathResources.length, 1);
assert.equal(comparisonModel.series.comparisonPostDeathResources[0].scenarioId, comparisonScenario.scenarioId);
assert.equal(comparisonModel.series.comparisonPostDeathResources[0].kind, "compression");
assert.equal(comparisonModel.series.comparisonPostDeathResources[0].pathId, "compression-post-death-resources");
assert.deepEqual(
  cloneJson(comparisonModel.series.comparisonPostDeathResources[0].points.map(function (point) { return point.value; })),
  cloneJson(comparisonScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Comparison path should map completed alternate postDeathSeries values."
);
assert.deepEqual(
  cloneJson(comparisonModel.series.postDeathResources.map(function (point) { return point.value; })),
  cloneJson(fiveYearModel.series.postDeathResources.map(function (point) { return point.value; })),
  "Base postDeathResources source values should remain unchanged with comparison input."
);
assert.equal(comparisonModel.markers.length, fiveYearModel.markers.length, "Comparison input should not create graph markers.");
assert.equal(comparisonModel.markers.some(function (marker) { return marker.kind === "compression"; }), false, "Compression markers must stay out of existing risk/stable markers.");
assert.equal(comparisonModel.comparisonMarkers.length, 5, "Complete compression comparison scenario should emit separate comparison markers.");
assert.deepEqual(
  cloneJson(comparisonModel.comparisonMarkers.map(function (marker) { return marker.markerType; }).sort()),
  [
    "baseDepletion",
    "compressionAction",
    "compressionDepletion",
    "pauseAction",
    "shortfallRemains"
  ],
  "Comparison markers should cover action, pause, depletion, and remaining shortfall events."
);
assert.equal(
  comparisonModel.comparisonMarkers.filter(function (marker) { return marker.markerType === "baseDepletion" || marker.markerType === "compressionDepletion"; }).length,
  2,
  "Base depletion and compressed depletion should remain separate markers."
);
assert.ok(comparisonModel.comparisonMarkers.every(function (marker) { return marker.positionable && marker.kind === "compression" && marker.lane === "comparison"; }));
assert.ok(comparisonModel.comparisonMarkers.every(function (marker) { return marker.xRatio != null && marker.yRatio != null; }));
assert.equal(comparisonModel.trace.comparisonScenariosEnabled, true);
assert.equal(comparisonModel.trace.comparisonScenarioCount, 1);
assert.equal(comparisonModel.trace.baseSeriesUnchanged, true);
assert.equal(comparisonModel.trace.comparisonMarkersCreated, true);
assert.equal(comparisonModel.trace.comparisonMarkerCount, 5);

const stagedComparisonScenario = {
  scenarioId: "income-impact-staged-expense-compression-alternate",
  kind: "stagedCompression",
  pathId: "staged-compression-post-death-resources",
  label: "Staged compression",
  reductionsApplied: [
    {
      typeKey: "diningOutRestaurants",
      label: "Dining Out",
      monthlyAmount: 240,
      stageId: "immediate-discretionary-compression",
      effectiveMonthAfterDeath: 1
    },
    {
      typeKey: "groceries",
      label: "Groceries",
      monthlyAmount: 100,
      stageId: "groceries-protected-flexible-compression",
      effectiveMonthAfterDeath: 9
    }
  ],
  pausesApplied: [
    {
      typeKey: "retirementContributions",
      label: "Retirement Contributions",
      monthlyAmount: 500,
      stageId: "contribution-pauses",
      effectiveMonthAfterDeath: 2
    }
  ],
  stageEvents: [
    {
      stageId: "immediate-discretionary-compression",
      stageName: "Immediate discretionary compression",
      stageType: "reduction",
      stageOrder: 1,
      effectiveMonthAfterDeath: 1,
      actionsApplied: [{ typeKey: "diningOutRestaurants" }]
    },
    {
      stageId: "contribution-pauses",
      stageName: "Contribution pauses",
      stageType: "pause",
      stageOrder: 2,
      effectiveMonthAfterDeath: 2,
      actionsApplied: [{ typeKey: "retirementContributions" }]
    },
    {
      stageId: "flexible-essentials-compression",
      stageName: "Flexible essentials compression",
      stageType: "reduction",
      stageOrder: 4,
      effectiveMonthAfterDeath: 6,
      actionsApplied: []
    },
    {
      stageId: "groceries-protected-flexible-compression",
      stageName: "Groceries and protected flexible compression",
      stageType: "reduction",
      stageOrder: 5,
      effectiveMonthAfterDeath: 9,
      actionsApplied: [{ typeKey: "groceries" }]
    }
  ],
  postDeathSeries: {
    points: [
      {
        date: `${2032}-04-29`,
        monthIndex: 1,
        endingResources: 750000,
        sourcePaths: ["stagedCompressionScenario.postDeathSeries.points"]
      },
      {
        date: `${2032}-05-29`,
        monthIndex: 2,
        endingResources: 744000,
        sourcePaths: ["stagedCompressionScenario.postDeathSeries.points"]
      },
      {
        date: `${2033}-01-29`,
        monthIndex: 9,
        endingResources: 710000,
        sourcePaths: ["stagedCompressionScenario.postDeathSeries.points"]
      },
      {
        date: `${2048}-04-29`,
        monthIndex: 204,
        endingResources: -50000,
        sourcePaths: ["stagedCompressionScenario.postDeathSeries.points"]
      }
    ],
    depletion: {
      depleted: true,
      depletionDate: `${2048}-04-29`,
      depletionMonthIndex: 204,
      monthsCovered: 204
    },
    summary: {
      accumulatedUnmetNeed: 50000
    }
  },
  depletion: {
    depleted: true,
    depletionDate: `${2048}-04-29`,
    depletionMonthIndex: 204,
    monthsCovered: 204
  },
  accumulatedUnmetNeed: 50000,
  trace: {
    baseScenarioMutated: false,
    finalCumulativeMonthlyRelief: 840
  }
};

const multiComparisonInput = Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [cloneJson(comparisonScenario), cloneJson(stagedComparisonScenario)]
});
const multiComparisonInputBefore = cloneJson(multiComparisonInput);
const multiComparisonModel = buildIncomeImpactTimelineGraphModel(multiComparisonInput);
assert.deepEqual(multiComparisonInput, multiComparisonInputBefore, "Graph model should not mutate multiple comparisonScenarios.");
assert.equal(multiComparisonModel.series.comparisonPostDeathResources.length, 2, "Graph model should support multiple comparison paths.");
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources.map(function (series) { return series.pathId; })),
  ["compression-post-death-resources", "staged-compression-post-death-resources"],
  "Immediate and staged comparison paths should keep distinct graph path ids."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources.map(function (series) { return series.pathMode; })),
  ["smooth", "step"],
  "Staged comparison paths should carry graph-ready step rendering metadata while immediate paths stay smooth."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources[0].points.map(function (point) { return point.value; })),
  cloneJson(comparisonScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Immediate comparison values should remain unchanged when staged comparison is added."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources[1].points.map(function (point) { return point.value; })),
  cloneJson(stagedComparisonScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Staged comparison values should map from staged postDeathSeries."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.postDeathResources.map(function (point) { return point.value; })),
  cloneJson(fiveYearModel.series.postDeathResources.map(function (point) { return point.value; })),
  "Base postDeathResources source values should remain unchanged with multiple comparison paths."
);
assert.equal(
  multiComparisonModel.comparisonMarkers.some(function (marker) {
    return marker.scenarioId === stagedComparisonScenario.scenarioId
      && marker.label === "Groceries step down"
      && marker.monthIndex === 9;
  }),
  true,
  "Staged comparison markers should use staged event timing."
);
assert.equal(
  multiComparisonModel.comparisonMarkers.some(function (marker) {
    return marker.scenarioId === stagedComparisonScenario.scenarioId
      && marker.label === "Essentials compressed";
  }),
  false,
  "Stages without applied actions should not emit staged graph markers."
);
assert.ok(
  multiComparisonModel.comparisonMarkers.some(function (marker) {
    return marker.scenarioId === stagedComparisonScenario.scenarioId
      && marker.label === "Lifestyle cuts"
      && marker.monthIndex === 1;
  }),
  "Staged discretionary action markers should use short graph-native labels at the actual stage month."
);
assert.ok(
  multiComparisonModel.comparisonMarkers.some(function (marker) {
    return marker.scenarioId === stagedComparisonScenario.scenarioId
      && marker.label === "Contributions paused"
      && marker.monthIndex === 2;
  }),
  "Staged pause markers should use short graph-native labels at the actual stage month."
);
assert.equal(
  multiComparisonModel.comparisonMarkers.filter(function (marker) { return marker.markerType === "baseDepletion"; }).length,
  1,
  "Base depletion should not be duplicated for multiple comparison scenarios."
);
assert.equal(multiComparisonModel.trace.comparisonScenarioCount, 2);
assert.equal(
  Object.prototype.hasOwnProperty.call(comparisonModel.series, "comparisonEarlyDetail"),
  false,
  "Early detail strip should not be created without both immediate and staged comparison paths."
);

function makeEarlyDetailScenario(scenarioId, kind, pathId, label, monthlyValueFactory) {
  return {
    scenarioId,
    kind,
    pathId,
    label,
    postDeathSeries: {
      points: Array.from({ length: 30 }, function (_, index) {
        const monthIndex = index + 1;
        return {
          date: `2032-${String(Math.min(monthIndex, 12)).padStart(2, "0")}-15`,
          monthIndex,
          endingResources: monthlyValueFactory(monthIndex),
          sourcePaths: [`${scenarioId}.postDeathSeries.points.${index}`]
        };
      })
    },
    depletion: {
      depleted: false,
      monthsCovered: 30
    },
    trace: {
      baseScenarioMutated: false
    }
  };
}

const earlyDetailImmediateScenario = makeEarlyDetailScenario(
  "income-impact-expense-compression-alternate-detail",
  "compression",
  "compression-post-death-resources",
  "Immediate compression",
  function (monthIndex) { return 500000 - (monthIndex * 4500); }
);
const earlyDetailStagedScenario = makeEarlyDetailScenario(
  "income-impact-staged-expense-compression-alternate-detail",
  "stagedCompression",
  "staged-compression-post-death-resources",
  "Staged compression",
  function (monthIndex) {
    const stagedLag = monthIndex < 9 ? monthIndex * 630 : 5040;
    return 500000 - (monthIndex * 4500) - stagedLag;
  }
);
const earlyDetailInput = Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [cloneJson(earlyDetailImmediateScenario), cloneJson(earlyDetailStagedScenario)]
});
const earlyDetailModel = buildIncomeImpactTimelineGraphModel(earlyDetailInput);
const earlyDetail = earlyDetailModel.series.comparisonEarlyDetail;
assert.ok(earlyDetail, "Graph model should create an early local-scale detail strip when immediate and staged comparisons overlap.");
assert.equal(earlyDetail.windowMonths, 24);
assert.equal(earlyDetail.points.length, 24, "Early detail should use the first 24 overlapping post-death months.");
assert.deepEqual(
  cloneJson(earlyDetail.points.filter(function (point) {
    return [1, 2, 3, 6, 9, 12, 24].includes(point.monthIndex);
  }).map(function (point) {
    return {
      monthIndex: point.monthIndex,
      immediateEndingResources: point.immediateEndingResources,
      stagedEndingResources: point.stagedEndingResources,
      difference: point.difference
    };
  })),
  [
    { monthIndex: 1, immediateEndingResources: 495500, stagedEndingResources: 494870, difference: -630 },
    { monthIndex: 2, immediateEndingResources: 491000, stagedEndingResources: 489740, difference: -1260 },
    { monthIndex: 3, immediateEndingResources: 486500, stagedEndingResources: 484610, difference: -1890 },
    { monthIndex: 6, immediateEndingResources: 473000, stagedEndingResources: 469220, difference: -3780 },
    { monthIndex: 9, immediateEndingResources: 459500, stagedEndingResources: 454460, difference: -5040 },
    { monthIndex: 12, immediateEndingResources: 446000, stagedEndingResources: 440960, difference: -5040 },
    { monthIndex: 24, immediateEndingResources: 392000, stagedEndingResources: 386960, difference: -5040 }
  ],
  "Early detail should preserve actual immediate/staged values and differences at key months."
);
assert.ok(
  earlyDetail.yDomain.min > earlyDetailModel.axes.y.min && earlyDetail.yDomain.max < earlyDetailModel.axes.y.max,
  "Early detail should use a local y-domain rather than the main graph y-domain."
);
assert.equal(earlyDetail.trace.actualValuesOnly, true);
assert.equal(earlyDetail.trace.localScale, true);
assert.equal(earlyDetail.trace.usesMainGraphYDomain, false);
assert.equal(earlyDetail.trace.artificialOffsetApplied, false);
assert.equal(earlyDetailModel.trace.comparisonEarlyDetailCreated, true);
assert.equal(earlyDetailModel.trace.comparisonEarlyDetailArtificialOffsetApplied, false);

const invalidComparisonModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [
    {
      scenarioId: "blocked-or-incomplete",
      kind: "compression",
      postDeathSeries: {
        points: [
          {
            date: "2032-04-29",
            endingResources: 760000
          }
        ]
      }
    }
  ]
}));
assert.equal(
  Object.prototype.hasOwnProperty.call(invalidComparisonModel.series, "comparisonPostDeathResources"),
  false,
  "Blocked, partial, missing, or invalid comparison scenarios should not emit a comparison path."
);
assert.deepEqual(cloneJson(invalidComparisonModel.comparisonMarkers), [], "Invalid comparison scenarios should not emit comparison markers.");

const currentAgeModel = buildIncomeImpactTimelineGraphModel({
  scenario: makeScenario(0),
  riskEvaluation,
  options: {
    currentAgeMode: "death-event-only"
  }
});
assert.equal(currentAgeModel.series.preDeathAssets.length, 0);
assert.ok(currentAgeModel.series.currentAnchor);
assert.equal(currentAgeModel.series.deathTransition.length, 4);
assert.ok(
  currentAgeModel.callouts.some(function (callout) {
    return callout.id === "current-age-no-prior-trend"
      && /No prior modeled trend/.test(callout.value);
  }),
  "Current-age death should disclose that there is no prior modeled trend."
);

const twentyYearModel = buildIncomeImpactTimelineGraphModel({
  scenario: makeScenario(20),
  riskEvaluation,
  options: {}
});
assert.equal(twentyYearModel.series.preDeathAssets.length, 240);
assert.notEqual(
  twentyYearModel.series.deathTransition[0].value,
  fiveYearModel.series.deathTransition[0].value,
  "Different death ages should carry different composer-provided death resources into the graph model."
);
assert.equal(twentyYearModel.series.postDeathResources.length, 3);

const partialModel = buildIncomeImpactTimelineGraphModel({
  scenario: {
    status: "partial",
    scenario: {
      valuationDate: "2026-04-29",
      selectedDeathDate: "2026-04-29",
      selectedDeathAge: 46,
      projectionHorizonMonths: 480
    },
    preDeathSeries: {
      mode: "current-point-only",
      points: []
    },
    deathEvent: {
      date: "2026-04-29",
      assetsBeforeDeath: 100000,
      resourcesAfterObligations: 50000
    },
    postDeathSeries: {
      points: []
    },
    dataGaps: [
      {
        code: "missing-survivor-needs",
        message: "Survivor needs are missing."
      }
    ],
    warnings: []
  },
  riskEvaluation: {
    events: [],
    stableEvents: [],
    dataGaps: [],
    warnings: []
  },
  options: {}
});
assert.equal(partialModel.status, "partial");
assert.ok(partialModel.dataGaps.length >= 1);
assert.doesNotThrow(function () {
  JSON.stringify(partialModel);
});

const missingModel = buildIncomeImpactTimelineGraphModel({});
assert.equal(missingModel.status, "unavailable");
assert.equal(missingModel.series.preDeathAssets.length, 0);
assert.ok(missingModel.dataGaps.some(function (gap) { return gap.code === "missing-composer-scenario"; }));

console.log("income-impact-timeline-graph-model-v1-check passed");
