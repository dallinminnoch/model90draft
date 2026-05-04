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

const simpleNeedsEntryPath = path.join(repoRoot, "pages/simple-needs-entry.html");
assert.ok(fs.existsSync(simpleNeedsEntryPath), "pages/simple-needs-entry.html should exist.");

const simpleNeedsEntryHtml = readRepoFile("pages/simple-needs-entry.html");
const simpleNeedsResultsHtml = readRepoFile("pages/simple-needs-results.html");
const dimeEntryHtml = readRepoFile("pages/dime-entry.html");
const dimeResultsHtml = readRepoFile("pages/dime-results.html");
const hlvEntryHtml = readRepoFile("pages/hlv-entry.html");
const hlvResultsHtml = readRepoFile("pages/hlv-results.html");
const lensHtml = readRepoFile("pages/lens.html");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");

assert.match(simpleNeedsEntryHtml, /<title>Simple Needs Analysis \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(simpleNeedsEntryHtml, /<h1 class="lens-hero-title">Simple Needs Analysis<\/h1>/);
assert.match(simpleNeedsEntryHtml, /Straightforward current-dollar needs estimate using core planning inputs\./);
assert.match(simpleNeedsEntryHtml, /Link a client profile to generate a Simple Needs-only result\./);
assert.match(simpleNeedsEntryHtml, /does not use the LENS assumptions panel/);
assert.match(simpleNeedsEntryHtml, /debts, essential support, education, final expenses, and existing coverage/);
assert.match(simpleNeedsEntryHtml, /Debts/);
assert.match(simpleNeedsEntryHtml, /Essential support/);
assert.match(simpleNeedsEntryHtml, /Education/);
assert.match(simpleNeedsEntryHtml, /Final expenses/);
assert.match(simpleNeedsEntryHtml, /Existing coverage/);

assert.match(simpleNeedsEntryHtml, /href="simple-needs-results\.html"/);
assert.match(simpleNeedsEntryHtml, /data-simple-needs-results-link/);
assert.match(simpleNeedsEntryHtml, /const passthroughParams = \["caseRef", "profileCaseRef", "linkedCaseRef", "id"\]/);
assert.match(simpleNeedsEntryHtml, /sourceParams\.get\("profileCaseRef"\)/);
assert.match(simpleNeedsEntryHtml, /sourceParams\.get\("linkedCaseRef"\)/);
assert.match(
  simpleNeedsEntryHtml,
  /link\.setAttribute\("href", queryString \? `simple-needs-results\.html\?\$\{queryString\}` : "simple-needs-results\.html"\)/
);

assert.doesNotMatch(simpleNeedsEntryHtml, /analysis-setup\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /analysis-estimate\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /income-loss-impact\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /dime-entry\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /dime-results\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /hlv-entry\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /hlv-results\.html/);
assert.doesNotMatch(simpleNeedsEntryHtml, /Asset Treatment/);
assert.doesNotMatch(simpleNeedsEntryHtml, /Cash Reserve/);
assert.doesNotMatch(simpleNeedsEntryHtml, /Growth & Return/);
assert.doesNotMatch(simpleNeedsEntryHtml, /Healthcare Expense/);
assert.doesNotMatch(simpleNeedsEntryHtml, /data-step-three-/);
assert.doesNotMatch(simpleNeedsEntryHtml, /assetGrowthProjectionAssumptions/);
assert.doesNotMatch(simpleNeedsEntryHtml, /cashReserveAssumptions/);

assert.ok(fs.existsSync(path.join(repoRoot, "pages/simple-needs-results.html")), "pages/simple-needs-results.html should still exist.");
assert.equal(
  countMatches(simpleNeedsResultsHtml, /data-simple-needs-results-analysis/g),
  1,
  "Simple Needs result page should still contain exactly one Simple Needs host."
);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(simpleNeedsResultsHtml, /data-step-three-human-life-value-analysis/);

assert.ok(fs.existsSync(path.join(repoRoot, "pages/dime-entry.html")), "pages/dime-entry.html should still exist.");
assert.ok(fs.existsSync(path.join(repoRoot, "pages/dime-results.html")), "pages/dime-results.html should still exist.");
assert.match(dimeEntryHtml, /href="dime-results\.html"/);
assert.match(dimeEntryHtml, /data-dime-results-link/);
assert.equal(
  countMatches(dimeResultsHtml, /data-step-three-dime-analysis/g),
  1,
  "DIME result page should remain DIME-only."
);
assert.doesNotMatch(dimeResultsHtml, /data-simple-needs-results-analysis/);

assert.ok(fs.existsSync(path.join(repoRoot, "pages/hlv-entry.html")), "pages/hlv-entry.html should still exist.");
assert.ok(fs.existsSync(path.join(repoRoot, "pages/hlv-results.html")), "pages/hlv-results.html should still exist.");
assert.match(hlvEntryHtml, /href="hlv-results\.html"/);
assert.match(hlvEntryHtml, /data-hlv-results-link/);
assert.equal(
  countMatches(hlvResultsHtml, /data-step-three-human-life-value-analysis/g),
  1,
  "HLV result page should remain HLV-only."
);
assert.doesNotMatch(hlvResultsHtml, /data-simple-needs-results-analysis/);

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

assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/simple-needs-results-display.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "pages/simple-needs-results.html",
  "pages/dime-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "pages/profile.html",
  "pages/analysis-estimate.html",
  "workspace-side-nav.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Simple Needs selector activation should not change methods, display initializer, Step 3, model builder, adapter, result page, DIME pages, HLV pages, profile, estimate, or side-nav files."
);

console.log("simple-needs-entry-page-check passed");
