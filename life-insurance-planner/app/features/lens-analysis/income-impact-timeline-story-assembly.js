(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-timeline-story-assembly-v1";
  const SOURCE = "income-impact-timeline-story-assembly";
  const visibleEventContract = lensAnalysis.incomeImpactVisibleEventContract || (function () {
    try {
      return typeof require === "function"
        ? require("./income-impact-visible-event-contract.js")
        : null;
    } catch (error) {
      return null;
    }
  })() || {};
  const STORY_STEP_TARGET = 9;
  const INTERMEDIATE_STEP_TARGET = 7;
  const DEFAULT_SUPPORTING_DOT_LIMIT = 10;
  const DAYS_PER_MONTH = 30.4375;

  const FINAL_OUTCOMES = Object.freeze({
    resourcesRunOut: "resourcesRunOut",
    familyRunwayRemainsFunded: "familyRunwayRemainsFunded"
  });

  const HIGH_IMPACT_REPEAT_CATEGORIES = Object.freeze([
    "liquidity",
    "housing",
    "dependentsCare",
    "finalOutcome"
  ]);

  const TONE_ORDER = Object.freeze({
    critical: 0,
    atRisk: 1,
    caution: 2,
    stable: 3,
    unknown: 4
  });
  const VISIBLE_EVENT_STATE_RANKS = Object.freeze({
    holds: 0,
    "begins-declining": 1,
    used: 1,
    tapped: 1,
    nearly: 2,
    "nearly-depleted": 2,
    depleted: 3
  });

  const APPROVED_CARD_LIBRARY = Object.freeze({
    transition: Object.freeze({
      stable: "90-Day Cash Window Is Covered",
      caution: "90-Day Cash Window Is Tight",
      atRisk: "90-Day Cash Window Is Short",
      critical: "90-Day Cash Window Is Underfunded"
    }),
    cashReserve: Object.freeze({
      stable: "Cash Reserve Holds",
      caution: "Cash Reserve Begins Declining",
      atRisk: "Cash Reserve Is Nearly Depleted",
      critical: "Cash Reserve Is Depleted"
    }),
    emergencyFund: Object.freeze({
      caution: "Emergency Fund Is Used",
      atRisk: "Emergency Fund Is Nearly Depleted",
      critical: "Emergency Fund Is Depleted"
    }),
    liquidResources: Object.freeze({
      stable: "Liquid Resources Hold",
      caution: "Liquid Resources Begin Declining",
      atRisk: "Liquid Resources Are Nearly Depleted",
      critical: "Liquid Resources Are Depleted"
    }),
    taxableInvestments: Object.freeze({
      caution: "Taxable Investments Are Tapped",
      atRisk: "Taxable Investments Are Nearly Depleted",
      critical: "Taxable Investments Are Depleted"
    }),
    housing: Object.freeze({
      stable: "Housing Costs Remain Covered",
      caution: "Housing Costs Begin Pressuring the Plan",
      atRisk: "Housing Stability Is At Risk",
      critical: "Housing Costs Become Unsupported"
    }),
    mortgage: Object.freeze({
      stable: "Mortgage Payment Stays Current",
      caution: "Mortgage Payment Pressure Begins",
      atRisk: "Mortgage Payment Is At Risk",
      critical: "Mortgage Payment Becomes Unsupported"
    }),
    rent: Object.freeze({
      stable: "Rent Payment Stays Current",
      caution: "Rent Payment Pressure Begins",
      atRisk: "Rent Payment Is At Risk",
      critical: "Rent Payment Becomes Unsupported"
    }),
    obligations: Object.freeze({
      stable: "Required Debt Payments Are Covered",
      caution: "Minimum Debt Payments Continue",
      atRisk: "Minimum Debt Payments Compete With Expenses",
      critical: "Minimum Debt Payments Become Unsupported"
    }),
    educationFunding: Object.freeze({
      stable: "Education Funding Remains Protected",
      caution: "Education Funding May Be Redirected",
      atRisk: "Education Funding Is At Risk",
      critical: "Education Savings Are Depleted"
    }),
    dependentCare: Object.freeze({
      stable: "Dependent Support Remains Covered",
      caution: "Dependent Support Begins Pressuring the Plan",
      atRisk: "Care Costs Become Exposed",
      critical: "Dependent Support Becomes Unfunded"
    }),
    retirementAssets: Object.freeze({
      stable: "Retirement Assets Stay Intact",
      caution: "Retirement Assets Are Next in Line",
      atRisk: "Retirement Assets Are Tapped",
      critical: "Retirement Assets Are Depleted"
    }),
    coverageDuration: Object.freeze({
      atRisk: "Coverage Runs Out Before Needs End"
    })
  });

  const SUPPORTING_DOT_LIBRARY = Object.freeze({
    spendingCompression: Object.freeze({
      title: "Spending Begins to Compress",
      tone: "caution"
    }),
    survivorIncomeBegins: Object.freeze({
      title: "Survivor Income Begins",
      tone: "stable"
    }),
    coverageExtendsRunway: Object.freeze({
      title: "Coverage Extends the Runway",
      tone: "caution"
    })
  });

  const FORBIDDEN_MAIN_CARD_TITLES = Object.freeze(new Set([
    "death-income-stops",
    "life-insurance-proceeds-applied",
    "coverage-helps-protect-the-plan",
    "protection-gap-appears-immediately",
    "existing-coverage-closes-a-meaningful-gap",
    "survivor-income-is-not-enough-alone",
    "survivor-income-helps-offset-need",
    "monthly-support-gap-begins",
    "support-gap-begins",
    "monthly-support-gap-grows",
    "current-lifestyle-remains-supported",
    "lifestyle-pressure-begins",
    "lifestyle-cuts-may-be-needed",
    "lifestyle-cuts-become-necessary",
    "essential-costs-begin-pressuring-the-plan",
    "survivor-income-supports-the-runway",
    "plan-depends-on-survivor-income",
    "survivor-income-is-not-enough",
    "income-gap-drives-the-shortfall",
    "coverage-carries-the-runway",
    "coverage-extends-the-runway",
    "education-savings-are-redirected",
    "expenses-begin-competing-with-debt-payments",
    "debt-payments-pressure-monthly-expenses",
    "monthly-bills-become-unsupported",
    "immediate-obligations-are-paid",
    "final-expenses-are-paid",
    "mortgage-is-paid-off",
    "stable-covered-event",
    "direct-risk-event",
    "direct-stable-event",
    "data-quality-code",
    "existing-coverage-cannot-prevent-runout",
    "coverage-cannot-prevent-resource-depletion"
  ]));

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeKey(value) {
    return normalizeString(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[_\s]+/g, "-")
      .toLowerCase();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
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

  function firstString(values) {
    for (let index = 0; index < values.length; index += 1) {
      const normalized = normalizeString(values[index]);
      if (normalized) {
        return normalized;
      }
    }
    return "";
  }

  function safeId(value, fallback) {
    const normalized = normalizeKey(value);
    return normalized || fallback;
  }

  function normalizeTone(event) {
    const key = normalizeKey(firstString([
      event?.tone,
      event?.severity,
      event?.status,
      event?.riskLevel
    ]));

    if (key === "critical" || key === "likely-failure" || key === "failure") {
      return "critical";
    }
    if (key === "at-risk" || key === "atrisk") {
      return "atRisk";
    }
    if (key === "caution" || key === "warning") {
      return "caution";
    }
    if (key === "stable" || key === "covered" || key === "positive" || key === "safe-now") {
      return "stable";
    }
    return "unknown";
  }

  function normalizeCategory(event) {
    const key = normalizeKey(firstString([
      event?.category,
      event?.family,
      event?.kind,
      event?.eventCategory
    ]));
    const id = normalizeKey(event?.id);

    if (key === "trigger" || id === "death-income-stops") {
      return "trigger";
    }
    if (key.includes("cash") || key.includes("liquid") || key.includes("retirement") || key.includes("taxable")) {
      return "liquidity";
    }
    if (key.includes("housing") || key.includes("mortgage") || key.includes("rent")) {
      return "housing";
    }
    if (key.includes("education") || key.includes("dependent") || key.includes("care") || key.includes("childcare")) {
      return "dependentsCare";
    }
    if (key.includes("gap") || key.includes("lifestyle") || key.includes("unmet") || key.includes("income")) {
      return "supportGap";
    }
    if (key.includes("runway") || id === "resources-run-out") {
      return "finalOutcome";
    }
    if (key.includes("data")) {
      return "dataConfidence";
    }
    return key || "general";
  }

  function getRelativeMonth(event) {
    const direct = toOptionalNumber(event?.relativeMonth);
    if (direct != null) {
      return direct;
    }
    const month = toOptionalNumber(event?.month);
    if (month != null) {
      return month;
    }
    const monthIndex = toOptionalNumber(event?.monthIndex);
    if (monthIndex != null) {
      return monthIndex;
    }
    const relativeMonthsFromDeath = toOptionalNumber(event?.relativeMonthsFromDeath);
    if (relativeMonthsFromDeath != null) {
      return relativeMonthsFromDeath;
    }
    const timingMonth = toOptionalNumber(event?.timing?.monthOffset ?? event?.timing?.monthIndex);
    if (timingMonth != null) {
      return timingMonth;
    }
    return null;
  }

  function formatTimingLabel(relativeMonth) {
    const month = toOptionalNumber(relativeMonth);
    if (month == null) {
      return "";
    }
    if (Math.abs(month) <= 0.000001) {
      return "At death";
    }
    if (month < 1) {
      const days = Math.max(1, Math.round(month * DAYS_PER_MONTH));
      return `Day ${days}`;
    }
    if (month < 12) {
      return `Month ${Math.max(1, Math.round(month))}`;
    }
    const years = month / 12;
    const roundedYears = Math.round(years);
    if (Math.abs(years - roundedYears) <= 0.05) {
      return `Year ${roundedYears}`;
    }
    return `Year ${Number(years.toFixed(1))}`;
  }

  function getTitle(event, fallback) {
    return firstString([
      event?.title,
      event?.cardTitle,
      event?.displayLabel,
      event?.shortLabel,
      event?.graphLabel,
      event?.markerLabel,
      event?.label,
      event?.name
    ]) || fallback;
  }

  function getEventSearchText(event, rawTitle, category) {
    return [
      event?.sourceEventId,
      event?.id,
      event?.eventId,
      event?.ruleId,
      event?.type,
      event?.kind,
      event?.category,
      event?.family,
      event?.eventCategory,
      event?.bucketId,
      event?.graphLabel,
      event?.displayLabel,
      event?.shortLabel,
      event?.cardTitle,
      event?.label,
      rawTitle,
      category
    ].map(normalizeKey).filter(Boolean).join(" ");
  }

  function hasTextPart(text, parts) {
    return parts.some(function (part) {
      return text.includes(part);
    });
  }

  function hasApprovedCardConcept(concept) {
    return Boolean(concept && APPROVED_CARD_LIBRARY[concept]);
  }

  function resolveStructuredCardConcept(event) {
    const explicitConcept = firstString([
      event?.cardConceptId,
      event?.conceptId,
      event?.cardConcept,
      event?.trace?.cardConceptId,
      event?.trace?.conceptId,
      event?.trace?.cardConcept
    ]);
    if (hasApprovedCardConcept(explicitConcept)) {
      return explicitConcept;
    }

    const bucketFamily = normalizeKey(firstString([
      event?.bucketFamily,
      event?.trace?.bucketFamily,
      event?.trace?.family
    ]));
    if (bucketFamily.includes("taxable")) {
      return "taxableInvestments";
    }
    if (bucketFamily.includes("emergency")) {
      return "emergencyFund";
    }
    if (bucketFamily === "cash" || bucketFamily.includes("cash-reserve")) {
      return "cashReserve";
    }
    if (bucketFamily.includes("other-liquid") || bucketFamily.includes("liquid-resource")) {
      return "liquidResources";
    }
    if (bucketFamily.includes("education")) {
      return "educationFunding";
    }
    if (bucketFamily.includes("retirement")) {
      return "retirementAssets";
    }
    return "";
  }

  function resolveApprovedCardConcept(event, rawTitle, category) {
    const text = getEventSearchText(event, rawTitle, category);
    if (!text || category === "dataConfidence" || hasTextPart(text, ["data-confidence", "data-quality", "setup-gap", "details-need-review", "confidence"])) {
      return null;
    }
    const structuredConcept = resolveStructuredCardConcept(event);
    if (structuredConcept) {
      return structuredConcept;
    }
    if (hasTextPart(text, ["90-day", "90-days", "90day", "transition", "first-3-month", "first-three-month"])) {
      return "transition";
    }
    if (hasTextPart(text, ["education", "college", "tuition", "529"])) {
      return "educationFunding";
    }
    if (hasTextPart(text, ["dependent", "dependents", "care", "childcare", "elder-care", "care-cost"])) {
      return "dependentCare";
    }
    if (hasTextPart(text, ["retirement", "qualified-annuity", "qualified-annuities", "ira", "401k", "403b"])) {
      return "retirementAssets";
    }
    if (hasTextPart(text, ["emergency-fund", "emergency"])) {
      return "emergencyFund";
    }
    if (hasTextPart(text, ["taxable", "brokerage", "liquid-investment", "liquid-resource", "other-liquid", "liquid"])) {
      return hasTextPart(text, ["taxable", "brokerage"]) ? "taxableInvestments" : "liquidResources";
    }
    if (hasTextPart(text, ["cash-reserve", "cash-savings", "checking", "savings", "hysa", "money-market", "cds", "cash-waterfall", "pre-death-saved-cash", "cash"])) {
      return "cashReserve";
    }
    if (hasTextPart(text, ["mortgage"])) {
      return "mortgage";
    }
    if (hasTextPart(text, ["rent", "eviction"])) {
      return "rent";
    }
    if (hasTextPart(text, ["housing", "home-equity", "foreclosure", "home"])) {
      return "housing";
    }
    if (hasTextPart(text, ["debt", "debts", "obligation", "obligations", "final-expense", "payment", "payments"])) {
      return "obligations";
    }
    if (hasTextPart(text, ["coverage", "protection", "life-insurance", "existing-coverage"])) {
      return "coverageDuration";
    }

    if (category === "liquidity") {
      return "liquidResources";
    }
    if (category === "housing") {
      return "housing";
    }
    if (category === "dependentsCare") {
      return "dependentCare";
    }
    return null;
  }

  function resolveSupportingDotConcept(event, rawTitle, category) {
    const text = getEventSearchText(event, rawTitle, category);
    if (!text || category === "dataConfidence") {
      return null;
    }
    const triggerId = normalizeKey(firstString([
      event?.trace?.triggerId,
      event?.trace?.supportingDotTriggerId,
      event?.sourceEventId,
      event?.eventId,
      event?.id,
      event?.ruleId
    ]));
    const candidateSource = normalizeKey(event?.trace?.candidateSource || event?.candidateSource);
    const sourceBackedSupportingTrigger = candidateSource === "supporting-dot-trigger";
    if (triggerId === "spending-begins-to-compress" && sourceBackedSupportingTrigger) {
      return "spendingCompression";
    }
    if (triggerId === "survivor-income-begins" && sourceBackedSupportingTrigger) {
      return "survivorIncomeBegins";
    }
    if (hasTextPart(text, ["coverage-extends", "coverage-extension", "coverage-extends-the-runway", "coverage-added", "coverage-helps", "existing-coverage"])) {
      return "coverageExtendsRunway";
    }
    return null;
  }

  function resolveApprovedCardMapping(event, rawTitle, category, tone) {
    const concept = resolveApprovedCardConcept(event, rawTitle, category);
    const text = getEventSearchText(event, rawTitle, category);
    let eventSpecificTitle = "";
    if (concept === "educationFunding") {
      if (hasTextPart(text, ["depleted"])) {
        eventSpecificTitle = "Education Savings Are Depleted";
      } else if (hasTextPart(text, ["redirect", "redirected", "tapped", "used", "living-needs"])) {
        eventSpecificTitle = "Education Funding Is At Risk";
      }
    }
    const title = eventSpecificTitle || (concept && APPROVED_CARD_LIBRARY[concept] ? APPROVED_CARD_LIBRARY[concept][tone] : "");
    const forbidden = title && FORBIDDEN_MAIN_CARD_TITLES.has(normalizeKey(title));
    const supportingConcept = resolveSupportingDotConcept(event, rawTitle, category);
    const supportingEntry = supportingConcept ? SUPPORTING_DOT_LIBRARY[supportingConcept] : null;
    return {
      concept,
      title: forbidden ? "" : title || "",
      mainCardEligible: Boolean(concept && title && !forbidden && tone !== "unknown"),
      supportingDotConcept: supportingConcept,
      supportingDotTitle: supportingEntry?.title || "",
      supportingDotTone: supportingEntry?.tone || null,
      supportingDotEligible: Boolean(supportingEntry)
    };
  }

  function formatVisibleEventMonthKey(relativeMonth) {
    const month = toOptionalNumber(relativeMonth);
    return month == null ? "month-unknown" : `month-${Math.max(0, Math.round(month))}`;
  }

  function inferEventState(event, rawTitle, sourceEventId) {
    const explicitState = normalizeKey(firstString([
      event?.eventState,
      event?.trace?.eventState
    ]));
    if (explicitState) {
      return explicitState;
    }
    const text = getEventSearchText(event, rawTitle, sourceEventId);
    if (hasTextPart(text, ["nearly-depleted", "nearly depleted", "at-risk", "at risk"])) {
      return "nearly-depleted";
    }
    if (hasTextPart(text, ["depleted", "unsupported", "underfunded"])) {
      return "depleted";
    }
    if (hasTextPart(text, ["tapped"])) {
      return "tapped";
    }
    if (hasTextPart(text, ["used"])) {
      return "used";
    }
    if (hasTextPart(text, ["begins-declining", "begin-declining", "declining"])) {
      return "begins-declining";
    }
    if (hasTextPart(text, ["covered", "holds", "intact", "protected"])) {
      return "holds";
    }
    return normalizeKey(rawTitle || sourceEventId);
  }

  function getVisibleStateRank(eventState, event) {
    const explicitRank = toOptionalNumber(event?.stateRank ?? event?.trace?.stateRank);
    if (explicitRank != null) {
      return explicitRank;
    }
    return VISIBLE_EVENT_STATE_RANKS[eventState] ?? 0;
  }

  function buildVisibleEventKey(identity) {
    const safeIdentity = isPlainObject(identity) ? identity : {};
    return [
      normalizeString(safeIdentity.storyStage || safeIdentity.category || "event"),
      normalizeString(safeIdentity.bucketFamily || safeIdentity.cardConceptId || "general"),
      normalizeString(safeIdentity.bucketId || safeIdentity.cardConceptId || safeIdentity.conceptId || "event"),
      normalizeString(safeIdentity.eventState || "state"),
      formatVisibleEventMonthKey(safeIdentity.relativeMonth)
    ].filter(Boolean).join(":");
  }

  function resolveVisibleEventIdentity(event, sourceEventId, category, tone, cardMapping, relativeMonth, rawTitle) {
    const cardConceptId = firstString([
      event?.cardConceptId,
      event?.conceptId,
      event?.trace?.cardConceptId,
      event?.trace?.conceptId,
      cardMapping.concept
    ]);
    const bucketFamily = firstString([
      event?.bucketFamily,
      event?.trace?.bucketFamily,
      event?.trace?.family,
      cardConceptId,
      category
    ]);
    const bucketId = firstString([
      event?.bucketId,
      event?.trace?.bucketId,
      cardConceptId,
      cardMapping.title,
      rawTitle
    ]);
    const eventState = inferEventState(event, rawTitle, sourceEventId);
    const stateRank = getVisibleStateRank(eventState, event);
    const identity = {
      visibleEventKey: normalizeString(firstString([
        event?.visibleEventKey,
        event?.trace?.visibleEventKey
      ])),
      cardConceptId: cardConceptId || "",
      conceptId: firstString([event?.conceptId, event?.trace?.conceptId, cardConceptId]) || "",
      storyStage: firstString([event?.storyStage, event?.trace?.storyStage, category]) || "",
      category,
      bucketFamily: bucketFamily || "",
      bucketId: bucketId ? safeId(bucketId, "event") : "",
      eventState,
      stateRank,
      relativeMonth,
      tone
    };
    if (!identity.visibleEventKey) {
      identity.visibleEventKey = buildVisibleEventKey(identity);
    }
    return identity;
  }

  function isNonApplicableEvent(event) {
    const status = normalizeKey(event?.status);
    const evidence = normalizeKey(event?.evidenceLevel);
    const route = normalizeKey(event?.visibilityRoute || event?.route || event?.trace?.visibilityRoute);
    return event?.safeToRender === false
      || route === "forbidden"
      || status === "deferred"
      || status === "unsupported"
      || evidence === "unsupported"
      || evidence === "insufficient-data"
      || evidence === "deferred"
      || evidence === "waterfall-needed"
      || evidence === "risk-model-needed"
      || evidence === "display-only";
  }

  function normalizeSourceEvent(event, source, index) {
    if (!isPlainObject(event)) {
      return null;
    }
    const sourceEventId = firstString([
      event.id,
      event.eventId,
      event.markerId,
      event.sourceEventId,
      event.ruleId
    ]) || `${source}-${index + 1}`;
    const relativeMonth = getRelativeMonth(event);
    const rawTitle = getTitle(event, sourceEventId);
    const category = normalizeCategory(event);
    const tone = normalizeTone(event);
    const contractedEvent = typeof visibleEventContract.normalizeIncomeImpactVisibleEvent === "function"
      ? visibleEventContract.normalizeIncomeImpactVisibleEvent(event, {
        sourceEventId,
        relativeMonth,
        title: rawTitle
      })
      : null;
    const fallbackCardMapping = resolveApprovedCardMapping(event, rawTitle, category, tone);
    const cardMapping = contractedEvent ? {
      concept: contractedEvent.cardConceptId || contractedEvent.conceptId || fallbackCardMapping.concept,
      title: contractedEvent.mappedCardTitle || contractedEvent.title || fallbackCardMapping.title,
      mainCardEligible: contractedEvent.mainEligible === true,
      supportingDotEligible: contractedEvent.supportingDotEligible === true,
      supportingDotConcept: contractedEvent.conceptId || contractedEvent.cardConceptId || fallbackCardMapping.supportingDotConcept,
      supportingDotTitle: contractedEvent.supportingOnly === true ? contractedEvent.mappedCardTitle || contractedEvent.title : "",
      supportingDotTone: contractedEvent.supportingOnly === true ? contractedEvent.tone || tone : null
    } : fallbackCardMapping;
    const visibleIdentity = contractedEvent ? {
      visibleEventKey: contractedEvent.visibleEventKey,
      cardConceptId: contractedEvent.cardConceptId,
      conceptId: contractedEvent.conceptId,
      storyStage: contractedEvent.storyStage,
      category: contractedEvent.category || category,
      bucketFamily: contractedEvent.bucketFamily,
      bucketId: contractedEvent.bucketId,
      eventState: contractedEvent.eventState,
      stateRank: contractedEvent.stateRank,
      relativeMonth,
      tone: contractedEvent.tone || tone
    } : resolveVisibleEventIdentity(event, sourceEventId, category, tone, cardMapping, relativeMonth, rawTitle);
    const sourceBlocksMainCard = event.supportingDotOnly === true
      || event.eligibleForMajorCard === false
      || event.mainCardEligible === false;
    const sourceSupportsDot = event.supportingDotEligible === true
      || event.supportingDotOnly === true
      || (sourceBlocksMainCard && event.eligibleForGraphDot === true);
    const contractBlocksMainCard = contractedEvent
      ? contractedEvent.mainEligible !== true
      : false;
    const contractSupportsDot = contractedEvent
      ? contractedEvent.supportingDotEligible === true
      : false;
    return {
      id: sourceEventId,
      source,
      sourceIndex: index,
      sourceEventId,
      category: contractedEvent?.category || category,
      tone: contractedEvent?.tone || tone,
      title: rawTitle,
      rawTitle,
      approvedCardTitle: cardMapping.title,
      cardConcept: cardMapping.concept,
      visibleEventKey: visibleIdentity.visibleEventKey,
      cardConceptId: visibleIdentity.cardConceptId,
      conceptId: visibleIdentity.conceptId,
      storyStage: visibleIdentity.storyStage,
      bucketFamily: visibleIdentity.bucketFamily,
      bucketId: visibleIdentity.bucketId,
      eventState: visibleIdentity.eventState,
      stateRank: visibleIdentity.stateRank,
      visibilityRoute: contractedEvent?.visibilityRoute || "",
      supportingOnly: contractedEvent?.supportingOnly === true || event.supportingDotOnly === true,
      detailOnly: contractedEvent?.detailOnly === true,
      mainCardEligible: (sourceBlocksMainCard || contractBlocksMainCard) ? false : cardMapping.mainCardEligible,
      supportingDotConcept: cardMapping.supportingDotConcept,
      supportingDotTitle: cardMapping.supportingDotTitle || (sourceSupportsDot ? rawTitle : ""),
      supportingDotTone: cardMapping.supportingDotTone || (sourceSupportsDot ? tone : null),
      supportingDotEligible: Boolean(cardMapping.supportingDotEligible || sourceSupportsDot || contractSupportsDot),
      shortLabel: firstString([event.shortLabel, event.graphLabel, event.displayLabel, event.markerLabel, rawTitle]),
      relativeMonth,
      timingLabel: formatTimingLabel(relativeMonth),
      priority: toOptionalNumber(event.priority),
      isStable: Boolean(event.isStable || tone === "stable"),
      nonApplicable: isNonApplicableEvent(event),
      original: event
    };
  }

  function addSourceEvents(target, source, events) {
    getArray(events).forEach(function (event, index) {
      const normalized = normalizeSourceEvent(event, source, index);
      if (normalized) {
        target.push(normalized);
      }
    });
  }

  function collectSourceEvents(input) {
    const events = [];
    addSourceEvents(events, "timelineStoryEvents", input?.timelineStoryEvents?.events);
    addSourceEvents(events, "financialStorylineSafeRenderable", input?.financialStoryline?.safeRenderableEvents);
    addSourceEvents(events, "riskEvents", input?.riskEvents);
    addSourceEvents(events, "stableEvents", input?.stableEvents);
    return events;
  }

  function mergeSourceEvent(existing, incoming) {
    existing.source = existing.source || incoming.source;
    existing.category = existing.category || incoming.category;
    existing.tone = existing.tone === "unknown" ? incoming.tone : existing.tone;
    existing.title = existing.title || incoming.title;
    existing.rawTitle = existing.rawTitle || incoming.rawTitle;
    existing.approvedCardTitle = existing.approvedCardTitle || incoming.approvedCardTitle;
    existing.cardConcept = existing.cardConcept || incoming.cardConcept;
    existing.visibleEventKey = existing.visibleEventKey || incoming.visibleEventKey;
    existing.cardConceptId = existing.cardConceptId || incoming.cardConceptId;
    existing.conceptId = existing.conceptId || incoming.conceptId;
    existing.storyStage = existing.storyStage || incoming.storyStage;
    existing.bucketFamily = existing.bucketFamily || incoming.bucketFamily;
    existing.bucketId = existing.bucketId || incoming.bucketId;
    existing.eventState = existing.eventState || incoming.eventState;
    existing.stateRank = existing.stateRank == null ? incoming.stateRank : existing.stateRank;
    existing.visibilityRoute = existing.visibilityRoute || incoming.visibilityRoute;
    existing.supportingOnly = existing.supportingOnly || incoming.supportingOnly;
    existing.detailOnly = existing.detailOnly || incoming.detailOnly;
    existing.mainCardEligible = Boolean(existing.mainCardEligible || incoming.mainCardEligible);
    existing.supportingDotConcept = existing.supportingDotConcept || incoming.supportingDotConcept;
    existing.supportingDotTitle = existing.supportingDotTitle || incoming.supportingDotTitle;
    existing.supportingDotTone = existing.supportingDotTone || incoming.supportingDotTone;
    existing.supportingDotEligible = Boolean(existing.supportingDotEligible || incoming.supportingDotEligible);
    existing.shortLabel = existing.shortLabel || incoming.shortLabel;
    existing.relativeMonth = existing.relativeMonth == null ? incoming.relativeMonth : existing.relativeMonth;
    existing.timingLabel = existing.timingLabel || incoming.timingLabel;
    existing.priority = existing.priority == null ? incoming.priority : existing.priority;
    existing.isStable = existing.isStable || incoming.isStable;
    existing.nonApplicable = existing.nonApplicable && incoming.nonApplicable;
    existing.traceSources = Array.from(new Set([].concat(existing.traceSources || [existing.source], incoming.source).filter(Boolean)));
    return existing;
  }

  function dedupeEvents(events) {
    const byId = new Map();
    events.forEach(function (event) {
      if (!event || !event.sourceEventId) {
        return;
      }
      if (byId.has(event.sourceEventId)) {
        mergeSourceEvent(byId.get(event.sourceEventId), event);
        return;
      }
      byId.set(event.sourceEventId, Object.assign({}, event, {
        traceSources: [event.source]
      }));
    });
    return Array.from(byId.values());
  }

  function getVisibleBucketKey(event) {
    const storyStage = normalizeString(event?.storyStage || event?.category);
    const bucketFamily = normalizeString(event?.bucketFamily || event?.cardConceptId || event?.cardConcept);
    const bucketId = normalizeString(event?.bucketId || event?.cardConceptId || event?.cardConcept);
    if (!storyStage || !bucketFamily || !bucketId) {
      return "";
    }
    return [storyStage, bucketFamily, bucketId].join(":");
  }

  function applyVisibleEventKeyDedupe(events, suppressed, trace) {
    const byVisibleKey = new Map();
    const output = [];
    events.forEach(function (event) {
      const key = normalizeString(event?.visibleEventKey);
      if (!key) {
        output.push(event);
        return;
      }
      if (byVisibleKey.has(key)) {
        const existing = byVisibleKey.get(key);
        mergeSourceEvent(existing, event);
        suppressed.push(makeSuppressed(event, "duplicate-visible-event-key"));
        trace.visibleEventDuplicateSuppressionCount += 1;
        return;
      }
      byVisibleKey.set(key, event);
      output.push(event);
    });
    return output;
  }

  function applyVisibleStatePrecedence(events, suppressed, trace) {
    const visible = [];
    events.slice().sort(function (left, right) {
      const leftMonth = left.relativeMonth == null ? Number.POSITIVE_INFINITY : left.relativeMonth;
      const rightMonth = right.relativeMonth == null ? Number.POSITIVE_INFINITY : right.relativeMonth;
      const leftRank = toOptionalNumber(left.stateRank) ?? 0;
      const rightRank = toOptionalNumber(right.stateRank) ?? 0;
      return leftMonth - rightMonth || rightRank - leftRank || compareEventsByTiming(left, right);
    }).forEach(function (event) {
      const bucketKey = getVisibleBucketKey(event);
      const rank = toOptionalNumber(event?.stateRank) ?? 0;
      const month = toOptionalNumber(event?.relativeMonth);
      if (!bucketKey || rank <= 0 || month == null) {
        visible.push(event);
        return;
      }
      const stronger = visible.find(function (item) {
        const itemRank = toOptionalNumber(item?.stateRank) ?? 0;
        const itemMonth = toOptionalNumber(item?.relativeMonth);
        return getVisibleBucketKey(item) === bucketKey
          && itemRank > rank
          && itemMonth != null
          && itemMonth <= month;
      });
      if (stronger) {
        suppressed.push(makeSuppressed(event, "weaker-visible-bucket-state"));
        trace.visibleStatePrecedenceSuppressionCount += 1;
        return;
      }
      visible.push(event);
    });
    return visible.sort(compareEventsByTiming);
  }

  function applyVisibleEventContract(events, suppressed, trace) {
    if (typeof visibleEventContract.applyIncomeImpactVisibleEventContract === "function") {
      const result = visibleEventContract.applyIncomeImpactVisibleEventContract(events, {
        source: SOURCE
      });
      (Array.isArray(result.suppressed) ? result.suppressed : []).forEach(function (item) {
        suppressed.push(makeSuppressed(item.event || item, item.reason || "visible-event-contract"));
      });
      trace.visibleEventDuplicateSuppressionCount += toOptionalNumber(result.trace?.duplicateVisibleEventKeySuppressedCount) || 0;
      trace.visibleStatePrecedenceSuppressionCount += toOptionalNumber(result.trace?.statePrecedenceSuppressedCount) || 0;
      trace.visibleEventContractTrace = clonePlainValue(result.trace || null);
      return result.events;
    }
    const keyed = applyVisibleEventKeyDedupe(events, suppressed, trace);
    return applyVisibleStatePrecedence(keyed, suppressed, trace);
  }

  function findSelectedDepletionPoint(graphModel) {
    const applied = getArray(graphModel?.series?.appliedRunwayScenarios);
    return (applied.find(function (series) { return series?.selected === true; }) || applied[0] || {}).depletionPoint || null;
  }

  function resolveFinalOutcome(input, events) {
    const depletionPoint = findSelectedDepletionPoint(input?.graphModel);
    const graphMonth = toOptionalNumber(
      depletionPoint?.relativeMonthsFromDeath ??
        depletionPoint?.monthOffset ??
        depletionPoint?.monthIndex
    );
    if (depletionPoint && graphMonth != null) {
      return {
        type: FINAL_OUTCOMES.resourcesRunOut,
        title: "Resources Run Out",
        tone: "critical",
        relativeMonth: graphMonth,
        source: "graphModel.depletionPoint"
      };
    }

    const depletion = input?.scenario?.postDeathSeries?.depletion;
    const depleted = depletion?.depleted === true || Boolean(depletion?.depletionDate);
    const depletionMonth = toOptionalNumber(
      depletion?.depletionMonthIndex ??
        depletion?.monthsCovered ??
        input?.timelineFacts?.monthsCovered ??
        input?.scenario?.timelineFacts?.monthsCovered
    );
    if (depleted && depletionMonth != null) {
      return {
        type: FINAL_OUTCOMES.resourcesRunOut,
        title: "Resources Run Out",
        tone: "critical",
        relativeMonth: depletionMonth,
        source: "scenario.depletion"
      };
    }

    const runoutEvent = events.find(function (event) {
      return normalizeKey(event.sourceEventId) === "resources-run-out" && event.relativeMonth != null;
    });
    if (runoutEvent) {
      return {
        type: FINAL_OUTCOMES.resourcesRunOut,
        title: "Resources Run Out",
        tone: "critical",
        relativeMonth: runoutEvent.relativeMonth,
        source: "event.resources-run-out"
      };
    }

    return {
      type: FINAL_OUTCOMES.familyRunwayRemainsFunded,
      title: "Family Runway Remains Funded",
      tone: "stable",
      relativeMonth: null,
      source: "default-or-not-depleted"
    };
  }

  function compareEventsByTiming(left, right) {
    const leftMonth = left.relativeMonth == null ? Number.POSITIVE_INFINITY : left.relativeMonth;
    const rightMonth = right.relativeMonth == null ? Number.POSITIVE_INFINITY : right.relativeMonth;
    if (leftMonth !== rightMonth) {
      return leftMonth - rightMonth;
    }
    const toneDelta = (TONE_ORDER[left.tone] ?? 99) - (TONE_ORDER[right.tone] ?? 99);
    if (toneDelta !== 0) {
      return toneDelta;
    }
    return (left.priority ?? 999) - (right.priority ?? 999)
      || normalizeString(left.sourceEventId).localeCompare(normalizeString(right.sourceEventId));
  }

  function canUseAsIntermediate(event) {
    const id = normalizeKey(event?.sourceEventId);
    return event
      && !event.nonApplicable
      && event.mainCardEligible === true
      && event.tone !== "unknown"
      && event.relativeMonth != null
      && event.relativeMonth >= 0
      && id !== "death-income-stops"
      && id !== "resources-run-out"
      && id !== "transition-outlook"
      && event.category !== "trigger"
      && event.category !== "finalOutcome";
  }

  function canUseAsSupportingDot(event) {
    const id = normalizeKey(event?.sourceEventId);
    return event
      && !event.nonApplicable
      && event.supportingDotEligible === true
      && event.relativeMonth != null
      && event.relativeMonth >= 0
      && id !== "death-income-stops"
      && id !== "resources-run-out"
      && id !== "transition-outlook"
      && event.category !== "trigger"
      && event.category !== "finalOutcome";
  }

  function selectIntermediateEvents(events, suppressed, trace) {
    const timed = events.filter(canUseAsIntermediate).sort(compareEventsByTiming);
    const selected = [];
    const selectedIds = new Set();
    const selectedCategories = new Set();

    timed.forEach(function (event) {
      if (selected.length >= INTERMEDIATE_STEP_TARGET || selectedIds.has(event.sourceEventId)) {
        return;
      }
      if (!selectedCategories.has(event.category)) {
        selected.push(event);
        selectedIds.add(event.sourceEventId);
        selectedCategories.add(event.category);
      }
    });

    timed.forEach(function (event) {
      if (selected.length >= INTERMEDIATE_STEP_TARGET || selectedIds.has(event.sourceEventId)) {
        return;
      }
      if (HIGH_IMPACT_REPEAT_CATEGORIES.includes(event.category)) {
        selected.push(event);
        selectedIds.add(event.sourceEventId);
        trace.controlledRepeatUsage += 1;
      }
    });

    timed.forEach(function (event) {
      if (selected.length >= INTERMEDIATE_STEP_TARGET || selectedIds.has(event.sourceEventId)) {
        return;
      }
      selected.push(event);
      selectedIds.add(event.sourceEventId);
    });

    events.forEach(function (event) {
      if (!event || selectedIds.has(event.sourceEventId)) {
        return;
      }
      let reason = "";
      if (event.nonApplicable) {
        reason = "non-applicable";
      } else if (event.category === "dataConfidence") {
        reason = "data-confidence-main-strip-excluded";
      } else if (event.tone === "unknown") {
        reason = "unknown-tone-main-strip-excluded";
      } else if (event.relativeMonth == null) {
        reason = "missing-reliable-timing";
      } else if (event.supportingDotEligible === true) {
        reason = "supporting-dot-only";
      } else if (!canUseAsIntermediate(event)) {
        reason = event.mainCardEligible === false ? "unapproved-main-card-title" : "reserved-or-out-of-scope";
      } else {
        reason = "not-selected";
      }
      suppressed.push(makeSuppressed(event, reason));
    });

    return selected.sort(compareEventsByTiming);
  }

  function makeSuppressed(event, reason) {
    return {
      id: `${safeId(event?.sourceEventId, "event")}-${reason}`,
      sourceEventId: event?.sourceEventId || null,
      reason,
      category: event?.category || "",
      tone: event?.tone || "unknown",
      relativeMonth: event?.relativeMonth ?? null,
      visibleEventKey: event?.visibleEventKey || null,
      cardConceptId: event?.cardConceptId || null,
      conceptId: event?.conceptId || null,
      storyStage: event?.storyStage || null,
      bucketFamily: event?.bucketFamily || null,
      bucketId: event?.bucketId || null,
      eventState: event?.eventState || null,
      stateRank: event?.stateRank ?? null,
      visibilityRoute: event?.visibilityRoute || null,
      trace: {
        source: SOURCE,
        originalSource: event?.source || null,
        originalSourceTitle: event?.rawTitle || event?.title || null,
        mappedCardTitle: event?.approvedCardTitle || null,
        cardConcept: event?.cardConcept || null,
        visibleEventKey: event?.visibleEventKey || null,
        cardConceptId: event?.cardConceptId || null,
        conceptId: event?.conceptId || null,
        storyStage: event?.storyStage || null,
        bucketFamily: event?.bucketFamily || null,
        bucketId: event?.bucketId || null,
        eventState: event?.eventState || null,
        stateRank: event?.stateRank ?? null,
        visibilityRoute: event?.visibilityRoute || null,
        supportingDotTitle: event?.supportingDotTitle || null,
        supportingDotConcept: event?.supportingDotConcept || null
      }
    };
  }

  function makeStoryStep(input) {
    return {
      id: input.id,
      stepNumber: input.stepNumber,
      lockedPosition: input.lockedPosition || null,
      role: input.role,
      category: input.category,
      tone: input.tone,
      title: input.title,
      shortLabel: input.shortLabel || input.title,
      timingLabel: input.timingLabel || formatTimingLabel(input.relativeMonth),
      relativeMonth: input.relativeMonth == null ? null : input.relativeMonth,
      graphDotId: input.graphDotId || null,
      sourceEventId: input.sourceEventId || null,
      visibleEventKey: input.visibleEventKey || null,
      cardConceptId: input.cardConceptId || null,
      conceptId: input.conceptId || null,
      storyStage: input.storyStage || null,
      bucketFamily: input.bucketFamily || null,
      bucketId: input.bucketId || null,
      eventState: input.eventState || null,
      stateRank: input.stateRank ?? null,
      visibilityRoute: input.visibilityRoute || null,
      trace: Object.assign({
        source: SOURCE
      }, isPlainObject(input.trace) ? input.trace : {})
    };
  }

  function makeMajorDot(step, role) {
    return {
      id: `major-dot-${step.id}`,
      connectedStepId: step.id,
      tone: step.tone,
      relativeMonth: step.relativeMonth,
      sourceEventId: step.sourceEventId,
      visibleEventKey: step.visibleEventKey || null,
      cardConceptId: step.cardConceptId || null,
      conceptId: step.conceptId || null,
      storyStage: step.storyStage || null,
      bucketFamily: step.bucketFamily || null,
      bucketId: step.bucketId || null,
      eventState: step.eventState || null,
      stateRank: step.stateRank ?? null,
      visibilityRoute: step.visibilityRoute || null,
      trace: {
        source: SOURCE,
        role,
        visibleEventKey: step.visibleEventKey || null,
        cardConceptId: step.cardConceptId || null,
        conceptId: step.conceptId || null,
        storyStage: step.storyStage || null,
        bucketFamily: step.bucketFamily || null,
        bucketId: step.bucketId || null,
        eventState: step.eventState || null,
        stateRank: step.stateRank ?? null,
        visibilityRoute: step.visibilityRoute || null
      }
    };
  }

  function makeConnector(step, dot) {
    return {
      id: `connector-${step.id}-${dot.id}`,
      stepId: step.id,
      graphDotId: dot.id,
      trace: {
        source: SOURCE
      }
    };
  }

  function assignMajorDot(step, majorGraphDots, connectors, role) {
    const dot = makeMajorDot(step, role);
    step.graphDotId = dot.id;
    majorGraphDots.push(dot);
    connectors.push(makeConnector(step, dot));
  }

  function buildSyntheticVisibleIdentity(sourceEventId, title, relativeMonth, tone) {
    if (typeof visibleEventContract.normalizeIncomeImpactVisibleEvent !== "function") {
      return {};
    }
    const contracted = visibleEventContract.normalizeIncomeImpactVisibleEvent({
      id: sourceEventId,
      sourceEventId,
      title,
      cardTitle: title,
      displayLabel: title,
      graphLabel: title,
      relativeMonth,
      tone
    }, {
      source: SOURCE
    });
    return {
      visibleEventKey: contracted.visibleEventKey || null,
      cardConceptId: contracted.cardConceptId || null,
      conceptId: contracted.conceptId || null,
      storyStage: contracted.storyStage || null,
      bucketFamily: contracted.bucketFamily || null,
      bucketId: contracted.bucketId || null,
      eventState: contracted.eventState || null,
      stateRank: contracted.stateRank ?? null,
      visibilityRoute: contracted.visibilityRoute || null
    };
  }

  function makeStepFromEvent(event, stepNumber) {
    return makeStoryStep({
      id: `story-step-${stepNumber}-${safeId(event.sourceEventId, "event")}`,
      stepNumber,
      lockedPosition: null,
      role: "event",
      category: event.category,
      tone: event.tone,
      title: event.approvedCardTitle,
      shortLabel: event.approvedCardTitle,
      timingLabel: event.timingLabel,
      relativeMonth: event.relativeMonth,
      graphDotId: null,
      sourceEventId: event.sourceEventId,
      visibleEventKey: event.visibleEventKey,
      cardConceptId: event.cardConceptId,
      conceptId: event.conceptId,
      storyStage: event.storyStage,
      bucketFamily: event.bucketFamily,
      bucketId: event.bucketId,
      eventState: event.eventState,
      stateRank: event.stateRank,
      visibilityRoute: event.visibilityRoute,
      trace: {
        originalSource: event.source,
        traceSources: clonePlainValue(event.traceSources || [event.source]),
        originalSourceTitle: event.rawTitle || event.title,
        mappedCardTitle: event.approvedCardTitle,
        cardConcept: event.cardConcept,
        visibleEventKey: event.visibleEventKey || null,
        cardConceptId: event.cardConceptId || null,
        conceptId: event.conceptId || null,
        storyStage: event.storyStage || null,
        bucketFamily: event.bucketFamily || null,
        bucketId: event.bucketId || null,
        eventState: event.eventState || null,
        stateRank: event.stateRank ?? null,
        visibilityRoute: event.visibilityRoute || null
      }
    });
  }

  function getSupportingDotLimit(options) {
    const limit = toOptionalNumber(options?.supportingGraphDotLimit);
    if (limit == null) {
      return DEFAULT_SUPPORTING_DOT_LIMIT;
    }
    return Math.max(0, Math.min(12, Math.round(limit)));
  }

  function buildSupportingDots(events, usedSourceEventIds, usedVisibleEventKeys, options) {
    const limit = getSupportingDotLimit(options);
    return events
      .filter(function (event) {
        const visibleKey = normalizeString(event?.visibleEventKey);
        return (canUseAsIntermediate(event) || canUseAsSupportingDot(event))
          && !usedSourceEventIds.has(event.sourceEventId)
          && (!visibleKey || !usedVisibleEventKeys.has(visibleKey));
      })
      .sort(compareEventsByTiming)
      .slice(0, limit)
      .map(function (event) {
        return {
          id: `supporting-dot-${safeId(event.sourceEventId, "event")}`,
          tone: event.supportingDotTone || event.tone,
          title: event.supportingDotTitle || event.approvedCardTitle || event.rawTitle || event.title,
          displayLabel: event.supportingDotTitle || event.approvedCardTitle || "",
          shortLabel: event.supportingDotTitle || event.approvedCardTitle || "",
          relativeMonth: event.relativeMonth,
          sourceEventId: event.sourceEventId,
          visibleEventKey: event.visibleEventKey || null,
          cardConceptId: event.cardConceptId || null,
          conceptId: event.conceptId || null,
          storyStage: event.storyStage || null,
          bucketFamily: event.bucketFamily || null,
          bucketId: event.bucketId || null,
          eventState: event.eventState || null,
          stateRank: event.stateRank ?? null,
          visibilityRoute: event.visibilityRoute || null,
          trace: {
            source: SOURCE,
            originalSource: event.source,
            originalSourceTitle: event.rawTitle || event.title,
            mappedCardTitle: event.approvedCardTitle || null,
            supportingDotTitle: event.supportingDotTitle || null,
            cardConcept: event.cardConcept || null,
            supportingDotConcept: event.supportingDotConcept || null,
            visibleEventKey: event.visibleEventKey || null,
            cardConceptId: event.cardConceptId || null,
            conceptId: event.conceptId || null,
            storyStage: event.storyStage || null,
            bucketFamily: event.bucketFamily || null,
            bucketId: event.bucketId || null,
            eventState: event.eventState || null,
            stateRank: event.stateRank ?? null,
            visibilityRoute: event.visibilityRoute || null,
            noDefaultLabel: true
          }
        };
      });
  }

  function countSuppressedByReason(suppressed) {
    return suppressed.reduce(function (counts, item) {
      const key = item.reason || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function buildIncomeImpactTimelineStoryAssembly(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const trace = {
      source: SOURCE,
      version: VERSION,
      inputCounts: {
        timelineStoryEvents: getArray(safeInput.timelineStoryEvents?.events).length,
        financialStorylineSafeRenderable: getArray(safeInput.financialStoryline?.safeRenderableEvents).length,
        financialStorylineSuppressed: getArray(safeInput.financialStoryline?.suppressedCandidates).length,
        riskEvents: getArray(safeInput.riskEvents).length,
        stableEvents: getArray(safeInput.stableEvents).length
      },
      selectedIntermediateCount: 0,
      majorGraphDotCount: 0,
      supportingGraphDotCount: 0,
      connectorCount: 0,
      finalOutcomeSource: "",
      suppressionCountsByReason: {},
      missingTimingExclusionCount: 0,
      controlledRepeatUsage: 0,
      visibleEventDuplicateSuppressionCount: 0,
      visibleStatePrecedenceSuppressionCount: 0,
      exactNineStepTargetMet: false,
      displayOnly: true,
      noUiMutation: true,
      noGraphMutation: true
    };
    const suppressed = [];
    const sourceEvents = applyVisibleEventContract(dedupeEvents(collectSourceEvents(safeInput)), suppressed, trace);
    const finalOutcome = resolveFinalOutcome(safeInput, sourceEvents);
    const selectedEvents = selectIntermediateEvents(sourceEvents, suppressed, trace);
    const majorGraphDots = [];
    const connectors = [];
    const deathVisibleIdentity = buildSyntheticVisibleIdentity(
      "death-income-stops",
      "Income Stops at Death",
      0,
      "critical"
    );

    const storySteps = [
      makeStoryStep({
        id: "story-step-1-death-income-stops",
        stepNumber: 1,
        lockedPosition: "first",
        role: "death",
        category: "trigger",
        tone: "critical",
        title: "Income Stops at Death",
        shortLabel: "Income Stops at Death",
        timingLabel: "At death",
        relativeMonth: 0,
        graphDotId: null,
        sourceEventId: "death-income-stops",
        visibleEventKey: deathVisibleIdentity.visibleEventKey,
        cardConceptId: deathVisibleIdentity.cardConceptId,
        conceptId: deathVisibleIdentity.conceptId,
        storyStage: deathVisibleIdentity.storyStage,
        bucketFamily: deathVisibleIdentity.bucketFamily,
        bucketId: deathVisibleIdentity.bucketId,
        eventState: deathVisibleIdentity.eventState,
        stateRank: deathVisibleIdentity.stateRank,
        visibilityRoute: deathVisibleIdentity.visibilityRoute,
        trace: {
          synthesized: true,
          graphMarkerOwnsDot: true,
          originalSourceTitle: "Death / Income Stops",
          mappedCardTitle: "Income Stops at Death",
          cardConcept: "deathIncomeTrigger",
          visibleEventKey: deathVisibleIdentity.visibleEventKey || null,
          cardConceptId: deathVisibleIdentity.cardConceptId || null,
          conceptId: deathVisibleIdentity.conceptId || null,
          storyStage: deathVisibleIdentity.storyStage || null,
          bucketFamily: deathVisibleIdentity.bucketFamily || null,
          bucketId: deathVisibleIdentity.bucketId || null,
          eventState: deathVisibleIdentity.eventState || null,
          stateRank: deathVisibleIdentity.stateRank ?? null,
          visibilityRoute: deathVisibleIdentity.visibilityRoute || null
        }
      })
    ];

    selectedEvents.forEach(function (event, index) {
      const step = makeStepFromEvent(event, index + 2);
      assignMajorDot(step, majorGraphDots, connectors, "selected-story-step");
      storySteps.push(step);
    });

    const finalOutcomeSourceEventId = finalOutcome.type === FINAL_OUTCOMES.resourcesRunOut
      ? "resources-run-out"
      : "family-runway-remains-funded";
    const finalVisibleIdentity = buildSyntheticVisibleIdentity(
      finalOutcomeSourceEventId,
      finalOutcome.title,
      finalOutcome.relativeMonth,
      finalOutcome.tone
    );
    const finalStep = makeStoryStep({
      id: "story-step-9-final-outcome",
      stepNumber: STORY_STEP_TARGET,
      lockedPosition: "final",
      role: "finalOutcome",
      category: "finalOutcome",
      tone: finalOutcome.tone,
      title: finalOutcome.title,
      shortLabel: finalOutcome.title,
      timingLabel: formatTimingLabel(finalOutcome.relativeMonth),
      relativeMonth: finalOutcome.relativeMonth,
      graphDotId: null,
      sourceEventId: finalOutcome.type,
      visibleEventKey: finalVisibleIdentity.visibleEventKey,
      cardConceptId: finalVisibleIdentity.cardConceptId,
      conceptId: finalVisibleIdentity.conceptId,
      storyStage: finalVisibleIdentity.storyStage,
      bucketFamily: finalVisibleIdentity.bucketFamily,
      bucketId: finalVisibleIdentity.bucketId,
      eventState: finalVisibleIdentity.eventState,
      stateRank: finalVisibleIdentity.stateRank,
      visibilityRoute: finalVisibleIdentity.visibilityRoute,
      trace: {
        synthesized: true,
        finalOutcomeType: finalOutcome.type,
        finalOutcomeSource: finalOutcome.source,
        visibleEventKey: finalVisibleIdentity.visibleEventKey || null,
        cardConceptId: finalVisibleIdentity.cardConceptId || null,
        conceptId: finalVisibleIdentity.conceptId || null,
        storyStage: finalVisibleIdentity.storyStage || null,
        bucketFamily: finalVisibleIdentity.bucketFamily || null,
        bucketId: finalVisibleIdentity.bucketId || null,
        eventState: finalVisibleIdentity.eventState || null,
        stateRank: finalVisibleIdentity.stateRank ?? null,
        visibilityRoute: finalVisibleIdentity.visibilityRoute || null
      }
    });
    if (finalOutcome.type === FINAL_OUTCOMES.resourcesRunOut) {
      assignMajorDot(finalStep, majorGraphDots, connectors, "final-runout-outcome");
    }
    storySteps.push(finalStep);

    const usedSourceEventIds = new Set(storySteps.map(function (step) {
      return step.sourceEventId;
    }).filter(Boolean));
    const usedVisibleEventKeys = new Set(storySteps.map(function (step) {
      return normalizeString(step.visibleEventKey);
    }).filter(Boolean));
    const supportingGraphDots = buildSupportingDots(sourceEvents, usedSourceEventIds, usedVisibleEventKeys, safeInput.options);

    trace.selectedIntermediateCount = selectedEvents.length;
    trace.majorGraphDotCount = majorGraphDots.length;
    trace.supportingGraphDotCount = supportingGraphDots.length;
    trace.connectorCount = connectors.length;
    trace.finalOutcomeSource = finalOutcome.source;
    trace.finalOutcomeType = finalOutcome.type;
    trace.suppressionCountsByReason = countSuppressedByReason(suppressed);
    trace.missingTimingExclusionCount = trace.suppressionCountsByReason["missing-reliable-timing"] || 0;
    trace.exactNineStepTargetMet = storySteps.length === STORY_STEP_TARGET;

    return {
      version: VERSION,
      storySteps,
      majorGraphDots,
      supportingGraphDots,
      connectors,
      suppressed,
      trace
    };
  }

  const api = {
    buildIncomeImpactTimelineStoryAssembly,
    INCOME_IMPACT_TIMELINE_STORY_ASSEMBLY_VERSION: VERSION,
    INCOME_IMPACT_TIMELINE_STORY_ASSEMBLY_FINAL_OUTCOMES: FINAL_OUTCOMES
  };

  Object.assign(lensAnalysis, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
