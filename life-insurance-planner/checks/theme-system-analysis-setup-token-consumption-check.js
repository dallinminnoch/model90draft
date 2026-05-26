const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `${startNeedle} should exist.`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `${endNeedle} should exist after ${startNeedle}.`);
  return source.slice(start, end);
}

function assertSelectorConsumesTokens(section, selectorNeedle, requiredTokens) {
  const escapedSelector = selectorNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const selectorMatch = section.match(new RegExp(`(^|\\n)${escapedSelector}\\s*\\{`));
  assert.ok(selectorMatch, `${selectorNeedle} should exist in Analysis Setup CSS.`);
  const selectorIndex = selectorMatch.index + selectorMatch[1].length;
  const blockStart = section.indexOf("{", selectorIndex);
  const blockEnd = section.indexOf("}", blockStart);
  assert.ok(blockStart > selectorIndex && blockEnd > blockStart, `${selectorNeedle} should have a CSS block.`);
  const block = section.slice(blockStart, blockEnd);
  requiredTokens.forEach(function (token) {
    assert.match(block, new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${selectorNeedle} should consume ${token}.`);
  });
}

function getDiff(relativePath) {
  return execFileSync("git", ["diff", "--unified=0", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

const componentsCss = readRepoFile("components.css");
const stylesCss = readRepoFile("styles.css");
const analysisSetupJs = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const analysisSetupSection = extractSection(
  componentsCss,
  ".analysis-setup-eyebrow,",
  ".analysis-estimate-eyebrow"
);

const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/;
const legacyVarPattern =
  /var\(--(?:bg|surface|surface-alt|border|text|muted|accent|accent-strong|accent-soft|success|success-soft|warning|shadow)\)/;
const namedColorDeclarationPattern =
  /(?:color|background|background-color|border-color|fill|stroke|box-shadow|text-shadow)\s*:\s*(?:black|white|red|green|blue|orange|purple|gray|grey)\b/i;

assert.doesNotMatch(
  analysisSetupSection,
  rawColorPattern,
  "Analysis Setup component CSS should not keep raw hex/rgb/hsl colors after token migration."
);
assert.doesNotMatch(
  analysisSetupSection,
  legacyVarPattern,
  "Analysis Setup component CSS should use --m90-* tokens, not legacy theme variables."
);
assert.doesNotMatch(
  analysisSetupSection,
  namedColorDeclarationPattern,
  "Analysis Setup component CSS should not use named color declarations."
);
assert.doesNotMatch(
  analysisSetupSection,
  /\[data-theme=/,
  "Analysis Setup migration should not create per-theme component overrides."
);

assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-entry-screen", [
  "--m90-surface",
  "--m90-border",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".lens-assumptions-overlay", [
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".lens-assumptions-dialog", [
  "--m90-bg",
  "--m90-border",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-assumption-panel", [
  "--m90-bg",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-view-nav", [
  "--m90-bg",
  "--m90-border",
  "--m90-text-muted"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-control-group", [
  "--m90-surface",
  "--m90-border",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-rate-slider", [
  "--m90-accent",
  "--m90-surface-secondary"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-asset-growth-slider", [
  "--m90-accent-hover",
  "--m90-accent-soft"
]);
assertSelectorConsumesTokens(analysisSetupSection, ".analysis-setup-action[data-analysis-setup-apply]", [
  "--m90-accent",
  "--m90-surface"
]);

[
  /data-readiness-tone="info"[\s\S]*?--m90-neutral/,
  /data-readiness-tone="warning"[\s\S]*?--m90-warning/,
  /data-readiness-tone="blocking"[\s\S]*?--m90-critical/,
  /data-tone="error"[\s\S]*?--m90-critical/,
  /data-tone="success"[\s\S]*?--m90-stable/,
  /data-tone="neutral"[\s\S]*?--m90-neutral/
].forEach(function (pattern) {
  assert.match(analysisSetupSection, pattern, `Expected semantic token mapping for ${pattern}.`);
});

assert.doesNotMatch(
  analysisSetupJs,
  rawColorPattern,
  "analysis-setup.js should remain free of static UI color literals."
);
assert.match(
  analysisSetupJs,
  /slider\.style\.setProperty\("--analysis-setup-slider-progress", `\$\{progressPercent\}%`\)/,
  "Slider JS should keep setting only progress percentages."
);

const componentsDiff = getDiff("life-insurance-planner/components.css");
assert.doesNotMatch(
  componentsDiff,
  /^[+-].*(analysis-estimate|analysis-result|step-three)/m,
  "This pass should not migrate Step 3/result selectors."
);
assert.equal(
  getDiff("life-insurance-planner/styles.css").trim(),
  "",
  "styles.css should remain untouched unless proven legacy interference is neutralized."
);
assert.match(
  stylesCss,
  /input:not\([^{}]+\.analysis-setup-rate-slider[^{}]+\.analysis-setup-card-input[^{}]+\)/s,
  "Legacy broad form controls should still explicitly exclude Analysis Setup controls until a separate legacy cleanup pass."
);

console.log("theme-system-analysis-setup-token-consumption-check passed");
