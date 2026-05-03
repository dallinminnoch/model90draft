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

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    "  LensApp.__assetGrowthProjectionSourceModeHarness = { readValidatedAssetTreatmentAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );

  assert.notEqual(
    instrumentedSource,
    source,
    "analysis-setup harness injection should find the export seam"
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

function makeRecord(assetTreatmentAssumptions) {
  return {
    analysisSettings: {
      assetTreatmentAssumptions
    }
  };
}

function getProjectionAssumptions(analysisSetup, savedProjectionAssumptions) {
  const assumptions = analysisSetup.getAssetTreatmentAssumptions(makeRecord({
    assetGrowthProjectionAssumptions: savedProjectionAssumptions
  }));
  return assumptions.assetGrowthProjectionAssumptions;
}

function createTreatmentFields(assumptions, profile) {
  const assets = assumptions.assets || {};
  const fields = {
    defaultProfile: profile || assumptions.defaultProfile || "balanced",
    defaultProfileButtons: [],
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

function createAssetAssumption(rate, overrides) {
  return Object.assign({
    include: true,
    treatmentPreset: "custom",
    taxTreatment: "no-tax-drag",
    taxDragPercent: 0,
    liquidityHaircutPercent: 0,
    assumedAnnualGrowthRatePercent: rate,
    assumedAnnualGrowthRateSource: "advisor",
    assumedAnnualGrowthRateProfile: "custom",
    growthConsumptionStatus: "saved-only"
  }, overrides || {});
}

function createAssetTreatmentAssumptions(sourceMode) {
  const projectionAssumptions = Object.assign({
    mode: "currentDollarOnly",
    projectionYears: 0,
    projectionYearsSource: "analysis-setup",
    source: "analysis-setup",
    consumptionStatus: "saved-only"
  }, sourceMode || {});

  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "asset-growth-projection-source-mode-check",
    assetGrowthProjectionAssumptions: projectionAssumptions,
    assets: {
      cashAndCashEquivalents: createAssetAssumption(2, {
        treatmentPreset: "cash-like"
      }),
      taxableBrokerageInvestments: createAssetAssumption(6, {
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
  const sourceDataBefore = cloneJson(sourceData);
  const assumptionsBefore = cloneJson(assetTreatmentAssumptions);
  const result = lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData,
    analysisSettings,
    profileRecord: {}
  });

  assert.deepEqual(sourceData, sourceDataBefore, "model prep should not mutate sourceData");
  assert.deepEqual(
    assetTreatmentAssumptions,
    assumptionsBefore,
    "model prep should not mutate assetTreatmentAssumptions"
  );
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
    ),
    settings
  };
}

function getWarningByCode(warnings, code) {
  return (Array.isArray(warnings) ? warnings : []).find(function (warning) {
    return warning && warning.code === code;
  });
}

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const harness = setupContext.LensApp.__assetGrowthProjectionSourceModeHarness;

assert.equal(typeof analysisSetup.getAssetTreatmentAssumptions, "function");
assert.equal(typeof harness.readValidatedAssetTreatmentAssumptions, "function");

const defaultAssumptions = analysisSetup.getAssetTreatmentAssumptions({});
assert.deepEqual(cloneJson(defaultAssumptions.assetGrowthProjectionAssumptions), {
  mode: "currentDollarOnly",
  projectionYears: 0,
  projectionYearsSource: "analysis-setup",
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

assert.deepEqual(
  cloneJson(getProjectionAssumptions(analysisSetup, {
    mode: "reportingOnly",
    projectionYears: 24.5,
    projectionYearsSource: "external",
    source: "external",
    consumptionStatus: "method-active"
  })),
  {
    mode: "reportingOnly",
    projectionYears: 24.5,
    projectionYearsSource: "analysis-setup",
    source: "analysis-setup",
    consumptionStatus: "saved-only"
  },
  "valid reportingOnly source-mode values should preserve while ownership metadata stays saved-only"
);

assert.deepEqual(
  cloneJson(getProjectionAssumptions(analysisSetup, {
    mode: "projectedOffsets",
    projectionYears: 30,
    consumptionStatus: "method-active"
  })),
  {
    mode: "projectedOffsets",
    projectionYears: 30,
    projectionYearsSource: "analysis-setup",
    source: "analysis-setup",
    consumptionStatus: "saved-only"
  },
  "projectedOffsets should be preserved as a saved enum without method activation"
);

assert.equal(
  getProjectionAssumptions(analysisSetup, { mode: "activeNow", projectionYears: 15 }).mode,
  "currentDollarOnly",
  "invalid source mode should default to currentDollarOnly"
);
assert.equal(
  getProjectionAssumptions(analysisSetup, { mode: "reportingOnly" }).projectionYears,
  0,
  "missing projectionYears should default to 0"
);
assert.equal(
  getProjectionAssumptions(analysisSetup, { mode: "reportingOnly", projectionYears: "not-a-number" }).projectionYears,
  0,
  "non-finite projectionYears should default to 0"
);
assert.equal(
  getProjectionAssumptions(analysisSetup, { mode: "reportingOnly", projectionYears: -5 }).projectionYears,
  0,
  "negative finite projectionYears should clamp to 0"
);
assert.equal(
  getProjectionAssumptions(analysisSetup, { mode: "reportingOnly", projectionYears: 90 }).projectionYears,
  60,
  "projectionYears over 60 should clamp to 60"
);

const savedReportingAssumptions = analysisSetup.getAssetTreatmentAssumptions(makeRecord(
  createAssetTreatmentAssumptions({
    mode: "reportingOnly",
    projectionYears: 18
  })
));
const savedReportingResult = harness.readValidatedAssetTreatmentAssumptions(
  createTreatmentFields(savedReportingAssumptions)
);
assert.ok(savedReportingResult.value, "save validation should return normalized asset treatment assumptions");
assert.deepEqual(cloneJson(savedReportingResult.value.assetGrowthProjectionAssumptions), {
  mode: "reportingOnly",
  projectionYears: 18,
  projectionYearsSource: "analysis-setup",
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

const savedProjectedOffsetsAssumptions = analysisSetup.getAssetTreatmentAssumptions(makeRecord(
  createAssetTreatmentAssumptions({
    mode: "projectedOffsets",
    projectionYears: 75,
    consumptionStatus: "method-active"
  })
));
const savedProjectedOffsetsResult = harness.readValidatedAssetTreatmentAssumptions(
  createTreatmentFields(savedProjectedOffsetsAssumptions)
);
assert.deepEqual(cloneJson(savedProjectedOffsetsResult.value.assetGrowthProjectionAssumptions), {
  mode: "projectedOffsets",
  projectionYears: 60,
  projectionYearsSource: "analysis-setup",
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
assert.match(
  analysisSetupHtml,
  /data-analysis-asset-growth-projection-controls/,
  "analysis-setup.html should expose the saved-only projection source-mode controls"
);
assert.match(
  analysisSetupHtml,
  /Projected offsets - future \/ inactive/,
  "projectedOffsets should be visibly future/inactive when offered"
);
assert.doesNotMatch(
  readRepoFile("components.css"),
  /projected offsets.*method-active|method-active.*projected offsets/i,
  "CSS should not imply asset growth source-mode controls are method-active"
);

[
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/asset-treatment-calculations.js"
].forEach(function (relativePath) {
  const source = readRepoFile(relativePath);
  assert.doesNotMatch(
    source,
    /assetGrowthProjectionAssumptions/,
    `${relativePath} should not consume or render asset growth projection source-mode assumptions`
  );
});
assert.match(
  readRepoFile("app/features/lens-analysis/lens-model-builder.js"),
  /assetGrowthProjectionAssumptions/,
  "lens-model-builder should read source-mode assumptions for reporting-only projectedAssetGrowth model prep"
);

const analysisContext = createLensAnalysisContext();
const currentDollarOutputs = createMethodOutputs(
  analysisContext,
  createAssetTreatmentAssumptions({
    mode: "currentDollarOnly",
    projectionYears: 0
  })
);
const reportingOnlyOutputs = createMethodOutputs(
  analysisContext,
  createAssetTreatmentAssumptions({
    mode: "reportingOnly",
    projectionYears: 45
  })
);
const projectedOffsetsOutputs = createMethodOutputs(
  analysisContext,
  createAssetTreatmentAssumptions({
    mode: "projectedOffsets",
    projectionYears: 45,
    consumptionStatus: "method-active"
  })
);

assert.equal(currentDollarOutputs.projectedAssetGrowth.consumedByMethods, false);
assert.equal(reportingOnlyOutputs.projectedAssetGrowth.consumedByMethods, false);
assert.equal(projectedOffsetsOutputs.projectedAssetGrowth.consumedByMethods, false);
assert.equal(currentDollarOutputs.projectedAssetGrowth.projectionYears, 0);
assert.equal(reportingOnlyOutputs.projectedAssetGrowth.projectionYears, 45);
assert.equal(projectedOffsetsOutputs.projectedAssetGrowth.projectionYears, 0);
assert.equal(
  reportingOnlyOutputs.projectedAssetGrowth.projectionYearsSource,
  "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.projectionYears",
  "reportingOnly should use saved projection years in model prep"
);
assert.equal(
  projectedOffsetsOutputs.projectedAssetGrowth.projectionYearsSource,
  "assetGrowthProjectionAssumptions.projectedOffsets-future-inactive",
  "projectedOffsets must remain future/inactive in model prep"
);
assert.equal(reportingOnlyOutputs.projectedAssetGrowth.sourceMode, "reportingOnly");
assert.equal(reportingOnlyOutputs.projectedAssetGrowth.projectionMode, "reportingOnly");
assert.ok(
  reportingOnlyOutputs.projectedAssetGrowth.projectedTotalAssetValue
    > reportingOnlyOutputs.projectedAssetGrowth.currentTotalAssetValue,
  "reportingOnly projected totals can differ from current totals"
);
assert.equal(projectedOffsetsOutputs.projectedAssetGrowth.sourceMode, "projectedOffsets");
assert.equal(projectedOffsetsOutputs.projectedAssetGrowth.projectionMode, "projectedOffsetsFutureInactive");
assert.ok(
  getWarningByCode(
    projectedOffsetsOutputs.projectedAssetGrowth.warnings,
    "asset-growth-projected-offsets-future-inactive"
  ),
  "projectedOffsets should carry a future/inactive warning"
);

assert.deepEqual(
  cloneJson(reportingOnlyOutputs.treatedAssetOffsets),
  cloneJson(currentDollarOutputs.treatedAssetOffsets),
  "reportingOnly source-mode values should not change treated asset offsets"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.treatedAssetOffsets),
  cloneJson(currentDollarOutputs.treatedAssetOffsets),
  "projectedOffsets source-mode values should not change treated asset offsets"
);
assert.deepEqual(
  cloneJson(reportingOnlyOutputs.dime),
  cloneJson(currentDollarOutputs.dime),
  "reportingOnly source-mode values should not change DIME output"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.dime),
  cloneJson(currentDollarOutputs.dime),
  "projectedOffsets source-mode values should not change DIME output"
);
assert.deepEqual(
  cloneJson(reportingOnlyOutputs.needs),
  cloneJson(currentDollarOutputs.needs),
  "reportingOnly source-mode values should not change Needs output"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.needs),
  cloneJson(currentDollarOutputs.needs),
  "projectedOffsets source-mode values should not change Needs output"
);
assert.deepEqual(
  cloneJson(reportingOnlyOutputs.hlv),
  cloneJson(currentDollarOutputs.hlv),
  "reportingOnly source-mode values should not change HLV output"
);
assert.deepEqual(
  cloneJson(projectedOffsetsOutputs.hlv),
  cloneJson(currentDollarOutputs.hlv),
  "projectedOffsets source-mode values should not change HLV output"
);

[
  reportingOnlyOutputs.settings,
  projectedOffsetsOutputs.settings
].forEach(function (settings) {
  assert.doesNotMatch(
    JSON.stringify(settings),
    /assetGrowthProjectionAssumptions|projectedOffsets|reportingOnly/,
    "method settings should not receive asset growth projection source-mode assumptions"
  );
});

console.log("asset-growth-projection-source-mode-check passed");
