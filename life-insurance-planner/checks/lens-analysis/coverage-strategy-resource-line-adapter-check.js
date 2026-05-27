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

const adapterSource = fs.readFileSync(adapterPath, "utf8");
const taxonomySource = fs.readFileSync(taxonomyPath, "utf8");
const treatmentSource = fs.readFileSync(treatmentPath, "utf8");

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

const yearOne = result.resourcePoints[1];
assert.ok(yearOne.resourceAmount > currentPoint.resourceAmount, "growth and assigned savings increase eligible resources over time");
assert.ok(yearOne.savingsContributionAmount > 0, "assigned planned savings contributes to target category");
assert.ok(yearOne.growthAmount > 0, "category-aware growth is applied where available");
assert.ok(
  yearOne.savingsContributionAmountsByCategory.taxableBrokerageInvestments > 0,
  "planned savings is assigned by target asset category"
);

const categoryRows = result.categoryPoints.filter((row) => row.categoryKey === "taxableBrokerageInvestments");
assert.equal(categoryRows.length, result.resourcePoints.length, "category points are emitted by year");
assert.ok(categoryRows[1].treatedValue > categoryRows[0].treatedValue, "category points carry projected treated values");

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
