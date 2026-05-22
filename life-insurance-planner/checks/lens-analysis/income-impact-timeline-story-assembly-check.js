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
  "income-impact-timeline-story-assembly.js"
);

const helperSource = fs.readFileSync(helperPath, "utf8");
const helper = require(helperPath);
const {
  buildIncomeImpactTimelineStoryAssembly,
  INCOME_IMPACT_TIMELINE_STORY_ASSEMBLY_VERSION
} = helper;

assert.equal(typeof buildIncomeImpactTimelineStoryAssembly, "function");
assert.equal(INCOME_IMPACT_TIMELINE_STORY_ASSEMBLY_VERSION, "income-impact-timeline-story-assembly-v1");
const repeatCategorySource = helperSource.match(/const HIGH_IMPACT_REPEAT_CATEGORIES = Object\.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(repeatCategorySource, "high-impact repeat categories should remain explicit and reviewable");
assert.doesNotMatch(
  repeatCategorySource[1],
  /["']supportGap["']/,
  "supportGap should not remain a high-impact repeat category before weighting"
);

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
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context;
}

function build(input) {
  return cloneJson(buildIncomeImpactTimelineStoryAssembly(input));
}

function assertNoMutation(input, action) {
  const before = JSON.stringify(input);
  action();
  assert.equal(JSON.stringify(input), before, "story assembly helper must not mutate input objects");
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

function assertHasKeys(object, keys, message) {
  keys.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(object, key), `${message}: missing ${key}`);
  });
}

function assertAssemblyShape(result) {
  assertHasKeys(result, ["storySteps", "majorGraphDots", "supportingGraphDots", "connectors", "suppressed", "trace"], "assembly output");
  result.storySteps.forEach(function (step) {
    assertHasKeys(step, [
      "id",
      "stepNumber",
      "lockedPosition",
      "role",
      "category",
      "tone",
      "title",
      "shortLabel",
      "timingLabel",
      "relativeMonth",
      "graphDotId",
      "sourceEventId",
      "visibleEventKey",
      "cardConceptId",
      "conceptId",
      "storyStage",
      "bucketFamily",
      "bucketId",
      "eventState",
      "stateRank",
      "trace"
    ], `story step ${step.id}`);
  });
  result.majorGraphDots.forEach(function (dot) {
    assertHasKeys(dot, ["id", "connectedStepId", "tone", "relativeMonth", "sourceEventId", "visibleEventKey", "trace"], `major dot ${dot.id}`);
    assert.equal(Object.prototype.hasOwnProperty.call(dot, "label"), false, "Large connected dots should not duplicate graph labels.");
    assert.equal(Object.prototype.hasOwnProperty.call(dot, "title"), false, "Large connected dots should not duplicate card titles.");
  });
  result.supportingGraphDots.forEach(function (dot) {
    assertHasKeys(dot, ["id", "tone", "relativeMonth", "sourceEventId", "visibleEventKey", "trace"], `supporting dot ${dot.id}`);
    assert.equal(Object.prototype.hasOwnProperty.call(dot, "label"), false, "Supporting dots should not show default labels.");
  });
  result.connectors.forEach(function (connector) {
    assertHasKeys(connector, ["id", "stepId", "graphDotId", "trace"], `connector ${connector.id}`);
  });
}

const FORBIDDEN_MAIN_STRIP_TITLES = new Set([
  "Death / Income Stops",
  "Life Insurance Proceeds Applied",
  "Coverage Helps Protect the Plan",
  "Protection Gap Appears Immediately",
  "Existing coverage closes a meaningful gap",
  "Survivor Income Is Not Enough Alone",
  "Survivor Income Helps Offset Need",
  "Monthly Support Gap Begins",
  "Support Gap Begins",
  "Monthly Support Gap Grows",
  "Current Lifestyle Remains Supported",
  "Lifestyle Pressure Begins",
  "Lifestyle Cuts May Be Needed",
  "Lifestyle Cuts Become Necessary",
  "Essential Costs Begin Pressuring the Plan",
  "Survivor Income Supports the Runway",
  "Plan Depends on Survivor Income",
  "Survivor Income Is Not Enough",
  "Income Gap Drives the Shortfall",
  "Coverage Carries the Runway",
  "Coverage Extends the Runway",
  "Coverage Cannot Prevent Resource Depletion",
  "Existing Coverage Cannot Prevent Runout",
  "Life Insurance Proceeds Applied",
  "Coverage Helps Protect the Plan",
  "Existing coverage closes a meaningful gap",
  "Education Savings Are Redirected",
  "Expenses Begin Competing With Debt Payments",
  "Debt Payments Pressure Monthly Expenses",
  "Monthly Bills Become Unsupported",
  "Immediate Obligations Are Paid",
  "Final Expenses Are Paid",
  "Mortgage Is Paid Off",
  "Stable Covered Event",
  "Direct Risk Event",
  "Direct Stable Event",
  "Data quality: code",
  "Coverage Cannot Prevent Resource Depletion"
]);

function assertMainStripLibraryLocked(result) {
  result.storySteps.forEach(function (step) {
    assert.equal(FORBIDDEN_MAIN_STRIP_TITLES.has(step.title), false, `${step.title} should not be a main strip title.`);
    assert.notEqual(step.tone, "unknown", `${step.id} should not use unknown tone in the main strip.`);
  });
}

const browserContext = createBrowserContext();
assert.equal(
  typeof browserContext.LensApp.lensAnalysis.buildIncomeImpactTimelineStoryAssembly,
  "function"
);

const empty = build();
assertAssemblyShape(empty);
assert.equal(empty.storySteps.length, 2);
assert.equal(empty.storySteps[0].title, "Income Stops at Death");
assert.equal(empty.storySteps[0].graphDotId, null);
assert.equal(empty.storySteps[1].title, "Family Runway Remains Funded");
assertMainStripLibraryLocked(empty);
assert.equal(empty.majorGraphDots.length, 0);
assert.equal(empty.connectors.length, 0);
assert.equal(empty.trace.noUiMutation, true);
assert.equal(empty.trace.noGraphMutation, true);

const timedEvents = [
  makeEvent("cash-reserve-holds", 1, "cash-waterfall", "stable", "Cash Reserve Holds"),
  makeEvent("housing-payment-at-risk", 2, "housing-risk", "at-risk", "Housing Payment At Risk"),
  makeEvent("education-funding-redirected", 3, "education-waterfall", "caution", "Education Funding Redirected"),
  makeEvent("debt-payments-pressure", 4, "debt-payment", "at-risk", "Debt Payments Pressure Monthly Expenses"),
  makeEvent("lifestyle-cuts-begin", 5, "lifestyle-risk", "caution", "Lifestyle Cuts Begin"),
  makeEvent("support-gap-begins", 5.5, "gap", "at-risk", "Support Gap Begins"),
  makeEvent("care-expenses-covered", 6, "care-risk", "stable", "Care Expenses Covered"),
  makeEvent("retirement-assets-tapped", 7, "retirement-waterfall", "critical", "Retirement Assets Tapped"),
  makeEvent("cash-savings-depleted", 8, "cash-waterfall", "critical", "Cash Savings Depleted"),
  makeEvent("rent-payment-pressure", 9, "housing-risk", "caution", "Rent Payment Pressure"),
  makeEvent("spending-begins-to-compress", 10, "expense-compression", "caution", "Spending Begins to Compress", {
    trace: { candidateSource: "supporting-dot-trigger", triggerId: "spending-begins-to-compress" }
  }),
  makeEvent("survivor-income-begins", 11, "survivor-income", "stable", "Survivor Income Begins", {
    trace: { candidateSource: "supporting-dot-trigger", triggerId: "survivor-income-begins" }
  }),
  makeEvent("coverage-extends-runway", 12, "coverage", "stable", "Coverage Extends the Runway"),
  makeEvent("coverage-runs-out-before-needs-end", 13, "coverage", "at-risk", "Coverage Runs Out Before Needs End"),
  makeEvent("data-confidence-limited", null, "data-quality", "unknown", "Data Confidence Limited"),
  makeEvent("not-applicable", 10, "vehicle-risk", "caution", "Not Applicable", {
    safeToRender: false
  })
];

const runoutInput = {
  financialStoryline: {
    safeRenderableEvents: timedEvents,
    suppressedCandidates: [
      { id: "suppressed-source", suppressionReason: "lower-priority" }
    ]
  },
  timelineStoryEvents: {
    events: [
      makeEvent("stable-covered-event", 2.5, "cash-waterfall", "stable", "Stable Covered Event")
    ]
  },
  riskEvents: [
    makeEvent("risk-event-direct", 3.5, "housing-risk", "critical", "Direct Risk Event")
  ],
  stableEvents: [
    makeEvent("stable-event-direct", 4.5, "care-risk", "stable", "Direct Stable Event")
  ],
  graphModel: {
    series: {
      appliedRunwayScenarios: [
        {
          selected: true,
          depletionPoint: {
            relativeMonthsFromDeath: 24
          }
        }
      ]
    }
  },
  options: {
    supportingGraphDotLimit: 3
  }
};

assertNoMutation(runoutInput, function () {
  const result = build(runoutInput);
  assertAssemblyShape(result);
  assert.equal(result.storySteps.length, 9);
  assert.equal(result.trace.exactNineStepTargetMet, true);
  assert.equal(result.storySteps[0].stepNumber, 1);
  assert.equal(result.storySteps[0].lockedPosition, "first");
  assert.equal(result.storySteps[0].title, "Income Stops at Death");
  assert.equal(result.storySteps[0].trace.originalSourceTitle, "Death / Income Stops");
  assert.equal(result.storySteps[0].trace.mappedCardTitle, "Income Stops at Death");
  assert.equal(result.storySteps[0].graphDotId, null);
  assertMainStripLibraryLocked(result);

  const finalStep = result.storySteps[8];
  assert.equal(finalStep.stepNumber, 9);
  assert.equal(finalStep.lockedPosition, "final");
  assert.equal(finalStep.title, "Resources Run Out");
  assert.equal(finalStep.trace.finalOutcomeType, "resourcesRunOut");
  assert.ok(finalStep.graphDotId, "Runout final outcome should get a large dot.");
  assert.ok(
    result.majorGraphDots.some(function (dot) {
      return dot.connectedStepId === finalStep.id && dot.sourceEventId === "resourcesRunOut";
    }),
    "Runout final outcome dot should connect to the final step."
  );

  const intermediateSteps = result.storySteps.slice(1, 8);
  assert.deepEqual(
    intermediateSteps.map(function (step) { return step.stepNumber; }),
    [2, 3, 4, 5, 6, 7, 8]
  );
  const intermediateMonths = intermediateSteps.map(function (step) {
    return step.relativeMonth;
  });
  assert.deepEqual(
    intermediateMonths,
    intermediateMonths.slice().sort(function (left, right) { return left - right; }),
    "Steps 2-8 should be ordered by relativeMonth."
  );
  intermediateSteps.forEach(function (step) {
    assert.ok(step.graphDotId, `${step.id} should have a major graph dot.`);
    assert.equal(step.title, step.trace.mappedCardTitle);
    assert.ok(step.trace.originalSourceTitle, `${step.id} should preserve the original source title in trace.`);
    assert.ok(step.trace.cardConcept, `${step.id} should preserve the approved card concept in trace.`);
    assert.ok(
      result.majorGraphDots.some(function (dot) {
        return dot.id === step.graphDotId && dot.connectedStepId === step.id;
      }),
      `${step.id} should have a matching major graph dot.`
    );
    assert.ok(
      result.connectors.some(function (connector) {
        return connector.stepId === step.id && connector.graphDotId === step.graphDotId;
      }),
      `${step.id} should have a connector relationship.`
    );
  });

  assert.ok(
    intermediateSteps.some(function (step) {
      return step.sourceEventId === "education-funding-redirected" && step.title === "Education Funding Is At Risk";
    }),
    "Education savings redirect/tap source events should use the simplified education title."
  );
  assert.ok(
    intermediateSteps.some(function (step) {
      return step.sourceEventId === "debt-payments-pressure" && step.title === "Minimum Debt Payments Compete With Expenses";
    }),
    "Debt pressure events should use the simplified Debt / Required Payments title."
  );

  assert.ok(
    intermediateSteps.some(function (step) { return step.tone === "stable"; }),
    "Stable events should be eligible for main story steps."
  );
  assert.ok(
    intermediateSteps.some(function (step) { return step.tone === "atRisk" || step.tone === "critical"; }),
    "Risky events should be eligible for main story steps."
  );
  assert.equal(
    result.suppressed.some(function (item) {
      return item.sourceEventId === "data-confidence-limited" && item.reason === "data-confidence-main-strip-excluded";
    }),
    true
  );
  assert.equal(
    result.suppressed.some(function (item) {
      return item.sourceEventId === "not-applicable" && item.reason === "non-applicable";
    }),
    true
  );
  assert.equal(result.trace.suppressionCountsByReason["data-confidence-main-strip-excluded"] >= 1, true);
  assert.ok(result.trace.controlledRepeatUsage >= 1);
  assert.equal(result.supportingGraphDots.length <= 3, true);
  assert.equal(
    result.suppressed.some(function (item) {
      return item.sourceEventId === "support-gap-begins" && item.reason === "unapproved-main-card-title";
    }),
    true
  );
  assert.equal(
    result.suppressed.some(function (item) {
      return item.sourceEventId === "lifestyle-cuts-begin" && item.reason === "unapproved-main-card-title";
    }),
    true
  );
  result.supportingGraphDots.forEach(function (dot) {
    assert.equal(
      intermediateSteps.some(function (step) {
        return step.sourceEventId === dot.sourceEventId;
      }),
      false,
      "Supporting dots must exclude events already used as major steps."
    );
  });
  assert.equal(result.trace.inputCounts.financialStorylineSafeRenderable, timedEvents.length);
  assert.equal(result.trace.inputCounts.financialStorylineSuppressed, 1);
  assert.equal(result.trace.finalOutcomeSource, "graphModel.depletionPoint");
  assert.equal(result.trace.majorGraphDotCount, result.majorGraphDots.length);
  assert.equal(result.trace.connectorCount, result.connectors.length);
});

const supportingOnlyResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("spending-begins-to-compress", 1, "expense-compression", "critical", "Spending Begins to Compress", {
        trace: { candidateSource: "supporting-dot-trigger", triggerId: "spending-begins-to-compress" }
      }),
      makeEvent("survivor-income-begins", 2, "survivor-income", "critical", "Survivor Income Begins", {
        trace: { candidateSource: "supporting-dot-trigger", triggerId: "survivor-income-begins" }
      }),
      makeEvent("coverage-extends-runway", 3, "coverage", "stable", "Coverage Extends the Runway")
    ]
  },
  options: {
    supportingGraphDotLimit: 5
  }
});
assertAssemblyShape(supportingOnlyResult);
assertMainStripLibraryLocked(supportingOnlyResult);
assert.equal(
  supportingOnlyResult.storySteps.length,
  2,
  "Supporting-only library concepts should not become main strip steps."
);
assert.deepEqual(
  supportingOnlyResult.supportingGraphDots.map(function (dot) {
    return [dot.sourceEventId, dot.title, dot.tone];
  }),
  [
    ["spending-begins-to-compress", "Spending Begins to Compress", "caution"],
    ["survivor-income-begins", "Survivor Income Begins", "stable"],
    ["coverage-extends-runway", "Coverage Extends the Runway", "caution"]
  ],
  "Simplified supporting concepts should keep approved titles and tones on supporting dots only."
);
assert.equal(
  supportingOnlyResult.suppressed.filter(function (item) {
    return item.reason === "supporting-dot-only";
  }).length,
  3
);

const genericSupportingSourceResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("expense-compression-starts", 1, "expense-compression", "caution", "Auto-Compressed Expenses Begin"),
      makeEvent("survivor-income-delay", 2, "survivor-income", "stable", "Survivor Income Delay")
    ]
  },
  options: {
    supportingGraphDotLimit: 5
  }
});
assert.equal(
  genericSupportingSourceResult.supportingGraphDots.some(function (dot) {
    return dot.title === "Spending Begins to Compress" || dot.title === "Survivor Income Begins";
  }),
  false,
  "Compression and survivor income supporting dots should require explicit source-backed trigger ids."
);

const coverageRunsOutResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("coverage-runs-out-before-needs-end", 4, "coverage", "at-risk", "Coverage Runs Out Before Needs End")
    ]
  }
});
assertAssemblyShape(coverageRunsOutResult);
assertMainStripLibraryLocked(coverageRunsOutResult);
assert.equal(coverageRunsOutResult.storySteps.length, 3);
assert.equal(coverageRunsOutResult.storySteps[1].title, "Coverage Runs Out Before Needs End");
assert.equal(coverageRunsOutResult.storySteps[1].graphDotId, "major-dot-story-step-2-coverage-runs-out-before-needs-end");

const fundedResult = build({
  financialStoryline: {
    safeRenderableEvents: timedEvents.slice(0, 7)
  },
  scenario: {
    postDeathSeries: {
      depletion: {
        depleted: false
      }
    }
  }
});
assertAssemblyShape(fundedResult);
assertMainStripLibraryLocked(fundedResult);
const fundedFinalStep = fundedResult.storySteps[fundedResult.storySteps.length - 1];
assert.equal(fundedFinalStep.title, "Family Runway Remains Funded");
assert.equal(fundedFinalStep.graphDotId, null);
assert.equal(
  fundedResult.majorGraphDots.some(function (dot) {
    return dot.connectedStepId === fundedFinalStep.id;
  }),
  false,
  "Funded final outcome should not require a dot in V1."
);

const scenarioRunout = build({
  financialStoryline: {
    safeRenderableEvents: timedEvents
  },
  scenario: {
    postDeathSeries: {
      depletion: {
        depleted: true,
        monthsCovered: 18
      }
    }
  }
});
assertAssemblyShape(scenarioRunout);
assertMainStripLibraryLocked(scenarioRunout);
assert.equal(scenarioRunout.storySteps[8].title, "Resources Run Out");
assert.equal(scenarioRunout.storySteps[8].relativeMonth, 18);
assert.ok(scenarioRunout.storySteps[8].graphDotId);

const sparseUnapprovedResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("custom-thing", 1, "custom", "caution", "Direct Risk Event"),
      makeEvent("data-quality-code", 2, "data-quality", "unknown", "Data quality: code")
    ]
  }
});
assertAssemblyShape(sparseUnapprovedResult);
assertMainStripLibraryLocked(sparseUnapprovedResult);
assert.equal(
  sparseUnapprovedResult.storySteps.length,
  2,
  "The helper should fail honestly instead of filling main steps with unapproved or forbidden titles."
);
assert.equal(sparseUnapprovedResult.trace.exactNineStepTargetMet, false);
assert.equal(
  sparseUnapprovedResult.suppressed.some(function (item) {
    return item.sourceEventId === "custom-thing" && item.reason === "unapproved-main-card-title";
  }),
  true
);
assert.equal(
  sparseUnapprovedResult.suppressed.some(function (item) {
    return item.sourceEventId === "data-quality-code" && item.reason === "data-confidence-main-strip-excluded";
  }),
  true
);

function liquidityIdentity(sourceEventId, bucketFamily, bucketId, eventState, month, conceptId) {
  return {
    visibleEventKey: `liquidity:${bucketFamily}:${bucketId}:${eventState}:month-${month}`,
    cardConceptId: conceptId,
    conceptId,
    storyStage: "liquidity",
    bucketFamily,
    bucketId,
    eventState,
    stateRank: eventState === "depleted" ? 3 : eventState === "nearly-depleted" ? 2 : 1,
    trace: {
      visibleEventKey: `liquidity:${bucketFamily}:${bucketId}:${eventState}:month-${month}`,
      cardConceptId: conceptId,
      conceptId,
      storyStage: "liquidity",
      bucketFamily,
      bucketId,
      eventState,
      stateRank: eventState === "depleted" ? 3 : eventState === "nearly-depleted" ? 2 : 1,
      triggerId: sourceEventId
    }
  };
}

const visibleContractResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("cash-reserve-nearly-depleted", 2, "cash-waterfall", "at-risk", "Cash Reserve Is Nearly Depleted", liquidityIdentity(
        "cash-reserve-nearly-depleted",
        "cash",
        "cash-reserve",
        "nearly-depleted",
        2,
        "cashReserve"
      )),
      makeEvent("cash-reserve-depleted", 4, "cash-waterfall", "critical", "Cash Reserve Is Depleted", liquidityIdentity(
        "cash-reserve-depleted",
        "cash",
        "cash-reserve",
        "depleted",
        4,
        "cashReserve"
      )),
      makeEvent("taxable-investments-nearly-depleted", 7, "cash-waterfall", "at-risk", "Taxable Investments Are Nearly Depleted", liquidityIdentity(
        "taxable-investments-nearly-depleted",
        "taxableInvestments",
        "taxable-investments",
        "nearly-depleted",
        7,
        "taxableInvestments"
      )),
      makeEvent("taxable-investments-depleted", 9, "cash-waterfall", "critical", "Taxable Investments Are Depleted", liquidityIdentity(
        "taxable-investments-depleted",
        "taxableInvestments",
        "taxable-investments",
        "depleted",
        9,
        "taxableInvestments"
      ))
    ]
  },
  options: {
    supportingGraphDotLimit: 8
  }
});
assertAssemblyShape(visibleContractResult);
assert.equal(
  visibleContractResult.storySteps.some(function (step) {
    return step.sourceEventId === "taxable-investments-nearly-depleted"
      && step.title === "Taxable Investments Are Nearly Depleted"
      && step.cardConceptId === "taxableInvestments";
  }),
  true,
  "Taxable liquidity events should remain taxable concepts instead of being remapped to cash reserve."
);
assert.equal(
  visibleContractResult.storySteps.filter(function (step) {
    return step.title === "Cash Reserve Is Nearly Depleted";
  }).length,
  1,
  "Cash Reserve Is Nearly Depleted should not appear twice in visible story steps."
);
assert.equal(
  visibleContractResult.storySteps.some(function (step) {
    return step.title === "Taxable Investments Are Nearly Depleted";
  }),
  true,
  "Cash and taxable near-depleted events should coexist as distinct visible bucket families."
);

const duplicateVisibleKeyResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("cash-near-source-a", 2, "cash-waterfall", "at-risk", "Cash Reserve Is Nearly Depleted", liquidityIdentity(
        "cash-near-source-a",
        "cash",
        "cash-reserve",
        "nearly-depleted",
        2,
        "cashReserve"
      )),
      makeEvent("cash-near-source-b", 2, "liquidity", "at-risk", "Cash Reserve Is Nearly Depleted", liquidityIdentity(
        "cash-near-source-b",
        "cash",
        "cash-reserve",
        "nearly-depleted",
        2,
        "cashReserve"
      )),
      makeEvent("cash-near-supporting-copy", 2, "liquidity", "at-risk", "Cash Reserve Is Nearly Depleted", Object.assign(
        liquidityIdentity("cash-near-supporting-copy", "cash", "cash-reserve", "nearly-depleted", 2, "cashReserve"),
        {
          supportingDotOnly: true,
          eligibleForMajorCard: false,
          supportingDotEligible: true,
          eligibleForGraphDot: true
        }
      ))
    ]
  },
  options: {
    supportingGraphDotLimit: 8
  }
});
assert.equal(
  duplicateVisibleKeyResult.storySteps.filter(function (step) {
    return step.visibleEventKey === "liquidity:cash:cash-reserve:nearly-depleted:month-2";
  }).length,
  1,
  "Duplicate visible keys with different source ids should collapse to one main visible event."
);
assert.equal(
  duplicateVisibleKeyResult.supportingGraphDots.some(function (dot) {
    return dot.visibleEventKey === "liquidity:cash:cash-reserve:nearly-depleted:month-2";
  }),
  false,
  "A supporting dot should not duplicate a visible event key already used by the main strip."
);
assert.equal(
  duplicateVisibleKeyResult.suppressed.filter(function (item) {
    return item.reason === "duplicate-visible-event-key";
  }).length >= 1,
  true,
  "Duplicate visible event key suppression should be traceable."
);

const distinctBucketResult = build({
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("cash-near", 2, "cash-waterfall", "at-risk", "Cash Reserve Is Nearly Depleted", liquidityIdentity(
        "cash-near",
        "cash",
        "cash-reserve",
        "nearly-depleted",
        2,
        "cashReserve"
      )),
      makeEvent("emergency-near", 2, "cash-waterfall", "at-risk", "Emergency Fund Is Nearly Depleted", liquidityIdentity(
        "emergency-near",
        "emergencyFund",
        "emergency-fund",
        "nearly-depleted",
        2,
        "emergencyFund"
      ))
    ]
  }
});
assert.equal(
  distinctBucketResult.storySteps.some(function (step) {
    return step.title === "Cash Reserve Is Nearly Depleted";
  }) && distinctBucketResult.storySteps.some(function (step) {
    return step.title === "Emergency Fund Is Nearly Depleted";
  }),
  true,
  "Distinct bucket families with similar states should not collapse."
);

console.log("income-impact-timeline-story-assembly-check passed");
