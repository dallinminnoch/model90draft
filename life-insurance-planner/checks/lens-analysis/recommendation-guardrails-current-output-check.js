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
  loadScript(context, "app/features/lens-analysis/analysis-methods.js");
  loadScript(context, "app/features/lens-analysis/analysis-settings-adapter.js");
  return context;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function createLensModel() {
  return {
    incomeBasis: {
      annualIncomeReplacementBase: 47123,
      insuredRetirementHorizonYears: 17
    },
    debtPayoff: {
      totalDebtPayoffNeed: 164321,
      mortgageBalance: 73555
    },
    educationSupport: {
      totalEducationFundingNeed: 28333
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 61234,
      annualDiscretionaryPersonalSpending: 4321
    },
    finalExpenses: {
      totalFinalExpenseNeed: 18777
    },
    transitionNeeds: {
      totalTransitionNeed: 12345
    },
    existingCoverage: {
      totalExistingCoverage: 27111
    }
  };
}

function createRecommendationGuardrails(roundingIncrement, options = {}) {
  return {
    enabled: false,
    source: "analysis-setup",
    recommendationProfile: "balanced",
    recommendationTarget: {
      mode: "close-practical-gap",
      minimumCoverageFloor: 25000,
      maximumCoverageCap: 1000000,
      roundingIncrement
    },
    riskThresholds: {
      assetReliance: {
        warningThresholdPercent: 40
      },
      illiquidAssetReliance: {
        warningThresholdPercent: 25
      },
      survivorIncomeReliance: {
        warningThresholdPercent: 35
      }
    },
    rangeConstraints: {
      lowerBound: {
        source: "needsAnalysis",
        tolerancePercent: 25
      },
      upperBound: {
        source: "humanLifeValue",
        tolerancePercent: 25
      },
      conflictHandling: "flagForAdvisorReview"
    },
    riskFlags: {
      flagMissingCriticalInputs: true,
      flagHeavyAssetReliance: true,
      flagHeavySurvivorIncomeReliance: true,
      flagGroupCoverageReliance: true
    },
    ...options
  };
}

function createMethodSettings(adapter, recommendationGuardrails, extraAnalysisSettings = {}) {
  return adapter.createAnalysisMethodSettings({
    analysisSettings: {
      recommendationGuardrails,
      ...extraAnalysisSettings
    },
    lensModel: createLensModel(),
    profileRecord: {}
  });
}

function runAllMethods(methods, lensModel, methodSettings) {
  return {
    dime: methods.runDimeAnalysis(lensModel, methodSettings.dimeSettings),
    needs: methods.runNeedsAnalysis(lensModel, methodSettings.needsAnalysisSettings),
    hlv: methods.runHumanLifeValueAnalysis(lensModel, methodSettings.humanLifeValueSettings)
  };
}

function extractComparableOutputs(results) {
  return {
    dime: {
      grossNeed: results.dime.grossNeed,
      netCoverageGap: results.dime.netCoverageGap
    },
    needs: {
      grossNeed: results.needs.grossNeed,
      netCoverageGap: results.needs.netCoverageGap
    },
    hlv: {
      grossNeed: results.hlv.grossNeed,
      grossHumanLifeValue: results.hlv.grossHumanLifeValue,
      netCoverageGap: results.hlv.netCoverageGap
    }
  };
}

function assertNoRecommendationGuardrailsInSettings(methodSettings, message) {
  assert.equal(hasOwn(methodSettings.dimeSettings, "roundingIncrement"), false, `${message}: DIME settings should not include guardrail rounding.`);
  assert.equal(hasOwn(methodSettings.needsAnalysisSettings, "roundingIncrement"), false, `${message}: Needs settings should not include guardrail rounding.`);
  assert.equal(hasOwn(methodSettings.humanLifeValueSettings, "roundingIncrement"), false, `${message}: HLV settings should not include guardrail rounding.`);
  assert.equal(hasOwn(methodSettings.dimeSettings, "recommendationGuardrails"), false, `${message}: DIME settings should not include Recommendation Guardrails state.`);
  assert.equal(hasOwn(methodSettings.needsAnalysisSettings, "recommendationGuardrails"), false, `${message}: Needs settings should not include Recommendation Guardrails state.`);
  assert.equal(hasOwn(methodSettings.humanLifeValueSettings, "recommendationGuardrails"), false, `${message}: HLV settings should not include Recommendation Guardrails state.`);
  assert.equal(hasOwn(methodSettings.dimeSettings, "recommendationGuardrailsEnabled"), false, `${message}: DIME settings should not include Recommendation Guardrails enabled state.`);
  assert.equal(hasOwn(methodSettings.needsAnalysisSettings, "recommendationGuardrailsEnabled"), false, `${message}: Needs settings should not include Recommendation Guardrails enabled state.`);
  assert.equal(hasOwn(methodSettings.humanLifeValueSettings, "recommendationGuardrailsEnabled"), false, `${message}: HLV settings should not include Recommendation Guardrails enabled state.`);
  [
    "riskTolerance",
    "riskThresholds",
    "riskFlags",
    "confidenceRules",
    "assetReliance",
    "illiquidAssetReliance",
    "survivorIncomeReliance",
    "flagMissingCriticalInputs",
    "flagHeavyAssetReliance",
    "flagHeavySurvivorIncomeReliance",
    "flagGroupCoverageReliance",
    "assetRelianceWarningThresholdPercent",
    "illiquidAssetRelianceWarningThresholdPercent",
    "survivorIncomeRelianceWarningThresholdPercent",
    "warningThresholdPercent",
    "rangeConstraints",
    "recommendationRangeConstraints",
    "lowerBound",
    "upperBound",
    "lowerBoundSource",
    "upperBoundSource",
    "lowerBoundTolerancePercent",
    "upperBoundTolerancePercent",
    "tolerancePercent",
    "conflictHandling",
    "rangeConflictHandling"
  ].forEach((key) => {
    assert.equal(hasOwn(methodSettings.dimeSettings, key), false, `${message}: DIME settings should not include Recommendation Guardrails ${key}.`);
    assert.equal(hasOwn(methodSettings.needsAnalysisSettings, key), false, `${message}: Needs settings should not include Recommendation Guardrails ${key}.`);
    assert.equal(hasOwn(methodSettings.humanLifeValueSettings, key), false, `${message}: HLV settings should not include Recommendation Guardrails ${key}.`);
  });
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.includes("analysisSettings.recommendationGuardrails.roundingIncrement")
    )),
    false,
    `${message}: adapter trace should not source method rounding from Recommendation Guardrails.`
  );
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.includes("analysisSettings.recommendationGuardrails.enabled")
    )),
    false,
    `${message}: adapter trace should not source method behavior from Recommendation Guardrails enabled state.`
  );
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.some((sourcePath) => sourcePath.indexOf("analysisSettings.recommendationGuardrails.rangeConstraints") === 0)
    )),
    false,
    `${message}: adapter trace should not source method behavior from Recommendation Guardrails range constraints.`
  );
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.some((sourcePath) => sourcePath.indexOf("analysisSettings.recommendationGuardrails.riskThresholds") === 0)
    )),
    false,
    `${message}: adapter trace should not source method behavior from Recommendation Guardrails risk thresholds.`
  );
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.some((sourcePath) => sourcePath.indexOf("analysisSettings.recommendationGuardrails.riskFlags") === 0)
    )),
    false,
    `${message}: adapter trace should not source method behavior from Recommendation Guardrails risk flags.`
  );
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.some((sourcePath) => sourcePath.indexOf("analysisSettings.recommendationGuardrails.confidenceRules") === 0)
    )),
    false,
    `${message}: adapter trace should not source method behavior from retired Recommendation Guardrails confidence rules.`
  );
  assert.equal(
    methodSettings.trace.some((entry) => (
      Array.isArray(entry?.sourcePaths)
      && entry.sourcePaths.some((sourcePath) => sourcePath.indexOf("analysisSettings.recommendationGuardrails.riskTolerance") === 0)
    )),
    false,
    `${message}: adapter trace should not source method behavior from retired Recommendation Guardrails risk tolerance.`
  );
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const methods = lensAnalysis.analysisMethods;
const adapter = lensAnalysis.analysisSettingsAdapter;

assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");
assert.equal(typeof adapter?.createAnalysisMethodSettings, "function");

const lensModel = createLensModel();
const baselineSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000)
);
const enabledSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    enabled: true
  })
);
const nestedChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(50000)
);
const legacyTopLevelSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    roundingIncrement: 50000
  })
);
const assetThresholdChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskThresholds: {
      assetReliance: {
        warningThresholdPercent: 5
      },
      illiquidAssetReliance: {
        warningThresholdPercent: 25
      },
      survivorIncomeReliance: {
        warningThresholdPercent: 35
      }
    }
  })
);
const illiquidAssetThresholdChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskThresholds: {
      assetReliance: {
        warningThresholdPercent: 40
      },
      illiquidAssetReliance: {
        warningThresholdPercent: 5
      },
      survivorIncomeReliance: {
        warningThresholdPercent: 35
      }
    }
  })
);
const survivorIncomeThresholdChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskThresholds: {
      assetReliance: {
        warningThresholdPercent: 40
      },
      illiquidAssetReliance: {
        warningThresholdPercent: 25
      },
      survivorIncomeReliance: {
        warningThresholdPercent: 5
      }
    }
  })
);
const lowerBoundChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    rangeConstraints: {
      lowerBound: {
        source: "dime",
        tolerancePercent: 5
      },
      upperBound: {
        source: "humanLifeValue",
        tolerancePercent: 25
      },
      conflictHandling: "flagForAdvisorReview"
    }
  })
);
const upperBoundChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    rangeConstraints: {
      lowerBound: {
        source: "needsAnalysis",
        tolerancePercent: 25
      },
      upperBound: {
        source: "needsAnalysis",
        tolerancePercent: 45
      },
      conflictHandling: "flagForAdvisorReview"
    }
  })
);
const conflictHandlingChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    rangeConstraints: {
      lowerBound: {
        source: "needsAnalysis",
        tolerancePercent: 25
      },
      upperBound: {
        source: "humanLifeValue",
        tolerancePercent: 25
      },
      conflictHandling: "futureCustomConflictHandling"
    }
  })
);
const missingCriticalInputsFlagChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskFlags: {
      flagMissingCriticalInputs: false,
      flagHeavyAssetReliance: true,
      flagHeavySurvivorIncomeReliance: true,
      flagGroupCoverageReliance: true
    }
  })
);
const heavyAssetRelianceFlagChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskFlags: {
      flagMissingCriticalInputs: true,
      flagHeavyAssetReliance: false,
      flagHeavySurvivorIncomeReliance: true,
      flagGroupCoverageReliance: true
    }
  })
);
const heavySurvivorIncomeRelianceFlagChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskFlags: {
      flagMissingCriticalInputs: true,
      flagHeavyAssetReliance: true,
      flagHeavySurvivorIncomeReliance: false,
      flagGroupCoverageReliance: true
    }
  })
);
const groupCoverageRelianceFlagChangedSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000, {
    riskFlags: {
      flagMissingCriticalInputs: true,
      flagHeavyAssetReliance: true,
      flagHeavySurvivorIncomeReliance: true,
      flagGroupCoverageReliance: false
    }
  })
);

assertNoRecommendationGuardrailsInSettings(baselineSettings, "Baseline nested guardrails");
assertNoRecommendationGuardrailsInSettings(enabledSettings, "Enabled future-use guardrails");
assertNoRecommendationGuardrailsInSettings(nestedChangedSettings, "Changed nested guardrails");
assertNoRecommendationGuardrailsInSettings(legacyTopLevelSettings, "Legacy top-level guardrails");
assertNoRecommendationGuardrailsInSettings(assetThresholdChangedSettings, "Changed asset reliance threshold");
assertNoRecommendationGuardrailsInSettings(illiquidAssetThresholdChangedSettings, "Changed illiquid asset reliance threshold");
assertNoRecommendationGuardrailsInSettings(survivorIncomeThresholdChangedSettings, "Changed survivor income reliance threshold");
assertNoRecommendationGuardrailsInSettings(lowerBoundChangedSettings, "Changed lower range constraints");
assertNoRecommendationGuardrailsInSettings(upperBoundChangedSettings, "Changed upper range constraints");
assertNoRecommendationGuardrailsInSettings(conflictHandlingChangedSettings, "Changed range conflict handling");
assertNoRecommendationGuardrailsInSettings(missingCriticalInputsFlagChangedSettings, "Changed missing critical inputs risk flag");
assertNoRecommendationGuardrailsInSettings(heavyAssetRelianceFlagChangedSettings, "Changed heavy asset reliance risk flag");
assertNoRecommendationGuardrailsInSettings(heavySurvivorIncomeRelianceFlagChangedSettings, "Changed heavy survivor income reliance risk flag");
assertNoRecommendationGuardrailsInSettings(groupCoverageRelianceFlagChangedSettings, "Changed group coverage reliance risk flag");

const baselineOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, baselineSettings)
);
const nestedChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, nestedChangedSettings)
);
const enabledOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, enabledSettings)
);
const legacyTopLevelOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, legacyTopLevelSettings)
);
const assetThresholdChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, assetThresholdChangedSettings)
);
const illiquidAssetThresholdChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, illiquidAssetThresholdChangedSettings)
);
const survivorIncomeThresholdChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, survivorIncomeThresholdChangedSettings)
);
const lowerBoundChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, lowerBoundChangedSettings)
);
const upperBoundChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, upperBoundChangedSettings)
);
const conflictHandlingChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, conflictHandlingChangedSettings)
);
const missingCriticalInputsFlagChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, missingCriticalInputsFlagChangedSettings)
);
const heavyAssetRelianceFlagChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, heavyAssetRelianceFlagChangedSettings)
);
const heavySurvivorIncomeRelianceFlagChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, heavySurvivorIncomeRelianceFlagChangedSettings)
);
const groupCoverageRelianceFlagChangedOutputs = extractComparableOutputs(
  runAllMethods(methods, lensModel, groupCoverageRelianceFlagChangedSettings)
);

assert.deepEqual(
  enabledOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails enabled from false to true should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  nestedChangedOutputs,
  baselineOutputs,
  "Changing visible nested Recommendation Guardrails rounding should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  legacyTopLevelOutputs,
  baselineOutputs,
  "Legacy top-level Recommendation Guardrails rounding should be ignored by current method outputs."
);
assert.deepEqual(
  assetThresholdChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails asset reliance threshold should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  illiquidAssetThresholdChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails illiquid asset reliance threshold should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  survivorIncomeThresholdChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails survivor income reliance threshold should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  lowerBoundChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails lower range constraints should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  upperBoundChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails upper range constraints should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  conflictHandlingChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails conflict handling should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  missingCriticalInputsFlagChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails missing critical inputs risk flag should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  heavyAssetRelianceFlagChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails heavy asset reliance risk flag should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  heavySurvivorIncomeRelianceFlagChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails heavy survivor income reliance risk flag should not alter DIME, Needs, or HLV outputs."
);
assert.deepEqual(
  groupCoverageRelianceFlagChangedOutputs,
  baselineOutputs,
  "Changing Recommendation Guardrails group coverage reliance risk flag should not alter DIME, Needs, or HLV outputs."
);

const methodDefaultsRoundingSettings = createMethodSettings(
  adapter,
  createRecommendationGuardrails(1000),
  {
    methodDefaults: {
      roundingIncrement: 50000
    }
  }
);
assert.equal(
  methodDefaultsRoundingSettings.dimeSettings.roundingIncrement,
  50000,
  "Method Defaults rounding should remain mapped for DIME if present."
);
assert.equal(
  methodDefaultsRoundingSettings.needsAnalysisSettings.roundingIncrement,
  50000,
  "Method Defaults rounding should remain mapped for Needs if present."
);
assert.equal(
  methodDefaultsRoundingSettings.humanLifeValueSettings.roundingIncrement,
  50000,
  "Method Defaults rounding should remain mapped for HLV settings if present."
);

console.log("Recommendation Guardrails current-output check passed.");
