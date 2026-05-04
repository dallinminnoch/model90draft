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

const helperPath = path.join(repoRoot, "app/features/lens-analysis/quick-linked-profile-picker.js");
assert.ok(fs.existsSync(helperPath), "quick-linked-profile-picker.js should exist.");

const helperSource = readRepoFile("app/features/lens-analysis/quick-linked-profile-picker.js");
const dimeEntryHtml = readRepoFile("pages/dime-entry.html");
const simpleNeedsEntryHtml = readRepoFile("pages/simple-needs-entry.html");
const hlvEntryHtml = readRepoFile("pages/hlv-entry.html");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");

assert.match(helperSource, /const lensAnalysis = LensApp\.lensAnalysis \|\| \(LensApp\.lensAnalysis = \{\}\)/);
assert.match(helperSource, /lensAnalysis\.initQuickLinkedProfilePicker = initQuickLinkedProfilePicker/);
assert.match(helperSource, /function initQuickLinkedProfilePicker\(config\)/);
assert.match(helperSource, /LensApp\.clientRecords/);

[
  "getLinkableIndividualClientRecords",
  "findLinkableIndividualClientByCaseRef",
  "getClientRecordByReference",
  "getCurrentLinkedRecord",
  "setLinkedCaseRef",
  "setLinkedRecordId",
  "normalizeCaseRef"
].forEach(function (apiName) {
  assert.match(helperSource, new RegExp(apiName), `Helper should use ${apiName}.`);
});

assert.match(helperSource, /DEFAULT_ALLOWED_QUERY_KEYS = \["caseRef", "profileCaseRef", "linkedCaseRef", "id"\]/);
assert.match(helperSource, /allowedQueryKeys/);
assert.match(helperSource, /buildPreservedQueryParams/);
assert.match(helperSource, /nextParams\.set\("caseRef", normalizedCaseRef\)/);
assert.match(helperSource, /nextParams\.set\("linkedCaseRef", normalizedCaseRef\)/);
assert.match(helperSource, /nextParams\.set\("id", recordId\)/);

assert.match(helperSource, /function getCompletedProtectionModelingPayload\(record\)/);
assert.match(helperSource, /record\.protectionModeling/);
assert.match(helperSource, /record\.protectionModelingEntries/);
assert.match(helperSource, /record\.pmiCompleted === true/);
assert.match(helperSource, /latestPayload\.completed === true/);
assert.match(helperSource, /completed Protection Modeling Inputs/);

assert.match(helperSource, /data-quick-profile-search/);
assert.match(helperSource, /data-quick-profile-case-ref/);
assert.match(helperSource, /data-quick-profile-results/);
assert.match(helperSource, /data-quick-profile-selected-card/);
assert.match(helperSource, /data-quick-profile-status/);
assert.match(helperSource, /data-quick-profile-blocked/);
assert.match(helperSource, /event\.preventDefault\(\)/);

assert.doesNotMatch(helperSource, /sessionStorage\.setItem/);
assert.doesNotMatch(helperSource, /localStorage\.setItem/);
assert.doesNotMatch(helperSource, /runDimeAnalysis/);
assert.doesNotMatch(helperSource, /runAnalysisMethods/);
assert.doesNotMatch(helperSource, /runNeedsAnalysis/);
assert.doesNotMatch(helperSource, /runHumanLifeValueAnalysis/);
assert.doesNotMatch(helperSource, /analysis-setup/i);
assert.doesNotMatch(helperSource, /profile\.html/);
assert.doesNotMatch(helperSource, /simple-needs/i);
assert.doesNotMatch(helperSource, /humanLifeValue/);
assert.doesNotMatch(helperSource, /hlv/i);

assert.match(dimeEntryHtml, /quick-linked-profile-picker\.js/);
assert.match(dimeEntryHtml, /data-quick-linked-profile-picker/);
assert.match(dimeEntryHtml, /initQuickLinkedProfilePicker/);
assert.match(dimeEntryHtml, /methodLabel: "DIME Analysis"/);
assert.match(dimeEntryHtml, /resultPagePath: "dime-results\.html"/);
assert.match(dimeEntryHtml, /allowedQueryKeys: passthroughParams/);
assert.match(dimeEntryHtml, /continueLinkSelector: "\[data-dime-results-link\]"/);
assert.match(dimeEntryHtml, /data-quick-profile-search/);
assert.match(dimeEntryHtml, /data-quick-profile-case-ref/);
assert.match(dimeEntryHtml, /data-quick-profile-selected-card/);
assert.match(dimeEntryHtml, /data-quick-profile-status/);
assert.match(dimeEntryHtml, /aria-disabled="true"/);
assert.match(dimeEntryHtml, /data-quick-profile-blocked="true"/);

assert.match(simpleNeedsEntryHtml, /quick-linked-profile-picker\.js/);
assert.match(simpleNeedsEntryHtml, /data-quick-linked-profile-picker/);
assert.match(simpleNeedsEntryHtml, /initQuickLinkedProfilePicker/);
assert.match(simpleNeedsEntryHtml, /methodLabel: "Simple Needs Analysis"/);
assert.match(simpleNeedsEntryHtml, /resultPagePath: "simple-needs-results\.html"/);
assert.match(simpleNeedsEntryHtml, /allowedQueryKeys: passthroughParams/);
assert.match(simpleNeedsEntryHtml, /continueLinkSelector: "\[data-simple-needs-results-link\]"/);
assert.match(simpleNeedsEntryHtml, /data-quick-profile-search/);
assert.match(simpleNeedsEntryHtml, /data-quick-profile-case-ref/);
assert.match(simpleNeedsEntryHtml, /data-quick-profile-selected-card/);
assert.match(simpleNeedsEntryHtml, /data-quick-profile-status/);
assert.match(simpleNeedsEntryHtml, /aria-disabled="true"/);
assert.match(simpleNeedsEntryHtml, /data-quick-profile-blocked="true"/);
assert.doesNotMatch(hlvEntryHtml, /quick-linked-profile-picker\.js/);
assert.doesNotMatch(hlvEntryHtml, /initQuickLinkedProfilePicker/);
assert.doesNotMatch(hlvEntryHtml, /data-quick-linked-profile-picker/);

assert.match(analysisMethodsSource, /function runDimeAnalysis\(/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /function runHumanLifeValueAnalysis\(/);
assert.match(analysisMethodsSource, /method: "dime"/);
assert.match(analysisMethodsSource, /method: "needsAnalysis"/);
assert.match(analysisMethodsSource, /method: "humanLifeValue"/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);

const protectedChanges = getChangedFiles([
  "pages/profile.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/lens.html",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "pages/analysis-setup.html",
  "app/features/lens-analysis/analysis-setup.js",
  "lens-workflow.js",
  "workspace-side-nav.js",
  "app/core/config.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Quick picker adoption should not change LENS profile, result pages, DIME pages, HLV pages, selector, methods, Step 3, Analysis Setup, workflow, side-nav, or config files."
);

console.log("quick-linked-profile-picker-check passed");
