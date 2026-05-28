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
assert.doesNotMatch(moduleSource, /assetFacts|treatedAssetOffsets|plan529/);

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

const adapterContext = createContext();
[
  "app/features/lens-analysis/coverage-strategy-mortgage-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-debt-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-healthcare-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-final-expense-lifetime-projection.js",
  "app/features/lens-analysis/coverage-strategy-education-lifetime-projection.js",
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
    }
  },
  needsResult,
  analysisSettings: {
    educationAssumptions: {
      includeEducationFunding: true,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      educationStartAge: 18
    },
    inflationAssumptions: {
      educationInflationRatePercent: 5
    }
  },
  valuationDate: "2026-01-01",
  horizonYears: 15
});
assert.equal(needLine.needPoints[0].componentAmounts.education, 60000);
assert.equal(needLine.needPoints[6].componentAmounts.education, 20000);
assert.equal(needLine.needPoints[15].componentAmounts.education, 20000);
assert.notEqual(needLine.needPoints[0].componentAmounts.education, 999999);
assert.equal(needLine.needPoints[0].trace.componentTiming.education, "record-level-education-obligation-schedule");
assert.equal(needLine.componentModels.education.lifetimeProjection.aggregateFallbackUsed, false);

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
