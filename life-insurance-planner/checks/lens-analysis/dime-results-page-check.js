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

function extractScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/g)).map(function (match) {
    return match[2];
  });
}

function getCardBlock(source, key) {
  const pattern = new RegExp(
    `<article\\b[^>]*data-analysis-type-card="${key}"[^>]*>[\\s\\S]*?<\\/article>`,
    "m"
  );
  const match = source.match(pattern);
  assert.ok(match, `Expected analysis type card for ${key}.`);
  return match[0];
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
  } catch (error) {
    return [];
  }
}

const dimeResultsPath = path.join(repoRoot, "pages/dime-results.html");
assert.ok(fs.existsSync(dimeResultsPath), "pages/dime-results.html should exist.");

const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensHtml = readRepoFile("pages/lens.html");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.match(dimeResultsHtml, /<title>DIME Analysis \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(dimeResultsHtml, /<h1>DIME Analysis<\/h1>/);
assert.match(
  dimeResultsHtml,
  /Fast estimate using debts, income, mortgage, and education from the linked protection modeling data\./
);

assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "DIME result page should contain exactly one DIME Step 3 host."
);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(dimeResultsHtml, /LENS Analysis will appear here/);
assert.doesNotMatch(dimeResultsHtml, /Income value lens will appear here/);
assert.doesNotMatch(dimeResultsHtml, /LENS Projection Details/);
assert.doesNotMatch(dimeResultsHtml, /Projected Asset Growth/);
assert.doesNotMatch(dimeResultsHtml, /Projected Asset Offset/);
assert.doesNotMatch(dimeResultsHtml, /Cash Reserve Projection/);
assert.doesNotMatch(dimeResultsHtml, /Healthcare Expense Projection/);
assert.doesNotMatch(dimeResultsHtml, /Final Expense Projection/);
assert.doesNotMatch(dimeResultsHtml, /data-analysis-setup/);

const dimeScripts = extractScriptSources(dimeResultsHtml);
[
  "../app/features/lens-analysis/schema.js",
  "../app/features/lens-analysis/normalize-lens-model.js",
  "../app/features/lens-analysis/asset-treatment-calculations.js",
  "../app/features/lens-analysis/asset-growth-projection-calculations.js",
  "../app/features/lens-analysis/cash-reserve-calculations.js",
  "../app/features/lens-analysis/lens-model-builder.js",
  "../app/features/lens-analysis/analysis-methods.js",
  "../app/features/lens-analysis/analysis-settings-adapter.js",
  "../app/features/lens-analysis/step-three-analysis-display.js"
].forEach(function (script) {
  assert.ok(dimeScripts.includes(script), `${script} should load on DIME result page.`);
});
assert.equal(
  dimeScripts.includes("../app/features/lens-analysis/projected-asset-offset-calculations.js"),
  false,
  "DIME result page should not require projected asset offset helper while projectedAssetOffset is inactive."
);

assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/schema.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/normalize-lens-model.js"),
  "Schema should load before model normalization."
);
assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/normalize-lens-model.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Model normalization should load before model builder."
);
assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/asset-growth-projection-calculations.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Asset growth projection helper should load before model builder."
);
assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/cash-reserve-calculations.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Cash reserve helper should load before model builder."
);
assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/analysis-methods.js"),
  "Model builder should load before analysis methods."
);
assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/analysis-methods.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/analysis-settings-adapter.js"),
  "Analysis methods should load before settings adapter."
);
assert.ok(
  dimeScripts.indexOf("../app/features/lens-analysis/analysis-settings-adapter.js")
    < dimeScripts.indexOf("../app/features/lens-analysis/step-three-analysis-display.js"),
  "Settings adapter should load before Step 3 display."
);

assert.equal(
  countMatches(analysisEstimateHtml, /data-step-three-needs-analysis/g),
  1,
  "LENS result page should contain exactly one LENS Step 3 host."
);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /DIME analysis will appear here/);
assert.doesNotMatch(analysisEstimateHtml, /Income value lens will appear here/);

const dimeCard = getCardBlock(lensHtml, "dime");
assert.match(dimeCard, /DIME Analysis/);
assert.match(dimeCard, /Quick flow available/);
assert.match(dimeCard, /Quick coverage estimate using debts, income, mortgage, and education\./);
assert.match(dimeCard, /does not use the LENS assumptions panel/);
assert.match(dimeCard, /Start DIME Analysis/);
assert.match(dimeCard, /href="dime-entry\.html"/);
assert.match(dimeCard, /data-dime-start-link/);
assert.doesNotMatch(dimeCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(dimeCard, /dime-results\.html/);

assert.match(analysisMethodsSource, /function runDimeAnalysis\(/);
assert.match(analysisMethodsSource, /method: "dime"/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);

assert.match(stepThreeDisplaySource, /function renderDimeResult\(/);
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-dime-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-needs-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-human-life-value-analysis]")'));

const protectedChanges = getChangedFiles([
  "pages/profile.html",
  "workspace-side-nav.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "No DIME-adjacent profile or side-nav files should be changed."
);

console.log("dime-results-page-check passed");
