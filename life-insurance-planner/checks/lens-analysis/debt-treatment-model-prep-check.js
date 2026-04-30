#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const BROAD_DEBT_CATEGORY_KEYS = [
  "realEstateSecuredDebt",
  "securedConsumerDebt",
  "unsecuredConsumerDebt",
  "educationDebt",
  "medicalDebt",
  "taxLegalDebt",
  "businessDebt",
  "privatePersonalDebt",
  "consumerFinanceDebt",
  "otherDebt"
];

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext(options = {}) {
  const includeDebtTreatmentHelper = options.includeDebtTreatmentHelper !== false;
  const includeMethods = options.includeMethods === true;
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {}, coverage: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/coverage/coverage-policy-utils.js",
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/debt-taxonomy.js",
    "app/features/lens-analysis/debt-library.js",
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
    ...(includeDebtTreatmentHelper
      ? ["app/features/lens-analysis/debt-treatment-calculations.js"]
      : []),
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    ...(includeMethods
      ? ["app/features/lens-analysis/analysis-methods.js"]
      : [])
  ].forEach((relativePath) => loadScript(context, relativePath));

  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRawEquivalentCategoryTreatment(overrides = {}) {
  return {
    include: true,
    mode: "payoff",
    payoffPercent: 100,
    ...overrides
  };
}

function createDebtCategoryTreatment(overrides = {}) {
  return BROAD_DEBT_CATEGORY_KEYS.reduce((treatment, categoryKey) => {
    treatment[categoryKey] = createRawEquivalentCategoryTreatment(overrides[categoryKey] || {});
    return treatment;
  }, {});
}

function createSourceData(overrides = {}) {
  return {
    annualGrossIncome: 120000,
    annualNetIncome: 90000,
    monthlyHousingCost: 2500,
    monthlyNonHousingEssentialExpenses: 3500,
    mortgageBalance: 250000,
    otherRealEstateLoans: 20000,
    autoLoans: 15000,
    creditCardDebt: 5000,
    studentLoans: 40000,
    personalLoans: 8000,
    taxLiabilities: 3000,
    businessDebt: 7000,
    otherLoanObligations: 2000,
    totalDebtPayoffNeed: 350000,
    totalDebtPayoffNeedManualOverride: false,
    debtRecords: [
      {
        debtId: "medical-record",
        categoryKey: "medicalDebt",
        typeKey: "medicalPaymentPlan",
        label: "Medical Payment Plan",
        currentBalance: 4000,
        minimumMonthlyPayment: 200,
        interestRatePercent: 0,
        remainingTermMonths: 20,
        sourceKey: "medicalPaymentPlan",
        isCustomDebt: false,
        metadata: {
          sourceType: "user-input",
          source: "debt-library",
          libraryEntryKey: "medicalPaymentPlan"
        }
      }
    ],
    ...overrides
  };
}

function createAnalysisSettings(overrides = {}) {
  return {
    valuationDate: "2026-04-29",
    debtTreatmentAssumptions: {
      schemaVersion: 2,
      enabled: false,
      globalTreatmentProfile: "balanced",
      mortgageTreatment: {
        include: true,
        mode: "payoff",
        payoffPercent: 100,
        paymentSupportYears: null
      },
      debtCategoryTreatment: createDebtCategoryTreatment(),
      source: "debt-treatment-model-prep-check"
    },
    ...overrides
  };
}

function createProfileRecord(analysisSettings = createAnalysisSettings()) {
  return {
    id: "debt-treatment-model-prep-profile",
    caseRef: "CL/99010",
    displayName: "Debt Treatment Model Prep",
    analysisSettings,
    coveragePolicies: []
  };
}

function buildModel(context, options = {}) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const sourceData = options.sourceData || createSourceData();
  const analysisSettings = options.analysisSettings || createAnalysisSettings();
  const profileRecord = options.profileRecord || createProfileRecord(analysisSettings);
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord
  });

  assert.ok(result.lensModel, "Lens model should build.");
  return result;
}

function hasWarningCode(warnings, code) {
  return Array.isArray(warnings) && warnings.some((warning) => warning?.code === code);
}

function findTrace(result, key) {
  return Array.isArray(result?.trace)
    ? result.trace.find((entry) => entry?.key === key)
    : null;
}

function assertNoProtectedDiffs() {
  const allowedDiffs = new Set([
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "pages/analysis-estimate.html",
    "checks/lens-analysis/debt-treatment-model-prep-check.js",
    "checks/lens-analysis/debt-treatment-method-trace-readiness-check.js",
    "checks/lens-analysis/step-three-debt-treatment-display-check.js"
  ]);
  const changedFiles = execFileSync("git", ["diff", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim().split(/\r?\n/).filter(Boolean).map((filePath) => {
    return filePath.replace(/^life-insurance-planner\//, "");
  });
  const protectedDiffs = changedFiles.filter((filePath) => !allowedDiffs.has(filePath));

  assert.deepEqual(protectedDiffs, [], "Only model-builder prep and analysis-estimate load order should have production diffs.");
}

function assertAnalysisEstimateLoadOrder() {
  const html = readRepoFile("pages/analysis-estimate.html");
  const debtHelperIndex = html.indexOf("debt-treatment-calculations.js");
  const modelBuilderIndex = html.indexOf("lens-model-builder.js");

  assert.ok(debtHelperIndex >= 0, "analysis-estimate.html should load debt-treatment-calculations.js.");
  assert.ok(modelBuilderIndex >= 0, "analysis-estimate.html should load lens-model-builder.js.");
  assert.ok(debtHelperIndex < modelBuilderIndex, "Debt treatment helper should load before lens-model-builder.js.");
  assert.equal(html.includes("pmi-debt-records.js"), false, "analysis-estimate.html should not mount PMI debt records.");
}

const context = createContext({ includeMethods: true });
const lensAnalysis = context.LensApp.lensAnalysis;

assert.equal(typeof lensAnalysis.buildLensModelFromSavedProtectionModeling, "function");
assert.equal(typeof lensAnalysis.calculateDebtTreatment, "function");
assertAnalysisEstimateLoadOrder();
assertNoProtectedDiffs();

const sourceData = createSourceData();
const sourceDataBefore = cloneJson(sourceData);
const analysisSettings = createAnalysisSettings();
const analysisSettingsBefore = cloneJson(analysisSettings);
const profileRecord = createProfileRecord(analysisSettings);
const profileRecordBefore = cloneJson(profileRecord);
const result = buildModel(context, { sourceData, analysisSettings, profileRecord });
const model = result.lensModel;
const treatedDebtPayoff = model.treatedDebtPayoff;

assert.deepEqual(sourceData, sourceDataBefore, "Model builder must not mutate source data.");
assert.deepEqual(analysisSettings, analysisSettingsBefore, "Model builder must not mutate analysis settings.");
assert.deepEqual(profileRecord, profileRecordBefore, "Model builder must not mutate profile record.");
assert.ok(treatedDebtPayoff, "treatedDebtPayoff should be prepared.");
assert.equal(model.debtPayoff.totalDebtPayoffNeed, 350000, "Raw debtPayoff total should stay unchanged.");
assert.equal(model.debtPayoff.mortgageBalance, 250000, "Raw mortgage balance should stay unchanged.");
assert.equal(treatedDebtPayoff.rawEquivalentDefault, true, "Default broad debt assumptions should be raw-equivalent.");
assert.equal(treatedDebtPayoff.treatmentApplied, false, "enabled:false should not apply treatment or zero debt.");
assert.equal(treatedDebtPayoff.metadata.consumedByMethods, true, "treatedDebtPayoff should report partial method consumption.");
assert.deepEqual(cloneJson(treatedDebtPayoff.metadata.consumedByMethodNames), ["dime", "needs"]);
assert.deepEqual(cloneJson(treatedDebtPayoff.metadata.methodConsumption), {
  dime: true,
  needs: true,
  hlv: false
});
assert.deepEqual(cloneJson(treatedDebtPayoff.metadata.currentMethodSourcePaths), {
  dimeDebt: "treatedDebtPayoff.dime.nonMortgageDebtAmount",
  dimeMortgage: "treatedDebtPayoff.dime.mortgageAmount",
  needsDebtPayoff: "treatedDebtPayoff.needs.debtPayoffAmount"
});
assert.equal(treatedDebtPayoff.metadata.methodDebtSourcePath, "partial-method-consumption");
assert.equal(treatedDebtPayoff.metadata.dimeDebtSourcePath, "treatedDebtPayoff.dime.nonMortgageDebtAmount");
assert.equal(treatedDebtPayoff.metadata.dimeMortgageSourcePath, "treatedDebtPayoff.dime.mortgageAmount");
assert.equal(treatedDebtPayoff.metadata.needsDebtSourcePath, "treatedDebtPayoff.needs.debtPayoffAmount");
assert.equal(treatedDebtPayoff.source, "debtFacts");
assert.equal(treatedDebtPayoff.metadata.source, "debtFacts");
assert.equal(treatedDebtPayoff.metadata.fallbackSource, "debtPayoff-compatibility");
assert.equal(treatedDebtPayoff.metadata.assumptionsSource, "debt-treatment-model-prep-check");
assert.equal(treatedDebtPayoff.dime.mortgageAmount, 250000, "Prepared DIME mortgage should stay separate.");
assert.equal(treatedDebtPayoff.dime.nonMortgageDebtAmount, 104000, "Prepared non-mortgage debt should include broad debtFacts without double-counting mortgage.");
assert.equal(treatedDebtPayoff.needs.debtPayoffAmount, 354000, "Prepared Needs debt payoff should include debtFacts in readiness output only.");
assert.ok(
  treatedDebtPayoff.debts.some((debt) => debt.treatmentKey === "medicalDebt"),
  "Broad debtCategoryTreatment keys should pass through to helper treatment."
);
assert.ok(
  treatedDebtPayoff.debts.some((debt) => debt.isMortgage === true && debt.treatmentKey === "mortgage"),
  "Primary mortgage should be prepared through mortgageTreatment."
);
assert.ok(
  !treatedDebtPayoff.debts.some((debt) => debt.isMortgage === true && debt.treatmentKey === "realEstateSecuredDebt"),
  "Primary mortgage should not route through realEstateSecuredDebt."
);

const excludedTreatmentSettings = createAnalysisSettings({
  debtTreatmentAssumptions: {
    schemaVersion: 2,
    enabled: true,
    globalTreatmentProfile: "custom",
    mortgageTreatment: {
      include: false,
      mode: "payoff",
      payoffPercent: 0,
      paymentSupportYears: null
    },
    debtCategoryTreatment: createDebtCategoryTreatment(
      Object.fromEntries(BROAD_DEBT_CATEGORY_KEYS.map((categoryKey) => [
        categoryKey,
        { include: false, mode: "exclude", payoffPercent: 0 }
      ]))
    ),
    source: "debt-treatment-model-prep-check-excluded"
  }
});
const excludedModel = buildModel(context, {
  sourceData: createSourceData(),
  analysisSettings: excludedTreatmentSettings,
  profileRecord: createProfileRecord(excludedTreatmentSettings)
}).lensModel;

assert.equal(excludedModel.treatedDebtPayoff.needs.debtPayoffAmount, 0, "Prepared treatment can differ from raw debtPayoff.");
assert.equal(excludedModel.treatedDebtPayoff.dime.nonMortgageDebtAmount, 0, "Prepared DIME debt can differ from raw debtPayoff.");
assert.equal(excludedModel.treatedDebtPayoff.dime.mortgageAmount, 0, "Prepared DIME mortgage can differ from raw debtPayoff.");
assert.equal(excludedModel.debtPayoff.totalDebtPayoffNeed, 350000, "Raw debtPayoff should remain unchanged for fallback/reference.");

const methodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
assert.equal(methodsSource.includes("treatedDebtPayoff"), true, "Methods may reference treatedDebtPayoff for trace readiness only.");
const methodResults = lensAnalysis.analysisMethods.runAnalysisMethods(excludedModel, {
  includeExistingCoverageOffset: false,
  includeOffsetAssets: false,
  includeEducationFunding: false,
  includeProjectedDependents: false,
  includeSurvivorIncomeOffset: false,
  includeEssentialSupport: true,
  includeTransitionNeeds: false,
  includeDiscretionarySupport: false
});
assert.equal(methodResults.dime.components.mortgage, 0, "DIME should use treated mortgage when available.");
assert.equal(methodResults.dime.components.debt, 0, "DIME should use treated non-mortgage debt when available.");
assert.equal(methodResults.needsAnalysis.components.debtPayoff, 0, "Needs should use prepared treated debt payoff when available.");
assert.equal(methodResults.humanLifeValue.assumptions.survivorIncomeApplied, false, "HLV should remain unaffected by debt treatment prep.");
assert.equal(findTrace(methodResults.dime, "debt").inputs.treatedDebtConsumedByMethods, true);
assert.equal(findTrace(methodResults.dime, "mortgage").inputs.treatedDebtConsumedByMethods, true);
assert.equal(
  findTrace(methodResults.dime, "debt").inputs.currentMethodDebtSourcePath,
  "treatedDebtPayoff.dime.nonMortgageDebtAmount"
);
assert.equal(
  findTrace(methodResults.dime, "mortgage").inputs.currentMethodDebtSourcePath,
  "treatedDebtPayoff.dime.mortgageAmount"
);
assert.equal(findTrace(methodResults.needsAnalysis, "debtPayoff").inputs.treatedDebtConsumedByMethods, true);
assert.equal(
  findTrace(methodResults.needsAnalysis, "debtPayoff").inputs.currentMethodDebtSourcePath,
  "treatedDebtPayoff.needs.debtPayoffAmount"
);

const noHelperContext = createContext({ includeDebtTreatmentHelper: false });
const noHelperResult = buildModel(noHelperContext, {
  sourceData: createSourceData(),
  analysisSettings: createAnalysisSettings(),
  profileRecord: createProfileRecord(createAnalysisSettings())
});
assert.ok(noHelperResult.lensModel.treatedDebtPayoff, "Missing helper path should still prepare an unavailable object.");
assert.equal(noHelperResult.lensModel.treatedDebtPayoff.metadata.consumedByMethods, false);
assert.deepEqual(cloneJson(noHelperResult.lensModel.treatedDebtPayoff.metadata.consumedByMethodNames), []);
assert.deepEqual(cloneJson(noHelperResult.lensModel.treatedDebtPayoff.metadata.methodConsumption), {
  dime: false,
  needs: false,
  hlv: false
});
assert.deepEqual(cloneJson(noHelperResult.lensModel.treatedDebtPayoff.metadata.currentMethodSourcePaths), {
  dimeDebt: "debtPayoff",
  dimeMortgage: "debtPayoff.mortgageBalance",
  needsDebtPayoff: "debtPayoff"
});
assert.equal(noHelperResult.lensModel.treatedDebtPayoff.metadata.reason, "missing-debt-treatment-helper");
assert.ok(
  hasWarningCode(noHelperResult.lensModel.treatedDebtPayoff.warnings, "missing-debt-treatment-helper"),
  "Missing helper path should expose a clear warning."
);

console.log("debt-treatment-model-prep-check passed");
