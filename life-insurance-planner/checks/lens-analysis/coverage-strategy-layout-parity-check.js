#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

assert.match(controllerSource, /coverage-strategy-stage/);
assert.match(controllerSource, /coverage-strategy-stage-main/);
assert.match(controllerSource, /coverage-strategy-primary-strip/);
assert.match(controllerSource, /coverage-strategy-chart-stage/);
assert.match(controllerSource, /coverage-strategy-detail-panel/);
assert.match(controllerSource, /coverage-strategy-secondary-detail/);

assert.match(componentsSource, /\.coverage-strategy-stage\s*\{/);
assert.match(componentsSource, /grid-template-columns: minmax\(0, 1fr\) minmax\(17rem, 0\.32fr\)/);
assert.match(componentsSource, /\.coverage-strategy-stage-main\s*\{/);
assert.match(componentsSource, /grid-template-rows: auto minmax\(30rem, 1fr\)/);
assert.match(componentsSource, /\.coverage-strategy-primary-strip\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-detail-panel\s*\{/);
assert.match(componentsSource, /\.coverage-need-timeline-chart\s*\{[\s\S]*min-height: 30rem/);
assert.match(componentsSource, /\.coverage-need-timeline-svg\s*\{[\s\S]*min-height: 27rem/);

const primaryStripIndex = indexOfRequired(controllerSource, "coverage-strategy-primary-strip", "Coverage Strategy controller");
const chartIndex = indexOfRequired(controllerSource, "coverage-strategy-chart-stage", "Coverage Strategy controller");
const detailPanelIndex = indexOfRequired(controllerSource, "coverage-strategy-detail-panel", "Coverage Strategy controller");
assert.ok(primaryStripIndex < chartIndex, "Primary summary strip should sit before the chart stage.");
assert.ok(chartIndex < detailPanelIndex, "Secondary detail panel should follow the main chart stage markup.");

const beforeChart = controllerSource.slice(primaryStripIndex, chartIndex);
assert.match(beforeChart, /Current status/);
assert.match(beforeChart, /Current remaining exposure/);
assert.match(beforeChart, /Current need/);
assert.match(beforeChart, /Current eligible resources/);
assert.match(beforeChart, /Current existing coverage/);
assert.doesNotMatch(beforeChart, /Final need|Final eligible resources|Final existing coverage|Max remaining exposure|First fully covered year|First surplus year|Gap \/ surplus years|Need points/);

const detailMarkup = controllerSource.slice(detailPanelIndex);
assert.match(detailMarkup, /Final need/);
assert.match(detailMarkup, /Final eligible resources/);
assert.match(detailMarkup, /Final existing coverage/);
assert.match(detailMarkup, /Max remaining exposure/);
assert.match(detailMarkup, /First fully covered year/);
assert.match(detailMarkup, /First surplus year/);
assert.match(detailMarkup, /Gap \/ surplus years/);
assert.match(detailMarkup, /Need points/);
assert.match(detailMarkup, /Component summary/);
assert.match(detailMarkup, /Component warnings/);

assert.match(controllerSource, /Projected need/);
assert.match(controllerSource, /Projected eligible resources/);
assert.match(controllerSource, /Existing coverage/);
assert.match(controllerSource, /Remaining exposure/);
assert.match(pageSource, /coverage-strategy-chart-model\.js/);
assert.match(chartModelSource, /buildCoverageStrategyTimelineChartModel/);

assert.doesNotMatch(pageSource + controllerSource, /income-impact-/);
assert.doesNotMatch(pageSource + controllerSource, /developer preview|temporary|internal|adapter proof/i);
assert.doesNotMatch(pageSource + controllerSource, /proposed coverage|recommendation score|strategy score|\bAI\b/i);
assert.doesNotMatch(pageSource + controllerSource, /sampleNeed|samplePoints|demoData|fake graph/i);
assert.doesNotMatch(stylesSource, /coverage-strategy-stage|coverage-strategy-primary-strip|coverage-strategy-detail-panel|coverage-strategy-chart-stage/i);

console.log("coverage strategy layout parity check passed");
