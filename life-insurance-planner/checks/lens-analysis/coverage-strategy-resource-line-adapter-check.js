#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const adapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-resource-line-adapter.js"
);
const taxonomyPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "asset-taxonomy.js"
);
const treatmentPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "asset-treatment-calculations.js"
);
const allocationHelperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-resource-allocation-depletion.js"
);
const educationProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-education-lifetime-projection.js"
);
const needLineAdapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-need-line-adapter.js"
);
const scenarioSettingsPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-scenario-settings.js"
);
const pageControllerPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-page.js"
);

const adapterSource = fs.readFileSync(adapterPath, "utf8");
const taxonomySource = fs.readFileSync(taxonomyPath, "utf8");
const treatmentSource = fs.readFileSync(treatmentPath, "utf8");
const allocationHelperSource = fs.readFileSync(allocationHelperPath, "utf8");
const educationProjectionSource = fs.readFileSync(educationProjectionPath, "utf8");
const needLineAdapterSource = fs.readFileSync(needLineAdapterPath, "utf8");
const scenarioSettingsSource = fs.readFileSync(scenarioSettingsPath, "utf8");
const pageControllerSource = fs.readFileSync(pageControllerPath, "utf8");

function loadAdapter({ includeTreatment = true } = {}) {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  if (includeTreatment) {
    vm.runInContext(taxonomySource, context, { filename: taxonomyPath });
    vm.runInContext(treatmentSource, context, { filename: treatmentPath });
  }
  vm.runInContext(adapterSource, context, { filename: adapterPath });
  return context.LensApp.lensAnalysis.buildCoverageStrategyResourceLine;
}

function createNeedPoints() {
  return [0, 1, 2, 3].map((yearIndex) => ({
    yearIndex,
    date: `${2026 + yearIndex}-01-01`,
    calendarYear: 2026 + yearIndex,
    age: 40 + yearIndex,
    grossNeedAmount: Math.max(0, 1000000 - yearIndex * 100000),
    needAmount: Math.max(0, 1000000 - yearIndex * 100000)
  }));
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1986-01-01"
    },
    assetFacts: {
      assets: [
        {
          id: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          currentValue: 100000,
          sourcePaths: ["lensModel.assetFacts.assets.0.currentValue"]
        },
        {
          id: "brokerage",
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage",
          currentValue: 50000,
          sourcePaths: ["lensModel.assetFacts.assets.1.currentValue"]
        },
        {
          id: "home-equity",
          categoryKey: "primaryResidenceEquity",
          label: "Primary Residence Equity",
          currentValue: 300000,
          sourcePaths: ["lensModel.assetFacts.assets.2.currentValue"]
        },
        {
          id: "life-insurance",
          categoryKey: "existingLifeInsuranceCoverage",
          label: "Existing life insurance",
          currentValue: 750000,
          sourcePaths: ["coveragePolicies.0.deathBenefit"]
        }
      ]
    },
    projectedAssetGrowth: {
      includedCategories: [
        {
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage",
          assumedAnnualGrowthRatePercent: 6,
          assumedAnnualGrowthRateSource: "asset-growth-fixture",
          growthConsumptionStatus: "method-active"
        }
      ]
    },
    resourceProjectionInputs: {
      savingAllocations: [
        {
          id: "monthly-investing",
          label: "Monthly investing",
          targetAssetCategoryKey: "taxableBrokerageInvestments",
          targetAssetCategoryLabel: "Taxable Brokerage",
          monthlyAmount: 1000,
          annualGrowthRate: 0.06,
          growthStatus: "method-active",
          sourcePaths: ["lensModel.resourceProjectionInputs.savingAllocations.0"]
        }
      ],
      unassignedSurplus: 999999
    },
    ...overrides
  };
}

function createAnalysisSettings(overrides = {}) {
  return {
    valuationDate: "2026-01-01",
    assetTreatmentAssumptions: {
      enabled: true,
      assets: {
        cashAndCashEquivalents: {
          include: true,
          treatmentPreset: "cash-like",
          taxTreatment: "no-tax-drag",
          taxDragPercent: 0,
          liquidityHaircutPercent: 0
        },
        taxableBrokerageInvestments: {
          include: true,
          treatmentPreset: "step-up-investment",
          taxTreatment: "step-up-eligible",
          taxDragPercent: 0,
          liquidityHaircutPercent: 5
        },
        primaryResidenceEquity: {
          include: false,
          treatmentPreset: "real-estate-equity",
          taxTreatment: "step-up-eligible",
          taxDragPercent: 0,
          liquidityHaircutPercent: 25
        }
      }
    },
    ...overrides
  };
}

function buildResourceLine(overrides = {}) {
  const buildCoverageStrategyResourceLine = loadAdapter();
  return buildCoverageStrategyResourceLine({
    lensModel: createLensModel(overrides.lensModel),
    analysisSettings: createAnalysisSettings(overrides.analysisSettings),
    needPoints: createNeedPoints(),
    valuationDate: "2026-01-01",
    horizonYears: 3,
    options: overrides.options
  });
}

function buildLongResourceLine({ rate, rateField = "annualGrowthRate", monthlySavings = 0 } = {}) {
  const buildCoverageStrategyResourceLine = loadAdapter();
  const needPoints = Array.from({ length: 41 }, (_unused, yearIndex) => ({
    yearIndex,
    date: `${2026 + yearIndex}-01-01`,
    calendarYear: 2026 + yearIndex,
    age: 40 + yearIndex,
    needAmount: 1000000
  }));
  return buildCoverageStrategyResourceLine({
    lensModel: {
      profileFacts: {
        clientDateOfBirth: "1986-01-01"
      },
      assetFacts: {
        assets: [
          {
            id: "cash",
            categoryKey: "cashAndCashEquivalents",
            label: "Cash",
            currentValue: 120400,
            [rateField]: rate
          }
        ]
      },
      resourceProjectionInputs: {
        savingAllocations: monthlySavings > 0
          ? [
              {
                id: "assigned-savings",
                targetAssetCategoryKey: "cashAndCashEquivalents",
                monthlyAmount: monthlySavings,
                annualGrowthRate: rate
              }
            ]
          : [],
        unassignedSurplus: 9000000
      }
    },
    analysisSettings: {
      assetTreatmentAssumptions: {
        enabled: true,
        assets: {
          cashAndCashEquivalents: {
            include: true,
            treatmentPreset: "cash-like",
            taxTreatment: "no-tax-drag",
            taxDragPercent: 0,
            liquidityHaircutPercent: 0
          }
        }
      }
    },
    needPoints,
    valuationDate: "2026-01-01"
  });
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.code);
}

assert.doesNotMatch(adapterSource, /\bdocument\b/);
assert.doesNotMatch(adapterSource, /\blocalStorage\b/);
assert.doesNotMatch(adapterSource, /\bsessionStorage\b/);
assert.doesNotMatch(adapterSource, /\bquerySelector\b/);
assert.doesNotMatch(adapterSource, /calculateHouseholdSurvivorRunway/);
assert.doesNotMatch(adapterSource, /netCoverageGap/);
assert.doesNotMatch(adapterSource, /coveragePolicies/);
assert.doesNotMatch(adapterSource, /netWorth/i);
assert.match(adapterSource, /resourceLineAdjustmentsByYear/);
assert.match(allocationHelperSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(adapterSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(educationProjectionSource, /calculateCoverageStrategyResourceAllocationDepletion|coverage-strategy-resource-allocation-depletion\.js/);
assert.doesNotMatch(needLineAdapterSource, /calculateCoverageStrategyResourceAllocationDepletion|coverage-strategy-resource-allocation-depletion\.js/);
assert.doesNotMatch(scenarioSettingsSource, /calculateCoverageStrategyResourceAllocationDepletion|coverage-strategy-resource-allocation-depletion\.js/);
assert.match(pageControllerSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(pageControllerSource, /Savings \+ Assets|value="eligibleResourcesAfterEducationSavings"/);

const buildCoverageStrategyResourceLine = loadAdapter();
assert.equal(typeof buildCoverageStrategyResourceLine, "function", "adapter exports buildCoverageStrategyResourceLine");

const sourceLensModel = createLensModel();
const sourceNeedPoints = createNeedPoints();
const beforeLensModel = JSON.stringify(sourceLensModel);
const beforeNeedPoints = JSON.stringify(sourceNeedPoints);
const result = buildCoverageStrategyResourceLine({
  lensModel: sourceLensModel,
  analysisSettings: createAnalysisSettings(),
  needPoints: sourceNeedPoints,
  valuationDate: "2026-01-01"
});

assert.equal(JSON.stringify(sourceLensModel), beforeLensModel, "source lensModel is not mutated");
assert.equal(JSON.stringify(sourceNeedPoints), beforeNeedPoints, "source needPoints are not mutated");
assert.equal(result.status, "complete", "baseline resource line completes");
assert.equal(result.cadence, "annual", "resource line is annual");
assert.equal(result.resourcePoints.length, sourceNeedPoints.length, "resource points align to need points");
assert.equal(result.resourceLineAdjustments.requestedAdjustmentCount, 0, "baseline has no resource adjustments");
assert.equal(result.resourceLineAdjustments.resourceLineReductionApplied, false, "baseline applies no resource reduction");
assert.equal(result.trace.resourceLineReductionApplied, false, "baseline trace applies no resource reduction");
assert.equal(result.trace.resourceLineMathChanged, false, "baseline trace does not change resource math");
assert.deepEqual(
  result.resourcePoints.map((point) => point.yearIndex),
  sourceNeedPoints.map((point) => point.yearIndex),
  "resource year indexes match need point year indexes"
);

const currentPoint = result.resourcePoints[0];
assert.equal(currentPoint.resourceAmount, 147500, "current eligible resources use treated assets only");
assert.equal(currentPoint.categoryAmounts.cashAndCashEquivalents, 100000, "cash is included at treated value");
assert.equal(currentPoint.categoryAmounts.taxableBrokerageInvestments, 47500, "taxable brokerage liquidity treatment is applied");
assert.equal(currentPoint.excludedCategoryAmounts.primaryResidenceEquity, 300000, "primary residence equity is excluded by treatment");
assert.ok(
  !Object.prototype.hasOwnProperty.call(currentPoint.categoryAmounts, "existingLifeInsuranceCoverage"),
  "existing life insurance is not included as a resource"
);
assert.equal(currentPoint.excludedSurplus, 999999, "unallocated surplus is traced separately");
assert.equal(
  currentPoint.resourceAmount < currentPoint.excludedSurplus,
  true,
  "unallocated surplus does not inflate resourceAmount"
);
assert.equal(currentPoint.trace.existingCoverageIncluded, false, "trace excludes existing coverage");
assert.equal(currentPoint.trace.unallocatedSurplusIncludedInResourceAmount, false, "trace excludes unallocated surplus");
assert.equal(currentPoint.trace.insuranceProceedsIncluded, false, "trace excludes insurance proceeds");
assert.equal(
  Object.prototype.hasOwnProperty.call(currentPoint.trace, "resourceLineReductionApplied"),
  false,
  "baseline point trace is not expanded with depletion fields"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(currentPoint, "resourceLineAdjustmentAmount"),
  false,
  "baseline point shape is not expanded with depletion amounts"
);

const yearOne = result.resourcePoints[1];
assert.ok(yearOne.resourceAmount > currentPoint.resourceAmount, "growth and assigned savings increase eligible resources over time");
assert.ok(yearOne.savingsContributionAmount > 0, "assigned planned savings contributes to target category");
assert.ok(yearOne.growthAmount > 0, "category-aware growth is applied where available");
assert.ok(
  yearOne.savingsContributionAmountsByCategory.taxableBrokerageInvestments > 0,
  "planned savings is assigned by target asset category"
);

const sixPercent = buildLongResourceLine({ rate: 6 });
const decimalSixPercent = buildLongResourceLine({ rate: 0.06 });
const percentFieldSixPercent = buildLongResourceLine({ rate: 6, rateField: "annualGrowthRatePercent" });
const assumedPercentFieldSixPercent = buildLongResourceLine({ rate: 6, rateField: "assumedAnnualGrowthRatePercent" });
const finalSixPercent = sixPercent.resourcePoints.at(-1);
assert.equal(
  finalSixPercent.resourceAmount,
  decimalSixPercent.resourcePoints.at(-1).resourceAmount,
  "annual growth input 6 and 0.06 produce equivalent resource output"
);
assert.equal(
  finalSixPercent.resourceAmount,
  percentFieldSixPercent.resourcePoints.at(-1).resourceAmount,
  "annualGrowthRatePercent input 6 follows the same 6% convention"
);
assert.equal(
  finalSixPercent.resourceAmount,
  assumedPercentFieldSixPercent.resourcePoints.at(-1).resourceAmount,
  "assumedAnnualGrowthRatePercent input 6 normalizes to 6%"
);
assert.ok(
  finalSixPercent.resourceAmount > 1200000 && finalSixPercent.resourceAmount < 1300000,
  "120400 at 6% for 40 years remains in a sane compounding range"
);

const decimalHalfPercent = buildLongResourceLine({ rate: 0.005 });
const percentFieldHalfPercent = buildLongResourceLine({ rate: 0.5, rateField: "assumedAnnualGrowthRatePercent" });
assert.equal(
  percentFieldHalfPercent.resourcePoints.at(-1).resourceAmount,
  decimalHalfPercent.resourcePoints.at(-1).resourceAmount,
  "assumedAnnualGrowthRatePercent input 0.5 normalizes to 0.5%"
);
assert.ok(
  !issueCodes(percentFieldHalfPercent.warnings).includes("resource-growth-rate-clamped"),
  "valid 0.5% percent-field growth is not clamped to the 12% maximum"
);
assert.ok(
  percentFieldHalfPercent.resourcePoints[15].resourceAmount < 132000,
  "0.5% emergency-fund-style growth over 15 years stays materially below the old clamped projection"
);
assert.ok(
  percentFieldHalfPercent.resourcePoints.at(-1).resourceAmount > 145000
    && percentFieldHalfPercent.resourcePoints.at(-1).resourceAmount < 150000,
  "120400 at 0.5% for 40 years stays in a sane compounding range"
);

const clampedOutlier = buildLongResourceLine({ rate: 600 });
assert.ok(
  issueCodes(clampedOutlier.warnings).includes("resource-growth-rate-clamped"),
  "outlier growth rates are clamped and warned"
);
assert.ok(
  clampedOutlier.resourcePoints.at(-1).resourceAmount < 12000000,
  "outlier growth cannot produce absurd resource values"
);

const withSavings = buildLongResourceLine({ rate: 6, monthlySavings: 1000 });
assert.ok(
  withSavings.resourcePoints.at(-1).resourceAmount > finalSixPercent.resourceAmount,
  "assigned planned savings increases projected eligible resources"
);
assert.ok(
  withSavings.resourcePoints.at(-1).resourceAmount < 4000000,
  "reasonable assigned savings remains within expected compounding bounds"
);
assert.equal(
  withSavings.resourcePoints.at(-1).excludedSurplus,
  9000000,
  "unallocated surplus is traced separately on long-horizon points"
);
assert.ok(
  withSavings.resourcePoints.at(-1).resourceAmount < withSavings.resourcePoints.at(-1).excludedSurplus,
  "unallocated surplus is not included in primary resourceAmount"
);

const missingGrowth = buildLongResourceLine({ rate: undefined });
assert.ok(
  issueCodes(missingGrowth.warnings).includes("resource-growth-rate-missing-defaulted"),
  "missing growth defaults conservatively with warning"
);
assert.equal(
  missingGrowth.resourcePoints.at(-1).resourceAmount,
  120400,
  "missing growth uses conservative 0% growth"
);

const categoryRows = result.categoryPoints.filter((row) => row.categoryKey === "taxableBrokerageInvestments");
assert.equal(categoryRows.length, result.resourcePoints.length, "category points are emitted by year");
assert.ok(categoryRows[1].treatedValue > categoryRows[0].treatedValue, "category points carry projected treated values");

const noAdjustmentBaseline = buildResourceLine();
const emptyAdjustmentInput = buildResourceLine({
  options: {
    resourceLineAdjustmentsByYear: []
  }
});
assert.deepEqual(
  emptyAdjustmentInput.resourcePoints.map((point) => point.resourceAmount),
  noAdjustmentBaseline.resourcePoints.map((point) => point.resourceAmount),
  "empty adjustment input keeps baseline resource amounts unchanged"
);

const singleDepletion = buildResourceLine({
  options: {
    resourceLineAdjustmentsByYear: [
      {
        adjustmentId: "education-depletion-year-2",
        yearIndex: 2,
        calendarYear: 2028,
        amount: 10000,
        categoryKey: "taxableBrokerageInvestments",
        componentKey: "education",
        obligationId: "education-payment-1",
        source: "test-fixture"
      }
    ]
  }
});
assert.equal(
  singleDepletion.resourcePoints[1].resourceAmount,
  noAdjustmentBaseline.resourcePoints[1].resourceAmount,
  "single year-2 depletion does not affect prior years"
);
assert.equal(
  singleDepletion.resourcePoints[2].resourceAmount,
  noAdjustmentBaseline.resourcePoints[2].resourceAmount - 10000,
  "single depletion reduces event year resources"
);
assert.equal(
  singleDepletion.resourcePoints[3].resourceAmount,
  noAdjustmentBaseline.resourcePoints[3].resourceAmount - 10000,
  "single depletion carries forward to future resources"
);
assert.equal(
  singleDepletion.resourcePoints[2].categoryAmounts.taxableBrokerageInvestments,
  noAdjustmentBaseline.resourcePoints[2].categoryAmounts.taxableBrokerageInvestments - 10000,
  "category-attributed depletion reduces category amount"
);
assert.equal(singleDepletion.resourceLineAdjustments.appliedAdjustmentCount, 1);
assert.equal(singleDepletion.resourceLineAdjustments.totalResourceLineReduction, 10000);
assert.equal(singleDepletion.trace.resourceLineReductionApplied, true);
assert.equal(singleDepletion.trace.resourceLineMathChanged, true);
assert.equal(singleDepletion.resourcePoints[2].trace.resourceLineReductionApplied, true);
assert.equal(singleDepletion.resourceLineAdjustments.adjustmentsApplied[0].categoryAttributionStatus, "category-attributed");

const multipleDepletion = buildResourceLine({
  options: {
    resourceLineAdjustmentsByYear: [
      {
        adjustmentId: "year-1-depletion",
        yearIndex: 1,
        amount: 5000,
        categoryKey: "cashAndCashEquivalents",
        componentKey: "education"
      },
      {
        adjustmentId: "year-3-depletion",
        yearIndex: 3,
        amount: 7000,
        categoryKey: "taxableBrokerageInvestments",
        componentKey: "education"
      }
    ]
  }
});
assert.equal(
  multipleDepletion.resourcePoints[1].resourceAmount,
  noAdjustmentBaseline.resourcePoints[1].resourceAmount - 5000,
  "first depletion applies in year 1"
);
assert.equal(
  multipleDepletion.resourcePoints[2].resourceAmount,
  noAdjustmentBaseline.resourcePoints[2].resourceAmount - 5000,
  "first depletion carries through year 2"
);
assert.equal(
  multipleDepletion.resourcePoints[3].resourceAmount,
  noAdjustmentBaseline.resourcePoints[3].resourceAmount - 12000,
  "multiple depletion events accumulate"
);

const cappedDepletion = buildResourceLine({
  options: {
    resourceLineAdjustmentsByYear: [
      {
        adjustmentId: "oversized-depletion",
        yearIndex: 0,
        amount: 999999,
        componentKey: "education"
      }
    ]
  }
});
assert.equal(cappedDepletion.resourcePoints[0].resourceAmount, 0, "oversized depletion caps current point at zero");
assert.ok(
  cappedDepletion.resourcePoints.every((point) => point.resourceAmount >= 0),
  "resource amounts never go negative"
);
assert.ok(issueCodes(cappedDepletion.warnings).includes("resource-line-adjustment-capped"), "capped depletion emits warning");
assert.ok(cappedDepletion.resourceLineAdjustments.adjustmentsUnapplied[0].unappliedAmount > 0, "capped depletion traces unapplied amount");

const unattributedDepletion = buildResourceLine({
  options: {
    resourceLineAdjustmentsByYear: [
      {
        adjustmentId: "unknown-category-depletion",
        yearIndex: 1,
        amount: 1000,
        categoryKey: "unknownCategory",
        componentKey: "education"
      }
    ]
  }
});
assert.equal(
  unattributedDepletion.resourcePoints[1].resourceAmount,
  noAdjustmentBaseline.resourcePoints[1].resourceAmount - 1000,
  "unknown category depletion still reduces total resources"
);
assert.equal(
  unattributedDepletion.resourcePoints[1].categoryAmounts.taxableBrokerageInvestments,
  noAdjustmentBaseline.resourcePoints[1].categoryAmounts.taxableBrokerageInvestments,
  "unknown category depletion does not fake category reduction"
);
assert.ok(
  issueCodes(unattributedDepletion.warnings).includes("resource-line-adjustment-category-attribution-unavailable"),
  "unknown category depletion emits attribution warning"
);

const missingTreatment = loadAdapter({ includeTreatment: false })({
  lensModel: createLensModel(),
  analysisSettings: createAnalysisSettings(),
  needPoints: createNeedPoints(),
  valuationDate: "2026-01-01"
});
assert.equal(missingTreatment.status, "partial", "missing asset treatment helper returns partial output");
assert.ok(
  issueCodes(missingTreatment.dataGaps).includes("missing-asset-treatment-helper"),
  "missing asset treatment helper is a data gap"
);
assert.equal(
  missingTreatment.resourcePoints[0].resourceAmount,
  0,
  "missing treatment helper does not silently use raw asset values"
);

const missingNeedPoints = buildCoverageStrategyResourceLine({
  lensModel: createLensModel(),
  analysisSettings: createAnalysisSettings(),
  valuationDate: "2026-01-01",
  horizonYears: 2
});
assert.equal(missingNeedPoints.resourcePoints.length, 3, "horizon fallback creates annual points");
assert.ok(
  issueCodes(missingNeedPoints.warnings).includes("need-points-missing-horizon-derived"),
  "missing need points are warned when horizon fallback is used"
);

const missingInputs = buildCoverageStrategyResourceLine({
  lensModel: {},
  analysisSettings: {},
  needPoints: [],
  valuationDate: "not-a-date"
});
assert.equal(missingInputs.status, "partial", "missing inputs produce partial output");
assert.ok(issueCodes(missingInputs.dataGaps).includes("missing-valuation-date"), "missing valuation date is a data gap");
assert.ok(issueCodes(missingInputs.dataGaps).includes("missing-asset-facts"), "missing assets are a data gap");

console.log("coverage strategy resource line adapter check passed");
