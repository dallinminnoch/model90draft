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

function indexOfRequired(source, needle, label) {
  const index = source.indexOf(needle);
  assert.ok(index >= 0, `${label} should include ${needle}.`);
  return index;
}

const pageSource = readRepoFile("pages/coverage-strategy.html");
const controllerSource = readRepoFile("app/features/lens-analysis/coverage-strategy-page.js");
const adapterSource = readRepoFile("app/features/lens-analysis/coverage-timeline-existing-coverage-adapter.js");
const coverageUtilsSource = readRepoFile("app/features/coverage/coverage-policy-utils.js");
const componentsSource = readRepoFile("components.css");
const stylesSource = readRepoFile("styles.css");

assert.match(pageSource, /coverage-timeline-existing-coverage-adapter\.js/);
assert.ok(
  indexOfRequired(pageSource, "coverage-policy-utils.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-timeline-existing-coverage-adapter.js", "Coverage Strategy page"),
  "Coverage policy utilities should load before the existing coverage adapter."
);
assert.ok(
  indexOfRequired(pageSource, "coverage-timeline-existing-coverage-adapter.js", "Coverage Strategy page")
    < indexOfRequired(pageSource, "coverage-strategy-page.js", "Coverage Strategy page"),
  "Existing coverage adapter should load before the page controller."
);
assert.doesNotMatch(pageSource, /coverage-timeline-engine\.js/);

assert.match(controllerSource, /buildExistingCoverageTimelineLayers/);
assert.match(controllerSource, /getCoveragePolicies\(profileRecord\)/);
assert.match(controllerSource, /source: "profileRecord\.coveragePolicies"/);
assert.match(controllerSource, /existingCoverageLine/);
assert.match(controllerSource, /existingCoveragePoints/);
assert.match(controllerSource, /coverage-need-timeline-existing-coverage-line/);
assert.match(controllerSource, /coverage-need-timeline-legend-existing-coverage/);
assert.match(controllerSource, /Existing coverage/);
assert.match(controllerSource, /Current existing coverage/);
assert.match(controllerSource, /Final existing coverage/);
assert.match(controllerSource, /\(existingCoverageAmount \/ needAmount\) \* 100/);
assert.match(controllerSource, /formatCurrency\(firstExistingCoveragePoint\?\.existingCoverageAmount \|\| 0\)/);
assert.match(controllerSource, /formatCurrency\(lastExistingCoveragePoint\?\.existingCoverageAmount \|\| 0\)/);
assert.doesNotMatch(controllerSource, /needAmount\s*[-+]=?\s*existingCoverageAmount/);
assert.doesNotMatch(controllerSource, /resourceAmount\s*[-+]=?\s*existingCoverageAmount/);
assert.doesNotMatch(controllerSource, /coverageGap|gap\/surplus|surplusCoverage|proposed coverage|recommendation score/i);
assert.doesNotMatch(controllerSource, /querySelector\(["']\.analysis-result-value/);
assert.doesNotMatch(controllerSource, /samplePolicy|placeholder policy|fake policy|demoPolicy/i);
assert.doesNotMatch(controllerSource, /recommendations\.html|planner\.html/);

assert.match(componentsSource, /coverage-need-timeline-existing-coverage-line/);
assert.match(componentsSource, /coverage-need-timeline-existing-coverage-point/);
assert.match(componentsSource, /coverage-need-timeline-legend-existing-coverage/);
assert.doesNotMatch(stylesSource, /coverage-need-timeline-existing-coverage/i);

const context = {
  console,
  LensApp: {
    coverage: {},
    lensAnalysis: {}
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(coverageUtilsSource, context, { filename: "coverage-policy-utils.js" });
vm.runInContext(adapterSource, context, { filename: "coverage-timeline-existing-coverage-adapter.js" });

const buildExistingCoverageTimelineLayers = context.LensApp.lensAnalysis.buildExistingCoverageTimelineLayers;
assert.equal(typeof buildExistingCoverageTimelineLayers, "function");

const noCoverage = buildExistingCoverageTimelineLayers({
  valuationDate: "2026-01-01",
  clientDateOfBirth: "1986-01-01",
  coveragePolicies: []
});
assert.equal(Array.isArray(noCoverage.layers), true, "No coverage should still return a layers array.");
assert.equal(noCoverage.layers.length, 0, "No coverage should produce no layers without fake policies.");
assert.equal(noCoverage.trace.inputPolicyCount, 0);
assert.equal(noCoverage.trace.includedLayerCount, 0);

const activeCoverage = buildExistingCoverageTimelineLayers({
  valuationDate: "2026-01-01",
  clientDateOfBirth: "1986-01-01",
  coveragePolicies: [
    {
      id: "existing-term",
      policyType: "Term Life",
      faceAmount: "500000",
      effectiveDate: "2020-01-01",
      termLength: "20",
      status: "Active"
    }
  ]
});
assert.equal(activeCoverage.layers.length, 1);
assert.equal(activeCoverage.layers[0].source, "existing");
assert.equal(activeCoverage.layers[0].deathBenefit, 500000);
assert.equal(activeCoverage.layers[0].included, true);

console.log("coverage strategy existing coverage timeline check passed");
