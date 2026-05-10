#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const context = {
  LensApp: {
    lensAnalysis: {}
  },
  console
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: absolutePath });
  return source;
}

loadScript("app/features/lens-analysis/household-expense-lifestyle-range-policy.js");
loadScript("app/features/lens-analysis/household-expense-compression-policy.js");
loadScript("app/features/lens-analysis/expense-compression-thresholds.js");
loadScript("app/features/lens-analysis/household-expense-account-policy-resolver.js");
const helperSource = loadScript("app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js");
const calculations = context.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;

assert.ok(calculations, "lifestyle scenario calculations should load");
assert.equal(typeof calculations.calculateIncomeImpactLifestyleScenario, "function", "scenario helper export should exist");
assert.equal(typeof calculations.calculateIncomeImpactLifestyleComparisonScenario, "function", "retired comparison helper export should remain callable");
assert.doesNotMatch(
  helperSource,
  /getLegacy|buildLegacy|createLegacy|isDefaultSeedProtectedLifestyleExpense|income-impact-lifestyle-comparison-adapter-v1|baseNeedReconciliation|\breviewOnly\b/,
  "legacy lifestyle helper internals should be removed"
);
assert.doesNotMatch(
  helperSource,
  /householdExpenseStreamPolicyModeResolved:\s*normalizeString\(resolution\.mode\)\s*\|\|\s*"legacy"/,
  "mode trace fallback should not default to legacy"
);
assert.doesNotMatch(
  helperSource,
  /legacyScenarioOutputReplaced/,
  "stream preview trace should not carry stale legacy replacement labels"
);
assert.doesNotMatch(
  helperSource,
  /DEFAULT_COMPARISON_PATH_ID\s*=\s*"compression-post-death-resources"/,
  "stream lifestyle helper defaults should not use retired compression graph path naming"
);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeBasePostDeathSeries(monthIndexes) {
  const indexes = monthIndexes || [1, 2, 3];
  return {
    points: indexes.map((monthIndex, index) => ({
      monthIndex,
      date: `2031-${String(index + 6).padStart(2, "0")}-06`,
      survivorNeeds: 4000,
      essentialNeeds: 3000,
      discretionaryNeeds: 1000,
      netUse: 3500,
      startingResources: 100000 - (index * 2000),
      endingResources: 98000 - (index * 2000),
      availableResources: 98000 - (index * 2000),
      accumulatedUnmetNeed: 0,
      sourcePaths: ["scenario.postDeathSeries.points"]
    })),
    summary: {
      totalSurvivorNeeds: 12000,
      totalNetUse: 10500,
      accumulatedUnmetNeed: 0
    },
    depletion: {
      depleted: false,
      depletionDate: null,
      monthsCovered: indexes[indexes.length - 1],
      precision: "monthly"
    }
  };
}

function loadStreamPreviewDependencies() {
  [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js",
    "app/features/lens-analysis/income-impact-base-household-expense-stream.js",
    "app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js",
    "app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js"
  ].forEach(loadScript);
}

function createCompleteLivingFloorAssumptions() {
  return {
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyAmountsByBand: {
        infantToddler: 100,
        youngChild: 200,
        olderChild: 210,
        teenMale: 300,
        teenFemale: 280,
        adultMale: 300,
        adultFemale: 250,
        adultUnknown: 275,
        childUnknown: 190
      },
      householdSizeAdjustmentFactors: {
        "1": 1.1,
        "2": 1.05,
        "3": 1,
        "4": 0.95,
        "5": 0.9,
        "6Plus": 0.85
      }
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 100,
        monthlyPerMemberAmount: 25
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 80,
        monthlyPerMemberAmount: 10
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 150,
        monthlyPerAdultDriverAmount: 50
      }
    }
  };
}

function createStreamExpenseFact(overrides) {
  return Object.assign({
    source: "protectionModeling.data",
    sourceOwnedBy: "ongoingSupport",
    frequency: "monthly"
  }, overrides);
}

function createStreamPreviewLensModel() {
  return {
    valuationDate: "2026-01-01",
    ongoingSupport: {
      monthlyHousingSupportCost: 500,
      monthlyNonHousingEssentialSupportCost: 2100,
      monthlyTotalEssentialSupportCost: 2600,
      annualTotalEssentialSupportCost: 31200
    },
    expenseFacts: {
      expenses: [
        createStreamExpenseFact({
          expenseFactId: "housing",
          typeKey: "rentOrMortgagePayment",
          categoryKey: "housingExpense",
          label: "Mortgage",
          monthlyAmount: 500,
          ownedByField: "monthlyHousingSupportCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHousingSupportCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "food",
          typeKey: "groceries",
          categoryKey: "foodGroceries",
          label: "Groceries",
          monthlyAmount: 500,
          ownedByField: "monthlyFoodCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyFoodCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "school-meals",
          typeKey: "groceries",
          categoryKey: "foodGroceries",
          label: "School Meals",
          monthlyAmount: 100,
          ownedByField: "monthlyFoodCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyFoodCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "supplies",
          typeKey: "householdConsumablesSupplies",
          categoryKey: "foodGroceries",
          label: "Household Supplies",
          monthlyAmount: 100,
          ownedByField: "monthlyHouseholdSuppliesCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHouseholdSuppliesCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "dining",
          typeKey: "diningOutRestaurants",
          categoryKey: "foodGroceries",
          label: "Dining",
          monthlyAmount: 100,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "internet",
          typeKey: "internet",
          categoryKey: "utilities",
          label: "Internet",
          monthlyAmount: 100,
          ownedByField: "monthlyPhoneAndInternetCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyPhoneAndInternetCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "fuel",
          typeKey: "fuel",
          categoryKey: "transportation",
          label: "Fuel",
          monthlyAmount: 200,
          ownedByField: "monthlyTransportationCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyTransportationCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "utility",
          typeKey: "gasHeatingFuelPropaneOil",
          categoryKey: "utilities",
          label: "Gas Utility",
          monthlyAmount: 50,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "healthcare",
          typeKey: "healthcareOutOfPocketSupportDefault",
          categoryKey: "otherLivingExpense",
          label: "Healthcare",
          monthlyAmount: 150,
          ownedByField: "monthlyHealthcareOutOfPocketCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHealthcareOutOfPocketCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "debt",
          typeKey: "autoLoanPayment",
          categoryKey: "debtObligations",
          label: "Auto Loan",
          monthlyAmount: 50,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "insurance",
          typeKey: "householdInsurancePremiums",
          categoryKey: "insurancePremiums",
          label: "Insurance",
          monthlyAmount: 150,
          ownedByField: "monthlyOtherInsuranceCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherInsuranceCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "childcare",
          typeKey: "childcareExpense",
          categoryKey: "childcare",
          label: "Childcare",
          monthlyAmount: 300,
          ownedByField: "monthlyChildcareAndDependentCareCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyChildcareAndDependentCareCost" }
        }),
        createStreamExpenseFact({
          expenseFactId: "final",
          typeKey: "funeralBurialEstimate",
          categoryKey: "funeralBurial",
          label: "Funeral",
          monthlyAmount: 25,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "education",
          typeKey: "privateSchoolTuition",
          categoryKey: "educationExpense",
          label: "Education",
          monthlyAmount: 25,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "tax",
          typeKey: "taxPreparationFees",
          categoryKey: "taxes",
          label: "Tax Prep",
          monthlyAmount: 25,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "giving",
          typeKey: "charitableGiving",
          categoryKey: "givingCommunity",
          label: "Giving",
          monthlyAmount: 25,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        }),
        createStreamExpenseFact({
          expenseFactId: "other",
          typeKey: "otherHouseholdExpenseDefault",
          categoryKey: "otherLivingExpense",
          label: "Other Household",
          monthlyAmount: 200,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        })
      ]
    }
  };
}

function createStreamPreviewInput(overrides) {
  return Object.assign({
    sliderValue: -100,
    basePostDeathSeries: makeBasePostDeathSeries(),
    householdExpenseStreamPolicyMode: "preview",
    lensModel: createStreamPreviewLensModel(),
    accountPolicy: {
      version: 1,
      livingFloorAssumptions: createCompleteLivingFloorAssumptions()
    },
    profileRecord: {
      state: "co",
      maritalStatus: "Married",
      spouseDateOfBirth: "1986-06-15",
      spouseGender: "female",
      dependentDetails: [
        { id: "young", dateOfBirth: "2018-05-01", sex: "male" },
        { id: "teen", age: 15, sex: "female" }
      ]
    },
    pmiFacts: {
      stateOfResidence: "co"
    },
    valuationDate: "2026-01-01",
    adultDriverCount: 1
  }, overrides || {});
}

function findRow(result, expenseTypeKey) {
  const row = result.householdExpenseStreamPreview.householdExpenseAdjustmentResult.rowAdjustments.find((candidate) => {
    return candidate.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(row, `${expenseTypeKey} should be represented in stream output`);
  return row;
}

const missingHelpersInput = createStreamPreviewInput();
delete missingHelpersInput.householdExpenseStreamPolicyMode;
const missingHelpersBefore = cloneJson(missingHelpersInput);
const missingHelpers = calculations.calculateIncomeImpactLifestyleScenario(missingHelpersInput);
assert.deepEqual(missingHelpersInput, missingHelpersBefore, "missing-helper calculation should not mutate input");
assert.equal(missingHelpers.status, "partial", "missing stream helpers should produce partial output");
assert.equal(missingHelpers.trace.householdExpenseStreamPolicyModeResolved, "streamUnavailable");
assert.equal(missingHelpers.trace.streamInputMissing, true);
assert.ok(missingHelpers.trace.streamInputMissingReasons.includes("missingHelper:incomeImpactHouseholdExpensePolicyRuntimeAdapter"));
assert.equal(missingHelpers.trace.legacyFallbackUsed, false, "missing helpers should not fall back to legacy");
assert.ok(missingHelpers.dataGaps.some((gap) => gap.code === "missing-household-expense-stream-inputs"));
assert.equal(Object.prototype.hasOwnProperty.call(missingHelpers, "comparisonScenario"), false, "missing helpers should not emit a comparison scenario");

const explicitLegacy = calculations.calculateIncomeImpactLifestyleScenario(createStreamPreviewInput({
  householdExpenseStreamPolicyMode: "legacy"
}));
assert.equal(explicitLegacy.status, "partial", "explicit legacy mode should be retired");
assert.equal(explicitLegacy.trace.householdExpenseStreamPolicyModeResolved, "streamUnavailable");
assert.equal(explicitLegacy.trace.householdExpenseStreamPolicyModeRequested, "legacy");
assert.equal(explicitLegacy.trace.legacyModeRetired, true);
assert.equal(explicitLegacy.trace.legacyFallbackUsed, false);
assert.ok(explicitLegacy.dataGaps.some((gap) => gap.code === "retired-household-expense-legacy-mode"));
assert.equal(Object.prototype.hasOwnProperty.call(explicitLegacy, "comparisonScenario"), false, "retired legacy should not emit old comparison output");

const explicitLegacyFlag = calculations.calculateIncomeImpactLifestyleScenario(createStreamPreviewInput({
  useStreamHouseholdExpenseAdjustments: false
}));
assert.equal(explicitLegacyFlag.trace.legacyModeRetired, true, "old false flag should also retire legacy mode");

const directRetiredComparison = calculations.calculateIncomeImpactLifestyleComparisonScenario({
  lifestyleScenario: explicitLegacy,
  basePostDeathSeries: makeBasePostDeathSeries()
});
assert.equal(directRetiredComparison.status, "partial");
assert.equal(directRetiredComparison.trace.calculationMethod, "income-impact-lifestyle-comparison-retired-v1");
assert.equal(directRetiredComparison.trace.legacyModeRetired, true);
assert.ok(directRetiredComparison.dataGaps.some((gap) => gap.code === "retired-household-expense-legacy-mode"));

loadStreamPreviewDependencies();

const defaultInput = createStreamPreviewInput();
delete defaultInput.householdExpenseStreamPolicyMode;
const defaultBefore = cloneJson(defaultInput);
const streamDefault = calculations.calculateIncomeImpactLifestyleScenario(defaultInput);
assert.deepEqual(defaultInput, defaultBefore, "default stream calculation should not mutate input");
assert.equal(streamDefault.status, "complete", "complete stream inputs should produce complete default output");
assert.equal(streamDefault.trace.householdExpenseStreamPolicyModeResolved, "activeGraphAdjustments");
assert.equal(streamDefault.trace.streamDefaultUsed, true);
assert.equal(streamDefault.trace.legacyFallbackUsed, false);
assert.ok(streamDefault.householdExpenseStreamPreview, "default stream mode should include consumed stream context");
assert.equal(streamDefault.householdExpenseStreamPreview.metadata.activeRuntimeConsumer, true);
assert.equal(streamDefault.comparisonScenario.trace.calculationMethod, "income-impact-household-expense-stream-comparison-adapter-v1");
assert.equal(streamDefault.comparisonScenario.kind, "lifestyleComparison", "stream comparison should use the lifestyle comparison kind");
assert.equal(streamDefault.comparisonScenario.pathId, "lifestyle-post-death-resources", "stream comparison should use the lifestyle graph path");
assert.equal(
  JSON.stringify(streamDefault).includes("compression-post-death-resources"),
  false,
  "active stream output should not emit the retired compression graph path"
);
assert.equal(streamDefault.comparisonScenario.trace.graphAdjustmentSource, "baseHouseholdExpenseStream");
assert.equal(
  streamDefault.monthlyDelta,
  streamDefault.householdExpenseStreamPreview.householdExpenseAdjustmentResult.monthlyDelta,
  "top-level monthlyDelta should come from stream adjustment output"
);
assert.equal(
  streamDefault.adjustedExpenses.length,
  streamDefault.householdExpenseStreamPreview.householdExpenseAdjustmentResult.rowAdjustments.length,
  "adjustedExpenses should be a stream-derived compatibility summary"
);
streamDefault.adjustedExpenses.forEach((row, index) => {
  const sourceRow = streamDefault.householdExpenseStreamPreview.householdExpenseAdjustmentResult.rowAdjustments[index];
  assert.equal(row.expenseTypeKey, sourceRow.expenseTypeKey, "stream summary should preserve row identity");
  assert.equal(row.baselineMonthlyAmount, sourceRow.baselineMonthlyAmount, "stream summary should preserve baseline amount");
  assert.equal(row.adjustedMonthlyAmount, sourceRow.adjustedMonthlyAmount, "stream summary should preserve adjusted amount");
  assert.equal(row.monthlyDelta, sourceRow.monthlyDelta, "stream summary should preserve monthly delta");
  assert.equal(row.sliderEligible, sourceRow.graphAdjustable === true, "stream summary sliderEligible should mirror graphAdjustable");
});

const activeGraph = calculations.calculateIncomeImpactLifestyleScenario(createStreamPreviewInput({
  householdExpenseStreamPolicyMode: "activeGraphAdjustments"
}));
assert.deepEqual(streamDefault.comparisonScenario, activeGraph.comparisonScenario, "default stream output should match explicit activeGraphAdjustments");
assert.deepEqual(
  streamDefault.householdExpenseStreamPreview.householdExpenseAdjustmentResult,
  activeGraph.householdExpenseStreamPreview.householdExpenseAdjustmentResult,
  "default stream adjustment result should match explicit activeGraphAdjustments"
);

const preview = calculations.calculateIncomeImpactLifestyleScenario(createStreamPreviewInput());
assert.equal(preview.trace.householdExpenseStreamPolicyModeResolved, "preview");
assert.equal(preview.householdExpenseStreamPreview.metadata.previewOnly, true, "preview context should remain preview-only");
assert.equal(preview.householdExpenseStreamPreview.metadata.activeRuntimeConsumer, false, "preview context should not be marked consumed");
assert.equal(preview.householdExpenseStreamPreview.trace.graphOutputChanged, false, "preview metadata should not claim graph output changed");
assert.equal(preview.trace.previewComparisonScenarioSource, "activeGraphAdjustments", "preview should preserve stream/default comparison output");
assert.deepEqual(preview.comparisonScenario, streamDefault.comparisonScenario, "preview comparison should use the stream default comparison scenario");

const missingRuntimeInput = createStreamPreviewInput();
delete missingRuntimeInput.householdExpenseStreamPolicyMode;
delete missingRuntimeInput.lensModel.ongoingSupport.monthlyTotalEssentialSupportCost;
const missingRuntime = calculations.calculateIncomeImpactLifestyleScenario(missingRuntimeInput);
assert.equal(missingRuntime.status, "partial");
assert.equal(missingRuntime.trace.householdExpenseStreamPolicyModeResolved, "streamUnavailable");
assert.equal(missingRuntime.trace.streamInputMissing, true);
assert.ok(missingRuntime.trace.streamInputMissingReasons.includes("missingOngoingSupportMonthlyTotal"));
assert.equal(missingRuntime.trace.legacyFallbackUsed, false);
assert.equal(Object.prototype.hasOwnProperty.call(missingRuntime, "comparisonScenario"), false);

const foodBucket = activeGraph.householdExpenseStreamPreview.householdExpenseAdjustmentResult.bucketAdjustments.find((bucket) => bucket.planningBucketKey === "foodAtHomeConsumables");
assert.ok(foodBucket, "Food at Home bucket should exist");
assert.equal(foodBucket.rowCount, 2, "Food at Home rows should aggregate into one planning-bucket adjustment");
assert.equal(foodBucket.trace.floorAppliedOncePerPlanningBucket, true, "Food at Home floor should apply once per bucket");
assert.equal(foodBucket.trace.perRowDollarFloorApplied, false, "Food at Home floor should not apply per row");

[
  ["householdConsumables", 175],
  ["communicationsConnectivity", 110],
  ["transportationBasics", 200]
].forEach(([planningBucketKey, expectedFloor]) => {
  const bucket = activeGraph.householdExpenseStreamPreview.householdExpenseAdjustmentResult.bucketAdjustments.find((candidate) => candidate.planningBucketKey === planningBucketKey);
  assert.ok(bucket, `${planningBucketKey} should have a bucket adjustment`);
  assert.equal(bucket.estimatedDollarPlanningFloorMonthly, expectedFloor, `${planningBucketKey} should use its MODEL90 default floor preview`);
  assert.equal(bucket.trace.perRowDollarFloorApplied, false, `${planningBucketKey} should not apply a per-row dollar floor`);
});
assert.deepEqual(
  cloneJson(activeGraph.householdExpenseStreamPreview.householdExpenseAdjustmentResult.trace.floorAppliedBuckets),
  [
    "communicationsConnectivity",
    "foodAtHomeConsumables",
    "householdConsumables",
    "transportationBasics"
  ],
  "active stream mode should trace each applied money-floor bucket exactly once"
);

[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "gasHeatingFuelPropaneOil",
  "healthcareOutOfPocketSupportDefault",
  "funeralBurialEstimate",
  "privateSchoolTuition",
  "householdInsurancePremiums",
  "taxPreparationFees",
  "charitableGiving",
  "childcareExpense"
].forEach((expenseTypeKey) => {
  const row = findRow(activeGraph, expenseTypeKey);
  assert.equal(row.adjustedMonthlyAmount, row.baselineMonthlyAmount, `${expenseTypeKey} should stay fixed in stream mode`);
  assert.equal(row.monthlyDelta, 0, `${expenseTypeKey} should not move in stream mode`);
  assert.equal(row.graphAdjustable, false, `${expenseTypeKey} should not be graph adjustable`);
});

const incompleteFloors = calculations.calculateIncomeImpactLifestyleScenario(createStreamPreviewInput({
  householdExpenseStreamPolicyMode: "activeGraphAdjustments",
  accountPolicy: {
    version: 1,
    livingFloorAssumptions: {}
  }
}));
assert.deepEqual(
  cloneJson(incompleteFloors.householdExpenseStreamPreview.householdExpenseAdjustmentResult.trace.floorAppliedBuckets),
  [],
  "missing living-floor assumptions should not apply money-floor buckets"
);
assert.ok(
  incompleteFloors.householdExpenseStreamPreview.householdExpenseAdjustmentResult.dataGaps.some((gap) => gap.code === "money-floor-bucket-missing-dollar-floor-ratio-fallback"),
  "missing floor assumptions should create ratio fallback data gaps"
);

console.log("income-impact-lifestyle-scenario-calculations-check passed");
