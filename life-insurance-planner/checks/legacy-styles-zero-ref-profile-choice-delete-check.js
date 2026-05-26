#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listRepoFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules"].includes(entry.name)) {
        return [];
      }
      return listRepoFiles(fullPath);
    }
    return /\.(html|js|css)$/.test(entry.name) ? [fullPath] : [];
  });
}

function assertNoActiveReference(selectorClass) {
  const classPattern = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(selectorClass)}(?![A-Za-z0-9_-])`);
  const offenders = listRepoFiles(repoRoot)
    .filter((filePath) => {
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      return relativePath !== "styles.css"
        && relativePath !== "checks/legacy-styles-zero-ref-profile-choice-delete-check.js";
    })
    .filter((filePath) => classPattern.test(fs.readFileSync(filePath, "utf8")))
    .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/"));

  assert.deepEqual(offenders, [], `${selectorClass} should have no active references outside styles.css.`);
}

const stylesCss = readRepoFile("styles.css");
const deletedSelectors = [
  "prospect-profile-options",
  "prospect-option-panel",
  "prospect-option-button",
  "prospect-option-button-household",
  "prospect-option-button-individual",
  "chart-placeholder"
];

deletedSelectors.forEach((selectorClass) => {
  assert.doesNotMatch(
    stylesCss,
    new RegExp(`\\.${escapeRegex(selectorClass)}(?:[\\s.#:[,{]|$)`),
    `${selectorClass} should be absent from styles.css.`
  );
  assertNoActiveReference(selectorClass);
});

[
  ".client-directory-app-sidebar-toggle",
  ".client-directory-app-sidebar-toggle-glyph",
  ".existing-coverage-page-header",
  ".existing-coverage-summary-card",
  ".confidential-inputs-badge",
  ".floating-calculator",
  "body:not([data-page=\"next-step\"]) .profile-creation-form",
  "body:not([data-page=\"next-step\"]) input:not(.client-table-search-input)",
  "body:not([data-page=\"next-step\"]) select:not(.theme-switcher-select)",
  "textarea:not(.client-activity-textarea)"
].forEach((snippet) => {
  assert.ok(stylesCss.includes(snippet), `Protected legacy selector should remain: ${snippet}`);
});

const guardResult = spawnSync(
  process.execPath,
  [path.join(repoRoot, "checks", "theme-system-hardcoded-color-guard-check.js")],
  { cwd: repoRoot, encoding: "utf8" }
);
assert.equal(
  guardResult.status,
  0,
  `hardcoded color guard should pass.\n${guardResult.stdout}\n${guardResult.stderr}`
);

console.log("legacy-styles-zero-ref-profile-choice-delete-check passed");
