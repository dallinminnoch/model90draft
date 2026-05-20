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

function loadDisplayHarness() {
  const source = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactRunwayEndHarness = { renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactRunwayEndHarness;
}

function getPathD(html, dataAttributeName, dataAttributeValue) {
  const pattern = new RegExp(`<path\\b(?=[^>]*${dataAttributeName}="${dataAttributeValue}")[^>]*\\bd="([^"]*)"`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected path for ${dataAttributeName}="${dataAttributeValue}".`);
  return match[1];
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

const plotRight = 958;
const harness = loadDisplayHarness();
const zeroPoint = {
  id: "runway-end.zero",
  monthIndex: 9,
  relativeMonthsFromDeath: 9,
  phase: "postDeath",
  value: 0,
  xRatio: 0.55,
  yRatio: 0.5
};
const graphModel = {
  status: "complete",
  layoutFrame: {
    mode: "stableRunoutAnchoredFrame",
    plotLeft: 74,
    plotRight,
    plotTop: 36,
    plotBottom: 354,
    deathXRatio: 0.125,
    zeroYRatio: 0.72,
    runoutAnchorXRatio: 0.8,
    xDomainMonths: 18,
    zeroCrossingAnchorMonth: 9,
    yDomain: {
      min: -24000,
      max: 20000,
      signed: true
    }
  },
  axes: {
    y: {
      zeroYRatio: 0.5,
      ticks: []
    },
    x: {
      deathXRatio: 0.125
    }
  },
  phases: {
    deathEvent: {
      xRatio: 0.125
    }
  },
  markers: [],
  trace: {
    selectedScenarioId: "runway-end-selected"
  },
  series: {
    appliedRunwayScenarios: [
      {
        scenarioId: "runway-end-selected",
        label: "Selected",
        selected: true,
        pathId: "postDeathResources",
        pathMode: "linear",
        runwayLinePoints: [
          {
            id: "runway-end.start",
            monthIndex: 0,
            relativeMonthsFromDeath: 0,
            phase: "postDeath",
            value: 16000,
            xRatio: 0.125,
            yRatio: 0.2
          },
          {
            id: "runway-end.mid",
            monthIndex: 6,
            relativeMonthsFromDeath: 6,
            phase: "postDeath",
            value: 8000,
            xRatio: 0.45,
            yRatio: 0.3
          },
          zeroPoint,
          {
            id: "runway-end.onscreen-negative",
            monthIndex: 18,
            relativeMonthsFromDeath: 18,
            phase: "postDeath",
            value: -12000,
            xRatio: 1,
            yRatio: 0.75
          },
          {
            id: "runway-end.offscreen-negative",
            monthIndex: 24,
            relativeMonthsFromDeath: 24,
            phase: "postDeath",
            value: -18000,
            xRatio: 1,
            yRatio: 0.85
          }
        ],
        fundedRunwayPoints: [],
        deficitPoints: [],
        depletionPoint: zeroPoint
      }
    ]
  }
};

const html = harness.renderTimeline({
  status: "complete",
  graphModel,
  scenario: {
    status: "complete",
    timelineFacts: {}
  },
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
  timelineFacts: {}
});

const pathD = getPathD(html, "data-income-impact-graph-path", "postDeathResources");
const pairs = getPathPairs(pathD);
assert.ok(pairs.length >= 5, "Runway path should include the source points.");

const rightEdgeVerticalSegments = pairs.slice(1).filter(function (point, index) {
  const previous = pairs[index];
  return previous.x === plotRight && point.x === plotRight && previous.y !== point.y;
});
assert.equal(
  rightEdgeVerticalSegments.length,
  0,
  "Runway path should not draw a same-x vertical drop at the right edge."
);
assert.equal(pairs.at(-2).x, plotRight, "The final in-view runway point should reach the right edge.");
assert.ok(pairs.at(-1).x > plotRight, "The continuing runway point should project off-canvas instead of clamping to the right edge.");
assert.ok(pairs.at(-1).y > pairs.at(-2).y, "The off-canvas continuation should preserve the downward runway slope.");

console.log("income-impact-runway-end-continuation-display-check passed");
