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
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");

assert.match(controllerSource, /MIN_PROJECTION_HORIZON_YEARS = 1/);
assert.match(controllerSource, /MAX_PROJECTION_HORIZON_YEARS = 80/);
assert.match(controllerSource, /HORIZON_NUMBER_INPUT_COMMIT_DELAY_MS = 450/);
assert.match(controllerSource, /type="range"[\s\S]*data-coverage-strategy-horizon-input/);
assert.match(controllerSource, /type="number"[\s\S]*min="\$\{MIN_PROJECTION_HORIZON_YEARS\}"[\s\S]*max="\$\{MAX_PROJECTION_HORIZON_YEARS\}"[\s\S]*step="1"[\s\S]*aria-label="Projection horizon years"[\s\S]*data-coverage-strategy-horizon-number/);
assert.match(controllerSource, /data-coverage-strategy-horizon-output/);

assert.match(controllerSource, /function clearScheduledHorizonNumberCommit\(\)/);
assert.match(controllerSource, /function syncProjectionHorizonControls\(horizonYears, options = \{\}\)/);
assert.match(controllerSource, /function parseProjectionHorizonInputValue\(value\)/);
assert.match(controllerSource, /function commitProjectionHorizonValue\(value\)/);
assert.match(controllerSource, /function scheduleProjectionHorizonNumberCommit\(target\)/);
assert.match(controllerSource, /setTimeout\(function \(\)/);
assert.match(controllerSource, /commitProjectionHorizonValue\(target\.value\)/);
assert.match(controllerSource, /buildAndRenderCoverageStrategy\(safeValue\)/);

const inputHandlerIndex = indexOfRequired(controllerSource, 'host.addEventListener("input"', "Coverage Strategy controller");
const changeHandlerIndex = indexOfRequired(controllerSource, 'host.addEventListener("change"', "Coverage Strategy controller");
const inputHandlerSource = controllerSource.slice(inputHandlerIndex, changeHandlerIndex);
assert.ok(
  inputHandlerSource.indexOf('[data-coverage-strategy-horizon-input]') < inputHandlerSource.indexOf('[data-coverage-strategy-horizon-number]'),
  "Range input should be handled separately before numeric input."
);
assert.match(inputHandlerSource, /syncProjectionHorizonControls\(target\.value, \{ skipRangeInput: true \}\)/);
assert.match(inputHandlerSource, /selectedProjectionHorizonYears = safeValue/);
assert.match(inputHandlerSource, /parseProjectionHorizonInputValue\(target\.value\)/);
assert.match(inputHandlerSource, /clearScheduledHorizonNumberCommit\(\)/);
assert.match(inputHandlerSource, /target\.setAttribute\("aria-invalid", target\.value\.trim\(\) \? "true" : "false"\)/);
assert.match(inputHandlerSource, /syncProjectionHorizonControls\(parsedValue, \{ skipNumberInput: true \}\)/);
assert.match(inputHandlerSource, /String\(target\.value \?\? ""\)\.trim\(\)\.length >= 2/);
assert.match(inputHandlerSource, /scheduleProjectionHorizonNumberCommit\(target\)/);
assert.match(inputHandlerSource, /clearScheduledHorizonNumberCommit\(\)/);
assert.doesNotMatch(inputHandlerSource, /buildAndRenderCoverageStrategy\(target\.value\)/);

assert.match(controllerSource, /host\.addEventListener\("change"[\s\S]*commitProjectionHorizonValue\(target\.value\)/);
assert.match(controllerSource, /host\.addEventListener\("focusout"[\s\S]*data-coverage-strategy-horizon-number[\s\S]*commitProjectionHorizonValue\(target\.value\)/);
assert.match(controllerSource, /host\.addEventListener\("keydown"[\s\S]*event\.key !== "Enter"[\s\S]*event\.preventDefault\(\)[\s\S]*commitProjectionHorizonValue\(target\.value\)/);
assert.match(controllerSource, /projectionHorizonYears: safeProjectionHorizonYears/);
assert.match(controllerSource, /projectionHorizonYears: selectedProjectionHorizonYears/);

assert.match(diagnosticSource, /projectionHorizonYears/);
assert.match(diagnosticSource, /exportFormat: "html"/);

assert.doesNotMatch(controllerSource, /localStorage\.setItem|sessionStorage\.setItem/);
assert.doesNotMatch(controllerSource, /profileRecord\.coverageStrategyScenarioSettings\s*=/);

console.log("coverage strategy projection horizon input check passed");
