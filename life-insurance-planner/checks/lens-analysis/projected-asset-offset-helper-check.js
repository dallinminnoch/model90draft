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

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function createContext() {
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
    "app/features/lens-analysis/projected-asset-offset-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createAssumption(rate, overrides) {
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

function createAssetTreatmentAssumptions(projectionAssumptions) {
  return {
    enabled: true,
    source: "projected-asset-offset-helper-check",
    assetGrowthProjectionAssumptions: Object.assign({
      mode: "reportingOnly",
      projectionYears: 10,
      projectionYearsSource: "analysis-setup",
      consumptionStatus: "saved-only"
    }, projectionAssumptions || {}),
    assets: {
      cashAndCashEquivalents: createAssumption(2, {
        treatmentPreset: "cash-like"
      }),
      taxableBrokerageInvestments: createAssumption(6, {
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 5
      }),
      traditionalRetirementAssets: createAssumption(6, {
        treatmentPreset: "taxable-retirement",
        taxTreatment: "ordinary-income-on-distribution",
        taxDragPercent: 25,
        liquidityHaircutPercent: 5
      }),
      emergencyFund: createAssumption(1, {
        treatmentPreset: "cash-like"
      }),
      trustRestrictedAssets: createAssumption(4, {
        treatmentPreset: "restricted-asset"
      }),
      digitalAssetsCrypto: createAssumption(12, {
        treatmentPreset: "alternative-asset"
      }),
      businessPrivateCompanyValue: createAssumption(8, {
        treatmentPreset: "business-illiquid"
      }),
      rothTaxAdvantagedRetirementAssets: createAssumption(6, {
        treatmentPreset: "roth-retirement"
      })
    },
    customAssets: []
  };
}

function createTreatedAsset(categoryKey, label, treatedValue, overrides) {
  const safeOverrides = overrides || {};
  return Object.assign({
    assetId: categoryKey,
    categoryKey,
    label,
    rawValue: treatedValue * 10,
    include: true,
    taxDragPercent: 0,
    liquidityDiscountPercent: 0,
    treatedValue,
    trace: {
      group: null,
      treatmentPreset: "custom",
      taxTreatment: "no-tax-drag"
    }
  }, safeOverrides);
}

function createTreatedAssetOffsets() {
  return {
    assets: [
      createTreatedAsset("cashAndCashEquivalents", "Cash", 100, {
        rawValue: 5000,
        trace: { group: "liquid", treatmentPreset: "cash-like", taxTreatment: "no-tax-drag" }
      }),
      createTreatedAsset("taxableBrokerageInvestments", "Taxable Brokerage", 190, {
        rawValue: 999999,
        trace: {
          group: "investment",
          treatmentPreset: "step-up-investment",
          taxTreatment: "step-up-eligible"
        }
      }),
      createTreatedAsset("traditionalRetirementAssets", "Traditional Retirement", 200, {
        rawValue: 2000,
        trace: {
          group: "retirement",
          treatmentPreset: "taxable-retirement",
          taxTreatment: "ordinary-income-on-distribution"
        }
      }),
      createTreatedAsset("emergencyFund", "Emergency Fund", 50, {
        trace: { group: "liquid", treatmentPreset: "cash-like", taxTreatment: "no-tax-drag" }
      }),
      createTreatedAsset("trustRestrictedAssets", "Trust Assets", 80, {
        trace: { group: "restrictedPurpose", treatmentPreset: "restricted-asset" }
      }),
      createTreatedAsset("digitalAssetsCrypto", "Digital Assets", 70, {
        trace: { group: "alternative", treatmentPreset: "alternative-asset" }
      }),
      createTreatedAsset("businessPrivateCompanyValue", "Business Value", 90, {
        trace: { group: "business", treatmentPreset: "business-illiquid" }
      }),
      createTreatedAsset("rothTaxAdvantagedRetirementAssets", "Excluded Roth", 120, {
        include: false,
        trace: { group: "retirement", treatmentPreset: "roth-retirement" }
      })
    ],
    totalTreatedAssetValue: 780,
    metadata: {
      consumedByMethods: true
    }
  };
}

function getWarningByCode(warnings, code) {
  return (Array.isArray(warnings) ? warnings : []).find(function (warning) {
    return warning && warning.code === code;
  });
}

function getExcludedByKey(result, categoryKey) {
  return result.excludedCategories.find(function (category) {
    return category.categoryKey === categoryKey;
  });
}

function calculateExpectedGrowth() {
  const cashGrowth = 100 * (Math.pow(1.02, 10) - 1);
  const taxableGrowth = 190 * (Math.pow(1.06, 10) - 1);
  const retirementGrowth = 200 * (Math.pow(1.06, 10) - 1);
  return roundMoney(cashGrowth + taxableGrowth + retirementGrowth);
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const calculateProjectedAssetOffset = lensAnalysis.calculateProjectedAssetOffset;

assert.equal(typeof calculateProjectedAssetOffset, "function");

const treatedAssetOffsets = createTreatedAssetOffsets();
const assetTreatmentAssumptions = createAssetTreatmentAssumptions();
const treatedAssetOffsetsBefore = cloneJson(treatedAssetOffsets);
const assetTreatmentAssumptionsBefore = cloneJson(assetTreatmentAssumptions);
const result = cloneJson(calculateProjectedAssetOffset({
  treatedAssetOffsets,
  assetTreatmentAssumptions,
  assetTaxonomy: lensAnalysis.assetTaxonomy,
  projectedAssetGrowth: {
    projectedTotalAssetValue: 99999999,
    totalProjectedGrowthAmount: 88888888
  },
  cashReserveProjection: {
    totalAvailableAfterReserve: 77777777
  }
}));
const expectedGrowth = calculateExpectedGrowth();

assert.deepEqual(treatedAssetOffsets, treatedAssetOffsetsBefore, "helper must not mutate treatedAssetOffsets");
assert.deepEqual(
  assetTreatmentAssumptions,
  assetTreatmentAssumptionsBefore,
  "helper must not mutate assetTreatmentAssumptions"
);
assert.equal(result.source, "projected-asset-offset-calculations");
assert.equal(result.consumedByMethods, false);
assert.equal(result.consumptionStatus, "saved-only");
assert.equal(result.activationStatus, "future-inactive");
assert.equal(result.currentTreatedAssetOffset, 780);
assert.equal(result.eligibleTreatedBase, 490);
assert.equal(result.projectedGrowthAdjustment, expectedGrowth);
assert.equal(result.projectedTreatedValue, roundMoney(490 + expectedGrowth));
assert.equal(result.effectiveProjectedAssetOffset, roundMoney(780 + expectedGrowth));
assert.notEqual(
  result.effectiveProjectedAssetOffset,
  roundMoney(780 + result.projectedTreatedValue),
  "effective projected offset should add only incremental growth, not full projected eligible value"
);
assert.deepEqual(
  result.includedCategories.map(function (category) {
    return category.categoryKey;
  }).sort(),
  [
    "cashAndCashEquivalents",
    "taxableBrokerageInvestments",
    "traditionalRetirementAssets"
  ].sort(),
  "helper should include only eligible positive treated categories"
);
assert.equal(
  result.trace.eligibleTreatedBaseSource,
  "treatedAssetOffsets.assets[].treatedValue",
  "helper trace should identify treated values as the base"
);
assert.equal(
  result.trace.effectiveProjectedAssetOffsetFormula,
  "treatedAssetOffsets.totalTreatedAssetValue + projectedGrowthAdjustment"
);
assert.ok(
  getExcludedByKey(result, "emergencyFund"),
  "emergency fund should be excluded from projected method-consumed growth candidate"
);
assert.equal(
  getExcludedByKey(result, "emergencyFund").warningCode,
  "emergency-fund-excluded-from-projected-asset-offset"
);
assert.equal(
  getExcludedByKey(result, "trustRestrictedAssets").warningCode,
  "restricted-asset-excluded-from-projected-asset-offset"
);
assert.equal(
  getExcludedByKey(result, "digitalAssetsCrypto").warningCode,
  "review-only-asset-excluded-from-projected-asset-offset"
);
assert.equal(
  getExcludedByKey(result, "businessPrivateCompanyValue").warningCode,
  "review-only-asset-excluded-from-projected-asset-offset"
);
assert.equal(
  getExcludedByKey(result, "rothTaxAdvantagedRetirementAssets").warningCode,
  "treated-asset-not-included"
);
assert.ok(
  result.trace.excludedInputFamilies.includes("cashReserveProjection"),
  "helper should explicitly trace that cash reserve projection is not an input family"
);
assert.equal(
  result.effectiveProjectedAssetOffset,
  calculateProjectedAssetOffset({
    treatedAssetOffsets,
    assetTreatmentAssumptions,
    assetTaxonomy: lensAnalysis.assetTaxonomy,
    projectedAssetGrowth: {
      projectedTotalAssetValue: 1
    },
    cashReserveProjection: {
      totalAvailableAfterReserve: 1
    }
  }).effectiveProjectedAssetOffset,
  "raw projected asset totals and cash reserve projection should not change the candidate"
);

const zeroYearsResult = cloneJson(calculateProjectedAssetOffset({
  treatedAssetOffsets,
  assetTreatmentAssumptions: createAssetTreatmentAssumptions({
    mode: "reportingOnly",
    projectionYears: 0
  }),
  assetTaxonomy: lensAnalysis.assetTaxonomy
}));

assert.equal(zeroYearsResult.projectionYears, 0);
assert.equal(zeroYearsResult.projectedGrowthAdjustment, 0);
assert.equal(zeroYearsResult.effectiveProjectedAssetOffset, 780);
assert.ok(
  getWarningByCode(zeroYearsResult.warnings, "projected-asset-offset-zero-projection-years"),
  "zero projection years should carry an unchanged-candidate warning"
);

const currentDollarResult = cloneJson(calculateProjectedAssetOffset({
  treatedAssetOffsets,
  assetTreatmentAssumptions: createAssetTreatmentAssumptions({
    mode: "currentDollarOnly",
    projectionYears: 25
  }),
  assetTaxonomy: lensAnalysis.assetTaxonomy
}));

assert.equal(currentDollarResult.sourceMode, "currentDollarOnly");
assert.equal(currentDollarResult.projectionYears, 0);
assert.equal(currentDollarResult.projectedGrowthAdjustment, 0);
assert.equal(currentDollarResult.effectiveProjectedAssetOffset, 780);
assert.ok(
  getWarningByCode(currentDollarResult.warnings, "projected-asset-offset-current-dollar-years-ignored"),
  "currentDollarOnly should ignore saved projection years"
);

const projectedOffsetsResult = cloneJson(calculateProjectedAssetOffset({
  treatedAssetOffsets,
  assetTreatmentAssumptions: createAssetTreatmentAssumptions({
    mode: "projectedOffsets",
    projectionYears: 10
  }),
  assetTaxonomy: lensAnalysis.assetTaxonomy
}));

assert.equal(projectedOffsetsResult.sourceMode, "projectedOffsets");
assert.equal(projectedOffsetsResult.projectionMode, "projectedOffsetsFutureInactive");
assert.equal(projectedOffsetsResult.consumedByMethods, false);
assert.equal(projectedOffsetsResult.activationStatus, "future-inactive");
assert.equal(projectedOffsetsResult.projectedGrowthAdjustment, expectedGrowth);
assert.ok(
  getWarningByCode(projectedOffsetsResult.warnings, "projected-asset-offset-source-mode-future-inactive"),
  "projectedOffsets should remain future/inactive"
);

console.log("projected-asset-offset-helper-check passed");
