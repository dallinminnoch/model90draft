const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "..");
const helperPath = path.join(
  repoRoot,
  "app",
  "features",
  "lens-analysis",
  "household-wealth-projection-calculations.js"
);
const helperSource = fs.readFileSync(helperPath, "utf8");

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function assertClose(actual, expected, message, epsilon = 0.03) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function loadCalculator() {
  const context = {
    LensApp: {
      lensAnalysis: {}
    },
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return context.LensApp.lensAnalysis.calculateHouseholdWealthProjection;
}

function assertNoForbiddenConcepts() {
  [
    /\bdeath\b/i,
    /\bcoverage\b/i,
    /\bsurvivor\b/i,
    /\bchart\b/i,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\b/,
    /\bDOM\b/
  ].forEach(function (pattern) {
    assert.ok(
      !pattern.test(helperSource),
      `Layer 1 helper source should not contain ${pattern}`
    );
  });
}

function baseAssetLedger() {
  return [
    {
      id: "cash",
      categoryKey: "cash",
      label: "Cash",
      currentValue: 100000,
      treatedValue: 1000,
      taxDragPercent: 80,
      liquidityHaircutPercent: 80,
      includedInProjection: true,
      growthEligible: true,
      annualGrowthRate: 0.12,
      growthStatus: "method-active",
      sourcePaths: ["assetLedger.cash.currentValue"]
    },
    {
      id: "retirement",
      categoryKey: "retirement",
      label: "Retirement",
      currentValue: 50000,
      includedInProjection: true,
      growthEligible: true,
      annualGrowthRate: 0.06,
      growthStatus: "reporting-only",
      sourcePaths: ["assetLedger.retirement.currentValue"]
    },
    {
      id: "emergency",
      categoryKey: "emergencyFund",
      label: "Emergency Fund",
      currentValue: 10000,
      includedInProjection: true,
      growthEligible: false,
      annualGrowthRate: 0.2,
      growthStatus: "method-active",
      sourcePaths: ["assetLedger.emergency.currentValue"]
    },
    {
      id: "excluded-real-estate",
      categoryKey: "realEstate",
      label: "Real Estate",
      currentValue: 900000,
      includedInProjection: false,
      growthEligible: true,
      annualGrowthRate: 0.2,
      growthStatus: "method-active",
      sourcePaths: ["assetLedger.realEstate.currentValue"]
    }
  ];
}

function baseProjection(overrides = {}) {
  const calculateHouseholdWealthProjection = loadCalculator();
  return calculateHouseholdWealthProjection({
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    cadence: "monthly",
    assetLedger: baseAssetLedger(),
    incomeStreams: [
      {
        id: "net-income",
        label: "Net income",
        amount: 60000,
        frequency: "annual",
        status: "mature-net",
        sourcePaths: ["income.netAnnualIncome"]
      }
    ],
    expenseStreams: [
      {
        id: "essential",
        label: "Essential expenses",
        amount: 3000,
        frequency: "monthly",
        category: "household",
        expenseType: "essential",
        status: "active",
        sourcePaths: ["expenses.essentialMonthly"]
      },
      {
        id: "discretionary",
        label: "Discretionary expenses",
        amount: 1000,
        frequency: "monthly",
        category: "personal",
        expenseType: "discretionary",
        status: "active",
        sourcePaths: ["expenses.discretionaryMonthly"]
      }
    ],
    scheduledObligations: [],
    options: {
      allowNegativeAssets: true,
      growthMode: "activeEligibleOnly",
      cashFlowTiming: "growth-first-then-cash-flow"
    },
    ...overrides
  });
}

function calculateExpectedCashGrowth() {
  const monthlyRate = Math.pow(1 + 0.12, 1 / 12) - 1;
  let cashValue = 100000;
  let totalGrowth = 0;
  for (let month = 0; month < 12; month += 1) {
    const growth = roundMoney(cashValue * monthlyRate);
    cashValue = roundMoney(cashValue + growth);
    totalGrowth = roundMoney(totalGrowth + growth);
  }
  return {
    cashValue,
    totalGrowth
  };
}

function runChecks() {
  const calculateHouseholdWealthProjection = loadCalculator();
  assert.strictEqual(
    typeof calculateHouseholdWealthProjection,
    "function",
    "engine exports calculateHouseholdWealthProjection"
  );
  assertNoForbiddenConcepts();

  const baseline = baseProjection();
  const repeat = baseProjection();
  const serializedBaseline = JSON.stringify(baseline);
  assert.strictEqual(serializedBaseline, JSON.stringify(repeat), "output is deterministic");
  assert.deepStrictEqual(
    JSON.parse(serializedBaseline),
    JSON.parse(JSON.stringify(baseline)),
    "output is serializable"
  );

  assert.strictEqual(baseline.status, "complete", "baseline projection completes");
  assert.strictEqual(baseline.durationMonths, 12, "monthly projection duration is 12");
  assert.strictEqual(
    baseline.summary.startingAssets,
    160000,
    "current asset values feed starting assets"
  );
  assert.ok(
    baseline.summary.startingAssets !== 1000,
    "treated values do not replace current asset values"
  );

  const firstPointCash = baseline.points[0].assetLedger.find((row) => row.id === "cash");
  assert.strictEqual(
    JSON.stringify(Array.from(firstPointCash.trace.ignoredMetadata).sort()),
    JSON.stringify(["liquidityHaircutPercent", "taxDragPercent"].sort()),
    "tax drag and liquidity haircut metadata are retained only as ignored metadata"
  );

  assert.ok(
    !baseline.summary.startingAssets.toString().includes("900000"),
    "excluded asset value does not contribute"
  );
  assert.ok(
    baseline.trace.excludedAssetCategories.includes("realEstate"),
    "excluded asset category is traced"
  );

  const firstPointEmergency = baseline.points[0].assetLedger.find((row) => row.id === "emergency");
  const lastPointEmergency = baseline.points.at(-1).assetLedger.find((row) => row.id === "emergency");
  assert.strictEqual(firstPointEmergency.currentValue, 10000, "ineligible asset starts from current value");
  assert.strictEqual(lastPointEmergency.currentValue, 10000, "ineligible asset does not grow");
  assert.ok(
    baseline.trace.growthIneligibleCategories.includes("emergencyFund"),
    "growth-ineligible asset category is traced"
  );

  const firstPointRetirement = baseline.points[0].assetLedger.find((row) => row.id === "retirement");
  const lastPointRetirement = baseline.points.at(-1).assetLedger.find((row) => row.id === "retirement");
  assert.strictEqual(firstPointRetirement.currentValue, 50000, "reporting-only asset starts from current value");
  assert.strictEqual(lastPointRetirement.currentValue, 50000, "reporting-only growth does not activate");
  assert.ok(
    baseline.trace.reportingOnlyOrSavedOnlyGrowthCategoriesIgnored.includes("retirement"),
    "reporting-only growth category is traced as ignored"
  );

  const expectedGrowth = calculateExpectedCashGrowth();
  const lastPointCash = baseline.points.at(-1).assetLedger.find((row) => row.id === "cash");
  assertClose(lastPointCash.currentValue, expectedGrowth.cashValue, "active eligible growth compounds monthly");
  assertClose(
    baseline.summary.totalInvestmentGrowth,
    expectedGrowth.totalGrowth,
    "total investment growth matches monthly compounding"
  );

  assert.strictEqual(baseline.summary.totalIncome, 60000, "annual income converts to monthly total");
  assert.strictEqual(baseline.summary.totalEssentialExpenses, 36000, "essential expenses reduce cash flow");
  assert.strictEqual(baseline.summary.totalDiscretionaryExpenses, 12000, "discretionary expenses reduce cash flow");
  assert.strictEqual(baseline.summary.totalNetCashFlow, 12000, "net cash flow includes income less expenses");
  assertClose(
    baseline.summary.endingAssets,
    expectedGrowth.cashValue + 50000 + 10000 + 12000,
    "income surplus increases ending assets"
  );

  const noDiscretionary = baseProjection({
    expenseStreams: [
      {
        id: "essential",
        label: "Essential expenses",
        amount: 3000,
        frequency: "monthly",
        expenseType: "essential",
        status: "active"
      }
    ]
  });
  assertClose(
    noDiscretionary.summary.endingAssets - baseline.summary.endingAssets,
    12000,
    "discretionary expenses reduce ending assets"
  );

  const deficit = baseProjection({
    incomeStreams: [
      {
        id: "net-income",
        label: "Net income",
        amount: 1000,
        frequency: "monthly",
        status: "mature-net"
      }
    ],
    expenseStreams: [
      {
        id: "essential",
        label: "Essential expenses",
        amount: 4000,
        frequency: "monthly",
        expenseType: "essential",
        status: "active"
      }
    ]
  });
  assert.ok(
    deficit.summary.endingAssets < baseline.summary.endingAssets,
    "income deficit decreases ending assets"
  );
  assert.strictEqual(deficit.summary.totalNetCashFlow, -36000, "deficit cash flow is retained");

  const scheduled = baseProjection({
    startDate: "2026-01-01",
    endDate: "2026-07-01",
    incomeStreams: [],
    expenseStreams: [],
    scheduledObligations: [
      {
        id: "loan",
        label: "Loan",
        amount: 500,
        frequency: "monthly",
        startDate: "2026-03-01",
        endDate: "2026-05-01",
        category: "loan",
        status: "active",
        sourcePaths: ["debts.loan.payment"]
      }
    ]
  });
  assert.strictEqual(
    scheduled.summary.totalScheduledObligations,
    1500,
    "scheduled obligations reduce ending assets only during active months"
  );

  const grossOnly = baseProjection({
    incomeStreams: [
      {
        id: "gross-income",
        label: "Gross income",
        amount: 120000,
        frequency: "annual",
        status: "gross",
        sourcePaths: ["income.grossAnnualIncome"]
      }
    ],
    expenseStreams: []
  });
  assert.strictEqual(grossOnly.summary.totalIncome, 0, "gross income is not used as spendable income");
  assert.ok(
    grossOnly.dataGaps.some((gap) => gap.code === "unsafe-gross-income-excluded"),
    "gross income creates a data gap"
  );
  assert.ok(
    grossOnly.dataGaps.some((gap) => gap.code === "missing-mature-net-income"),
    "missing mature net income is traced"
  );

  const negative = calculateHouseholdWealthProjection({
    startDate: "2026-01-01",
    endDate: "2026-03-01",
    cadence: "monthly",
    assetLedger: [
      {
        id: "cash",
        categoryKey: "cash",
        currentValue: 1000,
        includedInProjection: true,
        growthEligible: false,
        growthStatus: "method-active"
      }
    ],
    incomeStreams: [],
    expenseStreams: [
      {
        id: "essential",
        amount: 2000,
        frequency: "monthly",
        expenseType: "essential",
        status: "active"
      }
    ],
    scheduledObligations: [],
    options: {
      allowNegativeAssets: true,
      growthMode: "activeEligibleOnly",
      cashFlowTiming: "growth-first-then-cash-flow"
    }
  });
  assert.strictEqual(negative.summary.endingAssets, -3000, "negative assets are preserved");

  assert.strictEqual(
    baseline.trace.projectionMethod,
    "monthly-household-wealth-v1",
    "trace exposes projection method"
  );
  assert.strictEqual(
    baseline.trace.cashFlowTiming,
    "growth-first-then-cash-flow",
    "trace exposes cash-flow timing"
  );
  assert.strictEqual(
    baseline.trace.growthMode,
    "activeEligibleOnly",
    "trace exposes growth mode"
  );
}

runChecks();
console.log("household wealth projection v1 check passed");
