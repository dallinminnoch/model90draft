#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..", "..");
const gitRoot = path.resolve(projectRoot, "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createLensAnalysisContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/asset-library.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function assertProfileDefault(defaults, profile, expectedRate, expectedReviewRequired) {
  assert.ok(defaults[profile], `${profile} growth default should exist`);
  assert.equal(
    defaults[profile].assumedAnnualGrowthRatePercent,
    expectedRate,
    `${profile} assumedAnnualGrowthRatePercent should match`
  );
  assert.equal(
    defaults[profile].reviewRequired,
    expectedReviewRequired,
    `${profile} reviewRequired should match category status`
  );
}

function getDirtyPaths() {
  const output = childProcess.execFileSync("git", ["status", "--porcelain"], {
    cwd: gitRoot,
    encoding: "utf8"
  });

  return output
    .split(/\r?\n/)
    .map(function (line) {
      return line.trimEnd();
    })
    .filter(Boolean)
    .map(function (line) {
      return line.slice(3).replace(/\\/g, "/");
    });
}

const context = createLensAnalysisContext();
const lensAnalysis = context.LensApp.lensAnalysis;
const taxonomy = lensAnalysis.assetTaxonomy;
const assetLibrary = lensAnalysis.assetLibrary;

assert.ok(taxonomy, "asset taxonomy should be exported");
assert.ok(assetLibrary, "asset library should be exported");
assert.deepEqual(Array.from(taxonomy.ASSET_GROWTH_PROFILE_KEYS), [
  "conservative",
  "balanced",
  "aggressive"
]);
assert.deepEqual(Array.from(taxonomy.ASSET_GROWTH_ASSUMPTION_STATUSES), [
  "standard",
  "review-only",
  "not-recommended"
]);

const categories = taxonomy.DEFAULT_ASSET_CATEGORIES;
assert.ok(Array.isArray(categories), "default asset categories should be an array");
assert.ok(categories.length > 0, "default asset categories should exist");

const expectedDefaults = {
  cashAndCashEquivalents: { rates: [1, 2, 3], status: "standard" },
  emergencyFund: { rates: [0, 0.5, 1], status: "review-only" },
  taxableBrokerageInvestments: { rates: [4, 6, 8], status: "standard" },
  traditionalRetirementAssets: { rates: [4, 6, 8], status: "standard" },
  rothTaxAdvantagedRetirementAssets: { rates: [4, 6, 8], status: "standard" },
  qualifiedAnnuities: { rates: [3, 4, 5], status: "review-only" },
  nonqualifiedAnnuities: { rates: [3, 4, 5], status: "review-only" },
  primaryResidenceEquity: { rates: [2, 3, 4], status: "review-only" },
  otherRealEstateEquity: { rates: [2.5, 3.5, 5], status: "review-only" },
  businessPrivateCompanyValue: { rates: [0, 3, 6], status: "review-only" },
  educationSpecificSavings: { rates: [3, 5, 6], status: "review-only" },
  trustRestrictedAssets: { rates: [0, 2, 4], status: "review-only" },
  stockCompensationDeferredCompensation: { rates: [0, 5, 8], status: "review-only" },
  digitalAssetsCrypto: { rates: [0, 0, 0], status: "review-only" },
  otherCustomAsset: { rates: [0, 0, 0], status: "review-only" }
};

const categoryMap = new Map(categories.map(function (category) {
  return [category.categoryKey, category];
}));

Object.keys(expectedDefaults).forEach(function (categoryKey) {
  assert.ok(categoryMap.has(categoryKey), `${categoryKey} should be a default visible asset category`);
});

categories.forEach(function (category) {
  const categoryKey = category.categoryKey;
  const expected = expectedDefaults[categoryKey];
  assert.ok(expected, `${categoryKey} should have explicit expected growth defaults`);
  assert.ok(category.growthDefaults, `${categoryKey} should have growthDefaults`);
  assert.ok(
    taxonomy.ASSET_GROWTH_ASSUMPTION_STATUSES.includes(category.growthAssumptionStatus),
    `${categoryKey} should have a valid growthAssumptionStatus`
  );
  assert.equal(
    category.growthAssumptionStatus,
    expected.status,
    `${categoryKey} growthAssumptionStatus should match expected status`
  );
  assert.equal(
    category.growthReviewRequired,
    expected.status !== "standard",
    `${categoryKey} growthReviewRequired should follow status`
  );
  assert.equal(
    typeof category.growthDefaultRationale,
    "string",
    `${categoryKey} should have a growth default rationale`
  );
  assert.ok(
    category.growthDefaultRationale.length > 0,
    `${categoryKey} should explain its growth default rationale`
  );

  taxonomy.ASSET_GROWTH_PROFILE_KEYS.forEach(function (profile, index) {
    const profileDefault = category.growthDefaults[profile];
    assert.ok(profileDefault, `${categoryKey}.${profile} growth default should exist`);
    assert.equal(
      Number.isFinite(profileDefault.assumedAnnualGrowthRatePercent),
      true,
      `${categoryKey}.${profile} assumedAnnualGrowthRatePercent should be finite`
    );
    assert.ok(
      profileDefault.assumedAnnualGrowthRatePercent >= 0
        && profileDefault.assumedAnnualGrowthRatePercent <= 12,
      `${categoryKey}.${profile} assumedAnnualGrowthRatePercent should be in 0-12 range`
    );
    assertProfileDefault(
      category.growthDefaults,
      profile,
      expected.rates[index],
      expected.status !== "standard"
    );
  });
});

assert.deepEqual(
  Array.from(taxonomy.DEFAULT_VISIBLE_ASSET_CATEGORY_KEYS).sort(),
  Object.keys(expectedDefaults).sort(),
  "every default visible category should have explicit growth default metadata"
);

assertProfileDefault(categoryMap.get("digitalAssetsCrypto").growthDefaults, "conservative", 0, true);
assertProfileDefault(categoryMap.get("digitalAssetsCrypto").growthDefaults, "balanced", 0, true);
assertProfileDefault(categoryMap.get("digitalAssetsCrypto").growthDefaults, "aggressive", 0, true);
assert.equal(categoryMap.get("digitalAssetsCrypto").growthAssumptionStatus, "review-only");

assertProfileDefault(categoryMap.get("otherCustomAsset").growthDefaults, "conservative", 0, true);
assertProfileDefault(categoryMap.get("otherCustomAsset").growthDefaults, "balanced", 0, true);
assertProfileDefault(categoryMap.get("otherCustomAsset").growthDefaults, "aggressive", 0, true);
assert.equal(categoryMap.get("otherCustomAsset").growthAssumptionStatus, "review-only");

assert.deepEqual(
  Object.values(categoryMap.get("cashAndCashEquivalents").growthDefaults).map(function (entry) {
    return entry.assumedAnnualGrowthRatePercent;
  }),
  [1, 2, 3],
  "cash growth defaults should remain low"
);
assert.deepEqual(
  Object.values(categoryMap.get("emergencyFund").growthDefaults).map(function (entry) {
    return entry.assumedAnnualGrowthRatePercent;
  }),
  [0, 0.5, 1],
  "emergency fund growth defaults should remain preservation-oriented"
);
assert.equal(categoryMap.get("emergencyFund").growthAssumptionStatus, "review-only");

assert.deepEqual(
  Object.values(categoryMap.get("taxableBrokerageInvestments").growthDefaults).map(function (entry) {
    return entry.assumedAnnualGrowthRatePercent;
  }),
  [4, 6, 8],
  "taxable investment growth defaults should exist"
);
assert.deepEqual(
  Object.values(categoryMap.get("traditionalRetirementAssets").growthDefaults).map(function (entry) {
    return entry.assumedAnnualGrowthRatePercent;
  }),
  [4, 6, 8],
  "traditional retirement growth defaults should exist"
);
assert.deepEqual(
  Object.values(categoryMap.get("rothTaxAdvantagedRetirementAssets").growthDefaults).map(function (entry) {
    return entry.assumedAnnualGrowthRatePercent;
  }),
  [4, 6, 8],
  "Roth and tax-advantaged retirement growth defaults should exist"
);

const highYieldSavingsEntry = assetLibrary.findAssetLibraryEntry("highYieldSavingsAccount");
assert.ok(highYieldSavingsEntry, "highYieldSavingsAccount library entry should exist");
assert.equal(
  highYieldSavingsEntry.categoryKey,
  "cashAndCashEquivalents",
  "high-yield savings should remain under Cash & Cash Equivalents until a separate category is introduced"
);
assert.equal(categoryMap.has("highYieldSavingsAccount"), false, "high-yield savings should not be introduced as a visible category in this pass");

[
  "pages/analysis-setup.html",
  "components.css",
  "app/features/lens-analysis/analysis-setup.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/asset-treatment-calculations.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /assumedAnnualGrowthRatePercent|growthDefaults|growthAssumptionStatus|growthReviewRequired/,
    `${relativePath} should not consume or render asset growth defaults in this metadata-only pass`
  );
});

const allowedDirtyPaths = new Set([
  "life-insurance-planner/app/features/lens-analysis/asset-taxonomy.js",
  "life-insurance-planner/checks/lens-analysis/asset-growth-defaults-metadata-check.js"
]);
const unexpectedDirtyPaths = getDirtyPaths().filter(function (dirtyPath) {
  return !allowedDirtyPaths.has(dirtyPath);
});
assert.deepEqual(
  unexpectedDirtyPaths,
  [],
  "only asset taxonomy metadata and its focused check should be changed"
);

console.log("asset-growth-defaults-metadata-check passed");
