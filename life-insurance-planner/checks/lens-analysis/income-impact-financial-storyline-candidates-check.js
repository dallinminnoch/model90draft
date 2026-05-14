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

assert.ok(result.majorStoryCandidates.length <= 6);
assert.ok(result.graphDotCandidates.length <= 10);
assert.equal(result.majorStoryCandidates[0].id, "death-income-stops");

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
assert.deepEqual(waterfallInput, waterfallSnapshot, "Waterfall integration should not mutate input objects.");

[
  "cash-savings-depleted",
  "emergency-fund-depleted",
  "education-savings-used-for-living-needs",
  "education-savings-depleted",
  "retirement-assets-tapped",
  "retirement-assets-depleted",
  "home-equity-becomes-last-resort"
].forEach(function (id) {
  const candidate = getCandidate(waterfallResult, id);
  assert.equal(candidate.safeToRender, true, `${id} should activate from supported resource waterfall evidence.`);
  assert.equal(candidate.status, "safe-now", `${id} should become safe-now from resource waterfall evidence.`);
  assert.ok(ids(waterfallResult.safeRenderableEvents).includes(id), `${id} should be in safeRenderableEvents.`);
});

assert.equal(getCandidate(waterfallResult, "cash-savings-depleted").evidenceLevel, "calculated");
assert.equal(getCandidate(waterfallResult, "emergency-fund-depleted").evidenceLevel, "estimated");
assert.equal(getCandidate(waterfallResult, "education-savings-used-for-living-needs").evidenceLevel, "assumption-backed");
assert.ok(
  getCandidate(waterfallResult, "cash-savings-depleted").sources.some(function (source) {
    return source.sourcePath === "resourceWaterfall.buckets.cash";
  }),
  "Waterfall source paths should be preserved."
);
assert.equal(getCandidate(waterfallResult, "cash-savings-depleted").timing.monthOffset, 1);
assert.equal(getCandidate(waterfallResult, "cash-savings-depleted").amount.value, 12000);

assert.ok(ids(waterfallResult.graphDotCandidates).includes("cash-savings-depleted"));
assert.ok(
  ids(waterfallResult.graphDotCandidates).includes("education-savings-used-for-living-needs")
    || ids(waterfallResult.graphDotCandidates).includes("retirement-assets-tapped")
);
assert.ok(ids(waterfallResult.majorStoryCandidates).includes("cash-savings-depleted"));
assert.ok(
  ids(waterfallResult.majorStoryCandidates).includes("education-savings-used-for-living-needs")
    || ids(waterfallResult.majorStoryCandidates).includes("retirement-assets-tapped")
    || ids(waterfallResult.majorStoryCandidates).includes("home-equity-becomes-last-resort"),
  "Waterfall-backed events should be eligible for major story cards when diversity allows."
);
assert.equal(waterfallResult.majorStoryCandidates[0].id, "death-income-stops");
assert.ok(waterfallResult.majorStoryCandidates.length <= 6);
assert.ok(waterfallResult.graphDotCandidates.length <= 10);
assert.ok(waterfallResult.trace.activatedWaterfallCandidateIds.includes("cash-savings-depleted"));

assert.equal(getCandidate(waterfallResult, "home-equity-depleted").safeToRender, false);
assert.equal(getCandidate(waterfallResult, "home-equity-depleted").status, "deferred");
["foreclosure", "eviction", "credit crisis", "bankruptcy"].forEach(function (label) {
  assert.equal(
    waterfallResult.safeRenderableEvents.some(function (candidate) {
      return candidate.displayLabel.toLowerCase().includes(label);
    }),
    false,
    `${label} should not become safe renderable from resource waterfall.`
  );
});
assert.ok(
  waterfallResult.suppressedCandidates.some(function (candidate) {
    return candidate.displayLabel === "Credit Crisis";
  }),
  "Forbidden waterfall labels should be suppressed instead of activated."
);
assert.ok(
  waterfallResult.suppressedCandidates.some(function (candidate) {
    return candidate.evidenceLevel === "insufficient-data";
  }),
  "Insufficient-data waterfall events should be suppressed."
);
assert.ok(
  !ids(waterfallResult.safeRenderableEvents).includes("housing-payment-at-risk"),
  "Housing-risk events should remain deferred until a housing-risk helper exists."
);
assert.ok(
  waterfallResult.warnings.some(function (warning) {
    return warning.code === "waterfall-event-not-activated";
  }),
  "Suppressed waterfall events should surface warnings."
);

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
assert.equal(getCandidate(housingResult, "housing-payment-at-risk").timing.monthOffset, 8);
assert.equal(getCandidate(housingResult, "housing-payment-at-risk").amount.value, 2400);
assert.ok(
  getCandidate(housingResult, "housing-payment-at-risk").sources.some(function (source) {
    return source.sourcePath === "housingRisk.obligations.primary";
  }),
  "Housing-risk source paths should be preserved."
);
assert.ok(ids(housingResult.graphDotCandidates).includes("housing-payment-at-risk"));
assert.ok(ids(housingResult.majorStoryCandidates).includes("housing-payment-at-risk")
  || ids(housingResult.majorStoryCandidates).includes("housing-stability-at-risk"));
assert.equal(housingResult.majorStoryCandidates[0].id, "death-income-stops");
assert.ok(housingResult.majorStoryCandidates.length <= 6);
assert.ok(housingResult.graphDotCandidates.length <= 10);
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

const missingResult = buildIncomeImpactFinancialStorylineCandidates({});
assert.ok(missingResult.warnings.some(function (warning) {
  return warning.code === "missing-storyline-scenario";
}));
assert.ok(missingResult.warnings.some(function (warning) {
  return warning.code === "missing-death-event-storyline-input";
}));
assert.ok(!ids(missingResult.safeRenderableEvents).includes("emergency-fund-depleted"));
assert.equal(missingResult.majorStoryCandidates.length, 0);
assert.equal(missingResult.graphDotCandidates.length, 0);

console.log("income-impact-financial-storyline-candidates-check passed");
