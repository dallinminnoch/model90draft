(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis Coverage Strategy chart models.
  // Purpose: prepare chart-ready dollar series from already-built Coverage
  // Strategy data lines without changing adapter/composer outputs.
  // Non-goals: no DOM, storage, SVG rendering, adapter math, gap/surplus math,
  // proposed coverage, recommendation scoring, AI, or sample data.
  const COVERAGE_STRATEGY_CHART_MODEL_VERSION = "coverage-strategy-chart-model-v1";
  const DEFAULT_Y_AXIS_MAX = 100000;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
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

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function getYearIndex(point, fallbackIndex) {
    const parsed = toOptionalNumber(point?.yearIndex);
    return parsed == null ? fallbackIndex : Math.max(0, Math.round(parsed));
  }

  function createPointMap(points) {
    const map = new Map();
    (Array.isArray(points) ? points : []).forEach(function (point, index) {
      if (!isPlainObject(point)) {
        return;
      }
      const yearIndex = getYearIndex(point, index);
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

  function getRemainingExposureAmount(point) {
    return toOptionalNumber(point?.remainingExposureAmount);
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function normalizeDollarAmount(value) {
    const parsed = toOptionalNumber(value);
    return parsed == null ? null : Math.max(0, parsed);
  }

  function createDollarChartPoint(needPoint, index, amount, sourceField) {
    const chartValue = normalizeDollarAmount(amount);
    return {
      yearIndex: getYearIndex(needPoint, index),
      date: needPoint?.date || null,
      calendarYear: needPoint?.calendarYear || null,
      age: needPoint?.age ?? null,
      chartValue: chartValue == null ? null : roundMoney(chartValue),
      sourceAmount: chartValue == null ? null : roundMoney(chartValue),
      sourceField
    };
  }

  function createSeries(key, label, points, displayBasis) {
    return {
      key,
      label,
      displayBasis,
      points: points.filter(function (point) {
        return point.chartValue != null && Number.isFinite(point.chartValue);
      })
    };
  }

  function chooseNiceStep(maxValue) {
    const safeMax = Math.max(0, Number(maxValue) || 0);
    if (!(safeMax > 0)) {
      return DEFAULT_Y_AXIS_MAX / 4;
    }
    const rawStep = safeMax / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    if (normalized <= 1) {
      return magnitude;
    }
    if (normalized <= 2) {
      return 2 * magnitude;
    }
    if (normalized <= 5) {
      return 5 * magnitude;
    }
    return 10 * magnitude;
  }

  function buildDollarAxisLabels(seriesPoints) {
    const points = Array.isArray(seriesPoints) ? seriesPoints : [];
    const maxValue = points.reduce(function (max, point) {
      const value = Number(point?.chartValue);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
    const step = chooseNiceStep(maxValue * 1.02);
    const yAxisMax = Math.max(DEFAULT_Y_AXIS_MAX, step * 4);
    return {
      yAxisMax,
      axisLabels: [yAxisMax, yAxisMax - step, yAxisMax - (step * 2), yAxisMax - (step * 3), 0]
    };
  }

  function buildCoverageStrategyTimelineChartModel(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const needPoints = Array.isArray(safeInput.needPoints) ? safeInput.needPoints : [];
    const resourceMap = createPointMap(safeInput.resourcePoints);
    const existingCoverageMap = createPointMap(safeInput.existingCoveragePoints);
    const gapSurplusMap = createPointMap(safeInput.gapSurplusPoints);
    const warnings = [];
    const dataGaps = [];
    const needSeriesPoints = [];
    const resourceSeriesPoints = [];
    const existingCoverageSeriesPoints = [];
    const remainingExposureSeriesPoints = [];

    if (!needPoints.length) {
      dataGaps.push(createIssue(
        "missing-need-points",
        "Need points are required to prepare the Coverage Strategy chart model.",
        {}
      ));
    }

    needPoints.forEach(function (needPoint, index) {
      const needAmount = getNeedAmount(needPoint);
      if (!(needAmount > 0)) {
        warnings.push(createIssue(
          "chart-need-point-missing",
          "A need point was missing a positive need amount and was omitted from dollar chart series.",
          { yearIndex: getYearIndex(needPoint, index) }
        ));
        return;
      }

      const yearIndex = getYearIndex(needPoint, index);
      const resourcePoint = resourceMap.get(yearIndex) || null;
      const existingCoveragePoint = existingCoverageMap.get(yearIndex) || null;
      const gapSurplusPoint = gapSurplusMap.get(yearIndex) || null;
      const resourceAmount = Math.max(0, getResourceAmount(resourcePoint) || 0);
      const existingCoverageAmount = Math.max(0, getExistingCoverageAmount(existingCoveragePoint) || 0);
      const remainingExposureAmount = Math.max(0, getRemainingExposureAmount(gapSurplusPoint) || 0);

      needSeriesPoints.push(createDollarChartPoint(needPoint, index, needAmount, "needAmount"));
      resourceSeriesPoints.push(createDollarChartPoint(needPoint, index, resourceAmount, "resourceAmount"));
      existingCoverageSeriesPoints.push(createDollarChartPoint(needPoint, index, existingCoverageAmount, "existingCoverageAmount"));
      remainingExposureSeriesPoints.push(createDollarChartPoint(needPoint, index, remainingExposureAmount, "remainingExposureAmount"));
    });

    const axis = buildDollarAxisLabels([
      ...needSeriesPoints,
      ...resourceSeriesPoints,
      ...existingCoverageSeriesPoints,
      ...remainingExposureSeriesPoints
    ]);

    return {
      chartModelVersion: COVERAGE_STRATEGY_CHART_MODEL_VERSION,
      chartMode: "dollar",
      yAxisMax: axis.yAxisMax,
      axisLabels: axis.axisLabels,
      series: [
        createSeries("need", "Projected need", needSeriesPoints, "dollars"),
        createSeries("resources", "Projected eligible resources", resourceSeriesPoints, "dollars"),
        createSeries("existingCoverage", "Existing coverage", existingCoverageSeriesPoints, "dollars"),
        createSeries("remainingExposure", "Remaining exposure", remainingExposureSeriesPoints, "dollars")
      ],
      warnings,
      dataGaps,
      trace: {
        rawDollarDataChanged: false,
        sampleDataUsed: false,
        displayTransform: "dollar-axis",
        defaultYAxisUnit: "dollars",
        noHardThreeHundredPercentCap: true,
        yAxisMax: axis.yAxisMax
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_CHART_MODEL_VERSION = COVERAGE_STRATEGY_CHART_MODEL_VERSION;
  lensAnalysis.buildCoverageStrategyTimelineChartModel = buildCoverageStrategyTimelineChartModel;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_CHART_MODEL_VERSION,
      buildCoverageStrategyTimelineChartModel
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
