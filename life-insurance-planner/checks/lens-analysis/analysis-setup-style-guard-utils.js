"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

function resolveGitRoot(cwd) {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8"
  }).trim();
}

function normalizeRepoRelativePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("life-insurance-planner/")) {
    return normalized;
  }
  return `life-insurance-planner/${normalized}`;
}

function getAddedLinesFromDiff(diff) {
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function isAllowedAnalysisSetupStyleFoundationDiff(cwd, filePath) {
  const repoRelativePath = normalizeRepoRelativePath(filePath);
  if (repoRelativePath !== "life-insurance-planner/styles.css") {
    return false;
  }

  const gitRoot = resolveGitRoot(cwd);
  const diff = execFileSync("git", ["diff", "--", repoRelativePath], {
    cwd: gitRoot,
    encoding: "utf8"
  });
  const addedLines = getAddedLinesFromDiff(diff);
  const removedLines = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .map((line) => line.slice(1));

  const allowedAddedLines = new Set([
    "",
    ".analysis-setup-assumption-panel label:not(.analysis-setup-rate-label) {",
    "  color: var(--analysis-setup-control-label-color);",
    "  font-family: var(--analysis-setup-control-label-font-family);",
    "  font-size: var(--analysis-setup-control-label-font-size);",
    "  font-weight: var(--analysis-setup-control-label-font-weight);",
    "  letter-spacing: var(--analysis-setup-control-label-letter-spacing);",
    "  line-height: var(--analysis-setup-control-label-line-height);",
    "}"
  ]);
  const allowedRemovedLines = new Set([
    "",
    "body[data-step=\"analysis-setup\"] .analysis-setup-control-group--education .analysis-setup-education-toggle .settings-toggle-label,",
    "body[data-step=\"analysis-setup\"] .analysis-setup-control-group--education .analysis-setup-education-control-row > label {",
    "  color: #020b1a;",
    "  font-family: \"Inter\", sans-serif;",
    "  font-size: 12.5px;",
    "  font-weight: 500;",
    "  letter-spacing: 0;",
    "  line-height: 1.3;",
    "}"
  ]);

  return addedLines.length > 0
    && addedLines.every((line) => allowedAddedLines.has(line))
    && removedLines.every((line) => allowedRemovedLines.has(line))
    && addedLines.includes(".analysis-setup-assumption-panel label:not(.analysis-setup-rate-label) {");
}

module.exports = {
  isAllowedAnalysisSetupStyleFoundationDiff
};
