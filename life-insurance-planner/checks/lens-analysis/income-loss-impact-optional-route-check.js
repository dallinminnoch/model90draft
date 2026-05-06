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

function getMainContent(source, relativePath) {
  const match = source.match(/<main\b[\s\S]*?<\/main>/m);
  assert.ok(match, `Expected main content in ${relativePath}.`);
  return match[0];
}

function getScriptSources(source) {
  return Array.from(source.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g))
    .map(function (match) { return match[1]; });
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

function createIncomeImpactDisplayHarness(source) {
  const instrumentedSource = source.replace(
    /\n\}\)\(window\);\s*$/,
    "\n  window.__incomeImpactDisplayHarness = { renderFinancialSecurityCard, renderTimeline };\n})(window);\n"
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
  return sandbox.window.__incomeImpactDisplayHarness;
}

const profileHtml = readRepoFile("pages/profile.html");
const lensHtml = readRepoFile("pages/lens.html");
const analysisSetupHtml = readRepoFile("pages/analysis-setup.html");
const analysisSetupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const incomeLossHtml = readRepoFile("pages/income-loss-impact.html");
const incomeLossDisplaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const analysisEstimateHtml = readRepoFile("pages/analysis-estimate.html");
const lensWorkflowSource = readRepoFile("lens-workflow.js");
const appConfigSource = readRepoFile("app/core/config.js");
const workspaceSideNavSource = readRepoFile("workspace-side-nav.js");

const incomeLossMain = getMainContent(incomeLossHtml, "pages/income-loss-impact.html");
const incomeLossScriptSources = getScriptSources(incomeLossHtml);

assert.match(
  profileHtml,
  /<form\b[^>]*id="client-profile-form"[^>]*data-next-page="analysis-setup\.html"/,
  "Profile entry should continue to Analysis Setup."
);
assert.match(
  lensHtml,
  /The primary LENS path runs from linked profile entry to Analysis Setup, Income Impact Review, and then the LENS Result page\./,
  "Selector copy should describe the active Income Impact Review route."
);
assert.match(
  lensHtml,
  /DIME, Simple Needs, and Human Life Value remain standalone quick flows\./,
  "Selector copy should keep quick flows independent."
);
assert.doesNotMatch(
  lensHtml,
  /Income Loss Impact remains available as optional read-only review, not a required step\./,
  "Selector copy should no longer classify Income Loss Impact as optional."
);

assert.match(
  analysisSetupHtml,
  /data-analysis-setup-apply/,
  "Analysis Setup should own the apply/continue action."
);
assert.match(
  analysisSetupHtml,
  /Continue to Income Impact/,
  "Analysis Setup proceed copy should target Income Impact."
);
assert.equal(
  (analysisSetupSource.match(/window\.location\.href = getRouteWithCurrentQuery\(INCOME_LOSS_IMPACT_ROUTE\)/g) || []).length,
  2,
  "Analysis Setup should continue to Income Loss Impact in both no-linked-profile and saved-success paths."
);
assert.match(
  analysisSetupSource,
  /const INCOME_LOSS_IMPACT_ROUTE = "income-loss-impact\.html"/,
  "Analysis Setup should centralize the active Income Impact destination."
);
assert.match(
  analysisSetupSource,
  /function getRouteWithCurrentQuery\(path\)/,
  "Analysis Setup should preserve current query params when routing to Income Impact."
);
assert.doesNotMatch(
  analysisSetupSource,
  /window\.location\.href\s*=\s*"analysis-estimate\.html"/,
  "Analysis Setup should no longer continue directly to analysis-estimate.html."
);

assert.match(incomeLossHtml, /<body[^>]*data-step='income-impact'/);
assert.match(incomeLossHtml, /<h1>Income Loss Impact<\/h1>/);
assert.match(incomeLossHtml, /Step 3: Income Impact Review/);
assert.match(
  incomeLossHtml,
  /This preview uses linked profile and Protection Modeling facts to show what household finances may look like if death occurs at the selected age\/date\./
);
assert.match(
  incomeLossHtml,
  /It does not change the LENS recommendation\./
);
assert.match(
  incomeLossHtml,
  /<a\b[^>]*href="analysis-setup\.html"[^>]*data-income-impact-route-link[^>]*>Back to Assumptions<\/a>/,
  "Income Impact should link back to assumptions."
);
assert.match(
  incomeLossHtml,
  /<a\b[^>]*href="analysis-estimate\.html"[^>]*data-income-impact-route-link[^>]*>Continue to LENS Result<\/a>/,
  "Income Impact should link onward to the LENS result."
);
assert.match(
  incomeLossHtml,
  /income-impact-scenario-composer-calculations\.js[\s\S]*income-impact-risk-event-evaluator-calculations\.js[\s\S]*income-loss-impact-display\.js/,
  "Income Impact should load the composer and risk evaluator before the display module."
);
[
  /data-income-impact-scenario-banner/,
  /data-income-impact-scenario-toggle/,
  /data-income-impact-scenario-content/,
  /data-income-impact-projection-horizon/,
  /data-income-impact-projection-horizon-value/,
  /data-income-impact-mortgage-treatment/,
  /data-income-impact-death-age-control/,
  /data-income-impact-death-age-slider/,
  /data-income-impact-death-age-value/,
  /data-income-impact-death-date-value/,
  /data-income-impact-death-age-warning/,
  /Scenario Controls/,
  /Preview only\. These controls do not change the LENS recommendation\./
].forEach(function (pattern) {
  assert.match(incomeLossHtml, pattern, `Income Impact should expose scenario control ${pattern}.`);
});
[
  "../app/features/lens-analysis/analysis-methods.js",
  "../app/features/lens-analysis/analysis-settings-adapter.js",
  "../app/features/lens-analysis/inflation-projection-calculations.js",
  "../app/features/lens-analysis/education-funding-projection-calculations.js",
  "../app/features/lens-analysis/final-expense-inflation-calculations.js",
  "../app/features/lens-analysis/healthcare-expense-inflation-calculations.js"
].forEach(function (scriptPath) {
  assert.equal(
    incomeLossScriptSources.includes(scriptPath),
    false,
    `Income Impact should not load old Needs result script ${scriptPath}.`
  );
});
[
  "../app/features/lens-analysis/schema.js",
  "../app/features/lens-analysis/asset-taxonomy.js",
  "../app/features/lens-analysis/asset-library.js",
  "../app/features/lens-analysis/debt-taxonomy.js",
  "../app/features/lens-analysis/debt-library.js",
  "../app/features/lens-analysis/expense-taxonomy.js",
  "../app/features/lens-analysis/expense-library.js",
  "../app/features/lens-analysis/block-outputs.js",
  "../app/features/lens-analysis/helpers/income-tax-calculations.js",
  "../app/features/lens-analysis/helpers/housing-support-calculations.js",
  "../app/features/lens-analysis/blocks/existing-coverage.js",
  "../app/features/lens-analysis/blocks/offset-assets.js",
  "../app/features/lens-analysis/blocks/survivor-scenario.js",
  "../app/features/lens-analysis/blocks/tax-context.js",
  "../app/features/lens-analysis/blocks/income-net-income.js",
  "../app/features/lens-analysis/blocks/debt-payoff.js",
  "../app/features/lens-analysis/blocks/housing-ongoing-support.js",
  "../app/features/lens-analysis/blocks/non-housing-ongoing-support.js",
  "../app/features/lens-analysis/blocks/education-support.js",
  "../app/features/lens-analysis/blocks/final-expenses.js",
  "../app/features/lens-analysis/blocks/transition-needs.js",
  "../app/features/lens-analysis/normalize-lens-model.js",
  "../app/features/lens-analysis/asset-treatment-calculations.js",
  "../app/features/lens-analysis/asset-growth-projection-calculations.js",
  "../app/features/lens-analysis/cash-reserve-calculations.js",
  "../app/features/lens-analysis/lens-model-builder.js",
  "../app/features/lens-analysis/income-impact-warning-events-library.js",
  "../app/features/lens-analysis/household-wealth-projection-calculations.js",
  "../app/features/lens-analysis/household-death-event-availability-calculations.js",
  "../app/features/lens-analysis/household-survivor-runway-calculations.js",
  "../app/features/lens-analysis/income-impact-scenario-composer-calculations.js",
  "../app/features/lens-analysis/income-impact-caution-library.js",
  "../app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js",
  "../app/features/lens-analysis/income-loss-impact-timeline-calculations.js",
  "../app/features/lens-analysis/income-loss-impact-display.js"
].forEach(function (scriptPath) {
  assert.ok(
    incomeLossScriptSources.includes(scriptPath),
    `Income Impact should keep required model/display script ${scriptPath}.`
  );
});
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/normalize-lens-model.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/lens-model-builder.js"),
  "Income Impact should load the normalizer before the Lens model builder."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/lens-model-builder.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/household-wealth-projection-calculations.js"),
  "Income Impact should load the Lens model builder before Layer 1."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/asset-treatment-calculations.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/household-death-event-availability-calculations.js"),
  "Income Impact should load asset treatment before Layer 2."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/household-wealth-projection-calculations.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-scenario-composer-calculations.js"),
  "Income Impact should load Layer 1 before the composer."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/household-death-event-availability-calculations.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-scenario-composer-calculations.js"),
  "Income Impact should load Layer 2 before the composer."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/household-survivor-runway-calculations.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-scenario-composer-calculations.js"),
  "Income Impact should load Layer 3 before the composer."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-caution-library.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js"),
  "Income Impact should load the caution library before the risk evaluator."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-scenario-composer-calculations.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-loss-impact-display.js"),
  "Income Impact should load the composer before the display module."
);
assert.ok(
  incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-impact-risk-event-evaluator-calculations.js")
    < incomeLossScriptSources.indexOf("../app/features/lens-analysis/income-loss-impact-display.js"),
  "Income Impact should load the risk evaluator before the display module."
);
assert.doesNotMatch(incomeLossHtml, /Continue to Estimate Need/);
assert.doesNotMatch(incomeLossHtml, /Optional Review/);
assert.equal(
  (incomeLossHtml.match(/<input\b/gi) || []).length,
  2,
  "Income Loss Impact should contain only death-age and projection-horizon range inputs."
);
assert.match(
  incomeLossHtml,
  /<input\b[\s\S]*type="range"[\s\S]*data-income-impact-death-age-slider/,
  "Income Loss Impact should expose the death-age range slider."
);
assert.match(
  incomeLossHtml,
  /<input\b[\s\S]*type="range"[\s\S]*data-income-impact-projection-horizon/,
  "Income Loss Impact should expose the projection horizon range control."
);
assert.equal(
  (incomeLossHtml.match(/<select\b/gi) || []).length,
  1,
  "Income Loss Impact should contain only the mortgage treatment scenario select."
);
assert.match(
  incomeLossHtml,
  /<select\b[\s\S]*data-income-impact-mortgage-treatment[\s\S]*followAssumptions[\s\S]*payOffMortgage[\s\S]*continueMortgagePayments/,
  "Income Loss Impact should expose the three v1 mortgage treatment options."
);
assert.doesNotMatch(incomeLossHtml, /<textarea\b/i, "Income Loss Impact should not contain textarea controls.");
assert.doesNotMatch(incomeLossHtml, /<form\b/i, "Income Loss Impact should not contain forms.");
assert.doesNotMatch(
  incomeLossMain,
  /<button\b[^>]*type=["']submit["']/i,
  "Income Loss Impact main content should not contain submit controls."
);

assert.match(
  incomeLossDisplaySource,
  /function resolveLinkedProfileRecord\(/,
  "Income Loss Impact should resolve an existing linked profile."
);
assert.match(
  incomeLossDisplaySource,
  /getProtectionModelingPayload\(profileRecord\)/,
  "Income Loss Impact should read saved Protection Modeling data."
);
assert.match(
  incomeLossDisplaySource,
  /buildLensModelFromSavedProtectionModeling/,
  "Income Loss Impact should build normalized Lens model facts from saved Protection Modeling data."
);
assert.match(
  incomeLossDisplaySource,
  /composeIncomeImpactScenario/,
  "Income Impact display should call the clean scenario composer."
);
assert.match(
  incomeLossDisplaySource,
  /evaluateIncomeImpactRiskEvents/,
  "Income Impact display should call the Layer 4 risk evaluator."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /calculateIncomeLossImpactTimeline/,
  "Income Impact display should not call the retired timeline helper."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /evaluateIncomeImpactWarningEvents/,
  "Income Impact display should not call the legacy warning-event library."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /runNeedsAnalysis/,
  "Income Impact display should not use runNeedsAnalysis as its visible product source."
);
assert.doesNotMatch(
  incomeLossDisplaySource,
  /needsResult/,
  "Income Impact display should not render from Needs result compatibility data."
);
assert.match(
  incomeLossDisplaySource,
  /Years of Financial Security/,
  "Income Impact should render the advisor-facing financial security card."
);
assert.match(
  incomeLossDisplaySource,
  /data-income-impact-financial-security-card/,
  "Income Impact should expose a stable card selector for browser smoke."
);
assert.match(
  incomeLossDisplaySource,
  /data-income-impact-financial-security-value/,
  "Income Impact should expose a stable value selector for browser smoke."
);
assert.match(
  incomeLossDisplaySource,
  /function renderTimeline\(timelineResult\)/,
  "Income Impact should preserve the existing timeline renderer."
);
assert.match(
  incomeLossDisplaySource,
  /data-income-impact-visual-timeline/,
  "Income Impact should render the paused timeline region."
);
assert.match(
  incomeLossDisplaySource,
  /renderTimeline\(timelineResult\)[\s\S]*renderFinancialSecurityCard\(timelineResult\)[\s\S]*renderFinancialRunwayCards\(timelineResult\)/,
  "Income Impact should render the financial runway as the primary visual before summary cards."
);
assert.match(
  incomeLossDisplaySource,
  /data-income-impact-helper-summary-card="yearsOfFinancialSecurity"/,
  "Years of Financial Security should render from the composed scenario view model."
);
assert.match(
  incomeLossDisplaySource,
  /data-income-impact-helper-timeline-events/,
  "Income Impact timeline should render composer-derived supporting events."
);
assert.match(
  incomeLossDisplaySource,
  /data-income-impact-data-gaps/,
  "Income Impact should render helper data gaps safely."
);
assert.match(
  incomeLossDisplaySource,
  /Fact-based runway estimate from linked profile and Protection Modeling information\./,
  "Income Impact display copy should classify the page as fact-based and read-only."
);
assert.match(
  incomeLossDisplaySource,
  /Existing coverage \+ available assets, less immediate obligations, divided by estimated annual household shortfall\./,
  "Years of Financial Security should explain the fact-based runway estimate."
);
assert.match(
  incomeLossDisplaySource,
  /It does not change the LENS recommendation\./,
  "Income Impact display copy should be output-neutral."
);
assert.match(
  incomeLossDisplaySource,
  /function syncIncomeImpactWorkflowLinks\(\)/,
  "Income Impact should preserve current query params on Back and Continue links."
);
[
  /Temporary compatibility/,
  /Annual Income Lost/,
  /Survivor Income Available/,
  /Annual Support Gap/,
  /Support Duration/,
  /Income Replacement Bridge/,
  /Survivor Income Impact/,
  /support trace/i,
  /temporary LENS compatibility/i,
  /Placeholder visualization/,
  /placeholder-only/,
  /renderPlaceholderTimelineChart/,
  /data-income-impact-timeline-month/
].forEach(function (pattern) {
  assert.doesNotMatch(
    incomeLossDisplaySource,
    pattern,
    `Income Impact display should not expose old jargon: ${pattern}.`
  );
});
assert.doesNotMatch(
  incomeLossDisplaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/,
  "Income Loss Impact should not persist model data, assumptions, slider state, or saved profile state."
);

const displayHarness = createIncomeImpactDisplayHarness(incomeLossDisplaySource);
const helperDisplayFixture = {
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
    {
      type: "death",
      date: "2030-06-15",
      age: 50,
      label: "Selected death event"
    },
    {
      type: "incomeStops",
      date: "2030-06-15",
      age: 50,
      label: "Insured income stops",
      amount: 120000
    },
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
      code: "missing-client-dob",
      label: "Client date of birth is missing or invalid."
    }
  ],
  warnings: [
    {
      code: "missing-annual-shortfall",
      message: "Years of Financial Security was not calculated because annual shortfall inputs are missing."
    }
  ]
};
assert.match(
  displayHarness.renderFinancialSecurityCard(helperDisplayFixture),
  /8 years 4 months/,
  "Financial security card should render the helper summary display value."
);
assert.match(
  displayHarness.renderFinancialSecurityCard(helperDisplayFixture),
  /Existing coverage \+ available assets, less immediate obligations, divided by estimated annual household shortfall\./,
  "Financial security card should explain the runway formula."
);
const helperTimelineHtml = displayHarness.renderTimeline(helperDisplayFixture);
assert.match(
  helperTimelineHtml,
  /data-income-impact-visual-timeline/,
  "Timeline should expose a runway visual timeline."
);
assert.match(
  helperTimelineHtml,
  /data-income-impact-timeline-paused/,
  "Timeline should render the paused visualization state while the projection model is rebuilt."
);
assert.match(
  helperTimelineHtml,
  /Timeline visualization paused while the Income Impact projection model is being rebuilt/,
  "Paused visualization should explain why the chart is unavailable."
);
assert.doesNotMatch(helperTimelineHtml, /data-income-impact-financial-runway/);
assert.doesNotMatch(helperTimelineHtml, /data-income-impact-runway-primary-visual/);
assert.doesNotMatch(helperTimelineHtml, /data-income-impact-runway-snapshot/);
assert.doesNotMatch(helperTimelineHtml, /data-income-impact-runway-line/);
assert.doesNotMatch(helperTimelineHtml, /<svg\b|<path\b|<circle\b/);
assert.match(
  helperTimelineHtml,
  /data-income-impact-helper-timeline-events/,
  "Timeline should expose a helper event host."
);
assert.match(
  helperTimelineHtml,
  /data-income-impact-timeline-event-type="incomeStops"/,
  "Timeline should render helper event types."
);
assert.doesNotMatch(helperTimelineHtml, /data-income-impact-visual-event-type|data-income-impact-visual-event-group/);
assert.match(
  helperTimelineHtml,
  /data-income-impact-timeline-event-type="dataGap"/,
  "Timeline should render data-gap events visibly."
);
assert.doesNotMatch(
  helperTimelineHtml,
  /Placeholder visualization|placeholder-only|Built from helper events|calculateIncomeLossImpactTimeline/,
  "Timeline should not expose placeholder-only or developer-facing source copy."
);
assert.match(
  helperTimelineHtml,
  /Client date of birth is missing or invalid\./,
  "Timeline should render helper data gaps."
);

assert.match(
  lensWorkflowSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html" \}[\s\S]*?\{ id: "income-impact", label: "Income Impact Review", path: "income-loss-impact\.html" \}[\s\S]*?\{ id: "estimate", label: "LENS Result", path: "analysis-estimate\.html" \}/,
  "Workflow progress should include Income Impact Review between Analysis Setup and LENS Result."
);
assert.match(
  workspaceSideNavSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html", icon: "financial-snapshot" \}[\s\S]*?\{ id: "income-impact", label: "Income Impact Review", path: "income-loss-impact\.html", icon: "analysis" \}[\s\S]*?\{ id: "estimate", label: "LENS Result", path: "analysis-estimate\.html", icon: "needs-analysis" \}/,
  "Workspace side nav should expose Income Impact Review as an active LENS workflow step."
);
assert.match(
  appConfigSource,
  /\{ id: "analysis-setup", label: "Analysis Setup", path: "analysis-setup\.html" \}[\s\S]*?\{ id: "income-impact", label: "Income Impact Review", path: "income-loss-impact\.html" \}[\s\S]*?\{ id: "estimate", label: "LENS Result", path: "analysis-estimate\.html" \}/,
  "App config should include Income Impact Review in the primary LENS sequence."
);
assert.doesNotMatch(appConfigSource, /analysis-detail\.html/);
assert.doesNotMatch(lensWorkflowSource, /analysis-detail\.html/);
assert.doesNotMatch(
  workspaceSideNavSource,
  /\{ id: "detail", label: "Detailed Analysis", path: "analysis-detail\.html"/,
  "Workspace side nav should not expose Detailed Analysis as an active LENS workflow destination."
);

assert.match(analysisEstimateHtml, /<title>LENS Result \| Life Evaluation &amp; Needs Analysis<\/title>/);
assert.match(analysisEstimateHtml, /Step 4: LENS Result/);
assert.match(
  analysisEstimateHtml,
  /Review the final LENS result from the linked profile, Analysis Setup assumptions, and Income Impact Review before moving into recommendation design\./
);
assert.match(analysisEstimateHtml, /data-step-three-needs-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-dime-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /data-step-three-human-life-value-analysis/);
assert.doesNotMatch(analysisEstimateHtml, /DIME analysis will appear here/);
assert.doesNotMatch(analysisEstimateHtml, /Income value lens will appear here/);

const protectedChanges = getChangedFiles([
  "pages/profile.html",
  "pages/dime-entry.html",
  "pages/dime-results.html",
  "pages/simple-needs-entry.html",
  "pages/simple-needs-results.html",
  "pages/hlv-entry.html",
  "pages/hlv-results.html",
  "app/features/lens-analysis/analysis-methods.js",
  "app/features/lens-analysis/lens-model-builder.js",
  "app/features/lens-analysis/step-three-analysis-display.js",
  "app/features/lens-analysis/analysis-settings-adapter.js"
]);
assert.deepEqual(
  protectedChanges,
  [],
  "Income Impact active-route pass should not change profile routing, quick flows, methods, model builder, adapter, or Step 3 rendering."
);

console.log("income-loss-impact-optional-route-check passed: Income Loss Impact is active read-only workflow review between Analysis Setup and LENS Result.");
