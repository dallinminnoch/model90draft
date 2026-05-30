(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Coverage Strategy transition needs lifetime projection.
  // Purpose: project death-triggered transition needs across future Coverage
  // Strategy points. Non-goals: no UI, persistence, inflation,
  // resource offsets, support math, education, debt, mortgage, or chart logic.
  const COVERAGE_STRATEGY_TRANSITION_NEEDS_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-transition-needs-lifetime-projection-v1";
  const DEFAULT_VALUATION_DATE = "2026-01-01";

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
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
    const normalized = String(value).replace(/[$,%\s,]/g, "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Math.max(0, Number(value.toFixed(2))) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function addIssue(target, code, message, details) {
    if (!Array.isArray(target)) {
      return null;
    }
    const existing = target.find(function (issue) {
      return issue && issue.code === code;
    });
    if (existing) {
      return existing;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      Number.isNaN(date.getTime())
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }
    return {
      date,
      normalizedDate: raw,
      calendarYear: year
    };
  }

  function formatDateOnly(date) {
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function addYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const target = new Date(dateResult.date.getTime());
    target.setUTCFullYear(target.getUTCFullYear() + years);
    return formatDateOnly(target);
  }

  function monthsBetween(startDate, endDate) {
    const wholeMonths = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
      + (endDate.getUTCMonth() - startDate.getUTCMonth());
    return endDate.getUTCDate() < startDate.getUTCDate() ? wholeMonths - 1 : wholeMonths;
  }

  function normalizeProjectionMode(value) {
    const raw = normalizeString(value);
    const key = raw.toLowerCase().replace(/[\s_-]/g, "");
    if (!key) {
      return "";
    }
    if (
      key === "deathyearonly"
      || key === "deathyear"
      || key === "deathyearobligation"
      || key === "onetime"
      || key === "onetimeimmediate"
      || key === "immediate"
    ) {
      return "legacyDeathYearOnly";
    }
    if (
      key === "durationbridge"
      || key === "bridge"
      || key === "temporarysupport"
      || key === "transitionbridge"
      || key === "durationbasedtemporarysupport"
    ) {
      return "legacyDurationBridge";
    }
    if (
      key === "flatfallback"
      || key === "flat"
      || key === "unknown"
      || key === "unmodeled"
    ) {
      return "deathTriggeredAtEachProjectionPoint";
    }
    if (key === "unavailable") {
      return "unavailable";
    }
    return "";
  }

  function buildPointSpine(input, valuationDateResult) {
    const explicitPoints = Array.isArray(input?.annualNeedPoints)
      ? input.annualNeedPoints
      : (Array.isArray(input?.needPoints) ? input.needPoints : []);
    if (explicitPoints.length) {
      return explicitPoints.map(function (point, index) {
        const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex ?? index) || 0));
        const fallbackDate = addYears(valuationDateResult, yearIndex);
        const parsedDate = normalizeDateOnly(point?.date) || normalizeDateOnly(fallbackDate);
        return {
          yearIndex,
          date: parsedDate?.normalizedDate || point?.date || fallbackDate || null,
          calendarYear: point?.calendarYear ?? parsedDate?.calendarYear ?? null,
          age: toOptionalNumber(point?.age)
        };
      });
    }

    const horizonYears = Math.max(0, Math.round(toOptionalNumber(input?.projectionYears ?? input?.horizonYears) || 0));
    return Array.from({ length: horizonYears + 1 }, function (_unused, yearIndex) {
      const date = addYears(valuationDateResult, yearIndex);
      const parsedDate = normalizeDateOnly(date);
      return {
        yearIndex,
        date,
        calendarYear: parsedDate?.calendarYear ?? null,
        age: null
      };
    });
  }

  function resolveTransitionNeedAmount(input, dataGaps) {
    const amount = toOptionalNumber(
      input?.transitionNeedAmount
      ?? input?.transitionNeedsAmount
      ?? input?.amount
      ?? input?.currentTransitionNeedAmount
    );
    if (amount == null || amount <= 0) {
      addIssue(
        dataGaps,
        "transition-needs-amount-unavailable",
        "Coverage Strategy transition needs projection could not find a reliable transition need amount.",
        {
          transitionNeedSource: input?.transitionNeedSource || null,
          sourcePath: input?.sourcePath || null
        }
      );
      return null;
    }
    return roundMoney(amount);
  }

  function resolveDurationMonths(input) {
    const explicitMonths = toOptionalNumber(
      input?.transitionDurationMonths
      ?? input?.durationMonths
      ?? input?.bridgeDurationMonths
      ?? input?.transitionPeriodMonths
    );
    if (explicitMonths != null && explicitMonths > 0) {
      return {
        durationMonths: Math.max(1, Math.round(explicitMonths)),
        durationBasis: "transition-duration-months"
      };
    }

    const explicitYears = toOptionalNumber(
      input?.transitionDurationYears
      ?? input?.durationYears
      ?? input?.bridgeDurationYears
      ?? input?.transitionPeriodYears
    );
    if (explicitYears != null && explicitYears > 0) {
      return {
        durationMonths: Math.max(1, Math.round(explicitYears * 12)),
        durationBasis: "transition-duration-years"
      };
    }

    return {
      durationMonths: null,
      durationBasis: null
    };
  }

  function resolveProjectionMode(input, durationResult, warnings) {
    const rawMode = normalizeString(
      input?.transitionMode
      || input?.transitionNeedsMode
      || input?.projectionMode
      || input?.mode
    );
    const normalizedMode = normalizeProjectionMode(rawMode);

    if (normalizedMode === "legacyDeathYearOnly" || normalizedMode === "legacyDurationBridge") {
      addIssue(
        warnings,
        "transition-needs-legacy-burn-down-mode-quarantined",
        "Transition needs burn-down modes are not active in Coverage Strategy because each point evaluates a new death-triggered need.",
        {
          transitionMode: rawMode || null,
          normalizedLegacyMode: normalizedMode,
          effectiveTransitionMode: "deathTriggeredAtEachProjectionPoint",
          durationMonths: durationResult.durationMonths
        }
      );
      return {
        projectionMode: "deathTriggeredAtEachProjectionPoint",
        rawMode,
        modeSource: "legacy-burn-down-mode-quarantined",
        currentBehaviorPreservedByFallback: true,
        legacyModeQuarantined: true,
        unsupportedLegacyMode: normalizedMode
      };
    }

    if (normalizedMode === "unavailable") {
      return {
        projectionMode: "unavailable",
        rawMode,
        modeSource: "explicit-transition-mode",
        currentBehaviorPreservedByFallback: false
      };
    }

    return {
      projectionMode: "deathTriggeredAtEachProjectionPoint",
      rawMode,
      modeSource: rawMode ? "unsupported-transition-mode-normalized" : "coverage-strategy-default",
      currentBehaviorPreservedByFallback: true,
      legacyModeQuarantined: false,
      unsupportedLegacyMode: null
    };
  }

  function projectTransitionPoint(point, valuationDateResult, sourceAmount, modeResult, durationResult) {
    const pointDate = normalizeDateOnly(point.date) || normalizeDateOnly(addYears(valuationDateResult, point.yearIndex));
    const elapsedMonths = pointDate && valuationDateResult
      ? Math.max(0, monthsBetween(valuationDateResult.date, pointDate.date))
      : Math.max(0, point.yearIndex * 12);
    const transitionNeedAmount = modeResult.projectionMode === "unavailable" ? 0 : sourceAmount;
    const remainingDurationMonths = null;

    return {
      yearIndex: point.yearIndex,
      date: point.date || pointDate?.normalizedDate || null,
      calendarYear: point.calendarYear ?? pointDate?.calendarYear ?? null,
      age: point.age ?? null,
      transitionNeedAmount: roundMoney(transitionNeedAmount),
      sourceTransitionNeedAmount: sourceAmount,
      projectionMode: modeResult.projectionMode,
      elapsedMonths,
      remainingDurationMonths,
      durationMonths: durationResult.durationMonths,
      warnings: [],
      dataGaps: [],
      trace: {
        source: "coverage-strategy-transition-needs-lifetime-projection",
        projectionMode: modeResult.projectionMode,
        modeSource: modeResult.modeSource,
        transitionNeedSemantics:
          modeResult.projectionMode === "deathTriggeredAtEachProjectionPoint"
            ? "death-triggered-at-each-projection-point"
            : "transition-need-unavailable",
        transitionNeedDeclineReason:
          modeResult.projectionMode === "deathTriggeredAtEachProjectionPoint"
            ? "no-decline-each-point-evaluates-new-death-triggered-need"
            : "transition-need-unavailable",
        currentBehaviorPreservedByFallback: modeResult.currentBehaviorPreservedByFallback === true,
        durationBasis: durationResult.durationBasis,
        sourceTransitionNeedAmount: sourceAmount,
        inflationApplied: false,
        inflationDeferredToGlobalInflationPass: true,
        legacyModeQuarantined: modeResult.legacyModeQuarantined === true,
        unsupportedLegacyMode: modeResult.unsupportedLegacyMode || null
      }
    };
  }

  function calculateCoverageStrategyTransitionNeedsLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate) || normalizeDateOnly(DEFAULT_VALUATION_DATE);
    const pointSpine = buildPointSpine(safeInput, valuationDateResult);
    const sourceAmount = resolveTransitionNeedAmount(safeInput, dataGaps);
    const durationResult = resolveDurationMonths(safeInput);

    if (sourceAmount == null) {
      const transitionNeedPoints = pointSpine.map(function (point) {
        return projectTransitionPoint(point, valuationDateResult, 0, {
          projectionMode: "unavailable",
          rawMode: normalizeString(safeInput.transitionMode || safeInput.projectionMode),
          modeSource: "missing-transition-need-amount",
          currentBehaviorPreservedByFallback: false
        }, durationResult);
      });
      return {
        projectionVersion: COVERAGE_STRATEGY_TRANSITION_NEEDS_LIFETIME_PROJECTION_VERSION,
        status: "unavailable",
        projectionMode: "unavailable",
        transitionNeedPoints,
        assumptionsUsed: {
          valuationDate: valuationDateResult?.normalizedDate || null,
          transitionNeedAmount: null,
          transitionNeedSource: safeInput.transitionNeedSource || null,
          transitionMode: normalizeString(safeInput.transitionMode || safeInput.projectionMode) || null,
          effectiveTransitionMode: "unavailable",
          durationMonths: durationResult.durationMonths,
          durationBasis: durationResult.durationBasis,
          currentBehaviorPreservedByFallback: false,
          inflationApplied: false,
          inflationDeferredToGlobalInflationPass: true,
          sourcePath: safeInput.sourcePath || null,
          sourcePaths: Array.isArray(safeInput.sourcePaths) ? clonePlainValue(safeInput.sourcePaths) : []
        },
        warnings,
        dataGaps,
        trace: {
          source: "coverage-strategy-transition-needs-lifetime-projection",
          pointCount: transitionNeedPoints.length,
          transitionNeedSemantics: "unavailable",
          inflationApplied: false,
          inflationDeferredToGlobalInflationPass: true,
          displayHtmlUsed: false,
          storageUsed: false,
          inputMutated: false
        }
      };
    }

    const modeResult = resolveProjectionMode(safeInput, durationResult, warnings);
    const transitionNeedPoints = pointSpine.map(function (point) {
      return projectTransitionPoint(point, valuationDateResult, sourceAmount, modeResult, durationResult);
    });

    return {
      projectionVersion: COVERAGE_STRATEGY_TRANSITION_NEEDS_LIFETIME_PROJECTION_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      projectionMode: modeResult.projectionMode,
      transitionNeedPoints,
      assumptionsUsed: {
        valuationDate: valuationDateResult?.normalizedDate || null,
        transitionNeedAmount: sourceAmount,
        transitionNeedSource: safeInput.transitionNeedSource || null,
        transitionMode: modeResult.rawMode || null,
        effectiveTransitionMode: modeResult.projectionMode,
        transitionModeSource: modeResult.modeSource,
        durationMonths: durationResult.durationMonths,
        durationYears: durationResult.durationMonths == null ? null : Number((durationResult.durationMonths / 12).toFixed(4)),
        durationBasis: durationResult.durationBasis,
        currentBehaviorPreservedByFallback: modeResult.currentBehaviorPreservedByFallback === true,
        legacyModeQuarantined: modeResult.legacyModeQuarantined === true,
        unsupportedLegacyMode: modeResult.unsupportedLegacyMode || null,
        transitionNeedSemantics: "death-triggered-at-each-projection-point",
        inflationApplied: false,
        inflationDeferredToGlobalInflationPass: true,
        sourcePath: safeInput.sourcePath || null,
        sourcePaths: Array.isArray(safeInput.sourcePaths) ? clonePlainValue(safeInput.sourcePaths) : []
      },
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-transition-needs-lifetime-projection",
        pointCount: transitionNeedPoints.length,
        transitionNeedDeclineMode: "none",
        transitionNeedSemantics: "death-triggered-at-each-projection-point",
        currentBehaviorPreservedByFallback: modeResult.currentBehaviorPreservedByFallback === true,
        legacyModeQuarantined: modeResult.legacyModeQuarantined === true,
        unsupportedLegacyMode: modeResult.unsupportedLegacyMode || null,
        inflationApplied: false,
        inflationDeferredToGlobalInflationPass: true,
        displayHtmlUsed: false,
        storageUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_TRANSITION_NEEDS_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_TRANSITION_NEEDS_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.calculateCoverageStrategyTransitionNeedsLifetimeProjection =
    calculateCoverageStrategyTransitionNeedsLifetimeProjection;
  lensAnalysis.buildCoverageStrategyTransitionNeedsLifetimeProjection =
    calculateCoverageStrategyTransitionNeedsLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_TRANSITION_NEEDS_LIFETIME_PROJECTION_VERSION,
      calculateCoverageStrategyTransitionNeedsLifetimeProjection,
      buildCoverageStrategyTransitionNeedsLifetimeProjection:
        calculateCoverageStrategyTransitionNeedsLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
