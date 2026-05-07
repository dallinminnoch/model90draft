const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-impact-triage-intervention-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createScenario(overrides = {}) {
  const scenario = {
    status: "partial",
    deathEvent: {
      resourcesAfterObligations: 150000
    },
    postDeathSeries: {
      depletion: {
        depleted: true,
        depletionDate: "2032-01-01",
        depletionMonthIndex: 24,
        monthsCovered: 24,
        precision: "monthly"
      },
      summary: {
        totalSurvivorIncome: 24000,
        totalEssentialNeeds: 48000,
        totalDiscretionaryNeeds: 24000,
        totalSurvivorNeeds: 72000,
        totalScheduledObligations: 6000,
        totalNetUse: 54000,
        endingResources: 96000,
        accumulatedUnmetNeed: 0
      },
      points: [
        {
          date: "2030-02-01",
          monthIndex: 1,
          startingResources: 10000,
          survivorIncome: 1000,
          essentialNeeds: 2000,
          discretionaryNeeds: 1000,
          survivorNeeds: 3000,
          scheduledObligations: 0,
          netUse: 2000,
          endingResources: 8000,
          availableResources: 8000,
          accumulatedUnmetNeed: 0,
          trace: {
            activeNeedStreamIds: ["essential-needs", "discretionary-needs"]
          }
        },
        {
          date: "2030-03-01",
          monthIndex: 2,
          startingResources: 8000,
          survivorIncome: 1000,
          essentialNeeds: 2000,
          discretionaryNeeds: 1000,
          survivorNeeds: 3000,
          scheduledObligations: 0,
          netUse: 2000,
          endingResources: 6000,
          availableResources: 6000,
          accumulatedUnmetNeed: 0,
          trace: {
            activeNeedStreamIds: ["essential-needs", "discretionary-needs"]
          }
        }
      ]
    },
    timelineFacts: {
      resourcesAfterObligations: 150000,
      monthsCovered: 24,
      depletionDate: "2032-01-01",
      accumulatedUnmetNeed: 0
    },
    warnings: [
      {
        code: "asset-treatment-assumptions-defaulted",
        message: "Default asset treatment was applied.",
        sourcePaths: ["assetTreatmentAssumptions"]
      }
    ],
    dataGaps: [
      {
        code: "missing-survivor-net-income",
        message: "Survivor net income is missing.",
        sourcePaths: ["survivorScenario.survivorNetAnnualIncome"]
      }
    ],
    trace: {
      calculationMethod: "income-impact-scenario-composer-v1"
    }
  };

  return {
    ...scenario,
    ...overrides,
    deathEvent: {
      ...scenario.deathEvent,
      ...(overrides.deathEvent || {})
    },
    postDeathSeries: {
      ...scenario.postDeathSeries,
      ...(overrides.postDeathSeries || {}),
      depletion: {
        ...scenario.postDeathSeries.depletion,
        ...(overrides.postDeathSeries?.depletion || {})
      },
      summary: {
        ...scenario.postDeathSeries.summary,
        ...(overrides.postDeathSeries?.summary || {})
      },
      points: overrides.postDeathSeries?.points || scenario.postDeathSeries.points
    },
    timelineFacts: {
      ...scenario.timelineFacts,
      ...(overrides.timelineFacts || {})
    },
    warnings: overrides.warnings || scenario.warnings,
    dataGaps: overrides.dataGaps || scenario.dataGaps
  };
}

function createRiskEvaluation(overrides = {}) {
  return {
    status: "complete",
    events: [
      {
        id: "survivor-resources-depleted",
        ruleId: "survivor-resources-depleted",
        category: "runway",
        severity: "critical",
        title: "Survivor resources deplete",
        summary: "Resources deplete during the projection.",
        date: "2032-01-01",
        monthIndex: 24,
        phase: "postDeath",
        evidence: [
          {
            path: "postDeathSeries.depletion",
            value: {
              depleted: true
            }
          }
        ],
        sourcePaths: ["postDeathSeries.depletion"]
      }
    ],
    stableEvents: [
      {
        id: "coverage-added-at-death",
        ruleId: "coverage-added-at-death",
        category: "coverage",
        severity: "stable",
        title: "Coverage added at death",
        summary: "Coverage enters at death.",
        date: "2030-01-01",
        monthIndex: 0,
        phase: "deathEvent",
        evidence: [
          {
            path: "deathEvent.coverageAdded",
            value: 500000
          }
        ],
        sourcePaths: ["deathEvent.coverageAdded"]
      }
    ],
    warnings: [],
    dataGaps: [],
    trace: {
      calculationMethod: "income-impact-risk-event-evaluator-v1"
    },
    ...overrides
  };
}

function run(input) {
  const context = createContext();
  return context.LensApp.lensAnalysis.calculateIncomeImpactTriageInterventions(input);
}

function assertSerializable(value) {
  assert.doesNotThrow(function () {
    JSON.parse(JSON.stringify(value));
  });
}

function assertNoForbiddenConcepts() {
  [
    /\bDOM\b/i,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\b/,
    /\bdisplay\b/i,
    /\bpage\b/i,
    /\bchart\b/i,
    /income-loss-impact-timeline/i,
    /income-impact-timeline-graph-model/i,
    /buildIncomeImpactTimelineGraphModel/i,
    /income-impact-warning-events-library/i,
    /evaluateIncomeImpactWarningEvents/i,
    /calculateHouseholdExpenseCompressionOpportunities/i,
    /resolveExpenseCompressionThresholds/i,
    /expense-compression-thresholds/i,
    /household-expense-compression-policy/i
  ].forEach(function (pattern) {
    assert.ok(!pattern.test(helperSource), `Layer 5 helper source should not contain ${pattern}`);
  });
}

const context = createContext();
const { calculateIncomeImpactTriageInterventions } = context.LensApp.lensAnalysis;
assert.strictEqual(typeof calculateIncomeImpactTriageInterventions, "function", "Layer 5 export exists");

const scenario = createScenario();
const riskEvaluation = createRiskEvaluation();
const originalScenario = clone(scenario);
const originalRiskEvaluation = clone(riskEvaluation);
const first = clone(calculateIncomeImpactTriageInterventions({ scenario, riskEvaluation }));
const second = clone(run({ scenario: createScenario(), riskEvaluation: createRiskEvaluation() }));

assert.strictEqual(JSON.stringify(first), JSON.stringify(second), "Output is deterministic");
assertSerializable(first);
assert.deepStrictEqual(scenario, originalScenario, "Base scenario is not mutated");
assert.deepStrictEqual(riskEvaluation, originalRiskEvaluation, "Risk evaluation is not mutated");
assert.strictEqual(first.status, "complete");
assert.deepStrictEqual(first.baseScenarioSummary, {
  resourcesAfterObligations: 150000,
  monthsCovered: 24,
  depletionDate: "2032-01-01",
  accumulatedUnmetNeed: 0,
  totalSurvivorNeeds: 72000,
  totalSurvivorIncome: 24000,
  totalScheduledObligations: 6000
});
assert.strictEqual(first.trace.noInterventionBaseCase, true, "No-intervention base case is preserved");
assert.strictEqual(first.trace.baseCasePreserved, true);
assert.deepStrictEqual(first.compressionOpportunities, [], "Compression opportunities are empty without explicit input");
assert.deepStrictEqual(first.pauseCandidates, [], "Pause candidates are empty without explicit input");
assert.deepStrictEqual(first.protectedExpenseItems, [], "Protected expense items are empty without explicit input");
assert.deepStrictEqual(first.excludedExpenseItems, [], "Excluded expense items are empty without explicit input");
assert.deepStrictEqual(first.advisorReviewItems, [], "Advisor-review expense items are empty without explicit input");
assert.deepStrictEqual(first.compressionDataGaps, [], "Compression data gaps are empty without explicit input");
assert.strictEqual(first.compressionTrace.reportingOnly, true, "Compression trace is reporting-only");
assert.strictEqual(first.compressionTrace.compressionReportingEnabled, false, "Compression reporting is disabled without explicit input");
assert.strictEqual(first.compressionTrace.source, "none", "Missing compression report does not imply active reporting");
assert.strictEqual(first.compressionTrace.reductionsApplied, false, "No compression reductions are applied");
assert.strictEqual(first.compressionTrace.projectionMutated, false, "Compression reporting does not mutate projection");
assert.strictEqual(first.compressionTrace.graphPathChanged, false, "Compression reporting does not change graph path");
assert.strictEqual(first.compressionTrace.layer5AppliedCompression, false, "Layer 5 does not apply compression");
assert.deepStrictEqual(first.policyDecisionSummary, {
  YES: 0,
  NO: 0,
  PAUSE: 0,
  INTERVENTION: 0,
  totalRules: 0,
  invalidDecisionCount: 0,
  byOrderGroup: {}
});

assert.ok(
  first.triageEvents.find((event) => event.sourceEventId === "survivor-resources-depleted"),
  "Layer 4 risk events become triageEvents"
);
assert.ok(
  first.stableTriageEvents.find((event) => event.sourceEventId === "coverage-added-at-death"),
  "Layer 4 stable events become stableTriageEvents"
);
assert.ok(
  first.triageEvents.every((event) => event.severity !== "stable"),
  "Stable triage events stay separate from true triage risks"
);
assert.ok(
  first.triageEvents.find((event) => event.id === "data-gap-missing-survivor-net-income-1"),
  "Scenario dataGaps become data-quality triage events"
);
assert.ok(
  first.triageEvents.find((event) => event.id === "warning-asset-treatment-assumptions-defaulted-1"),
  "Scenario warnings become data-quality triage events"
);
assert.strictEqual(first.interventionScenarios.length, 0, "No projection-changing intervention occurs by default");
assert.strictEqual(first.trace.noBaseFinancialCalculationsOwned, true);

const compressionReport = {
  status: "complete",
  opportunities: [
    {
      expenseTypeKey: "diningOut",
      monthlyAmount: 600,
      sourcePath: "expenseFacts.expenses[0]"
    }
  ],
  pauseCandidates: [
    {
      expenseTypeKey: "retirementContributions",
      monthlyAmount: 400,
      sourcePath: "expenseFacts.expenses[1]"
    }
  ],
  protectedItems: [
    {
      expenseTypeKey: "groceries",
      monthlyAmount: 800,
      sourcePath: "expenseFacts.expenses[2]"
    }
  ],
  excludedItems: [
    {
      expenseTypeKey: "autoLoanPayment",
      isGeneratedExpense: true,
      isDebtPaymentExpense: true,
      sourcePath: "expenseFacts.expenses[3]"
    }
  ],
  advisorReviewItems: [
    {
      expenseTypeKey: "medicalCare",
      monthlyAmount: 250,
      sourcePath: "expenseFacts.expenses[4]"
    }
  ],
  dataGaps: [
    {
      code: "missing-household-member-count",
      message: "Household member count is required for per-member thresholds.",
      sourcePaths: ["householdFacts.householdMemberCount"]
    }
  ],
  trace: {
    calculationMethod: "household-expense-compression-opportunities-v1",
    mode: "reportingOnly"
  }
};
const compressionPolicyRules = [
  {
    decision: "YES",
    expenseTypeKey: "diningOut",
    compressionOrderGroup: "earlyDiscretionary"
  },
  {
    decision: "NO",
    expenseTypeKey: "autoLoanPayment",
    compressionOrderGroup: "debtObligations"
  },
  {
    decision: "PAUSE",
    expenseTypeKey: "retirementContributions",
    compressionOrderGroup: "pauseContributions"
  },
  {
    decision: "INTERVENTION",
    expenseTypeKey: "housingPayment",
    compressionOrderGroup: "majorInterventions"
  },
  {
    decision: "MAYBE",
    expenseTypeKey: "customExpense",
    compressionOrderGroup: "dataQuality"
  }
];
const originalCompressionReport = clone(compressionReport);
const originalCompressionPolicyRules = clone(compressionPolicyRules);
const compressionOutput = clone(run({
  scenario: createScenario(),
  riskEvaluation: createRiskEvaluation(),
  compressionReport,
  compressionPolicyRules
}));
assert.deepStrictEqual(compressionReport, originalCompressionReport, "Compression report input is not mutated");
assert.deepStrictEqual(compressionPolicyRules, originalCompressionPolicyRules, "Compression policy rules input is not mutated");
assert.deepStrictEqual(
  compressionOutput.compressionOpportunities,
  originalCompressionReport.opportunities,
  "Compression opportunities pass through as cloned reporting output"
);
assert.deepStrictEqual(compressionOutput.pauseCandidates, originalCompressionReport.pauseCandidates);
assert.deepStrictEqual(compressionOutput.protectedExpenseItems, originalCompressionReport.protectedItems);
assert.deepStrictEqual(compressionOutput.excludedExpenseItems, originalCompressionReport.excludedItems);
assert.deepStrictEqual(compressionOutput.advisorReviewItems, originalCompressionReport.advisorReviewItems);
assert.deepStrictEqual(compressionOutput.compressionDataGaps, originalCompressionReport.dataGaps);
assert.strictEqual(compressionOutput.compressionTrace.compressionReportingEnabled, true);
assert.strictEqual(compressionOutput.compressionTrace.source, "explicit-input");
assert.strictEqual(compressionOutput.compressionTrace.classifierStatus, "complete");
assert.strictEqual(compressionOutput.compressionTrace.reportingOnly, true);
assert.strictEqual(compressionOutput.compressionTrace.baseScenarioMutated, false);
assert.strictEqual(compressionOutput.compressionTrace.projectionMutated, false);
assert.strictEqual(compressionOutput.compressionTrace.graphPathChanged, false);
assert.strictEqual(compressionOutput.compressionTrace.reductionsApplied, false);
assert.strictEqual(compressionOutput.compressionTrace.layer5AppliedCompression, false);
assert.deepStrictEqual(compressionOutput.compressionTrace.sourceTrace, originalCompressionReport.trace);
assert.deepStrictEqual(compressionOutput.policyDecisionSummary, {
  YES: 1,
  NO: 1,
  PAUSE: 1,
  INTERVENTION: 1,
  totalRules: 4,
  invalidDecisionCount: 1,
  byOrderGroup: {
    earlyDiscretionary: {
      YES: 1,
      NO: 0,
      PAUSE: 0,
      INTERVENTION: 0,
      totalRules: 1
    },
    debtObligations: {
      YES: 0,
      NO: 1,
      PAUSE: 0,
      INTERVENTION: 0,
      totalRules: 1
    },
    pauseContributions: {
      YES: 0,
      NO: 0,
      PAUSE: 1,
      INTERVENTION: 0,
      totalRules: 1
    },
    majorInterventions: {
      YES: 0,
      NO: 0,
      PAUSE: 0,
      INTERVENTION: 1,
      totalRules: 1
    }
  }
});
assert.ok(
  !compressionOutput.dataGaps.find((gap) => gap.code === "missing-household-member-count"),
  "Compression data gaps remain separate from scenario data gaps"
);
assert.strictEqual(
  compressionOutput.interventionScenarios.length,
  0,
  "Compression reporting does not create intervention scenarios"
);

const unconfirmedPolicy = clone(run({
  scenario: createScenario(),
  riskEvaluation: createRiskEvaluation(),
  triagePolicy: {
    discretionaryReduction: {
      monthlyReductionAmount: 500,
      advisorConfirmed: false,
      sourcePaths: ["triagePolicy.discretionaryReduction.monthlyReductionAmount"]
    }
  }
}));
assert.strictEqual(
  unconfirmedPolicy.interventionScenarios.length,
  0,
  "Unconfirmed discretionary policy does not change projection"
);
assert.ok(
  unconfirmedPolicy.warnings.find((warning) => warning.code === "advisor-confirmation-required-for-discretionary-reduction"),
  "Unconfirmed discretionary policy creates a warning"
);
assert.ok(
  unconfirmedPolicy.triageEvents.find((event) => event.id === "discretionary-reduction-candidate"),
  "Unconfirmed discretionary policy creates a candidate triage event"
);

const confirmedPolicy = clone(run({
  scenario: createScenario(),
  riskEvaluation: createRiskEvaluation(),
  triagePolicy: {
    discretionaryReduction: {
      id: "reduce-discretionary-500",
      label: "Reduce discretionary support",
      monthlyReductionAmount: 500,
      advisorConfirmed: true,
      sourcePaths: ["triagePolicy.discretionaryReduction.monthlyReductionAmount"]
    }
  }
}));
assert.strictEqual(confirmedPolicy.interventionScenarios.length, 1, "Confirmed policy creates one intervention shell");
const intervention = confirmedPolicy.interventionScenarios[0];
assert.strictEqual(intervention.id, "reduce-discretionary-500");
assert.strictEqual(intervention.changesProjection, true);
assert.strictEqual(intervention.advisorConfirmed, true);
assert.strictEqual(intervention.protectedEssentialsPreserved, true);
assert.strictEqual(intervention.summary.totalDiscretionaryNeedsReduction, 1000);
assert.strictEqual(intervention.postDeathSeries.points[0].essentialNeeds, 2000, "Essential needs are preserved");
assert.strictEqual(intervention.postDeathSeries.points[0].discretionaryNeeds, 500, "Discretionary needs are reduced");
assert.strictEqual(intervention.postDeathSeries.points[0].endingResources, 8500);
assert.strictEqual(intervention.postDeathSeries.points[1].endingResources, 7000);
assert.deepStrictEqual(intervention.trace.preservedFields, [
  "postDeathSeries.points.essentialNeeds",
  "baseScenario"
]);
assert.deepStrictEqual(createScenario(), createScenario(), "Scenario fixtures remain stable after intervention run");

const deferredPolicy = clone(run({
  scenario: createScenario(),
  riskEvaluation: createRiskEvaluation(),
  triagePolicy: {
    housing: { advisorConfirmed: true },
    education: { advisorConfirmed: true },
    emergencyReserve: { advisorConfirmed: true },
    transportation: { advisorConfirmed: true },
    healthcare: { advisorConfirmed: true },
    foreclosure: { advisorConfirmed: true },
    eviction: { advisorConfirmed: true },
    downsize: { advisorConfirmed: true },
    homeSale: { advisorConfirmed: true },
    vehicleSale: { advisorConfirmed: true },
    returnToWork: { advisorConfirmed: true }
  }
}));
assert.strictEqual(
  deferredPolicy.interventionScenarios.length,
  0,
  "Housing, education, emergency, transportation, healthcare, sale, and return-to-work interventions are not modeled"
);
assert.deepStrictEqual(
  deferredPolicy.warnings.map((warning) => warning.details.policyKey).sort(),
  [
    "downsize",
    "education",
    "emergencyReserve",
    "eviction",
    "foreclosure",
    "healthcare",
    "homeSale",
    "housing",
    "returnToWork",
    "transportation",
    "vehicleSale"
  ].sort(),
  "Deferred intervention policies are warned and ignored"
);

const missingInputs = clone(run({}));
assert.strictEqual(missingInputs.status, "partial");
assert.ok(missingInputs.dataGaps.find((gap) => gap.code === "missing-scenario"));
assert.ok(missingInputs.dataGaps.find((gap) => gap.code === "missing-risk-evaluation"));

assertNoForbiddenConcepts();

console.log("income-impact-triage-intervention-v1-check passed");
