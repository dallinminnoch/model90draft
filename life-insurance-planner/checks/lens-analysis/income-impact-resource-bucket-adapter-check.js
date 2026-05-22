#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const helper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-resource-bucket-adapter.js"
));
const canonicalWaterfallHelper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js"
));
const storylineHelper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
));

const {
  buildIncomeImpactResourceBucketsFromLensModel,
  INCOME_IMPACT_RESOURCE_BUCKET_ADAPTER_FAMILIES: FAMILIES
} = helper;
const { buildIncomeImpactCanonicalRunwayAssetWaterfall } = canonicalWaterfallHelper;
const { buildIncomeImpactFinancialStorylineCandidates } = storylineHelper;

assert.equal(typeof buildIncomeImpactResourceBucketsFromLensModel, "function", "resource bucket adapter export should exist");

function ids(buckets) {
  return buckets.map(function (bucket) { return bucket.id; });
}

function eventById(events, id) {
  return events.find(function (event) { return event.id === id; });
}

function bucketById(result, id) {
  return result.resourceBuckets.find(function (bucket) { return bucket.id === id; });
}

const input = {
  assetFacts: {
    assets: [
      {
        assetId: "cash-checking",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "checkingAccount",
        label: "Checking Account",
        currentValue: 10000
      },
      {
        assetId: "generic-cash",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "cashAndCashEquivalents",
        label: "Cash & Cash Equivalents",
        currentValue: 5000
      },
      {
        assetId: "emergency",
        categoryKey: "emergencyFund",
        typeKey: "emergencyFundReserve",
        label: "Emergency Fund",
        currentValue: 7000
      },
      {
        assetId: "education",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        label: "529 Plan",
        currentValue: 9000
      },
      {
        assetId: "retirement",
        categoryKey: "traditionalRetirementAssets",
        typeKey: "traditional401k",
        label: "Traditional 401(k)",
        currentValue: 20000
      },
      {
        assetId: "taxable",
        categoryKey: "taxableBrokerageInvestments",
        typeKey: "taxableBrokerageAccount",
        label: "Taxable Brokerage",
        currentValue: 12000
      },
      {
        assetId: "home",
        categoryKey: "primaryResidenceEquity",
        typeKey: "primaryResidenceEquity",
        label: "Primary Residence Equity",
        currentValue: 300000
      },
      {
        assetId: "custom",
        categoryKey: "otherCustomAsset",
        typeKey: "otherCustomAsset",
        label: "Custom Asset",
        currentValue: 6000
      },
      {
        assetId: "zero",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "savingsAccount",
        label: "Zero Savings",
        currentValue: 0
      }
    ]
  },
  treatedAssetOffsets: {
    assets: [
      { assetId: "cash-checking", categoryKey: "cashAndCashEquivalents", typeKey: "checkingAccount", rawValue: 10000, include: true, treatedValue: 9500 },
      { assetId: "generic-cash", categoryKey: "cashAndCashEquivalents", typeKey: "cashAndCashEquivalents", rawValue: 5000, include: true, treatedValue: 5000 },
      { assetId: "emergency", categoryKey: "emergencyFund", typeKey: "emergencyFundReserve", rawValue: 7000, include: true, treatedValue: 7000 },
      { assetId: "education", categoryKey: "educationSpecificSavings", typeKey: "plan529Account", rawValue: 9000, include: true, treatedValue: 8000 },
      { assetId: "retirement", categoryKey: "traditionalRetirementAssets", typeKey: "traditional401k", rawValue: 20000, include: true, treatedValue: 15000 },
      { assetId: "home", categoryKey: "primaryResidenceEquity", typeKey: "primaryResidenceEquity", rawValue: 300000, include: false, treatedValue: 0 },
      { assetId: "custom", categoryKey: "otherCustomAsset", typeKey: "otherCustomAsset", rawValue: 6000, include: true, treatedValue: 6000 },
      { assetId: "orphan", categoryKey: "cashAndCashEquivalents", typeKey: "savingsAccount", rawValue: 1000, include: true, treatedValue: 1000 }
    ]
  }
};
const snapshot = JSON.stringify(input);
const result = buildIncomeImpactResourceBucketsFromLensModel(input);
const repeated = buildIncomeImpactResourceBucketsFromLensModel(input);

assert.equal(result.version, "income-impact-resource-bucket-adapter-v1");
assert.equal(result.trace.source, "income-impact-resource-bucket-adapter");
assert.equal(result.trace.rawAssetCount, 9);
assert.equal(result.trace.treatedAssetCount, 8);
assert.equal(JSON.stringify(input), snapshot, "adapter should not mutate inputs");
assert.deepEqual(result, repeated, "adapter output should be deterministic across repeated calls");

const checking = bucketById(result, "asset-cash-checking");
const genericCash = bucketById(result, "asset-generic-cash");
const emergency = bucketById(result, "asset-emergency");
const education = bucketById(result, "asset-education");
const retirement = bucketById(result, "asset-retirement");
const taxable = bucketById(result, "asset-taxable");
const home = bucketById(result, "asset-home");
const custom = bucketById(result, "asset-custom");

assert.equal(checking.family, FAMILIES.cash, "checking account should map to cash");
assert.equal(checking.startingValue, 9500, "included treated asset should use treatedValue");
assert.equal(checking.evidenceLevel, "trace-backed");
assert.equal(genericCash.family, FAMILIES.cash, "generic cash should map to cash");
assert.notEqual(genericCash.family, FAMILIES.emergencyFund, "generic cash should not become emergency fund");
assert.equal(emergency.family, FAMILIES.emergencyFund, "explicit emergency fund should map to emergencyFund");
assert.equal(education.family, FAMILIES.educationSavings, "education category/type should map to educationSavings");
assert.equal(retirement.family, FAMILIES.retirementAssets, "retirement category/type should map to retirementAssets");
assert.equal(taxable.family, FAMILIES.taxableInvestments, "taxable brokerage should map to taxableInvestments");
assert.equal(taxable.startingValue, 12000, "missing treated overlay should use raw currentValue");
assert.equal(taxable.evidenceLevel, "assumption-backed", "raw fallback should be assumption-backed");
assert.equal(home.family, FAMILIES.homeEquity, "primary residence equity may be bucketed backend-side");
assert.equal(home.included, false, "excluded treated asset should not become spendable");
assert.equal(home.startingValue, 0, "excluded treated asset should carry zero spendable value");
assert.equal(custom.family, FAMILIES.unknown, "custom ambiguous asset should map to unknown");
assert.equal(ids(result.resourceBuckets).includes("asset-zero"), false, "zero-value asset should be skipped");

assert.ok(
  result.warnings.some(function (warning) { return warning.id === "missing-treated-asset-overlay"; }),
  "missing treated overlay should warn before using raw value"
);
assert.ok(
  result.warnings.some(function (warning) { return warning.id === "asset-excluded-by-treatment"; }),
  "excluded treated asset should warn"
);
assert.ok(
  result.warnings.some(function (warning) { return warning.id === "ambiguous-asset-bucket-family"; }),
  "ambiguous/custom asset should warn"
);
assert.ok(
  result.warnings.some(function (warning) { return warning.id === "treated-asset-without-asset-fact"; }),
  "orphan treated asset should warn"
);
assert.ok(
  result.warnings.some(function (warning) { return warning.id === "invalid-raw-asset-value"; }),
  "zero or invalid raw value should warn"
);
assert.equal(result.trace.bucketSourceSummary.countsByFamily.cash, 2);
assert.equal(result.trace.bucketSourceSummary.countsByFamily.emergencyFund, 1);
assert.equal(result.trace.bucketSourceSummary.countsByFamily.educationSavings, 1);
assert.equal(result.trace.bucketSourceSummary.countsByFamily.retirementAssets, 1);

const canonicalWaterfallResult = buildIncomeImpactCanonicalRunwayAssetWaterfall({
  startingBuckets: result.resourceBuckets,
  monthlyNeeds: 5000,
  monthlyIncome: 0,
  options: {
    maxMonths: 20
  }
});
const tappedFamilies = canonicalWaterfallResult.bucketEvents
  .filter(function (event) { return event.eventType === "bucket-tapped"; })
  .map(function (event) { return event.family; });
assert.deepEqual(
  tappedFamilies.slice(0, 6),
  ["cash", "cash", "emergencyFund", "taxableInvestments", "educationSavings", "retirementAssets"],
  "adapter buckets should feed the canonical order: cash, emergency, taxable, education, then retirement"
);
assert.ok(
  canonicalWaterfallResult.excludedBuckets.some(function (bucket) {
    return bucket.family === "homeEquity" && (bucket.reason === "bucket-marked-not-included" || bucket.reason === "nonpositive-starting-value");
  }),
  "excluded home equity should not enter the canonical spendable waterfall"
);

const storylineResult = buildIncomeImpactFinancialStorylineCandidates({
  scenario: {
    scenario: {
      selectedDeathDate: "2030-01-01"
    },
    timelineFacts: {
      monthlyShortfall: 5000,
      resourcesAfterObligations: 100000,
      depletionDate: "2032-01-01"
    },
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionMonthIndex: 24,
        depletionDate: "2032-01-01"
      }
    }
  },
  assetDepletionLedger: canonicalWaterfallResult,
  options: {
    selectedDeathDate: "2030-01-01"
  }
});
const safeStorylineIds = ids(storylineResult.safeRenderableEvents);
assert.equal(safeStorylineIds.includes("cash-savings-depleted"), false, "old cash savings fallback label should stay out of safe storyline events");
assert.equal(safeStorylineIds.includes("liquid-investments-depleted"), false, "old liquid investments fallback label should stay out of safe storyline events");
assert.equal(safeStorylineIds.includes("taxable-assets-depleted"), false, "old taxable assets fallback label should stay out of safe storyline events");
assert.equal(eventById(storylineResult.safeRenderableEvents, "cash-reserve-depleted").candidateSource, "canonical-liquidity-trigger", "adapted waterfall should activate canonical cash reserve depletion trigger");
assert.equal(eventById(storylineResult.safeRenderableEvents, "emergency-fund-depleted").candidateSource, "canonical-liquidity-trigger", "adapted waterfall should activate canonical emergency fund depletion trigger");
assert.equal(eventById(storylineResult.safeRenderableEvents, "taxable-investments-depleted").candidateSource, "canonical-liquidity-trigger", "adapted waterfall should activate canonical taxable investment depletion trigger");
assert.ok(safeStorylineIds.includes("education-savings-depleted"), "adapted waterfall should activate education storyline event");
assert.ok(safeStorylineIds.includes("retirement-assets-tapped"), "adapted waterfall should activate retirement tapped storyline event");
assert.ok(safeStorylineIds.includes("retirement-assets-depleted"), "adapted waterfall should activate retirement depleted storyline event");
assert.equal(storylineResult.trace.canonicalRunwayWaterfallUsedForStoryline, true, "canonical waterfall should remain the storyline source");
assert.ok(storylineResult.trace.liquidityTriggerCandidateIds.includes("cash-reserve-depleted"), "cash reserve depletion should be listed as a liquidity trigger");
assert.ok(storylineResult.trace.liquidityTriggerCandidateIds.includes("emergency-fund-depleted"), "emergency depletion should be listed as a liquidity trigger");
assert.ok(storylineResult.trace.liquidityTriggerCandidateIds.includes("taxable-investments-depleted"), "taxable investment depletion should be listed as a liquidity trigger");
assert.ok(storylineResult.majorGraphDotCandidates.length <= 6, "major graph dot cap should remain intact");
assert.ok(storylineResult.microGraphDotCandidates.length <= 10, "micro graph dot cap should remain intact");
assert.ok(storylineResult.graphDotCandidates.length <= 16, "combined graph dot cap should remain intact");
assert.equal(
  safeStorylineIds.includes("home-equity-becomes-last-resort"),
  false,
  "home equity should remain inactive in visible storyline safe events after event-list alignment"
);

const missingFacts = buildIncomeImpactResourceBucketsFromLensModel({
  treatedAssetOffsets: { assets: [] }
});
assert.deepEqual(missingFacts.resourceBuckets, [], "missing assetFacts should not invent buckets");
assert.ok(
  missingFacts.warnings.some(function (warning) { return warning.id === "missing-asset-facts"; }),
  "missing assetFacts should produce a warning"
);

console.log("income-impact-resource-bucket-adapter-check passed");
