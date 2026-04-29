#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const context = {
  console,
  window: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;

vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

[
  "app/features/lens-analysis/schema.js",
  "app/features/lens-analysis/asset-taxonomy.js",
  "app/features/lens-analysis/block-outputs.js",
  "app/features/lens-analysis/helpers/income-tax-calculations.js",
  "app/features/lens-analysis/helpers/housing-support-calculations.js",
  "app/features/lens-analysis/blocks/existing-coverage.js",
  "app/features/lens-analysis/blocks/offset-assets.js",
  "app/features/lens-analysis/blocks/survivor-scenario.js",
  "app/features/lens-analysis/blocks/tax-context.js",
  "app/features/lens-analysis/blocks/income-net-income.js",
  "app/features/lens-analysis/blocks/debt-payoff.js",
  "app/features/lens-analysis/blocks/housing-ongoing-support.js",
  "app/features/lens-analysis/blocks/non-housing-ongoing-support.js",
  "app/features/lens-analysis/blocks/education-support.js",
  "app/features/lens-analysis/blocks/final-expenses.js",
  "app/features/lens-analysis/blocks/transition-needs.js",
  "app/features/lens-analysis/normalize-lens-model.js",
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/education-funding-projection-calculations.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
].forEach(loadScript);

const lensAnalysis = context.LensApp.lensAnalysis;
const methods = lensAnalysis.analysisMethods;
const settingsAdapter = lensAnalysis.analysisSettingsAdapter;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");
assert.equal(typeof settingsAdapter?.createAnalysisMethodSettings, "function");

const LEGACY_ASSET_OFFSET = 20000;
const TREATED_ASSET_OFFSET = 100000;

function createSourceData() {
  return {
    cashAndCashEquivalents: TREATED_ASSET_OFFSET,
    cashSavings: 40000,
    cashSavingsIncludeInOffset: true,
    cashSavingsPercentAvailable: 50
  };
}

function createAssetTreatmentAssumptions(enabled) {
  return {
    enabled,
    defaultProfile: "check",
    source: "asset-offset-behavior-check",
    assets: {
      cashAndCashEquivalents: {
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      }
    },
    customAssets: []
  };
}

function buildModel(options = {}) {
  const {
    assetTreatmentEnabled = true,
    assetOffsetSource = "legacy",
    includeAssetTreatmentAssumptions = true
  } = options;
  const analysisSettings = {
    methodDefaults: {
      assetOffsetSource,
      fallbackToLegacyOffsetAssets: true
    }
  };
  if (includeAssetTreatmentAssumptions) {
    analysisSettings.assetTreatmentAssumptions = createAssetTreatmentAssumptions(assetTreatmentEnabled);
  }

  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: createSourceData(),
    analysisSettings,
    profileRecord: {}
  });

  assert.ok(result.lensModel, "Lens model should build for asset offset checks.");
  return result.lensModel;
}

function runNeedsAnalysis(lensModel, overrides) {
  return methods.runNeedsAnalysis(lensModel, {
    includeExistingCoverageOffset: true,
    includeOffsetAssets: true,
    assetOffsetSource: "legacy",
    fallbackToLegacyOffsetAssets: true,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: true,
    ...overrides
  });
}

function hasWarningCode(warnings, code) {
  return Array.isArray(warnings) && warnings.some((warning) => warning?.code === code);
}

function assertAssetOffset(result, expected, message) {
  assert.equal(result.commonOffsets.assetOffset, expected, message);
}

const treatedSourceModel = buildModel({
  assetTreatmentEnabled: true,
  assetOffsetSource: "treated"
});
assert.equal(
  treatedSourceModel.treatedAssetOffsets.totalTreatedAssetValue,
  TREATED_ASSET_OFFSET,
  "Treated source should prepare a numeric treated total."
);

const treatedNeeds = runNeedsAnalysis(treatedSourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "treated"
});
assertAssetOffset(
  treatedNeeds,
  TREATED_ASSET_OFFSET,
  "Needs should use treated assets when treated source is selected and treated totals are available."
);
assert.equal(treatedNeeds.assumptions.effectiveAssetOffsetSource, "treated");

const savedDisabledTreatedSourceModel = buildModel({
  assetTreatmentEnabled: false,
  assetOffsetSource: "treated"
});
assert.equal(
  savedDisabledTreatedSourceModel.treatedAssetOffsets.totalTreatedAssetValue,
  TREATED_ASSET_OFFSET,
  "Treated source should prepare treated totals even when legacy enabled metadata is false."
);
assert.equal(
  hasWarningCode(savedDisabledTreatedSourceModel.treatedAssetOffsets.warnings, "asset-treatment-disabled"),
  false,
  "Legacy enabled:false metadata should not create an asset-treatment-disabled warning."
);

const savedDisabledTreatedNeeds = runNeedsAnalysis(savedDisabledTreatedSourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "treated",
  fallbackToLegacyOffsetAssets: true
});
assertAssetOffset(
  savedDisabledTreatedNeeds,
  TREATED_ASSET_OFFSET,
  "Needs should use treated assets when treated source is selected even if legacy enabled metadata is false."
);
assert.equal(savedDisabledTreatedNeeds.assumptions.effectiveAssetOffsetSource, "treated");

const unavailableTreatedSourceModel = buildModel({
  assetOffsetSource: "treated",
  includeAssetTreatmentAssumptions: false
});
assert.equal(
  unavailableTreatedSourceModel.treatedAssetOffsets.totalTreatedAssetValue,
  null,
  "Missing treatment assumptions should leave treated totals unavailable."
);
assert.ok(
  hasWarningCode(unavailableTreatedSourceModel.treatedAssetOffsets.warnings, "missing-asset-treatment-assumptions"),
  "Missing treatment assumptions should record a warning."
);

const unavailableTreatedNeeds = runNeedsAnalysis(unavailableTreatedSourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "treated",
  fallbackToLegacyOffsetAssets: true
});
assertAssetOffset(
  unavailableTreatedNeeds,
  LEGACY_ASSET_OFFSET,
  "Needs should fall back to legacy assets when treated source is selected but treated totals are unavailable."
);
assert.equal(unavailableTreatedNeeds.assumptions.effectiveAssetOffsetSource, "legacy-fallback");
assert.equal(unavailableTreatedNeeds.assumptions.assetOffsetFallbackUsed, true);

const legacySourceModel = buildModel({
  assetTreatmentEnabled: true,
  assetOffsetSource: "legacy"
});
assert.equal(
  legacySourceModel.treatedAssetOffsets.totalTreatedAssetValue,
  null,
  "Legacy source should not expose a method-consumable treated total."
);

const legacyNeeds = runNeedsAnalysis(legacySourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "legacy"
});
assertAssetOffset(
  legacyNeeds,
  LEGACY_ASSET_OFFSET,
  "Needs should use legacy offset assets when legacy source is selected."
);
assert.equal(legacyNeeds.assumptions.effectiveAssetOffsetSource, "legacy");

const disabledOffsetNeeds = runNeedsAnalysis(treatedSourceModel, {
  includeOffsetAssets: false,
  assetOffsetSource: "treated"
});
assertAssetOffset(
  disabledOffsetNeeds,
  0,
  "includeOffsetAssets:false should force a zero asset offset."
);
assert.equal(disabledOffsetNeeds.assumptions.effectiveAssetOffsetSource, "disabled");

const defaultSettings = settingsAdapter.createAnalysisMethodSettings({ analysisSettings: {} });
assert.equal(defaultSettings.dimeSettings.includeOffsetAssets, false);
assert.equal(defaultSettings.humanLifeValueSettings.includeOffsetAssets, false);
assert.equal(defaultSettings.needsAnalysisSettings.includeOffsetAssets, true);
assert.equal(defaultSettings.needsAnalysisSettings.assetOffsetSource, "legacy");

const defaultDime = methods.runDimeAnalysis(legacySourceModel, defaultSettings.dimeSettings);
assertAssetOffset(defaultDime, 0, "DIME default settings should leave asset offsets off.");

const defaultHlv = methods.runHumanLifeValueAnalysis(legacySourceModel, defaultSettings.humanLifeValueSettings);
assertAssetOffset(defaultHlv, 0, "HLV default settings should leave asset offsets off.");

const defaultNeeds = methods.runNeedsAnalysis(legacySourceModel, defaultSettings.needsAnalysisSettings);
assertAssetOffset(defaultNeeds, LEGACY_ASSET_OFFSET, "Needs default settings should use legacy asset offsets.");
assert.equal(defaultNeeds.assumptions.effectiveAssetOffsetSource, "legacy");

console.log("Asset offset behavior checks passed.");
