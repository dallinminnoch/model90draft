(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-timeline-story-assembly-v1";
  const SOURCE = "income-impact-timeline-story-assembly";
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
    "supportGap",
    "finalOutcome"
  ]);

  const TONE_ORDER = Object.freeze({
    critical: 0,
    atRisk: 1,
    caution: 2,
    stable: 3,
    unknown: 4
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
      caution: "Retirement Assets Are At Risk",
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

  function resolveApprovedCardConcept(event, rawTitle, category) {
    const text = getEventSearchText(event, rawTitle, category);
    if (!text || category === "dataConfidence" || hasTextPart(text, ["data-confidence", "data-quality", "setup-gap", "details-need-review", "confidence"])) {
      return null;
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
    if (hasTextPart(text, ["cash-reserve", "cash-savings", "checking", "savings", "hysa", "money-market", "cds", "cash-waterfall", "pre-death-saved-cash", "cash"])) {
      return "cashReserve";
    }
    if (hasTextPart(text, ["taxable", "brokerage", "liquid-investment", "liquid-resource", "other-liquid", "liquid"])) {
      return "liquidResources";
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
    if (hasTextPart(text, ["auto-compression", "auto-compressed", "compression", "compress", "compressed-expense", "expense-compression"])) {
      return "spendingCompression";
    }
    if (hasTextPart(text, ["survivor-income-begins", "survivor-income-starts", "survivor-income-available", "survivor-income-delay", "survivor-income"])) {
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
    const eventSpecificTitle = concept === "educationFunding"
      && hasTextPart(text, ["redirect", "redirected", "tapped", "used", "living-needs", "depleted"])
      ? "Education Funding Is At Risk"
      : "";
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

  function isNonApplicableEvent(event) {
    const status = normalizeKey(event?.status);
    const evidence = normalizeKey(event?.evidenceLevel);
    return event?.safeToRender === false
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
    const cardMapping = resolveApprovedCardMapping(event, rawTitle, category, tone);
    const sourceBlocksMainCard = event.supportingDotOnly === true
      || event.eligibleForMajorCard === false
      || event.mainCardEligible === false;
    const sourceSupportsDot = event.supportingDotEligible === true
      || event.supportingDotOnly === true
      || (sourceBlocksMainCard && event.eligibleForGraphDot === true);
    return {
      id: sourceEventId,
      source,
      sourceIndex: index,
      sourceEventId,
      category,
      tone,
      title: rawTitle,
      rawTitle,
      approvedCardTitle: cardMapping.title,
      cardConcept: cardMapping.concept,
      mainCardEligible: sourceBlocksMainCard ? false : cardMapping.mainCardEligible,
      supportingDotConcept: cardMapping.supportingDotConcept,
      supportingDotTitle: cardMapping.supportingDotTitle || (sourceSupportsDot ? rawTitle : ""),
      supportingDotTone: cardMapping.supportingDotTone || (sourceSupportsDot ? tone : null),
      supportingDotEligible: Boolean(cardMapping.supportingDotEligible || sourceSupportsDot),
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
      trace: {
        source: SOURCE,
        originalSource: event?.source || null,
        originalSourceTitle: event?.rawTitle || event?.title || null,
        mappedCardTitle: event?.approvedCardTitle || null,
        cardConcept: event?.cardConcept || null,
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
      trace: {
        source: SOURCE,
        role
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
      trace: {
        originalSource: event.source,
        traceSources: clonePlainValue(event.traceSources || [event.source]),
        originalSourceTitle: event.rawTitle || event.title,
        mappedCardTitle: event.approvedCardTitle,
        cardConcept: event.cardConcept
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

  function buildSupportingDots(events, usedSourceEventIds, options) {
    const limit = getSupportingDotLimit(options);
    return events
      .filter(function (event) {
        return (canUseAsIntermediate(event) || canUseAsSupportingDot(event)) && !usedSourceEventIds.has(event.sourceEventId);
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
          trace: {
            source: SOURCE,
            originalSource: event.source,
            originalSourceTitle: event.rawTitle || event.title,
            mappedCardTitle: event.approvedCardTitle || null,
            supportingDotTitle: event.supportingDotTitle || null,
            cardConcept: event.cardConcept || null,
            supportingDotConcept: event.supportingDotConcept || null,
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
      exactNineStepTargetMet: false,
      displayOnly: true,
      noUiMutation: true,
      noGraphMutation: true
    };
    const suppressed = [];
    const sourceEvents = dedupeEvents(collectSourceEvents(safeInput));
    const finalOutcome = resolveFinalOutcome(safeInput, sourceEvents);
    const selectedEvents = selectIntermediateEvents(sourceEvents, suppressed, trace);
    const majorGraphDots = [];
    const connectors = [];

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
        trace: {
          synthesized: true,
          graphMarkerOwnsDot: true,
          originalSourceTitle: "Death / Income Stops",
          mappedCardTitle: "Income Stops at Death",
          cardConcept: "deathIncomeTrigger"
        }
      })
    ];

    selectedEvents.forEach(function (event, index) {
      const step = makeStepFromEvent(event, index + 2);
      assignMajorDot(step, majorGraphDots, connectors, "selected-story-step");
      storySteps.push(step);
    });

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
      trace: {
        synthesized: true,
        finalOutcomeType: finalOutcome.type,
        finalOutcomeSource: finalOutcome.source
      }
    });
    if (finalOutcome.type === FINAL_OUTCOMES.resourcesRunOut) {
      assignMajorDot(finalStep, majorGraphDots, connectors, "final-runout-outcome");
    }
    storySteps.push(finalStep);

    const usedSourceEventIds = new Set(storySteps.map(function (step) {
      return step.sourceEventId;
    }).filter(Boolean));
    const supportingGraphDots = buildSupportingDots(sourceEvents, usedSourceEventIds, safeInput.options);

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
