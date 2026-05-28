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

function indexOfRequired(source, needle, label) {
  const index = source.indexOf(needle);
  assert.ok(index >= 0, `${label} should include ${needle}.`);
  return index;
}

const pageSource = readRepoFile("pages/coverage-strategy.html");
const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const chartModelSource = readRepoFile("app/features/lens-analysis/coverage-strategy-chart-model.js");
const componentsSource = readRepoFile("components.css");
const stylesSource = readRepoFile("styles.css");

assert.match(pageSource, /coverage-strategy-chart-model\.js/);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-gap-surplus-composer.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-chart-model.js", "Coverage Strategy page"),
  "Gap/surplus composer should load before chart model."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-chart-model.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-page.js", "Coverage Strategy page"),
  "Chart model should load before page controller."
);

assert.match(controllerSource, /resolveAge110Horizon/);
assert.match(controllerSource, /110 - currentAge/);
assert.match(controllerSource, /coverage-strategy-age-110-horizon-unavailable/);
assert.match(controllerSource, /MIN_PROJECTION_HORIZON_YEARS = 1/);
assert.match(controllerSource, /MAX_PROJECTION_HORIZON_YEARS = 80/);
assert.match(controllerSource, /clampProjectionHorizonYears/);
assert.match(controllerSource, /resolveDefaultProjectionHorizon/);
assert.match(controllerSource, /selectedProjectionHorizonYears = resolveDefaultProjectionHorizon\(age110Horizon\)/);
assert.match(controllerSource, /buildAndRenderCoverageStrategy\(projectionHorizonYears\)/);
assert.match(controllerSource, /horizonYears: safeProjectionHorizonYears/);
assert.match(controllerSource, /horizonYears: needLine\.horizonYears/);
assert.match(controllerSource, /data-coverage-strategy-horizon-input/);
assert.match(controllerSource, /data-coverage-strategy-horizon-number/);
assert.match(controllerSource, /data-coverage-strategy-horizon-output/);
assert.match(controllerSource, /host\.addEventListener\("input"/);
assert.match(controllerSource, /host\.addEventListener\("change"/);
assert.match(controllerSource, /buildCoverageStrategyTimelineChartModel/);
assert.match(controllerSource, /chartModel/);
assert.match(controllerSource, /renderTimelineSvg\(chartModelResult\)/);
assert.doesNotMatch(controllerSource, /Math\.min\(point\.chartValue, ratioCeiling\)/);
assert.doesNotMatch(controllerSource, /ratioCeiling/);
assert.doesNotMatch(controllerSource, /Math\.min\(300/);
assert.doesNotMatch(controllerSource, /horizonYears:\s*40/);
assert.doesNotMatch(controllerSource, /sampleNeed|samplePoints|demoData|fake graph/i);

assert.doesNotMatch(chartModelSource, /\bdocument\b/);
assert.doesNotMatch(chartModelSource, /\blocalStorage\b/);
assert.doesNotMatch(chartModelSource, /\bsessionStorage\b/);
assert.doesNotMatch(chartModelSource, /\bquerySelector\b/);
assert.doesNotMatch(chartModelSource, /coverage-strategy-page/);
assert.doesNotMatch(chartModelSource, /Math\.min\(300/);
assert.doesNotMatch(chartModelSource, /ratioCeiling/);
assert.doesNotMatch(chartModelSource, /coverage-contribution-capped-at-need/);
assert.match(chartModelSource, /chartMode: "dollar"/);
assert.match(chartModelSource, /displayTransform: "dollar-axis"/);
assert.match(chartModelSource, /defaultYAxisUnit: "dollars"/);
assert.match(chartModelSource, /rawDollarDataChanged: false/);
assert.match(chartModelSource, /noHardThreeHundredPercentCap: true/);

assert.match(componentsSource, /coverage-strategy-stage/);
assert.match(componentsSource, /coverage-strategy-horizon-control/);
assert.match(componentsSource, /coverage-strategy-stage-main/);
assert.match(componentsSource, /grid-template-rows: auto minmax\(30rem, 1fr\)/);
assert.match(componentsSource, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(componentsSource, /min-height: 30rem/);
assert.match(componentsSource, /min-height: 27rem/);
assert.match(componentsSource, /coverage-need-timeline-chart-note/);
assert.doesNotMatch(stylesSource, /coverage-strategy-chart-model|coverage-need-timeline-chart-note/i);

const context = {
  console,
  LensApp: {
    lensAnalysis: {}
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(chartModelSource, context, { filename: "coverage-strategy-chart-model.js" });
const buildCoverageStrategyTimelineChartModel = context.LensApp.lensAnalysis.buildCoverageStrategyTimelineChartModel;
assert.equal(typeof buildCoverageStrategyTimelineChartModel, "function");

const needPoints = [
  { yearIndex: 0, calendarYear: 2026, needAmount: 1000000 },
  { yearIndex: 1, calendarYear: 2027, needAmount: 900000 }
];
const resourcePoints = [
  { yearIndex: 0, resourceAmount: 120000 },
  { yearIndex: 1, resourceAmount: 19400000 }
];
const existingCoveragePoints = [
  { yearIndex: 0, existingCoverageAmount: 500000 },
  { yearIndex: 1, existingCoverageAmount: 0 }
];
const gapSurplusPoints = [
  { yearIndex: 0, remainingExposureAmount: 380000 },
  { yearIndex: 1, remainingExposureAmount: 0 }
];
const originalNeedPoints = JSON.stringify(needPoints);
const originalResourcePoints = JSON.stringify(resourcePoints);
const chartModel = buildCoverageStrategyTimelineChartModel({
  needPoints,
  resourcePoints,
  existingCoveragePoints,
  gapSurplusPoints
});

assert.equal(JSON.stringify(needPoints), originalNeedPoints, "chart model should not mutate need points");
assert.equal(JSON.stringify(resourcePoints), originalResourcePoints, "chart model should not mutate resource points");
assert.equal(chartModel.chartMode, "dollar");
assert.equal(chartModel.yAxisMax, 20000000);
assert.equal(JSON.stringify(chartModel.axisLabels), JSON.stringify([20000000, 15000000, 10000000, 5000000, 0]));
assert.equal(chartModel.trace.noHardThreeHundredPercentCap, true);
assert.equal(chartModel.trace.rawDollarDataChanged, false);
assert.equal(chartModel.trace.defaultYAxisUnit, "dollars");

const needSeries = chartModel.series.find((series) => series.key === "need");
const resourceSeries = chartModel.series.find((series) => series.key === "resources");
const existingCoverageSeries = chartModel.series.find((series) => series.key === "existingCoverage");
const remainingExposureSeries = chartModel.series.find((series) => series.key === "remainingExposure");
assert.equal(needSeries.displayBasis, "dollars");
assert.equal(resourceSeries.displayBasis, "dollars");
assert.equal(existingCoverageSeries.displayBasis, "dollars");
assert.equal(remainingExposureSeries.displayBasis, "dollars");
assert.equal(needSeries.points[0].chartValue, 1000000);
assert.equal(resourceSeries.points[0].chartValue, 120000);
assert.equal(resourceSeries.points[1].chartValue, 19400000);
assert.equal(resourceSeries.points[1].sourceField, "resourceAmount");
assert.equal(existingCoverageSeries.points[0].chartValue, 500000);
assert.equal(existingCoverageSeries.points[0].sourceField, "existingCoverageAmount");
assert.equal(remainingExposureSeries.points[0].chartValue, 380000);
assert.equal(remainingExposureSeries.points[0].sourceField, "remainingExposureAmount");
assert.equal(needSeries.points[0].sourceField, "needAmount");
assert.equal(resourceSeries.points[1].chartValueCappedAtNeed, undefined);

const missingNeed = buildCoverageStrategyTimelineChartModel({
  needPoints: [{ yearIndex: 0 }],
  resourcePoints: [{ yearIndex: 0, resourceAmount: 100000 }]
});
assert.equal(missingNeed.series[0].points.length, 0);
assert.equal(missingNeed.warnings[0].code, "chart-need-point-missing");

console.log("coverage strategy chart horizon check passed");
