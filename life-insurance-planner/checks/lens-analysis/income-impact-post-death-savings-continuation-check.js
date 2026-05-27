#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");
const pagePath = path.join(repoRoot, "pages", "income-loss-impact.html");
const componentsPath = path.join(repoRoot, "components.css");
const displayPath = path.join(featureRoot, "income-loss-impact-display.js");
const layer1Path = path.join(featureRoot, "household-wealth-projection-calculations.js");
const layer3Path = path.join(featureRoot, "household-survivor-runway-calculations.js");
const projectionHelperPath = path.join(featureRoot, "post-death-savings-projection-calculations.js");
const composerPath = path.join(featureRoot, "income-impact-scenario-composer-calculations.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadScript(context, filePath) {
  vm.runInContext(read(filePath), context, { filename: filePath });
}

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  [
    "asset-taxonomy.js",
    "asset-treatment-calculations.js",
    "household-wealth-projection-calculations.js",
    "household-death-event-availability-calculations.js",
    "household-survivor-runway-calculations.js",
    "post-death-savings-projection-calculations.js",
    "income-impact-scenario-composer-calculations.js"
  ].forEach(function (fileName) {
    loadScript(context, path.join(featureRoot, fileName));
  });
  return context;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertClose(actual, expected, message, epsilon = 0.03) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function createAnalysisSettings() {
  return {
    projectedAssetOffsetAssumptions: {
      enabled: true,
      consumptionStatus: "method-active",
      activationVersion: 1
    },
    assetTreatmentAssumptions: {
      enabled: true,
      source: "income-impact-post-death-savings-continuation-check",
      assets: {
        cashAndCashEquivalents: {
          include: true,
          treatmentPreset: "cash-like",
          taxTreatment: "no-tax-drag",
          taxDragPercent: 0,
          liquidityHaircutPercent: 0
        },
        taxableBrokerageInvestments: {
          include: true,
          treatmentPreset: "taxable-investment",
          taxTreatment: "taxable",
          taxDragPercent: 20,
          liquidityHaircutPercent: 10
        }
      },
      assetGrowthProjectionAssumptions: {
        mode: "projectedOffsets"
      }
    }
  };
}

function createSavingsAllocation() {
  return {
    id: "monthly-brokerage-saving",
    label: "Brokerage savings",
    monthlyAmount: 1000,
    targetAssetCategoryKey: "taxableBrokerageInvestments",
    targetAssetCategoryLabel: "Taxable Brokerage",
    annualGrowthRate: 0.06,
    growthEligible: true,
    growthStatus: "method-active",
    status: "active",
    sourcePaths: ["lensModel.resourceProjectionInputs.savingAllocations.0"]
  };
}

function createLensModel(overrides = {}) {
  return {
    assetFacts: {
      assets: [
        {
          id: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          currentValue: 100000,
          sourcePaths: ["assetFacts.assets.0"]
        },
        {
          id: "brokerage",
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage",
          currentValue: 50000,
          sourcePaths: ["assetFacts.assets.1"]
        }
      ]
    },
    incomeBasis: {
      insuredNetAnnualIncome: 70000,
      spouseOrPartnerNetAnnualIncome: 30000,
      insuredGrossAnnualIncome: 170000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 60000,
      annualDiscretionaryPersonalSpending: 12000
    },
    survivorScenario: {
      survivorNetAnnualIncome: 120000,
      survivorIncomeStartDelayMonths: 0
    },
    resourceProjectionInputs: {
      savingAllocations: [createSavingsAllocation()]
    },
    projectedAssetOffset: {
      sourceMode: "projectedOffsets",
      includedCategories: [
        {
          categoryKey: "cashAndCashEquivalents",
          assumedAnnualGrowthRatePercent: 2,
          sourcePaths: ["projectedAssetOffset.includedCategories.cash"]
        },
        {
          categoryKey: "taxableBrokerageInvestments",
          assumedAnnualGrowthRatePercent: 6,
          sourcePaths: ["projectedAssetOffset.includedCategories.brokerage"]
        }
      ]
    },
    finalExpenses: {
      totalFinalExpenseNeed: 20000
    },
    transitionNeeds: {
      totalTransitionNeed: 10000
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 400000,
      policies: [],
      sourcePaths: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
    },
    treatedDebtPayoff: {
      sourcePaths: ["treatedDebtPayoff.debts"],
      debts: [
        {
          debtFactId: "mortgage-support",
          categoryKey: "realEstateSecuredDebt",
          isMortgage: true,
          treatmentMode: "support",
          mortgageTreatmentMode: "support",
          included: true,
          treatedAmount: 12000,
          mortgageSupportTrace: {
            monthlyMortgagePaymentUsed: 1000,
            supportMonthsUsed: 12
          }
        }
      ]
    },
    ...overrides
  };
}

function createInput(overrides = {}) {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2031-01-01",
    selectedDeathAge: 51,
    projectionHorizonMonths: 12,
    lensModel: createLensModel(overrides.lensModel || {}),
    analysisSettings: createAnalysisSettings(),
    scenarioOptions: {
      includeDiscretionaryNeeds: true,
      ...(overrides.scenarioOptions || {})
    }
  };
}

function composeWithSpies(input) {
  const context = createContext();
  const lensAnalysis = context.LensApp.lensAnalysis;
  const captured = {};
  const originalLayer1 = lensAnalysis.calculateHouseholdWealthProjection;
  const originalLayer3 = lensAnalysis.calculateHouseholdSurvivorRunway;
  const originalProjection = lensAnalysis.calculatePostDeathSavingsProjection;
  lensAnalysis.calculateHouseholdWealthProjection = function (layerInput) {
    captured.layer1Input = clone(layerInput);
    const output = originalLayer1(layerInput);
    captured.layer1Output = clone(output);
    return output;
  };
  lensAnalysis.calculateHouseholdSurvivorRunway = function (layerInput) {
    captured.layer3Input = clone(layerInput);
    const output = originalLayer3(layerInput);
    captured.layer3Output = clone(output);
    return output;
  };
  lensAnalysis.calculatePostDeathSavingsProjection = function (projectionInput) {
    captured.postDeathSavingsProjectionInput = clone(projectionInput);
    const output = originalProjection(projectionInput);
    captured.postDeathSavingsProjectionOutput = clone(output);
    return output;
  };
  return {
    scenario: lensAnalysis.composeIncomeImpactScenario(input),
    captured
  };
}

function getContinuation(scenario) {
  return scenario.scenario.postDeathSavingsContinuation;
}

const pageSource = read(pagePath);
const displaySource = read(displayPath);
const componentsSource = read(componentsPath);
const composerSource = read(composerPath);
const layer1Source = read(layer1Path);
const layer3Source = read(layer3Path);
const projectionHelperSource = read(projectionHelperPath);

assert.match(pageSource, /Continue savings goals after death/, "Income Impact page exposes the savings continuation control label");
assert.match(pageSource, /data-income-impact-continue-savings-after-death/, "page has a savings continuation control hook");
assert.doesNotMatch(
  pageSource,
  /data-income-impact-continue-savings-after-death[\s\S]{0,140}\bchecked\b/,
  "savings continuation control defaults off in markup"
);
assert.match(displaySource, /continueSavingsAfterDeath:\s*false/, "display state defaults savings continuation off");
assert.match(displaySource, /scenarioOptions[\s\S]*continueSavingsAfterDeath/, "display passes savings continuation through scenario options");
assert.match(displaySource, /disabled\s*=\s*!savingsContinuationEligible/, "display disables the control when not eligible");
assert.match(componentsSource, /\.income-impact-toggle-row\.is-disabled/, "disabled toggle row has intentional visual treatment");
assert.match(composerSource, /postDeathSavingsContinuation/, "composer exposes resolved post-death savings continuation state");
assert.match(pageSource, /post-death-savings-projection-calculations\.js/, "Income Impact loads the post-death savings projection helper before composer runtime");
assert.match(projectionHelperSource, /calculatePostDeathSavingsProjection/, "post-death savings projection helper is exported");
assert.match(projectionHelperSource, /monthlyGrowthRate/, "post-death savings projection helper applies category growth context");
assert.match(projectionHelperSource, /genericSurplusAfterSavings/, "post-death savings projection helper reduces generic surplus after continued savings");
assert.doesNotMatch(layer3Source, /totalSavingAllocations|cashFlowBeforeSavings|savingAllocationBalances/, "Layer 3 survivor runway does not own post-death savings projection math");
[
  /\bdocument\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/
].forEach(function (pattern) {
  assert.doesNotMatch(projectionHelperSource, pattern, `post-death savings projection helper should stay pure and avoid ${pattern}`);
});

const eligibleOff = composeWithSpies(createInput());
const eligibleOffResolution = getContinuation(eligibleOff.scenario);
assert.equal(eligibleOffResolution.requested, false, "default requested value is off");
assert.equal(eligibleOffResolution.eligible, true, "control is available when survivor cash flow supports planned savings");
assert.equal(eligibleOffResolution.effective, false, "eligible savings continuation remains off until requested");
assert.equal(eligibleOffResolution.reason, "controlOff", "eligible off scenario is traced as controlOff");
assert.equal(eligibleOff.captured.layer3Input.savingAllocations, undefined, "off scenario does not send saving allocations to Layer 3");
assert.equal(
  eligibleOff.scenario.postDeathSeries.savingsContinuationProjection.summary.totalContinuedSavingContributions,
  0,
  "off scenario has zero post-death saving contributions"
);
assert.ok(
  eligibleOff.scenario.preDeathSeries.summary.totalSavingAllocations > 0,
  "pre-death savings behavior remains active"
);

const eligibleOn = composeWithSpies(createInput({
  scenarioOptions: {
    continueSavingsAfterDeath: true
  }
}));
const eligibleOnResolution = getContinuation(eligibleOn.scenario);
assert.equal(eligibleOnResolution.requested, true, "requested true is preserved in trace");
assert.equal(eligibleOnResolution.eligible, true, "eligible true is preserved in trace");
assert.equal(eligibleOnResolution.effective, true, "eligible requested continuation becomes effective");
assert.equal(eligibleOnResolution.reason, "enabled", "enabled scenario is traced");
assert.equal(eligibleOn.captured.layer3Input.savingAllocations, undefined, "effective scenario still keeps Layer 3 free of saving projection ownership");
assert.equal(eligibleOn.captured.postDeathSavingsProjectionInput.savingAllocations.length, 1, "effective scenario sends saving allocations to projection helper");
assert.equal(
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].totalContinuedSavingContributions,
  1000,
  "first post-death projection point allocates planned savings"
);
assert.equal(
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].contributions[0].targetAssetCategoryKey,
  "taxableBrokerageInvestments",
  "allocation target is preserved"
);
assert.ok(
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.summary.totalProjectedPostDeathSavingsValue
    > eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.summary.totalContinuedSavingContributions,
  "growth-aware projection increases target contribution value beyond raw contributions"
);
assertClose(
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].genericSurplusAfterSavings,
  eligibleOff.scenario.postDeathSeries.savingsContinuationProjection.points[0].genericSurplusAfterSavings - 1000,
  "continued savings reduces unallocated surplus by the planned saving amount"
);
assertClose(
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].genericSurplusAfterSavings
    + eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].totalContinuedSavingContributions,
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].genericSurplusBeforeSavings,
  "continued savings is reallocated from generic surplus without double-counting the same dollars"
);
assert.equal(
  eligibleOn.scenario.postDeathSeries.savingsContinuationProjection.points[0].contributions[0].monthlyGrowthRate > 0,
  true,
  "projection uses available target category growth context"
);

const ineligibleOn = composeWithSpies(createInput({
  lensModel: {
    survivorScenario: {
      survivorNetAnnualIncome: 65000,
      survivorIncomeStartDelayMonths: 0
    }
  },
  scenarioOptions: {
    continueSavingsAfterDeath: true
  }
}));
const ineligibleResolution = getContinuation(ineligibleOn.scenario);
assert.equal(ineligibleResolution.requested, true, "ineligible scenario keeps requested value for trace");
assert.equal(ineligibleResolution.eligible, false, "insufficient survivor cash flow disables eligibility");
assert.equal(ineligibleResolution.effective, false, "ineligible requested true is overridden");
assert.equal(ineligibleResolution.reason, "insufficientSurvivorCashFlow", "ineligible reason is traced");
assert.equal(ineligibleOn.captured.layer3Input.savingAllocations, undefined, "ineligible scenario sends no saving allocations to Layer 3");
assert.equal(
  ineligibleOn.scenario.postDeathSeries.savingsContinuationProjection.summary.totalContinuedSavingContributions,
  0,
  "ineligible scenario has zero post-death saving contributions"
);
assert.equal(
  ineligibleOn.scenario.postDeathSeries.savingsContinuationProjection.summary.totalProjectedPostDeathSavingsValue,
  0,
  "ineligible scenario has no post-death target increase from continued savings"
);

const noSavings = composeWithSpies(createInput({
  lensModel: {
    resourceProjectionInputs: {
      savingAllocations: []
    }
  },
  scenarioOptions: {
    continueSavingsAfterDeath: true
  }
}));
const noSavingsResolution = getContinuation(noSavings.scenario);
assert.equal(noSavingsResolution.eligible, false, "no planned savings disables the control");
assert.equal(noSavingsResolution.effective, false, "no planned savings cannot continue");
assert.equal(noSavingsResolution.reason, "noPlannedSavings", "no planned savings reason is traced");

const missingGrowth = composeWithSpies(createInput({
  lensModel: {
    resourceProjectionInputs: {
      savingAllocations: [
        {
          ...createSavingsAllocation(),
          targetAssetCategoryKey: "otherCustomAsset",
          targetAssetCategoryLabel: "Other Custom Asset",
          annualGrowthRate: null,
          growthEligible: false,
          growthStatus: "saved-only"
        }
      ]
    }
  },
  scenarioOptions: {
    continueSavingsAfterDeath: true
  }
}));
assert.equal(
  missingGrowth.scenario.postDeathSeries.savingsContinuationProjection.warnings.some((warning) => warning.code === "post-death-saving-growth-defaulted"),
  true,
  "missing growth context is conservative and traced"
);
assert.equal(
  missingGrowth.scenario.postDeathSeries.savingsContinuationProjection.points[0].contributions[0].monthlyGrowthRate,
  0,
  "missing growth context uses zero monthly growth"
);

assert.doesNotMatch(layer1Source, /continueSavingsAfterDeath/, "Layer 1 pre-death projection does not own post-death continuation setting");
assert.doesNotMatch(
  composerSource,
  /insurance proceeds as monthly income|draw down assets to continue/i,
  "composer does not encode forbidden post-death saving assumptions as copy"
);
assert.match(
  projectionHelperSource,
  /fundingExclusions[\s\S]*insurance-proceeds[\s\S]*starting-resources[\s\S]*asset-drawdown/,
  "projection helper traces that insurance proceeds, starting resources, and asset drawdown cannot fund continued savings"
);

console.log("income-impact-post-death-savings-continuation-check passed");
