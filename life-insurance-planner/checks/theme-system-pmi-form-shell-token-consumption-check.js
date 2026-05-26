const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, snippet, message) {
  assert.ok(source.includes(snippet), message);
}

function assertSelectorUses(source, selector, snippets, message) {
  const selectorIndex = source.indexOf(selector);
  assert.ok(selectorIndex !== -1, `${message}: ${selector} should exist.`);
  const blockEnd = source.indexOf("\n}", selectorIndex);
  assert.ok(blockEnd !== -1, `${message}: ${selector} block should close.`);
  const block = source.slice(selectorIndex, blockEnd);
  snippets.forEach((snippet) => {
    assert.ok(block.includes(snippet), `${message}: ${selector} should include ${snippet}.`);
  });
}

function extractBetween(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.ok(startIndex !== -1, `${startNeedle} should exist.`);
  const endIndex = source.indexOf(endNeedle, startIndex);
  assert.ok(endIndex !== -1, `${endNeedle} should exist after ${startNeedle}.`);
  return source.slice(startIndex, endIndex);
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

const componentsCss = readRepoFile("components.css");
const stylesCss = readRepoFile("styles.css");
const hardcodedColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

assert.doesNotMatch(
  componentsCss,
  /\[data-theme=/,
  "PMI form-control token migration should not add per-theme component overrides."
);
assert.doesNotMatch(
  stylesCss,
  /\[data-theme=/,
  "PMI form-control token migration should not add per-theme legacy overrides."
);

assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-form-section {",
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface);", "box-shadow: var(--m90-shadow);"],
  "PMI form cards should consume surface, border, and shadow tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-form-section-heading {",
  ["border-bottom: 1px solid var(--m90-border-soft);", "background: var(--m90-surface);"],
  "PMI form headings should consume surface and soft border tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-form-section-heading::before {",
  ["background: var(--m90-accent);"],
  "PMI heading accent should consume accent token"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .field-group > label,",
  ["color: var(--m90-text-secondary);"],
  "PMI labels should consume secondary text token"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main input:not([type=\"hidden\"]):not([type=\"checkbox\"]):not([type=\"radio\"]),",
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface-secondary);", "color: var(--m90-text-primary);"],
  "PMI inputs should consume form-control tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-currency-field,",
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface-secondary);"],
  "PMI currency and unit wrappers should consume control tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-currency-suffix,",
  ["border-left: 1px solid var(--m90-border);", "background: var(--m90-surface-secondary);", "color: var(--m90-text-muted);"],
  "PMI currency and unit suffixes should consume muted text and control tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-form-toggle-button,",
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface-secondary);", "color: var(--m90-text-secondary);"],
  "PMI toggle controls should consume neutral control tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] .pmi-form-main .profile-form-toggle-button.is-active,",
  ["border-color: var(--m90-focus-ring);", "background: var(--m90-accent-soft);", "color: var(--m90-accent);"],
  "PMI active toggle controls should consume accent tokens"
);
assertSelectorUses(
  componentsCss,
  "body[data-page=\"next-step\"] #pmi-income .primary-net-income-group {",
  ["border: 1px solid var(--m90-focus-ring);", "background: var(--m90-accent-soft);"],
  "Primary net income result card should consume accent surface tokens"
);
assertSelectorUses(
  componentsCss,
  ".pmi-save-exit-button {",
  ["border-color: var(--m90-border);", "box-shadow: var(--m90-shadow);"],
  "Save-exit button base styling should consume tokens"
);
assertSelectorUses(
  componentsCss,
  ".pmi-save-exit-button:hover,",
  ["border-color: var(--m90-accent);", "outline: 2px solid var(--m90-focus-ring);", "box-shadow: 0.18rem 0.18rem 0 var(--m90-accent-soft);"],
  "Save-exit button hover/focus styling should consume accent tokens"
);

const stylesNextStepBlock = extractBetween(
  stylesCss,
  '@layer overrides {\nbody[data-page="next-step"] .prospect-panel-header',
  'body[data-step="income-impact"] .income-impact-page-intro'
);
assert.equal(
  countMatches(stylesNextStepBlock, hardcodedColorPattern),
  0,
  "styles.css next-step override block should not retain hardcoded colors for migrated PMI controls."
);
assert.doesNotMatch(
  stylesCss,
  /\.pmi-save-exit-button\s*{[\s\S]*#[0-9a-fA-F]{3,8}\b/,
  "styles.css should not retain raw save-exit button colors."
);
assert.doesNotMatch(
  stylesCss,
  /\.pmi-save-exit-button:hover[\s\S]*#000000/,
  "Save-exit hover treatment should not retain hardcoded black outline/shadow."
);

const componentsPmiFormBlock = extractBetween(
  componentsCss,
  'body[data-page="next-step"] .pmi-form-main .profile-creation-form',
  ".pmi-cashflow-rail {"
);
assert.equal(
  countMatches(componentsPmiFormBlock, hardcodedColorPattern),
  0,
  "components.css PMI form-control token block should not introduce raw colors."
);

[
  "body[data-page=\"next-step\"] #pmi-income .income-calculation-grid",
  "body[data-page=\"next-step\"] #pmi-income .income-calculation-grid > .field-group:has(#gross-annual-income)",
  "body[data-page=\"next-step\"] #pmi-income .pmi-reference-divider--deductions",
  "body[data-page=\"next-step\"] #pmi-income .pmi-reference-divider--tax"
].forEach((selector) => {
  assert.match(stylesCss, new RegExp(escapeRegex(selector)), `${selector} structural layout ownership should remain deferred in styles.css.`);
});

assertContains(
  componentsCss,
  "body[data-page=\"next-step\"] #pmi-income .pmi-reference-notice",
  "PMI reference notices should have a tokenized component owner."
);

console.log("theme-system-pmi-form-shell-token-consumption-check passed");
