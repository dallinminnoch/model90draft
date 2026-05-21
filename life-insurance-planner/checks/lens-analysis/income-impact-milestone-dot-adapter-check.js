#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const displayPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-loss-impact-display.js"
);
const assemblyPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-impact-timeline-story-assembly.js"
);

const {
  buildIncomeImpactTimelineStoryAssembly
} = require(assemblyPath);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDisplayHarness() {
  const source = fs.readFileSync(displayPath, "utf8");
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactMilestoneDotAdapterHarness = { buildIncomeImpactMilestoneDotRenderCandidates };\n})(window);\n"
  );
  const sandbox = {
    console,
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      }
    },
    Intl,
    URL,
    URLSearchParams,
    window: {
      LensApp: {}
    }
  };
  vm.runInNewContext(instrumentedSource, sandbox, {
    filename: displayPath
  });
  return {
    source,
    harness: sandbox.window.__incomeImpactMilestoneDotAdapterHarness
  };
}

function makeEvent(id, month, family, severity, title, extra = {}) {
  return Object.assign({
    id,
    monthIndex: month,
    family,
    severity,
    cardTitle: title,
    graphLabel: title,
    safeToRender: true,
    status: severity === "stable" ? "safe-now" : "caution",
    evidenceLevel: "calculated",
    priority: month == null ? 999 : month
  }, extra);
}

function makeRunoutInput() {
  return {
    financialStoryline: {
      safeRenderableEvents: [
        makeEvent("stable-cash-covered", 1, "liquidity", "stable", "Cash Covered"),
        makeEvent("housing-pressure", 2, "housing", "caution", "Housing Pressure"),
        makeEvent("dependent-care-risk", 3, "dependents", "at-risk", "Dependent Care Risk"),
        makeEvent("education-shift", 4, "education", "caution", "Education Shift"),
        makeEvent("lifestyle-pressure", 5, "lifestyle", "at-risk", "Lifestyle Pressure"),
        makeEvent("retirement-assets-tapped", 6, "retirement", "critical", "Retirement Assets Tapped"),
        makeEvent("support-gap", 7, "support-gap", "critical", "Support Gap"),
        makeEvent("stable-coverage", 8, "coverage", "stable", "Stable Coverage"),
        makeEvent("housing-repeat", 9, "housing", "caution", "Housing Repeat"),
        makeEvent("liquidity-repeat", 10, "liquidity", "stable", "Liquidity Repeat"),
        makeEvent("care-repeat", 11, "care", "at-risk", "Care Repeat")
      ]
    },
    graphModel: {
      series: {
        appliedRunwayScenarios: [
          {
            selected: true,
            depletionPoint: {
              relativeMonthsFromDeath: 18
            }
          }
        ]
      }
    },
    options: {
      supportingGraphDotLimit: 4
    }
  };
}

function makeFundedInput() {
  const input = makeRunoutInput();
  delete input.graphModel;
  input.scenario = {
    postDeathSeries: {
      depletion: {
        depleted: false
      }
    }
  };
  return input;
}

function buildAssembly(input) {
  return cloneJson(buildIncomeImpactTimelineStoryAssembly(input));
}

function adapt(harness, assembly) {
  return cloneJson(harness.buildIncomeImpactMilestoneDotRenderCandidates(assembly));
}

function assertNoMutation(value, action) {
  const before = JSON.stringify(value);
  action();
  assert.equal(JSON.stringify(value), before, "adapter must not mutate assembly input");
}

const { source: displaySource, harness } = loadDisplayHarness();
assert.equal(typeof harness.buildIncomeImpactMilestoneDotRenderCandidates, "function");
assert.match(
  displaySource,
  /function getGraphStorylineEventDots\(timelineResult, graphModel\) \{\s*const candidates = Array\.isArray\(timelineResult\?\.financialStoryline\?\.graphDotCandidates\)/,
  "visible graph-dot source should remain on financialStoryline.graphDotCandidates in this pass"
);
assert.match(
  displaySource,
  /function getGraphStorylineConnectors\(timelineResult, graphModel\) \{\s*const majorStoryCandidates = getFinancialStorylineMajorCandidates\(timelineResult\);/,
  "visible connector source should remain on old major story candidates in this pass"
);

const runoutAssembly = buildAssembly(makeRunoutInput());
assert.equal(runoutAssembly.storySteps.length, 9);
assert.equal(runoutAssembly.storySteps[0].sourceEventId, "death-income-stops");
assert.equal(runoutAssembly.storySteps[8].sourceEventId, "resourcesRunOut");

assertNoMutation(runoutAssembly, function () {
  const adapted = adapt(harness, runoutAssembly);
  assert.equal(adapted.trace.source, "income-impact-milestone-dot-adapter");
  assert.equal(adapted.trace.rendered, false);
  assert.equal(adapted.trace.visibleGraphDotSourceUnchanged, true);
  assert.equal(adapted.majorDotCandidates.length, 8, "Steps 2-8 plus Resources Run Out should get major candidates.");
  assert.equal(adapted.connectorCandidates.length, 8, "Every major candidate should have a connector candidate.");
  assert.equal(
    adapted.majorDotCandidates.some(function (candidate) {
      return candidate.id === "death-income-stops";
    }),
    false,
    "Death step should not create a separate graph-dot candidate."
  );
  const runoutCandidate = adapted.majorDotCandidates.find(function (candidate) {
    return candidate.id === "resources-run-out";
  });
  assert.ok(runoutCandidate, "Resources Run Out final outcome should map to the reusable runout event id.");
  assert.equal(runoutCandidate.dotTier, "major");
  assert.equal(runoutCandidate.connectedToMajorCard, true);
  assert.equal(runoutCandidate.eligibleForConnector, true);
  assert.equal(runoutCandidate.majorCardIndex, 8);
  assert.equal(runoutCandidate.milestoneStepNumber, 9);
  assert.equal(runoutCandidate.timing.monthOffset, 18);
  assert.equal(runoutCandidate.graphLabel, "");
  assert.equal(runoutCandidate.displayLabel, "Resources Run Out");
  assert.equal(runoutCandidate.trace.noDefaultGraphLabel, true);

  const intermediateCandidates = adapted.majorDotCandidates.filter(function (candidate) {
    return candidate.id !== "resources-run-out";
  });
  assert.equal(intermediateCandidates.length, 7);
  intermediateCandidates.forEach(function (candidate) {
    assert.equal(candidate.dotTier, "major");
    assert.equal(candidate.connectedToMajorCard, true);
    assert.equal(candidate.eligibleForConnector, true);
    assert.ok(Number.isFinite(candidate.timing.monthOffset), "major candidates should include graph timing");
    assert.ok(candidate.majorCardIndex >= 1 && candidate.majorCardIndex <= 7, "majorCardIndex should map to the 9-step strip index");
    assert.ok(candidate.sourceMilestoneStepId, "major candidate should retain the step id");
    assert.ok(candidate.sourceAssemblyDotId, "major candidate should retain the assembly dot id");
  });
  assert.ok(
    adapted.majorDotCandidates.some(function (candidate) {
      return candidate.severity === "stable";
    }),
    "stable tone should map to stable severity"
  );
  assert.ok(
    adapted.majorDotCandidates.some(function (candidate) {
      return candidate.severity === "at-risk";
    }),
    "atRisk tone should map to at-risk severity"
  );
  assert.ok(
    adapted.majorDotCandidates.some(function (candidate) {
      return candidate.severity === "critical";
    }),
    "critical tone should map to critical severity"
  );

  assert.equal(adapted.supportingDotCandidates.length <= 4, true);
  adapted.supportingDotCandidates.forEach(function (candidate) {
    assert.equal(candidate.dotTier, "micro");
    assert.equal(candidate.connectedToMajorCard, false);
    assert.equal(candidate.eligibleForConnector, false);
    assert.equal(candidate.majorCardIndex, null);
    assert.equal(candidate.graphLabel, "");
    assert.ok(Number.isFinite(candidate.timing.monthOffset), "supporting candidates should include graph timing");
  });

  adapted.connectorCandidates.forEach(function (connector) {
    const matchingCandidate = adapted.majorDotCandidates.find(function (candidate) {
      return candidate.sourceAssemblyDotId === connector.graphDotId;
    });
    assert.ok(matchingCandidate, "connector should reference an adapted major dot candidate");
    assert.equal(connector.eventId, matchingCandidate.id);
    assert.equal(connector.majorCardIndex, matchingCandidate.majorCardIndex);
    assert.ok(connector.stepId);
    assert.ok(connector.graphDotId);
  });
});

const fundedAssembly = buildAssembly(makeFundedInput());
assert.equal(fundedAssembly.storySteps[8].sourceEventId, "familyRunwayRemainsFunded");
const fundedAdapted = adapt(harness, fundedAssembly);
assert.equal(
  fundedAdapted.majorDotCandidates.some(function (candidate) {
    return candidate.id === "resources-run-out";
  }),
  false,
  "Family Runway Remains Funded should not create a final Resources Run Out dot."
);
assert.equal(fundedAdapted.majorDotCandidates.length, 7);
assert.equal(fundedAdapted.connectorCandidates.length, 7);

console.log("income-impact-milestone-dot-adapter-check passed");
