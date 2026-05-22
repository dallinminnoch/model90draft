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
    remaining: createFakeElement(),
    note: createFakeElement(),
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
      "[data-pmi-expense-cashflow-remaining]": elements.remaining,
      "[data-pmi-expense-cashflow-note]": elements.note,
      "[data-pmi-expense-cashflow-track]": createFakeElement(),
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
loadScript(context, "app/features/lens-analysis/pmi-expense-records.js");

const pmiExpenseRecords = context.LensApp.lensAnalysis.pmiExpenseRecords;
const widgetSource = readRepoFile("app/features/lens-analysis/pmi-expense-records.js");
const componentsCss = readRepoFile("components.css");
const helperSentence = "This readout compares monthly take-home pay against housing, required debt, and recurring expenses before any savings allocations.";

assert.equal(typeof pmiExpenseRecords.calculateMonthlyCashFlow, "function");
assert.equal(typeof pmiExpenseRecords.toMonthlyCashFlowAmount, "function");
assert.match(widgetSource, /data-pmi-expense-cashflow-bar/);
assert.match(widgetSource, /cashFlowRoot/, "cash-flow bar should use a dedicated top-level mount");
assert.match(widgetSource, /Monthly take-home pay/, "cash-flow legend should identify monthly net-income base");
assert.match(widgetSource, /Housing burden/, "cash-flow legend should identify monthly housing burden");
assert.match(widgetSource, /Required debt payments/, "cash-flow legend should identify required debt payments");
assert.match(widgetSource, /Lifestyle expenses/, "cash-flow legend should identify recurring lifestyle expenses");
assert.match(widgetSource, /Available before savings/, "positive cash-flow status should use available-before-savings language");
assert.match(widgetSource, /Shortfall before savings/, "negative cash-flow status should use shortfall-before-savings language");
assert.match(widgetSource, new RegExp(helperSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "cash-flow readout should explain what the bar compares");
assert.match(componentsCss, /\.pmi-expense-cashflow\s*{[\s\S]*?grid-column:\s*1 \/ -1;/);
assert.match(componentsCss, /\.pmi-expense-cashflow-track\s*{[\s\S]*?display:\s*flex;/);
assert.match(componentsCss, /\.pmi-expense-cashflow\.is-negative/);
assert.match(componentsCss, /\.pmi-expense-cashflow-legend\s*{[\s\S]*?display:\s*flex;/, "cash-flow legend should render compact visible labels");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--housing\s*{[\s\S]*?background:\s*#3b82f6;/, "housing segment should have a matching legend swatch");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--debt\s*{[\s\S]*?background:\s*#f59e0b;/, "debt segment should have a matching legend swatch");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--expenses\s*{[\s\S]*?background:\s*#8b5cf6;/, "expense segment should have a matching legend swatch");
assert.match(componentsCss, /\.pmi-expense-cashflow-legend-swatch--remaining\s*{[\s\S]*?background:\s*#10b981;/, "remaining segment should have a matching legend swatch");

["pages/confidential-inputs.html", "pages/next-step.html"].forEach((relativePath) => {
  const source = readRepoFile(relativePath);
  const cashFlowRootIndex = source.indexOf("data-pmi-expense-cashflow-root");
  const scalarNotebookIndex = source.indexOf("data-pmi-scalar-expenses-notebook");
  const additionalExpensesIndex = source.indexOf("data-pmi-expense-records-root");
  assert.ok(cashFlowRootIndex !== -1, `${relativePath} should contain the dedicated cash-flow mount`);
  assert.ok(cashFlowRootIndex < scalarNotebookIndex, `${relativePath} should mount cash flow before scalar expenses`);
  assert.ok(cashFlowRootIndex < additionalExpensesIndex, `${relativePath} should mount cash flow before Additional Expenses`);
  assert.match(source, /cashFlowRoot: form\.querySelector\("\[data-pmi-expense-cashflow-root\]"\)/);
  assert.match(source, /pageRoot: form/);
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
  scalarExpenseRecords: [
    { expenseId: "scalar_foodCost", amount: 90, frequency: "monthly", termType: "ongoing" }
  ],
  generatedExpenseRecords: [
    { sourceDebtRecordId: "debt_1", amount: 500, frequency: "monthly", termType: "ongoing", isDebtPaymentExpense: true }
  ]
});

assert.equal(cashFlow.monthlyTakeHomePay, 52815.07, "mature combined annual net income should divide by 12");
assert.equal(cashFlow.monthlyHousingCost, 3340, "calculated housing burden should outrank rent-only housing");
assert.equal(cashFlow.monthlyDebtPayments, 500, "generated debt-payment rows should reduce remaining cash flow");
assert.equal(cashFlow.monthlyExpenses, 1830, "recurring expenses and scalar monthly rows should reduce remaining cash flow");
assert.equal(cashFlow.remainingMonthlyCashFlow, 47145.07);
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
  scalarExpenseRecords: [{ expenseId: "scalar_foodCost", amount: 300, frequency: "monthly", termType: "ongoing" }],
  generatedExpenseRecords: [{ sourceDebtRecordId: "debt_1", amount: 400, frequency: "monthly", termType: "ongoing", isDebtPaymentExpense: true }]
});
assert.equal(noDoubleCountCashFlow.monthlyExpenses, 300, "generated debt-payment rows should not be counted as generic expenses");
assert.equal(noDoubleCountCashFlow.monthlyDebtPayments, 400, "generated debt-payment rows should be counted once as debt payments");

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
  insuranceCost: 100,
  foodCost: 200,
  transportationCost: 0,
  childcareDependentCareCost: 0,
  phoneInternetCost: 0,
  householdSuppliesCost: 0,
  otherHouseholdExpenses: 0,
  travelDiscretionaryCost: 0,
  subscriptionsCost: 0,
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
assert.equal(controller.lastMonthlyCashFlow.monthlyExpenses, 600);
assert.equal(controller.lastMonthlyCashFlow.remainingMonthlyCashFlow, 48875.07);
assert.equal(fakeDom.cashFlow.elements.remaining.textContent, "$48,875.07");
assert.equal(fakeDom.cashFlow.elements.income.textContent, "$52,815.07");
assert.doesNotMatch(fakeDom.cashFlow.elements.note.textContent, /Take-home pay is not available/);
assert.equal(fakeDom.cashFlow.elements.status.textContent, "Available before savings");
assert.equal(fakeDom.cashFlow.elements.note.textContent, helperSentence);

fakeForm.controls.foodCost.value = "500";
fakeForm.dispatch("input", fakeForm.controls.foodCost);
assert.equal(controller.lastMonthlyCashFlow.monthlyExpenses, 900, "editing scalar expense fields should recalculate the bar");
assert.equal(controller.lastMonthlyCashFlow.remainingMonthlyCashFlow, 48575.07);

fakeForm.controls.netAnnualIncome.value = "12000";
fakeForm.controls.netAnnualIncome.dataset.calculatedValue = "12000";
fakeForm.dispatch("input", fakeForm.controls.netAnnualIncome);
assert.equal(controller.lastMonthlyCashFlow.isNegative, true, "lower income should make the bar represent a monthly shortfall");
assert.equal(fakeDom.cashFlow.elements.status.textContent, "Shortfall before savings");
assert.match(fakeDom.cashFlow.elements.note.textContent, /Entered monthly obligations exceed monthly take-home pay before savings allocations\./);
assert.match(fakeDom.cashFlow.elements.note.textContent, new RegExp(helperSentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

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
