#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const displaySource = readRepoFile("app/features/lens-analysis/income-loss-impact-display.js");
const graphModelSource = readRepoFile("app/features/lens-analysis/income-impact-timeline-graph-model.js");
const componentsSource = readRepoFile("components.css");
const pageSource = readRepoFile("pages/income-loss-impact.html");

assert.match(graphModelSource, /axes:\s*\{/);
assert.match(graphModelSource, /zeroYRatio/);
assert.match(graphModelSource, /getValueExtent/);
assert.match(graphModelSource, /numericValues\.push\(0\)/);
assert.match(graphModelSource, /preDeathSeries\.points/);
assert.match(graphModelSource, /postDeathSeries\.points/);
assert.match(graphModelSource, /deathEvent\.assetsBeforeDeath/);
assert.match(graphModelSource, /deathEvent\.resourcesAfterObligations/);
assert.match(graphModelSource, /riskEvaluation\.events/);
assert.match(graphModelSource, /riskEvaluation\.stableEvents/);
assert.doesNotMatch(graphModelSource, /scenarioTimeline|financialRunway|income-loss-impact-timeline-calculations|household-financial-position|income-impact-warning-events-library/);
assert.doesNotMatch(graphModelSource, /localStorage|sessionStorage|document\.|querySelector/);
assert.doesNotMatch(graphModelSource, /height.*500000|500000.*height|RUNWAY_CHART_/i);

assert.match(displaySource, /renderGraphAxis/);
assert.match(displaySource, /data-income-impact-graph-zero-baseline/);
assert.match(displaySource, /renderGraphPath\(PRE_DEATH_ASSETS_PATH_ID/);
assert.match(displaySource, /pathId:\s*POST_DEATH_RESOURCES_PATH_ID/);
assert.match(displaySource, /function renderAppliedScenarioGraphPaths/);
assert.match(displaySource, /renderDeathEventConversionConnector/);
assert.match(displaySource, /data-income-impact-graph-marker-kind/);
assert.doesNotMatch(displaySource, /renderGraphPath\("deathTransition"/);
assert.doesNotMatch(displaySource, /renderFinancialRunwayChart|buildRunwayChartModel|data-income-impact-runway-svg/);
assert.doesNotMatch(displaySource, /calculateIncomeLossImpactTimeline|evaluateIncomeImpactWarningEvents|scenarioTimeline/);
assert.doesNotMatch(
  displaySource,
  /(?:localStorage|sessionStorage)\.setItem|updateClientRecord|updateClientRecordByCaseRef|saveAnalysisSetupSettings|saveJson\(/
);

assert.match(componentsSource, /\.income-impact-graph-svg/);
assert.match(componentsSource, /\.income-impact-graph-zero-baseline/);
assert.match(componentsSource, /\.income-impact-graph-path--preDeathAssets/);
assert.match(componentsSource, /\.income-impact-graph-path--postDeathResources/);
assert.match(componentsSource, /\.income-impact-graph-callouts/);
assert.match(componentsSource, /\.income-impact-death-conversion/);
assert.doesNotMatch(componentsSource, /\.income-impact-graph-path--deathTransition/);
assert.doesNotMatch(componentsSource, /\.income-impact-runway-svg|\.income-impact-runway-callout|\.income-impact-runway-phase-strip|\.income-impact-marker-lanes/);

assert.match(
  pageSource,
  /household-wealth-projection-calculations\.js[\s\S]*household-death-event-availability-calculations\.js[\s\S]*household-survivor-runway-calculations\.js[\s\S]*income-impact-scenario-composer-calculations\.js[\s\S]*income-impact-caution-library\.js[\s\S]*income-impact-risk-event-evaluator-calculations\.js[\s\S]*income-impact-timeline-graph-model\.js[\s\S]*income-loss-impact-display\.js/,
  "Income Impact should load layers, composer, risk evaluator, graph model, then display."
);
assert.doesNotMatch(pageSource, /income-impact-warning-events-library\.js|household-financial-position-calculations\.js|income-loss-impact-timeline-calculations\.js/);

console.log("income-loss-impact-chart-domain-check passed");
