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
  "income-impact-timeline-story-events.js"
);

const helper = require(helperPath);

const {
  normalizeIncomeImpactTimelineStoryEvents,
  INCOME_IMPACT_TIMELINE_STORY_EVENTS_VERSION
} = helper;

assert.equal(typeof normalizeIncomeImpactTimelineStoryEvents, "function");
assert.equal(INCOME_IMPACT_TIMELINE_STORY_EVENTS_VERSION, "income-impact-timeline-story-events-v1");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createBrowserContext() {
  const context = {
    console,
    window: null,
    LensApp: { lensAnalysis: {} }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(helperPath, "utf8"), context, { filename: helperPath });
  return context;
}

function normalize(input) {
  return cloneJson(normalizeIncomeImpactTimelineStoryEvents(input));
}

function assertNoMutation(input, action) {
  const before = JSON.stringify(input);
  action();
  assert.equal(JSON.stringify(input), before, "normalizer must not mutate original timeline inputs");
}

function eventById(result, id) {
  return result.events.find(function (event) {
    return event.id === id;
  });
}

const browserContext = createBrowserContext();
assert.equal(
  typeof browserContext.LensApp.lensAnalysis.normalizeIncomeImpactTimelineStoryEvents,
  "function"
);

const empty = normalize();
assert.deepEqual(empty.events, []);
assert.deepEqual(empty.warnings, []);
assert.equal(empty.trace.displayOnly, true);
assert.equal(empty.trace.noGraphMutation, true);
assert.equal(empty.trace.noUiMutation, true);

const severityInput = {
  riskEvents: [
    { id: "risk-caution", severity: "caution", monthIndex: 8, graphLabel: "Cash Risk" },
    { id: "risk-at-risk", severity: "at-risk", monthIndex: 6, graphLabel: "Runway Risk" },
    { id: "risk-critical", severity: "critical", monthIndex: 10, graphLabel: "Critical" }
  ],
  stableEvents: [
    { id: "stable-covered", severity: "caution", monthIndex: 1, graphLabel: "Covered" }
  ]
};
const severityResult = normalize(severityInput);
assert.deepEqual(
  severityResult.events.map(function (event) { return event.id; }),
  ["risk-critical", "risk-at-risk", "risk-caution", "stable-covered"]
);
assert.equal(eventById(severityResult, "risk-at-risk").severity, "atRisk");
assert.equal(eventById(severityResult, "stable-covered").severity, "stable");
assert.equal(eventById(severityResult, "stable-covered").isStable, true);
assert.equal(eventById(severityResult, "stable-covered").surface, "covered");

const transitionCases = [
  ["Stable", "stable"],
  ["Caution", "caution"],
  ["At Risk", "atRisk"],
  ["Likely Failure", "critical"]
];
transitionCases.forEach(function ([status, severity]) {
  const result = normalize({ transitionOutlook: { status, windowMonths: 3 } });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, "transition-outlook");
  assert.equal(result.events[0].severity, severity);
  assert.equal(result.events[0].surface, "resourceOutlook");
  assert.equal(result.events[0].shortLabel, "First 3 Months");
  assert.equal(result.events[0].title, "First 3 Months: " + status);
});

const unavailable = normalize({ transitionOutlook: { status: "insufficientData" } });
assert.equal(eventById(unavailable, "transition-outlook").severity, "unknown");
assert.equal(
  unavailable.warnings.some(function (warning) {
    return warning.code === "transition-outlook-status-unknown";
  }),
  true
);

const financialStoryline = {
  majorStoryCandidates: [
    {
      id: "resources-run-out",
      severity: "critical",
      monthIndex: 18,
      graphLabel: "Runout",
      cardTitle: "Resources Run Out",
      description: "The timeline reaches the point where available resources are depleted."
    },
    {
      id: "dependent-support-gap",
      severity: "atRisk",
      monthIndex: 2,
      graphLabel: "Support Gap",
      cardTitle: "Dependent Support Gap",
      description: "A support gap appears in the survivor timeline."
    }
  ],
  graphDotCandidates: [
    {
      id: "resources-run-out",
      severity: "critical",
      monthIndex: 18,
      graphLabel: "Runout"
    },
    {
      id: "cash-savings-depleted",
      status: "safe-now",
      monthIndex: 4,
      graphLabel: "Cash Used",
      cardTitle: "Cash Savings Depleted"
    }
  ]
};
const financialInput = { financialStoryline };
assertNoMutation(financialInput, function () {
  const result = normalize(financialInput);
  assert.deepEqual(
    result.trace.inputSources,
    {
      riskEvents: 0,
      stableEvents: 0,
      financialStorylineMajor: 2,
      financialStorylineGraphDots: 2,
      graphMarkers: 0,
      comparisonMarkers: 0,
      transitionOutlook: false
    }
  );
  assert.equal(result.events.length, 3);
  assert.equal(eventById(result, "resources-run-out").kind, "financialStoryline");
  assert.equal(eventById(result, "resources-run-out").shortLabel, "Runout");
  assert.equal(eventById(result, "resources-run-out").title, "Resources Run Out");
  assert.equal(
    eventById(result, "resources-run-out").detail,
    "The timeline reaches the point where available resources are depleted."
  );
});

const deterministic = normalize({
  riskEvents: [
    { id: "later-critical", severity: "critical", monthIndex: 9, graphLabel: "Later" },
    { id: "earlier-critical", severity: "critical", monthIndex: 3, graphLabel: "Earlier" },
    { id: "undated-critical", severity: "critical", graphLabel: "Undated" },
    { id: "dated-critical", severity: "critical", date: "2031-01-01", graphLabel: "Dated" }
  ]
});
assert.deepEqual(
  deterministic.events.map(function (event) { return event.id; }),
  ["earlier-critical", "later-critical", "dated-critical", "undated-critical"]
);

const copySplit = normalize({
  graphModel: {
    markers: [
      {
        id: "long-marker",
        severity: "caution",
        monthIndex: 7,
        graphLabel: "This label is intentionally too long for a marker",
        title: "Long Marker Title",
        detail: "Long marker details belong in a panel later."
      }
    ]
  }
});
const longMarker = eventById(copySplit, "long-marker");
assert.equal(longMarker.shortLabel.length <= 32, true);
assert.equal(longMarker.title, "Long Marker Title");
assert.equal(longMarker.detail, "Long marker details belong in a panel later.");
assert.equal(longMarker.surface, "graph");

const invalid = normalize({ riskEvents: ["bad"] });
assert.deepEqual(invalid.events, []);
assert.equal(
  invalid.warnings.some(function (warning) {
    return warning.code === "invalid-event-skipped";
  }),
  true
);

console.log("income-impact-timeline-story-events-check passed");
