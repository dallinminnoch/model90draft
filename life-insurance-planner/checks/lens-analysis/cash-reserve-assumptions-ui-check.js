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
      "  LensApp.__cashReserveAssumptionsUiHarness = {",
      "    populateAssetTreatmentFields,",
      "    readValidatedAssetTreatmentAssumptions,",
      "    syncCashReserveMethodFields,",
      "    clampCashReserveFields",
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
    checked: Boolean(value),
    disabled: false,
    hidden: false,
    dataset: {},
    style: {
      setProperty() {}
    }
  };
}

function createCheckbox(checked) {
  const field = createField("");
  field.checked = Boolean(checked);
  return field;
}

function createTreatmentFields(assumptions) {
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
    assetGrowthProjection: {
      mode: createField("currentDollarOnly"),
      projectionYears: createField("0")
    },
    cashReserve: {
      enabled: createCheckbox(false),
      reserveMethod: createField("monthsOfEssentialExpenses"),
      reserveMonths: createField("6"),
      reserveMonthsRow: createField(""),
      fixedReserveAmount: createField("0"),
      fixedReserveAmountRow: createField(""),
      expenseBasis: createField("essentialSupport"),
      applyToAssetScope: createField("cashAndCashEquivalents"),
      excludeEmergencyFundAssets: createCheckbox(true)
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
    source: "cash-reserve-assumptions-ui-check",
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
    cashReserveProjection: lensModel.cashReserveProjection,
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
  'id="analysis-setup-coverage-treatment"'
);
const growthReturnSection = getSection(
  html,
  'id="analysis-setup-growth-return"',
  'id="analysis-setup-policy-returns"'
);

assert.match(assetTreatmentSection, /data-analysis-cash-reserve-controls/);
assert.match(assetTreatmentSection, /Cash Reserve Assumptions:/);
assert.match(assetTreatmentSection, /Saved for future reporting\/modeling/i);
assert.match(assetTreatmentSection, /do not affect current DIME, Needs, or HLV outputs/i);
assert.match(assetTreatmentSection, /current asset offsets remain current-dollar\/current treatment based/i);
assert.match(assetTreatmentSection, /Emergency reserve and liquidity rules must be reviewed/i);
assert.match(assetTreatmentSection, /Explicit emergency fund assets are generally preserved before offsetting need/i);
assert.doesNotMatch(growthReturnSection, /data-analysis-cash-reserve|Cash Reserve Assumptions/i);

[
  "data-analysis-cash-reserve-enabled",
  "data-analysis-cash-reserve-method",
  "data-analysis-cash-reserve-months",
  "data-analysis-cash-reserve-fixed-amount",
  "data-analysis-cash-reserve-expense-basis",
  "data-analysis-cash-reserve-asset-scope",
  "data-analysis-cash-reserve-exclude-emergency-fund"
].forEach(function (needle) {
  assert.match(assetTreatmentSection, new RegExp(needle), `${needle} should render`);
});

assert.match(assetTreatmentSection, /Months of essential expenses/);
assert.match(assetTreatmentSection, /Fixed dollar amount/);
assert.match(assetTreatmentSection, /Essential support only/);
assert.match(assetTreatmentSection, /Essential \+ healthcare/);
assert.match(assetTreatmentSection, /Essential \+ healthcare \+ discretionary/);
assert.match(assetTreatmentSection, /Cash and cash equivalents/);
assert.match(assetTreatmentSection, /Liquid assets - future \/ inactive/);
assert.match(assetTreatmentSection, /Selected assets - future \/ inactive/);
assert.match(assetTreatmentSection, /<option value="liquidAssetsFuture" disabled>/);
assert.match(assetTreatmentSection, /<option value="selectedAssetsFuture" disabled>/);
assert.doesNotMatch(assetTreatmentSection, /data-analysis-cash-reserve-include-healthcare/);
assert.doesNotMatch(assetTreatmentSection, /data-analysis-cash-reserve-include-discretionary/);
assert.match(componentsCss, /analysis-setup-cash-reserve-controls/);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const harness = setupContext.LensApp.__cashReserveAssumptionsUiHarness;
assert.equal(typeof analysisSetup.getAssetTreatmentAssumptions, "function");
assert.equal(typeof harness.populateAssetTreatmentFields, "function");
assert.equal(typeof harness.readValidatedAssetTreatmentAssumptions, "function");
assert.equal(typeof harness.syncCashReserveMethodFields, "function");
assert.equal(typeof harness.clampCashReserveFields, "function");

const savedAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    assetTreatmentAssumptions: createAssetTreatmentAssumptions({
      enabled: true,
      mode: "methodActiveFuture",
      reserveMethod: "monthsOfEssentialExpenses",
      reserveMonths: 9,
      fixedReserveAmount: 25000,
      expenseBasis: "essentialPlusHealthcare",
      applyToAssetScope: "cashAndCashEquivalents",
      excludeEmergencyFundAssets: false,
      includeHealthcareExpenses: true,
      includeDiscretionaryExpenses: false
    })
  }
});
const fields = createTreatmentFields(savedAssumptions);
harness.populateAssetTreatmentFields(fields, savedAssumptions, {});
assert.equal(fields.cashReserve.enabled.checked, true);
assert.equal(fields.cashReserve.reserveMethod.value, "monthsOfEssentialExpenses");
assert.equal(fields.cashReserve.reserveMonths.value, "9");
assert.equal(fields.cashReserve.fixedReserveAmount.value, "25000");
assert.equal(fields.cashReserve.expenseBasis.value, "essentialPlusHealthcare");
assert.equal(fields.cashReserve.applyToAssetScope.value, "cashAndCashEquivalents");
assert.equal(fields.cashReserve.excludeEmergencyFundAssets.checked, false);
assert.equal(fields.cashReserve.reserveMonthsRow.hidden, false);
assert.equal(fields.cashReserve.fixedReserveAmountRow.hidden, true);
assert.equal(fields.cashReserve.reserveMonths.disabled, false);
assert.equal(fields.cashReserve.fixedReserveAmount.disabled, true);

fields.cashReserve.reserveMethod.value = "fixedDollarAmount";
harness.syncCashReserveMethodFields(fields);
assert.equal(fields.cashReserve.reserveMonthsRow.hidden, true);
assert.equal(fields.cashReserve.fixedReserveAmountRow.hidden, false);
assert.equal(fields.cashReserve.reserveMonths.disabled, true);
assert.equal(fields.cashReserve.fixedReserveAmount.disabled, false);

fields.cashReserve.enabled.checked = false;
fields.cashReserve.reserveMethod.value = "fixedDollarAmount";
fields.cashReserve.reserveMonths.value = "99";
fields.cashReserve.fixedReserveAmount.value = "20000000";
fields.cashReserve.expenseBasis.value = "essentialPlusHealthcareAndDiscretionary";
fields.cashReserve.applyToAssetScope.value = "selectedAssetsFuture";
fields.cashReserve.excludeEmergencyFundAssets.checked = true;
const savedEdited = harness.readValidatedAssetTreatmentAssumptions(fields).value;
assert.deepEqual(cloneJson(savedEdited.cashReserveAssumptions), {
  enabled: false,
  mode: "methodActiveFuture",
  reserveMethod: "fixedDollarAmount",
  reserveMonths: 24,
  fixedReserveAmount: 10000000,
  expenseBasis: "essentialPlusHealthcareAndDiscretionary",
  applyToAssetScope: "selectedAssetsFuture",
  excludeEmergencyFundAssets: true,
  includeHealthcareExpenses: true,
  includeDiscretionaryExpenses: true,
  source: "analysis-setup",
  consumptionStatus: "saved-only"
});

fields.cashReserve.reserveMethod.value = "monthsOfEssentialExpenses";
fields.cashReserve.reserveMonths.value = "-5";
fields.cashReserve.fixedReserveAmount.value = "-200";
fields.cashReserve.expenseBasis.value = "not-valid";
fields.cashReserve.applyToAssetScope.value = "not-valid";
const clampedLow = harness.readValidatedAssetTreatmentAssumptions(fields).value.cashReserveAssumptions;
assert.equal(clampedLow.reserveMonths, 0);
assert.equal(clampedLow.fixedReserveAmount, 0);
assert.equal(clampedLow.expenseBasis, "essentialSupport");
assert.equal(clampedLow.applyToAssetScope, "cashAndCashEquivalents");
assert.equal(clampedLow.includeHealthcareExpenses, false);
assert.equal(clampedLow.includeDiscretionaryExpenses, false);

fields.cashReserve.reserveMonths.value = "40";
fields.cashReserve.fixedReserveAmount.value = "12500000";
harness.clampCashReserveFields(fields);
assert.equal(fields.cashReserve.reserveMonths.value, "24");
assert.equal(fields.cashReserve.fixedReserveAmount.value, "10000000");

const lensContext = createLensAnalysisContext();
const defaultOutputs = createMethodOutputs(
  lensContext,
  createAssetTreatmentAssumptions(analysisSetup.DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.cashReserveAssumptions)
);
const changedOutputs = createMethodOutputs(
  lensContext,
  createAssetTreatmentAssumptions(savedEdited.cashReserveAssumptions)
);

assert.ok(changedOutputs.cashReserveProjection, "cashReserveProjection may be prepared as reporting-only model trace");
assert.equal(changedOutputs.cashReserveProjection.consumedByMethods, false);
assert.equal(changedOutputs.cashReserveProjection.consumptionStatus, "saved-only");
assert.deepEqual(
  cloneJson(changedOutputs.treatedAssetOffsets),
  cloneJson(defaultOutputs.treatedAssetOffsets),
  "treatedAssetOffsets should be unchanged when cash reserve UI values change"
);
assert.deepEqual(
  cloneJson(changedOutputs.projectedAssetGrowth),
  cloneJson(defaultOutputs.projectedAssetGrowth),
  "projectedAssetGrowth should be unchanged when cash reserve UI values change"
);
assert.deepEqual(cloneJson(changedOutputs.dime), cloneJson(defaultOutputs.dime));
assert.deepEqual(cloneJson(changedOutputs.needs), cloneJson(defaultOutputs.needs));
assert.deepEqual(cloneJson(changedOutputs.hlv), cloneJson(defaultOutputs.hlv));

assert.match(
  readRepoFile("app/features/lens-analysis/lens-model-builder.js"),
  /cashReserveProjection|calculateCashReserveProjection/,
  "lens-model-builder may prepare reporting-only cashReserveProjection"
);
assert.doesNotMatch(
  readRepoFile("app/features/lens-analysis/lens-model-builder.js"),
  /reserveAdjusted|adjustedReserve|methodConsumedReserve|consumedByMethods:\s*true[^}]*cashReserve/s,
  "lens-model-builder should not prepare reserve-adjusted method-consumed offsets"
);
[
  "app/features/lens-analysis/asset-treatment-calculations.js",
  "app/features/lens-analysis/analysis-methods.js"
].forEach(function (relativePath) {
  assert.doesNotMatch(
    readRepoFile(relativePath),
    /\bcashReserveAssumptions\b|\bcashReserveProjection\b|\breserve-adjusted\b|\breserveAdjusted\b/i,
    `${relativePath} should not consume or render cash reserve assumptions as active output`
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
  /Reporting only \/ none; DIME, Needs, and HLV outputs are unaffected/,
  "Step 3 cash reserve display should stay current-output neutral"
);
assert.doesNotMatch(
  stepThreeSource,
  /\bcashReserveAssumptions\b|calculateCashReserveProjection|cash-reserve-calculations|\breserveAdjusted\b|methodConsumedReserve|consumedByMethods:\s*true[^}]*cashReserve/i,
  "Step 3 should not consume cash reserve assumptions or prepare active reserve-adjusted offsets"
);

console.log("cash-reserve-assumptions-ui-check passed");
