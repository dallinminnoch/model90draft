#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function createContext() {
  const context = {
    console,
    document: {
      addEventListener: () => {}
    },
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {
    analysisSetup: {},
    lensAnalysis: {}
  };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  function loadScript(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  [
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(loadScript);

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function todayDateOnly() {
  const today = new Date();
  return [
    String(today.getFullYear()).padStart(4, "0"),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
}

function assertTodayDate(value, message) {
  const before = todayDateOnly();
  const after = todayDateOnly();
  assert.ok(value === before || value === after, message);
}

function hasWarningCode(warnings, code) {
  return Array.isArray(warnings) && warnings.some((warning) => warning?.code === code);
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function createModel() {
  return {
    incomeBasis: {
      annualIncomeReplacementBase: 120000
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 0
    },
    educationSupport: {
      totalEducationFundingNeed: 30000,
      linkedDependentEducationFundingNeed: 10000,
      desiredAdditionalDependentEducationFundingNeed: 20000,
      desiredAdditionalDependentCount: 2,
      perLinkedDependentEducationFunding: 10000,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2020-01-01"
        }
      ]
    },
    finalExpenses: {
      totalFinalExpenseNeed: 0
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    existingCoverage: {
      totalExistingCoverage: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 0,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 0,
      metadata: {
        consumedByMethods: true
      }
    }
  };
}

function createAnalysisSettings(options = {}) {
  const settings = {
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      source: "education-valuation-date-behavior-check"
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: true,
        applyEducationInflation: true,
        educationStartAge: 18,
        fundingTargetPercent: 100,
        ...(options.fundingTreatment || {})
      },
      source: "education-valuation-date-behavior-check"
    },
    methodDefaults: {
      includeExistingCoverage: false,
      needsIncludeOffsetAssets: false,
      includeTransitionNeeds: true,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: false
    }
  };

  if (Object.prototype.hasOwnProperty.call(options, "valuationDate")) {
    settings.valuationDate = options.valuationDate;
  }

  return settings;
}

function createNeedsSettings(adapter, options = {}) {
  const warnings = [];
  const trace = [];
  const analysisSettings = createAnalysisSettings(options);
  const analysisSettingsBefore = cloneJson(analysisSettings);
  const settings = adapter.createNeedsAnalysisSettings({
    analysisSettings,
    warnings,
    trace
  });
  assert.deepEqual(analysisSettings, analysisSettingsBefore, "Adapter must not mutate saved analysis settings.");
  return {
    settings,
    warnings,
    trace
  };
}

function createDimeSettings(adapter, valuationDate) {
  return adapter.createDimeSettings({
    analysisSettings: createAnalysisSettings({
      valuationDate
    })
  });
}

function createHlvSettings(adapter, valuationDate) {
  return adapter.createHumanLifeValueSettings({
    analysisSettings: createAnalysisSettings({
      valuationDate
    })
  });
}

function runNeeds(methods, model, settings) {
  const modelBefore = cloneJson(model);
  const settingsBefore = cloneJson(settings);
  const result = methods.runNeedsAnalysis(model, settings);
  assert.deepEqual(model, modelBefore, "Needs Analysis must not mutate the model input.");
  assert.deepEqual(cloneJson(settings), settingsBefore, "Needs Analysis must not mutate method settings.");
  return result;
}

function createProjectionInput(overrides = {}) {
  return {
    dependentDetails: [
      {
        id: "child-1",
        dateOfBirth: "2020-01-01"
      }
    ],
    perChildFundingAmount: 10000,
    ratePercent: 5,
    enabled: true,
    educationStartAge: 18,
    timing: "annual",
    source: "education-valuation-date-behavior-check.direct-helper",
    ...overrides
  };
}

const context = createContext();
const analysisSetup = context.LensApp.analysisSetup;
const adapter = context.LensApp.lensAnalysis.analysisSettingsAdapter;
const methods = context.LensApp.lensAnalysis.analysisMethods;
const educationProjectionHelper = context.LensApp.lensAnalysis.calculateEducationFundingProjection;
const educationAgeHelper = context.LensApp.lensAnalysis.calculateEducationProjectionAgeFromDateOfBirth;

assert.equal(typeof analysisSetup?.resolveAnalysisValuationDateForSave, "function");
assert.equal(typeof adapter?.createNeedsAnalysisSettings, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof educationProjectionHelper, "function");
assert.equal(typeof educationAgeHelper, "function");

const source = fs.readFileSync(
  path.join(repoRoot, "app/features/lens-analysis/analysis-setup.js"),
  "utf8"
);
assert.match(source, /resolveAnalysisValuationDateForSave\(currentSettings\)/);
assert.match(source, /valuationDate:\s*valuationDateResult\.valuationDate/);

const firstSaveDate = analysisSetup.resolveAnalysisValuationDateForSave({});
assertTodayDate(firstSaveDate.valuationDate, "Missing saved valuationDate should default to today's date.");
assert.equal(firstSaveDate.valuationDateSource, "system-current-date-fallback");
assert.equal(firstSaveDate.valuationDateDefaulted, true);
assert.equal(firstSaveDate.valuationDateWarningCode, "analysis-valuation-date-defaulted");

const preservedDate = analysisSetup.resolveAnalysisValuationDateForSave({
  valuationDate: "2026-01-01"
});
assert.equal(preservedDate.valuationDate, "2026-01-01");
assert.equal(preservedDate.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(preservedDate.valuationDateDefaulted, false);

const invalidSaveDate = analysisSetup.resolveAnalysisValuationDateForSave({
  valuationDate: "2026-99-99"
});
assertTodayDate(invalidSaveDate.valuationDate, "Invalid saved valuationDate should default to today's date.");
assert.equal(invalidSaveDate.valuationDateWarningCode, "invalid-analysis-valuation-date-defaulted");

const validProjectionInput = createProjectionInput({
  asOfDate: "2026-01-01"
});
const validProjectionInputBefore = cloneJson(validProjectionInput);
const validProjection = educationProjectionHelper(validProjectionInput);
assert.deepEqual(validProjectionInput, validProjectionInputBefore, "Education projection helper must not mutate input.");
assert.equal(validProjection.trace.asOfDate, "2026-01-01");
assert.equal(validProjection.currentDollarTotal, 10000);
assert.ok(validProjection.projectedTotal > validProjection.currentDollarTotal);
assert.equal(validProjection.applied, true);

const missingDateProjection = educationProjectionHelper(createProjectionInput());
assert.equal(missingDateProjection.trace.asOfDate, null);
assert.equal(missingDateProjection.trace.reason, "missing-as-of-date");
assert.equal(missingDateProjection.currentDollarTotal, 10000);
assert.equal(missingDateProjection.projectedTotal, 10000);
assert.equal(missingDateProjection.applied, false);
assert.ok(hasWarningCode(missingDateProjection.warnings, "missing-as-of-date"));
assert.ok(missingDateProjection.trace.warningCodes.includes("missing-as-of-date"));

const invalidDateProjection = educationProjectionHelper(createProjectionInput({
  asOfDate: "not-a-date"
}));
assert.equal(invalidDateProjection.trace.asOfDate, null);
assert.equal(invalidDateProjection.trace.reason, "invalid-as-of-date");
assert.equal(invalidDateProjection.currentDollarTotal, 10000);
assert.equal(invalidDateProjection.projectedTotal, 10000);
assert.equal(invalidDateProjection.applied, false);
assert.ok(hasWarningCode(invalidDateProjection.warnings, "invalid-as-of-date"));
assert.ok(invalidDateProjection.trace.warningCodes.includes("invalid-as-of-date"));

assert.equal(educationAgeHelper("2020-01-01"), null);
assert.equal(educationAgeHelper("2020-01-01", "not-a-date"), null);
assert.equal(educationAgeHelper("2020-01-01", "2026-01-01"), 6);

const mapped = createNeedsSettings(adapter, {
  valuationDate: "2026-01-01"
});
assert.equal(mapped.settings.valuationDate, "2026-01-01");
assert.equal(mapped.settings.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(mapped.settings.valuationDateDefaulted, false);
assert.equal(mapped.settings.educationAssumptions.valuationDate, "2026-01-01");
assert.equal(mapped.settings.educationAssumptions.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(mapped.settings.educationAssumptions.valuationDateDefaulted, false);
assert.equal(mapped.warnings.length, 0);

const missingMapped = createNeedsSettings(adapter);
assertTodayDate(missingMapped.settings.valuationDate, "Adapter missing valuationDate should use today's date as explicit fallback.");
assert.equal(missingMapped.settings.valuationDateSource, "system-current-date-fallback");
assert.equal(missingMapped.settings.valuationDateDefaulted, true);
assert.equal(missingMapped.settings.valuationDateWarningCode, "analysis-valuation-date-defaulted");
assert.ok(hasWarningCode(missingMapped.warnings, "analysis-valuation-date-defaulted"));

const invalidMapped = createNeedsSettings(adapter, {
  valuationDate: "not-a-date"
});
assertTodayDate(invalidMapped.settings.valuationDate, "Adapter invalid valuationDate should use today's date as explicit fallback.");
assert.equal(invalidMapped.settings.valuationDateSource, "system-current-date-fallback");
assert.equal(invalidMapped.settings.valuationDateDefaulted, true);
assert.equal(invalidMapped.settings.valuationDateWarningCode, "invalid-analysis-valuation-date-defaulted");
assert.ok(hasWarningCode(invalidMapped.warnings, "invalid-analysis-valuation-date-defaulted"));

const baseModel = createModel();
const projected2026 = runNeeds(
  methods,
  baseModel,
  createNeedsSettings(adapter, {
    valuationDate: "2026-01-01",
    fundingTreatment: {
      includeProjectedDependents: false
    }
  }).settings
);
const projected2030 = runNeeds(
  methods,
  baseModel,
  createNeedsSettings(adapter, {
    valuationDate: "2030-01-01",
    fundingTreatment: {
      includeProjectedDependents: false
    }
  }).settings
);
let inflationTrace = findTrace(projected2026, "educationFundingInflation");
assert.equal(inflationTrace.inputs.valuationDate, "2026-01-01");
assert.equal(inflationTrace.inputs.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(inflationTrace.inputs.valuationDateDefaulted, false);
assert.equal(inflationTrace.inputs.asOfDate, "2026-01-01");
assert.equal(projected2026.assumptions.valuationDate, "2026-01-01");

const laterTrace = findTrace(projected2030, "educationFundingInflation");
assert.equal(laterTrace.inputs.valuationDate, "2030-01-01");
assert.ok(
  projected2026.components.education > projected2030.components.education,
  "Earlier valuationDate should project more years of current-child education inflation."
);

const directInvalidSettings = {
  needsSupportDurationYears: 10,
  includeExistingCoverageOffset: false,
  includeOffsetAssets: false,
  includeTransitionNeeds: true,
  includeDiscretionarySupport: false,
  includeSurvivorIncomeOffset: false,
  valuationDate: "invalid-date",
  inflationAssumptions: {
    enabled: true,
    educationInflationRatePercent: 5
  },
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: true,
    educationStartAge: 18
  }
};
const invalidDirectNeeds = runNeeds(methods, baseModel, directInvalidSettings);
inflationTrace = findTrace(invalidDirectNeeds, "educationFundingInflation");
assertTodayDate(inflationTrace.inputs.valuationDate, "Method invalid valuationDate should use explicit current-date fallback.");
assert.equal(inflationTrace.inputs.valuationDateSource, "system-current-date-fallback");
assert.equal(inflationTrace.inputs.valuationDateDefaulted, true);
assert.equal(inflationTrace.inputs.valuationDateWarningCode, "invalid-education-valuation-date-defaulted");
assert.ok(hasWarningCode(invalidDirectNeeds.warnings, "invalid-education-valuation-date-defaulted"));

const educationExcludedNeeds = runNeeds(
  methods,
  baseModel,
  createNeedsSettings(adapter, {
    valuationDate: "2026-01-01",
    fundingTreatment: {
      includeEducationFunding: false
    }
  }).settings
);
assert.equal(educationExcludedNeeds.components.education, 0);
inflationTrace = findTrace(educationExcludedNeeds, "educationFundingInflation");
assert.equal(inflationTrace.inputs.educationFundingExcluded, true);

const plannedExcludedNeeds = runNeeds(
  methods,
  baseModel,
  createNeedsSettings(adapter, {
    valuationDate: "2026-01-01",
    fundingTreatment: {
      includeProjectedDependents: false
    }
  }).settings
);
inflationTrace = findTrace(plannedExcludedNeeds, "educationFundingInflation");
assert.equal(inflationTrace.inputs.plannedDependentEducationIncludedAmount, 0);
assert.equal(inflationTrace.inputs.plannedDependentEducationExcludedAmount, 20000);
assert.equal(plannedExcludedNeeds.components.education, inflationTrace.inputs.currentChildEducationIncludedAmount);

const dime2026 = methods.runDimeAnalysis(baseModel, createDimeSettings(adapter, "2026-01-01"));
const dime2030 = methods.runDimeAnalysis(baseModel, createDimeSettings(adapter, "2030-01-01"));
assert.deepEqual(dime2030.components, dime2026.components, "DIME should not change based on Planning As-Of Date.");
assert.equal(dime2030.netCoverageGap, dime2026.netCoverageGap);

const hlv2026 = methods.runHumanLifeValueAnalysis(baseModel, createHlvSettings(adapter, "2026-01-01"));
const hlv2030 = methods.runHumanLifeValueAnalysis(baseModel, createHlvSettings(adapter, "2030-01-01"));
assert.deepEqual(hlv2030.components, hlv2026.components, "HLV should not change based on Planning As-Of Date.");
assert.equal(hlv2030.netCoverageGap, hlv2026.netCoverageGap);

console.log("Education valuation-date behavior checks passed.");
