#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactRawEventCopyHarness = { renderPivotalRiskPanel, renderIncomeImpactMilestoneStoryStrip, buildIncomeImpactMilestoneDotRenderCandidates };\n})(window);\n"
  );
  const sandbox = {
    console,
    document: {
      addEventListener() {}
    },
    Intl,
    URL,
    URLSearchParams,
    window: {
      LensApp: {}
    }
  };
  vm.runInNewContext(instrumentedSource, sandbox, {
    filename: "income-loss-impact-display.js"
  });
  return sandbox.window.__incomeImpactRawEventCopyHarness;
}

function visibleTextFromHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const visibleEventContractSource = readRepoFile("app/features/lens-analysis/income-impact-visible-event-contract.js");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderPivotalRiskPanel, "function");
assert.equal(typeof harness.renderIncomeImpactMilestoneStoryStrip, "function");
assert.equal(typeof harness.buildIncomeImpactMilestoneDotRenderCandidates, "function");
assert.match(displaySource, /function getSafeVisibleLabel/);
assert.doesNotMatch(
  displaySource,
  /item\.label\s*\|\|\s*item\.path\s*\|\|\s*"Evidence"/,
  "Risk evidence labels must not fall back to raw source paths."
);
assert.match(
  visibleEventContractSource,
  /\["resources-run-out",\s*"resourcesRunOut",\s*"Resources Run Out"/,
  "resources-run-out should keep an approved client-facing visible event concept."
);

const riskHtml = harness.renderPivotalRiskPanel({
  riskEvaluation: {
    events: [
      {
        id: "resourcesDepleted",
        ruleId: "resources-after-obligations-negative-or-zero",
        category: "resources",
        title: "Resources depleted",
        severity: "critical",
        summary: "Available resources are projected to reach zero in this scenario.",
        evidence: [
          {
            path: "postDeathSeries.depletion",
            value: {
              depleted: true,
              depletionDate: "2038-10-15",
              monthsCovered: 100
            }
          },
          {
            path: "scenario.postDeathSeries.depletion",
            value: "internal trace path"
          }
        ]
      }
    ],
    stableEvents: []
  },
  dataGaps: []
});
const riskVisibleText = visibleTextFromHtml(riskHtml);
assert.match(riskHtml, /data-income-impact-risk-evidence-path="postDeathSeries\.depletion"/);
assert.match(riskHtml, /data-income-impact-risk-evidence-path="scenario\.postDeathSeries\.depletion"/);
assert.doesNotMatch(riskVisibleText, /postDeathSeries\.depletion/);
assert.doesNotMatch(riskVisibleText, /scenario\.postDeathSeries\.depletion/);
assert.match(riskVisibleText, /Scenario evidence/);
assert.match(riskVisibleText, /Depleted: Yes; Depletion Date: 2038-10-15; Months Covered: 100/);

const milestoneHtml = harness.renderIncomeImpactMilestoneStoryStrip({
  timelineStoryAssembly: {
    storySteps: Array.from({ length: 11 }, function (_item, index) {
      if (index === 0) {
        return {
          id: "scenario.postDeathSeries.depletion",
          stepNumber: 1,
          role: "event",
          tone: "critical",
          sourceEventId: "scenario.postDeathSeries.depletion",
          timingLabel: "Year 14.3"
        };
      }
      if (index === 1) {
        return {
          id: "resources-run-out",
          stepNumber: 2,
          role: "finalOutcome",
          tone: "critical",
          sourceEventId: "resources-run-out",
          timingLabel: "Runs out"
        };
      }
      return {
        id: `safe-visible-step-${index + 1}`,
        stepNumber: index + 1,
        role: "event",
        tone: "stable",
        title: `Safe Visible Step ${index + 1}`,
        sourceEventId: `safe-visible-step-${index + 1}`,
        timingLabel: "At death"
      };
    })
  }
});
const milestoneVisibleText = visibleTextFromHtml(milestoneHtml);
assert.doesNotMatch(milestoneVisibleText, /postDeathSeries\.depletion/);
assert.doesNotMatch(milestoneVisibleText, /scenario\.postDeathSeries\.depletion/);
assert.match(milestoneVisibleText, /Milestone/);
assert.match(milestoneVisibleText, /Resources Run Out/);

const dotCandidates = harness.buildIncomeImpactMilestoneDotRenderCandidates({
  storySteps: [],
  supportingGraphDots: [
    {
      id: "scenario.postDeathSeries.depletion",
      sourceEventId: "scenario.postDeathSeries.depletion",
      relativeMonth: 120,
      tone: "critical"
    },
    {
      id: "resources-run-out",
      sourceEventId: "resources-run-out",
      relativeMonth: 144,
      tone: "critical"
    }
  ]
});
assert.equal(dotCandidates.supportingDotCandidates[0].displayLabel, "Supporting event");
assert.equal(dotCandidates.supportingDotCandidates[0].cardTitle, "Supporting event");
assert.equal(dotCandidates.supportingDotCandidates[1].displayLabel, "Resources Run Out");
assert.equal(dotCandidates.supportingDotCandidates[1].cardTitle, "Resources Run Out");

console.log("income-impact-raw-event-copy-fallback-check passed");
