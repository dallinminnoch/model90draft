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
    "  LensApp.__growthReturnHarness = { readValidatedGrowthAndReturnAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );
  const context = {
    console,
    document: {
      addEventListener() {}
    },
    Intl,
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {};
  vm.createContext(context);
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
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createLensModel() {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthStatus: "valid"
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 20000,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 12000,
      annualDiscretionaryPersonalSpending: 6000
    },
    educationSupport: {
      totalEducationFundingNeed: 10000,
      linkedDependentEducationFundingNeed: 10000,
      desiredAdditionalDependentEducationFundingNeed: 0,
      desiredAdditionalDependentCount: 0,
      perLinkedDependentEducationFunding: 10000,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2020-01-01"
        }
      ]
    },
    finalExpenses: {
      medicalEndOfLifeCost: 400,
      funeralAndBurialCost: 300,
      estateSettlementCost: 200,
      otherFinalExpenses: 100,
      totalFinalExpenseNeed: 1000
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    existingCoverage: {
      totalExistingCoverage: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 0,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 0,
      metadata: {
        consumedByMethods: true
      }
    }
  };
}

function createAnalysisSettings(growthAndReturnAssumptions) {
  return {
    valuationDate: "2026-01-01",
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 10,
      hlvProjectionYears: 10,
      needsIncludeOffsetAssets: false,
      source: "growth-return-assumptions-truthfulness-check"
    },
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      householdExpenseInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "growth-return-assumptions-truthfulness-check"
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: false,
        applyEducationInflation: false,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "growth-return-assumptions-truthfulness-check"
    },
    healthcareExpenseAssumptions: {
      enabled: false,
      projectionYears: 10,
      includeOneTimeHealthcareExpenses: false,
      oneTimeProjectionMode: "currentDollarOnly",
      source: "growth-return-assumptions-truthfulness-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: true,
        includeDiscretionarySupport: true
      },
      source: "growth-return-assumptions-truthfulness-check"
    },
    growthAndReturnAssumptions
  };
}

function createMethodSnapshot(context, growthAndReturnAssumptions) {
  const lensAnalysis = context.LensApp.lensAnalysis;
  const lensModel = createLensModel();
  const analysisSettings = createAnalysisSettings(growthAndReturnAssumptions);
  const profileRecord = {
    id: "growth-return-truthfulness-profile",
    displayName: "Growth Return Truthfulness",
    analysisSettings,
    coveragePolicies: []
  };
  const methodSettings = lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel,
    profileRecord
  });
  const dime = lensAnalysis.analysisMethods.runDimeAnalysis(
    lensModel,
    cloneJson(methodSettings.dimeSettings)
  );
  const needs = lensAnalysis.analysisMethods.runNeedsAnalysis(
    lensModel,
    cloneJson(methodSettings.needsAnalysisSettings)
  );
  const hlv = lensAnalysis.analysisMethods.runHumanLifeValueAnalysis(
    lensModel,
    cloneJson(methodSettings.humanLifeValueSettings)
  );

  return {
    methodSettings,
    result: {
      dime: {
        grossNeed: dime.grossNeed,
        netCoverageGap: dime.netCoverageGap,
        components: dime.components
      },
      needs: {
        grossNeed: needs.grossNeed,
        netCoverageGap: needs.netCoverageGap,
        components: needs.components
      },
      hlv: {
        grossHumanLifeValue: hlv.grossHumanLifeValue,
        netCoverageGap: hlv.netCoverageGap,
        components: hlv.components
      }
    }
  };
}

const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
assert.match(analysisSetupHtml, /Growth &amp; Return Assumptions/);
assert.match(analysisSetupHtml, /data-analysis-growth-reset/);
assert.match(analysisSetupHtml, /data-analysis-growth-field="returnBasis"/);
assert.match(analysisSetupHtml, /data-analysis-growth-field="primaryIncomeGrowthRatePercent"/);
assert.match(analysisSetupHtml, /data-analysis-growth-field="partnerIncomeGrowthRatePercent"/);
assert.match(analysisSetupHtml, /data-analysis-growth-field="taxableInvestmentReturnRatePercent"/);
assert.match(analysisSetupHtml, /data-analysis-growth-field="retirementAssetReturnRatePercent"/);
assert.doesNotMatch(analysisSetupHtml, /data-analysis-growth-field="enabled"/);
assert.match(analysisSetupHtml, /Saved for future projection\/modeling/);
assert.match(analysisSetupHtml, /do not affect current DIME, Needs, or Human Life Value outputs/);
assert.match(analysisSetupHtml, /Asset Treatment owns current saved asset-specific assumed annual growth/);
assert.match(analysisSetupHtml, /current asset treatment, projected asset growth, existing coverage, healthcare, inflation, and recommendations do not consume the broad taxable\/retirement return sliders/);
assert.match(analysisSetupHtml, /those sliders do not seed Asset Treatment defaults today/);

const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
assert.match(analysisSetupSource, /growthAndReturnAssumptions: validatedGrowth\.value/);
assert.match(analysisSetupSource, /function readValidatedGrowthAndReturnAssumptions/);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const harness = setupContext.LensApp.__growthReturnHarness;
assert.deepEqual(cloneJson(analysisSetup.DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS), {
  enabled: false,
  returnBasis: "nominal",
  primaryIncomeGrowthRatePercent: 3,
  partnerIncomeGrowthRatePercent: 3,
  taxableInvestmentReturnRatePercent: 5,
  retirementAssetReturnRatePercent: 4,
  source: "analysis-setup"
});
assert.deepEqual(
  cloneJson(analysisSetup.getGrowthAndReturnAssumptions({})),
  cloneJson(analysisSetup.DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS)
);
assert.deepEqual(
  cloneJson(analysisSetup.getGrowthAndReturnAssumptions({
    analysisSettings: {
      growthAndReturnAssumptions: {
        enabled: true,
        returnBasis: "real",
        primaryIncomeGrowthRatePercent: 12,
        partnerIncomeGrowthRatePercent: 11,
        taxableInvestmentReturnRatePercent: 10,
        retirementAssetReturnRatePercent: 9,
        source: "saved-test"
      }
    }
  })),
  {
    enabled: true,
    returnBasis: "real",
    primaryIncomeGrowthRatePercent: 12,
    partnerIncomeGrowthRatePercent: 11,
    taxableInvestmentReturnRatePercent: 10,
    retirementAssetReturnRatePercent: 9,
    source: "saved-test"
  }
);

const validatedGrowth = harness.readValidatedGrowthAndReturnAssumptions({
  returnBasis: { value: "real" },
  primaryIncomeGrowthRatePercent: { value: "6.25" },
  partnerIncomeGrowthRatePercent: { value: "4.5" },
  taxableInvestmentReturnRatePercent: { value: "7" },
  retirementAssetReturnRatePercent: { value: "5.75" }
});
assert.equal(validatedGrowth.error, undefined);
assert.equal(validatedGrowth.value.enabled, false, "saved shape should preserve hidden enabled false without adding a visible toggle");
assert.equal(validatedGrowth.value.returnBasis, "real");
assert.equal(validatedGrowth.value.primaryIncomeGrowthRatePercent, 6.25);
assert.equal(validatedGrowth.value.partnerIncomeGrowthRatePercent, 4.5);
assert.equal(validatedGrowth.value.taxableInvestmentReturnRatePercent, 7);
assert.equal(validatedGrowth.value.retirementAssetReturnRatePercent, 5.75);
assert.equal(validatedGrowth.value.source, "analysis-setup");
assert.ok(validatedGrowth.value.lastUpdatedAt, "validated saved shape should include lastUpdatedAt");
assert.match(
  harness.readValidatedGrowthAndReturnAssumptions({
    returnBasis: { value: "nominal" },
    primaryIncomeGrowthRatePercent: { value: "13" },
    partnerIncomeGrowthRatePercent: { value: "4" },
    taxableInvestmentReturnRatePercent: { value: "5" },
    retirementAssetReturnRatePercent: { value: "6" }
  }).error,
  /Primary income growth must be between 0% and 12%/
);

const context = createLensAnalysisContext();
const baseGrowth = {
  enabled: false,
  returnBasis: "nominal",
  primaryIncomeGrowthRatePercent: 3,
  partnerIncomeGrowthRatePercent: 3,
  taxableInvestmentReturnRatePercent: 5,
  retirementAssetReturnRatePercent: 4,
  source: "growth-return-assumptions-truthfulness-check"
};
const changedGrowth = {
  enabled: true,
  returnBasis: "real",
  primaryIncomeGrowthRatePercent: 12,
  partnerIncomeGrowthRatePercent: 11,
  taxableInvestmentReturnRatePercent: 10,
  retirementAssetReturnRatePercent: 9,
  source: "growth-return-assumptions-truthfulness-check"
};
const baseSnapshot = createMethodSnapshot(context, baseGrowth);
const changedSnapshot = createMethodSnapshot(context, changedGrowth);
const baseAssetTreatmentAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    growthAndReturnAssumptions: baseGrowth
  }
});
const changedAssetTreatmentAssumptions = analysisSetup.getAssetTreatmentAssumptions({
  analysisSettings: {
    growthAndReturnAssumptions: changedGrowth
  }
});
assert.deepEqual(
  cloneJson(changedSnapshot.result),
  cloneJson(baseSnapshot.result),
  "DIME, Needs, and HLV outputs should not change when saved Growth & Return assumptions change"
);
assert.deepEqual(
  cloneJson(changedAssetTreatmentAssumptions),
  cloneJson(baseAssetTreatmentAssumptions),
  "Asset Treatment per-category assumed growth defaults should not change when broad Growth & Return sliders change"
);
assert.equal(JSON.stringify(changedSnapshot.methodSettings.dimeSettings).includes("growthAndReturnAssumptions"), false);
assert.equal(JSON.stringify(changedSnapshot.methodSettings.needsAnalysisSettings).includes("growthAndReturnAssumptions"), false);
assert.equal(JSON.stringify(changedSnapshot.methodSettings.humanLifeValueSettings).includes("growthAndReturnAssumptions"), false);
assert.ok(
  changedSnapshot.methodSettings.trace.some(function (entry) {
    return entry
      && entry.key === "growthAndReturnAssumptions-not-applied"
      && /not applied to current method results/.test(entry.message);
  }),
  "adapter trace should disclose Growth & Return as not applied"
);

const modelBuilderSource = readRepoFile("app/features/lens-analysis/lens-model-builder.js");
const analysisMethodsSource = readRepoFile("app/features/lens-analysis/analysis-methods.js");
const stepThreeSource = readRepoFile("app/features/lens-analysis/step-three-analysis-display.js");
const assetGrowthProjectionSource = readRepoFile("app/features/lens-analysis/asset-growth-projection-calculations.js");
const assetTreatmentCalculationsSource = readRepoFile("app/features/lens-analysis/asset-treatment-calculations.js");
const assetTaxonomySource = readRepoFile("app/features/lens-analysis/asset-taxonomy.js");
assert.equal(modelBuilderSource.includes("growthAndReturnAssumptions"), false, "lens-model-builder should not consume Growth & Return assumptions");
assert.equal(analysisMethodsSource.includes("growthAndReturnAssumptions"), false, "analysis methods should not consume Growth & Return assumptions");
assert.equal(stepThreeSource.includes("growthAndReturnAssumptions"), false, "Step 3 should not render Growth & Return as current-output data");
assert.equal(stepThreeSource.includes("Growth & Return Assumptions"), false, "Step 3 should not add a current-output Growth & Return section");
[
  "taxableInvestmentReturnRatePercent",
  "retirementAssetReturnRatePercent"
].forEach(function (fieldName) {
  assert.equal(modelBuilderSource.includes(fieldName), false, `${fieldName} should not affect projectedAssetGrowth model prep`);
  assert.equal(assetGrowthProjectionSource.includes(fieldName), false, `${fieldName} should not affect projectedAssetGrowth helper math`);
  assert.equal(assetTreatmentCalculationsSource.includes(fieldName), false, `${fieldName} should not affect treated asset offsets`);
  assert.equal(assetTaxonomySource.includes(fieldName), false, `${fieldName} should not seed Asset Treatment growth defaults`);
});

console.log("growth-return-assumptions-truthfulness-check passed");
