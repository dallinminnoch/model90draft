#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const modulePath = path.join(repoRoot, "app", "features", "lens-analysis", "pmi-workflow-menu.js");
const workflowMenu = require(modulePath);
const moduleSource = readRepoFile("app/features/lens-analysis/pmi-workflow-menu.js");
const componentsCss = readRepoFile("components.css");
const nextStepPage = readRepoFile("pages/next-step.html");
const confidentialInputsPage = readRepoFile("pages/confidential-inputs.html");

function getCssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const selectorMatch = new RegExp(`(^|\\n)${escapedSelector}\\s*\\{`).exec(css);
  assert.ok(selectorMatch, `CSS should contain a standalone ${selector} rule.`);
  const openIndex = css.indexOf("{", selectorMatch.index);
  const closeIndex = css.indexOf("}", openIndex);
  assert.ok(openIndex !== -1 && closeIndex !== -1, `CSS rule for ${selector} should be complete.`);
  return css.slice(openIndex + 1, closeIndex);
}

assert.equal(workflowMenu.PMI_WORKFLOW_MENU_VERSION, "pmi-workflow-menu-shell-v1");
assert.equal(typeof workflowMenu.buildPmiWorkflowMenuModel, "function");
assert.equal(typeof workflowMenu.renderPmiWorkflowMenu, "function");
assert.equal(workflowMenu.PMI_WORKFLOW_MENU_SECTIONS.length, 10);
assert.equal(workflowMenu.PMI_WORKFLOW_MENU_GROUPS.length, 2);

const model = workflowMenu.buildPmiWorkflowMenuModel({
  currentSectionKey: "housing",
  sectionStatusByKey: {
    income: "complete",
    housing: "inProgress",
    debts: "needsAttention",
    expenses: "notStarted",
    savingsHabits: "notStarted",
    assets: "notStarted",
    existingCoverage: "notStarted",
    survivorNeeds: "notStarted",
    education: "notStarted",
    finalExpenses: "notStarted"
  }
});

assert.equal(model.diagnosticOnly, true);
assert.equal(model.wiredIntoRuntime, false);
assert.equal(model.currentSectionKey, "housing");
assert.equal(model.progress.totalCount, 10);
assert.equal(model.progress.reviewedCount, 2);
assert.equal(model.insights.needsAttentionCount, 1);
assert.equal(model.insights.notStartedCount, 7);
assert.equal(model.groups[0].label, "Household Foundation");
assert.equal(model.groups[1].label, "Protection Planning");
assert.equal(model.rows.find((row) => row.key === "housing").active, true);

const html = workflowMenu.renderPmiWorkflowMenu({
  currentSectionKey: "housing",
  sectionStatusByKey: {
    income: "complete",
    housing: "inProgress",
    debts: "needsAttention"
  }
});

[
  'data-pmi-workflow-menu-shell',
  'Protection Modeling Inputs',
  'Workflow Progress',
  'Household Foundation',
  'Protection Planning',
  'Workflow Insights',
  'data-pmi-workflow-menu-section="housing"',
  'data-pmi-workflow-menu-status="inProgress"',
  'pmi-workflow-menu-item is-active',
  'pmi-workflow-menu-status--complete',
  'pmi-workflow-menu-status--attention',
  'pmi-workflow-menu-status--empty'
].forEach((snippet) => {
  assert.match(html, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Rendered menu should include ${snippet}.`);
});

[
  "income",
  "housing",
  "debts",
  "expenses",
  "savingsHabits",
  "assets",
  "existingCoverage",
  "survivorNeeds",
  "education",
  "finalExpenses"
].forEach((key) => {
  assert.match(html, new RegExp(`data-pmi-workflow-menu-section="${key}"`), `Rendered menu should include ${key}.`);
});

[
  ".pmi-workflow-menu",
  ".pmi-workflow-menu-header",
  ".pmi-workflow-menu-progress-track",
  ".pmi-workflow-menu-group-title::after",
  ".pmi-workflow-menu-item",
  ".pmi-workflow-menu-item.is-active",
  ".pmi-workflow-menu-number",
  ".pmi-workflow-menu-status--complete",
  ".pmi-workflow-menu-status--attention",
  ".pmi-workflow-menu-status--empty",
  ".pmi-workflow-menu-insights"
].forEach((selector) => {
  assert.match(componentsCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `components.css should style ${selector}.`);
});

[
  "background: var(--m90-surface);",
  "background: var(--m90-surface-secondary);",
  "background: var(--m90-accent-soft);",
  "color: var(--m90-text-primary);",
  "color: var(--m90-text-secondary);",
  "color: var(--m90-text-muted);",
  "border: 1px solid var(--m90-border);",
  "border: 1px solid var(--m90-border-soft);"
].forEach((snippet) => {
  assert.match(componentsCss, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Workflow menu should use theme token snippet ${snippet}.`);
});

const workflowMenuShellRule = getCssRule(componentsCss, ".pmi-workflow-menu");
assert.doesNotMatch(workflowMenuShellRule, /background:\s*#[0-9a-fA-F]{3,6};/, "Workflow menu shell should not use a hardcoded dark card background.");
assert.doesNotMatch(workflowMenuShellRule, /linear-gradient/, "Workflow menu shell should stay white/theme-token based, not a dark gradient.");
assert.match(workflowMenuShellRule, /background:\s*var\(--m90-surface\);/, "Workflow menu shell should use the current theme surface.");

[
  nextStepPage,
  confidentialInputsPage
].forEach((pageSource) => {
  assert.doesNotMatch(pageSource, /pmi-workflow-menu\.js/, "Dormant workflow menu module should not be loaded by PMI pages yet.");
});

assert.match(nextStepPage, /data-pmi-workflow-menu-shell/, "PMI page should visibly mount the workflow menu shell.");
assert.match(nextStepPage, /pmi-workflow-menu-version="pmi-workflow-menu-shell-v1"/, "Mounted workflow menu should carry the shell version.");
assert.match(nextStepPage, /data-pmi-workflow-menu-section="housing"/, "Mounted workflow menu should include the housing section.");
assert.match(nextStepPage, /Add housing record/, "Mounted workflow menu should include the static housing next-up preview.");
assert.doesNotMatch(nextStepPage, /data-pmi-section-nav/, "Old visible scalar section nav should be replaced by the workflow shell.");
assert.doesNotMatch(nextStepPage, /pmi-section-nav-link/, "Old visible section nav links should not remain in the page structure.");
assert.doesNotMatch(confidentialInputsPage, /data-pmi-workflow-menu-shell/, "Confidential inputs page should not mount the PMI workflow shell.");

assert.doesNotMatch(
  moduleSource,
  /querySelector|getElementById|addEventListener|localStorage|sessionStorage/,
  "Dormant workflow menu module should not wire DOM events or storage."
);

console.log("pmi-workflow-menu-shell-check passed");
