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
      linkedDependentCount: 0,
      desiredAdditionalDependentCount: 1,
      perDesiredAdditionalDependentEducationFunding: 20000,
      desiredAdditionalDependentEducationFundingNeed: 20000,
      totalEducationFundingNeed: 20000,
      currentDependentDetails: []
    },
    assetFacts: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          typeKey: "plan529Account",
          currentValue: 5000
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
      education: 20000,
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

function buildNeedLine(buildNeedLine, scenarioSettings) {
  return buildNeedLine({
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
        educationInflationRatePercent: 4
      }
    },
    coverageStrategyScenarioSettings: scenarioSettings,
    valuationDate: "2026-01-01",
    horizonYears: 25
  });
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item && item.code).filter(Boolean);
}

const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const scenarioSettingsSource = readRepoFile("app/features/lens-analysis/coverage-strategy-scenario-settings.js");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const componentsSource = readRepoFile("components.css");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");

const trayIndex = controllerSource.indexOf("coverage-strategy-scenario-tray");
assert.ok(trayIndex >= 0, "Scenario tray should exist.");
const trayMarkup = controllerSource.slice(trayIndex);
assert.match(trayMarkup, /Projected dependents/);
assert.match(trayMarkup, /data-coverage-strategy-projected-dependent-birth-year/);
assert.match(trayMarkup, /data-projected-dependent-id/);
assert.match(trayMarkup, /Birth year/);
assert.match(trayMarkup, /Education savings/);
assert.match(trayMarkup, /data-coverage-strategy-education-savings-offset/);
assert.match(trayMarkup, /Education schedule/);
assert.match(trayMarkup, /data-coverage-strategy-education-payment-schedule/);
assert.match(trayMarkup, /value="fourYearAnnual"/);
assert.match(trayMarkup, /value="lumpSumAtStart"/);
assert.match(trayMarkup, /Projection horizon/);
assert.match(trayMarkup, /Export Diagnostic Report/);
assert.doesNotMatch(trayMarkup, /Export Diagnostic PDF/);
assert.doesNotMatch(trayMarkup, /educationTreatmentMode|educationResourceSpendingMode|custom schedule|resource spending/i);
assert.match(controllerSource, /runtimeScenarioSettings/);
assert.match(controllerSource, /projectedDependentTimingRows/);
assert.match(controllerSource, /validateProjectedDependentBirthYear/);
assert.match(controllerSource, /buildProjectedDependentTimingRows/);
assert.match(controllerSource, /buildAndRenderCoverageStrategy\(selectedProjectionHorizonYears\)/);
assert.doesNotMatch(controllerSource, /profileRecord\.coverageStrategyScenarioSettings\s*=|localStorage\.setItem|sessionStorage\.setItem/);

assert.match(scenarioSettingsSource, /projectedDependentTimingRows/);
assert.match(scenarioSettingsSource, /rawExpectedBirthYear/);
assert.match(scenarioSettingsSource, /projected-dependent-birth-year-invalid/);
assert.match(diagnosticSource, /projectedDependentTimingRowsConsumed/);
assert.match(diagnosticSource, /visibleScenarioControls/);
assert.match(diagnosticSource, /visiblePaymentScheduleControl/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-placeholder\.is-projected-dependents\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-tray-placeholder\.is-education-schedule\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-projected-dependent-row\s*\{/);
assert.doesNotMatch(analysisSetupSource, /data-coverage-strategy-projected-dependent-birth-year|projectedDependentTimingRows/);

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

const blankSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          label: "Projected dependent 1",
          rawExpectedBirthYear: ""
        }
      ],
      useEducationSavingsOffset: false
    }
  }
});
const blankNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, blankSettings);
assert.equal(blankSettings.education.projectedDependentTimingRows[0].validationStatus, "untimed");
assert.equal(blankNeedLine.componentModels.education.lifetimeProjection.untimedProjectedDependents.length, 1);
assert.equal(blankNeedLine.needPoints[25].componentAmounts.education, 20000);
assert.ok(
  issueCodes(blankNeedLine.warnings)
    .includes("projected-dependent-education-kept-through-horizon")
);

const timedSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          label: "Projected dependent 1",
          rawExpectedBirthYear: "2026",
          educationFundingAmount: 20000
        }
      ],
      useEducationSavingsOffset: false
    }
  }
});
const timedNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, timedSettings);
const timedProjection = timedNeedLine.componentModels.education.lifetimeProjection;
assert.equal(timedSettings.education.projectedDependentTimingRows[0].expectedBirthYear, 2026);
assert.equal(timedSettings.education.projectedDependentTimingRows[0].timingMode, "expectedBirthYear");
assert.equal(timedProjection.projectedDependentSchedules.length, 1);
assert.equal(timedProjection.projectedDependentSchedules[0].dateOfBirth, "2026-01-01");
assert.equal(timedProjection.projectedDependentSchedules[0].educationStartYear, 2044);
assert.ok(issueCodes(timedNeedLine.warnings).includes("projected-dependent-birth-year-defaulted-to-jan-1"));
assert.equal(timedNeedLine.needPoints[17].componentAmounts.education, 20000);
assert.equal(timedNeedLine.needPoints[20].componentAmounts.education, 10000);
assert.equal(timedNeedLine.needPoints[21].componentAmounts.education, 5000);
assert.equal(timedNeedLine.needPoints[22].componentAmounts.education, 0);
assert.notEqual(blankNeedLine.needPoints[22].componentAmounts.education, timedNeedLine.needPoints[22].componentAmounts.education);

const invalidSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          label: "Projected dependent 1",
          rawExpectedBirthYear: "abcd"
        }
      ],
      useEducationSavingsOffset: false
    }
  }
});
const invalidNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, invalidSettings);
const invalidProjection = invalidNeedLine.componentModels.education.lifetimeProjection;
assert.equal(invalidSettings.education.projectedDependentTimingRows[0].expectedBirthYear, null);
assert.equal(invalidSettings.education.projectedDependentTimingRows[0].validationStatus, "invalid");
assert.equal(invalidProjection.projectedDependentSchedules.length, 0);
assert.equal(invalidNeedLine.needPoints[25].componentAmounts.education, 20000);
assert.ok(issueCodes(invalidNeedLine.warnings).includes("projected-dependent-birth-year-invalid"));

const offsetTimedSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          rawExpectedBirthYear: "2026",
          educationFundingAmount: 20000
        }
      ],
      useEducationSavingsOffset: true
    }
  }
});
const offsetTimedNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, offsetTimedSettings);
assert.equal(offsetTimedNeedLine.needPoints[0].trace.educationProjection.grossEducationNeedAmount, 20000);
assert.equal(offsetTimedNeedLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 5000);
assert.equal(offsetTimedNeedLine.needPoints[0].componentAmounts.education, 15000);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Projected Dependent Fixture",
    analysisSettings: {}
  },
  methodSettings: {},
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  needLine: timedNeedLine,
  coverageStrategyScenarioSettings: timedSettings,
  visibleScenarioControls: {
    projectionHorizon: true,
    educationSavingsOffset: true,
    educationPaymentScheduleMode: true,
    educationPaymentSchedule: true,
    projectedDependentBirthYear: true,
    diagnosticExport: true
  },
  projectionHorizonYears: 25
});
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectedDependentBirthYear, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentScheduleMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentSchedule, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectionHorizon, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.diagnosticExport, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettings.visibleControlsAdded, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettings.controlsVisible, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visiblePaymentScheduleControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.projectedDependentTimingRowsConsumed[0].expectedBirthYear, 2026);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationLifetimeProjection.projectedDependentSchedules[0].dateOfBirth, "2026-01-01");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettingsPersistence, "runtime-default-resolved");

console.log("coverage strategy projected dependent timing control check passed");
