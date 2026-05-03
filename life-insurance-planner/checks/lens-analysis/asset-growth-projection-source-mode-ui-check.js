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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getSection(html, startNeedle, endNeedle) {
  const startIndex = html.indexOf(startNeedle);
  assert.ok(startIndex >= 0, `${startNeedle} should exist`);
  const endIndex = endNeedle ? html.indexOf(endNeedle, startIndex + startNeedle.length) : -1;
  return html.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    [
      "  LensApp.__assetGrowthProjectionSourceModeUiHarness = {",
      "    populateAssetTreatmentFields,",
      "    readValidatedAssetTreatmentAssumptions",
      "  };",
      "  LensApp.analysisSetup = Object.assign"
    ].join("\n")
  );

  assert.notEqual(instrumentedSource, source, "analysis-setup harness injection should find the export seam");

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

function createTreatmentFields(assumptions) {
  return {
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
    assetGrowthProjection: {
      mode: createField(""),
      projectionYears: createField("")
    },
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
}

function createAssetAssumption(overrides) {
  return Object.assign({
    include: true,
    treatmentPreset: "custom",
    taxTreatment: "no-tax-drag",
    taxDragPercent: 0,
    liquidityHaircutPercent: 0,
    assumedAnnualGrowthRatePercent: 6,
    assumedAnnualGrowthRateSource: "advisor",
    assumedAnnualGrowthRateProfile: "custom",
    growthConsumptionStatus: "saved-only"
  }, overrides || {});
}

function createAssetTreatmentAssumptions(sourceMode) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "asset-growth-projection-source-mode-ui-check",
    assetGrowthProjectionAssumptions: Object.assign({
      mode: "currentDollarOnly",
      projectionYears: 0,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    }, sourceMode || {}),
    assets: {
      cashAndCashEquivalents: createAssetAssumption({
        assumedAnnualGrowthRatePercent: 2,
        treatmentPreset: "cash-like"
      }),
      taxableBrokerageInvestments: createAssetAssumption({
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 5
      })
    },
    customAssets: []
  };
}

function createSourceData() {
  return {
    cashAndCashEquivalents: 100000,
    taxableBrokerageInvestments: 200000,
    annualIncome: 120000,
    spouseIncome: 40000,
    yearsIncomeNeeded: 10,
    currentCoverage: 250000
  };
}

function buildLensModel(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const sourceData = createSourceData();
  const analysisSettings = {
    valuationDate: "2026-05-03",
    assetTreatmentAssumptions
  };
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord: {}
  });

  assert.ok(result.lensModel, "Lens model should build");
  return result.lensModel;
}

function createMethodOutputs(context, assetTreatmentAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const lensModel = buildLensModel(context, assetTreatmentAssumptions);
  const settings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings: {
      assetTreatmentAssumptions
    },
    lensModel
  });

  return {
    treatedAssetOffsets: lensModel.treatedAssetOffsets,
    projectedAssetGrowth: lensModel.projectedAssetGrowth,
    dime: lensAnalysis.analysisMethods.runDimeAnalysis(lensModel, settings.dimeSettings),
    needs: lensAnalysis.analysisMethods.runNeedsAnalysis(lensModel, settings.needsAnalysisSettings),
    hlv: lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(
      lensModel,
      settings.humanLifeValueSettings
    )
  };
}

const html = readRepoFile("pages/analysis-setup.html");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const componentsCss = readRepoFile("components.css");
const assetTreatmentSection = getSection(
  html,
  'id="analysis-setup-asset-treatment"',
  'id="analysis-setup-existing-coverage-treatment"'
);
const growthReturnSection = getSection(
  html,
  'id="analysis-setup-growth-return"',
  'id="analysis-setup-policy-returns"'
);

assert.match(assetTreatmentSection, /data-analysis-asset-growth-projection-controls/);
assert.match(assetTreatmentSection, /data-analysis-asset-growth-projection-mode/);
assert.match(assetTreatmentSection, /data-analysis-asset-growth-projection-years/);
assert.doesNotMatch(growthReturnSection, /data-analysis-asset-growth-projection-/);
assert.match(assetTreatmentSection, /Projection mode is saved for future reporting\/modeling/i);
assert.match(assetTreatmentSection, /Current asset offsets remain current-dollar\/current treatment based/i);
assert.match(assetTreatmentSection, /Projected asset values do not affect DIME, Needs, or HLV outputs yet/i);
assert.match(assetTreatmentSection, /Emergency reserves, liquidity, and source-mode rules must be reviewed/i);
assert.match(assetTreatmentSection, /Current-dollar only/);
assert.match(assetTreatmentSection, /Reporting only/);
assert.match(assetTreatmentSection, /Projected offsets - future \/ inactive/);
assert.match(assetTreatmentSection, /<option value="projectedOffsets" disabled>/);
assert.doesNotMatch(`${html}\n${analysisSetupSource}\n${componentsCss}`, /Predicted annual growth/i);
assert.match(componentsCss, /analysis-setup-asset-growth-projection-controls/);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const harness = setupContext.LensApp.__assetGrowthProjectionSourceModeUiHarness;
assert.equal(typeof analysisSetup.getAssetTreatmentAssumptions, "function");
assert.equal(typeof harness.populateAssetTreatmentFields, "function");
assert.equal(typeof harness.readValidatedAssetTreatmentAssumptions, "function");

const savedReportingAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: createAssetTreatmentAssumptions({
      mode: "reportingOnly",
      projectionYears: 22
    })
  }
});
const reportingFields = createTreatmentFields(savedReportingAssumptions);
harness.populateAssetTreatmentFields(reportingFields, savedReportingAssumptions, {});
assert.equal(reportingFields.assetGrowthProjection.mode.value, "reportingOnly");
assert.equal(reportingFields.assetGrowthProjection.projectionYears.value, "22");
reportingFields.assetGrowthProjection.mode.value = "projectedOffsets";
reportingFields.assetGrowthProjection.projectionYears.value = "45";
const savedProjectedOffsets = harness.readValidatedAssetTreatmentAssumptions(reportingFields).value;
assert.deepEqual(cloneJson(savedProjectedOffsets.assetGrowthProjectionAssumptions), {
  mode: "projectedOffsets",
  projectionYears: 45,
  projectionYearsSource: "analysis-setup",
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

reportingFields.assetGrowthProjection.mode.value = "not-valid";
reportingFields.assetGrowthProjection.projectionYears.value = "90";
const clampedHigh = harness.readValidatedAssetTreatmentAssumptions(reportingFields).value;
assert.deepEqual(cloneJson(clampedHigh.assetGrowthProjectionAssumptions), {
  mode: "currentDollarOnly",
  projectionYears: 60,
  projectionYearsSource: "analysis-setup",
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

reportingFields.assetGrowthProjection.mode.value = "reportingOnly";
reportingFields.assetGrowthProjection.projectionYears.value = "-10";
assert.equal(
  harness.readValidatedAssetTreatmentAssumptions(reportingFields).value
    .assetGrowthProjectionAssumptions.projectionYears,
  0,
  "negative projection years should clamp to 0"
);

reportingFields.assetGrowthProjection.projectionYears.value = "not-a-number";
assert.equal(
  harness.readValidatedAssetTreatmentAssumptions(reportingFields).value
    .assetGrowthProjectionAssumptions.projectionYears,
  0,
  "non-finite projection years should default to 0"
);

const analysisContext = createLensAnalysisContext();
const baseOutputs = createMethodOutputs(
  analysisContext,
  createAssetTreatmentAssumptions({
    mode: "currentDollarOnly",
    projectionYears: 0
  })
);
const reportingOutputs = createMethodOutputs(
  analysisContext,
  createAssetTreatmentAssumptions({
    mode: "reportingOnly",
    projectionYears: 40
  })
);
const projectedOffsetsOutputs = createMethodOutputs(
  analysisContext,
  createAssetTreatmentAssumptions({
    mode: "projectedOffsets",
    projectionYears: 40
  })
);

assert.equal(baseOutputs.projectedAssetGrowth.consumedByMethods, false);
assert.equal(reportingOutputs.projectedAssetGrowth.consumedByMethods, false);
assert.equal(projectedOffsetsOutputs.projectedAssetGrowth.consumedByMethods, false);
assert.deepEqual(cloneJson(reportingOutputs.treatedAssetOffsets), cloneJson(baseOutputs.treatedAssetOffsets));
assert.deepEqual(cloneJson(projectedOffsetsOutputs.treatedAssetOffsets), cloneJson(baseOutputs.treatedAssetOffsets));
assert.deepEqual(cloneJson(reportingOutputs.dime), cloneJson(baseOutputs.dime));
assert.deepEqual(cloneJson(projectedOffsetsOutputs.dime), cloneJson(baseOutputs.dime));
assert.deepEqual(cloneJson(reportingOutputs.needs), cloneJson(baseOutputs.needs));
assert.deepEqual(cloneJson(projectedOffsetsOutputs.needs), cloneJson(baseOutputs.needs));
assert.deepEqual(cloneJson(reportingOutputs.hlv), cloneJson(baseOutputs.hlv));
assert.deepEqual(cloneJson(projectedOffsetsOutputs.hlv), cloneJson(baseOutputs.hlv));

[
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/asset-treatment-calculations.js"
].forEach(function (relativePath) {
  assert.doesNotMatch(
    readRepoFile(relativePath),
    /assetGrowthProjectionAssumptions/,
    `${relativePath} should not consume or render asset growth projection source-mode assumptions`
  );
});

console.log("asset-growth-projection-source-mode-ui-check passed");
