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

function getRenderableGraphModel(model) {
  const clone = cloneJson(model);
  if (clone.series) {
    delete clone.series.appliedRunwayScenarios;
  }
  delete clone.trace;
  return clone;
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
assert.equal(fiveYearModel.trace.scenarioModelMode, "singleScenario");
assert.equal(fiveYearModel.trace.appliedScenarioCount, 0);
assert.equal(fiveYearModel.trace.selectedScenarioId, null);
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
assert.equal(fiveYearModel.axes.x.xAxisMode, "deathRelativeYears");
assert.equal(fiveYearModel.trace.xAxisMode, "deathRelativeYears");
assert.deepEqual(
  cloneJson(fiveYearModel.axes.x.ticks.map(function (tick) { return tick.label; })),
  ["Before death", "Death", "+5 years", "+10 years", "+15 years", "+20 years", "+30 years"],
  "Graph x-axis should use death-relative runway labels instead of calendar axis labels."
);
assert.equal(
  fiveYearModel.axes.x.ticks.find(function (tick) { return tick.id === "death"; }).date,
  fiveYearScenario.scenario.selectedDeathDate,
  "Relative death tick should retain the raw death date as metadata."
);
assert.ok(fiveYearModel.axes.x.ticks.every(function (tick) {
  return tick.axisMode === "deathRelativeYears" && tick.trace.rawDatePreserved === true;
}));
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
assert.deepEqual(cloneJson(fiveYearModel.comparisonMarkers), [], "Comparison markers should be empty without a complete lifestyle comparison scenario.");

const tenYearHorizonScenario = cloneJson(fiveYearScenario);
tenYearHorizonScenario.scenario.projectionHorizonMonths = 120;
tenYearHorizonScenario.postDeathSeries.points = tenYearHorizonScenario.postDeathSeries.points.slice(0, 2);
const tenYearHorizonModel = buildIncomeImpactTimelineGraphModel({
  scenario: tenYearHorizonScenario,
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.deepEqual(
  cloneJson(tenYearHorizonModel.axes.x.ticks.map(function (tick) { return tick.label; })),
  ["Before death", "Death", "+5 years", "+10 years"],
  "A 10-year visible horizon should not emit crowded +15/+20/+30 labels."
);

const appliedSingleInput = {
  appliedScenarios: [
    {
      scenarioId: "income-impact-current-scenario",
      label: "Death at age 51",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: fiveYearScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(fiveYearScenario),
      riskEvaluation: cloneJson(riskEvaluation),
      lifestyleAdjustment: {
        sliderValue: 0,
        label: "Current"
      },
      comparisonTrace: {
        source: "scenario-comparison-foundation-check"
      }
    }
  ],
  selectedScenarioId: "income-impact-current-scenario",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
};
const appliedSingleInputBefore = cloneJson(appliedSingleInput);
const appliedSingleModel = buildIncomeImpactTimelineGraphModel(appliedSingleInput);
assert.deepEqual(appliedSingleInput, appliedSingleInputBefore, "Graph model should not mutate appliedScenarios input.");
assert.deepEqual(
  getRenderableGraphModel(appliedSingleModel),
  getRenderableGraphModel(fiveYearModel),
  "One applied scenario should produce the same renderable graph output as the existing single-scenario input."
);
assert.equal(appliedSingleModel.trace.scenarioModelMode, "appliedScenarios");
assert.equal(appliedSingleModel.trace.appliedScenarioCount, 1);
assert.equal(appliedSingleModel.trace.selectedScenarioId, "income-impact-current-scenario");
assert.equal(appliedSingleModel.trace.selectedAppliedScenarioId, "income-impact-current-scenario");
assert.equal(appliedSingleModel.trace.selectedAppliedScenario.label, "Death at age 51");
assert.equal(appliedSingleModel.trace.selectedAppliedScenario.settings.selectedDeathAge, 51);
assert.equal(appliedSingleModel.trace.selectedAppliedScenario.lifestyleAdjustment.label, "Current");
assert.equal(appliedSingleModel.trace.selectedAppliedScenario.comparisonTrace.source, "scenario-comparison-foundation-check");
assert.equal(
  Object.prototype.hasOwnProperty.call(appliedSingleModel.series, "appliedPostDeathResources"),
  false,
  "One applied scenario should keep the existing single postDeathResources output."
);
assert.equal(appliedSingleModel.series.appliedRunwayScenarios.length, 1, "One applied scenario should emit one runway contract.");
const appliedSingleRunway = appliedSingleModel.series.appliedRunwayScenarios[0];
assert.equal(appliedSingleRunway.scenarioId, "income-impact-current-scenario");
assert.equal(appliedSingleRunway.label, "Death at age 51");
assert.equal(appliedSingleRunway.selected, true);
assert.equal(appliedSingleRunway.pathId, "postDeathResources");
assert.deepEqual(
  cloneJson(appliedSingleRunway.rawPoints.map(function (point) { return point.value; })),
  cloneJson(fiveYearScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Runway raw points should preserve signed source resource values."
);
assert.deepEqual(
  cloneJson(appliedSingleRunway.rawPoints.map(function (point) { return point.date; })),
  cloneJson(fiveYearScenario.postDeathSeries.points.map(function (point) { return point.date; })),
  "Runway raw points should preserve source dates."
);
assert.equal(appliedSingleRunway.trace.rawValuesPreserved, true);
assert.equal(appliedSingleRunway.trace.depletionDatePreserved, true);
assert.equal(appliedSingleRunway.depletionPoint.date, fiveYearScenario.postDeathSeries.depletion.depletionDate);
assert.equal(appliedSingleRunway.depletionPoint.value, 0);
assert.equal(appliedSingleRunway.depletionPoint.trace.visualInterpolation, true);
assert.equal(appliedSingleRunway.depletionPoint.trace.interpolationKind, "zeroCrossing");
assert.equal(
  appliedSingleRunway.rawPoints.some(function (point) { return point.trace && point.trace.visualInterpolation; }),
  false,
  "Visual interpolation points should not replace raw source points."
);
assert.equal(
  appliedSingleRunway.fundedRunwayPoints.at(-1).value,
  0,
  "Funded runway should stop at the scenario depletion boundary."
);
assert.equal(
  appliedSingleRunway.fundedRunwayPoints.some(function (point) { return point.value < 0; }),
  false,
  "Funded runway should not include below-zero resource points."
);
assert.equal(
  appliedSingleRunway.deficitPoints.some(function (point) { return point.value < 0 && point.deficitValue > 0; }),
  true,
  "Deficit continuation should separate below-zero resource points with positive deficit values."
);

const tenYearScenario = makeScenario(10);
const appliedMultiInput = {
  appliedScenarios: [
    {
      scenarioId: "income-impact-current-scenario",
      label: "Death tomorrow",
      settings: {
        selectedDeathAge: 46,
        selectedDeathDate: fiveYearScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(fiveYearScenario),
      riskEvaluation: cloneJson(riskEvaluation),
      lifestyleAdjustment: {
        sliderValue: 0,
        label: "Current"
      }
    },
    {
      scenarioId: "income-impact-death-in-10-years",
      label: "Death in 10 years",
      settings: {
        selectedDeathAge: 56,
        selectedDeathDate: tenYearScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(tenYearScenario),
      riskEvaluation: cloneJson(riskEvaluation),
      lifestyleAdjustment: {
        sliderValue: 0,
        label: "Current"
      }
    }
  ],
  selectedScenarioId: "income-impact-death-in-10-years",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
};
const appliedMultiInputBefore = cloneJson(appliedMultiInput);
const appliedMultiModel = buildIncomeImpactTimelineGraphModel(appliedMultiInput);
assert.deepEqual(appliedMultiInput, appliedMultiInputBefore, "Graph model should not mutate multi appliedScenarios input.");
assert.equal(appliedMultiModel.trace.scenarioModelMode, "appliedScenarios");
assert.equal(appliedMultiModel.trace.appliedScenarioCount, 2);
assert.equal(appliedMultiModel.trace.renderedAppliedScenarioCount, 2);
assert.equal(appliedMultiModel.trace.selectedScenarioId, "income-impact-death-in-10-years");
assert.equal(appliedMultiModel.trace.selectedAppliedScenarioId, "income-impact-death-in-10-years");
assert.deepEqual(
  cloneJson(appliedMultiModel.trace.appliedScenarioPathIds),
  ["postDeathResources", "postDeathResources--scenario-2"],
  "Applied scenario path IDs should be deterministic and keep the selected scenario on the compatibility path."
);
assert.equal(appliedMultiModel.series.appliedPostDeathResources.length, 2, "Two applied scenarios should produce two renderable resource paths.");
assert.equal(appliedMultiModel.series.appliedRunwayScenarios.length, 2, "Two applied scenarios should produce two runway contracts.");
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedPostDeathResources.map(function (series) { return series.label; })),
  ["Death in 10 years", "Death tomorrow"],
  "Applied scenario path labels should preserve scenario labels with the selected scenario first."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedPostDeathResources.map(function (series) { return series.pathId; })),
  ["postDeathResources", "postDeathResources--scenario-2"]
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedPostDeathResources.map(function (series) { return series.selected; })),
  [true, false]
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.selected; })),
  [true, false],
  "Runway contracts should preserve selected and non-selected scenario state."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.pathId; })),
  ["postDeathResources", "postDeathResources--scenario-2"],
  "Runway contracts should preserve deterministic applied scenario path IDs."
);
assert.equal(
  appliedMultiModel.series.appliedRunwayScenarios[0].depletionPoint.date,
  tenYearScenario.postDeathSeries.depletion.depletionDate,
  "Selected runway contract should preserve its own depletion date."
);
assert.equal(
  appliedMultiModel.series.appliedRunwayScenarios[1].depletionPoint.date,
  fiveYearScenario.postDeathSeries.depletion.depletionDate,
  "Non-selected runway contract should preserve its own depletion date."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.postDeathResources.map(function (point) { return point.value; })),
  cloneJson(tenYearScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "The compatibility postDeathResources path should continue to represent the selected applied scenario."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedPostDeathResources[0].points.map(function (point) { return point.value; })),
  cloneJson(tenYearScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Selected applied scenario resource values should remain raw composer values."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedPostDeathResources[1].points.map(function (point) { return point.value; })),
  cloneJson(fiveYearScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Second applied scenario resource values should remain raw composer values."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedPostDeathResources[0].points.map(function (point) { return point.date; })),
  cloneJson(tenYearScenario.postDeathSeries.points.map(function (point) { return point.date; })),
  "Selected applied scenario dates should remain raw composer dates."
);
assert.equal(appliedMultiModel.axes.x.xAxisMode, "deathRelativeYears");
assert.ok(
  appliedMultiModel.axes.x.ticks.some(function (tick) { return tick.label === "+15 years"; }),
  "Multi-scenario graph should use one shared death-relative axis."
);
assert.equal(
  appliedMultiModel.axes.x.ticks.find(function (tick) { return tick.id === "death"; }).date,
  tenYearScenario.scenario.selectedDeathDate,
  "The shared relative axis should preserve the selected scenario death date metadata."
);

const overLimitAppliedModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(appliedMultiInput), {
  appliedScenarios: appliedMultiInput.appliedScenarios.concat([
    {
      scenarioId: "income-impact-death-in-20-years",
      label: "Death in 20 years",
      settings: {
        selectedDeathAge: 66,
        selectedDeathDate: makeScenario(20).scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: makeScenario(20),
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ]),
  selectedScenarioId: "income-impact-death-in-20-years"
}));
assert.equal(overLimitAppliedModel.trace.appliedScenarioCount, 3);
assert.equal(overLimitAppliedModel.trace.renderedAppliedScenarioCount, 2, "Graph model should render no more than two applied scenario paths.");
assert.deepEqual(
  cloneJson(overLimitAppliedModel.series.appliedPostDeathResources.map(function (series) { return series.label; })),
  ["Death in 20 years", "Death tomorrow"],
  "When over limit, the selected scenario should render first and only one comparison scenario should be retained."
);

const comparisonScenario = {
  scenarioId: "income-impact-lifestyle-adjusted-comparison",
  kind: "lifestyleComparison",
  pathId: "lifestyle-post-death-resources",
  label: "Lifestyle-adjusted projection",
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
        sourcePaths: ["streamComparisonScenario.postDeathSeries.points"]
      },
      {
        date: `${2040}-04-29`,
        monthIndex: 108,
        endingResources: 260000,
        sourcePaths: ["streamComparisonScenario.postDeathSeries.points"]
      },
      {
        date: `${2048}-04-29`,
        monthIndex: 204,
        endingResources: -20000,
        sourcePaths: ["streamComparisonScenario.postDeathSeries.points"]
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
assert.equal(comparisonModel.series.comparisonPostDeathResources[0].kind, "lifestyleComparison");
assert.equal(comparisonModel.series.comparisonPostDeathResources[0].pathId, "lifestyle-post-death-resources");
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
assert.equal(comparisonModel.markers.some(function (marker) { return marker.kind === "comparison"; }), false, "Comparison markers must stay out of existing risk/stable markers.");
assert.equal(comparisonModel.comparisonMarkers.length, 5, "Complete lifestyle comparison scenario should emit separate comparison markers.");
assert.deepEqual(
  cloneJson(comparisonModel.comparisonMarkers.map(function (marker) { return marker.markerType; }).sort()),
  [
    "baseDepletion",
    "comparisonAction",
    "comparisonPause",
    "lifestyleDepletion",
    "shortfallRemains"
  ],
  "Comparison markers should cover action, pause, lifestyle depletion, and remaining shortfall events."
);
assert.equal(
  comparisonModel.comparisonMarkers.filter(function (marker) { return marker.markerType === "baseDepletion" || marker.markerType === "lifestyleDepletion"; }).length,
  2,
  "Base depletion and lifestyle depletion should remain separate markers."
);
assert.ok(comparisonModel.comparisonMarkers.every(function (marker) { return marker.positionable && marker.kind === "comparison" && marker.lane === "comparison"; }));
assert.ok(comparisonModel.comparisonMarkers.every(function (marker) { return marker.xRatio != null && marker.yRatio != null; }));
assert.equal(comparisonModel.trace.comparisonScenariosEnabled, true);
assert.equal(comparisonModel.trace.comparisonScenarioCount, 1);
assert.equal(comparisonModel.trace.baseSeriesUnchanged, true);
assert.equal(comparisonModel.trace.comparisonMarkersCreated, true);
assert.equal(comparisonModel.trace.comparisonMarkerCount, 5);

const appliedComparisonInput = {
  appliedScenarios: [
    {
      scenarioId: "scenario-with-lifestyle-comparison",
      label: "Death at age 51",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: fiveYearScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: -100
      },
      scenario: cloneJson(fiveYearScenario),
      riskEvaluation: cloneJson(riskEvaluation),
      comparisonScenarios: [cloneJson(comparisonScenario)],
      lifestyleAdjustment: {
        sliderValue: -100,
        label: "Conservative"
      },
      comparisonTrace: {
        graphPathId: "lifestyle-post-death-resources"
      }
    }
  ],
  selectedScenarioId: "scenario-with-lifestyle-comparison",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
};
const appliedComparisonModel = buildIncomeImpactTimelineGraphModel(appliedComparisonInput);
assert.deepEqual(
  getRenderableGraphModel(appliedComparisonModel),
  getRenderableGraphModel(comparisonModel),
  "Applied scenario comparison input should preserve the existing lifestyle comparison renderable output."
);
assert.equal(appliedComparisonModel.trace.scenarioModelMode, "appliedScenarios");
assert.equal(appliedComparisonModel.trace.appliedScenarioCount, 1);
assert.equal(appliedComparisonModel.trace.selectedScenarioId, "scenario-with-lifestyle-comparison");
assert.equal(appliedComparisonModel.trace.selectedAppliedScenarioId, "scenario-with-lifestyle-comparison");
assert.equal(appliedComparisonModel.trace.comparisonScenariosEnabled, true);
assert.equal(appliedComparisonModel.series.comparisonPostDeathResources[0].pathId, "lifestyle-post-death-resources");
assert.equal(appliedComparisonModel.series.comparisonPostDeathResources[0].scenarioId, comparisonScenario.scenarioId);

// Intentional read-side compatibility fixture for saved pre-stream lifestyle comparison inputs.
const neutralLifestyleComparisonScenario = Object.assign({}, cloneJson(comparisonScenario), {
  scenarioId: "income-impact-lifestyle-adjusted-comparison",
  kind: "lifestyleComparison",
  pathId: "lifestyle-post-death-resources",
  label: "Lifestyle-adjusted projection",
  reductionsApplied: [],
  pausesApplied: [],
  trace: {
    calculationMethod: "income-impact-lifestyle-comparison-adapter-v1",
    monthlyDelta: 0,
    baseScenarioMutated: false
  }
});
const neutralLifestyleModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [neutralLifestyleComparisonScenario]
}));
assert.equal(neutralLifestyleModel.series.comparisonPostDeathResources.length, 1, "Neutral lifestyle comparison should still emit the one comparison path.");
assert.deepEqual(
  cloneJson(neutralLifestyleModel.comparisonMarkers),
  [],
  "Current/0 lifestyle comparison should not add duplicate comparison markers over the baseline."
);

// Intentional read-side compatibility fixture for saved pre-stream lifestyle comparison inputs.
const adjustedLifestyleComparisonScenario = Object.assign({}, cloneJson(comparisonScenario), {
  scenarioId: "income-impact-lifestyle-adjusted-comparison",
  kind: "lifestyleComparison",
  pathId: "lifestyle-post-death-resources",
  label: "Lifestyle-adjusted projection",
  reductionsApplied: [],
  pausesApplied: [],
  trace: {
    calculationMethod: "income-impact-lifestyle-comparison-adapter-v1",
    monthlyDelta: -500,
    baseScenarioMutated: false
  }
});
const adjustedLifestyleModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [adjustedLifestyleComparisonScenario]
}));
assert.ok(
  adjustedLifestyleModel.comparisonMarkers.some(function (marker) {
    return marker.markerType === "lifestyleDepletion" && marker.label === "Lifestyle depletion";
  }),
  "Adjusted lifestyle comparison depletion marker should use lifestyle wording."
);

const multiComparisonInput = Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [
    cloneJson(comparisonScenario),
    {
      scenarioId: "ignored-extra-comparison",
      kind: "lifestyleComparison",
      pathId: "lifestyle-post-death-resources",
      label: "Ignored extra comparison",
      postDeathSeries: {
        points: [
          {
            date: `${2032}-04-29`,
            monthIndex: 1,
            endingResources: 999999
          },
          {
            date: `${2048}-04-29`,
            monthIndex: 204,
            endingResources: 999999
          }
        ]
      }
    }
  ]
});
const multiComparisonInputBefore = cloneJson(multiComparisonInput);
const multiComparisonModel = buildIncomeImpactTimelineGraphModel(multiComparisonInput);
assert.deepEqual(multiComparisonInput, multiComparisonInputBefore, "Graph model should not mutate multiple comparisonScenarios.");
assert.equal(multiComparisonModel.series.comparisonPostDeathResources.length, 1, "Graph model should keep one visible comparison path.");
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources.map(function (series) { return series.pathId; })),
  ["lifestyle-post-death-resources"],
  "Graph model should normalize the visible comparison path id to lifestyle."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources.map(function (series) { return series.pathMode; })),
  ["smooth"],
  "The single comparison path should render as a clean smooth line."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources[0].points.map(function (point) { return point.value; })),
  cloneJson(comparisonScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "First comparison values should remain unchanged when extra comparison input is present."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.postDeathResources.map(function (point) { return point.value; })),
  cloneJson(fiveYearModel.series.postDeathResources.map(function (point) { return point.value; })),
  "Base postDeathResources source values should remain unchanged with comparison input."
);
assert.equal(
  multiComparisonModel.comparisonMarkers.filter(function (marker) { return marker.markerType === "baseDepletion"; }).length,
  1,
  "Base depletion should not be duplicated when extra comparison input is ignored."
);
assert.equal(multiComparisonModel.trace.comparisonScenarioCount, 1);
assert.equal(
  Object.prototype.hasOwnProperty.call(comparisonModel.series, "comparisonEarlyDetail"),
  false,
  "Early detail strip should not be created for the single lifestyle comparison path."
);

const retiredCompressionPathComparisonModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [
    Object.assign({}, cloneJson(comparisonScenario), {
      scenarioId: "income-impact-expense-compression-alternate",
      kind: "compression",
      pathId: "compression-post-death-resources",
      trace: {
        calculationMethod: "income-impact-compression-scenario-v1"
      }
    })
  ]
}));
assert.equal(
  Object.prototype.hasOwnProperty.call(retiredCompressionPathComparisonModel.series, "comparisonPostDeathResources"),
  false,
  "Retired compression graph-path scenarios should not emit the visible lifestyle comparison path."
);
assert.deepEqual(cloneJson(retiredCompressionPathComparisonModel.comparisonMarkers), [], "Retired compression graph-path scenarios should not emit visible comparison markers.");

const invalidComparisonModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [
    {
      scenarioId: "blocked-or-incomplete",
      kind: "lifestyleComparison",
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
