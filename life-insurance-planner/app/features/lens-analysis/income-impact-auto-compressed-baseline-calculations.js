(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const VERSION = "income-impact-auto-compressed-baseline-v1";
  const CALCULATION_SOURCE = "income-impact-auto-compressed-baseline-calculations";
  const FORMULA = "ease-in-monthly-slider-ramp";
  const START_SLIDER_VALUE = 0;
  const CONSERVATIVE_SLIDER_VALUE = -100;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

    const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
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

  function makeIssue(code, message, sourcePaths, details) {
    const issue = { code, message };
    const paths = (Array.isArray(sourcePaths) ? sourcePaths : [])
      .map(normalizeString)
      .filter(Boolean);
    if (paths.length) {
      issue.sourcePaths = Array.from(new Set(paths));
    }
    if (isPlainObject(details)) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function getEaseInCompressionProgress(monthIndex, horizonMonths) {
    const rawProgress = horizonMonths > 0 ? clamp(monthIndex / horizonMonths, 0, 1) : 1;
    return clamp(rawProgress * rawProgress, 0, 1);
  }

  function getPostDeathSeries(input) {
    if (isPlainObject(input?.postDeathSeries)) {
      return input.postDeathSeries;
    }
    if (isPlainObject(input?.rawBaselineScenario?.postDeathSeries)) {
      return input.rawBaselineScenario.postDeathSeries;
    }
    return null;
  }

  function getPointMonthIndex(point, fallbackIndex) {
    const monthIndex = toOptionalNumber(
      point?.monthIndex
      ?? point?.periodMonthIndex
      ?? point?.monthNumber
      ?? point?.elapsedMonths
      ?? point?.projectionMonth
    );
    if (monthIndex == null) {
      return fallbackIndex + 1;
    }
    return Math.max(0, Math.floor(monthIndex));
  }

  function getLastPointMonth(points) {
    return (Array.isArray(points) ? points : []).reduce(function (maxMonth, point, index) {
      return Math.max(maxMonth, getPointMonthIndex(point, index));
    }, 0);
  }

  function resolveProjectionHorizonMonths(input, postDeathSeries, points) {
    return toOptionalNumber(input?.options?.projectionHorizonMonths)
      ?? toOptionalNumber(input?.rawBaselineScenario?.scenario?.projectionHorizonMonths)
      ?? toOptionalNumber(input?.rawBaselineScenario?.projectionHorizonMonths)
      ?? toOptionalNumber(postDeathSeries?.depletion?.monthsCovered)
      ?? getLastPointMonth(points);
  }

  function resolveCompressionHorizon(input, postDeathSeries, points) {
    const depletion = isPlainObject(postDeathSeries?.depletion) ? postDeathSeries.depletion : {};
    const depletionMonth = toOptionalNumber(depletion.depletionMonthIndex ?? depletion.monthsCovered);
    if (depletion.depleted === true && depletionMonth != null) {
      if (depletionMonth <= 0) {
        return {
          source: "immediateDepletion",
          months: 0
        };
      }
      return {
        source: "rawBaselineDepletionMonth",
        months: Math.floor(depletionMonth)
      };
    }

    const projectionHorizonMonths = resolveProjectionHorizonMonths(input, postDeathSeries, points);
    if (projectionHorizonMonths != null && projectionHorizonMonths > 0) {
      return {
        source: "projectionHorizon",
        months: Math.floor(projectionHorizonMonths)
      };
    }

    return {
      source: "unavailable",
      months: null
    };
  }

  function resolveCompressionPolicy(input) {
    const policy = isPlainObject(input?.compressionPolicy) ? input.compressionPolicy : {};
    const currentSliderValue = clamp(toOptionalNumber(policy.currentSliderValue) ?? START_SLIDER_VALUE, CONSERVATIVE_SLIDER_VALUE, START_SLIDER_VALUE);
    const conservativeSliderValue = clamp(toOptionalNumber(policy.conservativeSliderValue) ?? CONSERVATIVE_SLIDER_VALUE, CONSERVATIVE_SLIDER_VALUE, currentSliderValue);
    const monthlyDeltaAtConservative = toOptionalNumber(
      policy.monthlyDeltaAtConservative
      ?? policy.conservativeMonthlyDelta
      ?? policy.targetMonthlyDelta
    );
    const currentMonthlySurvivorNeed = toOptionalNumber(
      policy.currentMonthlySurvivorNeed
      ?? policy.currentMonthlyNeed
      ?? policy.currentMonthlyLifestyleSpend
    );
    const conservativeMonthlySurvivorNeed = toOptionalNumber(
      policy.conservativeMonthlySurvivorNeed
      ?? policy.conservativeMonthlyNeed
      ?? policy.conservativeMonthlyLifestyleSpend
    );
    const resolvedMonthlyDelta = monthlyDeltaAtConservative != null
      ? monthlyDeltaAtConservative
      : (
          currentMonthlySurvivorNeed != null && conservativeMonthlySurvivorNeed != null
            ? conservativeMonthlySurvivorNeed - currentMonthlySurvivorNeed
            : null
        );

    return {
      currentSliderValue,
      conservativeSliderValue,
      monthlyDeltaAtConservative: resolvedMonthlyDelta == null ? null : roundMoney(resolvedMonthlyDelta),
      currentMonthlySurvivorNeed,
      conservativeMonthlySurvivorNeed,
      source: normalizeString(policy.source) || "explicit-compression-policy"
    };
  }

  function makeBaseOutput(input, status, warnings, compressionHorizon, compressionPolicy) {
    return {
      version: VERSION,
      status,
      rawBaselineMutated: false,
      autoCompressionEnabled: input?.options?.autoCompressionEnabled !== false,
      compressionHorizon,
      compressionPath: {
        formula: FORMULA,
        startSliderValue: START_SLIDER_VALUE,
        endSliderValue: CONSERVATIVE_SLIDER_VALUE
      },
      autoCompressedScenario: null,
      warnings: Array.isArray(warnings) ? warnings : [],
      trace: {
        source: CALCULATION_SOURCE,
        manualLifestyleComparisonPreserved: true,
        visibleBaselineReplacement: false,
        rawBaselineMutated: false,
        formula: FORMULA,
        horizonSource: compressionHorizon.source,
        horizonMonths: compressionHorizon.months,
        compressionPolicySource: compressionPolicy?.source || null,
        currentSliderValue: compressionPolicy?.currentSliderValue ?? START_SLIDER_VALUE,
        conservativeSliderValue: compressionPolicy?.conservativeSliderValue ?? CONSERVATIVE_SLIDER_VALUE
      }
    };
  }

  function recalculateDepletion(points, fallbackDate) {
    const depletedPoint = (Array.isArray(points) ? points : []).find(function (point) {
      const endingResources = toOptionalNumber(point?.endingResources);
      return endingResources != null && endingResources <= 0;
    });
    if (!depletedPoint) {
      const lastPoint = points[points.length - 1] || {};
      return {
        depleted: false,
        depletionDate: null,
        depletionMonthIndex: null,
        monthsCovered: toOptionalNumber(lastPoint.monthIndex) ?? points.length,
        precision: "monthly"
      };
    }
    return {
      depleted: true,
      depletionDate: depletedPoint.date || fallbackDate || null,
      depletionMonthIndex: toOptionalNumber(depletedPoint.monthIndex),
      monthsCovered: toOptionalNumber(depletedPoint.monthIndex),
      precision: "monthly"
    };
  }

  function summarizePoints(points, baseSummary) {
    const totals = (Array.isArray(points) ? points : []).reduce(function (next, point) {
      next.totalSurvivorNeeds = roundMoney(next.totalSurvivorNeeds + (toOptionalNumber(point?.survivorNeeds) || 0));
      next.totalNetUse = roundMoney(next.totalNetUse + (toOptionalNumber(point?.netUse) || 0));
      return next;
    }, {
      totalSurvivorNeeds: 0,
      totalNetUse: 0
    });
    const lastPoint = Array.isArray(points) ? points[points.length - 1] || {} : {};
    return Object.assign({}, clonePlainValue(baseSummary || {}), totals, {
      endingResources: toOptionalNumber(lastPoint.endingResources),
      accumulatedUnmetNeed: toOptionalNumber(lastPoint.accumulatedUnmetNeed)
    });
  }

  function buildAdjustedPostDeathSeries(postDeathSeries, compressionHorizon, compressionPolicy) {
    const basePoints = Array.isArray(postDeathSeries?.points) ? postDeathSeries.points : [];
    let cumulativeExpenseDelta = 0;
    const horizonMonths = compressionHorizon.months;
    const monthlyDeltaAtConservative = compressionPolicy.monthlyDeltaAtConservative;
    const points = basePoints.map(function (basePoint, index) {
      const monthIndex = getPointMonthIndex(basePoint, index);
      const progress = getEaseInCompressionProgress(monthIndex, horizonMonths);
      const sliderValue = roundMoney(
        compressionPolicy.currentSliderValue
        + ((compressionPolicy.conservativeSliderValue - compressionPolicy.currentSliderValue) * progress)
      );
      const monthlyDelta = roundMoney(monthlyDeltaAtConservative * progress);
      cumulativeExpenseDelta = roundMoney(cumulativeExpenseDelta + monthlyDelta);
      const endingResources = toOptionalNumber(basePoint.endingResources);
      const adjustedEndingResources = endingResources == null
        ? null
        : roundMoney(endingResources - cumulativeExpenseDelta);
      const survivorNeeds = toOptionalNumber(basePoint.survivorNeeds);
      const netUse = toOptionalNumber(basePoint.netUse);

      return Object.assign({}, clonePlainValue(basePoint), {
        monthIndex,
        survivorNeeds: survivorNeeds == null ? basePoint.survivorNeeds : roundMoney(Math.max(0, survivorNeeds + monthlyDelta)),
        netUse: netUse == null ? basePoint.netUse : roundMoney(netUse + monthlyDelta),
        endingResources: adjustedEndingResources == null ? basePoint.endingResources : adjustedEndingResources,
        availableResources: adjustedEndingResources == null
          ? basePoint.availableResources
          : roundMoney(Math.max(0, adjustedEndingResources)),
        accumulatedUnmetNeed: adjustedEndingResources == null
          ? basePoint.accumulatedUnmetNeed
          : roundMoney(Math.max(0, -adjustedEndingResources)),
        autoCompressionSliderValue: sliderValue,
        monthlyHouseholdExpenseDelta: monthlyDelta,
        cumulativeHouseholdExpenseDelta: cumulativeExpenseDelta,
        trace: Object.assign({}, isPlainObject(basePoint.trace) ? clonePlainValue(basePoint.trace) : {}, {
          autoCompressedBaselineApplied: true,
          autoCompressionFormula: FORMULA,
          autoCompressionHorizonSource: compressionHorizon.source,
          autoCompressionHorizonMonths: compressionHorizon.months,
          autoCompressionProgress: progress,
          autoCompressionSliderValue: sliderValue,
          monthlyHouseholdExpenseDelta: monthlyDelta,
          cumulativeHouseholdExpenseDelta: cumulativeExpenseDelta
        })
      });
    });

    return {
      points,
      summary: summarizePoints(points, postDeathSeries?.summary),
      depletion: recalculateDepletion(points, postDeathSeries?.depletion?.depletionDate),
      trace: Object.assign({}, isPlainObject(postDeathSeries?.trace) ? clonePlainValue(postDeathSeries.trace) : {}, {
        autoCompressedBaselineApplied: true,
        formula: FORMULA,
        horizonSource: compressionHorizon.source,
        horizonMonths: compressionHorizon.months,
        monthlyDeltaAtConservative
      })
    };
  }

  function buildIncomeImpactAutoCompressedBaseline(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const postDeathSeries = getPostDeathSeries(safeInput);
    const points = Array.isArray(postDeathSeries?.points) ? postDeathSeries.points : [];
    const compressionHorizon = resolveCompressionHorizon(safeInput, postDeathSeries, points);
    const compressionPolicy = resolveCompressionPolicy(safeInput);
    const warnings = [];

    if (safeInput.options?.autoCompressionEnabled === false) {
      warnings.push(makeIssue(
        "auto-compression-disabled",
        "Auto-compressed baseline was not built because the option is disabled.",
        ["options.autoCompressionEnabled"]
      ));
      return makeBaseOutput(safeInput, "not-applicable", warnings, compressionHorizon, compressionPolicy);
    }

    if (!postDeathSeries || !points.length) {
      warnings.push(makeIssue(
        "missing-post-death-series",
        "Raw baseline postDeathSeries.points are required before an auto-compressed baseline can be built.",
        ["postDeathSeries.points", "rawBaselineScenario.postDeathSeries.points"]
      ));
      return makeBaseOutput(safeInput, "insufficient-data", warnings, compressionHorizon, compressionPolicy);
    }

    if (compressionHorizon.source === "unavailable" || compressionHorizon.months == null) {
      warnings.push(makeIssue(
        "missing-compression-horizon",
        "Auto-compressed baseline needs a raw depletion month or projection horizon.",
        ["rawBaselineScenario.postDeathSeries.depletion", "options.projectionHorizonMonths"]
      ));
      return makeBaseOutput(safeInput, "insufficient-data", warnings, compressionHorizon, compressionPolicy);
    }

    if (compressionHorizon.source === "immediateDepletion") {
      warnings.push(makeIssue(
        "immediate-depletion-no-gradual-runway",
        "Raw baseline depletes immediately, so gradual auto-compression is not applicable.",
        ["rawBaselineScenario.postDeathSeries.depletion.depletionMonthIndex"]
      ));
      return makeBaseOutput(safeInput, "not-applicable", warnings, compressionHorizon, compressionPolicy);
    }

    if (compressionPolicy.monthlyDeltaAtConservative == null) {
      warnings.push(makeIssue(
        "missing-conservative-lifestyle-target",
        "Auto-compressed baseline requires an explicit conservative monthly target or monthly delta.",
        ["compressionPolicy.monthlyDeltaAtConservative", "compressionPolicy.conservativeMonthlySurvivorNeed"]
      ));
      return makeBaseOutput(safeInput, "insufficient-data", warnings, compressionHorizon, compressionPolicy);
    }

    if (compressionPolicy.monthlyDeltaAtConservative > 0) {
      warnings.push(makeIssue(
        "invalid-conservative-lifestyle-target",
        "Auto-compressed baseline requires a conservative target that does not increase monthly spending.",
        ["compressionPolicy.monthlyDeltaAtConservative", "compressionPolicy.conservativeMonthlySurvivorNeed"],
        { monthlyDeltaAtConservative: compressionPolicy.monthlyDeltaAtConservative }
      ));
      return makeBaseOutput(safeInput, "insufficient-data", warnings, compressionHorizon, compressionPolicy);
    }

    const rawBaselineScenario = isPlainObject(safeInput.rawBaselineScenario)
      ? safeInput.rawBaselineScenario
      : {};
    const adjustedPostDeathSeries = buildAdjustedPostDeathSeries(
      postDeathSeries,
      compressionHorizon,
      compressionPolicy
    );
    const autoCompressedScenario = Object.assign({}, clonePlainValue(rawBaselineScenario), {
      scenarioId: normalizeString(safeInput.options?.scenarioId) || "income-impact-auto-compressed-baseline",
      kind: "autoCompressedBaseline",
      label: normalizeString(safeInput.options?.label) || "Auto-compressed survivor lifestyle baseline",
      postDeathSeries: adjustedPostDeathSeries,
      timelineFacts: Object.assign({}, clonePlainValue(rawBaselineScenario.timelineFacts || {}), {
        depletionDate: adjustedPostDeathSeries.depletion.depletionDate || null,
        monthsCovered: adjustedPostDeathSeries.depletion.monthsCovered ?? null,
        accumulatedUnmetNeed: adjustedPostDeathSeries.summary.accumulatedUnmetNeed ?? null
      }),
      trace: Object.assign({}, isPlainObject(rawBaselineScenario.trace) ? clonePlainValue(rawBaselineScenario.trace) : {}, {
        autoCompressedBaselineApplied: true,
        source: CALCULATION_SOURCE,
        rawBaselineMutated: false,
        visibleBaselineReplacement: false,
        manualLifestyleComparisonPreserved: true,
        compressionHorizon: clonePlainValue(compressionHorizon),
        compressionPath: {
          formula: FORMULA,
          startSliderValue: START_SLIDER_VALUE,
          endSliderValue: CONSERVATIVE_SLIDER_VALUE
        }
      })
    });

    return Object.assign(
      makeBaseOutput(safeInput, "ready", warnings, compressionHorizon, compressionPolicy),
      {
        autoCompressedScenario,
        trace: Object.assign(
          makeBaseOutput(safeInput, "ready", warnings, compressionHorizon, compressionPolicy).trace,
          {
            autoCompressedPointCount: adjustedPostDeathSeries.points.length,
            monthlyDeltaAtConservative: compressionPolicy.monthlyDeltaAtConservative
          }
        )
      }
    );
  }

  lensAnalysis.incomeImpactAutoCompressedBaselineCalculations = Object.freeze({
    buildIncomeImpactAutoCompressedBaseline
  });
  lensAnalysis.buildIncomeImpactAutoCompressedBaseline = buildIncomeImpactAutoCompressedBaseline;
})(typeof globalThis !== "undefined" ? globalThis : this);
