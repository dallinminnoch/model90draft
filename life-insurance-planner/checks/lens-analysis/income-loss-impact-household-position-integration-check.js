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
assert.equal(preDeathPoints[0].startingBalance, 100000);
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
