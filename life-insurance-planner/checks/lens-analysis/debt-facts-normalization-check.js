#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
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
  "app/features/lens-analysis/inflation-projection-calculations.js",
  "app/features/lens-analysis/education-funding-projection-calculations.js",
  "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-methods.js"
].forEach(loadScript);

const lensAnalysis = context.LensApp.lensAnalysis;
const methods = lensAnalysis.analysisMethods;

assert.equal(typeof lensAnalysis.createEmptyLensModel, "function");
assert.equal(typeof lensAnalysis.createDebtFactsFromSourceData, "function");
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof methods?.runAnalysisMethods, "function");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSourceData(includeDebtRecords) {
  const sourceData = {
    grossAnnualIncome: 120000,
    netAnnualIncome: 90000,
    netAnnualIncomeManualOverride: true,
    mortgageBalance: 250000,
    otherRealEstateLoans: 20000,
    autoLoans: 15000,
    creditCardDebt: 7000,
    studentLoans: 11000,
    personalLoans: 5000,
    taxLiabilities: 3000,
    businessDebt: 9000,
    otherLoanObligations: 4000,
    totalDebtPayoffNeed: 99999,
    totalDebtPayoffNeedManualOverride: true,
    calculatedMonthlyMortgagePayment: 1800,
    calculatedMonthlyMortgagePaymentManualOverride: true,
    insuranceCost: 200,
    healthcareOutOfPocketCost: 250,
    foodCost: 900,
    transportationCost: 500,
    childcareDependentCareCost: 0,
    phoneInternetCost: 180,
    householdSuppliesCost: 250,
    otherHouseholdExpenses: 300,
    estimatedCostPerChild: 10000,
    childrenNeedingFunding: 1,
    projectedDependentsCount: 0,
    funeralBurialEstimate: 15000,
    medicalEndOfLifeCosts: 5000,
    estateSettlementCosts: 10000,
    otherFinalExpenses: 0,
    immediateLiquidityBuffer: 25000,
    desiredEmergencyFund: 20000,
    relocationReserve: 0,
    otherTransitionNeeds: 0
  };

  if (includeDebtRecords) {
    sourceData.debtRecords = [
      {
        debtId: "debt_duplicate",
        categoryKey: "unsecuredConsumerDebt",
        typeKey: "creditCard",
        label: "Rewards card",
        currentBalance: 2000,
        minimumMonthlyPayment: 100,
        interestRatePercent: 19.5,
        remainingTermMonths: 18,
        metadata: {
          sourceType: "user-input",
          source: "debt-library",
          libraryEntryKey: "creditCard"
        }
      },
      {
        debtId: "debt_custom",
        categoryKey: "otherDebt",
        typeKey: "customDebt",
        label: "Custom bridge loan",
        currentBalance: 3500,
        minimumMonthlyPayment: "not-a-number",
        interestRatePercent: -1,
        remainingTermMonths: "",
        isCustomDebt: true,
        metadata: {
          sourceType: "user-input",
          source: "debt-library",
          libraryEntryKey: "customDebt"
        }
      },
      {
        debtId: "debt_duplicate",
        categoryKey: "unsecuredConsumerDebt",
        typeKey: "personalLoan",
        label: "Duplicate id personal loan",
        currentBalance: 1000
      },
      {
        debtId: "debt_negative",
        categoryKey: "securedConsumerDebt",
        typeKey: "autoLoan",
        label: "Negative auto loan",
        currentBalance: -50
      },
      {
        debtId: "debt_blank",
        categoryKey: "medicalDebt",
        typeKey: "medicalBill",
        label: "Blank medical bill",
        currentBalance: ""
      },
      {
        debtId: "debt_unknown_category",
        categoryKey: "unknownDebt",
        typeKey: "autoLoan",
        label: "Unknown category",
        currentBalance: 100
      },
      {
        debtId: "debt_unknown_type",
        categoryKey: "otherDebt",
        typeKey: "madeUpDebt",
        label: "Unknown type",
        currentBalance: 100
      },
      {
        debtId: "debt_primary_mortgage",
        categoryKey: "realEstateSecuredDebt",
        typeKey: "primaryResidenceMortgage",
        label: "Duplicate primary mortgage",
        currentBalance: 999999
      },
      {
        debtId: "debt_equity",
        categoryKey: "primaryResidenceEquity",
        typeKey: "primaryResidenceEquity",
        label: "Equity is not debt",
        currentBalance: 500000
      }
    ];
  }

  return sourceData;
}

function buildModel(sourceData) {
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    profileRecord: {},
    analysisSettings: {
      methodDefaults: {
        includeExistingCoverage: false,
        needsIncludeOffsetAssets: false,
        includeTransitionNeeds: true,
        includeDiscretionarySupport: false,
        includeSurvivorIncomeOffset: false
      }
    }
  });

  assert.ok(result.lensModel, "expected lens model to build");
  return result.lensModel;
}

function runMethods(model) {
  return cloneJson(methods.runAnalysisMethods(model, {
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: false
  }));
}

function collectWarningCodes(debtFacts) {
  return (debtFacts.metadata.warnings || []).map((warning) => warning.code);
}

function assertNoProtectedDiffs() {
  const protectedFiles = [
    "pages/next-step.html",
    "pages/confidential-inputs.html",
    "pages/manual-protection-modeling-inputs.html",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(protectedFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();

  assert.equal(status, "", "protected method/display/adapter/page files should not have diffs");
}

const emptyModel = lensAnalysis.createEmptyLensModel();
assert.ok(emptyModel.debtFacts, "schema should include debtFacts bucket");
assert.ok(Array.isArray(emptyModel.debtFacts.debts));
assert.equal(emptyModel.debtFacts.debts.length, 0);
assert.equal(emptyModel.debtFacts.totalReportedDebtBalance, null);
assert.equal(emptyModel.debtFacts.metadata.source, "protectionModeling.data");

const sourceWithRecords = createSourceData(true);
const sourceSnapshot = cloneJson(sourceWithRecords);
const modelWithRecords = buildModel(sourceWithRecords);
assert.deepEqual(sourceWithRecords, sourceSnapshot, "normalization should not mutate source data");

const debtFacts = modelWithRecords.debtFacts;
assert.ok(debtFacts, "model should include debtFacts");
assert.ok(Array.isArray(debtFacts.debts), "debtFacts.debts should be an array");
assert.equal(debtFacts.metadata.source, "protectionModeling.data");
assert.equal(debtFacts.metadata.taxonomySource, "debt-taxonomy");
assert.equal(debtFacts.metadata.scalarDebtSource, "scalar-compatibility-fields");
assert.equal(debtFacts.metadata.debtRecordsSource, "protectionModeling.data.debtRecords");
assert.equal(debtFacts.metadata.manualTotalDebtPayoffOverride, true);
assert.equal(debtFacts.metadata.manualTotalDebtPayoffNeed, 99999);
assert.equal(debtFacts.metadata.manualOverrideSource, "debtPayoff.totalDebtPayoffNeed");

const scalarDebts = debtFacts.debts.filter((debt) => debt.isScalarCompatibilityDebt === true);
const repeatableDebts = debtFacts.debts.filter((debt) => debt.isRepeatableDebtRecord === true);
assert.equal(scalarDebts.length, 9, "all positive scalar debt fields should project");
assert.equal(repeatableDebts.length, 3, "valid debtRecords should project without category dedupe");
assert.equal(debtFacts.metadata.acceptedScalarDebtCount, 9);
assert.equal(debtFacts.metadata.acceptedDebtRecordCount, 3);
assert.equal(debtFacts.metadata.invalidDebtRecordCount, 6);
assert.equal(debtFacts.debts.length, 12);

const mortgageDebt = debtFacts.debts.find((debt) => debt.sourceKey === "mortgageBalance");
assert.ok(mortgageDebt, "mortgageBalance should project as a housing-owned raw debt fact");
assert.equal(mortgageDebt.isHousingFieldOwned, true);
assert.equal(mortgageDebt.currentBalance, 250000);
assert.equal(mortgageDebt.metadata.duplicateProtection, "mortgageBalance-remains-single-source");

const customDebt = debtFacts.debts.find((debt) => debt.typeKey === "customDebt");
assert.ok(customDebt, "custom debt should project");
assert.equal(customDebt.categoryKey, "otherDebt");
assert.equal(customDebt.isCustomDebt, true);
assert.equal(customDebt.currentBalance, 3500);
assert.equal(customDebt.minimumMonthlyPayment, null);
assert.equal(customDebt.interestRatePercent, null);
assert.equal(customDebt.remainingTermMonths, null);

assert.equal(
  debtFacts.debts.some((debt) => debt.typeKey === "primaryResidenceMortgage"),
  false,
  "primary residence mortgage debtRecords should be rejected"
);
assert.equal(
  debtFacts.debts.some((debt) => {
    return debt.categoryKey === "primaryResidenceEquity"
      || debt.typeKey === "primaryResidenceEquity"
      || debt.sourceKey === "primaryResidenceEquity"
      || debt.categoryKey === "realEstateEquity"
      || debt.typeKey === "realEstateEquity"
      || debt.sourceKey === "realEstateEquity";
  }),
  false,
  "equity fields should never project into debtFacts"
);
assert.equal(
  debtFacts.debts.some((debt) => debt.sourceKey === "totalDebtPayoffNeed"),
  false,
  "manual totalDebtPayoffNeed should not create a debt fact"
);

const warningCodes = collectWarningCodes(debtFacts);
[
  "duplicate-debt-fact-id",
  "negative-debt-record-balance",
  "missing-debt-record-balance",
  "unknown-debt-record-category",
  "unknown-debt-record-type",
  "protected-mortgage-debt-record-rejected",
  "equity-debt-record-rejected"
].forEach((code) => {
  assert.ok(warningCodes.includes(code), `expected warning ${code}`);
});
assert.ok(debtFacts.metadata.duplicateDebtIds.includes("debt_duplicate"));

const expectedDebtFactsTotal = debtFacts.debts.reduce((total, debt) => total + debt.currentBalance, 0);
assert.equal(debtFacts.totalReportedDebtBalance, expectedDebtFactsTotal);

assert.equal(modelWithRecords.debtPayoff.totalDebtPayoffNeed, 99999);
assert.equal(modelWithRecords.debtPayoff.mortgageBalance, 250000);

const modelWithoutRecords = buildModel(createSourceData(false));
const methodsWithoutRecords = runMethods(modelWithoutRecords);
const methodsWithRecords = runMethods(modelWithRecords);
assert.deepEqual(
  methodsWithRecords,
  methodsWithoutRecords,
  "normalization-only debtFacts projection should remain raw-equivalent with no debt treatment helper loaded"
);

assertNoProtectedDiffs();

console.log("debt-facts-normalization-check passed");
