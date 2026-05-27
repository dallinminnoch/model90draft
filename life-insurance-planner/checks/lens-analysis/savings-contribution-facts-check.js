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

const context = {
  console,
  window: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;
vm.createContext(context);

loadScript(context, "app/features/lens-analysis/asset-taxonomy.js");
loadScript(context, "app/features/lens-analysis/savings-contribution-facts.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const helper = lensAnalysis.savingsContributionFacts;
assert.equal(typeof helper.normalizeSavingsContributionFacts, "function");
assert.equal(typeof helper.mapSavingsContributionsToAssetCategories, "function");

const normalized = helper.normalizeSavingsContributionFacts({
  assetTaxonomy: lensAnalysis.assetTaxonomy,
  savingsHabitRecords: [
    {
      expenseId: "retirement_1",
      categoryKey: "savingsGoalContributions",
      typeKey: "retirementContributions",
      label: "401(k)",
      amount: 600,
      frequency: "monthly",
      termType: "ongoing",
      continuationStatus: "review"
    },
    {
      expenseId: "brokerage_1",
      categoryKey: "savingsGoalContributions",
      typeKey: "retirementContributions",
      label: "Taxable override",
      amount: 1200,
      frequency: "quarterly",
      targetAssetCategoryKey: "taxableBrokerageInvestments"
    },
    {
      expenseId: "education_1",
      categoryKey: "savingsGoalContributions",
      typeKey: "educationSavingsContributions",
      label: "529",
      amount: 260,
      frequency: "biweekly"
    },
    {
      expenseId: "missing_target",
      categoryKey: "savingsGoalContributions",
      typeKey: "unknownSavingsContribution",
      label: "Unknown goal",
      amount: 100,
      frequency: "monthly"
    },
    {
      expenseId: "blank_amount",
      categoryKey: "savingsGoalContributions",
      typeKey: "emergencyFundContributions",
      label: "Blank",
      amount: "",
      frequency: "monthly"
    }
  ]
});

assert.equal(normalized.source, "savings-contribution-facts");
assert.equal(normalized.metadata.savedDataShapeChanged, false);
assert.equal(normalized.sourceRecordCount, 5);
assert.equal(normalized.acceptedFactCount, 3);
assert.equal(normalized.excludedFactCount, 2);
assert.equal(normalized.facts[0].sourceRecordId, "retirement_1");
assert.equal(normalized.facts[0].sourcePath, "savingsHabitRecords.0");
assert.equal(normalized.facts[0].monthlyAmount, 600);
assert.equal(normalized.facts[0].annualAmount, 7200);
assert.equal(normalized.facts[0].targetAssetCategoryKey, "traditionalRetirementAssets");
assert.equal(normalized.facts[0].trace.targetMappingSource, "type-default");
assert.equal(normalized.facts[1].monthlyAmount, 400);
assert.equal(normalized.facts[1].annualAmount, 4800);
assert.equal(normalized.facts[1].targetAssetCategoryKey, "taxableBrokerageInvestments");
assert.equal(normalized.facts[1].trace.targetMappingSource, "record");
assert.equal(normalized.facts[2].monthlyAmount, 563.33);
assert.equal(normalized.facts[2].annualAmount, 6759.96);
assert.equal(normalized.facts[2].targetAssetCategoryKey, "educationSpecificSavings");
assert.ok(normalized.warnings.some((warning) => warning.code === "missing-savings-contribution-target-asset-category"));
assert.ok(normalized.warnings.some((warning) => warning.code === "missing-positive-savings-contribution-amount"));

const mapped = helper.mapSavingsContributionsToAssetCategories({
  assetTaxonomy: lensAnalysis.assetTaxonomy,
  savingsHabitRecords: [
    {
      expenseId: "brokerage_a",
      typeKey: "brokerageInvestmentContributions",
      label: "Brokerage",
      amount: 500,
      frequency: "monthly"
    },
    {
      expenseId: "brokerage_b",
      typeKey: "brokerageInvestmentContributions",
      label: "Brokerage bonus",
      amount: 1200,
      frequency: "annual"
    }
  ]
});
const brokerageCategory = mapped.categories.find((category) => category.categoryKey === "taxableBrokerageInvestments");
assert.ok(brokerageCategory, "brokerage savings should map to taxable brokerage assets");
assert.equal(brokerageCategory.monthlyAmount, 600);
assert.equal(brokerageCategory.annualAmount, 7200);
assert.deepEqual(Array.from(brokerageCategory.sourceRecordIds), ["brokerage_a", "brokerage_b"]);

const helperSource = readRepoFile("app/features/lens-analysis/savings-contribution-facts.js");
assert.match(helperSource, /Non-goals: no DOM access/);
assert.match(helperSource, /savedDataShapeChanged:\s*false/);

const schemaSource = readRepoFile("app/features/lens-analysis/schema.js");
assert.match(schemaSource, /savingsContributionFacts:\s*\{/);
assert.match(schemaSource, /sourceShape:\s*"savingsHabitRecords"/);

const normalizationPlanSource = readRepoFile("app/features/lens-analysis/normalization-plan.js");
assert.match(normalizationPlanSource, /savingsContributionFacts:\s*\[/);
assert.match(normalizationPlanSource, /analysisSetup\.assetTreatmentAvailability/);

const modelBuilderSource = readRepoFile("app/features/lens-analysis/lens-model-builder.js");
assert.match(modelBuilderSource, /lensModel\.savingsContributionFacts = createPreparedSavingsContributionFacts/);
assert.match(modelBuilderSource, /savingsContributionFactsCanonicalized/);
assert.match(modelBuilderSource, /Projected growth totals remain saved-only/);

console.log("savings-contribution-facts-check passed");
