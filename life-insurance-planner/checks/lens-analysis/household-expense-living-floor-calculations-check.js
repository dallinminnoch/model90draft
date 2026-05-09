#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_MONEY_FLOOR_BUCKETS = Object.freeze([
  "foodAtHomeConsumables",
  "householdConsumables",
  "communicationsConnectivity",
  "transportationBasics"
]);

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  Object.defineProperty(context, "localStorage", {
    get() {
      throw new Error("calculation helper must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("calculation helper must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("calculation helper must not read the DOM");
    }
  });
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadContext() {
  const context = createContext();
  [
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function assertNoForbiddenDiffs() {
  const allowedDisplayFiles = new Set([
    "app/features/lens-analysis/analysis-setup.js",
    "pages/analysis-setup.html"
  ]);
  const forbiddenFiles = [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/household-expense-compression-calculations.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/pmi-expense-records.js",
    "app/features/lens-analysis/income-loss-impact-display.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js",
    "app/features/account-settings",
    "pages",
    "app.js",
    "styles.css",
    "app/styles"
  ];
  const status = execFileSync("git", ["status", "--short", "--"].concat(forbiddenFiles), {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim().split(/\r?\n/)
    .filter(Boolean)
    .filter(function (line) {
      return !allowedDisplayFiles.has(line.replace(/^[ MADRCU?!]+/, "").trim());
    })
    .join("\n");

  assert.equal(status, "", "runtime, admin, storage, normalization, policy, compression, unapproved page, and CSS files should not have diffs");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/household-expense-living-floor-calculations.js");
  [
    "require(",
    "import ",
    "localStorage",
    "sessionStorage",
    "document.",
    "querySelector",
    "addEventListener",
    "fetch(",
    "XMLHttpRequest",
    "analysisSettings",
    "clientRecords",
    "profileRecord"
  ].forEach(function (forbiddenToken) {
    assert.equal(source.includes(forbiddenToken), false, `living-floor calculation helper should not use forbidden token ${forbiddenToken}`);
  });
}

function createCompleteAssumptions(overrides) {
  const assumptions = {
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyAmountsByBand: {
        infantToddler: 100,
        youngChild: 200,
        olderChild: 210,
        teenMale: 300,
        teenFemale: 280,
        adultMale: 300,
        adultFemale: 250,
        adultUnknown: 275,
        childUnknown: 190
      },
      householdSizeAdjustmentFactors: {
        "1": 1.1,
        "2": 1.05,
        "3": 1,
        "4": 0.95,
        "5": 0.9,
        "6Plus": 0.85
      }
    },
    stateCostAdjustmentMultipliers: {
      version: 1,
      appliesToAdjustmentClass: "moneyFloorAdjusted",
      defaultMultiplier: 1.1,
      globalStateAdjustmentMultipliersByState: {
        CO: {
          multiplier: 1.2,
          source: "ADMIN_ENTERED",
          sourcePeriod: "2026",
          notes: "Colorado"
        }
      },
      bucketStateAdjustmentMultipliers: {}
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 100,
        monthlyPerMemberAmount: 25,
        stateAdjustmentEnabled: true,
        notes: "Household supplies"
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 80,
        monthlyPerMemberAmount: 10,
        stateAdjustmentEnabled: true,
        notes: "Connectivity"
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 150,
        monthlyPerAdultDriverAmount: 50,
        stateAdjustmentEnabled: true,
        notes: "Basic transportation"
      }
    }
  };

  return Object.assign(assumptions, overrides || {});
}

function createHouseholdContext(overrides) {
  return Object.assign({
    survivingHouseholdMembers: 4,
    householdMemberBandCounts: {
      infantToddler: 1,
      youngChild: 1,
      olderChild: 0,
      teenMale: 0,
      teenFemale: 0,
      adultMale: 1,
      adultFemale: 1,
      adultUnknown: 0,
      childUnknown: 0
    },
    adultDriverCount: 2,
    survivingAdultCount: 2,
    adultCount: 2,
    dependentCount: 2,
    noSurvivingAdultDetected: false,
    missingAgeFallbackUsed: false,
    missingSexFallbackUsed: false
  }, overrides || {});
}

function calculate(api, input) {
  return api.calculateHouseholdExpenseLivingFloors(Object.assign({
    livingFloorAssumptions: createCompleteAssumptions(),
    stateContext: {
      stateUsed: "CO",
      stateSource: "profileAddressState"
    },
    householdContext: createHouseholdContext()
  }, input || {}));
}

function getDataGapCodes(result, planningBucketKey) {
  return result.buckets[planningBucketKey].dataGaps.map(function (gap) {
    return gap.code;
  });
}

function getWarningCodes(result, planningBucketKey) {
  return result.buckets[planningBucketKey].warnings.map(function (warning) {
    return warning.code;
  });
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadContext();
const api = context.LensApp.lensAnalysis.householdExpenseLivingFloorCalculations;

assert.ok(api, "living-floor calculation helper should export");
assert.equal(typeof api.calculateHouseholdExpenseLivingFloors, "function", "calculation helper should export function");
assert.equal(api.CALCULATION_VERSION, 1, "calculation helper version should be 1");
assert.deepEqual(plain(api.MONEY_FLOOR_BUCKET_KEYS), EXPECTED_MONEY_FLOOR_BUCKETS, "money-floor bucket keys should match approved active calculation set");

const input = {
  livingFloorAssumptions: createCompleteAssumptions(),
  stateContext: {
    stateUsed: "CO",
    stateSource: "profileAddressState"
  },
  householdContext: createHouseholdContext()
};
const inputBefore = JSON.stringify(input);
const completeResult = api.calculateHouseholdExpenseLivingFloors(input);
assert.equal(JSON.stringify(input), inputBefore, "helper must not mutate input");
assert.deepEqual(plain(completeResult), JSON.parse(JSON.stringify(completeResult)), "helper output should be JSON-serializable");
assert.deepEqual(
  plain(api.calculateHouseholdExpenseLivingFloors(input)),
  plain(completeResult),
  "helper output should be deterministic for the same input"
);

assert.deepEqual(Object.keys(completeResult.buckets), EXPECTED_MONEY_FLOOR_BUCKETS, "default calculation should include only money-floor buckets");
assert.equal(completeResult.metadata.activeRuntimeConsumer, false, "helper must remain inactive for runtime");
assert.equal(completeResult.trace.calculatedAtMode, "inactive-helper", "helper trace should mark inactive mode");
assert.equal(completeResult.trace.stateUsed, "CO", "trace should include state used");
assert.equal(completeResult.trace.stateSource, "profileAddressState", "trace should include state source");
assert.equal(completeResult.trace.survivingHouseholdMembers, 4, "trace should include surviving household size");
assert.equal(completeResult.trace.householdMemberBandCounts.adultMale, 1, "trace should include band counts");

assert.equal(completeResult.buckets.foodAtHomeConsumables.floorAmountMonthly, 969, "food floor should use band subtotal, household factor, and state multiplier");
assert.equal(completeResult.buckets.foodAtHomeConsumables.floorAmountAnnual, 11628, "food annual floor should be monthly floor times 12");
assert.equal(completeResult.buckets.foodAtHomeConsumables.trace.foodBandSubtotal, 850, "food trace should include band subtotal");
assert.equal(completeResult.buckets.foodAtHomeConsumables.trace.householdSizeAdjustmentFactor, 0.95, "food trace should include household-size factor");
assert.equal(completeResult.buckets.foodAtHomeConsumables.stateAdjustmentMultiplier, 1.2, "food floor should apply state-specific multiplier");
assert.equal(completeResult.buckets.foodAtHomeConsumables.stateAdjustmentSource, "stateSpecific", "food floor should trace state-specific multiplier");

assert.equal(completeResult.buckets.householdConsumables.floorAmountMonthly, 240, "householdConsumables should calculate base plus per member with state multiplier");
assert.equal(completeResult.buckets.communicationsConnectivity.floorAmountMonthly, 144, "communicationsConnectivity should calculate base plus per member with state multiplier");
assert.equal(completeResult.buckets.transportationBasics.floorAmountMonthly, 300, "transportationBasics should calculate base plus per adult driver with state multiplier");
assert.equal(completeResult.buckets.transportationBasics.trace.adultDriverCount, 2, "transportation trace should include adult driver count");
assert.equal(completeResult.buckets.transportationBasics.trace.adultDriverCountSource, "adultDriverCount", "transportation should prefer explicit adultDriverCount");

const missingBandAssumptions = createCompleteAssumptions();
missingBandAssumptions.foodAtHome.monthlyAmountsByBand.adultMale = null;
const missingBandResult = calculate(api, { livingFloorAssumptions: missingBandAssumptions });
assert.equal(missingBandResult.buckets.foodAtHomeConsumables.floorAmountMonthly, null, "missing food band amount should produce null floor");
assert.ok(getDataGapCodes(missingBandResult, "foodAtHomeConsumables").includes("missing-food-band-amount"), "missing food band amount should produce data gap");

const missingFactorAssumptions = createCompleteAssumptions();
missingFactorAssumptions.foodAtHome.householdSizeAdjustmentFactors["4"] = null;
const missingFactorResult = calculate(api, { livingFloorAssumptions: missingFactorAssumptions });
assert.equal(missingFactorResult.buckets.foodAtHomeConsumables.floorAmountMonthly, null, "missing household-size factor should produce null food floor");
assert.ok(getDataGapCodes(missingFactorResult, "foodAtHomeConsumables").includes("missing-food-household-size-adjustment-factor"), "missing household-size factor should produce data gap");

const defaultMultiplierResult = calculate(api, {
  stateContext: {
    stateUsed: "NY",
    stateSource: "profileAddressState"
  },
  planningBucketKeys: ["householdConsumables"]
});
assert.equal(defaultMultiplierResult.buckets.householdConsumables.floorAmountMonthly, 220, "default multiplier should apply when no state row exists");
assert.equal(defaultMultiplierResult.buckets.householdConsumables.stateAdjustmentSource, "defaultMultiplier", "default multiplier source should be traced");

const fallbackMultiplierAssumptions = createCompleteAssumptions();
fallbackMultiplierAssumptions.stateCostAdjustmentMultipliers = {};
const fallbackMultiplierResult = calculate(api, {
  livingFloorAssumptions: fallbackMultiplierAssumptions,
  planningBucketKeys: ["householdConsumables"]
});
assert.equal(fallbackMultiplierResult.buckets.householdConsumables.floorAmountMonthly, 200, "fallback multiplier one should apply when multiplier data is missing");
assert.equal(fallbackMultiplierResult.buckets.householdConsumables.stateAdjustmentSource, "fallbackOne", "fallback multiplier source should be traced");

const disabledStateAssumptions = createCompleteAssumptions();
disabledStateAssumptions.model90DefaultBucketFloors.householdConsumables.stateAdjustmentEnabled = false;
const disabledStateResult = calculate(api, {
  livingFloorAssumptions: disabledStateAssumptions,
  planningBucketKeys: ["householdConsumables"]
});
assert.equal(disabledStateResult.buckets.householdConsumables.floorAmountMonthly, 200, "stateAdjustmentEnabled false should prevent state multiplier application");
assert.equal(disabledStateResult.buckets.householdConsumables.stateAdjustmentMultiplier, 1, "disabled state adjustment should use multiplier one");
assert.equal(disabledStateResult.buckets.householdConsumables.stateAdjustmentSource, "stateAdjustmentDisabled", "disabled state adjustment should be traced");

const survivingAdultFallbackResult = calculate(api, {
  householdContext: createHouseholdContext({
    adultDriverCount: null,
    survivingAdultCount: 2,
    adultCount: 3
  }),
  planningBucketKeys: ["transportationBasics"]
});
assert.equal(survivingAdultFallbackResult.buckets.transportationBasics.floorAmountMonthly, 300, "transportation should fall back to survivingAdultCount");
assert.equal(survivingAdultFallbackResult.buckets.transportationBasics.trace.adultDriverCountSource, "survivingAdultCount", "transportation fallback source should be survivingAdultCount");
assert.ok(getWarningCodes(survivingAdultFallbackResult, "transportationBasics").includes("adult-driver-count-fallback"), "transportation fallback should warn");

const adultCountFallbackResult = calculate(api, {
  householdContext: createHouseholdContext({
    adultDriverCount: null,
    survivingAdultCount: null,
    adultCount: 3
  }),
  planningBucketKeys: ["transportationBasics"]
});
assert.equal(adultCountFallbackResult.buckets.transportationBasics.floorAmountMonthly, 360, "transportation should fall back to adultCount");
assert.equal(adultCountFallbackResult.buckets.transportationBasics.trace.adultDriverCountSource, "adultCount", "transportation fallback source should be adultCount");

const fallbackOneDriverResult = calculate(api, {
  householdContext: createHouseholdContext({
    adultDriverCount: null,
    survivingAdultCount: null,
    adultCount: null
  }),
  planningBucketKeys: ["transportationBasics"]
});
assert.equal(fallbackOneDriverResult.buckets.transportationBasics.floorAmountMonthly, 240, "transportation should fall back to one driver when all driver counts are missing");
assert.equal(fallbackOneDriverResult.buckets.transportationBasics.trace.adultDriverCountSource, "fallbackOne", "transportation fallback source should be fallbackOne");
assert.ok(getWarningCodes(fallbackOneDriverResult, "transportationBasics").includes("adult-driver-count-fallback"), "fallbackOne driver count should warn");

const excludedRequestResult = calculate(api, {
  planningBucketKeys: [
    "foodAtHomeConsumables",
    "basicUtilities",
    "debtObligations",
    "housingCore",
    "healthcareCare",
    "finalExpenses",
    "educationEnrichment",
    "insurancePremiums",
    "diningTakeout",
    "subscriptionsMemberships",
    "entertainmentRecreation",
    "travelVacations",
    "petsDiscretionary",
    "savingsGoalContributions"
  ]
});
assert.deepEqual(Object.keys(excludedRequestResult.buckets), ["foodAtHomeConsumables"], "only requested money-floor buckets should be calculated");
[
  "basicUtilities",
  "debtObligations",
  "housingCore",
  "healthcareCare",
  "finalExpenses",
  "educationEnrichment",
  "insurancePremiums",
  "diningTakeout",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations",
  "petsDiscretionary",
  "savingsGoalContributions"
].forEach(function (bucketKey) {
  assert.equal(excludedRequestResult.buckets[bucketKey], undefined, `${bucketKey} should not be calculated as an active floor`);
});
assert.ok(
  excludedRequestResult.warnings.some(function (warning) {
    return warning.code === "bucket-not-money-floor-adjusted" && warning.details.planningBucketKey === "basicUtilities";
  }),
  "non-money-floor requested buckets should produce skip warning"
);

const blankShellResult = api.calculateHouseholdExpenseLivingFloors({
  livingFloorAssumptions: {
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: null,
      monthlyAmountsByBand: {},
      householdSizeAdjustmentFactors: {}
    },
    stateCostAdjustmentMultipliers: {
      version: 1,
      appliesToAdjustmentClass: "moneyFloorAdjusted",
      defaultMultiplier: null,
      globalStateAdjustmentMultipliersByState: {},
      bucketStateAdjustmentMultipliers: {}
    },
    model90DefaultBucketFloors: {}
  },
  stateContext: {},
  householdContext: {
    survivingHouseholdMembers: 2,
    householdMemberBandCounts: {
      adultFemale: 1,
      childUnknown: 1
    }
  }
});
assert.equal(blankShellResult.buckets.foodAtHomeConsumables.floorAmountMonthly, null, "blank shell food floor should be null");
assert.equal(blankShellResult.buckets.householdConsumables.floorAmountMonthly, null, "blank shell household floor should be null");
assert.equal(blankShellResult.buckets.communicationsConnectivity.floorAmountMonthly, null, "blank shell communications floor should be null");
assert.equal(blankShellResult.buckets.transportationBasics.floorAmountMonthly, null, "blank shell transportation floor should be null");
assert.ok(blankShellResult.dataGaps.length >= 4, "blank shell should report data gaps");
assert.equal(blankShellResult.metadata.activeRuntimeConsumer, false, "blank shell result should remain inactive");

const noRuntimeReadContext = loadContext();
const noRuntimeReadApi = noRuntimeReadContext.LensApp.lensAnalysis.householdExpenseLivingFloorCalculations;
assert.doesNotThrow(function () {
  noRuntimeReadApi.calculateHouseholdExpenseLivingFloors({
    livingFloorAssumptions: createCompleteAssumptions(),
    stateContext: { stateUsed: "CO" },
    householdContext: createHouseholdContext()
  });
}, "helper should not require storage, DOM, profile, client, or app runtime state");

console.log("household-expense-living-floor-calculations-check passed");
