#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const adapterPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-need-line-adapter.js"
);
const enginePath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-engine.js"
);
const adapterSource = fs.readFileSync(adapterPath, "utf8");
const engineSource = fs.readFileSync(enginePath, "utf8");

function loadAdapter() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(adapterSource, context, { filename: adapterPath });
  return context.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
}

function loadEngine() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(engineSource, context, { filename: enginePath });
  return context.LensApp.lensAnalysis.calculateCoverageTimeline;
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item.code);
}

function createNeedsResult(overrides = {}) {
  return {
    method: "needsAnalysis",
    grossNeed: 1100000,
    netCoverageGap: 10000,
    components: {
      debtPayoff: 180000,
      essentialSupport: 320000,
      education: 65000,
      finalExpenses: 25000,
      healthcareExpenses: 30000,
      transitionNeeds: 15000,
      discretionarySupport: 60000
    },
    commonOffsets: {
      existingCoverageOffset: 500000,
      assetOffset: 250000,
      survivorIncomeOffset: 80000,
      totalOffset: 750000
    },
    assumptions: {
      needsSupportDurationYears: 4,
      includeDiscretionarySupport: true,
      includeSurvivorIncomeOffset: true,
      survivorIncomeAppliedInsideSupport: true,
      valuationDate: "2026-01-01"
    },
    trace: [
      {
        key: "debtPayoff",
        value: 180000,
        inputs: {
          preparedMortgagePayoffAmount: 120000,
          preparedNonMortgageDebtAmount: 60000,
          rawMortgageAmount: 120000,
          rawNonMortgageDebtAmount: 60000
        },
        sourcePaths: ["treatedDebtPayoff.needs"]
      },
      {
        key: "essentialSupport",
        value: 320000,
        inputs: {
          annualTotalEssentialSupportCost: 100000,
          essentialSupportPreExclusionAmount: 400000,
          essentialSupportIncludedAmount: 320000,
          survivorIncomeOffsetApplied: true,
          inflation: {
            baseAnnualAmount: 100000,
            durationYears: 4,
            ratePercent: 0,
            projectedTotal: 400000,
            applied: false
          }
        },
        sourcePaths: ["treatedOngoingSupport.annualTotalEssentialSupportCost"]
      },
      {
        key: "essentialSupportInflation",
        value: 400000,
        inputs: {
          baseAnnualAmount: 100000,
          durationYears: 4,
          ratePercent: 0,
          projectedTotal: 400000,
          inflationApplied: false
        }
      },
      {
        key: "discretionarySupport",
        value: 60000,
        inputs: {
          annualDiscretionaryPersonalSpending: 15000
        }
      },
      {
        key: "discretionarySupportInflation",
        value: 60000,
        inputs: {
          baseAnnualAmount: 15000,
          durationYears: 4,
          ratePercent: 0,
          projectedTotal: 60000,
          inflationApplied: false
        }
      },
      {
        key: "educationFundingInflation",
        value: 65000,
        inputs: {
          childRows: [
            {
              index: 0,
              id: "child-a",
              dateOfBirth: "2011-01-01",
              currentAge: 15,
              yearsUntilEducationStart: 3,
              baseAmount: 50000,
              projectedAmount: 50000
            }
          ],
          plannedDependentEducationIncludedAmount: 15000
        }
      },
      {
        key: "finalExpenses",
        value: 25000,
        inputs: {
          projectedFinalExpenseAmount: 25000,
          finalExpenseTargetAge: 85
        }
      },
      {
        key: "healthcareExpenses",
        value: 30000,
        inputs: {
          enabled: true,
          projectionYears: 2,
          projectedHealthcareExpenseAmount: 30000
        }
      },
      {
        key: "survivorIncomeOffset",
        value: 80000,
        inputs: {
          survivorIncomeOffset: 80000
        }
      }
    ],
    ...overrides
  };
}

function createLensModel(overrides = {}) {
  return {
    profileFacts: {
      clientDateOfBirth: "1986-01-01"
    },
    incomeBasis: {
      insuredRetirementHorizonYears: 25
    },
    educationSupport: {
      currentDependentDetails: [
        {
          id: "child-a",
          dateOfBirth: "2011-01-01"
        }
      ]
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      immediatePayoffAmount: 120000,
      finalMonthlyMortgagePayment: 0,
      finalRemainingTermMonths: 0
    },
    ...overrides
  };
}

assert.doesNotMatch(adapterSource, /\bdocument\b/);
assert.doesNotMatch(adapterSource, /\blocalStorage\b/);
assert.doesNotMatch(adapterSource, /\bsessionStorage\b/);
assert.doesNotMatch(adapterSource, /\bquerySelector\b/);
assert.doesNotMatch(adapterSource, /step-three-analysis-display|analysis-result-card|innerHTML/);
assert.match(adapterSource, /module\.exports/);

const buildCoverageStrategyNeedLine = loadAdapter();
const sourceLensModel = createLensModel();
const sourceNeedsResult = createNeedsResult();
const originalLensModel = JSON.stringify(sourceLensModel);
const originalNeedsResult = JSON.stringify(sourceNeedsResult);
const result = buildCoverageStrategyNeedLine({
  lensModel: sourceLensModel,
  needsResult: sourceNeedsResult,
  analysisSettings: {},
  valuationDate: "2026-01-01",
  horizonYears: 5
});

assert.equal(JSON.stringify(sourceLensModel), originalLensModel);
assert.equal(JSON.stringify(sourceNeedsResult), originalNeedsResult);
assert.equal(result.status, "partial");
assert.equal(result.cadence, "annual");
assert.equal(result.needPoints.length, 6);
assert.equal(result.needPoints[0].yearIndex, 0);
assert.equal(result.needPoints[0].calendarYear, 2026);
assert.equal(result.needPoints[0].age, 40);
assert.equal(result.needPoints[0].needAmount, result.needPoints[0].grossNeedAmount);

assert.notEqual(result.needPoints[0].needAmount, sourceNeedsResult.netCoverageGap);
assert.equal(result.needPoints[0].trace.netCoverageGapUsedAsNeed, false);
assert.equal(result.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(result.needPoints[0].trace.existingCoverageSubtracted, false);
assert.equal(result.assumptionsUsed.assetOffsetsSubtracted, false);
assert.equal(result.assumptionsUsed.existingCoverageSubtracted, false);

assert.equal(result.needPoints[0].componentAmounts.essentialSupport, 400000);
assert.equal(result.needPoints[1].componentAmounts.essentialSupport, 300000);
assert.equal(result.needPoints[3].componentAmounts.essentialSupport, 100000);
assert.equal(result.needPoints[4].componentAmounts.essentialSupport, 0);
assert.equal(result.needPoints[5].componentAmounts.essentialSupport, 0);

assert.equal(result.needPoints[0].supportTrace.grossSupportNeed, 400000);
assert.equal(result.needPoints[0].supportTrace.adjustedSupportNeed, 320000);
assert.equal(result.needPoints[0].supportTrace.survivorIncomeOffset, 80000);
assert.equal(result.needPoints[0].offsetTraces.survivorIncomeOffset, 80000);
assert.equal(result.needPoints[0].offsetTraces.subtractedFromNeedLine, false);
assert.equal(
  result.needPoints[0].componentAmounts.essentialSupport,
  sourceNeedsResult.components.essentialSupport + sourceNeedsResult.commonOffsets.survivorIncomeOffset
);

assert.equal(result.needPoints[0].componentAmounts.mortgage, 120000);
assert.equal(result.needPoints[0].componentAmounts.debtPayoff, 60000);
assert.equal(result.componentModels.debtAndMortgage.trace.mortgageMode, "payOff");

assert.equal(result.needPoints[0].componentAmounts.education, 50000);
assert.equal(result.needPoints[3].componentAmounts.education, 50000);
assert.equal(result.needPoints[4].componentAmounts.education, 0);
assert.ok(issueCodes(result.dataGaps).includes("planned-dependent-education-timing-missing"));

assert.equal(result.needPoints[0].componentAmounts.finalExpenses, 25000);
assert.equal(result.needPoints[5].componentAmounts.finalExpenses, 25000);
assert.equal(result.needPoints[0].componentAmounts.healthcareExpenses, 30000);
assert.equal(result.needPoints[2].componentAmounts.healthcareExpenses, 30000);
assert.equal(result.needPoints[3].componentAmounts.healthcareExpenses, 0);

const adjustedOnly = buildCoverageStrategyNeedLine({
  lensModel: createLensModel(),
  valuationDate: "2026-01-01",
  horizonYears: 2,
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      essentialSupport: 320000,
      education: 0,
      healthcareExpenses: 0
    },
    commonOffsets: {
      existingCoverageOffset: 0,
      assetOffset: 0,
      totalOffset: 0
    },
    trace: sourceNeedsResult.trace.filter((row) => ![
      "essentialSupportInflation",
      "educationFundingInflation",
      "healthcareExpenses",
      "survivorIncomeOffset"
    ].includes(row.key)).map((row) => {
      if (row.key !== "essentialSupport") {
        return row;
      }
      return {
        ...row,
        inputs: {
          essentialSupportIncludedAmount: 320000,
          inflation: {
            durationYears: 4,
            applied: false
          }
        }
      };
    })
  })
});
assert.ok(issueCodes(adjustedOnly.dataGaps).includes("gross-support-unavailable-adjusted-support-used"));
assert.equal(adjustedOnly.needPoints[0].supportTrace.reconstructionStatus, "adjusted-support-fallback");

const supportMortgage = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "continuePayments",
      finalMonthlyMortgagePayment: 2000,
      finalRemainingTermMonths: 24
    }
  }),
  needsResult: sourceNeedsResult,
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.equal(supportMortgage.needPoints[0].componentAmounts.mortgage, 48000);
assert.equal(supportMortgage.needPoints[1].componentAmounts.mortgage, 24000);
assert.equal(supportMortgage.needPoints[2].componentAmounts.mortgage, 0);
assert.equal(supportMortgage.componentModels.debtAndMortgage.mortgageTiming, "time-bounded-payment-stream");

const missingInputs = buildCoverageStrategyNeedLine({
  lensModel: {},
  needsResult: createNeedsResult({
    assumptions: {
      needsSupportDurationYears: 4
    }
  }),
  horizonYears: 1
});
assert.ok(issueCodes(missingInputs.dataGaps).includes("missing-valuation-date"));
assert.ok(issueCodes(missingInputs.dataGaps).includes("missing-client-age"));

const calculateCoverageTimeline = loadEngine();
const timeline = calculateCoverageTimeline({
  valuationDate: "2026-01-01",
  horizonYears: 5,
  cadence: "annual",
  client: {
    currentAge: 40
  },
  needPoints: result.needPoints,
  policyLayers: []
});
assert.equal(timeline.status, "complete");
assert.equal(timeline.points[0].recommendedNeed, result.needPoints[0].needAmount);
assert.equal(timeline.points[0].coverageGap, result.needPoints[0].needAmount);
assert.equal(timeline.points[0].totalCoverageAmount, 0);

console.log("coverage strategy need line adapter check passed");
