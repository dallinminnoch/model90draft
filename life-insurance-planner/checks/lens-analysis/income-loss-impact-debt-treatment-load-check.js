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

function baseInput() {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2026-01-01",
    selectedDeathAge: 46,
    projectionHorizonMonths: 24,
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
            currentValue: 200000
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
        totalFinalExpenseNeed: 20000
      },
      transitionNeeds: {
        totalTransitionNeed: 10000
      },
      treatedDebtPayoff: {
        sourcePaths: ["treatedDebtPayoff.debts"],
        debts: [
          {
            debtFactId: "credit-card",
            categoryKey: "unsecuredConsumerDebt",
            isMortgage: false,
            treatmentMode: "payoff",
            included: true,
            treatedAmount: 5000
          },
          {
            debtFactId: "mortgage-payoff",
            categoryKey: "realEstateSecuredDebt",
            isMortgage: true,
            treatmentMode: "payoff",
            mortgageTreatmentMode: "payoff",
            included: true,
            treatedAmount: 20000
          },
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
      mortgageTreatmentOverride: "followAssumptions"
    }
  };
}

const pageSource = readRepoFile("pages/income-loss-impact.html");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const composerSource = readRepoFile("app/features/lens-analysis/income-impact-scenario-composer-calculations.js");

assert.doesNotMatch(pageSource, /income-impact-warning-events-library\.js|income-loss-impact-timeline-calculations\.js/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents/);
assert.match(composerSource, /treatedDebtPayoff/);
assert.match(composerSource, /buildMortgageSupportObligations/);

const context = loadComposerContext();
const composeIncomeImpactScenario = context.LensApp.lensAnalysis.composeIncomeImpactScenario;
assert.equal(typeof composeIncomeImpactScenario, "function");

const scenario = composeIncomeImpactScenario(baseInput());
const obligations = scenario.deathEvent.layer2.immediateObligations;
assert.equal(obligations.finalExpenses, 20000);
assert.equal(obligations.transitionNeeds, 10000);
assert.equal(obligations.debtPayoff, 5000);
assert.equal(obligations.mortgagePayoff, 20000);
assert.equal(obligations.deferredMortgageSupport, 12000);
assert.equal(obligations.totalImmediateObligations, 55000);
assert.equal(scenario.deathEvent.immediateObligations, 55000);
assert.equal(scenario.timelineFacts.resourcesAfterObligations, 545000);
assert.ok(
  scenario.postDeathSeries.layer3.trace.streamNormalization.scheduledObligations.some(function (obligation) {
    return obligation.id === "mortgage-support"
      && obligation.category === "mortgageSupport"
      && obligation.monthlyAmount === 1000
      && obligation.termMonths === 12;
  }),
  "Deferred mortgage support should enter Layer 3 as a scheduled obligation when a schedule is present."
);

console.log("income-loss-impact-debt-treatment-load-check passed");
