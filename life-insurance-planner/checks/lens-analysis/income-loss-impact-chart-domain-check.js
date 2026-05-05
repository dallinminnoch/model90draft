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
    displayedBalance: options.balance,
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
  const preDeathStartBalance = Number.isFinite(Number(safeOptions.preDeathStartBalance))
    ? Number(safeOptions.preDeathStartBalance)
    : 300000;
  const preDeathMonthlyDelta = Number.isFinite(Number(safeOptions.preDeathMonthlyDelta))
    ? Number(safeOptions.preDeathMonthlyDelta)
    : 2000;
  const points = [];

  if (safeOptions.includePreDeathPoints) {
    for (let monthIndex = -60; monthIndex < 0; monthIndex += 1) {
      points.push(createPoint({
        id: `pre-death-month-${Math.abs(monthIndex)}`,
        date: addMonths(deathDate, monthIndex),
        age: deathAge + monthIndex / 12,
        relativeMonthIndex: monthIndex,
        phase: "preDeath",
        resolution: safeOptions.preDeathResolution || "modeledBackcastMonthly",
        balance: preDeathStartBalance + (monthIndex + 60) * preDeathMonthlyDelta,
        status: safeOptions.preDeathStatus || "modeledBackcast"
      }));
    }
  }

  if (safeOptions.includePreDeathThreshold) {
    points.push(createPoint({
      id: "pre-death-household-position-target",
      date: deathDate,
      age: deathAge,
      relativeMonthIndex: 0,
      phase: "preDeath",
      resolution: "targetThreshold",
      balance: Number.isFinite(Number(safeOptions.preDeathThresholdBalance))
        ? Number(safeOptions.preDeathThresholdBalance)
        : preDeathStartBalance,
      status: "preDeathTarget"
    }));
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
          includePreDeathPoints: safeOptions.includePreDeathPoints === true,
          preDeathStartBalance: safeOptions.preDeathStartBalance,
          preDeathMonthlyDelta: safeOptions.preDeathMonthlyDelta,
          includePreDeathThreshold: safeOptions.includePreDeathThreshold === true,
          preDeathThresholdBalance: safeOptions.preDeathThresholdBalance,
          preDeathResolution: safeOptions.preDeathResolution,
          preDeathStatus: safeOptions.preDeathStatus
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

function parsePathPoints(pathData) {
  return Array.from(String(pathData || "").matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g))
    .map(function (match) {
      return {
        x: Number(match[1]),
        y: Number(match[2])
      };
    });
}

function assertPathMatchesPoints(pathData, points, message) {
  const pathPoints = parsePathPoints(pathData);
  assert.equal(pathPoints.length, points.length, message);
  pathPoints.forEach(function (pathPoint, index) {
    assert.equal(pathPoint.x, points[index].x, `${message} x mismatch at point ${index}.`);
    assert.equal(pathPoint.y, points[index].y, `${message} y mismatch at point ${index}.`);
  });
}

function getSvgPathData(html, attributeName) {
  const pattern = new RegExp(`<path[^>]*${attributeName}[^>]* d="([^"]+)"`);
  const match = html.match(pattern);
  return match ? match[1] : "";
}

function getSvgPathStyle(html, attributeName) {
  const pattern = new RegExp(`<path[^>]*${attributeName}[^>]*style="([^"]+)"`);
  const match = html.match(pattern);
  return match ? match[1] : "";
}

function getPathXSpan(pathData) {
  const pathPoints = parsePathPoints(pathData);
  if (!pathPoints.length) {
    return 0;
  }
  return Math.max.apply(null, pathPoints.map(function (point) { return point.x; }))
    - Math.min.apply(null, pathPoints.map(function (point) { return point.x; }));
}

function getPathYSpan(pathData) {
  const pathPoints = parsePathPoints(pathData);
  if (!pathPoints.length) {
    return 0;
  }
  return Math.max.apply(null, pathPoints.map(function (point) { return point.y; }))
    - Math.min.apply(null, pathPoints.map(function (point) { return point.y; }));
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.buildRunwayChartModel, "function");
assert.equal(typeof harness.renderFinancialRunwayChart, "function");
assert.match(displaySource, /resolveScenarioAxisDomainMonths/);
assert.match(displaySource, /axis\.preDeathYears/);
assert.match(displaySource, /RUNWAY_CHART_TOP_HEADROOM_RATIO/);
assert.match(displaySource, /RUNWAY_CHART_BOTTOM_HEADROOM_RATIO/);
assert.match(displaySource, /RUNWAY_CHART_PRIMARY_LINE_STYLE/);
assert.match(displaySource, /resolveRunwayChartMaxBalance/);
assert.match(displaySource, /resolveRunwayChartMinBalance/);
assert.match(displaySource, /resolveRunwayChartPreDeathWidth/);
assert.match(displaySource, /preDeathPath/);
assert.doesNotMatch(displaySource, /<circle\b/, "Income Impact runway chart should not render visible SVG dot markers.");
assert.doesNotMatch(displaySource, /preDeathBaselineContextPath/);
assert.doesNotMatch(displaySource, /preDeathPositivePath/);
assert.doesNotMatch(displaySource, /preDeathModeledContextTrendPath/);
assert.match(displaySource, /survivorRunwayPath/);

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
  currentDeathModel.preDeathRegion.width >= 220,
  "Pre-death region should be visible, not collapsed to a marker edge."
);
assert.ok(
  currentDeathModel.deathPoint.x > currentDeathModel.xStart + 220,
  "Death marker should not be plotted at plot xStart when the axis includes five pre-death years."
);
assert.match(currentDeathHtml, /data-income-impact-pre-death-region/);
assert.match(currentDeathHtml, /5-year context before death/);
assert.match(currentDeathHtml, /data-income-impact-runway-death/);
assert.doesNotMatch(currentDeathHtml, /data-income-impact-runway-point-phase="preDeath"/);
assert.doesNotMatch(currentDeathHtml, /data-income-impact-runway-pre-death-line/);
assert.doesNotMatch(currentDeathHtml, /data-income-impact-runway-pre-death-baseline-context-line/);
assert.doesNotMatch(currentDeathHtml, /data-income-impact-runway-pre-death-modeled-context-line/);
assert.match(currentDeathHtml, /data-income-impact-runway-zero-line/);

const preRegionWidth = getAttribute(
  currentDeathHtml,
  /data-income-impact-pre-death-region[^>]* width="([^"]+)"/
);
assert.ok(preRegionWidth >= 220, "Rendered pre-death SVG region should have visible width.");
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
const futureDeathHtml = harness.renderFinancialRunwayChart(futureDeathResult);
const futurePreDeathPoints = futureDeathModel.points.filter(function (point) {
  return point.phase === "preDeath";
});
const futureSurvivorPoints = futureDeathModel.points.filter(function (point) {
  return point.phase !== "preDeath";
});
const priorStrictProportionalSpan = (futureDeathModel.xEnd - futureDeathModel.xStart)
  * (59 / (futureDeathModel.maxRelativeMonthIndex - futureDeathModel.minRelativeMonthIndex));

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
assert.ok(futureDeathModel.deathPoint.x > futureDeathModel.xStart + 220);
assert.ok(futureDeathModel.preDeathPath, "Pre-death context should have a distinct line path.");
assert.ok(futureDeathModel.minBalance < 0, "Signed y-domain should include below-zero post-death runway values.");
assert.ok(futureDeathModel.zeroY > futureDeathModel.yTop && futureDeathModel.zeroY < futureDeathModel.yBottom);
assert.ok(
  futurePreDeathPoints.every(function (point) {
    return point.displayedBalance > 0 && point.y < futureDeathModel.zeroY;
  }),
  "All-positive pre-death context should plot above the signed zero line."
);
assert.ok(futureDeathModel.survivorRunwayPath, "Survivor runway should have a distinct line path.");
assertPathMatchesPoints(
  futureDeathModel.preDeathPath,
  futurePreDeathPoints,
  "Pre-death path should be built from actual preDeath chart points."
);
assertPathMatchesPoints(
  futureDeathModel.survivorRunwayPath,
  futureSurvivorPoints,
  "Survivor runway path should exclude preDeath points and start at death."
);
assert.ok(
  futurePreDeathPoints[futurePreDeathPoints.length - 1].x - futurePreDeathPoints[0].x > priorStrictProportionalSpan * 2,
  "Pre-death path should be substantially wider than the prior strict proportional span."
);
assert.ok(
  futurePreDeathPoints[futurePreDeathPoints.length - 1].x - futurePreDeathPoints[0].x >= 200,
  "Pre-death path should have meaningful x-span for readability."
);
assert.match(futureDeathHtml, /data-income-impact-runway-pre-death-line/);
assert.match(futureDeathHtml, /data-income-impact-runway-pre-death-signed-line/);
assert.match(futureDeathHtml, /data-income-impact-runway-post-death-line/);
assert.equal(
  getSvgPathData(futureDeathHtml, "data-income-impact-runway-pre-death-line"),
  futureDeathModel.preDeathPath,
  "Rendered pre-death path should use the chart model signed preDeathPath."
);
assert.equal(
  getSvgPathData(futureDeathHtml, "data-income-impact-runway-post-death-line"),
  futureDeathModel.survivorRunwayPath,
  "Rendered post-death path should use the chart model survivorRunwayPath."
);
assert.ok(
  futureDeathModel.deathPoint.x > futurePreDeathPoints[futurePreDeathPoints.length - 1].x,
  "Death marker should remain after the pre-death segment."
);
assert.ok(
  futureDeathModel.yearMarkers.some(function (marker) {
    return marker.yearIndex === 40;
  }),
  "Post-death domain should still reach the projection horizon."
);
assert.match(futureDeathHtml, /data-income-impact-runway-point-resolution="modeledBackcastMonthly"/);

const thresholdResult = createTimelineResult({
  deathDate: "2026-01-01",
  deathAge: 46,
  horizonYears: 40,
  includePreDeathPoints: true,
  includePreDeathThreshold: true,
  preDeathStartBalance: 100000,
  preDeathMonthlyDelta: 0,
  preDeathThresholdBalance: 100000
});
const thresholdModel = harness.buildRunwayChartModel(thresholdResult);
const thresholdHtml = harness.renderFinancialRunwayChart(thresholdResult);
const thresholdPreDeathPoints = thresholdModel.points.filter(function (point) {
  return point.phase === "preDeath";
});
const thresholdPoint = thresholdPreDeathPoints.find(function (point) {
  return point.resolution === "targetThreshold";
});
const thresholdDeathChartPoint = thresholdModel.points.find(function (point) {
  return point.id === "death-point";
});
assert.equal(thresholdPreDeathPoints.length, 61);
assert.ok(thresholdPoint, "Pre-death household target threshold should be included in the pre-death line.");
assert.ok(thresholdDeathChartPoint, "Death chart point should remain present when a pre-death threshold shares relative month 0.");
assert.equal(
  thresholdDeathChartPoint.phase,
  "death",
  "Death marker should use the death point even when a pre-death threshold shares relative month 0."
);
assert.equal(thresholdModel.deathPoint.y, thresholdDeathChartPoint.y);
assert.equal(thresholdPoint.x, thresholdModel.deathPoint.x);
assert.notEqual(
  thresholdPoint.y,
  thresholdModel.deathPoint.y,
  "Pre-death household assets and post-death available resources should be allowed to differ at the death threshold."
);
assertPathMatchesPoints(
  thresholdModel.preDeathPath,
  thresholdPreDeathPoints,
  "Pre-death path should include the real household target threshold point."
);
assert.ok(thresholdModel.deathTransitionPath, "Death-date resource jump should render as a connected vertical transition path.");
assertPathMatchesPoints(
  thresholdModel.deathTransitionPath,
  [thresholdPoint, thresholdDeathChartPoint],
  "Death transition path should connect pre-death household assets to post-death available resources."
);
assert.equal(
  getSvgPathData(thresholdHtml, "data-income-impact-runway-death-transition-line"),
  thresholdModel.deathTransitionPath,
  "Rendered death transition path should use the chart model transition path."
);
assert.equal(
  getSvgPathStyle(thresholdHtml, "data-income-impact-runway-pre-death-line"),
  getSvgPathStyle(thresholdHtml, "data-income-impact-runway-post-death-line"),
  "Pre-death and post-death paths should use the same line style."
);
assert.equal(
  getSvgPathStyle(thresholdHtml, "data-income-impact-runway-death-transition-line"),
  getSvgPathStyle(thresholdHtml, "data-income-impact-runway-post-death-line"),
  "Death transition path should use the same line style as the runway paths."
);

const modeledBackcastResult = createTimelineResult({
  deathDate: "2026-01-01",
  deathAge: 46,
  horizonYears: 40,
  includePreDeathPoints: true,
  preDeathStartBalance: -200000,
  preDeathMonthlyDelta: 5000,
  preDeathResolution: "modeledBackcastMonthly",
  preDeathStatus: "modeledBackcast"
});
const modeledBackcastModel = harness.buildRunwayChartModel(modeledBackcastResult);
const modeledBackcastPreDeathPoints = modeledBackcastModel.points.filter(function (point) {
  return point.phase === "preDeath";
});
assert.equal(modeledBackcastPreDeathPoints.length, 60);
assert.equal(
  modeledBackcastPreDeathPoints.filter(function (point) { return point.displayedBalance < 0; }).length,
  40,
  "Negative modeled pre-death balances should stay negative instead of being clamped to $0."
);
assert.equal(
  modeledBackcastPreDeathPoints.filter(function (point) { return point.displayedBalance === 0; }).length,
  1,
  "Only the actual zero-balance modeled pre-death point should display as $0."
);
assert.equal(
  modeledBackcastPreDeathPoints.filter(function (point) { return point.displayedBalance > 0; }).length,
  19,
  "Positive modeled pre-death balances should remain positive."
);
assert.ok(modeledBackcastModel.minBalance < 0, "Signed y-domain should include negative modeled household position.");
assert.ok(modeledBackcastModel.zeroY > modeledBackcastModel.yTop, "Zero line should render inside the plot when negatives exist.");
assert.ok(modeledBackcastModel.zeroY < modeledBackcastModel.yBottom, "Zero line should leave visible space for below-zero values.");
assert.ok(
  modeledBackcastPreDeathPoints.some(function (point) {
    return point.balance < 0 && point.displayedBalance < 0 && point.y > modeledBackcastModel.zeroY;
  }),
  "Negative pre-death balances should plot below the zero line."
);
const modeledBackcastPositivePoints = modeledBackcastPreDeathPoints.filter(function (point) {
  return point.displayedBalance > 0;
});
assert.ok(
  modeledBackcastPositivePoints.every(function (point) {
    return point.y < modeledBackcastModel.zeroY;
  }),
  "Positive pre-death balances should plot above the zero line."
);
assertPathMatchesPoints(
  modeledBackcastModel.preDeathPath,
  modeledBackcastPreDeathPoints,
  "Modeled backcast signed pre-death path should use all real preDeath points."
);
assert.ok(
  getPathYSpan(modeledBackcastModel.preDeathPath) >= 70,
  "Signed pre-death trend should have substantial visible height across below-zero and positive values."
);
assert.ok(
  getPathXSpan(modeledBackcastModel.preDeathPath) >= 200,
  "Signed pre-death trend should span the readable five-year segment."
);
const modeledBackcastHtml = harness.renderFinancialRunwayChart(modeledBackcastResult);
assert.doesNotMatch(modeledBackcastHtml, /<circle\b/, "Rendered runway chart should not include visible dot markers.");
assert.match(modeledBackcastHtml, /data-income-impact-runway-pre-death-signed-line/);
assert.doesNotMatch(modeledBackcastHtml, /data-income-impact-runway-pre-death-baseline-context-line/);
assert.doesNotMatch(modeledBackcastHtml, /data-income-impact-runway-pre-death-modeled-context-line/);
assert.doesNotMatch(modeledBackcastHtml, /data-income-impact-modeled-context-scale="local"/);
assert.doesNotMatch(modeledBackcastHtml, /data-income-impact-runway-pre-death-positive-line/);
assert.equal(
  getSvgPathData(modeledBackcastHtml, "data-income-impact-runway-pre-death-line"),
  modeledBackcastModel.preDeathPath,
  "Rendered pre-death path should use the chart model signed preDeathPath."
);
assert.match(modeledBackcastHtml, /data-income-impact-runway-zero-line/);
assert.match(modeledBackcastHtml, /data-income-impact-runway-negative-axis-label/);
assert.match(modeledBackcastHtml, /Remaining available resources can plot above or below \$0/);
if (modeledBackcastModel.depletionPoint) {
  assert.equal(
    modeledBackcastModel.depletionPoint.y,
    modeledBackcastModel.zeroY,
    "Depletion marker should sit on the signed chart zero line."
  );
}
assert.match(
  getSvgPathStyle(modeledBackcastHtml, "data-income-impact-runway-pre-death-line"),
  /stroke-width:\s*4\.8/,
  "Signed pre-death trend should render strongly enough to read."
);
assert.ok(
  modeledBackcastHtml.indexOf("data-income-impact-runway-pre-death-line") > modeledBackcastHtml.indexOf("data-income-impact-runway-points"),
  "Signed pre-death trend should render after non-visible point metadata."
);
assert.ok(
  parsePathPoints(modeledBackcastModel.preDeathPath).every(function (point) {
    return point.y >= modeledBackcastModel.yTop && point.y <= modeledBackcastModel.yBottom;
  }),
  "Signed pre-death trend should stay inside the plot bounds."
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
