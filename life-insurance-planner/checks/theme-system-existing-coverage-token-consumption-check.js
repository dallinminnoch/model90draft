const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function blockFor(source, selector, label) {
  const startIndex = source.indexOf(selector);
  assert.ok(startIndex !== -1, `${label}: ${selector} should exist.`);
  const endIndex = source.indexOf("\n}", startIndex);
  assert.ok(endIndex !== -1, `${label}: ${selector} block should close.`);
  return source.slice(startIndex, endIndex + 2);
}

function assertSelectorUses(source, selector, expectedTokens, label) {
  const block = blockFor(source, selector, label);
  expectedTokens.forEach((tokenName) => {
    assert.ok(block.includes(`var(${tokenName})`), `${label} should consume ${tokenName}.`);
  });
}

function assertNoPerThemeOverrides(source, label) {
  assert.doesNotMatch(
    source,
    /\[data-theme="(?:modern|classic|old-money|dark-soft|dark|carbon|high-tech|dusk|warm-professional)"\][^{]*(?:existing-coverage|coverage-policy|client-coverage|coverage-mode)/,
    `${label} should not add per-theme Existing Coverage overrides.`
  );
}

function collectCoverageColorDebt(source, options = {}) {
  const selectorPattern = options.includeClientCoverage
    ? /existing-coverage|coverage-policy|coverage-form-feedback|premium-amount-group|client-coverage|coverage-mode/i
    : /existing-coverage|coverage-policy|coverage-form-feedback|premium-amount-group/i;
  const excludedSelector = /analysis-setup-coverage/i;
  const colorPattern =
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--(?:surface|text|accent|success|warning|bg)\)|(?:color|background|background-color|border-color|fill|stroke|box-shadow)\s*:\s*(?:black|white|red|green|blue|orange|purple|gray|grey)\b/gi;
  const debt = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = blockPattern.exec(source))) {
    const selector = match[1].trim();
    if (!selectorPattern.test(selector) || excludedSelector.test(selector)) {
      continue;
    }
    const colors = match[2].match(colorPattern) || [];
    if (colors.length) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      debt.push(`${line}: ${selector.replace(/\s+/g, " ").slice(0, 160)} -> ${[...new Set(colors)].join(", ")}`);
    }
  }

  return debt;
}

const componentsCss = readRepoFile("life-insurance-planner/components.css");
const stylesCss = readRepoFile("life-insurance-planner/styles.css");
const layoutCss = readRepoFile("life-insurance-planner/layout.css");
const coverageManagerJs = readRepoFile("life-insurance-planner/app/features/coverage/coverage-policy-manager.js");
const coverageSummaryListJs = readRepoFile("life-insurance-planner/app/features/coverage/coverage-policy-summary-list.js");
const coverageUtilsJs = readRepoFile("life-insurance-planner/app/features/coverage/coverage-policy-utils.js");

[
  ["coverage-policy-manager.js", coverageManagerJs],
  ["coverage-policy-summary-list.js", coverageSummaryListJs],
  ["coverage-policy-utils.js", coverageUtilsJs]
].forEach(([label, source]) => {
  assert.doesNotMatch(
    source,
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?:color|background|borderColor|boxShadow)\s*:\s*["'`]/,
    `${label} should remain free of static UI colors.`
  );
});

assertNoPerThemeOverrides(componentsCss, "components.css");
assertNoPerThemeOverrides(stylesCss, "styles.css");
assertNoPerThemeOverrides(layoutCss, "layout.css");

assertSelectorUses(
  componentsCss,
  ".coverage-policy-totals > div {",
  ["--m90-border", "--m90-surface"],
  "Existing Coverage totals cards"
);
assertSelectorUses(
  componentsCss,
  ".coverage-policy-totals dt {",
  ["--m90-text-muted"],
  "Existing Coverage totals labels"
);
assertSelectorUses(
  componentsCss,
  ".coverage-policy-totals dd {",
  ["--m90-text-primary"],
  "Existing Coverage totals values"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-return-button {",
  ["--m90-border", "--m90-surface", "--m90-text-primary", "--m90-shadow"],
  "Existing Coverage return button"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-summary-section,",
  ["--m90-border", "--m90-surface", "--m90-shadow"],
  "Existing Coverage standalone section surfaces"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-section-heading h2,",
  ["--m90-text-primary"],
  "Existing Coverage headings"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-section-heading p,",
  ["--m90-text-secondary"],
  "Existing Coverage helper text"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-summary-avatar {",
  ["--m90-accent-soft", "--m90-accent"],
  "Existing Coverage summary avatar"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-add-button {",
  ["--m90-border", "--m90-surface", "--m90-accent"],
  "Existing Coverage add button"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-inline-note {",
  ["--m90-border", "--m90-surface-secondary", "--m90-text-secondary"],
  "Existing Coverage inline note"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-feedback.is-success {",
  ["--m90-stable-soft", "--m90-stable"],
  "Existing Coverage success feedback"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-feedback.is-error,",
  ["--m90-critical-soft", "--m90-critical"],
  "Existing Coverage error feedback"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-empty {",
  ["--m90-border", "--m90-surface-secondary"],
  "Existing Coverage empty state"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-saved-delete {",
  ["--m90-critical"],
  "Existing Coverage delete action"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-status-banner {",
  ["--m90-border", "--m90-accent-soft"],
  "Existing Coverage status banner"
);
assertSelectorUses(
  componentsCss,
  ".existing-coverage-status-icon {",
  ["--m90-surface", "--m90-accent"],
  "Existing Coverage status icon"
);
assertSelectorUses(
  componentsCss,
  "[data-premium-amount-group].is-disabled label {",
  ["--m90-text-muted"],
  "Existing Coverage disabled premium amount label"
);

assertSelectorUses(
  componentsCss,
  ".coverage-policy-manager-panel {",
  ["--m90-border", "--m90-surface", "--m90-shadow"],
  "Existing Coverage manager panel"
);
assertSelectorUses(
  componentsCss,
  ".coverage-policy-manager-feedback {",
  ["--m90-critical-soft", "--m90-critical"],
  "Existing Coverage manager feedback"
);
assertSelectorUses(
  componentsCss,
  ".coverage-policy-manager-editor .client-activity-input,",
  ["--m90-border", "--m90-surface-secondary", "--m90-text-primary"],
  "Existing Coverage manager editor controls"
);
assertSelectorUses(
  componentsCss,
  ".client-coverage-widget .coverage-mode-button {",
  ["--m90-border", "--m90-surface-secondary", "--m90-text-secondary"],
  "Existing Coverage widget mode buttons"
);
assert.match(
  componentsCss,
  /\.client-coverage-widget \.client-activity-widget-save \{\s*border-color: var\(--m90-focus-ring\);\s*background: linear-gradient\(135deg, var\(--m90-accent\)/,
  "Existing Coverage widget save button should consume focus and accent tokens."
);

const componentCoverageDebt = collectCoverageColorDebt(componentsCss);
const legacyCoverageDebt = collectCoverageColorDebt(stylesCss);

assert.deepEqual(
  componentCoverageDebt,
  [],
  ["components.css should not retain hardcoded Existing Coverage visual colors.", ...componentCoverageDebt].join("\n")
);
assert.deepEqual(
  legacyCoverageDebt,
  [],
  ["styles.css should not retain hardcoded Existing Coverage visual colors after neutralization.", ...legacyCoverageDebt].join("\n")
);

assert.match(
  stylesCss,
  /input:not\(\.client-table-search-input\):not\(\.client-activity-input\):not\(\.client-coverage-suggest-input\):not\(\.client-coverage-inline-unit-input\):not\(\.client-coverage-readonly-input\)/,
  "Legacy broad input rule should exclude coverage/client activity controls so tokenized component controls can own visuals."
);
assert.match(
  stylesCss,
  /select:not\(\.client-activity-select\)/,
  "Legacy broad select rule should exclude tokenized client activity selects."
);
assert.match(
  stylesCss,
  /textarea:not\(\.client-activity-textarea\)/,
  "Legacy broad textarea rule should exclude tokenized client activity textareas."
);
assert.match(
  componentsCss,
  /\.analysis-setup-coverage-head\b/,
  "Analysis Setup coverage selectors should remain present and deferred to a separate migration pass."
);

console.log("theme-system-existing-coverage-token-consumption-check passed");
