#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBlock(source, selector) {
  const selectorIndex = source.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `${selector} should exist.`);
  const blockEnd = source.indexOf("\n}", selectorIndex);
  assert.notEqual(blockEnd, -1, `${selector} block should close.`);
  return source.slice(selectorIndex, blockEnd);
}

function assertContains(source, snippet, message) {
  assert.ok(source.includes(snippet), message);
}

const pageSource = readRepoFile("pages/next-step.html");
const layoutCss = readRepoFile("layout.css");
const stylesCss = readRepoFile("styles.css");

const hiddenOwnerSelector = 'body[data-page="next-step"] .pmi-form-main .field-group.is-hidden {';
const hiddenOwnerBlock = extractBlock(layoutCss, hiddenOwnerSelector);
assertContains(
  hiddenOwnerBlock,
  "display: none;",
  "Canonical PMI hidden field groups should be hidden by layout.css."
);
assert.doesNotMatch(
  hiddenOwnerBlock,
  /!important\b/,
  "Canonical PMI hidden-state ownership should not use !important."
);
assert.doesNotMatch(
  stylesCss,
  /body\[data-page="next-step"\][^{]*\.field-group\.is-hidden\s*\{/,
  "styles.css should not own canonical next-step hidden field behavior."
);
assertContains(
  stylesCss,
  'body:not([data-page="next-step"]) .profile-creation-form .field-group.is-hidden {',
  "Noncanonical legacy hidden-state styling should remain scoped away from next-step."
);

[
  'if (isMarried && filingStatus === "Married Filing Jointly") {',
  'return "joint";',
  'if (isMarried && filingStatus === "Married Filing Separately") {',
  'return "separate";',
  'return "single";'
].forEach((snippet) => {
  assertContains(pageSource, snippet, `Income calculation mode should preserve ${snippet}`);
});

[
  'const isJoint = incomeCalculationMode === "joint";',
  'const isSeparate = incomeCalculationMode === "separate";',
  "const showSpouseIncome = isJoint || isSeparate;",
  "const showDetailedSpouseFields = isSeparate;",
  'setGroupState(fieldGroupFor("spouseIncome"), showSpouseIncome, !showSpouseIncome);',
  'setToggleGroupState("spouse", showDetailedSpouseFields, !showDetailedSpouseFields);'
].forEach((snippet) => {
  assertContains(pageSource, snippet, `PMI filing-status visibility logic should preserve ${snippet}`);
});

[
  "spouseStandardDeduction",
  "spouseYearlyTaxDeductions",
  "spouseTaxableIncome",
  "spouseFederalTaxBracket",
  "spouseStateIncomeTaxBracket",
  "spousePayrollTaxes",
  "spouseNetAnnualIncome"
].forEach((fieldName) => {
  assertContains(
    pageSource,
    `setGroupState(fieldGroupFor("${fieldName}"), showDetailedSpouseFields, !showDetailedSpouseFields);`,
    `${fieldName} should be visible only for separate filing.`
  );
});

assert.match(
  pageSource,
  new RegExp(`${escapeRegex("function syncIncomeCalculationSpouseFields()")}[\\s\\S]*${escapeRegex("group.classList.toggle(\"is-hidden\", !isVisible);")}`),
  "PMI spouse-field sync should toggle is-hidden on controlled field groups."
);
assert.match(
  pageSource,
  /filingStatusField\.addEventListener\("change", syncFederalBracketState\);[\s\S]*filingStatusField\.addEventListener\("input", syncFederalBracketState\);/,
  "Filing-status changes should update spouse-field visibility immediately."
);

console.log("pmi-tax-profile-filing-status-visibility-check passed");
