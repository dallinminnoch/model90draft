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
    const output = childProcess.execFileSync("git", ["diff", "--name-only", "--", ...relativePaths], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactFinancialRunwayHarness = { renderFinancialSecurityCard, renderFinancialRunwayCards, renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactFinancialRunwayHarness;
}

function makeGraphModel() {
  return {
    status: "complete",
    phases: {
      preDeath: { startXRatio: 0, endXRatio: 0.25, available: true },
      deathEvent: { date: "2030-06-15", xRatio: 0.25 },
      postDeath: { startXRatio: 0.25, endXRatio: 1, available: true }
    },
    series: {
      preDeathAssets: [
        { value: 225000, xRatio: 0, yRatio: 0.42 },
        { value: 300000, xRatio: 0.25, yRatio: 0.32 }
      ],
      currentAnchor: null,
      deathTransition: [
        { value: 300000, xRatio: 0.25, yRatio: 0.32 },
        { value: 100000, xRatio: 0.25, yRatio: 0.54 },
        { value: 600000, xRatio: 0.25, yRatio: 0.1 },
        { value: 500000, xRatio: 0.25, yRatio: 0.18 }
      ],
      postDeathResources: [
        { value: 440000, xRatio: 0.35, yRatio: 0.24 },
        { value: -40000, xRatio: 0.82, yRatio: 0.78 }
      ]
    },
    axes: {
      x: {
        ticks: [
          { id: "valuation", label: "Valuation", date: "2026-06-15", xRatio: 0 },
          { id: "death", label: "Death", date: "2030-06-15", xRatio: 0.25 },
          { id: "horizon", label: "Horizon", date: "2070-06-15", xRatio: 1 }
        ]
      },
      y: {
        signed: true,
        zeroYRatio: 0.7,
        ticks: [
          { value: -100000, yRatio: 0.84 },
          { value: 0, yRatio: 0.7 },
          { value: 600000, yRatio: 0.1 }
        ]
      }
    },
    markers: [],
    selectedEvent: null,
    callouts: [
      { id: "assets-before-death", label: "Assets before death", value: 300000, kind: "currency", phase: "deathEvent" },
      { id: "resources-after-obligations", label: "Resources after obligations", value: 500000, kind: "currency", phase: "deathEvent" },
      { id: "runway-months-covered", label: "Runway covered", value: 100, kind: "months", phase: "postDeath" }
    ],
    warnings: [],
    dataGaps: []
  };
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const harness = createDisplayHarness(displaySource);

assert.match(displaySource, /data-income-impact-graph/);
assert.match(displaySource, /composeIncomeImpactScenario/);
assert.match(displaySource, /evaluateIncomeImpactRiskEvents/);
assert.match(displaySource, /buildIncomeImpactTimelineGraphModel/);
assert.match(displaySource, /composeIncomeImpactScenario\.timelineFacts/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents|scenarioTimeline/);
assert.doesNotMatch(displaySource, /data-income-impact-financial-runway|data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-runway-point/);
assert.match(displaySource, /Immediate Money Available/);
assert.match(displaySource, /Immediate Obligations/);
assert.match(displaySource, /Annual Household Shortfall/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/
);

const fixture = {
  selectedDeath: { date: "2030-06-15", age: 50 },
  graphModel: makeGraphModel(),
  scenario: {
    timelineFacts: {
      assetsBeforeDeath: 225000,
      survivorAvailableTreatedAssets: 100000,
      coverageAdded: 500000,
      resourcesAfterObligations: 500000,
      monthsCovered: 100,
      depletionDate: "2038-10-15",
      accumulatedUnmetNeed: 0
    }
  },
  financialRunway: {
    status: "complete",
    startingResources: 600000,
    existingCoverage: 500000,
    availableAssets: 100000,
    immediateObligations: 100000,
    netAvailableResources: 500000,
    annualShortfall: 60000,
    yearsOfSecurity: 8,
    monthsOfSecurity: 4,
    totalMonthsOfSecurity: 100,
    warnings: [],
    dataGaps: []
  },
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "8 years 4 months",
      status: "complete"
    }
  ],
  riskEvaluation: {
    events: [],
    stableEvents: []
  },
  dataGaps: [],
  warnings: []
};

const cardsHtml = harness.renderFinancialRunwayCards(fixture);
assert.match(cardsHtml, /Immediate Money Available/);
assert.match(cardsHtml, /\$600,000/);
assert.match(cardsHtml, /Immediate Obligations/);
assert.match(cardsHtml, /\$100,000/);
assert.match(cardsHtml, /Annual Household Shortfall/);
assert.match(cardsHtml, /\$60,000/);

const securityHtml = harness.renderFinancialSecurityCard(fixture);
assert.match(securityHtml, /Years of Financial Security/);
assert.match(securityHtml, /8 years 4 months/);
assert.match(securityHtml, /Existing coverage \+ available assets, less immediate obligations, divided by estimated annual household shortfall\./);
assert.doesNotMatch(securityHtml, /final recommendation|fully protected/i);

const timelineHtml = harness.renderTimeline(fixture);
assert.match(timelineHtml, /Financial Runway if Death Occurs at Selected Age/);
assert.match(timelineHtml, /data-income-impact-graph/);
assert.match(timelineHtml, /data-income-impact-graph-svg/);
assert.match(timelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(timelineHtml, /data-income-impact-graph-path="deathTransition"/);
assert.match(timelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.match(timelineHtml, /data-income-impact-graph-callout="assets-before-death"/);
assert.match(timelineHtml, /data-income-impact-graph-callout="resources-after-obligations"/);
assert.match(timelineHtml, /8 years 4 months/);
assert.doesNotMatch(timelineHtml, /data-income-impact-financial-runway|data-income-impact-runway-line|data-income-impact-runway-point/);
assert.doesNotMatch(timelineHtml, /Supporting timeline events|calculateIncomeLossImpactTimeline|Selected scenario timeline/);

const unavailableTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: { status: "unavailable" },
  dataGaps: [
    {
      code: "missing-survivor-income",
      label: "Survivor income is missing."
    }
  ],
  warnings: [
    {
      code: "missing-annual-shortfall",
      message: "Years of Financial Security was not calculated because annual shortfall inputs are missing."
    }
  ]
});
assert.match(unavailableTimelineHtml, /data-income-impact-timeline-paused/);
assert.match(unavailableTimelineHtml, /Timeline graph unavailable with the current profile facts/);
assert.match(unavailableTimelineHtml, /Survivor income is missing\./);
assert.match(unavailableTimelineHtml, /annual shortfall inputs are missing/);
assert.doesNotMatch(unavailableTimelineHtml, /data-income-impact-graph-svg/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Financial runway pass should not change methods, model builder, adapter, result pages, Step 3, or quick flows."
);

console.log("income-loss-impact-financial-runway-check passed");
