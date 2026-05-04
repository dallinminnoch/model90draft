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

const hlvResultsPath = path.join(repoRoot, "pages/hlv-results.html");
assert.ok(fs.existsSync(hlvResultsPath), "pages/hlv-results.html should exist.");

const hlvResultsHtml = readRepoFile("pages/hlv-results.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensHtml = readRepoFile("pages/lens.html");
const dimeEntryHtml = readRepoFile("pages/dime-entry.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.match(hlvResultsHtml, /<title>Human Life Value \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(hlvResultsHtml, /<h1>Human Life Value<\/h1>/);
assert.match(hlvResultsHtml, /Fast income-capitalization estimate from the linked protection modeling data\./);

assert.equal(
  countMatches(hlvResultsHtml, /data-step-three-human-life-value-analysis/g),
  1,
  "HLV result page should contain exactly one Human Life Value Step 3 host."
);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(hlvResultsHtml, /DIME analysis will appear here/);
assert.doesNotMatch(hlvResultsHtml, /LENS Analysis will appear here/);
assert.doesNotMatch(hlvResultsHtml, /LENS Projection Details/);
assert.doesNotMatch(hlvResultsHtml, /Projected Asset Growth/);
assert.doesNotMatch(hlvResultsHtml, /Cash Reserve Projection/);
assert.doesNotMatch(hlvResultsHtml, /Healthcare Expense Projection/);
assert.doesNotMatch(hlvResultsHtml, /Final Expense Projection/);
assert.doesNotMatch(hlvResultsHtml, /data-analysis-setup/);
assert.doesNotMatch(hlvResultsHtml, /Asset Treatment/);
assert.doesNotMatch(hlvResultsHtml, /Growth & Return/);
assert.doesNotMatch(hlvResultsHtml, /Projected Asset Offset/);
assert.doesNotMatch(hlvResultsHtml, /Cash Reserve Assumptions/);

const hlvScripts = extractScriptSources(hlvResultsHtml);
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
  assert.ok(hlvScripts.includes(script), `${script} should load on HLV result page.`);
});
assert.equal(
  hlvScripts.includes("../app/features/lens-analysis/projected-asset-offset-calculations.js"),
  false,
  "HLV result page should not require projected asset offset helper while projectedAssetOffset is inactive."
);

assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/schema.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/normalize-lens-model.js"),
  "Schema should load before model normalization."
);
assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/normalize-lens-model.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Model normalization should load before model builder."
);
assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/asset-growth-projection-calculations.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Asset growth projection helper should load before model builder."
);
assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/cash-reserve-calculations.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Cash reserve helper should load before model builder."
);
assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/lens-model-builder.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/analysis-methods.js"),
  "Model builder should load before analysis methods."
);
assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/analysis-methods.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/analysis-settings-adapter.js"),
  "Analysis methods should load before settings adapter."
);
assert.ok(
  hlvScripts.indexOf("../app/features/lens-analysis/analysis-settings-adapter.js")
    < hlvScripts.indexOf("../app/features/lens-analysis/step-three-analysis-display.js"),
  "Settings adapter should load before Step 3 display."
);

assert.match(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);

const hlvCard = getCardBlock(lensHtml, "human-life-value");
assert.match(hlvCard, /Human Life Value/);
assert.match(hlvCard, /Quick flow available/);
assert.match(hlvCard, /Quick income-capitalization estimate using income value and projection years\./);
assert.match(hlvCard, /does not use the LENS assumptions panel/);
assert.match(hlvCard, /Start Human Life Value/);
assert.match(hlvCard, /href="hlv-entry\.html"/);
assert.match(hlvCard, /data-hlv-start-link/);
assert.doesNotMatch(hlvCard, /Quick flow coming soon/);
assert.doesNotMatch(hlvCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(hlvCard, /hlv-results\.html/);

const dimeCard = getCardBlock(lensHtml, "dime");
assert.match(dimeCard, /href="dime-entry\.html"/);
assert.match(dimeCard, /data-dime-start-link/);
assert.doesNotMatch(dimeCard, /dime-results\.html/);

assert.match(dimeEntryHtml, /href="dime-results\.html"/);
assert.match(dimeEntryHtml, /data-dime-results-link/);
assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "DIME result page should remain DIME-only."
);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-needs-analysis/);

assert.match(analysisMethodsSource, /function runHumanLifeValueAnalysis\(/);
assert.match(analysisMethodsSource, /method: "humanLifeValue"/);
assert.match(analysisMethodsSource, /humanLifeValue: runHumanLifeValueAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);

assert.match(stepThreeDisplaySource, /function renderHumanLifeValueResult\(/);
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-human-life-value-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-dime-analysis]")'));
assert.ok(stepThreeDisplaySource.includes('querySelector("[data-step-three-needs-analysis]")'));

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/profile.html",
  "workspace-side-nav.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "No HLV-adjacent adapter, DIME, profile, or side-nav files should be changed."
);

console.log("hlv-results-page-check passed");
