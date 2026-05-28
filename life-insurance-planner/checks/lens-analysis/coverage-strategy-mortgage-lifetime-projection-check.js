#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-mortgage-lifetime-projection.js"
);
const needLineAdapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-need-line-adapter.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");
const needLineAdapterSource = fs.readFileSync(needLineAdapterPath, "utf8");

function createHarness() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  vm.runInContext(needLineAdapterSource, context, { filename: needLineAdapterPath });
  return context.LensApp.lensAnalysis;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function monthlyPayment(principal, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 1200;
  return Number((principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)))).toFixed(2));
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

function createNeedsResult() {
  return {
    method: "needsAnalysis",
    components: {
      debtPayoff: 400000,
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
        value: 400000,
        inputs: {
          preparedMortgagePayoffAmount: 400000,
          preparedNonMortgageDebtAmount: 0,
          rawMortgageAmount: 400000,
          rawNonMortgageDebtAmount: 0
        },
        sourcePaths: ["treatedDebtPayoff.needs"]
      }
    ]
  };
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1986-01-01"
    },
    debtPayoff: {
      mortgageBalance: 400000
    },
    ongoingSupport: {
      monthlyMortgagePayment: monthlyPayment(400000, 6, 360),
      mortgageRemainingTermMonths: 360,
      mortgageInterestRatePercent: 6
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 400000,
      immediatePayoffAmount: 400000,
      payoffPercent: 100,
      originalMonthlyMortgagePayment: monthlyPayment(400000, 6, 360),
      originalRemainingTermMonths: 360,
      interestRatePercent: 6,
      finalMonthlyMortgagePayment: 0,
      finalRemainingTermMonths: 0
    },
    ...overrides
  };
}

assert.doesNotMatch(helperSource, /\bdocument\b/);
assert.doesNotMatch(helperSource, /\blocalStorage\b/);
assert.doesNotMatch(helperSource, /\bsessionStorage\b/);
assert.doesNotMatch(helperSource, /\bquerySelector\b/);
assert.match(helperSource, /module\.exports/);

const harness = createHarness();
const buildMortgageLifetimeProjection = harness.buildMortgageLifetimeProjection;
const buildCoverageStrategyNeedLine = harness.buildCoverageStrategyNeedLine;
assert.equal(typeof buildMortgageLifetimeProjection, "function");
assert.equal(typeof buildCoverageStrategyNeedLine, "function");

const baseInput = {
  currentBalance: 400000,
  annualInterestRate: 6,
  monthlyPayment: monthlyPayment(400000, 6, 360),
  remainingTermMonths: 360,
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(35)
};
const before = clone(baseInput);
const percentRate = buildMortgageLifetimeProjection(baseInput);
const decimalRate = buildMortgageLifetimeProjection({
  ...baseInput,
  annualInterestRate: 0.06
});
assert.deepEqual(baseInput, before, "Projection helper should not mutate inputs.");
assert.equal(percentRate.assumptionsUsed.annualInterestRate, 0.06);
assert.equal(decimalRate.assumptionsUsed.annualInterestRate, 0.06);
assert.equal(percentRate.mortgagePoints[15].projectedBalance, decimalRate.mortgagePoints[15].projectedBalance);
assert.equal(percentRate.mortgagePoints[0].projectedBalance, 400000);
assert.ok(percentRate.mortgagePoints[10].projectedBalance < percentRate.mortgagePoints[0].projectedBalance);
assert.ok(percentRate.mortgagePoints[20].projectedBalance < percentRate.mortgagePoints[10].projectedBalance);
assert.equal(percentRate.mortgagePoints[30].projectedBalance, 0);
assert.equal(percentRate.mortgagePoints[35].payoffObligationAmount, 0);
assert.ok(percentRate.mortgagePoints.every((point) => point.projectedBalance >= 0));

const straightLine = buildMortgageLifetimeProjection({
  currentBalance: 400000,
  annualInterestRate: null,
  monthlyPayment: null,
  remainingTermMonths: 360,
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(35)
});
assert.equal(straightLine.assumptionsUsed.projectionMode, "straightLineFallback");
assert.ok(issueCodes(straightLine.warnings).includes("mortgage-projection-rate-missing-straight-line"));
assert.equal(straightLine.mortgagePoints[15].projectedBalance, 200000);
assert.equal(straightLine.mortgagePoints[30].projectedBalance, 0);

const missingTerm = buildMortgageLifetimeProjection({
  currentBalance: 400000,
  annualInterestRate: 6,
  monthlyPayment: monthlyPayment(400000, 6, 360),
  remainingTermMonths: null,
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(3)
});
assert.equal(missingTerm.assumptionsUsed.projectionMode, "flatFallback");
assert.ok(issueCodes(missingTerm.dataGaps).includes("mortgage-projection-term-missing"));
assert.equal(missingTerm.mortgagePoints[3].projectedBalance, 400000);

const negativeAmortization = buildMortgageLifetimeProjection({
  currentBalance: 400000,
  annualInterestRate: 6,
  monthlyPayment: 10,
  remainingTermMonths: 360,
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(5)
});
assert.equal(negativeAmortization.assumptionsUsed.projectionMode, "flatFallback");
assert.ok(issueCodes(negativeAmortization.warnings).includes("mortgage-projection-negative-amortization-flat-fallback"));
assert.equal(negativeAmortization.mortgagePoints[5].projectedBalance, 400000);

const noBalance = buildMortgageLifetimeProjection({
  currentBalance: null,
  annualInterestRate: 6,
  monthlyPayment: 2000,
  remainingTermMonths: 360,
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1)
});
assert.equal(noBalance.mortgagePoints.length, 0);
assert.ok(issueCodes(noBalance.dataGaps).includes("mortgage-projection-balance-missing"));

const needLine = buildCoverageStrategyNeedLine({
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  valuationDate: "2026-01-01",
  horizonYears: 35
});
assert.equal(needLine.needPoints[0].componentAmounts.mortgage, 400000);
assert.ok(
  needLine.needPoints[15].componentAmounts.mortgage < needLine.needPoints[0].componentAmounts.mortgage,
  "Coverage Strategy payoff-mode mortgage should decline when amortization facts exist."
);
assert.equal(needLine.needPoints[30].componentAmounts.mortgage, 0);
assert.equal(needLine.needPoints[35].componentAmounts.mortgage, 0);
assert.equal(
  needLine.needPoints[15].trace.mortgageProjection.projectionMode,
  "amortized"
);
assert.equal(
  needLine.componentModels.mortgageLifetimeProjection.assumptionsUsed.projectionMode,
  "amortized"
);

const fallbackNeedLine = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 400000,
      immediatePayoffAmount: 400000,
      payoffPercent: 100,
      originalMonthlyMortgagePayment: monthlyPayment(400000, 6, 360),
      originalRemainingTermMonths: null,
      interestRatePercent: 6
    },
    ongoingSupport: {
      monthlyMortgagePayment: monthlyPayment(400000, 6, 360),
      mortgageRemainingTermMonths: null,
      mortgageInterestRatePercent: 6
    }
  }),
  needsResult: createNeedsResult(),
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.ok(issueCodes(fallbackNeedLine.dataGaps).includes("mortgage-projection-term-missing"));
assert.equal(fallbackNeedLine.needPoints[5].componentAmounts.mortgage, 400000);
assert.equal(fallbackNeedLine.needPoints[5].trace.mortgageProjection.projectionMode, "flatFallback");

const supportMode = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "continuePayments",
      finalMonthlyMortgagePayment: 2000,
      finalRemainingTermMonths: 24
    }
  }),
  needsResult: createNeedsResult(),
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.equal(supportMode.needPoints[0].componentAmounts.mortgage, 48000);
assert.equal(supportMode.needPoints[1].componentAmounts.mortgage, 24000);
assert.equal(supportMode.needPoints[2].componentAmounts.mortgage, 0);
assert.equal(supportMode.componentModels.debtAndMortgage.mortgageTiming, "time-bounded-payment-stream");

assert.doesNotMatch(needLineAdapterSource, /resourceAmount|existingCoverageAmount|remainingExposureAmount/);

console.log("coverage strategy mortgage lifetime projection check passed");
