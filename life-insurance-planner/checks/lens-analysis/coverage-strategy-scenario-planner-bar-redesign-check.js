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

const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const componentsSource = readRepoFile("components.css");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");
const stylesSource = readRepoFile("styles.css");

const trayIndex = indexOfRequired(controllerSource, '<div class="coverage-strategy-scenario-tray is-compact-dock"', "Coverage Strategy controller");
const trayMarkup = controllerSource.slice(trayIndex);

assert.match(trayMarkup, /coverage-strategy-scenario-tray-label/);
assert.match(trayMarkup, /Scenario Planner/);
assert.match(trayMarkup, /coverage-strategy-scenario-tabs/);
assert.match(trayMarkup, /Base Scenario/);
assert.match(trayMarkup, /Stress Scenario/);
assert.match(trayMarkup, /Best Case/);
assert.match(trayMarkup, /\+ New Scenario/);
assert.match(trayMarkup, /Last calculated: Today/);
assert.match(trayMarkup, /Save Scenario/);
assert.match(trayMarkup, /Recalculate Plan/);
assert.match(trayMarkup, /data-scenario-reserved="true"/);
assert.match(trayMarkup, /disabled aria-disabled="true"/);

assert.match(trayMarkup, /Projection horizon/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-input/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-number/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-output/);
assert.match(trayMarkup, /Education savings/);
assert.match(trayMarkup, /data-coverage-strategy-education-savings-offset/);
assert.match(trayMarkup, />Off</);
assert.match(trayMarkup, />On</);
assert.match(trayMarkup, /Education schedule/);
assert.match(trayMarkup, /data-coverage-strategy-education-payment-schedule/);
assert.match(trayMarkup, />4-year</);
assert.match(trayMarkup, />Lump sum</);
assert.match(trayMarkup, /renderProjectedDependentTimingControls\(projectedDependentTimingRows\)/);
assert.match(controllerSource, /Projected dependents/);
assert.match(controllerSource, /data-coverage-strategy-projected-dependent-birth-year/);
assert.match(trayMarkup, /Export Diagnostic Report/);
assert.match(trayMarkup, /data-coverage-strategy-diagnostic-export/);
assert.doesNotMatch(trayMarkup, /Export Diagnostic PDF/);

assert.doesNotMatch(trayMarkup, /educationTreatmentMode|educationResourceSpendingMode|custom schedule|resource spending|Social Security|Tax Bracket|State of Residence|Life Expectancy/i);
assert.doesNotMatch(trayMarkup, /localStorage|sessionStorage/);
assert.doesNotMatch(controllerSource, /localStorage\.setItem|sessionStorage\.setItem/);
assert.doesNotMatch(analysisSetupSource, /coverage-strategy-scenario-tabs|coverage-strategy-scenario-action|data-scenario-reserved="true"/);

assert.match(componentsSource, /\.coverage-strategy-scenario-tray\s*\{[\s\S]*background: var\(--m90-surface\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-header\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tabs\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-action\.is-primary\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control\.is-projected-dependents\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-horizon-control-compact input\[type="range"\]\s*\{[\s\S]*accent-color: var\(--m90-accent\)/);
assert.match(componentsSource, /\.coverage-strategy-horizon-control-compact input\[type="number"\]\s*\{[\s\S]*width: 2\.8rem/);
assert.match(componentsSource, /\.coverage-strategy-segmented-option span\s*\{[\s\S]*min-height: 1\.42rem/);
assert.match(componentsSource, /\.coverage-strategy-projected-dependent-list\s*\{[\s\S]*max-height: 4\.1rem/);
assert.match(componentsSource, /\.coverage-strategy-projected-dependent-row\s*\{[\s\S]*grid-template-columns: minmax\(5\.2rem, 1fr\) 3\.7rem 2\.7rem/);
assert.match(componentsSource, /\.coverage-strategy-diagnostic-export-button\s*\{/);
assert.match(componentsSource, /padding-bottom: clamp\(6\.25rem, 12vh, 7\.5rem\)/);
assert.doesNotMatch(componentsSource, /linear-gradient\(135deg, color-mix\(in srgb, var\(--m90-text-primary\) 93%/);
assert.doesNotMatch(componentsSource, /border: 1px dashed color-mix\(in srgb, #f7fbfb 35%/);
assert.doesNotMatch(stylesSource, /coverage-strategy-scenario-tray|coverage-strategy-scenario-control|coverage-strategy-scenario-tabs/i);

assert.match(diagnosticSource, /visibleScenarioControls/);
assert.match(controllerSource, /projectionHorizon: true/);
assert.match(controllerSource, /educationSavingsOffset: true/);
assert.match(controllerSource, /educationPaymentScheduleMode: true/);
assert.match(controllerSource, /educationPaymentSchedule: true/);
assert.match(controllerSource, /projectedDependentBirthYear: projectedDependentBirthYearControlVisible/);
assert.match(controllerSource, /diagnosticExport: true/);

console.log("coverage strategy scenario planner bar redesign check passed");
