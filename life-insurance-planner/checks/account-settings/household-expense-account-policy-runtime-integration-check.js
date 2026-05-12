#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFakeStorage() {
  const values = new Map();
  const writes = [];
  const removes = [];
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      writes.push(String(key));
      values.set(key, String(value));
    },
    removeItem(key) {
      removes.push(String(key));
      values.delete(key);
    },
    setRaw(key, value) {
      values.set(key, String(value));
    },
    writes() {
      return writes.slice();
    },
    removes() {
      return removes.slice();
    },
    snapshot() {
      return Object.fromEntries(values.entries());
    }
  };
}

function loadScript(context, relativePath, transform) {
  const source = readRepoFile(relativePath);
  vm.runInContext(typeof transform === "function" ? transform(source) : source, context, {
    filename: relativePath
  });
  return source;
}

function createRuntimeHarness() {
  const context = {
    console,
    Intl,
    URL,
    URLSearchParams,
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      }
    },
    localStorage: createFakeStorage(),
    sessionStorage: createFakeStorage(),
    LensApp: {
      accountSettings: {},
      lensAnalysis: {}
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  [
    "app/features/account-settings/household-expense-account-policy-storage.js",
    "app/features/lens-analysis/expense-taxonomy.js",
    "app/features/lens-analysis/expense-library.js",
    "app/features/lens-analysis/expense-compression-thresholds.js",
    "app/features/lens-analysis/expense-compression-threshold-resolver.js",
    "app/features/lens-analysis/household-expense-compression-calculations.js",
    "app/features/lens-analysis/household-expense-compression-policy.js",
    "app/features/lens-analysis/household-expense-lifestyle-range-policy.js",
    "app/features/lens-analysis/household-expense-account-policy-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-metadata.js",
    "app/features/lens-analysis/household-expense-graph-adjustment-policy-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-context-resolver.js",
    "app/features/lens-analysis/household-expense-living-floor-calculations.js",
    "app/features/lens-analysis/household-expense-living-floor-readiness-warnings.js",
    "app/features/lens-analysis/income-impact-compression-reporting-prep.js",
    "app/features/lens-analysis/income-impact-household-expense-policy-runtime-adapter.js",
    "app/features/lens-analysis/income-impact-base-household-expense-stream.js",
    "app/features/lens-analysis/income-impact-household-expense-adjustment-engine.js",
    "app/features/lens-analysis/income-impact-household-expense-scenario-handoff-preview.js",
    "app/features/lens-analysis/income-impact-lifestyle-scenario-calculations.js",
    "app/features/lens-analysis/income-impact-timeline-graph-model.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  loadScript(context, "app/features/lens-analysis/income-loss-impact-display.js", function (source) {
    return source.replace(
      /\n\}\)\(window\);\s*$/,
      "\n  window.__householdExpensePolicyRuntimeHarness = { resolveIncomeImpactHouseholdExpenseAccountPolicy, buildBaseIncomeImpactContextFromState, buildIncomeImpactResultFromBaseContext, buildIncomeImpactResultFromState, renderTimeline };\n})(window);\n"
    );
  });

  return {
    context,
    harness: context.__householdExpensePolicyRuntimeHarness,
    lensAnalysis: context.LensApp.lensAnalysis,
    storageApi: context.LensApp.accountSettings.householdExpenseAccountPolicyStorage,
    storage: context.localStorage
  };
}

function makeScenario() {
  return {
    status: "complete",
    scenario: {
      valuationDate: "2026-05-07",
      selectedDeathDate: "2031-05-07",
      selectedDeathAge: 52,
      projectionHorizonMonths: 480
    },
    preDeathSeries: {
      mode: "forward-projection",
      precision: "monthly",
      points: [
        { date: "2027-05-07", monthIndex: 12, endingAssets: 520000 },
        { date: "2031-05-07", monthIndex: 60, endingAssets: 600000 }
      ],
      targetPoint: { date: "2031-05-07", endingAssets: 600000 }
    },
    deathEvent: {
      date: "2031-05-07",
      age: 52,
      assetsBeforeDeath: 600000,
      survivorAvailableTreatedAssets: 500000,
      coverageAdded: 250000,
      immediateObligations: 100000,
      resourcesAfterObligations: 650000,
      layer2: {
        resources: {
          totalResourcesBeforeObligations: 750000
        }
      }
    },
    postDeathSeries: {
      points: [
        {
          monthIndex: 1,
          date: "2031-06-07",
          survivorNeeds: 4000,
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          netUse: 3500,
          startingResources: 653500,
          endingResources: 650000
        },
        {
          monthIndex: 2,
          date: "2031-07-07",
          survivorNeeds: 4000,
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          netUse: 3500,
          startingResources: 650000,
          endingResources: 646500
        },
        {
          monthIndex: 3,
          date: "2031-08-07",
          survivorNeeds: 4000,
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          netUse: 3500,
          startingResources: 646500,
          endingResources: 643000
        },
        {
          monthIndex: 12,
          date: "2032-05-07",
          survivorNeeds: 4000,
          essentialNeeds: 3000,
          discretionaryNeeds: 1000,
          netUse: 3500,
          startingResources: 615000,
          endingResources: 611500
        }
      ],
      summary: {
        totalSurvivorNeeds: 48000,
        totalSurvivorIncome: 6000,
        accumulatedUnmetNeed: 0
      },
      depletion: {
        depleted: false,
        depletionDate: null,
        monthsCovered: 480
      }
    },
    timelineFacts: {
      assetsBeforeDeath: 600000,
      survivorAvailableTreatedAssets: 500000,
      coverageAdded: 250000,
      resourcesAfterObligations: 650000,
      monthsCovered: 480,
      depletionDate: null,
      accumulatedUnmetNeed: 0
    },
    warnings: [],
    dataGaps: []
  };
}

function makeRiskEvaluation() {
  return {
    status: "complete",
    events: [],
    stableEvents: [],
    warnings: [],
    dataGaps: []
  };
}

function makeReconciledExpense(expenseTypeKey, categoryKey, monthlyAmount, sourceKey) {
  return {
    expenseId: `${expenseTypeKey}-fixture`,
    label: expenseTypeKey,
    expenseTypeKey,
    typeKey: expenseTypeKey,
    categoryKey,
    monthlyRecurringAmount: monthlyAmount,
    monthlyAmount,
    monthlyEquivalent: monthlyAmount,
    frequency: "monthly",
    sourceKey,
    sourceOwnedBy: "ongoingSupport",
    ownedByField: sourceKey,
    sourcePath: `protectionModeling.data.${sourceKey}`,
    metadata: {
      normalizedSourcePath: `lensModel.ongoingSupport.${sourceKey}`
    },
    isGeneratedExpense: true,
    isScalarHouseholdExpense: true,
    isCompressionEligibleSource: true,
    isFormulaEligible: false
  };
}

function makeProtectedExpense(expenseTypeKey, categoryKey, monthlyAmount) {
  return {
    expenseId: `${expenseTypeKey}-protected-fixture`,
    label: expenseTypeKey,
    expenseTypeKey,
    typeKey: expenseTypeKey,
    categoryKey,
    monthlyRecurringAmount: monthlyAmount,
    monthlyAmount,
    monthlyEquivalent: monthlyAmount,
    frequency: "monthly",
    sourceKey: expenseTypeKey,
    sourceOwnedBy: expenseTypeKey === "autoLoanPayment" ? "debtRecords" : "ongoingSupport",
    sourcePath: expenseTypeKey === "autoLoanPayment"
      ? "protectionModeling.data.debtRecords[0]"
      : `protectionModeling.data.${expenseTypeKey}`,
    metadata: {
      normalizedSourcePath: `lensModel.ongoingSupport.${expenseTypeKey}`
    },
    isGeneratedExpense: true,
    isScalarHouseholdExpense: expenseTypeKey !== "autoLoanPayment",
    isCompressionEligibleSource: expenseTypeKey !== "autoLoanPayment",
    isFormulaEligible: false,
    isDebtPaymentExpense: expenseTypeKey === "autoLoanPayment"
  };
}

function makeLensModel(expenses) {
  const monthlyTotal = expenses.reduce(function (sum, expense) {
    const value = Number(expense?.monthlyRecurringAmount ?? expense?.monthlyAmount ?? expense?.monthlyEquivalent);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  return {
    id: "runtime-account-policy-fixture",
    householdFacts: {},
    ongoingSupport: {
      monthlyFoodCost: 1000,
      monthlyNonHousingEssentialSupportCost: monthlyTotal,
      monthlyTotalEssentialSupportCost: monthlyTotal
    },
    expenseFacts: {
      expenses: expenses.map(cloneJson)
    }
  };
}

function makeCompleteLivingFloorAssumptions() {
  return {
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
        "1": 1,
        "2": 1,
        "3": 1,
        "4": 1,
        "5": 1,
        "6Plus": 1
      }
    },
    model90DefaultBucketFloors: {
      householdConsumables: {
        planningBucketKey: "householdConsumables",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 100,
        monthlyPerMemberAmount: 25,
        notes: null
      },
      communicationsConnectivity: {
        planningBucketKey: "communicationsConnectivity",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 80,
        monthlyPerMemberAmount: 10,
        notes: null
      },
      transportationBasics: {
        planningBucketKey: "transportationBasics",
        source: "ADMIN_ENTERED",
        sourcePeriod: "2026",
        monthlyBaseAmount: 150,
        monthlyPerAdultDriverAmount: 50,
        notes: null
      }
    }
  };
}

function createLayer5Output(input) {
  return {
    compressionOpportunities: input?.compressionReport?.opportunities || [],
    pauseCandidates: input?.compressionReport?.pauseCandidates || [],
    protectedExpenseItems: input?.compressionReport?.protectedItems || [],
    excludedExpenseItems: input?.compressionReport?.excludedItems || [],
    advisorReviewItems: input?.compressionReport?.advisorReviewItems || [],
    compressionDataGaps: input?.compressionReport?.dataGaps || [],
    compressionTrace: { reportingOnly: true },
    compressionScenarios: [],
    compressionScenarioDataGaps: [],
    compressionScenarioWarnings: [],
    compressionScenarioTrace: {
      graphPathChanged: false,
      layer5AppliedCompression: false,
      baseScenarioMutated: false
    },
    interventionScenarios: [],
    baseScenarioSummary: {
      resourcesAfterObligations: 650000,
      monthsCovered: 480,
      depletionDate: null,
      accumulatedUnmetNeed: 0,
      totalSurvivorNeeds: 48000,
      totalSurvivorIncome: 6000
    },
    dataGaps: []
  };
}

function getDefaultPolicyInputs(lensAnalysis) {
  return {
    defaultLifestyleRangePolicies: lensAnalysis.householdExpenseLifestyleRangePolicy.listLifestyleRangePolicies(),
    defaultCompressionPolicyRules: lensAnalysis.householdExpenseCompressionPolicy.getHouseholdExpenseCompressionPolicyRules(),
    defaultCompressionThresholdRules: lensAnalysis.expenseCompressionThresholds.getExpenseCompressionThresholdRules()
  };
}

function resolvePolicyContext(runtime, storage) {
  return runtime.harness.resolveIncomeImpactHouseholdExpenseAccountPolicy({
    currentLensAnalysis: runtime.lensAnalysis,
    accountPolicyStorage: runtime.storageApi,
    accountPolicyResolver: runtime.lensAnalysis.householdExpenseAccountPolicyResolver.resolveHouseholdExpenseAccountPolicy,
    storage
  });
}

function buildRuntimeState(runtime, policyContext, lensModel, capture) {
  const scenario = makeScenario();
  return {
    valuationDate: "2026-05-07",
    lensModel,
    analysisSettings: {},
    scenarioState: {
      projectionHorizonYears: 40,
      mortgageTreatmentOverride: "followAssumptions",
      lifestyleSliderValue: 0
    },
    deathAgeState: { hasDateOfBirth: false },
    householdExpenseAccountPolicyContext: policyContext,
    composeIncomeImpactScenario() {
      return cloneJson(scenario);
    },
    evaluateIncomeImpactRiskEvents() {
      return makeRiskEvaluation();
    },
    buildIncomeImpactTimelineGraphModel(input) {
      capture.graphInputs.push(cloneJson(input));
      return runtime.lensAnalysis.buildIncomeImpactTimelineGraphModel(input);
    },
    prepareIncomeImpactCompressionReportingInputs(input) {
      capture.compressionPrepInputs.push(cloneJson(input));
      return runtime.lensAnalysis.prepareIncomeImpactCompressionReportingInputs(input);
    },
    calculateIncomeImpactCompressionScenario(input) {
      capture.compressionScenarioInputs.push(cloneJson(input));
      return {
        status: "blocked",
        baseScenarioUnchanged: true,
        dataGaps: [{ code: "runtime-proof-compression-not-applied" }],
        warnings: [],
        trace: {
          calculationMethod: "runtime-proof-passive-compression-scenario",
          baseScenarioMutated: false,
          graphPathChanged: false
        }
      };
    },
    calculateIncomeImpactLifestyleScenario(input) {
      capture.lifestyleInputs.push(cloneJson(input));
      const output = runtime.lensAnalysis.incomeImpactLifestyleScenarioCalculations.calculateIncomeImpactLifestyleScenario(input);
      capture.lifestyleOutputs.push(cloneJson(output));
      return output;
    },
    calculateIncomeImpactTriageInterventions(input) {
      capture.layer5Inputs.push(cloneJson(input));
      return createLayer5Output(input);
    }
  };
}

function buildResultForSlider(runtime, state, sliderValue) {
  const baseContext = runtime.harness.buildBaseIncomeImpactContextFromState(state);
  return runtime.harness.buildIncomeImpactResultFromBaseContext(state, baseContext, sliderValue);
}

function comparisonValues(result) {
  const series = result?.graphModel?.series?.comparisonPostDeathResources;
  assert.ok(Array.isArray(series), "graph model should include comparisonPostDeathResources");
  assert.equal(series.length, 1, "graph model should include one lifestyle comparison series");
  return series[0].points.map(function (point) {
    return point.value;
  });
}

function comparisonSeriesCount(result) {
  const series = result?.graphModel?.series?.comparisonPostDeathResources;
  return Array.isArray(series) ? series.length : 0;
}

function baseValues(result) {
  return result.scenario.postDeathSeries.points.map(function (point) {
    return point.endingResources;
  });
}

function renderedGraphValues(result) {
  return comparisonSeriesCount(result) ? comparisonValues(result) : baseValues(result);
}

function getPathD(html, pathId) {
  const pattern = new RegExp(`<path\\b(?=[^>]*data-income-impact-graph-path="${pathId}")[^>]*\\bd="([^"]*)"`, "m");
  const match = html.match(pattern);
  assert.ok(match, `Expected graph path ${pathId}`);
  return match[1];
}

function makeCapture() {
  return {
    compressionPrepInputs: [],
    compressionScenarioInputs: [],
    lifestyleInputs: [],
    lifestyleOutputs: [],
    graphInputs: [],
    layer5Inputs: []
  };
}

const runtime = createRuntimeHarness();
assert.equal(typeof runtime.harness.resolveIncomeImpactHouseholdExpenseAccountPolicy, "function");
assert.equal(typeof runtime.harness.buildBaseIncomeImpactContextFromState, "function");
assert.equal(typeof runtime.harness.buildIncomeImpactResultFromBaseContext, "function");
assert.equal(typeof runtime.lensAnalysis.incomeImpactLifestyleScenarioCalculations.calculateIncomeImpactLifestyleScenario, "function");
assert.equal(typeof runtime.lensAnalysis.buildIncomeImpactTimelineGraphModel, "function");

const accountPolicyOverride = {
  version: 1,
  lifestyleRangeOverrides: [{
    expenseTypeKey: "groceries",
    conservativeFloorRatio: 0.3,
    elevatedCeilingRatio: 1.6
  }],
  compressionThresholdOverrides: [],
  compressionPolicyOverrides: [],
  guardrails: {},
  metadata: {
    source: "runtime-integration-check"
  }
};
const accountPolicySaveResult = runtime.storageApi.saveHouseholdExpenseAccountPolicy({
  accountId: ACCOUNT_ID,
  accountPolicy: accountPolicyOverride,
  metadata: { updatedBy: "runtime-integration-check" },
  storage: runtime.storage
});
assert.equal(accountPolicySaveResult.saved, true, "account policy override should be saved through the storage adapter");
assert.equal(runtime.storage.writes().length, 1, "admin-saved account override should be the only storage write before runtime proof");
assert.match(runtime.storage.writes()[0], /^model90\.householdExpenseAccountPolicy\.v1:/);

const accountPolicyContext = resolvePolicyContext(runtime, runtime.storage);
assert.equal(accountPolicyContext.accountId, ACCOUNT_ID);
assert.equal(accountPolicyContext.policySource, "accountOverride");
assert.equal(accountPolicyContext.storageResult.status, "loaded");
assert.equal(accountPolicyContext.resolvedAccountPolicyAvailable, true);
assert.equal(accountPolicyContext.trace.accountIdSource, "temporaryLocalDisplayFallback");
const resolvedGroceries = accountPolicyContext.resolvedPolicy.resolvedLifestyleRangePolicies.find(function (row) {
  return row.expenseTypeKey === "groceries";
});
assert.ok(resolvedGroceries, "resolved account policy should include groceries");
assert.equal(resolvedGroceries.conservativeFloorRatio, 0.3);
assert.equal(resolvedGroceries.elevatedCeilingRatio, 1.6);

const seedRuntime = createRuntimeHarness();
const seedPolicyContext = resolvePolicyContext(seedRuntime, seedRuntime.storage);
assert.equal(seedPolicyContext.policySource, "defaultSeedPolicy", "missing account policy should resolve to seed defaults");

const groceriesExpense = makeReconciledExpense("groceries", "foodGroceries", 1000, "monthlyFoodCost");
const seedCapture = makeCapture();
const seedState = buildRuntimeState(seedRuntime, seedPolicyContext, makeLensModel([groceriesExpense]), seedCapture);
const seedCurrent = buildResultForSlider(seedRuntime, seedState, 0);
const seedConservative = buildResultForSlider(seedRuntime, seedState, -100);
const seedElevated = buildResultForSlider(seedRuntime, seedState, 100);

assert.equal(seedCapture.graphInputs[0].selectedScenarioId, "income-impact-current-scenario", "display runtime should pass selectedScenarioId into the graph model");
assert.equal(seedCapture.graphInputs[0].appliedScenarios.length, 1, "display runtime should pass the current applied scenario into the graph model");
assert.equal(seedCapture.graphInputs[0].appliedScenarios[0].scenarioId, "income-impact-current-scenario");
assert.equal(seedCapture.graphInputs[0].appliedScenarios[0].comparisonScenarios.length, 1, "applied runtime scenario should carry the lifestyle comparison graph contract");
assert.equal(seedCurrent.graphModel.trace.scenarioModelMode, "appliedScenarios", "live display graph model path should report applied-scenario mode");
assert.equal(seedCurrent.graphModel.trace.appliedScenarioCount, 1);
assert.equal(seedCurrent.graphModel.trace.selectedScenarioId, "income-impact-current-scenario");
assert.equal(comparisonSeriesCount(seedCurrent), 0, "Current/0 seed-default comparison should not render a duplicate graph series");
assert.equal(seedCapture.lifestyleOutputs[0].trace.streamDefaultUsed, true, "seed default should resolve through the stream default path");
assert.equal(seedCapture.lifestyleOutputs[0].comparisonScenario.trace.calculationMethod, "income-impact-household-expense-stream-comparison-adapter-v1");
assert.equal(seedCapture.lifestyleInputs[0].accountPolicyResolution, undefined);
assert.ok(comparisonValues(seedConservative)[0] > baseValues(seedConservative)[0], "Conservative seed default should improve resources");
assert.ok(comparisonValues(seedElevated)[0] < baseValues(seedElevated)[0], "Elevated seed default should reduce resources");

const accountCapture = makeCapture();
const accountState = buildRuntimeState(runtime, accountPolicyContext, makeLensModel([groceriesExpense]), accountCapture);
const accountCurrent = buildResultForSlider(runtime, accountState, 0);
const accountConservative = buildResultForSlider(runtime, accountState, -100);
const accountElevated = buildResultForSlider(runtime, accountState, 100);
const writesAfterRuntimeSliders = runtime.storage.writes();

assert.equal(writesAfterRuntimeSliders.length, 1, "Income Impact runtime and lifestyle slider evaluation should not write storage");
assert.deepEqual(runtime.storage.removes(), [], "Income Impact runtime should not remove storage");
const capturedCompressionPolicy = accountCapture.compressionPrepInputs[0].accountPolicyResolution;
const capturedLifestylePolicy = accountCapture.lifestyleInputs[0].accountPolicyResolution;
const capturedLifestyleGroceriesPolicy = capturedLifestylePolicy.resolvedLifestyleRangePolicies.find(function (row) {
  return row.expenseTypeKey === "groceries";
});
assert.equal(capturedCompressionPolicy.metadata.source, "defaultPolicy-plus-accountOverride", "compression reporting prep should receive resolved account policy metadata");
assert.equal(capturedCompressionPolicy.metadata.namespaces.lifestyleRangeOverrides, 1, "compression reporting prep should receive account override namespace counts");
assert.equal(capturedLifestylePolicy.metadata.source, "defaultPolicy-plus-accountOverride", "lifestyle helper should receive resolved account policy metadata");
assert.equal(capturedLifestylePolicy.metadata.namespaces.lifestyleRangeOverrides, 1, "lifestyle helper should receive account override namespace counts");
assert.ok(capturedLifestyleGroceriesPolicy, "lifestyle helper should receive a resolved groceries policy row");
assert.equal(capturedLifestyleGroceriesPolicy.conservativeFloorRatio, 0.3, "lifestyle helper should receive the overridden groceries conservative floor");
assert.equal(capturedLifestyleGroceriesPolicy.elevatedCeilingRatio, 1.6, "lifestyle helper should receive the overridden groceries elevated ceiling");
assert.equal(accountCapture.lifestyleOutputs[0].comparisonScenario.trace.graphAdjustmentItems[0].conservativeFloorRatio, 0.3, "account override should apply to the stream comparison output");
assert.equal(accountCapture.lifestyleOutputs[0].comparisonScenario.trace.graphAdjustmentItems[0].elevatedCeilingRatio, 1.6, "account override ceiling should apply to the stream comparison output");
assert.equal(comparisonSeriesCount(accountCurrent), 0, "Current/0 account-policy comparison should not render a duplicate graph series");
assert.notDeepEqual(cloneJson(comparisonValues(accountConservative)), cloneJson(comparisonValues(seedConservative)), "Conservative account override should change graph comparison values differently than seed default");
assert.notDeepEqual(cloneJson(comparisonValues(accountElevated)), cloneJson(comparisonValues(seedElevated)), "Elevated account override should change graph comparison values differently than seed default");
assert.ok(comparisonValues(accountConservative)[0] > comparisonValues(seedConservative)[0], "Lower account floor should extend Conservative runway more than seed default");
assert.ok(comparisonValues(accountElevated)[0] < comparisonValues(seedElevated)[0], "Higher account ceiling should shorten Elevated runway more than seed default");
assert.equal(accountConservative.compressionReporting.trace.accountPolicySource, "accountOverride");
assert.equal(accountConservative.compressionReporting.trace.accountPolicyStorageStatus, "loaded");
assert.equal(accountConservative.compressionReporting.trace.accountPolicyResolved, true);
assert.equal(accountConservative.compressionReporting.trace.lifestyleScenarioStatus, "partial", "account policy without complete living-floor assumptions should stay explicit while still producing the comparison path");
assert.equal(accountConservative.compressionReporting.trace.graphPathChanged, true);
assert.equal(accountConservative.triageInterventions.interventionScenarios.length, 0);

const currentHtml = runtime.harness.renderTimeline(accountCurrent);
const conservativeHtml = runtime.harness.renderTimeline(accountConservative);
const elevatedHtml = runtime.harness.renderTimeline(accountElevated);
assert.doesNotMatch(currentHtml, /data-income-impact-graph-path="lifestyle-post-death-resources"/, "Current/0 lifestyle graph path should not render as a duplicate baseline overlay");
assert.notEqual(getPathD(conservativeHtml, "lifestyle-post-death-resources"), getPathD(runtime.harness.renderTimeline(seedConservative), "lifestyle-post-death-resources"), "Conservative override should change the visible lifestyle graph path");
assert.notEqual(getPathD(elevatedHtml, "lifestyle-post-death-resources"), getPathD(runtime.harness.renderTimeline(seedElevated), "lifestyle-post-death-resources"), "Elevated override should change the visible lifestyle graph path");
[conservativeHtml, elevatedHtml].forEach(function (html) {
  assert.match(html, /data-income-impact-graph-path="lifestyle-post-death-resources"/);
  assert.doesNotMatch(html, /data-income-impact-graph-path="compression-post-death-resources"/);
  assert.doesNotMatch(html, /data-income-impact-graph-path="staged-compression-post-death-resources"/);
  assert.doesNotMatch(html, /data-income-impact-compression-marker|data-income-impact-graph-detail="compression-early-window"/);
});
assert.doesNotMatch(currentHtml, /data-income-impact-graph-path="compression-post-death-resources"/);
assert.doesNotMatch(currentHtml, /data-income-impact-graph-path="staged-compression-post-death-resources"/);
assert.doesNotMatch(currentHtml, /data-income-impact-compression-marker|data-income-impact-graph-detail="compression-early-window"/);

const activeStorage = createFakeStorage();
const activeAccountPolicy = {
  version: 1,
  lifestyleRangeOverrides: [{
    expenseTypeKey: "groceries",
    conservativeFloorRatio: 0.3,
    elevatedCeilingRatio: 1.6
  }],
  compressionThresholdOverrides: [],
  compressionPolicyOverrides: [],
  guardrails: {},
  graphAdjustmentOverrides: [{
    expenseTypeKey: "groceries",
    adjustmentClass: "moneyFloorAdjusted",
    minimumFloorMode: "estimatedDollarFloor",
    source: "ADMIN_ENTERED"
  }],
  livingFloorAssumptions: makeCompleteLivingFloorAssumptions(),
  metadata: {
    source: "active-graph-runtime-integration-check"
  }
};
runtime.storageApi.saveHouseholdExpenseAccountPolicy({
  accountId: ACCOUNT_ID,
  accountPolicy: activeAccountPolicy,
  metadata: { updatedBy: "runtime-integration-check" },
  storage: activeStorage
});
const activePolicyContext = resolvePolicyContext(runtime, activeStorage);
const activeCapture = makeCapture();
const activeLensModel = makeLensModel([groceriesExpense]);
activeLensModel.ongoingSupport.monthlyFoodCost = 1000;
activeLensModel.ongoingSupport.monthlyNonHousingEssentialSupportCost = 1000;
activeLensModel.ongoingSupport.monthlyTotalEssentialSupportCost = 1000;
activeLensModel.profileFacts = {
  addressState: "CO",
  maritalStatus: "Married",
  spouseAge: 40,
  spouseGender: "female"
};
activeLensModel.pmiFacts = {
  stateOfResidence: "CO"
};
const defaultStreamCapture = makeCapture();
const defaultStreamState = buildRuntimeState(runtime, activePolicyContext, activeLensModel, defaultStreamCapture);
defaultStreamState.profileRecord = {
  state: "CO",
  maritalStatus: "Married",
  spouseAge: 40,
  spouseGender: "female"
};
const defaultStreamResult = buildResultForSlider(runtime, defaultStreamState, -100);
const defaultStreamLifestyleInput = defaultStreamCapture.lifestyleInputs[0];
const defaultStreamLifestyleOutput = defaultStreamCapture.lifestyleOutputs[0];

assert.equal(defaultStreamLifestyleInput.householdExpenseStreamPolicyMode, undefined, "display path should leave default stream mode resolution to the lifestyle helper");
assert.equal(defaultStreamLifestyleOutput.trace.householdExpenseStreamPolicyModeResolved, "activeGraphAdjustments", "missing mode should resolve to active stream graph adjustments when runtime inputs are complete");
assert.equal(defaultStreamLifestyleOutput.trace.streamDefaultUsed, true, "default stream graph mode should be traced as the resolved default");
assert.equal(defaultStreamLifestyleOutput.trace.legacyFallbackUsed, false, "complete runtime inputs should not use legacy fallback");
assert.equal(defaultStreamLifestyleOutput.comparisonScenario.trace.calculationMethod, "income-impact-household-expense-stream-comparison-adapter-v1", "default stream mode should produce stream comparison path");
assert.equal(defaultStreamLifestyleOutput.comparisonScenario.trace.estimatedDollarFloorsEnabled, true, "default stream mode should keep dollar floors enabled");
assert.equal(defaultStreamLifestyleOutput.comparisonScenario.trace.bucketAggregationApplied, true, "default stream mode should use bucket-level floor aggregation");
assert.equal(defaultStreamLifestyleOutput.comparisonScenario.trace.perRowDollarFloorApplied, false, "default stream mode should not apply per-row dollar floors");
assert.equal(defaultStreamCapture.graphInputs[0].comparisonScenarios[0].trace.calculationMethod, "income-impact-household-expense-stream-comparison-adapter-v1", "graph should receive the stream comparison when default stream mode is resolved");
assert.notDeepEqual(cloneJson(comparisonValues(defaultStreamResult)), cloneJson(baseValues(defaultStreamResult)), "default stream graph mode should be able to move the comparison path");

const activeState = buildRuntimeState(runtime, activePolicyContext, activeLensModel, activeCapture);
activeState.profileRecord = {
  state: "CO",
  maritalStatus: "Married",
  spouseAge: 40,
  spouseGender: "female"
};
activeState.scenarioState.householdExpenseStreamPolicyMode = "activeGraphAdjustments";
const activeStreamResult = buildResultForSlider(runtime, activeState, -100);
const activeLifestyleInput = activeCapture.lifestyleInputs[0];
const activeLifestyleOutput = activeCapture.lifestyleOutputs[0];

assert.equal(activeStorage.writes().length, 1, "active stream runtime proof should only include the seeded account policy write");
assert.equal(activeLifestyleInput.householdExpenseStreamPolicyMode, "activeGraphAdjustments", "display path should pass explicit active graph stream mode when requested internally");
assert.equal(activeLifestyleInput.accountPolicy.graphAdjustmentOverrides[0].expenseTypeKey, "groceries", "active stream input should receive raw graph adjustment overrides from saved account policy");
assert.equal(activeLifestyleInput.accountPolicy.livingFloorAssumptions.foodAtHome.monthlyAmountsByBand.adultFemale, 250, "active stream input should receive raw living-floor assumptions from saved account policy");
assert.equal(activeLifestyleInput.accountPolicyContext.storageResult.accountPolicy.graphAdjustmentOverrides[0].expenseTypeKey, "groceries", "active stream input should carry raw account policy context");
assert.equal(activeLifestyleInput.lensModel.ongoingSupport.monthlyTotalEssentialSupportCost, 1000, "active stream input should receive full lensModel support totals");
assert.equal(activeLifestyleInput.ongoingSupport.monthlyTotalEssentialSupportCost, 1000, "active stream input should receive explicit ongoingSupport");
assert.equal(activeLifestyleInput.profileRecord.state, "CO", "active stream input should receive profile state");
assert.equal(activeLifestyleInput.profileFacts.addressState, "CO", "active stream input should receive profile facts state");
assert.equal(activeLifestyleInput.valuationDate, "2026-05-07", "active stream input should receive valuation date");
assert.equal(activeLifestyleInput.scenarioContext.deceasedInsuredRole, "client", "active stream input should receive remaining-household scenario context");
assert.equal(activeLifestyleOutput.trace.householdExpenseStreamPolicyMode, "activeGraphAdjustments", "explicit active mode should be used by the lifestyle helper");
assert.equal(activeLifestyleOutput.householdExpenseStreamPreview.metadata.activeRuntimeConsumer, true, "explicit active mode should consume stream preview output");
assert.equal(activeLifestyleOutput.comparisonScenario.trace.calculationMethod, "income-impact-household-expense-stream-comparison-adapter-v1", "explicit active mode should produce stream comparison path");
assert.equal(activeLifestyleOutput.comparisonScenario.trace.estimatedDollarFloorsEnabled, true, "explicit active mode should keep dollar floors enabled");
assert.equal(activeLifestyleOutput.comparisonScenario.trace.bucketAggregationApplied, true, "explicit active mode should use bucket-level floor aggregation");
assert.equal(activeLifestyleOutput.comparisonScenario.trace.perRowDollarFloorApplied, false, "explicit active mode should not apply per-row dollar floors");
assert.equal(activeCapture.graphInputs[0].comparisonScenarios[0].trace.calculationMethod, "income-impact-household-expense-stream-comparison-adapter-v1", "graph should receive the helper-provided stream comparison when explicit active mode is requested");
assert.notDeepEqual(cloneJson(comparisonValues(activeStreamResult)), cloneJson(baseValues(activeStreamResult)), "explicit active graph mode should be able to move the comparison path");
assert.deepEqual(cloneJson(comparisonValues(defaultStreamResult)), cloneJson(comparisonValues(activeStreamResult)), "default stream graph mode should match explicit active graph mode");

const protectedKeys = [
  ["rentOrMortgagePayment", "housingExpense"],
  ["autoLoanPayment", "debtObligations"],
  ["federalStateLocalIncomeTaxPayments", "taxes"],
  ["healthInsurancePremiums", "insuranceProtection"],
  ["daycareChildcare", "childcareDependentCare"],
  ["lifeInsurancePremiums", "insuranceProtection"],
  ["charitableGiving", "givingCommunity"]
];
const maliciousStorage = createFakeStorage();
const maliciousPolicy = {
  version: 1,
  lifestyleRangeOverrides: protectedKeys.map(function ([expenseTypeKey, categoryKey]) {
    return {
      expenseTypeKey,
      categoryKey,
      sliderEligible: true,
      rangeBehavior: "expandable",
      allowBelowBaseline: true,
      allowAboveBaseline: true,
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 2
    };
  }),
  compressionThresholdOverrides: [],
  compressionPolicyOverrides: [],
  guardrails: {},
  metadata: {
    source: "malicious-runtime-integration-check"
  }
};
runtime.storageApi.saveHouseholdExpenseAccountPolicy({
  accountId: ACCOUNT_ID,
  accountPolicy: maliciousPolicy,
  metadata: { updatedBy: "runtime-integration-check" },
  storage: maliciousStorage
});
const maliciousContext = resolvePolicyContext(runtime, maliciousStorage);
assert.equal(maliciousContext.policySource, "accountOverride", "malicious saved policy still loads as an account override");
protectedKeys.forEach(function ([expenseTypeKey]) {
  const resolved = maliciousContext.resolvedPolicy.resolvedLifestyleRangePolicies.find(function (row) {
    return row.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(resolved, `${expenseTypeKey} should resolve`);
  assert.equal(resolved.sliderEligible, false, `${expenseTypeKey} should remain slider-ineligible`);
});

const protectedCapture = makeCapture();
const protectedState = buildRuntimeState(
  runtime,
  maliciousContext,
  makeLensModel(protectedKeys.map(function ([expenseTypeKey, categoryKey]) {
    return makeProtectedExpense(expenseTypeKey, categoryKey, 500);
  })),
  protectedCapture
);
const protectedResult = buildResultForSlider(runtime, protectedState, -100);
const protectedOutput = protectedCapture.lifestyleOutputs[0];
const protectedStreamRows = protectedOutput.householdExpenseStreamPreview.baseHouseholdExpenseStream.rows;
protectedKeys.forEach(function ([expenseTypeKey]) {
  const streamRow = protectedStreamRows.find(function (item) {
    return item.expenseTypeKey === expenseTypeKey;
  });
  assert.ok(streamRow, `${expenseTypeKey} should be present in the base household expense stream`);
  assert.equal(streamRow.adjustmentClass, "excludedFromAdjustment", `${expenseTypeKey} should stay fixed in stream output`);
  assert.equal(streamRow.trace.protectedOrSourceOwned, true, `${expenseTypeKey} should be traced as protected or source-owned`);
  assert.equal(streamRow.trace.futureAdjustmentBehavior, "zero-delta", `${expenseTypeKey} should not move the graph`);
});
assert.equal(comparisonSeriesCount(protectedResult), 0, "malicious protected overrides should not render a no-op lifestyle comparison path");

const forbiddenWrites = runtime.storage.writes().concat(runtime.storage.removes()).filter(function (key) {
  return /analysisSettings|client|profile/i.test(key);
});
assert.deepEqual(forbiddenWrites, [], "runtime proof should not write profile/client/analysisSettings storage");

console.log(JSON.stringify({
  status: "passed",
  accountPolicyOverride: accountPolicyOverride.lifestyleRangeOverrides[0],
  seed: {
    current: renderedGraphValues(seedCurrent),
    conservative: comparisonValues(seedConservative),
    elevated: comparisonValues(seedElevated)
  },
  accountOverride: {
    current: renderedGraphValues(accountCurrent),
    conservative: comparisonValues(accountConservative),
    elevated: comparisonValues(accountElevated)
  },
  policySource: accountPolicyContext.policySource,
  lifestyleComparisonSource: accountCapture.lifestyleOutputs[0].comparisonScenario.trace.graphAdjustmentSource,
  storageWrites: writesAfterRuntimeSliders,
  protectedGuardrailsChecked: protectedKeys.map(function ([expenseTypeKey]) {
    return expenseTypeKey;
  })
}, null, 2));
