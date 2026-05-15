#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function countOccurrences(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function getSection(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.ok(startIndex >= 0, `${startNeedle} should exist`);
  const endIndex = endNeedle ? source.indexOf(endNeedle, startIndex + startNeedle.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function getChangedFiles() {
  try {
    return childProcess.execFileSync("git", ["diff", "--name-only"], {
      cwd: repoRoot,
      encoding: "utf8"
    })
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

const html = readRepoFile("pages/analysis-setup.html");
const setupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const layoutCss = readRepoFile("layout.css");
const componentsCss = readRepoFile("components.css");

assert.match(html, /<h1 id="analysis-setup-page-title">LENS Analysis Setup<\/h1>/);
assert.match(html, /data-analysis-setup-entry/);
assert.match(html, /Review LENS Assumptions/);
assert.match(html, /data-lens-assumptions-open/);
assert.match(html, /data-lens-assumptions-open[^>]*aria-controls="lens-assumptions-overlay"[^>]*aria-expanded="false"/);
assert.match(html, /data-lens-result-proceed/);
assert.match(html, /Continue to Income Impact/);

const entrySection = getSection(html, 'data-analysis-setup-entry', 'data-lens-assumptions-overlay');
assert.match(entrySection, /Review LENS Assumptions/);
assert.match(entrySection, /data-lens-result-proceed/);
assert.match(entrySection, /data-analysis-setup-apply/);
assert.ok(
  html.indexOf("data-analysis-setup-entry") < html.indexOf("data-lens-assumptions-overlay"),
  "entry screen should appear before the hidden assumptions overlay"
);

const overlaySection = getSection(html, 'data-lens-assumptions-overlay', '<script src="../workspace-side-nav.js"></script>');
assert.match(overlaySection, /hidden aria-hidden="true"/);
assert.match(overlaySection, /data-lens-assumptions-dialog/);
assert.match(overlaySection, /role="dialog"/);
assert.match(overlaySection, /aria-labelledby="lens-assumptions-overlay-title"/);
assert.match(overlaySection, /data-lens-assumptions-close/);
assert.match(overlaySection, /id="lens-assumptions-overlay-title">Assumption Controls<\/h2>/);
assert.match(overlaySection, /analysis-setup-panel-title-separator[^>]*>•<\/span>/);
assert.match(overlaySection, /data-lens-assumptions-profile-name>No linked profile<\/span>/);
assert.match(overlaySection, /tabindex="-1"/);
assert.match(overlaySection, /data-analysis-setup-save/);
assert.match(overlaySection, /data-lens-assumptions-save/);
assert.match(overlaySection, /data-lens-assumptions-save-exit/);
assert.match(overlaySection, /Save &amp; Exit/);
assert.match(overlaySection, /analysis-setup-assumption-panel/);
assert.match(overlaySection, /analysis-setup-view-nav/);
assert.match(overlaySection, /aria-label="Assumption sections"/);
assert.match(overlaySection, /analysis-setup-view-nav-section[^>]*>Section 1<\/span>/);
assert.match(overlaySection, /analysis-setup-view-nav-section[^>]*>Section 2<\/span>/);
assert.match(overlaySection, /analysis-setup-view-nav-section[^>]*>Section 3<\/span>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="calculation-inclusion"[^>]*>Calculation inclusion controls<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="inflation-assumptions"[^>]*>Inflation assumptions<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="method-defaults"[^>]*>Method defaults<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="policy-return-assumptions"[^>]*>Policy return assumptions<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="asset-treatment"[^>]*>Asset treatment<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="cash-reserve"[^>]*>Cash reserve<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="existing-coverage-treatment"[^>]*>Existing coverage treatment<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="debt-mortgage"[^>]*>Debt &amp; mortgage<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="survivor-support"[^>]*>Survivor &amp; support<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="education-assumptions"[^>]*>Education assumptions<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-target="recommendation-guardrails"[^>]*>Recommendation guardrails<\/button>/);
assert.match(overlaySection, /data-analysis-setup-scroll-section="calculation-inclusion"/);
assert.match(overlaySection, /data-analysis-setup-scroll-section="inflation-assumptions"/);
assert.match(overlaySection, /data-analysis-setup-scroll-section="asset-treatment"/);
assert.match(overlaySection, /data-analysis-setup-scroll-section="debt-mortgage"/);
assert.match(overlaySection, /data-analysis-setup-scroll-section="recommendation-guardrails"/);
assert.doesNotMatch(overlaySection, /data-analysis-setup-view-panel/);
assert.doesNotMatch(overlaySection, /data-analysis-setup-view-tab/);
assert.doesNotMatch(overlaySection, /data-analysis-setup-current-view/);
const recommendationNavStart = overlaySection.indexOf('data-analysis-setup-scroll-target="recommendation-guardrails"');
const policyReturnNavStart = overlaySection.indexOf('data-analysis-setup-scroll-target="policy-return-assumptions"');
const calculationInclusionSectionStart = overlaySection.indexOf('data-analysis-setup-scroll-section="calculation-inclusion"');
const inflationSectionStart = overlaySection.indexOf('data-analysis-setup-scroll-section="inflation-assumptions"');
const recommendationSectionStart = overlaySection.indexOf('data-analysis-setup-scroll-section="recommendation-guardrails"');
const policyReturnSectionStart = overlaySection.indexOf('data-analysis-setup-scroll-section="policy-return-assumptions"');
assert.ok(policyReturnNavStart > recommendationNavStart);
assert.ok(calculationInclusionSectionStart >= 0 && inflationSectionStart > calculationInclusionSectionStart);
assert.ok(policyReturnSectionStart > recommendationSectionStart);
const inflationSection = getSection(overlaySection, 'data-analysis-setup-scroll-section="inflation-assumptions"', '</section>');
const methodDefaultsSection = getSection(overlaySection, 'data-analysis-setup-scroll-section="method-defaults"', '</section>');
assert.doesNotMatch(inflationSection, /data-analysis-inflation-field="finalExpenseTargetAge"/);
assert.match(methodDefaultsSection, /Final expense target age \(LENS only\)/);
assert.match(methodDefaultsSection, /data-analysis-inflation-field="finalExpenseTargetAge"/);
assert.doesNotMatch(overlaySection, /analysis-setup-view-tabs/);
assert.doesNotMatch(overlaySection, /class="analysis-setup-view-tab"/);
assert.doesNotMatch(overlaySection, /data-analysis-setup-scroll-mode/);
assert.doesNotMatch(overlaySection, /lens-assumptions-dialog-kicker/);
assert.doesNotMatch(overlaySection, /lens-assumptions-overlay-copy/);
assert.doesNotMatch(overlaySection, />Planning Settings</);
assert.doesNotMatch(overlaySection, />Review LENS Assumptions</);
assert.doesNotMatch(overlaySection, /These controls define how linked profile facts are interpreted for LENS/);
assert.doesNotMatch(overlaySection, /Save keeps the overlay open/);
assert.doesNotMatch(overlaySection, /data-lens-result-proceed/);
assert.doesNotMatch(overlaySection, /Continue to Income Impact/);
assert.doesNotMatch(overlaySection, /lens-assumptions-dialog-header/);
assert.doesNotMatch(overlaySection, /data-analysis-setup-header-toggle/);
assert.doesNotMatch(overlaySection, /analysis-setup-header-toggle/);
assert.doesNotMatch(overlaySection, /doublearrow\.svg/);

const overlayHeaderSection = getSection(overlaySection, '<header class="analysis-setup-panel-header"', '</header>');
assert.match(overlayHeaderSection, /id="lens-assumptions-overlay-title">Assumption Controls<\/h2>/);
assert.match(overlayHeaderSection, /analysis-setup-panel-title-separator[^>]*>•<\/span>/);
assert.match(overlayHeaderSection, /data-lens-assumptions-profile-name/);
assert.match(overlayHeaderSection, /data-lens-assumptions-close/);
assert.doesNotMatch(overlayHeaderSection, /data-analysis-setup-header-toggle/);

assert.equal(countOccurrences(html, /analysis-setup-assumption-panel/g), 1);
assert.equal(countOccurrences(html, /data-analysis-setup-save/g), 1);
assert.equal(countOccurrences(html, /data-analysis-setup-apply/g), 1);
assert.equal(countOccurrences(html, /data-lens-assumptions-open/g), 1);
assert.equal(countOccurrences(html, /data-lens-result-proceed/g), 1);
assert.equal(countOccurrences(html, /data-lens-assumptions-save(?!-)/g), 1);
assert.equal(countOccurrences(html, /data-lens-assumptions-save-exit/g), 1);
assert.equal(countOccurrences(html, /data-analysis-setup-view-tab=/g), 0);
assert.equal(countOccurrences(html, /data-analysis-setup-view-panel=/g), 0);
assert.equal(countOccurrences(html, /data-analysis-setup-current-view=/g), 0);
assert.equal(countOccurrences(html, /data-analysis-setup-scroll-target=/g), 11);
assert.equal(countOccurrences(html, /data-analysis-setup-scroll-section=/g), 11);
assert.equal(countOccurrences(html, /data-analysis-projected-asset-offset-enabled/g), 0);
assert.equal(countOccurrences(html, /data-analysis-asset-growth-projection-mode/g), 0);
assert.equal(countOccurrences(html, /data-analysis-asset-growth-projection-years/g), 0);
assert.equal(countOccurrences(html, /data-analysis-recommendation-enabled/g), 1);

[
  /data-analysis-inflation-field="enabled"/,
  /data-analysis-method-field="needsIncludeOffsetAssets"/,
  /data-analysis-asset-treatment-table/,
  /data-analysis-coverage-field/,
  /data-analysis-debt-table/,
  /data-analysis-survivor-field/,
  /data-analysis-education-field/,
  /data-analysis-recommendation-field/
].forEach(function (pattern) {
  assert.match(html, pattern);
});

const inlineScripts = Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
  .map(function (match) { return match[1]; })
  .join("\n");
assert.doesNotMatch(inlineScripts, /lens-assumptions|data-lens-assumptions/);

assert.match(setupSource, /document\.querySelector\("\[data-lens-assumptions-open\]"\)/);
assert.match(setupSource, /document\.querySelector\("\[data-lens-assumptions-overlay\]"\)/);
assert.match(setupSource, /document\.querySelector\("\[data-lens-assumptions-dialog\]"\)/);
assert.match(setupSource, /document\.querySelector\("\[data-lens-assumptions-close\]"\)/);
assert.match(setupSource, /document\.querySelector\("\[data-lens-assumptions-save-exit\]"\)/);
assert.match(setupSource, /document\.querySelector\("\[data-lens-assumptions-profile-name\]"\)/);
assert.match(setupSource, /document\.querySelectorAll\("\[data-analysis-setup-scroll-target\]"\)/);
assert.match(setupSource, /function scrollAnalysisSetupSectionIntoPlace\(scrollTarget, menuItems, viewGrid, options\)/);
assert.match(setupSource, /function resetAnalysisSetupScrollPosition\(menuItems, viewGrid\)/);
assert.match(setupSource, /function syncAnalysisSetupMenuSelectionFromScroll\(menuItems, viewGrid\)/);
assert.match(setupSource, /data-analysis-setup-scroll-target/);
assert.match(setupSource, /requestAnimationFrame/);
assert.doesNotMatch(setupSource, /data-analysis-setup-view-tab/);
assert.doesNotMatch(setupSource, /data-analysis-setup-view-panel/);
assert.doesNotMatch(setupSource, /data-analysis-setup-current-view/);
assert.doesNotMatch(setupSource, /hashchange/);
assert.doesNotMatch(setupSource, /getAnalysisSetupViewFromHash/);
assert.doesNotMatch(setupSource, /updateAnalysisSetupViewHash/);
assert.doesNotMatch(setupSource, /analysisSetupScrollMode/);
assert.doesNotMatch(setupSource, /bindAnalysisSetupViewScrollSync/);
assert.doesNotMatch(setupSource, /getAnalysisSetupViewFromScroll/);
assert.match(setupSource, /function getLinkedProfileDisplayName\(record\)/);
assert.match(setupSource, /function syncLinkedProfileDisplay\(record\)/);
assert.match(setupSource, /assumptionsProfileName\.textContent = profileName/);
assert.doesNotMatch(setupSource, /data-analysis-setup-header-toggle/);
assert.doesNotMatch(setupSource, /is-header-collapsed/);
assert.match(setupSource, /function setAssumptionsOverlayOpen\(isOpen\)/);
assert.match(setupSource, /assumptionsOverlay\.hidden = false/);
assert.match(setupSource, /assumptionsOverlay\.hidden = true/);
assert.match(setupSource, /assumptionsOverlay\.removeAttribute\("aria-hidden"\)/);
assert.match(setupSource, /assumptionsOverlay\.setAttribute\("aria-hidden", "true"\)/);
assert.match(setupSource, /assumptionsOpenButton\?\.setAttribute\("aria-expanded", "true"\)/);
assert.match(setupSource, /assumptionsOpenButton\?\.setAttribute\("aria-expanded", "false"\)/);
assert.match(setupSource, /document\.body\.classList\.add\("analysis-setup-assumptions-open"\)/);
assert.match(setupSource, /document\.body\.classList\.remove\("analysis-setup-assumptions-open"\)/);
assert.match(setupSource, /assumptionsOverlayReturnFocus/);
assert.match(setupSource, /returnFocusTarget\.focus\(\)/);
assert.match(setupSource, /function getFocusableAssumptionsOverlayElements\(\)/);
assert.match(setupSource, /assumptionsDialog\.querySelectorAll/);
assert.match(setupSource, /button:not\(\[disabled\]\)/);
assert.match(setupSource, /input:not\(\[disabled\]\):not\(\[type='hidden'\]\)/);
assert.match(setupSource, /function keepFocusInsideAssumptionsOverlay\(event\)/);
assert.match(setupSource, /event\.key !== "Tab"/);
assert.match(setupSource, /event\.shiftKey/);
assert.match(setupSource, /firstElement\.focus\(\)/);
assert.match(setupSource, /lastElement\.focus\(\)/);
assert.match(setupSource, /function setAssumptionsOverlayBackgroundFocusProtection\(isProtected\)/);
assert.match(setupSource, /protectedAssumptionsOverlayBackground/);
assert.match(setupSource, /element\.inert = true/);
assert.match(setupSource, /element\.setAttribute\("aria-hidden", "true"\)/);
assert.match(setupSource, /state\.element\.inert = state\.inert/);
assert.match(setupSource, /function requestAssumptionsOverlayClose\(\)/);
assert.match(setupSource, /hasUnsavedAnalysisSetupChanges/);
assert.match(setupSource, /Save or use Save & Exit before closing LENS assumptions/);
assert.match(setupSource, /Unsaved Analysis Setup changes\. Save before closing assumptions/);
assert.match(setupSource, /assumptionsOpenButton\?\.addEventListener\("click"/);
assert.match(setupSource, /assumptionsCloseButton\?\.addEventListener\("click"/);
assert.match(setupSource, /assumptionsOverlay\?\.addEventListener\("click"/);
assert.match(setupSource, /event\.target === assumptionsOverlay/);
assert.match(setupSource, /document\.addEventListener\("keydown"/);
assert.match(setupSource, /keepFocusInsideAssumptionsOverlay\(event\)/);
assert.match(setupSource, /event\.key === "Escape"/);
assert.match(setupSource, /function saveCurrentAnalysisSetupSettings\(\)/);
assert.match(setupSource, /hasUnsavedAnalysisSetupChanges = false/);
assert.match(setupSource, /hasUnsavedAnalysisSetupChanges = true/);
assert.match(setupSource, /const INCOME_LOSS_IMPACT_ROUTE = "income-loss-impact\.html"/);
assert.match(setupSource, /function getRouteWithCurrentQuery\(path\)/);
assert.match(setupSource, /currentSearch \? `\$\{route\}\$\{currentSearch\}` : route/);

const saveHandlerSection = getSection(
  setupSource,
  'saveButton?.addEventListener("click"',
  'assumptionsSaveExitButton?.addEventListener("click"'
);
assert.match(saveHandlerSection, /saveCurrentAnalysisSetupSettings\(\)/);
assert.doesNotMatch(saveHandlerSection, /setAssumptionsOverlayOpen\(false\)/);

const saveExitHandlerSection = getSection(
  setupSource,
  'assumptionsSaveExitButton?.addEventListener("click"',
  'applyButton?.addEventListener("click"'
);
assert.match(saveExitHandlerSection, /saveCurrentAnalysisSetupSettings\(\)/);
assert.match(saveExitHandlerSection, /setAssumptionsOverlayOpen\(false\)/);

const applyHandlerSection = getSection(
  setupSource,
  'applyButton?.addEventListener("click"',
  'document.addEventListener("DOMContentLoaded"'
);
assert.match(applyHandlerSection, /saveCurrentAnalysisSetupSettings\(\)/);
assert.match(applyHandlerSection, /window\.location\.href = getRouteWithCurrentQuery\(INCOME_LOSS_IMPACT_ROUTE\)/);

assert.match(layoutCss, /\.analysis-setup-entry-screen/);
assert.match(layoutCss, /body\.analysis-setup-assumptions-open/);
assert.match(layoutCss, /\.lens-assumptions-overlay/);
assert.match(layoutCss, /\.lens-assumptions-dialog/);
assert.match(layoutCss, /\.lens-assumptions-overlay[\s\S]*place-items: center/);
assert.match(layoutCss, /\.lens-assumptions-dialog[\s\S]*width: min\(86vw, 82rem\)[\s\S]*height: min\(82vh, 48rem\)/);
assert.match(layoutCss, /\.analysis-setup-view-frame[\s\S]*grid-template-columns: minmax\(12\.5rem, 15\.25rem\) minmax\(0, 1fr\)/);
assert.match(layoutCss, /\.analysis-setup-left-stack[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
assert.match(layoutCss, /\.analysis-setup-control-group--assets[\s\S]*grid-column: 1 \/ -1/);
assert.match(layoutCss, /\.analysis-setup-view-nav[\s\S]*overflow-y: auto/);
assert.match(layoutCss, /\.analysis-setup-panel-body[\s\S]*overflow-y: scroll/);
assert.doesNotMatch(layoutCss, /data-analysis-setup-scroll-mode/);
assert.match(layoutCss, /@media \(max-width: 620px\)/);
assert.match(layoutCss, /@media \(max-height: 640px\)/);
assert.match(layoutCss, /\.analysis-setup-panel-footer[\s\S]*flex-wrap: wrap/);
assert.doesNotMatch(layoutCss, /data-analysis-setup-current-view/);
assert.doesNotMatch(layoutCss, /data-analysis-setup-view-panel/);
assert.doesNotMatch(layoutCss, /lens-assumptions-dialog-header/);
assert.doesNotMatch(layoutCss, /is-header-collapsed/);
assert.match(componentsCss, /\.analysis-setup-entry-screen/);
assert.match(componentsCss, /\.lens-assumptions-overlay[\s\S]*background: rgba\(17, 24, 39, 0\.28\)/);
assert.match(componentsCss, /\.lens-assumptions-dialog/);
assert.match(componentsCss, /\.lens-assumptions-dialog[\s\S]*font-size: 12px/);
assert.match(componentsCss, /\.analysis-setup-action\[data-lens-assumptions-save-exit\]/);
assert.match(componentsCss, /\.analysis-setup-panel-title-row/);
assert.match(componentsCss, /\.analysis-setup-panel-title-separator/);
assert.match(componentsCss, /\.analysis-setup-panel-profile-name/);
assert.match(componentsCss, /\.analysis-setup-view-nav/);
assert.match(componentsCss, /\.analysis-setup-view-nav-section/);
assert.match(componentsCss, /\.analysis-setup-view-nav-item/);
assert.match(componentsCss, /\.analysis-setup-view-nav-item[\s\S]*min-height: 2\.28rem[\s\S]*font-size: 0\.82rem/);
assert.match(componentsCss, /\.analysis-setup-panel-body[\s\S]*padding: clamp\(1\.05rem, 1\.8vw, 1\.8rem\) clamp\(1\.15rem, 2\.2vw, 2\.35rem\) 2\.8rem/);
assert.match(componentsCss, /\.analysis-setup-toggle-control[\s\S]*min-height: 3rem[\s\S]*font-size: 0\.84rem/);
assert.match(componentsCss, /\.analysis-setup-panel-body,\s*[\s\S]*\.analysis-setup-control-group--policy-returns\s*\{[\s\S]*scrollbar-color: #8b8f98 #f3f4f6/);
assert.doesNotMatch(componentsCss, /\.analysis-setup-view-tabs/);
assert.doesNotMatch(componentsCss, /\.analysis-setup-view-tab/);
assert.doesNotMatch(componentsCss, /data-analysis-setup-current-view/);
assert.doesNotMatch(componentsCss, /data-analysis-setup-view-panel/);
assert.doesNotMatch(componentsCss, /data-analysis-setup-scroll-mode/);
assert.doesNotMatch(componentsCss, /lens-assumptions-dialog-header/);
assert.doesNotMatch(componentsCss, /analysis-setup-header-toggle/);
assert.doesNotMatch(componentsCss, /is-header-collapsed/);
assert.match(componentsCss, /@media \(max-width: 620px\)/);
assert.match(componentsCss, /@media \(max-width: 520px\)/);
assert.match(componentsCss, /@media \(max-height: 640px\)/);

const changedFiles = getChangedFiles();
[
  "styles.css",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/projected-asset-offset-calculations.js",
  "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
  "pages/dime-results.html",
  "pages/hlv-results.html",
  "pages/simple-needs-results.html"
].forEach(function (relativePath) {
  assert.equal(
    changedFiles.includes(relativePath),
    false,
    `${relativePath} should not change in the static entry overlay pass`
  );
});

console.log("Analysis Setup entry overlay behavior checks passed.");
