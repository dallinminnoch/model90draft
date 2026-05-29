#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(repoRoot, "app", "features", "lens-analysis", "coverage-strategy-debt-lifetime-projection.js");
const mortgagePath = path.join(repoRoot, "app", "features", "lens-analysis", "coverage-strategy-mortgage-lifetime-projection.js");
const needLinePath = path.join(repoRoot, "app", "features", "lens-analysis", "coverage-strategy-need-line-adapter.js");
const diagnosticPath = path.join(repoRoot, "app", "features", "lens-analysis", "coverage-strategy-diagnostic-export.js");

const helperSource = fs.readFileSync(helperPath, "utf8");
const mortgageSource = fs.readFileSync(mortgagePath, "utf8");
const needLineSource = fs.readFileSync(needLinePath, "utf8");
const diagnosticSource = fs.readFileSync(diagnosticPath, "utf8");

function createHarness() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    },
    location: {
      href: "http://localhost/coverage-strategy.html"
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  vm.runInContext(mortgageSource, context, { filename: mortgagePath });
  vm.runInContext(needLineSource, context, { filename: needLinePath });
  vm.runInContext(diagnosticSource, context, { filename: diagnosticPath });
  return context.LensApp.lensAnalysis;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.code);
}

function createNeedPoints(horizonYears) {
  return Array.from({ length: horizonYears + 1 }, (_unused, yearIndex) => ({
    yearIndex,
    date: `${2026 + yearIndex}-01-01`,
    calendarYear: 2026 + yearIndex,
    age: 40 + yearIndex
  }));
}

function createNeedsResult(debtPayoff) {
  return {
    method: "needsAnalysis",
    components: {
      debtPayoff,
      essentialSupport: 0,
      education: 0,
      finalExpenses: 0,
      healthcareExpenses: 0,
      transitionNeeds: 0,
      discretionarySupport: 0
    },
    assumptions: {
      valuationDate: "2026-01-01",
      needsSupportDurationYears: 0
    },
    trace: [
      {
        key: "debtPayoff",
        value: debtPayoff,
        inputs: {
          preparedMortgagePayoffAmount: 0,
          preparedNonMortgageDebtAmount: debtPayoff,
          rawMortgageAmount: 0,
          rawNonMortgageDebtAmount: debtPayoff
        },
        sourcePaths: ["treatedDebtPayoff.needs"]
      }
    ]
  };
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirth: "1986-01-01"
    },
    debtFacts: {
      debts: [
        {
          debtFactId: "auto_fact",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          label: "Auto Loan",
          currentBalance: 12000,
          minimumMonthlyPayment: 1000,
          interestRatePercent: 0,
          remainingTermMonths: 12,
          sourcePath: "debtFacts.debts[0]"
        },
        {
          debtFactId: "flat_fact",
          categoryKey: "otherDebt",
          typeKey: "personalLoan",
          label: "Timing Unavailable Debt",
          currentBalance: 8000,
          minimumMonthlyPayment: null,
          interestRatePercent: null,
          remainingTermMonths: null,
          sourcePath: "debtFacts.debts[1]"
        }
      ]
    },
    treatedDebtPayoff: {
      debts: [
        {
          debtFactId: "auto_fact",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          label: "Auto Loan",
          isMortgage: false,
          rawBalance: 12000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 12000,
          treatmentMode: "payoff"
        },
        {
          debtFactId: "flat_fact",
          categoryKey: "otherDebt",
          typeKey: "personalLoan",
          label: "Timing Unavailable Debt",
          isMortgage: false,
          rawBalance: 8000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 8000,
          treatmentMode: "payoff"
        }
      ],
      needs: {
        debtPayoffAmount: 20000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 20000
      }
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 0,
      immediatePayoffAmount: 0,
      payoffPercent: 100
    }
  };
}

assert.doesNotMatch(helperSource, /\bdocument\b/);
assert.doesNotMatch(helperSource, /\blocalStorage\b/);
assert.doesNotMatch(helperSource, /\bsessionStorage\b/);
assert.doesNotMatch(helperSource, /\bquerySelector\b/);

const harness = createHarness();
const buildProjection = harness.calculateCoverageStrategyNonMortgageDebtLifetimeProjection;
const buildNeedLine = harness.buildCoverageStrategyNeedLine;
const buildDiagnostic = harness.buildCoverageStrategyDiagnosticExportSnapshot;
assert.equal(typeof buildProjection, "function");
assert.equal(typeof buildNeedLine, "function");
assert.equal(typeof buildDiagnostic, "function");

const autoLoanInput = {
  projectionYears: 5,
  valuationDate: "2026-01-01",
  debts: [
    {
      debtId: "auto-31000",
      categoryKey: "securedConsumerDebt",
      typeKey: "autoLoan",
      label: "Auto Loan",
      balance: 31000,
      monthlyPayment: 383,
      interestRatePercent: 6,
      remainingTermMonths: 45,
      sourcePath: "fixture.debts[0]",
      treatmentMode: "payoff"
    }
  ]
};
const autoLoanBefore = clone(autoLoanInput);
const autoLoan = buildProjection(autoLoanInput);
assert.deepEqual(autoLoanInput, autoLoanBefore, "Non-mortgage debt projection helper must not mutate inputs.");
assert.equal(autoLoan.assumptionsUsed.projectionModeCounts.amortized, 1);
assert.equal(autoLoan.debtPoints[0].payoffObligationAmount, 31000);
assert.ok(autoLoan.debtPoints[1].payoffObligationAmount < autoLoan.debtPoints[0].payoffObligationAmount);
assert.equal(autoLoan.debtPoints[4].payoffObligationAmount, 0);
assert.equal(autoLoan.debtPoints[5].payoffObligationAmount, 0);

const creditCard = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(5),
  debts: [
    {
      debtFactId: "credit-card",
      categoryKey: "unsecuredConsumerDebt",
      typeKey: "creditCard",
      label: "Credit Card",
      currentBalance: 6000,
      minimumMonthlyPayment: 200,
      interestRatePercent: 19,
      treatmentMode: "payoff"
    }
  ]
});
assert.equal(creditCard.assumptionsUsed.projectionModeCounts.amortized, 1);
assert.ok(creditCard.debtPoints.every((point) => point.payoffObligationAmount >= 0));
assert.ok(creditCard.debtPoints[1].payoffObligationAmount < creditCard.debtPoints[0].payoffObligationAmount);

const termStraightLine = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(3),
  debts: [
    {
      debtFactId: "term-only",
      categoryKey: "otherDebt",
      currentBalance: 12000,
      remainingTermMonths: 36,
      treatmentMode: "payoff"
    }
  ]
});
assert.equal(termStraightLine.assumptionsUsed.projectionModeCounts.termStraightLine, 1);
assert.equal(termStraightLine.debtPoints[1].payoffObligationAmount, 8000);
assert.equal(termStraightLine.debtPoints[2].payoffObligationAmount, 4000);
assert.equal(termStraightLine.debtPoints[3].payoffObligationAmount, 0);

const paymentStraightLine = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1),
  debts: [
    {
      debtFactId: "payment-only",
      categoryKey: "otherDebt",
      currentBalance: 6000,
      minimumMonthlyPayment: 250,
      treatmentMode: "payoff"
    }
  ]
});
assert.equal(paymentStraightLine.assumptionsUsed.projectionModeCounts.paymentStraightLine, 1);
assert.equal(paymentStraightLine.debtPoints[1].payoffObligationAmount, 3000);

const flatFallback = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(2),
  debts: [
    {
      debtFactId: "timing-missing",
      categoryKey: "otherDebt",
      currentBalance: 8000,
      treatmentMode: "payoff"
    }
  ]
});
assert.equal(flatFallback.assumptionsUsed.projectionModeCounts.flatFallback, 1);
assert.ok(issueCodes(flatFallback.dataGaps).includes("debt-projection-payoff-timing-unavailable"));
assert.equal(flatFallback.debtPoints[2].payoffObligationAmount, 8000);

const mortgageExcluded = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1),
  debts: [
    {
      debtFactId: "mortgage",
      categoryKey: "realEstateSecuredDebt",
      typeKey: "mortgageBalance",
      currentBalance: 400000,
      monthlyPayment: 2500,
      interestRatePercent: 5,
      remainingTermMonths: 300
    }
  ]
});
assert.equal(mortgageExcluded.assumptionsUsed.debtsIncludedCount, 0);
assert.equal(mortgageExcluded.trace.excludedDebts[0].exclusionReason, "mortgage-debt-excluded");

const optionExcluded = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1),
  options: {
    includeCreditCards: false
  },
  debts: [
    {
      debtFactId: "credit-card-excluded",
      typeKey: "creditCard",
      currentBalance: 6000,
      minimumMonthlyPayment: 200,
      interestRatePercent: 19
    }
  ]
});
assert.equal(optionExcluded.assumptionsUsed.debtsIncludedCount, 0);
assert.equal(optionExcluded.trace.excludedDebts[0].exclusionReason, "option-excluded");

const unavailable = buildProjection({
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1),
  debts: [
    {
      debtFactId: "missing-amount",
      categoryKey: "otherDebt",
      currentBalance: null,
      treatmentMode: "payoff"
    }
  ]
});
assert.ok(issueCodes(unavailable.dataGaps).includes("debt-projection-amount-unavailable"));
assert.equal(unavailable.trace.excludedDebts[0].exclusionReason, "unavailable");

const needLine = buildNeedLine({
  lensModel: createLensModel(),
  needsResult: createNeedsResult(20000),
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.equal(needLine.needPoints[0].componentAmounts.debtPayoff, 20000);
assert.ok(needLine.needPoints[1].componentAmounts.debtPayoff < 20000);
assert.equal(needLine.needPoints[2].componentAmounts.debtPayoff, 8000);
assert.equal(needLine.needPoints[3].componentAmounts.debtPayoff, 8000);
assert.equal(needLine.needPoints[1].trace.debtProjection.projectionModeCounts.amortized, 1);
assert.equal(needLine.needPoints[1].trace.debtProjection.projectionModeCounts.flatFallback, 1);
assert.ok(needLine.componentModels.nonMortgageDebtLifetimeProjection);
assert.equal(needLine.componentModels.nonMortgageDebtLifetimeProjection.debtPoints[0].payoffObligationAmount, 20000);

const diagnostic = buildDiagnostic({
  lensModel: createLensModel(),
  needLine,
  visibleScenarioControls: {
    projectionHorizon: true,
    educationResourceSpendingMode: true,
    educationPaymentScheduleMode: true,
    projectedDependentBirthYear: true,
    diagnosticExport: true
  }
});
assert.ok(diagnostic.coverageStrategyGeneratedOutputs.nonMortgageDebtLifetimeProjection);
assert.equal(
  diagnostic.coverageStrategyGeneratedOutputs.nonMortgageDebtLifetimeProjection.assumptionsUsed.projectionModeCounts.amortized,
  1
);
assert.equal(
  diagnostic.coverageStrategyGeneratedOutputs.nonMortgageDebtLifetimeProjection.assumptionsUsed.projectionModeCounts.flatFallback,
  1
);

JSON.stringify(autoLoan);
JSON.stringify(needLine.componentModels.nonMortgageDebtLifetimeProjection);

console.log("coverage strategy nonmortgage debt lifetime projection check passed");
