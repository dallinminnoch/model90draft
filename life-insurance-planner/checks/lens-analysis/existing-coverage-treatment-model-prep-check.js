#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function createContext(options = {}) {
  const includeTreatmentHelper = options.includeTreatmentHelper !== false;
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
    ...(includeTreatmentHelper
      ? ["app/features/lens-analysis/existing-coverage-treatment-calculations.js"]
      : []),
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js"
  ].forEach(loadScript);

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasWarningCode(warnings, code) {
  return Array.isArray(warnings) && warnings.some((warning) => warning?.code === code);
}

function createSourceData() {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    mortgageBalance: 0
  };
}

function createCoveragePolicies() {
  return [
    {
      id: "group-policy",
      coverageSource: "groupEmployer",
      policyType: "Group Life",
      faceAmount: "100000"
    },
    {
      id: "term-policy",
      coverageSource: "individual",
      policyType: "Term Life",
      termLength: "20",
      effectiveDate: "2020-01-01",
      faceAmount: "200000"
    }
  ];
}

function createAnalysisSettings() {
  return {
    existingCoverageAssumptions: {
      groupCoverageTreatment: {
        include: true,
        reliabilityDiscountPercent: 25
      },
      individualTermTreatment: {
        include: true,
        reliabilityDiscountPercent: 0,
        excludeIfExpiresWithinYears: null
      },
      source: "existing-coverage-treatment-model-prep-check",
      lastUpdatedAt: "2026-01-01T00:00:00.000Z"
    }
  };
}

function buildModel(context, options = {}) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: createSourceData(),
    analysisSettings: options.analysisSettings || createAnalysisSettings(),
    profileRecord: options.profileRecord || {
      coveragePolicies: createCoveragePolicies()
    }
  });

  assert.ok(result.lensModel, "Lens model should build for existing coverage treatment prep checks.");
  return result.lensModel;
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.calculateExistingCoverageTreatment, "function");
assert.equal(lensAnalysis.analysisMethods, undefined, "Model-prep check should not load analysis methods.");

const coveragePolicies = createCoveragePolicies();
const originalPolicies = cloneJson(coveragePolicies);
const model = buildModel(context, {
  profileRecord: {
    coveragePolicies
  }
});
const treatedExistingCoverageOffset = model.treatedExistingCoverageOffset;

assert.equal(model.existingCoverage.totalExistingCoverage, 300000);
assert.equal(treatedExistingCoverageOffset.totalRawCoverage, 300000);
assert.equal(treatedExistingCoverageOffset.totalIncludedRawCoverage, 300000);
assert.equal(treatedExistingCoverageOffset.totalTreatedCoverageOffset, 275000);
assert.equal(treatedExistingCoverageOffset.excludedCoverageValue, 0);
assert.equal(treatedExistingCoverageOffset.policyCount, 2);
assert.equal(treatedExistingCoverageOffset.includedPolicyCount, 2);
assert.equal(treatedExistingCoverageOffset.excludedPolicyCount, 0);
assert.equal(treatedExistingCoverageOffset.metadata.rawExistingCoverageTotal, 300000);
assert.equal(treatedExistingCoverageOffset.metadata.methodOffsetSourcePath, "existingCoverage.totalExistingCoverage");
assert.equal(treatedExistingCoverageOffset.metadata.consumedByMethods, false);
assert.equal(treatedExistingCoverageOffset.metadata.valuationDate, "2026-01-01");
assert.equal(
  treatedExistingCoverageOffset.metadata.valuationDateSource,
  "analysisSettings.existingCoverageAssumptions.lastUpdatedAt"
);
assert.deepEqual(coveragePolicies, originalPolicies, "Model prep must not mutate input coverage policies.");

const noHelperContext = createContext({ includeTreatmentHelper: false });
const noHelperModel = buildModel(noHelperContext);
assert.equal(noHelperModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, null);
assert.equal(noHelperModel.treatedExistingCoverageOffset.metadata.reason, "missing-existing-coverage-treatment-helper");
assert.ok(
  hasWarningCode(noHelperModel.treatedExistingCoverageOffset.warnings, "missing-existing-coverage-treatment-helper"),
  "Missing helper should create a model-level prep warning."
);

const missingPoliciesModel = buildModel(context, {
  profileRecord: {},
  analysisSettings: createAnalysisSettings()
});
assert.equal(missingPoliciesModel.existingCoverage.totalExistingCoverage, null);
assert.equal(missingPoliciesModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, null);
assert.equal(missingPoliciesModel.treatedExistingCoverageOffset.metadata.reason, "missing-coverage-policies");
assert.ok(
  hasWarningCode(missingPoliciesModel.treatedExistingCoverageOffset.warnings, "missing-coverage-policies"),
  "Missing profile coveragePolicies should be explicit and non-throwing."
);

const emptyPoliciesModel = buildModel(context, {
  profileRecord: {
    coveragePolicies: []
  },
  analysisSettings: createAnalysisSettings()
});
assert.equal(emptyPoliciesModel.existingCoverage.totalExistingCoverage, null);
assert.equal(emptyPoliciesModel.treatedExistingCoverageOffset.totalRawCoverage, 0);
assert.equal(emptyPoliciesModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, 0);
assert.equal(emptyPoliciesModel.treatedExistingCoverageOffset.policyCount, 0);
assert.equal(emptyPoliciesModel.treatedExistingCoverageOffset.metadata.consumedByMethods, false);

console.log("Existing coverage treatment model prep checks passed.");
