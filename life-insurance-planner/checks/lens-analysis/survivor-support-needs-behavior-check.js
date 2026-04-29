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
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  function loadScript(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  [
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(loadScript);

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createModel() {
  return {
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      annualGrossIncome: 120000,
      annualNetIncome: 90000
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 60000,
      annualDiscretionaryPersonalSpending: 12000
    },
    educationSupport: {
      totalEducationFundingNeed: 0
    },
    finalExpenses: {
      totalFinalExpenseNeed: 0
    },
    transitionNeeds: {
      totalTransitionNeed: 10000
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
    },
    survivorScenario: {
      survivorContinuesWorking: true,
      survivorNetAnnualIncome: 24000,
      survivorIncomeStartDelayMonths: 0
    }
  };
}

function createAnalysisSettings(overrides = {}) {
  const supportTreatment = {
    includeEssentialSupport: true,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    supportDurationYears: null,
    ...(overrides.supportTreatment || {})
  };
  const survivorIncomeTreatment = {
    includeSurvivorIncome: true,
    applyStartDelay: true,
    ...(overrides.survivorIncomeTreatment || {})
  };

  return {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: false,
      generalInflationRatePercent: 0,
      householdExpenseInflationRatePercent: 0,
      source: "survivor-support-needs-behavior-check"
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: false,
        includeProjectedDependents: false,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100
      }
    },
    existingCoverageAssumptions: {
      includeExistingCoverage: false
    },
    methodDefaults: {
      needsIncludeOffsetAssets: false
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment,
      supportTreatment
    }
  };
}

function createNeedsSettings(adapter, overrides) {
  return adapter.createNeedsAnalysisSettings({
    analysisSettings: createAnalysisSettings(overrides)
  });
}

function createDimeSettings(adapter, overrides) {
  return adapter.createDimeSettings({
    analysisSettings: createAnalysisSettings(overrides)
  });
}

function createHlvSettings(adapter, overrides) {
  return adapter.createHumanLifeValueSettings({
    analysisSettings: createAnalysisSettings(overrides)
  });
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function runNeeds(methods, adapter, model, overrides) {
  const modelBefore = cloneJson(model);
  const settings = createNeedsSettings(adapter, overrides);
  const settingsBefore = cloneJson(settings);
  const result = methods.runNeedsAnalysis(model, settings);
  assert.deepEqual(cloneJson(model), modelBefore, "Needs Analysis must not mutate the model input.");
  assert.deepEqual(cloneJson(settings), settingsBefore, "Needs Analysis must not mutate the settings input.");
  return result;
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const adapter = lensAnalysis.analysisSettingsAdapter;
const methods = lensAnalysis.analysisMethods;

assert.equal(typeof adapter?.createNeedsAnalysisSettings, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");

const baseModel = createModel();
const defaultNeedsSettings = createNeedsSettings(adapter, {});
assert.equal(defaultNeedsSettings.includeEssentialSupport, true, "Adapter should default includeEssentialSupport to true.");

const includedNeeds = runNeeds(methods, adapter, baseModel, {});
let essentialTrace = findTrace(includedNeeds, "essentialSupport");
let inflationTrace = findTrace(includedNeeds, "essentialSupportInflation");
let survivorOffsetTrace = findTrace(includedNeeds, "survivorIncomeOffset");
assert.equal(includedNeeds.components.essentialSupport, 360000, "Default Needs should include essential support reduced by survivor income.");
assert.equal(includedNeeds.commonOffsets.survivorIncomeOffset, 240000, "Default survivor income offset should be applied inside included essential support.");
assert.equal(essentialTrace.inputs.includeEssentialSupport, true);
assert.equal(essentialTrace.inputs.essentialSupportPreExclusionAmount, 600000);
assert.equal(essentialTrace.inputs.essentialSupportIncludedAmount, 360000);
assert.equal(inflationTrace.inputs.includeEssentialSupport, true);
assert.equal(survivorOffsetTrace.inputs.survivorIncomeOffsetApplied, true);

const excludedNeeds = runNeeds(methods, adapter, baseModel, {
  supportTreatment: {
    includeEssentialSupport: false
  }
});
essentialTrace = findTrace(excludedNeeds, "essentialSupport");
inflationTrace = findTrace(excludedNeeds, "essentialSupportInflation");
survivorOffsetTrace = findTrace(excludedNeeds, "survivorIncomeOffset");
assert.equal(excludedNeeds.components.essentialSupport, 0, "includeEssentialSupport=false should zero Needs essential support.");
assert.equal(excludedNeeds.commonOffsets.survivorIncomeOffset, 0, "Survivor income offset should not apply against excluded essential support.");
assert.equal(excludedNeeds.grossNeed, includedNeeds.grossNeed - includedNeeds.components.essentialSupport, "Essential support exclusion should reduce gross need by the included support amount.");
assert.equal(excludedNeeds.netCoverageGap, includedNeeds.netCoverageGap - includedNeeds.components.essentialSupport, "Essential support exclusion should reduce net need by the included support amount.");
assert.equal(essentialTrace.inputs.includeEssentialSupport, false);
assert.equal(essentialTrace.inputs.essentialSupportPreExclusionAmount, 600000);
assert.equal(essentialTrace.inputs.essentialSupportIncludedAmount, 0);
assert.equal(essentialTrace.inputs.essentialSupportExcludedAmount, 600000);
assert.equal(essentialTrace.inputs.exclusionReason, "essential-support-not-included-setting");
assert.equal(inflationTrace.inputs.includeEssentialSupport, false);
assert.equal(inflationTrace.inputs.included, false);
assert.equal(inflationTrace.inputs.essentialSupportIncludedAmount, 0);
assert.equal(inflationTrace.value, 0);
assert.equal(survivorOffsetTrace.inputs.essentialSupportExcluded, true);
assert.equal(survivorOffsetTrace.inputs.survivorIncomeOffsetSuppressed, true);

const transitionOffNeeds = runNeeds(methods, adapter, baseModel, {
  supportTreatment: {
    includeTransitionNeeds: false
  }
});
assert.equal(transitionOffNeeds.components.essentialSupport, includedNeeds.components.essentialSupport, "Transition toggle should not change essential support.");
assert.equal(transitionOffNeeds.components.transitionNeeds, 0, "Transition toggle should remain formula-active.");

const discretionaryOnNeeds = runNeeds(methods, adapter, baseModel, {
  supportTreatment: {
    includeDiscretionarySupport: true
  }
});
assert.equal(discretionaryOnNeeds.components.essentialSupport, includedNeeds.components.essentialSupport, "Discretionary toggle should not change essential support.");
assert.equal(discretionaryOnNeeds.components.discretionarySupport, 120000, "Discretionary support toggle should remain formula-active.");

const survivorIncomeOffNeeds = runNeeds(methods, adapter, baseModel, {
  survivorIncomeTreatment: {
    includeSurvivorIncome: false
  }
});
survivorOffsetTrace = findTrace(survivorIncomeOffNeeds, "survivorIncomeOffset");
assert.equal(survivorIncomeOffNeeds.components.essentialSupport, 600000, "Survivor income offset off should keep full essential support.");
assert.equal(survivorIncomeOffNeeds.commonOffsets.survivorIncomeOffset, 0, "Survivor income offset off should not reduce support.");
assert.equal(survivorOffsetTrace.inputs.includeSurvivorIncomeOffset, false);

const dimeBaseline = methods.runDimeAnalysis(baseModel, createDimeSettings(adapter, {}));
const dimeEssentialOff = methods.runDimeAnalysis(baseModel, createDimeSettings(adapter, {
  supportTreatment: {
    includeEssentialSupport: false,
    includeTransitionNeeds: false,
    includeDiscretionarySupport: true
  },
  survivorIncomeTreatment: {
    includeSurvivorIncome: false
  }
}));
assert.deepEqual(dimeEssentialOff.components, dimeBaseline.components, "DIME should remain unchanged by Survivor & Support gates.");
assert.equal(dimeEssentialOff.netCoverageGap, dimeBaseline.netCoverageGap);

const hlvBaseline = methods.runHumanLifeValueAnalysis(baseModel, createHlvSettings(adapter, {}));
const hlvEssentialOff = methods.runHumanLifeValueAnalysis(baseModel, createHlvSettings(adapter, {
  supportTreatment: {
    includeEssentialSupport: false,
    includeTransitionNeeds: false,
    includeDiscretionarySupport: true
  },
  survivorIncomeTreatment: {
    includeSurvivorIncome: false
  }
}));
assert.deepEqual(hlvEssentialOff.components, hlvBaseline.components, "HLV should remain unchanged by Survivor & Support gates.");
assert.equal(hlvEssentialOff.grossHumanLifeValue, hlvBaseline.grossHumanLifeValue);

console.log("Survivor & Support Needs behavior checks passed.");
