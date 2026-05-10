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
      throw new Error("base household expense stream helper must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("base household expense stream helper must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("base household expense stream helper must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("base household expense stream helper must not read client records directly");
    }
  });
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadStreamContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/income-impact-base-household-expense-stream.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function loadScenarioContext(includeStreamHelper) {
  const context = createContext();
  [
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  if (includeStreamHelper) {
    [
      "app/features/lens-analysis/expense-library.js",
      "app/features/lens-analysis/household-expense-living-floor-metadata.js",
      "app/features/lens-analysis/income-impact-base-household-expense-stream.js"
    ].forEach(function (relativePath) {
      loadScript(context, relativePath);
    });
  }

  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function getApi(context) {
  return context.LensApp.lensAnalysis.incomeImpactBaseHouseholdExpenseStream;
}

function getRow(result, expenseTypeKey) {
  const row = result.rows.find(function (candidate) {
    return candidate.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(row, `${expenseTypeKey} stream row should exist`);
  return row;
}

function getReconciliationRow(result, expenseTypeKey) {
  const row = result.representedRows.find(function (candidate) {
    return candidate.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(row, `${expenseTypeKey} reconciliation row should exist`);
  return row;
}

function hasIssue(list, code) {
  return Array.isArray(list) && list.some(function (issue) {
    return issue.code === code;
  });
}

function createExpenseFact(overrides) {
  return Object.assign({
    source: "protectionModeling.data",
    sourceOwnedBy: "ongoingSupport",
    frequency: "monthly"
  }, overrides);
}

function createRepresentedFixture() {
  return {
    lensModel: {
      ongoingSupport: {
        monthlyHousingSupportCost: 0,
        monthlyNonHousingEssentialSupportCost: 1570,
        monthlyTotalEssentialSupportCost: 1570,
        annualTotalEssentialSupportCost: 18840
      },
      expenseFacts: {
        expenses: [
          createExpenseFact({
            expenseFactId: "food",
            typeKey: "groceries",
            categoryKey: "foodGroceries",
            label: "Groceries",
            monthlyAmount: 600,
            ownedByField: "monthlyFoodCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyFoodCost" }
          }),
          createExpenseFact({
            expenseFactId: "supplies",
            typeKey: "householdConsumablesSupplies",
            categoryKey: "foodGroceries",
            label: "Household Supplies",
            monthlyAmount: 120,
            ownedByField: "monthlyHouseholdSuppliesCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHouseholdSuppliesCost" }
          }),
          createExpenseFact({
            expenseFactId: "internet",
            typeKey: "internet",
            categoryKey: "utilities",
            label: "Internet",
            monthlyAmount: 100,
            ownedByField: "monthlyPhoneAndInternetCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyPhoneAndInternetCost" }
          }),
          createExpenseFact({
            expenseFactId: "fuel",
            typeKey: "fuel",
            categoryKey: "transportation",
            label: "Fuel",
            monthlyAmount: 200,
            ownedByField: "monthlyTransportationCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyTransportationCost" }
          }),
          createExpenseFact({
            expenseFactId: "healthcare",
            typeKey: "healthcareOutOfPocketSupportDefault",
            categoryKey: "otherLivingExpense",
            label: "Healthcare",
            monthlyAmount: 90,
            ownedByField: "monthlyHealthcareOutOfPocketCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyHealthcareOutOfPocketCost" }
          }),
          createExpenseFact({
            expenseFactId: "insurance",
            typeKey: "householdInsurancePremiums",
            categoryKey: "insurancePremiums",
            label: "Insurance",
            monthlyAmount: 110,
            ownedByField: "monthlyOtherInsuranceCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherInsuranceCost" }
          }),
          createExpenseFact({
            expenseFactId: "childcare",
            typeKey: "childcareExpense",
            categoryKey: "childcare",
            label: "Childcare",
            monthlyAmount: 300,
            ownedByField: "monthlyChildcareAndDependentCareCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyChildcareAndDependentCareCost" }
          }),
          createExpenseFact({
            expenseFactId: "other",
            typeKey: "otherHouseholdExpenseDefault",
            categoryKey: "otherLivingExpense",
            label: "Other household expenses",
            monthlyAmount: 50,
            ownedByField: "monthlyOtherHouseholdExpenses",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyOtherHouseholdExpenses" }
          }),
          createExpenseFact({
            expenseFactId: "subscriptions",
            typeKey: "streamingDigitalSubscriptions",
            categoryKey: "discretionaryLifestyle",
            label: "Subscriptions",
            monthlyAmount: 75,
            ownedByField: "monthlySubscriptionsCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlySubscriptionsCost" }
          }),
          createExpenseFact({
            expenseFactId: "travel",
            typeKey: "vacationsTravel",
            categoryKey: "travelVacations",
            label: "Travel",
            monthlyAmount: 200,
            ownedByField: "monthlyTravelAndDiscretionaryCost",
            metadata: { normalizedSourcePath: "lensModel.ongoingSupport.monthlyTravelAndDiscretionaryCost" }
          }),
          {
            expenseFactId: "debt",
            typeKey: "autoLoanPayment",
            categoryKey: "debtObligations",
            label: "Auto Loan",
            monthlyAmount: 400,
            source: "debtRecords",
            sourceOwnedBy: "debtRecords",
            isDebtPaymentExpense: true,
            frequency: "monthly"
          },
          {
            expenseFactId: "utility",
            typeKey: "gasHeatingFuelPropaneOil",
            categoryKey: "utilities",
            label: "Gas Utility",
            monthlyAmount: 140,
            frequency: "monthly"
          }
        ]
      }
    }
  };
}

function assertNoRuntimeFilesTouched() {
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
  assert.equal(status, "", "stream helper pass should not touch runtime, display, graph, admin, normalization, page, or CSS files outside the approved Income Impact plumbing files");
}

const context = loadStreamContext();
const api = getApi(context);
assert.ok(api, "stream API should be exported");
assert.equal(typeof api.prepareIncomeImpactBaseHouseholdExpenseStream, "function");

const input = createRepresentedFixture();
const before = clone(input);
const result = api.prepareIncomeImpactBaseHouseholdExpenseStream(input);
const resultAgain = api.prepareIncomeImpactBaseHouseholdExpenseStream(input);

assert.deepEqual(input, before, "inputs should not be mutated");
assert.deepEqual(resultAgain, result, "output should be deterministic");
assert.doesNotThrow(function () {
  JSON.stringify(result);
}, "output should be JSON-serializable");
assert.equal(result.metadata.activeRuntimeConsumer, false);
assert.equal(result.trace.ratiosApplied, false);
assert.equal(result.trace.livingFloorsCalculated, false);
assert.equal(result.trace.adjustedTotalsCalculated, false);
assert.equal(result.trace.graphDeltaCalculated, false);

assert.equal(result.monthlyTotal, 1570);
assert.equal(result.parity.ongoingSupportMonthlyTotal, 1570);
assert.equal(result.parity.difference, 0);
assert.equal(result.representedRows.length, 8);
assert.ok(result.referenceRows.length >= 4, "unrepresented expense facts should remain available as reference rows");

const groceries = getRow(result, "groceries");
assert.equal(groceries.planningBucketKey, "foodAtHomeConsumables");
assert.equal(groceries.inflationBucketKey, "householdExpenseInflation");
assert.equal(groceries.baselineMonthlyAmount, 600);
assert.equal(groceries.representedInBase, true);
assert.equal(groceries.adjustmentClass, "moneyFloorAdjusted");
assert.equal(groceries.minimumFloorMode, "estimatedDollarFloor");

const supplies = getRow(result, "householdConsumablesSupplies");
assert.equal(supplies.planningBucketKey, "householdConsumables");
assert.equal(supplies.inflationBucketKey, "householdExpenseInflation");
assert.equal(supplies.adjustmentClass, "moneyFloorAdjusted");

const internet = getRow(result, "internet");
assert.equal(internet.planningBucketKey, "communicationsConnectivity");
assert.equal(internet.adjustmentClass, "moneyFloorAdjusted");

const fuel = getRow(result, "fuel");
assert.equal(fuel.planningBucketKey, "transportationBasics");
assert.equal(fuel.adjustmentClass, "moneyFloorAdjusted");

const healthcare = getRow(result, "healthcareOutOfPocketSupportDefault");
assert.equal(healthcare.representedInBase, true);
assert.equal(healthcare.adjustmentClass, "excludedFromAdjustment");
assert.equal(healthcare.minimumFloorMode, "notAdjusted");
assert.equal(healthcare.trace.futureAdjustmentBehavior, "zero-delta");

const childcare = getRow(result, "childcareExpense");
assert.equal(childcare.representedInBase, true);
assert.equal(childcare.adjustmentClass, "excludedFromAdjustment");

const debt = getRow(result, "autoLoanPayment");
assert.equal(debt.representedInBase, false);
assert.equal(debt.planningBucketKey, "debtObligations");
assert.equal(debt.adjustmentClass, "excludedFromAdjustment");
assert.equal(debt.minimumFloorMode, "notAdjusted");
assert.equal(debt.trace.futureAdjustmentBehavior, "zero-delta");

const utility = getRow(result, "gasHeatingFuelPropaneOil");
assert.equal(utility.planningBucketKey, "basicUtilities");
assert.equal(utility.adjustmentClass, "excludedFromAdjustment");
assert.equal(utility.minimumFloorMode, "notAdjusted");

const subscriptions = getRow(result, "streamingDigitalSubscriptions");
assert.equal(subscriptions.representedInBase, false);
assert.equal(subscriptions.planningBucketKey, "subscriptionsMemberships");
assert.ok(result.referenceRows.some(function (row) {
  return row.expenseTypeKey === "streamingDigitalSubscriptions";
}));

assert.ok(!Object.prototype.hasOwnProperty.call(groceries, "adjustedMonthlyAmount"));
assert.ok(!Object.prototype.hasOwnProperty.call(result, "monthlyGraphDelta"));
assert.ok(!Object.prototype.hasOwnProperty.call(result, "livingFloorCalculationPreview"));

const reconciliationInput = createRepresentedFixture();
reconciliationInput.lensModel.ongoingSupport.monthlyHousingSupportCost = 1000;
reconciliationInput.lensModel.ongoingSupport.monthlyTotalEssentialSupportCost = 2570;
reconciliationInput.lensModel.ongoingSupport.annualTotalEssentialSupportCost = 30840;
const reconciliationResult = api.prepareIncomeImpactBaseHouseholdExpenseStream(reconciliationInput);
assert.equal(reconciliationResult.monthlyTotal, 2570);
assert.equal(reconciliationResult.parity.difference, 0);
assert.ok(hasIssue(
  reconciliationResult.dataGaps,
  "base-household-expense-stream-scalar-reconciliation-row-created"
));
const housingReconciliation = getReconciliationRow(reconciliationResult, "ongoingSupportHousingReconciliation");
assert.equal(housingReconciliation.sourceOwner, "scalarOngoingSupport");
assert.equal(housingReconciliation.planningBucketKey, "housingCore");
assert.equal(housingReconciliation.adjustmentClass, "excludedFromAdjustment");
assert.equal(housingReconciliation.minimumFloorMode, "notAdjusted");
assert.equal(housingReconciliation.trace.futureAdjustmentBehavior, "zero-delta");

const nonHousingGapInput = createRepresentedFixture();
nonHousingGapInput.lensModel.ongoingSupport.monthlyNonHousingEssentialSupportCost = 1700;
nonHousingGapInput.lensModel.ongoingSupport.monthlyTotalEssentialSupportCost = 1700;
const nonHousingGapResult = api.prepareIncomeImpactBaseHouseholdExpenseStream(nonHousingGapInput);
const nonHousingReconciliation = getReconciliationRow(nonHousingGapResult, "ongoingSupportNonHousingReconciliation");
assert.equal(nonHousingReconciliation.sourceOwner, "scalarOngoingSupport");
assert.equal(nonHousingReconciliation.planningBucketKey, "customUnknown");
assert.equal(nonHousingReconciliation.adjustmentClass, "excludedFromAdjustment");
assert.equal(nonHousingGapResult.parity.difference, 0);

const missingTotalResult = api.prepareIncomeImpactBaseHouseholdExpenseStream({
  expenseFacts: { expenses: [] },
  ongoingSupport: {}
});
assert.ok(hasIssue(
  missingTotalResult.dataGaps,
  "base-household-expense-stream-missing-ongoing-support-total"
));

const scenarioInput = {
  expenses: [
    {
      expenseTypeKey: "groceries",
      typeKey: "groceries",
      categoryKey: "foodGroceries",
      label: "Groceries",
      monthlyAmount: 500
    }
  ],
  sliderValue: -50,
  householdExpenseStreamPolicyMode: "legacy"
};
const scenarioContextBefore = loadScenarioContext(false);
const scenarioBefore = plain(
  scenarioContextBefore.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations
    .calculateIncomeImpactLifestyleScenario(clone(scenarioInput))
);
const scenarioContextAfter = loadScenarioContext(true);
scenarioContextAfter.LensApp.lensAnalysis.incomeImpactBaseHouseholdExpenseStream
  .prepareIncomeImpactBaseHouseholdExpenseStream(createRepresentedFixture());
const scenarioAfter = plain(
  scenarioContextAfter.LensApp.lensAnalysis.incomeImpactLifestyleScenarioCalculations
    .calculateIncomeImpactLifestyleScenario(clone(scenarioInput))
);
assert.deepEqual(scenarioAfter, scenarioBefore, "importing/calling standalone stream helper must not change retired Income Impact output");

assertNoRuntimeFilesTouched();

console.log("income-impact-base-household-expense-stream-check passed");
