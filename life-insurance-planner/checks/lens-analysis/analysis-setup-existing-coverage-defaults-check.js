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
    document: {
      addEventListener: () => {}
    },
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {
    analysisSetup: {},
    lensAnalysis: {}
  };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  function loadScript(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  loadScript("app/features/lens-analysis/analysis-setup.js");
  loadScript("app/features/lens-analysis/existing-coverage-treatment-calculations.js");

  return context;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

const context = createContext();
const analysisSetup = context.LensApp.analysisSetup;
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof analysisSetup.getExistingCoverageAssumptions, "function");
assert.equal(typeof lensAnalysis.calculateExistingCoverageTreatment, "function");

const defaultAssumptions = analysisSetup.getExistingCoverageAssumptions({});
assert.equal(defaultAssumptions.globalTreatmentProfile, "balanced");
assert.equal(defaultAssumptions.includeExistingCoverage, true);
assert.deepEqual(toPlainObject(defaultAssumptions.groupCoverageTreatment), {
  include: true,
  reliabilityDiscountPercent: 0,
  portabilityRequired: false
});
assert.deepEqual(toPlainObject(defaultAssumptions.individualTermTreatment), {
  include: true,
  reliabilityDiscountPercent: 0,
  excludeIfExpiresWithinYears: null
});
assert.deepEqual(toPlainObject(defaultAssumptions.permanentCoverageTreatment), {
  include: true,
  reliabilityDiscountPercent: 0
});
assert.deepEqual(toPlainObject(defaultAssumptions.pendingCoverageTreatment), {
  include: true,
  reliabilityDiscountPercent: 0
});
assert.deepEqual(toPlainObject(defaultAssumptions.unknownCoverageTreatment), {
  include: true,
  reliabilityDiscountPercent: 0
});

const balancedAssumptions = analysisSetup.getExistingCoverageAssumptions({
  analysisSettings: {
    existingCoverageAssumptions: {
      globalTreatmentProfile: "balanced"
    }
  }
});
assert.deepEqual(
  toPlainObject(balancedAssumptions),
  toPlainObject(defaultAssumptions),
  "Balanced profile should remain the raw-equivalent default."
);

const conservativeAssumptions = analysisSetup.getExistingCoverageAssumptions({
  analysisSettings: {
    existingCoverageAssumptions: {
      globalTreatmentProfile: "conservative"
    }
  }
});
assert.equal(conservativeAssumptions.groupCoverageTreatment.reliabilityDiscountPercent, 50);
assert.equal(conservativeAssumptions.pendingCoverageTreatment.include, false);
assert.equal(conservativeAssumptions.pendingCoverageTreatment.reliabilityDiscountPercent, 100);
assert.equal(conservativeAssumptions.unknownCoverageTreatment.reliabilityDiscountPercent, 25);

const aggressiveAssumptions = analysisSetup.getExistingCoverageAssumptions({
  analysisSettings: {
    existingCoverageAssumptions: {
      globalTreatmentProfile: "aggressive"
    }
  }
});
assert.equal(aggressiveAssumptions.groupCoverageTreatment.reliabilityDiscountPercent, 0);
assert.equal(aggressiveAssumptions.pendingCoverageTreatment.include, true);
assert.equal(aggressiveAssumptions.pendingCoverageTreatment.reliabilityDiscountPercent, 50);
assert.equal(aggressiveAssumptions.unknownCoverageTreatment.reliabilityDiscountPercent, 0);

const coveragePolicies = [
  {
    id: "default-group",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    effectiveDate: "2020-01-01",
    faceAmount: "100000"
  },
  {
    id: "default-term",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    effectiveDate: "2020-01-01",
    faceAmount: "200000"
  },
  {
    id: "default-permanent",
    coverageSource: "individual",
    policyType: "Whole Life",
    effectiveDate: "2020-01-01",
    faceAmount: "300000"
  },
  {
    id: "default-pending",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    effectiveDate: "2026-06-01",
    faceAmount: "50000"
  },
  {
    id: "default-unknown",
    entryMode: "simple",
    effectiveDate: "2020-01-01",
    faceAmount: "40000"
  }
];

const treatment = lensAnalysis.calculateExistingCoverageTreatment({
  coveragePolicies,
  existingCoverageAssumptions: defaultAssumptions,
  options: {
    valuationDate: "2026-01-01",
    source: "analysis-setup-existing-coverage-defaults-check",
    consumedByMethods: false
  }
});

assert.equal(treatment.totalRawCoverage, 690000);
assert.equal(treatment.totalIncludedRawCoverage, 690000);
assert.equal(treatment.totalTreatedCoverageOffset, 690000);
assert.equal(treatment.excludedCoverageValue, 0);
assert.equal(treatment.policies.length, 5);
assert.equal(treatment.policies.filter((policy) => policy.included).length, 5);
assert.equal(treatment.policies.filter((policy) => !policy.included).length, 0);
assert.equal(
  treatment.policies.every((policy) => policy.included && policy.rawAmount === policy.treatedAmount),
  true,
  "Default Analysis Setup assumptions should not discount or exclude valid linked coverage."
);

console.log("Analysis Setup existing coverage default checks passed.");
