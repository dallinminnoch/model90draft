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
  "income-loss-impact-timeline-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadHelper() {
  const context = {
    console,
    Intl
  };
  context.globalThis = context;
  context.LensApp = {
    lensAnalysis: {}
  };
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline;
}

function createFullLensModel(overrides = {}) {
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
      survivorIncomeStartDelayMonths: 3,
      ...(overrides.survivorScenario || {})
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 90000,
      monthlyTotalEssentialSupportCost: 7500,
      ...(overrides.ongoingSupport || {})
    },
    existingCoverage: {
      totalExistingCoverage: 500000,
      ...(overrides.existingCoverage || {})
    },
    offsetAssets: {
      totalAvailableOffsetAssetValue: 100000,
      cashSavings: { availableValue: 50000 },
      currentEmergencyFund: { availableValue: 20000 },
      brokerageAccounts: { availableValue: 30000 },
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
      linkedDependentCount: 1,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2015-09-01"
        }
      ],
      totalEducationFundingNeed: 80000,
      ...(overrides.educationSupport || {})
    },
    ...(overrides.root || {})
  };
}

function findEvent(output, type) {
  return output.timelineEvents.find((event) => event.type === type);
}

function findDataGap(output, code) {
  return output.dataGaps.find((dataGap) => dataGap.code === code);
}

function findWarning(output, code) {
  return output.warnings.find((warning) => warning.code === code);
}

function findCard(output, id) {
  return output.summaryCards.find((card) => card.id === id);
}

function run() {
  assert.doesNotMatch(helperSource, /runNeedsAnalysis/);
  assert.doesNotMatch(helperSource, /analysis-methods/);
  assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]/);
  assert.doesNotMatch(helperSource, /\bwindow\s*[.\[]/);
  assert.doesNotMatch(helperSource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);

  const calculateIncomeLossImpactTimeline = loadHelper();
  assert.strictEqual(
    typeof calculateIncomeLossImpactTimeline,
    "function",
    "helper should export calculateIncomeLossImpactTimeline"
  );

  const fullLensModel = createFullLensModel();
  const profileRecord = {
    dependentDetails: JSON.stringify([
      {
        id: "fallback-child",
        dateOfBirth: "2016-01-01"
      }
    ])
  };
  const originalLensModel = cloneJson(fullLensModel);
  const originalProfileRecord = cloneJson(profileRecord);
  const output = calculateIncomeLossImpactTimeline({
    lensModel: fullLensModel,
    profileRecord,
    valuationDate: "2026-01-01",
    selectedDeathAge: 50,
    needsResult: {
      recommendationAmount: 999999999,
      supportDurationYears: 99
    }
  });

  assert.deepStrictEqual(fullLensModel, originalLensModel, "helper should not mutate lensModel");
  assert.deepStrictEqual(profileRecord, originalProfileRecord, "helper should not mutate profileRecord");
  assert.strictEqual(output.version, 1);
  assert.strictEqual(output.selectedDeath.date, "2030-06-15");
  assert.strictEqual(output.selectedDeath.age, 50);
  assert.strictEqual(output.selectedDeath.source, "selectedDeathAge");
  assert.strictEqual(output.selectedDeath.status, "resolved");

  const dateDrivenOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel(),
    valuationDate: "2026-01-01",
    selectedDeathDate: "2031-06-14"
  });
  assert.strictEqual(dateDrivenOutput.selectedDeath.age, 50);
  assert.strictEqual(dateDrivenOutput.selectedDeath.date, "2031-06-14");
  assert.strictEqual(dateDrivenOutput.selectedDeath.source, "selectedDeathDate");

  const missingDobOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      profileFacts: {
        clientDateOfBirth: ""
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathDate: "2030-01-01"
  });
  assert(findDataGap(missingDobOutput, "missing-client-dob"), "DOB gap should be returned");
  assert.strictEqual(missingDobOutput.selectedDeath.date, "2030-01-01");
  assert.strictEqual(missingDobOutput.selectedDeath.age, null);
  assert.strictEqual(missingDobOutput.selectedDeath.status, "date-only");

  const incomeStops = findEvent(output, "incomeStops");
  assert(incomeStops, "insured income should create an incomeStops event");
  assert.strictEqual(incomeStops.amount, 120000);

  const survivorIncome = findEvent(output, "survivorIncomeContinues");
  assert(survivorIncome, "survivor income should create a survivorIncomeContinues event");
  assert.strictEqual(survivorIncome.date, "2030-09-15");
  assert.strictEqual(survivorIncome.amount, 30000);

  const coverage = findEvent(output, "coverageAvailable");
  assert(coverage, "existing coverage should create a coverageAvailable event");
  assert.strictEqual(coverage.amount, 500000);

  const finalExpenses = findEvent(output, "finalExpensesDue");
  assert(finalExpenses, "final expenses should create a finalExpensesDue event");
  assert.strictEqual(finalExpenses.amount, 25000);

  const debt = findEvent(output, "debtObligation");
  assert(debt, "debt facts should create a debtObligation event");
  assert.strictEqual(debt.amount, 15000);

  const mortgage = findEvent(output, "mortgageObligation");
  assert(mortgage, "mortgage facts should create a mortgageObligation event");
  assert.strictEqual(mortgage.amount, 250000);

  const dependentMilestone = findEvent(output, "dependentMilestone");
  assert(dependentMilestone, "dependent DOB should create a dependentMilestone event");
  assert.strictEqual(dependentMilestone.date, "2033-09-01");

  const educationWindow = findEvent(output, "educationWindow");
  assert(educationWindow, "education facts and dependent DOB should create an educationWindow event");
  assert.strictEqual(educationWindow.amount, 80000);

  const dependentCountNoDobOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      educationSupport: {
        linkedDependentCount: 2,
        currentDependentDetails: [],
        totalEducationFundingNeed: 100000
      }
    }),
    profileRecord: {
      dependentDetails: []
    },
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  assert(
    findDataGap(dependentCountNoDobOutput, "missing-dependent-dobs"),
    "dependent count without DOB details should create a missing-dependent-dobs gap"
  );
  assert(
    findDataGap(dependentCountNoDobOutput, "missing-education-window-dates"),
    "education funding without dependent dates should create a missing-education-window-dates gap"
  );

  const yearsCard = findCard(output, "yearsOfFinancialSecurity");
  assert(yearsCard, "Years of Financial Security summary card should exist");
  assert.strictEqual(yearsCard.status, "available");
  assert.strictEqual(yearsCard.value, 8.333333);
  assert.strictEqual(yearsCard.displayValue, "8 years 4 months");
  assert(
    output.trace.formula.some((formula) => formula.includes("yearsOfFinancialSecurity")),
    "trace should document the years of financial security formula"
  );

  const noShortfallOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      survivorScenario: {
        survivorNetAnnualIncome: 50000
      },
      ongoingSupport: {
        annualTotalEssentialSupportCost: 30000
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  const noShortfallCard = findCard(noShortfallOutput, "yearsOfFinancialSecurity");
  assert.strictEqual(noShortfallCard.value, null);
  assert.strictEqual(noShortfallCard.status, "noShortfall");
  assert.strictEqual(noShortfallCard.displayValue, "No shortfall");
  assert(
    findWarning(noShortfallOutput, "no-annual-household-shortfall"),
    "invalid or non-positive shortfall should not invent years"
  );

  const missingShortfallOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      survivorScenario: {
        survivorNetAnnualIncome: undefined
      },
      ongoingSupport: {
        annualTotalEssentialSupportCost: undefined,
        monthlyTotalEssentialSupportCost: undefined
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  const missingShortfallCard = findCard(missingShortfallOutput, "yearsOfFinancialSecurity");
  assert.strictEqual(missingShortfallCard.value, null);
  assert.strictEqual(missingShortfallCard.status, "notAvailable");
  assert.strictEqual(missingShortfallCard.displayValue, "Not available");
  assert(
    findWarning(missingShortfallOutput, "missing-annual-shortfall"),
    "missing shortfall inputs should warn and avoid invented years"
  );

  const sparseOutput = calculateIncomeLossImpactTimeline({
    lensModel: {},
    valuationDate: "2026-01-01",
    selectedDeathDate: "2030-01-01"
  });
  assert(Array.isArray(sparseOutput.timelineEvents), "timelineEvents should be stable");
  assert(Array.isArray(sparseOutput.summaryCards), "summaryCards should be stable");
  assert.strictEqual(sparseOutput.summaryCards.length, 4);
  assert(Array.isArray(sparseOutput.warnings), "warnings should be stable");
  assert(Array.isArray(sparseOutput.dataGaps), "dataGaps should be stable");
  assert.strictEqual(typeof sparseOutput.householdImpact, "object");
  assert.strictEqual(typeof sparseOutput.incomeImpact, "object");
  assert.strictEqual(typeof sparseOutput.obligations, "object");
  assert.strictEqual(typeof sparseOutput.liquidity, "object");
  assert(Array.isArray(sparseOutput.dependents.rows), "dependent rows should be stable");
  assert(Array.isArray(sparseOutput.dependents.milestones), "dependent milestones should be stable");
  assert(findDataGap(sparseOutput, "missing-client-dob"), "sparse output should report missing DOB");
  assert(findDataGap(sparseOutput, "missing-insured-income"), "sparse output should report missing insured income");
  assert(
    findDataGap(sparseOutput, "missing-annual-essential-expenses"),
    "sparse output should report missing annual expenses"
  );

  console.log("income-loss-impact-timeline-calculations-check passed");
}

run();
