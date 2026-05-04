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

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    return output
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

const analysisDetailHtml = readRepoFile("pages/analysis-detail.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const hlvResultsHtml = readRepoFile("pages/hlv-results.html");
const simpleNeedsResultsHtml = readRepoFile("pages/simple-needs-results.html");
const appConfigSource = readRepoFile("app/core/config.js");
const lensWorkflowSource = readRepoFile("lens-workflow.js");
const workspaceSideNavSource = readRepoFile("workspace-side-nav.js");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.doesNotMatch(
  appConfigSource,
  /analysis-detail\.html/,
  "Detailed Analysis should not be in app core required workflow steps."
);
assert.doesNotMatch(
  lensWorkflowSource,
  /analysis-detail\.html/,
  "Detailed Analysis should not be in the active LENS workflow progress steps."
);
assert.doesNotMatch(
  workspaceSideNavSource,
  /\{ id: "detail", label: "Detailed Analysis", path: "analysis-detail\.html"/,
  "Workspace side nav should not expose Detailed Analysis as an active LENS workflow destination."
);

assert.match(analysisDetailHtml, /data-step='detail-preview'/);
assert.match(analysisDetailHtml, /Future LENS Review/);
assert.match(analysisDetailHtml, /LENS Interpretation Preview/);
assert.match(analysisDetailHtml, /future LENS-only advisor interpretation view/);
assert.match(analysisDetailHtml, /The active LENS result remains Estimate Need/);
assert.match(analysisDetailHtml, /Use Estimate Need for the current LENS result/);
assert.match(analysisDetailHtml, /Standalone quick methods keep their own result pages and are not summarized here/);
assert.match(analysisDetailHtml, /href="analysis-estimate\.html">Open Estimate Need<\/a>/);
assert.match(analysisDetailHtml, /href="lens\.html">Back to Analysis Types<\/a>/);
assert.doesNotMatch(analysisDetailHtml, /DIME Analysis/);
assert.doesNotMatch(analysisDetailHtml, /Human Life Value Analysis/);
assert.doesNotMatch(analysisDetailHtml, /Method comparison area reserved/);
assert.doesNotMatch(analysisDetailHtml, /ranked method results/);
assert.doesNotMatch(analysisDetailHtml, /blended recommendation logic/);
assert.doesNotMatch(analysisDetailHtml, /supporting methods below/);

assert.equal(
  countMatches(analysisEstimateHtml, /data-step-three-needs-analysis/g),
  1,
  "analysis-estimate.html should remain LENS-only."
);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);

assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "dime-results.html should remain DIME-only."
);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-human-life-value-analysis/);

assert.equal(
  countMatches(hlvResultsHtml, /data-step-three-human-life-value-analysis/g),
  1,
  "hlv-results.html should remain HLV-only."
);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-needs-analysis/);

assert.equal(
  countMatches(simpleNeedsResultsHtml, /data-simple-needs-results-analysis/g),
  1,
  "simple-needs-results.html should remain Simple Needs-only."
);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-human-life-value-analysis/);

assert.match(stepThreeDisplaySource, /function renderDimeResult\(/);
assert.match(stepThreeDisplaySource, /function renderHumanLifeValueResult\(/);
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-dime-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-human-life-value-analysis]")'));

const forbiddenChangedFiles = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/projected-asset-offset-calculations.js",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html"
]);
assert.deepEqual(
  forbiddenChangedFiles,
  [],
  "Detailed Analysis cleanup should not change methods, renderers, model prep, projected offset helpers, LENS result page, or quick-flow pages."
);

console.log("analysis-detail-stale-comparison-cleanup-check passed");
