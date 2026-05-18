#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const TREATED_SUPPORT_SOURCE_PATH = "treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost";
const RAW_SUPPORT_SOURCE_PATH = "ongoingSupport.annualTotalEssentialSupportCost";

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
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/analysis-methods.js"
  ].forEach((relativePath) => loadScript(context, relativePath));

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createBaseModel(overrides = {}) {
  return {
    incomeBasis: {
      annualIncomeReplacementBase: 90000,
      annualGrossIncome: 120000,
      annualNetIncome: 90000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      monthlyMortgagePayment: 1800,
      monthlyHousingSupportCost: 3200,
      monthlyNonHousingEssentialSupportCost: 3500,
      monthlyTotalEssentialSupportCost: 6700,
      annualTotalEssentialSupportCost: 80400,
      annualDiscretionaryPersonalSpending: 12000
    },
    treatedOngoingSupport: {
      version: "treated-ongoing-support-v1",
      status: "ready",
      consumedByMethods: false,
      mortgageTreatmentConsumed: false,
      original: {
        monthlyMortgagePayment: 1800,
        monthlyHousingSupportCost: 3200,
        monthlyNonHousingEssentialSupportCost: 3500,
        monthlyTotalEssentialSupportCost: 6700,
        annualTotalEssentialSupportCost: 80400
      },
      mortgageAdjusted: {
        monthlyMortgagePayment: 0,
        monthlyAssociatedHousingCost: 1400,
        monthlyHousingSupportCost: 1400,
        monthlyNonHousingEssentialSupportCost: 3500,
        monthlyTotalEssentialSupportCost: 4900,
        annualTotalEssentialSupportCost: 58800
      },
      mortgagePaymentPlanSourcePath: "treatedMortgagePaymentPlan",
      associatedHousingCostsPreserved: true,
      warnings: [],
      trace: {
        treatmentSource: "treatedMortgagePaymentPlan",
        accountingSource: "lens-model-builder.treatedOngoingSupport",
        mortgageTreatmentRecalculated: false
      }
    },
    educationSupport: {
      totalEducationFundingNeed: 0
    },
    finalExpenses: {
      totalFinalExpenseNeed: 0
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    existingCoverage: {
      totalExistingCoverage: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 0,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 0,
      metadata: {
        consumedByMethods: true
      }
    },
    survivorScenario: {
      survivorContinuesWorking: false,
      survivorNetAnnualIncome: null,
      survivorIncomeStartDelayMonths: 0
    },
    ...overrides
  };
}

function createNeedsSettings(overrides = {}) {
  return {
    needsSupportDurationYears: 1,
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false,
    includeDebtPayoff: false,
    includeEssentialSupport: true,
    includeTransitionNeeds: false,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: false,
    includeEducation: false,
    includeFinalExpenses: false,
    inflationAssumptions: {
      enabled: false,
      generalInflationRatePercent: 0,
      householdExpenseInflationRatePercent: 0,
      source: "treated-ongoing-support-method-consumption-check"
    },
    ...overrides
  };
}

function createSimpleNeedsSettings(overrides = {}) {
  return {
    supportYears: 1,
    includeExistingCoverageOffset: false,
    includeAssetOffsets: false,
    includeDebtPayoff: false,
    includeEssentialSupport: true,
    includeEducation: false,
    includeFinalExpenses: false,
    ...overrides
  };
}

function createDimeSettings() {
  return {
    dimeIncomeYears: 10,
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false
  };
}

function createHlvSettings() {
  return {
    projectionYears: 20,
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false
  };
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function warningCodes(result) {
  return Array.isArray(result?.warnings) ? result.warnings.map((warning) => warning.code) : [];
}

function runMethod(method, model, settings) {
  const modelBefore = cloneJson(model);
  const settingsBefore = cloneJson(settings);
  const result = method(cloneJson(model), cloneJson(settings));
  assert.deepEqual(model, modelBefore, "Method should not mutate model input.");
  assert.deepEqual(settings, settingsBefore, "Method should not mutate settings input.");
  return result;
}

function getGitDiff(relativePath) {
  return execFileSync("git", ["diff", "--", `./${relativePath}`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function isAllowedIncomeImpactTreatedSupportConsumption(filePath) {
  const diff = getGitDiff(filePath);
  if (filePath === "app/features/lens-analysis/income-impact-scenario-composer-calculations.js") {
    return diff.includes("resolveIncomeImpactOngoingSupportBasis")
      && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
      && diff.includes("treatedMortgagePaymentPlan.finalMonthlyMortgagePayment")
      && diff.includes("cashFlowIncluded: false");
  }
  if (filePath === "app/features/lens-analysis/income-impact-base-household-expense-stream.js") {
    return diff.includes("resolveIncomeImpactOngoingSupportBasis")
      && diff.includes("raw-housing-support-replaced-by-treated-ongoing-support")
      && diff.includes("lensModel.treatedOngoingSupport.mortgageAdjusted.monthlyHousingSupportCost");
  }
  if (filePath === "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js") {
    return diff.includes("resolveOngoingSupportMonthlyTotalForStream")
      && diff.includes("treatedOngoingSupport.mortgageAdjusted.monthlyTotalEssentialSupportCost");
  }
  return false;
}

function isAllowedStepThreeTreatedSupportDisplay(filePath) {
  if (filePath !== "app/features/lens-analysis/step-three-analysis-display.js") {
    return false;
  }
  const diff = getGitDiff(filePath);
  return diff.includes("renderNeedsTreatedOngoingSupportDetails")
    && diff.includes("Mortgage treatment applied to support need")
    && diff.includes("treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost")
    && diff.includes("Treated support unavailable; raw ongoing support was used");
}

function isAllowedAnalysisSetupMortgageTreatmentUi(filePath) {
  if (filePath !== "pages/analysis-setup.html") {
    return false;
  }
  const diff = getGitDiff(filePath);
  const html = readRepoFile(filePath);
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
  return redesignDiff
    || previewDiff
    || legacyCleanupDiff
    || debtRecordTableHeaderDiff
    || assumptionControlsScrollContractDiff
    || assumptionControlsFontImportDiff
    || assetProjectionControlsRemovalDiff
    || cashReserveCardStyleDiff
    || existingCoverageCardStyleDiff
    || debtMortgageSeparateCardsDiff;
}

function assertNoProtectedDiffs() {
  const protectedFiles = new Set([
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "app/features/lens-analysis/income-impact-base-household-expense-stream.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/debt-treatment-calculations.js",
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
    if (isAllowedIncomeImpactTreatedSupportConsumption(filePath)) {
      return false;
    }
    if (isAllowedStepThreeTreatedSupportDisplay(filePath)) {
      return false;
    }
    if (isAllowedAnalysisSetupMortgageTreatmentUi(filePath)) {
      return false;
    }
    return true;
  });

  assert.deepEqual(protectedDiffs, [], "Out-of-scope Income Impact, model-builder, helper, UI, page, and app files should not change.");
}

const context = createContext();
const methods = context.LensApp.lensAnalysis.analysisMethods;

assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runSimpleNeedsAnalysis, "function");
assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");

const payoffModel = createBaseModel();
const payoffNeeds = runMethod(methods.runNeedsAnalysis, payoffModel, createNeedsSettings());
const payoffNeedsEssential = findTrace(payoffNeeds, "essentialSupport");
const payoffNeedsGrossAnnual = findTrace(payoffNeeds, "grossAnnualHouseholdSupportNeed");

assert.equal(payoffNeeds.components.essentialSupport, 58800);
assert.equal(payoffNeeds.grossNeed, 58800);
assert.equal(payoffNeedsEssential.value, 58800);
assert.equal(payoffNeedsEssential.inputs.annualTotalEssentialSupportCost, 58800);
assert.equal(payoffNeedsEssential.inputs.supportBasis, "treatedOngoingSupport");
assert.equal(payoffNeedsEssential.sourcePaths.includes(TREATED_SUPPORT_SOURCE_PATH), true);
assert.equal(payoffNeedsEssential.sourcePaths.includes(RAW_SUPPORT_SOURCE_PATH), false);
assert.equal(payoffNeedsGrossAnnual.value, 58800);
assert.deepEqual(cloneJson(payoffNeedsGrossAnnual.sourcePaths), [TREATED_SUPPORT_SOURCE_PATH]);
assert.equal(payoffModel.ongoingSupport.annualTotalEssentialSupportCost, 80400);

const payoffSimple = runMethod(methods.runSimpleNeedsAnalysis, payoffModel, createSimpleNeedsSettings());
const payoffSimpleEssential = findTrace(payoffSimple, "essentialSupport");

assert.equal(payoffSimple.components.essentialSupport, 58800);
assert.equal(payoffSimple.grossNeed, 58800);
assert.equal(payoffSimpleEssential.value, 58800);
assert.equal(payoffSimpleEssential.inputs.supportBasis, "treatedOngoingSupport");
assert.deepEqual(cloneJson(payoffSimpleEssential.sourcePaths), [TREATED_SUPPORT_SOURCE_PATH, "settings.supportYears"]);

const continueModel = createBaseModel({
  treatedOngoingSupport: {
    ...createBaseModel().treatedOngoingSupport,
    mortgageAdjusted: {
      monthlyMortgagePayment: 1234.56,
      monthlyAssociatedHousingCost: 1400,
      monthlyHousingSupportCost: 2634.56,
      monthlyNonHousingEssentialSupportCost: 3500,
      monthlyTotalEssentialSupportCost: 6134.56,
      annualTotalEssentialSupportCost: 73614.72
    }
  }
});
const continueNeeds = runMethod(methods.runNeedsAnalysis, continueModel, createNeedsSettings());
const continueSimple = runMethod(methods.runSimpleNeedsAnalysis, continueModel, createSimpleNeedsSettings());

assert.equal(continueNeeds.components.essentialSupport, 73614.72);
assert.equal(findTrace(continueNeeds, "essentialSupport").inputs.supportBasis, "treatedOngoingSupport");
assert.equal(continueSimple.components.essentialSupport, 73614.72);
assert.equal(findTrace(continueSimple, "essentialSupport").inputs.supportBasis, "treatedOngoingSupport");

const unavailableModel = createBaseModel({
  treatedOngoingSupport: {
    status: "unavailable",
    consumedByMethods: false,
    mortgageAdjusted: {
      annualTotalEssentialSupportCost: null
    },
    warnings: [
      {
        code: "treated-ongoing-support-final-mortgage-payment-unavailable",
        message: "final payment unavailable"
      }
    ]
  }
});
const fallbackNeeds = runMethod(methods.runNeedsAnalysis, unavailableModel, createNeedsSettings());
const fallbackSimple = runMethod(methods.runSimpleNeedsAnalysis, unavailableModel, createSimpleNeedsSettings());

assert.equal(fallbackNeeds.components.essentialSupport, 80400);
assert.equal(findTrace(fallbackNeeds, "essentialSupport").inputs.supportBasis, "ongoingSupportFallback");
assert.equal(findTrace(fallbackNeeds, "essentialSupport").sourcePaths.includes(RAW_SUPPORT_SOURCE_PATH), true);
assert.match(warningCodes(fallbackNeeds).join(" "), /treated-ongoing-support-unavailable-for-method/);
assert.equal(fallbackSimple.components.essentialSupport, 80400);
assert.equal(findTrace(fallbackSimple, "essentialSupport").inputs.supportBasis, "ongoingSupportFallback");
assert.deepEqual(
  cloneJson(findTrace(fallbackSimple, "essentialSupport").sourcePaths),
  [RAW_SUPPORT_SOURCE_PATH, "settings.supportYears"]
);
assert.match(warningCodes(fallbackSimple).join(" "), /treated-ongoing-support-unavailable-for-method/);

const modelWithoutTreatedSupport = createBaseModel({
  treatedOngoingSupport: undefined
});
delete modelWithoutTreatedSupport.treatedOngoingSupport;
const rawNeeds = runMethod(methods.runNeedsAnalysis, modelWithoutTreatedSupport, createNeedsSettings());
const rawSimple = runMethod(methods.runSimpleNeedsAnalysis, modelWithoutTreatedSupport, createSimpleNeedsSettings());

assert.equal(rawNeeds.components.essentialSupport, 80400);
assert.equal(findTrace(rawNeeds, "essentialSupport").inputs.supportBasis, "ongoingSupport");
assert.equal(rawSimple.components.essentialSupport, 80400);
assert.equal(findTrace(rawSimple, "essentialSupport").inputs.supportBasis, "ongoingSupport");

const withTreatedDime = runMethod(methods.runDimeAnalysis, payoffModel, createDimeSettings());
const withoutTreatedDime = runMethod(
  methods.runDimeAnalysis,
  modelWithoutTreatedSupport,
  createDimeSettings()
);
assert.deepEqual(withTreatedDime, withoutTreatedDime, "DIME should not consume treatedOngoingSupport.");

const withTreatedHlv = runMethod(methods.runHumanLifeValueAnalysis, payoffModel, createHlvSettings());
const withoutTreatedHlv = runMethod(
  methods.runHumanLifeValueAnalysis,
  modelWithoutTreatedSupport,
  createHlvSettings()
);
assert.deepEqual(withTreatedHlv, withoutTreatedHlv, "HLV should not consume treatedOngoingSupport.");

const methodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
assert.doesNotMatch(methodsSource, /income-impact/i, "This method pass should not introduce Income Impact consumption.");

assertNoProtectedDiffs();

console.log("treated-ongoing-support-method-consumption-check passed");
