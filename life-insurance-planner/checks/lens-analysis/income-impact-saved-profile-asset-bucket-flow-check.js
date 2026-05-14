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

function ids(list) {
  return (Array.isArray(list) ? list : []).map(function (item) {
    return item.id;
  });
}

function findById(list, id) {
  return (Array.isArray(list) ? list : []).find(function (item) {
    return item && item.id === id;
  });
}

function createLensAnalysisContext() {
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
    "app/features/lens-analysis/asset-growth-projection-calculations.js",
    "app/features/lens-analysis/projected-asset-offset-calculations.js",
    "app/features/lens-analysis/cash-reserve-calculations.js",
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/income-impact-resource-bucket-adapter.js",
    "app/features/lens-analysis/income-impact-resource-waterfall-calculations.js",
    "app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createTreatment(include, taxDragPercent, liquidityHaircutPercent, preset) {
  return {
    include,
    treatmentPreset: preset || "custom",
    taxTreatment: taxDragPercent > 0 ? "tax-adjusted" : "no-tax-drag",
    taxDragPercent,
    liquidityHaircutPercent
  };
}

function createProfileRecord() {
  return {
    coveragePolicies: [],
    analysisSettings: {
      valuationDate: "2030-01-01",
      assetTreatmentAssumptions: {
        enabled: true,
        defaultProfile: "saved-profile-asset-bucket-flow-check",
        source: "saved-profile-fixture",
        assets: {
          cashAndCashEquivalents: createTreatment(true, 0, 0, "cash-like"),
          emergencyFund: createTreatment(true, 0, 0, "cash-like"),
          taxableBrokerageInvestments: createTreatment(true, 0, 5, "step-up-investment"),
          educationSpecificSavings: createTreatment(true, 0, 0, "education-current-value"),
          traditionalRetirementAssets: createTreatment(true, 25, 5, "taxable-retirement"),
          primaryResidenceEquity: createTreatment(false, 0, 25, "real-estate-equity")
        },
        customAssets: [
          createTreatment(true, 0, 0, "custom-review")
        ]
      }
    },
    protectionModeling: {
      data: {
        annualIncome: 120000,
        spouseIncome: 30000,
        currentCoverage: 100000,
        yearsIncomeNeeded: 15,
        assetRecords: [
          {
            assetId: "saved-checking",
            categoryKey: "cashAndCashEquivalents",
            typeKey: "checkingAccount",
            label: "Checking Account",
            currentValue: 12000
          },
          {
            assetId: "saved-emergency",
            categoryKey: "emergencyFund",
            typeKey: "emergencyFundReserve",
            label: "Emergency Fund",
            currentValue: 18000
          },
          {
            assetId: "saved-taxable",
            categoryKey: "taxableBrokerageInvestments",
            typeKey: "taxableBrokerageAccount",
            label: "Taxable Brokerage",
            currentValue: 45000
          },
          {
            assetId: "saved-education",
            categoryKey: "educationSpecificSavings",
            typeKey: "plan529Account",
            label: "529 Plan",
            currentValue: 30000
          },
          {
            assetId: "saved-retirement",
            categoryKey: "traditionalRetirementAssets",
            typeKey: "traditional401k",
            label: "Traditional 401(k)",
            currentValue: 90000
          },
          {
            assetId: "saved-home-equity",
            categoryKey: "primaryResidenceEquity",
            typeKey: "primaryResidenceEquity",
            label: "Primary Residence Equity",
            currentValue: 250000
          },
          {
            assetId: "saved-custom",
            categoryKey: "otherCustomAsset",
            typeKey: "otherCustomAsset",
            label: "Custom Asset",
            currentValue: 7000
          }
        ]
      }
    }
  };
}

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.buildIncomeImpactResourceBucketsFromLensModel, "function");
assert.equal(typeof lensAnalysis.buildIncomeImpactResourceWaterfall, "function");
assert.equal(typeof lensAnalysis.buildIncomeImpactFinancialStorylineCandidates, "function");

const profileRecord = createProfileRecord();
const profileSnapshot = cloneJson(profileRecord);
const builderResult = lensAnalysis.buildLensModelFromSavedProtectionModeling({
  profileRecord
});

assert.deepEqual(profileRecord, profileSnapshot, "saved profile fixture should not be mutated");
assert.ok(builderResult.lensModel, "saved profile should build a Lens model");

const lensModel = builderResult.lensModel;
const assetFacts = lensModel.assetFacts;
const treatedAssetOffsets = lensModel.treatedAssetOffsets;

assert.ok(Array.isArray(assetFacts.assets), "Lens model should expose assetFacts.assets");
assert.ok(Array.isArray(treatedAssetOffsets.assets), "Lens model should expose treatedAssetOffsets.assets");
assert.equal(assetFacts.assets.length, 7, "all saved assetRecords should normalize into assetFacts.assets");
assert.equal(treatedAssetOffsets.assets.length, 7, "all asset facts should receive treated overlays");

const checkingFact = findById(assetFacts.assets.map(function (asset) {
  return Object.assign({ id: asset.assetId }, asset);
}), "saved-checking");
const emergencyFact = findById(assetFacts.assets.map(function (asset) {
  return Object.assign({ id: asset.assetId }, asset);
}), "saved-emergency");
const customFact = findById(assetFacts.assets.map(function (asset) {
  return Object.assign({ id: asset.assetId }, asset);
}), "saved-custom");

assert.equal(checkingFact.categoryKey, "cashAndCashEquivalents");
assert.equal(checkingFact.typeKey, "checkingAccount");
assert.equal(checkingFact.currentValue, 12000);
assert.equal(checkingFact.source, "protectionModeling.data.assetRecords");
assert.equal(checkingFact.metadata.recordSource, "assetRecords");
assert.equal(emergencyFact.categoryKey, "emergencyFund");
assert.equal(emergencyFact.typeKey, "emergencyFundReserve");
assert.equal(customFact.categoryKey, "otherCustomAsset");

const treatedByAssetId = new Map(treatedAssetOffsets.assets.map(function (asset) {
  return [asset.assetId, asset];
}));
assert.equal(treatedByAssetId.get("saved-checking").treatedValue, 12000);
assert.equal(treatedByAssetId.get("saved-emergency").treatedValue, 18000);
assert.equal(treatedByAssetId.get("saved-taxable").treatedValue, 42750);
assert.equal(treatedByAssetId.get("saved-education").treatedValue, 30000);
assert.equal(treatedByAssetId.get("saved-retirement").treatedValue, 64125);
assert.equal(treatedByAssetId.get("saved-home-equity").include, false);
assert.equal(treatedByAssetId.get("saved-home-equity").treatedValue, 0);

const bucketResult = lensAnalysis.buildIncomeImpactResourceBucketsFromLensModel({
  assetFacts,
  treatedAssetOffsets
});
const bucketsById = new Map(bucketResult.resourceBuckets.map(function (bucket) {
  return [bucket.id, bucket];
}));

assert.equal(bucketResult.resourceBuckets.length, 7, "adapter should produce one resource bucket per normalized asset fact");
assert.deepEqual(
  cloneJson(bucketResult.resourceBuckets.map(function (bucket) { return bucket.family; })),
  [
    "cash",
    "emergencyFund",
    "taxableInvestments",
    "educationSavings",
    "retirementAssets",
    "homeEquity",
    "unknown"
  ],
  "saved profile buckets should preserve expected family classification"
);
assert.equal(bucketsById.get("asset-saved-checking").family, "cash");
assert.equal(bucketsById.get("asset-saved-emergency").family, "emergencyFund");
assert.notEqual(bucketsById.get("asset-saved-checking").family, "emergencyFund", "generic cash should not become emergency fund");
assert.equal(bucketsById.get("asset-saved-taxable").startingValue, 42750);
assert.equal(bucketsById.get("asset-saved-retirement").startingValue, 64125);
assert.equal(bucketsById.get("asset-saved-home-equity").included, false);
assert.equal(bucketsById.get("asset-saved-home-equity").startingValue, 0);
assert.equal(bucketsById.get("asset-saved-custom").family, "unknown");
assert.ok(
  bucketResult.warnings.some(function (warning) { return warning.id === "ambiguous-asset-bucket-family"; }),
  "custom/unknown asset should produce an ambiguity warning"
);
assert.ok(
  bucketResult.warnings.some(function (warning) { return warning.id === "asset-excluded-by-treatment"; }),
  "excluded home equity should produce an exclusion warning"
);

const resourceWaterfall = lensAnalysis.buildIncomeImpactResourceWaterfall({
  resourceBuckets: bucketResult.resourceBuckets,
  scenario: {
    scenario: { selectedDeathDate: "2030-01-01" },
    timelineFacts: {
      monthlyShortfall: 5000,
      resourcesAfterObligations: 173875,
      monthsCovered: 35,
      depletionDate: "2032-12-01"
    },
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionMonthIndex: 35,
        depletionDate: "2032-12-01"
      }
    }
  },
  financialRunway: {
    monthlyShortfall: 5000,
    totalMonthsOfSecurity: 35,
    depletionDate: "2032-12-01"
  },
  options: {
    selectedDeathDate: "2030-01-01"
  }
});

const waterfallLabels = resourceWaterfall.timelineEvents.map(function (event) {
  return event.displayLabel;
});
assert.ok(waterfallLabels.includes("Cash Savings Depleted"));
assert.ok(waterfallLabels.includes("Emergency Fund Depleted"));
assert.ok(waterfallLabels.includes("Taxable Assets Depleted"));
assert.ok(waterfallLabels.includes("Education Savings Used for Living Needs"));
assert.ok(waterfallLabels.includes("Education Savings Depleted"));
assert.ok(waterfallLabels.includes("Retirement Assets Tapped"));
assert.ok(waterfallLabels.includes("Retirement Assets Depleted"));
assert.equal(
  waterfallLabels.includes("Home Equity Becomes Last Resort"),
  false,
  "excluded home equity should not produce spendable waterfall events"
);

const financialStoryline = lensAnalysis.buildIncomeImpactFinancialStorylineCandidates({
  scenario: {
    scenario: { selectedDeathDate: "2030-01-01" },
    timelineFacts: {
      monthlyShortfall: 5000,
      annualShortfall: 60000,
      resourcesAfterObligations: 173875,
      monthsCovered: 35,
      depletionDate: "2032-12-01"
    },
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionMonthIndex: 35,
        depletionDate: "2032-12-01"
      }
    },
    warnings: [],
    dataGaps: []
  },
  financialRunway: {
    monthlyShortfall: 5000,
    totalMonthsOfSecurity: 35,
    depletionDate: "2032-12-01"
  },
  resourceWaterfall,
  options: {
    selectedDeathDate: "2030-01-01"
  }
});

const safeIds = ids(financialStoryline.safeRenderableEvents);
[
  "cash-savings-depleted",
  "emergency-fund-depleted",
  "education-savings-used-for-living-needs",
  "education-savings-depleted",
  "retirement-assets-tapped",
  "retirement-assets-depleted"
].forEach(function (id) {
  assert.ok(safeIds.includes(id), `${id} should be activated as a safe emotional event`);
});

assert.ok(financialStoryline.graphDotCandidates.length > 6, "enough saved-profile emotional events should produce more than six graph dots");
assert.ok(financialStoryline.majorGraphDotCandidates.length > 0, "major graph dots should be selected");
assert.ok(financialStoryline.microGraphDotCandidates.length > 0, "micro graph dots should be selected");
assert.ok(financialStoryline.majorGraphDotCandidates.length <= 6);
assert.ok(financialStoryline.microGraphDotCandidates.length <= 10);
assert.ok(financialStoryline.graphDotCandidates.length <= 16);
assert.equal(financialStoryline.majorStoryCandidates[0].id, "death-income-stops");

const visibleIds = new Set([]
  .concat(ids(financialStoryline.majorStoryCandidates))
  .concat(ids(financialStoryline.majorGraphDotCandidates))
  .concat(ids(financialStoryline.microGraphDotCandidates))
  .concat(ids(financialStoryline.graphDotCandidates)));

[
  "protection-gap-appears",
  "protection-gap-appears-immediately",
  "retirement-security-reduced",
  "retirement-security-is-reduced",
  "home-equity-becomes-last-resort",
  "current-lifestyle-no-longer-sustainable"
].forEach(function (id) {
  assert.equal(visibleIds.has(id), false, `${id} should remain absent from visible pools`);
});

[
  "coverage-proceeds-applied",
  "life-insurance-proceeds-applied",
  "coverage-not-counted",
  "final-expenses-paid",
  "medical-final-expenses-paid",
  "transition-needs-paid",
  "immediate-obligations-paid",
  "debt-payoff-consumes-liquidity",
  "mortgage-is-paid-off",
  "mortgage-paid-off",
  "mortgage-payments-continue",
  "survivor-income-helps-offset-need",
  "survivor-runway-begins",
  "monthly-support-need-begins",
  "healthcare-costs-reduce-runway"
].forEach(function (id) {
  assert.equal(visibleIds.has(id), false, `${id} should remain absent from visible pools`);
});

assert.deepEqual(profileRecord, profileSnapshot, "saved profile fixture should remain unmutated after full flow");

console.log("income-impact-saved-profile-asset-bucket-flow-check passed");
