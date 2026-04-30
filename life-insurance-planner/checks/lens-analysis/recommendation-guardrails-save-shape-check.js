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
const instrumentedSource = source.replace(
  "  LensApp.analysisSetup = Object.assign",
  "  LensApp.__recommendationGuardrailTestHarness = { getRecommendationDraftGuardrails, populateRecommendationGuardrailFields, readValidatedRecommendationGuardrails };\n  LensApp.analysisSetup = Object.assign"
);
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
  "data-analysis-recommendation-enabled",
  "Save future recommendation-engine constraints and warning rules",
  "Does not affect current DIME, Needs, or Human Life Value outputs yet.",
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

assertExcludes(html, 'data-analysis-recommendation-field="enabled"', "analysis-setup.html");
assertExcludes(recommendationSection, "Include Recommendation Guardrails", "Recommendation Guardrails markup");
assertExcludes(recommendationSection, "Apply Recommendation Guardrails", "Recommendation Guardrails markup");
assertExcludes(recommendationSection, "Turn on Recommendation Guardrails", "Recommendation Guardrails markup");
assert.ok(
  recommendationSection.indexOf("data-analysis-recommendation-enabled") < recommendationSection.indexOf("analysis-setup-recommendation-defaults"),
  "Recommendation Guardrails enable toggle should appear above profile presets"
);

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
vm.runInContext(instrumentedSource, context, { filename: analysisSetupJsPath });

const analysisSetup = context.LensApp.analysisSetup;
const harness = context.LensApp.__recommendationGuardrailTestHarness;
assert.ok(analysisSetup, "LensApp.analysisSetup should be exported");
assert.equal(typeof analysisSetup.getRecommendationGuardrails, "function", "getRecommendationGuardrails should be exported");
assert.equal(typeof harness?.getRecommendationDraftGuardrails, "function", "Recommendation draft harness should be available");
assert.equal(typeof harness?.readValidatedRecommendationGuardrails, "function", "Recommendation validation harness should be available");
assert.equal(typeof harness?.populateRecommendationGuardrailFields, "function", "Recommendation populate harness should be available");

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

function createTextField(value) {
  return {
    type: "text",
    tagName: "INPUT",
    value: String(value)
  };
}

function createCheckbox(checked) {
  return {
    type: "checkbox",
    tagName: "INPUT",
    checked: Boolean(checked)
  };
}

function createProfileButton(profile) {
  return {
    dataset: {},
    attributes: {
      "data-analysis-recommendation-profile": profile
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}

function createRecommendationFields(enabled) {
  return {
    enabled: createCheckbox(enabled),
    defaultProfile: "balanced",
    defaultProfileButtons: ["conservative", "balanced", "aggressive", "custom"].map(createProfileButton),
    values: {
      "riskTolerance.maxRelianceOnAssetsPercent": createTextField("50"),
      "riskTolerance.maxRelianceOnIlliquidAssetsPercent": createTextField("25"),
      "riskTolerance.maxRelianceOnSurvivorIncomePercent": createTextField("50"),
      "confidenceRules.flagMissingCriticalInputs": createCheckbox(true),
      "confidenceRules.flagHeavyAssetReliance": createCheckbox(true),
      "confidenceRules.flagHeavySurvivorIncomeReliance": createCheckbox(true),
      "confidenceRules.flagGroupCoverageReliance": createCheckbox(true)
    },
    preview: {
      currentMode: { textContent: "" },
      engineStatus: { textContent: "" },
      savedFor: { textContent: "" }
    },
    currentAssumptions: defaults
  };
}

const checkedFields = createRecommendationFields(true);
const uncheckedFields = createRecommendationFields(false);
assert.equal(
  harness.getRecommendationDraftGuardrails(checkedFields).enabled,
  true,
  "Draft Recommendation Guardrails should read checked enabled state"
);
assert.equal(
  harness.getRecommendationDraftGuardrails(uncheckedFields).enabled,
  false,
  "Draft Recommendation Guardrails should read unchecked enabled state"
);
assert.equal(
  harness.readValidatedRecommendationGuardrails(checkedFields).value.enabled,
  true,
  "Validated Recommendation Guardrails should save checked enabled state"
);
assert.equal(
  harness.readValidatedRecommendationGuardrails(uncheckedFields).value.enabled,
  false,
  "Validated Recommendation Guardrails should save unchecked enabled state"
);

const populatedFields = createRecommendationFields(false);
harness.populateRecommendationGuardrailFields(populatedFields, loaded);
assert.equal(
  populatedFields.enabled.checked,
  true,
  "Populate Recommendation Guardrails should load saved enabled state into the visible toggle"
);

console.log("Recommendation Guardrails save-shape check passed.");
