#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..", "..");

const EXPECTED_DEFAULTS = Object.freeze({
  enabled: false,
  projectionYears: 10,
  includeOneTimeHealthcareExpenses: false,
  oneTimeProjectionMode: "currentDollarOnly",
  source: "analysis-setup"
});

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function loadScript(context, relativePath) {
  vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAnalysisSetupContext() {
  const source = readRepoFile("app/features/lens-analysis/analysis-setup.js");
  const instrumentedSource = source.replace(
    "  LensApp.analysisSetup = Object.assign",
    "  LensApp.__healthcareExpenseAssumptionsHarness = { clampHealthcareExpenseProjectionYearsField, populateHealthcareExpenseFields, readValidatedHealthcareExpenseAssumptions };\n  LensApp.analysisSetup = Object.assign"
  );
  const context = {
    console,
    document: {
      addEventListener() {}
    },
    Intl,
    location: {
      search: ""
    },
    URLSearchParams
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = {};
  vm.createContext(context);
  vm.runInContext(instrumentedSource, context, {
    filename: "app/features/lens-analysis/analysis-setup.js"
  });
  return context;
}

function createLensAnalysisContext() {
  const context = {
    console,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  context.LensApp = { lensAnalysis: {} };
  context.window.LensApp = context.LensApp;
  vm.createContext(context);

  [
    "app/features/lens-analysis/inflation-projection-calculations.js",
    "app/features/lens-analysis/education-funding-projection-calculations.js",
    "app/features/lens-analysis/final-expense-inflation-calculations.js",
    "app/features/lens-analysis/healthcare-expense-inflation-calculations.js",
    "app/features/lens-analysis/analysis-methods.js",
    "app/features/lens-analysis/analysis-settings-adapter.js"
  ].forEach(function (relativePath) {
    loadScript(context, relativePath);
  });

  return context;
}

function createNonFinalHealthcareExpenseFact(overrides = {}) {
  return {
    expenseFactId: "expense_record_medicalOutOfPocket",
    expenseRecordId: "record_medicalOutOfPocket",
    typeKey: "medicalOutOfPocket",
    categoryKey: "ongoingHealthcare",
    label: "Medical Out-of-Pocket",
    amount: 1000,
    frequency: "monthly",
    termType: "ongoing",
    source: "protectionModeling.data.expenseRecords",
    sourceKey: "expenseRecords",
    sourcePath: "protectionModeling.data.expenseRecords[0]",
    sourceIndex: 0,
    isDefaultExpense: false,
    isScalarFieldOwned: false,
    isProtected: false,
    isAddable: true,
    isRepeatableExpenseRecord: true,
    isCustomExpense: false,
    isFinalExpenseComponent: false,
    isHealthcareSensitive: true,
    defaultInflationRole: "healthcareInflation",
    uiAvailability: "initial",
    annualizedAmount: 12000,
    oneTimeAmount: null,
    ...overrides
  };
}

function createLensModel(overrides = {}) {
  const model = {
    profileFacts: {
      clientDateOfBirth: "1980-01-01",
      clientDateOfBirthSourcePath: "profileRecord.dateOfBirth",
      clientDateOfBirthStatus: "valid"
    },
    incomeBasis: {
      annualIncomeReplacementBase: 120000,
      insuredRetirementHorizonYears: 20
    },
    debtPayoff: {
      totalDebtPayoffNeed: 0,
      mortgageBalance: 0
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 12000,
      annualDiscretionaryPersonalSpending: 6000
    },
    educationSupport: {
      totalEducationFundingNeed: 10000,
      linkedDependentEducationFundingNeed: 10000,
      desiredAdditionalDependentEducationFundingNeed: 0,
      desiredAdditionalDependentCount: 0,
      perLinkedDependentEducationFunding: 10000,
      currentDependentDetails: [
        {
          id: "child-1",
          dateOfBirth: "2020-01-01"
        }
      ]
    },
    finalExpenses: {
      medicalEndOfLifeCost: 400,
      funeralAndBurialCost: 300,
      estateSettlementCost: 200,
      otherFinalExpenses: 100,
      totalFinalExpenseNeed: 1000
    },
    transitionNeeds: {
      totalTransitionNeed: 0
    },
    existingCoverage: {
      totalExistingCoverage: 0
    },
    treatedExistingCoverageOffset: {
      totalTreatedCoverageOffset: 0,
      metadata: {
        consumedByMethods: true
      }
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 0,
      metadata: {
        consumedByMethods: true
      }
    }
  };

  if (hasOwn(overrides, "expenseFacts")) {
    model.expenseFacts = overrides.expenseFacts;
  }

  return model;
}

function createAnalysisSettings(options = {}) {
  const settings = {
    valuationDate: "2026-01-01",
    inflationAssumptions: {
      enabled: true,
      generalInflationRatePercent: 3,
      householdExpenseInflationRatePercent: 3,
      educationInflationRatePercent: 5,
      healthcareInflationRatePercent: 5,
      finalExpenseInflationRatePercent: 3,
      finalExpenseTargetAge: 85,
      source: "healthcare-expense-assumptions-readiness-check",
      ...(options.inflationAssumptions || {})
    },
    educationAssumptions: {
      fundingTreatment: {
        includeEducationFunding: true,
        includeProjectedDependents: false,
        applyEducationInflation: true,
        educationStartAge: 18,
        fundingTargetPercent: 100
      },
      source: "healthcare-expense-assumptions-readiness-check"
    },
    survivorSupportAssumptions: {
      survivorIncomeTreatment: {
        includeSurvivorIncome: false
      },
      supportTreatment: {
        includeEssentialSupport: true,
        includeTransitionNeeds: false,
        includeDiscretionarySupport: true
      },
      source: "healthcare-expense-assumptions-readiness-check"
    },
    methodDefaults: {
      dimeIncomeYears: 10,
      needsSupportYears: 5,
      hlvProjectionYears: 20,
      needsIncludeOffsetAssets: false
    }
  };

  if (hasOwn(options, "healthcareExpenseAssumptions")) {
    settings.healthcareExpenseAssumptions = options.healthcareExpenseAssumptions;
  }

  return settings;
}

function createMethodSettings(adapter, analysisSettings, lensModel) {
  return adapter.createAnalysisMethodSettings({
    analysisSettings,
    lensModel: lensModel || createLensModel(),
    profileRecord: {}
  });
}

function runAllMethods(methods, methodSettings, lensModel) {
  const model = lensModel || createLensModel();
  return {
    dime: methods.runDimeAnalysis(model, cloneJson(methodSettings.dimeSettings)),
    needs: methods.runNeedsAnalysis(model, cloneJson(methodSettings.needsAnalysisSettings)),
    hlv: methods.runHumanLifeValueAnalysis(model, cloneJson(methodSettings.humanLifeValueSettings))
  };
}

function runAllForAnalysisSettings(adapter, methods, analysisSettings, lensModel) {
  const methodSettings = createMethodSettings(adapter, analysisSettings, lensModel);
  return {
    methodSettings,
    results: runAllMethods(methods, methodSettings, lensModel)
  };
}

function outputSnapshot(results) {
  return {
    dime: {
      grossNeed: results.dime.grossNeed,
      netCoverageGap: results.dime.netCoverageGap,
      components: results.dime.components
    },
    needs: {
      grossNeed: results.needs.grossNeed,
      netCoverageGap: results.needs.netCoverageGap,
      components: results.needs.components
    },
    hlv: {
      grossHumanLifeValue: results.hlv.grossHumanLifeValue,
      netCoverageGap: results.hlv.netCoverageGap,
      components: results.hlv.components
    }
  };
}

function findTrace(result, key) {
  return (Array.isArray(result?.trace) ? result.trace : []).find(function (entry) {
    return entry?.key === key;
  });
}

function findWarning(result, code) {
  return (Array.isArray(result?.warnings) ? result.warnings : []).find(function (entry) {
    return entry?.code === code;
  });
}

const html = readRepoFile("pages/analysis-setup.html");
const healthcareSectionStart = html.indexOf("analysis-setup-control-group--healthcare-expense");
assert.notEqual(healthcareSectionStart, -1, "Analysis Setup should render a Healthcare Expense Assumptions group.");
const healthcareSectionEnd = html.indexOf("analysis-setup-control-group--calculation-inclusion", healthcareSectionStart);
const healthcareSection = html.slice(
  healthcareSectionStart,
  healthcareSectionEnd === -1 ? html.length : healthcareSectionEnd
);
assert.match(healthcareSection, /Healthcare Expense Assumptions/);
assert.match(healthcareSection, /data-analysis-healthcare-expense-field="enabled"/);
assert.match(healthcareSection, /data-analysis-healthcare-expense-field="projectionYears"/);
assert.match(healthcareSection, /data-analysis-healthcare-expense-field="includeOneTimeHealthcareExpenses"/);
assert.doesNotMatch(healthcareSection, /oneTimeProjectionMode/);
assert.match(healthcareSection, /Controls the Needs healthcareExpenses component when enabled/);
assert.match(healthcareSection, /DIME and HLV are unaffected/);
assert.match(healthcareSection, /Medical final expense is already handled separately through Final Expense projection/);
assert.match(healthcareSection, /eligible entered recurring\/non-final healthcare expense records/);
assert.match(healthcareSection, /one-time healthcare records are included current-dollar only/);
assert.match(healthcareSection, /Only entered healthcare expense records are eligible for this component/);
assert.match(healthcareSection, /overlap with household healthcare or out-of-pocket support/);
assert.equal(
  /<select[\s\S]*oneTimeProjectionMode[\s\S]*<\/select>/i.test(healthcareSection),
  false,
  "Healthcare Expense Assumptions should not expose a oneTimeProjectionMode selector."
);

const setupContext = createAnalysisSetupContext();
const analysisSetup = setupContext.LensApp.analysisSetup;
const setupHarness = setupContext.LensApp.__healthcareExpenseAssumptionsHarness;

assert.deepEqual(
  cloneJson(analysisSetup.DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS),
  EXPECTED_DEFAULTS,
  "Analysis Setup should expose the inactive healthcare expense assumptions default shape."
);
assert.deepEqual(
  cloneJson(analysisSetup.getHealthcareExpenseAssumptions({ analysisSettings: {} })),
  EXPECTED_DEFAULTS,
  "Analysis Setup should default missing healthcare expense assumptions to the inactive shape."
);
assert.deepEqual(
  cloneJson(analysisSetup.getHealthcareExpenseAssumptions({
    analysisSettings: {
      healthcareExpenseAssumptions: {
        enabled: true,
        projectionYears: "20.4",
        includeOneTimeHealthcareExpenses: true,
        oneTimeProjectionMode: "currentDollarOnly",
        source: "saved"
      }
    }
  })),
  {
    enabled: true,
    projectionYears: 20,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  },
  "Analysis Setup should preserve valid saved healthcare expense assumptions."
);
assert.deepEqual(
  cloneJson(analysisSetup.getHealthcareExpenseAssumptions({
    analysisSettings: {
      healthcareExpenseAssumptions: {
        enabled: "yes",
        projectionYears: 0,
        includeOneTimeHealthcareExpenses: "yes",
        oneTimeProjectionMode: "futureInflated"
      }
    }
  })),
  {
    ...EXPECTED_DEFAULTS,
    projectionYears: 1
  },
  "Analysis Setup should default invalid healthcare expense assumptions and clamp finite projection years to 1-60."
);

function createHealthcareExpenseFields() {
  return {
    enabled: { checked: false },
    projectionYears: { value: "" },
    includeOneTimeHealthcareExpenses: { checked: false }
  };
}

const defaultHealthcareFields = createHealthcareExpenseFields();
setupHarness.populateHealthcareExpenseFields(defaultHealthcareFields, EXPECTED_DEFAULTS);
assert.equal(defaultHealthcareFields.enabled.checked, false);
assert.equal(defaultHealthcareFields.projectionYears.value, "10");
assert.equal(defaultHealthcareFields.includeOneTimeHealthcareExpenses.checked, false);

defaultHealthcareFields.enabled.checked = true;
defaultHealthcareFields.projectionYears.value = "24";
defaultHealthcareFields.includeOneTimeHealthcareExpenses.checked = true;
const editedHealthcareAssumptions = setupHarness.readValidatedHealthcareExpenseAssumptions(defaultHealthcareFields);
assert.equal(editedHealthcareAssumptions.error, undefined);
assert.deepEqual(
  {
    enabled: editedHealthcareAssumptions.value.enabled,
    projectionYears: editedHealthcareAssumptions.value.projectionYears,
    includeOneTimeHealthcareExpenses: editedHealthcareAssumptions.value.includeOneTimeHealthcareExpenses,
    oneTimeProjectionMode: editedHealthcareAssumptions.value.oneTimeProjectionMode,
    source: editedHealthcareAssumptions.value.source
  },
  {
    enabled: true,
    projectionYears: 24,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "analysis-setup"
  },
  "Analysis Setup should read edited healthcare expense assumptions without exposing oneTimeProjectionMode."
);

const reloadedHealthcareFields = createHealthcareExpenseFields();
setupHarness.populateHealthcareExpenseFields(reloadedHealthcareFields, editedHealthcareAssumptions.value);
assert.equal(reloadedHealthcareFields.enabled.checked, true);
assert.equal(reloadedHealthcareFields.projectionYears.value, "24");
assert.equal(reloadedHealthcareFields.includeOneTimeHealthcareExpenses.checked, true);

[
  { value: "0", expected: 1 },
  { value: "-5", expected: 1 },
  { value: "99", expected: 60 },
  { value: "not-a-number", expected: 10 },
  { value: "", expected: 10 }
].forEach(function (scenario) {
  const fields = createHealthcareExpenseFields();
  fields.projectionYears.value = scenario.value;
  setupHarness.clampHealthcareExpenseProjectionYearsField(fields);
  assert.equal(
    fields.projectionYears.value,
    String(scenario.expected),
    `Analysis Setup should clamp/default projectionYears ${scenario.value} to ${scenario.expected}.`
  );
});

const lensContext = createLensAnalysisContext();
const lensAnalysis = lensContext.LensApp.lensAnalysis;
const adapter = lensAnalysis.analysisSettingsAdapter;
const methods = lensAnalysis.analysisMethods;

assert.deepEqual(
  cloneJson(adapter.DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS),
  EXPECTED_DEFAULTS,
  "Settings adapter should expose the same inactive healthcare expense assumptions default shape."
);

const mappedSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: true,
    projectionYears: 30,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  }
}));
assert.deepEqual(
  cloneJson(mappedSettings.needsAnalysisSettings.healthcareExpenseAssumptions),
  {
    enabled: true,
    projectionYears: 30,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  },
  "Adapter should map saved healthcare expense assumptions into Needs settings."
);
assert.equal(
  hasOwn(mappedSettings.dimeSettings, "healthcareExpenseAssumptions"),
  false,
  "DIME settings should not receive healthcare expense assumptions."
);
assert.equal(
  hasOwn(mappedSettings.humanLifeValueSettings, "healthcareExpenseAssumptions"),
  false,
  "HLV settings should not receive healthcare expense assumptions."
);

const readinessTrace = findTrace(mappedSettings, "healthcareExpenseAssumptions-activation-readiness");
assert.ok(readinessTrace, "Adapter should emit healthcare expense activation-readiness trace.");
assert.match(readinessTrace.message, /control the Needs healthcareExpenses component when enabled/);
assert.match(readinessTrace.message, /DIME and HLV formulas do not consume them/);
assert.match(readinessTrace.message, /Medical final expense remains handled separately through Final Expense projection/);
assert.ok(
  readinessTrace.sourcePaths.includes("analysisSettings.healthcareExpenseAssumptions"),
  "Healthcare expense readiness trace should point to the saved assumptions shape."
);

const invalidSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: "true",
    projectionYears: 0,
    includeOneTimeHealthcareExpenses: "false",
    oneTimeProjectionMode: "futureInflated"
  }
}));
assert.deepEqual(
  cloneJson(invalidSettings.needsAnalysisSettings.healthcareExpenseAssumptions),
  {
    ...EXPECTED_DEFAULTS,
    projectionYears: 1
  },
  "Adapter should default invalid saved healthcare expense assumptions and clamp finite projection years without activating formulas."
);
assert.ok(findWarning(invalidSettings, "invalid-healthcare-expense-enabled"));
assert.ok(findWarning(invalidSettings, "clamped-healthcare-expense-projection-years"));
assert.ok(findWarning(invalidSettings, "invalid-healthcare-expense-include-one-time"));
assert.ok(findWarning(invalidSettings, "invalid-healthcare-expense-one-time-projection-mode"));

const adapterHighClampSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    projectionYears: 99
  }
}));
assert.equal(
  adapterHighClampSettings.needsAnalysisSettings.healthcareExpenseAssumptions.projectionYears,
  60,
  "Adapter should clamp finite projectionYears values above 60 to 60."
);

const adapterNonFiniteDefaultSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    projectionYears: "not-a-number"
  }
}));
assert.equal(
  adapterNonFiniteDefaultSettings.needsAnalysisSettings.healthcareExpenseAssumptions.projectionYears,
  10,
  "Adapter should default non-finite projectionYears values to 10."
);
assert.ok(findWarning(adapterNonFiniteDefaultSettings, "invalid-healthcare-expense-projection-years"));

const adapterMissingDefaultSettings = createMethodSettings(adapter, createAnalysisSettings({
  healthcareExpenseAssumptions: {}
}));
assert.equal(
  adapterMissingDefaultSettings.needsAnalysisSettings.healthcareExpenseAssumptions.projectionYears,
  10,
  "Adapter should default missing projectionYears values to 10 without requiring current formula consumption."
);

const baselineRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings());
const activeReadinessRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  healthcareExpenseAssumptions: {
    enabled: true,
    projectionYears: 30,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: "currentDollarOnly",
    source: "saved"
  }
}));
assert.deepEqual(
  outputSnapshot(activeReadinessRun.results).dime,
  outputSnapshot(baselineRun.results).dime,
  "Healthcare expense assumptions mapping must not change current DIME output."
);
assert.equal(
  activeReadinessRun.results.needs.components.healthcareExpenses,
  0,
  "Needs healthcareExpenses should remain 0 when enabled but no eligible expense facts exist."
);
assert.deepEqual(
  outputSnapshot(activeReadinessRun.results).hlv,
  outputSnapshot(baselineRun.results).hlv,
  "Healthcare expense assumptions mapping must not change current HLV output."
);

const healthcareLowRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    healthcareInflationRatePercent: 1
  }
}));
const healthcareHighRun = runAllForAnalysisSettings(adapter, methods, createAnalysisSettings({
  inflationAssumptions: {
    healthcareInflationRatePercent: 9
  }
}));
assert.ok(
  healthcareHighRun.results.needs.components.finalExpenses > healthcareLowRun.results.needs.components.finalExpenses,
  "Existing healthcare inflation should continue to affect Needs medical final expense behavior."
);
assert.deepEqual(
  outputSnapshot(healthcareHighRun.results).dime,
  outputSnapshot(healthcareLowRun.results).dime,
  "Healthcare inflation should remain neutral to DIME output."
);
assert.deepEqual(
  outputSnapshot(healthcareHighRun.results).hlv,
  outputSnapshot(healthcareLowRun.results).hlv,
  "Healthcare inflation should remain neutral to HLV output."
);

const rawOnlyHealthcareModel = createLensModel({
  expenseFacts: {
    expenses: [
      createNonFinalHealthcareExpenseFact()
    ],
    totalsByBucket: {},
    metadata: {
      source: "protectionModeling.data"
    }
  }
});
const rawOnlyHealthcareRun = runAllForAnalysisSettings(
  adapter,
  methods,
  createAnalysisSettings({
    healthcareExpenseAssumptions: {
      enabled: true,
      projectionYears: 60,
      includeOneTimeHealthcareExpenses: true,
      oneTimeProjectionMode: "currentDollarOnly"
    }
  }),
  rawOnlyHealthcareModel
);
assert.ok(
  rawOnlyHealthcareRun.results.needs.components.healthcareExpenses > 0,
  "Recurring/non-final healthcare expense records should feed Needs healthcareExpenses when enabled."
);
assert.deepEqual(
  outputSnapshot(rawOnlyHealthcareRun.results).dime,
  outputSnapshot(activeReadinessRun.results).dime,
  "Recurring/non-final healthcare expense activation should not change DIME output."
);
assert.deepEqual(
  outputSnapshot(rawOnlyHealthcareRun.results).hlv,
  outputSnapshot(activeReadinessRun.results).hlv,
  "Recurring/non-final healthcare expense activation should not change HLV output."
);

console.log("Healthcare Expense Assumptions activation-readiness check passed.");
