#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const context = {
  console,
  window: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;

vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
  return source;
}

loadScript("app/features/lens-analysis/expense-taxonomy.js");
loadScript("app/features/lens-analysis/expense-library.js");
loadScript("app/features/lens-analysis/expense-compression-thresholds.js");
loadScript("app/features/lens-analysis/expense-compression-threshold-resolver.js");
loadScript("app/features/lens-analysis/household-expense-compression-calculations.js");
loadScript("app/features/lens-analysis/household-expense-compression-policy.js");
loadScript("app/features/lens-analysis/household-expense-account-policy-resolver.js");
loadScript("app/features/lens-analysis/income-impact-triage-intervention-calculations.js");
const prepSource = loadScript("app/features/lens-analysis/income-impact-compression-reporting-prep.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const prep = lensAnalysis.incomeImpactCompressionReportingPrep;
const prepareIncomeImpactCompressionReportingInputs = lensAnalysis.prepareIncomeImpactCompressionReportingInputs;
const calculateIncomeImpactTriageInterventions = lensAnalysis.calculateIncomeImpactTriageInterventions;
const accountPolicyResolver = lensAnalysis.householdExpenseAccountPolicyResolver;

assert.ok(prep, "prep namespace should load");
assert.equal(typeof prep.prepareIncomeImpactCompressionReportingInputs, "function", "prep namespace export exists");
assert.equal(typeof prepareIncomeImpactCompressionReportingInputs, "function", "top-level prep export exists");
assert.equal(typeof calculateIncomeImpactTriageInterventions, "function", "Layer 5 helper should load");
assert.ok(accountPolicyResolver, "account policy resolver should load for resolved policy fixtures");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSerializable(value) {
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(value)), "value should be JSON serializable");
}

function assertNoSourceMatch(pattern, message) {
  assert.equal(pattern.test(prepSource), false, message);
}

function byType(items, typeKey) {
  return items.find((item) => item.typeKey === typeKey);
}

function resolveAccountPolicy(accountPolicy, hardGuardrails) {
  return accountPolicyResolver.resolveHouseholdExpenseAccountPolicy({
    defaultLifestyleRangePolicies: [],
    defaultCompressionPolicyRules: lensAnalysis.householdExpenseCompressionPolicy.getHouseholdExpenseCompressionPolicyRules(),
    defaultCompressionThresholdRules: lensAnalysis.expenseCompressionThresholds.getExpenseCompressionThresholdRules(),
    accountPolicy,
    hardGuardrails: hardGuardrails || {
      minThresholdTierValue: 0,
      maxThresholdTierValue: 2000
    }
  });
}

function gapCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.code);
}

function createLensModel(overrides = {}) {
  const lensModel = {
    incomeBasis: {
      insuredNetAnnualIncome: 90000,
      spouseOrPartnerNetAnnualIncome: 50000
    },
    survivorScenario: {
      survivorIncomeSource: "derived-from-spouse-income",
      survivorNetAnnualIncome: 42000
    },
    educationSupport: {
      linkedDependentCount: 2,
      currentDependentDetails: [
        { id: "child-1", dateOfBirth: "2015-01-01" },
        { id: "child-2", dateOfBirth: "2018-01-01" }
      ]
    },
    ongoingSupport: {
      monthlyFoodCost: 1000,
      monthlyTransportationCost: 450,
      monthlyPhoneAndInternetCost: 220,
      monthlyTravelAndDiscretionaryCost: 700,
      monthlyDiscretionaryPersonalSpending: 600,
      annualNonHousingEssentialSupportCost: 36000
    },
    expenseFacts: {
      expenses: [
        {
          expenseFactId: "dining_fact",
          typeKey: "diningOutRestaurants",
          categoryKey: "foodGroceries",
          label: "Dining Out",
          amount: 650,
          frequency: "monthly",
          sourcePath: "lensModel.expenseFacts.expenses[0]"
        },
        {
          expenseFactId: "groceries_fact",
          typeKey: "groceries",
          categoryKey: "foodGroceries",
          label: "Groceries",
          amount: 2000,
          frequency: "monthly",
          sourcePath: "lensModel.expenseFacts.expenses[1]"
        },
        {
          expenseFactId: "retirement_fact",
          typeKey: "retirementContributions",
          categoryKey: "savingsGoalContributions",
          label: "Retirement Contribution",
          amount: 500,
          frequency: "monthly",
          sourcePath: "lensModel.expenseFacts.expenses[2]"
        },
        {
          expenseFactId: "generated_debt_fact",
          typeKey: "autoLoanPayment",
          categoryKey: "debtObligations",
          label: "Auto Loan Payment",
          amount: 425,
          frequency: "monthly",
          sourceKey: "debtRecords",
          sourcePath: "protectionModeling.data.debtRecords[0]",
          duplicateProtectionKey: "debt-payment:debt-auto:autoLoan:required-payment",
          isGeneratedExpense: true,
          isDebtPaymentExpense: true,
          isFormulaEligible: false
        }
      ]
    }
  };

  return {
    ...lensModel,
    ...overrides,
    incomeBasis: {
      ...lensModel.incomeBasis,
      ...(overrides.incomeBasis || {})
    },
    survivorScenario: {
      ...lensModel.survivorScenario,
      ...(overrides.survivorScenario || {})
    },
    educationSupport: {
      ...lensModel.educationSupport,
      ...(overrides.educationSupport || {})
    },
    ongoingSupport: {
      ...lensModel.ongoingSupport,
      ...(overrides.ongoingSupport || {})
    },
    expenseFacts: {
      ...lensModel.expenseFacts,
      ...(overrides.expenseFacts || {})
    }
  };
}

function createCommonExpenseRecordFact({
  expenseFactId,
  expenseRecordId,
  typeKey,
  categoryKey,
  compressionCategoryKey,
  label,
  amount,
  ownedByField,
  sourceIndex = 0
}) {
  return {
    expenseFactId,
    expenseRecordId,
    typeKey,
    categoryKey,
    compressionCategoryKey: compressionCategoryKey || categoryKey,
    label,
    amount,
    frequency: "monthly",
    monthlyRecurringAmount: amount,
    monthlyAmount: amount,
    monthlyEquivalent: amount,
    annualizedAmount: amount * 12,
    sourceKey: "expenseRecords",
    sourceOwnedBy: "ongoingSupport",
    sourcePath: `protectionModeling.data.expenseRecords[${sourceIndex}]`,
    sourceIndex,
    ownedByField,
    isGeneratedExpense: false,
    isCommonExpenseRecord: true,
    isFormulaEligible: false,
    isReadOnly: true
  };
}

function createScenario() {
  return {
    postDeathSeries: {
      points: [
        {
          monthIndex: 1,
          essentialNeeds: 2000,
          discretionaryNeeds: 1000,
          survivorNeeds: 3000,
          endingResources: 8000
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
      resourcesAfterObligations: 150000,
      monthsCovered: 120,
      depletionDate: null,
      accumulatedUnmetNeed: 0
    },
    dataGaps: [
      {
        code: "existing-scenario-gap",
        message: "Existing scenario gap.",
        sourcePaths: ["scenario.fixture"]
      }
    ],
    warnings: []
  };
}

function createRiskEvaluation() {
  return {
    status: "complete",
    events: [],
    stableEvents: [],
    warnings: [],
    dataGaps: []
  };
}

assertNoSourceMatch(/\blocalStorage\b/, "prep helper should not read localStorage");
assertNoSourceMatch(/\bsessionStorage\b/, "prep helper should not read sessionStorage");
assertNoSourceMatch(/\bdocument\b/, "prep helper should not read document");
assertNoSourceMatch(/\bwindow\b/, "prep helper should not read window");
assertNoSourceMatch(/income-loss-impact-display/i, "prep helper should not import display");
assertNoSourceMatch(/income-impact-timeline-graph-model/i, "prep helper should not import graph model");
assertNoSourceMatch(/income-impact-scenario-composer/i, "prep helper should not import composer");
assertNoSourceMatch(/normalize-lens-model/i, "prep helper should not import normalization");
assertNoSourceMatch(/caseOverrideAllowed/i, "prep helper should not add case-level override support");

const lensModel = createLensModel();
const input = {
  lensModel,
  advisorThresholdOverrides: {
    rulesByThresholdId: {
      "groceries-per-member-monthly-v1": {
        tiers: {
          comfortable: 500
        }
      }
    }
  },
  options: {
    householdContext: "survivor"
  }
};
const originalInput = clone(input);
const first = prepareIncomeImpactCompressionReportingInputs(input);
const second = prep.prepareIncomeImpactCompressionReportingInputs(input);

assert.deepEqual(input, originalInput, "prep helper should not mutate input");
assert.deepEqual(first, second, "namespace and top-level exports should produce the same output");
assertSerializable(first);

assert.equal(first.trace.calculationMethod, "income-impact-compression-reporting-prep-v1");
assert.equal(first.trace.reportingOnly, true);
assert.equal(first.trace.source, "explicit-input");
assert.equal(first.trace.thresholdSource, "MODEL90-defaults-plus-advisor-overrides");
assert.equal(first.trace.thresholdPolicySource, "fallbackPolicy", "advisor threshold overrides should trace fallback policy source");
assert.equal(first.trace.compressionPolicySource, "defaultSeedPolicy", "missing explicit compression policy should use seed policy source");
assert.equal(first.trace.resolvedAccountPolicyUsed, false, "default prep path should not claim resolved account policy use");
assert.equal(first.trace.advisorOverridesSupported, true);
assert.equal(first.trace.caseOverridesSupported, false);
assert.equal(first.trace.layer5Wired, false);
assert.equal(first.trace.displayWired, false);
assert.equal(first.trace.graphPathChanged, false);
assert.equal(first.trace.reductionsApplied, false);
assert.equal(first.trace.expenseStreamSource, "lensModel.expenseFacts.expenses");
assert.equal(first.trace.expenseFactCount, lensModel.expenseFacts.expenses.length);
assert.ok(first.trace.thresholdRuleCount > 0, "threshold defaults should resolve");
assert.ok(first.trace.compressionPolicyRuleCount > 0, "compression policy rules should be present");
assert.equal(first.trace.householdFacts.householdMemberCount, 3, "survivor household count should be one adult plus dependents");
assert.equal(first.trace.householdFacts.dependentCount, 2, "dependent count should derive from educationSupport");
assert.equal(
  first.trace.householdFacts.sourcePaths.householdMemberCount,
  "survivor-household:1+lensModel.educationSupport.linkedDependentCount"
);

assert.ok(Array.isArray(first.compressionPolicyRules), "policy rules should be returned for Layer 5");
assert.ok(first.compressionPolicyRules.length > 0, "policy rules should not be empty");
assert.ok(first.compressionPolicyRules.every((rule) => rule.decision), "policy rules should include deterministic decisions");
assert.ok(first.compressionReport, "compressionReport should be returned");
assert.equal(first.compressionReport.trace.thresholdPolicySource, "fallbackPolicy");
assert.equal(first.compressionReport.trace.compressionPolicySource, "defaultSeedPolicy");
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.reportingOnly, true);
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.layer5Wired, false);
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.reductionsApplied, false);
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.thresholdPolicySource, "fallbackPolicy");
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.compressionPolicySource, "defaultSeedPolicy");
assert.ok(byType(first.compressionReport.opportunities, "diningOutRestaurants"), "dining fact should become a reporting opportunity");
assert.ok(byType(first.compressionReport.opportunities, "groceries"), "groceries should become a reporting opportunity");
assert.equal(
  byType(first.compressionReport.opportunities, "groceries").thresholdMonthlyAmount,
  1500,
  "advisor override should resolve before classifier comparison"
);
assert.ok(byType(first.compressionReport.pauseCandidates, "retirementContributions"), "retirement contributions should become pause candidates");
assert.ok(byType(first.compressionReport.excludedItems, "autoLoanPayment"), "generated debt payment should remain excluded");

assert.ok(
  gapCodes(first.dataGaps).includes("scalar-household-expenses-not-itemized-for-compression"),
  "prep output should report scalar household itemization gap"
);
assert.ok(
  gapCodes(first.compressionReport.dataGaps).includes("scalar-household-expenses-not-itemized-for-compression"),
  "compressionReport should carry scalar household itemization gap into Layer 5 handoff"
);
const scalarGap = first.compressionReport.dataGaps.find((gap) => gap.code === "scalar-household-expenses-not-itemized-for-compression");
assert.ok(
  scalarGap.missingScalarHouseholdSupportFields.includes("monthlyFoodCost"),
  "scalar gap should name missing ongoingSupport fields"
);

const resolvedAccountPolicy = resolveAccountPolicy({
  version: 1,
  compressionThresholdOverrides: [
    {
      expenseTypeKey: "groceries",
      tiers: {
        minimum: 150,
        conservative: 250,
        average: 350,
        comfortable: 800
      },
      protectedFloor: 150
    }
  ],
  compressionPolicyOverrides: [
    {
      expenseTypeKey: "diningOutRestaurants",
      requiresAdvisorConfirmation: true,
      notes: "Account review before dining compression."
    }
  ]
});
const resolvedPolicyPrep = prepareIncomeImpactCompressionReportingInputs({
  lensModel,
  resolvedHouseholdExpensePolicy: resolvedAccountPolicy,
  options: {
    householdContext: "survivor"
  }
});
assert.equal(resolvedPolicyPrep.trace.thresholdPolicySource, "resolvedAccountPolicy", "resolved threshold policy should be traced");
assert.equal(resolvedPolicyPrep.trace.thresholdPolicySourcePath, "resolvedHouseholdExpensePolicy.resolvedCompressionThresholdRules");
assert.equal(resolvedPolicyPrep.trace.compressionPolicySource, "resolvedAccountPolicy", "resolved compression policy should be traced");
assert.equal(resolvedPolicyPrep.trace.compressionPolicySourcePath, "resolvedHouseholdExpensePolicy.resolvedCompressionPolicyRules");
assert.equal(resolvedPolicyPrep.trace.resolvedAccountPolicyUsed, true, "prep should mark resolved account policy use");
assert.equal(resolvedPolicyPrep.trace.fallbackPolicyUsed, false, "valid resolved account policy should not mark fallback");
assert.equal(resolvedPolicyPrep.compressionReport.trace.thresholdPolicySource, "resolvedAccountPolicy");
assert.equal(resolvedPolicyPrep.compressionReport.trace.compressionPolicySource, "resolvedAccountPolicy");
assert.equal(
  byType(resolvedPolicyPrep.compressionReport.opportunities, "groceries"),
  undefined,
  "resolved account thresholds should remove grocery opportunity when within account threshold"
);
assert.equal(
  byType(resolvedPolicyPrep.compressionReport.protectedItems, "groceries").thresholdMonthlyAmount,
  2400,
  "resolved account thresholds should change grocery threshold before reporting"
);
assert.equal(
  byType(resolvedPolicyPrep.compressionReport.opportunities, "diningOutRestaurants"),
  undefined,
  "resolved compression policy should remove dining from auto opportunity when account policy requires review"
);
assert.ok(
  byType(resolvedPolicyPrep.compressionReport.advisorReviewItems, "diningOutRestaurants"),
  "resolved compression policy should move dining to advisor review"
);

const corruptResolvedPolicyPrep = prepareIncomeImpactCompressionReportingInputs({
  lensModel,
  resolvedCompressionThresholdRules: { bad: true },
  resolvedCompressionPolicyRules: { bad: true },
  options: {
    householdContext: "survivor"
  }
});
assert.equal(corruptResolvedPolicyPrep.trace.thresholdPolicySource, "fallbackPolicy", "corrupt resolved thresholds should fall back safely");
assert.equal(corruptResolvedPolicyPrep.trace.compressionPolicySource, "fallbackPolicy", "corrupt resolved policy should fall back safely");
assert.equal(corruptResolvedPolicyPrep.trace.fallbackPolicyUsed, true, "corrupt resolved policy should mark fallback");
assert.equal(corruptResolvedPolicyPrep.trace.resolvedAccountPolicyUsed, false, "corrupt resolved policy should not mark account policy use");
assert.equal(corruptResolvedPolicyPrep.compressionReport.trace.thresholdPolicySource, "fallbackPolicy");
assert.equal(corruptResolvedPolicyPrep.compressionReport.trace.compressionPolicySource, "fallbackPolicy");
assert.ok(
  gapCodes(corruptResolvedPolicyPrep.dataGaps).includes("invalid-resolved-compression-threshold-rules"),
  "corrupt resolved thresholds should create a data gap"
);
assert.ok(
  gapCodes(corruptResolvedPolicyPrep.dataGaps).includes("invalid-resolved-compression-policy-rules"),
  "corrupt resolved compression policy should create a data gap"
);
assert.ok(
  corruptResolvedPolicyPrep.warnings.some((warning) => warning.code === "invalid-resolved-compression-threshold-rules"),
  "corrupt resolved thresholds should warn"
);
assert.ok(
  corruptResolvedPolicyPrep.warnings.some((warning) => warning.code === "invalid-resolved-compression-policy-rules"),
  "corrupt resolved compression policy should warn"
);

const commonExpenseRecordFacts = [
  createCommonExpenseRecordFact({
    expenseFactId: "record_insurance_fact",
    expenseRecordId: "starter_expense_householdInsurancePremiums",
    typeKey: "householdInsurancePremiums",
    categoryKey: "insurancePremiums",
    label: "Household Insurance Premiums",
    amount: 1200,
    ownedByField: "monthlyOtherInsuranceCost",
    sourceIndex: 0
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_healthcare_fact",
    expenseRecordId: "starter_expense_medicalOutOfPocket",
    typeKey: "medicalOutOfPocket",
    categoryKey: "otherLivingExpense",
    compressionCategoryKey: "ongoingHealthcare",
    label: "Healthcare / Out-of-Pocket Medical",
    amount: 300,
    ownedByField: "monthlyHealthcareOutOfPocketCost",
    sourceIndex: 1
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_food_fact",
    expenseRecordId: "starter_expense_groceries",
    typeKey: "groceries",
    categoryKey: "foodGroceries",
    label: "Groceries",
    amount: 1800,
    ownedByField: "monthlyFoodCost",
    sourceIndex: 2
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_transportation_fact",
    expenseRecordId: "starter_expense_householdTransportation",
    typeKey: "householdTransportation",
    categoryKey: "transportation",
    label: "Household Transportation",
    amount: 700,
    ownedByField: "monthlyTransportationCost",
    sourceIndex: 3
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_childcare_fact",
    expenseRecordId: "starter_expense_childcareExpense",
    typeKey: "childcareExpense",
    categoryKey: "childcare",
    label: "Childcare",
    amount: 400,
    ownedByField: "monthlyChildcareAndDependentCareCost",
    sourceIndex: 4
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_phone_internet_fact",
    expenseRecordId: "starter_expense_internetPhone",
    typeKey: "internetPhone",
    categoryKey: "utilities",
    label: "Internet / Phone",
    amount: 300,
    ownedByField: "monthlyPhoneAndInternetCost",
    sourceIndex: 5
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_household_supplies_fact",
    expenseRecordId: "starter_expense_householdConsumablesSupplies",
    typeKey: "householdConsumablesSupplies",
    categoryKey: "foodGroceries",
    label: "Household Consumables & Supplies",
    amount: 400,
    ownedByField: "monthlyHouseholdSuppliesCost",
    sourceIndex: 6
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_other_household_fact",
    expenseRecordId: "expense_other_household",
    typeKey: "otherHouseholdExpenseDefault",
    categoryKey: "otherLivingExpense",
    label: "Other Household Expenses",
    amount: 125,
    ownedByField: "monthlyOtherHouseholdExpenses",
    sourceIndex: 7
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_travel_fact",
    expenseRecordId: "starter_expense_entertainmentRecreation",
    typeKey: "entertainmentRecreation",
    categoryKey: "discretionaryLifestyle",
    label: "Entertainment / Travel",
    amount: 800,
    ownedByField: "monthlyTravelAndDiscretionaryCost",
    sourceIndex: 8
  }),
  createCommonExpenseRecordFact({
    expenseFactId: "record_subscriptions_fact",
    expenseRecordId: "starter_expense_recurringPersonalSpendingDefault",
    typeKey: "recurringPersonalSpendingDefault",
    categoryKey: "discretionaryLifestyle",
    label: "Recurring Personal Spending",
    amount: 450,
    ownedByField: "monthlySubscriptionsCost",
    sourceIndex: 9
  }),
  {
    expenseFactId: "itemized_generated_debt_fact",
    typeKey: "autoLoanPayment",
    categoryKey: "debtObligations",
    label: "Auto Loan Payment",
    amount: 425,
    frequency: "monthly",
    sourceKey: "debtRecords",
    sourceOwnedBy: "debtRecords",
    sourcePath: "protectionModeling.data.debtRecords[0]",
    duplicateProtectionKey: "debt-payment:debt-auto:autoLoan:required-payment",
    isGeneratedExpense: true,
    isDebtPaymentExpense: true,
    isFormulaEligible: false
  },
  {
    expenseFactId: "itemized_one_time_final_fact",
    typeKey: "funeralBurialEstimate",
    categoryKey: "funeralBurial",
    label: "Funeral / Burial",
    amount: 15000,
    frequency: "oneTime",
    oneTimeAmount: 15000,
    sourcePath: "protectionModeling.data.funeralBurialEstimate",
    isFinalExpenseComponent: true
  }
];
const itemizedCommonExpenseLensModel = createLensModel({
  ongoingSupport: {
    monthlyOtherInsuranceCost: 1200,
    monthlyHealthcareOutOfPocketCost: 300,
    monthlyFoodCost: 1800,
    monthlyTransportationCost: 700,
    monthlyChildcareAndDependentCareCost: 400,
    monthlyPhoneAndInternetCost: 300,
    monthlyHouseholdSuppliesCost: 400,
    monthlyOtherHouseholdExpenses: 125,
    monthlyTravelAndDiscretionaryCost: 800,
    monthlySubscriptionsCost: 450
  },
  expenseFacts: {
    expenses: commonExpenseRecordFacts
  }
});
const itemizedCommonExpenses = prepareIncomeImpactCompressionReportingInputs({
  lensModel: itemizedCommonExpenseLensModel,
  options: {
    householdContext: "survivor"
  }
});
assert.equal(
  gapCodes(itemizedCommonExpenses.dataGaps).includes("scalar-household-expenses-not-itemized-for-compression"),
  false,
  "prep output should clear itemization gap when every nonzero common expense field is source-linked"
);
assert.equal(
  gapCodes(itemizedCommonExpenses.compressionReport.dataGaps).includes("scalar-household-expenses-not-itemized-for-compression"),
  false,
  "compressionReport should not carry itemization gap for fully itemized common expense facts"
);
[
  "groceries",
  "householdConsumablesSupplies",
  "entertainmentRecreation"
].forEach((typeKey) => {
  const item = byType(itemizedCommonExpenses.compressionReport.opportunities, typeKey);
  assert.ok(item, `${typeKey} common expense fact should create a compression opportunity when above threshold`);
  assert.equal(item.isScalarHouseholdExpense, false);
  assert.equal(item.sourceOwnedBy, "ongoingSupport");
});
[
  "medicalOutOfPocket",
  "childcareExpense",
  "householdInsurancePremiums",
  "householdTransportation",
  "internetPhone",
  "recurringPersonalSpendingDefault"
].forEach((typeKey) => {
  assert.equal(
    byType(itemizedCommonExpenses.compressionReport.opportunities, typeKey),
    undefined,
    `${typeKey} common expense fact should be visible but not auto-compressible`
  );
  assert.ok(
    byType(itemizedCommonExpenses.compressionReport.advisorReviewItems, typeKey)
      || byType(itemizedCommonExpenses.compressionReport.protectedItems, typeKey)
      || byType(itemizedCommonExpenses.compressionReport.excludedItems, typeKey),
    `${typeKey} should route to protected, excluded, or advisor-review output`
  );
});
assert.ok(byType(itemizedCommonExpenses.compressionReport.excludedItems, "autoLoanPayment"), "generated debt payment should remain excluded with common expense facts present");
assert.ok(byType(itemizedCommonExpenses.compressionReport.advisorReviewItems, "funeralBurialEstimate"), "one-time final expense should remain review/data-gap classified");
assert.ok(
  gapCodes(itemizedCommonExpenses.compressionReport.dataGaps).includes("expense-frequency-review-required"),
  "one-time final expense review gap should remain unchanged"
);

const explicitHouseholdFacts = prepareIncomeImpactCompressionReportingInputs({
  lensModel: createLensModel({ survivorScenario: { survivorIncomeSource: null } }),
  householdFacts: {
    householdMemberCount: 7
  }
});
assert.equal(explicitHouseholdFacts.trace.householdFacts.householdMemberCount, 7, "explicit household member count should win");
assert.equal(
  gapCodes(explicitHouseholdFacts.dataGaps).includes("unclear-household-context-for-compression"),
  false,
  "explicit household member count should avoid context guessing gap"
);

const unclearContext = prepareIncomeImpactCompressionReportingInputs({
  lensModel: createLensModel({ survivorScenario: { survivorIncomeSource: null } })
});
assert.ok(
  gapCodes(unclearContext.dataGaps).includes("unclear-household-context-for-compression"),
  "unclear survivor context should produce a data gap instead of guessing household size"
);

const unsupportedCaseOverride = prepareIncomeImpactCompressionReportingInputs({
  lensModel,
  options: {
    householdContext: "survivor"
  },
  caseThresholdOverrides: {
    rulesByThresholdId: {}
  }
});
assert.ok(
  unsupportedCaseOverride.warnings.some((warning) => warning.code === "case-threshold-overrides-unsupported"),
  "case-level threshold overrides should be rejected, not supported"
);

const scenario = createScenario();
const riskEvaluation = createRiskEvaluation();
const originalScenario = clone(scenario);
const originalRiskEvaluation = clone(riskEvaluation);
const layer5Output = clone(calculateIncomeImpactTriageInterventions({
  scenario,
  riskEvaluation,
  compressionReport: first.compressionReport,
  compressionPolicyRules: first.compressionPolicyRules
}));

assert.deepEqual(scenario, originalScenario, "Layer 5 handoff should not mutate scenario");
assert.deepEqual(riskEvaluation, originalRiskEvaluation, "Layer 5 handoff should not mutate risk evaluation");
assert.deepEqual(
  scenario.postDeathSeries,
  originalScenario.postDeathSeries,
  "Layer 5 handoff should not alter postDeathSeries"
);
assert.deepEqual(layer5Output.baseScenarioSummary, {
  resourcesAfterObligations: 150000,
  monthsCovered: 120,
  depletionDate: null,
  accumulatedUnmetNeed: 0,
  totalSurvivorNeeds: 72000,
  totalSurvivorIncome: 24000,
  totalScheduledObligations: 6000
});
assert.equal(layer5Output.interventionScenarios.length, 0, "compression handoff should not create intervention scenarios");
assert.equal(layer5Output.compressionTrace.reportingOnly, true);
assert.equal(layer5Output.compressionTrace.graphPathChanged, false, "compression handoff should not change graph path");
assert.equal(layer5Output.compressionTrace.reductionsApplied, false, "compression handoff should not apply reductions");
assert.ok(layer5Output.compressionOpportunities.length > 0, "Layer 5 should receive compression opportunities");
assert.ok(layer5Output.pauseCandidates.length > 0, "Layer 5 should receive pause candidates");
assert.ok(layer5Output.excludedExpenseItems.length > 0, "Layer 5 should receive excluded generated debt items");
assert.ok(
  gapCodes(layer5Output.compressionDataGaps).includes("scalar-household-expenses-not-itemized-for-compression"),
  "Layer 5 should receive compression data gaps separately"
);
assert.equal(
  gapCodes(layer5Output.dataGaps).includes("scalar-household-expenses-not-itemized-for-compression"),
  false,
  "compression data gaps should not merge into scenario dataGaps"
);
assert.ok(layer5Output.policyDecisionSummary.totalRules > 0, "Layer 5 should summarize policy rules");

console.log("income-impact-compression-reporting-prep-check passed");
