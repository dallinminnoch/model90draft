#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

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
  "app/features/lens-analysis/existing-coverage-treatment-calculations.js"
].forEach(loadScript);

const lensAnalysis = context.LensApp.lensAnalysis;
const calculateTreatment = lensAnalysis.calculateExistingCoverageTreatment;

assert.equal(typeof calculateTreatment, "function");
assert.equal(typeof lensAnalysis.normalizeExistingCoverageTreatmentAssumptions, "function");

function runTreatment(coveragePolicies, existingCoverageAssumptions, options = {}) {
  return calculateTreatment({
    coveragePolicies,
    existingCoverageAssumptions,
    options: {
      valuationDate: "2026-01-01",
      source: "existing-coverage-treatment-helper-check",
      consumedByMethods: false,
      ...options
    }
  });
}

function hasWarningCode(resultOrWarnings, code) {
  const warnings = Array.isArray(resultOrWarnings)
    ? resultOrWarnings
    : resultOrWarnings?.warnings;
  return Array.isArray(warnings) && warnings.some((warning) => warning?.code === code);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoMutation(policies, assumptions) {
  const originalPolicies = cloneJson(policies);
  const originalAssumptions = cloneJson(assumptions);
  runTreatment(policies, assumptions);
  assert.deepEqual(policies, originalPolicies, "Helper must not mutate input policies.");
  assert.deepEqual(assumptions, originalAssumptions, "Helper must not mutate input assumptions.");
}

const rawEquivalentPolicies = [
  {
    id: "group-default",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    faceAmount: "100000"
  },
  {
    id: "term-default",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    effectiveDate: "2020-01-01",
    faceAmount: "200000"
  },
  {
    id: "permanent-default",
    policyType: "Whole Life",
    faceAmount: "300000"
  },
  {
    id: "unknown-default",
    entryMode: "simple",
    faceAmount: "40000"
  }
];

const rawEquivalent = runTreatment(rawEquivalentPolicies);
assert.equal(rawEquivalent.totalRawCoverage, 640000);
assert.equal(rawEquivalent.totalIncludedRawCoverage, 640000);
assert.equal(rawEquivalent.totalTreatedCoverageOffset, 640000);
assert.equal(rawEquivalent.excludedCoverageValue, 0);
assert.equal(rawEquivalent.policies.every((policy) => policy.included), true);
assert.equal(rawEquivalent.metadata.consumedByMethods, false);

const groupDiscount = runTreatment([
  {
    id: "group-discount",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    faceAmount: "100000"
  }
], {
  groupCoverageTreatment: {
    include: true,
    reliabilityDiscountPercent: 25
  }
});
assert.equal(groupDiscount.policies[0].treatmentKind, "group");
assert.equal(groupDiscount.totalTreatedCoverageOffset, 75000);
assert.equal(groupDiscount.totalsByTreatmentKind.group.treatedAmount, 75000);

const groupExcluded = runTreatment([
  {
    id: "group-excluded",
    coverageSource: "groupEmployer",
    policyType: "Group Life",
    faceAmount: "100000"
  }
], {
  groupCoverageTreatment: {
    include: false,
    reliabilityDiscountPercent: 0
  }
});
assert.equal(groupExcluded.totalTreatedCoverageOffset, 0);
assert.equal(groupExcluded.excludedCoverageValue, 100000);
assert.equal(groupExcluded.policies[0].exclusionReason, "group-excluded-by-assumption");

const termDiscount = runTreatment([
  {
    id: "term-discount",
    coverageSource: "individual",
    policyType: "Term",
    termLength: "20",
    effectiveDate: "2020-01-01",
    faceAmount: "200000"
  }
], {
  individualTermTreatment: {
    include: true,
    reliabilityDiscountPercent: 10,
    excludeIfExpiresWithinYears: null
  }
});
assert.equal(termDiscount.policies[0].treatmentKind, "term");
assert.equal(termDiscount.totalTreatedCoverageOffset, 180000);

const termExcluded = runTreatment([
  {
    id: "term-excluded",
    coverageSource: "individual",
    policyType: "Term",
    termLength: "20",
    effectiveDate: "2020-01-01",
    faceAmount: "200000"
  }
], {
  individualTermTreatment: {
    include: false,
    reliabilityDiscountPercent: 0,
    excludeIfExpiresWithinYears: null
  }
});
assert.equal(termExcluded.totalTreatedCoverageOffset, 0);
assert.equal(termExcluded.policies[0].exclusionReason, "term-excluded-by-assumption");

const permanentDiscount = runTreatment([
  {
    id: "permanent-discount",
    policyType: "Whole Life",
    termLength: "Permanent Coverage",
    faceAmount: "150000"
  }
], {
  permanentCoverageTreatment: {
    include: true,
    reliabilityDiscountPercent: 20
  }
});
assert.equal(permanentDiscount.policies[0].treatmentKind, "permanent");
assert.equal(permanentDiscount.totalTreatedCoverageOffset, 120000);

const permanentExcluded = runTreatment([
  {
    id: "permanent-excluded",
    policyType: "Universal Life",
    faceAmount: "150000"
  }
], {
  permanentCoverageTreatment: {
    include: false,
    reliabilityDiscountPercent: 0
  }
});
assert.equal(permanentExcluded.totalTreatedCoverageOffset, 0);
assert.equal(permanentExcluded.policies[0].exclusionReason, "permanent-excluded-by-assumption");

const unknownDiscount = runTreatment([
  {
    id: "unknown-discount",
    entryMode: "simple",
    faceAmount: "30000"
  }
], {
  unknownCoverageTreatment: {
    include: true,
    reliabilityDiscountPercent: 50
  }
});
assert.equal(unknownDiscount.policies[0].classification, "unclassified");
assert.equal(unknownDiscount.policies[0].treatmentKind, "unknown");
assert.equal(unknownDiscount.totalTreatedCoverageOffset, 15000);

const pendingDetection = runTreatment([
  {
    id: "pending-status",
    coverageSource: "individual",
    policyType: "Term Life",
    status: "Pending underwriting",
    termLength: "20",
    effectiveDate: "2025-01-01",
    faceAmount: "40000"
  }
], {
  pendingCoverageTreatment: {
    include: true,
    reliabilityDiscountPercent: 50
  }
});
assert.equal(pendingDetection.policies[0].treatmentKind, "pending");
assert.equal(pendingDetection.totalTreatedCoverageOffset, 20000);
assert.ok(
  hasWarningCode(pendingDetection, "pending-coverage-detected-from-status"),
  "Pending detection should warn because current data is weak."
);

const pendingExcluded = runTreatment([
  {
    id: "pending-excluded",
    policyType: "Term Life",
    status: "Application submitted",
    faceAmount: "40000"
  }
], {
  pendingCoverageTreatment: {
    include: false,
    reliabilityDiscountPercent: 0
  }
});
assert.equal(pendingExcluded.totalTreatedCoverageOffset, 0);
assert.equal(pendingExcluded.policies[0].exclusionReason, "pending-excluded-by-assumption");

const termGuardrail = runTreatment([
  {
    id: "term-guardrail",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    effectiveDate: "2020-01-01",
    faceAmount: "50000"
  }
], {
  individualTermTreatment: {
    include: true,
    reliabilityDiscountPercent: 0,
    excludeIfExpiresWithinYears: 2
  }
}, {
  valuationDate: "2039-01-01"
});
assert.equal(termGuardrail.totalTreatedCoverageOffset, 0);
assert.equal(termGuardrail.policies[0].exclusionReason, "term-expiring-within-guardrail");
assert.equal(termGuardrail.metadata.valuationDate, "2039-01-01");

const missingEffectiveDate = runTreatment([
  {
    id: "term-missing-effective-date",
    coverageSource: "individual",
    policyType: "Term Life",
    termLength: "20",
    faceAmount: "50000"
  }
], {
  individualTermTreatment: {
    include: true,
    reliabilityDiscountPercent: 0,
    excludeIfExpiresWithinYears: 5
  }
});
assert.equal(missingEffectiveDate.totalTreatedCoverageOffset, 50000);
assert.ok(hasWarningCode(missingEffectiveDate, "missing-effective-date"));

const missingTermLength = runTreatment([
  {
    id: "term-missing-length",
    coverageSource: "individual",
    policyType: "Term Life",
    effectiveDate: "2020-01-01",
    faceAmount: "50000"
  }
], {
  individualTermTreatment: {
    include: true,
    reliabilityDiscountPercent: 0,
    excludeIfExpiresWithinYears: 5
  }
});
assert.equal(missingTermLength.totalTreatedCoverageOffset, 50000);
assert.ok(hasWarningCode(missingTermLength, "missing-term-length"));

const noPolicies = runTreatment([]);
assert.equal(noPolicies.policies.length, 0);
assert.equal(noPolicies.totalRawCoverage, 0);
assert.equal(noPolicies.totalTreatedCoverageOffset, 0);
assert.equal(noPolicies.warnings.length, 0);

const formattedPositiveAmounts = runTreatment([
  {
    id: "currency-positive",
    policyType: "Term Life",
    faceAmount: "$1,000"
  },
  {
    id: "comma-positive",
    policyType: "Term Life",
    faceAmount: "1,000"
  }
]);
assert.equal(formattedPositiveAmounts.totalRawCoverage, 2000);
assert.equal(formattedPositiveAmounts.totalTreatedCoverageOffset, 2000);
assert.equal(formattedPositiveAmounts.policies.every((policy) => policy.included), true);

const invalidAmounts = runTreatment([
  {
    id: "negative-amount",
    policyType: "Term Life",
    faceAmount: -1000
  },
  {
    id: "negative-currency-amount",
    policyType: "Term Life",
    faceAmount: "$-1,000"
  },
  {
    id: "negative-currency-prefix-amount",
    policyType: "Term Life",
    faceAmount: "-$1,000"
  },
  {
    id: "negative-accounting-amount",
    policyType: "Term Life",
    faceAmount: "($1,000)"
  },
  {
    id: "non-numeric-amount",
    policyType: "Whole Life",
    faceAmount: "not a number"
  },
  {
    id: "missing-amount",
    policyType: "Group Life"
  }
]);
assert.equal(invalidAmounts.totalRawCoverage, 0);
assert.equal(invalidAmounts.totalTreatedCoverageOffset, 0);
assert.ok(hasWarningCode(invalidAmounts, "negative-face-amount"));
assert.ok(hasWarningCode(invalidAmounts, "invalid-face-amount"));
assert.ok(hasWarningCode(invalidAmounts, "missing-face-amount"));
assert.equal(invalidAmounts.policies.every((policy) => policy.included === false), true);
["negative-currency-amount", "negative-currency-prefix-amount", "negative-accounting-amount"].forEach((policyId) => {
  const policy = invalidAmounts.policies.find((entry) => entry.policyId === policyId);
  assert.equal(policy.rawAmount, 0);
  assert.equal(policy.exclusionReason, "negative-face-amount");
});

const globalDisabled = runTreatment([
  {
    id: "global-disabled",
    policyType: "Whole Life",
    faceAmount: "100000"
  }
], {
  includeExistingCoverage: false
});
assert.equal(globalDisabled.totalRawCoverage, 100000);
assert.equal(globalDisabled.totalTreatedCoverageOffset, 0);
assert.equal(globalDisabled.policies[0].exclusionReason, "existing-coverage-disabled");

assertNoMutation(
  [
    {
      id: "mutation-check",
      coverageSource: "groupEmployer",
      policyType: "Group Life",
      faceAmount: "100000",
      documents: [{ name: "policy.pdf", size: 1000 }]
    }
  ],
  {
    groupCoverageTreatment: {
      include: true,
      reliabilityDiscountPercent: 25
    }
  }
);

console.log("Existing coverage treatment helper checks passed.");
