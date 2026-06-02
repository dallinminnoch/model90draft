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

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createFakeElement() {
  return {
    dataset: {},
    innerHTML: "",
    textContent: "",
    value: "",
    hidden: false,
    className: "",
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
      getPropertyValue(name) {
        return this.values[name] || "";
      },
      set flexBasis(value) {
        this.values.flexBasis = value;
      },
      get flexBasis() {
        return this.values.flexBasis || "";
      }
    },
    classList: {
      values: {},
      toggle(name, force) {
        this.values[name] = Boolean(force);
      },
      contains(name) {
        return Boolean(this.values[name]);
      }
    },
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    contains() {
      return false;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createCashFlowBar() {
  const elements = {
    status: createFakeElement(),
    income: createFakeElement(),
    housing: createFakeElement(),
    debt: createFakeElement(),
    expenses: createFakeElement(),
    savings: createFakeElement(),
    remaining: createFakeElement(),
    note: createFakeElement(),
    track: createFakeElement(),
    housingSegment: createFakeElement(),
    debtSegment: createFakeElement(),
    expensesSegment: createFakeElement(),
    remainingSegment: createFakeElement()
  };
  const bar = createFakeElement();
  bar.querySelector = function (selector) {
    const selectors = {
      "[data-pmi-expense-cashflow-status]": elements.status,
      "[data-pmi-expense-cashflow-income]": elements.income,
      "[data-pmi-expense-cashflow-housing]": elements.housing,
      "[data-pmi-expense-cashflow-debt]": elements.debt,
      "[data-pmi-expense-cashflow-expenses]": elements.expenses,
      "[data-pmi-expense-cashflow-savings]": elements.savings,
      "[data-pmi-expense-cashflow-remaining]": elements.remaining,
      "[data-pmi-expense-cashflow-note]": elements.note,
      "[data-pmi-expense-cashflow-track]": elements.track,
      "[data-pmi-expense-cashflow-segment=\"housing\"]": elements.housingSegment,
      "[data-pmi-expense-cashflow-segment=\"debt\"]": elements.debtSegment,
      "[data-pmi-expense-cashflow-segment=\"expenses\"]": elements.expensesSegment,
      "[data-pmi-expense-cashflow-segment=\"remaining\"]": elements.remainingSegment
    };
    return selectors[selector] || null;
  };
  return { bar, elements };
}

function createFakeRoot() {
  const cashFlow = createCashFlowBar();
  const cashFlowRoot = createFakeElement();
  const list = createFakeElement();
  const addButton = createFakeElement();
  const documentRef = {
    body: createFakeElement(),
    createElement() {
      return createFakeElement();
    },
    querySelector() {
      return null;
    }
  };
  list.querySelectorAll = function () {
    return [];
  };
  cashFlowRoot.querySelector = function (selector) {
    return selector === "[data-pmi-expense-cashflow-bar]" ? cashFlow.bar : null;
  };

  return {
    root: {
      dataset: {},
      innerHTML: "",
      ownerDocument: documentRef,
      querySelector(selector) {
        if (selector === "[data-pmi-expense-records-list]") {
          return list;
        }
        if (selector === "[data-pmi-expense-records-add]") {
          return addButton;
        }
        return null;
      },
      contains() {
        return false;
      }
    },
    cashFlowRoot,
    list,
    cashFlow
  };
}

function createFakeForm(values) {
  const safeValues = values && typeof values === "object" ? values : {};
  const safeDatasets = safeValues.__datasets && typeof safeValues.__datasets === "object" ? safeValues.__datasets : {};
  const listeners = {};
  const controls = Object.keys(safeValues).reduce((map, name) => {
    if (name === "__datasets") {
      return map;
    }
    map[name] = {
      name,
      value: String(safeValues[name] == null ? "" : safeValues[name]),
      dataset: Object.assign({}, safeDatasets[name] || {})
    };
    return map;
  }, {});
  return {
    controls,
    elements: {
      namedItem(name) {
        return controls[name] || null;
      }
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    dispatch(type, target) {
      if (typeof listeners[type] === "function") {
        listeners[type]({ target });
      }
    }
  };
}

const context = {
  console,
  window: null,
  document: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;

vm.createContext(context);
loadScript(context, "app/features/lens-analysis/expense-taxonomy.js");
loadScript(context, "app/features/lens-analysis/expense-library.js");
loadScript(context, "app/features/lens-analysis/asset-taxonomy.js");
loadScript(context, "app/features/lens-analysis/savings-contribution-facts.js");
loadScript(context, "app/features/lens-analysis/pmi-expense-records.js");

const pmiExpenseRecords = context.LensApp.lensAnalysis.pmiExpenseRecords;
const widgetSource = readRepoFile("app/features/lens-analysis/pmi-expense-records.js");
const componentsCss = readRepoFile("components.css");
const noSavingsSentence = "No planned savings entered.";

assert.equal(typeof pmiExpenseRecords.calculateMonthlyCashFlow, "function");
assert.equal(typeof pmiExpenseRecords.toMonthlyCashFlowAmount, "function");
assert.match(widgetSource, /data-pmi-expense-cashflow-bar/);
assert.match(widgetSource, /cashFlowRoot/, "cash-flow bar should use a dedicated top-level mount");
assert.match(widgetSource, /Monthly cash flow/, "cash-flow widget should use the compact reference title");
assert.match(widgetSource, /Take-home pay/, "cash-flow legend should identify monthly net-income base");
assert.match(widgetSource, /Housing burden/, "cash-flow legend should identify monthly housing burden");
assert.match(widgetSource, /Required debt/, "cash-flow legend should identify required debt payments");
assert.match(widgetSource, /Lifestyle expenses/, "cash-flow legend should identify recurring lifestyle expenses");
assert.match(widgetSource, /Planned savings/, "cash-flow legend should identify planned savings separately");
assert.match(widgetSource, /Remaining after savings/, "positive cash-flow status should use remaining-after-savings language");
assert.match(widgetSource, /After planned savings/, "positive cash-flow status should match the planned-savings scope");
assert.match(widgetSource, /Savings exceed available surplus/, "over-savings status should explain when savings exceed surplus");
assert.doesNotMatch(widgetSource, /Available before savings/, "cash-flow readout should not use stale available-before-savings language");
assert.doesNotMatch(widgetSource, /Before savings allocations/, "cash-flow readout should not use stale pre-savings status language");
assert.doesNotMatch(widgetSource, /Shortfall before savings/, "cash-flow readout should not use stale pre-savings shortfall language");
assert.doesNotMatch(widgetSource, /Savings allocations not yet included/, "cash-flow readout should not claim savings are excluded");
assert.match(widgetSource, /pmi-expense-cashflow-center/, "cash-flow widget should place the remaining amount inside the donut");
assert.match(widgetSource, /pmi-expense-cashflow-ring/, "cash-flow widget should render a smooth SVG donut ring");
assert.match(widgetSource, /setCashFlowDonut/, "cash-flow widget should update donut chart CSS properties");
assert.match(widgetSource, /setCashFlowCenterAmountSize/, "cash-flow widget should autosize the centered remaining amount");
assert.match(widgetSource, /normalizeSavingsContributionFacts/, "cash-flow calculation should use canonical savings contribution facts");
assert.match(widgetSource, new RegExp(noSavingsSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "cash-flow readout should explain the no-savings case");
assert.match(componentsCss, /\.pmi-expense-cashflow\s*{[\s\S]*?grid-column:\s*1 \/ -1;/);
assert.match(componentsCss, /\.pmi-expense-cashflow-ring-segment\s*{[\s\S]*?stroke-linecap:\s*round;/);
assert.match(componentsCss, /\.pmi-expense-cashflow-ring-base\s*{[\s\S]*?stroke:\s*var\(--m90-surface\);/);
assert.match(componentsCss, /\.pmi-expense-cashflow-center\s*{[\s\S]*?position:\s*absolute;/);
assert.match(componentsCss, /font-size:\s*var\(--cashflow-center-amount-size\);/);
assert.match(componentsCss, /\.pmi-expense-cashflow\.is-negative/);
assert.match(componentsCss, /\.pmi-expense-cashflow-legend\s*{[\s\S]*?display:\s*flex;/, "cash-flow legend should render compact visible labels");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--housing\s*{[\s\S]*?background:\s*var\(--cashflow-housing-color\);/, "housing segment should have a matching token-backed legend swatch");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--debt\s*{[\s\S]*?background:\s*var\(--cashflow-debt-color\);/, "debt segment should have a matching token-backed legend swatch");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--expenses\s*{[\s\S]*?background:\s*var\(--cashflow-expenses-color\);/, "expense segment should have a matching token-backed legend swatch");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--remaining\s*{[\s\S]*?background:\s*var\(--cashflow-remaining-color\);/, "remaining segment should have a matching token-backed legend swatch");

["pages/confidential-inputs.html", "pages/next-step.html"].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  const cashFlowRootIndex = source.indexOf("data-pmi-expense-cashflow-root");
  const scalarNotebookIndex = source.indexOf("data-pmi-scalar-expenses-notebook");
  const additionalExpensesIndex = source.indexOf("data-pmi-expense-records-root");
  assert.ok(cashFlowRootIndex !== -1, `${relativePath} should contain the dedicated cash-flow mount`);
  if (relativePath === "pages/next-step.html") {
    const formStartIndex = source.indexOf('id="protection-modeling-form"');
    const formEndIndex = source.indexOf("</form>", formStartIndex);
    assert.ok(formStartIndex !== -1 && formEndIndex !== -1, "next-step.html should retain the PMI form.");
    assert.ok(cashFlowRootIndex > formEndIndex, "next-step.html should mount cash flow in the right-side rail outside the form.");
    assert.equal(scalarNotebookIndex, -1, "next-step.html should not render the scalar expenses notebook after record-first Phase 2.");
    assert.match(source, /data-pmi-cashflow-rail/);
    assert.match(source, /cashFlowRoot: document\.querySelector\("\[data-pmi-expense-cashflow-root\]"\)/);
  } else {
    assert.ok(cashFlowRootIndex < scalarNotebookIndex, `${relativePath} should mount cash flow before scalar expenses`);
    assert.ok(cashFlowRootIndex < additionalExpensesIndex, `${relativePath} should mount cash flow before Additional Expenses`);
    assert.match(source, /cashFlowRoot: form\.querySelector\("\[data-pmi-expense-cashflow-root\]"\)/);
  }
  assert.match(source, /pageRoot: form/);
  const savingsFactsIndex = source.indexOf("savings-contribution-facts.js");
  const widgetIndex = source.indexOf("pmi-expense-records.js");
  assert.ok(savingsFactsIndex !== -1, `${relativePath} should load canonical savings contribution facts`);
  assert.ok(savingsFactsIndex < widgetIndex, `${relativePath} should load savings facts before the PMI expense widget`);
});

assert.equal(pmiExpenseRecords.toMonthlyCashFlowAmount(1200, "annual"), 100);
assert.equal(pmiExpenseRecords.toMonthlyCashFlowAmount(120, "weekly"), 520);
assert.equal(pmiExpenseRecords.toMonthlyCashFlowAmount(240, "biweekly"), 520);
assert.equal(pmiExpenseRecords.toMonthlyCashFlowAmount(900, "oneTime"), null);

const cashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: {
    combinedAnnualNetIncome: 633780.82,
    netAnnualIncome: 72000,
    spouseNetAnnualIncome: 36000
  },
  housing: {
    calculatedMonthlyMortgagePayment: 3340,
    monthlyHousingCost: 2800,
    housingSource: "calculatedMonthlyMortgagePayment"
  },
  expenseRecords: [
    { expenseId: "monthly", amount: 600, frequency: "monthly", termType: "ongoing" },
    { expenseId: "annual", amount: 1200, frequency: "annual", termType: "ongoing" },
    { expenseId: "weekly", amount: 120, frequency: "weekly", termType: "ongoing" },
    { expenseId: "biweekly", amount: 240, frequency: "biweekly", termType: "ongoing" },
    { expenseId: "one_time", amount: 10000, frequency: "oneTime", termType: "oneTime" }
  ],
  generatedExpenseRecords: [
    { sourceDebtRecordId: "debt_1", amount: 500, frequency: "monthly", termType: "ongoing", isDebtPaymentExpense: true }
  ]
});

assert.equal(cashFlow.monthlyTakeHomePay, 52815.07, "mature combined annual net income should divide by 12");
assert.equal(cashFlow.monthlyHousingCost, 3340, "calculated housing burden should outrank rent-only housing");
assert.equal(cashFlow.monthlyDebtPayments, 500, "generated debt-payment rows should reduce remaining cash flow");
assert.equal(cashFlow.monthlyExpenses, 1740, "recurring record expenses should reduce remaining cash flow");
assert.equal(cashFlow.monthlyPlannedSavings, 0, "missing savings records should not change remaining cash flow");
assert.equal(cashFlow.remainingBeforeSavings, 47235.07);
assert.equal(cashFlow.remainingAfterSavings, 47235.07);
assert.equal(cashFlow.remainingMonthlyCashFlow, 47235.07);
assert.equal(cashFlow.trace.excludedExpenses[0].reason, "one-time-expense-excluded", "one-time expenses should not become monthly recurring burn");

const fallbackIncomeCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: {
    netAnnualIncome: 72000,
    spouseNetAnnualIncome: 36000
  },
  housing: { monthlyHousingCost: 0 },
  expenseRecords: []
});
assert.equal(fallbackIncomeCashFlow.monthlyTakeHomePay, 9000, "insured/spouse fallback should still work when mature combined source is absent");

const noDoubleCountCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 60000 },
  housing: { monthlyHousingCost: 1000 },
  expenseRecords: [{ expenseId: "expense_food", amount: 300, frequency: "monthly", termType: "ongoing" }],
  generatedExpenseRecords: [{ sourceDebtRecordId: "debt_1", amount: 400, frequency: "monthly", termType: "ongoing", isDebtPaymentExpense: true }]
});
assert.equal(noDoubleCountCashFlow.monthlyExpenses, 300, "generated debt-payment rows should not be counted as generic expenses");
assert.equal(noDoubleCountCashFlow.monthlyDebtPayments, 400, "generated debt-payment rows should be counted once as debt payments");

const plannedSavingsCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 60000 },
  housing: { monthlyHousingCost: 1000 },
  expenseRecords: [{ expenseId: "expense_food", amount: 300, frequency: "monthly", termType: "ongoing" }],
  savingsHabitRecords: [
    {
      expenseId: "savings_emergency",
      typeKey: "emergencyFundContributions",
      categoryKey: "savingsGoalContributions",
      label: "Emergency fund",
      amount: 600,
      frequency: "monthly"
    }
  ]
});
assert.equal(plannedSavingsCashFlow.monthlyExpenses, 300, "planned savings should not be merged into normal expenses");
assert.equal(plannedSavingsCashFlow.monthlyPlannedSavings, 600, "planned savings should appear as a separate monthly amount");
assert.equal(plannedSavingsCashFlow.remainingBeforeSavings, 3700, "pre-savings surplus should be traceable");
assert.equal(plannedSavingsCashFlow.remainingAfterSavings, 3100, "remaining cash flow should subtract planned savings");
assert.equal(plannedSavingsCashFlow.trace.savingsContributionSource, "savings-contribution-facts", "planned savings should use the canonical helper");
assert.equal(plannedSavingsCashFlow.trace.includedSavingsContributions.length, 1);

const overSavingsCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 60000 },
  housing: { monthlyHousingCost: 1000 },
  expenseRecords: [{ amount: 300, frequency: "monthly", termType: "ongoing" }],
  savingsHabitRecords: [
    {
      expenseId: "savings_too_high",
      typeKey: "emergencyFundContributions",
      categoryKey: "savingsGoalContributions",
      label: "Aggressive savings",
      amount: 4200,
      frequency: "monthly"
    }
  ]
});
assert.equal(overSavingsCashFlow.remainingBeforeSavings, 3700);
assert.equal(overSavingsCashFlow.remainingAfterSavings, -500);
assert.equal(overSavingsCashFlow.savingsExceedAvailableSurplus, true, "over-saving should be distinct from expenses exceeding income");
assert.equal(overSavingsCashFlow.shortfallBeforeSavings, 0);
assert.equal(overSavingsCashFlow.shortfallAfterSavings, 500);

const recordOnlyCommonCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 60000 },
  housing: { monthlyHousingCost: 1000 },
  expenseRecords: [{
    expenseId: "starter_expense_groceries",
    typeKey: "groceries",
    amount: 500,
    frequency: "monthly",
    termType: "ongoing",
    isDefaultExpense: true
  }]
});
assert.equal(recordOnlyCommonCashFlow.monthlyExpenses, 500, "record-first common expense rows should drive cash flow without scalar fallback rows");

const fallbackDebtCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 12000 },
  housing: { monthlyHousingCost: 0 },
  expenseRecords: [],
  debtRecords: [
    { debtId: "debt_monthly", paymentAmount: 300, paymentFrequency: "monthly" },
    { debtId: "debt_minimum", minimumMonthlyPayment: 75 }
  ]
});
assert.equal(fallbackDebtCashFlow.monthlyDebtPayments, 375, "reliable debt payment records should reduce remaining cash flow");

const unreliableHousingCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 24000 },
  housing: {
    homeValue: 800000,
    primaryResidenceEquity: 400000
  },
  expenseRecords: []
});
assert.equal(unreliableHousingCashFlow.monthlyHousingCost, 0, "home value/equity should not be treated as a housing payment");
assert.ok(unreliableHousingCashFlow.trace.missing.includes("housing-payment-source"));

const negativeCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  income: { netAnnualIncome: 12000 },
  housing: { monthlyHousingCost: 1200 },
  expenseRecords: [{ amount: 500, frequency: "monthly", termType: "ongoing" }]
});
assert.equal(negativeCashFlow.remainingMonthlyCashFlow, -700);
assert.equal(negativeCashFlow.isNegative, true, "negative remaining monthly cash flow should be represented");

const missingIncomeCashFlow = pmiExpenseRecords.calculateMonthlyCashFlow({
  housing: { monthlyHousingCost: 1000 },
  expenseRecords: [{ amount: 100, frequency: "monthly", termType: "ongoing" }]
});
assert.equal(missingIncomeCashFlow.monthlyTakeHomePay, 0, "missing income should not crash calculation");
assert.equal(missingIncomeCashFlow.hasIncomeSource, false);

const fakeDom = createFakeRoot();
const fakeForm = createFakeForm({
  netAnnualIncome: "$633,780.82",
  spouseNetAnnualIncome: "",
  housingStatus: "Renter",
  monthlyHousingCost: 1400,
  utilitiesCost: 350,
  housingInsuranceCost: 190,
  calculatedMonthlyMortgagePayment: "$3,340",
  __datasets: {
    netAnnualIncome: { calculatedValue: "633780.82" },
    calculatedMonthlyMortgagePayment: { calculatedValue: "3340" }
  }
});
const controller = pmiExpenseRecords.initPmiExpenseRecords({
  root: fakeDom.root,
  cashFlowRoot: fakeDom.cashFlowRoot,
  pageRoot: fakeForm,
  debtRecordsProvider: () => []
});
assert.ok(controller);
assert.equal(typeof controller.updateCashFlowReadout, "function");
controller.hydrateExpenseRecords([
  {
    expenseId: "expense_monthly",
    categoryKey: "customExpense",
    typeKey: "customExpenseRecord",
    label: "Custom Advisor Expense",
    amount: 300,
    frequency: "monthly",
    termType: "ongoing",
    continuationStatus: "review"
  }
]);
assert.equal(controller.lastMonthlyCashFlow.monthlyTakeHomePay, 52815.07);
assert.equal(controller.lastMonthlyCashFlow.monthlyHousingCost, 3340);
assert.equal(controller.lastMonthlyCashFlow.monthlyExpenses, 300);
assert.equal(controller.lastMonthlyCashFlow.monthlyPlannedSavings, 0);
assert.equal(controller.lastMonthlyCashFlow.remainingMonthlyCashFlow, 49175.07);
assert.equal(fakeDom.cashFlow.elements.remaining.textContent, "$49,175.07");
assert.equal(fakeDom.cashFlow.elements.income.textContent, "$52,815.07");
assert.equal(fakeDom.cashFlow.elements.savings.textContent, "$0");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-housing-start"), "0.19%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-housing-end"), "6.44%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-housing-length"), "6.25");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-debt-end"), "6.44%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-expenses-start"), "6.82%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-expenses-end"), "7.38%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-expenses-length"), "0.56");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-remaining-start"), "7.76%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-remaining-end"), "99.81%");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-remaining-length"), "92.05");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-remaining-color"), "var(--m90-stable)");
assert.equal(fakeDom.cashFlow.elements.remaining.style.getPropertyValue("--cashflow-center-amount-size"), "1.38rem");
assert.doesNotMatch(fakeDom.cashFlow.elements.note.textContent, /Take-home pay is not available/);
assert.equal(fakeDom.cashFlow.elements.status.textContent, "Current cash flow");
assert.equal(fakeDom.cashFlow.elements.note.textContent, noSavingsSentence);

const savingsDom = createFakeRoot();
const savingsForm = createFakeForm({
  netAnnualIncome: "$633,780.82",
  spouseNetAnnualIncome: "",
  housingStatus: "Renter",
  monthlyHousingCost: 1400,
  utilitiesCost: 350,
  housingInsuranceCost: 190,
  calculatedMonthlyMortgagePayment: "$3,340",
  __datasets: {
    netAnnualIncome: { calculatedValue: "633780.82" },
    calculatedMonthlyMortgagePayment: { calculatedValue: "3340" }
  }
});
const savingsController = pmiExpenseRecords.initPmiExpenseRecords({
  root: savingsDom.root,
  cashFlowRoot: savingsDom.cashFlowRoot,
  pageRoot: savingsForm,
  debtRecordsProvider: () => [],
  savingsRecordsProvider: () => [{
    expenseId: "savings_emergency",
    typeKey: "emergencyFundContributions",
    categoryKey: "savingsGoalContributions",
    label: "Emergency fund",
    amount: 1000,
    frequency: "monthly"
  }]
});
savingsController.hydrateExpenseRecords([{
  expenseId: "expense_monthly",
  categoryKey: "customExpense",
  typeKey: "customExpenseRecord",
  label: "Custom Advisor Expense",
  amount: 300,
  frequency: "monthly",
  termType: "ongoing",
  continuationStatus: "review"
}]);
assert.equal(savingsController.lastMonthlyCashFlow.monthlyExpenses, 300);
assert.equal(savingsController.lastMonthlyCashFlow.monthlyPlannedSavings, 1000);
assert.equal(savingsController.lastMonthlyCashFlow.remainingBeforeSavings, 49175.07);
assert.equal(savingsController.lastMonthlyCashFlow.remainingAfterSavings, 48175.07);
assert.equal(savingsDom.cashFlow.elements.savings.textContent, "$1,000");
assert.equal(savingsDom.cashFlow.elements.remaining.textContent, "$48,175.07");
assert.equal(savingsDom.cashFlow.elements.status.textContent, "After planned savings");
assert.equal(savingsDom.cashFlow.elements.note.textContent, "");

const overSavingsDom = createFakeRoot();
const overSavingsController = pmiExpenseRecords.initPmiExpenseRecords({
  root: overSavingsDom.root,
  cashFlowRoot: overSavingsDom.cashFlowRoot,
  pageRoot: savingsForm,
  debtRecordsProvider: () => [],
  savingsRecordsProvider: () => [{
    expenseId: "savings_high",
    typeKey: "emergencyFundContributions",
    categoryKey: "savingsGoalContributions",
    label: "High savings",
    amount: 50000,
    frequency: "monthly"
  }]
});
overSavingsController.hydrateExpenseRecords([{
  expenseId: "expense_monthly",
  categoryKey: "customExpense",
  typeKey: "customExpenseRecord",
  label: "Custom Advisor Expense",
  amount: 300,
  frequency: "monthly",
  termType: "ongoing",
  continuationStatus: "review"
}]);
assert.equal(overSavingsController.lastMonthlyCashFlow.savingsExceedAvailableSurplus, true);
assert.equal(overSavingsDom.cashFlow.elements.status.textContent, "Savings exceed available surplus");
assert.match(overSavingsDom.cashFlow.elements.note.textContent, /Planned savings exceed available surplus after monthly obligations\./);

controller.hydrateExpenseRecords([
  {
    expenseId: "expense_monthly",
    categoryKey: "customExpense",
    typeKey: "customExpenseRecord",
    label: "Custom Advisor Expense",
    amount: 500,
    frequency: "monthly",
    termType: "ongoing",
    continuationStatus: "review"
  }
]);
assert.equal(controller.lastMonthlyCashFlow.monthlyExpenses, 500, "editing record rows should recalculate the bar");
assert.equal(controller.lastMonthlyCashFlow.remainingMonthlyCashFlow, 48975.07);

fakeForm.controls.netAnnualIncome.value = "12000";
fakeForm.controls.netAnnualIncome.dataset.calculatedValue = "12000";
fakeForm.dispatch("input", fakeForm.controls.netAnnualIncome);
assert.equal(controller.lastMonthlyCashFlow.isNegative, true, "lower income should make the bar represent a monthly shortfall");
assert.equal(fakeDom.cashFlow.elements.status.textContent, "Expenses exceed income");
assert.equal(fakeDom.cashFlow.elements.track.style.getPropertyValue("--cashflow-remaining-color"), "var(--m90-critical)");
assert.match(fakeDom.cashFlow.elements.note.textContent, /Entered monthly obligations exceed monthly take-home pay before planned savings\./);
assert.match(fakeDom.cashFlow.elements.note.textContent, new RegExp(noSavingsSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const rentFallbackForm = createFakeForm({
  netAnnualIncome: "120000",
  spouseNetAnnualIncome: "",
  housingStatus: "Renter",
  monthlyHousingCost: 2800,
  utilitiesCost: 350,
  housingInsuranceCost: 190
});
const rentFallbackDom = createFakeRoot();
const rentFallbackController = pmiExpenseRecords.initPmiExpenseRecords({
  root: rentFallbackDom.root,
  cashFlowRoot: rentFallbackDom.cashFlowRoot,
  pageRoot: rentFallbackForm,
  debtRecordsProvider: () => []
});
assert.equal(rentFallbackController.lastMonthlyCashFlow.monthlyHousingCost, 3340, "renter housing fallback should include rent, utilities, and housing insurance");

assert.doesNotMatch(widgetSource, /localStorage|sessionStorage/, "cash-flow readout should not write storage");

console.log("pmi-expense-monthly-cashflow-bar-check passed");
