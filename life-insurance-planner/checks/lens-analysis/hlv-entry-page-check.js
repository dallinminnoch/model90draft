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

const hlvEntryPath = path.join(repoRoot, "pages/hlv-entry.html");
assert.ok(fs.existsSync(hlvEntryPath), "pages/hlv-entry.html should exist.");

const hlvEntryHtml = readRepoFile("pages/hlv-entry.html");
const hlvResultsHtml = readRepoFile("pages/hlv-results.html");
const dimeEntryHtml = readRepoFile("pages/dime-entry.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const lensHtml = readRepoFile("pages/lens.html");
const quickPickerSource = readRepoFile("app/features/lens-analysis/quick-linked-profile-picker.js");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.match(hlvEntryHtml, /<title>Human Life Value \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(hlvEntryHtml, /<h1 class="lens-hero-title">Human Life Value<\/h1>/);
assert.match(hlvEntryHtml, /Quick income-capitalization estimate\./);
assert.match(hlvEntryHtml, /Link a client profile to generate an HLV-only result\./);
assert.match(hlvEntryHtml, /does not use the LENS assumptions panel/);
assert.match(hlvEntryHtml, /income value and projection years/);
assert.match(hlvEntryHtml, /Search for a saved individual client or enter a case reference/);
assert.match(hlvEntryHtml, /Annual income value/);
assert.match(hlvEntryHtml, /Projection years/);

assert.match(hlvEntryHtml, /href="hlv-results\.html"/);
assert.match(hlvEntryHtml, /data-hlv-results-link/);
assert.match(hlvEntryHtml, /data-quick-linked-profile-picker/);
assert.match(hlvEntryHtml, /data-quick-profile-search/);
assert.match(hlvEntryHtml, /data-quick-profile-case-ref/);
assert.match(hlvEntryHtml, /data-quick-profile-results/);
assert.match(hlvEntryHtml, /data-quick-profile-selected-card/);
assert.match(hlvEntryHtml, /data-quick-profile-status/);
assert.match(hlvEntryHtml, /Select a client with completed Protection Modeling Inputs to continue\./);
assert.match(hlvEntryHtml, /aria-disabled="true"/);
assert.match(hlvEntryHtml, /data-quick-profile-blocked="true"/);
assert.match(hlvEntryHtml, /quick-linked-profile-picker\.js/);
assert.match(hlvEntryHtml, /initQuickLinkedProfilePicker/);
assert.match(hlvEntryHtml, /methodLabel: "Human Life Value"/);
assert.match(hlvEntryHtml, /resultPagePath: "hlv-results\.html"/);
assert.match(quickPickerSource, /Select a client with completed Protection Modeling Inputs before continuing to \$\{methodLabel\} results\./);
assert.match(quickPickerSource, /needs completed Protection Modeling Inputs before \$\{methodLabel\} can continue\./);
assert.match(hlvEntryHtml, /const passthroughParams = \["caseRef", "profileCaseRef", "linkedCaseRef", "id"\]/);
assert.match(hlvEntryHtml, /sourceParams\.get\("profileCaseRef"\)/);
assert.match(hlvEntryHtml, /sourceParams\.get\("linkedCaseRef"\)/);
assert.match(
  hlvEntryHtml,
  /link\.setAttribute\("href", queryString \? `hlv-results\.html\?\$\{queryString\}` : "hlv-results\.html"\)/
);
assert.match(hlvEntryHtml, /allowedQueryKeys: passthroughParams/);

assert.doesNotMatch(hlvEntryHtml, /analysis-setup\.html/);
assert.doesNotMatch(hlvEntryHtml, /analysis-estimate\.html/);
assert.doesNotMatch(hlvEntryHtml, /income-loss-impact\.html/);
assert.doesNotMatch(hlvEntryHtml, /dime-entry\.html/);
assert.doesNotMatch(hlvEntryHtml, /dime-results\.html/);
assert.doesNotMatch(hlvEntryHtml, /simple-needs-entry\.html/);
assert.doesNotMatch(hlvEntryHtml, /simple-needs-results\.html/);
assert.doesNotMatch(hlvEntryHtml, /Asset Treatment/);
assert.doesNotMatch(hlvEntryHtml, /Cash Reserve/);
assert.doesNotMatch(hlvEntryHtml, /Growth & Return/);
assert.doesNotMatch(hlvEntryHtml, /Healthcare Expense/);
assert.doesNotMatch(hlvEntryHtml, /data-step-three-/);
assert.doesNotMatch(hlvEntryHtml, /assetGrowthProjectionAssumptions/);
assert.doesNotMatch(hlvEntryHtml, /cashReserveAssumptions/);

assert.ok(fs.existsSync(path.join(repoRoot, "pages/hlv-results.html")), "pages/hlv-results.html should still exist.");
assert.equal(
  countMatches(hlvResultsHtml, /data-step-three-human-life-value-analysis/g),
  1,
  "HLV result page should still contain exactly one HLV host."
);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(hlvResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(hlvResultsHtml, /Projected Asset Growth/);
assert.doesNotMatch(hlvResultsHtml, /Cash Reserve Projection/);

assert.ok(fs.existsSync(path.join(repoRoot, "pages/dime-entry.html")), "pages/dime-entry.html should still exist.");
assert.ok(fs.existsSync(path.join(repoRoot, "pages/dime-results.html")), "pages/dime-results.html should still exist.");
assert.match(dimeEntryHtml, /href="dime-results\.html"/);
assert.match(dimeEntryHtml, /data-dime-results-link/);
assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "DIME result page should remain DIME-only."
);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-human-life-value-analysis/);

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

assert.match(analysisMethodsSource, /function runHumanLifeValueAnalysis\(/);
assert.match(analysisMethodsSource, /method: "humanLifeValue"/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);
assert.match(stepThreeDisplaySource, /function renderHumanLifeValueResult\(/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "pages/hlv-results.html",
  "pages/dime-results.html",
  "pages/profile.html",
  "pages/analysis-estimate.html"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "No Step 3, model-builder, adapter, selector, HLV results, DIME, profile, or estimate files should be changed."
);

console.log("hlv-entry-page-check passed");
