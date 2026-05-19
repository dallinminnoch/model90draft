#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createContext(loadTransitionHelper = true) {
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
    "app/features/lens-analysis/asset-taxonomy.js",
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/household-wealth-projection-calculations.js",
    "app/features/lens-analysis/household-death-event-availability-calculations.js",
    "app/features/lens-analysis/household-survivor-runway-calculations.js",
    "app/features/lens-analysis/income-impact-asset-depletion-ledger-calculations.js",
    loadTransitionHelper ? "app/features/lens-analysis/income-impact-transition-outlook-calculations.js" : null,
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js"
  ].filter(Boolean).forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createAsset(assetId, categoryKey, currentValue) {
  return {
    id: assetId,
    assetId,
    categoryKey,
    typeKey: categoryKey,
    label: assetId,
    currentValue,
    sourcePaths: [`assetFacts.${assetId}`]
  };
}

function createLensModel(overrides = {}) {
  return Object.assign({
    assetFacts: {
      assets: [
        createAsset("cash", "cashAndCashEquivalents", 20000),
        createAsset("emergency", "emergencyFund", 10000),
        createAsset("brokerage", "taxableBrokerageInvestments", 250000),
        createAsset("business", "businessPrivateCompanyValue", 500000)
      ]
    },
    incomeBasis: {
      insuredNetAnnualIncome: 90000,
      spouseOrPartnerNetAnnualIncome: 0,
      insuredGrossAnnualIncome: 130000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 120000,
      annualDiscretionaryPersonalSpending: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 750000,
      includedPolicyCount: 1,
      excludedPolicyCount: 0,
      sourcePaths: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
    },
    finalExpenses: {
      totalFinalExpenseNeed: 0
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    treatedDebtPayoff: {
      debts: []
    }
  }, overrides);
}

function createAnalysisSettings() {
  return {
    assetTreatmentAssumptions: {
      enabled: true,
      assets: {
        cashAndCashEquivalents: {
          include: true,
          treatmentPreset: "cash-like",
          taxTreatment: "no-tax-drag",
          taxDragPercent: 0,
          liquidityHaircutPercent: 0
        },
        emergencyFund: {
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
          taxDragPercent: 0,
          liquidityHaircutPercent: 0
        },
        businessPrivateCompanyValue: {
          include: false,
          treatmentPreset: "business-illiquid",
          taxTreatment: "case-specific",
          taxDragPercent: 10,
          liquidityHaircutPercent: 50
        }
      }
    }
  };
}

function createInput(overrides = {}) {
  return Object.assign({
    valuationDate: "2026-01-01",
    selectedDeathDate: "2026-01-01",
    selectedDeathAge: 45,
    projectionHorizonMonths: 12,
    lensModel: createLensModel(overrides.lensModel || {}),
    analysisSettings: createAnalysisSettings(),
    scenarioOptions: {
      includeDiscretionaryNeeds: false
    }
  }, overrides.input || {});
}

function compose(input, loadTransitionHelper = true) {
  const context = createContext(loadTransitionHelper);
  return cloneJson(context.LensApp.lensAnalysis.composeIncomeImpactScenario(input));
}

function assertPathLoadOrder() {
  const pageSource = readRepoFile("pages/income-loss-impact.html");
  const helperIndex = pageSource.indexOf("income-impact-transition-outlook-calculations.js");
  const composerIndex = pageSource.indexOf("income-impact-scenario-composer-calculations.js");
  assert.ok(helperIndex > -1, "Income Loss Impact page loads transition outlook helper");
  assert.ok(composerIndex > -1, "Income Loss Impact page loads scenario composer");
  assert.ok(helperIndex < composerIndex, "transition outlook helper loads before scenario composer");
}

function assertNoForbiddenSourceTouches() {
  const touched = require("node:child_process")
    .execFileSync("git", ["diff", "--name-only"], { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const forbidden = touched.filter(function (filePath) {
    return /components\.css|layout\.css|styles\.css|analysis-setup|income-loss-impact-display\.js/.test(filePath);
  });
  assert.deepStrictEqual(forbidden, [], "runtime wiring should not touch display/CSS/Analysis Setup files");
}

function run() {
  assertPathLoadOrder();
  assertNoForbiddenSourceTouches();

  const input = createInput();
  const beforeInput = JSON.stringify(input);
  const scenario = compose(input);
  assert.equal(JSON.stringify(input), beforeInput, "composer transition outlook wiring should not mutate input");

  assert.ok(scenario.transitionOutlook, "scenario output includes transitionOutlook");
  assert.equal(scenario.transitionOutlook.windowDays, 90);
  assert.equal(scenario.transitionOutlook.windowMonths, 3);
  assert.equal(scenario.transitionOutlook.transitionNeed90Days, 30000);
  assert.equal(scenario.transitionOutlook.fastAccessResources, 30000);
  assert.equal(scenario.transitionOutlook.nearTermResources, 250000);
  assert.equal(scenario.transitionOutlook.fastAccessCoverageRatio, 1);
  assert.equal(scenario.transitionOutlook.nearTermCoverageRatio, 9.3333);
  assert.equal(scenario.transitionOutlook.status, "Caution");

  assert.equal(
    scenario.transitionOutlook.trace.fastAccessPolicy.lifeInsuranceProceedsIncluded,
    false,
    "existing coverage/life insurance proceeds are excluded from fast-access policy"
  );
  assert.equal(
    scenario.transitionOutlook.fastAccessResources,
    30000,
    "existing coverage does not increase fast-access resources"
  );

  const noBrokerage = compose(createInput({
    lensModel: {
      assetFacts: {
        assets: [
          createAsset("cash", "cashAndCashEquivalents", 20000),
          createAsset("emergency", "emergencyFund", 10000)
        ]
      }
    }
  }));
  assert.equal(
    noBrokerage.transitionOutlook.fastAccessCoverageRatio,
    scenario.transitionOutlook.fastAccessCoverageRatio,
    "taxable brokerage does not improve primary fast-access coverage ratio"
  );

  const baselinePoint = scenario.postDeathSeries.points[0];
  assert.equal(baselinePoint.survivorNeeds, 10000, "runway survivor need is unchanged");
  assert.equal(baselinePoint.scheduledObligations, 0, "runway scheduled obligations are unchanged");
  assert.equal(baselinePoint.endingResources, scenario.deathEvent.resourcesAfterObligations - 10000, "runway ending resources are unchanged by outlook");
  assert.equal(scenario.timelineFacts.resourcesAfterObligations, scenario.deathEvent.resourcesAfterObligations, "timeline facts remain aligned");

  const missingNeed = compose(createInput({
    lensModel: {
      ongoingSupport: {}
    }
  }));
  assert.equal(missingNeed.transitionOutlook.status, "insufficientData");
  assert.equal(missingNeed.transitionOutlook.transitionNeed90Days, null);
  assert.ok(
    missingNeed.transitionOutlook.warnings.some(function (warning) {
      return warning.code === "missing-transition-need";
    }),
    "missing monthly need returns warning rather than fake Stable"
  );

  const helperMissing = compose(createInput(), false);
  assert.equal(helperMissing.transitionOutlook.status, "not-available");
  assert.equal(helperMissing.transitionOutlook.trace.helper, "missing");
}

run();
console.log("income-impact-transition-outlook-runtime-wiring-check passed");
