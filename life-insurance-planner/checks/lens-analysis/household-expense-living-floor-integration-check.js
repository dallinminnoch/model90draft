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
      throw new Error("integration proof must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("integration proof must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("integration proof must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("integration proof must not read client records directly");
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
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function assertNoForbiddenDiffs() {
  const forbiddenFiles = [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
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
    .join("\n");

  assert.equal(status, "", "integration proof should not touch runtime, admin, storage, normalization, display, policy, compression, page, or CSS files");
}

function assertNoProductionForbiddenImports() {
  [
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js"
  ].forEach(function (relativePath) {
    const source = readRepoFile(relativePath);
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
      "clientRecords"
    ].forEach(function (forbiddenToken) {
      assert.equal(source.includes(forbiddenToken), false, `${relativePath} should not use forbidden token ${forbiddenToken}`);
    });
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function clone(value) {
  return plain(value);
}

function createLivingFloorAssumptions(overrides) {
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
        CO: { multiplier: 1.2, source: "ADMIN_ENTERED", sourcePeriod: "2026", notes: "Colorado" },
        CA: { multiplier: 1.3, source: "ADMIN_ENTERED", sourcePeriod: "2026", notes: "California" }
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

function createMarriedFixture(overrides) {
  return Object.assign({
    valuationDate: "2026-01-01",
    adultDriverCount: 1,
    profileRecord: {
      state: "co",
      maritalStatus: "Married",
      spouseDateOfBirth: "1986-06-15",
      spouseGender: "female",
      dependentDetails: [
        { id: "infant", dateOfBirth: "2023-07-01" },
        { id: "older", age: 10 }
      ]
    },
    pmiFacts: {
      stateOfResidence: "NY"
    }
  }, overrides || {});
}

function getWarningCodes(result) {
  return result.warnings.map(function (warning) {
    return warning.code;
  });
}

function getDataGapCodes(result) {
  return result.dataGaps.map(function (gap) {
    return gap.code;
  });
}

function resolveThenCalculate(resolverApi, calculationApi, contextInput, livingFloorAssumptions, planningBucketKeys) {
  const resolvedContext = resolverApi.resolveHouseholdExpenseLivingFloorContext(contextInput);
  const calculationResult = calculationApi.calculateHouseholdExpenseLivingFloors({
    livingFloorAssumptions,
    stateContext: resolvedContext.stateContext,
    householdContext: resolvedContext.householdContext,
    planningBucketKeys
  });

  return {
    resolvedContext,
    calculationResult
  };
}

assertNoForbiddenDiffs();
assertNoProductionForbiddenImports();

const context = loadContext();
const resolverApi = context.LensApp.lensAnalysis.householdExpenseLivingFloorContextResolver;
const calculationApi = context.LensApp.lensAnalysis.householdExpenseLivingFloorCalculations;

assert.ok(resolverApi, "context resolver should load");
assert.ok(calculationApi, "living-floor calculator should load");
assert.equal(typeof resolverApi.resolveHouseholdExpenseLivingFloorContext, "function", "resolver API should export");
assert.equal(typeof calculationApi.calculateHouseholdExpenseLivingFloors, "function", "calculator API should export");

const completeAssumptions = createLivingFloorAssumptions();
const marriedInput = createMarriedFixture();
const marriedInputBefore = JSON.stringify(marriedInput);
const assumptionsBefore = JSON.stringify(completeAssumptions);
const marriedIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  marriedInput,
  completeAssumptions
);

assert.equal(JSON.stringify(marriedInput), marriedInputBefore, "integration proof should not mutate context input");
assert.equal(JSON.stringify(completeAssumptions), assumptionsBefore, "integration proof should not mutate living-floor assumptions");
assert.deepEqual(
  plain(resolveThenCalculate(resolverApi, calculationApi, marriedInput, completeAssumptions)),
  plain(marriedIntegration),
  "integration output should be deterministic"
);
assert.deepEqual(plain(marriedIntegration), JSON.parse(JSON.stringify(marriedIntegration)), "integration output should be JSON-serializable");

assert.equal(marriedIntegration.resolvedContext.stateContext.stateUsed, "CO", "profile state should drive integrated calculation context");
assert.equal(marriedIntegration.resolvedContext.stateContext.stateSource, "profileAddressState", "profile state source should be traced");
assert.equal(marriedIntegration.resolvedContext.householdContext.survivingHouseholdMembers, 3, "remaining household should include spouse plus two current dependents");
assert.equal(marriedIntegration.resolvedContext.householdContext.deceasedInsuredCount, 1, "deceased client should be removed by V1 default");
assert.equal(marriedIntegration.resolvedContext.householdContext.householdMemberBandCounts.adultFemale, 1, "spouse should feed adult female band");
assert.equal(marriedIntegration.resolvedContext.householdContext.householdMemberBandCounts.infantToddler, 1, "dependent DOB should feed infant/toddler band");
assert.equal(marriedIntegration.resolvedContext.householdContext.householdMemberBandCounts.olderChild, 1, "dependent explicit age should feed older child band");

assert.equal(marriedIntegration.calculationResult.buckets.foodAtHomeConsumables.floorAmountMonthly, 672, "food floor should calculate from resolver band counts");
assert.equal(marriedIntegration.calculationResult.buckets.householdConsumables.floorAmountMonthly, 210, "household consumables should calculate from resolver household size");
assert.equal(marriedIntegration.calculationResult.buckets.communicationsConnectivity.floorAmountMonthly, 132, "communications should calculate from resolver household size");
assert.equal(marriedIntegration.calculationResult.buckets.transportationBasics.floorAmountMonthly, 240, "transportation should calculate from resolver driver count");
assert.equal(marriedIntegration.calculationResult.metadata.activeRuntimeConsumer, false, "calculator should remain inactive");
assert.equal(marriedIntegration.resolvedContext.metadata.activeRuntimeConsumer, false, "resolver should remain inactive");

const pmiStateIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture({
    profileRecord: {
      maritalStatus: "Married",
      spouseAge: 40,
      spouseGender: "female",
      dependentDetails: [{ age: 10 }]
    },
    pmiFacts: {
      stateOfResidence: "ca"
    }
  }),
  completeAssumptions,
  ["householdConsumables"]
);
assert.equal(pmiStateIntegration.resolvedContext.stateContext.stateUsed, "CA", "PMI state should be used when profile state is missing");
assert.equal(pmiStateIntegration.resolvedContext.stateContext.stateSource, "pmiIncomeTaxState", "PMI state source should feed calculator");
assert.equal(pmiStateIntegration.calculationResult.buckets.householdConsumables.stateAdjustmentMultiplier, 1.3, "PMI state multiplier should apply");
assert.equal(pmiStateIntegration.calculationResult.buckets.householdConsumables.floorAmountMonthly, 195, "PMI state multiplier should change calculated floor");

const mismatchIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture(),
  completeAssumptions,
  ["foodAtHomeConsumables"]
);
assert.equal(mismatchIntegration.resolvedContext.stateContext.stateUsed, "CO", "profile state should win on mismatch");
assert.equal(mismatchIntegration.resolvedContext.stateContext.stateMismatchWarning, "profile-pmi-state-mismatch", "state mismatch should be traced");
assert.ok(getWarningCodes(mismatchIntegration.resolvedContext).includes("profile-pmi-state-mismatch"), "state mismatch warning should be emitted");

const singleParentIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  {
    valuationDate: "2026-01-01",
    profileRecord: {
      state: "CO",
      maritalStatus: "Single",
      dependentDetails: [{ age: 5 }]
    }
  },
  completeAssumptions,
  ["foodAtHomeConsumables"]
);
assert.equal(singleParentIntegration.resolvedContext.householdContext.noSurvivingAdultDetected, true, "single parent scenario should flag missing surviving adult");
assert.equal(singleParentIntegration.resolvedContext.householdContext.adultEquivalentFallbackUsed, true, "single parent scenario should use adult-equivalent fallback");
assert.equal(singleParentIntegration.resolvedContext.householdContext.householdMemberBandCounts.youngChild, 1, "dependent should remain in child food band");
assert.equal(singleParentIntegration.resolvedContext.householdContext.householdMemberBandCounts.adultUnknown, 1, "adult-equivalent fallback should feed adultUnknown band");
assert.equal(singleParentIntegration.calculationResult.buckets.foodAtHomeConsumables.floorAmountMonthly, 598.5, "food calculation should proceed with adult-equivalent fallback");

const incompleteAssumptions = createLivingFloorAssumptions();
incompleteAssumptions.model90DefaultBucketFloors.householdConsumables.monthlyPerMemberAmount = null;
const incompleteIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture(),
  incompleteAssumptions,
  ["householdConsumables"]
);
assert.equal(incompleteIntegration.calculationResult.buckets.householdConsumables.floorAmountMonthly, null, "incomplete assumptions should produce null floor");
assert.ok(getDataGapCodes(incompleteIntegration.calculationResult).includes("missing-model90-per-member-amount"), "incomplete assumptions should create data gap");
assert.equal(incompleteIntegration.calculationResult.buckets.householdConsumables.trace.stateAdjustedFloor, undefined, "incomplete assumptions should not invent fake fallback floor");

const excludedBucketIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture(),
  completeAssumptions,
  [
    "basicUtilities",
    "debtObligations",
    "diningTakeout",
    "subscriptionsMemberships",
    "entertainmentRecreation",
    "travelVacations",
    "petsDiscretionary",
    "householdConsumables"
  ]
);
assert.deepEqual(Object.keys(excludedBucketIntegration.calculationResult.buckets), ["householdConsumables"], "only money-floor bucket should calculate from mixed request");
[
  "basicUtilities",
  "debtObligations",
  "diningTakeout",
  "subscriptionsMemberships",
  "entertainmentRecreation",
  "travelVacations",
  "petsDiscretionary"
].forEach(function (bucketKey) {
  assert.equal(excludedBucketIntegration.calculationResult.buckets[bucketKey], undefined, `${bucketKey} should not be calculated`);
});
assert.ok(
  excludedBucketIntegration.calculationResult.warnings.some(function (warning) {
    return warning.code === "bucket-not-money-floor-adjusted" && warning.details.planningBucketKey === "basicUtilities";
  }),
  "excluded active-floor bucket request should produce skip warning"
);
assert.ok(
  excludedBucketIntegration.calculationResult.warnings.some(function (warning) {
    return warning.code === "bucket-not-money-floor-adjusted" && warning.details.planningBucketKey === "debtObligations";
  }),
  "debt bucket request should produce skip warning"
);

console.log("household-expense-living-floor-integration-check passed");
