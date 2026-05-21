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

function loadGraphModel() {
  const source = readRepoFile("app/features/lens-analysis/income-impact-timeline-graph-model.js");
  const sandbox = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, {
    filename: "income-impact-timeline-graph-model.js"
  });
  return sandbox.LensApp.lensAnalysis.buildIncomeImpactTimelineGraphModel;
}

function loadDisplayHarness() {
  const source = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactAnchorProjectionHarness = { renderTimeline };\n})(window);\n"
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
    filename: "income-loss-impact-display.js"
  });
  return {
    source,
    harness: sandbox.window.__incomeImpactAnchorProjectionHarness
  };
}

function makeScenario() {
  return {
    status: "complete",
    scenario: {
      valuationDate: "2026-04-29",
      selectedDeathDate: "2031-04-29",
      selectedDeathAge: 51,
      projectionHorizonMonths: 480
    },
    preDeathSeries: {
      mode: "forward-projection",
      precision: "monthly",
      points: [],
      targetPoint: {
        date: "2031-04-29",
        endingAssets: 572000
      }
    },
    deathEvent: {
      date: "2031-04-29",
      age: 51,
      assetsBeforeDeath: 572000,
      survivorAvailableTreatedAssets: 468000,
      coverageAdded: 400000,
      immediateObligations: 100000,
      resourcesAfterObligations: 768000,
      layer2: {
        resources: {
          totalResourcesBeforeObligations: 868000
        }
      }
    },
    postDeathSeries: {
      points: [
        {
          date: "2031-04-29",
          monthIndex: 0,
          endingResources: 15000
        },
        {
          date: "2031-10-29",
          monthIndex: 6,
          endingResources: 7500
        },
        {
          date: "2032-04-29",
          monthIndex: 12,
          endingResources: 0,
          accumulatedUnmetNeed: 0
        },
        {
          date: "2032-10-29",
          monthIndex: 18,
          endingResources: -5000,
          accumulatedUnmetNeed: 5000
        }
      ],
      depletion: {
        depleted: true,
        depletionDate: "2032-04-29",
        monthsCovered: 12,
        depletionMonthIndex: 12
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 572000,
      survivorAvailableTreatedAssets: 468000,
      coverageAdded: 400000,
      resourcesAfterObligations: 768000,
      depletionDate: "2032-04-29",
      monthsCovered: 12,
      accumulatedUnmetNeed: 5000
    },
    warnings: [],
    dataGaps: []
  };
}

function getTag(html, selectorAttribute) {
  const pattern = new RegExp(`<[^>]+\\b${selectorAttribute}(?:\\s|=|>)[^>]*>`);
  const match = html.match(pattern);
  assert.ok(match, `Expected tag with ${selectorAttribute}.`);
  return match[0];
}

function getAttributeNumber(tag, attributeName) {
  const pattern = new RegExp(`${attributeName}="(-?\\d+(?:\\.\\d+)?)"`);
  const match = String(tag || "").match(pattern);
  assert.ok(match, `Expected ${attributeName} on ${tag}.`);
  return Number(match[1]);
}

function assertApproxEqual(actual, expected, message, epsilon = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message} Expected ${expected}, received ${actual}.`
  );
}

const buildIncomeImpactTimelineGraphModel = loadGraphModel();
const { source: displaySource, harness } = loadDisplayHarness();

assert.equal(typeof buildIncomeImpactTimelineGraphModel, "function");
assert.equal(typeof harness.renderTimeline, "function");
assert.match(displaySource, /function projectGraphPoint\(graphModel, point = \{\}\)/);
assert.match(displaySource, /function projectGraphMonthX\(graphModel, monthIndex\)/);
assert.doesNotMatch(displaySource, /const x = toGraphX\(connector\.xRatio\);\s*const y1 = toGraphY\(connector\.startYRatio\);/);
assert.match(displaySource, /renderDeathEventConversionConnector[\s\S]*projectGraphPoint\(graphModel/);
assert.match(displaySource, /renderGraphMarkers[\s\S]*projectGraphPoint\(graphModel, marker\)/);
assert.match(displaySource, /renderComparisonMarkers[\s\S]*projectGraphPoint\(graphModel, marker\)/);
assert.match(displaySource, /renderAppliedScenarioDepletionMarkers[\s\S]*projectGraphPoint\(graphModel, marker\)/);
assert.match(displaySource, /resolveGraphMonthX[\s\S]*projectGraphMonthX\(graphModel, monthIndex\)/);

const scenarioId = "anchor-projection-selected";
const scenario = makeScenario();
const graphModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId,
      label: "Selected",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: scenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0,
        autoCompressBaselineEnabled: false
      },
      scenario,
      riskEvaluation: {
        events: [],
        stableEvents: [],
        warnings: [],
        dataGaps: []
      }
    }
  ],
  selectedScenarioId: scenarioId,
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});

const leadUpHtml = harness.renderTimeline({
  status: "complete",
  graphViewMode: "deathLeadUp",
  graphModel,
  scenario,
  transitionOutlook: {
    status: "Stable",
    windowMonths: 3
  },
  financialStoryline: {
    majorStoryCandidates: [],
    graphDotCandidates: []
  },
  warnings: [],
  dataGaps: [],
  timelineFacts: scenario.timelineFacts
});

assert.match(leadUpHtml, /data-income-impact-active-view-frame-mode="deathLeadUp"/);
const leadUpDeathAxis = getTag(leadUpHtml, "data-income-impact-graph-death-axis");
const leadUpDeathConversion = getTag(leadUpHtml, "data-income-impact-death-conversion");
const leadUpDeathSpine = getTag(leadUpHtml, "data-income-impact-death-conversion-spine");
assert.match(leadUpDeathConversion, /data-income-impact-death-conversion-projection-owner="active-view-frame"/);
assert.match(leadUpDeathConversion, /data-income-impact-active-view-frame-mode="deathLeadUp"/);
assertApproxEqual(
  getAttributeNumber(leadUpDeathSpine, "x1"),
  getAttributeNumber(leadUpDeathAxis, "x1"),
  "Death conversion connector should align to the active-frame death axis in lead-up mode."
);

const focusedHtml = harness.renderTimeline({
  status: "complete",
  graphViewMode: "postDeathFocus",
  graphModel,
  scenario,
  transitionOutlook: {
    status: "Stable",
    windowMonths: 3
  },
  financialStoryline: {
    majorStoryCandidates: [],
    graphDotCandidates: []
  },
  warnings: [],
  dataGaps: [],
  timelineFacts: scenario.timelineFacts
});

assert.match(focusedHtml, /data-income-impact-active-view-frame-mode="postDeathFocus"/);
const focusedDeathAxis = getTag(focusedHtml, "data-income-impact-graph-death-axis");
const transitionLine = getTag(focusedHtml, "data-income-impact-transition-outlook-annotation-line");
assertApproxEqual(
  getAttributeNumber(transitionLine, "x1"),
  getAttributeNumber(focusedDeathAxis, "x1"),
  "Transition Outlook annotation should start at month 0 through the active focused frame."
);
assert.ok(
  getAttributeNumber(transitionLine, "x2") > getAttributeNumber(transitionLine, "x1"),
  "Transition Outlook annotation should still span forward from month 0 to the transition window endpoint."
);
assert.doesNotMatch(focusedHtml, /data-income-impact-death-conversion(?:\s|>)/);

console.log("income-impact-anchor-projection-check passed");
