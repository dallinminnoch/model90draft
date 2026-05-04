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

function countOccurrences(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function getSection(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.ok(startIndex >= 0, `${startNeedle} should exist`);
  const endIndex = endNeedle ? source.indexOf(endNeedle, startIndex + startNeedle.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function getChangedFiles() {
  try {
    return childProcess.execFileSync("git", ["diff", "--name-only"], {
      cwd: repoRoot,
      encoding: "utf8"
    })
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

const html = readRepoFile("pages/analysis-setup.html");
const layoutCss = readRepoFile("layout.css");
const componentsCss = readRepoFile("components.css");

assert.match(html, /<h1 id="analysis-setup-page-title">LENS Analysis Setup<\/h1>/);
assert.match(html, /data-analysis-setup-entry/);
assert.match(html, /Review LENS Assumptions/);
assert.match(html, /data-lens-assumptions-open/);
assert.match(html, /data-lens-result-proceed/);
assert.match(html, /Proceed to LENS Result/);

const entrySection = getSection(html, 'data-analysis-setup-entry', 'data-lens-assumptions-overlay');
assert.match(entrySection, /Review LENS Assumptions/);
assert.match(entrySection, /data-lens-result-proceed/);
assert.match(entrySection, /data-analysis-setup-apply/);
assert.ok(
  html.indexOf("data-analysis-setup-entry") < html.indexOf("data-lens-assumptions-overlay"),
  "entry screen should appear before the hidden assumptions overlay"
);

const overlaySection = getSection(html, 'data-lens-assumptions-overlay', '<script src="../workspace-side-nav.js"></script>');
assert.match(overlaySection, /hidden aria-hidden="true"/);
assert.match(overlaySection, /data-lens-assumptions-dialog/);
assert.match(overlaySection, /role="dialog"/);
assert.match(overlaySection, /data-lens-assumptions-close/);
assert.match(overlaySection, /data-analysis-setup-save/);
assert.match(overlaySection, /data-lens-assumptions-save/);
assert.match(overlaySection, /data-lens-assumptions-save-exit/);
assert.match(overlaySection, /Save &amp; Exit/);
assert.match(overlaySection, /analysis-setup-assumption-panel/);
assert.match(overlaySection, /analysis-setup-view-tabs/);
assert.doesNotMatch(overlaySection, /data-lens-result-proceed/);
assert.doesNotMatch(overlaySection, /Proceed to LENS Result/);

assert.equal(countOccurrences(html, /analysis-setup-assumption-panel/g), 1);
assert.equal(countOccurrences(html, /data-analysis-setup-save/g), 1);
assert.equal(countOccurrences(html, /data-analysis-setup-apply/g), 1);
assert.equal(countOccurrences(html, /data-lens-assumptions-open/g), 1);
assert.equal(countOccurrences(html, /data-lens-result-proceed/g), 1);
assert.equal(countOccurrences(html, /data-lens-assumptions-save(?!-)/g), 1);
assert.equal(countOccurrences(html, /data-lens-assumptions-save-exit/g), 1);
assert.equal(countOccurrences(html, /data-analysis-projected-asset-offset-enabled/g), 1);
assert.equal(countOccurrences(html, /data-analysis-asset-growth-projection-mode/g), 1);
assert.equal(countOccurrences(html, /data-analysis-asset-growth-projection-years/g), 1);
assert.equal(countOccurrences(html, /data-analysis-recommendation-enabled/g), 1);

[
  /data-analysis-inflation-field="enabled"/,
  /data-analysis-method-field="needsIncludeOffsetAssets"/,
  /data-analysis-projected-asset-offset-enabled/,
  /data-analysis-asset-growth-projection-mode/,
  /data-analysis-asset-treatment-table/,
  /data-analysis-coverage-field/,
  /data-analysis-debt-table/,
  /data-analysis-survivor-field/,
  /data-analysis-education-field/,
  /data-analysis-recommendation-field/
].forEach(function (pattern) {
  assert.match(html, pattern);
});

const inlineScripts = Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
  .map(function (match) { return match[1]; })
  .join("\n");
assert.doesNotMatch(inlineScripts, /lens-assumptions|data-lens-assumptions/);

assert.match(layoutCss, /\.analysis-setup-entry-screen/);
assert.match(layoutCss, /\.lens-assumptions-overlay/);
assert.match(layoutCss, /\.lens-assumptions-dialog/);
assert.match(componentsCss, /\.analysis-setup-entry-screen/);
assert.match(componentsCss, /\.lens-assumptions-dialog/);
assert.match(componentsCss, /\.analysis-setup-action\[data-lens-assumptions-save-exit\]/);

const changedFiles = getChangedFiles();
[
  "styles.css",
  "app/features/lens-analysis/analysis-setup.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/projected-asset-offset-calculations.js",
  "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
  "pages/analysis-estimate.html",
  "pages/dime-results.html",
  "pages/hlv-results.html",
  "pages/simple-needs-results.html"
].forEach(function (relativePath) {
  assert.equal(
    changedFiles.includes(relativePath),
    false,
    `${relativePath} should not change in the static entry overlay pass`
  );
});

console.log("Analysis Setup entry overlay static markup checks passed.");
