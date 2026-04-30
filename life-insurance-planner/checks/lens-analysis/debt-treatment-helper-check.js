#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);
  loadScript(context, "app/features/lens-analysis/debt-treatment-calculations.js");
  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasWarningCode(resultOrWarnings, code) {
  const warnings = Array.isArray(resultOrWarnings)
    ? resultOrWarnings
    : resultOrWarnings?.warnings;
  return Array.isArray(warnings) && warnings.some((warning) => warning?.code === code);
}

function createDebtFact(sourceKey, currentBalance, overrides = {}) {
  const categoryBySource = {
    mortgageBalance: "realEstateSecuredDebt",
    otherRealEstateLoans: "realEstateSecuredDebt",
    autoLoans: "securedConsumerDebt",
    creditCardDebt: "unsecuredConsumerDebt",
    studentLoans: "educationDebt",
    personalLoans: "unsecuredConsumerDebt",
    taxLiabilities: "taxLegalDebt",
    businessDebt: "businessDebt",
    otherLoanObligations: "otherDebt"
  };
  const labelBySource = {
    mortgageBalance: "Primary Residence Mortgage",
    otherRealEstateLoans: "Other Real Estate Loans",
    autoLoans: "Auto Loans",
    creditCardDebt: "Credit Card Debt",
    studentLoans: "Student Loans",
    personalLoans: "Personal Loans",
    taxLiabilities: "Tax Liabilities",
    businessDebt: "Business Debt",
    otherLoanObligations: "Other Debts"
  };

  return {
    debtFactId: `${sourceKey}_fact`,
    categoryKey: categoryBySource[sourceKey] || "otherDebt",
    typeKey: sourceKey,
    label: labelBySource[sourceKey] || sourceKey,
    currentBalance,
    minimumMonthlyPayment: null,
    interestRatePercent: null,
    remainingTermMonths: null,
    securedBy: null,
    sourceKey,
    source: "protectionModeling.data",
    isHousingFieldOwned: sourceKey === "mortgageBalance",
    isScalarCompatibilityDebt: true,
    isRepeatableDebtRecord: false,
    isCustomDebt: false,
    metadata: {
      sourceType: "user-input",
      recordSource: "scalar-compatibility-field"
    },
    ...overrides
  };
}

function createBaseDebtFacts(extraDebts = [], metadata = {}) {
  return {
    debts: [
      createDebtFact("mortgageBalance", 250000),
      createDebtFact("otherRealEstateLoans", 20000),
      createDebtFact("autoLoans", 15000),
      createDebtFact("creditCardDebt", 5000),
      createDebtFact("studentLoans", 40000),
      createDebtFact("personalLoans", 8000),
      createDebtFact("taxLiabilities", 3000),
      createDebtFact("businessDebt", 7000),
      createDebtFact("otherLoanObligations", 2000),
      ...extraDebts
    ],
    totalReportedDebtBalance: 350000,
    metadata: {
      source: "protectionModeling.data",
      manualTotalDebtPayoffOverride: false,
      manualTotalDebtPayoffNeed: null,
      manualOverrideSource: null,
      warnings: [],
      ...metadata
    }
  };
}

function createDebtPayoff(overrides = {}) {
  return {
    mortgageBalance: 250000,
    otherRealEstateLoanBalance: 20000,
    autoLoanBalance: 15000,
    creditCardBalance: 5000,
    studentLoanBalance: 40000,
    personalLoanBalance: 8000,
    outstandingTaxLiabilities: 3000,
    businessDebtBalance: 7000,
    otherDebtPayoffNeeds: 2000,
    totalDebtPayoffNeed: 350000,
    totalDebtPayoffNeedManualOverride: false,
    ...overrides
  };
}

function createRawEquivalentCategoryTreatment(overrides = {}) {
  return {
    include: true,
    mode: "payoff",
    payoffPercent: 100,
    ...overrides
  };
}

function createRawEquivalentDebtCategoryTreatment(overrides = {}) {
  return {
    realEstateSecuredDebt: createRawEquivalentCategoryTreatment(),
    securedConsumerDebt: createRawEquivalentCategoryTreatment(),
    unsecuredConsumerDebt: createRawEquivalentCategoryTreatment(),
    educationDebt: createRawEquivalentCategoryTreatment(),
    medicalDebt: createRawEquivalentCategoryTreatment(),
    taxLegalDebt: createRawEquivalentCategoryTreatment(),
    businessDebt: createRawEquivalentCategoryTreatment(),
    privatePersonalDebt: createRawEquivalentCategoryTreatment(),
    consumerFinanceDebt: createRawEquivalentCategoryTreatment(),
    otherDebt: createRawEquivalentCategoryTreatment(),
    ...overrides
  };
}

function createLegacyNonMortgageTreatment(overrides = {}) {
  return {
    autoLoans: createRawEquivalentCategoryTreatment(),
    creditCardDebt: createRawEquivalentCategoryTreatment(),
    studentLoans: createRawEquivalentCategoryTreatment(),
    personalLoans: createRawEquivalentCategoryTreatment(),
    taxLiabilities: createRawEquivalentCategoryTreatment(),
    businessDebt: createRawEquivalentCategoryTreatment(),
    otherRealEstateLoans: createRawEquivalentCategoryTreatment(),
    otherLoanObligations: createRawEquivalentCategoryTreatment(),
    ...overrides
  };
}

function createRawEquivalentAssumptions(overrides = {}) {
  return {
    enabled: false,
    globalTreatmentProfile: "balanced",
    mortgageTreatment: {
      include: true,
      mode: "payoff",
      payoffPercent: 100,
      paymentSupportYears: null
    },
    debtCategoryTreatment: createRawEquivalentDebtCategoryTreatment(),
    source: "debt-treatment-helper-check",
    ...overrides
  };
}

function createLegacyAssumptions(overrides = {}) {
  return {
    enabled: false,
    globalTreatmentProfile: "balanced",
    mortgageTreatment: {
      include: true,
      mode: "payoff",
      payoffPercent: 100,
      paymentSupportYears: null
    },
    nonMortgageDebtTreatment: createLegacyNonMortgageTreatment(),
    source: "legacy-debt-treatment-helper-check",
    ...overrides
  };
}

function runTreatment(input = {}) {
  return calculateDebtTreatment({
    debtFacts: input.debtFacts || createBaseDebtFacts(),
    debtPayoff: input.debtPayoff || createDebtPayoff(),
    debtTreatmentAssumptions: input.debtTreatmentAssumptions || createRawEquivalentAssumptions(),
    options: input.options || {}
  });
}

function assertNoProtectedDiffs() {
  const protectedFiles = new Set([
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/analysis-setup.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/schema.js",
    "pages/analysis-setup.html",
    "pages/next-step.html",
    "pages/confidential-inputs.html",
    "pages/manual-protection-modeling-inputs.html",
    "components.css",
    "styles.css",
    "app.js"
  ]);
  const status = execFileSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const protectedChanged = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((filePath) => protectedFiles.has(filePath));
  assert.deepEqual(protectedChanged, [], "Protected production files must not change in this helper-only pass.");
}

const context = createContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const calculateDebtTreatment = lensAnalysis.calculateDebtTreatment;

assert.equal(typeof calculateDebtTreatment, "function");
assert.equal(typeof lensAnalysis.normalizeDebtTreatmentAssumptions, "function");
assert.ok(lensAnalysis.RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS);
assert.ok(lensAnalysis.RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment);

const rawEquivalent = runTreatment();
assert.equal(rawEquivalent.source, "debtFacts");
assert.equal(rawEquivalent.fallbackSource, "debtPayoff-compatibility");
assert.equal(rawEquivalent.rawEquivalentDefault, true);
assert.equal(rawEquivalent.treatmentApplied, false);
assert.equal(rawEquivalent.dime.nonMortgageDebtAmount, 100000);
assert.equal(rawEquivalent.dime.mortgageAmount, 250000);
assert.equal(rawEquivalent.needs.debtPayoffAmount, 350000);
assert.equal(rawEquivalent.needs.mortgagePayoffAmount, 250000);
assert.equal(rawEquivalent.needs.nonMortgageDebtAmount, 100000);
assert.equal(rawEquivalent.rawTotals.totalDebtBalance, 350000);

const missingAssumptions = calculateDebtTreatment({
  debtFacts: createBaseDebtFacts(),
  debtPayoff: createDebtPayoff()
});
assert.equal(missingAssumptions.rawEquivalentDefault, true);
assert.equal(missingAssumptions.dime.nonMortgageDebtAmount, 100000);
assert.equal(missingAssumptions.needs.debtPayoffAmount, 350000);
assert.equal(hasWarningCode(missingAssumptions, "missing-debt-treatment-assumptions-defaulted"), true);

const missingBroadBucketResult = runTreatment({
  debtTreatmentAssumptions: createRawEquivalentAssumptions({
    debtCategoryTreatment: {
      securedConsumerDebt: createRawEquivalentCategoryTreatment({ payoffPercent: 50 })
    }
  })
});
assert.equal(missingBroadBucketResult.dime.nonMortgageDebtAmount, 92500);
assert.equal(missingBroadBucketResult.needs.debtPayoffAmount, 342500);
assert.equal(hasWarningCode(missingBroadBucketResult, "missing-debt-category-treatment-defaulted"), true);
assert.ok(missingBroadBucketResult.metadata.defaultedDebtCategoryKeys.includes("unsecuredConsumerDebt"));

const broadWinsOverLegacy = runTreatment({
  debtTreatmentAssumptions: createRawEquivalentAssumptions({
    debtCategoryTreatment: createRawEquivalentDebtCategoryTreatment({
      securedConsumerDebt: createRawEquivalentCategoryTreatment({ payoffPercent: 50 })
    }),
    nonMortgageDebtTreatment: createLegacyNonMortgageTreatment({
      autoLoans: { include: false, mode: "exclude", payoffPercent: 0 }
    })
  })
});
assert.equal(broadWinsOverLegacy.dime.nonMortgageDebtAmount, 92500);
assert.equal(broadWinsOverLegacy.needs.debtPayoffAmount, 342500);
assert.equal(
  broadWinsOverLegacy.metadata.categoryTreatmentSources.securedConsumerDebt,
  "debtCategoryTreatment"
);
assert.equal(hasWarningCode(broadWinsOverLegacy, "legacy-debt-category-treatment-migrated"), false);

const legacyMigrated = runTreatment({
  debtTreatmentAssumptions: createLegacyAssumptions({
    nonMortgageDebtTreatment: createLegacyNonMortgageTreatment({
      autoLoans: { include: true, mode: "payoff", payoffPercent: 50 }
    })
  })
});
assert.equal(legacyMigrated.dime.nonMortgageDebtAmount, 92500);
assert.equal(legacyMigrated.needs.debtPayoffAmount, 342500);
assert.equal(legacyMigrated.metadata.legacyCompatibility.used, true);
assert.ok(legacyMigrated.metadata.legacyCompatibility.migratedCategoryKeys.includes("securedConsumerDebt"));
assert.equal(hasWarningCode(legacyMigrated, "legacy-debt-category-treatment-migrated"), true);

const legacyConflict = runTreatment({
  debtTreatmentAssumptions: createLegacyAssumptions({
    nonMortgageDebtTreatment: createLegacyNonMortgageTreatment({
      creditCardDebt: { include: false, mode: "exclude", payoffPercent: 0 },
      personalLoans: { include: true, mode: "payoff", payoffPercent: 50 }
    })
  })
});
assert.equal(legacyConflict.dime.nonMortgageDebtAmount, 100000);
assert.equal(legacyConflict.needs.debtPayoffAmount, 350000);
assert.ok(legacyConflict.metadata.legacyCompatibility.conflictCategoryKeys.includes("unsecuredConsumerDebt"));
assert.equal(hasWarningCode(legacyConflict, "legacy-debt-category-treatment-conflict-defaulted"), true);

const mortgageSeparateFromRealEstateDebt = runTreatment({
  debtTreatmentAssumptions: createRawEquivalentAssumptions({
    debtCategoryTreatment: createRawEquivalentDebtCategoryTreatment({
      realEstateSecuredDebt: { include: false, mode: "exclude", payoffPercent: 0 }
    })
  })
});
assert.equal(mortgageSeparateFromRealEstateDebt.dime.mortgageAmount, 250000);
assert.equal(mortgageSeparateFromRealEstateDebt.dime.nonMortgageDebtAmount, 80000);
assert.equal(mortgageSeparateFromRealEstateDebt.needs.debtPayoffAmount, 330000);
assert.equal(
  mortgageSeparateFromRealEstateDebt.debts.find((debt) => debt.sourceKey === "mortgageBalance").treatmentKey,
  "mortgage"
);
assert.equal(
  mortgageSeparateFromRealEstateDebt.debts.find((debt) => debt.sourceKey === "otherRealEstateLoans").treatmentKey,
  "realEstateSecuredDebt"
);

const protectedMortgage = createDebtFact("primaryResidenceMortgage", 999999, {
  debtFactId: "protected_primary_mortgage",
  typeKey: "primaryResidenceMortgage",
  sourceKey: "primaryResidenceMortgage",
  isHousingFieldOwned: true
});
const protectedMortgageResult = runTreatment({
  debtFacts: createBaseDebtFacts([protectedMortgage])
});
assert.equal(protectedMortgageResult.dime.mortgageAmount, 250000);
assert.equal(protectedMortgageResult.needs.debtPayoffAmount, 350000);
assert.equal(hasWarningCode(protectedMortgageResult, "protected-mortgage-debt-treatment-record-ignored"), true);

const equityRecord = createDebtFact("primaryResidenceEquity", 500000, {
  debtFactId: "equity_should_not_be_debt",
  categoryKey: "primaryResidenceEquity",
  typeKey: "primaryResidenceEquity",
  sourceKey: "primaryResidenceEquity"
});
const equityResult = runTreatment({
  debtFacts: createBaseDebtFacts([equityRecord])
});
assert.equal(equityResult.needs.debtPayoffAmount, 350000);
assert.equal(hasWarningCode(equityResult, "equity-debt-treatment-record-ignored"), true);

const manualOverrideResult = runTreatment({
  debtFacts: createBaseDebtFacts([], {
    manualTotalDebtPayoffOverride: true,
    manualTotalDebtPayoffNeed: 999999,
    manualOverrideSource: "debtPayoff.totalDebtPayoffNeed"
  }),
  debtPayoff: createDebtPayoff({
    totalDebtPayoffNeed: 999999,
    totalDebtPayoffNeedManualOverride: true
  })
});
assert.equal(manualOverrideResult.metadata.manualTotalDebtPayoffOverride, true);
assert.equal(manualOverrideResult.metadata.manualTotalDebtPayoffNeed, 999999);
assert.equal(manualOverrideResult.needs.debtPayoffAmount, 350000, "manual total should be metadata only when debtFacts are present");

const deferredAssumptions = createRawEquivalentAssumptions({
  enabled: true,
  mortgageTreatment: {
    include: true,
    mode: "support",
    payoffPercent: 100,
    paymentSupportYears: 10
  },
  debtCategoryTreatment: createRawEquivalentDebtCategoryTreatment({
    unsecuredConsumerDebt: { include: true, mode: "custom", payoffPercent: 25 }
  })
});
const deferredResult = runTreatment({ debtTreatmentAssumptions: deferredAssumptions });
assert.equal(deferredResult.rawEquivalentDefault, false);
assert.equal(deferredResult.treatmentApplied, true);
assert.equal(deferredResult.dime.mortgageAmount, 250000);
assert.equal(deferredResult.needs.debtPayoffAmount, 350000);
assert.equal(hasWarningCode(deferredResult, "debt-treatment-mode-deferred"), true);
assert.ok(deferredResult.deferredDebtAmount >= 263000);

const percentAssumptions = createRawEquivalentAssumptions({
  enabled: true,
  mortgageTreatment: {
    include: true,
    mode: "payoff",
    payoffPercent: 80,
    paymentSupportYears: null
  },
  debtCategoryTreatment: createRawEquivalentDebtCategoryTreatment({
    unsecuredConsumerDebt: { include: true, mode: "payoff", payoffPercent: 50 }
  })
});
const percentResult = runTreatment({ debtTreatmentAssumptions: percentAssumptions });
assert.equal(percentResult.rawEquivalentDefault, false);
assert.equal(percentResult.dime.mortgageAmount, 200000);
assert.equal(percentResult.dime.nonMortgageDebtAmount, 93500);
assert.equal(percentResult.needs.debtPayoffAmount, 293500);
assert.equal(percentResult.excludedDebtAmount, 56500);

const invalidAssumptions = createRawEquivalentAssumptions({
  enabled: true,
  debtCategoryTreatment: createRawEquivalentDebtCategoryTreatment({
    securedConsumerDebt: { include: true, mode: "payoff", payoffPercent: 150 },
    unsecuredConsumerDebt: { include: true, mode: "payoff", payoffPercent: -10 },
    educationDebt: { include: true, mode: "payoff", payoffPercent: "not-a-number" }
  })
});
const invalidDebt = createDebtFact("businessDebt", -10, { debtFactId: "negative_business_debt" });
const invalidResult = runTreatment({
  debtFacts: createBaseDebtFacts([invalidDebt]),
  debtTreatmentAssumptions: invalidAssumptions
});
assert.equal(invalidResult.dime.nonMortgageDebtAmount, 87000);
assert.equal(hasWarningCode(invalidResult, "debt-payoff-percent-clamped"), true);
assert.equal(hasWarningCode(invalidResult, "invalid-debt-payoff-percent"), true);
assert.equal(hasWarningCode(invalidResult, "negative-debt-treatment-balance"), true);

const fallbackResult = calculateDebtTreatment({
  debtPayoff: createDebtPayoff(),
  debtTreatmentAssumptions: createRawEquivalentAssumptions()
});
assert.equal(fallbackResult.source, "debtPayoff-compatibility");
assert.equal(fallbackResult.fallbackSource, null);
assert.equal(fallbackResult.needs.debtPayoffAmount, 350000);
assert.equal(fallbackResult.dime.nonMortgageDebtAmount, 100000);

const mutationDebtFacts = createBaseDebtFacts();
const mutationDebtPayoff = createDebtPayoff();
const mutationAssumptions = createRawEquivalentAssumptions();
const mutationSnapshot = {
  debtFacts: cloneJson(mutationDebtFacts),
  debtPayoff: cloneJson(mutationDebtPayoff),
  assumptions: cloneJson(mutationAssumptions)
};
calculateDebtTreatment({
  debtFacts: mutationDebtFacts,
  debtPayoff: mutationDebtPayoff,
  debtTreatmentAssumptions: mutationAssumptions
});
assert.deepEqual(mutationDebtFacts, mutationSnapshot.debtFacts, "helper must not mutate debtFacts");
assert.deepEqual(mutationDebtPayoff, mutationSnapshot.debtPayoff, "helper must not mutate debtPayoff");
assert.deepEqual(mutationAssumptions, mutationSnapshot.assumptions, "helper must not mutate assumptions");

assertNoProtectedDiffs();

console.log("debt-treatment-helper-check passed");
