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
    "\n  window.__incomeImpactScenarioChartHarness = { renderFinancialRunwayChart, renderPivotalRiskPanel, renderIncomeImpact };\n})(window);\n"
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
      id: `pre-${Math.abs(yearOffset)}`,
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
      id: `month-${monthIndex}`,
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
      id: `year-${yearIndex}`,
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

function createFixture(horizonYears = 10, mortgageLabel = "baseline") {
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
      immediateObligations: mortgageLabel === "payoff" ? 250000 : 100000,
      netAvailableResources: mortgageLabel === "payoff" ? 350000 : 500000,
      annualHouseholdNeed: 90000,
      annualSurvivorIncome: 30000,
      annualShortfall: 60000,
      yearsOfSecurity: 8,
      monthsOfSecurity: 4,
      totalMonthsOfSecurity: 100,
      depletionYear: 2038,
      depletionDate: "2038-10-15",
      projectionYears: horizonYears,
      projectionPoints: [],
      warnings: [],
      dataGaps: []
    },
    scenarioTimeline: {
      scenario: {
        deathAge: 50,
        deathDate: "2030-06-15",
        projectionHorizonYears: horizonYears,
        mortgageTreatmentOverride: mortgageLabel === "payoff" ? "payOffMortgage" : "followAssumptions"
      },
      axis: {
        startDate: "2025-06-15",
        deathDate: "2030-06-15",
        endDate: addMonths("2030-06-15", horizonYears * 12),
        preDeathYears: 5,
        monthlyResolutionMonths: 24,
        postMonth24Resolution: "annual"
      },
      resourceSeries: {
        yAxis: "remainingAvailableResources",
        points: buildScenarioPoints(horizonYears)
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
            amount: 0
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
          }
        ]
      }
    },
    timelineEvents: [],
    dataGaps: [],
    warnings: []
  };
}

function getAttributeValues(html, attributeName) {
  const values = [];
  const pattern = new RegExp(`${attributeName}="([^"]*)"`, "g");
  let match = pattern.exec(html);
  while (match) {
    values.push(match[1]);
    match = pattern.exec(html);
  }
  return values;
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderFinancialRunwayChart, "function");
assert.match(displaySource, /getScenarioResourcePoints/);
assert.match(displaySource, /scenarioTimeline\.resourceSeries/);
assert.match(displaySource, /displayedBalance/);
assert.match(displaySource, /data-income-impact-pre-death-region/);
assert.match(displaySource, /data-income-impact-runway-death/);
assert.match(displaySource, /data-income-impact-accumulated-unmet-need/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis|needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Scenario chart display should not persist scenario or model state."
);

const chartModelSource = displaySource.match(/function getScenarioTimeline[\s\S]*?function calculateMonthOffset/)?.[0] || "";
assert.doesNotMatch(
  chartModelSource,
  /runningBalance|annualShortfall\s*\*|endingBalance\s*=|projectionPoints\.push/,
  "Scenario chart display should map helper-provided points, not duplicate projection math."
);
assert.match(componentsSource, /\.income-impact-pre-death-region/);
assert.match(componentsSource, /\.income-impact-runway-death-marker/);
assert.match(componentsSource, /\.income-impact-unmet-need/);

const fixture = createFixture(10);
const chartHtml = harness.renderFinancialRunwayChart(fixture);
assert.match(chartHtml, /data-income-impact-chart-source="scenarioTimeline\.resourceSeries\.points"/);
assert.match(chartHtml, /Financial Runway Timeline/);
assert.match(chartHtml, /data-income-impact-pre-death-region/);
assert.match(chartHtml, /data-income-impact-runway-death/);
assert.match(chartHtml, /data-income-impact-runway-death-date="2030-06-15"/);
assert.match(chartHtml, /data-income-impact-runway-point-phase="preDeath"/);
assert.match(chartHtml, /data-income-impact-runway-point-phase="death"/);
assert.match(chartHtml, /data-income-impact-runway-point-phase="postDeath"/);
assert.match(chartHtml, /data-income-impact-runway-point-resolution="baseline"/);
assert.match(chartHtml, /data-income-impact-runway-point-resolution="death"/);
assert.equal((chartHtml.match(/data-income-impact-runway-point-resolution="monthly"/g) || []).length, 24);
assert.ok((chartHtml.match(/data-income-impact-runway-point-resolution="annual"/g) || []).length >= 1);
assert.match(chartHtml, /data-income-impact-runway-point-relative-month="-60"/);
assert.match(chartHtml, /data-income-impact-runway-point-relative-month="0"/);
assert.match(chartHtml, /data-income-impact-runway-point-relative-month="1"/);
assert.match(chartHtml, /data-income-impact-runway-point-relative-month="24"/);
assert.match(chartHtml, /data-income-impact-runway-point-relative-month="36"/);
assert.match(chartHtml, /data-income-impact-runway-point-relative-year="10"/);
assert.match(chartHtml, /5 yrs before/);
assert.match(chartHtml, />Death</);
assert.match(chartHtml, /Year 10/);
assert.match(chartHtml, /data-income-impact-accumulated-unmet-need/);
assert.match(chartHtml, /Accumulated unmet need after resources are depleted/);
assert.match(chartHtml, /data-income-impact-timeline-marker-lanes/);
assert.doesNotMatch(chartHtml, /data-income-impact-scenario-chart-fallback/);

const displayedBalances = getAttributeValues(chartHtml, "data-income-impact-runway-point-displayed-balance")
  .filter(Boolean)
  .map(Number);
assert.ok(displayedBalances.length > 0);
assert(displayedBalances.every((value) => Number.isFinite(value) && value >= 0), "Displayed y-axis balances should never be below zero.");
const accumulatedUnmetNeeds = getAttributeValues(chartHtml, "data-income-impact-runway-point-accumulated-unmet-need")
  .filter(Boolean)
  .map(Number);
assert.ok(accumulatedUnmetNeeds.some((value) => value > 0), "Accumulated unmet need should be carried separately.");

const fallbackHtml = harness.renderFinancialRunwayChart({
  selectedDeath: {
    date: "2030-06-15",
    age: 50
  },
  financialRunway: {
    status: "complete",
    netAvailableResources: 500000,
    startingResources: 600000,
    immediateObligations: 100000,
    annualShortfall: 60000,
    totalMonthsOfSecurity: 100,
    depletionDate: "2038-10-15",
    projectionYears: 10,
    projectionPoints: [
      {
        yearIndex: 0,
        date: "2030-06-15",
        age: 50,
        startingBalance: 500000,
        endingBalance: 500000,
        status: "starting"
      },
      {
        yearIndex: 10,
        date: "2040-06-15",
        age: 60,
        startingBalance: -40000,
        endingBalance: -100000,
        status: "depleted"
      }
    ]
  },
  scenarioTimeline: {
    resourceSeries: {
      points: []
    },
    pivotalEvents: {
      risks: [],
      stable: []
    }
  }
});
assert.match(fallbackHtml, /data-income-impact-chart-source="financialRunway\.projectionPoints"/);
assert.match(fallbackHtml, /data-income-impact-scenario-chart-fallback/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: createFixture(10) });
assert.match(host.innerHTML, /data-income-impact-runway-point-relative-year="10"/);
assert.match(host.innerHTML, /data-income-impact-timeline-marker-lanes/);
harness.renderIncomeImpact(host, { timelineResult: createFixture(5) });
assert.match(host.innerHTML, /data-income-impact-runway-point-relative-year="5"/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-point-relative-year="10"/);
harness.renderIncomeImpact(host, { timelineResult: createFixture(10, "payoff") });
assert.match(host.innerHTML, /\$250,000/);
assert.match(host.innerHTML, /data-income-impact-risk-panel/);

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
  "Scenario chart pass should not change helpers, warning definitions, methods, model builder, adapter, HTML, result pages, quick flows, or styles.css."
);

console.log("income-loss-impact-scenario-chart-check passed");
