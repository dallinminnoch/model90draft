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
      effectiveDate: "2020-01-01",
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
    valuationDate: "2026-01-01",
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
      valuationDate: "2030-01-01",
      asOfDate: "2031-01-01",
      lastUpdatedAt: "2025-01-01T00:00:00.000Z"
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

function findPolicyResult(model, policyId) {
  return model.treatedExistingCoverageOffset.policies.find((policy) => {
    return policy.policyId === policyId;
  });
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.calculateExistingCoverageTreatment, "function");
assert.equal(lensAnalysis.analysisMethods, undefined, "Model-prep check should not load analysis methods.");

const coveragePolicies = createCoveragePolicies();
const originalPolicies = cloneJson(coveragePolicies);
const analysisSettings = createAnalysisSettings();
const originalAnalysisSettings = cloneJson(analysisSettings);
const model = buildModel(context, {
  analysisSettings,
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
assert.equal(treatedExistingCoverageOffset.metadata.methodOffsetSourcePath, "treatedExistingCoverageOffset.totalTreatedCoverageOffset");
assert.equal(treatedExistingCoverageOffset.metadata.consumedByMethods, true);
assert.equal(treatedExistingCoverageOffset.metadata.valuationDate, "2026-01-01");
assert.equal(treatedExistingCoverageOffset.metadata.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(treatedExistingCoverageOffset.metadata.valuationDateDefaulted, false);
assert.equal(treatedExistingCoverageOffset.metadata.valuationDateWarningCode, null);
assert.equal(
  treatedExistingCoverageOffset.metadata.valuationDateSource,
  "analysisSettings.valuationDate",
  "Shared analysisSettings.valuationDate should win over deprecated existing coverage date fields."
);
assert.ok(
  !hasWarningCode(treatedExistingCoverageOffset.warnings, "deprecated-existing-coverage-valuation-date-fallback"),
  "Deprecated existing coverage date fields should not warn when shared valuationDate is available."
);
assert.ok(
  !hasWarningCode(treatedExistingCoverageOffset.warnings, "ignored-existing-coverage-last-updated-at-valuation-date"),
  "lastUpdatedAt should not participate when shared valuationDate is available."
);
assert.deepEqual(coveragePolicies, originalPolicies, "Model prep must not mutate input coverage policies.");
assert.deepEqual(analysisSettings, originalAnalysisSettings, "Model prep must not mutate input analysis settings.");

const sharedDatePendingModel = buildModel(context, {
  analysisSettings: {
    valuationDate: "2026-01-01",
    existingCoverageAssumptions: {
      valuationDate: "2030-01-01",
      pendingCoverageTreatment: {
        include: false,
        reliabilityDiscountPercent: 0
      }
    }
  },
  profileRecord: {
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
        id: "future-term",
        coverageSource: "individual",
        policyType: "Term Life",
        termLength: "20",
        effectiveDate: "2027-01-01",
        faceAmount: "50000"
      }
    ]
  }
});
assert.equal(sharedDatePendingModel.treatedExistingCoverageOffset.metadata.valuationDate, "2026-01-01");
assert.equal(sharedDatePendingModel.treatedExistingCoverageOffset.metadata.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(sharedDatePendingModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, 200000);
assert.equal(findPolicyResult(sharedDatePendingModel, "future-term").treatmentKind, "pending");
assert.equal(findPolicyResult(sharedDatePendingModel, "future-term").included, false);
assert.equal(findPolicyResult(sharedDatePendingModel, "future-term").exclusionReason, "pending-excluded-by-assumption");

const sharedDateTermGuardrailModel = buildModel(context, {
  analysisSettings: {
    valuationDate: "2026-01-01",
    existingCoverageAssumptions: {
      asOfDate: "2022-01-01",
      individualTermTreatment: {
        include: true,
        reliabilityDiscountPercent: 0,
        excludeIfExpiresWithinYears: 5
      }
    }
  },
  profileRecord: {
    coveragePolicies: [
      {
        id: "guardrail-term",
        coverageSource: "individual",
        policyType: "Term Life",
        termLength: "10",
        effectiveDate: "2020-01-01",
        faceAmount: "100000"
      }
    ]
  }
});
assert.equal(sharedDateTermGuardrailModel.treatedExistingCoverageOffset.metadata.valuationDate, "2026-01-01");
assert.equal(sharedDateTermGuardrailModel.treatedExistingCoverageOffset.metadata.valuationDateSource, "analysisSettings.valuationDate");
assert.equal(sharedDateTermGuardrailModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset, 0);
assert.equal(findPolicyResult(sharedDateTermGuardrailModel, "guardrail-term").exclusionReason, "term-expiring-within-guardrail");

const deprecatedFallbackModel = buildModel(context, {
  analysisSettings: {
    existingCoverageAssumptions: {
      valuationDate: "2026-01-01",
      lastUpdatedAt: "2025-01-01T00:00:00.000Z"
    }
  }
});
assert.equal(deprecatedFallbackModel.treatedExistingCoverageOffset.metadata.valuationDate, "2026-01-01");
assert.equal(
  deprecatedFallbackModel.treatedExistingCoverageOffset.metadata.valuationDateSource,
  "analysisSettings.existingCoverageAssumptions.valuationDate"
);
assert.equal(
  deprecatedFallbackModel.treatedExistingCoverageOffset.metadata.valuationDateWarningCode,
  "deprecated-existing-coverage-valuation-date-fallback"
);
assert.ok(
  hasWarningCode(deprecatedFallbackModel.treatedExistingCoverageOffset.warnings, "deprecated-existing-coverage-valuation-date-fallback"),
  "Deprecated existing coverage valuationDate fallback should be explicit."
);

const invalidSharedDateModel = buildModel(context, {
  analysisSettings: {
    valuationDate: "2026-99-99",
    existingCoverageAssumptions: {
      lastUpdatedAt: "2026-01-01T00:00:00.000Z"
    }
  }
});
assert.equal(invalidSharedDateModel.treatedExistingCoverageOffset.metadata.valuationDate, null);
assert.equal(invalidSharedDateModel.treatedExistingCoverageOffset.metadata.valuationDateSource, "unavailable");
assert.equal(
  invalidSharedDateModel.treatedExistingCoverageOffset.metadata.valuationDateWarningCode,
  "invalid-existing-coverage-valuation-date"
);
assert.ok(
  hasWarningCode(invalidSharedDateModel.treatedExistingCoverageOffset.warnings, "invalid-existing-coverage-valuation-date"),
  "Invalid shared valuationDate should be explicit."
);
assert.ok(
  hasWarningCode(invalidSharedDateModel.treatedExistingCoverageOffset.warnings, "ignored-existing-coverage-last-updated-at-valuation-date"),
  "lastUpdatedAt should be explicitly ignored instead of used as planning intent."
);
assert.notEqual(invalidSharedDateModel.treatedExistingCoverageOffset.metadata.valuationDate, "2026-99-99");
assert.notEqual(
  invalidSharedDateModel.treatedExistingCoverageOffset.metadata.valuationDateSource,
  "analysisSettings.existingCoverageAssumptions.lastUpdatedAt"
);

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
assert.equal(emptyPoliciesModel.treatedExistingCoverageOffset.metadata.consumedByMethods, true);

console.log("Existing coverage treatment model prep checks passed.");
