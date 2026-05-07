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
loadScript("app/features/lens-analysis/income-impact-triage-intervention-calculations.js");
const prepSource = loadScript("app/features/lens-analysis/income-impact-compression-reporting-prep.js");

const lensAnalysis = context.LensApp.lensAnalysis;
const prep = lensAnalysis.incomeImpactCompressionReportingPrep;
const prepareIncomeImpactCompressionReportingInputs = lensAnalysis.prepareIncomeImpactCompressionReportingInputs;
const calculateIncomeImpactTriageInterventions = lensAnalysis.calculateIncomeImpactTriageInterventions;

assert.ok(prep, "prep namespace should load");
assert.equal(typeof prep.prepareIncomeImpactCompressionReportingInputs, "function", "prep namespace export exists");
assert.equal(typeof prepareIncomeImpactCompressionReportingInputs, "function", "top-level prep export exists");
assert.equal(typeof calculateIncomeImpactTriageInterventions, "function", "Layer 5 helper should load");

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
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.reportingOnly, true);
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.layer5Wired, false);
assert.equal(first.compressionReport.trace.incomeImpactCompressionPrep.reductionsApplied, false);
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
