const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBlock(source, selectorNeedle) {
  const start = source.indexOf(selectorNeedle);
  assert.ok(start >= 0, `${selectorNeedle} should exist.`);
  const open = source.indexOf("{", start);
  assert.ok(open > start, `${selectorNeedle} should have a block start.`);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`${selectorNeedle} should have a block end.`);
}

function assertSelectorConsumesTokens(source, selectorNeedle, requiredTokens) {
  let searchStart = 0;
  const matchingBlocks = [];

  while (searchStart < source.length) {
    const selectorStart = source.indexOf(selectorNeedle, searchStart);
    if (selectorStart < 0) {
      break;
    }

    const block = extractBlock(source.slice(selectorStart), selectorNeedle);
    matchingBlocks.push(block);
    searchStart = selectorStart + selectorNeedle.length;
  }

  assert.ok(matchingBlocks.length > 0, `${selectorNeedle} should exist.`);

  const matchingBlock = matchingBlocks.find((block) =>
    requiredTokens.every((token) => new RegExp(`var\\(${escapeRegExp(token)}`).test(block))
  );

  assert.ok(
    matchingBlock,
    `${selectorNeedle} should consume ${requiredTokens.join(", ")}.`
  );

  return matchingBlock;
}

function assertNoRawColors(source, label) {
  assert.doesNotMatch(
    source,
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/,
    `${label} should not contain raw hex/rgb/hsl colors.`
  );
}

const componentsCss = readRepoFile("components.css");
const stylesCss = readRepoFile("styles.css");

const workflowStepNavSectionStart = componentsCss.indexOf("/* Shared LENS workflow step navigation */");
assert.ok(workflowStepNavSectionStart >= 0, "workflow step nav component section should exist.");
const workflowStepNavSectionEnd = componentsCss.indexOf("body.lens-start-page .lens-start-intro .section-label", workflowStepNavSectionStart);
assert.ok(workflowStepNavSectionEnd > workflowStepNavSectionStart, "workflow step nav component section should end before lens start visuals.");
const workflowStepNavSection = componentsCss.slice(workflowStepNavSectionStart, workflowStepNavSectionEnd);

assertNoRawColors(workflowStepNavSection, "workflow step nav component section");

assertSelectorConsumesTokens(componentsCss, "body[data-step] .workflow-header", [
  "--m90-border"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-track::before", [
  "--m90-border"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-track::after", [
  "--m90-accent"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-number", [
  "--m90-border",
  "--m90-surface",
  "--m90-text-muted"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-title", [
  "--m90-text-muted"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-item.is-current .step-number", [
  "--m90-accent",
  "--m90-surface"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-item.is-current .step-title", [
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-item.is-complete .step-number", [
  "--m90-accent",
  "--m90-surface"
]);
assertSelectorConsumesTokens(componentsCss, "body[data-step] .step-item.is-complete .step-title", [
  "--m90-text-secondary"
]);

[
  "body[data-step] .workflow-header",
  "body[data-step] .step-track::before",
  "body[data-step] .step-track::after",
  "body[data-step] .step-number",
  "body[data-step] .step-title",
  "body[data-step] .step-item.is-current .step-number",
  "body[data-step] .step-item.is-current .step-title",
  "body[data-step] .step-item.is-complete .step-number",
  "body[data-step] .step-item.is-complete .step-title"
].forEach((selector) => {
  assert.equal(
    stylesCss.indexOf(`${selector} {`),
    -1,
    `${selector} visual ownership should not remain in styles.css.`
  );
});

assert.doesNotMatch(
  stylesCss,
  /body\[data-step\][^{]*(?:workflow-header|step-track|step-number|step-title)[^{]*\{[^}]*?(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/,
  "styles.css should not contain hardcoded colors for workflow step navigation selectors."
);

["components.css", "layout.css", "styles.css"].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /\[data-theme=/,
    `${relativePath} should not add per-theme component overrides.`
  );
});

console.log("theme-system-workflow-step-nav-token-consumption-check passed");
