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

  loadScript(context, "app/features/lens-analysis/debt-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/analysis-setup.js");

  return context;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractFunctionBody(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`);
  const end = source.indexOf(`function ${nextFunctionName}`, start);
  assert.notEqual(start, -1, `${functionName} should exist`);
  assert.notEqual(end, -1, `${nextFunctionName} should follow ${functionName}`);
  return source.slice(start, end);
}

function createRawEquivalentCategoryTreatment(overrides = {}) {
  return {
    include: true,
    mode: "payoff",
    payoffPercent: 100,
    ...overrides
  };
}

function assertRawEquivalentTreatment(treatment, message) {
  assert.deepEqual(toPlainObject(treatment), {
    include: true,
    mode: "payoff",
    payoffPercent: 100
  }, message);
}

function assertNoProtectedDiffs() {
  const protectedFiles = new Set([
    "app/features/lens-analysis/analysis-settings-adapter.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/step-three-analysis-display.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
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
  assert.deepEqual(protectedChanged, [], "Only Analysis Setup and focused check files should change in this pass.");
}

const context = createContext();
const analysisSetup = context.LensApp.analysisSetup;
const taxonomy = context.LensApp.lensAnalysis.debtTaxonomy;
const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");

assert.equal(typeof analysisSetup.getDebtTreatmentAssumptions, "function");
assert.equal(typeof analysisSetup.getDebtCategoryTreatmentItems, "function");

const expectedCategoryKeys = toPlainObject(taxonomy.DEFAULT_DEBT_CATEGORY_KEYS);
const defaultAssumptions = analysisSetup.DEFAULT_DEBT_TREATMENT_ASSUMPTIONS;
assert.equal(defaultAssumptions.schemaVersion, 2);
assert.equal(defaultAssumptions.enabled, true, "Debt treatment assumptions should be active for DIME and Needs.");
assert.equal(defaultAssumptions.mortgageTreatment.mode, "payoff");
assert.equal(defaultAssumptions.mortgageTreatment.paymentSupportYears, null);
assert.ok(defaultAssumptions.debtCategoryTreatment, "default assumptions should expose debtCategoryTreatment");
assert.equal(
  Object.prototype.hasOwnProperty.call(defaultAssumptions, "nonMortgageDebtTreatment"),
  false,
  "default assumptions should not expose scalar-era nonMortgageDebtTreatment"
);
assert.deepEqual(toPlainObject(Object.keys(defaultAssumptions.debtCategoryTreatment)), expectedCategoryKeys);
expectedCategoryKeys.forEach((categoryKey) => {
  assertRawEquivalentTreatment(
    defaultAssumptions.debtCategoryTreatment[categoryKey],
    `${categoryKey} should use raw-equivalent default treatment`
  );
});

const rows = analysisSetup.getDebtCategoryTreatmentItems();
assert.deepEqual(toPlainObject(rows.map((row) => row.key)), expectedCategoryKeys);
assert.equal(rows.find((row) => row.key === "realEstateSecuredDebt").label, "Real Estate Secured Debt");
assert.deepEqual(toPlainObject(rows.find((row) => row.key === "realEstateSecuredDebt").sourceFields), ["otherRealEstateLoans"]);
assert.deepEqual(toPlainObject(rows.find((row) => row.key === "unsecuredConsumerDebt").sourceFields), ["creditCardDebt", "personalLoans"]);
assert.deepEqual(toPlainObject(rows.find((row) => row.key === "medicalDebt").sourceFields), []);

const broadSaved = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
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
      debtCategoryTreatment: {
        securedConsumerDebt: createRawEquivalentCategoryTreatment({ payoffPercent: 50 })
      },
      nonMortgageDebtTreatment: {
        autoLoans: { include: false, mode: "exclude", payoffPercent: 0 }
      },
      source: "analysis-setup"
    }
  }
});
assert.equal(broadSaved.schemaVersion, 2);
assert.equal(broadSaved.enabled, true, "Legacy false enabled flags should not make active DIME/Needs treatment look inactive.");
assert.equal(broadSaved.debtCategoryTreatment.securedConsumerDebt.payoffPercent, 50);
assert.equal(broadSaved.debtCategoryTreatment.securedConsumerDebt.include, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(broadSaved, "nonMortgageDebtTreatment"),
  false,
  "normalized assumptions should not carry scalar-era nonMortgageDebtTreatment"
);

const legacySaved = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      enabled: false,
      globalTreatmentProfile: "balanced",
      mortgageTreatment: {
        include: true,
        mode: "payoff",
        payoffPercent: 100,
        paymentSupportYears: null
      },
      nonMortgageDebtTreatment: {
        autoLoans: { include: true, mode: "payoff", payoffPercent: 50 },
        otherRealEstateLoans: { include: false, mode: "exclude", payoffPercent: 0 }
      },
      source: "analysis-setup"
    }
  }
});
assert.equal(legacySaved.debtCategoryTreatment.securedConsumerDebt.payoffPercent, 50);
assert.equal(legacySaved.debtCategoryTreatment.realEstateSecuredDebt.include, false);
assert.equal(legacySaved.debtCategoryTreatment.realEstateSecuredDebt.mode, "exclude");

const conflictingLegacy = analysisSetup.getDebtTreatmentAssumptions({
  analysisSettings: {
    debtTreatmentAssumptions: {
      nonMortgageDebtTreatment: {
        creditCardDebt: { include: false, mode: "exclude", payoffPercent: 0 },
        personalLoans: { include: true, mode: "payoff", payoffPercent: 50 }
      },
      source: "analysis-setup"
    }
  }
});
assertRawEquivalentTreatment(
  conflictingLegacy.debtCategoryTreatment.unsecuredConsumerDebt,
  "conflicting scalar-era unsecured debt settings should default safely"
);

const saveBody = extractFunctionBody(
  source,
  "readValidatedDebtTreatmentAssumptions",
  "readValidatedSurvivorSupportAssumptions"
);
assert.match(saveBody, /schemaVersion:\s*DEBT_TREATMENT_SCHEMA_VERSION/);
assert.match(saveBody, /enabled:\s*true/);
assert.match(saveBody, /debtCategoryTreatment:\s*\{\}/);
assert.doesNotMatch(
  saveBody,
  /nonMortgageDebtTreatment/,
  "save output should not write nonMortgageDebtTreatment"
);
assert.doesNotMatch(
  saveBody,
  /lastUpdatedAt/,
  "new debt treatment saved shape should not add save-history metadata"
);

const profileBody = extractFunctionBody(source, "applyDebtTreatmentProfile", "applySurvivorSupportProfile");
assert.match(profileBody, /debtCategoryTreatment/);
assert.doesNotMatch(profileBody, /nonMortgageDebtTreatment/);

const previewBody = extractFunctionBody(source, "syncDebtTreatmentPreview", "syncSurvivorSupportPreview");
assert.match(previewBody, /DIME and Needs use treated debt/);
assert.match(previewBody, /HLV remains unchanged/);
assert.match(previewBody, /Support mode uses the current monthly mortgage payment from PMI/);
assert.match(previewBody, /remaining mortgage term when reliable term data is available/);
assert.match(previewBody, /No inflation or discounting is applied/);
assert.match(previewBody, /Taxes, insurance, HOA, utilities, and maintenance stay in ongoing household expenses/);
assert.match(previewBody, /Non-mortgage custom treatment remains warning-backed until formulas are defined/);
assert.doesNotMatch(previewBody, /Mortgage support mode is deferred/);
assert.doesNotMatch(previewBody, /Support and custom modes use warning-backed raw-equivalent behavior/);
assert.doesNotMatch(previewBody, /current DIME, Needs, HLV/);
assert.doesNotMatch(previewBody, /current methods still use raw debt payoff values/);

const supportYearsVisibilityBody = extractFunctionBody(
  source,
  "syncDebtSupportYearsVisibility",
  "populateDebtTreatmentFields"
);
assert.match(supportYearsVisibilityBody, /row\.hidden\s*=\s*mode\s*!==\s*"support"/);
assert.doesNotMatch(supportYearsVisibilityBody, /mode === "custom"/);

assert.match(source, /const MORTGAGE_TREATMENT_MODES = Object\.freeze\(\["payoff", "support"\]\)/);
assert.match(source, /Mortgage treatment must be Payoff or Support\./);
assert.doesNotMatch(source, /Mortgage treatment must be Payoff, Support, or Custom\./);

const html = readRepoFile("pages/analysis-setup.html");
assert.match(html, /Used by DIME and Needs/);
assert.match(html, /HLV is unchanged/);
assert.match(html, /Mortgage support uses the current PMI mortgage payment for the selected support period/);
assert.match(html, /Support mode uses the current monthly mortgage payment from PMI/);
assert.match(html, /remaining mortgage term when reliable term data is available/);
assert.match(html, /No inflation or discounting is applied/);
assert.match(html, /Taxes, insurance, HOA, utilities, and maintenance stay in ongoing household expenses/);
assert.match(html, /<option value="payoff">Payoff<\/option>/);
assert.match(html, /<option value="support">Support<\/option>/);
assert.doesNotMatch(html, /<option value="custom">Custom \(deferred\)<\/option>/);
assert.doesNotMatch(html, /Support \(deferred\)/);
assert.doesNotMatch(html, /Support years \(deferred\)/);
assert.doesNotMatch(html, /Support and custom modes are deferred and warning-backed/);
assert.doesNotMatch(html, /Support and custom modes use warning-backed raw-equivalent behavior/);
assert.doesNotMatch(html, /Current DIME, Needs, and HLV outputs still use raw debt payoff values/);
assert.doesNotMatch(html, /Debt treatment preview \\(not used by current methods\\)/);
assert.doesNotMatch(html, /Future Defaults:/);

const mortgageSelectMarkup = html.match(/<select class="analysis-setup-asset-select analysis-setup-debt-field" data-analysis-debt-mortgage-field="mode"[\s\S]*?<\/select>/);
assert.ok(mortgageSelectMarkup, "Mortgage treatment mode select should exist.");
const mortgageOptions = Array.from(mortgageSelectMarkup[0].matchAll(/<option value="([^"]+)">/g)).map((match) => match[1]);
assert.deepEqual(mortgageOptions, ["payoff", "support"], "Visible mortgage treatment modes should be payoff and support only.");

const debtCategoryModeOptionsBody = extractFunctionBody(source, "getDebtCategoryModeOptionsMarkup", "renderDebtTreatmentRows");
assert.match(debtCategoryModeOptionsBody, /custom:\s*"Custom \(deferred\)"/);
assert.match(debtCategoryModeOptionsBody, /DEBT_CATEGORY_TREATMENT_MODES/);

assertNoProtectedDiffs();

console.log("analysis-setup-debt-treatment-saved-shape-check passed");
