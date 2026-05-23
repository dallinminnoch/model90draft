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

function createContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/coverage/coverage-policy-utils.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/asset-library.js",
    "app/features/lens-analysis/debt-taxonomy.js",
    "app/features/lens-analysis/debt-library.js",
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
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
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach((relativePath) => loadScript(context, relativePath));

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSourceData(overrides = {}) {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    mortgageBalance: 0,
    totalDebtPayoffNeed: 0,
    monthlyHousingCost: 2500,
    monthlyNonHousingEssentialExpenses: 3500,
    estimatedCostPerChild: 0,
    projectedEducationFundingPerDependent: 0,
    funeralBurialEstimate: 15000,
    medicalEndOfLifeCosts: 15000,
    estateSettlementCosts: 10000,
    otherFinalExpenses: 5000,
    immediateLiquidityBuffer: 0,
    desiredEmergencyFund: 0,
    relocationReserve: 0,
    otherTransitionNeeds: 0,
    ...overrides
  };
}

function createAnalysisSettings(overrides = {}) {
  return {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      householdExpenseInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "expense-facts-normalization-check",
      ...(overrides.inflationAssumptions || {})
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: false,
        includeProjectedDependents: false,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "expense-facts-normalization-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: false,
        includeDiscretionarySupport: false
      },
      source: "expense-facts-normalization-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    },
    ...(overrides.analysisSettings || {})
  };
}

function createProfileRecord(analysisSettings, overrides = {}) {
  return {
    id: "expense-facts-profile",
    displayName: "Expense Facts Normalization",
    dateOfBirth: "1980-06-15",
    analysisSettings,
    coveragePolicies: [],
    ...overrides
  };
}

function buildModel(context, sourceData, analysisSettings = createAnalysisSettings()) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const profileRecord = createProfileRecord(analysisSettings);
  return lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    profileRecord,
    analysisSettings
  });
}

function createMethodSettings(context, lensModel, analysisSettings) {
  return context.LensApp.lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord: createProfileRecord(analysisSettings)
  });
}

function runMethodSnapshot(context, lensModel, methodSettings) {
  const methods = context.LensApp.lensAnalysis.analysisMethods;
  const dime = methods.runDimeAnalysis(lensModel, cloneJson(methodSettings.dimeSettings));
  const needs = methods.runNeedsAnalysis(lensModel, cloneJson(methodSettings.needsAnalysisSettings));
  const hlv = methods.runHumanLifeValueAnalysis(lensModel, cloneJson(methodSettings.humanLifeValueSettings));

  return {
    dime: {
      grossNeed: dime.grossNeed,
      netCoverageGap: dime.netCoverageGap,
      components: dime.components
    },
    needs: {
      grossNeed: needs.grossNeed,
      netCoverageGap: needs.netCoverageGap,
      components: needs.components,
      finalExpensesTrace: (needs.trace || []).find((row) => row && row.key === "finalExpenses") || null
    },
    hlv: {
      grossHumanLifeValue: hlv.grossHumanLifeValue,
      netCoverageGap: hlv.netCoverageGap,
      components: hlv.components
    }
  };
}

function scriptSources(pagePath) {
  const html = readRepoFile(pagePath);
  const sources = [];
  const regex = /<script\b[^>]*\bsrc="([^"]+)"/g;
  let match = regex.exec(html);

  while (match) {
    sources.push(match[1]);
    match = regex.exec(html);
  }

  return sources;
}

function assertScriptBefore(sources, beforeName, afterName, pagePath) {
  const beforeIndex = sources.findIndex((source) => source.includes(beforeName));
  const afterIndex = sources.findIndex((source) => source.includes(afterName));
  assert.notEqual(beforeIndex, -1, `${beforeName} should be loaded on ${pagePath}`);
  assert.notEqual(afterIndex, -1, `${afterName} should be loaded on ${pagePath}`);
  assert.ok(beforeIndex < afterIndex, `${beforeName} should load before ${afterName} on ${pagePath}`);
}

function findExpenseFact(expenseFacts, typeKey, expenseRecordId = null) {
  return expenseFacts.expenses.find((expense) => {
    if (!expense || expense.typeKey !== typeKey) {
      return false;
    }

    return expenseRecordId == null || expense.expenseRecordId === expenseRecordId;
  }) || null;
}

function metadataWarningCodes(expenseFacts) {
  return (expenseFacts.metadata.warnings || []).map((warning) => warning.code);
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;

const emptyModel = lensAnalysis.createEmptyLensModel();
assert.ok(emptyModel.expenseFacts, "schema should include expenseFacts");
assert.ok(Array.isArray(emptyModel.expenseFacts.expenses), "expenseFacts.expenses should default to an array");
assert.equal(emptyModel.expenseFacts.expenses.length, 0);
assert.equal(typeof emptyModel.expenseFacts.totalsByBucket, "object");
assert.equal(Object.keys(emptyModel.expenseFacts.totalsByBucket).length, 0);
assert.equal(emptyModel.expenseFacts.metadata.source, "protectionModeling.data");
assert.equal(emptyModel.expenseFacts.metadata.taxonomySource, "expense-taxonomy");
assert.equal(emptyModel.expenseFacts.metadata.librarySource, "expense-library");
assert.equal(emptyModel.expenseFacts.metadata.scalarExpenseSource, "final-expense-scalar-fields");
assert.equal(emptyModel.expenseFacts.metadata.expenseRecordsSource, null);
assert.equal(emptyModel.expenseFacts.metadata.sourceExpenseRecordCount, 0);

const sourceData = createSourceData();
const sourceSnapshot = cloneJson(sourceData);
const analysisSettings = createAnalysisSettings();
const builderResult = buildModel(context, sourceData, analysisSettings);
assert.deepEqual(sourceData, sourceSnapshot, "expenseFacts normalization should not mutate source data");

const lensModel = builderResult.lensModel;
const expenseFacts = lensModel.expenseFacts;
assert.ok(expenseFacts, "normalized Lens model should include expenseFacts");
assert.ok(Array.isArray(expenseFacts.expenses));
assert.equal(expenseFacts.expenses.length, 4);
assert.equal(expenseFacts.metadata.source, "protectionModeling.data");
assert.equal(expenseFacts.metadata.taxonomySource, "expense-taxonomy");
assert.equal(expenseFacts.metadata.librarySource, "expense-library");
assert.equal(expenseFacts.metadata.scalarExpenseSource, "final-expense-scalar-fields");
assert.equal(expenseFacts.metadata.expenseRecordsSource, null);
assert.equal(expenseFacts.metadata.debtPaymentExpenseSource, null);
assert.equal(expenseFacts.metadata.acceptedScalarExpenseCount, 4);
assert.equal(expenseFacts.metadata.sourceExpenseRecordCount, 0);
assert.equal(expenseFacts.metadata.acceptedExpenseRecordCount, 0);
assert.equal(expenseFacts.metadata.invalidExpenseRecordCount, 0);
assert.equal(expenseFacts.metadata.sourceDebtRecordCount, 0);
assert.equal(expenseFacts.metadata.acceptedGeneratedDebtPaymentExpenseCount, 0);
assert.equal(expenseFacts.metadata.skippedGeneratedDebtPaymentExpenseCount, 0);
assert.equal(expenseFacts.metadata.invalidGeneratedDebtPaymentExpenseCount, 0);
assert.ok(Array.isArray(expenseFacts.metadata.warnings));
assert.equal(expenseFacts.metadata.warnings.length, 0);

const expectedScalarFacts = [
  {
    typeKey: "funeralBurialEstimate",
    categoryKey: "funeralBurial",
    sourceKey: "funeralBurialEstimate",
    amount: 15000,
    healthcareSensitive: false
  },
  {
    typeKey: "medicalEndOfLifeCosts",
    categoryKey: "medicalFinalExpense",
    sourceKey: "medicalEndOfLifeCosts",
    amount: 15000,
    healthcareSensitive: true
  },
  {
    typeKey: "estateSettlementCosts",
    categoryKey: "estateSettlement",
    sourceKey: "estateSettlementCosts",
    amount: 10000,
    healthcareSensitive: false
  },
  {
    typeKey: "otherFinalExpenses",
    categoryKey: "otherFinalExpense",
    sourceKey: "otherFinalExpenses",
    amount: 5000,
    healthcareSensitive: false
  }
];

expectedScalarFacts.forEach((expected) => {
  const fact = expenseFacts.expenses.find((expense) => expense.typeKey === expected.typeKey);
  assert.ok(fact, `${expected.typeKey} should project into expenseFacts.expenses`);
  assert.equal(fact.categoryKey, expected.categoryKey);
  assert.equal(fact.sourceKey, expected.sourceKey);
  assert.equal(fact.sourcePath, `protectionModeling.data.${expected.sourceKey}`);
  assert.equal(fact.ownedByField, expected.sourceKey);
  assert.equal(fact.amount, expected.amount);
  assert.equal(fact.frequency, "oneTime");
  assert.equal(fact.termType, "oneTime");
  assert.equal(fact.isDefaultExpense, true);
  assert.equal(fact.isScalarFieldOwned, true);
  assert.equal(fact.isProtected, true);
  assert.equal(fact.isAddable, false);
  assert.equal(fact.isRepeatableExpenseRecord, false);
  assert.equal(fact.isFinalExpenseComponent, true);
  assert.equal(fact.isHealthcareSensitive, expected.healthcareSensitive);
  assert.equal(fact.uiAvailability, "future");
  assert.equal(fact.metadata.canonicalDestination, "expenseFacts.expenses");
  assert.equal(fact.metadata.recordSource, "final-expense-scalar-field");
  assert.equal(fact.metadata.duplicateProtection, `${expected.sourceKey}-remains-single-source`);
});

assert.equal(expenseFacts.totalsByBucket.medicalFinalExpense, 15000);
assert.equal(expenseFacts.totalsByBucket.funeralBurial, 15000);
assert.equal(expenseFacts.totalsByBucket.estateSettlement, 10000);
assert.equal(expenseFacts.totalsByBucket.otherFinalExpense, 5000);
assert.equal(expenseFacts.totalsByBucket.totalScalarFinalExpense, 45000);
assert.equal(expenseFacts.totalsByBucket.totalRepeatableFinalExpense, null);
assert.equal(expenseFacts.totalsByBucket.totalFinalExpense, 45000);
assert.equal(expenseFacts.totalsByBucket.totalFinalExpense, lensModel.finalExpenses.totalFinalExpenseNeed);
assert.equal(expenseFacts.totalsByBucket.totalNonMedicalFinalExpense, 30000);
assert.equal(expenseFacts.totalsByBucket.totalHealthcareSensitiveExpense, 15000);
assert.equal(expenseFacts.totalsByBucket.totalHealthcareExpense, 15000);
assert.equal(expenseFacts.totalsByBucket.totalAnnualRecurringExpense, null);
assert.equal(expenseFacts.totalsByBucket.totalOneTimeExpense, 45000);
assert.equal(expenseFacts.totalsByBucket.totalAnnualHealthcareExpense, null);
assert.equal(expenseFacts.totalsByBucket.totalOneTimeHealthcareExpense, 15000);
assert.equal(expenseFacts.totalsByBucket.generatedDebtPaymentMonthlyRecurringExpense, null);
assert.equal(expenseFacts.totalsByBucket.generatedDebtPaymentAnnualRecurringExpense, null);
assert.equal(expenseFacts.totalsByBucket.generatedDebtPaymentOneTimeExpense, null);

assert.deepEqual(cloneJson(lensModel.finalExpenses), {
  funeralAndBurialCost: 15000,
  medicalEndOfLifeCost: 15000,
  estateSettlementCost: 10000,
  otherFinalExpenses: 5000,
  totalFinalExpenseNeed: 45000
});

const zeroAndMissingSource = createSourceData({
  funeralBurialEstimate: 0,
  medicalEndOfLifeCosts: ""
});
delete zeroAndMissingSource.estateSettlementCosts;
delete zeroAndMissingSource.otherFinalExpenses;
const zeroAndMissingModel = buildModel(context, zeroAndMissingSource, analysisSettings).lensModel;
assert.equal(zeroAndMissingModel.expenseFacts.expenses.length, 1, "present zero scalar expense should project while missing/blank values are omitted");
assert.equal(zeroAndMissingModel.expenseFacts.expenses[0].typeKey, "funeralBurialEstimate");
assert.equal(zeroAndMissingModel.expenseFacts.expenses[0].amount, 0);
assert.equal(zeroAndMissingModel.expenseFacts.metadata.acceptedScalarExpenseCount, 1);
assert.equal(zeroAndMissingModel.expenseFacts.totalsByBucket.funeralBurial, 0);

const ignoredScalarHouseholdSource = createSourceData({
  insuranceCost: 1200,
  healthcareOutOfPocketCost: 300,
  foodCost: 900,
  transportationCost: 450,
  childcareDependentCareCost: 400,
  phoneInternetCost: 144,
  householdSuppliesCost: 350,
  otherHouseholdExpenses: 125,
  travelDiscretionaryCost: 350,
  subscriptionsCost: 450,
  expenseRecords: []
});
const ignoredScalarHouseholdModel = buildModel(context, ignoredScalarHouseholdSource, analysisSettings).lensModel;
const ignoredScalarHouseholdFacts = ignoredScalarHouseholdModel.expenseFacts;
assert.equal(ignoredScalarHouseholdFacts.metadata.scalarHouseholdExpenseSource, null, "old household scalar fields should not be normalized as current expense facts");
assert.equal(ignoredScalarHouseholdFacts.metadata.sourceScalarHouseholdExpenseFieldCount, 0);
assert.equal(ignoredScalarHouseholdFacts.metadata.acceptedGeneratedScalarHouseholdExpenseCount, 0);
assert.equal(ignoredScalarHouseholdFacts.metadata.skippedRecordOwnedScalarHouseholdExpenseCount, 0);
assert.equal(
  ignoredScalarHouseholdFacts.expenses.some((expense) => expense.isScalarHouseholdExpense === true),
  false,
  "old household scalar fields should not create generated household expense facts"
);
assert.equal(ignoredScalarHouseholdFacts.totalsByBucket.totalFinalExpense, 45000, "final expense totals should remain unchanged");

const recordFirstCommonExpenseSource = createSourceData({
  expenseRecords: [
    {
      expenseId: "starter_expense_groceries",
      typeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Monthly Food / Grocery Cost",
      amount: 1200,
      frequency: "monthly",
      termType: "ongoing",
      continuationStatus: "continues",
      isDefaultExpense: true,
      metadata: { source: "starter-notebook", libraryEntryKey: "groceries" }
    },
    {
      expenseId: "starter_expense_medical",
      typeKey: "medicalOutOfPocket",
      categoryKey: "ongoingHealthcare",
      label: "Healthcare / Out-of-Pocket Medical",
      amount: 240,
      frequency: "monthly",
      termType: "ongoing",
      continuationStatus: "review",
      isDefaultExpense: true,
      metadata: { source: "starter-notebook", libraryEntryKey: "medicalOutOfPocket" }
    },
    {
      expenseId: "starter_expense_insurance",
      typeKey: "householdInsurancePremiums",
      categoryKey: "insurancePremiums",
      label: "Non-Housing Monthly Insurance",
      amount: 80,
      frequency: "monthly",
      termType: "ongoing",
      continuationStatus: "review",
      isDefaultExpense: true,
      metadata: { source: "starter-notebook", libraryEntryKey: "householdInsurancePremiums" }
    },
    {
      expenseId: "starter_expense_blank_transportation",
      typeKey: "householdTransportation",
      categoryKey: "transportation",
      label: "Monthly Transportation Cost",
      amount: null,
      frequency: "monthly",
      termType: "ongoing",
      continuationStatus: "review",
      isDefaultExpense: true,
      metadata: { source: "starter-notebook", libraryEntryKey: "householdTransportation" }
    }
  ]
});
const recordFirstCommonModel = buildModel(context, recordFirstCommonExpenseSource, analysisSettings).lensModel;
const recordFirstCommonFacts = recordFirstCommonModel.expenseFacts;
assert.equal(recordFirstCommonModel.ongoingSupport.monthlyFoodCost, 1200, "common starter expense records should replace matching scalar food fallback in ongoing support");
assert.equal(recordFirstCommonModel.ongoingSupport.monthlyHealthcareOutOfPocketCost, 240, "common starter healthcare row should replace matching scalar healthcare fallback in ongoing support");
assert.equal(recordFirstCommonModel.ongoingSupport.monthlyOtherInsuranceCost, 80, "common starter insurance row should replace matching scalar insurance fallback in ongoing support");
assert.equal(recordFirstCommonFacts.metadata.sourceScalarHouseholdExpenseFieldCount, 0);
assert.equal(recordFirstCommonFacts.metadata.acceptedGeneratedScalarHouseholdExpenseCount, 0, "record-first common values should not create scalar household facts");
assert.equal(recordFirstCommonFacts.metadata.skippedRecordOwnedScalarHouseholdExpenseCount, 0);
assert.equal(recordFirstCommonFacts.metadata.sourceExpenseRecordCount, 4);
assert.equal(recordFirstCommonFacts.metadata.acceptedExpenseRecordCount, 3);
assert.equal(recordFirstCommonFacts.metadata.skippedDefaultExpenseRecordCount, 1, "blank default starter records should be skipped without becoming invalid");
assert.equal(recordFirstCommonFacts.metadata.invalidExpenseRecordCount, 0);
assert.equal(
  recordFirstCommonFacts.expenses.find((expense) => expense.isScalarHouseholdExpense === true),
  undefined,
  "record-first common values should not double count with generated scalar facts"
);
const recordFirstFoodFact = findExpenseFact(recordFirstCommonFacts, "groceries", "starter_expense_groceries");
assert.ok(recordFirstFoodFact, "starter groceries row should normalize as a common expense fact");
assert.equal(recordFirstFoodFact.sourceKey, "expenseRecords");
assert.equal(recordFirstFoodFact.sourceOwnedBy, "ongoingSupport");
assert.equal(recordFirstFoodFact.ownedByField, "monthlyFoodCost");
assert.equal(recordFirstFoodFact.isCommonExpenseRecord, true);
assert.equal(recordFirstFoodFact.isFormulaEligible, false);
assert.equal(recordFirstFoodFact.metadata.recordSource, "expenseRecords-common-support-field");
assert.equal(recordFirstFoodFact.metadata.sourceKey, null);
assert.equal(recordFirstFoodFact.metadata.normalizedSourcePath, "lensModel.ongoingSupport.monthlyFoodCost");
const recordFirstHealthcareFact = findExpenseFact(recordFirstCommonFacts, "medicalOutOfPocket", "starter_expense_medical");
assert.ok(recordFirstHealthcareFact, "starter healthcare row should normalize as a common expense fact");
assert.equal(recordFirstHealthcareFact.categoryKey, "otherLivingExpense", "starter healthcare row should not enter healthcare projection buckets in Phase 1");
assert.equal(recordFirstHealthcareFact.compressionCategoryKey, "ongoingHealthcare");
assert.equal(recordFirstHealthcareFact.isHealthcareSensitive, false);
assert.equal(recordFirstHealthcareFact.isFormulaEligible, false);
assert.equal(recordFirstHealthcareFact.ownedByField, "monthlyHealthcareOutOfPocketCost");
assert.equal(findExpenseFact(recordFirstCommonFacts, "householdTransportation", "starter_expense_blank_transportation"), null);

const repeatableExpenseSource = createSourceData({
  expenseRecords: [
    {
      expenseId: "weekly_medical",
      typeKey: "medicalOutOfPocket",
      categoryKey: "ongoingHealthcare",
      label: "Weekly medical cost",
      amount: 10,
      frequency: "weekly",
      termType: "ongoing",
      continuationStatus: "stops"
    },
    {
      expenseId: "monthly_prescriptions",
      typeKey: "prescriptionMedications",
      categoryKey: "ongoingHealthcare",
      amount: 25,
      frequency: "monthly",
      termType: "ongoing"
    },
    {
      expenseId: "quarterly_specialist",
      typeKey: "specialistVisits",
      categoryKey: "ongoingHealthcare",
      amount: 100,
      frequency: "quarterly",
      termType: "ongoing"
    },
    {
      expenseId: "semiannual_dental",
      typeKey: "dentalOutOfPocket",
      categoryKey: "dentalCare",
      amount: 300,
      frequency: "semiAnnual",
      termType: "ongoing"
    },
    {
      expenseId: "annual_property_tax",
      typeKey: "propertyTaxes",
      categoryKey: "housingExpense",
      amount: 2400,
      frequency: "annual",
      termType: "ongoing"
    },
    {
      expenseId: "future_hospice",
      typeKey: "hospiceCare",
      categoryKey: "medicalFinalExpense",
      amount: 6000,
      frequency: "oneTime",
      termType: "oneTime"
    },
    {
      expenseId: "fixed_years_invalid_optional",
      typeKey: "physicalTherapy",
      categoryKey: "ongoingHealthcare",
      amount: 80,
      frequency: "monthly",
      termType: "fixedYears",
      continuationStatus: "not-valid",
      termYears: "not-a-number",
      endAge: "not-a-number",
      endDate: "not-a-date"
    },
    {
      expenseId: "custom_missing_category",
      typeKey: "customExpenseRecord",
      label: "",
      amount: 50,
      frequency: "monthly",
      termType: "ongoing",
      continuationStatus: "not-valid",
      isCustomExpense: true
    },
    {
      expenseId: "protected_medical_scalar",
      typeKey: "medicalEndOfLifeCosts",
      categoryKey: "medicalFinalExpense",
      amount: 1,
      frequency: "oneTime",
      termType: "oneTime"
    },
    {
      expenseId: "invalid_category",
      typeKey: "medicalOutOfPocket",
      categoryKey: "unknownExpenseBucket",
      amount: 10,
      frequency: "monthly",
      termType: "ongoing"
    },
    {
      expenseId: "invalid_frequency",
      typeKey: "medicalOutOfPocket",
      categoryKey: "ongoingHealthcare",
      amount: 10,
      frequency: "biweekly",
      termType: "ongoing"
    },
    {
      expenseId: "invalid_term_type",
      typeKey: "medicalOutOfPocket",
      categoryKey: "ongoingHealthcare",
      amount: 10,
      frequency: "monthly",
      termType: "forLife"
    },
    {
      expenseId: "negative_amount",
      typeKey: "medicalOutOfPocket",
      categoryKey: "ongoingHealthcare",
      amount: -10,
      frequency: "monthly",
      termType: "ongoing"
    }
  ]
});
const repeatableExpenseSourceSnapshot = cloneJson(repeatableExpenseSource);
const repeatableExpenseModel = buildModel(context, repeatableExpenseSource, analysisSettings).lensModel;
assert.deepEqual(repeatableExpenseSource, repeatableExpenseSourceSnapshot, "repeatable expense normalization should not mutate source data");

const repeatableExpenseFacts = repeatableExpenseModel.expenseFacts;
assert.equal(repeatableExpenseFacts.expenses.length, 12, "four scalar facts and eight repeatable facts should normalize");
assert.equal(repeatableExpenseFacts.metadata.expenseRecordsSource, "protectionModeling.data.expenseRecords");
assert.equal(repeatableExpenseFacts.metadata.debtPaymentExpenseSource, null);
assert.equal(repeatableExpenseFacts.metadata.acceptedScalarExpenseCount, 4);
assert.equal(repeatableExpenseFacts.metadata.sourceExpenseRecordCount, 13);
assert.equal(repeatableExpenseFacts.metadata.acceptedExpenseRecordCount, 8);
assert.equal(repeatableExpenseFacts.metadata.invalidExpenseRecordCount, 5);
assert.equal(repeatableExpenseFacts.metadata.sourceDebtRecordCount, 0);
assert.equal(repeatableExpenseFacts.metadata.acceptedGeneratedDebtPaymentExpenseCount, 0);
assert.equal(repeatableExpenseFacts.metadata.skippedGeneratedDebtPaymentExpenseCount, 0);
assert.equal(repeatableExpenseFacts.metadata.invalidGeneratedDebtPaymentExpenseCount, 0);

const weeklyMedicalFact = findExpenseFact(repeatableExpenseFacts, "medicalOutOfPocket", "weekly_medical");
assert.ok(weeklyMedicalFact, "weekly expense record should normalize");
assert.equal(weeklyMedicalFact.expenseFactId, "expense_record_weekly_medical");
assert.equal(weeklyMedicalFact.source, "protectionModeling.data.expenseRecords");
assert.equal(weeklyMedicalFact.sourceKey, "expenseRecords");
assert.equal(weeklyMedicalFact.sourcePath, "protectionModeling.data.expenseRecords[0]");
assert.equal(weeklyMedicalFact.sourceIndex, 0);
assert.equal(weeklyMedicalFact.isDefaultExpense, false);
assert.equal(weeklyMedicalFact.isScalarFieldOwned, false);
assert.equal(weeklyMedicalFact.isProtected, false);
assert.equal(weeklyMedicalFact.isAddable, true);
assert.equal(weeklyMedicalFact.isRepeatableExpenseRecord, true);
assert.equal(weeklyMedicalFact.isCustomExpense, false);
assert.equal(weeklyMedicalFact.isHealthcareSensitive, true);
assert.equal(weeklyMedicalFact.isFinalExpenseComponent, false);
assert.equal(weeklyMedicalFact.uiAvailability, "initial");
assert.equal(weeklyMedicalFact.continuationStatus, "stops");
assert.equal(weeklyMedicalFact.continuationStatusSource, "advisor");
assert.equal(weeklyMedicalFact.annualizedAmount, 520);
assert.equal(weeklyMedicalFact.oneTimeAmount, null);
assert.equal(weeklyMedicalFact.metadata.canonicalDestination, "expenseFacts.expenses");
assert.equal(weeklyMedicalFact.metadata.recordSource, "expenseRecords");
assert.equal(weeklyMedicalFact.metadata.libraryEntryKey, "medicalOutOfPocket");
assert.equal(weeklyMedicalFact.metadata.continuationStatusSource, "advisor");

const monthlyPrescriptionFact = findExpenseFact(repeatableExpenseFacts, "prescriptionMedications", "monthly_prescriptions");
assert.equal(monthlyPrescriptionFact.annualizedAmount, 300);
assert.equal(monthlyPrescriptionFact.continuationStatus, "review");
assert.equal(monthlyPrescriptionFact.continuationStatusSource, "library-default");
assert.equal(findExpenseFact(repeatableExpenseFacts, "specialistVisits", "quarterly_specialist").annualizedAmount, 400);
assert.equal(findExpenseFact(repeatableExpenseFacts, "dentalOutOfPocket", "semiannual_dental").annualizedAmount, 600);
const propertyTaxFact = findExpenseFact(repeatableExpenseFacts, "propertyTaxes", "annual_property_tax");
assert.equal(propertyTaxFact.annualizedAmount, 2400);
assert.equal(propertyTaxFact.continuationStatus, "continues");
assert.equal(propertyTaxFact.continuationStatusSource, "library-default");

const futureHospiceFact = findExpenseFact(repeatableExpenseFacts, "hospiceCare", "future_hospice");
assert.ok(futureHospiceFact, "valid addable future entries should normalize when present in saved data");
assert.equal(futureHospiceFact.uiAvailability, "future");
assert.equal(futureHospiceFact.isHealthcareSensitive, true);
assert.equal(futureHospiceFact.isFinalExpenseComponent, true);
assert.equal(futureHospiceFact.annualizedAmount, null);
assert.equal(futureHospiceFact.oneTimeAmount, 6000);

const fixedYearsFact = findExpenseFact(repeatableExpenseFacts, "physicalTherapy", "fixed_years_invalid_optional");
assert.equal(fixedYearsFact.termType, "fixedYears");
assert.equal(fixedYearsFact.continuationStatus, "review");
assert.equal(fixedYearsFact.continuationStatusSource, "library-default");
assert.equal(fixedYearsFact.termYears, null, "invalid optional termYears should become null");
assert.equal(fixedYearsFact.endAge, null);
assert.equal(fixedYearsFact.endDate, null);

const customFact = findExpenseFact(repeatableExpenseFacts, "customExpenseRecord", "custom_missing_category");
assert.ok(customFact, "custom records should normalize");
assert.equal(customFact.categoryKey, "customExpense");
assert.equal(customFact.label, "Custom Expense");
assert.equal(customFact.isCustomExpense, true);
assert.equal(customFact.continuationStatus, "review");
assert.equal(customFact.continuationStatusSource, "library-default");
assert.equal(customFact.annualizedAmount, 600);
assert.equal(customFact.uiAvailability, "initial");

const warningCodes = metadataWarningCodes(repeatableExpenseFacts);
assert.ok(warningCodes.includes("protected-scalar-expense-record-rejected"));
assert.ok(warningCodes.includes("unknown-expense-record-category"));
assert.ok(warningCodes.includes("invalid-expense-record-frequency"));
assert.ok(warningCodes.includes("invalid-expense-record-term-type"));
assert.ok(warningCodes.includes("negative-expense-record-amount"));
assert.equal(findExpenseFact(repeatableExpenseFacts, "medicalEndOfLifeCosts", "protected_medical_scalar"), null);

assert.equal(repeatableExpenseFacts.totalsByBucket.medicalFinalExpense, 21000);
assert.equal(repeatableExpenseFacts.totalsByBucket.ongoingHealthcare, 2180);
assert.equal(repeatableExpenseFacts.totalsByBucket.dentalCare, 600);
assert.equal(repeatableExpenseFacts.totalsByBucket.housingExpense, 2400);
assert.equal(repeatableExpenseFacts.totalsByBucket.customExpense, 600);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalScalarFinalExpense, 45000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalRepeatableFinalExpense, 6000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalFinalExpense, 51000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalFinalExpense, repeatableExpenseModel.finalExpenses.totalFinalExpenseNeed + 6000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalNonMedicalFinalExpense, 30000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalHealthcareSensitiveExpense, 23780);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalHealthcareExpense, 23780);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalAnnualRecurringExpense, 5780);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalOneTimeExpense, 51000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalAnnualHealthcareExpense, 2780);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalOneTimeHealthcareExpense, 21000);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalAnnualLivingExpense, 2400);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalAnnualEducationExpense, null);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalAnnualBusinessExpense, null);
assert.equal(repeatableExpenseFacts.totalsByBucket.totalAnnualCustomExpense, 600);
assert.equal(repeatableExpenseFacts.totalsByBucket.generatedDebtPaymentMonthlyRecurringExpense, null);
assert.equal(repeatableExpenseFacts.totalsByBucket.generatedDebtPaymentAnnualRecurringExpense, null);
assert.equal(repeatableExpenseFacts.totalsByBucket.generatedDebtPaymentOneTimeExpense, null);

assert.deepEqual(cloneJson(repeatableExpenseModel.finalExpenses), cloneJson(lensModel.finalExpenses), "repeatable expenses should not alter method-facing finalExpenses");

const debtPaymentSource = createSourceData({
  expenseRecords: [
    {
      expenseId: "manual_auto_loan_payment",
      typeKey: "customExpenseRecord",
      categoryKey: "customExpense",
      label: "Auto Loan Payment",
      amount: 425,
      frequency: "monthly",
      termType: "ongoing"
    }
  ],
  debtRecords: [
    {
      debtId: "debt_auto_loan",
      categoryKey: "securedConsumerDebt",
      typeKey: "autoLoan",
      label: "Auto Loan",
      currentBalance: 18000,
      paymentFrequency: "monthly",
      paymentAmount: 425,
      extraPayoffAmount: 50,
      remainingTermMonths: 42
    },
    {
      debtId: "debt_honda_accord",
      categoryKey: "securedConsumerDebt",
      typeKey: "secondVehicleLoan",
      label: "Honda Accord",
      currentBalance: 16000,
      paymentFrequency: "monthly",
      paymentAmount: 375
    },
    {
      debtId: "debt_auto_lease",
      categoryKey: "securedConsumerDebt",
      typeKey: "autoLease",
      label: "Auto Lease",
      currentBalance: null,
      paymentFrequency: "biweekly",
      paymentAmount: 200
    },
    {
      debtId: "debt_model_y",
      categoryKey: "securedConsumerDebt",
      typeKey: "secondVehicleLease",
      label: "Model Y",
      currentBalance: null,
      paymentFrequency: "monthly",
      paymentAmount: 525
    },
    {
      debtId: "debt_credit_card",
      categoryKey: "unsecuredConsumerDebt",
      typeKey: "creditCard",
      label: "Credit Card",
      currentBalance: 2000,
      paymentFrequency: "weekly",
      paymentAmount: 25
    },
    {
      debtId: "debt_personal_loan",
      categoryKey: "unsecuredConsumerDebt",
      typeKey: "personalLoan",
      label: "Personal Loan",
      currentBalance: 5000,
      paymentFrequency: "quarterly",
      paymentAmount: 900
    },
    {
      debtId: "debt_student_loan",
      categoryKey: "educationDebt",
      typeKey: "federalStudentLoan",
      label: "Student Loan",
      currentBalance: 12000,
      paymentFrequency: "semiannual",
      paymentAmount: 1200
    },
    {
      debtId: "debt_business_loan",
      categoryKey: "businessDebt",
      typeKey: "businessLoan",
      label: "Business Loan",
      currentBalance: 24000,
      paymentFrequency: "annual",
      paymentAmount: 2400
    },
    {
      debtId: "debt_tax_plan",
      categoryKey: "taxLegalDebt",
      typeKey: "irsTaxDebt",
      label: "IRS Payment Plan",
      currentBalance: null,
      paymentFrequency: "oneTime",
      paymentAmount: 1000
    },
    {
      debtId: "debt_medical_payment_plan",
      categoryKey: "medicalDebt",
      typeKey: "medicalBill",
      label: "Medical Payment Plan",
      currentBalance: null,
      paymentFrequency: "other",
      paymentAmount: 111
    },
    {
      debtId: "debt_invalid_payment",
      categoryKey: "otherDebt",
      typeKey: "otherDebt",
      label: "Invalid Payment",
      currentBalance: null,
      paymentFrequency: "monthly",
      paymentAmount: ""
    }
  ]
});
const debtPaymentSourceSnapshot = cloneJson(debtPaymentSource);
const debtPaymentModel = buildModel(context, debtPaymentSource, analysisSettings).lensModel;
assert.deepEqual(debtPaymentSource, debtPaymentSourceSnapshot, "debt-payment expense generation should not mutate source data");

const debtPaymentExpenseFacts = debtPaymentModel.expenseFacts;
assert.equal(debtPaymentExpenseFacts.expenses.length, 15, "four scalar facts, one manual expense, and ten generated debt-payment facts should normalize");
assert.equal(debtPaymentExpenseFacts.metadata.expenseRecordsSource, "protectionModeling.data.expenseRecords");
assert.equal(debtPaymentExpenseFacts.metadata.debtPaymentExpenseSource, "protectionModeling.data.debtRecords");
assert.equal(debtPaymentExpenseFacts.metadata.sourceExpenseRecordCount, 1);
assert.equal(debtPaymentExpenseFacts.metadata.acceptedExpenseRecordCount, 1);
assert.equal(debtPaymentExpenseFacts.metadata.invalidExpenseRecordCount, 0);
assert.equal(debtPaymentExpenseFacts.metadata.sourceDebtRecordCount, 11);
assert.equal(debtPaymentExpenseFacts.metadata.acceptedGeneratedDebtPaymentExpenseCount, 10);
assert.equal(debtPaymentExpenseFacts.metadata.skippedGeneratedDebtPaymentExpenseCount, 1);
assert.equal(debtPaymentExpenseFacts.metadata.invalidGeneratedDebtPaymentExpenseCount, 0);

const generatedDebtPayments = debtPaymentExpenseFacts.expenses.filter((expense) => expense.isGeneratedExpense === true && expense.isDebtPaymentExpense === true);
assert.equal(generatedDebtPayments.length, 10, "valid debtRecords with payments should generate read-only expense facts");
generatedDebtPayments.forEach((expense) => {
  assert.equal(expense.isReadOnly, true);
  assert.equal(expense.isFormulaEligible, false);
  assert.equal(expense.isAddable, false);
  assert.equal(expense.source, "protectionModeling.data.debtRecords");
  assert.equal(expense.sourceKey, "debtRecords");
  assert.ok(expense.sourceDebtRecordId, "generated fact should link to sourceDebtRecordId");
  assert.ok(expense.sourceDebtTypeKey, "generated fact should link to sourceDebtTypeKey");
  assert.ok(expense.sourcePath.startsWith("protectionModeling.data.debtRecords["));
  assert.ok(expense.duplicateProtectionKey.startsWith("debt-payment:"));
  assert.equal(expense.metadata.recordSource, "debtRecords-generated-payment");
  assert.equal(expense.metadata.formulaActivation, "deferred");
});

const autoLoanPayment = generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "autoLoan");
assert.ok(autoLoanPayment, "auto loan should generate a debt-payment expense fact");
assert.equal(autoLoanPayment.label, "Auto Loan Payment");
assert.equal(autoLoanPayment.amount, 425);
assert.equal(autoLoanPayment.frequency, "monthly");
assert.equal(autoLoanPayment.monthlyRecurringAmount, 425);
assert.equal(autoLoanPayment.annualizedAmount, 5100);
assert.equal(autoLoanPayment.oneTimeAmount, null);
assert.equal(autoLoanPayment.extraPayoffAmount, 50, "extra payoff should stay separate from required payment");
assert.equal(autoLoanPayment.metadata.extraPayoffTreatment, "deferred-separate-from-required-payment");
const hondaAccordPayment = generatedDebtPayments.find((expense) => expense.sourceDebtRecordId === "debt_honda_accord");
assert.ok(hondaAccordPayment, "legacy secondVehicleLoan should generate through Auto Loan compatibility");
assert.equal(hondaAccordPayment.sourceDebtTypeKey, "autoLoan");
assert.equal(hondaAccordPayment.typeKey, "autoLoanPayment");
assert.equal(hondaAccordPayment.label, "Auto Loan Payment \u2014 Honda Accord");
assert.equal(hondaAccordPayment.metadata.deprecatedOriginalTypeKey, "secondVehicleLoan");

const autoLeasePayment = generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "autoLease");
assert.ok(autoLeasePayment, "auto lease should generate a debt-payment expense fact even without a balance");
assert.equal(autoLeasePayment.label, "Auto Lease Payment");
assert.equal(autoLeasePayment.amount, 200);
assert.equal(autoLeasePayment.frequency, "biweekly");
assert.equal(Math.round(autoLeasePayment.monthlyRecurringAmount * 100) / 100, 433.33);
assert.equal(autoLeasePayment.annualizedAmount, 5200);
const modelYPayment = generatedDebtPayments.find((expense) => expense.sourceDebtRecordId === "debt_model_y");
assert.ok(modelYPayment, "legacy secondVehicleLease should generate through Auto Lease compatibility");
assert.equal(modelYPayment.sourceDebtTypeKey, "autoLease");
assert.equal(modelYPayment.typeKey, "autoLeasePayment");
assert.equal(modelYPayment.label, "Auto Lease Payment \u2014 Model Y");
assert.equal(modelYPayment.metadata.deprecatedOriginalTypeKey, "secondVehicleLease");

assert.equal(generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "creditCard").monthlyRecurringAmount, 25 * 52 / 12);
assert.equal(generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "personalLoan").monthlyRecurringAmount, 300);
assert.equal(generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "federalStudentLoan").monthlyRecurringAmount, 200);
assert.equal(generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "businessLoan").monthlyRecurringAmount, 200);

const oneTimeDebtPayment = generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "irsTaxDebt");
assert.equal(oneTimeDebtPayment.frequency, "oneTime");
assert.equal(oneTimeDebtPayment.monthlyRecurringAmount, null, "oneTime debt payments should not become recurring monthly");
assert.equal(oneTimeDebtPayment.annualizedAmount, null);
assert.equal(oneTimeDebtPayment.oneTimeAmount, 1000);

const otherFrequencyDebtPayment = generatedDebtPayments.find((expense) => expense.sourceDebtTypeKey === "medicalBill");
assert.equal(otherFrequencyDebtPayment.frequency, "other");
assert.equal(otherFrequencyDebtPayment.monthlyRecurringAmount, null, "other frequency should be an advisor-review data gap");
assert.equal(otherFrequencyDebtPayment.annualizedAmount, null);
assert.equal(otherFrequencyDebtPayment.oneTimeAmount, null);
assert.equal(otherFrequencyDebtPayment.metadata.confidence, "advisor-review-required");

assert.equal(
  debtPaymentExpenseFacts.expenses.some((expense) => expense.sourceDebtRecordId === "debt_invalid_payment"),
  false,
  "debt records without payment amounts should not generate payment expense facts"
);
assert.equal(debtPaymentExpenseFacts.totalsByBucket.debtPayment, undefined, "generated debt payments should not enter formula-facing category totals");
assert.equal(debtPaymentExpenseFacts.totalsByBucket.totalAnnualRecurringExpense, 5100, "formula-facing annual recurring total should include only the manual duplicate row");
assert.equal(debtPaymentExpenseFacts.totalsByBucket.totalOneTimeExpense, 45000, "formula-facing one-time total should exclude generated one-time debt payment");
assert.equal(debtPaymentExpenseFacts.totalsByBucket.totalAnnualCustomExpense, 5100);
assert.equal(Math.round(debtPaymentExpenseFacts.totalsByBucket.generatedDebtPaymentMonthlyRecurringExpense * 100) / 100, 2566.67);
assert.equal(debtPaymentExpenseFacts.totalsByBucket.generatedDebtPaymentAnnualRecurringExpense, 30800);
assert.equal(debtPaymentExpenseFacts.totalsByBucket.generatedDebtPaymentOneTimeExpense, 1000);

const debtPaymentWarningCodes = metadataWarningCodes(debtPaymentExpenseFacts);
assert.ok(debtPaymentWarningCodes.includes("debt-payment-frequency-review"));
assert.ok(debtPaymentWarningCodes.includes("manual-expense-possible-generated-debt-payment-duplicate"));
const manualAutoLoanPayment = findExpenseFact(debtPaymentExpenseFacts, "customExpenseRecord", "manual_auto_loan_payment");
assert.ok(manualAutoLoanPayment.metadata.possibleGeneratedDebtPaymentDuplicate, "manual duplicate should be flagged but preserved");
assert.equal(manualAutoLoanPayment.amount, 425, "manual duplicate should not be auto-zeroed");

const methodSettings = createMethodSettings(context, lensModel, analysisSettings);
const methodSettingsText = JSON.stringify(methodSettings);
assert.equal(methodSettingsText.includes("expenseFacts"), false, "method settings should not consume expenseFacts");
assert.equal(methodSettingsText.includes("totalsByBucket"), false, "method settings should not consume expenseFacts totals");
const repeatableMethodSettings = createMethodSettings(context, repeatableExpenseModel, analysisSettings);
const repeatableMethodSettingsText = JSON.stringify(repeatableMethodSettings);
assert.equal(repeatableMethodSettingsText.includes("expenseFacts"), false, "method settings should not consume repeatable expenseFacts");
assert.equal(repeatableMethodSettingsText.includes("totalsByBucket"), false, "method settings should not consume repeatable expenseFacts totals");
const debtPaymentMethodSettings = createMethodSettings(context, debtPaymentModel, analysisSettings);
const debtPaymentMethodSettingsText = JSON.stringify(debtPaymentMethodSettings);
assert.equal(debtPaymentMethodSettingsText.includes("expenseFacts"), false, "method settings should not consume generated debt-payment expenseFacts");
assert.equal(debtPaymentMethodSettingsText.includes("generatedDebtPayment"), false, "method settings should not consume generated debt-payment totals");

const modelWithoutExpenseFacts = cloneJson(lensModel);
delete modelWithoutExpenseFacts.expenseFacts;
if (modelWithoutExpenseFacts.normalizationMetadata) {
  delete modelWithoutExpenseFacts.normalizationMetadata.expenseFacts;
}

const outputWithExpenseFacts = runMethodSnapshot(context, lensModel, methodSettings);
const outputWithoutExpenseFacts = runMethodSnapshot(context, modelWithoutExpenseFacts, methodSettings);
assert.deepEqual(
  cloneJson(outputWithExpenseFacts.dime),
  cloneJson(outputWithoutExpenseFacts.dime),
  "DIME should remain unchanged when expenseFacts is removed"
);
assert.deepEqual(
  cloneJson(outputWithExpenseFacts.hlv),
  cloneJson(outputWithoutExpenseFacts.hlv),
  "HLV should remain unchanged when expenseFacts is removed"
);
assert.equal(
  outputWithExpenseFacts.needs.components.finalExpenses,
  outputWithoutExpenseFacts.needs.components.finalExpenses,
  "Scalar expenseFacts and finalExpenses fallback should produce the same Needs final expense when their scalar values match"
);
assert.ok(
  outputWithExpenseFacts.needs.components.finalExpenses > lensModel.finalExpenses.totalFinalExpenseNeed,
  "final expense inflation should still apply from scalar expenseFacts"
);
assert.equal(
  outputWithExpenseFacts.needs.finalExpensesTrace.inputs.sourceMode,
  "expenseFacts-final-expense-components",
  "Needs final expense trace should source expenseFacts final expense components when available"
);
assert.equal(
  outputWithoutExpenseFacts.needs.finalExpensesTrace.inputs.sourceMode,
  "finalExpenses-fallback",
  "Needs final expense trace should fall back to finalExpenses when expenseFacts are unavailable"
);

const outputWithRepeatableExpenseFacts = runMethodSnapshot(context, repeatableExpenseModel, repeatableMethodSettings);
const debtPaymentModelWithoutExpenseFacts = cloneJson(debtPaymentModel);
delete debtPaymentModelWithoutExpenseFacts.expenseFacts;
if (debtPaymentModelWithoutExpenseFacts.normalizationMetadata) {
  delete debtPaymentModelWithoutExpenseFacts.normalizationMetadata.expenseFacts;
}
const outputWithGeneratedDebtPaymentExpenseFacts = runMethodSnapshot(context, debtPaymentModel, debtPaymentMethodSettings);
const outputWithoutGeneratedDebtPaymentExpenseFacts = runMethodSnapshot(
  context,
  debtPaymentModelWithoutExpenseFacts,
  debtPaymentMethodSettings
);
assert.deepEqual(
  cloneJson(outputWithGeneratedDebtPaymentExpenseFacts.dime),
  cloneJson(outputWithoutGeneratedDebtPaymentExpenseFacts.dime),
  "DIME should remain unchanged when generated debt-payment expenseFacts are removed"
);
assert.deepEqual(
  cloneJson(outputWithGeneratedDebtPaymentExpenseFacts.hlv),
  cloneJson(outputWithoutGeneratedDebtPaymentExpenseFacts.hlv),
  "HLV should remain unchanged when generated debt-payment expenseFacts are removed"
);
assert.equal(
  outputWithGeneratedDebtPaymentExpenseFacts.needs.components.finalExpenses,
  outputWithoutGeneratedDebtPaymentExpenseFacts.needs.components.finalExpenses,
  "Generated debt-payment expenseFacts should not change Needs final expenses"
);
assert.deepEqual(
  cloneJson(outputWithRepeatableExpenseFacts.dime),
  cloneJson(outputWithExpenseFacts.dime),
  "DIME should remain unchanged when repeatable expenseFacts exist"
);
assert.deepEqual(
  cloneJson(outputWithRepeatableExpenseFacts.hlv),
  cloneJson(outputWithExpenseFacts.hlv),
  "HLV should remain unchanged when repeatable expenseFacts exist"
);
assert.ok(
  outputWithRepeatableExpenseFacts.needs.components.finalExpenses > outputWithExpenseFacts.needs.components.finalExpenses,
  "Repeatable final-expense component facts should now affect Needs final expenses through expenseFacts"
);
assert.equal(
  outputWithRepeatableExpenseFacts.needs.finalExpensesTrace.inputs.sourceMode,
  "expenseFacts-final-expense-components",
  "Needs final expense trace should source repeatable final-expense expenseFacts"
);

const continuationChangedSource = cloneJson(repeatableExpenseSource);
continuationChangedSource.expenseRecords.forEach((record, index) => {
  record.continuationStatus = index % 2 === 0 ? "continues" : "stops";
});
const continuationChangedModel = buildModel(context, continuationChangedSource, analysisSettings).lensModel;
const continuationChangedMethodSettings = createMethodSettings(context, continuationChangedModel, analysisSettings);
const continuationChangedSnapshot = runMethodSnapshot(context, continuationChangedModel, continuationChangedMethodSettings);
assert.deepEqual(
  cloneJson(continuationChangedSnapshot),
  cloneJson(outputWithRepeatableExpenseFacts),
  "Changing expense continuationStatus metadata should not change current DIME, Needs, or HLV outputs"
);

const healthcareExpenseEnabledSettings = createAnalysisSettings({
  analysisSettings: {
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 10,
      includeOneTimeHealthcareExpenses: false,
      oneTimeProjectionMode: "currentDollarOnly",
      source: "expense-facts-normalization-check"
    }
  }
});
const healthcareExpenseEnabledModel = buildModel(context, repeatableExpenseSource, healthcareExpenseEnabledSettings).lensModel;
const healthcareContinuationChangedModel = buildModel(context, continuationChangedSource, healthcareExpenseEnabledSettings).lensModel;
const healthcareExpenseEnabledSnapshot = runMethodSnapshot(
  context,
  healthcareExpenseEnabledModel,
  createMethodSettings(context, healthcareExpenseEnabledModel, healthcareExpenseEnabledSettings)
);
const healthcareContinuationChangedSnapshot = runMethodSnapshot(
  context,
  healthcareContinuationChangedModel,
  createMethodSettings(context, healthcareContinuationChangedModel, healthcareExpenseEnabledSettings)
);
assert.equal(
  healthcareContinuationChangedSnapshot.needs.components.healthcareExpenses,
  healthcareExpenseEnabledSnapshot.needs.components.healthcareExpenses,
  "Current healthcareExpenses behavior should not filter or recalculate based on continuationStatus metadata"
);
assert.deepEqual(cloneJson(healthcareContinuationChangedSnapshot.dime), cloneJson(healthcareExpenseEnabledSnapshot.dime));
assert.deepEqual(cloneJson(healthcareContinuationChangedSnapshot.hlv), cloneJson(healthcareExpenseEnabledSnapshot.hlv));

const lowHealthcareSettings = createAnalysisSettings({
  inflationAssumptions: {
    healthcareInflationRatePercent: 1
  }
});
const highHealthcareSettings = createAnalysisSettings({
  inflationAssumptions: {
    healthcareInflationRatePercent: 12
  }
});
const lowHealthcareModel = buildModel(context, sourceData, lowHealthcareSettings).lensModel;
const highHealthcareModel = buildModel(context, sourceData, highHealthcareSettings).lensModel;
const lowHealthcareSnapshot = runMethodSnapshot(context, lowHealthcareModel, createMethodSettings(context, lowHealthcareModel, lowHealthcareSettings));
const highHealthcareSnapshot = runMethodSnapshot(context, highHealthcareModel, createMethodSettings(context, highHealthcareModel, highHealthcareSettings));
assert.ok(
  highHealthcareSnapshot.needs.components.finalExpenses > lowHealthcareSnapshot.needs.components.finalExpenses,
  "healthcare inflation should affect current Needs medical final expense"
);
assert.deepEqual(cloneJson(highHealthcareSnapshot.dime), cloneJson(lowHealthcareSnapshot.dime));
assert.deepEqual(cloneJson(highHealthcareSnapshot.hlv), cloneJson(lowHealthcareSnapshot.hlv));
const lowHealthcareRepeatableModel = buildModel(context, repeatableExpenseSource, lowHealthcareSettings).lensModel;
const highHealthcareRepeatableModel = buildModel(context, repeatableExpenseSource, highHealthcareSettings).lensModel;
const lowHealthcareRepeatableSnapshot = runMethodSnapshot(
  context,
  lowHealthcareRepeatableModel,
  createMethodSettings(context, lowHealthcareRepeatableModel, lowHealthcareSettings)
);
const highHealthcareRepeatableSnapshot = runMethodSnapshot(
  context,
  highHealthcareRepeatableModel,
  createMethodSettings(context, highHealthcareRepeatableModel, highHealthcareSettings)
);
assert.ok(
  highHealthcareRepeatableSnapshot.needs.components.finalExpenses > lowHealthcareRepeatableSnapshot.needs.components.finalExpenses,
  "healthcare inflation should affect healthcare-sensitive final-expense components"
);
assert.deepEqual(cloneJson(highHealthcareRepeatableSnapshot.dime), cloneJson(lowHealthcareRepeatableSnapshot.dime));
assert.deepEqual(cloneJson(highHealthcareRepeatableSnapshot.hlv), cloneJson(lowHealthcareRepeatableSnapshot.hlv));

[
  "pages/analysis-estimate.html",
  "pages/income-loss-impact.html",
  "pages/next-step.html",
  "pages/confidential-inputs.html"
].forEach((pagePath) => {
  const sources = scriptSources(pagePath);
  assertScriptBefore(sources, "expense-taxonomy.js", "normalize-lens-model.js", pagePath);
  assertScriptBefore(sources, "expense-library.js", "normalize-lens-model.js", pagePath);
});

console.log("expense-facts-normalization-check passed");
