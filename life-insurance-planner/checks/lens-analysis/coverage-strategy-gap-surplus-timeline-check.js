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
const composerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-gap-surplus-composer.js");
const chartModelSource = readRepoFile("app/features/lens-analysis/coverage-strategy-chart-model.js");
const componentsSource = readRepoFile("components.css");
const stylesSource = readRepoFile("styles.css");

assert.match(pageSource, /coverage-strategy-gap-surplus-composer\.js/);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-need-line-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-resource-line-adapter.js", "Coverage Strategy page"),
  "Need-line adapter should load before resource-line adapter."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-resource-line-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-timeline-existing-coverage-adapter.js", "Coverage Strategy page"),
  "Resource-line adapter should load before existing coverage adapter."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-timeline-existing-coverage-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-gap-surplus-composer.js", "Coverage Strategy page"),
  "Existing coverage adapter should load before gap/surplus composer."
);
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

assert.match(controllerSource, /buildCoverageStrategyGapSurplus/);
assert.match(controllerSource, /buildCoverageStrategyTimelineChartModel/);
assert.match(controllerSource, /gapSurplusPoints/);
assert.match(controllerSource, /gapSurplusSummary/);
assert.match(controllerSource, /remainingExposureAmount/);
assert.match(controllerSource, /surplusAmount/);
assert.match(controllerSource, /Current remaining exposure/);
assert.match(controllerSource, /Final remaining exposure/);
assert.match(controllerSource, /Max remaining exposure/);
assert.match(controllerSource, /First fully covered year/);
assert.match(controllerSource, /First surplus year/);
assert.match(controllerSource, /Gap \/ surplus years/);
assert.match(controllerSource, /Current status/);
assert.match(controllerSource, /Planning answer/);
assert.match(controllerSource, /Remaining exposure unavailable from current source data/);
assert.match(controllerSource, /coverage-need-timeline-remaining-exposure-line/);
assert.match(controllerSource, /coverage-need-timeline-legend-remaining-exposure/);
assert.match(controllerSource, /resourcePoints: getRenderableResourcePoints\(resourceLine\)/);
assert.match(controllerSource, /existingCoveragePoints: existingCoverageLine\.coveragePoints/);
assert.match(controllerSource, /existingCoverageLayers: existingCoverageLine\.layers/);
assert.match(controllerSource, /renderTimelineSvg\(chartModelResult\)/);
assert.match(chartModelSource, /chartMode: "dollar"/);
assert.match(chartModelSource, /createDollarChartPoint\(needPoint, index, remainingExposureAmount, "remainingExposureAmount"\)/);
assert.match(chartModelSource, /displayTransform: "dollar-axis"/);

assert.doesNotMatch(controllerSource, /Math\.max\(\s*needAmount\s*-/);
assert.doesNotMatch(controllerSource, /remainingExposureAmount\s*=\s*Math\.max/);
assert.doesNotMatch(controllerSource, /surplusAmount\s*=\s*Math\.max/);
assert.doesNotMatch(controllerSource, /Math\.min\(point\.chartValue, ratioCeiling\)/);
assert.doesNotMatch(controllerSource, /ratioCeiling/);
assert.doesNotMatch(controllerSource, /proposed coverage|recommendation score|strategy score|\bAI\b/i);
assert.doesNotMatch(controllerSource, /fake gap|sampleGap|demoGap/i);
assert.doesNotMatch(pageSource, /\$[0-9]/, "Coverage Strategy page should not hardcode fake gap/surplus values.");
assert.doesNotMatch(pageSource, /Proposed Coverage|Recommendation Score|AI Strategy/i);

assert.match(composerSource, /remainingExposureAmount = hasRequiredData \? roundMoney\(Math\.max\(needAmount - totalAvailableAmount, 0\)\) : 0/);
assert.match(composerSource, /surplusAmount = hasRequiredData \? roundMoney\(Math\.max\(totalAvailableAmount - needAmount, 0\)\) : 0/);
assert.match(composerSource, /status: classifyPointStatus/);

assert.match(componentsSource, /coverage-need-timeline-status/);
assert.match(componentsSource, /coverage-need-timeline-remaining-exposure-line/);
assert.match(componentsSource, /coverage-need-timeline-remaining-exposure-point/);
assert.match(componentsSource, /coverage-need-timeline-legend-remaining-exposure/);
assert.doesNotMatch(stylesSource, /coverage-need-timeline-remaining-exposure|coverage-need-timeline-status/i);

console.log("coverage strategy gap surplus timeline check passed");
