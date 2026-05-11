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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const seededLivingFloorAssumptions = {
  version: 1,
  foodAtHome: {
    planningBucketKey: "foodAtHomeConsumables",
    source: "USDA_FOOD_PLAN",
    sourcePeriod: "2026",
    planLevel: "lowCost",
    sourceUrl: "https://fns-prod.azureedge.us/sites/default/files/resource-files/usda-lowcostplan-sept2007-present.xlsx",
    sourceFileName: "usda-lowcostplan-sept2007-present.xlsx",
    importedAt: "2026-05-10T18:30:00.000Z",
    approvedAt: "2026-05-10T18:35:00.000Z",
    monthlyAmountsByBand: {
      infantToddler: 180,
      youngChild: 225,
      olderChild: 285,
      teenMale: 355,
      teenFemale: 315,
      adultMale: 390,
      adultFemale: 345,
      adultUnknown: 365,
      childUnknown: 265
    },
    householdSizeAdjustmentFactors: {
      "1": 1.2,
      "2": 1,
      "3": 0.95,
      "4": 0.9,
      "5": 0.85,
      "6Plus": 0.8
    }
  },
  model90DefaultBucketFloors: {
    householdConsumables: {
      planningBucketKey: "householdConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 110,
      monthlyPerMemberAmount: 35,
      notes: "Household goods placeholder"
    },
    communicationsConnectivity: {
      planningBucketKey: "communicationsConnectivity",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 95,
      monthlyPerMemberAmount: 12,
      notes: "Connectivity placeholder"
    },
    transportationBasics: {
      planningBucketKey: "transportationBasics",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyBaseAmount: 125,
      monthlyPerAdultDriverAmount: 75,
      notes: "Transportation placeholder"
    }
  }
};

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
  "../app/features/lens-analysis/household-expense-living-floor-metadata.js",
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
assert.match(adminDisplaySource, /householdExpenseLivingFloorMetadata/);
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
loadScript(context, "app/features/lens-analysis/household-expense-living-floor-metadata.js");
loadScript(context, "app/features/lens-analysis/household-expense-account-policy-resolver.js");
loadScript(context, "app/features/account-settings/household-expense-account-policy-admin-display.js");

const storage = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
const adminDisplay = context.LensApp.accountSettings.householdExpenseAccountPolicyAdminDisplay;
assert.ok(adminDisplay, "admin display module should load");
assert.equal(typeof adminDisplay.buildHouseholdExpensePolicyDisplayModel, "function");
assert.equal(typeof adminDisplay.renderHouseholdExpensePolicyDisplay, "function");
assert.equal(typeof adminDisplay.buildPlanningBucketSummaryDisplayModel, "function");
assert.equal(typeof adminDisplay.buildLivingFloorMetadataDisplayModel, "function");
assert.equal(typeof adminDisplay.buildSavedLivingFloorAssumptionsDisplayModel, "function");
assert.equal(typeof adminDisplay.renderSavedLivingFloorAssumptions, "function");

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
assert.equal(missingModel.livingFloorMetadata.available, true, "living-floor metadata should be available");
assert.equal(missingModel.savedLivingFloorAssumptions.available, true, "saved living-floor assumptions should be available");
assert.equal(missingModel.savedLivingFloorAssumptions.status.code, "notConfigured", "empty shell should render as not configured");
assert.equal(missingModel.savedLivingFloorAssumptions.counts.configuredFoodAtHomeBands, 0, "empty shell should have no configured food bands");
assert.equal(missingModel.savedLivingFloorAssumptions.counts.configuredHouseholdSizeFactors, 0, "empty shell should have no configured household size factors");

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

const livingFloor = missingModel.livingFloorMetadata;
const moneyFloorKeys = livingFloor.moneyFloorAdjustedBuckets.map(function (row) {
  return row.planningBucketKey;
});
assert.deepEqual(
  plain(moneyFloorKeys.slice().sort()),
  [
    "communicationsConnectivity",
    "foodAtHomeConsumables",
    "householdConsumables",
    "transportationBasics"
  ].sort(),
  "money-floor adjusted buckets should match approved display set"
);

const livingFloorExcludedKeys = livingFloor.excludedFromAdjustmentBuckets.map(function (row) {
  return row.planningBucketKey;
});
assert.ok(livingFloorExcludedKeys.includes("basicUtilities"), "basicUtilities should render as excluded from adjustment");
assert.equal(
  moneyFloorKeys.includes("basicUtilities"),
  false,
  "basicUtilities should not render as money-floor adjusted"
);
assert.ok(livingFloorExcludedKeys.includes("debtObligations"), "debtObligations should render as excluded from adjustment");
const debtObligationsRow = livingFloor.excludedFromAdjustmentBuckets.find(function (row) {
  return row.planningBucketKey === "debtObligations";
});
assert.equal(debtObligationsRow.adminEditable, false, "debtObligations should not be editable");

const zeroFloorRatioKeys = livingFloor.ratioAdjustedBuckets
  .filter(function (row) {
    return row.minimumFloorMode === "zeroFloor";
  })
  .map(function (row) {
    return row.planningBucketKey;
  });
[
  "diningTakeout",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations",
  "petsDiscretionary",
  "savingsGoalContributions"
].forEach(function (planningBucketKey) {
  assert.ok(zeroFloorRatioKeys.includes(planningBucketKey), `${planningBucketKey} should render as zero-floor ratio adjusted`);
});
assert.ok(livingFloor.foodAtHomeBands.length >= 9, "food-at-home age/sex bands should be present in display model");
assert.ok(
  livingFloor.foodAtHomeBands.some(function (band) {
    return band.bandKey === "teenMale";
  }),
  "food-at-home teenMale band should be present"
);
assert.equal(
  livingFloor.householdSizingRule.householdSizingRuleKey,
  "remainingHouseholdAfterInsuredDeath",
  "remaining-household sizing rule should be present"
);
assert.equal(Object.prototype.hasOwnProperty.call(livingFloor, "stateSourcePriority"), false, "living-floor metadata should not expose retired state source priority");

const missingHtml = adminDisplay.renderHouseholdExpensePolicyDisplay(missingModel);
assert.match(missingHtml, /data-household-expense-policy-diagnostics/);
assert.match(missingHtml, /Advanced \/ Diagnostics/);
assert.match(missingHtml, /data-household-expense-policy-diagnostics-body/);
assert.match(missingHtml, /data-household-expense-policy-source-summary/);
assert.doesNotMatch(missingHtml, /<details\b[^>]*data-household-expense-policy-diagnostics[^>]*\bopen\b/);
assert.match(missingHtml, /Default seed policy only/);
assert.match(missingHtml, /Lifestyle range rows/);
assert.match(missingHtml, /Compression policy rows/);
assert.match(missingHtml, /Compression threshold rows/);
assert.match(missingHtml, /Planning Bucket Summary/);
assert.match(missingHtml, /Clean Included Buckets/);
assert.match(missingHtml, /Mixed Buckets \/ Row Exceptions/);
assert.match(missingHtml, /Locked Or Source-Owned Buckets/);
assert.match(missingHtml, /Living Floor Metadata/);
assert.match(missingHtml, /Expense Floor Model/);
assert.match(missingHtml, /Saved Living Floor Assumptions/);
assert.match(missingHtml, /Not configured/);
assert.doesNotMatch(missingHtml, /data-saved-living-floor-food-source-metadata/);
assert.match(missingHtml, /Food bands set/);
assert.match(missingHtml, /Household factors set/);
assert.doesNotMatch(missingHtml, /State Cost Adjustment Multipliers/);
assert.match(missingHtml, /MODEL90 Default Bucket Floors/);
assert.match(missingHtml, /Not set/);
assert.match(missingHtml, /Money-Floor Adjusted/);
assert.match(missingHtml, /Ratio-Adjusted/);
assert.match(missingHtml, /Excluded From Adjustment/);
assert.match(missingHtml, /foodAtHomeConsumables/);
assert.match(missingHtml, /householdConsumables/);
assert.match(missingHtml, /communicationsConnectivity/);
assert.match(missingHtml, /transportationBasics/);
assert.match(missingHtml, /basicUtilities/);
assert.match(missingHtml, /debtObligations/);
assert.match(missingHtml, /diningTakeout/);
assert.match(missingHtml, /subscriptionsMemberships/);
assert.match(missingHtml, /entertainmentRecreation/);
assert.match(missingHtml, /travelVacations/);
assert.match(missingHtml, /petsDiscretionary/);
assert.match(missingHtml, /savingsGoalContributions/);
assert.match(missingHtml, /infantToddler/);
assert.match(missingHtml, /teenMale/);
assert.match(missingHtml, /adultUnknown/);
assert.match(missingHtml, /childUnknown/);
assert.match(missingHtml, /6Plus/);
assert.match(missingHtml, /remainingHouseholdAfterInsuredDeath/);
assert.doesNotMatch(missingHtml, /profileAddressState -&gt; pmiIncomeTaxState -&gt; accountDefaultState -&gt; nationalDefault/);
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
assert.doesNotMatch(missingHtml, /Review-only/);
assert.doesNotMatch(missingHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save/);
const bucketSummaryStart = missingHtml.indexOf("data-household-expense-planning-bucket-summary");
const bucketSummaryEnd = missingHtml.indexOf("data-household-expense-policy-protected-summary");
assert.ok(bucketSummaryStart >= 0 && bucketSummaryEnd > bucketSummaryStart, "bucket summary section should render before protected summary");
const bucketSummaryHtml = missingHtml.slice(bucketSummaryStart, bucketSummaryEnd);
assert.doesNotMatch(bucketSummaryHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save|data-household-expense-policy-reset-row/);
const livingFloorStart = missingHtml.indexOf("data-household-expense-living-floor-metadata");
const livingFloorEnd = missingHtml.indexOf("data-household-expense-policy-protected-summary");
assert.ok(livingFloorStart >= 0 && livingFloorEnd > livingFloorStart, "living-floor metadata section should render before protected summary");
const livingFloorHtml = missingHtml.slice(livingFloorStart, livingFloorEnd);
assert.doesNotMatch(livingFloorHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save|data-household-expense-policy-reset-row|reset/i);
const savedAssumptionsStart = missingHtml.indexOf("data-household-expense-saved-living-floor-assumptions");
const savedAssumptionsEnd = missingHtml.indexOf("data-household-expense-policy-protected-summary");
assert.ok(savedAssumptionsStart >= 0 && savedAssumptionsEnd > savedAssumptionsStart, "saved living-floor assumptions section should render before protected summary");
const savedAssumptionsHtml = missingHtml.slice(savedAssumptionsStart, savedAssumptionsEnd);
assert.match(savedAssumptionsHtml, /Saved Living Floor Assumptions/);
assert.match(savedAssumptionsHtml, /Not configured/);
assert.match(savedAssumptionsHtml, /Not set/);
assert.match(savedAssumptionsHtml, /infantToddler/);
assert.match(savedAssumptionsHtml, /youngChild/);
assert.match(savedAssumptionsHtml, /olderChild/);
assert.match(savedAssumptionsHtml, /teenMale/);
assert.match(savedAssumptionsHtml, /teenFemale/);
assert.match(savedAssumptionsHtml, /adultMale/);
assert.match(savedAssumptionsHtml, /adultFemale/);
assert.match(savedAssumptionsHtml, /adultUnknown/);
assert.match(savedAssumptionsHtml, /childUnknown/);
assert.match(savedAssumptionsHtml, /6Plus/);
assert.doesNotMatch(savedAssumptionsHtml, /global-state-multipliers/);
assert.match(savedAssumptionsHtml, /householdConsumables/);
assert.match(savedAssumptionsHtml, /communicationsConnectivity/);
assert.match(savedAssumptionsHtml, /transportationBasics/);
assert.doesNotMatch(savedAssumptionsHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save|data-household-expense-policy-reset-row|reset/i);
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
  livingFloorAssumptions: seededLivingFloorAssumptions,
  metadata: { source: "check-fixture" }
};

storage.saveHouseholdExpenseAccountPolicy({
  accountId,
  accountPolicy: validPolicy,
  metadata: { updatedBy: "check" },
  storage: context.localStorage
});
const writeCountAfterSeed = context.localStorage.getWriteCount();

const validModel = adminDisplay.buildHouseholdExpensePolicyDisplayModel({
  accountId,
  storage: context.localStorage
});
assert.equal(validModel.status.code, "accountOverride", "valid saved policy should show account override status");
assert.equal(validModel.counts.lifestyleRangeOverrides, 1, "valid saved policy should count lifestyle overrides");
assert.equal(validModel.counts.compressionPolicyOverrides, 1, "valid saved policy should count compression policy overrides");
assert.equal(validModel.counts.compressionThresholdOverrides, 1, "valid saved policy should count threshold overrides");
assert.equal(validModel.savedLivingFloorAssumptions.status.code, "configured", "complete Food at Home values and factors should render as configured");
assert.equal(validModel.savedLivingFloorAssumptions.counts.configuredFoodAtHomeBands, 9, "seeded policy should count all food bands");
assert.equal(validModel.savedLivingFloorAssumptions.counts.configuredHouseholdSizeFactors, 6, "seeded policy should count all household factors");
assert.equal(Object.prototype.hasOwnProperty.call(validModel.savedLivingFloorAssumptions.counts, "globalStateMultiplierRows"), false, "saved living-floor counts should not include retired state multiplier rows");
assert.equal(validModel.savedLivingFloorAssumptions.foodAtHome.planLevel, "lowCost", "display model should preserve USDA plan level");
assert.equal(validModel.savedLivingFloorAssumptions.foodAtHome.sourceFileName, "usda-lowcostplan-sept2007-present.xlsx", "display model should preserve USDA source filename");
const validHtml = adminDisplay.renderHouseholdExpensePolicyDisplay(validModel);
assert.equal(context.localStorage.getWriteCount(), writeCountAfterSeed, "rendering seeded saved assumptions should not write storage");
assert.match(validHtml, /Saved account override/);
assert.match(validHtml, /Configured/);
assert.match(validHtml, /\$180\.00/);
assert.match(validHtml, /\$390\.00/);
assert.match(validHtml, /data-saved-living-floor-food-source-metadata/);
assert.match(validHtml, /planLevel/);
assert.match(validHtml, /lowCost/);
assert.match(validHtml, /sourceFileName/);
assert.match(validHtml, /usda-lowcostplan-sept2007-present\.xlsx/);
assert.match(validHtml, /importedAt/);
assert.match(validHtml, /2026-05-10T18:30:00\.000Z/);
assert.match(validHtml, /approvedAt/);
assert.doesNotMatch(validHtml, /1\.08/);
assert.doesNotMatch(validHtml, /Colorado placeholder/);
assert.match(validHtml, /Household goods placeholder/);
assert.match(validHtml, /monthlyPerAdultDriverAmount/);
const validSavedAssumptionsStart = validHtml.indexOf("data-household-expense-saved-living-floor-assumptions");
const validSavedAssumptionsEnd = validHtml.indexOf("data-household-expense-policy-protected-summary");
const validSavedAssumptionsHtml = validHtml.slice(validSavedAssumptionsStart, validSavedAssumptionsEnd);
assert.doesNotMatch(validSavedAssumptionsHtml, /<input\b|<select\b|<button\b|data-household-expense-policy-save|data-household-expense-policy-reset-row|reset/i);

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
