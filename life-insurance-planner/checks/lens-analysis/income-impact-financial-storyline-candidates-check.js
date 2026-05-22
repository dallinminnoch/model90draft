#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const helper = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
));

const {
  buildIncomeImpactFinancialStorylineCandidates,
  incomeImpactFinancialStorylineCandidateRegistry,
  INCOME_IMPACT_FINANCIAL_STORYLINE_EVIDENCE_LEVELS,
  INCOME_IMPACT_FINANCIAL_STORYLINE_STATUSES
} = helper;

assert.equal(typeof buildIncomeImpactFinancialStorylineCandidates, "function");
assert.equal(typeof incomeImpactFinancialStorylineCandidateRegistry, "object");
assert.equal(INCOME_IMPACT_FINANCIAL_STORYLINE_EVIDENCE_LEVELS.waterfallNeeded, "waterfall-needed");
assert.equal(INCOME_IMPACT_FINANCIAL_STORYLINE_STATUSES.safeNow, "safe-now");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRichInput() {
  return {
    selectedScenarioId: "income-impact-current-scenario",
    scenario: {
      status: "complete",
      scenario: {
        selectedDeathDate: "2036-05-14",
        selectedDeathAge: 52,
        mortgageTreatmentOverride: "payOffMortgage"
      },
      deathEvent: {
        date: "2036-05-14",
        age: 52,
        coverageAdded: 450000,
        immediateObligations: 86000,
        resourcesAfterObligations: 364000,
        layer2: {
          immediateObligations: {
            finalExpenses: {
              value: 18000,
              sourcePaths: ["lensModel.finalExpenses.totalFinalExpenseNeed"]
            },
            debtPayoff: {
              value: 42000,
              sourcePaths: ["lensModel.treatedDebtPayoff.total"]
            }
          }
        }
      },
      timelineFacts: {
        coverageAdded: 450000,
        resourcesAfterObligations: 364000,
        monthsCovered: 18,
        depletionDate: "2037-11-14",
        accumulatedUnmetNeed: 125000
      },
      postDeathSeries: {
        points: [
          { monthIndex: 0, date: "2036-05-14", remainingResources: 364000 },
          { monthIndex: 18, date: "2037-11-14", remainingResources: 0 }
        ],
        summary: {
          annualShortfall: 72000,
          accumulatedUnmetNeed: 125000
        },
        depletion: {
          depleted: true,
          depletionDate: "2037-11-14",
          depletionMonthIndex: 18,
          monthsCovered: 18,
          sourcePaths: ["scenario.postDeathSeries.depletion"]
        }
      },
      trace: {
        layer3: {
          survivorIncome: {
            annualAmount: 36000
          }
        }
      },
      warnings: [
        {
          code: "partial-runway-source",
          message: "Some runway inputs are partial.",
          sourcePaths: ["scenario.warnings"]
        }
      ]
    },
    financialRunway: {
      annualShortfall: 72000,
      immediateObligations: 86000,
      existingCoverage: 450000,
      netAvailableResources: 364000
    },
    graphModel: {
      series: {
        appliedRunwayScenarios: [
          {
            scenarioId: "income-impact-current-scenario",
            selected: true,
            depletionPoint: {
              monthIndex: 18,
              date: "2037-11-14",
              value: 0
            }
          }
        ]
      },
      trace: {
        selectedScenarioId: "income-impact-current-scenario"
      }
    },
    riskEvaluation: {
      status: "complete",
      events: [],
      stableEvents: [],
      warnings: [],
      dataGaps: []
    },
    comparisonScenarios: [],
    appliedScenarios: []
  };
}

function ids(items) {
  return items.map(function (item) {
    return item.id;
  });
}

function getCandidate(result, id) {
  return result.allCandidates.find(function (candidate) {
    return candidate.id === id;
  });
}

const mechanicalVisibleSuppressedIds = [
  "life-insurance-proceeds-applied",
  "immediate-obligations-paid",
  "final-expenses-paid",
  "debt-payoff-consumes-liquidity",
  "mortgage-is-paid-off",
  "survivor-income-helps-offset-need",
  "survivor-runway-begins"
];

const removedVisibleEventIds = [
  "protection-gap-appears-immediately",
  "protection-gap-appears",
  "retirement-security-reduced",
  "retirement-security-is-reduced",
  "home-equity-becomes-last-resort",
  "current-lifestyle-no-longer-sustainable"
];

const removedVisibleEventLabels = [
  "Protection Gap Appears Immediately",
  "Retirement Security Is Reduced",
  "Home Equity Becomes Last Resort",
  "Current Lifestyle No Longer Sustainable"
];

const richInput = makeRichInput();
const originalInput = cloneJson(richInput);
const result = buildIncomeImpactFinancialStorylineCandidates(richInput);

assert.equal(result.version, "financial-storyline-candidates-v1");
assert.equal(result.trace.source, "income-impact-financial-storyline-calculations");
assert.equal(result.trace.generatedAt, null);
assert.equal(
  Object.prototype.hasOwnProperty.call(result.trace, "activatedWaterfallCandidateIds"),
  false,
  "No-waterfall behavior should not add waterfall trace fields."
);
assert.equal(
  Object.prototype.hasOwnProperty.call(result.trace, "activatedHousingRiskCandidateIds"),
  false,
  "No-housing-risk behavior should not add housing-risk trace fields."
);
assert.deepEqual(richInput, originalInput, "Helper should not mutate input objects.");

assert.equal(result.safeRenderableEvents[0].id, "death-income-stops");
assert.equal(result.safeRenderableEvents[0].displayLabel, "Death & Income Stops");
assert.equal(result.majorStoryCandidates[0].id, "death-income-stops");
assert.ok(result.safeRenderableEvents.every(function (candidate) {
  return candidate.safeToRender === true;
}));

assert.ok(ids(result.safeRenderableEvents).includes("life-insurance-proceeds-applied"));
assert.ok(ids(result.safeRenderableEvents).includes("immediate-obligations-paid"));
assert.ok(ids(result.safeRenderableEvents).includes("final-expenses-paid"));
assert.ok(ids(result.safeRenderableEvents).includes("debt-payoff-consumes-liquidity"));
assert.ok(ids(result.safeRenderableEvents).includes("mortgage-is-paid-off"));
assert.ok(ids(result.safeRenderableEvents).includes("survivor-income-helps-offset-need"));
assert.ok(ids(result.safeRenderableEvents).includes("survivor-income-not-enough-alone"));
assert.ok(ids(result.safeRenderableEvents).includes("survivor-runway-begins"));
assert.ok(ids(result.safeRenderableEvents).includes("resources-run-out"));
assert.ok(ids(result.safeRenderableEvents).includes("monthly-support-gap-begins"));
assert.ok(ids(result.safeRenderableEvents).includes("unfunded-need-accumulates"));
assert.ok(ids(result.safeRenderableEvents).includes("missing-data-limits-timeline"));

assert.ok(ids(result.safeRenderableEvents).includes("protection-gap-appears-immediately"));
assert.equal(getCandidate(result, "protection-gap-appears-immediately").storyRole, "detail");
removedVisibleEventIds.forEach(function (id) {
  assert.ok(!ids(result.majorStoryCandidates).includes(id), `${id} should not enter majorStoryCandidates.`);
  assert.ok(!ids(result.majorGraphDotCandidates).includes(id), `${id} should not enter majorGraphDotCandidates.`);
  assert.ok(!ids(result.microGraphDotCandidates).includes(id), `${id} should not enter microGraphDotCandidates.`);
  assert.ok(!ids(result.graphDotCandidates).includes(id), `${id} should not enter combined graphDotCandidates.`);
});

mechanicalVisibleSuppressedIds.forEach(function (id) {
  assert.ok(ids(result.safeRenderableEvents).includes(id), `${id} should remain safe renderable when supported.`);
  assert.equal(getCandidate(result, id).storyRole, "mechanical", `${id} should be classified as mechanical.`);
  assert.ok(!ids(result.majorStoryCandidates).includes(id), `${id} should not enter majorStoryCandidates.`);
  assert.ok(!ids(result.majorGraphDotCandidates).includes(id), `${id} should not enter majorGraphDotCandidates.`);
  assert.ok(!ids(result.microGraphDotCandidates).includes(id), `${id} should not enter microGraphDotCandidates.`);
  assert.ok(!ids(result.graphDotCandidates).includes(id), `${id} should not enter combined graphDotCandidates.`);
});

assert.ok(result.majorStoryCandidates.length <= 6);
assert.ok(result.majorGraphDotCandidates.length <= 6);
assert.ok(result.microGraphDotCandidates.length <= 10);
assert.ok(result.graphDotCandidates.length <= 16);
assert.equal(result.allCandidates.length, 44);
assert.equal(result.safeRenderableEvents.length, 14);
assert.equal(result.majorStoryCandidates.length, 4);
assert.equal(result.graphDotCandidates.length, 5);
assert.equal(result.trace.safeRenderableCount, result.safeRenderableEvents.length);
assert.equal(result.trace.majorStoryCandidateLimit, 6);
assert.equal(result.trace.graphDotCandidateLimit, 16);
assert.deepEqual(result.trace.selectedMajorCandidateIds, ids(result.majorStoryCandidates));
assert.deepEqual(result.trace.selectedGraphDotCandidateIds, ids(result.graphDotCandidates));
assert.equal(result.majorStoryCandidates[0].id, "death-income-stops");
assert.deepEqual(
  result.graphDotCandidates,
  result.majorGraphDotCandidates.concat(result.microGraphDotCandidates),
  "Combined graph dots should be major graph dots followed by micro graph dots."
);
assert.ok(result.majorGraphDotCandidates.every(function (candidate) {
  return ids(result.majorStoryCandidates).includes(candidate.id)
    && candidate.dotTier === "major"
    && candidate.connectedToMajorCard === true
    && candidate.eligibleForConnector === true
    && Number.isInteger(candidate.majorCardIndex);
}));
assert.ok(result.microGraphDotCandidates.every(function (candidate) {
  return !ids(result.majorStoryCandidates).includes(candidate.id)
    && candidate.dotTier === "micro"
    && candidate.connectedToMajorCard === false
    && candidate.eligibleForConnector === false
    && candidate.majorCardIndex === null;
}));
assert.ok(result.majorStoryCandidates.every(function (candidate) {
  return candidate.storyRole === "emotional" || candidate.storyRole === "data-gap";
}));
assert.ok(result.graphDotCandidates.every(function (candidate) {
  return candidate.storyRole === "emotional" || candidate.storyRole === "data-gap";
}));
assert.equal(result.trace.mechanicalDetailSuppressedCount, mechanicalVisibleSuppressedIds.length + 1);
assert.equal(result.trace.storyRoleCounts.mechanical, mechanicalVisibleSuppressedIds.length);
assert.equal(result.trace.storyRoleCounts.detail, 1);
assert.ok(result.trace.visibleEmotionalEventIds.includes("resources-run-out"));
assert.equal(result.trace.selectorSuppressedCountsByReason["family-diversity"], 1);
assert.equal(result.trace.selectorSuppressedCountsByReason["data-gap-lower-priority"], 1);
assert.equal(result.trace.selectorSuppressedCountsByReason["duplicate-major-dot"], 4);
assert.equal(result.trace.selectorSuppressedCountsByReason["mechanical-detail-hidden"], 8);
assert.ok(
  result.suppressedCandidates.some(function (candidate) {
    return candidate.id === "life-insurance-proceeds-applied"
      && candidate.selectionSuppressionReason === "mechanical-detail-hidden";
  }),
  "Mechanical/detail events should be suppressed from visible storyline selections."
);
assert.ok(
  result.suppressedCandidates.some(function (candidate) {
    return candidate.id === "protection-gap-appears-immediately"
      && candidate.selectionSuppressionReason === "mechanical-detail-hidden";
  }),
  "Removed visible events should be suppressed from visible storyline selections."
);

const selectedFamilies = result.majorStoryCandidates.slice(1).map(function (candidate) {
  return candidate.family;
});
assert.ok(new Set(selectedFamilies).size > 1, "Major selector should include alternatives when multiple families exist.");
selectedFamilies.forEach(function (family) {
  const count = selectedFamilies.filter(function (candidateFamily) {
    return candidateFamily === family;
  }).length;
  assert.ok(count <= 2, `Major selector should not over-select family ${family}.`);
});

const minimalResult = buildIncomeImpactFinancialStorylineCandidates({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    },
    timelineFacts: {},
    postDeathSeries: {}
  }
});
assert.deepEqual(ids(minimalResult.safeRenderableEvents), ["death-income-stops"]);

const mechanicalOnlyResult = buildIncomeImpactFinancialStorylineCandidates({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14",
      mortgageTreatmentOverride: "payOffMortgage"
    },
    deathEvent: {
      date: "2036-05-14",
      coverageAdded: 100000,
      immediateObligations: 20000,
      resourcesAfterObligations: 80000
    },
    timelineFacts: {
      coverageAdded: 100000,
      resourcesAfterObligations: 80000
    }
  },
  financialRunway: {
    existingCoverage: 100000,
    immediateObligations: 20000,
    netAvailableResources: 80000
  }
});
assert.ok(ids(mechanicalOnlyResult.safeRenderableEvents).includes("life-insurance-proceeds-applied"));
assert.ok(ids(mechanicalOnlyResult.safeRenderableEvents).includes("immediate-obligations-paid"));
assert.deepEqual(ids(mechanicalOnlyResult.majorStoryCandidates), ["death-income-stops"]);
assert.deepEqual(ids(mechanicalOnlyResult.majorGraphDotCandidates), ["death-income-stops"]);
assert.deepEqual(mechanicalOnlyResult.microGraphDotCandidates, []);
assert.deepEqual(ids(mechanicalOnlyResult.graphDotCandidates), ["death-income-stops"]);
assert.equal(mechanicalOnlyResult.trace.storyRoleCounts.mechanical, 4);
assert.equal(mechanicalOnlyResult.trace.mechanicalDetailSuppressedCount, 4);

const deferredIds = ids(result.deferredCandidates);
[
  "cash-savings-depleted",
  "emergency-fund-depleted",
  "education-savings-depleted",
  "retirement-assets-tapped",
  "housing-payment-at-risk",
  "foreclosure-risk-window-opens",
  "eviction-risk-window-opens",
  "vehicle-payment-at-risk"
].forEach(function (id) {
  assert.ok(deferredIds.includes(id), `${id} should be registered as deferred.`);
  const candidate = getCandidate(result, id);
  assert.equal(candidate.safeToRender, false, `${id} should not be safe to render.`);
  assert.equal(candidate.status, "deferred", `${id} should remain deferred.`);
});

[
  "emergency-fund-depleted",
  "education-savings-depleted",
  "retirement-assets-tapped",
  "housing-payment-at-risk"
].forEach(function (id) {
  assert.ok(!ids(result.safeRenderableEvents).includes(id), `${id} must not be safe-renderable without model support.`);
  assert.ok(!ids(result.majorStoryCandidates).includes(id), `${id} must not be selected for major cards.`);
  assert.ok(!ids(result.graphDotCandidates).includes(id), `${id} must not be selected for graph dots.`);
});

assert.ok(
  incomeImpactFinancialStorylineCandidateRegistry.deferred.some(function (candidate) {
    return candidate.id === "emergency-fund-depleted" && candidate.evidenceLevel === "waterfall-needed";
  }),
  "Registry should expose deferred waterfall candidates for future activation."
);

function makeWaterfallEvent(config) {
  const event = {
    id: `${config.bucketId}.${config.eventType}`,
    bucketId: config.bucketId,
    eventType: config.eventType,
    displayLabel: config.displayLabel,
    family: config.family,
    monthOffset: config.monthOffset,
    amount: config.amount,
    evidenceLevel: config.evidenceLevel || "estimated",
    safeToRender: config.safeToRender !== false,
    sourcePath: config.sourcePath || `resourceWaterfall.buckets.${config.bucketId}`,
    warnings: config.warnings || [],
    trace: {
      bucketSourcePath: config.sourcePath || `resourceWaterfall.buckets.${config.bucketId}`,
      burnRateSourcePath: "resourceWaterfall.trace.burnRateSource",
      dateSourcePath: "resourceWaterfall.selectedDeathDate"
    }
  };
  if (config.date != null) {
    event.date = config.date;
  }
  return event;
}

function makeLedgerEvent(config) {
  const trace = Object.assign({
    source: "income-impact-asset-depletion-ledger",
    visibleStorylineEligible: false
  }, config.trace || {});
  if (config.withdrawalAmount != null) {
    trace.withdrawalAmount = config.withdrawalAmount;
  }
  if (config.balanceBeforeWithdrawal != null) {
    trace.balanceBeforeWithdrawal = config.balanceBeforeWithdrawal;
  }
  const event = {
    eventType: config.eventType,
    bucketId: config.bucketId,
    family: config.family,
    monthIndex: config.monthIndex,
    amountAtTap: config.amountAtTap == null ? null : config.amountAtTap,
    amountDepleted: config.amountDepleted == null ? null : config.amountDepleted,
    sourcePath: config.sourcePath || `assetDepletionLedger.buckets.${config.bucketId}`,
    evidenceLevel: config.evidenceLevel || "trace-backed",
    trace
  };
  if (config.date != null) {
    event.date = config.date;
  }
  return event;
}

const waterfallInput = {
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    },
    timelineFacts: {},
    postDeathSeries: {}
  },
  resourceWaterfall: {
    version: "income-impact-resource-waterfall-v1",
    timelineEvents: [
      makeWaterfallEvent({
        bucketId: "cash",
        eventType: "bucket-depleted",
        displayLabel: "Cash Savings Depleted",
        family: "cash",
        monthOffset: 1,
        date: "2036-06-14",
        amount: 12000,
        evidenceLevel: "calculated",
        sourcePath: "resourceWaterfall.buckets.cash"
      }),
      makeWaterfallEvent({
        bucketId: "emergency",
        eventType: "bucket-depleted",
        displayLabel: "Emergency Fund Depleted",
        family: "emergencyFund",
        monthOffset: 3,
        date: "2036-08-14",
        amount: 18000,
        evidenceLevel: "estimated",
        sourcePath: "resourceWaterfall.buckets.emergency"
      }),
      makeWaterfallEvent({
        bucketId: "education",
        eventType: "bucket-reached",
        displayLabel: "Education Savings Used for Living Needs",
        family: "educationSavings",
        monthOffset: 4,
        date: "2036-09-14",
        amount: 24000,
        evidenceLevel: "assumption-backed",
        sourcePath: "resourceWaterfall.buckets.education"
      }),
      makeWaterfallEvent({
        bucketId: "education",
        eventType: "bucket-depleted",
        displayLabel: "Education Savings Depleted",
        family: "educationSavings",
        monthOffset: 7,
        date: "2036-12-14",
        amount: 24000,
        evidenceLevel: "assumption-backed",
        sourcePath: "resourceWaterfall.buckets.education"
      }),
      makeWaterfallEvent({
        bucketId: "retirement",
        eventType: "bucket-reached",
        displayLabel: "Retirement Assets Tapped",
        family: "retirementAssets",
        monthOffset: 7,
        date: "2036-12-14",
        amount: 64000,
        evidenceLevel: "estimated",
        sourcePath: "resourceWaterfall.buckets.retirement"
      }),
      makeWaterfallEvent({
        bucketId: "retirement",
        eventType: "bucket-depleted",
        displayLabel: "Retirement Assets Depleted",
        family: "retirementAssets",
        monthOffset: 14,
        date: "2037-07-14",
        amount: 64000,
        evidenceLevel: "estimated",
        sourcePath: "resourceWaterfall.buckets.retirement"
      }),
      makeWaterfallEvent({
        bucketId: "home",
        eventType: "bucket-reached",
        displayLabel: "Home Equity Becomes Last Resort",
        family: "homeEquity",
        monthOffset: 14,
        date: "2037-07-14",
        amount: 90000,
        evidenceLevel: "estimated",
        sourcePath: "resourceWaterfall.buckets.home"
      }),
      makeWaterfallEvent({
        bucketId: "home",
        eventType: "bucket-depleted",
        displayLabel: "Home Equity Depleted",
        family: "homeEquity",
        monthOffset: 22,
        date: "2038-03-14",
        amount: 90000,
        evidenceLevel: "estimated",
        sourcePath: "resourceWaterfall.buckets.home"
      }),
      makeWaterfallEvent({
        bucketId: "bad",
        eventType: "bucket-depleted",
        displayLabel: "Credit Crisis",
        family: "cash",
        monthOffset: 2,
        amount: 500,
        evidenceLevel: "estimated",
        sourcePath: "resourceWaterfall.buckets.bad"
      }),
      makeWaterfallEvent({
        bucketId: "insufficient",
        eventType: "bucket-depleted",
        displayLabel: "Cash Savings Depleted",
        family: "cash",
        monthOffset: 2,
        amount: 500,
        evidenceLevel: "insufficient-data",
        safeToRender: false,
        sourcePath: "resourceWaterfall.buckets.insufficient"
      })
    ]
  }
};
const waterfallSnapshot = cloneJson(waterfallInput);
const waterfallResult = buildIncomeImpactFinancialStorylineCandidates(waterfallInput);
assert.deepEqual(waterfallInput, waterfallSnapshot, "Obsolete waterfall input should not be mutated.");
assert.equal(
  Object.prototype.hasOwnProperty.call(waterfallResult.trace, "activatedWaterfallCandidateIds"),
  false,
  "Obsolete resourceWaterfall input should not activate or trace story candidates."
);
assert.ok(!ids(waterfallResult.safeRenderableEvents).includes("cash-savings-depleted"));
assert.ok(!ids(waterfallResult.safeRenderableEvents).includes("emergency-fund-depleted"));
assert.ok(!ids(waterfallResult.safeRenderableEvents).includes("education-savings-used-for-living-needs"));

const ledgerInput = cloneJson(waterfallInput);
ledgerInput.assetDepletionLedger = {
  version: "income-impact-asset-depletion-ledger-v1",
  status: "ready",
  bucketEvents: [
    makeLedgerEvent({
      bucketId: "coverage",
      family: "existingCoverage",
      eventType: "bucket-depleted",
      monthIndex: 0,
      amountDepleted: 450000,
      sourcePath: "assetDepletionLedger.buckets.coverage"
    }),
    makeLedgerEvent({
      bucketId: "cash",
      family: "cash",
      eventType: "bucket-depleted",
      monthIndex: 1,
      amountDepleted: 12000,
      evidenceLevel: "calculated",
      sourcePath: "assetDepletionLedger.buckets.cash",
      withdrawalAmount: 12000,
      balanceBeforeWithdrawal: 12000
    }),
    makeLedgerEvent({
      bucketId: "emergency",
      family: "emergencyFund",
      eventType: "bucket-depleted",
      monthIndex: 3,
      amountDepleted: 18000,
      evidenceLevel: "estimated",
      sourcePath: "assetDepletionLedger.buckets.emergency"
    }),
    makeLedgerEvent({
      bucketId: "taxable",
      family: "taxableInvestments",
      eventType: "bucket-depleted",
      monthIndex: 4,
      amountDepleted: 36000,
      sourcePath: "assetDepletionLedger.buckets.taxable"
    }),
    makeLedgerEvent({
      bucketId: "other-liquid",
      family: "otherLiquid",
      eventType: "bucket-depleted",
      monthIndex: 5,
      amountDepleted: 9000,
      sourcePath: "assetDepletionLedger.buckets.otherLiquid"
    }),
    makeLedgerEvent({
      bucketId: "education",
      family: "educationSavings",
      eventType: "bucket-tapped",
      monthIndex: 6,
      amountAtTap: 24000,
      sourcePath: "assetDepletionLedger.buckets.education"
    }),
    makeLedgerEvent({
      bucketId: "education",
      family: "educationSavings",
      eventType: "bucket-depleted",
      monthIndex: 8,
      amountDepleted: 12000,
      sourcePath: "assetDepletionLedger.buckets.education"
    }),
    makeLedgerEvent({
      bucketId: "retirement",
      family: "retirementAssets",
      eventType: "bucket-tapped",
      monthIndex: 9,
      amountAtTap: 64000,
      sourcePath: "assetDepletionLedger.buckets.retirement"
    }),
    makeLedgerEvent({
      bucketId: "retirement",
      family: "retirementAssets",
      eventType: "bucket-depleted",
      monthIndex: 14,
      amountDepleted: 32000,
      sourcePath: "assetDepletionLedger.buckets.retirement"
    }),
    makeLedgerEvent({
      bucketId: "home",
      family: "homeEquity",
      eventType: "bucket-depleted",
      monthIndex: 15,
      amountDepleted: 90000,
      sourcePath: "assetDepletionLedger.buckets.home"
    }),
    makeLedgerEvent({
      bucketId: "business",
      family: "businessAssets",
      eventType: "bucket-depleted",
      monthIndex: 16,
      amountDepleted: 50000,
      sourcePath: "assetDepletionLedger.buckets.business"
    }),
    makeLedgerEvent({
      bucketId: "custom",
      family: "unknown",
      eventType: "bucket-depleted",
      monthIndex: 17,
      amountDepleted: 20000,
      sourcePath: "assetDepletionLedger.buckets.custom"
    })
  ],
  trace: {
    totalResourcesReconciliation: {
      verified: true,
      monthsChecked: 18
    }
  }
};
const ledgerSnapshot = cloneJson(ledgerInput);
const ledgerResult = buildIncomeImpactFinancialStorylineCandidates(ledgerInput);
const ledgerCandidateIds = [
  "education-savings-used-for-living-needs",
  "education-savings-depleted",
  "retirement-assets-tapped",
  "retirement-assets-depleted"
];
assert.deepEqual(ledgerInput, ledgerSnapshot, "Ledger integration should not mutate input objects.");
ledgerCandidateIds.forEach(function (id) {
  const candidate = getCandidate(ledgerResult, id);
  assert.equal(candidate.safeToRender, true, `${id} should activate from ready asset depletion ledger events.`);
  assert.equal(candidate.status, "safe-now", `${id} should become safe-now from ledger evidence.`);
  assert.equal(candidate.candidateSource, "canonical-runway-asset-waterfall", `${id} should prefer the canonical waterfall candidate source.`);
  assert.equal(candidate.trace.candidateSource, "canonical-runway-asset-waterfall", `${id} should preserve canonical waterfall trace metadata.`);
  assert.ok(ids(ledgerResult.safeRenderableEvents).includes(id), `${id} should be safe renderable from the ledger.`);
});
assert.equal(getCandidate(ledgerResult, "education-savings-used-for-living-needs").trace.ledgerEventType, "bucket-tapped");
assert.equal(getCandidate(ledgerResult, "education-savings-depleted").trace.ledgerEventType, "bucket-depleted");
assert.equal(getCandidate(ledgerResult, "retirement-assets-tapped").trace.ledgerEventType, "bucket-tapped");
assert.equal(getCandidate(ledgerResult, "retirement-assets-depleted").trace.ledgerEventType, "bucket-depleted");
assert.equal(getCandidate(ledgerResult, "retirement-assets-depleted").trace.aggregateRunwayPreserved, true);
assert.equal(getCandidate(ledgerResult, "retirement-assets-depleted").trace.graphLineSource, "aggregate-survivor-runway");
assert.deepEqual(
  getCandidate(ledgerResult, "education-savings-depleted").trace.ledgerReconciliationStatus,
  { verified: true, monthsChecked: 18 },
  "Ledger-backed candidate trace should preserve reconciliation status."
);
[
  "cash-savings-depleted",
  "taxable-assets-depleted",
  "liquid-investments-depleted"
].forEach(function (id) {
  assert.ok(!ids(ledgerResult.safeRenderableEvents).includes(id), `${id} should not return as old liquidity waterfall vocabulary.`);
});
assert.ok(!ledgerResult.safeRenderableEvents.some(function (candidate) {
  return candidate.candidateSource === "canonical-runway-asset-waterfall"
    && ["existingCoverage", "homeEquity", "businessAssets", "unknown"].includes(candidate.trace?.family);
}), "Existing coverage, home equity, business, and unknown ledger events should not create visible candidates.");
assert.ok(ledgerResult.suppressedCandidates.some(function (candidate) {
  return candidate.candidateSource === "canonical-runway-asset-waterfall"
    && candidate.trace?.family === "existingCoverage";
}), "Existing coverage ledger events should be suppressed as mechanical/non-visible.");
assert.ok(ledgerResult.suppressedCandidates.some(function (candidate) {
  return candidate.candidateSource === "canonical-runway-asset-waterfall"
    && candidate.trace?.family === "homeEquity";
}), "Home equity ledger events should be suppressed from visible storyline candidates.");
removedVisibleEventIds.forEach(function (id) {
  assert.ok(!ids(ledgerResult.majorStoryCandidates).includes(id), `${id} should remain absent from ledger-backed major cards.`);
  assert.ok(!ids(ledgerResult.majorGraphDotCandidates).includes(id), `${id} should remain absent from ledger-backed major graph dots.`);
  assert.ok(!ids(ledgerResult.microGraphDotCandidates).includes(id), `${id} should remain absent from ledger-backed micro graph dots.`);
  assert.ok(!ids(ledgerResult.graphDotCandidates).includes(id), `${id} should remain absent from ledger-backed graph dots.`);
});
mechanicalVisibleSuppressedIds.forEach(function (id) {
  assert.ok(!ids(ledgerResult.majorStoryCandidates).includes(id), `${id} should remain absent from ledger-backed major cards.`);
  assert.ok(!ids(ledgerResult.graphDotCandidates).includes(id), `${id} should remain absent from ledger-backed graph dots.`);
});
assert.equal(ledgerResult.trace.assetDepletionLedgerUsedForStoryline, true);
assert.equal(ledgerResult.trace.assetDepletionLedgerStatus, "ready");
assert.equal(ledgerResult.trace.canonicalRunwayWaterfallUsedForStoryline, true);
assert.equal(ledgerResult.trace.canonicalRunwayWaterfallStatus, "ready");
ledgerCandidateIds.forEach(function (id) {
  assert.ok(ledgerResult.trace.ledgerBackedCandidateIds.includes(id), `${id} should be listed as ledger-backed.`);
});
assert.equal(Object.prototype.hasOwnProperty.call(ledgerResult.trace, "waterfallFallbackUsed"), false);
assert.equal(Object.prototype.hasOwnProperty.call(ledgerResult.trace, "activatedWaterfallCandidateIds"), false);
assert.equal(ledgerResult.trace.graphLineSource, "aggregate-survivor-runway");
assert.ok(ledgerResult.trace.majorStoryTierCounts["tier-1"] >= 1);
assert.equal(ledgerResult.trace.selectedAsCounts.major, ledgerResult.majorStoryCandidates.length);
assert.equal(ledgerResult.trace.selectedAsCounts.micro || 0, ledgerResult.microGraphDotCandidates.length);
assert.equal(new Set(ids(ledgerResult.safeRenderableEvents)).size, ids(ledgerResult.safeRenderableEvents).length);
assert.ok(ledgerResult.majorGraphDotCandidates.length <= 6);
assert.ok(ledgerResult.microGraphDotCandidates.length <= 10);
assert.ok(ledgerResult.graphDotCandidates.length <= 16);
assert.equal(ledgerResult.majorStoryCandidates[0].id, "death-income-stops");
assert.ok(ledgerResult.majorStoryCandidates.every(function (candidate) {
  return candidate.selectedAs === "major" && candidate.eventCategory;
}), "Major story cards should carry major selection taxonomy metadata.");
assert.ok(ledgerResult.microGraphDotCandidates.every(function (candidate) {
  return candidate.selectedAs === "micro" && candidate.eventCategory;
}), "Micro dots should carry micro selection taxonomy metadata.");
const ledgerMajorIds = ids(ledgerResult.majorStoryCandidates);
assert.ok(ledgerMajorIds.includes("retirement-assets-tapped"), "Retirement Assets Tapped should outrank retirement depletion for major cards.");
if (ledgerMajorIds.includes("retirement-assets-depleted")) {
  assert.ok(
    ledgerMajorIds.indexOf("retirement-assets-tapped") < ledgerMajorIds.indexOf("retirement-assets-depleted"),
    "Retirement Assets Tapped should rank ahead of Retirement Assets Depleted."
  );
}
assert.ok(ledgerMajorIds.includes("education-savings-depleted"), "Education Savings Depleted should be selected when proven.");
if (ledgerMajorIds.includes("education-savings-used-for-living-needs")) {
  assert.ok(
    ledgerMajorIds.indexOf("education-savings-depleted") < ledgerMajorIds.indexOf("education-savings-used-for-living-needs"),
    "Education Savings Depleted should rank ahead of the education tap event for major cards."
  );
}
assert.ok(
  !ledgerMajorIds.includes("cash-savings-depleted")
    && !ledgerMajorIds.includes("taxable-assets-depleted")
    && !ledgerMajorIds.includes("liquid-investments-depleted"),
  "Old liquidity waterfall labels should not remain major-card candidates after locked trigger replacement."
);
const ledgerMicroCashFamilyCount = ledgerResult.microGraphDotCandidates.filter(function (candidate) {
  return candidate.family === "cash-waterfall";
}).length;
assert.ok(
  ledgerMicroCashFamilyCount <= 3,
  "Micro dots should still cap cash-waterfall repetition."
);

const ledgerWithSupportInput = cloneJson(richInput);
ledgerWithSupportInput.assetDepletionLedger = cloneJson(ledgerInput.assetDepletionLedger);
const ledgerWithSupportResult = buildIncomeImpactFinancialStorylineCandidates(ledgerWithSupportInput);
const ledgerWithSupportMajorIds = ids(ledgerWithSupportResult.majorStoryCandidates);
const ledgerWithSupportMicroIds = ids(ledgerWithSupportResult.microGraphDotCandidates);
assert.ok(ledgerWithSupportMajorIds.includes("education-savings-depleted"));
assert.ok(ledgerWithSupportMicroIds.includes("education-savings-used-for-living-needs"));
assert.ok(ledgerWithSupportMajorIds.includes("retirement-assets-tapped"));
assert.ok(ledgerWithSupportMicroIds.includes("retirement-assets-depleted"));
assert.ok(
  ledgerWithSupportResult.majorStoryCandidates.slice(1).filter(function (candidate) {
    return candidate.family === "education-waterfall";
  }).length <= 1,
  "Family diversity should keep the paired education tap out of major cards when stronger alternatives exist."
);
assert.ok(
  ledgerWithSupportResult.majorStoryCandidates.slice(1).filter(function (candidate) {
    return ["runway", "gap", "unmet-need"].includes(candidate.family);
  }).length <= 3,
  "Runway failure should not crowd out the major-card set."
);

const staticFallbackResult = buildIncomeImpactFinancialStorylineCandidates(Object.assign({}, waterfallInput, {
  assetDepletionLedger: {
    version: "income-impact-canonical-runway-asset-waterfall-v1",
    status: "insufficient-data",
    bucketEvents: ledgerInput.assetDepletionLedger.bucketEvents
  }
}));
assert.equal(staticFallbackResult.trace.assetDepletionLedgerUsedForStoryline, false);
assert.equal(staticFallbackResult.trace.assetDepletionLedgerStatus, "insufficient-data");
assert.equal(staticFallbackResult.trace.canonicalRunwayWaterfallUsedForStoryline, false);
assert.equal(staticFallbackResult.trace.canonicalRunwayWaterfallStatus, "insufficient-data");
assert.equal(Object.prototype.hasOwnProperty.call(staticFallbackResult.trace, "waterfallFallbackUsed"), false);
assert.ok(!ids(staticFallbackResult.safeRenderableEvents).includes("cash-savings-depleted"));

function makeHousingRiskEvent(config) {
  const event = {
    id: config.id || `housing.${config.eventType}`,
    family: "housing-risk",
    eventType: config.eventType,
    displayLabel: config.displayLabel,
    monthOffset: config.monthOffset,
    amount: config.amount,
    evidenceLevel: config.evidenceLevel || "estimated",
    safeToRender: config.safeToRender !== false,
    sourcePath: config.sourcePath || "housingRisk.obligations.primary",
    warnings: config.warnings || [],
    trace: Object.assign({
      obligationId: "primary-housing",
      obligationSourcePath: config.sourcePath || "housingRisk.obligations.primary"
    }, config.trace || {})
  };
  if (config.date != null) {
    event.date = config.date;
  }
  return Object.assign(event, config.extra || {});
}

const housingInput = {
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    }
  },
  housingRisk: {
    version: "income-impact-housing-risk-v1",
    timelineEvents: [
      makeHousingRiskEvent({
        id: "mortgage-payoff",
        eventType: "mortgage-paid-off",
        displayLabel: "Mortgage Is Paid Off",
        monthOffset: 0,
        date: "2036-05-14",
        amount: 385000,
        evidenceLevel: "trace-backed",
        sourcePath: "housingRisk.obligations.mortgagePayoff"
      }),
      makeHousingRiskEvent({
        id: "mortgage-support",
        eventType: "mortgage-payments-continue",
        displayLabel: "Mortgage Payments Continue",
        monthOffset: 0,
        date: "2036-05-14",
        amount: 2400,
        evidenceLevel: "assumption-backed",
        sourcePath: "housingRisk.obligations.mortgageSupport"
      }),
      makeHousingRiskEvent({
        id: "rent-pressure",
        eventType: "rent-payment-pressure-begins",
        displayLabel: "Rent Payment Pressure Begins",
        monthOffset: 1,
        date: "2036-06-14",
        amount: 2100,
        evidenceLevel: "estimated",
        sourcePath: "housingRisk.obligations.rent"
      }),
      makeHousingRiskEvent({
        id: "legal-default",
        eventType: "foreclosure-risk-window",
        displayLabel: "Foreclosure Risk Window Opens",
        monthOffset: 8,
        amount: 2400,
        evidenceLevel: "estimated",
        sourcePath: "housingRisk.obligations.legal"
      }),
      makeHousingRiskEvent({
        id: "insufficient-housing",
        eventType: "housing-payment-at-risk",
        displayLabel: "Housing Payment At Risk",
        monthOffset: 8,
        amount: 2400,
        evidenceLevel: "insufficient-data",
        safeToRender: false,
        sourcePath: "housingRisk.obligations.insufficient"
      })
    ],
    riskEvents: [
      makeHousingRiskEvent({
        id: "housing-pressure",
        eventType: "housing-payment-pressure-begins",
        displayLabel: "Housing Payment Pressure Begins",
        monthOffset: 1,
        date: "2036-06-14",
        amount: 2400,
        evidenceLevel: "calculated",
        sourcePath: "housingRisk.obligations.primary"
      }),
      makeHousingRiskEvent({
        id: "housing-at-risk",
        eventType: "housing-payment-at-risk",
        displayLabel: "Housing Payment At Risk",
        monthOffset: 8,
        date: "2037-01-14",
        amount: 2400,
        evidenceLevel: "estimated",
        sourcePath: "housingRisk.obligations.primary"
      }),
      makeHousingRiskEvent({
        id: "housing-stability",
        eventType: "housing-stability-at-risk",
        displayLabel: "Housing Stability At Risk",
        monthOffset: 8,
        date: "2037-01-14",
        amount: 2400,
        evidenceLevel: "estimated",
        sourcePath: "housingRisk.obligations.primary"
      })
    ]
  }
};
const housingSnapshot = cloneJson(housingInput);
const housingResult = buildIncomeImpactFinancialStorylineCandidates(housingInput);
assert.deepEqual(housingInput, housingSnapshot, "Housing-risk integration should not mutate input objects.");

[
  "mortgage-is-paid-off",
  "mortgage-payments-continue",
  "housing-payment-pressure-begins",
  "housing-payment-at-risk",
  "housing-stability-at-risk",
  "rent-payment-pressure-begins"
].forEach(function (id) {
  const candidate = getCandidate(housingResult, id);
  assert.equal(candidate.safeToRender, true, `${id} should activate from supported housing-risk evidence.`);
  assert.equal(candidate.status, "safe-now", `${id} should become safe-now from housing-risk evidence.`);
  assert.ok(ids(housingResult.safeRenderableEvents).includes(id), `${id} should be in safeRenderableEvents.`);
});

assert.equal(getCandidate(housingResult, "mortgage-is-paid-off").evidenceLevel, "trace-backed");
assert.equal(getCandidate(housingResult, "housing-payment-pressure-begins").evidenceLevel, "calculated");
assert.equal(getCandidate(housingResult, "housing-payment-at-risk").evidenceLevel, "estimated");
assert.equal(getCandidate(housingResult, "housing-payment-at-risk").storyRole, "emotional");
assert.equal(getCandidate(housingResult, "housing-payment-at-risk").timing.monthOffset, 8);
assert.equal(getCandidate(housingResult, "housing-payment-at-risk").amount.value, 2400);
assert.ok(
  getCandidate(housingResult, "housing-payment-at-risk").sources.some(function (source) {
    return source.sourcePath === "housingRisk.obligations.primary";
  }),
  "Housing-risk source paths should be preserved."
);
assert.ok(ids(housingResult.graphDotCandidates).includes("housing-payment-at-risk"));
assert.ok(housingResult.majorStoryCandidates.every(function (candidate) {
  return candidate.storyRole === "emotional" || candidate.storyRole === "data-gap";
}));
assert.ok(housingResult.graphDotCandidates.every(function (candidate) {
  return candidate.storyRole === "emotional" || candidate.storyRole === "data-gap";
}));
assert.ok(ids(housingResult.majorStoryCandidates).includes("housing-payment-at-risk")
  || ids(housingResult.majorStoryCandidates).includes("housing-stability-at-risk"));
assert.equal(housingResult.majorStoryCandidates[0].id, "death-income-stops");
assert.ok(housingResult.majorStoryCandidates.length <= 6);
assert.ok(housingResult.majorGraphDotCandidates.length <= 6);
assert.ok(housingResult.microGraphDotCandidates.length <= 10);
assert.ok(housingResult.graphDotCandidates.length <= 16);
assert.ok(housingResult.trace.activatedHousingRiskCandidateIds.includes("housing-payment-at-risk"));
assert.ok(housingResult.trace.activatedHousingRiskCandidateIds.includes("rent-payment-pressure-begins"));

["foreclosure", "eviction", "bankruptcy", "credit crisis", "forced sale"].forEach(function (label) {
  assert.equal(
    housingResult.safeRenderableEvents.some(function (candidate) {
      return candidate.displayLabel.toLowerCase().includes(label);
    }),
    false,
    `${label} should not become safe renderable from housing-risk evidence.`
  );
});
assert.ok(
  housingResult.suppressedCandidates.some(function (candidate) {
    return candidate.displayLabel === "Foreclosure Risk Window Opens";
  }),
  "Forbidden housing-risk labels should be suppressed instead of activated."
);
assert.ok(
  housingResult.suppressedCandidates.some(function (candidate) {
    return candidate.evidenceLevel === "insufficient-data";
  }),
  "Insufficient-data housing-risk events should be suppressed."
);

const housingUnknownInput = {
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    }
  },
  housingRisk: {
    riskEvents: [
      makeHousingRiskEvent({
        id: "housing-unknown",
        eventType: "housing-risk-unknown",
        displayLabel: "Housing Risk Unknown",
        monthOffset: 0,
        date: "2036-05-14",
        amount: 1,
        evidenceLevel: "data-gap",
        sourcePath: "housingRisk.warnings.missingPayment",
        warnings: [{ code: "missing-housing-payment", message: "Missing housing payment." }]
      })
    ]
  }
};
const housingUnknownResult = buildIncomeImpactFinancialStorylineCandidates(housingUnknownInput);
const unknownCandidate = getCandidate(housingUnknownResult, "housing-risk-unknown");
assert.equal(unknownCandidate.safeToRender, true);
assert.equal(unknownCandidate.status, "caution");
assert.equal(unknownCandidate.evidenceLevel, "data-gap");
assert.ok(ids(housingUnknownResult.graphDotCandidates).includes("housing-risk-unknown"));
assert.ok(ids(housingUnknownResult.majorStoryCandidates).includes("housing-risk-unknown"));

const housingUnknownWithStrongerResult = buildIncomeImpactFinancialStorylineCandidates({
  scenario: housingUnknownInput.scenario,
  housingRisk: {
    riskEvents: housingUnknownInput.housingRisk.riskEvents.concat([
      makeHousingRiskEvent({
        id: "stronger-housing-risk",
        eventType: "housing-payment-at-risk",
        displayLabel: "Housing Payment At Risk",
        monthOffset: 8,
        amount: 2400,
        evidenceLevel: "estimated",
        sourcePath: "housingRisk.obligations.primary"
      })
    ])
  }
});
assert.equal(getCandidate(housingUnknownWithStrongerResult, "housing-risk-unknown").safeToRender, false);
assert.ok(ids(housingUnknownWithStrongerResult.safeRenderableEvents).includes("housing-payment-at-risk"));
assert.ok(
  housingUnknownWithStrongerResult.warnings.some(function (warning) {
    return warning.code === "housing-risk-event-not-activated";
  }),
  "Suppressed housing-risk events should surface warnings."
);

const selectorInput = cloneJson(richInput);
selectorInput.assetDepletionLedger = cloneJson(ledgerInput.assetDepletionLedger);
selectorInput.housingRisk = cloneJson(housingInput.housingRisk);
const selectorSnapshot = cloneJson(selectorInput);
const selectorResult = buildIncomeImpactFinancialStorylineCandidates(selectorInput);
const selectorResultAgain = buildIncomeImpactFinancialStorylineCandidates(cloneJson(selectorInput));
assert.deepEqual(selectorInput, selectorSnapshot, "Selector policy should not mutate input objects.");
assert.deepEqual(selectorResult, selectorResultAgain, "Selector output should be deterministic across repeated calls.");

const selectorMajorIds = ids(selectorResult.majorStoryCandidates);
const selectorMajorGraphIds = ids(selectorResult.majorGraphDotCandidates);
const selectorMicroGraphIds = ids(selectorResult.microGraphDotCandidates);
const selectorGraphIds = ids(selectorResult.graphDotCandidates);
assert.equal(selectorMajorIds[0], "death-income-stops");
assert.ok(selectorMajorIds.length <= 6);
assert.ok(selectorMajorGraphIds.length <= 6);
assert.ok(selectorMicroGraphIds.length <= 10);
assert.ok(selectorGraphIds.length <= 16);
assert.equal(selectorResult.allCandidates.length, 53);
assert.equal(selectorResult.safeRenderableEvents.length, 23);
assert.equal(selectorResult.majorStoryCandidates.length, 6);
assert.equal(selectorResult.graphDotCandidates.length, 13);
assert.equal(selectorResult.trace.safeRenderableCount, selectorResult.safeRenderableEvents.length);
assert.equal(selectorResult.trace.majorStoryCandidateLimit, 6);
assert.equal(selectorResult.trace.graphDotCandidateLimit, 16);
assert.equal(selectorResult.trace.selectorPolicyVersion, "storyline-selector-v1");
assert.deepEqual(selectorResult.trace.selectedMajorCandidateIds, selectorMajorIds);
assert.deepEqual(selectorResult.trace.selectedMajorGraphDotCandidateIds, selectorMajorGraphIds);
assert.deepEqual(selectorResult.trace.selectedMicroGraphDotCandidateIds, selectorMicroGraphIds);
assert.deepEqual(selectorResult.trace.selectedGraphDotCandidateIds, selectorGraphIds);
assert.deepEqual(selectorGraphIds, selectorMajorGraphIds.concat(selectorMicroGraphIds));
assert.equal(selectorResult.trace.graphDotTierCounts.major, selectorMajorGraphIds.length);
assert.equal(selectorResult.trace.graphDotTierCounts.micro, selectorMicroGraphIds.length);
assert.ok(selectorResult.trace.majorStoryFamilyCounts.trigger >= 1);
assert.ok(Object.keys(selectorResult.trace.selectorSuppressedCountsByReason).length > 0);

assert.ok(selectorMajorGraphIds.every(function (id) {
  return selectorMajorIds.includes(id);
}), "Major graph dots should be selected from major story candidates only.");
assert.ok(selectorMicroGraphIds.every(function (id) {
  return !selectorMajorIds.includes(id);
}), "Micro graph dots should not duplicate major story event IDs.");
assert.ok(selectorResult.majorGraphDotCandidates.every(function (candidate) {
  return candidate.dotTier === "major"
    && candidate.connectedToMajorCard === true
    && candidate.eligibleForConnector === true
    && Number.isInteger(candidate.majorCardIndex);
}), "Major graph dots should carry connector metadata.");
assert.ok(selectorResult.microGraphDotCandidates.every(function (candidate) {
  return candidate.dotTier === "micro"
    && candidate.connectedToMajorCard === false
    && candidate.eligibleForConnector === false
    && candidate.majorCardIndex === null;
}), "Micro graph dots should carry secondary non-connector metadata.");

selectorResult.majorStoryCandidates.concat(selectorResult.graphDotCandidates).forEach(function (candidate) {
  assert.notEqual(candidate.status, "deferred");
  assert.notEqual(candidate.status, "unsupported");
  assert.notEqual(candidate.evidenceLevel, "insufficient-data");
  assert.equal(candidate.safeToRender, true);
});

assert.ok(
  !selectorMajorIds.some(function (id) {
    return [
      "cash-savings-depleted",
      "liquid-investments-depleted",
      "taxable-assets-depleted"
    ].includes(id);
  }),
  "Major selector should not include old liquidity crisis labels after locked trigger replacement."
);
assert.ok(
  selectorMajorIds.some(function (id) {
    return [
      "housing-payment-at-risk",
      "housing-stability-at-risk",
      "education-savings-depleted",
      "education-savings-used-for-living-needs"
    ].includes(id);
  }),
  "Major selector should include a family stability event when available."
);
assert.ok(
  selectorMajorIds.some(function (id) {
    return [
      "retirement-assets-tapped",
      "retirement-assets-depleted"
    ].includes(id);
  }),
  "Major selector should include a long-term sacrifice event when available."
);
assert.ok(
  selectorMajorIds.some(function (id) {
    return [
      "resources-run-out",
      "monthly-support-gap-begins",
      "unfunded-need-accumulates"
    ].includes(id);
  }),
  "Major selector should include a support failure event when available."
);

const selectorMajorFamiliesAfterDeath = selectorResult.majorStoryCandidates.slice(1).map(function (candidate) {
  return candidate.family;
});
["cash-waterfall", "housing-risk", "runway", "gap"].forEach(function (family) {
  assert.ok(
    selectorMajorFamiliesAfterDeath.filter(function (candidateFamily) {
      return candidateFamily === family;
    }).length <= 2,
    `Major selector should not let ${family} dominate when alternatives exist.`
  );
});
assert.ok(!selectorMajorIds.includes("missing-data-limits-timeline"), "Support failure should outrank weaker data gaps.");
assert.ok(selectorMajorIds.includes("housing-payment-at-risk") || selectorMajorIds.includes("housing-stability-at-risk"));
assert.ok(!selectorMajorIds.includes("housing-risk-unknown"), "Proven housing risk should outrank housing-risk-unknown.");
assert.ok(selectorMajorIds.includes("retirement-assets-tapped"), "Retirement Assets Tapped should be selectable as long-term sacrifice.");
removedVisibleEventIds.forEach(function (id) {
  assert.ok(!selectorMajorIds.includes(id), `${id} should not enter selector major stories.`);
  assert.ok(!selectorMajorGraphIds.includes(id), `${id} should not enter selector major graph dots.`);
  assert.ok(!selectorMicroGraphIds.includes(id), `${id} should not enter selector micro graph dots.`);
  assert.ok(!selectorGraphIds.includes(id), `${id} should not enter selector graph dots.`);
});
removedVisibleEventLabels.forEach(function (label) {
  selectorResult.majorStoryCandidates.concat(selectorResult.graphDotCandidates).forEach(function (candidate) {
    assert.notEqual(candidate.displayLabel, label, `${label} should not appear in visible candidates.`);
    assert.notEqual(candidate.cardTitle, label, `${label} should not appear in visible candidates.`);
    assert.notEqual(candidate.graphLabel, label, `${label} should not appear in visible candidates.`);
  });
});
assert.ok(
  selectorResult.suppressedCandidates.some(function (candidate) {
    return candidate.selectionSuppressionReason === "major-card-cap";
  }),
  "Selector should record major card cap suppression."
);
assert.ok(
  selectorGraphIds.length < 16
    || selectorResult.suppressedCandidates.some(function (candidate) {
      return candidate.selectionSuppressionReason === "graph-dot-cap"
        || candidate.selectionSuppressionReason === "micro-graph-dot-cap";
    }),
  "Selector should allow fewer graph dots when approved emotional events do not exceed the cap."
);
assert.ok(
  selectorResult.suppressedCandidates.some(function (candidate) {
    return candidate.selectionSuppressionReason === "duplicate-major-dot";
  }),
  "Selector should suppress major events from the micro-dot pool."
);
assert.ok(
  selectorResult.suppressedCandidates.some(function (candidate) {
    return candidate.selectionSuppressionReason === "data-gap-lower-priority";
  }),
  "Selector should record data-gap lower-priority suppression."
);

const missingGraphTimingResult = buildIncomeImpactFinancialStorylineCandidates({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    }
  },
  housingRisk: {
    riskEvents: [
      makeHousingRiskEvent({
        id: "housing-at-risk-untimed",
        eventType: "housing-payment-at-risk",
        displayLabel: "Housing Payment At Risk",
        amount: 2400,
        evidenceLevel: "estimated",
        sourcePath: "housingRisk.obligations.untimed",
        extra: {
          timing: {
            label: "Payment risk timing label"
          }
        }
      })
    ]
  }
});
assert.ok(ids(missingGraphTimingResult.safeRenderableEvents).includes("housing-payment-at-risk"));
assert.ok(ids(missingGraphTimingResult.majorStoryCandidates).includes("housing-payment-at-risk"));
assert.ok(!ids(missingGraphTimingResult.graphDotCandidates).includes("housing-payment-at-risk"));
assert.ok(
  missingGraphTimingResult.suppressedCandidates.some(function (candidate) {
    return candidate.id === "housing-payment-at-risk"
      && candidate.selectionSuppressionReason === "missing-timing-for-major-dot";
  }),
  "Events missing graph timing should be suppressed from graph dots with a clear reason."
);

const liquidityRankingResult = buildIncomeImpactFinancialStorylineCandidates({
  scenario: {
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    },
    transitionOutlook: {
      transitionNeed90Days: 30000
    }
  },
  assetDepletionLedger: {
    status: "ready",
    orderedBuckets: [
      { bucketId: "cash", family: "cash", availableValue: 12000, firstUsedMonth: 0 },
      { bucketId: "emergency", family: "emergencyFund", availableValue: 18000, firstUsedMonth: 3 },
      { bucketId: "taxable", family: "taxableInvestments", availableValue: 15000, firstUsedMonth: 5 }
    ],
    ledgerMonths: [
      {
        monthIndex: 0,
        monthlyNetUse: 6000,
        startingBuckets: [
          { family: "cash", balance: 12000 },
          { family: "emergencyFund", balance: 18000 },
          { family: "taxableInvestments", balance: 15000 }
        ],
        endingBuckets: [
          { family: "cash", balance: 6000 },
          { family: "emergencyFund", balance: 18000 },
          { family: "taxableInvestments", balance: 15000 }
        ]
      },
      {
        monthIndex: 1,
        monthlyNetUse: 6000,
        startingBuckets: [
          { family: "cash", balance: 6000 },
          { family: "emergencyFund", balance: 18000 },
          { family: "taxableInvestments", balance: 15000 }
        ],
        endingBuckets: [
          { family: "cash", balance: 5000 },
          { family: "emergencyFund", balance: 18000 },
          { family: "taxableInvestments", balance: 15000 }
        ]
      },
      {
        monthIndex: 3,
        monthlyNetUse: 6000,
        startingBuckets: [
          { family: "emergencyFund", balance: 18000 },
          { family: "taxableInvestments", balance: 15000 }
        ],
        endingBuckets: [
          { family: "emergencyFund", balance: 5000 },
          { family: "taxableInvestments", balance: 15000 }
        ]
      },
      {
        monthIndex: 5,
        monthlyNetUse: 6000,
        startingBuckets: [
          { family: "taxableInvestments", balance: 15000 }
        ],
        endingBuckets: [
          { family: "taxableInvestments", balance: 5000 }
        ]
      }
    ],
    bucketEvents: [
      makeLedgerEvent({
        bucketId: "cash",
        eventType: "bucket-tapped",
        family: "cash",
        monthIndex: 0,
        amountAtTap: 12000,
        evidenceLevel: "estimated",
        sourcePath: "canonicalRunwayAssetWaterfall.orderedBuckets.cash"
      }),
      makeLedgerEvent({
        bucketId: "emergency",
        eventType: "bucket-tapped",
        family: "emergencyFund",
        monthIndex: 3,
        amountAtTap: 18000,
        evidenceLevel: "estimated",
        sourcePath: "canonicalRunwayAssetWaterfall.orderedBuckets.emergency"
      }),
      makeLedgerEvent({
        bucketId: "taxable",
        eventType: "bucket-tapped",
        family: "taxableInvestments",
        monthIndex: 5,
        amountAtTap: 15000,
        evidenceLevel: "estimated",
        sourcePath: "canonicalRunwayAssetWaterfall.orderedBuckets.taxable"
      })
    ]
  }
});
const liquidityMajorIds = ids(liquidityRankingResult.majorStoryCandidates);
const liquidityGraphIds = ids(liquidityRankingResult.graphDotCandidates);
assert.ok(ids(liquidityRankingResult.safeRenderableEvents).includes("cash-reserve-depleted"));
assert.ok(liquidityMajorIds.includes("emergency-fund-depleted"));
assert.ok(liquidityGraphIds.includes("emergency-fund-depleted"));
assert.ok(ids(liquidityRankingResult.safeRenderableEvents).includes("taxable-investments-depleted"));
assert.ok(!ids(liquidityRankingResult.safeRenderableEvents).includes("liquid-investments-depleted"));
assert.ok(!ids(liquidityRankingResult.safeRenderableEvents).includes("taxable-assets-depleted"));

const missingResult = buildIncomeImpactFinancialStorylineCandidates({});
assert.ok(missingResult.warnings.some(function (warning) {
  return warning.code === "missing-storyline-scenario";
}));
assert.ok(missingResult.warnings.some(function (warning) {
  return warning.code === "missing-death-event-storyline-input";
}));
assert.ok(!ids(missingResult.safeRenderableEvents).includes("emergency-fund-depleted"));
assert.equal(missingResult.majorStoryCandidates.length, 0);
assert.equal(missingResult.majorGraphDotCandidates.length, 0);
assert.equal(missingResult.microGraphDotCandidates.length, 0);
assert.equal(missingResult.graphDotCandidates.length, 0);

console.log("income-impact-financial-storyline-candidates-check passed");
