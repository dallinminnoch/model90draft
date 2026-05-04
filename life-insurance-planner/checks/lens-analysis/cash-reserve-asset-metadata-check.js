#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createLensAnalysisContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/asset-library.js",
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
    "app/features/lens-analysis/asset-growth-projection-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function categoryMapFrom(taxonomy) {
  return new Map(taxonomy.DEFAULT_ASSET_CATEGORIES.map(function (category) {
    return [category.categoryKey, category];
  }));
}

function assertReserveMetadata(target, expected, label, taxonomy) {
  assert.ok(target, `${label} should exist`);
  assert.ok(
    taxonomy.ASSET_RESERVE_ROLES.includes(target.reserveRole),
    `${label} reserveRole should use an allowed value`
  );
  assert.ok(
    taxonomy.ASSET_RESERVE_TREATMENT_DEFAULTS.includes(target.reserveTreatmentDefault),
    `${label} reserveTreatmentDefault should use an allowed value`
  );
  assert.equal(target.reserveRole, expected.reserveRole, `${label} reserveRole should match`);
  assert.equal(
    target.reserveTreatmentDefault,
    expected.reserveTreatmentDefault,
    `${label} reserveTreatmentDefault should match`
  );
  assert.equal(target.reserveEligible, expected.reserveEligible, `${label} reserveEligible should match`);
  assert.equal(target.reservedByDefault, expected.reservedByDefault, `${label} reservedByDefault should match`);
  assert.equal(
    target.reserveReviewRequired,
    expected.reserveReviewRequired,
    `${label} reserveReviewRequired should match`
  );
  assert.equal(typeof target.reserveRationale, "string", `${label} reserveRationale should be a string`);
  assert.ok(target.reserveRationale.length > 0, `${label} reserveRationale should explain the default`);
}

function createAssetAssumption() {
  return {
    include: true,
    treatmentPreset: "cash-like",
    taxTreatment: "no-tax-drag",
    taxDragPercent: 0,
    liquidityHaircutPercent: 0,
    assumedAnnualGrowthRatePercent: 2,
    assumedAnnualGrowthRateSource: "taxonomy-default",
    assumedAnnualGrowthRateProfile: "balanced",
    growthConsumptionStatus: "saved-only"
  };
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find(function (entry) {
      return entry?.key === key;
    })
    : null;
}

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const taxonomy = lensAnalysis.assetTaxonomy;
const assetLibrary = lensAnalysis.assetLibrary;
const methods = lensAnalysis.analysisMethods;
const settingsAdapter = lensAnalysis.analysisSettingsAdapter;

assert.ok(taxonomy, "asset taxonomy should be exported");
assert.ok(assetLibrary, "asset library should be exported");
assert.deepEqual(Array.from(taxonomy.ASSET_RESERVE_ROLES), [
  "cashEquivalent",
  "emergencyReserve",
  "reserveEligible",
  "escrowedRestricted",
  "businessReserve",
  "review"
]);
assert.deepEqual(Array.from(taxonomy.ASSET_RESERVE_TREATMENT_DEFAULTS), [
  "availableForOffset",
  "preserveAsReserve",
  "availableAboveReserve",
  "review",
  "excluded"
]);

const categoryMap = categoryMapFrom(taxonomy);
assertReserveMetadata(
  categoryMap.get("cashAndCashEquivalents"),
  {
    reserveRole: "cashEquivalent",
    reserveTreatmentDefault: "availableAboveReserve",
    reserveEligible: true,
    reservedByDefault: false,
    reserveReviewRequired: false
  },
  "cashAndCashEquivalents",
  taxonomy
);
assertReserveMetadata(
  categoryMap.get("emergencyFund"),
  {
    reserveRole: "emergencyReserve",
    reserveTreatmentDefault: "preserveAsReserve",
    reserveEligible: true,
    reservedByDefault: true,
    reserveReviewRequired: true
  },
  "emergencyFund",
  taxonomy
);

const highYieldSavingsEntry = assetLibrary.findAssetLibraryEntry("highYieldSavingsAccount");
assert.equal(highYieldSavingsEntry.categoryKey, "cashAndCashEquivalents");
assertReserveMetadata(
  highYieldSavingsEntry,
  {
    reserveRole: "cashEquivalent",
    reserveTreatmentDefault: "availableAboveReserve",
    reserveEligible: true,
    reservedByDefault: false,
    reserveReviewRequired: false
  },
  "highYieldSavingsAccount",
  taxonomy
);
assert.equal(
  categoryMap.has("highYieldSavingsAccount"),
  false,
  "high-yield savings should remain a type under Cash & Cash Equivalents, not a visible category"
);

assertReserveMetadata(
  assetLibrary.findAssetLibraryEntry("emergencyFundReserve"),
  {
    reserveRole: "emergencyReserve",
    reserveTreatmentDefault: "preserveAsReserve",
    reserveEligible: true,
    reservedByDefault: true,
    reserveReviewRequired: true
  },
  "emergencyFundReserve",
  taxonomy
);
assert.equal(assetLibrary.findAssetLibraryEntry("emergencyFundReserve").categoryKey, "emergencyFund");

assertReserveMetadata(
  assetLibrary.findAssetLibraryEntry("sinkingFund"),
  {
    reserveRole: "reserveEligible",
    reserveTreatmentDefault: "preserveAsReserve",
    reserveEligible: true,
    reservedByDefault: true,
    reserveReviewRequired: true
  },
  "sinkingFund",
  taxonomy
);
assertReserveMetadata(
  assetLibrary.findAssetLibraryEntry("businessCashReserve"),
  {
    reserveRole: "businessReserve",
    reserveTreatmentDefault: "review",
    reserveEligible: true,
    reservedByDefault: false,
    reserveReviewRequired: true
  },
  "businessCashReserve",
  taxonomy
);
assertReserveMetadata(
  assetLibrary.findAssetLibraryEntry("escrowedCash"),
  {
    reserveRole: "escrowedRestricted",
    reserveTreatmentDefault: "excluded",
    reserveEligible: false,
    reservedByDefault: true,
    reserveReviewRequired: true
  },
  "escrowedCash",
  taxonomy
);

[
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/asset-growth-projection-calculations.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-methods.js"
].forEach(function (relativePath) {
  assert.doesNotMatch(
    readRepoFile(relativePath),
    /\breserveRole\b|\breserveTreatmentDefault\b|\breserveEligible\b|\breservedByDefault\b|\breserveReviewRequired\b|\breserveRationale\b/,
    `${relativePath} should not consume reserve metadata in this metadata-only pass`
  );
});

const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.match(
  stepThreeSource,
  /renderCashReserveProjectionReportingDetail/,
  "Step 3 may render prepared cash reserve metadata summaries as reporting-only display"
);
assert.match(
  stepThreeSource,
  /reserve role:/,
  "Step 3 cash reserve display may format reserve metadata already present on model summaries"
);
assert.doesNotMatch(
  stepThreeSource,
  /assetTaxonomy|assetLibrary|calculateCashReserveProjection|cash-reserve-calculations/,
  "Step 3 should not look up or calculate reserve metadata"
);

const analysisSettings = {
  assetTreatmentAssumptions: {
    enabled: true,
    defaultProfile: "balanced",
    source: "cash-reserve-asset-metadata-check",
    assets: {
      cashAndCashEquivalents: createAssetAssumption(),
      emergencyFund: createAssetAssumption()
    },
    customAssets: [],
    assetGrowthProjectionAssumptions: {
      mode: "reportingOnly",
      projectionYears: 10,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    }
  }
};
const sourceData = {
  cashAndCashEquivalents: 100000,
  emergencyFund: 30000
};
const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
  sourceData,
  analysisSettings,
  profileRecord: {}
});
const lensModel = result.lensModel;

assert.ok(lensModel, "Lens model should build");
assert.equal(
  lensModel.treatedAssetOffsets.totalTreatedAssetValue,
  130000,
  "Reserve metadata should not change treatedAssetOffsets or withhold emergency funds yet"
);
assert.equal(
  lensModel.projectedAssetGrowth.consumedByMethods,
  false,
  "projectedAssetGrowth should remain non-method-active"
);

const methodSettings = settingsAdapter.createAnalysisMethodSettings({ analysisSettings });
const dime = methods.runDimeAnalysis(lensModel, methodSettings.dimeSettings);
const needs = methods.runNeedsAnalysis(lensModel, methodSettings.needsAnalysisSettings);
const hlv = methods.runHumanLifeValueAnalysis(lensModel, methodSettings.humanLifeValueSettings);

assert.equal(dime.commonOffsets.assetOffset, 0, "DIME default output should not be changed by reserve metadata");
assert.equal(hlv.commonOffsets.assetOffset, 0, "HLV default output should not be changed by reserve metadata");
assert.equal(needs.commonOffsets.assetOffset, 130000, "Needs should continue to use treatedAssetOffsets unchanged");
assert.ok(
  findTrace(needs, "assetOffset")?.sourcePaths?.includes("treatedAssetOffsets.totalTreatedAssetValue"),
  "Needs should still trace asset offset to treatedAssetOffsets"
);

console.log("cash-reserve-asset-metadata-check passed");
