#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_DEFAULTS = Object.freeze({
  enabled: false,
  projectionYears: 10,
  includeOneTimeHealthcareExpenses: false,
  oneTimeProjectionMode: "currentDollarOnly",
  source: "analysis-setup"
});

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAnalysisSetupContext() {
  const context = {
    console,
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
  context.LensApp = {};
  vm.createContext(context);
  loadScript(context, "app/features/lens-analysis/analysis-setup.js");
  return context;
}

function createLensAnalysisContext() {
  const context = {
    console,
    window: null
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
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "valid"
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 12000,
      annualDiscretionaryPersonalSpending: 6000
    },
    educationSupport: {
      totalEducationFundingNeed: 10000,
      linkedDependentEducationFundingNeed: 10000,
      desiredAdditionalDependentEducationFundingNeed: 0,
      desiredAdditionalDependentCount: 0,
      perLinkedDependentEducationFunding: 10000,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2020-01-01"
        }
      ]
    },
    finalExpenses: {
      medicalEndOfLifeCost: 400,
      funeralAndBurialCost: 300,
      estateSettlementCost: 200,
      otherFinalExpenses: 100,
      totalFinalExpenseNeed: 1000
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
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      householdExpenseInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "healthcare-expense-assumptions-readiness-check"
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: false,
        applyEducationInflation: true,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "healthcare-expense-assumptions-readiness-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: false,
        includeDiscretionarySupport: true
      },
      source: "healthcare-expense-assumptions-readiness-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    }
  };

  if (hasOwn(options, "healthcareExpenseAssumptions")) {
    settings.healthcareExpenseAssumptions = options.healthcareExpenseAssumptions;
  }

  return settings;
}

function createMethodSettings(adapter, analysisSettings) {
  return adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel: createLensModel(),
    profileRecord: {}
  });
}

function runAllMethods(methods, methodSettings) {
  const lensModel = createLensModel();
  return {
    dime: methods.runDimeAnalysis(lensModel, cloneJson(methodSettings.dimeSettings)),
    needs: methods.runNeedsAnalysis(lensModel, cloneJson(methodSettings.needsAnalysisSettings)),
    hlv: methods.runHumanLifeValueAnalysis(lensModel, cloneJson(methodSettings.humanLifeValueSettings))
  };
}

function runAllForAnalysisSettings(adapter, methods, analysisSettings) {
  const methodSettings = createMethodSettings(adapter, analysisSettings);
  return {
    methodSettings,
    results: runAllMethods(methods, methodSettings)
  };
}

function outputSnapshot(results) {
  return {
    dime: {
      grossNeed: results.dime.grossNeed,
      netCoverageGap: results.dime.netCoverageGap,
      components: results.dime.components
    },
    needs: {
      grossNeed: results.needs.grossNeed,
      netCoverageGap: results.needs.netCoverageGap,
      components: results.needs.components
    },
    hlv: {
      grossHumanLifeValue: results.hlv.grossHumanLifeValue,
      netCoverageGap: results.hlv.netCoverageGap,
      components: results.hlv.components
    }
  };
}

function findTrace(result, key) {
  return (Array.isArray(result?.trace) ? result.trace : []).find(function (entry) {
    return entry?.key === key;
  });
}

function findWarning(result, code) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).find(function (entry) {
    return entry?.code === code;
  });
}

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;

assert.deepEqual(
  cloneJson(analysisSetup.DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS),
  EXPECTED_DEFAULTS,
  "Analysis Setup should expose the inactive healthcare expense assumptions default shape."
);
assert.deepEqual(
  cloneJson(analysisSetup.getHealthcareExpenseAssumptions({ analysisSettings: {} })),
  EXPECTED_DEFAULTS,
  "Analysis Setup should default missing healthcare expense assumptions to the inactive shape."
);
assert.deepEqual(
  cloneJson(analysisSetup.getHealthcareExpenseAssumptions({
    analysisSettings: {
      healthcareExpenseAssumptions: {
        enabled: true,
        projectionYears: "20.4",
        includeOneTimeHealthcareExpenses: true,
        oneTimeProjectionMode: "currentDollarOnly",
        source: "saved"
      }
    }
  })),
  {
    enabled: true,
    projectionYears: 20,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  },
  "Analysis Setup should preserve valid saved healthcare expense assumptions."
);
assert.deepEqual(
  cloneJson(analysisSetup.getHealthcareExpenseAssumptions({
    analysisSettings: {
      healthcareExpenseAssumptions: {
        enabled: "yes",
        projectionYears: 0,
        includeOneTimeHealthcareExpenses: "yes",
        oneTimeProjectionMode: "futureInflated"
      }
    }
  })),
  EXPECTED_DEFAULTS,
  "Analysis Setup should normalize invalid healthcare expense assumptions back to the inactive defaults."
);

const lensContext = createLensAnalysisContext();
const lensAnalysis = lensContext.LensApp.lensAnalysis;
const adapter = lensAnalysis.analysisSettingsAdapter;
const methods = lensAnalysis.analysisMethods;

assert.deepEqual(
  cloneJson(adapter.DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS),
  EXPECTED_DEFAULTS,
  "Settings adapter should expose the same inactive healthcare expense assumptions default shape."
);

const mappedSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: true,
    projectionYears: 30,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  }
}));
assert.deepEqual(
  cloneJson(mappedSettings.needsAnalysisSettings.healthcareExpenseAssumptions),
  {
    enabled: true,
    projectionYears: 30,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  },
  "Adapter should map saved healthcare expense assumptions into Needs settings."
);
assert.equal(
  hasOwn(mappedSettings.dimeSettings, "healthcareExpenseAssumptions"),
  false,
  "DIME settings should not receive healthcare expense assumptions."
);
assert.equal(
  hasOwn(mappedSettings.humanLifeValueSettings, "healthcareExpenseAssumptions"),
  false,
  "HLV settings should not receive healthcare expense assumptions."
);

const readinessTrace = findTrace(mappedSettings, "healthcareExpenseAssumptions-activation-readiness");
assert.ok(readinessTrace, "Adapter should emit healthcare expense activation-readiness trace.");
assert.match(readinessTrace.message, /future healthcareExpenses activation/);
assert.match(readinessTrace.message, /do not consume/);
assert.match(readinessTrace.message, /raw-only/);
assert.ok(
  readinessTrace.sourcePaths.includes("analysisSettings.healthcareExpenseAssumptions"),
  "Healthcare expense readiness trace should point to the saved assumptions shape."
);

const invalidSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: "true",
    projectionYears: 0,
    includeOneTimeHealthcareExpenses: "false",
    oneTimeProjectionMode: "futureInflated"
  }
}));
assert.deepEqual(
  cloneJson(invalidSettings.needsAnalysisSettings.healthcareExpenseAssumptions),
  EXPECTED_DEFAULTS,
  "Adapter should default invalid saved healthcare expense assumptions without activating formulas."
);
assert.ok(findWarning(invalidSettings, "invalid-healthcare-expense-enabled"));
assert.ok(findWarning(invalidSettings, "out-of-range-healthcare-expense-projection-years"));
assert.ok(findWarning(invalidSettings, "invalid-healthcare-expense-include-one-time"));
assert.ok(findWarning(invalidSettings, "invalid-healthcare-expense-one-time-projection-mode"));

const baselineRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings());
const activeReadinessRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: true,
    projectionYears: 30,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  }
}));
assert.deepEqual(
  outputSnapshot(activeReadinessRun.results),
  outputSnapshot(baselineRun.results),
  "Healthcare expense assumptions mapping must not change current DIME, Needs, or HLV outputs."
);
assert.equal(
  hasOwn(activeReadinessRun.results.needs.components, "healthcareExpenses"),
  false,
  "Needs should not expose a healthcareExpenses component before formula activation."
);

console.log("Healthcare Expense Assumptions activation-readiness check passed.");
