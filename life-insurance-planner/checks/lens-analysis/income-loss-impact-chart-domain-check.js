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
    "\n  window.__incomeImpactPausedTimelineHarness = { renderIncomeImpact, renderPausedTimelineVisualization };\n})(window);\n"
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
  return sandbox.window.__incomeImpactPausedTimelineHarness;
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderIncomeImpact, "function");
assert.equal(typeof harness.renderPausedTimelineVisualization, "function");
assert.match(displaySource, /function renderPausedTimelineVisualization/);
assert.match(displaySource, /Timeline visualization paused while the Income Impact projection model is being rebuilt/);
assert.doesNotMatch(displaySource, /function buildRunwayChartModel/);
assert.doesNotMatch(displaySource, /function renderFinancialRunwayChart/);
assert.doesNotMatch(displaySource, /RUNWAY_CHART_/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-svg/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-line/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-pre-death-line/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-callout/);
assert.doesNotMatch(displaySource, /data-income-impact-marker-legend/);
assert.doesNotMatch(displaySource, /data-income-impact-timeline-marker/);
assert.doesNotMatch(displaySource, /<svg\b|<path\b|<circle\b/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Paused timeline display should not persist scenario or model state."
);

assert.match(componentsSource, /\.income-impact-timeline-paused/);
assert.match(componentsSource, /\.income-impact-paused-facts/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-svg/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-callout/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-phase-strip/);
assert.doesNotMatch(componentsSource, /\.income-impact-marker-lanes/);
assert.doesNotMatch(componentsSource, /\.income-impact-marker-legend/);

assert.match(pageSource, /data-income-impact-display/);
assert.match(pageSource, /data-income-impact-scenario-banner/);
assert.doesNotMatch(pageSource, /income-impact-warning-events-library\.js/);
assert.doesNotMatch(pageSource, /household-financial-position-calculations\.js/);
assert.doesNotMatch(pageSource, /income-loss-impact-timeline-calculations\.js/);
assert.match(
  pageSource,
  /household-wealth-projection-calculations\.js[\s\S]*household-death-event-availability-calculations\.js[\s\S]*household-survivor-runway-calculations\.js[\s\S]*income-impact-scenario-composer-calculations\.js[\s\S]*income-impact-caution-library\.js[\s\S]*income-impact-risk-event-evaluator-calculations\.js[\s\S]*income-loss-impact-display\.js/,
  "Income Impact should load the new stack in order before display."
);

const fixture = {
  selectedDeath: {
    date: "2026-04-29",
    age: 46
  },
  financialRunway: {
    status: "complete",
    startingResources: 400000,
    immediateObligations: 107530,
    annualShortfall: 50041,
    netAvailableResources: 292470,
    depletionDate: "2032-09-29"
  },
  scenario: {
    timelineFacts: {
      assetsBeforeDeath: 400000,
      survivorAvailableTreatedAssets: 100000,
      coverageAdded: 400000,
      resourcesAfterObligations: 292470,
      monthsCovered: 77,
      depletionDate: "2032-09-29"
    }
  },
  riskEvaluation: {
    events: [
      {
        id: "resourcesDepleted",
        ruleId: "survivor-resources-depleted",
        category: "runway",
        title: "Resources depleted",
        severity: "critical",
        summary: "Available resources are projected to reach zero in this scenario.",
        date: "2032-09-29",
        phase: "postDeath",
        monthIndex: 77
      }
    ],
    stableEvents: [
      {
        id: "existingCoverage",
        ruleId: "coverage-added-at-death",
        category: "coverage",
        title: "Existing coverage available",
        severity: "stable",
        summary: "Existing coverage is represented in this preview."
      }
    ]
  },
  timelineEvents: [
    {
      type: "deathEvent",
      label: "Death scenario begins",
      amount: 292470
    }
  ],
  warnings: [],
  dataGaps: []
};

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });

assert.match(host.innerHTML, /data-income-impact-timeline-paused/);
assert.match(host.innerHTML, /Timeline visualization paused while the Income Impact projection model is being rebuilt/);
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /Available resources are projected to reach zero in this scenario\./);
assert.match(host.innerHTML, /data-income-impact-helper-timeline-events-panel/);
assert.doesNotMatch(host.innerHTML, /<svg\b|<path\b|<circle\b/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-svg/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-line/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-point/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-callout/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-marker-legend/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-timeline-marker/);

const calculationFiles = [
  "app/features/lens-analysis/household-financial-position-calculations.js",
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js"
];
assert.deepEqual(
  getChangedFiles(calculationFiles),
  [],
  "Removing the chart surface should not change HFP, timeline formulas, or the warning library."
);

console.log("income-loss-impact-chart-domain-check passed");
