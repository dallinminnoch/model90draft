(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-timeline-story-events-v1";
  const SOURCE = "income-impact-timeline-story-events";
  const visibleEventContract = lensAnalysis.incomeImpactVisibleEventContract || (function () {
    try {
      return typeof require === "function"
        ? require("./income-impact-visible-event-contract.js")
        : null;
    } catch (error) {
      return null;
    }
  })() || {};
  const SHORT_LABEL_MAX_LENGTH = 32;

  const SEVERITY_ORDER = Object.freeze({
    critical: 0,
    atRisk: 1,
    caution: 2,
    info: 3,
    unknown: 4,
    stable: 5
  });

  const SURFACES = Object.freeze(new Set([
    "graph",
    "keyRisks",
    "covered",
    "resourceOutlook",
    "financialStoryline",
    "debug"
  ]));

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

  function firstString(values) {
    for (let index = 0; index < values.length; index += 1) {
      const normalized = normalizeString(values[index]);
      if (normalized) {
        return normalized;
      }
    }
    return "";
  }

  function compactLabel(value) {
    const normalized = normalizeString(value).replace(/\s+/g, " ");
    if (normalized.length <= SHORT_LABEL_MAX_LENGTH) {
      return normalized;
    }
    return normalized.slice(0, SHORT_LABEL_MAX_LENGTH - 3).trimEnd() + "...";
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

  function makeWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = clonePlainValue(details);
    }
    return warning;
  }

  function normalizeSeverity(value, options) {
    const key = normalizeKey(value);
    const forcedStable = Boolean(options && options.forceStable);

    if (forcedStable) {
      return {
        severity: "stable",
        inferred: key !== "stable"
      };
    }

    if (key === "stable" || key === "covered" || key === "safe-now") {
      return { severity: "stable", inferred: key !== "stable" };
    }
    if (key === "caution" || key === "warning") {
      return { severity: "caution", inferred: false };
    }
    if (key === "at-risk" || key === "atrisk" || key === "at-risk-status") {
      return { severity: "atRisk", inferred: key !== "at-risk" };
    }
    if (key === "critical" || key === "likely-failure" || key === "failure") {
      return { severity: "critical", inferred: key !== "critical" };
    }
    if (key === "info" || key === "informational" || key === "display-only") {
      return { severity: "info", inferred: key !== "info" };
    }
    if (key === "insufficient-data" || key === "not-available" || key === "unavailable" || key === "unknown") {
      return { severity: "unknown", inferred: key !== "unknown" };
    }

    return { severity: "unknown", inferred: true };
  }

  function normalizeSurface(value, fallback) {
    const normalized = normalizeString(value);
    if (SURFACES.has(normalized)) {
      return normalized;
    }
    return fallback;
  }

  function getEventId(event, fallbackPrefix, index) {
    return firstString([
      event.id,
      event.eventId,
      event.markerId,
      event.sourceEventId,
      event.ruleId
    ]) || fallbackPrefix + "-" + String(index + 1);
  }

  function getEventMonth(event, fallbackMonth) {
    const month = toOptionalNumber(event.month);
    if (month != null) {
      return month;
    }
    const timingMonth = toOptionalNumber(event.timing?.monthOffset ?? event.timing?.monthIndex);
    if (timingMonth != null) {
      return timingMonth;
    }
    const monthIndex = toOptionalNumber(event.monthIndex);
    if (monthIndex != null) {
      return monthIndex;
    }
    return fallbackMonth == null ? null : fallbackMonth;
  }

  function getEventDate(event) {
    return firstString([
      event.date,
      event.timing?.date,
      event.eventDate,
      event.depletionDate,
      event.startDate
    ]) || null;
  }

  function getSortDateValue(date) {
    if (!date) {
      return null;
    }
    const parsed = Date.parse(date);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeBaseEvent(event, config) {
    const warnings = [];
    const id = getEventId(event, config.fallbackPrefix, config.index);
    const month = getEventMonth(event, config.fallbackMonth);
    const date = getEventDate(event);
    const severitySource = firstString([
      event.severity,
      event.status,
      event.riskLevel,
      config.fallbackSeverity
    ]);
    const severityResult = normalizeSeverity(severitySource, { forceStable: config.forceStable });
    const rawShortLabel = firstString([
      event.shortLabel,
      event.graphLabel,
      event.markerLabel,
      event.displayLabel,
      event.label,
      event.title,
      event.cardTitle,
      event.name
    ]);
    const title = firstString([
      event.title,
      event.cardTitle,
      event.displayLabel,
      event.label,
      event.name,
      rawShortLabel
    ]);
    const detail = firstString([
      event.detail,
      event.description,
      event.summary,
      event.message
    ]);
    const sourceIndex = toOptionalNumber(config.sourceIndex ?? config.index);

    if (month == null && !date) {
      warnings.push("missing-timeline-position");
    }
    if (!rawShortLabel) {
      warnings.push("missing-label");
    }
    if (severityResult.inferred) {
      warnings.push("severity-inferred");
    }

    const baseEvent = {
      id,
      source: config.source,
      kind: config.kind,
      severity: severityResult.severity,
      month,
      date,
      shortLabel: compactLabel(rawShortLabel || title || id),
      title: title || rawShortLabel || id,
      detail,
      surface: normalizeSurface(event.surface, config.surface),
      priority: toOptionalNumber(event.priority),
      isStable: Boolean(config.forceStable || severityResult.severity === "stable" || event.isStable),
      family: normalizeString(event.family || event.category) || "",
      amount: event.amount == null ? null : clonePlainValue(event.amount),
      timing: isPlainObject(event.timing) ? clonePlainValue(event.timing) : null,
      evidenceLevel: normalizeString(event.evidenceLevel || event.evidence?.level) || "",
      dotTier: normalizeString(event.dotTier) || "",
      connectedToMajorCard: typeof event.connectedToMajorCard === "boolean" ? event.connectedToMajorCard : null,
      eligibleForConnector: typeof event.eligibleForConnector === "boolean" ? event.eligibleForConnector : null,
      eligibleForGraphDot: typeof event.eligibleForGraphDot === "boolean" ? event.eligibleForGraphDot : null,
      eligibleForMajorCard: typeof event.eligibleForMajorCard === "boolean" ? event.eligibleForMajorCard : null,
      supportingDotEligible: typeof event.supportingDotEligible === "boolean" ? event.supportingDotEligible : null,
      supportingDotOnly: typeof event.supportingDotOnly === "boolean" ? event.supportingDotOnly : null,
      mainCardEligible: typeof event.mainCardEligible === "boolean" ? event.mainCardEligible : null,
      visibleEventKey: normalizeString(event.visibleEventKey || event.trace?.visibleEventKey) || "",
      cardConceptId: normalizeString(event.cardConceptId || event.trace?.cardConceptId) || "",
      conceptId: normalizeString(event.conceptId || event.trace?.conceptId || event.cardConceptId || event.trace?.cardConceptId) || "",
      storyStage: normalizeString(event.storyStage || event.trace?.storyStage) || "",
      bucketFamily: normalizeString(event.bucketFamily || event.trace?.bucketFamily || event.trace?.family) || "",
      bucketId: normalizeString(event.bucketId || event.trace?.bucketId) || "",
      eventState: normalizeString(event.eventState || event.trace?.eventState) || "",
      stateRank: toOptionalNumber(event.stateRank ?? event.trace?.stateRank),
      majorCardIndex: toOptionalNumber(event.majorCardIndex),
      graphLabel: normalizeString(event.graphLabel || event.markerLabel) || "",
      displayLabel: normalizeString(event.displayLabel || event.label) || "",
      cardTitle: normalizeString(event.cardTitle || event.title) || "",
      sourceCandidateType: normalizeString(config.sourceCandidateType) || "",
      sourceIndex,
      originalIndex: sourceIndex,
      trace: {
        source: SOURCE,
        originalSource: config.source,
        originalId: firstString([event.id, event.eventId, event.markerId, event.sourceEventId]) || null,
        originalType: firstString([event.type, event.kind, event.category, event.family]) || null,
        originalSeverity: firstString([event.severity, event.status, event.riskLevel]) || null,
        visibleEventKey: normalizeString(event.visibleEventKey || event.trace?.visibleEventKey) || null,
        cardConceptId: normalizeString(event.cardConceptId || event.trace?.cardConceptId) || null,
        conceptId: normalizeString(event.conceptId || event.trace?.conceptId || event.cardConceptId || event.trace?.cardConceptId) || null,
        storyStage: normalizeString(event.storyStage || event.trace?.storyStage) || null,
        bucketFamily: normalizeString(event.bucketFamily || event.trace?.bucketFamily || event.trace?.family) || null,
        bucketId: normalizeString(event.bucketId || event.trace?.bucketId) || null,
        eventState: normalizeString(event.eventState || event.trace?.eventState) || null,
        stateRank: toOptionalNumber(event.stateRank ?? event.trace?.stateRank),
        sourceCandidateType: normalizeString(config.sourceCandidateType) || null,
        sourceIndex,
        severityInferred: severityResult.inferred,
        warnings
      },
      _order: config.order
    };
    if (typeof visibleEventContract.normalizeIncomeImpactVisibleEvent !== "function") {
      return baseEvent;
    }
    const contracted = visibleEventContract.normalizeIncomeImpactVisibleEvent(baseEvent, {
      sourceEventId: id,
      relativeMonth: month,
      title
    });
    return Object.assign({}, baseEvent, {
      title: contracted.mappedCardTitle || contracted.title || baseEvent.title,
      visibleEventKey: contracted.visibleEventKey || baseEvent.visibleEventKey,
      cardConceptId: contracted.cardConceptId || baseEvent.cardConceptId,
      conceptId: contracted.conceptId || baseEvent.conceptId,
      storyStage: contracted.storyStage || baseEvent.storyStage,
      bucketFamily: contracted.bucketFamily || baseEvent.bucketFamily,
      bucketId: contracted.bucketId || baseEvent.bucketId,
      eventState: contracted.eventState || baseEvent.eventState,
      stateRank: contracted.stateRank ?? baseEvent.stateRank,
      visibilityRoute: contracted.visibilityRoute || "",
      supportingDotEligible: contracted.supportingDotEligible === true,
      supportingDotOnly: contracted.supportingOnly === true || baseEvent.supportingDotOnly === true,
      mainCardEligible: contracted.mainEligible === true && baseEvent.eligibleForMajorCard !== false,
      eligibleForGraphDot: contracted.graphDotEligible === true && baseEvent.eligibleForGraphDot !== false,
      eligibleForMajorCard: contracted.mainEligible === true && baseEvent.eligibleForMajorCard !== false,
      trace: Object.assign({}, baseEvent.trace, {
        visibleEventKey: contracted.visibleEventKey || null,
        cardConceptId: contracted.cardConceptId || null,
        conceptId: contracted.conceptId || null,
        storyStage: contracted.storyStage || null,
        bucketFamily: contracted.bucketFamily || null,
        bucketId: contracted.bucketId || null,
        eventState: contracted.eventState || null,
        stateRank: contracted.stateRank ?? null,
        visibilityRoute: contracted.visibilityRoute || null
      })
    });
  }

  function addNormalizedEvent(target, warnings, event, config) {
    if (!isPlainObject(event)) {
      warnings.push(makeWarning("invalid-event-skipped", "A timeline story event was skipped because it was not an object.", {
        source: config.source,
        index: config.index
      }));
      return;
    }

    const normalized = normalizeBaseEvent(event, config);
    normalized.trace.warnings.forEach(function (code) {
      warnings.push(makeWarning(code, "A normalized timeline story event needed fallback metadata.", {
        id: normalized.id,
        source: normalized.source
      }));
    });
    target.push(normalized);
  }

  function mergeMissingValue(current, next) {
    if (current == null || current === "") {
      return clonePlainValue(next);
    }
    return current;
  }

  function mergeSourceCandidateType(current, next) {
    const values = normalizeString(current).split("+").filter(Boolean);
    const nextValue = normalizeString(next);
    if (nextValue && !values.includes(nextValue)) {
      values.push(nextValue);
    }
    return values.join("+");
  }

  function mergeNormalizedEventMetadata(existing, incoming) {
    existing.family = mergeMissingValue(existing.family, incoming.family);
    existing.amount = mergeMissingValue(existing.amount, incoming.amount);
    existing.timing = mergeMissingValue(existing.timing, incoming.timing);
    existing.evidenceLevel = mergeMissingValue(existing.evidenceLevel, incoming.evidenceLevel);
    existing.dotTier = mergeMissingValue(existing.dotTier, incoming.dotTier);
    existing.connectedToMajorCard = mergeMissingValue(existing.connectedToMajorCard, incoming.connectedToMajorCard);
    existing.eligibleForConnector = mergeMissingValue(existing.eligibleForConnector, incoming.eligibleForConnector);
    existing.eligibleForGraphDot = mergeMissingValue(existing.eligibleForGraphDot, incoming.eligibleForGraphDot);
    existing.eligibleForMajorCard = mergeMissingValue(existing.eligibleForMajorCard, incoming.eligibleForMajorCard);
    existing.supportingDotEligible = mergeMissingValue(existing.supportingDotEligible, incoming.supportingDotEligible);
    existing.supportingDotOnly = mergeMissingValue(existing.supportingDotOnly, incoming.supportingDotOnly);
    existing.mainCardEligible = mergeMissingValue(existing.mainCardEligible, incoming.mainCardEligible);
    existing.visibleEventKey = mergeMissingValue(existing.visibleEventKey, incoming.visibleEventKey);
    existing.cardConceptId = mergeMissingValue(existing.cardConceptId, incoming.cardConceptId);
    existing.conceptId = mergeMissingValue(existing.conceptId, incoming.conceptId);
    existing.storyStage = mergeMissingValue(existing.storyStage, incoming.storyStage);
    existing.bucketFamily = mergeMissingValue(existing.bucketFamily, incoming.bucketFamily);
    existing.bucketId = mergeMissingValue(existing.bucketId, incoming.bucketId);
    existing.eventState = mergeMissingValue(existing.eventState, incoming.eventState);
    existing.stateRank = mergeMissingValue(existing.stateRank, incoming.stateRank);
    existing.majorCardIndex = mergeMissingValue(existing.majorCardIndex, incoming.majorCardIndex);
    existing.graphLabel = mergeMissingValue(existing.graphLabel, incoming.graphLabel);
    existing.displayLabel = mergeMissingValue(existing.displayLabel, incoming.displayLabel);
    existing.cardTitle = mergeMissingValue(existing.cardTitle, incoming.cardTitle);
    existing.sourceCandidateType = mergeSourceCandidateType(existing.sourceCandidateType, incoming.sourceCandidateType);
    existing.trace = Object.assign({}, existing.trace, {
      sourceCandidateType: existing.sourceCandidateType,
      mergedSourceCandidateTypes: existing.sourceCandidateType.split("+").filter(Boolean),
      warnings: Array.from(new Set([]
        .concat(Array.isArray(existing.trace?.warnings) ? existing.trace.warnings : [])
        .concat(Array.isArray(incoming.trace?.warnings) ? incoming.trace.warnings : [])))
    });
    return existing;
  }

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function addEvents(target, warnings, events, config) {
    getArray(events).forEach(function (event, index) {
      addNormalizedEvent(target, warnings, event, Object.assign({}, config, {
        index,
        order: target.length
      }));
    });
  }

  function addFinancialStorylineEvents(target, warnings, financialStoryline) {
    if (!isPlainObject(financialStoryline)) {
      return;
    }

    const byId = new Map();
    const selected = getArray(financialStoryline.majorStoryCandidates).map(function (candidate, index) {
      return { candidate, sourceCandidateType: "majorStoryCandidate", sourceIndex: index };
    }).concat(getArray(financialStoryline.graphDotCandidates).map(function (candidate, index) {
      return { candidate, sourceCandidateType: "graphDotCandidate", sourceIndex: index };
    }));

    selected.forEach(function (entry) {
      const candidate = entry.candidate;
      if (!isPlainObject(candidate)) {
        return;
      }
      const id = getEventId(candidate, "financial-storyline", selected.length);
      const beforeCount = target.length;
      addNormalizedEvent(target, warnings, candidate, {
        source: "financialStoryline",
        kind: "financialStoryline",
        surface: "financialStoryline",
        fallbackPrefix: "financial-storyline",
        fallbackSeverity: candidate.severity || candidate.status || "info",
        sourceCandidateType: entry.sourceCandidateType,
        sourceIndex: entry.sourceIndex,
        index: target.length,
        order: target.length
      });
      const incoming = target[target.length - 1];
      if (!incoming || target.length === beforeCount) {
        return;
      }
      if (byId.has(id)) {
        const existing = byId.get(id);
        mergeNormalizedEventMetadata(existing, incoming);
        target.pop();
        return;
      }
      byId.set(id, incoming);
    });
  }

  function addTransitionOutlookEvent(target, warnings, transitionOutlook) {
    if (!isPlainObject(transitionOutlook)) {
      return;
    }

    const status = firstString([transitionOutlook.status, transitionOutlook.label]);
    const severity = normalizeSeverity(status);
    const month = toOptionalNumber(transitionOutlook.windowMonths);
    const shortLabel = status ? "First 3 Months" : "Transition Outlook";
    const event = {
      id: "transition-outlook",
      status,
      month: month == null ? 3 : month,
      shortLabel,
      title: status ? "First 3 Months: " + status : "First 3 Months",
      detail: ""
    };

    if (severity.severity === "unknown") {
      warnings.push(makeWarning("transition-outlook-status-unknown", "Transition outlook status was not treated as stable.", {
        status: status || null
      }));
    }

    addNormalizedEvent(target, warnings, event, {
      source: "transitionOutlook",
      kind: "transitionOutlook",
      surface: "resourceOutlook",
      fallbackPrefix: "transition-outlook",
      fallbackSeverity: status || "unknown",
      index: target.length,
      order: target.length
    });
  }

  function addGraphModelEvents(target, warnings, graphModel) {
    if (!isPlainObject(graphModel)) {
      return;
    }

    addEvents(target, warnings, graphModel.markers, {
      source: "graphModel",
      kind: "graphMarker",
      surface: "graph",
      fallbackPrefix: "graph-marker",
      fallbackSeverity: "info"
    });
    addEvents(target, warnings, graphModel.comparisonMarkers, {
      source: "graphModel",
      kind: "comparisonMarker",
      surface: "graph",
      fallbackPrefix: "comparison-marker",
      fallbackSeverity: "info"
    });
  }

  function compareTimelineEvents(left, right) {
    const severityDelta = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const leftMonth = left.month == null ? Number.POSITIVE_INFINITY : left.month;
    const rightMonth = right.month == null ? Number.POSITIVE_INFINITY : right.month;
    if (leftMonth !== rightMonth) {
      return leftMonth - rightMonth;
    }

    const leftDate = getSortDateValue(left.date);
    const rightDate = getSortDateValue(right.date);
    const safeLeftDate = leftDate == null ? Number.POSITIVE_INFINITY : leftDate;
    const safeRightDate = rightDate == null ? Number.POSITIVE_INFINITY : rightDate;
    if (safeLeftDate !== safeRightDate) {
      return safeLeftDate - safeRightDate;
    }

    return left._order - right._order;
  }

  function stripInternalOrder(event) {
    const clean = Object.assign({}, event);
    delete clean._order;
    return clean;
  }

  function normalizeIncomeImpactTimelineStoryEvents(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const events = [];

    addEvents(events, warnings, safeInput.riskEvents, {
      source: "riskEvents",
      kind: "risk",
      surface: "keyRisks",
      fallbackPrefix: "risk-event",
      fallbackSeverity: "unknown"
    });
    addEvents(events, warnings, safeInput.stableEvents, {
      source: "stableEvents",
      kind: "stable",
      surface: "covered",
      fallbackPrefix: "stable-event",
      fallbackSeverity: "stable",
      forceStable: true
    });
    addFinancialStorylineEvents(events, warnings, safeInput.financialStoryline);
    addTransitionOutlookEvent(events, warnings, safeInput.transitionOutlook);
    addGraphModelEvents(events, warnings, safeInput.graphModel);

    return {
      version: VERSION,
      events: events.sort(compareTimelineEvents).map(stripInternalOrder),
      warnings,
      trace: {
        source: SOURCE,
        inputSources: {
          riskEvents: getArray(safeInput.riskEvents).length,
          stableEvents: getArray(safeInput.stableEvents).length,
          financialStorylineMajor: getArray(safeInput.financialStoryline?.majorStoryCandidates).length,
          financialStorylineGraphDots: getArray(safeInput.financialStoryline?.graphDotCandidates).length,
          graphMarkers: getArray(safeInput.graphModel?.markers).length,
          comparisonMarkers: getArray(safeInput.graphModel?.comparisonMarkers).length,
          transitionOutlook: isPlainObject(safeInput.transitionOutlook)
        },
        displayOnly: true,
        noGraphMutation: true,
        noUiMutation: true
      }
    };
  }

  const api = {
    normalizeIncomeImpactTimelineStoryEvents,
    INCOME_IMPACT_TIMELINE_STORY_EVENTS_VERSION: VERSION,
    INCOME_IMPACT_TIMELINE_STORY_EVENTS_SEVERITY_ORDER: SEVERITY_ORDER
  };

  Object.assign(lensAnalysis, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
