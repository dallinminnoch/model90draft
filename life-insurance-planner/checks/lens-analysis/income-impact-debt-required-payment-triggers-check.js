#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");

function readFeature(relativePath) {
  return fs.readFileSync(path.join(featureRoot, relativePath), "utf8");
}

function loadFeature(context, relativePath) {
  vm.runInContext(readFeature(relativePath), context, { filename: relativePath });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createNormalizeContext() {
  const context = {
    console,
    window: null,
    LensApp: { lensAnalysis: {} }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  [
    "asset-taxonomy.js",
    "debt-taxonomy.js",
    "debt-library.js",
    "expense-taxonomy.js",
    "expense-library.js",
    "normalize-lens-model.js"
  ].forEach((relativePath) => loadFeature(context, relativePath));
  return context;
}

function createComposerContext() {
  const context = {
    console,
    window: null,
    LensApp: { lensAnalysis: {} }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  [
    "asset-taxonomy.js",
    "asset-treatment-calculations.js",
    "household-wealth-projection-calculations.js",
    "household-death-event-availability-calculations.js",
    "household-survivor-runway-calculations.js",
    "income-impact-scenario-composer-calculations.js"
  ].forEach((relativePath) => loadFeature(context, relativePath));
  return context;
}

function createDebtRecord(overrides = {}) {
  return {
    debtId: overrides.debtId || "debt-explicit",
    categoryKey: overrides.categoryKey || "unsecuredConsumerDebt",
    typeKey: overrides.typeKey || "personalLoan",
    label: overrides.label || "Debt",
    currentBalance: overrides.currentBalance == null ? 1200 : overrides.currentBalance,
    paymentFrequency: overrides.paymentFrequency || "monthly",
    paymentAmount: overrides.paymentAmount == null ? 100 : overrides.paymentAmount,
    interestRatePercent: overrides.interestRatePercent == null ? 0 : overrides.interestRatePercent,
    remainingTermMonths: overrides.remainingTermMonths,
    paymentType: overrides.paymentType,
    isRevolving: overrides.isRevolving,
    ...overrides
  };
}

function buildExpenseFactsFromDebtRecords(records) {
  const context = createNormalizeContext();
  return context.LensApp.lensAnalysis.createExpenseFactsFromSourceData({
    debtRecords: records
  });
}

function findGeneratedPayment(expenseFacts, sourceDebtRecordId) {
  return expenseFacts.expenses.find((expense) => expense.sourceDebtRecordId === sourceDebtRecordId);
}

function warningCodesFromExpenseFacts(expenseFacts) {
  return (expenseFacts.metadata?.warnings || []).map((warning) => warning.code);
}

const expenseFacts = buildExpenseFactsFromDebtRecords([
  createDebtRecord({
    debtId: "explicit-36",
    typeKey: "personalLoan",
    currentBalance: 3600,
    paymentAmount: 100,
    interestRatePercent: 0,
    remainingTermMonths: 36
  }),
  createDebtRecord({
    debtId: "calculated-term",
    typeKey: "personalLoan",
    currentBalance: 1200,
    paymentAmount: 110,
    interestRatePercent: 12,
    remainingTermMonths: ""
  }),
  createDebtRecord({
    debtId: "low-card",
    typeKey: "creditCard",
    currentBalance: 10000,
    paymentAmount: 10,
    interestRatePercent: 24,
    remainingTermMonths: ""
  }),
  createDebtRecord({
    debtId: "missing-term",
    typeKey: "autoLoan",
    currentBalance: 8000,
    paymentAmount: 200,
    interestRatePercent: "",
    remainingTermMonths: ""
  }),
  createDebtRecord({
    debtId: "zero-payment",
    typeKey: "personalLoan",
    currentBalance: 1000,
    paymentAmount: 0,
    interestRatePercent: 5,
    remainingTermMonths: 12
  })
]);

const explicitSchedule = findGeneratedPayment(expenseFacts, "explicit-36").metadata.debtPaymentSchedule;
assert.equal(explicitSchedule.status, "scheduled");
assert.equal(explicitSchedule.remainingTermMonths, 36);
assert.equal(explicitSchedule.termSource, "explicit-remaining-term");

const calculatedSchedule = findGeneratedPayment(expenseFacts, "calculated-term").metadata.debtPaymentSchedule;
assert.equal(calculatedSchedule.status, "scheduled");
assert.equal(calculatedSchedule.termSource, "calculated-amortization");
assert.ok(calculatedSchedule.remainingTermMonths > 0);

const lowCardSchedule = findGeneratedPayment(expenseFacts, "low-card").metadata.debtPaymentSchedule;
assert.equal(lowCardSchedule.status, "ongoing");
assert.equal(lowCardSchedule.unresolvedRevolving, true);
assert.equal(lowCardSchedule.warningCodes.includes("payment-does-not-amortize-balance"), true);

const missingTermSchedule = findGeneratedPayment(expenseFacts, "missing-term").metadata.debtPaymentSchedule;
assert.equal(missingTermSchedule.status, "unavailable");
assert.equal(missingTermSchedule.warningCodes.includes("debt-payoff-term-unavailable"), true);

const zeroPaymentSchedule = findGeneratedPayment(expenseFacts, "zero-payment").metadata.debtPaymentSchedule;
assert.equal(zeroPaymentSchedule.status, "unavailable");
assert.equal(zeroPaymentSchedule.warningCodes.includes("invalid-debt-payment-amount"), true);

const scheduleWarningCodes = warningCodesFromExpenseFacts(expenseFacts);
assert.equal(scheduleWarningCodes.includes("payment-does-not-amortize-balance"), true);
assert.equal(scheduleWarningCodes.includes("debt-payoff-term-unavailable"), true);
assert.equal(scheduleWarningCodes.includes("invalid-debt-payment-amount"), true);

function makeGeneratedDebtExpense(id, monthlyAmount, termMonths, overrides = {}) {
  return {
    expenseFactId: `generated_debt_payment_expense_${id}`,
    label: overrides.label || "Required Debt Payment",
    isGeneratedExpense: true,
    isDebtPaymentExpense: true,
    isDebtObligation: true,
    sourceDebtRecordId: id,
    sourceDebtTypeKey: overrides.sourceDebtTypeKey || "personalLoan",
    sourcePath: `protectionModeling.data.debtRecords.${id}`,
    monthlyRecurringAmount: monthlyAmount,
    remainingTermMonths: termMonths,
    metadata: {
      debtPaymentSchedule: {
        status: overrides.status || "scheduled",
        monthlyPayment: monthlyAmount,
        remainingTermMonths: termMonths,
        termMonths,
        termSource: overrides.termSource || "explicit-remaining-term",
        warningCodes: overrides.warningCodes || [],
        unresolvedRevolving: overrides.unresolvedRevolving === true
      }
    }
  };
}

function createComposerInput() {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2026-01-01",
    selectedDeathAge: 40,
    projectionHorizonMonths: 48,
    lensModel: {
      assetFacts: {
        assets: [
          {
            id: "cash",
            categoryKey: "cashAndCashEquivalents",
            label: "Cash",
            currentValue: 200000,
            sourcePaths: ["assetFacts.assets.0.currentValue"]
          }
        ]
      },
      incomeBasis: {
        insuredNetAnnualIncome: 100000,
        spouseOrPartnerNetAnnualIncome: 0
      },
      ongoingSupport: {
        annualTotalEssentialSupportCost: 12000
      },
      survivorScenario: {
        survivorNetAnnualIncome: 0,
        survivorIncomeStartDelayMonths: 0
      },
      treatedExistingCoverageOffset: {
        totalTreatedCoverageOffset: 0,
        warnings: [],
        sourcePaths: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
      },
      finalExpenses: {
        totalFinalExpenseNeed: 0
      },
      transitionNeeds: {
        totalTransitionNeed: 0
      },
      treatedDebtPayoff: {
        debts: [
          {
            debtFactId: "active-36",
            isMortgage: false,
            treatmentMode: "exclude",
            included: false,
            rawBalance: 3600,
            treatedAmount: 0
          },
          {
            debtFactId: "paid-at-death",
            isMortgage: false,
            treatmentMode: "payoff",
            included: true,
            rawBalance: 2400,
            treatedAmount: 2400
          }
        ]
      },
      expenseFacts: {
        expenses: [
          makeGeneratedDebtExpense("active-36", 100, 36),
          makeGeneratedDebtExpense("paid-at-death", 200, 24)
        ]
      }
    },
    analysisSettings: {
      assetTreatmentAssumptions: {
        enabled: true,
        assets: {
          cashAndCashEquivalents: {
            include: true,
            treatmentPreset: "cash-like",
            taxTreatment: "no-tax-drag",
            taxDragPercent: 0,
            liquidityHaircutPercent: 0
          }
        }
      }
    },
    scenarioOptions: {}
  };
}

const composerContext = createComposerContext();
const originalLayer3 = composerContext.LensApp.lensAnalysis.calculateHouseholdSurvivorRunway;
const captured = {};
composerContext.LensApp.lensAnalysis.calculateHouseholdSurvivorRunway = function (input) {
  captured.layer3Input = cloneJson(input);
  const output = originalLayer3(input);
  captured.layer3Output = cloneJson(output);
  return output;
};

const scenario = composerContext.LensApp.lensAnalysis.composeIncomeImpactScenario(createComposerInput());
const debtObligations = captured.layer3Input.scheduledObligations.filter((obligation) => obligation.category === "requiredDebtPayment");
assert.equal(debtObligations.length, 1);
assert.equal(debtObligations[0].id, "generated_debt_payment_expense_active-36");
assert.equal(debtObligations[0].monthlyAmount, 100);
assert.equal(debtObligations[0].termMonths, 36);
assert.equal(
  scenario.trace.layer3.debtRequiredPaymentSchedule.excludedObligations.some((row) => row.sourceDebtRecordId === "paid-at-death"),
  true,
  "paid-off-at-death debt should be excluded from ongoing debt schedule"
);
assert.equal(captured.layer3Output.points.find((point) => point.monthIndex === 1).scheduledObligations, 100);
assert.equal(captured.layer3Output.points.find((point) => point.monthIndex === 36).scheduledObligations, 100);
assert.equal(captured.layer3Output.points.find((point) => point.monthIndex === 37).scheduledObligations, 0);

const storyline = require(path.join(featureRoot, "income-impact-financial-storyline-calculations.js"));

function buildStorylineWithDebtSchedule({ obligations, runoutMonth = 24, depleted = true, horizonMonths = 48 }) {
  const points = Array.from({ length: horizonMonths + 1 }, (_, monthIndex) => ({
    monthIndex,
    remainingResources: depleted && monthIndex >= runoutMonth ? 0 : 1000
  }));
  return storyline.buildIncomeImpactFinancialStorylineCandidates({
    scenario: {
      scenario: {
        selectedDeathDate: "2026-01-01",
        projectionHorizonMonths: horizonMonths
      },
      deathEvent: {
        date: "2026-01-01"
      },
      timelineFacts: {
        monthsCovered: depleted ? runoutMonth : null
      },
      postDeathSeries: {
        points,
        depletion: {
          depleted,
          depletionMonthIndex: depleted ? runoutMonth : null
        }
      },
      trace: {
        layer3: {
          debtRequiredPaymentSchedule: {
            status: "ready",
            obligations
          }
        }
      }
    }
  });
}

function findCandidate(result, id) {
  return result.allCandidates.find((candidate) => candidate.id === id);
}

const runoutDebtStoryline = buildStorylineWithDebtSchedule({
  obligations: [
    {
      id: "active-36",
      monthlyAmount: 100,
      termMonths: 36,
      sourcePaths: ["scenario.trace.layer3.debtRequiredPaymentSchedule.obligations.0"]
    }
  ],
  runoutMonth: 24
});
assert.ok(findCandidate(runoutDebtStoryline, "minimum-debt-payments-continue"));
assert.equal(findCandidate(runoutDebtStoryline, "minimum-debt-payments-continue").supportingDotOnly, true);
assert.ok(findCandidate(runoutDebtStoryline, "minimum-debt-payments-compete-with-expenses"));
assert.equal(findCandidate(runoutDebtStoryline, "minimum-debt-payments-compete-with-expenses").severity, "at-risk");
assert.ok(findCandidate(runoutDebtStoryline, "minimum-debt-payments-become-unsupported"));
assert.equal(findCandidate(runoutDebtStoryline, "minimum-debt-payments-become-unsupported").severity, "critical");
assert.equal(findCandidate(runoutDebtStoryline, "required-debt-payments-covered"), undefined);

const coveredDebtStoryline = buildStorylineWithDebtSchedule({
  obligations: [
    {
      id: "short-debt",
      monthlyAmount: 100,
      termMonths: 12,
      sourcePaths: ["scenario.trace.layer3.debtRequiredPaymentSchedule.obligations.0"]
    }
  ],
  runoutMonth: 24
});
assert.ok(findCandidate(coveredDebtStoryline, "required-debt-payments-covered"));
assert.equal(findCandidate(coveredDebtStoryline, "minimum-debt-payments-become-unsupported"), undefined);
assert.equal(findCandidate(coveredDebtStoryline, "minimum-debt-payments-compete-with-expenses"), undefined);

const fundedDebtStoryline = buildStorylineWithDebtSchedule({
  obligations: [
    {
      id: "ongoing-debt",
      monthlyAmount: 100,
      termMonths: null,
      sourcePaths: ["scenario.trace.layer3.debtRequiredPaymentSchedule.obligations.0"]
    }
  ],
  runoutMonth: null,
  depleted: false
});
assert.ok(findCandidate(fundedDebtStoryline, "required-debt-payments-covered"));
assert.equal(findCandidate(fundedDebtStoryline, "minimum-debt-payments-become-unsupported"), undefined);

const paidOffOnlyStoryline = buildStorylineWithDebtSchedule({
  obligations: [],
  runoutMonth: 12
});
assert.equal(paidOffOnlyStoryline.trace.debtTriggerCandidateIds.length, 0);

const forbiddenTitles = new Set([
  "Expenses Begin Competing With Debt Payments",
  "Debt Payments Pressure Monthly Expenses",
  "Monthly Bills Become Unsupported"
]);
runoutDebtStoryline.allCandidates.forEach((candidate) => {
  assert.equal(forbiddenTitles.has(candidate.cardTitle), false, `${candidate.cardTitle} should not be emitted`);
});

console.log("Income Impact required debt payment trigger checks passed.");
