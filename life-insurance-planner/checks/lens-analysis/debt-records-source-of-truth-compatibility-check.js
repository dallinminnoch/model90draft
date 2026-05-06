#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const context = {
  console,
  window: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;
vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  vm.runInContext(fs.readFileSync(absolutePath, "utf8"), context, { filename: relativePath });
}

[
  "app/features/lens-analysis/schema.js",
  "app/features/lens-analysis/asset-taxonomy.js",
  "app/features/lens-analysis/debt-taxonomy.js",
  "app/features/lens-analysis/debt-library.js",
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
  "app/features/lens-analysis/debt-treatment-calculations.js",
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/education-funding-projection-calculations.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-methods.js"
].forEach(loadScript);

const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.analysisMethods?.runSimpleNeedsAnalysis, "function");

const sourceData = {
  grossAnnualIncome: 100000,
  netAnnualIncome: 75000,
  mortgageBalance: 100000,
  creditCardDebt: 999999,
  autoLoans: 888888,
  totalDebtPayoffNeed: 777777,
  totalDebtPayoffNeedManualOverride: true,
  debtRecords: [
    {
      debtId: "credit-record",
      categoryKey: "unsecuredConsumerDebt",
      typeKey: "creditCard",
      label: "Credit Card",
      currentBalance: 5000
    },
    {
      debtId: "auto-record",
      categoryKey: "securedConsumerDebt",
      typeKey: "autoLoan",
      label: "Auto Loan",
      currentBalance: 3000
    },
    {
      debtId: "medical-record",
      categoryKey: "medicalDebt",
      typeKey: "medicalBill",
      label: "Medical Bill",
      currentBalance: 2000
    }
  ],
  annualTotalEssentialSupportCost: 0,
  estimatedCostPerChild: 0,
  childrenNeedingFunding: 0,
  projectedDependentsCount: 0,
  funeralBurialEstimate: 0,
  medicalEndOfLifeCosts: 0,
  estateSettlementCosts: 0,
  otherFinalExpenses: 0,
  immediateLiquidityBuffer: 0,
  desiredEmergencyFund: 0,
  relocationReserve: 0,
  otherTransitionNeeds: 0
};

const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
  sourceData,
  profileRecord: {},
  analysisSettings: {
    methodDefaults: {
      includeExistingCoverage: false,
      needsIncludeOffsetAssets: false
    }
  }
});

const model = result.lensModel;
assert.ok(model, "Lens model should build from debtRecords source-of-truth data.");
assert.equal(model.debtPayoff.totalDebtPayoffNeed, 110000);
assert.equal(model.debtPayoff.mortgageBalance, 100000);
assert.equal(model.debtPayoff.creditCardBalance, 5000);
assert.equal(model.debtPayoff.autoLoanBalance, 3000);
assert.equal(model.debtPayoff.otherDebtPayoffNeeds, 2000);
assert.equal(model.debtFacts.metadata.debtRecordsSourceOfTruth, true);
assert.equal(model.debtFacts.metadata.acceptedScalarDebtCount, 1);
assert.equal(model.debtFacts.metadata.acceptedDebtRecordCount, 3);
assert.equal(model.debtFacts.debts.some((debt) => debt.sourceKey === "creditCardDebt"), false);
assert.ok(model.debtFacts.metadata.suppressedScalarDebtSourceFields.includes("creditCardDebt"));
assert.ok(model.debtFacts.metadata.suppressedScalarDebtSourceFields.includes("autoLoans"));

const simpleNeeds = lensAnalysis.analysisMethods.runSimpleNeedsAnalysis(model, {
  includeDebtPayoff: true,
  includeEssentialSupport: false,
  includeEducation: false,
  includeFinalExpenses: false,
  includeExistingCoverageOffset: false,
  includeAssetOffsets: false
});

assert.equal(simpleNeeds.components.debtPayoff, 110000);
assert.equal(
  simpleNeeds.trace.some((entry) => {
    return entry.key === "debtPayoff" && entry.sourcePaths.includes("debtPayoff.totalDebtPayoffNeed");
  }),
  true,
  "Simple Needs should continue receiving debtPayoff.totalDebtPayoffNeed compatibility output."
);

console.log("debt-records-source-of-truth-compatibility-check passed");
