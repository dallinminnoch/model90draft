#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const ledgerHelper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js"
));
const storylineHelper = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
));

const {
  buildIncomeImpactCanonicalRunwayAssetWaterfall
} = ledgerHelper;
const {
  buildIncomeImpactFinancialStorylineCandidates
} = storylineHelper;

assert.equal(typeof buildIncomeImpactCanonicalRunwayAssetWaterfall, "function");
assert.equal(typeof buildIncomeImpactFinancialStorylineCandidates, "function");

function ids(items) {
  return items.map(function (item) {
    return item.id;
  });
}

function getCandidate(result, id) {
  return result.safeRenderableEvents.find(function (candidate) {
    return candidate.id === id;
  });
}

function buildResult(config) {
  const safeConfig = config || {};
  const ledger = buildIncomeImpactCanonicalRunwayAssetWaterfall({
    startingBuckets: safeConfig.startingBuckets,
    monthlyNeeds: safeConfig.monthlyNeeds == null ? 100 : safeConfig.monthlyNeeds,
    monthlyIncome: safeConfig.monthlyIncome == null ? 0 : safeConfig.monthlyIncome,
    options: {
      maxMonths: safeConfig.maxMonths == null ? 2 : safeConfig.maxMonths
    }
  });
  const result = buildIncomeImpactFinancialStorylineCandidates({
    scenario: {
      scenario: {
        selectedDeathDate: "2036-05-14"
      },
      deathEvent: {
        date: "2036-05-14"
      }
    },
    assetDepletionLedger: ledger
  });
  return {
    ledger,
    result
  };
}

function assetBucketIds(result) {
  return ids(result.safeRenderableEvents).filter(function (id) {
    return id.startsWith("education-") || id.startsWith("retirement-");
  });
}

const educationProtected = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 1000, included: true, sourcePath: "assets.cash" },
    { id: "education", family: "educationSavings", startingValue: 500, included: true, sourcePath: "assets.education" }
  ],
  monthlyNeeds: 100,
  maxMonths: 2
});
assert.equal(educationProtected.ledger.status, "ready");
assert.ok(ids(educationProtected.result.safeRenderableEvents).includes("education-funding-remains-protected"));
assert.equal(getCandidate(educationProtected.result, "education-funding-remains-protected").displayLabel, "Education Funding Remains Protected");
assert.equal(getCandidate(educationProtected.result, "education-funding-remains-protected").trace.bucketState, "unused-through-horizon");

const educationNext = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100, included: true, sourcePath: "assets.cash" },
    { id: "education", family: "educationSavings", startingValue: 500, included: true, sourcePath: "assets.education" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(educationNext.result.safeRenderableEvents).includes("education-funding-may-be-redirected"));
assert.equal(getCandidate(educationNext.result, "education-funding-may-be-redirected").displayLabel, "Education Funding May Be Redirected");
assert.equal(getCandidate(educationNext.result, "education-funding-may-be-redirected").trace.bucketState, "next-in-line-unused");
assert.ok(!ids(educationNext.result.safeRenderableEvents).includes("education-funding-at-risk"));

const educationTapped = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 50, included: true, sourcePath: "assets.cash" },
    { id: "education", family: "educationSavings", startingValue: 500, included: true, sourcePath: "assets.education" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(educationTapped.result.safeRenderableEvents).includes("education-funding-at-risk"));
assert.equal(getCandidate(educationTapped.result, "education-funding-at-risk").displayLabel, "Education Funding Is At Risk");
assert.equal(getCandidate(educationTapped.result, "education-funding-at-risk").trace.ledgerEventType, "bucket-tapped");

const educationDepleted = buildResult({
  startingBuckets: [
    { id: "education", family: "educationSavings", startingValue: 100, included: true, sourcePath: "assets.education" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(educationDepleted.result.safeRenderableEvents).includes("education-savings-depleted"));
assert.equal(getCandidate(educationDepleted.result, "education-savings-depleted").displayLabel, "Education Savings Are Depleted");

const noEducation = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 500, included: true, sourcePath: "assets.cash" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.equal(assetBucketIds(noEducation.result).some((id) => id.startsWith("education-")), false);

const educationNotAllowed = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100, included: true, sourcePath: "assets.cash" },
    { id: "education", family: "educationSavings", startingValue: 500, sourcePath: "assets.education" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(educationNotAllowed.result.safeRenderableEvents).includes("education-funding-remains-protected"));
assert.equal(ids(educationNotAllowed.result.safeRenderableEvents).includes("education-funding-at-risk"), false);
assert.equal(ids(educationNotAllowed.result.safeRenderableEvents).includes("education-savings-depleted"), false);

const retirementIntact = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 1000, included: true, sourcePath: "assets.cash" },
    { id: "retirement", family: "retirementAssets", startingValue: 500, included: true, sourcePath: "assets.retirement" }
  ],
  monthlyNeeds: 100,
  maxMonths: 2
});
assert.ok(ids(retirementIntact.result.safeRenderableEvents).includes("retirement-assets-stay-intact"));
assert.equal(getCandidate(retirementIntact.result, "retirement-assets-stay-intact").displayLabel, "Retirement Assets Stay Intact");

const retirementNext = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100, included: true, sourcePath: "assets.cash" },
    { id: "retirement", family: "retirementAssets", startingValue: 500, included: true, sourcePath: "assets.retirement" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(retirementNext.result.safeRenderableEvents).includes("retirement-assets-next-in-line"));
assert.equal(getCandidate(retirementNext.result, "retirement-assets-next-in-line").displayLabel, "Retirement Assets Are Next in Line");
assert.equal(getCandidate(retirementNext.result, "retirement-assets-next-in-line").trace.bucketState, "next-in-line-unused");

const retirementTapped = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 50, included: true, sourcePath: "assets.cash" },
    { id: "retirement", family: "retirementAssets", startingValue: 500, included: true, sourcePath: "assets.retirement" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(retirementTapped.result.safeRenderableEvents).includes("retirement-assets-tapped"));
assert.equal(getCandidate(retirementTapped.result, "retirement-assets-tapped").displayLabel, "Retirement Assets Are Tapped");

const retirementDepleted = buildResult({
  startingBuckets: [
    { id: "retirement", family: "retirementAssets", startingValue: 100, included: true, sourcePath: "assets.retirement" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.ok(ids(retirementDepleted.result.safeRenderableEvents).includes("retirement-assets-depleted"));
assert.equal(getCandidate(retirementDepleted.result, "retirement-assets-depleted").displayLabel, "Retirement Assets Are Depleted");

const retirementNotAllowed = buildResult({
  startingBuckets: [
    { id: "cash", family: "cash", startingValue: 100, included: true, sourcePath: "assets.cash" },
    { id: "retirement", family: "retirementAssets", startingValue: 500, sourcePath: "assets.retirement" }
  ],
  monthlyNeeds: 100,
  maxMonths: 1
});
assert.equal(assetBucketIds(retirementNotAllowed.result).some((id) => id.startsWith("retirement-")), false);

[
  educationProtected,
  educationNext,
  educationTapped,
  educationDepleted,
  retirementIntact,
  retirementNext,
  retirementTapped,
  retirementDepleted
].forEach(function (fixture) {
  const emittedTitles = fixture.result.safeRenderableEvents.map(function (candidate) {
    return candidate.displayLabel;
  }).join(" ");
  assert.equal(emittedTitles.includes("Education Savings Are Redirected"), false);
  assert.equal(emittedTitles.includes("Education Savings Used for Living Needs"), false);
  assert.equal(emittedTitles.includes("Retirement Security Is Reduced"), false);
});

console.log("Income Impact asset bucket milestone trigger checks passed.");
