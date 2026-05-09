(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: inactive Income Impact household expense scenario handoff preview.
  // Non-goals: no graph construction, runtime wiring, storage access, or display rendering.

  const HANDOFF_PREVIEW_VERSION = 1;
  const ACTIVE_RUNTIME_CONSUMER = false;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (clone, key) {
        const nextValue = clonePlainValue(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    return value === undefined ? null : value;
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
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null;
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function getBasePostDeathSeries(input) {
    if (isPlainObject(input?.basePostDeathSeries)) {
      return input.basePostDeathSeries;
    }

    if (Array.isArray(input?.basePostDeathSeries)) {
      return { points: input.basePostDeathSeries };
    }

    return {};
  }

  function getBasePoints(basePostDeathSeries) {
    return Array.isArray(basePostDeathSeries?.points) ? basePostDeathSeries.points : [];
  }

  function getMonthlyDelta(input) {
    const direct = toOptionalNumber(input?.monthlyDelta);
    if (direct != null) {
      return roundMoney(direct);
    }

    const result = input?.householdExpenseAdjustmentResult;
    const resultMonthlyDelta = toOptionalNumber(result?.monthlyDelta);
    if (resultMonthlyDelta != null) {
      return roundMoney(resultMonthlyDelta);
    }

    const totalsMonthlyDelta = toOptionalNumber(result?.totals?.monthlyDelta);
    if (totalsMonthlyDelta != null) {
      return roundMoney(totalsMonthlyDelta);
    }

    const adjustedMonthlyTotal = toOptionalNumber(result?.adjustedMonthlyTotal ?? result?.totals?.adjustedMonthlyTotal);
    const baselineMonthlyTotal = toOptionalNumber(result?.baselineMonthlyTotal ?? result?.totals?.baselineMonthlyTotal);
    if (adjustedMonthlyTotal != null && baselineMonthlyTotal != null) {
      return roundMoney(adjustedMonthlyTotal - baselineMonthlyTotal);
    }

    return null;
  }

  function getPointMonthIndex(point) {
    const candidates = [
      point?.monthIndex,
      point?.monthNumber,
      point?.elapsedMonths,
      point?.periodMonthIndex,
      point?.projectionMonth
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const value = toOptionalNumber(candidates[index]);
      if (value != null && value >= 0) {
        return value;
      }
    }

    return null;
  }

  function getBaseResourceAmount(point) {
    const candidates = [
      { field: "endingResources", value: point?.endingResources },
      { field: "availableResources", value: point?.availableResources },
      { field: "resources", value: point?.resources },
      { field: "remainingResources", value: point?.remainingResources }
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const value = toOptionalNumber(candidates[index].value);
      if (value != null) {
        return {
          field: candidates[index].field,
          value
        };
      }
    }

    return null;
  }

  function validateInputs(basePoints, monthlyDelta, dataGaps) {
    if (monthlyDelta == null) {
      dataGaps.push(createIssue(
        "missing-household-expense-monthly-delta",
        "Household expense adjustment result did not include a usable monthlyDelta, so no scenario handoff path was produced.",
        ["householdExpenseAdjustmentResult.monthlyDelta"]
      ));
    }

    if (!basePoints.length) {
      dataGaps.push(createIssue(
        "missing-base-post-death-series-points",
        "Base post-death series did not include points, so no scenario handoff path was produced.",
        ["basePostDeathSeries.points"]
      ));
    }

    basePoints.forEach(function (point, index) {
      if (getPointMonthIndex(point) == null) {
        dataGaps.push(createIssue(
          "missing-explicit-month-index",
          "Post-death series point did not include an explicit month index. The handoff preview does not infer irregular timelines.",
          { pointIndex: index, acceptedFields: ["monthIndex", "monthNumber", "elapsedMonths", "periodMonthIndex", "projectionMonth"] }
        ));
      }

      if (getBaseResourceAmount(point) == null) {
        dataGaps.push(createIssue(
          "missing-base-resource-value",
          "Post-death series point did not include a usable baseline resource value.",
          { pointIndex: index, acceptedFields: ["endingResources", "availableResources", "resources", "remainingResources"] }
        ));
      }
    });

    return dataGaps.length === 0;
  }

  function buildComparisonSeries(basePostDeathSeries, basePoints, monthlyDelta, options) {
    const points = basePoints.map(function (basePoint) {
      const point = clonePlainValue(basePoint);
      const monthIndex = getPointMonthIndex(basePoint);
      const baseResource = getBaseResourceAmount(basePoint);
      const cumulativeDeltaImpact = roundMoney(monthlyDelta * monthIndex);
      const adjustedResources = roundMoney(baseResource.value - cumulativeDeltaImpact);
      return Object.assign({}, point, {
        householdExpenseAdjustedAvailableResources: adjustedResources,
        householdExpenseAdjustedEndingResources: adjustedResources,
        cumulativeHouseholdExpenseDelta: cumulativeDeltaImpact,
        monthlyHouseholdExpenseDelta: monthlyDelta,
        trace: Object.assign({}, isPlainObject(point.trace) ? point.trace : {}, {
          householdExpenseScenarioHandoffPreviewApplied: true,
          householdExpenseScenarioHandoffPreviewOnly: true,
          baseResourceFieldPreserved: true,
          baselineResourceField: baseResource.field,
          explicitMonthIndexUsed: monthIndex,
          monthlyHouseholdExpenseDelta: monthlyDelta,
          cumulativeHouseholdExpenseDelta: cumulativeDeltaImpact,
          runtimeConsumer: false
        })
      });
    });

    return Object.assign({}, clonePlainValue(basePostDeathSeries), {
      points,
      trace: Object.assign({}, isPlainObject(basePostDeathSeries.trace) ? clonePlainValue(basePostDeathSeries.trace) : {}, {
        householdExpenseScenarioHandoffPreview: true,
        previewLabel: normalizeString(options?.previewLabel) || "Household expense adjustment preview",
        runtimeConsumer: false
      })
    });
  }

  function previewIncomeImpactHouseholdExpenseScenarioHandoff(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const warnings = [];
    const dataGaps = [];
    const basePostDeathSeries = getBasePostDeathSeries(safeInput);
    const basePoints = getBasePoints(basePostDeathSeries);
    const monthlyDelta = getMonthlyDelta(safeInput);
    const valid = validateInputs(basePoints, monthlyDelta, dataGaps);
    const comparisonPostDeathSeries = valid
      ? buildComparisonSeries(basePostDeathSeries, basePoints, monthlyDelta, options)
      : null;
    const totalDeltaApplied = valid
      ? roundMoney(basePoints.reduce(function (max, point) {
        return Math.max(max, getPointMonthIndex(point) || 0);
      }, 0) * monthlyDelta)
      : null;

    return clonePlainValue({
      comparisonPostDeathSeries,
      monthlyDelta,
      totalDeltaApplied,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "income-impact-household-expense-scenario-handoff-preview-v1",
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
        previewOnly: true,
        graphSeriesConstructed: false,
        runtimeWired: false,
        displayHelpersCalled: false,
        incomeImpactOutputChanged: false,
        basePointCount: basePoints.length,
        comparisonPathProduced: Boolean(comparisonPostDeathSeries),
        deltaSignConvention: "adjustedMonthlyTotal - baselineMonthlyTotal; negative increases resources, positive decreases resources"
      },
      metadata: {
        handoffPreviewVersion: HANDOFF_PREVIEW_VERSION,
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER
      }
    });
  }

  lensAnalysis.incomeImpactHouseholdExpenseScenarioHandoffPreview = Object.freeze({
    HANDOFF_PREVIEW_VERSION,
    previewIncomeImpactHouseholdExpenseScenarioHandoff
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
