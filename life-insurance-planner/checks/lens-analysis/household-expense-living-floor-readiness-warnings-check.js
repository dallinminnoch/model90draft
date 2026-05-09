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
      throw new Error("readiness warning builder must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("readiness warning builder must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("readiness warning builder must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("readiness warning builder must not read client records directly");
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
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function assertNoForbiddenDiffs() {
  const allowedRuntimePlumbingFiles = new Set([
    "app/features/lens-analysis/income-loss-impact-display.js",
    "pages/income-loss-impact.html"
  ]);
  const forbiddenFiles = [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-integration-check.js",
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
      return !allowedRuntimePlumbingFiles.has(line.replace(/^[ MADRCU?!]+/, "").trim());
    })
    .join("\n");

  assert.equal(status, "", "readiness warning pass should not touch runtime, admin, storage, normalization, policy, compression, unapproved page, or CSS files outside the approved Income Impact plumbing files");
}

function assertNoProductionForbiddenImports() {
  [
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
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
      stateOfResidence: "CO"
    }
  }, overrides || {});
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

function buildReadiness(builderApi, integration, livingFloorAssumptions) {
  return builderApi.buildHouseholdExpenseLivingFloorReadinessWarnings({
    livingFloorAssumptions,
    stateContext: integration.resolvedContext.stateContext,
    householdContext: integration.resolvedContext.householdContext,
    livingFloorCalculationResult: integration.calculationResult
  });
}

function getNoticeCodes(result) {
  return result.notices.map(function (notice) {
    return notice.code;
  });
}

function assertNotice(result, code, message) {
  assert.ok(getNoticeCodes(result).includes(code), message || `expected notice code ${code}`);
}

function assertNoNotice(result, code, message) {
  assert.equal(getNoticeCodes(result).includes(code), false, message || `unexpected notice code ${code}`);
}

function getNotice(result, code) {
  return result.notices.find(function (notice) {
    return notice.code === code;
  });
}

assertNoForbiddenDiffs();
assertNoProductionForbiddenImports();

const context = loadContext();
const resolverApi = context.LensApp.lensAnalysis.householdExpenseLivingFloorContextResolver;
const calculationApi = context.LensApp.lensAnalysis.householdExpenseLivingFloorCalculations;
const builderApi = context.LensApp.lensAnalysis.householdExpenseLivingFloorReadinessWarnings;

assert.ok(resolverApi, "context resolver should load");
assert.ok(calculationApi, "living-floor calculator should load");
assert.ok(builderApi, "readiness warning builder should load");
assert.equal(typeof builderApi.buildHouseholdExpenseLivingFloorReadinessWarnings, "function", "builder API should export");
assert.ok(builderApi.NOTICE_CODE_VALUES.includes("foodAtHomeBandValuesMissing"), "required notice codes should be exported");
assert.ok(builderApi.NOTICE_SEVERITY_VALUES.includes("warning"), "required severity values should be exported");

const completeAssumptions = createLivingFloorAssumptions();
const completeInput = createMarriedFixture();
const inputBefore = JSON.stringify(completeInput);
const assumptionsBefore = JSON.stringify(completeAssumptions);
const completeIntegration = resolveThenCalculate(resolverApi, calculationApi, completeInput, completeAssumptions);
const readyResult = buildReadiness(builderApi, completeIntegration, completeAssumptions);

assert.equal(JSON.stringify(completeInput), inputBefore, "readiness builder proof should not mutate context input");
assert.equal(JSON.stringify(completeAssumptions), assumptionsBefore, "readiness builder proof should not mutate living-floor assumptions");
assert.deepEqual(
  plain(buildReadiness(builderApi, completeIntegration, completeAssumptions)),
  plain(readyResult),
  "readiness warning output should be deterministic"
);
assert.deepEqual(plain(readyResult), JSON.parse(JSON.stringify(readyResult)), "readiness warning output should be JSON-serializable");
assert.equal(readyResult.metadata.activeRuntimeConsumer, false, "readiness builder should remain inactive");
assertNotice(readyResult, "livingFloorAssumptionsReady", "complete assumptions should produce ready info notice");
assert.equal(getNotice(readyResult, "livingFloorAssumptionsReady").severity, "info", "ready notice should be informational");
assertNoNotice(readyResult, "foodAtHomeBandValuesMissing", "complete assumptions should not report missing food bands");
assertNoNotice(readyResult, "stateMultiplierMissing", "state-specific multiplier should avoid missing multiplier warning");

const missingBandAssumptions = clone(completeAssumptions);
missingBandAssumptions.foodAtHome.monthlyAmountsByBand.adultFemale = null;
const missingBandIntegration = resolveThenCalculate(resolverApi, calculationApi, completeInput, missingBandAssumptions);
const missingBandResult = buildReadiness(builderApi, missingBandIntegration, missingBandAssumptions);
assertNotice(missingBandResult, "foodAtHomeBandValuesMissing", "missing Food at Home band values should be reported");
assert.ok(getNotice(missingBandResult, "foodAtHomeBandValuesMissing").trace.missingBandKeys.includes("adultFemale"), "missing band trace should name the band");
assertNotice(missingBandResult, "livingFloorAssumptionsIncomplete", "missing band should mark living-floor assumptions incomplete");

const missingFactorAssumptions = clone(completeAssumptions);
missingFactorAssumptions.foodAtHome.householdSizeAdjustmentFactors["3"] = null;
const missingFactorIntegration = resolveThenCalculate(resolverApi, calculationApi, completeInput, missingFactorAssumptions);
const missingFactorResult = buildReadiness(builderApi, missingFactorIntegration, missingFactorAssumptions);
assertNotice(missingFactorResult, "foodAtHomeHouseholdSizeFactorsMissing", "missing household-size factor should be reported");
assert.ok(getNotice(missingFactorResult, "foodAtHomeHouseholdSizeFactorsMissing").trace.missingHouseholdSizeFactorKeys.includes("3"), "missing factor trace should name the factor");

const nationalFallbackIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture({
    profileRecord: {
      maritalStatus: "Married",
      spouseAge: 40,
      spouseGender: "female",
      dependentDetails: [{ age: 10 }]
    },
    pmiFacts: {}
  }),
  completeAssumptions
);
const nationalFallbackResult = buildReadiness(builderApi, nationalFallbackIntegration, completeAssumptions);
assertNotice(nationalFallbackResult, "stateFallbackNationalDefault", "national fallback state should be reported");

const mismatchIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture({
    pmiFacts: { stateOfResidence: "NY" }
  }),
  completeAssumptions
);
const mismatchResult = buildReadiness(builderApi, mismatchIntegration, completeAssumptions);
assertNotice(mismatchResult, "stateMismatchDetected", "profile/PMI state mismatch should be reported");
assert.equal(getNotice(mismatchResult, "stateMismatchDetected").trace.profileAddressState, "CO", "mismatch trace should include profile state");
assert.equal(getNotice(mismatchResult, "stateMismatchDetected").trace.pmiIncomeTaxState, "NY", "mismatch trace should include PMI state");

const missingMultiplierAssumptions = clone(completeAssumptions);
missingMultiplierAssumptions.stateCostAdjustmentMultipliers.defaultMultiplier = null;
missingMultiplierAssumptions.stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState = {};
const missingMultiplierIntegration = resolveThenCalculate(resolverApi, calculationApi, completeInput, missingMultiplierAssumptions);
const missingMultiplierResult = buildReadiness(builderApi, missingMultiplierIntegration, missingMultiplierAssumptions);
assertNotice(missingMultiplierResult, "stateMultiplierMissing", "fallback multiplier 1 should be reported when multiplier data is missing");
assert.equal(getNotice(missingMultiplierResult, "stateMultiplierMissing").severity, "warning", "missing multiplier should be a warning");

const defaultMultiplierIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture({
    profileRecord: {
      state: "NY",
      maritalStatus: "Married",
      spouseAge: 40,
      spouseGender: "female",
      dependentDetails: [{ age: 10 }]
    },
    pmiFacts: { stateOfResidence: "NY" }
  }),
  completeAssumptions,
  ["householdConsumables"]
);
const defaultMultiplierResult = buildReadiness(builderApi, defaultMultiplierIntegration, completeAssumptions);
assertNotice(defaultMultiplierResult, "stateMultiplierDefaultUsed", "default multiplier use should be reported");
assert.equal(getNotice(defaultMultiplierResult, "stateMultiplierDefaultUsed").severity, "info", "default multiplier should be informational");

const missingAgeIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture({
    profileRecord: {
      state: "CO",
      maritalStatus: "Married",
      spouseAge: 40,
      spouseGender: "female",
      dependentDetails: [{ id: "unknown-age" }]
    },
    pmiFacts: { stateOfResidence: "CO" }
  }),
  completeAssumptions,
  ["foodAtHomeConsumables"]
);
const missingAgeResult = buildReadiness(builderApi, missingAgeIntegration, completeAssumptions);
assertNotice(missingAgeResult, "missingAgeFallbackUsed", "missing age fallback should be reported");

const missingSexIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  createMarriedFixture({
    profileRecord: {
      state: "CO",
      maritalStatus: "Married",
      spouseAge: 40,
      dependentDetails: [{ age: 16 }]
    },
    pmiFacts: { stateOfResidence: "CO" }
  }),
  completeAssumptions,
  ["foodAtHomeConsumables"]
);
const missingSexResult = buildReadiness(builderApi, missingSexIntegration, completeAssumptions);
assertNotice(missingSexResult, "missingSexFallbackUsed", "missing sex fallback should be reported");

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
const singleParentResult = buildReadiness(builderApi, singleParentIntegration, completeAssumptions);
assertNotice(singleParentResult, "noSurvivingAdultDetected", "no surviving adult should be reported");

const incompleteBucketAssumptions = clone(completeAssumptions);
incompleteBucketAssumptions.model90DefaultBucketFloors.householdConsumables.monthlyPerMemberAmount = null;
const incompleteBucketIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  completeInput,
  incompleteBucketAssumptions,
  ["householdConsumables"]
);
const incompleteBucketResult = buildReadiness(builderApi, incompleteBucketIntegration, incompleteBucketAssumptions);
assertNotice(incompleteBucketResult, "moneyFloorBucketIncomplete", "null floor for a money-floor bucket should be reported");
assertNotice(incompleteBucketResult, "floorCalculationUnavailable", "calculator data gap should be reported");
assertNotice(incompleteBucketResult, "ratioFallbackWouldApply", "ratio fallback notice should be reported for incomplete floors");
assert.ok(
  getNotice(incompleteBucketResult, "moneyFloorBucketIncomplete").affectedBucketKeys.includes("householdConsumables"),
  "incomplete bucket notice should name the affected bucket"
);

const mixedBucketIntegration = resolveThenCalculate(
  resolverApi,
  calculationApi,
  completeInput,
  completeAssumptions,
  [
    "basicUtilities",
    "debtObligations",
    "diningTakeout",
    "householdConsumables"
  ]
);
const mixedBucketResult = buildReadiness(builderApi, mixedBucketIntegration, completeAssumptions);
assert.equal(mixedBucketIntegration.calculationResult.buckets.basicUtilities, undefined, "basicUtilities should not be calculated by calculator");
assert.equal(mixedBucketIntegration.calculationResult.buckets.debtObligations, undefined, "debtObligations should not be calculated by calculator");
mixedBucketResult.notices.forEach(function (notice) {
  assert.equal(notice.affectedBucketKeys.includes("basicUtilities"), false, "basicUtilities should not receive readiness adjustment notice");
  assert.equal(notice.affectedBucketKeys.includes("debtObligations"), false, "debtObligations should not receive readiness adjustment notice");
});

console.log("household-expense-living-floor-readiness-warnings-check passed");
