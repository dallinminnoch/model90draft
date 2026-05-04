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
  const includeProjectedAssetOffsetHelper = normalizedOptions.includeProjectedAssetOffsetHelper !== false;
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
    includeProjectedAssetOffsetHelper
      ? "app/features/lens-analysis/projected-asset-offset-calculations.js"
      : null,
    "app/features/lens-analysis/cash-reserve-calculations.js",
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
    source: "projected-asset-offset-model-prep-check",
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
  const sourceData = createSourceData();
  const analysisSettings = {
    valuationDate: "2026-05-04",
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
    treatedAssetOffsets: cloneJson(lensModel.treatedAssetOffsets),
    dime: lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, settings.dimeSettings),
    needs: lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, settings.needsAnalysisSettings),
    hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(
      lensModel,
      settings.humanLifeValueSettings
    ),
    simpleNeeds: lensAnalysis.analysisMethods.runSimpleNeedsAnalysis(lensModel, {
      supportYears: 10,
      includeAssetOffsets: true
    })
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

function assertProjectedAssetOffsetHelperLoadsBeforeModelBuilder(pagePath) {
  const scriptPaths = getScriptPaths(pagePath);
  const helperPath = "app/features/lens-analysis/projected-asset-offset-calculations.js";
  const modelBuilderPath = "app/features/lens-analysis/lens-model-builder.js";
  const helperIndex = scriptPaths.indexOf(helperPath);
  const modelBuilderIndex = scriptPaths.indexOf(modelBuilderPath);

  assert.ok(helperIndex >= 0, `${pagePath} should load ${helperPath}.`);
  assert.ok(modelBuilderIndex >= 0, `${pagePath} should load ${modelBuilderPath}.`);
  assert.ok(
    helperIndex < modelBuilderIndex,
    `${pagePath} should load projected asset offset helper before lens-model-builder.js.`
  );
}

function assertPageDoesNotLoadProjectedOffsetHelper(pagePath) {
  const scriptPaths = getScriptPaths(pagePath);
  assert.equal(
    scriptPaths.includes("app/features/lens-analysis/projected-asset-offset-calculations.js"),
    false,
    `${pagePath} should not load projected asset offset helper in this bounded pass.`
  );
}

const context = createLensAnalysisContext();
const noHelperContext = createLensAnalysisContext({ includeProjectedAssetOffsetHelper: false });
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.calculateProjectedAssetOffset, "function");
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.analysisMethods.runSimpleNeedsAnalysis, "function");

const currentDollarAssumptions = createAssetTreatmentAssumptions(6, {
  mode: "currentDollarOnly",
  projectionYears: 30
});
const reportingOnlyAssumptions = createAssetTreatmentAssumptions(11, {
  mode: "reportingOnly",
  projectionYears: 30
});
const projectedOffsetsAssumptions = createAssetTreatmentAssumptions(11, {
  mode: "projectedOffsets",
  projectionYears: 30
});

const currentDollarModel = buildLensModel(context, currentDollarAssumptions);
const projectedAssetOffset = currentDollarModel.projectedAssetOffset;

assert.ok(projectedAssetOffset, "lensModel.projectedAssetOffset should be prepared");
assert.equal(projectedAssetOffset.source, "projected-asset-offset-calculations");
assert.equal(projectedAssetOffset.consumedByMethods, false);
assert.equal(projectedAssetOffset.consumptionStatus, "saved-only");
assert.equal(projectedAssetOffset.activationStatus, "future-inactive");
assert.equal(projectedAssetOffset.sourceMode, "currentDollarOnly");
assert.equal(projectedAssetOffset.projectionYears, 0);
assert.equal(projectedAssetOffset.projectedGrowthAdjustment, 0);
assert.equal(
  projectedAssetOffset.currentTreatedAssetOffset,
  currentDollarModel.treatedAssetOffsets.totalTreatedAssetValue,
  "projected candidate should keep the current treated asset offset as the base"
);
assert.equal(
  projectedAssetOffset.effectiveProjectedAssetOffset,
  currentDollarModel.treatedAssetOffsets.totalTreatedAssetValue,
  "currentDollarOnly candidate should remain unchanged"
);
assert.deepEqual(
  cloneJson(currentDollarModel.treatedAssetOffsets),
  cloneJson(buildLensModel(noHelperContext, currentDollarAssumptions).treatedAssetOffsets),
  "adding the projected offset helper should not change treatedAssetOffsets"
);
assert.ok(
  getWarningByCode(projectedAssetOffset.warnings, "projected-asset-offset-inactive-model-prep"),
  "model prep should warn that projected asset offset is inactive"
);
assert.ok(
  getWarningByCode(projectedAssetOffset.warnings, "treated-asset-offsets-remain-current-source"),
  "model prep should warn that current methods still consume treatedAssetOffsets"
);

const reportingOnlyModel = buildLensModel(context, reportingOnlyAssumptions);
const reportingOnlyProjectedAssetOffset = reportingOnlyModel.projectedAssetOffset;
assert.equal(reportingOnlyProjectedAssetOffset.sourceMode, "reportingOnly");
assert.equal(reportingOnlyProjectedAssetOffset.consumedByMethods, false);
assert.equal(reportingOnlyProjectedAssetOffset.activationStatus, "future-inactive");
assert.ok(
  reportingOnlyProjectedAssetOffset.projectedGrowthAdjustment > 0,
  "reportingOnly can prepare an inactive projected offset candidate"
);
assert.equal(
  reportingOnlyProjectedAssetOffset.effectiveProjectedAssetOffset,
  Number((
    reportingOnlyProjectedAssetOffset.currentTreatedAssetOffset
    + reportingOnlyProjectedAssetOffset.projectedGrowthAdjustment
  ).toFixed(2)),
  "inactive candidate should add only incremental projected growth"
);
assert.equal(
  reportingOnlyProjectedAssetOffset.currentTreatedAssetOffset,
  reportingOnlyModel.treatedAssetOffsets.totalTreatedAssetValue,
  "reportingOnly candidate should not mutate the current treated asset offset"
);
assert.ok(
  reportingOnlyProjectedAssetOffset.excludedCategories.some(function (category) {
    return category.categoryKey === "emergencyFund"
      && category.warningCode === "emergency-fund-excluded-from-projected-asset-offset";
  }),
  "emergency fund should remain excluded in model prep"
);
assert.ok(
  reportingOnlyProjectedAssetOffset.excludedCategories.some(function (category) {
    return category.categoryKey === "primaryResidenceEquity"
      && category.warningCode === "review-only-asset-excluded-from-projected-asset-offset";
  }),
  "review-only real estate should remain excluded in model prep"
);
assert.ok(
  reportingOnlyProjectedAssetOffset.excludedCategories.some(function (category) {
    return category.categoryKey === "businessPrivateCompanyValue"
      && category.warningCode === "review-only-asset-excluded-from-projected-asset-offset";
  }),
  "business/private value should remain excluded in model prep"
);

const projectedOffsetsModel = buildLensModel(context, projectedOffsetsAssumptions);
assert.equal(projectedOffsetsModel.projectedAssetOffset.sourceMode, "projectedOffsets");
assert.equal(projectedOffsetsModel.projectedAssetOffset.projectionMode, "projectedOffsetsFutureInactive");
assert.equal(projectedOffsetsModel.projectedAssetOffset.consumedByMethods, false);
assert.equal(projectedOffsetsModel.projectedAssetOffset.activationStatus, "future-inactive");
assert.ok(
  getWarningByCode(
    projectedOffsetsModel.projectedAssetOffset.warnings,
    "projected-asset-offset-source-mode-future-inactive"
  ),
  "saved projectedOffsets should remain future inactive"
);

const currentDollarOutputs = createMethodOutputs(context, currentDollarAssumptions);
const reportingOnlyOutputs = createMethodOutputs(context, reportingOnlyAssumptions);
const projectedOffsetsOutputs = createMethodOutputs(context, projectedOffsetsAssumptions);
const noHelperReportingOnlyOutputs = createMethodOutputs(noHelperContext, reportingOnlyAssumptions);

assert.deepEqual(
  cloneJson(reportingOnlyOutputs.treatedAssetOffsets),
  cloneJson(currentDollarOutputs.treatedAssetOffsets),
  "reportingOnly source-mode values should not change treated asset offsets"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.treatedAssetOffsets),
  cloneJson(currentDollarOutputs.treatedAssetOffsets),
  "projectedOffsets source-mode values should not change treated asset offsets"
);
assert.deepEqual(cloneJson(reportingOnlyOutputs.dime), cloneJson(currentDollarOutputs.dime), "DIME unchanged");
assert.deepEqual(cloneJson(reportingOnlyOutputs.needs), cloneJson(currentDollarOutputs.needs), "Needs unchanged");
assert.deepEqual(cloneJson(reportingOnlyOutputs.hlv), cloneJson(currentDollarOutputs.hlv), "HLV unchanged");
assert.deepEqual(
  cloneJson(reportingOnlyOutputs.simpleNeeds),
  cloneJson(currentDollarOutputs.simpleNeeds),
  "Simple Needs unchanged"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.dime),
  cloneJson(currentDollarOutputs.dime),
  "projectedOffsets should not change DIME output"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.needs),
  cloneJson(currentDollarOutputs.needs),
  "projectedOffsets should not change Needs output"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.hlv),
  cloneJson(currentDollarOutputs.hlv),
  "projectedOffsets should not change HLV output"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.simpleNeeds),
  cloneJson(currentDollarOutputs.simpleNeeds),
  "projectedOffsets should not change Simple Needs output"
);
assert.deepEqual(
  cloneJson(reportingOnlyOutputs),
  cloneJson(noHelperReportingOnlyOutputs),
  "loading the inactive projected offset helper should not change current method outputs"
);

assertProjectedAssetOffsetHelperLoadsBeforeModelBuilder("pages/analysis-estimate.html");
[
  "pages/dime-results.html",
  "pages/hlv-results.html",
  "pages/simple-needs-results.html",
  "pages/income-loss-impact.html",
  "pages/dime-entry.html",
  "pages/hlv-entry.html",
  "pages/simple-needs-entry.html"
].forEach(assertPageDoesNotLoadProjectedOffsetHelper);

const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const stepThreeDisplaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const schemaSource = readRepoFile("app/features/lens-analysis/schema.js");
const resultPageSources = [
  readRepoFile("pages/dime-results.html"),
  readRepoFile("pages/hlv-results.html"),
  readRepoFile("pages/simple-needs-results.html"),
  readRepoFile("app/features/lens-analysis/simple-needs-results-display.js")
].join("\n");

assert.doesNotMatch(
  analysisMethodsSource,
  /projectedAssetOffset/,
  "methods must not consume projectedAssetOffset in this inactive prep pass"
);
assert.doesNotMatch(
  stepThreeDisplaySource,
  /projectedAssetOffset|Projected Asset Offset/,
  "Step 3 display should not render projectedAssetOffset in this pass"
);
assert.doesNotMatch(
  analysisSetupHtml + "\n" + analysisSetupSource,
  /projectedAssetOffset|Projected Asset Offset/,
  "Analysis Setup UI should not gain projectedAssetOffset controls in this pass"
);
assert.doesNotMatch(
  resultPageSources,
  /projectedAssetOffset|Projected Asset Offset/,
  "quick result pages should not render projected asset offset sections"
);
assert.doesNotMatch(
  schemaSource,
  /projectedAssetOffset/,
  "saved schema/data shape should not add projectedAssetOffset in this inactive prep pass"
);

console.log("projected-asset-offset-model-prep-check passed");
