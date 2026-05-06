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
    "\n  window.__incomeImpactMarkerLaneHarness = { renderIncomeImpact, renderPivotalRiskPanel };\n})(window);\n"
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
  return sandbox.window.__incomeImpactMarkerLaneHarness;
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderIncomeImpact, "function");
assert.equal(typeof harness.renderPivotalRiskPanel, "function");
assert.match(displaySource, /riskEvaluation\.events/);
assert.match(displaySource, /riskEvaluation\.stableEvents/);
assert.doesNotMatch(displaySource, /scenarioTimeline\.pivotalEvents/);
assert.doesNotMatch(displaySource, /renderPivotalMarkerLanes|renderPivotalMarker|data-income-impact-timeline-marker/);
assert.doesNotMatch(componentsSource, /\.income-impact-marker-lanes|\.income-impact-marker-pill|\.income-impact-marker-track/);
assert.doesNotMatch(pageSource, /data-income-impact-timeline-marker-lanes/);

const fixture = {
  selectedDeath: { date: "2030-06-15", age: 50 },
  financialRunway: { status: "complete" },
  riskEvaluation: {
    events: [
      {
        id: "resourcesDepleted",
        ruleId: "survivor-resources-depleted",
        category: "runway",
        title: "Resources depleted",
        severity: "critical",
        summary: "Available resources are projected to reach zero in this scenario."
      },
      {
        id: "monthlyBudgetDeficitBegins",
        ruleId: "accumulated-unmet-need",
        category: "runway",
        title: "Household budget deficit begins",
        severity: "at-risk",
        summary: "Annual household need exceeds survivor income in this scenario."
      }
    ],
    stableEvents: [
      {
        id: "existingCoverage",
        ruleId: "coverage-added-at-death",
        category: "coverage",
        title: "Existing coverage available",
        severity: "stable",
        summary: "Existing coverage is represented in this preview."
      }
    ]
  },
  timelineEvents: [],
  warnings: [],
  dataGaps: []
};

const panelHtml = harness.renderPivotalRiskPanel(fixture);
assert.match(panelHtml, /data-income-impact-risk-panel/);
assert.match(panelHtml, /Resources depleted/);
assert.match(panelHtml, /Household budget deficit begins/);
assert.match(panelHtml, /What is covered/);
assert.doesNotMatch(panelHtml, /data-income-impact-timeline-marker/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });
assert.match(host.innerHTML, /data-income-impact-timeline-paused/);
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-timeline-marker|data-income-impact-marker-lane/);
assert.doesNotMatch(host.innerHTML, /<svg\b|<path\b|<circle\b/);

console.log("income-loss-impact-timeline-marker-lanes-check passed");
