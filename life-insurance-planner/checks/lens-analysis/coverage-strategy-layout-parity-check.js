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

assert.match(pageSource, /coverage-strategy-compact-header/);
assert.match(pageSource, /coverage-strategy-compact-heading/);
assert.match(pageSource, /<h1>Coverage Strategy<\/h1>/);
assert.doesNotMatch(pageSource, /Build coverage over time from the LENS need result and traceable planning components/);
assert.match(componentsSource, /\.coverage-strategy-compact-header\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-compact-header h1\s*\{[\s\S]*font-size: clamp\(1rem, 1\.2vw, 1\.22rem\)/);

assert.match(controllerSource, /coverage-strategy-workspace/);
assert.match(controllerSource, /coverage-strategy-left-panel/);
assert.match(controllerSource, /coverage-strategy-main-stage/);
assert.match(controllerSource, /coverage-strategy-chart-stage/);
assert.match(controllerSource, /coverage-strategy-right-panel/);
assert.match(controllerSource, /coverage-strategy-scenario-tray/);
assert.match(controllerSource, /is-compact-dock/);

assert.match(componentsSource, /\.coverage-strategy-workspace\s*\{/);
assert.match(componentsSource, /grid-template-columns: minmax\(12rem, 0\.58fr\) minmax\(32rem, 1\.8fr\) minmax\(14rem, 0\.66fr\)/);
assert.match(componentsSource, /\.coverage-strategy-left-panel,\s*\n\.coverage-strategy-right-panel\s*\{/);
assert.match(componentsSource, /max-height: min\(64vh, 48rem\)/);
assert.match(componentsSource, /\.coverage-strategy-main-stage\s*\{/);
assert.match(componentsSource, /min-height: clamp\(34rem, calc\(100vh - 18rem\), 50rem\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray\s*\{/);
assert.match(componentsSource, /position: fixed/);
assert.match(componentsSource, /z-index: 40/);
assert.match(componentsSource, /min-height: 3\.7rem/);
assert.match(componentsSource, /padding: 0\.5rem 0\.72rem/);
assert.match(componentsSource, /\.coverage-need-timeline-card\s*\{[\s\S]*padding-bottom: clamp\(5rem, 12vh, 6\.75rem\)/);
assert.match(componentsSource, /\.coverage-need-timeline-chart\s*\{[\s\S]*min-height: clamp\(34rem, calc\(100vh - 18rem\), 50rem\)/);
assert.match(componentsSource, /\.coverage-need-timeline-svg\s*\{[\s\S]*min-height: 31rem/);

const leftPanelIndex = indexOfRequired(controllerSource, "coverage-strategy-left-panel", "Coverage Strategy controller");
const chartIndex = indexOfRequired(controllerSource, "coverage-strategy-chart-stage", "Coverage Strategy controller");
const rightPanelIndex = indexOfRequired(controllerSource, "coverage-strategy-right-panel", "Coverage Strategy controller");
const trayIndex = indexOfRequired(controllerSource, "coverage-strategy-scenario-tray", "Coverage Strategy controller");
const horizonControlIndex = indexOfRequired(controllerSource, "coverage-strategy-horizon-control", "Coverage Strategy controller");
assert.ok(leftPanelIndex < chartIndex, "Left summary panel should sit before the chart stage.");
assert.ok(chartIndex < rightPanelIndex, "Right detail panel should follow the main chart stage markup.");
assert.ok(rightPanelIndex < trayIndex, "Scenario tray should follow the three-panel workspace.");
assert.ok(trayIndex < horizonControlIndex, "Projection horizon control should live inside the scenario tray.");

const beforeWorkspace = controllerSource.slice(0, indexOfRequired(controllerSource, "coverage-strategy-workspace", "Coverage Strategy controller"));
assert.doesNotMatch(beforeWorkspace, /coverage-strategy-horizon-control|Projection horizon/);

const beforeChart = controllerSource.slice(leftPanelIndex, chartIndex);
assert.match(beforeChart, /Current status/);
assert.match(beforeChart, /Current remaining exposure/);
assert.match(beforeChart, /Current need/);
assert.match(beforeChart, /Current eligible resources/);
assert.match(beforeChart, /Current existing coverage/);
assert.doesNotMatch(beforeChart, /Final need|Final eligible resources|Final existing coverage|Max remaining exposure|First fully covered year|First surplus year|Gap \/ surplus years|Need points/);

const detailMarkup = controllerSource.slice(rightPanelIndex, trayIndex);
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

const scenarioTrayMarkup = controllerSource.slice(trayIndex);
assert.match(scenarioTrayMarkup, /Scenario Planner/);
assert.match(scenarioTrayMarkup, /coverage-strategy-scenario-tray-header/);
assert.match(scenarioTrayMarkup, /coverage-strategy-scenario-tray-grid/);
assert.match(scenarioTrayMarkup, /coverage-strategy-scenario-tray-placeholder/);
assert.match(scenarioTrayMarkup, /Projection horizon/);
assert.match(scenarioTrayMarkup, /data-coverage-strategy-horizon-input/);
assert.match(scenarioTrayMarkup, /data-coverage-strategy-horizon-number/);
assert.match(scenarioTrayMarkup, /data-coverage-strategy-horizon-output/);
assert.doesNotMatch(scenarioTrayMarkup, /<button|<select|<textarea|Save scenario|Recalculate<\/button>/);

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
assert.doesNotMatch(stylesSource, /coverage-strategy-workspace|coverage-strategy-left-panel|coverage-strategy-main-stage|coverage-strategy-right-panel|coverage-strategy-scenario-tray|coverage-strategy-chart-stage/i);

console.log("coverage strategy layout parity check passed");
