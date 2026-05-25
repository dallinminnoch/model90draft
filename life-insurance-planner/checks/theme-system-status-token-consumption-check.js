const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const componentsPath = path.join(repoRoot, "life-insurance-planner", "components.css");
const componentsSource = fs.readFileSync(componentsPath, "utf8");

function blockFor(selectorPattern, label) {
  const match = componentsSource.match(selectorPattern);
  assert.ok(match, `${label} selector block should exist.`);
  return match[0];
}

function assertUses(selectorPattern, tokenNames, label) {
  const block = blockFor(selectorPattern, label);
  tokenNames.forEach((tokenName) => {
    assert.match(block, new RegExp(`var\\(${tokenName}\\)`), `${label} should consume ${tokenName}.`);
  });
  return block;
}

function assertAvoids(selectorPattern, legacyValues, label) {
  const block = blockFor(selectorPattern, label);
  legacyValues.forEach((legacyValue) => {
    assert.ok(!block.includes(legacyValue), `${label} should not retain ${legacyValue}.`);
  });
}

assertUses(/\.admin-status-badge\.is-active\s*\{[\s\S]*?\n\}/, ["--m90-stable-soft", "--m90-stable"], "admin active badge");
assertUses(/\.admin-status-badge\.is-disabled\s*\{[\s\S]*?\n\}/, ["--m90-critical-soft", "--m90-critical"], "admin disabled badge");
assertUses(/\.admin-action-button\.is-danger\s*\{[\s\S]*?\n\}/, ["--m90-critical-soft", "--m90-critical"], "admin danger button");

assertUses(
  /(?:^|\n)\.client-directory-summary-badge\[data-tone="positive"\]\s*\{[\s\S]*?\n\}/,
  ["--m90-stable-soft", "--m90-stable"],
  "client directory positive summary badge"
);
assertUses(
  /(?:^|\n)\.client-directory-summary-badge\[data-tone="warning"\]\s*\{[\s\S]*?\n\}/,
  ["--m90-warning-soft", "--m90-warning"],
  "client directory warning summary badge"
);
assertUses(
  /(?:^|\n)\.client-directory-summary-badge\[data-tone="neutral"\]\s*\{[\s\S]*?\n\}/,
  ["--m90-neutral-soft", "--m90-neutral"],
  "client directory neutral summary badge"
);

assertUses(/\.priority-pill\.client-priority-button-low\s*\{[\s\S]*?\n\}/, ["--m90-stable-soft", "--m90-stable"], "low priority pill");
assertUses(/\.priority-pill\.client-priority-button-medium\s*\{[\s\S]*?\n\}/, ["--m90-warning-soft", "--m90-warning"], "medium priority pill");
assertUses(/\.priority-pill\.client-priority-button-high\s*\{[\s\S]*?\n\}/, ["--m90-critical-soft", "--m90-critical"], "high priority pill");
assertUses(/\.priority-pill\.client-priority-button-unset\s*\{[\s\S]*?\n\}/, ["--m90-neutral-soft", "--m90-neutral"], "unset priority pill");

assertUses(/\.client-table-cell-stage-days-text\.is-warning\s*\{[\s\S]*?\n\}/, ["--m90-warning"], "warning stage-days label");
assertUses(/\.client-table-cell-stage-days-text\.is-danger\s*\{[\s\S]*?\n\}/, ["--m90-critical"], "danger stage-days label");
assertUses(/\.client-tag-success\s*\{[\s\S]*?\n\}/, ["--m90-stable-soft", "--m90-stable"], "client success tag");

assertUses(/\.client-close-index-display\.is-caution\s*\{[\s\S]*?\n\}/, ["--m90-warning-soft", "--m90-warning"], "close-index caution display");
assertUses(/\.client-close-index-display\.is-risk\s*\{[\s\S]*?\n\}/, ["--m90-critical-soft", "--m90-critical"], "close-index risk display");
assertUses(/\.opportunity-score-pill\.is-risk\s*\{[\s\S]*?\n\}/, ["--m90-critical-soft", "--m90-critical"], "risk opportunity pill");

assertUses(/\.client-policy-modal-status-chip\.is-active \.client-policy-modal-status-dot\s*\{[\s\S]*?\n\}/, ["--m90-stable"], "active policy status dot");
assertUses(/\.client-policy-modal-status-chip\.is-pending \.client-policy-modal-status-dot\s*\{[\s\S]*?\n\}/, ["--m90-neutral"], "pending policy status dot");
assertUses(/\.client-policy-document-menu-item\.is-danger\s*\{[\s\S]*?\n\}/, ["--m90-critical"], "policy danger menu item");

assertUses(
  /\.income-impact-risk-severity\[data-income-impact-risk-severity-label="critical"\]\s*\{[\s\S]*?\n\}/,
  ["--m90-critical-soft", "--m90-critical"],
  "Income Impact critical risk label"
);
assertUses(
  /\.income-impact-risk-severity\[data-income-impact-risk-severity-label="at-risk"\]\s*\{[\s\S]*?\n\}/,
  ["--m90-warning-soft", "--m90-warning"],
  "Income Impact at-risk label"
);

[
  [/\.admin-status-badge\.is-active\s*\{[\s\S]*?\n\}/, ["rgba(205, 231, 214", "#244a36"], "admin active badge"],
  [/\.priority-pill\.client-priority-button-high\s*\{[\s\S]*?\n\}/, ["#efc8c8", "#8c2323", "rgba(184, 52, 52"], "high priority pill"],
  [/(?:^|\n)\.client-directory-summary-badge\[data-tone="warning"\]\s*\{[\s\S]*?\n\}/, ["#fff0bf", "#9e5508"], "client directory warning summary badge"],
  [/\.client-close-index-display\.is-risk\s*\{[\s\S]*?\n\}/, ["rgba(239, 68, 68", "#b91c1c"], "close-index risk display"],
  [/\.income-impact-risk-severity\[data-income-impact-risk-severity-label="critical"\]\s*\{[\s\S]*?\n\}/, ["#fff1f0", "#b42318"], "Income Impact critical risk label"]
].forEach(([selectorPattern, legacyValues, label]) => {
  assertAvoids(selectorPattern, legacyValues, label);
});

const milestoneCriticalBlock = blockFor(
  /\.income-impact-milestone-step--tone-critical\s*\{[\s\S]*?\n\}/,
  "Income Impact critical milestone tone"
);
assert.match(
  milestoneCriticalBlock,
  /var\(--m90-critical-soft\)[\s\S]*var\(--m90-critical\)/,
  "Income Impact critical milestone tones should consume critical status tokens."
);

const milestoneWarningBlock = blockFor(
  /\.income-impact-milestone-step--tone-atRisk,[\s\S]*?\.income-impact-milestone-step--tone-caution\s*\{[\s\S]*?\n\}/,
  "Income Impact warning milestone tone"
);
assert.match(
  milestoneWarningBlock,
  /var\(--m90-warning-soft\)[\s\S]*var\(--m90-warning\)/,
  "Income Impact caution and at-risk milestone tones should consume warning status tokens."
);

const milestoneStableBlock = blockFor(
  /\.income-impact-milestone-step--tone-stable\s*\{[\s\S]*?\n\}/,
  "Income Impact stable milestone tone"
);
assert.match(
  milestoneStableBlock,
  /var\(--m90-stable-soft\)[\s\S]*var\(--m90-stable\)/,
  "Income Impact stable milestone tones should consume stable status tokens."
);

const milestoneUnknownBlock = blockFor(
  /\.income-impact-milestone-step--tone-unknown\s*\{[\s\S]*?\n\}/,
  "Income Impact unknown milestone tone"
);
assert.match(
  milestoneUnknownBlock,
  /var\(--m90-neutral-soft\)[\s\S]*var\(--m90-neutral\)/,
  "Income Impact unknown milestone tones should consume neutral status tokens."
);

const chartPhaseGraphMarkerBlock = blockFor(
  /\.income-impact-graph-markers \[data-income-impact-graph-marker-kind="risk"\]\[data-income-impact-graph-marker-severity="critical"\] circle\s*\{[\s\S]*?\n\}/,
  "Income Impact graph marker tone"
);
assert.match(
  chartPhaseGraphMarkerBlock,
  /var\(--m90-critical-soft\)[\s\S]*var\(--m90-critical\)/,
  "Income Impact graph marker colors should use status tokens after the chart/SVG token bridge phase."
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
  "styles.css should not be changed by the status semantic token migration pass."
);

console.log("theme-system-status-token-consumption-check passed");
