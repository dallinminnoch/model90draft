#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const financial = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-financial-storyline-calculations.js"
));
const assembly = require(path.join(
  repoRoot,
  "app/features/lens-analysis/income-impact-timeline-story-assembly.js"
));

const { buildIncomeImpactFinancialStorylineCandidates } = financial;
const { buildIncomeImpactTimelineStoryAssembly } = assembly;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ids(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return item.id;
  });
}

function titles(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    return item.title || item.cardTitle || item.displayLabel;
  });
}

function makeBaseScenario(overrides) {
  return Object.assign({
    scenario: {
      selectedDeathDate: "2036-05-14"
    },
    deathEvent: {
      date: "2036-05-14"
    },
    timelineFacts: {},
    postDeathSeries: {
      points: [],
      summary: {},
      depletion: {
        depleted: false,
        depletionMonthIndex: null,
        monthsCovered: 60
      }
    },
    trace: {}
  }, overrides || {});
}

function buildFinancial(input) {
  const before = cloneJson(input);
  const result = buildIncomeImpactFinancialStorylineCandidates(input);
  assert.deepEqual(input, before, "supporting trigger helper path must not mutate input");
  return result;
}

function buildAssemblyFromFinancial(financialStoryline) {
  return buildIncomeImpactTimelineStoryAssembly({
    financialStoryline,
    options: {
      supportingGraphDotLimit: 8
    }
  });
}

function assertSupportingOnly(financialStoryline, candidateId, title, tone) {
  const candidate = financialStoryline.safeRenderableEvents.find(function (item) {
    return item.id === candidateId;
  });
  assert.ok(candidate, `${candidateId} should be safe-renderable`);
  assert.equal(candidate.supportingDotOnly, true, `${candidateId} should be marked supporting-only`);
  assert.equal(candidate.supportingDotEligible, true, `${candidateId} should be supporting-dot eligible`);
  assert.equal(candidate.eligibleForMajorCard, false, `${candidateId} must not be major-card eligible`);
  assert.equal(candidate.displayLabel, title);

  const story = buildAssemblyFromFinancial(financialStoryline);
  assert.equal(
    titles(story.storySteps).includes(title),
    false,
    `${title} must not enter the main 9-step strip`
  );
  assert.ok(
    story.supportingGraphDots.some(function (dot) {
      return dot.sourceEventId === candidateId && dot.title === title && dot.tone === tone;
    }),
    `${title} should render as an assembly supporting dot`
  );
}

const compressionInput = {
  scenario: makeBaseScenario({
    trace: {
      autoCompressedBaselineApplied: true,
      compressionPath: {
        formula: "ease-in-monthly-slider-ramp"
      },
      compressionHorizon: {
        source: "rawBaselineDepletionMonth",
        months: 12
      }
    },
    postDeathSeries: {
      points: [
        {
          monthIndex: 0,
          survivorNeeds: 4000,
          monthlyHouseholdExpenseDelta: 0,
          trace: {
            autoCompressedBaselineApplied: true,
            monthlyHouseholdExpenseDelta: 0
          }
        },
        {
          monthIndex: 3,
          survivorNeeds: 3600,
          monthlyHouseholdExpenseDelta: -400,
          cumulativeHouseholdExpenseDelta: -400,
          trace: {
            autoCompressedBaselineApplied: true,
            autoCompressionProgress: 0.25,
            monthlyHouseholdExpenseDelta: -400,
            cumulativeHouseholdExpenseDelta: -400
          }
        }
      ],
      trace: {
        autoCompressedBaselineApplied: true,
        formula: "ease-in-monthly-slider-ramp"
      },
      summary: {},
      depletion: {
        depleted: false,
        monthsCovered: 60
      }
    }
  })
};
const compressionResult = buildFinancial(compressionInput);
assertSupportingOnly(compressionResult, "spending-begins-to-compress", "Spending Begins to Compress", "caution");
const compressionCandidate = compressionResult.safeRenderableEvents.find(function (candidate) {
  return candidate.id === "spending-begins-to-compress";
});
assert.equal(compressionCandidate.timing.monthOffset, 3);
assert.equal(compressionCandidate.trace.baselineExpenseAmount, 4000);
assert.equal(compressionCandidate.trace.compressedExpenseAmount, 3600);
assert.equal(compressionCandidate.trace.reductionAmount, 400);
assert.equal(compressionCandidate.trace.reductionPercentage, 10);
assert.equal(compressionCandidate.trace.candidateSource, "supporting-dot-trigger");

const noReductionResult = buildFinancial({
  scenario: makeBaseScenario({
    trace: {
      autoCompressedBaselineApplied: true
    },
    postDeathSeries: {
      points: [
        {
          monthIndex: 1,
          survivorNeeds: 4000,
          monthlyHouseholdExpenseDelta: 0,
          trace: {
            autoCompressedBaselineApplied: true,
            monthlyHouseholdExpenseDelta: 0
          }
        }
      ],
      trace: {
        autoCompressedBaselineApplied: true
      },
      summary: {},
      depletion: {
        depleted: false,
        monthsCovered: 60
      }
    }
  })
});
assert.equal(ids(noReductionResult.safeRenderableEvents).includes("spending-begins-to-compress"), false);

const reportingOnlyResult = buildFinancial({
  scenario: makeBaseScenario({
    trace: {
      compressionReporting: {
        reportingOnly: true,
        autoCompressionApplied: false,
        reductionsApplied: false
      }
    },
    postDeathSeries: {
      points: [
        {
          monthIndex: 2,
          survivorNeeds: 4000,
          monthlyHouseholdExpenseDelta: -400
        }
      ],
      summary: {},
      depletion: {
        depleted: false,
        monthsCovered: 60
      }
    }
  })
});
assert.equal(ids(reportingOnlyResult.safeRenderableEvents).includes("spending-begins-to-compress"), false);

const survivorIncomeResult = buildFinancial({
  scenario: makeBaseScenario({
    trace: {
      layer3: {
        survivorIncome: {
          annualAmount: 48000,
          startDelayMonths: 3,
          scenarioOverride: true,
          sourcePaths: [
            "lensModel.survivorScenario.survivorNetAnnualIncome",
            "lensModel.survivorScenario.survivorIncomeStartDelayMonths"
          ]
        }
      }
    },
    postDeathSeries: {
      points: [
        { monthIndex: 1, survivorIncome: 0 },
        { monthIndex: 2, survivorIncome: 0 },
        { monthIndex: 3, survivorIncome: 0 },
        { monthIndex: 4, survivorIncome: 4000 }
      ],
      summary: {},
      depletion: {
        depleted: false,
        monthsCovered: 60
      }
    }
  })
});
assertSupportingOnly(survivorIncomeResult, "survivor-income-begins", "Survivor Income Begins", "stable");
const survivorCandidate = survivorIncomeResult.safeRenderableEvents.find(function (candidate) {
  return candidate.id === "survivor-income-begins";
});
assert.equal(survivorCandidate.severity, "stable");
assert.equal(survivorCandidate.timing.monthOffset, 4);
assert.equal(survivorCandidate.amount.value, 4000);
assert.equal(survivorCandidate.trace.monthlySurvivorIncomeAmount, 4000);
assert.equal(survivorCandidate.trace.startDelayMonths, 3);
assert.equal(survivorCandidate.trace.startMonth, 4);
assert.equal(survivorCandidate.trace.assumptionControlSource, "scenarioOptions.includeSurvivorIncome");

const noDelayResult = buildFinancial({
  scenario: makeBaseScenario({
    trace: {
      layer3: {
        survivorIncome: {
          annualAmount: 48000,
          startDelayMonths: 0,
          sourcePaths: ["lensModel.survivorScenario.survivorNetAnnualIncome"]
        }
      }
    }
  })
});
assert.equal(ids(noDelayResult.safeRenderableEvents).includes("survivor-income-begins"), false);

const disabledResult = buildFinancial({
  scenario: makeBaseScenario({
    trace: {
      layer3: {
        survivorIncome: {
          annualAmount: 0,
          startDelayMonths: 6,
          status: "suppressed",
          suppressionReason: "scenario-survivor-income-disabled",
          sourcePaths: ["scenarioOptions.includeSurvivorIncome"]
        }
      }
    }
  })
});
assert.equal(ids(disabledResult.safeRenderableEvents).includes("survivor-income-begins"), false);

const oldMechanicResult = buildFinancial({
  scenario: makeBaseScenario({
    postDeathSeries: {
      points: [{ monthIndex: 1, survivorIncome: 3000 }],
      summary: {
        annualShortfall: 12000
      },
      depletion: {
        depleted: false,
        monthsCovered: 60
      }
    },
    trace: {
      layer3: {
        survivorIncome: {
          annualAmount: 36000,
          startDelayMonths: 0,
          sourcePaths: ["scenario.trace.layer3.survivorIncome"]
        }
      }
    }
  })
});
assert.equal(ids(oldMechanicResult.safeRenderableEvents).includes("survivor-income-helps-offset-need"), false);
assert.equal(ids(oldMechanicResult.safeRenderableEvents).includes("survivor-income-not-enough-alone"), false);
assert.equal(ids(oldMechanicResult.safeRenderableEvents).includes("survivor-income-begins"), false);
assert.equal(
  titles(buildAssemblyFromFinancial(oldMechanicResult).storySteps).some(function (title) {
    return [
      "Survivor Income Supports the Runway",
      "Plan Depends on Survivor Income",
      "Survivor Income Is Not Enough",
      "Income Gap Drives the Shortfall",
      "Survivor Income Helps Offset Need",
      "Survivor Income Is Not Enough Alone"
    ].includes(title);
  }),
  false
);

console.log("Income Impact supporting-dot trigger check passed.");
