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

function createContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  return context;
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item && item.code).filter(Boolean);
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    educationSupport: {
      linkedDependentCount: 1,
      desiredAdditionalDependentCount: 0,
      perLinkedDependentEducationFunding: 135000,
      linkedDependentEducationFundingNeed: 135000,
      totalEducationFundingNeed: 135000,
      currentDependentDetails: [
        {
          id: "child-a",
          dateOfBirth: "2010-01-01"
        }
      ]
    },
    assetFacts: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          typeKey: "plan529Account",
          label: "529 Plan",
          currentValue: 20000
        },
        {
          assetId: "brokerage",
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage",
          currentValue: 60000
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          currentValue: 50000
        },
        {
          assetId: "emergency",
          categoryKey: "emergencyFund",
          label: "Emergency Fund",
          currentValue: 25000
        },
        {
          assetId: "retirement",
          categoryKey: "traditionalRetirementAssets",
          label: "Traditional Retirement",
          currentValue: 90000
        },
        {
          assetId: "home",
          categoryKey: "primaryResidenceEquity",
          label: "Home Equity",
          currentValue: 200000
        },
        {
          assetId: "restricted",
          categoryKey: "trustRestrictedAssets",
          label: "Restricted Trust",
          currentValue: 10000
        }
      ]
    },
    treatedAssetOffsets: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          label: "529 Plan",
          include: false,
          treatedValue: 0,
          rawValue: 20000
        },
        {
          assetId: "brokerage",
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage",
          include: true,
          treatedValue: 60000,
          rawValue: 60000
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          include: true,
          treatedValue: 50000,
          rawValue: 50000
        },
        {
          assetId: "emergency",
          categoryKey: "emergencyFund",
          label: "Emergency Fund",
          include: true,
          treatedValue: 25000,
          rawValue: 25000
        },
        {
          assetId: "retirement",
          categoryKey: "traditionalRetirementAssets",
          label: "Traditional Retirement",
          include: true,
          treatedValue: 90000,
          rawValue: 90000
        },
        {
          assetId: "home",
          categoryKey: "primaryResidenceEquity",
          label: "Home Equity",
          include: true,
          treatedValue: 200000,
          rawValue: 200000
        },
        {
          assetId: "restricted",
          categoryKey: "trustRestrictedAssets",
          label: "Restricted Trust",
          include: true,
          treatedValue: 10000,
          rawValue: 10000
        }
      ]
    }
  };
}

function createNeedsResult() {
  return {
    method: "needsAnalysis",
    components: {
      debtPayoff: 0,
      mortgage: 0,
      essentialSupport: 0,
      discretionarySupport: 0,
      transitionNeeds: 0,
      education: 135000,
      finalExpenses: 0,
      healthcareExpenses: 0
    },
    commonOffsets: {},
    assumptions: {
      valuationDate: "2026-01-01"
    },
    trace: [
      {
        key: "educationFundingInflation",
        inputs: {
          includeEducationFundingSetting: true,
          includeProjectedDependentsSetting: true,
          applied: false,
          educationStartAge: 18
        }
      }
    ]
  };
}

function createAnalysisSettings() {
  return {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      useExistingEducationSavingsOffset: false
    },
    assetTreatmentAssumptions: {
      enabled: true,
      assets: {
        educationSpecificSavings: { include: false },
        taxableBrokerageInvestments: { include: true, taxDragPercent: 0, liquidityHaircutPercent: 0 },
        cashAndCashEquivalents: { include: true, taxDragPercent: 0, liquidityHaircutPercent: 0 },
        emergencyFund: { include: true, taxDragPercent: 0, liquidityHaircutPercent: 0 },
        traditionalRetirementAssets: { include: true, taxDragPercent: 0, liquidityHaircutPercent: 0 },
        primaryResidenceEquity: { include: true, taxDragPercent: 0, liquidityHaircutPercent: 0 },
        trustRestrictedAssets: { include: true, taxDragPercent: 0, liquidityHaircutPercent: 0 }
      }
    }
  };
}

function createScenarioSettings(mode) {
  return {
    version: 1,
    source: "fixture-runtime",
    education: {
      educationResourceSpendingMode: mode,
      useEducationSavingsOffset: mode !== "off"
    },
    trace: {
      fieldSources: {
        "education.educationResourceSpendingMode": "fixture.education.educationResourceSpendingMode"
      }
    }
  };
}

function getAllocationAssets(lensModel) {
  return lensModel.treatedAssetOffsets.assets.map((asset, index) => ({
    assetId: asset.assetId,
    categoryKey: asset.categoryKey,
    label: asset.label,
    rawValue: asset.rawValue,
    treatedValue: asset.treatedValue,
    sourcePath: `lensModel.treatedAssetOffsets.assets.${index}`,
    availabilityStatus: asset.include === false ? "excluded" : "available",
    treatmentStatus: asset.include === false ? "excluded-by-treatment" : "included-by-treatment"
  }));
}

function getAppliedResourceLineAdjustments(allocation) {
  return allocation.scheduledResourceApplications.map((application) => ({
    adjustmentId: application.applicationId,
    yearIndex: application.yearIndex,
    calendarYear: application.calendarYear,
    amount: application.resourceLineReductionAmount,
    categoryKey: application.assetCategoryKey,
    componentKey: "education",
    obligationId: application.obligationId,
    sourcePath: application.sourcePath,
    source: "coverage-strategy-resource-allocation-depletion",
    reason: "education-eligible-resources-after-education-savings"
  }));
}

const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const pageSource = readRepoFile("pages/coverage-strategy.html");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");

assert.match(pageSource, /coverage-strategy-resource-allocation-depletion\.js/);
assert.match(controllerSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.match(controllerSource, /value="eligibleResourcesAfterEducationSavings"/);
assert.match(controllerSource, /Savings plus eligible assets/);
assert.doesNotMatch(analysisSetupSource, /eligibleResourcesAfterEducationSavings|Savings \+ Assets/);

const context = createContext();
[
  "app/features/lens-analysis/asset-taxonomy.js",
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-resource-allocation-depletion.js",
  "app/features/lens-analysis/coverage-strategy-resource-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-gap-surplus-composer.js",
  "app/features/lens-analysis/coverage-strategy-diagnostic-export.js"
].forEach((scriptPath) => loadScript(context, scriptPath));

const buildNeedLine = context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const buildResourceLine = context.LensApp.lensAnalysis.buildCoverageStrategyResourceLine;
const calculateAllocation = context.LensApp.lensAnalysis.calculateCoverageStrategyResourceAllocationDepletion;
const buildGapSurplus = context.LensApp.lensAnalysis.buildCoverageStrategyGapSurplus;
const buildSnapshot = context.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;

const lensModel = createLensModel();
const needsResult = createNeedsResult();
const analysisSettings = createAnalysisSettings();
const offNeedLine = buildNeedLine({
  lensModel,
  needsResult,
  analysisSettings,
  coverageStrategyScenarioSettings: createScenarioSettings("off"),
  valuationDate: "2026-01-01",
  horizonYears: 8
});
const savingsNeedLine = buildNeedLine({
  lensModel,
  needsResult,
  analysisSettings,
  coverageStrategyScenarioSettings: createScenarioSettings("educationSavingsOnly"),
  valuationDate: "2026-01-01",
  horizonYears: 8
});

assert.equal(offNeedLine.needPoints[0].componentAmounts.education, 135000);
assert.equal(savingsNeedLine.needPoints[0].componentAmounts.education, 115000);
assert.equal(savingsNeedLine.needPoints[0].trace.educationProjection.broaderEligibleResourceOffsetApplied, 0);

const preliminaryNeedLine = buildNeedLine({
  lensModel,
  needsResult,
  analysisSettings,
  coverageStrategyScenarioSettings: createScenarioSettings("eligibleResourcesAfterEducationSavings"),
  valuationDate: "2026-01-01",
  horizonYears: 8
});
assert.equal(preliminaryNeedLine.needPoints[0].componentAmounts.education, 115000);
assert.ok(issueCodes(preliminaryNeedLine.dataGaps).includes("education-eligible-resource-spending-source-unavailable"));

const baselineResourceLine = buildResourceLine({
  lensModel,
  analysisSettings,
  needPoints: preliminaryNeedLine.needPoints,
  valuationDate: "2026-01-01",
  horizonYears: 8
});
const allocation = calculateAllocation({
  projectionYears: 8,
  valuationDate: "2026-01-01",
  obligations: preliminaryNeedLine.componentModels.education.lifetimeProjection.broaderEligibleResourceAllocationObligations,
  assets: getAllocationAssets(lensModel),
  baselineResourcePoints: baselineResourceLine.resourcePoints,
  alreadyAppliedEducationSavings: preliminaryNeedLine.componentModels.education.lifetimeProjection.alreadyAppliedEducationSavings,
  eligibilityPolicy: {
    allowCashAboveReserve: false,
    cashReserveAmount: 0,
    allowTaxableBrokerage: true,
    allowEmergencyFund: false,
    allowRetirementAssets: false,
    allowRestrictedAssets: false,
    allowHomeEquity: false,
    allowBusinessValue: false,
    allowCrypto: false,
    allowReviewOnlyAssets: false,
    allowedCategoryOrder: ["taxableBrokerageInvestments", "cashAndCashEquivalents"]
  }
});

assert.equal(allocation.totalRequested, 115000);
assert.equal(allocation.totalApplied, 60000);
assert.equal(allocation.totalUnfunded, 55000);
assert.equal(allocation.trace.needLineResourceLineReductionAmountsMatch, true);
assert.ok(allocation.scheduledResourceApplications.every((application) => application.assetId === "brokerage"));
const exclusionReasons = new Set(allocation.excludedAssetDecisions.map((decision) => decision.eligibilityReason));
assert.ok(exclusionReasons.has("cash-excluded-by-policy"));
assert.ok(exclusionReasons.has("emergency-fund-excluded-by-policy"));
assert.ok(exclusionReasons.has("retirement-assets-excluded-by-policy"));
assert.ok(exclusionReasons.has("home-equity-excluded-by-policy"));
assert.ok(exclusionReasons.has("restricted-assets-excluded-by-policy"));
assert.ok(exclusionReasons.has("asset-unavailable-or-excluded-by-treatment"));

const adjustedNeedLine = buildNeedLine({
  lensModel,
  needsResult,
  analysisSettings,
  coverageStrategyScenarioSettings: createScenarioSettings("eligibleResourcesAfterEducationSavings"),
  valuationDate: "2026-01-01",
  horizonYears: 8,
  educationBroaderResourceAllocation: allocation
});
assert.equal(adjustedNeedLine.needPoints[0].trace.educationProjection.grossEducationNeedAmount, 135000);
assert.equal(adjustedNeedLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 20000);
assert.equal(adjustedNeedLine.needPoints[0].trace.educationProjection.broaderEligibleResourceOffsetApplied, 0);
assert.equal(adjustedNeedLine.needPoints[0].componentAmounts.education, 115000);
assert.equal(adjustedNeedLine.needPoints[1].trace.educationProjection.broaderEligibleResourceOffsetApplied, 0);
assert.equal(adjustedNeedLine.needPoints[2].trace.educationProjection.broaderEligibleResourceOffsetApplied, 13750);
assert.equal(adjustedNeedLine.needPoints[2].trace.educationProjection.resourceLineReductionAmountFromBroaderResources, 13750);
assert.equal(adjustedNeedLine.componentModels.education.lifetimeProjection.educationResourceSpending.broaderEligibleResourceStatus, "partial");
assert.equal(adjustedNeedLine.componentModels.education.lifetimeProjection.educationResourceSpending.needLineReductionAmount, 60000);
assert.equal(adjustedNeedLine.componentModels.education.lifetimeProjection.educationResourceSpending.resourceLineReductionAmount, 60000);
assert.equal(adjustedNeedLine.componentModels.education.lifetimeProjection.educationResourceSpending.needLineResourceLineReductionAmountsMatch, true);

const adjustedResourceLine = buildResourceLine({
  lensModel,
  analysisSettings,
  needPoints: adjustedNeedLine.needPoints,
  valuationDate: "2026-01-01",
  horizonYears: 8,
  resourceLineAdjustmentsByYear: getAppliedResourceLineAdjustments(allocation)
});
assert.equal(adjustedResourceLine.resourceLineAdjustments.resourceLineReductionApplied, true);
assert.equal(adjustedResourceLine.resourceLineAdjustments.totalResourceLineReduction, 60000);
assert.equal(adjustedResourceLine.resourcePoints[0].resourceLineAdjustmentAmount, 0);
assert.equal(adjustedResourceLine.resourcePoints[1].resourceLineAdjustmentAmount, 0);
assert.equal(adjustedResourceLine.resourcePoints[2].resourceLineAdjustmentAmount, 13750);
assert.equal(
  adjustedResourceLine.resourceLineAdjustments.totalResourceLineReduction,
  adjustedNeedLine.componentModels.education.lifetimeProjection.educationResourceSpending.resourceLineReductionAmount
);

const gapSurplus = buildGapSurplus({
  needPoints: adjustedNeedLine.needPoints,
  resourcePoints: adjustedResourceLine.resourcePoints,
  existingCoveragePoints: [],
  valuationDate: "2026-01-01"
});
const yearTwoGap = gapSurplus.gapSurplusPoints.find((point) => point.yearIndex === 2);
const yearTwoResource = adjustedResourceLine.resourcePoints.find((point) => point.yearIndex === 2);
assert.equal(yearTwoGap.resourceAmount, yearTwoResource.resourceAmount);
assert.equal(yearTwoGap.needAmount, adjustedNeedLine.needPoints.find((point) => point.yearIndex === 2).needAmount);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Broader Resource Fixture",
    analysisSettings
  },
  lensModel,
  needsResult,
  needLine: adjustedNeedLine,
  resourceLine: adjustedResourceLine,
  gapSurplus,
  educationBroaderResourceAllocation: allocation,
  coverageStrategyScenarioSettings: createScenarioSettings("eligibleResourcesAfterEducationSavings"),
  visibleScenarioControls: {
    projectionHorizon: true,
    educationResourceSpendingMode: true,
    educationResourceSpending: true,
    educationPaymentScheduleMode: true,
    educationPaymentSchedule: true,
    projectedDependentBirthYear: false,
    diagnosticExport: true
  },
  projectionHorizonYears: 8
});
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationBroaderResourceAllocation.totalApplied, 60000);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.resourcePoints[2].trace.resourceLineReductionApplied, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationNeedResourceReductionProof.needLineResourceLineReductionAmountsMatch, true);

console.log("coverage strategy education broader resource integration check passed");
