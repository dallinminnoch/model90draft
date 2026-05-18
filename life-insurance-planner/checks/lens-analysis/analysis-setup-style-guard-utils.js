"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
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

function isAllowedAnalysisSetupEducationDescriptionRemovalDiff(cwd, filePath) {
  const repoRelativePath = normalizeRepoRelativePath(filePath);
  if (repoRelativePath !== "life-insurance-planner/pages/analysis-setup.html") {
    return false;
  }

  const gitRoot = resolveGitRoot(cwd);
  const diff = execFileSync("git", ["diff", "--", repoRelativePath], {
    cwd: gitRoot,
    encoding: "utf8"
  });
  const removedCopy = [
    "<p>Current LENS uses saved education funding. Education inflation and start age can affect current dependents with valid birthdates; target adjustments are saved for future modeling. Education-specific savings are handled in Asset Treatment.</p>",
    "<span class=\"settings-toggle-note\">Controls whether LENS includes education funding. When off, LENS education is $0.</span>",
    "<p>Saved for future target adjustments; current LENS uses saved education amounts.</p>",
    "<span class=\"settings-toggle-note\">Planned-dependent targets may be included as current-dollar amounts; timing and inflation are not applied yet.</span>",
    "<span class=\"settings-toggle-note\">Applies in LENS to current dependents with valid birthdates; planned dependents remain current-dollar.</span>",
    "<p>Used to project education funding for current dependents with valid birthdates. Planned dependents remain current-dollar until timing is added.</p>",
    "<p class=\"analysis-setup-education-preview-note\">Preview only for saved source values. Current LENS may use education funding, projected dependents, inflation, and start-age settings; DIME, HLV, and recommendation results are unchanged.</p>"
  ];
  const removedLines = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .map((line) => line.slice(1).trim());
  const html = fs.readFileSync(path.join(gitRoot, repoRelativePath), "utf8");
  return removedCopy.every((copy) => removedLines.includes(copy) && !html.includes(copy))
    && diff.includes("data-analysis-education-field=\"fundingTreatment.includeEducationFunding\"")
    && diff.includes("data-analysis-education-field=\"fundingTreatment.fundingTargetPercent\"")
    && diff.includes("data-analysis-education-field=\"fundingTreatment.includeProjectedDependents\"")
    && diff.includes("data-analysis-education-field=\"fundingTreatment.applyEducationInflation\"")
    && diff.includes("data-analysis-education-field=\"fundingTreatment.educationStartAge\"");
}

function isAllowedAnalysisSetupEducationControlAlignmentCssDiff(cwd, filePath) {
  const repoRelativePath = normalizeRepoRelativePath(filePath);
  if (repoRelativePath !== "life-insurance-planner/components.css") {
    return false;
  }

  const gitRoot = resolveGitRoot(cwd);
  const diff = execFileSync("git", ["diff", "--", repoRelativePath], {
    cwd: gitRoot,
    encoding: "utf8"
  });
  const addedLines = getAddedLinesFromDiff(diff);
  const allowedAddedLines = new Set([
    "",
    "  --analysis-setup-education-control-rail-width: 6.8rem;",
    "  display: grid;",
    "  grid-template-columns: minmax(13rem, 1fr) var(--analysis-setup-education-control-rail-width);",
    "  align-items: center;",
    "  gap: 0.24rem 0.72rem;",
    ".analysis-setup-education-toggle .settings-toggle-copy {",
    "  grid-column: 1;",
    "}",
    ".analysis-setup-education-toggle .settings-switch {",
    "  grid-column: 2;",
    "  justify-self: end;",
    ".analysis-setup-education-card .settings-toggle-row + .settings-toggle-row {",
    "  border-top: 0;",
    "  justify-content: flex-end;",
    "  min-width: 0;",
    "  width: var(--analysis-setup-education-control-rail-width);",
    ".analysis-setup-education-control-row .analysis-setup-asset-percent {"
  ]);
  return addedLines.length > 0
    && addedLines.every((line) => allowedAddedLines.has(line))
    && addedLines.includes("  --analysis-setup-education-control-rail-width: 6.8rem;")
    && addedLines.includes(".analysis-setup-education-toggle .settings-switch {")
    && addedLines.includes(".analysis-setup-education-control-row .analysis-setup-asset-percent {");
}

module.exports = {
  isAllowedAnalysisSetupEducationControlAlignmentCssDiff,
  isAllowedAnalysisSetupEducationDescriptionRemovalDiff,
  isAllowedAnalysisSetupStyleFoundationDiff
};
