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
    "\n  window.__incomeImpactCompressionDisplayHarness = { buildIncomeImpactResultFromState, buildBaseIncomeImpactContextFromState, buildIncomeImpactResultFromBaseContext, getBaseRenderCacheKey, renderCompressionReportingPanel, renderIncomeImpact, renderTimeline };\n})(window);\n"
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

function makeHelperProvidedLifestyleComparison(input, monthlyDelta) {
  const basePostDeathSeries = input.basePostDeathSeries;
  const points = basePostDeathSeries.points.map(function (point) {
    const monthIndex = point.monthIndex;
    const cumulativeDelta = monthlyDelta * monthIndex;
    return Object.assign({}, point, {
      endingResources: point.endingResources - cumulativeDelta,
      startingResources: point.startingResources - (monthlyDelta * Math.max(0, monthIndex - 1)),
      trace: Object.assign({}, point.trace || {}, {
        helperProvidedComparisonFixture: true,
        elapsedMonthIndexUsed: monthIndex
      })
    });
  });
  return {
    scenarioId: "income-impact-lifestyle-adjusted-comparison",
    kind: "lifestyleComparison",
    pathId: "lifestyle-post-death-resources",
    label: "Lifestyle-adjusted projection",
    status: "complete",
    reductionsApplied: [],
    pausesApplied: [],
    postDeathSeries: {
      points,
      summary: Object.assign({}, basePostDeathSeries.summary),
      depletion: Object.assign({}, basePostDeathSeries.depletion)
    },
    trace: {
      calculationMethod: "income-impact-household-expense-stream-comparison-adapter-v1",
      graphMonthlyDelta: monthlyDelta,
      helperProvidedComparisonFixture: true
    }
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
    dataGaps: [],
    trace: {
      scenarioModelMode: Array.isArray(input?.appliedScenarios) && input.appliedScenarios.length
        ? "appliedScenarios"
        : "singleScenario",
      appliedScenarioCount: Array.isArray(input?.appliedScenarios) ? input.appliedScenarios.length : 0,
      selectedScenarioId: input?.selectedScenarioId || null
    }
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
  "../app/features/account-settings/household-expense-account-policy-storage.js",
  "../app/features/lens-analysis/expense-compression-thresholds.js",
  "../app/features/lens-analysis/expense-compression-threshold-resolver.js",
  "../app/features/lens-analysis/household-expense-compression-calculations.js",
  "../app/features/lens-analysis/household-expense-compression-policy.js",
  "../app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
  "../app/features/lens-analysis/household-expense-account-policy-resolver.js",
  "../app/features/lens-analysis/household-expense-living-floor-metadata.js",
  "../app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
  "../app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
  "../app/features/lens-analysis/household-expense-living-floor-calculations.js",
  "../app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
  "../app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
  "../app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js",
  "../app/features/lens-analysis/income-impact-timeline-graph-model.js",
  "../app/features/lens-analysis/income-impact-triage-intervention-calculations.js",
  "../app/features/lens-analysis/income-impact-compression-reporting-prep.js",
  "../app/features/lens-analysis/income-impact-compression-scenario-calculations.js",
  "../app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js",
  "../app/features/lens-analysis/income-impact-base-household-expense-stream.js",
  "../app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js",
  "../app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js",
  "../app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
  "../app/features/lens-analysis/income-impact-auto-compressed-baseline-calculations.js",
  "../app/features/lens-analysis/income-loss-impact-display.js"
]);
assert.equal(scripts.includes("../app/features/lens-analysis/household-expense-compression-stage-policy.js"), false);
assert.equal(scripts.includes("../app/features/lens-analysis/income-impact-staged-compression-scenario-calculations.js"), false);

assert.equal(typeof harness.buildIncomeImpactResultFromState, "function", "display harness should expose result builder");
assert.equal(typeof harness.buildBaseIncomeImpactContextFromState, "function", "display harness should expose base context builder");
assert.equal(typeof harness.buildIncomeImpactResultFromBaseContext, "function", "display harness should expose cached lifestyle result builder");
assert.equal(typeof harness.getBaseRenderCacheKey, "function", "display harness should expose base cache key builder");
assert.equal(typeof harness.renderCompressionReportingPanel, "function", "display harness should expose compression panel renderer");
assert.equal(typeof harness.renderIncomeImpact, "function", "display harness should expose main renderer");
assert.equal(typeof harness.renderTimeline, "function", "display harness should expose timeline renderer");

assert.match(pageSource, /data-income-impact-lifestyle-slider/);
assert.match(pageSource, /data-income-impact-auto-compress-baseline/);
assert.match(
  pageSource,
  /data-income-impact-auto-compress-baseline[\s\S]{0,80}checked|checked[\s\S]{0,160}data-income-impact-auto-compress-baseline/,
  "auto-compress scenario control should be checked by default in static markup"
);
assert.match(pageSource, /Auto-compress survivor lifestyle/);
assert.match(pageSource, /Gradually reduces lifestyle spending toward conservative assumptions over the projected runway\./);
assert.match(displaySource, /calculateIncomeImpactLifestyleScenario/);
assert.match(displaySource, /householdExpenseAccountPolicyStorage/);
assert.match(displaySource, /resolveHouseholdExpenseAccountPolicy/);
assert.match(displaySource, /TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID/);
assert.match(displaySource, /accountPolicyResolution:\s*policyContext\.resolvedPolicy/);
assert.match(displaySource, /accountPolicySource:\s*householdExpenseAccountPolicyContext\?\.policySource/);
assert.doesNotMatch(displaySource, /model90\.householdExpenseAccountPolicy|HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_PREFIX/);
assert.match(displaySource, /buildLifestyleScenarioRuntimeInput/);
assert.match(displaySource, /basePostDeathSeries:\s*safeContext\.scenario\?\.postDeathSeries/);
assert.match(displaySource, /accountPolicyContext:\s*householdExpenseAccountPolicyContext/);
assert.match(displaySource, /householdExpenseStreamPolicyMode:\s*requestedMode/);
assert.match(displaySource, /lifestyleScenario\?\.comparisonScenario/);
assert.match(displaySource, /baseRenderCache/);
assert.match(displaySource, /buildBaseIncomeImpactContextFromState/);
assert.match(displaySource, /buildIncomeImpactResultFromBaseContext/);
assert.match(
  displaySource,
  /controls\.lifestyleSliderValue[\s\S]{0,180}setDraftScenarioControls\(incomeImpactState, controls\);[\s\S]{0,80}updateScenarioControls\(incomeImpactState\.latestTimelineResult\)/,
  "Lifestyle slider should update draft controls without rebuilding the graph before Reevaluate."
);
assert.doesNotMatch(
  displaySource,
  /controls\.lifestyleSliderValue[\s\S]{0,220}(?:scheduleLifestyleSliderRender|renderIncomeImpactFromState)\(\)/,
  "Lifestyle slider draft changes should not use the old live graph mutation path."
);
assert.doesNotMatch(
  displaySource,
  /renderLifestyleSliderFromState|scheduleLifestyleSliderRender|clearLifestyleSliderRenderFrame|pendingLifestyleSliderFrameId/,
  "Obsolete lifestyle slider live-render helpers should stay removed after Reevaluate draft/apply behavior."
);
assert.match(
  displaySource,
  /controls\.selectedDeathAge[\s\S]{0,180}setDraftScenarioControls\(incomeImpactState, controls\);[\s\S]{0,80}updateScenarioControls\(incomeImpactState\.latestTimelineResult\)/,
  "Death age control changes should update draft controls before Reevaluate."
);
assert.match(
  displaySource,
  /controls\.projectionHorizonYears[\s\S]{0,180}setDraftScenarioControls\(incomeImpactState, controls\);[\s\S]{0,80}updateScenarioControls\(incomeImpactState\.latestTimelineResult\)/,
  "Projection horizon changes should update draft controls before Reevaluate."
);
assert.match(
  displaySource,
  /controls\.mortgageTreatmentOverride[\s\S]{0,180}setDraftScenarioControls\(incomeImpactState, controls\);[\s\S]{0,80}updateScenarioControls\(incomeImpactState\.latestTimelineResult\)/,
  "Mortgage treatment changes should update draft controls before Reevaluate."
);
assert.match(
  displaySource,
  /controls\.autoCompressBaselineEnabled\s*=\s*event\?\.target\?\.checked\s*===\s*true;[\s\S]{0,180}setDraftScenarioControls\(incomeImpactState, controls\);[\s\S]{0,80}updateScenarioControls\(incomeImpactState\.latestTimelineResult\)/,
  "Auto-compress checkbox changes should update draft controls before Reevaluate."
);
assert.match(
  displaySource,
  /applyDraftScenarioControlsToRuntimeState\(incomeImpactState\);[\s\S]{0,120}invalidateIncomeImpactBaseRenderCache\(\);[\s\S]{0,80}renderIncomeImpactFromState\(\)/,
  "Reevaluate should apply draft controls, invalidate the base cache, and rebuild."
);
assert.match(displaySource, /scenarioControlsBound/, "Scenario controls should guard against duplicate event binding.");
assert.doesNotMatch(displaySource, /buildLifestyleComparisonScenario|buildLifestyleAdjustedPostDeathSeries|recalculateLifestyleDepletion/);
assert.match(displaySource, /Lifestyle-adjusted projection/);
assert.match(displaySource, /compressionReport:\s*compressionPrep\?\.compressionReport/);
assert.match(displaySource, /compressionScenarioResult/);
assert.match(displaySource, /buildDisplayAutoCompressedBaselineForPrimaryScenario/);
assert.match(displaySource, /rawBaselineScenario/);
assert.match(displaySource, /primaryScenario/);
assert.match(displaySource, /autoCompressedBaselineScenario/);
assert.match(displaySource, /baselineContract/);
assert.match(displaySource, /Auto-compressed survivor lifestyle/);
assert.match(displaySource, /Unadjusted baseline/);
assert.match(displaySource, /Manual lifestyle comparison only - primary path unchanged\./);
assert.doesNotMatch(displaySource, /calculateIncomeImpactStagedCompressionScenario|compressionStagePolicyRules|staged-compression-post-death-resources|data-income-impact-detail-path="staged-compression"/);
assert.doesNotMatch(displaySource, /compression-post-death-resources|data-income-impact-compression-marker|compressionAction|compressionDepletion|Alternate scenario prepared|Alternate scenario blocked|active compression/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Loss Impact display should not persist scenario or lifestyle state."
);
assert.doesNotMatch(
  displaySource,
  /analysisSettings\.[\s\S]{0,80}householdExpense|householdExpense[\s\S]{0,80}analysisSettings/,
  "Income Loss Impact display should not store account household expense policy in profile Analysis Setup settings."
);
assert.doesNotMatch(readRepoFile("app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js"), /account-settings|householdExpenseAccountPolicyStorage|localStorage|sessionStorage/);
assert.doesNotMatch(readRepoFile("app/features/lens-analysis/income-impact-compression-reporting-prep.js"), /account-settings|householdExpenseAccountPolicyStorage|localStorage|sessionStorage/);
assert.match(componentsSource, /\.income-impact-compression-panel/);
assert.match(componentsSource, /\.income-impact-scenario-field--lifestyle/);
assert.match(componentsSource, /\.income-impact-scenario-field--auto-compress/);
assert.match(componentsSource, /\.income-impact-graph-path--lifestyle-post-death-resources/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-path--compression-post-death-resources/);

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
let capturedCompressionPrepInput = null;
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
    capturedCompressionPrepInput = input;
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
    const comparisonScenario = makeHelperProvidedLifestyleComparison(input, 0);
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      totalBaselineMonthlyExpenses: 1400,
      totalAdjustedMonthlyExpenses: 1400,
      monthlyDelta: 0,
      adjustedExpenses: [],
      comparisonScenario,
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
assert.equal(capturedLifestyleInput.basePostDeathSeries, scenario.postDeathSeries, "display should pass base post-death series into the lifestyle helper");
assert.equal(capturedLifestyleInput.householdExpenseStreamPolicyMode, undefined, "default display call should leave stream mode resolution to the lifestyle helper");
assert.equal(capturedLifestyleInput.accountPolicyResolution, undefined, "missing account policy should leave lifestyle helper on seed fallback path");
assert.equal(capturedCompressionPrepInput.accountPolicyResolution, undefined, "missing account policy should leave compression prep on seed fallback path");
assert.equal(capturedLayer5Input.compressionScenarioResult.status, "complete", "Layer 5 should continue receiving the existing immediate compression scenario result");
assert.equal(capturedGraphInput.comparisonScenarios.length, 1, "graph should receive one lifestyle-adjusted comparison scenario");
assert.equal(capturedGraphInput.comparisonScenarios[0].scenarioId, "income-impact-lifestyle-adjusted-comparison");
assert.equal(capturedGraphInput.comparisonScenarios[0].kind, "lifestyleComparison");
assert.equal(capturedGraphInput.comparisonScenarios[0].pathId, "lifestyle-post-death-resources");
assert.equal(capturedGraphInput.comparisonScenarios[0].label, "Lifestyle-adjusted projection");
assert.equal(capturedGraphInput.comparisonScenarios[0].trace.helperProvidedComparisonFixture, true, "display should consume helper-provided comparison series");
assert.equal(capturedGraphInput.selectedScenarioId, "income-impact-current-scenario", "display should pass the selected applied scenario id into the graph model");
assert.equal(capturedGraphInput.appliedScenarios.length, 1, "display should pass the current applied scenario into the graph model");
assert.equal(capturedGraphInput.appliedScenarios[0].scenarioId, "income-impact-current-scenario");
assert.equal(capturedGraphInput.appliedScenarios[0].label, "Death tomorrow");
assert.deepEqual(clone(capturedGraphInput.appliedScenarios[0].scenario), clone(scenario), "applied graph scenario should carry the current composed scenario");
assert.deepEqual(clone(capturedGraphInput.appliedScenarios[0].riskEvaluation), clone(riskEvaluation), "applied graph scenario should carry the current risk evaluation");
assert.deepEqual(clone(capturedGraphInput.appliedScenarios[0].comparisonScenarios), clone(capturedGraphInput.comparisonScenarios), "applied graph scenario should carry the current lifestyle comparison path contract");
assert.deepEqual(
  capturedGraphInput.comparisonScenarios[0].postDeathSeries.points.map(function (point) { return point.endingResources; }),
  scenario.postDeathSeries.points.map(function (point) { return point.endingResources; }),
  "slider 0 lifestyle comparison should match baseline post-death resources"
);
assert.equal(result.graphModel.trace.scenarioModelMode, "appliedScenarios", "display graph path should report applied-scenario mode");
assert.equal(result.graphModel.trace.appliedScenarioCount, 1);
assert.equal(result.graphModel.trace.selectedScenarioId, "income-impact-current-scenario");
assert.deepEqual(scenario, originalScenario, "display lifestyle wiring should not mutate scenario");
assert.deepEqual(riskEvaluation, originalRiskEvaluation, "display lifestyle wiring should not mutate risk evaluation");
assert.deepEqual(result.scenario.postDeathSeries, originalScenario.postDeathSeries, "base postDeathSeries should remain unchanged");
assert.equal(result.triageInterventions.interventionScenarios.length, 0, "lifestyle graph comparison should not create intervention scenarios");
assert.equal(result.compressionReporting.trace.lifestyleScenarioPrepared, true);
assert.equal(result.compressionReporting.trace.lifestyleScenarioStatus, "complete");
assert.equal(result.compressionReporting.trace.lifestyleSliderValue, 0);
assert.equal(result.compressionReporting.trace.timelineMarkersCreated, false);

const currentHtml = harness.renderTimeline(result);
assert.doesNotMatch(
  currentHtml,
  /data-income-impact-graph-path="lifestyle-post-death-resources"/,
  "Slider 0 lifestyle comparison should not render a duplicate dashed graph path."
);
assert.doesNotMatch(currentHtml, /data-income-impact-graph-path="compression-post-death-resources"/);
assert.doesNotMatch(currentHtml, /Manual lifestyle comparison only - primary path unchanged\./);
assert.doesNotMatch(currentHtml, /staged-compression-post-death-resources|Staged compression|data-income-impact-graph-detail="compression-early-window"|data-income-impact-detail-path=/);
assert.doesNotMatch(currentHtml, /data-income-impact-compression-marker|data-income-impact-comparison-marker-type="comparisonAction"|data-income-impact-comparison-marker-type="comparisonPause"/);

const autoRawScenario = makeScenario();
const autoRawBefore = clone(autoRawScenario);
const autoRiskEvaluation = makeRiskEvaluation();
let autoGraphInput = null;
let autoHelperInput = null;
let autoLifestyleCalls = [];
const autoResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: {
    id: "lens-fixture",
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
    lifestyleSliderValue: 25,
    autoCompressBaselineEnabled: true
  },
  deathAgeState: {
    hasDateOfBirth: false
  },
  composeIncomeImpactScenario() {
    return autoRawScenario;
  },
  evaluateIncomeImpactRiskEvents(input) {
    assert.equal(input.scenario, autoRawScenario);
    return autoRiskEvaluation;
  },
  buildIncomeImpactTimelineGraphModel(input) {
    autoGraphInput = input;
    return makeGraphModel(input);
  },
  buildIncomeImpactAutoCompressedBaseline(input) {
    autoHelperInput = input;
    const adjustedScenario = Object.assign({}, clone(input.rawBaselineScenario), {
      scenarioId: "income-impact-auto-compressed-baseline",
      kind: "autoCompressedBaseline",
      label: "Auto-compressed survivor lifestyle",
      postDeathSeries: Object.assign({}, clone(input.rawBaselineScenario.postDeathSeries), {
        points: input.rawBaselineScenario.postDeathSeries.points.map(function (point) {
          return Object.assign({}, point, {
            endingResources: point.endingResources + 1000,
            autoCompressedFixture: true
          });
        })
      }),
      trace: Object.assign({}, clone(input.rawBaselineScenario.trace || {}), {
        autoCompressedBaselineApplied: true
      })
    });
    return {
      version: "income-impact-auto-compressed-baseline-v1",
      status: "ready",
      autoCompressionEnabled: true,
      compressionHorizon: { source: "rawBaselineDepletionMonth", months: 120 },
      compressionPath: { formula: "linear-monthly-slider-ramp" },
      autoCompressedScenario: adjustedScenario,
      warnings: [],
      trace: {
        source: "fixture-auto-compressed-baseline",
        rawBaselineMutated: false,
        manualLifestyleComparisonPreserved: true,
        visibleBaselineReplacement: false,
        formula: "linear-monthly-slider-ramp",
        horizonSource: "rawBaselineDepletionMonth"
      }
    };
  },
  calculateIncomeImpactLifestyleScenario(input) {
    autoLifestyleCalls.push(input.sliderValue);
    const monthlyDelta = input.sliderValue === -100 ? -500 : (input.sliderValue > 0 ? 250 : 0);
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      totalBaselineMonthlyExpenses: 1400,
      totalAdjustedMonthlyExpenses: 1400 + monthlyDelta,
      monthlyDelta,
      adjustedExpenses: [],
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, monthlyDelta),
      warnings: [],
      dataGaps: [],
      trace: {
        calculationMethod: "income-impact-lifestyle-scenario-v1",
        graphPathChanged: input.sliderValue !== 0
      }
    };
  }
});

assert.deepEqual(autoRawScenario, autoRawBefore, "auto-compressed display wiring should not mutate the raw baseline scenario");
assert.equal(autoHelperInput.rawBaselineScenario, autoRawScenario, "auto helper should receive the raw baseline scenario");
assert.equal(autoHelperInput.options.autoCompressionEnabled, true, "auto helper should be enabled from default scenario controls");
assert.equal(autoHelperInput.compressionPolicy.monthlyDeltaAtConservative, -500, "auto helper should receive the conservative lifestyle policy delta");
assert.deepEqual(autoLifestyleCalls, [25, -100], "manual lifestyle comparison and conservative auto-compression policy should stay separate");
assert.equal(autoGraphInput.scenario.kind, "autoCompressedBaseline", "graph primary scenario should use the auto-compressed baseline when ready");
assert.equal(autoGraphInput.comparisonScenarios.length, 1, "manual lifestyle slider should remain a separate comparison line");
assert.equal(autoGraphInput.comparisonScenarios[0].kind, "lifestyleComparison");
assert.equal(autoResult.rawBaselineScenario, autoRawScenario, "timeline result should preserve the raw unadjusted baseline");
assert.equal(autoResult.primaryScenario.kind, "autoCompressedBaseline", "timeline result should expose the visible primary scenario");
assert.equal(autoResult.autoCompressedBaselineScenario.kind, "autoCompressedBaseline", "timeline result should expose the derived auto-compressed scenario");
assert.equal(autoResult.baselineContract.visibleBaselineMode, "autoCompressed");
assert.equal(autoResult.baselineContract.autoCompressionEnabled, true);
assert.equal(autoResult.baselineContract.autoCompressionApplied, true);
assert.equal(autoResult.baselineContract.rawBaselinePreserved, true);
assert.equal(autoResult.baselineContract.manualLifestyleComparisonPreserved, true);
assert.equal(autoResult.compressionReporting.trace.visibleBaselineMode, "autoCompressed");
assert.equal(autoResult.compressionReporting.trace.autoCompressionApplied, true);
assert.equal(autoResult.financialStoryline.trace.rendered, false, "storyline bridge should remain non-rendering");
const autoTimelineHtml = harness.renderTimeline(autoResult);
assert.match(autoTimelineHtml, /Auto-compressed survivor lifestyle/, "auto-compressed primary graph label should be truthful");
assert.doesNotMatch(autoTimelineHtml, /Unadjusted baseline/, "auto-compressed primary graph should not be labeled as unadjusted");
assert.match(autoTimelineHtml, /Manual lifestyle comparison only - primary path unchanged\./, "manual lifestyle comparison copy should refer to the primary path");

let disabledGraphInput = null;
let disabledHelperCalled = false;
const disabledResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: { id: "lens-fixture" },
  analysisSettings: {},
  scenarioState: {
    projectionHorizonYears: 40,
    mortgageTreatmentOverride: "followAssumptions",
    lifestyleSliderValue: 0,
    autoCompressBaselineEnabled: false
  },
  deathAgeState: {
    hasDateOfBirth: false
  },
  composeIncomeImpactScenario() {
    return autoRawScenario;
  },
  evaluateIncomeImpactRiskEvents() {
    return autoRiskEvaluation;
  },
  buildIncomeImpactTimelineGraphModel(input) {
    disabledGraphInput = input;
    return makeGraphModel(input);
  },
  buildIncomeImpactAutoCompressedBaseline() {
    disabledHelperCalled = true;
    throw new Error("disabled path should not build auto-compression");
  },
  calculateIncomeImpactLifestyleScenario(input) {
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      totalBaselineMonthlyExpenses: 1400,
      totalAdjustedMonthlyExpenses: 1400,
      monthlyDelta: 0,
      adjustedExpenses: [],
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, 0),
      warnings: [],
      dataGaps: [],
      trace: {}
    };
  }
});
assert.equal(disabledHelperCalled, false, "disabled auto-compression should not invoke the auto helper");
assert.equal(disabledGraphInput.scenario, autoRawScenario, "disabled auto-compression should keep raw baseline as graph primary");
assert.equal(disabledResult.baselineContract.visibleBaselineMode, "unadjusted");
assert.equal(disabledResult.baselineContract.autoCompressionEnabled, false);
assert.equal(disabledResult.primaryScenario, autoRawScenario);
assert.equal(disabledResult.autoCompressedBaselineScenario, null);
const disabledTimelineHtml = harness.renderTimeline(disabledResult);
assert.match(disabledTimelineHtml, /Unadjusted baseline/, "disabled auto-compression should label the primary graph as unadjusted");
assert.doesNotMatch(disabledTimelineHtml, /Auto-compressed survivor lifestyle/, "disabled auto-compression should not label the primary graph as auto-compressed");

let fallbackGraphInput = null;
const fallbackResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: { id: "lens-fixture" },
  analysisSettings: {},
  scenarioState: {
    projectionHorizonYears: 40,
    mortgageTreatmentOverride: "followAssumptions",
    lifestyleSliderValue: 0,
    autoCompressBaselineEnabled: true
  },
  deathAgeState: {
    hasDateOfBirth: false
  },
  composeIncomeImpactScenario() {
    return autoRawScenario;
  },
  evaluateIncomeImpactRiskEvents() {
    return autoRiskEvaluation;
  },
  buildIncomeImpactTimelineGraphModel(input) {
    fallbackGraphInput = input;
    return makeGraphModel(input);
  },
  buildIncomeImpactAutoCompressedBaseline() {
    return {
      version: "income-impact-auto-compressed-baseline-v1",
      status: "insufficient-data",
      autoCompressedScenario: null,
      warnings: [{ code: "missing-conservative-lifestyle-target", message: "Missing policy." }],
      compressionHorizon: { source: "unavailable", months: null },
      compressionPath: { formula: "linear-monthly-slider-ramp" },
      trace: {}
    };
  },
  calculateIncomeImpactLifestyleScenario(input) {
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      totalBaselineMonthlyExpenses: 1400,
      totalAdjustedMonthlyExpenses: 1400,
      monthlyDelta: 0,
      adjustedExpenses: [],
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, 0),
      warnings: [],
      dataGaps: [],
      trace: {}
    };
  }
});
assert.equal(fallbackGraphInput.scenario, autoRawScenario, "auto helper fallback should keep raw baseline primary");
assert.equal(fallbackResult.baselineContract.visibleBaselineMode, "unadjusted");
assert.equal(fallbackResult.baselineContract.autoCompressionEnabled, true);
assert.equal(fallbackResult.baselineContract.autoCompressionApplied, false);
assert.ok(fallbackResult.warnings.some(function (warning) {
  return warning.code === "missing-conservative-lifestyle-target";
}), "helper fallback warnings should surface on the timeline result");
const fallbackTimelineHtml = harness.renderTimeline(fallbackResult);
assert.match(fallbackTimelineHtml, /Unadjusted baseline/, "fallback primary graph label should stay unadjusted");
assert.doesNotMatch(fallbackTimelineHtml, /Auto-compressed survivor lifestyle/, "fallback should not falsely label the graph as auto-compressed");

const resolvedAccountPolicy = {
  resolvedLifestyleRangePolicies: [
    {
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      displayName: "Groceries",
      sliderEligible: true,
      rangeBehavior: "compressible",
      conservativeFloorRatio: 0.7,
      elevatedCeilingRatio: 1.2,
      allowBelowBaseline: true,
      allowAboveBaseline: true
    }
  ],
  resolvedCompressionPolicyRules: [
    {
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      decision: "YES",
      compressionOrderRank: 80
    }
  ],
  resolvedCompressionThresholdRules: [
    {
      thresholdId: "account-groceries-threshold",
      expenseTypeKey: "groceries",
      tiers: {
        minimum: 200,
        conservative: 300,
        average: 450,
        comfortable: 650
      },
      protectedFloor: 200
    }
  ],
  warnings: [],
  dataGaps: [],
  trace: {
    calculationMethod: "household-expense-account-policy-resolver-v1"
  }
};
const rawSavedAccountPolicy = {
  version: 1,
  lifestyleRangeOverrides: [],
  compressionThresholdOverrides: [],
  compressionPolicyOverrides: [],
  graphAdjustmentOverrides: [
    {
      expenseTypeKey: "groceries",
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      source: "ADMIN_ENTERED"
    }
  ],
  livingFloorAssumptions: {
    version: 1,
    foodAtHome: {
      monthlyAmountsByBand: { adultFemale: 500 },
      householdSizeAdjustmentFactors: { "1": 1 }
    }
  }
};
let accountPrepInput = null;
let accountLifestyleInput = null;
const accountPolicyResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: {
    ongoingSupport: {
      monthlyFoodCost: 1000,
      monthlyNonHousingEssentialSupportCost: 1000,
      monthlyTotalEssentialSupportCost: 1000
    },
    profileFacts: {},
    pmiFacts: {},
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
    lifestyleSliderValue: -100
  },
  deathAgeState: { hasDateOfBirth: false },
  householdExpenseAccountPolicyContext: {
    accountId: "temporary-local-household-expense-policy-account-v1",
    policySource: "accountOverride",
    resolvedAccountPolicyAvailable: true,
    resolvedPolicy: resolvedAccountPolicy,
    storageResult: { status: "loaded", accountPolicy: rawSavedAccountPolicy },
    trace: { accountIdSource: "temporaryLocalDisplayFallback" }
  },
  composeIncomeImpactScenario() { return scenario; },
  evaluateIncomeImpactRiskEvents() { return riskEvaluation; },
  buildIncomeImpactTimelineGraphModel(input) { return makeGraphModel(input); },
  prepareIncomeImpactCompressionReportingInputs(input) {
    accountPrepInput = input;
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
    accountLifestyleInput = input;
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, -100),
      warnings: [],
      dataGaps: [],
      trace: { calculationMethod: "income-impact-lifestyle-scenario-v1" }
    };
  },
  calculateIncomeImpactTriageInterventions(input) {
    return createLayer5Output(input);
  }
});
assert.equal(accountPrepInput.accountPolicyResolution, resolvedAccountPolicy, "valid saved account policy should be passed into compression prep");
assert.equal(accountPrepInput.accountPolicyResolution.resolvedCompressionThresholdRules[0].thresholdId, "account-groceries-threshold", "resolved threshold override should reach compression prep");
assert.equal(accountPrepInput.accountPolicyResolution.resolvedCompressionPolicyRules[0].decision, "YES", "resolved compression policy override should reach compression prep");
assert.equal(accountLifestyleInput.accountPolicyResolution, resolvedAccountPolicy, "valid saved account policy should be passed into lifestyle scenario helper");
assert.equal(accountLifestyleInput.accountPolicyResolution.resolvedLifestyleRangePolicies[0].conservativeFloorRatio, 0.7, "resolved lifestyle range override should reach lifestyle helper");
assert.equal(accountLifestyleInput.accountPolicy, rawSavedAccountPolicy, "raw saved account policy should be passed for stream mode readiness");
assert.equal(accountLifestyleInput.accountPolicy.graphAdjustmentOverrides[0].expenseTypeKey, "groceries", "raw graph adjustment overrides should reach the lifestyle helper input");
assert.equal(accountLifestyleInput.accountPolicy.livingFloorAssumptions.foodAtHome.monthlyAmountsByBand.adultFemale, 500, "raw living-floor assumptions should reach the lifestyle helper input");
assert.equal(accountLifestyleInput.accountPolicyContext.storageResult.accountPolicy, rawSavedAccountPolicy, "account policy context should carry the raw saved account policy");
assert.equal(accountLifestyleInput.lensModel.ongoingSupport.monthlyTotalEssentialSupportCost, 1000, "lifestyle helper input should carry full lensModel support totals");
assert.equal(accountLifestyleInput.ongoingSupport.monthlyFoodCost, 1000, "lifestyle helper input should carry ongoingSupport directly");
assert.deepEqual(accountLifestyleInput.profileFacts, {}, "lifestyle helper input should not require profile state for living-floor assumptions");
assert.deepEqual(accountLifestyleInput.pmiFacts, {}, "lifestyle helper input should not require PMI/tax state for living-floor assumptions");
assert.equal(accountLifestyleInput.valuationDate, "2026-05-06", "lifestyle helper input should carry valuation date");
assert.equal(accountLifestyleInput.scenarioContext.deceasedInsuredRole, "client", "lifestyle helper input should carry remaining-household scenario context");
assert.equal(accountLifestyleInput.householdExpenseStreamPolicyMode, undefined, "display should pass complete inputs without hard-coding the stream mode default");
assert.equal(accountPolicyResult.compressionReporting.trace.accountPolicySource, "accountOverride", "result trace should expose account override policy source");
assert.equal(accountPolicyResult.compressionReporting.trace.accountPolicyStorageStatus, "loaded", "result trace should expose storage load status");
assert.equal(accountPolicyResult.compressionReporting.trace.accountPolicyAccountIdSource, "temporaryLocalDisplayFallback", "result trace should expose temporary local account id source");

let activeGraphLifestyleInput = null;
const activeGraphState = {
  valuationDate: "2026-05-06",
  profileRecord: {
    state: "CO",
    maritalStatus: "Married",
    spouseAge: 40,
    spouseGender: "female"
  },
  lensModel: {
    ongoingSupport: {
      monthlyFoodCost: 1000,
      monthlyNonHousingEssentialSupportCost: 1000,
      monthlyTotalEssentialSupportCost: 1000
    },
    profileFacts: {
      addressState: "CO"
    },
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
    lifestyleSliderValue: -100,
    householdExpenseStreamPolicyMode: "activeGraphAdjustments"
  },
  deathAgeState: { hasDateOfBirth: false },
  householdExpenseAccountPolicyContext: {
    accountId: "temporary-local-household-expense-policy-account-v1",
    policySource: "accountOverride",
    resolvedAccountPolicyAvailable: true,
    resolvedPolicy: resolvedAccountPolicy,
    storageResult: { status: "loaded", accountPolicy: rawSavedAccountPolicy },
    trace: { accountIdSource: "temporaryLocalDisplayFallback" }
  },
  composeIncomeImpactScenario() { return scenario; },
  evaluateIncomeImpactRiskEvents() { return riskEvaluation; },
  buildIncomeImpactTimelineGraphModel(input) { return makeGraphModel(input); },
  prepareIncomeImpactCompressionReportingInputs() {
    return { compressionReport, compressionPolicyRules, warnings: [], dataGaps: [], trace: { reportingOnly: true } };
  },
  calculateIncomeImpactCompressionScenario(input) {
    return createCompressionScenarioResult(input);
  },
  calculateIncomeImpactLifestyleScenario(input) {
    activeGraphLifestyleInput = input;
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, -100),
      warnings: [],
      dataGaps: [],
      trace: { calculationMethod: "income-impact-lifestyle-scenario-v1" }
    };
  },
  calculateIncomeImpactTriageInterventions(input) {
    return createLayer5Output(input);
  }
};
harness.buildIncomeImpactResultFromState(activeGraphState);
assert.equal(activeGraphLifestyleInput.householdExpenseStreamPolicyMode, "activeGraphAdjustments", "internal scenario state should opt into active stream graph adjustments");
assert.equal(activeGraphLifestyleInput.accountPolicy, rawSavedAccountPolicy, "active stream display call should receive raw saved account policy");
assert.equal(activeGraphLifestyleInput.profileRecord.state, "CO", "active stream display call should receive profile record state");
assert.equal(activeGraphLifestyleInput.lensModel.ongoingSupport.monthlyTotalEssentialSupportCost, 1000, "active stream display call should receive lens model support totals");
assert.equal(activeGraphLifestyleInput.scenarioContext.source, "incomeImpactScenario", "active stream display call should receive scenario context");

let fallbackPrepInput = null;
let fallbackLifestyleInput = null;
const fallbackPolicyResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: {
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
    lifestyleSliderValue: -100
  },
  deathAgeState: { hasDateOfBirth: false },
  householdExpenseAccountPolicyContext: {
    accountId: "temporary-local-household-expense-policy-account-v1",
    policySource: "fallbackPolicy",
    resolvedAccountPolicyAvailable: false,
    resolvedPolicy: resolvedAccountPolicy,
    storageResult: {
      status: "fallback",
      metadata: { fallbackReason: "corrupt-account-policy-json" }
    },
    trace: { accountIdSource: "temporaryLocalDisplayFallback" }
  },
  composeIncomeImpactScenario() { return scenario; },
  evaluateIncomeImpactRiskEvents() { return riskEvaluation; },
  buildIncomeImpactTimelineGraphModel(input) { return makeGraphModel(input); },
  prepareIncomeImpactCompressionReportingInputs(input) {
    fallbackPrepInput = input;
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
    fallbackLifestyleInput = input;
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, -100),
      warnings: [],
      dataGaps: [],
      trace: { calculationMethod: "income-impact-lifestyle-scenario-v1" }
    };
  },
  calculateIncomeImpactTriageInterventions(input) {
    return createLayer5Output(input);
  }
});
assert.equal(fallbackPrepInput.accountPolicyResolution, undefined, "corrupt saved account policy should not pass explicit resolved policy into compression prep");
assert.equal(fallbackLifestyleInput.accountPolicyResolution, undefined, "corrupt saved account policy should not pass explicit resolved policy into lifestyle helper");
assert.equal(fallbackPolicyResult.compressionReporting.trace.accountPolicySource, "fallbackPolicy", "corrupt saved account policy should trace fallback policy source");
assert.equal(fallbackPolicyResult.compressionReporting.trace.accountPolicyStorageFallbackReason, "corrupt-account-policy-json", "corrupt saved account policy should trace fallback reason");

const panelHtml = harness.renderCompressionReportingPanel(result);
assert.match(panelHtml, /data-income-impact-compression-panel/);
assert.match(panelHtml, /Expense Compression Readiness/);
assert.match(panelHtml, /Reporting only - not applied to the projection\./);
assert.match(panelHtml, /Lifestyle comparison: Current/);
assert.doesNotMatch(panelHtml, /Alternate scenario prepared|Alternate scenario blocked|active compression/);
assert.match(panelHtml, /First reductions to review/);
assert.match(panelHtml, /Dining Out/);
assert.match(panelHtml, /Groceries/);
assert.match(panelHtml, /Contribution pauses/);
assert.match(panelHtml, /Retirement Contribution/);
assert.match(panelHtml, /Protected \/ excluded items/);
assert.match(panelHtml, /Auto Loan Payment/);
assert.match(panelHtml, /Source-owned by Debt Records/);
assert.match(panelHtml, /Policy summary/);

let cachedComposeCallCount = 0;
let cachedRiskCallCount = 0;
let cachedPrepCallCount = 0;
let cachedCompressionScenarioCallCount = 0;
let cachedLayer5CallCount = 0;
let cachedLifestyleCallCount = 0;
let cachedGraphCallCount = 0;
const cachedState = {
  valuationDate: "2026-05-06",
  lensModel: {
    id: "lens-cached-slider-fixture",
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
  deathAgeState: { hasDateOfBirth: false },
  composeIncomeImpactScenario() {
    cachedComposeCallCount += 1;
    return scenario;
  },
  evaluateIncomeImpactRiskEvents() {
    cachedRiskCallCount += 1;
    return riskEvaluation;
  },
  buildIncomeImpactTimelineGraphModel(input) {
    cachedGraphCallCount += 1;
    return makeGraphModel(input);
  },
  prepareIncomeImpactCompressionReportingInputs() {
    cachedPrepCallCount += 1;
    return {
      compressionReport,
      compressionPolicyRules,
      warnings: [],
      dataGaps: [],
      trace: { reportingOnly: true }
    };
  },
  calculateIncomeImpactCompressionScenario(input) {
    cachedCompressionScenarioCallCount += 1;
    return createCompressionScenarioResult(input);
  },
  calculateIncomeImpactLifestyleScenario(input) {
    cachedLifestyleCallCount += 1;
    const monthlyDelta = input.sliderValue < 0 ? -500 : (input.sliderValue > 0 ? 250 : 0);
    return {
      status: "complete",
      sliderValue: input.sliderValue,
      monthlyDelta,
      adjustedExpenses: [],
      comparisonScenario: makeHelperProvidedLifestyleComparison(input, monthlyDelta),
      warnings: [],
      dataGaps: [],
      trace: { calculationMethod: "income-impact-lifestyle-scenario-v1" }
    };
  },
  calculateIncomeImpactTriageInterventions(input) {
    cachedLayer5CallCount += 1;
    return createLayer5Output(input);
  }
};
const cachedBaseContext = harness.buildBaseIncomeImpactContextFromState(cachedState);
const cachedCurrentResult = harness.buildIncomeImpactResultFromBaseContext(cachedState, cachedBaseContext, 0);
const cachedConservativeResult = harness.buildIncomeImpactResultFromBaseContext(cachedState, cachedBaseContext, -100);
const cachedElevatedResult = harness.buildIncomeImpactResultFromBaseContext(cachedState, cachedBaseContext, 100);
assert.equal(cachedComposeCallCount, 1, "cached lifestyle updates should reuse the composed base scenario");
assert.equal(cachedRiskCallCount, 1, "cached lifestyle updates should reuse risk evaluation");
assert.equal(cachedPrepCallCount, 1, "cached lifestyle updates should reuse compression reporting prep");
assert.equal(cachedCompressionScenarioCallCount, 1, "cached lifestyle updates should reuse immediate compression scenario reporting");
assert.equal(cachedLayer5CallCount, 1, "cached lifestyle updates should reuse Layer 5 reporting output");
assert.equal(cachedLifestyleCallCount, 3, "cached lifestyle updates should only recalculate lifestyle scenario output");
assert.equal(cachedGraphCallCount, 3, "cached lifestyle updates should rebuild graph data for each slider value");
assert.deepEqual(
  cachedCurrentResult.graphModel.series.comparisonPostDeathResources[0].points.map(function (point) { return point.value; }),
  scenario.postDeathSeries.points.map(function (point) { return point.endingResources; }),
  "Cached Current/0 lifestyle comparison should match baseline resources."
);
assert.deepEqual(
  cachedConservativeResult.graphModel.series.comparisonPostDeathResources[0].points.map(function (point) { return point.value; }),
  [500500, 497500, 494500],
  "Cached Conservative lifestyle should improve the comparison resources."
);
assert.deepEqual(
  cachedElevatedResult.graphModel.series.comparisonPostDeathResources[0].points.map(function (point) { return point.value; }),
  [499750, 496000, 492250],
  "Cached Elevated lifestyle should reduce the comparison resources."
);
const cachedConservativeHtml = harness.renderTimeline(cachedConservativeResult);
assert.equal((cachedConservativeHtml.match(/data-income-impact-graph-path="postDeathResources"/g) || []).length, 1);
assert.equal((cachedConservativeHtml.match(/data-income-impact-graph-path="lifestyle-post-death-resources"/g) || []).length, 1);
assert.doesNotMatch(cachedConservativeHtml, /compression-post-death-resources|staged-compression-post-death-resources|data-income-impact-compression-marker|data-income-impact-comparison-marker-type="stage/);
const originalCacheKey = harness.getBaseRenderCacheKey(cachedState);
cachedState.scenarioState.projectionHorizonYears = 55;
assert.notEqual(
  harness.getBaseRenderCacheKey(cachedState),
  originalCacheKey,
  "Base scenario controls should change the cache key so slider-only reuse cannot cross base-control changes."
);

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
      const comparisonScenario = makeHelperProvidedLifestyleComparison(input, monthlyDelta);
      return {
        status: "complete",
        sliderValue: input.sliderValue,
        totalBaselineMonthlyExpenses: 1000,
        totalAdjustedMonthlyExpenses: 1000 + monthlyDelta,
        monthlyDelta,
        adjustedExpenses: [],
        comparisonScenario,
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
