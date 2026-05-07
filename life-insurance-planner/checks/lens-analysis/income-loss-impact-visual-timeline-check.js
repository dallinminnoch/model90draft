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

function makeGraphModel(mode = "forward-projection") {
  return {
    status: "complete",
    phases: {
      preDeath: { id: "preDeath", startXRatio: 0, endXRatio: mode === "current-point-only" ? 0 : 0.25, available: mode !== "current-point-only" },
      deathEvent: { id: "deathEvent", date: "2031-04-29", xRatio: mode === "current-point-only" ? 0 : 0.25 },
      postDeath: { id: "postDeath", startXRatio: mode === "current-point-only" ? 0 : 0.25, endXRatio: 1, available: true }
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
        { id: "assets-before-death", value: 600000, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.14 },
        { id: "treated-assets", value: 450000, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.3 },
        { id: "before-obligations", value: 850000, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.04 },
        { id: "after-obligations", value: 720000, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.09 }
      ],
      postDeathResources: [
        { date: "2032-04-29", value: 640000, xRatio: 0.33, yRatio: 0.12 },
        { date: "2040-04-29", value: 120000, xRatio: 0.72, yRatio: 0.58 },
        { date: "2043-04-29", value: -80000, xRatio: 0.9, yRatio: 0.76 }
      ]
    },
    axes: {
      x: {
        ticks: [
          { id: "valuation", label: "Valuation", date: "2026-04-29", xRatio: 0 },
          { id: "death", label: "Death", date: "2031-04-29", xRatio: mode === "current-point-only" ? 0 : 0.25 },
          { id: "horizon", label: "Horizon", date: "2071-04-29", xRatio: 1 }
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
      { id: "coverage", ruleId: "coverage-added-at-death", kind: "stable", severity: "stable", title: "Coverage added", summary: "Coverage is added.", positionable: true, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.09 }
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

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const componentsSource = readRepoFile("components.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderTimeline, "function");
assert.equal(typeof harness.renderIncomeImpact, "function");
assert.match(pageSource, /income-impact-timeline-graph-model\.js[\s\S]*income-loss-impact-display\.js/);
assert.match(displaySource, /buildIncomeImpactTimelineGraphModel/);
assert.match(displaySource, /renderIncomeImpactTimelineGraph/);
assert.match(displaySource, /data-income-impact-graph-svg/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents|scenarioTimeline|renderFinancialRunwayChart|buildRunwayChartModel/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-runway-point/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/
);
assert.match(componentsSource, /\.income-impact-graph-svg/);
assert.match(componentsSource, /\.income-impact-graph-path--preDeathAssets/);
assert.match(componentsSource, /\.income-impact-graph-path--deathTransition/);
assert.match(componentsSource, /\.income-impact-graph-path--postDeathResources/);
assert.match(componentsSource, /\.income-impact-graph-path--compression-post-death-resources/);
assert.match(componentsSource, /\.income-impact-graph-legend/);

const fixture = {
  selectedDeath: { date: "2031-04-29", age: 51 },
  graphModel: makeGraphModel(),
  scenario: {
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
assert.match(timelineHtml, /data-income-impact-graph-path="deathTransition"/);
assert.match(timelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-path="compression-post-death-resources"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-legend/);
assert.match(timelineHtml, /data-income-impact-graph-zero-baseline/);
assert.match(timelineHtml, /data-income-impact-graph-marker-kind="risk"/);
assert.match(timelineHtml, /data-income-impact-graph-marker-kind="stable"/);
assert.match(timelineHtml, /data-income-impact-graph-selected-event/);
assert.match(timelineHtml, /data-income-impact-graph-callout="resources-after-obligations"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-timeline-paused/);
assert.doesNotMatch(timelineHtml, /data-income-impact-runway-svg|data-income-impact-runway-line/);

const comparisonGraphModel = makeGraphModel();
comparisonGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-expense-compression-alternate",
    kind: "compression",
    label: "After expense compression",
    points: [
      { date: "2032-04-29", value: 680000, xRatio: 0.33, yRatio: 0.1 },
      { date: "2040-04-29", value: 280000, xRatio: 0.72, yRatio: 0.44 },
      { date: "2043-04-29", value: 60000, xRatio: 0.9, yRatio: 0.64 }
    ]
  }
];
const comparisonTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: comparisonGraphModel
});
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="compression-post-death-resources"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-legend/);
assert.match(comparisonTimelineHtml, /Base projection/);
assert.match(comparisonTimelineHtml, /After expense compression/);
assert.match(comparisonTimelineHtml, /Comparison only - base projection unchanged\./);
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-graph-marker/g) || []).length,
  (timelineHtml.match(/data-income-impact-graph-marker/g) || []).length,
  "Compression comparison path should not create timeline markers."
);

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
assert.match(currentAgeHtml, /data-income-impact-graph-path="deathTransition"/);
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
  "Timeline graph should render before the right-side companion panel."
);

console.log("income-loss-impact-visual-timeline-check passed");
