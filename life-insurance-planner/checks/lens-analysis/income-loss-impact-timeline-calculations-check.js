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
  assert.match(helperSource, /resolveFinancialRunwayInputs/);
  assert.match(helperSource, /evaluateIncomeImpactWarningEvents/);

  const calculateIncomeLossImpactTimeline = loadHelper();
  assert.strictEqual(
    typeof calculateIncomeLossImpactTimeline,
    "function",
    "helper should export calculateIncomeLossImpactTimeline"
  );

  const currentAgeOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel(),
    valuationDate: "2026-01-01",
    selectedDeathAge: 45
  });
  assert.strictEqual(currentAgeOutput.selectedDeath.date, "2026-01-01");
  assert.strictEqual(currentAgeOutput.selectedDeath.age, 45);
  assert.strictEqual(currentAgeOutput.selectedDeath.source, "selectedDeathAge");
  assert.strictEqual(currentAgeOutput.selectedDeath.status, "resolved");

  const belowCurrentAgeOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel(),
    valuationDate: "2026-01-01",
    selectedDeathAge: 44
  });
  assert.strictEqual(belowCurrentAgeOutput.selectedDeath.date, "2026-01-01");
  assert.strictEqual(belowCurrentAgeOutput.selectedDeath.age, 45);
  assert.strictEqual(belowCurrentAgeOutput.selectedDeath.source, "selectedDeathAge");
  assert.strictEqual(belowCurrentAgeOutput.selectedDeath.status, "resolved");

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
  assert.strictEqual(yearsCard.status, "complete");
  assert.strictEqual(yearsCard.value, 8.333333);
  assert.strictEqual(yearsCard.displayValue, "8 years 4 months");
  assert(output.financialRunway, "helper should return financialRunway output");
  assert.strictEqual(output.financialRunway.status, "complete");
  assert.strictEqual(output.financialRunway.startingResources, 600000);
  assert.strictEqual(output.financialRunway.existingCoverage, 500000);
  assert.strictEqual(output.financialRunway.availableAssets, 100000);
  assert.strictEqual(output.financialRunway.immediateObligations, 100000);
  assert.strictEqual(output.financialRunway.netAvailableResources, 500000);
  assert.strictEqual(output.financialRunway.annualHouseholdNeed, 90000);
  assert.strictEqual(output.financialRunway.annualSurvivorIncome, 30000);
  assert.strictEqual(output.financialRunway.annualShortfall, 60000);
  assert.strictEqual(output.financialRunway.yearsOfSecurity, 8);
  assert.strictEqual(output.financialRunway.monthsOfSecurity, 4);
  assert.strictEqual(output.financialRunway.totalMonthsOfSecurity, 100);
  assert.strictEqual(output.financialRunway.depletionYear, 2038);
  assert.strictEqual(output.financialRunway.depletionDate, "2038-10-15");
  assert.strictEqual(output.financialRunway.projectionMode, "current-dollar");
  assert.strictEqual(output.financialRunway.projectionYears, 40);
  assert.strictEqual(output.financialRunway.projectionPoints.length, 41);
  assert.strictEqual(
    output.financialRunway.inputs.availableAtDeath.assets.sourcePath,
    "offsetAssets.totalAvailableOffsetAssetValue",
    "legacy offsetAssets should remain a fallback when prepared treated assets are absent"
  );
  const startingProjectionPoint = output.financialRunway.projectionPoints[0];
  assert.strictEqual(startingProjectionPoint.yearIndex, 0);
  assert.strictEqual(startingProjectionPoint.date, "2030-06-15");
  assert.strictEqual(startingProjectionPoint.age, 50);
  assert.strictEqual(startingProjectionPoint.startingBalance, 500000);
  assert.strictEqual(startingProjectionPoint.growthAmount, 0);
  assert.strictEqual(startingProjectionPoint.growthRate, 0);
  assert.strictEqual(startingProjectionPoint.annualNeed, 90000);
  assert.strictEqual(startingProjectionPoint.survivorIncomeOffset, 30000);
  assert.strictEqual(startingProjectionPoint.annualShortfall, 60000);
  assert.strictEqual(startingProjectionPoint.scheduledObligations, 0);
  assert.strictEqual(startingProjectionPoint.endingBalance, 500000);
  assert.strictEqual(startingProjectionPoint.status, "starting");
  assert(Array.isArray(startingProjectionPoint.sourcePaths), "projection point should carry sourcePaths");
  assert(
    startingProjectionPoint.sourcePaths.includes("ongoingSupport.annualTotalEssentialSupportCost"),
    "projection point should trace annual need source"
  );
  assert.strictEqual(output.financialRunway.projectionPoints[1].endingBalance, 440000);
  assert.strictEqual(output.financialRunway.projectionPoints[1].growthAmount, 0);
  assert.strictEqual(output.financialRunway.projectionPoints[1].growthRate, 0);
  assert.strictEqual(output.financialRunway.projectionPoints[1].scheduledObligations, 0);
  assert(
    output.financialRunway.projectionPoints.some((point) => point.status === "depleted"),
    "projection should identify depleted points when annual shortfall consumes resources"
  );
  assert.strictEqual(
    output.financialRunway.inputs.projection.survivorIncomeDelay.status,
    "deferred",
    "survivor income delay should be explicitly traced as deferred in the projection scaffold"
  );
  assert.strictEqual(
    output.financialRunway.inputs.projection.scheduledObligations.status,
    "deferred",
    "scheduled obligations should be explicitly scaffolded even before scheduling is implemented"
  );
  assert(
    output.trace.formula.some((formula) => formula.includes("projectionPoints ledger fields")),
    "trace should document the projection ledger formula"
  );
  assert(
    output.trace.formula.some((formula) => formula.includes("yearsOfFinancialSecurity")),
    "trace should document the years of financial security formula"
  );
  assert(
    output.trace.formula.some((formula) => formula.includes("treatedAssetOffsets.totalTreatedAssetValue")),
    "trace should document prepared asset bucket priority"
  );

  const growthOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      root: {
        treatedAssetOffsets: {
          totalTreatedAssetValue: 100000,
          assets: [
            {
              categoryKey: "cashAndCashEquivalents",
              include: true,
              treatedValue: 100000
            }
          ]
        },
        projectedAssetGrowth: {
          includedCategories: [
            {
              categoryKey: "cashAndCashEquivalents",
              currentValue: 100000,
              assumedAnnualGrowthRatePercent: 5
            }
          ]
        }
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  assert.strictEqual(growthOutput.financialRunway.projectionMode, "asset-growth");
  assert.strictEqual(growthOutput.financialRunway.availableAssets, 100000);
  assert.strictEqual(growthOutput.financialRunway.inputs.projection.assetGrowth.growthRate, 5);
  assert.strictEqual(growthOutput.financialRunway.projectionPoints[1].growthAmount, 25000);
  assert.strictEqual(growthOutput.financialRunway.projectionPoints[1].endingBalance, 465000);
  assert(
    growthOutput.financialRunway.totalMonthsOfSecurity > output.financialRunway.totalMonthsOfSecurity,
    "valid prepared asset growth should extend the runway"
  );

  const invalidGrowthOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      root: {
        treatedAssetOffsets: {
          totalTreatedAssetValue: 100000,
          assets: [
            {
              categoryKey: "cashAndCashEquivalents",
              include: true,
              treatedValue: 100000
            }
          ]
        },
        projectedAssetGrowth: {
          includedCategories: [
            {
              categoryKey: "taxableBrokerage",
              currentValue: 100000,
              assumedAnnualGrowthRatePercent: 7
            }
          ]
        }
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  assert.strictEqual(invalidGrowthOutput.financialRunway.projectionMode, "current-dollar");
  assert.strictEqual(invalidGrowthOutput.financialRunway.projectionPoints[1].growthAmount, 0);
  assert(
    invalidGrowthOutput.financialRunway.inputs.projection.assetGrowth.warnings.some((warning) => warning.code === "asset-growth-runway-category-mapping-incomplete"),
    "invalid or incomplete category growth mapping should not invent a return rate"
  );

  const lowProjectionOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel(),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50,
    options: {
      projectionYears: 2
    }
  });
  assert.strictEqual(lowProjectionOutput.financialRunway.projectionYears, 5);
  assert.strictEqual(lowProjectionOutput.financialRunway.projectionPoints.length, 6);

  const highProjectionOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel(),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50,
    options: {
      projectionYears: 125
    }
  });
  assert.strictEqual(highProjectionOutput.financialRunway.projectionYears, 100);
  assert.strictEqual(highProjectionOutput.financialRunway.projectionPoints.length, 101);

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
  assert.strictEqual(noShortfallCard.status, "no-shortfall");
  assert.strictEqual(noShortfallCard.displayValue, "No shortfall");
  assert.strictEqual(noShortfallOutput.financialRunway.status, "no-shortfall");
  assert.strictEqual(noShortfallOutput.financialRunway.annualShortfall, 0);
  assert.strictEqual(noShortfallOutput.financialRunway.depletionDate, null);
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
  assert.strictEqual(missingShortfallCard.status, "not-available");
  assert.strictEqual(missingShortfallCard.displayValue, "Not available");
  assert.strictEqual(missingShortfallOutput.financialRunway.status, "not-available");
  assert.deepEqual(missingShortfallOutput.financialRunway.projectionPoints, []);
  assert(
    findWarning(missingShortfallOutput, "missing-annual-shortfall"),
    "missing shortfall inputs should warn and avoid invented years"
  );

  const missingCoverageOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      existingCoverage: {
        totalExistingCoverage: undefined
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  const missingCoverageCard = findCard(missingCoverageOutput, "yearsOfFinancialSecurity");
  assert.strictEqual(missingCoverageOutput.financialRunway.status, "partial-estimate");
  assert.strictEqual(missingCoverageCard.status, "partial-estimate");
  assert.strictEqual(missingCoverageCard.displayValue, "Partial runway estimate");
  assert(missingCoverageOutput.financialRunway.projectionPoints.length > 0);
  assert.notStrictEqual(
    missingCoverageCard.displayValue,
    "0 years 0 months",
    "missing coverage should not produce a clean complete 0 years 0 months display"
  );
  assert(findDataGap(missingCoverageOutput, "missing-existing-coverage"));
  assert(findWarning(missingCoverageOutput, "partial-financial-runway"));

  const missingAssetsOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      offsetAssets: {
        totalAvailableOffsetAssetValue: undefined,
        cashSavings: {},
        currentEmergencyFund: {},
        brokerageAccounts: {}
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  assert.strictEqual(missingAssetsOutput.financialRunway.status, "partial-estimate");
  assert.strictEqual(findCard(missingAssetsOutput, "yearsOfFinancialSecurity").displayValue, "Partial runway estimate");
  assert(missingAssetsOutput.financialRunway.projectionPoints.length > 0);
  assert(findDataGap(missingAssetsOutput, "missing-assets-liquidity"));

  const missingSurvivorIncomeOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      survivorScenario: {
        survivorNetAnnualIncome: undefined,
        survivorGrossAnnualIncome: undefined
      },
      incomeBasis: {
        spouseOrPartnerNetAnnualIncome: undefined,
        spouseOrPartnerGrossAnnualIncome: undefined
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  assert.strictEqual(missingSurvivorIncomeOutput.financialRunway.status, "partial-estimate");
  assert.strictEqual(missingSurvivorIncomeOutput.financialRunway.annualHouseholdNeed, 90000);
  assert.strictEqual(missingSurvivorIncomeOutput.financialRunway.annualSurvivorIncome, null);
  assert.strictEqual(missingSurvivorIncomeOutput.financialRunway.annualShortfall, 90000);
  assert(missingSurvivorIncomeOutput.financialRunway.projectionPoints.length > 0);
  assert.strictEqual(missingSurvivorIncomeOutput.financialRunway.projectionPoints[0].survivorIncomeOffset, 0);
  assert(findDataGap(missingSurvivorIncomeOutput, "missing-survivor-income"));
  assert(findWarning(missingSurvivorIncomeOutput, "missing-survivor-income-runway-assumed-zero"));

  const missingObligationsOutput = calculateIncomeLossImpactTimeline({
    lensModel: createFullLensModel({
      finalExpenses: {
        totalFinalExpenseNeed: undefined
      },
      transitionNeeds: {
        totalTransitionNeed: undefined
      },
      debtPayoff: {
        totalDebtPayoffNeed: undefined,
        mortgageBalance: undefined,
        creditCardBalance: undefined,
        autoLoanBalance: undefined
      }
    }),
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
  assert.strictEqual(missingObligationsOutput.financialRunway.status, "partial-estimate");
  assert(missingObligationsOutput.financialRunway.projectionPoints.length > 0);
  assert(findDataGap(missingObligationsOutput, "missing-immediate-obligations"));

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
  assert.strictEqual(typeof sparseOutput.financialRunway, "object");
  assert(Array.isArray(sparseOutput.financialRunway.projectionPoints), "financialRunway projection points should be stable");
  assert.strictEqual(typeof sparseOutput.scenarioTimeline, "object");
  assert(Array.isArray(sparseOutput.scenarioTimeline.resourceSeries.points), "scenarioTimeline resource points should be stable");
  assert(Array.isArray(sparseOutput.scenarioTimeline.pivotalEvents.risks), "scenarioTimeline risk events should be stable");
  assert(Array.isArray(sparseOutput.scenarioTimeline.pivotalEvents.stable), "scenarioTimeline stable events should be stable");
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
