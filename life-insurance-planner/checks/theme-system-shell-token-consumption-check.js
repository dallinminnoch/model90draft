const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const layoutPath = path.join(repoRoot, "life-insurance-planner", "layout.css");
const componentsPath = path.join(repoRoot, "life-insurance-planner", "components.css");

const layoutSource = fs.readFileSync(layoutPath, "utf8");
const componentsSource = fs.readFileSync(componentsPath, "utf8");

function assertSelectorUses(source, selectorPattern, tokenNames, label) {
  const match = source.match(selectorPattern);
  assert.ok(match, `${label} selector block should exist.`);
  tokenNames.forEach((tokenName) => {
    assert.match(match[0], new RegExp(`var\\(${tokenName}\\)`), `${label} should consume ${tokenName}.`);
  });
  return match[0];
}

function assertSelectorAvoids(source, selectorPattern, legacyValues, label) {
  const block = assertSelectorUses(source, selectorPattern, [], label);
  legacyValues.forEach((legacyValue) => {
    assert.ok(!block.includes(legacyValue), `${label} should not retain ${legacyValue}.`);
  });
}

assert.match(layoutSource, /var\(--m90-bg\)/, "layout.css should consume the app background token.");
assert.match(layoutSource, /var\(--m90-surface\)/, "layout.css should consume the surface token.");
assert.match(componentsSource, /var\(--m90-surface\)/, "components.css should consume the surface token.");

assertSelectorUses(
  componentsSource,
  /\.workspace-side-nav\.workspace-side-nav-shell\s*\{[\s\S]*?\n\}/,
  ["--m90-sidebar-bg", "--m90-sidebar-text", "--m90-logo-accent"],
  "workspace side nav shell"
);
assert.match(componentsSource, /var\(--m90-sidebar-text-muted\)/, "sidebar flyout should consume muted sidebar text.");
assert.match(componentsSource, /var\(--m90-focus-ring\)/, "common focus states should consume the focus-ring token.");

assertSelectorUses(
  layoutSource,
  /body\.clients-page \.workspace-page-topbar,[\s\S]*?body\.settings-page \.workspace-page-topbar\s*\{[\s\S]*?\n\}/,
  ["--m90-surface"],
  "workspace topbar layout"
);

assertSelectorUses(
  componentsSource,
  /\.lens-workflow-trail\s*\{[\s\S]*?\n\}/,
  ["--m90-text-primary"],
  "topbar workflow trail"
);

assertSelectorUses(
  componentsSource,
  /\.settings-card\s*\{[\s\S]*?\n\}/,
  ["--m90-border", "--m90-surface-elevated", "--m90-shadow"],
  "common settings card"
);

assertSelectorUses(
  componentsSource,
  /\.workspace-page-menu-link:hover,[\s\S]*?\.workspace-page-menu-link\.is-active\s*\{[\s\S]*?\n\}/,
  ["--m90-accent-soft", "--m90-accent"],
  "common menu action state"
);

assertSelectorUses(
  componentsSource,
  /\.client-table-search-input\s*\{[\s\S]*?\n\}/,
  ["--m90-border", "--m90-surface", "--m90-text-primary"],
  "common client search input"
);

assertSelectorUses(
  componentsSource,
  /\.profile-search-modal-panel\s*\{[\s\S]*?\n\}/,
  ["--m90-surface-elevated", "--m90-border", "--m90-shadow"],
  "common modal panel"
);

assertSelectorAvoids(
  componentsSource,
  /\.workspace-side-nav\.workspace-side-nav-shell\s*\{[\s\S]*?\n\}/,
  ["#4338ca", "#ffffff", "#1f1a45", "rgba(67, 56, 202"],
  "workspace side nav shell"
);

assertSelectorAvoids(
  componentsSource,
  /\.client-table-search-input\s*\{[\s\S]*?\n\}/,
  ["rgba(213, 221, 232, 0.95)", "#ffffff", "#17202c"],
  "common client search input"
);

assertSelectorAvoids(
  componentsSource,
  /\.settings-card\s*\{[\s\S]*?\n\}/,
  ["rgba(214, 221, 231, 0.94)", "#ffffff", "#fbfcfe"],
  "common settings card"
);

const changedFiles = execSync("git diff --name-only", {
  cwd: repoRoot,
  encoding: "utf8"
})
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

assert.ok(
  !changedFiles.includes("life-insurance-planner/styles.css"),
  "styles.css should not be changed by the shell/common token migration pass."
);

console.log("theme-system-shell-token-consumption-check passed");
