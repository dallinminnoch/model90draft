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
  return {
    source,
    buildIncomeImpactTimelineGraphModel: sandbox.LensApp.lensAnalysis.buildIncomeImpactTimelineGraphModel
  };
}

function loadDisplayHarness() {
  const source = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactViewFrameHarness = { renderTimeline };\n})(window);\n"
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
    harness: sandbox.window.__incomeImpactViewFrameHarness
  };
}

function assertApproxEqual(actual, expected, message, epsilon = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message} Expected ${expected}, received ${actual}.`
  );
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

function getPathD(html, dataAttributeName, dataAttributeValue) {
  const pattern = new RegExp(`<path\\b(?=[^>]*${dataAttributeName}="${dataAttributeValue}")[^>]*\\bd="([^"]*)"`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected path for ${dataAttributeName}="${dataAttributeValue}".`);
  return match[1];
}

function getTranslateCoordinates(tag) {
  const match = String(tag || "").match(/transform="translate\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)"/);
  assert.ok(match, "Expected marker transform coordinates.");
  return {
    x: Number(match[1]),
    y: Number(match[2])
  };
}

function getRunwayDepletionMarkerTag(html, scenarioId) {
  const tags = html.match(/<g\b(?=[^>]*data-income-impact-runway-depletion-marker)[^>]*>/g) || [];
  const tag = tags.find(function (candidate) {
    return candidate.includes(`data-income-impact-applied-scenario-id="${scenarioId}"`);
  });
  assert.ok(tag, `Expected depletion marker for ${scenarioId}.`);
  return tag;
}

function getPathPairs(pathD) {
  const numbers = String(pathD || "").match(/-?\d+(?:\.\d+)?/g) || [];
  const pairs = [];
  for (let index = 0; index < numbers.length - 1; index += 2) {
    pairs.push({
      x: Number(numbers[index]),
      y: Number(numbers[index + 1])
    });
  }
  return pairs;
}

function findMatchingPairIndex(pairs, expected, tolerance = 0.01) {
  return pairs.findIndex(function (pair) {
    return Math.abs(pair.x - expected.x) <= tolerance && Math.abs(pair.y - expected.y) <= tolerance;
  });
}

const { source: modelSource, buildIncomeImpactTimelineGraphModel } = loadGraphModel();
const { source: displaySource, harness } = loadDisplayHarness();
assert.equal(typeof buildIncomeImpactTimelineGraphModel, "function");
assert.equal(typeof harness.renderTimeline, "function");
assert.match(modelSource, /buildIncomeImpactGraphViewFrames/);
assert.match(displaySource, /getGraphModelViewFrame/);
assert.match(displaySource, /modelOwnedViewFrameConsumed/);

const scenarioId = "view-frame-selected";
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

assert.equal(graphModel.trace.viewFrameContractEnabled, true);
assert.equal(graphModel.trace.viewFrameOwner, "graph-model");
assert.equal(graphModel.selectedViewFrameMode, "deathLeadUp");
assert.equal(graphModel.activeViewFrame.mode, "deathLeadUp");
assert.ok(graphModel.viewFrames, "Graph model should expose viewFrames.");
assert.ok(graphModel.viewFrames.focused, "Graph model should expose the suggested focused view-frame alias.");
assert.ok(graphModel.viewFrames.postDeathFocus, "Graph model should expose a display-mode keyed focused view frame.");
assert.ok(graphModel.viewFrames.deathLeadUp, "Graph model should expose the death lead-up view frame.");

const focusedFrame = graphModel.viewFrames.postDeathFocus;
const leadUpFrame = graphModel.viewFrames.deathLeadUp;
const selectedRunway = graphModel.series.appliedRunwayScenarios[0];
assert.equal(focusedFrame.mode, "postDeathFocus");
assert.equal(leadUpFrame.mode, "deathLeadUp");
assertApproxEqual(focusedFrame.deathAnchorXRatio, 0, "Focused frame should pin death to the y-axis.");
assertApproxEqual(leadUpFrame.deathAnchorXRatio, 0.125, "Lead-up frame should preserve the stable lead-up death anchor.");
assertApproxEqual(focusedFrame.zeroYRatio, 0.72, "Focused frame should preserve the shared zero y-ratio.");
assertApproxEqual(leadUpFrame.zeroYRatio, 0.72, "Lead-up frame should preserve the shared zero y-ratio.");
assert.ok(focusedFrame.xDomainMonths > 0, "Focused frame should expose an x-domain.");
assert.ok(leadUpFrame.xDomainMonths > 0, "Lead-up frame should expose an x-domain.");
assert.ok(focusedFrame.yDomain.min < 0 && focusedFrame.yDomain.max > 0, "Focused frame should expose a signed y-domain.");
assert.ok(leadUpFrame.yDomain.min < 0 && leadUpFrame.yDomain.max > 0, "Lead-up frame should expose a signed y-domain.");
assert.ok(focusedFrame.xTicks.length >= 2, "Focused frame should expose x ticks.");
assert.ok(focusedFrame.yTicks.length >= 3, "Focused frame should expose y ticks.");
assert.ok(leadUpFrame.xTicks.length >= 2, "Lead-up frame should expose x ticks.");
assert.ok(leadUpFrame.yTicks.length >= 3, "Lead-up frame should expose y ticks.");
assert.equal(focusedFrame.trace.viewFrameOwner, "graph-model");
assert.equal(focusedFrame.trace.postDeathFocusXDomainSource, "selected-scenario-zero-crossing");
assert.equal(leadUpFrame.trace.viewFrameOwner, "graph-model");
assert.equal(leadUpFrame.trace.source, "stable-layout-frame");
assertApproxEqual(
  focusedFrame.anchors.runout.month,
  selectedRunway.depletionPoint.relativeMonthsFromDeath,
  "Focused runout anchor should use the selected runway zero crossing."
);
assertApproxEqual(
  focusedFrame.xDomainMonths,
  selectedRunway.depletionPoint.relativeMonthsFromDeath / focusedFrame.runoutAnchorXRatio,
  "Focused x-domain should place selected runout at the focused runout anchor ratio."
);

const html = harness.renderTimeline({
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

assert.match(html, /data-income-impact-graph-view-mode="postDeathFocus"/);
assert.match(html, /data-income-impact-active-view-frame-mode="postDeathFocus"/);
assert.match(html, /data-income-impact-view-frame-owner="graph-model"/);
assert.match(html, /data-income-impact-layout-frame-death-x-ratio="0"/);
assert.match(html, /data-income-impact-layout-frame-focus-start-y-ratio="0\.12"/);
assert.doesNotMatch(html, /data-income-impact-graph-path="preDeathAssets"/);

const pathD = getPathD(html, "data-income-impact-graph-path", "postDeathResources");
assert.match(pathD, /^M74 72\b/, "Focused view should preserve the existing runway start anchor in the compact graph frame.");
const markerTag = getRunwayDepletionMarkerTag(html, scenarioId);
const markerPosition = getTranslateCoordinates(markerTag);
const zeroPairIndex = findMatchingPairIndex(getPathPairs(pathD), markerPosition);
assert.ok(zeroPairIndex > 0, "Focused rendered path should pass through the selected depletion marker.");
assert.ok(zeroPairIndex < getPathPairs(pathD).length - 1, "Focused rendered path should continue below zero.");

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
assert.match(leadUpHtml, /data-income-impact-view-frame-owner="graph-model"/);
assert.match(leadUpHtml, /data-income-impact-layout-frame-death-x-ratio="0\.125"/);
assert.match(leadUpHtml, /data-income-impact-graph-view-toggle[\s\S]*Focus after death/);

console.log("income-impact-graph-view-frame-contract-check passed");
