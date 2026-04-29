#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const RAW_EXISTING_COVERAGE = 100000;
const TREATED_EXISTING_COVERAGE = 25000;
const TREATED_SOURCE_PATH = "treatedExistingCoverageOffset.totalTreatedCoverageOffset";
const RAW_SOURCE_PATH = "existingCoverage.totalExistingCoverage";
const FALLBACK_WARNING_CODE = "treated-existing-coverage-unavailable-raw-fallback";

const context = {
  console,
  window: null
};
context.window = context;
context.globalThis = context;
context.LensApp = { lensAnalysis: {} };
context.window.LensApp = context.LensApp;

vm.createContext(context);

function loadScript(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

loadScript("app/features/lens-analysis/analysis-methods.js");

const methods = context.LensApp.lensAnalysis.analysisMethods;

assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createModel(options = {}) {
  const includeTreatedOffset = options.includeTreatedOffset !== false;
  const model = {
    incomeBasis: {
      annualIncomeReplacementBase: 100000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      mortgageBalance: 50000,
      totalDebtPayoffNeed: 80000
    },
    educationSupport: {
      totalEducationFundingNeed: 25000
    },
    finalExpenses: {
      totalFinalExpenseNeed: 15000
    },
    transitionNeeds: {
      totalTransitionNeed: 10000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 60000,
      annualDiscretionaryPersonalSpending: 12000
    },
    survivorScenario: {
      survivorNetAnnualIncome: 0,
      survivorIncomeStartDelayMonths: 0
    },
    existingCoverage: {
      totalExistingCoverage: RAW_EXISTING_COVERAGE
    }
  };

  if (includeTreatedOffset) {
    model.treatedExistingCoverageOffset = {
      totalRawCoverage: RAW_EXISTING_COVERAGE,
      totalTreatedCoverageOffset: options.treatedValue == null
        ? TREATED_EXISTING_COVERAGE
        : options.treatedValue,
      policyCount: 3,
      includedPolicyCount: 2,
      excludedPolicyCount: 1,
      warnings: [],
      metadata: {
        consumedByMethods: true,
        reason: options.reason || ""
      }
    };
  }

  return model;
}

function createSettings(overrides = {}) {
  return {
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false,
    dimeIncomeYears: 10,
    needsSupportDurationYears: 10,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: false,
    hlvProjectionYears: 20,
    ...overrides
  };
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function hasWarningCode(result, code) {
  return Array.isArray(result?.warnings) && result.warnings.some((warning) => warning?.code === code);
}

function assertTraceShowsTreatedUsed(result, methodName) {
  const trace = findTrace(result, "existingCoverageOffset");
  assert.ok(trace, methodName + " should include an existing coverage offset trace row.");
  assert.equal(trace.value, TREATED_EXISTING_COVERAGE);
  assert.equal(trace.formula, TREATED_SOURCE_PATH);
  assert.equal(trace.sourcePaths[0], TREATED_SOURCE_PATH);
  assert.equal(trace.inputs.includeExistingCoverageOffset, true);
  assert.equal(trace.inputs.rawExistingCoverageTotal, RAW_EXISTING_COVERAGE);
  assert.equal(trace.inputs.rawExistingCoverageOffsetUsed, null);
  assert.equal(trace.inputs.methodUsedExistingCoverageOffset, TREATED_EXISTING_COVERAGE);
  assert.equal(trace.inputs.methodOffsetSourcePath, TREATED_SOURCE_PATH);
  assert.equal(trace.inputs.existingCoverageOffsetStatus, "treated-used");
  assert.equal(trace.inputs.existingCoverageOffsetFallbackUsed, false);
  assert.equal(trace.inputs.existingCoverageOffsetFallbackReason, null);
  assert.equal(trace.inputs.treatedExistingCoverageOffsetAvailable, true);
  assert.equal(trace.inputs.treatedExistingCoverageTotal, TREATED_EXISTING_COVERAGE);
  assert.equal(trace.inputs.treatedExistingCoverageConsumedByMethods, true);
  assert.equal(trace.inputs.treatedExistingCoverageMetadataConsumedByMethods, true);
  assert.equal(trace.inputs.treatedExistingCoveragePreparedNotUsed, false);
  assert.equal(trace.inputs.treatedExistingCoveragePolicyCount, 3);
  assert.equal(trace.inputs.treatedExistingCoverageIncludedPolicyCount, 2);
  assert.equal(trace.inputs.treatedExistingCoverageExcludedPolicyCount, 1);
  assert.equal(trace.inputs.treatedExistingCoverageTraceNote, "treatedExistingCoverageOffset method-used");
}

function assertTraceShowsRawFallback(result, methodName) {
  const trace = findTrace(result, "existingCoverageOffset");
  assert.ok(trace, methodName + " should include an existing coverage offset trace row.");
  assert.equal(trace.value, RAW_EXISTING_COVERAGE);
  assert.equal(trace.formula, RAW_SOURCE_PATH);
  assert.equal(trace.sourcePaths[0], RAW_SOURCE_PATH);
  assert.equal(trace.inputs.includeExistingCoverageOffset, true);
  assert.equal(trace.inputs.rawExistingCoverageTotal, RAW_EXISTING_COVERAGE);
  assert.equal(trace.inputs.rawExistingCoverageOffsetUsed, RAW_EXISTING_COVERAGE);
  assert.equal(trace.inputs.methodUsedExistingCoverageOffset, RAW_EXISTING_COVERAGE);
  assert.equal(trace.inputs.methodOffsetSourcePath, RAW_SOURCE_PATH);
  assert.equal(trace.inputs.existingCoverageOffsetStatus, "raw-fallback");
  assert.equal(trace.inputs.existingCoverageOffsetFallbackUsed, true);
  assert.equal(trace.inputs.existingCoverageOffsetFallbackReason, "missing-treated-existing-coverage-offset");
  assert.equal(trace.inputs.treatedExistingCoverageOffsetAvailable, false);
  assert.equal(trace.inputs.treatedExistingCoverageConsumedByMethods, false);
  assert.equal(trace.inputs.treatedExistingCoveragePreparedNotUsed, false);
  assert.equal(
    trace.inputs.existingCoverageOffsetFallbackNote,
    "Treated existing coverage unavailable; raw linked coverage used as fallback."
  );
  assert.equal(
    trace.inputs.treatedExistingCoverageTraceNote,
    "Treated existing coverage unavailable; raw linked coverage used as fallback."
  );
}

function assertTraceShowsExistingCoverageExcluded(result, methodName) {
  const trace = findTrace(result, "existingCoverageOffset");
  assert.ok(trace, methodName + " should include an existing coverage offset trace row.");
  assert.equal(trace.value, 0);
  assert.equal(trace.formula, "disabled by settings");
  assert.deepEqual(cloneJson(trace.sourcePaths), ["settings.includeExistingCoverageOffset"]);
  assert.equal(trace.inputs.includeExistingCoverageOffset, false);
  assert.equal(trace.inputs.methodUsedExistingCoverageOffset, 0);
  assert.equal(trace.inputs.methodOffsetSourcePath, null);
  assert.equal(trace.inputs.existingCoverageOffsetStatus, "excluded");
  assert.equal(trace.inputs.existingCoverageOffsetFallbackUsed, false);
  assert.equal(trace.inputs.treatedExistingCoverageOffsetAvailable, true);
  assert.equal(trace.inputs.treatedExistingCoverageConsumedByMethods, false);
}

function assertTreatedOffsetUsed(methodCase) {
  const settings = createSettings();
  const modelWithTreatedOffset = createModel();
  const originalModel = cloneJson(modelWithTreatedOffset);
  const result = methodCase.run(modelWithTreatedOffset, settings);

  assert.deepEqual(modelWithTreatedOffset, originalModel, methodCase.name + " should not mutate the model input.");
  assert.equal(
    result.commonOffsets.existingCoverageOffset,
    TREATED_EXISTING_COVERAGE,
    methodCase.name + " should use treatedExistingCoverageOffset.totalTreatedCoverageOffset."
  );
  assertTraceShowsTreatedUsed(result, methodCase.name);
  assert.equal(hasWarningCode(result, FALLBACK_WARNING_CODE), false);
}

function assertRawFallbackUsed(methodCase) {
  const settings = createSettings();
  const modelWithoutTreatedOffset = createModel({ includeTreatedOffset: false });
  const originalModel = cloneJson(modelWithoutTreatedOffset);
  const result = methodCase.run(modelWithoutTreatedOffset, settings);

  assert.deepEqual(modelWithoutTreatedOffset, originalModel, methodCase.name + " should not mutate the model input.");
  assert.equal(
    result.commonOffsets.existingCoverageOffset,
    RAW_EXISTING_COVERAGE,
    methodCase.name + " should fall back to existingCoverage.totalExistingCoverage when treated coverage is unavailable."
  );
  assert.ok(hasWarningCode(result, FALLBACK_WARNING_CODE), methodCase.name + " should warn when raw fallback is used.");
  assertTraceShowsRawFallback(result, methodCase.name);
}

function assertDisabledExistingCoverageOffset(methodCase) {
  const result = methodCase.run(createModel(), createSettings({
    includeExistingCoverageOffset: false
  }));

  assert.equal(
    result.commonOffsets.existingCoverageOffset,
    0,
    methodCase.name + " should force existing coverage offset to 0 when disabled."
  );
  assertTraceShowsExistingCoverageExcluded(result, methodCase.name);
  assert.equal(hasWarningCode(result, FALLBACK_WARNING_CODE), false);
}

[
  {
    name: "DIME",
    run: methods.runDimeAnalysis
  },
  {
    name: "Needs",
    run: methods.runNeedsAnalysis
  },
  {
    name: "Simple HLV",
    run: methods.runHumanLifeValueAnalysis
  }
].forEach((methodCase) => {
  assertTreatedOffsetUsed(methodCase);
  assertRawFallbackUsed(methodCase);
  assertDisabledExistingCoverageOffset(methodCase);
});

console.log("Existing coverage method trace checks passed.");
