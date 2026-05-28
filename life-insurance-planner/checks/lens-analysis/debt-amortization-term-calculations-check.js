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
  "debt-amortization-term-calculations.js"
);
const source = fs.readFileSync(helperPath, "utf8");

const context = {
  console,
  LensApp: {
    lensAnalysis: {}
  },
  module: {
    exports: {}
  }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: helperPath });

const calculateDebtPayoffTerm = context.LensApp.lensAnalysis.calculateDebtPayoffTerm;

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.code);
}

assert.doesNotMatch(source, /\bdocument\b/);
assert.doesNotMatch(source, /\blocalStorage\b/);
assert.doesNotMatch(source, /\bsessionStorage\b/);
assert.doesNotMatch(source, /\bquerySelector\b/);
assert.match(source, /module\.exports/);
assert.equal(typeof calculateDebtPayoffTerm, "function");
assert.equal(context.module.exports.calculateDebtPayoffTerm, calculateDebtPayoffTerm);

const jamesDoeAutoLoan = calculateDebtPayoffTerm({
  currentBalance: 31000,
  paymentAmount: 383,
  paymentFrequency: "monthly",
  interestRatePercent: 6,
  enteredRemainingTermMonths: 45
});
assert.equal(jamesDoeAutoLoan.calculationMode, "amortized");
assert.ok(jamesDoeAutoLoan.calculatedPayoffMonths > 45, "James Doe auto loan should not calculate to 45 months");
assert.ok(jamesDoeAutoLoan.projectedBalanceAtUserTerm > 19000, "entered 45-month term leaves material unpaid balance");
assert.ok(jamesDoeAutoLoan.projectedBalanceAtUserTerm < 20000, "45-month projected balance stays near manual audit range");

const percentRate = calculateDebtPayoffTerm({
  currentBalance: 12000,
  paymentAmount: 1032.8,
  paymentFrequency: "monthly",
  interestRatePercent: 6
});
const decimalRate = calculateDebtPayoffTerm({
  currentBalance: 12000,
  paymentAmount: 1032.8,
  paymentFrequency: "monthly",
  interestRatePercent: 0.06
});
assert.equal(percentRate.calculatedPayoffMonths, decimalRate.calculatedPayoffMonths, "6 and 0.06 normalize equivalently");
assert.equal(percentRate.monthlyRateUsed, decimalRate.monthlyRateUsed);

[
  ["monthly", 1200, 1200],
  ["annual", 1200, 100],
  ["weekly", 120, 520],
  ["biweekly", 240, 520],
  ["semiMonthly", 500, 1000]
].forEach(([paymentFrequency, paymentAmount, expectedMonthly]) => {
  const result = calculateDebtPayoffTerm({
    currentBalance: 1000,
    paymentAmount,
    paymentFrequency,
    interestRatePercent: 0
  });
  assert.equal(result.monthlyPaymentUsed, expectedMonthly, `${paymentFrequency} should convert to expected monthly equivalent`);
});

const missingRate = calculateDebtPayoffTerm({
  currentBalance: 12000,
  paymentAmount: 500,
  paymentFrequency: "monthly",
  interestRatePercent: null
});
assert.equal(missingRate.calculationMode, "straightLineNoRate");
assert.equal(missingRate.calculatedPayoffMonths, 24);
assert.ok(issueCodes(missingRate.warnings).includes("debt-payoff-term-rate-missing-straight-line"));

const negativeAmortization = calculateDebtPayoffTerm({
  currentBalance: 12000,
  paymentAmount: 10,
  paymentFrequency: "monthly",
  interestRatePercent: 24
});
assert.equal(negativeAmortization.calculationMode, "negativeAmortization");
assert.equal(negativeAmortization.calculatedPayoffMonths, null);
assert.ok(issueCodes(negativeAmortization.warnings).includes("debt-payoff-term-negative-amortization"));

const missingPayment = calculateDebtPayoffTerm({
  currentBalance: 12000,
  paymentAmount: null,
  paymentFrequency: "monthly",
  interestRatePercent: 6
});
assert.equal(missingPayment.calculationMode, "unavailable");
assert.ok(issueCodes(missingPayment.dataGaps).includes("debt-payoff-term-payment-missing"));

console.log("debt amortization term calculations check passed");
