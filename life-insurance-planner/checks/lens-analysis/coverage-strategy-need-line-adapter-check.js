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
const mortgageProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-mortgage-lifetime-projection.js"
);
const debtProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-debt-lifetime-projection.js"
);
const healthcareProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-healthcare-lifetime-projection.js"
);
const finalExpenseProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-final-expense-lifetime-projection.js"
);
const educationProjectionPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-education-lifetime-projection.js"
);
const scenarioSettingsPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-strategy-scenario-settings.js"
);
const enginePath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "coverage-timeline-engine.js"
);
const adapterSource = fs.readFileSync(adapterPath, "utf8");
const mortgageProjectionSource = fs.readFileSync(mortgageProjectionPath, "utf8");
const debtProjectionSource = fs.readFileSync(debtProjectionPath, "utf8");
const healthcareProjectionSource = fs.readFileSync(healthcareProjectionPath, "utf8");
const finalExpenseProjectionSource = fs.readFileSync(finalExpenseProjectionPath, "utf8");
const educationProjectionSource = fs.readFileSync(educationProjectionPath, "utf8");
const scenarioSettingsSource = fs.readFileSync(scenarioSettingsPath, "utf8");
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
  vm.runInContext(mortgageProjectionSource, context, { filename: mortgageProjectionPath });
  vm.runInContext(debtProjectionSource, context, { filename: debtProjectionPath });
  vm.runInContext(healthcareProjectionSource, context, { filename: healthcareProjectionPath });
  vm.runInContext(finalExpenseProjectionSource, context, { filename: finalExpenseProjectionPath });
  vm.runInContext(educationProjectionSource, context, { filename: educationProjectionPath });
  vm.runInContext(scenarioSettingsSource, context, { filename: scenarioSettingsPath });
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
      linkedDependentCount: 1,
      desiredAdditionalDependentCount: 1,
      perLinkedDependentEducationFunding: 50000,
      perDesiredAdditionalDependentEducationFunding: 15000,
      linkedDependentEducationFundingNeed: 50000,
      desiredAdditionalDependentEducationFundingNeed: 15000,
      totalEducationFundingNeed: 65000,
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
      originalBalance: 120000,
      immediatePayoffAmount: 120000,
      payoffPercent: 100,
      originalMonthlyMortgagePayment: null,
      originalRemainingTermMonths: null,
      interestRatePercent: null,
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
assert.ok(issueCodes(result.dataGaps).includes("mortgage-projection-term-missing"));

assert.equal(result.needPoints[0].componentAmounts.education, 65000);
assert.equal(result.needPoints[3].componentAmounts.education, 65000);
assert.equal(result.needPoints[4].componentAmounts.education, 52500);
assert.equal(result.needPoints[5].componentAmounts.education, 40000);
assert.equal(result.needPoints[0].trace.componentTiming.education, "record-level-education-obligation-schedule");
assert.ok(issueCodes(result.warnings).includes("projected-dependent-education-kept-through-horizon"));
assert.equal(result.componentModels.education.lifetimeProjection.aggregateFallbackUsed, false);
assert.equal(result.componentModels.education.lifetimeProjection.educationSavingsOffset.active, false);

const educationSavingsOffsetResult = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    assetFacts: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          typeKey: "plan529Account",
          currentValue: 10000
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          typeKey: "checkingAccount",
          currentValue: 50000
        }
      ]
    },
    treatedAssetOffsets: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          include: false,
          treatedValue: 0
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          include: true,
          treatedValue: 50000
        }
      ]
    }
  }),
  needsResult: sourceNeedsResult,
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      useExistingEducationSavingsOffset: true
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(educationSavingsOffsetResult.needPoints[0].trace.educationProjection.grossEducationNeedAmount, 65000);
assert.equal(educationSavingsOffsetResult.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 10000);
assert.equal(
  educationSavingsOffsetResult.needPoints[0].trace.educationProjection.effectiveEducationResourceSpendingMode,
  "educationSavingsOnly"
);
assert.equal(educationSavingsOffsetResult.needPoints[0].componentAmounts.education, 55000);
assert.equal(educationSavingsOffsetResult.componentModels.education.lifetimeProjection.educationSavingsOffset.active, true);
assert.equal(
  educationSavingsOffsetResult.componentModels.education.lifetimeProjection.educationResourceSpending.effectiveMode,
  "educationSavingsOnly"
);
assert.equal(
  educationSavingsOffsetResult.componentModels.education.lifetimeProjection.educationSavingsOffset.settingOwnership,
  "coverage-strategy-scenario-settings"
);
assert.equal(
  educationSavingsOffsetResult.componentModels.education.lifetimeProjection.educationSavingsOffset.legacyMapped,
  true
);
assert.equal(
  educationSavingsOffsetResult.componentModels.education.lifetimeProjection.educationSavingsOffset.totalEducationSavingsApplied,
  10000
);
assert.equal(
  educationSavingsOffsetResult.assumptionsUsed.coverageStrategyScenarioSettings.education.useEducationSavingsOffset,
  true
);
assert.equal(educationSavingsOffsetResult.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(educationSavingsOffsetResult.assumptionsUsed.assetOffsetsSubtracted, false);

const eligibleResourcesTraceOnlyResult = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    assetFacts: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          typeKey: "plan529Account",
          currentValue: 10000
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          typeKey: "checkingAccount",
          currentValue: 50000
        }
      ]
    },
    treatedAssetOffsets: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          include: false,
          treatedValue: 0
        },
        {
          assetId: "cash",
          categoryKey: "cashAndCashEquivalents",
          include: true,
          treatedValue: 50000
        }
      ]
    }
  }),
  needsResult: sourceNeedsResult,
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18
    }
  },
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationResourceSpendingMode: "eligibleResourcesAfterEducationSavings",
      useEducationSavingsOffset: false
    },
    trace: {
      fieldSources: {
        "education.educationResourceSpendingMode": "runtimeScenarioSettings.education.educationResourceSpendingMode"
      }
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(
  eligibleResourcesTraceOnlyResult.componentModels.education.lifetimeProjection.educationResourceSpending.effectiveMode,
  "eligibleResourcesAfterEducationSavings"
);
assert.equal(
  eligibleResourcesTraceOnlyResult.componentModels.education.lifetimeProjection.educationResourceSpending.broaderEligibleResourceStatus,
  "unavailable"
);
assert.equal(eligibleResourcesTraceOnlyResult.needPoints[0].trace.educationProjection.broaderEligibleResourceOffsetApplied, 0);
assert.ok(issueCodes(eligibleResourcesTraceOnlyResult.dataGaps).includes("education-eligible-resource-spending-source-unavailable"));
assert.equal(eligibleResourcesTraceOnlyResult.needPoints[0].trace.assetOffsetSubtracted, false);
assert.equal(eligibleResourcesTraceOnlyResult.assumptionsUsed.assetOffsetsSubtracted, false);

const lumpSumScheduleResult = buildCoverageStrategyNeedLine({
  lensModel: createLensModel(),
  needsResult: sourceNeedsResult,
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18
    }
  },
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: false,
      projectedDependentTimingRows: []
    },
    trace: {
      fieldSources: {
        "education.educationPaymentScheduleMode": "runtimeScenarioSettings.education.educationPaymentScheduleMode"
      }
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(
  lumpSumScheduleResult.componentModels.education.lifetimeProjection.assumptionsUsed.educationPaymentScheduleMode,
  "lumpSumAtStart"
);
assert.equal(lumpSumScheduleResult.componentModels.education.lifetimeProjection.currentDependentSchedules[0].payments.length, 1);
assert.equal(lumpSumScheduleResult.componentModels.education.lifetimeProjection.currentDependentSchedules[0].payments[0].amount, 50000);
assert.equal(lumpSumScheduleResult.needPoints[0].componentAmounts.education, 65000);
assert.equal(lumpSumScheduleResult.needPoints[3].componentAmounts.education, 65000);
assert.equal(lumpSumScheduleResult.needPoints[4].componentAmounts.education, 15000);
assert.equal(lumpSumScheduleResult.needPoints[0].trace.educationProjection.educationPaymentScheduleMode, "lumpSumAtStart");
assert.ok(issueCodes(lumpSumScheduleResult.warnings).includes("projected-dependent-untimed-schedule-mode-not-applied"));
assert.equal(lumpSumScheduleResult.needPoints[0].trace.assetOffsetSubtracted, false);

const timedProjectedDependentResult = buildCoverageStrategyNeedLine({
  lensModel: createLensModel(),
  needsResult: sourceNeedsResult,
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18
    }
  },
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      useEducationSavingsOffset: false,
      projectedDependentTimingRows: [
        {
          id: "projected-dependent-1",
          label: "Projected dependent 1",
          rawExpectedBirthYear: "2026",
          expectedBirthYear: 2026,
          validationStatus: "valid",
          educationFundingAmount: 15000
        }
      ]
    },
    trace: {
      fieldSources: {
        "education.projectedDependentTimingRows": "runtimeScenarioSettings.education.projectedDependentTimingRows"
      }
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 25
});
assert.equal(timedProjectedDependentResult.componentModels.education.lifetimeProjection.projectedDependentSchedules.length, 1);
assert.equal(
  timedProjectedDependentResult.componentModels.education.lifetimeProjection.projectedDependentSchedules[0].dateOfBirth,
  "2026-01-01"
);
assert.equal(timedProjectedDependentResult.needPoints[18].componentAmounts.education, 15000);
assert.equal(timedProjectedDependentResult.needPoints[21].componentAmounts.education, 3750);
assert.equal(timedProjectedDependentResult.needPoints[22].componentAmounts.education, 0);
assert.ok(
  issueCodes(timedProjectedDependentResult.warnings).includes("projected-dependent-birth-year-defaulted-to-jan-1")
);

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

const amortizedMortgage = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    debtPayoff: {
      mortgageBalance: 240000
    },
    ongoingSupport: {
      monthlyMortgagePayment: 2060.86,
      mortgageRemainingTermMonths: 180,
      mortgageInterestRatePercent: 6
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 240000,
      immediatePayoffAmount: 240000,
      payoffPercent: 100,
      originalMonthlyMortgagePayment: 2060.86,
      originalRemainingTermMonths: 180,
      interestRatePercent: 6,
      finalMonthlyMortgagePayment: 0,
      finalRemainingTermMonths: 0
    }
  }),
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      debtPayoff: 240000,
      education: 0,
      healthcareExpenses: 0
    },
    trace: sourceNeedsResult.trace.filter((row) => ![
      "educationFundingInflation",
      "healthcareExpenses"
    ].includes(row.key)).map((row) => row.key === "debtPayoff"
      ? {
          ...row,
          value: 240000,
          inputs: {
            preparedMortgagePayoffAmount: 240000,
            preparedNonMortgageDebtAmount: 0,
            rawMortgageAmount: 240000,
            rawNonMortgageDebtAmount: 0
          }
        }
      : row)
  }),
  valuationDate: "2026-01-01",
  horizonYears: 20
});
assert.equal(amortizedMortgage.needPoints[0].componentAmounts.mortgage, 240000);
assert.ok(amortizedMortgage.needPoints[5].componentAmounts.mortgage < 240000);
assert.equal(amortizedMortgage.needPoints[15].componentAmounts.mortgage, 0);
assert.equal(amortizedMortgage.needPoints[20].componentAmounts.mortgage, 0);
assert.equal(amortizedMortgage.needPoints[5].trace.mortgageProjection.projectionMode, "amortized");

const fallbackMortgage = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 120000,
      immediatePayoffAmount: 120000,
      payoffPercent: 100,
      originalMonthlyMortgagePayment: 1200,
      originalRemainingTermMonths: null,
      interestRatePercent: 6
    }
  }),
  needsResult: sourceNeedsResult,
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.ok(issueCodes(fallbackMortgage.dataGaps).includes("mortgage-projection-term-missing"));
assert.equal(fallbackMortgage.needPoints[3].componentAmounts.mortgage, 120000);
assert.equal(fallbackMortgage.needPoints[3].trace.mortgageProjection.projectionMode, "flatFallback");

const amortizedDebt = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    debtFacts: {
      debts: [
        {
          debtFactId: "auto_fact",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          sourceKey: "autoLoan",
          label: "Auto Loan",
          currentBalance: 12000,
          minimumMonthlyPayment: 1000,
          interestRatePercent: 0,
          remainingTermMonths: 12
        },
        {
          debtFactId: "student_fact",
          categoryKey: "educationDebt",
          typeKey: "studentLoan",
          sourceKey: "studentLoan",
          label: "Student Loan",
          currentBalance: 24000,
          minimumMonthlyPayment: 1000,
          interestRatePercent: 0,
          remainingTermMonths: 24
        }
      ]
    },
    treatedDebtPayoff: {
      debts: [
        {
          debtFactId: "auto_fact",
          categoryKey: "securedConsumerDebt",
          typeKey: "autoLoan",
          sourceKey: "autoLoan",
          label: "Auto Loan",
          isMortgage: false,
          rawBalance: 12000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 12000,
          treatmentMode: "payoff"
        },
        {
          debtFactId: "student_fact",
          categoryKey: "educationDebt",
          typeKey: "studentLoan",
          sourceKey: "studentLoan",
          label: "Student Loan",
          isMortgage: false,
          rawBalance: 24000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 24000,
          treatmentMode: "payoff"
        }
      ],
      needs: {
        debtPayoffAmount: 36000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 36000
      }
    },
    treatedMortgagePaymentPlan: {
      version: "treated-mortgage-payment-plan-v1",
      mode: "payOff",
      originalBalance: 0,
      immediatePayoffAmount: 0,
      payoffPercent: 100
    }
  }),
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      debtPayoff: 36000,
      education: 0,
      healthcareExpenses: 0
    },
    trace: sourceNeedsResult.trace.filter((row) => ![
      "educationFundingInflation",
      "healthcareExpenses"
    ].includes(row.key)).map((row) => row.key === "debtPayoff"
      ? {
          ...row,
          value: 36000,
          inputs: {
            preparedMortgagePayoffAmount: 0,
            preparedNonMortgageDebtAmount: 36000,
            rawMortgageAmount: 0,
            rawNonMortgageDebtAmount: 36000
          }
        }
      : row)
  }),
  valuationDate: "2026-01-01",
  horizonYears: 4
});
assert.equal(amortizedDebt.needPoints[0].componentAmounts.debtPayoff, 36000);
assert.equal(amortizedDebt.needPoints[1].componentAmounts.debtPayoff, 12000);
assert.equal(amortizedDebt.needPoints[2].componentAmounts.debtPayoff, 0);
assert.equal(amortizedDebt.needPoints[4].componentAmounts.debtPayoff, 0);
assert.equal(amortizedDebt.needPoints[1].trace.debtProjection.projectionModeCounts.amortized, 2);
assert.equal(amortizedDebt.componentModels.debtLifetimeProjection.assumptionsUsed.debtsIncludedCount, 2);
assert.equal(amortizedDebt.componentModels.debtAndMortgage.trace.nonMortgageAmortizationMode, "coverage-strategy-debt-lifetime-projection");

const fallbackDebt = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    debtFacts: {
      debts: [
        {
          debtFactId: "custom_fact",
          categoryKey: "otherDebt",
          typeKey: "customDebt",
          currentBalance: 12000,
          minimumMonthlyPayment: 300,
          interestRatePercent: 6,
          remainingTermMonths: null
        }
      ]
    },
    treatedDebtPayoff: {
      debts: [
        {
          debtFactId: "custom_fact",
          categoryKey: "otherDebt",
          typeKey: "customDebt",
          isMortgage: false,
          rawBalance: 12000,
          included: true,
          payoffPercent: 100,
          treatedAmount: 12000,
          treatmentMode: "payoff"
        }
      ],
      needs: {
        debtPayoffAmount: 12000,
        mortgagePayoffAmount: 0,
        nonMortgageDebtAmount: 12000
      }
    }
  }),
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      debtPayoff: 12000,
      education: 0,
      healthcareExpenses: 0
    },
    trace: sourceNeedsResult.trace.filter((row) => ![
      "educationFundingInflation",
      "healthcareExpenses"
    ].includes(row.key)).map((row) => row.key === "debtPayoff"
      ? {
          ...row,
          value: 12000,
          inputs: {
            preparedMortgagePayoffAmount: 0,
            preparedNonMortgageDebtAmount: 12000,
            rawMortgageAmount: 0,
            rawNonMortgageDebtAmount: 12000
          }
        }
      : row)
  }),
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.ok(issueCodes(fallbackDebt.dataGaps).includes("debt-projection-term-missing"));
assert.equal(fallbackDebt.needPoints[3].componentAmounts.debtPayoff, 12000);
assert.equal(fallbackDebt.needPoints[3].trace.debtProjection.projectionModeCounts.flatFallback, 1);
assert.equal(
  amortizedMortgage.needPoints[5].trace.mortgageProjection.projectionMode,
  "amortized",
  "Mortgage lifetime projection should remain intact after adding debt projection."
);

const healthcareLifetime = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    expenseFacts: {
      expenses: [
        {
          expenseFactId: "healthcare-until-age",
          typeKey: "medicalOutOfPocket",
          categoryKey: "ongoingHealthcare",
          label: "Medical Out-of-Pocket",
          amount: 150,
          frequency: "monthly",
          termType: "untilAge",
          endAge: 85,
          isHealthcareSensitive: true,
          isFinalExpenseComponent: false,
          sourcePath: "expenseFacts.expenses[0]"
        },
        {
          expenseFactId: "healthcare-ongoing",
          typeKey: "visionOutOfPocket",
          categoryKey: "visionCare",
          label: "Vision Out-of-Pocket",
          amount: 90,
          frequency: "annual",
          termType: "ongoing",
          isHealthcareSensitive: true,
          isFinalExpenseComponent: false,
          sourcePath: "expenseFacts.expenses[1]"
        }
      ]
    }
  }),
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      healthcareExpenses: 180820.7
    },
    trace: sourceNeedsResult.trace.map((row) => row.key === "healthcareExpenses"
      ? {
          ...row,
          value: 180820.7,
          inputs: {
            enabled: true,
            projectionYears: 10,
            projectedHealthcareExpenseAmount: 180820.7,
            healthcareInflationRatePercent: 4.25
          }
        }
      : row)
  }),
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 4.25
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 17
});
assert.ok(
  healthcareLifetime.needPoints[0].componentAmounts.healthcareExpenses
    > healthcareLifetime.needPoints[10].componentAmounts.healthcareExpenses,
  "Healthcare lifetime schedule should decline as until-age duration burns down."
);
assert.ok(
  healthcareLifetime.needPoints[11].componentAmounts.healthcareExpenses > 0,
  "Healthcare should not drop to zero solely because internal projectionYears ended."
);
assert.ok(!issueCodes(healthcareLifetime.warnings).includes("healthcare-year-level-projection-limited"));
assert.equal(healthcareLifetime.componentModels.healthcare.lifetimeProjection.aggregateFallbackUsed, false);

const supportOwnedHealthcareNeedLine = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    expenseFacts: {
      expenses: [
        {
          expenseFactId: "expense_record_starter_expense_medicalOutOfPocket",
          expenseRecordId: "starter_expense_medicalOutOfPocket",
          typeKey: "medicalOutOfPocket",
          categoryKey: "otherLivingExpense",
          compressionCategoryKey: "ongoingHealthcare",
          label: "Healthcare / Out-of-Pocket Medical",
          amount: 150,
          frequency: "monthly",
          termType: "ongoing",
          sourceOwnedBy: "ongoingSupport",
          ownedByField: "monthlyHealthcareOutOfPocketCost",
          isHealthcareSensitive: false,
          defaultInflationRole: "householdInflation",
          sourcePath: "protectionModeling.data.expenseRecords[1]"
        }
      ]
    }
  }),
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      healthcareExpenses: 0
    },
    trace: sourceNeedsResult.trace.filter((row) => row.key !== "healthcareExpenses")
  }),
  analysisSettings: {
    inflationAssumptions: {
      healthcareInflationRatePercent: 4.25
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(supportOwnedHealthcareNeedLine.needPoints[0].componentAmounts.healthcareExpenses, 0);
assert.equal(supportOwnedHealthcareNeedLine.needPoints[5].componentAmounts.healthcareExpenses, 0);
assert.ok(issueCodes(supportOwnedHealthcareNeedLine.warnings).includes("support-owned-healthcare-expense-excluded-from-healthcare-lifetime"));
assert.equal(
  supportOwnedHealthcareNeedLine.componentModels.healthcare.lifetimeProjection.supportOwnedHealthcareExpenseExcludedCount,
  1
);
assert.equal(
  supportOwnedHealthcareNeedLine.componentModels.healthcare.lifetimeProjection.healthcareLookingExcludedRecords[0].exclusionCode,
  "support-owned-healthcare-expense-excluded"
);
assert.equal(
  supportOwnedHealthcareNeedLine.componentModels.healthcare.lifetimeProjection.healthcareLookingExcludedRecords[0].trace.ownedByField,
  "monthlyHealthcareOutOfPocketCost"
);
assert.equal(
  supportOwnedHealthcareNeedLine.componentModels.healthcare.lifetimeProjection.warnings[0].code,
  "support-owned-healthcare-expense-excluded-from-healthcare-lifetime"
);
assert.ok(!issueCodes(supportOwnedHealthcareNeedLine.warnings).includes("healthcare-aggregate-fallback-used"));

const finalExpenseLifetime = buildCoverageStrategyNeedLine({
  lensModel: createLensModel({
    finalExpenses: {
      funeralBurialEstimate: 10000,
      medicalEndOfLifeCosts: 5000,
      estateSettlementCosts: 2000,
      otherFinalExpenses: 1000
    }
  }),
  needsResult: createNeedsResult({
    components: {
      ...sourceNeedsResult.components,
      finalExpenses: 999999,
      healthcareExpenses: 0
    },
    trace: sourceNeedsResult.trace.filter((row) => row.key !== "healthcareExpenses").map((row) => row.key === "finalExpenses"
      ? {
          ...row,
          value: 999999,
          inputs: {
            projectedFinalExpenseAmount: 999999,
            finalExpenseInflationRatePercent: 3,
            healthcareInflationRatePercent: 4.25
          }
        }
      : row)
  }),
  analysisSettings: {
    inflationAssumptions: {
      finalExpenseInflationRatePercent: 3,
      healthcareInflationRatePercent: 4.25
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(finalExpenseLifetime.needPoints[0].componentAmounts.finalExpenses, 18000);
assert.ok(
  finalExpenseLifetime.needPoints[5].componentAmounts.finalExpenses
    > finalExpenseLifetime.needPoints[0].componentAmounts.finalExpenses,
  "Final expense should inflate at each modeled death year."
);
assert.notEqual(finalExpenseLifetime.needPoints[0].componentAmounts.finalExpenses, 999999);
assert.equal(
  finalExpenseLifetime.needPoints[0].trace.componentTiming.finalExpenses,
  "record-level-death-year-final-expense-schedule"
);
assert.equal(finalExpenseLifetime.componentModels.finalExpenses.lifetimeProjection.staticFallbackUsed, false);

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
