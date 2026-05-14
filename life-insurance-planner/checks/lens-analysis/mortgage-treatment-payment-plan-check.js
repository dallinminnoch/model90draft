#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperSource = fs.readFileSync(
  path.join(repoRoot, "app/features/lens-analysis/debt-treatment-calculations.js"),
  "utf8"
);

function createHarness() {
  const sandbox = {
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(helperSource, sandbox, {
    filename: "debt-treatment-calculations.js"
  });
  return sandbox.LensApp?.lensAnalysis || {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function monthlyPayment(principal, annualRatePercent, months) {
  const monthlyRate = annualRatePercent / 1200;
  return Math.round((principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)))) * 100) / 100;
}

function baseInput(overrides = {}) {
  return {
    mortgageTreatment: {
      include: true,
      mode: "support",
      payoffPercent: 0,
      paymentSupportYears: null,
      ...(overrides.mortgageTreatment || {})
    },
    mortgageFacts: {
      mortgageBalance: 300000,
      calculatedMonthlyMortgagePayment: 9999,
      ...(overrides.mortgageFacts || {})
    },
    ongoingSupport: {
      monthlyMortgagePayment: 1800,
      mortgageRemainingTermMonths: 360,
      mortgageInterestRatePercent: 6,
      monthlyHousingSupportCost: 4200,
      calculatedMonthlyMortgagePayment: 9999,
      propertyTax: 650,
      homeownersInsurance: 180,
      hoaDues: 125,
      utilities: 450,
      maintenanceRepairs: 300,
      ...(overrides.ongoingSupport || {})
    },
    options: {
      ...(overrides.options || {})
    }
  };
}

function assertNotMutated(input, before) {
  assert.deepEqual(input, before, "Helper should not mutate its input.");
}

const harness = createHarness();
assert.equal(typeof harness.calculateTreatedMortgagePaymentPlan, "function");

const fullPayoffInput = baseInput({
  mortgageTreatment: { mode: "payoff", payoffPercent: 100 }
});
const fullPayoffBefore = clone(fullPayoffInput);
const fullPayoff = harness.calculateTreatedMortgagePaymentPlan(fullPayoffInput);
assertNotMutated(fullPayoffInput, fullPayoffBefore);
assert.equal(fullPayoff.version, "treated-mortgage-payment-plan-v1");
assert.equal(fullPayoff.mode, "payOff");
assert.equal(fullPayoff.originalBalance, 300000);
assert.equal(fullPayoff.immediatePayoffAmount, 300000);
assert.equal(fullPayoff.remainingPrincipalAfterPayoff, 0);
assert.equal(fullPayoff.finalMonthlyMortgagePayment, 0);
assert.equal(fullPayoff.finalRemainingTermMonths, 0);
assert.equal(fullPayoff.mortgagePaymentRemovedFromNeeds, true);
assert.equal(fullPayoff.mortgagePaymentAlreadyInNeeds, true);
assert.equal(fullPayoff.associatedHousingCostsPreserved, true);
assert.equal(fullPayoff.warnings.length, 0);

const partialPayoffInput = baseInput({
  mortgageTreatment: { mode: "payoff", payoffPercent: 40 }
});
const partialPayoff = harness.calculateTreatedMortgagePaymentPlan(partialPayoffInput);
assert.equal(partialPayoff.mode, "payOff");
assert.equal(partialPayoff.immediatePayoffAmount, 120000);
assert.equal(partialPayoff.remainingPrincipalAfterPayoff, 180000);
assert.equal(partialPayoff.finalMonthlyMortgagePayment, null);
assert.equal(partialPayoff.mortgagePaymentRemovedFromNeeds, true);
assert.equal(partialPayoff.associatedHousingCostsPreserved, true);

const continueRawInput = baseInput({
  mortgageTreatment: { mode: "support", payoffPercent: 0 }
});
const continueRaw = harness.calculateTreatedMortgagePaymentPlan(continueRawInput);
assert.equal(continueRaw.mode, "continuePayments");
assert.equal(continueRaw.immediatePayoffAmount, 0);
assert.equal(continueRaw.remainingPrincipalAfterPayoff, 300000);
assert.equal(continueRaw.finalRemainingTermMonths, 360);
assert.equal(continueRaw.yearsRemainingSource, "pmiCalculated");
assert.equal(continueRaw.paymentSource, "calculatedAmortization");
assert.equal(continueRaw.finalMonthlyMortgagePayment, monthlyPayment(300000, 6, 360));
assert.equal(continueRaw.mortgagePaymentRemovedFromNeeds, false);

const continuePartial = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  mortgageTreatment: { mode: "support", payoffPercent: 25 }
}));
assert.equal(continuePartial.immediatePayoffAmount, 75000);
assert.equal(continuePartial.remainingPrincipalAfterPayoff, 225000);
assert.equal(continuePartial.finalMonthlyMortgagePayment, monthlyPayment(225000, 6, 360));
assert.ok(
  continuePartial.finalMonthlyMortgagePayment < continueRaw.finalMonthlyMortgagePayment,
  "Partial payoff should lower the recalculated continue-payment mortgage-only amount."
);

const manualYearsInput = baseInput({
  mortgageTreatment: { mode: "continuePayments", payoffPercent: 10 },
  options: { manualYearsRemainingOverride: 15 }
});
const manualYears = harness.calculateTreatedMortgagePaymentPlan(manualYearsInput);
assert.equal(manualYears.mode, "continuePayments");
assert.equal(manualYears.immediatePayoffAmount, 30000);
assert.equal(manualYears.remainingPrincipalAfterPayoff, 270000);
assert.equal(manualYears.finalRemainingTermMonths, 180);
assert.equal(manualYears.yearsRemainingSource, "manualOverride");
assert.equal(manualYears.finalMonthlyMortgagePayment, monthlyPayment(270000, 6, 180));
assert.ok(manualYears.trace.sourcePaths.includes("options.manualYearsRemainingOverride"));

const invalidLowManual = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  mortgageTreatment: { mode: "support", payoffPercent: 0 },
  options: { manualYearsRemainingOverride: 0.5 }
}));
assert.equal(invalidLowManual.finalRemainingTermMonths, 360);
assert.equal(invalidLowManual.yearsRemainingSource, "pmiCalculated");
assert.match(
  invalidLowManual.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-manual-years-invalid/
);

const invalidHighManual = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  mortgageTreatment: { mode: "support", payoffPercent: 0 },
  options: { manualRemainingTermMonths: 480 }
}));
assert.equal(invalidHighManual.finalRemainingTermMonths, 360);
assert.equal(invalidHighManual.yearsRemainingSource, "pmiCalculated");
assert.match(
  invalidHighManual.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-manual-term-invalid/
);

const zeroInterest = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  ongoingSupport: { mortgageInterestRatePercent: 0 }
}));
assert.equal(zeroInterest.paymentSource, "straightLineFallback");
assert.equal(zeroInterest.finalMonthlyMortgagePayment, 833.33);
assert.match(
  zeroInterest.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-interest-rate-fallback/
);

const missingInterest = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  ongoingSupport: { mortgageInterestRatePercent: null }
}));
assert.equal(missingInterest.paymentSource, "straightLineFallback");
assert.equal(missingInterest.finalMonthlyMortgagePayment, 833.33);

const missingTerm = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  ongoingSupport: { mortgageRemainingTermMonths: null }
}));
assert.equal(missingTerm.mode, "unavailable");
assert.equal(missingTerm.finalMonthlyMortgagePayment, null);
assert.equal(missingTerm.paymentSource, "unavailable");
assert.match(
  missingTerm.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-term-unavailable/
);

const missingPrincipal = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  mortgageFacts: { mortgageBalance: null }
}));
assert.equal(missingPrincipal.mode, "unavailable");
assert.equal(missingPrincipal.immediatePayoffAmount, null);
assert.equal(missingPrincipal.finalMonthlyMortgagePayment, null);
assert.match(
  missingPrincipal.warnings.map((warning) => warning.code).join(" "),
  /mortgage-payment-plan-principal-unavailable/
);

const mortgageOnlyGuard = harness.calculateTreatedMortgagePaymentPlan(baseInput({
  mortgageFacts: { mortgageBalance: 300000, calculatedMonthlyMortgagePayment: 11111 },
  ongoingSupport: {
    monthlyMortgagePayment: null,
    mortgageRemainingTermMonths: 360,
    mortgageInterestRatePercent: 0,
    monthlyHousingSupportCost: 7777,
    calculatedMonthlyMortgagePayment: 8888
  }
}));
assert.equal(mortgageOnlyGuard.originalMonthlyMortgagePayment, null);
assert.equal(mortgageOnlyGuard.mortgagePaymentAlreadyInNeeds, false);
assert.notEqual(mortgageOnlyGuard.originalMonthlyMortgagePayment, 7777);
assert.notEqual(mortgageOnlyGuard.originalMonthlyMortgagePayment, 8888);
assert.equal(mortgageOnlyGuard.trace.calculationInputs.ignoredHousingSupportCost, 7777);
assert.equal(mortgageOnlyGuard.trace.calculationInputs.ignoredCalculatedMonthlyMortgagePayment, 8888);

const deterministicInput = baseInput({
  mortgageTreatment: { mode: "continueMortgagePayments", payoffPercent: 12.5 },
  options: { manualRemainingTermMonths: 240 }
});
const first = harness.calculateTreatedMortgagePaymentPlan(deterministicInput);
const second = harness.calculateTreatedMortgagePaymentPlan(deterministicInput);
assert.equal(JSON.stringify(first), JSON.stringify(second), "Mortgage payment plan output should be deterministic.");

assert.match(helperSource, /calculateTreatedMortgagePaymentPlan/);
assert.doesNotMatch(
  helperSource.slice(
    helperSource.indexOf("function calculateTreatedMortgagePaymentPlan"),
    helperSource.indexOf("function applyMortgageSupportFallback")
  ),
  /monthlyHousingSupportCost\s*\)|calculatedMonthlyMortgagePayment\s*\)|monthlyHousingSupportCost\s*\/|calculatedMonthlyMortgagePayment\s*\//,
  "Mortgage payment plan helper should not use total housing burden or calculated display payment as mortgage-only payment."
);

console.log("mortgage-treatment-payment-plan-check passed");
