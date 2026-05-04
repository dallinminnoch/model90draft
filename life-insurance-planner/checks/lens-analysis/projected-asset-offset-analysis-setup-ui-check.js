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

function getSection(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.ok(startIndex >= 0, `${startNeedle} should exist`);
  const endIndex = endNeedle ? source.indexOf(endNeedle, startIndex + startNeedle.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    [
      "  LensApp.__projectedAssetOffsetAnalysisSetupUiHarness = {",
      "    populateProjectedAssetOffsetFields,",
      "    syncProjectedAssetOffsetToggleState,",
      "    readValidatedProjectedAssetOffsetAssumptions,",
      "    applyProjectedAssetOffsetModeToAssetTreatmentAssumptions",
      "  };",
      "  LensApp.analysisSetup = Object.assign"
    ].join("\n")
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
    "app/features/lens-analysis/asset-library.js",
    "app/features/lens-analysis/debt-taxonomy.js",
    "app/features/lens-analysis/debt-library.js",
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
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
    "app/features/lens-analysis/existing-coverage-treatment-calculations.js",
    "app/features/lens-analysis/debt-treatment-calculations.js",
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/asset-growth-projection-calculations.js",
    "app/features/lens-analysis/projected-asset-offset-calculations.js",
    "app/features/lens-analysis/cash-reserve-calculations.js",
    "app/features/lens-analysis/lens-model-builder.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createCheckbox(checked) {
  return {
    checked: checked === true,
    disabled: false
  };
}

function createMethodFields(options) {
  const normalizedOptions = options && typeof options === "object" ? options : {};
  return {
    needsIncludeOffsetAssets: createCheckbox(normalizedOptions.includeAssetOffsets !== false),
    projectedAssetOffsetEnabled: createCheckbox(normalizedOptions.projectedEnabled === true)
  };
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

function createAssetTreatmentAssumptions(rate, projectionAssumptions) {
  return {
    enabled: true,
    defaultProfile: "balanced",
    source: "projected-asset-offset-analysis-setup-ui-check",
    assetGrowthProjectionAssumptions: Object.assign({
      mode: "reportingOnly",
      projectionYears: 30,
      projectionYearsSource: "analysis-setup",
      source: "analysis-setup",
      consumptionStatus: "saved-only"
    }, projectionAssumptions || {}),
    assets: {
      cashAndCashEquivalents: createAssetAssumption(rate, {
        treatmentPreset: "cash-like"
      }),
      emergencyFund: createAssetAssumption(rate, {
        treatmentPreset: "cash-like"
      }),
      taxableBrokerageInvestments: createAssetAssumption(rate, {
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        liquidityHaircutPercent: 5
      }),
      traditionalRetirementAssets: createAssetAssumption(rate, {
        treatmentPreset: "taxable-retirement",
        taxTreatment: "ordinary-income-on-distribution",
        taxDragPercent: 25,
        liquidityHaircutPercent: 5
      })
    },
    customAssets: []
  };
}

function createSourceData() {
  return {
    cashSavings: 100000,
    cashSavingsIncludeInOffset: true,
    cashSavingsPercentAvailable: 100,
    emergencyFund: 25000,
    emergencyFundIncludeInOffset: true,
    emergencyFundPercentAvailable: 100,
    brokerageAccounts: 200000,
    brokerageAccountsIncludeInOffset: true,
    brokerageAccountsPercentAvailable: 100,
    retirementAssets: 150000,
    retirementAssetsIncludeInOffset: true,
    retirementAssetsPercentAvailable: 100,
    annualIncome: 120000,
    grossAnnualIncome: 120000,
    spouseIncome: 40000,
    yearsIncomeNeeded: 10,
    currentCoverage: 250000,
    mortgageBalance: 180000,
    childcareDependentCareCost: 1000,
    foodCost: 1200,
    transportationCost: 800,
    insuranceCost: 600,
    phoneInternetCost: 250,
    otherHouseholdExpenses: 400,
    estimatedCostPerChild: 0,
    funeralBurialEstimate: 15000,
    medicalEndOfLifeCosts: 5000,
    estateSettlementCosts: 5000,
    immediateLiquidityBuffer: 10000
  };
}

function createAnalysisSettings(options) {
  const normalizedOptions = options && typeof options === "object" ? options : {};
  const includeAssetOffsets = normalizedOptions.includeAssetOffsets !== false;
  const projectedEnabled = normalizedOptions.projectedEnabled === true && includeAssetOffsets;
  return {
    valuationDate: "2026-05-04",
    methodDefaults: {
      needsIncludeOffsetAssets: includeAssetOffsets
    },
    assetTreatmentAssumptions: createAssetTreatmentAssumptions(11, {
      mode: projectedEnabled ? "projectedOffsets" : "reportingOnly",
      projectionYears: 30
    }),
    projectedAssetOffsetAssumptions: projectedEnabled
      ? {
          enabled: true,
          consumptionStatus: "method-active",
          activationVersion: 1,
          source: "analysis-setup"
        }
      : {
          enabled: false,
          consumptionStatus: "saved-only",
          activationVersion: 0,
          source: "analysis-setup"
        }
  };
}

function buildLensModel(context, analysisSettings) {
  const result = context.LensApp.lensAnalysis.buildLensModelFromSavedProtectionModeling({
    sourceData: createSourceData(),
    analysisSettings,
    profileRecord: {}
  });
  assert.ok(result.lensModel, "Lens model should build");
  return result.lensModel;
}

function runMethods(context, lensModel, settings) {
  const methods = context.LensApp.lensAnalysis.analysisMethods;
  return {
    dime: methods.runDimeAnalysis(cloneJson(lensModel), settings.dimeSettings),
    needs: methods.runNeedsAnalysis(cloneJson(lensModel), settings.needsAnalysisSettings),
    hlv: methods.runHumanLifeValueAnalysis(cloneJson(lensModel), settings.humanLifeValueSettings),
    simpleNeeds: methods.runSimpleNeedsAnalysis(cloneJson(lensModel), {
      supportYears: 10,
      includeAssetOffsets: true
    })
  };
}

const html = readRepoFile("pages/analysis-setup.html");
const setupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const adapterSource = readRepoFile("app/features/lens-analysis/analysis-settings-adapter.js");
const schemaSource = readRepoFile("app/features/lens-analysis/schema.js");

const inclusionSection = getSection(
  html,
  'id="analysis-setup-calculation-inclusion"',
  'id="analysis-setup-method-defaults"'
);
assert.match(inclusionSection, /settings-toggle-row analysis-setup-toggle-control/);
assert.match(inclusionSection, /settings-switch analysis-setup-mini-switch/);
assert.match(inclusionSection, /data-analysis-projected-asset-offset-enabled/);
assert.match(inclusionSection, /Use Projected Asset Offset in LENS/);
assert.match(inclusionSection, /Requires Include Asset Offsets in Needs/);
assert.match(inclusionSection, /treated eligible assets plus incremental projected growth/);
assert.match(inclusionSection, /DIME, HLV, and Simple Needs are unchanged/);
assert.match(inclusionSection, /Step 3 shows the effective offset, exclusions, and any fallback/);
assert.ok(
  inclusionSection.indexOf("Use Projected Asset Offset in LENS")
    > inclusionSection.indexOf("Include Asset Offsets in Needs"),
  "Projected asset offset toggle should follow Include Asset Offsets in Needs"
);
assert.ok(
  inclusionSection.indexOf("Use Projected Asset Offset in LENS")
    < inclusionSection.indexOf("Include Survivor Income Offset"),
  "Projected asset offset toggle should stay with the master inclusion controls"
);

const assetTreatmentSection = getSection(
  html,
  'id="analysis-setup-asset-treatment"',
  'id="analysis-setup-existing-coverage-treatment"'
);
assert.match(assetTreatmentSection, /data-analysis-asset-growth-projection-mode/);
assert.match(assetTreatmentSection, /data-analysis-asset-growth-projection-years/);
assert.match(assetTreatmentSection, /Current-dollar only/);
assert.match(assetTreatmentSection, /Reporting only/);
assert.doesNotMatch(assetTreatmentSection, /<option value="projectedOffsets"/);
assert.doesNotMatch(assetTreatmentSection, /Projected offsets - future \/ inactive/);
assert.match(assetTreatmentSection, /Projection mode controls reporting-only growth context/);
assert.match(assetTreatmentSection, /activated only by Use Projected Asset Offset in LENS/);
assert.match(assetTreatmentSection, /Return inputs affect LENS recommendations only when Use Projected Asset Offset in LENS is on/);
assert.match(setupSource, /data-analysis-asset-treatment-growth/);
assert.match(setupSource, /data-analysis-asset-treatment-growth-slider/);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const harness = setupContext.LensApp.__projectedAssetOffsetAnalysisSetupUiHarness;
assert.equal(typeof analysisSetup.getProjectedAssetOffsetAssumptions, "function");
assert.equal(typeof harness.readValidatedProjectedAssetOffsetAssumptions, "function");
assert.equal(typeof harness.applyProjectedAssetOffsetModeToAssetTreatmentAssumptions, "function");

assert.deepEqual(
  cloneJson(analysisSetup.getProjectedAssetOffsetAssumptions({})),
  {
    enabled: false,
    consumptionStatus: "saved-only",
    activationVersion: 0,
    source: "analysis-setup"
  },
  "Analysis Setup must not default projected offsets to active"
);
assert.deepEqual(
  cloneJson(analysisSetup.getProjectedAssetOffsetAssumptions({
    analysisSettings: {
      projectedAssetOffsetAssumptions: {
        enabled: true
      }
    }
  })),
  {
    enabled: false,
    consumptionStatus: "saved-only",
    activationVersion: 0,
    source: "analysis-setup"
  },
  "Enabled alone should not load as an active projected offset marker"
);

assert.deepEqual(
  cloneJson(harness.readValidatedProjectedAssetOffsetAssumptions(createMethodFields({
    includeAssetOffsets: true,
    projectedEnabled: true
  })).value),
  {
    enabled: true,
    consumptionStatus: "method-active",
    activationVersion: 1,
    source: "analysis-setup"
  },
  "Enabled master toggle should save the explicit active marker"
);

assert.deepEqual(
  cloneJson(harness.readValidatedProjectedAssetOffsetAssumptions(createMethodFields({
    includeAssetOffsets: true,
    projectedEnabled: false
  })).value),
  {
    enabled: false,
    consumptionStatus: "saved-only",
    activationVersion: 0,
    source: "analysis-setup"
  },
  "Disabled master toggle should save inactive assumptions"
);

const excludedFields = createMethodFields({
  includeAssetOffsets: false,
  projectedEnabled: true
});
harness.syncProjectedAssetOffsetToggleState(excludedFields);
assert.equal(excludedFields.projectedAssetOffsetEnabled.checked, false);
assert.equal(excludedFields.projectedAssetOffsetEnabled.disabled, true);
assert.deepEqual(
  cloneJson(harness.readValidatedProjectedAssetOffsetAssumptions(excludedFields).value),
  {
    enabled: false,
    consumptionStatus: "saved-only",
    activationVersion: 0,
    source: "analysis-setup"
  },
  "Projected offset cannot save method-active when Include Asset Offsets in Needs is off"
);

const activeAssetTreatment = harness.applyProjectedAssetOffsetModeToAssetTreatmentAssumptions(
  createAssetTreatmentAssumptions(7, {
    mode: "reportingOnly",
    projectionYears: 18
  }),
  {
    enabled: true,
    consumptionStatus: "method-active",
    activationVersion: 1
  }
);
assert.equal(activeAssetTreatment.assetGrowthProjectionAssumptions.mode, "projectedOffsets");
assert.equal(activeAssetTreatment.assetGrowthProjectionAssumptions.projectionYears, 18);
assert.equal(activeAssetTreatment.assets.cashAndCashEquivalents.assumedAnnualGrowthRatePercent, 7);

const inactiveAssetTreatment = harness.applyProjectedAssetOffsetModeToAssetTreatmentAssumptions(
  createAssetTreatmentAssumptions(7, {
    mode: "reportingOnly",
    projectionYears: 18
  }),
  {
    enabled: false,
    consumptionStatus: "saved-only",
    activationVersion: 0
  }
);
assert.equal(inactiveAssetTreatment.assetGrowthProjectionAssumptions.mode, "reportingOnly");
assert.equal(inactiveAssetTreatment.assetGrowthProjectionAssumptions.projectionYears, 18);

assert.match(adapterSource, /function applyNeedsProjectedAssetOffsetSettings/);
assert.match(adapterSource, /settings\.projectedAssetOffsetAssumptions/);
assert.match(adapterSource, /settings\.assetGrowthProjectionAssumptions/);
assert.match(adapterSource, /createNeedsAnalysisSettings/);
assert.doesNotMatch(schemaSource, /projectedAssetOffsetAssumptions/, "saved schema defaults should not create active projected offsets");

const analysisContext = createLensAnalysisContext();
const adapter = analysisContext.LensApp.lensAnalysis.analysisSettingsAdapter;
const inactiveAnalysisSettings = createAnalysisSettings({
  projectedEnabled: false,
  includeAssetOffsets: true
});
const activeAnalysisSettings = createAnalysisSettings({
  projectedEnabled: true,
  includeAssetOffsets: true
});
const offsetsOffAnalysisSettings = createAnalysisSettings({
  projectedEnabled: true,
  includeAssetOffsets: false
});

const inactiveModel = buildLensModel(analysisContext, inactiveAnalysisSettings);
const activeModel = buildLensModel(analysisContext, activeAnalysisSettings);
const inactiveSettings = adapter.createAnalysisMethodSettings({
  analysisSettings: inactiveAnalysisSettings,
  lensModel: inactiveModel
});
const activeSettings = adapter.createAnalysisMethodSettings({
  analysisSettings: activeAnalysisSettings,
  lensModel: activeModel
});
const offsetsOffSettings = adapter.createAnalysisMethodSettings({
  analysisSettings: offsetsOffAnalysisSettings,
  lensModel: buildLensModel(analysisContext, offsetsOffAnalysisSettings)
});

assert.equal(activeSettings.needsAnalysisSettings.assetGrowthProjectionAssumptions.mode, "projectedOffsets");
assert.deepEqual(
  cloneJson(activeSettings.needsAnalysisSettings.projectedAssetOffsetAssumptions),
  {
    enabled: true,
    consumptionStatus: "method-active",
    activationVersion: 1,
    source: "analysis-setup"
  },
  "Adapter should pass the active marker only into LENS settings"
);
assert.equal(activeSettings.dimeSettings.projectedAssetOffsetAssumptions, undefined);
assert.equal(activeSettings.humanLifeValueSettings.projectedAssetOffsetAssumptions, undefined);
assert.equal(offsetsOffSettings.needsAnalysisSettings.includeOffsetAssets, false);

const inactiveOutputs = runMethods(analysisContext, activeModel, inactiveSettings);
const activeOutputs = runMethods(analysisContext, activeModel, activeSettings);
assert.notDeepEqual(
  cloneJson(activeOutputs.needs),
  cloneJson(inactiveOutputs.needs),
  "LENS output should change when the master toggle produces a valid active marker"
);
assert.equal(
  activeOutputs.needs.commonOffsets.assetOffset,
  activeModel.projectedAssetOffset.effectiveProjectedAssetOffset,
  "LENS should consume projectedAssetOffset.effectiveProjectedAssetOffset after UI activation"
);
assert.deepEqual(cloneJson(activeOutputs.dime), cloneJson(inactiveOutputs.dime));
assert.deepEqual(cloneJson(activeOutputs.hlv), cloneJson(inactiveOutputs.hlv));
assert.deepEqual(cloneJson(activeOutputs.simpleNeeds), cloneJson(inactiveOutputs.simpleNeeds));

console.log("projected-asset-offset-analysis-setup-ui-check passed");
