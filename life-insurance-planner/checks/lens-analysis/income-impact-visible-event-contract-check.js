#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");
const contract = require(path.join(featureRoot, "income-impact-visible-event-contract.js"));
const {
  buildIncomeImpactTimelineStoryAssembly
} = require(path.join(featureRoot, "income-impact-timeline-story-assembly.js"));

const displayPath = path.join(featureRoot, "income-loss-impact-display.js");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeEvent(id, month, title, extra = {}) {
  return Object.assign({
    id,
    sourceEventId: id,
    monthIndex: month,
    relativeMonth: month,
    family: extra.family || "event",
    severity: extra.severity || extra.tone || "caution",
    tone: extra.tone || extra.severity || "caution",
    cardTitle: title,
    displayLabel: title,
    graphLabel: title,
    safeToRender: true,
    evidenceLevel: "calculated",
    priority: month == null ? 999 : month
  }, extra);
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
  vm.runInNewContext(instrumentedSource, sandbox, { filename: displayPath });
  return sandbox.window.__incomeImpactMilestoneDotAdapterHarness;
}

function visibleKeys(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.visibleEventKey).filter(Boolean);
}

function assertUnique(values, message) {
  const unique = new Set(values);
  assert.equal(unique.size, values.length, message);
}

function findById(items, id) {
  return (Array.isArray(items) ? items : []).find((item) => item.id === id || item.sourceEventId === id);
}

function titles(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.title || item.cardTitle || item.displayLabel).filter(Boolean);
}

assert.equal(contract.VERSION, "income-impact-visible-event-contract-v1");
assert.equal(typeof contract.normalizeIncomeImpactVisibleEvent, "function");
assert.equal(typeof contract.applyIncomeImpactVisibleEventContract, "function");
assert.equal(typeof contract.buildIncomeImpactVisibleEventKey, "function");
assert.equal(typeof contract.rankIncomeImpactEventState, "function");

Object.keys(contract.CONCEPTS).forEach((conceptKey) => {
  const concept = contract.CONCEPTS[conceptKey];
  const month = concept.timingScope === "month" ? 6 : null;
  const normalized = contract.normalizeIncomeImpactVisibleEvent(makeEvent(
    concept.sourceId,
    month,
    concept.title,
    {
      family: concept.category,
      severity: concept.tone
    }
  ));
  assert.ok(normalized.visibleEventKey, `${concept.sourceId} should receive a visibleEventKey.`);
  assert.equal(normalized.conceptId, concept.conceptId);
  assert.equal(normalized.mappedCardTitle, concept.title);
  assert.equal(normalized.visibilityRoute, concept.route);
  assert.equal(normalized.trace.visibleEventContractVersion, contract.VERSION);
  assert.equal(normalized.trace.visibleEventKey, normalized.visibleEventKey);
  if (concept.route === contract.VISIBILITY_ROUTES.supporting) {
    assert.equal(normalized.supportingOnly, true, `${concept.sourceId} should be supporting-only.`);
    assert.equal(normalized.mainEligible, false, `${concept.sourceId} should not be main-eligible.`);
  }
  if (concept.route === contract.VISIBILITY_ROUTES.main) {
    assert.equal(normalized.mainEligible, true, `${concept.sourceId} should be main-eligible.`);
  }
});

const cashAndTaxable = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("cash-reserve-nearly-depleted", 2, "Cash Reserve Is Nearly Depleted", {
    family: "cash-waterfall",
    severity: "atRisk"
  }),
  makeEvent("taxable-investments-nearly-depleted", 7, "Taxable Investments Are Nearly Depleted", {
    family: "cash-waterfall",
    severity: "atRisk"
  })
]);
assert.equal(cashAndTaxable.events.length, 2);
assert.ok(findById(cashAndTaxable.events, "cash-reserve-nearly-depleted"));
assert.ok(findById(cashAndTaxable.events, "taxable-investments-nearly-depleted"));
assert.notEqual(
  findById(cashAndTaxable.events, "cash-reserve-nearly-depleted").visibleEventKey,
  findById(cashAndTaxable.events, "taxable-investments-nearly-depleted").visibleEventKey
);
assert.equal(
  findById(cashAndTaxable.events, "taxable-investments-nearly-depleted").mappedCardTitle,
  "Taxable Investments Are Nearly Depleted"
);

const duplicateCash = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("cash-reserve-nearly-depleted", 2, "Cash Reserve Is Nearly Depleted"),
  makeEvent("cash-near-duplicate-source", 2, "Cash Reserve Is Nearly Depleted")
]);
assert.equal(duplicateCash.events.length, 1);
assert.equal(duplicateCash.suppressed[0].reason, "duplicate-visible-event-key");
assert.equal(duplicateCash.trace.duplicateVisibleEventKeySuppressedCount, 1);

const debtDuplicate = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("minimum-debt-payments-continue", 1, "Minimum Debt Payments Continue", {
    trace: {
      activeDebtPaymentCount: 2,
      activeDebtPaymentIds: ["credit-card", "auto-loan"]
    }
  }),
  makeEvent("required-debt-continue-second-layer", 9, "Minimum Debt Payments Continue", {
    trace: {
      activeDebtPaymentCount: 2,
      activeDebtPaymentIds: ["credit-card", "auto-loan"]
    }
  })
]);
assert.equal(debtDuplicate.events.length, 1);
assert.equal(debtDuplicate.events[0].visibleEventKey, "debt:required-payments:household:continue");
assert.equal(debtDuplicate.events[0].supportingOnly, true);
assert.equal(debtDuplicate.events[0].mainEligible, false);
assert.equal(debtDuplicate.suppressed[0].reason, "duplicate-visible-event-key");

const sameMonthEmergency = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("emergency-fund-used", 5, "Emergency Fund Is Used"),
  makeEvent("emergency-fund-depleted", 5, "Emergency Fund Is Depleted")
]);
assert.equal(sameMonthEmergency.events.length, 1);
assert.equal(sameMonthEmergency.events[0].sourceEventId, "emergency-fund-depleted");
assert.equal(sameMonthEmergency.suppressed[0].sourceEventId, "emergency-fund-used");
assert.equal(sameMonthEmergency.suppressed[0].reason, "weaker-visible-bucket-state");

const sequentialCash = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("cash-reserve-nearly-depleted", 3, "Cash Reserve Is Nearly Depleted"),
  makeEvent("cash-reserve-depleted", 5, "Cash Reserve Is Depleted")
]);
assert.equal(sequentialCash.events.length, 2, "Sequential cash near/depleted states may remain before weighting.");

const laterWeakerCash = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("cash-reserve-depleted", 5, "Cash Reserve Is Depleted"),
  makeEvent("cash-reserve-nearly-depleted", 7, "Cash Reserve Is Nearly Depleted")
]);
assert.equal(laterWeakerCash.events.length, 1);
assert.equal(laterWeakerCash.events[0].sourceEventId, "cash-reserve-depleted");
assert.equal(laterWeakerCash.suppressed[0].reason, "weaker-visible-bucket-state");

const sameMonthEducation = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("education-funding-at-risk", 12, "Education Funding Is At Risk"),
  makeEvent("education-savings-depleted", 12, "Education Savings Are Depleted")
]);
assert.equal(sameMonthEducation.events.length, 1);
assert.equal(sameMonthEducation.events[0].sourceEventId, "education-savings-depleted");

const sameMonthRetirement = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("retirement-assets-next-in-line", 18, "Retirement Assets Are Next in Line"),
  makeEvent("retirement-assets-tapped", 18, "Retirement Assets Are Tapped"),
  makeEvent("retirement-assets-depleted", 18, "Retirement Assets Are Depleted")
]);
assert.equal(sameMonthRetirement.events.length, 1);
assert.equal(sameMonthRetirement.events[0].sourceEventId, "retirement-assets-depleted");

const detailOnly = contract.normalizeIncomeImpactVisibleEvent(
  makeEvent("life-insurance-proceeds-applied", 0, "Life Insurance Proceeds Applied")
);
assert.equal(detailOnly.visibilityRoute, "detail");
assert.equal(detailOnly.detailOnly, true);
assert.equal(detailOnly.graphDotEligible, false);
assert.equal(detailOnly.mainEligible, false);

const dataConfidence = contract.normalizeIncomeImpactVisibleEvent(makeEvent(
  "income-details-need-review",
  null,
  "Income Details Need Review",
  {
    family: "data-quality",
    evidenceLevel: "data-gap",
    tone: "unknown",
    severity: "unknown"
  }
));
assert.equal(dataConfidence.visibilityRoute, "detail");
assert.equal(dataConfidence.mainEligible, false);

const forbidden = contract.applyIncomeImpactVisibleEventContract([
  makeEvent("cash-savings-depleted", 4, "Cash Savings Depleted"),
  makeEvent("legacy-monthly-bills", 4, "Monthly Bills Become Unsupported")
]);
assert.equal(forbidden.events.length, 0);
assert.equal(forbidden.trace.forbiddenSuppressedCount, 2);

const assemblyInput = {
  financialStoryline: {
    safeRenderableEvents: [
      makeEvent("cash-reserve-nearly-depleted", 2, "Cash Reserve Is Nearly Depleted", { family: "cash-waterfall", severity: "atRisk" }),
      makeEvent("taxable-investments-nearly-depleted", 7, "Taxable Investments Are Nearly Depleted", { family: "cash-waterfall", severity: "atRisk" }),
      makeEvent("cash-near-duplicate-source", 2, "Cash Reserve Is Nearly Depleted", { family: "cash-waterfall", severity: "atRisk" }),
      makeEvent("minimum-debt-payments-continue", 3, "Minimum Debt Payments Continue", { family: "debt-risk", severity: "caution" }),
      makeEvent("required-debt-continue-second-layer", 9, "Minimum Debt Payments Continue", { family: "debt-risk", severity: "caution" }),
      makeEvent("spending-begins-to-compress", 4, "Spending Begins to Compress", { family: "expense-compression", severity: "caution" }),
      makeEvent("survivor-income-begins", 6, "Survivor Income Begins", { family: "survivor-income", severity: "stable" }),
      makeEvent("coverage-extends-runway", 8, "Coverage Extends the Runway", { family: "coverage", severity: "caution" }),
      makeEvent("life-insurance-proceeds-applied", 0, "Life Insurance Proceeds Applied", { family: "coverage", severity: "stable" }),
      makeEvent("legacy-monthly-bills", 5, "Monthly Bills Become Unsupported", { family: "debt-risk", severity: "critical" }),
      makeEvent("data-confidence-limited", null, "Data Confidence Limited", {
        family: "data-quality",
        evidenceLevel: "data-gap",
        severity: "unknown",
        tone: "unknown"
      })
    ]
  },
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
    supportingGraphDotLimit: 8
  }
};
const assemblySnapshot = cloneJson(assemblyInput);
const assembly = buildIncomeImpactTimelineStoryAssembly(assemblyInput);
assert.deepEqual(assemblyInput, assemblySnapshot, "Visible event assembly should not mutate input.");

assert.equal(titles(assembly.storySteps).filter((title) => title === "Cash Reserve Is Nearly Depleted").length, 1);
assert.equal(titles(assembly.storySteps).filter((title) => title === "Taxable Investments Are Nearly Depleted").length, 1);
assert.ok(assembly.storySteps.some((step) => step.bucketFamily === "cash" && step.eventState === "nearly-depleted"));
assert.ok(assembly.storySteps.some((step) => step.bucketFamily === "taxableInvestments" && step.eventState === "nearly-depleted"));
assertUnique(visibleKeys(assembly.supportingGraphDots), "Supporting graph dots should be unique by visibleEventKey.");
assert.equal(
  assembly.supportingGraphDots.filter((dot) => dot.visibleEventKey === "debt:required-payments:household:continue").length,
  1
);
assert.equal(
  assembly.supportingGraphDots.filter((dot) => dot.visibleEventKey === "compression:expense-compression:household:begins").length,
  1
);
assert.equal(
  assembly.supportingGraphDots.filter((dot) => dot.visibleEventKey === "survivor-income:delayed-income:household:begins:month-6").length,
  1
);
const stepKeys = new Set(visibleKeys(assembly.storySteps));
assembly.supportingGraphDots.forEach((dot) => {
  assert.equal(stepKeys.has(dot.visibleEventKey), false, `${dot.visibleEventKey} should not be both a main step and supporting dot.`);
});
assert.ok(!titles(assembly.storySteps).includes("Monthly Bills Become Unsupported"));
assert.ok(!titles(assembly.storySteps).includes("Life Insurance Proceeds Applied"));
assert.ok(!titles(assembly.storySteps).includes("Data Confidence Limited"));
assert.ok(
  assembly.suppressed.some((item) => item.reason === "duplicate-visible-event-key"),
  "Assembly should surface duplicate visible-event suppression trace."
);
assert.ok(
  assembly.suppressed.some((item) => item.reason === "forbidden-visible-event"),
  "Assembly should surface forbidden visible-event suppression trace."
);

const adapterHarness = loadDisplayHarness();
const adapter = adapterHarness.buildIncomeImpactMilestoneDotRenderCandidates(assembly);
assert.equal(adapter.majorDotCandidates.length, assembly.majorGraphDots.length);
assert.equal(adapter.supportingDotCandidates.length, assembly.supportingGraphDots.length);
assertUnique(visibleKeys(adapter.supportingDotCandidates), "Adapter supporting candidates should preserve clean unique supporting identities.");
adapter.supportingDotCandidates.forEach((candidate) => {
  assert.equal(stepKeys.has(candidate.visibleEventKey), false, `${candidate.visibleEventKey} should not be reintroduced as a main/supporting duplicate by the adapter.`);
});
assert.ok(adapter.majorDotCandidates.every((candidate) => candidate.visibleEventKey));
assert.ok(adapter.supportingDotCandidates.every((candidate) => candidate.visibleEventKey));
assert.equal(adapter.trace.visibleGraphDotSource, "timelineStoryAssembly");

console.log("income-impact-visible-event-contract-check passed");
