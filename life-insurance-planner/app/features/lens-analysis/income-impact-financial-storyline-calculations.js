(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "financial-storyline-candidates-v1";
  const SOURCE = "income-impact-financial-storyline-calculations";
  const MAX_MAJOR_STORY_CANDIDATES = 6;
  const MAX_MAJOR_GRAPH_DOT_CANDIDATES = 6;
  const MAX_MICRO_GRAPH_DOT_CANDIDATES = 10;
  const MAX_GRAPH_DOT_CANDIDATES = MAX_MAJOR_GRAPH_DOT_CANDIDATES + MAX_MICRO_GRAPH_DOT_CANDIDATES;
  const SELECTOR_POLICY_VERSION = "storyline-selector-v1";

  const EVIDENCE_LEVELS = Object.freeze({
    calculated: "calculated",
    traceBacked: "trace-backed",
    assumptionBacked: "assumption-backed",
    estimated: "estimated",
    insufficientData: "insufficient-data",
    dataGap: "data-gap",
    displayOnly: "display-only",
    waterfallNeeded: "waterfall-needed",
    riskModelNeeded: "risk-model-needed",
    unsupported: "unsupported",
    deferred: "deferred"
  });

  const STATUSES = Object.freeze({
    safeNow: "safe-now",
    caution: "caution",
    deferred: "deferred",
    unsupported: "unsupported"
  });

  const EVENT_FAMILIES = Object.freeze({
    trigger: "trigger",
    coverage: "coverage",
    gap: "gap",
    obligations: "obligations",
    mortgage: "mortgage",
    income: "income",
    runway: "runway",
    unmetNeed: "unmet-need",
    dataQuality: "data-quality",
    cashWaterfall: "cash-waterfall",
    educationWaterfall: "education-waterfall",
    retirementWaterfall: "retirement-waterfall",
    housingRisk: "housing-risk",
    vehicleRisk: "vehicle-risk",
    debtRisk: "debt-risk",
    lifestyleRisk: "lifestyle-risk",
    careRisk: "care-risk"
  });

  const STORY_EVENT_ROLES = Object.freeze({
    emotional: "emotional",
    mechanical: "mechanical",
    detail: "detail",
    dataGap: "data-gap"
  });

  const MECHANICAL_DETAIL_EVENT_IDS = Object.freeze([
    "coverage-proceeds-applied",
    "life-insurance-proceeds-applied",
    "coverage-not-counted",
    "final-expenses-paid",
    "medical-final-expenses-paid",
    "transition-needs-paid",
    "immediate-obligations-paid",
    "debt-payoff-consumes-liquidity",
    "mortgage-is-paid-off",
    "mortgage-paid-off",
    "survivor-income-helps-offset-need",
    "survivor-runway-begins",
    "monthly-support-need-begins",
    "healthcare-costs-reduce-runway"
  ]);

  const EMOTIONAL_VISIBLE_EVENT_IDS = Object.freeze([
    "death-income-stops",
    "survivor-income-not-enough-alone",
    "cash-savings-depleted",
    "checking-savings-depleted",
    "emergency-fund-depleted",
    "liquid-investments-depleted",
    "taxable-assets-depleted",
    "education-funding-remains-protected",
    "education-funding-may-be-redirected",
    "education-funding-at-risk",
    "education-savings-depleted",
    "dependent-support-gap",
    "dependent-support-gap-begins",
    "childcare-support-at-risk",
    "retirement-assets-stay-intact",
    "retirement-assets-next-in-line",
    "retirement-assets-tapped",
    "retirement-assets-depleted",
    "housing-costs-begin-pressuring-plan",
    "housing-stability-at-risk",
    "housing-costs-become-unsupported",
    "mortgage-payment-pressure-begins",
    "mortgage-payment-at-risk",
    "mortgage-payment-becomes-unsupported",
    "rent-payment-pressure-begins",
    "rent-payment-at-risk",
    "rent-payment-becomes-unsupported",
    "vehicle-payment-at-risk",
    "transportation-stability-at-risk",
    "minimum-debt-payments-compete-with-expenses",
    "minimum-debt-payments-become-unsupported",
    "lifestyle-cuts-begin",
    "essential-needs-become-unfunded",
    "care-expenses-become-unfunded",
    "resources-run-out",
    "monthly-support-gap-begins",
    "unfunded-need-accumulates"
  ]);

  const SAFE_EVENT_DEFINITIONS = Object.freeze([
    {
      id: "death-income-stops",
      family: EVENT_FAMILIES.trigger,
      displayLabel: "Death & Income Stops",
      graphLabel: "Death",
      cardTitle: "Death & Income Stops",
      description: "The selected death event starts the survivor resources timeline.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.traceBacked,
      priority: 0,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 1,
      emotionalWeight: 0.72,
      advisorUsefulness: 1
    },
    {
      id: "life-insurance-proceeds-applied",
      family: EVENT_FAMILIES.coverage,
      displayLabel: "Life Insurance Proceeds Applied",
      graphLabel: "Coverage applied",
      cardTitle: "Life Insurance Proceeds Applied",
      description: "Existing coverage is included in the immediate resources available at death.",
      severity: "positive",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 10,
      eligibleForGraphDot: false,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 1,
      emotionalWeight: 0.56,
      advisorUsefulness: 0.92
    },
    {
      id: "coverage-extends-runway",
      family: EVENT_FAMILIES.coverage,
      displayLabel: "Coverage Extends the Runway",
      graphLabel: "Coverage extends",
      cardTitle: "Coverage Extends the Runway",
      description: "Existing coverage materially increases runway duration compared with the same scenario without coverage.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 74,
      storyRole: STORY_EVENT_ROLES.detail,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.48,
      advisorUsefulness: 0.88
    },
    {
      id: "coverage-runs-out-before-needs-end",
      family: EVENT_FAMILIES.coverage,
      displayLabel: "Coverage Runs Out Before Needs End",
      graphLabel: "Coverage runs out",
      cardTitle: "Coverage Runs Out Before Needs End",
      description: "The with-coverage scenario still exhausts resources before the modeled need horizon ends.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 75,
      storyRole: STORY_EVENT_ROLES.detail,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.9
    },
    {
      id: "protection-gap-appears-immediately",
      family: EVENT_FAMILIES.gap,
      displayLabel: "Protection Gap Appears Immediately",
      graphLabel: "Protection gap",
      cardTitle: "Protection Gap Appears Immediately",
      description: "The current scenario still shows a shortfall after available resources and income are considered.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 20,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 1,
      emotionalWeight: 0.7,
      advisorUsefulness: 0.95
    },
    {
      id: "immediate-obligations-paid",
      family: EVENT_FAMILIES.obligations,
      displayLabel: "Immediate Obligations Are Paid",
      graphLabel: "Obligations paid",
      cardTitle: "Immediate Obligations Are Paid",
      description: "Prepared immediate obligations reduce available liquidity at the death event.",
      severity: "info",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 30,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.84,
      emotionalWeight: 0.5,
      advisorUsefulness: 0.88
    },
    {
      id: "final-expenses-paid",
      family: EVENT_FAMILIES.obligations,
      displayLabel: "Final Expenses Are Paid",
      graphLabel: "Final expenses",
      cardTitle: "Final Expenses Are Paid",
      description: "Final expense funding is separately present in the immediate obligation source.",
      severity: "info",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 34,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.82,
      emotionalWeight: 0.48,
      advisorUsefulness: 0.84
    },
    {
      id: "debt-payoff-consumes-liquidity",
      family: EVENT_FAMILIES.obligations,
      displayLabel: "Debt Payoff Consumes Liquidity",
      graphLabel: "Debt payoff",
      cardTitle: "Debt Payoff Consumes Liquidity",
      description: "A separately calculated debt payoff amount reduces immediate survivor resources.",
      severity: "info",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 38,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.8,
      emotionalWeight: 0.54,
      advisorUsefulness: 0.86
    },
    {
      id: "mortgage-is-paid-off",
      family: EVENT_FAMILIES.mortgage,
      displayLabel: "Mortgage Is Paid Off",
      graphLabel: "Mortgage payoff",
      cardTitle: "Mortgage Is Paid Off",
      description: "The selected mortgage treatment resolves to paying off the mortgage at death.",
      severity: "info",
      evidenceLevel: EVIDENCE_LEVELS.assumptionBacked,
      priority: 42,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.5,
      advisorUsefulness: 0.8
    },
    {
      id: "housing-costs-remain-covered",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Housing Costs Remain Covered",
      graphLabel: "Housing covered",
      cardTitle: "Housing Costs Remain Covered",
      description: "The survivor runway baseline remains covered with housing included.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 44,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.76,
      emotionalWeight: 0.48,
      advisorUsefulness: 0.82
    },
    {
      id: "housing-costs-begin-pressuring-plan",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Housing Costs Begin Pressuring the Plan",
      graphLabel: "Housing pressure",
      cardTitle: "Housing Costs Begin Pressuring the Plan",
      description: "The survivor runway baseline with housing becomes unsupported after 24 months.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 58,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.84
    },
    {
      id: "housing-stability-at-risk",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Housing Stability Is At Risk",
      graphLabel: "Housing at risk",
      cardTitle: "Housing Stability Is At Risk",
      description: "The survivor runway baseline with housing becomes unsupported within 13 to 24 months.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 63,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.9
    },
    {
      id: "housing-costs-become-unsupported",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Housing Costs Become Unsupported",
      graphLabel: "Housing unsupported",
      cardTitle: "Housing Costs Become Unsupported",
      description: "The survivor runway baseline with housing becomes unsupported within 12 months.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.72,
      advisorUsefulness: 0.92
    },
    {
      id: "mortgage-payment-stays-current",
      family: EVENT_FAMILIES.mortgage,
      displayLabel: "Mortgage Payment Stays Current",
      graphLabel: "Mortgage current",
      cardTitle: "Mortgage Payment Stays Current",
      description: "The survivor runway baseline remains covered with the mortgage payment included.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 44,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.76,
      emotionalWeight: 0.48,
      advisorUsefulness: 0.82
    },
    {
      id: "mortgage-payment-pressure-begins",
      family: EVENT_FAMILIES.mortgage,
      displayLabel: "Mortgage Payment Pressure Begins",
      graphLabel: "Mortgage pressure",
      cardTitle: "Mortgage Payment Pressure Begins",
      description: "The survivor runway baseline with the mortgage payment becomes unsupported after 24 months.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 58,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.84
    },
    {
      id: "mortgage-payment-at-risk",
      family: EVENT_FAMILIES.mortgage,
      displayLabel: "Mortgage Payment Is At Risk",
      graphLabel: "Mortgage at risk",
      cardTitle: "Mortgage Payment Is At Risk",
      description: "The survivor runway baseline with the mortgage payment becomes unsupported within 13 to 24 months.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 62,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.9
    },
    {
      id: "mortgage-payment-becomes-unsupported",
      family: EVENT_FAMILIES.mortgage,
      displayLabel: "Mortgage Payment Becomes Unsupported",
      graphLabel: "Mortgage unsupported",
      cardTitle: "Mortgage Payment Becomes Unsupported",
      description: "The survivor runway baseline with the mortgage payment becomes unsupported within 12 months.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.72,
      advisorUsefulness: 0.92
    },
    {
      id: "rent-payment-stays-current",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Rent Payment Stays Current",
      graphLabel: "Rent current",
      cardTitle: "Rent Payment Stays Current",
      description: "The survivor runway baseline remains covered with the rent payment included.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 44,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.76,
      emotionalWeight: 0.48,
      advisorUsefulness: 0.82
    },
    {
      id: "rent-payment-pressure-begins",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Rent Payment Pressure Begins",
      graphLabel: "Rent pressure",
      cardTitle: "Rent Payment Pressure Begins",
      description: "The survivor runway baseline with the rent payment becomes unsupported after 24 months.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 59,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.84
    },
    {
      id: "rent-payment-at-risk",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Rent Payment Is At Risk",
      graphLabel: "Rent at risk",
      cardTitle: "Rent Payment Is At Risk",
      description: "The survivor runway baseline with the rent payment becomes unsupported within 13 to 24 months.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 62,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.9
    },
    {
      id: "rent-payment-becomes-unsupported",
      family: EVENT_FAMILIES.housingRisk,
      displayLabel: "Rent Payment Becomes Unsupported",
      graphLabel: "Rent unsupported",
      cardTitle: "Rent Payment Becomes Unsupported",
      description: "The survivor runway baseline with the rent payment becomes unsupported within 12 months.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.72,
      advisorUsefulness: 0.92
    },
    {
      id: "survivor-income-helps-offset-need",
      family: EVENT_FAMILIES.income,
      displayLabel: "Survivor Income Helps Offset Need",
      graphLabel: "Income offset",
      cardTitle: "Survivor Income Helps Offset Need",
      description: "Survivor income is included as an offset in the post-death runway.",
      severity: "positive",
      evidenceLevel: EVIDENCE_LEVELS.traceBacked,
      priority: 50,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.7,
      emotionalWeight: 0.42,
      advisorUsefulness: 0.78
    },
    {
      id: "survivor-income-not-enough-alone",
      family: EVENT_FAMILIES.gap,
      displayLabel: "Survivor Income Is Not Enough Alone",
      graphLabel: "Income gap",
      cardTitle: "Survivor Income Is Not Enough Alone",
      description: "Survivor income exists, but the scenario still shows a support gap.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 54,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.62,
      advisorUsefulness: 0.9
    },
    {
      id: "spending-begins-to-compress",
      family: EVENT_FAMILIES.lifestyleRisk,
      displayLabel: "Spending Begins to Compress",
      graphLabel: "Spending compresses",
      cardTitle: "Spending Begins to Compress",
      description: "Auto-compression reduces modeled survivor expenses below the baseline.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 72,
      storyRole: STORY_EVENT_ROLES.detail,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.62,
      emotionalWeight: 0.4,
      advisorUsefulness: 0.78
    },
    {
      id: "survivor-income-begins",
      family: EVENT_FAMILIES.income,
      displayLabel: "Survivor Income Begins",
      graphLabel: "Income begins",
      cardTitle: "Survivor Income Begins",
      description: "Enabled survivor income starts after a modeled post-death delay.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.traceBacked,
      priority: 73,
      storyRole: STORY_EVENT_ROLES.detail,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.66,
      emotionalWeight: 0.42,
      advisorUsefulness: 0.82
    },
    {
      id: "survivor-runway-begins",
      family: EVENT_FAMILIES.runway,
      displayLabel: "Survivor Runway Begins",
      graphLabel: "Runway begins",
      cardTitle: "Survivor Runway Begins",
      description: "The post-death resource runway begins from calculated available resources.",
      severity: "info",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 60,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.74,
      emotionalWeight: 0.44,
      advisorUsefulness: 0.86
    },
    {
      id: "resources-run-out",
      family: EVENT_FAMILIES.runway,
      displayLabel: "Resources Run Out",
      graphLabel: "Runs out",
      cardTitle: "Resources Run Out",
      description: "The selected scenario has a calculated depletion point.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 70,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.96,
      emotionalWeight: 0.82,
      advisorUsefulness: 0.96
    },
    {
      id: "ninety-day-cash-window-covered",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "90-Day Cash Window Is Covered",
      graphLabel: "90-day covered",
      cardTitle: "90-Day Cash Window Is Covered",
      description: "Fast-access cash resources cover at least 1.25x the first 90 days of transition need.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 48,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.56,
      advisorUsefulness: 0.9
    },
    {
      id: "ninety-day-cash-window-tight",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "90-Day Cash Window Is Tight",
      graphLabel: "90-day tight",
      cardTitle: "90-Day Cash Window Is Tight",
      description: "Fast-access cash resources cover 1.00x to 1.24x the first 90 days of transition need.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 48,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.62,
      advisorUsefulness: 0.92
    },
    {
      id: "ninety-day-cash-window-short",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "90-Day Cash Window Is Short",
      graphLabel: "90-day short",
      cardTitle: "90-Day Cash Window Is Short",
      description: "Fast-access cash resources cover 0.50x to 0.99x the first 90 days of transition need.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 48,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.94
    },
    {
      id: "ninety-day-cash-window-underfunded",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "90-Day Cash Window Is Underfunded",
      graphLabel: "90-day underfunded",
      cardTitle: "90-Day Cash Window Is Underfunded",
      description: "Fast-access cash resources cover less than 0.50x the first 90 days of transition need.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 48,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.94,
      emotionalWeight: 0.72,
      advisorUsefulness: 0.95
    },
    {
      id: "cash-reserve-holds",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Cash Reserve Holds",
      graphLabel: "Cash holds",
      cardTitle: "Cash Reserve Holds",
      description: "Ordinary cash carries the runway without touching the emergency fund or deeper liquid buckets.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 49,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.86,
      emotionalWeight: 0.56,
      advisorUsefulness: 0.88
    },
    {
      id: "cash-reserve-begins-declining",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Cash Reserve Begins Declining",
      graphLabel: "Cash declining",
      cardTitle: "Cash Reserve Begins Declining",
      description: "Ordinary cash is the first liquidity bucket used by the canonical runway waterfall.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 51,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.84,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.86
    },
    {
      id: "cash-reserve-nearly-depleted",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Cash Reserve Is Nearly Depleted",
      graphLabel: "Cash nearly depleted",
      cardTitle: "Cash Reserve Is Nearly Depleted",
      description: "Ordinary cash falls below three months of reliable monthly burn.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 52,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.92
    },
    {
      id: "cash-reserve-depleted",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Cash Reserve Is Depleted",
      graphLabel: "Cash depleted",
      cardTitle: "Cash Reserve Is Depleted",
      description: "Ordinary cash falls below one month of reliable monthly burn.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 53,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.74,
      advisorUsefulness: 0.95
    },
    {
      id: "emergency-fund-used",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Emergency Fund Is Used",
      graphLabel: "Emergency used",
      cardTitle: "Emergency Fund Is Used",
      description: "The canonical runway waterfall begins using the emergency fund after ordinary cash.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 54,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.86,
      emotionalWeight: 0.58,
      advisorUsefulness: 0.9
    },
    {
      id: "emergency-fund-nearly-depleted",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Emergency Fund Is Nearly Depleted",
      graphLabel: "Emergency nearly depleted",
      cardTitle: "Emergency Fund Is Nearly Depleted",
      description: "The emergency fund falls below three months of reliable monthly burn.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 55,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.72,
      advisorUsefulness: 0.95
    },
    {
      id: "emergency-fund-depleted",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Emergency Fund Is Depleted",
      graphLabel: "Emergency depleted",
      cardTitle: "Emergency Fund Is Depleted",
      description: "The emergency fund falls below one month of reliable monthly burn.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 56,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.94,
      emotionalWeight: 0.78,
      advisorUsefulness: 0.96
    },
    {
      id: "taxable-investments-tapped",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Taxable Investments Are Tapped",
      graphLabel: "Taxable tapped",
      cardTitle: "Taxable Investments Are Tapped",
      description: "The canonical runway waterfall begins using taxable brokerage or non-retirement taxable investments.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 57,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.82,
      emotionalWeight: 0.58,
      advisorUsefulness: 0.88
    },
    {
      id: "taxable-investments-nearly-depleted",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Taxable Investments Are Nearly Depleted",
      graphLabel: "Taxable nearly depleted",
      cardTitle: "Taxable Investments Are Nearly Depleted",
      description: "Taxable brokerage or non-retirement taxable investments fall below three months of reliable monthly burn.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 58,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.86,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.92
    },
    {
      id: "taxable-investments-depleted",
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: "Taxable Investments Are Depleted",
      graphLabel: "Taxable depleted",
      cardTitle: "Taxable Investments Are Depleted",
      description: "Taxable brokerage or non-retirement taxable investments fall below one month of reliable monthly burn.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 59,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.74,
      advisorUsefulness: 0.94
    },
    {
      id: "education-funding-remains-protected",
      family: EVENT_FAMILIES.educationWaterfall,
      displayLabel: "Education Funding Remains Protected",
      graphLabel: "Education protected",
      cardTitle: "Education Funding Remains Protected",
      description: "Education savings assets exist and are not used by the canonical runway waterfall.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 60,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.86
    },
    {
      id: "education-funding-may-be-redirected",
      family: EVENT_FAMILIES.educationWaterfall,
      displayLabel: "Education Funding May Be Redirected",
      graphLabel: "Education next",
      cardTitle: "Education Funding May Be Redirected",
      description: "Education savings assets are allowed by treatment assumptions and are next in the canonical runway waterfall, but have not been tapped.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 60,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.82,
      emotionalWeight: 0.58,
      advisorUsefulness: 0.88
    },
    {
      id: "education-funding-at-risk",
      family: EVENT_FAMILIES.educationWaterfall,
      displayLabel: "Education Funding Is At Risk",
      graphLabel: "Education at risk",
      cardTitle: "Education Funding Is At Risk",
      description: "The canonical runway waterfall begins using education savings assets.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 60,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.86,
      emotionalWeight: 0.66,
      advisorUsefulness: 0.9
    },
    {
      id: "education-savings-depleted",
      family: EVENT_FAMILIES.educationWaterfall,
      displayLabel: "Education Savings Are Depleted",
      graphLabel: "Education depleted",
      cardTitle: "Education Savings Are Depleted",
      description: "The education savings bucket is fully used by the canonical runway waterfall.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 61,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.74,
      advisorUsefulness: 0.94
    },
    {
      id: "retirement-assets-stay-intact",
      family: EVENT_FAMILIES.retirementWaterfall,
      displayLabel: "Retirement Assets Stay Intact",
      graphLabel: "Retirement intact",
      cardTitle: "Retirement Assets Stay Intact",
      description: "Retirement assets are allowed by treatment assumptions and remain unused through the modeled horizon.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.52,
      advisorUsefulness: 0.86
    },
    {
      id: "retirement-assets-next-in-line",
      family: EVENT_FAMILIES.retirementWaterfall,
      displayLabel: "Retirement Assets Are Next in Line",
      graphLabel: "Retirement next",
      cardTitle: "Retirement Assets Are Next in Line",
      description: "Retirement assets are the next available bucket in the canonical runway waterfall but have not been tapped.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.82,
      emotionalWeight: 0.58,
      advisorUsefulness: 0.88
    },
    {
      id: "retirement-assets-tapped",
      family: EVENT_FAMILIES.retirementWaterfall,
      displayLabel: "Retirement Assets Are Tapped",
      graphLabel: "Retirement tapped",
      cardTitle: "Retirement Assets Are Tapped",
      description: "The canonical runway waterfall begins using retirement assets.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.88,
      emotionalWeight: 0.68,
      advisorUsefulness: 0.92
    },
    {
      id: "retirement-assets-depleted",
      family: EVENT_FAMILIES.retirementWaterfall,
      displayLabel: "Retirement Assets Are Depleted",
      graphLabel: "Retirement depleted",
      cardTitle: "Retirement Assets Are Depleted",
      description: "The retirement asset bucket is fully used by the canonical runway waterfall.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 66,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.76,
      advisorUsefulness: 0.94
    },
    {
      id: "required-debt-payments-covered",
      family: EVENT_FAMILIES.debtRisk,
      displayLabel: "Required Debt Payments Are Covered",
      graphLabel: "Debt covered",
      cardTitle: "Required Debt Payments Are Covered",
      description: "Active required debt payments remain covered through their scheduled payoff period or modeled horizon.",
      severity: "stable",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 62,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.78,
      emotionalWeight: 0.5,
      advisorUsefulness: 0.86
    },
    {
      id: "minimum-debt-payments-continue",
      family: EVENT_FAMILIES.debtRisk,
      displayLabel: "Minimum Debt Payments Continue",
      graphLabel: "Debt continues",
      cardTitle: "Minimum Debt Payments Continue",
      description: "Required minimum debt payments remain active during the survivor runway.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 63,
      storyRole: STORY_EVENT_ROLES.detail,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      lifeInsuranceRelevance: 0.72,
      emotionalWeight: 0.42,
      advisorUsefulness: 0.82
    },
    {
      id: "minimum-debt-payments-compete-with-expenses",
      family: EVENT_FAMILIES.debtRisk,
      displayLabel: "Minimum Debt Payments Compete With Expenses",
      graphLabel: "Debt pressure",
      cardTitle: "Minimum Debt Payments Compete With Expenses",
      description: "Required debt payments remain active within three months before final available resources run out.",
      severity: "at-risk",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 63,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.86,
      emotionalWeight: 0.66,
      advisorUsefulness: 0.92
    },
    {
      id: "minimum-debt-payments-become-unsupported",
      family: EVENT_FAMILIES.debtRisk,
      displayLabel: "Minimum Debt Payments Become Unsupported",
      graphLabel: "Debt unsupported",
      cardTitle: "Minimum Debt Payments Become Unsupported",
      description: "Required debt payments remain active after available survivor resources are exhausted.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 64,
      storyRole: STORY_EVENT_ROLES.emotional,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.9,
      emotionalWeight: 0.72,
      advisorUsefulness: 0.94
    },
    {
      id: "monthly-support-gap-begins",
      family: EVENT_FAMILIES.gap,
      displayLabel: "Monthly Support Gap Begins",
      graphLabel: "Support gap",
      cardTitle: "Monthly Support Gap Begins",
      description: "The scenario has a calculated recurring support gap.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 74,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.92,
      emotionalWeight: 0.7,
      advisorUsefulness: 0.94
    },
    {
      id: "unfunded-need-accumulates",
      family: EVENT_FAMILIES.unmetNeed,
      displayLabel: "Unfunded Need Accumulates",
      graphLabel: "Unfunded need",
      cardTitle: "Unfunded Need Accumulates",
      description: "The current scenario accumulates unmet need after available resources are exhausted.",
      severity: "critical",
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      priority: 80,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.98,
      emotionalWeight: 0.86,
      advisorUsefulness: 0.98
    },
    {
      id: "missing-data-limits-timeline",
      family: EVENT_FAMILIES.dataQuality,
      displayLabel: "Missing Data Limits the Timeline",
      graphLabel: "Data needed",
      cardTitle: "Missing Data Limits the Timeline",
      description: "Existing warnings or data gaps limit the confidence of the timeline.",
      severity: "caution",
      evidenceLevel: EVIDENCE_LEVELS.dataGap,
      priority: 90,
      eligibleForGraphDot: false,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.5,
      emotionalWeight: 0.34,
      advisorUsefulness: 0.88
    }
  ]);

  const DEFERRED_CANDIDATE_DEFINITIONS = Object.freeze([
    ["pre-death-saved-cash-used", EVENT_FAMILIES.cashWaterfall, "Pre-Death Saved Cash Used", EVIDENCE_LEVELS.waterfallNeeded],
    ["cash-savings-depleted", EVENT_FAMILIES.cashWaterfall, "Cash Savings Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["checking-savings-depleted", EVENT_FAMILIES.cashWaterfall, "Checking & Savings Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["emergency-fund-depleted", EVENT_FAMILIES.cashWaterfall, "Emergency Fund Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["liquid-investments-depleted", EVENT_FAMILIES.cashWaterfall, "Liquid Investments Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["taxable-assets-depleted", EVENT_FAMILIES.cashWaterfall, "Taxable Assets Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["dependent-support-gap-begins", EVENT_FAMILIES.careRisk, "Dependent Support Gap Begins", EVIDENCE_LEVELS.riskModelNeeded],
    ["childcare-support-at-risk", EVENT_FAMILIES.careRisk, "Childcare Support At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["home-equity-becomes-last-resort", EVENT_FAMILIES.housingRisk, "Home Equity Becomes Last Resort", EVIDENCE_LEVELS.waterfallNeeded],
    ["home-equity-depleted", EVENT_FAMILIES.housingRisk, "Home Equity Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["vehicle-payment-at-risk", EVENT_FAMILIES.vehicleRisk, "Vehicle Payment At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["transportation-stability-at-risk", EVENT_FAMILIES.vehicleRisk, "Transportation Stability At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["current-lifestyle-no-longer-sustainable", EVENT_FAMILIES.lifestyleRisk, "Current Lifestyle No Longer Sustainable", EVIDENCE_LEVELS.riskModelNeeded],
    ["lifestyle-cuts-begin", EVENT_FAMILIES.lifestyleRisk, "Lifestyle Cuts Begin", EVIDENCE_LEVELS.riskModelNeeded],
    ["essential-needs-become-unfunded", EVENT_FAMILIES.careRisk, "Essential Needs Become Unfunded", EVIDENCE_LEVELS.riskModelNeeded],
    ["healthcare-costs-reduce-runway", EVENT_FAMILIES.careRisk, "Healthcare Costs Reduce Runway", EVIDENCE_LEVELS.waterfallNeeded],
    ["care-expenses-become-unfunded", EVENT_FAMILIES.careRisk, "Care Expenses Become Unfunded", EVIDENCE_LEVELS.riskModelNeeded]
  ]).map(function (definition) {
    return Object.freeze({
      id: definition[0],
      family: definition[1],
      displayLabel: definition[2],
      graphLabel: definition[2],
      cardTitle: definition[2],
      description: "Deferred until a verified resource waterfall or risk model can support this event.",
      severity: "deferred",
      evidenceLevel: definition[3],
      status: STATUSES.deferred,
      storyRole: definition[3] === EVIDENCE_LEVELS.dataGap
        ? STORY_EVENT_ROLES.dataGap
        : includesValue(MECHANICAL_DETAIL_EVENT_IDS, definition[0])
          ? STORY_EVENT_ROLES.mechanical
          : includesValue(EMOTIONAL_VISIBLE_EVENT_IDS, definition[0])
            ? STORY_EVENT_ROLES.emotional
            : STORY_EVENT_ROLES.detail,
      safeToRender: false,
      eligibleForGraphDot: false,
      eligibleForMajorCard: false,
      timing: makeEmptyTiming("model-needed"),
      amount: makeEmptyAmount(),
      sources: [],
      confidence: 0,
      lifeInsuranceRelevance: 0.7,
      emotionalWeight: 0.7,
      advisorUsefulness: 0.7,
      suppressionKeys: ["model-needed"],
      deferredReason: definition[3] === EVIDENCE_LEVELS.waterfallNeeded
        ? "Requires a verified resource waterfall before it can be rendered."
        : "Requires a verified risk model before it can be rendered.",
      warnings: []
    });
  });

  const CANDIDATE_REGISTRY = Object.freeze({
    version: VERSION,
    safeNow: SAFE_EVENT_DEFINITIONS.map(clonePlainValue),
    deferred: DEFERRED_CANDIDATE_DEFINITIONS.map(clonePlainValue)
  });

  const ASSET_DEPLETION_LEDGER_EVENT_MAPPINGS = Object.freeze({
    "educationSavings:bucket-tapped": Object.freeze({
      candidateId: "education-funding-at-risk",
      priority: 60,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "educationSavings:bucket-depleted": Object.freeze({
      candidateId: "education-savings-depleted",
      priority: 61,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "retirementAssets:bucket-tapped": Object.freeze({
      candidateId: "retirement-assets-tapped",
      priority: 64,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "retirementAssets:bucket-depleted": Object.freeze({
      candidateId: "retirement-assets-depleted",
      priority: 66,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    })
  });

  const ASSET_BUCKET_STATE_RULES = Object.freeze({
    educationSavings: Object.freeze({
      family: "educationSavings",
      protectedId: "education-funding-remains-protected",
      nextId: "education-funding-may-be-redirected",
      tappedId: "education-funding-at-risk",
      depletedId: "education-savings-depleted",
      allowExcludedProtected: true,
      sourceLabel: "education savings"
    }),
    retirementAssets: Object.freeze({
      family: "retirementAssets",
      protectedId: "retirement-assets-stay-intact",
      nextId: "retirement-assets-next-in-line",
      tappedId: "retirement-assets-tapped",
      depletedId: "retirement-assets-depleted",
      allowExcludedProtected: false,
      sourceLabel: "retirement assets"
    })
  });

  const LEDGER_SUPPRESSED_VISIBLE_FAMILIES = Object.freeze([
    "existingCoverage",
    "homeEquity",
    "businessAssets",
    "unknown"
  ]);

  const HOUSING_RISK_EVENT_MAPPINGS = Object.freeze({
    "housing-costs-remain-covered": Object.freeze({
      candidateId: "housing-costs-remain-covered",
      priority: 43,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-costs-begin-pressuring-plan": Object.freeze({
      candidateId: "housing-costs-begin-pressuring-plan",
      priority: 58,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-stability-at-risk": Object.freeze({
      candidateId: "housing-stability-at-risk",
      priority: 63,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-costs-become-unsupported": Object.freeze({
      candidateId: "housing-costs-become-unsupported",
      priority: 64,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "mortgage-payment-stays-current": Object.freeze({
      candidateId: "mortgage-payment-stays-current",
      priority: 43,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "mortgage-payment-pressure-begins": Object.freeze({
      candidateId: "mortgage-payment-pressure-begins",
      priority: 58,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "mortgage-payment-at-risk": Object.freeze({
      candidateId: "mortgage-payment-at-risk",
      priority: 62,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "mortgage-payment-becomes-unsupported": Object.freeze({
      candidateId: "mortgage-payment-becomes-unsupported",
      priority: 64,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "rent-payment-stays-current": Object.freeze({
      candidateId: "rent-payment-stays-current",
      priority: 43,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "rent-payment-pressure-begins": Object.freeze({
      candidateId: "rent-payment-pressure-begins",
      priority: 59,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "rent-payment-at-risk": Object.freeze({
      candidateId: "rent-payment-at-risk",
      priority: 62,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "rent-payment-becomes-unsupported": Object.freeze({
      candidateId: "rent-payment-becomes-unsupported",
      priority: 64,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    })
  });

  const STORY_ROLES = Object.freeze({
    trigger: "trigger",
    insuranceContext: "insurance-context",
    liquidityCrisis: "liquidity-crisis",
    familyStability: "family-stability",
    longTermSacrifice: "long-term-sacrifice",
    supportFailure: "support-failure",
    dataQuality: "data-quality",
    other: "other"
  });

  const INSURANCE_CONTEXT_IDS = Object.freeze([
    "life-insurance-proceeds-applied",
    "immediate-obligations-paid",
    "final-expenses-paid",
    "debt-payoff-consumes-liquidity",
    "mortgage-is-paid-off"
  ]);

  const LIQUIDITY_CRISIS_IDS = Object.freeze([
    "pre-death-saved-cash-used",
    "emergency-fund-depleted",
    "cash-savings-depleted",
    "checking-savings-depleted",
    "liquid-investments-depleted",
    "taxable-assets-depleted"
  ]);

  const FAMILY_STABILITY_IDS = Object.freeze([
    "housing-costs-remain-covered",
    "housing-costs-begin-pressuring-plan",
    "housing-costs-become-unsupported",
    "mortgage-payment-stays-current",
    "mortgage-payment-pressure-begins",
    "mortgage-payment-at-risk",
    "mortgage-payment-becomes-unsupported",
    "rent-payment-stays-current",
    "rent-payment-at-risk",
    "rent-payment-becomes-unsupported",
    "housing-stability-at-risk",
    "rent-payment-pressure-begins",
    "education-savings-depleted",
    "education-funding-remains-protected",
    "education-funding-may-be-redirected",
    "education-funding-at-risk",
    "dependent-support-gap-begins",
    "childcare-support-at-risk"
  ]);

  const LONG_TERM_SACRIFICE_IDS = Object.freeze([
    "retirement-assets-stay-intact",
    "retirement-assets-next-in-line",
    "retirement-assets-tapped",
    "retirement-assets-depleted"
  ]);

  const SUPPORT_FAILURE_IDS = Object.freeze([
    "resources-run-out",
    "monthly-support-gap-begins",
    "unfunded-need-accumulates",
    "survivor-income-not-enough-alone",
    "survivor-runway-begins"
  ]);

  const DATA_QUALITY_IDS = Object.freeze([
    "survivor-income-unknown",
    "housing-risk-unknown",
    "coverage-details-missing",
    "asset-liquidity-unknown",
    "mortgage-details-missing",
    "education-timing-unknown",
    "data-gaps-limit-story",
    "missing-data-limits-timeline"
  ]);

  const MAJOR_STORY_TIERS = Object.freeze({
    locked: "locked",
    tier1: "tier-1",
    tier2: "tier-2",
    tier3: "tier-3",
    dataConfidence: "data-confidence",
    notMajor: "not-major"
  });

  const MAJOR_STORY_TIER_1_IDS = Object.freeze([
    "emergency-fund-depleted",
    "education-savings-depleted",
    "education-funding-at-risk",
    "retirement-assets-tapped",
    "retirement-assets-depleted",
    "mortgage-payment-at-risk",
    "mortgage-payment-becomes-unsupported",
    "rent-payment-at-risk",
    "rent-payment-becomes-unsupported",
    "housing-costs-become-unsupported",
    "essential-needs-become-unfunded",
    "monthly-support-gap-begins"
  ]);

  const MAJOR_STORY_TIER_2_IDS = Object.freeze([
    "cash-savings-depleted",
    "housing-stability-at-risk",
    "housing-costs-begin-pressuring-plan",
    "minimum-debt-payments-compete-with-expenses",
    "minimum-debt-payments-become-unsupported",
    "childcare-support-at-risk",
    "vehicle-payment-at-risk",
    "care-expenses-become-unfunded",
    "unfunded-need-accumulates"
  ]);

  const MAJOR_STORY_TIER_3_IDS = Object.freeze([
    "checking-savings-depleted",
    "liquid-investments-depleted",
    "taxable-assets-depleted",
    "education-funding-remains-protected",
    "education-funding-may-be-redirected",
    "dependent-support-gap",
    "dependent-support-gap-begins",
    "retirement-assets-stay-intact",
    "retirement-assets-next-in-line",
    "housing-costs-remain-covered",
    "mortgage-payment-stays-current",
    "mortgage-payment-pressure-begins",
    "rent-payment-stays-current",
    "rent-payment-pressure-begins",
    "transportation-stability-at-risk",
    "lifestyle-cuts-begin",
    "resources-run-out"
  ]);

  const MICRO_GRAPH_DOT_FAMILY_LIMIT = 3;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }
    if (isPlainObject(value)) {
      return Object.keys(value).reduce(function (next, key) {
        next[key] = clonePlainValue(value[key]);
        return next;
      }, {});
    }
    return value;
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const normalized = String(value).replace(/[$,%\s,]/g, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  }

  function getPath(source, path) {
    const normalizedPath = normalizeString(path);
    if (!normalizedPath) {
      return undefined;
    }
    return normalizedPath.split(".").reduce(function (current, key) {
      if (current == null) {
        return undefined;
      }
      if (Array.isArray(current) && /^\d+$/.test(key)) {
        return current[Number(key)];
      }
      return current[key];
    }, source);
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(normalizeString)
      .filter(Boolean)));
  }

  function compactObjects(values) {
    return (Array.isArray(values) ? values : []).filter(isPlainObject);
  }

  function makeWarning(code, message, sourcePaths, details) {
    const warning = {
      code,
      message
    };
    const paths = uniqueStrings(sourcePaths);
    if (paths.length) {
      warning.sourcePaths = paths;
    }
    if (isPlainObject(details)) {
      warning.details = clonePlainValue(details);
    }
    return warning;
  }

  function makeEmptyTiming(kind) {
    return {
      kind: kind || "not-modeled",
      monthOffset: null,
      date: null,
      label: "",
      sourcePath: ""
    };
  }

  function makeEmptyAmount() {
    return {
      value: null,
      label: "",
      sourcePath: ""
    };
  }

  function formatCurrencyLabel(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return "";
    }
    const rounded = Math.round(number);
    const sign = rounded < 0 ? "-" : "";
    return `${sign}$${Math.abs(rounded).toLocaleString("en-US")}`;
  }

  function firstNumberAtPath(rootSource, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const value = toOptionalNumber(getPath(rootSource, path));
      if (value != null) {
        return {
          value,
          sourcePath: path
        };
      }
    }
    return null;
  }

  function firstValueAtPath(rootSource, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const value = getPath(rootSource, path);
      if (value != null && value !== "") {
        return {
          value,
          sourcePath: path
        };
      }
    }
    return null;
  }

  function makeTiming(kind, config) {
    const safeConfig = isPlainObject(config) ? config : {};
    const monthOffset = toOptionalNumber(safeConfig.monthOffset);
    return {
      kind: kind || "event",
      monthOffset,
      date: normalizeString(safeConfig.date) || null,
      label: normalizeString(safeConfig.label),
      sourcePath: normalizeString(safeConfig.sourcePath)
    };
  }

  function makeAmount(config) {
    const safeConfig = isPlainObject(config) ? config : {};
    const value = toOptionalNumber(safeConfig.value);
    return {
      value,
      label: normalizeString(safeConfig.label) || formatCurrencyLabel(value),
      sourcePath: normalizeString(safeConfig.sourcePath)
    };
  }

  function makeCandidate(definition, overrides) {
    const safeDefinition = isPlainObject(definition) ? definition : {};
    const safeOverrides = isPlainObject(overrides) ? overrides : {};
    const evidenceLevel = safeOverrides.evidenceLevel || safeDefinition.evidenceLevel || EVIDENCE_LEVELS.traceBacked;
    const status = safeOverrides.status || safeDefinition.status || STATUSES.safeNow;
    const sourcePaths = uniqueStrings(safeOverrides.sourcePaths);
    return {
      id: normalizeString(safeOverrides.id || safeDefinition.id),
      family: normalizeString(safeOverrides.family || safeDefinition.family),
      displayLabel: normalizeString(safeOverrides.displayLabel || safeDefinition.displayLabel),
      graphLabel: normalizeString(safeOverrides.graphLabel || safeDefinition.graphLabel || safeDefinition.displayLabel),
      cardTitle: normalizeString(safeOverrides.cardTitle || safeDefinition.cardTitle || safeDefinition.displayLabel),
      description: normalizeString(safeOverrides.description || safeDefinition.description),
      severity: normalizeString(safeOverrides.severity || safeDefinition.severity || "info"),
      evidenceLevel,
      status,
      storyRole: normalizeString(safeOverrides.storyRole || safeDefinition.storyRole)
        || resolveStoryRole({
          id: normalizeString(safeOverrides.id || safeDefinition.id),
          family: normalizeString(safeOverrides.family || safeDefinition.family),
          evidenceLevel
        }),
      eventCategory: normalizeString(safeOverrides.eventCategory || safeDefinition.eventCategory)
        || resolveStoryRole({
          id: normalizeString(safeOverrides.id || safeDefinition.id),
          family: normalizeString(safeOverrides.family || safeDefinition.family),
          evidenceLevel
        }),
      majorTier: normalizeString(safeOverrides.majorTier || safeDefinition.majorTier)
        || getMajorStoryTier({
          id: normalizeString(safeOverrides.id || safeDefinition.id),
          family: normalizeString(safeOverrides.family || safeDefinition.family),
          evidenceLevel
        }),
      safeToRender: safeOverrides.safeToRender != null ? safeOverrides.safeToRender === true : status === STATUSES.safeNow,
      eligibleForGraphDot: safeOverrides.eligibleForGraphDot != null ? safeOverrides.eligibleForGraphDot === true : safeDefinition.eligibleForGraphDot === true,
      eligibleForMajorCard: safeOverrides.eligibleForMajorCard != null ? safeOverrides.eligibleForMajorCard === true : safeDefinition.eligibleForMajorCard === true,
      timing: makeTiming(safeOverrides.timingKind || "event", safeOverrides.timing),
      amount: makeAmount(safeOverrides.amount),
      sources: sourcePaths.map(function (sourcePath) {
        return {
          sourcePath,
          evidenceLevel
        };
      }),
      confidence: toOptionalNumber(safeOverrides.confidence ?? safeDefinition.confidence) ?? (status === STATUSES.safeNow ? 0.84 : 0),
      lifeInsuranceRelevance: toOptionalNumber(safeOverrides.lifeInsuranceRelevance ?? safeDefinition.lifeInsuranceRelevance) ?? 0.5,
      emotionalWeight: toOptionalNumber(safeOverrides.emotionalWeight ?? safeDefinition.emotionalWeight) ?? 0.5,
      advisorUsefulness: toOptionalNumber(safeOverrides.advisorUsefulness ?? safeDefinition.advisorUsefulness) ?? 0.5,
      suppressionKeys: uniqueStrings(safeOverrides.suppressionKeys || safeDefinition.suppressionKeys),
      deferredReason: normalizeString(safeOverrides.deferredReason || safeDefinition.deferredReason),
      warnings: compactObjects(safeOverrides.warnings).map(clonePlainValue),
      priority: toOptionalNumber(safeOverrides.priority ?? safeDefinition.priority) ?? 999
    };
  }

  function findDefinition(id) {
    return SAFE_EVENT_DEFINITIONS.find(function (definition) {
      return definition.id === id;
    });
  }

  function findDeferredDefinition(id) {
    return DEFERRED_CANDIDATE_DEFINITIONS.find(function (definition) {
      return definition.id === id;
    });
  }

  function findAnyDefinition(id) {
    return findDefinition(id) || findDeferredDefinition(id);
  }

  function resolveStoryRole(candidate) {
    const id = normalizeString(candidate?.id);
    if (includesValue(MECHANICAL_DETAIL_EVENT_IDS, id)) {
      return STORY_EVENT_ROLES.mechanical;
    }
    if (
      includesValue(DATA_QUALITY_IDS, id)
      || candidate?.family === EVENT_FAMILIES.dataQuality
      || candidate?.evidenceLevel === EVIDENCE_LEVELS.dataGap
    ) {
      return STORY_EVENT_ROLES.dataGap;
    }
    if (includesValue(EMOTIONAL_VISIBLE_EVENT_IDS, id)) {
      return STORY_EVENT_ROLES.emotional;
    }
    return STORY_EVENT_ROLES.detail;
  }

  function getMajorStoryTier(candidate) {
    const id = normalizeString(candidate?.id);
    if (id === "death-income-stops") {
      return MAJOR_STORY_TIERS.locked;
    }
    if (includesValue(MAJOR_STORY_TIER_1_IDS, id)) {
      return MAJOR_STORY_TIERS.tier1;
    }
    if (includesValue(MAJOR_STORY_TIER_2_IDS, id)) {
      return MAJOR_STORY_TIERS.tier2;
    }
    if (includesValue(MAJOR_STORY_TIER_3_IDS, id)) {
      return MAJOR_STORY_TIERS.tier3;
    }
    if (includesValue(DATA_QUALITY_IDS, id) || candidate?.family === EVENT_FAMILIES.dataQuality) {
      return MAJOR_STORY_TIERS.dataConfidence;
    }
    return MAJOR_STORY_TIERS.notMajor;
  }

  function majorStoryTierScore(candidate) {
    switch (getMajorStoryTier(candidate)) {
      case MAJOR_STORY_TIERS.locked:
        return 1000;
      case MAJOR_STORY_TIERS.tier1:
        return 220;
      case MAJOR_STORY_TIERS.tier2:
        return 160;
      case MAJOR_STORY_TIERS.tier3:
        return 100;
      case MAJOR_STORY_TIERS.dataConfidence:
        return -60;
      default:
        return 0;
    }
  }

  function isVisibleStorylineCandidate(candidate) {
    const storyRole = normalizeString(candidate?.storyRole) || resolveStoryRole(candidate);
    return storyRole === STORY_EVENT_ROLES.emotional || storyRole === STORY_EVENT_ROLES.dataGap;
  }

  function getDeathTiming(rootSource) {
    const date = firstValueAtPath(rootSource, [
      "scenario.scenario.selectedDeathDate",
      "scenario.deathEvent.date",
      "graphModel.dates.deathDate",
      "selectedDeath.date"
    ]);
    return date
      ? makeTiming("death-event", {
          monthOffset: 0,
          date: date.value,
          label: "At death",
          sourcePath: date.sourcePath
        })
      : null;
  }

  function getDepletionTiming(rootSource) {
    const date = firstValueAtPath(rootSource, [
      "scenario.timelineFacts.depletionDate",
      "scenario.postDeathSeries.depletion.depletionDate",
      "scenario.postDeathSeries.depletion.date",
      "graphModel.series.appliedRunwayScenarios.0.depletionPoint.date"
    ]);
    const month = firstNumberAtPath(rootSource, [
      "scenario.postDeathSeries.depletion.depletionMonthIndex",
      "scenario.postDeathSeries.depletion.monthIndex",
      "scenario.postDeathSeries.depletion.monthsCovered",
      "scenario.timelineFacts.monthsCovered",
      "graphModel.series.appliedRunwayScenarios.0.depletionPoint.monthIndex"
    ]);
    if (!date && !month) {
      return null;
    }
    return makeTiming("month-offset", {
      monthOffset: month?.value ?? null,
      date: date?.value ?? null,
      label: "Runs out",
      sourcePath: date?.sourcePath || month?.sourcePath || ""
    });
  }

  function getRunwayStartTiming(rootSource) {
    const deathTiming = getDeathTiming(rootSource);
    return deathTiming || makeTiming("death-event", {
      monthOffset: 0,
      label: "Runway begins",
      sourcePath: "scenario.deathEvent"
    });
  }

  function getInputIssues(input) {
    const safeInput = isPlainObject(input) ? input : {};
    return []
      .concat(compactObjects(safeInput.warnings))
      .concat(compactObjects(safeInput.dataGaps))
      .concat(compactObjects(safeInput.scenario?.warnings))
      .concat(compactObjects(safeInput.scenario?.dataGaps))
      .concat(compactObjects(safeInput.riskEvaluation?.warnings))
      .concat(compactObjects(safeInput.riskEvaluation?.dataGaps))
      .concat(compactObjects(safeInput.graphModel?.warnings))
      .concat(compactObjects(safeInput.graphModel?.dataGaps));
  }

  function hasIssueSignal(input) {
    return getInputIssues(input).length > 0;
  }

  function getSupportGapAmount(rootSource) {
    return firstNumberAtPath(rootSource, [
      "financialRunway.annualShortfall",
      "scenario.postDeathSeries.layer3.summary.annualShortfall",
      "scenario.postDeathSeries.summary.annualShortfall",
      "scenario.timelineFacts.annualShortfall"
    ]);
  }

  function buildSafeCandidates(input, warnings) {
    const rootSource = isPlainObject(input) ? input : {};
    const candidates = [];
    const deathTiming = getDeathTiming(rootSource);
    if (!deathTiming) {
      warnings.push(makeWarning(
        "missing-death-event-storyline-input",
        "Death & Income Stops was not created because no selected death date or death event date was available.",
        ["scenario.scenario.selectedDeathDate", "scenario.deathEvent.date"]
      ));
    } else {
      candidates.push(makeCandidate(findDefinition("death-income-stops"), {
        timing: deathTiming,
        sourcePaths: [deathTiming.sourcePath],
        confidence: 0.94
      }));
    }

    const coverage = firstNumberAtPath(rootSource, [
      "scenario.timelineFacts.coverageAdded",
      "scenario.deathEvent.coverageAdded",
      "financialRunway.existingCoverage"
    ]);
    if (coverage && coverage.value > 0) {
      candidates.push(makeCandidate(findDefinition("life-insurance-proceeds-applied"), {
        timing: deathTiming || getRunwayStartTiming(rootSource),
        amount: {
          value: coverage.value,
          sourcePath: coverage.sourcePath
        },
        sourcePaths: [coverage.sourcePath]
      }));
    }

    const immediateObligations = firstNumberAtPath(rootSource, [
      "scenario.deathEvent.immediateObligations",
      "financialRunway.immediateObligations"
    ]);
    if (immediateObligations && immediateObligations.value > 0) {
      candidates.push(makeCandidate(findDefinition("immediate-obligations-paid"), {
        timing: deathTiming || getRunwayStartTiming(rootSource),
        amount: {
          value: immediateObligations.value,
          sourcePath: immediateObligations.sourcePath
        },
        sourcePaths: [immediateObligations.sourcePath]
      }));
    }

    const finalExpenses = firstNumberAtPath(rootSource, [
      "scenario.deathEvent.layer2.immediateObligations.finalExpenses.value",
      "scenario.deathEvent.layer2.resources.finalExpenses",
      "scenario.deathEvent.layer2.resources.finalExpenseAmount"
    ]);
    if (finalExpenses && finalExpenses.value > 0) {
      candidates.push(makeCandidate(findDefinition("final-expenses-paid"), {
        timing: deathTiming || getRunwayStartTiming(rootSource),
        amount: {
          value: finalExpenses.value,
          sourcePath: finalExpenses.sourcePath
        },
        sourcePaths: [finalExpenses.sourcePath]
      }));
    }

    const debtPayoff = firstNumberAtPath(rootSource, [
      "scenario.deathEvent.layer2.immediateObligations.debtPayoff.value",
      "scenario.deathEvent.layer2.resources.debtPayoff",
      "scenario.deathEvent.layer2.resources.treatedDebtPayoff",
      "scenario.deathEvent.layer2.resources.debtPayoffAmount"
    ]);
    if (debtPayoff && debtPayoff.value > 0) {
      candidates.push(makeCandidate(findDefinition("debt-payoff-consumes-liquidity"), {
        timing: deathTiming || getRunwayStartTiming(rootSource),
        amount: {
          value: debtPayoff.value,
          sourcePath: debtPayoff.sourcePath
        },
        sourcePaths: [debtPayoff.sourcePath]
      }));
    }

    const mortgageTreatment = firstValueAtPath(rootSource, [
      "scenario.scenario.mortgageTreatmentOverride",
      "options.mortgageTreatmentOverride"
    ]);
    if (normalizeString(mortgageTreatment?.value) === "payOffMortgage") {
      candidates.push(makeCandidate(findDefinition("mortgage-is-paid-off"), {
        timing: deathTiming || getRunwayStartTiming(rootSource),
        sourcePaths: [mortgageTreatment.sourcePath],
        confidence: 0.72
      }));
    }
    const supportGap = getSupportGapAmount(rootSource);
    const accumulatedUnmetNeed = firstNumberAtPath(rootSource, [
      "scenario.timelineFacts.accumulatedUnmetNeed",
      "scenario.postDeathSeries.summary.accumulatedUnmetNeed",
      "scenario.postDeathSeries.layer3.summary.accumulatedUnmetNeed"
    ]);
    if ((supportGap && supportGap.value > 0) || (accumulatedUnmetNeed && accumulatedUnmetNeed.value > 0)) {
      const source = supportGap || accumulatedUnmetNeed;
      candidates.push(makeCandidate(findDefinition("protection-gap-appears-immediately"), {
        timing: getRunwayStartTiming(rootSource),
        amount: {
          value: source.value,
          sourcePath: source.sourcePath
        },
        sourcePaths: [source.sourcePath]
      }));
      if (supportGap && supportGap.value > 0) {
        candidates.push(makeCandidate(findDefinition("monthly-support-gap-begins"), {
          timing: getRunwayStartTiming(rootSource),
          amount: {
            value: supportGap.value,
            sourcePath: supportGap.sourcePath
          },
          sourcePaths: [supportGap.sourcePath]
        }));
      }
    }

    const startingResources = firstNumberAtPath(rootSource, [
      "scenario.timelineFacts.resourcesAfterObligations",
      "scenario.deathEvent.resourcesAfterObligations",
      "financialRunway.netAvailableResources"
    ]);
    const postDeathPoints = getPath(rootSource, "scenario.postDeathSeries.points");
    if ((startingResources && startingResources.value >= 0) || (Array.isArray(postDeathPoints) && postDeathPoints.length > 0)) {
      candidates.push(makeCandidate(findDefinition("survivor-runway-begins"), {
        timing: getRunwayStartTiming(rootSource),
        amount: startingResources
          ? {
              value: startingResources.value,
              sourcePath: startingResources.sourcePath
            }
          : null,
        sourcePaths: [startingResources?.sourcePath || "scenario.postDeathSeries.points"]
      }));
    }

    const depletionTiming = getDepletionTiming(rootSource);
    const depletionFlag = getPath(rootSource, "scenario.postDeathSeries.depletion.depleted");
    if (depletionTiming && depletionFlag !== false) {
      candidates.push(makeCandidate(findDefinition("resources-run-out"), {
        timing: depletionTiming,
        amount: makeEmptyAmount(),
        sourcePaths: [depletionTiming.sourcePath || "scenario.postDeathSeries.depletion"]
      }));
    }

    if (accumulatedUnmetNeed && accumulatedUnmetNeed.value > 0) {
      candidates.push(makeCandidate(findDefinition("unfunded-need-accumulates"), {
        timing: depletionTiming || getRunwayStartTiming(rootSource),
        amount: {
          value: accumulatedUnmetNeed.value,
          sourcePath: accumulatedUnmetNeed.sourcePath
        },
        sourcePaths: [accumulatedUnmetNeed.sourcePath]
      }));
    }

    if (hasIssueSignal(rootSource)) {
      candidates.push(makeCandidate(findDefinition("missing-data-limits-timeline"), {
        status: STATUSES.caution,
        safeToRender: true,
        timingKind: "data-quality",
        timing: {
          label: "Data needed",
          sourcePath: "warnings"
        },
        sourcePaths: getInputIssues(rootSource).flatMap(function (issue) {
          return Array.isArray(issue.sourcePaths) ? issue.sourcePaths : [];
        }).concat(["warnings", "dataGaps"]),
        warnings: getInputIssues(rootSource)
      }));
    }

    return dedupeCandidates(candidates);
  }

  function getAssetDepletionLedgerStatus(assetDepletionLedger) {
    return normalizeString(assetDepletionLedger?.status) || "not-provided";
  }

  function isReadyAssetDepletionLedger(assetDepletionLedger) {
    return isPlainObject(assetDepletionLedger)
      && getAssetDepletionLedgerStatus(assetDepletionLedger) === "ready"
      && Array.isArray(assetDepletionLedger.bucketEvents);
  }

  function getAssetDepletionLedgerEvents(assetDepletionLedger) {
    if (!isReadyAssetDepletionLedger(assetDepletionLedger)) {
      return [];
    }
    const seen = new Set();
    return assetDepletionLedger.bucketEvents.filter(isPlainObject).filter(function (event) {
      const key = [
        normalizeString(event.bucketId),
        normalizeString(event.family),
        normalizeString(event.eventType),
        normalizeString(event.monthIndex)
      ].join(":");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function normalizeLedgerEvidenceLevel(event) {
    return normalizeString(event?.evidenceLevel) === EVIDENCE_LEVELS.calculated
      ? EVIDENCE_LEVELS.calculated
      : EVIDENCE_LEVELS.traceBacked;
  }

  function getLedgerEventSourcePaths(event) {
    if (!isPlainObject(event)) {
      return [];
    }
    return uniqueStrings([
      event.sourcePath,
      event.trace?.sourcePath,
      event.trace?.bucketSourcePath,
      event.trace?.source
    ]);
  }

  function getLedgerEventAmount(event) {
    if (!isPlainObject(event)) {
      return null;
    }
    const value = normalizeString(event.eventType) === "bucket-tapped"
      ? toOptionalNumber(event.amountAtTap)
      : toOptionalNumber(event.amountDepleted);
    if (value == null) {
      return null;
    }
    return {
      value,
      sourcePath: normalizeString(event.sourcePath)
    };
  }

  function getModeledHorizonMonth(assetDepletionLedger) {
    return getLedgerMonths(assetDepletionLedger).reduce(function (current, month, index) {
      const monthIndex = toOptionalNumber(month?.monthIndex);
      const safeMonthIndex = monthIndex == null ? index : monthIndex;
      return current == null ? safeMonthIndex : Math.max(current, safeMonthIndex);
    }, null);
  }

  function getOrderedBucketEntries(assetDepletionLedger, family) {
    const normalizedFamily = normalizeString(family);
    return getOrderedBuckets(assetDepletionLedger).filter(function (bucket) {
      return normalizeString(bucket.family || bucket.category) === normalizedFamily;
    });
  }

  function getExcludedBucketEntries(assetDepletionLedger, family) {
    const normalizedFamily = normalizeString(family);
    return Array.isArray(assetDepletionLedger?.excludedBuckets)
      ? assetDepletionLedger.excludedBuckets.filter(isPlainObject).filter(function (bucket) {
        return normalizeString(bucket.family || bucket.category) === normalizedFamily;
      })
      : [];
  }

  function getBucketEntryValue(bucket) {
    return Math.max(toOptionalNumber(bucket?.availableValue ?? bucket?.value ?? bucket?.startingValue) || 0, 0);
  }

  function getFinalBucketEntryBalance(assetDepletionLedger, bucket) {
    const bucketId = normalizeString(bucket?.bucketId || bucket?.id);
    const family = normalizeString(bucket?.family || bucket?.category);
    const months = getLedgerMonths(assetDepletionLedger);
    const lastMonth = months[months.length - 1];
    if (lastMonth && Array.isArray(lastMonth.endingBuckets)) {
      const matching = lastMonth.endingBuckets.filter(isPlainObject).filter(function (entry) {
        const entryId = normalizeString(entry.bucketId || entry.id);
        const entryFamily = normalizeString(entry.family || entry.category);
        return bucketId ? entryId === bucketId : entryFamily === family;
      });
      if (matching.length) {
        return matching.reduce(function (total, entry) {
          return total + Math.max(toOptionalNumber(entry.balance ?? entry.availableValue ?? entry.value) || 0, 0);
        }, 0);
      }
    }
    return Math.max(toOptionalNumber(bucket?.trace?.finalBalance) || 0, 0);
  }

  function getFirstRemainingOrderedBucket(assetDepletionLedger) {
    const ordered = getOrderedBuckets(assetDepletionLedger).slice().sort(function (left, right) {
      return (toOptionalNumber(left.order) ?? 999999) - (toOptionalNumber(right.order) ?? 999999)
        || normalizeString(left.bucketId || left.id).localeCompare(normalizeString(right.bucketId || right.id));
    });
    return ordered.find(function (bucket) {
      return getFinalBucketEntryBalance(assetDepletionLedger, bucket) > 0;
    }) || null;
  }

  function getPreviousBucketDepletionMonth(assetDepletionLedger, bucket) {
    const order = toOptionalNumber(bucket?.order);
    if (order == null) {
      return null;
    }
    return getOrderedBuckets(assetDepletionLedger).reduce(function (current, candidate) {
      const candidateOrder = toOptionalNumber(candidate.order);
      if (candidateOrder == null || candidateOrder >= order) {
        return current;
      }
      const month = toOptionalNumber(candidate.depletionMonth);
      if (month == null) {
        return current;
      }
      return current == null ? month : Math.max(current, month);
    }, null);
  }

  function makeAssetBucketStateCandidate(candidateId, config) {
    const definition = findDefinition(candidateId);
    if (!definition) {
      return null;
    }
    const safeConfig = isPlainObject(config) ? config : {};
    const monthIndex = toOptionalNumber(safeConfig.monthIndex);
    const amountValue = toOptionalNumber(safeConfig.amountValue);
    const evidenceLevel = safeConfig.evidenceLevel || EVIDENCE_LEVELS.calculated;
    const candidate = makeCandidate(definition, {
      status: STATUSES.safeNow,
      safeToRender: true,
      evidenceLevel,
      eligibleForGraphDot: safeConfig.eligibleForGraphDot !== false,
      eligibleForMajorCard: definition.eligibleForMajorCard === true,
      timingKind: "month-offset",
      timing: {
        monthOffset: monthIndex,
        label: monthIndex == null ? "Modeled horizon" : `Month ${monthIndex}`,
        sourcePath: safeConfig.sourcePath || "assetDepletionLedger.orderedBuckets"
      },
      amount: {
        value: amountValue == null ? 0 : amountValue,
        sourcePath: safeConfig.amountSourcePath || safeConfig.sourcePath || "assetDepletionLedger.orderedBuckets"
      },
      sourcePaths: uniqueStrings(safeConfig.sourcePaths || [safeConfig.sourcePath || "assetDepletionLedger.orderedBuckets"]),
      confidence: safeConfig.confidence ?? 0.9,
      priority: safeConfig.priority ?? definition.priority,
      suppressionKeys: safeConfig.suppressionKeys || [`asset-bucket-trigger:${candidateId}`]
    });
    candidate.candidateSource = "canonical-asset-bucket-trigger";
    candidate.trace = Object.assign({
      candidateSource: "canonical-asset-bucket-trigger",
      triggerId: candidateId,
      family: normalizeString(safeConfig.family),
      bucketId: normalizeString(safeConfig.bucketId),
      monthIndex,
      amountValue,
      bucketState: normalizeString(safeConfig.bucketState),
      sourceLabel: normalizeString(safeConfig.sourceLabel),
      aggregateRunwayPreserved: true,
      graphLineSource: "aggregate-survivor-runway"
    }, clonePlainValue(safeConfig.trace || {}));
    return candidate;
  }

  function buildAssetBucketStateCandidates(assetDepletionLedger) {
    if (!isReadyAssetDepletionLedger(assetDepletionLedger)) {
      return [];
    }
    const candidates = [];
    const horizonMonth = getModeledHorizonMonth(assetDepletionLedger);
    const firstRemaining = getFirstRemainingOrderedBucket(assetDepletionLedger);
    Object.keys(ASSET_BUCKET_STATE_RULES).forEach(function (family) {
      const rule = ASSET_BUCKET_STATE_RULES[family];
      const orderedBuckets = getOrderedBucketEntries(assetDepletionLedger, family).filter(function (bucket) {
        return getBucketEntryValue(bucket) > 0;
      });
      const excludedBuckets = getExcludedBucketEntries(assetDepletionLedger, family).filter(function (bucket) {
        return getBucketEntryValue(bucket) > 0;
      });
      const firstUsedMonth = getFirstUsedMonthForFamily(assetDepletionLedger, family);
      const depleted = getFamilyBucketEvents(assetDepletionLedger, family).some(function (event) {
        return normalizeString(event.eventType) === "bucket-depleted";
      });

      if (!orderedBuckets.length && !(rule.allowExcludedProtected === true && excludedBuckets.length)) {
        return;
      }
      if (firstUsedMonth != null || depleted) {
        return;
      }

      const primaryBucket = orderedBuckets[0] || excludedBuckets[0];
      const primaryBucketId = normalizeString(primaryBucket.bucketId || primaryBucket.id);
      const amountValue = orderedBuckets.length
        ? orderedBuckets.reduce(function (total, bucket) { return total + getBucketEntryValue(bucket); }, 0)
        : excludedBuckets.reduce(function (total, bucket) { return total + getBucketEntryValue(bucket); }, 0);
      const isNextInLine = orderedBuckets.length
        && firstRemaining
        && normalizeString(firstRemaining.family || firstRemaining.category) === family
        && normalizeString(firstRemaining.bucketId || firstRemaining.id) === primaryBucketId;
      const candidateId = isNextInLine ? rule.nextId : rule.protectedId;
      const monthIndex = isNextInLine
        ? (getPreviousBucketDepletionMonth(assetDepletionLedger, primaryBucket) ?? horizonMonth ?? 0)
        : (horizonMonth ?? 0);
      const candidate = makeAssetBucketStateCandidate(candidateId, {
        family,
        bucketId: primaryBucketId,
        monthIndex,
        amountValue,
        sourcePath: primaryBucket.sourcePath || "assetDepletionLedger.orderedBuckets",
        sourcePaths: [
          primaryBucket.sourcePath,
          orderedBuckets.length ? "assetDepletionLedger.orderedBuckets" : "assetDepletionLedger.excludedBuckets",
          "assetDepletionLedger.ledgerMonths"
        ],
        sourceLabel: rule.sourceLabel,
        bucketState: isNextInLine ? "next-in-line-unused" : "unused-through-horizon",
        trace: {
          orderedBucketCount: orderedBuckets.length,
          excludedBucketCount: excludedBuckets.length,
          firstUsedMonth,
          depleted,
          modeledHorizonMonth: horizonMonth,
          nextInLine: Boolean(isNextInLine),
          permissionMode: normalizeString(primaryBucket.permissionMode),
          permissionSource: normalizeString(primaryBucket.permissionSource),
          excludedReason: normalizeString(primaryBucket.reason)
        }
      });
      if (candidate) {
        candidates.push(candidate);
      }
    });
    return candidates;
  }

  function makeSuppressedLedgerCandidate(event, reason) {
    const evidenceLevel = normalizeLedgerEvidenceLevel(event);
    const sourcePaths = getLedgerEventSourcePaths(event);
    const monthIndex = toOptionalNumber(event?.monthIndex);
    return {
      id: [
        "canonical-runway-waterfall",
        normalizeString(event?.bucketId) || normalizeString(event?.family) || "bucket",
        normalizeString(event?.eventType) || "unsupported"
      ].join("."),
      family: normalizeString(event?.family),
      displayLabel: normalizeString(event?.displayLabel),
      graphLabel: normalizeString(event?.displayLabel),
      cardTitle: normalizeString(event?.displayLabel),
      description: normalizeString(reason),
      severity: "deferred",
      evidenceLevel,
      status: STATUSES.deferred,
      safeToRender: false,
      eligibleForGraphDot: false,
      eligibleForMajorCard: false,
      timing: makeTiming("month-offset", {
        monthOffset: monthIndex,
        date: event?.date,
        label: normalizeString(event?.date) || (monthIndex != null ? `Month ${monthIndex}` : ""),
        sourcePath: normalizeString(event?.sourcePath)
      }),
      amount: getLedgerEventAmount(event) || makeEmptyAmount(),
      sources: sourcePaths.map(function (sourcePath) {
        return {
          sourcePath,
          evidenceLevel
        };
      }),
      confidence: 0,
      lifeInsuranceRelevance: 0,
      emotionalWeight: 0,
      advisorUsefulness: 0,
      suppressionKeys: ["canonical-runway-waterfall-hidden"],
      deferredReason: reason,
      warnings: compactObjects(event?.warnings).map(clonePlainValue),
      priority: 999,
      candidateSource: "canonical-runway-asset-waterfall",
      trace: {
        candidateSource: "canonical-runway-asset-waterfall",
        bucketId: normalizeString(event?.bucketId),
        family: normalizeString(event?.family),
        ledgerEventType: normalizeString(event?.eventType)
      }
    };
  }

  function buildAssetDepletionLedgerBackedCandidates(assetDepletionLedger, warnings) {
    const ledgerStatus = getAssetDepletionLedgerStatus(assetDepletionLedger);
    if (!isReadyAssetDepletionLedger(assetDepletionLedger)) {
      return {
        candidates: [],
        suppressedCandidates: [],
        ledgerStatus,
        usedForStoryline: false
      };
    }

    const candidates = [];
    const suppressedCandidates = [];
    getAssetDepletionLedgerEvents(assetDepletionLedger).forEach(function (event) {
      const family = normalizeString(event.family);
      const eventType = normalizeString(event.eventType);
      const key = `${family}:${eventType}`;
      const mapping = ASSET_DEPLETION_LEDGER_EVENT_MAPPINGS[key];
      const monthIndex = toOptionalNumber(event.monthIndex);
      const sourcePaths = getLedgerEventSourcePaths(event);
      const amount = getLedgerEventAmount(event);
      const unsupportedReason = includesValue(LEDGER_SUPPRESSED_VISIBLE_FAMILIES, family)
        ? "Canonical runway waterfall event is mechanical or not visible-storyline eligible."
        : !mapping
          ? "Canonical runway waterfall event does not map to a safe emotional storyline candidate in this pass."
          : monthIndex == null && !normalizeString(event.date)
            ? "Canonical runway waterfall event has no usable timing."
            : !amount || amount.value == null
              ? "Canonical runway waterfall event has no usable amount."
              : !sourcePaths.length
                ? "Canonical runway waterfall event has no traceable source path."
                : "";

      if (unsupportedReason) {
        suppressedCandidates.push(makeSuppressedLedgerCandidate(event, unsupportedReason));
        warnings.push(makeWarning(
          "canonical-runway-waterfall-event-not-activated",
          unsupportedReason,
          sourcePaths.length ? sourcePaths : [normalizeString(event.sourcePath)].filter(Boolean),
          {
            bucketId: normalizeString(event.bucketId),
            family,
            eventType,
            ledgerStatus
          }
        ));
        return;
      }

      const definition = findDefinition(mapping.candidateId);
      if (!definition) {
        warnings.push(makeWarning(
          "missing-canonical-runway-waterfall-storyline-definition",
          "A supported canonical runway waterfall event did not have a matching storyline registry candidate.",
          sourcePaths,
          {
            candidateId: mapping.candidateId,
            bucketId: normalizeString(event.bucketId)
          }
        ));
        suppressedCandidates.push(makeSuppressedLedgerCandidate(
          event,
          "No matching storyline registry candidate exists."
        ));
        return;
      }

      const evidenceLevel = normalizeLedgerEvidenceLevel(event);
      const candidate = makeCandidate(definition, {
        status: STATUSES.safeNow,
        safeToRender: true,
        evidenceLevel,
        eligibleForGraphDot: mapping.eligibleForGraphDot === true,
        eligibleForMajorCard: mapping.eligibleForMajorCard === true,
        timingKind: "month-offset",
        timing: {
          monthOffset: monthIndex,
          date: event.date,
          label: normalizeString(event.date) || (monthIndex != null ? `Month ${monthIndex}` : ""),
          sourcePath: normalizeString(event.sourcePath)
        },
        amount,
        sourcePaths,
        confidence: evidenceLevel === EVIDENCE_LEVELS.calculated ? 0.9 : 0.84,
        priority: mapping.priority,
        warnings: compactObjects(event.warnings),
        suppressionKeys: [`canonical-runway-waterfall:${normalizeString(event.bucketId || family)}`]
      });
      candidate.candidateSource = "canonical-runway-asset-waterfall";
      candidate.trace = {
        candidateSource: "canonical-runway-asset-waterfall",
        bucketId: normalizeString(event.bucketId),
        family,
        ledgerEventType: eventType,
        monthIndex,
        date: normalizeString(event.date) || null,
        sourcePath: normalizeString(event.sourcePath),
        amountAtTap: toOptionalNumber(event.amountAtTap),
        amountDepleted: toOptionalNumber(event.amountDepleted),
        withdrawalAmount: toOptionalNumber(event.withdrawalAmount ?? event.trace?.withdrawalAmount),
        balanceBeforeWithdrawal: toOptionalNumber(event.balanceBeforeWithdrawal ?? event.trace?.balanceBeforeWithdrawal),
        evidenceLevel,
        ledgerStatus,
        ledgerReconciliationStatus: isPlainObject(assetDepletionLedger.trace?.totalResourcesReconciliation)
          ? clonePlainValue(assetDepletionLedger.trace.totalResourcesReconciliation)
          : null,
        aggregateRunwayPreserved: true,
        graphLineSource: "aggregate-survivor-runway"
      };
      candidates.push(candidate);
    });

    const dedupedCandidates = dedupeCandidates(candidates.concat(buildAssetBucketStateCandidates(assetDepletionLedger)));
    return {
      candidates: dedupedCandidates,
      suppressedCandidates,
      ledgerStatus,
      usedForStoryline: dedupedCandidates.length > 0
    };
  }

  const LIQUIDITY_FAST_ACCESS_FAMILIES = Object.freeze([
    "preDeathSavedCash",
    "cash",
    "emergencyFund",
    "otherLiquid"
  ]);

  const LIQUIDITY_DEEPER_THAN_CASH_FAMILIES = Object.freeze([
    "emergencyFund",
    "otherLiquid",
    "taxableInvestments",
    "educationSavings",
    "retirementAssets",
    "qualifiedAnnuities",
    "nonQualifiedAnnuities",
    "homeEquity",
    "realEstate",
    "businessAssets",
    "trustRestricted",
    "unknown"
  ]);

  const LIQUIDITY_BUCKET_RULES = Object.freeze({
    cash: Object.freeze({
      family: "cash",
      bucketId: "cash-reserve",
      cardConceptId: "cashReserve",
      usedId: "cash-reserve-begins-declining",
      nearlyId: "cash-reserve-nearly-depleted",
      depletedId: "cash-reserve-depleted",
      usedSupportingOnly: true,
      usedEventState: "begins-declining",
      sourceLabel: "ordinary cash"
    }),
    emergencyFund: Object.freeze({
      family: "emergencyFund",
      bucketId: "emergency-fund",
      cardConceptId: "emergencyFund",
      usedId: "emergency-fund-used",
      nearlyId: "emergency-fund-nearly-depleted",
      depletedId: "emergency-fund-depleted",
      usedSupportingOnly: true,
      usedEventState: "used",
      sourceLabel: "emergency fund"
    }),
    taxableInvestments: Object.freeze({
      family: "taxableInvestments",
      bucketId: "taxable-investments",
      cardConceptId: "taxableInvestments",
      usedId: "taxable-investments-tapped",
      nearlyId: "taxable-investments-nearly-depleted",
      depletedId: "taxable-investments-depleted",
      usedSupportingOnly: true,
      usedEventState: "tapped",
      sourceLabel: "taxable investments"
    })
  });
  const LIQUIDITY_BUCKET_STATE_RANKS = Object.freeze({
    holds: 0,
    "begins-declining": 1,
    used: 1,
    tapped: 1,
    nearly: 2,
    "nearly-depleted": 2,
    depleted: 3
  });

  function formatVisibleEventMonthKey(monthIndex) {
    const month = toOptionalNumber(monthIndex);
    return month == null ? "month-unknown" : `month-${Math.max(0, Math.round(month))}`;
  }

  function buildVisibleEventKey(identity) {
    const safeIdentity = isPlainObject(identity) ? identity : {};
    return [
      normalizeString(safeIdentity.storyStage || "event"),
      normalizeString(safeIdentity.bucketFamily || safeIdentity.category || "general"),
      normalizeString(safeIdentity.bucketId || safeIdentity.cardConceptId || safeIdentity.conceptId || "event"),
      normalizeString(safeIdentity.eventState || "state"),
      formatVisibleEventMonthKey(safeIdentity.relativeMonth)
    ].filter(Boolean).join(":");
  }

  function getLiquidityBucketEventState(rule, candidateId) {
    const id = normalizeString(candidateId);
    if (id === normalizeString(rule?.depletedId)) {
      return "depleted";
    }
    if (id === normalizeString(rule?.nearlyId)) {
      return "nearly-depleted";
    }
    if (id === normalizeString(rule?.usedId)) {
      return normalizeString(rule?.usedEventState) || "used";
    }
    if (id === "cash-reserve-holds") {
      return "holds";
    }
    return "";
  }

  function buildLiquidityBucketVisibleIdentity(rule, candidateId, monthIndex) {
    const eventState = getLiquidityBucketEventState(rule, candidateId);
    const identity = {
      storyStage: "liquidity",
      category: "liquidity",
      bucketFamily: rule?.family || "",
      bucketId: rule?.bucketId || rule?.family || "",
      cardConceptId: rule?.cardConceptId || "",
      conceptId: rule?.cardConceptId || "",
      eventState,
      stateRank: LIQUIDITY_BUCKET_STATE_RANKS[eventState] || 0,
      relativeMonth: monthIndex
    };
    return Object.assign(identity, {
      visibleEventKey: buildVisibleEventKey(identity)
    });
  }

  function buildStandaloneLiquidityVisibleIdentity(candidateId, conceptId, eventState, monthIndex) {
    const identity = {
      storyStage: "liquidity",
      category: "liquidity",
      bucketFamily: conceptId,
      bucketId: conceptId,
      cardConceptId: conceptId,
      conceptId,
      eventState,
      stateRank: LIQUIDITY_BUCKET_STATE_RANKS[eventState] || 0,
      relativeMonth: monthIndex
    };
    return Object.assign(identity, {
      visibleEventKey: buildVisibleEventKey(identity),
      triggerId: candidateId
    });
  }

  function getLedgerMonths(assetDepletionLedger) {
    return Array.isArray(assetDepletionLedger?.ledgerMonths)
      ? assetDepletionLedger.ledgerMonths.filter(isPlainObject)
      : [];
  }

  function getOrderedBuckets(assetDepletionLedger) {
    return Array.isArray(assetDepletionLedger?.orderedBuckets)
      ? assetDepletionLedger.orderedBuckets.filter(isPlainObject)
      : [];
  }

  function sumBucketSnapshotFamily(snapshot, family) {
    const normalizedFamily = normalizeString(family);
    return (Array.isArray(snapshot) ? snapshot : []).reduce(function (total, bucket) {
      if (!isPlainObject(bucket) || normalizeString(bucket.family) !== normalizedFamily) {
        return total;
      }
      const balance = toOptionalNumber(bucket.balance ?? bucket.availableValue ?? bucket.value);
      return total + Math.max(balance || 0, 0);
    }, 0);
  }

  function sumOrderedBucketFamily(assetDepletionLedger, family) {
    const normalizedFamily = normalizeString(family);
    return getOrderedBuckets(assetDepletionLedger).reduce(function (total, bucket) {
      if (normalizeString(bucket.family || bucket.category) !== normalizedFamily) {
        return total;
      }
      const value = toOptionalNumber(bucket.availableValue ?? bucket.value);
      return total + Math.max(value || 0, 0);
    }, 0);
  }

  function getInitialBucketFamilyValue(assetDepletionLedger, family) {
    const firstMonth = getLedgerMonths(assetDepletionLedger)[0];
    if (firstMonth && Array.isArray(firstMonth.startingBuckets)) {
      return sumBucketSnapshotFamily(firstMonth.startingBuckets, family);
    }
    return sumOrderedBucketFamily(assetDepletionLedger, family);
  }

  function getFinalBucketFamilyValue(assetDepletionLedger, family) {
    const months = getLedgerMonths(assetDepletionLedger);
    const lastMonth = months[months.length - 1];
    if (lastMonth && Array.isArray(lastMonth.endingBuckets)) {
      return sumBucketSnapshotFamily(lastMonth.endingBuckets, family);
    }
    return sumOrderedBucketFamily(assetDepletionLedger, family);
  }

  function getFamilyBucketEvents(assetDepletionLedger, family) {
    const normalizedFamily = normalizeString(family);
    return getAssetDepletionLedgerEvents(assetDepletionLedger).filter(function (event) {
      return normalizeString(event.family) === normalizedFamily;
    });
  }

  function getFirstUsedMonthForFamily(assetDepletionLedger, family) {
    const eventMonth = getFamilyBucketEvents(assetDepletionLedger, family).reduce(function (current, event) {
      if (normalizeString(event.eventType) !== "bucket-tapped") {
        return current;
      }
      const month = toOptionalNumber(event.monthIndex);
      if (month == null) {
        return current;
      }
      return current == null ? month : Math.min(current, month);
    }, null);
    if (eventMonth != null) {
      return eventMonth;
    }
    return getOrderedBuckets(assetDepletionLedger).reduce(function (current, bucket) {
      if (normalizeString(bucket.family || bucket.category) !== normalizeString(family)) {
        return current;
      }
      const month = toOptionalNumber(bucket.firstUsedMonth);
      if (month == null) {
        return current;
      }
      return current == null ? month : Math.min(current, month);
    }, null);
  }

  function hasReliableMonthlyBurn(assetDepletionLedger) {
    return getLedgerMonths(assetDepletionLedger).some(function (month) {
      return toOptionalNumber(month.monthlyNetUse) != null;
    });
  }

  function findBucketThresholdCrossing(assetDepletionLedger, family, thresholdMonths, minimumMonths, options) {
    const months = getLedgerMonths(assetDepletionLedger);
    const earliestMonth = toOptionalNumber(options?.earliestMonth);
    for (let index = 0; index < months.length; index += 1) {
      const month = months[index];
      const monthIndex = toOptionalNumber(month.monthIndex) ?? index;
      if (earliestMonth != null && monthIndex < earliestMonth) {
        continue;
      }
      const monthlyBurn = toOptionalNumber(month.monthlyNetUse);
      if (monthlyBurn == null || monthlyBurn <= 0) {
        continue;
      }
      const balance = sumBucketSnapshotFamily(month.endingBuckets, family);
      const thresholdValue = monthlyBurn * thresholdMonths;
      const minimumValue = minimumMonths == null ? null : monthlyBurn * minimumMonths;
      if (balance < thresholdValue && (minimumValue == null || balance >= minimumValue)) {
        return {
          monthIndex,
          monthlyBurn,
          remainingValue: balance,
          thresholdValue
        };
      }
    }
    return null;
  }

  function getLedgerReconciliationTrace(assetDepletionLedger) {
    return isPlainObject(assetDepletionLedger?.trace?.totalResourcesReconciliation)
      ? clonePlainValue(assetDepletionLedger.trace.totalResourcesReconciliation)
      : null;
  }

  function makeLiquiditySuppressedCandidate(id, reason, context) {
    const safeContext = isPlainObject(context) ? context : {};
    return {
      id: `liquidity-trigger.${normalizeString(id) || "event"}.${normalizeString(reason) || "suppressed"}`,
      family: EVENT_FAMILIES.cashWaterfall,
      displayLabel: normalizeString(safeContext.displayLabel || id),
      graphLabel: normalizeString(safeContext.displayLabel || id),
      cardTitle: normalizeString(safeContext.displayLabel || id),
      description: normalizeString(reason),
      severity: "deferred",
      evidenceLevel: EVIDENCE_LEVELS.insufficientData,
      status: STATUSES.deferred,
      safeToRender: false,
      eligibleForGraphDot: false,
      eligibleForMajorCard: false,
      timing: makeEmptyTiming("liquidity-trigger-suppressed"),
      amount: makeEmptyAmount(),
      sources: uniqueStrings(safeContext.sourcePaths).map(function (sourcePath) {
        return {
          sourcePath,
          evidenceLevel: EVIDENCE_LEVELS.insufficientData
        };
      }),
      confidence: 0,
      lifeInsuranceRelevance: 0,
      emotionalWeight: 0,
      advisorUsefulness: 0,
      suppressionKeys: ["liquidity-trigger-suppressed"],
      deferredReason: reason,
      warnings: [],
      priority: 999,
      candidateSource: "canonical-liquidity-trigger",
      trace: Object.assign({
        candidateSource: "canonical-liquidity-trigger",
        reason
      }, clonePlainValue(safeContext.trace || {}))
    };
  }

  function makeLiquidityTriggerCandidate(candidateId, config) {
    const definition = findDefinition(candidateId);
    if (!definition) {
      return null;
    }
    const safeConfig = isPlainObject(config) ? config : {};
    const identity = isPlainObject(safeConfig.identity) ? safeConfig.identity : {};
    const monthIndex = toOptionalNumber(safeConfig.monthIndex);
    const amountValue = toOptionalNumber(safeConfig.amountValue);
    const evidenceLevel = safeConfig.evidenceLevel || EVIDENCE_LEVELS.calculated;
    const candidate = makeCandidate(definition, {
      status: STATUSES.safeNow,
      safeToRender: true,
      evidenceLevel,
      eligibleForGraphDot: safeConfig.eligibleForGraphDot !== false,
      eligibleForMajorCard: safeConfig.supportingOnly === true ? false : definition.eligibleForMajorCard === true,
      timingKind: "month-offset",
      timing: {
        monthOffset: monthIndex,
        label: monthIndex == null ? "At death" : `Month ${monthIndex}`,
        sourcePath: safeConfig.sourcePath || "assetDepletionLedger.ledgerMonths"
      },
      amount: {
        value: amountValue,
        sourcePath: safeConfig.amountSourcePath || safeConfig.sourcePath || "assetDepletionLedger"
      },
      sourcePaths: uniqueStrings(safeConfig.sourcePaths || [safeConfig.sourcePath || "assetDepletionLedger"]),
      confidence: safeConfig.confidence ?? 0.9,
      priority: safeConfig.priority ?? definition.priority,
      suppressionKeys: safeConfig.suppressionKeys || [`liquidity-trigger:${candidateId}`]
    });
    candidate.candidateSource = "canonical-liquidity-trigger";
    candidate.supportingDotOnly = safeConfig.supportingOnly === true;
    candidate.supportingDotEligible = safeConfig.supportingOnly === true || candidate.eligibleForGraphDot === true;
    candidate.visibleEventKey = normalizeString(identity.visibleEventKey || safeConfig.visibleEventKey);
    candidate.cardConceptId = normalizeString(identity.cardConceptId || safeConfig.cardConceptId);
    candidate.conceptId = normalizeString(identity.conceptId || safeConfig.conceptId || candidate.cardConceptId);
    candidate.storyStage = normalizeString(identity.storyStage || safeConfig.storyStage);
    candidate.bucketFamily = normalizeString(identity.bucketFamily || safeConfig.bucketFamily);
    candidate.bucketId = normalizeString(identity.bucketId || safeConfig.bucketId);
    candidate.eventState = normalizeString(identity.eventState || safeConfig.eventState);
    candidate.stateRank = toOptionalNumber(identity.stateRank ?? safeConfig.stateRank);
    candidate.trace = Object.assign({
      candidateSource: "canonical-liquidity-trigger",
      triggerId: candidateId,
      monthIndex,
      visibleEventKey: candidate.visibleEventKey || null,
      cardConceptId: candidate.cardConceptId || null,
      conceptId: candidate.conceptId || null,
      storyStage: candidate.storyStage || null,
      bucketFamily: candidate.bucketFamily || null,
      bucketId: candidate.bucketId || null,
      eventState: candidate.eventState || null,
      stateRank: candidate.stateRank == null ? null : candidate.stateRank,
      monthlyBurn: toOptionalNumber(safeConfig.monthlyBurn),
      remainingValue: toOptionalNumber(safeConfig.remainingValue),
      thresholdValue: toOptionalNumber(safeConfig.thresholdValue),
      fastAccessResources: toOptionalNumber(safeConfig.fastAccessResources),
      transitionNeed90Days: toOptionalNumber(safeConfig.transitionNeed90Days),
      fastAccessCoverageRatio: toOptionalNumber(safeConfig.fastAccessCoverageRatio),
      supportingDotOnly: safeConfig.supportingOnly === true,
      aggregateRunwayPreserved: true,
      graphLineSource: "aggregate-survivor-runway"
    }, clonePlainValue(safeConfig.trace || {}));
    return candidate;
  }

  function addLiquidityTriggerCandidate(target, candidate) {
    if (candidate) {
      target.push(candidate);
    }
  }

  function getLiquidityCandidateMonth(candidate) {
    return toOptionalNumber(candidate?.timing?.monthOffset ?? candidate?.trace?.monthIndex);
  }

  function getLiquidityCandidateState(candidate, rule) {
    const id = normalizeString(candidate?.id);
    if (id && id === rule.depletedId) {
      return "depleted";
    }
    if (id && id === rule.nearlyId) {
      return "nearly";
    }
    if (id && id === rule.usedId) {
      return "used";
    }
    return "";
  }

  function makeSuppressedLiquidityPrecedenceCandidate(candidate, strongerCandidate, reason) {
    const suppressed = clonePlainValue(candidate);
    suppressed.safeToRender = false;
    suppressed.eligibleForGraphDot = false;
    suppressed.eligibleForMajorCard = false;
    suppressed.supportingDotEligible = false;
    suppressed.supportingDotOnly = false;
    suppressed.status = STATUSES.deferred;
    suppressed.deferredReason = reason;
    suppressed.suppressionKeys = uniqueStrings((candidate?.suppressionKeys || []).concat([
      "liquidity-bucket-state-precedence"
    ]));
    suppressed.trace = Object.assign({}, clonePlainValue(candidate?.trace || {}), {
      precedenceSuppressed: true,
      precedenceReason: reason,
      strongerTriggerId: normalizeString(strongerCandidate?.id),
      strongerMonthIndex: getLiquidityCandidateMonth(strongerCandidate)
    });
    return suppressed;
  }

  function applyLiquidityBucketPrecedence(candidates, suppressedCandidates, rule) {
    const sorted = candidates.slice().sort(function (left, right) {
      const leftMonth = getLiquidityCandidateMonth(left);
      const rightMonth = getLiquidityCandidateMonth(right);
      const safeLeftMonth = leftMonth == null ? Number.MAX_SAFE_INTEGER : leftMonth;
      const safeRightMonth = rightMonth == null ? Number.MAX_SAFE_INTEGER : rightMonth;
      const leftState = getLiquidityCandidateState(left, rule);
      const rightState = getLiquidityCandidateState(right, rule);
      const leftRank = LIQUIDITY_BUCKET_STATE_RANKS[leftState] || 0;
      const rightRank = LIQUIDITY_BUCKET_STATE_RANKS[rightState] || 0;
      return safeLeftMonth - safeRightMonth || rightRank - leftRank;
    });
    const visible = [];
    sorted.forEach(function (candidate) {
      const state = getLiquidityCandidateState(candidate, rule);
      const rank = LIQUIDITY_BUCKET_STATE_RANKS[state] || 0;
      const month = getLiquidityCandidateMonth(candidate);
      const stronger = visible.find(function (item) {
        const itemState = getLiquidityCandidateState(item, rule);
        const itemRank = LIQUIDITY_BUCKET_STATE_RANKS[itemState] || 0;
        const itemMonth = getLiquidityCandidateMonth(item);
        return itemRank > rank
          && itemMonth != null
          && month != null
          && month >= itemMonth;
      });
      if (stronger) {
        suppressedCandidates.push(makeSuppressedLiquidityPrecedenceCandidate(
          candidate,
          stronger,
          "A stronger liquidity bucket state is already visible for this bucket at or before this month."
        ));
        return;
      }
      visible.push(candidate);
    });
    return visible;
  }

  function buildNinetyDayCashWindowCandidate(assetDepletionLedger, transitionOutlook, warnings, suppressedCandidates) {
    const transitionNeed90Days = toOptionalNumber(transitionOutlook?.transitionNeed90Days);
    if (transitionNeed90Days == null || transitionNeed90Days <= 0) {
      suppressedCandidates.push(makeLiquiditySuppressedCandidate(
        "ninety-day-cash-window",
        "90-day transition need is unavailable or zero.",
        {
          displayLabel: "90-Day Cash Window",
          sourcePaths: ["transitionOutlook.transitionNeed90Days"],
          trace: {
            transitionNeed90Days
          }
        }
      ));
      warnings.push(makeWarning(
        "liquidity-transition-need-missing",
        "90-day cash-window trigger was suppressed because transition need was unavailable or zero.",
        ["transitionOutlook.transitionNeed90Days"]
      ));
      return null;
    }

    const includedBuckets = LIQUIDITY_FAST_ACCESS_FAMILIES.map(function (family) {
      return {
        family,
        value: getInitialBucketFamilyValue(assetDepletionLedger, family)
      };
    }).filter(function (bucket) {
      return bucket.value > 0;
    });
    const fastAccessResources = includedBuckets.reduce(function (total, bucket) {
      return total + bucket.value;
    }, 0);
    const fastAccessCoverageRatio = Number((fastAccessResources / transitionNeed90Days).toFixed(4));
    const candidateId = fastAccessCoverageRatio >= 1.25
      ? "ninety-day-cash-window-covered"
      : fastAccessCoverageRatio >= 1
        ? "ninety-day-cash-window-tight"
        : fastAccessCoverageRatio >= 0.5
          ? "ninety-day-cash-window-short"
          : "ninety-day-cash-window-underfunded";

    return makeLiquidityTriggerCandidate(candidateId, {
      monthIndex: 0,
      amountValue: fastAccessResources,
      sourcePath: "assetDepletionLedger.orderedBuckets",
      sourcePaths: [
        "assetDepletionLedger.orderedBuckets",
        "assetDepletionLedger.ledgerMonths.0.startingBuckets",
        "transitionOutlook.transitionNeed90Days"
      ],
      fastAccessResources,
      transitionNeed90Days,
      fastAccessCoverageRatio,
      identity: buildStandaloneLiquidityVisibleIdentity(
        candidateId,
        "transition",
        candidateId.replace("ninety-day-cash-window-", ""),
        0
      ),
      trace: {
        includedFastAccessFamilies: includedBuckets,
        excludedFastAccessFamilies: [
          "taxableInvestments",
          "educationSavings",
          "retirementAssets",
          "homeEquity",
          "businessAssets",
          "illiquid",
          "restricted",
          "unknown"
        ],
        transitionOutlookStatus: normalizeString(transitionOutlook?.status),
        ledgerReconciliationStatus: getLedgerReconciliationTrace(assetDepletionLedger)
      }
    });
  }

  function buildBucketThresholdCandidates(assetDepletionLedger, warnings, suppressedCandidates) {
    const candidates = [];
    const hasBurn = hasReliableMonthlyBurn(assetDepletionLedger);
    if (!hasBurn) {
      suppressedCandidates.push(makeLiquiditySuppressedCandidate(
        "liquidity-threshold-events",
        "Reliable monthly burn is unavailable from the canonical asset depletion ledger.",
        {
          displayLabel: "Liquidity threshold events",
          sourcePaths: ["assetDepletionLedger.ledgerMonths.monthlyNetUse"],
          trace: {
            missingSource: "assetDepletionLedger.ledgerMonths.monthlyNetUse"
          }
        }
      ));
      warnings.push(makeWarning(
        "liquidity-monthly-burn-missing",
        "Liquidity threshold events were suppressed because reliable monthly burn was unavailable.",
        ["assetDepletionLedger.ledgerMonths.monthlyNetUse"]
      ));
      return candidates;
    }

    Object.keys(LIQUIDITY_BUCKET_RULES).forEach(function (key) {
      const rule = LIQUIDITY_BUCKET_RULES[key];
      const bucketCandidates = [];
      const initialValue = getInitialBucketFamilyValue(assetDepletionLedger, rule.family);
      if (initialValue <= 0) {
        return;
      }
      const firstUsedMonth = getFirstUsedMonthForFamily(assetDepletionLedger, rule.family);
      if (firstUsedMonth != null && rule.usedId) {
        addLiquidityTriggerCandidate(bucketCandidates, makeLiquidityTriggerCandidate(rule.usedId, {
          monthIndex: firstUsedMonth,
          amountValue: initialValue,
          sourcePath: "assetDepletionLedger.bucketEvents",
          sourcePaths: ["assetDepletionLedger.bucketEvents", "assetDepletionLedger.orderedBuckets"],
          supportingOnly: rule.usedSupportingOnly === true,
          identity: buildLiquidityBucketVisibleIdentity(rule, rule.usedId, firstUsedMonth),
          trace: {
            family: rule.family,
            sourceLabel: rule.sourceLabel,
            firstUsedMonth,
            initialValue,
            ledgerReconciliationStatus: getLedgerReconciliationTrace(assetDepletionLedger)
          }
        }));
      }

      const thresholdStartMonth = rule.family === "cash"
        ? firstUsedMonth ?? 0
        : firstUsedMonth;
      const nearly = thresholdStartMonth == null
        ? null
        : findBucketThresholdCrossing(assetDepletionLedger, rule.family, 3, 1, {
          earliestMonth: thresholdStartMonth
        });
      if (nearly && rule.nearlyId) {
        addLiquidityTriggerCandidate(bucketCandidates, makeLiquidityTriggerCandidate(rule.nearlyId, {
          monthIndex: nearly.monthIndex,
          amountValue: nearly.remainingValue,
          monthlyBurn: nearly.monthlyBurn,
          remainingValue: nearly.remainingValue,
          thresholdValue: nearly.thresholdValue,
          sourcePath: "assetDepletionLedger.ledgerMonths",
          sourcePaths: ["assetDepletionLedger.ledgerMonths.monthlyNetUse", "assetDepletionLedger.ledgerMonths.endingBuckets"],
          identity: buildLiquidityBucketVisibleIdentity(rule, rule.nearlyId, nearly.monthIndex),
          trace: {
            family: rule.family,
            sourceLabel: rule.sourceLabel,
            thresholdMonths: 3,
            firstUsedMonth,
            thresholdStartMonth,
            initialValue,
            ledgerReconciliationStatus: getLedgerReconciliationTrace(assetDepletionLedger)
          }
        }));
      }

      const depleted = thresholdStartMonth == null
        ? null
        : findBucketThresholdCrossing(assetDepletionLedger, rule.family, 1, null, {
          earliestMonth: thresholdStartMonth
        });
      if (depleted && rule.depletedId) {
        addLiquidityTriggerCandidate(bucketCandidates, makeLiquidityTriggerCandidate(rule.depletedId, {
          monthIndex: depleted.monthIndex,
          amountValue: depleted.remainingValue,
          monthlyBurn: depleted.monthlyBurn,
          remainingValue: depleted.remainingValue,
          thresholdValue: depleted.thresholdValue,
          sourcePath: "assetDepletionLedger.ledgerMonths",
          sourcePaths: ["assetDepletionLedger.ledgerMonths.monthlyNetUse", "assetDepletionLedger.ledgerMonths.endingBuckets"],
          identity: buildLiquidityBucketVisibleIdentity(rule, rule.depletedId, depleted.monthIndex),
          trace: {
            family: rule.family,
            sourceLabel: rule.sourceLabel,
            thresholdMonths: 1,
            firstUsedMonth,
            thresholdStartMonth,
            initialValue,
            ledgerReconciliationStatus: getLedgerReconciliationTrace(assetDepletionLedger)
          }
        }));
      }
      applyLiquidityBucketPrecedence(bucketCandidates, suppressedCandidates, rule).forEach(function (candidate) {
        addLiquidityTriggerCandidate(candidates, candidate);
      });
    });

    const cashValue = getInitialBucketFamilyValue(assetDepletionLedger, "cash");
    const cashFinalValue = getFinalBucketFamilyValue(assetDepletionLedger, "cash");
    const deeperBucketUsed = LIQUIDITY_DEEPER_THAN_CASH_FAMILIES.some(function (family) {
      return getFirstUsedMonthForFamily(assetDepletionLedger, family) != null;
    });
    if (cashValue > 0 && cashFinalValue > 0 && !deeperBucketUsed) {
      addLiquidityTriggerCandidate(candidates, makeLiquidityTriggerCandidate("cash-reserve-holds", {
        monthIndex: 0,
        amountValue: cashFinalValue,
        sourcePath: "assetDepletionLedger.orderedBuckets",
        sourcePaths: ["assetDepletionLedger.orderedBuckets", "assetDepletionLedger.ledgerMonths"],
        identity: buildLiquidityBucketVisibleIdentity(LIQUIDITY_BUCKET_RULES.cash, "cash-reserve-holds", 0),
        trace: {
          initialCashValue: cashValue,
          finalCashValue: cashFinalValue,
          deeperBucketUsed: false,
          ledgerReconciliationStatus: getLedgerReconciliationTrace(assetDepletionLedger)
        }
      }));
    }

    return candidates;
  }

  function buildLiquidityMilestoneTriggerCandidates(assetDepletionLedger, transitionOutlook, warnings) {
    const ledgerStatus = getAssetDepletionLedgerStatus(assetDepletionLedger);
    if (!isReadyAssetDepletionLedger(assetDepletionLedger)) {
      return {
        candidates: [],
        suppressedCandidates: [],
        ledgerStatus,
        usedForStoryline: false,
        trace: {
          ledgerStatus,
          canonicalLedgerRequired: true
        }
      };
    }

    const suppressedCandidates = [];
    const candidates = [];
    addLiquidityTriggerCandidate(
      candidates,
      buildNinetyDayCashWindowCandidate(assetDepletionLedger, transitionOutlook, warnings, suppressedCandidates)
    );
    buildBucketThresholdCandidates(assetDepletionLedger, warnings, suppressedCandidates).forEach(function (candidate) {
      addLiquidityTriggerCandidate(candidates, candidate);
    });

    const dedupedCandidates = dedupeCandidates(candidates);
    return {
      candidates: dedupedCandidates,
      suppressedCandidates,
      ledgerStatus,
      usedForStoryline: dedupedCandidates.length > 0,
      trace: {
        ledgerStatus,
        candidateIds: dedupedCandidates.map(function (candidate) { return candidate.id; }),
        suppressedCount: suppressedCandidates.length,
        canonicalLedgerUsed: true,
        monthlyBurnSource: hasReliableMonthlyBurn(assetDepletionLedger)
          ? "assetDepletionLedger.ledgerMonths.monthlyNetUse"
          : null
      }
    };
  }

  function getDebtRequiredPaymentSchedule(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const candidates = [
      safeInput.debtRequiredPaymentSchedule,
      safeInput.scenario?.trace?.layer3?.debtRequiredPaymentSchedule,
      safeInput.scenario?.postDeathSeries?.layer3?.trace?.debtRequiredPaymentSchedule
    ];
    return candidates.find(isPlainObject) || null;
  }

  function getDebtScheduleObligations(schedule) {
    return (Array.isArray(schedule?.obligations) ? schedule.obligations : [])
      .filter(isPlainObject)
      .filter(function (obligation) {
        return toOptionalNumber(obligation.monthlyAmount) != null
          && toOptionalNumber(obligation.monthlyAmount) > 0
          && obligation.paidOffAtDeath !== true;
      });
  }

  function getDebtRunoutMonth(input) {
    const source = isPlainObject(input) ? input : {};
    const runout = firstNumberAtPath(source, [
      "scenario.postDeathSeries.depletion.depletionMonthIndex",
      "scenario.postDeathSeries.depletion.monthIndex",
      "scenario.postDeathSeries.depletion.monthsCovered",
      "scenario.timelineFacts.monthsCovered",
      "graphModel.series.appliedRunwayScenarios.0.depletionPoint.monthIndex"
    ]);
    if (!runout) {
      return null;
    }
    const depletedFlag = getPath(source, "scenario.postDeathSeries.depletion.depleted");
    if (depletedFlag === false) {
      return null;
    }
    return runout.value;
  }

  function getDebtModeledHorizonMonth(input) {
    const source = isPlainObject(input) ? input : {};
    const points = getPath(source, "scenario.postDeathSeries.points");
    if (Array.isArray(points) && points.length) {
      return points.reduce(function (current, point, index) {
        const month = toOptionalNumber(point?.monthIndex);
        const safeMonth = month == null ? index : month;
        return current == null ? safeMonth : Math.max(current, safeMonth);
      }, null);
    }
    const horizon = firstNumberAtPath(source, [
      "scenario.scenario.projectionHorizonMonths",
      "scenario.projectionHorizonMonths"
    ]);
    if (horizon) {
      return horizon.value;
    }
    const horizonYears = firstNumberAtPath(source, ["options.projectionHorizonYears"]);
    return horizonYears ? horizonYears.value * 12 : null;
  }

  function isDebtObligationActiveAtMonth(obligation, monthIndex) {
    const month = toOptionalNumber(monthIndex);
    if (month == null) {
      return false;
    }
    const startDelayMonths = toOptionalNumber(obligation?.startDelayMonths) || 0;
    if (month <= startDelayMonths) {
      return false;
    }
    const activeMonthNumber = month - startDelayMonths;
    const termMonths = toOptionalNumber(obligation?.termMonths);
    if (termMonths != null && termMonths > 0 && activeMonthNumber > termMonths) {
      return false;
    }
    return true;
  }

  function getDebtObligationFirstActiveMonth(obligation) {
    const startDelayMonths = toOptionalNumber(obligation?.startDelayMonths) || 0;
    return startDelayMonths + 1;
  }

  function getDebtObligationLastActiveMonth(obligation, modeledHorizonMonth) {
    const startDelayMonths = toOptionalNumber(obligation?.startDelayMonths) || 0;
    const termMonths = toOptionalNumber(obligation?.termMonths);
    if (termMonths != null && termMonths > 0) {
      return startDelayMonths + termMonths;
    }
    return modeledHorizonMonth == null ? null : modeledHorizonMonth;
  }

  function getDebtScheduleSourcePaths(obligations) {
    return uniqueStrings((Array.isArray(obligations) ? obligations : []).flatMap(function (obligation) {
      return Array.isArray(obligation.sourcePaths) ? obligation.sourcePaths : [];
    }));
  }

  function makeDebtTriggerCandidate(candidateId, config) {
    const definition = findDefinition(candidateId);
    if (!definition) {
      return null;
    }
    const safeConfig = isPlainObject(config) ? config : {};
    const monthIndex = toOptionalNumber(safeConfig.monthIndex);
    const amountValue = toOptionalNumber(safeConfig.amountValue);
    const supportingOnly = safeConfig.supportingOnly === true;
    const candidate = makeCandidate(definition, {
      status: STATUSES.safeNow,
      safeToRender: true,
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      eligibleForGraphDot: true,
      eligibleForMajorCard: supportingOnly ? false : definition.eligibleForMajorCard === true,
      timingKind: "month-offset",
      timing: {
        monthOffset: monthIndex,
        label: monthIndex == null ? "Debt payments" : `Month ${monthIndex}`,
        sourcePath: safeConfig.sourcePath || "scenario.trace.layer3.debtRequiredPaymentSchedule"
      },
      amount: {
        value: amountValue,
        sourcePath: safeConfig.amountSourcePath || safeConfig.sourcePath || "scenario.trace.layer3.debtRequiredPaymentSchedule"
      },
      sourcePaths: uniqueStrings(safeConfig.sourcePaths || ["scenario.trace.layer3.debtRequiredPaymentSchedule"]),
      confidence: safeConfig.confidence ?? 0.88,
      priority: safeConfig.priority ?? definition.priority,
      suppressionKeys: safeConfig.suppressionKeys || [`required-debt-payment:${candidateId}`]
    });
    candidate.candidateSource = "required-debt-payment-trigger";
    candidate.supportingDotOnly = supportingOnly;
    candidate.supportingDotEligible = true;
    candidate.trace = Object.assign({
      candidateSource: "required-debt-payment-trigger",
      triggerId: candidateId,
      monthIndex,
      totalMonthlyDebtPayment: amountValue,
      activeDebtPaymentCount: safeConfig.activeDebtPaymentCount ?? null,
      runoutMonth: safeConfig.runoutMonth ?? null,
      modeledHorizonMonth: safeConfig.modeledHorizonMonth ?? null,
      supportingDotOnly: supportingOnly,
      aggregateRunwayPreserved: true,
      graphLineSource: "aggregate-survivor-runway"
    }, clonePlainValue(safeConfig.trace || {}));
    return candidate;
  }

  function buildDebtRequiredPaymentTriggerCandidates(input, warnings) {
    const schedule = getDebtRequiredPaymentSchedule(input);
    if (!isPlainObject(schedule) || normalizeString(schedule.status) !== "ready") {
      return {
        candidates: [],
        suppressedCandidates: [],
        usedForStoryline: false,
        trace: {
          scheduleStatus: normalizeString(schedule?.status) || "not-provided"
        }
      };
    }

    const obligations = getDebtScheduleObligations(schedule);
    if (!obligations.length) {
      return {
        candidates: [],
        suppressedCandidates: [],
        usedForStoryline: false,
        trace: {
          scheduleStatus: "ready",
          activeDebtPaymentCount: 0,
          excludedPaidOffAtDeathCount: Array.isArray(schedule.excludedObligations) ? schedule.excludedObligations.length : 0
        }
      };
    }

    const sourcePaths = getDebtScheduleSourcePaths(obligations);
    const totalMonthlyDebtPayment = obligations.reduce(function (total, obligation) {
      return total + (toOptionalNumber(obligation.monthlyAmount) || 0);
    }, 0);
    const modeledHorizonMonth = getDebtModeledHorizonMonth(input);
    const runoutMonth = getDebtRunoutMonth(input);
    const firstActiveMonth = obligations.reduce(function (current, obligation) {
      const first = getDebtObligationFirstActiveMonth(obligation);
      return current == null ? first : Math.min(current, first);
    }, null);
    const lastActiveMonth = obligations.reduce(function (current, obligation) {
      const last = getDebtObligationLastActiveMonth(obligation, modeledHorizonMonth);
      if (last == null) {
        return null;
      }
      return current == null ? last : Math.max(current, last);
    }, null);
    const candidates = [];

    candidates.push(makeDebtTriggerCandidate("minimum-debt-payments-continue", {
      monthIndex: firstActiveMonth,
      amountValue: totalMonthlyDebtPayment,
      sourcePaths,
      supportingOnly: true,
      activeDebtPaymentCount: obligations.length,
      runoutMonth,
      modeledHorizonMonth,
      trace: {
        scheduleStatus: "ready",
        obligationIds: obligations.map(function (obligation) { return obligation.id; })
      }
    }));

    if (runoutMonth != null) {
      const windowStart = Math.max(0, runoutMonth - 3);
      let activeInRunoutWindow = null;
      for (let month = windowStart; month <= runoutMonth; month += 1) {
        if (obligations.some(function (obligation) { return isDebtObligationActiveAtMonth(obligation, month); })) {
          activeInRunoutWindow = month;
          break;
        }
      }
      if (activeInRunoutWindow != null) {
        candidates.push(makeDebtTriggerCandidate("minimum-debt-payments-compete-with-expenses", {
          monthIndex: activeInRunoutWindow,
          amountValue: totalMonthlyDebtPayment,
          sourcePaths,
          activeDebtPaymentCount: obligations.length,
          runoutMonth,
          modeledHorizonMonth,
          trace: {
            runoutWindowStart: windowStart,
            runoutWindowEnd: runoutMonth,
            activeInRunoutWindow
          }
        }));
      }

      const unsupportedMonth = runoutMonth + 1;
      if (obligations.some(function (obligation) { return isDebtObligationActiveAtMonth(obligation, unsupportedMonth); })) {
        candidates.push(makeDebtTriggerCandidate("minimum-debt-payments-become-unsupported", {
          monthIndex: unsupportedMonth,
          amountValue: totalMonthlyDebtPayment,
          sourcePaths,
          activeDebtPaymentCount: obligations.length,
          runoutMonth,
          modeledHorizonMonth,
          trace: {
            unsupportedMonth
          }
        }));
      } else if (lastActiveMonth != null && lastActiveMonth <= runoutMonth) {
        candidates.push(makeDebtTriggerCandidate("required-debt-payments-covered", {
          monthIndex: lastActiveMonth,
          amountValue: totalMonthlyDebtPayment,
          sourcePaths,
          activeDebtPaymentCount: obligations.length,
          runoutMonth,
          modeledHorizonMonth,
          trace: {
            coverageBasis: "debts-end-before-runout"
          }
        }));
      }
    } else {
      candidates.push(makeDebtTriggerCandidate("required-debt-payments-covered", {
        monthIndex: lastActiveMonth ?? modeledHorizonMonth ?? firstActiveMonth,
        amountValue: totalMonthlyDebtPayment,
        sourcePaths,
        activeDebtPaymentCount: obligations.length,
        runoutMonth,
        modeledHorizonMonth,
        trace: {
          coverageBasis: "no-resource-runout-through-modeled-horizon"
        }
      }));
    }

    const compacted = compactObjects(candidates);
    return {
      candidates: dedupeCandidates(compacted),
      suppressedCandidates: [],
      usedForStoryline: compacted.length > 0,
      trace: {
        scheduleStatus: "ready",
        activeDebtPaymentCount: obligations.length,
        candidateIds: compacted.map(function (candidate) { return candidate.id; }),
        runoutMonth,
        modeledHorizonMonth,
        sourcePaths
      }
    };
  }

  function getScenarioPoints(input) {
    return Array.isArray(input?.scenario?.postDeathSeries?.points)
      ? input.scenario.postDeathSeries.points
      : [];
  }

  function getCoverageDurationCoverageSource(input) {
    return firstNumberAtPath(isPlainObject(input) ? input : {}, [
      "scenario.deathEvent.layer2.existingCoverage.treatedCoverageAmount",
      "scenario.deathEvent.layer2.resources.existingCoverage",
      "scenario.timelineFacts.coverageAdded",
      "scenario.deathEvent.coverageAdded",
      "financialRunway.existingCoverage"
    ]);
  }

  function getCoverageDurationWithRunoutMonth(input) {
    const source = isPlainObject(input) ? input : {};
    const depletedFlag = getPath(source, "scenario.postDeathSeries.depletion.depleted");
    if (depletedFlag === false) {
      return null;
    }
    const runout = firstNumberAtPath(source, [
      "scenario.postDeathSeries.depletion.depletionMonthIndex",
      "scenario.postDeathSeries.depletion.monthIndex",
      "scenario.postDeathSeries.depletion.monthsCovered",
      "scenario.timelineFacts.monthsCovered",
      "graphModel.series.appliedRunwayScenarios.0.depletionPoint.monthIndex"
    ]);
    return runout ? runout.value : null;
  }

  function getCoverageDurationModeledHorizonMonth(input) {
    const horizon = firstNumberAtPath(isPlainObject(input) ? input : {}, [
      "scenario.scenario.projectionHorizonMonths",
      "scenario.projectionHorizonMonths"
    ]);
    if (horizon) {
      return horizon.value;
    }
    const horizonYears = firstNumberAtPath(isPlainObject(input) ? input : {}, ["options.projectionHorizonYears"]);
    if (horizonYears) {
      return horizonYears.value * 12;
    }
    const points = getScenarioPoints(input);
    if (points.length) {
      const maxPointMonth = points.reduce(function (current, point, index) {
        const month = getPointMonthOffset(point, index);
        return current == null ? month : Math.max(current, month);
      }, null);
      if (maxPointMonth != null) {
        return maxPointMonth;
      }
    }
    return null;
  }

  function getCoveragePointRemainingResources(point) {
    return toOptionalNumber(
      point?.remainingResources
      ?? point?.endingResources
      ?? point?.availableResources
      ?? point?.resourcesRemaining
      ?? point?.survivorResources
    );
  }

  function getNoCoverageRunoutMonth(points, coverageAmount) {
    const amount = toOptionalNumber(coverageAmount);
    if (!Array.isArray(points) || !points.length || amount == null || amount <= 0) {
      return null;
    }
    let previousMonth = null;
    let previousValue = null;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const pointResources = getCoveragePointRemainingResources(point);
      if (pointResources == null) {
        continue;
      }
      const month = getPointMonthOffset(point, index);
      const noCoverageValue = pointResources - amount;
      if (noCoverageValue <= 0) {
        if (previousMonth == null || previousValue == null || previousValue <= 0) {
          return month;
        }
        const span = month - previousMonth;
        const delta = previousValue - noCoverageValue;
        if (span <= 0 || delta <= 0) {
          return month;
        }
        return Number((previousMonth + ((previousValue / delta) * span)).toFixed(2));
      }
      previousMonth = month;
      previousValue = noCoverageValue;
    }
    return null;
  }

  function makeCoverageDurationCandidate(candidateId, config) {
    const definition = findDefinition(candidateId);
    if (!definition) {
      return null;
    }
    const safeConfig = isPlainObject(config) ? config : {};
    const monthIndex = toOptionalNumber(safeConfig.monthIndex);
    const amountValue = toOptionalNumber(safeConfig.amountValue);
    const candidate = makeCandidate(definition, {
      status: STATUSES.safeNow,
      safeToRender: true,
      evidenceLevel: EVIDENCE_LEVELS.calculated,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      timingKind: "month-offset",
      timing: {
        monthOffset: monthIndex,
        label: monthIndex == null ? definition.displayLabel : `Month ${monthIndex}`,
        sourcePath: safeConfig.sourcePath || "scenario.postDeathSeries.points"
      },
      amount: {
        value: amountValue,
        sourcePath: safeConfig.amountSourcePath || safeConfig.sourcePath || "scenario.deathEvent.layer2.existingCoverage.treatedCoverageAmount"
      },
      sourcePaths: uniqueStrings(safeConfig.sourcePaths || [
        "scenario.deathEvent.layer2.existingCoverage.treatedCoverageAmount",
        "scenario.postDeathSeries.points"
      ]),
      confidence: safeConfig.confidence ?? 0.88,
      priority: safeConfig.priority ?? definition.priority,
      suppressionKeys: safeConfig.suppressionKeys || [`coverage-duration-trigger:${candidateId}`]
    });
    candidate.candidateSource = "coverage-duration-trigger";
    candidate.supportingDotOnly = true;
    candidate.supportingDotEligible = true;
    candidate.trace = Object.assign({
      candidateSource: "coverage-duration-trigger",
      triggerId: candidateId,
      monthIndex,
      existingCoverageAmount: amountValue,
      noCoverageRunoutMonth: toOptionalNumber(safeConfig.noCoverageRunoutMonth),
      withCoverageRunoutMonth: toOptionalNumber(safeConfig.withCoverageRunoutMonth),
      modeledHorizonMonth: toOptionalNumber(safeConfig.modeledHorizonMonth),
      extensionMonths: toOptionalNumber(safeConfig.extensionMonths),
      supportingDotOnly: true,
      mechanicalProceedsRemainDetailOnly: true,
      aggregateRunwayPreserved: true,
      graphLineSource: "aggregate-survivor-runway"
    }, clonePlainValue(safeConfig.trace || {}));
    return candidate;
  }

  function buildCoverageDurationTriggerCandidates(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const coverage = getCoverageDurationCoverageSource(safeInput);
    if (!coverage || coverage.value <= 0) {
      return {
        candidates: [],
        suppressedCandidates: [],
        usedForStoryline: false,
        trace: {
          status: "suppressed",
          reason: "missing-coverage-source",
          sourcePolicy: "coverage-duration-comparison"
        }
      };
    }

    const points = getScenarioPoints(safeInput);
    const modeledHorizonMonth = getCoverageDurationModeledHorizonMonth(safeInput);
    if (!points.length || modeledHorizonMonth == null) {
      return {
        candidates: [],
        suppressedCandidates: [],
        usedForStoryline: false,
        trace: {
          status: "suppressed",
          reason: "missing-runway-comparison-source",
          coverageAmount: coverage.value,
          coverageSourcePath: coverage.sourcePath,
          pointCount: points.length,
          modeledHorizonMonth,
          sourcePolicy: "coverage-duration-comparison"
        }
      };
    }

    const noCoverageRunoutMonth = getNoCoverageRunoutMonth(points, coverage.value);
    const withCoverageRunoutMonth = getCoverageDurationWithRunoutMonth(safeInput);
    const withCoverageDurationMonth = withCoverageRunoutMonth == null
      ? modeledHorizonMonth
      : withCoverageRunoutMonth;
    const candidates = [];
    const sourcePaths = uniqueStrings([
      coverage.sourcePath,
      "scenario.postDeathSeries.points",
      "scenario.postDeathSeries.depletion",
      "scenario.scenario.projectionHorizonMonths"
    ]);

    if (noCoverageRunoutMonth != null && withCoverageDurationMonth > noCoverageRunoutMonth) {
      const extensionMonths = Number((withCoverageDurationMonth - noCoverageRunoutMonth).toFixed(2));
      candidates.push(makeCoverageDurationCandidate("coverage-extends-runway", {
        monthIndex: noCoverageRunoutMonth,
        amountValue: coverage.value,
        sourcePath: "scenario.postDeathSeries.points",
        sourcePaths,
        noCoverageRunoutMonth,
        withCoverageRunoutMonth,
        modeledHorizonMonth,
        extensionMonths,
        trace: {
          comparisonBasis: "subtract-existing-coverage-from-with-coverage-resource-points",
          coverageSourcePath: coverage.sourcePath,
          pointCount: points.length
        }
      }));
    }

    if (withCoverageRunoutMonth != null && modeledHorizonMonth != null && withCoverageRunoutMonth < modeledHorizonMonth) {
      candidates.push(makeCoverageDurationCandidate("coverage-runs-out-before-needs-end", {
        monthIndex: withCoverageRunoutMonth,
        amountValue: coverage.value,
        sourcePath: "scenario.postDeathSeries.depletion",
        sourcePaths,
        noCoverageRunoutMonth,
        withCoverageRunoutMonth,
        modeledHorizonMonth,
        extensionMonths: noCoverageRunoutMonth == null ? null : Number((withCoverageRunoutMonth - noCoverageRunoutMonth).toFixed(2)),
        trace: {
          comparisonBasis: "with-coverage-depletion-before-modeled-horizon",
          coverageSourcePath: coverage.sourcePath,
          fundedThroughHorizon: false
        }
      }));
    }

    const dedupedCandidates = dedupeCandidates(compactObjects(candidates));
    return {
      candidates: dedupedCandidates,
      suppressedCandidates: [],
      usedForStoryline: dedupedCandidates.length > 0,
      trace: {
        status: dedupedCandidates.length ? "ready" : "no-trigger",
        candidateIds: dedupedCandidates.map(function (candidate) { return candidate.id; }),
        coverageAmount: coverage.value,
        coverageSourcePath: coverage.sourcePath,
        noCoverageRunoutMonth,
        withCoverageRunoutMonth,
        modeledHorizonMonth,
        extensionMonths: noCoverageRunoutMonth == null
          ? null
          : Number((withCoverageDurationMonth - noCoverageRunoutMonth).toFixed(2)),
        mechanicalProceedsRemainDetailOnly: true,
        sourcePolicy: "coverage-duration-comparison"
      }
    };
  }

  function getPointMonthOffset(point, fallbackIndex) {
    const month = toOptionalNumber(
      point?.monthIndex
      ?? point?.periodMonthIndex
      ?? point?.monthNumber
      ?? point?.elapsedMonths
      ?? point?.projectionMonth
    );
    return month == null ? fallbackIndex + 1 : month;
  }

  function scenarioHasAutoCompressionApplied(input, points) {
    return input?.scenario?.trace?.autoCompressedBaselineApplied === true
      || input?.scenario?.postDeathSeries?.trace?.autoCompressedBaselineApplied === true
      || (Array.isArray(points) && points.some(function (point) {
        return point?.trace?.autoCompressedBaselineApplied === true;
      }));
  }

  function getActualExpenseCompressionReduction(input) {
    const points = getScenarioPoints(input);
    if (!points.length || !scenarioHasAutoCompressionApplied(input, points)) {
      return null;
    }

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const monthlyDelta = toOptionalNumber(point?.monthlyHouseholdExpenseDelta ?? point?.trace?.monthlyHouseholdExpenseDelta);
      if (monthlyDelta == null || monthlyDelta >= 0) {
        continue;
      }
      const compressedExpenseAmount = toOptionalNumber(point?.survivorNeeds);
      const baselineExpenseAmount = compressedExpenseAmount == null
        ? null
        : roundMoney(compressedExpenseAmount - monthlyDelta);
      const reductionAmount = roundMoney(Math.abs(monthlyDelta));
      return {
        monthIndex: getPointMonthOffset(point, index),
        baselineExpenseAmount,
        compressedExpenseAmount,
        reductionAmount,
        reductionPercentage: baselineExpenseAmount && baselineExpenseAmount > 0
          ? Number(((reductionAmount / baselineExpenseAmount) * 100).toFixed(2))
          : null,
        sourcePaths: [
          "scenario.postDeathSeries.points[].monthlyHouseholdExpenseDelta",
          "scenario.postDeathSeries.points[].trace.autoCompressedBaselineApplied"
        ],
        trace: {
          sourcePointIndex: index,
          autoCompressedBaselineApplied: true,
          formula: normalizeString(input?.scenario?.trace?.compressionPath?.formula)
            || normalizeString(input?.scenario?.postDeathSeries?.trace?.formula)
            || null,
          compressionHorizon: clonePlainValue(input?.scenario?.trace?.compressionHorizon || null),
          compressionPath: clonePlainValue(input?.scenario?.trace?.compressionPath || null),
          monthlyHouseholdExpenseDelta: monthlyDelta,
          cumulativeHouseholdExpenseDelta: toOptionalNumber(point?.cumulativeHouseholdExpenseDelta ?? point?.trace?.cumulativeHouseholdExpenseDelta),
          autoCompressionProgress: toOptionalNumber(point?.trace?.autoCompressionProgress)
        }
      };
    }

    return null;
  }

  function getSurvivorIncomeTrace(input) {
    const candidates = [
      input?.scenario?.trace?.layer3?.survivorIncome,
      input?.scenario?.postDeathSeries?.layer3?.trace?.survivorIncome,
      input?.scenario?.postDeathSeries?.trace?.survivorIncome
    ];
    return candidates.find(isPlainObject) || null;
  }

  function getFirstPositiveSurvivorIncomeMonth(input, delayMonths) {
    const points = getScenarioPoints(input);
    for (let index = 0; index < points.length; index += 1) {
      const survivorIncome = toOptionalNumber(points[index]?.survivorIncome);
      if (survivorIncome != null && survivorIncome > 0) {
        return getPointMonthOffset(points[index], index);
      }
    }
    return delayMonths + 1;
  }

  function getDelayedSurvivorIncomeStart(input) {
    const survivorIncomeTrace = getSurvivorIncomeTrace(input);
    if (!isPlainObject(survivorIncomeTrace)) {
      return null;
    }
    if (normalizeString(survivorIncomeTrace.status) === "suppressed") {
      return null;
    }
    const annualAmount = toOptionalNumber(survivorIncomeTrace.annualAmount);
    const delayMonths = toOptionalNumber(survivorIncomeTrace.startDelayMonths);
    if (annualAmount == null || annualAmount <= 0 || delayMonths == null || delayMonths <= 0) {
      return null;
    }
    const monthlyAmount = roundMoney(annualAmount / 12);
    const startMonth = getFirstPositiveSurvivorIncomeMonth(input, delayMonths);
    return {
      monthIndex: startMonth,
      monthlyAmount,
      annualAmount,
      startDelayMonths: delayMonths,
      startMonth,
      sourcePaths: uniqueStrings(survivorIncomeTrace.sourcePaths || [
        "scenario.trace.layer3.survivorIncome",
        "lensModel.survivorScenario.survivorNetAnnualIncome",
        "lensModel.survivorScenario.survivorIncomeStartDelayMonths"
      ]),
      trace: {
        survivorIncomeTrace: clonePlainValue(survivorIncomeTrace),
        assumptionControlSource: survivorIncomeTrace.scenarioOverride === true
          ? "scenarioOptions.includeSurvivorIncome"
          : "analysisSettings.survivorSupportAssumptions",
        startDelayMonths: delayMonths,
        startMonth,
        monthlySurvivorIncomeAmount: monthlyAmount
      }
    };
  }

  function makeSupportingDotTriggerCandidate(candidateId, config) {
    const definition = findDefinition(candidateId);
    if (!definition) {
      return null;
    }
    const safeConfig = isPlainObject(config) ? config : {};
    const monthIndex = toOptionalNumber(safeConfig.monthIndex);
    const amountValue = toOptionalNumber(safeConfig.amountValue);
    const candidate = makeCandidate(definition, {
      status: STATUSES.safeNow,
      safeToRender: true,
      evidenceLevel: safeConfig.evidenceLevel || definition.evidenceLevel,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false,
      timingKind: "month-offset",
      timing: {
        monthOffset: monthIndex,
        label: monthIndex == null ? definition.displayLabel : `Month ${monthIndex}`,
        sourcePath: safeConfig.sourcePath || "scenario.postDeathSeries.points"
      },
      amount: {
        value: amountValue,
        sourcePath: safeConfig.amountSourcePath || safeConfig.sourcePath || "scenario.postDeathSeries.points"
      },
      sourcePaths: uniqueStrings(safeConfig.sourcePaths || [safeConfig.sourcePath || "scenario.postDeathSeries.points"]),
      confidence: safeConfig.confidence ?? 0.88,
      priority: safeConfig.priority ?? definition.priority,
      suppressionKeys: safeConfig.suppressionKeys || [`supporting-dot-trigger:${candidateId}`]
    });
    candidate.candidateSource = "supporting-dot-trigger";
    candidate.supportingDotOnly = true;
    candidate.supportingDotEligible = true;
    candidate.trace = Object.assign({
      candidateSource: "supporting-dot-trigger",
      triggerId: candidateId,
      monthIndex,
      supportingDotOnly: true,
      aggregateRunwayPreserved: true,
      graphLineSource: "aggregate-survivor-runway"
    }, clonePlainValue(safeConfig.trace || {}));
    return candidate;
  }

  function buildSupportingDotTriggerCandidates(input) {
    const candidates = [];
    const compressionReduction = getActualExpenseCompressionReduction(input);
    if (compressionReduction) {
      candidates.push(makeSupportingDotTriggerCandidate("spending-begins-to-compress", {
        monthIndex: compressionReduction.monthIndex,
        amountValue: compressionReduction.reductionAmount,
        sourcePath: "scenario.postDeathSeries.points[].monthlyHouseholdExpenseDelta",
        sourcePaths: compressionReduction.sourcePaths,
        trace: Object.assign({
          baselineExpenseAmount: compressionReduction.baselineExpenseAmount,
          compressedExpenseAmount: compressionReduction.compressedExpenseAmount,
          reductionAmount: compressionReduction.reductionAmount,
          reductionPercentage: compressionReduction.reductionPercentage
        }, compressionReduction.trace)
      }));
    }

    const survivorIncomeStart = getDelayedSurvivorIncomeStart(input);
    if (survivorIncomeStart) {
      candidates.push(makeSupportingDotTriggerCandidate("survivor-income-begins", {
        monthIndex: survivorIncomeStart.monthIndex,
        amountValue: survivorIncomeStart.monthlyAmount,
        sourcePath: "scenario.trace.layer3.survivorIncome",
        sourcePaths: survivorIncomeStart.sourcePaths,
        trace: Object.assign({
          monthlySurvivorIncomeAmount: survivorIncomeStart.monthlyAmount,
          annualSurvivorIncomeAmount: survivorIncomeStart.annualAmount,
          startDelayMonths: survivorIncomeStart.startDelayMonths,
          startMonth: survivorIncomeStart.startMonth
        }, survivorIncomeStart.trace)
      }));
    }

    const compacted = compactObjects(candidates);
    return {
      candidates: dedupeCandidates(compacted),
      suppressedCandidates: [],
      usedForStoryline: compacted.length > 0,
      trace: {
        candidateIds: compacted.map(function (candidate) { return candidate.id; }),
        compressionReductionDetected: Boolean(compressionReduction),
        survivorIncomeDelayedStartDetected: Boolean(survivorIncomeStart),
        sourcePolicy: "source-backed-supporting-dot-triggers"
      }
    };
  }

  function getHousingRiskEvents(housingRisk) {
    if (!isPlainObject(housingRisk)) {
      return [];
    }
    const seen = new Set();
    return []
      .concat(Array.isArray(housingRisk.timelineEvents) ? housingRisk.timelineEvents : [])
      .concat(Array.isArray(housingRisk.riskEvents) ? housingRisk.riskEvents : [])
      .filter(isPlainObject)
      .filter(function (event) {
        const key = normalizeString(event.id)
          || [
            normalizeString(event.family),
            normalizeString(event.eventType),
            normalizeString(event.displayLabel),
            normalizeString(event.sourcePath)
          ].join(":");
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function normalizeHousingEvidenceLevel(event) {
    const level = normalizeString(event?.evidenceLevel);
    if (level === EVIDENCE_LEVELS.calculated) {
      return EVIDENCE_LEVELS.calculated;
    }
    if (level === EVIDENCE_LEVELS.traceBacked) {
      return EVIDENCE_LEVELS.traceBacked;
    }
    if (level === EVIDENCE_LEVELS.assumptionBacked) {
      return EVIDENCE_LEVELS.assumptionBacked;
    }
    if (level === EVIDENCE_LEVELS.estimated) {
      return EVIDENCE_LEVELS.estimated;
    }
    if (level === EVIDENCE_LEVELS.dataGap) {
      return EVIDENCE_LEVELS.dataGap;
    }
    if (level === EVIDENCE_LEVELS.insufficientData) {
      return EVIDENCE_LEVELS.insufficientData;
    }
    return level || EVIDENCE_LEVELS.insufficientData;
  }

  function getHousingEventAmount(event) {
    if (!isPlainObject(event)) {
      return null;
    }
    const amountSource = isPlainObject(event.amount) ? event.amount : { value: event.amount };
    const value = toOptionalNumber(amountSource.value);
    if (value == null) {
      return null;
    }
    return {
      value,
      sourcePath: normalizeString(amountSource.sourcePath || event.sourcePath || event.trace?.paymentSourcePath)
    };
  }

  function getHousingEventTraceSourcePaths(event) {
    if (!isPlainObject(event?.trace)) {
      return [];
    }
    return Object.keys(event.trace).reduce(function (paths, key) {
      if (/sourcepath$/i.test(key) && normalizeString(event.trace[key])) {
        paths.push(event.trace[key]);
      }
      return paths;
    }, []);
  }

  function getHousingEventSourcePaths(event) {
    if (!isPlainObject(event)) {
      return [];
    }
    return uniqueStrings([
      event.sourcePath,
      isPlainObject(event.amount) ? event.amount.sourcePath : null
    ].concat(getHousingEventTraceSourcePaths(event)));
  }

  function isForbiddenHousingRiskEvent(event) {
    const text = [
      normalizeString(event?.eventType),
      normalizeString(event?.displayLabel),
      normalizeString(event?.graphLabel),
      normalizeString(event?.cardTitle)
    ].join(" ").toLowerCase();
    return /\b(foreclosure|eviction|bankruptcy|credit[-\s]?crisis|forced[-\s]?(home[-\s]?)?sale|legal[-\s]?default)\b/.test(text);
  }

  function makeSuppressedHousingRiskCandidate(event, reason) {
    const sourcePaths = getHousingEventSourcePaths(event);
    return {
      id: normalizeString(event?.id) || [
        "housing-risk-event",
        normalizeString(event?.eventType) || "unsupported"
      ].join("."),
      family: normalizeString(event?.family || EVENT_FAMILIES.housingRisk),
      displayLabel: normalizeString(event?.displayLabel),
      graphLabel: normalizeString(event?.displayLabel),
      cardTitle: normalizeString(event?.displayLabel),
      description: normalizeString(reason),
      severity: "deferred",
      evidenceLevel: normalizeHousingEvidenceLevel(event),
      status: STATUSES.deferred,
      safeToRender: false,
      eligibleForGraphDot: false,
      eligibleForMajorCard: false,
      timing: makeTiming("month-offset", {
        monthOffset: event?.monthOffset,
        date: event?.date,
        label: normalizeString(event?.date) || (event?.monthOffset != null ? `Month ${event.monthOffset}` : ""),
        sourcePath: normalizeString(event?.sourcePath)
      }),
      amount: getHousingEventAmount(event) || makeEmptyAmount(),
      sources: sourcePaths.map(function (sourcePath) {
        return {
          sourcePath,
          evidenceLevel: normalizeHousingEvidenceLevel(event)
        };
      }),
      confidence: 0,
      lifeInsuranceRelevance: 0,
      emotionalWeight: 0,
      advisorUsefulness: 0,
      suppressionKeys: ["housing-risk-insufficient"],
      deferredReason: reason,
      warnings: compactObjects(event?.warnings).map(clonePlainValue),
      priority: 999
    };
  }

  function buildHousingRiskBackedCandidates(housingRisk, warnings) {
    if (!isPlainObject(housingRisk)) {
      return {
        candidates: [],
        suppressedCandidates: []
      };
    }

    const events = getHousingRiskEvents(housingRisk);
    const candidates = [];
    const suppressedCandidates = [];
    const hasStrongerHousingEvent = events.some(function (event) {
      const eventType = normalizeString(event.eventType);
      const eventEvidence = normalizeHousingEvidenceLevel(event);
      return eventType !== "housing-risk-unknown"
        && HOUSING_RISK_EVENT_MAPPINGS[eventType]
        && event.safeToRender === true
        && eventEvidence !== EVIDENCE_LEVELS.insufficientData
        && !isForbiddenHousingRiskEvent(event);
    });

    events.forEach(function (event) {
      const eventType = normalizeString(event.eventType);
      const mapping = HOUSING_RISK_EVENT_MAPPINGS[eventType];
      const eventEvidence = normalizeHousingEvidenceLevel(event);
      const amount = getHousingEventAmount(event);
      const hasTiming = toOptionalNumber(event.monthOffset) != null
        || Boolean(normalizeString(event.date))
        || Boolean(normalizeString(event.timing?.label));
      const sourcePaths = getHousingEventSourcePaths(event);
      const isUnknown = eventType === "housing-risk-unknown";
      const dataGapWarrantsUnknown = isUnknown
        && eventEvidence === EVIDENCE_LEVELS.dataGap
        && compactObjects(event.warnings).length > 0
        && !hasStrongerHousingEvent;
      const unsupportedReason = !mapping
        ? "Housing-risk event does not map to a safe storyline candidate in this pass."
        : isForbiddenHousingRiskEvent(event)
          ? "Housing-risk event is reserved for a future legal/default risk model."
          : event.safeToRender !== true
            ? "Housing-risk event is not marked safe to render."
            : eventEvidence === EVIDENCE_LEVELS.insufficientData
              ? "Housing-risk event has insufficient evidence."
              : mapping.dataGapOnly === true && !dataGapWarrantsUnknown
                ? "Housing-risk unknown event did not meet data-gap caution requirements."
                : !hasTiming
                  ? "Housing-risk event has no usable timing."
                  : !amount && !isUnknown
                    ? "Housing-risk event has no usable amount."
                    : !sourcePaths.length
                      ? "Housing-risk event has no traceable source path."
                      : "";

      if (unsupportedReason) {
        suppressedCandidates.push(makeSuppressedHousingRiskCandidate(event, unsupportedReason));
        warnings.push(makeWarning(
          "housing-risk-event-not-activated",
          unsupportedReason,
          sourcePaths.length ? sourcePaths : [normalizeString(event.sourcePath)].filter(Boolean),
          {
            eventId: normalizeString(event.id),
            eventType,
            displayLabel: normalizeString(event.displayLabel)
          }
        ));
        return;
      }

      const definition = findAnyDefinition(mapping.candidateId);
      if (!definition) {
        warnings.push(makeWarning(
          "missing-housing-risk-storyline-definition",
          "A supported housing-risk event did not have a matching storyline registry candidate.",
          sourcePaths,
          {
            candidateId: mapping.candidateId,
            eventId: normalizeString(event.id)
          }
        ));
        suppressedCandidates.push(makeSuppressedHousingRiskCandidate(
          event,
          "No matching storyline registry candidate exists."
        ));
        return;
      }

      const status = eventEvidence === EVIDENCE_LEVELS.dataGap ? STATUSES.caution : STATUSES.safeNow;
      candidates.push(makeCandidate(definition, {
        status,
        safeToRender: true,
        evidenceLevel: eventEvidence,
        eligibleForGraphDot: mapping.eligibleForGraphDot === true,
        eligibleForMajorCard: mapping.eligibleForMajorCard === true,
        timingKind: "month-offset",
        timing: {
          monthOffset: event.monthOffset,
          date: event.date,
          label: normalizeString(event.date) || (event.monthOffset != null ? `Month ${event.monthOffset}` : ""),
          sourcePath: normalizeString(event.sourcePath)
        },
        amount: amount || makeEmptyAmount(),
        sourcePaths,
        confidence: eventEvidence === EVIDENCE_LEVELS.calculated
          ? 0.9
          : eventEvidence === EVIDENCE_LEVELS.traceBacked
            ? 0.84
            : eventEvidence === EVIDENCE_LEVELS.estimated
              ? 0.72
              : eventEvidence === EVIDENCE_LEVELS.dataGap
                ? 0.42
                : 0.68,
        priority: mapping.priority,
        warnings: compactObjects(event.warnings),
        suppressionKeys: [`housing-risk:${eventType}`]
      }));
    });

    return {
      candidates: dedupeCandidates(candidates),
      suppressedCandidates
    };
  }

  function dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter(function (candidate) {
      if (!candidate.id || seen.has(candidate.id)) {
        return false;
      }
      seen.add(candidate.id);
      return true;
    });
  }

  function includesValue(items, value) {
    return Array.isArray(items) && items.includes(value);
  }

  function getStoryRole(candidate) {
    const id = normalizeString(candidate?.id);
    if (id === "death-income-stops") {
      return STORY_ROLES.trigger;
    }
    if (includesValue(INSURANCE_CONTEXT_IDS, id)) {
      return STORY_ROLES.insuranceContext;
    }
    if (includesValue(LIQUIDITY_CRISIS_IDS, id)) {
      return STORY_ROLES.liquidityCrisis;
    }
    if (includesValue(FAMILY_STABILITY_IDS, id)) {
      return STORY_ROLES.familyStability;
    }
    if (includesValue(LONG_TERM_SACRIFICE_IDS, id)) {
      return STORY_ROLES.longTermSacrifice;
    }
    if (includesValue(SUPPORT_FAILURE_IDS, id)) {
      return STORY_ROLES.supportFailure;
    }
    if (includesValue(DATA_QUALITY_IDS, id) || candidate?.family === EVENT_FAMILIES.dataQuality) {
      return STORY_ROLES.dataQuality;
    }
    return STORY_ROLES.other;
  }

  function hasUsableTiming(candidate) {
    if (!candidate || !isPlainObject(candidate.timing)) {
      return false;
    }
    return toOptionalNumber(candidate.timing.monthOffset) != null
      || Boolean(normalizeString(candidate.timing.date))
      || Boolean(normalizeString(candidate.timing.label))
      || candidate.timing.kind === "death-event";
  }

  function graphTimingIsUsable(candidate) {
    if (!candidate || !isPlainObject(candidate.timing)) {
      return false;
    }
    return toOptionalNumber(candidate.timing.monthOffset) != null
      || Boolean(normalizeString(candidate.timing.date))
      || candidate.timing.kind === "death-event";
  }

  function timingSortValue(candidate) {
    const monthOffset = toOptionalNumber(candidate?.timing?.monthOffset);
    if (monthOffset != null) {
      return monthOffset;
    }
    if (candidate?.id === "death-income-stops" || candidate?.timing?.kind === "death-event") {
      return 0;
    }
    return 999999;
  }

  function evidenceScore(candidate) {
    switch (candidate?.evidenceLevel) {
      case EVIDENCE_LEVELS.calculated:
        return 32;
      case EVIDENCE_LEVELS.traceBacked:
        return 28;
      case EVIDENCE_LEVELS.assumptionBacked:
        return 22;
      case EVIDENCE_LEVELS.estimated:
        return 14;
      case EVIDENCE_LEVELS.dataGap:
        return -18;
      default:
        return -80;
    }
  }

  function severityScore(candidate) {
    switch (candidate?.severity) {
      case "critical":
        return 20;
      case "caution":
        return 12;
      case "positive":
        return 9;
      case "info":
        return 7;
      default:
        return 0;
    }
  }

  function roleScore(candidate) {
    switch (getStoryRole(candidate)) {
      case STORY_ROLES.insuranceContext:
        return 24;
      case STORY_ROLES.liquidityCrisis:
        return 23;
      case STORY_ROLES.familyStability:
        return 22;
      case STORY_ROLES.longTermSacrifice:
        return 21;
      case STORY_ROLES.supportFailure:
        return 24;
      case STORY_ROLES.dataQuality:
        return -16;
      default:
        return 4;
    }
  }

  function idSpecificScore(candidate) {
    switch (candidate?.id) {
      case "death-income-stops":
        return 1000;
      case "emergency-fund-depleted":
        return 42;
      case "education-savings-depleted":
        return 40;
      case "retirement-assets-tapped":
        return 38;
      case "cash-savings-depleted":
        return 28;
      case "checking-savings-depleted":
        return 10;
      case "liquid-investments-depleted":
        return 8;
      case "taxable-assets-depleted":
        return 7;
      case "education-funding-at-risk":
        return 12;
      case "mortgage-payment-at-risk":
      case "mortgage-payment-becomes-unsupported":
      case "rent-payment-at-risk":
      case "rent-payment-becomes-unsupported":
      case "housing-costs-become-unsupported":
        return 40;
      case "housing-stability-at-risk":
        return 38;
      case "housing-costs-begin-pressuring-plan":
      case "mortgage-payment-pressure-begins":
      case "rent-payment-pressure-begins":
        return 5;
      case "housing-risk-unknown":
        return -24;
      case "retirement-assets-depleted":
        return 18;
      case "monthly-support-gap-begins":
        return 36;
      case "unfunded-need-accumulates":
        return 30;
      case "resources-run-out":
        return 12;
      default:
        return 0;
    }
  }

  function isSelectableRenderable(candidate) {
    return candidate?.safeToRender === true
      && (candidate.status === STATUSES.safeNow || candidate.status === STATUSES.caution)
      && candidate.evidenceLevel !== EVIDENCE_LEVELS.insufficientData
      && candidate.evidenceLevel !== EVIDENCE_LEVELS.unsupported
      && candidate.evidenceLevel !== EVIDENCE_LEVELS.deferred
      && candidate.evidenceLevel !== EVIDENCE_LEVELS.waterfallNeeded
      && candidate.evidenceLevel !== EVIDENCE_LEVELS.riskModelNeeded
      && candidate.evidenceLevel !== EVIDENCE_LEVELS.displayOnly;
  }

  function scoreCandidateForMajorStory(candidate) {
    if (!isSelectableRenderable(candidate)) {
      return -9999;
    }
    const basePriority = Math.max(0, 120 - (toOptionalNumber(candidate.priority) ?? 999));
    const metadata = ((toOptionalNumber(candidate.lifeInsuranceRelevance) ?? 0) * 18)
      + ((toOptionalNumber(candidate.emotionalWeight) ?? 0) * 18)
      + ((toOptionalNumber(candidate.advisorUsefulness) ?? 0) * 18)
      + ((toOptionalNumber(candidate.confidence) ?? 0) * 12);
    return basePriority
      + majorStoryTierScore(candidate)
      + metadata
      + evidenceScore(candidate)
      + severityScore(candidate)
      + roleScore(candidate)
      + idSpecificScore(candidate)
      + (hasUsableTiming(candidate) ? 5 : -4)
      + (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap ? -20 : 0);
  }

  function scoreCandidateForGraphDot(candidate) {
    if (!isSelectableRenderable(candidate) || !candidate.eligibleForGraphDot) {
      return -9999;
    }
    if (!graphTimingIsUsable(candidate)) {
      return -9999;
    }
    const basePriority = Math.max(0, 110 - (toOptionalNumber(candidate.priority) ?? 999));
    return basePriority
      + evidenceScore(candidate)
      + severityScore(candidate)
      + idSpecificScore(candidate)
      + ((toOptionalNumber(candidate.lifeInsuranceRelevance) ?? 0) * 12)
      + ((toOptionalNumber(candidate.advisorUsefulness) ?? 0) * 10)
      + ((toOptionalNumber(candidate.confidence) ?? 0) * 8)
      + (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap ? -24 : 0)
      - Math.min(timingSortValue(candidate), 120) * 0.08;
  }

  function compareCandidatesForScore(scoreFn) {
    return function (left, right) {
      return scoreFn(right) - scoreFn(left)
        || (toOptionalNumber(left.priority) ?? 999) - (toOptionalNumber(right.priority) ?? 999)
        || timingSortValue(left) - timingSortValue(right)
        || normalizeString(left.id).localeCompare(normalizeString(right.id));
    };
  }

  function countBy(items, keyFn) {
    return items.reduce(function (counts, item) {
      const key = keyFn(item) || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function familyCount(selected, family) {
    return selected.filter(function (candidate) {
      return candidate.family === family;
    }).length;
  }

  function storyRoleCount(selected, role) {
    return selected.filter(function (candidate) {
      return getStoryRole(candidate) === role;
    }).length;
  }

  function hasUnrepresentedAlternativeFamily(pool, selected) {
    const selectedIds = new Set(selected.map(function (candidate) { return candidate.id; }));
    const selectedFamilies = new Set(selected.map(function (candidate) { return candidate.family; }));
    return pool.some(function (candidate) {
      return !selectedIds.has(candidate.id) && !selectedFamilies.has(candidate.family);
    });
  }

  function hasUnselectedAlternativeStoryRole(pool, selected, role) {
    const selectedIds = new Set(selected.map(function (candidate) { return candidate.id; }));
    return pool.some(function (candidate) {
      return !selectedIds.has(candidate.id) && getStoryRole(candidate) !== role;
    });
  }

  function severityRank(candidate) {
    switch (candidate?.severity) {
      case "critical":
        return 4;
      case "caution":
        return 3;
      case "positive":
        return 2;
      case "info":
        return 1;
      default:
        return 0;
    }
  }

  function isMateriallyLaterAndMoreSevere(candidate, selectedSameGroup) {
    if (!Array.isArray(selectedSameGroup) || !selectedSameGroup.length) {
      return false;
    }
    const candidateTiming = timingSortValue(candidate);
    const candidateSeverity = severityRank(candidate);
    return selectedSameGroup.some(function (selectedCandidate) {
      return candidateTiming >= timingSortValue(selectedCandidate) + 3
        && candidateSeverity > severityRank(selectedCandidate);
    });
  }

  function canSelectForMajor(candidate, selected, pool, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    if (selected.some(function (item) { return item.id === candidate.id; })) {
      return false;
    }
    if (safeOptions.enforceDiversity === false || candidate.id === "death-income-stops") {
      return true;
    }
    const selectedSameFamily = selected.filter(function (item) {
      return item.family === candidate.family;
    });
    const candidateRole = getStoryRole(candidate);
    const selectedSameRole = selected.filter(function (item) {
      return getStoryRole(item) === candidateRole;
    });
    if (
      candidateRole === STORY_ROLES.supportFailure
      && storyRoleCount(selected, candidateRole) >= 1
      && hasUnselectedAlternativeStoryRole(pool, selected, candidateRole)
      && !isMateriallyLaterAndMoreSevere(candidate, selectedSameRole)
    ) {
      return false;
    }
    if (!familyCount(selected, candidate.family)) {
      return true;
    }
    if (!hasUnrepresentedAlternativeFamily(pool, selected)) {
      return selectedSameFamily.length < 2;
    }
    return selectedSameFamily.length < 2 && isMateriallyLaterAndMoreSevere(candidate, selectedSameFamily);
  }

  function sortByMajorScore(candidates) {
    return candidates.slice().sort(compareCandidatesForScore(scoreCandidateForMajorStory));
  }

  function sortByGraphScore(candidates) {
    return candidates.slice().sort(compareCandidatesForScore(scoreCandidateForGraphDot));
  }

  function makeSelectionSuppressedCandidate(candidate, reason, surface) {
    const copy = clonePlainValue(candidate);
    copy.safeToRender = false;
    copy.eligibleForGraphDot = surface === "graph-dot" ? false : copy.eligibleForGraphDot;
    copy.eligibleForMajorCard = surface === "major-story" ? false : copy.eligibleForMajorCard;
    copy.eventCategory = copy.eventCategory || resolveStoryRole(copy);
    copy.majorTier = copy.majorTier || getMajorStoryTier(copy);
    copy.selectedAs = "suppressed";
    copy.selectionSurface = surface;
    copy.selectionSuppressionReason = reason;
    copy.suppressionReason = reason;
    if (reason === "family-diversity") {
      copy.familyDiversityReason = "family already represented by a selected major story candidate while alternatives exist";
    }
    copy.suppressionKeys = uniqueStrings([copy.suppressionKeys, reason].flat());
    copy.deferredReason = reason;
    return copy;
  }

  function suppressUnselected(pool, selected, reasonForCandidate, surface) {
    const selectedIds = new Set(selected.map(function (candidate) { return candidate.id; }));
    return pool
      .filter(function (candidate) { return !selectedIds.has(candidate.id); })
      .map(function (candidate) {
        return makeSelectionSuppressedCandidate(candidate, reasonForCandidate(candidate), surface);
      });
  }

  function selectMajorStoryCandidates(candidates, options) {
    const pool = sortByMajorScore(dedupeCandidates(candidates).filter(function (candidate) {
      return isSelectableRenderable(candidate)
        && isVisibleStorylineCandidate(candidate)
        && candidate.eligibleForMajorCard === true;
    }));
    const selected = [];
    const deathCandidate = pool.find(function (candidate) {
      return candidate.id === "death-income-stops";
    });
    if (deathCandidate) {
      selected.push(deathCandidate);
    }

    [
      MAJOR_STORY_TIERS.tier1,
      MAJOR_STORY_TIERS.tier2,
      MAJOR_STORY_TIERS.tier3
    ].forEach(function (tier) {
      sortByMajorScore(pool.filter(function (candidate) {
        return getMajorStoryTier(candidate) === tier;
      })).forEach(function (candidate) {
        if (selected.length >= MAX_MAJOR_STORY_CANDIDATES) {
          return;
        }
        if (canSelectForMajor(candidate, selected, pool, options)) {
          selected.push(candidate);
        }
      });
    });

    pool.forEach(function (candidate) {
      if (selected.length >= MAX_MAJOR_STORY_CANDIDATES) {
        return;
      }
      if (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap || getMajorStoryTier(candidate) === MAJOR_STORY_TIERS.dataConfidence) {
        const strongerRemaining = pool.some(function (item) {
          return item.id !== candidate.id
            && !selected.some(function (selectedCandidate) { return selectedCandidate.id === item.id; })
            && item.evidenceLevel !== EVIDENCE_LEVELS.dataGap
            && getMajorStoryTier(item) !== MAJOR_STORY_TIERS.dataConfidence;
        });
        if (strongerRemaining) {
          return;
        }
      }
      if (canSelectForMajor(candidate, selected, pool, options)) {
        selected.push(candidate);
      }
    });

    const suppressed = suppressUnselected(pool, selected, function (candidate) {
      if (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap) {
        return "data-gap-lower-priority";
      }
      if (!canSelectForMajor(candidate, selected, pool, options)) {
        return "family-diversity";
      }
      return selected.length >= MAX_MAJOR_STORY_CANDIDATES ? "major-card-cap" : "lower-priority";
    }, "major-story");

    return {
      selected: selected.map(function (candidate) {
        return Object.assign({}, clonePlainValue(candidate), {
          eventCategory: candidate.eventCategory || resolveStoryRole(candidate),
          majorTier: candidate.majorTier || getMajorStoryTier(candidate),
          selectedAs: "major"
        });
      }),
      suppressed
    };
  }

  function makeGraphDotCandidate(candidate, tier, metadata) {
    return Object.assign({}, clonePlainValue(candidate), {
      dotTier: tier,
      connectedToMajorCard: tier === "major",
      majorCardIndex: tier === "major" ? toOptionalNumber(metadata?.majorCardIndex) : null,
      eligibleForConnector: tier === "major",
      eventCategory: candidate.eventCategory || resolveStoryRole(candidate),
      majorTier: candidate.majorTier || getMajorStoryTier(candidate),
      selectedAs: tier
    });
  }

  function selectMajorGraphDotCandidates(majorStoryCandidates) {
    const candidates = Array.isArray(majorStoryCandidates) ? majorStoryCandidates : [];
    const eligible = candidates.filter(function (candidate) {
      return isSelectableRenderable(candidate) && candidate.eligibleForGraphDot === true;
    });
    const missingTiming = eligible.filter(function (candidate) {
      return !graphTimingIsUsable(candidate);
    });
    const timedPool = eligible.filter(function (candidate) {
      return graphTimingIsUsable(candidate);
    });
    const selected = timedPool.slice(0, MAX_MAJOR_GRAPH_DOT_CANDIDATES).map(function (candidate) {
      return makeGraphDotCandidate(candidate, "major", {
        majorCardIndex: candidates.findIndex(function (item) {
          return item.id === candidate.id;
        })
      });
    });
    const selectedIds = new Set(selected.map(function (candidate) { return candidate.id; }));
    const capSuppressed = timedPool
      .filter(function (candidate) { return !selectedIds.has(candidate.id); })
      .map(function (candidate) {
        return makeSelectionSuppressedCandidate(candidate, "major-graph-dot-cap", "major-graph-dot");
      });
    const timingSuppressed = missingTiming.map(function (candidate) {
      return makeSelectionSuppressedCandidate(candidate, "missing-timing-for-major-dot", "major-graph-dot");
    });
    return {
      selected,
      suppressed: timingSuppressed.concat(capSuppressed)
    };
  }

  function selectMicroGraphDotCandidates(candidates, majorStoryCandidates) {
    const eligible = dedupeCandidates(candidates).filter(function (candidate) {
      return isSelectableRenderable(candidate)
        && isVisibleStorylineCandidate(candidate)
        && candidate.eligibleForGraphDot === true;
    });
    const majorIds = new Set((Array.isArray(majorStoryCandidates) ? majorStoryCandidates : []).map(function (candidate) {
      return normalizeString(candidate.id);
    }).filter(Boolean));
    const duplicateMajorCandidates = eligible.filter(function (candidate) {
      return majorIds.has(normalizeString(candidate.id));
    });
    const microEligible = eligible.filter(function (candidate) {
      return !majorIds.has(normalizeString(candidate.id));
    });
    const missingTiming = microEligible.filter(function (candidate) {
      return !graphTimingIsUsable(candidate);
    });
    const timedPool = sortByGraphScore(microEligible.filter(function (candidate) {
      return graphTimingIsUsable(candidate);
    }));
    const selected = [];
    const selectedFamilyCounts = {};
    timedPool.forEach(function (candidate) {
      if (selected.length >= MAX_MICRO_GRAPH_DOT_CANDIDATES) {
        return;
      }
      const family = normalizeString(candidate.family);
      const currentCount = selectedFamilyCounts[family] || 0;
      if (currentCount >= MICRO_GRAPH_DOT_FAMILY_LIMIT) {
        return;
      }
      selected.push(makeGraphDotCandidate(candidate, "micro"));
      selectedFamilyCounts[family] = currentCount + 1;
    });
    const suppressed = duplicateMajorCandidates.map(function (candidate) {
      return makeSelectionSuppressedCandidate(candidate, "duplicate-major-dot", "micro-graph-dot");
    }).concat(missingTiming.map(function (candidate) {
      return makeSelectionSuppressedCandidate(candidate, "missing-timing-for-graph", "graph-dot");
    })).concat(suppressUnselected(timedPool, selected, function (candidate) {
      if (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap) {
        return "data-gap-lower-priority";
      }
      if ((selectedFamilyCounts[normalizeString(candidate.family)] || 0) >= MICRO_GRAPH_DOT_FAMILY_LIMIT) {
        return "micro-family-cap";
      }
      return timedPool.length > MAX_MICRO_GRAPH_DOT_CANDIDATES ? "micro-graph-dot-cap" : "lower-priority";
    }, "micro-graph-dot"));

    return {
      selected,
      suppressed
    };
  }

  function countSuppressionReasons(candidates) {
    return countBy(candidates, function (candidate) {
      return candidate.selectionSuppressionReason || candidate.deferredReason || "unknown";
    });
  }

  function selectStoryVisibilitySuppressedCandidates(candidates) {
    return dedupeCandidates(candidates).filter(function (candidate) {
      return isSelectableRenderable(candidate)
        && !isVisibleStorylineCandidate(candidate)
        && (candidate.eligibleForMajorCard === true || candidate.eligibleForGraphDot === true);
    }).map(function (candidate) {
      return makeSelectionSuppressedCandidate(candidate, "mechanical-detail-hidden", "visible-storyline");
    });
  }

  function summarizeEvidence(candidates) {
    return candidates.reduce(function (summary, candidate) {
      const key = candidate.evidenceLevel || "unknown";
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {});
  }

  function buildIncomeImpactFinancialStorylineCandidates(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    if (!isPlainObject(input)) {
      warnings.push(makeWarning(
        "invalid-storyline-input",
        "Financial storyline candidates require a plain input object.",
        ["input"]
      ));
    }
    if (!isPlainObject(safeInput.scenario)) {
      warnings.push(makeWarning(
        "missing-storyline-scenario",
        "No composed Income Impact scenario was provided to the storyline helper.",
        ["scenario"]
      ));
    }

    const ledgerBacked = buildAssetDepletionLedgerBackedCandidates(safeInput.assetDepletionLedger, warnings);
    const liquidityTriggers = buildLiquidityMilestoneTriggerCandidates(
      safeInput.assetDepletionLedger,
      safeInput.transitionOutlook || safeInput.scenario?.transitionOutlook,
      warnings
    );
    const debtTriggers = buildDebtRequiredPaymentTriggerCandidates(safeInput, warnings);
    const supportingDotTriggers = buildSupportingDotTriggerCandidates(safeInput);
    const coverageDurationTriggers = buildCoverageDurationTriggerCandidates(safeInput);
    const housingRiskBacked = buildHousingRiskBackedCandidates(safeInput.housingRisk, warnings);
    const safeCandidates = dedupeCandidates(
      buildSafeCandidates(safeInput, warnings)
        .concat(ledgerBacked.candidates)
        .concat(liquidityTriggers.candidates)
        .concat(debtTriggers.candidates)
        .concat(supportingDotTriggers.candidates)
        .concat(coverageDurationTriggers.candidates)
        .concat(housingRiskBacked.candidates)
    );
    const safeRenderableEvents = safeCandidates.filter(function (candidate) {
      return candidate.safeToRender === true
        && (candidate.status === STATUSES.safeNow || candidate.status === STATUSES.caution);
    });
    const deferredCandidates = DEFERRED_CANDIDATE_DEFINITIONS.map(clonePlainValue);
    const majorStorySelection = selectMajorStoryCandidates(safeRenderableEvents, safeInput.options);
    const majorStoryCandidates = majorStorySelection.selected;
    const majorGraphDotSelection = selectMajorGraphDotCandidates(majorStoryCandidates);
    const microGraphDotSelection = selectMicroGraphDotCandidates(safeRenderableEvents, majorStoryCandidates);
    const majorGraphDotCandidates = majorGraphDotSelection.selected;
    const microGraphDotCandidates = microGraphDotSelection.selected;
    const graphDotCandidates = majorGraphDotCandidates.concat(microGraphDotCandidates).slice(0, MAX_GRAPH_DOT_CANDIDATES);
    const visibilitySuppressedCandidates = selectStoryVisibilitySuppressedCandidates(safeRenderableEvents);
    const selectionSuppressedCandidates = majorStorySelection.suppressed
      .concat(majorGraphDotSelection.suppressed)
      .concat(microGraphDotSelection.suppressed)
      .concat(visibilitySuppressedCandidates);
    const allCandidates = safeCandidates.concat(deferredCandidates);
    const trace = {
      source: SOURCE,
      generatedAt: null,
      evidenceSummary: summarizeEvidence(allCandidates),
      registryVersion: VERSION,
      safeRegistryCandidateIds: SAFE_EVENT_DEFINITIONS.map(function (definition) { return definition.id; }),
      deferredRegistryCandidateIds: DEFERRED_CANDIDATE_DEFINITIONS.map(function (definition) { return definition.id; }),
      selectedScenarioId: normalizeString(safeInput.selectedScenarioId),
      safeRenderableCount: safeRenderableEvents.length,
      deferredCount: deferredCandidates.length,
      majorStoryCandidateLimit: MAX_MAJOR_STORY_CANDIDATES,
      majorGraphDotCandidateLimit: MAX_MAJOR_GRAPH_DOT_CANDIDATES,
      microGraphDotCandidateLimit: MAX_MICRO_GRAPH_DOT_CANDIDATES,
      graphDotCandidateLimit: MAX_GRAPH_DOT_CANDIDATES,
      selectorPolicyVersion: SELECTOR_POLICY_VERSION,
      selectedMajorCandidateIds: majorStoryCandidates.map(function (candidate) { return candidate.id; }),
      selectedMajorGraphDotCandidateIds: majorGraphDotCandidates.map(function (candidate) { return candidate.id; }),
      selectedMicroGraphDotCandidateIds: microGraphDotCandidates.map(function (candidate) { return candidate.id; }),
      selectedGraphDotCandidateIds: graphDotCandidates.map(function (candidate) { return candidate.id; }),
      visibleEmotionalEventIds: safeRenderableEvents.filter(function (candidate) {
        return normalizeString(candidate.storyRole) === STORY_EVENT_ROLES.emotional;
      }).map(function (candidate) { return candidate.id; }),
      mechanicalDetailSuppressedCount: visibilitySuppressedCandidates.length,
      storyRoleCounts: countBy(safeRenderableEvents, function (candidate) { return candidate.storyRole; }),
      graphDotTierCounts: countBy(graphDotCandidates, function (candidate) { return candidate.dotTier; }),
      majorStoryTierCounts: countBy(majorStoryCandidates, function (candidate) { return candidate.majorTier; }),
      selectedAsCounts: countBy(majorStoryCandidates.concat(microGraphDotCandidates), function (candidate) { return candidate.selectedAs; }),
      majorStoryFamilyCounts: countBy(majorStoryCandidates, function (candidate) { return candidate.family; }),
      graphDotFamilyCounts: countBy(graphDotCandidates, function (candidate) { return candidate.family; }),
      selectorSuppressedCountsByReason: countSuppressionReasons(selectionSuppressedCandidates),
      assetDepletionLedgerUsedForStoryline: ledgerBacked.usedForStoryline || liquidityTriggers.usedForStoryline,
      assetDepletionLedgerStatus: ledgerBacked.ledgerStatus,
      canonicalRunwayWaterfallUsedForStoryline: ledgerBacked.usedForStoryline || liquidityTriggers.usedForStoryline,
      canonicalRunwayWaterfallStatus: ledgerBacked.ledgerStatus,
      ledgerBackedCandidateIds: ledgerBacked.candidates.map(function (candidate) { return candidate.id; }),
      liquidityTriggerCandidateIds: liquidityTriggers.candidates.map(function (candidate) { return candidate.id; }),
      liquidityTriggerTrace: clonePlainValue(liquidityTriggers.trace),
      debtTriggerCandidateIds: debtTriggers.candidates.map(function (candidate) { return candidate.id; }),
      debtTriggerTrace: clonePlainValue(debtTriggers.trace),
      supportingDotTriggerCandidateIds: supportingDotTriggers.candidates.map(function (candidate) { return candidate.id; }),
      supportingDotTriggerTrace: clonePlainValue(supportingDotTriggers.trace),
      coverageDurationTriggerCandidateIds: coverageDurationTriggers.candidates.map(function (candidate) { return candidate.id; }),
      coverageDurationTriggerTrace: clonePlainValue(coverageDurationTriggers.trace),
      graphLineSource: "aggregate-survivor-runway"
    };
    if (isPlainObject(safeInput.assetDepletionLedger)) {
      trace.suppressedAssetDepletionLedgerCandidateCount = ledgerBacked.suppressedCandidates.length + liquidityTriggers.suppressedCandidates.length;
      trace.suppressedCanonicalRunwayWaterfallCandidateCount = ledgerBacked.suppressedCandidates.length + liquidityTriggers.suppressedCandidates.length;
    }
    if (isPlainObject(safeInput.housingRisk)) {
      trace.activatedHousingRiskCandidateIds = housingRiskBacked.candidates.map(function (candidate) { return candidate.id; });
      trace.suppressedHousingRiskCandidateCount = housingRiskBacked.suppressedCandidates.length;
    }
    if (isPlainObject(getDebtRequiredPaymentSchedule(safeInput))) {
      trace.activatedDebtTriggerCandidateIds = debtTriggers.candidates.map(function (candidate) { return candidate.id; });
      trace.suppressedDebtTriggerCandidateCount = debtTriggers.suppressedCandidates.length;
    }

    return {
      version: VERSION,
      allCandidates,
      safeRenderableEvents,
      deferredCandidates,
      majorStoryCandidates,
      majorGraphDotCandidates,
      microGraphDotCandidates,
      graphDotCandidates,
      suppressedCandidates: ledgerBacked.suppressedCandidates
        .concat(liquidityTriggers.suppressedCandidates)
        .concat(debtTriggers.suppressedCandidates)
        .concat(supportingDotTriggers.suppressedCandidates)
        .concat(coverageDurationTriggers.suppressedCandidates)
        .concat(housingRiskBacked.suppressedCandidates)
        .concat(selectionSuppressedCandidates),
      warnings,
      trace
    };
  }

  const api = {
    buildIncomeImpactFinancialStorylineCandidates,
    incomeImpactFinancialStorylineCandidateRegistry: CANDIDATE_REGISTRY,
    INCOME_IMPACT_FINANCIAL_STORYLINE_EVIDENCE_LEVELS: EVIDENCE_LEVELS,
    INCOME_IMPACT_FINANCIAL_STORYLINE_STATUSES: STATUSES,
    INCOME_IMPACT_FINANCIAL_STORYLINE_EVENT_FAMILIES: EVENT_FAMILIES
  };

  Object.assign(lensAnalysis, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
