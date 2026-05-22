#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function scriptSources(source) {
  return Array.from(source.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*>/gi)).map((match) => match[1]);
}

function assertLoadsScript(source, scriptName, pagePath) {
  const scripts = scriptSources(source);
  assert.ok(scripts.some((script) => script.endsWith(scriptName)), `${pagePath} should load ${scriptName}.`);
}

function assertScriptOrder(source, firstScriptName, secondScriptName, pagePath) {
  const scripts = scriptSources(source);
  const firstIndex = scripts.findIndex((script) => script.endsWith(firstScriptName));
  const secondIndex = scripts.findIndex((script) => script.endsWith(secondScriptName));
  assert.notEqual(firstIndex, -1, `${pagePath} should load ${firstScriptName}.`);
  assert.notEqual(secondIndex, -1, `${pagePath} should load ${secondScriptName}.`);
  assert.ok(firstIndex < secondIndex, `${pagePath} should load ${firstScriptName} before ${secondScriptName}.`);
}

const pagePath = "pages/next-step.html";
const source = readRepoFile(pagePath);
const workspaceSideNavSource = readRepoFile("workspace-side-nav.js");

assert.match(
  source,
  /<body class="home-page lens-page lens-workflow-page profile-creation-page" data-page="next-step" data-step="protection-modeling-inputs">/,
  "Canonical PMI should use the LENS studio workflow body contract."
);
assert.doesNotMatch(
  source,
  /<body class="home-page prospect-page profile-creation-page" data-page="next-step">/,
  "Canonical PMI should not use the old prospect-only legacy shell body."
);

[
  "workspace-page-topbar",
  "workspace-page-menu",
  "workspace-page-topbar-actions",
  "data-fullscreen-toggle",
  "workspace-side-nav-host",
  'data-workspace-side-nav="lens"',
  "lens-workflow-shell",
  "lens-workflow-stage",
  "lens-workflow-pane workspace-visible-pane"
].forEach((marker) => {
  assert.match(source, new RegExp(marker), `Canonical PMI should include studio shell marker ${marker}.`);
});

assertScriptOrder(source, "workspace-side-nav.js", "site-header.js", pagePath);

[
  "id=\"protection-modeling-form\"",
  "data-pmi-draft-key=\"advisor\"",
  "data-pmi-debt-records-root",
  "data-pmi-expense-cashflow-root",
  "data-pmi-expense-records-root",
  "data-pmi-asset-records-root",
  "data-pmi-existing-coverage-manage",
  "initPmiDebtRecords",
  "initPmiExpenseRecords",
  "initPmiAssetRecords"
].forEach((marker) => {
  assert.match(source, new RegExp(marker), `Canonical PMI should preserve critical PMI marker ${marker}.`);
});

[
  "pmi-debt-records.js",
  "pmi-expense-records.js",
  "pmi-asset-records.js",
  "debt-taxonomy.js",
  "debt-library.js",
  "expense-taxonomy.js",
  "expense-library.js",
  "asset-taxonomy.js",
  "asset-library.js",
  "helpers/housing-support-calculations.js",
  "helpers/income-tax-calculations.js",
  "block-outputs.js",
  "normalize-lens-model.js",
  "pmi-calculator.js"
].forEach((scriptName) => assertLoadsScript(source, scriptName, pagePath));

assert.match(
  workspaceSideNavSource,
  /\{ id: "protection-modeling-inputs", label: "Protection Modeling Inputs", path: "next-step\.html", icon: "modeling-inputs" \}/,
  "Workspace side nav should expose canonical PMI as a LENS workflow destination."
);
assert.match(
  workspaceSideNavSource,
  /id: "profile-1"[\s\S]*id: "protection-modeling-inputs"[\s\S]*id: "analysis-setup"/,
  "Workspace side nav should place canonical PMI between profile linking and analysis setup."
);
assert.doesNotMatch(
  workspaceSideNavSource,
  /label: "Debug Panel", path: "next-step\.html\?lensIncomeDebug=1"/,
  "Workspace side nav should not present canonical PMI as the old debug panel route."
);

console.log("pmi-studio-layout-shell-check passed");
