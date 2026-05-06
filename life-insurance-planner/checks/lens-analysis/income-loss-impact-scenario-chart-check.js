#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    return output
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactScenarioChartHarness = { renderIncomeImpact, renderPivotalRiskPanel };\n})(window);\n"
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
const componentsSource = readRepoFile("components.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderIncomeImpact, "function");
assert.equal(typeof harness.renderPivotalRiskPanel, "function");
assert.match(displaySource, /renderPausedTimelineVisualization/);
assert.doesNotMatch(displaySource, /renderFinancialRunwayChart|buildRunwayChartModel|data-income-impact-runway-svg/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-svg|\.income-impact-runway-callout|\.income-impact-runway-phase-strip/);

const fixture = {
  selectedDeath: { date: "2030-06-15", age: 50 },
  financialRunway: {
    status: "complete",
    netAvailableResources: 500000,
    depletionDate: "2038-10-15"
  },
  scenarioTimeline: {
    pivotalEvents: {
      risks: [
        {
          id: "resourcesDepleted",
          type: "resourcesDepleted",
          label: "Resources depleted",
          severity: "critical",
          advisorCopy: "Available resources are projected to reach zero in this scenario."
        }
      ],
      stable: []
    }
  },
  timelineEvents: [],
  warnings: [],
  dataGaps: []
};

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });

assert.match(host.innerHTML, /data-income-impact-timeline-paused/);
assert.match(host.innerHTML, /No previous-asset or income trendline is being rendered/);
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /Resources depleted/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-runway-point/);
assert.doesNotMatch(host.innerHTML, /<svg\b|<path\b|<circle\b/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/household-financial-position-calculations.js",
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Scenario chart removal should not change HFP, timeline formulas, or the warning library."
);

console.log("income-loss-impact-scenario-chart-check passed");
