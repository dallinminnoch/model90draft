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
