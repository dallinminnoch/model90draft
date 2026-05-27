#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "m");
  const match = source.match(pattern);
  assert.ok(match, `Expected CSS rule for ${selector}.`);
  return match[1];
}

function assertDeclaration(ruleBody, declarationPattern, message) {
  assert.match(ruleBody, declarationPattern, message);
}

function getChangedFiles() {
  const output = execSync("git diff --name-only --", {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function getDiffFor(relativePath) {
  return execSync(`git diff -- ${relativePath}`, {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

const layoutSource = readRepoFile("layout.css");
const componentsSource = readRepoFile("components.css");

const workspaceShellRule = getRule(
  layoutSource,
  'body[data-step="income-impact"] .income-impact-workspace-shell'
);
assertDeclaration(
  workspaceShellRule,
  /grid-template-columns:\s*var\(--income-impact-rail-collapsed-width\)\s+minmax\(0,\s*1fr\)\s+var\(--income-impact-rail-collapsed-width\);/,
  "Income Impact workspace shell should keep a shrinkable center grid column."
);

const contentStackRule = getRule(
  layoutSource,
  'body[data-step="income-impact"] .income-impact-content-stack'
);
assertDeclaration(
  contentStackRule,
  /min-width:\s*0;/,
  "Income Impact content stack should retain min-width: 0."
);

const contentSectionRule = getRule(
  layoutSource,
  'body[data-step="income-impact"] .income-impact-content-stack > .income-impact-section'
);
assertDeclaration(
  contentSectionRule,
  /min-width:\s*0;/,
  "Income Impact center scroll body should have min-width: 0."
);
assertDeclaration(
  contentSectionRule,
  /box-sizing:\s*border-box;/,
  "Income Impact center scroll body should use border-box sizing."
);
assertDeclaration(
  contentSectionRule,
  /overflow-x:\s*hidden;/,
  "Income Impact center scroll body should preserve existing x-overflow behavior."
);
assertDeclaration(
  contentSectionRule,
  /overflow-y:\s*auto;/,
  "Income Impact center scroll body should preserve existing y-scroll behavior."
);

const incomeImpactLayoutRule = getRule(componentsSource, ".income-impact-layout");
assertDeclaration(
  incomeImpactLayoutRule,
  /width:\s*100%;/,
  "Income Impact layout wrapper should retain width: 100%."
);
assertDeclaration(
  incomeImpactLayoutRule,
  /max-width:\s*100%;/,
  "Income Impact layout wrapper should retain max-width: 100%."
);
assertDeclaration(
  incomeImpactLayoutRule,
  /min-width:\s*0;/,
  "Income Impact layout wrapper should have min-width: 0."
);

const changedFiles = getChangedFiles();
const forbiddenTouchedPatterns = [
  /income-impact-timeline-graph-model\.js/,
  /income-loss-impact-display\.js/,
  /income-impact-scenario-composer-calculations\.js/,
  /household-wealth-projection-calculations\.js/,
  /savings-resource-allocation-adapter\.js/,
  /coverage-timeline-engine\.js/,
  /coverage-timeline-existing-coverage-adapter\.js/,
  /coverage-timeline-hypothetical-policy-layer-helper\.js/
];
forbiddenTouchedPatterns.forEach((pattern) => {
  assert.ok(
    !changedFiles.some((file) => pattern.test(file)),
    `Forbidden file changed: ${pattern}`
  );
});

const componentsDiff = getDiffFor("life-insurance-planner/components.css");
assert.doesNotMatch(
  componentsDiff,
  /\.income-impact-milestone-strip/,
  "This pass should not change .income-impact-milestone-strip."
);
assert.doesNotMatch(
  componentsDiff,
  /\.income-impact-graph-svg/,
  "This pass should not change .income-impact-graph-svg."
);

console.log("income-impact-main-content-shrink-contract-check passed");
