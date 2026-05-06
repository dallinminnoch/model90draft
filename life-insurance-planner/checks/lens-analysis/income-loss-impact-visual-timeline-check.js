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
  scenario: {
    timelineFacts: {
      assetsBeforeDeath: 225000,
      survivorAvailableTreatedAssets: 100000,
      coverageAdded: 500000,
      resourcesAfterObligations: 500000,
      monthsCovered: 100,
      depletionDate: "2038-10-15"
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
assert.match(timelineHtml, /data-income-impact-paused-fact="assets-before-death"/);
assert.match(timelineHtml, /data-income-impact-paused-fact="resources-after-obligations"/);
assert.match(timelineHtml, /\$225,000/);
assert.match(timelineHtml, /\$500,000/);
assert.doesNotMatch(timelineHtml, /<svg\b|<path\b|<circle\b/);
assert.doesNotMatch(timelineHtml, /data-income-impact-runway-point|data-income-impact-runway-line/);

console.log("income-loss-impact-visual-timeline-check passed");
