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

function baseInput(mortgageTreatmentOverride) {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2031-01-01",
    selectedDeathAge: 51,
    projectionHorizonMonths: 120,
    lensModel: {
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
        totalTreatedCoverageOffset: 400000,
        includedPolicyCount: 1,
        excludedPolicyCount: 0
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
    },
    analysisSettings: {
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
      mortgageTreatmentOverride
    }
  };
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const composerSource = readRepoFile("app/features/lens-analysis/income-impact-scenario-composer-calculations.js");

assert.match(pageSource, /data-income-impact-mortgage-treatment/);
assert.match(pageSource, /followAssumptions/);
assert.match(pageSource, /payOffMortgage/);
assert.match(pageSource, /continueMortgagePayments/);
assert.match(displaySource, /mortgageTreatmentOverride/);
assert.match(displaySource, /scenarioOptions/);
assert.match(composerSource, /mortgageTreatmentOverride/);
assert.doesNotMatch(pageSource, /income-impact-warning-events-library\.js|income-loss-impact-timeline-calculations\.js/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents/);

const context = loadComposerContext();
const composeIncomeImpactScenario = context.LensApp.lensAnalysis.composeIncomeImpactScenario;
assert.equal(typeof composeIncomeImpactScenario, "function");

const follow = composeIncomeImpactScenario(baseInput("followAssumptions"));
const payoff = composeIncomeImpactScenario(baseInput("payOffMortgage"));
const continuePayments = composeIncomeImpactScenario(baseInput("continueMortgagePayments"));

assert.equal(follow.scenario.mortgageTreatmentOverride, "followAssumptions");
assert.equal(payoff.scenario.mortgageTreatmentOverride, "payOffMortgage");
assert.equal(continuePayments.scenario.mortgageTreatmentOverride, "continueMortgagePayments");
assert.equal(follow.trace.layerOrder[0], "householdWealthProjection");
assert.equal(follow.trace.layerOrder[1], "deathEventAvailability");
assert.equal(follow.trace.layerOrder[2], "survivorRunway");
assert.equal(follow.trace.inputMappings.layer3.startingResources, "Layer 2 resources.resourcesAfterObligations");

console.log("income-loss-impact-mortgage-override-check passed: override currently reaches composer scenario metadata; calculation behavior remains deferred.");
