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
const componentsSource = readRepoFile("components.css");
const stylesSource = readRepoFile("styles.css");

assert.match(pageSource, /coverage-strategy-compact-header/);
assert.match(pageSource, /coverage-strategy-compact-heading/);
assert.match(pageSource, /<h1>Coverage Strategy<\/h1>/);
assert.match(pageSource, /Step 5: Coverage Strategy/);
assert.doesNotMatch(pageSource, /Build coverage over time from the LENS need result and traceable planning components/);
assert.match(componentsSource, /\.coverage-strategy-compact-header\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-compact-header h1\s*\{[\s\S]*font-size: clamp\(1rem, 1\.2vw, 1\.22rem\)/);
assert.match(componentsSource, /\.coverage-strategy-compact-heading\s*\{/);

assert.match(pageSource, /coverage-strategy-chart-model\.js/);
assert.match(pageSource, /coverage-strategy-need-line-adapter\.js/);
assert.match(pageSource, /coverage-strategy-resource-line-adapter\.js/);
assert.match(pageSource, /coverage-timeline-existing-coverage-adapter\.js/);
assert.match(pageSource, /coverage-strategy-gap-surplus-composer\.js/);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-gap-surplus-composer.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-chart-model.js", "Coverage Strategy page"),
  "Gap/surplus composer should load before the chart model."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-chart-model.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-page.js", "Coverage Strategy page"),
  "Chart model should load before the page controller."
);

const leftPanelIndex = indexOfRequired(controllerSource, "coverage-strategy-left-panel", "Coverage Strategy controller");
const mainStageIndex = indexOfRequired(controllerSource, "coverage-strategy-main-stage", "Coverage Strategy controller");
const rightPanelIndex = indexOfRequired(controllerSource, "coverage-strategy-right-panel", "Coverage Strategy controller");
const trayIndex = indexOfRequired(controllerSource, "coverage-strategy-scenario-tray", "Coverage Strategy controller");
const horizonControlIndex = indexOfRequired(controllerSource, "coverage-strategy-horizon-control", "Coverage Strategy controller");
assert.ok(leftPanelIndex < mainStageIndex, "Left data panel should be before the graph stage.");
assert.ok(mainStageIndex < rightPanelIndex, "Graph stage should be between left and right panels.");
assert.ok(rightPanelIndex < trayIndex, "Scenario tray should sit after the three-panel workspace.");
assert.ok(trayIndex < horizonControlIndex, "Projection horizon control should live inside the scenario tray.");

assert.match(controllerSource, /coverage-strategy-workspace/);
assert.match(controllerSource, /is-compact-dock/);
assert.match(controllerSource, /Current status/);
assert.match(controllerSource, /Current remaining exposure/);
assert.match(controllerSource, /Current need/);
assert.match(controllerSource, /Current eligible resources/);
assert.match(controllerSource, /Current existing coverage/);
assert.match(controllerSource, /Final remaining exposure/);
assert.match(controllerSource, /Max remaining exposure/);
assert.match(controllerSource, /Component summary/);
assert.match(controllerSource, /Component warnings/);
assert.match(controllerSource, /Projected need/);
assert.match(controllerSource, /Projected eligible resources/);
assert.match(controllerSource, /Existing coverage/);
assert.match(controllerSource, /Remaining exposure/);

const trayMarkup = controllerSource.slice(trayIndex);
assert.match(trayMarkup, /Scenario Planner/);
assert.match(trayMarkup, /coverage-strategy-scenario-tray-header/);
assert.match(trayMarkup, /coverage-strategy-scenario-tray-grid/);
assert.match(trayMarkup, /coverage-strategy-scenario-tray-placeholder/);
assert.match(trayMarkup, /Projection horizon/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-input/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-number/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-output/);
assert.match(trayMarkup, /Export Diagnostic PDF/);
assert.match(trayMarkup, /data-coverage-strategy-diagnostic-export/);
assert.match(trayMarkup, /Coverage layers/);
assert.match(trayMarkup, /Recalculate/);
const trayMarkupWithoutDiagnosticExport = trayMarkup.replace(
  /<button[\s\S]*?data-coverage-strategy-diagnostic-export[\s\S]*?<\/button>/,
  ""
);
assert.doesNotMatch(trayMarkupWithoutDiagnosticExport, /<button|<select|<textarea|data-scenario|Save scenario|Recalculate<\/button>/);

const beforeWorkspace = controllerSource.slice(0, indexOfRequired(controllerSource, "coverage-strategy-workspace", "Coverage Strategy controller"));
assert.doesNotMatch(beforeWorkspace, /coverage-strategy-horizon-control|Projection horizon/);

assert.match(componentsSource, /\.coverage-strategy-workspace\s*\{/);
assert.match(componentsSource, /grid-template-columns: minmax\(12rem, 0\.58fr\) minmax\(32rem, 1\.8fr\) minmax\(14rem, 0\.66fr\)/);
assert.match(componentsSource, /\.coverage-strategy-left-panel,\s*\n\.coverage-strategy-right-panel\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-main-stage\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray\s*\{/);
assert.match(componentsSource, /position: fixed/);
assert.match(componentsSource, /bottom: 0\.75rem/);
assert.match(componentsSource, /z-index: 40/);
assert.match(componentsSource, /min-height: 3\.7rem/);
assert.match(componentsSource, /padding: 0\.5rem 0\.72rem/);
assert.match(componentsSource, /\.coverage-need-timeline-card\s*\{[\s\S]*padding-bottom: clamp\(5rem, 12vh, 6\.75rem\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-grid\s*\{/);
assert.match(componentsSource, /grid-template-columns: minmax\(12rem, 1\.5fr\) repeat\(2, minmax\(6rem, 0\.72fr\)\) minmax\(8\.5rem, 0\.9fr\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-placeholder\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-placeholder\.is-diagnostic-export\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-diagnostic-export-button\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-horizon-control-compact\s*\{/);
assert.match(componentsSource, /grid-template-columns: minmax\(7rem, 1fr\) 3\.35rem auto/);
assert.match(componentsSource, /@media \(max-width: 900px\)/);
assert.match(componentsSource, /\.coverage-strategy-workspace\s*\{[\s\S]*grid-template-columns: 1fr/);

assert.doesNotMatch(pageSource + controllerSource, /proposed coverage|recommendation score|strategy score|\bAI\b/i);
assert.doesNotMatch(pageSource, /\$[0-9]/, "Coverage Strategy page should not hardcode fake dollar values.");
assert.doesNotMatch(controllerSource, /sampleNeed|samplePoints|demoData|fake graph/i);
assert.doesNotMatch(stylesSource, /coverage-strategy-workspace|coverage-strategy-left-panel|coverage-strategy-main-stage|coverage-strategy-right-panel|coverage-strategy-scenario-tray/i);

console.log("coverage strategy three-panel layout check passed");
