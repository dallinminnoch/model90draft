#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function extractRule(source, selector) {
  const escapedSelector = selector
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const pattern = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "m");
  const match = source.match(pattern);
  assert.ok(match, `Expected CSS rule for ${selector}.`);
  return match[1];
}

const layoutCss = readRepoFile("layout.css");

const clientDirectoryShellRule = extractRule(layoutCss, ".client-directory-shell-layout");
const clientDirectorySidePanelRule = extractRule(layoutCss, ".client-directory-side-panel");

const navHostRule = extractRule(
  layoutCss,
  "body.clients-page .workspace-side-nav-host[data-workspace-side-nav=\"directory\"],\n  body.lens-page .workspace-side-nav-host[data-workspace-side-nav=\"lens\"],\n  body.settings-page .workspace-side-nav-host[data-workspace-side-nav=\"settings\"]"
);
assert.match(
  navHostRule,
  /left:\s*var\(--app-side-nav-screen-gap\);/,
  "Workspace side nav should keep the shared screen gap on the left."
);
assert.match(
  navHostRule,
  /bottom:\s*var\(--app-side-nav-screen-gap\);/,
  "Workspace side nav should keep the same shared screen gap at the bottom."
);
assert.doesNotMatch(
  navHostRule,
  /bottom:\s*0;/,
  "Workspace side nav should not sit flush against the bottom edge."
);

const stageGapSelector =
  "body.clients-page .client-directory-shell-layout,\n  body.lens-page .prospect-stage,\n  body.settings-page .settings-shell";
const stageGapRule = extractRule(layoutCss, stageGapSelector);
const sharedVisiblePaneRule = extractRule(
  layoutCss,
  "body.clients-page .workspace-visible-pane,\n  body.lens-page .workspace-visible-pane,\n  body.settings-page .workspace-visible-pane"
);
assert.match(
  clientDirectoryShellRule,
  /border-radius:\s*0\.65rem;/,
  "Client directory outer content shell should keep the same frame radius as its left-side content edge."
);
assert.match(
  clientDirectorySidePanelRule,
  /border-right:\s*1px solid var\(--m90-border\);/,
  "Client directory right rail should own its right border instead of relying on a square parent edge."
);
assert.match(
  clientDirectorySidePanelRule,
  /border-radius:\s*0 0\.65rem 0\.65rem 0;/,
  "Client directory schedule and alerts rail should mirror the left-side content curve on the right edge."
);
assert.match(
  stageGapRule,
  /padding-right:\s*var\(--app-side-nav-screen-gap\);/,
  "Shared workspace content stage wrappers should reserve the same right screen gap as the side nav screen inset."
);
assert.match(
  stageGapRule,
  /padding-bottom:\s*var\(--app-side-nav-screen-gap\);/,
  "Shared workspace content stage wrappers should reserve the same bottom screen gap as the side nav."
);
assert.match(
  stageGapRule,
  /box-sizing:\s*border-box;/,
  "Shared workspace content stage wrappers should keep the bottom gap inside their viewport-height layout."
);
assert.match(
  sharedVisiblePaneRule,
  /border-radius:\s*0;/,
  "Shared workspace visible pane should stay square; the requested curve belongs to the outer content shell/right rail."
);

const visiblePaneHeightPatch = /workspace-visible-pane[^{]*\{[^}]*height:\s*calc\(100% - var\(--app-side-nav-screen-gap\)\);/m;
assert.doesNotMatch(
  layoutCss,
  visiblePaneHeightPatch,
  "Main content bottom gap should not be implemented by shrinking workspace-visible-pane."
);

const stageGapRuleIndex = layoutCss.indexOf(stageGapSelector);
const settingsShellSizingSelector = "body.settings-page .settings-shell";
const settingsShellRuleIndex = layoutCss.indexOf(settingsShellSizingSelector);
extractRule(layoutCss, settingsShellSizingSelector);
assert.ok(
  stageGapRuleIndex > settingsShellRuleIndex,
  "Shared content-stage bottom gap should come after page-specific desktop shell sizing rules."
);

console.log("workspace-shell-bottom-gap-check passed");
