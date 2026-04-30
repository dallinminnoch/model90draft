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

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
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
  vm.createContext(context);
  loadScript(context, "app/features/lens-analysis/analysis-methods.js");
  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDebtTreatmentWarnings() {
  return [
    {
      code: "debt-treatment-mode-deferred",
      message: "Debt treatment mode is saved but exact formula behavior is not defined yet; raw-equivalent payoff was used.",
      severity: "warning",
      sourcePaths: ["treatedDebtPayoff.debts"]
    },
    {
      code: "protected-mortgage-debt-treatment-record-ignored",
      message: "Primary residence mortgage debtRecords were ignored because mortgageBalance owns the housing mortgage.",
      severity: "warning",
      sourcePaths: ["debtFacts.debts"]
    },
    {
      code: "equity-debt-treatment-record-ignored",
      message: "Equity-like records were ignored by debt treatment.",
      severity: "warning",
      sourcePaths: ["debtFacts.debts"]
    }
  ];
}

function createTreatedDebtPayoff() {
  const warnings = createDebtTreatmentWarnings();
  return {
    rawEquivalentDefault: false,
    treatmentApplied: true,
    source: "debtFacts",
    fallbackSource: "debtPayoff-compatibility",
    dime: {
      nonMortgageDebtAmount: 12000,
      mortgageAmount: 0,
      totalDebtAndMortgageAmount: 12000
    },
    needs: {
      debtPayoffAmount: 12000,
      mortgagePayoffAmount: 0,
      nonMortgageDebtAmount: 12000
    },
    rawTotals: {
      totalDebtBalance: 350000,
      mortgageBalance: 250000,
      nonMortgageDebtBalance: 100000,
      excludedDebtAmount: 338000,
      deferredDebtAmount: 250000
    },
    excludedDebtAmount: 338000,
    deferredDebtAmount: 250000,
    debts: [],
    warnings,
    trace: {
      manualTotalDebtPayoffOverride: true
    },
    metadata: {
      source: "debtFacts",
      fallbackSource: "debtPayoff-compatibility",
      consumedByMethods: false,
      manualTotalDebtPayoffOverride: true,
      manualTotalDebtPayoffNeed: 999999,
      manualOverrideSource: "debtPayoff.totalDebtPayoffNeed",
      warnings
    }
  };
}

function createUnavailableTreatedDebtPayoff() {
  const warnings = [
    {
      code: "missing-debt-treatment-helper",
      message: "calculateDebtTreatment is unavailable; treated debt payoff values were not prepared.",
      severity: "warning",
      sourcePaths: []
    }
  ];
  return {
    rawEquivalentDefault: false,
    treatmentApplied: false,
    source: null,
    fallbackSource: null,
    dime: {
      nonMortgageDebtAmount: null,
      mortgageAmount: null,
      totalDebtAndMortgageAmount: null
    },
    needs: {
      debtPayoffAmount: null,
      mortgagePayoffAmount: null,
      nonMortgageDebtAmount: null
    },
    rawTotals: {
      totalDebtBalance: null,
      mortgageBalance: null,
      nonMortgageDebtBalance: null,
      excludedDebtAmount: null,
      deferredDebtAmount: null
    },
    warnings,
    trace: {
      manualTotalDebtPayoffOverride: false
    },
    metadata: {
      consumedByMethods: false,
      reason: "missing-debt-treatment-helper",
      warnings
    }
  };
}

function createModel(options = {}) {
  const model = {
    incomeBasis: {
      annualIncomeReplacementBase: 100000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      mortgageBalance: 250000,
      otherRealEstateLoanBalance: 20000,
      autoLoanBalance: 15000,
      creditCardBalance: 5000,
      studentLoanBalance: 40000,
      personalLoanBalance: 8000,
      outstandingTaxLiabilities: 3000,
      businessDebtBalance: 7000,
      otherDebtPayoffNeeds: 2000,
      totalDebtPayoffNeed: 350000,
      totalDebtPayoffNeedManualOverride: true
    },
    educationSupport: {
      totalEducationFundingNeed: 0
    },
    finalExpenses: {
      totalFinalExpenseNeed: 0
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 0,
      annualDiscretionaryPersonalSpending: 0
    },
    survivorScenario: {
      survivorNetAnnualIncome: 0,
      survivorIncomeStartDelayMonths: 0
    },
    existingCoverage: {
      totalExistingCoverage: 0
    }
  };

  if (options.includeTreatedDebt !== false) {
    model.treatedDebtPayoff = options.unavailableTreatedDebt === true
      ? createUnavailableTreatedDebtPayoff()
      : createTreatedDebtPayoff();
  }

  return model;
}

function createDimeSettings() {
  return {
    dimeIncomeYears: 10,
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false
  };
}

function createNeedsSettings() {
  return {
    needsSupportDurationYears: 10,
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false,
    includeEssentialSupport: false,
    includeTransitionNeeds: false,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: false
  };
}

function createHlvSettings() {
  return {
    hlvProjectionYears: 20,
    includeExistingCoverageOffset: false,
    includeOffsetAssets: false
  };
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function assertNoMutation(methodName, run) {
  const model = createModel();
  const settings = run.createSettings();
  const modelBefore = cloneJson(model);
  const settingsBefore = cloneJson(settings);
  const result = run.execute(model, settings);
  assert.deepEqual(model, modelBefore, methodName + " must not mutate model input.");
  assert.deepEqual(settings, settingsBefore, methodName + " must not mutate settings input.");
  return result;
}

function assertDebtTreatmentTraceBase(trace, methodName) {
  assert.ok(trace, methodName + " should include a debt treatment readiness trace.");
  assert.equal(trace.inputs.treatedDebtPayoffAvailable, true);
  assert.equal(trace.inputs.treatedDebtConsumedByMethods, false);
  assert.equal(trace.inputs.preparedDebtSource, "debtFacts");
  assert.equal(trace.inputs.preparedDebtFallbackSource, "debtPayoff-compatibility");
  assert.equal(trace.inputs.rawEquivalentDefault, false);
  assert.equal(trace.inputs.treatmentApplied, true);
  assert.equal(trace.inputs.excludedDebtAmount, 338000);
  assert.equal(trace.inputs.deferredDebtAmount, 250000);
  assert.equal(trace.inputs.fallbackReason, null);
  assert.ok(trace.inputs.warningCodes.includes("debt-treatment-mode-deferred"));
  assert.ok(trace.inputs.warningCodes.includes("protected-mortgage-debt-treatment-record-ignored"));
  assert.ok(trace.inputs.warningCodes.includes("equity-debt-treatment-record-ignored"));
  assert.ok(
    trace.inputs.warnings.some((warning) => warning.code === "debt-treatment-mode-deferred"),
    methodName + " should surface deferred debt mode warning metadata."
  );
}

function assertDimeDebtTrace(dimeResult) {
  const debtTrace = findTrace(dimeResult, "debt");
  assertDebtTreatmentTraceBase(debtTrace, "DIME debt");
  assert.equal(debtTrace.value, 100000);
  assert.equal(debtTrace.inputs.rawNonMortgageDebtAmount, 100000);
  assert.equal(debtTrace.inputs.preparedNonMortgageDebtAmount, 12000);
  assert.equal(debtTrace.inputs.rawMortgageAmount, 250000);
  assert.equal(debtTrace.inputs.preparedMortgageAmount, 0);
  assert.equal(debtTrace.inputs.currentMethodDebtSourcePath, "explicit-non-mortgage-debt-fields");
  assert.deepEqual(cloneJson(debtTrace.sourcePaths), [
    "debtPayoff.otherRealEstateLoanBalance",
    "debtPayoff.autoLoanBalance",
    "debtPayoff.creditCardBalance",
    "debtPayoff.studentLoanBalance",
    "debtPayoff.personalLoanBalance",
    "debtPayoff.outstandingTaxLiabilities",
    "debtPayoff.businessDebtBalance",
    "debtPayoff.otherDebtPayoffNeeds"
  ]);
  assert.equal(debtTrace.inputs.preparedDebtSourcePath, "treatedDebtPayoff.dime.nonMortgageDebtAmount");
}

function assertDimeMortgageTrace(dimeResult) {
  const mortgageTrace = findTrace(dimeResult, "mortgage");
  assertDebtTreatmentTraceBase(mortgageTrace, "DIME mortgage");
  assert.equal(mortgageTrace.value, 250000);
  assert.equal(mortgageTrace.inputs.currentMethodDebtSourcePath, "debtPayoff.mortgageBalance");
  assert.deepEqual(cloneJson(mortgageTrace.sourcePaths), ["debtPayoff.mortgageBalance"]);
  assert.equal(mortgageTrace.inputs.preparedDebtSourcePath, "treatedDebtPayoff.dime.mortgageAmount");
  assert.equal(mortgageTrace.inputs.rawMortgageAmount, 250000);
  assert.equal(mortgageTrace.inputs.preparedMortgageAmount, 0);
  assert.equal(mortgageTrace.inputs.rawNonMortgageDebtAmount, 100000);
  assert.equal(mortgageTrace.inputs.preparedNonMortgageDebtAmount, 12000);
}

function assertNeedsDebtTrace(needsResult) {
  const debtTrace = findTrace(needsResult, "debtPayoff");
  assertDebtTreatmentTraceBase(debtTrace, "Needs debt payoff");
  assert.equal(debtTrace.value, 350000);
  assert.equal(debtTrace.inputs.currentMethodDebtSourcePath, "debtPayoff.totalDebtPayoffNeed");
  assert.deepEqual(cloneJson(debtTrace.sourcePaths), ["debtPayoff.totalDebtPayoffNeed"]);
  assert.equal(debtTrace.inputs.preparedDebtSourcePath, "treatedDebtPayoff.needs.debtPayoffAmount");
  assert.equal(debtTrace.inputs.rawDebtPayoffAmount, 350000);
  assert.equal(debtTrace.inputs.rawMortgageAmount, 250000);
  assert.equal(debtTrace.inputs.rawNonMortgageDebtAmount, 100000);
  assert.equal(debtTrace.inputs.preparedDebtPayoffAmount, 12000);
  assert.equal(debtTrace.inputs.preparedMortgagePayoffAmount, 0);
  assert.equal(debtTrace.inputs.preparedNonMortgageDebtAmount, 12000);
  assert.equal(debtTrace.inputs.manualTotalDebtPayoffOverride, true);
  assert.equal(debtTrace.inputs.manualTotalDebtPayoffAmount, 999999);
  assert.equal(debtTrace.inputs.manualOverrideSource, "debtPayoff.totalDebtPayoffNeed");
  assert.equal(debtTrace.inputs.manualOverridePolicy, "metadata-only");
}

function assertUnavailableTrace(methods) {
  const missingDime = methods.runDimeAnalysis(createModel({ includeTreatedDebt: false }), createDimeSettings());
  const missingDimeTrace = findTrace(missingDime, "debt");
  assert.equal(missingDimeTrace.inputs.treatedDebtPayoffAvailable, false);
  assert.equal(missingDimeTrace.inputs.treatedDebtConsumedByMethods, false);
  assert.equal(missingDimeTrace.inputs.fallbackReason, "missing-treatedDebtPayoff");
  assert.equal(missingDimeTrace.inputs.preparedNonMortgageDebtAmount, null);
  assert.equal(missingDime.components.debt, 100000);

  const unavailableNeeds = methods.runNeedsAnalysis(
    createModel({ unavailableTreatedDebt: true }),
    createNeedsSettings()
  );
  const unavailableNeedsTrace = findTrace(unavailableNeeds, "debtPayoff");
  assert.equal(unavailableNeedsTrace.inputs.treatedDebtPayoffAvailable, false);
  assert.equal(unavailableNeedsTrace.inputs.treatedDebtConsumedByMethods, false);
  assert.equal(unavailableNeedsTrace.inputs.fallbackReason, "missing-debt-treatment-helper");
  assert.ok(unavailableNeedsTrace.inputs.warningCodes.includes("missing-debt-treatment-helper"));
  assert.equal(unavailableNeeds.components.debtPayoff, 350000);
}

function assertNoProtectedDiffs() {
  const allowedDiffs = new Set([
    "app/features/lens-analysis/analysis-methods.js",
    "checks/lens-analysis/debt-treatment-model-prep-check.js",
    "checks/lens-analysis/debt-treatment-method-trace-readiness-check.js"
  ]);
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
  const protectedDiffs = changedFiles.filter((filePath) => !allowedDiffs.has(filePath));

  assert.deepEqual(protectedDiffs, [], "Only method trace scaffolding files should change.");
}

const context = createContext();
const methods = context.LensApp.lensAnalysis.analysisMethods;

assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");

const dimeWithTreated = assertNoMutation("DIME", {
  createSettings: createDimeSettings,
  execute: methods.runDimeAnalysis
});
assert.equal(dimeWithTreated.components.debt, 100000);
assert.equal(dimeWithTreated.components.mortgage, 250000);
assertDimeDebtTrace(dimeWithTreated);
assertDimeMortgageTrace(dimeWithTreated);

const needsWithTreated = assertNoMutation("Needs", {
  createSettings: createNeedsSettings,
  execute: methods.runNeedsAnalysis
});
assert.equal(needsWithTreated.components.debtPayoff, 350000);
assertNeedsDebtTrace(needsWithTreated);

const hlvWithTreated = assertNoMutation("Simple HLV", {
  createSettings: createHlvSettings,
  execute: methods.runHumanLifeValueAnalysis
});
const hlvWithoutTreated = methods.runHumanLifeValueAnalysis(
  createModel({ includeTreatedDebt: false }),
  createHlvSettings()
);
assert.deepEqual(
  cloneJson(hlvWithTreated.components),
  cloneJson(hlvWithoutTreated.components),
  "HLV output should not change."
);
assert.equal(
  JSON.stringify(hlvWithTreated.trace || []).includes("treatedDebtPayoff"),
  false,
  "HLV trace should not gain debt treatment fields in this pass."
);

assertUnavailableTrace(methods);
assertNoProtectedDiffs();

console.log("debt-treatment-method-trace-readiness-check passed");
