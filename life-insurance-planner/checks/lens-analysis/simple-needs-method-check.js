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

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected ${functionName} to exist.`);
  const firstBrace = source.indexOf("{", start);
  assert.notEqual(firstBrace, -1, `Expected ${functionName} to have a body.`);

  let depth = 0;
  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Could not extract ${functionName} source.`);
}

function getCardBlock(source, key) {
  const pattern = new RegExp(
    `<article\\b[^>]*data-analysis-type-card="${key}"[^>]*>[\\s\\S]*?<\\/article>`,
    "m"
  );
  const match = source.match(pattern);
  assert.ok(match, `Expected analysis type card for ${key}.`);
  return match[0];
}

function warningCodes(result) {
  return (Array.isArray(result.warnings) ? result.warnings : []).map(function (warning) {
    return warning.code;
  });
}

function pickComparableSimpleNeedsResult(result) {
  return {
    method: result.method,
    methodKey: result.methodKey,
    label: result.label,
    grossNeed: result.grossNeed,
    netNeed: result.netNeed,
    coverageGap: result.coverageGap,
    netCoverageGap: result.netCoverageGap,
    rawUncappedGap: result.rawUncappedGap,
    components: cloneJson(result.components),
    commonOffsets: cloneJson(result.commonOffsets),
    assumptions: cloneJson(result.assumptions),
    warningCodes: cloneJson(warningCodes(result)),
    traceKeys: cloneJson(result.trace.map(function (row) {
      return row.key;
    }))
  };
}

function createBaseLensModel() {
  return {
    incomeBasis: {
      annualIncomeReplacementBase: 90000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 10000,
      mortgageBalance: 40000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 12000,
      annualDiscretionaryPersonalSpending: 999999
    },
    educationSupport: {
      totalEducationFundingNeed: 20000,
      projectedEducationFundingNeed: 999999
    },
    finalExpenses: {
      totalFinalExpenseNeed: 8000,
      healthcareFinalExpenseNeed: 999999
    },
    transitionNeeds: {
      totalTransitionNeed: 999999
    },
    survivorScenario: {
      survivorNetAnnualIncome: 999999
    },
    existingCoverage: {
      totalExistingCoverage: 25000
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 30000,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 5000,
      metadata: {
        consumedByMethods: true
      }
    },
    healthcareExpenses: {
      totalProjectedHealthcareExpense: 999999,
      enabledHealthcareExpenseCount: 2
    },
    projectedAssetGrowth: {
      projectedTotalAssetValue: 999999,
      consumedByMethods: false
    },
    cashReserveProjection: {
      totalAvailableAfterReserve: 999999,
      requiredReserveAmount: 999999,
      consumedByMethods: false
    }
  };
}

function createMethodSettings() {
  return {
    dimeSettings: {
      dimeIncomeYears: 10,
      includeExistingCoverageOffset: true,
      includeOffsetAssets: false
    },
    needsAnalysisSettings: {
      supportDurationYears: 10,
      includeExistingCoverageOffset: true,
      includeOffsetAssets: true,
      includeDebtPayoff: true,
      includeEssentialSupport: true,
      includeTransitionNeeds: true,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: true,
      includeEducation: true,
      includeFinalExpenses: true
    },
    humanLifeValueSettings: {
      projectionYears: 20,
      includeExistingCoverageOffset: true,
      includeOffsetAssets: false
    }
  };
}

function createCurrentOutputSnapshot(methods, lensModel, methodSettings) {
  return cloneJson({
    dime: methods.runDimeAnalysis(cloneJson(lensModel), cloneJson(methodSettings.dimeSettings)),
    needsAnalysis: methods.runNeedsAnalysis(cloneJson(lensModel), cloneJson(methodSettings.needsAnalysisSettings)),
    humanLifeValue: methods.runHumanLifeValueAnalysis(cloneJson(lensModel), cloneJson(methodSettings.humanLifeValueSettings))
  });
}

const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const analysisSettingsAdapterSource = readRepoFile("app/features/lens-analysis/analysis-settings-adapter.js");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensHtml = readRepoFile("pages/lens.html");
const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");

assert.match(analysisMethodsSource, /const DEFAULT_SIMPLE_NEEDS_SETTINGS = Object\.freeze\(/);
assert.match(analysisMethodsSource, /function runSimpleNeedsAnalysis\(/);
assert.match(analysisMethodsSource, /method: "simpleNeeds"/);
assert.match(analysisMethodsSource, /methodKey: "simpleNeeds"/);
assert.match(analysisMethodsSource, /label: "Simple Needs Analysis"/);
assert.doesNotMatch(
  analysisMethodsSource,
  /simpleNeeds:\s*runSimpleNeedsAnalysis\(lensModel, settings\)/,
  "runAnalysisMethods should not expose Simple Needs before UI/result wiring."
);
assert.doesNotMatch(analysisSettingsAdapterSource, /simpleNeeds/);

const simpleNeedsSource = extractFunctionSource(analysisMethodsSource, "runSimpleNeedsAnalysis");
[
  "healthcareExpenses",
  "healthcareExpenseAssumptions",
  "projectedAssetGrowth",
  "cashReserveProjection",
  "cashReserveAssumptions",
  "assetGrowthProjectionAssumptions",
  "assumedAnnualGrowthRatePercent",
  "projectedOffsets",
  "reserveAdjusted",
  "transitionNeeds",
  "discretionary",
  "survivorScenario",
  "growthAndReturnAssumptions",
  "recommendationGuardrails",
  "policyTypeReturn",
  "Math.pow",
  "inflation"
].forEach(function (excludedToken) {
  assert.doesNotMatch(
    simpleNeedsSource,
    new RegExp(excludedToken),
    `runSimpleNeedsAnalysis should not consume ${excludedToken}.`
  );
});

assert.doesNotMatch(stepThreeSource, /runSimpleNeedsAnalysis/);
assert.doesNotMatch(stepThreeSource, /data-step-three-simple/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-simple/);
assert.doesNotMatch(analysisSetupHtml, /<option value="simpleNeeds"/);
assert.doesNotMatch(analysisSetupSource, /simpleNeeds/);

const simpleNeedsCard = getCardBlock(lensHtml, "simple-needs");
assert.match(simpleNeedsCard, /Simple Needs Analysis/);
assert.match(simpleNeedsCard, /Quick flow coming soon/);
assert.match(simpleNeedsCard, /<button\b[^>]*\bdisabled\b/);
assert.doesNotMatch(simpleNeedsCard, /href=/);
assert.doesNotMatch(simpleNeedsCard, /simple-needs-entry\.html/);
assert.doesNotMatch(simpleNeedsCard, /simple-needs-results\.html/);
assert.equal(
  fs.existsSync(path.join(repoRoot, "pages/simple-needs-entry.html")),
  true,
  "Simple Needs entry page can exist while the selector remains disabled."
);
assert.equal(
  fs.existsSync(path.join(repoRoot, "pages/simple-needs-results.html")),
  true,
  "Simple Needs result page can exist while the selector remains disabled."
);

const context = createLensAnalysisContext();
const methods = context.LensApp.lensAnalysis.analysisMethods;

assert.equal(typeof methods.runSimpleNeedsAnalysis, "function");
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.supportYears, 10);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.includeExistingCoverageOffset, true);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.includeAssetOffsets, false);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.includeDebtPayoff, true);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.includeEssentialSupport, true);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.includeEducation, true);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.includeFinalExpenses, true);
assert.equal(methods.DEFAULT_SIMPLE_NEEDS_SETTINGS.source, "method-defaults");

const baseModel = createBaseLensModel();
const defaultSettings = {};
const baseModelBefore = cloneJson(baseModel);
const defaultSettingsBefore = cloneJson(defaultSettings);
const defaultResult = methods.runSimpleNeedsAnalysis(baseModel, defaultSettings);

assert.deepEqual(baseModel, baseModelBefore, "runSimpleNeedsAnalysis should not mutate lensModel.");
assert.deepEqual(defaultSettings, defaultSettingsBefore, "runSimpleNeedsAnalysis should not mutate settings.");
assert.equal(defaultResult.method, "simpleNeeds");
assert.equal(defaultResult.methodKey, "simpleNeeds");
assert.equal(defaultResult.label, "Simple Needs Analysis");
assert.equal(defaultResult.assumptions.supportYears, 10);
assert.equal(defaultResult.assumptions.source, "method-defaults");
assert.equal(defaultResult.assumptions.currentDollarOnly, true);
assert.equal(defaultResult.assumptions.advancedLensAssumptionsConsumed, false);
assert.equal(defaultResult.assumptions.includeAssetOffsets, false);
assert.equal(defaultResult.components.debtPayoff, 10000);
assert.equal(defaultResult.components.essentialSupport, 120000);
assert.equal(defaultResult.components.education, 20000);
assert.equal(defaultResult.components.finalExpenses, 8000);
assert.equal(defaultResult.grossNeed, 158000);
assert.equal(defaultResult.commonOffsets.existingCoverageOffset, 30000);
assert.equal(defaultResult.commonOffsets.assetOffset, 0);
assert.equal(defaultResult.commonOffsets.totalOffset, 30000);
assert.equal(defaultResult.netNeed, 128000);
assert.equal(defaultResult.coverageGap, 128000);
assert.equal(defaultResult.netCoverageGap, 128000);
assert.ok(warningCodes(defaultResult).includes("simple-needs-current-dollar-only"));
assert.ok(warningCodes(defaultResult).includes("simple-needs-asset-offsets-disabled-by-default"));
assert.deepEqual(
  cloneJson(defaultResult.trace.map(function (row) { return row.key; })),
  [
    "debtPayoff",
    "essentialSupport",
    "education",
    "finalExpenses",
    "existingCoverageOffset",
    "assetOffset",
    "grossNeed",
    "netCoverageGap"
  ]
);

const assetOffsetResult = methods.runSimpleNeedsAnalysis(cloneJson(baseModel), {
  includeAssetOffsets: true
});
assert.equal(assetOffsetResult.commonOffsets.assetOffset, 5000);
assert.equal(assetOffsetResult.assumptions.effectiveAssetOffsetSource, "treated");
assert.equal(assetOffsetResult.netCoverageGap, 123000);
assert.ok(
  assetOffsetResult.trace.find(function (row) {
    return row.key === "assetOffset" && row.sourcePaths.includes("treatedAssetOffsets.totalTreatedAssetValue");
  }),
  "Optional Simple Needs asset offset should use current-dollar treatedAssetOffsets only."
);

const fixedSettingsResult = methods.runSimpleNeedsAnalysis(cloneJson(baseModel), {
  supportYears: 2,
  includeExistingCoverageOffset: false,
  source: "method-defaults"
});
assert.equal(fixedSettingsResult.components.essentialSupport, 24000);
assert.equal(fixedSettingsResult.grossNeed, 62000);
assert.equal(fixedSettingsResult.commonOffsets.existingCoverageOffset, 0);
assert.equal(fixedSettingsResult.netCoverageGap, 62000);

const fallbackModel = cloneJson(baseModel);
delete fallbackModel.ongoingSupport.annualTotalEssentialSupportCost;
const fallbackResult = methods.runSimpleNeedsAnalysis(fallbackModel, { supportYears: 2 });
assert.equal(fallbackResult.components.essentialSupport, 180000);
assert.equal(fallbackResult.assumptions.essentialSupportSource, "incomeBasis.annualIncomeReplacementBase");
assert.ok(warningCodes(fallbackResult).includes("simple-needs-essential-support-income-fallback-used"));

const missingModel = cloneJson(baseModel);
delete missingModel.ongoingSupport.annualTotalEssentialSupportCost;
delete missingModel.incomeBasis.annualIncomeReplacementBase;
const missingResult = methods.runSimpleNeedsAnalysis(missingModel, { supportYears: "invalid" });
assert.equal(missingResult.assumptions.supportYears, 10);
assert.equal(missingResult.components.essentialSupport, 0);
assert.ok(warningCodes(missingResult).includes("invalid-simple-needs-support-years"));
assert.ok(warningCodes(missingResult).includes("missing-simple-needs-essential-support-basis"));

const cappedModel = cloneJson(baseModel);
cappedModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset = 500000;
const cappedResult = methods.runSimpleNeedsAnalysis(cappedModel);
assert.equal(cappedResult.rawUncappedGap, -342000);
assert.equal(cappedResult.netCoverageGap, 0);

const advancedModel = cloneJson(baseModel);
advancedModel.healthcareExpenses = {
  totalProjectedHealthcareExpense: 999999999,
  enabledHealthcareExpenseCount: 99
};
advancedModel.projectedAssetGrowth = {
  projectedTotalAssetValue: 999999999,
  consumedByMethods: false
};
advancedModel.cashReserveProjection = {
  totalAvailableAfterReserve: 999999999,
  requiredReserveAmount: 999999999,
  consumedByMethods: false
};
advancedModel.assetTreatmentAssumptions = {
  assets: {
    cashAndCashEquivalents: {
      assumedAnnualGrowthRatePercent: 99
    }
  },
  assetGrowthProjectionAssumptions: {
    mode: "reportingOnly",
    projectionYears: 30
  },
  cashReserveAssumptions: {
    enabled: true,
    reserveMonths: 24
  }
};
advancedModel.settings = {
  inflationAssumptions: {
    healthcareInflationRatePercent: 99,
    finalExpenseInflationRatePercent: 99
  },
  growthAndReturnAssumptions: {
    taxableInvestmentReturnRatePercent: 99,
    retirementAssetReturnRatePercent: 99
  },
  policyTypeReturnAssumptions: {
    wholeLifeReturnRatePercent: 99
  }
};
const advancedSettings = {
  healthcareExpenseAssumptions: {
    enabled: true
  },
  assetGrowthProjectionAssumptions: {
    mode: "reportingOnly",
    projectionYears: 30
  },
  cashReserveAssumptions: {
    enabled: true,
    reserveMonths: 24
  },
  growthAndReturnAssumptions: {
    taxableInvestmentReturnRatePercent: 99
  },
  recommendationGuardrails: {
    source: "needsAnalysis"
  },
  policyTypeReturnAssumptions: {
    universalLifeReturnRatePercent: 99
  }
};
assert.deepEqual(
  pickComparableSimpleNeedsResult(methods.runSimpleNeedsAnalysis(advancedModel, advancedSettings)),
  pickComparableSimpleNeedsResult(defaultResult),
  "Healthcare, growth, reserve, policy return, guardrail, and other advanced LENS-only fields should not affect Simple Needs."
);

const methodSettings = createMethodSettings();
const currentOutputModel = createBaseLensModel();
const currentOutputBefore = createCurrentOutputSnapshot(methods, currentOutputModel, methodSettings);
methods.runSimpleNeedsAnalysis(currentOutputModel, {});
const currentOutputAfter = createCurrentOutputSnapshot(methods, currentOutputModel, methodSettings);
assert.deepEqual(currentOutputAfter, currentOutputBefore, "DIME, LENS, and HLV outputs should be unchanged after Simple Needs invocation.");
assert.equal(currentOutputAfter.dime.method, "dime");
assert.equal(currentOutputAfter.needsAnalysis.method, "needsAnalysis");
assert.equal(currentOutputAfter.needsAnalysis.label, "LENS Analysis");
assert.equal(currentOutputAfter.humanLifeValue.method, "humanLifeValue");

const aggregateOutputs = methods.runAnalysisMethods(cloneJson(baseModel), {});
assert.deepEqual(
  Object.keys(aggregateOutputs).sort(),
  ["dime", "humanLifeValue", "needsAnalysis"],
  "Simple Needs should not be added to aggregate/visible method output yet."
);
assert.equal(aggregateOutputs.simpleNeeds, undefined);
assert.equal(methods.runLensAnalysis, undefined);

console.log("simple-needs-method-check passed");
