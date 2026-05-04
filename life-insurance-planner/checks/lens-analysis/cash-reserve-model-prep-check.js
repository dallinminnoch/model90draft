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
  const includeCashReserveHelper = normalizedOptions.includeCashReserveHelper !== false;
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

function createAssetAssumption(overrides) {
  return Object.assign({
    include: true,
    treatmentPreset: "cash-like",
    taxTreatment: "no-tax-drag",
    taxDragPercent: 0,
    liquidityHaircutPercent: 0,
    assumedAnnualGrowthRatePercent: 1,
    assumedAnnualGrowthRateSource: "advisor",
    assumedAnnualGrowthRateProfile: "custom",
    growthConsumptionStatus: "saved-only"
  }, overrides || {});
}

function createAssetTreatmentAssumptions(cashReserveAssumptions) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "cash-reserve-model-prep-check",
    assetGrowthProjectionAssumptions: {
      mode: "reportingOnly",
      projectionYears: 10,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    },
    cashReserveAssumptions,
    assets: {
      cashAndCashEquivalents: createAssetAssumption(),
      emergencyFund: createAssetAssumption({
        assumedAnnualGrowthRatePercent: 0.5
      }),
      taxableBrokerageInvestments: createAssetAssumption({
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 5,
        assumedAnnualGrowthRatePercent: 6
      })
    },
    customAssets: []
  };
}

function createSourceData(overrides) {
  return Object.assign({
    cashAndCashEquivalents: 50000,
    emergencyFund: 10000,
    taxableBrokerageInvestments: 100000,
    calculatedMonthlyMortgagePayment: 3000,
    insuranceCost: 300,
    healthcareOutOfPocketCost: 200,
    foodCost: 900,
    transportationCost: 400,
    childcareDependentCareCost: 0,
    phoneInternetCost: 200,
    householdSuppliesCost: 100,
    otherHouseholdExpenses: 100,
    travelDiscretionaryCost: 500,
    subscriptionsCost: 100,
    annualIncome: 120000,
    spouseIncome: 40000,
    yearsIncomeNeeded: 10,
    currentCoverage: 250000,
    assetRecords: [
      {
        assetId: "asset_record_hysa",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "highYieldSavingsAccount",
        label: "High-Yield Savings",
        currentValue: 20000
      }
    ]
  }, overrides || {});
}

function buildLensModel(context, cashReserveAssumptions, sourceOverrides) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const sourceData = createSourceData(sourceOverrides);
  const assetTreatmentAssumptions = createAssetTreatmentAssumptions(cashReserveAssumptions);
  const analysisSettings = {
    valuationDate: "2026-05-03",
    assetTreatmentAssumptions
  };
  const sourceBefore = cloneJson(sourceData);
  const assumptionsBefore = cloneJson(assetTreatmentAssumptions);
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord: {}
  });

  assert.deepEqual(sourceData, sourceBefore, "model prep should not mutate sourceData");
  assert.deepEqual(
    assetTreatmentAssumptions,
    assumptionsBefore,
    "model prep should not mutate assetTreatmentAssumptions"
  );
  assert.ok(result.lensModel, "Lens model should build");
  return cloneJson(result.lensModel);
}

function createMethodOutputs(context, cashReserveAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const lensModel = buildLensModel(context, cashReserveAssumptions);
  const settings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings: {
      assetTreatmentAssumptions: createAssetTreatmentAssumptions(cashReserveAssumptions)
    },
    lensModel
  });

  return cloneJson({
    treatedAssetOffsets: lensModel.treatedAssetOffsets,
    projectedAssetGrowth: lensModel.projectedAssetGrowth,
    dime: lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, settings.dimeSettings),
    needs: lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, settings.needsAnalysisSettings),
    hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(
      lensModel,
      settings.humanLifeValueSettings
    )
  });
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

function assertCashReserveHelperLoadsBeforeModelBuilder(pagePath) {
  const scriptPaths = getScriptPaths(pagePath);
  const assetLibraryPath = "app/features/lens-analysis/asset-library.js";
  const helperPath = "app/features/lens-analysis/cash-reserve-calculations.js";
  const modelBuilderPath = "app/features/lens-analysis/lens-model-builder.js";
  const assetLibraryIndex = scriptPaths.indexOf(assetLibraryPath);
  const helperIndex = scriptPaths.indexOf(helperPath);
  const modelBuilderIndex = scriptPaths.indexOf(modelBuilderPath);

  assert.ok(assetLibraryIndex >= 0, `${pagePath} should load ${assetLibraryPath}.`);
  assert.ok(helperIndex >= 0, `${pagePath} should load ${helperPath}.`);
  assert.ok(modelBuilderIndex >= 0, `${pagePath} should load ${modelBuilderPath}.`);
  assert.ok(
    assetLibraryIndex < helperIndex,
    `${pagePath} should load asset-library.js before cash-reserve-calculations.js.`
  );
  assert.ok(
    helperIndex < modelBuilderIndex,
    `${pagePath} should load cash-reserve-calculations.js before lens-model-builder.js.`
  );
}

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.calculateCashReserveProjection, "function");
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");

const disabledModel = buildLensModel(context, createReserveAssumptions({ enabled: false }));
const disabledProjection = disabledModel.cashReserveProjection;
assert.ok(disabledProjection, "lensModel.cashReserveProjection should exist");
assert.equal(disabledProjection.source, "cash-reserve-calculations");
assert.equal(disabledProjection.enabled, false);
assert.equal(disabledProjection.applied, false);
assert.equal(disabledProjection.consumedByMethods, false);
assert.equal(disabledProjection.consumptionStatus, "saved-only");
assert.ok(getWarningByCode(disabledProjection.warnings, "cash-reserve-projection-disabled"));
assert.ok(getWarningByCode(disabledProjection.warnings, "cash-reserve-projection-reporting-only"));
assert.ok(getWarningByCode(disabledProjection.warnings, "cash-reserve-not-consumed-by-current-methods"));
assert.ok(getWarningByCode(disabledProjection.warnings, "treated-asset-offsets-unchanged"));

const enabledModel = buildLensModel(context, createReserveAssumptions({
  enabled: true,
  reserveMonths: 6
}));
const enabledProjection = enabledModel.cashReserveProjection;
const monthlyEssentialBasis = enabledModel.ongoingSupport.monthlyTotalEssentialSupportCost;
assert.equal(enabledProjection.enabled, true);
assert.equal(enabledProjection.applied, true);
assert.equal(enabledProjection.reserveMethod, "monthsOfEssentialExpenses");
assert.equal(enabledProjection.monthlyReserveBasis, monthlyEssentialBasis);
assert.equal(enabledProjection.requiredReserveAmount, monthlyEssentialBasis * 6);
assert.equal(enabledProjection.totalExplicitEmergencyFundValue, 10000);
assert.equal(enabledProjection.emergencyFundReservedAmount, 10000);
assert.equal(enabledProjection.totalCashEquivalentValue, 70000);
assert.equal(
  enabledProjection.remainingReserveNeededAfterEmergencyFund,
  Math.max(enabledProjection.requiredReserveAmount - enabledProjection.emergencyFundReservedAmount, 0)
);
assert.equal(
  enabledProjection.cashAvailableAboveReserve,
  Math.max(
    enabledProjection.totalCashEquivalentValue - enabledProjection.remainingReserveNeededAfterEmergencyFund,
    0
  )
);
assert.equal(
  enabledProjection.totalReservedAmount,
  Math.min(
    enabledProjection.requiredReserveAmount,
    enabledProjection.totalExplicitEmergencyFundValue + enabledProjection.totalCashEquivalentValue
  )
);
assert.equal(enabledProjection.totalAvailableAfterReserve, enabledProjection.cashAvailableAboveReserve);
assert.ok(
  enabledProjection.includedAssets.some(function (asset) {
    return asset.typeKey === "highYieldSavingsAccount" && asset.classification === "cash-equivalent";
  }),
  "high-yield savings should carry through as cash-equivalent reserve metadata"
);
assert.ok(
  getWarningByCode(enabledProjection.warnings, "cash-reserve-emergency-fund-preserved"),
  "emergency fund preservation warning should carry through"
);
assert.equal(enabledProjection.trace.consumedByMethods, false);
assert.equal(enabledProjection.trace.consumptionStatus, "saved-only");

const fixedDollarModel = buildLensModel(context, createReserveAssumptions({
  enabled: true,
  reserveMethod: "fixedDollarAmount",
  fixedReserveAmount: 25000
}));
assert.equal(fixedDollarModel.cashReserveProjection.reserveMethod, "fixedDollarAmount");
assert.equal(fixedDollarModel.cashReserveProjection.requiredReserveAmount, 25000);
assert.equal(fixedDollarModel.cashReserveProjection.cashAvailableAboveReserve, 55000);

const insufficientModel = buildLensModel(context, createReserveAssumptions({
  enabled: true,
  reserveMethod: "fixedDollarAmount",
  fixedReserveAmount: 100000
}));
assert.equal(insufficientModel.cashReserveProjection.totalReservedAmount, 80000);
assert.equal(insufficientModel.cashReserveProjection.cashAvailableAboveReserve, 0);
assert.ok(
  getWarningByCode(insufficientModel.cashReserveProjection.warnings, "insufficient-cash-reserve-assets"),
  "insufficient cash warning should carry through"
);

const specialAssetsModel = buildLensModel(context, createReserveAssumptions({ enabled: true }), {
  cashAndCashEquivalents: 0,
  emergencyFund: 0,
  assetRecords: [
    {
      assetId: "asset_record_sinking",
      categoryKey: "cashAndCashEquivalents",
      typeKey: "sinkingFund",
      label: "Sinking Fund",
      currentValue: 5000
    },
    {
      assetId: "asset_record_escrow",
      categoryKey: "cashAndCashEquivalents",
      typeKey: "escrowedCash",
      label: "Escrowed Cash",
      currentValue: 6000
    },
    {
      assetId: "asset_record_business_reserve",
      categoryKey: "cashAndCashEquivalents",
      typeKey: "businessCashReserve",
      label: "Business Cash Reserve",
      currentValue: 7000
    }
  ]
});
assert.ok(
  specialAssetsModel.cashReserveProjection.reviewAssets.some(function (asset) {
    return asset.typeKey === "sinkingFund" && asset.classification === "reserve-review";
  }),
  "sinking fund should be review-classified"
);
assert.ok(
  specialAssetsModel.cashReserveProjection.excludedAssets.some(function (asset) {
    return asset.typeKey === "escrowedCash" && asset.classification === "restricted-or-escrowed";
  }),
  "escrowed cash should be excluded/restricted"
);
assert.ok(
  specialAssetsModel.cashReserveProjection.reviewAssets.some(function (asset) {
    return asset.typeKey === "businessCashReserve" && asset.classification === "business-reserve-review";
  }),
  "business cash reserve should require review"
);
assert.ok(getWarningByCode(
  specialAssetsModel.cashReserveProjection.warnings,
  "cash-reserve-restricted-cash-excluded"
));
assert.ok(getWarningByCode(
  specialAssetsModel.cashReserveProjection.warnings,
  "cash-reserve-business-reserve-review-required"
));

const futureModeModel = buildLensModel(context, createReserveAssumptions({
  enabled: true,
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  fixedReserveAmount: 30000
}));
assert.equal(futureModeModel.cashReserveProjection.mode, "methodActiveFuture");
assert.equal(futureModeModel.cashReserveProjection.consumedByMethods, false);
assert.ok(
  getWarningByCode(futureModeModel.cashReserveProjection.warnings, "cash-reserve-method-active-future-inactive"),
  "helper future-mode warning should carry through"
);
assert.ok(
  getWarningByCode(futureModeModel.cashReserveProjection.warnings, "method-active-future-inactive"),
  "model future-mode warning should carry through"
);

const noHelperContext = createLensAnalysisContext({ includeCashReserveHelper: false });
const noHelperModel = buildLensModel(noHelperContext, createReserveAssumptions({ enabled: true }));
assert.equal(noHelperModel.cashReserveProjection.consumedByMethods, false);
assert.equal(noHelperModel.cashReserveProjection.applied, false);
assert.ok(
  getWarningByCode(noHelperModel.cashReserveProjection.warnings, "missing-cash-reserve-helper"),
  "model prep should fail closed when helper is unavailable"
);

const baseOutputs = createMethodOutputs(context, createReserveAssumptions({
  enabled: false
}));
const enabledOutputs = createMethodOutputs(context, createReserveAssumptions({
  enabled: true,
  reserveMethod: "monthsOfEssentialExpenses",
  reserveMonths: 12,
  expenseBasis: "essentialPlusHealthcareAndDiscretionary",
  applyToAssetScope: "selectedAssetsFuture",
  includeHealthcareExpenses: true,
  includeDiscretionaryExpenses: true
}));
const fixedOutputs = createMethodOutputs(context, createReserveAssumptions({
  enabled: true,
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  fixedReserveAmount: 50000,
  excludeEmergencyFundAssets: false
}));
assert.deepEqual(
  enabledOutputs,
  baseOutputs,
  "enabled cash reserve reporting should not change treated offsets, projected asset growth, or DIME/Needs/HLV outputs"
);
assert.deepEqual(
  fixedOutputs,
  baseOutputs,
  "methodActiveFuture cash reserve mode must remain non-method-active"
);

[
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /cashReserveProjection|calculateCashReserveProjection|cash-reserve-calculations/,
    `${relativePath} should not consume cash reserve projection`
  );
});

const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.doesNotMatch(
  stepThreeSource,
  /cashReserveProjection|calculateCashReserveProjection|cash-reserve-calculations/,
  "Step 3 should not render or calculate cash reserve projection in this pass"
);

const modelBuilderSource = readRepoFile("app/features/lens-analysis/lens-model-builder.js");
assert.match(
  modelBuilderSource,
  /calculateCashReserveProjection/,
  "lens-model-builder should prepare cashReserveProjection through the pure helper"
);
assert.match(
  modelBuilderSource,
  /cashReserveProjection/,
  "lens-model-builder should attach lensModel.cashReserveProjection"
);
assert.doesNotMatch(
  modelBuilderSource,
  /reserveAdjusted|adjustedReserve|methodConsumedReserve|consumedByMethods:\s*true[^}]*cashReserve/s,
  "lens-model-builder should not prepare reserve-adjusted method-consumed offsets"
);

assertCashReserveHelperLoadsBeforeModelBuilder("pages/analysis-estimate.html");
assertCashReserveHelperLoadsBeforeModelBuilder("pages/income-loss-impact.html");

console.log("cash-reserve-model-prep-check passed");
