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
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    educationSupport: {
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
    }
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
          educationStartAge: 18,
          plannedDependentEducationIncludedAmount: 20000
        }
      }
    ]
  };
}

function buildNeedLine(buildCoverageStrategyNeedLine, scenarioSettings) {
  return buildCoverageStrategyNeedLine({
    lensModel: createLensModel(),
    needsResult: createNeedsResult(),
    analysisSettings: {
      educationAssumptions: {
        includeEducationFunding: true,
        includeProjectedDependents: true,
        applyEducationInflation: false,
        educationStartAge: 18,
        useExistingEducationSavingsOffset: false
      },
      inflationAssumptions: {
        educationInflationRatePercent: 5
      }
    },
    coverageStrategyScenarioSettings: scenarioSettings,
    valuationDate: "2026-01-01",
    horizonYears: 10
  });
}

const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const componentsSource = readRepoFile("components.css");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const resourceAdapterSource = readRepoFile("app/features/lens-analysis/coverage-strategy-resource-line-adapter.js");

const trayIndex = controllerSource.indexOf("coverage-strategy-scenario-tray");
assert.ok(trayIndex >= 0, "Scenario tray should exist.");
const trayMarkup = controllerSource.slice(trayIndex);
assert.match(trayMarkup, /Education schedule/);
assert.match(trayMarkup, /data-coverage-strategy-education-payment-schedule/);
assert.match(trayMarkup, /value="fourYearAnnual"/);
assert.match(trayMarkup, /value="lumpSumAtStart"/);
assert.match(trayMarkup, />4-year</);
assert.match(trayMarkup, />Lump sum</);
assert.doesNotMatch(trayMarkup, /custom schedule|education treatment|resource spending|savings then eligible resources/i);
assert.match(trayMarkup, /Education savings/);
assert.match(trayMarkup, /Projected dependents/);
assert.match(trayMarkup, /Projection horizon/);
assert.match(trayMarkup, /Export Diagnostic PDF/);
assert.match(controllerSource, /educationPaymentScheduleMode:\s*getEducationPaymentScheduleModeFromSettings/);
assert.match(controllerSource, /data-coverage-strategy-education-payment-schedule/);
assert.match(controllerSource, /educationPaymentScheduleMode:\s*target\.value === "lumpSumAtStart"/);
assert.match(controllerSource, /buildAndRenderCoverageStrategy\(selectedProjectionHorizonYears\)/);
assert.doesNotMatch(controllerSource, /profileRecord\.coverageStrategyScenarioSettings\s*=|localStorage\.setItem|sessionStorage\.setItem/);

assert.match(componentsSource, /\.coverage-strategy-scenario-tray-placeholder\.is-education-schedule\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-segmented-toggle\s*\{/);
assert.doesNotMatch(analysisSetupSource, /data-coverage-strategy-education-payment-schedule|educationPaymentScheduleMode/);
assert.doesNotMatch(resourceAdapterSource, /educationPaymentScheduleMode|educationPaymentSchedule|coverageStrategyScenarioSettings/);
assert.match(diagnosticSource, /visiblePaymentScheduleControl/);

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
const buildCoverageStrategyNeedLine = context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const buildSnapshot = context.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;

const defaultSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {}
  }
});
assert.equal(defaultSettings.education.educationPaymentScheduleMode, "fourYearAnnual");

const lumpSumSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: false
    }
  }
});
const fourYearSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationPaymentScheduleMode: "fourYearAnnual",
      useEducationSavingsOffset: false
    }
  }
});
assert.equal(lumpSumSettings.education.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(fourYearSettings.education.educationPaymentScheduleMode, "fourYearAnnual");

const fourYearNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, fourYearSettings);
const lumpSumNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, lumpSumSettings);
assert.equal(
  fourYearNeedLine.componentModels.education.lifetimeProjection.assumptionsUsed.educationPaymentScheduleMode,
  "fourYearAnnual"
);
assert.equal(
  lumpSumNeedLine.componentModels.education.lifetimeProjection.assumptionsUsed.educationPaymentScheduleMode,
  "lumpSumAtStart"
);
assert.equal(fourYearNeedLine.componentModels.education.lifetimeProjection.currentDependentSchedules[0].payments.length, 4);
assert.equal(lumpSumNeedLine.componentModels.education.lifetimeProjection.currentDependentSchedules[0].payments.length, 1);
assert.equal(fourYearNeedLine.needPoints[3].componentAmounts.education, 50000);
assert.equal(lumpSumNeedLine.needPoints[3].componentAmounts.education, 20000);
assert.equal(lumpSumNeedLine.needPoints[0].trace.educationProjection.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(lumpSumNeedLine.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(lumpSumNeedLine.assumptionsUsed.assetOffsetsSubtracted, false);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Payment Schedule Fixture",
    analysisSettings: {}
  },
  methodSettings: {},
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  needLine: lumpSumNeedLine,
  coverageStrategyScenarioSettings: lumpSumSettings,
  visibleScenarioControls: {
    educationSavingsOffset: true,
    educationPaymentScheduleMode: true,
    projectedDependentBirthYear: true
  },
  projectionHorizonYears: 10
});
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationScenarioSettingsConsumed.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visiblePaymentScheduleControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentScheduleMode, true);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.educationLifetimeProjection.assumptionsUsed.educationPaymentScheduleMode,
  "lumpSumAtStart"
);

console.log("coverage strategy education payment schedule control check passed");
