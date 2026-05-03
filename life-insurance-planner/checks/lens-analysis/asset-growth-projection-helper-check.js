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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAssetGrowthContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);
  loadScript(context, "app/features/lens-analysis/asset-taxonomy.js");
  loadScript(context, "app/features/lens-analysis/asset-growth-projection-calculations.js");
  return context;
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
    "app/features/lens-analysis/schema.js",
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/block-outputs.js",
    "app/features/lens-analysis/helpers/income-tax-calculations.js",
    "app/features/lens-analysis/helpers/housing-support-calculations.js",
    "app/features/lens-analysis/blocks/existing-coverage.js",
    "app/features/lens-analysis/blocks/offset-assets.js",
    "app/features/lens-analysis/blocks/survivor-scenario.js",
    "app/features/lens-analysis/blocks/tax-context.js",
    "app/features/lens-analysis/blocks/income-net-income.js",
    "app/features/lens-analysis/blocks/debt-payoff.js",
    "app/features/lens-analysis/blocks/housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/non-housing-ongoing-support.js",
    "app/features/lens-analysis/blocks/education-support.js",
    "app/features/lens-analysis/blocks/final-expenses.js",
    "app/features/lens-analysis/blocks/transition-needs.js",
    "app/features/lens-analysis/normalize-lens-model.js",
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/asset-growth-projection-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
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

function isStrictDiffGuardEnabled() {
  return process.env.ASSET_GROWTH_STRICT_DIFF_GUARD === "1";
}

function createAssumption(rate, overrides) {
  return Object.assign({
    assumedAnnualGrowthRatePercent: rate,
    assumedAnnualGrowthRateSource: "advisor",
    assumedAnnualGrowthRateProfile: "custom",
    growthConsumptionStatus: "saved-only"
  }, overrides || {});
}

function createInput(overrides) {
  return Object.assign({
    assetFacts: {
      assets: [
        {
          assetId: "asset_taxable",
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage / Investments",
          currentValue: 100000
        }
      ]
    },
    assetTreatmentAssumptions: {
      assets: {
        taxableBrokerageInvestments: createAssumption(5)
      }
    },
    assetTaxonomy,
    projectionYears: 10,
    projectionYearsSource: "asset-growth-projection-helper-check",
    valuationDate: "2026-05-03",
    valuationDateSource: "test"
  }, overrides || {});
}

function getCategory(result, categoryKey) {
  return result.includedCategories.find(function (category) {
    return category.categoryKey === categoryKey;
  });
}

function getWarning(result, code) {
  return result.warnings.find(function (warning) {
    return warning.code === code;
  });
}

function createAssetTreatmentAssumptions(growthRate) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "asset-growth-projection-helper-check",
    assets: {
      cashAndCashEquivalents: {
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0,
        assumedAnnualGrowthRatePercent: growthRate,
        assumedAnnualGrowthRateSource: "advisor",
        assumedAnnualGrowthRateProfile: "custom",
        growthConsumptionStatus: "saved-only"
      },
      taxableBrokerageInvestments: {
        include: true,
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        taxDragPercent: 0,
        liquidityHaircutPercent: 5,
        assumedAnnualGrowthRatePercent: growthRate,
        assumedAnnualGrowthRateSource: "advisor",
        assumedAnnualGrowthRateProfile: "custom",
        growthConsumptionStatus: "saved-only"
      }
    },
    customAssets: []
  };
}

function buildLensModel(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: {
      cashAndCashEquivalents: 100000,
      taxableBrokerageInvestments: 200000
    },
    analysisSettings: {
      assetTreatmentAssumptions
    },
    profileRecord: {}
  });
  assert.ok(result.lensModel, "Lens model should build");
  return result.lensModel;
}

function createMethodOutputs(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const methods = lensAnalysis.analysisMethods;
  const settings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings: {}
  });
  const lensModel = buildLensModel(context, assetTreatmentAssumptions);

  return {
    treatedAssetOffsets: lensModel.treatedAssetOffsets,
    dime: methods.runDimeAnalysis(lensModel, settings.dimeSettings),
    needs: methods.runNeedsAnalysis(lensModel, settings.needsAnalysisSettings),
    hlv: methods.runHumanLifeValueAnalysis(lensModel, settings.humanLifeValueSettings)
  };
}

const helperContext = createAssetGrowthContext();
const lensAnalysis = helperContext.LensApp.lensAnalysis;
const assetTaxonomy = lensAnalysis.assetTaxonomy;
const calculate = lensAnalysis.calculateAssetGrowthProjection;

assert.equal(typeof calculate, "function", "helper export should exist");

const baseInput = createInput();
const baseInputBefore = cloneJson(baseInput);
const baseProjection = calculate(baseInput);
assert.deepEqual(cloneJson(baseInput), baseInputBefore, "helper should not mutate input");
assert.equal(baseProjection.source, "asset-growth-projection-calculations");
assert.equal(baseProjection.consumedByMethods, false);
assert.equal(baseProjection.projectionYears, 10);
assert.equal(baseProjection.currentTotalAssetValue, 100000);
assert.equal(baseProjection.projectedTotalAssetValue, 162889.46);
assert.equal(baseProjection.totalProjectedGrowthAmount, 62889.46);
assert.equal(baseProjection.includedCategoryCount, 1);
assert.equal(getCategory(baseProjection, "taxableBrokerageInvestments").projectedValue, 162889.46);

const zeroYearProjection = calculate(createInput({ projectionYears: 0 }));
assert.equal(zeroYearProjection.projectedTotalAssetValue, 100000);
assert.equal(zeroYearProjection.totalProjectedGrowthAmount, 0);

const multipleProjection = calculate(createInput({
  assetFacts: {
    assets: [
      { categoryKey: "taxableBrokerageInvestments", label: "Taxable", currentValue: 100000 },
      { categoryKey: "taxableBrokerageInvestments", label: "Taxable duplicate", currentValue: 50000 },
      { categoryKey: "cashAndCashEquivalents", label: "Cash", currentValue: 50000 }
    ]
  },
  assetTreatmentAssumptions: {
    assets: {
      taxableBrokerageInvestments: createAssumption(5),
      cashAndCashEquivalents: createAssumption(2, {
        assumedAnnualGrowthRateSource: "taxonomy-default",
        assumedAnnualGrowthRateProfile: "balanced"
      })
    }
  }
}));
assert.equal(getCategory(multipleProjection, "taxableBrokerageInvestments").currentValue, 150000);
assert.equal(getCategory(multipleProjection, "taxableBrokerageInvestments").sourceAssetCount, 2);
assert.equal(getCategory(multipleProjection, "taxableBrokerageInvestments").projectedValue, 244334.19);
assert.equal(getCategory(multipleProjection, "cashAndCashEquivalents").projectedValue, 60949.72);
assert.equal(multipleProjection.projectedTotalAssetValue, 305283.91);
assert.equal(multipleProjection.totalProjectedGrowthAmount, 105283.91);

const missingYearsProjection = calculate(createInput({ projectionYears: undefined }));
assert.equal(missingYearsProjection.projectionYears, 0);
assert.equal(missingYearsProjection.projectedTotalAssetValue, 100000);
assert.ok(getWarning(missingYearsProjection, "invalid-asset-growth-projection-years"));

const negativeYearsProjection = calculate(createInput({ projectionYears: -5 }));
assert.equal(negativeYearsProjection.projectionYears, 0);
assert.ok(getWarning(negativeYearsProjection, "asset-growth-projection-years-clamped"));

const highYearsProjection = calculate(createInput({ projectionYears: 70 }));
assert.equal(highYearsProjection.projectionYears, 60);
assert.ok(getWarning(highYearsProjection, "asset-growth-projection-years-clamped"));

const invalidRateProjection = calculate(createInput({
  assetTreatmentAssumptions: {
    assets: {
      taxableBrokerageInvestments: createAssumption("not-a-rate")
    }
  }
}));
assert.equal(getCategory(invalidRateProjection, "taxableBrokerageInvestments").assumedAnnualGrowthRatePercent, 0);
assert.equal(invalidRateProjection.projectedTotalAssetValue, 100000);
assert.ok(getWarning(invalidRateProjection, "invalid-asset-growth-rate"));

const highRateProjection = calculate(createInput({
  assetTreatmentAssumptions: {
    assets: {
      taxableBrokerageInvestments: createAssumption(99)
    }
  }
}));
assert.equal(getCategory(highRateProjection, "taxableBrokerageInvestments").assumedAnnualGrowthRatePercent, 12);
assert.equal(highRateProjection.projectedTotalAssetValue, 310584.82);
assert.ok(getWarning(highRateProjection, "asset-growth-rate-clamped"));

const negativeRateProjection = calculate(createInput({
  assetTreatmentAssumptions: {
    assets: {
      taxableBrokerageInvestments: createAssumption(-5)
    }
  }
}));
assert.equal(getCategory(negativeRateProjection, "taxableBrokerageInvestments").assumedAnnualGrowthRatePercent, 0);
assert.ok(getWarning(negativeRateProjection, "asset-growth-rate-clamped"));

const reviewProjection = calculate(createInput({
  assetFacts: {
    assets: [
      { categoryKey: "digitalAssetsCrypto", label: "Crypto", currentValue: 10000 },
      { categoryKey: "otherCustomAsset", label: "Custom Asset", currentValue: 20000 },
      { categoryKey: "emergencyFund", label: "Emergency Fund", currentValue: 30000 },
      { categoryKey: "trustRestrictedAssets", label: "Trust", currentValue: 40000 },
      { categoryKey: "businessPrivateCompanyValue", label: "Business", currentValue: 50000 },
      { categoryKey: "stockCompensationDeferredCompensation", label: "Stock Comp", currentValue: 60000 }
    ]
  },
  assetTreatmentAssumptions: {
    assets: {
      digitalAssetsCrypto: createAssumption(0, { assumedAnnualGrowthRateSource: "taxonomy-default", assumedAnnualGrowthRateProfile: "balanced" }),
      otherCustomAsset: createAssumption(0, { assumedAnnualGrowthRateSource: "taxonomy-default", assumedAnnualGrowthRateProfile: "balanced" }),
      emergencyFund: createAssumption(0.5, { assumedAnnualGrowthRateSource: "taxonomy-default", assumedAnnualGrowthRateProfile: "balanced" }),
      trustRestrictedAssets: createAssumption(2, { assumedAnnualGrowthRateSource: "taxonomy-default", assumedAnnualGrowthRateProfile: "balanced" }),
      businessPrivateCompanyValue: createAssumption(3, { assumedAnnualGrowthRateSource: "taxonomy-default", assumedAnnualGrowthRateProfile: "balanced" }),
      stockCompensationDeferredCompensation: createAssumption(5, { assumedAnnualGrowthRateSource: "taxonomy-default", assumedAnnualGrowthRateProfile: "balanced" })
    }
  }
}));
assert.equal(reviewProjection.includedCategoryCount, 6);
assert.equal(reviewProjection.excludedCategoryCount, 0);
assert.ok(getCategory(reviewProjection, "digitalAssetsCrypto"));
assert.ok(getCategory(reviewProjection, "digitalAssetsCrypto").warnings.some((warning) => warning.code === "asset-growth-review-only-category"));
assert.ok(getWarning(reviewProjection, "digital-assets-crypto-growth-review-required"));
assert.ok(getWarning(reviewProjection, "other-custom-asset-growth-review-required"));
assert.ok(getWarning(reviewProjection, "emergency-fund-growth-caution"));
assert.ok(getWarning(reviewProjection, "trust-restricted-assets-access-limited"));
assert.ok(getWarning(reviewProjection, "business-private-company-growth-review-required"));
assert.ok(getWarning(reviewProjection, "stock-deferred-compensation-vesting-forfeiture-review"));
assert.ok(reviewProjection.reviewWarningCount >= 6);

const exclusionProjection = calculate(createInput({
  assetFacts: {
    assets: [
      { label: "Missing category", currentValue: 100 },
      { categoryKey: "cashAndCashEquivalents", label: "Missing value" },
      { categoryKey: "otherRealEstateEquity", label: "No assumption", currentValue: 100000 }
    ]
  },
  assetTreatmentAssumptions: {
    assets: {
      cashAndCashEquivalents: createAssumption(2)
    }
  }
}));
assert.equal(exclusionProjection.includedCategoryCount, 0);
assert.equal(exclusionProjection.excludedCategoryCount, 3);
assert.ok(exclusionProjection.excludedCategories.some((category) => category.warningCode === "missing-asset-category-key"));
assert.ok(exclusionProjection.excludedCategories.some((category) => category.warningCode === "missing-positive-asset-current-value"));
assert.ok(exclusionProjection.excludedCategories.some((category) => category.warningCode === "missing-asset-growth-assumption"));

const helperSource = readRepoFile("app/features/lens-analysis/asset-growth-projection-calculations.js");
[
  /document\./,
  /localStorage/,
  /sessionStorage/,
  /analysisMethods/,
  /runDimeAnalysis/,
  /runNeedsAnalysis/,
  /runHumanLifeValueAnalysis/,
  /asset-treatment-calculations/,
  /step-three-analysis-display/,
  /Step 3/
].forEach(function (pattern) {
  assert.doesNotMatch(helperSource, pattern, `helper should not reference ${pattern}`);
});

[
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /calculateAssetGrowthProjection|asset-growth-projection-calculations|projectedAssetValues/,
    `${relativePath} should not consume asset growth projection helper yet`
  );
});

const outputContext = createLensAnalysisContext();
const baseOutputs = createMethodOutputs(outputContext, createAssetTreatmentAssumptions(2));
const changedOutputs = createMethodOutputs(outputContext, createAssetTreatmentAssumptions(11));
assert.deepEqual(
  cloneJson(changedOutputs),
  cloneJson(baseOutputs),
  "changing saved-only asset growth assumptions should not change treated offsets or DIME/Needs/HLV outputs"
);

if (isStrictDiffGuardEnabled()) {
  const allowedDirtyPaths = new Set([
    "life-insurance-planner/components.css",
    "life-insurance-planner/pages/analysis-setup.html",
    "life-insurance-planner/app/features/lens-analysis/analysis-setup.js",
    "life-insurance-planner/app/features/lens-analysis/asset-taxonomy.js",
    "life-insurance-planner/app/features/lens-analysis/asset-growth-projection-calculations.js",
    "life-insurance-planner/checks/lens-analysis/asset-growth-defaults-metadata-check.js",
    "life-insurance-planner/checks/lens-analysis/asset-growth-projection-helper-check.js",
    "life-insurance-planner/checks/lens-analysis/asset-growth-saved-shape-check.js",
    "life-insurance-planner/checks/lens-analysis/asset-growth-ui-saved-only-check.js"
  ]);
  const unexpectedDirtyPaths = getDirtyPaths().filter(function (dirtyPath) {
    return !allowedDirtyPaths.has(dirtyPath);
  });
  assert.deepEqual(
    unexpectedDirtyPaths,
    [],
    "strict asset growth diff guard should only allow asset-growth owner files"
  );
}

console.log("asset-growth-projection-helper-check passed");
