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
  function isAllowedSurvivorIncomeSourceFix(filePath) {
    const allowedFiles = new Set([
      "app/features/lens-analysis/lens-model-builder.js",
      "checks/lens-analysis/survivor-support-needs-behavior-check.js",
      "checks/lens-analysis/income-impact-scenario-composer-v1-check.js",
      "checks/lens-analysis/income-impact-timeline-graph-model-v1-check.js"
    ]);
    if (!allowedFiles.has(filePath)) {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    if (filePath === "app/features/lens-analysis/lens-model-builder.js") {
      return diff.includes("resolveSurvivorSupportSettingsContext")
        && diff.includes("getSurvivorSupportAssumptionContext(input, profileRecord)")
        && diff.includes("survivorSupportSettingsSource")
        && diff.includes("survivorSupportAssumptionsSourcePath")
        && diff.includes("input.analysisSettings")
        && diff.includes("profileRecord.analysisSettings");
    }

    if (filePath === "checks/lens-analysis/survivor-support-needs-behavior-check.js") {
      return diff.includes("direct input.analysisSettings should take precedence")
        && diff.includes("profileRecord.analysisSettings survivor assumptions should continue to work")
        && diff.includes("Survivor assumptions trace should identify the direct settings source path");
    }

    if (filePath === "checks/lens-analysis/income-impact-scenario-composer-v1-check.js") {
      return diff.includes("survivor income should move depletion later when it reaches Layer 3")
        && diff.includes("high survivor income can prevent projected depletion within the horizon");
    }

    return diff.includes("layer3.points.comparison-visible-depletion")
      && diff.includes("2066-04-29")
      && diff.includes("monthIndex: 360");
  }

  function isAllowedSurvivorGrossToNetDerivationFix(filePath) {
    if (filePath !== "app/features/lens-analysis/lens-model-builder.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return diff.includes("getSurvivorNetIncomeFailureReason")
      && diff.includes("baseSurvivorNetIncomeSource")
      && diff.includes("protectionModeling.data.spouseNetAnnualIncome")
      && diff.includes("calculated-tax-net-from-spouse-income")
      && diff.includes("conservative-gross-income-fallback")
      && diff.includes("survivorNetIncomeWorkReductionAppliedAfterTax")
      && diff.includes("missing-tax-config")
      && diff.includes("conservativeGrossIncomeFallbackUsed");
  }

  function isAllowedVisualTimelineStaleAssertionCorrection(filePath) {
    if (filePath !== "checks/lens-analysis/income-loss-impact-visual-timeline-check.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return diff.includes("data-income-impact-death-line-label=\"Death tomorrow\"")
      && diff.includes("Comparison pre-death path metadata should preserve its death-line label.")
      && diff.includes("Comparison scenarios should not render a visible death-line anchor.")
      && diff.includes("data-income-impact-death-line-anchor")
      && diff.includes("data-income-impact-lifestyle-impact-readout")
      && diff.includes("Scenario impact readout should render in the summary strip, not inside the timeline graph.")
      && diff.includes("Scenario impact readout details should render in the summary strip, not inside the timeline graph.");
  }

  function isAllowedIncomeLossImpactDisplayAnalysisSettingsBootstrap(filePath) {
    if (filePath !== "app/features/lens-analysis/income-loss-impact-display.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const source = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
    const analysisSettingsInsertions = (diff.match(/\+\s*analysisSettings,/g) || []).length;
    return diff.includes("const analysisSettings = resolveAnalysisSettings(profileRecord, { protectionModelingPayload });")
      && analysisSettingsInsertions >= 2
      && source.includes("const builderResult = buildLensModelFromSavedProtectionModeling(builderInput);")
      && source.includes("const builderInput = {")
      && source.includes("incomeImpactState = {")
      && source.includes("taxConfig: createSavedDataTaxConfig()");
  }

  function isAllowedIncomeLossImpactSurvivorIncomeDiagnosticSnapshot(filePath) {
    if (filePath !== "app/features/lens-analysis/income-loss-impact-display.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", filePath], {
      cwd: repoRoot,
      encoding: "utf8"
    });
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

  function isAllowedAnalysisSetupMortgageTreatmentUi(filePath) {
    if (filePath !== "pages/analysis-setup.html") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", "./pages/analysis-setup.html"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
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
    "checks/lens-analysis/income-loss-impact-survivor-income-runtime-diagnostic-check.js",
    "checks/lens-analysis/survivor-income-gross-to-net-derivation-check.js",
    "checks/lens-analysis/income-loss-impact-scenario-banner-check.js",
    "checks/lens-analysis/analysis-setup-style-guard-utils.js",
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
    return !allowedDiffs.has(filePath)
      && !isAllowedSurvivorIncomeSourceFix(filePath)
      && !isAllowedSurvivorGrossToNetDerivationFix(filePath)
      && !isAllowedVisualTimelineStaleAssertionCorrection(filePath)
      && !isAllowedIncomeLossImpactDisplayAnalysisSettingsBootstrap(filePath)
      && !isAllowedIncomeLossImpactSurvivorIncomeDiagnosticSnapshot(filePath)
      && !isAllowedAnalysisSetupMortgageTreatmentUi(filePath)
      && !isAllowedAnalysisSetupEducationDescriptionRemovalDiff(repoRoot, filePath)
      && !isAllowedAnalysisSetupStyleFoundationDiff(repoRoot, filePath);
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
