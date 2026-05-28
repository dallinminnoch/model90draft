(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis Coverage Strategy composers.
  // Purpose: compose already-built need, resource, and existing coverage lines
  // into remaining exposure and surplus points for the Coverage Strategy board.
  // Non-goals: no DOM, storage, graph rendering, adapter math, policy strategy,
  // proposed coverage, recommendations, AI, or Income Impact runway logic.
  const COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION = "coverage-strategy-gap-surplus-composer-v1";

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
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRatio(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
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
      return issue?.code === code;
    });
    if (existing) {
      return existing;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function getPointYearIndex(point, fallbackIndex, sourceName, warnings) {
    const parsed = toOptionalNumber(point?.yearIndex);
    if (parsed != null) {
      return Math.max(0, Math.round(parsed));
    }
    addIssue(
      warnings,
      `${sourceName}-year-index-missing-index-alignment`,
      "A Coverage Strategy point was missing yearIndex; array index was used only as an alignment fallback.",
      { sourceName, fallbackIndex }
    );
    return fallbackIndex;
  }

  function createPointMap(points, sourceName, warnings) {
    const map = new Map();
    (Array.isArray(points) ? points : []).forEach(function (point, index) {
      if (!isPlainObject(point)) {
        addIssue(
          warnings,
          `${sourceName}-point-invalid`,
          "A Coverage Strategy line point was not an object and was ignored.",
          { sourceName, index }
        );
        return;
      }
      const yearIndex = getPointYearIndex(point, index, sourceName, warnings);
      if (!map.has(yearIndex)) {
        map.set(yearIndex, point);
      }
    });
    return map;
  }

  function getNeedAmount(point) {
    return toOptionalNumber(point?.needAmount ?? point?.grossNeedAmount);
  }

  function getResourceAmount(point) {
    return toOptionalNumber(point?.resourceAmount ?? point?.eligibleResourceAmount);
  }

  function getExistingCoverageAmount(point) {
    return toOptionalNumber(point?.existingCoverageAmount ?? point?.coverageAmount);
  }

  function getLayerScheduleAmount(layer, yearIndex) {
    const schedulePoints = Array.isArray(layer?.benefitSchedule)
      ? layer.benefitSchedule
      : (Array.isArray(layer?.benefitSchedule?.points) ? layer.benefitSchedule.points : []);
    const exact = schedulePoints.find(function (point) {
      return Number(point?.yearIndex) === yearIndex;
    });
    return Math.max(0, toOptionalNumber(exact?.amount ?? exact?.deathBenefit ?? exact?.coverageAmount ?? exact?.benefitAmount) || 0);
  }

  function getLayerCoverageAmount(layer, yearIndex) {
    if (!isPlainObject(layer) || layer.included === false || layer.source !== "existing") {
      return 0;
    }
    const startYearIndex = toOptionalNumber(layer.startYearIndex ?? 0);
    if (startYearIndex != null && yearIndex < startYearIndex) {
      return 0;
    }
    if (layer.policyType === "custom") {
      return getLayerScheduleAmount(layer, yearIndex);
    }
    const endYearIndex = toOptionalNumber(layer.endYearIndex);
    if (endYearIndex != null && yearIndex > endYearIndex) {
      return 0;
    }
    return Math.max(0, toOptionalNumber(layer.deathBenefit) || 0);
  }

  function buildExistingCoveragePointsFromLayers(needPoints, existingCoverageLayers, warnings) {
    const layers = Array.isArray(existingCoverageLayers) ? existingCoverageLayers : [];
    if (!layers.length) {
      return [];
    }
    addIssue(
      warnings,
      "existing-coverage-points-derived-from-layers",
      "Existing coverage points were derived from supplied existing coverage layers because existingCoveragePoints were unavailable.",
      { layerCount: layers.length }
    );
    return (Array.isArray(needPoints) ? needPoints : []).map(function (needPoint, index) {
      const yearIndex = getPointYearIndex(needPoint, index, "need", warnings);
      const existingCoverageAmount = roundMoney(layers.reduce(function (sum, layer) {
        return sum + getLayerCoverageAmount(layer, yearIndex);
      }, 0));
      return {
        yearIndex,
        date: needPoint?.date || null,
        calendarYear: needPoint?.calendarYear || null,
        age: needPoint?.age ?? null,
        existingCoverageAmount,
        trace: {
          source: "existingCoverageLayers"
        }
      };
    });
  }

  function classifyPointStatus(hasRequiredData, remainingExposureAmount, surplusAmount) {
    if (!hasRequiredData) {
      return "unknown";
    }
    if (surplusAmount > 0) {
      return "surplus";
    }
    if (remainingExposureAmount > 0) {
      return "gap";
    }
    return "covered";
  }

  function createEmptySummary() {
    return {
      currentRemainingExposure: 0,
      finalRemainingExposure: 0,
      maxRemainingExposure: 0,
      firstSurplusYear: null,
      firstFullyCoveredYear: null,
      yearsWithGap: 0,
      yearsWithSurplus: 0
    };
  }

  function summarizeGapSurplusPoints(points) {
    const safePoints = Array.isArray(points) ? points : [];
    if (!safePoints.length) {
      return createEmptySummary();
    }
    const gapPoints = safePoints.filter(function (point) {
      return point.remainingExposureAmount > 0;
    });
    const surplusPoints = safePoints.filter(function (point) {
      return point.surplusAmount > 0;
    });
    const firstFullyCovered = safePoints.find(function (point) {
      return point.status === "covered" || point.status === "surplus";
    }) || null;

    return {
      currentRemainingExposure: safePoints[0].remainingExposureAmount,
      finalRemainingExposure: safePoints[safePoints.length - 1].remainingExposureAmount,
      maxRemainingExposure: roundMoney(Math.max(...safePoints.map(function (point) {
        return point.remainingExposureAmount;
      }))),
      firstSurplusYear: surplusPoints[0]?.calendarYear ?? surplusPoints[0]?.yearIndex ?? null,
      firstFullyCoveredYear: firstFullyCovered?.calendarYear ?? firstFullyCovered?.yearIndex ?? null,
      yearsWithGap: gapPoints.length,
      yearsWithSurplus: surplusPoints.length
    };
  }

  function buildCoverageStrategyGapSurplus(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const needPoints = Array.isArray(safeInput.needPoints) ? safeInput.needPoints : [];
    const resourcePoints = Array.isArray(safeInput.resourcePoints) ? safeInput.resourcePoints : [];
    const explicitExistingCoveragePoints = Array.isArray(safeInput.existingCoveragePoints)
      ? safeInput.existingCoveragePoints
      : null;
    const existingCoveragePoints = explicitExistingCoveragePoints
      || buildExistingCoveragePointsFromLayers(needPoints, safeInput.existingCoverageLayers, warnings);

    if (!needPoints.length) {
      addIssue(
        dataGaps,
        "missing-need-points",
        "Need points are required to compose Coverage Strategy remaining exposure and surplus.",
        {}
      );
    }
    if (!resourcePoints.length) {
      addIssue(
        dataGaps,
        "missing-resource-points",
        "Resource points were missing; resources were treated as 0 for gap/surplus composition.",
        {}
      );
    }

    const resourceMap = createPointMap(resourcePoints, "resource", warnings);
    const existingCoverageMap = createPointMap(existingCoveragePoints, "existing-coverage", warnings);

    const gapSurplusPoints = needPoints.map(function (needPoint, index) {
      const pointWarnings = [];
      const pointDataGaps = [];
      const yearIndex = getPointYearIndex(needPoint, index, "need", warnings);
      const needAmountValue = getNeedAmount(needPoint);
      const resourcePoint = resourceMap.get(yearIndex) || null;
      const existingCoveragePoint = existingCoverageMap.get(yearIndex) || null;
      const resourceAmountValue = resourcePoint ? getResourceAmount(resourcePoint) : null;
      const existingCoverageAmountValue = existingCoveragePoint ? getExistingCoverageAmount(existingCoveragePoint) : 0;

      if (needAmountValue == null || needAmountValue < 0) {
        pointDataGaps.push(createIssue(
          "missing-need-amount",
          "Need amount was missing or invalid; this point was marked unknown instead of calculating a fake ratio.",
          { yearIndex }
        ));
      }
      if (!resourcePoint || resourceAmountValue == null || resourceAmountValue < 0) {
        pointWarnings.push(createIssue(
          "missing-resource-amount",
          "Resource amount was missing for this year and was treated as 0.",
          { yearIndex }
        ));
      }

      const needAmount = needAmountValue != null && needAmountValue >= 0 ? roundMoney(needAmountValue) : 0;
      const resourceAmount = resourceAmountValue != null && resourceAmountValue >= 0 ? roundMoney(resourceAmountValue) : 0;
      const existingCoverageAmount = existingCoverageAmountValue != null && existingCoverageAmountValue >= 0
        ? roundMoney(existingCoverageAmountValue)
        : 0;
      const totalAvailableAmount = roundMoney(resourceAmount + existingCoverageAmount);
      const hasRequiredData = pointDataGaps.length === 0;
      const remainingExposureAmount = hasRequiredData ? roundMoney(Math.max(needAmount - totalAvailableAmount, 0)) : 0;
      const surplusAmount = hasRequiredData ? roundMoney(Math.max(totalAvailableAmount - needAmount, 0)) : 0;
      const coverageRatio = hasRequiredData && needAmount > 0 ? roundRatio(totalAvailableAmount / needAmount) : null;
      const resourceRatio = hasRequiredData && needAmount > 0 ? roundRatio(resourceAmount / needAmount) : null;
      const existingCoverageRatio = hasRequiredData && needAmount > 0 ? roundRatio(existingCoverageAmount / needAmount) : null;

      return {
        yearIndex,
        date: needPoint?.date || resourcePoint?.date || existingCoveragePoint?.date || null,
        calendarYear: needPoint?.calendarYear || resourcePoint?.calendarYear || existingCoveragePoint?.calendarYear || null,
        age: needPoint?.age ?? resourcePoint?.age ?? existingCoveragePoint?.age ?? null,
        needAmount,
        resourceAmount,
        existingCoverageAmount,
        totalAvailableAmount,
        remainingExposureAmount,
        surplusAmount,
        coverageRatio,
        resourceRatio,
        existingCoverageRatio,
        status: classifyPointStatus(hasRequiredData, remainingExposureAmount, surplusAmount),
        warnings: pointWarnings,
        dataGaps: pointDataGaps,
        trace: {
          composerVersion: COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION,
          alignedBy: "yearIndex",
          needSource: "needPoints",
          resourceSource: resourcePoint ? "resourcePoints" : "missing-treated-as-zero",
          existingCoverageSource: existingCoveragePoint ? "existingCoveragePoints" : "missing-or-no-coverage-treated-as-zero",
          proposedCoverageIncluded: false,
          recommendationScoringIncluded: false,
          incomeImpactRunwayUsed: false,
          rawAggregateWealthUsed: false
        }
      };
    });

    const pointWarnings = gapSurplusPoints.flatMap(function (point) {
      return point.warnings;
    });
    const pointDataGaps = gapSurplusPoints.flatMap(function (point) {
      return point.dataGaps;
    });
    const allWarnings = [
      ...warnings,
      ...pointWarnings
    ];
    const allDataGaps = [
      ...dataGaps,
      ...pointDataGaps
    ];

    return {
      composerVersion: COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION,
      status: allDataGaps.length ? "partial" : "complete",
      cadence: "annual",
      valuationDate: normalizeString(safeInput.valuationDate) || null,
      gapSurplusPoints,
      summary: summarizeGapSurplusPoints(gapSurplusPoints),
      assumptionsUsed: {
        needSource: "Coverage Strategy Need Line",
        resourceSource: "Coverage Strategy Resource Line",
        existingCoverageSource: explicitExistingCoveragePoints ? "existingCoveragePoints" : "existingCoverageLayers-or-zero",
        formula: "max(need - eligible resources - existing coverage, 0)",
        existingCoverageIsSeparateInput: true,
        resourcesAreSeparateInput: true,
        proposedCoverageIncluded: false,
        recommendationScoringIncluded: false
      },
      warnings: allWarnings,
      dataGaps: allDataGaps,
      trace: {
        composerVersion: COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION,
        pointCount: gapSurplusPoints.length,
        alignmentPrimaryKey: "yearIndex",
        displayHtmlUsed: false,
        pageControllerDependency: false,
        coverageTimelineEngineReplaced: false,
        coverageTimelineEngineRelationship: "separate; engine remains coverage-layer math owner while this composer includes resources",
        rawAggregateWealthUsed: false,
        incomeImpactRunwayUsed: false,
        proposedCoverageIncluded: false,
        recommendationScoringIncluded: false,
        warningCount: allWarnings.length,
        dataGapCount: allDataGaps.length
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION = COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION;
  lensAnalysis.buildCoverageStrategyGapSurplus = buildCoverageStrategyGapSurplus;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_GAP_SURPLUS_COMPOSER_VERSION,
      buildCoverageStrategyGapSurplus
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
