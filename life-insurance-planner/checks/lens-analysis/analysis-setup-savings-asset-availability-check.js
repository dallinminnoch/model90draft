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

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    [
      "  LensApp.__savingsAssetAvailabilityHarness = {",
      "    getAssetTreatmentRenderItems",
      "  };",
      "  LensApp.analysisSetup = Object.assign"
    ].join("\n")
  );
  assert.notEqual(instrumentedSource, source, "analysis-setup harness injection should find the export seam");

  const context = {
    console,
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    },
    Intl,
    location: { search: "" },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  loadScript(context, "app/features/lens-analysis/schema.js");
  loadScript(context, "app/features/lens-analysis/asset-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/block-outputs.js");
  loadScript(context, "app/features/lens-analysis/normalize-lens-model.js");
  loadScript(context, "app/features/lens-analysis/savings-contribution-facts.js");
  vm.runInContext(instrumentedSource, context, { filename: "app/features/lens-analysis/analysis-setup.js" });
  return context;
}

const context = createAnalysisSetupContext();
const harness = context.LensApp.__savingsAssetAvailabilityHarness;
assert.equal(typeof harness.getAssetTreatmentRenderItems, "function");

const renderItems = harness.getAssetTreatmentRenderItems({
  protectionModeling: {
    data: {
      cashAndCashEquivalents: 25000,
      taxableBrokerageInvestments: 0,
      savingsHabitRecords: [
        {
          expenseId: "brokerage_contribution",
          categoryKey: "savingsGoalContributions",
          typeKey: "brokerageInvestmentContributions",
          label: "Monthly taxable investing",
          amount: 750,
          frequency: "monthly"
        },
        {
          expenseId: "cash_contribution",
          categoryKey: "savingsGoalContributions",
          typeKey: "sinkingFundContributions",
          label: "Sinking fund",
          amount: 100,
          frequency: "monthly"
        }
      ]
    }
  }
});

const cashRows = renderItems.filter((item) => item.key === "cashAndCashEquivalents");
assert.equal(cashRows.length, 1, "positive current assets should not duplicate when they also receive contributions");
assert.equal(cashRows[0].currentValue, 25000);
assert.notEqual(cashRows[0].source, "savingsContribution");

const brokerageRow = renderItems.find((item) => item.key === "taxableBrokerageInvestments");
assert.ok(brokerageRow, "zero-current-value contribution-active category should appear");
assert.equal(brokerageRow.currentValue, 0);
assert.equal(brokerageRow.source, "savingsContribution");
assert.equal(brokerageRow.isContributionActive, true);
assert.equal(brokerageRow.projectedContributionMonthlyAmount, 750);
assert.equal(brokerageRow.projectedContributionAnnualAmount, 9000);
assert.deepEqual(Array.from(brokerageRow.sourcePaths), ["savingsHabitRecords.0"]);

const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
assert.match(analysisSetupSource, /getSavingsContributionAssetTreatmentItems/);
assert.match(analysisSetupSource, /data-analysis-asset-source/);
assert.match(analysisSetupSource, /data-analysis-asset-contribution-active="true"/);
assert.match(analysisSetupSource, /Projected via savings/);

const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
assert.match(analysisSetupHtml, /savings-contribution-facts\.js/);

[
  "pages/analysis-estimate.html",
  "pages/dime-results.html",
  "pages/hlv-results.html",
  "pages/income-loss-impact.html",
  "pages/simple-needs-results.html"
].forEach((relativePath) => {
  const html = readRepoFile(relativePath);
  const helperIndex = html.indexOf("savings-contribution-facts.js");
  const growthIndex = html.indexOf("asset-growth-projection-calculations.js");
  const builderIndex = html.indexOf("lens-model-builder.js");
  assert.ok(helperIndex > -1, `${relativePath} should load savings contribution facts`);
  assert.ok(growthIndex > helperIndex, `${relativePath} should load the helper before asset growth projection`);
  assert.ok(builderIndex > helperIndex, `${relativePath} should load the helper before lens model builder`);
});

[
  "life-insurance-planner/checks/lens-analysis/income-loss-impact-visual-timeline-check.js",
  "life-insurance-planner/components.css",
  "life-insurance-planner/styles.css"
].forEach((relativePath) => {
  assert.doesNotMatch(
    readRepoFile(relativePath.replace(/^life-insurance-planner\//, "")),
    /savings-contribution-facts|savingsContributionFacts|getSavingsContributionAssetTreatmentItems/,
    `${relativePath} should not be touched by this pass`
  );
});

console.log("analysis-setup-savings-asset-availability-check passed");
