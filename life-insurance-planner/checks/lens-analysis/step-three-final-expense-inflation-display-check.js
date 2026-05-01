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

function createFinalExpenseTrace(overrides = {}) {
  const projectedFinalExpenseAmount = overrides.projectedFinalExpenseAmount ?? 130390;
  return {
    key: "finalExpenses",
    label: "Final Expenses",
    formula: overrides.applied === false
      ? "current-dollar final expense buckets"
      : "medical final expense projected by healthcare inflation plus non-medical final expense projected by final expense inflation",
    value: projectedFinalExpenseAmount,
    sourcePaths: [
      "protectionModeling.data.medicalEndOfLifeCosts",
      "protectionModeling.data.funeralBurialEstimate",
      "settings.inflationAssumptions.healthcareInflationRatePercent",
      "settings.inflationAssumptions.finalExpenseInflationRatePercent",
      "settings.inflationAssumptions.finalExpenseTargetAge",
      "profileFacts.clientDateOfBirth",
      "settings.valuationDate"
    ],
    inputs: {
      source: "final-expense-inflation-calculations",
      sourceMode: "expenseFacts-final-expense-components",
      currentFinalExpenseAmount: 30000,
      projectedFinalExpenseAmount,
      currentMedicalFinalExpenseAmount: 10000,
      projectedMedicalFinalExpenseAmount: 67040,
      currentNonMedicalFinalExpenseAmount: 20000,
      projectedNonMedicalFinalExpenseAmount: 63350,
      totalFinalExpenseNeed: 30000,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "valid",
      valuationDate: "2026-01-01",
      valuationDateSource: "settings.valuationDate",
      valuationDateDefaulted: false,
      currentAge: 46,
      projectionYears: 39,
      applied: true,
      medicalApplied: true,
      nonMedicalApplied: true,
      reason: "final-expense-bucket-inflation-applied",
      warningCode: null,
      medicalReason: "final-expense-bucket-inflation-applied",
      medicalWarningCode: null,
      nonMedicalReason: "final-expense-bucket-inflation-applied",
      nonMedicalWarningCode: null,
      healthcareRateSourcePath: "settings.inflationAssumptions.healthcareInflationRatePercent",
      finalExpenseRateSourcePath: "settings.inflationAssumptions.finalExpenseInflationRatePercent",
      targetAgeSourcePath: "settings.inflationAssumptions.finalExpenseTargetAge",
      ...overrides
    }
  };
}

function createNeedsResult(finalExpenseTrace) {
  return {
    method: "needsAnalysis",
    label: "Needs Analysis",
    grossNeed: finalExpenseTrace.value,
    netCoverageGap: finalExpenseTrace.value,
    components: {
      debtPayoff: 0,
      essentialSupport: 0,
      education: 0,
      finalExpenses: finalExpenseTrace.value,
      transitionNeeds: 0,
      discretionarySupport: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      survivorIncomeOffset: 0,
      totalOffset: 0
    },
    assumptions: {},
    warnings: [],
    trace: [finalExpenseTrace]
  };
}

function createDimeResult() {
  return {
    method: "dime",
    label: "DIME Analysis",
    grossNeed: 0,
    netCoverageGap: 0,
    components: {
      debt: 0,
      income: 0,
      mortgage: 0,
      education: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {},
    warnings: [],
    trace: []
  };
}

function createHlvResult() {
  return {
    method: "humanLifeValue",
    label: "Simple Human Life Value",
    grossHumanLifeValue: 0,
    netCoverageGap: 0,
    components: {
      annualIncomeValue: 0,
      projectionYears: 0,
      simpleHumanLifeValue: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    assumptions: {},
    warnings: [],
    trace: []
  };
}

function renderScenario(finalExpenseTrace) {
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
            return createNeedsResult(finalExpenseTrace);
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

const appliedScenario = renderScenario(createFinalExpenseTrace());
assert.match(appliedScenario.needsHtml, /Final Expense Projection/);
assert.match(appliedScenario.needsHtml, /Inflation status/);
assert.match(appliedScenario.needsHtml, /Applied/);
assert.match(appliedScenario.needsHtml, /Combined final expense used/);
assert.match(appliedScenario.needsHtml, /\$130,390/);
assert.match(appliedScenario.needsHtml, /Current-dollar total/);
assert.match(appliedScenario.needsHtml, /\$30,000/);
assert.match(appliedScenario.needsHtml, /Medical final expense current/);
assert.match(appliedScenario.needsHtml, /\$10,000/);
assert.match(appliedScenario.needsHtml, /Medical final expense projected/);
assert.match(appliedScenario.needsHtml, /\$67,040/);
assert.match(appliedScenario.needsHtml, /Healthcare inflation rate/);
assert.match(appliedScenario.needsHtml, /5\.00% healthcare inflation/);
assert.match(appliedScenario.needsHtml, /Non-medical final expense current/);
assert.match(appliedScenario.needsHtml, /\$20,000/);
assert.match(appliedScenario.needsHtml, /Non-medical final expense projected/);
assert.match(appliedScenario.needsHtml, /\$63,350/);
assert.match(appliedScenario.needsHtml, /Final expense inflation rate/);
assert.match(appliedScenario.needsHtml, /3\.00% final expense inflation/);
assert.match(appliedScenario.needsHtml, /Source mode/);
assert.match(appliedScenario.needsHtml, /expenseFacts final expense components/);
assert.match(appliedScenario.needsHtml, /Target age/);
assert.match(appliedScenario.needsHtml, /85/);
assert.match(appliedScenario.needsHtml, /Client DOB status\/source/);
assert.match(appliedScenario.needsHtml, /Valid: 1980-01-01 \(profileRecord.dateOfBirth\)/);
assert.match(appliedScenario.needsHtml, /Planning as-of date/);
assert.match(appliedScenario.needsHtml, /2026-01-01/);
assert.match(appliedScenario.needsHtml, /Current age/);
assert.match(appliedScenario.needsHtml, /46/);
assert.match(appliedScenario.needsHtml, /Projection years/);
assert.match(appliedScenario.needsHtml, /39 years/);
assert.doesNotMatch(appliedScenario.needsHtml, /ongoingHealthcare/);
assert.doesNotMatch(appliedScenario.needsHtml, /Medical Out-of-Pocket/);
assert.doesNotMatch(appliedScenario.dimeHtml, /Final Expense Projection/);
assert.doesNotMatch(appliedScenario.hlvHtml, /Final Expense Projection/);

const disabledScenario = renderScenario(createFinalExpenseTrace({
  projectedFinalExpenseAmount: 30000,
  value: 30000,
  applied: false,
  medicalApplied: false,
  nonMedicalApplied: false,
  projectedMedicalFinalExpenseAmount: 10000,
  projectedNonMedicalFinalExpenseAmount: 20000,
  reason: "inflation-assumptions-disabled",
  warningCode: "final-expense-inflation-disabled",
  medicalReason: "inflation-assumptions-disabled",
  nonMedicalReason: "inflation-assumptions-disabled",
  projectionYears: 0
}));
assert.match(disabledScenario.needsHtml, /Final Expense Projection/);
assert.match(disabledScenario.needsHtml, /Disabled/);
assert.match(disabledScenario.needsHtml, /Reason/);
assert.match(disabledScenario.needsHtml, /Inflation assumptions disabled/);

const missingDobScenario = renderScenario(createFinalExpenseTrace({
  projectedFinalExpenseAmount: 30000,
  value: 30000,
  applied: false,
  medicalApplied: false,
  nonMedicalApplied: false,
  projectedMedicalFinalExpenseAmount: 10000,
  projectedNonMedicalFinalExpenseAmount: 20000,
  clientDateOfBirth: null,
  clientDateOfBirthSourcePath: null,
  clientDateOfBirthStatus: "missing",
  currentAge: null,
  projectionYears: 0,
  reason: "client-date-of-birth-missing",
  medicalReason: "client-date-of-birth-missing",
  nonMedicalReason: "client-date-of-birth-missing",
  warningCode: "missing-client-date-of-birth"
}));
assert.match(missingDobScenario.needsHtml, /Current-dollar/);
assert.match(missingDobScenario.needsHtml, /Missing/);
assert.match(missingDobScenario.needsHtml, /Client date of birth missing/);

const partialScenario = renderScenario(createFinalExpenseTrace({
  projectedFinalExpenseAmount: 34951.44,
  projectedMedicalFinalExpenseAmount: 10000,
  projectedNonMedicalFinalExpenseAmount: 24951.44,
  applied: true,
  medicalApplied: false,
  nonMedicalApplied: true,
  reason: "partial-final-expense-bucket-inflation-applied",
  medicalReason: "healthcare-inflation-rate-unavailable",
  medicalWarningCode: "invalid-healthcare-inflation-rate"
}));
assert.match(partialScenario.needsHtml, /Partially applied/);
assert.match(partialScenario.needsHtml, /Medical reason/);
assert.match(partialScenario.needsHtml, /Healthcare inflation rate unavailable/);

const fallbackScenario = renderScenario(createFinalExpenseTrace({
  sourceMode: "finalExpenses-fallback"
}));
assert.match(fallbackScenario.needsHtml, /finalExpenses fallback/);

const targetAgeNotGreaterScenario = renderScenario(createFinalExpenseTrace({
  projectedFinalExpenseAmount: 30000,
  value: 30000,
  applied: false,
  medicalApplied: false,
  nonMedicalApplied: false,
  projectedMedicalFinalExpenseAmount: 10000,
  projectedNonMedicalFinalExpenseAmount: 20000,
  finalExpenseTargetAge: 40,
  currentAge: 46,
  projectionYears: 0,
  reason: "target-age-not-greater-than-current-age",
  medicalReason: "target-age-not-greater-than-current-age",
  nonMedicalReason: "target-age-not-greater-than-current-age",
  warningCode: "final-expense-target-age-not-greater-than-current-age"
}));
assert.match(targetAgeNotGreaterScenario.needsHtml, /Target age not greater than current age/);
assert.match(targetAgeNotGreaterScenario.needsHtml, /Projection years/);
assert.match(targetAgeNotGreaterScenario.needsHtml, /0 years/);

const source = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.equal(/Math\.pow/.test(source), false, "Step 3 should not calculate final expense projection.");
assert.equal(/healthcareInflationRatePercent\s*\/\s*100/.test(source), false, "Step 3 should not calculate healthcare inflation factors.");
assert.equal(/finalExpenseInflationRatePercent\s*\/\s*100/.test(source), false, "Step 3 should not calculate final expense inflation factors.");
assert.equal(/calculateFinalExpenseBucketInflationProjection/.test(source), false, "Step 3 should not call the split final expense helper.");
assert.equal(/calculateFinalExpenseInflationProjection/.test(source), false, "Step 3 should not call the legacy final expense helper.");

console.log("step-three-final-expense-inflation-display-check passed");
