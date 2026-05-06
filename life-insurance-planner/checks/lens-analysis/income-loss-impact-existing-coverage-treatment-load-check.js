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

function loadComposerContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  [
    "app/features/lens-analysis/asset-treatment-calculations.js",
    "app/features/lens-analysis/household-wealth-projection-calculations.js",
    "app/features/lens-analysis/household-death-event-availability-calculations.js",
    "app/features/lens-analysis/household-survivor-runway-calculations.js",
    "app/features/lens-analysis/income-impact-scenario-composer-calculations.js"
  ].forEach(function (scriptPath) {
    loadScript(context, scriptPath);
  });
  return context;
}

function baseInput(overrides = {}) {
  const lensModel = {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    assetFacts: {
      assets: [
        {
          id: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          currentValue: 100000
        }
      ]
    },
    incomeBasis: {
      insuredNetAnnualIncome: 70000,
      spouseOrPartnerNetAnnualIncome: 30000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 60000,
      annualDiscretionaryPersonalSpending: 12000
    },
    survivorScenario: {
      survivorNetAnnualIncome: 30000,
      survivorIncomeStartDelayMonths: 0
    },
    treatedExistingCoverageOffset: {
      totalRawCoverage: 600000,
      totalTreatedCoverageOffset: 400000,
      includedPolicyCount: 1,
      excludedPolicyCount: 1,
      policies: [
        {
          policyId: "included-term",
          included: true,
          rawAmount: 400000,
          treatedAmount: 400000
        },
        {
          policyId: "pending-policy",
          included: false,
          rawAmount: 200000,
          treatedAmount: 0
        }
      ],
      sourcePaths: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
    },
    finalExpenses: {
      totalFinalExpenseNeed: 10000
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    treatedDebtPayoff: {
      debts: []
    }
  };

  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2026-01-01",
    selectedDeathAge: 46,
    projectionHorizonMonths: 120,
    lensModel: {
      ...lensModel,
      ...(overrides.lensModel || {})
    },
    analysisSettings: {
      projectedAssetOffsetAssumptions: {
        enabled: false,
        consumptionStatus: "reporting-only",
        activationVersion: 0
      },
      assetTreatmentAssumptions: {
        enabled: true,
        assets: {
          cashAndCashEquivalents: {
            include: true,
            treatmentPreset: "cash-like",
            taxTreatment: "no-tax-drag",
            taxDragPercent: 0,
            liquidityHaircutPercent: 0
          }
        }
      }
    },
    scenarioOptions: {
      includeDiscretionaryNeeds: true,
      mortgageTreatmentOverride: "followAssumptions"
    }
  };
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const composerSource = readRepoFile("app/features/lens-analysis/income-impact-scenario-composer-calculations.js");

assert.doesNotMatch(pageSource, /income-impact-warning-events-library\.js|income-loss-impact-timeline-calculations\.js/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents/);
assert.match(composerSource, /treatedExistingCoverageOffset/);
assert.match(composerSource, /existingCoverageTreatment/);

const context = loadComposerContext();
const composeIncomeImpactScenario = context.LensApp.lensAnalysis.composeIncomeImpactScenario;
assert.equal(typeof composeIncomeImpactScenario, "function");

const scenario = composeIncomeImpactScenario(baseInput());
assert.equal(scenario.deathEvent.coverageAdded, 400000);
assert.equal(scenario.timelineFacts.coverageAdded, 400000);
assert.equal(scenario.deathEvent.layer2.existingCoverage.treatedCoverageAmount, 400000);
assert.equal(scenario.deathEvent.layer2.existingCoverage.includedPolicyCount, 1);
assert.equal(scenario.deathEvent.layer2.existingCoverage.excludedPolicyCount, 1);
assert.equal(scenario.timelineFacts.resourcesAfterObligations, 490000);
assert.ok(
  scenario.sourcePaths.includes("lensModel.treatedExistingCoverageOffset.totalTreatedCoverageOffset")
    || scenario.deathEvent.layer2.existingCoverage.sourcePaths.includes("treatedExistingCoverageOffset.totalTreatedCoverageOffset"),
  "Composer/Layer 2 output should preserve treated existing coverage source paths."
);

const missingCoverage = composeIncomeImpactScenario(baseInput({
  lensModel: {
    treatedExistingCoverageOffset: null
  }
}));
assert.ok(
  missingCoverage.dataGaps.some(function (gap) {
    return gap.code === "missing-treated-existing-coverage-output";
  }),
  "Missing treated existing coverage should stay a composer/Layer 2 data gap."
);

console.log("income-loss-impact-existing-coverage-treatment-load-check passed");
