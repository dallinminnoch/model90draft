#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "household-financial-position-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function loadHelper() {
  const context = {
    console,
    Intl,
    globalThis: null,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateHouseholdFinancialPosition;
}

function baseInput(overrides = {}) {
  return {
    asOfDate: "2026-01-01",
    targetDate: "2027-01-01",
    startingResources: {
      value: 100000,
      status: "treated-current-assets",
      sourcePath: "treatedAssetOffsets.totalTreatedAssetValue",
      sourcePaths: ["treatedAssetOffsets.totalTreatedAssetValue"]
    },
    recurringIncome: {
      value: 120000,
      frequency: "annual",
      status: "net-household-income",
      sourcePaths: ["incomeBasis.insuredNetAnnualIncome", "incomeBasis.spouseOrPartnerNetAnnualIncome"]
    },
    recurringExpenses: {
      value: 60000,
      frequency: "annual",
      status: "prepared-bucket",
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
    },
    scheduledObligations: [],
    assetGrowth: {
      annualRatePercent: 0,
      active: false,
      status: "current-dollar",
      sourcePaths: ["incomeImpact.householdPosition.assetGrowth.currentDollar"]
    },
    options: {},
    ...overrides
  };
}

assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]/);
assert.doesNotMatch(helperSource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);
assert.doesNotMatch(helperSource, /runNeedsAnalysis|calculateDime|calculateHlv|calculateSimpleNeeds/i);
assert.doesNotMatch(helperSource, /income-loss-impact|scenarioTimeline|eventLanes|survivorRunway|death benefits/i);

const calculateHouseholdFinancialPosition = loadHelper();
assert.equal(typeof calculateHouseholdFinancialPosition, "function");

const surplus = calculateHouseholdFinancialPosition(baseInput());
assert.equal(surplus.status, "complete");
assert.equal(surplus.startingBalance, 100000);
assert.equal(surplus.targetBalance, 160000);
assert.equal(surplus.totalIncome, 120000);
assert.equal(surplus.totalExpenses, 60000);
assert.equal(surplus.points.length, 13);
assert.equal(surplus.points.at(-1).endingBalance, 160000);

const deficit = calculateHouseholdFinancialPosition(baseInput({
  recurringIncome: {
    value: 30000,
    frequency: "annual",
    status: "net-household-income",
    sourcePaths: ["incomeBasis.insuredNetAnnualIncome"]
  },
  recurringExpenses: {
    value: 90000,
    frequency: "annual",
    status: "prepared-bucket",
    sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
  }
}));
assert.equal(deficit.status, "complete");
assert.equal(deficit.targetBalance, 40000);
assert.ok(deficit.points.at(-1).endingBalance < deficit.startingBalance);

const missingNetIncome = calculateHouseholdFinancialPosition(baseInput({
  recurringIncome: {
    value: null,
    frequency: "annual",
    status: "missing-net-household-income",
    sourcePaths: ["incomeBasis.insuredNetAnnualIncome", "incomeBasis.spouseOrPartnerNetAnnualIncome"]
  }
}));
assert.equal(missingNetIncome.status, "data-gap");
assert.equal(missingNetIncome.targetBalance, null);
assert.ok(
  missingNetIncome.dataGaps.some(function (gap) {
    return gap.code === "missing-net-recurring-income";
  }),
  "Missing mature net household income should create a data gap."
);

const unsafeGrossIncome = calculateHouseholdFinancialPosition(baseInput({
  recurringIncome: {
    value: 180000,
    frequency: "annual",
    status: "gross-fallback",
    sourcePaths: ["incomeBasis.insuredGrossAnnualIncome"]
  }
}));
assert.equal(unsafeGrossIncome.status, "data-gap");
assert.equal(unsafeGrossIncome.targetBalance, null);
assert.ok(
  unsafeGrossIncome.dataGaps.some(function (gap) {
    return gap.code === "unsafe-recurring-income";
  }),
  "Gross income should be treated as unsafe instead of spendable income."
);

const inactiveGrowth = calculateHouseholdFinancialPosition(baseInput({
  recurringIncome: { value: 0, frequency: "annual", status: "net-household-income", sourcePaths: ["incomeBasis.insuredNetAnnualIncome"] },
  recurringExpenses: { value: 0, frequency: "annual", status: "prepared-bucket", sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"] },
  assetGrowth: {
    annualRatePercent: 12,
    active: false,
    status: "saved-only",
    sourcePaths: ["projectedAssetGrowth.includedCategories[0].assumedAnnualGrowthRatePercent"]
  }
}));
assert.equal(inactiveGrowth.totalAssetGrowth, 0);
assert.equal(inactiveGrowth.targetBalance, 100000);

const activeGrowth = calculateHouseholdFinancialPosition(baseInput({
  recurringIncome: { value: 0, frequency: "annual", status: "net-household-income", sourcePaths: ["incomeBasis.insuredNetAnnualIncome"] },
  recurringExpenses: { value: 0, frequency: "annual", status: "prepared-bucket", sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"] },
  assetGrowth: {
    annualRatePercent: 12,
    active: true,
    status: "current-output-active",
    sourcePaths: ["activeGrowth.annualRatePercent"]
  }
}));
assert.ok(activeGrowth.totalAssetGrowth > 0);
assert.ok(activeGrowth.targetBalance > 100000);

const separateObligation = calculateHouseholdFinancialPosition(baseInput({
  scheduledObligations: [
    {
      annualAmount: 12000,
      termMonths: 12,
      separateFromRecurringExpenses: true,
      status: "separate-scheduled-obligation",
      sourcePaths: ["futureTuition.annualAmount"]
    }
  ]
}));
assert.equal(separateObligation.totalScheduledObligations, 12000);
assert.equal(separateObligation.targetBalance, 148000);

const includedObligation = calculateHouseholdFinancialPosition(baseInput({
  scheduledObligations: [
    {
      annualAmount: 12000,
      termMonths: 12,
      includedInRecurringExpenses: true,
      status: "included-in-recurring-expenses",
      sourcePaths: ["ongoingSupport.monthlyMortgagePayment"]
    }
  ]
}));
assert.equal(includedObligation.totalScheduledObligations, 0);
assert.equal(includedObligation.targetBalance, 160000);
assert.ok(
  includedObligation.warnings.some(function (warning) {
    return warning.code === "scheduled-obligation-skipped-already-in-expenses";
  }),
  "Obligations already represented in recurring expenses should not be double-counted."
);

console.log("household-financial-position-calculations-check passed");
