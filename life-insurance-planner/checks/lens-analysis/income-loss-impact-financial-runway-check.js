#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getChangedFiles(relativePaths) {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["diff", "--name-only", "--", ...relativePaths],
      {
        cwd: repoRoot,
        encoding: "utf8"
      }
    );
    return output
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function createDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactFinancialRunwayHarness = { renderFinancialSecurityCard, renderFinancialRunwayCards, renderTimeline };\n})(window);\n"
  );
  const sandbox = {
    console,
    document: {
      addEventListener() {}
    },
    Intl,
    URL,
    URLSearchParams,
    window: {
      LensApp: {}
    }
  };
  vm.runInNewContext(instrumentedSource, sandbox, {
    filename: "income-loss-impact-display.js"
  });
  return sandbox.window.__incomeImpactFinancialRunwayHarness;
}

const helperSource = readRepoFile("app/features/lens-analysis/income-loss-impact-timeline-calculations.js");
const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");

assert.match(helperSource, /financialRunway/);
assert.match(helperSource, /projectionPoints/);
assert.match(helperSource, /projectionMode/);
assert.match(helperSource, /growthAmount/);
assert.match(helperSource, /growthRate/);
assert.match(helperSource, /scheduledObligations/);
assert.match(helperSource, /DEFAULT_RUNWAY_PROJECTION_YEARS/);
assert.doesNotMatch(helperSource, /runNeedsAnalysis|analysis-methods/);
assert.doesNotMatch(helperSource, /\bdocument\s*[.\[]|\bwindow\s*[.\[]|\blocalStorage\s*[.\[]|\bsessionStorage\s*[.\[]/);

assert.match(displaySource, /data-income-impact-financial-runway/);
assert.match(displaySource, /data-income-impact-runway-primary-visual/);
assert.match(displaySource, /data-income-impact-runway-snapshot/);
assert.match(displaySource, /data-income-impact-runway-svg/);
assert.match(displaySource, /data-income-impact-runway-line/);
assert.match(displaySource, /data-income-impact-runway-point/);
assert.match(displaySource, /data-income-impact-runway-year-marker/);
assert.match(displaySource, /data-income-impact-runway-depletion/);
assert.match(displaySource, /Immediate Money Available/);
assert.match(displaySource, /Immediate Obligations/);
assert.match(displaySource, /Annual Household Shortfall/);
assert.doesNotMatch(displaySource, /Built from helper events|calculateIncomeLossImpactTimeline\(\)\./);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Impact runway should not persist slider or model state."
);

const harness = createDisplayHarness(displaySource);
const fixture = {
  selectedDeath: {
    date: "2030-06-15",
    age: 50
  },
  financialRunway: {
    status: "complete",
    startingResources: 600000,
    existingCoverage: 500000,
    availableAssets: 100000,
    immediateObligations: 100000,
    netAvailableResources: 500000,
    annualHouseholdNeed: 90000,
    annualSurvivorIncome: 30000,
    annualShortfall: 60000,
    yearsOfSecurity: 8,
    monthsOfSecurity: 4,
    totalMonthsOfSecurity: 100,
    depletionYear: 2038,
    depletionDate: "2038-10-15",
    projectionMode: "current-dollar",
    projectionYears: 10,
    projectionPoints: [
      {
        yearIndex: 0,
        date: "2030-06-15",
        age: 50,
        startingBalance: 500000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: 500000,
        status: "starting",
        sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
      },
      {
        yearIndex: 1,
        date: "2031-06-15",
        age: 51,
        startingBalance: 500000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: 440000,
        status: "available",
        sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
      },
      {
        yearIndex: 9,
        date: "2039-06-15",
        age: 59,
        startingBalance: 20000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: -40000,
        status: "depleted",
        sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
      },
      {
        yearIndex: 10,
        date: "2040-06-15",
        age: 60,
        startingBalance: -40000,
        growthAmount: 0,
        growthRate: 0,
        annualNeed: 90000,
        survivorIncomeOffset: 30000,
        annualShortfall: 60000,
        scheduledObligations: 0,
        endingBalance: -100000,
        status: "depleted",
        sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
      }
    ],
    warnings: [],
    dataGaps: []
  },
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "8 years 4 months",
      status: "complete"
    }
  ],
  timelineEvents: [
    {
      type: "death",
      date: "2030-06-15",
      age: 50,
      label: "Selected death event"
    },
    {
      type: "coverageAvailable",
      date: "2030-06-15",
      age: 50,
      label: "Existing coverage available",
      amount: 500000
    }
  ],
  dataGaps: [],
  warnings: []
};

const cardsHtml = harness.renderFinancialRunwayCards(fixture);
assert.match(cardsHtml, /Immediate Money Available/);
assert.match(cardsHtml, /\$600,000/);
assert.match(cardsHtml, /Immediate Obligations/);
assert.match(cardsHtml, /\$100,000/);
assert.match(cardsHtml, /Annual Household Shortfall/);
assert.match(cardsHtml, /\$60,000/);

const securityHtml = harness.renderFinancialSecurityCard(fixture);
assert.match(securityHtml, /Years of Financial Security/);
assert.match(securityHtml, /8 years 4 months/);
assert.match(securityHtml, /Existing coverage \+ available assets, less immediate obligations, divided by estimated annual household shortfall\./);
assert.doesNotMatch(securityHtml, /final recommendation|fully protected/i);

const partialFixture = {
  ...fixture,
  financialRunway: {
    ...fixture.financialRunway,
    status: "partial-estimate",
    existingCoverage: null,
    yearsOfSecurity: 0,
    monthsOfSecurity: 0,
    totalMonthsOfSecurity: 0,
    warnings: [
      {
        code: "partial-financial-runway",
        message: "Financial runway is a partial estimate because critical facts are missing."
      }
    ],
    dataGaps: [
      {
        code: "missing-existing-coverage",
        label: "Existing coverage is missing."
      }
    ]
  },
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "Partial runway estimate",
      status: "partial-estimate"
    }
  ],
  dataGaps: [
    {
      code: "missing-existing-coverage",
      label: "Existing coverage is missing."
    }
  ],
  warnings: [
    {
      code: "partial-financial-runway",
      message: "Financial runway is a partial estimate because critical facts are missing."
    }
  ]
};
const partialSecurityHtml = harness.renderFinancialSecurityCard(partialFixture);
assert.match(partialSecurityHtml, /Partial runway estimate/);
assert.match(partialSecurityHtml, /This preview is using the facts currently available\./);
assert.match(partialSecurityHtml, /Add the missing items below to improve the estimate\./);
assert.match(partialSecurityHtml, /Current estimate: 0 years 0 months/);
assert.doesNotMatch(
  partialSecurityHtml,
  /data-income-impact-financial-security-value[^>]*>0 years 0 months/,
  "Missing critical facts should not render a clean confident 0 years 0 months value."
);
const partialTimelineHtml = harness.renderTimeline(partialFixture);
assert.match(partialTimelineHtml, /data-income-impact-runway-status="partial-estimate"/);
assert.match(partialTimelineHtml, /Partial runway estimate\. This preview is using the facts currently available\. Add the missing items below to improve the estimate\./);
assert.doesNotMatch(partialTimelineHtml, /Financial runway is not available until coverage, liquidity, obligations, annual household need, and survivor income facts are completed\./);

const unavailableFixture = {
  ...fixture,
  financialRunway: {
    status: "not-available",
    projectionPoints: [],
    warnings: [
      {
        code: "missing-annual-shortfall",
        message: "Years of Financial Security was not calculated because annual shortfall inputs are missing."
      }
    ],
    dataGaps: [
      {
        code: "missing-survivor-income",
        label: "Survivor income is missing."
      }
    ]
  },
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "Not available",
      status: "not-available"
    }
  ],
  timelineEvents: [],
  dataGaps: [
    {
      code: "missing-survivor-income",
      label: "Survivor income is missing."
    }
  ],
  warnings: [
    {
      code: "missing-annual-shortfall",
      message: "Years of Financial Security was not calculated because annual shortfall inputs are missing."
    }
  ]
};
const unavailableSecurityHtml = harness.renderFinancialSecurityCard(unavailableFixture);
assert.match(unavailableSecurityHtml, /Runway estimate unavailable/);
assert.match(unavailableSecurityHtml, /annual shortfall inputs are missing/);
const unavailableTimelineHtml = harness.renderTimeline(unavailableFixture);
assert.match(unavailableTimelineHtml, /data-income-impact-runway-status="not-available"/);
assert.match(unavailableTimelineHtml, /Runway estimate unavailable/);
assert.match(unavailableTimelineHtml, /annual shortfall inputs are missing/);
assert.doesNotMatch(unavailableTimelineHtml, /Financial runway is not available until coverage, liquidity, obligations, annual household need, and survivor income facts are completed\./);

const timelineHtml = harness.renderTimeline(fixture);
assert.match(timelineHtml, /Financial Runway if Death Occurs at Selected Age/);
assert.match(timelineHtml, /data-income-impact-financial-runway/);
assert.match(timelineHtml, /data-income-impact-runway-primary-visual/);
assert.match(timelineHtml, /data-income-impact-runway-snapshot/);
assert.match(timelineHtml, /Money available at death/);
assert.match(timelineHtml, /data-income-impact-runway-starting-total>\$600,000/);
assert.match(timelineHtml, /data-income-impact-runway-obligations-total>\$100,000/);
assert.match(timelineHtml, /data-income-impact-runway-annual-use>\$60,000/);
assert.match(
  timelineHtml,
  /<svg[^>]*data-income-impact-runway-svg[^>]*width="1040"[^>]*height="420"/,
  "Runway chart should render with explicit non-trivial SVG dimensions."
);
assert.match(timelineHtml, /data-income-impact-runway-line/);
assert.match(timelineHtml, /data-income-impact-runway-area/);
assert.match(timelineHtml, /data-income-impact-runway-point-year-index="0"/);
assert.match(timelineHtml, /data-income-impact-runway-point-year-index="10"/);
assert.match(timelineHtml, /data-income-impact-runway-point-status="depleted"/);
assert.match(timelineHtml, /data-income-impact-runway-depletion-date="2038-10-15"/);
assert.match(timelineHtml, /Money runs out/);
assert.match(timelineHtml, /data-income-impact-runway-year-marker/);
assert.match(timelineHtml, /Year 10/);
assert.match(timelineHtml, /Available after obligations: \$500,000/);
assert.match(timelineHtml, /Estimated depletion: 2038-10-15/);
assert.match(timelineHtml, /Supporting timeline events/);
assert.match(timelineHtml, /income-impact-supporting-events/);
assert.match(timelineHtml, /data-income-impact-timeline-event-type="coverageAvailable"/);
assert.doesNotMatch(timelineHtml, /data-income-impact-visual-event-group|data-income-impact-visual-event-type/);
assert.doesNotMatch(timelineHtml, /Built from helper events|calculateIncomeLossImpactTimeline|Selected scenario timeline/);
assert.match(securityHtml, /It does not change the LENS recommendation\./);

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Financial runway pass should not change methods, model builder, adapter, result pages, Step 3, or quick flows."
);

console.log("income-loss-impact-financial-runway-check passed");
