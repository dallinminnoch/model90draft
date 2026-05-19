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
    "\n  window.__incomeImpactLineSubpixelHarness = { renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactLineSubpixelHarness;
}

function makeSubpixelScenario() {
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
          date: "2040-09-29",
          monthIndex: 113,
          endingResources: 33500
        },
        {
          date: "2040-10-29",
          monthIndex: 114,
          endingResources: 27000
        },
        {
          date: "2040-11-29",
          monthIndex: 115,
          endingResources: 20500
        },
        {
          date: "2040-12-29",
          monthIndex: 116,
          endingResources: 14000
        },
        {
          date: "2041-01-29",
          monthIndex: 117,
          endingResources: 7500
        },
        {
          date: "2041-02-28",
          monthIndex: 118,
          endingResources: 1000
        },
        {
          date: "2041-03-29",
          monthIndex: 119,
          endingResources: -5500,
          accumulatedUnmetNeed: 5500
        },
        {
          date: "2041-04-29",
          monthIndex: 120,
          endingResources: -12000,
          accumulatedUnmetNeed: 12000
        },
        {
          date: "2046-04-29",
          monthIndex: 180,
          endingResources: -402000,
          accumulatedUnmetNeed: 402000
        }
      ],
      depletion: {
        depleted: true,
        depletionDate: "2041-03-05",
        monthsCovered: 118.15384615384616,
        depletionMonthIndex: 118.15384615384616
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 572000,
      survivorAvailableTreatedAssets: 468000,
      coverageAdded: 400000,
      resourcesAfterObligations: 768000,
      depletionDate: "2041-03-05",
      monthsCovered: 118.15384615384616,
      accumulatedUnmetNeed: 402000
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

function getSvgTag(html, tagName, attributeName) {
  const pattern = new RegExp(`<${tagName}\\b(?=[^>]*${attributeName})[^>]*>`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected <${tagName}> with ${attributeName}.`);
  return match[0];
}

function getNumericAttribute(tag, attributeName) {
  const pattern = new RegExp(`${attributeName}="(-?\\d+(?:\\.\\d+)?)"`);
  const match = String(tag || "").match(pattern);
  assert.ok(match, `Expected ${attributeName} on SVG tag.`);
  return Number(match[1]);
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

function findMatchingPairIndex(pairs, expected, tolerance = 0.01) {
  return pairs.findIndex(function (pair) {
    return Math.abs(pair.x - expected.x) <= tolerance && Math.abs(pair.y - expected.y) <= tolerance;
  });
}

const buildIncomeImpactTimelineGraphModel = loadGraphModel();
const harness = loadDisplayHarness();
const scenario = makeSubpixelScenario();
const scenarioId = "line-subpixel-selected";
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

const runway = graphModel.series.appliedRunwayScenarios[0];
const zeroAnchorIndex = runway.runwayLinePoints.findIndex(function (point) {
  return point.id === runway.depletionPoint.id;
});
assert.ok(zeroAnchorIndex > 0, "Model runway line should include the zero-crossing anchor.");
assert.equal(runway.runwayLinePoints[zeroAnchorIndex - 1].value, 1000);
assert.equal(runway.runwayLinePoints[zeroAnchorIndex].value, 0);
assert.equal(runway.runwayLinePoints[zeroAnchorIndex + 1].value, -5500);

const html = harness.renderTimeline({
  status: "complete",
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

const pathD = getPathD(html, "data-income-impact-graph-path", "postDeathResources");
assert.match(pathD, /\d+\.\d{1,2}/, "Runway path should preserve fractional SVG coordinates.");

const mainPairs = getPathPairs(pathD);
const markerTag = getRunwayDepletionMarkerTag(html, scenarioId);
const markerPosition = getTranslateCoordinates(markerTag);
const zeroPairIndex = findMatchingPairIndex(mainPairs, markerPosition);
assert.ok(zeroPairIndex > 0, "Runway path should pass through the depletion marker zero anchor.");
assert.ok(zeroPairIndex < mainPairs.length - 1, "Runway path should continue after the zero anchor.");

const positiveNearZero = mainPairs[zeroPairIndex - 1];
const zeroAnchor = mainPairs[zeroPairIndex];
const firstNegative = mainPairs[zeroPairIndex + 1];
const zeroBaseline = getSvgTag(html, "line", "data-income-impact-graph-zero-baseline");
const zeroY = getNumericAttribute(zeroBaseline, "y1");

assert.equal(zeroAnchor.y, zeroY, "Zero anchor should stay aligned to the zero baseline.");
assert.notEqual(positiveNearZero.y, zeroAnchor.y, "Near-zero positive point should not round onto the zero anchor.");
assert.notEqual(firstNegative.y, zeroAnchor.y, "First negative point should not round onto the zero anchor.");
assert.ok(positiveNearZero.y < zeroAnchor.y, "Runway path should approach zero from the positive side.");
assert.ok(firstNegative.y > zeroAnchor.y, "Runway path should continue below zero after the anchor.");
assert.ok(
  !Number.isInteger(positiveNearZero.y),
  "Near-zero positive coordinate should retain subpixel y precision."
);
assert.ok(
  !Number.isInteger(firstNegative.y),
  "Below-zero continuation should retain subpixel y precision."
);

console.log("income-impact-line-subpixel-display-check passed");
