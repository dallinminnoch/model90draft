const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} should exist.`);
  return fs.readFileSync(absolutePath, "utf8");
}

function assertMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function assertNoMatch(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

function collectIncomeImpactHardcodedColorSelectors(source) {
  const colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
  const blocks = source.match(/[^{}]+\{[^{}]*\}/g) || [];

  return blocks
    .map((block) => {
      const selector = block.slice(0, block.indexOf("{")).trim().replace(/\s+/g, " ");
      return {
        selector,
        colors: block.match(colorPattern) || []
      };
    })
    .filter((entry) => /income-impact|income-loss/.test(entry.selector) && entry.colors.length);
}

const componentsSource = readProjectFile("components.css");
const layoutSource = readProjectFile("layout.css");
const stylesSource = readProjectFile("styles.css");
const displaySource = readProjectFile("app/features/lens-analysis/income-loss-impact-display.js");

[
  [/body\[data-step="income-impact"\],[\s\S]*?scrollbar-color:\s*var\(--m90-border\) transparent;/, "Income Impact scrollbars should use theme border tokens"],
  [/body\[data-step="income-impact"\] \.income-impact-page-intro\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--m90-border-soft\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Income Impact intro surface should use tokens"],
  [/body\[data-step="income-impact"\] \.income-impact-page-intro h1\s*\{[\s\S]*?color:\s*var\(--m90-text-primary\);/, "Income Impact intro title should use text token"],
  [/body\[data-step="income-impact"\] \.income-impact-page-intro p::before\s*\{[\s\S]*?background:\s*var\(--m90-stable\);/, "Income Impact intro accent dot should use stable token"],
  [/\.income-impact-summary-strip\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--m90-border\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Income Impact summary strip should use surface and border tokens"],
  [/\.income-impact-summary-strip > \[data-income-impact-financial-security-card\] \.income-impact-card-header h2\s*\{[\s\S]*?background:\s*var\(--m90-accent-soft\);[\s\S]*?color:\s*var\(--m90-accent\);/, "Financial security card label should use accent tokens"],
  [/\.income-impact-content-stack\s*\{[\s\S]*?border-top:\s*1px solid var\(--m90-border-soft\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Income Impact content stack should use surface tokens"],
  [/\.income-impact-insights-panel\s*\{[\s\S]*?color:\s*var\(--m90-text-primary\);[\s\S]*?var\(--m90-surface\)[\s\S]*?var\(--m90-surface-secondary\)[\s\S]*?border:\s*1px solid var\(--m90-border-soft\);/, "Income Impact insights panel should use surface/text/border tokens"],
  [/\.income-impact-controls-panel\s*\{[\s\S]*?background:\s*var\(--m90-surface\);[\s\S]*?border-left:\s*1px solid var\(--m90-border-soft\);/, "Income Impact controls panel should use surface and border tokens"],
  [/\.income-impact-rail-summary__label\s*\{[\s\S]*?color:\s*var\(--m90-accent\);/, "Income Impact rail label should use accent token"],
  [/\.income-impact-rail-summary__status\s*\{[\s\S]*?background:\s*var\(--m90-stable-soft\);[\s\S]*?color:\s*var\(--m90-stable\);/, "Income Impact rail status should use stable tokens"],
  [/\.income-impact-scenario-banner\s*\{[\s\S]*?--income-impact-scenario-blue:\s*var\(--m90-accent\);[\s\S]*?--income-impact-scenario-border:\s*var\(--m90-border-soft\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Scenario banner should bridge local variables to theme tokens"],
  [/\.income-impact-scenario-note\s*\{[\s\S]*?background:\s*var\(--m90-warning-soft\);[\s\S]*?color:\s*var\(--m90-warning\);/, "Scenario note should use warning tokens"],
  [/\.income-impact-lifestyle-impact-readout \[data-income-impact-lifestyle-impact-monthly\]\s*\{[\s\S]*?color:\s*var\(--m90-critical\);/, "Lifestyle monthly impact should use critical token"],
  [/\.income-impact-lifestyle-impact-readout \[data-income-impact-lifestyle-impact-runway\]\s*\{[\s\S]*?color:\s*var\(--m90-stable\);/, "Lifestyle runway impact should use stable token"],
  [/\.income-impact-compression-counts span,[\s\S]*?\.income-impact-compression-policy span\s*\{[\s\S]*?border:\s*1px solid var\(--m90-border-soft\);[\s\S]*?background:\s*var\(--m90-surface\);[\s\S]*?color:\s*var\(--m90-text-secondary\);/, "Compression summary cells should use surface/text/border tokens"],
  [/\.income-impact-risk-item\s*\{[\s\S]*?border:\s*1px solid var\(--m90-border-soft\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Risk item surfaces should use tokens"],
  [/\.income-impact-risk-severity\s*\{[\s\S]*?background:\s*var\(--m90-neutral-soft\);[\s\S]*?color:\s*var\(--m90-neutral\);/, "Risk severity default should use neutral semantic tokens"],
  [/\.income-impact-covered-panel\s*\{[\s\S]*?border:\s*1px solid var\(--m90-border-soft\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Covered panel should use surface tokens"]
].forEach(([pattern, label]) => assertMatch(componentsSource, pattern, label));

[
  [/body\[data-step="income-impact"\] \.lens-workflow-pane\s*\{[\s\S]*?background:\s*var\(--m90-bg\);/, "Income Impact layout frame should use app background token"],
  [/body\[data-step="income-impact"\] \.income-impact-content-stack\s*\{[\s\S]*?background:\s*var\(--m90-surface\);/, "Income Impact layout content stack should use surface token"],
  [/body\[data-step="income-impact"\] \.income-impact-content-stack > \.actions-row\s*\{[\s\S]*?border-top:\s*1px solid var\(--m90-border\);[\s\S]*?background:\s*var\(--m90-surface\);/, "Income Impact action row should use border and surface tokens"]
].forEach(([pattern, label]) => assertMatch(layoutSource, pattern, label));

const remainingIncomeImpactColorSelectors = collectIncomeImpactHardcodedColorSelectors(componentsSource);
const allowedGraphInternalSelectors = new Set([
  ".income-impact-transition-outlook-annotation__label-shell",
  ".income-impact-death-line-anchor rect",
  ".income-impact-graph-hover-readout rect",
  ".income-impact-storyline-dot-readout rect",
  ".income-impact-milestone-step:hover"
]);

assert.deepEqual(
  remainingIncomeImpactColorSelectors.map((entry) => entry.selector).sort(),
  Array.from(allowedGraphInternalSelectors).sort(),
  "Only graph/timeline-internal shadow/filter fallbacks should retain hardcoded rgba values in Income Impact selectors."
);
assert.deepEqual(
  collectIncomeImpactHardcodedColorSelectors(layoutSource),
  [],
  "layout.css should not retain hardcoded Income Impact frame colors."
);
assert.deepEqual(
  collectIncomeImpactHardcodedColorSelectors(stylesSource),
  [],
  "styles.css should not retain hardcoded Income Impact visual colors."
);

assertNoMatch(
  stylesSource,
  /body\[data-step="income-impact"\]\s+\.income-impact-page-intro(?:\s|[^{])*\{[\s\S]*?(?:color|background|border(?:-[a-z]+)?)\s*:/,
  "styles.css should not own migrated Income Impact intro visual declarations."
);

assertMatch(componentsSource, /\.income-impact-graph-path--postDeathResources\s*\{[\s\S]*?stroke:\s*var\(--m90-chart-primary\);/, "Primary graph path token bridge should remain intact.");
assertMatch(componentsSource, /\.income-impact-graph-hover-readout rect\s*\{[\s\S]*?fill:\s*var\(--m90-tooltip-bg\);[\s\S]*?stroke:\s*color-mix\(in srgb, var\(--m90-tooltip-text\)/, "Graph tooltip token bridge should remain intact.");
assertMatch(componentsSource, /\.income-impact-milestone-step--tone-critical\s*\{[\s\S]*?--income-impact-milestone-bg:\s*var\(--m90-critical-soft\);/, "Milestone critical tone tokens should remain intact.");
assertMatch(componentsSource, /\.income-impact-milestone-step--tone-stable\s*\{[\s\S]*?--income-impact-milestone-bg:\s*var\(--m90-stable-soft\);/, "Milestone stable tone tokens should remain intact.");

assertMatch(displaySource, /const INCOME_IMPACT_CHART_THEME_FALLBACKS = Object\.freeze\(\{[\s\S]*?primary: "#1d6ee8"[\s\S]*?tooltipText: "#ffffff"[\s\S]*?\}\);/, "Income Impact JS should retain only the centralized chart fallback object.");
assert.equal((displaySource.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || []).length, 6, "Income Impact display JS should have only six centralized chart fallback colors.");
assertMatch(displaySource, /const GRAPH_VIEW_BOX = Object\.freeze\(\{[\s\S]*?width: 1000,[\s\S]*?height: 400,[\s\S]*?plotLeft: 74,[\s\S]*?plotTop: 36,[\s\S]*?plotWidth: 884,[\s\S]*?plotHeight: 300[\s\S]*?\}\);/, "GRAPH_VIEW_BOX geometry contract should remain unchanged.");

assertNoMatch(componentsSource + "\n" + layoutSource + "\n" + stylesSource, /\[data-theme=/, "Component/layout CSS should not add per-theme overrides.");

console.log("theme-system-income-impact-surface-token-consumption-check passed");
