const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getExactRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(^|\\n)${escapedSelector}\\s*\\{`));
  assert.ok(match, `${selector} should exist.`);
  const selectorIndex = match.index + match[1].length;
  const blockStart = source.indexOf("{", selectorIndex);
  const blockEnd = source.indexOf("}", blockStart);
  assert.ok(blockStart > selectorIndex && blockEnd > blockStart, `${selector} should have a rule block.`);
  return source.slice(selectorIndex, blockEnd + 1);
}

function getDiff(relativePath) {
  return execFileSync("git", ["diff", "--unified=0", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function assertUsesTokens(rule, tokens, selector) {
  tokens.forEach(function (token) {
    assert.match(
      rule,
      new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `${selector} should consume ${token}.`
    );
  });
}

const componentsCss = readRepoFile("components.css");
const stylesCssDiff = getDiff("life-insurance-planner/styles.css");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
const simpleNeedsDisplaySource = readRepoFile("app/features/lens-analysis/simple-needs-results-display.js");

const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/;
const legacyVarPattern =
  /var\(--(?:bg|surface|surface-alt|border|text|muted|accent|accent-strong|accent-soft|success|success-soft|warning|shadow)\)/;
const namedColorDeclarationPattern =
  /(?:color|background|background-color|border-color|fill|stroke|box-shadow|text-shadow)\s*:\s*(?:black|white|red|green|blue|orange|purple|gray|grey)\b/i;

const resultRules = [
  ".analysis-estimate-eyebrow",
  ".analysis-result-card",
  ".analysis-result-eyebrow",
  ".analysis-result-value",
  ".analysis-result-copy",
  ".analysis-result-list li",
  ".analysis-result-list span",
  ".analysis-result-list strong",
  ".analysis-result-card details",
  ".analysis-result-card summary"
].map(function (selector) {
  return [selector, getExactRule(componentsCss, selector)];
});

resultRules.forEach(function ([selector, rule]) {
  assert.doesNotMatch(rule, rawColorPattern, `${selector} should not use raw hex/rgb/hsl colors.`);
  assert.doesNotMatch(rule, legacyVarPattern, `${selector} should not use legacy theme variables.`);
  assert.doesNotMatch(rule, namedColorDeclarationPattern, `${selector} should not use named color declarations.`);
  assert.doesNotMatch(rule, /\[data-theme=/, `${selector} should not add per-theme overrides.`);
});

assertUsesTokens(getExactRule(componentsCss, ".analysis-estimate-eyebrow"), ["--m90-accent"], ".analysis-estimate-eyebrow");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-card"), ["--m90-border", "--m90-surface"], ".analysis-result-card");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-eyebrow"), ["--m90-accent"], ".analysis-result-eyebrow");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-value"), ["--m90-text-primary"], ".analysis-result-value");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-copy"), ["--m90-text-secondary"], ".analysis-result-copy");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-list li"), ["--m90-border-soft"], ".analysis-result-list li");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-list span"), ["--m90-text-secondary"], ".analysis-result-list span");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-list strong"), ["--m90-text-primary"], ".analysis-result-list strong");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-card details"), ["--m90-border-soft"], ".analysis-result-card details");
assertUsesTokens(getExactRule(componentsCss, ".analysis-result-card summary"), ["--m90-text-secondary"], ".analysis-result-card summary");

assert.doesNotMatch(
  stepThreeDisplaySource,
  rawColorPattern,
  "step-three-analysis-display.js should remain free of static UI color literals."
);
assert.doesNotMatch(
  simpleNeedsDisplaySource,
  rawColorPattern,
  "simple-needs-results-display.js should remain free of static UI color literals."
);

const componentsDiff = getDiff("life-insurance-planner/components.css");
assert.doesNotMatch(
  componentsDiff,
  /^[+-].*analysis-setup/m,
  "This pass should not migrate Analysis Setup selectors."
);
assert.equal(stylesCssDiff.trim(), "", "styles.css should remain untouched for Step 3/results migration.");

console.log("theme-system-step-three-token-consumption-check passed");
