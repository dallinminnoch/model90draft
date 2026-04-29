#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const RAW_EXISTING_COVERAGE = 100000;
const TREATED_EXISTING_COVERAGE = 25000;

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
      totalTreatedCoverageOffset: TREATED_EXISTING_COVERAGE,
      policyCount: 3,
      includedPolicyCount: 2,
      excludedPolicyCount: 1,
      metadata: {
        consumedByMethods: false
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

function assertTraceIncludesPreparedCoverage(result, methodName, expectedOffsetUsed) {
  const trace = findTrace(result, "existingCoverageOffset");
  assert.ok(trace, methodName + " should include an existing coverage offset trace row.");
  assert.equal(trace.value, expectedOffsetUsed, methodName + " trace value should match the method-used offset.");
  assert.ok(
    trace.sourcePaths.includes("existingCoverage.totalExistingCoverage"),
    methodName + " trace should expose the raw existing coverage source path."
  );
  assert.ok(
    trace.sourcePaths.includes("treatedExistingCoverageOffset.totalTreatedCoverageOffset"),
    methodName + " trace should expose the prepared treated coverage source path."
  );
  assert.ok(
    trace.sourcePaths.includes("treatedExistingCoverageOffset.metadata.consumedByMethods"),
    methodName + " trace should expose method-consumption metadata."
  );
  assert.equal(trace.inputs.includeExistingCoverageOffset, expectedOffsetUsed > 0);
  assert.equal(trace.inputs.rawExistingCoverageTotal, RAW_EXISTING_COVERAGE);
  assert.equal(trace.inputs.rawExistingCoverageOffsetUsed, expectedOffsetUsed);
  assert.equal(trace.inputs.methodOffsetSourcePath, "existingCoverage.totalExistingCoverage");
  assert.equal(trace.inputs.treatedExistingCoverageOffsetAvailable, true);
  assert.equal(trace.inputs.treatedExistingCoverageTotal, TREATED_EXISTING_COVERAGE);
  assert.equal(trace.inputs.treatedExistingCoverageConsumedByMethods, false);
  assert.equal(trace.inputs.treatedExistingCoveragePreparedNotUsed, true);
  assert.equal(trace.inputs.treatedExistingCoveragePolicyCount, 3);
  assert.equal(trace.inputs.treatedExistingCoverageIncludedPolicyCount, 2);
  assert.equal(trace.inputs.treatedExistingCoverageExcludedPolicyCount, 1);
  assert.equal(
    trace.inputs.treatedExistingCoverageTraceNote,
    "treatedExistingCoverageOffset prepared but not method-used"
  );
}

function assertMethodOutputParity(methodCase) {
  const settings = createSettings();
  const modelWithTreatedOffset = createModel();
  const originalModel = cloneJson(modelWithTreatedOffset);
  const modelWithoutTreatedOffset = createModel({ includeTreatedOffset: false });

  const resultWithTreatedOffset = methodCase.run(modelWithTreatedOffset, settings);
  const resultWithoutTreatedOffset = methodCase.run(modelWithoutTreatedOffset, settings);

  assert.deepEqual(modelWithTreatedOffset, originalModel, methodCase.name + " should not mutate the model input.");
  assert.equal(
    resultWithTreatedOffset.commonOffsets.existingCoverageOffset,
    RAW_EXISTING_COVERAGE,
    methodCase.name + " should use existingCoverage.totalExistingCoverage."
  );
  assert.equal(
    resultWithTreatedOffset.commonOffsets.existingCoverageOffset,
    resultWithoutTreatedOffset.commonOffsets.existingCoverageOffset,
    methodCase.name + " existing coverage offset should not depend on treatedExistingCoverageOffset."
  );
  assert.equal(
    resultWithTreatedOffset.commonOffsets.totalOffset,
    resultWithoutTreatedOffset.commonOffsets.totalOffset,
    methodCase.name + " total offset should not depend on treatedExistingCoverageOffset."
  );
  assert.equal(
    resultWithTreatedOffset[methodCase.grossKey],
    resultWithoutTreatedOffset[methodCase.grossKey],
    methodCase.name + " gross output should not depend on treatedExistingCoverageOffset."
  );
  assert.equal(
    resultWithTreatedOffset.netCoverageGap,
    resultWithoutTreatedOffset.netCoverageGap,
    methodCase.name + " net coverage gap should not depend on treatedExistingCoverageOffset."
  );
  assert.deepEqual(
    resultWithTreatedOffset.components,
    resultWithoutTreatedOffset.components,
    methodCase.name + " components should not depend on treatedExistingCoverageOffset."
  );
  assertTraceIncludesPreparedCoverage(resultWithTreatedOffset, methodCase.name, RAW_EXISTING_COVERAGE);
}

function assertDisabledExistingCoverageOffset(methodCase) {
  const result = methodCase.run(createModel(), createSettings({
    includeExistingCoverageOffset: false
  }));
  const trace = findTrace(result, "existingCoverageOffset");

  assert.equal(
    result.commonOffsets.existingCoverageOffset,
    0,
    methodCase.name + " should force existing coverage offset to 0 when disabled."
  );
  assert.equal(trace.formula, "disabled by settings");
  assertTraceIncludesPreparedCoverage(result, methodCase.name, 0);
}

[
  {
    name: "DIME",
    run: methods.runDimeAnalysis,
    grossKey: "grossNeed"
  },
  {
    name: "Needs",
    run: methods.runNeedsAnalysis,
    grossKey: "grossNeed"
  },
  {
    name: "Simple HLV",
    run: methods.runHumanLifeValueAnalysis,
    grossKey: "grossHumanLifeValue"
  }
].forEach((methodCase) => {
  assertMethodOutputParity(methodCase);
  assertDisabledExistingCoverageOffset(methodCase);
});

console.log("Existing coverage method trace checks passed.");
