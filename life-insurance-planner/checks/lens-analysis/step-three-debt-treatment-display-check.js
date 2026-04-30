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

function createDebtTraceInputs(overrides = {}) {
  return {
    treatedDebtPayoffAvailable: true,
    treatedDebtConsumedByMethods: false,
    preparedDebtSource: "debtFacts",
    preparedDebtFallbackSource: "debtPayoff-compatibility",
    rawEquivalentDefault: false,
    treatmentApplied: true,
    excludedDebtAmount: 338000,
    deferredDebtAmount: 250000,
    fallbackReason: null,
    warningCodes: [
      "debt-treatment-mode-deferred",
      "protected-mortgage-debt-treatment-record-ignored"
    ],
    warnings: [
      {
        code: "debt-treatment-mode-deferred",
        message: "Debt treatment mode is saved but exact formula behavior is not defined yet; raw-equivalent payoff was used.",
        severity: "warning",
        sourcePaths: ["treatedDebtPayoff.debts"]
      }
    ],
    ...overrides
  };
}

function createDimeResult() {
  return {
    method: "dime",
    label: "DIME Analysis",
    grossNeed: 1350000,
    netCoverageGap: 1350000,
    components: {
      debt: 100000,
      income: 1000000,
      mortgage: 250000,
      education: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {
      dimeIncomeYears: 10,
      includeExistingCoverageOffset: false,
      includeOffsetAssets: false
    },
    warnings: [],
    trace: [
      {
        key: "debt",
        label: "Debt",
        formula: "Sum of non-mortgage debt fields",
        value: 100000,
        sourcePaths: ["debtPayoff.otherRealEstateLoanBalance"],
        inputs: createDebtTraceInputs({
          currentMethodDebtSourcePath: "explicit-non-mortgage-debt-fields",
          preparedDebtSourcePath: "treatedDebtPayoff.dime.nonMortgageDebtAmount",
          rawNonMortgageDebtAmount: 100000,
          preparedNonMortgageDebtAmount: 12000,
          rawMortgageAmount: 250000,
          preparedMortgageAmount: 0
        })
      },
      {
        key: "mortgage",
        label: "Mortgage",
        formula: "mortgageBalance",
        value: 250000,
        sourcePaths: ["debtPayoff.mortgageBalance"],
        inputs: createDebtTraceInputs({
          currentMethodDebtSourcePath: "debtPayoff.mortgageBalance",
          preparedDebtSourcePath: "treatedDebtPayoff.dime.mortgageAmount",
          rawNonMortgageDebtAmount: 100000,
          preparedNonMortgageDebtAmount: 12000,
          rawMortgageAmount: 250000,
          preparedMortgageAmount: 0
        })
      }
    ]
  };
}

function createNeedsResult() {
  return {
    method: "needs",
    label: "Needs Analysis",
    grossNeed: 350000,
    netCoverageGap: 350000,
    components: {
      debtPayoff: 350000,
      essentialSupport: 0,
      education: 0,
      finalExpenses: 0,
      transitionNeeds: 0,
      discretionarySupport: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0,
      survivorIncomeOffset: 0
    },
    assumptions: {
      needsSupportDurationYears: 10,
      supportDurationSource: "settings.needsSupportDurationYears",
      includeExistingCoverageOffset: false,
      includeOffsetAssets: false,
      includeTransitionNeeds: false,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: false
    },
    warnings: [],
    trace: [
      {
        key: "debtPayoff",
        label: "Debt Payoff",
        formula: "debtPayoff.totalDebtPayoffNeed",
        value: 350000,
        sourcePaths: ["debtPayoff.totalDebtPayoffNeed"],
        inputs: createDebtTraceInputs({
          currentMethodDebtSourcePath: "debtPayoff.totalDebtPayoffNeed",
          preparedDebtSourcePath: "treatedDebtPayoff.needs.debtPayoffAmount",
          rawDebtPayoffAmount: 350000,
          rawMortgageAmount: 250000,
          rawNonMortgageDebtAmount: 100000,
          preparedDebtPayoffAmount: 12000,
          preparedMortgagePayoffAmount: 0,
          preparedNonMortgageDebtAmount: 12000,
          manualTotalDebtPayoffOverride: true,
          manualTotalDebtPayoffAmount: 999999,
          manualOverrideSource: "debtPayoff.totalDebtPayoffNeed",
          manualOverridePolicy: "metadata-only"
        })
      }
    ]
  };
}

function createHlvResult() {
  return {
    method: "humanLifeValue",
    label: "Simple Human Life Value",
    grossHumanLifeValue: 1000000,
    netCoverageGap: 1000000,
    components: {
      annualIncomeValue: 50000,
      projectionYears: 20,
      simpleHumanLifeValue: 1000000
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {
      incomeValueSource: "incomeBasis.annualNetIncome",
      projectionYears: 20,
      projectionYearsSource: "settings.hlvProjectionYears",
      includeExistingCoverageOffset: false,
      includeOffsetAssets: false,
      incomeGrowthApplied: false,
      discountRateApplied: false,
      survivorIncomeApplied: false
    },
    warnings: [],
    trace: []
  };
}

function assertNoProtectedDiffs() {
  const allowedDiffs = new Set([
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "checks/lens-analysis/debt-treatment-model-prep-check.js",
    "checks/lens-analysis/debt-treatment-method-trace-readiness-check.js",
    "checks/lens-analysis/step-three-debt-treatment-display-check.js"
  ]);
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
  const protectedDiffs = changedFiles.filter((filePath) => !allowedDiffs.has(filePath));

  assert.deepEqual(protectedDiffs, [], "Only debt treatment trace/display files should change.");
}

const hosts = {
  "[data-step-three-dime-analysis]": { innerHTML: "" },
  "[data-step-three-needs-analysis]": { innerHTML: "" },
  "[data-step-three-human-life-value-analysis]": { innerHTML: "" }
};
let readyCallback = null;
const profileRecord = {
  analysisSettings: {},
  protectionModeling: {
    data: {
      annualGrossIncome: 100000
    }
  }
};
const context = {
  console,
  Intl,
  URLSearchParams,
  window: null,
  document: {
    querySelector(selector) {
      return hosts[selector] || null;
    },
    addEventListener(eventName, callback) {
      if (eventName === "DOMContentLoaded") {
        readyCallback = callback;
      }
    }
  },
  location: {
    search: ""
  },
  LensApp: {
    clientRecords: {
      getCurrentLinkedRecord() {
        return profileRecord;
      }
    },
    lensAnalysis: {
      buildLensModelFromSavedProtectionModeling() {
        return {
          lensModel: {},
          warnings: []
        };
      },
      analysisSettingsAdapter: {
        createAnalysisMethodSettings() {
          return {
            dimeSettings: {},
            needsAnalysisSettings: {},
            humanLifeValueSettings: {},
            warnings: []
          };
        }
      },
      analysisMethods: {
        runDimeAnalysis() {
          return createDimeResult();
        },
        runNeedsAnalysis() {
          return createNeedsResult();
        },
        runHumanLifeValueAnalysis() {
          return createHlvResult();
        }
      }
    }
  }
};
context.window = context;
context.globalThis = context;

vm.createContext(context);
vm.runInContext(
  readRepoFile("app/features/lens-analysis/step-three-analysis-display.js"),
  context,
  { filename: "app/features/lens-analysis/step-three-analysis-display.js" }
);

assert.equal(typeof readyCallback, "function", "Step 3 display should register DOMContentLoaded.");
readyCallback();

const dimeHtml = hosts["[data-step-three-dime-analysis]"].innerHTML;
const needsHtml = hosts["[data-step-three-needs-analysis]"].innerHTML;
const hlvHtml = hosts["[data-step-three-human-life-value-analysis]"].innerHTML;

assert.match(dimeHtml, /Debt Treatment Details/);
assert.match(dimeHtml, /Raw debtPayoff used/);
assert.match(dimeHtml, /Raw non-mortgage debt used/);
assert.match(dimeHtml, /Prepared treated non-mortgage debt/);
assert.match(dimeHtml, /Raw mortgage used/);
assert.match(dimeHtml, /Prepared treated mortgage/);
assert.match(dimeHtml, /Prepared only; not method-used/);
assert.match(dimeHtml, /Deferred treatment warning/);

assert.match(needsHtml, /Debt Treatment Details/);
assert.match(needsHtml, /Raw debtPayoff used/);
assert.match(needsHtml, /Raw debt payoff used/);
assert.match(needsHtml, /Prepared treated debt/);
assert.match(needsHtml, /Prepared treated mortgage/);
assert.match(needsHtml, /Prepared treated non-mortgage debt/);
assert.match(needsHtml, /Prepared only; not method-used/);
assert.match(needsHtml, /Manual override: metadata only/);
assert.match(needsHtml, /999,999/);
assert.match(needsHtml, /Deferred treatment warning/);

assert.doesNotMatch(hlvHtml, /Debt Treatment Details/);
assert.doesNotMatch(hlvHtml, /Prepared treated debt/);

assertNoProtectedDiffs();

console.log("step-three-debt-treatment-display-check passed");
