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
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  function loadScript(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  [
    "app/features/coverage/coverage-policy-utils.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/block-outputs.js",
    "app/features/lens-analysis/helpers/income-tax-calculations.js",
    "app/features/lens-analysis/helpers/housing-support-calculations.js",
    "app/features/lens-analysis/blocks/existing-coverage.js",
    "app/features/lens-analysis/blocks/offset-assets.js",
    "app/features/lens-analysis/blocks/survivor-scenario.js",
    "app/features/lens-analysis/blocks/tax-context.js",
    "app/features/lens-analysis/blocks/income-net-income.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/blocks/housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/non-housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/education-support.js",
    "app/features/lens-analysis/blocks/final-expenses.js",
    "app/features/lens-analysis/blocks/transition-needs.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
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
      survivorIncomeStartDelayMonths: 0,
      survivorIncomeDerivation: {
        survivorIncomeSource: "derived-from-spouse-income",
        rawSpouseIncome: 32000,
        rawSpouseIncomeSourcePath: "protectionModeling.data.spouseIncome",
        survivorIncomeDerivedFromSpouseIncome: true,
        legacySurvivorIncomeFallbackUsed: false,
        survivorContinuesWorking: true,
        expectedSurvivorWorkReductionPercent: 25,
        adjustedSurvivorGrossIncome: 24000,
        survivorNetAnnualIncomePrepared: 24000,
        applyStartDelay: true,
        survivorIncomeStartDelayMonths: 0,
        fallbackReasons: [],
        warnings: []
      }
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
  const survivorScenario = {
    ...(overrides.survivorScenario || {})
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
      supportTreatment,
      survivorScenario
    }
  };
}

function createNeedsSettings(adapter, overrides) {
  return adapter.createNeedsAnalysisSettings({
    analysisSettings: createAnalysisSettings(overrides)
  });
}

function createBuilderSourceData(overrides = {}) {
  return {
    grossAnnualIncome: 120000,
    spouseIncome: 80000,
    annualMortgagePayment: 0,
    monthlyRent: 0,
    monthlyNonHousingEssentialExpenses: 5000,
    totalDebtPayoffNeed: 0,
    totalEducationFundingNeed: 0,
    totalFinalExpenseNeed: 0,
    totalTransitionNeed: 10000,
    ...overrides
  };
}

function buildLensModelResult(lensAnalysis, options = {}) {
  const analysisSettings = createAnalysisSettings(options.overrides || {});
  if (options.omitSurvivorSupportAssumptions) {
    delete analysisSettings.survivorSupportAssumptions;
  }
  const input = {
    sourceData: createBuilderSourceData(options.sourceData || {}),
    analysisSettings,
    profileRecord: {
      analysisSettings,
      coveragePolicies: []
    }
  };
  const inputBefore = cloneJson(input);
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling(input);
  assert.deepEqual(cloneJson(input), inputBefore, "Lens model builder must not mutate survivor support inputs.");
  assert.ok(result.lensModel, "Lens model should build for survivor support derivation checks.");
  return result;
}

function buildLensModel(lensAnalysis, options = {}) {
  return buildLensModelResult(lensAnalysis, options).lensModel;
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
assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");

const derivedModel = buildLensModel(lensAnalysis, {
  sourceData: {
    survivorContinuesWorking: "No",
    spouseExpectedWorkReductionAtDeath: 100,
    survivorIncome: 999999,
    survivorNetAnnualIncome: 999999,
    survivorIncomeStartDelayMonths: 18
  },
  overrides: {
    survivorIncomeTreatment: {
      includeSurvivorIncome: true,
      applyStartDelay: true
    },
    survivorScenario: {
      survivorContinuesWorking: true,
      expectedSurvivorWorkReductionPercent: 25,
      survivorIncomeStartDelayMonths: 6
    }
  }
});
assert.equal(derivedModel.survivorScenario.survivorGrossAnnualIncome, 60000, "Spouse income and work reduction should prepare adjusted survivor gross income.");
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.survivorIncomeSource, "derived-from-spouse-income");
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.rawSpouseIncome, 80000);
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.expectedSurvivorWorkReductionPercent, 25);
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.adjustedSurvivorGrossIncome, 60000);
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.applyStartDelay, true);
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.survivorIncomeStartDelayMonths, 6);
assert.equal(derivedModel.survivorScenario.survivorIncomeDerivation.legacySurvivorIncomeFallbackUsed, false);
assert.deepEqual(
  Array.from(derivedModel.survivorScenario.survivorIncomeDerivation.ignoredLegacySurvivorFields).sort(),
  [
    "spouseExpectedWorkReductionAtDeath",
    "survivorContinuesWorking",
    "survivorIncome",
    "survivorIncomeStartDelayMonths",
    "survivorNetAnnualIncome"
  ].sort(),
  "Analysis Setup survivor assumptions should beat conflicting legacy PMI survivor fields."
);
assert.equal(
  derivedModel.survivorScenario.survivorIncomeDerivation.survivorNetAnnualIncomePrepared,
  derivedModel.survivorScenario.survivorNetAnnualIncome ?? null,
  "Survivor derivation metadata should match the model-prepared survivor net income when available."
);

const noStartDelayModel = buildLensModel(lensAnalysis, {
  overrides: {
    survivorIncomeTreatment: {
      includeSurvivorIncome: true,
      applyStartDelay: false
    },
    survivorScenario: {
      survivorContinuesWorking: true,
      expectedSurvivorWorkReductionPercent: 25,
      survivorIncomeStartDelayMonths: 9
    }
  }
});
assert.equal(noStartDelayModel.survivorScenario.survivorIncomeStartDelayMonths, 0, "applyStartDelay=false should prepare a zero survivor income delay.");
assert.equal(noStartDelayModel.survivorScenario.survivorIncomeDerivation.applyStartDelay, false);

const legacyIgnoredResult = buildLensModelResult(lensAnalysis, {
  sourceData: {
    spouseIncome: "",
    survivorIncome: 36000,
    survivorNetAnnualIncome: 24000
  },
  overrides: {
    survivorScenario: {
      survivorContinuesWorking: true,
      expectedSurvivorWorkReductionPercent: 25
    }
  }
});
const legacyIgnoredModel = legacyIgnoredResult.lensModel;
assert.equal(legacyIgnoredModel.survivorScenario.survivorNetAnnualIncome, null, "Legacy survivor net income should not prepare survivor income when spouse income is missing.");
assert.equal(legacyIgnoredModel.survivorScenario.survivorGrossAnnualIncome, null, "Legacy survivor gross income should not prepare survivor income when spouse income is missing.");
assert.equal(legacyIgnoredModel.survivorScenario.survivorIncomeDerivation.legacySurvivorIncomeFallbackUsed, false);
assert.equal(legacyIgnoredModel.survivorScenario.survivorIncomeDerivation.survivorIncomeSource, "missing-spouse-income");
assert.ok(
  legacyIgnoredModel.survivorScenario.survivorIncomeDerivation.ignoredLegacySurvivorFields.includes("survivorIncome")
    && legacyIgnoredModel.survivorScenario.survivorIncomeDerivation.ignoredLegacySurvivorFields.includes("survivorNetAnnualIncome"),
  "Legacy survivor gross/net fields should be recorded as ignored metadata only."
);
assert.ok(
  legacyIgnoredModel.survivorScenario.survivorIncomeDerivation.warnings.some((warning) => warning.code === "missing-spouse-income-for-survivor-income-derivation"),
  "Missing spouse income should carry an explicit derivation warning."
);
assert.ok(
  legacyIgnoredModel.survivorScenario.survivorIncomeDerivation.warnings.some((warning) => warning.code === "legacy-survivor-fields-ignored"),
  "Ignored legacy survivor fields should be warning-backed in derivation metadata."
);
assert.ok(
  legacyIgnoredResult.warnings.some((warning) => warning.code === "legacy-survivor-fields-ignored"),
  "Ignored legacy survivor fields should be warning-backed at model-builder level."
);

const defaultedSurvivorResult = buildLensModelResult(lensAnalysis, {
  omitSurvivorSupportAssumptions: true,
  sourceData: {
    survivorContinuesWorking: "No",
    spouseExpectedWorkReductionAtDeath: 100,
    survivorIncomeStartDelayMonths: 18,
    survivorIncome: 999999,
    survivorNetAnnualIncome: 999999
  }
});
const defaultedSurvivorModel = defaultedSurvivorResult.lensModel;
assert.equal(defaultedSurvivorModel.survivorScenario.survivorContinuesWorking, true, "Missing Analysis Setup assumptions should use default survivor continues working.");
assert.equal(defaultedSurvivorModel.survivorScenario.expectedSurvivorWorkReductionPercent, 25, "Missing Analysis Setup assumptions should use default work reduction.");
assert.equal(defaultedSurvivorModel.survivorScenario.survivorIncomeStartDelayMonths, 3, "Missing Analysis Setup assumptions should use default survivor income delay.");
assert.equal(defaultedSurvivorModel.survivorScenario.survivorIncomeDerivation.survivorSupportAssumptionsSource, "defaulted-analysis-setup-survivor-support");
assert.equal(defaultedSurvivorModel.survivorScenario.survivorIncomeDerivation.survivorSupportAssumptionsDefaulted, true);
assert.equal(defaultedSurvivorModel.survivorScenario.survivorIncomeDerivation.survivorIncomeSource, "derived-from-spouse-income");
assert.equal(defaultedSurvivorModel.survivorScenario.survivorIncomeDerivation.adjustedSurvivorGrossIncome, 60000);
assert.deepEqual(
  Array.from(defaultedSurvivorModel.survivorScenario.survivorIncomeDerivation.ignoredLegacySurvivorFields).sort(),
  [
    "spouseExpectedWorkReductionAtDeath",
    "survivorContinuesWorking",
    "survivorIncome",
    "survivorIncomeStartDelayMonths",
    "survivorNetAnnualIncome"
  ].sort(),
  "Missing Analysis Setup defaults should still ignore conflicting legacy PMI survivor fields."
);
assert.ok(
  defaultedSurvivorResult.warnings.some((warning) => warning.code === "missing-survivor-support-assumptions-defaulted"),
  "Missing Analysis Setup survivor assumptions should carry an explicit default warning."
);

const baseModel = createModel();
const defaultNeedsSettings = createNeedsSettings(adapter, {});
assert.equal(defaultNeedsSettings.includeEssentialSupport, true, "Adapter should default includeEssentialSupport to true.");

const includedNeeds = runNeeds(methods, adapter, baseModel, {});
let essentialTrace = findTrace(includedNeeds, "essentialSupport");
let inflationTrace = findTrace(includedNeeds, "essentialSupportInflation");
let survivorOffsetTrace = findTrace(includedNeeds, "survivorIncomeOffset");
let survivorDerivationTrace = findTrace(includedNeeds, "survivorIncomeDerivation");
assert.equal(includedNeeds.components.essentialSupport, 360000, "Default Needs should include essential support reduced by survivor income.");
assert.equal(includedNeeds.commonOffsets.survivorIncomeOffset, 240000, "Default survivor income offset should be applied inside included essential support.");
assert.equal(essentialTrace.inputs.includeEssentialSupport, true);
assert.equal(essentialTrace.inputs.essentialSupportPreExclusionAmount, 600000);
assert.equal(essentialTrace.inputs.essentialSupportIncludedAmount, 360000);
assert.equal(inflationTrace.inputs.includeEssentialSupport, true);
assert.equal(survivorOffsetTrace.inputs.survivorIncomeOffsetApplied, true);
assert.equal(survivorDerivationTrace.inputs.survivorIncomeSource, "derived-from-spouse-income");
assert.equal(survivorDerivationTrace.inputs.rawSpouseIncome, 32000);
assert.equal(survivorDerivationTrace.inputs.workReductionPercent, 25);
assert.equal(survivorDerivationTrace.inputs.survivorNetAnnualIncomeUsed, 24000);
assert.equal(survivorDerivationTrace.inputs.survivorIncomeOffsetApplied, true);

const excludedNeeds = runNeeds(methods, adapter, baseModel, {
  supportTreatment: {
    includeEssentialSupport: false
  }
});
essentialTrace = findTrace(excludedNeeds, "essentialSupport");
inflationTrace = findTrace(excludedNeeds, "essentialSupportInflation");
survivorOffsetTrace = findTrace(excludedNeeds, "survivorIncomeOffset");
survivorDerivationTrace = findTrace(excludedNeeds, "survivorIncomeDerivation");
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
assert.equal(survivorDerivationTrace.inputs.survivorIncomeSuppressionReason, "essential-support-excluded");

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

const durationOverrideNeeds = runNeeds(methods, adapter, baseModel, {
  supportTreatment: {
    supportDurationYears: 5
  }
});
survivorDerivationTrace = findTrace(durationOverrideNeeds, "survivorIncomeDerivation");
assert.equal(durationOverrideNeeds.components.essentialSupport, 180000, "Support duration override should still change Needs essential support.");
assert.equal(survivorDerivationTrace.inputs.supportDurationYears, 5);

const delayedModel = createModel();
delayedModel.survivorScenario.survivorIncomeStartDelayMonths = 12;
delayedModel.survivorScenario.survivorIncomeDerivation.survivorIncomeStartDelayMonths = 12;
const delayedNeeds = runNeeds(methods, adapter, delayedModel, {});
survivorOffsetTrace = findTrace(delayedNeeds, "survivorIncomeOffset");
survivorDerivationTrace = findTrace(delayedNeeds, "survivorIncomeDerivation");
assert.equal(delayedNeeds.components.essentialSupport, 384000, "Survivor income start delay should preserve support need before income starts.");
assert.equal(delayedNeeds.commonOffsets.survivorIncomeOffset, 216000);
assert.equal(survivorOffsetTrace.inputs.survivorIncomeStartDelayMonths, 12);
assert.equal(survivorDerivationTrace.inputs.survivorIncomeStartDelayMonths, 12);

const survivorNotWorkingModel = createModel();
survivorNotWorkingModel.survivorScenario.survivorContinuesWorking = false;
survivorNotWorkingModel.survivorScenario.survivorNetAnnualIncome = 24000;
survivorNotWorkingModel.survivorScenario.survivorIncomeDerivation = {
  survivorIncomeSource: "suppressed-survivor-not-working",
  rawSpouseIncome: 32000,
  survivorContinuesWorking: false,
  expectedSurvivorWorkReductionPercent: 25,
  adjustedSurvivorGrossIncome: null,
  survivorNetAnnualIncomePrepared: null,
  applyStartDelay: true,
  survivorIncomeStartDelayMonths: 0
};
const survivorNotWorkingNeeds = runNeeds(methods, adapter, survivorNotWorkingModel, {});
survivorDerivationTrace = findTrace(survivorNotWorkingNeeds, "survivorIncomeDerivation");
assert.equal(survivorNotWorkingNeeds.components.essentialSupport, 600000, "survivorContinuesWorking=false should suppress survivor income offset.");
assert.equal(survivorNotWorkingNeeds.commonOffsets.survivorIncomeOffset, 0);
assert.equal(survivorDerivationTrace.inputs.survivorIncomeSuppressionReason, "survivor-not-working");

const survivorIncomeOffNeeds = runNeeds(methods, adapter, baseModel, {
  survivorIncomeTreatment: {
    includeSurvivorIncome: false
  }
});
survivorOffsetTrace = findTrace(survivorIncomeOffNeeds, "survivorIncomeOffset");
survivorDerivationTrace = findTrace(survivorIncomeOffNeeds, "survivorIncomeDerivation");
assert.equal(survivorIncomeOffNeeds.components.essentialSupport, 600000, "Survivor income offset off should keep full essential support.");
assert.equal(survivorIncomeOffNeeds.commonOffsets.survivorIncomeOffset, 0, "Survivor income offset off should not reduce support.");
assert.equal(survivorOffsetTrace.inputs.includeSurvivorIncomeOffset, false);
assert.equal(survivorDerivationTrace.inputs.survivorIncomeSuppressionReason, "survivor-income-offset-disabled");

const noMethodDelayNeeds = runNeeds(methods, adapter, noStartDelayModel, {});
survivorDerivationTrace = findTrace(noMethodDelayNeeds, "survivorIncomeDerivation");
assert.equal(survivorDerivationTrace.inputs.applyStartDelay, false);
assert.equal(survivorDerivationTrace.inputs.survivorIncomeStartDelayMonths, 0);

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
