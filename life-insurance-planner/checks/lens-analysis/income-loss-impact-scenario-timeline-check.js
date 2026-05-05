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
  "income-loss-impact-timeline-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function loadHelper() {
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
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline;
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-06-15",
      clientDateOfBirthStatus: "valid",
      ...(overrides.profileFacts || {})
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredGrossAnnualIncome: 150000,
      insuredNetAnnualIncome: 90000,
      ...(overrides.incomeBasis || {})
    },
    survivorScenario: {
      survivorNetAnnualIncome: 30000,
      survivorGrossAnnualIncome: 45000,
      survivorIncomeStartDelayMonths: 3,
      ...(overrides.survivorScenario || {})
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 90000,
      monthlyTotalEssentialSupportCost: 7500,
      ...(overrides.ongoingSupport || {})
    },
    existingCoverage: {
      totalExistingCoverage: 500000,
      ...(overrides.existingCoverage || {})
    },
    offsetAssets: {
      totalAvailableOffsetAssetValue: 100000,
      cashSavings: { availableValue: 50000 },
      currentEmergencyFund: { availableValue: 20000 },
      brokerageAccounts: { availableValue: 30000 },
      ...(overrides.offsetAssets || {})
    },
    finalExpenses: {
      totalFinalExpenseNeed: 25000,
      ...(overrides.finalExpenses || {})
    },
    transitionNeeds: {
      totalTransitionNeed: 15000,
      ...(overrides.transitionNeeds || {})
    },
    debtPayoff: {
      totalDebtPayoffNeed: 60000,
      mortgageBalance: 250000,
      creditCardBalance: 10000,
      autoLoanBalance: 5000,
      ...(overrides.debtPayoff || {})
    },
    educationSupport: {
      linkedDependentCount: 1,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2015-09-01"
        }
      ],
      totalEducationFundingNeed: 80000,
      ...(overrides.educationSupport || {})
    },
    ...(overrides.root || {})
  };
}

function getPointById(timeline, id) {
  return timeline.resourceSeries.points.find((point) => point.id === id);
}

assert.match(helperSource, /scenarioTimeline/);
assert.doesNotMatch(helperSource, /runNeedsAnalysis|analysis-methods/);
assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]/);
assert.doesNotMatch(helperSource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);

const calculateIncomeLossImpactTimeline = loadHelper();
const output = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel(),
  valuationDate: "2026-01-01",
  options: {
    scenario: {
      deathAge: 50,
      projectionHorizonYears: 10,
      mortgageTreatmentOverride: "payOffMortgage"
    }
  }
});

const timeline = output.scenarioTimeline;
assert.ok(timeline, "scenarioTimeline should exist.");
assert.equal(timeline.version, 1);
assert.equal(timeline.scenario.deathAge, 50);
assert.equal(timeline.scenario.deathDate, "2030-06-15");
assert.equal(timeline.scenario.source, "selectedDeathAge");
assert.equal(timeline.scenario.status, "resolved");
assert.equal(timeline.scenario.projectionHorizonYears, 10);
assert.equal(timeline.scenario.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(output.financialRunway.immediateObligations, 100000, "mortgage override should not change mortgage math in this pass.");

assert.equal(timeline.axis.startDate, "2025-06-15");
assert.equal(timeline.axis.deathDate, "2030-06-15");
assert.equal(timeline.axis.endDate, "2040-06-15");
assert.equal(timeline.axis.preDeathYears, 5);
assert.equal(timeline.axis.monthlyResolutionMonths, 24);
assert.equal(timeline.axis.postMonth24Resolution, "annual");
assert.equal(timeline.resourceSeries.yAxis, "remainingAvailableResources");

const points = timeline.resourceSeries.points;
assert.ok(points.length > 0, "scenarioTimeline should include resource points.");
const preDeathPoints = points.filter((point) => point.phase === "preDeath");
assert.equal(preDeathPoints.length, 5);
assert.deepStrictEqual(
  Array.from(preDeathPoints.map((point) => point.relativeMonthIndex)),
  [-60, -48, -36, -24, -12]
);
assert(preDeathPoints.every((point) => point.resolution === "baseline"));
assert(preDeathPoints.every((point) => point.endingBalance === 500000));
assert(preDeathPoints.every((point) => point.displayedBalance === 500000));
assert(preDeathPoints.every((point) => point.accumulatedUnmetNeed === 0));

const deathPoint = getPointById(timeline, "death-point");
assert.ok(deathPoint, "death point should exist.");
assert.equal(deathPoint.phase, "death");
assert.equal(deathPoint.resolution, "death");
assert.equal(deathPoint.relativeMonthIndex, 0);
assert.equal(deathPoint.endingBalance, 500000);
assert.equal(deathPoint.displayedBalance, 500000);

const monthlyPoints = points.filter((point) => point.resolution === "monthly");
assert.equal(monthlyPoints.length, 24);
assert.deepStrictEqual(
  Array.from(monthlyPoints.map((point) => point.relativeMonthIndex)),
  Array.from({ length: 24 }, (_value, index) => index + 1)
);

const annualPoints = points.filter((point) => point.resolution === "annual");
assert.equal(annualPoints.length, 8);
assert.deepStrictEqual(
  Array.from(annualPoints.map((point) => point.relativeMonthIndex)),
  [36, 48, 60, 72, 84, 96, 108, 120]
);
assert(points.every((point) => point.displayedBalance == null || point.displayedBalance >= 0));

const depletedPoints = points.filter((point) => point.endingBalance < 0);
assert.ok(depletedPoints.length >= 2, "fixture should deplete inside the scenario horizon.");
assert.ok(
  depletedPoints[depletedPoints.length - 1].accumulatedUnmetNeed > depletedPoints[0].accumulatedUnmetNeed,
  "accumulated unmet need should increase after depletion."
);
assert(depletedPoints.every((point) => point.displayedBalance === 0), "main y-axis balance should be clamped at zero.");

assert.deepStrictEqual(Array.from(Object.keys(timeline.eventLanes)).sort(), [
  "dataQuality",
  "education",
  "housing",
  "income",
  "resources"
]);
assert.ok(timeline.eventLanes.resources.some((event) => event.type === "death"));
assert.ok(timeline.eventLanes.resources.some((event) => event.type === "resourcesDepleted"));
assert.equal(timeline.eventLanes.housing.length, 0);
assert.equal(timeline.eventLanes.education.length, 0);
assert.equal(timeline.eventLanes.income.length, 0);
assert.equal(timeline.eventLanes.dataQuality.length, 0);
assert.ok(Array.isArray(timeline.pivotalEvents.risks));
assert.ok(Array.isArray(timeline.pivotalEvents.stable));
assert.equal(timeline.pivotalEvents.risks.length, 0);
assert.equal(timeline.pivotalEvents.stable.length, 0);
assert.ok(
  timeline.trace.deferred.includes("pivotal-warning-events-library"),
  "warning event library should be explicitly deferred."
);
assert.ok(
  timeline.trace.deferred.includes("mortgage-treatment-override-behavior"),
  "mortgage override behavior should be explicitly deferred."
);

const lowHorizonOutput = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel(),
  valuationDate: "2026-01-01",
  options: {
    scenario: {
      deathAge: 50,
      projectionHorizonYears: 2
    }
  }
});
assert.equal(lowHorizonOutput.scenarioTimeline.scenario.projectionHorizonYears, 5);
assert.equal(lowHorizonOutput.scenarioTimeline.axis.endDate, "2035-06-15");

const highHorizonOutput = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel(),
  valuationDate: "2026-01-01",
  options: {
    scenario: {
      deathAge: 50,
      projectionHorizonYears: 125,
      mortgageTreatmentOverride: "continueMortgagePayments"
    }
  }
});
assert.equal(highHorizonOutput.scenarioTimeline.scenario.projectionHorizonYears, 100);
assert.equal(highHorizonOutput.scenarioTimeline.scenario.mortgageTreatmentOverride, "continueMortgagePayments");

const invalidMortgageOverrideOutput = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel(),
  valuationDate: "2026-01-01",
  options: {
    scenario: {
      deathAge: 50,
      mortgageTreatmentOverride: "unsupportedMode"
    }
  }
});
assert.equal(invalidMortgageOverrideOutput.scenarioTimeline.scenario.mortgageTreatmentOverride, "followAssumptions");

console.log("income-loss-impact-scenario-timeline-check passed");
