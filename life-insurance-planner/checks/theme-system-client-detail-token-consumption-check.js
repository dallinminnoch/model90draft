const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
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
    /\[data-theme="(?:modern|classic|old-money|dark-soft|dark|carbon|high-tech|dusk|warm-professional)"\][^{]*(?:client-detail|client-profile|client-overview|client-activity|client-notes|client-policy|client-coverage)/,
    `${label} should not add per-theme Client Detail/Profile overrides.`
  );
}

function collectRelevantColorDebt(source, options = {}) {
  const relevantSelector =
    /client-(?:detail|profile|overview|activity|notes|policy|coverage|illustrations|checklist)|coverage-policy-manager|coverage-mode|premium-timeline/;
  const deferredSelector = /existing-coverage/;
  const hardcodedColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--(?:surface|text|accent|success|warning|bg)\)/g;
  const debt = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = blockPattern.exec(source))) {
    const selector = match[1].trim();
    if (!relevantSelector.test(selector)) {
      continue;
    }
    if (options.excludeExistingCoverage && deferredSelector.test(selector)) {
      continue;
    }

    const colors = match[2].match(hardcodedColorPattern) || [];
    if (colors.length) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      debt.push(`${line}: ${selector.replace(/\s+/g, " ").slice(0, 140)} -> ${[...new Set(colors)].join(", ")}`);
    }
  }

  return debt;
}

const componentsCss = readRepoFile("life-insurance-planner/components.css");
const layoutCss = readRepoFile("life-insurance-planner/layout.css");
const stylesCss = readRepoFile("life-insurance-planner/styles.css");
const clientDetailJs = readRepoFile("life-insurance-planner/client-detail.js");

assertNoPerThemeOverrides(componentsCss, "components.css");
assertNoPerThemeOverrides(layoutCss, "layout.css");
assertNoPerThemeOverrides(stylesCss, "styles.css");

assertSelectorUses(
  layoutCss,
  ".client-profile-shell {",
  ["--m90-border", "--m90-surface-secondary", "--m90-shadow"],
  "Client Detail profile shell frame"
);
assertSelectorUses(
  layoutCss,
  ".client-profile-viewer-header {",
  ["--m90-border", "--m90-surface"],
  "Client Detail profile viewer header"
);
assertSelectorUses(
  layoutCss,
  ".client-profile-workspace-section-copy h2 {",
  ["--m90-text-primary"],
  "Client Detail workspace section heading"
);

assertSelectorUses(
  componentsCss,
  ".client-profile-side-tabs {",
  ["--m90-surface-secondary", "--m90-border"],
  "Client Detail side tabs"
);
assertSelectorUses(
  componentsCss,
  ".client-profile-tab.is-active {",
  ["--m90-accent", "--m90-accent-soft"],
  "Client Detail active profile tab"
);
assertSelectorUses(
  componentsCss,
  ".client-profile-sidebar-name {",
  ["--m90-text-primary"],
  "Client Detail identity sidebar name"
);
assertSelectorUses(
  componentsCss,
  ".client-profile-sidebar-avatar.is-avatar-vivid,",
  ["--m90-accent", "--m90-surface"],
  "Client Detail vivid avatar token treatment"
);
assertSelectorUses(
  componentsCss,
  ".client-profile-sidebar-avatar.is-avatar-soft,",
  ["--m90-accent-soft", "--m90-text-primary", "--m90-border-soft"],
  "Client Detail soft avatar token treatment"
);
assertSelectorUses(
  componentsCss,
  ".client-profile-contact-item strong {",
  ["--m90-text-primary"],
  "Client Detail contact values"
);
assertSelectorUses(
  componentsCss,
  ".client-detail-stat-modal-panel {",
  ["--m90-border", "--m90-surface", "--m90-shadow"],
  "Client Detail stat modal surface"
);
assertSelectorUses(
  componentsCss,
  ".client-activity-overview-card,",
  ["--m90-surface"],
  "Client Detail activity overview card"
);
assertSelectorUses(
  componentsCss,
  ".client-activity-status-badge.is-risk {",
  ["--m90-warning-soft", "--m90-warning"],
  "Client Detail activity risk badge"
);
assertSelectorUses(
  componentsCss,
  ".client-policy-modal-panel {",
  ["--m90-border", "--m90-surface", "--m90-shadow"],
  "Client Detail policy modal surface"
);
assertSelectorUses(
  componentsCss,
  ".client-coverage-card-heading h2 {",
  ["--m90-text-primary"],
  "Client Detail coverage card heading"
);
assertSelectorUses(
  componentsCss,
  ".client-overview-close-index-segment.is-critical {",
  ["--m90-critical-soft"],
  "Client Detail Close Index critical gauge segment"
);
assertSelectorUses(
  componentsCss,
  ".client-overview-close-index-segment.is-warning {",
  ["--m90-warning-soft"],
  "Client Detail Close Index warning gauge segment"
);
assertSelectorUses(
  componentsCss,
  ".client-overview-close-index-segment.is-neutral {",
  ["--m90-neutral-soft"],
  "Client Detail Close Index neutral gauge segment"
);
assertSelectorUses(
  componentsCss,
  ".client-overview-close-index-segment.is-stable {",
  ["--m90-stable-soft"],
  "Client Detail Close Index stable gauge segment"
);
assertSelectorUses(
  componentsCss,
  ".coverage-policy-manager-panel {",
  ["--m90-border", "--m90-surface", "--m90-shadow"],
  "Client Detail embedded coverage policy manager panel"
);

const componentDebt = collectRelevantColorDebt(componentsCss);
const layoutDebt = collectRelevantColorDebt(layoutCss);
const legacyProfileDebt = collectRelevantColorDebt(stylesCss, { excludeExistingCoverage: true });

assert.deepEqual(
  componentDebt,
  [],
  ["components.css should not retain hardcoded Client Detail/Profile visual colors.", ...componentDebt].join("\n")
);
assert.deepEqual(
  layoutDebt,
  [],
  ["layout.css should not retain hardcoded Client Detail/Profile shell colors.", ...layoutDebt].join("\n")
);
assert.deepEqual(
  legacyProfileDebt,
  [],
  [
    "styles.css should not retain active hardcoded Client Detail/Profile visual colors after this neutralization pass.",
    ...legacyProfileDebt
  ].join("\n")
);

assert.ok(
  /existing-coverage/.test(stylesCss),
  "Existing Coverage manager legacy styling should remain deferred instead of being swept into this pass."
);

assert.doesNotMatch(
  clientDetailJs,
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/,
  "client-detail.js should not contain static hex/rgb profile colors after the visual bridge pass."
);
assert.doesNotMatch(
  clientDetailJs,
  /color:\s*["'`]|borderColor|boxShadow:\s*["'`]|--close-index-segment-fill:\$\{segment\.color\}|segment\.color/,
  "client-detail.js should not own static profile color, ring, or gauge segment values."
);
assert.match(
  clientDetailJs,
  /style:\s*`--client-avatar-bg:hsl\(/,
  "client-detail.js should retain only the intentional dynamic avatar hue seam."
);
assert.match(
  clientDetailJs,
  /style:\s*`--client-avatar-bg:linear-gradient\(135deg, hsl\(/,
  "client-detail.js should keep dynamic vivid avatar hue as a background custom property only."
);
assert.match(
  clientDetailJs,
  /CLOSE_INDEX_GAUGE_SEGMENTS[\s\S]*tone:\s*"critical"[\s\S]*tone:\s*"warning"[\s\S]*tone:\s*"neutral"[\s\S]*tone:\s*"stable"/,
  "Close Index gauge segments should use semantic tone keys."
);
assert.match(
  clientDetailJs,
  /getAccountMilestones[\s\S]*tone:\s*"stable"[\s\S]*tone:\s*"warning"[\s\S]*tone:\s*"accent"[\s\S]*tone:\s*"neutral"[\s\S]*tone:\s*"critical"/,
  "Client Detail account milestones should use semantic tone keys instead of static colors."
);

console.log("theme-system-client-detail-token-consumption-check passed");
