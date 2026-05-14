#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  buildIncomeImpactHousingRisk,
  INCOME_IMPACT_HOUSING_RISK_EVENT_TYPES: HOUSING_EVENT_TYPES
} = require(path.resolve(
  __dirname,
  "../../app/features/lens-analysis/income-impact-housing-risk-calculations.js"
));

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
        monthlyMortgagePayment: 2400,
        mortgageRemainingTermMonths: 240,
        monthlyHousingSupportCost: 3000,
        monthlyNonHousingEssentialSupportCost: 2000,
        monthlyTotalEssentialSupportCost: 5000,
        annualTotalEssentialSupportCost: 60000,
        annualDiscretionaryPersonalSpending: 12000
      },
      survivorScenario: {
        survivorNetAnnualIncome: 30000,
        survivorIncomeStartDelayMonths: 0
      },
      treatedExistingCoverageOffset: {
        totalTreatedCoverageOffset: 50000,
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function withMortgageRow(mortgageTreatmentOverride, row) {
  const input = baseInput(mortgageTreatmentOverride);
  input.lensModel.treatedDebtPayoff.debts = [Object.assign({
    debtFactId: "primary-mortgage",
    label: "Primary mortgage",
    categoryKey: "realEstateSecuredDebt",
    isMortgage: true,
    treatmentMode: "payoff",
    mortgageTreatmentMode: "payoff",
    included: true,
    treatedAmount: 0,
    monthlyMortgagePayment: 2400,
    remainingTermMonths: 240,
    sourcePaths: ["lensModel.treatedDebtPayoff.debts.primary-mortgage"]
  }, row || {})];
  return input;
}

function getScheduledMortgageSupport(scenario) {
  return (scenario?.postDeathSeries?.layer3?.trace?.streamNormalization?.scheduledObligations || [])
    .filter(function (obligation) {
      return obligation.category === "mortgageSupport";
    });
}

function getRiskOnlyMortgageSupport(scenario) {
  return (scenario?.postDeathSeries?.layer3?.input?.scheduledObligations || [])
    .filter(function (obligation) {
      return obligation.category === "mortgageSupport";
    });
}

function housingEventTypes(result) {
  return result.timelineEvents.map(function (event) {
    return event.eventType;
  });
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

const payoffMortgageInput = withMortgageRow("payOffMortgage");
const payoffMortgageSnapshot = cloneJson(payoffMortgageInput);
const payoffMortgage = composeIncomeImpactScenario(payoffMortgageInput);
assert.deepEqual(payoffMortgageInput, payoffMortgageSnapshot, "composer should not mutate treated mortgage rows");
assert.equal(
  getScheduledMortgageSupport(payoffMortgage).length,
  0,
  "payOffMortgage override should not create an ongoing mortgage support obligation"
);

const followPayoffMortgage = composeIncomeImpactScenario(withMortgageRow("followAssumptions"));
assert.equal(
  getScheduledMortgageSupport(followPayoffMortgage).length,
  0,
  "followAssumptions should not force support when the saved mortgage row is payoff/no-support"
);

const continueMortgage = composeIncomeImpactScenario(withMortgageRow("continueMortgagePayments"));
const continueMortgageSupports = getRiskOnlyMortgageSupport(continueMortgage);
assert.equal(continueMortgageSupports.length, 1);
assert.equal(continueMortgageSupports[0].id, "primary-mortgage");
assert.equal(continueMortgageSupports[0].monthlyAmount, 2400);
assert.equal(baseInput("continueMortgagePayments").lensModel.ongoingSupport.monthlyHousingSupportCost, 3000);
assert.notEqual(
  continueMortgageSupports[0].monthlyAmount,
  baseInput("continueMortgagePayments").lensModel.ongoingSupport.monthlyHousingSupportCost,
  "mortgage support identity should use the mortgage-only payment, not utilities, tax, insurance, HOA, or maintenance"
);
assert.equal(continueMortgageSupports[0].termMonths, 240);
assert.equal(continueMortgageSupports[0].alreadyIncludedInNeeds, true);
assert.equal(continueMortgageSupports[0].alreadyIncludedInSurvivorNeeds, true);
assert.equal(continueMortgageSupports[0].riskOnlyObligation, true);
assert.equal(continueMortgageSupports[0].cashFlowIncluded, false);
assert.ok(
  continueMortgageSupports[0].sourcePaths.includes("scenarioOptions.mortgageTreatmentOverride"),
  "continueMortgagePayments support identity should preserve override source trace"
);
assert.ok(
  continueMortgageSupports[0].sourcePaths.includes("lensModel.treatedDebtPayoff.debts.primary-mortgage"),
  "continueMortgagePayments support identity should preserve mortgage row source trace"
);
assert.equal(
  continueMortgage.postDeathSeries.points.some(function (point) {
    return point.scheduledObligations > 0;
  }),
  false,
  "continueMortgagePayments should not add a second mortgage payment to Layer 3 scheduled obligations"
);
assert.equal(continueMortgage.postDeathSeries.summary.totalScheduledObligations, 0);
assert.equal(continueMortgage.postDeathSeries.points[0].survivorNeeds, 6000);
assert.equal(continueMortgage.postDeathSeries.points[0].netUse, 3500);
assert.ok(
  continueMortgage.postDeathSeries.layer3.warnings.some(function (warning) {
    return warning.code === "scheduled-obligation-already-included-in-needs";
  }),
  "risk-only mortgage obligations should be skipped by cash-flow math because survivor needs already include housing"
);
assert.ok(
  continueMortgage.postDeathSeries.layer3.trace.riskOnlyScheduledObligations.some(function (obligation) {
    return obligation.id === "primary-mortgage" && obligation.cashFlowIncluded === false;
  }),
  "risk-only mortgage identity should remain available in Layer 3 trace"
);

const supportMortgage = composeIncomeImpactScenario(withMortgageRow("followAssumptions", {
  treatmentMode: "support",
  mortgageTreatmentMode: "support",
  mortgageSupportTrace: {
    monthlyMortgagePaymentUsed: 1800,
    supportMonthsUsed: 36,
    monthlyMortgagePaymentSourcePath: "lensModel.ongoingSupport.monthlyMortgagePayment",
    remainingTermMonthsSourcePath: "lensModel.ongoingSupport.mortgageRemainingTermMonths"
  }
}));
const supportMortgageSupports = getRiskOnlyMortgageSupport(supportMortgage);
assert.equal(supportMortgageSupports.length, 1);
assert.equal(supportMortgageSupports[0].monthlyAmount, 1800);
assert.equal(supportMortgageSupports[0].termMonths, 36);
assert.equal(supportMortgageSupports[0].alreadyIncludedInNeeds, true);
assert.equal(supportMortgageSupports[0].riskOnlyObligation, true);
assert.equal(supportMortgage.postDeathSeries.summary.totalScheduledObligations, 0);
assert.equal(supportMortgage.postDeathSeries.points[0].netUse, 3500);
assert.equal(
  supportMortgageSupports[0].sourcePaths.includes("scenarioOptions.mortgageTreatmentOverride"),
  false,
  "followAssumptions support rows should not claim scenario override trace"
);

const missingSchedule = composeIncomeImpactScenario(withMortgageRow("continueMortgagePayments", {
  monthlyMortgagePayment: null,
  remainingTermMonths: null
}));
assert.equal(getScheduledMortgageSupport(missingSchedule).length, 0);
assert.equal(getRiskOnlyMortgageSupport(missingSchedule).length, 0);
assert.ok(
  missingSchedule.dataGaps.some(function (gap) {
    return gap.code === "mortgage-continue-override-schedule-missing";
  }),
  "continueMortgagePayments should not fake an obligation when payment or term is missing"
);

const housingRisk = buildIncomeImpactHousingRisk({ scenario: continueMortgage });
const derivedHousingEventTypes = housingEventTypes(housingRisk);
assert.equal(housingRisk.trace.obligationSourceSummary.mode, "scheduled-obligations");
assert.ok(derivedHousingEventTypes.includes(HOUSING_EVENT_TYPES.mortgagePaymentsContinue));
assert.ok(derivedHousingEventTypes.includes(HOUSING_EVENT_TYPES.housingPaymentAtRisk));
assert.ok(derivedHousingEventTypes.includes(HOUSING_EVENT_TYPES.housingStabilityAtRisk));

console.log("income-loss-impact-mortgage-override-check passed");
