#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
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
const helperSource = fs.readFileSync(helperPath, "utf8");

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
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline;
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1980-06-15",
      clientDateOfBirthStatus: "valid"
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredGrossAnnualIncome: 150000,
      insuredNetAnnualIncome: 90000
    },
    survivorScenario: {
      survivorNetAnnualIncome: 30000,
      survivorGrossAnnualIncome: 45000,
      survivorIncomeStartDelayMonths: 3
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 90000,
      monthlyTotalEssentialSupportCost: 7500
    },
    existingCoverage: {
      totalExistingCoverage: 500000
    },
    offsetAssets: {
      totalAvailableOffsetAssetValue: 100000,
      cashSavings: { availableValue: 50000 },
      currentEmergencyFund: { availableValue: 20000 },
      brokerageAccounts: { availableValue: 30000 }
    },
    finalExpenses: {
      totalFinalExpenseNeed: 25000
    },
    transitionNeeds: {
      totalTransitionNeed: 15000
    },
    debtPayoff: {
      totalDebtPayoffNeed: 60000,
      mortgageBalance: 250000,
      creditCardBalance: 10000,
      autoLoanBalance: 5000
    },
    educationSupport: {
      linkedDependentCount: 1,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2015-09-01"
        }
      ],
      totalEducationFundingNeed: 80000
    },
    ...overrides
  };
}

function calculate(calculateIncomeLossImpactTimeline, lensModel) {
  return calculateIncomeLossImpactTimeline({
    lensModel,
    valuationDate: "2026-01-01",
    selectedDeathAge: 50
  });
}

function findEvent(output, type) {
  return output.timelineEvents.find((event) => event.type === type);
}

assert.match(helperSource, /resolveFinancialRunwayInputs/);
assert.doesNotMatch(helperSource, /runNeedsAnalysis|analysis-methods/);
assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]/);
assert.doesNotMatch(helperSource, /\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);

const calculateIncomeLossImpactTimeline = loadHelper();

const treatedBucketModel = createLensModel({
  assetFacts: {
    assets: [
      {
        assetId: "cash-record-1",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "savingsAccount",
        label: "Cash savings",
        currentValue: 2000000,
        source: "protectionModeling.data.assetRecords"
      }
    ],
    totalReportedAssetValue: 2000000
  },
  treatedExistingCoverageOffset: {
    totalTreatedCoverageOffset: 400000
  },
  treatedAssetOffsets: {
    totalTreatedAssetValue: 2000000
  },
  treatedDebtPayoff: {
    needs: {
      debtPayoffAmount: 70000,
      mortgagePayoffAmount: 50000,
      nonMortgageDebtAmount: 20000
    }
  }
});
const treatedOutput = calculate(calculateIncomeLossImpactTimeline, treatedBucketModel);
assert.strictEqual(treatedOutput.financialRunway.existingCoverage, 400000);
assert.strictEqual(treatedOutput.financialRunway.availableAssets, 2000000);
assert.strictEqual(treatedOutput.financialRunway.startingResources, 2400000);
assert.strictEqual(treatedOutput.financialRunway.immediateObligations, 110000);
assert.strictEqual(treatedOutput.financialRunway.netAvailableResources, 2290000);
assert.strictEqual(treatedOutput.financialRunway.annualHouseholdNeed, 90000);
assert.strictEqual(treatedOutput.financialRunway.annualSurvivorIncome, 30000);
assert.strictEqual(treatedOutput.financialRunway.annualShortfall, 60000);
assert.strictEqual(
  treatedOutput.financialRunway.inputs.availableAtDeath.coverage.sourcePath,
  "treatedExistingCoverageOffset.totalTreatedCoverageOffset"
);
assert.strictEqual(
  treatedOutput.financialRunway.inputs.availableAtDeath.assets.sourcePath,
  "treatedAssetOffsets.totalTreatedAssetValue"
);
assert.strictEqual(
  treatedOutput.financialRunway.inputs.immediateObligations.debtPayoff.sourcePath,
  "treatedDebtPayoff.needs.debtPayoffAmount"
);

const rawFallbackOutput = calculate(calculateIncomeLossImpactTimeline, createLensModel());
assert.strictEqual(rawFallbackOutput.financialRunway.existingCoverage, 500000);
assert.strictEqual(rawFallbackOutput.financialRunway.availableAssets, 100000);
assert.strictEqual(
  rawFallbackOutput.financialRunway.inputs.availableAtDeath.assets.sourcePath,
  "offsetAssets.totalAvailableOffsetAssetValue"
);
assert.strictEqual(
  rawFallbackOutput.financialRunway.inputs.availableAtDeath.assets.status,
  "legacy-offset-assets-fallback"
);

const projectedExcludedOutput = calculate(calculateIncomeLossImpactTimeline, createLensModel({
  treatedAssetOffsets: {
    totalTreatedAssetValue: 2000000
  },
  projectedAssetOffset: {
    sourceMode: "projectedOffsets",
    activationStatus: "future-inactive",
    currentTreatedAssetOffset: 2000000,
    projectedGrowthAdjustment: 500000,
    effectiveProjectedAssetOffset: 2500000,
    projectionYears: 10,
    metadata: {
      consumedByMethods: false
    }
  }
}));
assert.strictEqual(projectedExcludedOutput.financialRunway.availableAssets, 2000000);
assert.strictEqual(
  projectedExcludedOutput.financialRunway.inputs.availableAtDeath.assets.sourcePath,
  "treatedAssetOffsets.totalTreatedAssetValue"
);
assert.strictEqual(
  projectedExcludedOutput.financialRunway.inputs.availableAtDeath.projectedAssetOffsetCandidate.status,
  "excluded"
);

const projectedActiveOutput = calculate(calculateIncomeLossImpactTimeline, createLensModel({
  treatedAssetOffsets: {
    totalTreatedAssetValue: 2000000
  },
  projectedAssetOffset: {
    sourceMode: "projectedOffsets",
    activationStatus: "method-active",
    currentTreatedAssetOffset: 2000000,
    projectedGrowthAdjustment: 500000,
    effectiveProjectedAssetOffset: 2500000,
    projectionYears: 10,
    metadata: {
      consumedByMethods: true
    }
  }
}));
assert.strictEqual(projectedActiveOutput.financialRunway.availableAssets, 2500000);
assert.strictEqual(
  projectedActiveOutput.financialRunway.inputs.availableAtDeath.assets.sourcePath,
  "projectedAssetOffset.effectiveProjectedAssetOffset"
);
assert.strictEqual(
  projectedActiveOutput.financialRunway.inputs.availableAtDeath.projectedAssetOffsetCandidate.status,
  "method-active-used"
);

const increasedIncomeOutput = calculate(calculateIncomeLossImpactTimeline, createLensModel({
  incomeBasis: {
    annualIncomeReplacementBase: 300000,
    insuredGrossAnnualIncome: 350000,
    insuredNetAnnualIncome: 250000
  }
}));
assert.strictEqual(findEvent(increasedIncomeOutput, "incomeStops").amount, 300000);
assert.strictEqual(
  increasedIncomeOutput.financialRunway.annualShortfall,
  60000,
  "annual shortfall should use support/expense bucket minus survivor income, not insured income directly"
);

console.log("income-loss-impact-bucket-alignment-check passed");
