#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const pagePath = "pages/income-loss-impact.html";
const debtTreatmentScript = "../app/features/lens-analysis/debt-treatment-calculations.js";
const modelBuilderScript = "../app/features/lens-analysis/lens-model-builder.js";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function toRepoRelativeScriptPath(scriptSource) {
  return scriptSource.replace(/^\.\.\//, "");
}

function createContext() {
  const context = {
    console,
    Intl,
    URL,
    URLSearchParams,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadIncomeImpactRuntime(options = {}) {
  const excludedScripts = new Set(options.excludedScripts || []);
  const context = createContext();
  getScriptSources(readRepoFile(pagePath))
    .map(toRepoRelativeScriptPath)
    .filter(function (relativePath) {
      return [
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
        "app/features/lens-analysis/asset-growth-projection-calculations.js",
        "app/features/lens-analysis/cash-reserve-calculations.js",
        "app/features/lens-analysis/debt-treatment-calculations.js",
        "app/features/lens-analysis/lens-model-builder.js",
        "app/features/lens-analysis/income-impact-warning-events-library.js",
        "app/features/lens-analysis/income-loss-impact-timeline-calculations.js"
      ].includes(relativePath) && !excludedScripts.has(relativePath);
    })
    .forEach(function (relativePath) {
      loadScript(context, relativePath);
    });
  return context.LensApp.lensAnalysis;
}

function createDebtCategoryTreatment() {
  return [
    "realEstateSecuredDebt",
    "securedConsumerDebt",
    "unsecuredConsumerDebt",
    "educationDebt",
    "medicalDebt",
    "taxLegalDebt",
    "businessDebt",
    "privatePersonalDebt",
    "consumerFinanceDebt",
    "otherDebt"
  ].reduce(function (treatments, categoryKey) {
    treatments[categoryKey] = {
      include: true,
      mode: "payoff",
      payoffPercent: 100
    };
    return treatments;
  }, {});
}

function createSourceData() {
  return {
    grossAnnualIncome: 120000,
    spouseIncome: 45000,
    housingStatus: "Homeowner",
    monthlyHousingCost: 2500,
    mortgageBalance: 250000,
    monthlyMortgagePaymentOnly: 2000,
    monthlyMortgagePaymentOnlyManualOverride: true,
    mortgageTermRemainingYears: 3,
    mortgageTermRemainingMonths: 0,
    calculatedMonthlyMortgagePayment: 2500,
    calculatedMonthlyMortgagePaymentManualOverride: true,
    insuranceCost: 500,
    healthcareOutOfPocketCost: 500,
    foodCost: 1200,
    transportationCost: 800,
    childcareDependentCareCost: 1000,
    phoneInternetCost: 200,
    householdSuppliesCost: 300,
    otherHouseholdExpenses: 500,
    cashSavings: 100000,
    cashSavingsIncludeInOffset: true,
    cashSavingsLiquidityType: "liquid",
    cashSavingsPercentAvailable: 100,
    funeralBurialEstimate: 25000,
    immediateLiquidityBuffer: 15000,
    creditCardDebt: 10000,
    autoLoans: 10000,
    studentLoans: 0,
    personalLoans: 0,
    taxLiabilities: 0,
    businessDebt: 0,
    otherLoanObligations: 0,
    otherRealEstateLoans: 0
  };
}

function createProfileRecord() {
  return {
    id: "income-impact-debt-treatment-load-check",
    dateOfBirth: "1980-06-15",
    coveragePolicies: [],
    analysisSettings: {
      valuationDate: "2026-01-01",
      debtTreatmentAssumptions: {
        enabled: true,
        globalTreatmentProfile: "custom",
        mortgageTreatment: {
          include: true,
          mode: "support",
          payoffPercent: 100,
          paymentSupportYears: 3
        },
        debtCategoryTreatment: createDebtCategoryTreatment(),
        source: "income-impact-debt-treatment-load-check"
      }
    }
  };
}

function buildRuntime(lensAnalysis) {
  const profileRecord = createProfileRecord();
  const builderResult = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    profileRecord,
    protectionModelingPayload: {
      data: createSourceData()
    },
    analysisSettings: profileRecord.analysisSettings,
    taxConfig: {
      federalTaxBrackets: []
    }
  });
  assert.ok(builderResult.lensModel, "Income Impact runtime path should build a Lens model.");
  return { profileRecord, lensModel: builderResult.lensModel };
}

function calculateFollow(lensAnalysis, runtime) {
  return lensAnalysis.calculateIncomeLossImpactTimeline({
    lensModel: runtime.lensModel,
    profileRecord: runtime.profileRecord,
    valuationDate: "2026-01-01",
    selectedDeathAge: 50,
    options: {
      scenario: {
        deathAge: 50,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions"
      }
    }
  });
}

const incomeImpactHtml = readRepoFile(pagePath);
const scriptSources = getScriptSources(incomeImpactHtml);
const debtTreatmentIndex = scriptSources.indexOf(debtTreatmentScript);
const modelBuilderIndex = scriptSources.indexOf(modelBuilderScript);

assert.ok(debtTreatmentIndex >= 0, "Income Impact should load debt-treatment-calculations.js.");
assert.ok(modelBuilderIndex >= 0, "Income Impact should load lens-model-builder.js.");
assert.ok(
  debtTreatmentIndex < modelBuilderIndex,
  "Income Impact should load debt-treatment-calculations.js before lens-model-builder.js."
);

const lensAnalysis = loadIncomeImpactRuntime();
assert.equal(
  typeof lensAnalysis.calculateDebtTreatment,
  "function",
  "Income Impact page script stack should make calculateDebtTreatment available."
);

const runtime = buildRuntime(lensAnalysis);
assert.notDeepEqual(
  (runtime.lensModel.treatedDebtPayoff?.warnings || []).map(function (warning) { return warning.code; }),
  ["missing-debt-treatment-helper"],
  "Prepared treatedDebtPayoff should not report missing-debt-treatment-helper when the helper is loaded."
);
assert.equal(runtime.lensModel.treatedDebtPayoff?.needs?.debtPayoffAmount, 92000);
assert.equal(runtime.lensModel.treatedDebtPayoff?.needs?.mortgagePayoffAmount, 72000);
assert.equal(runtime.lensModel.treatedDebtPayoff?.needs?.nonMortgageDebtAmount, 20000);
assert.equal(
  runtime.lensModel.treatedDebtPayoff?.debts?.find(function (debt) { return debt.isMortgage === true; })?.mortgageTreatmentMode,
  "support",
  "Prepared treatedDebtPayoff should trace support-mode mortgage treatment."
);

const followOutput = calculateFollow(lensAnalysis, runtime);
assert.equal(followOutput.financialRunway.mortgageTreatment.override, "followAssumptions");
assert.equal(followOutput.financialRunway.mortgageTreatment.assumptionTreatment, "mortgageSupport");
assert.equal(followOutput.financialRunway.mortgageTreatment.scheduledMonthlyPayment, 2000);
assert.equal(followOutput.financialRunway.mortgageTreatment.scheduledTermMonths, 36);
assert.equal(followOutput.financialRunway.scheduledObligations.value, 24000);
assert.ok(
  followOutput.financialRunway.projectionPoints.some(function (point) {
    return point.scheduledObligations > 0;
  }),
  "followAssumptions should schedule mortgage obligations when prepared support mode is active."
);
assert.ok(
  followOutput.scenarioTimeline.eventLanes.housing.some(function (event) {
    return event.type === "mortgagePaymentsContinue" && event.status === "assumption-controls";
  }),
  "followAssumptions should add an assumption-controls mortgagePaymentsContinue housing event."
);
assert.equal(
  followOutput.financialRunway.inputs.immediateObligations.debtPayoff.value,
  20000,
  "followAssumptions should not double-count the prepared support mortgage as an immediate payoff."
);

const fallbackLensAnalysis = loadIncomeImpactRuntime({
  excludedScripts: ["app/features/lens-analysis/debt-treatment-calculations.js"]
});
assert.equal(
  typeof fallbackLensAnalysis.calculateDebtTreatment,
  "undefined",
  "Fallback fixture should simulate the helper being absent."
);
const fallbackRuntime = buildRuntime(fallbackLensAnalysis);
assert.ok(
  (fallbackRuntime.lensModel.treatedDebtPayoff?.warnings || []).some(function (warning) {
    return warning.code === "missing-debt-treatment-helper";
  }),
  "Missing helper should still produce the existing prepared-debt warning."
);
const fallbackFollowOutput = calculateFollow(fallbackLensAnalysis, fallbackRuntime);
assert.equal(fallbackFollowOutput.financialRunway.mortgageTreatment.assumptionTreatment, null);
assert.equal(fallbackFollowOutput.financialRunway.scheduledObligations.value, 0);
assert.equal(
  fallbackFollowOutput.financialRunway.inputs.immediateObligations.debtPayoff.sourcePath,
  "debtPayoff.totalDebtPayoffNeed",
  "Raw debt fallback should remain available when treated debt prep is unavailable."
);

console.log("income-loss-impact-debt-treatment-load-check passed");
