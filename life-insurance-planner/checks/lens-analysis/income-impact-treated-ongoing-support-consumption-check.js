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
const TREATED_ANNUAL_SOURCE = "lensModel.treatedOngoingSupport.mortgageAdjusted.annualTotalEssentialSupportCost";
const TREATED_MONTHLY_SOURCE = "lensModel.treatedOngoingSupport.mortgageAdjusted.monthlyTotalEssentialSupportCost";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function loadComposerContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/household-wealth-projection-calculations.js",
    "app/features/lens-analysis/household-death-event-availability-calculations.js",
    "app/features/lens-analysis/household-survivor-runway-calculations.js",
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function loadBaseStreamContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/income-impact-base-household-expense-stream.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function loadLifestyleContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/household-expense-account-policy-resolver.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js",
    "app/features/lens-analysis/income-impact-base-household-expense-stream.js",
    "app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js",
    "app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createExpenseFact(overrides) {
  return Object.assign({
    source: "protectionModeling.data",
    sourceOwnedBy: "ongoingSupport",
    frequency: "monthly"
  }, overrides);
}

function createExpenseFacts() {
  return {
    expenses: [
      createExpenseFact({
        expenseFactId: "housing",
        typeKey: "rentOrMortgagePayment",
        categoryKey: "housingExpense",
        label: "Raw housing support",
        monthlyAmount: 3000,
        ownedByField: "monthlyHousingSupportCost",
        metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHousingSupportCost" }
      }),
      createExpenseFact({
        expenseFactId: "food",
        typeKey: "groceries",
        categoryKey: "foodGroceries",
        label: "Food",
        monthlyAmount: 2000,
        ownedByField: "monthlyFoodCost",
        metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyFoodCost" }
      })
    ]
  };
}

function createLensModel(overrides = {}) {
  return Object.assign({
    assetFacts: {
      assets: [
        {
          id: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          currentValue: 100000
        }
      ]
    },
    incomeBasis: {
      insuredNetAnnualIncome: 70000,
      spouseOrPartnerNetAnnualIncome: 30000
    },
    ongoingSupport: {
      monthlyMortgagePayment: 2400,
      mortgageRemainingTermMonths: 240,
      monthlyHousingSupportCost: 3000,
      monthlyNonHousingEssentialSupportCost: 2000,
      monthlyTotalEssentialSupportCost: 5000,
      annualTotalEssentialSupportCost: 60000,
      annualDiscretionaryPersonalSpending: 12000
    },
    treatedOngoingSupport: {
      status: "ready",
      mortgageAdjusted: {
        monthlyMortgagePayment: 0,
        monthlyAssociatedHousingCost: 600,
        monthlyHousingSupportCost: 600,
        monthlyTotalEssentialSupportCost: 2600,
        annualTotalEssentialSupportCost: 31200
      }
    },
    treatedMortgagePaymentPlan: {
      status: "ready",
      mode: "payOff",
      finalMonthlyMortgagePayment: 0,
      finalRemainingTermMonths: 0
    },
    expenseFacts: createExpenseFacts(),
    survivorScenario: {
      survivorNetAnnualIncome: 30000,
      survivorIncomeStartDelayMonths: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 50000,
      includedPolicyCount: 1,
      excludedPolicyCount: 0
    },
    finalExpenses: {
      totalFinalExpenseNeed: 10000
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    treatedDebtPayoff: {
      debts: [
        {
          debtFactId: "primary-mortgage",
          label: "Primary mortgage",
          categoryKey: "realEstateSecuredDebt",
          isMortgage: true,
          treatmentMode: "support",
          mortgageTreatmentMode: "support",
          included: true,
          treatedAmount: 0,
          monthlyMortgagePayment: 2400,
          remainingTermMonths: 240,
          sourcePaths: ["lensModel.treatedDebtPayoff.debts.primary-mortgage"]
        }
      ]
    }
  }, overrides);
}

function createComposerInput(lensModel, mortgageTreatmentOverride) {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2031-01-01",
    projectionHorizonMonths: 24,
    lensModel,
    analysisSettings: {
      assetTreatmentAssumptions: {
        enabled: true,
        assets: {
          cashAndCashEquivalents: {
            include: true,
            taxDragPercent: 0,
            liquidityHaircutPercent: 0
          }
        }
      }
    },
    scenarioOptions: {
      includeDiscretionaryNeeds: true,
      mortgageTreatmentOverride: mortgageTreatmentOverride || "followAssumptions"
    }
  };
}

function createBasePostDeathSeries() {
  return {
    points: [
      {
        monthIndex: 1,
        date: "2031-02-01",
        survivorNeeds: 2600,
        netUse: 1000,
        endingResources: 100000,
        availableResources: 100000
      }
    ],
    summary: {}
  };
}

function findStream(streams, id) {
  return (Array.isArray(streams) ? streams : []).find(function (stream) {
    return stream.id === id;
  });
}

function getRiskOnlyMortgageSupport(result) {
  return (result?.postDeathSeries?.layer3?.input?.scheduledObligations || [])
    .filter(function (obligation) {
      return obligation.category === "mortgageSupport";
    });
}

function warningCodes(result) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).map(function (warning) {
    return warning.code;
  }).join(" ");
}

function assertNoForbiddenSourceChanges() {
  function isAllowedSurvivorIncomeSourceFix(filePath) {
    if (
      ![
        "life-insurance-planner/app/features/lens-analysis/lens-model-builder.js",
        "life-insurance-planner/checks/lens-analysis/survivor-support-needs-behavior-check.js",
        "life-insurance-planner/checks/lens-analysis/income-impact-scenario-composer-v1-check.js",
        "life-insurance-planner/checks/lens-analysis/income-impact-timeline-graph-model-v1-check.js"
      ].includes(filePath)
    ) {
      return false;
    }

    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    if (filePath === "life-insurance-planner/app/features/lens-analysis/lens-model-builder.js") {
      return diff.includes("resolveSurvivorSupportSettingsContext")
        && diff.includes("getSurvivorSupportAssumptionContext(input, profileRecord)")
        && diff.includes("survivorSupportSettingsSource")
        && diff.includes("survivorSupportAssumptionsSourcePath")
        && diff.includes("input.analysisSettings")
        && diff.includes("profileRecord.analysisSettings");
    }

    if (filePath === "life-insurance-planner/checks/lens-analysis/survivor-support-needs-behavior-check.js") {
      return diff.includes("direct input.analysisSettings should take precedence")
        && diff.includes("profileRecord.analysisSettings survivor assumptions should continue to work")
        && diff.includes("Survivor assumptions trace should identify the direct settings source path");
    }

    if (filePath === "life-insurance-planner/checks/lens-analysis/income-impact-scenario-composer-v1-check.js") {
      return diff.includes("survivor income should move depletion later when it reaches Layer 3")
        && diff.includes("high survivor income can prevent projected depletion within the horizon");
    }

    return diff.includes("layer3.points.comparison-visible-depletion")
      && diff.includes("2066-04-29")
      && diff.includes("monthIndex: 360");
  }

  function isAllowedSurvivorGrossToNetDerivationFix(filePath) {
    if (filePath !== "life-insurance-planner/app/features/lens-analysis/lens-model-builder.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
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
    if (filePath !== "life-insurance-planner/checks/lens-analysis/income-loss-impact-visual-timeline-check.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
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
    if (filePath !== "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
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
    if (filePath !== "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
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
    const diagnosticRenderedCoordinateDiff = diff.includes("primaryRenderSource")
      && diff.includes("appliedRunwayScenarios.fundedRunwayPoints")
      && diff.includes("primaryPathD")
      && diff.includes("firstRenderedGraphPoints")
      && diff.includes("transitionBridgeStartX")
      && diff.includes("transitionBridgeEndX")
      && diff.includes("transitionBridgeVisible")
      && diff.includes("rawMonthIndex")
      && diff.includes("visualMonthIndex");
    const diagnosticTransitionBridgeSourceDiff = diff.includes("transitionBridgeSource")
      && diff.includes("series.transitionBridge")
      && diff.includes("series.transitionBridgePoints")
      && diff.includes("transitionBridgeVisible");
    return originalDiagnosticDiff
      || diagnosticDepthDiff
      || diagnosticLifestyleComparisonDiff
      || diagnosticLifestyleShapeDiff
      || diagnosticRenderedCoordinateDiff
      || diagnosticTransitionBridgeSourceDiff;
  }

  function isAllowedAssetDepletionLedgerSurplusDepositPass(filePath) {
    const allowedFiles = new Set([
      "life-insurance-planner/app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js",
      "life-insurance-planner/checks/lens-analysis/income-impact-asset-depletion-ledger-check.js",
      "life-insurance-planner/checks/lens-analysis/income-impact-asset-depletion-ledger-diagnostic-integration-check.js"
    ]);
    if (!allowedFiles.has(filePath)) {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    if (filePath === "life-insurance-planner/app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js") {
      return diff.includes("monthlyNetCashFlow")
        && diff.includes("surplusAmount")
        && diff.includes("surplusDepositsByBucket")
        && diff.includes("survivor-income-surplus-reserve")
        && diff.includes("syntheticSurplusBucket")
        && diff.includes("totalSurplusDeposited")
        && diff.includes("surplusDepositPolicy");
    }

    if (filePath === "life-insurance-planner/checks/lens-analysis/income-impact-asset-depletion-ledger-check.js") {
      return diff.includes("surplusCashResult")
        && diff.includes("surplus months without cash should create a synthetic cash reserve bucket")
        && diff.includes("survivor-income-surplus-reserve")
        && diff.includes("later deficits should draw from the surplus-refilled cash bucket before lower-priority buckets")
        && diff.includes("balanceAfterDeposit");
    }

    return diff.includes("makeRisingLayer3Output")
      && diff.includes("ledger totals should match rising Layer 3 resources when survivor income creates surplus")
      && diff.includes("surplusDepositedToBucketId")
      && diff.includes("totalSurplusDeposited");
  }

  function isAllowedIncomeImpactGraphLayoutFramePass(filePath) {
    const allowedFiles = new Set([
      "life-insurance-planner/app/features/lens-analysis/income-impact-timeline-graph-model.js",
      "life-insurance-planner/checks/lens-analysis/income-impact-timeline-graph-model-v1-check.js"
    ]);
    if (!allowedFiles.has(filePath)) {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    if (filePath === "life-insurance-planner/app/features/lens-analysis/income-impact-timeline-graph-model.js") {
      const stableFrameContractDiff = diff.includes("layoutFrame")
        && diff.includes("stableRunoutAnchoredFrame")
        && diff.includes("deathXRatio")
        && diff.includes("zeroYRatio")
        && diff.includes("runoutAnchorXRatio")
        && diff.includes("negativeSupportBandRatio")
        && diff.includes("zeroCrossingAnchorScenarioId")
        && diff.includes("zeroCrossingAnchorMonth")
        && diff.includes("consideredVisibleResourceLines");
      const transitionVisualMonthMappingDiff = diff.includes("DEFAULT_TRANSITION_PERIOD_MONTHS = 0")
        && diff.includes("resolveTransitionPeriodContract")
        && diff.includes("applyTransitionPeriodToRunwayPoint")
        && diff.includes("visualMonthIndex")
        && diff.includes("transitionBridgePoints")
        && diff.includes("zeroCrossingAnchorRawMonth")
        && diff.includes("zeroCrossingAnchorVisualMonth")
        && diff.includes("transitionNoFinancialCalculationChanged");
      return stableFrameContractDiff || transitionVisualMonthMappingDiff;
    }

    const stableFrameCheckDiff = diff.includes("assertStableLayoutFrame")
      && diff.includes("manual lifestyle comparison later depletion scenario")
      && diff.includes("Manual lifestyle comparison later depletion should be included in the stable layoutFrame horizon.")
      && diff.includes("manual lifestyle comparison earlier depletion scenario")
      && diff.includes("no-depletion scenario")
      && diff.includes("projection-horizon")
      && diff.includes("survivor surplus rising-resource scenario");
    const transitionVisualMonthMappingCheckDiff = diff.includes("makeTransitionScenario")
      && diff.includes("Raw runway month 1 should visually map to month 7")
      && diff.includes("Raw depletion month 24 should visually map to month 30")
      && diff.includes("No-depletion visual horizon should include the shifted runway end.")
      && diff.includes("Later lifestyle depletion should become anchor after transition shift.")
      && diff.includes("Earlier lifestyle depletion should stay before the later selected anchor.");
    return stableFrameCheckDiff || transitionVisualMonthMappingCheckDiff;
  }

  function isAllowedIncomeLossImpactLayoutFrameRendererPass(filePath) {
    if (filePath !== "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js"
      && filePath !== "life-insurance-planner/checks/lens-analysis/income-loss-impact-visual-timeline-check.js") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", `./${filePath}`], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    if (filePath === "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js") {
      const stableLayoutFrameRendererDiff = diff.includes("STABLE_GRAPH_LAYOUT_FRAME_MODE")
        && diff.includes("getStableGraphLayoutFrame")
        && diff.includes("getLayoutFrameXRatio")
        && diff.includes("getLayoutFrameYRatio")
        && diff.includes("layoutFrame.deathXRatio")
        && diff.includes("layoutFrame.zeroYRatio")
        && diff.includes("layoutFrame.runoutAnchorXRatio")
        && diff.includes("zeroCrossingAnchorMonth")
        && diff.includes("data-income-impact-layout-frame-mode");
      const transitionBridgeRendererDiff = diff.includes("getGraphTransitionPeriodMonths")
        && diff.includes("visualMonthIndex")
        && diff.includes("visualDepletionMonth")
        && diff.includes("visualMonthOffset")
        && diff.includes("transitionPeriodMonths")
        && diff.includes("transitionBridgeMode")
        && diff.includes("getGraphStorylineEventMonthOffset")
        && diff.includes("getGraphStorylinePointMonthOffset")
        && diff.includes("depletionPoint.visualMonthIndex");
      return stableLayoutFrameRendererDiff || transitionBridgeRendererDiff;
    }

    const stableLayoutFrameCheckDiff = diff.includes("attachStableLayoutFrame")
      && diff.includes("Renderer should consume layoutFrame deathXRatio instead of dynamic phase death x.")
      && diff.includes("Renderer should consume layoutFrame zeroYRatio instead of dynamic axis zero y.")
      && diff.includes("Furthest visible depletion should render at the stable runout anchor zone.")
      && diff.includes("Later-running lifestyle comparison should cross zero at the stable runout anchor zone.");
    const transitionBridgeCheckDiff = diff.includes("Transition bridge should render flat after death before the shifted raw runway point.")
      && diff.includes("Death marker should remain fixed while the transition bridge renders.")
      && diff.includes("Depletion marker should use shifted visual depletion month.")
      && diff.includes("Post-death storyline dots should shift with the visual transition mapping.")
      && diff.includes("0-month transition should preserve the unshifted visual runway coordinates.");
    return stableLayoutFrameCheckDiff || transitionBridgeCheckDiff;
  }

  function isAllowedIncomeImpactTransitionPeriodComposerTraceContract(filePath) {
    const allowedFiles = new Set([
      "life-insurance-planner/app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
      "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js",
      "life-insurance-planner/checks/lens-analysis/income-impact-scenario-composer-v1-check.js"
    ]);
    if (!allowedFiles.has(filePath)) {
      return false;
    }
    const composerDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/app/features/lens-analysis/income-impact-scenario-composer-calculations.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const displayDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const composerCheckDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/checks/lens-analysis/income-impact-scenario-composer-v1-check.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const diagnosticCheckDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/checks/lens-analysis/income-loss-impact-survivor-income-runtime-diagnostic-check.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    const composerHasTransitionContract = composerDiff.includes("TRANSITION_PERIOD_SOURCE_PATH")
      && composerDiff.includes("DEFAULT_TRANSITION_PERIOD_MONTHS = 3")
      && composerDiff.includes("MIN_TRANSITION_PERIOD_MONTHS = 0")
      && composerDiff.includes("MAX_TRANSITION_PERIOD_MONTHS = 24")
      && composerDiff.includes("normalizeTransitionPeriodMonths")
      && composerDiff.includes("resolveTransitionPeriodContract")
      && composerDiff.includes("trace.layer3.transitionPeriod")
      && composerDiff.includes("bridgeMode: \"flatBridge\"")
      && composerDiff.includes("cashFlowMode: \"not-modeled-v1\"")
      && composerDiff.includes("noFinancialCalculationChanged: true")
      && composerDiff.includes("transitionPeriod: {")
      && composerDiff.includes("shiftsRunwayVisually: true");

    const displayHasCacheAndDiagnosticContract = displayDiff.includes("resolveAnalysisSettingsTransitionPeriodMonths")
      && displayDiff.includes("clampTransitionPeriodMonths")
      && displayDiff.includes("transitionPeriodMonths: controls.transitionPeriodMonths")
      && displayDiff.includes("transitionPeriodMonths: clampTransitionPeriodMonths(safeSettings.transitionPeriodMonths)")
      && displayDiff.includes("summarizeScenarioTransitionPeriod")
      && displayDiff.includes("transitionPeriod: summarizeScenarioTransitionPeriod(scenario)")
      && displayDiff.includes("rawBaselineTransitionPeriod");

    const composerCheckHasNoBehaviorChangeProof = composerCheckDiff.includes("runTransitionPeriodContractChecks")
      && composerCheckDiff.includes("Transition period metadata should not change Layer 3 post-death points")
      && composerCheckDiff.includes("Transition period metadata should not change depletion")
      && composerCheckDiff.includes("bridgeMode")
      && composerCheckDiff.includes("cashFlowMode");

    const diagnosticCheckHasTransitionProof = diagnosticCheckDiff.includes("snapshot.analysisSettings.transitionPeriodMonths")
      && diagnosticCheckDiff.includes("snapshot.currentRendered.transitionPeriod.lengthMonths")
      && diagnosticCheckDiff.includes("resolveAnalysisSettingsTransitionPeriodMonths")
      && diagnosticCheckDiff.includes("snapshot.currentRendered.transitionPeriod.noFinancialCalculationChanged");

    return composerHasTransitionContract
      && displayHasCacheAndDiagnosticContract
      && composerCheckHasNoBehaviorChangeProof
      && diagnosticCheckHasTransitionProof;
  }

  function isAllowedIncomeLossImpactTransitionPeriodScenarioControlDiff(filePath) {
    if (filePath !== "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js"
      && filePath !== "life-insurance-planner/pages/income-loss-impact.html") {
      return false;
    }

    const displayDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const pageDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/pages/income-loss-impact.html"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const scenarioBannerCheckDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/checks/lens-analysis/income-loss-impact-scenario-banner-check.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    const pageHasRuntimeControl = pageDiff.includes("Transition period")
      && pageDiff.includes("data-income-impact-transition-period-value")
      && pageDiff.includes("id=\"income-impact-transition-period\"")
      && pageDiff.includes("type=\"range\"")
      && pageDiff.includes("min=\"0\"")
      && pageDiff.includes("max=\"24\"")
      && pageDiff.includes("step=\"1\"")
      && pageDiff.includes("value=\"3\"")
      && pageDiff.includes("data-income-impact-transition-period-reset");

    const displayHasRuntimeOverride = displayDiff.includes("createAnalysisSettingsWithTransitionPeriodOverride")
      && displayDiff.includes("data-income-impact-transition-period")
      && displayDiff.includes("data-income-impact-transition-period-value")
      && displayDiff.includes("data-income-impact-transition-period-reset")
      && displayDiff.includes("scenarioOptions = {")
      && displayDiff.includes("transitionPeriodMonths: controls.transitionPeriodMonths")
      && displayDiff.includes("scenarioAnalysisSettings")
      && displayDiff.includes("analysisSettings: scenarioAnalysisSettings")
      && displayDiff.includes("scenarioState.transitionPeriodMonths = controls.transitionPeriodMonths")
      && displayDiff.includes("data-income-impact-transition-period-label");

    const checkProvesRuntimeOverride = scenarioBannerCheckDiff.includes("draft transition period should not rerun composer before Reevaluate")
      && scenarioBannerCheckDiff.includes("runtime transition override should reach composer through analysisSettings")
      && scenarioBannerCheckDiff.includes("transition 12 months should change the rendered graph path")
      && scenarioBannerCheckDiff.includes("transition reset should return the runtime override to the saved Analysis Setup default")
      && scenarioBannerCheckDiff.includes("graph model should receive the selected scenario transition contract");

    return pageHasRuntimeControl
      && displayHasRuntimeOverride
      && checkProvesRuntimeOverride;
  }

  function isAllowedIncomeLossImpactTransitionPeriodGraphPropagationDiff(filePath) {
    if (filePath !== "life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js") {
      return false;
    }

    const displayDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/app/features/lens-analysis/income-loss-impact-display.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const scenarioBannerCheckDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/checks/lens-analysis/income-loss-impact-scenario-banner-check.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });
    const diagnosticCheckDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/checks/lens-analysis/income-loss-impact-survivor-income-runtime-diagnostic-check.js"], {
      cwd: path.resolve(repoRoot, ".."),
      encoding: "utf8"
    });

    const displayMirrorsComposerTransitionForGraph = displayDiff.includes("getScenarioTransitionPeriodContractSource")
      && displayDiff.includes("ensureGraphScenarioTransitionPeriodContract")
      && displayDiff.includes("makeTransitionPeriodFallbackScenario")
      && displayDiff.includes("autoCompressedBaselineResult.autoCompressedScenario")
      && displayDiff.includes("safeInputs.autoCompressedBaselineScenario")
      && displayDiff.includes("ensureAppliedScenarioRecordsGraphTransitionPeriodContract")
      && displayDiff.includes("buildIncomeImpactTimelineGraphModel");

    const scenarioBannerCheckProvesGraphContract = scenarioBannerCheckDiff.includes("selectedScenario?.scenario?.transitionPeriod?.lengthMonths")
      && scenarioBannerCheckDiff.includes("harness.graphModelCalls[0].scenario.transitionPeriod.lengthMonths")
      && scenarioBannerCheckDiff.includes("graphInputSnapshot.appliedScenarios")
      && scenarioBannerCheckDiff.includes("transitionHarness.graphModelCalls.at(-1).scenario.transitionPeriod.lengthMonths")
      && scenarioBannerCheckDiff.includes("graph model should receive the selected scenario transition contract");

    const diagnosticCheckProvesGraphContract = diagnosticCheckDiff.includes("input.scenario?.transitionPeriod?.lengthMonths")
      && diagnosticCheckDiff.includes("harness.graphModelCalls.at(-1).scenario.transitionPeriod.lengthMonths")
      && diagnosticCheckDiff.includes("snapshot.currentRendered.graph.transitionPeriod.lengthMonths");

    return displayMirrorsComposerTransitionForGraph
      && scenarioBannerCheckProvesGraphContract
      && diagnosticCheckProvesGraphContract;
  }

  function isAllowedAnalysisSetupMortgageTreatmentUi(filePath) {
    if (filePath !== "life-insurance-planner/pages/analysis-setup.html") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", "./life-insurance-planner/pages/analysis-setup.html"], {
      cwd: path.resolve(repoRoot, ".."),
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

  function isAllowedAnalysisSetupTransitionPeriodAssumptionDiff(filePath) {
    if (filePath !== "life-insurance-planner/pages/analysis-setup.html") {
      return false;
    }

    const workspaceRoot = path.resolve(repoRoot, "..");
    const htmlDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/pages/analysis-setup.html"], {
      cwd: workspaceRoot,
      encoding: "utf8"
    });
    const analysisSetupDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/app/features/lens-analysis/analysis-setup.js"], {
      cwd: workspaceRoot,
      encoding: "utf8"
    });
    const savedShapeCheckDiff = execFileSync("git", ["diff", "--", "./life-insurance-planner/checks/lens-analysis/analysis-setup-debt-treatment-saved-shape-check.js"], {
      cwd: workspaceRoot,
      encoding: "utf8"
    });

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

  const allowed = new Set([
    "life-insurance-planner/app/features/lens-analysis/analysis-setup.js",
    "life-insurance-planner/app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "life-insurance-planner/app/features/lens-analysis/income-impact-base-household-expense-stream.js",
    "life-insurance-planner/app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "life-insurance-planner/app/features/lens-analysis/analysis-setup.js",
    "life-insurance-planner/checks/lens-analysis/analysis-setup-entry-overlay-check.js",
    "life-insurance-planner/checks/lens-analysis/analysis-setup-debt-record-table-check.js",
    "life-insurance-planner/checks/lens-analysis/analysis-setup-debt-treatment-saved-shape-check.js",
    "life-insurance-planner/checks/lens-analysis/asset-growth-projection-source-mode-ui-check.js",
    "life-insurance-planner/checks/lens-analysis/asset-growth-ui-saved-only-check.js",
    "life-insurance-planner/checks/lens-analysis/cash-reserve-assumptions-ui-check.js",
    "life-insurance-planner/checks/lens-analysis/final-expense-inflation-prep-check.js",
    "life-insurance-planner/checks/lens-analysis/projected-asset-offset-analysis-setup-ui-check.js",
    "life-insurance-planner/app/features/lens-analysis/step-three-analysis-display.js",
    "life-insurance-planner/checks/lens-analysis/income-impact-treated-ongoing-support-consumption-check.js",
    "life-insurance-planner/checks/lens-analysis/income-loss-impact-survivor-income-runtime-diagnostic-check.js",
    "life-insurance-planner/checks/lens-analysis/survivor-income-gross-to-net-derivation-check.js",
    "life-insurance-planner/checks/lens-analysis/income-loss-impact-scenario-banner-check.js",
    "life-insurance-planner/checks/lens-analysis/analysis-setup-style-guard-utils.js",
    "life-insurance-planner/checks/lens-analysis/mortgage-treatment-payment-plan-model-check.js",
    "life-insurance-planner/checks/lens-analysis/step-three-treated-ongoing-support-display-check.js",
    "life-insurance-planner/checks/lens-analysis/treated-ongoing-support-method-consumption-check.js",
    "life-insurance-planner/checks/lens-analysis/treated-ongoing-support-model-check.js",
    "life-insurance-planner/checks/run-income-impact-suite.js",
    "life-insurance-planner/components.css",
    "life-insurance-planner/layout.css"
  ]);
  const changed = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: path.resolve(repoRoot, ".."),
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map(function (line) {
    return line.slice(3).trim();
  });
  const forbidden = changed.filter(function (filePath) {
    return !allowed.has(filePath)
      && !isAllowedSurvivorIncomeSourceFix(filePath)
      && !isAllowedSurvivorGrossToNetDerivationFix(filePath)
      && !isAllowedVisualTimelineStaleAssertionCorrection(filePath)
      && !isAllowedIncomeLossImpactDisplayAnalysisSettingsBootstrap(filePath)
      && !isAllowedIncomeLossImpactSurvivorIncomeDiagnosticSnapshot(filePath)
      && !isAllowedAssetDepletionLedgerSurplusDepositPass(filePath)
      && !isAllowedIncomeImpactGraphLayoutFramePass(filePath)
      && !isAllowedIncomeLossImpactLayoutFrameRendererPass(filePath)
      && !isAllowedIncomeImpactTransitionPeriodComposerTraceContract(filePath)
      && !isAllowedIncomeLossImpactTransitionPeriodScenarioControlDiff(filePath)
      && !isAllowedIncomeLossImpactTransitionPeriodGraphPropagationDiff(filePath)
      && !isAllowedAnalysisSetupMortgageTreatmentUi(filePath)
      && !isAllowedAnalysisSetupTransitionPeriodAssumptionDiff(filePath)
      && !isAllowedAnalysisSetupEducationDescriptionRemovalDiff(repoRoot, filePath)
      && !isAllowedAnalysisSetupStyleFoundationDiff(repoRoot, filePath);
  });
  assert.deepEqual(forbidden, [], "Only Income Impact support consumption files and focused checks should change.");
}

const composerContext = loadComposerContext();
const composeIncomeImpactScenario = composerContext.LensApp.lensAnalysis.composeIncomeImpactScenario;
assert.equal(typeof composeIncomeImpactScenario, "function");

const payoffInput = createComposerInput(createLensModel(), "followAssumptions");
const payoffInputBefore = cloneJson(payoffInput);
const payoffResult = composeIncomeImpactScenario(payoffInput);

assert.deepEqual(payoffInput, payoffInputBefore, "Composer must not mutate raw lens model input.");
assert.equal(payoffResult.trace.layer3.expensePolicy.supportBasis, "treatedOngoingSupport");
assert.equal(payoffResult.trace.layer3.expensePolicy.essentialSource, TREATED_ANNUAL_SOURCE);
assert.equal(payoffResult.trace.layer3.expensePolicy.essentialMonthlySource, TREATED_MONTHLY_SOURCE);
assert.equal(payoffResult.postDeathSeries.points[0].essentialNeeds, 2600);
assert.equal(payoffResult.postDeathSeries.points[0].survivorNeeds, 3600);
assert.equal(payoffInput.lensModel.ongoingSupport.annualTotalEssentialSupportCost, 60000);
assert.equal(getRiskOnlyMortgageSupport(payoffResult).length, 0, "Payoff treated mortgage plan should not create an ongoing risk-only mortgage identity.");

const continueLensModel = createLensModel({
  treatedOngoingSupport: {
    status: "ready",
    mortgageAdjusted: {
      monthlyMortgagePayment: 1234.56,
      monthlyAssociatedHousingCost: 600,
      monthlyHousingSupportCost: 1834.56,
      monthlyTotalEssentialSupportCost: 3834.56,
      annualTotalEssentialSupportCost: 46014.72
    }
  },
  treatedMortgagePaymentPlan: {
    status: "ready",
    mode: "continuePayments",
    finalMonthlyMortgagePayment: 1234.56,
    finalRemainingTermMonths: 180
  }
});
const continueResult = composeIncomeImpactScenario(createComposerInput(continueLensModel, "continueMortgagePayments"));
const continueMortgageSupports = getRiskOnlyMortgageSupport(continueResult);

assert.equal(continueResult.postDeathSeries.points[0].essentialNeeds, 3834.56);
assert.equal(continueResult.postDeathSeries.points[0].scheduledObligations, 0);
assert.equal(continueResult.postDeathSeries.summary.totalScheduledObligations, 0);
assert.equal(continueMortgageSupports.length, 1);
assert.equal(continueMortgageSupports[0].monthlyAmount, 1234.56);
assert.equal(continueMortgageSupports[0].termMonths, 180);
assert.equal(continueMortgageSupports[0].alreadyIncludedInNeeds, true);
assert.equal(continueMortgageSupports[0].riskOnlyObligation, true);
assert.equal(continueMortgageSupports[0].cashFlowIncluded, false);
assert.ok(continueMortgageSupports[0].sourcePaths.includes("lensModel.treatedMortgagePaymentPlan.finalMonthlyMortgagePayment"));
assert.ok(
  continueResult.postDeathSeries.layer3.warnings.some(function (warning) {
    return warning.code === "scheduled-obligation-already-included-in-needs";
  }),
  "Risk-only mortgage identity should remain out of cash-flow math."
);

const fallbackLensModel = createLensModel({
  treatedOngoingSupport: {
    status: "unavailable",
    mortgageAdjusted: {}
  },
  treatedMortgagePaymentPlan: {
    status: "unavailable"
  }
});
const fallbackResult = composeIncomeImpactScenario(createComposerInput(fallbackLensModel, "followAssumptions"));
assert.equal(fallbackResult.trace.layer3.expensePolicy.supportBasis, "ongoingSupportFallback");
assert.equal(fallbackResult.postDeathSeries.points[0].essentialNeeds, 5000);
assert.match(warningCodes(fallbackResult), /treated-ongoing-support-unavailable-for-income-impact/);

const baseStreamContext = loadBaseStreamContext();
const baseStreamApi = baseStreamContext.LensApp.lensAnalysis.incomeImpactBaseHouseholdExpenseStream;
const baseStreamResult = baseStreamApi.prepareIncomeImpactBaseHouseholdExpenseStream({
  lensModel: createLensModel()
});
const representedHousingRow = baseStreamResult.representedRows.find(function (row) {
  return row.expenseTypeKey === "ongoingSupportHousingReconciliation";
});
const rawHousingReferenceRow = baseStreamResult.referenceRows.find(function (row) {
  return row.expenseTypeKey === "rentOrMortgagePayment";
});

assert.equal(baseStreamResult.monthlyTotal, 2600);
assert.equal(baseStreamResult.parity.ongoingSupportMonthlyTotal, 2600);
assert.equal(baseStreamResult.parity.difference, 0);
assert.equal(baseStreamResult.trace.supportBasis, "treatedOngoingSupport");
assert.equal(baseStreamResult.trace.supportBasisSourcePath, TREATED_MONTHLY_SOURCE);
assert.ok(representedHousingRow);
assert.equal(representedHousingRow.baselineMonthlyAmount, 600);
assert.equal(representedHousingRow.trace.sourcePath, "lensModel.treatedOngoingSupport.mortgageAdjusted.monthlyHousingSupportCost");
assert.ok(rawHousingReferenceRow);
assert.equal(rawHousingReferenceRow.representedInBase, false);
assert.equal(rawHousingReferenceRow.trace.representedReason, "raw-housing-support-replaced-by-treated-ongoing-support");

const lifestyleContext = loadLifestyleContext();
const lifestyleApi = lifestyleContext.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;
const lifestyleResult = lifestyleApi.calculateIncomeImpactLifestyleScenario({
  lensModel: createLensModel(),
  basePostDeathSeries: createBasePostDeathSeries(),
  householdExpenseStreamPolicyMode: "activeGraphAdjustments",
  sliderValue: 0
});
assert.equal(lifestyleResult.totalBaselineMonthlyExpenses, 2600);
assert.equal(lifestyleResult.householdExpenseStreamPreview.baseHouseholdExpenseStream.monthlyTotal, 2600);
assert.equal(
  lifestyleResult.householdExpenseStreamPreview.baseHouseholdExpenseStream.trace.supportBasis,
  "treatedOngoingSupport"
);

assertNoForbiddenSourceChanges();

console.log("income-impact-treated-ongoing-support-consumption-check passed");
