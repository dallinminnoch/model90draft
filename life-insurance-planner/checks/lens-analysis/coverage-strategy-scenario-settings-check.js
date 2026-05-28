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

function createNeedPoints(horizonYears) {
  return Array.from({ length: horizonYears + 1 }, function (_unused, yearIndex) {
    const calendarYear = 2026 + yearIndex;
    return {
      yearIndex,
      date: `${calendarYear}-01-01`,
      calendarYear,
      age: 46 + yearIndex
    };
  });
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

const scenarioSettingsSource = readRepoFile("app/features/lens-analysis/coverage-strategy-scenario-settings.js");
assert.match(scenarioSettingsSource, /Coverage Strategy scenario settings owner/);
assert.match(scenarioSettingsSource, /Backend-ready pure settings resolver/);
assert.doesNotMatch(scenarioSettingsSource, /\bdocument\b|\bwindow\b|localStorage|sessionStorage/);

const context = createContext();
loadScript(context, "app/features/lens-analysis/coverage-strategy-scenario-settings.js");
const resolveScenarioSettings = context.LensApp.lensAnalysis.resolveCoverageStrategyScenarioSettings;
assert.equal(typeof resolveScenarioSettings, "function");

const defaultResult = resolveScenarioSettings({});
assert.equal(defaultResult.version, 1);
assert.equal(defaultResult.education.useEducationSavingsOffset, false);
assert.equal(defaultResult.education.educationTreatmentMode, "planAsUnfundedNeed");
assert.equal(defaultResult.education.educationPaymentScheduleMode, "fourYearAnnual");
assert.equal(defaultResult.education.educationResourceSpendingMode, "off");
assert.equal(defaultResult.education.projectedDependentTimingMode, "untimedKeepThroughHorizon");
assert.ok(Array.isArray(defaultResult.education.projectedDependentTimingRows));
assert.equal(defaultResult.education.projectedDependentTimingRows.length, 0);
assert.equal(defaultResult.visibleControlsAdded, false);
assert.equal(defaultResult.controlsVisible, false);
assert.equal(defaultResult.persisted, false);
assert.doesNotThrow(() => JSON.stringify(defaultResult));

const runtimeInput = {
  runtimeScenarioSettings: {
    education: {
      useEducationSavingsOffset: true
    }
  }
};
const runtimeBefore = JSON.stringify(runtimeInput);
const runtimeResult = resolveScenarioSettings(runtimeInput);
assert.equal(JSON.stringify(runtimeInput), runtimeBefore, "resolver should not mutate runtime input");
assert.equal(runtimeResult.education.useEducationSavingsOffset, true);
assert.equal(
  runtimeResult.trace.fieldSources["education.useEducationSavingsOffset"],
  "runtimeScenarioSettings.education.useEducationSavingsOffset"
);

const savedResult = resolveScenarioSettings({
  savedScenarioSettings: {
    education: {
      useEducationSavingsOffset: true
    }
  }
});
assert.equal(savedResult.education.useEducationSavingsOffset, true);
assert.equal(savedResult.persisted, true);

const profileSavedResult = resolveScenarioSettings({
  profileRecord: {
    coverageStrategyScenarioSettings: {
      education: {
        useEducationSavingsOffset: true
      }
    }
  }
});
assert.equal(profileSavedResult.education.useEducationSavingsOffset, true);
assert.equal(
  profileSavedResult.trace.fieldSources["education.useEducationSavingsOffset"],
  "profileRecord.coverageStrategyScenarioSettings.education.useEducationSavingsOffset"
);

const legacyResult = resolveScenarioSettings({
  analysisSettings: {
    educationAssumptions: {
      useExistingEducationSavingsOffset: true
    }
  }
});
assert.equal(legacyResult.education.useEducationSavingsOffset, true);
assert.equal(legacyResult.source, "legacy-analysis-settings");
assert.ok(
  legacyResult.trace.legacyMappings.some((mapping) => (
    mapping.code === "education-savings-offset-legacy-analysis-setting-mapped"
  )),
  "legacy analysis setting should map into scenario settings trace"
);

const nestedLegacyResult = resolveScenarioSettings({
  analysisSettings: {
    educationAssumptions: {
      fundingTreatment: {
        useExistingEducationSavingsOffset: true
      }
    }
  }
});
assert.equal(nestedLegacyResult.education.useEducationSavingsOffset, true);
assert.match(
  nestedLegacyResult.trace.fieldSources["education.useEducationSavingsOffset"],
  /fundingTreatment\.useExistingEducationSavingsOffset/
);

[
  "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-scenario-settings.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js"
].forEach((scriptPath) => loadScript(context, scriptPath));
const buildNeedLine = context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const scenarioSettings = resolveScenarioSettings({
  runtimeScenarioSettings: {
    education: {
      useEducationSavingsOffset: true
    }
  },
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      useExistingEducationSavingsOffset: false
    }
  }
});
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
    },
    inflationAssumptions: {
      educationInflationRatePercent: 5
    }
  },
  coverageStrategyScenarioSettings: scenarioSettings,
  valuationDate: "2026-01-01",
  horizonYears: 10
});
assert.equal(needLine.componentModels.education.lifetimeProjection.educationSavingsOffset.active, true);
assert.equal(
  needLine.componentModels.education.lifetimeProjection.educationSavingsOffset.settingOwnership,
  "coverage-strategy-scenario-settings"
);
assert.equal(needLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 15000);
assert.equal(needLine.needPoints[0].componentAmounts.education, 45000);
assert.equal(needLine.assumptionsUsed.coverageStrategyScenarioSettings.education.useEducationSavingsOffset, true);
assert.equal(
  needLine.needPoints[0].trace.educationProjection.coverageStrategyScenarioSettingsSource,
  "runtimeScenarioSettings"
);

const pageSource = readRepoFile("pages/coverage-strategy.html");
assert.ok(
  pageSource.indexOf("coverage-strategy-scenario-settings.js")
    < pageSource.indexOf("coverage-strategy-need-line-adapter.js"),
  "Coverage Strategy should load scenario settings before the Need Line adapter"
);
assert.ok(
  pageSource.indexOf("coverage-strategy-scenario-settings.js")
    < pageSource.indexOf("coverage-strategy-page.js"),
  "Coverage Strategy should load scenario settings before the page controller"
);
[
  "pages/analysis-estimate.html",
  "pages/dime-results.html",
  "pages/simple-needs-results.html",
  "pages/hlv-results.html",
  "pages/income-loss-impact.html"
].forEach((pagePath) => {
  assert.doesNotMatch(readRepoFile(pagePath), /coverage-strategy-scenario-settings\.js/);
});

const analysisSetupSource = readRepoFile("pages/analysis-setup.html");
assert.doesNotMatch(analysisSetupSource, /coverageStrategyScenarioSettings/);
assert.doesNotMatch(analysisSetupSource, /useExistingEducationSavingsOffset/);

const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const trayIndex = controllerSource.indexOf("coverage-strategy-scenario-tray");
const trayEndIndex = controllerSource.indexOf("</div>", controllerSource.indexOf("is-diagnostic-export", trayIndex));
const trayMarkup = controllerSource.slice(trayIndex, trayEndIndex);
assert.match(trayMarkup, /Education savings/);
assert.match(trayMarkup, /data-coverage-strategy-education-savings-offset/);
assert.doesNotMatch(trayMarkup, /educationTreatmentMode|educationPaymentScheduleMode|educationResourceSpendingMode|projectedDependentTimingRows/i);
assert.match(controllerSource, /coverageStrategyScenarioSettings/);

console.log("coverage strategy scenario settings check passed");
