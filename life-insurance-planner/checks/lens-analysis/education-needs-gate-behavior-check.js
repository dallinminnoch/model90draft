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

function createAnalysisSettings(fundingTreatment) {
  return {
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      source: "education-needs-gate-behavior-check"
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: true,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100,
        ...fundingTreatment
      },
      source: "education-needs-gate-behavior-check"
    },
    methodDefaults: {
      includeExistingCoverage: false,
      needsIncludeOffsetAssets: false,
      includeTransitionNeeds: true,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: false
    }
  };
}

function createNeedsSettings(adapter, fundingTreatment) {
  const settings = adapter.createNeedsAnalysisSettings({
    analysisSettings: createAnalysisSettings(fundingTreatment)
  });
  settings.educationAssumptions.asOfDate = "2026-01-01";
  return settings;
}

function createDimeSettings(adapter, fundingTreatment) {
  return adapter.createDimeSettings({
    analysisSettings: createAnalysisSettings(fundingTreatment)
  });
}

function createHlvSettings(adapter, fundingTreatment) {
  return adapter.createHumanLifeValueSettings({
    analysisSettings: createAnalysisSettings(fundingTreatment)
  });
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function runNeeds(methods, adapter, model, fundingTreatment) {
  const modelBefore = cloneJson(model);
  const result = methods.runNeedsAnalysis(model, createNeedsSettings(adapter, fundingTreatment));
  assert.deepEqual(cloneJson(model), modelBefore, "Needs Analysis must not mutate the model input.");
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
const baselineNeeds = runNeeds(methods, adapter, baseModel, {
  applyEducationInflation: false
});
let educationTrace = findTrace(baselineNeeds, "education");
let inflationTrace = findTrace(baselineNeeds, "educationFundingInflation");
assert.equal(baselineNeeds.components.education, 30000, "Default Needs should include current and planned education.");
assert.equal(educationTrace.inputs.currentChildEducationIncludedAmount, 10000);
assert.equal(educationTrace.inputs.plannedDependentEducationIncludedAmount, 20000);
assert.equal(inflationTrace.inputs.plannedDependentEducationStatus, "current-dollar-included");
assert.equal(inflationTrace.inputs.combinedEducationTotalUsed, 30000);

const excludedEducationNeeds = runNeeds(methods, adapter, baseModel, {
  includeEducationFunding: false,
  applyEducationInflation: true
});
educationTrace = findTrace(excludedEducationNeeds, "education");
inflationTrace = findTrace(excludedEducationNeeds, "educationFundingInflation");
assert.equal(excludedEducationNeeds.components.education, 0, "includeEducationFunding=false should zero the Needs education component.");
assert.equal(excludedEducationNeeds.grossNeed, baselineNeeds.grossNeed - 30000, "includeEducationFunding=false should reduce gross/net need by education funding.");
assert.equal(educationTrace.inputs.includeEducationFunding, false);
assert.equal(educationTrace.inputs.educationExcludedReason, "education-funding-not-included-setting");
assert.equal(inflationTrace.inputs.educationFundingExcluded, true);
assert.equal(inflationTrace.inputs.currentChildEducationIncludedAmount, 0);
assert.equal(inflationTrace.inputs.plannedDependentEducationIncludedAmount, 0);
assert.equal(inflationTrace.inputs.plannedDependentEducationExcludedAmount, 20000);

const plannedDependentsExcludedNeeds = runNeeds(methods, adapter, baseModel, {
  includeProjectedDependents: false,
  applyEducationInflation: false
});
educationTrace = findTrace(plannedDependentsExcludedNeeds, "education");
inflationTrace = findTrace(plannedDependentsExcludedNeeds, "educationFundingInflation");
assert.equal(plannedDependentsExcludedNeeds.components.education, 10000, "includeProjectedDependents=false should exclude planned-dependent education only.");
assert.equal(educationTrace.inputs.includeProjectedDependents, false);
assert.equal(educationTrace.inputs.currentChildEducationIncludedAmount, 10000);
assert.equal(educationTrace.inputs.plannedDependentEducationIncludedAmount, 0);
assert.equal(educationTrace.inputs.plannedDependentEducationExcludedAmount, 20000);
assert.equal(inflationTrace.inputs.plannedDependentEducationStatus, "excluded-by-setting");

const projectedNeeds = runNeeds(methods, adapter, baseModel, {
  includeProjectedDependents: true,
  applyEducationInflation: true,
  educationStartAge: 18
});
educationTrace = findTrace(projectedNeeds, "education");
inflationTrace = findTrace(projectedNeeds, "educationFundingInflation");
assert.equal(inflationTrace.inputs.asOfDate, "2026-01-01");
assert.equal(inflationTrace.inputs.currentEducationProjectionStatus, "projected");
assert.equal(inflationTrace.inputs.plannedDependentEducationIncludedAmount, 20000);
assert.equal(inflationTrace.inputs.plannedDependentEducationExcludedAmount, 0);
assert.equal(inflationTrace.inputs.plannedDependentEducationStatus, "current-dollar-included");
assert.ok(projectedNeeds.components.education > 30000, "Current dependent education should project upward when inflation applies.");
assert.equal(
  projectedNeeds.components.education,
  inflationTrace.inputs.currentChildEducationIncludedAmount + inflationTrace.inputs.plannedDependentEducationIncludedAmount
);
assert.equal(
  inflationTrace.inputs.currentDollarPlannedDependentTotal,
  inflationTrace.inputs.plannedDependentEducationIncludedAmount,
  "Planned dependents should remain current-dollar when included."
);

const projectedWithoutPlannedNeeds = runNeeds(methods, adapter, baseModel, {
  includeProjectedDependents: false,
  applyEducationInflation: true,
  educationStartAge: 18
});
inflationTrace = findTrace(projectedWithoutPlannedNeeds, "educationFundingInflation");
assert.equal(inflationTrace.inputs.plannedDependentEducationIncludedAmount, 0);
assert.equal(inflationTrace.inputs.plannedDependentEducationExcludedAmount, 20000);
assert.equal(
  projectedWithoutPlannedNeeds.components.education,
  inflationTrace.inputs.currentChildEducationIncludedAmount,
  "Projected current-child education should remain when planned dependents are excluded."
);

const fundingTarget75Needs = runNeeds(methods, adapter, baseModel, {
  fundingTargetPercent: 75,
  applyEducationInflation: false
});
assert.equal(fundingTarget75Needs.components.education, baselineNeeds.components.education, "fundingTargetPercent must remain saved/future-use in this pass.");

const dimeBaseline = methods.runDimeAnalysis(baseModel, createDimeSettings(adapter, {
  includeEducationFunding: true,
  applyEducationInflation: true,
  includeProjectedDependents: false
}));
const dimeWithEducationOff = methods.runDimeAnalysis(baseModel, createDimeSettings(adapter, {
  includeEducationFunding: false,
  applyEducationInflation: true,
  includeProjectedDependents: false
}));
assert.equal(dimeBaseline.components.education, 30000, "DIME should keep raw education funding.");
assert.equal(dimeWithEducationOff.components.education, 30000, "DIME should ignore Education Assumption gates.");

const hlvBaseline = methods.runHumanLifeValueAnalysis(baseModel, createHlvSettings(adapter, {
  includeEducationFunding: true,
  includeProjectedDependents: true,
  applyEducationInflation: true
}));
const hlvWithEducationOff = methods.runHumanLifeValueAnalysis(baseModel, createHlvSettings(adapter, {
  includeEducationFunding: false,
  includeProjectedDependents: false,
  applyEducationInflation: true
}));
assert.deepEqual(hlvWithEducationOff.components, hlvBaseline.components, "HLV should remain unchanged by Education Assumption gates.");
assert.equal(hlvWithEducationOff.grossHumanLifeValue, hlvBaseline.grossHumanLifeValue);

console.log("Education Needs gate behavior checks passed.");
