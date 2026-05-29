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
const layoutSource = readRepoFile("layout.css");
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
assert.match(controllerSource, /formatScenarioLastCalculatedLabel/);
assert.match(controllerSource, /Last calculated: Today at/);
assert.match(controllerSource, /daysDifference <= 14/);
assert.match(controllerSource, /toLocaleDateString\("en-US"/);
assert.match(trayMarkup, /data-coverage-strategy-last-calculated/);
assert.match(trayMarkup, /coverage-strategy-scenario-status-dot/);
assert.match(trayMarkup, /Save Scenario/);
assert.match(trayMarkup, /Recalculate Plan/);
assert.match(controllerSource, /coverage-strategy-scenario-action-icon/);
assert.match(trayMarkup, /data-scenario-reserved="true"/);
assert.match(trayMarkup, /disabled aria-disabled="true"/);

assert.match(trayMarkup, /Projection horizon/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-input/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-number/);
assert.match(trayMarkup, /data-coverage-strategy-horizon-output/);
assert.match(trayMarkup, /coverage-strategy-horizon-value-row/);
assert.match(trayMarkup, /coverage-strategy-horizon-range-labels/);
assert.match(trayMarkup, /Education resources/);
assert.match(trayMarkup, /data-coverage-strategy-education-resource-spending/);
assert.match(trayMarkup, />Off</);
assert.match(trayMarkup, />Savings</);
assert.match(trayMarkup, /Education schedule/);
assert.match(trayMarkup, /data-coverage-strategy-education-payment-schedule/);
assert.match(trayMarkup, />4-year</);
assert.match(trayMarkup, />Lump sum</);
assert.match(trayMarkup, /renderProjectedDependentTimingControls\(projectedDependentTimingRows\)/);
assert.match(controllerSource, /Projected dependents/);
assert.match(controllerSource, /data-coverage-strategy-projected-dependent-birth-year/);
assert.match(trayMarkup, /Export Diagnostic Report/);
assert.match(trayMarkup, /data-coverage-strategy-diagnostic-export/);
assert.match(trayMarkup, /coverage-strategy-scenario-footer/);
assert.doesNotMatch(trayMarkup, /Export Diagnostic PDF/);

assert.doesNotMatch(trayMarkup, /educationTreatmentMode|custom schedule|savings then eligible resources|Social Security|Tax Bracket|State of Residence|Life Expectancy/i);
assert.doesNotMatch(trayMarkup, /localStorage|sessionStorage/);
assert.doesNotMatch(controllerSource, /localStorage\.setItem|sessionStorage\.setItem/);
assert.doesNotMatch(analysisSetupSource, /coverage-strategy-scenario-tabs|coverage-strategy-scenario-action|data-scenario-reserved="true"/);

assert.match(componentsSource, /\.coverage-strategy-scenario-tray\s*\{[\s\S]*background: var\(--m90-surface\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray\s*\{[\s\S]*grid-template-rows: 2\.875rem 6\.4375rem 2\.75rem/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray\s*\{[\s\S]*height: 12\.0625rem/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-header\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-header\s*\{[\s\S]*background: #f8f9fb/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tabs\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-action\.is-primary\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-action-icon\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control\.is-projected-dependents\s*\{/);
assert.match(componentsSource, /right: clamp\(0\.45rem, 1\.2vw, 0\.85rem\)/);
assert.match(componentsSource, /bottom: clamp\(0\.25rem, 0\.65vw, 0\.45rem\)/);
assert.match(componentsSource, /left: calc\(var\(--app-side-nav-collapsed-width, 3\.75rem\) \+ clamp\(0\.35rem, 0\.85vw, 0\.7rem\)\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-label\s*\{[\s\S]*letter-spacing: 0\.07em/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tab\s*\{[\s\S]*font: 400 0\.8125rem\/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control-label\s*\{[\s\S]*font-size: 0\.6875rem[\s\S]*font-weight: 500[\s\S]*text-transform: none/);
assert.match(componentsSource, /\.coverage-strategy-horizon-control-compact label\s*\{[\s\S]*font-size: 0\.6875rem[\s\S]*font-weight: 500[\s\S]*text-transform: none/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-header\s*\{[\s\S]*min-height: 2\.875rem/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-grid\s*\{[\s\S]*grid-template-columns: minmax\(13rem, 1\.05fr\) minmax\(9\.5rem, 0\.75fr\) minmax\(10\.5rem, 0\.82fr\) minmax\(17rem, 1\.25fr\)/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-grid\s*\{[\s\S]*min-height: 6\.4375rem/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-grid\s*\{[\s\S]*padding: 0\.875rem 1rem 0\.625rem/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control\s*\{[\s\S]*min-height: 4\.95rem/);
assert.match(componentsSource, /\.coverage-strategy-horizon-value-row\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-horizon-range-labels\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-horizon-control-compact input\[type="range"\]\s*\{[\s\S]*accent-color: var\(--m90-accent\)/);
assert.match(componentsSource, /\.coverage-strategy-horizon-control-compact input\[type="number"\]\s*\{[\s\S]*width: 3\.625rem/);
assert.match(componentsSource, /\.coverage-strategy-segmented-option span\s*\{[\s\S]*min-height: 1\.75rem[\s\S]*font: 400 0\.6875rem\/1\.05 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif/);
assert.match(componentsSource, /\.coverage-strategy-projected-dependent-list\s*\{[\s\S]*max-height: 4\.85rem/);
assert.match(componentsSource, /\.coverage-strategy-projected-dependent-row\s*\{[\s\S]*grid-template-columns: minmax\(8rem, 1fr\) 3\.625rem 3\.1rem/);
assert.match(componentsSource, /\.coverage-strategy-projected-dependent-row span\s*\{[\s\S]*font-size: 0\.75rem[\s\S]*font-weight: 500/);
assert.match(componentsSource, /\.coverage-strategy-diagnostic-export-button\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-footer\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-footer\s*\{[\s\S]*min-height: 2\.75rem/);
assert.match(componentsSource, /\.coverage-strategy-scenario-footer\s*\{[\s\S]*background: #f8f9fb/);
assert.match(componentsSource, /padding-bottom: clamp\(5\.75rem, 11vh, 7rem\)/);
assert.match(layoutSource, /body\[data-step="coverage-strategy"\] \.analysis-estimate-shell\s*\{[\s\S]*overflow-y: auto/);
assert.match(layoutSource, /--coverage-strategy-scenario-tray-clearance: clamp\(9\.5rem, 17vh, 11\.75rem\)/);
assert.match(controllerSource, /class="coverage-strategy-horizon-range"/);
assert.match(controllerSource, /class="coverage-strategy-horizon-number"/);
assert.match(controllerSource, /class="coverage-strategy-projected-dependent-birth-year-input"/);
assert.match(stylesSource, /:not\(\.coverage-strategy-horizon-range\):not\(\.coverage-strategy-horizon-number\):not\(\.coverage-strategy-projected-dependent-birth-year-input\)/);
assert.doesNotMatch(componentsSource, /linear-gradient\(135deg, color-mix\(in srgb, var\(--m90-text-primary\) 93%/);
assert.doesNotMatch(componentsSource, /border: 1px dashed color-mix\(in srgb, #f7fbfb 35%/);
assert.doesNotMatch(stylesSource, /coverage-strategy-scenario-tray|coverage-strategy-scenario-control|coverage-strategy-scenario-tabs/i);

assert.match(diagnosticSource, /visibleScenarioControls/);
assert.match(controllerSource, /projectionHorizon: true/);
assert.match(controllerSource, /educationResourceSpendingMode: true/);
assert.match(controllerSource, /educationResourceSpending: true/);
assert.match(controllerSource, /educationPaymentScheduleMode: true/);
assert.match(controllerSource, /educationPaymentSchedule: true/);
assert.match(controllerSource, /projectedDependentBirthYear: projectedDependentBirthYearControlVisible/);
assert.match(controllerSource, /diagnosticExport: true/);

console.log("coverage strategy scenario planner bar redesign check passed");
