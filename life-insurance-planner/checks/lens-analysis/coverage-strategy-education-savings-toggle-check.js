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
          currentValue: 15000
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

function buildNeedLineWithOffset(buildNeedLine, scenarioSettings) {
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
const resourceAdapterSource = readRepoFile("app/features/lens-analysis/coverage-strategy-resource-line-adapter.js");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");

const trayIndex = controllerSource.indexOf("coverage-strategy-scenario-tray");
assert.ok(trayIndex >= 0, "Scenario tray should exist.");
const trayMarkup = controllerSource.slice(trayIndex);
assert.match(trayMarkup, /Education resources/);
assert.match(trayMarkup, /data-coverage-strategy-education-resource-spending/);
assert.match(trayMarkup, /value="off"/);
assert.match(trayMarkup, /value="educationSavingsOnly"/);
assert.match(trayMarkup, />Savings</);
assert.match(trayMarkup, /Education schedule/);
assert.match(trayMarkup, /data-coverage-strategy-education-payment-schedule/);
assert.match(trayMarkup, /value="fourYearAnnual"/);
assert.match(trayMarkup, /value="lumpSumAtStart"/);
assert.match(controllerSource, /Projected dependents/);
assert.match(controllerSource, /data-coverage-strategy-projected-dependent-birth-year/);
assert.match(trayMarkup, /Projection horizon/);
assert.match(trayMarkup, /Export Diagnostic Report/);
assert.doesNotMatch(trayMarkup, /Export Diagnostic PDF/);
assert.doesNotMatch(trayMarkup, /educationTreatmentMode|custom schedule|savings then eligible resources/i);
assert.match(controllerSource, /runtimeScenarioSettings\s*=\s*\{/);
assert.match(controllerSource, /data-coverage-strategy-education-resource-spending/);
assert.match(controllerSource, /educationResourceSpendingMode:\s*mode/);
assert.match(controllerSource, /useEducationSavingsOffset:\s*mode === "educationSavingsOnly"/);
assert.match(controllerSource, /data-coverage-strategy-education-payment-schedule/);
assert.doesNotMatch(controllerSource, /sessionStorage|profileRecord\.coverageStrategyScenarioSettings\s*=/);

assert.match(componentsSource, /\.coverage-strategy-scenario-control\.is-projected-dependents\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-scenario-control\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-segmented-toggle\s*\{/);
assert.match(componentsSource, /\.coverage-strategy-segmented-option\s*\{/);
assert.doesNotMatch(analysisSetupSource, /data-analysis-education-field="fundingTreatment\.useExistingEducationSavingsOffset"/);
assert.doesNotMatch(analysisSetupSource, /coverageStrategyScenarioSettings|data-coverage-strategy-education-resource-spending/);
assert.doesNotMatch(resourceAdapterSource, /useEducationSavingsOffset|educationSavingsOffset|coverageStrategyScenarioSettings/);
assert.match(diagnosticSource, /visibleScenarioControls/);
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
const buildNeedLine = context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const buildSnapshot = context.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot;

const offsetOffSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationPaymentScheduleMode: "fourYearAnnual",
      useEducationSavingsOffset: false
    }
  }
});
const offsetOnSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationPaymentScheduleMode: "fourYearAnnual",
      useEducationSavingsOffset: true
    }
  }
});

const offsetOffNeedLine = buildNeedLineWithOffset(buildNeedLine, offsetOffSettings);
const offsetOnNeedLine = buildNeedLineWithOffset(buildNeedLine, offsetOnSettings);

assert.equal(offsetOffNeedLine.assumptionsUsed.coverageStrategyScenarioSettings.education.useEducationSavingsOffset, false);
assert.equal(offsetOffNeedLine.needPoints[0].trace.educationProjection.grossEducationNeedAmount, 60000);
assert.equal(offsetOffNeedLine.needPoints[0].trace.educationProjection.netEducationNeedAmount, 60000);
assert.equal(offsetOffNeedLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 0);
assert.equal(offsetOnNeedLine.assumptionsUsed.coverageStrategyScenarioSettings.education.useEducationSavingsOffset, true);
assert.equal(offsetOnNeedLine.assumptionsUsed.coverageStrategyScenarioSettings.education.educationResourceSpendingMode, "educationSavingsOnly");
assert.equal(offsetOnNeedLine.needPoints[0].trace.educationProjection.grossEducationNeedAmount, 60000);
assert.equal(offsetOnNeedLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 15000);
assert.equal(offsetOnNeedLine.needPoints[0].trace.educationProjection.effectiveEducationResourceSpendingMode, "educationSavingsOnly");
assert.equal(offsetOnNeedLine.needPoints[0].trace.educationProjection.netEducationNeedAmount, 45000);
assert.equal(offsetOnNeedLine.needPoints[0].componentAmounts.education, 45000);
assert.equal(offsetOnNeedLine.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(offsetOnNeedLine.assumptionsUsed.assetOffsetsSubtracted, false);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Toggle Fixture",
    analysisSettings: {}
  },
  methodSettings: {},
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  needLine: offsetOnNeedLine,
  coverageStrategyScenarioSettings: offsetOnSettings,
  visibleScenarioControls: {
    projectionHorizon: true,
    educationResourceSpendingMode: true,
    educationResourceSpending: true,
    educationPaymentScheduleMode: true,
    educationPaymentSchedule: true,
    projectedDependentBirthYear: true,
    diagnosticExport: true
  },
  projectionHorizonYears: 10
});
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationScenarioSettingsConsumed.useEducationSavingsOffset, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationScenarioSettingsConsumed.educationResourceSpendingMode, "educationSavingsOnly");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyVisibleScenarioControlsAdded, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpendingMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpending, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentScheduleMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationPaymentSchedule, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectedDependentBirthYear, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.projectionHorizon, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.diagnosticExport, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettings.visibleControlsAdded, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.coverageStrategyScenarioSettings.controlsVisible, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visiblePaymentScheduleControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleEducationResourceSpendingControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationSavingsOffset.active, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationSavingsOffset.resourceReductionApplied, false);

console.log("coverage strategy education savings toggle check passed");
