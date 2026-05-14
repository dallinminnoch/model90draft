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
    "mortgage-payments-continue",
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
    "education-savings-used-for-living-needs",
    "education-savings-depleted",
    "education-funding-interrupted",
    "education-funding-may-be-redirected",
    "dependent-support-gap",
    "dependent-support-gap-begins",
    "childcare-support-at-risk",
    "retirement-assets-tapped",
    "retirement-assets-depleted",
    "housing-payment-pressure-begins",
    "housing-payment-at-risk",
    "housing-stability-at-risk",
    "rent-payment-pressure-begins",
    "vehicle-payment-at-risk",
    "transportation-stability-at-risk",
    "debt-payments-become-unsupported",
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
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 1,
      emotionalWeight: 0.56,
      advisorUsefulness: 0.92
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
      id: "mortgage-payments-continue",
      family: EVENT_FAMILIES.mortgage,
      displayLabel: "Mortgage Payments Continue",
      graphLabel: "Mortgage support",
      cardTitle: "Mortgage Payments Continue",
      description: "A valid mortgage support schedule is included in the survivor runway.",
      severity: "info",
      evidenceLevel: EVIDENCE_LEVELS.traceBacked,
      priority: 44,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      lifeInsuranceRelevance: 0.76,
      emotionalWeight: 0.48,
      advisorUsefulness: 0.82
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
    ["cash-savings-depleted", EVENT_FAMILIES.cashWaterfall, "Cash Savings Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["checking-savings-depleted", EVENT_FAMILIES.cashWaterfall, "Checking & Savings Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["emergency-fund-depleted", EVENT_FAMILIES.cashWaterfall, "Emergency Fund Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["liquid-investments-depleted", EVENT_FAMILIES.cashWaterfall, "Liquid Investments Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["taxable-assets-depleted", EVENT_FAMILIES.cashWaterfall, "Taxable Assets Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["education-savings-used-for-living-needs", EVENT_FAMILIES.educationWaterfall, "Education Savings Used for Living Needs", EVIDENCE_LEVELS.waterfallNeeded],
    ["education-savings-depleted", EVENT_FAMILIES.educationWaterfall, "Education Savings Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["education-funding-may-be-redirected", EVENT_FAMILIES.educationWaterfall, "Education Funding May Be Redirected", EVIDENCE_LEVELS.waterfallNeeded],
    ["dependent-support-gap-begins", EVENT_FAMILIES.careRisk, "Dependent Support Gap Begins", EVIDENCE_LEVELS.riskModelNeeded],
    ["childcare-support-at-risk", EVENT_FAMILIES.careRisk, "Childcare Support At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["retirement-assets-tapped", EVENT_FAMILIES.retirementWaterfall, "Retirement Assets Tapped", EVIDENCE_LEVELS.waterfallNeeded],
    ["retirement-assets-depleted", EVENT_FAMILIES.retirementWaterfall, "Retirement Assets Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["retirement-security-is-reduced", EVENT_FAMILIES.retirementWaterfall, "Retirement Security Is Reduced", EVIDENCE_LEVELS.waterfallNeeded],
    ["home-equity-becomes-last-resort", EVENT_FAMILIES.housingRisk, "Home Equity Becomes Last Resort", EVIDENCE_LEVELS.waterfallNeeded],
    ["home-equity-depleted", EVENT_FAMILIES.housingRisk, "Home Equity Depleted", EVIDENCE_LEVELS.waterfallNeeded],
    ["housing-payment-pressure-begins", EVENT_FAMILIES.housingRisk, "Housing Payment Pressure Begins", EVIDENCE_LEVELS.riskModelNeeded],
    ["housing-payment-at-risk", EVENT_FAMILIES.housingRisk, "Housing Payment At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["foreclosure-risk-window-opens", EVENT_FAMILIES.housingRisk, "Foreclosure Risk Window Opens", EVIDENCE_LEVELS.riskModelNeeded],
    ["rent-payment-pressure-begins", EVENT_FAMILIES.housingRisk, "Rent Payment Pressure Begins", EVIDENCE_LEVELS.riskModelNeeded],
    ["eviction-risk-window-opens", EVENT_FAMILIES.housingRisk, "Eviction Risk Window Opens", EVIDENCE_LEVELS.riskModelNeeded],
    ["housing-stability-at-risk", EVENT_FAMILIES.housingRisk, "Housing Stability At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["housing-risk-unknown", EVENT_FAMILIES.housingRisk, "Housing Risk Unknown", EVIDENCE_LEVELS.dataGap],
    ["vehicle-payment-at-risk", EVENT_FAMILIES.vehicleRisk, "Vehicle Payment At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["transportation-stability-at-risk", EVENT_FAMILIES.vehicleRisk, "Transportation Stability At Risk", EVIDENCE_LEVELS.riskModelNeeded],
    ["debt-payments-become-unsupported", EVENT_FAMILIES.debtRisk, "Debt Payments Become Unsupported", EVIDENCE_LEVELS.riskModelNeeded],
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

  const WATERFALL_EVENT_MAPPINGS = Object.freeze({
    "cash:bucket-depleted": Object.freeze({
      candidateId: "cash-savings-depleted",
      priority: 52,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "emergencyFund:bucket-depleted": Object.freeze({
      candidateId: "emergency-fund-depleted",
      priority: 54,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "otherLiquid:bucket-depleted": Object.freeze({
      candidateId: "liquid-investments-depleted",
      priority: 56,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false
    }),
    "taxableInvestments:bucket-depleted": Object.freeze({
      candidateId: "taxable-assets-depleted",
      priority: 57,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false
    }),
    "educationSavings:bucket-reached": Object.freeze({
      candidateId: "education-savings-used-for-living-needs",
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
    "retirementAssets:bucket-reached": Object.freeze({
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
    }),
    "homeEquity:bucket-reached": Object.freeze({
      candidateId: "home-equity-becomes-last-resort",
      priority: 72,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    })
  });

  const ASSET_DEPLETION_LEDGER_EVENT_MAPPINGS = Object.freeze({
    "cash:bucket-depleted": Object.freeze({
      candidateId: "cash-savings-depleted",
      priority: 52,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "emergencyFund:bucket-depleted": Object.freeze({
      candidateId: "emergency-fund-depleted",
      priority: 54,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "otherLiquid:bucket-depleted": Object.freeze({
      candidateId: "liquid-investments-depleted",
      priority: 56,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false
    }),
    "taxableInvestments:bucket-depleted": Object.freeze({
      candidateId: "taxable-assets-depleted",
      priority: 57,
      eligibleForGraphDot: true,
      eligibleForMajorCard: false
    }),
    "educationSavings:bucket-tapped": Object.freeze({
      candidateId: "education-savings-used-for-living-needs",
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

  const LEDGER_SUPPRESSED_VISIBLE_FAMILIES = Object.freeze([
    "existingCoverage",
    "homeEquity",
    "businessAssets",
    "unknown"
  ]);

  const HOUSING_RISK_EVENT_MAPPINGS = Object.freeze({
    "mortgage-payments-continue": Object.freeze({
      candidateId: "mortgage-payments-continue",
      priority: 43,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "mortgage-paid-off": Object.freeze({
      candidateId: "mortgage-is-paid-off",
      priority: 41,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-payment-pressure-begins": Object.freeze({
      candidateId: "housing-payment-pressure-begins",
      priority: 58,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-payment-at-risk": Object.freeze({
      candidateId: "housing-payment-at-risk",
      priority: 62,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-stability-at-risk": Object.freeze({
      candidateId: "housing-stability-at-risk",
      priority: 63,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "rent-payment-pressure-begins": Object.freeze({
      candidateId: "rent-payment-pressure-begins",
      priority: 59,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true
    }),
    "housing-risk-unknown": Object.freeze({
      candidateId: "housing-risk-unknown",
      priority: 88,
      eligibleForGraphDot: true,
      eligibleForMajorCard: true,
      dataGapOnly: true
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

  const MAJOR_STORY_ROLE_ORDER = Object.freeze([
    STORY_ROLES.insuranceContext,
    STORY_ROLES.liquidityCrisis,
    STORY_ROLES.familyStability,
    STORY_ROLES.longTermSacrifice,
    STORY_ROLES.supportFailure
  ]);

  const INSURANCE_CONTEXT_IDS = Object.freeze([
    "life-insurance-proceeds-applied",
    "immediate-obligations-paid",
    "final-expenses-paid",
    "debt-payoff-consumes-liquidity",
    "mortgage-is-paid-off",
    "mortgage-payments-continue"
  ]);

  const LIQUIDITY_CRISIS_IDS = Object.freeze([
    "emergency-fund-depleted",
    "cash-savings-depleted",
    "checking-savings-depleted",
    "liquid-investments-depleted",
    "taxable-assets-depleted"
  ]);

  const FAMILY_STABILITY_IDS = Object.freeze([
    "housing-payment-at-risk",
    "housing-stability-at-risk",
    "housing-payment-pressure-begins",
    "rent-payment-pressure-begins",
    "education-savings-depleted",
    "education-savings-used-for-living-needs",
    "dependent-support-gap-begins",
    "childcare-support-at-risk"
  ]);

  const LONG_TERM_SACRIFICE_IDS = Object.freeze([
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
    "missing-data-limits-timeline",
    "housing-risk-unknown"
  ]);

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

  function hasMortgageSupportSchedule(rootSource) {
    const schedules = [
      getPath(rootSource, "scenario.postDeathSeries.layer3.scheduledObligations"),
      getPath(rootSource, "scenario.postDeathSeries.layer3.input.scheduledObligations"),
      getPath(rootSource, "scenario.postDeathSeries.layer3.trace.scheduledObligations")
    ];
    return schedules.some(function (items) {
      return Array.isArray(items) && items.some(function (item) {
        if (typeof item === "string") {
          return item.toLowerCase().includes("mortgage");
        }
        return item?.category === "mortgageSupport" || normalizeString(item?.id).toLowerCase().includes("mortgage");
      });
    });
  }

  function getSurvivorIncomeAmount(rootSource) {
    return firstNumberAtPath(rootSource, [
      "scenario.trace.layer3.survivorIncome.annualAmount",
      "scenario.postDeathSeries.layer3.trace.survivorIncome.annualAmount",
      "scenario.postDeathSeries.layer3.summary.annualSurvivorIncome",
      "financialRunway.annualSurvivorIncome"
    ]);
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
    if (hasMortgageSupportSchedule(rootSource)) {
      candidates.push(makeCandidate(findDefinition("mortgage-payments-continue"), {
        timing: getRunwayStartTiming(rootSource),
        sourcePaths: ["scenario.postDeathSeries.layer3.scheduledObligations"],
        confidence: 0.78
      }));
    }

    const survivorIncome = getSurvivorIncomeAmount(rootSource);
    if (survivorIncome && survivorIncome.value > 0) {
      candidates.push(makeCandidate(findDefinition("survivor-income-helps-offset-need"), {
        timing: getRunwayStartTiming(rootSource),
        amount: {
          value: survivorIncome.value,
          sourcePath: survivorIncome.sourcePath
        },
        sourcePaths: [survivorIncome.sourcePath]
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
      if (survivorIncome && survivorIncome.value > 0) {
        candidates.push(makeCandidate(findDefinition("survivor-income-not-enough-alone"), {
          timing: getRunwayStartTiming(rootSource),
          amount: {
            value: source.value,
            sourcePath: source.sourcePath
          },
          sourcePaths: [survivorIncome.sourcePath, source.sourcePath]
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

  function getWaterfallEvents(resourceWaterfall) {
    if (!isPlainObject(resourceWaterfall)) {
      return [];
    }
    const seen = new Set();
    return []
      .concat(Array.isArray(resourceWaterfall.timelineEvents) ? resourceWaterfall.timelineEvents : [])
      .concat(Array.isArray(resourceWaterfall.depletionEvents) ? resourceWaterfall.depletionEvents : [])
      .filter(isPlainObject)
      .filter(function (event) {
        const key = normalizeString(event.id)
          || [
            normalizeString(event.bucketId),
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

  function normalizeWaterfallEvidenceLevel(event) {
    const level = normalizeString(event?.evidenceLevel);
    if (level === EVIDENCE_LEVELS.calculated) {
      return EVIDENCE_LEVELS.calculated;
    }
    if (level === EVIDENCE_LEVELS.estimated) {
      return EVIDENCE_LEVELS.estimated;
    }
    if (level === EVIDENCE_LEVELS.assumptionBacked) {
      return EVIDENCE_LEVELS.assumptionBacked;
    }
    if (level === EVIDENCE_LEVELS.traceBacked) {
      return EVIDENCE_LEVELS.traceBacked;
    }
    if (level === EVIDENCE_LEVELS.insufficientData) {
      return EVIDENCE_LEVELS.insufficientData;
    }
    return level || EVIDENCE_LEVELS.insufficientData;
  }

  function getWaterfallEventAmount(event) {
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
      sourcePath: normalizeString(amountSource.sourcePath || event.sourcePath || event.trace?.bucketSourcePath)
    };
  }

  function getWaterfallEventSourcePaths(event) {
    if (!isPlainObject(event)) {
      return [];
    }
    return uniqueStrings([
      event.sourcePath,
      event.trace?.bucketSourcePath,
      event.trace?.burnRateSourcePath,
      event.trace?.dateSourcePath,
      isPlainObject(event.amount) ? event.amount.sourcePath : null
    ]);
  }

  function isForbiddenWaterfallLabel(event) {
    const text = normalizeString(event?.displayLabel).toLowerCase();
    return /\b(foreclosure|eviction|credit crisis|bankruptcy)\b/.test(text);
  }

  function makeSuppressedWaterfallCandidate(event, reason) {
    const sourcePaths = getWaterfallEventSourcePaths(event);
    return {
      id: normalizeString(event?.id) || [
        normalizeString(event?.bucketId) || "resource-waterfall-event",
        normalizeString(event?.eventType) || "unsupported"
      ].join("."),
      family: normalizeString(event?.family),
      displayLabel: normalizeString(event?.displayLabel),
      graphLabel: normalizeString(event?.displayLabel),
      cardTitle: normalizeString(event?.displayLabel),
      description: normalizeString(reason),
      severity: "deferred",
      evidenceLevel: normalizeWaterfallEvidenceLevel(event),
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
      amount: getWaterfallEventAmount(event) || makeEmptyAmount(),
      sources: sourcePaths.map(function (sourcePath) {
        return {
          sourcePath,
          evidenceLevel: normalizeWaterfallEvidenceLevel(event)
        };
      }),
      confidence: 0,
      lifeInsuranceRelevance: 0,
      emotionalWeight: 0,
      advisorUsefulness: 0,
      suppressionKeys: ["resource-waterfall-insufficient"],
      deferredReason: reason,
      warnings: compactObjects(event?.warnings).map(clonePlainValue),
      priority: 999
    };
  }

  function buildWaterfallBackedCandidates(resourceWaterfall, warnings) {
    if (!isPlainObject(resourceWaterfall)) {
      return {
        candidates: [],
        suppressedCandidates: []
      };
    }

    const candidates = [];
    const suppressedCandidates = [];
    getWaterfallEvents(resourceWaterfall).forEach(function (event) {
      const key = `${normalizeString(event.family)}:${normalizeString(event.eventType)}`;
      const mapping = WATERFALL_EVENT_MAPPINGS[key];
      const eventEvidence = normalizeWaterfallEvidenceLevel(event);
      const amount = getWaterfallEventAmount(event);
      const hasTiming = toOptionalNumber(event.monthOffset) != null
        || Boolean(normalizeString(event.date))
        || Boolean(normalizeString(event.timing?.label));
      const sourcePaths = getWaterfallEventSourcePaths(event);
      const unsupportedReason = !mapping
        ? "Resource waterfall event does not map to a safe storyline candidate in this pass."
        : isForbiddenWaterfallLabel(event)
          ? "Resource waterfall event label is reserved for a future risk helper."
          : event.safeToRender !== true
            ? "Resource waterfall event is not marked safe to render."
            : eventEvidence === EVIDENCE_LEVELS.insufficientData
              ? "Resource waterfall event has insufficient evidence."
              : !hasTiming
                ? "Resource waterfall event has no usable timing."
                : !amount || amount.value == null
                  ? "Resource waterfall event has no usable amount."
                  : !sourcePaths.length
                    ? "Resource waterfall event has no traceable source path."
                    : "";

      if (unsupportedReason) {
        suppressedCandidates.push(makeSuppressedWaterfallCandidate(event, unsupportedReason));
        warnings.push(makeWarning(
          "waterfall-event-not-activated",
          unsupportedReason,
          sourcePaths.length ? sourcePaths : [normalizeString(event.sourcePath)].filter(Boolean),
          {
            eventId: normalizeString(event.id),
            family: normalizeString(event.family),
            eventType: normalizeString(event.eventType),
            displayLabel: normalizeString(event.displayLabel)
          }
        ));
        return;
      }

      const definition = findDeferredDefinition(mapping.candidateId);
      if (!definition) {
        warnings.push(makeWarning(
          "missing-waterfall-storyline-definition",
          "A supported resource waterfall event did not have a matching storyline registry candidate.",
          sourcePaths,
          {
            candidateId: mapping.candidateId,
            eventId: normalizeString(event.id)
          }
        ));
        suppressedCandidates.push(makeSuppressedWaterfallCandidate(
          event,
          "No matching storyline registry candidate exists."
        ));
        return;
      }

      candidates.push(makeCandidate(definition, {
        status: STATUSES.safeNow,
        safeToRender: true,
        evidenceLevel: eventEvidence,
        eligibleForGraphDot: mapping.eligibleForGraphDot === true,
        eligibleForMajorCard: mapping.eligibleForMajorCard === true,
        timingKind: "month-offset",
        timing: {
          monthOffset: event.monthOffset,
          date: event.date,
          label: normalizeString(event.date) || (event.monthOffset != null ? `Month ${event.monthOffset}` : ""),
          sourcePath: normalizeString(event.sourcePath || event.trace?.dateSourcePath)
        },
        amount,
        sourcePaths,
        confidence: eventEvidence === EVIDENCE_LEVELS.calculated
          ? 0.9
          : eventEvidence === EVIDENCE_LEVELS.traceBacked
            ? 0.84
            : eventEvidence === EVIDENCE_LEVELS.estimated
              ? 0.72
              : 0.68,
        priority: mapping.priority,
        warnings: compactObjects(event.warnings),
        suppressionKeys: [`resource-waterfall:${normalizeString(event.bucketId || event.family)}`]
      }));
    });

    return {
      candidates: dedupeCandidates(candidates),
      suppressedCandidates
    };
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

  function makeSuppressedLedgerCandidate(event, reason) {
    const evidenceLevel = normalizeLedgerEvidenceLevel(event);
    const sourcePaths = getLedgerEventSourcePaths(event);
    const monthIndex = toOptionalNumber(event?.monthIndex);
    return {
      id: [
        "asset-depletion-ledger",
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
      suppressionKeys: ["asset-depletion-ledger-hidden"],
      deferredReason: reason,
      warnings: compactObjects(event?.warnings).map(clonePlainValue),
      priority: 999,
      candidateSource: "asset-depletion-ledger",
      trace: {
        candidateSource: "asset-depletion-ledger",
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
        ? "Asset depletion ledger event is mechanical or not visible-storyline eligible."
        : !mapping
          ? "Asset depletion ledger event does not map to a safe emotional storyline candidate in this pass."
          : monthIndex == null && !normalizeString(event.date)
            ? "Asset depletion ledger event has no usable timing."
            : !amount || amount.value == null
              ? "Asset depletion ledger event has no usable amount."
              : !sourcePaths.length
                ? "Asset depletion ledger event has no traceable source path."
                : "";

      if (unsupportedReason) {
        suppressedCandidates.push(makeSuppressedLedgerCandidate(event, unsupportedReason));
        warnings.push(makeWarning(
          "asset-depletion-ledger-event-not-activated",
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

      const definition = findDeferredDefinition(mapping.candidateId);
      if (!definition) {
        warnings.push(makeWarning(
          "missing-ledger-storyline-definition",
          "A supported asset depletion ledger event did not have a matching storyline registry candidate.",
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
        suppressionKeys: [`asset-depletion-ledger:${normalizeString(event.bucketId || family)}`]
      });
      candidate.candidateSource = "asset-depletion-ledger";
      candidate.trace = {
        candidateSource: "asset-depletion-ledger",
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

    const dedupedCandidates = dedupeCandidates(candidates);
    return {
      candidates: dedupedCandidates,
      suppressedCandidates,
      ledgerStatus,
      usedForStoryline: dedupedCandidates.length > 0
    };
  }

  function suppressWaterfallCandidatesSupersededByLedger(waterfallBacked) {
    const candidates = (Array.isArray(waterfallBacked?.candidates) ? waterfallBacked.candidates : []);
    const suppressedCandidates = (Array.isArray(waterfallBacked?.suppressedCandidates)
      ? waterfallBacked.suppressedCandidates
      : []).slice();
    const supersededCandidateIds = [];
    candidates.forEach(function (candidate) {
      const id = normalizeString(candidate.id);
      supersededCandidateIds.push(id);
      suppressedCandidates.push(makeSelectionSuppressedCandidate(
        candidate,
        "superseded-by-asset-depletion-ledger",
        "resource-waterfall"
      ));
    });
    return {
      candidates: [],
      suppressedCandidates,
      supersededCandidateIds: Array.from(new Set(supersededCandidateIds))
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
        return 18;
      case "cash-savings-depleted":
        return 14;
      case "checking-savings-depleted":
        return 12;
      case "liquid-investments-depleted":
        return 6;
      case "taxable-assets-depleted":
        return 5;
      case "housing-payment-at-risk":
        return 40;
      case "housing-stability-at-risk":
        return 38;
      case "housing-payment-pressure-begins":
        return 5;
      case "housing-risk-unknown":
        return -24;
      case "retirement-assets-tapped":
        return 16;
      case "retirement-assets-depleted":
        return 15;
      case "resources-run-out":
        return 18;
      case "unfunded-need-accumulates":
        return 17;
      case "monthly-support-gap-begins":
        return 16;
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

  function hasUnselectedAlternativeFamily(pool, selected, family) {
    const selectedIds = new Set(selected.map(function (candidate) { return candidate.id; }));
    return pool.some(function (candidate) {
      return !selectedIds.has(candidate.id) && candidate.family !== family;
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
    return familyCount(selected, candidate.family) < 2
      || !hasUnselectedAlternativeFamily(pool, selected, candidate.family);
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
    copy.selectionSurface = surface;
    copy.selectionSuppressionReason = reason;
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

    MAJOR_STORY_ROLE_ORDER.forEach(function (role) {
      if (selected.length >= MAX_MAJOR_STORY_CANDIDATES) {
        return;
      }
      const candidate = pool.find(function (item) {
        return getStoryRole(item) === role && canSelectForMajor(item, selected, pool, options);
      });
      if (candidate) {
        selected.push(candidate);
      }
    });

    pool.forEach(function (candidate) {
      if (selected.length >= MAX_MAJOR_STORY_CANDIDATES) {
        return;
      }
      if (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap) {
        const strongerRemaining = pool.some(function (item) {
          return item.id !== candidate.id
            && !selected.some(function (selectedCandidate) { return selectedCandidate.id === item.id; })
            && item.evidenceLevel !== EVIDENCE_LEVELS.dataGap;
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
      selected,
      suppressed
    };
  }

  function makeGraphDotCandidate(candidate, tier, metadata) {
    return Object.assign({}, clonePlainValue(candidate), {
      dotTier: tier,
      connectedToMajorCard: tier === "major",
      majorCardIndex: tier === "major" ? toOptionalNumber(metadata?.majorCardIndex) : null,
      eligibleForConnector: tier === "major"
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
    const selected = timedPool.slice(0, MAX_MICRO_GRAPH_DOT_CANDIDATES).map(function (candidate) {
      return makeGraphDotCandidate(candidate, "micro");
    });
    const suppressed = duplicateMajorCandidates.map(function (candidate) {
      return makeSelectionSuppressedCandidate(candidate, "duplicate-major-dot", "micro-graph-dot");
    }).concat(missingTiming.map(function (candidate) {
      return makeSelectionSuppressedCandidate(candidate, "missing-timing-for-graph", "graph-dot");
    })).concat(suppressUnselected(timedPool, selected, function (candidate) {
      if (candidate.evidenceLevel === EVIDENCE_LEVELS.dataGap) {
        return "data-gap-lower-priority";
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
    const rawWaterfallBacked = buildWaterfallBackedCandidates(safeInput.resourceWaterfall, warnings);
    const waterfallBacked = ledgerBacked.usedForStoryline
      ? suppressWaterfallCandidatesSupersededByLedger(rawWaterfallBacked)
      : Object.assign({}, rawWaterfallBacked, { supersededCandidateIds: [] });
    const housingRiskBacked = buildHousingRiskBackedCandidates(safeInput.housingRisk, warnings);
    const safeCandidates = dedupeCandidates(
      buildSafeCandidates(safeInput, warnings)
        .concat(ledgerBacked.candidates)
        .concat(waterfallBacked.candidates)
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
      majorStoryFamilyCounts: countBy(majorStoryCandidates, function (candidate) { return candidate.family; }),
      graphDotFamilyCounts: countBy(graphDotCandidates, function (candidate) { return candidate.family; }),
      selectorSuppressedCountsByReason: countSuppressionReasons(selectionSuppressedCandidates),
      assetDepletionLedgerUsedForStoryline: ledgerBacked.usedForStoryline,
      assetDepletionLedgerStatus: ledgerBacked.ledgerStatus,
      ledgerBackedCandidateIds: ledgerBacked.candidates.map(function (candidate) { return candidate.id; }),
      waterfallFallbackUsed: !ledgerBacked.usedForStoryline && isPlainObject(safeInput.resourceWaterfall),
      supersededWaterfallCandidateIds: waterfallBacked.supersededCandidateIds || [],
      graphLineSource: "aggregate-survivor-runway"
    };
    if (isPlainObject(safeInput.resourceWaterfall)) {
      trace.activatedWaterfallCandidateIds = waterfallBacked.candidates.map(function (candidate) { return candidate.id; });
      trace.suppressedWaterfallCandidateCount = waterfallBacked.suppressedCandidates.length;
    }
    if (isPlainObject(safeInput.assetDepletionLedger)) {
      trace.suppressedAssetDepletionLedgerCandidateCount = ledgerBacked.suppressedCandidates.length;
    }
    if (isPlainObject(safeInput.housingRisk)) {
      trace.activatedHousingRiskCandidateIds = housingRiskBacked.candidates.map(function (candidate) { return candidate.id; });
      trace.suppressedHousingRiskCandidateCount = housingRiskBacked.suppressedCandidates.length;
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
        .concat(waterfallBacked.suppressedCandidates)
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
