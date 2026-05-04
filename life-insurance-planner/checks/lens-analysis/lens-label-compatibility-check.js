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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLensAnalysisContext() {
  const context = {
    console,
    window: null,
    document: {
      addEventListener() {}
    },
    Intl,
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createStepThreeContext(lensModel, methodSettings) {
  const hosts = {
    "[data-step-three-dime-analysis]": { innerHTML: "" },
    "[data-step-three-needs-analysis]": { innerHTML: "" },
    "[data-step-three-human-life-value-analysis]": { innerHTML: "" }
  };
  let readyCallback = null;
  const profileRecord = {
    id: "lens-label-compatibility-profile",
    displayName: "LENS Label Compatibility",
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
            return cloneJson(methodSettings);
          }
        },
        analysisMethods: createLensAnalysisContext().LensApp.lensAnalysis.analysisMethods
      }
    }
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  loadScript(context, "app/features/lens-analysis/step-three-analysis-display.js");
  assert.equal(typeof readyCallback, "function", "Step 3 display should register DOMContentLoaded.");
  readyCallback();

  return {
    dimeHtml: hosts["[data-step-three-dime-analysis]"].innerHTML,
    needsHtml: hosts["[data-step-three-needs-analysis]"].innerHTML,
    hlvHtml: hosts["[data-step-three-human-life-value-analysis]"].innerHTML
  };
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirthStatus: "missing"
    },
    incomeBasis: {
      annualIncomeReplacementBase: 100000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 10000,
      mortgageBalance: 50000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 12000
    },
    educationSupport: {
      totalEducationFundingNeed: 20000
    },
    finalExpenses: {
      totalFinalExpenseNeed: 10000
    },
    transitionNeeds: {
      totalTransitionNeed: 5000
    },
    existingCoverage: {
      totalExistingCoverage: 100000
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 100000,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 25000,
      metadata: {
        consumedByMethods: true
      }
    },
    projectedAssetGrowth: {
      source: "asset-growth-projection-calculations",
      sourceMode: "reportingOnly",
      projectionMode: "reportingOnly",
      projectionYears: 5,
      projectionYearsSource: "assetGrowthProjectionAssumptions",
      currentTotalAssetValue: 25000,
      projectedTotalAssetValue: 30000,
      totalProjectedGrowthAmount: 5000,
      includedCategoryCount: 1,
      excludedCategoryCount: 0,
      reviewWarningCount: 0,
      consumedByMethods: false,
      includedCategories: [
        {
          label: "Taxable Brokerage / Investments",
          currentValue: 25000,
          assumedAnnualGrowthRatePercent: 6,
          projectionYears: 5,
          projectedValue: 30000,
          projectedGrowthAmount: 5000
        }
      ],
      warnings: []
    },
    cashReserveProjection: {
      source: "cash-reserve-calculations",
      enabled: true,
      mode: "reportingOnly",
      reserveMethod: "monthsOfEssentialExpenses",
      expenseBasis: "essentialSupport",
      reserveMonths: 6,
      monthlyReserveBasis: 1000,
      requiredReserveAmount: 6000,
      emergencyFundReservedAmount: 2000,
      totalCashEquivalentValue: 10000,
      cashAvailableAboveReserve: 6000,
      totalReservedAmount: 6000,
      totalAvailableAfterReserve: 6000,
      excludeEmergencyFundAssets: true,
      applyToAssetScope: "cashAndCashEquivalents",
      consumedByMethods: false,
      includedAssets: [],
      excludedAssets: [],
      reviewAssets: [],
      warnings: []
    }
  };
}

const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const incomeLossImpactHtml = readRepoFile("pages/income-loss-impact.html");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const analysisSettingsAdapterSource = readRepoFile("app/features/lens-analysis/analysis-settings-adapter.js");
const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
const incomeLossImpactSource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");

assert.match(stepThreeSource, /LENS Analysis/);
assert.match(stepThreeSource, /Advanced needs analysis using detailed planning assumptions\./);
assert.match(stepThreeSource, /Gross LENS Need/);
assert.match(stepThreeSource, /LENS Components/);
assert.match(stepThreeSource, /LENS Projection Details/);
assert.match(stepThreeSource, /DIME, LENS, and HLV outputs are unaffected/);
assert.doesNotMatch(stepThreeSource, /Gross Needs Analysis Need/);
assert.doesNotMatch(stepThreeSource, /Needs Components/);

assert.match(analysisEstimateHtml, /LENS Analysis will appear here/);
assert.match(incomeLossImpactHtml, /linked profile and Protection Modeling facts/);
assert.match(incomeLossImpactSource, /Years of Financial Security/);
assert.match(incomeLossImpactSource, /Read-only estimate from linked profile and Protection Modeling information/);
assert.doesNotMatch(incomeLossImpactSource, /Temporary compatibility/);
assert.doesNotMatch(incomeLossImpactSource, /Annual Support Gap/);
assert.doesNotMatch(incomeLossImpactSource, /Income Replacement Bridge/);
assert.doesNotMatch(incomeLossImpactSource, /Survivor Income Impact/);
assert.match(analysisSetupHtml, /<span>LENS Support Years<\/span>/);
assert.match(analysisSetupHtml, /current LENS where enabled/);
assert.doesNotMatch(analysisSetupHtml, /current Needs/);
assert.doesNotMatch(analysisSetupHtml, /Needs only/);
assert.match(analysisSetupHtml, /LENS uses treated offsets/);
assert.match(analysisSetupHtml, /<option value="needsAnalysis">LENS Analysis<\/option>/);
assert.match(analysisSetupHtml, /DIME, LENS, and HLV/);
assert.match(analysisSetupSource, /needsAnalysis: "LENS Analysis"/);
assert.match(analysisSetupSource, /source: "needsAnalysis"/);
assert.match(analysisSetupSource, /must be DIME, LENS Analysis, or Human Life Value/);

assert.match(analysisMethodsSource, /method: "needsAnalysis"/);
assert.match(analysisSettingsAdapterSource, /needsAnalysisSettings/);
assert.doesNotMatch(analysisMethodsSource, /method: "lens"/);
assert.doesNotMatch(analysisMethodsSource, /runLensAnalysis/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.doesNotMatch(analysisMethodsSource, /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/);
assert.doesNotMatch(analysisSettingsAdapterSource, /lensSettings/);
assert.doesNotMatch(analysisSettingsAdapterSource, /simpleNeeds/);

const methodContext = createLensAnalysisContext();
const lensAnalysis = methodContext.LensApp.lensAnalysis;
const lensModel = createLensModel();
const methodSettings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
  analysisSettings: {
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 10,
      hlvProjectionYears: 20
    },
    existingCoverageAssumptions: {
      includeExistingCoverage: true
    }
  },
  lensModel,
  profileRecord: {
    analysisSettings: {}
  }
});

assert.ok(methodSettings.needsAnalysisSettings, "needsAnalysisSettings should remain the method-settings key");
assert.equal(methodSettings.lensSettings, undefined, "No lensSettings key should be introduced");

const dimeResult = lensAnalysis.analysisMethods.runDimeAnalysis(
  lensModel,
  cloneJson(methodSettings.dimeSettings)
);
const needsResult = lensAnalysis.analysisMethods.runNeedsAnalysis(
  lensModel,
  cloneJson(methodSettings.needsAnalysisSettings)
);
const hlvResult = lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(
  lensModel,
  cloneJson(methodSettings.humanLifeValueSettings)
);

assert.equal(dimeResult.method, "dime");
assert.equal(dimeResult.grossNeed, 1070000);
assert.equal(dimeResult.netCoverageGap, 970000);
assert.equal(needsResult.method, "needsAnalysis");
assert.equal(needsResult.label, "LENS Analysis");
assert.equal(needsResult.grossNeed, 186693.56);
assert.equal(needsResult.netCoverageGap, 61693.56);
assert.equal(hlvResult.method, "humanLifeValue");
assert.equal(hlvResult.grossHumanLifeValue, 2000000);
assert.equal(hlvResult.netCoverageGap, 1900000);
assert.equal(lensAnalysis.analysisMethods.runLensAnalysis, undefined);
assert.equal(typeof lensAnalysis.analysisMethods.runSimpleNeedsAnalysis, "function");

const methodOutputs = lensAnalysis.analysisMethods.runAnalysisMethods(lensModel, {
  dimeIncomeYears: 10,
  needsSupportDurationYears: 10,
  hlvProjectionYears: 20,
  includeExistingCoverageOffset: true,
  includeOffsetAssets: true
});
assert.deepEqual(
  Object.keys(methodOutputs).sort(),
  ["dime", "humanLifeValue", "needsAnalysis"],
  "runAnalysisMethods should not add a visible Simple Needs result yet."
);
assert.equal(methodOutputs.simpleNeeds, undefined);

const stepThree = createStepThreeContext(lensModel, methodSettings);
assert.match(stepThree.needsHtml, /LENS Analysis/);
assert.match(stepThree.needsHtml, /Advanced needs analysis using detailed planning assumptions\./);
assert.match(stepThree.needsHtml, /Gross LENS Need/);
assert.match(stepThree.needsHtml, /LENS Components/);
assert.match(stepThree.needsHtml, /LENS Projection Details/);
assert.match(stepThree.needsHtml, /Projected Asset Growth/);
assert.match(stepThree.needsHtml, /Cash Reserve Projection/);
assert.match(stepThree.needsHtml, /Reporting only \/ none; DIME, LENS, and HLV outputs are unaffected/);
assert.doesNotMatch(stepThree.needsHtml, /Gross Needs Analysis Need/);
assert.doesNotMatch(stepThree.needsHtml, /Needs Components/);
assert.doesNotMatch(stepThree.dimeHtml, /LENS Analysis/);
assert.doesNotMatch(stepThree.hlvHtml, /LENS Analysis/);

console.log("lens-label-compatibility-check passed");
