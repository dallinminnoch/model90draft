#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const pageSource = readRepoFile("pages/next-step.html");
const componentsCss = readRepoFile("components.css");
const stylesCss = readRepoFile("styles.css");

[
  "data-pmi-form-layout",
  "data-pmi-section-nav",
  "data-pmi-cashflow-rail",
  "data-pmi-expense-cashflow-root",
  "pmi-form-main"
].forEach((marker) => {
  assert.match(pageSource, new RegExp(marker), `Canonical PMI page should include ${marker}.`);
});

[
  ["#pmi-income", "Income"],
  ["#pmi-housing", "Housing"],
  ["#pmi-debts", "Debts"],
  ["#pmi-expenses", "Expenses"],
  ["#pmi-assets", "Assets"],
  ["#pmi-coverage", "Existing Coverage"],
  ["#pmi-survivor", "Survivor Needs"],
  ["#pmi-education", "Education"],
  ["#pmi-final", "Final Expenses"]
].forEach(([href, label]) => {
  assert.match(pageSource, new RegExp(`href="${href.replace("#", "\\#")}"[\\s\\S]*>${label}`), `PMI side navigation should include ${label}.`);
});

[
  "pmi-income",
  "pmi-housing",
  "pmi-debts",
  "pmi-expenses",
  "pmi-assets",
  "pmi-coverage",
  "pmi-survivor",
  "pmi-education",
  "pmi-final"
].forEach((id) => {
  assert.match(pageSource, new RegExp(`id="${id}"`), `PMI page should expose #${id} section anchor.`);
});

const expensesCardIndex = pageSource.indexOf('<section class="profile-form-section" id="pmi-expenses">');
const ongoingSupportGroupIndex = pageSource.indexOf("<h2>Ongoing Support</h2>");
const assetsCardIndex = pageSource.indexOf('id="pmi-assets"');
assert.ok(expensesCardIndex !== -1, "Expenses and Lifestyle should render as its own top-level PMI card.");
assert.ok(ongoingSupportGroupIndex > expensesCardIndex, "Ongoing Support should start after the standalone Expenses and Lifestyle card.");
assert.ok(assetsCardIndex > ongoingSupportGroupIndex, "Assets should remain inside the Ongoing Support group after the group heading.");
assert.doesNotMatch(
  pageSource,
  /<section class="profile-form-section profile-form-subsection" id="pmi-expenses">/,
  "Expenses and Lifestyle should not remain nested as an Ongoing Support subsection."
);

const formStartIndex = pageSource.indexOf('id="protection-modeling-form"');
const formEndIndex = pageSource.indexOf("</form>", formStartIndex);
const cashFlowRootIndex = pageSource.indexOf("data-pmi-expense-cashflow-root");
assert.ok(formStartIndex !== -1 && formEndIndex !== -1, "Canonical PMI form should remain present.");
assert.ok(cashFlowRootIndex > formEndIndex, "Cash-flow widget should live in the right rail outside the PMI form.");
assert.match(pageSource, /cashFlowRoot: document\.querySelector\("\[data-pmi-expense-cashflow-root\]"\)/);
assert.match(pageSource, /pageRoot: form/);
assert.match(pageSource, /family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&family=Plus\+Jakarta\+Sans/);
assert.match(pageSource, /workspace-page-topbar/, "Canonical PMI page should keep the app navigation shell.");
assert.match(pageSource, /data-workspace-side-nav="lens"/, "Canonical PMI page should keep the LENS side navigation shell.");
assert.doesNotMatch(pageSource, /class="prospect-return-button"[\s\S]*>Previous</, "PMI form header should not keep the old Previous button.");
assert.doesNotMatch(pageSource, /<h1>Protection Modeling Inputs<\/h1>/, "PMI form header should not keep the old page title.");
assert.match(pageSource, /data-pmi-file-header/);
assert.match(pageSource, /Household Income &amp; Tax Profile/);
assert.match(pageSource, /Gross income, filing status, deductions, and net take-home/);
assert.match(pageSource, /data-pmi-linked-person-name/);
assert.match(pageSource, /data-pmi-linked-case-ref/);
assert.match(pageSource, /data-pmi-linked-household/);
assert.match(pageSource, /data-pmi-linked-date-of-birth/);
assert.doesNotMatch(pageSource, /<span class="pmi-file-label">/, "PMI banner should not render field titles.");
assert.match(pageSource, /function getLinkedPersonDisplayName\(\)/);
assert.match(pageSource, /syncLinkedPersonNameBadge\(\)/);
assert.match(pageSource, /normalizedName = displayName\.toUpperCase\(\)/);
assert.match(pageSource, /lastName, firstName, middleName/, "Linked name should render last name first when profile fields are available.");
assert.doesNotMatch(pageSource, /pmi-linked-person-letter/, "PMI banner name should render as plain text, not per-letter boxes.");
assert.match(pageSource, /pmi-reference-divider--deductions/);
assert.match(pageSource, /pmi-reference-divider--tax/);
assert.match(pageSource, /pmi-reference-notice/);
assert.match(componentsCss, /\.pmi-file-header\s*{[\s\S]*font-family:\s*"DM Mono", "Consolas", monospace;/, "PMI banner should use the same form-entry font as the marital status field value.");
assert.match(componentsCss, /\.pmi-file-value\s*{[\s\S]*border:\s*0;/, "PMI banner value text should not render boxed fields.");
assert.match(componentsCss, /\.pmi-file-value\s*{[\s\S]*background:\s*transparent;/, "PMI banner value text should not render boxed fields.");
assert.match(componentsCss, /\.pmi-file-value\s*{[\s\S]*font-size:\s*0\.82rem;/, "PMI banner value text should be compact.");
assert.match(componentsCss, /\.pmi-file-value\s*{[\s\S]*font-weight:\s*500;/, "PMI banner value text should match the boxed name letter weight.");
assert.match(componentsCss, /\.pmi-linked-person-badge\s*{[\s\S]*font-size:\s*0\.82rem;/, "PMI banner name should match the compact banner value text.");
assert.match(componentsCss, /body\[data-page="next-step"\] \.lens-workflow-pane\s*{[\s\S]*padding:\s*0;/, "PMI scroll pane should not leave a gutter around the sticky banner.");
assert.match(componentsCss, /body\[data-page="next-step"\] \.prospect-panel-header\s*{[\s\S]*position:\s*sticky;/, "PMI banner should remain visible while the page scrolls.");
assert.match(componentsCss, /body\[data-page="next-step"\] \.prospect-panel-header\s*{[\s\S]*top:\s*0;/, "PMI banner should sit against the top of the scrollable content area.");
assert.match(componentsCss, /body\[data-page="next-step"\] \.prospect-panel-header \.confidential-calculator-toggle\s*{[\s\S]*width:\s*1\.85rem;/, "PMI banner calculator icon should be compact.");
assert.match(
  componentsCss,
  /body\[data-page="next-step"\]\s+#pmi-housing\s+\.field-group--centered-result\s+\.profile-currency-field\s*{[\s\S]*justify-self:\s*auto\s*!important;[\s\S]*width:\s*min\(100%,\s*24rem\)\s*!important;/,
  "Calculated Monthly Burden should use the same narrow result field width as Total Debt Payoff Need."
);
assert.match(componentsCss, /\.pmi-file-field\[data-pmi-file-field="date-of-birth"\]\s*{[\s\S]*justify-content:\s*flex-end;/, "Date of birth should align to the right edge of the banner.");
assert.match(componentsCss, /\.pmi-file-field\[data-pmi-file-field="case-ref"\],[\s\S]*\.pmi-file-field\[data-pmi-file-field="household"\]\s*{[\s\S]*justify-content:\s*center;/, "Case ref and household should be spaced through the middle of the banner.");

[
  ".pmi-form-layout",
  ".pmi-section-nav",
  ".pmi-section-nav-link",
  ".pmi-form-main",
  ".pmi-cashflow-rail",
  ".pmi-cashflow-rail .pmi-expense-cashflow",
  ".pmi-file-header",
  ".pmi-file-field",
  ".pmi-linked-person-badge"
].forEach((selector) => {
  assert.match(componentsCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `components.css should style ${selector}.`);
});

[
  'body[data-page="next-step"] .pmi-form-main .profile-form-section',
  'body[data-page="next-step"] .pmi-form-main .profile-form-section-heading',
  'body[data-page="next-step"] .pmi-form-main input:not([type="hidden"])',
  'body[data-page="next-step"] .pmi-form-main .profile-currency-field',
  'body[data-page="next-step"] .pmi-form-main .profile-form-toggle-button'
].forEach((selector) => {
  assert.match(stylesCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `styles.css should neutralize legacy form styling for ${selector}.`);
});

[
  'body[data-page="next-step"] #pmi-income .income-calculation-grid',
  'body[data-page="next-step"] #pmi-income .income-calculation-grid > .field-group:has(#gross-annual-income)',
  'body[data-page="next-step"] #pmi-income .pmi-reference-divider',
  'body[data-page="next-step"] #pmi-income .primary-net-income-group',
  'body[data-page="next-step"] #pmi-income .pmi-reference-notice'
].forEach((selector) => {
  const escapedSelector = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  assert.ok(
    escapedSelector.test(componentsCss) || escapedSelector.test(stylesCss),
    `PMI styles should match the reference income layout for ${selector}.`
  );
});

[
  'body[data-page="next-step"] .pmi-scalar-expenses-table',
  'body[data-page="next-step"] .pmi-debt-records-table',
  'body[data-page="next-step"] .pmi-expense-records-table',
  'body[data-page="next-step"] .pmi-scalar-expense-row input',
  'body[data-page="next-step"] .pmi-expense-record-type-label'
].forEach((selector) => {
  assert.match(componentsCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `components.css should refine actual PMI table/control styling for ${selector}.`);
});

assert.doesNotMatch(componentsCss, /body\[data-page="next-step"\]\s+\.prospect-panel-header\s*{\s*display:\s*none;/, "PMI form styling should not remove the app page header.");
assert.doesNotMatch(pageSource, /<script[^>]*>[\s\S]*querySelectorAll\("\.pmi-section-nav-link"\)/, "PMI section navigation should not need page-local behavior for this pass.");

console.log("pmi-form-layout-reference-check passed");
