#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readPage(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function scriptSources(relativePath) {
  const source = readPage(relativePath);
  const matches = [...source.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*>/gi)];
  return matches.map((match) => match[1]);
}

function scriptIndex(sources, scriptName) {
  return sources.findIndex((source) => source.endsWith(scriptName));
}

function assertLoaded(sources, scriptName, pagePath) {
  const index = scriptIndex(sources, scriptName);
  assert.notEqual(index, -1, `${pagePath} should load ${scriptName}`);
  return index;
}

function assertNotLoaded(sources, scriptName, pagePath) {
  assert.equal(scriptIndex(sources, scriptName), -1, `${pagePath} should not load ${scriptName}`);
}

function assertDebtMetadataBeforeNormalizer(pagePath) {
  const sources = scriptSources(pagePath);
  const taxonomyIndex = assertLoaded(sources, "debt-taxonomy.js", pagePath);
  const libraryIndex = assertLoaded(sources, "debt-library.js", pagePath);
  const normalizerIndex = assertLoaded(sources, "normalize-lens-model.js", pagePath);

  assert.ok(taxonomyIndex < libraryIndex, `${pagePath} should load debt taxonomy before debt library`);
  assert.ok(libraryIndex < normalizerIndex, `${pagePath} should load debt library before normalizer`);
  assertNotLoaded(sources, "pmi-debt-records.js", pagePath);
}

[
  "pages/analysis-estimate.html",
  "pages/income-loss-impact.html",
  "pages/analysis-setup.html"
].forEach(assertDebtMetadataBeforeNormalizer);

[
  "pages/next-step.html",
  "pages/confidential-inputs.html"
].forEach((pagePath) => {
  const sources = scriptSources(pagePath);
  const taxonomyIndex = assertLoaded(sources, "debt-taxonomy.js", pagePath);
  const libraryIndex = assertLoaded(sources, "debt-library.js", pagePath);
  const recordsIndex = assertLoaded(sources, "pmi-debt-records.js", pagePath);
  const normalizerIndex = assertLoaded(sources, "normalize-lens-model.js", pagePath);

  assert.ok(taxonomyIndex < libraryIndex, `${pagePath} should load debt taxonomy before debt library`);
  assert.ok(libraryIndex < recordsIndex, `${pagePath} should load debt library before debt records`);
  assert.ok(recordsIndex < normalizerIndex, `${pagePath} should load debt records before normalizer`);
});

[
  "pages/manual-protection-modeling-inputs.html",
  "pages/analysis-estimate.html",
  "pages/income-loss-impact.html",
  "pages/analysis-setup.html"
].forEach((pagePath) => {
  assertNotLoaded(scriptSources(pagePath), "pmi-debt-records.js", pagePath);
});

console.log("debt-module-load-order-check passed");
