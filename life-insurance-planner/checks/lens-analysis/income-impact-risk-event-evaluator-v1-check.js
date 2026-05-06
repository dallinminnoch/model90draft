const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");
const libraryPath = path.join(featureRoot, "income-impact-caution-library.js");
const evaluatorPath = path.join(featureRoot, "income-impact-risk-event-evaluator-calculations.js");

const librarySource = fs.readFileSync(libraryPath, "utf8");
const evaluatorSource = fs.readFileSync(evaluatorPath, "utf8");

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(librarySource, context, { filename: libraryPath });
  vm.runInContext(evaluatorSource, context, { filename: evaluatorPath });
  return context;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createScenario(overrides = {}) {
  const scenario = {
    status: "partial",
    scenario: {
      valuationDate: "2026-01-01",
      selectedDeathDate: "2031-01-01",
      selectedDeathAge: 51,
      projectionHorizonMonths: 60,
      mortgageTreatmentOverride: null
    },
    preDeathSeries: {
      mode: "forward-projection",
      points: [],
      targetPoint: {
        date: "2031-01-01",
        endingAssets: 200000
      },
      summary: {
        startingAssets: 150000,
        endingAssets: 200000
      }
    },
    deathEvent: {
      date: "2031-01-01",
      age: 51,
      assetsBeforeDeath: 200000,
      survivorAvailableTreatedAssets: 120000,
      coverageAdded: 400000,
      immediateObligations: 550000,
      resourcesAfterObligations: -30000
    },
    postDeathSeries: {
      points: [
        {
          date: "2031-02-01",
          monthIndex: 1,
          endingResources: -38000,
          accumulatedUnmetNeed: 38000
        }
      ],
      summary: {
        accumulatedUnmetNeed: 38000
      },
      depletion: {
        depleted: true,
        depletionDate: "2031-01-01",
        depletionMonthIndex: 0,
        monthsCovered: 0,
        precision: "monthly"
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 200000,
      survivorAvailableTreatedAssets: 120000,
      coverageAdded: 400000,
      resourcesAfterObligations: -30000,
      depletionDate: "2031-01-01",
      monthsCovered: 0,
      accumulatedUnmetNeed: 38000
    },
    warnings: [
      {
        code: "composer-review-note",
        message: "Composer warning retained for scenario review.",
        sourcePaths: ["warnings.0"]
      }
    ],
    dataGaps: [
      {
        code: "missing-survivor-net-income",
        message: "Survivor net income missing.",
        sourcePaths: ["lensModel.survivorScenario.survivorNetAnnualIncome"]
      }
    ],
    trace: {
      calculationMethod: "income-impact-scenario-composer-v1"
    },
    sourcePaths: ["timelineFacts.resourcesAfterObligations"]
  };

  return {
    ...scenario,
    ...overrides,
    scenario: {
      ...scenario.scenario,
      ...(overrides.scenario || {})
    },
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
      }
    },
    timelineFacts: {
      ...scenario.timelineFacts,
      ...(overrides.timelineFacts || {})
    },
    warnings: overrides.warnings || scenario.warnings,
    dataGaps: overrides.dataGaps || scenario.dataGaps
  };
}

function findEvent(output, ruleId) {
  return output.events.concat(output.stableEvents).find((event) => event.ruleId === ruleId);
}

function assertNoForbiddenConcepts() {
  [
    /\bDOM\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\b/,
    /\bdisplay\b/i,
    /\bpage\b/i,
    /\bchart\b/i,
    /income-impact-warning-events-library/,
    /evaluateIncomeImpactWarningEvents/,
    /calculateHouseholdWealthProjection/,
    /calculateHouseholdDeathEventAvailability/,
    /calculateHouseholdSurvivorRunway/,
    /composeIncomeImpactScenario/
  ].forEach(function (pattern) {
    assert.ok(!pattern.test(evaluatorSource), `evaluator source should not contain ${pattern}`);
  });
}

function assertLibraryShape(context) {
  const { incomeImpactCautionRules } = context.LensApp.lensAnalysis;
  assert.ok(Array.isArray(incomeImpactCautionRules), "incomeImpactCautionRules exports");
  assert.strictEqual(incomeImpactCautionRules.length, 10, "V1 default rule count");
  incomeImpactCautionRules.forEach((rule) => {
    assert.ok(rule.id, "rule id exists");
    assert.ok(rule.category, "rule category exists");
    assert.ok(["critical", "at-risk", "caution", "stable"].includes(rule.severity));
    assert.ok(Number.isFinite(rule.priority), "rule priority exists");
    assert.ok(rule.phase, "rule phase exists");
    assert.ok(rule.predicateId, "rule predicate exists");
    assert.ok(rule.title, "rule title exists");
    assert.ok(rule.markerLabel, "rule marker label exists");
    assert.ok(Array.isArray(rule.evidencePaths), "rule evidence paths exist");
    assert.notStrictEqual(typeof rule.predicate, "function", "rules should be data-first, not functions");
  });
}

function runDefaultRuleChecks() {
  const context = createContext();
  assertLibraryShape(context);
  const { evaluateIncomeImpactRiskEvents } = context.LensApp.lensAnalysis;
  assert.strictEqual(typeof evaluateIncomeImpactRiskEvents, "function", "evaluateIncomeImpactRiskEvents exports");

  context.LensApp.lensAnalysis.calculateHouseholdWealthProjection = function () {
    throw new Error("Layer 1 should not be called");
  };
  context.LensApp.lensAnalysis.calculateHouseholdDeathEventAvailability = function () {
    throw new Error("Layer 2 should not be called");
  };
  context.LensApp.lensAnalysis.calculateHouseholdSurvivorRunway = function () {
    throw new Error("Layer 3 should not be called");
  };
  context.LensApp.lensAnalysis.composeIncomeImpactScenario = function () {
    throw new Error("Composer should not be called");
  };

  const scenario = createScenario();
  const originalScenario = clone(scenario);
  const output = clone(evaluateIncomeImpactRiskEvents({ scenario }));
  const repeat = clone(evaluateIncomeImpactRiskEvents({ scenario: createScenario() }));
  const serialized = JSON.stringify(output);

  assert.strictEqual(serialized, JSON.stringify(repeat), "output is deterministic");
  assert.deepStrictEqual(JSON.parse(serialized), JSON.parse(JSON.stringify(output)), "output is serializable");
  assert.deepStrictEqual(scenario, originalScenario, "scenario input is not mutated");
  assert.strictEqual(output.status, "complete", "default scenario evaluates completely");

  assert.deepStrictEqual(
    output.events.map((event) => event.severity),
    ["critical", "critical", "critical", "at-risk", "at-risk", "caution", "caution", "caution"],
    "critical / at-risk / caution ordering works"
  );
  assert.deepStrictEqual(
    output.events.map((event) => event.ruleId),
    [
      "resources-after-obligations-negative-or-zero",
      "survivor-resources-depleted",
      "depletion-within-6-months",
      "depletion-within-12-months",
      "accumulated-unmet-need",
      "immediate-obligations-reduce-resources",
      "composer-status-partial",
      "major-composer-data-gaps"
    ],
    "events are sorted by severity and priority"
  );
  assert.deepStrictEqual(
    output.stableEvents.map((event) => event.ruleId),
    ["coverage-added-at-death", "treated-assets-available-at-death"],
    "stable events stay separate"
  );
  assert.ok(output.events.every((event) => event.severity !== "stable"), "stable events are not mixed into true risks");

  const resourcesEvent = findEvent(output, "resources-after-obligations-negative-or-zero");
  assert.ok(resourcesEvent, "resources event exists");
  assert.deepStrictEqual(
    resourcesEvent.evidence.find((item) => item.path === "timelineFacts.resourcesAfterObligations"),
    {
      path: "timelineFacts.resourcesAfterObligations",
      value: -30000
    },
    "evidence path and value are preserved"
  );
  assert.ok(
    resourcesEvent.sourcePaths.includes("timelineFacts.resourcesAfterObligations"),
    "event source paths include exact composer path"
  );
  assert.strictEqual(resourcesEvent.date, "2031-01-01", "death event date maps from composer output");
  assert.strictEqual(resourcesEvent.monthIndex, 0, "death event monthIndex is zero");

  const dataGapEvent = findEvent(output, "major-composer-data-gaps");
  assert.ok(dataGapEvent, "composer data gaps become data-quality event");
  assert.strictEqual(dataGapEvent.category, "dataQuality");
  assert.ok(
    dataGapEvent.sourcePaths.includes("lensModel.survivorScenario.survivorNetAnnualIncome"),
    "data-quality event includes nested data-gap source path"
  );
  assert.deepStrictEqual(
    dataGapEvent.evidence.find((item) => item.path === "dataGaps").value,
    scenario.dataGaps,
    "data gap evidence values are preserved"
  );

  assert.strictEqual(output.trace.calculationMethod, "income-impact-risk-event-evaluator-v1");
  assert.strictEqual(output.trace.noFinancialCalculationsPerformed, true);
  assert.deepStrictEqual(
    Array.from(output.trace.triggeredRuleIds).sort(),
    output.events.concat(output.stableEvents).map((event) => event.ruleId).sort(),
    "trace triggered rules match emitted events"
  );
  assert.ok(output.trace.predicateIds.includes("number-greater-than"), "predicate ids are traced");
}

function runCustomRuleChecks() {
  const context = createContext();
  const { evaluateIncomeImpactRiskEvents } = context.LensApp.lensAnalysis;
  const customRules = [
    {
      id: "custom-positive-coverage",
      category: "coverage",
      severity: "stable",
      priority: 1,
      phase: "deathEvent",
      predicateId: "number-greater-than",
      params: {
        path: "deathEvent.coverageAdded",
        threshold: 0
      },
      title: "Custom coverage rule",
      summaryTemplate: "Coverage is {deathEvent.coverageAdded}.",
      markerLabel: "Custom coverage",
      evidencePaths: ["deathEvent.coverageAdded"],
      enabled: true,
      rulesVersion: "custom-v1"
    }
  ];

  const output = clone(evaluateIncomeImpactRiskEvents({
    scenario: createScenario(),
    cautionRules: customRules
  }));
  assert.deepStrictEqual(output.events, [], "custom stable-only rule set emits no risk events");
  assert.deepStrictEqual(
    output.stableEvents.map((event) => event.ruleId),
    ["custom-positive-coverage"],
    "custom rule set works"
  );
  assert.strictEqual(output.trace.rulesVersion, "custom-v1", "custom rules version is traced");
}

function runSkipChecks() {
  const context = createContext();
  const { evaluateIncomeImpactRiskEvents } = context.LensApp.lensAnalysis;
  const rules = [
    {
      id: "disabled-rule",
      category: "resources",
      severity: "critical",
      priority: 1,
      phase: "deathEvent",
      predicateId: "number-less-than-or-equal",
      params: {
        path: "timelineFacts.resourcesAfterObligations",
        threshold: 0
      },
      title: "Disabled rule",
      markerLabel: "Disabled",
      evidencePaths: ["timelineFacts.resourcesAfterObligations"],
      enabled: false
    },
    {
      id: "unknown-predicate-rule",
      category: "resources",
      severity: "critical",
      priority: 2,
      phase: "deathEvent",
      predicateId: "not-a-predicate",
      title: "Unknown predicate",
      markerLabel: "Unknown",
      evidencePaths: ["timelineFacts.resourcesAfterObligations"],
      enabled: true
    },
    {
      id: "malformed-rule",
      category: "resources",
      severity: "critical",
      priority: 3,
      phase: "deathEvent",
      predicateId: "",
      title: "Malformed rule",
      markerLabel: "Malformed",
      evidencePaths: ["timelineFacts.resourcesAfterObligations"],
      enabled: true
    }
  ];
  const output = clone(evaluateIncomeImpactRiskEvents({
    scenario: createScenario(),
    cautionRules: rules
  }));

  assert.deepStrictEqual(output.events, [], "skipped rules do not emit events");
  assert.ok(output.trace.skippedRuleIds.includes("disabled-rule"), "disabled rule is skipped");
  assert.ok(output.trace.skippedRuleIds.includes("unknown-predicate-rule"), "unknown predicate is skipped");
  assert.ok(output.trace.skippedRuleIds.includes("malformed-rule"), "malformed rule is skipped");
  assert.ok(
    output.warnings.some((warning) => warning.code === "unknown-predicate-skipped"),
    "unknown predicate warning is emitted"
  );
  assert.ok(
    output.warnings.some((warning) => warning.code === "malformed-caution-rule-skipped"),
    "malformed rule warning is emitted"
  );
  assert.strictEqual(output.status, "partial", "warnings make output partial");
}

function runMissingScenarioChecks() {
  const context = createContext();
  const { evaluateIncomeImpactRiskEvents } = context.LensApp.lensAnalysis;
  const output = clone(evaluateIncomeImpactRiskEvents({}));

  assert.strictEqual(output.status, "partial", "missing scenario is partial");
  assert.deepStrictEqual(output.events, [], "missing scenario emits no events");
  assert.ok(output.dataGaps.some((gap) => gap.code === "missing-scenario"), "missing scenario data gap exists");
}

function runNoRiskScenarioChecks() {
  const context = createContext();
  const { evaluateIncomeImpactRiskEvents } = context.LensApp.lensAnalysis;
  const output = clone(evaluateIncomeImpactRiskEvents({
    scenario: createScenario({
      status: "complete",
      deathEvent: {
        immediateObligations: 0,
        resourcesAfterObligations: 500000,
        survivorAvailableTreatedAssets: 0,
        coverageAdded: 0
      },
      postDeathSeries: {
        depletion: {
          depleted: false,
          depletionDate: null,
          depletionMonthIndex: null,
          monthsCovered: null,
          precision: "monthly"
        },
        summary: {
          accumulatedUnmetNeed: 0
        }
      },
      timelineFacts: {
        resourcesAfterObligations: 500000,
        depletionDate: null,
        monthsCovered: null,
        accumulatedUnmetNeed: 0,
        coverageAdded: 0,
        survivorAvailableTreatedAssets: 0
      },
      dataGaps: [],
      warnings: []
    })
  }));
  assert.deepStrictEqual(output.events, [], "no-risk scenario emits no true risk events");
  assert.deepStrictEqual(output.stableEvents, [], "no stable events emit when covered facts are absent");
}

function runChecks() {
  assert.match(librarySource, /incomeImpactCautionRules/);
  assert.match(evaluatorSource, /evaluateIncomeImpactRiskEvents/);
  assertNoForbiddenConcepts();
  runDefaultRuleChecks();
  runCustomRuleChecks();
  runSkipChecks();
  runMissingScenarioChecks();
  runNoRiskScenarioChecks();
  console.log("Income Impact risk event evaluator V1 checks passed.");
}

runChecks();
