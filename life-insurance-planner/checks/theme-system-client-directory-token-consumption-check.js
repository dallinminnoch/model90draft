const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const componentsPath = path.join(repoRoot, "life-insurance-planner", "components.css");
const layoutPath = path.join(repoRoot, "life-insurance-planner", "layout.css");
const clientDirectoryPath = path.join(repoRoot, "life-insurance-planner", "app", "features", "client-directory.js");

const componentsSource = fs.readFileSync(componentsPath, "utf8");
const layoutSource = fs.readFileSync(layoutPath, "utf8");
const clientDirectorySource = fs.readFileSync(clientDirectoryPath, "utf8");

function blockFor(source, selectorPattern, label) {
  const match = source.match(selectorPattern);
  assert.ok(match, `${label} selector block should exist.`);
  return match[0];
}

function assertUses(source, selectorPattern, tokenNames, label) {
  const block = blockFor(source, selectorPattern, label);
  tokenNames.forEach((tokenName) => {
    assert.match(block, new RegExp(`var\\(${tokenName}\\)`), `${label} should consume ${tokenName}.`);
  });
  return block;
}

function assertAvoids(source, selectorPattern, legacyValues, label) {
  const block = blockFor(source, selectorPattern, label);
  legacyValues.forEach((legacyValue) => {
    assert.ok(!block.includes(legacyValue), `${label} should not retain ${legacyValue}.`);
  });
}

assertUses(
  layoutSource,
  /body\.clients-page \.client-directory-workspace\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-surface"],
  "Client Directory workspace layout"
);

assertUses(
  componentsSource,
  /body\.clients-page\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-bg", "--m90-border-soft", "--m90-shadow"],
  "Client Directory page tokens"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-shell-layout\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-surface-secondary"],
  "Client Directory shell layout surface"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-main\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-bg", "--m90-surface-secondary", "--m90-accent"],
  "Client Directory main surface"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-menu-column\.workspace-side-nav-shell \.workspace-side-nav-context\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-surface", "--m90-border"],
  "Client Directory views and filters context"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-header\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border-soft", "--m90-surface"],
  "Client Directory fixed header"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-summary-card\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border", "--m90-surface", "--m90-accent"],
  "Client Directory summary cards"
);
assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-summary-card:hover\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border", "--m90-shadow"],
  "Client Directory summary card hover"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-table-search-input\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border-soft", "--m90-surface", "--m90-text-primary"],
  "Client Directory search input"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-toolbar-actions \.client-header-action,[\s\S]*?body\.clients-page \.client-directory-toolbar-actions \.client-toolbar-button\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border-soft", "--m90-surface", "--m90-text-secondary"],
  "Client Directory toolbar buttons"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-toolbar-actions \.client-header-action-primary\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-accent", "--m90-surface"],
  "Client Directory primary action"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-rail-button\.is-active\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-accent", "--m90-surface"],
  "Client Directory alphabet selected state"
);

assertUses(
  componentsSource,
  /body\.clients-page \.directory-list-row:hover,[\s\S]*?body\.clients-page \.directory-list-row:focus-visible\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-surface"],
  "Client Directory row hover state"
);

assertUses(
  componentsSource,
  /body\.clients-page \.directory-list-row \.client-table-cell\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-text-primary"],
  "Client Directory row text"
);

assertUses(
  componentsSource,
  /body\.clients-page \.client-directory-notification-panel\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-surface", "--m90-text-primary"],
  "Client Directory schedule and alerts panel"
);

assertUses(
  componentsSource,
  /\.directory-menu__panel\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border", "--m90-surface", "--m90-shadow"],
  "Client Directory command menu panel"
);

assertUses(
  componentsSource,
  /\.client-directory-accessibility-panel,[\s\S]*?\.client-directory-summary-customize-panel\s*\{[\s\S]*?\n\s*\}/,
  ["--m90-border", "--m90-surface", "--m90-surface-elevated", "--m90-shadow"],
  "Client Directory modal panels"
);

assertAvoids(
  componentsSource,
  /body\.clients-page \.client-directory-summary-card\s*\{[\s\S]*?\n\s*\}/,
  ["#ffffff", "#e5e7eb", "#2563eb", "rgba(0, 0, 0"],
  "Client Directory summary cards"
);

assertAvoids(
  componentsSource,
  /body\.clients-page \.directory-list-row:hover,[\s\S]*?body\.clients-page \.directory-list-row:focus-visible\s*\{[\s\S]*?\n\s*\}/,
  ["#ffffff"],
  "Client Directory row hover state"
);

assertAvoids(
  componentsSource,
  /body\.clients-page \.client-directory-notification-panel\s*\{[\s\S]*?\n\s*\}/,
  ["#ffffff", "#111827"],
  "Client Directory schedule and alerts panel"
);

assert.doesNotMatch(
  componentsSource,
  /\[data-theme="(?:modern|classic|old-money|dark-soft|dark|carbon|high-tech|dusk|warm-professional)"\]\s+\.client-directory/,
  "Client Directory token migration should not add per-theme override selectors."
);

assert.match(
  clientDirectorySource,
  /background:\s*`hsl\(/,
  "Client Directory JS should keep dynamic avatar fill logic classified instead of adding fixed UI colors."
);
assert.match(
  clientDirectorySource,
  /printWindow\.document\.write/,
  "Client Directory print/export colors should remain isolated to export markup."
);

const changedFiles = execSync("git diff --name-only HEAD --", {
  cwd: repoRoot,
  encoding: "utf8"
})
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

if (changedFiles.includes("life-insurance-planner/styles.css")) {
  const stylesDiff = execSync("git diff --unified=0 HEAD -- life-insurance-planner/styles.css", {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const disallowedDirectoryLines = stylesDiff
    .split(/\r?\n/)
    .filter(function (line) {
      return /^\+[^+\n]*(?:clients-page|client-directory|directory-list|client-table)/.test(line)
        && !/^\+input:not\(\.client-table-search-input\):not\(\.client-activity-input\):not\(\.client-coverage-suggest-input\):/.test(line);
    });
  assert.deepEqual(
    disallowedDirectoryLines,
    [],
    [
      "styles.css changes should not reintroduce Client Directory visual ownership.",
      ...disallowedDirectoryLines
    ].join("\n")
  );
}

console.log("theme-system-client-directory-token-consumption-check passed");
