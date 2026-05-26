const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNoRawColors(source, label) {
  assert.doesNotMatch(
    source,
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/,
    `${label} should not contain raw colors.`
  );
}

function assertSelectorConsumesTokens(source, selector, tokens) {
  const block = extractBlock(source, selector);
  tokens.forEach((token) => {
    assert.match(
      block,
      new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      `${selector} should consume ${token}.`
    );
  });
}

const themeControllerSource = readRepoFile("app/theme/theme-controller.js");
const siteHeaderSource = readRepoFile("site-header.js");
const componentsSource = readRepoFile("components.css");
const stylesSource = readRepoFile("styles.css");

const themeOptions = [
  ["modern", "Modern"],
  ["classic", "Classic"],
  ["old-money", "Old Money"],
  ["dark-soft", "Dark Soft"],
  ["dark", "Dark"],
  ["carbon", "Carbon"],
  ["high-tech", "High Tech"],
  ["dusk", "Dusk"],
  ["warm-professional", "Warm Professional"]
];

assertContains(themeControllerSource, /THEME_STORAGE_KEY\s*=\s*"model90\.theme"/, "theme controller should use the model90.theme persistence key.");
assertContains(themeControllerSource, /document\.documentElement\.dataset\.theme\s*=\s*normalizedKey/, "theme controller should apply the selected key to the root data-theme attribute.");
assertContains(themeControllerSource, /THEME_KEYS\.includes\(key\)\s*\?\s*key\s*:\s*MODERN_THEME_KEY/, "invalid theme keys should fall back to modern.");
assertContains(themeControllerSource, /localStorage\.getItem\(THEME_STORAGE_KEY\)/, "theme controller should read persisted theme from localStorage.");
assertContains(themeControllerSource, /localStorage\.setItem\(THEME_STORAGE_KEY,\s*key\)/, "theme controller should persist theme to localStorage.");
assertNoRawColors(themeControllerSource, "theme controller");

themeOptions.forEach(([key, label]) => {
  assertContains(themeControllerSource, new RegExp(`key:\\s*"${key}"`), `${key} should be an allowed theme key.`);
  assertContains(themeControllerSource, new RegExp(`label:\\s*"${label}"`), `${label} should be a switcher option label.`);
});

assertContains(siteHeaderSource, /renderThemeSwitcherMarkup/, "site-header should render the shared theme switcher.");
assertContains(siteHeaderSource, /data-theme-switcher-select/, "site-header should render the theme select.");
assertContains(siteHeaderSource, /workspaceActions\.insertAdjacentHTML\("beforeend",\s*markup\)/, "workspace topbar actions should be the workspace switcher placement owner.");
assertContains(siteHeaderSource, /siteHeaderUtility\.insertAdjacentHTML\("beforeend",\s*markup\)/, "site-header utility should receive the switcher on active non-workspace admin pages.");
assertContains(siteHeaderSource, /controller\.setTheme\(select\.value\)/, "theme switcher should call the controller setter.");
assert.doesNotMatch(siteHeaderSource, /\.site-nav[^;]+insertAdjacentHTML/, "legacy site nav should not be the switcher placement owner.");
assertNoRawColors(siteHeaderSource, "site-header switcher wiring");

[
  "pages/clients.html",
  "pages/next-step.html",
  "pages/analysis-setup.html",
  "pages/income-loss-impact.html",
  "pages/settings.html",
  "pages/admin-accounts.html"
].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assertContains(
    source,
    /<script src="\.\.\/app\/theme\/theme-controller\.js"><\/script>\s*\n\s*<link rel="stylesheet" href="\.\.\/styles\.css">/,
    `${relativePath} should load the theme controller before styles.`
  );
});

assertSelectorConsumesTokens(componentsSource, ".theme-switcher", [
  "--m90-border",
  "--m90-surface",
  "--m90-text-secondary"
]);
assertSelectorConsumesTokens(componentsSource, ".theme-switcher-label", [
  "--m90-text-muted"
]);
assertSelectorConsumesTokens(componentsSource, ".theme-switcher-select", [
  "--m90-surface",
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(componentsSource, ".theme-switcher-select:focus-visible", [
  "--m90-focus-ring"
]);
assertSelectorConsumesTokens(componentsSource, ".theme-switcher:hover,\n.theme-switcher:focus-within", [
  "--m90-focus-ring",
  "--m90-surface-elevated"
]);

assert.doesNotMatch(stylesSource, /theme-switcher/, "styles.css should not own theme switcher styles.");

["components.css", "layout.css", "styles.css"].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(source, /\[data-theme=/, `${relativePath} should not add per-theme component overrides.`);
});

console.log("theme-system-switcher-wiring-check passed");
