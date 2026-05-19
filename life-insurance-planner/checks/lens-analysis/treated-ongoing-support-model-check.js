#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  isAllowedAnalysisSetupEducationDescriptionRemovalDiff,
  isAllowedAnalysisSetupStyleFoundationDiff
} = require("./analysis-setup-style-guard-utils");

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

function createSourceData(overrides = {}) {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    housingStatus: "Homeowner",
    mortgageBalance: 300000,
    monthlyMortgagePaymentOnly: 1800,
    monthlyMortgagePaymentOnlyManualOverride: true,
    mortgageTermRemainingYears: 30,
    mortgageTermRemainingMonths: 0,
    mortgageInterestRate: 6,
    calculatedMonthlyMortgagePayment: 5000,
    calculatedMonthlyMortgagePaymentManualOverride: true,
    propertyTax: 500,
    housingInsuranceCost: 150,
    monthlyHoaCost: 100,
    utilitiesCost: 400,
    monthlyMaintenanceRecommendation: 250,
    monthlyMaintenanceRecommendationManualOverride: true,
    insuranceCost: 100,
    healthcareOutOfPocketCost: 200,
    foodCost: 800,
    transportationCost: 500,
    childcareDependentCareCost: 1000,
    phoneInternetCost: 200,
    householdSuppliesCost: 300,
    otherHouseholdExpenses: 400,
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
  ].reduce((result, key) => {
    result[key] = {
      include: true,
      mode: "payoff",
      payoffPercent: 100
    };
    return result;
  }, {});
}

function createAnalysisSettings(overrides = {}) {
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
        paymentSupportYears: null
      },
      debtCategoryTreatment: createDebtCategoryTreatment(),
      source: "treated-ongoing-support-model-check"
    },
    ...overrides
  };
}

function createProfileRecord(analysisSettings) {
  return {
    id: "treated-ongoing-support-model-profile",
    caseRef: "CL/99021",
    displayName: "Treated Ongoing Support Model",
    analysisSettings,
    coveragePolicies: []
  };
}

function installMortgagePaymentPlanStub(context, outputOverrides = {}) {
  context.LensApp.lensAnalysis.calculateTreatedMortgagePaymentPlan = function () {
    return {
      version: "treated-mortgage-payment-plan-v1",
      mode: "continuePayments",
      originalBalance: 300000,
      immediatePayoffAmount: 0,
      payoffPercent: 0,
      remainingPrincipalAfterPayoff: 300000,
      originalMonthlyMortgagePayment: 1800,
      finalMonthlyMortgagePayment: 1234.56,
      originalRemainingTermMonths: 360,
      finalRemainingTermMonths: 360,
      interestRatePercent: 6,
      yearsRemainingSource: "pmiCalculated",
      paymentSource: "calculatedAmortization",
      mortgagePaymentRemovedFromNeeds: false,
      mortgagePaymentAlreadyInNeeds: true,
      associatedHousingCostsPreserved: true,
      warnings: [],
      trace: {
        source: "stubbed-calculateTreatedMortgagePaymentPlan",
        sourcePaths: ["stub.finalMonthlyMortgagePayment"],
        calculationInputs: {}
      },
      ...outputOverrides
    };
  };
}

function buildModel(context, options = {}) {
  const sourceData = options.sourceData || createSourceData();
  const analysisSettings = options.analysisSettings || createAnalysisSettings();
  const result = context.LensApp.lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord: createProfileRecord(analysisSettings)
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

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function getGitDiff(relativePath) {
  return execFileSync("git", ["diff", "--", `./${relativePath}`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function isAllowedTreatedOngoingSupportMethodConsumption() {
  const diff = getGitDiff("app/features/lens-analysis/analysis-methods.js");
  return diff.includes("resolveMethodReadyOngoingSupport")
    && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
    && diff.includes("treated-ongoing-support-unavailable-for-method")
    && diff.includes("supportBasis: \"treatedOngoingSupport\"")
    && diff.includes("createSimpleNeedsEssentialSupportComponent")
    && diff.includes("methodLabel: \"LENS Needs\"");
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

function isAllowedIncomeLossImpactDisplayAnalysisSettingsBootstrap() {
  const diff = getGitDiff("app/features/lens-analysis/income-loss-impact-display.js");
  const source = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const analysisSettingsInsertions = (diff.match(/\+\s*analysisSettings,/g) || []).length;
  return diff.includes("const analysisSettings = resolveAnalysisSettings(profileRecord, { protectionModelingPayload });")
    && analysisSettingsInsertions >= 2
    && source.includes("const builderResult = buildLensModelFromSavedProtectionModeling(builderInput);")
    && source.includes("const builderInput = {")
    && source.includes("incomeImpactState = {")
    && source.includes("taxConfig: createSavedDataTaxConfig()");
}

function isAllowedIncomeLossImpactSurvivorIncomeDiagnosticSnapshot() {
  const diff = getGitDiff("app/features/lens-analysis/income-loss-impact-display.js");
  const originalDiagnosticDiff = diff.includes("__MODEL90_INCOME_IMPACT_DEBUG__")
    && diff.includes("getSurvivorIncomeSnapshot")
    && diff.includes("getIncomeImpactSurvivorIncomeSnapshot")
    && diff.includes("buildSurvivorDiagnosticScenarioSummary")
    && diff.includes("survivorNetAnnualIncomePositive")
    && diff.includes("includedScenarioHasSurvivorIncomeAfterDelay")
    && diff.includes("includedExcludedDiffer")
    && diff.includes("graphLineValuesDiffer")
    && diff.includes("rawBaselinePointsAroundDelay")
    && diff.includes("rawBaselinePointsSample")
    && diff.includes("diagnosticPointWindowCoversSurvivorDelay")
    && diff.includes("comparisonScenarios")
    && diff.includes("resolveAnalysisSettingsSource")
    && diff.includes("analysisSettingsSource");
  const diagnosticDepthDiff = diff.includes("pickSurvivorDiagnosticPointWindow")
    && diff.includes("rawBaselinePointsAroundDelay")
    && diff.includes("rawBaselinePointsSample")
    && diff.includes("pointsAroundDepletion")
    && diff.includes("diagnosticPointWindowCoversSurvivorDelay")
    && diff.includes("comparisonScenarioIds")
    && diff.includes("comparisonScenarios");
  const diagnosticLifestyleComparisonDiff = diff.includes("getSurvivorDiagnosticComparisonScenarios")
    && diff.includes("lifestyleComparison")
    && diff.includes("lifestyleComparisonActive")
    && diff.includes("lifestyleComparisonHasSurvivorIncomeAfterDelay")
    && diff.includes("lifestyleComparisonLineDiffersFromPrimary")
    && diff.includes("netUseAfterDelay")
    && diff.includes("endingResourcesAfterDelay");
  const diagnosticLifestyleShapeDiff = diff.includes("lifestyleComparison: clonePlainValue(currentRendered.lifestyleComparison || { active: false })");
  return originalDiagnosticDiff || diagnosticDepthDiff || diagnosticLifestyleComparisonDiff || diagnosticLifestyleShapeDiff;
}

function isAllowedIncomeLossImpactLayoutFrameRendererConsumption() {
  const diff = getGitDiff("app/features/lens-analysis/income-loss-impact-display.js");
  return diff.includes("STABLE_GRAPH_LAYOUT_FRAME_MODE")
    && diff.includes("getStableGraphLayoutFrame")
    && diff.includes("getLayoutFrameXRatio")
    && diff.includes("getLayoutFrameYRatio")
    && diff.includes("layoutFrame.deathXRatio")
    && diff.includes("layoutFrame.zeroYRatio")
    && diff.includes("layoutFrame.runoutAnchorXRatio")
    && diff.includes("zeroCrossingAnchorMonth")
    && diff.includes("data-income-impact-layout-frame-mode");
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

function isAllowedAnalysisSetupTransitionPeriodAssumptionDiff() {
  const htmlDiff = getGitDiff("pages/analysis-setup.html");
  const analysisSetupDiff = getGitDiff("app/features/lens-analysis/analysis-setup.js");
  const savedShapeCheckDiff = getGitDiff("checks/lens-analysis/analysis-setup-debt-treatment-saved-shape-check.js");

  const htmlHasTransitionControl = htmlDiff.includes("Transition period after death")
    && htmlDiff.includes("data-analysis-survivor-field=\"supportTreatment.transitionPeriodMonths\"")
    && htmlDiff.includes("type=\"range\" min=\"0\" max=\"24\" step=\"1\" value=\"3\"")
    && htmlDiff.includes("data-analysis-survivor-transition-period-value>3 months</output>")
    && htmlDiff.includes("Time between death and the start of the long-term survivor runway")
    && htmlDiff.includes("Used for timeline framing in V1")
    && htmlDiff.includes("does not change death age/date")
    && htmlDiff.includes("model probate, claim processing, or asset liquidity mechanics");

  const analysisSetupHasSavedShape = analysisSetupDiff.includes("transitionPeriodMonths: 3")
    && analysisSetupDiff.includes("DEFAULT_SURVIVOR_TRANSITION_PERIOD_MONTHS = 3")
    && analysisSetupDiff.includes("MIN_SURVIVOR_TRANSITION_PERIOD_MONTHS = 0")
    && analysisSetupDiff.includes("MAX_SURVIVOR_TRANSITION_PERIOD_MONTHS = 24")
    && analysisSetupDiff.includes("normalizeSurvivorSupportTransitionPeriodMonths")
    && analysisSetupDiff.includes("formatSurvivorSupportTransitionPeriodMonths")
    && analysisSetupDiff.includes("supportTreatment.transitionPeriodMonths")
    && analysisSetupDiff.includes("readSurvivorSupportDraftTransitionPeriodMonths");

  const checkHasTransitionProof = savedShapeCheckDiff.includes("default transition period should be 3 months")
    && savedShapeCheckDiff.includes("0 months should be valid and mean no transition")
    && savedShapeCheckDiff.includes("24 months should be the valid max")
    && savedShapeCheckDiff.includes("Nonnumeric transition months should normalize to default")
    && savedShapeCheckDiff.includes("Blank transition months should normalize to default")
    && savedShapeCheckDiff.includes("supportTreatment.transitionPeriodMonths")
    && savedShapeCheckDiff.includes("does not change death age")
    && savedShapeCheckDiff.includes("model probate, claim processing, or asset liquidity mechanics");

  return htmlHasTransitionControl
    && analysisSetupHasSavedShape
    && checkHasTransitionProof;
}

function assertNoProtectedDiffs() {
  const protectedFiles = new Set([
    "app/features/lens-analysis/analysis-methods.js",
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
    if (filePath === "app/features/lens-analysis/analysis-methods.js") {
      return !isAllowedTreatedOngoingSupportMethodConsumption();
    }
    if (filePath === "app/features/lens-analysis/income-impact-scenario-composer-calculations.js") {
      return !isAllowedIncomeImpactTreatedSupportConsumption();
    }
    if (filePath === "app/features/lens-analysis/step-three-analysis-display.js") {
      return !isAllowedStepThreeTreatedSupportDisplay();
    }
    if (filePath === "app/features/lens-analysis/income-loss-impact-display.js") {
      return !(isAllowedIncomeLossImpactDisplayAnalysisSettingsBootstrap()
        || isAllowedIncomeLossImpactSurvivorIncomeDiagnosticSnapshot()
        || isAllowedIncomeLossImpactLayoutFrameRendererConsumption());
    }
    if (filePath === "pages/analysis-setup.html") {
      return !(isAllowedAnalysisSetupMortgageTreatmentUi()
        || isAllowedAnalysisSetupTransitionPeriodAssumptionDiff()
        || isAllowedAnalysisSetupEducationDescriptionRemovalDiff(repoRoot, filePath));
    }
    if (filePath === "styles.css") {
      return !isAllowedAnalysisSetupStyleFoundationDiff(repoRoot, filePath);
    }
    return true;
  });

  assert.deepEqual(protectedDiffs, [], "Out-of-scope method, UI, display, helper, page, and app files should not change.");
}

const context = createContext({ includeMethods: true });
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");

installMortgagePaymentPlanStub(context, {
  mode: "payOff",
  finalMonthlyMortgagePayment: 0,
  mortgagePaymentRemovedFromNeeds: true
});
const payoffSourceData = createSourceData();
const payoffSourceDataBefore = cloneJson(payoffSourceData);
const payoffAnalysisSettings = createAnalysisSettings();
const payoffAnalysisSettingsBefore = cloneJson(payoffAnalysisSettings);
const payoffModel = buildModel(context, {
  sourceData: payoffSourceData,
  analysisSettings: payoffAnalysisSettings
});
const payoffSupport = payoffModel.treatedOngoingSupport;

assert.deepEqual(payoffSourceData, payoffSourceDataBefore, "Model builder must not mutate source data.");
assert.deepEqual(payoffAnalysisSettings, payoffAnalysisSettingsBefore, "Model builder must not mutate analysis settings.");
assert.ok(payoffSupport, "Lens model should attach treatedOngoingSupport.");
assert.equal(payoffSupport.version, "treated-ongoing-support-v1");
assert.equal(payoffSupport.status, "ready");
assert.equal(payoffSupport.consumedByMethods, false);
assert.equal(payoffSupport.mortgageTreatmentConsumed, false);
assert.equal(payoffModel.ongoingSupport.monthlyMortgagePayment, 1800);
assert.equal(payoffModel.ongoingSupport.monthlyHousingSupportCost, 5000);
assert.equal(payoffModel.ongoingSupport.monthlyNonHousingEssentialSupportCost, 3500);
assert.equal(payoffModel.ongoingSupport.monthlyTotalEssentialSupportCost, 8500);
assert.equal(payoffModel.ongoingSupport.annualTotalEssentialSupportCost, 102000);
assert.equal(Object.prototype.hasOwnProperty.call(payoffModel.ongoingSupport, "treatedOngoingSupport"), false);
assert.equal(payoffSupport.original.monthlyMortgagePayment, 1800);
assert.equal(payoffSupport.original.monthlyHousingSupportCost, 5000);
assert.equal(payoffSupport.original.monthlyNonHousingEssentialSupportCost, 3500);
assert.equal(payoffSupport.mortgageAdjusted.monthlyMortgagePayment, 0);
assert.equal(payoffSupport.mortgageAdjusted.monthlyAssociatedHousingCost, 1400);
assert.equal(payoffSupport.mortgageAdjusted.monthlyHousingSupportCost, 1400);
assert.equal(payoffSupport.mortgageAdjusted.monthlyNonHousingEssentialSupportCost, 3500);
assert.equal(payoffSupport.mortgageAdjusted.monthlyTotalEssentialSupportCost, 4900);
assert.equal(payoffSupport.mortgageAdjusted.annualTotalEssentialSupportCost, 58800);
assert.equal(payoffSupport.associatedHousingCostsPreserved, true);
assert.equal(payoffSupport.trace.treatmentSource, "treatedMortgagePaymentPlan");
assert.equal(payoffSupport.trace.accountingSource, "lens-model-builder.treatedOngoingSupport");
assert.equal(payoffSupport.trace.mortgageTreatmentRecalculated, false);
assert.equal(payoffSupport.trace.finalMortgagePaymentSourcePath, "treatedMortgagePaymentPlan.finalMonthlyMortgagePayment");
assert.equal(payoffSupport.trace.associatedHousingCostSource, "granular-associated-housing-fields");
assert.equal(payoffSupport.trace.associatedHousingCostFallbackUsed, false);

installMortgagePaymentPlanStub(context, { finalMonthlyMortgagePayment: 1234.56 });
const continueModel = buildModel(context, {
  sourceData: createSourceData(),
  analysisSettings: createAnalysisSettings()
});
const continueSupport = continueModel.treatedOngoingSupport;

assert.equal(continueSupport.status, "ready");
assert.equal(continueSupport.mortgageAdjusted.monthlyMortgagePayment, 1234.56);
assert.equal(continueSupport.mortgageAdjusted.monthlyAssociatedHousingCost, 1400);
assertClose(continueSupport.mortgageAdjusted.monthlyHousingSupportCost, 2634.56);
assertClose(continueSupport.mortgageAdjusted.monthlyTotalEssentialSupportCost, 6134.56);
assertClose(continueSupport.mortgageAdjusted.annualTotalEssentialSupportCost, 73614.72);
assert.equal(continueSupport.trace.mortgageTreatmentRecalculated, false);

installMortgagePaymentPlanStub(context, { finalMonthlyMortgagePayment: 700 });
const changedPaymentModel = buildModel(context, {
  sourceData: createSourceData(),
  analysisSettings: createAnalysisSettings()
});

assert.equal(changedPaymentModel.treatedMortgagePaymentPlan.finalMonthlyMortgagePayment, 700);
assert.equal(changedPaymentModel.treatedOngoingSupport.mortgageAdjusted.monthlyMortgagePayment, 700);
assert.equal(changedPaymentModel.treatedOngoingSupport.mortgageAdjusted.monthlyHousingSupportCost, 2100);
assert.notEqual(
  changedPaymentModel.treatedOngoingSupport.mortgageAdjusted.monthlyHousingSupportCost,
  continueSupport.mortgageAdjusted.monthlyHousingSupportCost,
  "Changing treatedMortgagePaymentPlan.finalMonthlyMortgagePayment should change treatedOngoingSupport."
);

installMortgagePaymentPlanStub(context, { finalMonthlyMortgagePayment: 900 });
const fallbackModel = buildModel(context, {
  sourceData: createSourceData({
    calculatedMonthlyMortgagePayment: 4000,
    propertyTax: null,
    housingInsuranceCost: null,
    monthlyHoaCost: null,
    utilitiesCost: null,
    monthlyMaintenanceRecommendation: null,
    monthlyMaintenanceRecommendationManualOverride: true
  }),
  analysisSettings: createAnalysisSettings()
});
const fallbackSupport = fallbackModel.treatedOngoingSupport;

assert.equal(fallbackSupport.mortgageAdjusted.monthlyAssociatedHousingCost, 2200);
assert.equal(fallbackSupport.mortgageAdjusted.monthlyHousingSupportCost, 3100);
assert.equal(fallbackSupport.trace.associatedHousingCostSource, "monthly-housing-minus-mortgage-fallback");
assert.equal(fallbackSupport.trace.associatedHousingCostFallbackUsed, true);
assert.match(warningCodes(fallbackSupport).join(" "), /treated-ongoing-support-associated-housing-fallback/);

installMortgagePaymentPlanStub(context, {
  mode: "payOff",
  finalMonthlyMortgagePayment: null,
  remainingPrincipalAfterPayoff: 100000,
  mortgagePaymentRemovedFromNeeds: true
});
const ambiguousPayoffModel = buildModel(context, {
  sourceData: createSourceData(),
  analysisSettings: createAnalysisSettings()
});
const ambiguousSupport = ambiguousPayoffModel.treatedOngoingSupport;

assert.equal(ambiguousSupport.status, "unavailable");
assert.equal(ambiguousSupport.mortgageAdjusted.monthlyMortgagePayment, null);
assert.equal(ambiguousSupport.mortgageAdjusted.monthlyHousingSupportCost, null);
assert.match(warningCodes(ambiguousSupport).join(" "), /treated-ongoing-support-final-mortgage-payment-unavailable/);

const builderSource = readRepoFile("app/features/lens-analysis/lens-model-builder.js");
const treatedSupportSlice = builderSource.slice(
  builderSource.indexOf("function createPreparedTreatedOngoingSupport"),
  builderSource.indexOf("function attachSurvivorIncomeDerivationMetadata")
);
assert.doesNotMatch(treatedSupportSlice, /payoffPercent|manualYears|manualTerm|remainingTerm|monthlyRate|Math\.pow|amort/i);
assert.match(treatedSupportSlice, /finalMonthlyMortgagePayment/);

const methodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
assert.match(methodsSource, /resolveMethodReadyOngoingSupport/);
assert.match(methodsSource, /treatedOngoingSupport\.mortgageAdjusted\.annualTotalEssentialSupportCost/);
const methodResults = lensAnalysis.analysisMethods.runAnalysisMethods(payoffModel, {
  includeExistingCoverageOffset: false,
  includeOffsetAssets: false,
  includeEducationFunding: false,
  includeProjectedDependents: false,
  includeSurvivorIncomeOffset: false,
  includeEssentialSupport: true,
  includeTransitionNeeds: false,
  includeDiscretionarySupport: false
});
const needsEssentialTrace = findTrace(methodResults.needsAnalysis, "essentialSupport");
assert.ok(needsEssentialTrace, "Needs Analysis should expose an essentialSupport trace.");
assert.match(JSON.stringify(needsEssentialTrace), /treatedOngoingSupport\.mortgageAdjusted\.annualTotalEssentialSupportCost/);
assert.equal(JSON.stringify(methodResults.dime).includes("treatedOngoingSupport"), false);
assert.equal(JSON.stringify(methodResults.humanLifeValue).includes("treatedOngoingSupport"), false);

assertNoProtectedDiffs();

console.log("treated-ongoing-support-model-check passed");
