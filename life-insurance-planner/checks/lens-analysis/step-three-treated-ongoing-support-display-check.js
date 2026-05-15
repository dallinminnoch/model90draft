#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createLensModel(overrides = {}) {
  return {
    ongoingSupport: {
      monthlyMortgagePayment: 1800,
      monthlyHousingSupportCost: 3200,
      monthlyTotalEssentialSupportCost: 6700,
      annualTotalEssentialSupportCost: 80400
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "continuePayments",
      originalMonthlyMortgagePayment: 1800,
      finalMonthlyMortgagePayment: 1234.56,
      originalRemainingTermMonths: 300,
      finalRemainingTermMonths: 240,
      paymentSource: "calculatedAmortization",
      yearsRemainingSource: "pmiCalculated",
      associatedHousingCostsPreserved: true
    },
    treatedOngoingSupport: {
      version: "treated-ongoing-support-v1",
      status: "ready",
      original: {
        monthlyMortgagePayment: 1800,
        monthlyHousingSupportCost: 3200,
        monthlyTotalEssentialSupportCost: 6700,
        annualTotalEssentialSupportCost: 80400
      },
      mortgageAdjusted: {
        monthlyMortgagePayment: 1234.56,
        monthlyAssociatedHousingCost: 1400,
        monthlyHousingSupportCost: 2634.56,
        monthlyTotalEssentialSupportCost: 6134.56,
        annualTotalEssentialSupportCost: 73614.72
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
    ...overrides
  };
}

function createNeedsResult(overrides = {}) {
  const supportBasis = overrides.supportBasis || "treatedOngoingSupport";
  const supportSourcePath = overrides.supportSourcePath
    || "treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost";
  const supportValue = overrides.supportValue == null ? 73614.72 : overrides.supportValue;
  const fallbackUsed = overrides.fallbackUsed === true;

  return {
    method: "needs",
    label: "Needs Analysis",
    grossNeed: supportValue,
    netCoverageGap: supportValue,
    components: {
      debtPayoff: 0,
      essentialSupport: supportValue,
      education: 0,
      finalExpenses: 0,
      transitionNeeds: 0,
      discretionarySupport: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0,
      survivorIncomeOffset: 0
    },
    assumptions: {
      needsSupportDurationYears: 1,
      supportDurationSource: "settings.needsSupportDurationYears",
      includeExistingCoverageOffset: false,
      includeOffsetAssets: false,
      includeTransitionNeeds: false,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: false
    },
    warnings: [],
    trace: [
      {
        key: "essentialSupport",
        label: "Essential Support",
        formula: "annualTotalEssentialSupportCost x needsSupportDurationYears",
        value: supportValue,
        sourcePaths: [supportSourcePath],
        inputs: {
          annualTotalEssentialSupportCost: supportValue,
          supportBasis,
          supportBasisSourcePath: supportSourcePath,
          treatedOngoingSupportFallbackUsed: fallbackUsed
        }
      },
      {
        key: "grossAnnualHouseholdSupportNeed",
        label: "Gross Annual Household Support Need",
        formula: supportSourcePath,
        value: supportValue,
        sourcePaths: [supportSourcePath],
        inputs: {
          supportBasis,
          supportBasisSourcePath: supportSourcePath,
          annualTotalEssentialSupportCost: supportValue,
          treatedOngoingSupportFallbackUsed: fallbackUsed
        }
      }
    ]
  };
}

function createDimeResult() {
  return {
    method: "dime",
    label: "DIME Analysis",
    grossNeed: 1000000,
    netCoverageGap: 1000000,
    components: {
      debt: 0,
      income: 1000000,
      mortgage: 0,
      education: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {
      dimeIncomeYears: 10,
      includeExistingCoverageOffset: false,
      includeOffsetAssets: false
    },
    warnings: [],
    trace: []
  };
}

function createHlvResult() {
  return {
    method: "humanLifeValue",
    label: "Simple Human Life Value",
    grossHumanLifeValue: 1000000,
    netCoverageGap: 1000000,
    components: {
      annualIncomeValue: 50000,
      projectionYears: 20,
      simpleHumanLifeValue: 1000000
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {
      incomeValueSource: "incomeBasis.annualNetIncome",
      projectionYears: 20,
      projectionYearsSource: "settings.hlvProjectionYears",
      includeExistingCoverageOffset: false,
      includeOffsetAssets: false,
      incomeGrowthApplied: false,
      discountRateApplied: false,
      survivorIncomeApplied: false
    },
    warnings: [],
    trace: []
  };
}

function renderScenario(options = {}) {
  const hosts = {
    "[data-step-three-dime-analysis]": { innerHTML: "" },
    "[data-step-three-needs-analysis]": { innerHTML: "" },
    "[data-step-three-human-life-value-analysis]": { innerHTML: "" }
  };
  let readyCallback = null;
  const lensModel = createLensModel(options.lensModelOverrides);
  const context = {
    console,
    Intl,
    URLSearchParams,
    window: null,
    document: {
      querySelector(selector) {
        return hosts[selector] || null;
      },
      addEventListener(eventName, callback) {
        if (eventName === "DOMContentLoaded") {
          readyCallback = callback;
        }
      }
    },
    location: {
      search: ""
    },
    LensApp: {
      clientRecords: {
        getCurrentLinkedRecord() {
          return {
            analysisSettings: {},
            protectionModeling: {
              data: {
                annualGrossIncome: 100000
              }
            }
          };
        }
      },
      lensAnalysis: {
        buildLensModelFromSavedProtectionModeling() {
          return {
            lensModel,
            warnings: []
          };
        },
        analysisSettingsAdapter: {
          createAnalysisMethodSettings() {
            return {
              dimeSettings: {},
              needsAnalysisSettings: {},
              humanLifeValueSettings: {},
              warnings: []
            };
          }
        },
        analysisMethods: {
          runDimeAnalysis() {
            return createDimeResult();
          },
          runNeedsAnalysis() {
            return options.needsResult || createNeedsResult();
          },
          runHumanLifeValueAnalysis() {
            return createHlvResult();
          }
        }
      }
    }
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(
    readRepoFile("app/features/lens-analysis/step-three-analysis-display.js"),
    context,
    { filename: "app/features/lens-analysis/step-three-analysis-display.js" }
  );

  assert.equal(typeof readyCallback, "function", "Step 3 display should register DOMContentLoaded.");
  readyCallback();

  return {
    dimeHtml: hosts["[data-step-three-dime-analysis]"].innerHTML,
    needsHtml: hosts["[data-step-three-needs-analysis]"].innerHTML,
    hlvHtml: hosts["[data-step-three-human-life-value-analysis]"].innerHTML
  };
}

function assertNoProtectedDiffs() {
  function isAllowedAnalysisSetupMortgageTreatmentUi(filePath) {
    if (filePath !== "pages/analysis-setup.html") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", "./pages/analysis-setup.html"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
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
    return redesignDiff
      || previewDiff
      || legacyCleanupDiff
      || debtRecordTableHeaderDiff
      || assumptionControlsScrollContractDiff
      || assumptionControlsFontImportDiff
      || assetProjectionControlsRemovalDiff
      || cashReserveCardStyleDiff;
  }

  const allowedDiffs = new Set([
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "checks/lens-analysis/analysis-setup-entry-overlay-check.js",
    "checks/lens-analysis/analysis-setup-debt-record-table-check.js",
    "checks/lens-analysis/analysis-setup-debt-treatment-saved-shape-check.js",
    "checks/lens-analysis/asset-growth-projection-source-mode-ui-check.js",
    "checks/lens-analysis/asset-growth-ui-saved-only-check.js",
    "checks/lens-analysis/cash-reserve-assumptions-ui-check.js",
    "checks/lens-analysis/final-expense-inflation-prep-check.js",
    "checks/lens-analysis/projected-asset-offset-analysis-setup-ui-check.js",
    "checks/lens-analysis/income-impact-treated-ongoing-support-consumption-check.js",
    "checks/lens-analysis/income-loss-impact-scenario-banner-check.js",
    "checks/lens-analysis/mortgage-treatment-payment-plan-model-check.js",
    "checks/lens-analysis/step-three-treated-ongoing-support-display-check.js",
    "checks/lens-analysis/treated-ongoing-support-method-consumption-check.js",
    "checks/lens-analysis/treated-ongoing-support-model-check.js",
    "checks/run-income-impact-suite.js",
    "components.css",
    "layout.css"
  ]);
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map((line) => {
    return line.slice(3).trim().replace(/^life-insurance-planner\//, "");
  });
  const protectedDiffs = changedFiles.filter((filePath) => {
    return !allowedDiffs.has(filePath) && !isAllowedAnalysisSetupMortgageTreatmentUi(filePath);
  });

  assert.deepEqual(protectedDiffs, [], "Only Step 3 treated ongoing support display files should change.");
}

const treatedScenario = renderScenario();
const needsHtml = treatedScenario.needsHtml;

assert.match(needsHtml, /Mortgage treatment applied to support need/);
assert.match(needsHtml, /Support basis/);
assert.match(needsHtml, /Treated ongoing support/);
assert.match(needsHtml, /treatedOngoingSupport\.mortgageAdjusted\.annualTotalEssentialSupportCost/);
assert.match(needsHtml, /Original mortgage payment/);
assert.match(needsHtml, /\$1,800/);
assert.match(needsHtml, /Treated mortgage payment/);
assert.match(needsHtml, /\$1,235/);
assert.match(needsHtml, /Final years \/ months remaining/);
assert.match(needsHtml, /20 years \/ 240 months/);
assert.match(needsHtml, /Payment source/);
assert.match(needsHtml, /CalculatedAmortization|Calculated amortization/);
assert.match(needsHtml, /Years source/);
assert.match(needsHtml, /PmiCalculated|Pmi calculated/);
assert.match(needsHtml, /Associated housing costs/);
assert.match(needsHtml, /property tax, insurance, HOA, utilities, and maintenance remain in housing support/);
assert.match(needsHtml, /Original monthly housing support/);
assert.match(needsHtml, /\$3,200/);
assert.match(needsHtml, /Treated monthly housing support/);
assert.match(needsHtml, /\$2,635/);
assert.match(needsHtml, /Original monthly essential support/);
assert.match(needsHtml, /\$6,700/);
assert.match(needsHtml, /Treated monthly essential support/);
assert.match(needsHtml, /\$6,135/);

assert.doesNotMatch(treatedScenario.dimeHtml, /Mortgage treatment applied to support need/);
assert.doesNotMatch(treatedScenario.hlvHtml, /Mortgage treatment applied to support need/);

const fallbackScenario = renderScenario({
  needsResult: createNeedsResult({
    supportBasis: "ongoingSupportFallback",
    supportSourcePath: "ongoingSupport.annualTotalEssentialSupportCost",
    supportValue: 80400,
    fallbackUsed: true
  }),
  lensModelOverrides: {
    treatedMortgagePaymentPlan: {
      mode: "unavailable",
      finalMonthlyMortgagePayment: null,
      finalRemainingTermMonths: null,
      paymentSource: "unavailable",
      yearsRemainingSource: "unavailable"
    },
    treatedOngoingSupport: {
      status: "unavailable",
      associatedHousingCostsPreserved: true,
      original: {
        monthlyMortgagePayment: 1800,
        monthlyHousingSupportCost: 3200,
        monthlyTotalEssentialSupportCost: 6700,
        annualTotalEssentialSupportCost: 80400
      },
      mortgageAdjusted: {
        monthlyMortgagePayment: null,
        monthlyHousingSupportCost: null,
        monthlyTotalEssentialSupportCost: null,
        annualTotalEssentialSupportCost: null
      },
      warnings: [
        {
          code: "treated-ongoing-support-final-mortgage-payment-unavailable",
          message: "final payment unavailable"
        }
      ]
    }
  }
});

assert.match(fallbackScenario.needsHtml, /Raw ongoing support fallback/);
assert.match(fallbackScenario.needsHtml, /ongoingSupport\.annualTotalEssentialSupportCost/);
assert.match(fallbackScenario.needsHtml, /Treated support unavailable; raw ongoing support was used/);
assert.doesNotMatch(fallbackScenario.needsHtml, /Support basis<\/span><strong>Treated ongoing support/);

const displaySource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.doesNotMatch(
  displaySource,
  /calculateTreatedMortgagePaymentPlan|amortization|payoffPercent/i,
  "Step 3 display should not duplicate mortgage treatment calculation logic."
);

assert.match(displaySource, /Mortgage treatment applied to support need/);
assert.match(displaySource, /renderNeedsTreatedOngoingSupportDetails/);

assertNoProtectedDiffs();

console.log("step-three-treated-ongoing-support-display-check passed");
