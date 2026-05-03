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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    "  LensApp.__assetGrowthSavedShapeHarness = { readValidatedAssetTreatmentAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );
  const context = {
    console,
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    },
    Intl,
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  vm.createContext(context);
  loadScript(context, "app/features/lens-analysis/asset-taxonomy.js");
  vm.runInContext(instrumentedSource, context, {
    filename: "app/features/lens-analysis/analysis-setup.js"
  });
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

function createTreatmentFields(assumptions, profile) {
  const assets = assumptions.assets || {};
  const fields = {
    defaultProfile: profile || assumptions.defaultProfile || "balanced",
    defaultProfileButtons: [],
    include: {},
    preset: {},
    taxTreatment: {},
    tax: {},
    haircut: {},
    preview: {},
    fieldLists: {
      include: {},
      preset: {},
      taxTreatment: {},
      tax: {},
      haircut: {},
      preview: {}
    },
    custom: {
      label: {},
      value: {},
      include: {},
      preset: {},
      taxTreatment: {},
      tax: {},
      haircut: {},
      preview: {}
    },
    currentAssumptions: assumptions
  };

  Object.keys(assets).forEach(function (categoryKey) {
    const asset = assets[categoryKey];
    const includeField = { checked: asset.include === true };
    const presetField = { value: asset.treatmentPreset || "custom" };
    const taxField = { value: String(asset.taxDragPercent ?? 0) };
    const haircutField = { value: String(asset.liquidityHaircutPercent ?? 0) };
    const taxTreatmentField = { textContent: "" };

    fields.include[categoryKey] = includeField;
    fields.preset[categoryKey] = presetField;
    fields.tax[categoryKey] = taxField;
    fields.haircut[categoryKey] = haircutField;
    fields.taxTreatment[categoryKey] = taxTreatmentField;
    fields.fieldLists.include[categoryKey] = [includeField];
    fields.fieldLists.preset[categoryKey] = [presetField];
    fields.fieldLists.tax[categoryKey] = [taxField];
    fields.fieldLists.haircut[categoryKey] = [haircutField];
    fields.fieldLists.taxTreatment[categoryKey] = [taxTreatmentField];
  });

  return fields;
}

function createAssetTreatmentAssumptions(growthRate) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "asset-growth-saved-shape-check",
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

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const assetTaxonomy = setupContext.LensApp.lensAnalysis.assetTaxonomy;
const harness = setupContext.LensApp.__assetGrowthSavedShapeHarness;

assert.equal(typeof analysisSetup.getAssetTreatmentAssumptions, "function");
assert.equal(typeof harness.readValidatedAssetTreatmentAssumptions, "function");

const taxonomyCategories = new Map(assetTaxonomy.DEFAULT_ASSET_CATEGORIES.map(function (category) {
  return [category.categoryKey, category];
}));

const defaultAssumptions = analysisSetup.getAssetTreatmentAssumptions({});
assert.equal(defaultAssumptions.defaultProfile, "balanced");
assert.equal(defaultAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRatePercent, 2);
assert.equal(defaultAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRateSource, "taxonomy-default");
assert.equal(defaultAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRateProfile, "balanced");
assert.equal(defaultAssumptions.assets.cashAndCashEquivalents.growthConsumptionStatus, "saved-only");
assert.equal(defaultAssumptions.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 6);
assert.equal(defaultAssumptions.assets.traditionalRetirementAssets.assumedAnnualGrowthRatePercent, 6);

const conservativeAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: {
      defaultProfile: "conservative",
      assets: {}
    }
  }
});
assert.equal(conservativeAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRatePercent, 1);
assert.equal(conservativeAssumptions.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 4);
assert.equal(conservativeAssumptions.assets.qualifiedAnnuities.assumedAnnualGrowthRatePercent, 3);
assert.equal(conservativeAssumptions.assets.qualifiedAnnuities.assumedAnnualGrowthRateProfile, "conservative");

const aggressiveAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: {
      defaultProfile: "aggressive",
      assets: {}
    }
  }
});
assert.equal(aggressiveAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRatePercent, 3);
assert.equal(aggressiveAssumptions.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 8);
assert.equal(aggressiveAssumptions.assets.stockCompensationDeferredCompensation.assumedAnnualGrowthRatePercent, 8);

const customMissingAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: {
      defaultProfile: "custom",
      assets: {}
    }
  }
});
assert.equal(customMissingAssumptions.defaultProfile, "custom");
assert.equal(customMissingAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRatePercent, 2);
assert.equal(customMissingAssumptions.assets.cashAndCashEquivalents.assumedAnnualGrowthRateProfile, "balanced");

const savedAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: {
      defaultProfile: "balanced",
      assets: {
        taxableBrokerageInvestments: {
          assumedAnnualGrowthRatePercent: 7.25,
          assumedAnnualGrowthRateSource: "advisor",
          assumedAnnualGrowthRateProfile: "custom"
        },
        traditionalRetirementAssets: {
          assumedAnnualGrowthRatePercent: 99,
          assumedAnnualGrowthRateProfile: "custom"
        },
        rothTaxAdvantagedRetirementAssets: {
          assumedAnnualGrowthRatePercent: -5,
          assumedAnnualGrowthRateProfile: "custom"
        },
        emergencyFund: {
          assumedAnnualGrowthRatePercent: "not-a-number"
        }
      }
    }
  }
});
assert.equal(savedAssumptions.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 7.25);
assert.equal(savedAssumptions.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateSource, "advisor");
assert.equal(savedAssumptions.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateProfile, "custom");
assert.equal(savedAssumptions.assets.traditionalRetirementAssets.assumedAnnualGrowthRatePercent, 12);
assert.equal(savedAssumptions.assets.traditionalRetirementAssets.assumedAnnualGrowthRateSource, "advisor");
assert.equal(savedAssumptions.assets.rothTaxAdvantagedRetirementAssets.assumedAnnualGrowthRatePercent, 0);
assert.equal(savedAssumptions.assets.rothTaxAdvantagedRetirementAssets.assumedAnnualGrowthRateSource, "advisor");
assert.equal(savedAssumptions.assets.emergencyFund.assumedAnnualGrowthRatePercent, 0.5);
assert.equal(savedAssumptions.assets.emergencyFund.assumedAnnualGrowthRateSource, "taxonomy-default");

const profileChangeFields = createTreatmentFields(defaultAssumptions, "conservative");
const profileChangedValidation = harness.readValidatedAssetTreatmentAssumptions(profileChangeFields);
assert.equal(profileChangedValidation.error, undefined);
assert.equal(
  profileChangedValidation.value.assets.cashAndCashEquivalents.assumedAnnualGrowthRatePercent,
  1,
  "taxonomy-seeded saved-only growth defaults should re-seed from the selected Asset Treatment profile"
);
assert.equal(
  profileChangedValidation.value.assets.cashAndCashEquivalents.assumedAnnualGrowthRateProfile,
  "conservative"
);

const advisorFields = createTreatmentFields(savedAssumptions, "conservative");
const advisorValidation = harness.readValidatedAssetTreatmentAssumptions(advisorFields);
assert.equal(advisorValidation.error, undefined);
assert.equal(
  advisorValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent,
  7.25,
  "advisor/custom saved growth values should be preserved through save validation"
);
assert.equal(advisorValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateProfile, "custom");
assert.equal(advisorValidation.value.assets.taxableBrokerageInvestments.growthConsumptionStatus, "saved-only");

assert.equal(taxonomyCategories.get("qualifiedAnnuities").growthAssumptionStatus, "review-only");
assert.equal(taxonomyCategories.get("qualifiedAnnuities").growthReviewRequired, true);
assert.equal(taxonomyCategories.get("digitalAssetsCrypto").growthAssumptionStatus, "review-only");
assert.equal(taxonomyCategories.get("otherCustomAsset").growthAssumptionStatus, "review-only");

[
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /assumedAnnualGrowthRatePercent|assumedAnnualGrowthRateSource|growthConsumptionStatus/,
    `${relativePath} should not consume or render saved asset growth shape`
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

const allowedDirtyPaths = new Set([
  "life-insurance-planner/components.css",
  "life-insurance-planner/pages/analysis-setup.html",
  "life-insurance-planner/app/features/lens-analysis/analysis-setup.js",
  "life-insurance-planner/checks/lens-analysis/asset-growth-defaults-metadata-check.js",
  "life-insurance-planner/checks/lens-analysis/asset-growth-ui-saved-only-check.js",
  "life-insurance-planner/checks/lens-analysis/asset-growth-saved-shape-check.js"
]);
const unexpectedDirtyPaths = getDirtyPaths().filter(function (dirtyPath) {
  return !allowedDirtyPaths.has(dirtyPath);
});
assert.deepEqual(
  unexpectedDirtyPaths,
  [],
  "this pass should only change saved-only Asset Treatment growth UI, wiring, and focused checks"
);

console.log("asset-growth-saved-shape-check passed");
