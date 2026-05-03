#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLensAnalysisContext(options) {
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const includeAssetGrowthHelper = normalizedOptions.includeAssetGrowthHelper !== false;
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
    includeAssetGrowthHelper
      ? "app/features/lens-analysis/asset-growth-projection-calculations.js"
      : null,
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].filter(Boolean).forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createAssetAssumption(rate, overrides) {
  return Object.assign({
    include: true,
    treatmentPreset: "custom",
    taxTreatment: "no-tax-drag",
    taxDragPercent: 0,
    liquidityHaircutPercent: 0,
    assumedAnnualGrowthRatePercent: rate,
    assumedAnnualGrowthRateSource: "advisor",
    assumedAnnualGrowthRateProfile: "custom",
    growthConsumptionStatus: "saved-only"
  }, overrides || {});
}

function createAssetTreatmentAssumptions(rate, projectionAssumptions) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "asset-growth-model-prep-check",
    assetGrowthProjectionAssumptions: Object.assign({
      mode: "currentDollarOnly",
      projectionYears: 0,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    }, projectionAssumptions || {}),
    assets: {
      cashAndCashEquivalents: createAssetAssumption(rate, {
        treatmentPreset: "cash-like"
      }),
      taxableBrokerageInvestments: createAssetAssumption(rate, {
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 5
      }),
      digitalAssetsCrypto: createAssetAssumption(0, {
        treatmentPreset: "alternative-asset",
        assumedAnnualGrowthRateSource: "taxonomy-default",
        assumedAnnualGrowthRateProfile: "balanced"
      })
    },
    customAssets: []
  };
}

function createSourceData() {
  return {
    cashAndCashEquivalents: 100000,
    taxableBrokerageInvestments: 200000,
    digitalAssetsCrypto: 10000,
    annualIncome: 120000,
    spouseIncome: 40000,
    yearsIncomeNeeded: 10,
    currentCoverage: 250000
  };
}

function buildLensModel(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const sourceData = createSourceData();
  const analysisSettings = {
    valuationDate: "2026-05-03",
    assetTreatmentAssumptions
  };
  const sourceDataBefore = cloneJson(sourceData);
  const assumptionsBefore = cloneJson(assetTreatmentAssumptions);
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord: {}
  });

  assert.deepEqual(sourceData, sourceDataBefore, "model prep should not mutate sourceData");
  assert.deepEqual(
    assetTreatmentAssumptions,
    assumptionsBefore,
    "model prep should not mutate assetTreatmentAssumptions"
  );
  assert.ok(result.lensModel, "Lens model should build");
  return result.lensModel;
}

function createMethodOutputs(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const lensModel = buildLensModel(context, assetTreatmentAssumptions);
  const settings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings: {}
  });

  return {
    treatedAssetOffsets: lensModel.treatedAssetOffsets,
    dime: lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, settings.dimeSettings),
    needs: lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, settings.needsAnalysisSettings),
    hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(
      lensModel,
      settings.humanLifeValueSettings
    )
  };
}

function getWarningByCode(warnings, code) {
  return (Array.isArray(warnings) ? warnings : []).find(function (warning) {
    return warning && warning.code === code;
  });
}

function normalizeScriptPath(pagePath, scriptSource) {
  const pageDirectory = path.dirname(path.join(repoRoot, pagePath));
  const absolutePath = path.resolve(pageDirectory, scriptSource);
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

function getScriptPaths(pagePath) {
  const html = readRepoFile(pagePath);
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map(function (match) {
      return normalizeScriptPath(pagePath, match[1]);
    });
}

function assertAssetGrowthHelperLoadsBeforeModelBuilder(pagePath) {
  const scriptPaths = getScriptPaths(pagePath);
  const helperPath = "app/features/lens-analysis/asset-growth-projection-calculations.js";
  const modelBuilderPath = "app/features/lens-analysis/lens-model-builder.js";
  const helperIndex = scriptPaths.indexOf(helperPath);
  const modelBuilderIndex = scriptPaths.indexOf(modelBuilderPath);

  assert.ok(helperIndex >= 0, `${pagePath} should load ${helperPath}.`);
  assert.ok(modelBuilderIndex >= 0, `${pagePath} should load ${modelBuilderPath}.`);
  assert.ok(
    helperIndex < modelBuilderIndex,
    `${pagePath} should load asset growth projection helper before lens-model-builder.js.`
  );
}

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.calculateAssetGrowthProjection, "function");
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");

const currentDollarModel = buildLensModel(context, createAssetTreatmentAssumptions(6));
const projectedAssetGrowth = currentDollarModel.projectedAssetGrowth;

assert.ok(projectedAssetGrowth, "lensModel.projectedAssetGrowth should exist");
assert.equal(projectedAssetGrowth.source, "asset-growth-projection-calculations");
assert.equal(projectedAssetGrowth.consumedByMethods, false);
assert.equal(projectedAssetGrowth.sourceMode, "currentDollarOnly");
assert.equal(projectedAssetGrowth.projectionMode, "currentDollarOnly");
assert.equal(projectedAssetGrowth.sourceModeSource, "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode");
assert.equal(projectedAssetGrowth.consumptionStatus, "saved-only");
assert.equal(projectedAssetGrowth.projectionYears, 0);
assert.equal(
  projectedAssetGrowth.projectionYearsSource,
  "assetGrowthProjectionAssumptions.currentDollarOnly"
);
assert.equal(projectedAssetGrowth.currentTotalAssetValue, 310000);
assert.equal(projectedAssetGrowth.projectedTotalAssetValue, 310000);
assert.equal(projectedAssetGrowth.totalProjectedGrowthAmount, 0);
assert.equal(projectedAssetGrowth.includedCategoryCount, 3);
assert.equal(projectedAssetGrowth.excludedCategoryCount, 0);
assert.ok(projectedAssetGrowth.reviewWarningCount >= 1);
assert.equal(projectedAssetGrowth.trace.source, "asset-growth-projection-calculations");
assert.equal(projectedAssetGrowth.trace.consumedByMethods, false);
assert.equal(projectedAssetGrowth.trace.sourceMode, "currentDollarOnly");
assert.equal(projectedAssetGrowth.trace.projectionMode, "currentDollarOnly");
assert.equal(projectedAssetGrowth.trace.projectionYears, 0);
assert.ok(Array.isArray(projectedAssetGrowth.includedCategories));
assert.ok(projectedAssetGrowth.includedCategories.some(function (category) {
  return category.categoryKey === "digitalAssetsCrypto"
    && category.reviewRequired === true;
}));
assert.ok(
  getWarningByCode(projectedAssetGrowth.warnings, "asset-growth-review-only-category"),
  "review-only helper warnings should carry through to model prep"
);
assert.ok(
  getWarningByCode(projectedAssetGrowth.warnings, "digital-assets-crypto-growth-review-required"),
  "Digital Assets / Crypto specific warning should carry through"
);
assert.ok(
  getWarningByCode(projectedAssetGrowth.warnings, "asset-growth-projection-saved-only"),
  "model prep should warn that projected asset growth is saved-only"
);
assert.ok(
  getWarningByCode(projectedAssetGrowth.warnings, "asset-growth-projection-current-dollar-only"),
  "currentDollarOnly should warn that projected values use a 0-year current-dollar default"
);

const reportingOnlyModel = buildLensModel(context, createAssetTreatmentAssumptions(6, {
  mode: "reportingOnly",
  projectionYears: 10
}));
const reportingOnlyGrowth = reportingOnlyModel.projectedAssetGrowth;
assert.equal(reportingOnlyGrowth.sourceMode, "reportingOnly");
assert.equal(reportingOnlyGrowth.projectionMode, "reportingOnly");
assert.equal(reportingOnlyGrowth.projectionYears, 10);
assert.equal(
  reportingOnlyGrowth.projectionYearsSource,
  "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.projectionYears"
);
assert.equal(reportingOnlyGrowth.consumedByMethods, false);
assert.equal(reportingOnlyGrowth.currentTotalAssetValue, 310000);
assert.equal(reportingOnlyGrowth.projectedTotalAssetValue, 547254.31);
assert.equal(reportingOnlyGrowth.totalProjectedGrowthAmount, 237254.31);
assert.ok(
  reportingOnlyGrowth.projectedTotalAssetValue > reportingOnlyGrowth.currentTotalAssetValue,
  "reportingOnly should allow projected totals to differ from current totals"
);
assert.equal(reportingOnlyGrowth.trace.sourceMode, "reportingOnly");
assert.equal(reportingOnlyGrowth.trace.projectionYears, 10);
assert.ok(
  getWarningByCode(reportingOnlyGrowth.warnings, "asset-growth-projection-reporting-only"),
  "reportingOnly should warn that projected values are reporting-only and not method-consumed"
);

const projectedOffsetsModel = buildLensModel(context, createAssetTreatmentAssumptions(6, {
  mode: "projectedOffsets",
  projectionYears: 30,
  consumptionStatus: "method-active"
}));
const projectedOffsetsGrowth = projectedOffsetsModel.projectedAssetGrowth;
assert.equal(projectedOffsetsGrowth.sourceMode, "projectedOffsets");
assert.equal(projectedOffsetsGrowth.projectionMode, "projectedOffsetsFutureInactive");
assert.equal(projectedOffsetsGrowth.projectionYears, 0);
assert.equal(
  projectedOffsetsGrowth.projectionYearsSource,
  "assetGrowthProjectionAssumptions.projectedOffsets-future-inactive"
);
assert.equal(projectedOffsetsGrowth.consumptionStatus, "saved-only");
assert.equal(projectedOffsetsGrowth.consumedByMethods, false);
assert.equal(projectedOffsetsGrowth.projectedTotalAssetValue, projectedOffsetsGrowth.currentTotalAssetValue);
assert.ok(
  getWarningByCode(projectedOffsetsGrowth.warnings, "asset-growth-projected-offsets-future-inactive"),
  "projectedOffsets should warn that the mode is future/inactive"
);

const invalidModeModel = buildLensModel(context, createAssetTreatmentAssumptions(6, {
  mode: "activeNow",
  projectionYears: 90
}));
assert.equal(invalidModeModel.projectedAssetGrowth.sourceMode, "currentDollarOnly");
assert.equal(invalidModeModel.projectedAssetGrowth.projectionYears, 0);
assert.ok(
  getWarningByCode(invalidModeModel.projectedAssetGrowth.warnings, "invalid-asset-growth-projection-mode"),
  "invalid source mode should warn and default to currentDollarOnly"
);

const noHelperContext = createLensAnalysisContext({ includeAssetGrowthHelper: false });
const noHelperModel = buildLensModel(noHelperContext, createAssetTreatmentAssumptions(6));
assert.equal(noHelperModel.projectedAssetGrowth.consumedByMethods, false);
assert.equal(noHelperModel.projectedAssetGrowth.projectionMode, "currentDollarOnly");
assert.ok(
  getWarningByCode(noHelperModel.projectedAssetGrowth.warnings, "missing-asset-growth-projection-helper"),
  "model prep should fail closed when helper is unavailable"
);

const baseOutputs = createMethodOutputs(context, createAssetTreatmentAssumptions(2, {
  mode: "currentDollarOnly",
  projectionYears: 0
}));
const changedOutputs = createMethodOutputs(context, createAssetTreatmentAssumptions(11, {
  mode: "reportingOnly",
  projectionYears: 40
}));
const projectedOffsetsOutputs = createMethodOutputs(context, createAssetTreatmentAssumptions(11, {
  mode: "projectedOffsets",
  projectionYears: 40
}));
assert.deepEqual(
  cloneJson(changedOutputs),
  cloneJson(baseOutputs),
  "reportingOnly projected asset growth should not change treated offsets or DIME/Needs/HLV outputs"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs),
  cloneJson(baseOutputs),
  "projectedOffsets must remain future/inactive and not change treated offsets or DIME/Needs/HLV outputs"
);

[
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /projectedAssetGrowth|calculateAssetGrowthProjection|asset-growth-projection-calculations/,
    `${relativePath} should not consume or render projected asset growth`
  );
});

const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.match(
  stepThreeSource,
  /Projected Asset Growth/,
  "Step 3 may render projected asset growth as reporting-only display"
);
assert.doesNotMatch(
  stepThreeSource,
  /calculateAssetGrowthProjection|asset-growth-projection-calculations/,
  "Step 3 should not call or load the asset growth projection helper"
);

assert.match(
  readRepoFile("app/features/lens-analysis/lens-model-builder.js"),
  /calculateAssetGrowthProjection/,
  "lens-model-builder should prepare projected asset growth through the pure helper"
);
assert.match(
  readRepoFile("app/features/lens-analysis/lens-model-builder.js"),
  /assetGrowthProjectionAssumptions/,
  "lens-model-builder should read saved source-mode assumptions for reporting-only model prep"
);

assertAssetGrowthHelperLoadsBeforeModelBuilder("pages/analysis-estimate.html");
assertAssetGrowthHelperLoadsBeforeModelBuilder("pages/income-loss-impact.html");

console.log("asset-growth-model-prep-check passed");
