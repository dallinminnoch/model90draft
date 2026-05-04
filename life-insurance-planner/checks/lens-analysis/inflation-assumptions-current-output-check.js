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

  [
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
  });

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
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

function createHealthcareExpenseFact(overrides = {}) {
  return {
    expenseFactId: overrides.expenseFactId || "expense_record_ongoingHealthcare",
    typeKey: overrides.typeKey || "medicalOutOfPocket",
    categoryKey: overrides.categoryKey || "ongoingHealthcare",
    label: overrides.label || "Medical Out-of-Pocket",
    amount: overrides.amount === undefined ? 100 : overrides.amount,
    frequency: overrides.frequency || "monthly",
    termType: overrides.termType || "ongoing",
    annualizedAmount: overrides.annualizedAmount,
    oneTimeAmount: overrides.oneTimeAmount,
    sourcePath: overrides.sourcePath || "expenseFacts.expenses[0]",
    isFinalExpenseComponent: overrides.isFinalExpenseComponent === true,
    isHealthcareSensitive: overrides.isHealthcareSensitive !== false,
    isCustomExpense: overrides.isCustomExpense === true
  };
}

function createAnalysisSettings(options = {}) {
  const inflationOverrides = options.inflationAssumptions || {};
  const fundingOverrides = options.fundingTreatment || {};
  const supportOverrides = options.supportTreatment || {};
  const methodDefaultOverrides = options.methodDefaults || {};
  return {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      householdExpenseInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "inflation-assumptions-current-output-check",
      ...inflationOverrides
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: false,
        applyEducationInflation: true,
        educationStartAge: 18,
        fundingTargetPercent: 100,
        ...fundingOverrides
      },
      source: "inflation-assumptions-current-output-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: false,
        includeDiscretionarySupport: true,
        ...supportOverrides
      },
      source: "inflation-assumptions-current-output-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false,
      ...methodDefaultOverrides
    }
  };
}

function createAnalysisSettingsWithRawInflationAssumptions(inflationAssumptions, options = {}) {
  const settings = createAnalysisSettings(options);
  settings.inflationAssumptions = {
    enabled: true,
    source: "inflation-assumptions-current-output-check",
    ...(inflationAssumptions || {})
  };
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

function runAllForLensModel(adapter, methods, analysisSettings, lensModel) {
  const methodSettings = createMethodSettings(adapter, analysisSettings);
  return {
    methodSettings,
    results: {
      dime: methods.runDimeAnalysis(lensModel, cloneJson(methodSettings.dimeSettings)),
      needs: methods.runNeedsAnalysis(lensModel, cloneJson(methodSettings.needsAnalysisSettings)),
      hlv: methods.runHumanLifeValueAnalysis(lensModel, cloneJson(methodSettings.humanLifeValueSettings))
    }
  };
}

function findTrace(result, key) {
  return (Array.isArray(result?.trace) ? result.trace : []).find(function (entry) {
    return entry?.key === key;
  });
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

function dimeSnapshot(results) {
  return outputSnapshot(results).dime;
}

function hlvSnapshot(results) {
  return outputSnapshot(results).hlv;
}

function assertNoInflationMappedToDimeOrHlv(methodSettings, label) {
  assert.equal(hasOwn(methodSettings.dimeSettings, "inflationAssumptions"), false, `${label}: DIME settings should not include inflation assumptions.`);
  assert.equal(hasOwn(methodSettings.humanLifeValueSettings, "inflationAssumptions"), false, `${label}: HLV settings should not include inflation assumptions.`);
}

function assertSavedSupportFallbackToGeneral(adapter, methods, rawInflationAssumptions, label) {
  const run = runAllForAnalysisSettings(
    adapter,
    methods,
    createAnalysisSettingsWithRawInflationAssumptions(rawInflationAssumptions)
  );
  const inflationAssumptions = run.methodSettings.needsAnalysisSettings.inflationAssumptions;
  const essentialTrace = findTrace(run.results.needs, "essentialSupportInflation");
  const discretionaryTrace = findTrace(run.results.needs, "discretionarySupportInflation");

  assert.equal(
    hasOwn(inflationAssumptions, "householdExpenseInflationRatePercent"),
    false,
    `${label}: adapter should not default household inflation before the method can use general fallback.`
  );
  assert.equal(essentialTrace.inputs.ratePercent, 4, `${label}: essential support should use general inflation rate.`);
  assert.equal(
    essentialTrace.inputs.rateSource,
    "settings.inflationAssumptions.generalInflationRatePercent",
    `${label}: essential support trace should source general inflation fallback.`
  );
  assert.equal(discretionaryTrace.inputs.ratePercent, 4, `${label}: discretionary support should use general inflation rate.`);
  assert.equal(
    discretionaryTrace.inputs.rateSource,
    "settings.inflationAssumptions.generalInflationRatePercent",
    `${label}: discretionary support trace should source general inflation fallback.`
  );
}

function assertSavedEducationFallbackToGeneral(adapter, methods, rawInflationAssumptions, label) {
  const run = runAllForAnalysisSettings(
    adapter,
    methods,
    createAnalysisSettingsWithRawInflationAssumptions(rawInflationAssumptions, {
      fundingTreatment: {
        applyEducationInflation: true
      }
    })
  );
  const inflationAssumptions = run.methodSettings.needsAnalysisSettings.inflationAssumptions;
  const educationTrace = findTrace(run.results.needs, "educationFundingInflation");

  assert.equal(
    hasOwn(inflationAssumptions, "educationInflationRatePercent"),
    false,
    `${label}: adapter should not default education inflation before the method can use general fallback.`
  );
  assert.equal(educationTrace.inputs.ratePercent, 4, `${label}: education should use general inflation rate.`);
  assert.equal(
    educationTrace.inputs.rateSource,
    "settings.inflationAssumptions.generalInflationRatePercent",
    `${label}: education trace should source general inflation fallback.`
  );
  assert.ok(
    run.results.needs.components.education > 10000,
    `${label}: general fallback should still project current-child education.`
  );
}

function assertAdapterTraceTruthful(methodSettings) {
  const trace = Array.isArray(methodSettings.trace) ? methodSettings.trace : [];
  const staleInflationTrace = trace.find(function (entry) {
    return entry?.key === "inflationAssumptions-not-applied"
      || String(entry?.message || "").includes("not applied to current method results");
  });
  assert.equal(staleInflationTrace, undefined, "Adapter should not emit stale inflation-not-applied trace.");

  const inflationTrace = trace.find(function (entry) {
    return entry?.key === "inflationAssumptions-current-needs-and-future-use";
  });
  assert.ok(inflationTrace, "Adapter should emit truthful inflation current/future-use trace.");
  assert.match(inflationTrace.message, /current LENS support/);
  assert.match(inflationTrace.message, /current LENS education/);
  assert.match(inflationTrace.message, /healthcare inflation can affect current LENS medical final expense/);
  assert.match(inflationTrace.message, /LENS healthcareExpenses component when healthcare expense assumptions are enabled/);
  assert.match(inflationTrace.message, /final expense inflation can affect current LENS non-medical final expense/);
  assert.match(inflationTrace.message, /DIME and HLV remain unaffected/);
  assert.ok(
    inflationTrace.sourcePaths.includes("analysisSettings.inflationAssumptions"),
    "Adapter inflation trace should point to saved inflation assumptions."
  );
}

function createMethodOnlyNeedsSettings(options = {}) {
  const settings = createAnalysisSettings(options);
  return {
    valuationDate: settings.valuationDate,
    needsSupportDurationYears: 5,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false,
    includeEssentialSupport: true,
    includeTransitionNeeds: false,
    includeDiscretionarySupport: true,
    includeSurvivorIncomeOffset: false,
    inflationAssumptions: settings.inflationAssumptions,
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: false,
      applyEducationInflation: true,
      educationStartAge: 18,
      fundingTargetPercent: 100,
      source: "inflation-assumptions-current-output-check"
    }
  };
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const methods = lensAnalysis.analysisMethods;
const adapter = lensAnalysis.analysisSettingsAdapter;

assert.equal(typeof adapter?.createAnalysisMethodSettings, "function");
assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");
assert.equal(typeof lensAnalysis.calculateInflationProjection, "function");
assert.equal(typeof lensAnalysis.calculateEducationFundingProjection, "function");
assert.equal(typeof lensAnalysis.calculateFinalExpenseInflationProjection, "function");

const enabledRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    enabled: true,
    householdExpenseInflationRatePercent: 5,
    educationInflationRatePercent: 6
  }
}));
const disabledRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    enabled: false,
    householdExpenseInflationRatePercent: 5,
    educationInflationRatePercent: 6
  }
}));
assert.ok(
  enabledRun.results.needs.components.essentialSupport > disabledRun.results.needs.components.essentialSupport,
  "enabled=true should increase Needs essential support when household inflation is positive."
);
assert.ok(
  enabledRun.results.needs.components.discretionarySupport > disabledRun.results.needs.components.discretionarySupport,
  "enabled=true should increase Needs discretionary support when household inflation is positive."
);
assert.ok(
  enabledRun.results.needs.components.education > disabledRun.results.needs.components.education,
  "enabled=true should increase Needs education when education inflation is enabled."
);
let disabledEducationTrace = findTrace(disabledRun.results.needs, "educationFundingInflation");
assert.equal(disabledEducationTrace.inputs.applied, false);
assert.equal(disabledEducationTrace.inputs.reason, "inflation-assumptions-disabled-or-missing");
assertNoInflationMappedToDimeOrHlv(enabledRun.methodSettings, "enabled behavior");
assert.deepEqual(dimeSnapshot(enabledRun.results), dimeSnapshot(disabledRun.results), "DIME should be neutral to inflation enabled state.");
assert.deepEqual(hlvSnapshot(enabledRun.results), hlvSnapshot(disabledRun.results), "HLV should be neutral to inflation enabled state.");
assertAdapterTraceTruthful(enabledRun.methodSettings);

const householdLow = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 1,
    educationInflationRatePercent: 5
  }
}));
const householdHigh = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 7,
    educationInflationRatePercent: 5
  }
}));
assert.ok(
  householdHigh.results.needs.components.essentialSupport > householdLow.results.needs.components.essentialSupport,
  "Changing household inflation should change Needs essential support."
);
assert.ok(
  householdHigh.results.needs.components.discretionarySupport > householdLow.results.needs.components.discretionarySupport,
  "Changing household inflation should change Needs discretionary support."
);
let supportInflationTrace = findTrace(householdHigh.results.needs, "essentialSupportInflation");
let discretionaryInflationTrace = findTrace(householdHigh.results.needs, "discretionarySupportInflation");
assert.equal(
  supportInflationTrace.inputs.rateSource,
  "settings.inflationAssumptions.householdExpenseInflationRatePercent"
);
assert.equal(
  discretionaryInflationTrace.inputs.rateSource,
  "settings.inflationAssumptions.householdExpenseInflationRatePercent"
);
assert.equal(
  householdHigh.methodSettings.needsAnalysisSettings.inflationAssumptions.householdExpenseInflationRatePercent,
  7,
  "Valid saved household inflation should pass through unchanged."
);

assertSavedSupportFallbackToGeneral(adapter, methods, {
  enabled: true,
  generalInflationRatePercent: 4,
  educationInflationRatePercent: 5,
  healthcareInflationRatePercent: 5,
  finalExpenseInflationRatePercent: 3
}, "missing saved household inflation");
assertSavedSupportFallbackToGeneral(adapter, methods, {
  enabled: true,
  generalInflationRatePercent: 4,
  householdExpenseInflationRatePercent: "not-a-number",
  educationInflationRatePercent: 5,
  healthcareInflationRatePercent: 5,
  finalExpenseInflationRatePercent: 3
}, "invalid saved household inflation");

const supportFallbackSettings = createMethodOnlyNeedsSettings({
  inflationAssumptions: {
    enabled: true,
    generalInflationRatePercent: 4,
    educationInflationRatePercent: 5
  }
});
delete supportFallbackSettings.inflationAssumptions.householdExpenseInflationRatePercent;
const supportFallbackNeeds = methods.runNeedsAnalysis(createLensModel(), supportFallbackSettings);
supportInflationTrace = findTrace(supportFallbackNeeds, "essentialSupportInflation");
discretionaryInflationTrace = findTrace(supportFallbackNeeds, "discretionarySupportInflation");
assert.equal(supportInflationTrace.inputs.ratePercent, 4);
assert.equal(
  supportInflationTrace.inputs.rateSource,
  "settings.inflationAssumptions.generalInflationRatePercent"
);
assert.equal(
  discretionaryInflationTrace.inputs.rateSource,
  "settings.inflationAssumptions.generalInflationRatePercent"
);

const educationFallbackSettings = createMethodOnlyNeedsSettings({
  inflationAssumptions: {
    enabled: true,
    generalInflationRatePercent: 4,
    householdExpenseInflationRatePercent: 0
  }
});
delete educationFallbackSettings.inflationAssumptions.educationInflationRatePercent;
const educationFallbackNeeds = methods.runNeedsAnalysis(createLensModel(), educationFallbackSettings);
let educationInflationTrace = findTrace(educationFallbackNeeds, "educationFundingInflation");
assert.equal(educationInflationTrace.inputs.ratePercent, 4);
assert.equal(
  educationInflationTrace.inputs.rateSource,
  "settings.inflationAssumptions.generalInflationRatePercent"
);

assertSavedEducationFallbackToGeneral(adapter, methods, {
  enabled: true,
  generalInflationRatePercent: 4,
  householdExpenseInflationRatePercent: 0,
  healthcareInflationRatePercent: 5,
  finalExpenseInflationRatePercent: 3
}, "missing saved education inflation");
assertSavedEducationFallbackToGeneral(adapter, methods, {
  enabled: true,
  generalInflationRatePercent: 4,
  householdExpenseInflationRatePercent: 0,
  educationInflationRatePercent: "not-a-number",
  healthcareInflationRatePercent: 5,
  finalExpenseInflationRatePercent: 3
}, "invalid saved education inflation");

const educationLow = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 0,
    educationInflationRatePercent: 1
  },
  fundingTreatment: {
    applyEducationInflation: true
  }
}));
const educationHigh = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 0,
    educationInflationRatePercent: 8
  },
  fundingTreatment: {
    applyEducationInflation: true
  }
}));
assert.ok(
  educationHigh.results.needs.components.education > educationLow.results.needs.components.education,
  "Changing education inflation should change Needs education when education inflation is enabled."
);
educationInflationTrace = findTrace(educationHigh.results.needs, "educationFundingInflation");
assert.equal(
  educationInflationTrace.inputs.rateSource,
  "settings.inflationAssumptions.educationInflationRatePercent"
);
assert.equal(
  educationHigh.methodSettings.needsAnalysisSettings.inflationAssumptions.educationInflationRatePercent,
  8,
  "Valid saved education inflation should pass through unchanged."
);

const educationDisabledLow = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 0,
    educationInflationRatePercent: 1
  },
  fundingTreatment: {
    applyEducationInflation: false
  }
}));
const educationDisabledHigh = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 0,
    educationInflationRatePercent: 8
  },
  fundingTreatment: {
    applyEducationInflation: false
  }
}));
assert.equal(
  educationDisabledHigh.results.needs.components.education,
  educationDisabledLow.results.needs.components.education,
  "Education inflation rate should not change Needs education when education inflation application is disabled."
);

const healthcareLow = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 1,
    finalExpenseInflationRatePercent: 3
  }
}));
const healthcareHigh = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 9,
    finalExpenseInflationRatePercent: 3
  }
}));
assert.ok(
  healthcareHigh.results.needs.components.finalExpenses > healthcareLow.results.needs.components.finalExpenses,
  "Healthcare inflation should alter current Needs medical final expense when medical final expense exists."
);
assert.deepEqual(
  dimeSnapshot(healthcareHigh.results),
  dimeSnapshot(healthcareLow.results),
  "Healthcare inflation should not alter DIME output."
);
assert.deepEqual(
  hlvSnapshot(healthcareHigh.results),
  hlvSnapshot(healthcareLow.results),
  "Healthcare inflation should not alter HLV output."
);
assert.equal(
  healthcareHigh.methodSettings.needsAnalysisSettings.inflationAssumptions.healthcareInflationRatePercent,
  9,
  "Needs settings should carry saved healthcare inflation for medical final expense and healthcareExpenses."
);

const healthcareExpenseModel = createLensModel();
healthcareExpenseModel.expenseFacts = {
  expenses: [
    createHealthcareExpenseFact({
      amount: 100,
      frequency: "monthly",
      termType: "ongoing",
      annualizedAmount: 1200
    })
  ],
  totalsByBucket: {},
  metadata: {
    source: "inflation-assumptions-current-output-check"
  }
};
const healthcareExpenseLowSettings = createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 1,
    finalExpenseInflationRatePercent: 3
  }
});
healthcareExpenseLowSettings.healthcareExpenseAssumptions = {
  enabled: true,
  projectionYears: 2,
  includeOneTimeHealthcareExpenses: false,
  oneTimeProjectionMode: "currentDollarOnly",
  source: "inflation-assumptions-current-output-check"
};
const healthcareExpenseHighSettings = createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 9,
    finalExpenseInflationRatePercent: 3
  }
});
healthcareExpenseHighSettings.healthcareExpenseAssumptions = {
  ...healthcareExpenseLowSettings.healthcareExpenseAssumptions
};
const healthcareExpenseLowRun = runAllForLensModel(
  adapter,
  methods,
  healthcareExpenseLowSettings,
  healthcareExpenseModel
);
const healthcareExpenseHighRun = runAllForLensModel(
  adapter,
  methods,
  healthcareExpenseHighSettings,
  healthcareExpenseModel
);
assert.ok(
  healthcareExpenseHighRun.results.needs.components.healthcareExpenses
    > healthcareExpenseLowRun.results.needs.components.healthcareExpenses,
  "Healthcare inflation should alter Needs healthcareExpenses when healthcare expense assumptions are enabled."
);
assert.deepEqual(
  dimeSnapshot(healthcareExpenseHighRun.results),
  dimeSnapshot(healthcareExpenseLowRun.results),
  "Healthcare expense inflation should not alter DIME output."
);
assert.deepEqual(
  hlvSnapshot(healthcareExpenseHighRun.results),
  hlvSnapshot(healthcareExpenseLowRun.results),
  "Healthcare expense inflation should not alter HLV output."
);

const finalExpenseLow = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: 1,
    finalExpenseTargetAge: 85
  }
}));
const finalExpenseHigh = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: 9,
    finalExpenseTargetAge: 85
  }
}));
assert.ok(
  finalExpenseHigh.results.needs.components.finalExpenses > finalExpenseLow.results.needs.components.finalExpenses,
  "Final expense inflation should alter current Needs final expenses when DOB, valuation date, and target age are valid."
);
assert.ok(
  finalExpenseHigh.results.needs.grossNeed > finalExpenseLow.results.needs.grossNeed,
  "Final expense inflation should alter current Needs gross need when valid."
);
assert.deepEqual(
  dimeSnapshot(finalExpenseHigh.results),
  dimeSnapshot(finalExpenseLow.results),
  "Final expense inflation should not alter DIME output."
);
assert.deepEqual(
  hlvSnapshot(finalExpenseHigh.results),
  hlvSnapshot(finalExpenseLow.results),
  "Final expense inflation should not alter HLV output."
);
assert.equal(
  finalExpenseHigh.methodSettings.needsAnalysisSettings.inflationAssumptions.finalExpenseInflationRatePercent,
  9,
  "Needs settings should carry saved current-output final expense inflation."
);

console.log("Inflation Assumptions current-output check passed.");
