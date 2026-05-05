#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-loss-impact-timeline-calculations.js"
);
const warningLibraryPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "income-impact-warning-events-library.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");
const warningLibrarySource = fs.readFileSync(warningLibraryPath, "utf8");

function loadHelper() {
  const context = {
    console,
    Intl,
    globalThis: null,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(warningLibrarySource, context, { filename: warningLibraryPath });
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    return output
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-06-15",
      clientDateOfBirthStatus: "valid",
      ...(overrides.profileFacts || {})
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredGrossAnnualIncome: 150000,
      insuredNetAnnualIncome: 90000,
      ...(overrides.incomeBasis || {})
    },
    survivorScenario: {
      survivorNetAnnualIncome: 30000,
      survivorGrossAnnualIncome: 45000,
      survivorIncomeStartDelayMonths: 0,
      ...(overrides.survivorScenario || {})
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 90000,
      monthlyTotalEssentialSupportCost: 7500,
      monthlyMortgagePayment: 2000,
      mortgageRemainingTermMonths: 60,
      ...(overrides.ongoingSupport || {})
    },
    existingCoverage: {
      totalExistingCoverage: 500000,
      ...(overrides.existingCoverage || {})
    },
    offsetAssets: {
      totalAvailableOffsetAssetValue: 100000,
      ...(overrides.offsetAssets || {})
    },
    finalExpenses: {
      totalFinalExpenseNeed: 25000,
      ...(overrides.finalExpenses || {})
    },
    transitionNeeds: {
      totalTransitionNeed: 15000,
      ...(overrides.transitionNeeds || {})
    },
    debtPayoff: {
      totalDebtPayoffNeed: 60000,
      mortgageBalance: 250000,
      creditCardBalance: 10000,
      autoLoanBalance: 5000,
      ...(overrides.debtPayoff || {})
    },
    educationSupport: {
      linkedDependentCount: 0,
      currentDependentDetails: [],
      ...(overrides.educationSupport || {})
    },
    ...(overrides.root || {})
  };
}

function calculate(calculateIncomeLossImpactTimeline, lensModel, mortgageTreatmentOverride) {
  const inputModel = cloneJson(lensModel);
  const normalizedOriginal = cloneJson(lensModel);
  const output = calculateIncomeLossImpactTimeline({
    lensModel: inputModel,
    valuationDate: "2026-01-01",
    selectedDeathAge: 50,
    options: {
      scenario: {
        projectionHorizonYears: 10,
        mortgageTreatmentOverride
      }
    }
  });
  assert.deepEqual(inputModel, normalizedOriginal, "helper should not mutate lensModel input.");
  return output;
}

function eventTypes(events) {
  return (Array.isArray(events) ? events : []).map(function (event) {
    return event.type;
  });
}

assert.match(helperSource, /resolveMortgageTreatmentOverride/);
assert.match(helperSource, /applyMortgageTreatmentOverride/);
assert.match(helperSource, /mortgagePayoffAtDeath/);
assert.match(helperSource, /mortgagePaymentsContinue/);
assert.doesNotMatch(helperSource, /runNeedsAnalysis|analysis-methods/);
assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]/);
assert.doesNotMatch(helperSource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);

const pageSource = fs.readFileSync(path.join(repoRoot, "pages", "income-loss-impact.html"), "utf8");
assert.match(pageSource, /Preview only\. This does not change saved assumptions\./);
assert.doesNotMatch(pageSource, /Current mortgage math follows Assumption Controls\./);

const calculateIncomeLossImpactTimeline = loadHelper();
const rawMortgageModel = createLensModel();
const followOutput = calculate(calculateIncomeLossImpactTimeline, rawMortgageModel, "followAssumptions");
assert.equal(followOutput.financialRunway.immediateObligations, 100000);
assert.equal(followOutput.financialRunway.netAvailableResources, 500000);
assert.equal(followOutput.financialRunway.projectionPoints[1].scheduledObligations, 0);
assert.equal(followOutput.financialRunway.mortgageTreatment.override, "followAssumptions");
assert.equal(followOutput.scenarioTimeline.scenario.mortgageTreatmentOverride, "followAssumptions");
assert.equal(followOutput.scenarioTimeline.eventLanes.housing.length, 0);

const payOffOutput = calculate(calculateIncomeLossImpactTimeline, rawMortgageModel, "payOffMortgage");
assert.equal(payOffOutput.financialRunway.immediateObligations, 350000);
assert.equal(payOffOutput.financialRunway.netAvailableResources, 250000);
assert.equal(payOffOutput.financialRunway.mortgageTreatment.override, "payOffMortgage");
assert.equal(payOffOutput.financialRunway.mortgageTreatment.immediatePayoffAmount, 250000);
assert.equal(payOffOutput.financialRunway.mortgageTreatment.payoffAlreadyIncluded, false);
assert.equal(payOffOutput.scenarioTimeline.scenario.mortgageTreatmentOverride, "payOffMortgage");
assert.ok(
  eventTypes(payOffOutput.scenarioTimeline.eventLanes.housing).includes("mortgagePayoffAtDeath"),
  "payOffMortgage should add a housing lane marker."
);
assert.ok(
  payOffOutput.financialRunway.projectionPoints[1].endingBalance < followOutput.financialRunway.projectionPoints[1].endingBalance,
  "payOffMortgage should reduce projected resources when the mortgage payoff was not already included."
);

const treatedMortgageIncludedModel = createLensModel({
  debtPayoff: {
    totalDebtPayoffNeed: undefined,
    mortgageBalance: 250000,
    creditCardBalance: 50000,
    autoLoanBalance: undefined
  },
  root: {
    treatedDebtPayoff: {
      needs: {
        debtPayoffAmount: 300000,
        mortgagePayoffAmount: 250000,
        nonMortgageDebtAmount: 50000
      }
    }
  }
});
const treatedFollowOutput = calculate(calculateIncomeLossImpactTimeline, treatedMortgageIncludedModel, "followAssumptions");
const treatedPayOffOutput = calculate(calculateIncomeLossImpactTimeline, treatedMortgageIncludedModel, "payOffMortgage");
assert.equal(treatedFollowOutput.financialRunway.immediateObligations, 340000);
assert.equal(treatedPayOffOutput.financialRunway.immediateObligations, 340000);
assert.equal(treatedPayOffOutput.financialRunway.mortgageTreatment.payoffAlreadyIncluded, true);
assert.equal(treatedPayOffOutput.financialRunway.mortgageTreatment.immediatePayoffAmount, 0);
assert.equal(
  treatedPayOffOutput.scenarioTimeline.eventLanes.housing.find(function (event) {
    return event.type === "mortgagePayoffAtDeath";
  })?.status,
  "included-in-prepared-debt"
);

const continueOutput = calculate(calculateIncomeLossImpactTimeline, treatedMortgageIncludedModel, "continueMortgagePayments");
assert.equal(continueOutput.financialRunway.immediateObligations, 90000);
assert.equal(continueOutput.financialRunway.netAvailableResources, 510000);
assert.equal(continueOutput.financialRunway.mortgageTreatment.override, "continueMortgagePayments");
assert.equal(continueOutput.financialRunway.mortgageTreatment.scheduledMonthlyPayment, 2000);
assert.equal(continueOutput.financialRunway.mortgageTreatment.scheduledAnnualPayment, 24000);
assert.equal(continueOutput.financialRunway.mortgageTreatment.scheduledTermMonths, 60);
assert.equal(continueOutput.financialRunway.projectionPoints[1].scheduledObligations, 24000);
assert.equal(continueOutput.financialRunway.projectionPoints[5].scheduledObligations, 24000);
assert.equal(continueOutput.financialRunway.projectionPoints[6].scheduledObligations, 0);
assert.equal(continueOutput.scenarioTimeline.resourceSeries.points.find(function (point) {
  return point.id === "post-death-month-1";
})?.scheduledObligations, 2000);
assert.equal(continueOutput.scenarioTimeline.resourceSeries.points.find(function (point) {
  return point.id === "post-death-year-6";
})?.scheduledObligations, 0);
assert.ok(
  eventTypes(continueOutput.scenarioTimeline.eventLanes.housing).includes("mortgagePaymentsContinue"),
  "continueMortgagePayments should add a housing lane marker when payment and term are available."
);

const missingMortgageTimingModel = createLensModel({
  ongoingSupport: {
    annualTotalEssentialSupportCost: 90000,
    monthlyTotalEssentialSupportCost: 7500,
    monthlyMortgagePayment: undefined,
    mortgageRemainingTermMonths: undefined
  },
  debtPayoff: {
    totalDebtPayoffNeed: undefined,
    mortgageBalance: 250000,
    creditCardBalance: 50000,
    autoLoanBalance: undefined
  },
  root: {
    treatedDebtPayoff: {
      needs: {
        debtPayoffAmount: 300000,
        mortgagePayoffAmount: 250000,
        nonMortgageDebtAmount: 50000
      }
    }
  }
});
const missingTimingOutput = calculate(calculateIncomeLossImpactTimeline, missingMortgageTimingModel, "continueMortgagePayments");
assert.equal(missingTimingOutput.financialRunway.immediateObligations, 90000);
assert.equal(missingTimingOutput.financialRunway.projectionPoints[1].scheduledObligations, 0);
assert.deepEqual(
  Array.from(missingTimingOutput.financialRunway.mortgageTreatment.dataGaps.map(function (gap) { return gap.code; }).sort()),
  ["missing-mortgage-payment", "missing-mortgage-term"]
);
assert.ok(missingTimingOutput.dataGaps.some(function (gap) {
  return gap.code === "missing-mortgage-payment";
}));
assert.ok(missingTimingOutput.dataGaps.some(function (gap) {
  return gap.code === "missing-mortgage-term";
}));
assert.ok(
  eventTypes(missingTimingOutput.scenarioTimeline.eventLanes.dataQuality).includes("mortgageDataGap"),
  "continueMortgagePayments should surface a data-quality lane marker when timing facts are missing."
);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "styles.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Mortgage override pass should not change methods, model builder, adapter, Step 3, result pages, quick flows, or styles.css."
);

console.log("income-loss-impact-mortgage-override-check passed");
