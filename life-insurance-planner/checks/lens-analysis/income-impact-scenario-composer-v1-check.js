const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const featureRoot = path.join(repoRoot, "app", "features", "lens-analysis");
const assetTaxonomyPath = path.join(featureRoot, "asset-taxonomy.js");
const assetTreatmentPath = path.join(featureRoot, "asset-treatment-calculations.js");
const layer1Path = path.join(featureRoot, "household-wealth-projection-calculations.js");
const layer2Path = path.join(featureRoot, "household-death-event-availability-calculations.js");
const layer3Path = path.join(featureRoot, "household-survivor-runway-calculations.js");
const composerPath = path.join(featureRoot, "income-impact-scenario-composer-calculations.js");

const assetTaxonomySource = fs.readFileSync(assetTaxonomyPath, "utf8");
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
  vm.runInContext(assetTaxonomySource, context, { filename: assetTaxonomyPath });
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

function runSavingsAllocationChecks() {
  const baselineHarness = loadComposerWithLayerSpies();
  const baselineScenario = baselineHarness.composeIncomeImpactScenario(createInput());
  const allocationHarness = loadComposerWithLayerSpies();
  const allocatedScenario = allocationHarness.composeIncomeImpactScenario(createInput({
    lensModel: {
      resourceProjectionInputs: {
        savingAllocations: [
          {
            source: "savingsContributionFact",
            sourceFactId: "savings_contribution_fact_1",
            sourceRecordId: "brokerage_1",
            id: "brokerageInvestmentContributions",
            typeKey: "brokerageInvestmentContributions",
            label: "Brokerage / General Investment Contributions",
            monthlyAmount: 1000,
            targetAssetCategoryKey: "taxableBrokerageInvestments",
            targetAssetCategoryLabel: "Taxable Brokerage / Investments",
            annualGrowthRate: 0.06,
            growthStatus: "method-active",
            status: "active",
            sourcePaths: ["lensModel.savingsContributionFacts.facts.0"]
          }
        ]
      }
    }
  }));
  const baselineTarget = baselineScenario.preDeathSeries.targetPoint.assetLedger.find(function (row) {
    return row.id === "brokerage";
  });
  const allocatedTarget = allocatedScenario.preDeathSeries.targetPoint.assetLedger.find(function (row) {
    return row.id === "brokerage";
  });
  const baselineCashFlow = baselineScenario.preDeathSeries.targetPoint.assetLedger.find(function (row) {
    return row.id === "cashFlowContribution";
  });
  const allocatedCashFlow = allocatedScenario.preDeathSeries.targetPoint.assetLedger.find(function (row) {
    return row.id === "cashFlowContribution";
  });

  assert.equal(
    allocationHarness.captured.layer1Input.savingAllocations.length,
    1,
    "composer should pass mapped savings contribution records into Layer 1"
  );
  assert.equal(
    allocationHarness.captured.layer1Input.savingAllocations[0].targetAssetCategoryKey,
    "taxableBrokerageInvestments",
    "saving allocation should target the mapped asset category"
  );
  assert.equal(
    allocatedScenario.preDeathSeries.summary.totalSavingAllocations,
    60000,
    "selected death date should control the number of monthly saving allocations"
  );
  assert.equal(
    allocatedScenario.preDeathSeries.summary.totalNetCashFlow,
    baselineScenario.preDeathSeries.summary.totalNetCashFlow,
    "targeted saving allocation should not create extra household cash flow"
  );
  assert.ok(
    allocatedTarget.currentValue > baselineTarget.currentValue,
    "targeted saving allocation should increase the target asset value before the event"
  );
  assert.ok(
    allocatedCashFlow.currentValue < baselineCashFlow.currentValue,
    "targeted saving allocation should reduce the generic cash-flow contribution row"
  );
  assert.equal(
    allocatedScenario.trace.layer1.savingAllocationPolicy.rawProjectedTotalsIgnored,
    true,
    "composer should not consume raw projectedAssetGrowth totals"
  );
  assert.equal(
    allocatedScenario.trace.layer1.savingAllocationPolicy.source,
    "lensModel.resourceProjectionInputs.savingAllocations",
    "composer should prefer clean resource projection saving allocations"
  );
  assert.equal(
    allocatedScenario.trace.layer1.savingAllocationPolicy.legacyFallbackUsed,
    false,
    "clean resource projection inputs should avoid the legacy projectedAssetGrowth contribution path"
  );

  const savedOnlyAllocationHarness = loadComposerWithLayerSpies();
  const savedOnlyScenario = savedOnlyAllocationHarness.composeIncomeImpactScenario(createInput({
    analysisSettings: {
      projectedAssetOffsetAssumptions: {
        enabled: false,
        consumptionStatus: "saved-only",
        activationVersion: 0
      }
    },
    lensModel: {
      projectedAssetOffset: {
        sourceMode: "currentDollarOnly",
        includedCategories: []
      },
      resourceProjectionInputs: {
        savingAllocations: [
          {
            source: "savingsContributionFact",
            sourceFactId: "savings_contribution_fact_1",
            sourceRecordId: "retirement_1",
            id: "retirementContributions",
            typeKey: "retirementContributions",
            label: "Retirement Contributions",
            monthlyAmount: 1000,
            targetAssetCategoryKey: "traditionalRetirementAssets",
            targetAssetCategoryLabel: "Traditional Retirement Assets",
            annualGrowthRate: 0.06,
            growthStatus: "method-active",
            status: "active",
            sourcePaths: ["lensModel.savingsContributionFacts.facts.0"]
          }
        ]
      }
    }
  }));
  const savedOnlyRetirementTarget = savedOnlyScenario.preDeathSeries.targetPoint.assetLedger.find(function (row) {
    return row.id === "saving-allocation-traditionalRetirementAssets";
  });
  assert.equal(
    savedOnlyAllocationHarness.captured.layer1Input.savingAllocations[0].growthStatus,
    "method-active",
    "mapped savings allocations should activate category growth without consuming raw projected totals"
  );
  assert.ok(
    savedOnlyRetirementTarget.currentValue > 60000,
    "mapped savings allocation target should compound with its category growth rate"
  );
  assert.equal(
    savedOnlyScenario.trace.layer1.savingAllocationPolicy.rawProjectedTotalsIgnored,
    true,
    "saved-only savings growth should still ignore raw projected totals"
  );

  const legacyFallbackHarness = loadComposerWithLayerSpies();
  const legacyFallbackScenario = legacyFallbackHarness.composeIncomeImpactScenario(createInput({
    lensModel: {
      projectedAssetGrowth: {
        includedCategories: [
          {
            categoryKey: "taxableBrokerageInvestments",
            label: "Taxable Brokerage / Investments",
            assumedAnnualGrowthRatePercent: 6,
            growthConsumptionStatus: "method-active",
            contributionSourceRecords: [
              {
                typeKey: "brokerageInvestmentContributions",
                label: "Brokerage / General Investment Contributions",
                monthlyContributionAmount: 1000,
                frequency: "monthly"
              }
            ]
          }
        ],
        consumedByMethods: false
      }
    }
  }));
  assert.equal(
    legacyFallbackHarness.captured.layer1Input.savingAllocations.length,
    1,
    "legacy projectedAssetGrowth contribution records should remain as fallback"
  );
  assert.equal(
    legacyFallbackScenario.trace.layer1.savingAllocationPolicy.legacyFallbackUsed,
    true,
    "legacy fallback path should be explicitly traced"
  );
}

function runDefaultAssetTreatmentCompletenessChecks() {
  const { composeIncomeImpactScenario } = loadComposerWithLayerSpies();
  const scenario = composeIncomeImpactScenario(createInput({
    analysisSettings: {
      assetTreatmentAssumptions: null
    },
    lensModel: {
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
          }
        ]
      }
    }
  }));
  const codes = scenario.dataGaps.map((gap) => gap.code);

  assert.strictEqual(
    scenario.status,
    "complete",
    "scenario is not partial solely because saved asset-treatment assumptions are missing"
  );
  assert.ok(
    !codes.includes("missing-asset-treatment-assumptions"),
    "composer should not create a duplicate blocking missing asset-treatment gap"
  );
  assert.ok(
    scenario.warnings.some((warning) => warning.code === "asset-treatment-assumptions-defaulted"),
    "Layer 2 warning carries through when default asset-treatment assumptions are applied"
  );
  assert.strictEqual(
    scenario.deathEvent.layer2.trace.assetTreatmentAssumptions.status,
    "defaulted",
    "Layer 2 trace records the defaulted treatment policy"
  );
  assert.ok(
    scenario.deathEvent.survivorAvailableTreatedAssets > 0,
    "default asset-treatment policy still produces death-event treated assets"
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
  assert.ok(!codes.includes("missing-asset-treatment-assumptions"), "missing asset treatment assumptions are not composer-gapped");
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

function runSurvivorIncomeOffsetGraphTrendChecks() {
  const { composeIncomeImpactScenario } = loadComposerWithLayerSpies();
  const enabledScenario = composeIncomeImpactScenario(createInput({
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: 30000,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "derived-from-spouse-income",
          includeSurvivorIncomeOffset: true,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: 30000
        }
      }
    }
  }));
  const disabledScenario = composeIncomeImpactScenario(createInput({
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: null,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "suppressed-survivor-income-offset-disabled",
          includeSurvivorIncomeOffset: false,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: null
        }
      }
    }
  }));
  const scenarioOverrideOff = composeIncomeImpactScenario(createInput({
    scenarioOptions: {
      includeSurvivorIncome: false
    },
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: 30000,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "derived-from-spouse-income",
          includeSurvivorIncomeOffset: true,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: 30000
        }
      }
    }
  }));
  const scenarioOverrideOn = composeIncomeImpactScenario(createInput({
    scenarioOptions: {
      includeSurvivorIncome: true
    },
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: 30000,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "suppressed-survivor-income-offset-disabled",
          includeSurvivorIncomeOffset: false,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: 30000
        }
      }
    }
  }));
  const depletionWithoutSurvivorIncome = composeIncomeImpactScenario(createInput({
    input: {
      projectionHorizonMonths: 180
    },
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: null,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "suppressed-survivor-income-offset-disabled",
          includeSurvivorIncomeOffset: false,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: null
        }
      }
    }
  }));
  const depletionWithSurvivorIncome = composeIncomeImpactScenario(createInput({
    input: {
      projectionHorizonMonths: 180
    },
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: 15000,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "derived-from-spouse-income",
          includeSurvivorIncomeOffset: true,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: 15000
        }
      }
    }
  }));
  const highSurvivorIncomeScenario = composeIncomeImpactScenario(createInput({
    input: {
      projectionHorizonMonths: 180
    },
    lensModel: {
      survivorScenario: {
        survivorContinuesWorking: true,
        survivorNetAnnualIncome: 90000,
        survivorIncomeStartDelayMonths: 0,
        survivorIncomeDerivation: {
          survivorIncomeSource: "derived-from-spouse-income",
          includeSurvivorIncomeOffset: true,
          survivorContinuesWorking: true,
          survivorNetAnnualIncomePrepared: 90000
        }
      }
    }
  }));
  const enabledFirstPoint = enabledScenario.postDeathSeries.points[0];
  const disabledFirstPoint = disabledScenario.postDeathSeries.points[0];
  const overrideOffFirstPoint = scenarioOverrideOff.postDeathSeries.points[0];
  const overrideOnFirstPoint = scenarioOverrideOn.postDeathSeries.points[0];
  const disabledGapCodes = disabledScenario.dataGaps.map(function (gap) {
    return gap.code;
  });

  assert.ok(enabledFirstPoint.survivorIncome > 0, "enabled survivor income offset should feed the post-death graph series.");
  assert.strictEqual(disabledFirstPoint.survivorIncome, 0, "disabled survivor income offset should feed zero income into the post-death graph series.");
  assert.ok(
    enabledFirstPoint.endingResources > disabledFirstPoint.endingResources,
    "post-death graph trend values should improve when survivor income offset is enabled."
  );
  assert.ok(
    !disabledGapCodes.includes("missing-survivor-net-income"),
    "disabled survivor income offset should not create a missing survivor income data gap."
  );
  assert.equal(
    disabledScenario.trace.layer3.survivorIncome.suppressionReason,
    "survivor-income-offset-disabled",
    "composer trace should explain why survivor income is not in the graph trend."
  );
  assert.strictEqual(
    overrideOffFirstPoint.survivorIncome,
    0,
    "scenario includeSurvivorIncome=false should remove survivor income from the post-death graph series."
  );
  assert.equal(
    scenarioOverrideOff.trace.layer3.survivorIncome.suppressionReason,
    "scenario-survivor-income-disabled",
    "scenario override trace should explain runtime survivor-income exclusion."
  );
  assert.ok(
    overrideOnFirstPoint.survivorIncome > 0,
    "scenario includeSurvivorIncome=true should use prepared net survivor income when available."
  );
  assert.equal(
    scenarioOverrideOn.trace.layer3.survivorIncome.scenarioOverride,
    true,
    "scenario override trace should preserve runtime survivor-income inclusion."
  );
  assert.equal(
    scenarioOverrideOff.scenario.includeSurvivorIncome,
    false,
    "scenario metadata should expose survivor-income override state."
  );
  assert.ok(
    depletionWithoutSurvivorIncome.postDeathSeries.depletion.depleted,
    "scenario without survivor income should deplete under the long-horizon fixture."
  );
  assert.ok(
    depletionWithSurvivorIncome.postDeathSeries.depletion.depleted,
    "lower survivor income should still permit depletion under the long-horizon fixture."
  );
  assert.ok(
    depletionWithSurvivorIncome.postDeathSeries.depletion.monthsCovered
      > depletionWithoutSurvivorIncome.postDeathSeries.depletion.monthsCovered,
    "survivor income should move depletion later when it reaches Layer 3."
  );
  assert.equal(
    highSurvivorIncomeScenario.postDeathSeries.depletion.depleted,
    false,
    "high survivor income can prevent projected depletion within the horizon."
  );
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
  runSavingsAllocationChecks();
  runDefaultAssetTreatmentCompletenessChecks();
  runDataGapChecks();
  runDepletionChecks();
  runSurvivorIncomeOffsetGraphTrendChecks();
  runDeterminismChecks();
  console.log("Income Impact scenario composer V1 checks passed.");
}

runChecks();
