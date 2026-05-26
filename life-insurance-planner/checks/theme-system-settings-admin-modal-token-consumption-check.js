const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractSection(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `${label} start should exist.`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `${label} end should exist after start.`);
  return source.slice(start, end);
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
  const block = extractBlock(source, selectorNeedle);
  requiredTokens.forEach((token) => {
    assert.match(
      block,
      new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `${selectorNeedle} should consume ${token}.`
    );
  });
  return block;
}

function assertNoRawColors(source, label) {
  assert.doesNotMatch(
    source,
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/,
    `${label} should not contain raw hex/rgb/hsl colors.`
  );
}

function assertNoLegacyColorVars(source, label) {
  assert.doesNotMatch(
    source,
    /var\(--(?:bg|surface|surface-alt|border|text|muted|accent|accent-strong|accent-soft|success|success-soft|warning|shadow)\)/,
    `${label} should not consume legacy color variables.`
  );
}

function getDiff(relativePath) {
  return execFileSync("git", ["diff", "--unified=0", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

const componentsCss = readRepoFile("components.css");
const layoutCss = readRepoFile("layout.css");
const stylesCss = readRepoFile("styles.css");

const settingsAdminSection = extractSection(
  componentsCss,
  ".settings-hero-badge",
  ".entry-mode-panel",
  "Settings/Admin component section"
);
const sharedModalSection = extractSection(
  componentsCss,
  ".lens-leave-modal",
  ".client-directory-filter-bar",
  "shared modal component section"
);
const assumptionControlsSection = extractSection(
  componentsCss,
  ".lens-assumption-controls-overlay",
  "@keyframes lens-assumption-controls-loading-spin",
  "assumption controls modal section"
);

assertNoRawColors(settingsAdminSection, "Settings/Admin component section");
assertNoRawColors(sharedModalSection, "shared modal component section");
assertNoRawColors(assumptionControlsSection, "assumption controls modal section");
assertNoLegacyColorVars(settingsAdminSection, "Settings/Admin component section");

assertSelectorConsumesTokens(componentsCss, ".settings-card", [
  "--m90-border",
  "--m90-surface-elevated",
  "--m90-shadow"
]);
assertSelectorConsumesTokens(componentsCss, ".settings-hero-copy h1", ["--m90-text-primary"]);
assertSelectorConsumesTokens(componentsCss, ".settings-switch-track", [
  "--m90-surface-secondary",
  "--m90-border"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-summary-card,\n.admin-accounts-panel", [
  "--m90-border",
  "--m90-surface-elevated",
  "--m90-shadow"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-account-card", [
  "--m90-border",
  "--m90-surface"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-tax-bracket-input", [
  "--m90-border",
  "--m90-surface",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-action-button", [
  "--m90-border",
  "--m90-surface",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-state-tax-toggle .admin-action-button.is-active", [
  "--m90-accent",
  "--m90-surface"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-household-expense-policy-control-group", [
  "--m90-border",
  "--m90-surface-secondary"
]);
assertSelectorConsumesTokens(componentsCss, ".admin-household-expense-policy-card-section", [
  "--m90-border",
  "--m90-surface"
]);
assertSelectorConsumesTokens(componentsCss, ".lens-leave-modal-backdrop", ["--m90-overlay"]);
assertSelectorConsumesTokens(componentsCss, ".lens-leave-modal-panel", [
  "--m90-surface-elevated",
  "--m90-border",
  "--m90-shadow"
]);
assertSelectorConsumesTokens(componentsCss, ".lens-manual-widget-panel", [
  "--m90-surface-elevated",
  "--m90-border",
  "--m90-shadow"
]);
assertSelectorConsumesTokens(componentsCss, ".lens-manual-widget-option {", [
  "--m90-border",
  "--m90-surface-secondary",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(componentsCss, ".lens-assumption-controls-overlay", ["--m90-overlay"]);
assertSelectorConsumesTokens(componentsCss, ".lens-assumption-controls-dialog", [
  "--m90-border",
  "--m90-surface-elevated",
  "--m90-shadow"
]);

assertSelectorConsumesTokens(layoutCss, ".admin-page", [
  "--m90-bg",
  "--m90-surface-secondary"
]);
assertSelectorConsumesTokens(
  layoutCss,
  "body.clients-page .workspace-side-nav-host[data-workspace-side-nav=\"directory\"] > .workspace-side-nav,\n  body.lens-page .workspace-side-nav-host[data-workspace-side-nav=\"lens\"] > .workspace-side-nav,\n  body.settings-page .workspace-side-nav-host[data-workspace-side-nav=\"settings\"] > .workspace-side-nav",
  ["--m90-text-primary"]
);
assertSelectorConsumesTokens(
  layoutCss,
  "body.clients-page .workspace-visible-pane,\n  body.lens-page .workspace-visible-pane,\n  body.settings-page .workspace-visible-pane",
  ["--m90-surface", "--m90-border", "--m90-shadow"]
);

assert.doesNotMatch(
  stylesCss,
  /\.lens-leave-modal(?:[\s\S]*?)\.lens-manual-widget-option:focus-visible\s*\{/,
  "shared modal visual ownership should not remain in styles.css."
);
assert.doesNotMatch(
  stylesCss,
  /\.admin-tax-bracket-list\s*\{[\s\S]*?background:/,
  "admin tax bracket list background should not remain in styles.css."
);
assert.doesNotMatch(
  stylesCss,
  /\.settings-hero[^{}]*\{[^{}]*(?:color|background|border|box-shadow):/,
  "settings visual colors should not be reintroduced in styles.css."
);

[
  "app/features/auth.js",
  "app/features/account-settings/household-expense-account-policy-admin-display.js",
  "app/features/account-settings/household-expense-account-policy-admin-editor.js",
  "app/features/lens-analysis/assumption-controls-launcher.js"
].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assertNoRawColors(source, relativePath);
});

[
  "components.css",
  "layout.css",
  "styles.css"
].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /\[data-theme=/,
    `${relativePath} should not add per-theme component overrides.`
  );
});

assert.doesNotMatch(
  getDiff("life-insurance-planner/pages/settings.html"),
  /./,
  "settings.html should remain unchanged in this CSS-only pass."
);
assert.doesNotMatch(
  getDiff("life-insurance-planner/pages/admin-accounts.html"),
  /./,
  "admin-accounts.html should remain unchanged in this CSS-only pass."
);

console.log("theme-system-settings-admin-modal-token-consumption-check passed");
