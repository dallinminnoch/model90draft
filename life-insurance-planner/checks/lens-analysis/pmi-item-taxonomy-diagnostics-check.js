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
  vm.runInContext(readRepoFile(relativePath), context, {
    filename: path.join(repoRoot, relativePath)
  });
}

function createContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  return context;
}

function loadDiagnosticsContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/debt-taxonomy.js",
    "app/features/lens-analysis/debt-library.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/asset-library.js",
    "app/features/lens-analysis/pmi-item-taxonomy-diagnostics.js"
  ].forEach((relativePath) => loadScript(context, relativePath));
  return context;
}

function createFixtureInput() {
  return {
    profileRecord: {
      coveragePolicies: [{ policyId: "term-1", coverageAmount: 500000 }]
    },
    protectionModelingData: {
      mortgageBalance: 250000,
      monthlyMortgagePaymentOnly: 1750,
      funeralBurialEstimate: 15000,
      immediateLiquidityBuffer: 25000
    },
    lensModel: {
      expenseFacts: {
        expenses: [
          {
            expenseFactId: "groceries",
            typeKey: "groceries",
            categoryKey: "foodGroceries",
            label: "Groceries",
            sourcePath: "lensModel.expenseFacts.expenses.0"
          },
          {
            expenseFactId: "medical-oop",
            typeKey: "medicalOutOfPocket",
            categoryKey: "otherLivingExpense",
            label: "Medical OOP",
            sourcePath: "lensModel.expenseFacts.expenses.1",
            metadata: {
              commonExpenseOngoingSupportField: "monthlyHealthcareOutOfPocketCost"
            }
          },
          {
            expenseFactId: "tuition",
            typeKey: "collegeTuition",
            categoryKey: "educationExpense",
            label: "Tuition",
            sourcePath: "lensModel.expenseFacts.expenses.2"
          },
          {
            expenseFactId: "final",
            typeKey: "funeralBurialEstimate",
            categoryKey: "funeralBurial",
            label: "Funeral",
            sourcePath: "lensModel.expenseFacts.expenses.3"
          }
        ]
      },
      debtFacts: {
        debts: [
          {
            debtFactId: "card",
            typeKey: "creditCard",
            categoryKey: "unsecuredConsumerDebt",
            sourcePath: "lensModel.debtFacts.debts.0"
          },
          {
            debtFactId: "auto",
            typeKey: "autoLoan",
            categoryKey: "securedConsumerDebt",
            sourcePath: "lensModel.debtFacts.debts.1"
          },
          {
            debtFactId: "lease",
            typeKey: "autoLease",
            categoryKey: "securedConsumerDebt",
            isLease: true,
            sourcePath: "lensModel.debtFacts.debts.2"
          }
        ]
      },
      assetFacts: {
        assets: [
          {
            assetId: "cash",
            typeKey: "checkingAccount",
            categoryKey: "cashAndCashEquivalents",
            sourcePath: "lensModel.assetFacts.assets.0"
          },
          {
            assetId: "emergency",
            typeKey: "emergencyFundReserve",
            categoryKey: "emergencyFund",
            sourcePath: "lensModel.assetFacts.assets.1"
          },
          {
            assetId: "brokerage",
            typeKey: "taxableBrokerageAccount",
            categoryKey: "taxableBrokerageInvestments",
            sourcePath: "lensModel.assetFacts.assets.2"
          },
          {
            assetId: "retirement",
            typeKey: "traditionalIra",
            categoryKey: "traditionalRetirementAssets",
            sourcePath: "lensModel.assetFacts.assets.3"
          }
        ]
      },
      savingsContributionFacts: {
        facts: [
          {
            id: "education-savings",
            typeKey: "educationSavingsContributions",
            targetAssetCategoryKey: "educationSpecificSavings",
            sourcePath: "lensModel.savingsContributionFacts.facts.0"
          }
        ]
      }
    }
  };
}

function findRow(diagnostics, predicate, message) {
  const row = diagnostics.rows.find(predicate);
  assert.ok(row, message);
  return row;
}

const helperSource = readRepoFile("app/features/lens-analysis/pmi-item-taxonomy-diagnostics.js");
const diagnosticExportSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const pageSource = readRepoFile("pages/coverage-strategy.html");

assert.match(helperSource, /pmi-item-taxonomy-diagnostics-v1/);
assert.match(helperSource, /buildPmiItemTaxonomyDiagnostics/);
assert.match(helperSource, /diagnosticOnly:\s*true/);
assert.match(helperSource, /graphMathChanged:\s*false/);
assert.match(helperSource, /normalizationChanged:\s*false/);
assert.match(helperSource, /taxonomiesChanged:\s*false/);
assert.doesNotMatch(helperSource, /document\.|window\.localStorage|localStorage|sessionStorage|indexedDB/);
assert.doesNotMatch(helperSource, /buildCoverageStrategyNeedLine|buildCoverageStrategyResourceLine|buildCoverageStrategyGapSurplus/);
assert.match(diagnosticExportSource, /pmiItemTaxonomyDiagnostics/);
assert.ok(
  pageSource.indexOf("pmi-item-taxonomy-diagnostics.js")
    > pageSource.indexOf("coverage-strategy-obligation-ledger.js"),
  "PMI taxonomy diagnostics should load after current taxonomy/library modules and ledger diagnostics."
);
assert.ok(
  pageSource.indexOf("pmi-item-taxonomy-diagnostics.js")
    < pageSource.indexOf("coverage-strategy-diagnostic-export.js"),
  "PMI taxonomy diagnostics should load before diagnostic export."
);

const context = loadDiagnosticsContext();
const buildDiagnostics = context.LensApp.lensAnalysis.buildPmiItemTaxonomyDiagnostics;
assert.equal(typeof buildDiagnostics, "function");

const input = createFixtureInput();
const inputBefore = JSON.stringify(input);
const firstDiagnostics = buildDiagnostics(input);
const secondDiagnostics = buildDiagnostics(input);

assert.equal(JSON.stringify(input), inputBefore, "PMI taxonomy diagnostics should not mutate inputs.");
assert.deepEqual(secondDiagnostics, firstDiagnostics, "PMI taxonomy diagnostics should be deterministic.");
assert.doesNotThrow(() => JSON.stringify(firstDiagnostics), "PMI taxonomy diagnostics output should be serializable.");
assert.equal(firstDiagnostics.diagnosticOnly, true);
assert.equal(firstDiagnostics.graphMathChanged, false);
assert.equal(firstDiagnostics.normalizationChanged, false);
assert.equal(firstDiagnostics.taxonomiesChanged, false);
assert.equal(firstDiagnostics.categoriesRenamed, false);
assert.equal(firstDiagnostics.coverageStrategyObligationLedgerMathChanged, false);
assert.equal(firstDiagnostics.needLineChanged, false);
assert.equal(firstDiagnostics.resourceLineChanged, false);
assert.equal(firstDiagnostics.gapSurplusChanged, false);
assert.equal(firstDiagnostics.chartChanged, false);
assert.equal(firstDiagnostics.metadata.expenseLibraryEntryCount > 300, true);
assert.equal(firstDiagnostics.metadata.debtLibraryEntryCount >= 50, true);
assert.equal(firstDiagnostics.metadata.assetLibraryEntryCount > 250, true);

const groceries = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "expense-fact" && row.currentLibraryKey === "groceries",
  "Groceries expense fact should be classified."
);
assert.equal(groceries.recommendedItemType, "householdFood");
assert.equal(groceries.recommendedOwnerComponent, "essentialSupport");
assert.equal(groceries.needOrResourceRole, "need-row");
assert.equal(groceries.inflationTreatment, "generalInflation");

const medicalOop = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "expense-fact" && row.currentLibraryKey === "medicalOutOfPocket",
  "Medical OOP expense fact should be classified."
);
assert.equal(medicalOop.recommendedItemType, "healthcareOutOfPocket");
assert.equal(medicalOop.recommendedOwnerComponent, "essentialSupport");
assert.equal(medicalOop.projectionRule, "support-owned-current-policy");
assert.notEqual(medicalOop.categoryDriver, "inflation-treatment");

const education = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "expense-fact" && row.currentCategoryKey === "educationExpense",
  "Education expense fact should be classified."
);
assert.equal(education.recommendedOwnerComponent, "education");
assert.equal(education.recommendedItemType, "educationTuition");
assert.equal(education.inflationTreatment, "educationInflation");

const finalExpense = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "expense-fact" && row.currentCategoryKey === "funeralBurial",
  "Final expense fact should be classified."
);
assert.equal(finalExpense.recommendedOwnerComponent, "finalExpense");
assert.equal(finalExpense.recommendedItemType, "finalExpense");
assert.equal(finalExpense.inflationTreatment, "finalExpenseInflation");

const savingsContribution = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "savings-contribution-fact",
  "Savings contribution fact should be classified."
);
assert.equal(savingsContribution.recommendedItemType, "plannedSavingsContribution");
assert.equal(savingsContribution.recommendedOwnerComponent, "resources");
assert.equal(savingsContribution.needOrResourceRole, "offset-funding-row");
assert.equal(savingsContribution.currentCategoryKey, "savingsGoalContributions");

const creditCard = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "debt-fact" && row.currentLibraryKey === "creditCard",
  "Credit card debt fact should be classified."
);
assert.equal(creditCard.recommendedItemType, "creditCardDebt");
assert.equal(creditCard.recommendedOwnerComponent, "nonMortgageDebt");
assert.equal(creditCard.inflationTreatment, "notInflatedAmortized");

const autoLoan = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "debt-fact" && row.currentLibraryKey === "autoLoan",
  "Auto loan debt fact should be classified."
);
assert.equal(autoLoan.recommendedItemType, "vehicleLoan");
assert.equal(autoLoan.recommendedOwnerComponent, "nonMortgageDebt");

const autoLease = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "debt-fact" && row.currentLibraryKey === "autoLease",
  "Auto lease debt fact should be classified."
);
assert.equal(autoLease.recommendedItemType, "vehicleLease");
assert.equal(autoLease.recommendedOwnerComponent, "nonMortgageDebt");
assert.equal(autoLease.projectionRule, "lease-payment-stream");
assert.match(autoLease.notes.join(" "), /payment streams, not ordinary payoff-balance debts/);

["cashAndCashEquivalents", "emergencyFund", "taxableBrokerageInvestments", "traditionalRetirementAssets"].forEach((categoryKey) => {
  const row = findRow(
    firstDiagnostics,
    (candidate) => candidate.sourceType === "asset-fact" && candidate.currentCategoryKey === categoryKey,
    `${categoryKey} asset fact should be classified.`
  );
  assert.equal(row.recommendedOwnerComponent, "resources");
  assert.equal(row.recommendedItemType, "assetAccount");
  assert.equal(row.needOrResourceRole, "resource-row");
});

const medicalFinalExpenseCategory = findRow(
  firstDiagnostics,
  (row) => row.sourceType === "expense-category" && row.currentCategoryKey === "medicalFinalExpense",
  "Medical final expense category should be represented."
);
assert.equal(medicalFinalExpenseCategory.categoryDriver, "mixed");
assert.equal(medicalFinalExpenseCategory.inflationTreatment, "healthcareInflation");
assert.ok(
  medicalFinalExpenseCategory.warnings.some((warning) => warning.code === "pmi-item-category-driver-not-pure-item-type")
);

assert.equal(firstDiagnostics.roleSummary["need-row"] > 0, true);
assert.equal(firstDiagnostics.roleSummary["resource-row"] > 0, true);
assert.equal(firstDiagnostics.roleSummary["offset-funding-row"] > 0, true);
assert.equal(firstDiagnostics.roleSummary["timing-projection-fact"] > 0, true);
assert.equal(firstDiagnostics.roleSummary["supporting-calculation-fact"] > 0, true);
assert.equal(firstDiagnostics.roleSummary["diagnostic-display-fact"] > 0, true);
assert.equal(firstDiagnostics.roleSummary["unused-deprecated-candidate"] > 0, true);
assert.equal(firstDiagnostics.ownerSummary.essentialSupport > 0, true);
assert.equal(firstDiagnostics.ownerSummary.resources > 0, true);
assert.equal(firstDiagnostics.categoryDriverSummary.mixed > 0, true);

const exportContext = loadDiagnosticsContext();
loadScript(exportContext, "app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const buildSnapshot = exportContext.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;
const snapshot = buildSnapshot({
  profileRecord: input.profileRecord,
  protectionModelingPayload: {
    data: input.protectionModelingData
  },
  lensModel: input.lensModel,
  needLine: {
    needPoints: [{ yearIndex: 0, needAmount: 0, componentAmounts: {} }]
  },
  resourceLine: {
    resourcePoints: [{ yearIndex: 0, resourceAmount: 0 }]
  },
  gapSurplus: {
    gapSurplusPoints: [{ yearIndex: 0, remainingExposureAmount: 0 }]
  },
  chartModel: {
    summary: { pointCount: 1 }
  }
});
assert.ok(snapshot.pmiItemTaxonomyDiagnostics);
assert.equal(snapshot.pmiItemTaxonomyDiagnostics.diagnosticOnly, true);
assert.equal(snapshot.pmiItemTaxonomyDiagnostics.graphMathChanged, false);
assert.ok(snapshot.pmiProtectionModelingInputs.pmiItemTaxonomyDiagnostics);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.needPoints[0].needAmount, 0);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.resourcePoints[0].resourceAmount, 0);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.gapSurplusPoints[0].remainingExposureAmount, 0);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.chartModelSummary.summary.pointCount, 1);

console.log("PMI item taxonomy diagnostics check passed");
