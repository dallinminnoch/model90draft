#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const pagePath = "pages/income-loss-impact.html";
const householdEngineScript = "../app/features/lens-analysis/household-financial-position-calculations.js";
const timelineScript = "../app/features/lens-analysis/income-loss-impact-timeline-calculations.js";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
}

function createContext() {
  const storageWrites = [];
  const context = {
    console,
    Intl,
    storageWrites,
    localStorage: {
      setItem(key, value) {
        storageWrites.push({ type: "localStorage", key, value });
      }
    },
    sessionStorage: {
      setItem(key, value) {
        storageWrites.push({ type: "sessionStorage", key, value });
      }
    },
    globalThis: null,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
      insuredGrossAnnualIncome: 180000,
      insuredNetAnnualIncome: 120000,
      spouseOrPartnerGrossAnnualIncome: 45000,
      spouseOrPartnerNetAnnualIncome: 30000,
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
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 500000,
      ...(overrides.treatedExistingCoverageOffset || {})
    },
    existingCoverage: {
      totalExistingCoverage: 900000,
      totalProfileCoverage: 900000,
      ...(overrides.existingCoverage || {})
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 100000,
      assets: [
        {
          assetKey: "cashSavings",
          categoryKey: "cashEquivalents",
          include: true,
          treatedValue: 100000
        }
      ],
      ...(overrides.treatedAssetOffsets || {})
    },
    offsetAssets: {
      totalAvailableOffsetAssetValue: 400000,
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
    treatedDebtPayoff: {
      needs: {
        debtPayoffAmount: 60000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 60000
      },
      debts: [],
      ...(overrides.treatedDebtPayoff || {})
    },
    debtPayoff: {
      totalDebtPayoffNeed: 60000,
      mortgageBalance: 0,
      creditCardBalance: 60000,
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

const pageSource = readRepoFile(pagePath);
const scriptSources = getScriptSources(pageSource);
const householdEngineIndex = scriptSources.indexOf(householdEngineScript);
const timelineIndex = scriptSources.indexOf(timelineScript);
assert.ok(householdEngineIndex >= 0, "Income Impact should load household-financial-position-calculations.js.");
assert.ok(timelineIndex >= 0, "Income Impact should load income-loss-impact-timeline-calculations.js.");
assert.ok(
  householdEngineIndex < timelineIndex,
  "Household financial position engine must load before the Income Impact timeline helper."
);

const timelineSource = readRepoFile("app/features/lens-analysis/income-loss-impact-timeline-calculations.js");
assert.match(timelineSource, /calculateHouseholdFinancialPosition/);
assert.match(timelineSource, /treatedAssetOffsets\.totalTreatedAssetValue/);
assert.match(timelineSource, /preTargetPoints/);
assert.match(timelineSource, /modeledBackcastMonthly/);
assert.doesNotMatch(timelineSource, /householdPosition\.startingResources[\s\S]*treatedExistingCoverageOffset/);

const context = createContext();
loadScript(context, "app/features/lens-analysis/income-impact-warning-events-library.js");
loadScript(context, "app/features/lens-analysis/household-financial-position-calculations.js");
loadScript(context, "app/features/lens-analysis/income-loss-impact-timeline-calculations.js");

const calculateIncomeLossImpactTimeline = context.LensApp.lensAnalysis.calculateIncomeLossImpactTimeline;
assert.equal(typeof calculateIncomeLossImpactTimeline, "function");
assert.equal(typeof context.LensApp.lensAnalysis.calculateHouseholdFinancialPosition, "function");

const lensModel = createLensModel();
const originalLensModel = cloneJson(lensModel);
const output = calculateIncomeLossImpactTimeline({
  lensModel,
  valuationDate: "2026-06-15",
  selectedDeathAge: 50,
  options: {
    scenario: {
      projectionHorizonYears: 10,
      mortgageTreatmentOverride: "followAssumptions"
    }
  }
});
assert.deepEqual(lensModel, originalLensModel, "Income Impact helper should not mutate the Lens model.");
assert.deepEqual(context.storageWrites, [], "Scenario calculation should not write localStorage or sessionStorage.");

assert.equal(output.selectedDeath.date, "2030-06-15");
assert.equal(output.financialRunway.availableAssets, 100000);
assert.equal(output.financialRunway.existingCoverage, 500000);
assert.equal(output.financialRunway.householdPosition.startingBalance, 100000);
assert.equal(output.financialRunway.householdPosition.targetBalance, 340000);
assert.equal(output.financialRunway.householdPositionAtTarget, 340000);
assert.equal(output.financialRunway.householdPosition.preTargetPoints.length, 60);
assert.ok(
  output.financialRunway.householdPosition.warnings.some(function (warning) {
    return warning.code === "modeled-backcast-not-historical";
  }),
  "Household position should warn that modeled pre-target context is not historical account data."
);
assert.equal(
  output.financialRunway.householdPosition.inputs.startingResources.sourcePath,
  "treatedAssetOffsets.totalTreatedAssetValue",
  "Pre-target household position should start from treated assets."
);
assert.ok(
  !output.financialRunway.householdPosition.inputs.startingResources.sourcePaths.includes(
    "treatedExistingCoverageOffset.totalTreatedCoverageOffset"
  ),
  "Coverage should not be a pre-target household asset."
);

const deathPoint = output.scenarioTimeline.resourceSeries.points.find(function (point) {
  return point.id === "death-point";
});
assert.ok(deathPoint, "Scenario timeline should include the death point.");
assert.equal(deathPoint.startingBalance, 740000);
assert.equal(deathPoint.endingBalance, 740000);
assert.equal(output.financialRunway.startingResources, 840000);
assert.equal(output.financialRunway.immediateObligations, 100000);
assert.equal(output.financialRunway.netAvailableResources, 740000);

const firstPostDeathPoint = output.scenarioTimeline.resourceSeries.points.find(function (point) {
  return point.id === "post-death-month-1";
});
assert.ok(firstPostDeathPoint, "Post-death runway should include monthly points.");
assert.equal(firstPostDeathPoint.startingBalance, 740000);
assert.ok(firstPostDeathPoint.endingBalance < deathPoint.endingBalance);

const preDeathPoints = output.scenarioTimeline.resourceSeries.points.filter(function (point) {
  return point.phase === "preDeath";
});
assert.ok(preDeathPoints.length > 1, "Pre-death household position should provide multiple projected points.");
assert.ok(
  preDeathPoints.some(function (point) {
    return point.resolution === "modeledBackcastMonthly" && point.status === "modeledBackcast";
  }),
  "Pre-death timeline should include modeled backcast points supplied by HFP."
);
assert.ok(
  preDeathPoints.some(function (point) {
    return point.resolution === "monthly" && point.status === "projected";
  }),
  "Future death-age timeline should still include forward HFP monthly points."
);
assert.ok(
  preDeathPoints.every(function (point) {
    return point.startingBalance < 500000 && point.endingBalance < 500000;
  }),
  "Pre-death points should not include life insurance coverage."
);
assert.ok(
  new Set(preDeathPoints.map(function (point) { return point.endingBalance; })).size > 1,
  "Pre-death points should no longer be flat when surplus or deficit exists."
);
assert.ok(
  preDeathPoints.at(-1).endingBalance > preDeathPoints[0].endingBalance,
  "Household surplus should increase pre-death balances."
);

const currentDateDeathOutput = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel(),
  valuationDate: "2026-06-15",
  selectedDeathAge: 46,
  options: {
    scenario: {
      projectionHorizonYears: 10,
      mortgageTreatmentOverride: "followAssumptions"
    }
  }
});
const currentDatePreDeathPoints = currentDateDeathOutput.scenarioTimeline.resourceSeries.points.filter(function (point) {
  return point.phase === "preDeath";
});
assert.equal(currentDateDeathOutput.selectedDeath.date, "2026-06-15");
assert.equal(currentDateDeathOutput.financialRunway.householdPosition.durationMonths, 0);
assert.equal(currentDateDeathOutput.financialRunway.householdPosition.preTargetPoints.length, 60);
assert.equal(currentDateDeathOutput.financialRunway.householdPosition.trace.preTargetContext.assetLedgerApplied, true);
assert.equal(currentDateDeathOutput.financialRunway.householdPosition.trace.preTargetContext.cashFlowApplied, true);
assert.equal(currentDateDeathOutput.financialRunway.householdPosition.trace.preTargetContext.reverseAssetGrowthApplied, false);
assert.ok(
  currentDateDeathOutput.financialRunway.householdPosition.preTargetPoints.every(function (point) {
    return Array.isArray(point.assetLedger)
      && point.assetLedger.some(function (row) { return row.categoryKey === "cashEquivalents"; });
  }),
  "Current-date death pre-target context should use treated asset ledger snapshots."
);
assert.ok(
  currentDateDeathOutput.financialRunway.householdPosition.preTargetPoints[0].endingBalance
    < currentDateDeathOutput.financialRunway.householdPosition.preTargetPoints.at(-1).endingBalance,
  "Current-date modeled pre-target points should reflect household surplus or deficit, not stay flat."
);
assert.equal(currentDateDeathOutput.financialRunway.householdPosition.preTargetPoints.at(-1).netCashFlow, 5000);
assert.equal(currentDatePreDeathPoints.length, 61);
const currentDateMonthlyPreDeathPoints = currentDatePreDeathPoints.filter(function (point) {
  return point.resolution === "modeledBackcastMonthly";
});
const currentDatePreDeathThresholdPoint = currentDatePreDeathPoints.find(function (point) {
  return point.resolution === "targetThreshold";
});
assert.equal(currentDateMonthlyPreDeathPoints.length, 60);
assert.ok(
  currentDateMonthlyPreDeathPoints.every(function (point) {
    return point.resolution === "modeledBackcastMonthly" && point.status === "modeledBackcast";
  }),
  "Current-date death should get modeled pre-death points from HFP preTargetPoints."
);
assert.ok(currentDatePreDeathThresholdPoint, "Current-date death should include a pre-death household target threshold point.");
assert.equal(
  currentDatePreDeathThresholdPoint.endingBalance,
  currentDateDeathOutput.financialRunway.householdPosition.targetBalance,
  "Pre-death threshold should show household assets before coverage and immediate death obligations apply."
);
assert.ok(
  currentDatePreDeathPoints.every(function (point) {
    return point.endingBalance < currentDateDeathOutput.financialRunway.existingCoverage;
  }),
  "Modeled pre-death points should not include life insurance coverage."
);
const currentDateDeathPoint = currentDateDeathOutput.scenarioTimeline.resourceSeries.points.find(function (point) {
  return point.id === "death-point";
});
assert.ok(currentDateDeathPoint, "Current-date death should include the death point.");
assert.equal(
  currentDateDeathPoint.startingBalance,
  currentDateDeathOutput.financialRunway.householdPosition.targetBalance
    + currentDateDeathOutput.financialRunway.existingCoverage
    - currentDateDeathOutput.financialRunway.immediateObligations,
  "Death point should still equal household target plus coverage minus immediate obligations."
);

const currentDateMissingIncomeOutput = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel({
    incomeBasis: {
      insuredNetAnnualIncome: null,
      spouseOrPartnerNetAnnualIncome: null
    }
  }),
  valuationDate: "2026-06-15",
  selectedDeathAge: 46,
  options: {
    scenario: {
      projectionHorizonYears: 10,
      mortgageTreatmentOverride: "followAssumptions"
    }
  }
});
assert.equal(currentDateMissingIncomeOutput.financialRunway.householdPosition.status, "partial");
assert.equal(currentDateMissingIncomeOutput.financialRunway.householdPosition.durationMonths, 0);
assert.equal(currentDateMissingIncomeOutput.financialRunway.householdPosition.targetBalance, 100000);
assert.equal(currentDateMissingIncomeOutput.financialRunway.householdPositionAtTarget, 100000);
assert.equal(currentDateMissingIncomeOutput.financialRunway.startingResources, 600000);
assert.equal(currentDateMissingIncomeOutput.financialRunway.netAvailableResources, 500000);
assert.equal(currentDateMissingIncomeOutput.financialRunway.householdPosition.preTargetPoints.length, 60);
assert.ok(
  currentDateMissingIncomeOutput.financialRunway.householdPosition.preTargetPoints.every(function (point) {
    return point.status === "currentPositionContext" && point.endingBalance === 100000;
  }),
  "Missing cash-flow inputs should still provide estimated current-position context from treated assets."
);
const currentDateMissingIncomePreDeathPoints = currentDateMissingIncomeOutput.scenarioTimeline.resourceSeries.points.filter(function (point) {
  return point.phase === "preDeath";
});
const currentDateMissingIncomeContextPoints = currentDateMissingIncomePreDeathPoints.filter(function (point) {
  return point.resolution === "currentPositionContextMonthly";
});
const currentDateMissingIncomeThresholdPoint = currentDateMissingIncomePreDeathPoints.find(function (point) {
  return point.resolution === "targetThreshold";
});
assert.equal(currentDateMissingIncomePreDeathPoints.length, 61);
assert.equal(currentDateMissingIncomeContextPoints.length, 60);
assert.ok(
  currentDateMissingIncomeContextPoints.every(function (point) {
    return point.status === "currentPositionContext" && point.endingBalance === 100000;
  }),
  "Income Impact should map HFP current-position context into visible pre-death asset points."
);
assert.ok(currentDateMissingIncomeThresholdPoint, "Missing-income current-date death should still include a pre-death asset threshold.");
assert.equal(currentDateMissingIncomeThresholdPoint.endingBalance, 100000);
assert.ok(
  currentDateMissingIncomeOutput.financialRunway.householdPosition.dataGaps.some(function (gap) {
    return gap.code === "missing-net-recurring-income";
  }),
  "Missing cash-flow inputs should block cash-flow-modeled backcast, not remove current treated assets at a zero-month target."
);

const deficitOutput = calculateIncomeLossImpactTimeline({
  lensModel: createLensModel({
    incomeBasis: {
      insuredNetAnnualIncome: 40000,
      spouseOrPartnerNetAnnualIncome: 10000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 90000,
      monthlyTotalEssentialSupportCost: 7500
    }
  }),
  valuationDate: "2026-06-15",
  selectedDeathAge: 50,
  options: {
    scenario: {
      projectionHorizonYears: 10,
      mortgageTreatmentOverride: "followAssumptions"
    }
  }
});
assert.equal(deficitOutput.financialRunway.householdPosition.targetBalance, -60000);
const deficitPreDeathPoints = deficitOutput.scenarioTimeline.resourceSeries.points.filter(function (point) {
  return point.phase === "preDeath";
});
assert.ok(
  deficitPreDeathPoints.at(-1).endingBalance < deficitPreDeathPoints[0].endingBalance,
  "Household deficit should reduce pre-death balances."
);

console.log("income-loss-impact-household-position-integration-check passed");
