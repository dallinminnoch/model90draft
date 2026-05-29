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
    LensApp: {
      lensAnalysis: {}
    },
    location: {
      href: "http://localhost/pages/coverage-strategy.html"
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function createNeedPoints(horizonYears) {
  return Array.from({ length: horizonYears + 1 }, function (_unused, yearIndex) {
    const calendarYear = 2026 + yearIndex;
    return {
      yearIndex,
      calendarYear,
      date: `${calendarYear}-01-01`,
      age: 46 + yearIndex
    };
  });
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item && item.code).filter(Boolean);
}

function createEducationProjectionInput(scenarioSettings) {
  return {
    valuationDate: "2026-01-01",
    needPoints: createNeedPoints(6),
    educationSupport: {
      linkedDependentCount: 1,
      desiredAdditionalDependentCount: 0,
      perLinkedDependentEducationFunding: 40000,
      linkedDependentEducationFundingNeed: 40000,
      totalEducationFundingNeed: 40000,
      currentDependentDetails: [
        {
          id: "child-a",
          dateOfBirth: "2010-01-01"
        }
      ]
    },
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      useExistingEducationSavingsOffset: false
    },
    assetFacts: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          typeKey: "plan529Account",
          currentValue: 10000
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          typeKey: "checkingAccount",
          currentValue: 50000
        }
      ]
    },
    treatedAssetOffsets: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          include: false,
          treatedValue: 0
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          include: true,
          treatedValue: 50000
        }
      ]
    },
    coverageStrategyScenarioSettings: scenarioSettings
  };
}

function createNeedsResult() {
  return {
    method: "needsAnalysis",
    components: {
      debtPayoff: 0,
      mortgage: 0,
      essentialSupport: 0,
      discretionarySupport: 0,
      transitionNeeds: 0,
      education: 40000,
      finalExpenses: 0,
      healthcareExpenses: 0
    },
    commonOffsets: {},
    assumptions: {
      valuationDate: "2026-01-01"
    },
    trace: [
      {
        key: "educationFundingInflation",
        inputs: {
          includeEducationFundingSetting: true,
          includeProjectedDependentsSetting: true,
          applied: false,
          educationStartAge: 18
        }
      }
    ]
  };
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    educationSupport: createEducationProjectionInput(null).educationSupport,
    assetFacts: createEducationProjectionInput(null).assetFacts,
    treatedAssetOffsets: createEducationProjectionInput(null).treatedAssetOffsets
  };
}

const scenarioSettingsSource = readRepoFile("app/features/lens-analysis/coverage-strategy-scenario-settings.js");
const educationProjectionSource = readRepoFile("app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js");
const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const resourceAdapterSource = readRepoFile("app/features/lens-analysis/coverage-strategy-resource-line-adapter.js");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");

assert.match(scenarioSettingsSource, /eligibleResourcesAfterEducationSavings/);
assert.match(educationProjectionSource, /education-eligible-resource-spending-source-unavailable/);
assert.match(controllerSource, /data-coverage-strategy-education-resource-spending/);
assert.match(controllerSource, /educationResourceSpendingMode:\s*mode/);
assert.doesNotMatch(controllerSource, /eligibleResourcesAfterEducationSavings/);
assert.doesNotMatch(analysisSetupSource, /educationResourceSpendingMode|data-coverage-strategy-education-resource-spending/);
assert.doesNotMatch(resourceAdapterSource, /educationResourceSpendingMode|educationResourceSpending|useEducationSavingsOffset/);

const context = createContext();
[
  "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-scenario-settings.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js",
  "app/features/lens-analysis/coverage-strategy-diagnostic-export.js"
].forEach((scriptPath) => loadScript(context, scriptPath));

const resolveScenarioSettings = context.LensApp.lensAnalysis.resolveCoverageStrategyScenarioSettings;
const buildEducationProjection = context.LensApp.lensAnalysis.buildCoverageStrategyEducationLifetimeProjection;
const buildNeedLine = context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const buildSnapshot = context.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;

const defaultSettings = resolveScenarioSettings({});
assert.equal(defaultSettings.education.educationResourceSpendingMode, "off");
assert.equal(defaultSettings.education.useEducationSavingsOffset, false);

const offsetCompatibilitySettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      useEducationSavingsOffset: true
    }
  }
});
assert.equal(offsetCompatibilitySettings.education.useEducationSavingsOffset, true);
assert.equal(offsetCompatibilitySettings.education.educationResourceSpendingMode, "educationSavingsOnly");
assert.equal(
  offsetCompatibilitySettings.trace.fieldSources["education.educationResourceSpendingMode"],
  "derived-from-education.useEducationSavingsOffset"
);
assert.ok(
  offsetCompatibilitySettings.trace.defaultedFields.some((field) => (
    field.code === "education-resource-spending-mode-derived-from-education-savings-offset"
  ))
);

const explicitEligibleResourcesSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationResourceSpendingMode: "eligibleResourcesAfterEducationSavings",
      useEducationSavingsOffset: false
    }
  }
});
assert.equal(
  explicitEligibleResourcesSettings.education.educationResourceSpendingMode,
  "eligibleResourcesAfterEducationSavings"
);

const unsupportedSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationResourceSpendingMode: "educationSpendWaterfall"
    }
  }
});
assert.equal(unsupportedSettings.education.educationResourceSpendingMode, "off");
assert.ok(issueCodes(unsupportedSettings.warnings).includes("education-resource-spending-mode-unsupported"));

const offProjection = buildEducationProjection(createEducationProjectionInput(resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationResourceSpendingMode: "off",
      useEducationSavingsOffset: true
    }
  }
})));
assert.equal(offProjection.educationSavingsOffset.active, false);
assert.equal(offProjection.educationPoints[0].grossEducationNeedAmount, 40000);
assert.equal(offProjection.educationPoints[0].netEducationNeedAmount, 40000);
assert.equal(offProjection.educationPoints[0].educationSavingsOffsetAmount, 0);
assert.equal(offProjection.educationResourceSpending.effectiveMode, "off");
assert.equal(offProjection.assumptionsUsed.generalResourceReductionApplied, false);

const educationSavingsOnlyProjection = buildEducationProjection(createEducationProjectionInput(resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationResourceSpendingMode: "educationSavingsOnly",
      useEducationSavingsOffset: false
    }
  }
})));
assert.equal(educationSavingsOnlyProjection.educationSavingsOffset.active, true);
assert.equal(educationSavingsOnlyProjection.educationPoints[0].educationSavingsOffsetAmount, 10000);
assert.equal(educationSavingsOnlyProjection.educationPoints[0].netEducationNeedAmount, 30000);
assert.equal(educationSavingsOnlyProjection.educationResourceSpending.effectiveMode, "educationSavingsOnly");
assert.equal(educationSavingsOnlyProjection.educationResourceSpending.broaderEligibleResourceOffsetApplied, 0);
assert.equal(educationSavingsOnlyProjection.assumptionsUsed.generalResourceReductionApplied, false);

const eligibleResourcesProjection = buildEducationProjection(createEducationProjectionInput(explicitEligibleResourcesSettings));
assert.equal(eligibleResourcesProjection.educationSavingsOffset.active, true);
assert.equal(eligibleResourcesProjection.educationPoints[0].educationSavingsOffsetAmount, 10000);
assert.equal(eligibleResourcesProjection.educationPoints[0].netEducationNeedAmount, 30000);
assert.equal(eligibleResourcesProjection.educationResourceSpending.effectiveMode, "eligibleResourcesAfterEducationSavings");
assert.equal(eligibleResourcesProjection.educationResourceSpending.broaderEligibleResourcesRequested, true);
assert.equal(eligibleResourcesProjection.educationResourceSpending.broaderEligibleResourceStatus, "unavailable");
assert.equal(eligibleResourcesProjection.educationResourceSpending.broaderEligibleResourceOffsetApplied, 0);
assert.ok(issueCodes(eligibleResourcesProjection.dataGaps).includes("education-eligible-resource-spending-source-unavailable"));
assert.equal(eligibleResourcesProjection.assumptionsUsed.generalResourceReductionApplied, false);
assert.equal(eligibleResourcesProjection.educationSavingsOffset.generalResourceSpendingApplied, false);

const needLine = buildNeedLine({
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      useExistingEducationSavingsOffset: false
    }
  },
  coverageStrategyScenarioSettings: explicitEligibleResourcesSettings,
  valuationDate: "2026-01-01",
  horizonYears: 6
});
assert.equal(needLine.componentModels.education.lifetimeProjection.educationResourceSpending.effectiveMode, "eligibleResourcesAfterEducationSavings");
assert.equal(needLine.needPoints[0].trace.educationProjection.effectiveEducationResourceSpendingMode, "eligibleResourcesAfterEducationSavings");
assert.equal(needLine.needPoints[0].trace.educationProjection.broaderEligibleResourceOffsetApplied, 0);
assert.equal(needLine.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(needLine.assumptionsUsed.assetOffsetsSubtracted, false);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Education Resource Spending Fixture",
    analysisSettings: {}
  },
  methodSettings: {},
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  needLine,
  coverageStrategyScenarioSettings: explicitEligibleResourcesSettings,
  visibleScenarioControls: {
    projectionHorizon: true,
    educationResourceSpendingMode: true,
    educationResourceSpending: true,
    educationPaymentScheduleMode: true,
    educationPaymentSchedule: true,
    projectedDependentBirthYear: true,
    diagnosticExport: true
  },
  projectionHorizonYears: 6
});
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpendingMode, "eligibleResourcesAfterEducationSavings");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpending.effectiveMode, "eligibleResourcesAfterEducationSavings");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleEducationResourceSpendingControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpendingMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpending, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpendingTrace.broaderEligibleResourceStatus, "unavailable");
assert.ok(
  issueCodes(snapshot.coverageStrategyGeneratedOutputs.educationLifetimeProjection.dataGaps)
    .includes("education-eligible-resource-spending-source-unavailable")
);

console.log("coverage strategy education resource spending modes check passed");
