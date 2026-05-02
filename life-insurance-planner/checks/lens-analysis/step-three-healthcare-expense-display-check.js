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

function createFinalExpenseTrace() {
  return {
    key: "finalExpenses",
    label: "Final Expenses",
    formula: "medical final expense projected by healthcare inflation plus non-medical final expense projected by final expense inflation",
    value: 130390,
    sourcePaths: ["finalExpenses.totalFinalExpenseNeed"],
    inputs: {
      source: "final-expense-inflation-calculations",
      sourceMode: "expenseFacts-final-expense-components",
      currentFinalExpenseAmount: 30000,
      projectedFinalExpenseAmount: 130390,
      currentMedicalFinalExpenseAmount: 10000,
      projectedMedicalFinalExpenseAmount: 67040,
      currentNonMedicalFinalExpenseAmount: 20000,
      projectedNonMedicalFinalExpenseAmount: 63350,
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
      nonMedicalWarningCode: null
    }
  };
}

function createHealthcareExpenseTrace(overrides = {}) {
  return {
    key: "healthcareExpenses",
    label: "Healthcare Expenses",
    formula: "healthcare expense projection helper for eligible non-final healthcare expense records",
    value: overrides.projectedHealthcareExpenseAmount ?? 3272,
    sourcePaths: [
      "settings.healthcareExpenseAssumptions",
      "settings.inflationAssumptions.healthcareInflationRatePercent",
      "expenseFacts.expenses"
    ],
    inputs: {
      source: "healthcare-expense-inflation-calculations",
      applied: true,
      enabled: true,
      projectedHealthcareExpenseAmount: 3272,
      projectedRecurringHealthcareExpenseAmount: 2772,
      includedOneTimeHealthcareExpenseAmount: 500,
      currentAnnualHealthcareExpenseAmount: 1200,
      healthcareInflationRatePercent: 10,
      healthcareInflationApplied: true,
      projectionYears: 2,
      projectionYearsSource: "healthcareExpenseAssumptions.projectionYears",
      includeOneTimeHealthcareExpenses: true,
      oneTimeProjectionMode: "currentDollarOnly",
      includedRecordCount: 2,
      excludedRecordCount: 3,
      includedBuckets: ["ongoingHealthcare", "medicalEquipment"],
      excludedBuckets: ["medicalFinalExpense", "livingExpense"],
      includedRecords: [
        {
          expenseFactId: "expense_record_medicalOutOfPocket",
          typeKey: "medicalOutOfPocket",
          categoryKey: "ongoingHealthcare",
          label: "Medical Out-of-Pocket",
          annualizedAmount: 1200,
          durationYears: 2,
          durationSource: "healthcareExpenseAssumptions.projectionYears",
          projectedAmount: 2772
        },
        {
          expenseFactId: "expense_record_adaptiveEquipment",
          typeKey: "adaptiveEquipment",
          categoryKey: "medicalEquipment",
          label: "Adaptive Equipment",
          oneTimeAmount: 500,
          durationYears: 0,
          durationSource: "oneTime-current-dollar",
          projectedAmount: 500
        }
      ],
      excludedRecords: [],
      warnings: [
        {
          code: "healthcare-expense-overlap-review",
          message: "Entered healthcare expense records may overlap existing household healthcare or out-of-pocket support; review before relying on the Needs healthcareExpenses component.",
          severity: "info"
        }
      ],
      warningCount: 1,
      reason: null,
      warningCode: null,
      valuationDate: "2026-01-01",
      valuationDateSource: "settings.valuationDate",
      valuationDateDefaulted: false,
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthStatus: "valid",
      ...overrides
    }
  };
}

function createNeedsResult(healthcareExpenseTrace) {
  const finalExpenseTrace = createFinalExpenseTrace();
  return {
    method: "needsAnalysis",
    label: "Needs Analysis",
    grossNeed: finalExpenseTrace.value + (healthcareExpenseTrace?.value || 0),
    netCoverageGap: finalExpenseTrace.value + (healthcareExpenseTrace?.value || 0),
    components: {
      debtPayoff: 0,
      essentialSupport: 0,
      education: 0,
      finalExpenses: finalExpenseTrace.value,
      healthcareExpenses: healthcareExpenseTrace?.value || 0,
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
    trace: healthcareExpenseTrace
      ? [finalExpenseTrace, healthcareExpenseTrace]
      : [finalExpenseTrace]
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

function renderScenario(healthcareExpenseTrace) {
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
            return createNeedsResult(healthcareExpenseTrace);
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

const appliedScenario = renderScenario(createHealthcareExpenseTrace());
assert.match(appliedScenario.needsHtml, /Healthcare Expense Projection/);
assert.match(appliedScenario.needsHtml, /Inclusion status/);
assert.match(appliedScenario.needsHtml, /Applied/);
assert.match(appliedScenario.needsHtml, /Healthcare expense amount used/);
assert.match(appliedScenario.needsHtml, /\$3,272/);
assert.match(appliedScenario.needsHtml, /Current annual healthcare expense/);
assert.match(appliedScenario.needsHtml, /\$1,200/);
assert.match(appliedScenario.needsHtml, /Projected recurring healthcare need/);
assert.match(appliedScenario.needsHtml, /\$2,772/);
assert.match(appliedScenario.needsHtml, /One-time healthcare amount included/);
assert.match(appliedScenario.needsHtml, /\$500/);
assert.match(appliedScenario.needsHtml, /Healthcare inflation rate/);
assert.match(appliedScenario.needsHtml, /10\.00% healthcare inflation/);
assert.match(appliedScenario.needsHtml, /Projection years/);
assert.match(appliedScenario.needsHtml, /2 years/);
assert.match(appliedScenario.needsHtml, /Projection years source/);
assert.match(appliedScenario.needsHtml, /healthcareExpenseAssumptions\.projectionYears/);
assert.match(appliedScenario.needsHtml, /Include one-time healthcare expenses/);
assert.match(appliedScenario.needsHtml, /Yes/);
assert.match(appliedScenario.needsHtml, /One-time projection mode/);
assert.match(appliedScenario.needsHtml, /currentDollarOnly/);
assert.match(appliedScenario.needsHtml, /Included record count/);
assert.match(appliedScenario.needsHtml, />2</);
assert.match(appliedScenario.needsHtml, /Excluded record count/);
assert.match(appliedScenario.needsHtml, />3</);
assert.match(appliedScenario.needsHtml, /Included buckets/);
assert.match(appliedScenario.needsHtml, /ongoingHealthcare, medicalEquipment/);
assert.match(appliedScenario.needsHtml, /Excluded buckets/);
assert.match(appliedScenario.needsHtml, /medicalFinalExpense, livingExpense/);
assert.match(appliedScenario.needsHtml, /Warning\/reason summary/);
assert.match(appliedScenario.needsHtml, /None/);
assert.match(appliedScenario.needsHtml, /Overlap warning/);
assert.match(appliedScenario.needsHtml, /overlap existing household healthcare or out-of-pocket support/);
assert.doesNotMatch(appliedScenario.dimeHtml, /Healthcare Expense Projection/);
assert.doesNotMatch(appliedScenario.hlvHtml, /Healthcare Expense Projection/);
assert.match(appliedScenario.needsHtml, /Final Expense Projection/);

const disabledScenario = renderScenario(createHealthcareExpenseTrace({
  applied: false,
  enabled: false,
  projectedHealthcareExpenseAmount: 0,
  projectedRecurringHealthcareExpenseAmount: 0,
  includedOneTimeHealthcareExpenseAmount: 0,
  currentAnnualHealthcareExpenseAmount: 0,
  healthcareInflationApplied: false,
  includedRecordCount: 0,
  excludedRecordCount: 1,
  includedBuckets: [],
  excludedBuckets: ["ongoingHealthcare"],
  warnings: [],
  warningCount: 0,
  reason: "Healthcare expense assumptions are disabled.",
  warningCode: "healthcare-expense-assumptions-disabled"
}));
assert.match(disabledScenario.needsHtml, /Healthcare Expense Projection/);
assert.match(disabledScenario.needsHtml, /Disabled/);
assert.match(disabledScenario.needsHtml, /\$0/);
assert.match(disabledScenario.needsHtml, /Healthcare expense assumptions are disabled/);

const currentDollarScenario = renderScenario(createHealthcareExpenseTrace({
  applied: true,
  enabled: true,
  projectedHealthcareExpenseAmount: 2400,
  projectedRecurringHealthcareExpenseAmount: 2400,
  includedOneTimeHealthcareExpenseAmount: 0,
  healthcareInflationApplied: false,
  healthcareInflationRatePercent: null,
  warnings: [
    {
      code: "invalid-healthcare-inflation-rate-current-dollar",
      message: "Healthcare inflation rate was missing or invalid; recurring healthcare expenses used current-dollar projection."
    }
  ],
  warningCount: 1,
  reason: null,
  warningCode: null
}));
assert.match(currentDollarScenario.needsHtml, /Current-dollar/);
assert.match(currentDollarScenario.needsHtml, /recurring healthcare expenses used current-dollar projection/);

const warningScenario = renderScenario(createHealthcareExpenseTrace({
  applied: false,
  enabled: true,
  projectedHealthcareExpenseAmount: 0,
  projectedRecurringHealthcareExpenseAmount: 0,
  includedOneTimeHealthcareExpenseAmount: 0,
  currentAnnualHealthcareExpenseAmount: 0,
  healthcareInflationApplied: true,
  includedRecordCount: 0,
  excludedRecordCount: 3,
  includedBuckets: [],
  excludedBuckets: ["medicalFinalExpense", "livingExpense"],
  warnings: [],
  warningCount: 0,
  reason: "No eligible healthcare expense records were included.",
  warningCode: "no-eligible-healthcare-expense-records"
}));
assert.match(warningScenario.needsHtml, /Warning/);
assert.match(warningScenario.needsHtml, /No eligible healthcare expense records were included/);

const source = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.equal(/Math\.pow/.test(source), false, "Step 3 should not calculate healthcare expense projection.");
assert.equal(/calculateHealthcareExpenseProjection/.test(source), false, "Step 3 should not call the healthcare expense projection helper.");
assert.equal(/healthcareInflationRatePercent\s*\/\s*100/.test(source), false, "Step 3 should not calculate healthcare inflation factors.");
assert.equal(/inflationFactor/i.test(source), false, "Step 3 should not calculate inflation factors.");

console.log("step-three-healthcare-expense-display-check passed");
