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

function createLensAnalysisContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
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
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/household-wealth-projection-calculations.js",
    "app/features/lens-analysis/household-death-event-availability-calculations.js",
    "app/features/lens-analysis/household-survivor-runway-calculations.js",
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "app/features/lens-analysis/income-impact-caution-library.js",
    "app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createSourceData(overrides = {}) {
  return {
    dateOfBirth: "1979-10-01",
    grossAnnualIncome: 230000,
    netAnnualIncome: 160000,
    netAnnualIncomeManualOverride: false,
    cashAndCashEquivalents: 250000,
    taxableBrokerageInvestments: 50000,
    traditionalRetirementAssets: 30000,
    housingStatus: "Renter",
    monthlyHousingCost: 1500,
    utilitiesCost: 700,
    foodCost: 1000,
    travelDiscretionaryCost: 600,
    currentCoverage: 400000,
    finalExpenses: 25000,
    transitionNeedsAmount: 40000,
    ...overrides
  };
}

function createAnalysisSettings() {
  return {
    projectedAssetOffsetAssumptions: {
      enabled: true,
      consumptionStatus: "method-active",
      activationVersion: 1
    },
    assetTreatmentAssumptions: {
      assets: {
        cashAndCashEquivalents: {
          include: true,
          taxDragPercent: 0,
          liquidityHaircutPercent: 0,
          assumedAnnualGrowthRatePercent: 2,
          growthConsumptionStatus: "method-active"
        },
        taxableBrokerageInvestments: {
          include: true,
          taxDragPercent: 0,
          liquidityHaircutPercent: 0,
          assumedAnnualGrowthRatePercent: 6,
          growthConsumptionStatus: "method-active"
        },
        traditionalRetirementAssets: {
          include: true,
          taxDragPercent: 0,
          liquidityHaircutPercent: 0,
          assumedAnnualGrowthRatePercent: 6,
          growthConsumptionStatus: "method-active"
        }
      }
    }
  };
}

function getWarning(warnings, code) {
  return warnings.find(function (warning) {
    return warning && warning.code === code;
  });
}

function assertSaveFlowPersistsCalculatedNetIncome() {
  [
    "pages/manual-protection-modeling-inputs.html",
    "pages/next-step.html",
    "pages/confidential-inputs.html"
  ].forEach(function (relativePath) {
    const source = readRepoFile(relativePath);
    assert.match(
      source,
      /derivedDraftFieldNames[\s\S]*"netAnnualIncome"[\s\S]*"spouseNetAnnualIncome"/,
      `${relativePath} should continue excluding derived net income from generic serialization`
    );
    assert.match(
      source,
      /persistNetIncomeSnapshotValue\(\s*draft,\s*"netAnnualIncome",\s*"netAnnualIncomeManualOverride",\s*netAnnualIncomeField,\s*\{\s*includeWhen:\s*parseCurrencyLikeNumber\(grossAnnualIncomeField\?\.value\) != null\s*\}/,
      `${relativePath} should explicitly persist calculated insured net income when gross income exists`
    );
    assert.match(
      source,
      /persistNetIncomeSnapshotValue\(\s*draft,\s*"spouseNetAnnualIncome",\s*"spouseNetAnnualIncomeManualOverride",\s*spouseNetAnnualIncomeField,\s*\{\s*includeWhen:\s*getIncomeCalculationMode\(\) === "separate"\s*&&\s*parseCurrencyLikeNumber\(spouseIncomeField\?\.value\) != null\s*\}/,
      `${relativePath} should persist spouse net income only for separate-income cases with spouse gross income`
    );
    assert.match(
      source,
      /field\.dataset\.manualOverride === "true"[\s\S]*draft\[fieldName\] = parseCurrencyLikeNumber\(field\.dataset\.manualValue\);[\s\S]*draft\[manualOverrideFieldName\] = true;[\s\S]*return;/,
      `${relativePath} should keep manual net-income overrides preferred`
    );
    assert.match(
      source,
      /const calculatedValue = parseCurrencyLikeNumber\(field\.value\);[\s\S]*if \(calculatedValue == null\)[\s\S]*return;[\s\S]*draft\[fieldName\] = calculatedValue;[\s\S]*draft\[manualOverrideFieldName\] = false;/,
      `${relativePath} should persist only calculated net income values that exist`
    );
    assert.doesNotMatch(
      source,
      /draft\.netAnnualIncome\s*=\s*parseCurrencyLikeNumber\(grossAnnualIncomeField/,
      `${relativePath} should not persist gross income as net income`
    );
  });
}

function buildLensModel(context, sourceData, analysisSettings = createAnalysisSettings()) {
  return context.LensApp.lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord: {
      dateOfBirth: sourceData.dateOfBirth,
      maritalStatus: sourceData.maritalStatus
    },
    taxConfig: {}
  });
}

function forceUnavailableTaxRecompute(context) {
  context.LensApp.lensAnalysis.incomeTaxCalculations = {
    calculateCurrentNetIncomeValues() {
      return {
        primaryNetAnnualIncome: null,
        spouseNetAnnualIncome: null,
        warnings: [{
          code: "tax-recomputation-unavailable",
          message: "test recomputation unavailable"
        }]
      };
    }
  };
}

function forceSuccessfulTaxRecompute(context) {
  context.LensApp.lensAnalysis.incomeTaxCalculations = {
    calculateCurrentNetIncomeValues() {
      return {
        primaryNetAnnualIncome: 175000,
        spouseNetAnnualIncome: 55000,
        warnings: []
      };
    }
  };
}

function assertSavedNetFallbackFeedsComposerAndGraph() {
  const context = createLensAnalysisContext();
  const lensAnalysis = context.LensApp.lensAnalysis;
  const sourceData = createSourceData();
  const analysisSettings = createAnalysisSettings();

  forceUnavailableTaxRecompute(context);
  const builderResult = buildLensModel(context, sourceData, analysisSettings);
  const incomeBasis = builderResult.lensModel.incomeBasis;

  assert.equal(
    incomeBasis.insuredNetAnnualIncome,
    160000,
    "saved insured net income should be preserved when tax recomputation is unavailable"
  );
  assert.ok(
    getWarning(builderResult.warnings, "saved-net-income-used-after-tax-recompute-unavailable"),
    "builder should trace saved-net fallback"
  );
  assert.equal(
    getWarning(builderResult.warnings, "net-income-missing"),
    undefined,
    "builder should not report missing net income when saved net fallback is used"
  );

  const scenario = lensAnalysis.composeIncomeImpactScenario({
    valuationDate: "2026-04-29",
    selectedDeathDate: "2045-10-01",
    selectedDeathAge: 66,
    projectionHorizonMonths: 480,
    lensModel: builderResult.lensModel,
    analysisSettings,
    scenarioOptions: {
      includeDiscretionaryNeeds: true,
      projectionCadence: "monthly"
    }
  });
  const firstPoint = scenario.preDeathSeries.points[0];
  const lastPoint = scenario.preDeathSeries.points[scenario.preDeathSeries.points.length - 1];

  assert.ok(firstPoint.income > 0, "composer should pass a mature household net income stream to Layer 1");
  assert.ok(
    scenario.preDeathSeries.summary.totalIncome > 0,
    "Layer 1 summary should include household income"
  );
  assert.ok(
    lastPoint.endingAssets > firstPoint.endingAssets,
    "pre-death assets should rise when net income exceeds expenses"
  );

  const riskEvaluation = lensAnalysis.evaluateIncomeImpactRiskEvents({ scenario });
  const graphModel = lensAnalysis.buildIncomeImpactTimelineGraphModel({
    scenario,
    riskEvaluation,
    options: {
      preserveSignedResources: true,
      currentAgeMode: "death-event-only"
    }
  });
  const preDeathPoints = graphModel.series.preDeathAssets;
  assert.ok(preDeathPoints.length > 1, "Graph V1 should receive real pre-death points");
  assert.equal(preDeathPoints[0].sourcePath, "preDeathSeries.points.0.endingAssets");
  assert.ok(
    preDeathPoints[preDeathPoints.length - 1].value > preDeathPoints[0].value,
    "Graph V1 should plot rising real preDeathSeries endingAssets values"
  );
}

function assertExistingMethodsStillUsePreparedIncomeBasis() {
  const context = createLensAnalysisContext();
  const lensAnalysis = context.LensApp.lensAnalysis;
  forceUnavailableTaxRecompute(context);

  const builderResult = buildLensModel(context, createSourceData(), createAnalysisSettings());
  const lensModel = builderResult.lensModel;
  const annualIncomeReplacementBase = lensModel.incomeBasis.annualIncomeReplacementBase;
  assert.equal(
    annualIncomeReplacementBase,
    160000,
    "builder should calculate annualIncomeReplacementBase from saved mature net income"
  );

  const dime = lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, {
    dimeIncomeYears: 10,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false
  });
  assert.equal(dime.components.income, annualIncomeReplacementBase * 10, "DIME income component should still use annualIncomeReplacementBase");
  assert.equal(
    dime.assumptions.incomeComponentSource,
    "incomeBasis.annualIncomeReplacementBase",
    "DIME income source should be unchanged"
  );

  const needs = lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, {
    needsSupportDurationYears: 10,
    includeEssentialSupport: true,
    allowIncomeFallback: true,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false
  });
  const essentialSupportTrace = needs.trace.find(function (row) {
    return row && row.key === "essentialSupport";
  });
  assert.equal(
    essentialSupportTrace.sourcePaths[0],
    "ongoingSupport.annualTotalEssentialSupportCost",
    "LENS Analysis should still prefer ongoingSupport over income fallback when support cost exists"
  );

  const hlv = lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(lensModel, {
    hlvProjectionYears: 10,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false
  });
  assert.equal(hlv.components.annualIncomeValue, annualIncomeReplacementBase, "HLV annual income value should still use annualIncomeReplacementBase");
  assert.equal(
    hlv.assumptions.incomeValueSource,
    "incomeBasis.annualIncomeReplacementBase",
    "HLV income source should be unchanged"
  );
}

function assertGrossOnlyStillDoesNotBecomeSpendableIncome() {
  const context = createLensAnalysisContext();
  forceUnavailableTaxRecompute(context);

  const builderResult = buildLensModel(context, createSourceData({
    netAnnualIncome: null
  }));

  assert.equal(
    builderResult.lensModel.incomeBasis.insuredNetAnnualIncome,
    null,
    "gross income alone must not become spendable net income"
  );
  assert.ok(
    getWarning(builderResult.warnings, "net-income-missing"),
    "builder should still warn when only gross income is available and recomputation fails"
  );
}

function assertRecomputedAndManualIncomeStillWin() {
  const recomputeContext = createLensAnalysisContext();
  forceSuccessfulTaxRecompute(recomputeContext);
  const recomputedResult = buildLensModel(recomputeContext, createSourceData());

  assert.equal(
    recomputedResult.lensModel.incomeBasis.insuredNetAnnualIncome,
    175000,
    "successful recomputed net income should remain preferred over saved calculated net income"
  );
  assert.equal(
    getWarning(recomputedResult.warnings, "saved-net-income-used-after-tax-recompute-unavailable"),
    undefined,
    "saved-net fallback warning should not appear when recomputation succeeds"
  );

  const manualContext = createLensAnalysisContext();
  forceSuccessfulTaxRecompute(manualContext);
  const manualResult = buildLensModel(manualContext, createSourceData({
    netAnnualIncome: 155000,
    netAnnualIncomeManualOverride: true
  }));

  assert.equal(
    manualResult.lensModel.incomeBasis.insuredNetAnnualIncome,
    155000,
    "manual net income override should remain preferred"
  );
}

function assertSpouseSavedNetFallbackWhenSeparate() {
  const context = createLensAnalysisContext();
  forceUnavailableTaxRecompute(context);
  const builderResult = buildLensModel(context, createSourceData({
    maritalStatus: "Married",
    filingStatus: "Married Filing Separately",
    spouseIncome: 70000,
    spouseNetAnnualIncome: 50000,
    spouseNetAnnualIncomeManualOverride: false
  }));

  assert.equal(
    builderResult.lensModel.incomeBasis.spouseOrPartnerNetAnnualIncome,
    50000,
    "saved spouse net income should be preserved for separate-income cases when recomputation is unavailable"
  );
  assert.ok(
    getWarning(builderResult.warnings, "saved-spouse-net-income-used-after-tax-recompute-unavailable"),
    "builder should trace spouse saved-net fallback"
  );
}

assertSaveFlowPersistsCalculatedNetIncome();
assertSavedNetFallbackFeedsComposerAndGraph();
assertGrossOnlyStillDoesNotBecomeSpendableIncome();
assertRecomputedAndManualIncomeStillWin();
assertSpouseSavedNetFallbackWhenSeparate();
assertExistingMethodsStillUsePreparedIncomeBasis();

console.log("lens-model-builder-income-basis-check passed");
