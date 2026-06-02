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
const layoutCss = readRepoFile("layout.css");
const componentsCss = readRepoFile("components.css");
const stylesCss = readRepoFile("styles.css");

[
  "data-pmi-form-layout",
  "data-pmi-workflow-menu-shell",
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
  ["#pmi-savings-habits", "Savings Habits"],
  ["#pmi-assets", "Assets"],
  ["#pmi-coverage", "Existing Coverage"],
  ["#pmi-survivor", "Survivor Needs"],
  ["#pmi-education", "Education"],
  ["#pmi-final", "Final Expenses"]
].forEach(([href, label]) => {
  assert.match(pageSource, new RegExp(`href="${href.replace("#", "\\#")}"[\\s\\S]*>${label}`), `PMI workflow menu should include ${label}.`);
});

[
  "pmi-income",
  "pmi-housing",
  "pmi-debts",
  "pmi-expenses",
  "pmi-savings-habits",
  "pmi-assets",
  "pmi-coverage",
  "pmi-survivor",
  "pmi-education",
  "pmi-final"
].forEach((id) => {
  assert.match(pageSource, new RegExp(`id="${id}"`), `PMI page should expose #${id} section anchor.`);
});

const expensesCardIndex = pageSource.indexOf('<section class="profile-form-section" id="pmi-expenses">');
const savingsHabitsCardIndex = pageSource.indexOf('<section class="profile-form-section" id="pmi-savings-habits">');
const ongoingSupportGroupIndex = pageSource.indexOf("<h2>Ongoing Support</h2>");
const assetsCardIndex = pageSource.indexOf('id="pmi-assets"');
assert.ok(expensesCardIndex !== -1, "Expenses and Lifestyle should render as its own top-level PMI card.");
assert.ok(savingsHabitsCardIndex > expensesCardIndex, "Savings, Reserves & Investment Habits should render directly after the standalone Expenses and Lifestyle card.");
assert.ok(ongoingSupportGroupIndex > savingsHabitsCardIndex, "Ongoing Support should start after the standalone Savings, Reserves & Investment Habits card.");
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
[
  ["pmi-income", "01 · Income Calculation", "Household Income &amp; Tax Profile"],
  ["pmi-housing", "02 · Housing", "Housing Costs"],
  ["pmi-debts", "03 · Debts", "Debts and Liabilities"],
  ["pmi-expenses", "04 · Expenses", "Expenses and Lifestyle"],
  ["pmi-savings-habits", "05 · Savings Habits", "Savings, Reserves &amp; Investment Habits"],
  ["pmi-assets", "06 · Assets", "Assets and Offset Planning"],
  ["pmi-coverage", "07 · Existing Coverage", "Existing Coverage"],
  ["pmi-survivor", "08 · Survivor Needs", "Survivor Transition Needs"],
  ["pmi-education", "09 · Education", "Education Funding"],
  ["pmi-final", "10 · Final Expenses", "Final Expenses"]
].forEach(([sectionId, eyebrow, title]) => {
  const sectionStart = pageSource.indexOf(`id="${sectionId}"`);
  assert.ok(sectionStart !== -1, `${sectionId} should exist.`);
  const nextSectionStart = pageSource.indexOf('<section class="profile-form-section"', sectionStart + 1);
  const sectionSource = pageSource.slice(sectionStart, nextSectionStart === -1 ? pageSource.length : nextSectionStart);
  assert.match(
    sectionSource,
    new RegExp(`<span class="pmi-reference-card-num">${eyebrow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/span>`),
    `${sectionId} should render the correct numbered PMI section eyebrow.`
  );
  assert.match(
    sectionSource,
    new RegExp(`<h2>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/h2>`),
    `${sectionId} should keep the correct section title.`
  );
});
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
assert.match(layoutCss, /body\[data-page="next-step"\] #pmi-income \.pmi-reference-divider,\s*\nbody\[data-page="next-step"\] #pmi-housing \.pmi-reference-divider/, "Income and Housing section dividers should share the same layout owner.");
assert.doesNotMatch(componentsCss, /body\[data-page="next-step"\]\s+#pmi-income\s+\.pmi-reference-divider\s*\{[\s\S]*?font-weight:/, "Income dividers should not carry a separate visual text override from Housing dividers.");
assert.doesNotMatch(componentsCss, /body\[data-page="next-step"\]\s+#pmi-income\s+\.pmi-reference-divider::after\s*\{/, "Income divider lines should not carry a separate line override from Housing dividers.");
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
assert.match(componentsCss, /--pmi-rail-sticky-align-offset:\s*20px;/, "PMI side rails should correct the sticky offset that otherwise drops them below the form.");
assert.match(componentsCss, /top:\s*var\(--pmi-rail-sticky-effective-top\);/, "PMI side rails should use the aligned effective sticky top.");
assert.match(componentsCss, /\.pmi-cashflow-rail \.pmi-expense-cashflow\s*{[\s\S]*height:\s*calc\(100dvh - var\(--pmi-rail-sticky-top\) - 1\.85rem\);/, "PMI cash-flow rail should resize to the visible viewport height.");
assert.match(componentsCss, /\.pmi-cashflow-rail \.pmi-expense-cashflow-track\s*{[\s\S]*width:\s*min\(340px,\s*calc\(100% - 24px\),\s*calc\(100dvh - var\(--pmi-rail-sticky-top\) - 19\.5rem\)\);/, "PMI cash-flow donut should shrink with shorter viewport heights.");
assert.match(
  componentsCss,
  /body\[data-page="next-step"\]\s+#pmi-housing\s+\.field-group--centered-result\s+\.profile-currency-field\s*{[\s\S]*justify-self:\s*auto\s*!important;[\s\S]*width:\s*min\(100%,\s*24rem\)\s*!important;/,
  "Calculated Monthly Burden should use the same narrow result field width as Total Debt Payoff Need."
);
assert.match(componentsCss, /\.pmi-file-field\[data-pmi-file-field="date-of-birth"\]\s*{[\s\S]*justify-content:\s*flex-end;/, "Date of birth should align to the right edge of the banner.");
assert.match(componentsCss, /\.pmi-file-field\[data-pmi-file-field="case-ref"\],[\s\S]*\.pmi-file-field\[data-pmi-file-field="household"\]\s*{[\s\S]*justify-content:\s*center;/, "Case ref and household should be spaced through the middle of the banner.");
assert.match(layoutCss, /body\[data-page="next-step"\] \.pmi-form-main \.profile-creation-form\s*{[\s\S]*display:\s*grid;[\s\S]*gap:\s*16px;/, "PMI card stack should use layout-owned grid gaps between section cards.");
assert.match(layoutCss, /body\[data-page="next-step"\] \.pmi-form-main \.profile-form-section-heading\s*{[\s\S]*flex-direction:\s*column;[\s\S]*padding:\s*16px 22px 14px;/, "PMI section headings should keep the original compact card scale.");
assert.doesNotMatch(layoutCss, /content:\s*"01 \\00B7  Income Calculation"/, "PMI section eyebrow text should come from each section, not a hardcoded pseudo-element.");

[
  ".pmi-form-layout",
  ".pmi-workflow-menu",
  ".pmi-workflow-menu-item",
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
  assert.match(componentsCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `components.css should own canonical PMI form-control visuals for ${selector}.`);
});

[
  'border: 1px solid var(--m90-border);',
  'background: var(--m90-surface);',
  'background: var(--m90-surface-secondary);',
  'color: var(--m90-text-primary);',
  'color: var(--m90-text-secondary);',
  'background: var(--m90-accent-soft);',
  'color: var(--m90-accent);'
].forEach((snippet) => {
  assert.match(componentsCss, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `PMI form-control visuals should consume theme token snippet ${snippet}.`);
});

[
  'body[data-page="next-step"] .prospect-panel-header',
  'body[data-page="next-step"] .pmi-file-header',
  'body[data-page="next-step"] .pmi-form-main .form-grid',
  'body[data-page="next-step"] #pmi-income .income-calculation-grid',
  'body[data-page="next-step"] #pmi-income .income-calculation-grid > .field-group:has(#gross-annual-income)',
  'body[data-page="next-step"] #pmi-income .pmi-reference-divider',
  'body[data-page="next-step"] #pmi-income .primary-net-income-group',
  'body[data-page="next-step"] #pmi-income .pmi-reference-notice'
].forEach((selector) => {
  assert.match(layoutCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `layout.css should own canonical PMI structural layout for ${selector}.`);
  assert.doesNotMatch(stylesCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `styles.css should not retain canonical PMI structural layout for ${selector}.`);
});

[
  'body[data-page="next-step"] .pmi-debt-records-table',
  'body[data-page="next-step"] .pmi-expense-records-table',
  'body[data-page="next-step"] .pmi-expense-record-type-label'
].forEach((selector) => {
  assert.match(componentsCss, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `components.css should refine actual PMI table/control styling for ${selector}.`);
});

assert.doesNotMatch(componentsCss, /body\[data-page="next-step"\]\s+\.prospect-panel-header\s*{\s*display:\s*none;/, "PMI form styling should not remove the app page header.");
assert.doesNotMatch(pageSource, /<script[^>]*>[\s\S]*querySelectorAll\("\.pmi-section-nav-link"\)/, "PMI section navigation should not need page-local behavior for this pass.");

console.log("pmi-form-layout-reference-check passed");
