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
    emergencyFund: 300,
    otherLiquid: 200,
    taxableInvestments: 10000
  };
  return {
    version: "income-impact-asset-depletion-ledger-v1",
    status: "ready",
    orderedBuckets: [
      { bucketId: "pre-death", family: "preDeathSavedCash", availableValue: 100, firstUsedMonth: 0, sourcePath: "ordered.preDeath" },
      { bucketId: "cash", family: "cash", availableValue: 500, firstUsedMonth: 0, depletionMonth: 2, sourcePath: "ordered.cash" },
      { bucketId: "emergency", family: "emergencyFund", availableValue: 300, firstUsedMonth: 3, depletionMonth: 5, sourcePath: "ordered.emergency" },
      { bucketId: "other-liquid", family: "otherLiquid", availableValue: 200, sourcePath: "ordered.otherLiquid" },
      { bucketId: "taxable", family: "taxableInvestments", availableValue: 10000, firstUsedMonth: 7, depletionMonth: 9, sourcePath: "ordered.taxable" }
    ],
    ledgerMonths: [
      month(0, 100, { start: starting, end: { cash: 450, emergencyFund: 300, otherLiquid: 200, taxableInvestments: 10000 } }),
      month(1, 100, { start: { cash: 450, emergencyFund: 300, otherLiquid: 200, taxableInvestments: 10000 }, end: { cash: 250, emergencyFund: 300, otherLiquid: 200, taxableInvestments: 10000 } }),
      month(2, 100, { start: { cash: 250, emergencyFund: 300, otherLiquid: 200, taxableInvestments: 10000 }, end: { cash: 80, emergencyFund: 300, otherLiquid: 200, taxableInvestments: 10000 } }),
      month(3, 100, { start: { cash: 0, emergencyFund: 300, otherLiquid: 200, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 250, otherLiquid: 200, taxableInvestments: 10000 } }),
      month(4, 100, { start: { cash: 0, emergencyFund: 250, otherLiquid: 200, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 150, otherLiquid: 200, taxableInvestments: 10000 } }),
      month(5, 100, { start: { cash: 0, emergencyFund: 150, otherLiquid: 200, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 80, otherLiquid: 200, taxableInvestments: 10000 } }),
      month(6, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 200, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 10000 } }),
      month(7, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 10000 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 600 } }),
      month(8, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 600 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 250 } }),
      month(9, 100, { start: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 250 }, end: { cash: 0, emergencyFund: 0, otherLiquid: 0, taxableInvestments: 80 } })
    ],
    bucketEvents: [
      makeLedgerEvent({ family: "cash", eventType: "bucket-tapped", monthIndex: 0, amountAtTap: 500 }),
      makeLedgerEvent({ family: "cash", eventType: "bucket-depleted", monthIndex: 2, amountDepleted: 500 }),
      makeLedgerEvent({ family: "emergencyFund", eventType: "bucket-tapped", monthIndex: 3, amountAtTap: 300 }),
      makeLedgerEvent({ family: "emergencyFund", eventType: "bucket-depleted", monthIndex: 5, amountDepleted: 300 }),
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
assert.equal(getCandidate(result, "cash-reserve-depleted").trace.remainingValue, 80);
assert.equal(getCandidate(result, "cash-reserve-depleted").trace.thresholdValue, 100);
assert.equal(getCandidate(result, "emergency-fund-used").eligibleForMajorCard, false);
assert.equal(getCandidate(result, "emergency-fund-used").supportingDotOnly, true);
assert.equal(getCandidate(result, "taxable-investments-tapped").eligibleForMajorCard, false);
assert.equal(getCandidate(result, "taxable-investments-tapped").supportingDotOnly, true);
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
