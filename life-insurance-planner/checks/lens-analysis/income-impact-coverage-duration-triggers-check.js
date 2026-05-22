#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const financial = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
));
const assembly = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-timeline-story-assembly.js"
));

const { buildIncomeImpactFinancialStorylineCandidates } = financial;
const { buildIncomeImpactTimelineStoryAssembly } = assembly;

const FORBIDDEN_COVERAGE_TITLES = [
  "Life Insurance Proceeds Applied",
  "Coverage Helps Protect the Plan",
  "Existing Coverage Cannot Prevent Runout",
  "Coverage Cannot Prevent Resource Depletion",
  "Existing coverage closes a meaningful gap"
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ids(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return item.id;
  });
}

function titles(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return item.title || item.cardTitle || item.displayLabel;
  });
}

function getCandidate(result, id) {
  return result.safeRenderableEvents.find(function (candidate) {
    return candidate.id === id;
  });
}

function makeScenario(options) {
  const safeOptions = options || {};
  const coverageAmount = safeOptions.coverageAmount;
  const input = {
    scenario: {
      scenario: {
        selectedDeathDate: "2036-05-14"
      },
      deathEvent: {
        date: "2036-05-14",
        layer2: {}
      },
      timelineFacts: {},
      postDeathSeries: {
        points: safeOptions.points || [],
        depletion: safeOptions.depletion || {
          depleted: false,
          depletionMonthIndex: null,
          monthsCovered: safeOptions.projectionHorizonMonths || 60
        }
      }
    },
    financialRunway: coverageAmount == null
      ? {}
      : {
        existingCoverage: coverageAmount
      }
  };
  if (safeOptions.projectionHorizonMonths != null) {
    input.scenario.scenario.projectionHorizonMonths = safeOptions.projectionHorizonMonths;
  }
  if (coverageAmount != null) {
    input.scenario.deathEvent.coverageAdded = coverageAmount;
    input.scenario.deathEvent.layer2.existingCoverage = {
      treatedCoverageAmount: coverageAmount
    };
    input.scenario.timelineFacts.coverageAdded = coverageAmount;
  }
  return input;
}

function buildFinancial(input) {
  const before = cloneJson(input);
  const result = buildIncomeImpactFinancialStorylineCandidates(input);
  assert.deepEqual(input, before, "coverage duration helper path must not mutate input");
  return result;
}

function assertSupportingOnly(result, candidateId, title) {
  const candidate = getCandidate(result, candidateId);
  assert.ok(candidate, `${candidateId} should be safe-renderable`);
  assert.equal(candidate.displayLabel, title);
  assert.equal(candidate.candidateSource, "coverage-duration-trigger");
  assert.equal(candidate.supportingDotOnly, true);
  assert.equal(candidate.supportingDotEligible, true);
  assert.equal(candidate.eligibleForMajorCard, false);
  assert.equal(ids(result.majorStoryCandidates).includes(candidateId), false);

  const story = buildIncomeImpactTimelineStoryAssembly({
    financialStoryline: result,
    options: {
      supportingGraphDotLimit: 8
    }
  });
  assert.equal(
    titles(story.storySteps).includes(title),
    false,
    `${title} must not enter the main 9-step strip in this pass`
  );
  assert.ok(
    story.supportingGraphDots.some(function (dot) {
      return dot.sourceEventId === candidateId && dot.title === title;
    }),
    `${title} should remain available as a supporting dot/detail concept`
  );
}

const proceedsOnly = buildFinancial(makeScenario({
  coverageAmount: 100000
}));
assert.ok(ids(proceedsOnly.safeRenderableEvents).includes("life-insurance-proceeds-applied"));
assert.equal(ids(proceedsOnly.graphDotCandidates).includes("life-insurance-proceeds-applied"), false);
assert.equal(ids(proceedsOnly.majorStoryCandidates).includes("life-insurance-proceeds-applied"), false);
assert.deepEqual(proceedsOnly.trace.coverageDurationTriggerCandidateIds, []);
assert.equal(proceedsOnly.trace.coverageDurationTriggerTrace.reason, "missing-runway-comparison-source");

const extendsRunway = buildFinancial(makeScenario({
  coverageAmount: 100000,
  projectionHorizonMonths: 36,
  points: [
    { monthIndex: 0, remainingResources: 120000 },
    { monthIndex: 12, remainingResources: 60000 },
    { monthIndex: 36, remainingResources: 20000 }
  ],
  depletion: {
    depleted: false,
    depletionMonthIndex: null,
    monthsCovered: 36
  }
}));
assertSupportingOnly(extendsRunway, "coverage-extends-runway", "Coverage Extends the Runway");
const extendsCandidate = getCandidate(extendsRunway, "coverage-extends-runway");
assert.equal(extendsCandidate.timing.monthOffset, 4);
assert.equal(extendsCandidate.trace.noCoverageRunoutMonth, 4);
assert.equal(extendsCandidate.trace.withCoverageRunoutMonth, null);
assert.equal(extendsCandidate.trace.modeledHorizonMonth, 36);
assert.equal(extendsCandidate.trace.extensionMonths, 32);
assert.equal(extendsCandidate.trace.mechanicalProceedsRemainDetailOnly, true);
assert.equal(extendsCandidate.trace.aggregateRunwayPreserved, true);

const runsOutBeforeNeedsEnd = buildFinancial(makeScenario({
  coverageAmount: 100000,
  projectionHorizonMonths: 36,
  points: [
    { monthIndex: 0, remainingResources: 150000 },
    { monthIndex: 18, remainingResources: 0 }
  ],
  depletion: {
    depleted: true,
    depletionMonthIndex: 18,
    monthsCovered: 18
  }
}));
assertSupportingOnly(runsOutBeforeNeedsEnd, "coverage-runs-out-before-needs-end", "Coverage Runs Out Before Needs End");
const runsOutCandidate = getCandidate(runsOutBeforeNeedsEnd, "coverage-runs-out-before-needs-end");
assert.equal(runsOutCandidate.timing.monthOffset, 18);
assert.equal(runsOutCandidate.trace.withCoverageRunoutMonth, 18);
assert.equal(runsOutCandidate.trace.modeledHorizonMonth, 36);
assert.equal(runsOutCandidate.trace.fundedThroughHorizon, false);

const fundedThroughHorizon = buildFinancial(makeScenario({
  coverageAmount: 100000,
  projectionHorizonMonths: 36,
  points: [
    { monthIndex: 0, remainingResources: 150000 },
    { monthIndex: 36, remainingResources: 50000 }
  ],
  depletion: {
    depleted: false,
    depletionMonthIndex: null,
    monthsCovered: 36
  }
}));
assert.equal(ids(fundedThroughHorizon.safeRenderableEvents).includes("coverage-runs-out-before-needs-end"), false);

const noExtension = buildFinancial(makeScenario({
  coverageAmount: 100000,
  projectionHorizonMonths: 36,
  points: [
    { monthIndex: 0, remainingResources: 350000 },
    { monthIndex: 36, remainingResources: 250000 }
  ],
  depletion: {
    depleted: false,
    depletionMonthIndex: null,
    monthsCovered: 36
  }
}));
assert.equal(ids(noExtension.safeRenderableEvents).includes("coverage-extends-runway"), false);
assert.equal(noExtension.trace.coverageDurationTriggerTrace.status, "no-trigger");

const missingCoverage = buildFinancial(makeScenario({
  projectionHorizonMonths: 36,
  points: [
    { monthIndex: 0, remainingResources: 100000 },
    { monthIndex: 12, remainingResources: 0 }
  ],
  depletion: {
    depleted: true,
    depletionMonthIndex: 12,
    monthsCovered: 12
  }
}));
assert.deepEqual(missingCoverage.trace.coverageDurationTriggerCandidateIds, []);
assert.equal(missingCoverage.trace.coverageDurationTriggerTrace.reason, "missing-coverage-source");

[
  extendsRunway,
  runsOutBeforeNeedsEnd,
  fundedThroughHorizon,
  proceedsOnly
].forEach(function (result) {
  const mainTitles = titles(result.majorStoryCandidates);
  const graphTitles = titles(result.graphDotCandidates);
  FORBIDDEN_COVERAGE_TITLES.forEach(function (title) {
    assert.equal(mainTitles.includes(title), false, `${title} must not be a main story trigger title`);
    assert.equal(graphTitles.includes(title), false, `${title} must not be a graph story trigger title`);
  });
});

console.log("income-impact-coverage-duration-triggers-check passed");
