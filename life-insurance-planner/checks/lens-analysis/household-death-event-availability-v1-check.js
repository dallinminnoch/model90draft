const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const assetTreatmentPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "asset-treatment-calculations.js"
);
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "household-death-event-availability-calculations.js"
);
const assetTreatmentSource = fs.readFileSync(assetTreatmentPath, "utf8");
const helperSource = fs.readFileSync(helperPath, "utf8");

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
  return context;
}

function loadCalculator(options = {}) {
  const context = createContext();
  if (options.withAssetTreatment !== false) {
    vm.runInContext(assetTreatmentSource, context, { filename: assetTreatmentPath });
  }
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateHouseholdDeathEventAvailability;
}

function assertClose(actual, expected, message, epsilon = 0.01) {
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
    /\bSVG\b/,
    /warning[-]?event/i,
    /survivor[-]?runway/i
  ].forEach(function (pattern) {
    assert.ok(!pattern.test(helperSource), `Layer 2 source should not contain ${pattern}`);
  });
}

function createAssetTreatmentAssumptions() {
  return {
    enabled: true,
    source: "household-death-event-availability-v1-check",
    assets: {
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
      },
      cashAndCashEquivalents: {
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      }
    }
  };
}

function createProjectedAssetLedger(options = {}) {
  return [
    {
      id: "brokerage",
      categoryKey: "taxableBrokerageInvestments",
      label: "Taxable Brokerage",
      originalCurrentValue: 100000,
      currentValue: 150000,
      includedInProjection: true,
      sourcePaths: ["layer1.points[60].assetLedger[0].currentValue"],
      trace: {
        originalCurrentValue: 100000
      }
    },
    {
      id: "business",
      categoryKey: "businessPrivateCompanyValue",
      label: "Business Value",
      currentValue: 200000,
      includedInProjection: true,
      sourcePaths: ["layer1.points[60].assetLedger[1].currentValue"]
    },
    {
      id: "excluded-real-estate",
      categoryKey: "primaryResidenceEquity",
      label: "Primary Residence Equity",
      currentValue: 300000,
      includedInProjection: false,
      sourcePaths: ["layer1.points[60].assetLedger[2].currentValue"]
    },
    {
      id: "cashFlowContribution",
      categoryKey: "cashFlowContribution",
      label: "Cash-flow contribution",
      currentValue: options.negativeCashFlow === true ? -5000 : 10000,
      includedInProjection: true,
      sourcePaths: ["layer1.points[60].assetLedger[3].currentValue"]
    }
  ];
}

function createExistingCoverageTreatment() {
  return {
    totalRawCoverage: 600000,
    totalTreatedCoverageOffset: 400000,
    includedPolicyCount: 1,
    excludedPolicyCount: 1,
    policies: [
      {
        policyId: "term-included",
        included: true,
        rawAmount: 400000,
        treatedAmount: 400000
      },
      {
        policyId: "pending-excluded",
        treatmentKind: "pending",
        included: false,
        rawAmount: 200000,
        treatedAmount: 0,
        exclusionReason: "pending-excluded-by-assumption"
      }
    ],
    warnings: [
      {
        code: "pending-coverage-excluded",
        message: "Pending policy was excluded by treatment assumptions."
      }
    ],
    sourcePaths: ["treatedExistingCoverageOffset.totalTreatedCoverageOffset"],
    trace: [
      {
        policyId: "term-included",
        included: true,
        treatedAmount: 400000
      },
      {
        policyId: "pending-excluded",
        included: false,
        treatedAmount: 0
      }
    ]
  };
}

function createImmediateObligations(options = {}) {
  return {
    finalExpenses: {
      value: 50000,
      sourcePaths: ["finalExpenses.totalFinalExpenseNeed"]
    },
    transitionNeeds: {
      value: 25000,
      sourcePaths: ["transitionNeeds.totalTransitionNeed"]
    },
    debtTreatment: {
      sourcePaths: ["treatedDebtPayoff.debts"],
      needs: {
        debtPayoffAmount: options.aggregateOnly === true ? 92000 : 0,
        nonMortgageDebtAmount: options.aggregateOnly === true ? null : 12000,
        mortgagePayoffAmount: options.aggregateOnly === true ? null : 80000
      },
      debts: options.aggregateOnly === true
        ? []
        : [
            {
              debtFactId: "credit-card",
              categoryKey: "unsecuredConsumerDebt",
              isMortgage: false,
              treatmentMode: "payoff",
              included: true,
              treatedAmount: 12000
            },
            {
              debtFactId: "mortgage-payoff",
              categoryKey: "realEstateSecuredDebt",
              isMortgage: true,
              treatmentMode: "payoff",
              mortgageTreatmentMode: "payoff",
              included: true,
              treatedAmount: 80000
            },
            {
              debtFactId: "mortgage-support",
              categoryKey: "realEstateSecuredDebt",
              isMortgage: true,
              treatmentMode: "support",
              mortgageTreatmentMode: "support",
              included: true,
              treatedAmount: 36000,
              mortgageSupportAmount: 36000
            }
          ]
    }
  };
}

function createInput(options = {}) {
  return {
    eventDate: "2031-01-01",
    projectedWealthPoint: {
      date: "2031-01-01",
      monthIndex: 60
    },
    projectedAssetLedger: createProjectedAssetLedger(options),
    assetTreatmentAssumptions: createAssetTreatmentAssumptions(),
    existingCoverageTreatment: createExistingCoverageTreatment(),
    immediateObligations: createImmediateObligations(options),
    options: {}
  };
}

function runChecks() {
  const calculateHouseholdDeathEventAvailability = loadCalculator();
  assert.strictEqual(
    typeof calculateHouseholdDeathEventAvailability,
    "function",
    "engine exports calculateHouseholdDeathEventAvailability"
  );
  assertNoForbiddenConcepts();
  assert.match(helperSource, /calculateAssetTreatment/, "Layer 2 should use the existing asset treatment helper path");
  assert.doesNotMatch(helperSource, /taxDragPercent\s*\/\s*100/, "Layer 2 should not duplicate tax drag formula");
  assert.doesNotMatch(helperSource, /liquidity[A-Za-z]*Percent\s*\/\s*100/, "Layer 2 should not duplicate haircut formula");

  const baseline = calculateHouseholdDeathEventAvailability(createInput());
  const repeat = calculateHouseholdDeathEventAvailability(createInput());
  const serializedBaseline = JSON.stringify(baseline);
  assert.strictEqual(serializedBaseline, JSON.stringify(repeat), "output is deterministic");
  assert.deepStrictEqual(
    JSON.parse(serializedBaseline),
    JSON.parse(JSON.stringify(baseline)),
    "output is serializable"
  );

  assert.strictEqual(baseline.trace.calculationMethod, "household-death-event-availability-v1");
  assert.strictEqual(
    baseline.trace.assetTreatmentHelper,
    "LensApp.lensAnalysis.calculateAssetTreatment",
    "asset treatment helper is used"
  );

  const brokerageTreatment = baseline.assetTreatmentAtDeath.rows.find((row) => row.id === "brokerage");
  assert.strictEqual(brokerageTreatment.projectedValue, 150000, "Layer 1 projected value is the treatment base");
  assert.notStrictEqual(brokerageTreatment.projectedValue, 100000, "original current value is not the treatment base");
  assert.strictEqual(brokerageTreatment.taxDragPercent, 20, "tax drag applies at event conversion");
  assert.strictEqual(brokerageTreatment.liquidityHaircutPercent, 10, "liquidity haircut applies at event conversion");
  assertClose(brokerageTreatment.treatedValue, 108000, "tax and liquidity treatment apply to projected value");

  const excludedByTreatment = baseline.assetTreatmentAtDeath.rows.find((row) => row.id === "business");
  assert.strictEqual(excludedByTreatment.included, false, "excluded treatment asset is excluded");
  assert.strictEqual(excludedByTreatment.treatedValue, 0, "excluded treatment asset contributes zero");

  const excludedFromProjection = baseline.assetTreatmentAtDeath.rows.find((row) => row.id === "excluded-real-estate");
  assert.strictEqual(excludedFromProjection.treatmentStatus, "excluded-from-projection");
  assert.strictEqual(excludedFromProjection.treatedValue, 0, "projection-excluded asset contributes zero");

  const cashFlowTreatment = baseline.assetTreatmentAtDeath.rows.find((row) => row.id === "cashFlowContribution");
  assert.strictEqual(cashFlowTreatment.treatmentCategoryKey, "cashAndCashEquivalents");
  assert.strictEqual(cashFlowTreatment.treatedValue, 10000, "positive cash-flow contribution is handled as cash-like value");
  assert.strictEqual(
    baseline.trace.derivedCashFlowContribution.mode,
    "positive-cash-like-asset",
    "positive cash-flow contribution treatment is traced"
  );

  assert.strictEqual(baseline.assetTreatmentAtDeath.treatedAssetValue, 118000);
  assert.strictEqual(baseline.resources.survivorAvailableTreatedAssets, 118000);
  assert.strictEqual(
    baseline.existingCoverage.treatedCoverageAmount,
    400000,
    "treated existing coverage is added"
  );
  assert.strictEqual(baseline.existingCoverage.includedPolicyCount, 1);
  assert.strictEqual(baseline.existingCoverage.excludedPolicyCount, 1);
  assert.strictEqual(
    baseline.resources.existingCoverage,
    400000,
    "existing coverage is added once from treated coverage"
  );
  assert.notStrictEqual(
    baseline.resources.existingCoverage,
    600000,
    "pending/excluded raw coverage is not added"
  );
  assert.ok(
    baseline.existingCoverage.warnings.some((warning) => warning.code === "pending-coverage-excluded"),
    "coverage warnings are preserved"
  );

  assert.strictEqual(baseline.immediateObligations.finalExpenses, 50000, "final expenses subtract");
  assert.strictEqual(baseline.immediateObligations.transitionNeeds, 25000, "transition needs subtract");
  assert.strictEqual(baseline.immediateObligations.debtPayoff, 12000, "non-mortgage payoff subtracts");
  assert.strictEqual(baseline.immediateObligations.mortgagePayoff, 80000, "mortgage payoff subtracts when prepared as payoff");
  assert.strictEqual(
    baseline.immediateObligations.deferredMortgageSupport,
    36000,
    "mortgage support is deferred"
  );
  assert.ok(
    baseline.dataGaps.some((gap) => gap.code === "mortgage-support-deferred-from-immediate-obligations"),
    "mortgage support deferral is traced as a data gap"
  );
  assert.strictEqual(baseline.immediateObligations.totalImmediateObligations, 167000);
  assert.strictEqual(baseline.resources.totalResourcesBeforeObligations, 518000);
  assert.strictEqual(baseline.resources.resourcesAfterObligations, 351000);

  const negativeCashFlow = calculateHouseholdDeathEventAvailability(createInput({ negativeCashFlow: true }));
  const negativeCashFlowRow = negativeCashFlow.assetTreatmentAtDeath.rows.find((row) => row.id === "cashFlowContribution");
  assert.strictEqual(
    negativeCashFlowRow.treatmentStatus,
    "negative-deficit-adjustment",
    "negative cash-flow contribution is not treated as an asset"
  );
  assert.strictEqual(negativeCashFlowRow.treatedValue, 0);
  assert.strictEqual(
    negativeCashFlow.assetTreatmentAtDeath.cashFlowDeficitAdjustment,
    -5000,
    "negative cash-flow contribution is preserved as a deficit adjustment"
  );
  assert.strictEqual(
    negativeCashFlow.resources.survivorAvailableTreatedAssets,
    103000,
    "negative cash-flow contribution reduces available treated assets"
  );

  const aggregateOnly = calculateHouseholdDeathEventAvailability(createInput({ aggregateOnly: true }));
  assert.strictEqual(aggregateOnly.immediateObligations.debtPayoff, 0);
  assert.strictEqual(aggregateOnly.immediateObligations.mortgagePayoff, 0);
  assert.ok(
    aggregateOnly.dataGaps.some((gap) => gap.code === "missing-debt-row-trace-for-aggregate-payoff"),
    "aggregate-only debt creates a row-trace data gap instead of silently double-counting"
  );

  const missingHelperCalculator = loadCalculator({ withAssetTreatment: false });
  const missingHelperOutput = missingHelperCalculator(createInput());
  assert.strictEqual(missingHelperOutput.status, "partial", "Layer 2 runs standalone without helper");
  assert.ok(
    missingHelperOutput.dataGaps.some((gap) => gap.code === "missing-asset-treatment-helper"),
    "missing helper creates a data gap"
  );
}

runChecks();
console.log("household death-event availability v1 check passed");
