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
const lensHtml = readRepoFile("pages/lens.html");
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
  lensHtml,
  /The primary LENS path runs from linked profile entry to Analysis Setup, Income Impact Review, and then the LENS Result page\./,
  "Selector copy should describe the active Income Impact Review route."
);
assert.match(
  lensHtml,
  /DIME, Simple Needs, and Human Life Value remain standalone quick flows\./,
  "Selector copy should keep quick flows independent."
);
assert.doesNotMatch(
  lensHtml,
  /Income Loss Impact remains available as optional read-only review, not a required step\./,
  "Selector copy should no longer classify Income Loss Impact as optional."
);

assert.match(
  analysisSetupHtml,
  /data-analysis-setup-apply/,
  "Analysis Setup should own the apply/continue action."
);
assert.match(
  analysisSetupHtml,
  /Continue to Income Impact/,
  "Analysis Setup proceed copy should target Income Impact."
);
assert.equal(
  (analysisSetupSource.match(/window\.location\.href = getRouteWithCurrentQuery\(INCOME_LOSS_IMPACT_ROUTE\)/g) || []).length,
  2,
  "Analysis Setup should continue to Income Loss Impact in both no-linked-profile and saved-success paths."
);
assert.match(
  analysisSetupSource,
  /const INCOME_LOSS_IMPACT_ROUTE = "income-loss-impact\.html"/,
  "Analysis Setup should centralize the active Income Impact destination."
);
assert.match(
  analysisSetupSource,
  /function getRouteWithCurrentQuery\(path\)/,
  "Analysis Setup should preserve current query params when routing to Income Impact."
);
assert.doesNotMatch(
  analysisSetupSource,
  /window\.location\.href\s*=\s*"analysis-estimate\.html"/,
  "Analysis Setup should no longer continue directly to analysis-estimate.html."
);

assert.match(incomeLossHtml, /<body[^>]*data-step='income-impact'/);
assert.match(incomeLossHtml, /<h1>Income Loss Impact<\/h1>/);
assert.match(incomeLossHtml, /Step 3: Income Impact Review/);
assert.match(
  incomeLossHtml,
  /This preview uses linked profile and Protection Modeling facts to show what household finances may look like if death occurs at the selected age\/date\./
);
assert.match(
  incomeLossHtml,
  /It does not change the LENS recommendation\./
);
assert.match(
  incomeLossHtml,
  /<a\b[^>]*href="analysis-setup\.html"[^>]*data-income-impact-route-link[^>]*>Back to Assumptions<\/a>/,
  "Income Impact should link back to assumptions."
);
assert.match(
  incomeLossHtml,
  /<a\b[^>]*href="analysis-estimate\.html"[^>]*data-income-impact-route-link[^>]*>Continue to LENS Result<\/a>/,
  "Income Impact should link onward to the LENS result."
);
assert.doesNotMatch(incomeLossHtml, /Continue to Estimate Need/);
assert.doesNotMatch(incomeLossHtml, /Optional Review/);
assert.doesNotMatch(incomeLossHtml, /<input\b/i, "Income Loss Impact should not contain input controls in this pass.");
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
  "Income Loss Impact should build from saved LENS model data for compatibility."
);
assert.match(
  incomeLossDisplaySource,
  /const runNeedsAnalysis = currentLensAnalysis\.analysisMethods\?\.runNeedsAnalysis/,
  "Current Income Impact display still has a temporary runNeedsAnalysis dependency."
);
assert.match(
  incomeLossDisplaySource,
  /Temporary compatibility/,
  "Income Impact copy should explicitly label the runNeedsAnalysis display dependency as temporary."
);
assert.match(
  incomeLossDisplaySource,
  /fact-based timeline helper replaces this display/,
  "Income Impact copy should point to the future fact-based display owner."
);
assert.match(
  incomeLossDisplaySource,
  /Read-only fact preview from linked profile and Protection Modeling data\./,
  "Income Impact display copy should classify the page as fact-based and read-only."
);
assert.match(
  incomeLossDisplaySource,
  /It does not save assumptions or change the LENS recommendation\./,
  "Income Impact display copy should be output-neutral."
);
assert.match(
  incomeLossDisplaySource,
  /Placeholder-only timeline\. Not final functionality\./,
  "Placeholder timeline should not be presented as final functionality."
);
assert.match(
  incomeLossDisplaySource,
  /function syncIncomeImpactWorkflowLinks\(\)/,
  "Income Impact should preserve current query params on Back and Continue links."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Loss Impact should not persist model data, assumptions, slider state, or saved profile state."
);

assert.match(
  lensWorkflowSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html" \}[\s\S]*?\{ id: "income-impact", label: "Income Impact Review", path: "income-loss-impact\.html" \}[\s\S]*?\{ id: "estimate", label: "LENS Result", path: "analysis-estimate\.html" \}/,
  "Workflow progress should include Income Impact Review between Analysis Setup and LENS Result."
);
assert.match(
  workspaceSideNavSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html", icon: "financial-snapshot" \}[\s\S]*?\{ id: "income-impact", label: "Income Impact Review", path: "income-loss-impact\.html", icon: "analysis" \}[\s\S]*?\{ id: "estimate", label: "LENS Result", path: "analysis-estimate\.html", icon: "needs-analysis" \}/,
  "Workspace side nav should expose Income Impact Review as an active LENS workflow step."
);
assert.match(
  appConfigSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html" \}[\s\S]*?\{ id: "income-impact", label: "Income Impact Review", path: "income-loss-impact\.html" \}[\s\S]*?\{ id: "estimate", label: "LENS Result", path: "analysis-estimate\.html" \}/,
  "App config should include Income Impact Review in the primary LENS sequence."
);
assert.doesNotMatch(appConfigSource, /analysis-detail\.html/);
assert.doesNotMatch(lensWorkflowSource, /analysis-detail\.html/);
assert.doesNotMatch(
  workspaceSideNavSource,
  /\{ id: "detail", label: "Detailed Analysis", path: "analysis-detail\.html"/,
  "Workspace side nav should not expose Detailed Analysis as an active LENS workflow destination."
);

assert.match(analysisEstimateHtml, /<title>LENS Result \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(analysisEstimateHtml, /Step 4: LENS Result/);
assert.match(
  analysisEstimateHtml,
  /Review the final LENS result from the linked profile, Analysis Setup assumptions, and Income Impact Review before moving into recommendation design\./
);
assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /DIME analysis will appear here/);
assert.doesNotMatch(analysisEstimateHtml, /Income value lens will appear here/);

const protectedChanges = getChangedFiles([
  "pages/profile.html",
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
  "Income Impact active-route pass should not change profile routing, quick flows, methods, model builder, adapter, or Step 3 rendering."
);

console.log("income-loss-impact-optional-route-check passed: Income Loss Impact is active read-only workflow review between Analysis Setup and LENS Result.");
