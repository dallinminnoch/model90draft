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

function getMainContent(source) {
  const match = source.match(/<main\b[\s\S]*?<\/main>/m);
  assert.ok(match, "Expected page main content.");
  return match[0];
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

const simpleNeedsResultsPath = path.join(repoRoot, "pages/simple-needs-results.html");
const simpleNeedsDisplayPath = path.join(repoRoot, "app/features/lens-analysis/simple-needs-results-display.js");
assert.ok(fs.existsSync(simpleNeedsResultsPath), "pages/simple-needs-results.html should exist.");
assert.ok(fs.existsSync(simpleNeedsDisplayPath), "simple-needs-results-display.js should exist.");

const simpleNeedsResultsHtml = readRepoFile("pages/simple-needs-results.html");
const simpleNeedsDisplaySource = readRepoFile("app/features/lens-analysis/simple-needs-results-display.js");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensHtml = readRepoFile("pages/lens.html");
const dimeEntryHtml = readRepoFile("pages/dime-entry.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const hlvEntryHtml = readRepoFile("pages/hlv-entry.html");
const hlvResultsHtml = readRepoFile("pages/hlv-results.html");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const mainContent = getMainContent(simpleNeedsResultsHtml);

assert.match(simpleNeedsResultsHtml, /<title>Simple Needs Analysis \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(simpleNeedsResultsHtml, /<h1>Simple Needs Analysis<\/h1>/);
assert.match(simpleNeedsResultsHtml, /Straightforward current-dollar needs estimate using core planning inputs\./);
assert.equal(
  countMatches(simpleNeedsResultsHtml, /data-simple-needs-results-analysis/g),
  1,
  "Simple Needs result page should contain exactly one Simple Needs result host."
);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-simple-needs-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(mainContent, /DIME Analysis/);
assert.doesNotMatch(mainContent, /LENS Analysis/);
assert.doesNotMatch(mainContent, /Human Life Value/);
assert.doesNotMatch(simpleNeedsResultsHtml, /Projected Asset Growth/);
assert.doesNotMatch(simpleNeedsResultsHtml, /Cash Reserve Projection/);
assert.doesNotMatch(simpleNeedsResultsHtml, /Healthcare Expense Projection/);
assert.doesNotMatch(simpleNeedsResultsHtml, /Final Expense Projection/);
assert.doesNotMatch(simpleNeedsResultsHtml, /LENS Projection Details/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-analysis-setup/);
assert.doesNotMatch(simpleNeedsResultsHtml, /step-three-analysis-display\.js/);

const scripts = extractScriptSources(simpleNeedsResultsHtml);
[
  "../app/features/lens-analysis/schema.js",
  "../app/features/lens-analysis/normalize-lens-model.js",
  "../app/features/lens-analysis/asset-treatment-calculations.js",
  "../app/features/lens-analysis/existing-coverage-treatment-calculations.js",
  "../app/features/lens-analysis/debt-treatment-calculations.js",
  "../app/features/lens-analysis/asset-growth-projection-calculations.js",
  "../app/features/lens-analysis/cash-reserve-calculations.js",
  "../app/features/lens-analysis/lens-model-builder.js",
  "../app/features/lens-analysis/analysis-methods.js",
  "../app/features/lens-analysis/analysis-settings-adapter.js",
  "../app/features/lens-analysis/simple-needs-results-display.js"
].forEach(function (script) {
  assert.ok(scripts.includes(script), `${script} should load on Simple Needs result page.`);
});
assert.equal(
  scripts.includes("../app/features/lens-analysis/projected-asset-offset-calculations.js"),
  false,
  "Simple Needs result page should not require projected asset offset helper while projectedAssetOffset is inactive."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/schema.js")
    < scripts.indexOf("../app/features/lens-analysis/normalize-lens-model.js"),
  "Schema should load before model normalization."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/normalize-lens-model.js")
    < scripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Model normalization should load before model builder."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/asset-growth-projection-calculations.js")
    < scripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Asset growth projection helper should load before model builder."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/cash-reserve-calculations.js")
    < scripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Cash reserve helper should load before model builder."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/lens-model-builder.js")
    < scripts.indexOf("../app/features/lens-analysis/analysis-methods.js"),
  "Model builder should load before analysis methods."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/analysis-methods.js")
    < scripts.indexOf("../app/features/lens-analysis/analysis-settings-adapter.js"),
  "Analysis methods should load before settings adapter."
);
assert.ok(
  scripts.indexOf("../app/features/lens-analysis/analysis-settings-adapter.js")
    < scripts.indexOf("../app/features/lens-analysis/simple-needs-results-display.js"),
  "Settings adapter should load before Simple Needs display."
);

assert.match(simpleNeedsDisplaySource, /function initializeSimpleNeedsResultsDisplay\(/);
assert.match(simpleNeedsDisplaySource, /runSimpleNeedsAnalysis/);
assert.match(simpleNeedsDisplaySource, /DEFAULT_SIMPLE_NEEDS_SETTINGS/);
assert.match(simpleNeedsDisplaySource, /data-simple-needs-results-analysis/);
assert.match(simpleNeedsDisplaySource, /Gross Simple Needs/);
assert.match(simpleNeedsDisplaySource, /Debt Payoff/);
assert.match(simpleNeedsDisplaySource, /Essential Support/);
assert.match(simpleNeedsDisplaySource, /Education/);
assert.match(simpleNeedsDisplaySource, /Final Expenses/);
assert.match(simpleNeedsDisplaySource, /Existing Coverage Offset/);
assert.match(simpleNeedsDisplaySource, /Asset Offset/);
assert.match(simpleNeedsDisplaySource, /Net Coverage Gap/);
assert.doesNotMatch(simpleNeedsDisplaySource, /runAnalysisMethods/);
assert.doesNotMatch(simpleNeedsDisplaySource, /runDimeAnalysis/);
assert.doesNotMatch(simpleNeedsDisplaySource, /runNeedsAnalysis/);
assert.doesNotMatch(simpleNeedsDisplaySource, /runHumanLifeValueAnalysis/);
assert.doesNotMatch(simpleNeedsDisplaySource, /step-three-analysis-display/);
assert.doesNotMatch(simpleNeedsDisplaySource, /data-step-three-/);

assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.match(analysisMethodsSource, /DEFAULT_SIMPLE_NEEDS_SETTINGS/);
assert.match(analysisMethodsSource, /dime: runDimeAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /needsAnalysis: runNeedsAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /humanLifeValue: runHumanLifeValueAnalysis\(lensModel, settings\)/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);

assert.match(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-simple-needs-results-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-simple-needs-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /simple-needs-results-display\.js/);

const simpleNeedsCard = getCardBlock(lensHtml, "simple-needs");
assert.match(simpleNeedsCard, /Simple Needs Analysis/);
assert.match(simpleNeedsCard, /Quick flow available/);
assert.match(simpleNeedsCard, /Quick current-dollar needs estimate using core planning inputs/);
assert.match(simpleNeedsCard, /debts, essential support, education, final expenses, and existing coverage/);
assert.match(simpleNeedsCard, /does not use the LENS assumptions panel/);
assert.match(simpleNeedsCard, /Start Simple Needs Analysis/);
assert.match(simpleNeedsCard, /href="simple-needs-entry\.html"/);
assert.match(simpleNeedsCard, /data-simple-needs-start-link/);
assert.doesNotMatch(simpleNeedsCard, /Quick flow coming soon/);
assert.doesNotMatch(simpleNeedsCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(simpleNeedsCard, /simple-needs-results\.html/);
assert.equal(
  fs.existsSync(path.join(repoRoot, "pages/simple-needs-entry.html")),
  true,
  "Simple Needs entry page should exist before selector activation."
);

assert.match(dimeEntryHtml, /href="dime-results\.html"/);
assert.match(dimeEntryHtml, /data-dime-results-link/);
assert.equal(countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g), 1);
assert.doesNotMatch(dimeResultsHtml, /data-simple-needs-results-analysis/);
assert.doesNotMatch(dimeResultsHtml, /simple-needs-results-display\.js/);

assert.match(hlvEntryHtml, /href="hlv-results\.html"/);
assert.match(hlvEntryHtml, /data-hlv-results-link/);
assert.equal(countMatches(hlvResultsHtml, /data-step-three-human-life-value-analysis/g), 1);
assert.doesNotMatch(hlvResultsHtml, /data-simple-needs-results-analysis/);
assert.doesNotMatch(hlvResultsHtml, /simple-needs-results-display\.js/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/hlv-results.html"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Simple Needs selector activation should not change adapter, Step 3 display, DIME pages, or HLV pages."
);

console.log("simple-needs-results-page-check passed");
