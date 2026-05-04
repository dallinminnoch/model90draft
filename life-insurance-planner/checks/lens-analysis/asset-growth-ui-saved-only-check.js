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
    [
      "  LensApp.__assetGrowthUiHarness = {",
      "    applyAssetTreatmentProfile,",
      "    populateAssetTreatmentFields,",
      "    readValidatedAssetTreatmentAssumptions",
      "  };",
      "  LensApp.analysisSetup = Object.assign"
    ].join("\n")
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

function isStrictDiffGuardEnabled() {
  return process.env.ASSET_GROWTH_STRICT_DIFF_GUARD === "1";
}

function createField(value) {
  return {
    value: String(value ?? ""),
    dataset: {},
    disabled: false,
    style: {
      values: {},
      setProperty(name, nextValue) {
        this.values[name] = nextValue;
      }
    }
  };
}

function createButton(profile) {
  return {
    dataset: {},
    disabled: false,
    attributes: {
      "data-analysis-asset-default-profile": profile
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}

function addField(fields, groupName, categoryKey, field) {
  fields[groupName][categoryKey] = field;
  fields.fieldLists[groupName][categoryKey] = [field];
}

function createTreatmentFields(assumptions) {
  const fields = {
    defaultProfile: assumptions.defaultProfile || "balanced",
    defaultProfileButtons: ["conservative", "balanced", "aggressive", "custom"].map(createButton),
    include: {},
    growth: {},
    growthSlider: {},
    preset: {},
    taxTreatment: {},
    tax: {},
    haircut: {},
    preview: {},
    fieldLists: {
      include: {},
      growth: {},
      growthSlider: {},
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

  Object.keys(assumptions.assets || {}).forEach(function (categoryKey) {
    const asset = assumptions.assets[categoryKey];
    const growthField = createField(asset.assumedAnnualGrowthRatePercent);
    const growthSlider = createField(asset.assumedAnnualGrowthRatePercent);
    growthSlider.min = "0";
    growthSlider.max = "12";
    growthField.dataset.analysisAssetGrowthSource = asset.assumedAnnualGrowthRateSource || "taxonomy-default";
    growthField.dataset.analysisAssetGrowthProfile = asset.assumedAnnualGrowthRateProfile || assumptions.defaultProfile;
    growthSlider.dataset.analysisAssetGrowthSource = growthField.dataset.analysisAssetGrowthSource;
    growthSlider.dataset.analysisAssetGrowthProfile = growthField.dataset.analysisAssetGrowthProfile;

    addField(fields, "include", categoryKey, { checked: asset.include === true, disabled: false });
    addField(fields, "growth", categoryKey, growthField);
    addField(fields, "growthSlider", categoryKey, growthSlider);
    addField(fields, "preset", categoryKey, createField(asset.treatmentPreset || "custom"));
    addField(fields, "taxTreatment", categoryKey, { textContent: "", disabled: false });
    addField(fields, "tax", categoryKey, createField(asset.taxDragPercent ?? 0));
    addField(fields, "haircut", categoryKey, createField(asset.liquidityHaircutPercent ?? 0));
  });

  return fields;
}

function createAssetTreatmentAssumptions(growthRate) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "asset-growth-ui-saved-only-check",
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

const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const componentsCss = readRepoFile("components.css");

assert.match(analysisSetupHtml, /Assumed annual growth/);
assert.doesNotMatch(`${analysisSetupHtml}\n${analysisSetupSource}\n${componentsCss}`, /Predicted annual growth/i);
assert.match(analysisSetupHtml, /assumption, not a prediction/i);
assert.match(analysisSetupHtml, /saved for future projected asset treatment/i);
assert.match(analysisSetupHtml, /current DIME, LENS, and HLV outputs are unaffected/i);
assert.match(analysisSetupHtml, /current asset offsets remain current-dollar\/current treatment based/i);
assert.match(analysisSetupHtml, /Review-only categories need advisor judgment/i);
assert.match(analysisSetupHtml, /<span role="columnheader">Assumed annual growth<\/span>/);
assert.match(analysisSetupSource, /data-analysis-asset-treatment-growth="/);
assert.match(analysisSetupSource, /data-analysis-asset-treatment-growth-slider="/);
assert.match(analysisSetupSource, /MIN_ASSET_GROWTH_RATE_PERCENT/);
assert.match(analysisSetupSource, /MAX_ASSET_GROWTH_RATE_PERCENT/);
assert.match(analysisSetupSource, /step="0\.25"/);
assert.match(componentsCss, /analysis-setup-asset-growth-control/);
assert.match(componentsCss, /grid-template-columns:\s*minmax\(7\.2rem,[^;]+minmax\(5\.9rem/s);
assert.match(componentsCss, /overflow-x:\s*auto/);
assert.doesNotMatch(analysisSetupSource, /asset growth method-active|projected asset value/i);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const harness = setupContext.LensApp.__assetGrowthUiHarness;

assert.equal(typeof harness.populateAssetTreatmentFields, "function");
assert.equal(typeof harness.readValidatedAssetTreatmentAssumptions, "function");
assert.equal(typeof harness.applyAssetTreatmentProfile, "function");

const savedAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: {
      defaultProfile: "balanced",
      assets: {
        taxableBrokerageInvestments: {
          include: true,
          treatmentPreset: "step-up-investment",
          taxDragPercent: 0,
          liquidityHaircutPercent: 5,
          assumedAnnualGrowthRatePercent: 7.25,
          assumedAnnualGrowthRateSource: "advisor",
          assumedAnnualGrowthRateProfile: "custom"
        }
      }
    }
  }
});
const loadedFields = createTreatmentFields(savedAssumptions);
harness.populateAssetTreatmentFields(loadedFields, savedAssumptions, {});
assert.equal(loadedFields.growth.taxableBrokerageInvestments.value, "7.25");
assert.equal(loadedFields.growthSlider.taxableBrokerageInvestments.value, "7.25");
assert.equal(loadedFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthSource, "advisor");
assert.equal(loadedFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthProfile, "custom");

loadedFields.growth.taxableBrokerageInvestments.value = "8.5";
loadedFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthSource = "advisor";
loadedFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthProfile = "custom";
const editedValidation = harness.readValidatedAssetTreatmentAssumptions(loadedFields);
assert.equal(editedValidation.error, undefined);
assert.equal(editedValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 8.5);
assert.equal(editedValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateSource, "advisor");
assert.equal(editedValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateProfile, "custom");
assert.equal(editedValidation.value.assets.taxableBrokerageInvestments.growthConsumptionStatus, "saved-only");

const reloadedFields = createTreatmentFields(editedValidation.value);
harness.populateAssetTreatmentFields(reloadedFields, editedValidation.value, {});
assert.equal(reloadedFields.growth.taxableBrokerageInvestments.value, "8.5");

const highValidationFields = createTreatmentFields(savedAssumptions);
highValidationFields.growth.taxableBrokerageInvestments.value = "99";
highValidationFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthSource = "advisor";
const highValidation = harness.readValidatedAssetTreatmentAssumptions(highValidationFields);
assert.equal(highValidation.error, undefined);
assert.equal(highValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 12);

const lowValidationFields = createTreatmentFields(savedAssumptions);
lowValidationFields.growth.taxableBrokerageInvestments.value = "-4";
lowValidationFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthSource = "advisor";
const lowValidation = harness.readValidatedAssetTreatmentAssumptions(lowValidationFields);
assert.equal(lowValidation.error, undefined);
assert.equal(lowValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 0);

const profileFields = createTreatmentFields(savedAssumptions);
harness.applyAssetTreatmentProfile(profileFields, "conservative", {});
assert.equal(profileFields.growth.taxableBrokerageInvestments.value, "4");
assert.equal(profileFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthSource, "taxonomy-default");
assert.equal(profileFields.growth.taxableBrokerageInvestments.dataset.analysisAssetGrowthProfile, "conservative");
const profileValidation = harness.readValidatedAssetTreatmentAssumptions(profileFields);
assert.equal(profileValidation.error, undefined);
assert.equal(profileValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRatePercent, 4);
assert.equal(profileValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateSource, "taxonomy-default");
assert.equal(profileValidation.value.assets.taxableBrokerageInvestments.assumedAnnualGrowthRateProfile, "conservative");
assert.equal(profileValidation.value.assets.taxableBrokerageInvestments.growthConsumptionStatus, "saved-only");

[
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/analysis-methods.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /assumedAnnualGrowthRatePercent|assumedAnnualGrowthRateSource|growthConsumptionStatus|Assumed annual growth/,
    `${relativePath} should not consume or render saved-only asset growth`
  );
});

const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.match(
  stepThreeSource,
  /Projected Asset Growth/,
  "Step 3 may render saved-only asset growth as reporting-only display"
);
assert.doesNotMatch(
  stepThreeSource,
  /calculateAssetGrowthProjection|asset-growth-projection-calculations|assetGrowthProjectionAssumptions/,
  "Step 3 should render prepared projectedAssetGrowth only, without helper calls or source-mode ownership"
);

const outputContext = createLensAnalysisContext();
const baseOutputs = createMethodOutputs(outputContext, createAssetTreatmentAssumptions(2));
const changedOutputs = createMethodOutputs(outputContext, createAssetTreatmentAssumptions(11));
assert.deepEqual(
  cloneJson(changedOutputs),
  cloneJson(baseOutputs),
  "changing saved-only asset growth controls should not change treated offsets or DIME/Needs/HLV outputs"
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

console.log("asset-growth-ui-saved-only-check passed");
