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
  "app/features/lens-analysis/debt-amortization-term-calculations.js",
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
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
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
assert.equal(debtFacts.metadata.debtRecordsSourceOfTruth, true);
assert.deepEqual(
  Array.from(debtFacts.metadata.suppressedScalarDebtSourceFields),
  [
    "otherRealEstateLoans",
    "autoLoans",
    "creditCardDebt",
    "studentLoans",
    "personalLoans",
    "taxLiabilities",
    "businessDebt",
    "otherLoanObligations"
  ],
  "explicit debtRecords[] should suppress non-mortgage scalar debt sources"
);

const scalarDebts = debtFacts.debts.filter((debt) => debt.isScalarCompatibilityDebt === true);
const repeatableDebts = debtFacts.debts.filter((debt) => debt.isRepeatableDebtRecord === true);
assert.equal(scalarDebts.length, 1, "only housing-owned mortgage scalar debt should project when debtRecords[] exists");
assert.equal(repeatableDebts.length, 3, "valid debtRecords should project without category dedupe");
assert.equal(debtFacts.metadata.acceptedScalarDebtCount, 1);
assert.equal(debtFacts.metadata.acceptedDebtRecordCount, 3);
assert.equal(debtFacts.metadata.invalidDebtRecordCount, 6);
assert.equal(debtFacts.debts.length, 4);

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
assert.equal(
  debtFacts.debts.some((debt) => debt.sourceKey === "creditCardDebt"),
  false,
  "non-mortgage scalar debt fields should not double count when debtRecords[] exists"
);

const warningCodes = collectWarningCodes(debtFacts);
[
  "scalar-debt-source-suppressed-by-debt-records",
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

assert.equal(modelWithRecords.debtPayoff.totalDebtPayoffNeed, 256500);
assert.equal(modelWithRecords.debtPayoff.mortgageBalance, 250000);
assert.equal(modelWithRecords.debtPayoff.creditCardBalance, 2000);
assert.equal(modelWithRecords.debtPayoff.personalLoanBalance, 1000);
assert.equal(modelWithRecords.debtPayoff.otherDebtPayoffNeeds, 3500);

const jamesDoeModel = buildModel({
  debtRecords: [
    {
      debtId: "james-doe-auto",
      categoryKey: "securedConsumerDebt",
      typeKey: "autoLoan",
      label: "James Doe Auto Loan",
      currentBalance: 31000,
      paymentFrequency: "monthly",
      paymentAmount: 383,
      minimumMonthlyPayment: 383,
      interestRatePercent: 6,
      remainingTermMonths: 45,
      metadata: {
        sourceType: "user-input",
        source: "debt-library",
        libraryEntryKey: "autoLoan"
      }
    },
    {
      debtId: "james-doe-lease",
      categoryKey: "securedConsumerDebt",
      typeKey: "autoLease",
      label: "Auto Lease",
      paymentType: "leasePayment",
      paymentFrequency: "monthly",
      paymentAmount: 383,
      remainingTermMonths: 45,
      metadata: {
        sourceType: "user-input",
        source: "debt-library",
        libraryEntryKey: "autoLease"
      }
    }
  ]
});
const jamesDoeAutoDebt = jamesDoeModel.debtFacts.debts.find((debt) => debt.debtFactId === "james-doe-auto");
assert.ok(jamesDoeAutoDebt, "James Doe auto loan should normalize into debt facts");
assert.ok(jamesDoeAutoDebt.calculatedRemainingTermMonths > 45, "auto loan calculated payoff term should exceed entered 45 months");
assert.equal(jamesDoeAutoDebt.paymentAmount, 383, "auto loan payment amount should be preserved");
assert.equal(jamesDoeAutoDebt.paymentFrequency, "monthly", "auto loan payment frequency should be preserved");
assert.equal(jamesDoeAutoDebt.minimumMonthlyPayment, 383, "auto loan monthly payment should be calculation-ready");
assert.equal(jamesDoeAutoDebt.enteredRemainingTermMonths, 45, "auto loan entered term should be preserved");
assert.equal(jamesDoeAutoDebt.userEnteredRemainingTermMonths, 45, "auto loan user-entered term alias should be preserved");
assert.equal(jamesDoeAutoDebt.remainingTermMonths, jamesDoeAutoDebt.calculatedRemainingTermMonths, "calculation-ready term should use calculated payoff months");
assert.equal(jamesDoeAutoDebt.remainingTermSource, "calculatedFromPayment");
assert.equal(jamesDoeAutoDebt.paymentTermMismatch, true);
assert.ok(
  jamesDoeAutoDebt.metadata.payoffTermCalculation.projectedBalanceAtUserTerm > 19000,
  "auto loan trace should show material balance remains at entered 45-month term"
);
assert.ok(
  collectWarningCodes(jamesDoeModel.debtFacts).includes("debt-record-payment-term-mismatch"),
  "debt fact metadata should warn on entered/calculated term mismatch"
);
const jamesDoeLeaseDebt = jamesDoeModel.debtFacts.debts.find((debt) => debt.debtFactId === "james-doe-lease");
assert.ok(jamesDoeLeaseDebt, "lease record should still normalize when balance is not required");
assert.equal(jamesDoeLeaseDebt.calculatedRemainingTermMonths, null, "lease record should not force amortization");
assert.equal(jamesDoeLeaseDebt.remainingTermMonths, 45, "lease record keeps contractual entered term");
assert.equal(jamesDoeLeaseDebt.remainingTermSource, "entered");

const modelWithoutRecords = buildModel(createSourceData(false));
assert.equal(modelWithoutRecords.debtFacts.metadata.debtRecordsSourceOfTruth, false);
assert.equal(
  modelWithoutRecords.debtFacts.debts.filter((debt) => debt.isScalarCompatibilityDebt === true).length,
  9,
  "legacy scalar debt facts should still project when debtRecords[] is missing"
);
assert.equal(modelWithoutRecords.debtPayoff.totalDebtPayoffNeed, 99999);

const sourceWithExplicitEmptyRecords = createSourceData(false);
sourceWithExplicitEmptyRecords.debtRecords = [];
const modelWithExplicitEmptyRecords = buildModel(sourceWithExplicitEmptyRecords);
assert.equal(modelWithExplicitEmptyRecords.debtFacts.metadata.debtRecordsSourceOfTruth, true);
assert.equal(modelWithExplicitEmptyRecords.debtFacts.metadata.acceptedScalarDebtCount, 1);
assert.equal(modelWithExplicitEmptyRecords.debtFacts.metadata.acceptedDebtRecordCount, 0);
assert.equal(modelWithExplicitEmptyRecords.debtFacts.debts.length, 1, "explicit empty debtRecords[] should keep only mortgage scalar facts");
assert.equal(modelWithExplicitEmptyRecords.debtPayoff.totalDebtPayoffNeed, 250000);

assertNoProtectedDiffs();

console.log("debt-facts-normalization-check passed");
