const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");
const assetTreatmentPath = path.join(featureRoot, "asset-treatment-calculations.js");
const layer1Path = path.join(featureRoot, "household-wealth-projection-calculations.js");
const layer2Path = path.join(featureRoot, "household-death-event-availability-calculations.js");
const layer3Path = path.join(featureRoot, "household-survivor-runway-calculations.js");
const composerPath = path.join(featureRoot, "income-impact-scenario-composer-calculations.js");

const assetTreatmentSource = fs.readFileSync(assetTreatmentPath, "utf8");
const layer1Source = fs.readFileSync(layer1Path, "utf8");
const layer2Source = fs.readFileSync(layer2Path, "utf8");
const layer3Source = fs.readFileSync(layer3Path, "utf8");
const composerSource = fs.readFileSync(composerPath, "utf8");

function createContext() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(assetTreatmentSource, context, { filename: assetTreatmentPath });
  vm.runInContext(layer1Source, context, { filename: layer1Path });
  vm.runInContext(layer2Source, context, { filename: layer2Path });
  vm.runInContext(layer3Source, context, { filename: layer3Path });
  vm.runInContext(composerSource, context, { filename: composerPath });
  return context;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertClose(actual, expected, message, epsilon = 0.02) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function assertNoForbiddenConcepts() {
  [
    /\bDOM\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\b/,
    /\bdisplay\b/i,
    /\bchart\b/i,
    /warning[-]?event[-]?library/i
  ].forEach(function (pattern) {
    assert.ok(!pattern.test(composerSource), `composer source should not contain ${pattern}`);
  });
}

function createAssetTreatmentAssumptions() {
  return {
    enabled: true,
    source: "income-impact-scenario-composer-v1-check",
    assets: {
      cashAndCashEquivalents: {
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      },
      taxableBrokerageInvestments: {
        include: true,
        treatmentPreset: "taxable-investment",
        taxTreatment: "taxable",
        taxDragPercent: 20,
        liquidityHaircutPercent: 10
      },
      businessPrivateCompanyValue: {
        include: false,
        treatmentPreset: "business-illiquid",
        taxTreatment: "case-specific",
        taxDragPercent: 10,
        liquidityHaircutPercent: 50
      }
    },
    assetGrowthProjectionAssumptions: {
      mode: "projectedOffsets"
    }
  };
}

function createAnalysisSettings(overrides = {}) {
  return {
    projectedAssetOffsetAssumptions: {
      enabled: true,
      consumptionStatus: "method-active",
      activationVersion: 1
    },
    assetTreatmentAssumptions: createAssetTreatmentAssumptions(),
    ...overrides
  };
}

function createLensModel(overrides = {}) {
  return {
    assetFacts: {
      assets: [
        {
          id: "cash",
          categoryKey: "cashAndCashEquivalents",
          label: "Cash",
          currentValue: 100000,
          sourcePaths: ["assetFacts.assets[0].currentValue"]
        },
        {
          id: "brokerage",
          categoryKey: "taxableBrokerageInvestments",
          label: "Taxable Brokerage",
          currentValue: 50000,
          sourcePaths: ["assetFacts.assets[1].currentValue"]
        },
        {
          id: "excluded-business",
          categoryKey: "businessPrivateCompanyValue",
          label: "Business Value",
          currentValue: 900000,
          includedInProjection: false,
          sourcePaths: ["assetFacts.assets[2].currentValue"]
        }
      ]
    },
    incomeBasis: {
      insuredNetAnnualIncome: 70000,
      spouseOrPartnerNetAnnualIncome: 30000,
      insuredGrossAnnualIncome: 170000
    },
    ongoingSupport: {
      annualTotalEssentialSupportCost: 60000,
      annualDiscretionaryPersonalSpending: 12000
    },
    survivorScenario: {
      survivorNetAnnualIncome: 30000,
      survivorIncomeStartDelayMonths: 0
    },
    projectedAssetOffset: {
      sourceMode: "projectedOffsets",
      includedCategories: [
        {
          categoryKey: "cashAndCashEquivalents",
          assumedAnnualGrowthRatePercent: 2,
          sourcePaths: ["projectedAssetOffset.includedCategories.cash"]
        },
        {
          categoryKey: "taxableBrokerageInvestments",
          assumedAnnualGrowthRatePercent: 6,
          sourcePaths: ["projectedAssetOffset.includedCategories.brokerage"]
        }
      ],
      effectiveProjectedAssetOffset: 9999999
    },
    projectedAssetGrowth: {
      totalProjectedAssetValue: 8888888
    },
    treatedAssetOffsets: {
      totalTreatedAssetValue: 1
    },
    treatedExistingCoverageOffset: {
      totalRawCoverage: 600000,
      totalTreatedCoverageOffset: 400000,
      includedPolicyCount: 1,
      excludedPolicyCount: 1,
      policies: [
        {
          policyId: "included-term",
          included: true,
          rawAmount: 400000,
          treatedAmount: 400000
        },
        {
          policyId: "pending",
          included: false,
          rawAmount: 200000,
          treatedAmount: 0
        }
      ],
      warnings: [
        {
          code: "pending-coverage-excluded",
          message: "Pending coverage excluded by prepared treatment."
        }
      ],
      sourcePaths: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"]
    },
    finalExpenses: {
      totalFinalExpenseNeed: 20000
    },
    transitionNeeds: {
      totalTransitionNeed: 10000
    },
    treatedDebtPayoff: {
      sourcePaths: ["treatedDebtPayoff.debts"],
      debts: [
        {
          debtFactId: "credit-card",
          categoryKey: "unsecuredConsumerDebt",
          isMortgage: false,
          treatmentMode: "payoff",
          included: true,
          treatedAmount: 5000
        },
        {
          debtFactId: "mortgage-support",
          categoryKey: "realEstateSecuredDebt",
          isMortgage: true,
          treatmentMode: "support",
          mortgageTreatmentMode: "support",
          included: true,
          treatedAmount: 12000,
          mortgageSupportTrace: {
            monthlyMortgagePaymentUsed: 1000,
            supportMonthsUsed: 12
          }
        }
      ]
    },
    ...overrides
  };
}

function createInput(overrides = {}) {
  return {
    valuationDate: "2026-01-01",
    selectedDeathDate: "2031-01-01",
    selectedDeathAge: 51,
    projectionHorizonMonths: 60,
    lensModel: createLensModel(overrides.lensModel || {}),
    analysisSettings: createAnalysisSettings(overrides.analysisSettings || {}),
    scenarioOptions: {
      includeDiscretionaryNeeds: true,
      ...(overrides.scenarioOptions || {})
    },
    ...overrides.input
  };
}

function loadComposerWithLayerSpies() {
  const context = createContext();
  const lensAnalysis = context.LensApp.lensAnalysis;
  const order = [];
  const captured = {};
  const originalLayer1 = lensAnalysis.calculateHouseholdWealthProjection;
  const originalLayer2 = lensAnalysis.calculateHouseholdDeathEventAvailability;
  const originalLayer3 = lensAnalysis.calculateHouseholdSurvivorRunway;

  lensAnalysis.calculateHouseholdWealthProjection = function (input) {
    order.push("householdWealthProjection");
    captured.layer1Input = clone(input);
    const output = originalLayer1(input);
    captured.layer1Output = clone(output);
    return output;
  };
  lensAnalysis.calculateHouseholdDeathEventAvailability = function (input) {
    order.push("deathEventAvailability");
    captured.layer2Input = clone(input);
    const output = originalLayer2(input);
    captured.layer2Output = clone(output);
    return output;
  };
  lensAnalysis.calculateHouseholdSurvivorRunway = function (input) {
    order.push("survivorRunway");
    captured.layer3Input = clone(input);
    const output = originalLayer3(input);
    captured.layer3Output = clone(output);
    return output;
  };

  return {
    composeIncomeImpactScenario: lensAnalysis.composeIncomeImpactScenario,
    order,
    captured
  };
}

function runBaselineChecks() {
  const { composeIncomeImpactScenario, order, captured } = loadComposerWithLayerSpies();
  assert.strictEqual(typeof composeIncomeImpactScenario, "function", "composer exports composeIncomeImpactScenario");

  const scenario = composeIncomeImpactScenario(createInput());
  assert.deepStrictEqual(
    order,
    ["householdWealthProjection", "deathEventAvailability", "survivorRunway"],
    "layers are called in order"
  );

  const layer1StartingAssets = captured.layer1Input.assetLedger.reduce(function (total, row) {
    return total + (row.includedInProjection === false ? 0 : row.currentValue);
  }, 0);
  assert.strictEqual(layer1StartingAssets, 150000, "Layer 1 receives current gross asset values");
  assert.notStrictEqual(layer1StartingAssets, 1, "Layer 1 does not use treatedAssetOffsets total");
  assert.notStrictEqual(layer1StartingAssets, 9999999, "Layer 1 does not use projectedAssetOffset effective total");
  assert.ok(
    captured.layer1Input.assetLedger.every((row) => row.id !== "included-term"),
    "coverage is excluded from pre-death wealth input"
  );

  assert.strictEqual(captured.layer1Input.incomeStreams[0].amount, 100000, "Layer 1 uses mature net household income");
  assert.strictEqual(captured.layer1Input.expenseStreams.length, 2, "essential and discretionary expenses map to Layer 1");
  assert.strictEqual(
    captured.layer1Input.assetLedger.find((row) => row.id === "brokerage").growthStatus,
    "method-active",
    "active projected-offset category growth maps to Layer 1"
  );

  assert.strictEqual(
    captured.layer2Input.projectedAssetLedger.length,
    scenario.preDeathSeries.targetPoint.assetLedger.length,
    "Layer 2 receives the Layer 1 target asset ledger"
  );
  assert.ok(
    scenario.deathEvent.survivorAvailableTreatedAssets < scenario.deathEvent.assetsBeforeDeath,
    "Layer 2 applies death-event treatment to projected assets"
  );
  assert.strictEqual(scenario.deathEvent.coverageAdded, 400000, "coverage is added at the event");

  assertClose(
    scenario.deathEvent.resourcesAfterObligations,
    scenario.deathEvent.survivorAvailableTreatedAssets
      + scenario.deathEvent.coverageAdded
      - scenario.deathEvent.immediateObligations,
    "immediate obligations are subtracted once"
  );

  assert.strictEqual(
    captured.layer3Input.startingResources.value,
    scenario.deathEvent.resourcesAfterObligations,
    "Layer 3 starts from Layer 2 resourcesAfterObligations"
  );
  const firstRunwayPoint = scenario.postDeathSeries.points[0];
  assert.ok(firstRunwayPoint.survivorIncome > 0, "survivor income maps into Layer 3");
  assert.ok(
    firstRunwayPoint.netUse < firstRunwayPoint.survivorNeeds + firstRunwayPoint.scheduledObligations,
    "survivor income offsets survivor needs"
  );
  assert.strictEqual(
    captured.layer3Input.scheduledObligations[0].category,
    "mortgageSupport",
    "mortgage support is scheduled for Layer 3"
  );

  assert.ok(
    scenario.warnings.some((warning) => warning.code === "pending-coverage-excluded"),
    "warnings aggregate from layers"
  );
  assert.ok(
    scenario.dataGaps.some((gap) => gap.code === "mortgage-support-deferred-from-immediate-obligations"),
    "data gaps aggregate from layers"
  );
  assert.ok(
    scenario.sourcePaths.includes("analysisSettings.assetTreatmentAssumptions"),
    "source paths aggregate from composer and layers"
  );

  assert.strictEqual(scenario.timelineFacts.coverageAdded, 400000, "coverage carries through timeline facts");
  assert.strictEqual(
    scenario.timelineFacts.resourcesAfterObligations,
    scenario.deathEvent.resourcesAfterObligations,
    "resourcesAfterObligations carries through timeline facts"
  );
}

function runCurrentAgePolicyChecks() {
  const { composeIncomeImpactScenario } = loadComposerWithLayerSpies();
  const scenario = composeIncomeImpactScenario(createInput({
    input: {
      selectedDeathDate: "2026-01-01",
      selectedDeathAge: 46
    }
  }));

  assert.strictEqual(scenario.preDeathSeries.mode, "current-point-only", "current-age death uses current-point-only");
  assert.strictEqual(scenario.preDeathSeries.points.length, 0, "current-age death does not synthesize prior points");
  assert.ok(scenario.preDeathSeries.targetPoint, "current-age death still has a target wealth point");
  assert.strictEqual(
    scenario.trace.currentAgeDeathPolicy.mode,
    "current-point-only",
    "trace records current-age policy"
  );
}

function runDurationChecks() {
  const { composeIncomeImpactScenario } = loadComposerWithLayerSpies();
  const fiveYear = composeIncomeImpactScenario(createInput({
    input: {
      selectedDeathDate: "2031-01-01",
      selectedDeathAge: 51
    }
  }));
  const twentyYear = composeIncomeImpactScenario(createInput({
    input: {
      selectedDeathDate: "2046-01-01",
      selectedDeathAge: 66
    }
  }));

  assert.strictEqual(fiveYear.preDeathSeries.mode, "forward-projection", "5-year scenario is forward projection");
  assert.strictEqual(twentyYear.preDeathSeries.mode, "forward-projection", "20-year scenario is forward projection");
  assert.ok(fiveYear.preDeathSeries.points.length > 0, "5-year scenario has pre-death points");
  assert.ok(twentyYear.preDeathSeries.points.length > fiveYear.preDeathSeries.points.length, "20-year scenario has more pre-death points");
  assert.ok(
    twentyYear.timelineFacts.assetsBeforeDeath > fiveYear.timelineFacts.assetsBeforeDeath,
    "20-year scenario has different projected assets before death"
  );
  assert.ok(
    twentyYear.timelineFacts.resourcesAfterObligations > fiveYear.timelineFacts.resourcesAfterObligations,
    "20-year scenario has different death-event resources"
  );
}

function runInactiveGrowthChecks() {
  const { composeIncomeImpactScenario, captured } = loadComposerWithLayerSpies();
  composeIncomeImpactScenario(createInput({
    analysisSettings: {
      projectedAssetOffsetAssumptions: {
        enabled: true,
        consumptionStatus: "reporting-only",
        activationVersion: 1
      }
    }
  }));

  assert.ok(
    captured.layer1Input.assetLedger.every((row) => row.growthStatus !== "method-active"),
    "saved/reporting-only growth does not activate"
  );
}

function runDataGapChecks() {
  const { composeIncomeImpactScenario } = loadComposerWithLayerSpies();
  const scenario = composeIncomeImpactScenario(createInput({
    lensModel: {
      assetFacts: {
        assets: []
      },
      incomeBasis: {
        insuredNetAnnualIncome: null,
        spouseOrPartnerNetAnnualIncome: null,
        insuredGrossAnnualIncome: 500000
      },
      treatedExistingCoverageOffset: null
    },
    analysisSettings: {
      assetTreatmentAssumptions: null
    }
  }));
  const codes = scenario.dataGaps.map((gap) => gap.code);

  assert.ok(codes.includes("missing-current-gross-asset-facts"), "missing current asset facts are composer-gapped");
  assert.ok(codes.includes("missing-mature-net-household-income"), "missing mature net income is composer-gapped");
  assert.ok(codes.includes("unsafe-gross-income-fallback-excluded"), "gross income fallback is rejected");
  assert.ok(codes.includes("missing-asset-treatment-assumptions"), "missing asset treatment is composer-gapped");
  assert.ok(codes.includes("missing-treated-existing-coverage-output"), "missing treated coverage is composer-gapped");
  assert.strictEqual(scenario.status, "partial", "missing source scenario is partial");
}

function runDepletionChecks() {
  const { composeIncomeImpactScenario } = loadComposerWithLayerSpies();
  const scenario = composeIncomeImpactScenario(createInput({
    lensModel: {
      assetFacts: {
        assets: [
          {
            id: "cash",
            categoryKey: "cashAndCashEquivalents",
            label: "Cash",
            currentValue: 1000
          }
        ]
      },
      incomeBasis: {
        insuredNetAnnualIncome: 0,
        spouseOrPartnerNetAnnualIncome: 0
      },
      ongoingSupport: {
        annualTotalEssentialSupportCost: 60000,
        annualDiscretionaryPersonalSpending: 0
      },
      survivorScenario: {
        survivorNetAnnualIncome: 0,
        survivorIncomeStartDelayMonths: 0
      },
      treatedExistingCoverageOffset: {
        totalTreatedCoverageOffset: 0,
        includedPolicyCount: 0,
        excludedPolicyCount: 0
      },
      finalExpenses: {
        totalFinalExpenseNeed: 0
      },
      transitionNeeds: {
        totalTransitionNeed: 0
      },
      treatedDebtPayoff: {
        debts: []
      }
    },
    input: {
      projectionHorizonMonths: 24
    },
    scenarioOptions: {
      includeDiscretionaryNeeds: false
    }
  }));

  assert.ok(scenario.postDeathSeries.depletion.depleted, "Layer 3 depletion carries through");
  assert.strictEqual(
    scenario.timelineFacts.depletionDate,
    scenario.postDeathSeries.depletion.depletionDate,
    "depletion date carries through timelineFacts"
  );
  assert.strictEqual(
    scenario.timelineFacts.monthsCovered,
    scenario.postDeathSeries.depletion.monthsCovered,
    "months covered carries through timelineFacts"
  );
  assert.ok(scenario.timelineFacts.accumulatedUnmetNeed > 0, "accumulated unmet need carries through");
}

function runDeterminismChecks() {
  const context = createContext();
  const composeIncomeImpactScenario = context.LensApp.lensAnalysis.composeIncomeImpactScenario;
  const first = composeIncomeImpactScenario(createInput());
  const second = composeIncomeImpactScenario(createInput());
  const serialized = JSON.stringify(first);

  assert.strictEqual(serialized, JSON.stringify(second), "composer output is deterministic");
  assert.deepStrictEqual(
    JSON.parse(serialized),
    JSON.parse(JSON.stringify(first)),
    "composer output is serializable"
  );
}

function runChecks() {
  assertNoForbiddenConcepts();
  runBaselineChecks();
  runCurrentAgePolicyChecks();
  runDurationChecks();
  runInactiveGrowthChecks();
  runDataGapChecks();
  runDepletionChecks();
  runDeterminismChecks();
  console.log("Income Impact scenario composer V1 checks passed.");
}

runChecks();
