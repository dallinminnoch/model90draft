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

function createContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function createNeedPoints(years) {
  return Array.from({ length: years + 1 }, function (_unused, yearIndex) {
    const year = 2026 + yearIndex;
    return {
      yearIndex,
      date: `${year}-01-01`,
      calendarYear: year,
      age: 46 + yearIndex
    };
  });
}

function createExpenseFact(overrides = {}) {
  return {
    expenseFactId: overrides.expenseFactId || overrides.typeKey || "expense",
    expenseRecordId: overrides.expenseRecordId || null,
    typeKey: overrides.typeKey || "funeralBurialEstimate",
    categoryKey: overrides.categoryKey || "funeralBurial",
    label: overrides.label || "Expense",
    amount: overrides.amount ?? 1000,
    frequency: overrides.frequency || "oneTime",
    oneTimeAmount: overrides.oneTimeAmount,
    source: overrides.source || "protectionModeling.data.expenseRecords",
    sourceKey: overrides.sourceKey || "expenseRecords",
    sourcePath: overrides.sourcePath || "expenseFacts.expenses[0]",
    isFinalExpenseComponent: overrides.isFinalExpenseComponent ?? true,
    isHealthcareSensitive: overrides.isHealthcareSensitive === true,
    isDebtPaymentExpense: overrides.isDebtPaymentExpense === true
  };
}

function runProjection(helper, overrides = {}) {
  const input = {
    expenseFacts: {
      expenses: overrides.expenses || [
        createExpenseFact({ expenseFactId: "funeral", categoryKey: "funeralBurial", amount: 10000 }),
        createExpenseFact({ expenseFactId: "medical", categoryKey: "medicalFinalExpense", typeKey: "medicalEndOfLifeCosts", amount: 5000 }),
        createExpenseFact({ expenseFactId: "estate", categoryKey: "estateSettlement", amount: 2000 }),
        createExpenseFact({ expenseFactId: "other", categoryKey: "otherFinalExpense", amount: 1000 })
      ]
    },
    finalExpenseFacts: overrides.finalExpenseFacts,
    needPoints: overrides.needPoints || createNeedPoints(15),
    valuationDate: overrides.valuationDate || "2026-01-01",
    finalExpenseInflationRatePercent: overrides.finalExpenseInflationRatePercent ?? 3,
    healthcareInflationRatePercent: overrides.healthcareInflationRatePercent ?? 4.25,
    options: overrides.options || {}
  };
  const before = JSON.stringify(input);
  const result = helper(input);
  assert.equal(JSON.stringify(input), before, "helper must not mutate inputs");
  assert.doesNotThrow(() => JSON.stringify(result), "output should be JSON serializable");
  return result;
}

function projected(amount, rate, years) {
  return Number((amount * Math.pow(1 + rate, years)).toFixed(2));
}

function issueCodes(issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => issue && issue.code).filter(Boolean);
}

const moduleSource = readRepoFile("app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js");
assert.match(moduleSource, /Coverage Strategy final expense lifetime projection engine/);
assert.match(moduleSource, /Future home after folder reorganization/);
assert.doesNotMatch(moduleSource, /\bdocument\b|localStorage|sessionStorage|indexedDB/);
assert.match(moduleSource, /module\.exports/);

const context = createContext();
loadScript(context, "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js");
const helper = context.LensApp.lensAnalysis.buildCoverageStrategyFinalExpenseLifetimeProjection;
assert.equal(typeof helper, "function");

const baseResult = runProjection(helper);
assert.equal(baseResult.status, "complete");
assert.equal(baseResult.includedRecords.length, 4);
assert.equal(baseResult.finalExpensePoints.length, 16);
assert.equal(baseResult.finalExpensePoints[0].finalExpenseNeedAmount, 18000);
assert.equal(baseResult.finalExpensePoints[0].funeralBurialAmount, 10000);
assert.equal(baseResult.finalExpensePoints[0].medicalEndOfLifeAmount, 5000);
assert.equal(baseResult.finalExpensePoints[0].estateSettlementAmount, 2000);
assert.equal(baseResult.finalExpensePoints[0].otherFinalExpenseAmount, 1000);
assert.equal(
  baseResult.finalExpensePoints[5].medicalEndOfLifeAmount,
  projected(5000, 0.0425, 5),
  "medical final expense should use healthcare inflation"
);
assert.equal(
  baseResult.finalExpensePoints[5].funeralBurialAmount,
  projected(10000, 0.03, 5),
  "funeral/burial should use final expense inflation"
);
assert.equal(baseResult.finalExpensePoints[5].estateSettlementAmount, projected(2000, 0.03, 5));
assert.equal(baseResult.finalExpensePoints[5].otherFinalExpenseAmount, projected(1000, 0.03, 5));
assert.ok(baseResult.finalExpensePoints[15].finalExpenseNeedAmount > baseResult.finalExpensePoints[0].finalExpenseNeedAmount);
assert.equal(baseResult.finalExpensePoints[5].trace.annualStreamUsed, false);

const percentRate = runProjection(helper, {
  finalExpenseInflationRatePercent: 3,
  healthcareInflationRatePercent: 4.25
});
const decimalRate = runProjection(helper, {
  finalExpenseInflationRatePercent: 0.03,
  healthcareInflationRatePercent: 0.0425
});
assert.equal(percentRate.finalExpensePoints[10].finalExpenseNeedAmount, decimalRate.finalExpensePoints[10].finalExpenseNeedAmount);
const halfPercentRate = runProjection(helper, {
  finalExpenseInflationRatePercent: 0.5,
  healthcareInflationRatePercent: 0.5
});
assert.equal(
  halfPercentRate.finalExpensePoints[1].funeralBurialAmount,
  projected(10000, 0.005, 1),
  "0.5 percent-style final expense inflation should normalize to 0.5%, not 50%"
);
assert.equal(
  halfPercentRate.finalExpensePoints[1].medicalEndOfLifeAmount,
  projected(5000, 0.005, 1),
  "0.5 percent-style healthcare inflation should normalize to 0.5%, not 50%"
);

const exclusionResult = runProjection(helper, {
  expenses: [
    createExpenseFact({ expenseFactId: "recurring-health", categoryKey: "ongoingHealthcare", typeKey: "medicalOutOfPocket", isFinalExpenseComponent: false, isHealthcareSensitive: true }),
    createExpenseFact({ expenseFactId: "medical-debt", categoryKey: "medicalDebt", typeKey: "medicalDebt", source: "protectionModeling.data.debtRecords", sourceKey: "debtRecords", isDebtPaymentExpense: true }),
    createExpenseFact({ expenseFactId: "living", categoryKey: "livingExpense", typeKey: "groceries", isFinalExpenseComponent: false }),
    createExpenseFact({ expenseFactId: "medical-final", categoryKey: "medicalFinalExpense", typeKey: "medicalEndOfLifeCosts", amount: 7000 })
  ]
});
assert.equal(exclusionResult.includedRecords.length, 1);
assert.ok(exclusionResult.excludedRecords.some((record) => record.exclusionCode === "recurring-healthcare-final-expense-excluded"));
assert.ok(exclusionResult.excludedRecords.some((record) => record.exclusionCode === "debt-like-final-expense-excluded"));
assert.ok(exclusionResult.excludedRecords.some((record) => record.exclusionCode === "non-final-expense-excluded"));

const scalarResult = runProjection(helper, {
  expenses: [],
  finalExpenseFacts: {
    funeralBurialEstimate: 9000,
    medicalEndOfLifeCosts: 4000,
    estateSettlementCosts: 1500,
    otherFinalExpenses: 500
  },
  needPoints: createNeedPoints(2),
  finalExpenseInflationRatePercent: 0,
  healthcareInflationRatePercent: 0
});
assert.equal(scalarResult.finalExpensePoints[0].finalExpenseNeedAmount, 15000);
assert.equal(scalarResult.includedRecords.length, 4);
assert.ok(scalarResult.includedRecords.every((record) => /finalExpenseFacts\./.test(record.sourcePath)));

const noFacts = runProjection(helper, {
  expenses: [],
  finalExpenseFacts: {},
  needPoints: createNeedPoints(1)
});
assert.equal(noFacts.status, "unavailable");
assert.ok(issueCodes(noFacts.warnings).includes("final-expense-lifetime-no-records"));

const adapterContext = createContext();
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js");
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js");
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js");
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js");
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-need-line-adapter.js");
const buildNeedLine = adapterContext.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const needsResult = {
  method: "needsAnalysis",
  components: {
    debtPayoff: 0,
    essentialSupport: 0,
    education: 0,
    finalExpenses: 999999,
    healthcareExpenses: 0,
    transitionNeeds: 0,
    discretionarySupport: 0
  },
  assumptions: {
    valuationDate: "2026-01-01"
  },
  commonOffsets: {},
  trace: [
    {
      key: "finalExpenses",
      inputs: {
        projectedFinalExpenseAmount: 999999,
        finalExpenseInflationRatePercent: 3,
        healthcareInflationRatePercent: 4.25
      }
    }
  ]
};
const needLine = buildNeedLine({
  lensModel: {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    finalExpenses: {
      funeralBurialEstimate: 10000,
      medicalEndOfLifeCosts: 5000,
      estateSettlementCosts: 2000,
      otherFinalExpenses: 1000
    }
  },
  needsResult,
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseInflationRatePercent: 3,
      healthcareInflationRatePercent: 4.25
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(needLine.needPoints[0].componentAmounts.finalExpenses, 18000);
assert.ok(needLine.needPoints[5].componentAmounts.finalExpenses > needLine.needPoints[0].componentAmounts.finalExpenses);
assert.notEqual(needLine.needPoints[0].componentAmounts.finalExpenses, 999999);
assert.equal(needLine.needPoints[0].trace.componentTiming.finalExpenses, "record-level-death-year-final-expense-schedule");
assert.equal(needLine.componentModels.finalExpenses.lifetimeProjection.staticFallbackUsed, false);

const fallbackNeedLine = buildNeedLine({
  lensModel: {},
  needsResult,
  valuationDate: "2026-01-01",
  horizonYears: 1
});
assert.equal(fallbackNeedLine.needPoints[0].componentAmounts.finalExpenses, 999999);
assert.ok(issueCodes(fallbackNeedLine.warnings).includes("final-expense-static-fallback-used"));

const pageSource = readRepoFile("pages/coverage-strategy.html");
assert.ok(
  pageSource.indexOf("coverage-strategy-final-expense-lifetime-projection.js")
    < pageSource.indexOf("coverage-strategy-need-line-adapter.js"),
  "Coverage Strategy final expense lifetime projection should load before the Need Line adapter."
);
[
  "pages/dime-results.html",
  "pages/hlv-results.html",
  "pages/simple-needs-results.html",
  "pages/analysis-estimate.html",
  "pages/income-loss-impact.html"
].forEach(function (relativePath) {
  assert.doesNotMatch(readRepoFile(relativePath), /coverage-strategy-final-expense-lifetime-projection\.js/);
});

console.log("coverage strategy final expense lifetime projection check passed");
