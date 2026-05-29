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

function createEducationProjectionInput(scenarioSettings, overrides = {}) {
  return {
    valuationDate: "2026-01-01",
    needPoints: overrides.needPoints || createNeedPoints(25),
    educationSupport: overrides.educationSupport || {
      linkedDependentCount: 1,
      desiredAdditionalDependentCount: 1,
      perLinkedDependentEducationFunding: 40000,
      perDesiredAdditionalDependentEducationFunding: 20000,
      linkedDependentEducationFundingNeed: 40000,
      desiredAdditionalDependentEducationFundingNeed: 20000,
      totalEducationFundingNeed: 60000,
      currentDependentDetails: [
        {
          id: "child-a",
          dateOfBirth: "2010-01-01"
        }
      ]
    },
    projectedDependents: overrides.projectedDependents,
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
        }
      ]
    },
    coverageStrategyScenarioSettings: scenarioSettings
  };
}

function createLensModel() {
  const input = createEducationProjectionInput(null);
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    educationSupport: input.educationSupport,
    assetFacts: input.assetFacts,
    treatedAssetOffsets: input.treatedAssetOffsets
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
      education: 60000,
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

const scenarioSettingsSource = readRepoFile("app/features/lens-analysis/coverage-strategy-scenario-settings.js");
const educationProjectionSource = readRepoFile("app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const resourceAdapterSource = readRepoFile("app/features/lens-analysis/coverage-strategy-resource-line-adapter.js");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");

assert.match(scenarioSettingsSource, /scheduleRemainingNeed/);
assert.match(scenarioSettingsSource, /education-treatment-mode-unsupported/);
assert.match(educationProjectionSource, /visibleEducationTreatmentControl/);
assert.match(diagnosticSource, /educationTreatmentMode/);
assert.doesNotMatch(controllerSource, /data-coverage-strategy-education-treatment|educationTreatmentMode/);
assert.doesNotMatch(analysisSetupSource, /data-coverage-strategy-education-treatment|educationTreatmentMode/);
assert.doesNotMatch(resourceAdapterSource, /educationTreatmentMode|educationTreatment/);

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
assert.equal(defaultSettings.education.educationTreatmentMode, "planAsUnfundedNeed");
assert.equal(
  defaultSettings.trace.fieldSources["education.educationTreatmentMode"],
  "coverage-strategy-defaults.education.educationTreatmentMode"
);

const scheduleSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationTreatmentMode: "scheduleRemainingNeed",
      educationResourceSpendingMode: "off",
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          rawExpectedBirthYear: "2026",
          educationFundingAmount: 20000
        }
      ]
    }
  }
});
assert.equal(scheduleSettings.education.educationTreatmentMode, "scheduleRemainingNeed");
assert.equal(
  scheduleSettings.trace.fieldSources["education.educationTreatmentMode"],
  "runtimeScenarioSettings.education.educationTreatmentMode"
);

const invalidSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationTreatmentMode: "assumePaidWhenDue"
    }
  }
});
assert.equal(invalidSettings.education.educationTreatmentMode, "planAsUnfundedNeed");
assert.ok(issueCodes(invalidSettings.warnings).includes("education-treatment-mode-unsupported"));
assert.ok(
  invalidSettings.trace.defaultedFields.some((field) => (
    field.code === "education-treatment-mode-defaulted"
  ))
);

const defaultProjection = buildEducationProjection(createEducationProjectionInput(defaultSettings));
assert.equal(defaultProjection.assumptionsUsed.educationTreatmentMode, "planAsUnfundedNeed");
assert.equal(defaultProjection.assumptionsUsed.effectiveEducationTreatmentMode, "scheduleRemainingNeed");
assert.equal(defaultProjection.educationTreatment.currentDefaultOutputPreserved, true);
assert.equal(defaultProjection.educationTreatment.resourceLineReductionApplied, false);
assert.equal(defaultProjection.educationPoints[0].grossEducationNeedAmount, 60000);
assert.equal(defaultProjection.educationPoints[0].netEducationNeedAmount, 60000);
assert.equal(defaultProjection.educationPoints[6].currentDependentNeedAmount, 0);
assert.equal(defaultProjection.educationPoints[25].untimedProjectedDependentNeedAmount, 20000);
assert.equal(defaultProjection.educationPoints[0].trace.educationTreatmentMode, "planAsUnfundedNeed");
assert.equal(defaultProjection.educationPoints[0].trace.effectiveEducationTreatmentMode, "scheduleRemainingNeed");
assert.equal(defaultProjection.educationPoints[0].trace.visibleEducationTreatmentControl, false);

const scheduleProjection = buildEducationProjection(createEducationProjectionInput(scheduleSettings, {
  projectedDependents: [
    {
      id: "projected-dependent-1",
      expectedBirthYear: 2026,
      educationFundingAmount: 20000
    }
  ]
}));
assert.equal(scheduleProjection.assumptionsUsed.educationTreatmentMode, "scheduleRemainingNeed");
assert.equal(scheduleProjection.assumptionsUsed.effectiveEducationTreatmentMode, "scheduleRemainingNeed");
assert.equal(scheduleProjection.educationTreatment.currentDefaultOutputPreserved, false);
assert.equal(scheduleProjection.projectedDependentSchedules[0].dateOfBirth, "2026-01-01");
assert.ok(issueCodes(scheduleProjection.warnings).includes("projected-dependent-birth-year-defaulted-to-jan-1"));
assert.equal(scheduleProjection.educationPoints[17].projectedDependentNeedAmount, 20000);
assert.equal(scheduleProjection.educationPoints[22].projectedDependentNeedAmount, 0);
assert.equal(scheduleProjection.educationPoints[0].trace.educationNeedDeclineReason, "dependent-schedule-obligations-no-longer-remaining");

const savingsScheduleSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationTreatmentMode: "scheduleRemainingNeed",
      educationResourceSpendingMode: "educationSavingsOnly"
    }
  }
});
const savingsScheduleProjection = buildEducationProjection(createEducationProjectionInput(savingsScheduleSettings));
assert.equal(savingsScheduleProjection.educationSavingsOffset.active, true);
assert.equal(savingsScheduleProjection.educationPoints[0].educationSavingsOffsetAmount, 10000);
assert.equal(savingsScheduleProjection.educationPoints[0].netEducationNeedAmount, 50000);
assert.equal(savingsScheduleProjection.educationTreatment.resourceLineReductionApplied, false);

const eligibleResourcesSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationTreatmentMode: "scheduleRemainingNeed",
      educationResourceSpendingMode: "eligibleResourcesAfterEducationSavings"
    }
  }
});
const eligibleResourcesProjection = buildEducationProjection(createEducationProjectionInput(eligibleResourcesSettings));
assert.equal(eligibleResourcesProjection.educationResourceSpending.broaderEligibleResourceStatus, "unavailable");
assert.equal(eligibleResourcesProjection.educationResourceSpending.broaderEligibleResourceOffsetApplied, 0);
assert.equal(eligibleResourcesProjection.assumptionsUsed.generalResourceReductionApplied, false);
assert.ok(issueCodes(eligibleResourcesProjection.dataGaps).includes("education-eligible-resource-spending-source-unavailable"));

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
  coverageStrategyScenarioSettings: scheduleSettings,
  valuationDate: "2026-01-01",
  horizonYears: 25
});
assert.equal(
  needLine.componentModels.education.lifetimeProjection.assumptionsUsed.educationTreatmentMode,
  "scheduleRemainingNeed"
);
assert.equal(
  needLine.needPoints[0].trace.educationProjection.effectiveEducationTreatmentMode,
  "scheduleRemainingNeed"
);
assert.equal(needLine.needPoints[0].trace.educationProjection.visibleEducationTreatmentControl, false);
assert.equal(needLine.assumptionsUsed.assetOffsetsSubtracted, false);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Education Treatment Fixture",
    analysisSettings: {}
  },
  methodSettings: {},
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  needLine,
  coverageStrategyScenarioSettings: scheduleSettings,
  visibleScenarioControls: {
    projectionHorizon: true,
    educationResourceSpendingMode: true,
    educationResourceSpending: true,
    educationPaymentScheduleMode: true,
    educationPaymentSchedule: true,
    projectedDependentBirthYear: true,
    diagnosticExport: true
  },
  projectionHorizonYears: 25
});
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationTreatmentMode, "scheduleRemainingNeed");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.effectiveEducationTreatmentMode, "scheduleRemainingNeed");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationTreatment.visibleEducationTreatmentControl, false);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleEducationTreatmentControl, false);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpendingMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentScheduleMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectedDependentBirthYear, true);

console.log("coverage strategy education treatment modes check passed");
