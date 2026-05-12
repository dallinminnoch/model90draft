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

function createDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactVisualTimelineHarness = { renderTimeline, renderIncomeImpact };\n})(window);\n"
  );
  const sandbox = {
    console,
    document: {
      addEventListener() {}
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
  return sandbox.window.__incomeImpactVisualTimelineHarness;
}

function getPathD(html, dataAttributeName, dataAttributeValue) {
  const pattern = new RegExp(`<path\\b(?=[^>]*${dataAttributeName}="${dataAttributeValue}")[^>]*\\bd="([^"]*)"`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected SVG path for ${dataAttributeName}="${dataAttributeValue}"`);
  return match[1];
}

function getRunwayDepletionMarkerTag(html, scenarioId) {
  const tags = html.match(/<g\b(?=[^>]*data-income-impact-runway-depletion-marker)[^>]*>/g) || [];
  const tag = tags.find(function (candidate) {
    return candidate.includes(`data-income-impact-applied-scenario-id="${scenarioId}"`);
  });
  assert.ok(tag, `Expected depletion marker for ${scenarioId}`);
  return tag;
}

function getPathYValues(pathD) {
  const numbers = String(pathD || "").match(/-?\d+(?:\.\d+)?/g) || [];
  return numbers
    .map(Number)
    .filter(Number.isFinite)
    .filter(function (_number, index) {
      return index % 2 === 1;
    });
}

function makeGraphModel(mode = "forward-projection") {
  const deathXRatio = mode === "current-point-only" ? 0 : 0.25;
  return {
    status: "complete",
    phases: {
      preDeath: { id: "preDeath", startXRatio: 0, endXRatio: deathXRatio, available: mode !== "current-point-only" },
      deathEvent: { id: "deathEvent", date: "2031-04-29", xRatio: deathXRatio },
      postDeath: { id: "postDeath", startXRatio: deathXRatio, endXRatio: 1, available: true }
    },
    series: {
      preDeathAssets: mode === "current-point-only" ? [] : [
        { date: "2026-04-29", value: 500000, xRatio: 0, yRatio: 0.24 },
        { date: "2029-04-29", value: 560000, xRatio: 0.15, yRatio: 0.18 },
        { date: "2031-04-29", value: 600000, xRatio: 0.25, yRatio: 0.14 }
      ],
      currentAnchor: mode === "current-point-only"
        ? { date: "2026-04-29", value: 500000, xRatio: 0, yRatio: 0.24 }
        : null,
      deathTransition: [
        { id: "assets-before-death", value: 600000, xRatio: deathXRatio, yRatio: 0.14 },
        { id: "treated-assets", value: 450000, xRatio: deathXRatio, yRatio: 0.3 },
        { id: "before-obligations", value: 850000, xRatio: deathXRatio, yRatio: 0.04 },
        { id: "after-obligations", value: 720000, xRatio: deathXRatio, yRatio: 0.09 }
      ],
      postDeathResources: [
        { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
        { date: "2040-04-29", monthIndex: 108, value: 120000, xRatio: 0.72, yRatio: 0.58 },
        { date: "2043-04-29", monthIndex: 144, value: -80000, xRatio: 0.9, yRatio: 0.76 }
      ]
    },
    axes: {
      x: {
        xAxisMode: "deathRelativeYears",
        ticks: [
          ...(mode === "current-point-only" ? [] : [
            { id: "before-death", label: "Before death", date: "2026-04-29", relativeYears: null, xRatio: 0 }
          ]),
          { id: "death", label: "Death", date: "2031-04-29", relativeYears: 0, xRatio: deathXRatio },
          { id: "plus-5", label: "+5 years", date: "2036-04-29", relativeYears: 5, xRatio: 0.42 },
          { id: "plus-10", label: "+10 years", date: "2041-04-29", relativeYears: 10, xRatio: 0.62 },
          { id: "plus-15", label: "+15 years", date: "2046-04-29", relativeYears: 15, xRatio: 0.82 }
        ]
      },
      y: {
        signed: true,
        zeroYRatio: 0.68,
        ticks: [
          { value: -100000, yRatio: 0.8 },
          { value: 0, yRatio: 0.68 },
          { value: 500000, yRatio: 0.24 },
          { value: 900000, yRatio: 0.02 }
        ]
      }
    },
    markers: [
      { id: "depleted", ruleId: "survivor-resources-depleted", kind: "risk", severity: "critical", title: "Resources depleted", summary: "Resources deplete.", positionable: true, xRatio: 0.84, yRatio: 0.68 },
      { id: "coverage", ruleId: "coverage-added-at-death", kind: "stable", severity: "stable", title: "Coverage added", summary: "Coverage is added.", positionable: true, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.09 },
      { id: "unmet-need", ruleId: "accumulated-unmet-need", kind: "risk", severity: "at-risk", title: "Unmet need accumulates", markerLabel: "Unmet need", summary: "Required support continues after resources run out.", positionable: true, xRatio: 0.9, yRatio: 0.76 }
    ],
    selectedEvent: {
      id: "depleted",
      kind: "risk",
      severity: "critical",
      title: "Resources depleted",
      summary: "Resources deplete.",
      date: "2043-04-29"
    },
    callouts: [
      { id: "assets-before-death", label: "Assets before death", value: 600000, kind: "currency", phase: "deathEvent" },
      { id: "resources-after-obligations", label: "Resources after obligations", value: 720000, kind: "currency", phase: "deathEvent" },
      { id: "runway-months-covered", label: "Runway covered", value: 144, kind: "months", phase: "postDeath" }
    ],
    warnings: [],
    dataGaps: [],
    trace: {
      calculationMethod: "income-impact-timeline-graph-model-v1"
    }
  };
}

function makeLifestyleScenarioFixture({ sliderValue, monthlyDelta, depletionMonthIndex, depletionDate, points }) {
  return {
    status: "complete",
    sliderValue,
    monthlyDelta,
    totalBaselineMonthlyExpenses: 6000,
    totalAdjustedMonthlyExpenses: 6000 + monthlyDelta,
    comparisonScenario: {
      scenarioId: "income-impact-lifestyle-adjusted-comparison",
      kind: "lifestyleComparison",
      label: "Lifestyle-adjusted projection",
      pathId: "lifestyle-post-death-resources",
      postDeathSeries: {
        points,
        depletion: {
          depleted: true,
          depletionMonthIndex,
          depletionDate
        }
      },
      depletion: {
        depleted: true,
        depletionMonthIndex,
        depletionDate
      },
      trace: {
        calculationMethod: "income-impact-household-expense-stream-comparison-adapter-v1",
        sliderValue,
        monthlyDelta,
        graphMonthlyDelta: monthlyDelta,
        noOpComparison: monthlyDelta === 0
      }
    }
  };
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const componentsSource = readRepoFile("components.css");
const layoutSource = readRepoFile("layout.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderTimeline, "function");
assert.equal(typeof harness.renderIncomeImpact, "function");
assert.match(pageSource, /income-impact-timeline-graph-model\.js[\s\S]*income-loss-impact-display\.js/);
assert.match(displaySource, /buildIncomeImpactTimelineGraphModel/);
assert.match(displaySource, /renderIncomeImpactTimelineGraph/);
assert.match(displaySource, /data-income-impact-graph-svg/);
assert.match(displaySource, /appliedRunwayScenarios/);
assert.match(displaySource, /fundedRunwayPoints/);
assert.match(displaySource, /deficitPoints/);
assert.match(displaySource, /preDeathContextPoints/);
assert.match(displaySource, /data-income-impact-pre-death-source/);
assert.match(displaySource, /data-income-impact-graph-deficit-area/);
assert.match(displaySource, /renderAppliedScenarioDepletionMarkers/);
assert.match(displaySource, /data-income-impact-runway-depletion-marker/);
assert.doesNotMatch(displaySource, /annotationGeometry/);
assert.doesNotMatch(displaySource, /getSelectedDeathEventBridge|renderDeathEventBridge/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-bridge/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-net-worth/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-survivor-resources/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-conversion-bridge/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-conversion-node/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-survivor-resources-leader/);
assert.doesNotMatch(displaySource, /Conversion at death|Net worth at death|Starting funds after conversion/);
assert.match(displaySource, /renderAppliedScenarioDeathLineAnchors/);
assert.match(displaySource, /data-income-impact-death-line-anchor/);
assert.match(displaySource, /shouldRenderGraphMarker/);
assert.match(displaySource, /buildLinearSvgPath/);
assert.match(displaySource, /renderLifestyleImpactReadout/);
assert.match(displaySource, /data-income-impact-lifestyle-impact-readout/);
assert.match(displaySource, /GRAPH_PATH_SMOOTHING_TENSION/);
assert.match(displaySource, /buildSmoothedSvgPath/);
assert.match(displaySource, /clampNumber/);
assert.match(displaySource, /shouldRenderComparisonMarkerLabel/);
assert.doesNotMatch(displaySource, /fakeOffset|visualOffset|artificialVisualOffset/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents|scenarioTimeline|renderFinancialRunwayChart|buildRunwayChartModel/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-runway-point/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/
);
assert.match(componentsSource, /\.income-impact-graph-svg/);
assert.match(componentsSource, /\.income-impact-graph-path--preDeathAssets/);
assert.match(componentsSource, /\.income-impact-graph-path--preDeathAssets--scenario-2/);
assert.match(componentsSource, /\.income-impact-graph-path--deathTransition/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-bridge/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-net-worth/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-survivor-resources/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-conversion-bracket/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-conversion-node/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-label/);
assert.match(componentsSource, /\.income-impact-death-line-anchor/);
assert.match(componentsSource, /\.income-impact-graph-path--postDeathResources/);
assert.match(componentsSource, /\.income-impact-graph-path--postDeathResources--scenario-2/);
assert.match(componentsSource, /\.income-impact-graph-path--lifestyle-post-death-resources/);
assert.match(componentsSource, /\.income-impact-graph-deficit-area/);
assert.match(componentsSource, /\.income-impact-graph-deficit-label/);
assert.match(componentsSource, /\.income-impact-runway-depletion-marker/);
assert.match(componentsSource, /\.income-impact-runway-depletion-label/);
assert.match(componentsSource, /\.income-impact-graph-phase[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /\.income-impact-graph-deficit-area[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /data-income-impact-applied-scenario-selected="false"[\s\S]*opacity:\s*0\.38;/);
assert.match(componentsSource, /\.income-impact-runway-depletion-marker\[data-income-impact-applied-scenario-selected="true"\][\s\S]*circle/);
assert.match(componentsSource, /\.income-impact-runway-depletion-marker\[data-income-impact-applied-scenario-selected="false"\][\s\S]*opacity:\s*0\.62;/);
assert.match(componentsSource, /\.income-impact-lifestyle-impact-readout/);
assert.match(componentsSource, /\.income-impact-graph-legend/);
assert.match(componentsSource, /\.income-impact-comparison-markers/);
assert.match(
  componentsSource,
  /\.income-impact-graph-path[\s\S]*stroke-width:\s*2;[\s\S]*vector-effect:\s*non-scaling-stroke;[\s\S]*shape-rendering:\s*geometricPrecision;/,
  "Main chart paths should render as thin, non-scaling, geometric-precision SVG strokes."
);
assert.match(
  componentsSource,
  /\.income-impact-graph-path--lifestyle-post-death-resources[\s\S]*stroke-dasharray:\s*7 6;[\s\S]*stroke-width:\s*1\.65;/,
  "Lifestyle comparison path should use a thinner, cleaner dash."
);
assert.match(
  componentsSource,
  /\.income-impact-layout[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/,
  "Income Impact visual layout should make the graph row full-width."
);
assert.match(
  componentsSource,
  /\.income-impact-graph-svg[\s\S]*min-height:\s*clamp\(20rem, 44vh, 32rem\);/,
  "Income Impact graph should use a tighter viewport-aware height to reduce letterboxing."
);
assert.match(
  componentsSource,
  /\.income-impact-scenario-banner[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;[\s\S]*padding:\s*0\.5rem 0\.72rem;/,
  "Scenario controls should remain sticky, sit flush to the viewport bottom, and stay compact while scrolling."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.lens-workflow-pane[\s\S]*padding-bottom:\s*0;[\s\S]*scroll-padding-bottom:\s*0;/,
  "Income Impact page shell should not leave bottom padding below the sticky scenario controls."
);

const fixture = {
  selectedDeath: { date: "2031-04-29", age: 51 },
  graphModel: makeGraphModel(),
  scenario: {
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionMonthIndex: 144,
        depletionDate: "2043-04-29"
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 600000,
      survivorAvailableTreatedAssets: 450000,
      coverageAdded: 400000,
      resourcesAfterObligations: 720000,
      monthsCovered: 144,
      depletionDate: "2043-04-29"
    }
  },
  riskEvaluation: {
    events: [],
    stableEvents: []
  },
  financialRunway: {},
  dataGaps: [],
  warnings: []
};

const timelineHtml = harness.renderTimeline(fixture);
assert.match(timelineHtml, /data-income-impact-graph/);
assert.match(timelineHtml, /data-income-impact-graph-svg/);
assert.match(timelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-bridge/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-net-worth/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-survivor-resources/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-conversion/);
assert.doesNotMatch(timelineHtml, /Conversion at death|Net worth at death|Starting funds after conversion/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-path="deathTransition"/);
assert.match(timelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"|data-income-impact-graph-path="compression-post-death-resources"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-legend/);
assert.doesNotMatch(timelineHtml, /data-income-impact-comparison-markers|data-income-impact-compression-markers/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="death"[\s\S]*Death/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="plus-5"[\s\S]*\+5 years/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="plus-10"[\s\S]*\+10 years/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="plus-15"[\s\S]*\+15 years/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick-date="2031-04-29"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-x-tick="valuation"|data-income-impact-graph-x-tick="horizon"/);
assert.match(timelineHtml, /data-income-impact-graph-zero-baseline/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-marker-rule-id="survivor-resources-depleted"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-marker-rule-id="coverage-added-at-death"/);
assert.doesNotMatch(
  timelineHtml,
  /data-income-impact-graph-marker-rule-id="accumulated-unmet-need"/,
  "Accumulated unmet-need should be represented by the deficit area, not by a separate orange graph marker."
);
assert.doesNotMatch(timelineHtml, /Unmet need accumulates/);
assert.match(timelineHtml, /data-income-impact-graph-selected-event/);
assert.match(timelineHtml, /data-income-impact-graph-callout="resources-after-obligations"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-timeline-paused/);
assert.doesNotMatch(timelineHtml, /data-income-impact-runway-svg|data-income-impact-runway-line/);
const basePostDeathPath = getPathD(timelineHtml, "data-income-impact-graph-path", "postDeathResources");
assert.match(basePostDeathPath, /^M[^"]*\sC\s/, "Base post-death path should render with deterministic cubic smoothing.");

const multiAppliedGraphModel = makeGraphModel();
const survivorResourcesStartXRatio = multiAppliedGraphModel.phases.deathEvent.xRatio;
const selectedSurvivorResourcesPoint = {
  id: "postDeathResources-survivor-resources-at-death",
  date: "2042-04-29",
  monthIndex: 0,
  value: 720000,
  xRatio: survivorResourcesStartXRatio,
  yRatio: 0.09,
  trace: {
    visualStartPoint: true,
    displayRole: "postDeathRunwayStart"
  }
};
const selectedZeroPoint = { date: "2042-04-29", monthIndex: 132, value: 0, xRatio: 0.84, yRatio: multiAppliedGraphModel.axes.y.zeroYRatio };
const selectedRawPoints = multiAppliedGraphModel.series.postDeathResources;
const selectedPreDeathContextPoints = [
  { date: "2037-04-29", monthIndex: 72, value: 620000, xRatio: 0.04, yRatio: 0.19 },
  { date: "2042-04-29", monthIndex: 132, value: 760000, xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio, yRatio: 0.12 }
];
const secondRawPoints = [
  { date: "2027-04-29", monthIndex: 12, value: 610000, xRatio: 0.2, yRatio: 0.16 },
  { date: "2036-04-29", monthIndex: 120, value: 90000, xRatio: 0.68, yRatio: 0.6 },
  { date: "2041-04-29", monthIndex: 180, value: -130000, xRatio: 0.86, yRatio: 0.78 }
];
const secondZeroPoint = { date: "2039-04-29", monthIndex: 156, value: 0, xRatio: 0.78, yRatio: multiAppliedGraphModel.axes.y.zeroYRatio };
const secondPreDeathContextPoints = [
  { date: "2026-04-29", monthIndex: 0, value: 500000, xRatio: 0.02, yRatio: 0.24 },
  { date: "2031-04-29", monthIndex: 60, value: 600000, xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio, yRatio: 0.14 }
];
const secondSurvivorResourcesPoint = {
  id: "postDeathResources--scenario-2-survivor-resources-at-death",
  date: "2031-04-29",
  monthIndex: 0,
  value: 610000,
  xRatio: survivorResourcesStartXRatio,
  yRatio: 0.16,
  trace: {
    visualStartPoint: true,
    displayRole: "postDeathRunwayStart"
  }
};
multiAppliedGraphModel.series.appliedPostDeathResources = [
  {
    scenarioId: "income-impact-death-in-5-years",
    label: "Death in 5 years",
    pathId: "postDeathResources",
    selected: true,
    points: selectedRawPoints
  },
  {
    scenarioId: "income-impact-current-scenario",
    label: "Death tomorrow",
    pathId: "postDeathResources--scenario-2",
    selected: false,
    points: secondRawPoints
  }
];
multiAppliedGraphModel.series.appliedRunwayScenarios = [
  {
    scenarioId: "income-impact-death-in-5-years",
    label: "Death in 5 years",
    pathId: "postDeathResources",
    preDeathPathId: "preDeathAssets",
    pathMode: "linear",
    preDeathPathMode: "linear",
    scenarioRole: "baseline",
    selected: true,
    rawPoints: selectedRawPoints,
    preDeathContextPoints: selectedPreDeathContextPoints,
    projectedNetWorthAtDeath: 760000,
    deathLineLabel: "Death in 5 years",
    deathLineAnchor: {
      scenarioId: "income-impact-death-in-5-years",
      label: "Death in 5 years",
      scenarioRole: "baseline",
      selected: true,
      xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio,
      yRatio: 0.12,
      value: 760000,
      date: "2042-04-29"
    },
    survivorResourcesAtDeathPoint: selectedSurvivorResourcesPoint,
    fundedRunwayPoints: [selectedSurvivorResourcesPoint].concat(selectedRawPoints.slice(0, 2), [selectedZeroPoint]),
    deficitPoints: [selectedZeroPoint, selectedRawPoints[2]],
    depletionPoint: selectedZeroPoint,
    trace: {
      rawValuesPreserved: true,
      depletionDatePreserved: true
    }
  },
  {
    scenarioId: "income-impact-current-scenario",
    label: "Death tomorrow",
    pathId: "postDeathResources--scenario-2",
    preDeathPathId: "preDeathAssets--scenario-2",
    pathMode: "linear",
    preDeathPathMode: "linear",
    scenarioRole: "comparison",
    selected: false,
    rawPoints: secondRawPoints,
    preDeathContextPoints: secondPreDeathContextPoints,
    projectedNetWorthAtDeath: 600000,
    deathLineLabel: "Death tomorrow",
    deathLineAnchor: {
      scenarioId: "income-impact-current-scenario",
      label: "Death tomorrow",
      scenarioRole: "comparison",
      selected: false,
      xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio,
      yRatio: 0.14,
      value: 600000,
      date: "2031-04-29"
    },
    survivorResourcesAtDeathPoint: secondSurvivorResourcesPoint,
    fundedRunwayPoints: [secondSurvivorResourcesPoint].concat(secondRawPoints.slice(0, 2), [secondZeroPoint]),
    deficitPoints: [secondZeroPoint, secondRawPoints[2]],
    depletionPoint: secondZeroPoint,
    trace: {
      rawValuesPreserved: true,
      depletionDatePreserved: true
    }
  }
];
const multiAppliedTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: multiAppliedGraphModel
});
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="postDeathResources--scenario-2"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-runway-source="fundedRunwayPoints"/);
assert.doesNotMatch(
  multiAppliedTimelineHtml,
  /data-income-impact-death-event-bridge|data-income-impact-death-event-conversion|Conversion at death|Net worth at death|Starting funds after conversion/,
  "Death-event conversion annotation should not render for selected or non-selected scenarios."
);
{
  const selectedAppliedPathD = getPathD(multiAppliedTimelineHtml, "data-income-impact-graph-path", "postDeathResources");
  const selectedAppliedPathStartX = Number((selectedAppliedPathD.match(/^M(-?\d+(?:\.\d+)?)/) || [])[1]);
  const expectedSurvivorStartX = 74 + (884 * survivorResourcesStartXRatio);
  assert.ok(
    Number.isFinite(selectedAppliedPathStartX) && Math.abs(selectedAppliedPathStartX - expectedSurvivorStartX) <= 0.12,
    "Selected post-death runway should start from the survivor-resources point on the fixed death axis."
  );
}
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="preDeathAssets--scenario-2"/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-graph-path="preDeathAssets"[\s\S]*data-income-impact-pre-death-source="preDeathContextPoints"/,
  "Selected applied scenario should render its pre-death net worth context from the runway contract."
);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-graph-path="preDeathAssets--scenario-2"[\s\S]*data-income-impact-pre-death-source="preDeathContextPoints"/,
  "Second applied scenario should render its own pre-death net worth context."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-death-line-label="Death in 5 years"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-death-line-label="Death tomorrow"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-death-line-anchor[\s\S]*Death in 5 years/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-death-line-anchor[\s\S]*Death tomorrow/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path-mode="linear"/);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-path="postDeathResources(?:--scenario-2)?"/g) || []).length,
  2,
  "Two applied scenario paths should render when the graph model provides them."
);
const selectedRunwayPath = getPathD(multiAppliedTimelineHtml, "data-income-impact-graph-path", "postDeathResources");
const selectedRunwayYValues = getPathYValues(selectedRunwayPath);
const zeroY = 36 + (multiAppliedGraphModel.axes.y.zeroYRatio * 318);
assert.ok(
  Math.max(...selectedRunwayYValues) <= zeroY + 0.75,
  "Selected funded runway path should stop at zero and should not include below-zero y coordinates."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-deficit-area="postDeathDeficitArea--selected"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-deficit-source="deficitPoints"/);
assert.match(multiAppliedTimelineHtml, /Required support after resources run out/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-deficit-label/);
assert.match(multiAppliedTimelineHtml, /Required support[\s\S]*after resources run out/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-graph-deficit-area="postDeathDeficitArea--selected"[\s\S]*data-income-impact-applied-scenario-id="income-impact-death-in-5-years"/,
  "Only the selected applied scenario should own the filled deficit area."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-deficit-area=/g) || []).length,
  1,
  "V1 should render one selected-scenario deficit area, not a filled area for every scenario."
);
const clippedDeficitGraphModel = makeGraphModel();
const clippedDeficitZeroPoint = { date: "2038-04-29", monthIndex: 84, value: 0, xRatio: 0.6, yRatio: clippedDeficitGraphModel.axes.y.zeroYRatio };
clippedDeficitGraphModel.series.appliedRunwayScenarios = [
  {
    scenarioId: "income-impact-clipped-deficit",
    label: "Clipped deficit",
    pathId: "postDeathResources",
    selected: true,
    rawPoints: [
      { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
      clippedDeficitZeroPoint,
      { date: "2039-04-29", monthIndex: 96, value: -900000, xRatio: 0.72, yRatio: 1, deficitVisualClipped: true },
      { date: "2040-04-29", monthIndex: 108, value: -1500000, xRatio: 0.84, yRatio: 1, deficitVisualClipped: true },
      { date: "2041-04-29", monthIndex: 120, value: -2400000, xRatio: 0.96, yRatio: 1, deficitVisualClipped: true }
    ],
    fundedRunwayPoints: [
      { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
      clippedDeficitZeroPoint
    ],
    deficitPoints: [
      clippedDeficitZeroPoint,
      { date: "2039-04-29", monthIndex: 96, value: -900000, xRatio: 0.72, yRatio: 1, deficitVisualClipped: true },
      { date: "2040-04-29", monthIndex: 108, value: -1500000, xRatio: 0.84, yRatio: 1, deficitVisualClipped: true },
      { date: "2041-04-29", monthIndex: 120, value: -2400000, xRatio: 0.96, yRatio: 1, deficitVisualClipped: true }
    ],
    depletionPoint: clippedDeficitZeroPoint,
    trace: {
      rawValuesPreserved: true,
      depletionDatePreserved: true
    }
  }
];
const clippedDeficitTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: clippedDeficitGraphModel
});
const clippedDeficitAreaPath = getPathD(clippedDeficitTimelineHtml, "data-income-impact-graph-deficit-area", "postDeathDeficitArea--selected");
const clippedDeficitBottomY = 36 + 318;
const clippedDeficitBottomYCount = getPathYValues(clippedDeficitAreaPath).filter(function (value) {
  return Math.abs(value - clippedDeficitBottomY) < 0.01;
}).length;
assert.equal(
  clippedDeficitBottomYCount,
  1,
  "Over-cap deficit area should end at the first clipped boundary point instead of drawing a flat bottom rail."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-runway-depletion-marker(?:\s|>)/g) || []).length,
  2,
  "Each depleted applied scenario should render one depletion marker."
);
const selectedDepletionMarkerTag = getRunwayDepletionMarkerTag(
  multiAppliedTimelineHtml,
  "income-impact-death-in-5-years"
);
assert.match(selectedDepletionMarkerTag, /data-income-impact-applied-scenario-label="Death in 5 years"/);
assert.match(selectedDepletionMarkerTag, /data-income-impact-applied-scenario-selected="true"/);
const mutedDepletionMarkerTag = getRunwayDepletionMarkerTag(
  multiAppliedTimelineHtml,
  "income-impact-current-scenario"
);
assert.match(mutedDepletionMarkerTag, /data-income-impact-applied-scenario-label="Death tomorrow"/);
assert.match(mutedDepletionMarkerTag, /data-income-impact-applied-scenario-selected="false"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-runway-depletion-label[\s\S]*Runs out/);
assert.match(multiAppliedTimelineHtml, /aria-label="Death in 5 years: Resources depleted"/);
assert.match(multiAppliedTimelineHtml, /aria-label="Death tomorrow: Resources depleted"/);
assert.equal(
  multiAppliedGraphModel.series.appliedRunwayScenarios[0].rawPoints.some(function (point) { return point.value < 0; }),
  true,
  "Raw negative values should remain preserved in the graph model contract."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-scenario-select="income-impact-death-in-5-years"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-scenario-select="income-impact-current-scenario"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-applied-scenario-id="income-impact-death-in-5-years"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-applied-scenario-id="income-impact-current-scenario"/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-applied-scenario-id="income-impact-death-in-5-years"[^>]*data-income-impact-applied-scenario-selected="true"/,
  "Selected scenario path should be marked for visible active-state styling."
);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-applied-scenario-id="income-impact-current-scenario"[^>]*data-income-impact-applied-scenario-selected="false"/,
  "Non-selected scenario path should remain visually distinguishable but inactive."
);
assert.match(multiAppliedTimelineHtml, /Death in 5 years/);
assert.match(multiAppliedTimelineHtml, /Death tomorrow/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-legend/);
assert.doesNotMatch(multiAppliedTimelineHtml, /Comparison only - base projection unchanged\./);
assert.doesNotMatch(multiAppliedTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/);

multiAppliedGraphModel.series.appliedRunwayScenarios[0].selected = false;
multiAppliedGraphModel.series.appliedRunwayScenarios[1].selected = true;
multiAppliedGraphModel.trace = Object.assign({}, multiAppliedGraphModel.trace, {
  selectedScenarioId: "income-impact-current-scenario"
});
const switchedSelectedTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: multiAppliedGraphModel
});
assert.match(
  switchedSelectedTimelineHtml,
  /data-income-impact-graph-deficit-area="postDeathDeficitArea--selected"[\s\S]*data-income-impact-applied-scenario-id="income-impact-current-scenario"/,
  "Selected deficit area should move when the selected applied scenario changes."
);
assert.match(
  getRunwayDepletionMarkerTag(switchedSelectedTimelineHtml, "income-impact-current-scenario"),
  /data-income-impact-applied-scenario-selected="true"/,
  "Selected depletion marker should move when the selected applied scenario changes."
);
assert.match(
  getRunwayDepletionMarkerTag(switchedSelectedTimelineHtml, "income-impact-death-in-5-years"),
  /data-income-impact-applied-scenario-selected="false"/,
  "Previously selected depletion marker should become muted when another scenario is selected."
);
assert.doesNotMatch(switchedSelectedTimelineHtml, /data-income-impact-death-event-bridge/);

const currentGraphModel = makeGraphModel();
const currentComparisonPoints = currentGraphModel.series.postDeathResources.map((point) => ({ ...point }));
currentGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    pathMode: "linear",
    points: currentComparisonPoints
  }
];
const currentTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: currentGraphModel,
  compressionReporting: {
    lifestyleScenario: makeLifestyleScenarioFixture({
      sliderValue: 0,
      monthlyDelta: 0,
      depletionMonthIndex: 144,
      depletionDate: "2043-04-29",
      points: currentComparisonPoints
    }),
    trace: {
      lifestyleSliderValue: 0
    }
  }
});
assert.match(currentTimelineHtml, /data-income-impact-lifestyle-impact-readout/);
assert.match(currentTimelineHtml, /data-income-impact-lifestyle-impact-mode="current"/);
assert.match(currentTimelineHtml, /Matches baseline/);
assert.match(currentTimelineHtml, /Lifestyle spend: \$0\/mo/);
assert.match(currentTimelineHtml, /No depletion shift/);

const comparisonGraphModel = makeGraphModel();
const conservativeComparisonPoints = [
  { date: "2032-04-29", monthIndex: 12, value: 680000, xRatio: 0.33, yRatio: 0.1 },
  { date: "2040-04-29", monthIndex: 108, value: 280000, xRatio: 0.72, yRatio: 0.44 },
  { date: "2043-04-29", monthIndex: 144, value: 60000, xRatio: 0.9, yRatio: 0.64 },
  { date: "2045-04-29", monthIndex: 168, value: -20000, xRatio: 0.96, yRatio: 0.7 }
];
comparisonGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    pathMode: "linear",
    points: conservativeComparisonPoints
  }
];
comparisonGraphModel.comparisonMarkers = [
  {
    id: "income-impact-lifestyle-adjusted-comparison-action",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "comparisonAction",
    label: "Lifestyle adjustment",
    summary: "Lifestyle adjustment represented in the comparison scenario.",
    positionable: true,
    xRatio: 0.33,
    yRatio: 0.1
  },
  {
    id: "income-impact-lifestyle-adjusted-comparison-pause",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "comparisonPause",
    label: "Lifestyle pause",
    summary: "Lifestyle pause represented in the comparison scenario.",
    positionable: true,
    xRatio: 0.33,
    yRatio: 0.1
  },
  {
    id: "income-impact-expense-compression-alternate-base-depletion",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "baseDepletion",
    label: "Base depletion",
    summary: "Base projection depletion point.",
    positionable: true,
    xRatio: 0.9,
    yRatio: 0.68
  },
  {
    id: "income-impact-lifestyle-adjusted-comparison-lifestyle-depletion",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "lifestyleDepletion",
    label: "Lifestyle depletion",
    summary: "Lifestyle comparison depletion point.",
    positionable: true,
    xRatio: 0.96,
    yRatio: 0.68
  },
  {
    id: "income-impact-lifestyle-adjusted-comparison-shortfall-remains",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "shortfallRemains",
    label: "Shortfall remains",
    summary: "Lifestyle comparison still shows remaining shortfall.",
    positionable: true,
    xRatio: 0.96,
    yRatio: 0.68
  }
];
const comparisonTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: comparisonGraphModel,
  compressionReporting: {
    lifestyleScenario: makeLifestyleScenarioFixture({
      sliderValue: -100,
      monthlyDelta: -500,
      depletionMonthIndex: 168,
      depletionDate: "2045-04-29",
      points: conservativeComparisonPoints
    }),
    trace: {
      lifestyleSliderValue: -100
    }
  }
});
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/);
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-graph-path="lifestyle-post-death-resources"/g) || []).length,
  1,
  "Only one lifestyle comparison path should render."
);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"[^>]*data-income-impact-graph-path-mode="linear"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-legend/);
assert.match(comparisonTimelineHtml, /Base projection/);
assert.match(comparisonTimelineHtml, /Lifestyle-adjusted projection/);
assert.match(comparisonTimelineHtml, /Comparison only - base projection unchanged\./);
assert.match(comparisonTimelineHtml, /data-income-impact-lifestyle-impact-mode="conservative"/);
assert.match(comparisonTimelineHtml, /Extends runway by 24 months/);
assert.match(comparisonTimelineHtml, /Lifestyle spend: -\$500\/mo/);
assert.match(comparisonTimelineHtml, /Depletion shift: \+24 months/);
assert.doesNotMatch(comparisonTimelineHtml, /staged-compression-post-death-resources|data-income-impact-graph-detail="compression-early-window"|data-income-impact-detail-path="staged-compression"/);
assert.doesNotMatch(comparisonTimelineHtml, /compression-post-death-resources|data-income-impact-compression-markers|data-income-impact-compression-marker/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-markers/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="comparisonAction"/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="comparisonPause"/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="baseDepletion"/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="lifestyleDepletion"/);
assert.doesNotMatch(
  comparisonTimelineHtml,
  /data-income-impact-comparison-marker-type="shortfallRemains"/,
  "Accumulated unmet-need/shortfall marker should not render a separate graph dot."
);
assert.match(comparisonTimelineHtml, /Lifestyle adjustment/);
assert.match(comparisonTimelineHtml, /Lifestyle pause/);
assert.match(comparisonTimelineHtml, /Base depletion/);
assert.match(comparisonTimelineHtml, /Lifestyle depletion/);
assert.doesNotMatch(comparisonTimelineHtml, /Shortfall remains/);
const repeatedComparisonTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: comparisonGraphModel
});
const immediatePath = getPathD(comparisonTimelineHtml, "data-income-impact-graph-path", "lifestyle-post-death-resources");
const repeatedImmediatePath = getPathD(repeatedComparisonTimelineHtml, "data-income-impact-graph-path", "lifestyle-post-death-resources");
assert.match(immediatePath, /^M[^"]*\sL[0-9.-]/, "Lifestyle comparison path should render as truthful straight segments.");
assert.equal(immediatePath, repeatedImmediatePath, "Linear comparison path output should be deterministic.");
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-graph-marker/g) || []).length,
  (timelineHtml.match(/data-income-impact-graph-marker/g) || []).length,
  "Lifestyle comparison markers should not be rendered as existing risk/stable graph markers."
);
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-comparison-marker(?:\s|>)/g) || []).length,
  4,
  "Rendered comparison markers should omit the accumulated unmet-need/shortfall dot while preserving the other comparison markers."
);

const elevatedGraphModel = makeGraphModel();
const elevatedComparisonPoints = [
  { date: "2032-04-29", monthIndex: 12, value: 590000, xRatio: 0.33, yRatio: 0.16 },
  { date: "2040-04-29", monthIndex: 108, value: 30000, xRatio: 0.72, yRatio: 0.66 },
  { date: "2042-04-29", monthIndex: 132, value: -60000, xRatio: 0.86, yRatio: 0.74 }
];
elevatedGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    points: elevatedComparisonPoints
  }
];
const elevatedTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: elevatedGraphModel,
  compressionReporting: {
    lifestyleScenario: makeLifestyleScenarioFixture({
      sliderValue: 100,
      monthlyDelta: 400,
      depletionMonthIndex: 132,
      depletionDate: "2042-04-29",
      points: elevatedComparisonPoints
    }),
    trace: {
      lifestyleSliderValue: 100
    }
  }
});
assert.match(elevatedTimelineHtml, /data-income-impact-lifestyle-impact-mode="elevated"/);
assert.match(elevatedTimelineHtml, /Shortens runway by 12 months/);
assert.match(elevatedTimelineHtml, /Lifestyle spend: \+\$400\/mo/);
assert.match(elevatedTimelineHtml, /Depletion shift: -12 months/);
assert.match(elevatedTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/);
assert.doesNotMatch(elevatedTimelineHtml, /data-income-impact-graph-path="compression-post-death-resources"|staged-compression-post-death-resources/);

const noDepletionGraphModel = makeGraphModel();
noDepletionGraphModel.series.postDeathResources = [
  { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
  { date: "2040-04-29", monthIndex: 108, value: 260000, xRatio: 0.72, yRatio: 0.42 },
  { date: "2043-04-29", monthIndex: 144, value: 160000, xRatio: 0.9, yRatio: 0.54 }
];
const fallbackComparisonPoints = [
  { date: "2032-04-29", monthIndex: 12, value: 660000, xRatio: 0.33, yRatio: 0.1 },
  { date: "2040-04-29", monthIndex: 108, value: 320000, xRatio: 0.72, yRatio: 0.36 },
  { date: "2043-04-29", monthIndex: 144, value: 240000, xRatio: 0.9, yRatio: 0.46 }
];
noDepletionGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    points: fallbackComparisonPoints
  }
];
const fallbackTimelineHtml = harness.renderTimeline({
  ...fixture,
  scenario: {
    ...fixture.scenario,
    postDeathSeries: {
      depletion: {
        depleted: false
      }
    }
  },
  graphModel: noDepletionGraphModel,
  compressionReporting: {
    lifestyleScenario: {
      ...makeLifestyleScenarioFixture({
        sliderValue: -50,
        monthlyDelta: -250,
        depletionMonthIndex: null,
        depletionDate: "",
        points: fallbackComparisonPoints
      }),
      comparisonScenario: {
        ...makeLifestyleScenarioFixture({
          sliderValue: -50,
          monthlyDelta: -250,
          depletionMonthIndex: null,
          depletionDate: "",
          points: fallbackComparisonPoints
        }).comparisonScenario,
        depletion: {
          depleted: false
        },
        postDeathSeries: {
          points: fallbackComparisonPoints,
          depletion: {
            depleted: false
          }
        }
      }
    },
    trace: {
      lifestyleSliderValue: -50
    }
  }
});
assert.match(fallbackTimelineHtml, /Conservative lifestyle selected/);
assert.match(fallbackTimelineHtml, /Lifestyle spend: -\$250\/mo/);
assert.match(fallbackTimelineHtml, /Resources difference: \+\$80,000 at horizon/);

const currentAgeHtml = harness.renderTimeline({
  ...fixture,
  graphModel: {
    ...makeGraphModel("current-point-only"),
    callouts: [
      { id: "current-age-no-prior-trend", label: "Before-death trend", value: "No prior modeled trend for current-age death.", kind: "text", phase: "preDeath" }
    ]
  }
});
assert.doesNotMatch(currentAgeHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(currentAgeHtml, /data-income-impact-graph-current-anchor/);
assert.match(currentAgeHtml, /No prior modeled trend for current-age death\./);
assert.doesNotMatch(currentAgeHtml, /data-income-impact-death-event-bridge/);
assert.doesNotMatch(currentAgeHtml, /data-income-impact-graph-path="deathTransition"/);
assert.match(currentAgeHtml, /data-income-impact-graph-path="postDeathResources"/);

const unavailableHtml = harness.renderTimeline({
  ...fixture,
  graphModel: {
    status: "unavailable",
    dataGaps: [{ code: "missing-composer-scenario" }]
  }
});
assert.match(unavailableHtml, /data-income-impact-timeline-paused/);
assert.match(unavailableHtml, /Timeline graph unavailable with the current profile facts/);
assert.doesNotMatch(unavailableHtml, /data-income-impact-graph-svg/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });
assert.match(host.innerHTML, /data-income-impact-layout-main/);
assert.match(host.innerHTML, /data-income-impact-layout-aside/);
assert.match(host.innerHTML, /data-income-impact-graph-svg/);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-helper-timeline") < host.innerHTML.indexOf("data-income-impact-risk-panel"),
  "Timeline graph should render before the supporting risk and compression panels."
);

console.log("income-loss-impact-visual-timeline-check passed");
