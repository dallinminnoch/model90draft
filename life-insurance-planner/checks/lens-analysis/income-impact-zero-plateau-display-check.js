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
    "\n  window.__incomeImpactZeroPlateauHarness = { renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactZeroPlateauHarness;
}

function makeDepletingScenario() {
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
          date: "2032-04-29",
          monthIndex: 12,
          endingResources: 698000,
          sourcePaths: ["zeroPlateau.points.0"]
        },
        {
          date: "2041-04-29",
          monthIndex: 120,
          endingResources: 112000,
          sourcePaths: ["zeroPlateau.points.1"]
        },
        {
          date: "2046-04-29",
          monthIndex: 180,
          endingResources: -150000,
          accumulatedUnmetNeed: 150000,
          sourcePaths: ["zeroPlateau.points.2"]
        }
      ],
      depletion: {
        depleted: true,
        depletionDate: "2043-04-29",
        monthsCovered: 144
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 572000,
      survivorAvailableTreatedAssets: 468000,
      coverageAdded: 400000,
      resourcesAfterObligations: 768000,
      depletionDate: "2043-04-29",
      monthsCovered: 144,
      accumulatedUnmetNeed: 150000
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

const buildIncomeImpactTimelineGraphModel = loadGraphModel();
const harness = loadDisplayHarness();
const scenario = makeDepletingScenario();
const graphModel = buildIncomeImpactTimelineGraphModel({
  appliedScenarios: [
    {
      scenarioId: "zero-plateau-selected",
      label: "Selected",
      settings: {
        selectedDeathAge: 51,
        selectedDeathDate: scenario.scenario.selectedDeathDate,
        projectionHorizonYears: 40,
        mortgageTreatmentOverride: "followAssumptions",
        lifestyleSliderValue: 0
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
  selectedScenarioId: "zero-plateau-selected",
  options: {
    preserveSignedResources: true,
    currentAgeMode: "death-event-only"
  }
});

const runway = graphModel.series.appliedRunwayScenarios[0];
const zeroAnchorIndex = runway.runwayLinePoints.findIndex(function (point) {
  return point.id === runway.depletionPoint.id;
});
assert.ok(zeroAnchorIndex > 0, "Model runway line should include the explicit zero anchor.");
assert.equal(runway.runwayLinePoints[zeroAnchorIndex].value, 0);
assert.ok(runway.runwayLinePoints[zeroAnchorIndex - 1].value > 0);
assert.ok(runway.runwayLinePoints[zeroAnchorIndex + 1].value < 0);
assert.equal(
  runway.runwayLinePoints.slice(1).some(function (point, index) {
    return point.value === 0 && runway.runwayLinePoints[index].value === 0;
  }),
  false,
  "Model runway line should not contain consecutive zero points for this fixture."
);

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

const mainPath = getPathD(html, "data-income-impact-graph-path", "postDeathResources");
const mainPairs = getPathPairs(mainPath);
const zeroBaseline = getSvgTag(html, "line", "data-income-impact-graph-zero-baseline");
const zeroY = getNumericAttribute(zeroBaseline, "y1");
const mainZeroIndexes = mainPairs
  .map(function (point, index) {
    return Math.abs(point.y - zeroY) <= 0.001 ? index : -1;
  })
  .filter(function (index) {
    return index >= 0;
  });
assert.deepEqual(mainZeroIndexes, [3], "Main runway path should pass through one explicit zero anchor without a zero plateau.");
assert.ok(mainPairs[mainZeroIndexes[0] - 1].y < zeroY, "Main runway path should approach zero from the positive side.");
assert.ok(mainPairs[mainZeroIndexes[0] + 1].y > zeroY, "Main runway path should continue below zero after the anchor.");

const deficitPath = getPathD(html, "data-income-impact-graph-deficit-area", "postDeathDeficitArea--selected");
assert.doesNotMatch(deficitPath, /\bZ\b/, "Deficit area should stay open so the fill closure does not stroke the zero baseline.");
const deficitPairs = getPathPairs(deficitPath);
assert.equal(deficitPairs.at(-1).y, zeroY, "Deficit area should still close visually to the zero baseline for fill.");
assert.equal(
  deficitPairs.slice(1).some(function (point, index) {
    return point.y === zeroY && deficitPairs[index].y === zeroY && point.x !== deficitPairs[index].x;
  }),
  false,
  "Deficit area path should not include an explicit horizontal zero-baseline segment."
);

const markerTag = getRunwayDepletionMarkerTag(html, "zero-plateau-selected");
const markerPosition = getTranslateCoordinates(markerTag);
assert.deepEqual(
  markerPosition,
  mainPairs[mainZeroIndexes[0]],
  "Depletion marker should align with the rendered runway zero anchor."
);

console.log("income-impact-zero-plateau-display-check passed");
