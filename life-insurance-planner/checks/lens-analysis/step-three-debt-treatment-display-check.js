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

function createMortgageSupportTrace(overrides = {}) {
  return {
    debtFactId: "primary-mortgage",
    treatmentKey: "mortgage",
    treatmentMode: "support",
    isMortgage: true,
    rawBalance: 250000,
    treatedAmount: 72000,
    excludedAmount: 178000,
    mortgageTreatmentMode: "support",
    monthlyMortgagePaymentUsed: 2000,
    monthlyMortgagePaymentSourcePath: "ongoingSupport.monthlyMortgagePayment",
    supportYearsRequested: 10,
    supportMonthsRequested: 120,
    supportMonthsUsed: 36,
    remainingTermMonths: 36,
    remainingTermMonthsSourcePath: "ongoingSupport.mortgageRemainingTermMonths",
    remainingTermCapApplied: true,
    noCapReason: null,
    noInflationApplied: true,
    noDiscountingApplied: true,
    mortgageSupportAmount: 72000,
    ...overrides
  };
}

function createLensModel(options = {}) {
  return {
    treatedDebtPayoff: {
      trace: options.supportMode ? [createMortgageSupportTrace(options.supportTraceOverrides)] : [],
      debts: []
    }
  };
}

function createDimeResult(options = {}) {
  const supportMode = options.supportMode === true;
  const mortgageAmount = supportMode ? 72000 : 0;
  return {
    method: "dime",
    label: "DIME Analysis",
    grossNeed: 1012000 + mortgageAmount,
    netCoverageGap: 1012000 + mortgageAmount,
    components: {
      debt: 12000,
      income: 1000000,
      mortgage: mortgageAmount,
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
        formula: "treatedDebtPayoff.dime.nonMortgageDebtAmount",
        value: 12000,
        sourcePaths: ["treatedDebtPayoff.dime.nonMortgageDebtAmount"],
        inputs: createDebtTraceInputs({
          treatedDebtConsumedByMethods: true,
          currentMethodDebtSourcePath: "treatedDebtPayoff.dime.nonMortgageDebtAmount",
          fallbackDebtSourcePath: "explicit-non-mortgage-debt-fields",
          preparedDebtSourcePath: "treatedDebtPayoff.dime.nonMortgageDebtAmount",
          rawNonMortgageDebtAmount: 100000,
          preparedNonMortgageDebtAmount: 12000,
          rawMortgageAmount: 250000,
          preparedMortgageAmount: mortgageAmount
        })
      },
      {
        key: "mortgage",
        label: "Mortgage",
        formula: "treatedDebtPayoff.dime.mortgageAmount",
        value: mortgageAmount,
        sourcePaths: ["treatedDebtPayoff.dime.mortgageAmount"],
        inputs: createDebtTraceInputs({
          treatedDebtConsumedByMethods: true,
          currentMethodDebtSourcePath: "treatedDebtPayoff.dime.mortgageAmount",
          fallbackDebtSourcePath: "debtPayoff.mortgageBalance",
          preparedDebtSourcePath: "treatedDebtPayoff.dime.mortgageAmount",
          rawNonMortgageDebtAmount: 100000,
          preparedNonMortgageDebtAmount: 12000,
          rawMortgageAmount: 250000,
          preparedMortgageAmount: mortgageAmount
        })
      }
    ]
  };
}

function createNeedsResult(options = {}) {
  const supportMode = options.supportMode === true;
  const mortgageAmount = supportMode ? 72000 : 0;
  const debtPayoffAmount = 12000 + mortgageAmount;
  return {
    method: "needs",
    label: "Needs Analysis",
    grossNeed: debtPayoffAmount,
    netCoverageGap: debtPayoffAmount,
    components: {
      debtPayoff: debtPayoffAmount,
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
        formula: "treatedDebtPayoff.needs.debtPayoffAmount",
        value: debtPayoffAmount,
        sourcePaths: ["treatedDebtPayoff.needs.debtPayoffAmount"],
        inputs: createDebtTraceInputs({
          treatedDebtConsumedByMethods: true,
          currentMethodDebtSourcePath: "treatedDebtPayoff.needs.debtPayoffAmount",
          fallbackDebtSourcePath: "debtPayoff.totalDebtPayoffNeed",
          preparedDebtSourcePath: "treatedDebtPayoff.needs.debtPayoffAmount",
          rawDebtPayoffAmount: 350000,
          rawMortgageAmount: 250000,
          rawNonMortgageDebtAmount: 100000,
          preparedDebtPayoffAmount: debtPayoffAmount,
          preparedMortgagePayoffAmount: mortgageAmount,
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
    "app/features/lens-analysis/step-three-analysis-display.js",
    "checks/lens-analysis/step-three-debt-treatment-display-check.js"
  ]);
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
  const protectedDiffs = changedFiles.filter((filePath) => !allowedDiffs.has(filePath));

  assert.deepEqual(protectedDiffs, [], "Only debt treatment truthfulness, metadata, and check files should change.");
}

function renderScenario(options = {}) {
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
            lensModel: createLensModel(options),
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
            return createDimeResult(options);
          },
          runNeedsAnalysis() {
            return createNeedsResult(options);
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

  return {
    dimeHtml: hosts["[data-step-three-dime-analysis]"].innerHTML,
    needsHtml: hosts["[data-step-three-needs-analysis]"].innerHTML,
    hlvHtml: hosts["[data-step-three-human-life-value-analysis]"].innerHTML
  };
}

const supportScenario = renderScenario({ supportMode: true });
const dimeHtml = supportScenario.dimeHtml;
const needsHtml = supportScenario.needsHtml;
const hlvHtml = supportScenario.hlvHtml;

assert.match(dimeHtml, /Debt Treatment Details/);
assert.match(dimeHtml, /Prepared treated debt used/);
assert.match(dimeHtml, /Raw non-mortgage debt reference/);
assert.match(dimeHtml, /Prepared treated non-mortgage debt/);
assert.match(dimeHtml, /Raw mortgage reference/);
assert.match(dimeHtml, /Prepared treated mortgage support/);
assert.match(dimeHtml, /Prepared treated debt method-used/);
assert.match(dimeHtml, /Deferred treatment warning/);
assert.match(dimeHtml, /Mortgage treatment mode/);
assert.match(dimeHtml, /Support/);
assert.match(dimeHtml, /Monthly mortgage payment used/);
assert.match(dimeHtml, /\$2,000/);
assert.match(dimeHtml, /Requested support period \/ months/);
assert.match(dimeHtml, /10 years \/ 120 months/);
assert.match(dimeHtml, /Support months used/);
assert.match(dimeHtml, /36 months/);
assert.match(dimeHtml, /Remaining-term cap applied/);
assert.match(dimeHtml, /Yes/);
assert.match(dimeHtml, /Remaining term months/);
assert.match(dimeHtml, /No inflation applied/);
assert.match(dimeHtml, /No discounting applied/);
assert.match(dimeHtml, /Mortgage support amount/);
assert.match(dimeHtml, /\$72,000/);

assert.match(needsHtml, /Debt Treatment Details/);
assert.match(needsHtml, /Prepared treated debt used/);
assert.match(needsHtml, /Raw debt payoff reference/);
assert.match(needsHtml, /Prepared treated debt/);
assert.match(needsHtml, /Prepared treated mortgage support/);
assert.match(needsHtml, /Prepared treated non-mortgage debt/);
assert.match(needsHtml, /Prepared treated debt method-used/);
assert.match(needsHtml, /Mortgage treatment mode/);
assert.match(needsHtml, /Mortgage support amount/);
assert.match(needsHtml, /Manual override: metadata only/);
assert.match(needsHtml, /999,999/);
assert.match(needsHtml, /Deferred treatment warning/);

assert.doesNotMatch(hlvHtml, /Debt Treatment Details/);
assert.doesNotMatch(hlvHtml, /Prepared treated debt/);

const uncappedScenario = renderScenario({
  supportMode: true,
  supportTraceOverrides: {
    supportMonthsUsed: 120,
    remainingTermMonths: null,
    remainingTermCapApplied: false,
    noCapReason: "remaining-term-missing-or-invalid",
    mortgageSupportAmount: 240000
  }
});
assert.match(uncappedScenario.dimeHtml, /Remaining-term cap applied/);
assert.match(uncappedScenario.dimeHtml, /No/);
assert.match(uncappedScenario.dimeHtml, /No-cap reason/);
assert.match(uncappedScenario.dimeHtml, /Remaining term missing or invalid/);

const payoffScenario = renderScenario({ supportMode: false });
assert.match(payoffScenario.dimeHtml, /Prepared treated mortgage/);
assert.match(payoffScenario.needsHtml, /Prepared treated mortgage/);
assert.doesNotMatch(payoffScenario.dimeHtml, /Mortgage treatment mode/);
assert.doesNotMatch(payoffScenario.dimeHtml, /Mortgage support amount/);
assert.doesNotMatch(payoffScenario.needsHtml, /Mortgage treatment mode/);
assert.doesNotMatch(payoffScenario.needsHtml, /Mortgage support amount/);

assert.equal(
  /supportYearsRequested\s*\*/.test(readRepoFile("app/features/lens-analysis/step-three-analysis-display.js")),
  false,
  "Step 3 display should not calculate support months from support years."
);
assert.equal(
  /monthlyMortgagePaymentUsed\s*\*/.test(readRepoFile("app/features/lens-analysis/step-three-analysis-display.js")),
  false,
  "Step 3 display should not calculate mortgage support amount."
);

assertNoProtectedDiffs();

console.log("step-three-debt-treatment-display-check passed");
