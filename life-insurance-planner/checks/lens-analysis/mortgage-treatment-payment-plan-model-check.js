#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { isAllowedAnalysisSetupStyleFoundationDiff } = require("./analysis-setup-style-guard-utils");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext(options = {}) {
  const includeMethods = options.includeMethods === true;
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
    ...(includeMethods ? ["app/features/lens-analysis/analysis-methods.js"] : [])
  ].forEach((relativePath) => loadScript(context, relativePath));

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function monthlyPayment(principal, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 1200;
  return Math.round((principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)))) * 100) / 100;
}

function createSourceData(overrides = {}) {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    housingStatus: "Homeowner",
    mortgageBalance: 300000,
    monthlyMortgagePaymentOnly: 1800,
    mortgageTermRemainingYears: 30,
    mortgageTermRemainingMonths: 0,
    mortgageInterestRate: 6,
    calculatedMonthlyMortgagePayment: 4200,
    monthlyNonHousingEssentialExpenses: 3500,
    totalDebtPayoffNeedManualOverride: false,
    debtRecords: [
      {
        debtId: "credit-card-record",
        categoryKey: "unsecuredConsumerDebt",
        typeKey: "creditCard",
        label: "Credit Card",
        currentBalance: 10000,
        metadata: {
          sourceType: "user-input",
          source: "debt-library",
          libraryEntryKey: "creditCard"
        }
      }
    ],
    ...overrides
  };
}

function createDebtCategoryTreatment(overrides = {}) {
  const keys = [
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
  ];

  return keys.reduce((result, key) => {
    result[key] = {
      include: true,
      mode: "payoff",
      payoffPercent: 100,
      ...(overrides[key] || {})
    };
    return result;
  }, {});
}

function createAnalysisSettings(mortgageTreatment, overrides = {}) {
  return {
    valuationDate: "2026-05-14",
    debtTreatmentAssumptions: {
      schemaVersion: 2,
      enabled: true,
      globalTreatmentProfile: "custom",
      mortgageTreatment: {
        include: true,
        mode: "support",
        payoffPercent: 0,
        paymentSupportYears: null,
        ...mortgageTreatment
      },
      debtCategoryTreatment: createDebtCategoryTreatment(),
      source: "mortgage-treatment-payment-plan-model-check"
    },
    ...overrides
  };
}

function createProfileRecord(analysisSettings) {
  return {
    id: "mortgage-treatment-payment-plan-model-profile",
    caseRef: "CL/99020",
    displayName: "Mortgage Treatment Payment Plan Model",
    analysisSettings,
    coveragePolicies: []
  };
}

function buildModel(context, options = {}) {
  const analysisSettings = options.analysisSettings || createAnalysisSettings();
  const sourceData = options.sourceData || createSourceData();
  const profileRecord = options.profileRecord || createProfileRecord(analysisSettings);

  const result = context.LensApp.lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord
  });

  assert.ok(result.lensModel, "Lens model should build.");
  return result.lensModel;
}

function warningCodes(output) {
  return Array.isArray(output?.warnings) ? output.warnings.map((warning) => warning.code) : [];
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 0.01, message || `Expected ${actual} to be within 0.01 of ${expected}.`);
}

function getGitDiff(relativePath) {
  return execFileSync("git", ["diff", "--", `./${relativePath}`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function isAllowedIncomeImpactTreatedSupportConsumption() {
  const diff = getGitDiff("app/features/lens-analysis/income-impact-scenario-composer-calculations.js");
  return diff.includes("resolveIncomeImpactOngoingSupportBasis")
    && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
    && diff.includes("treatedMortgagePaymentPlan.finalMonthlyMortgagePayment")
    && diff.includes("riskOnlyObligation: true")
    && diff.includes("cashFlowIncluded: false");
}

function isAllowedStepThreeTreatedSupportDisplay() {
  const diff = getGitDiff("app/features/lens-analysis/step-three-analysis-display.js");
  return diff.includes("renderNeedsTreatedOngoingSupportDetails")
    && diff.includes("Mortgage treatment applied to support need")
    && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
    && diff.includes("Treated support unavailable; raw ongoing support was used");
}

function isAllowedAnalysisSetupMortgageTreatmentUi() {
  const diff = getGitDiff("pages/analysis-setup.html");
  const html = readRepoFile("pages/analysis-setup.html");
  const redesignDiff = diff.includes("Continue Payments")
    && diff.includes("Mortgage treatment changes the mortgage-only payment")
    && diff.includes("data-analysis-debt-mortgage-partial-payoff-row")
    && diff.includes("data-analysis-debt-mortgage-manual-years-row")
    && diff.includes("data-analysis-debt-mortgage-legacy-include-row")
    && diff.includes("Legacy payment support years");
  const legacyCleanupDiff = diff.includes("-                      <label class=\"analysis-setup-debt-switch\" data-analysis-debt-mortgage-legacy-include-row hidden>")
    && diff.includes("-                        <span>Include mortgage payoff</span>")
    && diff.includes("-                      <label class=\"analysis-setup-debt-years\" for=\"analysis-setup-mortgage-support-years\" data-analysis-debt-support-years-row hidden>")
    && diff.includes("-                        <span>Legacy payment support years</span>")
    && !diff.includes("+                      <label class=\"analysis-setup-debt-switch\" data-analysis-debt-mortgage-legacy-include-row hidden>")
    && !diff.includes("+                      <label class=\"analysis-setup-debt-years\" for=\"analysis-setup-mortgage-support-years\" data-analysis-debt-support-years-row hidden>");
  const previewDiff = diff.includes("debt-treatment-calculations.js")
    && diff.includes("Mortgage payment preview")
    && diff.includes("data-analysis-debt-mortgage-payment-plan-preview")
    && diff.includes("data-analysis-debt-mortgage-plan-payment")
    && diff.includes("Mortgage-only payment is treated");
  const debtRecordTableHeaderDiff = diff.includes("-                      <span role=\"columnheader\">Source balance</span>")
    && diff.includes("+                      <span role=\"columnheader\">Balance / payment</span>");
  const assumptionControlsScrollContractDiff = diff.includes("-                <div class=\"analysis-setup-panel-grid\" data-analysis-setup-view-grid data-analysis-setup-current-view=\"calculation\">")
    && diff.includes("+                <div class=\"analysis-setup-panel-grid\" data-analysis-setup-view-grid>")
    && diff.includes("data-analysis-setup-view-tab")
    && diff.includes("data-analysis-setup-view-panel")
    && diff.includes("data-analysis-setup-scroll-target=\"calculation-inclusion\"");
  const assumptionControlsFontImportDiff = diff.includes("family=Montserrat:wght@500;600;700")
    && diff.includes("family=Inter:wght@300;400;500;600;700")
    && diff.includes("Plus+Jakarta+Sans");
  const assetProjectionControlsRemovalDiff = diff.includes("-                          <span class=\"settings-toggle-label\">Use Projected Asset Offset in LENS</span>")
    && diff.includes("-                      <select id=\"analysis-setup-asset-growth-projection-mode\"")
    && diff.includes("-                      <input id=\"analysis-setup-asset-growth-projection-years\"")
    && !diff.includes("+                          <span class=\"settings-toggle-label\">Use Projected Asset Offset in LENS</span>")
    && !diff.includes("+                      <select id=\"analysis-setup-asset-growth-projection-mode\"")
    && !diff.includes("+                      <input id=\"analysis-setup-asset-growth-projection-years\"");
  const cashReserveCardStyleDiff = diff.includes("analysis-setup-control-group--cash-reserve")
    && diff.includes("analysis-setup-cash-reserve-head")
    && diff.includes("analysis-setup-cash-reserve-field-control")
    && diff.includes("data-analysis-cash-reserve-controls")
    && diff.includes("data-analysis-cash-reserve-exclude-emergency-fund");
  const existingCoverageCardStyleDiff = diff.includes("analysis-setup-control-group--coverage")
    && diff.includes("analysis-setup-coverage-head")
    && diff.includes("analysis-setup-coverage-row--switch")
    && diff.includes("analysis-setup-coverage-row--value")
    && diff.includes("data-analysis-coverage-field=\"groupCoverageTreatment.include\"")
    && diff.includes("data-analysis-coverage-field=\"individualTermTreatment.excludeIfExpiresWithinYears\"");
  const debtMortgageSeparateCardsDiff = diff.includes("+                  <section class=\"analysis-setup-control-group analysis-setup-debt-mortgage-card\"")
    && diff.includes("+                  <section class=\"analysis-setup-control-group analysis-setup-debt-record-card\"")
    && html.includes("id=\"analysis-setup-debt-record-treatment\"")
    && html.includes("class=\"analysis-setup-asset-defaults analysis-setup-debt-defaults\"")
    && html.includes("data-analysis-debt-mortgage-payment-plan-preview")
    && html.includes("data-analysis-debt-table")
    && html.includes("data-analysis-debt-profile=\"balanced\"");
  const survivorSupportSimplificationDiff = diff.includes("Survivor income used by LENS")
    && diff.includes("Saved future assumptions")
    && html.includes("data-analysis-survivor-field=\"survivorScenario.survivorContinuesWorking\"")
    && html.includes("data-analysis-survivor-field=\"survivorScenario.expectedSurvivorWorkReductionPercent\"")
    && html.includes("data-analysis-survivor-field=\"survivorScenario.survivorIncomeStartDelayMonths\"")
    && html.includes("data-analysis-survivor-field=\"survivorIncomeTreatment.applyStartDelay\"")
    && html.includes("data-analysis-survivor-field=\"supportTreatment.supportDurationYears\"")
    && html.includes("data-analysis-survivor-field=\"survivorIncomeTreatment.applyIncomeGrowth\"")
    && html.includes("data-analysis-survivor-field=\"survivorScenario.survivorEarnedIncomeGrowthRatePercent\"")
    && html.includes("data-analysis-survivor-field=\"survivorScenario.survivorRetirementHorizonYears\"")
    && html.includes("data-analysis-survivor-field=\"survivorIncomeTreatment.maxReliancePercent\"")
    && html.includes("data-analysis-survivor-field=\"riskFlags.flagHighSurvivorIncomeReliance\"")
    && html.includes("data-analysis-survivor-field=\"riskFlags.highRelianceThresholdPercent\"");
  return redesignDiff
    || previewDiff
    || legacyCleanupDiff
    || debtRecordTableHeaderDiff
    || assumptionControlsScrollContractDiff
    || assumptionControlsFontImportDiff
    || assetProjectionControlsRemovalDiff
    || cashReserveCardStyleDiff
    || existingCoverageCardStyleDiff
    || debtMortgageSeparateCardsDiff
    || survivorSupportSimplificationDiff;
}

function assertNoProtectedDiffs() {
  const protectedFiles = new Set([
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "pages/analysis-setup.html",
    "pages/income-loss-impact.html",
    "analysis-setup.js",
    "app.js",
    "styles.css"
  ]);
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map((line) => {
    return line.slice(3).trim().replace(/^life-insurance-planner\//, "");
  });
  const protectedDiffs = changedFiles.filter((filePath) => {
    if (!protectedFiles.has(filePath)) {
      return false;
    }
    if (filePath === "app/features/lens-analysis/income-impact-scenario-composer-calculations.js") {
      return !isAllowedIncomeImpactTreatedSupportConsumption();
    }
    if (filePath === "app/features/lens-analysis/step-three-analysis-display.js") {
      return !isAllowedStepThreeTreatedSupportDisplay();
    }
    if (filePath === "pages/analysis-setup.html") {
      return !isAllowedAnalysisSetupMortgageTreatmentUi();
    }
    if (filePath === "styles.css") {
      return !isAllowedAnalysisSetupStyleFoundationDiff(repoRoot, filePath);
    }
    return true;
  });

  assert.deepEqual(protectedDiffs, [], "Out-of-scope UI, display, helper, and app files should not change.");
}

function assertResultPagesLoadDebtHelperBeforeModelBuilder() {
  [
    "pages/analysis-estimate.html",
    "pages/dime-results.html",
    "pages/hlv-results.html",
    "pages/income-loss-impact.html",
    "pages/simple-needs-results.html"
  ].forEach((relativePath) => {
    const html = readRepoFile(relativePath);
    const debtHelperIndex = html.indexOf("debt-treatment-calculations.js");
    const modelBuilderIndex = html.indexOf("lens-model-builder.js");

    assert.ok(debtHelperIndex >= 0, `${relativePath} should load debt-treatment-calculations.js.`);
    assert.ok(modelBuilderIndex >= 0, `${relativePath} should load lens-model-builder.js.`);
    assert.ok(
      debtHelperIndex < modelBuilderIndex,
      `${relativePath} should load debt-treatment-calculations.js before lens-model-builder.js.`
    );
  });
}

const context = createContext({ includeMethods: true });
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.calculateTreatedMortgagePaymentPlan, "function");
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assertResultPagesLoadDebtHelperBeforeModelBuilder();

const payoffAnalysisSettings = createAnalysisSettings({ mode: "payoff", payoffPercent: 100 });
const payoffSourceData = createSourceData();
const payoffSourceDataBefore = cloneJson(payoffSourceData);
const payoffAnalysisSettingsBefore = cloneJson(payoffAnalysisSettings);
const payoffModel = buildModel(context, {
  sourceData: payoffSourceData,
  analysisSettings: payoffAnalysisSettings,
  profileRecord: createProfileRecord(payoffAnalysisSettings)
});
const payoffPlan = payoffModel.treatedMortgagePaymentPlan;

assert.deepEqual(payoffSourceData, payoffSourceDataBefore, "Model builder must not mutate source data.");
assert.deepEqual(payoffAnalysisSettings, payoffAnalysisSettingsBefore, "Model builder must not mutate analysis settings.");
assert.ok(payoffPlan, "Lens model should attach treatedMortgagePaymentPlan.");
assert.equal(payoffPlan.version, "treated-mortgage-payment-plan-v1");
assert.equal(payoffPlan.mode, "payOff");
assert.equal(payoffPlan.originalBalance, 300000);
assert.equal(payoffPlan.immediatePayoffAmount, 300000);
assert.equal(payoffPlan.remainingPrincipalAfterPayoff, 0);
assert.equal(payoffPlan.finalMonthlyMortgagePayment, 0);
assert.equal(payoffPlan.finalRemainingTermMonths, 0);
assert.equal(payoffPlan.mortgagePaymentRemovedFromNeeds, true);
assert.equal(payoffPlan.associatedHousingCostsPreserved, true);
assert.equal(payoffPlan.metadata.consumedByMethods, false);
assert.equal(payoffPlan.metadata.formulaActive, false);
assert.deepEqual(cloneJson(payoffPlan.metadata.preparedFor), [
  "lens-result",
  "income-impact",
  "survivor-needs-accounting"
]);

const continueAnalysisSettings = createAnalysisSettings({ mode: "support", payoffPercent: 25 });
const continueModel = buildModel(context, {
  sourceData: createSourceData(),
  analysisSettings: continueAnalysisSettings,
  profileRecord: createProfileRecord(continueAnalysisSettings)
});
const continuePlan = continueModel.treatedMortgagePaymentPlan;

assert.equal(continuePlan.mode, "continuePayments");
assert.equal(continuePlan.immediatePayoffAmount, 75000);
assert.equal(continuePlan.remainingPrincipalAfterPayoff, 225000);
assert.equal(continuePlan.finalRemainingTermMonths, 360);
assert.equal(continuePlan.yearsRemainingSource, "pmiCalculated");
assert.equal(continuePlan.paymentSource, "calculatedAmortization");
assert.equal(continuePlan.finalMonthlyMortgagePayment, monthlyPayment(225000, 6, 360));
assert.ok(
  continuePlan.finalMonthlyMortgagePayment < monthlyPayment(300000, 6, 360),
  "Partial payoff should lower the model-exposed final mortgage-only payment."
);
assert.equal(
  continuePlan.trace.sourcePaths.includes("mortgageTreatment.manualYearsRemainingOverride"),
  false,
  "Model builder should not invent a manual years override when no saved field exists."
);

const missingInterestModel = buildModel(context, {
  sourceData: createSourceData({ mortgageInterestRate: null }),
  analysisSettings: createAnalysisSettings({ mode: "support", payoffPercent: 0 }),
  profileRecord: createProfileRecord(createAnalysisSettings({ mode: "support", payoffPercent: 0 }))
});
const missingInterestPlan = missingInterestModel.treatedMortgagePaymentPlan;

assert.equal(missingInterestPlan.paymentSource, "straightLineFallback");
assert.match(warningCodes(missingInterestPlan).join(" "), /mortgage-payment-plan-interest-rate-fallback/);

const mortgageOnlyGuardModel = buildModel(context, {
  sourceData: createSourceData({
    monthlyMortgagePaymentOnly: 1800,
    monthlyMortgagePaymentOnlyManualOverride: true,
    calculatedMonthlyMortgagePayment: 999999,
    calculatedMonthlyMortgagePaymentManualOverride: true
  }),
  analysisSettings: createAnalysisSettings({ mode: "support", payoffPercent: 0 }),
  profileRecord: createProfileRecord(createAnalysisSettings({ mode: "support", payoffPercent: 0 }))
});
const mortgageOnlyGuardPlan = mortgageOnlyGuardModel.treatedMortgagePaymentPlan;

assertClose(
  mortgageOnlyGuardPlan.originalMonthlyMortgagePayment,
  1800,
  "Model builder should use the mortgage-only payment instead of the total housing burden."
);
assert.equal(mortgageOnlyGuardPlan.mortgagePaymentAlreadyInNeeds, true);
assert.notEqual(mortgageOnlyGuardPlan.originalMonthlyMortgagePayment, 999999);
assert.equal(mortgageOnlyGuardPlan.trace.calculationInputs.ignoredHousingSupportCost, 999999);
assert.equal(mortgageOnlyGuardPlan.associatedHousingCostsPreserved, true);

const missingPrincipalModel = buildModel(context, {
  sourceData: createSourceData({ mortgageBalance: null }),
  analysisSettings: createAnalysisSettings({ mode: "support", payoffPercent: 0 }),
  profileRecord: createProfileRecord(createAnalysisSettings({ mode: "support", payoffPercent: 0 }))
});
const missingPrincipalPlan = missingPrincipalModel.treatedMortgagePaymentPlan;

assert.equal(missingPrincipalPlan.mode, "unavailable");
assert.match(warningCodes(missingPrincipalPlan).join(" "), /mortgage-payment-plan-principal-unavailable/);

assert.ok(continueModel.treatedDebtPayoff, "Existing treatedDebtPayoff should still be prepared.");
assert.equal(continueModel.treatedDebtPayoff.metadata.consumedByMethods, true);
assert.equal(continueModel.treatedDebtPayoff.metadata.methodConsumption.dime, true);
assert.equal(continueModel.treatedDebtPayoff.metadata.methodConsumption.needs, true);
assert.equal(continueModel.treatedDebtPayoff.metadata.methodConsumption.hlv, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(continueModel.treatedDebtPayoff, "treatedMortgagePaymentPlan"),
  false,
  "New mortgage payment plan contract should not be nested into existing treatedDebtPayoff."
);

const methodResults = lensAnalysis.analysisMethods.runAnalysisMethods(continueModel, {
  includeExistingCoverageOffset: false,
  includeOffsetAssets: false,
  includeEducationFunding: false,
  includeProjectedDependents: false,
  includeSurvivorIncomeOffset: false,
  includeEssentialSupport: true,
  includeTransitionNeeds: false,
  includeDiscretionarySupport: false
});
assert.equal(methodResults.dime.components.mortgage, continueModel.treatedDebtPayoff.dime.mortgageAmount);
assert.equal(methodResults.dime.components.debt, continueModel.treatedDebtPayoff.dime.nonMortgageDebtAmount);
assert.equal(methodResults.needsAnalysis.components.debtPayoff, continueModel.treatedDebtPayoff.needs.debtPayoffAmount);
assert.equal(
  methodResults.needsAnalysis.components.debtPayoff,
  310000,
  "Needs should still consume existing treatedDebtPayoff, not the new payment-plan contract."
);
assert.equal(methodResults.humanLifeValue.assumptions.survivorIncomeApplied, false);

assertNoProtectedDiffs();

console.log("mortgage-treatment-payment-plan-model-check passed");
