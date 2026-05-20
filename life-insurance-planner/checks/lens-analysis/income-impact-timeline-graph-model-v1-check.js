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

function assertApproxEqual(actual, expected, message, epsilon = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message} Expected ${expected}, received ${actual}.`
  );
}

function getAxisYRatio(value, axis) {
  const span = axis.max - axis.min;
  assert.ok(span > 0, "Y-axis domain should have a positive span.");
  return Math.max(0, Math.min(1, 1 - ((value - axis.min) / span)));
}

function getRenderableGraphModel(model) {
  const clone = cloneJson(model);
  if (clone.series) {
    delete clone.series.appliedRunwayScenarios;
  }
  delete clone.trace;
  return clone;
}

function assertStableLayoutFrame(model, message) {
  assert.ok(model.layoutFrame, `${message}: layoutFrame should exist.`);
  assert.equal(model.layoutFrame.mode, "stableRunoutAnchoredFrame", `${message}: layoutFrame mode should be stable.`);
  assertApproxEqual(model.layoutFrame.deathXRatio, 0.125, `${message}: death x ratio should stay fixed.`);
  assertApproxEqual(model.layoutFrame.zeroYRatio, 0.72, `${message}: zero y ratio should stay fixed.`);
  assertApproxEqual(model.layoutFrame.runoutAnchorXRatio, 0.8, `${message}: runout anchor ratio should stay fixed.`);
  assertApproxEqual(model.layoutFrame.negativeSupportBandRatio, 0.28, `${message}: negative support band should match the fixed zero ratio.`);
  assert.equal(model.layoutFrame.trace.rendererConsumesLayoutFrame, true, `${message}: renderer should consume the stable layoutFrame contract.`);
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
assert.doesNotMatch(source, /cappedRelativeToFundedRunway|DEFICIT_VISUAL_MAX_TO_FUNDED_RATIO|FIXED_ZERO_Y_RATIO|fixedZeroRunway/);
assert.match(source, /continuousLinear/);

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
assert.equal(fiveYearModel.series.postDeathResources[0].date, fiveYearScenario.postDeathSeries.points[0].date);
assert.equal(fiveYearModel.series.postDeathResources[0].relativeMonthsFromDeath, fiveYearScenario.postDeathSeries.points[0].monthIndex);
assertApproxEqual(
  fiveYearModel.series.postDeathResources[0].xRatio,
  fiveYearModel.projection.postDeathRunwayStartXRatio
    + (fiveYearScenario.postDeathSeries.points[0].monthIndex / fiveYearModel.projection.postDeathDisplayHorizonMonths)
      * (1 - fiveYearModel.projection.postDeathRunwayStartXRatio),
  "Selected scenario post-death point should map by months after death."
);
assert.equal(fiveYearModel.axes.x.xAxisMode, "deathRelativeYears");
assert.equal(fiveYearModel.trace.xAxisMode, "deathRelativeYears");
assert.equal(fiveYearModel.projection.mode, "deathRelativeRunway");
assert.equal(fiveYearModel.projection.xAxisMode, "deathRelativeYears");
assert.equal(fiveYearModel.projection.trace.rawDatesPreserved, true);
assert.equal(fiveYearModel.projection.trace.deathAlignedToSharedAnchor, true);
assert.equal(fiveYearModel.projection.trace.calculationHorizonPreserved, true);
assert.equal(fiveYearModel.projection.trace.postDeathRunwayStartsAtDeathLine, true);
assert.equal(fiveYearModel.projection.trace.displayHorizonAutoSized, true);
assertApproxEqual(
  fiveYearModel.projection.postDeathRunwayStartXRatio,
  fiveYearModel.projection.deathXRatio,
  "Post-death runway should start on the fixed death event line."
);
assert.equal(
  fiveYearModel.projection.deathEventConversionBracketXRatio,
  undefined,
  "Death-event conversion annotation metadata should not be emitted."
);
assert.equal(fiveYearModel.projection.displayHorizonMode, "autoFromAppliedScenarioDepletion");
assert.equal(fiveYearModel.projection.calculationHorizonMonths, fiveYearScenario.scenario.projectionHorizonMonths);
assert.equal(fiveYearModel.projection.displayHorizonMonths, 180);
assert.equal(fiveYearModel.projection.displayHorizonYears, 15);
assert.equal(fiveYearModel.projection.displayHorizonEndDate, "2046-04-29");
assert.equal(fiveYearModel.projection.displayHorizonReason, "latest-visible-applied-scenario-depletion");
assert.equal(fiveYearModel.projection.calculationHorizonEndDate, "2071-04-29");
assert.equal(fiveYearModel.projection.latestAppliedScenarioDepletionMonths, 144);
assert.equal(fiveYearModel.projection.latestVisibleAppliedScenarioDepletionMonths, 144);
assert.equal(fiveYearModel.axes.x.displayHorizonMode, "autoFromAppliedScenarioDepletion");
assert.equal(fiveYearModel.axes.x.displayHorizonMonths, 180);
assert.equal(fiveYearModel.axes.x.displayHorizonEndDate, "2046-04-29");
assert.equal(fiveYearModel.axes.x.calculationHorizonMonths, fiveYearScenario.scenario.projectionHorizonMonths);
assert.equal(fiveYearModel.axes.x.calculationHorizonEndDate, "2071-04-29");
assert.equal(fiveYearModel.axes.x.latestAppliedScenarioDepletionMonths, 144);
assert.equal(fiveYearModel.trace.displayHorizonMode, "autoFromAppliedScenarioDepletion");
assert.equal(fiveYearModel.trace.displayHorizonAutoSized, true);
assert.equal(fiveYearModel.trace.displayHorizonMonths, 180);
assert.equal(fiveYearModel.trace.displayHorizonEndDate, "2046-04-29");
assert.equal(fiveYearModel.trace.calculationHorizonMonths, fiveYearScenario.scenario.projectionHorizonMonths);
assert.equal(fiveYearModel.trace.calculationHorizonEndDate, "2071-04-29");
assert.equal(fiveYearModel.trace.projectionMode, "deathRelativeRunway");
assert.equal(fiveYearModel.trace.rawDatesPreserved, true);
assert.equal(fiveYearModel.trace.deathAlignedToSharedAnchor, true);
assert.equal(fiveYearModel.trace.calculationHorizonPreserved, true);
assertStableLayoutFrame(fiveYearModel, "normal depletion scenario");
assert.equal(fiveYearModel.layoutFrame.zeroCrossingAnchorScenarioId, "selected");
assert.equal(fiveYearModel.layoutFrame.zeroCrossingAnchorMonth, 144);
assert.equal(fiveYearModel.layoutFrame.zeroCrossingAnchorSource, "current-rendered-scenario-depletion");
assert.equal(fiveYearModel.layoutFrame.xDomainMonths, 180);
assert.equal(fiveYearModel.trace.layoutFrameMode, "stableRunoutAnchoredFrame");
assertApproxEqual(fiveYearModel.trace.layoutFrameZeroYRatio, 0.72, "Trace should expose the stable layoutFrame zero ratio.");
assertApproxEqual(fiveYearModel.trace.layoutFrameRunoutAnchorXRatio, 0.8, "Trace should expose the stable layoutFrame runout anchor ratio.");
assertApproxEqual(
  fiveYearModel.phases.deathEvent.xRatio,
  fiveYearModel.projection.deathXRatio,
  "Death event phase should use the fixed death-relative runway anchor."
);
assert.deepEqual(
  cloneJson(fiveYearModel.axes.x.ticks.map(function (tick) { return tick.label; })),
  ["Before death", "Death", "+2 years", "+4 years", "+6 years", "+8 years", "+10 years", "+12 years", "+14 years", "+15 years"],
  "Graph x-axis should use denser death-relative increments inside the auto-sized display horizon."
);
assertApproxEqual(
  fiveYearModel.axes.x.ticks.find(function (tick) { return tick.id === "death"; }).xRatio,
  fiveYearModel.projection.deathXRatio,
  "Death axis tick should use the fixed death-relative runway anchor."
);
assert.equal(
  fiveYearModel.axes.x.ticks.find(function (tick) { return tick.id === "death"; }).date,
  fiveYearScenario.scenario.selectedDeathDate,
  "Relative death tick should retain the raw death date as metadata."
);
{
  const dayScaleMonthsCovered = 1 / 30.4375;
  const fastDepletionScenario = cloneJson(makeScenario(0));
  fastDepletionScenario.postDeathSeries.points = [
    {
      date: "2026-04-30",
      monthIndex: dayScaleMonthsCovered,
      endingResources: -1000,
      sourcePaths: ["layer3.points"]
    },
    {
      date: "2026-05-06",
      monthIndex: 7 / 30.4375,
      endingResources: -25000,
      sourcePaths: ["layer3.points"]
    }
  ];
  fastDepletionScenario.postDeathSeries.depletion = {
    depleted: true,
    depletionDate: "2026-04-30",
    monthsCovered: dayScaleMonthsCovered
  };
  fastDepletionScenario.timelineFacts.depletionDate = "2026-04-30";
  fastDepletionScenario.timelineFacts.monthsCovered = dayScaleMonthsCovered;

  const fastDepletionModel = buildIncomeImpactTimelineGraphModel({
    scenario: fastDepletionScenario,
    riskEvaluation: cloneJson(riskEvaluation),
    options: {
      preserveSignedResources: true,
      currentAgeMode: "death-event-only"
    }
  });

  assertApproxEqual(
    fastDepletionModel.axes.x.displayHorizonMonths,
    7 / 30.4375,
    "Day-scale depletion should be allowed to shrink the x-axis horizon below one month."
  );
  assert.equal(fastDepletionModel.axes.x.displayHorizonEndDate, "2026-05-06");
  assert.deepEqual(
    cloneJson(fastDepletionModel.axes.x.ticks.map(function (tick) { return tick.label; })),
    ["Death", "+1 day", "+2 days", "+3 days", "+4 days", "+5 days", "+6 days", "+7 days"],
    "Sub-month display horizons should use day labels instead of rounding to months."
  );
  assert.ok(
    fastDepletionModel.axes.x.ticks.every(function (tick) {
      return tick.id === "death" || (tick.relativeMonths > 0 && tick.relativeMonths <= fastDepletionModel.axes.x.displayHorizonMonths);
    }),
    "Day-scale x-axis ticks should stay inside the auto-sized display horizon."
  );

  const fastMonthlyPointScenario = cloneJson(fastDepletionScenario);
  fastMonthlyPointScenario.postDeathSeries.points = [
    {
      date: "2026-05-29",
      monthIndex: 1,
      endingResources: -6480000,
      sourcePaths: ["layer3.points"]
    },
    {
      date: "2026-06-29",
      monthIndex: 2,
      endingResources: -13930000,
      sourcePaths: ["layer3.points"]
    }
  ];

  const fastAppliedClipModel = buildIncomeImpactTimelineGraphModel({
    appliedScenarios: [
      {
        scenarioId: "income-impact-day-scale-depletion",
        label: "Death tomorrow",
        settings: {
          selectedDeathAge: 46,
          selectedDeathDate: fastDepletionScenario.scenario.selectedDeathDate,
          projectionHorizonYears: 40,
          mortgageTreatmentOverride: "followAssumptions",
          lifestyleSliderValue: 0
        },
        scenario: cloneJson(fastMonthlyPointScenario),
        riskEvaluation: cloneJson(riskEvaluation)
      }
    ],
    selectedScenarioId: "income-impact-day-scale-depletion",
    options: {
      preserveSignedResources: true,
      currentAgeMode: "death-event-only"
    }
  });
  const fastAppliedRunway = fastAppliedClipModel.series.appliedRunwayScenarios[0];
  assert.equal(
    fastAppliedRunway.fundedRunwayPoints.length >= 2,
    true,
    "Day-scale applied runway should retain a visible funded line from death to depletion."
  );
  assert.equal(
    fastAppliedRunway.runwayLinePoints.length >= 2,
    true,
    "Day-scale applied runway should expose a continuous visible line from death into the visible runway window."
  );
  assert.equal(
    fastAppliedRunway.runwayLinePoints.some(function (point) { return point.value < 0; }),
    true,
    "Day-scale applied runway line should be allowed to continue into negative resources when the visible window is shorter than the first monthly point."
  );
  assert.equal(
    fastAppliedRunway.trace.runwayLineAllowsNegativeValues,
    true,
    "Day-scale applied runway trace should identify that the visible line can cross below zero."
  );
  assertApproxEqual(
    fastAppliedRunway.depletionPoint.relativeMonthsFromDeath,
    dayScaleMonthsCovered,
    "Day-scale applied runway should place the depletion anchor at the fractional depletion month."
  );
  {
    const dayScaleRunwayLineAnchorIndex = fastAppliedRunway.runwayLinePoints.findIndex(function (point) {
      return point.id === fastAppliedRunway.depletionPoint.id;
    });
    assert.ok(
      dayScaleRunwayLineAnchorIndex > 0,
      "Day-scale applied runway line should include the explicit zero-crossing depletion anchor."
    );
    assert.equal(
      fastAppliedRunway.runwayLinePoints[dayScaleRunwayLineAnchorIndex].value,
      0,
      "Day-scale runway line depletion anchor should sit exactly on display zero."
    );
    assert.ok(
      fastAppliedRunway.runwayLinePoints[dayScaleRunwayLineAnchorIndex - 1].value > 0,
      "Day-scale runway line point before the zero anchor should remain positive."
    );
    assert.ok(
      fastAppliedRunway.runwayLinePoints[dayScaleRunwayLineAnchorIndex + 1].value < 0,
      "Day-scale runway line should continue below zero after the anchor when resources are negative."
    );
  }
  assert.equal(
    fastAppliedRunway.deficitPoints.at(-1).trace.displayHorizonClip,
    true,
    "Day-scale applied runway should keep a right-edge display-horizon deficit endpoint."
  );
  assertApproxEqual(
    fastAppliedRunway.deficitPoints.at(-1).relativeMonthsFromDeath,
    fastAppliedClipModel.projection.displayHorizonMonths,
    "Day-scale applied runway deficit endpoint should land at the day-scale display boundary."
  );

  const smallDollarDayScaleScenario = cloneJson(fastDepletionScenario);
  smallDollarDayScaleScenario.deathEvent.resourcesAfterObligations = 300;
  smallDollarDayScaleScenario.timelineFacts.resourcesAfterObligations = 300;
  smallDollarDayScaleScenario.postDeathSeries.points = [
    {
      date: "2026-05-29",
      monthIndex: 1,
      endingResources: -300,
      accumulatedUnmetNeed: 300,
      sourcePaths: ["layer3.points"]
    },
    {
      date: "2026-06-29",
      monthIndex: 2,
      endingResources: -900,
      accumulatedUnmetNeed: 900,
      sourcePaths: ["layer3.points"]
    }
  ];
  const smallDollarDayScaleModel = buildIncomeImpactTimelineGraphModel({
    appliedScenarios: [
      {
        scenarioId: "income-impact-small-dollar-day-scale",
        label: "Death tomorrow",
        settings: {
          selectedDeathAge: 46,
          selectedDeathDate: smallDollarDayScaleScenario.scenario.selectedDeathDate,
          projectionHorizonYears: 40,
          mortgageTreatmentOverride: "followAssumptions",
          lifestyleSliderValue: 0
        },
        scenario: cloneJson(smallDollarDayScaleScenario),
        riskEvaluation: cloneJson(riskEvaluation)
      }
    ],
    selectedScenarioId: "income-impact-small-dollar-day-scale",
    options: {
      preserveSignedResources: true,
      currentAgeMode: "death-event-only"
    }
  });
  assert.equal(
    smallDollarDayScaleModel.axes.y.ticks.some(function (tick) { return tick.trace?.tickStep === 100; }),
    true,
    "Small day-scale runway y-axis labels should be allowed to use $100 increments."
  );
  assert.equal(
    smallDollarDayScaleModel.axes.y.visibleDomainBoundaryPointIncluded,
    true,
    "Small day-scale y-domain should include a visible-window boundary point from the death/start balance."
  );

  const denseTickGuardScenario = cloneJson(smallDollarDayScaleScenario);
  denseTickGuardScenario.deathEvent.resourcesAfterObligations = 10000;
  denseTickGuardScenario.timelineFacts.resourcesAfterObligations = 10000;
  const denseTickGuardModel = buildIncomeImpactTimelineGraphModel({
    appliedScenarios: [
      {
        scenarioId: "income-impact-dense-tick-guard",
        label: "Death tomorrow",
        settings: {
          selectedDeathAge: 46,
          selectedDeathDate: denseTickGuardScenario.scenario.selectedDeathDate,
          projectionHorizonYears: 40,
          mortgageTreatmentOverride: "followAssumptions",
          lifestyleSliderValue: 0
        },
        scenario: cloneJson(denseTickGuardScenario),
        riskEvaluation: cloneJson(riskEvaluation)
      }
    ],
    selectedScenarioId: "income-impact-dense-tick-guard",
    options: {
      preserveSignedResources: true,
      currentAgeMode: "death-event-only"
    }
  });
  const denseRenderedTicks = denseTickGuardModel.axes.y.ticks.filter(function (tick) {
    return tick.zone === "fundedRunway" || tick.zone === "deficit";
  });
  assert.ok(
    denseRenderedTicks.length <= 8,
    "Small-runway $100 resolution should not render every $100 increment as a major y-axis label."
  );
  assert.equal(
    denseRenderedTicks.some(function (tick) { return tick.trace?.axisResolutionStep === 100; }),
    true,
    "Dense guarded y-axis ticks should preserve the $100 small-runway axis resolution in trace."
  );
}
assert.ok(fiveYearModel.axes.x.ticks.every(function (tick) {
  return tick.axisMode === "deathRelativeYears" && tick.trace.rawDatePreserved === true;
}));
assert.equal(fiveYearModel.axes.y.signed, true);
assert.equal(fiveYearModel.axes.y.verticalScaleMode, "continuousLinear");
assertApproxEqual(
  fiveYearModel.axes.y.zeroYRatio,
  getAxisYRatio(0, fiveYearModel.axes.y),
  "$0 should be placed by the same continuous y-scale as every other value."
);
assertApproxEqual(
  fiveYearModel.axes.y.fundedRunwayHeightRatio,
  fiveYearModel.axes.y.zeroYRatio,
  "Funded runway height should derive from the continuous zero crossing."
);
assertApproxEqual(
  fiveYearModel.axes.y.deficitHeightRatio,
  1 - fiveYearModel.axes.y.zeroYRatio,
  "Deficit height should derive from the continuous zero crossing."
);
assert.equal(fiveYearModel.axes.y.trace.negativeValuesCompressFundedRunway, false);
assert.equal(fiveYearModel.axes.y.trace.continuousLinearScaleApplied, true);
assert.equal(fiveYearModel.axes.y.trace.selectedScenarioOnlyScale, true);
assert.equal(fiveYearModel.axes.y.trace.deficitVisualCompressionRemoved, true);
assert.equal(fiveYearModel.axes.y.rawDeficitMax, 150000);
assert.equal(fiveYearModel.axes.y.deficitVisualMax, 150000);
assert.equal(fiveYearModel.axes.y.deficitVisualScaleMode, "continuousLinear");
assert.equal(fiveYearModel.axes.y.deficitVisualScaleCapped, false);
assert.equal(fiveYearModel.trace.verticalScaleMode, "continuousLinear");
assertApproxEqual(fiveYearModel.trace.zeroYRatio, fiveYearModel.axes.y.zeroYRatio, "Trace should report the continuous zero crossing.");
assert.equal(fiveYearModel.trace.rawDeficitMax, 150000);
assert.equal(fiveYearModel.trace.deficitVisualMax, 150000);
assert.equal(fiveYearModel.trace.deficitVisualScaleMode, "continuousLinear");
assert.equal(fiveYearModel.trace.deficitVisualScaleCapped, false);
assert.equal(fiveYearModel.trace.negativeValuesCompressFundedRunway, false);
{
  const equalMagnitude = 100000;
  const zeroRatio = getAxisYRatio(0, fiveYearModel.axes.y);
  const positiveDistance = Math.abs(getAxisYRatio(equalMagnitude, fiveYearModel.axes.y) - zeroRatio);
  const negativeDistance = Math.abs(getAxisYRatio(-equalMagnitude, fiveYearModel.axes.y) - zeroRatio);
  assertApproxEqual(
    positiveDistance,
    negativeDistance,
    "Equal positive and negative dollar magnitudes should be equidistant from zero on the y-axis."
  );
  const positiveDelta = Math.abs(getAxisYRatio(200000, fiveYearModel.axes.y) - getAxisYRatio(100000, fiveYearModel.axes.y));
  const negativeDelta = Math.abs(getAxisYRatio(-50000, fiveYearModel.axes.y) - getAxisYRatio(-150000, fiveYearModel.axes.y));
  assertApproxEqual(
    positiveDelta,
    negativeDelta,
    "The same dollar delta above and below zero should map to the same y-distance."
  );
}
assert.deepEqual(
  Array.from(new Set(fiveYearModel.axes.y.ticks.map(function (tick) { return tick.zone; }))),
  ["fundedRunway", "zero", "deficit"],
  "Continuous runway y-axis ticks should keep funded, zero, and deficit labels on the same axis."
);
const fundedTickSteps = fiveYearModel.axes.y.ticks
  .filter(function (tick) { return tick.zone === "fundedRunway"; })
  .map(function (tick) { return tick.trace.tickStep; });
const deficitTickSteps = fiveYearModel.axes.y.ticks
  .filter(function (tick) { return tick.zone === "deficit"; })
  .map(function (tick) { return tick.trace.tickStep; });
assert.ok(fundedTickSteps.length > 0, "Funded runway ticks should exist.");
assert.ok(deficitTickSteps.length > 0, "Deficit ticks should exist.");
assert.ok(
  fundedTickSteps.concat(deficitTickSteps).every(function (step) {
    return step === fundedTickSteps[0];
  }),
  "Funded and deficit ticks should use the same dollar increment above and below zero."
);
assert.ok(
  fiveYearModel.axes.y.ticks
    .filter(function (tick) { return tick.zone === "fundedRunway" || tick.zone === "deficit"; })
    .every(function (tick) { return tick.trace.sharedPositiveNegativeIncrement === true; }),
  "Y-axis tick trace should identify the shared positive/negative increment contract."
);
assert.ok(
  fiveYearModel.axes.y.ticks
    .filter(function (tick) { return tick.zone === "fundedRunway"; })
    .every(function (tick) { return tick.yRatio < fiveYearModel.axes.y.zeroYRatio; }),
  "Funded runway y-axis ticks should stay above the fixed zero baseline."
);
assert.ok(
  fiveYearModel.axes.y.ticks
    .filter(function (tick) { return tick.zone === "deficit"; })
    .every(function (tick) { return tick.yRatio > fiveYearModel.axes.y.zeroYRatio; }),
  "Deficit y-axis ticks should stay below the fixed zero baseline."
);
assert.ok(
  fiveYearModel.series.postDeathResources
    .filter(function (point) { return point.value > 0; })
    .every(function (point) { return point.yRatio < fiveYearModel.axes.y.zeroYRatio; }),
  "Positive runway points should map above the fixed zero baseline."
);
assert.ok(
  fiveYearModel.series.postDeathResources
    .filter(function (point) { return point.value < 0; })
    .every(function (point) { return point.yRatio > fiveYearModel.axes.y.zeroYRatio; }),
  "Negative runway values should map into the lower deficit zone."
);
const fiveYearPositiveRunwayYRatios = fiveYearModel.series.postDeathResources
  .filter(function (point) { return point.value > 0; })
  .map(function (point) { return point.yRatio; });
assert.ok(
  Math.max(...fiveYearPositiveRunwayYRatios) - Math.min(...fiveYearPositiveRunwayYRatios) > 0.5,
  "The current survivor runway should use meaningful vertical space."
);
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
assert.equal(tenYearHorizonScenario.scenario.projectionHorizonMonths, 120);
assert.equal(
  tenYearHorizonModel.projection.calculationHorizonMonths,
  120,
  "Projection horizon calculation metadata should remain unchanged in the graph model."
);
assert.equal(
  tenYearHorizonModel.projection.displayHorizonMonths,
  120,
  "A depletion beyond available calculation output should not extend the display horizon."
);
assert.equal(
  tenYearHorizonModel.projection.displayHorizonReason,
  "latest-visible-applied-scenario-runway-end",
  "A beyond-horizon depletion should use the latest visible runway point without extending the calculation output."
);
assert.equal(
  tenYearHorizonModel.projection.displayHorizonBasis,
  "latestAppliedScenarioRunwayEnd",
  "The display horizon basis should be separated from the preserved calculation horizon."
);
assert.equal(
  tenYearHorizonModel.projection.trace.displayHorizonAutoSized,
  true,
  "The graph display horizon should still be auto-sized from visible scenario runway output."
);
assert.deepEqual(
  cloneJson(tenYearHorizonModel.axes.x.ticks.map(function (tick) { return tick.label; })),
  ["Before death", "Death", "+2 years", "+4 years", "+6 years", "+8 years", "+10 years"],
  "A 10-year visible horizon should emit denser in-window labels without +15/+20/+30 labels."
);

const higherResourceScenario = cloneJson(fiveYearScenario);
higherResourceScenario.deathEvent.resourcesAfterObligations += 250000;
higherResourceScenario.timelineFacts.resourcesAfterObligations += 250000;
higherResourceScenario.postDeathSeries.points = higherResourceScenario.postDeathSeries.points.map(function (point, index) {
  return Object.assign({}, point, {
    endingResources: point.endingResources + (index === 2 ? 50000 : 250000)
  });
});
const higherResourceModel = buildIncomeImpactTimelineGraphModel({
  scenario: higherResourceScenario,
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assertStableLayoutFrame(higherResourceModel, "higher-resource scenario");
assertApproxEqual(
  higherResourceModel.layoutFrame.zeroYRatio,
  fiveYearModel.layoutFrame.zeroYRatio,
  "Higher-resource scenario should keep the stable layoutFrame zero line."
);
assert.notEqual(
  higherResourceModel.axes.y.max,
  fiveYearModel.axes.y.max,
  "Axis domain may change while the layoutFrame ratios remain stable."
);

const earlyDepletionScenario = cloneJson(fiveYearScenario);
earlyDepletionScenario.postDeathSeries.points = [
  {
    date: "2032-04-29",
    monthIndex: 12,
    endingResources: 650000,
    sourcePaths: ["layer3.points"]
  },
  {
    date: "2036-04-29",
    monthIndex: 60,
    endingResources: -650000,
    sourcePaths: ["layer3.points"]
  },
  {
    date: "2041-04-29",
    monthIndex: 120,
    endingResources: -900000,
    sourcePaths: ["layer3.points"]
  }
];
earlyDepletionScenario.postDeathSeries.depletion = {
  depleted: true,
  depletionDate: "2034-04-29",
  monthsCovered: 36
};
const earlyDepletionModel = buildIncomeImpactTimelineGraphModel({
  scenario: earlyDepletionScenario,
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(
  earlyDepletionModel.projection.displayHorizonMonths,
  48,
  "Auto display horizon should adapt down so an early depletion runway uses most of the graph length."
);
assert.equal(earlyDepletionModel.projection.latestAppliedScenarioDepletionMonths, 36);
assert.equal(earlyDepletionModel.projection.postDepletionDisplayPaddingMonths, 9);
assert.equal(earlyDepletionModel.projection.displayHorizonRoundingMonths, 6);
assert.equal(earlyDepletionModel.projection.displayHorizonTargetRunwayRatio, 0.8);
assert.ok(
  earlyDepletionModel.projection.postDeathRunwayStartXRatio
    + ((earlyDepletionModel.projection.latestAppliedScenarioDepletionMonths / earlyDepletionModel.projection.postDeathDisplayHorizonMonths)
      * (1 - earlyDepletionModel.projection.postDeathRunwayStartXRatio)) > 0.75,
  "Early depletion should map into the majority of the post-death graph width instead of looking tiny."
);
assertApproxEqual(
  earlyDepletionModel.phases.deathEvent.xRatio,
  earlyDepletionModel.projection.deathXRatio,
  "Adaptive x-axis scaling must not move the fixed death line."
);
assert.deepEqual(
  cloneJson(earlyDepletionModel.axes.x.ticks.map(function (tick) { return tick.label; })),
  ["Before death", "Death", "+1 year", "+2 years", "+3 years", "+4 years"],
  "Short runways should emit adaptive death-relative ticks instead of fixed +5/+10 labels."
);
const earlyAppliedClipModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "income-impact-early-depletion",
      label: "Death tomorrow",
      settings: {
        selectedDeathAge: 46,
        selectedDeathDate: earlyDepletionScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(earlyDepletionScenario),
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "income-impact-early-depletion",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
const earlyDepletionRunway = earlyAppliedClipModel.series.appliedRunwayScenarios[0];
assert.deepEqual(
  cloneJson(earlyDepletionRunway.rawPoints.map(function (point) { return point.monthIndex; })),
  [12, 60, 120],
  "Display-horizon clipping should preserve the raw source runway points."
);
assert.equal(
  earlyDepletionRunway.deficitPoints.filter(function (point) {
    return point.xRatio === 1;
  }).length,
  1,
  "Renderable deficit points should not stack multiple post-horizon points at the right edge."
);
assert.equal(
  earlyDepletionRunway.deficitPoints.at(-1).trace.displayHorizonClip,
  true,
  "The right-edge deficit endpoint should be a display-horizon clip interpolation."
);
assert.equal(
  earlyDepletionRunway.deficitPoints.at(-1).relativeMonthsFromDeath,
  earlyAppliedClipModel.projection.displayHorizonMonths,
  "The display-horizon clip point should end at the visible graph boundary."
);

const maxDisplayScenario = cloneJson(fiveYearScenario);
maxDisplayScenario.scenario.projectionHorizonMonths = 720;
maxDisplayScenario.postDeathSeries.points = [
  {
    date: "2032-04-29",
    monthIndex: 12,
    endingResources: 650000,
    sourcePaths: ["layer3.points"]
  },
  {
    date: "2066-04-29",
    monthIndex: 420,
    endingResources: 100000,
    sourcePaths: ["layer3.points"]
  },
  {
    date: "2081-04-29",
    monthIndex: 600,
    endingResources: -50000,
    sourcePaths: ["layer3.points"]
  }
];
maxDisplayScenario.postDeathSeries.depletion = {
  depleted: true,
  depletionDate: "2081-04-29",
  monthsCovered: 600
};
const maxDisplayModel = buildIncomeImpactTimelineGraphModel({
  scenario: maxDisplayScenario,
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(
  maxDisplayModel.projection.displayHorizonMonths,
  480,
  "Auto display horizon should keep the 40-year maximum cap."
);
assert.equal(maxDisplayModel.projection.calculationHorizonMonths, 720);
assert.equal(maxDisplayModel.projection.latestAppliedScenarioDepletionMonths, 600);
assert.equal(maxDisplayModel.projection.trace.displayHorizonAutoSized, true);

const noDepletionScenario = cloneJson(fiveYearScenario);
noDepletionScenario.postDeathSeries.points = noDepletionScenario.postDeathSeries.points.map(function (point) {
  return Object.assign({}, point, {
    endingResources: Math.abs(point.endingResources) + 500000
  });
});
delete noDepletionScenario.postDeathSeries.depletion;
const noDepletionModel = buildIncomeImpactTimelineGraphModel({
  scenario: noDepletionScenario,
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(
  noDepletionModel.projection.displayHorizonMonths,
  180,
  "No-depletion scenarios should use the latest visible runway point instead of the full calculation horizon."
);
assert.equal(
  noDepletionModel.projection.displayHorizonReason,
  "latest-visible-applied-scenario-runway-end"
);
assert.equal(noDepletionModel.projection.displayHorizonBasis, "latestAppliedScenarioRunwayEnd");
assert.equal(noDepletionModel.projection.latestAppliedScenarioDepletionMonths, null);
assert.equal(noDepletionModel.projection.trace.displayHorizonAutoSized, true);
assert.equal(noDepletionModel.axes.y.verticalScaleMode, "continuousLinear");
assertApproxEqual(
  noDepletionModel.axes.y.zeroYRatio,
  getAxisYRatio(0, noDepletionModel.axes.y),
  "No-depletion scenarios should still place zero through the continuous y-scale."
);
assert.equal(noDepletionModel.axes.y.signed, false);
assert.ok(noDepletionModel.axes.y.deficitMax > 0, "No-depletion scenarios should retain lower padding without showing deficit data.");
assert.equal(
  noDepletionModel.axes.y.ticks.some(function (tick) { return tick.zone === "deficit"; }),
  false,
  "No-depletion scenarios should not show a deficit axis label."
);
assertStableLayoutFrame(noDepletionModel, "no-depletion scenario");
assert.equal(noDepletionModel.layoutFrame.zeroCrossingAnchorScenarioId, null);
assert.equal(noDepletionModel.layoutFrame.zeroCrossingAnchorMonth, null);
assert.equal(noDepletionModel.layoutFrame.zeroCrossingAnchorSource, "projection-horizon");
assert.equal(noDepletionModel.layoutFrame.xDomainMonths, noDepletionModel.projection.postDeathDisplayHorizonMonths);

const survivorSurplusScenario = cloneJson(noDepletionScenario);
survivorSurplusScenario.postDeathSeries.points = [
  {
    date: "2032-04-29",
    monthIndex: 12,
    endingResources: 800000,
    survivorIncome: 9000,
    netUse: -2500,
    sourcePaths: ["layer3.points.survivor-surplus"]
  },
  {
    date: "2037-04-29",
    monthIndex: 72,
    endingResources: 950000,
    survivorIncome: 9000,
    netUse: -2500,
    sourcePaths: ["layer3.points.survivor-surplus"]
  },
  {
    date: "2046-04-29",
    monthIndex: 180,
    endingResources: 1220000,
    survivorIncome: 9000,
    netUse: -2500,
    sourcePaths: ["layer3.points.survivor-surplus"]
  }
];
delete survivorSurplusScenario.postDeathSeries.depletion;
const survivorSurplusModel = buildIncomeImpactTimelineGraphModel({
  scenario: survivorSurplusScenario,
  riskEvaluation: cloneJson(riskEvaluation),
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assertStableLayoutFrame(survivorSurplusModel, "survivor surplus rising-resource scenario");
assert.equal(survivorSurplusModel.layoutFrame.zeroCrossingAnchorScenarioId, null);
assert.equal(survivorSurplusModel.layoutFrame.zeroCrossingAnchorSource, "projection-horizon");
assert.equal(survivorSurplusModel.series.postDeathResources.at(-1).value > survivorSurplusModel.series.postDeathResources[0].value, true);

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
  cloneJson(appliedSingleModel.series.postDeathResources.map(function (point) { return point.value; })),
  cloneJson(fiveYearModel.series.postDeathResources.map(function (point) { return point.value; })),
  "One applied scenario should preserve the compatibility postDeathResources raw values."
);
assert.deepEqual(
  cloneJson(appliedSingleModel.series.postDeathResources.map(function (point) { return point.date; })),
  cloneJson(fiveYearModel.series.postDeathResources.map(function (point) { return point.date; })),
  "One applied scenario should preserve the compatibility postDeathResources raw dates."
);
assert.equal(
  appliedSingleModel.trace.rawDeathTransitionPathRendered,
  false,
  "Applied scenario graph should continue to avoid rendering the raw death-transition path."
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
assert.equal(appliedSingleRunway.preDeathPathId, "preDeathAssets");
assert.equal(appliedSingleRunway.deathLineLabel, "Death at age 51");
assert.equal(appliedSingleRunway.preDeathContextMode, "reverseCalculatedFromDeathValue");
assert.equal(appliedSingleRunway.preDeathContextDisplayOnly, true);
assert.equal(appliedSingleRunway.preDeathContextYears, 5);
assert.equal(appliedSingleRunway.preDeathContextGrowthSource, "flatFallback");
assert.equal(
  appliedSingleRunway.projectedNetWorthAtDeath,
  fiveYearScenario.preDeathSeries.targetPoint.endingAssets,
  "Applied runway contract should preserve projected net worth at death."
);
assert.equal(
  appliedSingleRunway.survivorResourcesAtDeath,
  fiveYearScenario.deathEvent.resourcesAfterObligations,
  "Applied runway contract should preserve survivor resources available at death."
);
assert.ok(
  appliedSingleRunway.survivorResourcesAtDeathPoint,
  "Applied runway contract should expose a dedicated survivor resources point at the death line."
);
assert.equal(appliedSingleRunway.survivorResourcesAtDeathPoint.trace.interpolationKind, "survivorResourcesAtDeathStart");
assert.equal(appliedSingleRunway.survivorResourcesAtDeathPoint.trace.displayRole, "postDeathRunwayStart");
assert.equal(appliedSingleRunway.survivorResourcesAtDeathPoint.trace.noFinancialCalculationChanged, true);
assertApproxEqual(
  appliedSingleRunway.survivorResourcesAtDeathPoint.xRatio,
  appliedSingleModel.projection.postDeathRunwayStartXRatio,
  "Survivor resources start point should sit at the fixed death-line runway origin."
);
assert.equal(appliedSingleRunway.survivorResourcesAtDeathPoint.trace.displayXOffsetFromDeathAxis, false);
assertApproxEqual(
  appliedSingleRunway.survivorResourcesAtDeathPoint.trace.deathXRatio,
  appliedSingleModel.projection.deathXRatio,
  "Survivor resources start point trace should keep the fixed death axis anchor."
);
assert.equal(
  appliedSingleRunway.fundedRunwayPoints[0].id,
  appliedSingleRunway.survivorResourcesAtDeathPoint.id,
  "Post-death funded runway should start from survivor resources after conversion."
);
assert.equal(
  appliedSingleRunway.fundedRunwayPoints[0].value,
  fiveYearScenario.deathEvent.resourcesAfterObligations,
  "Post-death funded runway should begin at the death-event survivor resources value."
);
assert.ok(
  Array.isArray(appliedSingleRunway.preDeathContextPoints) && appliedSingleRunway.preDeathContextPoints.length === 2,
  "Future-death applied scenario should carry a display-only five-year pre-death context line."
);
assert.equal(appliedSingleRunway.preDeathContextPoints[0].trace.preDeathContextMode, "reverseCalculatedFromDeathValue");
assert.equal(appliedSingleRunway.preDeathContextPoints[0].trace.preDeathContextDisplayOnly, true);
assert.equal(appliedSingleRunway.preDeathContextPoints[0].trace.preDeathContextYears, 5);
assert.equal(appliedSingleRunway.preDeathContextPoints[0].trace.preDeathContextGrowthSource, "flatFallback");
assert.equal(appliedSingleRunway.preDeathContextPoints[0].trace.noFinancialCalculationChanged, true);
assert.equal(
  appliedSingleRunway.preDeathContextPoints[0].relativeMonthsFromDeath,
  -60,
  "Display-only pre-death context should start five years before the scenario death date."
);
assertApproxEqual(
  appliedSingleRunway.preDeathContextPoints[0].xRatio,
  0,
  "Five-year pre-death context should fill the left-side context zone."
);
assert.equal(
  appliedSingleRunway.preDeathContextPoints[0].value,
  fiveYearScenario.preDeathSeries.targetPoint.endingAssets,
  "Flat fallback context should reverse-fill from the death-event value."
);
assertApproxEqual(
  appliedSingleRunway.preDeathContextPoints.at(-1).xRatio,
  appliedSingleModel.projection.deathXRatio,
  "Applied pre-death context should end at the shared death anchor."
);
assert.equal(
  appliedSingleRunway.preDeathContextPoints.at(-1).value,
  fiveYearScenario.preDeathSeries.targetPoint.endingAssets,
  "Applied pre-death context should end at the scenario's projected net worth at death."
);
assert.equal(
  appliedSingleRunway.preDeathContextPoints.at(-1).trace.rawValuePreserved,
  true,
  "Applied pre-death context should preserve raw projected net worth values."
);
assert.equal(appliedSingleRunway.preDeathContextPoints.at(-1).trace.preDeathContextDisplayOnly, true);
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
assert.equal(appliedSingleRunway.trace.rawDatesPreserved, true);
assert.equal(appliedSingleRunway.trace.preDeathContextPointCount, appliedSingleRunway.preDeathContextPoints.length);
assert.equal(appliedSingleRunway.trace.preDeathContextMode, "reverseCalculatedFromDeathValue");
assert.equal(appliedSingleRunway.trace.preDeathContextDisplayOnly, true);
assert.equal(appliedSingleRunway.trace.preDeathContextYears, 5);
assert.equal(appliedSingleRunway.trace.preDeathContextGrowthSource, "flatFallback");
assert.equal(appliedSingleRunway.trace.projectedNetWorthAtDeathPreserved, true);
assert.equal(appliedSingleRunway.trace.survivorResourcesAtDeathPreserved, true);
assert.equal(appliedSingleRunway.trace.deathLineLabelPreserved, true);
assert.equal(appliedSingleRunway.trace.deathAlignedToSharedAnchor, true);
assert.equal(appliedSingleRunway.trace.calculationHorizonPreserved, true);
assert.equal(appliedSingleRunway.trace.xProjectionMode, "deathRelativeRunway");
assert.equal(appliedSingleRunway.trace.depletionDatePreserved, true);
assertApproxEqual(
  appliedSingleRunway.deathXRatio,
  appliedSingleModel.projection.deathXRatio,
  "Applied runway scenario should carry the shared death anchor."
);
assert.equal(appliedSingleRunway.depletionPoint.date, fiveYearScenario.postDeathSeries.depletion.depletionDate);
assert.equal(appliedSingleRunway.depletionPoint.value, 0);
assert.equal(appliedSingleRunway.depletionPoint.trace.visualInterpolation, true);
assert.equal(appliedSingleRunway.depletionPoint.trace.interpolationKind, "zeroCrossing");
{
  const runwayLineAnchorIndex = appliedSingleRunway.runwayLinePoints.findIndex(function (point) {
    return point.id === appliedSingleRunway.depletionPoint.id;
  });
  assert.ok(
    runwayLineAnchorIndex > 0,
    "Applied runway line should include the same explicit zero-crossing anchor used by the depletion marker."
  );
  assert.equal(
    appliedSingleRunway.runwayLinePoints[runwayLineAnchorIndex].value,
    appliedSingleRunway.depletionPoint.value,
    "Applied runway line zero anchor should be the depletion point value."
  );
  assert.equal(
    appliedSingleRunway.runwayLinePoints[runwayLineAnchorIndex].yRatio,
    appliedSingleRunway.depletionPoint.yRatio,
    "Applied runway line zero anchor should share the depletion point y-coordinate."
  );
  assert.ok(
    appliedSingleRunway.runwayLinePoints[runwayLineAnchorIndex - 1].value > 0,
    "Applied runway line point before the zero anchor should remain positive."
  );
  assert.ok(
    appliedSingleRunway.runwayLinePoints[runwayLineAnchorIndex + 1].value < 0,
    "Applied runway line should continue below zero after the anchor when the scenario has deficit continuation."
  );
  assert.equal(
    appliedSingleRunway.runwayLinePoints.some(function (point) { return point.value < 0; }),
    true,
    "Applied runway line should not clamp below-zero continuation."
  );
}
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
  appliedSingleRunway.fundedRunwayPoints.at(-1).id,
  appliedSingleRunway.depletionPoint.id,
  "Funded runway should end on the shared depletion anchor."
);
assert.equal(
  appliedSingleRunway.deficitPoints[0].id,
  appliedSingleRunway.depletionPoint.id,
  "Deficit continuation should start from the shared depletion anchor."
);
assert.equal(
  appliedSingleRunway.fundedRunwayPoints.some(function (point) { return point.value < 0; }),
  false,
  "Funded runway should not include below-zero resource points."
);
assert.ok(
  appliedSingleRunway.fundedRunwayPoints.every(function (point) {
    return point.yRatio <= appliedSingleModel.axes.y.zeroYRatio;
  }),
  "Applied funded runway points should render above or on the fixed zero baseline."
);
assert.equal(
  appliedSingleRunway.deficitPoints.some(function (point) { return point.value < 0 && point.deficitValue > 0; }),
  true,
  "Deficit continuation should separate below-zero resource points with positive deficit values."
);
assert.ok(
  appliedSingleRunway.deficitPoints.every(function (point) {
    return point.yRatio >= appliedSingleModel.axes.y.zeroYRatio;
  }),
  "Applied deficit continuation points should render below or on the fixed zero baseline."
);
assert.equal(appliedSingleRunway.trace.sharedDepletionAnchorForFundedAndDeficit, true);

const sameXDepletionScenario = cloneJson(fiveYearScenario);
sameXDepletionScenario.postDeathSeries.points = [
  {
    date: "2032-04-29",
    monthIndex: 12,
    endingResources: 120000,
    sourcePaths: ["sameX.points.0"]
  },
  {
    date: "2033-04-29",
    monthIndex: 24,
    endingResources: -12000,
    accumulatedUnmetNeed: 12000,
    sourcePaths: ["sameX.points.1"]
  },
  {
    date: "2034-04-29",
    monthIndex: 36,
    endingResources: -24000,
    accumulatedUnmetNeed: 24000,
    sourcePaths: ["sameX.points.2"]
  }
];
sameXDepletionScenario.postDeathSeries.depletion = {
  depleted: true,
  depletionDate: "2033-04-29",
  depletionMonthIndex: 24,
  monthsCovered: 24
};
const sameXDepletionModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "same-x-depletion",
      label: "Same X depletion",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: fiveYearScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: sameXDepletionScenario,
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "same-x-depletion",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
const sameXRunway = sameXDepletionModel.series.appliedRunwayScenarios[0];
assert.equal(sameXRunway.depletionPoint.date, "2033-04-29");
assert.equal(sameXRunway.trace.skippedSharedXDeficitPointCount, 1);
assert.equal(sameXRunway.deficitPoints[0].id, sameXRunway.depletionPoint.id);
assert.equal(
  sameXRunway.rawPoints.some(function (point) { return point.accumulatedUnmetNeed === 12000; }),
  true,
  "Raw accumulated unmet need should remain preserved on signed source runway points."
);
assert.equal(
  sameXRunway.deficitPoints.some(function (point) {
    return point.deficitSource === "accumulatedUnmetNeed" && point.deficitValue > 0;
  }),
  true,
  "Deficit continuation should preserve accumulated unmet need as the deficit source."
);
assert.ok(
  sameXRunway.deficitPoints[1].xRatio > sameXRunway.deficitPoints[0].xRatio,
  "Deficit continuation should skip same-x below-zero points so the visual continues forward from depletion."
);

const immediateDeathScenario = makeScenario(0);
const immediateDeathModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "income-impact-death-tomorrow",
      label: "Death tomorrow",
      settings: {
        selectedDeathAge: 46,
        selectedDeathDate: immediateDeathScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(immediateDeathScenario),
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "income-impact-death-tomorrow",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
const immediateDeathRunway = immediateDeathModel.series.appliedRunwayScenarios[0];
assert.equal(
  immediateDeathRunway.preDeathContextPoints.length,
  2,
  "Death-tomorrow scenarios should still expose a visible display-only pre-death context line."
);
assert.equal(immediateDeathRunway.preDeathContextPoints[0].trace.preDeathContextMode, "reverseCalculatedFromDeathValue");
assert.equal(immediateDeathRunway.preDeathContextPoints[0].trace.preDeathContextDisplayOnly, true);
assert.equal(immediateDeathRunway.preDeathContextPoints[0].trace.preDeathContextGrowthSource, "flatFallback");
assert.equal(
  immediateDeathRunway.preDeathContextPoints[0].relativeMonthsFromDeath,
  -60,
  "Death-tomorrow display context should still start five years before the fixed death line."
);
assertApproxEqual(
  immediateDeathRunway.preDeathContextPoints.at(-1).xRatio,
  immediateDeathModel.projection.deathXRatio,
  "Death-tomorrow pre-death anchor should sit on the shared death line."
);
assert.equal(
  immediateDeathRunway.projectedNetWorthAtDeath,
  immediateDeathScenario.preDeathSeries.targetPoint.endingAssets,
  "Death-tomorrow projected net worth at death should be preserved."
);

const hugeDeficitScenario = cloneJson(fiveYearScenario);
hugeDeficitScenario.postDeathSeries.points[2].endingResources = -150000;
hugeDeficitScenario.postDeathSeries.points[2].accumulatedUnmetNeed = 3000000;
const hugeDeficitModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "income-impact-huge-deficit-scenario",
      label: "Huge deficit scenario",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: hugeDeficitScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(hugeDeficitScenario),
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "income-impact-huge-deficit-scenario",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(hugeDeficitModel.axes.y.rawDeficitMax, 3000000, "Raw accumulated deficit should remain preserved.");
assert.equal(
  hugeDeficitModel.axes.y.deficitVisualScaleCapped,
  false,
  "Large raw deficits should not be visually capped when the y-axis is continuous."
);
assertApproxEqual(
  hugeDeficitModel.axes.y.deficitVisualMax,
  hugeDeficitModel.axes.y.rawDeficitMax,
  "Deficit visual max should equal the raw deficit max on the continuous y-axis."
);
const hugeDeficitAxisTick = hugeDeficitModel.axes.y.ticks
  .filter(function (tick) { return tick.zone === "deficit"; })
  .at(-1);
assert.ok(hugeDeficitAxisTick, "Huge deficit model should include deficit y-axis ticks.");
assert.ok(
  hugeDeficitModel.axes.y.rawDeficitMax > Math.abs(hugeDeficitAxisTick.value),
  "Deficit axis labels may stop at the last shared increment below the raw deficit max."
);
assert.ok(
  hugeDeficitModel.axes.y.ticks
    .filter(function (tick) { return tick.zone === "fundedRunway" || tick.zone === "deficit"; })
    .every(function (tick) { return tick.trace.sharedPositiveNegativeIncrement === true; }),
  "Large deficit y-axis labels should still use shared increments above and below zero."
);
const hugeDeficitRunway = hugeDeficitModel.series.appliedRunwayScenarios[0];
const hugeDeficitFinalPoint = hugeDeficitRunway.deficitPoints.at(-1);
assert.equal(hugeDeficitFinalPoint.deficitValue, 3000000);
assert.equal(hugeDeficitFinalPoint.accumulatedUnmetNeed, 3000000);
assert.equal(hugeDeficitFinalPoint.value, -150000);
assert.equal(hugeDeficitFinalPoint.deficitVisualScaleCapped, false);
assert.equal(hugeDeficitFinalPoint.deficitVisualClipped, false);
assert.equal(hugeDeficitFinalPoint.trace.deficitVisualClipped, false);
assertApproxEqual(
  hugeDeficitFinalPoint.yRatio,
  getAxisYRatio(-3000000, hugeDeficitModel.axes.y),
  "Large deficit values should be projected through the same continuous y-scale instead of a clipping boundary."
);
assert.equal(
  hugeDeficitRunway.rawPoints.at(-1).accumulatedUnmetNeed,
  3000000,
  "Runway raw points should preserve accumulated unmet need."
);
assert.equal(
  hugeDeficitRunway.rawPoints.at(-1).value,
  -150000,
  "Runway raw points should preserve signed ending resources."
);

const offWindowDeficitScenario = cloneJson(fiveYearScenario);
offWindowDeficitScenario.postDeathSeries.points.push({
  date: "2061-04-29",
  monthIndex: 360,
  endingResources: -4000000,
  accumulatedUnmetNeed: 4000000,
  sourcePaths: ["layer3.points"]
});
const offWindowDeficitModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "income-impact-off-window-deficit-scenario",
      label: "Off-window deficit scenario",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: offWindowDeficitScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(offWindowDeficitScenario),
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "income-impact-off-window-deficit-scenario",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(offWindowDeficitModel.projection.postDeathDisplayHorizonMonths, 180);
assert.equal(
  offWindowDeficitModel.axes.y.rawDeficitMax,
  150000,
  "Off-window far-future deficit continuation should not expand the visible y-domain."
);
assert.equal(offWindowDeficitModel.axes.y.trace.yDomainWindowSource, "selectedVisibleDisplayHorizon");
assert.equal(offWindowDeficitModel.axes.y.trace.displayHorizonMonths, 180);
assert.equal(offWindowDeficitModel.axes.y.visibleDomainBoundaryPointIncluded, false);
assert.ok(
  offWindowDeficitModel.axes.y.min > -4000000,
  "Visible y-domain should exclude hidden far-future negative continuation values."
);
assert.equal(
  offWindowDeficitModel.series.appliedRunwayScenarios[0].rawPoints.at(-1).accumulatedUnmetNeed,
  4000000,
  "Raw far-future deficit continuation should remain preserved outside visible y-domain ownership."
);

const boundaryDeficitScenario = cloneJson(fiveYearScenario);
boundaryDeficitScenario.postDeathSeries.points = boundaryDeficitScenario.postDeathSeries.points.slice(0, 2);
boundaryDeficitScenario.postDeathSeries.points.push({
  date: "2061-04-29",
  monthIndex: 360,
  endingResources: -4000000,
  accumulatedUnmetNeed: 4000000,
  sourcePaths: ["layer3.points"]
});
const boundaryDeficitModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "income-impact-boundary-deficit-scenario",
      label: "Boundary deficit scenario",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: boundaryDeficitScenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
      },
      scenario: cloneJson(boundaryDeficitScenario),
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "income-impact-boundary-deficit-scenario",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(boundaryDeficitModel.projection.postDeathDisplayHorizonMonths, 180);
assert.equal(
  boundaryDeficitModel.axes.y.visibleDomainBoundaryPointIncluded,
  true,
  "A segment crossing the visible horizon should add an interpolated boundary point to y-domain calculation."
);
assert.ok(
  boundaryDeficitModel.axes.y.rawDeficitMax > 900000
    && boundaryDeficitModel.axes.y.rawDeficitMax < 1100000,
  "Visible y-domain should include the interpolated boundary deficit, not the full off-window deficit."
);
assert.ok(
  boundaryDeficitModel.axes.y.rawDeficitMax < 4000000,
  "Boundary interpolation should prevent far-future off-window deficit values from crushing the visible graph."
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
assert.equal(appliedMultiModel.trace.visibleAppliedScenarioCount, 2);
assert.equal(appliedMultiModel.trace.hiddenAppliedScenarioCount, 0);
assert.equal(appliedMultiModel.trace.selectedScenarioId, "income-impact-death-in-10-years");
assert.equal(appliedMultiModel.trace.selectedAppliedScenarioId, "income-impact-death-in-10-years");
assert.deepEqual(
  cloneJson(appliedMultiModel.trace.appliedScenarioPathIds),
  ["postDeathResources", "postDeathResources--scenario-2"],
  "Applied scenarios should receive visible graph path IDs for comparison."
);
assert.equal(
  Object.hasOwn(appliedMultiModel.series, "appliedPostDeathResources"),
  true,
  "Multi-applied input should expose the simultaneous applied path list."
);
assert.equal(appliedMultiModel.series.appliedRunwayScenarios.length, 2, "Applied scenarios should produce runway contracts for comparison.");
assert.equal(appliedMultiModel.series.appliedScenarioKeyItems.length, 2, "All applied scenarios should remain available to the graph key.");
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedScenarioKeyItems.map(function (item) { return item.label; })),
  ["Death tomorrow", "Death in 10 years"],
  "Applied scenario key labels should preserve stable list ordering."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedScenarioKeyItems.map(function (item) { return item.selected; })),
  [false, true]
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.selected; })),
  [true, false],
  "Runway contracts should preserve selected state across visible comparison paths."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.scenarioRole; })),
  ["selected", "comparison"],
  "Runway contracts should identify renderable applied scenario roles."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.pathId; })),
  ["postDeathResources", "postDeathResources--scenario-2"],
  "Runway contracts should expose all visible scenario path IDs."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.preDeathPathId; })),
  ["preDeathAssets", "preDeathAssets--scenario-2"],
  "Runway contracts should expose all visible scenario pre-death path IDs."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.appliedRunwayScenarios.map(function (series) { return series.deathLineLabel; })),
  ["Death in 10 years", "Death tomorrow"],
  "Runway contracts should carry scenario death-line labels."
);
assert.equal(
  appliedMultiModel.series.appliedRunwayScenarios[0].projectedNetWorthAtDeath,
  tenYearScenario.preDeathSeries.targetPoint.endingAssets,
  "Selected future-death scenario should preserve projected net worth at death."
);
assert.ok(
  appliedMultiModel.series.appliedRunwayScenarios.every(function (series) {
    return Array.isArray(series.preDeathContextPoints) && series.preDeathContextPoints.length === 2;
  }),
  "The selected applied scenario should expose a display-only pre-death context line."
);
assert.ok(
  appliedMultiModel.series.appliedRunwayScenarios.every(function (series) {
    return series.preDeathContextPoints[0].relativeMonthsFromDeath === -appliedMultiModel.projection.preDeathContextMonths;
  }),
  "Visible pre-death context should start at the configured before-death window."
);
assert.ok(
  appliedMultiModel.series.appliedRunwayScenarios.every(function (series) {
    return series.preDeathContextPoints[0].trace.preDeathContextMode === "reverseCalculatedFromDeathValue"
      && series.preDeathContextPoints[0].trace.preDeathContextDisplayOnly === true
      && series.preDeathContextPoints[0].trace.preDeathContextGrowthSource === "flatFallback";
  }),
  "The selected applied scenario pre-death context should be clearly marked as display-only flat fallback context."
);
assert.ok(
  appliedMultiModel.series.appliedRunwayScenarios.every(function (series) {
    return Math.abs(series.preDeathContextPoints.at(-1).xRatio - appliedMultiModel.projection.deathXRatio) <= 0.000001;
  }),
  "The selected applied pre-death context should end at the shared death anchor."
);
assert.equal(appliedMultiModel.trace.appliedPreDeathContextEnabled, true);
assert.deepEqual(
  cloneJson(appliedMultiModel.trace.appliedPreDeathContextPathIds),
  ["preDeathAssets", "preDeathAssets--scenario-2"],
  "Trace should expose selected and comparison pre-death context path IDs."
);
assert.equal(
  appliedMultiModel.series.appliedRunwayScenarios[0].depletionPoint.date,
  tenYearScenario.postDeathSeries.depletion.depletionDate,
  "Selected runway contract should preserve its own depletion date."
);
assert.deepEqual(
  cloneJson(appliedMultiModel.series.postDeathResources.map(function (point) { return point.value; })),
  cloneJson(tenYearScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "The compatibility postDeathResources path should continue to represent the selected applied scenario."
);
assertApproxEqual(
  appliedMultiModel.series.appliedRunwayScenarios[0].deathXRatio,
  appliedMultiModel.projection.deathXRatio,
  "Selected applied scenario should align to the shared death x-coordinate."
);
assertApproxEqual(
  appliedMultiModel.series.appliedRunwayScenarios[0].rawPoints[0].xRatio,
  appliedMultiModel.projection.postDeathRunwayStartXRatio
    + (12 / appliedMultiModel.projection.postDeathDisplayHorizonMonths)
      * (1 - appliedMultiModel.projection.postDeathRunwayStartXRatio),
  "Selected scenario months after death should map to the selected graph horizon."
);
assert.equal(appliedMultiModel.series.appliedRunwayScenarios[0].depletionPoint.relativeMonthsFromDeath, 144);
assert.equal(appliedMultiModel.axes.x.xAxisMode, "deathRelativeYears");
assert.ok(
  appliedMultiModel.axes.x.ticks.some(function (tick) { return tick.label === "+15 years"; }),
  "Multi-scenario graph should use one shared death-relative axis."
);
assert.equal(appliedMultiModel.projection.mode, "deathRelativeRunway");
assert.equal(appliedMultiModel.projection.trace.deathAlignedToSharedAnchor, true);
assertApproxEqual(
  appliedMultiModel.axes.x.ticks.find(function (tick) { return tick.id === "death"; }).xRatio,
  appliedMultiModel.projection.deathXRatio,
  "Multi-scenario death tick should remain at the shared anchor."
);
assert.equal(
  appliedMultiModel.axes.x.ticks.find(function (tick) { return tick.id === "death"; }).date,
  tenYearScenario.scenario.selectedDeathDate,
  "The shared relative axis should preserve the selected scenario death date metadata."
);
assert.equal(appliedMultiModel.trace.graphContractMode, "survivorRunwayComparison");
assert.equal(appliedMultiModel.trace.rawDeathTransitionPathRendered, false);
assert.equal(
  Object.hasOwn(appliedMultiModel.series, "deathEventBridge"),
  false,
  "Death-event conversion bridge annotations should be removed from the graph model."
);
assert.ok(
  appliedMultiModel.series.appliedRunwayScenarios.every(function (series) {
    return !Object.hasOwn(series, "deathEventBridge");
  }),
  "Applied runway scenarios should not carry per-scenario death-event conversion bridge annotations."
);
assert.equal(
  Object.hasOwn(appliedMultiModel.trace, "deathEventBridgeMode"),
  false,
  "Trace should not report removed death-event conversion bridge mode."
);
assertApproxEqual(
  appliedMultiModel.series.appliedRunwayScenarios[0].survivorResourcesAtDeathPoint.xRatio,
  appliedMultiModel.projection.deathXRatio,
  "Selected scenario runway start should remain on the fixed death line after removing conversion annotations."
);
assert.ok(
  appliedMultiModel.series.appliedRunwayScenarios.every(function (series) {
    return series.deathLineAnchor && series.deathLineAnchor.xRatio === appliedMultiModel.projection.deathXRatio;
  }),
  "The selected applied scenario should expose a label anchor at the shared death line."
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
assert.equal(overLimitAppliedModel.trace.renderedAppliedScenarioCount, 2, "Graph model should render the selected applied scenario plus one comparison path.");
assert.equal(overLimitAppliedModel.trace.hiddenAppliedScenarioCount, 1);
assert.equal(overLimitAppliedModel.series.appliedScenarioKeyItems.length, 3, "Graph key should preserve all applied scenario entries provided to the model.");
assert.deepEqual(
  cloneJson(overLimitAppliedModel.series.appliedRunwayScenarios.map(function (series) { return series.label; })),
  ["Death in 20 years", "Death tomorrow"],
  "When more than two records are supplied, the graph model should keep the selected scenario visible with one comparison."
);
assert.deepEqual(
  cloneJson(overLimitAppliedModel.series.appliedScenarioKeyItems.map(function (item) { return item.selected; })),
  [false, false, true],
  "The key should mark the selected scenario even when hidden scenarios remain available."
);

const selectedAutosizeScenario = cloneJson(fiveYearScenario);
selectedAutosizeScenario.postDeathSeries.depletion = {
  depleted: true,
  depletionDate: "2036-04-29",
  depletionMonthIndex: 48,
  monthsCovered: 48
};
const comparisonLongAutosizeScenario = cloneJson(tenYearScenario);
comparisonLongAutosizeScenario.postDeathSeries.depletion = {
  depleted: true,
  depletionDate: "2066-04-29",
  depletionMonthIndex: 360,
  monthsCovered: 360
};
comparisonLongAutosizeScenario.postDeathSeries.points = comparisonLongAutosizeScenario.postDeathSeries.points.concat([
  {
    date: "2066-04-29",
    monthIndex: 360,
    endingResources: 0,
    sourcePaths: ["layer3.points.comparison-visible-depletion"]
  }
]);
const autosizeSelectedOnlyModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "selected-short-runway",
      label: "Selected short runway",
      settings: appliedMultiInput.appliedScenarios[0].settings,
      scenario: selectedAutosizeScenario,
      riskEvaluation: cloneJson(riskEvaluation)
    },
    {
      scenarioId: "hidden-long-runway",
      label: "Hidden long runway",
      settings: appliedMultiInput.appliedScenarios[1].settings,
      scenario: comparisonLongAutosizeScenario,
      riskEvaluation: cloneJson(riskEvaluation)
    }
  ],
  selectedScenarioId: "selected-short-runway",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});
assert.equal(
  autosizeSelectedOnlyModel.projection.latestAppliedScenarioDepletionMonths,
  360,
  "Graph horizon autosizing should include the visible comparison scenario depletion."
);
assert.equal(autosizeSelectedOnlyModel.trace.hiddenAppliedScenarioCount, 0);
assert.ok(
  autosizeSelectedOnlyModel.projection.postDeathDisplayHorizonMonths >= 360,
  "Visible comparison scenarios should be allowed to expand the graph horizon."
);
assertStableLayoutFrame(autosizeSelectedOnlyModel, "applied visible comparison later depletion scenario");
assert.equal(autosizeSelectedOnlyModel.layoutFrame.zeroCrossingAnchorScenarioId, "hidden-long-runway");
assert.equal(autosizeSelectedOnlyModel.layoutFrame.zeroCrossingAnchorMonth, 360);
assert.equal(autosizeSelectedOnlyModel.layoutFrame.zeroCrossingAnchorSource, "visible-applied-comparison-depletion");
assert.ok(
  autosizeSelectedOnlyModel.layoutFrame.xDomainMonths >= 360,
  "Stable layoutFrame domain should include the furthest visible applied depletion."
);
assert.ok(
  autosizeSelectedOnlyModel.axes.y.rawPositiveMax <= selectedAutosizeScenario.deathEvent.resourcesAfterObligations,
  "Comparison paths should not change selected-scenario y-domain ownership."
);
assert.equal(
  autosizeSelectedOnlyModel.axes.y.trace.selectedScenarioOnlyScale,
  true,
  "Y-axis trace should identify selected-only scale ownership."
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
  cloneJson(comparisonModel.series.comparisonPostDeathResources[0].rawPoints.map(function (point) { return point.value; })),
  cloneJson(comparisonScenario.postDeathSeries.points.map(function (point) { return point.endingResources; })),
  "Comparison raw points should preserve completed alternate postDeathSeries values."
);
assert.equal(
  comparisonModel.series.comparisonPostDeathResources[0].points.filter(function (point) {
    return point.xRatio === 1;
  }).length,
  1,
  "Comparison render points should not stack multiple post-horizon values at the right edge."
);
assert.equal(
  comparisonModel.series.comparisonPostDeathResources[0].points.at(-1).trace.displayHorizonClip,
  true,
  "Comparison render points should end with a display-horizon clip interpolation when the raw path extends past the visible horizon."
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
assertStableLayoutFrame(comparisonModel, "manual lifestyle comparison later depletion scenario");
assert.equal(comparisonModel.layoutFrame.zeroCrossingAnchorScenarioId, comparisonScenario.scenarioId);
assert.equal(comparisonModel.layoutFrame.zeroCrossingAnchorMonth, 204);
assert.equal(comparisonModel.layoutFrame.zeroCrossingAnchorSource, "manual-lifestyle-comparison-depletion");
assert.equal(comparisonModel.layoutFrame.trace.manualLifestyleComparisonIncluded, true);
assert.ok(
  comparisonModel.layoutFrame.xDomainMonths >= comparisonScenario.depletion.depletionMonthIndex,
  "Manual lifestyle comparison later depletion should be included in the stable layoutFrame horizon."
);

const earlierComparisonScenario = Object.assign({}, cloneJson(comparisonScenario), {
  scenarioId: "income-impact-lifestyle-earlier-comparison",
  postDeathSeries: {
    points: [
      {
        date: "2032-04-29",
        monthIndex: 12,
        endingResources: 300000,
        sourcePaths: ["earlierComparison.points"]
      },
      {
        date: "2035-04-29",
        monthIndex: 48,
        endingResources: -20000,
        sourcePaths: ["earlierComparison.points"]
      }
    ],
    depletion: {
      depleted: true,
      depletionDate: "2035-04-29",
      depletionMonthIndex: 48,
      monthsCovered: 48
    }
  },
  depletion: {
    depleted: true,
    depletionDate: "2035-04-29",
    depletionMonthIndex: 48,
    monthsCovered: 48
  }
});
const earlierComparisonModel = buildIncomeImpactTimelineGraphModel(Object.assign({}, cloneJson(fiveYearInput), {
  comparisonScenarios: [earlierComparisonScenario]
}));
assertStableLayoutFrame(earlierComparisonModel, "manual lifestyle comparison earlier depletion scenario");
assert.equal(earlierComparisonModel.layoutFrame.zeroCrossingAnchorScenarioId, "selected");
assert.equal(earlierComparisonModel.layoutFrame.zeroCrossingAnchorMonth, 144);
assert.equal(earlierComparisonModel.layoutFrame.zeroCrossingAnchorSource, "current-rendered-scenario-depletion");

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
  cloneJson(appliedComparisonModel.series.comparisonPostDeathResources[0].rawPoints.map(function (point) { return point.value; })),
  cloneJson(comparisonModel.series.comparisonPostDeathResources[0].rawPoints.map(function (point) { return point.value; })),
  "Applied scenario comparison input should preserve lifestyle comparison source values."
);
assert.deepEqual(
  cloneJson(appliedComparisonModel.series.comparisonPostDeathResources[0].rawPoints.map(function (point) { return point.date; })),
  cloneJson(comparisonModel.series.comparisonPostDeathResources[0].rawPoints.map(function (point) { return point.date; })),
  "Applied scenario comparison input should preserve lifestyle comparison source dates."
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
assert.equal(
  Array.isArray(neutralLifestyleModel.series.comparisonPostDeathResources)
    ? neutralLifestyleModel.series.comparisonPostDeathResources.length
    : 0,
  0,
  "Neutral lifestyle comparison should not emit a duplicate comparison path."
);
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
assert.equal(
  adjustedLifestyleModel.series.comparisonPostDeathResources.length,
  1,
  "Adjusted lifestyle comparison should still emit a visible comparison path."
);
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
  ["linear"],
  "The single comparison path should render as truthful straight segments."
);
assert.deepEqual(
  cloneJson(multiComparisonModel.series.comparisonPostDeathResources[0].rawPoints.map(function (point) { return point.value; })),
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
