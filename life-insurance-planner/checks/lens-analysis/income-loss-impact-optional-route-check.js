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

function getMainContent(source, relativePath) {
  const match = source.match(/<main\b[\s\S]*?<\/main>/m);
  assert.ok(match, `Expected main content in ${relativePath}.`);
  return match[0];
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
  } catch (_error) {
    return [];
  }
}

const profileHtml = readRepoFile("pages/profile.html");
const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const incomeLossHtml = readRepoFile("pages/income-loss-impact.html");
const incomeLossDisplaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensWorkflowSource = readRepoFile("lens-workflow.js");
const appConfigSource = readRepoFile("app/core/config.js");
const workspaceSideNavSource = readRepoFile("workspace-side-nav.js");

const incomeLossMain = getMainContent(incomeLossHtml, "pages/income-loss-impact.html");

assert.match(
  profileHtml,
  /<form\b[^>]*id="client-profile-form"[^>]*data-next-page="analysis-setup\.html"/,
  "Profile entry should continue to Analysis Setup."
);

assert.match(
  analysisSetupHtml,
  /data-analysis-setup-apply/,
  "Analysis Setup should own the apply/continue action."
);
assert.equal(
  (analysisSetupSource.match(/window\.location\.href\s*=\s*"analysis-estimate\.html"/g) || []).length,
  2,
  "Analysis Setup should intentionally continue directly to analysis-estimate.html in both no-linked-profile and saved-success paths."
);
assert.doesNotMatch(
  analysisSetupSource,
  /window\.location\.href\s*=\s*"income-loss-impact\.html"/,
  "Income Loss Impact should not be the required Analysis Setup continue destination."
);

assert.match(
  incomeLossHtml,
  /<a\b[^>]*href="analysis-estimate\.html"[^>]*>Continue to Estimate Need<\/a>/,
  "Income Loss Impact should link onward to Estimate Need when visited as optional review."
);
assert.match(incomeLossHtml, /<h1>Income Loss Impact<\/h1>/);
assert.match(
  incomeLossHtml,
  /Review how insured income, survivor income, and the support gap flow through the current LENS Analysis model\./
);

assert.doesNotMatch(incomeLossHtml, /<input\b/i, "Income Loss Impact should not contain input controls.");
assert.doesNotMatch(incomeLossHtml, /<select\b/i, "Income Loss Impact should not contain select controls.");
assert.doesNotMatch(incomeLossHtml, /<textarea\b/i, "Income Loss Impact should not contain textarea controls.");
assert.doesNotMatch(incomeLossHtml, /<form\b/i, "Income Loss Impact should not contain forms.");
assert.doesNotMatch(
  incomeLossMain,
  /<button\b[^>]*type=["']submit["']/i,
  "Income Loss Impact main content should not contain submit controls."
);

assert.match(
  incomeLossDisplaySource,
  /function resolveLinkedProfileRecord\(/,
  "Income Loss Impact should resolve an existing linked profile."
);
assert.match(
  incomeLossDisplaySource,
  /getProtectionModelingPayload\(profileRecord\)/,
  "Income Loss Impact should read saved Protection Modeling data."
);
assert.match(
  incomeLossDisplaySource,
  /buildLensModelFromSavedProtectionModeling/,
  "Income Loss Impact should build from the saved LENS model data."
);
assert.match(
  incomeLossDisplaySource,
  /const runNeedsAnalysis = currentLensAnalysis\.analysisMethods\?\.runNeedsAnalysis/,
  "Income Loss Impact should use the internal LENS/needsAnalysis method only for display context."
);
assert.match(
  incomeLossDisplaySource,
  /Read-only view built from the current Lens model and LENS Analysis result\./,
  "Income Loss Impact display copy should classify the page as read-only."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /runAnalysisMethods|runDimeAnalysis|runHumanLifeValueAnalysis|runSimpleNeedsAnalysis/,
  "Income Loss Impact should not run unrelated analysis methods."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Loss Impact should not persist model data, assumptions, or saved profile state."
);

assert.match(
  lensWorkflowSource,
  /\{ id: "income-impact", label: "Income Loss Impact", path: "income-loss-impact\.html" \}/,
  "Legacy workflow progress nav still includes Income Loss Impact as a reachable step."
);
assert.match(
  workspaceSideNavSource,
  /\{ id: "income-impact", label: "Income Loss Impact", path: "income-loss-impact\.html", icon: "analysis" \}/,
  "Workspace side nav still includes Income Loss Impact as a reachable LENS review page."
);
assert.match(
  appConfigSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html" \}[\s\S]*?\{ id: "estimate", label: "Estimate Need", path: "analysis-estimate\.html" \}/,
  "App config should represent the current direct Analysis Setup to Estimate sequence."
);
assert.doesNotMatch(
  appConfigSource,
  /income-loss-impact\.html/,
  "App config should not make Income Loss Impact part of the primary required sequence."
);

assert.match(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.match(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);

const protectedChanges = getChangedFiles([
  "pages/profile.html",
  "pages/analysis-setup.html",
  "app/features/lens-analysis/analysis-setup.js",
  "pages/income-loss-impact.html",
  "app/features/lens-analysis/income-loss-impact-display.js",
  "pages/analysis-estimate.html",
  "lens-workflow.js",
  "app/core/config.js",
  "workspace-side-nav.js",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "This optional-route clarification pass should not change routing, pages, quick flows, methods, model builder, adapter, or Step 3."
);

console.log("income-loss-impact-optional-route-check passed: Income Loss Impact is optional read-only review; Analysis Setup intentionally continues directly to Estimate Need.");
