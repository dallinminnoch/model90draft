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

function getCardBlock(source, key) {
  const pattern = new RegExp(
    `<article\\b[^>]*data-analysis-type-card="${key}"[^>]*>[\\s\\S]*?<\\/article>`,
    "m"
  );
  const match = source.match(pattern);
  assert.ok(match, `Expected analysis type card for ${key}.`);
  return match[0];
}

function getHrefValues(source) {
  return Array.from(source.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)).map(function (match) {
    return match[1];
  });
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

const lensHtml = readRepoFile("pages/lens.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const workspaceSideNavSource = readRepoFile("workspace-side-nav.js");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");

assert.match(lensHtml, /Choose an Analysis Type/);
assert.match(
  lensHtml,
  /Start with LENS for the full advanced planning workflow, or choose a quicker standalone analysis path when available\./
);
assert.match(
  lensHtml,
  /DIME, Simple Needs, and Human Life Value are available as quick flows\./
);
assert.match(
  lensHtml,
  /The primary LENS path runs from linked profile entry to Analysis Setup and then the LENS result page\./
);
assert.match(
  lensHtml,
  /Income Loss Impact remains available as optional read-only review, not a required step\./
);
assert.doesNotMatch(
  lensHtml,
  /continues through linked profile entry, Analysis Setup, income impact, and the existing results page/
);

const lensCard = getCardBlock(lensHtml, "lens");
const dimeCard = getCardBlock(lensHtml, "dime");
const simpleNeedsCard = getCardBlock(lensHtml, "simple-needs");
const hlvCard = getCardBlock(lensHtml, "human-life-value");

assert.match(lensCard, /LENS Analysis/);
assert.match(lensCard, /Advanced needs analysis using detailed planning assumptions\./);
assert.match(lensCard, /Available now/);
assert.match(lensCard, /Start LENS Analysis/);
assert.deepEqual(getHrefValues(lensCard), ["profile.html"]);
assert.match(lensCard, /data-lens-start-link/);

assert.match(dimeCard, /DIME Analysis/);
assert.match(dimeCard, /Quick flow available/);
assert.match(dimeCard, /Quick coverage estimate using debts, income, mortgage, and education\./);
assert.match(dimeCard, /does not use the LENS assumptions panel/);
assert.match(dimeCard, /Start DIME Analysis/);
assert.deepEqual(getHrefValues(dimeCard), ["dime-entry.html"]);
assert.match(dimeCard, /data-dime-start-link/);
assert.doesNotMatch(dimeCard, /Quick flow coming soon/);
assert.doesNotMatch(dimeCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(dimeCard, /dime-results\.html/);

assert.match(hlvCard, /Human Life Value/);
assert.match(hlvCard, /Quick flow available/);
assert.match(hlvCard, /Quick income-capitalization estimate using income value and projection years\./);
assert.match(hlvCard, /does not use the LENS assumptions panel/);
assert.match(hlvCard, /Start Human Life Value/);
assert.deepEqual(getHrefValues(hlvCard), ["hlv-entry.html"]);
assert.match(hlvCard, /data-hlv-start-link/);
assert.doesNotMatch(hlvCard, /Quick flow coming soon/);
assert.doesNotMatch(hlvCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(hlvCard, /hlv-results\.html/);

assert.match(simpleNeedsCard, /Simple Needs Analysis/);
assert.match(simpleNeedsCard, /Quick flow available/);
assert.match(simpleNeedsCard, /Quick current-dollar needs estimate using core planning inputs/);
assert.match(simpleNeedsCard, /debts, essential support, education, final expenses, and existing coverage/);
assert.match(simpleNeedsCard, /does not use the LENS assumptions panel/);
assert.match(simpleNeedsCard, /Start Simple Needs Analysis/);
assert.deepEqual(getHrefValues(simpleNeedsCard), ["simple-needs-entry.html"]);
assert.match(simpleNeedsCard, /data-simple-needs-start-link/);
assert.doesNotMatch(simpleNeedsCard, /Quick flow coming soon/);
assert.doesNotMatch(simpleNeedsCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(simpleNeedsCard, /simple-needs-results\.html/);

assert.match(lensHtml, /const passthroughParams = \["caseRef", "profileCaseRef", "linkedCaseRef", "id"\]/);
assert.match(lensHtml, /sourceParams\.get\("profileCaseRef"\)/);
assert.match(lensHtml, /sourceParams\.get\("linkedCaseRef"\)/);
assert.match(lensHtml, /function applyPassthroughParams\(links, targetPage\)/);
assert.match(lensHtml, /link\.setAttribute\("href", queryString \? `\$\{targetPage\}\?\$\{queryString\}` : targetPage\)/);
assert.match(lensHtml, /applyPassthroughParams\(lensStartLinks, "profile\.html"\)/);
assert.match(lensHtml, /applyPassthroughParams\(dimeStartLinks, "dime-entry\.html"\)/);
assert.match(lensHtml, /applyPassthroughParams\(simpleNeedsStartLinks, "simple-needs-entry\.html"\)/);
assert.match(lensHtml, /applyPassthroughParams\(hlvStartLinks, "hlv-entry\.html"\)/);
assert.doesNotMatch(lensHtml, /data-lens-card/);
assert.doesNotMatch(lensHtml, /needs-based result/);
assert.doesNotMatch(lensHtml, /method: "simpleNeeds"/);
assert.doesNotMatch(lensHtml, /runSimpleNeedsAnalysis/);

assert.match(workspaceSideNavSource, /lens: "lens\.html"/);
assert.match(workspaceSideNavSource, /lens: "studio\.html\?view=lens\.html"/);

assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /DIME analysis will appear here/);
assert.doesNotMatch(analysisEstimateHtml, /Income value lens will appear here/);
assert.doesNotMatch(lensHtml, /Existing DIME, LENS, and HLV result comparison remains on the current result page/);
assert.match(lensHtml, /quick methods use their own result pages/);

assert.match(analysisMethodsSource, /method: "dime"/);
assert.match(analysisMethodsSource, /method: "needsAnalysis"/);
assert.match(analysisMethodsSource, /method: "humanLifeValue"/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.match(analysisMethodsSource, /dime: runDimeAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /needsAnalysis: runNeedsAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /humanLifeValue: runHumanLifeValueAnalysis\(lensModel, settings\)/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "pages/analysis-setup.html",
  "workspace-side-nav.js"
]);
assert.deepEqual(protectedChanges, [], "No Step 3, Analysis Setup, model-builder, estimate page, or side-nav files should be changed.");

console.log("lens-start-selection-page-check passed");
