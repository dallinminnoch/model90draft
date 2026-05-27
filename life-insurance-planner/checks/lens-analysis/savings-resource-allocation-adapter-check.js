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

function createContext(includeModelBuilder = false) {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  const scripts = includeModelBuilder
    ? [
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
      "app/features/lens-analysis/savings-contribution-facts.js",
      "app/features/lens-analysis/asset-growth-projection-calculations.js",
      "app/features/lens-analysis/savings-resource-allocation-adapter.js",
      "app/features/lens-analysis/inflation-projection-calculations.js",
      "app/features/lens-analysis/education-funding-projection-calculations.js",
      "app/features/lens-analysis/lens-model-builder.js"
    ]
    : [
      "app/features/lens-analysis/asset-taxonomy.js",
      "app/features/lens-analysis/savings-contribution-facts.js",
      "app/features/lens-analysis/savings-resource-allocation-adapter.js",
      "app/features/lens-analysis/household-wealth-projection-calculations.js"
    ];

  scripts.forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function assertClose(actual, expected, message, epsilon = 0.03) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function normalizeScriptPath(pagePath, scriptPath) {
  const pageDirectory = path.dirname(path.join(repoRoot, pagePath));
  return path.relative(repoRoot, path.resolve(pageDirectory, scriptPath)).replace(/\\/g, "/");
}

function getScriptPaths(pagePath) {
  return Array.from(readRepoFile(pagePath).matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map(function (match) {
      return normalizeScriptPath(pagePath, match[1]);
    });
}

const adapterSource = readRepoFile("app/features/lens-analysis/savings-resource-allocation-adapter.js");
[
  /\bdocument\b/,
  /\bDOM\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/
].forEach(function (pattern) {
  assert.doesNotMatch(adapterSource, pattern, `adapter should remain pure and avoid ${pattern}`);
});

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
assert.equal(typeof lensAnalysis.buildSavingsResourceAllocations, "function");

const savingsContributionFacts = lensAnalysis.normalizeSavingsContributionFacts({
  assetTaxonomy: lensAnalysis.assetTaxonomy,
  savingsHabitRecords: [
    {
      expenseId: "brokerage_1",
      typeKey: "brokerageInvestmentContributions",
      label: "Brokerage Contributions",
      amount: 750,
      frequency: "monthly",
      targetAssetCategoryKey: "taxableBrokerageInvestments"
    }
  ]
});
const adapterResult = lensAnalysis.buildSavingsResourceAllocations({
  savingsContributionFacts,
  projectedAssetGrowth: {
    includedCategories: [
      {
        categoryKey: "taxableBrokerageInvestments",
        label: "Taxable Brokerage / Investments",
        currentValue: 0,
        assumedAnnualGrowthRatePercent: 6,
        assumedAnnualGrowthRateSource: "asset-taxonomy-default",
        contributionSourceRecords: [
          {
            sourceRecordId: "brokerage_1",
            typeKey: "brokerageInvestmentContributions",
            label: "Brokerage Contributions",
            monthlyContributionAmount: 750,
            frequency: "monthly",
            sourcePath: "savingsHabitRecords.0",
            canonicalSavingsContributionFact: true
          }
        ]
      }
    ],
    projectedTotalAssetValue: 9999999,
    totalProjectedGrowthAmount: 8888888
  },
  assetFacts: {
    assets: []
  }
});

assert.equal(adapterResult.source, "savings-resource-allocation-adapter");
assert.equal(adapterResult.savingAllocations.length, 1);
assert.equal(adapterResult.trace.primarySource, "lensModel.savingsContributionFacts.facts");
assert.equal(adapterResult.trace.projectedGrowthTotalsConsumed, false);
const allocation = adapterResult.savingAllocations[0];
assert.equal(allocation.source, "savingsContributionFact");
assert.equal(allocation.sourceRecordId, "brokerage_1");
assert.equal(allocation.targetAssetCategoryKey, "taxableBrokerageInvestments");
assert.equal(allocation.targetAssetCategoryLabel, "Taxable Brokerage / Investments");
assert.equal(allocation.monthlyAmount, 750);
assert.equal(allocation.annualAmount, 9000);
assert.equal(allocation.annualGrowthRate, 0.06);
assert.equal(allocation.growthStatus, "method-active");
assert.equal(allocation.currentAssetValue, 0, "contribution-active zero-balance buckets should be preserved");
assert.ok(allocation.sourcePaths.includes("savingsHabitRecords.0"));
assert.equal(allocation.trace.projectedGrowthTotalsConsumed, false);

const calculateHouseholdWealthProjection = lensAnalysis.calculateHouseholdWealthProjection;
const baseLayerInput = {
  startDate: "2026-01-01",
  endDate: "2027-01-01",
  cadence: "monthly",
  assetLedger: [
    {
      id: "taxable",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage / Investments",
      currentValue: 0,
      includedInProjection: true,
      growthEligible: true,
      annualGrowthRate: 0.06,
      growthStatus: "method-active",
      sourcePaths: ["assetFacts.assets.taxable"]
    }
  ],
  incomeStreams: [
    {
      id: "net-income",
      label: "Net income",
      amount: 60000,
      frequency: "annual",
      status: "mature-net"
    }
  ],
  expenseStreams: [
    {
      id: "essential",
      label: "Essential expenses",
      amount: 3000,
      frequency: "monthly",
      expenseType: "essential",
      status: "active"
    }
  ],
  scheduledObligations: [],
  options: {
    allowNegativeAssets: true,
    growthMode: "activeEligibleOnly",
    cashFlowTiming: "growth-first-then-cash-flow"
  }
};
const adapterProjection = calculateHouseholdWealthProjection({
  ...baseLayerInput,
  savingAllocations: adapterResult.savingAllocations
});
const legacyProjection = calculateHouseholdWealthProjection({
  ...baseLayerInput,
  savingAllocations: [
    {
      id: "brokerageInvestmentContributions",
      label: "Brokerage Contributions",
      monthlyAmount: 750,
      targetAssetCategoryKey: "taxableBrokerageInvestments",
      growthEligible: true,
      annualGrowthRate: 0.06,
      growthStatus: "method-active",
      sourcePaths: ["lensModel.projectedAssetGrowth.includedCategories.0.contributionSourceRecords.0"]
    }
  ]
});
assert.equal(adapterProjection.summary.totalSavingAllocations, legacyProjection.summary.totalSavingAllocations);
assert.equal(adapterProjection.summary.totalUnallocatedSurplus, legacyProjection.summary.totalUnallocatedSurplus);
assertClose(adapterProjection.summary.endingAssets, legacyProjection.summary.endingAssets, "adapter should preserve household projection result");
assertClose(
  adapterProjection.points.at(-1).assetLedger.find((row) => row.id === "taxable").currentValue,
  legacyProjection.points.at(-1).assetLedger.find((row) => row.id === "taxable").currentValue,
  "adapter should preserve target asset growth behavior"
);

const modelContext = createContext(true);
const modelLensAnalysis = modelContext.LensApp.lensAnalysis;
const modelResult = modelLensAnalysis.buildLensModelFromSavedProtectionModeling({
  sourceData: {
    taxableBrokerageInvestments: 0,
    annualIncome: 120000,
    savingsHabitRecords: [
      {
        expenseId: "brokerage_1",
        typeKey: "brokerageInvestmentContributions",
        label: "Brokerage Contributions",
        amount: 750,
        frequency: "monthly",
        targetAssetCategoryKey: "taxableBrokerageInvestments"
      }
    ]
  },
  analysisSettings: {
    assetTreatmentAssumptions: {
      enabled: true,
      defaultProfile: "balanced",
      assetGrowthProjectionAssumptions: {
        mode: "reportingOnly",
        projectionYears: 10,
        consumptionStatus: "saved-only"
      },
      assets: {
        taxableBrokerageInvestments: {
          include: true,
          assumedAnnualGrowthRatePercent: 6,
          assumedAnnualGrowthRateSource: "advisor",
          growthConsumptionStatus: "saved-only"
        }
      }
    }
  },
  profileRecord: {}
});
assert.ok(modelResult.lensModel.resourceProjectionInputs, "model builder should expose resource projection inputs");
assert.equal(modelResult.lensModel.resourceProjectionInputs.calculationSource, "savings-resource-allocation-adapter");
assert.equal(modelResult.lensModel.resourceProjectionInputs.savingAllocations.length, 1);
assert.equal(modelResult.lensModel.resourceProjectionInputs.savingAllocations[0].source, "savingsContributionFact");
assert.equal(modelResult.lensModel.resourceProjectionInputs.savingAllocations[0].monthlyAmount, 750);

const composerSource = readRepoFile("app/features/lens-analysis/income-impact-scenario-composer-calculations.js");
assert.match(composerSource, /resourceProjectionInputs\.savingAllocations/);
assert.match(composerSource, /legacyFallbackUsed/);
assert.match(composerSource, /buildLegacyLayer1SavingAllocations/);

[
  "pages/analysis-estimate.html",
  "pages/dime-results.html",
  "pages/hlv-results.html",
  "pages/income-loss-impact.html",
  "pages/simple-needs-results.html"
].forEach(function (pagePath) {
  const scripts = getScriptPaths(pagePath);
  const adapterIndex = scripts.indexOf("app/features/lens-analysis/savings-resource-allocation-adapter.js");
  const builderIndex = scripts.indexOf("app/features/lens-analysis/lens-model-builder.js");
  const growthIndex = scripts.indexOf("app/features/lens-analysis/asset-growth-projection-calculations.js");
  assert.ok(adapterIndex >= 0, `${pagePath} should load the savings resource allocation adapter`);
  assert.ok(growthIndex >= 0 && growthIndex < adapterIndex, `${pagePath} should load asset growth context before the adapter`);
  assert.ok(builderIndex >= 0 && adapterIndex < builderIndex, `${pagePath} should load the adapter before lens-model-builder`);
});

console.log("savings-resource-allocation-adapter-check passed");
