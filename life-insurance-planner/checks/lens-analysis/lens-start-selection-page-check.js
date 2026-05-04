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
  /DIME is available as a quick flow\. Simple Needs and Human Life Value are planned as separate quick flows\./
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

[
  {
    key: "Simple Needs",
    block: simpleNeedsCard,
    title: /Simple Needs Analysis/,
    description: /Straightforward current-dollar needs estimate using core planning inputs\./
  },
  {
    key: "Human Life Value",
    block: hlvCard,
    title: /Human Life Value/,
    description: /Fast income-capitalization estimate\./
  }
].forEach(function (card) {
  assert.match(card.block, card.title, `${card.key} title should render.`);
  assert.match(card.block, card.description, `${card.key} description should render.`);
  assert.match(card.block, /Quick flow coming soon/, `${card.key} should be marked as a future quick flow.`);
  assert.match(card.block, /<button\b[^>]*\bdisabled\b/, `${card.key} should use a disabled placeholder action.`);
  assert.deepEqual(getHrefValues(card.block), [], `${card.key} should not link to a missing quick-method page.`);
  assert.doesNotMatch(card.block, /\.html/, `${card.key} should not route to an active result page yet.`);
});

assert.match(lensHtml, /const passthroughParams = \["caseRef", "profileCaseRef", "linkedCaseRef", "id"\]/);
assert.match(lensHtml, /sourceParams\.get\("profileCaseRef"\)/);
assert.match(lensHtml, /sourceParams\.get\("linkedCaseRef"\)/);
assert.match(lensHtml, /function applyPassthroughParams\(links, targetPage\)/);
assert.match(lensHtml, /link\.setAttribute\("href", queryString \? `\$\{targetPage\}\?\$\{queryString\}` : targetPage\)/);
assert.match(lensHtml, /applyPassthroughParams\(lensStartLinks, "profile\.html"\)/);
assert.match(lensHtml, /applyPassthroughParams\(dimeStartLinks, "dime-entry\.html"\)/);
assert.doesNotMatch(lensHtml, /data-lens-card/);
assert.doesNotMatch(lensHtml, /needs-based result/);
assert.doesNotMatch(lensHtml, /method: "simpleNeeds"/);
assert.doesNotMatch(lensHtml, /runSimpleNeedsAnalysis/);

assert.match(workspaceSideNavSource, /lens: "lens\.html"/);
assert.match(workspaceSideNavSource, /lens: "studio\.html\?view=lens\.html"/);

assert.match(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);

assert.match(analysisMethodsSource, /method: "dime"/);
assert.match(analysisMethodsSource, /method: "needsAnalysis"/);
assert.match(analysisMethodsSource, /method: "humanLifeValue"/);
assert.match(analysisMethodsSource, /dime: runDimeAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /needsAnalysis: runNeedsAnalysis\(lensModel, settings\)/);
assert.match(analysisMethodsSource, /humanLifeValue: runHumanLifeValueAnalysis\(lensModel, settings\)/);
assert.doesNotMatch(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /runSimpleNeedsAnalysis/);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "pages/analysis-estimate.html",
  "pages/analysis-setup.html",
  "workspace-side-nav.js"
]);
assert.deepEqual(protectedChanges, [], "No method, Step 3, Analysis Setup, model-builder, estimate page, or side-nav files should be changed.");

console.log("lens-start-selection-page-check passed");
