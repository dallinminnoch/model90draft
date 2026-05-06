const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "household-survivor-runway-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function loadCalculator() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateHouseholdSurvivorRunway;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseInput(overrides = {}) {
  const input = {
    startDate: "2026-01-01",
    projectionHorizonMonths: 12,
    startingResources: {
      value: 120000,
      status: "layer-2-complete",
      sourcePaths: ["layer2.resourcesAfterObligations"],
      trace: {
        source: "layer-2"
      }
    },
    survivorIncomeStreams: [
      {
        id: "survivor-net-income",
        label: "Survivor net income",
        amount: 60000,
        frequency: "annual",
        status: "mature-net",
        incomeType: "net",
        sourcePaths: ["survivorScenario.survivorNetAnnualIncome"]
      }
    ],
    survivorNeedStreams: [
      {
        id: "essential-needs",
        label: "Essential needs",
        amount: 3000,
        frequency: "monthly",
        needType: "essential",
        status: "prepared-bucket",
        sourcePaths: ["ongoingSupport.monthlyTotalEssentialSupportCost"]
      },
      {
        id: "discretionary-needs",
        label: "Discretionary needs",
        amount: 1000,
        frequency: "monthly",
        needType: "discretionary",
        status: "prepared-bucket",
        sourcePaths: ["ongoingSupport.monthlyDiscretionaryPersonalSpending"]
      }
    ],
    scheduledObligations: [
      {
        id: "mortgage-support",
        label: "Mortgage support",
        amount: 500,
        frequency: "monthly",
        termMonths: 6,
        category: "mortgageSupport",
        status: "scheduled",
        sourcePaths: ["debtTreatment.mortgageSupportTrace"]
      }
    ],
    options: {
      cadence: "monthly",
      preserveSignedResources: true
    }
  };

  Object.keys(overrides).forEach(function (key) {
    input[key] = overrides[key];
  });
  return input;
}

function run(input) {
  return loadCalculator()(deepClone(input));
}

function getIssue(items, code) {
  return (Array.isArray(items) ? items : []).find(function (item) {
    return item && item.code === code;
  });
}

function assertSerializable(value) {
  assert.doesNotThrow(function () {
    JSON.parse(JSON.stringify(value));
  });
}

function assertNoForbiddenConcepts() {
  [
    /\bDOM\b/i,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\b/,
    /\bdisplay\b/i,
    /\bchart\b/i,
    /warning-event/i,
    /death-event/i,
    /\bcoverage\b/i,
    /asset-treatment/i,
    /asset treatment/i,
    /final expenses/i
  ].forEach(function (pattern) {
    assert.ok(
      !pattern.test(helperSource),
      `Layer 3 helper source should not contain ${pattern}`
    );
  });
}

const calculateHouseholdSurvivorRunway = loadCalculator();
assert.equal(typeof calculateHouseholdSurvivorRunway, "function");

const first = run(baseInput());
const second = run(baseInput());
assert.equal(JSON.stringify(first), JSON.stringify(second), "Output should be deterministic for identical input.");
assertSerializable(first);
assert.equal(first.status, "complete");
assert.equal(first.startingResources.value, 120000);
assert.equal(JSON.stringify(first.startingResources.sourcePaths), JSON.stringify(["layer2.resourcesAfterObligations"]));
assert.equal(first.summary.totalSurvivorIncome, 60000);
assert.equal(first.summary.totalEssentialNeeds, 36000);
assert.equal(first.summary.totalDiscretionaryNeeds, 12000);
assert.equal(first.summary.totalSurvivorNeeds, 48000);
assert.equal(first.summary.totalScheduledObligations, 3000);
assert.equal(first.summary.totalNetUse, -9000);
assert.equal(first.summary.endingResources, 129000);
assert.equal(first.points[5].scheduledObligations, 500);
assert.equal(first.points[6].scheduledObligations, 0);
assert.equal(first.trace.calculationMethod, "household-survivor-runway-v1");
assert.equal(first.trace.cadence, "monthly");
assert.match(first.trace.scopeStatement, /prior-layer resource conversion/);

const noIncome = run(baseInput({
  survivorIncomeStreams: [
    {
      id: "zero-net-income",
      label: "No survivor income",
      amount: 0,
      frequency: "annual",
      status: "mature-net",
      incomeType: "net",
      sourcePaths: ["survivorScenario.survivorNetAnnualIncome"]
    }
  ]
}));
assert.equal(noIncome.summary.endingResources, 69000);
assert.equal(
  first.summary.endingResources - noIncome.summary.endingResources,
  60000,
  "Net survivor income should offset needs over the projection."
);

const grossIncome = run(baseInput({
  projectionHorizonMonths: 2,
  startingResources: {
    value: 10000,
    sourcePaths: ["layer2.resourcesAfterObligations"]
  },
  survivorIncomeStreams: [
    {
      id: "gross-income",
      label: "Gross survivor income",
      amount: 120000,
      frequency: "annual",
      status: "gross-fallback",
      incomeType: "gross",
      sourcePaths: ["survivorScenario.survivorGrossAnnualIncome"]
    }
  ],
  survivorNeedStreams: [
    {
      id: "essential",
      amount: 1000,
      frequency: "monthly",
      needType: "essential",
      status: "prepared",
      sourcePaths: ["ongoingSupport.monthlyTotalEssentialSupportCost"]
    }
  ],
  scheduledObligations: []
}));
assert.ok(getIssue(grossIncome.dataGaps, "unsafe-gross-income-excluded"));
assert.ok(getIssue(grossIncome.dataGaps, "missing-mature-net-survivor-income"));
assert.equal(grossIncome.summary.totalSurvivorIncome, 0);
assert.equal(grossIncome.summary.endingResources, 8000);

const delayedIncome = run(baseInput({
  projectionHorizonMonths: 3,
  startingResources: {
    value: 1000,
    sourcePaths: ["layer2.resourcesAfterObligations"]
  },
  survivorIncomeStreams: [
    {
      id: "delayed-net-income",
      amount: 1000,
      frequency: "monthly",
      status: "mature-net",
      incomeType: "net",
      startDelayMonths: 2,
      sourcePaths: ["survivorScenario.survivorNetAnnualIncome"]
    }
  ],
  survivorNeedStreams: [
    {
      id: "essential-zero",
      amount: 0,
      frequency: "monthly",
      needType: "essential",
      status: "prepared",
      sourcePaths: ["ongoingSupport.monthlyTotalEssentialSupportCost"]
    }
  ],
  scheduledObligations: []
}));
assert.equal(delayedIncome.points[0].survivorIncome, 0);
assert.equal(delayedIncome.points[1].survivorIncome, 0);
assert.equal(delayedIncome.points[2].survivorIncome, 1000);
assert.equal(delayedIncome.summary.totalSurvivorIncome, 1000);

const mortgagePayoff = run(baseInput({
  scheduledObligations: [
    {
      id: "mortgage-payoff",
      label: "Mortgage payoff",
      amount: 50000,
      frequency: "oneTime",
      category: "mortgagePayoff",
      status: "payoff",
      sourcePaths: ["treatedDebtPayoff.mortgagePayoffAmount"]
    }
  ]
}));
assert.ok(getIssue(mortgagePayoff.dataGaps, "mortgage-payoff-not-layer-3"));
assert.equal(mortgagePayoff.summary.totalScheduledObligations, 0);

const mortgageSupportWithoutSchedule = run(baseInput({
  scheduledObligations: [
    {
      id: "mortgage-support-aggregate",
      label: "Mortgage support",
      amount: 36000,
      frequency: "annual",
      category: "mortgageSupport",
      status: "support",
      sourcePaths: ["treatedDebtPayoff.deferredMortgageSupport"]
    }
  ]
}));
assert.ok(getIssue(mortgageSupportWithoutSchedule.dataGaps, "mortgage-support-schedule-missing"));
assert.equal(mortgageSupportWithoutSchedule.summary.totalScheduledObligations, 0);

const alreadyIncluded = run(baseInput({
  scheduledObligations: [
    {
      id: "housing-already-in-needs",
      label: "Housing support",
      amount: 900,
      frequency: "monthly",
      category: "housing",
      status: "scheduled",
      alreadyIncludedInNeeds: true,
      sourcePaths: ["ongoingSupport.monthlyHousingSupportCost"]
    }
  ]
}));
assert.ok(getIssue(alreadyIncluded.warnings, "scheduled-obligation-already-included-in-needs"));
assert.equal(alreadyIncluded.summary.totalScheduledObligations, 0);
assert.equal(alreadyIncluded.trace.skippedScheduledObligations[0].reason, "already-included-in-needs");

const explicitEducationHealthcare = run(baseInput({
  projectionHorizonMonths: 1,
  startingResources: {
    value: 10000,
    sourcePaths: ["layer2.resourcesAfterObligations"]
  },
  survivorIncomeStreams: [
    {
      id: "zero-net-income",
      amount: 0,
      frequency: "monthly",
      status: "mature-net",
      incomeType: "net",
      sourcePaths: ["survivorScenario.survivorNetAnnualIncome"]
    }
  ],
  survivorNeedStreams: [
    {
      id: "essential-zero",
      amount: 0,
      frequency: "monthly",
      needType: "essential",
      status: "prepared",
      sourcePaths: ["ongoingSupport.monthlyTotalEssentialSupportCost"]
    },
    {
      id: "healthcare-explicit",
      amount: 100,
      frequency: "monthly",
      needType: "healthcare",
      status: "explicit",
      sourcePaths: ["healthcareExpenses.projectedRecurringHealthcareExpenseAmount"]
    },
    {
      id: "education-explicit",
      amount: 200,
      frequency: "monthly",
      needType: "education",
      status: "explicit",
      sourcePaths: ["educationSupport.scheduledEducationNeed"]
    }
  ],
  scheduledObligations: []
}));
assert.ok(getIssue(explicitEducationHealthcare.warnings, "healthcare-stream-explicit-v1"));
assert.ok(getIssue(explicitEducationHealthcare.warnings, "education-stream-explicit-v1"));
assert.equal(explicitEducationHealthcare.summary.totalSurvivorNeeds, 300);
assert.equal(
  first.trace.explicitStreamPolicy,
  "Education and healthcare streams are used only when explicitly supplied."
);

const depletion = run(baseInput({
  projectionHorizonMonths: 3,
  startingResources: {
    value: 1000,
    sourcePaths: ["layer2.resourcesAfterObligations"]
  },
  survivorIncomeStreams: [
    {
      id: "zero-net-income",
      amount: 0,
      frequency: "monthly",
      status: "mature-net",
      incomeType: "net",
      sourcePaths: ["survivorScenario.survivorNetAnnualIncome"]
    }
  ],
  survivorNeedStreams: [
    {
      id: "essential",
      amount: 750,
      frequency: "monthly",
      needType: "essential",
      status: "prepared",
      sourcePaths: ["ongoingSupport.monthlyTotalEssentialSupportCost"]
    }
  ],
  scheduledObligations: []
}));
assert.equal(depletion.depletion.depleted, true);
assert.equal(depletion.depletion.depletionMonthIndex, 2);
assert.equal(depletion.depletion.depletionDate, "2026-03-01");
assert.equal(depletion.depletion.monthsCovered, 2);
assert.equal(depletion.points[2].endingResources, -1250);
assert.equal(depletion.points[2].availableResources, 0);
assert.equal(depletion.points[2].accumulatedUnmetNeed, 1250);
assert.ok(getIssue(depletion.warnings, "negative-resources-accumulated-as-unmet-need"));

const defaultedHorizon = run(baseInput({
  projectionHorizonMonths: undefined
}));
assert.ok(getIssue(defaultedHorizon.warnings, "projection-horizon-defaulted"));
assert.equal(defaultedHorizon.projectionHorizonMonths, 480);

assertNoForbiddenConcepts();

console.log("household-survivor-runway-v1-check passed");
