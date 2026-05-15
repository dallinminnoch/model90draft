#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
  function isAllowedAnalysisSetupMortgageTreatmentUi(filePath) {
    if (filePath !== "life-insurance-planner/pages/analysis-setup.html") {
      return false;
    }
    const diff = execFileSync("git", ["diff", "--", "./life-insurance-planner/pages/analysis-setup.html"], {
      cwd: path.resolve(repoRoot, ".."),
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
    return redesignDiff || previewDiff || legacyCleanupDiff || debtRecordTableHeaderDiff;
  }

  const allowed = new Set([
    "life-insurance-planner/app/features/lens-analysis/analysis-setup.js",
    "life-insurance-planner/app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
    "life-insurance-planner/app/features/lens-analysis/income-impact-base-household-expense-stream.js",
    "life-insurance-planner/app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "life-insurance-planner/checks/lens-analysis/analysis-setup-debt-record-table-check.js",
    "life-insurance-planner/checks/lens-analysis/analysis-setup-debt-treatment-saved-shape-check.js",
    "life-insurance-planner/app/features/lens-analysis/step-three-analysis-display.js",
    "life-insurance-planner/checks/lens-analysis/income-impact-treated-ongoing-support-consumption-check.js",
    "life-insurance-planner/checks/lens-analysis/income-loss-impact-scenario-banner-check.js",
    "life-insurance-planner/checks/lens-analysis/mortgage-treatment-payment-plan-model-check.js",
    "life-insurance-planner/checks/lens-analysis/step-three-treated-ongoing-support-display-check.js",
    "life-insurance-planner/checks/lens-analysis/treated-ongoing-support-method-consumption-check.js",
    "life-insurance-planner/checks/lens-analysis/treated-ongoing-support-model-check.js",
    "life-insurance-planner/checks/run-income-impact-suite.js"
  ]);
  const changed = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: path.resolve(repoRoot, ".."),
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map(function (line) {
    return line.slice(3).trim();
  });
  const forbidden = changed.filter(function (filePath) {
    return !allowed.has(filePath) && !isAllowedAnalysisSetupMortgageTreatmentUi(filePath);
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
