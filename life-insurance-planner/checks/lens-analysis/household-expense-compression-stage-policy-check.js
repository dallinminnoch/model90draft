#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const stagePolicyPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "household-expense-compression-stage-policy.js"
);
const stagePolicySource = fs.readFileSync(stagePolicyPath, "utf8");
const context = {
  LensApp: {
    lensAnalysis: {}
  },
  console
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(stagePolicySource, context, { filename: stagePolicyPath });

const stagePolicy = context.LensApp.lensAnalysis.householdExpenseCompressionStagePolicy;
assert.ok(stagePolicy, "household expense compression stage policy should load");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

[
  "HOUSEHOLD_EXPENSE_COMPRESSION_STAGE_POLICY_VERSION",
  "STAGED_COMPRESSION_STAGE_TYPES",
  "STAGED_COMPRESSION_TRIGGER_MODES",
  "householdExpenseCompressionStagePolicyRules",
  "getHouseholdExpenseCompressionStagePolicyRules",
  "getHouseholdExpenseCompressionStagePolicyById"
].forEach(function (key) {
  assert.ok(Object.prototype.hasOwnProperty.call(stagePolicy, key), `${key} export should exist`);
});

assert.equal(stagePolicy.HOUSEHOLD_EXPENSE_COMPRESSION_STAGE_POLICY_VERSION, 1);
assert.equal(stagePolicy.STAGED_COMPRESSION_STAGE_TYPES.REDUCTION, "reduction");
assert.equal(stagePolicy.STAGED_COMPRESSION_STAGE_TYPES.PAUSE, "pause");
assert.equal(stagePolicy.STAGED_COMPRESSION_STAGE_TYPES.INTERVENTION_WINDOW, "interventionWindow");
assert.equal(stagePolicy.STAGED_COMPRESSION_TRIGGER_MODES.FIXED_MONTH_V1, "fixedMonthV1");
assert.equal(typeof stagePolicy.getHouseholdExpenseCompressionStagePolicyRules, "function");
assert.equal(typeof stagePolicy.getHouseholdExpenseCompressionStagePolicyById, "function");

const rules = stagePolicy.getHouseholdExpenseCompressionStagePolicyRules();
assert.equal(rules.length, 7, "V1 stage policy should include seven deterministic stages");
assert.equal(new Set(rules.map((rule) => rule.stageId)).size, rules.length, "stage ids should be unique");
assert.deepEqual(
  cloneJson(rules.map((rule) => rule.stageOrder)),
  [1, 2, 3, 4, 5, 6, 7],
  "stage orders should be deterministic"
);

const byId = function (stageId) {
  const rule = stagePolicy.getHouseholdExpenseCompressionStagePolicyById(stageId);
  assert.ok(rule, `${stageId} should exist`);
  return rule;
};

function assertStage(stageId, expected) {
  const stage = byId(stageId);
  assert.equal(stage.effectiveMonthAfterDeath, expected.month, `${stageId} fixed month`);
  assert.equal(stage.triggerMode, "fixedMonthV1", `${stageId} should use fixed V1 timing`);
  assert.equal(stage.stageType, expected.stageType, `${stageId} stage type`);
  assert.deepEqual(cloneJson(stage.decisionsAllowed), expected.decisionsAllowed, `${stageId} decisions`);
  assert.deepEqual(cloneJson(stage.compressionOrderGroups), expected.groups, `${stageId} groups`);
  assert.equal(stage.appliesMath, expected.appliesMath, `${stageId} applies math`);
  assert.equal(stage.markerOnly, expected.markerOnly, `${stageId} marker only`);
  assert.equal(stage.actionOrder, "policyOrderRank", `${stageId} action order`);
  assert.equal(stage.advisorEditableLater, true, `${stageId} should be advisor-editable later`);
}

assertStage("immediate-discretionary-compression", {
  month: 1,
  stageType: "reduction",
  decisionsAllowed: ["YES"],
  groups: ["earlyDiscretionary", "travelLifestyle", "foodLifestyleBeforeGroceries"],
  appliesMath: true,
  markerOnly: false
});
assertStage("contribution-pauses", {
  month: 2,
  stageType: "pause",
  decisionsAllowed: ["PAUSE"],
  groups: ["pauseContributions"],
  appliesMath: true,
  markerOnly: false
});
assertStage("flexible-lifestyle-services", {
  month: 3,
  stageType: "reduction",
  decisionsAllowed: ["YES"],
  groups: ["flexibleLifestyleServices"],
  appliesMath: true,
  markerOnly: false
});
assertStage("flexible-essentials-compression", {
  month: 6,
  stageType: "reduction",
  decisionsAllowed: ["YES"],
  groups: ["flexibleEssentials"],
  appliesMath: true,
  markerOnly: false
});
assertStage("groceries-protected-flexible-compression", {
  month: 9,
  stageType: "reduction",
  decisionsAllowed: ["YES"],
  groups: ["groceriesAndProtectedFlexibleEssentials"],
  appliesMath: true,
  markerOnly: false
});
assert.ok(
  byId("groceries-protected-flexible-compression").notes.includes("one-tier")
    && byId("groceries-protected-flexible-compression").notes.includes("floor-protected"),
  "groceries stage should state one-tier/floor-protected policy"
);
assertStage("transportation-utilities-pets-financial-leakage", {
  month: 12,
  stageType: "reduction",
  decisionsAllowed: ["YES"],
  groups: ["transportationFlex", "utilitiesBasicServices", "pets", "financialLeakage"],
  appliesMath: true,
  markerOnly: false
});
assertStage("intervention-window-candidates", {
  month: 12,
  stageType: "interventionWindow",
  decisionsAllowed: ["INTERVENTION"],
  groups: [
    "healthcareProtected",
    "childcareAndDependentSupport",
    "education",
    "valuesSensitiveGiving",
    "protectionInsurance",
    "taxesAndLegal",
    "debtObligations",
    "businessIncomePreserving",
    "housingProtected",
    "majorInterventions"
  ],
  appliesMath: false,
  markerOnly: true
});

rules.forEach(function (rule) {
  assert.ok(rule.stageId, "stage should have id");
  assert.ok(rule.stageName, `${rule.stageId} should have display name`);
  assert.ok(Number.isInteger(rule.stageOrder), `${rule.stageId} should have integer order`);
  assert.ok(Number.isInteger(rule.effectiveMonthAfterDeath), `${rule.stageId} should have integer month`);
  assert.equal(rule.triggerMode, "fixedMonthV1", `${rule.stageId} should use fixed V1 trigger`);
  assert.ok(Array.isArray(rule.decisionsAllowed) && rule.decisionsAllowed.length, `${rule.stageId} decisions`);
  assert.ok(Array.isArray(rule.compressionOrderGroups) && rule.compressionOrderGroups.length, `${rule.stageId} groups`);
  assert.equal(typeof rule.appliesMath, "boolean", `${rule.stageId} appliesMath boolean`);
  assert.equal(typeof rule.markerOnly, "boolean", `${rule.stageId} markerOnly boolean`);
  assert.notEqual(rule.appliesMath, rule.markerOnly, `${rule.stageId} should have one owner: math or marker`);
});

const clonedRules = stagePolicy.getHouseholdExpenseCompressionStagePolicyRules();
clonedRules[0].stageId = "broken";
clonedRules[0].compressionOrderGroups.push("broken");
assert.equal(stagePolicy.getHouseholdExpenseCompressionStagePolicyRules()[0].stageId, "immediate-discretionary-compression", "rules accessor should return clones");
assert.equal(stagePolicy.getHouseholdExpenseCompressionStagePolicyRules()[0].compressionOrderGroups.includes("broken"), false, "nested arrays should be cloned");
const clonedById = stagePolicy.getHouseholdExpenseCompressionStagePolicyById("contribution-pauses");
clonedById.decisionsAllowed.push("BROKEN");
assert.deepEqual(cloneJson(stagePolicy.getHouseholdExpenseCompressionStagePolicyById("contribution-pauses").decisionsAllowed), ["PAUSE"], "by-id accessor should return clone");
assert.equal(stagePolicy.getHouseholdExpenseCompressionStagePolicyById("missing-stage"), null, "unknown stage id should return null");

[
  /\bAI\b|\bOpenAI\b|\bmodel\b/i,
  /\blocalStorage\b|\bsessionStorage\b|\bdocument\b|\bquerySelector\b|\baddEventListener\b|\bfetch\b/,
  /\brequire\s*\(|\bimport\b/,
  /income-impact-triage-intervention-calculations|income-loss-impact-display|income-impact-timeline-graph-model|income-impact-scenario-composer-calculations|normalize-lens-model|household-survivor-runway-calculations/
].forEach(function (pattern) {
  assert.equal(pattern.test(stagePolicySource), false, `stage policy source should not include ${pattern}`);
});

console.log("household-expense-compression-stage-policy-check passed");
