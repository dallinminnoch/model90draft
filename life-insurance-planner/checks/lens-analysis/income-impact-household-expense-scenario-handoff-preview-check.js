#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  Object.defineProperty(context, "localStorage", {
    get() {
      throw new Error("handoff preview helper must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("handoff preview helper must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("handoff preview helper must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("handoff preview helper must not read client records directly");
    }
  });
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadHandoffContext() {
  const context = createContext();
  loadScript(context, "app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js");
  return context;
}

function loadScenarioContext(includeHandoffHelper) {
  const context = createContext();
  [
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/household-expense-account-policy-resolver.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  if (includeHandoffHelper) {
    loadScript(context, "app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js");
  }

  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function hasIssue(list, code) {
  return Array.isArray(list) && list.some(function (issue) {
    return issue.code === code;
  });
}

function createBasePostDeathSeries(overrides) {
  return Object.assign({
    points: [
      {
        monthIndex: 1,
        date: "2031-01-01",
        startingResources: 10000,
        endingResources: 9900,
        availableResources: 9900,
        survivorNeeds: 1000,
        trace: { source: "base-post-death-series" }
      },
      {
        monthIndex: 2,
        date: "2031-02-01",
        startingResources: 9900,
        endingResources: 9700,
        availableResources: 9700,
        survivorNeeds: 1000
      },
      {
        monthIndex: 6,
        date: "2031-06-01",
        startingResources: 9700,
        endingResources: 9000,
        availableResources: 9000,
        survivorNeeds: 1000
      }
    ],
    summary: {
      endingResources: 9000
    },
    depletion: {
      depleted: false,
      depletionDate: null,
      depletionMonthIndex: null
    }
  }, overrides || {});
}

function createScenarioFixture() {
  return {
    expenses: [
      {
        id: "groceries-1",
        expenseTypeKey: "groceries",
        categoryKey: "foodGroceries",
        label: "Groceries",
        monthlyAmount: 900
      },
      {
        id: "dining-1",
        expenseTypeKey: "diningOutRestaurants",
        categoryKey: "foodGroceries",
        label: "Dining",
        monthlyAmount: 300
      }
    ],
    sliderValue: -50,
    basePostDeathSeries: createBasePostDeathSeries({
      points: [
        {
          monthIndex: 1,
          survivorNeeds: 4000,
          discretionaryNeeds: 1000,
          netUse: 3500,
          startingResources: 100000,
          endingResources: 98000,
          availableResources: 98000
        },
        {
          monthIndex: 2,
          survivorNeeds: 4000,
          discretionaryNeeds: 1000,
          netUse: 3500,
          startingResources: 98000,
          endingResources: 96000,
          availableResources: 96000
        }
      ]
    })
  };
}

function assertNoForbiddenDiffs() {
  const allowedRuntimePlumbingFiles = new Set([
    "app/features/lens-analysis/income-loss-impact-display.js",
    "pages/income-loss-impact.html"
  ]);
  const forbiddenPaths = [
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js",
    "app/features/lens-analysis/income-impact-compression-reporting-prep.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/account-settings",
    "pages",
    "app.js",
    "styles.css",
    "app/styles"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(forbiddenPaths), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim().split(/\r?\n/)
    .filter(Boolean)
    .filter(function (line) {
      return !allowedRuntimePlumbingFiles.has(line.replace(/^[ MADRCU?!]+/, "").trim());
    })
    .join("\n");
  assert.equal(status, "", "handoff preview pass should not touch runtime, display, graph, admin, storage schema, normalization, page, or CSS files outside the approved Income Impact plumbing files");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js");
  [
    "require(",
    "import ",
    "localStorage",
    "sessionStorage",
    "document.",
    "querySelector",
    "addEventListener",
    "fetch(",
    "XMLHttpRequest",
    "saveHouseholdExpenseAccountPolicy",
    "loadHouseholdExpenseAccountPolicy",
    "income-loss-impact-display",
    "timeline-graph",
    "admin-editor",
    "admin-display"
  ].forEach(function (forbiddenToken) {
    assert.equal(source.includes(forbiddenToken), false, `handoff preview helper should not use forbidden token ${forbiddenToken}`);
  });
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadHandoffContext();
const api = context.LensApp.lensAnalysis.incomeImpactHouseholdExpenseScenarioHandoffPreview;
assert.ok(api, "handoff preview API should be exported");
assert.equal(api.HANDOFF_PREVIEW_VERSION, 1, "handoff preview should expose V1");
assert.equal(typeof api.previewIncomeImpactHouseholdExpenseScenarioHandoff, "function", "handoff preview function should export");

const input = {
  basePostDeathSeries: createBasePostDeathSeries(),
  householdExpenseAdjustmentResult: {
    baselineMonthlyTotal: 2000,
    adjustedMonthlyTotal: 1900,
    monthlyDelta: -100
  }
};
const originalInput = clone(input);
const result = api.previewIncomeImpactHouseholdExpenseScenarioHandoff(input);
assert.deepEqual(plain(input), originalInput, "handoff preview should not mutate inputs");
assert.deepEqual(
  api.previewIncomeImpactHouseholdExpenseScenarioHandoff(input),
  result,
  "handoff preview output should be deterministic"
);
assert.doesNotThrow(() => JSON.stringify(result), "handoff preview output should be JSON-serializable");
assert.equal(result.metadata.activeRuntimeConsumer, false, "handoff preview should remain inactive for runtime");
assert.equal(result.trace.graphSeriesConstructed, false, "handoff preview should not construct graph objects");
assert.equal(result.trace.runtimeWired, false, "handoff preview should not be runtime-wired");

assert.equal(result.monthlyDelta, -100);
assert.equal(result.totalDeltaApplied, -600);
assert.equal(result.comparisonPostDeathSeries.points[0].endingResources, 9900, "baseline endingResources should be preserved");
assert.equal(result.comparisonPostDeathSeries.points[0].availableResources, 9900, "baseline availableResources should be preserved");
assert.equal(
  result.comparisonPostDeathSeries.points[0].householdExpenseAdjustedAvailableResources,
  10000,
  "negative monthlyDelta should increase resources at month 1"
);
assert.equal(
  result.comparisonPostDeathSeries.points[2].householdExpenseAdjustedAvailableResources,
  9600,
  "negative monthlyDelta should increase resources cumulatively over time"
);
assert.equal(
  result.comparisonPostDeathSeries.points[2].cumulativeHouseholdExpenseDelta,
  -600,
  "cumulative effect should use the explicit month index"
);
assert.equal(
  result.comparisonPostDeathSeries.points[2].monthlyHouseholdExpenseDelta,
  -100,
  "monthly delta should be carried on every comparison point"
);
assert.equal(
  result.comparisonPostDeathSeries.points[0].trace.householdExpenseScenarioHandoffPreviewApplied,
  true,
  "comparison point should include trace marker"
);

const positiveResult = api.previewIncomeImpactHouseholdExpenseScenarioHandoff({
  basePostDeathSeries: createBasePostDeathSeries(),
  householdExpenseAdjustmentResult: {
    monthlyDelta: 100
  }
});
assert.equal(
  positiveResult.comparisonPostDeathSeries.points[0].householdExpenseAdjustedAvailableResources,
  9800,
  "positive monthlyDelta should decrease resources at month 1"
);
assert.equal(
  positiveResult.comparisonPostDeathSeries.points[2].householdExpenseAdjustedAvailableResources,
  8400,
  "positive monthlyDelta should decrease resources cumulatively over time"
);
assert.equal(positiveResult.totalDeltaApplied, 600);

const zeroResult = api.previewIncomeImpactHouseholdExpenseScenarioHandoff({
  basePostDeathSeries: createBasePostDeathSeries(),
  householdExpenseAdjustmentResult: {
    monthlyDelta: 0
  }
});
assert.equal(
  zeroResult.comparisonPostDeathSeries.points[1].householdExpenseAdjustedAvailableResources,
  9700,
  "zero monthlyDelta should leave resource path unchanged"
);
assert.equal(zeroResult.totalDeltaApplied, 0);

const calculatedDeltaResult = api.previewIncomeImpactHouseholdExpenseScenarioHandoff({
  basePostDeathSeries: createBasePostDeathSeries(),
  householdExpenseAdjustmentResult: {
    baselineMonthlyTotal: 2000,
    adjustedMonthlyTotal: 2100
  }
});
assert.equal(calculatedDeltaResult.monthlyDelta, 100, "monthlyDelta can be derived from adjusted minus baseline totals");

const missingDeltaResult = api.previewIncomeImpactHouseholdExpenseScenarioHandoff({
  basePostDeathSeries: createBasePostDeathSeries(),
  householdExpenseAdjustmentResult: {}
});
assert.equal(missingDeltaResult.comparisonPostDeathSeries, null, "missing monthlyDelta should not produce a fake comparison path");
assert.equal(missingDeltaResult.totalDeltaApplied, null);
assert.ok(hasIssue(missingDeltaResult.dataGaps, "missing-household-expense-monthly-delta"));

const missingMonthIndexResult = api.previewIncomeImpactHouseholdExpenseScenarioHandoff({
  basePostDeathSeries: createBasePostDeathSeries({
    points: [
      {
        date: "2031-01-01",
        endingResources: 9900,
        availableResources: 9900
      }
    ]
  }),
  householdExpenseAdjustmentResult: {
    monthlyDelta: -100
  }
});
assert.equal(missingMonthIndexResult.comparisonPostDeathSeries, null, "missing usable month index should not produce a fake comparison path");
assert.ok(hasIssue(missingMonthIndexResult.dataGaps, "missing-explicit-month-index"));

const irregularSeriesResult = api.previewIncomeImpactHouseholdExpenseScenarioHandoff({
  basePostDeathSeries: createBasePostDeathSeries({
    points: [
      {
        date: "2031-01-01",
        periodLabel: "Year 1",
        endingResources: 9900,
        availableResources: 9900
      },
      {
        date: "2032-09-15",
        periodLabel: "Irregular review point",
        endingResources: 6000,
        availableResources: 6000
      }
    ]
  }),
  householdExpenseAdjustmentResult: {
    monthlyDelta: -100
  }
});
assert.equal(irregularSeriesResult.comparisonPostDeathSeries, null, "irregular series without explicit month index should not produce a fake timeline");
assert.ok(hasIssue(irregularSeriesResult.dataGaps, "missing-explicit-month-index"));

const beforeScenarioContext = loadScenarioContext(false);
const afterScenarioContext = loadScenarioContext(true);
const beforeScenarioApi = beforeScenarioContext.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;
const afterScenarioApi = afterScenarioContext.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;
const scenarioInput = createScenarioFixture();
scenarioInput.householdExpenseStreamPolicyMode = "legacy";
const beforeScenario = plain(beforeScenarioApi.calculateIncomeImpactLifestyleScenario(clone(scenarioInput)));
afterScenarioContext.LensApp.lensAnalysis.incomeImpactHouseholdExpenseScenarioHandoffPreview
  .previewIncomeImpactHouseholdExpenseScenarioHandoff({
    basePostDeathSeries: createBasePostDeathSeries(),
    householdExpenseAdjustmentResult: { monthlyDelta: -100 }
  });
const afterScenario = plain(afterScenarioApi.calculateIncomeImpactLifestyleScenario(clone(scenarioInput)));
assert.deepEqual(afterScenario, beforeScenario, "importing/calling standalone handoff preview should not change retired Income Impact lifestyle output");

console.log("income-impact-household-expense-scenario-handoff-preview-check passed");
