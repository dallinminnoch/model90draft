const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertBlockContains(source, selector, expectedSnippets, message) {
  const pattern = new RegExp(`^${escapeRegex(selector)}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const match = source.match(pattern);
  assert.ok(match, `${message}: ${selector} block should exist.`);
  expectedSnippets.forEach((snippet) => {
    assert.ok(
      match[1].includes(snippet),
      `${message}: ${selector} should include ${snippet}.`
    );
  });
}

function assertCombinedBlockContains(source, selectorStart, selectorEnd, expectedSnippets, message) {
  const startIndex = source.indexOf(selectorStart);
  assert.ok(startIndex !== -1, `${message}: ${selectorStart} should exist.`);
  const endIndex = source.indexOf(selectorEnd, startIndex);
  assert.ok(endIndex !== -1, `${message}: ${selectorEnd} should exist.`);
  const blockEnd = source.indexOf("\n}", endIndex);
  assert.ok(blockEnd !== -1, `${message}: combined block should close.`);
  const block = source.slice(startIndex, blockEnd);
  expectedSnippets.forEach((snippet) => {
    assert.ok(
      block.includes(snippet),
      `${message}: combined block should include ${snippet}.`
    );
  });
}

const componentsCss = readRepoFile("components.css");
const expenseRecordsJs = readRepoFile("app/features/lens-analysis/pmi-expense-records.js");
const changedFiles = execSync("git diff --name-only HEAD --", {
  cwd: repoRoot,
  encoding: "utf8"
})
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

assert.ok(
  !changedFiles.includes("life-insurance-planner/styles.css"),
  "PMI record token migration should not change styles.css."
);
assert.doesNotMatch(
  componentsCss,
  /\[data-theme=/,
  "PMI record token migration should not add per-theme component overrides."
);

assertBlockContains(
  componentsCss,
  ".pmi-debt-records-table",
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface);"],
  "Debt record table should consume theme tokens"
);
assertCombinedBlockContains(
  componentsCss,
  ".pmi-debt-records-header",
  ".pmi-debt-records-header {",
  [
    "background: var(--m90-surface-secondary);",
    "border-bottom: 1px solid var(--m90-border-soft);",
    "color: var(--m90-text-secondary);"
  ],
  "Debt record header should consume theme tokens"
);
assertCombinedBlockContains(
  componentsCss,
  ".pmi-debt-record-row input:disabled",
  ".pmi-debt-record-na-control input {",
  [
    "border-color: var(--m90-border-soft);",
    "background: var(--m90-surface-secondary);",
    "color: var(--m90-text-muted);"
  ],
  "Debt disabled and N/A states should consume theme tokens"
);

assertBlockContains(
  componentsCss,
  ".pmi-expense-records-table",
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface);"],
  "Expense record table should consume theme tokens"
);
assertBlockContains(
  componentsCss,
  ".pmi-expense-record-row-generated",
  ["background: var(--m90-neutral-soft);"],
  "Generated expense rows should consume neutral tokens"
);
assertCombinedBlockContains(
  componentsCss,
  ".pmi-expense-record-source-chip",
  ".pmi-expense-record-source-hint {",
  ["color: var(--m90-text-secondary);"],
  "Expense generated source cues should consume text tokens"
);

assertBlockContains(
  componentsCss,
  ".pmi-expense-cashflow",
  [
    "--cashflow-remaining-color: var(--m90-stable);",
    "--cashflow-shortfall-color: var(--m90-critical);",
    "border: 1px solid var(--m90-border);",
    "background: var(--m90-surface);"
  ],
  "Cash-flow widget should consume surface and status tokens"
);
assertBlockContains(
  componentsCss,
  ".pmi-expense-cashflow.is-negative .pmi-expense-cashflow-track",
  ["--cashflow-remaining-color: var(--cashflow-shortfall-color);", "outline: 2px solid var(--m90-critical-soft);"],
  "Negative cash-flow state should consume critical tokens"
);
assertBlockContains(
  componentsCss,
  ".pmi-expense-cashflow-ring-base",
  ["stroke: var(--m90-surface);"],
  "Cash-flow donut base should consume surface token"
);
assertBlockContains(
  componentsCss,
  ".pmi-expense-cashflow-center strong",
  ["color: var(--m90-stable);"],
  "Cash-flow center positive readout should consume stable token"
);
assertBlockContains(
  componentsCss,
  ".pmi-expense-cashflow.is-negative .pmi-expense-cashflow-center strong",
  ["color: var(--m90-critical);"],
  "Cash-flow center negative readout should consume critical token"
);

assertCombinedBlockContains(
  componentsCss,
  ".pmi-asset-records-add-button",
  ".pmi-expense-records-add-button {",
  ["border: 1px solid var(--m90-accent);", "background: var(--m90-accent);"],
  "PMI record add buttons should consume accent tokens"
);
assertCombinedBlockContains(
  componentsCss,
  ".profile-search-modal[data-pmi-asset-library-modal] .profile-search-modal-backdrop",
  ".profile-search-modal[data-pmi-expense-library-modal] .profile-search-modal-backdrop {",
  ["background: var(--m90-overlay);"],
  "PMI record library backdrop should consume overlay token"
);
assertCombinedBlockContains(
  componentsCss,
  ".pmi-asset-library-search input",
  ".pmi-expense-library-search input {",
  [
    "border: 1px solid var(--m90-border);",
    "background: var(--m90-surface);",
    "color: var(--m90-text-primary);"
  ],
  "PMI record library search inputs should consume tokens"
);

assert.doesNotMatch(
  expenseRecordsJs,
  /#86efac|#fca5a5/,
  "PMI expense records JS should not contain raw cash-flow positive or negative colors."
);
assert.match(
  expenseRecordsJs,
  /var\(--m90-stable\)/,
  "PMI expense records JS should bridge positive cash-flow color to stable token."
);
assert.match(
  expenseRecordsJs,
  /var\(--m90-critical\)/,
  "PMI expense records JS should bridge negative cash-flow color to critical token."
);

const recordFamilyColorContext =
  /pmi-scalar|pmi-debt-record|pmi-expense-record|pmi-expense-cashflow|pmi-asset-record|pmi-(asset|debt|expense)-library|data-pmi-(asset|debt|expense)-library-modal|pmi-cashflow-rail/;
const hardcodedColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/;
const recordFamilyHardcodedLines = componentsCss
  .split(/\r?\n/)
  .map((line, index, lines) => ({
    line,
    context: lines.slice(Math.max(0, index - 8), index + 1).join("\n")
  }))
  .filter((entry) => hardcodedColorPattern.test(entry.line) && recordFamilyColorContext.test(entry.context + entry.line));

assert.deepEqual(
  recordFamilyHardcodedLines,
  [],
  "PMI record-family selectors should not retain hardcoded colors."
);

console.log("theme-system-pmi-record-token-consumption-check passed");
