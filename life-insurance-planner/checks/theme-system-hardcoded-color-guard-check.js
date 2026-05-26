const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

const trackedFiles = [
  {
    file: "life-insurance-planner/tokens.css",
    colorBaseline: 38,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "theme token values"
  },
  {
    file: "life-insurance-planner/base.css",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "base reset, expected color-free"
  },
  {
    file: "life-insurance-planner/layout.css",
    colorBaseline: 15,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "known layout/frame color debt; Client Detail profile shell colors migrated"
  },
  {
    file: "life-insurance-planner/components.css",
    colorBaseline: 613,
    legacyVarBaseline: 8,
    namedColorBaseline: 0,
    category: "known component-family color debt; PMI, Client Directory, Client Detail profile, Existing Coverage, Analysis Setup, and Step 3 result visuals migrated"
  },
  {
    file: "life-insurance-planner/styles.css",
    colorBaseline: 457,
    legacyVarBaseline: 33,
    namedColorBaseline: 0,
    category: "legacy style debt, reduced after canonical PMI, Client Detail profile, and Existing Coverage visual neutralization"
  },
  {
    file: "life-insurance-planner/app/features/client-directory.js",
    colorBaseline: 13,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "print/export colors and intentional dynamic avatars"
  },
  {
    file: "life-insurance-planner/client-detail.js",
    colorBaseline: 3,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "intentional dynamic avatar hue background only; static Client Detail profile colors migrated"
  },
  {
    file: "life-insurance-planner/app/features/coverage/coverage-policy-manager.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "Existing Coverage manager render logic, expected color-free"
  },
  {
    file: "life-insurance-planner/app/features/coverage/coverage-policy-summary-list.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "Existing Coverage summary renderer, expected color-free"
  },
  {
    file: "life-insurance-planner/app/features/coverage/coverage-policy-utils.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "Existing Coverage utility logic, expected color-free"
  },
  {
    file: "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js",
    colorBaseline: 6,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "centralized Income Impact chart bridge fallbacks"
  },
  {
    file: "life-insurance-planner/app/features/lens-analysis/analysis-setup.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "Analysis Setup behavior and render logic, expected color-free"
  },
  {
    file: "life-insurance-planner/app/features/lens-analysis/step-three-analysis-display.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "Step 3 result display logic, expected color-free"
  },
  {
    file: "life-insurance-planner/app/features/lens-analysis/simple-needs-results-display.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "Simple Needs result display logic, expected color-free"
  },
  {
    file: "life-insurance-planner/app/features/lens-analysis/pmi-expense-records.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "PMI expense record logic, expected color-free after cash-flow token bridge"
  },
  {
    file: "life-insurance-planner/workspace-side-nav.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "navigation script, expected color-free"
  },
  {
    file: "life-insurance-planner/site-header.js",
    colorBaseline: 0,
    legacyVarBaseline: 0,
    namedColorBaseline: 0,
    category: "header script, expected color-free"
  }
];

const colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const legacyVarPattern =
  /var\(--(?:bg|surface|surface-alt|border|text|muted|accent|accent-strong|accent-soft|success|success-soft|warning|shadow)\)|--(?:bg|surface|surface-alt|border|text|muted|accent|accent-strong|accent-soft|success|success-soft|warning|shadow)\s*:/g;
const namedColorPattern =
  /(?:color|background|background-color|border-color|fill|stroke|box-shadow|text-shadow)\s*:\s*(?:black|white|red|green|blue|orange|purple|gray|grey)\b/gi;

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function readTrackedFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert.ok(fs.existsSync(absolutePath), `${relativePath} should exist.`);
  return fs.readFileSync(absolutePath, "utf8");
}

const results = trackedFiles.map((entry) => {
  const source = readTrackedFile(entry.file);
  const colorCount = countMatches(source, colorPattern);
  const legacyVarCount = countMatches(source, legacyVarPattern);
  const namedColorCount = countMatches(source, namedColorPattern);

  assert.ok(
    colorCount <= entry.colorBaseline,
    `${entry.file} hardcoded color count grew from ${entry.colorBaseline} to ${colorCount}. Classify the new colors or migrate them to --m90-* tokens.`
  );
  assert.ok(
    legacyVarCount <= entry.legacyVarBaseline,
    `${entry.file} legacy variable count grew from ${entry.legacyVarBaseline} to ${legacyVarCount}. New UI code should use --m90-* tokens.`
  );
  assert.ok(
    namedColorCount <= entry.namedColorBaseline,
    `${entry.file} named color count grew from ${entry.namedColorBaseline} to ${namedColorCount}. Use --m90-* tokens unless this is intentionally classified.`
  );

  return {
    file: entry.file,
    category: entry.category,
    colors: colorCount,
    colorBaseline: entry.colorBaseline,
    legacyVars: legacyVarCount,
    legacyVarBaseline: entry.legacyVarBaseline,
    namedColors: namedColorCount,
    namedColorBaseline: entry.namedColorBaseline
  };
});

const diffSource = execSync(`git diff --unified=0 HEAD -- ${trackedFiles.map((entry) => entry.file).join(" ")}`, {
  cwd: repoRoot,
  encoding: "utf8"
});

const unclassifiedAddedLines = [];
let currentFile = "";
diffSource.split(/\r?\n/).forEach((line) => {
  if (line.startsWith("diff --git ")) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    currentFile = match ? match[2] : "";
    return;
  }

  if (!line.startsWith("+") || line.startsWith("+++")) {
    return;
  }

  const addedLine = line.slice(1);
  const hasColor = colorPattern.test(addedLine) || legacyVarPattern.test(addedLine) || namedColorPattern.test(addedLine);
  colorPattern.lastIndex = 0;
  legacyVarPattern.lastIndex = 0;
  namedColorPattern.lastIndex = 0;

  if (!hasColor) {
    return;
  }

  const isTokenDefinition =
    currentFile === "life-insurance-planner/tokens.css" &&
    (/--m90-[a-z0-9-]+\s*:/.test(addedLine) || /--search-bar-border-color\s*:/.test(addedLine));
  const isIntentionalDynamicClientDetailAvatarHue =
    currentFile === "life-insurance-planner/client-detail.js" &&
    /--client-avatar-bg:/.test(addedLine) &&
    /hsl\(/.test(addedLine);

  if (!isTokenDefinition && !isIntentionalDynamicClientDetailAvatarHue) {
    unclassifiedAddedLines.push(`${currentFile}: ${addedLine.trim()}`);
  }
});

assert.deepEqual(
  unclassifiedAddedLines,
  [],
  [
    "New hardcoded color lines must be classified, tokenized, or intentionally added to the guard baseline.",
    ...unclassifiedAddedLines
  ].join("\n")
);

const tokensSource = readTrackedFile("life-insurance-planner/tokens.css");
assert.match(tokensSource, /--m90-bg:/, "tokens.css should remain the theme-token owner.");
assert.match(tokensSource, /--m90-chart-primary:/, "chart tokens should remain defined in tokens.css.");
assert.match(tokensSource, /--m90-critical:/, "status tokens should remain defined in tokens.css.");

console.table(results);
console.log("theme-system-hardcoded-color-guard-check passed");
