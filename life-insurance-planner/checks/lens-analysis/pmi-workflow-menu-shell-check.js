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
const checkIconPath = path.join(repoRoot, "Images", "home", "check.svg");
const checkIconSource = readRepoFile("Images/home/check.svg");

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
assert.equal(typeof workflowMenu.setActivePmiWorkflowMenuSection, "function");
assert.equal(typeof workflowMenu.mountPmiWorkflowMenuScrollSpy, "function");
assert.equal(typeof workflowMenu.readPmiWorkflowMenuAttestationStatuses, "function");
assert.equal(typeof workflowMenu.syncPmiWorkflowMenuAttestationStatuses, "function");
assert.equal(typeof workflowMenu.mountPmiWorkflowMenuAttestationStatus, "function");
assert.equal(workflowMenu.PMI_WORKFLOW_MENU_SECTIONS.length, 10);
assert.equal(workflowMenu.PMI_WORKFLOW_MENU_GROUPS.length, 2);
assert.equal(fs.existsSync(checkIconPath), true, "Workflow complete status should use the Images/home/check.svg asset.");
assert.match(checkIconSource, /viewBox="0 0 24 24"/, "Workflow check icon should use a clean 24px icon viewbox.");
assert.match(checkIconSource, /stroke-width="4\.2"/, "Workflow check icon should use a clean heavier stroked checkmark.");
assert.match(checkIconSource, /stroke-linecap="round"/, "Workflow check icon should keep rounded stroke caps.");
assert.doesNotMatch(checkIconSource, /<path[^>]*fill="#ffffff"/, "Workflow check icon should not layer a filled check under the stroke.");

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
assert.equal(model.wiredIntoRuntime, true);
assert.equal(model.currentSectionKey, "housing");
assert.equal(model.progress.totalCount, 10);
assert.equal(model.progress.reviewedCount, 2);
assert.equal(model.insights.completedCount, 1);
assert.equal(model.insights.remainingCount, 8);
assert.equal(model.insights.reviewCount, 1);
assert.equal(model.groups[0].label, "Household Foundation");
assert.equal(model.groups[1].label, "Protection Planning");
assert.equal(model.groups[1].showTitle, false);
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
  'Workflow Progress',
  'Household Foundation',
  'Workflow Insights',
  'Sections completed',
  '1 section completed',
  'Sections remaining',
  '8 sections remaining',
  'Sections marked for review',
  '1 section marked for review',
  'pmi-workflow-menu-active-label">In progress',
  'data-pmi-workflow-menu-section="housing"',
  'data-pmi-workflow-menu-status="inProgress"',
  'pmi-workflow-menu-item is-active',
  'pmi-workflow-menu-status--complete',
  'Images/home/check.svg',
  'pmi-workflow-menu-check-icon',
  'data-pmi-workflow-menu-status-icon',
  'data-pmi-workflow-menu-insight="completed"',
  'pmi-workflow-menu-status--attention',
  'pmi-workflow-menu-status--empty',
  'pmi-workflow-menu-insight-icon--complete'
].forEach((snippet) => {
  assert.match(html, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Rendered menu should include ${snippet}.`);
});

[
  'pmi-workflow-menu-kicker',
  '>Protection Modeling Inputs</',
  "Next up",
  "Add housing record",
  "Needs attention</small>",
  "Not started</small>"
].forEach((snippet) => {
  assert.doesNotMatch(html, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Rendered workflow insights should not include old insight copy ${snippet}.`);
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
  ".pmi-workflow-menu-check-icon",
  ".pmi-workflow-menu-insight-icon--complete",
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
assert.match(workflowMenuShellRule, /height:\s*calc\(100dvh - var\(--pmi-rail-sticky-top\) - 1\.85rem\);/, "Workflow menu shell should use the same viewport-height sizing increment as the cash-flow rail.");
assert.match(workflowMenuShellRule, /max-height:\s*calc\(100dvh - var\(--pmi-rail-sticky-top\) - 1\.85rem\);/, "Workflow menu shell should cap itself with the same viewport-height sizing increment as the cash-flow rail.");
assert.match(workflowMenuShellRule, /overflow:\s*hidden;/, "Workflow menu shell should contain its autosized rail content.");

const workflowMenuItemRule = getCssRule(componentsCss, ".pmi-workflow-menu-item");
assert.match(workflowMenuItemRule, /min-height:\s*clamp\(2\.12rem,\s*4\.35dvh,\s*3\.3rem\);/, "Workflow menu rows should autosize to fit shorter screens.");
assert.match(workflowMenuItemRule, /padding:\s*clamp\(0\.32rem,\s*0\.68dvh,\s*0\.62rem\)/, "Workflow menu row padding should autosize to fit shorter screens.");
assert.match(
  componentsCss,
  /\.pmi-workflow-menu-status--attention::before,\s*\.pmi-workflow-menu-insight-icon--attention::before\s*{[\s\S]*top:\s*17%;[\s\S]*width:\s*0\.34em;[\s\S]*height:\s*0\.66em;[\s\S]*C15\.7 1\.7 18\.9 4\.1 21 7\.2/,
  "Workflow attention exclamation should draw a clean larger tapered stem with a larger top head."
);
assert.match(
  componentsCss,
  /\.pmi-workflow-menu-status--attention::after,\s*\.pmi-workflow-menu-insight-icon--attention::after\s*{[\s\S]*bottom:\s*22%;[\s\S]*width:\s*0\.24em;[\s\S]*height:\s*0\.24em;/,
  "Workflow attention exclamation should draw a separate clean rounded dot."
);
assert.match(
  componentsCss,
  /\.pmi-workflow-menu-group\[data-pmi-workflow-menu-group="protectionPlanning"\]\s*{[\s\S]*margin-top:\s*calc\(clamp\(0\.18rem,\s*0\.38dvh,\s*0\.34rem\) - clamp\(0\.52rem,\s*0\.9dvh,\s*1rem\)\);/,
  "Protection planning group should collapse the parent menu gap left by the removed divider."
);
assert.match(
  componentsCss,
  /@media \(min-width:\s*1181px\) and \(max-height:\s*700px\)\s*{[\s\S]*\.pmi-workflow-menu-description\s*{[\s\S]*display:\s*none;/,
  "Workflow menu should use an additional short-height increment so it fits the cash-flow-sized rail."
);

assert.match(nextStepPage, /data-pmi-workflow-menu-shell/, "PMI page should visibly mount the workflow menu shell.");
assert.match(nextStepPage, /pmi-workflow-menu-version="pmi-workflow-menu-shell-v1"/, "Mounted workflow menu should carry the shell version.");
assert.match(nextStepPage, /app\/features\/lens-analysis\/pmi-workflow-menu\.js/, "Mounted workflow menu module should load on the visible PMI page.");
assert.match(nextStepPage, /mountPmiWorkflowMenuScrollSpy/, "Visible PMI page should mount workflow menu scroll highlighting.");
assert.match(nextStepPage, /mountPmiWorkflowMenuAttestationStatus/, "Visible PMI page should mount workflow menu attestation status syncing.");
assert.match(nextStepPage, /data-pmi-workflow-menu-section="housing"/, "Mounted workflow menu should include the housing section.");
assert.match(nextStepPage, /Images\/home\/check\.svg/, "Mounted workflow menu should use the Images/home/check.svg asset for completed section checks.");
assert.match(nextStepPage, /data-pmi-workflow-menu-status-icon/, "Mounted workflow menu status marks should expose the runtime status hook.");
assert.match(nextStepPage, /data-pmi-workflow-menu-insight="completed"/, "Mounted workflow insights should expose status-count hooks.");
[
  "Sections completed",
  "6 sections completed",
  "Sections remaining",
  "4 sections remaining",
  "Sections marked for review",
  "2 sections marked for review"
].forEach((snippet) => {
  assert.match(nextStepPage, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Mounted workflow insights should include ${snippet}.`);
});
[
  'pmi-workflow-menu-kicker',
  '>Protection Modeling Inputs</',
  "Next up",
  "Add housing record",
  "Needs attention</small>",
  "Not started</small>"
].forEach((snippet) => {
  assert.doesNotMatch(nextStepPage, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Mounted workflow insights should not include old insight copy ${snippet}.`);
});
assert.doesNotMatch(nextStepPage, />Protection Planning</, "Mounted workflow menu should not render the Protection Planning divider.");
assert.doesNotMatch(html, />Protection Planning</, "Rendered workflow menu should not render the Protection Planning divider.");
assert.doesNotMatch(nextStepPage, /data-pmi-section-nav/, "Old visible scalar section nav should be replaced by the workflow shell.");
assert.doesNotMatch(nextStepPage, /pmi-section-nav-link/, "Old visible section nav links should not remain in the page structure.");
assert.doesNotMatch(confidentialInputsPage, /data-pmi-workflow-menu-shell/, "Confidential inputs page should not mount the PMI workflow shell.");
assert.doesNotMatch(confidentialInputsPage, /pmi-workflow-menu\.js/, "Confidential inputs page should not load the PMI workflow menu module.");

assert.match(moduleSource, /function mountPmiWorkflowMenuScrollSpy/, "Workflow menu module should own the runtime scroll-spy mount.");
assert.match(moduleSource, /\.lens-workflow-pane/, "Workflow menu scroll-spy should observe the PMI pane scroll root.");
assert.match(moduleSource, /scrollHeight - scrollRoot\.clientHeight - scrollRoot\.scrollTop <= 4/, "Workflow menu scroll-spy should treat the last section as active at the bottom of the PMI pane.");
assert.match(moduleSource, /requestAnimationFrame/, "Workflow menu scroll-spy should throttle scroll updates.");
assert.match(moduleSource, /addEventListener\("scroll"/, "Workflow menu module should listen for scroll changes.");
assert.match(moduleSource, /setActivePmiWorkflowMenuSection/, "Workflow menu module should expose active-section updates.");
assert.match(moduleSource, /PMI_WORKFLOW_MENU_ATTESTATION_FIELD_BY_SECTION/, "Workflow menu module should map section keys to attestation radio groups.");
assert.match(moduleSource, /mountPmiWorkflowMenuAttestationStatus/, "Workflow menu module should own attestation status syncing.");
assert.match(moduleSource, /addEventListener\("change"/, "Workflow menu attestation sync should listen for attestation changes.");
assert.match(moduleSource, /Images\/home\/check\.svg/, "Workflow menu module should render the requested check icon asset.");
assert.doesNotMatch(moduleSource, /localStorage|sessionStorage/, "Workflow menu scroll-spy should not read or write browser storage.");
assert.doesNotMatch(moduleSource, /calculate|normalizeLensModel|coverageStrategy|incomeImpact|graph/i, "Workflow menu scroll-spy should not couple to calculations or output graphs.");

console.log("pmi-workflow-menu-shell-check passed");
