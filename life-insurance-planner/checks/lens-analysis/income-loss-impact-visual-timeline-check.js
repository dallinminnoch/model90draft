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
    "\n  window.__incomeImpactVisualTimelineHarness = { renderTimeline, renderIncomeImpact, buildFinancialStorylineForTimelineResult, buildTimelineStoryEventsForTimelineResult };\n})(window);\n"
  );
  const resourceOutlookPanel = { innerHTML: "" };
  const sandbox = {
    console,
    document: {
      addEventListener() {},
      querySelector(selector) {
        return selector === "[data-income-impact-insights-panel]" ? resourceOutlookPanel : null;
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
  const harness = sandbox.window.__incomeImpactVisualTimelineHarness;
  harness.resourceOutlookPanel = resourceOutlookPanel;
  return harness;
}

function createBrowserGlobalHelperHarness(sources) {
  const sandbox = {
    console
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sources.forEach(function (source) {
    vm.runInNewContext(source, sandbox, {
      filename: "income-impact-storyline-helper.js"
    });
  });
  return sandbox.LensApp?.lensAnalysis || {};
}

function getPathD(html, dataAttributeName, dataAttributeValue) {
  const pattern = new RegExp(`<path\\b(?=[^>]*${dataAttributeName}="${dataAttributeValue}")[^>]*\\bd="([^"]*)"`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected SVG path for ${dataAttributeName}="${dataAttributeValue}"`);
  return match[1];
}

function getRunwayDepletionMarkerTag(html, scenarioId) {
  const tags = html.match(/<g\b(?=[^>]*data-income-impact-runway-depletion-marker)[^>]*>/g) || [];
  const tag = tags.find(function (candidate) {
    return candidate.includes(`data-income-impact-applied-scenario-id="${scenarioId}"`);
  });
  assert.ok(tag, `Expected depletion marker for ${scenarioId}`);
  return tag;
}

function getDeathConversionConnectorTag(html) {
  const tags = html.match(/<g\b(?=[^>]*data-income-impact-death-conversion(?:\s|>))[^>]*>/g) || [];
  assert.equal(tags.length, 1, "Expected exactly one death-event conversion connector.");
  return tags[0];
}

function getSvgGroupTagByAttribute(html, attributeName, attributeValue) {
  const pattern = new RegExp(`<g\\b(?=[^>]*${attributeName}="${attributeValue}")[^>]*>`, "g");
  const tags = html.match(pattern) || [];
  assert.equal(tags.length, 1, `Expected one SVG group with ${attributeName}="${attributeValue}".`);
  return tags[0];
}

function getTranslateCoordinates(tag) {
  const match = String(tag || "").match(/transform="translate\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)"/);
  assert.ok(match, "Expected SVG group to include translate coordinates.");
  return {
    x: Number(match[1]),
    y: Number(match[2])
  };
}

function getGraphHoverGridLineTag(html, x) {
  const tags = html.match(/<line\b(?=[^>]*data-income-impact-graph-hover-grid-line)[^>]*>/g) || [];
  const tag = tags.find(function (candidate) {
    return candidate.includes(`x1="${x}"`);
  });
  assert.ok(tag, `Expected hover grid line at x="${x}"`);
  return tag;
}

function getSvgTag(html, tagName, attributeName) {
  const pattern = new RegExp(`<${tagName}\\b(?=[^>]*${attributeName})[^>]*>`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected <${tagName}> with ${attributeName}.`);
  return match[0];
}

function getSvgNumericAttribute(tag, attributeName) {
  const pattern = new RegExp(`${attributeName}="(-?\\d+(?:\\.\\d+)?)"`);
  const match = String(tag || "").match(pattern);
  assert.ok(match, `Expected ${attributeName} on SVG tag.`);
  return Number(match[1]);
}

function getPathYValues(pathD) {
  const numbers = String(pathD || "").match(/-?\d+(?:\.\d+)?/g) || [];
  return numbers
    .map(Number)
    .filter(Number.isFinite)
    .filter(function (_number, index) {
      return index % 2 === 1;
    });
}

function getNumericAttributeValues(html, attributeName) {
  const pattern = new RegExp(`${attributeName}="([^"]+)"`, "g");
  const values = [];
  let match = pattern.exec(html);
  while (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      values.push(value);
    }
    match = pattern.exec(html);
  }
  return values;
}

function assertAllEqual(values, expected, message) {
  assert.ok(values.length > 0, message);
  values.forEach(function (value) {
    assert.equal(value, expected, message);
  });
}

function makeGraphModel(mode = "forward-projection") {
  const deathXRatio = mode === "current-point-only" ? 0 : 0.25;
  return {
    status: "complete",
    phases: {
      preDeath: { id: "preDeath", startXRatio: 0, endXRatio: deathXRatio, available: mode !== "current-point-only" },
      deathEvent: { id: "deathEvent", date: "2031-04-29", xRatio: deathXRatio },
      postDeath: { id: "postDeath", startXRatio: deathXRatio, endXRatio: 1, available: true }
    },
    series: {
      preDeathAssets: mode === "current-point-only" ? [] : [
        { date: "2026-04-29", value: 500000, xRatio: 0, yRatio: 0.24 },
        { date: "2029-04-29", value: 560000, xRatio: 0.15, yRatio: 0.18 },
        { date: "2031-04-29", value: 600000, xRatio: 0.25, yRatio: 0.14 }
      ],
      currentAnchor: mode === "current-point-only"
        ? { date: "2026-04-29", value: 500000, xRatio: 0, yRatio: 0.24 }
        : null,
      deathTransition: [
        { id: "assets-before-death", value: 600000, xRatio: deathXRatio, yRatio: 0.14 },
        { id: "treated-assets", value: 450000, xRatio: deathXRatio, yRatio: 0.3 },
        { id: "before-obligations", value: 850000, xRatio: deathXRatio, yRatio: 0.04 },
        { id: "after-obligations", value: 720000, xRatio: deathXRatio, yRatio: 0.09 }
      ],
      postDeathResources: [
        { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
        { date: "2040-04-29", monthIndex: 108, value: 120000, xRatio: 0.72, yRatio: 0.58 },
        { date: "2043-04-29", monthIndex: 144, value: -80000, xRatio: 0.9, yRatio: 0.76 }
      ]
    },
    axes: {
      x: {
        xAxisMode: "deathRelativeYears",
        ticks: [
          ...(mode === "current-point-only" ? [] : [
            { id: "before-death", label: "Before death", date: "2026-04-29", relativeYears: null, xRatio: 0 }
          ]),
          { id: "death", label: "Death", date: "2031-04-29", relativeYears: 0, xRatio: deathXRatio },
          { id: "plus-12", label: "+1 year", date: "2032-04-29", relativeYears: 1, xRatio: 0.31 },
          { id: "plus-24", label: "+2 years", date: "2033-04-29", relativeYears: 2, xRatio: 0.37 },
          { id: "plus-36", label: "+3 years", date: "2034-04-29", relativeYears: 3, xRatio: 0.43 },
          { id: "plus-60", label: "+5 years", date: "2036-04-29", relativeYears: 5, xRatio: 0.52 },
          { id: "plus-84", label: "+7 years", date: "2038-04-29", relativeYears: 7, xRatio: 0.6 },
          { id: "plus-120", label: "+10 years", date: "2041-04-29", relativeYears: 10, xRatio: 0.72 },
          { id: "plus-180", label: "+15 years", date: "2046-04-29", relativeYears: 15, xRatio: 0.9 }
        ]
      },
      y: {
        signed: true,
        zeroYRatio: 0.68,
        ticks: [
          { value: -123000, yRatio: 0.8 },
          { value: 0, yRatio: 0.68 },
          { value: 457900, yRatio: 0.24 },
          { value: 452300, yRatio: 0.02 }
        ]
      }
    },
    markers: [
      { id: "depleted", ruleId: "survivor-resources-depleted", kind: "risk", severity: "critical", title: "Resources depleted", summary: "Resources deplete.", positionable: true, xRatio: 0.84, yRatio: 0.68 },
      { id: "coverage", ruleId: "coverage-added-at-death", kind: "stable", severity: "stable", title: "Coverage added", summary: "Coverage is added.", positionable: true, xRatio: mode === "current-point-only" ? 0 : 0.25, yRatio: 0.09 },
      { id: "unmet-need", ruleId: "accumulated-unmet-need", kind: "risk", severity: "at-risk", title: "Unmet need accumulates", markerLabel: "Unmet need", summary: "Required support continues after resources run out.", positionable: true, xRatio: 0.9, yRatio: 0.76 }
    ],
    selectedEvent: {
      id: "depleted",
      kind: "risk",
      severity: "critical",
      title: "Resources depleted",
      summary: "Resources deplete.",
      date: "2043-04-29"
    },
    callouts: [
      { id: "assets-before-death", label: "Assets before death", value: 600000, kind: "currency", phase: "deathEvent" },
      { id: "resources-after-obligations", label: "Resources after obligations", value: 720000, kind: "currency", phase: "deathEvent" },
      { id: "runway-months-covered", label: "Runway covered", value: 144, kind: "months", phase: "postDeath" }
    ],
    warnings: [],
    dataGaps: [],
    trace: {
      calculationMethod: "income-impact-timeline-graph-model-v1"
    }
  };
}

function attachStableLayoutFrame(graphModel, overrides = {}) {
  graphModel.layoutFrame = Object.assign({
    mode: "stableRunoutAnchoredFrame",
    plotLeft: 74,
    plotRight: 958,
    plotTop: 36,
    plotBottom: 354,
    deathXRatio: 0.125,
    zeroYRatio: 0.72,
    runoutAnchorXRatio: 0.8,
    negativeSupportBandRatio: 0.28,
    xDomainMonths: 180,
    yDomain: {
      min: -125000,
      max: 720000,
      signed: true,
      source: "axes.y"
    },
    zeroCrossingAnchorScenarioId: "selected",
    zeroCrossingAnchorMonth: 144,
    zeroCrossingAnchorSource: "current-rendered-scenario-depletion",
    trace: {
      source: "income-impact-timeline-graph-model.layoutFrame",
      rendererConsumesLayoutFrame: false
    }
  }, overrides);
  return graphModel;
}

function makeLifestyleScenarioFixture({ sliderValue, monthlyDelta, depletionMonthIndex, depletionDate, points }) {
  return {
    status: "complete",
    sliderValue,
    monthlyDelta,
    totalBaselineMonthlyExpenses: 6000,
    totalAdjustedMonthlyExpenses: 6000 + monthlyDelta,
    comparisonScenario: {
      scenarioId: "income-impact-lifestyle-adjusted-comparison",
      kind: "lifestyleComparison",
      label: "Lifestyle-adjusted projection",
      pathId: "lifestyle-post-death-resources",
      postDeathSeries: {
        points,
        depletion: {
          depleted: true,
          depletionMonthIndex,
          depletionDate
        }
      },
      depletion: {
        depleted: true,
        depletionMonthIndex,
        depletionDate
      },
      trace: {
        calculationMethod: "income-impact-household-expense-stream-comparison-adapter-v1",
        sliderValue,
        monthlyDelta,
        graphMonthlyDelta: monthlyDelta,
        noOpComparison: monthlyDelta === 0
      }
    }
  };
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const resourceBucketAdapterSource = readRepoFile("app/features/lens-analysis/income-impact-resource-bucket-adapter.js");
const resourceWaterfallSource = readRepoFile("app/features/lens-analysis/income-impact-resource-waterfall-calculations.js");
const housingRiskSource = readRepoFile("app/features/lens-analysis/income-impact-housing-risk-calculations.js");
const financialStorylineSource = readRepoFile("app/features/lens-analysis/income-impact-financial-storyline-calculations.js");
const timelineStoryEventsSource = readRepoFile("app/features/lens-analysis/income-impact-timeline-story-events.js");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const componentsSource = readRepoFile("components.css");
const layoutSource = readRepoFile("layout.css");
const stylesSource = readRepoFile("styles.css");
const workspaceSideNavSource = readRepoFile("workspace-side-nav.js");
const harness = createDisplayHarness(displaySource);
const browserGlobalHelpers = createBrowserGlobalHelperHarness([
  resourceBucketAdapterSource,
  resourceWaterfallSource,
  housingRiskSource,
  financialStorylineSource,
  timelineStoryEventsSource
]);

assert.equal(typeof harness.renderTimeline, "function");
assert.equal(typeof harness.renderIncomeImpact, "function");
assert.equal(typeof harness.buildFinancialStorylineForTimelineResult, "function");
assert.equal(typeof harness.buildTimelineStoryEventsForTimelineResult, "function");
assert.equal(typeof browserGlobalHelpers.buildIncomeImpactResourceBucketsFromLensModel, "function");
assert.equal(typeof browserGlobalHelpers.buildIncomeImpactResourceWaterfall, "function");
assert.equal(typeof browserGlobalHelpers.buildIncomeImpactHousingRisk, "function");
assert.equal(typeof browserGlobalHelpers.buildIncomeImpactFinancialStorylineCandidates, "function");
assert.equal(typeof browserGlobalHelpers.normalizeIncomeImpactTimelineStoryEvents, "function");
assert.match(pageSource, /income-impact-timeline-graph-model\.js[\s\S]*income-loss-impact-display\.js/);
assert.match(
  pageSource,
  /income-impact-resource-bucket-adapter\.js[\s\S]*income-impact-resource-waterfall-calculations\.js[\s\S]*income-impact-housing-risk-calculations\.js[\s\S]*income-impact-financial-storyline-calculations\.js[\s\S]*income-loss-impact-display\.js/,
  "Income Impact page should load pure storyline helpers before the display bridge."
);
assert.match(
  pageSource,
  /income-impact-financial-storyline-calculations\.js[\s\S]*income-impact-timeline-story-events\.js[\s\S]*income-loss-impact-display\.js/,
  "Income Impact page should load normalized timeline story events before the display bridge."
);
assert.match(pageSource, /class="page-intro income-impact-page-intro"/);
assert.match(pageSource, /<h1>Remaining Resources Timeline<\/h1>/);
assert.match(pageSource, /Preview only &mdash; LENS recommendation unchanged\./);
assert.match(pageSource, /<p>Adjust the selected scenario\.<\/p>/);
assert.match(pageSource, /data-income-impact-controls-layout/);
assert.match(pageSource, /data-income-impact-controls-panel/);
assert.doesNotMatch(workspaceSideNavSource, /body\.dataset\.step === "income-impact"[\s\S]*topbarInner\.insertBefore\(trail,\s*topbarActions \|\| null\);/);
assert.match(workspaceSideNavSource, /topbarInner\.insertBefore\(trail,\s*topbarActions \|\| null\);/);
assert.match(workspaceSideNavSource, /document\.querySelector\("\[data-lens-workflow-trail-banner\]"\)\?\.remove\(\);/);
assert.match(workspaceSideNavSource, /document\.querySelector\("\[data-lens-workflow-trail\]"\)\?\.remove\(\);/);
assert.match(
  componentsSource,
  /\.workspace-page-topbar \.lens-workflow-trail[\s\S]*height:\s*100%;[\s\S]*flex:\s*1 1 auto;/,
  "Income Impact should render the LENS workflow trail inside the navigation bar instead of a separate banner."
);
assert.match(
  pageSource,
  /data-income-impact-controls-layout[\s\S]*class="panel-stack income-impact-content-stack"[\s\S]*class="page-intro income-impact-page-intro"[\s\S]*data-income-impact-display[\s\S]*data-income-impact-controls-panel[\s\S]*data-income-impact-scenario-banner/,
  "Income Impact page intro and display should live in the scrollable content stack while controls stay in the sibling side rail."
);
assert.match(pageSource, /data-income-impact-scenario-banner/);
assert.match(displaySource, /buildIncomeImpactTimelineGraphModel/);
assert.match(displaySource, /buildIncomeImpactFinancialStorylineCandidates/);
assert.match(displaySource, /normalizeIncomeImpactTimelineStoryEvents/);
assert.match(displaySource, /timelineResult\.timelineStoryEvents\s*=\s*buildTimelineStoryEventsForTimelineResult/);
assert.match(displaySource, /buildIncomeImpactResourceBucketsFromLensModel/);
assert.match(displaySource, /buildIncomeImpactResourceWaterfall/);
assert.match(displaySource, /buildIncomeImpactHousingRisk/);
assert.match(displaySource, /assetDepletionLedgerDiagnostic/);
assert.match(displaySource, /assetDepletionLedger:\s*assetDepletionLedger \? clonePlainValue\(assetDepletionLedger\) : null/);
assert.match(displaySource, /financialStoryline/);
assert.match(displaySource, /rendered:\s*false/);
assert.match(displaySource, /renderIncomeImpactTimelineGraph/);
assert.match(displaySource, /renderTopSummaryStrip/);
assert.match(displaySource, /data-income-impact-summary-strip/);
assert.match(displaySource, /renderResourceOutlookPanel/);
assert.match(displaySource, /syncResourceOutlookPanel/);
assert.match(displaySource, /renderPlanningAlertsInbox/);
assert.match(displaySource, /data-income-impact-alert-inbox/);
assert.match(displaySource, /data-income-impact-alert-inbox-empty/);
assert.match(displaySource, /data-income-impact-resource-outlook/);
assert.match(componentsSource, /\.income-impact-alert-inbox\s*\{[\s\S]*height:\s*15rem;[\s\S]*overflow-y:\s*auto;/);
assert.match(displaySource, /renderFinancialDepletionStoryScaffold/);
assert.match(displaySource, /data-income-impact-depletion-story/);
assert.match(displaySource, /data-income-impact-depletion-story-empty/);
assert.match(displaySource, /data-income-impact-major-story-card/);
assert.match(displaySource, /data-income-impact-major-story-event-id/);
assert.match(displaySource, /data-income-impact-major-story-family/);
assert.match(displaySource, /data-income-impact-major-story-severity/);
assert.match(displaySource, /FINANCIAL_STORYLINE_MAJOR_CARD_LIMIT = 6/);
assert.match(displaySource, /renderGraphStorylineConnectors/);
assert.match(displaySource, /data-income-impact-storyline-connector/);
assert.match(displaySource, /data-income-impact-storyline-connector-event-id/);
assert.match(displaySource, /data-income-impact-storyline-dot-tier/);
assert.match(displaySource, /getGraphStorylineEventDotGroups/);
assert.match(displaySource, /data-income-impact-storyline-group-count/);
assert.match(displaySource, /getLedgerStorylineEventActionLabel/);
assert.match(displaySource, /data-income-impact-storyline-connected-to-major-card/);
assert.match(displaySource, /data-income-impact-storyline-eligible-for-connector/);
assert.match(displaySource, /Storyline events will appear here once verified timeline drivers are available\./);
assert.doesNotMatch(displaySource, /getFinancialDepletionStoryItems|renderFinancialDepletionStoryItem|renderFinancialDepletionStoryIcon|formatStoryOffsetFromMonths/);
assert.doesNotMatch(displaySource, /Emergency Savings Depleted|Retirement Accounts Tapped|Home Equity at Risk|Credit Crisis|Total Financial Collapse/);
assert.doesNotMatch(displaySource, />Story scaffold</);
assert.doesNotMatch(displaySource, /Reserved for the future sequence/);
assert.doesNotMatch(displaySource, />Starting resources<|>Runway pressure<|>Depletion outcome</);
assert.match(displaySource, /data-income-impact-chart-section/);

const storylineTimelineResult = {
  selectedDeath: { date: "2031-04-29", age: 46 },
  scenario: {
    status: "complete",
    scenario: { selectedDeathDate: "2031-04-29", selectedDeathAge: 46 },
    deathEvent: { immediateObligations: 15000 },
    timelineFacts: {
      monthsCovered: 36,
      depletionDate: "2034-04-29",
      resourcesAfterObligations: 180000
    },
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionMonthIndex: 36,
        depletionDate: "2034-04-29"
      }
    },
    warnings: [],
    dataGaps: []
  },
  riskEvaluation: { status: "complete", warnings: [], dataGaps: [] },
  graphModel: makeGraphModel(),
  financialRunway: {
    totalMonthsOfSecurity: 36,
    depletionDate: "2034-04-29"
  },
  warnings: [],
  dataGaps: []
};
const storylineTimelineSnapshot = JSON.parse(JSON.stringify(storylineTimelineResult));
const bridgeCalls = {
  resourceBuckets: [],
  storyline: [],
  resourceWaterfall: [],
  housingRisk: []
};
const storylineState = {
  lensModel: {
    assetFacts: {
      assets: [
        {
          assetId: "cash-checking",
          categoryKey: "cashAndCashEquivalents",
          typeKey: "checkingAccount",
          label: "Checking Account",
          currentValue: 50000
        },
        {
          assetId: "emergency",
          categoryKey: "emergencyFund",
          typeKey: "emergencyFundReserve",
          label: "Emergency Fund",
          currentValue: 25000
        }
      ]
    },
    treatedAssetOffsets: {
      assets: [
        { assetId: "cash-checking", categoryKey: "cashAndCashEquivalents", typeKey: "checkingAccount", include: true, treatedValue: 48000 },
        { assetId: "emergency", categoryKey: "emergencyFund", typeKey: "emergencyFundReserve", include: true, treatedValue: 25000 }
      ]
    }
  },
  buildIncomeImpactResourceBucketsFromLensModel(input) {
    bridgeCalls.resourceBuckets.push(JSON.parse(JSON.stringify(input)));
    return browserGlobalHelpers.buildIncomeImpactResourceBucketsFromLensModel(input);
  },
  buildIncomeImpactResourceWaterfall(input) {
    bridgeCalls.resourceWaterfall.push(JSON.parse(JSON.stringify(input)));
    return {
      version: "income-impact-resource-waterfall-v1",
      depletionEvents: [
        {
          id: "cash-depleted",
          bucketId: "cash",
          eventType: "bucket-depleted",
          family: "cash",
          displayLabel: "Cash Savings Depleted",
          monthOffset: 10,
          amount: { value: 50000, sourcePath: "resourceBuckets[0].startingValue" },
          evidenceLevel: "estimated",
          safeToRender: true,
          sourcePath: "resourceBuckets[0]",
          trace: { source: "test-waterfall" }
        }
      ],
      timelineEvents: [],
      warnings: [],
      trace: { source: "test-waterfall" }
    };
  },
  buildIncomeImpactHousingRisk(input) {
    bridgeCalls.housingRisk.push(JSON.parse(JSON.stringify(input)));
    return {
      version: "income-impact-housing-risk-v1",
      riskEvents: [
        {
          id: "housing-payment-at-risk",
          family: "housing",
          eventType: "housing-payment-at-risk",
          displayLabel: "Housing Payment At Risk",
          monthOffset: 18,
          amount: { value: 2400, sourcePath: "housingObligations[0].monthlyPayment" },
          evidenceLevel: "estimated",
          safeToRender: true,
          sourcePath: "housingObligations[0]",
          trace: { source: "test-housing-risk" }
        }
      ],
      timelineEvents: [],
      warnings: [],
      trace: { source: "test-housing-risk" }
    };
  },
  buildIncomeImpactFinancialStorylineCandidates(input) {
    bridgeCalls.storyline.push(JSON.parse(JSON.stringify(input)));
    return {
      version: "financial-storyline-candidates-v1",
      allCandidates: [],
      safeRenderableEvents: [
        { id: "death-income-stops", safeToRender: true },
        { id: "cash-savings-depleted", safeToRender: true },
        { id: "housing-payment-at-risk", safeToRender: true }
      ],
      deferredCandidates: [{ id: "retirement-assets-tapped", safeToRender: false }],
      majorStoryCandidates: [{ id: "death-income-stops" }],
      graphDotCandidates: [{ id: "cash-savings-depleted" }],
      suppressedCandidates: [{ id: "housing-payment-at-risk", suppressionReason: "major-card-cap" }],
      warnings: [],
      trace: {
        source: "income-impact-financial-storyline-calculations",
        selectorPolicy: "storyline-selector-v1"
      }
    };
  }
};
storylineState.normalizeIncomeImpactTimelineStoryEvents = browserGlobalHelpers.normalizeIncomeImpactTimelineStoryEvents;
const wiredFinancialStoryline = harness.buildFinancialStorylineForTimelineResult(
  storylineState,
  storylineTimelineResult,
  {
    comparisonScenarios: [],
    appliedScenarios: [{ scenarioId: "income-impact-current-scenario" }],
    selectedScenarioId: "income-impact-current-scenario",
    controls: { selectedDeathDate: "2031-04-29", projectionHorizonYears: 40 }
  }
);
assert.equal(wiredFinancialStoryline.trace.displayBridgeSource, "income-impact-display-financial-storyline-bridge");
assert.equal(wiredFinancialStoryline.trace.rendered, false);
assert.equal(wiredFinancialStoryline.trace.resourceWaterfallStatus, "built");
assert.equal(wiredFinancialStoryline.trace.housingRiskStatus, "built");
assert.ok(Array.isArray(wiredFinancialStoryline.majorStoryCandidates));
assert.ok(Array.isArray(wiredFinancialStoryline.graphDotCandidates));
assert.ok(Array.isArray(wiredFinancialStoryline.suppressedCandidates));
assert.ok(Array.isArray(wiredFinancialStoryline.deferredCandidates));
assert.equal(bridgeCalls.resourceBuckets.length, 1);
assert.equal(bridgeCalls.resourceWaterfall.length, 1);
assert.equal(bridgeCalls.housingRisk.length, 1);
assert.equal(bridgeCalls.storyline.length, 1);
assert.equal(bridgeCalls.resourceBuckets[0].assetFacts.assets.length, 2);
assert.equal(bridgeCalls.resourceBuckets[0].treatedAssetOffsets.assets.length, 2);
assert.equal(bridgeCalls.resourceWaterfall[0].resourceBuckets.length, 2);
assert.deepEqual(
  bridgeCalls.resourceWaterfall[0].resourceBuckets.map(function (bucket) { return bucket.family; }),
  ["cash", "emergencyFund"],
  "display bridge should pass explicit Lens asset resource buckets to the waterfall helper"
);
assert.equal(
  bridgeCalls.resourceWaterfall[0].resourceBuckets[0].startingValue,
  48000,
  "display bridge should pass treated spendable asset value into the waterfall helper"
);
assert.equal(bridgeCalls.storyline[0].scenario.scenario.selectedDeathDate, "2031-04-29");
assert.equal(bridgeCalls.storyline[0].resourceWaterfall.depletionEvents[0].id, "cash-depleted");
assert.equal(bridgeCalls.storyline[0].housingRisk.riskEvents[0].id, "housing-payment-at-risk");
assert.deepEqual(storylineTimelineResult, storylineTimelineSnapshot);

const storyBridgeTimelineResult = JSON.parse(JSON.stringify(storylineTimelineResult));
storyBridgeTimelineResult.financialStoryline = {
  majorStoryCandidates: [
    {
      id: "death-income-stops",
      family: "trigger",
      severity: "critical",
      cardTitle: "Death & Income Stops",
      description: "Household income stops at the modeled death event.",
      evidenceLevel: "trace-backed",
      timing: { kind: "death-event", monthOffset: 0, date: "2031-04-29", label: "At death" }
    }
  ],
  graphDotCandidates: [
    {
      id: "cash-savings-depleted",
      family: "liquidity",
      severity: "caution",
      dotTier: "micro",
      connectedToMajorCard: false,
      eligibleForConnector: false,
      graphLabel: "Cash depleted",
      displayLabel: "Cash Savings Depleted",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 12, date: "2032-04-29", label: "Month 12" },
      amount: { value: 50000, label: "$50,000" }
    }
  ]
};
storyBridgeTimelineResult.riskEvaluation = {
  events: [{ id: "risk-caution", severity: "caution", monthIndex: 2, markerLabel: "Risk" }],
  stableEvents: [{ id: "stable-covered", severity: "stable", monthIndex: 1, markerLabel: "Covered" }]
};
storyBridgeTimelineResult.graphModel = {
  markers: [{ id: "graph-risk", severity: "at-risk", monthIndex: 3, markerLabel: "Graph Risk" }],
  comparisonMarkers: []
};
storyBridgeTimelineResult.scenario.transitionOutlook = { status: "Stable", windowMonths: 3 };
const normalizedStoryEvents = harness.buildTimelineStoryEventsForTimelineResult(
  storylineState,
  storyBridgeTimelineResult
);
assert.equal(normalizedStoryEvents.trace.status, "built");
assert.equal(normalizedStoryEvents.trace.rendered, false);
assert.ok(Array.isArray(normalizedStoryEvents.events));
assert.ok(normalizedStoryEvents.events.some(function (event) {
  return event.id === "death-income-stops" && event.sourceCandidateType === "majorStoryCandidate" && event.cardTitle === "Death & Income Stops";
}));
assert.ok(normalizedStoryEvents.events.some(function (event) {
  return event.id === "cash-savings-depleted"
    && event.sourceCandidateType === "graphDotCandidate"
    && event.dotTier === "micro"
    && event.graphLabel === "Cash depleted"
    && event.evidenceLevel === "estimated"
    && event.amount.label === "$50,000";
}));
assert.ok(normalizedStoryEvents.events.some(function (event) {
  return event.id === "transition-outlook" && event.surface === "resourceOutlook";
}));
const unavailableTimelineStoryEvents = harness.buildTimelineStoryEventsForTimelineResult(
  {},
  storyBridgeTimelineResult
);
assert.equal(Array.isArray(unavailableTimelineStoryEvents.events), true);
assert.equal(unavailableTimelineStoryEvents.events.length, 0);
assert.equal(unavailableTimelineStoryEvents.trace.status, "unavailable");
assert.match(
  unavailableTimelineStoryEvents.warnings.map(function (warning) { return warning.code; }).join(" "),
  /timeline-story-events-unavailable/
);

const unavailableFinancialStoryline = harness.buildFinancialStorylineForTimelineResult(
  {},
  storylineTimelineResult,
  { controls: { selectedDeathDate: "2031-04-29" } }
);
assert.ok(Array.isArray(unavailableFinancialStoryline.majorStoryCandidates));
assert.ok(Array.isArray(unavailableFinancialStoryline.graphDotCandidates));
assert.ok(Array.isArray(unavailableFinancialStoryline.suppressedCandidates));
assert.ok(Array.isArray(unavailableFinancialStoryline.deferredCandidates));
assert.match(
  unavailableFinancialStoryline.warnings.map(function (warning) { return warning.code; }).join(" "),
  /financial-storyline-unavailable/
);

assert.match(displaySource, /data-income-impact-graph-svg/);
assert.match(displaySource, /appliedRunwayScenarios/);
assert.match(displaySource, /fundedRunwayPoints/);
assert.match(displaySource, /deficitPoints/);
assert.match(displaySource, /preDeathContextPoints/);
assert.match(displaySource, /renderGraphHoverLayer/);
assert.match(displaySource, /getSelectedScenarioHoverPoints/);
assert.match(displaySource, /getInterpolatedGraphHoverInterval/);
assert.match(displaySource, /getInterpolatedGraphHoverPointAtXRatio/);
assert.match(displaySource, /getGraphHoverInspectionIntervals/);
assert.match(displaySource, /buildGraphAreaUnderSvgPath/);
assert.match(displaySource, /getGraphHoverUnderTrendlineTintAreas/);
assert.doesNotMatch(displaySource, /buildGraphHoverUnderTrendlineTintPath/);
assert.doesNotMatch(displaySource, /getGraphHoverUnderTrendlineTintSegments/);
assert.match(displaySource, /GRAPH_HOVER_UNDERLAY_PRE_DEATH_GRADIENT_ID = "income-impact-graph-hover-underlay-pre-death-gradient"/);
assert.match(displaySource, /GRAPH_HOVER_UNDERLAY_POST_DEATH_GRADIENT_ID = "income-impact-graph-hover-underlay-post-death-gradient"/);
assert.match(displaySource, /data-income-impact-graph-hover-underlay-gradient="preDeath"/);
assert.match(displaySource, /data-income-impact-graph-hover-underlay-gradient="postDeath"/);
assert.match(displaySource, /data-income-impact-graph-hover-underlay-gradient="preDeath" gradientUnits="objectBoundingBox"/);
assert.match(displaySource, /data-income-impact-graph-hover-underlay-gradient="postDeath" gradientUnits="objectBoundingBox"/);
assert.match(displaySource, /stop-color="#3b82f6" stop-opacity="0\.1"[\s\S]*offset="38%" stop-color="#3b82f6" stop-opacity="0\.025"[\s\S]*offset="72%" stop-color="#3b82f6" stop-opacity="0"[\s\S]*offset="100%" stop-color="#3b82f6" stop-opacity="0"/);
assert.match(displaySource, /data-income-impact-graph-hover-underlay-gradient="postDeath"[\s\S]*stop-color="#3b82f6" stop-opacity="0\.1"[\s\S]*offset="38%" stop-color="#3b82f6" stop-opacity="0\.025"[\s\S]*offset="72%" stop-color="#3b82f6" stop-opacity="0"[\s\S]*offset="100%" stop-color="#3b82f6" stop-opacity="0"/);
assert.match(displaySource, /GRAPH_HOVER_GRID_SPACING = 8/);
assert.match(displaySource, /data-income-impact-graph-hover-interval/);
assert.match(displaySource, /data-income-impact-graph-hover-underlay="selected-trendline"/);
assert.match(displaySource, /data-income-impact-graph-hover-grid-line/);
assert.match(displaySource, /data-income-impact-graph-hover-slot/);
assert.match(displaySource, /data-income-impact-graph-hover-active-line/);
assert.match(displaySource, /data-income-impact-graph-hover-value/);
assert.match(displaySource, /data-income-impact-graph-hover-readout/);
assert.match(displaySource, /renderGraphStorylineEventDots/);
assert.match(displaySource, /data-income-impact-storyline-dot/);
assert.match(displaySource, /data-income-impact-storyline-event-id/);
assert.match(displaySource, /data-income-impact-storyline-trendline-markers/);
assert.match(displaySource, /data-income-impact-storyline-coordinate-source/);
assert.match(displaySource, /death-conversion-diamond/);
assert.match(displaySource, /runway-depletion-marker/);
assert.doesNotMatch(displaySource, /GRAPH_STORYLINE_EVENT_LANE_/);
assert.match(displaySource, /GRAPH_STORYLINE_EVENT_DOT_LIMIT = 16/);
assert.match(displaySource, /data-income-impact-graph-y-grid-line/);
assert.match(displaySource, /data-income-impact-graph-y-tick-marker/);
assert.match(displaySource, /data-income-impact-graph-x-grid-line/);
assert.match(displaySource, /data-income-impact-graph-x-tick-dot/);
assert.match(displaySource, /data-income-impact-pre-death-source/);
assert.match(displaySource, /data-income-impact-graph-deficit-area/);
assert.match(displaySource, /renderAppliedScenarioDepletionMarkers/);
assert.match(displaySource, /data-income-impact-runway-depletion-marker/);
assert.match(displaySource, /renderDeathEventConversionConnector/);
assert.match(displaySource, /DEATH_CONVERSION_ARROW_POSITION_RATIOS/);
assert.match(displaySource, /DEATH_CONVERSION_CIRCLE_POSITION_RATIO_FROM_TOP/);
assert.match(displaySource, /data-income-impact-death-conversion-spine/);
assert.match(displaySource, /data-income-impact-death-conversion-chevron-position-ratio/);
assert.match(displaySource, /data-income-impact-death-conversion-diamond/);
assert.match(displaySource, /data-income-impact-death-conversion-circle/);
assert.match(displaySource, /data-income-impact-death-conversion-gradient[\s\S]*<stop offset="100%" stop-color="#3b82f6"><\/stop>/);
assert.doesNotMatch(displaySource, /<stop offset="100%" stop-color="#227455"><\/stop>/);
assert.match(
  displaySource,
  /\$\{appliedScenarioPaths\}[\s\S]*\$\{comparisonPaths\}[\s\S]*\$\{deathConversionConnector\}/,
  "Death-event connector markers should paint above the runway paths."
);
assert.match(
  displaySource,
  /\$\{renderSelectedScenarioDeficitArea\(graphModel, graphModel\?\.trace\?\.selectedScenarioId\)\}[\s\S]*\$\{hoverLayer\}[\s\S]*\$\{preDeathPath\}[\s\S]*\$\{appliedScenarioPaths\}/,
  "Hover inspection grid should paint behind the main graph paths."
);
assert.doesNotMatch(displaySource, /annotationGeometry/);
assert.doesNotMatch(displaySource, /getSelectedDeathEventBridge|renderDeathEventBridge/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-bridge/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-net-worth/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-survivor-resources/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-conversion-bridge/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-conversion-node/);
assert.doesNotMatch(displaySource, /data-income-impact-death-event-survivor-resources-leader/);
assert.doesNotMatch(displaySource, /Conversion at death|Net worth at death|Starting funds after conversion/);
assert.match(displaySource, /renderAppliedScenarioDeathLineAnchors/);
assert.match(displaySource, /data-income-impact-death-line-anchor/);
assert.match(displaySource, /shouldRenderGraphMarker/);
assert.match(displaySource, /buildLinearSvgPath/);
assert.match(displaySource, /renderLifestyleImpactReadout/);
assert.match(displaySource, /data-income-impact-lifestyle-impact-readout/);
assert.match(displaySource, /income-impact-lifestyle-impact-readout__stat/);
assert.match(displaySource, /income-impact-lifestyle-impact-readout__status/);
assert.match(displaySource, /aria-label="\$\{escapeHtml\(model\.monthlyCopy\)\}"/);
assert.match(displaySource, /aria-label="\$\{escapeHtml\(model\.detail\)\}"/);
assert.match(displaySource, /TREND_PATH_SIMPLIFICATION_TOLERANCE/);
assert.match(displaySource, /TREND_PATH_STRAIGHT_TOLERANCE/);
assert.match(displaySource, /simplifyTrendPathPoints/);
assert.match(displaySource, /buildTrendSvgPath/);
assert.match(displaySource, /buildTrendPathTangents/);
assert.match(displaySource, /clampNumber/);
assert.match(displaySource, /shouldRenderComparisonMarkerLabel/);
assert.doesNotMatch(displaySource, /fakeOffset|visualOffset|artificialVisualOffset/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents|scenarioTimeline|renderFinancialRunwayChart|buildRunwayChartModel/);
assert.doesNotMatch(displaySource, /data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-runway-point/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/
);
assert.match(componentsSource, /body\[data-step="income-impact"\] \.income-impact-page-intro[\s\S]*display:\s*block;[\s\S]*padding-bottom:\s*0\.72rem;[\s\S]*border-bottom:\s*1px solid rgba\(223,\s*229,\s*238,\s*0\.86\);/);
assert.match(componentsSource, /body\[data-step="income-impact"\] \.income-impact-page-intro > div[\s\S]*display:\s*grid;[\s\S]*gap:\s*0\.22rem;[\s\S]*max-width:\s*46rem;/);
assert.match(componentsSource, /body\[data-step="income-impact"\] \.income-impact-page-intro \.section-label[\s\S]*display:\s*none;/);
assert.match(componentsSource, /body\[data-step="income-impact"\] \.income-impact-page-intro h1[\s\S]*font-family:\s*"Montserrat",\s*sans-serif;[\s\S]*font-size:\s*18px;[\s\S]*font-weight:\s*600;[\s\S]*letter-spacing:\s*-0\.02em;/);
assert.match(componentsSource, /body\[data-step="income-impact"\] \.income-impact-page-intro p[\s\S]*font-family:\s*"Inter",\s*sans-serif;[\s\S]*font-size:\s*10\.5px;[\s\S]*line-height:\s*1\.25;/);
assert.match(stylesSource, /@layer overrides[\s\S]*body\[data-step="income-impact"\] \.income-impact-page-intro[\s\S]*display:\s*block;[\s\S]*padding-bottom:\s*0\.72rem;/);
assert.match(stylesSource, /@layer overrides[\s\S]*body\[data-step="income-impact"\] \.income-impact-page-intro \.section-label[\s\S]*display:\s*none;/);
assert.match(stylesSource, /@layer overrides[\s\S]*body\[data-step="income-impact"\] \.income-impact-page-intro h1[\s\S]*font-family:\s*"Montserrat",\s*sans-serif;[\s\S]*font-size:\s*18px;[\s\S]*font-weight:\s*600;[\s\S]*letter-spacing:\s*-0\.02em;/);
assert.match(stylesSource, /@layer overrides[\s\S]*body\[data-step="income-impact"\] \.income-impact-page-intro p[\s\S]*font-family:\s*"Inter",\s*sans-serif;[\s\S]*font-size:\s*10\.5px;[\s\S]*line-height:\s*1\.25;/);
assert.match(componentsSource, /\.income-impact-section[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
assert.match(componentsSource, /\.income-impact-summary-strip[\s\S]*padding:\s*0;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/);
assert.match(componentsSource, /\.income-impact-summary-strip[\s\S]*grid-template-columns:\s*minmax\(14rem,\s*0\.82fr\) minmax\(20rem,\s*1\.18fr\);/);
assert.match(componentsSource, /\.income-impact-summary-strip > \.income-impact-card[\s\S]*border:\s*1px solid rgba\(226,\s*232,\s*240,\s*0\.95\);[\s\S]*background:\s*#ffffff;/);
assert.match(componentsSource, /\.income-impact-summary-strip > \[data-income-impact-financial-security-card\][\s\S]*display:\s*flex;[\s\S]*padding:\s*0\.5rem 0\.95rem;[\s\S]*border:\s*1px solid #e2e8f0;[\s\S]*background:\s*#ffffff;/);
assert.match(componentsSource, /\.income-impact-summary-strip > \[data-income-impact-financial-security-card\] \.income-impact-card-header h2[\s\S]*background:\s*#eff6ff;[\s\S]*color:\s*#2563eb;/);
assert.match(componentsSource, /\.income-impact-summary-strip > \[data-income-impact-financial-security-card\] \.income-impact-financial-security-value[\s\S]*font-size:\s*0\.78rem;[\s\S]*font-weight:\s*700;/);
assert.match(componentsSource, /\.income-impact-story-chart-card[\s\S]*border:\s*1px solid rgba\(226,\s*232,\s*240,\s*0\.95\);[\s\S]*border-radius:\s*0\.55rem;[\s\S]*box-shadow:\s*none;[\s\S]*overflow:\s*hidden;/);
assert.match(componentsSource, /\.income-impact-depletion-story,[\s\S]*\.income-impact-chart-section[\s\S]*border-top:\s*1px solid rgba\(223,\s*229,\s*238,\s*0\.9\);/);
assert.match(componentsSource, /\.income-impact-depletion-story-header[\s\S]*justify-content:\s*space-between;/);
assert.match(componentsSource, /\.income-impact-depletion-story-lane[\s\S]*min-height:\s*3\.35rem;[\s\S]*padding:\s*0\.72rem 1\.05rem;[\s\S]*border-top:\s*1px solid rgba\(213,\s*220,\s*233,\s*0\.9\);/);
assert.match(componentsSource, /\.income-impact-depletion-story-empty[\s\S]*color:\s*#8a97b0;[\s\S]*font-family:\s*"Inter",\s*sans-serif;/);
assert.match(componentsSource, /body\.clients-page,\s*[\s\S]*body\.clients-page \*\s*\{[\s\S]*scrollbar-color:\s*#e5e7eb transparent;[\s\S]*scrollbar-width:\s*thin;/);
assert.match(componentsSource, /body\[data-step="income-impact"\],\s*[\s\S]*body\[data-step="income-impact"\] \*\s*\{[\s\S]*scrollbar-color:\s*#e5e7eb transparent;[\s\S]*scrollbar-width:\s*thin;/);
assert.match(componentsSource, /body\[data-step="income-impact"\]::-webkit-scrollbar,\s*[\s\S]*body\[data-step="income-impact"\] \*::-webkit-scrollbar\s*\{[\s\S]*width:\s*1px;[\s\S]*height:\s*1px;/);
assert.match(componentsSource, /body\[data-step="income-impact"\]::-webkit-scrollbar-thumb,\s*[\s\S]*body\[data-step="income-impact"\] \*::-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*#e5e7eb;[\s\S]*border-radius:\s*999px;/);
assert.match(componentsSource, /\.income-impact-major-story__list[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(8\.2rem,\s*1fr\)\);/);
assert.match(componentsSource, /\.income-impact-major-story-card[\s\S]*border-top:\s*0\.18rem solid #94a3b8;/);
assert.match(componentsSource, /\.income-impact-major-story-card--severity-critical[\s\S]*border-top-color:\s*#dc2626;/);
assert.match(componentsSource, /\.income-impact-storyline-connectors[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /\.income-impact-storyline-connector[\s\S]*stroke-dasharray:\s*4 6;/);
assert.doesNotMatch(componentsSource, /\.income-impact-depletion-story-card|\.income-impact-depletion-story-dot|\.income-impact-depletion-story-icon|\.income-impact-depletion-story-legend/);
assert.match(componentsSource, /\.income-impact-graph\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*#ffffff;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-graph-header[\s\S]*display:\s*none;/);
assert.match(componentsSource, /\.income-impact-story-chart-card \.income-impact-chart-section > \.income-impact-section-header[\s\S]*display:\s*none;/);
assert.match(componentsSource, /\.income-impact-scenario-banner[\s\S]*position:\s*static;[\s\S]*box-shadow:\s*none;/);
assert.match(componentsSource, /\.income-impact-graph-svg/);
assert.match(componentsSource, /\.income-impact-graph\s*\{[^}]*background:\s*#ffffff;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-graph-phase--pre-death\s*\{[^}]*fill:\s*#ffffff;[^}]*\}/);
assert.match(componentsSource, /\.income-impact-graph-phase--post-death\s*\{[^}]*fill:\s*#ffffff;[^}]*\}/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*#ffffff\s*0%,\s*#f8fafc\s*100%\);[^}]*\}/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-phase--pre-death\s*\{[^}]*fill:\s*rgba\(64,\s*84,\s*184,\s*0\.06\);[^}]*\}/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-phase--post-death\s*\{[^}]*fill:\s*rgba\(34,\s*116,\s*85,\s*0\.045\);[^}]*\}/);
assert.match(componentsSource, /\.income-impact-graph-path--preDeathAssets/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-path--deathTransition/);
assert.match(componentsSource, /\.income-impact-death-conversion-spine[\s\S]*stroke:\s*url\("#income-impact-death-conversion-gradient"\);[\s\S]*stroke-width:\s*3\.2;/);
assert.match(componentsSource, /\.income-impact-death-conversion-chevron[\s\S]*stroke:\s*url\("#income-impact-death-conversion-gradient"\);[\s\S]*stroke-width:\s*2\.4;/);
assert.match(componentsSource, /\.income-impact-death-conversion-diamond[\s\S]*fill:\s*#3b82f6;[\s\S]*stroke:\s*#ffffff;/);
assert.match(componentsSource, /\.income-impact-death-conversion-circle[\s\S]*fill:\s*#ffffff;[\s\S]*stroke:\s*#3b82f6;/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-bridge/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-net-worth/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-survivor-resources/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-conversion-bracket/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-conversion-node/);
assert.doesNotMatch(componentsSource, /\.income-impact-death-event-label/);
assert.match(componentsSource, /\.income-impact-death-line-anchor/);
assert.match(componentsSource, /\.income-impact-graph-path--postDeathResources[\s\S]*stroke:\s*#3b82f6;/);
assert.match(componentsSource, /\.income-impact-graph-path--lifestyle-post-death-resources/);
assert.match(componentsSource, /\.income-impact-graph-deficit-area/);
assert.match(componentsSource, /\.income-impact-graph-deficit-label/);
assert.match(componentsSource, /\.income-impact-runway-depletion-marker/);
assert.match(componentsSource, /\.income-impact-runway-depletion-label/);
assert.match(componentsSource, /\.income-impact-graph-hover-underlay[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /\.income-impact-graph-hover-underlay--pre-death[\s\S]*fill:\s*url\("#income-impact-graph-hover-underlay-pre-death-gradient"\);/);
assert.match(componentsSource, /\.income-impact-graph-hover-underlay--post-death[\s\S]*fill:\s*url\("#income-impact-graph-hover-underlay-post-death-gradient"\);/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-hover-underlay[\s\S]*fill:\s*rgba\(34,\s*116,\s*85,\s*0\.095\);/);
assert.match(componentsSource, /\.income-impact-graph-y-grid-line[\s\S]*stroke:\s*rgba\(30,\s*41,\s*59,\s*0\.1\);[\s\S]*stroke-dasharray:\s*5 6;/);
assert.match(componentsSource, /\.income-impact-graph-x-grid-line[\s\S]*stroke:\s*rgba\(30,\s*41,\s*59,\s*0\.08\);[\s\S]*stroke-dasharray:\s*3 3;[\s\S]*stroke-width:\s*0\.8;/);
assert.match(componentsSource, /\.income-impact-graph-y-tick-label[\s\S]*fill:\s*#0f172a;[\s\S]*font-weight:\s*700;/);
assert.match(componentsSource, /\.income-impact-graph-y-tick-marker circle[\s\S]*fill:\s*#1e293b;[\s\S]*opacity:\s*0\.5;/);
assert.match(componentsSource, /\.income-impact-graph-x-tick-dot[\s\S]*fill:\s*#0f172a;[\s\S]*opacity:\s*0\.35;/);
assert.match(componentsSource, /\.income-impact-graph-y-tick-marker path[\s\S]*stroke:\s*#1e293b;[\s\S]*stroke-width:\s*1\.5;/);
assert.match(componentsSource, /\.income-impact-graph-axis text[\s\S]*fill:\s*#64748b;[\s\S]*font-size:\s*0\.72rem;[\s\S]*font-weight:\s*500;/);
assert.match(componentsSource, /\.income-impact-graph-hover-grid-line[\s\S]*opacity:\s*0;[\s\S]*stroke:\s*transparent;[\s\S]*stroke-width:\s*1;/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-hover-grid-line[\s\S]*stroke:\s*rgba\(23,\s*32,\s*51,\s*0\.1\);/);
assert.match(componentsSource, /\.income-impact-graph-hover-grid-line[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /\.income-impact-storyline-trendline-markers/);
assert.doesNotMatch(componentsSource, /\.income-impact-storyline-event-lane/);
assert.match(componentsSource, /\.income-impact-storyline-dot/);
assert.match(componentsSource, /\.income-impact-storyline-dot--major \.income-impact-storyline-dot-core/);
assert.match(componentsSource, /\.income-impact-storyline-dot--micro \.income-impact-storyline-dot-core/);
assert.match(componentsSource, /\.income-impact-storyline-dot-group-ring/);
assert.match(componentsSource, /\.income-impact-storyline-dot-count-badge/);
assert.match(componentsSource, /\.income-impact-storyline-dot-readout/);
assert.match(componentsSource, /\.income-impact-storyline-dot-readout-action/);
assert.match(componentsSource, /\.income-impact-storyline-dot-readout-group-item/);
assert.match(componentsSource, /\.income-impact-storyline-dot:hover[\s\S]*\.income-impact-storyline-dot-readout/);
assert.match(componentsSource, /\.income-impact-graph-hover-slot[\s\S]*pointer-events:\s*all;/);
assert.match(componentsSource, /\.income-impact-graph-hover-active-line[\s\S]*opacity:\s*0;[\s\S]*stroke:\s*rgba\(59,\s*130,\s*246,\s*0\.28\);[\s\S]*stroke-width:\s*1;/);
assert.match(componentsSource, /\.income-impact-graph-hover-readout[\s\S]*opacity:\s*0;/);
assert.match(componentsSource, /\.income-impact-graph-legend i[\s\S]*border-top:\s*2px solid #3b82f6;/);
assert.match(componentsSource, /\.income-impact-graph-hover-interval:hover \.income-impact-graph-hover-active-line,[\s\S]*opacity:\s*1;/);
assert.match(componentsSource, /\.income-impact-graph-hover-interval:hover \.income-impact-graph-hover-readout,[\s\S]*\.income-impact-graph-hover-interval:focus \.income-impact-graph-hover-readout[\s\S]*opacity:\s*1;/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-hover-bar|\.income-impact-graph-hover-hit-zone|\.income-impact-graph-hover-band|\.income-impact-graph-hover-divider/);
assert.match(componentsSource, /\.income-impact-graph-phase[\s\S]*fill:\s*#ffffff;[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /\.income-impact-graph-deficit-area[\s\S]*pointer-events:\s*none;/);
assert.match(componentsSource, /data-income-impact-applied-scenario-selected="false"[\s\S]*opacity:\s*0\.38;/);
assert.match(componentsSource, /\.income-impact-runway-depletion-marker\[data-income-impact-applied-scenario-selected="true"\][\s\S]*circle/);
assert.match(componentsSource, /\.income-impact-runway-depletion-marker\[data-income-impact-applied-scenario-selected="false"\][\s\S]*opacity:\s*0\.62;/);
assert.match(componentsSource, /\.income-impact-lifestyle-impact-readout/);
assert.match(componentsSource, /\.income-impact-lifestyle-impact-readout[\s\S]*display:\s*flex;[\s\S]*padding:\s*0\.5rem 0\.95rem;[\s\S]*border:\s*1px solid #e2e8f0;[\s\S]*background:\s*#ffffff;/);
assert.match(componentsSource, /\.income-impact-lifestyle-impact-readout__eyebrow[\s\S]*background:\s*#fffbeb;[\s\S]*color:\s*#d97706;/);
assert.match(componentsSource, /\.income-impact-lifestyle-impact-readout__stat[\s\S]*border-right:\s*1px solid #e2e8f0;/);
assert.match(componentsSource, /\.income-impact-lifestyle-impact-readout__status[\s\S]*background:\s*#ecfdf5;[\s\S]*color:\s*#059669;/);
assert.match(componentsSource, /\.income-impact-graph-legend/);
assert.match(componentsSource, /\.income-impact-comparison-markers/);
assert.doesNotMatch(
  componentsSource,
  /\.income-impact-graph-path\[data-income-impact-scenario-select\]/,
  "Scenario graph paths should not restore retired path-click affordances."
);
assert.match(
  componentsSource,
  /\.income-impact-graph-path[\s\S]*stroke-width:\s*2;[\s\S]*vector-effect:\s*non-scaling-stroke;[\s\S]*shape-rendering:\s*geometricPrecision;/,
  "Main chart paths should render as thin, non-scaling, geometric-precision SVG strokes."
);
assert.match(
  componentsSource,
  /\.income-impact-graph-path--lifestyle-post-death-resources[\s\S]*stroke-dasharray:\s*7 6;[\s\S]*stroke-width:\s*1\.65;/,
  "Lifestyle comparison path should use a thinner, cleaner dash."
);
assert.match(
  componentsSource,
  /\.income-impact-layout[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/,
  "Income Impact visual layout should make the graph row full-width."
);
assert.match(
  componentsSource,
  /\.income-impact-graph-svg[\s\S]*min-height:\s*clamp\(18\.5rem, 40vh, 28rem\);[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/,
  "Income Impact graph should use a tighter viewport-aware height to reduce letterboxing."
);
assert.match(
  componentsSource,
  /\.income-impact-scenario-banner[\s\S]*position:\s*static;[\s\S]*padding:\s*0\.5rem 0\.72rem;[\s\S]*box-shadow:\s*none;/,
  "Scenario controls should keep their base static treatment before side-panel shaping."
);
assert.match(
  componentsSource,
  /\.income-impact-controls-panel\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*#ffffff\s*0%,\s*#f8fafc\s*100%\);[\s\S]*border:\s*1px solid rgba\(213,\s*221,\s*232,\s*0\.78\);[\s\S]*border-radius:\s*0\.65rem 0 0 0\.65rem;/,
  "Income Impact controls panel should be the white framed side-menu rail, not a card inside the content."
);
assert.match(
  componentsSource,
  /\.income-impact-controls-panel \.income-impact-scenario-banner[\s\S]*min-height:\s*100%;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/,
  "Scenario banner should flatten into the side-menu body."
);
assert.match(
  componentsSource,
  /\.income-impact-controls-panel \.income-impact-scenario-header,[\s\S]*\.income-impact-controls-panel \.income-impact-scenario-content[\s\S]*grid-template-columns:\s*1fr;/,
  "Scenario controls should become a single-column side-panel control stack."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-workspace-shell[\s\S]*grid-template-columns:\s*minmax\(9\.4rem,\s*10\.5rem\) minmax\(0,\s*1fr\) minmax\(10\.5rem,\s*12rem\);[\s\S]*align-items:\s*stretch;/,
  "Income Impact page shell should place scenario controls, the main display, and resource outlook in three stable columns."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.lens-workflow-pane[\s\S]*overflow:\s*hidden;[\s\S]*background:\s*#f1f4f9;/,
  "Income Impact page frame should use the reference grey background behind white chart surfaces."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-workspace-shell[\s\S]*background:\s*transparent;/,
  "Income Impact workspace shell should let the framed rail and center surfaces define the visible Client Directory-style frame."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-controls-panel[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*1;[\s\S]*position:\s*static;[\s\S]*align-self:\s*stretch;/,
  "Income Impact scenario controls should own and stretch in the left grid column."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-content-stack[\s\S]*grid-column:\s*2;[\s\S]*height:\s*100%;[\s\S]*padding:\s*0\.9rem clamp\(0\.95rem,\s*1\.45vw,\s*1\.15rem\) 0;[\s\S]*background:\s*#ffffff;[\s\S]*overflow-y:\s*auto;/,
  "Income Impact content should render to the right of the fixed side menu and own vertical scrolling."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.income-impact-insights-panel[\s\S]*grid-column:\s*3;[\s\S]*grid-row:\s*1;[\s\S]*height:\s*100%;[\s\S]*overflow-y:\s*auto;/,
  "Income Impact resource outlook should occupy the right rail and own its vertical scrolling."
);
assert.match(
  layoutSource,
  /body\[data-step="income-impact"\] \.lens-workflow-pane[\s\S]*display:\s*grid;[\s\S]*padding:\s*0;[\s\S]*overflow:\s*hidden;/,
  "Income Impact pane should be a fixed frame so the side menu does not scroll with the main content."
);

const fixture = {
  selectedDeath: { date: "2031-04-29", age: 51 },
  graphModel: makeGraphModel(),
  scenario: {
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionMonthIndex: 144,
        depletionDate: "2043-04-29"
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 600000,
      survivorAvailableTreatedAssets: 450000,
      coverageAdded: 400000,
      resourcesAfterObligations: 720000,
      monthsCovered: 144,
      depletionDate: "2043-04-29"
    },
    transitionOutlook: {
      windowDays: 90,
      windowMonths: 3,
      status: "Stable",
      fastAccessResources: 125000,
      nearTermResources: 250000,
      excludedResources: 900000,
      transitionNeed90Days: 100000,
      fastAccessCoverageRatio: 1.25,
      nearTermCoverageRatio: 3.75
    }
  },
  riskEvaluation: {
    events: [],
    stableEvents: []
  },
  financialRunway: {},
  dataGaps: [],
  warnings: []
};

const timelineHtml = harness.renderTimeline(fixture);
assert.match(timelineHtml, /data-income-impact-graph/);
assert.match(timelineHtml, /data-income-impact-graph-svg/);
assert.match(timelineHtml, /data-income-impact-transition-outlook-graph-annotation/);
assert.match(timelineHtml, /data-income-impact-transition-outlook-status="stable"/);
assert.match(timelineHtml, /data-income-impact-transition-outlook-annotation-line/);
assert.match(timelineHtml, /data-income-impact-transition-outlook-annotation-label/);
assert.match(timelineHtml, /data-income-impact-transition-outlook-window-months="3"/);
assert.match(timelineHtml, />First 3 Months: Stable<\/text>/);
const transitionOutlookLineTag = getSvgTag(timelineHtml, "line", "data-income-impact-transition-outlook-annotation-line");
const transitionOutlookLineStartX = getSvgNumericAttribute(transitionOutlookLineTag, "x1");
const transitionOutlookLineEndX = getSvgNumericAttribute(transitionOutlookLineTag, "x2");
assert.ok(
  transitionOutlookLineEndX > transitionOutlookLineStartX,
  "Transition Outlook annotation line should span forward from death."
);
assert.ok(
  transitionOutlookLineEndX - transitionOutlookLineStartX < 50,
  "Transition Outlook annotation line should stay scoped to the 3-month graph window instead of the full plot."
);
const transitionOutlookLabelShellTag = getSvgTag(timelineHtml, "rect", "data-income-impact-transition-outlook-annotation-label-shell");
assert.ok(
  getSvgNumericAttribute(transitionOutlookLabelShellTag, "x") >= transitionOutlookLineEndX + 6,
  "Transition Outlook status chip should sit to the right of the 3-month annotation line."
);
assert.doesNotMatch(timelineHtml, /data-income-impact-transition-band|data-income-impact-transition-window|data-income-impact-transition-slider|Transition period after death|transitionPeriodMonths|transitionBridge|flatBridge|not-modeled-v1/);
assert.match(timelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-bridge/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-net-worth/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-survivor-resources/);
assert.doesNotMatch(timelineHtml, /data-income-impact-death-event-conversion/);
assert.doesNotMatch(timelineHtml, /Conversion at death|Net worth at death|Starting funds after conversion/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-path="deathTransition"/);
assert.match(timelineHtml, /data-income-impact-death-conversion/);
assert.match(timelineHtml, /data-income-impact-death-conversion-gradient/);
assert.match(timelineHtml, /data-income-impact-death-conversion-spine/);
assert.match(timelineHtml, /data-income-impact-death-conversion-chevrons/);
assert.match(timelineHtml, /data-income-impact-death-conversion-markers/);
assert.equal(
  (timelineHtml.match(/data-income-impact-death-conversion-diamond(?:\s|>)/g) || []).length,
  1,
  "Death-event conversion connector should render one separate top diamond marker."
);
assert.equal(
  (timelineHtml.match(/data-income-impact-death-conversion-circle(?:\s|>)/g) || []).length,
  1,
  "Death-event conversion connector should render one separate circle marker."
);
assert.match(
  timelineHtml,
  /data-income-impact-death-conversion-circle-position-ratio="1"/,
  "Death-event conversion circle marker should sit at the bottom anchor of the connector."
);
assert.equal(
  (timelineHtml.match(/data-income-impact-death-conversion-chevron(?:\s|>)/g) || []).length,
  2,
  "Death-event conversion connector should render separate repositionable chevrons."
);
assert.doesNotMatch(
  timelineHtml,
  /data-income-impact-death-conversion[\s\S]*stroke-dasharray/,
  "Death-event conversion connector should not use the retired dotted path treatment."
);
assert.match(timelineHtml, /data-income-impact-graph-path="postDeathResources"/);
[
  ["Caution", "caution", "First 3 Months: Caution"],
  ["at-risk", "atRisk", "First 3 Months: At Risk"],
  ["likely-failure", "likelyFailure", "First 3 Months: Likely Failure"],
  ["insufficientData", "unavailable", "First 3 Months: Unavailable"],
  ["not-available", "unavailable", "First 3 Months: Unavailable"]
].forEach(function ([status, normalizedStatus, label]) {
  const statusTimelineHtml = harness.renderTimeline({
    ...fixture,
    scenario: {
      ...fixture.scenario,
      transitionOutlook: {
        ...fixture.scenario.transitionOutlook,
        status
      }
    }
  });
  assert.match(
    statusTimelineHtml,
    new RegExp(`data-income-impact-transition-outlook-status="${normalizedStatus}"[\\s\\S]*>${label}<\\/text>`)
  );
  assert.doesNotMatch(statusTimelineHtml, /data-income-impact-transition-band|data-income-impact-transition-slider|transitionPeriodMonths/);
});
const noOutlookTimelineHtml = harness.renderTimeline({
  ...fixture,
  scenario: {
    ...fixture.scenario,
    transitionOutlook: null
  }
});
assert.match(noOutlookTimelineHtml, /data-income-impact-transition-outlook-status="unavailable"[\s\S]*>First 3 Months: Unavailable<\/text>/);
assert.equal(
  getPathD(noOutlookTimelineHtml, "data-income-impact-graph-path", "postDeathResources"),
  getPathD(timelineHtml, "data-income-impact-graph-path", "postDeathResources"),
  "Transition Outlook graph annotation should not change the runway path data."
);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"|data-income-impact-graph-path="compression-post-death-resources"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-legend/);
assert.doesNotMatch(timelineHtml, /data-income-impact-comparison-markers|data-income-impact-compression-markers/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="death"[\s\S]*Death/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="plus-24"[\s\S]*\+2 years/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="plus-120"[\s\S]*\+10 years/);
assert.match(timelineHtml, /data-income-impact-graph-x-tick="plus-180"[\s\S]*\+15 years/);
assert.ok(
  (timelineHtml.match(/data-income-impact-graph-x-tick="/g) || []).length >= 9,
  "Income Impact graph should render denser x-axis increments across the visible horizon."
);
assert.match(timelineHtml, /data-income-impact-graph-x-tick-date="2031-04-29"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-x-tick="valuation"|data-income-impact-graph-x-tick="horizon"/);
assert.match(timelineHtml, /data-income-impact-graph-zero-baseline/);
assert.doesNotMatch(
  timelineHtml,
  /data-income-impact-layout-frame-mode/,
  "Renderer should preserve legacy graph behavior when layoutFrame is absent."
);
{
  const stableGraphModel = attachStableLayoutFrame(makeGraphModel());
  stableGraphModel.phases.deathEvent.xRatio = 0.42;
  stableGraphModel.phases.preDeath.endXRatio = 0.42;
  stableGraphModel.phases.postDeath.startXRatio = 0.42;
  stableGraphModel.axes.y.zeroYRatio = 0.48;
  stableGraphModel.axes.y.ticks = [
    { value: -125000, yRatio: 0.9 },
    { value: 0, yRatio: 0.48 },
    { value: 360000, yRatio: 0.18 },
    { value: 720000, yRatio: 0.02 }
  ];
  stableGraphModel.series.postDeathResources = [
    { date: "2031-04-29", monthIndex: 0, value: 720000, xRatio: 0.42, yRatio: 0.02 },
    { date: "2037-04-29", monthIndex: 72, value: 360000, xRatio: 0.58, yRatio: 0.18 },
    { date: "2043-04-29", monthIndex: 144, value: 0, xRatio: 0.84, yRatio: 0.48 }
  ];
  const stableHtml = harness.renderTimeline({
    ...fixture,
    graphModel: stableGraphModel
  });
  const stableDeathAxis = getSvgTag(stableHtml, "line", "data-income-impact-graph-death-axis");
  const stableZeroBaseline = getSvgTag(stableHtml, "line", "data-income-impact-graph-zero-baseline");
  assert.match(stableHtml, /data-income-impact-layout-frame-mode="stableRunoutAnchoredFrame"/);
  assert.equal(
    getSvgNumericAttribute(stableDeathAxis, "x1"),
    185,
    "Renderer should consume layoutFrame deathXRatio instead of dynamic phase death x."
  );
  assert.equal(
    getSvgNumericAttribute(stableZeroBaseline, "y1"),
    265,
    "Renderer should consume layoutFrame zeroYRatio instead of dynamic axis zero y."
  );
  const stablePath = getPathD(stableHtml, "data-income-impact-graph-path", "postDeathResources");
  assert.match(
    stablePath,
    /781 265/,
    "Furthest visible depletion should render at the stable runout anchor zone."
  );

  const stableRisingGraphModel = attachStableLayoutFrame(makeGraphModel(), {
    zeroCrossingAnchorScenarioId: null,
    zeroCrossingAnchorMonth: null,
    zeroCrossingAnchorSource: "projection-horizon",
    xDomainMonths: 240,
    yDomain: {
      min: -50000,
      max: 900000,
      signed: true,
      source: "axes.y"
    }
  });
  stableRisingGraphModel.phases.deathEvent.xRatio = 0.31;
  stableRisingGraphModel.axes.y.zeroYRatio = 0.91;
  stableRisingGraphModel.axes.y.ticks = [
    { value: 0, yRatio: 0.91 },
    { value: 450000, yRatio: 0.44 },
    { value: 900000, yRatio: 0.08 }
  ];
  stableRisingGraphModel.series.postDeathResources = [
    { date: "2031-04-29", monthIndex: 0, value: 600000, xRatio: 0.31, yRatio: 0.24 },
    { date: "2036-04-29", monthIndex: 60, value: 760000, xRatio: 0.52, yRatio: 0.18 },
    { date: "2041-04-29", monthIndex: 120, value: 880000, xRatio: 0.72, yRatio: 0.12 }
  ];
  const stableRisingHtml = harness.renderTimeline({
    ...fixture,
    graphModel: stableRisingGraphModel
  });
  assert.equal(
    getSvgNumericAttribute(getSvgTag(stableRisingHtml, "line", "data-income-impact-graph-death-axis"), "x1"),
    185,
    "Death marker should remain stable for rising/no-depletion resource lines."
  );
  assert.equal(
    getSvgNumericAttribute(getSvgTag(stableRisingHtml, "line", "data-income-impact-graph-zero-baseline"), "y1"),
    265,
    "Zero line should remain stable for rising/no-depletion resource lines."
  );
  assert.match(stableRisingHtml, />\$900k</, "Axis tick labels should still reflect the dynamic model domain.");

  const stableComparisonGraphModel = attachStableLayoutFrame(makeGraphModel(), {
    zeroCrossingAnchorScenarioId: "income-impact-lifestyle-adjusted-comparison",
    zeroCrossingAnchorMonth: 168,
    zeroCrossingAnchorSource: "manual-lifestyle-comparison-depletion",
    xDomainMonths: 210
  });
  stableComparisonGraphModel.series.postDeathResources = [
    { date: "2031-04-29", monthIndex: 0, value: 720000, xRatio: 0.25, yRatio: 0.02 },
    { date: "2043-04-29", monthIndex: 144, value: 0, xRatio: 0.9, yRatio: 0.48 }
  ];
  stableComparisonGraphModel.series.comparisonPostDeathResources = [
    {
      scenarioId: "income-impact-lifestyle-adjusted-comparison",
      kind: "lifestyleComparison",
      pathId: "lifestyle-post-death-resources",
      label: "Lifestyle-adjusted projection",
      pathMode: "linear",
      points: [
        { date: "2031-04-29", monthIndex: 0, value: 720000, xRatio: 0.25, yRatio: 0.02 },
        { date: "2045-04-29", monthIndex: 168, value: 0, xRatio: 0.96, yRatio: 0.48 }
      ]
    }
  ];
  const stableComparisonHtml = harness.renderTimeline({
    ...fixture,
    graphModel: stableComparisonGraphModel,
    compressionReporting: {
      lifestyleScenario: makeLifestyleScenarioFixture({
        sliderValue: -100,
        monthlyDelta: -500,
        depletionMonthIndex: 168,
        depletionDate: "2045-04-29",
        points: stableComparisonGraphModel.series.comparisonPostDeathResources[0].points
      })
    }
  });
  const stableBasePath = getPathD(stableComparisonHtml, "data-income-impact-graph-path", "postDeathResources");
  const stableComparisonPath = getPathD(stableComparisonHtml, "data-income-impact-graph-path", "lifestyle-post-death-resources");
  const stableBaseNumbers = (stableBasePath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const stableComparisonNumbers = (stableComparisonPath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  assert.ok(
    stableBaseNumbers[stableBaseNumbers.length - 2] < stableComparisonNumbers[stableComparisonNumbers.length - 2],
    "Baseline should cross zero before the stable runout anchor when lifestyle runs longer."
  );
  assert.equal(
    stableComparisonNumbers[stableComparisonNumbers.length - 2],
    781,
    "Later-running lifestyle comparison should cross zero at the stable runout anchor zone."
  );
}
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-marker-rule-id="survivor-resources-depleted"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-marker-rule-id="coverage-added-at-death"/);
assert.doesNotMatch(
  timelineHtml,
  /data-income-impact-graph-marker-rule-id="accumulated-unmet-need"/,
  "Accumulated unmet-need should be represented by the deficit area, not by a separate orange graph marker."
);
assert.doesNotMatch(timelineHtml, /Unmet need accumulates/);
assert.match(timelineHtml, /data-income-impact-graph-selected-event/);
assert.match(timelineHtml, /data-income-impact-graph-callout="resources-after-obligations"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-timeline-paused/);
assert.doesNotMatch(timelineHtml, /data-income-impact-runway-svg|data-income-impact-runway-line/);
const basePostDeathPath = getPathD(timelineHtml, "data-income-impact-graph-path", "postDeathResources");
assert.match(basePostDeathPath, /^M[^"]*\s(?:C\s|L[0-9.-])/, "Base post-death path should render with deterministic trend geometry.");
assert.match(timelineHtml, /data-income-impact-graph-hover-layer/);
const baseHoverGridLineCount = (timelineHtml.match(/data-income-impact-graph-hover-grid-line(?:\s|>)/g) || []).length;
const baseHoverIntervalCount = (timelineHtml.match(/data-income-impact-graph-hover-interval(?:\s|>)/g) || []).length;
assert.ok(baseHoverGridLineCount > 50, "Base timeline should render a dense inspection grid.");
assert.ok(baseHoverIntervalCount > 50, "Base timeline should render dense hover slots.");
assert.equal(baseHoverGridLineCount, baseHoverIntervalCount + 1, "Inspection grid lines should bracket fixed-width hover slots.");
assert.equal(
  (timelineHtml.match(/data-income-impact-graph-hover-readout(?:\s|>)/g) || []).length,
  baseHoverIntervalCount,
  "Each hover interval should carry a transient dollar readout."
);
assertAllEqual(
  getNumericAttributeValues(timelineHtml, "data-income-impact-graph-hover-interval-width"),
  8,
  "Hover interval width should remain fixed in SVG coordinates."
);
const baseGridLineY1Values = getNumericAttributeValues(timelineHtml, "data-income-impact-graph-hover-grid-line-y1");
const baseGridLineY2Values = getNumericAttributeValues(timelineHtml, "data-income-impact-graph-hover-grid-line-y2");
assert.equal(baseGridLineY1Values.length, baseHoverGridLineCount);
assert.equal(baseGridLineY2Values.length, baseHoverGridLineCount);
baseGridLineY1Values.forEach(function (y1, index) {
  assert.ok(y1 > 36, "Default inspection grid segments should start at the selected trendline, not at plot top.");
  assert.equal(baseGridLineY2Values[index], 354, "Default inspection grid segments should extend down to the plot bottom.");
  assert.ok(y1 < baseGridLineY2Values[index], "Default inspection grid segments should be visible below the selected trendline.");
});
assert.equal(
  (timelineHtml.match(/data-income-impact-graph-hover-underlay="selected-trendline"/g) || []).length,
  2,
  "Selected-scenario under-trendline tint should render path-matched pre-death and post-death areas, not per-interval trapezoids."
);
assert.ok(
  (timelineHtml.match(/data-income-impact-graph-hover-underlay-phase="postDeath"/g) || []).length > 0,
  "Under-trendline tint should render a post-death area."
);
const underTrendlineTintPath = getPathD(timelineHtml, "data-income-impact-graph-hover-underlay", "selected-trendline");
const underTrendlineTintNumbers = String(underTrendlineTintPath).match(/-?\d+(?:\.\d+)?/g).map(Number);
assert.notEqual(
  underTrendlineTintNumbers[1],
  baseGridLineY1Values[0],
  "Under-trendline tint should be derived from the selected trendline path, not the first hover grid divider."
);
assert.equal(
  underTrendlineTintNumbers[underTrendlineTintNumbers.length - 1],
  354,
  "Under-trendline tint should close at plot bottom, not above the selected trendline."
);
assert.equal(
  underTrendlineTintNumbers[underTrendlineTintNumbers.length - 3],
  354,
  "Under-trendline tint should extend downward through the plot area."
);
assert.match(timelineHtml, /data-income-impact-graph-hover-grid-line/);
assert.match(timelineHtml, /data-income-impact-graph-hover-slot/);
assert.match(timelineHtml, /data-income-impact-graph-hover-active-line/);
assert.doesNotMatch(timelineHtml, /data-income-impact-graph-hover-band/);
assert.match(timelineHtml, /tabindex="0"[\s\S]*role="button"/);
assert.doesNotMatch(
  timelineHtml,
  /data-income-impact-storyline-dot(?:\s|>)/,
  "Graph storyline dots should not render when financialStoryline graph dot candidates are missing."
);
const storylineDotFixture = JSON.parse(JSON.stringify(fixture));
storylineDotFixture.financialStoryline = {
  graphDotCandidates: [
    {
      id: "death-income-stops",
      family: "trigger",
      severity: "critical",
      graphLabel: "Death",
      displayLabel: "Death & Income Stops",
      evidenceLevel: "trace-backed",
      timing: { kind: "death-event", monthOffset: 0, date: "2031-04-29", label: "At death" }
    },
    {
      id: "cash-savings-depleted",
      family: "liquidity",
      severity: "caution",
      graphLabel: "Cash depleted",
      displayLabel: "Cash Savings Depleted",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 12, date: "2032-04-29", label: "Month 12" },
      amount: { value: 50000, label: "$50,000" }
    },
    {
      id: "housing-payment-at-risk",
      family: "housing",
      severity: "at-risk",
      graphLabel: "Housing at risk",
      displayLabel: "Housing Payment At Risk",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 24, date: "2033-04-29", label: "Month 24" },
      amount: { value: 2400, label: "$2,400/mo" }
    }
  ]
};
const storylineDotTimelineHtml = harness.renderTimeline(storylineDotFixture);
assert.equal(
  (storylineDotTimelineHtml.match(/data-income-impact-storyline-dot(?:\s|>)/g) || []).length,
  2,
  "Graph should render timed storyline graph dot candidates and reuse the death diamond instead of duplicating death."
);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-trendline-markers/);
assert.match(storylineDotTimelineHtml, /data-income-impact-death-conversion-diamond[\s\S]*data-income-impact-storyline-event-id="death-income-stops"/);
assert.doesNotMatch(storylineDotTimelineHtml, /<g\b(?=[^>]*data-income-impact-storyline-dot(?:\s|>))(?=[^>]*data-income-impact-storyline-event-id="death-income-stops")/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-event-id="cash-savings-depleted"/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-dot-tier="micro"/);
assert.match(storylineDotTimelineHtml, /income-impact-storyline-dot--micro/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-family="housing"/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-severity="at-risk"/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-evidence-level="estimated"/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-month-offset="24"/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-date="2033-04-29"/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-dot-readout/);
assert.match(storylineDotTimelineHtml, /Cash depleted/);
assert.match(storylineDotTimelineHtml, /Month 24/);
assert.match(storylineDotTimelineHtml, /\$2,400\/mo/);
assert.match(storylineDotTimelineHtml, /data-income-impact-storyline-dot[\s\S]*tabindex="0"[\s\S]*role="button"/);
const cashStorylineDot = getSvgGroupTagByAttribute(storylineDotTimelineHtml, "data-income-impact-storyline-event-id", "cash-savings-depleted");
const cashStorylineDotPosition = getTranslateCoordinates(cashStorylineDot);
assert.equal(cashStorylineDotPosition.x, 366, "Cash depletion dot should sit on the visible remaining-resources trendline x coordinate.");
assert.equal(cashStorylineDotPosition.y, 74, "Cash depletion dot should sit on the visible remaining-resources trendline y coordinate, not a lower event lane.");
assert.match(cashStorylineDot, /data-income-impact-storyline-coordinate-source="primary-trendline-exact"/);
const housingStorylineDot = getSvgGroupTagByAttribute(storylineDotTimelineHtml, "data-income-impact-storyline-event-id", "housing-payment-at-risk");
const housingStorylineDotPosition = getTranslateCoordinates(housingStorylineDot);
assert.equal(housingStorylineDotPosition.x, 401, "Housing pressure dot should interpolate its x coordinate from the graph timeline.");
assert.equal(housingStorylineDotPosition.y, 92, "Housing pressure dot should interpolate its y coordinate from the remaining-resources trendline.");
assert.match(housingStorylineDot, /data-income-impact-storyline-coordinate-source="primary-trendline-interpolated"/);
assert.notEqual(cashStorylineDotPosition.y, 316, "Storyline dots should not use the retired fixed lower event lane.");
assert.doesNotMatch(storylineDotTimelineHtml, /data-income-impact-story-card|data-income-impact-story-card-connector/);
assert.doesNotMatch(storylineDotTimelineHtml, /Emergency Savings Depleted|Retirement Accounts Tapped|Home Equity at Risk|Credit Crisis|Total Financial Collapse/);
const sameMonthStorylineDotFixture = JSON.parse(JSON.stringify(fixture));
sameMonthStorylineDotFixture.financialStoryline = {
  majorStoryCandidates: [
    {
      id: "taxable-assets-depleted",
      family: "liquidity",
      severity: "caution",
      cardTitle: "Taxable Assets Depleted",
      evidenceLevel: "calculated",
      timing: { kind: "month-offset", monthOffset: 36, label: "Month 36" }
    }
  ],
  graphDotCandidates: [
    {
      id: "taxable-assets-depleted",
      family: "liquidity",
      severity: "caution",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 0,
      graphLabel: "Taxable Assets Depleted",
      evidenceLevel: "calculated",
      candidateSource: "asset-depletion-ledger",
      timing: { kind: "month-offset", monthOffset: 36, label: "Month 36" },
      amount: { value: 12000, label: "$12,000" },
      trace: {
        candidateSource: "asset-depletion-ledger",
        bucketId: "taxable-brokerage",
        family: "taxableInvestments",
        ledgerEventType: "bucket-depleted",
        amountDepleted: 12000,
        withdrawalAmount: 8500,
        balanceBeforeWithdrawal: 12000
      }
    },
    {
      id: "education-savings-used-for-living-needs",
      family: "education",
      severity: "caution",
      dotTier: "micro",
      connectedToMajorCard: false,
      eligibleForConnector: false,
      majorCardIndex: null,
      graphLabel: "Education Savings Used",
      evidenceLevel: "calculated",
      candidateSource: "asset-depletion-ledger",
      timing: { kind: "month-offset", monthOffset: 36, label: "Month 36" },
      amount: { value: 24000, label: "$24,000" },
      trace: {
        candidateSource: "asset-depletion-ledger",
        bucketId: "education-529",
        family: "educationSavings",
        ledgerEventType: "bucket-tapped",
        amountAtTap: 24000,
        withdrawalAmount: 6500,
        balanceBeforeWithdrawal: 24000
      }
    }
  ]
};
const sameMonthStorylineDotHtml = harness.renderTimeline(sameMonthStorylineDotFixture);
assert.equal(
  (sameMonthStorylineDotHtml.match(/data-income-impact-storyline-dot(?:\s|>)/g) || []).length,
  1,
  "Same-month ledger events should render as one grouped marker at the true graph coordinate instead of fake x-offset dots."
);
const sameMonthGroupTag = getSvgGroupTagByAttribute(sameMonthStorylineDotHtml, "data-income-impact-storyline-event-id", "taxable-assets-depleted");
assert.match(sameMonthGroupTag, /data-income-impact-storyline-event-ids="taxable-assets-depleted education-savings-used-for-living-needs"/);
assert.match(sameMonthGroupTag, /data-income-impact-storyline-grouped="true"/);
assert.match(sameMonthGroupTag, /data-income-impact-storyline-group-count="2"/);
assert.match(sameMonthGroupTag, /data-income-impact-storyline-dot-tier="major"/);
assert.match(sameMonthStorylineDotHtml, /data-income-impact-storyline-dot-group-ring/);
assert.match(sameMonthStorylineDotHtml, /data-income-impact-storyline-dot-count-badge[^>]*>2<\/text>/);
assert.match(sameMonthStorylineDotHtml, /2 events in Month 36/);
assert.match(sameMonthStorylineDotHtml, /Taxable Assets Depleted/);
assert.match(sameMonthStorylineDotHtml, /Education Savings Used/);
assert.match(sameMonthStorylineDotHtml, /Bucket depleted/);
assert.match(sameMonthStorylineDotHtml, /Bucket tapped/);
assert.match(sameMonthStorylineDotHtml, /Taxable assets/);
assert.match(sameMonthStorylineDotHtml, /Education savings/);
assert.match(sameMonthStorylineDotHtml, /\$12,000/);
assert.match(sameMonthStorylineDotHtml, /\$24,000/);
assert.match(sameMonthStorylineDotHtml, /data-income-impact-storyline-connector-event-id="taxable-assets-depleted"/);
assert.doesNotMatch(
  sameMonthStorylineDotHtml,
  /data-income-impact-storyline-connector-event-id="education-savings-used-for-living-needs"/,
  "Micro ledger events should not receive story-card connectors when grouped with a major marker."
);
const cappedStorylineDotFixture = JSON.parse(JSON.stringify(fixture));
cappedStorylineDotFixture.financialStoryline = {
  graphDotCandidates: Array.from({ length: 18 }, function (_, index) {
    return {
      id: `storyline-dot-${index + 1}`,
      family: index % 2 === 0 ? "liquidity" : "support",
      severity: "caution",
      dotTier: "micro",
      connectedToMajorCard: false,
      eligibleForConnector: false,
      majorCardIndex: null,
      graphLabel: `Event ${index + 1}`,
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 12 + (index * 6), label: `Month ${12 + (index * 6)}` }
    };
  })
};
const cappedStorylineDotHtml = harness.renderTimeline(cappedStorylineDotFixture);
assert.equal(
  (cappedStorylineDotHtml.match(/data-income-impact-storyline-dot(?:\s|>)/g) || []).length,
  16,
  "Graph storyline dots should respect the candidate output cap."
);
const emptyStorylineDotHtml = harness.renderTimeline({
  ...fixture,
  financialStoryline: { graphDotCandidates: [] }
});
assert.doesNotMatch(
  emptyStorylineDotHtml,
  /data-income-impact-storyline-dot(?:\s|>)/,
  "Graph storyline dots should not render when graphDotCandidates is empty."
);
const unpositionedStorylineDotHtml = harness.renderTimeline({
  ...fixture,
  financialStoryline: {
    graphDotCandidates: [
      {
        id: "unpositioned-storyline-event",
        family: "liquidity",
        severity: "caution",
        dotTier: "micro",
        connectedToMajorCard: false,
        eligibleForConnector: false,
        graphLabel: "Unpositioned event",
        evidenceLevel: "estimated",
        timing: { kind: "month-offset", monthOffset: 6, label: "Month 6" }
      }
    ]
  }
});
assert.doesNotMatch(
  unpositionedStorylineDotHtml,
  /data-income-impact-storyline-dot(?:\s|>)/,
  "Graph storyline dots should suppress candidates without a trustworthy remaining-resources coordinate."
);
const shiftedRangeFixture = JSON.parse(JSON.stringify(fixture));
shiftedRangeFixture.selectedDeath = { date: "2036-04-29", age: 56 };
shiftedRangeFixture.graphModel.phases.deathEvent = { id: "deathEvent", date: "2036-04-29", xRatio: 0.42 };
shiftedRangeFixture.graphModel.series.postDeathResources = [
  { date: "2037-04-29", monthIndex: 12, value: 640000, xRatio: 0.48, yRatio: 0.12 },
  { date: "2044-04-29", monthIndex: 96, value: 120000, xRatio: 0.68, yRatio: 0.58 },
  { date: "2047-04-29", monthIndex: 132, value: -80000, xRatio: 0.84, yRatio: 0.76 }
];
const shiftedRangeHtml = harness.renderTimeline(shiftedRangeFixture);
assertAllEqual(
  getNumericAttributeValues(shiftedRangeHtml, "data-income-impact-graph-hover-interval-width"),
  8,
  "Hover interval width should remain fixed after the chart range changes."
);
const negativeIntervalFixture = JSON.parse(JSON.stringify(fixture));
negativeIntervalFixture.graphModel.series.postDeathResources = [
  { date: "2040-04-29", monthIndex: 108, value: -10000, xRatio: 0.72, yRatio: 0.7 },
  { date: "2043-04-29", monthIndex: 144, value: -90000, xRatio: 0.8647963801, yRatio: 0.82 }
];
const negativeIntervalHtml = harness.renderTimeline(negativeIntervalFixture);
assert.match(negativeIntervalHtml, /data-income-impact-graph-hover-value="-\d/);
assert.match(negativeIntervalHtml, /data-income-impact-graph-hover-label="-\$[0-9,]+"/);
assert.match(
  displaySource,
  /function roundAxisTickToNearestFiveThousand/,
  "Income Impact display should keep y-axis label rounding in an explicit helper."
);
assert.match(timelineHtml, />-\$125k</, "Negative y-axis labels should round to the nearest $5k increment.");
assert.match(timelineHtml, />\$0</, "$0 should remain exact on the y-axis.");
assert.match(timelineHtml, />\$460k</, "Positive y-axis labels should round up to the nearest $5k increment.");
assert.match(timelineHtml, />\$450k</, "Positive y-axis labels should round down to the nearest $5k increment.");
assert.doesNotMatch(
  timelineHtml,
  />-\$123k|>\$458k|>\$452k/,
  "Y-axis labels should not expose unrounded compact tick values."
);

const multiAppliedGraphModel = makeGraphModel();
const survivorResourcesStartXRatio = multiAppliedGraphModel.phases.deathEvent.xRatio;
const selectedSurvivorResourcesPoint = {
  id: "postDeathResources-survivor-resources-at-death",
  date: "2042-04-29",
  monthIndex: 0,
  value: 720000,
  xRatio: survivorResourcesStartXRatio,
  yRatio: 0.09,
  trace: {
    visualStartPoint: true,
    displayRole: "postDeathRunwayStart"
  }
};
const selectedZeroPoint = { date: "2042-04-29", monthIndex: 132, value: 0, xRatio: 0.84, yRatio: multiAppliedGraphModel.axes.y.zeroYRatio };
const selectedRawPoints = multiAppliedGraphModel.series.postDeathResources;
const selectedPreDeathContextPoints = [
  { date: "2037-04-29", monthIndex: 72, value: 620000, xRatio: 0.04, yRatio: 0.19 },
  { date: "2042-04-29", monthIndex: 132, value: 760000, xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio, yRatio: 0.12 }
];
const secondRawPoints = [
  { date: "2027-04-29", monthIndex: 12, value: 610000, xRatio: 0.2, yRatio: 0.16 },
  { date: "2036-04-29", monthIndex: 120, value: 90000, xRatio: 0.68, yRatio: 0.6 },
  { date: "2041-04-29", monthIndex: 180, value: -130000, xRatio: 0.86, yRatio: 0.78 }
];
const secondZeroPoint = { date: "2039-04-29", monthIndex: 156, value: 0, xRatio: 0.78, yRatio: multiAppliedGraphModel.axes.y.zeroYRatio };
const secondPreDeathContextPoints = [
  { date: "2026-04-29", monthIndex: 0, value: 500000, xRatio: 0.02, yRatio: 0.24 },
  { date: "2031-04-29", monthIndex: 60, value: 600000, xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio, yRatio: 0.14 }
];
const secondSurvivorResourcesPoint = {
  id: "postDeathResources--scenario-2-survivor-resources-at-death",
  date: "2031-04-29",
  monthIndex: 0,
  value: 610000,
  xRatio: survivorResourcesStartXRatio,
  yRatio: 0.16,
  trace: {
    visualStartPoint: true,
    displayRole: "postDeathRunwayStart"
  }
};
multiAppliedGraphModel.series.appliedPostDeathResources = [
  {
    scenarioId: "income-impact-death-in-5-years",
    label: "Death in 5 years",
    pathId: "postDeathResources",
    selected: true,
    points: selectedRawPoints
  },
  {
    scenarioId: "income-impact-current-scenario",
    label: "Death tomorrow",
    pathId: "postDeathResources--scenario-2",
    selected: false,
    points: secondRawPoints
  }
];
multiAppliedGraphModel.series.appliedRunwayScenarios = [
  {
    scenarioId: "income-impact-death-in-5-years",
    label: "Death in 5 years",
    pathId: "postDeathResources",
    preDeathPathId: "preDeathAssets",
    pathMode: "linear",
    preDeathPathMode: "linear",
    scenarioRole: "baseline",
    selected: true,
    rawPoints: selectedRawPoints,
    preDeathContextPoints: selectedPreDeathContextPoints,
    projectedNetWorthAtDeath: 760000,
    deathLineLabel: "Death in 5 years",
    deathLineAnchor: {
      scenarioId: "income-impact-death-in-5-years",
      label: "Death in 5 years",
      scenarioRole: "baseline",
      selected: true,
      xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio,
      yRatio: 0.12,
      value: 760000,
      date: "2042-04-29"
    },
    survivorResourcesAtDeathPoint: selectedSurvivorResourcesPoint,
    fundedRunwayPoints: [selectedSurvivorResourcesPoint].concat(selectedRawPoints.slice(0, 2), [selectedZeroPoint]),
    deficitPoints: [selectedZeroPoint, selectedRawPoints[2]],
    depletionPoint: selectedZeroPoint,
    trace: {
      rawValuesPreserved: true,
      depletionDatePreserved: true
    }
  },
  {
    scenarioId: "income-impact-current-scenario",
    label: "Death tomorrow",
    pathId: "postDeathResources--scenario-2",
    preDeathPathId: "preDeathAssets--scenario-2",
    pathMode: "linear",
    preDeathPathMode: "linear",
    scenarioRole: "comparison",
    selected: false,
    rawPoints: secondRawPoints,
    preDeathContextPoints: secondPreDeathContextPoints,
    projectedNetWorthAtDeath: 600000,
    deathLineLabel: "Death tomorrow",
    deathLineAnchor: {
      scenarioId: "income-impact-current-scenario",
      label: "Death tomorrow",
      scenarioRole: "comparison",
      selected: false,
      xRatio: multiAppliedGraphModel.phases.deathEvent.xRatio,
      yRatio: 0.14,
      value: 600000,
      date: "2031-04-29"
    },
    survivorResourcesAtDeathPoint: secondSurvivorResourcesPoint,
    fundedRunwayPoints: [secondSurvivorResourcesPoint].concat(secondRawPoints.slice(0, 2), [secondZeroPoint]),
    deficitPoints: [secondZeroPoint, secondRawPoints[2]],
    depletionPoint: secondZeroPoint,
    trace: {
      rawValuesPreserved: true,
      depletionDatePreserved: true
    }
  }
];
multiAppliedGraphModel.series.appliedScenarioKeyItems = [
  {
    scenarioId: "income-impact-death-in-5-years",
    label: "Death in 5 years",
    selected: true
  },
  {
    scenarioId: "income-impact-current-scenario",
    label: "Death tomorrow",
    selected: false
  }
];
const multiAppliedTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: multiAppliedGraphModel
});
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="postDeathResources--scenario-2"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-runway-source="fundedRunwayPoints"/);
assert.doesNotMatch(
  multiAppliedTimelineHtml,
  /data-income-impact-death-event-bridge|data-income-impact-death-event-conversion|Conversion at death|Net worth at death|Starting funds after conversion/,
  "Death-event conversion annotation should not render for selected or non-selected scenarios."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-death-conversion(?:\s|>)/g) || []).length,
  1,
  "Only the selected applied scenario should render one death-event conversion connector."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-death-conversion-diamond(?:\s|>)/g) || []).length,
  1,
  "Hidden applied scenarios should not create extra conversion diamond markers."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-death-conversion-circle(?:\s|>)/g) || []).length,
  1,
  "Hidden applied scenarios should not create extra conversion circle markers."
);
const multiAppliedHoverGridLineCount = (multiAppliedTimelineHtml.match(/data-income-impact-graph-hover-grid-line(?:\s|>)/g) || []).length;
const multiAppliedHoverIntervalCount = (multiAppliedTimelineHtml.match(/data-income-impact-graph-hover-interval(?:\s|>)/g) || []).length;
assert.ok(multiAppliedHoverGridLineCount > 50, "Only the selected applied scenario should render a dense inspection grid.");
assert.ok(multiAppliedHoverIntervalCount > 50, "Only the selected applied scenario should render dense hover slots.");
assert.equal(
  multiAppliedHoverGridLineCount,
  multiAppliedHoverIntervalCount + 1,
  "Selected scenario grid lines should bracket fixed-width hover slots."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-hover-underlay="selected-trendline"/g) || []).length,
  2,
  "Comparison scenarios should not create extra under-trendline tint areas."
);
assert.ok(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-hover-underlay-phase="preDeath"/g) || []).length > 0,
  "Selected applied scenario tint should render blue-family pre-death segments."
);
assert.ok(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-hover-underlay-phase="postDeath"/g) || []).length > 0,
  "Selected applied scenario tint should render green-family post-death segments."
);
assert.match(
  getGraphHoverGridLineTag(multiAppliedTimelineHtml, 290),
  /data-income-impact-graph-hover-grid-line-y1="75"/,
  "Pre-death hover grid boundary should follow the selected blue pre-death trendline before the death line."
);
assert.match(
  getGraphHoverGridLineTag(multiAppliedTimelineHtml, 298),
  /data-income-impact-graph-hover-grid-line-y1="65"/,
  "Post-death hover grid boundary should switch to the selected green runway trendline at/after death."
);
assert.match(
  multiAppliedTimelineHtml,
  /<g\b(?=[^>]*data-income-impact-graph-hover-interval)(?=[^>]*data-income-impact-applied-scenario-id="income-impact-death-in-5-years")/,
  "Selected scenario should own the visible hover layer."
);
assert.doesNotMatch(
  multiAppliedTimelineHtml,
  /<g\b(?=[^>]*data-income-impact-graph-hover-interval)(?=[^>]*data-income-impact-applied-scenario-id="income-impact-current-scenario")/,
  "Comparison scenarios should not create extra hover intervals."
);
assert.match(
  getDeathConversionConnectorTag(multiAppliedTimelineHtml),
  /data-income-impact-applied-scenario-id="income-impact-death-in-5-years"/,
  "Selected applied scenario should own the visible death-event conversion connector."
);
assert.doesNotMatch(
  getDeathConversionConnectorTag(multiAppliedTimelineHtml),
  /data-income-impact-applied-scenario-id="income-impact-current-scenario"/,
  "Hidden applied scenarios should not render extra death-event conversion connectors."
);
{
  const selectedAppliedPathD = getPathD(multiAppliedTimelineHtml, "data-income-impact-graph-path", "postDeathResources");
  const selectedAppliedPathStartX = Number((selectedAppliedPathD.match(/^M(-?\d+(?:\.\d+)?)/) || [])[1]);
  const expectedSurvivorStartX = 74 + (884 * survivorResourcesStartXRatio);
  assert.ok(
    Number.isFinite(selectedAppliedPathStartX) && Math.abs(selectedAppliedPathStartX - expectedSurvivorStartX) <= 0.12,
    "Selected post-death runway should start from the survivor-resources point on the fixed death axis."
  );
}
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path="preDeathAssets--scenario-2"/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-graph-path="preDeathAssets"[\s\S]*data-income-impact-pre-death-source="preDeathContextPoints"/,
  "Selected applied scenario should render its pre-death net worth context from the runway contract."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-death-line-label="Death in 5 years"/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-graph-path="preDeathAssets--scenario-2"[\s\S]*data-income-impact-death-line-label="Death tomorrow"/,
  "Comparison pre-death path metadata should preserve its death-line label."
);
assert.doesNotMatch(
  multiAppliedTimelineHtml,
  /<g\b(?=[^>]*data-income-impact-death-line-anchor)[^>]*data-income-impact-applied-scenario-id="income-impact-current-scenario"/,
  "Comparison scenarios should not render a visible death-line anchor."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-death-line-anchor[\s\S]*Death in 5 years/);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-death-line-anchor(?:\s|>)/g) || []).length,
  1,
  "Only the selected applied scenario should render a death-line anchor."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-path-mode="linear"/);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-path="postDeathResources(?:--scenario-2)?"/g) || []).length,
  2,
  "Selected and comparison applied scenario paths should render together."
);
const selectedRunwayPath = getPathD(multiAppliedTimelineHtml, "data-income-impact-graph-path", "postDeathResources");
const selectedRunwayYValues = getPathYValues(selectedRunwayPath);
const zeroY = 36 + (multiAppliedGraphModel.axes.y.zeroYRatio * 318);
assert.ok(
  Math.max(...selectedRunwayYValues) <= zeroY + 0.75,
  "Selected funded runway path should stop at zero and should not include below-zero y coordinates."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-deficit-area="postDeathDeficitArea--selected"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-deficit-source="deficitPoints"/);
{
  const selectedDeficitPath = getPathD(multiAppliedTimelineHtml, "data-income-impact-graph-deficit-area", "postDeathDeficitArea--selected");
  const selectedRunwayCoordinates = (selectedRunwayPath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const selectedDeficitCoordinates = (selectedDeficitPath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  assert.equal(
    selectedDeficitCoordinates[0],
    selectedRunwayCoordinates[selectedRunwayCoordinates.length - 2],
    "Deficit area should start from the same depletion x-coordinate as the funded runway endpoint."
  );
  assert.equal(
    selectedDeficitCoordinates[1],
    selectedRunwayCoordinates[selectedRunwayCoordinates.length - 1],
    "Deficit area should start from the same depletion y-coordinate as the funded runway endpoint."
  );
}
assert.match(multiAppliedTimelineHtml, /Required support after resources run out/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-deficit-label/);
assert.match(multiAppliedTimelineHtml, /Required support[\s\S]*after resources run out/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-graph-deficit-area="postDeathDeficitArea--selected"[\s\S]*data-income-impact-applied-scenario-id="income-impact-death-in-5-years"/,
  "Only the selected applied scenario should own the filled deficit area."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-graph-deficit-area=/g) || []).length,
  1,
  "V1 should render one selected-scenario deficit area, not a filled area for every scenario."
);
const continuousDeficitGraphModel = makeGraphModel();
continuousDeficitGraphModel.axes.y.zeroYRatio = 0.5;
const continuousDeficitZeroPoint = { date: "2038-04-29", monthIndex: 84, value: 0, xRatio: 0.6, yRatio: continuousDeficitGraphModel.axes.y.zeroYRatio };
continuousDeficitGraphModel.series.appliedRunwayScenarios = [
  {
    scenarioId: "income-impact-continuous-deficit",
    label: "Continuous deficit",
    pathId: "postDeathResources",
    selected: true,
    rawPoints: [
      { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
      continuousDeficitZeroPoint,
      { date: "2039-04-29", monthIndex: 96, value: -900000, xRatio: 0.72, yRatio: 0.62 },
      { date: "2040-04-29", monthIndex: 108, value: -1500000, xRatio: 0.84, yRatio: 0.78 },
      { date: "2041-04-29", monthIndex: 120, value: -2400000, xRatio: 0.96, yRatio: 0.94 }
    ],
    fundedRunwayPoints: [
      { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
      continuousDeficitZeroPoint
    ],
    deficitPoints: [
      continuousDeficitZeroPoint,
      { date: "2039-04-29", monthIndex: 96, value: -900000, xRatio: 0.72, yRatio: 0.62 },
      { date: "2040-04-29", monthIndex: 108, value: -1500000, xRatio: 0.84, yRatio: 0.78 },
      { date: "2041-04-29", monthIndex: 120, value: -2400000, xRatio: 0.96, yRatio: 0.94 }
    ],
    depletionPoint: continuousDeficitZeroPoint,
    trace: {
      rawValuesPreserved: true,
      depletionDatePreserved: true
    }
  }
];
const continuousDeficitTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: continuousDeficitGraphModel
});
const continuousDeficitAreaPath = getPathD(continuousDeficitTimelineHtml, "data-income-impact-graph-deficit-area", "postDeathDeficitArea--selected");
const continuousDeficitFinalY = 36 + (0.94 * 318);
const continuousDeficitFinalYCount = getPathYValues(continuousDeficitAreaPath).filter(function (value) {
  return Math.abs(value - continuousDeficitFinalY) < 0.01;
}).length;
assert.equal(
  continuousDeficitFinalYCount,
  1,
  "Continuous deficit area should include the final raw deficit point instead of stopping at a compressed clipping boundary."
);
assert.equal(
  (multiAppliedTimelineHtml.match(/data-income-impact-runway-depletion-marker(?:\s|>)/g) || []).length,
  2,
  "Selected and comparison depleted applied scenarios should render depletion markers."
);
const selectedDepletionMarkerTag = getRunwayDepletionMarkerTag(
  multiAppliedTimelineHtml,
  "income-impact-death-in-5-years"
);
assert.match(selectedDepletionMarkerTag, /data-income-impact-applied-scenario-label="Death in 5 years"/);
assert.match(selectedDepletionMarkerTag, /data-income-impact-applied-scenario-selected="true"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-runway-depletion-label[\s\S]*Runs out/);
assert.match(multiAppliedTimelineHtml, /aria-label="Death in 5 years: Resources depleted"/);
assert.match(multiAppliedTimelineHtml, /aria-label="Death tomorrow: Resources depleted"/);
assert.equal(
  multiAppliedGraphModel.series.appliedRunwayScenarios[0].rawPoints.some(function (point) { return point.value < 0; }),
  true,
  "Raw negative values should remain preserved in the graph model contract."
);
assert.match(multiAppliedTimelineHtml, /data-income-impact-scenario-select="income-impact-death-in-5-years"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-scenario-select="income-impact-current-scenario"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-applied-scenario-id="income-impact-death-in-5-years"/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-applied-scenario-id="income-impact-current-scenario"/);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-applied-scenario-id="income-impact-death-in-5-years"[^>]*data-income-impact-applied-scenario-selected="true"/,
  "Selected scenario path should be marked for visible active-state styling."
);
assert.match(
  multiAppliedTimelineHtml,
  /data-income-impact-applied-scenario-id="income-impact-current-scenario"[^>]*data-income-impact-applied-scenario-selected="false"/,
  "Non-selected scenario key item should remain available but inactive."
);
assert.match(multiAppliedTimelineHtml, /Death in 5 years/);
assert.match(multiAppliedTimelineHtml, /Death tomorrow/);
assert.match(multiAppliedTimelineHtml, /data-income-impact-graph-legend/);
assert.doesNotMatch(multiAppliedTimelineHtml, /Manual lifestyle comparison only - primary path unchanged\./);
assert.doesNotMatch(multiAppliedTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/);

multiAppliedGraphModel.series.appliedRunwayScenarios[0].selected = false;
multiAppliedGraphModel.series.appliedRunwayScenarios[1].selected = true;
multiAppliedGraphModel.series.appliedScenarioKeyItems[0].selected = false;
multiAppliedGraphModel.series.appliedScenarioKeyItems[1].selected = true;
multiAppliedGraphModel.trace = Object.assign({}, multiAppliedGraphModel.trace, {
  selectedScenarioId: "income-impact-current-scenario"
});
const switchedSelectedTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: multiAppliedGraphModel
});
assert.match(
  switchedSelectedTimelineHtml,
  /data-income-impact-graph-deficit-area="postDeathDeficitArea--selected"[\s\S]*data-income-impact-applied-scenario-id="income-impact-current-scenario"/,
  "Selected deficit area should move when the selected applied scenario changes."
);
assert.match(
  getRunwayDepletionMarkerTag(switchedSelectedTimelineHtml, "income-impact-current-scenario"),
  /data-income-impact-applied-scenario-selected="true"/,
  "Selected depletion marker should move when the selected applied scenario changes."
);
assert.doesNotMatch(
  switchedSelectedTimelineHtml,
  /<g\b(?=[^>]*data-income-impact-runway-depletion-marker)(?=[^>]*data-income-impact-applied-scenario-id="income-impact-death-in-5-years")(?=[^>]*data-income-impact-applied-scenario-selected="true")/,
  "Previously selected depletion marker should remain only as an inactive comparison marker after selection changes."
);
assert.doesNotMatch(switchedSelectedTimelineHtml, /data-income-impact-death-event-bridge/);
assert.match(
  getDeathConversionConnectorTag(switchedSelectedTimelineHtml),
  /data-income-impact-applied-scenario-id="income-impact-current-scenario"/,
  "Death-event conversion connector should move when the selected applied scenario changes."
);
assert.equal(
  (switchedSelectedTimelineHtml.match(/data-income-impact-death-conversion(?:\s|>)/g) || []).length,
  1,
  "Switching the selected scenario should still render only one death-event conversion connector."
);
assert.equal(
  (switchedSelectedTimelineHtml.match(/data-income-impact-death-conversion-diamond(?:\s|>)/g) || []).length,
  1,
  "Switching the selected scenario should still render only one conversion diamond marker."
);
assert.equal(
  (switchedSelectedTimelineHtml.match(/data-income-impact-death-conversion-circle(?:\s|>)/g) || []).length,
  1,
  "Switching the selected scenario should still render only one conversion circle marker."
);
const switchedSelectedHoverGridLineCount = (switchedSelectedTimelineHtml.match(/data-income-impact-graph-hover-grid-line(?:\s|>)/g) || []).length;
const switchedSelectedHoverIntervalCount = (switchedSelectedTimelineHtml.match(/data-income-impact-graph-hover-interval(?:\s|>)/g) || []).length;
assert.ok(switchedSelectedHoverGridLineCount > 50, "Switching the selected scenario should refresh a dense inspection grid.");
assert.ok(switchedSelectedHoverIntervalCount > 50, "Switching the selected scenario should refresh dense hover slots.");
assert.equal(
  switchedSelectedHoverGridLineCount,
  switchedSelectedHoverIntervalCount + 1,
  "Switched selected scenario grid lines should bracket fixed-width hover slots."
);
assert.equal(
  (switchedSelectedTimelineHtml.match(/data-income-impact-graph-hover-underlay="selected-trendline"/g) || []).length,
  2,
  "Switching selected scenarios should refresh the selected scenario tint areas."
);
assert.match(
  switchedSelectedTimelineHtml,
  /<g\b(?=[^>]*data-income-impact-graph-hover-interval)(?=[^>]*data-income-impact-applied-scenario-id="income-impact-current-scenario")/,
  "Hover intervals should move to the newly selected scenario."
);
assert.doesNotMatch(
  switchedSelectedTimelineHtml,
  /<g\b(?=[^>]*data-income-impact-graph-hover-interval)(?=[^>]*data-income-impact-applied-scenario-id="income-impact-death-in-5-years")/,
  "Previously selected scenarios should not keep hover intervals after selection changes."
);

const currentGraphModel = makeGraphModel();
const currentComparisonPoints = currentGraphModel.series.postDeathResources.map((point) => ({ ...point }));
currentGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    pathMode: "linear",
    points: currentComparisonPoints
  }
];
const currentTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: currentGraphModel,
  compressionReporting: {
    lifestyleScenario: makeLifestyleScenarioFixture({
      sliderValue: 0,
      monthlyDelta: 0,
      depletionMonthIndex: 144,
      depletionDate: "2043-04-29",
      points: currentComparisonPoints
    }),
    trace: {
      lifestyleSliderValue: 0
    }
  }
});
assert.doesNotMatch(
  currentTimelineHtml,
  /data-income-impact-lifestyle-impact-readout/,
  "Scenario impact readout should render in the summary strip, not inside the timeline graph."
);
assert.doesNotMatch(
  currentTimelineHtml,
  /data-income-impact-graph-path="lifestyle-post-death-resources"/,
  "Neutral/equivalent lifestyle comparison should not render a dashed duplicate path."
);
assert.doesNotMatch(
  currentTimelineHtml,
  /Manual lifestyle comparison only - primary path unchanged\./,
  "Neutral/equivalent lifestyle comparison should not add comparison legend copy."
);

const comparisonGraphModel = makeGraphModel();
const conservativeComparisonPoints = [
  { date: "2032-04-29", monthIndex: 12, value: 680000, xRatio: 0.33, yRatio: 0.1 },
  { date: "2040-04-29", monthIndex: 108, value: 280000, xRatio: 0.72, yRatio: 0.44 },
  { date: "2043-04-29", monthIndex: 144, value: 60000, xRatio: 0.9, yRatio: 0.64 },
  { date: "2045-04-29", monthIndex: 168, value: -20000, xRatio: 0.96, yRatio: 0.7 }
];
comparisonGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    pathMode: "linear",
    points: conservativeComparisonPoints
  }
];
comparisonGraphModel.comparisonMarkers = [
  {
    id: "income-impact-lifestyle-adjusted-comparison-action",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "comparisonAction",
    label: "Lifestyle adjustment",
    summary: "Lifestyle adjustment represented in the comparison scenario.",
    positionable: true,
    xRatio: 0.33,
    yRatio: 0.1
  },
  {
    id: "income-impact-lifestyle-adjusted-comparison-pause",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "comparisonPause",
    label: "Lifestyle pause",
    summary: "Lifestyle pause represented in the comparison scenario.",
    positionable: true,
    xRatio: 0.33,
    yRatio: 0.1
  },
  {
    id: "income-impact-expense-compression-alternate-base-depletion",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "baseDepletion",
    label: "Base depletion",
    summary: "Base projection depletion point.",
    positionable: true,
    xRatio: 0.9,
    yRatio: 0.68
  },
  {
    id: "income-impact-lifestyle-adjusted-comparison-lifestyle-depletion",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "lifestyleDepletion",
    label: "Lifestyle depletion",
    summary: "Lifestyle comparison depletion point.",
    positionable: true,
    xRatio: 0.96,
    yRatio: 0.68
  },
  {
    id: "income-impact-lifestyle-adjusted-comparison-shortfall-remains",
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "comparison",
    markerType: "shortfallRemains",
    label: "Shortfall remains",
    summary: "Lifestyle comparison still shows remaining shortfall.",
    positionable: true,
    xRatio: 0.96,
    yRatio: 0.68
  }
];
const comparisonTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: comparisonGraphModel,
  compressionReporting: {
    lifestyleScenario: makeLifestyleScenarioFixture({
      sliderValue: -100,
      monthlyDelta: -500,
      depletionMonthIndex: 168,
      depletionDate: "2045-04-29",
      points: conservativeComparisonPoints
    }),
    trace: {
      lifestyleSliderValue: -100
    }
  }
});
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="postDeathResources"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/);
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-graph-path="lifestyle-post-death-resources"/g) || []).length,
  1,
  "Only one lifestyle comparison path should render."
);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"[^>]*data-income-impact-graph-path-mode="linear"/);
assert.match(comparisonTimelineHtml, /data-income-impact-graph-legend/);
assert.match(comparisonTimelineHtml, /Projected path/);
assert.match(comparisonTimelineHtml, /Lifestyle-adjusted projection/);
assert.match(comparisonTimelineHtml, /Manual lifestyle comparison only - primary path unchanged\./);
assert.doesNotMatch(
  comparisonTimelineHtml,
  /data-income-impact-lifestyle-impact-readout|data-income-impact-lifestyle-impact-mode="conservative"|Extends runway by 24 months|Lifestyle spend: -\$500\/mo|Depletion shift: \+24 months/,
  "Scenario impact readout details should render in the summary strip, not inside the timeline graph."
);
assert.doesNotMatch(comparisonTimelineHtml, /staged-compression-post-death-resources|data-income-impact-graph-detail="compression-early-window"|data-income-impact-detail-path="staged-compression"/);
assert.doesNotMatch(comparisonTimelineHtml, /compression-post-death-resources|data-income-impact-compression-markers|data-income-impact-compression-marker/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-markers/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="comparisonAction"/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="comparisonPause"/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="baseDepletion"/);
assert.match(comparisonTimelineHtml, /data-income-impact-comparison-marker-type="lifestyleDepletion"/);
assert.doesNotMatch(
  comparisonTimelineHtml,
  /data-income-impact-comparison-marker-type="shortfallRemains"/,
  "Accumulated unmet-need/shortfall marker should not render a separate graph dot."
);
assert.match(comparisonTimelineHtml, /Lifestyle adjustment/);
assert.match(comparisonTimelineHtml, /Lifestyle pause/);
assert.match(comparisonTimelineHtml, /Base depletion/);
assert.match(comparisonTimelineHtml, /Lifestyle depletion/);
assert.doesNotMatch(comparisonTimelineHtml, /Shortfall remains/);
const repeatedComparisonTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: comparisonGraphModel
});
const immediatePath = getPathD(comparisonTimelineHtml, "data-income-impact-graph-path", "lifestyle-post-death-resources");
const repeatedImmediatePath = getPathD(repeatedComparisonTimelineHtml, "data-income-impact-graph-path", "lifestyle-post-death-resources");
assert.match(immediatePath, /^M[^"]*\s(?:C\s|L[0-9.-])/, "Lifestyle comparison path should render with deterministic trend geometry.");
assert.equal(immediatePath, repeatedImmediatePath, "Trend comparison path output should be deterministic.");
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-graph-marker/g) || []).length,
  (timelineHtml.match(/data-income-impact-graph-marker/g) || []).length,
  "Lifestyle comparison markers should not be rendered as existing risk/stable graph markers."
);
assert.equal(
  (comparisonTimelineHtml.match(/data-income-impact-comparison-marker(?:\s|>)/g) || []).length,
  4,
  "Rendered comparison markers should omit the accumulated unmet-need/shortfall dot while preserving the other comparison markers."
);

const elevatedGraphModel = makeGraphModel();
const elevatedComparisonPoints = [
  { date: "2032-04-29", monthIndex: 12, value: 590000, xRatio: 0.33, yRatio: 0.16 },
  { date: "2040-04-29", monthIndex: 108, value: 30000, xRatio: 0.72, yRatio: 0.66 },
  { date: "2042-04-29", monthIndex: 132, value: -60000, xRatio: 0.86, yRatio: 0.74 }
];
elevatedGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    points: elevatedComparisonPoints
  }
];
const elevatedTimelineHtml = harness.renderTimeline({
  ...fixture,
  graphModel: elevatedGraphModel,
  compressionReporting: {
    lifestyleScenario: makeLifestyleScenarioFixture({
      sliderValue: 100,
      monthlyDelta: 400,
      depletionMonthIndex: 132,
      depletionDate: "2042-04-29",
      points: elevatedComparisonPoints
    }),
    trace: {
      lifestyleSliderValue: 100
    }
  }
});
assert.doesNotMatch(
  elevatedTimelineHtml,
  /data-income-impact-lifestyle-impact-readout|data-income-impact-lifestyle-impact-mode="elevated"|Shortens runway by 12 months|Lifestyle spend: \+\$400\/mo|Depletion shift: -12 months/,
  "Scenario impact readout details should render in the summary strip, not inside the timeline graph."
);
assert.match(elevatedTimelineHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/);
assert.doesNotMatch(elevatedTimelineHtml, /data-income-impact-graph-path="compression-post-death-resources"|staged-compression-post-death-resources/);

const noDepletionGraphModel = makeGraphModel();
noDepletionGraphModel.series.postDeathResources = [
  { date: "2032-04-29", monthIndex: 12, value: 640000, xRatio: 0.33, yRatio: 0.12 },
  { date: "2040-04-29", monthIndex: 108, value: 260000, xRatio: 0.72, yRatio: 0.42 },
  { date: "2043-04-29", monthIndex: 144, value: 160000, xRatio: 0.9, yRatio: 0.54 }
];
const fallbackComparisonPoints = [
  { date: "2032-04-29", monthIndex: 12, value: 660000, xRatio: 0.33, yRatio: 0.1 },
  { date: "2040-04-29", monthIndex: 108, value: 320000, xRatio: 0.72, yRatio: 0.36 },
  { date: "2043-04-29", monthIndex: 144, value: 240000, xRatio: 0.9, yRatio: 0.46 }
];
noDepletionGraphModel.series.comparisonPostDeathResources = [
  {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    points: fallbackComparisonPoints
  }
];
const fallbackTimelineHtml = harness.renderTimeline({
  ...fixture,
  scenario: {
    ...fixture.scenario,
    postDeathSeries: {
      depletion: {
        depleted: false
      }
    }
  },
  graphModel: noDepletionGraphModel,
  compressionReporting: {
    lifestyleScenario: {
      ...makeLifestyleScenarioFixture({
        sliderValue: -50,
        monthlyDelta: -250,
        depletionMonthIndex: null,
        depletionDate: "",
        points: fallbackComparisonPoints
      }),
      comparisonScenario: {
        ...makeLifestyleScenarioFixture({
          sliderValue: -50,
          monthlyDelta: -250,
          depletionMonthIndex: null,
          depletionDate: "",
          points: fallbackComparisonPoints
        }).comparisonScenario,
        depletion: {
          depleted: false
        },
        postDeathSeries: {
          points: fallbackComparisonPoints,
          depletion: {
            depleted: false
          }
        }
      }
    },
    trace: {
      lifestyleSliderValue: -50
    }
  }
});
assert.doesNotMatch(
  fallbackTimelineHtml,
  /data-income-impact-lifestyle-impact-readout|Conservative lifestyle selected|Lifestyle spend: -\$250\/mo|Resources difference: \+\$80,000 at horizon/,
  "Scenario impact readout details should render in the summary strip, not inside the timeline graph."
);

const currentAgeHtml = harness.renderTimeline({
  ...fixture,
  graphModel: {
    ...makeGraphModel("current-point-only"),
    callouts: [
      { id: "current-age-no-prior-trend", label: "Before-death trend", value: "No prior modeled trend for current-age death.", kind: "text", phase: "preDeath" }
    ]
  }
});
assert.doesNotMatch(currentAgeHtml, /data-income-impact-graph-path="preDeathAssets"/);
assert.match(currentAgeHtml, /data-income-impact-graph-current-anchor/);
assert.match(currentAgeHtml, /No prior modeled trend for current-age death\./);
assert.doesNotMatch(currentAgeHtml, /data-income-impact-death-event-bridge/);
assert.doesNotMatch(currentAgeHtml, /data-income-impact-graph-path="deathTransition"/);
assert.doesNotMatch(currentAgeHtml, /data-income-impact-death-conversion/);
assert.match(currentAgeHtml, /data-income-impact-graph-path="postDeathResources"/);

const unavailableHtml = harness.renderTimeline({
  ...fixture,
  graphModel: {
    status: "unavailable",
    dataGaps: [{ code: "missing-composer-scenario" }]
  }
});
assert.match(unavailableHtml, /data-income-impact-timeline-paused/);
assert.match(unavailableHtml, /Timeline graph unavailable with the current profile facts/);
assert.doesNotMatch(unavailableHtml, /data-income-impact-graph-svg/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });
assert.match(host.innerHTML, /data-income-impact-summary-strip/);
assert.match(harness.resourceOutlookPanel.innerHTML, /data-income-impact-alert-inbox/);
assert.match(harness.resourceOutlookPanel.innerHTML, /Planning Alerts/);
assert.match(harness.resourceOutlookPanel.innerHTML, /No active alerts/);
assert.ok(
  harness.resourceOutlookPanel.innerHTML.indexOf("data-income-impact-alert-inbox") <
  harness.resourceOutlookPanel.innerHTML.indexOf("data-income-impact-resource-outlook"),
  "Planning alerts inbox should render above Resource Outlook."
);
assert.match(harness.resourceOutlookPanel.innerHTML, /data-income-impact-resource-outlook/);
assert.match(harness.resourceOutlookPanel.innerHTML, /Resource Outlook/);
assert.match(harness.resourceOutlookPanel.innerHTML, /90-Day Transition Outlook/);
assert.match(harness.resourceOutlookPanel.innerHTML, /Can the household cover the first 90 days using cash and emergency fund only\?/);
assert.match(harness.resourceOutlookPanel.innerHTML, /data-income-impact-transition-outlook/);
assert.match(harness.resourceOutlookPanel.innerHTML, /90-day cash need covered/);
assert.match(harness.resourceOutlookPanel.innerHTML, /Fast-access cash[\s\S]*\$125,000/);
assert.match(harness.resourceOutlookPanel.innerHTML, /90-day need[\s\S]*\$100,000/);
assert.match(harness.resourceOutlookPanel.innerHTML, /Coverage ratio[\s\S]*1\.25x/);
assert.match(
  harness.resourceOutlookPanel.innerHTML,
  /Excludes life insurance proceeds, brokerage, retirement, home equity, business value, and other delayed or illiquid assets\./
);
assert.match(host.innerHTML, /data-income-impact-transition-outlook-graph-annotation/);
assert.match(host.innerHTML, /data-income-impact-transition-outlook-status="stable"[\s\S]*>First 3 Months: Stable<\/text>/);
assert.doesNotMatch(harness.resourceOutlookPanel.innerHTML, /data-income-impact-transition-outlook-near-term|nearTermResources|nearTermCoverageRatio|excludedResources/);
assert.doesNotMatch(harness.resourceOutlookPanel.innerHTML, /\$250,000|\$900,000/);
assert.doesNotMatch(harness.resourceOutlookPanel.innerHTML, /life insurance proceeds included|existing coverage included/i);
assert.doesNotMatch(
  `${host.innerHTML}\n${harness.resourceOutlookPanel.innerHTML}`,
  /data-income-impact-transition-band|data-income-impact-transition-marker|data-income-impact-transition-slider|Transition period after death|transitionPeriodMonths|data-analysis-survivor-transition/
);
[
  ["Stable", "90-day cash need covered"],
  ["Caution", "Cash coverage is thin"],
  ["At Risk", "Cash shortfall likely"],
  ["Likely Failure", "90-day cash gap"],
  ["insufficientData", "90-day outlook unavailable"],
  ["not-available", "90-day outlook unavailable"]
].forEach(function ([status, copy]) {
  const statusHost = { innerHTML: "" };
  harness.renderIncomeImpact(statusHost, {
    timelineResult: {
      ...fixture,
      scenario: {
        ...fixture.scenario,
        transitionOutlook: {
          ...fixture.scenario.transitionOutlook,
          status
        }
      }
    }
  });
  assert.match(harness.resourceOutlookPanel.innerHTML, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
assert.match(host.innerHTML, /data-income-impact-story-chart-card/);
assert.match(host.innerHTML, /data-income-impact-financial-security-card/);
assert.doesNotMatch(host.innerHTML, /Existing coverage \+ available assets|divided by estimated annual household shortfall|Partial runway estimate|Time until available assets are projected to reach zero|This estimate uses the available saved facts|How long available resources are projected to last after death/);
assert.match(host.innerHTML, /data-income-impact-depletion-story/);
assert.match(host.innerHTML, /Financial Depletion Story/);
assert.match(host.innerHTML, /data-income-impact-depletion-story-empty/);
assert.match(host.innerHTML, /Storyline events will appear here once verified timeline drivers are available\./);
assert.doesNotMatch(host.innerHTML, /data-income-impact-depletion-story-card/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-graph-story-dot|data-income-impact-story-card/);
assert.doesNotMatch(host.innerHTML, /Emergency Savings Depleted|Retirement Accounts Tapped|Home Equity at Risk|Credit Crisis|Total Financial Collapse/);
assert.doesNotMatch(host.innerHTML, /Remaining assets|Pre-event baseline|Required support/);
assert.match(host.innerHTML, /data-income-impact-chart-section/);
assert.doesNotMatch(host.innerHTML, /Story scaffold|Reserved for the future|Starting resources|Runway pressure|Depletion outcome|coming soon|to be filled/i);
assert.match(host.innerHTML, /data-income-impact-layout-main/);
assert.match(host.innerHTML, /data-income-impact-layout-aside/);
assert.match(host.innerHTML, /data-income-impact-graph-svg/);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-summary-strip") < host.innerHTML.indexOf("data-income-impact-story-chart-card"),
  "Years of Financial Security and Scenario Impact should render outside and above the shared story/chart card."
);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-financial-security-card") < host.innerHTML.indexOf("data-income-impact-story-chart-card"),
  "Years of Financial Security should render in the summary strip, not inside the shared story/chart card."
);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-depletion-story") < host.innerHTML.indexOf("data-income-impact-helper-timeline"),
  "Financial Depletion Story should render above the timeline chart."
);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-helper-timeline") < host.innerHTML.indexOf("data-income-impact-risk-panel"),
  "Timeline graph should render before the supporting risk and compression panels."
);

const noShortfallHost = { innerHTML: "" };
harness.renderIncomeImpact(noShortfallHost, {
  timelineResult: {
    ...fixture,
    financialRunway: {
      ...fixture.financialRunway,
      status: "no-shortfall",
      yearsOfSecurity: null,
      monthsOfSecurity: null
    }
  }
});
assert.match(noShortfallHost.innerHTML, /Financial crisis unlikely/);
assert.match(noShortfallHost.innerHTML, /Available resources are not projected to run out in this scenario\./);

const lifestyleImpactHost = { innerHTML: "" };
harness.renderIncomeImpact(lifestyleImpactHost, {
  timelineResult: {
    ...fixture,
    compressionReporting: {
      lifestyleScenario: {
        sliderValue: 25,
        monthlyDelta: 420
      }
    }
  }
});
assert.match(lifestyleImpactHost.innerHTML, /data-income-impact-lifestyle-impact-readout/);
assert.match(lifestyleImpactHost.innerHTML, /Scenario impact/);
assert.equal(
  (lifestyleImpactHost.innerHTML.match(/data-income-impact-lifestyle-impact-readout/g) || []).length,
  1,
  "Scenario Impact should render once in the summary strip, not as a hidden duplicate inside the graph."
);
assert.ok(
  lifestyleImpactHost.innerHTML.indexOf("data-income-impact-financial-security-card") < lifestyleImpactHost.innerHTML.indexOf("data-income-impact-lifestyle-impact-readout")
    && lifestyleImpactHost.innerHTML.indexOf("data-income-impact-lifestyle-impact-readout") < lifestyleImpactHost.innerHTML.indexOf("data-income-impact-story-chart-card"),
  "Scenario Impact should render in the summary strip with Years of Financial Security, outside the shared story/chart card."
);
assert.doesNotMatch(harness.resourceOutlookPanel.innerHTML, /data-income-impact-lifestyle-impact-readout|Scenario impact/);

const majorStoryFixture = JSON.parse(JSON.stringify(fixture));
majorStoryFixture.financialStoryline = {
  majorStoryCandidates: [
    {
      id: "death-income-stops",
      family: "trigger",
      severity: "critical",
      cardTitle: "Death & Income Stops",
      description: "Household income stops at the modeled death event.",
      evidenceLevel: "trace-backed",
      timing: { kind: "death-event", monthOffset: 0, date: "2031-04-29", label: "At death" }
    },
    {
      id: "cash-savings-depleted",
      family: "liquidity",
      severity: "caution",
      cardTitle: "Cash Savings Depleted",
      description: "Cash reserves are exhausted by projected survivor support.",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 12, date: "2032-04-29", label: "Month 12" },
      amount: { value: 50000, label: "$50,000" }
    },
    {
      id: "housing-payment-at-risk",
      family: "housing",
      severity: "at-risk",
      cardTitle: "Housing Payment At Risk",
      description: "Housing payments continue beyond projected liquid resources.",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 24, date: "2033-04-29", label: "Month 24" },
      amount: { value: 2400, label: "$2,400/mo" }
    },
    {
      id: "retirement-assets-tapped",
      family: "retirement",
      severity: "caution",
      cardTitle: "Retirement Assets Tapped",
      description: "Long-term assets are reached after liquid reserves.",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 36, date: "2034-04-29", label: "Month 36" }
    },
    {
      id: "education-savings-depleted",
      family: "education",
      severity: "at-risk",
      cardTitle: "Education Savings Depleted",
      description: "Education savings are exhausted by living needs.",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 60, date: "2036-04-29", label: "Month 60" }
    },
    {
      id: "resources-run-out",
      family: "support",
      severity: "critical",
      cardTitle: "Resources Run Out",
      description: "Modeled survivor resources reach the depletion point.",
      evidenceLevel: "calculated",
      timing: { kind: "month-offset", monthOffset: 144, date: "2043-04-29", label: "Month 144" }
    },
    {
      id: "lower-priority-over-cap",
      family: "support",
      severity: "caution",
      cardTitle: "Lower Priority Event",
      description: "This seventh candidate should not render in the six-frame shell.",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 150, label: "Month 150" }
    }
  ],
  graphDotCandidates: [
    {
      id: "death-income-stops",
      family: "trigger",
      severity: "critical",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 0,
      graphLabel: "Death",
      displayLabel: "Death & Income Stops",
      evidenceLevel: "trace-backed",
      timing: { kind: "death-event", monthOffset: 0, date: "2031-04-29", label: "At death" }
    },
    {
      id: "cash-savings-depleted",
      family: "liquidity",
      severity: "caution",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 1,
      graphLabel: "Cash depleted",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 12, date: "2032-04-29", label: "Month 12" },
      amount: { value: 50000, label: "$50,000" }
    },
    {
      id: "housing-payment-at-risk",
      family: "housing",
      severity: "at-risk",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 2,
      graphLabel: "Housing at risk",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 24, date: "2033-04-29", label: "Month 24" },
      amount: { value: 2400, label: "$2,400/mo" }
    },
    {
      id: "retirement-assets-tapped",
      family: "retirement",
      severity: "caution",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 3,
      graphLabel: "Retirement tapped",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 36, date: "2034-04-29", label: "Month 36" }
    },
    {
      id: "education-savings-depleted",
      family: "education",
      severity: "at-risk",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 4,
      graphLabel: "Education depleted",
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 60, date: "2036-04-29", label: "Month 60" }
    },
    {
      id: "resources-run-out",
      family: "support",
      severity: "critical",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 5,
      graphLabel: "Resources run out",
      evidenceLevel: "calculated",
      timing: { kind: "month-offset", monthOffset: 144, date: "2043-04-29", label: "Month 144" }
    }
  ].concat(Array.from({ length: 10 }, function (_, index) {
    return {
      id: `micro-storyline-event-${index + 1}`,
      family: index % 2 === 0 ? "income" : "unmet-need",
      severity: index % 3 === 0 ? "caution" : "info",
      dotTier: "micro",
      connectedToMajorCard: false,
      eligibleForConnector: false,
      majorCardIndex: null,
      graphLabel: `Micro event ${index + 1}`,
      displayLabel: `Micro event ${index + 1}`,
      evidenceLevel: "estimated",
      timing: { kind: "month-offset", monthOffset: 42 + (index * 6), label: `Month ${42 + (index * 6)}` }
    };
  }))
};
const majorStoryHost = { innerHTML: "" };
harness.renderIncomeImpact(majorStoryHost, { timelineResult: majorStoryFixture });
assert.equal(
  (majorStoryHost.innerHTML.match(/data-income-impact-major-story-card(?:\s|>)/g) || []).length,
  6,
  "Financial Depletion Story should render no more than six major story cards."
);
assert.doesNotMatch(majorStoryHost.innerHTML, /data-income-impact-depletion-story-empty/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-major-story-event-id="death-income-stops"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-major-story-family="housing"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-major-story-severity="at-risk"/);
assert.match(majorStoryHost.innerHTML, /Death &amp; Income Stops/);
assert.match(majorStoryHost.innerHTML, /At death/);
assert.match(majorStoryHost.innerHTML, /\$50,000/);
assert.match(majorStoryHost.innerHTML, /Housing payments continue beyond projected liquid resources\./);
assert.ok(
  majorStoryHost.innerHTML.indexOf('data-income-impact-major-story-event-id="death-income-stops"') <
    majorStoryHost.innerHTML.indexOf('data-income-impact-major-story-event-id="cash-savings-depleted"') &&
    majorStoryHost.innerHTML.indexOf('data-income-impact-major-story-event-id="cash-savings-depleted"') <
    majorStoryHost.innerHTML.indexOf('data-income-impact-major-story-event-id="housing-payment-at-risk"'),
  "Major story cards should preserve selector order with death first when supplied first."
);
assert.doesNotMatch(majorStoryHost.innerHTML, /lower-priority-over-cap|Lower Priority Event/);
assert.equal(
  (majorStoryHost.innerHTML.match(/data-income-impact-storyline-dot(?:\s|>)/g) || []).length,
  14,
  "Rendering major story cards should group same-month graph events while reusing the death diamond marker."
);
assert.equal(
  (majorStoryHost.innerHTML.match(/data-income-impact-storyline-connector(?:\s|>)/g) || []).length,
  6,
  "Storyline connectors should render only for major cards with matching graph dots."
);
assert.equal(
  (majorStoryHost.innerHTML.match(/data-income-impact-storyline-dot-tier="major"/g) || []).length,
  6,
  "Six graph dots should be marked as major when they match the six major story cards."
);
assert.equal(
  (majorStoryHost.innerHTML.match(/data-income-impact-storyline-dot-tier="micro"/g) || []).length,
  9,
  "Standalone micro markers should remain secondary when a same-month micro event is carried by a grouped major marker."
);
assert.match(
  majorStoryHost.innerHTML,
  /data-income-impact-storyline-event-ids="education-savings-depleted micro-storyline-event-4"/,
  "Same-month micro events should remain represented in the grouped marker event-id list."
);
assert.match(majorStoryHost.innerHTML, /income-impact-storyline-dot--major/);
assert.match(majorStoryHost.innerHTML, /income-impact-storyline-dot--micro/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-dot-readout/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connectors/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-death-conversion-diamond[\s\S]*data-income-impact-storyline-event-id="death-income-stops"/);
assert.doesNotMatch(majorStoryHost.innerHTML, /<g\b(?=[^>]*data-income-impact-storyline-dot(?:\s|>))(?=[^>]*data-income-impact-storyline-event-id="death-income-stops")/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="death-income-stops"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-target-source="death-conversion-diamond"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="cash-savings-depleted"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="housing-payment-at-risk"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="retirement-assets-tapped"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="education-savings-depleted"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="resources-run-out"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-family="support"/);
assert.match(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-severity="critical"/);
assert.doesNotMatch(majorStoryHost.innerHTML, /data-income-impact-storyline-connector-event-id="micro-storyline-event-/);
assert.doesNotMatch(majorStoryHost.innerHTML, /data-income-impact-story-card-connector|data-income-impact-major-story-connector/);
assert.doesNotMatch(majorStoryHost.innerHTML, /Emergency Savings Depleted|Retirement Accounts Tapped|Home Equity at Risk|Credit Crisis|Total Financial Collapse/);

const reusedRunOutMarkerFixture = JSON.parse(JSON.stringify(fixture));
reusedRunOutMarkerFixture.graphModel = JSON.parse(JSON.stringify(multiAppliedGraphModel));
reusedRunOutMarkerFixture.financialStoryline = {
  majorStoryCandidates: [
    {
      id: "death-income-stops",
      family: "trigger",
      severity: "critical",
      cardTitle: "Death & Income Stops",
      evidenceLevel: "trace-backed",
      timing: { kind: "death-event", monthOffset: 0, label: "At death" }
    },
    {
      id: "resources-run-out",
      family: "support",
      severity: "critical",
      cardTitle: "Resources Run Out",
      evidenceLevel: "calculated",
      timing: { kind: "month-offset", monthOffset: 156, label: "Month 156" }
    }
  ],
  graphDotCandidates: [
    {
      id: "death-income-stops",
      family: "trigger",
      severity: "critical",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 0,
      graphLabel: "Death",
      evidenceLevel: "trace-backed",
      timing: { kind: "death-event", monthOffset: 0, label: "At death" }
    },
    {
      id: "resources-run-out",
      family: "support",
      severity: "critical",
      dotTier: "major",
      connectedToMajorCard: true,
      eligibleForConnector: true,
      majorCardIndex: 1,
      graphLabel: "Resources run out",
      evidenceLevel: "calculated",
      timing: { kind: "month-offset", monthOffset: 156, label: "Month 156" }
    }
  ]
};
const reusedRunOutMarkerHtml = harness.renderTimeline(reusedRunOutMarkerFixture);
assert.doesNotMatch(
  reusedRunOutMarkerHtml,
  /<g\b(?=[^>]*data-income-impact-storyline-dot(?:\s|>))(?=[^>]*data-income-impact-storyline-event-id="resources-run-out")/,
  "Resources run out should reuse the existing selected depletion marker instead of rendering a duplicate storyline dot."
);
assert.match(
  reusedRunOutMarkerHtml,
  /data-income-impact-runway-depletion-marker[\s\S]*data-income-impact-storyline-event-id="resources-run-out"/,
  "Selected depletion marker should serve as the resources-run-out storyline marker when available."
);
assert.match(reusedRunOutMarkerHtml, /data-income-impact-storyline-connector-event-id="resources-run-out"/);
assert.match(reusedRunOutMarkerHtml, /data-income-impact-storyline-connector-target-source="runway-depletion-marker"/);

const emptyMajorStoryHost = { innerHTML: "" };
harness.renderIncomeImpact(emptyMajorStoryHost, {
  timelineResult: {
    ...fixture,
    financialStoryline: { majorStoryCandidates: [] }
  }
});
assert.match(emptyMajorStoryHost.innerHTML, /data-income-impact-depletion-story-empty/);
assert.doesNotMatch(emptyMajorStoryHost.innerHTML, /data-income-impact-major-story-card(?:\s|>)/);

const noConnectorDotHost = { innerHTML: "" };
harness.renderIncomeImpact(noConnectorDotHost, {
  timelineResult: {
    ...majorStoryFixture,
    financialStoryline: {
      ...majorStoryFixture.financialStoryline,
      graphDotCandidates: []
    }
  }
});
assert.equal(
  (noConnectorDotHost.innerHTML.match(/data-income-impact-major-story-card(?:\s|>)/g) || []).length,
  6,
  "Major story cards should still render when graph dot candidates are missing."
);
assert.doesNotMatch(
  noConnectorDotHost.innerHTML,
  /data-income-impact-storyline-connector(?:\s|>)/,
  "Storyline connectors should not render when graph dot candidates are empty."
);

console.log("income-loss-impact-visual-timeline-check passed");
