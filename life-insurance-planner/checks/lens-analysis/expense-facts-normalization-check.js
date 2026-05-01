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
assert.equal(expenseFacts.metadata.acceptedScalarExpenseCount, 4);
assert.equal(expenseFacts.metadata.acceptedExpenseRecordCount, 0);
assert.equal(expenseFacts.metadata.invalidExpenseRecordCount, 0);
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
assert.equal(expenseFacts.totalsByBucket.totalFinalExpense, 45000);
assert.equal(expenseFacts.totalsByBucket.totalFinalExpense, lensModel.finalExpenses.totalFinalExpenseNeed);
assert.equal(expenseFacts.totalsByBucket.totalNonMedicalFinalExpense, 30000);
assert.equal(expenseFacts.totalsByBucket.totalHealthcareSensitiveExpense, 15000);
assert.equal(expenseFacts.totalsByBucket.totalHealthcareExpense, 15000);

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

const methodSettings = createMethodSettings(context, lensModel, analysisSettings);
const methodSettingsText = JSON.stringify(methodSettings);
assert.equal(methodSettingsText.includes("expenseFacts"), false, "method settings should not consume expenseFacts");
assert.equal(methodSettingsText.includes("totalsByBucket"), false, "method settings should not consume expenseFacts totals");

const modelWithoutExpenseFacts = cloneJson(lensModel);
delete modelWithoutExpenseFacts.expenseFacts;
if (modelWithoutExpenseFacts.normalizationMetadata) {
  delete modelWithoutExpenseFacts.normalizationMetadata.expenseFacts;
}

const outputWithExpenseFacts = runMethodSnapshot(context, lensModel, methodSettings);
const outputWithoutExpenseFacts = runMethodSnapshot(context, modelWithoutExpenseFacts, methodSettings);
assert.deepEqual(
  cloneJson(outputWithExpenseFacts),
  cloneJson(outputWithoutExpenseFacts),
  "DIME, Needs, HLV, and final expense inflation trace should remain unchanged when expenseFacts is removed"
);
assert.ok(
  outputWithExpenseFacts.needs.components.finalExpenses > lensModel.finalExpenses.totalFinalExpenseNeed,
  "final expense inflation should still apply from existing finalExpenses behavior"
);
assert.ok(
  JSON.stringify(outputWithExpenseFacts.needs.finalExpensesTrace).includes("finalExpenses.totalFinalExpenseNeed"),
  "Needs final expense trace should remain sourced from finalExpenses"
);
assert.equal(
  JSON.stringify(outputWithExpenseFacts.needs.finalExpensesTrace).includes("expenseFacts"),
  false,
  "Needs final expense trace should not source expenseFacts in this pass"
);

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
assert.deepEqual(
  cloneJson(runMethodSnapshot(context, lowHealthcareModel, createMethodSettings(context, lowHealthcareModel, lowHealthcareSettings))),
  cloneJson(runMethodSnapshot(context, highHealthcareModel, createMethodSettings(context, highHealthcareModel, highHealthcareSettings))),
  "healthcare inflation should remain inactive for current DIME, Needs, and HLV outputs"
);

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
