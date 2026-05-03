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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFinalExpenseTrace() {
  return {
    key: "finalExpenses",
    label: "Final Expenses",
    value: 30000,
    sourcePaths: ["finalExpenses.totalFinalExpenseNeed"],
    inputs: {
      source: "final-expense-inflation-calculations",
      sourceMode: "expenseFacts-final-expense-components",
      currentFinalExpenseAmount: 30000,
      projectedFinalExpenseAmount: 30000,
      currentMedicalFinalExpenseAmount: 10000,
      projectedMedicalFinalExpenseAmount: 10000,
      currentNonMedicalFinalExpenseAmount: 20000,
      projectedNonMedicalFinalExpenseAmount: 20000,
      healthcareInflationRatePercent: 0,
      finalExpenseInflationRatePercent: 0,
      finalExpenseTargetAge: 85,
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "valid",
      valuationDate: "2026-01-01",
      valuationDateSource: "settings.valuationDate",
      valuationDateDefaulted: false,
      currentAge: 46,
      projectionYears: 0,
      applied: false,
      medicalApplied: false,
      nonMedicalApplied: false,
      reason: "current-dollar-final-expense",
      medicalReason: "current-dollar-final-expense",
      nonMedicalReason: "current-dollar-final-expense"
    }
  };
}

function createProjectedAssetGrowth(overrides = {}) {
  return {
    source: "asset-growth-projection-calculations",
    sourceMode: "reportingOnly",
    projectionMode: "reportingOnly",
    projectionYears: 12,
    projectionYearsSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.projectionYears",
    sourceModeSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode",
    consumptionStatus: "saved-only",
    consumedByMethods: false,
    currentTotalAssetValue: 450000,
    projectedTotalAssetValue: 831092.94,
    totalProjectedGrowthAmount: 381092.94,
    includedCategoryCount: 2,
    excludedCategoryCount: 1,
    reviewWarningCount: 1,
    includedCategories: [
      {
        categoryKey: "cashAndCashEquivalents",
        label: "Cash & Cash Equivalents",
        currentValue: 100000,
        assumedAnnualGrowthRatePercent: 2,
        projectionYears: 12,
        projectedValue: 126824.18,
        projectedGrowthAmount: 26824.18,
        reviewRequired: false,
        warnings: []
      },
      {
        categoryKey: "taxableBrokerageInvestments",
        label: "Taxable Brokerage / Investments",
        currentValue: 350000,
        assumedAnnualGrowthRatePercent: 6,
        projectionYears: 12,
        projectedValue: 704268.76,
        projectedGrowthAmount: 354268.76,
        reviewRequired: true,
        warnings: [
          {
            code: "asset-growth-review-only-category",
            message: "Asset growth assumption is review-only for this category."
          }
        ]
      }
    ],
    excludedCategories: [
      {
        categoryKey: "otherCustomAsset",
        label: "Other / Custom Asset",
        reason: "No asset treatment assumption exists for this category.",
        warningCode: "missing-asset-growth-assumption"
      }
    ],
    warnings: [
      {
        code: "asset-growth-projection-reporting-only",
        message: "Projected asset growth uses saved reporting-only projection years and is not consumed by current methods."
      },
      {
        code: "asset-growth-review-only-category",
        message: "Asset growth assumption is review-only for this category."
      }
    ],
    trace: null,
    ...overrides
  };
}

function createLensModel(projectedAssetGrowth) {
  return {
    projectedAssetGrowth,
    treatedAssetOffsets: {
      totalTreatedAssetValue: 345000,
      metadata: {
        consumedByMethods: true,
        assetOffsetSource: "treated"
      }
    }
  };
}

function createDimeResult() {
  return {
    method: "dime",
    label: "DIME Analysis",
    grossNeed: 111000,
    netCoverageGap: 111000,
    components: {
      debt: 10000,
      income: 90000,
      mortgage: 0,
      education: 11000
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

function createNeedsResult() {
  const finalExpenseTrace = createFinalExpenseTrace();
  return {
    method: "needsAnalysis",
    label: "Needs Analysis",
    grossNeed: 222000,
    netCoverageGap: 222000,
    components: {
      debtPayoff: 10000,
      essentialSupport: 150000,
      education: 32000,
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

function createHlvResult() {
  return {
    method: "humanLifeValue",
    label: "Simple Human Life Value",
    grossHumanLifeValue: 333000,
    netCoverageGap: 333000,
    components: {
      annualIncomeValue: 111000,
      projectionYears: 3,
      simpleHumanLifeValue: 333000
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

function renderScenario(projectedAssetGrowth) {
  const hosts = {
    "[data-step-three-dime-analysis]": { innerHTML: "" },
    "[data-step-three-needs-analysis]": { innerHTML: "" },
    "[data-step-three-human-life-value-analysis]": { innerHTML: "" }
  };
  const lensModel = createLensModel(projectedAssetGrowth);
  const lensModelBefore = cloneJson(lensModel);
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
            lensModel,
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
  assert.deepEqual(lensModel, lensModelBefore, "Step 3 display should not mutate lensModel.");

  return {
    dimeHtml: hosts["[data-step-three-dime-analysis]"].innerHTML,
    needsHtml: hosts["[data-step-three-needs-analysis]"].innerHTML,
    hlvHtml: hosts["[data-step-three-human-life-value-analysis]"].innerHTML
  };
}

const reportingScenario = renderScenario(createProjectedAssetGrowth());
assert.match(reportingScenario.needsHtml, /Projected Asset Growth — Reporting Only/);
assert.match(reportingScenario.needsHtml, /Reporting only; projected values are not used in current DIME, Needs, or HLV outputs/);
assert.match(reportingScenario.needsHtml, /Current output impact/);
assert.match(reportingScenario.needsHtml, /Reporting only \/ none; DIME, Needs, and HLV outputs are unaffected/);
assert.match(reportingScenario.needsHtml, /Current asset offsets remain current-dollar\/current treatment based/);
assert.match(reportingScenario.needsHtml, /Source mode/);
assert.match(reportingScenario.needsHtml, /Reporting only/);
assert.match(reportingScenario.needsHtml, /Projection mode/);
assert.match(reportingScenario.needsHtml, /Reporting-only projection/);
assert.match(reportingScenario.needsHtml, /Projection years/);
assert.match(reportingScenario.needsHtml, /12 years/);
assert.match(reportingScenario.needsHtml, /Current total asset value/);
assert.match(reportingScenario.needsHtml, /\$450,000/);
assert.match(reportingScenario.needsHtml, /Projected total asset value/);
assert.match(reportingScenario.needsHtml, /\$831,093/);
assert.match(reportingScenario.needsHtml, /Projected growth amount/);
assert.match(reportingScenario.needsHtml, /\$381,093/);
assert.match(reportingScenario.needsHtml, /Included category count/);
assert.match(reportingScenario.needsHtml, />2</);
assert.match(reportingScenario.needsHtml, /Excluded category count/);
assert.match(reportingScenario.needsHtml, />1</);
assert.match(reportingScenario.needsHtml, /Review warning count/);
assert.match(reportingScenario.needsHtml, />1</);
assert.match(reportingScenario.needsHtml, /Consumed by methods/);
assert.match(reportingScenario.needsHtml, />No</);
assert.match(reportingScenario.needsHtml, /Included Asset Growth Categories/);
assert.match(reportingScenario.needsHtml, /Cash &amp; Cash Equivalents/);
assert.match(reportingScenario.needsHtml, /2\.00% assumed annual growth/);
assert.match(reportingScenario.needsHtml, /Taxable Brokerage \/ Investments/);
assert.match(reportingScenario.needsHtml, /6\.00% assumed annual growth/);
assert.match(reportingScenario.needsHtml, /review warnings present/);
assert.match(reportingScenario.needsHtml, /Warning summary/);
assert.match(reportingScenario.needsHtml, /saved reporting-only projection years and is not consumed by current methods/);
assert.doesNotMatch(reportingScenario.needsHtml, /recommendation is reduced/i);
assert.doesNotMatch(reportingScenario.dimeHtml, /Projected Asset Growth/);
assert.doesNotMatch(reportingScenario.hlvHtml, /Projected Asset Growth/);
assert.match(reportingScenario.needsHtml, /Final Expense Projection/);

const currentDollarScenario = renderScenario(createProjectedAssetGrowth({
  sourceMode: "currentDollarOnly",
  projectionMode: "currentDollarOnly",
  projectionYears: 0,
  projectionYearsSource: "assetGrowthProjectionAssumptions.currentDollarOnly",
  projectedTotalAssetValue: 450000,
  totalProjectedGrowthAmount: 0,
  includedCategories: [
    {
      categoryKey: "cashAndCashEquivalents",
      label: "Cash & Cash Equivalents",
      currentValue: 100000,
      assumedAnnualGrowthRatePercent: 2,
      projectionYears: 0,
      projectedValue: 100000,
      projectedGrowthAmount: 0,
      reviewRequired: false,
      warnings: []
    }
  ],
  warnings: [
    {
      code: "asset-growth-projection-current-dollar-only",
      message: "Asset growth projection mode is current-dollar only; projected asset values use a 0-year current-dollar default."
    }
  ]
}));
assert.match(currentDollarScenario.needsHtml, /Current-dollar only; projection years 0 and no current output impact/);
assert.match(currentDollarScenario.needsHtml, /Projection years/);
assert.match(currentDollarScenario.needsHtml, /0 years/);

const projectedOffsetsScenario = renderScenario(createProjectedAssetGrowth({
  sourceMode: "projectedOffsets",
  projectionMode: "projectedOffsetsFutureInactive",
  projectionYears: 0,
  projectionYearsSource: "assetGrowthProjectionAssumptions.projectedOffsets-future-inactive",
  projectedTotalAssetValue: 450000,
  totalProjectedGrowthAmount: 0,
  warnings: [
    {
      code: "asset-growth-projected-offsets-future-inactive",
      message: "Projected offsets mode is saved for future use only and is not consumed by current methods."
    }
  ]
}));
assert.match(projectedOffsetsScenario.needsHtml, /Projected offsets - future \/ inactive/);
assert.match(projectedOffsetsScenario.needsHtml, /Projected offsets future\/inactive/);
assert.match(projectedOffsetsScenario.needsHtml, /Projected offsets mode is saved for future use only/);

assert.match(reportingScenario.dimeHtml, /\$111,000/);
assert.match(reportingScenario.needsHtml, /\$222,000/);
assert.match(reportingScenario.hlvHtml, /\$333,000/);

const source = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.equal(/Math\.pow/.test(source), false, "Step 3 should not calculate projected asset growth.");
assert.equal(/calculateAssetGrowthProjection/.test(source), false, "Step 3 should not call the asset growth projection helper.");
assert.equal(/calculateAssetTreatment/.test(source), false, "Step 3 should not call asset treatment calculations.");
assert.equal(/asset-treatment-calculations/.test(source), false, "Step 3 should not reference asset-treatment-calculations.");
assert.doesNotMatch(source, /projectedTotalAssetValue\s*=|totalProjectedGrowthAmount\s*=/);
assert.doesNotMatch(source, /projectedAssetGrowth\.projectedTotalAssetValue\s*[-+*/]/);
assert.doesNotMatch(source, /projectedAssetGrowth\.totalProjectedGrowthAmount\s*[-+*/]/);
assert.doesNotMatch(source, /method-active/i, "Step 3 should not present projected growth as method-active.");

console.log("step-three-asset-growth-reporting-display-check passed");
