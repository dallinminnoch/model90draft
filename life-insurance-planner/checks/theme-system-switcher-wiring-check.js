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
const tokensSource = readRepoFile("tokens.css");

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
assertContains(themeControllerSource, /prefers-reduced-motion:\s*reduce/, "theme controller should respect reduced-motion preferences before animating theme changes.");
assertContains(themeControllerSource, /is-theme-transitioning/, "theme controller should apply the scoped CSS theme fade class around user-triggered theme changes.");
assertContains(themeControllerSource, /function applySavedTheme\(\)\s*\{\s*return applyTheme\(readSavedTheme\(\)\);\s*\}/, "saved theme application should stay direct and avoid a page-load transition.");
assertNoRawColors(themeControllerSource, "theme controller");
assertContains(tokensSource, /:root\.is-theme-transitioning,[\s\S]*?transition-property:\s*background,\s*background-color,\s*border-color,\s*box-shadow,\s*color,\s*fill,\s*outline-color,\s*stroke;[\s\S]*?transition-duration:\s*260ms;/, "tokens.css should own the scoped theme fade.");

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
  "--m90-surface-elevated",
  "--m90-text-secondary"
]);
assertContains(componentsSource, /\.theme-switcher\s*\{[\s\S]*?position:\s*relative;/, "theme switcher should anchor its tokenized custom select arrow.");
assertContains(componentsSource, /\.theme-switcher\s*\{[\s\S]*?max-width:\s*min\(14\.5rem,\s*calc\(100vw - 4\.5rem\)\);/, "theme switcher should constrain topbar overflow.");
assertContains(componentsSource, /\.theme-switcher::after\s*\{[\s\S]*?border-right:\s*2px solid currentColor;[\s\S]*?border-bottom:\s*2px solid currentColor;/, "theme switcher arrow should inherit currentColor.");
assertSelectorConsumesTokens(componentsSource, ".theme-switcher-label", [
  "--m90-text-muted"
]);
assertSelectorConsumesTokens(componentsSource, ".theme-switcher-select", [
  "--m90-border",
  "--m90-surface-elevated",
  "--m90-text-primary"
]);
assertContains(componentsSource, /\.theme-switcher-select\s*\{[\s\S]*?width:\s*min\(9\.2rem,\s*36vw\);[\s\S]*?box-sizing:\s*border-box;[\s\S]*?appearance:\s*none;[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?background-color:\s*var\(--m90-surface-elevated\);[\s\S]*?background-image:\s*none;/, "visible theme select should use tokenized non-native chrome with constrained sizing.");
assertSelectorConsumesTokens(componentsSource, ".theme-switcher-select:focus-visible", [
  "--m90-focus-ring"
]);
assertSelectorConsumesTokens(componentsSource, ".theme-switcher:hover,\n.theme-switcher:focus-within", [
  "--m90-focus-ring",
  "--m90-surface-elevated"
]);
assertSelectorConsumesTokens(componentsSource, ".workspace-page-menu-trigger", [
  "--m90-text-secondary"
]);
assertSelectorConsumesTokens(componentsSource, ".workspace-page-menu-trigger:hover,\n.workspace-page-menu-trigger:focus-visible", [
  "--m90-text-primary"
]);
assertSelectorConsumesTokens(componentsSource, ".fullscreen-toggle", [
  "--m90-text-secondary"
]);
assertSelectorConsumesTokens(componentsSource, ".fullscreen-toggle:hover,\n.fullscreen-toggle:focus-visible", [
  "--m90-surface-secondary",
  "--m90-text-primary"
]);
assertContains(componentsSource, /\.workspace-page-menu-trigger::before\s*\{[\s\S]*?background:\s*currentColor;[\s\S]*?mask:\s*url\("Images\/menu\.svg"\)/, "workspace menu icon should render through currentColor.");
assertContains(componentsSource, /\.fullscreen-toggle::before\s*\{[\s\S]*?background:\s*currentColor;[\s\S]*?mask:\s*url\("Images\/openfullscreen\.svg"\)/, "fullscreen icon should render through currentColor.");
assertContains(componentsSource, /\.fullscreen-toggle\[aria-pressed="true"\]::before\s*\{[\s\S]*?mask-image:\s*url\("Images\/closefullscreen\.svg"\)/, "fullscreen pressed state should use the close icon mask.");
assertSelectorConsumesTokens(componentsSource, ".workspace-side-nav.workspace-side-nav-shell", [
  "--m90-accent-soft",
  "--m90-accent"
]);
assertContains(componentsSource, /\.workspace-side-nav-shell \.workspace-side-nav-primary-button\.is-active \.workspace-side-nav-primary-icon\s*\{[\s\S]*?color:\s*var\(--workspace-side-nav-primary-icon-active-color\);/, "active far-left workspace rail icon should use the active icon color variable.");
assertContains(componentsSource, /\.workspace-side-nav-shell \.workspace-side-nav-primary-button\.is-active \.workspace-side-nav-primary-icon::before\s*\{[\s\S]*?background:\s*var\(--workspace-side-nav-primary-icon-active-bg\);/, "active far-left workspace rail icon background should use the active background variable.");
assertContains(componentsSource, /\.workspace-side-nav-shell \.workspace-side-nav-primary-icon-art--asset\s*\{[\s\S]*?background:\s*currentColor;[\s\S]*?mask-image:\s*var\(--workspace-side-nav-primary-icon-asset\);/, "far-left workspace rail asset icons should render through currentColor masks.");
assertContains(componentsSource, /\.client-directory-utility-button\s*\{[\s\S]*?color:\s*var\(--m90-text-primary\);/, "shared Client Directory utility buttons should have tokenized icon color.");
assertContains(componentsSource, /body\.clients-page \.client-directory-utility-button\s*\{[\s\S]*?color:\s*var\(--m90-text-secondary\);/, "active Client Directory utility buttons should inherit tokenized icon color.");
assertContains(componentsSource, /body\.clients-page \.client-directory-utility-button:hover,\s*body\.clients-page \.client-directory-utility-button:focus-visible\s*\{[\s\S]*?color:\s*var\(--m90-accent\);/, "active Client Directory utility buttons should use tokenized hover/focus color.");
assertContains(componentsSource, /\.client-directory-utility-icon::before\s*\{[\s\S]*?background:\s*currentColor;[\s\S]*?mask-size:\s*contain;/, "Client Directory utility icons should render through currentColor masks.");
assertContains(componentsSource, /\.client-directory-utility-button\[data-directory-utility="trash"\] \.client-directory-utility-icon::before\s*\{[\s\S]*?mask-image:\s*url\("Images\/trashbin\.svg"\)/, "trash utility icon should use a currentColor mask.");
assertContains(componentsSource, /\.client-directory-utility-button\[data-directory-utility="archive"\] \.client-directory-utility-icon::before\s*\{[\s\S]*?mask-image:\s*url\("Images\/archive\.svg"\)/, "archive utility icon should use a currentColor mask.");
assertContains(componentsSource, /\.client-directory-utility-button\[data-directory-utility="accessibility"\] \.client-directory-utility-icon::before\s*\{[\s\S]*?mask-image:\s*url\("Images\/accessibility\.svg"\)/, "accessibility utility icon should use a currentColor mask.");
assertContains(componentsSource, /\.client-directory-utility-button\[data-summary-customize-trigger\] \.client-directory-utility-icon::before\s*\{[\s\S]*?mask-image:\s*url\("Images\/customizepreviewcards\.svg"\)/, "customize cards utility icon should use a currentColor mask.");
assert.doesNotMatch(extractBlock(componentsSource, ".client-directory-utility-icon img"), /filter:\s*brightness\(0\)/, "active Client Directory utility img fallback should not force black icons.");

assertContains(stylesSource, /select:not\(\.theme-switcher-select\):not\(\.client-activity-select\)/, "legacy broad select styling should explicitly exclude the theme switcher select.");
assert.doesNotMatch(stylesSource, /\.theme-switcher-select\s*\{/, "styles.css should not add a theme switcher visual owner block.");

["components.css", "layout.css", "styles.css"].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(source, /\[data-theme=/, `${relativePath} should not add per-theme component overrides.`);
});

console.log("theme-system-switcher-wiring-check passed");
