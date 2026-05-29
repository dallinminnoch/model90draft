const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const appRoot = path.join(repoRoot, "life-insurance-planner");
const workspaceSideNavPath = path.join(appRoot, "workspace-side-nav.js");
const componentsPath = path.join(appRoot, "components.css");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertAssetExists(assetPath) {
  assert(
    fs.existsSync(path.join(appRoot, assetPath)),
    `expected sidebar asset to exist: ${assetPath}`
  );
}

const workspaceSideNavSource = read(workspaceSideNavPath);
const componentsSource = read(componentsPath);

const primaryRailFunction = workspaceSideNavSource.match(/function getWorkspacePrimaryRailIcon\(key\) \{[\s\S]*?\n  \}/);
assert(primaryRailFunction, "workspace-side-nav.js should define getWorkspacePrimaryRailIcon");

[
  "Images/start_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg",
  "Images/clientdirectory.svg",
  "Images/analysismenu.svg",
  "Images/teleportal.svg",
  "Images/compliancemenu.svg",
  "Images/customworkflow.svg",
  "Images/settings.svg"
].forEach((assetPath) => {
  assert.match(
    primaryRailFunction[0],
    new RegExp(assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `primary sidebar rail should use CSS-relative ${assetPath}`
  );
  assertAssetExists(assetPath);
});

assert.doesNotMatch(
  primaryRailFunction[0],
  /\.\.\/Images\//,
  "primary sidebar rail CSS mask URLs should not use page-relative ../Images paths"
);
assert.doesNotMatch(
  primaryRailFunction[0],
  /["']\/(?:Images|icons|assets)\//,
  "primary sidebar rail should not use root-relative icon paths"
);

assert.match(
  workspaceSideNavSource,
  /"recently-viewed": "\.\.\/Images\/recentlyviewed\.svg"/,
  "submenu img icons should remain page-relative because they render as img src attributes"
);
assert.match(
  componentsSource,
  /\.workspace-side-nav-shell \.workspace-side-nav-primary-icon-art--asset \{[\s\S]*?-webkit-mask-image: var\(--workspace-side-nav-primary-icon-asset\);[\s\S]*?mask-image: var\(--workspace-side-nav-primary-icon-asset\);/,
  "primary sidebar icons should consume the sidebar asset URL as a CSS mask"
);
assert.doesNotMatch(
  componentsSource,
  /\.workspace-side-nav[\s\S]*?url\(\/(?:Images|icons|assets)\//,
  "workspace sidebar CSS should not use root-relative icon URLs"
);

[
  "Images/accessibility.svg",
  "Images/bell.svg"
].forEach(assertAssetExists);

console.log("GitHub Pages sidebar icon path checks passed.");
