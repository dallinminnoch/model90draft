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
      throw new Error("context resolver must not read browser storage");
    }
  });
  Object.defineProperty(context, "sessionStorage", {
    get() {
      throw new Error("context resolver must not read session storage");
    }
  });
  Object.defineProperty(context, "document", {
    get() {
      throw new Error("context resolver must not read the DOM");
    }
  });
  Object.defineProperty(context, "clientRecords", {
    get() {
      throw new Error("context resolver must not read client records directly");
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
  loadScript(context, "app/features/lens-analysis/household-expense-living-floor-context-resolver.js");
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoForbiddenDiffs() {
  const allowedDisplayFiles = new Set([
    "app/features/lens-analysis/analysis-setup.js",
    "pages/analysis-setup.html",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js"
  ]);
  const forbiddenFiles = [
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
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
    .filter(function (line) {
      return !allowedDisplayFiles.has(line.replace(/^[ MADRCU?!]+/, "").trim());
    })
    .join("\n");

  assert.equal(status, "", "unapproved runtime, admin, storage, normalization, policy, compression, page, and CSS files should not have diffs");
}

function assertNoForbiddenImports() {
  const source = readRepoFile("app/features/lens-analysis/household-expense-living-floor-context-resolver.js");
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
    assert.equal(source.includes(forbiddenToken), false, `context resolver should not use forbidden token ${forbiddenToken}`);
  });
}

function resolve(api, input) {
  return api.resolveHouseholdExpenseLivingFloorContext(input || {});
}

function getWarningCodes(result) {
  return result.warnings.map(function (warning) {
    return warning.code;
  });
}

function createMarriedInput(overrides) {
  return Object.assign({
    valuationDate: "2026-01-01",
    profileRecord: {
      state: "co",
      maritalStatus: "Married",
      spouseDateOfBirth: "1986-06-15",
      spouseGender: "female",
      dependentDetails: [
        { id: "d1", dateOfBirth: "2023-07-01" },
        { id: "d2", dateOfBirth: "2019-04-01" }
      ],
      projectedDependentsCount: 2
    },
    pmiFacts: {
      stateOfResidence: "NY"
    }
  }, overrides || {});
}

assertNoForbiddenDiffs();
assertNoForbiddenImports();

const context = loadContext();
const api = context.LensApp.lensAnalysis.householdExpenseLivingFloorContextResolver;

assert.ok(api, "context resolver should export");
assert.equal(typeof api.resolveHouseholdExpenseLivingFloorContext, "function", "context resolver should export function");
assert.equal(api.CONTEXT_RESOLVER_VERSION, 1, "context resolver version should be 1");
assert.equal(api.DECEASED_INSURED_COUNT_DEFAULT, 1, "deceased insured default should be one");

const input = createMarriedInput();
const inputBefore = JSON.stringify(input);
const result = resolve(api, input);
assert.equal(JSON.stringify(input), inputBefore, "context resolver should not mutate inputs");
assert.deepEqual(plain(result), JSON.parse(JSON.stringify(result)), "context resolver output should be JSON-serializable");
assert.deepEqual(plain(resolve(api, input)), plain(result), "context resolver output should be deterministic");
assert.equal(result.metadata.activeRuntimeConsumer, false, "context resolver must remain inactive for runtime");

assert.equal(result.stateContext.profileAddressState, "CO", "profile state should normalize to uppercase");
assert.equal(result.stateContext.pmiIncomeTaxState, "NY", "PMI state should normalize to uppercase");
assert.equal(result.stateContext.stateUsed, "CO", "profile address state should win over PMI state");
assert.equal(result.stateContext.stateSource, "profileAddressState", "state source should trace profile priority");
assert.equal(result.stateContext.stateMismatchWarning, "profile-pmi-state-mismatch", "state mismatch should be traced");
assert.ok(getWarningCodes(result).includes("profile-pmi-state-mismatch"), "state mismatch should emit warning");
assert.equal(result.stateContext.nationalFallbackUsed, false, "national fallback should not be used when profile state exists");

const pmiStateResult = resolve(api, {
  pmiFacts: { stateOfResidence: "ca" },
  profileRecord: {},
  valuationDate: "2026-01-01"
});
assert.equal(pmiStateResult.stateContext.stateUsed, "CA", "PMI state should be used when profile state is missing");
assert.equal(pmiStateResult.stateContext.stateSource, "pmiIncomeTaxState", "PMI state source should be traced");

const nationalResult = resolve(api, {
  profileRecord: { state: "Colorado" },
  pmiFacts: { stateOfResidence: "" }
});
assert.equal(nationalResult.stateContext.stateUsed, "nationalDefault", "national default should be used when no valid state exists");
assert.equal(nationalResult.stateContext.stateSource, "nationalDefault", "national fallback source should be traced");
assert.equal(nationalResult.stateContext.nationalFallbackUsed, true, "national fallback flag should be true");
assert.ok(getWarningCodes(nationalResult).includes("invalid-state-code-ignored"), "invalid free-text state should be rejected");
assert.ok(nationalResult.dataGaps.some(function (gap) { return gap.code === "state-national-default-used"; }), "national fallback should create data gap");

assert.equal(result.householdContext.deceasedInsuredCount, 1, "deceased insured count should default to one");
assert.equal(result.householdContext.deceasedInsuredRole, "client", "client should be default deceased insured");
assert.equal(result.householdContext.survivingAdultCount, 1, "married household should include surviving spouse");
assert.equal(result.householdContext.dependentCount, 2, "structured current dependents should be counted");
assert.equal(result.householdContext.survivingHouseholdMembers, 3, "remaining household should be spouse plus dependents");
assert.equal(result.householdContext.totalCurrentHouseholdMembers, 4, "total current household should include deceased insured plus remaining members");
assert.equal(result.householdContext.householdMemberBandCounts.adultFemale, 1, "spouse should classify as adult female");
assert.equal(result.householdContext.householdMemberBandCounts.infantToddler, 1, "DOB child age 2 should classify infantToddler");
assert.equal(result.householdContext.householdMemberBandCounts.youngChild, 1, "DOB child age 6 should classify youngChild");
assert.equal(result.trace.excludedProjectedDependentsCount, 2, "projected dependents should be traced but excluded");

const marriedNoDependents = resolve(api, {
  valuationDate: "2026-01-01",
  profileRecord: {
    maritalStatus: "Married",
    spouseAge: 40,
    spouseGender: "female",
    dependentsCount: 0
  }
});
assert.equal(marriedNoDependents.householdContext.survivingHouseholdMembers, 1, "married no dependents should leave one surviving spouse");
assert.equal(marriedNoDependents.householdContext.dependentCount, 0, "married no dependents should have zero dependents");

const singleWithDependents = resolve(api, {
  valuationDate: "2026-01-01",
  profileRecord: {
    maritalStatus: "Single",
    dependentDetails: [
      { id: "d1", age: 5 }
    ]
  }
});
assert.equal(singleWithDependents.householdContext.noSurvivingAdultDetected, true, "single with dependents should detect no surviving adult");
assert.equal(singleWithDependents.householdContext.adultEquivalentFallbackUsed, true, "single with dependents should add adult-equivalent fallback");
assert.equal(singleWithDependents.householdContext.survivingHouseholdMembers, 2, "single with one dependent should size as dependent plus adult-equivalent fallback");
assert.equal(singleWithDependents.householdContext.householdMemberBandCounts.adultUnknown, 1, "adult-equivalent fallback should add adultUnknown band");
assert.ok(getWarningCodes(singleWithDependents).includes("no-surviving-adult-detected"), "no surviving adult should warn");

const explicitAgeFallback = resolve(api, {
  profileRecord: {
    maritalStatus: "Single",
    dependentDetails: [
      { age: 10 }
    ]
  }
});
assert.equal(explicitAgeFallback.householdContext.householdMemberBandCounts.olderChild, 1, "explicit age should classify older child");

const fallbackFlags = resolve(api, {
  valuationDate: "2026-01-01",
  profileRecord: {
    maritalStatus: "Married",
    spouseAge: 42,
    dependentDetails: [
      { id: "missing-age-sex" },
      { id: "teen-missing-sex", age: 15 }
    ]
  }
});
assert.equal(fallbackFlags.householdContext.missingAgeFallbackUsed, true, "missing age should set fallback flag");
assert.equal(fallbackFlags.householdContext.missingSexFallbackUsed, true, "missing spouse/teen sex should set fallback flag");
assert.equal(fallbackFlags.householdContext.householdMemberBandCounts.childUnknown, 2, "missing-age child and missing-sex teen should classify childUnknown");
assert.equal(fallbackFlags.householdContext.householdMemberBandCounts.adultUnknown, 1, "missing-sex adult should classify adultUnknown");
assert.ok(getWarningCodes(fallbackFlags).includes("missing-age-fallback-used"), "missing age fallback should warn");
assert.ok(getWarningCodes(fallbackFlags).includes("missing-sex-fallback-used"), "missing sex fallback should warn");

const teenBands = resolve(api, {
  valuationDate: "2026-01-01",
  profileRecord: {
    maritalStatus: "Single",
    dependentDetails: [
      { age: 16, sex: "male" },
      { age: 17, gender: "female" }
    ]
  }
});
assert.equal(teenBands.householdContext.householdMemberBandCounts.teenMale, 1, "teen male should classify to teenMale");
assert.equal(teenBands.householdContext.householdMemberBandCounts.teenFemale, 1, "teen female should classify to teenFemale");

const adultBands = resolve(api, {
  valuationDate: "2026-01-01",
  scenarioContext: { deceasedInsuredRole: "spouse" },
  profileRecord: {
    gender: "male",
    age: 45,
    maritalStatus: "Married",
    spouseAge: 44,
    spouseGender: "female",
    householdMembers: [
      { relationship: "dependent parent", age: 70, sex: "female", isDependent: true },
      { relationship: "dependent adult child", age: 20 }
    ]
  }
});
assert.equal(adultBands.householdContext.deceasedInsuredRole, "spouse", "explicit spouse deceased scenario should be traced");
assert.equal(adultBands.householdContext.householdMemberBandCounts.adultMale, 1, "surviving client should classify adult male");
assert.equal(adultBands.householdContext.householdMemberBandCounts.adultFemale, 1, "dependent adult with female sex should classify adult female");
assert.equal(adultBands.householdContext.householdMemberBandCounts.adultUnknown, 1, "dependent adult with missing sex should classify adultUnknown");

const explicitDriver = resolve(api, createMarriedInput({
  adultDriverCount: 3
}));
assert.equal(explicitDriver.householdContext.adultDriverCount, 3, "explicit adultDriverCount should be used");
assert.equal(explicitDriver.householdContext.adultDriverCountSource, "explicitAdultDriverCount", "explicit driver source should be traced");
assert.equal(explicitDriver.householdContext.driverCountFallbackUsed, false, "explicit driver count should not use fallback");

const fallbackDriver = resolve(api, createMarriedInput({
  adultDriverCount: null
}));
assert.equal(fallbackDriver.householdContext.adultDriverCount, 1, "missing adultDriverCount should fall back to survivingAdultCount");
assert.equal(fallbackDriver.householdContext.adultDriverCountSource, "survivingAdultCount", "driver fallback source should be survivingAdultCount");
assert.equal(fallbackDriver.householdContext.driverCountFallbackUsed, true, "driver fallback flag should be true");
assert.ok(getWarningCodes(fallbackDriver).includes("adult-driver-count-fallback-used"), "driver fallback should warn");

const noRuntimeReadContext = loadContext();
const noRuntimeReadApi = noRuntimeReadContext.LensApp.lensAnalysis.householdExpenseLivingFloorContextResolver;
assert.doesNotThrow(function () {
  noRuntimeReadApi.resolveHouseholdExpenseLivingFloorContext(createMarriedInput());
}, "context resolver should not require storage, DOM, app globals, or client records");

console.log("household-expense-living-floor-context-resolver-check passed");
