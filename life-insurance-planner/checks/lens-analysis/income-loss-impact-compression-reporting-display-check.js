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

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function assertScriptOrder(scriptSources, orderedScripts) {
  let lastIndex = -1;
  orderedScripts.forEach(function (scriptPath) {
    const index = scriptSources.indexOf(scriptPath);
    assert.ok(index >= 0, `${scriptPath} should be loaded`);
    assert.ok(index > lastIndex, `${scriptPath} should load after the previous script`);
    lastIndex = index;
  });
}

function createDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactCompressionDisplayHarness = { buildIncomeImpactResultFromState, renderCompressionReportingPanel, renderIncomeImpact, renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactCompressionDisplayHarness;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeScenario() {
  return {
    scenario: {
      selectedDeathDate: "2031-05-06",
      selectedDeathAge: 50
    },
    deathEvent: {
      immediateObligations: 100000,
      layer2: {
        resources: {
          totalResourcesBeforeObligations: 600000
        }
      }
    },
    postDeathSeries: {
      points: [
        {
          monthIndex: 1,
          date: "2031-06-06",
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          survivorNeeds: 4000,
          netUse: 3500,
          startingResources: 503500,
          endingResources: 500000
        },
        {
          monthIndex: 2,
          date: "2031-07-06",
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          survivorNeeds: 4000,
          netUse: 3500,
          startingResources: 500000,
          endingResources: 496500
        },
        {
          monthIndex: 3,
          date: "2031-08-06",
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          survivorNeeds: 4000,
          netUse: 3500,
          startingResources: 496500,
          endingResources: 493000
        }
      ],
      summary: {
        totalSurvivorIncome: 24000,
        totalSurvivorNeeds: 72000,
        totalScheduledObligations: 6000,
        accumulatedUnmetNeed: 0
      },
      depletion: {
        depleted: false,
        depletionDate: null,
        monthsCovered: 120
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 500000,
      survivorAvailableTreatedAssets: 100000,
      coverageAdded: 500000,
      resourcesAfterObligations: 500000,
      monthsCovered: 120,
      depletionDate: null,
      accumulatedUnmetNeed: 0
    },
    warnings: [],
    dataGaps: [
      {
        code: "existing-scenario-gap",
        message: "Existing scenario gap.",
        sourcePaths: ["scenario.fixture"]
      }
    ]
  };
}

function makeRiskEvaluation() {
  return {
    status: "complete",
    events: [
      {
        id: "risk-one",
        ruleId: "risk-one",
        category: "runway",
        severity: "caution",
        title: "Existing key risk",
        summary: "Existing risk output remains visible."
      }
    ],
    stableEvents: [],
    warnings: [],
    dataGaps: []
  };
}

function makeGraphModel(input) {
  const comparisonScenarios = Array.isArray(input?.comparisonScenarios) ? input.comparisonScenarios : [];
  return {
    status: "complete",
    phases: {
      preDeath: { startXRatio: 0, endXRatio: 0.2, available: true },
      deathEvent: { xRatio: 0.2, date: "2031-05-06" },
      postDeath: { startXRatio: 0.2, endXRatio: 1, available: true }
    },
    series: {
      preDeathAssets: [
        { value: 500000, xRatio: 0, yRatio: 0.3 },
        { value: 550000, xRatio: 0.2, yRatio: 0.24 }
      ],
      currentAnchor: null,
      deathTransition: [
        { value: 550000, xRatio: 0.2, yRatio: 0.24 },
        { value: 500000, xRatio: 0.2, yRatio: 0.3 }
      ],
      postDeathResources: [
        { value: 500000, xRatio: 0.3, yRatio: 0.3 },
        { value: 496500, xRatio: 0.6, yRatio: 0.33 },
        { value: 493000, xRatio: 0.9, yRatio: 0.36 }
      ],
      comparisonPostDeathResources: comparisonScenarios.map(function (comparisonScenario) {
        return {
          scenarioId: comparisonScenario.scenarioId,
          kind: comparisonScenario.kind,
          pathId: comparisonScenario.pathId,
          label: comparisonScenario.label,
          points: comparisonScenario.postDeathSeries.points.map(function (point, index) {
            return {
              date: point.date,
              value: point.endingResources,
              xRatio: [0.3, 0.6, 0.9][index] || 0.9,
              yRatio: 0.3 + (index * 0.02)
            };
          })
        };
      })
    },
    axes: {
      x: {
        ticks: [
          { id: "death", label: "Death", date: "2031-05-06", xRatio: 0.2 },
          { id: "horizon", label: "Horizon", date: "2071-05-06", xRatio: 1 }
        ]
      },
      y: {
        signed: true,
        zeroYRatio: 0.8,
        ticks: [
          { value: 0, yRatio: 0.8 },
          { value: 500000, yRatio: 0.3 }
        ]
      }
    },
    markers: [
      {
        id: "existing-risk-marker",
        ruleId: "risk-one",
        kind: "risk",
        severity: "caution",
        title: "Existing key risk",
        positionable: true,
        xRatio: 0.5,
        yRatio: 0.5
      }
    ],
    comparisonMarkers: [],
    selectedEvent: null,
    callouts: [
      { id: "resources-after-obligations", label: "Resources after obligations", value: 500000, kind: "currency", phase: "deathEvent" }
    ],
    warnings: [],
    dataGaps: []
  };
}

function makeCompressionReport() {
  return {
    status: "complete",
    opportunities: [
      {
        typeKey: "groceries",
        label: "Groceries",
        currentMonthlyAmount: 2000,
        possibleMonthlyReduction: 650
      },
      {
        typeKey: "diningOutRestaurants",
        label: "Dining Out",
        currentMonthlyAmount: 650,
        possibleMonthlyReduction: 150
      }
    ],
    pauseCandidates: [
      {
        typeKey: "retirementContributions",
        label: "Retirement Contribution",
        currentMonthlyAmount: 500,
        possibleMonthlyPauseAmount: 500
      }
    ],
    protectedItems: [],
    excludedItems: [
      {
        typeKey: "autoLoanPayment",
        label: "Auto Loan Payment",
        reasonCode: "generated-debt-payment-excluded",
        sourceKey: "debtRecords",
        sourcePath: "protectionModeling.data.debtRecords[0]",
        reason: "Generated Debt Records payment facts are source-owned and excluded from expense compression."
      }
    ],
    advisorReviewItems: [],
    dataGaps: [],
    warnings: [],
    trace: {
      mode: "reportingOnly"
    }
  };
}

function createCompressionScenarioResult() {
  return {
    status: "complete",
    baseScenarioUnchanged: true,
    compressionScenario: {
      scenarioId: "income-impact-expense-compression-alternate",
      label: "Expense compression alternate scenario",
      reductionsApplied: [],
      pausesApplied: [],
      postDeathSeries: {
        points: [
          { monthIndex: 1, date: "2031-06-06", endingResources: 500650 },
          { monthIndex: 2, date: "2031-07-06", endingResources: 497800 },
          { monthIndex: 3, date: "2031-08-06", endingResources: 494950 }
        ]
      },
      trace: {
        calculationMethod: "income-impact-compression-scenario-v1",
        baseScenarioMutated: false
      }
    },
    dataGaps: [],
    warnings: [],
    trace: {
      calculationMethod: "income-impact-compression-scenario-v1"
    }
  };
}

function createLayer5Output(input) {
  const scenarioResult = input.compressionScenarioResult;
  const complete = scenarioResult?.status === "complete" && scenarioResult.compressionScenario;
  return {
    compressionOpportunities: input.compressionReport?.opportunities || [],
    pauseCandidates: input.compressionReport?.pauseCandidates || [],
    protectedExpenseItems: input.compressionReport?.protectedItems || [],
    excludedExpenseItems: input.compressionReport?.excludedItems || [],
    advisorReviewItems: input.compressionReport?.advisorReviewItems || [],
    compressionDataGaps: input.compressionReport?.dataGaps || [],
    compressionTrace: {
      reportingOnly: true,
      compressionReportingEnabled: true,
      graphPathChanged: false,
      reductionsApplied: false,
      layer5AppliedCompression: false
    },
    policyDecisionSummary: {
      YES: 2,
      NO: 1,
      PAUSE: 1,
      INTERVENTION: 1,
      totalRules: 5
    },
    compressionScenarios: complete ? [scenarioResult.compressionScenario] : [],
    compressionScenarioDataGaps: Array.isArray(scenarioResult?.dataGaps) ? scenarioResult.dataGaps : [],
    compressionScenarioWarnings: Array.isArray(scenarioResult?.warnings) ? scenarioResult.warnings : [],
    compressionScenarioTrace: {
      compressionScenarioInputProvided: Boolean(scenarioResult),
      compressionScenarioStatus: scenarioResult?.status || null,
      alternateScenarioBlocked: Boolean(scenarioResult) && !complete,
      baseScenarioUnchanged: true,
      baseScenarioMutated: false,
      postDeathSeriesReplaced: false,
      graphPathChanged: false,
      layer5AppliedCompression: false,
      displayWired: false
    },
    interventionScenarios: [],
    baseScenarioSummary: {
      resourcesAfterObligations: 500000,
      monthsCovered: 120,
      depletionDate: null,
      accumulatedUnmetNeed: 0,
      totalSurvivorNeeds: 72000,
      totalSurvivorIncome: 24000,
      totalScheduledObligations: 6000
    },
    dataGaps: input.scenario?.dataGaps || []
  };
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const scripts = getScriptSources(pageSource);
const harness = createDisplayHarness(displaySource);

assertScriptOrder(scripts, [
  "../app/features/lens-analysis/expense-taxonomy.js",
  "../app/features/lens-analysis/expense-library.js",
  "../app/features/lens-analysis/expense-compression-thresholds.js",
  "../app/features/lens-analysis/expense-compression-threshold-resolver.js",
  "../app/features/lens-analysis/household-expense-compression-calculations.js",
  "../app/features/lens-analysis/household-expense-compression-policy.js",
  "../app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
  "../app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
  "../app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js",
  "../app/features/lens-analysis/income-impact-timeline-graph-model.js",
  "../app/features/lens-analysis/income-impact-triage-intervention-calculations.js",
  "../app/features/lens-analysis/income-impact-compression-reporting-prep.js",
  "../app/features/lens-analysis/income-impact-compression-scenario-calculations.js",
  "../app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
  "../app/features/lens-analysis/income-loss-impact-display.js"
]);
assert.equal(scripts.includes("../app/features/lens-analysis/household-expense-compression-stage-policy.js"), false);
assert.equal(scripts.includes("../app/features/lens-analysis/income-impact-staged-compression-scenario-calculations.js"), false);

assert.equal(typeof harness.buildIncomeImpactResultFromState, "function", "display harness should expose result builder");
assert.equal(typeof harness.renderCompressionReportingPanel, "function", "display harness should expose compression panel renderer");
assert.equal(typeof harness.renderIncomeImpact, "function", "display harness should expose main renderer");
assert.equal(typeof harness.renderTimeline, "function", "display harness should expose timeline renderer");

assert.match(pageSource, /data-income-impact-lifestyle-slider/);
assert.match(displaySource, /calculateIncomeImpactLifestyleScenario/);
assert.match(displaySource, /buildLifestyleComparisonScenario/);
assert.match(displaySource, /Lifestyle-adjusted projection/);
assert.match(displaySource, /compressionReport:\s*compressionPrep\?\.compressionReport/);
assert.match(displaySource, /compressionScenarioResult/);
assert.doesNotMatch(displaySource, /calculateIncomeImpactStagedCompressionScenario|compressionStagePolicyRules|staged-compression-post-death-resources|data-income-impact-detail-path="staged-compression"/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Loss Impact display should not persist scenario or lifestyle state."
);
assert.match(componentsSource, /\.income-impact-compression-panel/);
assert.match(componentsSource, /\.income-impact-scenario-field--lifestyle/);
assert.match(componentsSource, /\.income-impact-graph-path--compression-post-death-resources/);

const scenario = makeScenario();
const riskEvaluation = makeRiskEvaluation();
const compressionReport = makeCompressionReport();
const compressionPolicyRules = [
  { decision: "YES", expenseTypeKey: "diningOutRestaurants", compressionOrderGroup: "earlyDiscretionary", compressionOrderRank: 1 },
  { decision: "YES", expenseTypeKey: "groceries", compressionOrderGroup: "groceriesAndProtectedFlexibleEssentials", compressionOrderRank: 7 },
  { decision: "PAUSE", expenseTypeKey: "retirementContributions", compressionOrderGroup: "pauseContributions", compressionOrderRank: 4 },
  { decision: "NO", expenseTypeKey: "autoLoanPayment", compressionOrderGroup: "debtObligations", compressionOrderRank: 18 },
  { decision: "INTERVENTION", expenseTypeKey: "housingPayment", compressionOrderGroup: "majorInterventions", compressionOrderRank: 21 }
];
const originalScenario = clone(scenario);
const originalRiskEvaluation = clone(riskEvaluation);
let prepCallCount = 0;
let compressionScenarioCallCount = 0;
let lifestyleScenarioCallCount = 0;
let layer5CallCount = 0;
let graphCallCount = 0;
let capturedLifestyleInput = null;
let capturedLayer5Input = null;
let capturedGraphInput = null;

const result = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: {
    id: "lens-fixture",
    expenseFacts: {
      expenses: [
        { expenseTypeKey: "groceries", categoryKey: "foodGroceries", monthlyAmount: 1000 },
        { expenseTypeKey: "diningOutRestaurants", categoryKey: "foodGroceries", monthlyAmount: 400 }
      ]
    }
  },
  analysisSettings: {},
  scenarioState: {
    projectionHorizonYears: 40,
    mortgageTreatmentOverride: "followAssumptions",
    lifestyleSliderValue: 0
  },
  deathAgeState: {
    hasDateOfBirth: false
  },
  composeIncomeImpactScenario(input) {
    assert.equal(input.scenarioOptions.includeDiscretionaryNeeds, true);
    return scenario;
  },
  evaluateIncomeImpactRiskEvents(input) {
    assert.equal(input.scenario, scenario);
    return riskEvaluation;
  },
  buildIncomeImpactTimelineGraphModel(input) {
    graphCallCount += 1;
    capturedGraphInput = input;
    assert.equal(input.scenario, scenario);
    assert.equal(input.riskEvaluation, riskEvaluation);
    return makeGraphModel(input);
  },
  prepareIncomeImpactCompressionReportingInputs(input) {
    prepCallCount += 1;
    assert.deepEqual(clone(input.options), {
      householdContext: "survivor",
      includeAdvisorConfirmed: false,
      includePauseCandidates: true
    });
    return {
      compressionReport,
      compressionPolicyRules,
      warnings: [],
      dataGaps: [],
      trace: {
        reportingOnly: true
      }
    };
  },
  calculateIncomeImpactCompressionScenario(input) {
    compressionScenarioCallCount += 1;
    assert.equal(input.scenario, scenario);
    assert.equal(input.compressionReport, compressionReport);
    return createCompressionScenarioResult(input);
  },
  calculateIncomeImpactLifestyleScenario(input) {
    lifestyleScenarioCallCount += 1;
    capturedLifestyleInput = input;
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      totalBaselineMonthlyExpenses: 1400,
      totalAdjustedMonthlyExpenses: 1400,
      monthlyDelta: 0,
      adjustedExpenses: [],
      warnings: [],
      dataGaps: [],
      trace: {
        calculationMethod: "income-impact-lifestyle-scenario-v1",
        timingApplied: false,
        graphPathChanged: false
      }
    };
  },
  calculateIncomeImpactTriageInterventions(input) {
    layer5CallCount += 1;
    capturedLayer5Input = input;
    return createLayer5Output(input);
  }
});

assert.equal(prepCallCount, 1, "display should prepare compression reporting inputs once");
assert.equal(compressionScenarioCallCount, 1, "display should keep existing compression scenario reporting handoff intact");
assert.equal(lifestyleScenarioCallCount, 1, "display should calculate lifestyle scenario once after prep");
assert.equal(layer5CallCount, 1, "display should pass compression output into Layer 5 once");
assert.equal(graphCallCount, 1, "display should build graph once");
assert.equal(capturedLifestyleInput.expenseFacts.expenses.length, 2, "lifestyle helper should receive explicit expense facts");
assert.equal(capturedLifestyleInput.sliderValue, 0, "default slider value should be current/baseline");
assert.equal(capturedLayer5Input.compressionScenarioResult.status, "complete", "Layer 5 should continue receiving the existing immediate compression scenario result");
assert.equal(capturedGraphInput.comparisonScenarios.length, 1, "graph should receive one lifestyle-adjusted comparison scenario");
assert.equal(capturedGraphInput.comparisonScenarios[0].scenarioId, "income-impact-lifestyle-adjusted-comparison");
assert.equal(capturedGraphInput.comparisonScenarios[0].kind, "compression");
assert.equal(capturedGraphInput.comparisonScenarios[0].pathId, "compression-post-death-resources");
assert.equal(capturedGraphInput.comparisonScenarios[0].label, "Lifestyle-adjusted projection");
assert.deepEqual(
  capturedGraphInput.comparisonScenarios[0].postDeathSeries.points.map(function (point) { return point.endingResources; }),
  scenario.postDeathSeries.points.map(function (point) { return point.endingResources; }),
  "slider 0 lifestyle comparison should match baseline post-death resources"
);
assert.deepEqual(scenario, originalScenario, "display lifestyle wiring should not mutate scenario");
assert.deepEqual(riskEvaluation, originalRiskEvaluation, "display lifestyle wiring should not mutate risk evaluation");
assert.deepEqual(result.scenario.postDeathSeries, originalScenario.postDeathSeries, "base postDeathSeries should remain unchanged");
assert.equal(result.triageInterventions.interventionScenarios.length, 0, "lifestyle graph comparison should not create intervention scenarios");
assert.equal(result.compressionReporting.trace.lifestyleScenarioPrepared, true);
assert.equal(result.compressionReporting.trace.lifestyleScenarioStatus, "complete");
assert.equal(result.compressionReporting.trace.lifestyleSliderValue, 0);
assert.equal(result.compressionReporting.trace.timelineMarkersCreated, false);

const currentHtml = harness.renderTimeline(result);
assert.match(currentHtml, /data-income-impact-graph-path="compression-post-death-resources"/);
assert.match(currentHtml, /Lifestyle-adjusted projection/);
assert.match(currentHtml, /Comparison only - base projection unchanged\./);
assert.doesNotMatch(currentHtml, /staged-compression-post-death-resources|Staged compression|data-income-impact-graph-detail="compression-early-window"|data-income-impact-detail-path=/);
assert.doesNotMatch(currentHtml, /data-income-impact-compression-marker-type="compressionAction"|data-income-impact-compression-marker-type="pauseAction"/);

const panelHtml = harness.renderCompressionReportingPanel(result);
assert.match(panelHtml, /data-income-impact-compression-panel/);
assert.match(panelHtml, /Expense Compression Readiness/);
assert.match(panelHtml, /Reporting only - not applied to the projection\./);
assert.match(panelHtml, /Lifestyle comparison: Current/);
assert.match(panelHtml, /First reductions to review/);
assert.match(panelHtml, /Dining Out/);
assert.match(panelHtml, /Groceries/);
assert.match(panelHtml, /Contribution pauses/);
assert.match(panelHtml, /Retirement Contribution/);
assert.match(panelHtml, /Protected \/ excluded items/);
assert.match(panelHtml, /Auto Loan Payment/);
assert.match(panelHtml, /Source-owned by Debt Records/);
assert.match(panelHtml, /Policy summary/);

function runLifestyleSlider(sliderValue, monthlyDelta) {
  let graphInput = null;
  const sliderResult = harness.buildIncomeImpactResultFromState({
    valuationDate: "2026-05-06",
    lensModel: {
      id: `lens-slider-${sliderValue}`,
      expenseFacts: {
        expenses: [
          { expenseTypeKey: "groceries", categoryKey: "foodGroceries", monthlyAmount: 1000 }
        ]
      }
    },
    analysisSettings: {},
    scenarioState: {
      projectionHorizonYears: 40,
      mortgageTreatmentOverride: "followAssumptions",
      lifestyleSliderValue: sliderValue
    },
    deathAgeState: { hasDateOfBirth: false },
    composeIncomeImpactScenario() { return scenario; },
    evaluateIncomeImpactRiskEvents() { return riskEvaluation; },
    buildIncomeImpactTimelineGraphModel(input) {
      graphInput = input;
      return makeGraphModel(input);
    },
    prepareIncomeImpactCompressionReportingInputs() {
      return {
        compressionReport,
        compressionPolicyRules,
        warnings: [],
        dataGaps: [],
        trace: { reportingOnly: true }
      };
    },
    calculateIncomeImpactCompressionScenario(input) {
      return createCompressionScenarioResult(input);
    },
    calculateIncomeImpactLifestyleScenario(input) {
      return {
        status: "complete",
        sliderValue: input.sliderValue,
        totalBaselineMonthlyExpenses: 1000,
        totalAdjustedMonthlyExpenses: 1000 + monthlyDelta,
        monthlyDelta,
        adjustedExpenses: [],
        warnings: [],
        dataGaps: [],
        trace: { calculationMethod: "income-impact-lifestyle-scenario-v1" }
      };
    },
    calculateIncomeImpactTriageInterventions(input) {
      return createLayer5Output(input);
    }
  });
  return { sliderResult, graphInput };
}

const conservative = runLifestyleSlider(-100, -500);
assert.equal(conservative.graphInput.comparisonScenarios.length, 1);
assert.deepEqual(
  conservative.graphInput.comparisonScenarios[0].postDeathSeries.points.map(function (point) { return point.endingResources; }),
  [500500, 497500, 494500],
  "conservative lifestyle should improve the comparison resources over time"
);
assert.match(harness.renderCompressionReportingPanel(conservative.sliderResult), /Lifestyle comparison: Conservative/);

const elevated = runLifestyleSlider(100, 250);
assert.equal(elevated.graphInput.comparisonScenarios.length, 1);
assert.deepEqual(
  elevated.graphInput.comparisonScenarios[0].postDeathSeries.points.map(function (point) { return point.endingResources; }),
  [499750, 496000, 492250],
  "elevated lifestyle should reduce the comparison resources over time"
);
assert.match(harness.renderCompressionReportingPanel(elevated.sliderResult), /Lifestyle comparison: Elevated/);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: result });
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /Existing key risk/);
assert.match(host.innerHTML, /data-income-impact-compression-panel/);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-risk-panel") < host.innerHTML.indexOf("data-income-impact-compression-panel"),
  "compression reporting should remain below existing key risks"
);

console.log("income-loss-impact-compression-reporting-display-check passed");
