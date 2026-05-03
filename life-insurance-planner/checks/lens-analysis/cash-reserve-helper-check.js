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

function createHelperContext() {
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
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/asset-library.js",
    "app/features/lens-analysis/cash-reserve-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createLensAnalysisContext(includeCashReserveHelper) {
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
    includeCashReserveHelper ? "app/features/lens-analysis/cash-reserve-calculations.js" : null,
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

function createAsset(assetId, categoryKey, typeKey, label, currentValue, sourceKey) {
  return {
    assetId,
    categoryKey,
    typeKey,
    label,
    currentValue,
    sourceKey: sourceKey || null
  };
}

function createBaseAssetFacts() {
  return {
    assets: [
      createAsset("cash_1", "cashAndCashEquivalents", "checkingAccount", "Checking", 50000, "cashAndCashEquivalents"),
      createAsset("hysa_1", "cashAndCashEquivalents", "highYieldSavingsAccount", "High-Yield Savings", 20000),
      createAsset("emergency_1", "emergencyFund", "emergencyFundReserve", "Emergency Fund", 10000)
    ]
  };
}

function createReserveAssumptions(overrides) {
  return Object.assign({
    enabled: true,
    mode: "reportingOnly",
    reserveMethod: "monthsOfEssentialExpenses",
    reserveMonths: 6,
    fixedReserveAmount: 0,
    expenseBasis: "essentialSupport",
    applyToAssetScope: "cashAndCashEquivalents",
    excludeEmergencyFundAssets: true,
    includeHealthcareExpenses: false,
    includeDiscretionaryExpenses: false,
    source: "analysis-setup",
    consumptionStatus: "saved-only"
  }, overrides || {});
}

function createOngoingSupport(overrides) {
  return Object.assign({
    monthlyTotalEssentialSupportCost: 5000,
    monthlyHousingSupportCost: 3000,
    monthlyNonHousingEssentialSupportCost: 2000,
    monthlyDiscretionaryPersonalSpending: 1000,
    annualDiscretionaryPersonalSpending: 12000
  }, overrides || {});
}

function calculate(context, input) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const result = lensAnalysis.calculateCashReserveProjection(input);
  return cloneJson(result);
}

function buildHelperInput(context, overrides) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  return Object.assign({
    assetFacts: createBaseAssetFacts(),
    cashReserveAssumptions: createReserveAssumptions(),
    ongoingSupport: createOngoingSupport(),
    assetTaxonomy: lensAnalysis.assetTaxonomy,
    assetLibrary: lensAnalysis.assetLibrary,
    valuationDate: "2026-05-03",
    valuationDateSource: "test"
  }, overrides || {});
}

function hasWarning(result, code) {
  return Array.isArray(result.warnings) && result.warnings.some(function (warning) {
    return warning && warning.code === code;
  });
}

function findAsset(collection, typeKey) {
  return collection.find(function (asset) {
    return asset.typeKey === typeKey;
  });
}

function createAssetTreatmentAssumptions(cashReserveAssumptions) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "cash-reserve-helper-check",
    cashReserveAssumptions,
    assetGrowthProjectionAssumptions: {
      mode: "reportingOnly",
      projectionYears: 10,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    },
    assets: {
      cashAndCashEquivalents: {
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0,
        assumedAnnualGrowthRatePercent: 2,
        assumedAnnualGrowthRateSource: "advisor",
        assumedAnnualGrowthRateProfile: "custom",
        growthConsumptionStatus: "saved-only"
      },
      emergencyFund: {
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0,
        assumedAnnualGrowthRatePercent: 0.5,
        assumedAnnualGrowthRateSource: "advisor",
        assumedAnnualGrowthRateProfile: "custom",
        growthConsumptionStatus: "saved-only"
      }
    },
    customAssets: []
  };
}

function createSourceData() {
  return {
    cashAndCashEquivalents: 100000,
    emergencyFund: 30000,
    annualIncome: 120000,
    spouseIncome: 40000,
    yearsIncomeNeeded: 10,
    currentCoverage: 250000
  };
}

function createMethodOutputs(context, cashReserveAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const sourceData = createSourceData();
  const assetTreatmentAssumptions = createAssetTreatmentAssumptions(cashReserveAssumptions);
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings: {
      valuationDate: "2026-05-03",
      assetTreatmentAssumptions
    },
    profileRecord: {}
  });
  const lensModel = result.lensModel;
  const settings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings: {
      assetTreatmentAssumptions
    },
    lensModel
  });

  return cloneJson({
    treatedAssetOffsets: lensModel.treatedAssetOffsets,
    projectedAssetGrowth: lensModel.projectedAssetGrowth,
    dime: lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, settings.dimeSettings),
    needs: lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, settings.needsAnalysisSettings),
    hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(lensModel, settings.humanLifeValueSettings)
  });
}

const helperContext = createHelperContext();
const lensAnalysis = helperContext.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.calculateCashReserveProjection, "function", "helper export should exist");

const baseInput = buildHelperInput(helperContext);
const baseInputBefore = cloneJson(baseInput);
const baseResult = calculate(helperContext, baseInput);
assert.deepEqual(cloneJson(baseInput), baseInputBefore, "helper should not mutate input");
assert.equal(baseResult.source, "cash-reserve-calculations");
assert.equal(baseResult.consumedByMethods, false);
assert.equal(baseResult.mode, "reportingOnly");
assert.equal(baseResult.reserveMethod, "monthsOfEssentialExpenses");
assert.equal(baseResult.reserveMonths, 6);
assert.equal(baseResult.monthlyReserveBasis, 5000);
assert.equal(baseResult.requiredReserveAmount, 30000);
assert.equal(baseResult.totalCashEquivalentValue, 70000);
assert.equal(baseResult.totalExplicitEmergencyFundValue, 10000);
assert.equal(baseResult.emergencyFundReservedAmount, 10000);
assert.equal(baseResult.remainingReserveNeededAfterEmergencyFund, 20000);
assert.equal(baseResult.cashAvailableAboveReserve, 50000);
assert.equal(baseResult.totalReservedAmount, 30000);
assert.equal(baseResult.totalAvailableAfterReserve, 50000);
assert.ok(hasWarning(baseResult, "cash-reserve-reporting-only"));
assert.ok(hasWarning(baseResult, "cash-reserve-emergency-fund-preserved"));
assert.equal(findAsset(baseResult.includedAssets, "highYieldSavingsAccount").classification, "cash-equivalent");
assert.equal(findAsset(baseResult.includedAssets, "emergencyFundReserve").classification, "explicit-emergency-reserve");

const fixedDollarResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    reserveMethod: "fixedDollarAmount",
    fixedReserveAmount: 25000
  })
}));
assert.equal(fixedDollarResult.reserveMethod, "fixedDollarAmount");
assert.equal(fixedDollarResult.requiredReserveAmount, 25000);
assert.equal(fixedDollarResult.remainingReserveNeededAfterEmergencyFund, 15000);
assert.equal(fixedDollarResult.cashAvailableAboveReserve, 55000);

const clampedResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    mode: "active",
    reserveMethod: "invalid",
    reserveMonths: 50,
    fixedReserveAmount: 99999999,
    expenseBasis: "bad",
    applyToAssetScope: "allAssets"
  })
}));
assert.equal(clampedResult.mode, "reportingOnly");
assert.equal(clampedResult.reserveMethod, "monthsOfEssentialExpenses");
assert.equal(clampedResult.reserveMonths, 24);
assert.equal(clampedResult.fixedReserveAmount, 10000000);
assert.equal(clampedResult.expenseBasis, "essentialSupport");
assert.equal(clampedResult.applyToAssetScope, "cashAndCashEquivalents");
assert.ok(hasWarning(clampedResult, "invalid-cash-reserve-mode"));
assert.ok(hasWarning(clampedResult, "invalid-cash-reserve-method"));
assert.ok(hasWarning(clampedResult, "invalid-cash-reserve-months-clamped"));
assert.ok(hasWarning(clampedResult, "invalid-fixed-cash-reserve-amount-clamped"));

const defaultedResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    reserveMonths: "not-a-number",
    fixedReserveAmount: ""
  })
}));
assert.equal(defaultedResult.reserveMonths, 6);
assert.equal(defaultedResult.fixedReserveAmount, 0);
assert.ok(hasWarning(defaultedResult, "invalid-cash-reserve-months"));
assert.ok(hasWarning(defaultedResult, "invalid-fixed-cash-reserve-amount"));

const specialAssetResult = calculate(helperContext, buildHelperInput(helperContext, {
  assetFacts: {
    assets: [
      createAsset("sinking_1", "cashAndCashEquivalents", "sinkingFund", "Sinking Fund", 5000),
      createAsset("escrow_1", "cashAndCashEquivalents", "escrowedCash", "Escrowed Cash", 6000),
      createAsset("business_1", "cashAndCashEquivalents", "businessCashReserve", "Business Cash Reserve", 7000)
    ]
  }
}));
assert.equal(findAsset(specialAssetResult.reviewAssets, "sinkingFund").classification, "reserve-review");
assert.equal(findAsset(specialAssetResult.excludedAssets, "escrowedCash").classification, "restricted-or-escrowed");
assert.equal(findAsset(specialAssetResult.reviewAssets, "businessCashReserve").classification, "business-reserve-review");
assert.equal(specialAssetResult.totalRestrictedOrEscrowedCashValue, 6000);
assert.equal(specialAssetResult.totalBusinessReserveValue, 7000);
assert.ok(hasWarning(specialAssetResult, "cash-reserve-restricted-cash-excluded"));
assert.ok(hasWarning(specialAssetResult, "cash-reserve-business-reserve-review-required"));

const insufficientResult = calculate(helperContext, buildHelperInput(helperContext, {
  assetFacts: {
    assets: [
      createAsset("cash_1", "cashAndCashEquivalents", "checkingAccount", "Checking", 20000),
      createAsset("emergency_1", "emergencyFund", "emergencyFundReserve", "Emergency Fund", 10000)
    ]
  },
  ongoingSupport: createOngoingSupport({
    monthlyTotalEssentialSupportCost: 10000
  })
}));
assert.equal(insufficientResult.requiredReserveAmount, 60000);
assert.equal(insufficientResult.totalReservedAmount, 30000);
assert.equal(insufficientResult.cashAvailableAboveReserve, 0);
assert.ok(hasWarning(insufficientResult, "insufficient-cash-reserve-assets"));

const healthcareBasisResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    expenseBasis: "essentialPlusHealthcare",
    includeHealthcareExpenses: true
  })
}));
assert.equal(healthcareBasisResult.monthlyReserveBasis, 5000);
assert.ok(hasWarning(healthcareBasisResult, "healthcare-reserve-basis-unavailable"));

const discretionaryBasisResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    expenseBasis: "essentialPlusHealthcareAndDiscretionary",
    includeHealthcareExpenses: true,
    includeDiscretionaryExpenses: true
  }),
  ongoingSupport: createOngoingSupport({
    monthlyDiscretionaryPersonalSpending: null,
    annualDiscretionaryPersonalSpending: 12000
  })
}));
assert.equal(discretionaryBasisResult.monthlyReserveBasis, 6000);
assert.ok(hasWarning(discretionaryBasisResult, "healthcare-reserve-basis-unavailable"));

const missingDiscretionaryResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    expenseBasis: "essentialPlusHealthcareAndDiscretionary",
    includeDiscretionaryExpenses: true
  }),
  ongoingSupport: {
    monthlyTotalEssentialSupportCost: 5000
  }
}));
assert.equal(missingDiscretionaryResult.monthlyReserveBasis, 5000);
assert.ok(hasWarning(missingDiscretionaryResult, "missing-monthly-discretionary-reserve-basis"));

const missingEssentialResult = calculate(helperContext, buildHelperInput(helperContext, {
  ongoingSupport: {}
}));
assert.equal(missingEssentialResult.monthlyReserveBasis, 0);
assert.equal(missingEssentialResult.requiredReserveAmount, 0);
assert.ok(hasWarning(missingEssentialResult, "missing-monthly-essential-support-basis"));

const emergencyIncludedResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    excludeEmergencyFundAssets: false
  })
}));
assert.equal(emergencyIncludedResult.emergencyFundReservedAmount, 0);
assert.equal(emergencyIncludedResult.cashAvailableAboveReserve, 50000);
assert.ok(hasWarning(emergencyIncludedResult, "cash-reserve-emergency-fund-included-in-cash-pool"));

const futureModeResult = calculate(helperContext, buildHelperInput(helperContext, {
  cashReserveAssumptions: createReserveAssumptions({
    mode: "methodActiveFuture"
  })
}));
assert.equal(futureModeResult.mode, "methodActiveFuture");
assert.equal(futureModeResult.consumedByMethods, false);
assert.ok(hasWarning(futureModeResult, "cash-reserve-method-active-future-inactive"));

const helperSource = readRepoFile("app/features/lens-analysis/cash-reserve-calculations.js");
[
  /calculateAssetTreatment/,
  /calculateAssetGrowthProjection/,
  /analysisMethods/,
  /runDimeAnalysis|runNeedsAnalysis|runHumanLifeValueAnalysis/,
  /buildLensModel|lens-model-builder/,
  /document\./,
  /querySelector/,
  /localStorage|sessionStorage/,
  /step-three|stepThree/
].forEach(function (pattern) {
  assert.doesNotMatch(
    helperSource,
    pattern,
    `cash reserve helper should not reference ${pattern}`
  );
});

const baselineContext = createLensAnalysisContext(false);
const helperLoadedContext = createLensAnalysisContext(true);
const baselineOutputs = createMethodOutputs(baselineContext, createReserveAssumptions());
const helperLoadedOutputs = createMethodOutputs(helperLoadedContext, createReserveAssumptions({
  enabled: true,
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  fixedReserveAmount: 50000,
  expenseBasis: "essentialPlusHealthcareAndDiscretionary",
  applyToAssetScope: "selectedAssetsFuture",
  excludeEmergencyFundAssets: false,
  includeHealthcareExpenses: true,
  includeDiscretionaryExpenses: true
}));
assert.deepEqual(helperLoadedOutputs.treatedAssetOffsets, baselineOutputs.treatedAssetOffsets);
assert.deepEqual(helperLoadedOutputs.projectedAssetGrowth, baselineOutputs.projectedAssetGrowth);
assert.deepEqual(helperLoadedOutputs.dime, baselineOutputs.dime);
assert.deepEqual(helperLoadedOutputs.needs, baselineOutputs.needs);
assert.deepEqual(helperLoadedOutputs.hlv, baselineOutputs.hlv);

console.log("cash-reserve-helper-check passed");
