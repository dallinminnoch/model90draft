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

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item && item.code).filter(Boolean);
}

function createNeedPoints(years) {
  return Array.from({ length: years + 1 }, function (_unused, yearIndex) {
    const year = 2026 + yearIndex;
    return {
      yearIndex,
      date: `${year}-01-01`,
      calendarYear: year,
      age: 40 + yearIndex
    };
  });
}

function runProjection(helper, overrides = {}) {
  const input = {
    projectionYears: overrides.projectionYears ?? 5,
    valuationDate: overrides.valuationDate || "2026-01-01",
    transitionNeedAmount: overrides.transitionNeedAmount,
    transitionNeedSource: overrides.transitionNeedSource || "fixture.transitionNeeds",
    transitionMode: overrides.transitionMode,
    transitionDurationMonths: overrides.transitionDurationMonths,
    transitionDurationYears: overrides.transitionDurationYears,
    annualNeedPoints: overrides.annualNeedPoints || createNeedPoints(overrides.projectionYears ?? 5),
    sourcePaths: overrides.sourcePaths || ["transitionNeeds.totalTransitionNeed"]
  };
  const before = JSON.stringify(input);
  const result = helper(input);
  assert.equal(JSON.stringify(input), before, "helper must not mutate input");
  assert.doesNotThrow(() => JSON.stringify(result), "helper output must be serializable");
  return result;
}

function createNeedsResult(transitionNeeds, traceInputs = {}) {
  return {
    method: "needsAnalysis",
    grossNeed: transitionNeeds,
    netCoverageGap: transitionNeeds,
    components: {
      debtPayoff: 0,
      essentialSupport: 0,
      education: 0,
      finalExpenses: 0,
      healthcareExpenses: 0,
      transitionNeeds,
      discretionarySupport: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      survivorIncomeOffset: 0,
      totalOffset: 0
    },
    assumptions: {
      valuationDate: "2026-01-01",
      needsSupportDurationYears: 0,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: false
    },
    trace: [
      {
        key: "transitionNeeds",
        value: transitionNeeds,
        formula: "transitionNeeds.totalTransitionNeed",
        inputs: traceInputs,
        sourcePaths: ["transitionNeeds.totalTransitionNeed", "settings.includeTransitionNeeds"]
      }
    ]
  };
}

function loadNeedLineBuilder() {
  const context = createContext();
  [
    "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-transition-needs-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
    "app/features/lens-analysis/coverage-strategy-scenario-settings.js",
    "app/features/lens-analysis/coverage-strategy-need-line-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
}

const helperSource = readRepoFile("app/features/lens-analysis/coverage-strategy-transition-needs-lifetime-projection.js");
assert.match(helperSource, /Coverage Strategy transition needs lifetime projection/);
assert.doesNotMatch(helperSource, /\bdocument\b|localStorage|sessionStorage|indexedDB|querySelector/);
assert.match(helperSource, /module\.exports/);

const helperContext = createContext();
loadScript(helperContext, "app/features/lens-analysis/coverage-strategy-transition-needs-lifetime-projection.js");
const helper =
  helperContext.LensApp.lensAnalysis.calculateCoverageStrategyTransitionNeedsLifetimeProjection;
assert.equal(typeof helper, "function");

const deathYearOnly = runProjection(helper, {
  transitionNeedAmount: 25000,
  transitionMode: "deathYearOnly",
  projectionYears: 3
});
assert.equal(deathYearOnly.status, "complete");
assert.equal(deathYearOnly.projectionMode, "deathYearOnly");
assert.equal(deathYearOnly.transitionNeedPoints[0].transitionNeedAmount, 25000);
assert.equal(deathYearOnly.transitionNeedPoints[1].transitionNeedAmount, 0);
assert.equal(
  deathYearOnly.transitionNeedPoints[1].trace.transitionNeedDeclineReason,
  "one-time-death-year-transition-need"
);

const durationBridge = runProjection(helper, {
  transitionNeedAmount: 24000,
  transitionMode: "durationBridge",
  transitionDurationMonths: 24,
  projectionYears: 4
});
assert.equal(durationBridge.status, "complete");
assert.equal(durationBridge.projectionMode, "durationBridge");
assert.equal(durationBridge.transitionNeedPoints[0].transitionNeedAmount, 24000);
assert.equal(durationBridge.transitionNeedPoints[1].transitionNeedAmount, 12000);
assert.equal(durationBridge.transitionNeedPoints[2].transitionNeedAmount, 0);
assert.equal(durationBridge.transitionNeedPoints[4].transitionNeedAmount, 0);
assert.equal(durationBridge.assumptionsUsed.durationMonths, 24);
assert.equal(durationBridge.transitionNeedPoints[1].remainingDurationMonths, 12);

const durationFromYears = runProjection(helper, {
  transitionNeedAmount: 36000,
  transitionDurationYears: 3,
  projectionYears: 4
});
assert.equal(durationFromYears.projectionMode, "durationBridge");
assert.equal(durationFromYears.transitionNeedPoints[1].transitionNeedAmount, 24000);
assert.equal(durationFromYears.transitionNeedPoints[3].transitionNeedAmount, 0);
assert.equal(durationFromYears.assumptionsUsed.transitionModeSource, "duration-facts");

const flatFallback = runProjection(helper, {
  transitionNeedAmount: 8000,
  projectionYears: 3
});
assert.equal(flatFallback.status, "complete");
assert.equal(flatFallback.projectionMode, "flatFallback");
assert.equal(flatFallback.transitionNeedPoints[0].transitionNeedAmount, 8000);
assert.equal(flatFallback.transitionNeedPoints[3].transitionNeedAmount, 8000);
assert.equal(flatFallback.assumptionsUsed.currentBehaviorPreservedByFallback, true);
assert.ok(issueCodes(flatFallback.warnings).includes("transition-needs-duration-unavailable-flat-fallback"));

const unavailable = runProjection(helper, {
  transitionNeedAmount: null,
  projectionYears: 2
});
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.projectionMode, "unavailable");
assert.equal(unavailable.transitionNeedPoints[0].transitionNeedAmount, 0);
assert.ok(issueCodes(unavailable.dataGaps).includes("transition-needs-amount-unavailable"));

const buildNeedLine = loadNeedLineBuilder();
const flatNeedLineInput = {
  lensModel: {
    profileFacts: { clientDateOfBirth: "1986-01-01" }
  },
  needsResult: createNeedsResult(15000),
  analysisSettings: {},
  valuationDate: "2026-01-01",
  horizonYears: 3
};
const flatNeedLineInputBefore = JSON.stringify(flatNeedLineInput);
const flatNeedLine = buildNeedLine(flatNeedLineInput);
assert.equal(JSON.stringify(flatNeedLineInput), flatNeedLineInputBefore);
assert.equal(flatNeedLine.needPoints[0].componentAmounts.transitionNeeds, 15000);
assert.equal(flatNeedLine.needPoints[3].componentAmounts.transitionNeeds, 15000);
assert.equal(flatNeedLine.needPoints[0].trace.transitionNeedsProjection.projectionMode, "flatFallback");
assert.equal(flatNeedLine.componentModels.transitionNeeds.lifetimeProjection.projectionMode, "flatFallback");
assert.ok(issueCodes(flatNeedLine.warnings).includes("transition-needs-duration-unavailable-flat-fallback"));

const durationNeedLine = buildNeedLine({
  lensModel: {
    profileFacts: { clientDateOfBirth: "1986-01-01" }
  },
  needsResult: createNeedsResult(24000),
  analysisSettings: {},
  valuationDate: "2026-01-01",
  horizonYears: 3,
  transitionNeedsProjection: {
    transitionMode: "durationBridge",
    transitionDurationMonths: 24
  }
});
assert.equal(durationNeedLine.needPoints[0].componentAmounts.transitionNeeds, 24000);
assert.equal(durationNeedLine.needPoints[1].componentAmounts.transitionNeeds, 12000);
assert.equal(durationNeedLine.needPoints[2].componentAmounts.transitionNeeds, 0);
assert.equal(durationNeedLine.needPoints[3].componentAmounts.transitionNeeds, 0);
assert.equal(durationNeedLine.needPoints[0].trace.transitionNeedsProjection.projectionMode, "durationBridge");
assert.equal(durationNeedLine.componentModels.transitionNeeds.lifetimeProjection.projectionMode, "durationBridge");
assert.equal(
  durationNeedLine.componentModels.transitionNeeds.lifetimeProjection.assumptionsUsed.durationMonths,
  24
);

const deathYearNeedLine = buildNeedLine({
  lensModel: {
    profileFacts: { clientDateOfBirth: "1986-01-01" }
  },
  needsResult: createNeedsResult(25000),
  analysisSettings: {},
  valuationDate: "2026-01-01",
  horizonYears: 2,
  transitionNeedsProjection: {
    transitionMode: "deathYearOnly"
  }
});
assert.equal(deathYearNeedLine.needPoints[0].componentAmounts.transitionNeeds, 25000);
assert.equal(deathYearNeedLine.needPoints[1].componentAmounts.transitionNeeds, 0);
assert.equal(deathYearNeedLine.needPoints[0].trace.transitionNeedsProjection.projectionMode, "deathYearOnly");

const diagnosticContext = createContext();
loadScript(diagnosticContext, "app/features/lens-analysis/coverage-strategy-diagnostic-export.js");
const snapshot = diagnosticContext.LensApp.lensAnalysis.buildCoverageStrategyDiagnosticExportSnapshot({
  needLine: durationNeedLine,
  visibleScenarioControls: {}
});
assert.ok(snapshot.coverageStrategyGeneratedOutputs.transitionNeedsLifetimeProjection);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.transitionNeedsLifetimeProjection.projectionMode,
  "durationBridge"
);
assert.equal(
  snapshot.coverageStrategyGeneratedOutputs.transitionNeedsLifetimeProjection.transitionNeedPoints[1].transitionNeedAmount,
  12000
);
const html = diagnosticContext.LensApp.lensAnalysis.renderCoverageStrategyDiagnosticExportHtml(snapshot);
assert.match(html, /transitionNeedsLifetimeProjection/);
assert.match(html, /durationBridge/);

console.log("coverage-strategy-transition-needs-lifetime-projection-check passed");
