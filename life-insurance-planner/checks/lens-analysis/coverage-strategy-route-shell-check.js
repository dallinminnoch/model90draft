#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      { cwd: repoRoot, encoding: "utf8" }
    );
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function assertRouteAfterLensResult(source, label) {
  const estimateIndex = source.indexOf('id: "estimate", label: "LENS Result", path: "analysis-estimate.html"');
  const strategyIndex = source.indexOf('id: "coverage-strategy", label: "Coverage Strategy", path: "coverage-strategy.html"');
  const recommendationsIndex = source.indexOf('id: "recommendations", label: "Coverage Options", path: "recommendations.html"');
  assert.ok(estimateIndex >= 0, `${label} should contain the LENS Result workflow route.`);
  assert.ok(strategyIndex > estimateIndex, `${label} should place Coverage Strategy after LENS Result.`);
  assert.ok(recommendationsIndex > strategyIndex, `${label} should keep Coverage Options after Coverage Strategy.`);
}

const coverageStrategyPath = path.join(repoRoot, "pages", "coverage-strategy.html");
assert.ok(fs.existsSync(coverageStrategyPath), "coverage-strategy.html should exist.");

const coverageStrategyHtml = readRepoFile("pages/coverage-strategy.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensWorkflowSource = readRepoFile("lens-workflow.js");
const configSource = readRepoFile("app/core/config.js");
const sideNavSource = readRepoFile("workspace-side-nav.js");
const appSource = readRepoFile("app.js");
const stylesSource = readRepoFile("styles.css");
const stylesSourceWithoutCoverageStrategyFormExclusions = stylesSource
  .replace(/\.coverage-strategy-horizon-label/g, "")
  .replace(/\.coverage-strategy-segmented-option/g, "")
  .replace(/\.coverage-strategy-horizon-range/g, "")
  .replace(/\.coverage-strategy-horizon-number/g, "")
  .replace(/\.coverage-strategy-projected-dependent-birth-year-input/g, "");
const engineSource = readRepoFile("app/features/lens-analysis/coverage-timeline-engine.js");

assert.match(coverageStrategyHtml, /<title>Coverage Strategy \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(coverageStrategyHtml, /data-step='coverage-strategy'/);
assert.match(coverageStrategyHtml, /Step 5: Coverage Strategy/);
assert.match(coverageStrategyHtml, /<h1>Coverage Strategy<\/h1>/);
assert.match(coverageStrategyHtml, /Coverage Need Timeline/);
assert.match(coverageStrategyHtml, /data-coverage-need-timeline/);
assert.match(coverageStrategyHtml, /coverage-strategy-need-line-adapter\.js/);
assert.match(coverageStrategyHtml, /coverage-strategy-page\.js/);

assert.doesNotMatch(coverageStrategyHtml, /\$[0-9]/, "Coverage Strategy shell should not show fake dollar values.");
assert.doesNotMatch(coverageStrategyHtml, /developer preview|temporary|internal|adapter proof/i);
assert.doesNotMatch(coverageStrategyHtml, /placeholder to|sample policy|fake graph|data-coverage-timeline-point/i);
assert.doesNotMatch(coverageStrategyHtml, /calculateCoverageTimeline\(/, "Coverage Strategy shell should not run coverage timeline math yet.");
assert.doesNotMatch(coverageStrategyHtml, /coverage-timeline-engine\.js/, "Coverage Strategy shell should not load timeline engines before integration.");
assert.doesNotMatch(coverageStrategyHtml, /data-recommendation=|data-strategy=/, "Coverage Strategy should not reuse legacy recommendation/planner card implementations.");

assert.match(
  analysisEstimateHtml,
  /href="coverage-strategy\.html">Continue to Coverage Strategy<\/a>/,
  "LENS Result should continue to Coverage Strategy."
);

assertRouteAfterLensResult(lensWorkflowSource, "lens-workflow.js");
assertRouteAfterLensResult(configSource, "app/core/config.js");
assertRouteAfterLensResult(sideNavSource, "workspace-side-nav.js");
assert.match(appSource, /"coverage-strategy\.html"/, "Temporary analysis route guard should treat Coverage Strategy as an internal analysis route.");

assert.doesNotMatch(
  stylesSourceWithoutCoverageStrategyFormExclusions,
  /coverage-strategy/i,
  "styles.css should not own the new Coverage Strategy shell beyond narrow legacy form-rule exclusions."
);
assert.match(
  stylesSource,
  /:not\(\.coverage-strategy-horizon-range\):not\(\.coverage-strategy-horizon-number\):not\(\.coverage-strategy-projected-dependent-birth-year-input\)/,
  "styles.css should only mention Coverage Strategy to exempt its controls from legacy global form sizing."
);

assert.deepEqual(
  getChangedFiles([
    "app/features/lens-analysis/coverage-timeline-engine.js",
    "app/features/lens-analysis/coverage-timeline-existing-coverage-adapter.js",
    "app/features/lens-analysis/coverage-timeline-hypothetical-policy-layer-helper.js"
  ]),
  [],
  "Coverage timeline engine/helper files should not change in the route-shell pass."
);

assert.match(
  engineSource,
  /Purpose: calculate deterministic coverage need, policy-layer coverage,/,
  "Coverage timeline engine contract should remain present."
);

console.log("coverage strategy route shell check passed");
