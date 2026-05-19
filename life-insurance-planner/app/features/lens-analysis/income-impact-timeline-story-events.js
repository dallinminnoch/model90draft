(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-timeline-story-events-v1";
  const SOURCE = "income-impact-timeline-story-events";
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
    const monthIndex = toOptionalNumber(event.monthIndex);
    if (monthIndex != null) {
      return monthIndex;
    }
    return fallbackMonth == null ? null : fallbackMonth;
  }

  function getEventDate(event) {
    return firstString([
      event.date,
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

    if (month == null && !date) {
      warnings.push("missing-timeline-position");
    }
    if (!rawShortLabel) {
      warnings.push("missing-label");
    }
    if (severityResult.inferred) {
      warnings.push("severity-inferred");
    }

    return {
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
      trace: {
        source: SOURCE,
        originalSource: config.source,
        originalId: firstString([event.id, event.eventId, event.markerId, event.sourceEventId]) || null,
        originalType: firstString([event.type, event.kind, event.category, event.family]) || null,
        severityInferred: severityResult.inferred,
        warnings
      },
      _order: config.order
    };
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

    const seen = new Set();
    const selected = []
      .concat(getArray(financialStoryline.majorStoryCandidates))
      .concat(getArray(financialStoryline.graphDotCandidates));

    selected.forEach(function (candidate) {
      if (!isPlainObject(candidate)) {
        return;
      }
      const id = getEventId(candidate, "financial-storyline", selected.length);
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      addNormalizedEvent(target, warnings, candidate, {
        source: "financialStoryline",
        kind: "financialStoryline",
        surface: "financialStoryline",
        fallbackPrefix: "financial-storyline",
        fallbackSeverity: candidate.severity || candidate.status || "info",
        index: target.length,
        order: target.length
      });
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
