#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const analysisSetupHtmlPath = path.join(repoRoot, "pages", "analysis-setup.html");
const analysisSetupJsPath = path.join(repoRoot, "app", "features", "lens-analysis", "analysis-setup.js");
const currentOutputCheckPath = path.join(__dirname, "recommendation-guardrails-current-output-check.js");

const html = fs.readFileSync(analysisSetupHtmlPath, "utf8");
const source = fs.readFileSync(analysisSetupJsPath, "utf8");
const retiredConservativeRangeFlag = "showMinimumRecommended" + "ConservativeRange";

function assertIncludes(text, needle, label) {
  assert.ok(text.includes(needle), `${label} should include ${needle}`);
}

function assertExcludes(text, needle, label) {
  assert.equal(text.includes(needle), false, `${label} should not include ${needle}`);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

const recommendationSectionStart = html.indexOf("analysis-setup-control-group--recommendation");
assert.notEqual(recommendationSectionStart, -1, "Recommendation Guardrails section should exist");
const recommendationSectionEnd = html.indexOf("analysis-setup-action-row", recommendationSectionStart);
const recommendationSection = html.slice(
  recommendationSectionStart,
  recommendationSectionEnd === -1 ? html.length : recommendationSectionEnd
);

[
  'data-analysis-recommendation-field="recommendationTarget.mode"',
  'data-analysis-recommendation-field="recommendationTarget.minimumCoverageFloor"',
  'data-analysis-recommendation-field="recommendationTarget.maximumCoverageCap"',
  'data-analysis-recommendation-field="recommendationTarget.roundingIncrement"',
  'data-analysis-recommendation-field="confidenceRules.minimumConfidencePercent"',
  'data-analysis-recommendation-field="presentationRules.showMethodComparison"',
  'data-analysis-recommendation-field="presentationRules.showWarnings"',
  'data-analysis-recommendation-field="presentationRules.requireAdvisorReviewBeforeRecommendation"',
  `presentationRules.${retiredConservativeRangeFlag}`
].forEach((needle) => {
  assertExcludes(html, needle, "analysis-setup.html");
});

[
  "Target mode",
  "Minimum coverage floor",
  "Maximum coverage cap",
  "Rounding increment",
  "Minimum confidence",
  "Presentation rules",
  "Show method comparison",
  "Show warnings",
  "Require advisor review before recommendation"
].forEach((needle) => {
  assertExcludes(recommendationSection, needle, "Recommendation Guardrails markup");
});

[
  'data-analysis-recommendation-profile="conservative"',
  'data-analysis-recommendation-profile="balanced"',
  'data-analysis-recommendation-profile="aggressive"',
  'data-analysis-recommendation-profile="custom"',
  'data-analysis-recommendation-field="riskTolerance.maxRelianceOnAssetsPercent"',
  'data-analysis-recommendation-field="riskTolerance.maxRelianceOnIlliquidAssetsPercent"',
  'data-analysis-recommendation-field="riskTolerance.maxRelianceOnSurvivorIncomePercent"',
  'data-analysis-recommendation-field="confidenceRules.flagMissingCriticalInputs"',
  'data-analysis-recommendation-field="confidenceRules.flagHeavyAssetReliance"',
  'data-analysis-recommendation-field="confidenceRules.flagHeavySurvivorIncomeReliance"',
  'data-analysis-recommendation-field="confidenceRules.flagGroupCoverageReliance"',
  'data-analysis-recommendation-preview="currentMode"',
  'data-analysis-recommendation-preview="engineStatus"',
  'data-analysis-recommendation-preview="savedFor"'
].forEach((needle) => {
  assertIncludes(html, needle, "analysis-setup.html");
});

[
  "recommendationTarget",
  "presentationRules",
  "minimumConfidencePercent",
  retiredConservativeRangeFlag,
  "roundingIncrement",
  "showMethodComparison",
  "showWarnings",
  "requireAdvisorReviewBeforeRecommendation",
  "RECOMMENDATION_TARGET_MODE",
  "MIN_RECOMMENDATION_MONEY",
  "MIN_RECOMMENDATION_ROUNDING_INCREMENT"
].forEach((needle) => {
  assertExcludes(source, needle, "analysis-setup.js");
});

const context = {
  console,
  document: {
    addEventListener() {}
  },
  Intl,
  location: {
    search: ""
  },
  URLSearchParams
};
context.window = context;
context.globalThis = context;
context.LensApp = {};
vm.createContext(context);
vm.runInContext(source, context, { filename: analysisSetupJsPath });

const analysisSetup = context.LensApp.analysisSetup;
assert.ok(analysisSetup, "LensApp.analysisSetup should be exported");
assert.equal(typeof analysisSetup.getRecommendationGuardrails, "function", "getRecommendationGuardrails should be exported");

const defaults = analysisSetup.DEFAULT_RECOMMENDATION_GUARDRAILS;
assert.equal(defaults.enabled, false, "Recommendation Guardrails default enabled metadata should remain false");
assert.equal(defaults.recommendationProfile, "balanced", "Recommendation profile default should remain balanced");
assert.ok(hasOwn(defaults, "riskTolerance"), "Default risk tolerance should remain");
assert.ok(hasOwn(defaults, "confidenceRules"), "Default warning rules should remain");
assert.equal(hasOwn(defaults, "recommendationTarget"), false, "Default recommendationTarget should be retired");
assert.equal(hasOwn(defaults, "presentationRules"), false, "Default presentationRules should be retired");
assert.equal(
  hasOwn(defaults.confidenceRules, "minimumConfidencePercent"),
  false,
  "Default minimumConfidencePercent should be retired"
);

[
  "maxRelianceOnAssetsPercent",
  "maxRelianceOnIlliquidAssetsPercent",
  "maxRelianceOnSurvivorIncomePercent"
].forEach((key) => {
  assert.ok(hasOwn(defaults.riskTolerance, key), `Default riskTolerance.${key} should remain`);
});

[
  "flagMissingCriticalInputs",
  "flagHeavyAssetReliance",
  "flagHeavySurvivorIncomeReliance",
  "flagGroupCoverageReliance"
].forEach((key) => {
  assert.ok(hasOwn(defaults.confidenceRules, key), `Default confidenceRules.${key} should remain`);
});

const loaded = analysisSetup.getRecommendationGuardrails({
  analysisSettings: {
    recommendationGuardrails: {
      enabled: true,
      recommendationProfile: "aggressive",
      recommendationTarget: {
        mode: "custom",
        minimumCoverageFloor: 100000,
        maximumCoverageCap: 1000000,
        roundingIncrement: 25000
      },
      riskTolerance: {
        posture: "custom",
        maxRelianceOnAssetsPercent: 61,
        maxRelianceOnIlliquidAssetsPercent: 22,
        maxRelianceOnSurvivorIncomePercent: 44
      },
      confidenceRules: {
        minimumConfidencePercent: 80,
        flagMissingCriticalInputs: false,
        flagHeavyAssetReliance: false,
        flagHeavySurvivorIncomeReliance: true,
        flagGroupCoverageReliance: false
      },
      source: "legacy-test",
      lastUpdatedAt: "2026-04-30T00:00:00.000Z"
    }
  }
});

assert.equal(loaded.enabled, true, "Loaded enabled metadata should be preserved");
assert.equal(loaded.recommendationProfile, "aggressive", "Loaded profile should be preserved");
assert.equal(loaded.riskTolerance.maxRelianceOnAssetsPercent, 61, "Loaded asset reliance should be preserved");
assert.equal(loaded.riskTolerance.maxRelianceOnIlliquidAssetsPercent, 22, "Loaded illiquid reliance should be preserved");
assert.equal(loaded.riskTolerance.maxRelianceOnSurvivorIncomePercent, 44, "Loaded survivor reliance should be preserved");
assert.equal(loaded.confidenceRules.flagMissingCriticalInputs, false, "Loaded missing-input flag should be preserved");
assert.equal(loaded.confidenceRules.flagHeavyAssetReliance, false, "Loaded asset warning flag should be preserved");
assert.equal(loaded.confidenceRules.flagHeavySurvivorIncomeReliance, true, "Loaded survivor warning flag should be preserved");
assert.equal(loaded.confidenceRules.flagGroupCoverageReliance, false, "Loaded group coverage flag should be preserved");
assert.equal(hasOwn(loaded, "recommendationTarget"), false, "Loaded recommendationTarget should be retired");
assert.equal(hasOwn(loaded, "presentationRules"), false, "Loaded presentationRules should be retired");
assert.equal(
  hasOwn(loaded.confidenceRules, "minimumConfidencePercent"),
  false,
  "Loaded minimumConfidencePercent should be retired"
);
assert.ok(fs.existsSync(currentOutputCheckPath), "Recommendation Guardrails current-output check should exist and be runnable separately");

console.log("Recommendation Guardrails save-shape check passed.");
