#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function repoFileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function scriptSources(source) {
  return Array.from(source.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*>/gi)).map((match) => match[1]);
}

function assertLoadsScript(source, scriptName, pagePath) {
  const scripts = scriptSources(source);
  assert.ok(scripts.some((script) => script.endsWith(scriptName)), `${pagePath} should load ${scriptName}.`);
}

function assertDoesNotLinkToLegacyPmi(source, pagePath) {
  [
    "manual-protection-modeling-inputs.html",
    "protection-modeling-advisor.html",
    "protection-modeling-confidential.html"
  ].forEach((legacyPath) => {
    assert.doesNotMatch(
      source,
      new RegExp(`href="${legacyPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${pagePath} should not route active PMI navigation to ${legacyPath}.`
    );
  });
}

const profileSource = readRepoFile("pages/profile.html");
assert.match(
  profileSource,
  /<a class="lens-manual-widget-option" href="next-step\.html" data-loading-link>Protection Modeling Inputs<\/a>/,
  "Profile manual workflow should route Protection Modeling Inputs to the canonical next-step.html page."
);
assert.doesNotMatch(
  profileSource,
  /href="manual-protection-modeling-inputs\.html"[^>]*>Protection Modeling Inputs<\/a>/,
  "Profile should not route Protection Modeling Inputs to the legacy manual PMI page."
);
assertDoesNotLinkToLegacyPmi(profileSource, "pages/profile.html");

const linkedSource = readRepoFile("pages/protection-modeling-linked.html");
assert.match(linkedSource, /href="next-step\.html" data-loading-link>Advisor Assisted<\/a>/);
assert.match(linkedSource, /advisorContinue\.href = `next-step\.html\?caseRef=/);
assert.match(linkedSource, /href="confidential-inputs\.html" data-loading-link data-confidential-continue/);
assert.match(linkedSource, /confidentialContinue\.href = `confidential-inputs\.html\?caseRef=/);
assert.doesNotMatch(linkedSource, /manual-protection-modeling-inputs\.html/);
assert.doesNotMatch(linkedSource, /protection-modeling-advisor\.html/);
assert.doesNotMatch(linkedSource, /protection-modeling-confidential\.html/);

[
  "pages/protection-modeling-advisor.html",
  "pages/protection-modeling-confidential.html"
].forEach((relativePath) => {
  assert.equal(repoFileExists(relativePath), false, `${relativePath} should remain deleted as an orphaned legacy PMI page.`);
});

assert.equal(
  repoFileExists("pages/manual-protection-modeling-inputs.html"),
  true,
  "Manual PMI retirement is deferred; this pass should not delete the manual session-only page."
);
assert.equal(
  repoFileExists("pages/confidential-inputs.html"),
  true,
  "Confidential PMI remains an active duplicate route until confidential-mode consolidation."
);

[
  ["app.js", readRepoFile("app.js")],
  ["site-header.js", readRepoFile("site-header.js")]
].forEach(([relativePath, source]) => {
  assert.match(source, /"next-step\.html"/, `${relativePath} should treat the canonical PMI page as an active analysis destination.`);
  assert.doesNotMatch(
    source,
    /"manual-protection-modeling-inputs\.html"/,
    `${relativePath} should not keep the legacy manual PMI page in active analysis destination lists.`
  );
});

const canonicalSource = readRepoFile("pages/next-step.html");
[
  "data-pmi-debt-records-root",
  "data-pmi-expense-cashflow-root",
  "data-pmi-expense-records-root",
  "data-pmi-scalar-expenses-notebook",
  "initPmiExpenseRecords",
  "initPmiDebtRecords"
].forEach((marker) => {
  assert.match(canonicalSource, new RegExp(marker), `Canonical next-step.html should include ${marker}.`);
});
[
  "debt-taxonomy.js",
  "debt-library.js",
  "pmi-debt-records.js",
  "expense-taxonomy.js",
  "expense-library.js",
  "pmi-expense-records.js",
  "block-outputs.js",
  "normalize-lens-model.js",
  "pmi-calculator.js"
].forEach((scriptName) => assertLoadsScript(canonicalSource, scriptName, "pages/next-step.html"));

const confidentialSource = readRepoFile("pages/confidential-inputs.html");
assert.match(confidentialSource, /data-pmi-expense-records-root/);
assertLoadsScript(confidentialSource, "pmi-expense-records.js", "pages/confidential-inputs.html");

const normalizationPlanSource = readRepoFile("app/features/lens-analysis/normalization-plan.js");
assert.match(normalizationPlanSource, /Canonical current PMI source/);
assert.match(normalizationPlanSource, /Advisor input defaults to pages\/next-step\.html/);
assert.match(normalizationPlanSource, /Deleted older parallel PMI pages/);
assert.match(normalizationPlanSource, /Legacy manual session-only Lens page\. Not the default Protection Modeling Inputs route\./);

console.log("pmi-canonical-page-route-check passed");
