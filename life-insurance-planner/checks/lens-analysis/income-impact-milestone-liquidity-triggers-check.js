#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const financialStoryline = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
));
const storyAssembly = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-timeline-story-assembly.js"
));
const storyEvents = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-timeline-story-events.js"
));

const { buildIncomeImpactFinancialStorylineCandidates } = financialStoryline;
const { buildIncomeImpactTimelineStoryAssembly } = storyAssembly;
const { normalizeIncomeImpactTimelineStoryEvents } = storyEvents;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeLedgerEvent(config) {
  const event = {
    bucketId: config.bucketId || config.family,
    family: config.family,
    eventType: config.eventType,
    monthIndex: config.monthIndex,
    sourcePath: config.sourcePath || `assetDepletionLedger.bucketEvents.${config.family}`,
    trace: {
      sourcePath: config.sourcePath || `assetDepletionLedger.bucketEvents.${config.family}`
    }
  };
  if (config.amountAtTap != null) {
    event.amountAtTap = config.amountAtTap;
  }
  if (config.amountDepleted != null) {
    event.amountDepleted = config.amountDepleted;
  }
  return event;
}

function bucket(family, balance) {
  return {
    bucketId: family,
    family,
    balance
  };
}

function month(monthIndex, monthlyNetUse, balances) {
  return {
    monthIndex,
    monthlyNetUse,
    monthlyNeeds: monthlyNetUse + 100,
    monthlyIncome: 100,
    scheduledObligations: 0,
    startingBuckets: Object.keys(balances.start).map(function (family) {
      return bucket(family, balances.start[family]);
    }),
    endingBuckets: Object.keys(balances.end).map(function (family) {
      return bucket(family, balances.end[family]);
    })
  };
}

function makeThresholdLedger() {
  const starting = {
    preDeathSavedCash: 100,
    cash: 500,
    emergencyFund: 400,
    otherLiquid: 100,
    taxableInvestments: 10000
  };
  return {
    version: "income-impact-asset-depletion-ledger-v1",
    status: "ready",
    orderedBuckets: [
      { bucketId: "pre-death", family: "preDeathSavedCash", availableValue: 100, firstUsedMonth: 0, sourcePath: "ordered.preDeath" },
      { bucketId: "cash", family: "cash", availableValue: 500, firstUsedMonth: 0, depletionMonth: 2, sourcePath: "ordered.cash" },
      { bucketId: "emergency", family: "emergencyFund", availableValue: 400, firstUsedMonth: 3, depletionMonth: 5, sourcePath: "ordered.emergency" },
      { bucketId: "other-liquid", family: "otherLiquid", availableValue: 100, sourcePath: "ordered.otherLiquid" },
      { bucketId: "taxable", family: "taxableInvestments", availableValue: 10000, firstUsedMonth: 7, depletionMonth: 9, sourcePath: "ordered.taxable" }
    ],
    ledgerMonths: [
      month(0, 100, { start: starting, end: { cash: 450, emergencyFund: 400, otherLiquid: 100, taxableInvestments: 10000 } }),
      month(1, 100, { start: { cash: 450, emergencyFund: 400, otherLiquid: 100, taxableInvestments: 10000 }, end: { cash: 250, emergencyFund: 400, otherLiquid: 100, taxableInvestments: 10000 } }),
      month(2, 100, { start: { cash: 250, emergencyFund: 400, otherLiquid: 100, taxableInvestments: 10000 }, end: { cash: 80, emergencyFund: 400, otherLiquid: 100, taxableInvestments: 10000 } }),
      month(3, 100, { start: { cash: 0, emergencyFund: 400, otherLiquid: 100, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 350, otherLiquid: 100, taxableInvestments: 10000 } }),
      month(4, 100, { start: { cash: 0, emergencyFund: 350, otherLiquid: 100, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 250, otherLiquid: 100, taxableInvestments: 10000 } }),
      month(5, 100, { start: { cash: 0, emergencyFund: 250, otherLiquid: 100, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 80, otherLiquid: 100, taxableInvestments: 10000 } }),
      month(6, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 100, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 10000 } }),
      month(7, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 600 } }),
      month(8, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 600 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 250 } }),
      month(9, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 250 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 80 } })
    ],
    bucketEvents: [
      makeLedgerEvent({ family: "cash", eventType: "bucket-tapped", monthIndex: 0, amountAtTap: 500 }),
      makeLedgerEvent({ family: "cash", eventType: "bucket-depleted", monthIndex: 2, amountDepleted: 500 }),
      makeLedgerEvent({ family: "emergencyFund", eventType: "bucket-tapped", monthIndex: 3, amountAtTap: 400 }),
      makeLedgerEvent({ family: "emergencyFund", eventType: "bucket-depleted", monthIndex: 5, amountDepleted: 400 }),
      makeLedgerEvent({ family: "taxableInvestments", eventType: "bucket-tapped", monthIndex: 7, amountAtTap: 10000 }),
      makeLedgerEvent({ family: "taxableInvestments", eventType: "bucket-depleted", monthIndex: 9, amountDepleted: 10000 })
    ],
    trace: {
      totalResourcesReconciliation: {
        verified: true,
        monthsChecked: 10
      }
    }
  };
}

function makeInput(overrides) {
  return Object.assign({
    selectedScenarioId: "liquidity-test",
    scenario: {
      status: "complete",
      transitionOutlook: {
        transitionNeed90Days: 1000,
        status: "Caution"
      },
      postDeathSeries: {
        depletion: {
          depleted: true,
          depletionMonthIndex: 12
        }
      }
    },
    assetDepletionLedger: makeThresholdLedger(),
    graphModel: {
      series: {
        appliedRunwayScenarios: [
          {
            selected: true,
            depletionPoint: {
              monthIndex: 12,
              value: 0
            }
          }
        ]
      }
    },
    riskEvaluation: {
      events: [],
      stableEvents: []
    }
  }, overrides || {});
}

function getCandidate(result, id) {
  return result.safeRenderableEvents.find(function (candidate) {
    return candidate.id === id;
  }) || result.allCandidates.find(function (candidate) {
    return candidate.id === id;
  });
}

function ids(items) {
  return items.map(function (item) {
    return item.id;
  });
}

function makeDelayedSmallBucketLedger() {
  return {
    version: "income-impact-asset-depletion-ledger-v1",
    status: "ready",
    orderedBuckets: [
      { bucketId: "cash", family: "cash", availableValue: 5000, firstUsedMonth: 0, depletionMonth: 4, sourcePath: "ordered.cash" },
      { bucketId: "emergency", family: "emergencyFund", availableValue: 500, firstUsedMonth: 5, depletionMonth: 5, sourcePath: "ordered.emergency" },
      { bucketId: "taxable", family: "taxableInvestments", availableValue: 500, firstUsedMonth: 6, depletionMonth: 6, sourcePath: "ordered.taxable" }
    ],
    ledgerMonths: [
      month(0, 1000, { start: { cash: 5000, emergencyFund: 500, taxableInvestments: 500 }, end: { cash: 4000, emergencyFund: 500, taxableInvestments: 500 } }),
      month(1, 1000, { start: { cash: 4000, emergencyFund: 500, taxableInvestments: 500 }, end: { cash: 3000, emergencyFund: 500, taxableInvestments: 500 } }),
      month(2, 1000, { start: { cash: 3000, emergencyFund: 500, taxableInvestments: 500 }, end: { cash: 2000, emergencyFund: 500, taxableInvestments: 500 } }),
      month(3, 1000, { start: { cash: 2000, emergencyFund: 500, taxableInvestments: 500 }, end: { cash: 1000, emergencyFund: 500, taxableInvestments: 500 } }),
      month(4, 1000, { start: { cash: 1000, emergencyFund: 500, taxableInvestments: 500 }, end: { cash: 0, emergencyFund: 500, taxableInvestments: 500 } }),
      month(5, 1000, { start: { cash: 0, emergencyFund: 500, taxableInvestments: 500 }, end: { cash: 0, emergencyFund: 0, taxableInvestments: 500 } }),
      month(6, 1000, { start: { cash: 0, emergencyFund: 0, taxableInvestments: 500 }, end: { cash: 0, emergencyFund: 0, taxableInvestments: 0 } })
    ],
    bucketEvents: [
      makeLedgerEvent({ family: "cash", eventType: "bucket-tapped", monthIndex: 0, amountAtTap: 5000 }),
      makeLedgerEvent({ family: "cash", eventType: "bucket-depleted", monthIndex: 4, amountDepleted: 5000 }),
      makeLedgerEvent({ family: "emergencyFund", eventType: "bucket-tapped", monthIndex: 5, amountAtTap: 500 }),
      makeLedgerEvent({ family: "emergencyFund", eventType: "bucket-depleted", monthIndex: 5, amountDepleted: 500 }),
      makeLedgerEvent({ family: "taxableInvestments", eventType: "bucket-tapped", monthIndex: 6, amountAtTap: 500 }),
      makeLedgerEvent({ family: "taxableInvestments", eventType: "bucket-depleted", monthIndex: 6, amountDepleted: 500 })
    ],
    trace: {
      totalResourcesReconciliation: {
        verified: true,
        monthsChecked: 7
      }
    }
  };
}

const input = makeInput();
const inputSnapshot = cloneJson(input);
const result = buildIncomeImpactFinancialStorylineCandidates(input);
assert.deepEqual(input, inputSnapshot, "Liquidity trigger derivation must not mutate input.");

[
  "cash-reserve-begins-declining",
  "cash-reserve-nearly-depleted",
  "cash-reserve-depleted",
  "emergency-fund-used",
  "emergency-fund-nearly-depleted",
  "emergency-fund-depleted",
  "taxable-investments-tapped",
  "taxable-investments-nearly-depleted",
  "taxable-investments-depleted",
  "ninety-day-cash-window-tight"
].forEach(function (id) {
  assert.ok(ids(result.safeRenderableEvents).includes(id), `${id} should be emitted from locked liquidity trigger math.`);
  assert.equal(getCandidate(result, id).candidateSource, "canonical-liquidity-trigger");
});

assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").trace.monthlyBurn, 100);
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").trace.remainingValue, 250);
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").trace.thresholdValue, 300);
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").visibleEventKey, "liquidity:cash:cash-reserve:nearly-depleted:month-1");
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").bucketFamily, "cash");
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").bucketId, "cash-reserve");
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").eventState, "nearly-depleted");
assert.equal(getCandidate(result, "cash-reserve-nearly-depleted").stateRank, 2);
assert.equal(getCandidate(result, "cash-reserve-depleted").trace.remainingValue, 80);
assert.equal(getCandidate(result, "cash-reserve-depleted").trace.thresholdValue, 100);
assert.equal(getCandidate(result, "emergency-fund-used").eligibleForMajorCard, false);
assert.equal(getCandidate(result, "emergency-fund-used").supportingDotOnly, true);
assert.equal(getCandidate(result, "emergency-fund-used").timing.monthOffset, 3);
assert.equal(getCandidate(result, "emergency-fund-nearly-depleted").timing.monthOffset, 4);
assert.equal(getCandidate(result, "emergency-fund-depleted").timing.monthOffset, 5);
assert.equal(getCandidate(result, "emergency-fund-nearly-depleted").trace.firstUsedMonth, 3);
assert.equal(getCandidate(result, "emergency-fund-depleted").trace.firstUsedMonth, 3);
assert.equal(getCandidate(result, "emergency-fund-depleted").visibleEventKey, "liquidity:emergencyFund:emergency-fund:depleted:month-5");
assert.equal(getCandidate(result, "taxable-investments-tapped").eligibleForMajorCard, false);
assert.equal(getCandidate(result, "taxable-investments-tapped").supportingDotOnly, true);
assert.equal(getCandidate(result, "taxable-investments-nearly-depleted").visibleEventKey, "liquidity:taxableInvestments:taxable-investments:nearly-depleted:month-8");
assert.equal(getCandidate(result, "taxable-investments-nearly-depleted").cardConceptId, "taxableInvestments");
assert.equal(getCandidate(result, "taxable-investments-nearly-depleted").bucketFamily, "taxableInvestments");
assert.equal(getCandidate(result, "ninety-day-cash-window-tight").trace.fastAccessResources, 1100);
assert.equal(getCandidate(result, "ninety-day-cash-window-tight").trace.transitionNeed90Days, 1000);
assert.equal(getCandidate(result, "ninety-day-cash-window-tight").trace.fastAccessCoverageRatio, 1.1);
assert.deepEqual(
  getCandidate(result, "ninety-day-cash-window-tight").trace.includedFastAccessFamilies.map(function (bucket) {
    return bucket.family;
  }),
  ["preDeathSavedCash", "cash", "emergencyFund", "otherLiquid"],
  "90-day cash-window resources should include only canonical fast-access families."
);
assert.equal(
  getCandidate(result, "ninety-day-cash-window-tight").trace.excludedFastAccessFamilies.includes("taxableInvestments"),
  true,
  "Taxable investments must be excluded from 90-day fast-access resources."
);
assert.equal(ids(result.safeRenderableEvents).includes("cash-savings-depleted"), false);
assert.equal(ids(result.safeRenderableEvents).includes("taxable-assets-depleted"), false);
assert.equal(ids(result.safeRenderableEvents).includes("liquid-investments-depleted"), false);

const assembly = buildIncomeImpactTimelineStoryAssembly({
  financialStoryline: result,
  graphModel: input.graphModel,
  options: {
    supportingGraphDotLimit: 12
  }
});
const storyTitles = assembly.storySteps.map(function (step) {
  return step.title;
});
assert.equal(storyTitles.includes("Cash Reserve Begins Declining"), false);
assert.equal(storyTitles.includes("Emergency Fund Is Used"), false);
assert.equal(storyTitles.includes("Taxable Investments Are Tapped"), false);
assert.equal(storyTitles.includes("Taxable Investments Are Nearly Depleted"), true);
assert.equal(
  assembly.storySteps.filter(function (step) {
    return step.title === "Cash Reserve Is Nearly Depleted";
  }).length,
  1,
  "Cash near-depleted should not duplicate when taxable near-depleted is also present."
);
assert.deepEqual(
  assembly.supportingGraphDots.filter(function (dot) {
    return [
      "cash-reserve-begins-declining",
      "emergency-fund-used",
      "taxable-investments-tapped"
    ].includes(dot.sourceEventId);
  }).map(function (dot) {
    return [dot.sourceEventId, dot.title, dot.tone];
  }),
  [
    ["cash-reserve-begins-declining", "Cash Reserve Begins Declining", "caution"],
    ["emergency-fund-used", "Emergency Fund Is Used", "caution"],
    ["taxable-investments-tapped", "Taxable Investments Are Tapped", "caution"]
  ],
  "Supporting-only liquidity concepts should remain supporting dots."
);

const normalized = normalizeIncomeImpactTimelineStoryEvents({
  financialStoryline: {
    graphDotCandidates: [
      getCandidate(result, "emergency-fund-used")
    ]
  }
});
assert.equal(normalized.events[0].supportingDotOnly, true);
assert.equal(normalized.events[0].eligibleForMajorCard, false);
assert.equal(normalized.events[0].visibleEventKey, "liquidity:emergencyFund:emergency-fund:used:month-3");
assert.equal(normalized.events[0].bucketFamily, "emergencyFund");
assert.equal(normalized.events[0].eventState, "used");

const delayedSmallBucketResult = buildIncomeImpactFinancialStorylineCandidates(makeInput({
  assetDepletionLedger: makeDelayedSmallBucketLedger(),
  scenario: {
    transitionOutlook: {
      transitionNeed90Days: 3000
    },
    postDeathSeries: {
      depletion: {
        depleted: false
      }
    }
  }
}));
assert.equal(
  ids(delayedSmallBucketResult.safeRenderableEvents).includes("emergency-fund-nearly-depleted"),
  false,
  "Emergency fund should not emit nearly depleted before it is reached."
);
assert.equal(
  getCandidate(delayedSmallBucketResult, "emergency-fund-depleted").timing.monthOffset,
  5,
  "Emergency fund depleted should be timed to the first reached month, not month 0."
);
assert.equal(
  getCandidate(delayedSmallBucketResult, "emergency-fund-depleted").trace.firstUsedMonth,
  5,
  "Emergency fund threshold events should trace the first used month."
);
assert.equal(
  ids(delayedSmallBucketResult.safeRenderableEvents).includes("emergency-fund-used"),
  false,
  "Same-month emergency fund used/depleted should keep only depleted visible."
);
assert.ok(delayedSmallBucketResult.suppressedCandidates.some(function (candidate) {
  return candidate.id === "emergency-fund-used"
    && candidate.trace?.precedenceSuppressed === true
    && candidate.trace?.strongerTriggerId === "emergency-fund-depleted";
}), "Suppressed same-month emergency fund used event should remain traceable.");
assert.equal(
  getCandidate(delayedSmallBucketResult, "taxable-investments-depleted").timing.monthOffset,
  6,
  "Taxable investments depleted should not emit before taxable investments are reached."
);
assert.equal(
  getCandidate(delayedSmallBucketResult, "taxable-investments-depleted").trace.firstUsedMonth,
  6,
  "Taxable investment threshold events should trace the first used month."
);
assert.equal(
  ids(delayedSmallBucketResult.safeRenderableEvents).includes("taxable-investments-tapped"),
  false,
  "Same-month taxable tapped/depleted should keep only depleted visible."
);

function makeBandInput(fastAccessResources, transitionNeed90Days) {
  const ledger = makeThresholdLedger();
  ledger.orderedBuckets = [
    { bucketId: "cash", family: "cash", availableValue: fastAccessResources, sourcePath: "ordered.cash" }
  ];
  ledger.ledgerMonths = [
    month(0, 100, {
      start: { cash: fastAccessResources, taxableInvestments: 500000 },
      end: { cash: fastAccessResources, taxableInvestments: 500000 }
    })
  ];
  ledger.bucketEvents = [];
  return makeInput({
    assetDepletionLedger: ledger,
    scenario: {
      transitionOutlook: {
        transitionNeed90Days
      },
      postDeathSeries: {
        depletion: {
          depleted: false
        }
      }
    }
  });
}

[
  [1300, 1000, "ninety-day-cash-window-covered", "90-Day Cash Window Is Covered"],
  [1100, 1000, "ninety-day-cash-window-tight", "90-Day Cash Window Is Tight"],
  [750, 1000, "ninety-day-cash-window-short", "90-Day Cash Window Is Short"],
  [400, 1000, "ninety-day-cash-window-underfunded", "90-Day Cash Window Is Underfunded"]
].forEach(function ([resources, need, id, title]) {
  const bandResult = buildIncomeImpactFinancialStorylineCandidates(makeBandInput(resources, need));
  const candidate = getCandidate(bandResult, id);
  assert.ok(candidate, `${title} should emit at the locked ratio band.`);
  assert.equal(candidate.cardTitle, title);
});

const missingBurnInput = makeInput({
  assetDepletionLedger: Object.assign({}, makeThresholdLedger(), {
    ledgerMonths: [
      {
        monthIndex: 0,
        startingBuckets: [bucket("cash", 500)],
        endingBuckets: [bucket("cash", 250)]
      }
    ]
  })
});
const missingBurnResult = buildIncomeImpactFinancialStorylineCandidates(missingBurnInput);
assert.equal(ids(missingBurnResult.safeRenderableEvents).includes("cash-reserve-nearly-depleted"), false);
assert.equal(ids(missingBurnResult.safeRenderableEvents).includes("cash-reserve-depleted"), false);
assert.ok(missingBurnResult.suppressedCandidates.some(function (candidate) {
  return candidate.candidateSource === "canonical-liquidity-trigger"
    && candidate.trace?.missingSource === "assetDepletionLedger.ledgerMonths.monthlyNetUse";
}));

const cashHoldsLedger = {
  version: "income-impact-asset-depletion-ledger-v1",
  status: "ready",
  orderedBuckets: [
    { bucketId: "cash", family: "cash", availableValue: 1000, firstUsedMonth: 0, sourcePath: "ordered.cash" }
  ],
  ledgerMonths: [
    month(0, 100, { start: { cash: 1000 }, end: { cash: 900 } }),
    month(1, 100, { start: { cash: 900 }, end: { cash: 800 } })
  ],
  bucketEvents: [
    makeLedgerEvent({ family: "cash", eventType: "bucket-tapped", monthIndex: 0, amountAtTap: 1000 })
  ]
};
const cashHoldsResult = buildIncomeImpactFinancialStorylineCandidates(makeInput({
  assetDepletionLedger: cashHoldsLedger,
  scenario: {
    transitionOutlook: {
      transitionNeed90Days: 1000
    },
    postDeathSeries: {
      depletion: {
        depleted: false
      }
    }
  }
}));
assert.ok(ids(cashHoldsResult.safeRenderableEvents).includes("cash-reserve-holds"));
assert.equal(getCandidate(cashHoldsResult, "cash-reserve-holds").trace.deeperBucketUsed, false);

console.log("Income Impact liquidity milestone trigger checks passed.");
