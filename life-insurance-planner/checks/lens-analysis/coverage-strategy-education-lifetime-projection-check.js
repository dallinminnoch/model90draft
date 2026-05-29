#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function createContext() {
  const context = {
    console,
    LensApp: {
      lensAnalysis: {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function createNeedPoints(horizonYears, startAge = 46) {
  return Array.from({ length: horizonYears + 1 }, function (_unused, yearIndex) {
    const year = 2026 + yearIndex;
    return {
      yearIndex,
      date: `${year}-01-01`,
      calendarYear: year,
      age: startAge + yearIndex
    };
  });
}

function issueCodes(items) {
  return (Array.isArray(items) ? items : []).map((item) => item && item.code).filter(Boolean);
}

function runProjection(helper, overrides = {}) {
  const input = {
    educationSupport: overrides.educationSupport || {
      linkedDependentCount: 1,
      desiredAdditionalDependentCount: 1,
      perLinkedDependentEducationFunding: 40000,
      perDesiredAdditionalDependentEducationFunding: 20000,
      linkedDependentEducationFundingNeed: 40000,
      desiredAdditionalDependentEducationFundingNeed: 20000,
      totalEducationFundingNeed: 60000,
      currentDependentDetails: [
        {
          id: "child-a",
          dateOfBirth: "2010-01-01",
          sourcePath: "educationSupport.currentDependentDetails[0]"
        }
      ]
    },
    profileDependents: overrides.profileDependents,
    projectedDependents: overrides.projectedDependents,
    needPoints: overrides.needPoints || createNeedPoints(10),
    valuationDate: overrides.valuationDate || "2026-01-01",
    educationAssumptions: overrides.educationAssumptions || {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      fundingTargetPercent: 100,
      useExistingEducationSavingsOffset: false
    },
    assetFacts: overrides.assetFacts,
    treatedAssetOffsets: overrides.treatedAssetOffsets,
    coverageStrategyScenarioSettings: overrides.coverageStrategyScenarioSettings,
    educationInflationRatePercent: overrides.educationInflationRatePercent ?? 5,
    options: overrides.options || {}
  };
  const before = JSON.stringify(input);
  const result = helper(input);
  assert.equal(JSON.stringify(input), before, "helper must not mutate inputs");
  assert.doesNotThrow(() => JSON.stringify(result), "output should be JSON serializable");
  return result;
}

const moduleSource = readRepoFile("app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js");
assert.match(moduleSource, /Coverage Strategy education lifetime projection engine/);
assert.match(moduleSource, /Future home after folder reorganization/);
assert.doesNotMatch(moduleSource, /\bdocument\b|localStorage|sessionStorage|indexedDB/);
assert.match(moduleSource, /module\.exports/);
assert.match(moduleSource, /assetFacts/);
assert.match(moduleSource, /treatedAssetOffsets/);
assert.match(moduleSource, /educationSpecificSavings/);

const context = createContext();
loadScript(context, "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js");
const helper = context.LensApp.lensAnalysis.buildCoverageStrategyEducationLifetimeProjection;
assert.equal(typeof helper, "function");

const currentSchedule = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 1,
    desiredAdditionalDependentCount: 0,
    perLinkedDependentEducationFunding: 40000,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "child-a",
        dateOfBirth: "2010-01-01"
      }
    ]
  },
  educationInflationRatePercent: 5,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18
  },
  needPoints: createNeedPoints(8)
});
assert.equal(currentSchedule.currentDependentSchedules.length, 1);
assert.equal(currentSchedule.assumptionsUsed.educationPaymentScheduleMode, "fourYearAnnual");
assert.equal(currentSchedule.currentDependentSchedules[0].trace.educationPaymentScheduleMode, "fourYearAnnual");
assert.equal(currentSchedule.currentDependentSchedules[0].educationStartYear, 2028);
assert.equal(
  JSON.stringify(currentSchedule.currentDependentSchedules[0].payments.map((payment) => payment.paymentYear)),
  JSON.stringify([2028, 2029, 2030, 2031])
);
assert.equal(
  JSON.stringify(currentSchedule.currentDependentSchedules[0].payments.map((payment) => payment.amount)),
  JSON.stringify([10000, 10000, 10000, 10000])
);
assert.equal(currentSchedule.educationPoints[0].currentDependentNeedAmount, 40000);
assert.equal(currentSchedule.educationPoints[3].currentDependentNeedAmount, 30000);
assert.equal(currentSchedule.educationPoints[6].currentDependentNeedAmount, 0);
assert.equal(currentSchedule.educationPoints[0].trace.fourYearPaymentScheduleUsed, true);
assert.equal(currentSchedule.educationPoints[0].trace.lumpSumAtStartScheduleUsed, false);

const lumpSumCurrent = runProjection(helper, {
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: false
    },
    trace: {
      fieldSources: {
        "education.educationPaymentScheduleMode": "runtimeScenarioSettings.education.educationPaymentScheduleMode"
      }
    }
  },
  educationSupport: {
    linkedDependentCount: 1,
    desiredAdditionalDependentCount: 0,
    perLinkedDependentEducationFunding: 40000,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "child-a",
        dateOfBirth: "2010-01-01"
      }
    ]
  },
  educationInflationRatePercent: 5,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18
  },
  needPoints: createNeedPoints(5)
});
assert.equal(lumpSumCurrent.assumptionsUsed.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(lumpSumCurrent.assumptionsUsed.paymentYearCount, 1);
assert.equal(lumpSumCurrent.currentDependentSchedules[0].payments.length, 1);
assert.equal(lumpSumCurrent.currentDependentSchedules[0].payments[0].paymentYear, 2028);
assert.equal(lumpSumCurrent.currentDependentSchedules[0].payments[0].amount, 40000);
assert.equal(lumpSumCurrent.currentDependentSchedules[0].payments[0].paymentScheduleMode, "lumpSumAtStart");
assert.equal(lumpSumCurrent.currentDependentSchedules[0].trace.educationPaymentScheduleMode, "lumpSumAtStart");
assert.equal(lumpSumCurrent.educationPoints[0].currentDependentNeedAmount, 40000);
assert.equal(lumpSumCurrent.educationPoints[2].currentDependentNeedAmount, 40000);
assert.equal(lumpSumCurrent.educationPoints[3].currentDependentNeedAmount, 0);
assert.equal(lumpSumCurrent.educationPoints[0].trace.fourYearPaymentScheduleUsed, false);
assert.equal(lumpSumCurrent.educationPoints[0].trace.lumpSumAtStartScheduleUsed, true);

const inflatedCurrent = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 1,
    perLinkedDependentEducationFunding: 40000,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "child-a",
        dateOfBirth: "2010-01-01"
      }
    ]
  },
  educationInflationRatePercent: 5,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: true,
    educationStartAge: 18
  },
  needPoints: createNeedPoints(8)
});
assert.ok(inflatedCurrent.educationPoints[0].currentDependentNeedAmount > 40000);
assert.equal(inflatedCurrent.currentDependentSchedules[0].payments[0].amount, 11025);
assert.equal(inflatedCurrent.currentDependentSchedules[0].payments[0].inflationApplied, true);

const inflatedLumpSum = runProjection(helper, {
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: false
    }
  },
  educationSupport: {
    linkedDependentCount: 1,
    perLinkedDependentEducationFunding: 40000,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "child-a",
        dateOfBirth: "2010-01-01"
      }
    ]
  },
  educationInflationRatePercent: 5,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: true,
    educationStartAge: 18
  },
  needPoints: createNeedPoints(5)
});
assert.equal(inflatedLumpSum.currentDependentSchedules[0].payments.length, 1);
assert.equal(inflatedLumpSum.currentDependentSchedules[0].payments[0].amount, 44100);
assert.equal(inflatedLumpSum.currentDependentSchedules[0].payments[0].inflationApplied, true);

const percentRate = runProjection(helper, {
  educationInflationRatePercent: 4,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: true,
    educationStartAge: 18
  }
});
const decimalRate = runProjection(helper, {
  educationInflationRatePercent: 0.04,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: true,
    educationStartAge: 18
  }
});
assert.equal(
  percentRate.currentDependentSchedules[0].payments[0].amount,
  decimalRate.currentDependentSchedules[0].payments[0].amount,
  "4 and 0.04 should normalize to the same education inflation rate"
);
const halfPercentRate = runProjection(helper, {
  educationInflationRatePercent: 0.5,
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: true,
    educationStartAge: 18
  }
});
assert.equal(halfPercentRate.assumptionsUsed.educationInflationAnnualRate, 0.005);

const missingDob = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 1,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "child-missing"
      }
    ]
  },
  needPoints: createNeedPoints(4)
});
assert.equal(missingDob.currentDependentSchedules.length, 0);
assert.ok(issueCodes(missingDob.dataGaps).includes("current-dependent-education-dob-missing"));

const alreadyPastSchedule = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 1,
    perLinkedDependentEducationFunding: 40000,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "adult-child",
        dateOfBirth: "2000-01-01"
      }
    ]
  },
  needPoints: createNeedPoints(5)
});
assert.equal(alreadyPastSchedule.currentDependentSchedules.length, 1);
assert.equal(alreadyPastSchedule.educationPoints[0].educationNeedAmount, 0);
assert.equal(alreadyPastSchedule.educationPoints[5].educationNeedAmount, 0);

const untimedProjected = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 0,
    desiredAdditionalDependentCount: 1,
    perDesiredAdditionalDependentEducationFunding: 20000,
    desiredAdditionalDependentEducationFundingNeed: 20000,
    totalEducationFundingNeed: 20000,
    currentDependentDetails: []
  },
  needPoints: createNeedPoints(15)
});
assert.equal(untimedProjected.untimedProjectedDependents.length, 1);
assert.equal(untimedProjected.educationPoints[0].untimedProjectedDependentNeedAmount, 20000);
assert.equal(untimedProjected.educationPoints[15].projectedDependentNeedAmount, 20000);
assert.ok(issueCodes(untimedProjected.warnings).includes("projected-dependent-education-kept-through-horizon"));

const lumpUntimedProjected = runProjection(helper, {
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: false
    }
  },
  educationSupport: {
    linkedDependentCount: 0,
    desiredAdditionalDependentCount: 1,
    perDesiredAdditionalDependentEducationFunding: 20000,
    desiredAdditionalDependentEducationFundingNeed: 20000,
    totalEducationFundingNeed: 20000,
    currentDependentDetails: []
  },
  needPoints: createNeedPoints(15)
});
assert.equal(lumpUntimedProjected.untimedProjectedDependents.length, 1);
assert.equal(lumpUntimedProjected.educationPoints[15].projectedDependentNeedAmount, 20000);
assert.ok(issueCodes(lumpUntimedProjected.warnings).includes("projected-dependent-untimed-schedule-mode-not-applied"));

const timedProjected = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 0,
    desiredAdditionalDependentCount: 1,
    perDesiredAdditionalDependentEducationFunding: 20000,
    desiredAdditionalDependentEducationFundingNeed: 20000,
    totalEducationFundingNeed: 20000,
    currentDependentDetails: []
  },
  projectedDependents: [
    {
      id: "future-child",
      expectedBirthYear: 2020
    }
  ],
  needPoints: createNeedPoints(20)
});
assert.equal(timedProjected.projectedDependentSchedules.length, 1);
assert.equal(timedProjected.projectedDependentSchedules[0].dateOfBirth, "2020-01-01");
assert.equal(timedProjected.projectedDependentSchedules[0].educationStartYear, 2038);
assert.ok(issueCodes(timedProjected.warnings).includes("projected-dependent-birth-year-defaulted-to-jan-1"));
assert.equal(timedProjected.educationPoints[12].projectedDependentNeedAmount, 20000);
assert.equal(timedProjected.educationPoints[13].projectedDependentNeedAmount, 15000);

const lumpTimedProjected = runProjection(helper, {
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: false
    }
  },
  educationSupport: {
    linkedDependentCount: 0,
    desiredAdditionalDependentCount: 1,
    perDesiredAdditionalDependentEducationFunding: 20000,
    desiredAdditionalDependentEducationFundingNeed: 20000,
    totalEducationFundingNeed: 20000,
    currentDependentDetails: []
  },
  projectedDependents: [
    {
      id: "future-child",
      expectedBirthYear: 2020
    }
  ],
  needPoints: createNeedPoints(20)
});
assert.equal(lumpTimedProjected.projectedDependentSchedules.length, 1);
assert.equal(lumpTimedProjected.projectedDependentSchedules[0].dateOfBirth, "2020-01-01");
assert.equal(lumpTimedProjected.projectedDependentSchedules[0].payments.length, 1);
assert.equal(lumpTimedProjected.projectedDependentSchedules[0].payments[0].paymentYear, 2038);
assert.equal(lumpTimedProjected.projectedDependentSchedules[0].payments[0].amount, 20000);
assert.equal(lumpTimedProjected.educationPoints[12].projectedDependentNeedAmount, 20000);
assert.equal(lumpTimedProjected.educationPoints[13].projectedDependentNeedAmount, 0);
assert.ok(issueCodes(lumpTimedProjected.warnings).includes("projected-dependent-birth-year-defaulted-to-jan-1"));

const invalidProjectedBirthYear = runProjection(helper, {
  educationSupport: {
    linkedDependentCount: 0,
    desiredAdditionalDependentCount: 1,
    perDesiredAdditionalDependentEducationFunding: 20000,
    desiredAdditionalDependentEducationFundingNeed: 20000,
    totalEducationFundingNeed: 20000,
    currentDependentDetails: []
  },
  projectedDependents: [
    {
      id: "future-child",
      rawExpectedBirthYear: "abcd",
      validationStatus: "invalid",
      validationCode: "projected-dependent-birth-year-invalid"
    }
  ],
  needPoints: createNeedPoints(15)
});
assert.equal(invalidProjectedBirthYear.projectedDependentSchedules.length, 0);
assert.equal(invalidProjectedBirthYear.untimedProjectedDependents.length, 1);
assert.equal(invalidProjectedBirthYear.educationPoints[15].projectedDependentNeedAmount, 20000);
assert.ok(issueCodes(invalidProjectedBirthYear.warnings).includes("projected-dependent-birth-year-invalid"));

const projectedExcluded = runProjection(helper, {
  educationSupport: {
    desiredAdditionalDependentCount: 1,
    desiredAdditionalDependentEducationFundingNeed: 20000,
    totalEducationFundingNeed: 20000
  },
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: false,
    applyEducationInflation: false,
    educationStartAge: 18
  },
  needPoints: createNeedPoints(5)
});
assert.equal(projectedExcluded.educationPoints[0].projectedDependentNeedAmount, 0);
assert.ok(issueCodes(projectedExcluded.warnings).includes("projected-dependent-education-excluded-by-setting"));

assert.equal(currentSchedule.assumptionsUsed.educationSavingsOffsetApplied, false);
assert.equal(currentSchedule.assumptionsUsed.resourceSpendingApplied, false);
assert.equal(currentSchedule.assumptionsUsed.educationSpecificSavingsConsumed, false);
assert.equal(currentSchedule.educationPoints[0].grossEducationNeedAmount, currentSchedule.educationPoints[0].netEducationNeedAmount);
assert.equal(currentSchedule.educationPoints[0].educationSavingsOffsetAmount, 0);

const offsetEnabled = runProjection(helper, {
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18,
    useExistingEducationSavingsOffset: true
  },
  assetFacts: {
    assets: [
      {
        assetId: "plan-529",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        label: "529 Plan",
        currentValue: 15000,
        sourcePaths: ["assetFacts.assets[0].currentValue"]
      },
      {
        assetId: "general-cash",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "checkingAccount",
        label: "Checking",
        currentValue: 999999
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
        assetId: "general-cash",
        categoryKey: "cashAndCashEquivalents",
        include: true,
        treatedValue: 999999
      }
    ]
  },
  needPoints: createNeedPoints(15)
});
assert.equal(offsetEnabled.educationSavingsOffset.active, true);
assert.equal(offsetEnabled.educationResourceSpending.effectiveMode, "educationSavingsOnly");
assert.equal(offsetEnabled.educationResourceSpending.modeDerivedFromUseEducationSavingsOffset, true);
assert.equal(offsetEnabled.educationSavingsOffset.totalEducationSavingsAvailable, 15000);
assert.equal(offsetEnabled.educationSavingsOffset.eligibleEducationSavingsAssets.length, 1);
assert.equal(offsetEnabled.educationSavingsOffset.eligibleEducationSavingsAssets[0].assetId, "plan-529");
assert.ok(
  offsetEnabled.educationSavingsOffset.excludedEducationSavingsAssets.some((asset) => asset.assetId === "general-cash"),
  "general cash should not be eligible for education savings offset"
);
assert.equal(offsetEnabled.educationPoints[0].grossEducationNeedAmount, 60000);
assert.equal(offsetEnabled.educationPoints[0].educationSavingsOffsetAmount, 15000);
assert.equal(offsetEnabled.educationPoints[0].netEducationNeedAmount, 45000);
assert.equal(offsetEnabled.educationPoints[0].educationNeedAmount, 45000);
assert.equal(offsetEnabled.educationPoints[0].grossCurrentDependentNeedAmount, 40000);
assert.equal(offsetEnabled.educationPoints[0].currentDependentEducationSavingsOffsetAmount, 15000);
assert.equal(offsetEnabled.educationPoints[0].currentDependentNeedAmount, 25000);
assert.equal(offsetEnabled.educationPoints[6].grossUntimedProjectedDependentNeedAmount, 20000);
assert.equal(offsetEnabled.educationPoints[6].untimedProjectedDependentEducationSavingsOffsetAmount, 15000);
assert.equal(offsetEnabled.educationPoints[6].untimedProjectedDependentNeedAmount, 5000);
assert.ok(
  issueCodes(offsetEnabled.educationPoints[6].warnings)
    .includes("education-savings-offset-applied-to-untimed-projected-dependent-aggregate"),
  "remaining offset applied to untimed projected aggregate should be traced"
);
assert.equal(offsetEnabled.assumptionsUsed.resourceSpendingApplied, false);
assert.equal(offsetEnabled.assumptionsUsed.generalResourceReductionApplied, false);
assert.equal(offsetEnabled.assumptionsUsed.effectiveEducationResourceSpendingMode, "educationSavingsOnly");

const lumpOffsetEnabled = runProjection(helper, {
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationPaymentScheduleMode: "lumpSumAtStart",
      useEducationSavingsOffset: true
    }
  },
  educationSupport: {
    linkedDependentCount: 1,
    desiredAdditionalDependentCount: 0,
    perLinkedDependentEducationFunding: 40000,
    linkedDependentEducationFundingNeed: 40000,
    totalEducationFundingNeed: 40000,
    currentDependentDetails: [
      {
        id: "child-a",
        dateOfBirth: "2010-01-01"
      }
    ]
  },
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18,
    useExistingEducationSavingsOffset: false
  },
  assetFacts: {
    assets: [
      {
        assetId: "plan-529",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        currentValue: 15000
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
      }
    ]
  },
  needPoints: createNeedPoints(5)
});
assert.equal(lumpOffsetEnabled.educationSavingsOffset.active, true);
assert.equal(lumpOffsetEnabled.educationResourceSpending.effectiveMode, "educationSavingsOnly");
assert.equal(lumpOffsetEnabled.educationPoints[0].grossEducationNeedAmount, 40000);
assert.equal(lumpOffsetEnabled.educationPoints[0].educationSavingsOffsetAmount, 15000);
assert.equal(lumpOffsetEnabled.educationPoints[0].netEducationNeedAmount, 25000);
assert.equal(lumpOffsetEnabled.educationPoints[3].educationNeedAmount, 0);
assert.equal(lumpOffsetEnabled.assumptionsUsed.generalResourceReductionApplied, false);

const offsetDisabledWithAssets = runProjection(helper, {
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18,
    useExistingEducationSavingsOffset: false
  },
  assetFacts: {
    assets: [
      {
        assetId: "plan-529",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        currentValue: 15000
      }
    ]
  },
  needPoints: createNeedPoints(8)
});
assert.equal(offsetDisabledWithAssets.educationSavingsOffset.active, false);
assert.equal(offsetDisabledWithAssets.educationResourceSpending.effectiveMode, "off");
assert.equal(offsetDisabledWithAssets.educationPoints[0].grossEducationNeedAmount, 60000);
assert.equal(offsetDisabledWithAssets.educationPoints[0].netEducationNeedAmount, 60000);
assert.equal(offsetDisabledWithAssets.educationPoints[0].trace.educationSavingsOffsetActivationTraceCode, "education-savings-offset-disabled");

const doubleCountGuard = runProjection(helper, {
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18,
    useExistingEducationSavingsOffset: true
  },
  assetFacts: {
    assets: [
      {
        assetId: "included-529",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        currentValue: 15000
      }
    ]
  },
  treatedAssetOffsets: {
    assets: [
      {
        assetId: "included-529",
        categoryKey: "educationSpecificSavings",
        include: true,
        treatedValue: 15000
      }
    ]
  },
  needPoints: createNeedPoints(3)
});
assert.equal(doubleCountGuard.educationSavingsOffset.totalEducationSavingsAvailable, 0);
assert.equal(doubleCountGuard.educationPoints[0].educationSavingsOffsetAmount, 0);
assert.ok(issueCodes(doubleCountGuard.warnings).includes("education-savings-offset-resource-double-count-risk"));
assert.ok(
  doubleCountGuard.educationSavingsOffset.excludedEducationSavingsAssets.some((asset) => (
    asset.exclusionCode === "education-savings-offset-resource-double-count-risk"
  )),
  "education assets already included in treated resources should be excluded from offset"
);

const resourceModeOffOverridesSavingsToggle = runProjection(helper, {
  coverageStrategyScenarioSettings: {
    version: 1,
    source: "runtimeScenarioSettings",
    education: {
      educationResourceSpendingMode: "off",
      useEducationSavingsOffset: true
    },
    trace: {
      fieldSources: {
        "education.educationResourceSpendingMode": "runtimeScenarioSettings.education.educationResourceSpendingMode",
        "education.useEducationSavingsOffset": "runtimeScenarioSettings.education.useEducationSavingsOffset"
      }
    }
  },
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18
  },
  assetFacts: {
    assets: [
      {
        assetId: "plan-529",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        currentValue: 15000
      }
    ]
  },
  needPoints: createNeedPoints(4)
});
assert.equal(resourceModeOffOverridesSavingsToggle.educationSavingsOffset.active, false);
assert.equal(resourceModeOffOverridesSavingsToggle.educationResourceSpending.effectiveMode, "off");
assert.equal(resourceModeOffOverridesSavingsToggle.educationPoints[0].grossEducationNeedAmount, 60000);
assert.equal(resourceModeOffOverridesSavingsToggle.educationPoints[0].netEducationNeedAmount, 60000);

const eligibleResourcesAfterSavings = runProjection(helper, {
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
  educationAssumptions: {
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: 18
  },
  assetFacts: {
    assets: [
      {
        assetId: "plan-529",
        categoryKey: "educationSpecificSavings",
        typeKey: "plan529Account",
        currentValue: 15000
      },
      {
        assetId: "general-cash",
        categoryKey: "cashAndCashEquivalents",
        typeKey: "checkingAccount",
        currentValue: 999999
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
        assetId: "general-cash",
        categoryKey: "cashAndCashEquivalents",
        include: true,
        treatedValue: 999999
      }
    ]
  },
  needPoints: createNeedPoints(4)
});
assert.equal(eligibleResourcesAfterSavings.educationSavingsOffset.active, true);
assert.equal(eligibleResourcesAfterSavings.educationPoints[0].educationSavingsOffsetAmount, 15000);
assert.equal(eligibleResourcesAfterSavings.educationPoints[0].broaderEligibleResourceOffsetAmount, 0);
assert.equal(eligibleResourcesAfterSavings.educationResourceSpending.effectiveMode, "eligibleResourcesAfterEducationSavings");
assert.equal(eligibleResourcesAfterSavings.educationResourceSpending.broaderEligibleResourceStatus, "unavailable");
assert.ok(issueCodes(eligibleResourcesAfterSavings.dataGaps).includes("education-eligible-resource-spending-source-unavailable"));
assert.equal(eligibleResourcesAfterSavings.assumptionsUsed.generalResourceReductionApplied, false);

const adapterContext = createContext();
[
  "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-scenario-settings.js",
  "app/features/lens-analysis/coverage-strategy-need-line-adapter.js"
].forEach((scriptPath) => loadScript(adapterContext, scriptPath));
const buildNeedLine = adapterContext.LensApp.lensAnalysis.buildCoverageStrategyNeedLine;
const needsResult = {
  method: "needsAnalysis",
  components: {
    debtPayoff: 0,
    essentialSupport: 0,
    education: 999999,
    finalExpenses: 0,
    healthcareExpenses: 0,
    transitionNeeds: 0,
    discretionarySupport: 0
  },
  commonOffsets: {},
  assumptions: {
    valuationDate: "2026-01-01"
  },
  trace: [
    {
      key: "educationFundingInflation",
      inputs: {
        includeEducationFundingSetting: true,
        includeProjectedDependentsSetting: true,
        applied: false,
        educationStartAge: 18,
        plannedDependentEducationIncludedAmount: 20000
      }
    }
  ]
};
const needLine = buildNeedLine({
  lensModel: {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    educationSupport: {
      linkedDependentCount: 1,
      desiredAdditionalDependentCount: 1,
      perLinkedDependentEducationFunding: 40000,
      perDesiredAdditionalDependentEducationFunding: 20000,
      linkedDependentEducationFundingNeed: 40000,
      desiredAdditionalDependentEducationFundingNeed: 20000,
      totalEducationFundingNeed: 60000,
      currentDependentDetails: [
        {
          id: "child-a",
          dateOfBirth: "2010-01-01"
        }
      ]
    },
    assetFacts: {
      assets: [
        {
          assetId: "plan-529",
          categoryKey: "educationSpecificSavings",
          typeKey: "plan529Account",
          currentValue: 15000
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
        }
      ]
    }
  },
  needsResult,
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18,
      useExistingEducationSavingsOffset: true
    },
    inflationAssumptions: {
      educationInflationRatePercent: 5
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 15
});
assert.equal(needLine.needPoints[0].componentAmounts.education, 45000);
assert.equal(needLine.needPoints[0].trace.educationProjection.grossEducationNeedAmount, 60000);
assert.equal(needLine.needPoints[0].trace.educationProjection.educationSavingsOffsetAmount, 15000);
assert.equal(needLine.needPoints[6].componentAmounts.education, 5000);
assert.equal(needLine.needPoints[15].componentAmounts.education, 5000);
assert.notEqual(needLine.needPoints[0].componentAmounts.education, 999999);
assert.equal(needLine.needPoints[0].trace.componentTiming.education, "record-level-education-obligation-schedule");
assert.equal(needLine.componentModels.education.lifetimeProjection.aggregateFallbackUsed, false);
assert.equal(needLine.componentModels.education.lifetimeProjection.educationSavingsOffset.active, true);
assert.equal(
  needLine.componentModels.education.lifetimeProjection.educationSavingsOffset.settingOwnership,
  "coverage-strategy-scenario-settings"
);
assert.equal(
  needLine.componentModels.education.lifetimeProjection.educationSavingsOffset.legacyMapped,
  true
);
assert.equal(needLine.needPoints[0].trace.assetOffsetSubtracted, false);

const fallbackNeedLine = buildNeedLine({
  lensModel: {
    educationSupport: {
      totalEducationFundingNeed: 50000
    }
  },
  needsResult: {
    ...needsResult,
    components: {
      ...needsResult.components,
      education: 50000
    },
    trace: []
  },
  analysisSettings: {},
  valuationDate: "2026-01-01",
  horizonYears: 3
});
assert.equal(fallbackNeedLine.needPoints[0].componentAmounts.education, 50000);
assert.equal(fallbackNeedLine.componentModels.education.lifetimeProjection.aggregateFallbackUsed, true);
assert.ok(issueCodes(fallbackNeedLine.warnings).includes("education-aggregate-fallback-used"));

const pastNeedLine = buildNeedLine({
  lensModel: {
    profileFacts: {
      clientDateOfBirth: "1980-01-01"
    },
    educationSupport: {
      linkedDependentCount: 1,
      perLinkedDependentEducationFunding: 40000,
      linkedDependentEducationFundingNeed: 40000,
      totalEducationFundingNeed: 40000,
      currentDependentDetails: [
        {
          id: "adult-child",
          dateOfBirth: "2000-01-01"
        }
      ]
    }
  },
  needsResult: {
    ...needsResult,
    components: {
      ...needsResult.components,
      education: 40000
    }
  },
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 5
});
assert.equal(pastNeedLine.needPoints[0].componentAmounts.education, 0);
assert.equal(pastNeedLine.componentModels.education.lifetimeProjection.aggregateFallbackUsed, false);

const pageSource = readRepoFile("pages/coverage-strategy.html");
assert.ok(
  pageSource.indexOf("coverage-strategy-education-lifetime-projection.js")
    < pageSource.indexOf("coverage-strategy-need-line-adapter.js"),
  "Coverage Strategy should load education lifetime projection before Need Line adapter"
);
assert.ok(
  pageSource.indexOf("coverage-strategy-scenario-settings.js")
    < pageSource.indexOf("coverage-strategy-need-line-adapter.js"),
  "Coverage Strategy should load scenario settings before Need Line adapter"
);
[
  "pages/analysis-estimate.html",
  "pages/dime-results.html",
  "pages/simple-needs-results.html",
  "pages/hlv-results.html",
  "pages/income-loss-impact.html"
].forEach((pagePath) => {
  assert.doesNotMatch(readRepoFile(pagePath), /coverage-strategy-education-lifetime-projection\.js/);
});

console.log("coverage strategy education lifetime projection check passed");
