#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const pagePath = "pages/income-loss-impact.html";
const projectedOffsetScript = "../app/features/lens-analysis/projected-asset-offset-calculations.js";
const modelBuilderScript = "../app/features/lens-analysis/lens-model-builder.js";
const householdEngineScript = "../app/features/lens-analysis/household-financial-position-calculations.js";
const timelineScript = "../app/features/lens-analysis/income-loss-impact-timeline-calculations.js";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext() {
  const storageWrites = [];
  const context = {
    console,
    Intl,
    storageWrites,
    localStorage: {
      setItem(key, value) {
        storageWrites.push({ type: "localStorage", key, value });
      }
    },
    sessionStorage: {
      setItem(key, value) {
        storageWrites.push({ type: "sessionStorage", key, value });
      }
    },
    globalThis: null,
    LensApp: { lensAnalysis: {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function projectedValue(value, rate, years) {
  return roundMoney(value * Math.pow(1 + rate / 100, years));
}

function createProjectedCategory(categoryKey, treatedValue, rate, years) {
  return {
    categoryKey,
    label: categoryKey,
    treatedValue,
    assumedAnnualGrowthRatePercent: rate,
    projectedTreatedValue: projectedValue(treatedValue, rate, years),
    projectedGrowthAdjustment: roundMoney(projectedValue(treatedValue, rate, years) - treatedValue),
    projectionYears: years
  };
}

function createAnalysisSettings(overrides) {
  return {
    projectedAssetOffsetAssumptions: {
      enabled: true,
      consumptionStatus: "method-active",
      activationVersion: 1
    },
    assetTreatmentAssumptions: {
      assetGrowthProjectionAssumptions: {
        mode: "projectedOffsets",
        projectionYears: 4
      }
    },
    ...(overrides || {})
  };
}

function createProjectedAssetOffset(overrides) {
  const years = 4;
  const includedCategories = [
    createProjectedCategory("cashAndCashEquivalents", 40000, 2, years),
    createProjectedCategory("taxableBrokerageInvestments", 60000, 6, years),
    createProjectedCategory("emergencyFund", 50000, 12, years),
    createProjectedCategory("primaryResidenceEquity", 50000, 8, years)
  ];
  const projectedGrowthAdjustment = roundMoney(
    includedCategories.reduce(function (total, category) {
      return total + category.projectedGrowthAdjustment;
    }, 0)
  );

  return {
    source: "projected-asset-offset-calculations",
    currentTreatedAssetOffset: 200000,
    eligibleTreatedBase: 100000,
    projectedTreatedValue: roundMoney(100000 + projectedGrowthAdjustment),
    projectedGrowthAdjustment,
    effectiveProjectedAssetOffset: roundMoney(200000 + projectedGrowthAdjustment),
    projectionYears: years,
    sourceMode: "projectedOffsets",
    projectionMode: "projectedOffsetsFutureInactive",
    consumptionStatus: "saved-only",
    consumedByMethods: false,
    activationStatus: "future-inactive",
    includedCategories,
    excludedCategories: [
      {
        categoryKey: "trustRestrictedAssets",
        label: "Trust / Restricted Assets",
        warningCode: "restricted-asset-excluded-from-projected-asset-offset"
      },
      {
        categoryKey: "businessPrivateCompanyValue",
        label: "Business / Private Company Value",
        warningCode: "review-only-asset-excluded-from-projected-asset-offset"
      }
    ],
    ...(overrides || {})
  };
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthStatus: "valid",
      ...(overrides.profileFacts || {})
    },
    incomeBasis: {
      annualIncomeReplacementBase: 0,
      insuredGrossAnnualIncome: 0,
      insuredNetAnnualIncome: 0,
      spouseOrPartnerGrossAnnualIncome: 0,
      spouseOrPartnerNetAnnualIncome: 0,
      ...(overrides.incomeBasis || {})
    },
    survivorScenario: {
      survivorNetAnnualIncome: 0,
      survivorGrossAnnualIncome: 0,
      survivorIncomeStartDelayMonths: 0,
      ...(overrides.survivorScenario || {})
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 0,
      monthlyTotalEssentialSupportCost: 0,
      ...(overrides.ongoingSupport || {})
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 500000,
      ...(overrides.treatedExistingCoverageOffset || {})
    },
    existingCoverage: {
      totalExistingCoverage: 900000,
      totalProfileCoverage: 900000,
      ...(overrides.existingCoverage || {})
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 200000,
      assets: [
        { categoryKey: "cashAndCashEquivalents", include: true, treatedValue: 40000 },
        { categoryKey: "taxableBrokerageInvestments", include: true, treatedValue: 60000 },
        { categoryKey: "emergencyFund", include: true, treatedValue: 50000 },
        { categoryKey: "primaryResidenceEquity", include: true, treatedValue: 50000 }
      ],
      ...(overrides.treatedAssetOffsets || {})
    },
    projectedAssetOffset: createProjectedAssetOffset(overrides.projectedAssetOffset),
    projectedAssetGrowth: {
      projectedTotalAssetValue: 999999999,
      totalProjectedGrowthAmount: 888888888,
      includedCategories: [
        {
          categoryKey: "cashAndCashEquivalents",
          currentValue: 40000,
          assumedAnnualGrowthRatePercent: 99
        }
      ],
      ...(overrides.projectedAssetGrowth || {})
    },
    cashReserveProjection: {
      totalAvailableAfterReserve: 777777777,
      ...(overrides.cashReserveProjection || {})
    },
    finalExpenses: {
      totalFinalExpenseNeed: 25000,
      ...(overrides.finalExpenses || {})
    },
    transitionNeeds: {
      totalTransitionNeed: 15000,
      ...(overrides.transitionNeeds || {})
    },
    treatedDebtPayoff: {
      needs: {
        debtPayoffAmount: 60000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 60000
      },
      debts: [],
      ...(overrides.treatedDebtPayoff || {})
    },
    debtPayoff: {
      totalDebtPayoffNeed: 60000,
      mortgageBalance: 0,
      creditCardBalance: 60000,
      ...(overrides.debtPayoff || {})
    },
    educationSupport: {
      linkedDependentCount: 0,
      currentDependentDetails: [],
      ...(overrides.educationSupport || {})
    },
    ...(overrides.root || {})
  };
}

function runTimeline(context, options = {}) {
  const calculateIncomeLossImpactTimeline = context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline;
  return calculateIncomeLossImpactTimeline({
    lensModel: createLensModel(options.lensModel || {}),
    profileRecord: {
      analysisSettings: createAnalysisSettings(options.analysisSettings || {})
    },
    valuationDate: "2026-01-01",
    selectedDeathAge: options.selectedDeathAge || 50,
    options: {
      scenario: {
        projectionHorizonYears: 10,
        mortgageTreatmentOverride: "followAssumptions"
      }
    }
  });
}

function findDeathPoint(output) {
  return output.scenarioTimeline.resourceSeries.points.find(function (point) {
    return point.id === "death-point";
  });
}

function hasSourcePath(output, pattern) {
  return JSON.stringify(output.financialRunway.householdPosition.sourcePaths).includes(pattern)
    || JSON.stringify(output.financialRunway.householdPosition.inputs).includes(pattern);
}

const pageSource = readRepoFile(pagePath);
const scriptSources = getScriptSources(pageSource);
const projectedOffsetIndex = scriptSources.indexOf(projectedOffsetScript);
const modelBuilderIndex = scriptSources.indexOf(modelBuilderScript);
const householdEngineIndex = scriptSources.indexOf(householdEngineScript);
const timelineIndex = scriptSources.indexOf(timelineScript);

assert.ok(projectedOffsetIndex >= 0, "Income Impact should load projected-asset-offset-calculations.js.");
assert.ok(modelBuilderIndex >= 0, "Income Impact should load lens-model-builder.js.");
assert.ok(
  projectedOffsetIndex < modelBuilderIndex,
  "Projected asset offset helper must load before lens-model-builder.js."
);
assert.ok(
  householdEngineIndex >= 0 && timelineIndex >= 0 && householdEngineIndex < timelineIndex,
  "Household financial position engine must load before the Income Impact timeline helper."
);

const timelineSource = readRepoFile("app/features/lens-analysis/income-loss-impact-timeline-calculations.js");
assert.doesNotMatch(
  timelineSource,
  /startingResources:[\s\S]{0,250}projectedAssetOffset\.effectiveProjectedAssetOffset/,
  "HFP starting resources must not use projectedAssetOffset.effectiveProjectedAssetOffset."
);
assert.doesNotMatch(
  timelineSource,
  /projectedAssetGrowth\.(projectedTotalAssetValue|totalProjectedGrowthAmount)[\s\S]{0,120}\+/,
  "Income Impact must not add raw projectedAssetGrowth totals into Household Financial Position."
);

const context = createContext();
loadScript(context, "app/features/lens-analysis/income-impact-warning-events-library.js");
loadScript(context, "app/features/lens-analysis/household-financial-position-calculations.js");
loadScript(context, "app/features/lens-analysis/income-loss-impact-timeline-calculations.js");

const reportingOnlyOutput = runTimeline(context, {
  analysisSettings: {
    projectedAssetOffsetAssumptions: {
      enabled: false,
      consumptionStatus: "saved-only",
      activationVersion: 0
    },
    assetTreatmentAssumptions: {
      assetGrowthProjectionAssumptions: {
        mode: "reportingOnly",
        projectionYears: 4
      }
    }
  }
});
assert.equal(reportingOnlyOutput.financialRunway.householdPosition.totalAssetGrowth, 0);
assert.equal(reportingOnlyOutput.financialRunway.householdPosition.targetBalance, 200000);
assert.equal(reportingOnlyOutput.financialRunway.householdPosition.inputs.assetGrowth.active, false);
assert.equal(
  reportingOnlyOutput.financialRunway.householdPosition.inputs.assetGrowth.trace.fallbackReason,
  "projected-asset-offset-active-gate-missing"
);

const activeOutput = runTimeline(context);
const householdPosition = activeOutput.financialRunway.householdPosition;
const assetGrowthTrace = householdPosition.inputs.assetGrowth.trace;
assert.equal(householdPosition.inputs.startingResources.sourcePath, "treatedAssetOffsets.totalTreatedAssetValue");
assert.equal(householdPosition.inputs.assetGrowth.active, true);
assert.equal(householdPosition.inputs.assetGrowth.status, "method-active");
assert.ok(householdPosition.inputs.assetGrowth.annualRatePercent > 0);
assert.ok(householdPosition.totalAssetGrowth > 0);
assert.ok(householdPosition.targetBalance > householdPosition.startingBalance);
assert.equal(
  JSON.stringify(Array.from(assetGrowthTrace.includedEligibleCategoryKeys).sort()),
  JSON.stringify(["cashAndCashEquivalents", "taxableBrokerageInvestments"].sort())
);
assert.ok(assetGrowthTrace.excludedCategoryKeys.includes("emergencyFund"));
assert.ok(assetGrowthTrace.excludedCategoryKeys.includes("primaryResidenceEquity"));
assert.ok(assetGrowthTrace.excludedCategoryKeys.includes("trustRestrictedAssets"));
assert.ok(assetGrowthTrace.excludedCategoryKeys.includes("businessPrivateCompanyValue"));
assert.equal(assetGrowthTrace.eligibleGrowthBase, 100000);
assert.equal(assetGrowthTrace.totalTreatedBase, 200000);
assert.equal(assetGrowthTrace.activeGate.enabled, true);
assert.equal(assetGrowthTrace.activeGate.consumptionStatus, "method-active");
assert.equal(assetGrowthTrace.activeGate.activationVersion, 1);
assert.equal(assetGrowthTrace.sourceMode, "projectedOffsets");
assert.equal(hasSourcePath(activeOutput, "projectedAssetGrowth.projectedTotalAssetValue"), false);
assert.equal(hasSourcePath(activeOutput, "projectedAssetGrowth.totalProjectedGrowthAmount"), false);
assert.equal(
  activeOutput.financialRunway.householdPosition.inputs.startingResources.sourcePaths.includes(
    "treatedExistingCoverageOffset.totalTreatedCoverageOffset"
  ),
  false,
  "Coverage must stay out of pre-death Household Financial Position resources."
);

const activeCurrentDeathOutput = runTimeline(context, { selectedDeathAge: 46 });
const activeCurrentHouseholdPosition = activeCurrentDeathOutput.financialRunway.householdPosition;
assert.equal(activeCurrentHouseholdPosition.durationMonths, 0);
assert.equal(activeCurrentHouseholdPosition.preTargetPoints.length, 60);
assert.equal(activeCurrentHouseholdPosition.trace.preTargetContext.assetLedgerApplied, true);
assert.equal(activeCurrentHouseholdPosition.trace.preTargetContext.reverseAssetGrowthApplied, true);
assert.equal(activeCurrentHouseholdPosition.trace.preTargetContext.reverseAssetGrowthEstimated, true);
assert.ok(
  activeCurrentHouseholdPosition.trace.preTargetContext.reverseAssetGrowthCategoryKeys.includes("cashAndCashEquivalents")
);
assert.ok(
  activeCurrentHouseholdPosition.trace.preTargetContext.reverseAssetGrowthCategoryKeys.includes("taxableBrokerageInvestments")
);
assert.ok(
  activeCurrentHouseholdPosition.preTargetPoints.some(function (point) {
    return point.growth > 0;
  }),
  "Current-age death should reverse-apply eligible active category growth in modeled pre-target context."
);
assert.ok(
  activeCurrentHouseholdPosition.preTargetPoints.every(function (point) {
    return point.status === "modeledBackcast"
      && point.precision === "estimated"
      && Array.isArray(point.assetLedger)
      && point.assetLedger.length > 0;
  }),
  "Current-age active-growth pre-target points should stay estimated/modelled asset-ledger points."
);
const activeCurrentPreDeathPoints = activeCurrentDeathOutput.scenarioTimeline.resourceSeries.points.filter(function (point) {
  return point.phase === "preDeath" && point.resolution === "modeledBackcastMonthly";
});
assert.equal(activeCurrentPreDeathPoints.length, 60);
assert.ok(
  activeCurrentPreDeathPoints.some(function (point) {
    return point.growthAmount > 0;
  }),
  "Income Impact should preserve HFP reverse growth amounts on pre-death timeline points."
);
assert.equal(
  activeCurrentHouseholdPosition.dataGaps.some(function (gap) {
    return gap.code === "reverse-asset-growth-not-applied";
  }),
  false
);

const deathPoint = findDeathPoint(activeOutput);
assert.ok(deathPoint, "Scenario timeline should include a death point.");
assert.equal(
  deathPoint.startingBalance,
  roundMoney(
    activeOutput.financialRunway.householdPosition.targetBalance
      + activeOutput.financialRunway.existingCoverage
      - activeOutput.financialRunway.immediateObligations
  ),
  "Death point should equal HFP target balance plus coverage minus immediate obligations."
);

const youngerDeathOutput = runTimeline(context, { selectedDeathAge: 49 });
assert.notEqual(
  youngerDeathOutput.financialRunway.householdPosition.targetBalance,
  activeOutput.financialRunway.householdPosition.targetBalance,
  "Changing death age should recalculate the active-growth Household Financial Position target."
);
assert.ok(
  activeOutput.financialRunway.householdPosition.targetBalance
    > youngerDeathOutput.financialRunway.householdPosition.targetBalance,
  "Longer active-growth duration should produce a larger Household Financial Position target."
);

const missingPreparedOutput = runTimeline(context, {
  lensModel: {
    root: {
      projectedAssetOffset: null
    }
  }
});
assert.equal(missingPreparedOutput.financialRunway.householdPosition.inputs.assetGrowth.active, false);
assert.equal(missingPreparedOutput.financialRunway.householdPosition.totalAssetGrowth, 0);
assert.ok(
  missingPreparedOutput.financialRunway.householdPosition.dataGaps.some(function (gap) {
    return gap.code === "missing-projected-asset-offset-for-household-growth";
  }),
  "Active marker with missing prepared output should create a data gap."
);

assert.deepEqual(context.storageWrites, [], "Income Impact timeline calculations should not write storage.");

console.log("income-loss-impact-household-asset-growth-integration-check passed");
