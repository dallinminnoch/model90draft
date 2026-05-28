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
  "coverage-strategy-debt-lifetime-projection.js"
);
const mortgageProjectionPath = path.join(
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
const pagePath = path.join(repoRoot, "pages", "coverage-strategy.html");
const helperSource = fs.readFileSync(helperPath, "utf8");
const mortgageProjectionSource = fs.readFileSync(mortgageProjectionPath, "utf8");
const needLineAdapterSource = fs.readFileSync(needLineAdapterPath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");

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
  vm.runInContext(mortgageProjectionSource, context, { filename: mortgageProjectionPath });
  vm.runInContext(needLineAdapterSource, context, { filename: needLineAdapterPath });
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

function createNeedsResult(overrides = {}) {
  return {
    method: "needsAnalysis",
    components: {
      debtPayoff: 372000,
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
        value: 372000,
        inputs: {
          preparedMortgagePayoffAmount: 240000,
          preparedNonMortgageDebtAmount: 132000,
          rawMortgageAmount: 240000,
          rawNonMortgageDebtAmount: 132000
        },
        sourcePaths: ["treatedDebtPayoff.needs"]
      }
    ],
    ...overrides
  };
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1986-01-01"
    },
    debtFacts: {
      debts: [
        {
          debtFactId: "mortgage_fact",
          categoryKey: "realEstateSecuredDebt",
          typeKey: "mortgageBalance",
          label: "Primary Residence Mortgage",
          sourceKey: "mortgageBalance",
          currentBalance: 240000
        },
        {
          debtFactId: "auto_fact",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          label: "Auto Loan",
          sourceKey: "autoLoan",
          currentBalance: 12000,
          minimumMonthlyPayment: 1000,
          interestRatePercent: 0,
          remainingTermMonths: 12
        },
        {
          debtFactId: "student_fact",
          categoryKey: "educationDebt",
          typeKey: "studentLoan",
          label: "Student Loan",
          sourceKey: "studentLoan",
          currentBalance: 120000,
          minimumMonthlyPayment: 2319.29,
          interestRatePercent: 6,
          remainingTermMonths: 60
        }
      ]
    },
    treatedDebtPayoff: {
      debts: [
        {
          debtFactId: "mortgage_fact",
          categoryKey: "realEstateSecuredDebt",
          typeKey: "mortgageBalance",
          sourceKey: "mortgageBalance",
          isMortgage: true,
          rawBalance: 240000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 240000,
          treatmentMode: "payoff"
        },
        {
          debtFactId: "auto_fact",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          sourceKey: "autoLoan",
          isMortgage: false,
          rawBalance: 12000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 12000,
          treatmentMode: "payoff"
        },
        {
          debtFactId: "student_fact",
          categoryKey: "educationDebt",
          typeKey: "studentLoan",
          sourceKey: "studentLoan",
          isMortgage: false,
          rawBalance: 120000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 120000,
          treatmentMode: "payoff"
        }
      ],
      needs: {
        debtPayoffAmount: 372000,
        mortgagePayoffAmount: 240000,
        nonMortgageDebtAmount: 132000
      }
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 240000,
      immediatePayoffAmount: 240000,
      payoffPercent: 100,
      originalMonthlyMortgagePayment: null,
      originalRemainingTermMonths: null,
      interestRatePercent: null
    },
    ...overrides
  };
}

assert.doesNotMatch(helperSource, /\bdocument\b/);
assert.doesNotMatch(helperSource, /\blocalStorage\b/);
assert.doesNotMatch(helperSource, /\bsessionStorage\b/);
assert.doesNotMatch(helperSource, /\bquerySelector\b/);
assert.match(helperSource, /module\.exports/);

const mortgageIndex = pageSource.indexOf("coverage-strategy-mortgage-lifetime-projection.js");
const debtIndex = pageSource.indexOf("coverage-strategy-debt-lifetime-projection.js");
const needIndex = pageSource.indexOf("coverage-strategy-need-line-adapter.js");
assert.ok(debtIndex > mortgageIndex, "Debt lifetime helper should load after mortgage helper.");
assert.ok(debtIndex < needIndex, "Debt lifetime helper should load before the Need Line adapter.");

const harness = createHarness();
const buildDebtLifetimeProjection = harness.buildDebtLifetimeProjection;
const buildCoverageStrategyNeedLine = harness.buildCoverageStrategyNeedLine;
assert.equal(typeof buildDebtLifetimeProjection, "function");
assert.equal(typeof buildCoverageStrategyNeedLine, "function");

const baseInput = {
  debts: [
    {
      debtFactId: "credit-card",
      categoryKey: "unsecuredConsumerDebt",
      typeKey: "creditCard",
      currentBalance: 12000,
      minimumMonthlyPayment: 1032.80,
      interestRatePercent: 6,
      remainingTermMonths: 12
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(2)
};
const before = clone(baseInput);
const percentRate = buildDebtLifetimeProjection(baseInput);
const decimalRate = buildDebtLifetimeProjection({
  ...baseInput,
  debts: [
    {
      ...baseInput.debts[0],
      interestRatePercent: 0.06
    }
  ]
});
assert.deepEqual(baseInput, before, "Projection helper should not mutate inputs.");
assert.equal(percentRate.assumptionsUsed.projectionModeCounts.amortized, 1);
assert.equal(decimalRate.assumptionsUsed.projectionModeCounts.amortized, 1);
assert.equal(percentRate.debtRecordProjections[0].points[1].projectedBalance, decimalRate.debtRecordProjections[0].points[1].projectedBalance);
assert.equal(percentRate.debtPoints[0].payoffObligationAmount, 12000);
assert.ok(percentRate.debtPoints[1].payoffObligationAmount < percentRate.debtPoints[0].payoffObligationAmount);
assert.equal(percentRate.debtPoints[1].payoffObligationAmount, 0);
assert.ok(percentRate.debtPoints.every((point) => point.payoffObligationAmount >= 0));

const straightLineMissingRate = buildDebtLifetimeProjection({
  debts: [
    {
      debtFactId: "personal-loan",
      categoryKey: "unsecuredConsumerDebt",
      currentBalance: 12000,
      minimumMonthlyPayment: 500,
      interestRatePercent: null,
      remainingTermMonths: 24
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(2)
});
assert.equal(straightLineMissingRate.assumptionsUsed.projectionModeCounts.straightLineFallback, 1);
assert.ok(issueCodes(straightLineMissingRate.warnings).includes("debt-projection-rate-missing-straight-line"));
assert.equal(straightLineMissingRate.debtPoints[1].payoffObligationAmount, 6000);
assert.equal(straightLineMissingRate.debtPoints[2].payoffObligationAmount, 0);

const straightLineMissingPayment = buildDebtLifetimeProjection({
  debts: [
    {
      debtFactId: "student-loan",
      categoryKey: "educationDebt",
      currentBalance: 12000,
      minimumMonthlyPayment: null,
      interestRatePercent: 6,
      remainingTermMonths: 24
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(2)
});
assert.equal(straightLineMissingPayment.assumptionsUsed.projectionModeCounts.straightLineFallback, 1);
assert.ok(issueCodes(straightLineMissingPayment.warnings).includes("debt-projection-payment-missing-straight-line"));
assert.equal(straightLineMissingPayment.debtPoints[2].payoffObligationAmount, 0);

const missingTerm = buildDebtLifetimeProjection({
  debts: [
    {
      debtFactId: "custom-debt",
      categoryKey: "otherDebt",
      currentBalance: 12000,
      minimumMonthlyPayment: 300,
      interestRatePercent: 6,
      remainingTermMonths: null
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(2)
});
assert.equal(missingTerm.assumptionsUsed.projectionModeCounts.flatFallback, 1);
assert.ok(issueCodes(missingTerm.dataGaps).includes("debt-projection-term-missing"));
assert.equal(missingTerm.debtPoints[2].payoffObligationAmount, 12000);

const negativeAmortization = buildDebtLifetimeProjection({
  debts: [
    {
      debtFactId: "high-rate-card",
      categoryKey: "unsecuredConsumerDebt",
      currentBalance: 12000,
      minimumMonthlyPayment: 10,
      interestRatePercent: 24,
      remainingTermMonths: 24
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(2)
});
assert.equal(negativeAmortization.assumptionsUsed.projectionModeCounts.flatFallback, 1);
assert.ok(issueCodes(negativeAmortization.warnings).includes("debt-projection-negative-amortization-flat-fallback"));
assert.equal(negativeAmortization.debtPoints[2].payoffObligationAmount, 12000);

const multipleDebts = buildDebtLifetimeProjection({
  debts: [
    {
      debtFactId: "auto-loan",
      categoryKey: "securedConsumerDebt",
      currentBalance: 12000,
      minimumMonthlyPayment: 1000,
      interestRatePercent: 0,
      remainingTermMonths: 12
    },
    {
      debtFactId: "medical-payment",
      categoryKey: "medicalDebt",
      currentBalance: 2400,
      minimumMonthlyPayment: 200,
      interestRatePercent: 0,
      remainingTermMonths: 12
    },
    {
      debtFactId: "mortgage",
      categoryKey: "realEstateSecuredDebt",
      typeKey: "mortgageBalance",
      sourceKey: "mortgageBalance",
      currentBalance: 400000,
      minimumMonthlyPayment: 2000,
      interestRatePercent: 6,
      remainingTermMonths: 360
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1)
});
assert.equal(multipleDebts.debtPoints[0].payoffObligationAmount, 14400);
assert.equal(multipleDebts.debtPoints[0].debtsIncludedCount, 2);
assert.equal(multipleDebts.trace.excludedDebts.some((debt) => debt.exclusionReason === "mortgage-debt-excluded"), true);
assert.equal(multipleDebts.debtPoints[1].payoffObligationAmount, 0);

const missingBalance = buildDebtLifetimeProjection({
  debts: [
    {
      debtFactId: "missing-balance",
      categoryKey: "otherDebt",
      currentBalance: null,
      minimumMonthlyPayment: 100,
      interestRatePercent: 6,
      remainingTermMonths: 12
    }
  ],
  valuationDate: "2026-01-01",
  needPoints: createNeedPoints(1)
});
assert.ok(issueCodes(missingBalance.dataGaps).includes("debt-projection-balance-missing"));
assert.equal(missingBalance.debtPoints[0].payoffObligationAmount, 0);

const needLine = buildCoverageStrategyNeedLine({
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  valuationDate: "2026-01-01",
  horizonYears: 7
});
assert.equal(needLine.needPoints[0].componentAmounts.debtPayoff, 132000);
assert.ok(
  needLine.needPoints[1].componentAmounts.debtPayoff < needLine.needPoints[0].componentAmounts.debtPayoff,
  "Coverage Strategy payoff-mode non-mortgage debt should decline when amortization facts exist."
);
assert.equal(needLine.needPoints[5].componentAmounts.debtPayoff, 0);
assert.equal(needLine.needPoints[7].componentAmounts.debtPayoff, 0);
assert.equal(needLine.needPoints[1].trace.debtProjection.projectionModeCounts.amortized, 2);
assert.equal(needLine.componentModels.debtLifetimeProjection.assumptionsUsed.debtsIncludedCount, 2);
assert.equal(needLine.componentModels.debtAndMortgage.nonMortgageAmount, 132000);
assert.ok(issueCodes(needLine.dataGaps).includes("mortgage-projection-term-missing"));

const fallbackNeedLine = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    debtFacts: {
      debts: [
        {
          debtFactId: "other_fact",
          categoryKey: "otherDebt",
          typeKey: "customDebt",
          currentBalance: 12000,
          minimumMonthlyPayment: 300,
          interestRatePercent: 6,
          remainingTermMonths: null
        }
      ]
    },
    treatedDebtPayoff: {
      debts: [
        {
          debtFactId: "other_fact",
          categoryKey: "otherDebt",
          typeKey: "customDebt",
          isMortgage: false,
          rawBalance: 12000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 12000,
          treatmentMode: "payoff"
        }
      ],
      needs: {
        debtPayoffAmount: 12000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 12000
      }
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 0,
      immediatePayoffAmount: 0,
      payoffPercent: 100
    }
  }),
  needsResult: createNeedsResult({
    components: {
      debtPayoff: 12000,
      essentialSupport: 0,
      education: 0,
      finalExpenses: 0,
      healthcareExpenses: 0,
      transitionNeeds: 0,
      discretionarySupport: 0
    },
    trace: [
      {
        key: "debtPayoff",
        value: 12000,
        inputs: {
          preparedMortgagePayoffAmount: 0,
          preparedNonMortgageDebtAmount: 12000,
          rawMortgageAmount: 0,
          rawNonMortgageDebtAmount: 12000
        }
      }
    ]
  }),
  valuationDate: "2026-01-01",
  horizonYears: 2
});
assert.ok(issueCodes(fallbackNeedLine.dataGaps).includes("debt-projection-term-missing"));
assert.equal(fallbackNeedLine.needPoints[2].componentAmounts.debtPayoff, 12000);
assert.equal(fallbackNeedLine.needPoints[2].trace.debtProjection.projectionModeCounts.flatFallback, 1);

assert.doesNotMatch(needLineAdapterSource, /resourceAmount|existingCoverageAmount|remainingExposureAmount/);

console.log("coverage strategy debt lifetime projection check passed");
