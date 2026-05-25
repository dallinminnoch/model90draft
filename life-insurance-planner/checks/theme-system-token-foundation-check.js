const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const tokensPath = path.join(repoRoot, "life-insurance-planner", "tokens.css");
const stylesPath = path.join(repoRoot, "life-insurance-planner", "styles.css");

assert.ok(fs.existsSync(tokensPath), "tokens.css should exist.");
assert.ok(fs.existsSync(stylesPath), "styles.css should exist.");

const tokensSource = fs.readFileSync(tokensPath, "utf8");

const finalThemeKeys = [
  "modern",
  "classic",
  "old-money",
  "dark-soft",
  "dark",
  "carbon",
  "high-tech",
  "dusk",
  "warm-professional"
];

assert.match(tokensSource, /:root\b/, "tokens.css should define :root.");
assert.match(
  tokensSource,
  /:root\[data-theme="modern"\]/,
  "tokens.css should define the explicit Modern theme selector."
);
assert.match(tokensSource, /Final supported theme keys:/, "tokens.css should document the final theme key contract.");

finalThemeKeys.forEach((themeKey) => {
  assert.match(
    tokensSource,
    new RegExp(`\\b${themeKey}\\b`),
    `${themeKey} should be documented as a final theme key.`
  );
});

assert.match(
  tokensSource,
  /dark-soft \(renamed product label for the previous Bold\/GitHub-inspired brief\)/,
  "tokens.css should document dark-soft as the replacement key for the old Bold brief."
);

const requiredTokens = [
  "--m90-bg",
  "--m90-surface",
  "--m90-surface-secondary",
  "--m90-surface-elevated",
  "--m90-text-primary",
  "--m90-text-secondary",
  "--m90-text-muted",
  "--m90-border",
  "--m90-border-soft",
  "--m90-accent",
  "--m90-accent-hover",
  "--m90-accent-soft",
  "--m90-focus-ring",
  "--m90-sidebar-bg",
  "--m90-sidebar-text",
  "--m90-sidebar-text-muted",
  "--m90-logo-accent",
  "--m90-trim",
  "--m90-stable",
  "--m90-stable-soft",
  "--m90-warning",
  "--m90-warning-soft",
  "--m90-critical",
  "--m90-critical-soft",
  "--m90-neutral",
  "--m90-neutral-soft",
  "--m90-chart-primary",
  "--m90-chart-secondary",
  "--m90-chart-fill",
  "--m90-chart-grid",
  "--m90-chart-grid-minor",
  "--m90-chart-marker",
  "--m90-chart-runout",
  "--m90-chart-deficit",
  "--m90-tooltip-bg",
  "--m90-tooltip-text",
  "--m90-overlay",
  "--m90-shadow"
];

requiredTokens.forEach((tokenName) => {
  assert.match(
    tokensSource,
    new RegExp(`${tokenName}:\\s*[^;]+;`),
    `${tokenName} should be defined.`
  );
});

[
  "#f9f9fb",
  "#ffffff",
  "#f0f1f4",
  "#0f1923",
  "#6b7280",
  "#1d6ee8",
  "#16a34a",
  "#dc2626",
  "#d97706"
].forEach((colorValue) => {
  assert.match(
    tokensSource.toLowerCase(),
    new RegExp(colorValue),
    `Modern palette value ${colorValue} should be present.`
  );
});

assert.match(
  tokensSource,
  /--search-bar-border-color:\s*var\(--m90-border\);/,
  "--search-bar-border-color should remain available and map to the Modern border token."
);

finalThemeKeys.filter((themeName) => themeName !== "modern").forEach((themeName) => {
  assert.doesNotMatch(
    tokensSource,
    new RegExp(`:root\\[data-theme="${themeName}"\\]`),
    `${themeName} theme block should not be added in the Modern foundation pass.`
  );
});
assert.doesNotMatch(tokensSource, /data-theme="bold"/, "The old Bold data-theme key should not exist.");
assert.doesNotMatch(tokensSource, /:root\[data-theme="bold"\]/, "The old Bold theme block should not exist.");

const changedFiles = execSync("git diff --name-only", {
  cwd: repoRoot,
  encoding: "utf8"
})
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

assert.ok(
  !changedFiles.includes("life-insurance-planner/styles.css"),
  "styles.css should not be changed by the token foundation pass."
);

console.log("theme-system-token-foundation-check passed");
