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
    "\n  window.__incomeImpactChartAxisLegendHarness = { renderIncomeImpact };\n})(window);\n"
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
  return sandbox.window.__incomeImpactChartAxisLegendHarness;
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderIncomeImpact, "function");
assert.match(displaySource, /data-income-impact-graph-axis="y"/);
assert.match(displaySource, /data-income-impact-graph-axis="x"/);
assert.match(displaySource, /data-income-impact-graph-zero-baseline/);
assert.match(displaySource, /data-income-impact-graph-marker-kind/);
assert.doesNotMatch(displaySource, /data-income-impact-y-axis-explanation|data-income-impact-x-axis-explanation|data-income-impact-marker-legend/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-zero-line|data-income-impact-runway-axis-label/);
assert.match(componentsSource, /\.income-impact-graph-axis/);
assert.match(componentsSource, /\.income-impact-graph-zero-baseline/);
assert.match(componentsSource, /\.income-impact-graph-markers/);
assert.doesNotMatch(componentsSource, /\.income-impact-marker-legend|\.income-impact-runway-axis-label/);

const graphModel = {
  status: "complete",
  phases: {
    preDeath: { startXRatio: 0, endXRatio: 0.2, available: true },
    deathEvent: { xRatio: 0.2, date: "2030-06-15" },
    postDeath: { startXRatio: 0.2, endXRatio: 1, available: true }
  },
  axes: {
    x: {
      ticks: [
        { id: "valuation", label: "Valuation", date: "2026-06-15", xRatio: 0 },
        { id: "death", label: "Death", date: "2030-06-15", xRatio: 0.2 },
        { id: "horizon", label: "Horizon", date: "2070-06-15", xRatio: 1 }
      ]
    },
    y: {
      signed: true,
      zeroYRatio: 0.66,
      ticks: [
        { value: -100000, yRatio: 0.8 },
        { value: 0, yRatio: 0.66 },
        { value: 500000, yRatio: 0.2 }
      ]
    }
  },
  series: {
    preDeathAssets: [
      { value: 400000, xRatio: 0, yRatio: 0.3 },
      { value: 500000, xRatio: 0.2, yRatio: 0.2 }
    ],
    deathTransition: [
      { value: 500000, xRatio: 0.2, yRatio: 0.2 },
      { value: 300000, xRatio: 0.2, yRatio: 0.42 }
    ],
    postDeathResources: [
      { value: 250000, xRatio: 0.32, yRatio: 0.45 },
      { value: -100000, xRatio: 0.75, yRatio: 0.8 }
    ],
    currentAnchor: null
  },
  markers: [
    { id: "risk", ruleId: "survivor-resources-depleted", kind: "risk", severity: "critical", title: "Resources depleted", positionable: true, xRatio: 0.75, yRatio: 0.66 }
  ],
  selectedEvent: null,
  callouts: [],
  dataGaps: [],
  warnings: []
};

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, {
  timelineResult: {
    selectedDeath: { date: "2030-06-15", age: 50 },
    graphModel,
    financialRunway: { status: "complete" },
    riskEvaluation: { events: [], stableEvents: [] },
    warnings: [],
    dataGaps: []
  }
});

assert.match(host.innerHTML, /data-income-impact-graph-axis="y"/);
assert.match(host.innerHTML, /data-income-impact-graph-axis="x"/);
assert.match(host.innerHTML, /data-income-impact-graph-zero-baseline/);
assert.match(host.innerHTML, /data-income-impact-graph-marker-kind="risk"/);
assert.match(host.innerHTML, /<svg\b/);
assert.doesNotMatch(host.innerHTML, /Y-axis:|X-axis:|data-income-impact-marker-legend/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-svg|data-income-impact-runway-line/);

console.log("income-loss-impact-chart-axis-legend-check passed");
