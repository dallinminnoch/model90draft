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

const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensHtml = readRepoFile("pages/lens.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const hlvResultsHtml = readRepoFile("pages/hlv-results.html");
const simpleNeedsResultsHtml = readRepoFile("pages/simple-needs-results.html");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.match(
  analysisEstimateHtml,
  /Review the LENS recommendation from the linked profile and Analysis Setup assumptions before moving into recommendation design\./,
  "LENS result page copy should be LENS-only."
);
assert.doesNotMatch(
  analysisEstimateHtml,
  /Compare the saved protection modeling data across the active analysis methods/,
  "LENS result page should not describe a combined method comparison."
);
assert.match(analysisEstimateHtml, /aria-label="LENS result"/);
assert.match(analysisEstimateHtml, /aria-label="LENS result card"/);
assert.equal(
  countMatches(analysisEstimateHtml, /data-step-three-needs-analysis/g),
  1,
  "analysis-estimate.html should contain exactly one LENS Step 3 host."
);
assert.doesNotMatch(
  analysisEstimateHtml,
  /data-step-three-dime-analysis/,
  "analysis-estimate.html should not contain a DIME Step 3 host."
);
assert.doesNotMatch(
  analysisEstimateHtml,
  /data-step-three-human-life-value-analysis/,
  "analysis-estimate.html should not contain an HLV Step 3 host."
);
assert.doesNotMatch(analysisEstimateHtml, /DIME analysis will appear here/);
assert.doesNotMatch(analysisEstimateHtml, /Income value lens will appear here/);
assert.doesNotMatch(analysisEstimateHtml, /data-simple-needs-results-analysis/);

assert.doesNotMatch(
  lensHtml,
  /Existing DIME, LENS, and HLV result comparison remains on the current result page/,
  "Lens selector should not claim the advanced result page still compares DIME, LENS, and HLV."
);
assert.match(lensHtml, /LENS results stay on the advanced result page; quick methods use their own result pages/);
assert.match(lensHtml, /href="profile\.html"[^>]*data-lens-start-link/);
assert.match(lensHtml, /href="dime-entry\.html"[^>]*data-dime-start-link/);
assert.match(lensHtml, /href="simple-needs-entry\.html"[^>]*data-simple-needs-start-link/);
assert.match(lensHtml, /href="hlv-entry\.html"[^>]*data-hlv-start-link/);

assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "dime-results.html should remain DIME-only."
);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(dimeResultsHtml, /data-simple-needs-results-analysis/);

assert.equal(
  countMatches(hlvResultsHtml, /data-step-three-human-life-value-analysis/g),
  1,
  "hlv-results.html should remain HLV-only."
);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(hlvResultsHtml, /data-simple-needs-results-analysis/);

assert.equal(
  countMatches(simpleNeedsResultsHtml, /data-simple-needs-results-analysis/g),
  1,
  "simple-needs-results.html should remain Simple Needs-only."
);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-human-life-value-analysis/);

assert.match(stepThreeDisplaySource, /function renderDimeResult\(/);
assert.match(stepThreeDisplaySource, /function renderNeedsResult\(/);
assert.match(stepThreeDisplaySource, /function renderHumanLifeValueResult\(/);
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-dime-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-needs-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-human-life-value-analysis]")'));

const forbiddenChangedFiles = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/projected-asset-offset-calculations.js",
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
  "LENS result page isolation should not change methods, renderers, model prep, projected offset helpers, or quick-flow pages."
);

console.log("lens-result-page-isolation-check passed");
