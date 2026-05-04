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

const dimeEntryPath = path.join(repoRoot, "pages/dime-entry.html");
assert.ok(fs.existsSync(dimeEntryPath), "pages/dime-entry.html should exist.");

const dimeEntryHtml = readRepoFile("pages/dime-entry.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const lensHtml = readRepoFile("pages/lens.html");
const quickPickerSource = readRepoFile("app/features/lens-analysis/quick-linked-profile-picker.js");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.match(dimeEntryHtml, /<title>DIME Analysis \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(dimeEntryHtml, /<h1 class="lens-hero-title">DIME Analysis<\/h1>/);
assert.match(dimeEntryHtml, /Quick coverage estimate using debts, income, mortgage, and education\./);
assert.match(dimeEntryHtml, /Link a client profile to generate a DIME-only result\./);
assert.match(dimeEntryHtml, /does not use the LENS assumptions panel/);
assert.match(dimeEntryHtml, /Search for a saved individual client or enter a case reference/);
assert.match(dimeEntryHtml, /Debts/);
assert.match(dimeEntryHtml, /Income/);
assert.match(dimeEntryHtml, /Mortgage/);
assert.match(dimeEntryHtml, /Education/);

assert.match(dimeEntryHtml, /href="dime-results\.html"/);
assert.match(dimeEntryHtml, /data-dime-results-link/);
assert.match(dimeEntryHtml, /data-quick-linked-profile-picker/);
assert.match(dimeEntryHtml, /data-quick-profile-search/);
assert.match(dimeEntryHtml, /data-quick-profile-case-ref/);
assert.match(dimeEntryHtml, /data-quick-profile-results/);
assert.match(dimeEntryHtml, /data-quick-profile-selected-card/);
assert.match(dimeEntryHtml, /data-quick-profile-status/);
assert.match(dimeEntryHtml, /Select a client with completed Protection Modeling Inputs to continue\./);
assert.match(dimeEntryHtml, /aria-disabled="true"/);
assert.match(dimeEntryHtml, /data-quick-profile-blocked="true"/);
assert.match(dimeEntryHtml, /quick-linked-profile-picker\.js/);
assert.match(dimeEntryHtml, /initQuickLinkedProfilePicker/);
assert.match(dimeEntryHtml, /methodLabel: "DIME Analysis"/);
assert.match(dimeEntryHtml, /resultPagePath: "dime-results\.html"/);
assert.match(quickPickerSource, /Select a client with completed Protection Modeling Inputs before continuing to \$\{methodLabel\} results\./);
assert.match(quickPickerSource, /needs completed Protection Modeling Inputs before \$\{methodLabel\} can continue\./);
assert.match(dimeEntryHtml, /const passthroughParams = \["caseRef", "profileCaseRef", "linkedCaseRef", "id"\]/);
assert.match(dimeEntryHtml, /sourceParams\.get\("profileCaseRef"\)/);
assert.match(dimeEntryHtml, /sourceParams\.get\("linkedCaseRef"\)/);
assert.match(
  dimeEntryHtml,
  /link\.setAttribute\("href", queryString \? `dime-results\.html\?\$\{queryString\}` : "dime-results\.html"\)/
);
assert.match(dimeEntryHtml, /allowedQueryKeys: passthroughParams/);

assert.doesNotMatch(dimeEntryHtml, /analysis-setup\.html/);
assert.doesNotMatch(dimeEntryHtml, /analysis-estimate\.html/);
assert.doesNotMatch(dimeEntryHtml, /income-loss-impact\.html/);
assert.doesNotMatch(dimeEntryHtml, /simple-needs-entry\.html/);
assert.doesNotMatch(dimeEntryHtml, /simple-needs-results\.html/);
assert.doesNotMatch(dimeEntryHtml, /hlv-entry\.html/);
assert.doesNotMatch(dimeEntryHtml, /hlv-results\.html/);
assert.doesNotMatch(dimeEntryHtml, /Asset Treatment/);
assert.doesNotMatch(dimeEntryHtml, /Cash Reserve/);
assert.doesNotMatch(dimeEntryHtml, /Growth & Return/);
assert.doesNotMatch(dimeEntryHtml, /Healthcare Expense/);
assert.doesNotMatch(dimeEntryHtml, /data-step-three-/);
assert.doesNotMatch(dimeEntryHtml, /assetGrowthProjectionAssumptions/);
assert.doesNotMatch(dimeEntryHtml, /cashReserveAssumptions/);

assert.ok(fs.existsSync(path.join(repoRoot, "pages/dime-results.html")), "pages/dime-results.html should still exist.");
assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "DIME result page should still contain exactly one DIME host."
);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(dimeResultsHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(dimeResultsHtml, /Projected Asset Growth/);
assert.doesNotMatch(dimeResultsHtml, /Cash Reserve Projection/);

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

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "pages/dime-results.html",
  "pages/profile.html",
  "pages/analysis-estimate.html"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "No Step 3, model-builder, adapter, existing DIME results, profile, or estimate files should be changed."
);

console.log("dime-entry-page-check passed");
