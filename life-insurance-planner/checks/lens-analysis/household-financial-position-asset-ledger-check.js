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
    Intl,
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
  const projectedTreatedValue = projectedValue(treatedValue, rate, years);
  return {
    categoryKey,
    label: categoryKey,
    treatedValue,
    assumedAnnualGrowthRatePercent: rate,
    projectedTreatedValue,
    projectedGrowthAdjustment: roundMoney(projectedTreatedValue - treatedValue),
    projectionYears: years
  };
}

function createProjectedAssetOffset(overrides = {}) {
  const years = 20;
  const includedCategories = [
    createProjectedCategory("cashAndCashEquivalents", 510000, 2, years),
    createProjectedCategory("taxableBrokerageInvestments", 42750, 6, years),
    createProjectedCategory("traditionalRetirementAssets", 17100, 6, years),
    createProjectedCategory("emergencyFund", 10000, 12, years)
  ];
  const eligibleCategories = includedCategories.filter(function (category) {
    return category.categoryKey !== "emergencyFund";
  });
  const projectedGrowthAdjustment = roundMoney(
    eligibleCategories.reduce(function (total, category) {
      return total + category.projectedGrowthAdjustment;
    }, 0)
  );

  return {
    source: "projected-asset-offset-calculations",
    currentTreatedAssetOffset: 587500,
    eligibleTreatedBase: 569850,
    projectedTreatedValue: roundMoney(569850 + projectedGrowthAdjustment),
    projectedGrowthAdjustment,
    effectiveProjectedAssetOffset: roundMoney(587500 + projectedGrowthAdjustment),
    projectionYears: years,
    sourceMode: "projectedOffsets",
    projectionMode: "projectedOffsetsFutureInactive",
    consumptionStatus: "saved-only",
    consumedByMethods: false,
    activationStatus: "future-inactive",
    includedCategories,
    excludedCategories: [
      { categoryKey: "trustRestrictedAssets" },
      { categoryKey: "businessPrivateCompanyValue" }
    ],
    ...overrides
  };
}

function createAnalysisSettings(overrides = {}) {
  return {
    projectedAssetOffsetAssumptions: {
      enabled: true,
      consumptionStatus: "method-active",
      activationVersion: 1
    },
    assetTreatmentAssumptions: {
      assetGrowthProjectionAssumptions: {
        mode: "projectedOffsets",
        projectionYears: 20
      }
    },
    ...overrides
  };
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthStatus: "valid"
    },
    incomeBasis: {
      insuredGrossAnnualIncome: 240000,
      insuredNetAnnualIncome: 120000,
      spouseOrPartnerGrossAnnualIncome: 60000,
      spouseOrPartnerNetAnnualIncome: 40000,
      ...(overrides.incomeBasis || {})
    },
    survivorScenario: {
      survivorNetAnnualIncome: 40000,
      survivorGrossAnnualIncome: 60000,
      survivorIncomeStartDelayMonths: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 90000,
      monthlyTotalEssentialSupportCost: 7500,
      annualDiscretionaryPersonalSpending: 24000,
      monthlyDiscretionaryPersonalSpending: 2000,
      ...(overrides.ongoingSupport || {})
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 400000,
      ...(overrides.treatedExistingCoverageOffset || {})
    },
    existingCoverage: {
      totalExistingCoverage: 900000,
      totalProfileCoverage: 900000
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 587500,
      assets: [
        {
          categoryKey: "cashAndCashEquivalents",
          label: "Cash & Cash Equivalents",
          rawValue: 510000,
          include: true,
          taxDragPercent: 0,
          liquidityDiscountPercent: 0,
          treatedValue: 510000
        },
        {
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage / Investments",
          rawValue: 45000,
          include: true,
          taxDragPercent: 0,
          liquidityDiscountPercent: 5,
          treatedValue: 42750
        },
        {
          categoryKey: "traditionalRetirementAssets",
          label: "Traditional Retirement Assets",
          rawValue: 24000,
          include: true,
          taxDragPercent: 25,
          liquidityDiscountPercent: 5,
          treatedValue: 17100
        },
        {
          categoryKey: "emergencyFund",
          label: "Emergency Fund",
          rawValue: 10000,
          include: true,
          taxDragPercent: 0,
          liquidityDiscountPercent: 0,
          treatedValue: 10000
        },
        {
          categoryKey: "nonqualifiedAnnuities",
          label: "Nonqualified Annuities",
          rawValue: 10000,
          include: true,
          taxDragPercent: 15,
          liquidityDiscountPercent: 10,
          treatedValue: 7650
        },
        {
          categoryKey: "primaryResidenceEquity",
          label: "Primary Residence Equity",
          rawValue: 250000,
          include: false,
          taxDragPercent: 0,
          liquidityDiscountPercent: 25,
          treatedValue: 0
        },
        {
          categoryKey: "trustRestrictedAssets",
          label: "Trust / Restricted Assets",
          rawValue: 999999,
          include: false,
          treatedValue: 0
        }
      ],
      ...(overrides.treatedAssetOffsets || {})
    },
    projectedAssetOffset: createProjectedAssetOffset(overrides.projectedAssetOffset || {}),
    projectedAssetGrowth: {
      projectedTotalAssetValue: 999999999,
      totalProjectedGrowthAmount: 888888888
    },
    finalExpenses: {
      totalFinalExpenseNeed: 25000
    },
    transitionNeeds: {
      totalTransitionNeed: 15000
    },
    treatedDebtPayoff: {
      needs: {
        debtPayoffAmount: 60000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 60000
      },
      debts: []
    },
    debtPayoff: {
      totalDebtPayoffNeed: 60000,
      mortgageBalance: 0
    },
    educationSupport: {
      linkedDependentCount: 0,
      currentDependentDetails: []
    },
    ...(overrides.root || {})
  };
}

function runTimeline(context, options = {}) {
  return context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline({
    lensModel: createLensModel(options.lensModel || {}),
    profileRecord: {
      analysisSettings: createAnalysisSettings(options.analysisSettings || {})
    },
    valuationDate: "2026-01-01",
    selectedDeathAge: options.selectedDeathAge,
    options: {
      scenario: {
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions"
      }
    }
  });
}

function loadHouseholdOnlyContext() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/household-financial-position-calculations.js");
  return context;
}

function loadTimelineContext() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/income-impact-warning-events-library.js");
  loadScript(context, "app/features/lens-analysis/household-financial-position-calculations.js");
  loadScript(context, "app/features/lens-analysis/income-loss-impact-timeline-calculations.js");
  return context;
}

const helperSource = readRepoFile("app/features/lens-analysis/household-financial-position-calculations.js");
const timelineSource = readRepoFile("app/features/lens-analysis/income-loss-impact-timeline-calculations.js");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");

assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]/);
assert.doesNotMatch(helperSource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);
assert.doesNotMatch(displaySource, /assetLedger|calculateHouseholdFinancialPosition/);
assert.doesNotMatch(
  timelineSource,
  /startingResources:[\s\S]{0,250}projectedAssetOffset\.effectiveProjectedAssetOffset/,
  "Income Impact must not use projectedAssetOffset.effectiveProjectedAssetOffset as HFP starting resources."
);
assert.doesNotMatch(
  timelineSource,
  /projectedAssetGrowth\.(projectedTotalAssetValue|totalProjectedGrowthAmount)[\s\S]{0,120}\+/,
  "Income Impact must not consume raw projectedAssetGrowth totals."
);

const householdContext = loadHouseholdOnlyContext();
const calculateHouseholdFinancialPosition = householdContext.LensApp.lensAnalysis.calculateHouseholdFinancialPosition;

const ledgerResult = calculateHouseholdFinancialPosition({
  asOfDate: "2026-01-01",
  targetDate: "2027-01-01",
  assetLedger: [
    {
      categoryKey: "traditionalRetirementAssets",
      rawValue: 24000,
      treatedValue: 17100,
      included: true,
      taxDragPercent: 25,
      liquidityHaircutPercent: 5,
      annualGrowthRatePercent: 6,
      growthStatus: "method-active",
      growthEligible: true,
      sourcePaths: ["treatedAssetOffsets.assets[0].treatedValue"]
    },
    {
      categoryKey: "primaryResidenceEquity",
      rawValue: 999999,
      treatedValue: 0,
      included: false,
      annualGrowthRatePercent: 20,
      growthStatus: "method-active",
      growthEligible: false,
      sourcePaths: ["treatedAssetOffsets.assets[1].treatedValue"]
    }
  ],
  cashFlow: {
    recurringIncome: { value: 0, frequency: "annual", status: "net-household-income" },
    essentialExpenses: { value: 0, frequency: "annual", status: "prepared-bucket" },
    discretionaryExpenses: { value: 0, frequency: "annual", status: "prepared-discretionary-bucket" }
  },
  options: {}
});
assert.equal(ledgerResult.status, "complete");
assert.equal(ledgerResult.startingBalance, 17100);
assert.equal(ledgerResult.assetLedgerStart.length, 2);
assert.equal(ledgerResult.assetLedgerStart.find((row) => row.categoryKey === "traditionalRetirementAssets").balance, 17100);
assert.equal(ledgerResult.assetLedgerStart.find((row) => row.categoryKey === "primaryResidenceEquity").balance, 0);
assert.ok(ledgerResult.totalAssetGrowth > 0);
assert.ok(ledgerResult.targetBalance > 17100);

const savedOnlyGrowth = calculateHouseholdFinancialPosition({
  asOfDate: "2026-01-01",
  targetDate: "2028-01-01",
  assetLedger: [
    {
      categoryKey: "taxableBrokerageInvestments",
      rawValue: 50000,
      treatedValue: 45000,
      included: true,
      annualGrowthRatePercent: 12,
      growthStatus: "saved-only",
      growthEligible: true
    }
  ],
  cashFlow: {
    recurringIncome: { value: 0, frequency: "annual", status: "net-household-income" },
    essentialExpenses: { value: 0, frequency: "annual", status: "prepared-bucket" },
    discretionaryExpenses: { value: 0, frequency: "annual", status: "prepared-discretionary-bucket" }
  }
});
assert.equal(savedOnlyGrowth.totalAssetGrowth, 0);
assert.equal(savedOnlyGrowth.targetBalance, 45000);

const discretionaryComparisonBase = {
  asOfDate: "2026-01-01",
  targetDate: "2027-01-01",
  assetLedger: [
    { categoryKey: "cashAndCashEquivalents", treatedValue: 100000, included: true }
  ],
  cashFlow: {
    recurringIncome: { value: 120000, frequency: "annual", status: "net-household-income" },
    essentialExpenses: { value: 60000, frequency: "annual", status: "prepared-bucket" }
  }
};
const noDiscretionary = calculateHouseholdFinancialPosition({
  ...discretionaryComparisonBase,
  cashFlow: {
    ...discretionaryComparisonBase.cashFlow,
    discretionaryExpenses: { value: 0, frequency: "annual", status: "prepared-discretionary-bucket" }
  }
});
const withDiscretionary = calculateHouseholdFinancialPosition({
  ...discretionaryComparisonBase,
  cashFlow: {
    ...discretionaryComparisonBase.cashFlow,
    discretionaryExpenses: { value: 24000, frequency: "annual", status: "prepared-discretionary-bucket" }
  }
});
assert.equal(noDiscretionary.targetBalance, 160000);
assert.equal(withDiscretionary.targetBalance, 136000);
assert.equal(withDiscretionary.totalDiscretionaryExpenses, 24000);

const deficit = calculateHouseholdFinancialPosition({
  ...discretionaryComparisonBase,
  cashFlow: {
    recurringIncome: { value: 40000, frequency: "annual", status: "net-household-income" },
    essentialExpenses: { value: 90000, frequency: "annual", status: "prepared-bucket" },
    discretionaryExpenses: { value: 24000, frequency: "annual", status: "prepared-discretionary-bucket" }
  }
});
assert.equal(deficit.targetBalance, 26000);
assert.ok(deficit.points.at(-1).netSurplusDeficit < 0);

const unsafeGrossIncome = calculateHouseholdFinancialPosition({
  ...discretionaryComparisonBase,
  cashFlow: {
    recurringIncome: { value: 180000, frequency: "annual", status: "gross-fallback" },
    essentialExpenses: { value: 60000, frequency: "annual", status: "prepared-bucket" },
    discretionaryExpenses: { value: 0, frequency: "annual", status: "prepared-discretionary-bucket" }
  }
});
assert.equal(unsafeGrossIncome.status, "data-gap");
assert.ok(unsafeGrossIncome.dataGaps.some((gap) => gap.code === "unsafe-recurring-income"));

const timelineContext = loadTimelineContext();
const activeCurrentDeath = runTimeline(timelineContext, { selectedDeathAge: 46 });
const activeFiveYearDeath = runTimeline(timelineContext, { selectedDeathAge: 51 });
const activeTwentyYearDeath = runTimeline(timelineContext, { selectedDeathAge: 66 });

assert.equal(activeCurrentDeath.financialRunway.householdPosition.startingBalance, 587500);
assert.equal(activeCurrentDeath.financialRunway.householdPosition.inputs.startingResources.sourcePath, "treatedAssetOffsets.totalTreatedAssetValue");
assert.equal(activeCurrentDeath.financialRunway.householdPosition.inputs.assetLedger.length, 7);
assert.equal(
  activeCurrentDeath.financialRunway.householdPosition.assetLedgerStart
    .find((row) => row.categoryKey === "traditionalRetirementAssets").treatedValue,
  17100
);
assert.equal(
  activeCurrentDeath.financialRunway.householdPosition.assetLedgerStart
    .find((row) => row.categoryKey === "primaryResidenceEquity").balance,
  0
);
assert.equal(
  activeCurrentDeath.financialRunway.householdPosition.assetLedgerStart
    .find((row) => row.categoryKey === "emergencyFund").growthActive,
  false
);
assert.equal(activeCurrentDeath.financialRunway.householdPosition.durationMonths, 0);
assert.equal(activeCurrentDeath.financialRunway.householdPosition.preTargetPoints.length, 60);
assert.equal(activeCurrentDeath.financialRunway.householdPosition.trace.preTargetContext.assetLedgerApplied, true);
assert.equal(activeCurrentDeath.financialRunway.householdPosition.trace.preTargetContext.reverseAssetGrowthApplied, true);
assert.ok(
  activeCurrentDeath.financialRunway.householdPosition.trace.preTargetContext.reverseAssetGrowthCategoryKeys.includes(
    "cashAndCashEquivalents"
  )
);
assert.ok(
  activeCurrentDeath.financialRunway.householdPosition.preTargetPoints.some((point) => point.growth > 0),
  "Current-age modeled pre-target context should reverse-apply eligible method-active category growth."
);
assert.ok(
  activeCurrentDeath.financialRunway.householdPosition.preTargetPoints.every((point) => (
    point.status === "modeledBackcast"
      && point.precision === "estimated"
      && Array.isArray(point.assetLedger)
      && point.assetLedger.length > 0
  )),
  "Current-age modeled pre-target points should come from the treated asset ledger, not scalar-only fallback."
);
assert.equal(
  activeCurrentDeath.financialRunway.householdPosition.preTargetPoints
    .some((point) => point.assetLedger.some((row) => row.categoryKey === "primaryResidenceEquity" && row.balance > 0)),
  false,
  "Excluded treated asset rows should not re-enter modeled pre-target context."
);
assert.ok(
  activeCurrentDeath.financialRunway.householdPosition.preTargetPoints[0].endingBalance
    < activeCurrentDeath.financialRunway.householdPosition.preTargetPoints.at(-1).endingBalance,
  "Current-age modeled pre-target context should show surplus and estimated growth accumulating toward death."
);
assert.equal(
  activeCurrentDeath.financialRunway.householdPosition.dataGaps
    .some((gap) => gap.code === "reverse-asset-growth-not-applied"),
  false
);
assert.equal(activeCurrentDeath.financialRunway.householdPosition.totalDiscretionaryExpenses, 0);
assert.ok(activeFiveYearDeath.financialRunway.householdPosition.totalDiscretionaryExpenses > 0);
assert.ok(activeFiveYearDeath.financialRunway.householdPosition.totalAssetGrowth > 0);
assert.notEqual(
  activeCurrentDeath.financialRunway.householdPosition.targetBalance,
  activeFiveYearDeath.financialRunway.householdPosition.targetBalance
);
assert.notEqual(
  activeFiveYearDeath.financialRunway.householdPosition.targetBalance,
  activeTwentyYearDeath.financialRunway.householdPosition.targetBalance
);
assert.ok(
  activeTwentyYearDeath.financialRunway.householdPosition.targetBalance
    > activeFiveYearDeath.financialRunway.householdPosition.targetBalance,
  "Longer duration should accumulate more surplus and eligible category growth."
);
assert.equal(
  activeTwentyYearDeath.financialRunway.householdPosition.inputs.startingResources.sourcePaths.includes(
    "treatedExistingCoverageOffset.totalTreatedCoverageOffset"
  ),
  false,
  "Coverage must stay out of HFP pre-death resources."
);
const deathPoint = activeTwentyYearDeath.scenarioTimeline.resourceSeries.points.find((point) => point.id === "death-point");
assert.ok(deathPoint);
assert.equal(
  deathPoint.startingBalance,
  roundMoney(
    activeTwentyYearDeath.financialRunway.householdPosition.targetBalance
      + activeTwentyYearDeath.financialRunway.existingCoverage
      - activeTwentyYearDeath.financialRunway.immediateObligations
  )
);
assert.equal(JSON.stringify(activeTwentyYearDeath.financialRunway.householdPosition).includes("projectedAssetGrowth.projectedTotalAssetValue"), false);
assert.equal(JSON.stringify(activeTwentyYearDeath.financialRunway.householdPosition).includes("projectedAssetGrowth.totalProjectedGrowthAmount"), false);

const reportingOnly = runTimeline(timelineContext, {
  selectedDeathAge: 66,
  analysisSettings: {
    projectedAssetOffsetAssumptions: {
      enabled: false,
      consumptionStatus: "saved-only",
      activationVersion: 0
    },
    assetTreatmentAssumptions: {
      assetGrowthProjectionAssumptions: {
        mode: "reportingOnly",
        projectionYears: 20
      }
    }
  }
});
assert.equal(reportingOnly.financialRunway.householdPosition.inputs.assetGrowth.active, false);
assert.equal(reportingOnly.financialRunway.householdPosition.totalAssetGrowth, 0);
assert.ok(
  activeTwentyYearDeath.financialRunway.householdPosition.targetBalance
    > reportingOnly.financialRunway.householdPosition.targetBalance,
  "Method-active category growth should exceed reporting-only current-dollar projection."
);

console.log("household-financial-position-asset-ledger-check passed");
