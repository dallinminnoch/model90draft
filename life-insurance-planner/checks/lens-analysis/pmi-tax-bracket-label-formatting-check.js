#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function parseCurrencyLikeNumber(value) {
  const numeric = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function formatNumberWithCommas(value) {
  return String(Math.trunc(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatTaxBracketRangeAmount(value, fallbackLabel) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return fallbackLabel;
  }

  const numericValue = parseCurrencyLikeNumber(normalized);
  if (!Number.isFinite(numericValue)) {
    return normalized;
  }

  return `$${formatNumberWithCommas(numericValue)}`;
}

function createExpectedTaxBracketOptionLabel(rate, minIncome, maxIncome) {
  const safeValue = String(rate || "").trim();
  const minValue = String(minIncome || "").trim();
  const maxValue = String(maxIncome || "").trim();

  if (!minValue && !maxValue) {
    return safeValue;
  }

  const rangeStart = formatTaxBracketRangeAmount(minValue, "$0");
  const rangeEnd = maxValue
    ? formatTaxBracketRangeAmount(maxValue, "No cap")
    : "No cap";
  return `${safeValue} | ${rangeStart} \u2013 ${rangeEnd}`;
}

const pageSource = readRepoFile("pages/next-step.html");
const taxCalculationSource = readRepoFile("app/features/lens-analysis/helpers/income-tax-calculations.js");
const taxSources = `${pageSource}\n${taxCalculationSource}`;

assert.equal(
  createExpectedTaxBracketOptionLabel("22%", "100801", "211400"),
  "22% | $100,801 \u2013 $211,400",
  "Expected tax bracket labels should render dollar-formatted ranges."
);
assert.equal(
  createExpectedTaxBracketOptionLabel("37%", "768701", ""),
  "37% | $768,701 \u2013 No cap",
  "Open-ended tax bracket labels should keep the No cap display."
);

[
  "function formatTaxBracketRangeAmount(value, fallbackLabel)",
  "function createTaxBracketOptionLabel(rate, minIncome, maxIncome)",
  'return `$${formatNumberWithCommas(numericValue)}`;',
  'return `${safeValue} | ${rangeStart} \\u2013 ${rangeEnd}`;'
].forEach((snippet) => {
  assert.ok(pageSource.includes(snippet), `next-step.html should include ${snippet}`);
});

assert.equal(
  countMatches(pageSource, /createTaxBracketOptionLabel\(safeValue, minIncome, maxIncome\)/g),
  4,
  "Federal, spouse federal, state progressive, and spouse state progressive brackets should share the formatter."
);
assert.doesNotMatch(
  pageSource,
  /\$\{safeValue\} \| \$\{rangeStart\} - \$\{rangeEnd\}/,
  "Visible tax bracket label generation should not use the raw hyphen range format."
);
assert.doesNotMatch(
  pageSource,
  /const rangeStart = minIncome \|\| "0";/,
  "Tax bracket option population should no longer build raw unformatted range starts."
);
assert.doesNotMatch(
  pageSource,
  /const rangeEnd = maxIncome \|\| "No cap";/,
  "Tax bracket option population should no longer build raw unformatted range ends."
);

[
  'Object.freeze({ rate: "22%", minIncome: "100801", maxIncome: "211400" })',
  'Object.freeze({ rate: "22%", minIncome: "50401", maxIncome: "105700" })',
  '"Married Filing Jointly": "32200"',
  '"Married Filing Separately": "16100"',
  'return `<option value="${safeValue}">${label}</option>`;',
  '`${flatRate} | Flat Tax Rate`'
].forEach((snippet) => {
  assert.ok(taxSources.includes(snippet), `Formatting pass should preserve ${snippet}`);
});

console.log("pmi-tax-bracket-label-formatting-check passed");
