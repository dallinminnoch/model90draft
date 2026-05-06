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
assert.match(displaySource, /data-income-impact-timeline-paused/);
assert.doesNotMatch(displaySource, /data-income-impact-y-axis-explanation/);
assert.doesNotMatch(displaySource, /data-income-impact-x-axis-explanation/);
assert.doesNotMatch(displaySource, /data-income-impact-marker-legend/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-zero-line/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-axis-label/);
assert.doesNotMatch(componentsSource, /\.income-impact-marker-legend/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-axis-label/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, {
  timelineResult: {
    selectedDeath: { date: "2030-06-15", age: 50 },
    financialRunway: { status: "complete" },
    scenarioTimeline: { pivotalEvents: { risks: [], stable: [] } },
    timelineEvents: [],
    warnings: [],
    dataGaps: []
  }
});

assert.match(host.innerHTML, /data-income-impact-timeline-paused/);
assert.match(host.innerHTML, /Timeline visualization paused/);
assert.doesNotMatch(host.innerHTML, /Y-axis:|X-axis:|Critical<\/span>|At Risk<\/span>|Caution<\/span>|Covered<\/span>/);
assert.doesNotMatch(host.innerHTML, /<svg\b|<path\b|<circle\b/);

console.log("income-loss-impact-chart-axis-legend-check passed");
