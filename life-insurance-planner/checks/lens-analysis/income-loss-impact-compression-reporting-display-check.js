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
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          survivorNeeds: 4000,
          endingResources: 500000
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

function makeGraphModel() {
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
        { value: 120000, xRatio: 0.9, yRatio: 0.7 }
      ]
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
    selectedEvent: null,
    callouts: [
      { id: "resources-after-obligations", label: "Resources after obligations", value: 500000, kind: "currency", phase: "deathEvent" }
    ],
    warnings: [],
    dataGaps: []
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
  "../app/features/lens-analysis/household-expense-compression-stage-policy.js",
  "../app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
  "../app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js",
  "../app/features/lens-analysis/income-impact-timeline-graph-model.js",
  "../app/features/lens-analysis/income-impact-triage-intervention-calculations.js",
  "../app/features/lens-analysis/income-impact-compression-reporting-prep.js",
  "../app/features/lens-analysis/income-impact-compression-scenario-calculations.js",
  "../app/features/lens-analysis/income-impact-staged-compression-scenario-calculations.js",
  "../app/features/lens-analysis/income-loss-impact-display.js"
]);

assert.equal(typeof harness.buildIncomeImpactResultFromState, "function", "display harness should expose result builder");
assert.equal(typeof harness.renderCompressionReportingPanel, "function", "display harness should expose compression panel renderer");
assert.equal(typeof harness.renderIncomeImpact, "function", "display harness should expose main renderer");
assert.equal(typeof harness.renderTimeline, "function", "display harness should expose timeline renderer");

assert.match(displaySource, /prepareIncomeImpactCompressionReportingInputs/);
assert.match(displaySource, /calculateIncomeImpactTriageInterventions/);
assert.match(displaySource, /calculateIncomeImpactCompressionScenario/);
assert.match(displaySource, /calculateIncomeImpactStagedCompressionScenario/);
assert.match(displaySource, /compressionStagePolicyRules/);
assert.match(displaySource, /compressionReport:\s*compressionPrep\?\.compressionReport/);
assert.match(displaySource, /compressionPolicyRules:\s*compressionPrep\?\.compressionPolicyRules/);
assert.match(displaySource, /compressionScenarioResult/);
assert.match(displaySource, /Expense Compression Readiness/);
assert.match(displaySource, /Reporting only - not applied to the projection\./);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Loss Impact display should not persist scenario or compression state."
);
assert.match(componentsSource, /\.income-impact-compression-panel/);
assert.match(componentsSource, /\.income-impact-compression-counts/);
assert.match(componentsSource, /\.income-impact-graph-detail/);
assert.match(displaySource, /GRAPH_PATH_SMOOTHING_TENSION/);
assert.match(displaySource, /buildSmoothedSvgPath/);
assert.match(displaySource, /buildStepSvgPath/);
assert.match(displaySource, /shouldRenderCompressionMarkerLabel/);
assert.match(componentsSource, /vector-effect:\s*non-scaling-stroke;/);
assert.match(componentsSource, /shape-rendering:\s*geometricPrecision;/);
assert.match(displaySource, /data-income-impact-graph-detail="compression-early-window"/);
assert.match(displaySource, /Actual values, local scale/);
assert.match(displaySource, /data-income-impact-detail-path="immediate-compression"/);
assert.match(displaySource, /data-income-impact-detail-path="staged-compression"/);
assert.match(displaySource, /data-income-impact-graph-path-mode/);
assert.match(displaySource, /data-income-impact-detail-path-mode="step"/);
assert.doesNotMatch(displaySource, /fakeOffset|visualOffset|artificialVisualOffset/);

const scenario = makeScenario();
const riskEvaluation = makeRiskEvaluation();
const graphModel = makeGraphModel();
const compressionReport = {
  status: "partial",
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
      currentMonthlyAmount: 500
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
  dataGaps: [
    {
      code: "scalar-household-expenses-not-itemized-for-compression",
      message: "Scalar household ongoingSupport expenses are present but are not fully itemized as compression-ready expense facts."
    }
  ],
  warnings: [],
  trace: {
    mode: "reportingOnly"
  }
};
const compressionPolicyRules = [
  { decision: "YES", expenseTypeKey: "diningOutRestaurants", compressionOrderGroup: "earlyDiscretionary", compressionOrderRank: 1 },
  { decision: "YES", expenseTypeKey: "groceries", compressionOrderGroup: "groceriesAndProtectedFlexibleEssentials", compressionOrderRank: 7 },
  { decision: "PAUSE", expenseTypeKey: "retirementContributions", compressionOrderGroup: "pauseContributions", compressionOrderRank: 4 },
  { decision: "NO", expenseTypeKey: "autoLoanPayment", compressionOrderGroup: "debtObligations", compressionOrderRank: 18 },
  { decision: "INTERVENTION", expenseTypeKey: "housingPayment", compressionOrderGroup: "majorInterventions", compressionOrderRank: 21 }
];
const compressionStagePolicyRules = [
  {
    stageId: "immediate-discretionary-compression",
    stageName: "Immediate discretionary compression",
    stageOrder: 1,
    stageType: "reduction",
    effectiveMonthAfterDeath: 1,
    triggerMode: "fixedMonthV1",
    decisionsAllowed: ["YES"],
    compressionOrderGroups: ["earlyDiscretionary"],
    appliesMath: true,
    markerOnly: false
  },
  {
    stageId: "contribution-pauses",
    stageName: "Contribution pauses",
    stageOrder: 2,
    stageType: "pause",
    effectiveMonthAfterDeath: 2,
    triggerMode: "fixedMonthV1",
    decisionsAllowed: ["PAUSE"],
    compressionOrderGroups: ["pauseContributions"],
    appliesMath: true,
    markerOnly: false
  }
];
const layer5Output = {
  compressionOpportunities: compressionReport.opportunities,
  pauseCandidates: compressionReport.pauseCandidates,
  protectedExpenseItems: compressionReport.protectedItems,
  excludedExpenseItems: compressionReport.excludedItems,
  advisorReviewItems: compressionReport.advisorReviewItems,
  compressionDataGaps: compressionReport.dataGaps,
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
  dataGaps: scenario.dataGaps
};

function createCompressionScenarioResult(input) {
  const hasScalarItemizationGap = (Array.isArray(input.compressionReport?.dataGaps) ? input.compressionReport.dataGaps : [])
    .some(function (gap) {
      return gap?.code === "scalar-household-expenses-not-itemized-for-compression";
    });
  if (hasScalarItemizationGap) {
    return {
      status: "blocked",
      dataGaps: [
        {
          code: "active-compression-blocked-by-scalar-household-itemization-gap",
          message: "Scalar household expenses are not fully itemized as compression-ready facts; active alternate compression would be misleading."
        }
      ],
      warnings: [],
      trace: {
        calculationMethod: "income-impact-compression-scenario-v1",
        mode: "alternateScenarioOnly",
        blockedReasons: ["active-compression-blocked-by-scalar-household-itemization-gap"]
      }
    };
  }

  return {
    status: "complete",
    baseScenarioUnchanged: true,
    compressionScenario: {
      scenarioId: input.options?.scenarioId || "income-impact-expense-compression-alternate",
      label: "Expense compression alternate scenario",
      adjustedMonthlyNeed: 3350,
      adjustedAnnualNeed: 40200,
      reductionsApplied: [
        {
          typeKey: "diningOutRestaurants",
          label: "Dining Out",
          monthlyAmount: 150,
          compressionOrderRank: 1
        }
      ],
      pausesApplied: [
        {
          typeKey: "retirementContributions",
          label: "Retirement Contribution",
          monthlyAmount: 500,
          compressionOrderRank: 4
        }
      ],
      postDeathSeries: {
        points: [
          {
            monthIndex: 1,
            date: "2031-06-06",
            endingResources: 500650
          },
          {
            monthIndex: 120,
            date: "2041-05-06",
            endingResources: 180000
          }
        ]
      },
      trace: {
        calculationMethod: "income-impact-compression-scenario-v1",
        baseScenarioMutated: false,
        graphPathChanged: false
      }
    },
    dataGaps: [],
    warnings: [],
    trace: {
      calculationMethod: "income-impact-compression-scenario-v1",
      mode: "alternateScenarioOnly"
    }
  };
}

function createStagedCompressionScenarioResult(input) {
  const hasScalarItemizationGap = (Array.isArray(input.compressionReport?.dataGaps) ? input.compressionReport.dataGaps : [])
    .some(function (gap) {
      return gap?.code === "scalar-household-expenses-not-itemized-for-compression";
    });
  if (hasScalarItemizationGap) {
    return {
      status: "blocked",
      stagedCompressionScenario: null,
      dataGaps: [
        {
          code: "active-staged-compression-blocked-by-scalar-household-itemization-gap",
          message: "Scalar household expenses are not fully itemized as compression-ready facts; active staged alternate compression would be misleading."
        }
      ],
      warnings: [],
      trace: {
        calculationMethod: "income-impact-staged-compression-scenario-v1",
        mode: "stagedAlternateScenarioOnly"
      }
    };
  }

  return {
    status: "complete",
    baseScenarioUnchanged: true,
    stagedCompressionScenario: {
      scenarioId: input.options?.scenarioId || "income-impact-staged-expense-compression-alternate",
      label: "Staged expense compression alternate scenario",
      reductionsApplied: [
        {
          typeKey: "diningOutRestaurants",
          label: "Dining Out",
          monthlyAmount: 150,
          compressionOrderRank: 1,
          stageId: "immediate-discretionary-compression",
          effectiveMonthAfterDeath: 1
        }
      ],
      pausesApplied: [
        {
          typeKey: "retirementContributions",
          label: "Retirement Contribution",
          monthlyAmount: 500,
          compressionOrderRank: 4,
          stageId: "contribution-pauses",
          effectiveMonthAfterDeath: 2
        }
      ],
      stageEvents: [
        {
          stageId: "immediate-discretionary-compression",
          stageName: "Immediate discretionary compression",
          stageType: "reduction",
          effectiveMonthAfterDeath: 1,
          actionsApplied: [{ typeKey: "diningOutRestaurants" }]
        },
        {
          stageId: "contribution-pauses",
          stageName: "Contribution pauses",
          stageType: "pause",
          effectiveMonthAfterDeath: 2,
          actionsApplied: [{ typeKey: "retirementContributions" }]
        }
      ],
      markerOnlyEvents: [],
      postDeathSeries: {
        points: [
          {
            monthIndex: 1,
            date: "2031-06-06",
            endingResources: 500150
          },
          {
            monthIndex: 2,
            date: "2031-07-06",
            endingResources: 500800
          },
          {
            monthIndex: 120,
            date: "2041-05-06",
            endingResources: 175000
          }
        ]
      },
      trace: {
        calculationMethod: "income-impact-staged-compression-scenario-v1",
        baseScenarioMutated: false,
        graphPathChanged: false
      }
    },
    dataGaps: [],
    warnings: [],
    trace: {
      calculationMethod: "income-impact-staged-compression-scenario-v1",
      mode: "stagedAlternateScenarioOnly"
    }
  };
}

function createLayer5Output(input) {
  const scenarioResult = input.compressionScenarioResult;
  const complete = scenarioResult?.status === "complete" && scenarioResult.compressionScenario;
  return {
    ...layer5Output,
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
    interventionScenarios: []
  };
}

let prepCallCount = 0;
let compressionScenarioCallCount = 0;
let stagedCompressionScenarioCallCount = 0;
let layer5CallCount = 0;
let graphCallCount = 0;
let capturedCompressionScenarioInput = null;
let capturedStagedCompressionScenarioInput = null;
let capturedLayer5Input = null;
let capturedGraphInput = null;
const originalScenario = clone(scenario);
const originalRiskEvaluation = clone(riskEvaluation);
const originalGraphHtml = harness.renderTimeline({
  graphModel,
  dataGaps: scenario.dataGaps,
  warnings: []
});
const result = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: {
    id: "lens-fixture"
  },
  analysisSettings: {},
  scenarioState: {
    projectionHorizonYears: 40,
    mortgageTreatmentOverride: "followAssumptions"
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
    assert.deepEqual(input.comparisonScenarios, [], "Blocked compression scenario should not be passed to the graph as a comparison path.");
    return graphModel;
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
      dataGaps: compressionReport.dataGaps,
      trace: {
        reportingOnly: true
      }
    };
  },
  calculateIncomeImpactCompressionScenario(input) {
    compressionScenarioCallCount += 1;
    capturedCompressionScenarioInput = input;
    return createCompressionScenarioResult(input);
  },
  calculateIncomeImpactStagedCompressionScenario(input) {
    stagedCompressionScenarioCallCount += 1;
    capturedStagedCompressionScenarioInput = input;
    return createStagedCompressionScenarioResult(input);
  },
  compressionStagePolicyRules,
  calculateIncomeImpactTriageInterventions(input) {
    layer5CallCount += 1;
    capturedLayer5Input = input;
    return createLayer5Output(input);
  }
});

assert.equal(prepCallCount, 1, "display should prepare compression reporting inputs once");
assert.equal(compressionScenarioCallCount, 1, "display should calculate compression scenario result once after prep");
assert.equal(stagedCompressionScenarioCallCount, 1, "display should calculate staged compression scenario result once after prep");
assert.equal(layer5CallCount, 1, "display should pass compression output into Layer 5 once");
assert.equal(graphCallCount, 1, "display should build graph once");
assert.equal(capturedCompressionScenarioInput.scenario, scenario, "compression scenario helper should receive the composed base scenario");
assert.equal(capturedCompressionScenarioInput.compressionReport, compressionReport, "compression scenario helper should receive prepared compressionReport");
assert.equal(capturedCompressionScenarioInput.compressionPolicyRules, compressionPolicyRules, "compression scenario helper should receive prepared policy rules");
assert.deepEqual(clone(capturedCompressionScenarioInput.options), {
  mode: "alternateScenarioOnly",
  scenarioId: "income-impact-expense-compression-alternate",
  applyPauseCandidates: true,
  requireCompleteItemization: true
});
assert.equal(capturedStagedCompressionScenarioInput.scenario, scenario, "staged helper should receive the composed base scenario");
assert.equal(capturedStagedCompressionScenarioInput.compressionReport, compressionReport, "staged helper should receive prepared compressionReport");
assert.equal(capturedStagedCompressionScenarioInput.compressionPolicyRules, compressionPolicyRules, "staged helper should receive prepared policy rules");
assert.equal(capturedStagedCompressionScenarioInput.compressionStagePolicyRules, compressionStagePolicyRules, "staged helper should receive explicit stage policy rules");
assert.deepEqual(clone(capturedStagedCompressionScenarioInput.options), {
  mode: "stagedAlternateScenarioOnly",
  scenarioId: "income-impact-staged-expense-compression-alternate",
  applyPauseCandidates: true,
  requireCompleteItemization: true,
  includeMarkerOnlyEvents: true
});
assert.equal(capturedLayer5Input.scenario, scenario, "Layer 5 should receive the composed scenario");
assert.equal(capturedLayer5Input.riskEvaluation, riskEvaluation, "Layer 5 should receive risk evaluation");
assert.equal(capturedLayer5Input.compressionReport, compressionReport, "Layer 5 should receive prepared compressionReport");
assert.equal(capturedLayer5Input.compressionPolicyRules, compressionPolicyRules, "Layer 5 should receive prepared policy rules");
assert.equal(capturedLayer5Input.compressionScenarioResult.status, "blocked", "Layer 5 should receive blocked compression scenario result");
assert.deepEqual(capturedGraphInput.comparisonScenarios, [], "Graph model should receive no comparisonScenarios for blocked compression scenario.");
assert.deepEqual(scenario, originalScenario, "display compression reporting should not mutate scenario");
assert.deepEqual(riskEvaluation, originalRiskEvaluation, "display compression reporting should not mutate risk evaluation");
assert.deepEqual(result.scenario.postDeathSeries, originalScenario.postDeathSeries, "postDeathSeries should remain unchanged");
assert.equal(result.triageInterventions.interventionScenarios.length, 0, "compression reporting should not create intervention scenarios");
assert.equal(result.triageInterventions.compressionScenarios.length, 0, "blocked compression scenario should not expose alternate scenarios");
assert.equal(result.triageInterventions.compressionScenarioTrace.alternateScenarioBlocked, true, "blocked state should pass through Layer 5");
assert.ok(
  result.triageInterventions.compressionScenarioDataGaps.some((gap) => gap.code === "active-compression-blocked-by-scalar-household-itemization-gap"),
  "blocked compression scenario data gap should pass through Layer 5"
);
assert.equal(result.compressionReporting.trace.reportingOnly, true);
assert.equal(result.compressionReporting.trace.graphPathChanged, false);
assert.equal(result.compressionReporting.trace.reductionsApplied, false);
assert.equal(result.compressionReporting.trace.alternateScenarioPrepared, true);
assert.equal(result.compressionReporting.trace.alternateScenarioStatus, "blocked");
assert.equal(result.compressionReporting.trace.stagedAlternateScenarioPrepared, true);
assert.equal(result.compressionReporting.trace.stagedAlternateScenarioStatus, "blocked");
assert.equal(result.compressionReporting.trace.timelineMarkersCreated, false);
assert.equal(result.dataGaps.some((gap) => gap.code === "scalar-household-expenses-not-itemized-for-compression"), false);
assert.equal(result.dataGaps.some((gap) => gap.code === "active-compression-blocked-by-scalar-household-itemization-gap"), false);

const graphHtmlAfterCompression = harness.renderTimeline(result);
assert.equal(graphHtmlAfterCompression, originalGraphHtml, "graph/timeline output should be unchanged by compression reporting");
assert.equal(
  (graphHtmlAfterCompression.match(/data-income-impact-graph-marker/g) || []).length,
  (originalGraphHtml.match(/data-income-impact-graph-marker/g) || []).length,
  "compression reporting should not create timeline markers"
);

const panelHtml = harness.renderCompressionReportingPanel(result);
assert.match(panelHtml, /data-income-impact-compression-panel/);
assert.match(panelHtml, /Expense Compression Readiness/);
assert.match(panelHtml, /Reporting only - not applied to the projection\./);
assert.match(panelHtml, /Alternate scenario blocked/);
assert.match(panelHtml, /Not applied to the projection/);
assert.match(panelHtml, /First reductions to review/);
assert.match(panelHtml, /Dining Out/);
assert.match(panelHtml, /Groceries/);
assert.ok(
  panelHtml.indexOf("Dining Out") < panelHtml.indexOf("Groceries"),
  "reduction items should be sorted by compression policy order/rank"
);
assert.match(panelHtml, /Contribution pauses/);
assert.match(panelHtml, /Retirement Contribution/);
assert.match(panelHtml, /Protected \/ excluded items/);
assert.match(panelHtml, /Auto Loan Payment/);
assert.match(panelHtml, /Source-owned by Debt Records/);
assert.match(panelHtml, /Data limitations/);
assert.match(panelHtml, /Scalar household itemization limitation/);
assert.match(panelHtml, /Scalar household ongoingSupport expenses are present/);
assert.match(panelHtml, /active alternate compression would be misleading/);
assert.match(panelHtml, /Policy summary/);
assert.match(panelHtml, /data-income-impact-compression-policy-summary/);

const completeCompressionReport = clone(compressionReport);
completeCompressionReport.dataGaps = [];
completeCompressionReport.pauseCandidates[0].possibleMonthlyPauseAmount = 500;
let completeCapturedLayer5Input = null;
let completeCapturedGraphInput = null;
const completeResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: {
    id: "lens-complete-fixture"
  },
  analysisSettings: {},
  scenarioState: {
    projectionHorizonYears: 40,
    mortgageTreatmentOverride: "followAssumptions"
  },
  deathAgeState: {
    hasDateOfBirth: false
  },
  composeIncomeImpactScenario() {
    return scenario;
  },
  evaluateIncomeImpactRiskEvents() {
    return riskEvaluation;
  },
  buildIncomeImpactTimelineGraphModel(input) {
    completeCapturedGraphInput = input;
    if (Array.isArray(input.comparisonScenarios) && input.comparisonScenarios.length) {
      return {
        ...graphModel,
        series: {
          ...graphModel.series,
          comparisonPostDeathResources: input.comparisonScenarios.map(function (comparisonScenario) {
            return {
              scenarioId: comparisonScenario.scenarioId,
              kind: comparisonScenario.kind,
              pathId: comparisonScenario.pathId,
              label: comparisonScenario.label,
              points: [
                { date: "2031-06-06", value: 500650, xRatio: 0.3, yRatio: 0.29 },
                { date: "2041-05-06", value: 180000, xRatio: 0.9, yRatio: 0.64 }
              ]
            };
          }),
          comparisonEarlyDetail: input.comparisonScenarios.length > 1
            ? {
                windowMonths: 24,
                yDomain: { min: 499000, max: 502000 },
                points: [
                  {
                    monthIndex: 1,
                    date: "2031-06-06",
                    immediateEndingResources: 500650,
                    stagedEndingResources: 500150,
                    difference: -500,
                    xRatio: 0,
                    immediateYRatio: 0.35,
                    stagedYRatio: 0.52
                  },
                  {
                    monthIndex: 2,
                    date: "2031-07-06",
                    immediateEndingResources: 501300,
                    stagedEndingResources: 500800,
                    difference: -500,
                    xRatio: 1,
                    immediateYRatio: 0.13,
                    stagedYRatio: 0.3
                  }
                ],
                trace: {
                  localScale: true,
                  usesMainGraphYDomain: false,
                  artificialOffsetApplied: false,
                  actualValuesOnly: true
                }
              }
            : null
        }
      };
    }
    return graphModel;
  },
  prepareIncomeImpactCompressionReportingInputs() {
    return {
      compressionReport: completeCompressionReport,
      compressionPolicyRules,
      warnings: [],
      dataGaps: [],
      trace: {
        reportingOnly: true
      }
    };
  },
  calculateIncomeImpactCompressionScenario(input) {
    return createCompressionScenarioResult(input);
  },
  calculateIncomeImpactStagedCompressionScenario(input) {
    return createStagedCompressionScenarioResult(input);
  },
  compressionStagePolicyRules,
  calculateIncomeImpactTriageInterventions(input) {
    completeCapturedLayer5Input = input;
    return createLayer5Output(input);
  }
});
assert.equal(completeCapturedLayer5Input.compressionScenarioResult.status, "complete", "Layer 5 should receive complete compression scenario result");
assert.equal(completeResult.triageInterventions.compressionScenarios.length, 1, "complete compression scenario should pass through Layer 5");
assert.equal(completeResult.triageInterventions.interventionScenarios.length, 0, "complete compression scenario should stay separate from intervention scenarios");
assert.equal(completeCapturedGraphInput.comparisonScenarios.length, 2, "Display should pass immediate and staged compression comparisons into the graph model.");
assert.equal(completeCapturedGraphInput.comparisonScenarios[0].kind, "compression");
assert.equal(completeCapturedGraphInput.comparisonScenarios[0].pathId, "compression-post-death-resources");
assert.equal(completeCapturedGraphInput.comparisonScenarios[0].label, "Immediate compression");
assert.equal(completeCapturedGraphInput.comparisonScenarios[0].postDeathSeries.points.length, 2);
assert.equal(completeCapturedGraphInput.comparisonScenarios[1].kind, "stagedCompression");
assert.equal(completeCapturedGraphInput.comparisonScenarios[1].pathId, "staged-compression-post-death-resources");
assert.equal(completeCapturedGraphInput.comparisonScenarios[1].label, "Staged compression");
assert.equal(completeCapturedGraphInput.comparisonScenarios[1].postDeathSeries.points.length, 3);
assert.deepEqual(completeResult.scenario.postDeathSeries, originalScenario.postDeathSeries, "complete alternate scenario should not mutate base postDeathSeries");
assert.match(harness.renderTimeline(completeResult), /data-income-impact-graph-path="compression-post-death-resources"/);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-graph-path="staged-compression-post-death-resources"/);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-graph-path="staged-compression-post-death-resources"[^>]*data-income-impact-graph-path-mode="step"/);
assert.match(harness.renderTimeline(completeResult), /Immediate compression/);
assert.match(harness.renderTimeline(completeResult), /Staged compression/);
assert.match(harness.renderTimeline(completeResult), /Comparison only - base projection unchanged\./);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-graph-detail="compression-early-window"/);
assert.match(harness.renderTimeline(completeResult), /First 24 months after death/);
assert.match(harness.renderTimeline(completeResult), /Actual values, local scale/);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-detail-path="immediate-compression"/);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-detail-path="staged-compression"/);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-detail-path="staged-compression"[^>]*data-income-impact-detail-path-mode="step"/);
assert.match(harness.renderTimeline(completeResult), /data-income-impact-detail-difference="-500"/);
assert.doesNotMatch(harness.renderTimeline(result), /data-income-impact-graph-path="compression-post-death-resources"/);
assert.doesNotMatch(harness.renderTimeline(result), /data-income-impact-graph-path="staged-compression-post-death-resources"/);
assert.doesNotMatch(harness.renderTimeline(result), /data-income-impact-graph-detail="compression-early-window"/);
assert.match(harness.renderCompressionReportingPanel(completeResult), /Alternate scenario prepared/);
assert.match(harness.renderCompressionReportingPanel(completeResult), /Prepared as a separate scenario and not applied to the base projection\./);

let stagedOnlyGraphInput = null;
const stagedOnlyResult = harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: { id: "lens-staged-only-fixture" },
  analysisSettings: {},
  scenarioState: { projectionHorizonYears: 40, mortgageTreatmentOverride: "followAssumptions" },
  deathAgeState: { hasDateOfBirth: false },
  composeIncomeImpactScenario() { return scenario; },
  evaluateIncomeImpactRiskEvents() { return riskEvaluation; },
  buildIncomeImpactTimelineGraphModel(input) {
    stagedOnlyGraphInput = input;
    return graphModel;
  },
  prepareIncomeImpactCompressionReportingInputs() {
    return {
      compressionReport: completeCompressionReport,
      compressionPolicyRules,
      warnings: [],
      dataGaps: [],
      trace: { reportingOnly: true }
    };
  },
  calculateIncomeImpactCompressionScenario() {
    return { status: "blocked", dataGaps: [{ code: "immediate-blocked" }], warnings: [], trace: {} };
  },
  calculateIncomeImpactStagedCompressionScenario(input) {
    return createStagedCompressionScenarioResult(input);
  },
  compressionStagePolicyRules,
  calculateIncomeImpactTriageInterventions(input) {
    return createLayer5Output(input);
  }
});
assert.equal(stagedOnlyGraphInput.comparisonScenarios.length, 1, "Blocked immediate scenario should not suppress complete staged path.");
assert.equal(stagedOnlyGraphInput.comparisonScenarios[0].kind, "stagedCompression");
assert.equal(stagedOnlyResult.triageInterventions.compressionScenarios.length, 0, "Blocked immediate result should not expose Layer 5 compressionScenarios.");

let immediateOnlyGraphInput = null;
harness.buildIncomeImpactResultFromState({
  valuationDate: "2026-05-06",
  lensModel: { id: "lens-immediate-only-fixture" },
  analysisSettings: {},
  scenarioState: { projectionHorizonYears: 40, mortgageTreatmentOverride: "followAssumptions" },
  deathAgeState: { hasDateOfBirth: false },
  composeIncomeImpactScenario() { return scenario; },
  evaluateIncomeImpactRiskEvents() { return riskEvaluation; },
  buildIncomeImpactTimelineGraphModel(input) {
    immediateOnlyGraphInput = input;
    return graphModel;
  },
  prepareIncomeImpactCompressionReportingInputs() {
    return {
      compressionReport: completeCompressionReport,
      compressionPolicyRules,
      warnings: [],
      dataGaps: [],
      trace: { reportingOnly: true }
    };
  },
  calculateIncomeImpactCompressionScenario(input) {
    return createCompressionScenarioResult(input);
  },
  calculateIncomeImpactStagedCompressionScenario() {
    return { status: "blocked", stagedCompressionScenario: null, dataGaps: [{ code: "staged-blocked" }], warnings: [], trace: {} };
  },
  compressionStagePolicyRules,
  calculateIncomeImpactTriageInterventions(input) {
    return createLayer5Output(input);
  }
});
assert.equal(immediateOnlyGraphInput.comparisonScenarios.length, 1, "Blocked staged scenario should not suppress complete immediate path.");
assert.equal(immediateOnlyGraphInput.comparisonScenarios[0].kind, "compression");

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: result });
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /Existing key risk/);
assert.match(host.innerHTML, /data-income-impact-compression-panel/);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-risk-panel") < host.innerHTML.indexOf("data-income-impact-compression-panel"),
  "compression reporting should appear in the side panel after existing key risks"
);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-compression-panel") < host.innerHTML.indexOf("data-income-impact-financial-security-card"),
  "compression reporting should stay in the side panel before runway summary cards"
);

const emptyPanelHtml = harness.renderCompressionReportingPanel({
  compressionReporting: {
    layer5: {
      compressionOpportunities: [],
      pauseCandidates: [],
      protectedExpenseItems: [],
      excludedExpenseItems: [],
      advisorReviewItems: [],
      compressionDataGaps: [],
      compressionTrace: {
        compressionReportingEnabled: true
      },
      policyDecisionSummary: {
        YES: 0,
        NO: 0,
        PAUSE: 0,
        INTERVENTION: 0
      }
    }
  }
});
assert.match(emptyPanelHtml, /No compression opportunities, pause candidates, protected items, exclusions, or compression-specific gaps were reported\./);

console.log("income-loss-impact-compression-reporting-display-check passed");
