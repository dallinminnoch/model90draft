#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function assertScriptOrder(scriptSources, orderedScripts) {
  let lastIndex = -1;
  orderedScripts.forEach(function (scriptPath) {
    const index = scriptSources.indexOf(scriptPath);
    assert.ok(index >= 0, `${scriptPath} should be loaded`);
    assert.ok(index > lastIndex, `${scriptPath} should load after the previous script`);
    lastIndex = index;
  });
}

function createFakeStorage() {
  const values = new Map();
  let writeCount = 0;
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      writeCount += 1;
      values.set(key, String(value));
    },
    removeItem(key) {
      writeCount += 1;
      values.delete(key);
    },
    setRaw(key, value) {
      values.set(key, String(value));
    },
    getWriteCount() {
      return writeCount;
    }
  };
}

function loadScript(context, relativePath) {
  const source = readRepoFile(relativePath);
  vm.runInContext(source, context, { filename: relativePath });
  return source;
}

const pageSource = readRepoFile("pages/admin-accounts.html");
const adminDisplaySource = readRepoFile("app/features/account-settings/household-expense-account-policy-admin-display.js");
const lifestyleScenarioSource = readRepoFile("app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js");
const compressionPrepSource = readRepoFile("app/features/lens-analysis/income-impact-compression-reporting-prep.js");
const scripts = getScriptSources(pageSource);
const policyPanelMatch = pageSource.match(/<section class="admin-accounts-panel" data-household-expense-account-policy-panel>[\s\S]*?<\/section>/);

assertScriptOrder(scripts, [
  "../app/features/account-settings/household-expense-account-policy-storage.js",
  "../app/features/lens-analysis/expense-taxonomy.js",
  "../app/features/lens-analysis/expense-library.js",
  "../app/features/lens-analysis/expense-compression-thresholds.js",
  "../app/features/lens-analysis/household-expense-compression-policy.js",
  "../app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
  "../app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js",
  "../app/features/lens-analysis/household-expense-account-policy-resolver.js",
  "../app/features/account-settings/household-expense-account-policy-admin-display.js"
]);

assert.match(pageSource, /data-household-expense-account-policy-panel/);
assert.match(pageSource, /data-household-expense-account-policy-status/);
assert.match(pageSource, /data-household-expense-account-policy-editor/);
assert.ok(policyPanelMatch, "read-only household expense policy panel should exist");
assert.doesNotMatch(
  policyPanelMatch[0],
  /<input\b|<select\b|data-household-expense-policy-save/,
  "Read-only policy panel should not include editable policy controls."
);

assert.match(adminDisplaySource, /householdExpenseAccountPolicyStorage/);
assert.match(adminDisplaySource, /householdExpenseAccountPolicyResolver/);
assert.match(adminDisplaySource, /householdExpensePlanningBucketPolicySummary/);
assert.match(adminDisplaySource, /TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID/);
assert.match(adminDisplaySource, /temporaryLocalAdminFallback/);
assert.match(adminDisplaySource, /readOnly:\s*true/);
assert.match(adminDisplaySource, /editableControlsRendered:\s*false/);
assert.match(adminDisplaySource, /saveControlsRendered:\s*false/);
assert.doesNotMatch(adminDisplaySource, /\.setItem\s*\(|\.removeItem\s*\(|analysisSettings|clientRecords|profileRecord|updateClientRecord|saveAnalysisSetupSettings/);
assert.doesNotMatch(adminDisplaySource, /income-loss-impact-display|timeline-graph|graph-model|normalize-lens-model|income-impact-lifestyle-scenario-calculations|household-expense-compression-calculations/);
assert.doesNotMatch(lifestyleScenarioSource, /account-settings|householdExpenseAccountPolicyStorage|localStorage|sessionStorage/);
assert.doesNotMatch(compressionPrepSource, /account-settings|householdExpenseAccountPolicyStorage|localStorage|sessionStorage/);

const context = {
  console,
  document: {
    addEventListener() {},
    querySelector() {
      return null;
    }
  },
  localStorage: createFakeStorage(),
  LensApp: {
    accountSettings: {},
    lensAnalysis: {}
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

loadScript(context, "app/features/account-settings/household-expense-account-policy-storage.js");
loadScript(context, "app/features/lens-analysis/expense-taxonomy.js");
loadScript(context, "app/features/lens-analysis/expense-library.js");
loadScript(context, "app/features/lens-analysis/expense-compression-thresholds.js");
loadScript(context, "app/features/lens-analysis/household-expense-compression-policy.js");
loadScript(context, "app/features/lens-analysis/household-expense-lifestyle-range-policy.js");
loadScript(context, "app/features/lens-analysis/household-expense-planning-bucket-policy-summary.js");
loadScript(context, "app/features/lens-analysis/household-expense-account-policy-resolver.js");
loadScript(context, "app/features/account-settings/household-expense-account-policy-admin-display.js");

const storage = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
const adminDisplay = context.LensApp.accountSettings.householdExpenseAccountPolicyAdminDisplay;
assert.ok(adminDisplay, "admin display module should load");
assert.equal(typeof adminDisplay.buildHouseholdExpensePolicyDisplayModel, "function");
assert.equal(typeof adminDisplay.renderHouseholdExpensePolicyDisplay, "function");
assert.equal(typeof adminDisplay.buildPlanningBucketSummaryDisplayModel, "function");

const accountId = adminDisplay.TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
const missingModel = adminDisplay.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: context.localStorage
});
assert.equal(context.localStorage.getWriteCount(), 0, "read-only display model should not write storage");
assert.equal(missingModel.status.code, "defaultSeedPolicy", "missing saved account policy should show seed-default status");
assert.ok(missingModel.counts.lifestyleRangePolicyRows > 0, "missing policy display should count lifestyle seed rows");
assert.ok(missingModel.counts.compressionPolicyRows > 0, "missing policy display should count compression policy rows");
assert.ok(missingModel.counts.compressionThresholdRows > 0, "missing policy display should count threshold rows");
assert.equal(missingModel.counts.lifestyleRangeOverrides, 0, "missing policy should show no lifestyle overrides");
assert.equal(missingModel.counts.compressionPolicyOverrides, 0, "missing policy should show no compression overrides");
assert.equal(missingModel.counts.compressionThresholdOverrides, 0, "missing policy should show no threshold overrides");
assert.equal(missingModel.planningBucketSummary.available, true, "planning bucket summary should be available");
assert.equal(missingModel.planningBucketSummary.lifestylePolicyRowCount, 86, "bucket summary should report lifestyle policy rows");
assert.equal(missingModel.planningBucketSummary.sliderEligibleRowCount, 41, "bucket summary should report slider rows");

const cleanBucketKeys = missingModel.planningBucketSummary.cleanIncludedBuckets.map(function (row) {
  return row.planningBucketKey;
});
[
  "communicationsConnectivity",
  "householdConsumables",
  "personalLivingClothing",
  "petsDiscretionary",
  "savingsGoalContributions"
].forEach(function (planningBucketKey) {
  assert.ok(cleanBucketKeys.includes(planningBucketKey), `${planningBucketKey} should render as a clean included bucket`);
});

const mixedBucketKeys = missingModel.planningBucketSummary.mixedExceptionBuckets.map(function (row) {
  return row.planningBucketKey;
});
[
  "foodAtHomeConsumables",
  "diningTakeout",
  "transportationBasics",
  "householdServices",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations"
].forEach(function (planningBucketKey) {
  assert.ok(mixedBucketKeys.includes(planningBucketKey), `${planningBucketKey} should render as a mixed bucket`);
});

const lockedBucketKeys = missingModel.planningBucketSummary.lockedSourceOwnedBuckets.map(function (row) {
  return row.planningBucketKey;
});
[
  "healthcareCare",
  "housingCore",
  "basicUtilities",
  "insurancePremiums",
  "childcareDependentSupport",
  "educationEnrichment",
  "petsCoreCare",
  "givingCommunity",
  "taxesLegalAdministrative",
  "debtObligations",
  "finalExpenses",
  "vehicleOwnershipMaintenance",
  "businessSelfEmployment",
  "financialFeesTransactionCosts",
  "periodicSinkingFundOneTime",
  "customUnknown"
].forEach(function (planningBucketKey) {
  assert.ok(lockedBucketKeys.includes(planningBucketKey), `${planningBucketKey} should render as locked/source-owned context`);
});

const missingHtml = adminDisplay.renderHouseholdExpensePolicyDisplay(missingModel);
assert.match(missingHtml, /Default seed policy only/);
assert.match(missingHtml, /Lifestyle range rows/);
assert.match(missingHtml, /Compression policy rows/);
assert.match(missingHtml, /Compression threshold rows/);
assert.match(missingHtml, /Planning Bucket Summary/);
assert.match(missingHtml, /Clean Included Buckets/);
assert.match(missingHtml, /Mixed Buckets \/ Row Exceptions/);
assert.match(missingHtml, /Locked Or Source-Owned Buckets/);
assert.match(missingHtml, /communicationsConnectivity/);
assert.match(missingHtml, /householdConsumables/);
assert.match(missingHtml, /personalLivingClothing/);
assert.match(missingHtml, /petsDiscretionary/);
assert.match(missingHtml, /savingsGoalContributions/);
assert.match(missingHtml, /foodAtHomeConsumables/);
assert.match(missingHtml, /diningTakeout/);
assert.match(missingHtml, /transportationBasics/);
assert.match(missingHtml, /householdServices/);
assert.match(missingHtml, /subscriptionsMemberships/);
assert.match(missingHtml, /entertainmentRecreation/);
assert.match(missingHtml, /travelVacations/);
assert.match(missingHtml, /sourceOwnedHealthcare|sourceOwnedEducation|sourceOwnedDebt/);
assert.doesNotMatch(missingHtml, /weddingsFamilyEvents|petFoodSupplies/, "resolved drift examples should not render as bucket drift details");
assert.match(missingHtml, /Housing/);
assert.match(missingHtml, /Debt obligations/);
assert.match(missingHtml, /Tax and legal/);
assert.match(missingHtml, /Healthcare/);
assert.match(missingHtml, /Childcare/);
assert.match(missingHtml, /Insurance/);
assert.match(missingHtml, /Giving/);
assert.doesNotMatch(missingHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save/);
const bucketSummaryStart = missingHtml.indexOf("data-household-expense-planning-bucket-summary");
const bucketSummaryEnd = missingHtml.indexOf("data-household-expense-policy-protected-summary");
assert.ok(bucketSummaryStart >= 0 && bucketSummaryEnd > bucketSummaryStart, "bucket summary section should render before protected summary");
const bucketSummaryHtml = missingHtml.slice(bucketSummaryStart, bucketSummaryEnd);
assert.doesNotMatch(bucketSummaryHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save|data-household-expense-policy-reset-row/);
assert.equal(context.localStorage.getWriteCount(), 0, "rendering bucket summary should not write storage");

const validPolicy = {
  version: 1,
  lifestyleRangeOverrides: [
    { expenseTypeKey: "groceries", conservativeFloorRatio: 0.75 }
  ],
  compressionPolicyOverrides: [
    { expenseTypeKey: "streamingDigitalSubscriptions", canReduceToZero: false }
  ],
  compressionThresholdOverrides: [
    {
      expenseTypeKey: "groceries",
      tiers: {
        minimum: 200,
        conservative: 300,
        average: 450,
        comfortable: 650
      }
    }
  ],
  guardrails: {},
  metadata: { source: "check-fixture" }
};

storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: validPolicy,
  metadata: { updatedBy: "check" },
  storage: context.localStorage
});

const validModel = adminDisplay.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: context.localStorage
});
assert.equal(validModel.status.code, "accountOverride", "valid saved policy should show account override status");
assert.equal(validModel.counts.lifestyleRangeOverrides, 1, "valid saved policy should count lifestyle overrides");
assert.equal(validModel.counts.compressionPolicyOverrides, 1, "valid saved policy should count compression policy overrides");
assert.equal(validModel.counts.compressionThresholdOverrides, 1, "valid saved policy should count threshold overrides");
assert.match(adminDisplay.renderHouseholdExpensePolicyDisplay(validModel), /Saved account override/);

const corruptStorage = createFakeStorage();
const corruptKey = storage.createHouseholdExpenseAccountPolicyStorageKey(accountId);
corruptStorage.setRaw(corruptKey, "{not-json");
const corruptModel = adminDisplay.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: corruptStorage
});
assert.equal(corruptModel.status.code, "fallbackPolicy", "corrupt saved policy should show fallback status");
assert.ok(corruptModel.counts.warnings > 0, "corrupt saved policy should show warning count");
assert.equal(corruptModel.counts.lifestyleRangeOverrides, 0, "corrupt saved policy should not count discarded overrides");
assert.match(adminDisplay.renderHouseholdExpensePolicyDisplay(corruptModel), /Fallback policy/);

console.log("household expense account policy admin display checks passed");
