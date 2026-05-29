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

function createNeedPoints(horizonYears, startAge = 46) {
  return Array.from({ length: horizonYears + 1 }, function (_unused, yearIndex) {
    const year = 2026 + yearIndex;
    return {
      yearIndex,
      date: `${year}-01-01`,
      calendarYear: year,
      age: startAge + yearIndex
    };
  });
}

function createHealthcareFact(overrides = {}) {
  return {
    expenseFactId: overrides.expenseFactId || overrides.typeKey || "healthcare",
    expenseRecordId: overrides.expenseRecordId || null,
    typeKey: overrides.typeKey || "medicalOutOfPocket",
    categoryKey: overrides.categoryKey || "ongoingHealthcare",
    label: overrides.label || "Healthcare",
    amount: overrides.amount ?? 100,
    frequency: overrides.frequency || "monthly",
    termType: overrides.termType,
    termYears: overrides.termYears ?? null,
    endAge: overrides.endAge ?? null,
    endDate: overrides.endDate ?? null,
    annualizedAmount: overrides.annualizedAmount,
    oneTimeAmount: overrides.oneTimeAmount,
    compressionCategoryKey: overrides.compressionCategoryKey,
    sourceOwnedBy: overrides.sourceOwnedBy,
    ownedByField: overrides.ownedByField,
    source: overrides.source || "protectionModeling.data.expenseRecords",
    sourceKey: overrides.sourceKey || "expenseRecords",
    sourcePath: overrides.sourcePath || "expenseFacts.expenses[0]",
    isHealthcareSensitive: overrides.isHealthcareSensitive ?? true,
    isFinalExpenseComponent: overrides.isFinalExpenseComponent === true,
    isDebtPaymentExpense: overrides.isDebtPaymentExpense === true,
    defaultInflationRole: overrides.defaultInflationRole || "healthcareInflation"
  };
}

function runProjection(helper, overrides = {}) {
  const input = {
    expenseFacts: {
      expenses: overrides.expenses || [
        createHealthcareFact({
          expenseFactId: "medical-until-age",
          typeKey: "medicalOutOfPocket",
          amount: 150,
          frequency: "monthly",
          termType: "untilAge",
          endAge: 85,
          sourcePath: "fixture.medical"
        })
      ]
    },
    needPoints: overrides.needPoints || createNeedPoints(45),
    valuationDate: overrides.valuationDate || "2026-01-01",
    clientDateOfBirth: overrides.clientDateOfBirth || "1980-01-01",
    healthcareInflationRatePercent: overrides.healthcareInflationRatePercent ?? 4.25,
    options: overrides.options || {}
  };
  const before = JSON.stringify(input);
  const result = helper(input);
  assert.equal(JSON.stringify(input), before, "helper must not mutate inputs");
  assert.doesNotThrow(() => JSON.stringify(result), "output should be JSON serializable");
  return result;
}

function issueCodes(issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => issue && issue.code).filter(Boolean);
}

const moduleSource = readRepoFile("app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js");
assert.match(moduleSource, /Coverage Strategy healthcare lifetime projection engine/);
assert.match(moduleSource, /Future home after folder reorganization/);
assert.doesNotMatch(moduleSource, /\bdocument\b|localStorage|sessionStorage|indexedDB/);
assert.match(moduleSource, /module\.exports/);

const context = createContext();
loadScript(context, "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js");
const helper = context.LensApp.lensAnalysis.buildCoverageStrategyHealthcareLifetimeProjection;
assert.equal(typeof helper, "function");

const inclusionResult = runProjection(helper, {
  needPoints: createNeedPoints(17),
  expenses: [
    createHealthcareFact({ expenseFactId: "ongoing", typeKey: "visionOutOfPocket", categoryKey: "visionCare", amount: 90, frequency: "annual", termType: "ongoing" }),
    createHealthcareFact({ expenseFactId: "blank", typeKey: "dentalOutOfPocket", categoryKey: "dentalCare", amount: 100, frequency: "annual", termType: "" }),
    createHealthcareFact({ expenseFactId: "medical-final", typeKey: "medicalEndOfLifeCosts", categoryKey: "medicalFinalExpense", amount: 5000, frequency: "oneTime", termType: "oneTime", isFinalExpenseComponent: true }),
    createHealthcareFact({ expenseFactId: "medical-debt", typeKey: "medicalDebt", categoryKey: "ongoingHealthcare", amount: 1000, source: "protectionModeling.data.debtRecords", sourceKey: "debtRecords", isDebtPaymentExpense: true }),
    createHealthcareFact({ expenseFactId: "living", typeKey: "groceries", categoryKey: "livingExpense", amount: 100, isHealthcareSensitive: false })
  ]
});
assert.equal(inclusionResult.includedRecords.length, 2);
assert.ok(inclusionResult.excludedRecords.some((record) => record.exclusionCode === "final-expense-healthcare-excluded"));
assert.ok(inclusionResult.excludedRecords.some((record) => record.exclusionCode === "debt-like-healthcare-excluded"));
assert.ok(inclusionResult.excludedRecords.some((record) => record.exclusionCode === "non-healthcare-expense-excluded"));
assert.ok(issueCodes(inclusionResult.warnings).includes("healthcare-duration-defaulted-to-ongoing"));
assert.equal(inclusionResult.includedRecords.find((record) => record.expenseFactId === "blank").durationSource, "coverageStrategyDefaultOngoing");
assert.ok(inclusionResult.healthcarePoints[17].healthcareNeedAmount > 0, "ongoing healthcare should run through the Coverage Strategy horizon");
assert.equal(inclusionResult.assumptionsUsed.internalHealthcareProjectionYearsCutoffUsed, false);

const supportOwnedMedicalResult = runProjection(helper, {
  healthcareInflationRatePercent: 0,
  needPoints: createNeedPoints(5),
  expenses: [
    createHealthcareFact({
      expenseFactId: "expense_record_starter_expense_medicalOutOfPocket",
      expenseRecordId: "starter_expense_medicalOutOfPocket",
      typeKey: "medicalOutOfPocket",
      categoryKey: "otherLivingExpense",
      compressionCategoryKey: "ongoingHealthcare",
      label: "Healthcare / Out-of-Pocket Medical",
      amount: 150,
      frequency: "monthly",
      termType: "ongoing",
      sourceOwnedBy: "ongoingSupport",
      ownedByField: "monthlyHealthcareOutOfPocketCost",
      isHealthcareSensitive: false,
      defaultInflationRole: "householdInflation",
      sourcePath: "protectionModeling.data.expenseRecords[1]"
    })
  ]
});
const supportOwnedMedicalRecord = supportOwnedMedicalResult.excludedRecords.find((record) => (
  record.exclusionCode === "support-owned-healthcare-expense-excluded"
));
assert.ok(supportOwnedMedicalRecord, "support-owned medical out-of-pocket should have a specific exclusion code");
assert.match(supportOwnedMedicalRecord.exclusionReason, /ongoing support/i);
assert.match(supportOwnedMedicalRecord.exclusionReason, /double-count/i);
assert.equal(supportOwnedMedicalRecord.trace.compressionCategoryKey, "ongoingHealthcare");
assert.equal(supportOwnedMedicalRecord.trace.ownedByField, "monthlyHealthcareOutOfPocketCost");
assert.equal(supportOwnedMedicalRecord.trace.sourceOwnedBy, "ongoingSupport");
assert.equal(supportOwnedMedicalRecord.trace.overlapRiskWithEssentialSupport, true);
assert.equal(supportOwnedMedicalRecord.trace.mathChanged, false);
assert.equal(supportOwnedMedicalResult.supportOwnedHealthcareExpenseExcludedCount, 1);
assert.equal(supportOwnedMedicalResult.healthcareLookingExcludedRecords.length, 1);
assert.ok(issueCodes(supportOwnedMedicalResult.warnings).includes("support-owned-healthcare-expense-excluded-from-healthcare-lifetime"));
assert.equal(supportOwnedMedicalResult.healthcarePoints[0].healthcareNeedAmount, 0);
assert.equal(supportOwnedMedicalResult.healthcarePoints[5].healthcareNeedAmount, 0);
assert.equal(supportOwnedMedicalResult.healthcarePoints[0].trace.supportOwnedHealthcareExpenseExcludedCount, 1);

const fixedYearsResult = runProjection(helper, {
  healthcareInflationRatePercent: 0,
  needPoints: createNeedPoints(8),
  expenses: [
    createHealthcareFact({ expenseFactId: "fixed", amount: 100, frequency: "monthly", termType: "fixedYears", termYears: 5 })
  ]
});
assert.equal(fixedYearsResult.healthcarePoints[0].healthcareNeedAmount, 6000);
assert.equal(fixedYearsResult.healthcarePoints[3].healthcareNeedAmount, 2400);
assert.equal(fixedYearsResult.healthcarePoints[5].healthcareNeedAmount, 0);

const fixedFallbackResult = runProjection(helper, {
  needPoints: createNeedPoints(3),
  expenses: [
    createHealthcareFact({ expenseFactId: "fixed-missing", amount: 100, frequency: "annual", termType: "fixedYears" })
  ]
});
assert.ok(issueCodes(fixedFallbackResult.warnings).includes("healthcare-fixed-years-missing-term-defaulted-to-ongoing"));
assert.ok(issueCodes(fixedFallbackResult.dataGaps).includes("healthcare-fixed-years-missing-term-defaulted-to-ongoing"));

const untilAgeResult = runProjection(helper, {
  healthcareInflationRatePercent: 0,
  needPoints: createNeedPoints(45),
  expenses: [
    createHealthcareFact({ expenseFactId: "until-age", amount: 150, frequency: "monthly", termType: "untilAge", endAge: 85 })
  ]
});
assert.ok(untilAgeResult.healthcarePoints[0].healthcareNeedAmount > untilAgeResult.healthcarePoints[10].healthcareNeedAmount);
assert.equal(untilAgeResult.healthcarePoints[39].healthcareNeedAmount, 0);

const untilDateResult = runProjection(helper, {
  healthcareInflationRatePercent: 0,
  needPoints: createNeedPoints(6),
  expenses: [
    createHealthcareFact({ expenseFactId: "until-date", amount: 100, frequency: "annual", termType: "untilDate", endDate: "2030-01-01" })
  ]
});
assert.equal(untilDateResult.healthcarePoints[0].healthcareNeedAmount, 400);
assert.equal(untilDateResult.healthcarePoints[4].healthcareNeedAmount, 0);

const oneTimeResult = runProjection(helper, {
  healthcareInflationRatePercent: 9,
  needPoints: createNeedPoints(4),
  expenses: [
    createHealthcareFact({ expenseFactId: "equipment", categoryKey: "medicalEquipment", amount: 500, frequency: "oneTime", termType: "oneTime", oneTimeAmount: 500 })
  ]
});
assert.equal(oneTimeResult.healthcarePoints[0].healthcareNeedAmount, 500);
assert.equal(oneTimeResult.healthcarePoints[1].healthcareNeedAmount, 0);
assert.equal(oneTimeResult.healthcarePoints[4].healthcareNeedAmount, 0);

const percentStyleRate = runProjection(helper, {
  healthcareInflationRatePercent: 4.25,
  needPoints: createNeedPoints(4)
});
const decimalStyleRate = runProjection(helper, {
  healthcareInflationRatePercent: 0.0425,
  needPoints: createNeedPoints(4)
});
assert.equal(
  percentStyleRate.healthcarePoints[0].healthcareNeedAmount,
  decimalStyleRate.healthcarePoints[0].healthcareNeedAmount,
  "4.25 and 0.0425 should normalize to the same healthcare inflation rate"
);

const laterDeathInflation = runProjection(helper, {
  healthcareInflationRatePercent: 10,
  needPoints: createNeedPoints(3),
  expenses: [
    createHealthcareFact({ expenseFactId: "ongoing-rate", amount: 100, frequency: "annual", termType: "ongoing" })
  ]
});
assert.equal(laterDeathInflation.healthcarePoints[0].healthcareNeedAmount, 510.51);
assert.equal(laterDeathInflation.healthcarePoints[1].healthcareNeedAmount, 400.51);
assert.notEqual(laterDeathInflation.healthcarePoints[1].healthcareNeedAmount, 331, "later death years should not restart inflation at year zero");

const adapterContext = createContext();
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js");
loadScript(adapterContext, "app/features/lens-analysis/coverage-strategy-need-line-adapter.js");
const buildNeedLine = adapterContext.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const needsResult = {
  method: "needsAnalysis",
  components: {
    debtPayoff: 0,
    essentialSupport: 0,
    education: 0,
    finalExpenses: 0,
    healthcareExpenses: 180820.7,
    transitionNeeds: 0,
    discretionarySupport: 0
  },
  commonOffsets: {},
  assumptions: {
    valuationDate: "2026-01-01"
  },
  trace: [
    {
      key: "healthcareExpenses",
      inputs: {
        projectionYears: 10,
        projectedHealthcareExpenseAmount: 180820.7,
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
    expenseFacts: {
      expenses: [
        createHealthcareFact({ expenseFactId: "james-medical", typeKey: "medicalOutOfPocket", amount: 150, frequency: "monthly", termType: "untilAge", endAge: 85 }),
        createHealthcareFact({ expenseFactId: "james-vision", typeKey: "visionOutOfPocket", categoryKey: "visionCare", amount: 90, frequency: "annual", termType: "ongoing" })
      ]
    }
  },
  needsResult,
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 4.25
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 17
});
assert.ok(needLine.needPoints[0].componentAmounts.healthcareExpenses > needLine.needPoints[10].componentAmounts.healthcareExpenses);
assert.ok(needLine.needPoints[11].componentAmounts.healthcareExpenses > 0, "Coverage Strategy should not drop healthcare solely after projectionYears");
assert.notEqual(needLine.needPoints[0].componentAmounts.healthcareExpenses, 180820.7);
assert.notEqual(needLine.needPoints[10].componentAmounts.healthcareExpenses, 180820.7);
assert.ok(!issueCodes(needLine.warnings).includes("healthcare-year-level-projection-limited"));
assert.equal(needLine.componentModels.healthcare.lifetimeProjection.aggregateFallbackUsed, false);

const fallbackNeedLine = buildNeedLine({
  lensModel: {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    expenseFacts: {
      expenses: []
    }
  },
  needsResult,
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 4.25
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.ok(issueCodes(fallbackNeedLine.warnings).includes("healthcare-aggregate-fallback-used"));
assert.ok(issueCodes(fallbackNeedLine.warnings).includes("healthcare-year-level-projection-limited"));
assert.equal(fallbackNeedLine.needPoints[0].componentAmounts.healthcareExpenses, 180820.7);

const pageSource = readRepoFile("pages/coverage-strategy.html");
assert.ok(
  pageSource.indexOf("coverage-strategy-healthcare-lifetime-projection.js")
    < pageSource.indexOf("coverage-strategy-need-line-adapter.js"),
  "Coverage Strategy should load healthcare lifetime projection before Need Line adapter"
);
[
  "pages/analysis-estimate.html",
  "pages/dime-results.html",
  "pages/simple-needs-results.html",
  "pages/hlv-results.html",
  "pages/income-loss-impact.html"
].forEach((pagePath) => {
  assert.doesNotMatch(readRepoFile(pagePath), /coverage-strategy-healthcare-lifetime-projection\.js/);
});

console.log("coverage strategy healthcare lifetime projection check passed");
