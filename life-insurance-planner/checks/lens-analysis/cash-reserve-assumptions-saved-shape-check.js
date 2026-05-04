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
    "  LensApp.__cashReserveAssumptionsHarness = { readValidatedAssetTreatmentAssumptions };\n  LensApp.analysisSetup = Object.assign"
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

function getAssetTreatmentAssumptions(analysisSetup, savedAssumptions) {
  return analysisSetup.getAssetTreatmentAssumptions(makeRecord(savedAssumptions));
}

function createMinimalAssetTreatmentFields(assumptions) {
  return {
    defaultProfile: assumptions.defaultProfile || "balanced",
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
}

function createAssetAssumption(rate, overrides) {
  return Object.assign({
    include: true,
    treatmentPreset: "cash-like",
    taxTreatment: "no-tax-drag",
    taxDragPercent: 0,
    liquidityHaircutPercent: 0,
    assumedAnnualGrowthRatePercent: rate,
    assumedAnnualGrowthRateSource: "advisor",
    assumedAnnualGrowthRateProfile: "custom",
    growthConsumptionStatus: "saved-only"
  }, overrides || {});
}

function createAssetTreatmentAssumptions(cashReserveAssumptions) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "cash-reserve-assumptions-saved-shape-check",
    assetGrowthProjectionAssumptions: {
      mode: "reportingOnly",
      projectionYears: 10,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    },
    cashReserveAssumptions,
    assets: {
      cashAndCashEquivalents: createAssetAssumption(2),
      emergencyFund: createAssetAssumption(0.5)
    },
    customAssets: []
  };
}

function createSourceData() {
  return {
    cashAndCashEquivalents: 100000,
    emergencyFund: 30000,
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
    cloneJson(assetTreatmentAssumptions),
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
    )
  };
}

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const readValidatedAssetTreatmentAssumptions = setupContext.LensApp
  .__cashReserveAssumptionsHarness
  .readValidatedAssetTreatmentAssumptions;

assert.ok(analysisSetup.DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.cashReserveAssumptions);

const defaultAssumptions = getAssetTreatmentAssumptions(analysisSetup, {});
assert.deepEqual(cloneJson(defaultAssumptions.cashReserveAssumptions), {
  enabled: false,
  mode: "reportingOnly",
  reserveMethod: "monthsOfEssentialExpenses",
  reserveMonths: 6,
  fixedReserveAmount: 0,
  expenseBasis: "essentialSupport",
  applyToAssetScope: "cashAndCashEquivalents",
  excludeEmergencyFundAssets: true,
  includeHealthcareExpenses: false,
  includeDiscretionaryExpenses: false,
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

const validFutureShape = {
  enabled: true,
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  reserveMonths: 12,
  fixedReserveAmount: 50000,
  expenseBasis: "essentialPlusHealthcareAndDiscretionary",
  applyToAssetScope: "selectedAssetsFuture",
  excludeEmergencyFundAssets: false,
  includeHealthcareExpenses: true,
  includeDiscretionaryExpenses: true,
  source: "external",
  consumptionStatus: "method-active"
};
const preservedAssumptions = getAssetTreatmentAssumptions(
  analysisSetup,
  createAssetTreatmentAssumptions(validFutureShape)
).cashReserveAssumptions;
assert.deepEqual(cloneJson(preservedAssumptions), {
  enabled: true,
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  reserveMonths: 12,
  fixedReserveAmount: 50000,
  expenseBasis: "essentialPlusHealthcareAndDiscretionary",
  applyToAssetScope: "selectedAssetsFuture",
  excludeEmergencyFundAssets: false,
  includeHealthcareExpenses: true,
  includeDiscretionaryExpenses: true,
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

const reportingFutureShape = getAssetTreatmentAssumptions(
  analysisSetup,
  createAssetTreatmentAssumptions({
    mode: "reportingOnly",
    reserveMethod: "monthsOfEssentialExpenses",
    reserveMonths: 24,
    fixedReserveAmount: 10000000,
    expenseBasis: "essentialPlusHealthcare",
    applyToAssetScope: "liquidAssetsFuture"
  })
).cashReserveAssumptions;
assert.equal(reportingFutureShape.mode, "reportingOnly");
assert.equal(reportingFutureShape.reserveMethod, "monthsOfEssentialExpenses");
assert.equal(reportingFutureShape.expenseBasis, "essentialPlusHealthcare");
assert.equal(reportingFutureShape.applyToAssetScope, "liquidAssetsFuture");

const invalidAssumptions = getAssetTreatmentAssumptions(
  analysisSetup,
  createAssetTreatmentAssumptions({
    enabled: "yes",
    mode: "active-now",
    reserveMethod: "bad-method",
    reserveMonths: 99,
    fixedReserveAmount: -200,
    expenseBasis: "totalEverything",
    applyToAssetScope: "allAssets",
    excludeEmergencyFundAssets: "no",
    includeHealthcareExpenses: "yes",
    includeDiscretionaryExpenses: "yes",
    source: "external",
    consumptionStatus: "active"
  })
).cashReserveAssumptions;
assert.deepEqual(cloneJson(invalidAssumptions), {
  enabled: false,
  mode: "reportingOnly",
  reserveMethod: "monthsOfEssentialExpenses",
  reserveMonths: 24,
  fixedReserveAmount: 0,
  expenseBasis: "essentialSupport",
  applyToAssetScope: "cashAndCashEquivalents",
  excludeEmergencyFundAssets: true,
  includeHealthcareExpenses: false,
  includeDiscretionaryExpenses: false,
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

const missingNumberDefaults = getAssetTreatmentAssumptions(
  analysisSetup,
  createAssetTreatmentAssumptions({
    reserveMonths: "",
    fixedReserveAmount: "not-a-number"
  })
).cashReserveAssumptions;
assert.equal(missingNumberDefaults.reserveMonths, 6);
assert.equal(missingNumberDefaults.fixedReserveAmount, 0);

const savedFieldsResult = readValidatedAssetTreatmentAssumptions(
  createMinimalAssetTreatmentFields(
    getAssetTreatmentAssumptions(
      analysisSetup,
      createAssetTreatmentAssumptions(validFutureShape)
    )
  )
);
assert.ok(!savedFieldsResult.error, savedFieldsResult.error);
assert.equal(savedFieldsResult.value.cashReserveAssumptions.mode, "methodActiveFuture");
assert.equal(savedFieldsResult.value.cashReserveAssumptions.consumptionStatus, "saved-only");
assert.equal(savedFieldsResult.value.cashReserveAssumptions.source, "analysis-setup");

const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
assert.match(
  analysisSetupHtml,
  /data-analysis-cash-reserve-controls|Cash Reserve Assumptions/i,
  "Visible cash reserve controls may exist, but saved-shape behavior should remain normalized and output-neutral"
);

[
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/asset-growth-projection-calculations.js",
  "app/features/lens-analysis/analysis-methods.js"
].forEach(function (relativePath) {
  assert.doesNotMatch(
    readRepoFile(relativePath),
    /\bcashReserveAssumptions\b|\bcashReserve\b|\breserve-adjusted\b|\breserveAdjusted\b/i,
    `${relativePath} should not consume or render cash reserve assumptions yet`
  );
});

const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
assert.match(
  stepThreeSource,
  /renderCashReserveProjectionReportingDetail/,
  "Step 3 may render cashReserveProjection as reporting-only display"
);
assert.match(
  stepThreeSource,
  /Reporting only \/ none; DIME, LENS, and HLV outputs are unaffected/,
  "Step 3 cash reserve display should stay current-output neutral"
);
assert.doesNotMatch(
  stepThreeSource,
  /\bcashReserveAssumptions\b|calculateCashReserveProjection|cash-reserve-calculations|\breserveAdjusted\b|methodConsumedReserve|consumedByMethods:\s*true[^}]*cashReserve/i,
  "Step 3 should not consume saved cash reserve assumptions or prepare active reserve-adjusted offsets"
);

const modelBuilderSource = readRepoFile("app/features/lens-analysis/lens-model-builder.js");
assert.match(
  modelBuilderSource,
  /cashReserveProjection|calculateCashReserveProjection/,
  "lens-model-builder may prepare reporting-only cashReserveProjection"
);
assert.doesNotMatch(
  modelBuilderSource,
  /reserveAdjusted|adjustedReserve|methodConsumedReserve|consumedByMethods:\s*true[^}]*cashReserve/s,
  "lens-model-builder should not prepare reserve-adjusted method-consumed offsets"
);

const lensContext = createLensAnalysisContext();
const defaultOutputs = createMethodOutputs(
  lensContext,
  createAssetTreatmentAssumptions(defaultAssumptions.cashReserveAssumptions)
);
const futureOutputs = createMethodOutputs(
  lensContext,
  createAssetTreatmentAssumptions(validFutureShape)
);

assert.deepEqual(
  futureOutputs.treatedAssetOffsets,
  defaultOutputs.treatedAssetOffsets,
  "treatedAssetOffsets should be unchanged when cashReserveAssumptions change"
);
assert.deepEqual(
  futureOutputs.projectedAssetGrowth,
  defaultOutputs.projectedAssetGrowth,
  "projectedAssetGrowth should be unchanged when cashReserveAssumptions change"
);
assert.deepEqual(
  futureOutputs.dime,
  defaultOutputs.dime,
  "DIME outputs should be unchanged when cashReserveAssumptions change"
);
assert.deepEqual(
  futureOutputs.needs,
  defaultOutputs.needs,
  "Needs outputs should be unchanged when cashReserveAssumptions change"
);
assert.deepEqual(
  futureOutputs.hlv,
  defaultOutputs.hlv,
  "HLV outputs should be unchanged when cashReserveAssumptions change"
);

console.log("cash-reserve-assumptions-saved-shape-check passed");
