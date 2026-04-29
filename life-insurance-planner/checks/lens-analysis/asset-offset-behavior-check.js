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

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function getTraceInput(result, key, inputName) {
  const trace = findTrace(result, key);
  return trace?.inputs ? trace.inputs[inputName] : undefined;
}

const treatedSourceModel = buildModel({
  assetTreatmentEnabled: true,
  assetOffsetSource: "legacy"
});
assert.equal(
  treatedSourceModel.treatedAssetOffsets.totalTreatedAssetValue,
  TREATED_ASSET_OFFSET,
  "Scalar PMI assets should feed a numeric treated total."
);
assert.equal(
  treatedSourceModel.treatedAssetOffsets.metadata.assetOffsetSource,
  "treated",
  "Model prep should expose treated as the method-ready asset offset source."
);

const treatedNeeds = runNeedsAnalysis(treatedSourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "legacy",
  fallbackToLegacyOffsetAssets: true
});
assertAssetOffset(
  treatedNeeds,
  TREATED_ASSET_OFFSET,
  "Needs should use treated assets when treated totals are available, ignoring old source/fallback fields."
);
assert.equal(treatedNeeds.assumptions.effectiveAssetOffsetSource, "treated");
assert.equal(treatedNeeds.assumptions.assetOffsetFallbackUsed, false);
assert.equal(getTraceInput(treatedNeeds, "assetOffset", "fallbackUsed"), false);
assert.equal(getTraceInput(treatedNeeds, "assetOffset", "treatedAssetOffsetsAvailable"), true);

const savedDisabledTreatedSourceModel = buildModel({
  assetTreatmentEnabled: false,
  assetOffsetSource: "legacy"
});
assert.equal(
  savedDisabledTreatedSourceModel.treatedAssetOffsets.totalTreatedAssetValue,
  TREATED_ASSET_OFFSET,
  "Treated prep should ignore old enabled:false metadata."
);
assert.equal(
  hasWarningCode(savedDisabledTreatedSourceModel.treatedAssetOffsets.warnings, "asset-treatment-disabled"),
  false,
  "Legacy enabled:false metadata should not create an asset-treatment-disabled warning."
);

const savedDisabledTreatedNeeds = runNeedsAnalysis(savedDisabledTreatedSourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "legacy",
  fallbackToLegacyOffsetAssets: true
});
assertAssetOffset(
  savedDisabledTreatedNeeds,
  TREATED_ASSET_OFFSET,
  "Needs should use treated assets even if old enabled metadata is false."
);
assert.equal(savedDisabledTreatedNeeds.assumptions.effectiveAssetOffsetSource, "treated");

const defaultedTreatmentModel = buildModel({
  assetOffsetSource: "legacy",
  includeAssetTreatmentAssumptions: false
});
assert.equal(
  defaultedTreatmentModel.treatedAssetOffsets.totalTreatedAssetValue,
  TREATED_ASSET_OFFSET,
  "Missing saved treatment assumptions should still use helper defaults for treated totals."
);
assert.ok(
  hasWarningCode(defaultedTreatmentModel.treatedAssetOffsets.warnings, "missing-asset-treatment-assumption"),
  "Missing per-category treatment assumptions should record a helper default warning."
);

const unavailableTreatedSourceModel = {
  ...treatedSourceModel,
  treatedAssetOffsets: {
    ...treatedSourceModel.treatedAssetOffsets,
    totalTreatedAssetValue: null
  }
};
const unavailableTreatedNeeds = runNeedsAnalysis(unavailableTreatedSourceModel, {
  includeOffsetAssets: true,
  assetOffsetSource: "legacy",
  fallbackToLegacyOffsetAssets: true
});
assertAssetOffset(
  unavailableTreatedNeeds,
  0,
  "Needs should use a zero asset offset when treated totals are unavailable."
);
assert.equal(unavailableTreatedNeeds.assumptions.effectiveAssetOffsetSource, "zero");
assert.equal(unavailableTreatedNeeds.assumptions.assetOffsetFallbackUsed, false);
assert.ok(
  hasWarningCode(unavailableTreatedNeeds.warnings, "treated-offset-assets-unavailable"),
  "Unavailable treated totals should record a warning."
);

const zeroTreatedNeeds = runNeedsAnalysis({
  ...treatedSourceModel,
  treatedAssetOffsets: {
    ...treatedSourceModel.treatedAssetOffsets,
    totalTreatedAssetValue: 0
  }
}, {
  includeOffsetAssets: true
});
assertAssetOffset(
  zeroTreatedNeeds,
  0,
  "A numeric treated total of 0 should remain a zero asset offset without becoming unavailable."
);
assert.equal(zeroTreatedNeeds.assumptions.effectiveAssetOffsetSource, "treated");
assert.equal(zeroTreatedNeeds.assumptions.assetOffsetStatus, "treated-zero");

const disabledOffsetNeeds = runNeedsAnalysis(treatedSourceModel, {
  includeOffsetAssets: false,
  assetOffsetSource: "legacy",
  fallbackToLegacyOffsetAssets: true
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
assert.equal(defaultSettings.needsAnalysisSettings.assetOffsetSource, "treated");
assert.equal(defaultSettings.needsAnalysisSettings.fallbackToLegacyOffsetAssets, undefined);

const legacySavedSettings = settingsAdapter.createAnalysisMethodSettings({
  analysisSettings: {
    methodDefaults: {
      assetOffsetSource: "legacy",
      fallbackToLegacyOffsetAssets: true
    }
  }
});
assert.equal(legacySavedSettings.needsAnalysisSettings.assetOffsetSource, "treated");
assert.equal(legacySavedSettings.needsAnalysisSettings.fallbackToLegacyOffsetAssets, undefined);

const defaultDime = methods.runDimeAnalysis(treatedSourceModel, defaultSettings.dimeSettings);
assertAssetOffset(defaultDime, 0, "DIME default settings should leave asset offsets off.");

const defaultHlv = methods.runHumanLifeValueAnalysis(treatedSourceModel, defaultSettings.humanLifeValueSettings);
assertAssetOffset(defaultHlv, 0, "HLV default settings should leave asset offsets off.");

const defaultNeeds = methods.runNeedsAnalysis(treatedSourceModel, defaultSettings.needsAnalysisSettings);
assertAssetOffset(defaultNeeds, TREATED_ASSET_OFFSET, "Needs default settings should use treated asset offsets.");
assert.equal(defaultNeeds.assumptions.effectiveAssetOffsetSource, "treated");

console.log("Asset offset behavior checks passed.");
