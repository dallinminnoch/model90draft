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

const policy = context.LensApp.lensAnalysis.householdExpenseLifestyleRangePolicy;
const compressionPolicy = context.LensApp.lensAnalysis.householdExpenseCompressionPolicy;
const thresholds = context.LensApp.lensAnalysis.expenseCompressionThresholds;
const accountPolicyResolver = context.LensApp.lensAnalysis.householdExpenseAccountPolicyResolver;
const calculations = context.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations;
assert.ok(policy, "lifestyle range policy should load");
assert.ok(accountPolicyResolver, "account policy resolver should load for explicit resolved policy fixture");
assert.ok(calculations, "lifestyle scenario calculations should load");
assert.equal(typeof calculations.calculateIncomeImpactLifestyleScenario, "function", "helper export should exist");
assert.equal(typeof calculations.calculateIncomeImpactLifestyleComparisonScenario, "function", "comparison helper export should exist");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeFixtureExpenses() {
  return [
    {
      id: "housing-1",
      expenseTypeKey: "rentOrMortgagePayment",
      categoryKey: "housingExpense",
      label: "Mortgage",
      monthlyAmount: 2000,
      sourcePath: "fixture.housing"
    },
    {
      id: "groceries-1",
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Groceries",
      monthlyAmount: 1000,
      sourcePath: "fixture.groceries"
    },
    {
      id: "dining-1",
      expenseTypeKey: "diningOutRestaurants",
      categoryKey: "foodGroceries",
      label: "Dining",
      monthlyAmount: 400,
      sourcePath: "fixture.dining"
    },
    {
      id: "subscriptions-1",
      expenseTypeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      label: "Streaming",
      monthlyAmount: 120,
      sourcePath: "fixture.streaming"
    },
    {
      id: "travel-1",
      expenseTypeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      label: "Travel",
      monthlyAmount: 600,
      sourcePath: "fixture.travel"
    },
    {
      id: "debt-1",
      expenseTypeKey: "autoLoanPayment",
      categoryKey: "debtObligations",
      label: "Auto Loan",
      monthlyAmount: 350,
      sourceOwnedBy: "debtRecords",
      isDebtPaymentExpense: true,
      sourcePath: "protectionModeling.data.debtRecords[0]"
    },
    {
      id: "childcare-1",
      expenseTypeKey: "daycareChildcare",
      categoryKey: "familySupport",
      label: "Daycare",
      monthlyAmount: 800,
      sourcePath: "fixture.childcare"
    },
    {
      id: "tax-1",
      expenseTypeKey: "federalStateLocalIncomeTaxPayments",
      categoryKey: "taxes",
      label: "Taxes",
      monthlyAmount: 300,
      sourcePath: "fixture.taxes"
    },
    {
      id: "insurance-1",
      expenseTypeKey: "healthInsurancePremiums",
      categoryKey: "insurancePremiums",
      label: "Health Insurance",
      monthlyAmount: 500,
      sourcePath: "fixture.insurance"
    },
    {
      id: "healthcare-1",
      expenseTypeKey: "copaysCoinsurance",
      categoryKey: "ongoingHealthcare",
      label: "Copays",
      monthlyAmount: 90,
      sourcePath: "fixture.healthcare"
    },
    {
      id: "giving-1",
      expenseTypeKey: "charitableGiving",
      categoryKey: "givingCommunity",
      label: "Charitable Giving",
      monthlyAmount: 200,
      sourcePath: "fixture.giving"
    },
    {
      id: "reserve-1",
      expenseTypeKey: "emergencyFundContributions",
      categoryKey: "savingsGoalContributions",
      label: "Emergency Fund Contribution",
      monthlyAmount: 150,
      sourcePath: "fixture.reserve"
    }
  ];
}

function calculate(sliderValue, extraInput) {
  return calculations.calculateIncomeImpactLifestyleScenario(Object.assign({
    expenses: makeFixtureExpenses(),
    sliderValue
  }, extraInput || {}));
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

function makeSafeScalarLifestyleExpenses() {
  return [
    {
      id: "scalar-food",
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Scalar Groceries",
      monthlyAmount: 1000,
      sourceKey: "foodCost",
      sourceOwnedBy: "ongoingSupport",
      ownedByField: "monthlyFoodCost",
      sourcePath: "protectionModeling.data.foodCost",
      isGeneratedExpense: true,
      isScalarHouseholdExpense: true,
      isCompressionEligibleSource: true,
      metadata: {
        normalizedSourcePath: "lensModel.ongoingSupport.monthlyFoodCost"
      }
    },
    {
      id: "scalar-travel",
      expenseTypeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      label: "Scalar Travel",
      monthlyAmount: 500,
      sourceKey: "travelDiscretionaryCost",
      sourceOwnedBy: "ongoingSupport",
      ownedByField: "monthlyTravelAndDiscretionaryCost",
      sourcePath: "protectionModeling.data.travelDiscretionaryCost",
      isGeneratedExpense: true,
      isScalarHouseholdExpense: true,
      isCompressionEligibleSource: true,
      metadata: {
        normalizedSourcePath: "lensModel.ongoingSupport.monthlyTravelAndDiscretionaryCost"
      }
    }
  ];
}

function byType(result, typeKey) {
  const item = result.adjustedExpenses.find((candidate) => candidate.expenseTypeKey === typeKey);
  assert.ok(item, `${typeKey} adjusted item should exist`);
  return item;
}

function resolveAccountPolicy(accountPolicy, hardGuardrails) {
  return accountPolicyResolver.resolveHouseholdExpenseAccountPolicy({
    defaultLifestyleRangePolicies: policy.listLifestyleRangePolicies(),
    defaultCompressionPolicyRules: compressionPolicy.getHouseholdExpenseCompressionPolicyRules(),
    defaultCompressionThresholdRules: thresholds.getExpenseCompressionThresholdRules(),
    accountPolicy,
    hardGuardrails
  });
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
    stateCostAdjustmentMultipliers: {
      version: 1,
      appliesToAdjustmentClass: "moneyFloorAdjusted",
      defaultMultiplier: 1.1,
      globalStateAdjustmentMultipliersByState: {
        CO: { multiplier: 1.2, source: "ADMIN_ENTERED", sourcePeriod: "2026" }
      },
      bucketStateAdjustmentMultipliers: {}
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 100,
        monthlyPerMemberAmount: 25,
        stateAdjustmentEnabled: true,
        notes: null
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 80,
        monthlyPerMemberAmount: 10,
        stateAdjustmentEnabled: true,
        notes: null
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 150,
        monthlyPerAdultDriverAmount: 50,
        stateAdjustmentEnabled: true,
        notes: null
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
          expenseFactId: "healthcare",
          typeKey: "healthcareOutOfPocketSupportDefault",
          categoryKey: "otherLivingExpense",
          label: "Healthcare",
          monthlyAmount: 150,
          ownedByField: "monthlyHealthcareOutOfPocketCost",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHealthcareOutOfPocketCost" }
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
          expenseFactId: "other",
          typeKey: "otherHouseholdExpenseDefault",
          categoryKey: "otherLivingExpense",
          label: "Other Household",
          monthlyAmount: 500,
          ownedByField: "monthlyOtherHouseholdExpenses",
          metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
        })
      ]
    }
  };
}

function createStreamPreviewInput(overrides) {
  return Object.assign({
    expenses: makeFixtureExpenses(),
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

const baseline = calculate(0);
assert.equal(baseline.status, "complete", "baseline fixture should be complete");
assert.equal(baseline.sliderValue, 0);
assert.equal(baseline.totalBaselineMonthlyExpenses, baseline.totalAdjustedMonthlyExpenses, "slider 0 should preserve exact baseline");
assert.equal(baseline.monthlyDelta, 0, "slider 0 delta should be zero");
baseline.adjustedExpenses.forEach((item) => {
  assert.equal(item.adjustedMonthlyAmount, item.baselineMonthlyAmount, `${item.expenseTypeKey} should preserve baseline at slider 0`);
});
assert.equal(baseline.trace.baselinePreservedAtZero, true, "trace should prove baseline preservation");
assert.equal(baseline.trace.policySource, "defaultSeedPolicy", "default helper path should use seed policy source");
assert.equal(baseline.trace.resolvedAccountPolicyUsed, false, "default helper path should not claim account policy use");

const conservative = calculate(-100);
assert.equal(byType(conservative, "groceries").adjustedMonthlyAmount, 800, "groceries should move to conservative floor");
assert.equal(byType(conservative, "diningOutRestaurants").adjustedMonthlyAmount, 0, "dining should move to floor");
assert.equal(byType(conservative, "streamingDigitalSubscriptions").adjustedMonthlyAmount, 0, "subscriptions should move to floor");
assert.equal(byType(conservative, "vacationsTravel").adjustedMonthlyAmount, 0, "travel should move to floor");
assert.equal(byType(conservative, "emergencyFundContributions").adjustedMonthlyAmount, 0, "pauseable contribution should approach zero");
assert.ok(conservative.monthlyDelta < 0, "conservative slider should reduce eligible expense total");

const elevated = calculate(100);
assert.equal(byType(elevated, "groceries").adjustedMonthlyAmount, 1150, "groceries should move to modest elevated ceiling");
assert.equal(byType(elevated, "diningOutRestaurants").adjustedMonthlyAmount, 700, "dining should move to elevated ceiling");
assert.equal(byType(elevated, "streamingDigitalSubscriptions").adjustedMonthlyAmount, 180, "subscriptions should move to elevated ceiling");
assert.equal(byType(elevated, "vacationsTravel").adjustedMonthlyAmount, 1080, "travel should move to elevated ceiling");
assert.equal(byType(elevated, "emergencyFundContributions").adjustedMonthlyAmount, 150, "pauseable contribution should not elevate in V1");
assert.ok(elevated.monthlyDelta > 0, "elevated slider should increase eligible lifestyle expense total");

const partialConservative = calculate(-50);
assert.equal(byType(partialConservative, "groceries").adjustedMonthlyAmount, 900, "partial conservative groceries should interpolate");
assert.equal(byType(partialConservative, "diningOutRestaurants").adjustedMonthlyAmount, 200, "partial conservative dining should interpolate");
assert.equal(byType(partialConservative, "streamingDigitalSubscriptions").adjustedMonthlyAmount, 60, "partial conservative subscriptions should interpolate");

const partialElevated = calculate(50);
assert.equal(byType(partialElevated, "groceries").adjustedMonthlyAmount, 1075, "partial elevated groceries should interpolate");
assert.equal(byType(partialElevated, "diningOutRestaurants").adjustedMonthlyAmount, 550, "partial elevated dining should interpolate");
assert.equal(byType(partialElevated, "vacationsTravel").adjustedMonthlyAmount, 840, "partial elevated travel should interpolate");

const clampedHigh = calculate(150);
assert.equal(clampedHigh.sliderValue, 100, "slider above range should clamp to 100");
assert.equal(byType(clampedHigh, "diningOutRestaurants").adjustedMonthlyAmount, byType(clampedHigh, "diningOutRestaurants").ceilingMonthlyAmount, "adjusted value should clamp to ceiling");
assert.equal(clampedHigh.warnings.some((warning) => warning.code === "lifestyle-slider-value-clamped"), true, "clamp warning should be emitted");

const clampedLow = calculate(-150);
assert.equal(clampedLow.sliderValue, -100, "slider below range should clamp to -100");
assert.equal(byType(clampedLow, "groceries").adjustedMonthlyAmount, byType(clampedLow, "groceries").floorMonthlyAmount, "adjusted value should clamp to floor");

[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "daycareChildcare",
  "federalStateLocalIncomeTaxPayments",
  "healthInsurancePremiums",
  "copaysCoinsurance",
  "charitableGiving"
].forEach((typeKey) => {
  const item = byType(elevated, typeKey);
  assert.equal(item.adjustedMonthlyAmount, item.baselineMonthlyAmount, `${typeKey} should stay fixed/review-only`);
  assert.equal(item.monthlyDelta, 0, `${typeKey} should have zero delta`);
  assert.equal(item.sliderEligible, false, `${typeKey} should not be slider eligible`);
});
assert.equal(byType(elevated, "autoLoanPayment").reasonCode, "generated-debt-fixed", "generated debt payment should use specific fixed reason");
assert.equal(byType(elevated, "rentOrMortgagePayment").reasonCode, "housing-payment-fixed", "mortgage/rent should use housing fixed reason");

const baselineTotalFromItems = baseline.adjustedExpenses.reduce((total, item) => total + item.baselineMonthlyAmount, 0);
const adjustedTotalFromItems = elevated.adjustedExpenses.reduce((total, item) => total + item.adjustedMonthlyAmount, 0);
const deltaFromItems = elevated.adjustedExpenses.reduce((total, item) => total + item.monthlyDelta, 0);
assert.equal(baseline.totalBaselineMonthlyExpenses, Number(baselineTotalFromItems.toFixed(2)), "baseline total should reconcile");
assert.equal(elevated.totalAdjustedMonthlyExpenses, Number(adjustedTotalFromItems.toFixed(2)), "adjusted total should reconcile");
assert.equal(elevated.monthlyDelta, Number(deltaFromItems.toFixed(2)), "delta total should reconcile");
assert.equal(
  elevated.fixedExpensesTotal + elevated.sliderEligibleExpensesTotal,
  elevated.totalBaselineMonthlyExpenses,
  "fixed plus eligible baseline totals should reconcile"
);
assert.ok(elevated.conservativeFloorTotal <= elevated.totalBaselineMonthlyExpenses, "floor total should be at or below baseline");
assert.ok(elevated.elevatedCeilingTotal >= elevated.totalBaselineMonthlyExpenses, "ceiling total should be at or above baseline");

const mutableInput = {
  expenses: makeFixtureExpenses(),
  sliderValue: -50,
  householdFacts: {
    householdMemberCount: 3
  }
};
const mutableBefore = cloneJson(mutableInput);
const mutableResult = calculations.calculateIncomeImpactLifestyleScenario(mutableInput);
assert.deepEqual(mutableInput, mutableBefore, "helper should not mutate input");
mutableResult.adjustedExpenses[0].label = "Broken";
assert.notEqual(calculate(-50).adjustedExpenses[0].label, "Broken", "output should be independent per calculation");

const rules = policy.listLifestyleRangePolicies();
const byRules = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: 100,
  lifestyleRangePolicies: rules
});
assert.equal(byType(byRules, "diningOutRestaurants").adjustedMonthlyAmount, 700, "helper should support explicit policy rules");
assert.equal(byRules.trace.policySource, "fallbackPolicy", "legacy explicit policy rules should trace fallbackPolicy source");

const byOverrideResolver = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: [{ expenseTypeKey: "customLifestyle", categoryKey: "custom", monthlyAmount: 100 }],
  sliderValue: 100,
  policyResolver: () => ({
    expenseTypeKey: "customLifestyle",
    categoryKey: "custom",
    displayName: "Custom Lifestyle",
    sliderEligible: true,
    rangeBehavior: "expandable",
    conservativeFloorRatio: 0.5,
    elevatedCeilingRatio: 1.2,
    floorTierKey: "notApplicable",
    ceilingTierKey: "notApplicable",
    ceilingTierMultiplier: null,
    protectedFloorPolicy: "allowModerateReduction",
    allowBelowBaseline: true,
    allowAboveBaseline: true,
    requiresAdvisorReview: false,
    sourcePolicyDecision: "YES",
    version: 1
  })
});
assert.equal(byType(byOverrideResolver, "customLifestyle").adjustedMonthlyAmount, 120, "helper should support resolver override");
assert.equal(byOverrideResolver.trace.policySource, "fallbackPolicy", "custom resolver override should trace fallbackPolicy source");

const resolvedAccountPolicy = resolveAccountPolicy({
  version: 1,
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "groceries",
      conservativeFloorRatio: 0.7,
      elevatedCeilingRatio: 1.3
    },
    {
      expenseTypeKey: "diningOutRestaurants",
      conservativeFloorRatio: 0.1,
      elevatedCeilingRatio: 1.4
    }
  ]
});
const explicitResolvedConservative = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: -100,
  resolvedLifestyleRangePolicies: resolvedAccountPolicy.resolvedLifestyleRangePolicies
});
assert.equal(explicitResolvedConservative.trace.policySource, "resolvedAccountPolicy", "explicit resolved policy should trace account policy source");
assert.equal(explicitResolvedConservative.trace.resolvedAccountPolicyUsed, true, "explicit resolved policy should be marked used");
assert.equal(byType(explicitResolvedConservative, "groceries").adjustedMonthlyAmount, 700, "resolved account policy should change grocery floor behavior");
assert.equal(byType(explicitResolvedConservative, "diningOutRestaurants").adjustedMonthlyAmount, 40, "resolved account policy should change dining floor behavior");

const explicitResolvedElevated = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: 100,
  resolvedLifestyleRangePolicies: resolvedAccountPolicy.resolvedLifestyleRangePolicies
});
assert.equal(byType(explicitResolvedElevated, "groceries").adjustedMonthlyAmount, 1300, "resolved account policy should change grocery ceiling behavior");
assert.equal(byType(explicitResolvedElevated, "diningOutRestaurants").adjustedMonthlyAmount, 560, "resolved account policy should change dining ceiling behavior");

const maliciousResolvedPolicy = resolveAccountPolicy({
  version: 1,
  lifestyleRangeOverrides: [
    {
      expenseTypeKey: "rentOrMortgagePayment",
      sliderEligible: true,
      rangeBehavior: "expandable",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 2,
      allowBelowBaseline: true,
      allowAboveBaseline: true
    },
    {
      expenseTypeKey: "autoLoanPayment",
      sliderEligible: true,
      rangeBehavior: "expandable"
    },
    {
      expenseTypeKey: "healthInsurancePremiums",
      sliderEligible: true,
      rangeBehavior: "compressible"
    },
    {
      expenseTypeKey: "daycareChildcare",
      sliderEligible: true,
      rangeBehavior: "compressible"
    },
    {
      expenseTypeKey: "charitableGiving",
      sliderEligible: true,
      rangeBehavior: "expandable"
    }
  ]
});
const protectedResolved = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: 100,
  resolvedLifestyleRangePolicies: maliciousResolvedPolicy.resolvedLifestyleRangePolicies
});
[
  "rentOrMortgagePayment",
  "autoLoanPayment",
  "healthInsurancePremiums",
  "daycareChildcare",
  "charitableGiving"
].forEach((typeKey) => {
  const item = byType(protectedResolved, typeKey);
  assert.equal(item.adjustedMonthlyAmount, item.baselineMonthlyAmount, `${typeKey} should remain fixed with resolver guardrails`);
  assert.equal(item.sliderEligible, false, `${typeKey} should remain slider-ineligible with resolver guardrails`);
});

const corruptResolvedPolicy = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: -100,
  resolvedLifestyleRangePolicies: { bad: true }
});
assert.equal(corruptResolvedPolicy.trace.policySource, "fallbackPolicy", "corrupt resolved policy should trace fallbackPolicy");
assert.equal(corruptResolvedPolicy.trace.fallbackPolicyUsed, true, "corrupt resolved policy should mark fallback used");
assert.equal(
  corruptResolvedPolicy.warnings.some((warning) => warning.code === "invalid-resolved-lifestyle-range-policy"),
  true,
  "corrupt resolved policy should warn"
);
assert.equal(
  corruptResolvedPolicy.dataGaps.some((gap) => gap.code === "invalid-resolved-lifestyle-range-policy"),
  true,
  "corrupt resolved policy should create a data gap"
);
assert.equal(byType(corruptResolvedPolicy, "groceries").adjustedMonthlyAmount, 800, "corrupt resolved policy should fall back to seed grocery floor");

const partialMissing = calculations.calculateIncomeImpactLifestyleScenario({ sliderValue: 0 });
assert.equal(partialMissing.status, "partial", "missing expenses should return partial");
assert.equal(partialMissing.dataGaps.some((gap) => gap.code === "missing-lifestyle-expenses"), true, "missing expense gap should be emitted");

const basePostDeathSeries = makeBasePostDeathSeries();
const safeCurrent = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: 0,
  basePostDeathSeries
});
assert.equal(safeCurrent.status, "complete", "current lifestyle comparison with safe scalar facts should be complete");
assert.ok(safeCurrent.comparisonScenario, "helper should return a graph comparison scenario when base series is provided");
assert.deepEqual(
  safeCurrent.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "slider 0 comparison series should exactly match baseline"
);
assert.equal(safeCurrent.comparisonScenario.trace.graphMonthlyDelta, 0);
assert.equal(safeCurrent.comparisonScenario.trace.noOpComparison, true);

const safeConservative = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: -100,
  basePostDeathSeries
});
assert.equal(safeConservative.status, "complete", "safe scalar lifestyle deltas should reconcile to base survivor needs");
assert.equal(safeConservative.monthlyDelta, -700, "safe scalar fixture should reduce monthly expense total");
assert.equal(safeConservative.comparisonScenario.trace.graphMonthlyDelta, -700, "reconciled graph delta should match safe scalar monthly delta");
assert.equal(
  safeConservative.comparisonScenario.trace.baseNeedReconciliation.graphAdjustmentItemCount,
  2,
  "both safe scalar items should be graph-adjustment eligible"
);
assert.deepEqual(
  safeConservative.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  [98700, 97400, 96100],
  "conservative comparison should apply cumulative delta by explicit monthIndex"
);
assert.equal(
  safeConservative.comparisonScenario.postDeathSeries.points[2].trace.elapsedMonthIndexUsed,
  3,
  "comparison trace should record explicit elapsed month index"
);

const sparseBasePostDeathSeries = makeBasePostDeathSeries([1, 3, 6]);
const sparseResult = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: -100,
  basePostDeathSeries: sparseBasePostDeathSeries
});
assert.deepEqual(
  sparseResult.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  [98700, 98100, 98200],
  "sparse/non-contiguous series should use explicit monthIndex, not array position"
);
assert.equal(
  sparseResult.comparisonScenario.postDeathSeries.points[2].trace.cumulativeExpenseDeltaApplied,
  -4200,
  "month 6 should carry six months of reconciled monthly delta"
);

const unreconciled = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses(),
  sliderValue: -100,
  basePostDeathSeries
});
assert.equal(unreconciled.status, "partial", "unreconciled graph-moving expense facts should mark output partial");
assert.ok(
  unreconciled.dataGaps.some((gap) => gap.code === "unreconciled-lifestyle-expense-facts-excluded-from-graph"),
  "unreconciled expense facts should create a data gap"
);
assert.equal(unreconciled.comparisonScenario.trace.graphMonthlyDelta, 0, "unreconciled deltas should not move graph");
assert.deepEqual(
  unreconciled.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "unreconciled deltas should produce a safe baseline/no-op comparison"
);

const allFixed = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeFixtureExpenses().filter((expense) => [
    "rentOrMortgagePayment",
    "autoLoanPayment",
    "daycareChildcare",
    "federalStateLocalIncomeTaxPayments",
    "healthInsurancePremiums",
    "copaysCoinsurance",
    "charitableGiving"
  ].includes(expense.expenseTypeKey)),
  sliderValue: 100,
  basePostDeathSeries
});
assert.equal(allFixed.status, "complete", "all fixed/review-only expenses should be a safe complete no-op");
assert.equal(allFixed.monthlyDelta, 0);
assert.equal(allFixed.comparisonScenario.trace.noOpComparison, true);
assert.deepEqual(
  allFixed.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "all fixed/review-only expenses should not move the graph"
);

const missingMonthIndexSeries = cloneJson(basePostDeathSeries);
delete missingMonthIndexSeries.points[1].monthIndex;
const missingMonthIndex = calculations.calculateIncomeImpactLifestyleScenario({
  expenses: makeSafeScalarLifestyleExpenses(),
  sliderValue: -100,
  basePostDeathSeries: missingMonthIndexSeries
});
assert.equal(missingMonthIndex.status, "partial", "missing monthIndex should create a partial comparison");
assert.ok(
  missingMonthIndex.dataGaps.some((gap) => gap.code === "missing-post-death-month-index-for-lifestyle-comparison"),
  "missing monthIndex should create a data gap"
);
assert.equal(missingMonthIndex.comparisonScenario.trace.graphMonthlyDelta, 0, "missing monthIndex should keep graph adjustment no-op");
assert.deepEqual(
  missingMonthIndex.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  basePostDeathSeries.points.map((point) => point.endingResources),
  "missing monthIndex should not silently move graph"
);

const comparisonDirectInput = {
  lifestyleScenario: cloneJson(safeConservative),
  basePostDeathSeries
};
const directInputBefore = cloneJson(comparisonDirectInput);
const directComparison = calculations.calculateIncomeImpactLifestyleComparisonScenario(comparisonDirectInput);
assert.deepEqual(comparisonDirectInput, directInputBefore, "comparison helper should not mutate input");
assert.deepEqual(
  directComparison.postDeathSeries.points.map((point) => point.endingResources),
  safeConservative.comparisonScenario.postDeathSeries.points.map((point) => point.endingResources),
  "direct comparison helper should match embedded comparison output"
);

const streamPreviewBaseInput = createStreamPreviewInput();
delete streamPreviewBaseInput.householdExpenseStreamPolicyMode;
const streamPreviewBaseBefore = cloneJson(streamPreviewBaseInput);
const streamPreviewLegacy = calculations.calculateIncomeImpactLifestyleScenario(cloneJson(streamPreviewBaseInput));
const streamPreviewDisabled = calculations.calculateIncomeImpactLifestyleScenario(Object.assign(cloneJson(streamPreviewBaseInput), {
  householdExpenseStreamPolicyMode: "legacy",
  useStreamHouseholdExpenseAdjustments: false
}));
assert.deepEqual(streamPreviewBaseInput, streamPreviewBaseBefore, "stream preview parity fixture should not be mutated by legacy call");
assert.deepEqual(streamPreviewDisabled, streamPreviewLegacy, "disabled stream policy flag should preserve exact legacy output");
assert.equal(
  Object.prototype.hasOwnProperty.call(streamPreviewLegacy, "householdExpenseStreamPreview"),
  false,
  "missing stream preview flag should not add preview output"
);

loadStreamPreviewDependencies();
const streamPreviewMissingFlagAfterDeps = calculations.calculateIncomeImpactLifestyleScenario(cloneJson(streamPreviewBaseInput));
assert.deepEqual(streamPreviewMissingFlagAfterDeps, streamPreviewLegacy, "loading stream preview helpers should not change missing-flag output");

const streamPreviewEnabledInput = createStreamPreviewInput();
const streamPreviewEnabledBefore = cloneJson(streamPreviewEnabledInput);
const streamPreviewEnabled = calculations.calculateIncomeImpactLifestyleScenario(streamPreviewEnabledInput);
assert.deepEqual(streamPreviewEnabledInput, streamPreviewEnabledBefore, "enabled stream preview should not mutate input");
assert.ok(streamPreviewEnabled.householdExpenseStreamPreview, "enabled stream preview mode should include preview field");
assert.equal(streamPreviewEnabled.householdExpenseStreamPreview.metadata.activeRuntimeConsumer, false, "stream preview should remain inactive");
assert.equal(streamPreviewEnabled.householdExpenseStreamPreview.metadata.previewOnly, true, "stream preview should be marked preview-only");
assert.equal(
  streamPreviewEnabled.householdExpenseStreamPreview.trace.actualComparisonScenarioReplaced,
  false,
  "stream preview should not replace actual comparison scenario"
);
assert.equal(
  streamPreviewEnabled.householdExpenseStreamPreview.trace.graphOutputChanged,
  false,
  "stream preview should not change graph output"
);
assert.deepEqual(
  streamPreviewEnabled.comparisonScenario,
  streamPreviewLegacy.comparisonScenario,
  "enabled stream preview should not replace the legacy comparison scenario"
);
assert.equal(
  streamPreviewEnabled.monthlyDelta,
  streamPreviewLegacy.monthlyDelta,
  "enabled stream preview should not change legacy scenario monthlyDelta"
);
assert.deepEqual(
  streamPreviewEnabled.adjustedExpenses,
  streamPreviewLegacy.adjustedExpenses,
  "enabled stream preview should not change legacy adjusted expense rows"
);

const streamPreview = streamPreviewEnabled.householdExpenseStreamPreview;
assert.equal(streamPreview.baseHouseholdExpenseStream.monthlyTotal, 2600, "stream preview should prepare the base household expense stream");
assert.equal(streamPreview.baseHouseholdExpenseStream.parity.difference, 0, "stream preview base stream should reconcile to ongoingSupport total");
assert.equal(streamPreview.resolvedGraphAdjustmentPolicy.metadata.activeRuntimeConsumer, false, "resolved graph policy preview should remain inactive");
assert.equal(streamPreview.livingFloorCalculationPreview.metadata.activeRuntimeConsumer, false, "living-floor calculation preview should remain inactive");
assert.equal(streamPreview.householdExpenseAdjustmentResult.metadata.activeRuntimeConsumer, false, "adjustment engine preview should remain inactive");
assert.equal(streamPreview.scenarioHandoffPreview.metadata.activeRuntimeConsumer, false, "scenario handoff preview should remain inactive");
assert.equal(
  streamPreview.scenarioHandoffPreview.monthlyDelta,
  streamPreview.householdExpenseAdjustmentResult.monthlyDelta,
  "scenario handoff preview should use the engine monthlyDelta"
);
assert.equal(
  streamPreview.trace.monthlyDeltaPreview,
  streamPreview.householdExpenseAdjustmentResult.monthlyDelta,
  "stream preview trace should expose the engine monthlyDelta"
);
assert.ok(streamPreview.householdExpenseAdjustmentResult.monthlyDelta !== streamPreviewEnabled.monthlyDelta, "stream preview monthlyDelta should be separate from legacy scenario monthlyDelta");

const foodBucketPreview = streamPreview.householdExpenseAdjustmentResult.bucketAdjustments.find((bucket) => bucket.planningBucketKey === "foodAtHomeConsumables");
assert.ok(foodBucketPreview, "stream preview should include Food at Home bucket adjustment");
assert.equal(foodBucketPreview.rowCount, 2, "Food at Home stream rows should aggregate into one planning-bucket adjustment");
assert.equal(foodBucketPreview.trace.floorAppliedOncePerPlanningBucket, true, "Food at Home floor should be previewed once at bucket level");
assert.equal(foodBucketPreview.trace.perRowDollarFloorApplied, false, "Food at Home floor should not be applied per row");

const incompletePreview = calculations.calculateIncomeImpactLifestyleScenario(createStreamPreviewInput({
  accountPolicy: {
    version: 1,
    livingFloorAssumptions: {}
  }
})).householdExpenseStreamPreview;
assert.ok(
  incompletePreview.householdExpenseAdjustmentResult.dataGaps.some((gap) => gap.code === "money-floor-bucket-missing-dollar-floor-ratio-fallback"),
  "missing floor assumptions should produce preview data gaps"
);
assert.ok(
  incompletePreview.readinessNotices.notices.some((notice) => notice.code === "livingFloorAssumptionsIncomplete"),
  "missing floor assumptions should produce readiness notices inside preview"
);

[
  "rentOrMortgagePayment",
  "healthcareOutOfPocketSupportDefault",
  "householdInsurancePremiums",
  "childcareExpense"
].forEach((expenseTypeKey) => {
  const row = streamPreview.householdExpenseAdjustmentResult.rowAdjustments.find((candidate) => candidate.expenseTypeKey === expenseTypeKey);
  assert.ok(row, `${expenseTypeKey} should be represented in stream preview`);
  assert.equal(row.adjustedMonthlyAmount, row.baselineMonthlyAmount, `${expenseTypeKey} should stay fixed in stream preview`);
  assert.equal(row.monthlyDelta, 0, `${expenseTypeKey} should have zero preview delta`);
});

assert.equal(baseline.trace.projectionSeriesApplied, false, "projection series should not be applied in this pass");
assert.equal(baseline.trace.projectionSeriesDeferred, true, "projection series should be explicitly deferred");
assert.equal(baseline.trace.timingApplied, false, "no timing behavior should be applied");
assert.equal(baseline.trace.graphPathChanged, false, "graph path should not change");
assert.equal(baseline.trace.displayWired, false, "display should not be wired");
assert.equal(baseline.trace.storageTouched, false, "storage should not be touched");
assert.equal(baseline.trace.inputsMutated, false, "trace should state inputs were not mutated");

[
  /income-impact-timeline-graph-model/,
  /income-loss-impact-display/,
  /income-impact-triage-intervention-calculations/,
  /normalize-lens-model/,
  /household-survivor-runway-calculations/,
  /pages\//,
  /\.css\b/,
  /localStorage|sessionStorage|document|querySelector|addEventListener|fetch/,
  /\brequire\s*\(/,
  /\bimport\b/,
  /household-expense-account-policy-resolver/,
  /effectiveMonthAfterDeath|stageEvents|monthlyReliefSchedule|stepDown|step-down/i
].forEach((pattern) => {
  assert.equal(pattern.test(helperSource), false, `helper source should not include ${pattern}`);
});

console.log("income-impact-lifestyle-scenario-calculations-check passed");
