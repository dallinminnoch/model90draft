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
    "\n  window.__incomeImpactVisualTimelineHarness = { renderFinancialSecurityCard, renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactVisualTimelineHarness;
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const pageSource = readRepoFile("pages/income-loss-impact.html");

assert.match(pageSource, /data-income-impact-death-age-slider/);
assert.match(displaySource, /data-income-impact-visual-timeline/);
assert.match(displaySource, /timelineEvents/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis/);
assert.doesNotMatch(displaySource, /needsResult/);
assert.doesNotMatch(displaySource, /Placeholder visualization|placeholder-only|renderPlaceholderTimelineChart|data-income-impact-timeline-month/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Impact visual timeline should not persist slider or model state."
);

const harness = createDisplayHarness(displaySource);
assert.equal(typeof harness.renderFinancialSecurityCard, "function");
assert.equal(typeof harness.renderTimeline, "function");

const fixture = {
  selectedDeath: {
    date: "2030-06-15",
    age: 50
  },
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "8 years 4 months",
      status: "complete"
    }
  ],
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
    projectionYears: 10,
    projectionPoints: [
      {
        yearIndex: 0,
        date: "2030-06-15",
        age: 50,
        startingBalance: 500000,
        annualShortfall: 60000,
        endingBalance: 500000,
        status: "starting"
      },
      {
        yearIndex: 1,
        date: "2031-06-15",
        age: 51,
        startingBalance: 500000,
        annualShortfall: 60000,
        endingBalance: 440000,
        status: "available"
      },
      {
        yearIndex: 9,
        date: "2039-06-15",
        age: 59,
        startingBalance: 20000,
        annualShortfall: 60000,
        endingBalance: -40000,
        status: "depleted"
      },
      {
        yearIndex: 10,
        date: "2040-06-15",
        age: 60,
        startingBalance: -40000,
        annualShortfall: 60000,
        endingBalance: -100000,
        status: "depleted"
      }
    ],
    warnings: [],
    dataGaps: []
  },
  timelineEvents: [
    { type: "death", date: "2030-06-15", age: 50, label: "Selected death event" },
    { type: "incomeStops", date: "2030-06-15", age: 50, label: "Insured income stops", amount: 120000 },
    { type: "survivorIncomeContinues", date: "2030-09-15", age: 50, label: "Survivor income begins after 3 months", amount: 45000 },
    { type: "coverageAvailable", date: "2030-06-15", age: 50, label: "Existing coverage available", amount: 500000 },
    { type: "finalExpensesDue", date: "2030-06-15", age: 50, label: "Final expenses due", amount: 25000 },
    { type: "debtObligation", date: "2030-06-15", age: 50, label: "Debt obligations", amount: 60000 },
    { type: "mortgageObligation", date: "2030-06-15", age: 50, label: "Mortgage obligation", amount: 250000 },
    { type: "householdExpenseRunway", date: "2030-06-15", age: 50, label: "Annual household shortfall", amount: 45000 },
    { type: "liquidityCheckpoint", date: "2030-06-15", age: 50, label: "Available coverage and liquidity", amount: 540000 },
    { type: "dependentMilestone", date: "2033-09-01", label: "Dependent reaches age 18" },
    { type: "educationWindow", date: "2033-09-01", label: "Education funding window", amount: 80000 },
    { type: "supportNeedEnds", date: "2038-10-15", age: 58, label: "Estimated support runway ends" },
    {
      type: "dataGap",
      label: "Dependent date is missing",
      warnings: [
        {
          code: "missing-dependent-dob",
          message: "Dependent date of birth is missing."
        }
      ]
    }
  ],
  dataGaps: [
    {
      code: "missing-dependent-dob",
      label: "Dependent date of birth is missing."
    }
  ],
  warnings: []
};

const cardHtml = harness.renderFinancialSecurityCard(fixture);
assert.match(cardHtml, /Years of Financial Security/);
assert.match(cardHtml, /8 years 4 months/);
assert.match(cardHtml, /Fact-based runway estimate/);
assert.match(cardHtml, /Existing coverage \+ available assets, less immediate obligations, divided by estimated annual household shortfall\./);
assert.doesNotMatch(cardHtml, /final coverage recommendation|fully protected/i);

const unavailableCardHtml = harness.renderFinancialSecurityCard({
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "Not available",
      status: "not-available"
    }
  ],
  warnings: [
    {
      code: "missing-annual-shortfall",
      message: "Years of Financial Security was not calculated because annual shortfall inputs are missing."
    }
  ],
  dataGaps: []
});
assert.match(unavailableCardHtml, /Years of Financial Security was not calculated because annual shortfall inputs are missing\./);

const partialCardHtml = harness.renderFinancialSecurityCard({
  summaryCards: [
    {
      id: "yearsOfFinancialSecurity",
      displayValue: "Partial runway estimate",
      status: "partial-estimate"
    }
  ],
  financialRunway: {
    status: "partial-estimate",
    yearsOfSecurity: 0,
    monthsOfSecurity: 0,
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
  }
});
assert.match(partialCardHtml, /Partial runway estimate/);
assert.match(partialCardHtml, /This preview is using the facts currently available\./);
assert.match(partialCardHtml, /Current estimate: 0 years 0 months/);
assert.doesNotMatch(
  partialCardHtml,
  /data-income-impact-financial-security-value[^>]*>0 years 0 months/,
  "Partial states should not show a clean 0 years 0 months as the primary value."
);

const timelineHtml = harness.renderTimeline(fixture);
assert.match(timelineHtml, /data-income-impact-visual-timeline/);
assert.match(timelineHtml, /data-income-impact-financial-runway/);
assert.match(timelineHtml, /data-income-impact-runway-primary-visual/);
assert.match(timelineHtml, /Financial Runway if Death Occurs at Selected Age/);
assert.match(timelineHtml, /data-income-impact-runway-snapshot/);
assert.match(timelineHtml, /Money available at death/);
assert.match(timelineHtml, /data-income-impact-runway-line/);
assert.match(timelineHtml, /data-income-impact-runway-point/);
assert.match(timelineHtml, /data-income-impact-runway-area/);
assert.match(timelineHtml, /data-income-impact-runway-year-marker/);
assert.match(timelineHtml, /data-income-impact-runway-depletion-date="2038-10-15"/);
assert.match(timelineHtml, /Available after obligations: \$500,000/);
assert.doesNotMatch(timelineHtml, /Placeholder visualization|placeholder-only/);
assert.doesNotMatch(timelineHtml, /Built from helper events|calculateIncomeLossImpactTimeline|Selected scenario timeline/);
assert.match(
  timelineHtml,
  /Timeline updates as you adjust the selected death age\./,
  "Runway timeline should use advisor-facing update copy."
);
assert.doesNotMatch(timelineHtml, /data-income-impact-visual-event-group|data-income-impact-visual-event-type/);

[
  "death",
  "incomeStops",
  "coverageAvailable",
  "finalExpensesDue",
  "debtObligation",
  "mortgageObligation",
  "householdExpenseRunway",
  "liquidityCheckpoint",
  "dependentMilestone",
  "educationWindow",
  "supportNeedEnds",
  "dataGap"
].forEach(function (type) {
  assert.match(
    timelineHtml,
    new RegExp(`data-income-impact-timeline-event-type="${type}"`),
    `Supporting event list should render ${type}.`
  );
});
assert.match(timelineHtml, /Dependent date of birth is missing\./);
assert.match(timelineHtml, /\$120,000/);
assert.match(timelineHtml, /\$500,000/);
assert.match(timelineHtml, /Timeline updates as you adjust the selected death age\./);
assert.match(timelineHtml, /This preview does not change the LENS recommendation\./);

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
  "Visual timeline pass should not change methods, model builder, adapter, result pages, Step 3, or quick flows."
);

console.log("income-loss-impact-visual-timeline-check passed");
