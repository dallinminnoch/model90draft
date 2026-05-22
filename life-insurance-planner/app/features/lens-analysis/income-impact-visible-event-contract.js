(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-visible-event-contract-v1";

  const VISIBILITY_ROUTES = Object.freeze({
    main: "main",
    supporting: "supporting",
    detail: "detail",
    forbidden: "forbidden"
  });

  const STATE_RANKS = Object.freeze({
    stable: 0,
    covered: 0,
    holds: 0,
    intact: 0,
    protected: 0,
    tight: 1,
    short: 2,
    underfunded: 3,
    continue: 1,
    begins: 1,
    "begins-declining": 1,
    used: 1,
    tapped: 1,
    "next-in-line": 1,
    "may-be-redirected": 1,
    "at-risk": 2,
    "nearly-depleted": 2,
    "compete-with-expenses": 2,
    unsupported: 3,
    depleted: 3,
    "resources-run-out": 3
  });

  const TONE_RANKS = Object.freeze({
    stable: 0,
    caution: 1,
    atRisk: 2,
    critical: 3
  });

  function isPlainObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeString(value) {
    return value == null ? "" : String(value).trim();
  }

  function normalizeKey(value) {
    return normalizeString(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/&/g, " and ")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clonePlainValue(value) {
    if (value == null || typeof value !== "object") {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function firstString(values) {
    return (Array.isArray(values) ? values : []).map(normalizeString).find(Boolean) || "";
  }

  function normalizeTone(value) {
    const raw = normalizeKey(value);
    if (raw === "at-risk" || raw === "atrisk" || raw === "risk") {
      return "atRisk";
    }
    if (raw === "critical" || raw === "depleted" || raw === "unsupported" || raw === "underfunded") {
      return "critical";
    }
    if (raw === "stable" || raw === "positive" || raw === "covered") {
      return "stable";
    }
    if (raw === "caution" || raw === "warning" || raw === "info") {
      return "caution";
    }
    return raw || "unknown";
  }

  function severityToTone(event) {
    return normalizeTone(firstString([
      event?.tone,
      event?.severity,
      event?.status,
      event?.riskLevel
    ]));
  }

  function getEventSourceId(event, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return firstString([
      safeOptions.sourceEventId,
      event?.sourceEventId,
      event?.id,
      event?.eventId,
      event?.markerId,
      event?.ruleId,
      event?.trace?.triggerId,
      event?.trace?.originalId
    ]);
  }

  function getEventTitle(event, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return firstString([
      safeOptions.title,
      event?.mappedCardTitle,
      event?.cardTitle,
      event?.displayLabel,
      event?.title,
      event?.graphLabel,
      event?.shortLabel,
      event?.label,
      event?.trace?.mappedCardTitle,
      event?.trace?.originalSourceTitle
    ]);
  }

  function getRelativeMonth(event, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return toOptionalNumber(
      safeOptions.relativeMonth
      ?? event?.relativeMonth
      ?? event?.month
      ?? event?.monthIndex
      ?? event?.monthOffset
      ?? event?.timing?.monthOffset
      ?? event?.timing?.relativeMonth
      ?? event?.trace?.monthIndex
      ?? event?.trace?.startMonth
    );
  }

  function addConcept(target, definition) {
    const safeDefinition = Object.freeze(Object.assign({}, definition));
    target[safeDefinition.conceptId] = safeDefinition;
  }

  const CONCEPTS = {};

  [
    ["death-income-stops", "incomeStopsAtDeath", "Income Stops at Death", "trigger", "income", "household", "income-stops", VISIBILITY_ROUTES.main, "critical", "none"],
    ["ninety-day-cash-window-covered", "transitionCashWindowCovered", "90-Day Cash Window Is Covered", "transition", "cashWindow", "household", "covered", VISIBILITY_ROUTES.main, "stable", "scenario"],
    ["ninety-day-cash-window-tight", "transitionCashWindowTight", "90-Day Cash Window Is Tight", "transition", "cashWindow", "household", "tight", VISIBILITY_ROUTES.main, "caution", "scenario"],
    ["ninety-day-cash-window-short", "transitionCashWindowShort", "90-Day Cash Window Is Short", "transition", "cashWindow", "household", "short", VISIBILITY_ROUTES.main, "atRisk", "scenario"],
    ["ninety-day-cash-window-underfunded", "transitionCashWindowUnderfunded", "90-Day Cash Window Is Underfunded", "transition", "cashWindow", "household", "underfunded", VISIBILITY_ROUTES.main, "critical", "scenario"],

    ["cash-reserve-holds", "cashReserveHolds", "Cash Reserve Holds", "liquidity", "cash", "cash-reserve", "holds", VISIBILITY_ROUTES.main, "stable", "month"],
    ["cash-reserve-begins-declining", "cashReserveBeginsDeclining", "Cash Reserve Begins Declining", "liquidity", "cash", "cash-reserve", "begins-declining", VISIBILITY_ROUTES.supporting, "caution", "month"],
    ["cash-reserve-nearly-depleted", "cashReserveNearlyDepleted", "Cash Reserve Is Nearly Depleted", "liquidity", "cash", "cash-reserve", "nearly-depleted", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["cash-reserve-depleted", "cashReserveDepleted", "Cash Reserve Is Depleted", "liquidity", "cash", "cash-reserve", "depleted", VISIBILITY_ROUTES.main, "critical", "month"],
    ["emergency-fund-used", "emergencyFundUsed", "Emergency Fund Is Used", "liquidity", "emergencyFund", "emergency-fund", "used", VISIBILITY_ROUTES.supporting, "caution", "month"],
    ["emergency-fund-nearly-depleted", "emergencyFundNearlyDepleted", "Emergency Fund Is Nearly Depleted", "liquidity", "emergencyFund", "emergency-fund", "nearly-depleted", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["emergency-fund-depleted", "emergencyFundDepleted", "Emergency Fund Is Depleted", "liquidity", "emergencyFund", "emergency-fund", "depleted", VISIBILITY_ROUTES.main, "critical", "month"],
    ["taxable-investments-tapped", "taxableInvestmentsTapped", "Taxable Investments Are Tapped", "liquidity", "taxableInvestments", "taxable-investments", "tapped", VISIBILITY_ROUTES.supporting, "caution", "month"],
    ["taxable-investments-nearly-depleted", "taxableInvestmentsNearlyDepleted", "Taxable Investments Are Nearly Depleted", "liquidity", "taxableInvestments", "taxable-investments", "nearly-depleted", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["taxable-investments-depleted", "taxableInvestmentsDepleted", "Taxable Investments Are Depleted", "liquidity", "taxableInvestments", "taxable-investments", "depleted", VISIBILITY_ROUTES.main, "critical", "month"],

    ["required-debt-payments-covered", "requiredDebtPaymentsCovered", "Required Debt Payments Are Covered", "debt", "required-payments", "household", "covered", VISIBILITY_ROUTES.main, "stable", "scenario"],
    ["minimum-debt-payments-continue", "minimumDebtPaymentsContinue", "Minimum Debt Payments Continue", "debt", "required-payments", "household", "continue", VISIBILITY_ROUTES.supporting, "caution", "none"],
    ["minimum-debt-payments-compete-with-expenses", "minimumDebtPaymentsCompete", "Minimum Debt Payments Compete With Expenses", "debt", "required-payments", "household", "compete-with-expenses", VISIBILITY_ROUTES.main, "atRisk", "scenario"],
    ["minimum-debt-payments-become-unsupported", "minimumDebtPaymentsUnsupported", "Minimum Debt Payments Become Unsupported", "debt", "required-payments", "household", "unsupported", VISIBILITY_ROUTES.main, "critical", "scenario"],

    ["housing-costs-remain-covered", "housingCostsCovered", "Housing Costs Remain Covered", "housing", "housing", "household", "covered", VISIBILITY_ROUTES.main, "stable", "month"],
    ["housing-costs-begin-pressuring-plan", "housingCostsPressure", "Housing Costs Begin Pressuring the Plan", "housing", "housing", "household", "pressure", VISIBILITY_ROUTES.main, "caution", "month"],
    ["housing-stability-at-risk", "housingStabilityAtRisk", "Housing Stability Is At Risk", "housing", "housing", "household", "at-risk", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["housing-costs-become-unsupported", "housingCostsUnsupported", "Housing Costs Become Unsupported", "housing", "housing", "household", "unsupported", VISIBILITY_ROUTES.main, "critical", "month"],
    ["mortgage-payment-stays-current", "mortgagePaymentCurrent", "Mortgage Payment Stays Current", "housing", "mortgage", "household", "covered", VISIBILITY_ROUTES.main, "stable", "month"],
    ["mortgage-payment-pressure-begins", "mortgagePaymentPressure", "Mortgage Payment Pressure Begins", "housing", "mortgage", "household", "pressure", VISIBILITY_ROUTES.main, "caution", "month"],
    ["mortgage-payment-at-risk", "mortgagePaymentAtRisk", "Mortgage Payment Is At Risk", "housing", "mortgage", "household", "at-risk", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["mortgage-payment-becomes-unsupported", "mortgagePaymentUnsupported", "Mortgage Payment Becomes Unsupported", "housing", "mortgage", "household", "unsupported", VISIBILITY_ROUTES.main, "critical", "month"],
    ["rent-payment-stays-current", "rentPaymentCurrent", "Rent Payment Stays Current", "housing", "rent", "household", "covered", VISIBILITY_ROUTES.main, "stable", "month"],
    ["rent-payment-pressure-begins", "rentPaymentPressure", "Rent Payment Pressure Begins", "housing", "rent", "household", "pressure", VISIBILITY_ROUTES.main, "caution", "month"],
    ["rent-payment-at-risk", "rentPaymentAtRisk", "Rent Payment Is At Risk", "housing", "rent", "household", "at-risk", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["rent-payment-becomes-unsupported", "rentPaymentUnsupported", "Rent Payment Becomes Unsupported", "housing", "rent", "household", "unsupported", VISIBILITY_ROUTES.main, "critical", "month"],

    ["education-funding-remains-protected", "educationFundingProtected", "Education Funding Remains Protected", "education", "educationSavings", "education-funding", "protected", VISIBILITY_ROUTES.main, "stable", "month"],
    ["education-funding-may-be-redirected", "educationFundingMayBeRedirected", "Education Funding May Be Redirected", "education", "educationSavings", "education-funding", "may-be-redirected", VISIBILITY_ROUTES.main, "caution", "month"],
    ["education-funding-at-risk", "educationFundingAtRisk", "Education Funding Is At Risk", "education", "educationSavings", "education-funding", "at-risk", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["education-savings-depleted", "educationSavingsDepleted", "Education Savings Are Depleted", "education", "educationSavings", "education-funding", "depleted", VISIBILITY_ROUTES.main, "critical", "month"],

    ["retirement-assets-stay-intact", "retirementAssetsIntact", "Retirement Assets Stay Intact", "retirement", "retirementAssets", "retirement-assets", "intact", VISIBILITY_ROUTES.main, "stable", "month"],
    ["retirement-assets-next-in-line", "retirementAssetsNextInLine", "Retirement Assets Are Next in Line", "retirement", "retirementAssets", "retirement-assets", "next-in-line", VISIBILITY_ROUTES.main, "caution", "month"],
    ["retirement-assets-tapped", "retirementAssetsTapped", "Retirement Assets Are Tapped", "retirement", "retirementAssets", "retirement-assets", "tapped", VISIBILITY_ROUTES.main, "atRisk", "month"],
    ["retirement-assets-depleted", "retirementAssetsDepleted", "Retirement Assets Are Depleted", "retirement", "retirementAssets", "retirement-assets", "depleted", VISIBILITY_ROUTES.main, "critical", "month"],

    ["spending-begins-to-compress", "spendingBeginsToCompress", "Spending Begins to Compress", "compression", "expense-compression", "household", "begins", VISIBILITY_ROUTES.supporting, "caution", "none"],
    ["survivor-income-begins", "survivorIncomeBegins", "Survivor Income Begins", "survivor-income", "delayed-income", "household", "begins", VISIBILITY_ROUTES.supporting, "stable", "month"],
    ["coverage-extends-runway", "coverageExtendsRunway", "Coverage Extends the Runway", "coverage", "duration", "household", "extends-runway", VISIBILITY_ROUTES.supporting, "caution", "none"],
    ["coverage-runs-out-before-needs-end", "coverageRunsOutBeforeNeedsEnd", "Coverage Runs Out Before Needs End", "coverage", "duration", "household", "runs-out-before-needs-end", VISIBILITY_ROUTES.main, "atRisk", "none"],

    ["resources-run-out", "resourcesRunOut", "Resources Run Out", "final-outcome", "runout", "household", "resources-run-out", VISIBILITY_ROUTES.main, "critical", "none"],
    ["family-runway-remains-funded", "familyRunwayRemainsFunded", "Family Runway Remains Funded", "final-outcome", "funded", "household", "family-runway-remains-funded", VISIBILITY_ROUTES.main, "stable", "none"]
  ].forEach(function (definition) {
    addConcept(CONCEPTS, {
      sourceId: definition[0],
      conceptId: definition[1],
      title: definition[2],
      cardConceptId: definition[3] === "transition" ? "transition"
        : definition[3] === "debt" ? "obligations"
          : definition[3] === "education" ? "educationFunding"
            : definition[3] === "retirement" ? "retirementAssets"
              : definition[3] === "compression" ? "spendingCompression"
                : definition[3] === "survivor-income" ? "survivorIncomeBegins"
                  : definition[3] === "coverage" ? "coverageDuration"
                    : definition[4],
      category: definition[3],
      storyStage: definition[3],
      bucketFamily: definition[4],
      bucketId: definition[5],
      eventState: definition[6],
      route: definition[7],
      tone: definition[8],
      timingScope: definition[9],
      stateRank: STATE_RANKS[definition[6]] ?? TONE_RANKS[definition[8]] ?? 0
    });
  });

  Object.freeze(CONCEPTS);

  const CONCEPT_BY_SOURCE_ID = Object.freeze(Object.keys(CONCEPTS).reduce(function (lookup, conceptId) {
    const concept = CONCEPTS[conceptId];
    lookup[normalizeKey(concept.sourceId)] = concept;
    return lookup;
  }, {}));

  const CONCEPT_BY_TITLE = Object.freeze(Object.keys(CONCEPTS).reduce(function (lookup, conceptId) {
    const concept = CONCEPTS[conceptId];
    lookup[normalizeKey(concept.title)] = concept;
    return lookup;
  }, {}));

  const FORBIDDEN_VISIBLE_TITLES = Object.freeze(new Set([
    "Death / Income Stops",
    "Death & Income Stops",
    "Life Insurance Proceeds Applied",
    "Coverage Helps Protect the Plan",
    "Protection Gap Appears Immediately",
    "Existing coverage closes a meaningful gap",
    "Survivor Income Is Not Enough Alone",
    "Survivor Income Helps Offset Need",
    "Monthly Support Gap Begins",
    "Immediate Obligations Are Paid",
    "Final Expenses Are Paid",
    "Mortgage Is Paid Off",
    "Stable Covered Event",
    "Direct Risk Event",
    "Direct Stable Event",
    "Data quality: code",
    "Existing Coverage Cannot Prevent Runout",
    "Coverage Cannot Prevent Resource Depletion",
    "Education Savings Are Redirected",
    "Expenses Begin Competing With Debt Payments",
    "Debt Payments Pressure Monthly Expenses",
    "Monthly Bills Become Unsupported",
    "Retirement Assets Are At Risk",
    "Plan Depends on Survivor Income",
    "Survivor Income Supports the Runway",
    "Survivor Income Is Not Enough",
    "Income Gap Drives the Shortfall"
  ].map(normalizeKey)));

  const DETAIL_ONLY_SOURCE_IDS = Object.freeze(new Set([
    "life-insurance-proceeds-applied",
    "immediate-obligations-paid",
    "final-expenses-paid",
    "debt-payoff-consumes-liquidity",
    "mortgage-is-paid-off",
    "missing-data-limits-timeline"
  ]));

  const FORBIDDEN_SOURCE_IDS = Object.freeze(new Set([
    "cash-savings-depleted",
    "liquid-investments-depleted",
    "taxable-assets-depleted",
    "protection-gap-appears-immediately",
    "survivor-income-helps-offset-need",
    "survivor-income-not-enough-alone",
    "monthly-support-gap-begins",
    "unfunded-need-accumulates",
    "expenses-begin-competing-with-debt-payments",
    "debt-payments-pressure-monthly-expenses",
    "monthly-bills-become-unsupported",
    "education-savings-redirected",
    "education-savings-are-redirected",
    "retirement-assets-at-risk"
  ]));

  function getConceptByStructuredFields(event) {
    const cardConceptId = normalizeString(event?.cardConceptId || event?.trace?.cardConceptId);
    const eventState = normalizeString(event?.eventState || event?.trace?.eventState);
    if (!cardConceptId || !eventState) {
      return null;
    }
    return Object.keys(CONCEPTS).map(function (key) {
      return CONCEPTS[key];
    }).find(function (concept) {
      return normalizeString(concept.cardConceptId) === cardConceptId
        && normalizeString(concept.eventState) === eventState;
    }) || null;
  }

  function getIncomeImpactVisibleEventConcept(event, options) {
    const sourceId = normalizeKey(getEventSourceId(event, options));
    if (sourceId && CONCEPT_BY_SOURCE_ID[sourceId]) {
      return CONCEPT_BY_SOURCE_ID[sourceId];
    }
    const explicitConceptId = normalizeString(event?.conceptId || event?.trace?.conceptId);
    if (explicitConceptId && CONCEPTS[explicitConceptId]) {
      return CONCEPTS[explicitConceptId];
    }
    const structured = getConceptByStructuredFields(event);
    if (structured) {
      return structured;
    }
    const title = normalizeKey(getEventTitle(event, options));
    return title ? (CONCEPT_BY_TITLE[title] || null) : null;
  }

  function getVisibilityRoute(event, concept, options) {
    const sourceId = normalizeKey(getEventSourceId(event, options));
    const titleKey = normalizeKey(getEventTitle(event, options));
    const evidence = normalizeKey(event?.evidenceLevel || event?.trace?.evidenceLevel);
    const family = normalizeKey(event?.family || event?.trace?.family);
    const tone = severityToTone(event);
    if (DETAIL_ONLY_SOURCE_IDS.has(sourceId) || evidence === "data-gap" || family === "data-quality" || tone === "unknown") {
      return VISIBILITY_ROUTES.detail;
    }
    if (!concept && (FORBIDDEN_SOURCE_IDS.has(sourceId) || FORBIDDEN_VISIBLE_TITLES.has(titleKey))) {
      return VISIBILITY_ROUTES.forbidden;
    }
    if (concept) {
      return concept.route;
    }
    return VISIBILITY_ROUTES.detail;
  }

  function formatVisibleEventTimingKey(concept, relativeMonth) {
    if (!concept || concept.timingScope === "none") {
      return "";
    }
    if (concept.timingScope === "scenario") {
      return "scenario";
    }
    const month = toOptionalNumber(relativeMonth);
    return month == null ? "month-unknown" : `month-${Math.max(0, Math.round(month))}`;
  }

  function buildIncomeImpactVisibleEventKey(identity) {
    const safeIdentity = isPlainObject(identity) ? identity : {};
    return [
      normalizeString(safeIdentity.storyStage || safeIdentity.category || "event"),
      normalizeString(safeIdentity.bucketFamily || safeIdentity.cardConceptId || "general"),
      normalizeString(safeIdentity.bucketId || safeIdentity.scope || "event"),
      normalizeString(safeIdentity.eventState || "state"),
      normalizeString(safeIdentity.timingKey)
    ].filter(Boolean).join(":");
  }

  function rankIncomeImpactEventState(eventState, tone) {
    const state = normalizeString(eventState);
    if (state && STATE_RANKS[state] != null) {
      return STATE_RANKS[state];
    }
    return TONE_RANKS[normalizeTone(tone)] ?? 0;
  }

  function normalizeIncomeImpactVisibleEvent(event, options) {
    const sourceEventId = getEventSourceId(event, options);
    const originalSourceTitle = getEventTitle(event, options);
    const relativeMonth = getRelativeMonth(event, options);
    const concept = getIncomeImpactVisibleEventConcept(event, options);
    const route = getVisibilityRoute(event, concept, options);
    const tone = concept?.tone || severityToTone(event);
    const eventState = concept?.eventState || normalizeString(event?.eventState || event?.trace?.eventState || normalizeKey(originalSourceTitle || sourceEventId));
    const category = concept?.category || normalizeString(event?.category || event?.storyStage || event?.eventCategory || event?.family || event?.trace?.storyStage);
    const storyStage = concept?.storyStage || normalizeString(event?.storyStage || event?.trace?.storyStage || category);
    const cardConceptId = concept?.cardConceptId || normalizeString(event?.cardConceptId || event?.trace?.cardConceptId);
    const conceptId = concept?.conceptId || normalizeString(event?.conceptId || event?.trace?.conceptId || cardConceptId);
    const bucketFamily = concept?.bucketFamily || normalizeString(event?.bucketFamily || event?.trace?.bucketFamily || event?.trace?.family || cardConceptId || category);
    const bucketId = concept?.bucketId || normalizeString(event?.bucketId || event?.trace?.bucketId || cardConceptId || conceptId || sourceEventId);
    const timingKey = formatVisibleEventTimingKey(concept, relativeMonth);
    const stateRank = toOptionalNumber(event?.stateRank ?? event?.trace?.stateRank)
      ?? concept?.stateRank
      ?? rankIncomeImpactEventState(eventState, tone);
    const visibleEventKey = concept
      ? buildIncomeImpactVisibleEventKey({ storyStage, bucketFamily, bucketId, eventState, timingKey })
      : normalizeString(event?.visibleEventKey || event?.trace?.visibleEventKey)
        || buildIncomeImpactVisibleEventKey({ storyStage, bucketFamily, bucketId, eventState, timingKey: formatVisibleEventTimingKey({ timingScope: "month" }, relativeMonth) });
    const detailOnly = route === VISIBILITY_ROUTES.detail || route === VISIBILITY_ROUTES.forbidden;
    const supportingOnly = route === VISIBILITY_ROUTES.supporting;
    const mainEligible = route === VISIBILITY_ROUTES.main;
    const graphDotEligible = route === VISIBILITY_ROUTES.main || route === VISIBILITY_ROUTES.supporting;
    const mappedCardTitle = concept?.title || (route === VISIBILITY_ROUTES.forbidden ? "" : originalSourceTitle);

    return Object.assign({}, clonePlainValue(event) || {}, {
      sourceEventId,
      visibleEventKey,
      conceptId,
      cardConceptId,
      mappedCardTitle,
      approvedCardTitle: mappedCardTitle,
      title: mappedCardTitle || originalSourceTitle,
      category,
      storyStage,
      bucketFamily,
      bucketId,
      eventState,
      stateRank,
      tone,
      relativeMonth,
      visibilityRoute: route,
      route,
      supportingOnly,
      detailOnly,
      mainEligible,
      mainCandidateEligible: mainEligible,
      graphDotEligible,
      supportingDotEligible: graphDotEligible,
      originalSourceTitle,
      originalSourceId: sourceEventId,
      trace: Object.assign({}, clonePlainValue(event?.trace || {}), {
        visibleEventContractVersion: VERSION,
        originalSourceId: sourceEventId || null,
        originalSourceTitle: originalSourceTitle || null,
        mappedCardTitle: mappedCardTitle || null,
        visibleEventKey: visibleEventKey || null,
        conceptId: conceptId || null,
        cardConceptId: cardConceptId || null,
        storyStage: storyStage || null,
        bucketFamily: bucketFamily || null,
        bucketId: bucketId || null,
        eventState: eventState || null,
        stateRank: stateRank == null ? null : stateRank,
        visibilityRoute: route,
        supportingOnly,
        detailOnly,
        mainEligible,
        graphDotEligible
      })
    });
  }

  function getVisibleBucketKey(event) {
    return [
      normalizeString(event?.storyStage || event?.category),
      normalizeString(event?.bucketFamily || event?.cardConceptId),
      normalizeString(event?.bucketId || event?.conceptId || event?.cardConceptId)
    ].filter(Boolean).join(":");
  }

  function shouldSuppressByStatePrecedence(existing, incoming) {
    const existingRank = toOptionalNumber(existing?.stateRank) ?? 0;
    const incomingRank = toOptionalNumber(incoming?.stateRank) ?? 0;
    if (existingRank <= incomingRank || existingRank <= 0 || incomingRank <= 0) {
      return false;
    }
    const existingMonth = toOptionalNumber(existing?.relativeMonth);
    const incomingMonth = toOptionalNumber(incoming?.relativeMonth);
    if (existingMonth == null || incomingMonth == null) {
      return existing.visibleEventKey !== incoming.visibleEventKey;
    }
    return existingMonth <= incomingMonth;
  }

  function shouldReplaceByStatePrecedence(existing, incoming) {
    const existingRank = toOptionalNumber(existing?.stateRank) ?? 0;
    const incomingRank = toOptionalNumber(incoming?.stateRank) ?? 0;
    if (incomingRank <= existingRank || incomingRank <= 0 || existingRank <= 0) {
      return false;
    }
    const existingMonth = toOptionalNumber(existing?.relativeMonth);
    const incomingMonth = toOptionalNumber(incoming?.relativeMonth);
    if (existingMonth == null || incomingMonth == null) {
      return existing.visibleEventKey !== incoming.visibleEventKey;
    }
    return incomingMonth <= existingMonth;
  }

  function makeSuppressed(event, reason, winner) {
    return {
      reason,
      id: normalizeString(event?.id),
      sourceEventId: normalizeString(event?.sourceEventId || event?.id),
      visibleEventKey: normalizeString(event?.visibleEventKey),
      title: normalizeString(event?.mappedCardTitle || event?.title || event?.cardTitle),
      winnerVisibleEventKey: normalizeString(winner?.visibleEventKey) || null,
      winnerSourceEventId: normalizeString(winner?.sourceEventId || winner?.id) || null,
      event: clonePlainValue(event)
    };
  }

  function applyIncomeImpactVisibleEventContract(events, options) {
    const trace = {
      source: "income-impact-visible-event-contract",
      version: VERSION,
      inputCount: Array.isArray(events) ? events.length : 0,
      outputCount: 0,
      duplicateVisibleEventKeySuppressedCount: 0,
      statePrecedenceSuppressedCount: 0,
      forbiddenSuppressedCount: 0
    };
    const suppressed = [];
    const byVisibleKey = new Map();
    const output = [];

    (Array.isArray(events) ? events : []).forEach(function (event) {
      if (!isPlainObject(event)) {
        return;
      }
      const normalized = normalizeIncomeImpactVisibleEvent(event, options);
      if (normalized.visibilityRoute === VISIBILITY_ROUTES.forbidden) {
        suppressed.push(makeSuppressed(normalized, "forbidden-visible-event"));
        trace.forbiddenSuppressedCount += 1;
        return;
      }
      const visibleKey = normalizeString(normalized.visibleEventKey);
      if (visibleKey && byVisibleKey.has(visibleKey)) {
        const existing = byVisibleKey.get(visibleKey);
        existing.trace = Object.assign({}, existing.trace || {}, {
          duplicateSourceEventIds: Array.from(new Set([].concat(
            existing.trace?.duplicateSourceEventIds || [],
            normalized.sourceEventId || normalized.id
          ).filter(Boolean)))
        });
        suppressed.push(makeSuppressed(normalized, "duplicate-visible-event-key", existing));
        trace.duplicateVisibleEventKeySuppressedCount += 1;
        return;
      }
      const bucketKey = getVisibleBucketKey(normalized);
      const stronger = output.find(function (candidate) {
        return bucketKey
          && getVisibleBucketKey(candidate) === bucketKey
          && shouldSuppressByStatePrecedence(candidate, normalized);
      });
      if (stronger) {
        suppressed.push(makeSuppressed(normalized, "weaker-visible-bucket-state", stronger));
        trace.statePrecedenceSuppressedCount += 1;
        return;
      }
      for (let index = output.length - 1; index >= 0; index -= 1) {
        const existing = output[index];
        if (
          bucketKey
          && getVisibleBucketKey(existing) === bucketKey
          && shouldReplaceByStatePrecedence(existing, normalized)
        ) {
          suppressed.push(makeSuppressed(existing, "weaker-visible-bucket-state", normalized));
          trace.statePrecedenceSuppressedCount += 1;
          if (existing.visibleEventKey) {
            byVisibleKey.delete(existing.visibleEventKey);
          }
          output.splice(index, 1);
        }
      }
      if (visibleKey) {
        byVisibleKey.set(visibleKey, normalized);
      }
      output.push(normalized);
    });

    trace.outputCount = output.length;
    return {
      events: output,
      suppressed,
      trace
    };
  }

  const api = {
    VERSION,
    VISIBILITY_ROUTES,
    CONCEPTS,
    FORBIDDEN_VISIBLE_TITLES,
    normalizeIncomeImpactVisibleEvent,
    applyIncomeImpactVisibleEventContract,
    buildIncomeImpactVisibleEventKey,
    rankIncomeImpactEventState,
    getIncomeImpactVisibleEventConcept
  };

  lensAnalysis.incomeImpactVisibleEventContract = api;
  Object.assign(lensAnalysis, {
    normalizeIncomeImpactVisibleEvent,
    applyIncomeImpactVisibleEventContract,
    buildIncomeImpactVisibleEventKey,
    rankIncomeImpactEventState,
    getIncomeImpactVisibleEventConcept
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
