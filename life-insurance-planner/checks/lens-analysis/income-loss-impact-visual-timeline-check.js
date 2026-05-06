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
    "\n  window.__incomeImpactVisualTimelineHarness = { renderFinancialSecurityCard, renderTimeline };\n})(window);\n"
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

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderFinancialSecurityCard, "function");
assert.equal(typeof harness.renderTimeline, "function");
assert.match(pageSource, /data-income-impact-death-age-slider/);
assert.match(displaySource, /data-income-impact-visual-timeline/);
assert.match(displaySource, /renderPausedTimelineVisualization/);
assert.match(displaySource, /timelineEvents/);
assert.doesNotMatch(displaySource, /renderFinancialRunwayChart|buildRunwayChartModel|renderPlaceholderTimelineChart/);
assert.doesNotMatch(displaySource, /data-income-impact-timeline-month|data-income-impact-runway-svg|data-income-impact-runway-line/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis|needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Impact paused timeline should not persist slider or model state."
);

const fixture = {
  selectedDeath: {
    date: "2030-06-15",
    age: 50
  },
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "8 years 4 months",
      status: "complete"
    }
  ],
  financialRunway: {
    status: "complete",
    yearsOfSecurity: 8,
    monthsOfSecurity: 4,
    totalMonthsOfSecurity: 100,
    warnings: [],
    dataGaps: []
  },
  scenarioTimeline: {
    pivotalEvents: {
      risks: [],
      stable: []
    }
  },
  timelineEvents: [
    { type: "death", date: "2030-06-15", age: 50, label: "Selected death event" },
    { type: "incomeStops", date: "2030-06-15", age: 50, label: "Insured income stops", amount: 120000 }
  ],
  dataGaps: [],
  warnings: []
};

const cardHtml = harness.renderFinancialSecurityCard(fixture);
assert.match(cardHtml, /Years of Financial Security/);
assert.match(cardHtml, /8 years 4 months/);
assert.match(cardHtml, /Fact-based runway estimate/);

const timelineHtml = harness.renderTimeline(fixture);
assert.match(timelineHtml, /data-income-impact-helper-timeline/);
assert.match(timelineHtml, /data-income-impact-timeline-paused/);
assert.match(timelineHtml, /Timeline visualization paused/);
assert.match(timelineHtml, /Supporting timeline events/);
assert.match(timelineHtml, /Selected death event/);
assert.match(timelineHtml, /Insured income stops/);
assert.doesNotMatch(timelineHtml, /<svg\b|<path\b|<circle\b/);
assert.doesNotMatch(timelineHtml, /data-income-impact-runway-point|data-income-impact-runway-line/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/household-financial-position-calculations.js",
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js",
  "styles.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Paused timeline removal should not change HFP, timeline formulas, warning library, or styles.css."
);

console.log("income-loss-impact-visual-timeline-check passed");
