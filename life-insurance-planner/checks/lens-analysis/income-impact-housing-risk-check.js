#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const helper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-housing-risk-calculations.js"
));

const {
  buildIncomeImpactHousingRisk,
  INCOME_IMPACT_HOUSING_RISK_EVENT_TYPES: EVENT_TYPES,
  INCOME_IMPACT_HOUSING_RISK_OBLIGATION_TYPES: OBLIGATION_TYPES
} = helper;

assert.equal(typeof buildIncomeImpactHousingRisk, "function", "housing-risk helper export should exist");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePoints(horizonMonths, unsupportedMonth) {
  const horizon = Math.max(1, Math.round(horizonMonths || 60));
  return Array.from({ length: horizon }, function (_, index) {
    const monthIndex = index + 1;
    const unsupported = unsupportedMonth != null && monthIndex >= unsupportedMonth;
    return {
      monthIndex,
      survivorNeeds: 5200,
      scheduledObligations: 800,
      survivorIncome: 1800,
      netUse: 4200,
      endingResources: unsupported ? 0 : 100000,
      status: unsupported ? "depleted" : "available"
    };
  });
}

function makePostDeathSeries(options) {
  const safeOptions = options || {};
  const unsupportedMonth = safeOptions.unsupportedMonth ?? null;
  const horizonMonths = safeOptions.horizonMonths || Math.max(60, unsupportedMonth || 0);
  return {
    points: makePoints(horizonMonths, unsupportedMonth),
    displayHorizonMonths: horizonMonths,
    depletion: unsupportedMonth == null
      ? {
        depleted: false,
        depletionMonthIndex: null,
        monthsCovered: null
      }
      : {
        depleted: true,
        depletionMonthIndex: unsupportedMonth,
        monthsCovered: unsupportedMonth
      }
  };
}

function makeInput(options) {
  const safeOptions = options || {};
  const postDeathSeries = makePostDeathSeries(safeOptions);
  return {
    scenario: {
      scenario: {
        selectedDeathDate: "2036-05-14"
      },
      deathEvent: {
        date: "2036-05-14"
      },
      postDeathSeries,
      timelineFacts: {
        displayHorizonMonths: safeOptions.horizonMonths || 60
      }
    },
    housingObligations: safeOptions.housingObligations || [
      {
        id: safeOptions.id || `${safeOptions.type || "mortgage"}-payment`,
        type: safeOptions.type || "mortgage",
        label: safeOptions.label || "Housing payment",
        monthlyPayment: safeOptions.monthlyPayment == null ? 2400 : safeOptions.monthlyPayment,
        remainingMonths: safeOptions.remainingMonths == null ? 240 : safeOptions.remainingMonths,
        treatment: safeOptions.treatment || "continuePayments",
        sourcePath: safeOptions.sourcePath || "housingObligations.0.monthlyPayment",
        evidenceLevel: safeOptions.evidenceLevel || "trace-backed"
      }
    ]
  };
}

function eventTypes(result) {
  return result.timelineEvents.map(function (event) {
    return event.eventType;
  });
}

function labels(result) {
  return result.timelineEvents.map(function (event) {
    return event.displayLabel;
  });
}

function findEvent(result, type) {
  return result.timelineEvents.find(function (event) {
    return event.eventType === type;
  });
}

const stableMortgageInput = makeInput({ type: "mortgage", horizonMonths: 60 });
const stableMortgageSnapshot = cloneJson(stableMortgageInput);
const stableMortgage = buildIncomeImpactHousingRisk(stableMortgageInput);

assert.equal(stableMortgage.version, "income-impact-housing-risk-v1");
assert.equal(stableMortgage.trace.source, "income-impact-housing-risk-calculations");
assert.deepEqual(stableMortgageInput, stableMortgageSnapshot, "helper should not mutate input objects");
assert.deepEqual(stableMortgage.obligations.map((obligation) => obligation.type), [OBLIGATION_TYPES.mortgage]);
assert.deepEqual(eventTypes(stableMortgage), [EVENT_TYPES.mortgagePaymentStaysCurrent]);
assert.equal(findEvent(stableMortgage, EVENT_TYPES.mortgagePaymentStaysCurrent).displayLabel, "Mortgage Payment Stays Current");
assert.equal(findEvent(stableMortgage, EVENT_TYPES.mortgagePaymentStaysCurrent).monthOffset, 60);
assert.equal(findEvent(stableMortgage, EVENT_TYPES.mortgagePaymentStaysCurrent).safeToRender, true);
assert.equal(
  findEvent(stableMortgage, EVENT_TYPES.mortgagePaymentStaysCurrent).trace.housingPaymentPriority,
  "baseline-with-other-expenses",
  "housing payment should be treated as part of the baseline, not a separate priority"
);
assert.equal(stableMortgage.trace.baselineSupport.baselineIncludesHousing, true);

const cautionMortgage = buildIncomeImpactHousingRisk(makeInput({ type: "mortgage", unsupportedMonth: 30 }));
assert.deepEqual(eventTypes(cautionMortgage), [EVENT_TYPES.mortgagePaymentPressureBegins]);
assert.equal(findEvent(cautionMortgage, EVENT_TYPES.mortgagePaymentPressureBegins).displayLabel, "Mortgage Payment Pressure Begins");
assert.equal(findEvent(cautionMortgage, EVENT_TYPES.mortgagePaymentPressureBegins).monthOffset, 30);

const atRiskMortgage = buildIncomeImpactHousingRisk(makeInput({ type: "mortgage", unsupportedMonth: 18 }));
assert.deepEqual(eventTypes(atRiskMortgage), [EVENT_TYPES.mortgagePaymentAtRisk]);
assert.equal(findEvent(atRiskMortgage, EVENT_TYPES.mortgagePaymentAtRisk).displayLabel, "Mortgage Payment Is At Risk");
assert.equal(findEvent(atRiskMortgage, EVENT_TYPES.mortgagePaymentAtRisk).monthOffset, 18);

const criticalMortgage = buildIncomeImpactHousingRisk(makeInput({ type: "mortgage", unsupportedMonth: 10 }));
assert.deepEqual(eventTypes(criticalMortgage), [EVENT_TYPES.mortgagePaymentBecomesUnsupported]);
assert.equal(findEvent(criticalMortgage, EVENT_TYPES.mortgagePaymentBecomesUnsupported).displayLabel, "Mortgage Payment Becomes Unsupported");
assert.equal(findEvent(criticalMortgage, EVENT_TYPES.mortgagePaymentBecomesUnsupported).monthOffset, 10);

const stableRent = buildIncomeImpactHousingRisk(makeInput({
  type: "rent",
  id: "rent-payment",
  monthlyPayment: 1800,
  horizonMonths: 48
}));
assert.deepEqual(eventTypes(stableRent), [EVENT_TYPES.rentPaymentStaysCurrent]);
assert.equal(findEvent(stableRent, EVENT_TYPES.rentPaymentStaysCurrent).displayLabel, "Rent Payment Stays Current");

const atRiskRent = buildIncomeImpactHousingRisk(makeInput({
  type: "rent",
  id: "rent-payment",
  monthlyPayment: 1800,
  unsupportedMonth: 15
}));
assert.deepEqual(eventTypes(atRiskRent), [EVENT_TYPES.rentPaymentAtRisk]);
assert.equal(findEvent(atRiskRent, EVENT_TYPES.rentPaymentAtRisk).displayLabel, "Rent Payment Is At Risk");

const generalHousing = buildIncomeImpactHousingRisk(makeInput({
  housingObligations: [
    {
      id: "aggregate-housing-payment",
      type: "housing",
      monthlyPayment: 1600,
      sourcePath: "options.monthlyHousingPayment",
      evidenceLevel: "estimated"
    }
  ],
  unsupportedMonth: 8
}));
assert.deepEqual(eventTypes(generalHousing), [EVENT_TYPES.housingCostsBecomeUnsupported]);
assert.equal(findEvent(generalHousing, EVENT_TYPES.housingCostsBecomeUnsupported).displayLabel, "Housing Costs Become Unsupported");

const missingPayment = buildIncomeImpactHousingRisk(makeInput({
  housingObligations: [
    {
      id: "rent-missing",
      type: "rent",
      remainingMonths: 12,
      sourcePath: "housingObligations.0"
    }
  ],
  unsupportedMonth: 8
}));
assert.deepEqual(eventTypes(missingPayment), []);
assert.ok(
  missingPayment.warnings.some((warning) => warning.id === "missing-housing-payment"),
  "missing rent or mortgage payment should be traced"
);

const homeValueOnly = buildIncomeImpactHousingRisk({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    postDeathSeries: makePostDeathSeries({ horizonMonths: 60 }),
    lensModel: {
      homeValue: 500000,
      homeEquity: 200000
    }
  }
});
assert.deepEqual(eventTypes(homeValueOnly), []);
assert.ok(
  homeValueOnly.warnings.some((warning) => warning.id === "missing-housing-payment-source"),
  "home value or home equity alone should not create housing support evidence"
);

const paidOffMortgage = buildIncomeImpactHousingRisk(makeInput({
  type: "mortgage",
  treatment: "payOffMortgage",
  monthlyPayment: null,
  unsupportedMonth: 8,
  housingObligations: [
    {
      id: "paid-off-mortgage",
      type: "mortgage",
      treatment: "payOffMortgage",
      balance: 325000,
      sourcePath: "housingObligations.0.balance"
    }
  ]
}));
assert.deepEqual(eventTypes(paidOffMortgage), [], "paid-off-at-death mortgage should not create ongoing housing trigger events");

const emittedText = [
  labels(stableMortgage).join(" "),
  labels(cautionMortgage).join(" "),
  labels(atRiskMortgage).join(" "),
  labels(criticalMortgage).join(" "),
  labels(atRiskRent).join(" "),
  labels(generalHousing).join(" ")
].join(" ");
[
  "Mortgage Payments Continue",
  "Housing Payment Pressure Begins",
  "Housing Payment At Risk",
  "Foreclosure",
  "Eviction",
  "bankruptcy",
  "credit crisis",
  "forced sale",
  "forced home sale"
].forEach((forbidden) => {
  assert.equal(emittedText.toLowerCase().includes(forbidden.toLowerCase()), false, `${forbidden} should not be emitted`);
});

console.log("income-impact-housing-risk-check passed");
