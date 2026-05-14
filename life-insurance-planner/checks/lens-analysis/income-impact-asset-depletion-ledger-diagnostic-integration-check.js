#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");
const ledgerPath = path.join(featureRoot, "income-impact-asset-depletion-ledger-calculations.js");
const composerPath = path.join(featureRoot, "income-impact-scenario-composer-calculations.js");
const incomeLossPagePath = path.join(repoRoot, "pages", "income-loss-impact.html");

const ledgerSource = fs.readFileSync(ledgerPath, "utf8");
const composerSource = fs.readFileSync(composerPath, "utf8");
const incomeLossPageSource = fs.readFileSync(incomeLossPagePath, "utf8");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(ledgerSource, context, { filename: ledgerPath });
  vm.runInContext(composerSource, context, { filename: composerPath });
  return context;
}

function makeLayer3Points(startingResources, months, scheduledByMonth = {}) {
  let resources = startingResources;
  let accumulatedUnmetNeed = 0;
  return Array.from({ length: months }, function (_, monthIndex) {
    const survivorNeeds = 100;
    const survivorIncome = 0;
    const scheduledObligations = scheduledByMonth[monthIndex] || 0;
    const netUse = survivorNeeds + scheduledObligations - survivorIncome;
    resources = Number((resources - netUse).toFixed(2));
    accumulatedUnmetNeed = Number((accumulatedUnmetNeed + Math.max(-resources, 0)).toFixed(2));
    return {
      monthIndex,
      date: `2031-${String(monthIndex + 1).padStart(2, "0")}-01`,
      startingResources: Number((resources + netUse).toFixed(2)),
      survivorIncome,
      survivorNeeds,
      scheduledObligations,
      netUse,
      endingResources: resources,
      accumulatedUnmetNeed
    };
  });
}

function makeLayer1Output() {
  return {
    status: "complete",
    durationMonths: 60,
    points: [
      {
        date: "2031-01-01",
        monthIndex: 60,
        endingAssets: 1100,
        assetLedger: [
          {
            id: "cash",
            categoryKey: "cashAndCashEquivalents",
            label: "Cash",
            currentValue: 100,
            projectedValue: 100,
            includedInProjection: true,
            sourcePaths: ["assetFacts.assets.cash"]
          }
        ]
      }
    ],
    summary: {
      startingAssets: 1100,
      endingAssets: 1100
    },
    warnings: [],
    dataGaps: [],
    sourcePaths: []
  };
}

function makeLayer2Output(overrides = {}) {
  const assetRows = overrides.assetRows || [
    {
      id: "cash",
      categoryKey: "cashAndCashEquivalents",
      label: "Cash",
      projectedValue: 100,
      included: true,
      treatedValue: 100,
      treatmentStatus: "treated",
      sourcePaths: ["layer2.cash"]
    },
    {
      id: "emergency",
      categoryKey: "emergencyFund",
      label: "Emergency fund",
      projectedValue: 200,
      included: true,
      treatedValue: 200,
      treatmentStatus: "treated",
      sourcePaths: ["layer2.emergency"]
    },
    {
      id: "taxable",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable brokerage",
      projectedValue: 300,
      included: true,
      treatedValue: 300,
      treatmentStatus: "treated",
      sourcePaths: ["layer2.taxable"]
    },
    {
      id: "retirement",
      categoryKey: "traditionalRetirementAssets",
      label: "Traditional IRA",
      projectedValue: 500,
      included: true,
      treatedValue: 500,
      treatmentStatus: "treated",
      sourcePaths: ["layer2.retirement"]
    }
  ];
  const treatedAssetTotal = assetRows.reduce(function (total, row) {
    return total + (row.included === true ? row.treatedValue : 0);
  }, 0);
  const existingCoverage = overrides.existingCoverage ?? 200;
  const immediateObligations = overrides.immediateObligations ?? 100;
  return {
    status: "complete",
    eventDate: "2031-01-01",
    assetTreatmentAtDeath: {
      treatedAssetValue: treatedAssetTotal,
      totalTreatmentReduction: 0,
      rows: assetRows
    },
    existingCoverage: {
      treatedCoverageAmount: existingCoverage,
      includedPolicyCount: 1,
      excludedPolicyCount: 0,
      sourcePaths: ["layer2.existingCoverage"],
      trace: { source: "fixture" }
    },
    immediateObligations: {
      finalExpenses: { value: immediateObligations, sourcePaths: ["layer2.finalExpenses"] },
      transitionNeeds: null,
      debtPayoff: null,
      mortgagePayoff: null,
      deferredMortgageSupport: 100,
      totalImmediateObligations: immediateObligations,
      sourcePaths: ["layer2.finalExpenses"]
    },
    resources: {
      grossProjectedAssetsBeforeTreatment: treatedAssetTotal,
      survivorAvailableTreatedAssets: treatedAssetTotal,
      existingCoverage,
      totalResourcesBeforeObligations: treatedAssetTotal + existingCoverage,
      immediateObligations,
      resourcesAfterObligations: treatedAssetTotal + existingCoverage - immediateObligations
    },
    warnings: [],
    dataGaps: [],
    sourcePaths: []
  };
}

function makeLayer3Output(startingResources) {
  const points = makeLayer3Points(startingResources, 13, { 1: 50, 2: 50 });
  return {
    status: "complete",
    points,
    summary: {
      accumulatedUnmetNeed: points[points.length - 1].accumulatedUnmetNeed
    },
    depletion: {
      depleted: false,
      monthsCovered: points.length,
      precision: "monthly"
    },
    warnings: [],
    dataGaps: [],
    sourcePaths: []
  };
}

function makeInput() {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2031-01-01",
    selectedDeathAge: 51,
    projectionHorizonMonths: 13,
    lensModel: {
      assetFacts: {
        assets: []
      },
      ongoingSupport: {
        annualTotalEssentialSupportCost: 1200
      },
      survivorScenario: {
        survivorNetAnnualIncome: 0
      },
      treatedDebtPayoff: {
        debts: [
          {
            debtFactId: "mortgage-support",
            label: "Mortgage support",
            isMortgage: true,
            treatmentMode: "support",
            mortgageTreatmentMode: "support",
            included: true,
            mortgageSupportTrace: {
              monthlyMortgagePaymentUsed: 50,
              supportMonthsUsed: 2
            },
            sourcePaths: ["treatedDebtPayoff.debts.mortgageSupport"]
          }
        ]
      }
    },
    analysisSettings: {},
    scenarioOptions: {}
  };
}

function composeWithFixture(layer2Output) {
  const context = createContext();
  const lensAnalysis = context.LensApp.lensAnalysis;
  const captured = {};
  const startingResources = layer2Output.resources.resourcesAfterObligations;
  const layer3Output = makeLayer3Output(startingResources);

  lensAnalysis.calculateHouseholdWealthProjection = function (input) {
    captured.layer1Input = cloneJson(input);
    return makeLayer1Output();
  };
  lensAnalysis.calculateHouseholdDeathEventAvailability = function (input) {
    captured.layer2Input = cloneJson(input);
    return cloneJson(layer2Output);
  };
  lensAnalysis.calculateHouseholdSurvivorRunway = function (input) {
    captured.layer3Input = cloneJson(input);
    return cloneJson(layer3Output);
  };

  const input = makeInput();
  const inputSnapshot = JSON.stringify(input);
  const scenario = lensAnalysis.composeIncomeImpactScenario(input);
  return {
    scenario,
    captured,
    layer2Output,
    layer3Output,
    inputSnapshot,
    inputAfter: JSON.stringify(input),
    lensAnalysis
  };
}

assert.equal(incomeLossPageSource.includes("income-impact-asset-depletion-ledger-calculations.js"), true);
assert.ok(
  incomeLossPageSource.indexOf("income-impact-asset-depletion-ledger-calculations.js")
    < incomeLossPageSource.indexOf("income-impact-scenario-composer-calculations.js"),
  "ledger helper should load before the scenario composer in the Income Loss Impact page"
);

const context = createContext();
assert.equal(
  typeof context.LensApp.lensAnalysis.buildIncomeImpactAssetDepletionLedger,
  "function",
  "ledger helper should expose a browser-global function before composer usage"
);

const main = composeWithFixture(makeLayer2Output());
assert.equal(main.inputAfter, main.inputSnapshot, "composer should not mutate its input");
assert.equal(
  JSON.stringify(main.scenario.postDeathSeries.points),
  JSON.stringify(main.layer3Output.points),
  "aggregate postDeathSeries should remain the Layer 3 output"
);

const diagnostic = main.scenario.trace.layer3.assetDepletionLedgerDiagnostic;
assert.equal(diagnostic.status, "ready");
assert.equal(diagnostic.usedForGraph, false);
assert.equal(diagnostic.usedForStoryline, false);
assert.equal(diagnostic.aggregateRunwayPreserved, true);
assert.equal(diagnostic.growthPolicy, "none");
assert.equal(diagnostic.trace.growthPolicy, "none");
assert.equal(diagnostic.inputSummary.existingCoverageBucketIncluded, true);
assert.equal(diagnostic.inputSummary.immediateObligations, 100);
assert.equal(diagnostic.inputSummary.scheduledObligationMonthCount, 2);
assert.equal(diagnostic.reconciliation.matchedWithinTolerance, true);
assert.equal(diagnostic.reconciliation.comparedMonths, main.layer3Output.points.length);
assert.equal(diagnostic.reconciliation.maxAbsoluteDifference, 0);
assert.equal(
  JSON.stringify(diagnostic.ledgerMonths.map((month) => month.totalAvailableResources)),
  JSON.stringify(main.layer3Output.points.map((point) => Math.max(point.endingResources, 0))),
  "ledger totals should match aggregate non-negative ending resources in parity mode"
);
assert.equal(diagnostic.ledgerMonths[1].scheduledObligations, main.layer3Output.points[1].scheduledObligations);
assert.equal(diagnostic.ledgerMonths[2].scheduledObligations, main.layer3Output.points[2].scheduledObligations);
assert.equal(diagnostic.ledgerMonths[0].startingBuckets.some((bucket) => bucket.family === "existingCoverage"), true);
assert.ok(
  diagnostic.bucketEvents
    .filter((event) => event.family === "existingCoverage")
    .every((event) => event.trace.mechanicalLedgerEvent === true && event.trace.visibleStorylineEligible === false),
  "existing coverage ledger events should remain mechanical-only"
);
assert.equal(
  diagnostic.bucketEvents.find((event) => event.bucketId === "retirement" && event.eventType === "bucket-tapped").monthIndex
    > diagnostic.bucketEvents.find((event) => event.bucketId === "taxable" && event.eventType === "bucket-depleted").monthIndex,
  true,
  "retirement should be tapped only after higher-priority liquid buckets are depleted"
);
assert.equal(
  diagnostic.ledgerMonths[0].totalAvailableResources,
  main.layer2Output.resources.resourcesAfterObligations - main.layer3Output.points[0].netUse,
  "immediate obligations should be subtracted exactly once before monthly runway use"
);
assert.doesNotMatch(JSON.stringify(main.scenario), /majorGraphDotCandidates|microGraphDotCandidates|graphDotCandidates/);

const educationLayer2 = makeLayer2Output({
  assetRows: makeLayer2Output().assetTreatmentAtDeath.rows.concat([
    {
      id: "education",
      categoryKey: "educationSpecificSavings",
      label: "529 plan",
      projectedValue: 400,
      included: true,
      treatedValue: 400,
      treatmentStatus: "treated",
      sourcePaths: ["layer2.education"]
    }
  ])
});
const education = composeWithFixture(educationLayer2);
const educationDiagnostic = education.scenario.trace.layer3.assetDepletionLedgerDiagnostic;
assert.ok(
  educationDiagnostic.excludedBuckets.some((bucket) => bucket.id === "education" && bucket.reason === "education-redirect-disabled"),
  "education savings should be excluded from the diagnostic ledger unless redirect is explicitly enabled"
);
assert.equal(
  educationDiagnostic.bucketEvents.some((event) => event.family === "educationSavings"),
  false,
  "education savings should not emit diagnostic tap/depletion events when redirect is disabled"
);

console.log("income-impact-asset-depletion-ledger-diagnostic-integration-check passed");
