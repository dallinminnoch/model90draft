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

assert.match(pageSource, /Coverage Need Timeline/);
assert.match(pageSource, /data-coverage-need-timeline/);
assert.doesNotMatch(pageSource, /developer preview|temporary|internal|adapter proof/i);
assert.doesNotMatch(controllerSource, /developer preview|temporary|internal|adapter proof/i);

assert.match(pageSource, /coverage-strategy-need-line-adapter\.js/);
assert.match(pageSource, /coverage-strategy-resource-line-adapter\.js/);
assert.match(pageSource, /coverage-timeline-existing-coverage-adapter\.js/);
assert.match(pageSource, /coverage-strategy-page\.js/);
assert.ok(
  indexOfRequired(pageSource, "asset-taxonomy.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "asset-treatment-calculations.js", "Coverage Strategy page"),
  "Asset taxonomy should load before asset treatment calculations."
);
assert.ok(
  indexOfRequired(pageSource, "asset-treatment-calculations.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-resource-line-adapter.js", "Coverage Strategy page"),
  "Asset treatment calculations should load before the resource-line adapter."
);
assert.ok(
  indexOfRequired(pageSource, "lens-model-builder.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "analysis-methods.js", "Coverage Strategy page"),
  "Lens model builder should load before analysis methods."
);
assert.ok(
  indexOfRequired(pageSource, "analysis-methods.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "analysis-settings-adapter.js", "Coverage Strategy page"),
  "Analysis methods should load before analysis settings adapter."
);
assert.ok(
  indexOfRequired(pageSource, "analysis-settings-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-need-line-adapter.js", "Coverage Strategy page"),
  "Analysis settings adapter should load before the need-line adapter."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-need-line-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-resource-line-adapter.js", "Coverage Strategy page"),
  "Need-line adapter should load before the resource-line adapter."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-strategy-resource-line-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-timeline-existing-coverage-adapter.js", "Coverage Strategy page"),
  "Resource-line adapter should load before the existing coverage adapter."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-timeline-existing-coverage-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-page.js", "Coverage Strategy page"),
  "Existing coverage adapter should load before the page controller."
);

assert.match(controllerSource, /buildLensModelFromSavedProtectionModeling/);
assert.match(controllerSource, /runNeedsAnalysis/);
assert.match(controllerSource, /buildCoverageStrategyNeedLine/);
assert.match(controllerSource, /buildCoverageStrategyResourceLine/);
assert.match(controllerSource, /buildExistingCoverageTimelineLayers/);
assert.match(controllerSource, /needPoints/);
assert.match(controllerSource, /resourcePoints/);
assert.match(controllerSource, /coveragePoints/);
assert.match(controllerSource, /renderTimelineSvg\(needPoints, resourcePoints, existingCoveragePoints\)/);
assert.match(controllerSource, /buildCoverageRatioChartSeries/);
assert.match(controllerSource, /chartMode: "coverage-ratio"/);
assert.match(controllerSource, /chartValue: 100/);
assert.match(controllerSource, /\(resourceAmount \/ needAmount\) \* 100/);
assert.match(controllerSource, /\(existingCoverageAmount \/ needAmount\) \* 100/);
assert.match(controllerSource, /Math\.min\(point\.chartValue, ratioCeiling\)/);
assert.match(controllerSource, /formatPercent\(value\)/);
assert.match(controllerSource, /point\?\.resourceAmount \?\? point\?\.eligibleResourceAmount/);
assert.match(controllerSource, /point\?\.existingCoverageAmount \?\? point\?\.coverageAmount/);
assert.doesNotMatch(controllerSource, /normalizeResourcePointValue[\s\S]*grossProjectedAssetAmount/);
assert.doesNotMatch(controllerSource, /normalizeResourcePointValue[\s\S]*excludedSurplus/);
assert.match(controllerSource, /Projected need/);
assert.match(controllerSource, /Projected eligible resources/);
assert.match(controllerSource, /Existing coverage/);
assert.match(controllerSource, /missing-asset-treatment-helper/);
assert.match(controllerSource, /Current eligible resources/);
assert.match(controllerSource, /Final eligible resources/);
assert.match(controllerSource, /Current existing coverage/);
assert.match(controllerSource, /Final existing coverage/);
assert.match(controllerSource, /formatCurrency\(firstPoint\.grossNeedAmount \?\? firstPoint\.needAmount\)/);
assert.match(controllerSource, /formatCurrency\(firstResourcePoint\.resourceAmount\)/);
assert.match(controllerSource, /formatCurrency\(lastPoint\.grossNeedAmount \?\? lastPoint\.needAmount\)/);
assert.match(controllerSource, /formatCurrency\(lastResourcePoint\.resourceAmount\)/);
assert.match(controllerSource, /formatCurrency\(firstExistingCoveragePoint\?\.existingCoverageAmount \|\| 0\)/);
assert.match(controllerSource, /formatCurrency\(lastExistingCoveragePoint\?\.existingCoverageAmount \|\| 0\)/);
assert.match(controllerSource, /renderMissingState/);
assert.match(controllerSource, /hasProtectionModelingSource/);
assert.doesNotMatch(controllerSource, /step-three-analysis-display/);
assert.doesNotMatch(controllerSource, /querySelector\(["']\.analysis-result-value/);
assert.doesNotMatch(controllerSource, /sampleNeed|samplePoints|demoData|fake graph/i);

assert.doesNotMatch(pageSource, /\$[0-9]/, "Coverage Strategy page should not hardcode fake dollar outputs.");
assert.doesNotMatch(controllerSource, /needPoints\s*=\s*\[/, "Controller should not define sample chart points.");
assert.doesNotMatch(controllerSource, /existing coverage layers|gap\/surplus|coverage gap|surplus coverage|proposed coverage/i);
assert.doesNotMatch(pageSource, /Resource Line|Existing Coverage Layers|Gap|Surplus|Proposed Coverage/i);
assert.doesNotMatch(pageSource, /coverage-timeline-engine\.js/, "Need Timeline page should not load coverage timeline engine yet.");

assert.match(componentsSource, /\.coverage-need-timeline/);
assert.match(componentsSource, /coverage-need-timeline-resource-line/);
assert.match(componentsSource, /coverage-need-timeline-existing-coverage-line/);
assert.doesNotMatch(stylesSource, /coverage-need-timeline|Coverage Need Timeline/i);

console.log("coverage strategy need timeline check passed");
