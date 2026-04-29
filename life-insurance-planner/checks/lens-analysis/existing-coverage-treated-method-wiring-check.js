#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function createContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  function loadScript(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  [
    "app/features/coverage/coverage-policy-utils.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/block-outputs.js",
    "app/features/lens-analysis/helpers/income-tax-calculations.js",
    "app/features/lens-analysis/helpers/housing-support-calculations.js",
    "app/features/lens-analysis/blocks/existing-coverage.js",
    "app/features/lens-analysis/blocks/offset-assets.js",
    "app/features/lens-analysis/blocks/survivor-scenario.js",
    "app/features/lens-analysis/blocks/tax-context.js",
    "app/features/lens-analysis/blocks/income-net-income.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/blocks/housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/non-housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/education-support.js",
    "app/features/lens-analysis/blocks/final-expenses.js",
    "app/features/lens-analysis/blocks/transition-needs.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js"
  ].forEach(loadScript);

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSourceData() {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    mortgageBalance: 0
  };
}

function createSettings() {
  return {
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false,
    dimeIncomeYears: 10,
    needsSupportDurationYears: 10,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: false,
    hlvProjectionYears: 20
  };
}

function buildModel(lensAnalysis, options = {}) {
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: createSourceData(),
    analysisSettings: options.analysisSettings || {},
    valuationDate: options.valuationDate || "2026-01-01",
    profileRecord: {
      coveragePolicies: options.coveragePolicies || []
    }
  });

  assert.ok(result.lensModel, "Lens model should build for treated existing coverage method wiring checks.");
  return result.lensModel;
}

function getMethodCases(methods) {
  return [
    { name: "DIME", run: methods.runDimeAnalysis },
    { name: "Needs", run: methods.runNeedsAnalysis },
    { name: "Simple HLV", run: methods.runHumanLifeValueAnalysis }
  ];
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function assertAllMethodsUseOffset(methods, model, expectedOffset, message) {
  getMethodCases(methods).forEach((methodCase) => {
    const modelBefore = cloneJson(model);
    const result = methodCase.run(model, createSettings());
    const trace = findTrace(result, "existingCoverageOffset");

    assert.deepEqual(cloneJson(model), modelBefore, methodCase.name + " should not mutate the model input.");
    assert.equal(result.commonOffsets.existingCoverageOffset, expectedOffset, methodCase.name + " " + message);
    assert.equal(trace.inputs.methodUsedExistingCoverageOffset, expectedOffset);
    assert.equal(trace.inputs.methodOffsetSourcePath, "treatedExistingCoverageOffset.totalTreatedCoverageOffset");
    assert.equal(trace.inputs.treatedExistingCoverageConsumedByMethods, true);
  });
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const methods = lensAnalysis.analysisMethods;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof methods?.runDimeAnalysis, "function");
assert.equal(typeof methods?.runNeedsAnalysis, "function");
assert.equal(typeof methods?.runHumanLifeValueAnalysis, "function");

const rawEquivalentPolicies = [
  {
    id: "raw-equivalent-group",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    effectiveDate: "2020-01-01",
    faceAmount: "100000"
  },
  {
    id: "raw-equivalent-term",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    effectiveDate: "2020-01-01",
    faceAmount: "200000"
  },
  {
    id: "raw-equivalent-pending",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    effectiveDate: "2026-06-01",
    faceAmount: "50000"
  }
];
const originalRawEquivalentPolicies = cloneJson(rawEquivalentPolicies);
const rawEquivalentModel = buildModel(lensAnalysis, {
  coveragePolicies: rawEquivalentPolicies
});
assert.equal(rawEquivalentModel.existingCoverage.totalExistingCoverage, 350000);
assert.equal(rawEquivalentModel.treatedExistingCoverageOffset.totalRawCoverage, 350000);
assert.equal(rawEquivalentModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, 350000);
assert.equal(rawEquivalentModel.treatedExistingCoverageOffset.metadata.consumedByMethods, true);
assertAllMethodsUseOffset(methods, rawEquivalentModel, 350000, "should preserve default raw-equivalent parity.");
assert.deepEqual(rawEquivalentPolicies, originalRawEquivalentPolicies, "Model prep must not mutate source coverage policies.");

const groupDiscountModel = buildModel(lensAnalysis, {
  coveragePolicies: [
    {
      id: "discounted-group",
      coverageSource: "groupEmployer",
      policyType: "Group Life",
      effectiveDate: "2020-01-01",
      faceAmount: "100000"
    },
    {
      id: "undiscounted-term",
      coverageSource: "individual",
      policyType: "Term Life",
      termLength: "20",
      effectiveDate: "2020-01-01",
      faceAmount: "200000"
    }
  ],
  analysisSettings: {
    existingCoverageAssumptions: {
      groupCoverageTreatment: {
        include: true,
        reliabilityDiscountPercent: 50
      },
      source: "existing-coverage-treated-method-wiring-check"
    }
  }
});
assert.equal(groupDiscountModel.existingCoverage.totalExistingCoverage, 300000);
assert.equal(groupDiscountModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, 250000);
assertAllMethodsUseOffset(methods, groupDiscountModel, 250000, "should use non-neutral group treatment.");

const pendingExcludedModel = buildModel(lensAnalysis, {
  coveragePolicies: [
    {
      id: "active-term",
      coverageSource: "individual",
      policyType: "Term Life",
      termLength: "20",
      effectiveDate: "2020-01-01",
      faceAmount: "200000"
    },
    {
      id: "future-effective-term",
      coverageSource: "individual",
      policyType: "Term Life",
      termLength: "20",
      effectiveDate: "2026-06-01",
      faceAmount: "50000"
    }
  ],
  analysisSettings: {
    existingCoverageAssumptions: {
      pendingCoverageTreatment: {
        include: false,
        reliabilityDiscountPercent: 0
      },
      source: "existing-coverage-treated-method-wiring-check"
    }
  },
  valuationDate: "2026-01-01"
});
const pendingPolicy = pendingExcludedModel.treatedExistingCoverageOffset.policies.find((policy) => {
  return policy.policyId === "future-effective-term";
});
assert.equal(pendingExcludedModel.existingCoverage.totalExistingCoverage, 250000);
assert.equal(pendingExcludedModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, 200000);
assert.equal(pendingPolicy.treatmentKind, "pending");
assert.equal(pendingPolicy.included, false);
assert.equal(pendingPolicy.exclusionReason, "pending-excluded-by-assumption");
assertAllMethodsUseOffset(methods, pendingExcludedModel, 200000, "should use date-derived pending treatment.");

console.log("Existing coverage treated method wiring checks passed.");
