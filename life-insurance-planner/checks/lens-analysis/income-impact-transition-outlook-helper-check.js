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
  loadScript(context, "app/features/lens-analysis/income-impact-transition-outlook-calculations.js");
  return context;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function calculate(input) {
  const context = createContext();
  return cloneJson(context.LensApp.lensAnalysis.calculateIncomeImpactTransitionOutlook(input));
}

function asset(assetId, categoryKey, currentValue, extra) {
  return Object.assign({
    assetId,
    categoryKey,
    typeKey: categoryKey,
    label: assetId,
    currentValue
  }, extra || {});
}

function points(monthlyNeed, monthlyObligations) {
  return [1, 2, 3].map(function (monthIndex) {
    return {
      monthIndex,
      survivorNeeds: monthlyNeed,
      scheduledObligations: monthlyObligations || 0,
      endingResources: 100000 - monthIndex * monthlyNeed
    };
  });
}

function baseInput(assets, monthlyNeed, monthlyObligations) {
  return {
    assetFacts: { assets },
    deathEvent: {
      coverageAdded: 1000000,
      resourcesAfterObligations: 500000
    },
    postDeathTimelinePoints: points(monthlyNeed, monthlyObligations)
  };
}

function hasWarning(result, code) {
  return result.warnings.some(function (warning) {
    return warning.code === code;
  });
}

function assertNoMutation(input, action) {
  const before = JSON.stringify(input);
  action();
  assert.equal(JSON.stringify(input), before, "helper should not mutate input graph/runway/timeline data");
}

function run() {
  const stable = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", 30000),
    asset("emergency", "emergencyFund", 7500)
  ], 10000));
  assert.equal(stable.status, "Stable");
  assert.equal(stable.transitionNeed90Days, 30000);
  assert.equal(stable.fastAccessResources, 37500);
  assert.equal(stable.fastAccessCoverageRatio, 1.25);

  const caution = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", 32000),
    asset("emergency", "emergencyFund", 5000)
  ], 10000));
  assert.equal(caution.status, "Caution");
  assert.equal(caution.fastAccessCoverageRatio, 1.2333);

  const atRisk = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", 21000)
  ], 10000));
  assert.equal(atRisk.status, "At Risk");
  assert.equal(atRisk.fastAccessCoverageRatio, 0.7);

  const likelyFailure = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", 10000)
  ], 10000));
  assert.equal(likelyFailure.status, "Likely Failure");
  assert.equal(likelyFailure.fastAccessCoverageRatio, 0.3333);

  const nearTermOnly = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", 10000),
    asset("brokerage", "taxableBrokerageInvestments", 50000)
  ], 10000));
  assert.equal(nearTermOnly.status, "Likely Failure");
  assert.equal(nearTermOnly.fastAccessResources, 10000);
  assert.equal(nearTermOnly.nearTermResources, 50000);
  assert.equal(nearTermOnly.fastAccessCoverageRatio, 0.3333);
  assert.equal(nearTermOnly.nearTermCoverageRatio, 2);

  const excluded = calculate(baseInput([
    asset("retirement", "traditionalRetirementAssets", 100000),
    asset("home", "primaryResidenceEquity", 300000),
    asset("business", "businessPrivateCompanyValue", 250000),
    asset("custom", "otherCustomAsset", 40000),
    asset("crypto", "digitalAssetsCrypto", 20000)
  ], 10000));
  assert.equal(excluded.fastAccessResources, 0);
  assert.equal(excluded.nearTermResources, 0);
  assert.equal(excluded.excludedResources, 710000);
  assert.equal(excluded.status, "Likely Failure");

  const coverageExcluded = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", 0)
  ], 10000));
  assert.equal(coverageExcluded.fastAccessResources, 0);
  assert.equal(coverageExcluded.status, "Likely Failure");
  assert.equal(coverageExcluded.trace.fastAccessPolicy.lifeInsuranceProceedsIncluded, false);
  assert.equal(coverageExcluded.trace.deathEventUsedForFastAccessResources, false);

  const missingNeed = calculate({
    assetFacts: {
      assets: [asset("cash", "cashAndCashEquivalents", 100000)]
    },
    postDeathTimelinePoints: []
  });
  assert.equal(missingNeed.status, "insufficientData");
  assert.equal(missingNeed.transitionNeed90Days, null);
  assert(hasWarning(missingNeed, "missing-post-death-timeline-points"));

  const invalidValues = calculate(baseInput([
    asset("cash", "cashAndCashEquivalents", -1000),
    asset("emergency", "emergencyFund", "not a number"),
    asset("valid", "cashAndCashEquivalents", 15000)
  ], 10000));
  assert.equal(invalidValues.fastAccessResources, 15000);
  assert(hasWarning(invalidValues, "invalid-asset-value-ignored"));

  const bucketFallback = calculate({
    resourceBuckets: [
      { id: "cash", family: "cash", startingValue: 12000 },
      { id: "emergency", family: "emergencyFund", startingValue: 8000 },
      { id: "coverage", family: "existingCoverage", startingValue: 999999 }
    ],
    postDeathTimelinePoints: points(10000)
  });
  assert.equal(bucketFallback.trace.sourceUsed, "resourceBucketsFallback");
  assert.equal(bucketFallback.fastAccessResources, 20000);
  assert.equal(bucketFallback.excludedResources, 999999);

  const mutationInput = baseInput([
    asset("cash", "cashAndCashEquivalents", 50000)
  ], 10000);
  assertNoMutation(mutationInput, function () {
    calculate(mutationInput);
  });
}

run();
console.log("income-impact-transition-outlook-helper-check passed");
