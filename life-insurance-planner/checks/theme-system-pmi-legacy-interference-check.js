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

function parseRuleSelectors(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  const pattern = /([^{}]+)\{/g;
  let match;

  while ((match = pattern.exec(withoutComments))) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("@")) {
      continue;
    }
    raw.split(",").forEach((selector) => {
      const trimmed = selector.trim();
      if (trimmed) {
        selectors.push(trimmed);
      }
    });
  }

  return selectors;
}

const stylesCss = readRepoFile("styles.css");
const componentsCss = readRepoFile("components.css");
const layoutCss = readRepoFile("layout.css");
const selectors = parseRuleSelectors(stylesCss);
const canonicalPmiExclusion = 'body:not([data-page="next-step"])';

const bannedExactNextStepSelectors = selectors.filter((selector) =>
  selector.includes('[data-page="next-step"]') && !selector.includes(canonicalPmiExclusion)
);
assert.deepEqual(
  bannedExactNextStepSelectors,
  [],
  "styles.css should not retain active canonical next-step PMI selectors."
);

const legacyPmiSelectorPatterns = [
  /^\s*\.profile-creation-form(?:[\s.#:[>]|$)/,
  /^\s*\.profile-form-section(?:[\s.#:[>]|$)/,
  /^\s*\.profile-form-section-heading(?:[\s.#:[>]|$)/,
  /^\s*\.profile-form-section-group(?:[\s.#:[>]|$)/,
  /^\s*\.profile-section-note(?:[\s.#:[>]|$)/,
  /^\s*\.profile-state-field(?:[\s.#:[>]|$)/,
  /^\s*\.profile-state-select-shell(?:[\s.#:[>]|$)/,
  /^\s*\.profile-state-select-value(?:[\s.#:[>]|$)/,
  /^\s*\.profile-currency-field(?:[\s.#:[>]|$)/,
  /^\s*\.profile-currency-suffix(?:[\s.#:[>]|$)/,
  /^\s*\.profile-inline-unit(?:[\s.#:[>]|$)/,
  /^\s*\.profile-inline-unit-field(?:[\s.#:[>]|$)/,
  /^\s*\.profile-small-number-field(?:[\s.#:[>]|$)/,
  /^\s*\.profile-yes-no-field(?:[\s.#:[>]|$)/,
  /^\s*\.profile-education-funding-field(?:[\s.#:[>]|$)/,
  /^\s*\.profile-form-toggle-group(?:[\s.#:[>]|$)/,
  /^\s*\.profile-form-toggle-button(?:[\s.#:[>]|$)/,
  /^\s*\.pmi-education-grid(?:[\s.#:[>]|$)/,
  /^\s*\.income-calculation-circle(?:[\s.#:[>]|$)/,
  /^\s*\.income-calculation-circle-row(?:[\s.#:[>]|$)/,
  /^\s*\.net-income-action(?:[\s.#:[>]|$)/,
  /^\s*\.form-grid(?:[\s.#:[>]|$)/,
  /^\s*\.field-group(?:[\s.#:[>]|$)/,
  /^\s*input:not\(/,
  /^\s*select:not\(/,
  /^\s*textarea:not\(/
];

const unscopedLegacyPmiSelectors = selectors.filter((selector) => {
  if (selector.includes(canonicalPmiExclusion)) {
    return false;
  }
  if (/^\s*\.(auth-form|underwriting-nicotine-grid)\b/.test(selector)) {
    return false;
  }
  if (/^\s*body\[data-page="(?:preliminary-linked|protection-modeling-linked|existing-coverage-linked|protection-modeling-inputs)"\]/.test(selector)) {
    return false;
  }
  return legacyPmiSelectorPatterns.some((pattern) => pattern.test(selector));
});

assert.deepEqual(
  unscopedLegacyPmiSelectors,
  [],
  "styles.css legacy selectors that match canonical PMI should be narrowed away from next-step."
);

[
  "body:not([data-page=\"next-step\"]) .profile-form-section {",
  "body:not([data-page=\"next-step\"]) .profile-form-toggle-button {",
  "body:not([data-page=\"next-step\"]) .profile-state-select-shell::after {",
  "body:not([data-page=\"next-step\"]) .profile-currency-suffix {",
  "body:not([data-page=\"next-step\"]) .pmi-education-grid .profile-currency-suffix {",
  "body:not([data-page=\"next-step\"]) .profile-creation-form .income-calculation-grid .primary-net-income-group input[readonly],",
  "body:not([data-page=\"next-step\"]) .net-income-action {",
  "body:not([data-page=\"next-step\"]) input:not(.client-table-search-input)"
].forEach((snippet) => {
  assertContains(stylesCss, snippet, `styles.css should preserve noncanonical legacy styling with next-step excluded: ${snippet}`);
});

assertSelectorUses(
  componentsCss,
  'body[data-page="next-step"] .pmi-form-main .profile-form-section {',
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface);", "box-shadow: var(--m90-shadow);"],
  "canonical PMI form cards should still have component ownership"
);
assertSelectorUses(
  componentsCss,
  'body[data-page="next-step"] .pmi-form-main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),',
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface-secondary);", "color: var(--m90-text-primary);"],
  "canonical PMI controls should still have component ownership"
);
assertSelectorUses(
  componentsCss,
  'body[data-page="next-step"] .pmi-form-main .profile-form-toggle-button,',
  ["border: 1px solid var(--m90-border);", "background: var(--m90-surface-secondary);", "color: var(--m90-text-secondary);"],
  "canonical PMI toggles should still have component ownership"
);
assertSelectorUses(
  layoutCss,
  'body[data-page="next-step"] .pmi-form-main .form-grid,',
  ["grid-template-columns: repeat(6, minmax(0, 1fr));", "gap: 12px 16px;"],
  "canonical PMI form grid should still have layout ownership"
);
assertSelectorUses(
  layoutCss,
  'body[data-page="next-step"] .pmi-form-main .field-group.is-hidden {',
  ["display: none;"],
  "canonical PMI hidden field state should live in layout.css"
);
assert.match(
  layoutCss,
  new RegExp(escapeRegex('body[data-page="next-step"] #pmi-income .primary-net-income-group')),
  "canonical PMI income result layout should still live in layout.css."
);

console.log("theme-system-pmi-legacy-interference-check passed");
