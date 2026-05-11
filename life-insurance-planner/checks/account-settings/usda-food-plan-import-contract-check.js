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

function createContext() {
  const context = {
    console,
    LensApp: {
      accountSettings: {},
      lensAnalysis: {}
    }
  };
  context.window = context;
  context.globalThis = context;
  Object.defineProperty(context, "localStorage", {
    get() {
      throw new Error("USDA Food Plan import contract must not read localStorage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("USDA Food Plan import contract must not read the DOM");
    }
  });
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePreview(overrides) {
  return Object.assign({
    sourceFormat: "MODEL90_USDA_FOOD_PLAN_PREVIEW_V1",
    planLevel: "lowCost",
    sourcePeriod: "2026-02",
    sourceUrl: "https://fns-prod.azureedge.us/sites/default/files/resource-files/usda-lowcostplan-sept2007-present.xlsx",
    sourceFileName: "usda-lowcostplan-sept2007-present.xlsx",
    importedAt: "2026-05-10T18:30:00.000Z",
    approvedAt: "2026-05-10T18:35:00.000Z",
    monthlyAmountsByBand: {
      infantToddler: "165.25",
      youngChild: 216.5,
      olderChild: "288.40",
      teenMale: 316.9,
      teenFemale: 266.2,
      adultMale: 312.5,
      adultFemale: 271.4,
      adultUnknown: 291.95,
      childUnknown: 260.1
    },
    householdSizeAdjustmentFactors: {
      "1": 1.2,
      "2": 1.1,
      "3": 1.05,
      "4": 1,
      "5": 0.95,
      "6Plus": 0.9
    },
    warnings: [{
      code: "representative-adult-row",
      message: "Adult values use the USDA 20-50 row in this preview.",
      details: { rowKey: "adultMale" }
    }]
  }, overrides || {});
}

function getDataGapCodes(result) {
  return result.dataGaps.map(function (gap) {
    return gap.code;
  });
}

function assertNoStateMultiplierFields(value, label) {
  if (Array.isArray(value)) {
    value.forEach(function (item, index) {
      assertNoStateMultiplierFields(item, `${label}[${index}]`);
    });
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.keys(value).forEach(function (key) {
    assert.equal(/state.*multiplier|multiplier.*state/i.test(key), false, `${label}.${key} should not expose state multiplier fields`);
    assertNoStateMultiplierFields(value[key], `${label}.${key}`);
  });
}

function assertNoForbiddenSourceTokens() {
  const source = readRepoFile("app/features/account-settings/usda-food-plan-import-contract.js");
  [
    "fetch(",
    "XMLHttpRequest",
    "localStorage",
    "sessionStorage",
    "document.",
    "querySelector",
    "addEventListener",
    "saveHouseholdExpenseAccountPolicy"
  ].forEach(function (token) {
    assert.equal(source.includes(token), false, `USDA import contract should not use forbidden token ${token}`);
  });
}

assertNoForbiddenSourceTokens();

const context = createContext();
loadScript(context, "app/features/account-settings/usda-food-plan-import-contract.js");

const contract = context.LensApp.accountSettings.usdaFoodPlanImportContract;
assert.ok(contract, "USDA Food Plan import contract should export");
assert.equal(contract.USDA_FOOD_PLAN_IMPORT_CONTRACT_VERSION, 1, "contract version should be stable");
assert.equal(contract.USDA_FOOD_PLAN_PREVIEW_ENDPOINT, "/api/account-settings/usda-food-plan/preview", "preview endpoint should be defined");
assert.equal(contract.USDA_FOOD_PLAN_APPROVAL_SAVE_NAMESPACE, "accountPolicy.livingFloorAssumptions.foodAtHome", "approval save namespace should be defined");
assert.equal(typeof contract.validateUsdaFoodPlanImportPreview, "function", "validator should export");
assert.equal(typeof contract.mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions, "function", "mapper should export");
assert.deepEqual(
  plain(contract.SUPPORTED_USDA_FOOD_PLAN_LEVELS),
  ["thrifty", "lowCost", "moderateCost", "liberal"],
  "all requested USDA plan levels should be supported"
);

const backendContract = contract.getUsdaFoodPlanBackendContract();
assert.equal(backendContract.previewEndpoint.method, "POST", "backend preview endpoint should be POST");
assert.equal(backendContract.previewEndpoint.responseFormat, contract.USDA_FOOD_PLAN_PREVIEW_FORMAT, "backend response format should be explicit");
assert.equal(backendContract.runtime.clientAnalysisFetchesUsda, false, "client analysis must not fetch USDA");
assert.equal(backendContract.runtime.incomeImpactUsesSavedAssumptionsOnly, true, "Income Impact should use saved assumptions only");

contract.SUPPORTED_USDA_FOOD_PLAN_LEVELS.forEach(function (planLevel) {
  const result = contract.validateUsdaFoodPlanImportPreview(makePreview({ planLevel }));
  assert.equal(result.valid, true, `${planLevel} preview should validate`);
  assert.equal(result.normalizedPreview.planLevel, planLevel, `${planLevel} should normalize unchanged`);
});

const validPreview = makePreview();
const validation = contract.validateUsdaFoodPlanImportPreview(validPreview);
assert.equal(validation.valid, true, "valid backend preview should validate");
assert.equal(validation.dataGaps.length, 0, "valid backend preview should not produce data gaps");
assert.equal(validation.warnings.length, 1, "backend warnings should be preserved");

const mapped = contract.mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions(validPreview);
assert.equal(mapped.valid, true, "valid backend preview should map");
assert.equal(mapped.foodAtHome.planningBucketKey, "foodAtHomeConsumables", "mapped assumptions should target Food at Home bucket");
assert.equal(mapped.foodAtHome.source, "USDA_FOOD_PLAN", "mapped assumptions should identify USDA source");
assert.equal(mapped.foodAtHome.sourcePeriod, "2026-02", "source period should be preserved");
assert.equal(mapped.foodAtHome.planLevel, "lowCost", "plan level should be preserved");
assert.equal(mapped.foodAtHome.sourceUrl, validPreview.sourceUrl, "source URL should be preserved");
assert.equal(mapped.foodAtHome.sourceFileName, validPreview.sourceFileName, "source filename should be preserved");
assert.equal(mapped.foodAtHome.importedAt, validPreview.importedAt, "import timestamp should be preserved");
assert.equal(mapped.foodAtHome.approvedAt, validPreview.approvedAt, "approval timestamp should be preserved when supplied");
assert.equal(mapped.foodAtHome.monthlyAmountsByBand.infantToddler, 165.25, "dollar strings should normalize to numbers");
assert.equal(mapped.foodAtHome.monthlyAmountsByBand.adultUnknown, 291.95, "adult unknown band should map");
assert.equal(mapped.foodAtHome.householdSizeAdjustmentFactors["6Plus"], 0.9, "household-size factors should map");
assertNoStateMultiplierFields(mapped, "mapped");

const mappingBefore = plain(contract.mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions(validPreview));
const mappingAfter = plain(contract.mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions(validPreview));
assert.deepEqual(mappingAfter, mappingBefore, "mapping should be deterministic");
assert.deepEqual(plain(mapped), JSON.parse(JSON.stringify(mapped)), "mapping output should be JSON serializable");

const invalidPlan = contract.validateUsdaFoodPlanImportPreview(makePreview({ planLevel: "economy" }));
assert.equal(invalidPlan.valid, false, "invalid plan level should fail");
assert.ok(getDataGapCodes(invalidPlan).includes("invalid-plan-level"), "invalid plan level should produce data gap");

const missingPeriod = contract.validateUsdaFoodPlanImportPreview(makePreview({ sourcePeriod: "" }));
assert.equal(missingPeriod.valid, false, "missing sourcePeriod should fail");
assert.ok(getDataGapCodes(missingPeriod).includes("missing-source-period"), "missing sourcePeriod should produce data gap");

const missingBand = contract.validateUsdaFoodPlanImportPreview(makePreview({
  monthlyAmountsByBand: Object.assign({}, makePreview().monthlyAmountsByBand, {
    teenMale: null
  })
}));
assert.equal(missingBand.valid, false, "missing band value should fail");
assert.ok(getDataGapCodes(missingBand).includes("missing-usda-band-value"), "missing band value should produce data gap");
assert.equal(
  missingBand.dataGaps.find((gap) => gap.code === "missing-usda-band-value").details.bandKey,
  "teenMale",
  "missing band data gap should identify band"
);

const incompleteFactors = contract.validateUsdaFoodPlanImportPreview(makePreview({
  householdSizeAdjustmentFactors: {
    "1": 1.2,
    "2": 1.1,
    "3": 1.05,
    "4": 1,
    "5": 0.95
  }
}));
assert.equal(incompleteFactors.valid, false, "incomplete household-size factors should fail");
assert.ok(getDataGapCodes(incompleteFactors).includes("incomplete-household-size-factors"), "incomplete factors should produce data gap");

const invalidFactor = contract.validateUsdaFoodPlanImportPreview(makePreview({
  householdSizeAdjustmentFactors: Object.assign({}, makePreview().householdSizeAdjustmentFactors, {
    "2": 0.1
  })
}));
assert.equal(invalidFactor.valid, false, "out-of-range household-size factors should fail");
assert.ok(getDataGapCodes(invalidFactor).includes("incomplete-household-size-factors"), "out-of-range factors should produce data gap");

const unknownFormat = contract.validateUsdaFoodPlanImportPreview(makePreview({
  sourceFormat: "spreadsheet-v0"
}));
assert.equal(unknownFormat.valid, false, "unknown source format should fail");
assert.ok(getDataGapCodes(unknownFormat).includes("unknown-source-format"), "unknown source format should produce data gap");

const invalidMap = contract.mapUsdaFoodPlanPreviewToFoodAtHomeAssumptions(makePreview({
  planLevel: "economy"
}));
assert.equal(invalidMap.valid, false, "invalid preview should not map");
assert.equal(invalidMap.foodAtHome, null, "invalid preview should not return foodAtHome assumptions");

loadScript(context, "app/features/lens-analysis/household-expense-living-floor-metadata.js");
loadScript(context, "app/features/lens-analysis/household-expense-living-floor-calculations.js");

const livingFloorApi = context.LensApp.lensAnalysis.householdExpenseLivingFloorCalculations;
const foodFloorResult = livingFloorApi.calculateHouseholdExpenseLivingFloors({
  planningBucketKeys: ["foodAtHomeConsumables"],
  livingFloorAssumptions: {
    version: 1,
    foodAtHome: mapped.foodAtHome
  },
  householdContext: {
    survivingHouseholdMembers: 4,
    householdMemberBandCounts: {
      infantToddler: 1,
      youngChild: 1,
      olderChild: 0,
      teenMale: 1,
      teenFemale: 0,
      adultMale: 1,
      adultFemale: 0,
      adultUnknown: 0,
      childUnknown: 0
    }
  }
});
assert.equal(foodFloorResult.dataGaps.length, 0, "living-floor calculator should consume mapped Food at Home assumptions");
assert.equal(foodFloorResult.buckets.foodAtHomeConsumables.floorAmountMonthly, 1011.15, "mapped assumptions should calculate expected food floor");
assertNoStateMultiplierFields(foodFloorResult, "foodFloorResult");

console.log("USDA Food Plan import contract checks passed");
