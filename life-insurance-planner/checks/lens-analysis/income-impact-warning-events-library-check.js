#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const libraryPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-impact-warning-events-library.js"
);
const librarySource = fs.readFileSync(libraryPath, "utf8");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadLibrary() {
  const context = {
    console,
    Intl,
    globalThis: null,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(librarySource, context, { filename: libraryPath });
  return context.LensApp.lensAnalysis;
}

function createScenarioInput(overrides = {}) {
  const input = {
    scenarioTimeline: {
      scenario: {
        deathDate: "2030-06-15",
        deathAge: 50
      },
      resourceSeries: {
        points: [
          {
            id: "death-point",
            date: "2030-06-15",
            age: 50,
            relativeMonthIndex: 0,
            displayedBalance: 120000,
            endingBalance: 120000,
            status: "starting",
            sourcePaths: ["financialRunway.netAvailableResources"]
          },
          {
            id: "month-3",
            date: "2030-09-15",
            age: 50.25,
            relativeMonthIndex: 3,
            displayedBalance: 90000,
            endingBalance: 90000,
            status: "available",
            sourcePaths: ["financialRunway.annualShortfall"]
          },
          {
            id: "month-6",
            date: "2030-12-15",
            age: 50.5,
            relativeMonthIndex: 6,
            displayedBalance: 60000,
            endingBalance: 60000,
            status: "available",
            sourcePaths: ["financialRunway.annualShortfall"]
          },
          {
            id: "month-12",
            date: "2031-06-15",
            age: 51,
            relativeMonthIndex: 12,
            displayedBalance: 0,
            endingBalance: 0,
            accumulatedUnmetNeed: 0,
            status: "depleted",
            sourcePaths: ["financialRunway.annualShortfall"]
          }
        ]
      }
    },
    financialRunway: {
      status: "complete",
      existingCoverage: 500000,
      availableAssets: 250000,
      immediateObligations: 80000,
      netAvailableResources: 120000,
      annualShortfall: 120000,
      depletionDate: "2031-06-15"
    },
    timelineEvents: [
      {
        type: "death",
        date: "2030-06-15",
        age: 50,
        sourcePaths: ["selectedDeathAge"]
      },
      {
        type: "incomeStops",
        date: "2030-06-15",
        age: 50,
        amount: 180000,
        sourcePaths: ["incomeBasis.annualIncomeReplacementBase"]
      },
      {
        type: "finalExpensesDue",
        date: "2030-06-15",
        age: 50,
        amount: 20000,
        sourcePaths: ["finalExpenses.totalFinalExpenseNeed"]
      },
      {
        type: "debtObligation",
        date: "2030-06-15",
        age: 50,
        amount: 60000,
        sourcePaths: ["treatedDebtPayoff.needs.debtPayoffAmount"]
      }
    ],
    dataGaps: [],
    warnings: [],
    lensModel: {
      survivorScenario: {
        survivorIncomeStartDelayMonths: 3
      }
    }
  };

  return {
    ...input,
    ...overrides,
    scenarioTimeline: {
      ...input.scenarioTimeline,
      ...(overrides.scenarioTimeline || {})
    },
    financialRunway: {
      ...input.financialRunway,
      ...(overrides.financialRunway || {})
    },
    lensModel: {
      ...input.lensModel,
      ...(overrides.lensModel || {})
    }
  };
}

assert.match(librarySource, /INCOME_IMPACT_WARNING_SEVERITIES/);
assert.match(librarySource, /INCOME_IMPACT_WARNING_EVENT_DEFINITIONS/);
assert.match(librarySource, /evaluateIncomeImpactWarningEvents/);
assert.match(librarySource, /sortIncomeImpactWarningEvents/);
assert.doesNotMatch(librarySource, /runNeedsAnalysis|analysis-methods/);
assert.doesNotMatch(librarySource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]/);
assert.doesNotMatch(librarySource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);
assert.doesNotMatch(librarySource, /eviction|family loses home|kids cannot attend college|financial ruin/i);

const library = loadLibrary();
const {
  INCOME_IMPACT_WARNING_SEVERITIES,
  INCOME_IMPACT_WARNING_EVENT_DEFINITIONS,
  evaluateIncomeImpactWarningEvents,
  sortIncomeImpactWarningEvents
} = library;

assert.deepEqual(JSON.parse(JSON.stringify(INCOME_IMPACT_WARNING_SEVERITIES)), {
  stable: "stable",
  caution: "caution",
  atRisk: "at-risk",
  critical: "critical"
});
assert.equal(typeof evaluateIncomeImpactWarningEvents, "function");
assert.equal(typeof sortIncomeImpactWarningEvents, "function");

const definitionIds = INCOME_IMPACT_WARNING_EVENT_DEFINITIONS.map((definition) => definition.id);
[
  "deathEvent",
  "primaryIncomeStops",
  "existingCoverageAvailable",
  "liquidAssetsAvailable",
  "immediateCashNeed",
  "finalExpensesDue",
  "debtPayoffDue",
  "survivorIncomeDelayed",
  "monthlyBudgetDeficitBegins",
  "resourcesFallBelow50Percent",
  "oneYearOfSupportRemaining",
  "sixMonthsOfSupportRemaining",
  "resourcesDepleted",
  "householdSupportAtRisk",
  "housingPaymentAtRisk",
  "educationWindowOpens",
  "educationFundingAtRisk",
  "dependentSupportGapBegins",
  "emergencyReserveExhausted",
  "partialEstimateOnly",
  "majorDataGap"
].forEach((id) => {
  assert(definitionIds.includes(id), `${id} definition should exist.`);
});

INCOME_IMPACT_WARNING_EVENT_DEFINITIONS.forEach((definition) => {
  assert(definition.id);
  assert(definition.label);
  assert(definition.shortLabel);
  assert(["stable", "caution", "at-risk", "critical"].includes(definition.severity));
  assert(definition.advisorCopy);
  assert(Array.isArray(definition.requiredFacts));
});

const input = createScenarioInput();
const originalInput = cloneJson(input);
const evaluated = evaluateIncomeImpactWarningEvents(input);
assert.deepEqual(input, originalInput, "warning evaluator should not mutate input.");
assert(Array.isArray(evaluated.risks));
assert(Array.isArray(evaluated.stable));
assert(Array.isArray(evaluated.dataGaps));
assert.equal(evaluated.stable.some((event) => event.type === "deathEvent"), true);
assert.equal(evaluated.stable.some((event) => event.type === "existingCoverageAvailable"), true);
assert.equal(evaluated.stable.some((event) => event.type === "liquidAssetsAvailable"), true);
assert.equal(evaluated.risks.some((event) => event.severity === "stable"), false, "stable events should stay out of risks.");

function findEvent(result, type) {
  return result.risks.concat(result.stable).find((event) => event.type === type);
}

assert.equal(findEvent(evaluated, "resourcesDepleted").severity, "critical");
assert.equal(findEvent(evaluated, "sixMonthsOfSupportRemaining").severity, "critical");
assert.equal(findEvent(evaluated, "oneYearOfSupportRemaining").severity, "at-risk");
assert.equal(findEvent(evaluated, "resourcesFallBelow50Percent").severity, "caution");
assert.equal(findEvent(evaluated, "monthlyBudgetDeficitBegins").severity, "at-risk");
assert.equal(findEvent(evaluated, "primaryIncomeStops").severity, "at-risk");
assert.equal(findEvent(evaluated, "immediateCashNeed").severity, "caution");
assert.equal(findEvent(evaluated, "survivorIncomeDelayed").severity, "caution");

const riskSeverities = evaluated.risks.map((event) => event.severity);
const firstCautionIndex = riskSeverities.indexOf("caution");
const firstAtRiskIndex = riskSeverities.indexOf("at-risk");
assert.equal(riskSeverities[0], "critical", "critical risks should sort first.");
assert(firstAtRiskIndex > -1 && firstAtRiskIndex > riskSeverities.lastIndexOf("critical"));
assert(firstCautionIndex > -1 && firstCautionIndex > riskSeverities.lastIndexOf("at-risk"));
assert.equal(evaluated.risks[0].type, "sixMonthsOfSupportRemaining");
assert.equal(evaluated.risks[1].type, "resourcesDepleted");

const partialResult = evaluateIncomeImpactWarningEvents(createScenarioInput({
  financialRunway: {
    status: "partial-estimate"
  },
  dataGaps: [
    {
      code: "missing-existing-coverage",
      label: "Existing coverage is missing.",
      sourcePaths: ["existingCoverage.totalExistingCoverage"]
    }
  ]
}));
assert.equal(findEvent(partialResult, "partialEstimateOnly").severity, "caution");
assert.equal(findEvent(partialResult, "majorDataGap").severity, "at-risk");
assert.equal(partialResult.dataGaps.length, 1);

const noShortfallResult = evaluateIncomeImpactWarningEvents(createScenarioInput({
  financialRunway: {
    status: "no-shortfall",
    annualShortfall: 0,
    depletionDate: null
  },
  scenarioTimeline: {
    scenario: {
      deathDate: "2030-06-15",
      deathAge: 50
    },
    resourceSeries: {
      points: []
    }
  }
}));
assert.equal(noShortfallResult.stable.some((event) => event.type === "noShortfall"), true);
assert.equal(noShortfallResult.risks.some((event) => event.type === "resourcesDepleted"), false);

assert.equal(evaluated.risks.some((event) => event.type === "housingPaymentAtRisk"), false);
assert.equal(evaluated.risks.some((event) => event.type === "educationFundingAtRisk"), false);
assert(evaluated.trace.deferredDefinitions.includes("housingPaymentAtRisk"));
assert(evaluated.trace.deferredDefinitions.includes("educationFundingAtRisk"));

const sorted = sortIncomeImpactWarningEvents([
  { type: "late-caution", severity: "caution", relativeMonthIndex: 20, shortLabel: "Late caution" },
  { type: "late-critical", severity: "critical", relativeMonthIndex: 12, shortLabel: "Late critical" },
  { type: "early-critical", severity: "critical", relativeMonthIndex: 6, shortLabel: "Early critical" },
  { type: "early-at-risk", severity: "at-risk", relativeMonthIndex: 3, shortLabel: "Early at risk" },
  { type: "stable", severity: "stable", relativeMonthIndex: 0, shortLabel: "Stable" }
]);
assert.deepEqual(
  Array.from(sorted.map((event) => event.type)),
  ["early-critical", "late-critical", "early-at-risk", "late-caution", "stable"]
);

console.log("income-impact-warning-events-library-check passed");
