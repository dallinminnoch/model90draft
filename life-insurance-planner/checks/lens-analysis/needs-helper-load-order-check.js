#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const pagesDir = path.join(repoRoot, "pages");

const REQUIRED_NEEDS_HELPERS = [
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/education-funding-projection-calculations.js",
  "app/features/lens-analysis/final-expense-inflation-calculations.js",
  "app/features/lens-analysis/healthcare-expense-inflation-calculations.js"
];
const ANALYSIS_METHODS_SCRIPT = "app/features/lens-analysis/analysis-methods.js";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function normalizeScriptPath(pagePath, scriptSource) {
  const pageDirectory = path.dirname(path.join(repoRoot, pagePath));
  const absolutePath = path.resolve(pageDirectory, scriptSource);
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

function getScriptPaths(pagePath, html) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map((match) => normalizeScriptPath(pagePath, match[1]));
}

function getPagePaths() {
  return fs.readdirSync(pagesDir)
    .filter((fileName) => fileName.endsWith(".html"))
    .map((fileName) => `pages/${fileName}`)
    .sort();
}

function scriptCanCallNeedsAnalysis(scriptPath) {
  const absolutePath = path.join(repoRoot, scriptPath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  return readRepoFile(scriptPath).includes("runNeedsAnalysis");
}

function pageCanCallNeedsAnalysis(pagePath, html, scriptPaths) {
  return html.includes("runNeedsAnalysis") || scriptPaths.some(scriptCanCallNeedsAnalysis);
}

function assertHelpersBeforeMethods(pagePath, scriptPaths) {
  const methodsIndex = scriptPaths.indexOf(ANALYSIS_METHODS_SCRIPT);
  assert.ok(methodsIndex >= 0, `${pagePath} should load analysis-methods.js.`);

  REQUIRED_NEEDS_HELPERS.forEach(function (helperPath) {
    const helperIndex = scriptPaths.indexOf(helperPath);
    assert.ok(helperIndex >= 0, `${pagePath} should load ${helperPath}.`);
    assert.ok(
      helperIndex < methodsIndex,
      `${pagePath} should load ${helperPath} before analysis-methods.js.`
    );
  });
}

const pagesWithMethods = [];
const needsPages = [];
const excludedPages = [];

getPagePaths().forEach(function (pagePath) {
  const html = readRepoFile(pagePath);
  const scriptPaths = getScriptPaths(pagePath, html);
  if (!scriptPaths.includes(ANALYSIS_METHODS_SCRIPT)) {
    return;
  }

  pagesWithMethods.push(pagePath);

  if (pageCanCallNeedsAnalysis(pagePath, html, scriptPaths)) {
    needsPages.push(pagePath);
    assertHelpersBeforeMethods(pagePath, scriptPaths);
    return;
  }

  excludedPages.push({
    pagePath,
    reason: "loads analysis-methods.js but none of its loaded page display scripts call runNeedsAnalysis"
  });
});

assert.ok(
  needsPages.includes("pages/analysis-estimate.html"),
  "analysis-estimate.html should be recognized as a page that calls Needs Analysis."
);
assert.ok(
  needsPages.includes("pages/income-loss-impact.html"),
  "income-loss-impact.html should be recognized as a page that calls Needs Analysis."
);

assert.ok(
  pagesWithMethods.length >= needsPages.length,
  "Needs load-order discovery should inspect every page that loads analysis-methods.js."
);

console.log(
  `Needs helper load-order check passed. Needs pages: ${needsPages.join(", ")}. Excluded pages: ${
    excludedPages.map((entry) => `${entry.pagePath} (${entry.reason})`).join(", ") || "none"
  }.`
);
