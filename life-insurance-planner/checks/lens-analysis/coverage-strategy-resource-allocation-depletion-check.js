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
  "coverage-strategy-resource-allocation-depletion.js"
);
const resourceLineAdapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-resource-line-adapter.js"
);
const needLineAdapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-need-line-adapter.js"
);
const educationProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-education-lifetime-projection.js"
);
const diagnosticExportPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-diagnostic-export.js"
);
const coverageStrategyControllerPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-page.js"
);
const coverageStrategyPagePath = path.join(repoRoot, "pages", "coverage-strategy.html");

const helperSource = fs.readFileSync(helperPath, "utf8");
const resourceLineAdapterSource = fs.readFileSync(resourceLineAdapterPath, "utf8");
const needLineAdapterSource = fs.readFileSync(needLineAdapterPath, "utf8");
const educationProjectionSource = fs.readFileSync(educationProjectionPath, "utf8");
const diagnosticExportSource = fs.readFileSync(diagnosticExportPath, "utf8");
const coverageStrategyControllerSource = fs.readFileSync(coverageStrategyControllerPath, "utf8");
const coverageStrategyPageSource = fs.readFileSync(coverageStrategyPagePath, "utf8");

function loadHelper() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateCoverageStrategyResourceAllocationDepletion;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item && item.code).filter(Boolean);
}

function createBaselineResourcePoints(yearCount, resourceAmount = 100000) {
  return Array.from({ length: yearCount + 1 }, (_unused, yearIndex) => ({
    yearIndex,
    calendarYear: 2026 + yearIndex,
    resourceAmount,
    categoryAmounts: {
      taxableBrokerageInvestments: resourceAmount
    }
  }));
}

const calculateAllocation = loadHelper();

assert.equal(typeof calculateAllocation, "function", "helper exports calculateCoverageStrategyResourceAllocationDepletion");
assert.match(helperSource, /noFreeFundingRule/);
assert.match(helperSource, /needLineResourceLineReductionAmountsMatch/);
assert.match(helperSource, /helperExecutionMode:\s*"pure-allocation-helper"/);
assert.match(helperSource, /adapterCallsPerformedByHelper:\s*false/);
assert.match(helperSource, /requiresIntegrationConsumer:\s*true/);
assert.doesNotMatch(helperSource, /productionWiringActive/);
assert.doesNotMatch(helperSource, /resourceLineAdapterCalled/);
assert.doesNotMatch(helperSource, /needLineAdapterCalled/);
assert.doesNotMatch(helperSource, /\bdocument\b/);
assert.doesNotMatch(helperSource, /\bquerySelector\b/);
assert.doesNotMatch(helperSource, /\blocalStorage\b/);
assert.doesNotMatch(helperSource, /\bsessionStorage\b/);
assert.doesNotMatch(helperSource, /\bfetch\b/);

assert.match(coverageStrategyPageSource, /coverage-strategy-resource-allocation-depletion\.js/);
assert.match(coverageStrategyControllerSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(resourceLineAdapterSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(needLineAdapterSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(educationProjectionSource, /calculateCoverageStrategyResourceAllocationDepletion/);
assert.doesNotMatch(diagnosticExportSource, /calculateCoverageStrategyResourceAllocationDepletion/);

const basicInput = {
  projectionYears: 2,
  obligations: [
    {
      obligationId: "education-year-1",
      componentKey: "education",
      yearIndex: 1,
      calendarYear: 2027,
      requestedAmount: 10000,
      label: "Education payment",
      sourcePath: "educationPoints.1"
    }
  ],
  assets: [
    {
      assetId: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      treatedValue: 20000,
      sourcePath: "assetFacts.assets.0"
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(2, 20000)
};
const basicInputBefore = JSON.stringify(basicInput);
const basic = calculateAllocation(basicInput);
assert.equal(JSON.stringify(basicInput), basicInputBefore, "input object is not mutated");
assert.equal(basic.status, "complete");
assert.equal(basic.totalRequested, 10000);
assert.equal(basic.totalApplied, 10000);
assert.equal(basic.totalUnfunded, 0);
assert.equal(basic.scheduledResourceApplications.length, 1);
assert.equal(basic.scheduledResourceApplications[0].assetId, "brokerage");
assert.equal(basic.scheduledResourceApplications[0].preBalance, 20000);
assert.equal(basic.scheduledResourceApplications[0].postBalance, 10000);
assert.equal(basic.scheduledResourceApplications[0].needLineReductionAmount, 10000);
assert.equal(basic.scheduledResourceApplications[0].resourceLineReductionAmount, 10000);
assert.equal(basic.trace.needLineResourceLineReductionAmountsMatch, true);
assert.equal(basic.trace.helperExecutionMode, "pure-allocation-helper");
assert.equal(basic.trace.adapterCallsPerformedByHelper, false);
assert.equal(basic.trace.requiresIntegrationConsumer, true);
assert.ok(
  basic.trace.integrationConsumerResponsibleFor.includes("resource-line-depletion-events"),
  "helper trace names integration consumer responsibilities without implying live integration is inactive"
);
assert.equal(Object.prototype.hasOwnProperty.call(basic.trace, "productionWiringActive"), false);
assert.equal(Object.prototype.hasOwnProperty.call(basic.trace, "resourceLineAdapterCalled"), false);
assert.equal(Object.prototype.hasOwnProperty.call(basic.trace, "needLineAdapterCalled"), false);
assert.doesNotThrow(() => JSON.stringify(basic), "output is serializable");

const multiYear = calculateAllocation({
  projectionYears: 4,
  obligations: [
    {
      obligationId: "year-3",
      componentKey: "education",
      yearIndex: 3,
      calendarYear: 2029,
      requestedAmount: 5000
    },
    {
      obligationId: "year-1",
      componentKey: "education",
      yearIndex: 1,
      calendarYear: 2027,
      requestedAmount: 8000
    }
  ],
  assets: [
    {
      assetId: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      treatedValue: 20000
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(4, 20000)
});
assert.deepEqual(
  clone(multiYear.scheduledResourceApplications.map((application) => application.obligationId)),
  ["year-1", "year-3"],
  "obligations are allocated by year"
);
assert.equal(multiYear.resourceLineAdjustmentsByYear.find((point) => point.yearIndex === 1).resourceLineReductionAmount, 8000);
assert.equal(multiYear.resourceLineAdjustmentsByYear.find((point) => point.yearIndex === 2).resourceLineReductionAmount, 8000);
assert.equal(multiYear.resourceLineAdjustmentsByYear.find((point) => point.yearIndex === 3).resourceLineReductionAmount, 13000);
assert.equal(
  multiYear.annualResourceBalances.find((point) => point.yearIndex === 3).assetBalances[0].balance,
  7000,
  "future balances reflect earlier withdrawals"
);

const insufficient = calculateAllocation({
  projectionYears: 1,
  obligations: [
    {
      obligationId: "large-education-payment",
      componentKey: "education",
      yearIndex: 1,
      requestedAmount: 50000
    }
  ],
  assets: [
    {
      assetId: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      treatedValue: 20000
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(1, 20000)
});
assert.equal(insufficient.totalApplied, 20000);
assert.equal(insufficient.totalUnfunded, 30000);
assert.ok(issueCodes(insufficient.dataGaps).includes("resource-allocation-insufficient-eligible-resources"));

const eligibility = calculateAllocation({
  projectionYears: 1,
  obligations: [
    {
      obligationId: "education-payment",
      componentKey: "education",
      yearIndex: 1,
      requestedAmount: 15000
    }
  ],
  assets: [
    {
      assetId: "emergency",
      categoryKey: "emergencyFund",
      label: "Emergency Fund",
      treatedValue: 25000
    },
    {
      assetId: "retirement",
      categoryKey: "traditionalRetirementAssets",
      label: "Traditional Retirement",
      treatedValue: 90000
    },
    {
      assetId: "trust",
      categoryKey: "trustRestrictedAssets",
      label: "Restricted Trust",
      treatedValue: 90000
    },
    {
      assetId: "home",
      categoryKey: "primaryResidenceEquity",
      label: "Home Equity",
      treatedValue: 200000
    },
    {
      assetId: "business",
      categoryKey: "businessPrivateCompanyValue",
      label: "Business Value",
      treatedValue: 100000
    },
    {
      assetId: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      treatedValue: 20000
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(1, 525000)
});
assert.equal(eligibility.totalApplied, 15000);
assert.equal(eligibility.scheduledResourceApplications[0].assetId, "brokerage");
const exclusionReasons = new Set(eligibility.excludedAssetDecisions.map((decision) => decision.eligibilityReason));
assert.ok(exclusionReasons.has("emergency-fund-excluded-by-policy"));
assert.ok(exclusionReasons.has("retirement-assets-excluded-by-policy"));
assert.ok(exclusionReasons.has("restricted-assets-excluded-by-policy"));
assert.ok(exclusionReasons.has("home-equity-excluded-by-policy"));
assert.ok(exclusionReasons.has("business-value-excluded-by-policy"));

const treatedExcluded = calculateAllocation({
  projectionYears: 1,
  obligations: [
    {
      obligationId: "excluded-treatment-payment",
      componentKey: "education",
      yearIndex: 1,
      requestedAmount: 10000
    }
  ],
  assets: [
    {
      assetId: "excluded-brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Excluded Brokerage",
      treatedValue: 20000,
      treatmentStatus: "excluded-by-treatment"
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(1, 20000)
});
assert.equal(treatedExcluded.totalApplied, 0);
assert.equal(
  treatedExcluded.excludedAssetDecisions[0].eligibilityReason,
  "asset-unavailable-or-excluded-by-treatment",
  "assets excluded by upstream treatment are not available to the helper"
);

const cashAboveReserve = calculateAllocation({
  projectionYears: 1,
  obligations: [
    {
      obligationId: "cash-funded",
      componentKey: "education",
      yearIndex: 1,
      requestedAmount: 20000
    }
  ],
  assets: [
    {
      assetId: "cash",
      categoryKey: "cashAndCashEquivalents",
      label: "Cash",
      treatedValue: 30000
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(1, 30000),
  eligibilityPolicy: {
    allowCashAboveReserve: true,
    cashReserveAmount: 20000,
    allowTaxableBrokerage: true
  }
});
assert.equal(cashAboveReserve.totalApplied, 10000);
assert.equal(cashAboveReserve.totalUnfunded, 10000);
assert.equal(cashAboveReserve.scheduledResourceApplications[0].eligibilityReason, "cash-available-above-reserve");

const cashExcluded = calculateAllocation({
  projectionYears: 1,
  obligations: [
    {
      obligationId: "cash-not-allowed",
      componentKey: "education",
      yearIndex: 1,
      requestedAmount: 10000
    }
  ],
  assets: [
    {
      assetId: "cash",
      categoryKey: "cashAndCashEquivalents",
      label: "Cash",
      treatedValue: 30000
    }
  ],
  eligibilityPolicy: {
    allowCashAboveReserve: false,
    cashReserveAmount: 20000
  }
});
assert.equal(cashExcluded.totalApplied, 0);
assert.equal(cashExcluded.excludedAssetDecisions[0].eligibilityReason, "cash-excluded-by-policy");

const doubleCountGuard = calculateAllocation({
  projectionYears: 1,
  obligations: [
    {
      obligationId: "education-payment",
      componentKey: "education",
      yearIndex: 1,
      requestedAmount: 10000
    }
  ],
  assets: [
    {
      assetId: "plan-529",
      categoryKey: "educationSpecificSavings",
      label: "529 Plan",
      treatedValue: 10000,
      isEducationSpecific: true
    },
    {
      assetId: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      treatedValue: 15000
    }
  ],
  alreadyAppliedEducationSavings: [
    {
      assetId: "plan-529",
      amountApplied: 10000,
      obligationId: "education-payment"
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(1, 25000)
});
assert.equal(doubleCountGuard.scheduledResourceApplications[0].assetId, "brokerage");
const plan529Decision = doubleCountGuard.excludedAssetDecisions.find((decision) => decision.assetId === "plan-529");
assert.equal(plan529Decision.alreadyAppliedEducationSavingsAmount, 10000);
assert.equal(plan529Decision.eligibilityReason, "education-specific-asset-already-applied");
assert.equal(doubleCountGuard.trace.alreadyAppliedEducationSavingsByAsset["plan-529"], 10000);

const totalNeedReduction = doubleCountGuard.scheduledResourceApplications.reduce((sum, application) => {
  return sum + application.needLineReductionAmount;
}, 0);
const totalResourceReduction = doubleCountGuard.scheduledResourceApplications.reduce((sum, application) => {
  return sum + application.resourceLineReductionAmount;
}, 0);
assert.equal(totalNeedReduction, totalResourceReduction, "broader resource need and resource reductions match");

const noObligations = calculateAllocation({
  projectionYears: 2,
  obligations: [],
  assets: [
    {
      assetId: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      treatedValue: 20000
    }
  ],
  baselineResourcePoints: createBaselineResourcePoints(2, 20000)
});
assert.equal(noObligations.scheduledResourceApplications.length, 0);
assert.equal(noObligations.resourceLineAdjustmentsByYear[0].resourceLineReductionAmount, 0);
assert.equal(noObligations.resourceLineAdjustmentsByYear[2].resourceLineReductionAmount, 0);
assert.equal(noObligations.annualResourceBalances[2].assetBalances[0].balance, 20000);
assert.equal(noObligations.totalApplied, 0);
assert.equal(noObligations.totalUnfunded, 0);

console.log("coverage strategy resource allocation depletion check passed");
