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
    "\n  window.__incomeImpactChartDomainHarness = { buildRunwayChartModel, renderFinancialRunwayChart };\n})(window);\n"
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
  return sandbox.window.__incomeImpactChartDomainHarness;
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

function createPoint(options) {
  return {
    id: options.id,
    date: options.date,
    age: options.age,
    relativeMonthIndex: options.relativeMonthIndex,
    relativeYear: options.relativeMonthIndex / 12,
    phase: options.phase,
    resolution: options.resolution,
    startingBalance: options.balance,
    growthAmount: 0,
    householdNeed: 60000,
    survivorIncomeOffset: 0,
    annualShortfall: 60000,
    scheduledObligations: 0,
    endingBalance: options.balance,
    displayedBalance: Math.max(0, options.balance),
    accumulatedUnmetNeed: Math.max(0, -options.balance),
    status: options.status || "available",
    sourcePaths: ["scenarioTimeline.resourceSeries.points"]
  };
}

function buildScenarioPoints(options) {
  const safeOptions = options || {};
  const deathDate = safeOptions.deathDate || "2026-01-01";
  const deathAge = safeOptions.deathAge || 46;
  const horizonYears = safeOptions.horizonYears || 40;
  const points = [];

  if (safeOptions.includePreDeathPoints) {
    for (let monthIndex = -60; monthIndex < 0; monthIndex += 1) {
      points.push(createPoint({
        id: `pre-death-month-${Math.abs(monthIndex)}`,
        date: addMonths(deathDate, monthIndex),
        age: deathAge + monthIndex / 12,
        relativeMonthIndex: monthIndex,
        phase: "preDeath",
        resolution: "monthly",
        balance: 300000 + (monthIndex + 60) * 2000
      }));
    }
  }

  points.push(createPoint({
    id: "death-point",
    date: deathDate,
    age: deathAge,
    relativeMonthIndex: 0,
    phase: "death",
    resolution: "death",
    balance: 420000,
    status: "starting"
  }));

  for (let monthIndex = 1; monthIndex <= 24; monthIndex += 1) {
    points.push(createPoint({
      id: `post-death-month-${monthIndex}`,
      date: addMonths(deathDate, monthIndex),
      age: deathAge + monthIndex / 12,
      relativeMonthIndex: monthIndex,
      phase: "postDeath",
      resolution: "monthly",
      balance: 420000 - monthIndex * 2000
    }));
  }

  for (let yearIndex = 3; yearIndex <= horizonYears; yearIndex += 1) {
    points.push(createPoint({
      id: `post-death-year-${yearIndex}`,
      date: addMonths(deathDate, yearIndex * 12),
      age: deathAge + yearIndex,
      relativeMonthIndex: yearIndex * 12,
      phase: "postDeath",
      resolution: "annual",
      balance: 420000 - yearIndex * 24000
    }));
  }

  return points;
}

function createTimelineResult(options) {
  const safeOptions = options || {};
  const deathDate = safeOptions.deathDate || "2026-01-01";
  const horizonYears = safeOptions.horizonYears || 40;
  return {
    selectedDeath: {
      date: deathDate,
      age: safeOptions.deathAge || 46
    },
    financialRunway: {
      status: "complete",
      startingResources: 500000,
      immediateObligations: 80000,
      netAvailableResources: 420000,
      annualShortfall: 60000,
      projectionYears: horizonYears,
      projectionPoints: [],
      warnings: [],
      dataGaps: []
    },
    scenarioTimeline: {
      scenario: {
        deathAge: safeOptions.deathAge || 46,
        deathDate,
        projectionHorizonYears: horizonYears,
        mortgageTreatmentOverride: "followAssumptions"
      },
      axis: {
        startDate: addMonths(deathDate, -60),
        deathDate,
        endDate: addMonths(deathDate, horizonYears * 12),
        preDeathYears: 5,
        monthlyResolutionMonths: 24,
        postMonth24Resolution: "annual"
      },
      resourceSeries: {
        yAxis: "remainingAvailableResources",
        points: buildScenarioPoints({
          deathDate,
          deathAge: safeOptions.deathAge || 46,
          horizonYears,
          includePreDeathPoints: safeOptions.includePreDeathPoints === true
        })
      },
      pivotalEvents: {
        risks: [],
        stable: []
      }
    },
    timelineEvents: [],
    dataGaps: [],
    warnings: []
  };
}

function getAttribute(html, selector) {
  const match = html.match(selector);
  return match ? Number(match[1]) : null;
}

function getMaxDisplayedBalance(model) {
  return Math.max.apply(null, model.points.map(function (point) {
    return Math.max(0, Number(point.displayedBalance || 0));
  }));
}

function getHighestPointY(model) {
  return Math.min.apply(null, model.points.map(function (point) {
    return Number(point.y);
  }));
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.buildRunwayChartModel, "function");
assert.equal(typeof harness.renderFinancialRunwayChart, "function");
assert.match(displaySource, /resolveScenarioAxisDomainMonths/);
assert.match(displaySource, /axis\.preDeathYears/);
assert.match(displaySource, /RUNWAY_CHART_TOP_HEADROOM_RATIO/);
assert.match(displaySource, /resolveRunwayChartMaxBalance/);

const currentDeathResult = createTimelineResult({
  deathDate: "2026-01-01",
  deathAge: 46,
  horizonYears: 40,
  includePreDeathPoints: false
});
const currentDeathModel = harness.buildRunwayChartModel(currentDeathResult);
const currentDeathHtml = harness.renderFinancialRunwayChart(currentDeathResult);

assert.equal(currentDeathModel.minRelativeMonthIndex, -60);
assert.equal(currentDeathModel.maxRelativeMonthIndex, 480);
assert.ok(
  currentDeathModel.maxBalance > getMaxDisplayedBalance(currentDeathModel),
  "Y-domain max should include top headroom above the max displayed balance."
);
assert.ok(
  getHighestPointY(currentDeathModel) >= currentDeathModel.yTop + 20,
  "Highest current-date point should render visibly below the plot top."
);
assert.ok(
  currentDeathModel.deathPoint.y >= currentDeathModel.yTop + 20,
  "Death marker should have vertical headroom below the plot top."
);
assert.ok(currentDeathModel.preDeathRegion, "Current-date death should still render a pre-death region from the axis contract.");
assert.ok(
  currentDeathModel.preDeathRegion.width >= 80,
  "Pre-death region should be visible, not collapsed to a marker edge."
);
assert.ok(
  currentDeathModel.deathPoint.x > currentDeathModel.xStart + 80,
  "Death marker should not be plotted at plot xStart when the axis includes five pre-death years."
);
assert.match(currentDeathHtml, /data-income-impact-pre-death-region/);
assert.match(currentDeathHtml, /5-year context before death/);
assert.match(currentDeathHtml, /data-income-impact-runway-death/);
assert.doesNotMatch(currentDeathHtml, /data-income-impact-runway-point-phase="preDeath"/);

const preRegionWidth = getAttribute(
  currentDeathHtml,
  /data-income-impact-pre-death-region[^>]* width="([^"]+)"/
);
assert.ok(preRegionWidth >= 80, "Rendered pre-death SVG region should have visible width.");
const deathLabelY = getAttribute(
  currentDeathHtml,
  /<text x="[^"]+" y="([^"]+)"[^>]*data-income-impact-death-marker-label/
);
const deathDateLabelY = getAttribute(
  currentDeathHtml,
  /data-income-impact-death-marker-label[\s\S]*?<text x="[^"]+" y="([^"]+)"[^>]*class="income-impact-runway-year-date"/
);
const topValueLabelY = getAttribute(
  currentDeathHtml,
  /<text x="[^"]+" y="([^"]+)"[^>]*class="income-impact-runway-axis-label">\$/
);
assert.ok(deathLabelY > 0, "Death label should stay inside the SVG top boundary.");
assert.ok(deathDateLabelY > deathLabelY, "Death date label should stay below the death label.");
assert.ok(topValueLabelY > 0, "Top value axis label should stay inside the SVG top boundary.");
assert.ok(
  currentDeathModel.deathPoint.y - deathDateLabelY >= 20,
  "Death marker should have usable space below the date label."
);

const futureDeathResult = createTimelineResult({
  deathDate: "2036-01-01",
  deathAge: 56,
  horizonYears: 40,
  includePreDeathPoints: true
});
const futureDeathModel = harness.buildRunwayChartModel(futureDeathResult);
const futurePreDeathPoints = futureDeathModel.points.filter(function (point) {
  return point.phase === "preDeath";
});

assert.equal(futureDeathModel.minRelativeMonthIndex, -60);
assert.equal(futureDeathModel.maxRelativeMonthIndex, 480);
assert.ok(
  futureDeathModel.maxBalance > getMaxDisplayedBalance(futureDeathModel),
  "Future death y-domain max should include top headroom above plotted balances."
);
assert.ok(
  getHighestPointY(futureDeathModel) >= futureDeathModel.yTop + 20,
  "Highest future death point should render visibly below the plot top."
);
assert.equal(futurePreDeathPoints.length, 60);
assert.equal(futurePreDeathPoints[0].relativeMonthIndex, -60);
assert.equal(futurePreDeathPoints[futurePreDeathPoints.length - 1].relativeMonthIndex, -1);
assert.equal(futurePreDeathPoints[0].x, futureDeathModel.xStart);
assert.ok(futureDeathModel.deathPoint.x > futureDeathModel.xStart + 80);
assert.ok(
  futureDeathModel.yearMarkers.some(function (marker) {
    return marker.yearIndex === 40;
  }),
  "Post-death domain should still reach the projection horizon."
);
assert.match(
  harness.renderFinancialRunwayChart(futureDeathResult),
  /data-income-impact-runway-point-resolution="monthly"/
);

const protectedChanges = getChangedFiles([
  "pages/income-loss-impact.html",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/normalize-lens-model.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js",
  "styles.css",
  "components.css",
  "layout.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Chart-domain/HFP context pass should not change HTML, model prep, adapters, methods, warnings, or CSS."
);

console.log("income-loss-impact-chart-domain-check passed");
