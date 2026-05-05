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
    "\n  window.__incomeImpactMarkerLaneHarness = { renderFinancialRunwayChart, renderPivotalMarkerLanes, renderPivotalRiskPanel, renderIncomeImpact };\n})(window);\n"
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
  return sandbox.window.__incomeImpactMarkerLaneHarness;
}

function extractMarkerLaneHtml(chartHtml) {
  const start = chartHtml.indexOf("data-income-impact-timeline-marker-lanes");
  const end = chartHtml.indexOf("income-impact-chart-hover-label");
  assert(start >= 0, "Marker lanes should render under the runway chart.");
  assert(end > start, "Marker lanes should render before the chart hover label.");
  return chartHtml.slice(start, end);
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderFinancialRunwayChart, "function");
assert.equal(typeof harness.renderPivotalMarkerLanes, "function");
assert.equal(typeof harness.renderPivotalRiskPanel, "function");
assert.match(displaySource, /renderPivotalMarkerLanes/);
assert.match(displaySource, /scenarioTimeline\.pivotalEvents/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis|needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Timeline marker lane display should not persist scenario or model state."
);

const markerRendererSource = displaySource.match(/function calculateMonthOffset[\s\S]*?function renderFinancialRunwayChart/)?.[0] || "";
assert.doesNotMatch(
  markerRendererSource,
  /financialRunway\.annualShortfall|financialRunway\.depletionDate|timelineEvents\./,
  "Marker lanes should display pivotal events, not duplicate risk calculations."
);
assert.match(componentsSource, /\.income-impact-marker-lanes/);
assert.match(componentsSource, /\.income-impact-marker-lane/);
assert.match(componentsSource, /\.income-impact-marker-pill/);
assert.doesNotMatch(pageSource, /data-income-impact-timeline-marker-lanes/);

const fixture = {
  selectedDeath: {
    date: "2030-06-15",
    age: 50
  },
  financialRunway: {
    status: "complete",
    startingResources: 600000,
    existingCoverage: 500000,
    availableAssets: 100000,
    immediateObligations: 100000,
    netAvailableResources: 500000,
    annualHouseholdNeed: 90000,
    annualSurvivorIncome: 30000,
    annualShortfall: 60000,
    yearsOfSecurity: 8,
    monthsOfSecurity: 4,
    totalMonthsOfSecurity: 100,
    depletionYear: 2038,
    depletionDate: "2038-10-15",
    projectionMode: "current-dollar",
    projectionYears: 10,
    projectionPoints: [
      {
        yearIndex: 0,
        date: "2030-06-15",
        age: 50,
        startingBalance: 500000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: 500000,
        status: "starting"
      },
      {
        yearIndex: 1,
        date: "2031-06-15",
        age: 51,
        startingBalance: 500000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: 440000,
        status: "available"
      },
      {
        yearIndex: 9,
        date: "2039-06-15",
        age: 59,
        startingBalance: 20000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: -40000,
        status: "depleted"
      },
      {
        yearIndex: 10,
        date: "2040-06-15",
        age: 60,
        startingBalance: -40000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: -100000,
        status: "depleted"
      }
    ],
    warnings: [],
    dataGaps: []
  },
  scenarioTimeline: {
    pivotalEvents: {
      risks: [
        {
          id: "resourcesDepleted",
          type: "resourcesDepleted",
          label: "Resources depleted",
          shortLabel: "Depleted",
          severity: "critical",
          date: "2038-10-15",
          age: 58,
          relativeMonthIndex: 100,
          lane: "resources",
          advisorCopy: "Available resources are projected to reach zero in this scenario.",
          amount: 0
        },
        {
          id: "monthlyBudgetDeficitBegins",
          type: "monthlyBudgetDeficitBegins",
          label: "Household budget deficit begins",
          shortLabel: "Deficit",
          severity: "at-risk",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "income",
          advisorCopy: "Annual household need exceeds survivor income in this scenario.",
          amount: 60000
        },
        {
          id: "primaryIncomeStops",
          type: "primaryIncomeStops",
          label: "Primary income stops",
          shortLabel: "Income stops",
          severity: "at-risk",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "income",
          advisorCopy: "The insured income stream stops at the selected death date.",
          amount: 120000
        },
        {
          id: "partialEstimateOnly",
          type: "partialEstimateOnly",
          label: "Partial estimate only",
          shortLabel: "Partial",
          severity: "caution",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "dataQuality",
          advisorCopy: "The estimate is using available facts and should be improved with the missing items."
        },
        {
          id: "housingPaymentAtRisk",
          type: "housingPaymentAtRisk",
          label: "Housing payment at risk",
          shortLabel: "Housing risk",
          severity: "caution",
          lane: "housing",
          advisorCopy: "Mortgage timing is missing, so housing risk cannot be dated."
        }
      ],
      stable: [
        {
          id: "deathEvent",
          type: "deathEvent",
          label: "Death scenario begins",
          shortLabel: "Death",
          severity: "stable",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "resources",
          advisorCopy: "The selected death date anchors the scenario timeline."
        },
        {
          id: "existingCoverageAvailable",
          type: "existingCoverageAvailable",
          label: "Existing coverage available",
          shortLabel: "Coverage",
          severity: "stable",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "resources",
          advisorCopy: "Existing coverage is included in money available at death when present.",
          amount: 500000
        }
      ]
    }
  },
  dataGaps: [],
  warnings: []
};

const chartHtml = harness.renderFinancialRunwayChart(fixture);
assert.match(chartHtml, /data-income-impact-runway-svg/);
assert.match(chartHtml, /data-income-impact-timeline-marker-lanes/);
assert(
  chartHtml.indexOf("data-income-impact-runway-svg") < chartHtml.indexOf("data-income-impact-timeline-marker-lanes"),
  "Marker lanes should render under the runway SVG."
);

const markerLaneHtml = extractMarkerLaneHtml(chartHtml);
assert.match(markerLaneHtml, /data-income-impact-marker-lane="resources"/);
assert.match(markerLaneHtml, /data-income-impact-marker-lane="income"/);
assert.match(markerLaneHtml, /data-income-impact-marker-lane="dataQuality"/);
assert.match(markerLaneHtml, /data-income-impact-marker-lane="stable"/);
assert.match(markerLaneHtml, /data-income-impact-marker-undated/);
assert.match(markerLaneHtml, /data-income-impact-marker-severity="critical"/);
assert.match(markerLaneHtml, /data-income-impact-marker-severity="at-risk"/);
assert.match(markerLaneHtml, /data-income-impact-marker-severity="caution"/);
assert.match(markerLaneHtml, /data-income-impact-marker-kind="stable"/);
assert.match(markerLaneHtml, /Depleted/);
assert.match(markerLaneHtml, /Deficit/);
assert.match(markerLaneHtml, /Income stops/);
assert.match(markerLaneHtml, /Partial/);
assert.match(markerLaneHtml, /Housing risk/);
assert.match(markerLaneHtml, /Death/);
assert.match(markerLaneHtml, /Coverage/);
assert.match(markerLaneHtml, /data-income-impact-marker-group-count="2"/);
assert.doesNotMatch(markerLaneHtml, /Household budget deficit begins|Existing coverage available/);
assert.doesNotMatch(markerLaneHtml, /\$|60,000|120,000|500,000/);

const riskPanelHtml = harness.renderPivotalRiskPanel(fixture);
assert.match(riskPanelHtml, /Household budget deficit begins/);
assert.match(riskPanelHtml, /\$60,000/);
assert.match(riskPanelHtml, /Annual household need exceeds survivor income in this scenario\./);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });
assert.match(host.innerHTML, /data-income-impact-timeline-marker-lanes/);
assert.match(host.innerHTML, /Depleted/);
harness.renderIncomeImpact(host, {
  timelineResult: {
    ...fixture,
    scenarioTimeline: {
      pivotalEvents: {
        risks: [
          {
            id: "mortgagePayoffAtDeath",
            type: "mortgagePayoffAtDeath",
            label: "Mortgage payoff at death",
            shortLabel: "Mortgage payoff",
            severity: "caution",
            date: "2030-06-15",
            relativeMonthIndex: 0,
            lane: "housing",
            advisorCopy: "Mortgage payoff is included in immediate obligations for this preview."
          }
        ],
        stable: []
      }
    }
  }
});
assert.match(host.innerHTML, /Mortgage payoff/);
assert.doesNotMatch(host.innerHTML, /Depleted/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js",
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "pages/income-loss-impact.html",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "styles.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Timeline marker lane pass should not change helpers, warning definitions, methods, model builder, adapter, HTML, result pages, quick flows, or styles.css."
);

console.log("income-loss-impact-timeline-marker-lanes-check passed");
