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
    "\n  window.__incomeImpactChartAxisLegendHarness = { renderFinancialRunwayChart, renderIncomeImpact };\n})(window);\n"
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

function addMonths(dateText, months) {
  const parts = String(dateText).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1 + months, parts[2]);
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function buildScenarioPoints(horizonYears) {
  const deathDate = "2030-06-15";
  const sourcePaths = ["scenarioTimeline.resourceSeries.points"];
  const points = [];
  [-5, -4, -3, -2, -1].forEach(function (yearOffset) {
    points.push({
      id: `pre-death-${Math.abs(yearOffset)}`,
      date: addMonths(deathDate, yearOffset * 12),
      age: 50 + yearOffset,
      relativeMonthIndex: yearOffset * 12,
      relativeYear: yearOffset,
      phase: "preDeath",
      resolution: "baseline",
      startingBalance: 500000,
      growthAmount: 0,
      householdNeed: 90000,
      survivorIncomeOffset: 30000,
      annualShortfall: 60000,
      scheduledObligations: 0,
      endingBalance: 500000,
      displayedBalance: 500000,
      accumulatedUnmetNeed: 0,
      status: "context",
      sourcePaths
    });
  });
  points.push({
    id: "death-point",
    date: deathDate,
    age: 50,
    relativeMonthIndex: 0,
    relativeYear: 0,
    phase: "death",
    resolution: "death",
    startingBalance: 500000,
    growthAmount: 0,
    householdNeed: 90000,
    survivorIncomeOffset: 30000,
    annualShortfall: 60000,
    scheduledObligations: 0,
    endingBalance: 500000,
    displayedBalance: 500000,
    accumulatedUnmetNeed: 0,
    status: "starting",
    sourcePaths
  });
  for (let monthIndex = 1; monthIndex <= 24; monthIndex += 1) {
    const endingBalance = 500000 - monthIndex * 5000;
    points.push({
      id: `post-death-month-${monthIndex}`,
      date: addMonths(deathDate, monthIndex),
      age: 50 + monthIndex / 12,
      relativeMonthIndex: monthIndex,
      relativeYear: monthIndex / 12,
      phase: "postDeath",
      resolution: "monthly",
      startingBalance: endingBalance + 5000,
      growthAmount: 0,
      householdNeed: 90000,
      survivorIncomeOffset: 30000,
      annualShortfall: 60000,
      scheduledObligations: 0,
      endingBalance,
      displayedBalance: Math.max(0, endingBalance),
      accumulatedUnmetNeed: Math.max(0, -endingBalance),
      status: endingBalance <= 0 ? "depleted" : "available",
      sourcePaths
    });
  }
  for (let yearIndex = 3; yearIndex <= horizonYears; yearIndex += 1) {
    const endingBalance = 500000 - yearIndex * 160000;
    points.push({
      id: `post-death-year-${yearIndex}`,
      date: addMonths(deathDate, yearIndex * 12),
      age: 50 + yearIndex,
      relativeMonthIndex: yearIndex * 12,
      relativeYear: yearIndex,
      phase: "postDeath",
      resolution: "annual",
      startingBalance: endingBalance + 160000,
      growthAmount: 0,
      householdNeed: 90000,
      survivorIncomeOffset: 30000,
      annualShortfall: 60000,
      scheduledObligations: 0,
      endingBalance,
      displayedBalance: Math.max(0, endingBalance),
      accumulatedUnmetNeed: Math.max(0, -endingBalance),
      status: endingBalance <= 0 ? "depleted" : "available",
      sourcePaths
    });
  }
  return points;
}

function createFixture(horizonYears) {
  const points = buildScenarioPoints(horizonYears);
  return {
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
      projectionYears: horizonYears,
      projectionPoints: [],
      warnings: [],
      dataGaps: []
    },
    scenarioTimeline: {
      axis: {
        startDate: "2025-06-15",
        deathDate: "2030-06-15",
        endDate: addMonths("2030-06-15", horizonYears * 12)
      },
      resourceSeries: {
        points
      },
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
            amount: 0,
            sourcePaths: ["financialRunway.depletionDate"]
          },
          {
            id: "primaryIncomeStops",
            type: "primaryIncomeStops",
            label: "Primary income stops",
            shortLabel: "Income stops",
            severity: "at-risk",
            date: "2030-06-15",
            age: 50,
            relativeMonthIndex: 0,
            lane: "income",
            advisorCopy: "The household no longer has the primary earner's income in this scenario.",
            amount: 120000,
            sourcePaths: ["incomeBasis.annualIncomeReplacementBase"]
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
            advisorCopy: "The estimate is using available facts and should be improved with the missing items.",
            sourcePaths: ["financialRunway.status"]
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
            advisorCopy: "The selected death date anchors the scenario timeline.",
            sourcePaths: ["selectedDeath.date"]
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
            amount: 500000,
            sourcePaths: ["financialRunway.existingCoverage"]
          }
        ]
      }
    },
    summaryCards: [
      {
        id: "yearsOfFinancialSecurity",
        displayValue: "8 years 4 months",
        status: "complete"
      }
    ],
    timelineEvents: [],
    dataGaps: [],
    warnings: []
  };
}

function getVisibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderFinancialRunwayChart, "function");
assert.equal(typeof harness.renderIncomeImpact, "function");
assert.match(displaySource, /Income Impact Timeline/);
assert.match(displaySource, /Resources before and after the selected death age, based on saved planning facts\./);
assert.match(displaySource, /data-income-impact-chart-explainer/);
assert.match(displaySource, /data-income-impact-y-axis-explanation/);
assert.match(displaySource, /data-income-impact-x-axis-explanation/);
assert.match(displaySource, /data-income-impact-pre-death-region-label/);
assert.match(displaySource, /data-income-impact-death-marker-label/);
assert.match(displaySource, /data-income-impact-post-death-region-label/);
assert.match(displaySource, /data-income-impact-marker-legend/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Chart clarity display should not persist scenario or model state."
);

assert.match(componentsSource, /\.income-impact-chart-explainer/);
assert.match(componentsSource, /\.income-impact-runway-region-label/);
assert.match(componentsSource, /\.income-impact-marker-legend/);
assert.match(componentsSource, /\.income-impact-axis-note/);

const chartHtml = harness.renderFinancialRunwayChart(createFixture(10));
assert.match(chartHtml, /Income Impact Timeline/);
assert.match(chartHtml, /Resources before and after the selected death age, based on saved planning facts\./);
assert.match(chartHtml, /Y-axis: Remaining available resources\./);
assert.match(chartHtml, /X-axis: Years relative to death; key markers show dates and client age\./);
assert.match(chartHtml, /5-year context before death/);
assert.match(chartHtml, /Death occurs/);
assert.match(chartHtml, /Survivor financial runway/);
assert.match(chartHtml, /data-income-impact-marker-legend/);
assert.match(chartHtml, /Critical/);
assert.match(chartHtml, /At Risk/);
assert.match(chartHtml, /Caution/);
assert.match(chartHtml, /Covered/);
assert.match(chartHtml, /Remaining available resources are plotted above \$0/);
assert.match(chartHtml, /Unmet need is tracked separately after resources reach \$0\./);
assert.match(chartHtml, /data-income-impact-timeline-marker-lanes/);
assert.match(chartHtml, /data-income-impact-chart-source="scenarioTimeline\.resourceSeries\.points"/);

const visibleText = getVisibleText(chartHtml);
assert.doesNotMatch(visibleText, /scenarioTimeline|resourceSeries|helper events|calculateIncomeLossImpactTimeline/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: createFixture(10) });
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /data-income-impact-timeline-marker-lanes/);
assert.match(host.innerHTML, /data-income-impact-runway-point-relative-year="10"/);
harness.renderIncomeImpact(host, { timelineResult: createFixture(5) });
assert.match(host.innerHTML, /data-income-impact-runway-point-relative-year="5"/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-point-relative-year="10"/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js",
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
  "pages/hlv-results.html",
  "styles.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Chart axis/legend pass should not change helpers, warning definitions, methods, model builder, adapter, result pages, quick flows, or styles.css."
);

console.log("income-loss-impact-chart-axis-legend-check passed");
