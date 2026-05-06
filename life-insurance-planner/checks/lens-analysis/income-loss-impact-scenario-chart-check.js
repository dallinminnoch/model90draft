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
    "\n  window.__incomeImpactScenarioChartHarness = { renderIncomeImpact };\n})(window);\n"
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
  return sandbox.window.__incomeImpactScenarioChartHarness;
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const graphModelSource = readRepoFile("app/features/lens-analysis/income-impact-timeline-graph-model.js");
const componentsSource = readRepoFile("components.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderIncomeImpact, "function");
assert.match(graphModelSource, /buildIncomeImpactTimelineGraphModel/);
assert.match(displaySource, /data-income-impact-graph-svg/);
assert.match(displaySource, /renderGraphPath\("preDeathAssets"/);
assert.match(displaySource, /renderGraphPath\("deathTransition"/);
assert.match(displaySource, /renderGraphPath\("postDeathResources"/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents|scenarioTimeline|financialRunway chart contract/);
assert.doesNotMatch(displaySource, /renderFinancialRunwayChart|buildRunwayChartModel|data-income-impact-runway-svg/);
assert.match(componentsSource, /\.income-impact-graph/);
assert.match(componentsSource, /\.income-impact-graph-markers/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-svg|\.income-impact-runway-callout|\.income-impact-runway-phase-strip/);

const graphModel = {
  status: "complete",
  phases: {
    preDeath: { startXRatio: 0, endXRatio: 0.3, available: true },
    deathEvent: { xRatio: 0.3, date: "2031-04-29" },
    postDeath: { startXRatio: 0.3, endXRatio: 1, available: true }
  },
  series: {
    preDeathAssets: [
      { value: 450000, xRatio: 0, yRatio: 0.35 },
      { value: 600000, xRatio: 0.3, yRatio: 0.2 }
    ],
    currentAnchor: null,
    deathTransition: [
      { value: 600000, xRatio: 0.3, yRatio: 0.2 },
      { value: 420000, xRatio: 0.3, yRatio: 0.4 },
      { value: 820000, xRatio: 0.3, yRatio: 0.08 },
      { value: 700000, xRatio: 0.3, yRatio: 0.16 }
    ],
    postDeathResources: [
      { value: 620000, xRatio: 0.4, yRatio: 0.24 },
      { value: 0, xRatio: 0.82, yRatio: 0.68 },
      { value: -110000, xRatio: 1, yRatio: 0.82 }
    ]
  },
  axes: {
    x: {
      ticks: [
        { id: "valuation", label: "Valuation", date: "2026-04-29", xRatio: 0 },
        { id: "death", label: "Death", date: "2031-04-29", xRatio: 0.3 },
        { id: "horizon", label: "Horizon", date: "2071-04-29", xRatio: 1 }
      ]
    },
    y: {
      signed: true,
      zeroYRatio: 0.68,
      ticks: [
        { value: -120000, yRatio: 0.86 },
        { value: 0, yRatio: 0.68 },
        { value: 400000, yRatio: 0.42 },
        { value: 800000, yRatio: 0.1 }
      ]
    }
  },
  markers: [
    { id: "risk-1", ruleId: "survivor-resources-depleted", kind: "risk", severity: "critical", title: "Resources depleted", positionable: true, xRatio: 0.82, yRatio: 0.68 },
    { id: "stable-1", ruleId: "coverage-added-at-death", kind: "stable", severity: "stable", title: "Coverage added", positionable: true, xRatio: 0.3, yRatio: 0.16 }
  ],
  selectedEvent: {
    id: "risk-1",
    severity: "critical",
    title: "Resources depleted",
    summary: "Resources deplete inside the horizon."
  },
  callouts: [
    { id: "assets-before-death", label: "Assets before death", value: 600000, kind: "currency", phase: "deathEvent" },
    { id: "resources-after-obligations", label: "Resources after obligations", value: 700000, kind: "currency", phase: "deathEvent" }
  ],
  dataGaps: [],
  warnings: []
};

const fixture = {
  selectedDeath: { date: "2031-04-29", age: 51 },
  graphModel,
  scenario: {
    timelineFacts: {
      assetsBeforeDeath: 600000,
      survivorAvailableTreatedAssets: 420000,
      coverageAdded: 400000,
      resourcesAfterObligations: 700000,
      monthsCovered: 144,
      depletionDate: "2043-04-29"
    }
  },
  riskEvaluation: {
    events: [
      {
        id: "risk-1",
        ruleId: "survivor-resources-depleted",
        category: "runway",
        severity: "critical",
        title: "Resources depleted",
        summary: "Resources deplete inside the horizon."
      }
    ],
    stableEvents: []
  },
  financialRunway: {},
  warnings: [],
  dataGaps: []
};

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });

assert.match(host.innerHTML, /data-income-impact-graph/);
assert.match(host.innerHTML, /<svg\b/);
assert.match(host.innerHTML, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(host.innerHTML, /data-income-impact-graph-path="deathTransition"/);
assert.match(host.innerHTML, /data-income-impact-graph-path="postDeathResources"/);
assert.match(host.innerHTML, /data-income-impact-graph-zero-baseline/);
assert.match(host.innerHTML, /data-income-impact-graph-marker-kind="risk"/);
assert.match(host.innerHTML, /data-income-impact-graph-marker-kind="stable"/);
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /Resources depleted/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-timeline-paused/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-runway-point/);

console.log("income-loss-impact-scenario-chart-check passed");
