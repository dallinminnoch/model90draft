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
      }
    },
    coverageStrategyScenarioSettings: scenarioSettings,
    valuationDate: "2026-01-01",
    horizonYears: 10
  });
}

const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const diagnosticSource = readRepoFile("app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const stylesSource = readRepoFile("styles.css");
const analysisSetupSource = readRepoFile("pages/analysis-setup.html");
const resourceAdapterSource = readRepoFile("app/features/lens-analysis/coverage-strategy-resource-line-adapter.js");

const trayIndex = controllerSource.indexOf("coverage-strategy-scenario-tray");
assert.ok(trayIndex >= 0, "Scenario Planner tray should exist.");
const trayMarkup = controllerSource.slice(trayIndex);
const resourceControlStart = trayMarkup.indexOf("is-education-resources");
assert.ok(resourceControlStart >= 0, "Education resources control should exist.");
const resourceControlMarkup = trayMarkup.slice(
  resourceControlStart,
  trayMarkup.indexOf("is-education-schedule", resourceControlStart)
);
assert.match(trayMarkup, /Education resources/);
assert.match(trayMarkup, /data-coverage-strategy-education-resource-spending/);
assert.match(resourceControlMarkup, /value="off"/);
assert.match(resourceControlMarkup, /value="educationSavingsOnly"/);
assert.match(resourceControlMarkup, />Off</);
assert.match(resourceControlMarkup, />Savings</);
assert.doesNotMatch(resourceControlMarkup, /eligibleResourcesAfterEducationSavings|Eligible resources|drawer|coverage-strategy-scenario-drawer/i);
assert.doesNotMatch(resourceControlMarkup, /Education savings[\s\S]*data-coverage-strategy-education-savings-offset/);
assert.match(controllerSource, /educationResourceSpendingMode:\s*mode/);
assert.match(controllerSource, /useEducationSavingsOffset:\s*mode === "educationSavingsOnly"/);
assert.match(controllerSource, /buildAndRenderCoverageStrategy\(selectedProjectionHorizonYears\)/);
assert.match(controllerSource, /educationResourceSpendingMode: true/);
assert.match(controllerSource, /educationResourceSpending: true/);
assert.doesNotMatch(controllerSource, /localStorage\.setItem|sessionStorage\.setItem|profileRecord\.coverageStrategyScenarioSettings\s*=/);
assert.doesNotMatch(stylesSource, /education-resource-spending|coverage-strategy-education-resource/);
assert.doesNotMatch(analysisSetupSource, /data-coverage-strategy-education-resource-spending|educationResourceSpendingMode/);
assert.doesNotMatch(resourceAdapterSource, /educationResourceSpendingMode|educationResourceSpending|useEducationSavingsOffset/);
assert.match(diagnosticSource, /visibleEducationResourceSpendingControl/);

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

const offSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationResourceSpendingMode: "off",
      useEducationSavingsOffset: false
    }
  }
});
const savingsSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      educationResourceSpendingMode: "educationSavingsOnly",
      useEducationSavingsOffset: true
    }
  }
});

assert.equal(offSettings.education.educationResourceSpendingMode, "off");
assert.equal(offSettings.education.useEducationSavingsOffset, false);
assert.equal(savingsSettings.education.educationResourceSpendingMode, "educationSavingsOnly");
assert.equal(savingsSettings.education.useEducationSavingsOffset, true);

const offNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, offSettings);
const savingsNeedLine = buildNeedLine(buildCoverageStrategyNeedLine, savingsSettings);
assert.equal(offNeedLine.needPoints[0].trace.educationProjection.effectiveEducationResourceSpendingMode, "off");
assert.equal(offNeedLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 0);
assert.equal(offNeedLine.needPoints[0].componentAmounts.education, 60000);
assert.equal(savingsNeedLine.needPoints[0].trace.educationProjection.effectiveEducationResourceSpendingMode, "educationSavingsOnly");
assert.equal(savingsNeedLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 15000);
assert.equal(savingsNeedLine.needPoints[0].componentAmounts.education, 45000);
assert.equal(savingsNeedLine.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(savingsNeedLine.assumptionsUsed.assetOffsetsSubtracted, false);

const snapshot = buildSnapshot({
  profileRecord: {
    fullName: "Education Resource Control Fixture",
    analysisSettings: {}
  },
  methodSettings: {},
  lensModel: createLensModel(),
  needsResult: createNeedsResult(),
  needLine: savingsNeedLine,
  coverageStrategyScenarioSettings: savingsSettings,
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
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpendingMode, "educationSavingsOnly");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpending.effectiveMode, "educationSavingsOnly");
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleEducationResourceSpendingControl, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpendingMode, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.visibleScenarioControls.educationResourceSpending, true);
assert.equal(snapshot.coverageStrategyGeneratedOutputs.educationResourceSpending.broaderEligibleResourceStatus, "not-requested");

console.log("coverage strategy education resource spending control check passed");
