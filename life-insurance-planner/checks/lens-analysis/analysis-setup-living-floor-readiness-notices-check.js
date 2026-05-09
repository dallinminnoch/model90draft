#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const accountId = "temporary-local-household-expense-policy-account-v1";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function getSection(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.ok(startIndex >= 0, `${startNeedle} should exist`);
  const endIndex = endNeedle ? source.indexOf(endNeedle, startIndex + startNeedle.length) : -1;
  return source.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

function getChangedFiles() {
  return childProcess.execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .map(function (line) { return line.trim().replace(/^[A-Z? ]+\s+/, ""); })
    .filter(Boolean);
}

function createContext() {
  const context = {
    console,
    window: null,
    URLSearchParams,
    Date
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {
    lensAnalysis: {},
    accountSettings: {}
  };
  context.location = {
    search: ""
  };
  context.document = {
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        textContent: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        replaceChildren() {
          this.children = [];
        },
        querySelector() {
          return null;
        }
      };
    }
  };
  context.localStorage = {
    getItem() {
      throw new Error("test must pass explicit storage for readiness model");
    }
  };
  vm.createContext(context);
  return context;
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function loadContext() {
  const context = createContext();
  [
    "app/features/account-settings/household-expense-account-policy-storage.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/analysis-setup.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage(initialValues) {
  const store = Object.assign({}, initialValues || {});
  const reads = [];
  const writes = [];
  return {
    reads,
    writes,
    getItem(key) {
      reads.push(key);
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      writes.push({ key, value });
      store[key] = value;
    },
    removeItem(key) {
      writes.push({ key, value: null });
      delete store[key];
    }
  };
}

function createLivingFloorAssumptions(overrides) {
  const assumptions = {
    version: 1,
    foodAtHome: {
      planningBucketKey: "foodAtHomeConsumables",
      source: "ADMIN_ENTERED",
      sourcePeriod: "2026",
      monthlyAmountsByBand: {
        infantToddler: 100,
        youngChild: 200,
        olderChild: 210,
        teenMale: 300,
        teenFemale: 280,
        adultMale: 300,
        adultFemale: 250,
        adultUnknown: 275,
        childUnknown: 190
      },
      householdSizeAdjustmentFactors: {
        "1": 1.1,
        "2": 1.05,
        "3": 1,
        "4": 0.95,
        "5": 0.9,
        "6Plus": 0.85
      }
    },
    stateCostAdjustmentMultipliers: {
      version: 1,
      appliesToAdjustmentClass: "moneyFloorAdjusted",
      defaultMultiplier: 1.1,
      globalStateAdjustmentMultipliersByState: {
        CO: { multiplier: 1.2, source: "ADMIN_ENTERED", sourcePeriod: "2026", notes: "Colorado" }
      },
      bucketStateAdjustmentMultipliers: {}
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 100,
        monthlyPerMemberAmount: 25,
        stateAdjustmentEnabled: true,
        notes: "Household supplies"
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 80,
        monthlyPerMemberAmount: 10,
        stateAdjustmentEnabled: true,
        notes: "Connectivity"
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 150,
        monthlyPerAdultDriverAmount: 50,
        stateAdjustmentEnabled: true,
        notes: "Basic transportation"
      }
    }
  };

  return Object.assign(assumptions, overrides || {});
}

function createSavedEnvelope(livingFloorAssumptions) {
  return JSON.stringify({
    version: 1,
    policyType: "householdExpensePolicy",
    accountId,
    accountPolicy: {
      version: 1,
      lifestyleRangeOverrides: [],
      compressionThresholdOverrides: [],
      compressionPolicyOverrides: [],
      guardrails: {},
      livingFloorAssumptions,
      metadata: {
        accountId,
        source: "readiness-ui-check"
      }
    },
    metadata: {
      accountId,
      source: "readiness-ui-check"
    }
  });
}

function createStorageForAssumptions(context, livingFloorAssumptions) {
  const storageApi = context.LensApp.accountSettings.householdExpenseAccountPolicyStorage;
  const key = storageApi.createHouseholdExpenseAccountPolicyStorageKey(accountId);
  return createMemoryStorage({
    [key]: createSavedEnvelope(livingFloorAssumptions)
  });
}

function createLinkedRecord(overrides) {
  return Object.assign({
    id: "client-1",
    caseRef: "CASE-1",
    displayName: "Client One",
    state: "CO",
    stateOfResidence: "CO",
    maritalStatus: "Married",
    spouseDateOfBirth: "1986-06-15",
    spouseGender: "female",
    adultDriverCount: 1,
    dependentDetails: [
      { id: "infant", dateOfBirth: "2023-07-01" },
      { id: "older", age: 10 }
    ],
    analysisSettings: {
      valuationDate: "2026-01-01"
    }
  }, overrides || {});
}

function buildModel(context, record, storage) {
  return context.LensApp.analysisSetup.buildHouseholdExpenseLivingFloorReadinessNoticeModel(record, {
    accountId,
    storage
  });
}

function noticeCodes(model) {
  return model.notices.map(function (notice) {
    return notice.code;
  });
}

function assertHasNotice(model, code) {
  assert.ok(noticeCodes(model).includes(code), `expected readiness notice ${code}`);
}

function assertNoNotice(model, code) {
  assert.equal(noticeCodes(model).includes(code), false, `did not expect readiness notice ${code}`);
}

const html = readRepoFile("pages/analysis-setup.html");
const setupSource = readRepoFile("app/features/lens-analysis/analysis-setup.js");
const entryActions = getSection(html, '<div class="analysis-setup-entry-actions">', '</div>');
const entryMain = getSection(html, '<div class="analysis-setup-entry-main">', '<div class="analysis-setup-entry-summary"');
const readinessHost = getSection(entryMain, 'data-analysis-living-floor-readiness', '</div>\r\n          </div>');

assert.match(entryActions, /data-lens-result-proceed/);
assert.match(entryActions, /Continue to Income Impact/);
assert.match(entryMain, /data-analysis-living-floor-readiness/);
assert.ok(
  entryMain.indexOf("data-analysis-setup-apply") < entryMain.indexOf("data-analysis-living-floor-readiness"),
  "living-floor readiness host should appear under the Continue to Income Impact action area"
);
assert.match(entryMain, /Income Impact readiness notes/);
assert.doesNotMatch(readinessHost, /<input\b|<select\b|<button\b/, "readiness host should not add editable controls");

[
  "../app/features/account-settings/household-expense-account-policy-storage.js",
  "../app/features/lens-analysis/household-expense-living-floor-metadata.js",
  "../app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
  "../app/features/lens-analysis/household-expense-living-floor-calculations.js",
  "../app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
  "../app/features/lens-analysis/analysis-setup.js"
].reduce(function (previousIndex, scriptPath) {
  const scriptIndex = html.indexOf(`<script src="${scriptPath}"></script>`);
  assert.ok(scriptIndex > previousIndex, `${scriptPath} should load in dependency order before Analysis Setup`);
  return scriptIndex;
}, -1);

assert.match(setupSource, /data-analysis-living-floor-readiness/);
assert.match(setupSource, /loadHouseholdExpenseAccountPolicy/);
assert.match(setupSource, /resolveHouseholdExpenseLivingFloorContext/);
assert.match(setupSource, /calculateHouseholdExpenseLivingFloors/);
assert.match(setupSource, /buildHouseholdExpenseLivingFloorReadinessWarnings/);
assert.match(setupSource, /renderLivingFloorReadinessNotices\(livingFloorReadinessHost, linkedRecord\)/);

const readinessSection = getSection(setupSource, "function createLivingFloorReadinessNotice", "function normalizeRateValue");
assert.doesNotMatch(readinessSection, /saveHouseholdExpenseAccountPolicy/);
assert.doesNotMatch(readinessSection, /saveAnalysisSetupSettings/);
assert.doesNotMatch(readinessSection, /updateClientRecordByCaseRef/);
assert.doesNotMatch(readinessSection, /window\.location\.href/);

const changedFiles = getChangedFiles();
[
  "app/features/lens-analysis/income-loss-impact-display.js",
  "app/features/lens-analysis/income-impact-timeline-graph-model.js",
  "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
  "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
  "app/features/lens-analysis/household-expense-compression-policy.js",
  "app/features/lens-analysis/expense-compression-thresholds.js",
  "app/features/lens-analysis/normalize-lens-model.js",
  "app/features/lens-analysis/pmi-expense-records.js",
  "app/features/account-settings/household-expense-account-policy-storage.js",
  "app/features/account-settings/household-expense-account-policy-admin-display.js",
  "app/features/account-settings/household-expense-account-policy-admin-editor.js",
  "styles.css",
  "layout.css",
  "components.css",
  "app.js"
].forEach(function (relativePath) {
  assert.equal(changedFiles.includes(relativePath), false, `${relativePath} should not change in readiness notice display pass`);
});

const context = loadContext();
const completeStorage = createStorageForAssumptions(context, createLivingFloorAssumptions());
const readyModel = buildModel(context, createLinkedRecord(), completeStorage);
assertHasNotice(readyModel, "livingFloorAssumptionsReady");
assertNoNotice(readyModel, "foodAtHomeBandValuesMissing");
assert.equal(readyModel.status.tone, "info", "complete saved assumptions should produce ready/info status");
assert.equal(completeStorage.writes.length, 0, "building readiness model should not write storage");
assert.ok(completeStorage.reads.length > 0, "building readiness model should read saved account policy");
assert.equal(readyModel.metadata.activeRuntimeConsumer, false, "readiness display model should remain inactive");

const missingStorage = createStorageForAssumptions(context, createLivingFloorAssumptions({
  foodAtHome: {
    planningBucketKey: "foodAtHomeConsumables",
    source: "ADMIN_ENTERED",
    sourcePeriod: null,
    monthlyAmountsByBand: {},
    householdSizeAdjustmentFactors: {}
  }
}));
const missingModel = buildModel(context, createLinkedRecord(), missingStorage);
assertHasNotice(missingModel, "foodAtHomeBandValuesMissing");
assertHasNotice(missingModel, "foodAtHomeHouseholdSizeFactorsMissing");
assertHasNotice(missingModel, "livingFloorAssumptionsIncomplete");
assert.equal(missingModel.status.tone, "warning", "missing assumptions should render warning status");
assert.equal(missingStorage.writes.length, 0, "missing-assumption readiness render should not write storage");

const mismatchStorage = createStorageForAssumptions(context, createLivingFloorAssumptions());
const mismatchModel = buildModel(
  context,
  createLinkedRecord({
    state: "CO",
    stateOfResidence: "NY"
  }),
  mismatchStorage
);
assertHasNotice(mismatchModel, "stateMismatchDetected");
assert.equal(mismatchStorage.writes.length, 0, "state mismatch readiness render should not write storage");

const fallbackStorage = createStorageForAssumptions(context, createLivingFloorAssumptions());
const fallbackModel = buildModel(
  context,
  createLinkedRecord({
    spouseGender: null,
    dependentDetails: [
      { id: "unknown-age" },
      { id: "teen-unknown-sex", age: 16 }
    ]
  }),
  fallbackStorage
);
assertHasNotice(fallbackModel, "missingAgeFallbackUsed");
assertHasNotice(fallbackModel, "missingSexFallbackUsed");
assert.equal(fallbackStorage.writes.length, 0, "household fallback readiness render should not write storage");

const noLinkedModel = buildModel(context, null, createMemoryStorage());
assertHasNotice(noLinkedModel, "linkedProfileMissing");
assert.equal(noLinkedModel.status.tone, "warning", "missing linked profile should produce warning status");

console.log("analysis-setup-living-floor-readiness-notices-check passed");
