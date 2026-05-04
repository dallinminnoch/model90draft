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
  "  LensApp.__recommendationGuardrailTestHarness = { applyRecommendationProfile, getRecommendationDraftGuardrails, populateRecommendationGuardrailFields, readValidatedRecommendationGuardrails };\n  LensApp.analysisSetup = Object.assign"
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
  'data-analysis-recommendation-field="riskTolerance.maxRelianceOnAssetsPercent"',
  'data-analysis-recommendation-field="riskTolerance.maxRelianceOnIlliquidAssetsPercent"',
  'data-analysis-recommendation-field="riskTolerance.maxRelianceOnSurvivorIncomePercent"',
  'data-analysis-recommendation-field="confidenceRules.minimumConfidencePercent"',
  'data-analysis-recommendation-field="confidenceRules.flagMissingCriticalInputs"',
  'data-analysis-recommendation-field="confidenceRules.flagHeavyAssetReliance"',
  'data-analysis-recommendation-field="confidenceRules.flagHeavySurvivorIncomeReliance"',
  'data-analysis-recommendation-field="confidenceRules.flagGroupCoverageReliance"',
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
  "Risk tolerance",
  "Max reliance on assets",
  "Max reliance on illiquid assets",
  "Max reliance on survivor income",
  "Minimum confidence",
  "Warning rules",
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
  "Does not affect current DIME, LENS, or Human Life Value outputs yet.",
  'data-analysis-recommendation-profile="conservative"',
  'data-analysis-recommendation-profile="balanced"',
  'data-analysis-recommendation-profile="aggressive"',
  'data-analysis-recommendation-profile="custom"',
  "Reliance warning thresholds",
  "Saved for the future recommendation engine only. These thresholds will flag recommendations when reliance exceeds the selected level. They do not change current DIME, LENS, or Human Life Value outputs.",
  "Flag when asset reliance exceeds",
  "Flag when illiquid asset reliance exceeds",
  "Flag when survivor income reliance exceeds",
  'data-analysis-recommendation-field="riskThresholds.assetReliance.warningThresholdPercent"',
  'data-analysis-recommendation-field="riskThresholds.illiquidAssetReliance.warningThresholdPercent"',
  'data-analysis-recommendation-field="riskThresholds.survivorIncomeReliance.warningThresholdPercent"',
  "Recommendation range constraints",
  "Saved for the future recommendation engine only. These settings do not change current DIME, LENS, or Human Life Value outputs.",
  "If future lower and upper bounds conflict, MODEL90 will flag the recommendation for advisor review.",
  'data-analysis-recommendation-field="rangeConstraints.lowerBound.source"',
  'data-analysis-recommendation-field="rangeConstraints.lowerBound.tolerancePercent"',
  'data-analysis-recommendation-field="rangeConstraints.upperBound.source"',
  'data-analysis-recommendation-field="rangeConstraints.upperBound.tolerancePercent"',
  "Recommendation risk flags",
  "Saved for the future recommendation engine only. These flags will support explainable recommendation review and do not change current DIME, LENS, or Human Life Value outputs.",
  'data-analysis-recommendation-field="riskFlags.flagMissingCriticalInputs"',
  'data-analysis-recommendation-field="riskFlags.flagHeavyAssetReliance"',
  'data-analysis-recommendation-field="riskFlags.flagHeavySurvivorIncomeReliance"',
  'data-analysis-recommendation-field="riskFlags.flagGroupCoverageReliance"',
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
assert.ok(
  recommendationSection.indexOf("<h4>Reliance warning thresholds</h4>") < recommendationSection.indexOf("<h4>Recommendation range constraints</h4>"),
  "Recommendation range constraints should appear after Reliance warning thresholds"
);
assert.ok(
  recommendationSection.indexOf("<h4>Recommendation range constraints</h4>") < recommendationSection.indexOf("<h4>Recommendation risk flags</h4>"),
  "Recommendation range constraints should appear before Recommendation risk flags"
);

[
  "recommendationTarget",
  "presentationRules",
  "riskTolerance",
  "maxRelianceOnAssetsPercent",
  "maxRelianceOnIlliquidAssetsPercent",
  "maxRelianceOnSurvivorIncomePercent",
  "confidenceRules",
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
assert.equal(typeof harness?.applyRecommendationProfile, "function", "Recommendation profile harness should be available");
assert.equal(typeof harness?.getRecommendationDraftGuardrails, "function", "Recommendation draft harness should be available");
assert.equal(typeof harness?.readValidatedRecommendationGuardrails, "function", "Recommendation validation harness should be available");
assert.equal(typeof harness?.populateRecommendationGuardrailFields, "function", "Recommendation populate harness should be available");

const defaults = analysisSetup.DEFAULT_RECOMMENDATION_GUARDRAILS;
assert.equal(defaults.enabled, false, "Recommendation Guardrails default enabled metadata should remain false");
assert.equal(defaults.recommendationProfile, "balanced", "Recommendation profile default should remain balanced");
assert.equal(hasOwn(defaults, "riskTolerance"), false, "Default riskTolerance should be retired");
assert.ok(hasOwn(defaults, "riskThresholds"), "Default risk thresholds should exist");
assert.ok(hasOwn(defaults, "rangeConstraints"), "Default range constraints should exist");
assert.equal(hasOwn(defaults, "confidenceRules"), false, "Default confidenceRules should be retired");
assert.ok(hasOwn(defaults, "riskFlags"), "Default risk flags should exist");
assert.equal(hasOwn(defaults, "recommendationTarget"), false, "Default recommendationTarget should be retired");
assert.equal(hasOwn(defaults, "presentationRules"), false, "Default presentationRules should be retired");

assert.equal(defaults.riskThresholds.assetReliance.warningThresholdPercent, 40, "Default asset reliance warning threshold should be 40%");
assert.equal(defaults.riskThresholds.illiquidAssetReliance.warningThresholdPercent, 25, "Default illiquid asset reliance warning threshold should be 25%");
assert.equal(defaults.riskThresholds.survivorIncomeReliance.warningThresholdPercent, 35, "Default survivor income reliance warning threshold should be 35%");

assert.equal(defaults.rangeConstraints.lowerBound.source, "needsAnalysis", "Default lower range source should be LENS Analysis");
assert.equal(defaults.rangeConstraints.lowerBound.tolerancePercent, 25, "Default lower range tolerance should be 25%");
assert.equal(defaults.rangeConstraints.upperBound.source, "humanLifeValue", "Default upper range source should be Human Life Value");
assert.equal(defaults.rangeConstraints.upperBound.tolerancePercent, 25, "Default upper range tolerance should be 25%");
assert.equal(defaults.rangeConstraints.conflictHandling, "flagForAdvisorReview", "Default range conflict handling should flag for advisor review");

[
  "flagMissingCriticalInputs",
  "flagHeavyAssetReliance",
  "flagHeavySurvivorIncomeReliance",
  "flagGroupCoverageReliance"
].forEach((key) => {
  assert.ok(hasOwn(defaults.riskFlags, key), `Default riskFlags.${key} should exist`);
  assert.equal(defaults.riskFlags[key], true, `Default riskFlags.${key} should default to true`);
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
      riskThresholds: {
        assetReliance: {
          warningThresholdPercent: 41
        },
        illiquidAssetReliance: {
          warningThresholdPercent: 23
        },
        survivorIncomeReliance: {
          warningThresholdPercent: 37
        }
      },
      rangeConstraints: {
        lowerBound: {
          source: "dime",
          tolerancePercent: 12
        },
        upperBound: {
          source: "needsAnalysis",
          tolerancePercent: 33
        },
        conflictHandling: "flagForAdvisorReview"
      },
      confidenceRules: {
        minimumConfidencePercent: 80,
        flagMissingCriticalInputs: true,
        flagHeavyAssetReliance: true,
        flagHeavySurvivorIncomeReliance: false,
        flagGroupCoverageReliance: true
      },
      riskFlags: {
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
assert.equal(hasOwn(loaded, "riskTolerance"), false, "Loaded riskTolerance should be retired");
assert.equal(loaded.riskThresholds.assetReliance.warningThresholdPercent, 41, "Loaded asset reliance threshold should be preserved");
assert.equal(loaded.riskThresholds.illiquidAssetReliance.warningThresholdPercent, 23, "Loaded illiquid asset reliance threshold should be preserved");
assert.equal(loaded.riskThresholds.survivorIncomeReliance.warningThresholdPercent, 37, "Loaded survivor income reliance threshold should be preserved");
assert.equal(loaded.rangeConstraints.lowerBound.source, "dime", "Loaded lower range source should be preserved");
assert.equal(loaded.rangeConstraints.lowerBound.tolerancePercent, 12, "Loaded lower range tolerance should be preserved");
assert.equal(loaded.rangeConstraints.upperBound.source, "needsAnalysis", "Loaded upper range source should be preserved");
assert.equal(loaded.rangeConstraints.upperBound.tolerancePercent, 33, "Loaded upper range tolerance should be preserved");
assert.equal(loaded.rangeConstraints.conflictHandling, "flagForAdvisorReview", "Loaded range conflict handling should be preserved");
assert.equal(hasOwn(loaded, "confidenceRules"), false, "Loaded confidenceRules should be retired");
assert.equal(loaded.riskFlags.flagMissingCriticalInputs, false, "Loaded missing-input risk flag should be preserved");
assert.equal(loaded.riskFlags.flagHeavyAssetReliance, false, "Loaded asset risk flag should be preserved");
assert.equal(loaded.riskFlags.flagHeavySurvivorIncomeReliance, true, "Loaded survivor risk flag should be preserved");
assert.equal(loaded.riskFlags.flagGroupCoverageReliance, false, "Loaded group coverage risk flag should be preserved");
assert.equal(hasOwn(loaded, "recommendationTarget"), false, "Loaded recommendationTarget should be retired");
assert.equal(hasOwn(loaded, "presentationRules"), false, "Loaded presentationRules should be retired");
assert.ok(fs.existsSync(currentOutputCheckPath), "Recommendation Guardrails current-output check should exist and be runnable separately");

function createTextField(value) {
  return {
    type: "text",
    tagName: "INPUT",
    value: String(value)
  };
}

function createSelectField(value) {
  return {
    type: "select-one",
    tagName: "SELECT",
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
      "riskThresholds.assetReliance.warningThresholdPercent": createTextField("40"),
      "riskThresholds.illiquidAssetReliance.warningThresholdPercent": createTextField("25"),
      "riskThresholds.survivorIncomeReliance.warningThresholdPercent": createTextField("35"),
      "rangeConstraints.lowerBound.source": createSelectField("needsAnalysis"),
      "rangeConstraints.lowerBound.tolerancePercent": createTextField("25"),
      "rangeConstraints.upperBound.source": createSelectField("humanLifeValue"),
      "rangeConstraints.upperBound.tolerancePercent": createTextField("25"),
      "riskFlags.flagMissingCriticalInputs": createCheckbox(true),
      "riskFlags.flagHeavyAssetReliance": createCheckbox(true),
      "riskFlags.flagHeavySurvivorIncomeReliance": createCheckbox(true),
      "riskFlags.flagGroupCoverageReliance": createCheckbox(true)
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

const editedRangeFields = createRecommendationFields(true);
editedRangeFields.values["rangeConstraints.lowerBound.source"].value = "dime";
editedRangeFields.values["rangeConstraints.lowerBound.tolerancePercent"].value = "15";
editedRangeFields.values["rangeConstraints.upperBound.source"].value = "needsAnalysis";
editedRangeFields.values["rangeConstraints.upperBound.tolerancePercent"].value = "35";
const editedDraft = harness.getRecommendationDraftGuardrails(editedRangeFields);
assert.equal(editedDraft.rangeConstraints.lowerBound.source, "dime", "Draft Recommendation Guardrails should read edited lower source");
assert.equal(editedDraft.rangeConstraints.lowerBound.tolerancePercent, 15, "Draft Recommendation Guardrails should read edited lower tolerance");
assert.equal(editedDraft.rangeConstraints.upperBound.source, "needsAnalysis", "Draft Recommendation Guardrails should read edited upper source");
assert.equal(editedDraft.rangeConstraints.upperBound.tolerancePercent, 35, "Draft Recommendation Guardrails should read edited upper tolerance");
assert.equal(editedDraft.rangeConstraints.conflictHandling, "flagForAdvisorReview", "Draft Recommendation Guardrails should preserve default range conflict handling");

const editedThresholdFields = createRecommendationFields(true);
editedThresholdFields.values["riskThresholds.assetReliance.warningThresholdPercent"].value = "45";
editedThresholdFields.values["riskThresholds.illiquidAssetReliance.warningThresholdPercent"].value = "20";
editedThresholdFields.values["riskThresholds.survivorIncomeReliance.warningThresholdPercent"].value = "30";
const editedThresholdDraft = harness.getRecommendationDraftGuardrails(editedThresholdFields);
assert.equal(editedThresholdDraft.riskThresholds.assetReliance.warningThresholdPercent, 45, "Draft Recommendation Guardrails should read edited asset reliance threshold");
assert.equal(editedThresholdDraft.riskThresholds.illiquidAssetReliance.warningThresholdPercent, 20, "Draft Recommendation Guardrails should read edited illiquid asset reliance threshold");
assert.equal(editedThresholdDraft.riskThresholds.survivorIncomeReliance.warningThresholdPercent, 30, "Draft Recommendation Guardrails should read edited survivor income reliance threshold");

const editedRiskFlagFields = createRecommendationFields(true);
editedRiskFlagFields.values["riskFlags.flagMissingCriticalInputs"].checked = false;
editedRiskFlagFields.values["riskFlags.flagHeavyAssetReliance"].checked = false;
editedRiskFlagFields.values["riskFlags.flagHeavySurvivorIncomeReliance"].checked = true;
editedRiskFlagFields.values["riskFlags.flagGroupCoverageReliance"].checked = false;
const editedRiskFlagDraft = harness.getRecommendationDraftGuardrails(editedRiskFlagFields);
assert.equal(editedRiskFlagDraft.riskFlags.flagMissingCriticalInputs, false, "Draft Recommendation Guardrails should read edited missing-input risk flag");
assert.equal(editedRiskFlagDraft.riskFlags.flagHeavyAssetReliance, false, "Draft Recommendation Guardrails should read edited asset risk flag");
assert.equal(editedRiskFlagDraft.riskFlags.flagHeavySurvivorIncomeReliance, true, "Draft Recommendation Guardrails should read edited survivor risk flag");
assert.equal(editedRiskFlagDraft.riskFlags.flagGroupCoverageReliance, false, "Draft Recommendation Guardrails should read edited group coverage risk flag");

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
const validatedRange = harness.readValidatedRecommendationGuardrails(editedRangeFields).value.rangeConstraints;
assert.equal(validatedRange.lowerBound.source, "dime", "Validated Recommendation Guardrails should save edited lower source");
assert.equal(validatedRange.lowerBound.tolerancePercent, 15, "Validated Recommendation Guardrails should save edited lower tolerance");
assert.equal(validatedRange.upperBound.source, "needsAnalysis", "Validated Recommendation Guardrails should save edited upper source");
assert.equal(validatedRange.upperBound.tolerancePercent, 35, "Validated Recommendation Guardrails should save edited upper tolerance");
assert.equal(validatedRange.conflictHandling, "flagForAdvisorReview", "Validated Recommendation Guardrails should save default range conflict handling");
const validatedThresholds = harness.readValidatedRecommendationGuardrails(editedThresholdFields).value.riskThresholds;
assert.equal(validatedThresholds.assetReliance.warningThresholdPercent, 45, "Validated Recommendation Guardrails should save edited asset reliance threshold");
assert.equal(validatedThresholds.illiquidAssetReliance.warningThresholdPercent, 20, "Validated Recommendation Guardrails should save edited illiquid asset reliance threshold");
assert.equal(validatedThresholds.survivorIncomeReliance.warningThresholdPercent, 30, "Validated Recommendation Guardrails should save edited survivor income reliance threshold");
const validatedRiskFlags = harness.readValidatedRecommendationGuardrails(editedRiskFlagFields).value.riskFlags;
assert.equal(validatedRiskFlags.flagMissingCriticalInputs, false, "Validated Recommendation Guardrails should save edited missing-input risk flag");
assert.equal(validatedRiskFlags.flagHeavyAssetReliance, false, "Validated Recommendation Guardrails should save edited asset risk flag");
assert.equal(validatedRiskFlags.flagHeavySurvivorIncomeReliance, true, "Validated Recommendation Guardrails should save edited survivor risk flag");
assert.equal(validatedRiskFlags.flagGroupCoverageReliance, false, "Validated Recommendation Guardrails should save edited group coverage risk flag");

const populatedFields = createRecommendationFields(false);
harness.populateRecommendationGuardrailFields(populatedFields, loaded);
assert.equal(
  populatedFields.enabled.checked,
  true,
  "Populate Recommendation Guardrails should load saved enabled state into the visible toggle"
);
assert.equal(
  populatedFields.values["riskThresholds.assetReliance.warningThresholdPercent"].value,
  "41",
  "Populate Recommendation Guardrails should load saved asset reliance threshold"
);
assert.equal(
  populatedFields.values["riskThresholds.illiquidAssetReliance.warningThresholdPercent"].value,
  "23",
  "Populate Recommendation Guardrails should load saved illiquid asset reliance threshold"
);
assert.equal(
  populatedFields.values["riskThresholds.survivorIncomeReliance.warningThresholdPercent"].value,
  "37",
  "Populate Recommendation Guardrails should load saved survivor income reliance threshold"
);
assert.equal(
  populatedFields.values["rangeConstraints.lowerBound.source"].value,
  "dime",
  "Populate Recommendation Guardrails should load saved lower source"
);
assert.equal(
  populatedFields.values["rangeConstraints.lowerBound.tolerancePercent"].value,
  "12",
  "Populate Recommendation Guardrails should load saved lower tolerance"
);
assert.equal(
  populatedFields.values["rangeConstraints.upperBound.source"].value,
  "needsAnalysis",
  "Populate Recommendation Guardrails should load saved upper source"
);
assert.equal(
  populatedFields.values["rangeConstraints.upperBound.tolerancePercent"].value,
  "33",
  "Populate Recommendation Guardrails should load saved upper tolerance"
);
assert.equal(
  populatedFields.values["riskFlags.flagMissingCriticalInputs"].checked,
  false,
  "Populate Recommendation Guardrails should load saved missing-input risk flag"
);
assert.equal(
  populatedFields.values["riskFlags.flagHeavyAssetReliance"].checked,
  false,
  "Populate Recommendation Guardrails should load saved asset risk flag"
);
assert.equal(
  populatedFields.values["riskFlags.flagHeavySurvivorIncomeReliance"].checked,
  true,
  "Populate Recommendation Guardrails should load saved survivor risk flag"
);
assert.equal(
  populatedFields.values["riskFlags.flagGroupCoverageReliance"].checked,
  false,
  "Populate Recommendation Guardrails should load saved group coverage risk flag"
);

const conservativeFields = createRecommendationFields(true);
conservativeFields.values["riskFlags.flagMissingCriticalInputs"].checked = false;
conservativeFields.values["riskFlags.flagHeavyAssetReliance"].checked = false;
conservativeFields.values["riskFlags.flagHeavySurvivorIncomeReliance"].checked = false;
conservativeFields.values["riskFlags.flagGroupCoverageReliance"].checked = false;
harness.applyRecommendationProfile(conservativeFields, "conservative");
assert.equal(
  conservativeFields.values["riskThresholds.assetReliance.warningThresholdPercent"].value,
  "35",
  "Conservative profile should set asset reliance threshold"
);
assert.equal(
  conservativeFields.values["riskThresholds.illiquidAssetReliance.warningThresholdPercent"].value,
  "10",
  "Conservative profile should set illiquid asset reliance threshold"
);
assert.equal(
  conservativeFields.values["riskThresholds.survivorIncomeReliance.warningThresholdPercent"].value,
  "35",
  "Conservative profile should set survivor income reliance threshold"
);
assert.equal(conservativeFields.values["riskFlags.flagMissingCriticalInputs"].checked, true, "Conservative profile should set missing-input risk flag");
assert.equal(conservativeFields.values["riskFlags.flagHeavyAssetReliance"].checked, true, "Conservative profile should set asset risk flag");
assert.equal(conservativeFields.values["riskFlags.flagHeavySurvivorIncomeReliance"].checked, true, "Conservative profile should set survivor risk flag");
assert.equal(conservativeFields.values["riskFlags.flagGroupCoverageReliance"].checked, true, "Conservative profile should set group coverage risk flag");

const aggressiveFields = createRecommendationFields(true);
aggressiveFields.values["riskFlags.flagMissingCriticalInputs"].checked = false;
aggressiveFields.values["riskFlags.flagHeavyAssetReliance"].checked = false;
aggressiveFields.values["riskFlags.flagHeavySurvivorIncomeReliance"].checked = false;
aggressiveFields.values["riskFlags.flagGroupCoverageReliance"].checked = false;
harness.applyRecommendationProfile(aggressiveFields, "aggressive");
assert.equal(
  aggressiveFields.values["riskThresholds.assetReliance.warningThresholdPercent"].value,
  "70",
  "Aggressive profile should set asset reliance threshold"
);
assert.equal(
  aggressiveFields.values["riskThresholds.illiquidAssetReliance.warningThresholdPercent"].value,
  "40",
  "Aggressive profile should set illiquid asset reliance threshold"
);
assert.equal(
  aggressiveFields.values["riskThresholds.survivorIncomeReliance.warningThresholdPercent"].value,
  "70",
  "Aggressive profile should set survivor income reliance threshold"
);
assert.equal(aggressiveFields.values["riskFlags.flagMissingCriticalInputs"].checked, true, "Aggressive profile should set missing-input risk flag");
assert.equal(aggressiveFields.values["riskFlags.flagHeavyAssetReliance"].checked, true, "Aggressive profile should set asset risk flag");
assert.equal(aggressiveFields.values["riskFlags.flagHeavySurvivorIncomeReliance"].checked, true, "Aggressive profile should set survivor risk flag");
assert.equal(aggressiveFields.values["riskFlags.flagGroupCoverageReliance"].checked, true, "Aggressive profile should set group coverage risk flag");

console.log("Recommendation Guardrails save-shape check passed.");
