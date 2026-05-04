#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const ACTIVE_MARKER = Object.freeze({
  enabled: true,
  consumptionStatus: "method-active",
  activationVersion: 1
});

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
    "app/features/lens-analysis/debt-taxonomy.js",
    "app/features/lens-analysis/debt-library.js",
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
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
    "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/asset-growth-projection-calculations.js",
    "app/features/lens-analysis/projected-asset-offset-calculations.js",
    "app/features/lens-analysis/cash-reserve-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
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
    source: "projected-asset-offset-method-consumption-check",
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
      emergencyFund: createAssetAssumption(rate, {
        treatmentPreset: "cash-like"
      }),
      taxableBrokerageInvestments: createAssetAssumption(rate, {
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 5
      }),
      traditionalRetirementAssets: createAssetAssumption(rate, {
        treatmentPreset: "taxable-retirement",
        taxTreatment: "ordinary-income-on-distribution",
        taxDragPercent: 25,
        liquidityHaircutPercent: 5
      }),
      primaryResidenceEquity: createAssetAssumption(rate, {
        treatmentPreset: "real-estate-equity",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 25
      }),
      businessPrivateCompanyValue: createAssetAssumption(rate, {
        treatmentPreset: "business-illiquid",
        taxTreatment: "case-specific",
        taxDragPercent: 10,
        liquidityHaircutPercent: 50
      })
    },
    customAssets: []
  };
}

function createSourceData() {
  return {
    cashSavings: 100000,
    cashSavingsIncludeInOffset: true,
    cashSavingsPercentAvailable: 100,
    emergencyFund: 25000,
    emergencyFundIncludeInOffset: true,
    emergencyFundPercentAvailable: 100,
    brokerageAccounts: 200000,
    brokerageAccountsIncludeInOffset: true,
    brokerageAccountsPercentAvailable: 100,
    retirementAssets: 150000,
    retirementAssetsIncludeInOffset: true,
    retirementAssetsPercentAvailable: 100,
    realEstateEquity: 120000,
    realEstateEquityIncludeInOffset: true,
    realEstateEquityPercentAvailable: 100,
    businessValue: 90000,
    businessValueIncludeInOffset: true,
    businessValuePercentAvailable: 100,
    annualIncome: 120000,
    grossAnnualIncome: 120000,
    spouseIncome: 40000,
    yearsIncomeNeeded: 10,
    currentCoverage: 250000,
    mortgageBalance: 180000,
    childcareDependentCareCost: 1000,
    foodCost: 1200,
    transportationCost: 800,
    insuranceCost: 600,
    phoneInternetCost: 250,
    otherHouseholdExpenses: 400,
    estimatedCostPerChild: 0,
    funeralBurialEstimate: 15000,
    medicalEndOfLifeCosts: 5000,
    estateSettlementCosts: 5000,
    immediateLiquidityBuffer: 10000
  };
}

function buildLensModel(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: createSourceData(),
    analysisSettings: {
      valuationDate: "2026-05-04",
      assetTreatmentAssumptions
    },
    profileRecord: {}
  });

  assert.ok(result.lensModel, "Lens model should build.");
  return result.lensModel;
}

function createBaseMethodSettings(context) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  return lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings: {}
  });
}

function createActiveNeedsSettings(context, overrides) {
  const settings = cloneJson(createBaseMethodSettings(context).needsAnalysisSettings);
  return Object.assign(settings, {
    assetGrowthProjectionAssumptions: {
      mode: "projectedOffsets"
    },
    projectedAssetOffsetAssumptions: {
      ...ACTIVE_MARKER
    }
  }, overrides || {});
}

function runAllMethods(context, lensModel, settingsOverrides) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const settings = createBaseMethodSettings(context);
  const dimeSettings = Object.assign({}, settings.dimeSettings, settingsOverrides?.dimeSettings || {});
  const needsSettings = Object.assign({}, settings.needsAnalysisSettings, settingsOverrides?.needsAnalysisSettings || {});
  const hlvSettings = Object.assign({}, settings.humanLifeValueSettings, settingsOverrides?.humanLifeValueSettings || {});

  return {
    dime: lensAnalysis.analysisMethods.runDimeAnalysis(cloneJson(lensModel), dimeSettings),
    needs: lensAnalysis.analysisMethods.runNeedsAnalysis(cloneJson(lensModel), needsSettings),
    hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(cloneJson(lensModel), hlvSettings),
    simpleNeeds: lensAnalysis.analysisMethods.runSimpleNeedsAnalysis(cloneJson(lensModel), {
      supportYears: 10,
      includeAssetOffsets: true,
      ...(settingsOverrides?.simpleNeedsSettings || {})
    })
  };
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find(function (row) { return row?.key === key; })
    : null;
}

function hasWarningCode(result, code) {
  return Array.isArray(result?.warnings)
    && result.warnings.some(function (warning) { return warning?.code === code; });
}

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.analysisMethods.runNeedsAnalysis, "function");
assert.equal(typeof lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings, "function");

const currentDollarModel = buildLensModel(context, createAssetTreatmentAssumptions(6, {
  mode: "currentDollarOnly",
  projectionYears: 30
}));
const reportingOnlyModel = buildLensModel(context, createAssetTreatmentAssumptions(11, {
  mode: "reportingOnly",
  projectionYears: 30
}));
const projectedOffsetsModel = buildLensModel(context, createAssetTreatmentAssumptions(11, {
  mode: "projectedOffsets",
  projectionYears: 30
}));

const currentOutputs = runAllMethods(context, currentDollarModel);
const reportingOnlyOutputs = runAllMethods(context, reportingOnlyModel);
const projectedOffsetsOutputs = runAllMethods(context, projectedOffsetsModel);

assert.deepEqual(
  cloneJson(reportingOnlyOutputs.needs),
  cloneJson(currentOutputs.needs),
  "reportingOnly projectedAssetOffset should leave LENS unchanged without active marker."
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.needs),
  cloneJson(currentOutputs.needs),
  "saved projectedOffsets should leave LENS unchanged without active marker."
);

const modeOnlyNeeds = lensAnalysis.analysisMethods.runNeedsAnalysis(
  cloneJson(projectedOffsetsModel),
  Object.assign(cloneJson(createBaseMethodSettings(context).needsAnalysisSettings), {
    assetGrowthProjectionAssumptions: {
      mode: "projectedOffsets"
    }
  })
);
assert.deepEqual(
  cloneJson(modeOnlyNeeds),
  cloneJson(currentOutputs.needs),
  "mode projectedOffsets alone must not activate LENS projected offset consumption."
);

const markerWithoutProjectedModeNeeds = lensAnalysis.analysisMethods.runNeedsAnalysis(
  cloneJson(currentDollarModel),
  createActiveNeedsSettings(context, {
    assetGrowthProjectionAssumptions: {
      mode: "currentDollarOnly"
    }
  })
);
assert.deepEqual(
  cloneJson(markerWithoutProjectedModeNeeds),
  cloneJson(currentOutputs.needs),
  "active marker without projectedOffsets mode must not activate LENS projected offset consumption."
);

const missingVersionNeeds = lensAnalysis.analysisMethods.runNeedsAnalysis(
  cloneJson(projectedOffsetsModel),
  createActiveNeedsSettings(context, {
    projectedAssetOffsetAssumptions: {
      enabled: true,
      consumptionStatus: "method-active"
    }
  })
);
assert.deepEqual(
  cloneJson(missingVersionNeeds),
  cloneJson(currentOutputs.needs),
  "projectedOffsets with method-active status but no activationVersion must remain inactive."
);

const markerWithoutExplicitModeNeeds = lensAnalysis.analysisMethods.runNeedsAnalysis(
  cloneJson(projectedOffsetsModel),
  Object.assign(cloneJson(createBaseMethodSettings(context).needsAnalysisSettings), {
    projectedAssetOffsetAssumptions: {
      ...ACTIVE_MARKER
    }
  })
);
assert.deepEqual(
  cloneJson(markerWithoutExplicitModeNeeds),
  cloneJson(currentOutputs.needs),
  "active marker must not infer assetGrowthProjectionAssumptions.mode from the inactive candidate."
);

const activeModelBefore = cloneJson(projectedOffsetsModel);
const activeNeeds = lensAnalysis.analysisMethods.runNeedsAnalysis(
  projectedOffsetsModel,
  createActiveNeedsSettings(context)
);
assert.deepEqual(
  cloneJson(projectedOffsetsModel),
  activeModelBefore,
  "LENS active consumption must not mutate lensModel."
);
assert.equal(
  projectedOffsetsModel.treatedAssetOffsets.totalTreatedAssetValue,
  currentDollarModel.treatedAssetOffsets.totalTreatedAssetValue,
  "Active LENS consumption must not mutate treatedAssetOffsets.totalTreatedAssetValue."
);
assert.equal(
  activeNeeds.commonOffsets.assetOffset,
  projectedOffsetsModel.projectedAssetOffset.effectiveProjectedAssetOffset,
  "Active LENS should consume projectedAssetOffset.effectiveProjectedAssetOffset."
);
assert.notEqual(
  activeNeeds.commonOffsets.assetOffset,
  projectedOffsetsModel.treatedAssetOffsets.totalTreatedAssetValue,
  "Active marker should change LENS asset offset when the projected candidate is valid."
);
assert.equal(activeNeeds.assumptions.effectiveAssetOffsetSource, "projectedAssetOffset");
assert.equal(activeNeeds.assumptions.projectedAssetOffsetConsumed, true);
assert.equal(activeNeeds.assumptions.projectedAssetOffsetGateActive, true);
assert.equal(activeNeeds.assumptions.projectedAssetOffsetActivationVersion, 1);

const activeAssetTrace = findTrace(activeNeeds, "assetOffset");
assert.ok(activeAssetTrace, "Active LENS output should include an assetOffset trace row.");
assert.equal(activeAssetTrace.value, projectedOffsetsModel.projectedAssetOffset.effectiveProjectedAssetOffset);
assert.equal(activeAssetTrace.inputs.projectedAssetOffsetConsumed, true);
assert.equal(activeAssetTrace.inputs.projectedGrowthAdjustment, projectedOffsetsModel.projectedAssetOffset.projectedGrowthAdjustment);
assert.ok(
  activeAssetTrace.sourcePaths.includes("projectedAssetOffset.effectiveProjectedAssetOffset"),
  "Active LENS trace should point to projectedAssetOffset.effectiveProjectedAssetOffset."
);
assert.equal(
  activeNeeds.commonOffsets.assetOffset === projectedOffsetsModel.projectedAssetGrowth.projectedTotalAssetValue,
  false,
  "Active LENS must not consume raw projectedAssetGrowth.projectedTotalAssetValue."
);

const activeMethodOutputs = runAllMethods(context, projectedOffsetsModel, {
  dimeSettings: createActiveNeedsSettings(context, { includeOffsetAssets: true }),
  needsAnalysisSettings: createActiveNeedsSettings(context),
  humanLifeValueSettings: createActiveNeedsSettings(context, { includeOffsetAssets: true }),
  simpleNeedsSettings: createActiveNeedsSettings(context, { includeAssetOffsets: true })
});
const treatedOffsetMethodOutputs = runAllMethods(context, projectedOffsetsModel, {
  dimeSettings: { includeOffsetAssets: true },
  humanLifeValueSettings: { includeOffsetAssets: true },
  simpleNeedsSettings: { includeAssetOffsets: true }
});
assert.deepEqual(
  cloneJson(activeMethodOutputs.dime),
  cloneJson(treatedOffsetMethodOutputs.dime),
  "DIME must remain treated-only even when active marker is present."
);
assert.deepEqual(
  cloneJson(activeMethodOutputs.hlv),
  cloneJson(treatedOffsetMethodOutputs.hlv),
  "HLV must remain treated-only even when active marker is present."
);
assert.deepEqual(
  cloneJson(activeMethodOutputs.simpleNeeds),
  cloneJson(treatedOffsetMethodOutputs.simpleNeeds),
  "Simple Needs must remain treated-only even when active marker is present."
);
assert.notDeepEqual(
  cloneJson(activeMethodOutputs.needs),
  cloneJson(treatedOffsetMethodOutputs.needs),
  "Only LENS should change when the active marker is present."
);

const invalidProjectedModel = cloneJson(projectedOffsetsModel);
invalidProjectedModel.projectedAssetGrowth.projectedTotalAssetValue = 999999999;
invalidProjectedModel.cashReserveProjection = {
  totalAvailableAfterReserve: 999999999,
  consumedByMethods: false
};
invalidProjectedModel.projectedAssetOffset.effectiveProjectedAssetOffset = null;
const invalidFallbackNeeds = lensAnalysis.analysisMethods.runNeedsAnalysis(
  invalidProjectedModel,
  createActiveNeedsSettings(context)
);
assert.equal(
  invalidFallbackNeeds.commonOffsets.assetOffset,
  invalidProjectedModel.treatedAssetOffsets.totalTreatedAssetValue,
  "Invalid active projected offset should fall back to the treated asset offset."
);
assert.equal(invalidFallbackNeeds.assumptions.effectiveAssetOffsetSource, "treated");
assert.equal(invalidFallbackNeeds.assumptions.assetOffsetFallbackUsed, true);
assert.equal(
  invalidFallbackNeeds.assumptions.projectedAssetOffsetFallbackReason,
  "invalid-effective-projected-asset-offset"
);
assert.equal(invalidFallbackNeeds.assumptions.projectedAssetOffsetConsumed, false);
assert.ok(
  hasWarningCode(invalidFallbackNeeds, "projected-asset-offset-active-invalid-treated-fallback"),
  "Invalid active projected offset should record a fallback warning."
);
assert.equal(
  invalidFallbackNeeds.commonOffsets.assetOffset === invalidProjectedModel.projectedAssetGrowth.projectedTotalAssetValue,
  false,
  "Invalid fallback must not consume raw projectedAssetGrowth totals."
);
assert.equal(
  invalidFallbackNeeds.commonOffsets.assetOffset === invalidProjectedModel.cashReserveProjection.totalAvailableAfterReserve,
  false,
  "Invalid fallback must not consume cashReserveProjection."
);

const adapterDefaults = createBaseMethodSettings(context);
assert.doesNotMatch(
  JSON.stringify(adapterDefaults),
  /projectedAssetOffsetAssumptions|activationVersion|method-active/,
  "Current settings adapter defaults must not create the active marker."
);
assert.doesNotMatch(
  readRepoFile("pages/analysis-setup.html")
    + "\n"
    + readRepoFile("app/features/lens-analysis/analysis-setup.js")
    + "\n"
    + readRepoFile("app/features/lens-analysis/schema.js"),
  /projectedAssetOffsetAssumptions|activationVersion/,
  "Current Analysis Setup UI and saved schema must not create the projectedAssetOffset active marker."
);
assert.doesNotMatch(
  readRepoFile("app/features/lens-analysis/step-three-analysis-display.js"),
  /projectedAssetOffset|Projected Asset Offset/,
  "Step 3 display should not render projectedAssetOffset in this backend-readiness pass."
);

console.log("projected-asset-offset-method-consumption-check passed");
