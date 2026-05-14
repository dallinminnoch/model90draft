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

const mortgageInput = {
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    },
    timelineFacts: {
      monthsCovered: 18
    },
    postDeathSeries: {
      summary: {
        annualShortfall: 36000
      },
      depletion: {
        depleted: true,
        depletionMonthIndex: 18,
        monthsCovered: 18
      }
    }
  },
  housingObligations: [
    {
      id: "primary-mortgage",
      type: "mortgage",
      label: "Primary mortgage",
      monthlyPayment: 2400,
      remainingMonths: 240,
      balance: 385000,
      treatment: "continuePayments",
      sourcePath: "scenario.trace.layer3.scheduledObligations.mortgage",
      evidenceLevel: "trace-backed"
    }
  ]
};
const mortgageSnapshot = cloneJson(mortgageInput);
const mortgageResult = buildIncomeImpactHousingRisk(mortgageInput);

assert.equal(mortgageResult.version, "income-impact-housing-risk-v1");
assert.equal(mortgageResult.trace.source, "income-impact-housing-risk-calculations");
assert.deepEqual(mortgageInput, mortgageSnapshot, "helper should not mutate input objects");
assert.deepEqual(mortgageResult.obligations.map((obligation) => obligation.type), [OBLIGATION_TYPES.mortgage]);
assert.ok(eventTypes(mortgageResult).includes(EVENT_TYPES.mortgagePaymentsContinue));
assert.ok(eventTypes(mortgageResult).includes(EVENT_TYPES.housingPaymentPressureBegins));
assert.ok(eventTypes(mortgageResult).includes(EVENT_TYPES.housingPaymentAtRisk));
assert.ok(eventTypes(mortgageResult).includes(EVENT_TYPES.housingStabilityAtRisk));
assert.equal(findEvent(mortgageResult, EVENT_TYPES.mortgagePaymentsContinue).date, "2036-05-14");
assert.equal(findEvent(mortgageResult, EVENT_TYPES.housingPaymentPressureBegins).date, "2036-06-14");
assert.equal(findEvent(mortgageResult, EVENT_TYPES.housingPaymentAtRisk).date, "2037-11-14");
assert.equal(findEvent(mortgageResult, EVENT_TYPES.housingPaymentAtRisk).amount, 2400);
assert.equal(findEvent(mortgageResult, EVENT_TYPES.housingPaymentAtRisk).safeToRender, true);
assert.equal(findEvent(mortgageResult, EVENT_TYPES.housingStabilityAtRisk).displayLabel, "Housing Stability At Risk");

const paidOffMissingBalance = buildIncomeImpactHousingRisk({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    }
  },
  housingObligations: [
    {
      id: "mortgage-payoff-missing",
      type: "mortgage",
      treatment: "payOffMortgage",
      sourcePath: "housingObligations.0"
    }
  ]
});
assert.equal(
  eventTypes(paidOffMissingBalance).includes(EVENT_TYPES.mortgagePaidOff),
  false,
  "mortgage paid-off event should not appear without payoff balance evidence"
);
assert.ok(
  paidOffMissingBalance.warnings.some((warning) => warning.id === "missing-mortgage-payoff-balance"),
  "missing payoff balance should produce a warning"
);
assert.ok(
  paidOffMissingBalance.timelineEvents.every((event) => event.safeToRender === false),
  "missing payoff balance should not create safe renderable events"
);

const paidOff = buildIncomeImpactHousingRisk({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    }
  },
  housingObligations: [
    {
      id: "primary-mortgage",
      type: "mortgage",
      treatment: "payOffMortgage",
      balance: 385000,
      sourcePath: "housingObligations.0.balance",
      evidenceLevel: "calculated"
    }
  ]
});
assert.deepEqual(eventTypes(paidOff), [EVENT_TYPES.mortgagePaidOff]);
assert.equal(findEvent(paidOff, EVENT_TYPES.mortgagePaidOff).amount, 385000);
assert.equal(findEvent(paidOff, EVENT_TYPES.mortgagePaidOff).evidenceLevel, "calculated");

const rentResult = buildIncomeImpactHousingRisk({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    timelineFacts: {
      monthsCovered: 10
    }
  },
  housingObligations: [
    {
      id: "rent",
      type: "rent",
      label: "Rent",
      monthlyPayment: 1800,
      remainingMonths: 12,
      sourcePath: "housingObligations.0",
      evidenceLevel: "assumption-backed"
    }
  ],
  options: {
    monthlyShortfall: 600
  }
});
assert.ok(eventTypes(rentResult).includes(EVENT_TYPES.rentPaymentPressureBegins));
assert.ok(!eventTypes(rentResult).includes(EVENT_TYPES.housingPaymentPressureBegins));
assert.ok(eventTypes(rentResult).includes(EVENT_TYPES.housingPaymentAtRisk));

const noRentResult = buildIncomeImpactHousingRisk({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    }
  },
  housingObligations: [
    {
      id: "mortgage-only",
      type: "mortgage",
      monthlyPayment: 2100,
      treatment: "continuePayments",
      remainingMonths: 12,
      sourcePath: "housingObligations.0"
    }
  ],
  options: {
    monthlyShortfall: 500
  }
});
assert.equal(
  eventTypes(noRentResult).includes(EVENT_TYPES.rentPaymentPressureBegins),
  false,
  "rent pressure should appear only when a rent obligation exists"
);

const missingPayment = buildIncomeImpactHousingRisk({
  housingObligations: [
    {
      id: "rent-missing",
      type: "rent",
      remainingMonths: 12,
      sourcePath: "housingObligations.0"
    }
  ],
  options: {
    selectedDeathDate: "2036-05-14",
    monthlyShortfall: 700,
    depletionMonthOffset: 4
  }
});
assert.ok(
  missingPayment.warnings.some((warning) => warning.id === "missing-housing-payment"),
  "missing mortgage/rent payment should produce a data warning"
);
assert.ok(eventTypes(missingPayment).includes(EVENT_TYPES.housingRiskUnknown));
assert.ok(missingPayment.timelineEvents.every((event) => event.safeToRender === false));

const noDepletionRisk = buildIncomeImpactHousingRisk({
  housingObligations: [
    {
      id: "short-mortgage",
      type: "mortgage",
      monthlyPayment: 2000,
      remainingMonths: 6,
      treatment: "continuePayments",
      sourcePath: "housingObligations.0"
    }
  ],
  options: {
    selectedDeathDate: "2036-05-14",
    depletionMonthOffset: 18
  }
});
assert.equal(
  eventTypes(noDepletionRisk).includes(EVENT_TYPES.housingPaymentAtRisk),
  false,
  "housing payment at risk should require resources to deplete before obligation period ends"
);

const derivedScheduled = buildIncomeImpactHousingRisk({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    timelineFacts: {
      monthsCovered: 8
    },
    postDeathSeries: {
      layer3: {
        trace: {
          streamNormalization: {
            scheduledObligations: [
              {
                id: "mortgage-support",
                category: "mortgageSupport",
                monthlyAmount: 2200,
                termMonths: 24,
                sourcePaths: ["scenario.postDeathSeries.layer3.trace.streamNormalization.scheduledObligations.0"]
              }
            ]
          }
        }
      }
    }
  }
});
assert.equal(derivedScheduled.trace.obligationSourceSummary.mode, "scheduled-obligations");
assert.ok(eventTypes(derivedScheduled).includes(EVENT_TYPES.mortgagePaymentsContinue));
assert.ok(eventTypes(derivedScheduled).includes(EVENT_TYPES.housingPaymentAtRisk));

const pointShortfall = buildIncomeImpactHousingRisk({
  postDeathSeries: {
    points: [
      { monthIndex: 1, netUse: 300 }
    ]
  },
  housingObligations: [
    {
      id: "aggregate-housing",
      type: "housing",
      monthlyPayment: 1600,
      remainingMonths: 9,
      sourcePath: "housingObligations.0"
    }
  ],
  options: {
    selectedDeathDate: "2036-05-14"
  }
});
assert.ok(eventTypes(pointShortfall).includes(EVENT_TYPES.housingPaymentPressureBegins));
assert.equal(findEvent(pointShortfall, EVENT_TYPES.housingPaymentPressureBegins).evidenceLevel, "estimated");

const orderedTypes = mortgageResult.timelineEvents.map((event) => event.eventType);
assert.deepEqual(
  orderedTypes,
  [
    EVENT_TYPES.mortgagePaymentsContinue,
    EVENT_TYPES.housingPaymentPressureBegins,
    EVENT_TYPES.housingPaymentAtRisk,
    EVENT_TYPES.housingStabilityAtRisk
  ],
  "event ordering should be deterministic"
);

const emittedText = [
  labels(mortgageResult).join(" "),
  labels(rentResult).join(" "),
  labels(missingPayment).join(" ")
].join(" ").toLowerCase();
["foreclosure", "eviction", "bankruptcy", "credit crisis", "forced sale", "forced home sale"].forEach((forbidden) => {
  assert.equal(emittedText.includes(forbidden), false, `${forbidden} should never be emitted`);
});

console.log("income-impact-housing-risk-check passed");
