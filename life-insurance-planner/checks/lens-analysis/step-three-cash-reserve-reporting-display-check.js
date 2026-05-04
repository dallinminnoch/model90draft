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
    projectionYears: 10,
    projectionYearsSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.projectionYears",
    sourceModeSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode",
    consumptionStatus: "saved-only",
    consumedByMethods: false,
    currentTotalAssetValue: 450000,
    projectedTotalAssetValue: 805317,
    totalProjectedGrowthAmount: 355317,
    includedCategoryCount: 1,
    excludedCategoryCount: 0,
    reviewWarningCount: 0,
    includedCategories: [
      {
        categoryKey: "taxableBrokerageInvestments",
        label: "Taxable Brokerage / Investments",
        currentValue: 450000,
        assumedAnnualGrowthRatePercent: 6,
        projectionYears: 10,
        projectedValue: 805317,
        projectedGrowthAmount: 355317,
        reviewRequired: false,
        warnings: []
      }
    ],
    excludedCategories: [],
    warnings: [
      {
        code: "asset-growth-projection-reporting-only",
        message: "Projected asset growth uses saved reporting-only projection years and is not consumed by current methods."
      }
    ],
    trace: null,
    ...overrides
  };
}

function createCashReserveProjection(overrides = {}) {
  return {
    source: "cash-reserve-calculations",
    calculationVersion: 1,
    applied: true,
    enabled: true,
    consumedByMethods: false,
    consumptionStatus: "saved-only",
    mode: "reportingOnly",
    reserveMethod: "monthsOfEssentialExpenses",
    reserveMonths: 6,
    fixedReserveAmount: 0,
    expenseBasis: "essentialSupport",
    monthlyReserveBasis: 5000,
    requiredReserveAmount: 30000,
    applyToAssetScope: "cashAndCashEquivalents",
    excludeEmergencyFundAssets: true,
    includeHealthcareExpenses: false,
    includeDiscretionaryExpenses: false,
    totalCashEquivalentValue: 70000,
    totalExplicitEmergencyFundValue: 10000,
    totalRestrictedOrEscrowedCashValue: 6000,
    totalBusinessReserveValue: 7000,
    emergencyFundReservedAmount: 10000,
    remainingReserveNeededAfterEmergencyFund: 20000,
    cashAvailableAboveReserve: 50000,
    totalReservedAmount: 30000,
    totalAvailableAfterReserve: 50000,
    includedAssets: [
      {
        assetFactId: "asset_record_hysa",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "highYieldSavingsAccount",
        label: "High-Yield Savings",
        value: 20000,
        reserveRole: "cashEquivalent",
        reserveTreatmentDefault: "availableAboveReserve",
        reservedByDefault: false,
        reserveReviewRequired: false,
        classification: "cash-equivalent",
        warnings: []
      },
      {
        assetFactId: "asset_record_emergency",
        categoryKey: "emergencyFund",
        typeKey: "emergencyFundReserve",
        label: "Emergency Fund",
        value: 10000,
        reserveRole: "emergencyReserve",
        reserveTreatmentDefault: "preserveAsReserve",
        reservedByDefault: true,
        reserveReviewRequired: true,
        classification: "explicit-emergency-reserve",
        warnings: [
          {
            code: "cash-reserve-emergency-fund-preserved",
            message: "Emergency fund assets are preserved by default for cash reserve reporting."
          }
        ]
      }
    ],
    excludedAssets: [
      {
        assetFactId: "asset_record_escrow",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "escrowedCash",
        label: "Escrowed Cash",
        value: 6000,
        reserveRole: "escrowedRestricted",
        reserveTreatmentDefault: "excluded",
        reservedByDefault: true,
        reserveReviewRequired: true,
        classification: "restricted-or-escrowed",
        warnings: [
          {
            code: "cash-reserve-restricted-cash-excluded",
            message: "Restricted or escrowed cash was excluded from reserve-available cash."
          }
        ]
      }
    ],
    reviewAssets: [
      {
        assetFactId: "asset_record_business_reserve",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "businessCashReserve",
        label: "Business Cash Reserve",
        value: 7000,
        reserveRole: "businessReserve",
        reserveTreatmentDefault: "review",
        reservedByDefault: true,
        reserveReviewRequired: true,
        classification: "business-reserve-review",
        warnings: [
          {
            code: "cash-reserve-business-reserve-review-required",
            message: "Business cash reserves require advisor review before offset use."
          }
        ]
      }
    ],
    warnings: [
      {
        code: "cash-reserve-projection-reporting-only",
        message: "Cash reserve projection is reporting-only and not consumed by current methods."
      },
      {
        code: "cash-reserve-emergency-fund-preserved",
        message: "Emergency fund assets are preserved by default for cash reserve reporting."
      }
    ],
    valuationDate: "2026-05-03",
    valuationDateSource: "analysisSettings.valuationDate",
    trace: {
      consumedByMethods: false,
      consumptionStatus: "saved-only"
    },
    ...overrides
  };
}

function createLensModel(cashReserveProjection) {
  return {
    cashReserveProjection,
    projectedAssetGrowth: createProjectedAssetGrowth(),
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

function renderScenario(cashReserveProjection) {
  const hosts = {
    "[data-step-three-dime-analysis]": { innerHTML: "" },
    "[data-step-three-needs-analysis]": { innerHTML: "" },
    "[data-step-three-human-life-value-analysis]": { innerHTML: "" }
  };
  const lensModel = createLensModel(cashReserveProjection);
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
    hlvHtml: hosts["[data-step-three-human-life-value-analysis]"].innerHTML,
    lensModel
  };
}

const monthsScenario = renderScenario(createCashReserveProjection());
assert.match(monthsScenario.needsHtml, /Cash Reserve Projection/);
assert.match(monthsScenario.needsHtml, /Reporting Only/);
assert.match(monthsScenario.needsHtml, /Reporting only; reserve values are not used in current DIME, Needs, or HLV outputs/);
assert.match(monthsScenario.needsHtml, /Reporting only \/ none; DIME, Needs, and HLV outputs are unaffected/);
assert.match(monthsScenario.needsHtml, /Current asset offsets remain current-dollar\/current treatment based/);
assert.match(monthsScenario.needsHtml, /Not active in current methods; no recommendation is reduced by cash reserve projection/);
assert.match(monthsScenario.needsHtml, /Status \/ enabled state/);
assert.match(monthsScenario.needsHtml, /Reserve method/);
assert.match(monthsScenario.needsHtml, /Months of essential expenses/);
assert.match(monthsScenario.needsHtml, /Expense basis/);
assert.match(monthsScenario.needsHtml, /Essential support only/);
assert.match(monthsScenario.needsHtml, /Monthly reserve basis/);
assert.match(monthsScenario.needsHtml, /\$5,000/);
assert.match(monthsScenario.needsHtml, /Reserve months/);
assert.match(monthsScenario.needsHtml, /6 months/);
assert.match(monthsScenario.needsHtml, /Required reserve amount/);
assert.match(monthsScenario.needsHtml, /\$30,000/);
assert.match(monthsScenario.needsHtml, /Emergency fund reserved/);
assert.match(monthsScenario.needsHtml, /\$10,000/);
assert.match(monthsScenario.needsHtml, /Cash equivalent value/);
assert.match(monthsScenario.needsHtml, /\$70,000/);
assert.match(monthsScenario.needsHtml, /Cash available above reserve/);
assert.match(monthsScenario.needsHtml, /\$50,000/);
assert.match(monthsScenario.needsHtml, /Total reserved amount/);
assert.match(monthsScenario.needsHtml, /Total available after reserve/);
assert.match(monthsScenario.needsHtml, /Exclude emergency fund assets/);
assert.match(monthsScenario.needsHtml, />Yes</);
assert.match(monthsScenario.needsHtml, /Apply-to asset scope/);
assert.match(monthsScenario.needsHtml, /Cash and cash equivalents/);
assert.match(monthsScenario.needsHtml, /Consumed by methods/);
assert.match(monthsScenario.needsHtml, />No</);
assert.match(monthsScenario.needsHtml, /Warning summary/);
assert.match(monthsScenario.needsHtml, /Cash reserve projection is reporting-only and not consumed by current methods/);
assert.match(monthsScenario.needsHtml, /Emergency fund assets are preserved by default/);
assert.match(monthsScenario.needsHtml, /Cash Reserve Included Assets/);
assert.match(monthsScenario.needsHtml, /High-Yield Savings/);
assert.match(monthsScenario.needsHtml, /cash-equivalent/);
assert.match(monthsScenario.needsHtml, /Emergency Fund/);
assert.match(monthsScenario.needsHtml, /explicit-emergency-reserve/);
assert.match(monthsScenario.needsHtml, /Cash Reserve Excluded Assets/);
assert.match(monthsScenario.needsHtml, /Escrowed Cash/);
assert.match(monthsScenario.needsHtml, /restricted-or-escrowed/);
assert.match(monthsScenario.needsHtml, /Cash Reserve Review Assets/);
assert.match(monthsScenario.needsHtml, /Business Cash Reserve/);
assert.match(monthsScenario.needsHtml, /business-reserve-review/);
assert.match(monthsScenario.needsHtml, /Projected Asset Growth/);
assert.match(monthsScenario.dimeHtml, /\$111,000/);
assert.match(monthsScenario.needsHtml, /\$222,000/);
assert.match(monthsScenario.hlvHtml, /\$333,000/);
assert.deepEqual(
  monthsScenario.lensModel.treatedAssetOffsets,
  createLensModel(createCashReserveProjection()).treatedAssetOffsets,
  "Step 3 display should leave treatedAssetOffsets unchanged."
);
assert.deepEqual(
  monthsScenario.lensModel.projectedAssetGrowth,
  createProjectedAssetGrowth(),
  "Step 3 display should leave projectedAssetGrowth unchanged."
);
assert.doesNotMatch(monthsScenario.dimeHtml, /Cash Reserve Projection/);
assert.doesNotMatch(monthsScenario.hlvHtml, /Cash Reserve Projection/);

const disabledScenario = renderScenario(createCashReserveProjection({
  applied: false,
  enabled: false,
  monthlyReserveBasis: 0,
  requiredReserveAmount: 0,
  emergencyFundReservedAmount: 0,
  cashAvailableAboveReserve: 0,
  totalReservedAmount: 0,
  totalAvailableAfterReserve: 0,
  includedAssets: [],
  excludedAssets: [],
  reviewAssets: [],
  warnings: [
    {
      code: "cash-reserve-projection-disabled",
      message: "Cash reserve assumptions are disabled; projection is retained as reporting-only trace."
    }
  ]
}));
assert.match(disabledScenario.needsHtml, /Disabled; reporting-only trace and no current output impact/);
assert.match(disabledScenario.needsHtml, /Cash reserve assumptions are disabled/);
assert.doesNotMatch(disabledScenario.needsHtml, /Cash Reserve Included Assets/);

const fixedDollarScenario = renderScenario(createCashReserveProjection({
  reserveMethod: "fixedDollarAmount",
  reserveMonths: 0,
  fixedReserveAmount: 25000,
  monthlyReserveBasis: 0,
  requiredReserveAmount: 25000,
  remainingReserveNeededAfterEmergencyFund: 15000,
  cashAvailableAboveReserve: 55000,
  totalReservedAmount: 25000,
  totalAvailableAfterReserve: 55000
}));
assert.match(fixedDollarScenario.needsHtml, /Fixed dollar amount/);
assert.match(fixedDollarScenario.needsHtml, /Fixed reserve amount/);
assert.match(fixedDollarScenario.needsHtml, /\$25,000/);
assert.doesNotMatch(fixedDollarScenario.needsHtml, /Reserve months/);

const futureModeScenario = renderScenario(createCashReserveProjection({
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  fixedReserveAmount: 30000,
  requiredReserveAmount: 30000,
  warnings: [
    {
      code: "method-active-future-inactive",
      message: "Cash reserve method-active future mode is inactive and not consumed by current methods."
    }
  ]
}));
assert.match(futureModeScenario.needsHtml, /Future method activation inactive/);
assert.match(futureModeScenario.needsHtml, /Future method activation is inactive; reserve values are reporting only and not used in current outputs/);
assert.match(futureModeScenario.needsHtml, /method-active future mode is inactive/);
assert.match(futureModeScenario.needsHtml, />No</);

const source = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
const cashReserveStart = source.indexOf("function formatCashReserveMode");
const cashReserveEnd = source.indexOf("function formatFinalExpenseSourceMode");
assert.ok(cashReserveStart >= 0, "cash reserve display helpers should exist.");
assert.ok(cashReserveEnd > cashReserveStart, "cash reserve display slice should end before final expense helpers.");
const cashReserveDisplaySource = source.slice(cashReserveStart, cashReserveEnd);
assert.doesNotMatch(
  cashReserveDisplaySource,
  /calculateCashReserveProjection|cash-reserve-calculations/,
  "Step 3 cash reserve display should not call or import the cash reserve helper."
);
assert.doesNotMatch(
  cashReserveDisplaySource,
  /calculateAssetTreatment|asset-treatment-calculations/,
  "Step 3 cash reserve display should not call asset treatment calculations."
);
assert.doesNotMatch(
  cashReserveDisplaySource,
  /calculateAssetGrowthProjection|asset-growth-projection-calculations/,
  "Step 3 cash reserve display should not call asset growth calculations."
);
assert.doesNotMatch(
  cashReserveDisplaySource,
  /Math\.(max|min|pow)|remainingReserveNeededAfterEmergencyFund\s*=|cashAvailableAboveReserve\s*=|totalReservedAmount\s*=/,
  "Step 3 cash reserve display should not perform reserve calculations."
);
assert.doesNotMatch(
  cashReserveDisplaySource,
  /consumedByMethods:\s*true|reserveAdjusted|methodConsumedReserve/,
  "Step 3 cash reserve display should not present cash reserve projection as method-active."
);

console.log("step-three-cash-reserve-reporting-display-check passed");
