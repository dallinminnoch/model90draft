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
    "\n  window.__incomeImpactRiskPanelHarness = { renderPivotalRiskPanel, renderIncomeImpact };\n})(window);\n"
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
  return sandbox.window.__incomeImpactRiskPanelHarness;
}

function assertInOrder(source, values, message) {
  let lastIndex = -1;
  values.forEach(function (value) {
    const index = source.indexOf(value);
    assert(index > lastIndex, message || `${value} should appear after the previous value.`);
    lastIndex = index;
  });
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const componentsSource = readRepoFile("components.css");
const pageSource = readRepoFile("pages/income-loss-impact.html");
const harness = createDisplayHarness(displaySource);

assert.equal(typeof harness.renderPivotalRiskPanel, "function");
assert.equal(typeof harness.renderIncomeImpact, "function");
assert.match(displaySource, /scenarioTimeline\.pivotalEvents/);
assert.match(displaySource, /renderPivotalRiskPanel/);
assert.match(displaySource, /renderPivotalRiskPanel\(timelineResult\)/);
assert.doesNotMatch(displaySource, /runNeedsAnalysis|needsResult/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Risk panel display should not persist scenario or model state."
);
assert.doesNotMatch(
  displaySource.match(/function renderPivotalRiskPanel[\s\S]*?function renderTimeline/)?.[0] || "",
  /financialRunway\.annualShortfall|financialRunway\.depletionDate|timelineEvents\./,
  "Risk panel renderer should display helper/library events, not duplicate risk calculations."
);
assert.match(componentsSource, /\.income-impact-risk-panel/);
assert.match(componentsSource, /\.income-impact-covered-panel/);
assert.match(componentsSource, /\.income-impact-layout/);
assert.match(
  componentsSource,
  /\.income-impact-layout[\s\S]*grid-template-columns:\s*minmax\(0, 2\.35fr\) minmax\(18rem, 0\.85fr\);/,
  "Desktop Income Impact layout should place the large timeline left and companion panel right."
);
assert.match(
  componentsSource,
  /@media \(max-width: 1180px\)[\s\S]*\.income-impact-layout[\s\S]*grid-template-columns: 1fr;/,
  "Tablet and smaller Income Impact layout should stack cleanly."
);
assert.doesNotMatch(pageSource, /data-income-impact-risk-panel/);

const fixture = {
  scenarioTimeline: {
    pivotalEvents: {
      risks: [
        {
          id: "resourcesDepleted",
          type: "resourcesDepleted",
          label: "Resources depleted",
          shortLabel: "Depleted",
          severity: "critical",
          date: "2038-10-15",
          age: 58,
          relativeMonthIndex: 100,
          lane: "resources",
          advisorCopy: "Available resources are projected to reach zero in this scenario.",
          amount: 0,
          sourcePaths: ["financialRunway.depletionDate"]
        },
        {
          id: "monthlyBudgetDeficitBegins",
          type: "monthlyBudgetDeficitBegins",
          label: "Household budget deficit begins",
          shortLabel: "Deficit begins",
          severity: "at-risk",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "income",
          advisorCopy: "Annual household need exceeds survivor income in this scenario.",
          amount: 60000,
          sourcePaths: ["financialRunway.annualShortfall"]
        },
        {
          id: "partialEstimateOnly",
          type: "partialEstimateOnly",
          label: "Partial estimate only",
          shortLabel: "Partial",
          severity: "caution",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "dataQuality",
          advisorCopy: "The estimate is using available facts and should be improved with the missing items.",
          dataGaps: [
            {
              code: "missing-assets-liquidity",
              label: "Available assets are missing."
            }
          ],
          sourcePaths: ["financialRunway.status", "dataGaps"]
        }
      ],
      stable: [
        {
          id: "deathEvent",
          type: "deathEvent",
          label: "Death scenario begins",
          shortLabel: "Death",
          severity: "stable",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "resources",
          advisorCopy: "The selected death date anchors the scenario timeline.",
          sourcePaths: ["selectedDeath.date"]
        },
        {
          id: "existingCoverageAvailable",
          type: "existingCoverageAvailable",
          label: "Existing coverage available",
          shortLabel: "Coverage",
          severity: "stable",
          date: "2030-06-15",
          relativeMonthIndex: 0,
          lane: "resources",
          advisorCopy: "Existing coverage is included in money available at death when present.",
          amount: 500000,
          sourcePaths: ["financialRunway.existingCoverage"]
        }
      ]
    }
  },
  financialRunway: {
    annualShortfall: 60000,
    depletionDate: "2038-10-15"
  },
  timelineEvents: [
    {
      type: "incomeStops",
      label: "Insured income stops"
    }
  ],
  dataGaps: []
};

const panelHtml = harness.renderPivotalRiskPanel(fixture);
assert.match(panelHtml, /data-income-impact-risk-panel/);
assert.match(panelHtml, /Key risks detected/);
assert.match(panelHtml, /available scenario facts/);
assert.doesNotMatch(panelHtml, /warning library|calculateIncomeLossImpactTimeline|pivotalEvents/);
assert.match(panelHtml, /data-income-impact-risk-list/);
assert.match(panelHtml, /data-income-impact-risk-severity="critical"/);
assert.match(panelHtml, /data-income-impact-risk-severity="at-risk"/);
assert.match(panelHtml, /data-income-impact-risk-severity="caution"/);
assert.match(panelHtml, /Critical/);
assert.match(panelHtml, /At Risk/);
assert.match(panelHtml, /Caution/);
assert.match(panelHtml, /Available resources are projected to reach zero in this scenario\./);
assert.match(panelHtml, /Annual household need exceeds survivor income in this scenario\./);
assert.match(panelHtml, /Available assets are missing\./);
assert.match(panelHtml, /\$60,000/);
assert.match(panelHtml, /2038-10-15 - Age 58/);
assertInOrder(panelHtml, ["Resources depleted", "Household budget deficit begins", "Partial estimate only"], "Risks should preserve helper/library severity order.");

const riskListHtml = panelHtml.match(/<div class="income-impact-risk-list"[\s\S]*?<\/div>\s*<details/)?.[0] || "";
assert.doesNotMatch(riskListHtml, /Death scenario begins|Existing coverage available/);
assert.match(panelHtml, /data-income-impact-covered-panel/);
assert.match(panelHtml, /<details class="income-impact-covered-panel" data-income-impact-covered-panel>/);
assert.doesNotMatch(panelHtml, /data-income-impact-covered-panel[^>]*open/);
assert.match(panelHtml, /What is covered/);
assert.match(panelHtml, /data-income-impact-covered-event/);
assert.match(panelHtml, /Existing coverage is included in money available at death when present\./);

const noRiskHtml = harness.renderPivotalRiskPanel({
  scenarioTimeline: {
    pivotalEvents: {
      risks: [],
      stable: []
    }
  },
  dataGaps: []
});
assert.match(noRiskHtml, /No major risks detected from the available facts\./);
assert.doesNotMatch(noRiskHtml, /data-income-impact-risk-list/);

const dataGapOnlyHtml = harness.renderPivotalRiskPanel({
  scenarioTimeline: {
    pivotalEvents: {
      risks: [],
      stable: []
    }
  },
  dataGaps: [
    {
      code: "missing-annual-essential-expenses",
      label: "Annual essential expenses are missing."
    }
  ]
});
assert.match(dataGapOnlyHtml, /No risk events are available yet because the preview is missing key facts\./);
assert.doesNotMatch(dataGapOnlyHtml, /No major risks detected from the available facts\./);

const runwayOnlyHtml = harness.renderPivotalRiskPanel({
  scenarioTimeline: {
    pivotalEvents: {
      risks: [],
      stable: []
    }
  },
  financialRunway: {
    annualShortfall: 90000,
    depletionDate: "2035-01-01"
  },
  timelineEvents: [
    {
      type: "incomeStops",
      label: "Insured income stops"
    }
  ],
  dataGaps: []
});
assert.doesNotMatch(runwayOnlyHtml, /Resources depleted|Insured income stops|Household budget deficit begins/);
assert.match(runwayOnlyHtml, /No major risks detected from the available facts\./);

const host = { innerHTML: "" };
harness.renderIncomeImpact(host, { timelineResult: fixture });
assert.match(host.innerHTML, /data-income-impact-layout/);
assert.match(host.innerHTML, /data-income-impact-layout-main/);
assert.match(host.innerHTML, /data-income-impact-layout-aside/);
assert.match(host.innerHTML, /data-income-impact-timeline-paused/);
assert.doesNotMatch(host.innerHTML, /data-income-impact-runway-svg|data-income-impact-runway-line|data-income-impact-timeline-marker/);
assert.ok(
  host.innerHTML.indexOf("data-income-impact-helper-timeline") < host.innerHTML.indexOf("data-income-impact-risk-panel"),
  "Timeline should render before the right-side companion panel in source order."
);
assert.match(host.innerHTML, /data-income-impact-risk-panel/);
assert.match(host.innerHTML, /Resources depleted/);
harness.renderIncomeImpact(host, {
  timelineResult: {
    scenarioTimeline: {
      pivotalEvents: {
        risks: [
          {
            type: "survivorIncomeDelayed",
            label: "Survivor income delay",
            severity: "caution",
            advisorCopy: "A survivor income delay can increase early cash-flow pressure."
          }
        ],
        stable: []
      }
    },
    financialRunway: {}
  }
});
assert.match(host.innerHTML, /Survivor income delay/);
assert.doesNotMatch(host.innerHTML, /Resources depleted/);

[
  "eviction",
  "family loses home",
  "kids cannot attend college",
  "financial ruin"
].forEach(function (recklessLabel) {
  assert.doesNotMatch(panelHtml, new RegExp(recklessLabel, "i"));
  assert.doesNotMatch(displaySource, new RegExp(recklessLabel, "i"));
});

const protectedChanges = getChangedFiles([
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/analysis-settings-adapter.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/income-impact-warning-events-library.js",
  "app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "pages/analysis-estimate.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "styles.css"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Risk panel pass should not change helpers, methods, model builder, adapter, result pages, Step 3, quick flows, or styles.css."
);

console.log("income-loss-impact-risk-panel-check passed");
