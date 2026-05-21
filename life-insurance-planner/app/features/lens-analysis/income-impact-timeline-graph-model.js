(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const CALCULATION_METHOD = "income-impact-timeline-graph-model-v1";
  const DEFAULT_CURRENT_AGE_MODE = "death-event-only";
  const COMPRESSION_EARLY_DETAIL_WINDOW_MONTHS = 24;
  const LIFESTYLE_COMPARISON_KIND = "lifestyleComparison";
  const LIFESTYLE_COMPARISON_PATH_ID = "lifestyle-post-death-resources";
  const PRE_DEATH_ASSETS_PATH_ID = "preDeathAssets";
  const POST_DEATH_RESOURCES_PATH_ID = "postDeathResources";
  const MAX_VISIBLE_APPLIED_GRAPH_SCENARIOS = 2;
  const X_AXIS_MODE_DEATH_RELATIVE_YEARS = "deathRelativeYears";
  const PROJECTION_MODE_DEATH_RELATIVE_RUNWAY = "deathRelativeRunway";
  const GRAPH_CONTRACT_MODE_SURVIVOR_RUNWAY_COMPARISON = "survivorRunwayComparison";
  const GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS = "postDeathFocus";
  const GRAPH_VIEW_FRAME_MODE_DEATH_LEAD_UP = "deathLeadUp";
  const DISPLAY_HORIZON_MODE_AUTO_DEPLETION = "autoFromAppliedScenarioDepletion";
  const VERTICAL_SCALE_MODE_CONTINUOUS_LINEAR = "continuousLinear";
  const DEATH_RELATIVE_DEATH_X_RATIO = 0.125;
  const DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS = 5;
  const MONTHS_PER_YEAR = 12;
  const DAYS_PER_MONTH = 30.4375;
  const ONE_DAY_IN_MONTHS = 1 / DAYS_PER_MONTH;
  const ONE_WEEK_IN_MONTHS = 7 / DAYS_PER_MONTH;
  const MIN_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS = ONE_WEEK_IN_MONTHS;
  const MAX_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS = 40 * MONTHS_PER_YEAR;
  const MIN_SMALL_RUNWAY_AXIS_STEP = 100;
  const SMALL_RUNWAY_AXIS_MAX_MAGNITUDE = 10000;
  const DEPLETION_RUNWAY_TARGET_X_RATIO = 0.8;
  const MIN_POST_DEPLETION_DISPLAY_PADDING_MONTHS = 3 * ONE_DAY_IN_MONTHS;
  const MAX_POST_DEPLETION_DISPLAY_PADDING_MONTHS = 24;
  const DISPLAY_HORIZON_ROUNDING_MONTHS = 5 * MONTHS_PER_YEAR;
  const DEFAULT_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS = 40 * MONTHS_PER_YEAR;
  const DEATH_RELATIVE_X_TICK_YEARS = Object.freeze([5, 10, 15, 20, 30, 40]);
  const STABLE_LAYOUT_FRAME_MODE = "stableRunoutAnchoredFrame";
  const STABLE_LAYOUT_FRAME = Object.freeze({
    plotLeft: 74,
    plotRight: 958,
    plotTop: 36,
    plotBottom: 474,
    deathXRatio: DEATH_RELATIVE_DEATH_X_RATIO,
    zeroYRatio: 0.72,
    runoutAnchorXRatio: 0.8,
    negativeSupportBandRatio: 0.28
  });
  const POST_DEATH_FOCUS_RUNWAY_START_Y_RATIO = 0.12;
  const POST_DEATH_FOCUS_MIN_ZERO_GAP_RATIO = 0.08;
  const RISK_SEVERITIES = Object.freeze(["critical", "at-risk", "caution"]);
  const PHASE_LABELS = Object.freeze({
    preDeath: "Before death",
    deathEvent: "Death event",
    postDeath: "After death"
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function toOptionalNumber(value) {
    if (value === "" || value == null) {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeDateOnly(value) {
    if (value == null || value === "") {
      return "";
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [
        String(value.getFullYear()).padStart(4, "0"),
        String(value.getMonth() + 1).padStart(2, "0"),
        String(value.getDate()).padStart(2, "0")
      ].join("-");
    }
    const normalized = String(value).trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return "";
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(year, monthIndex, day);
    if (
      Number.isNaN(parsed.getTime())
      || parsed.getFullYear() !== year
      || parsed.getMonth() !== monthIndex
      || parsed.getDate() !== day
    ) {
      return "";
    }
    return normalizeDateOnly(parsed);
  }

  function parseDateOnly(value) {
    const normalized = normalizeDateOnly(value);
    if (!normalized) {
      return null;
    }
    const parts = normalized.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addMonths(date, months) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }
    const wholeMonths = Math.round(toOptionalNumber(months) || 0);
    const targetYear = date.getFullYear();
    const targetMonth = date.getMonth() + wholeMonths;
    const target = new Date(targetYear, targetMonth, 1);
    const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
    return target;
  }

  function addDays(date, days) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return null;
    }
    const wholeDays = Math.round(toOptionalNumber(days) || 0);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + wholeDays);
  }

  function addRelativeMonths(date, months) {
    const numericMonths = toOptionalNumber(months);
    if (numericMonths == null) {
      return null;
    }
    if (Math.abs(numericMonths) < 1) {
      return addDays(date, numericMonths * DAYS_PER_MONTH);
    }
    return addMonths(date, numericMonths);
  }

  function getApproximateMonthDelta(startDateValue, endDateValue) {
    const startDate = parseDateOnly(startDateValue);
    const endDate = parseDateOnly(endDateValue);
    if (!startDate || !endDate) {
      return null;
    }
    const wholeMonths = ((endDate.getFullYear() - startDate.getFullYear()) * MONTHS_PER_YEAR)
      + (endDate.getMonth() - startDate.getMonth());
    return wholeMonths + ((endDate.getDate() - startDate.getDate()) / DAYS_PER_MONTH);
  }

  function appendUnique(target, values) {
    if (!Array.isArray(target) || !Array.isArray(values)) {
      return target;
    }
    values.forEach(function (value) {
      const normalized = String(value || "").trim();
      if (normalized && !target.includes(normalized)) {
        target.push(normalized);
      }
    });
    return target;
  }

  function makeIssue(code, message, sourcePaths, details) {
    const issue = {
      code: String(code || "income-impact-graph-model-issue"),
      message: String(message || "Review the Income Impact graph model.")
    };
    const paths = [];
    appendUnique(paths, Array.isArray(sourcePaths) ? sourcePaths : []);
    if (paths.length) {
      issue.sourcePaths = paths;
    }
    if (details && typeof details === "object") {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function getPath(source, path) {
    return String(path || "")
      .split(".")
      .filter(Boolean)
      .reduce(function (current, key) {
        return current && typeof current === "object" ? current[key] : undefined;
      }, source);
  }

  function getFirstNumber(source, paths) {
    for (const path of paths) {
      const number = toOptionalNumber(getPath(source, path));
      if (number != null) {
        return {
          value: number,
          sourcePath: path
        };
      }
    }
    return {
      value: null,
      sourcePath: ""
    };
  }

  function readPointValue(point, preferredPaths) {
    const fromPreferred = getFirstNumber(point, preferredPaths);
    if (fromPreferred.value != null) {
      return fromPreferred;
    }
    return getFirstNumber(point, ["value", "displayedValue", "balance"]);
  }

  function buildSeriesPoints(points, phase, preferredValuePaths, sourcePath) {
    if (!Array.isArray(points)) {
      return [];
    }
    return points
      .map(function (point, index) {
        if (!isPlainObject(point)) {
          return null;
        }
        const date = normalizeDateOnly(point.date);
        const valueResult = readPointValue(point, preferredValuePaths);
        if (!date || valueResult.value == null) {
          return null;
        }
        const seriesPoint = {
          id: `${phase}-${index + 1}`,
          date,
          monthIndex: toOptionalNumber(point.monthIndex) ?? index + 1,
          phase,
          value: valueResult.value,
          rawValue: valueResult.value,
          displayedValue: valueResult.value,
          sourcePath: `${sourcePath}.${index}.${valueResult.sourcePath || "value"}`,
          sourcePaths: Array.isArray(point.sourcePaths) ? clonePlainValue(point.sourcePaths) : [],
          status: point.status || null,
          precision: point.precision || null,
          trace: isPlainObject(point.trace) ? clonePlainValue(point.trace) : {}
        };
        [
          ["endingResources", point.endingResources],
          ["availableResources", point.availableResources],
          ["accumulatedUnmetNeed", point.accumulatedUnmetNeed]
        ].forEach(function (entry) {
          const rawValue = toOptionalNumber(entry[1]);
          if (rawValue != null) {
            seriesPoint[entry[0]] = rawValue;
          }
        });
        return seriesPoint;
      })
      .filter(Boolean);
  }

  function getComparableSeriesPointValue(point) {
    return toOptionalNumber(point?.value ?? point?.endingResources ?? point?.availableResources);
  }

  function areEquivalentSeriesPoints(leftPoint, rightPoint) {
    const leftValue = getComparableSeriesPointValue(leftPoint);
    const rightValue = getComparableSeriesPointValue(rightPoint);
    const leftMonth = toOptionalNumber(leftPoint?.monthIndex);
    const rightMonth = toOptionalNumber(rightPoint?.monthIndex);
    const leftDate = normalizeDateOnly(leftPoint?.date);
    const rightDate = normalizeDateOnly(rightPoint?.date);
    return leftValue != null
      && rightValue != null
      && Math.abs(leftValue - rightValue) <= 0.000001
      && (leftMonth == null || rightMonth == null || leftMonth === rightMonth)
      && (!leftDate || !rightDate || leftDate === rightDate);
  }

  function areEquivalentSeries(pointSet, basePointSet) {
    const points = Array.isArray(pointSet) ? pointSet : [];
    const basePoints = Array.isArray(basePointSet) ? basePointSet : [];
    return points.length >= 2
      && points.length === basePoints.length
      && points.every(function (point, index) {
        return areEquivalentSeriesPoints(point, basePoints[index]);
      });
  }

  function buildComparisonSeries(comparisonScenarios, basePostDeathResources) {
    return (Array.isArray(comparisonScenarios) ? comparisonScenarios : [])
      .map(function (comparisonScenario, index) {
        if (!isPlainObject(comparisonScenario) || !isLifestyleComparisonScenario(comparisonScenario)) {
          return null;
        }
        if (isNeutralLifestyleComparison(comparisonScenario)) {
          return null;
        }

        const kind = normalizeComparisonKind(comparisonScenario);
        const pathId = normalizeComparisonPathId(
          comparisonScenario.pathId
          || comparisonScenario.graphPathId
          || LIFESTYLE_COMPARISON_PATH_ID
        );
        const postDeathSeries = isPlainObject(comparisonScenario.postDeathSeries)
          ? comparisonScenario.postDeathSeries
          : {};
        const points = buildSeriesPoints(
          postDeathSeries.points,
          "comparisonPostDeath",
          ["endingResources", "availableResources"],
          `comparisonScenarios.${index}.postDeathSeries.points`
        );
        if (points.length < 2) {
          return null;
        }
        if (areEquivalentSeries(points, basePostDeathResources)) {
          return null;
        }
        return {
          scenarioId: String(comparisonScenario.scenarioId || `comparison-scenario-${index + 1}`),
          kind,
          label: String(comparisonScenario.label || "Comparison scenario"),
          pathId,
          pathMode: getComparisonPathMode(comparisonScenario, kind, pathId),
          sourceIndex: index,
          points,
          sourcePath: `comparisonScenarios.${index}.postDeathSeries.points`,
          depletion: getDepletionInfo(points, comparisonScenario.depletion || postDeathSeries.depletion),
          trace: isPlainObject(comparisonScenario.trace) ? clonePlainValue(comparisonScenario.trace) : {}
        };
      })
      .filter(Boolean)
      .slice(0, 1);
  }

  function getAppliedScenarioId(appliedScenario, index) {
    return normalizeString(appliedScenario?.scenarioId) || `applied-scenario-${index + 1}`;
  }

  function getSelectedAppliedScenario(appliedScenarios, selectedScenarioId) {
    const normalizedSelectedScenarioId = normalizeString(selectedScenarioId);
    if (!normalizedSelectedScenarioId) {
      return {
        scenario: appliedScenarios[0] || null,
        index: appliedScenarios.length ? 0 : -1
      };
    }

    const matchedIndex = appliedScenarios.findIndex(function (appliedScenario, index) {
      return getAppliedScenarioId(appliedScenario, index) === normalizedSelectedScenarioId;
    });
    if (matchedIndex >= 0) {
      return {
        scenario: appliedScenarios[matchedIndex],
        index: matchedIndex
      };
    }

    return {
      scenario: appliedScenarios[0] || null,
      index: appliedScenarios.length ? 0 : -1
    };
  }

  function getAppliedScenarioTrace(appliedScenario, index) {
    if (!isPlainObject(appliedScenario)) {
      return null;
    }

    return {
      scenarioId: getAppliedScenarioId(appliedScenario, index),
      label: normalizeString(appliedScenario.label) || null,
      settings: isPlainObject(appliedScenario.settings) ? clonePlainValue(appliedScenario.settings) : null,
      lifestyleAdjustment: isPlainObject(appliedScenario.lifestyleAdjustment)
        ? clonePlainValue(appliedScenario.lifestyleAdjustment)
        : null,
      comparisonTrace: isPlainObject(appliedScenario.comparisonTrace)
        ? clonePlainValue(appliedScenario.comparisonTrace)
        : null
    };
  }

  function getAppliedScenarioKeyItems(appliedScenarios, selectedScenarioId) {
    const normalizedSelectedScenarioId = normalizeString(selectedScenarioId);
    return (Array.isArray(appliedScenarios) ? appliedScenarios : [])
      .map(function (appliedScenario, index) {
        const trace = getAppliedScenarioTrace(appliedScenario, index);
        if (!trace) {
          return null;
        }
        const scenarioId = trace.scenarioId;
        return Object.assign({}, trace, {
          index,
          selected: normalizedSelectedScenarioId
            ? scenarioId === normalizedSelectedScenarioId
            : index === 0
        });
      })
      .filter(Boolean);
  }

  function getAppliedScenarioLabel(appliedScenario, index) {
    return normalizeString(appliedScenario?.label)
      || (index === 0 ? "Current scenario" : `Scenario ${index + 1}`);
  }

  function getAppliedScenarioPostDeathPathId(renderIndex) {
    return renderIndex === 0
      ? POST_DEATH_RESOURCES_PATH_ID
      : `${POST_DEATH_RESOURCES_PATH_ID}--scenario-${renderIndex + 1}`;
  }

  function getAppliedScenarioPreDeathPathId(renderIndex) {
    return renderIndex === 0
      ? PRE_DEATH_ASSETS_PATH_ID
      : `${PRE_DEATH_ASSETS_PATH_ID}--scenario-${renderIndex + 1}`;
  }

  function buildAppliedPreDeathTargetPoint(appliedScenario, sourceIndex, scenarioDates) {
    const scenario = isPlainObject(appliedScenario?.scenario) ? appliedScenario.scenario : {};
    const preDeathSeries = isPlainObject(scenario.preDeathSeries) ? scenario.preDeathSeries : {};
    const targetPoint = isPlainObject(preDeathSeries.targetPoint) ? preDeathSeries.targetPoint : {};
    const targetValue = readPointValue(targetPoint, ["endingAssets"]);
    const fallbackValue = getFirstNumber(scenario, ["deathEvent.assetsBeforeDeath", "timelineFacts.assetsBeforeDeath"]);
    const value = targetValue.value != null ? targetValue.value : fallbackValue.value;
    const sourceProjectionPointDate = normalizeDateOnly(targetPoint.date);
    const date = normalizeDateOnly(
      scenarioDates.deathDate
        || getPath(scenario, "deathEvent.date")
        || getPath(scenario, "scenario.selectedDeathDate")
        || sourceProjectionPointDate
    );
    if (!date || value == null) {
      return null;
    }
    const sourcePath = targetValue.value != null
      ? `appliedScenarios.${sourceIndex}.scenario.preDeathSeries.targetPoint.${targetValue.sourcePath || "endingAssets"}`
      : `appliedScenarios.${sourceIndex}.scenario.${fallbackValue.sourcePath || "deathEvent.assetsBeforeDeath"}`;
    return {
      id: `${getAppliedScenarioId(appliedScenario, sourceIndex)}-pre-death-target`,
      date,
      monthIndex: toOptionalNumber(targetPoint.monthIndex),
      phase: "deathEvent",
      value,
      rawValue: value,
      displayedValue: value,
      endingAssets: value,
      sourcePath,
      sourcePaths: Array.isArray(targetPoint.sourcePaths) ? clonePlainValue(targetPoint.sourcePaths) : [],
      status: "death-line-anchor",
      precision: targetPoint.precision || null,
      trace: Object.assign({}, isPlainObject(targetPoint.trace) ? targetPoint.trace : {}, {
        preDeathContextTarget: true,
        sourceProjectionPointDate: sourceProjectionPointDate || null,
        rawDatePreserved: true,
        rawValuePreserved: true
      })
    };
  }

  function getPreDeathContextGrowthModel(appliedScenario, sourceIndex) {
    const scenario = isPlainObject(appliedScenario?.scenario) ? appliedScenario.scenario : {};
    const trace = isPlainObject(scenario.trace) ? scenario.trace : {};
    const explicitGrowth = getFirstNumber(trace, [
      "preDeathContextGrowthRate",
      "displayPreDeathContextGrowthRate",
      "layer1.preDeathContextGrowthRate",
      "layer1.displayAnnualGrowthRate"
    ]);
    if (explicitGrowth.value != null) {
      const annualGrowthRate = explicitGrowth.value > 1 ? explicitGrowth.value / 100 : explicitGrowth.value;
      return {
        annualGrowthRate,
        source: "scenarioTrace",
        sourcePath: `appliedScenarios.${sourceIndex}.scenario.trace.${explicitGrowth.sourcePath}`
      };
    }
    return {
      annualGrowthRate: 0,
      source: "flatFallback",
      sourcePath: null
    };
  }

  function makeDisplayOnlyPreDeathContextPoint(config) {
    const value = toOptionalNumber(config?.value);
    if (!config?.date || value == null) {
      return null;
    }
    return {
      id: config.id,
      date: config.date,
      monthIndex: config.monthIndex,
      phase: config.phase || "appliedPreDeath",
      value,
      rawValue: config.rawValue == null ? value : config.rawValue,
      displayedValue: value,
      endingAssets: value,
      sourcePath: config.sourcePath,
      sourcePaths: Array.isArray(config.sourcePaths) ? clonePlainValue(config.sourcePaths) : [],
      status: config.status || "display-only-pre-death-context",
      precision: "display-context",
      trace: Object.assign({}, isPlainObject(config.trace) ? config.trace : {}, {
        preDeathContextMode: "reverseCalculatedFromDeathValue",
        preDeathContextDisplayOnly: true,
        preDeathContextYears: DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS,
        preDeathContextGrowthSource: config.growthSource || "flatFallback",
        preDeathContextGrowthSourcePath: config.growthSourcePath || null,
        noFinancialCalculationChanged: true
      })
    };
  }

  function buildAppliedPreDeathContextPoints(appliedScenario, sourceIndex, scenarioDates) {
    if (!isPlainObject(appliedScenario) || !isPlainObject(appliedScenario.scenario)) {
      return [];
    }
    const targetPoint = buildAppliedPreDeathTargetPoint(appliedScenario, sourceIndex, scenarioDates);
    if (!targetPoint) {
      return [];
    }
    const parsedDeathDate = parseDateOnly(targetPoint.date);
    if (!parsedDeathDate) {
      return [targetPoint];
    }
    const growth = getPreDeathContextGrowthModel(appliedScenario, sourceIndex);
    const contextMonths = DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS * MONTHS_PER_YEAR;
    const startDate = normalizeDateOnly(addMonths(parsedDeathDate, -contextMonths));
    const deathValue = toOptionalNumber(targetPoint.value);
    const startValue = growth.annualGrowthRate
      ? deathValue / Math.pow(1 + growth.annualGrowthRate, DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS)
      : deathValue;
    const scenarioId = getAppliedScenarioId(appliedScenario, sourceIndex);
    const baseTrace = {
      preDeathContextMode: "reverseCalculatedFromDeathValue",
      preDeathContextDisplayOnly: true,
      preDeathContextYears: DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS,
      preDeathContextGrowthSource: growth.source,
      preDeathContextGrowthSourcePath: growth.sourcePath,
      sourceDeathValuePath: targetPoint.sourcePath,
      noFinancialCalculationChanged: true
    };
    return [
      makeDisplayOnlyPreDeathContextPoint({
        id: `${scenarioId}-pre-death-context-start`,
        date: startDate,
        monthIndex: null,
        phase: "appliedPreDeath",
        value: startValue,
        rawValue: deathValue,
        sourcePath: targetPoint.sourcePath,
        sourcePaths: targetPoint.sourcePaths,
        growthSource: growth.source,
        growthSourcePath: growth.sourcePath,
        trace: Object.assign({}, baseTrace, {
          displayDateCalculated: true,
          displayValueReverseCalculated: true,
          rawDatePreserved: false,
          rawValuePreserved: false
        })
      }),
      makeDisplayOnlyPreDeathContextPoint({
        id: targetPoint.id,
        date: targetPoint.date,
        monthIndex: targetPoint.monthIndex,
        phase: "deathEvent",
        value: deathValue,
        rawValue: deathValue,
        sourcePath: targetPoint.sourcePath,
        sourcePaths: targetPoint.sourcePaths,
        status: "death-line-anchor",
        growthSource: growth.source,
        growthSourcePath: growth.sourcePath,
        trace: Object.assign({}, targetPoint.trace, baseTrace, {
          preDeathContextTarget: true,
          rawDatePreserved: true,
          rawValuePreserved: true
        })
      })
    ].filter(Boolean);
  }

  function normalizeGraphModelScenarioInput(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const selectedScenarioId = normalizeString(safeInput.selectedScenarioId || options.selectedScenarioId);
    const appliedScenarios = Array.isArray(safeInput.appliedScenarios)
      ? safeInput.appliedScenarios.filter(isPlainObject)
      : [];

    if (!appliedScenarios.length) {
      return {
        scenarioModelMode: "singleScenario",
        scenario: safeInput.scenario,
        riskEvaluation: isPlainObject(safeInput.riskEvaluation) ? safeInput.riskEvaluation : {},
        comparisonScenarios: safeInput.comparisonScenarios,
        appliedScenarioCount: 0,
        appliedScenarios: [],
        selectedScenarioId: selectedScenarioId || null,
        selectedAppliedScenarioId: null,
        selectedAppliedScenarioIndex: -1,
        selectedAppliedScenario: null
      };
    }

    const selected = getSelectedAppliedScenario(appliedScenarios, selectedScenarioId);
    const selectedAppliedScenario = selected.scenario;
    const selectedAppliedScenarioId = selectedAppliedScenario
      ? getAppliedScenarioId(selectedAppliedScenario, selected.index)
      : null;

    return {
      scenarioModelMode: "appliedScenarios",
      scenario: isPlainObject(selectedAppliedScenario?.scenario)
        ? selectedAppliedScenario.scenario
        : safeInput.scenario,
      riskEvaluation: isPlainObject(selectedAppliedScenario?.riskEvaluation)
        ? selectedAppliedScenario.riskEvaluation
        : (isPlainObject(safeInput.riskEvaluation) ? safeInput.riskEvaluation : {}),
      comparisonScenarios: Array.isArray(selectedAppliedScenario?.comparisonScenarios)
        ? selectedAppliedScenario.comparisonScenarios
        : safeInput.comparisonScenarios,
      appliedScenarioCount: appliedScenarios.length,
      appliedScenarios: clonePlainValue(appliedScenarios),
      visibleAppliedScenarios: clonePlainValue(appliedScenarios),
      appliedScenarioKeyItems: getAppliedScenarioKeyItems(appliedScenarios, selectedAppliedScenarioId),
      selectedScenarioId: selectedScenarioId || selectedAppliedScenarioId,
      selectedAppliedScenarioId,
      selectedAppliedScenarioIndex: selected.index,
      selectedAppliedScenario: getAppliedScenarioTrace(selectedAppliedScenario, selected.index)
    };
  }

  function buildAppliedPostDeathSeries(scenarioInput, selectedPostDeathResources) {
    const appliedScenarios = Array.isArray(scenarioInput?.appliedScenarios)
      ? scenarioInput.appliedScenarios
      : [];
    if (!appliedScenarios.length) {
      return [];
    }

    const selectedAppliedScenarioId = normalizeString(
      scenarioInput.selectedAppliedScenarioId || scenarioInput.selectedScenarioId
    );
    const visibleAppliedScenarios = Array.isArray(scenarioInput?.visibleAppliedScenarios)
      && scenarioInput.visibleAppliedScenarios.length
      ? scenarioInput.visibleAppliedScenarios
      : appliedScenarios;
    const seriesRecords = visibleAppliedScenarios
      .map(function (appliedScenario) {
        if (!isPlainObject(appliedScenario) || !isPlainObject(appliedScenario.scenario)) {
          return null;
        }

        const sourceIndex = appliedScenarios.findIndex(function (candidate, index) {
          return getAppliedScenarioId(candidate, index) === getAppliedScenarioId(appliedScenario, index);
        });
        const appliedScenarioIndex = sourceIndex >= 0 ? sourceIndex : 0;
        const scenarioId = getAppliedScenarioId(appliedScenario, appliedScenarioIndex);
        const selected = selectedAppliedScenarioId
          ? scenarioId === selectedAppliedScenarioId
          : appliedScenarioIndex === 0;
        const sourcePath = `appliedScenarios.${appliedScenarioIndex}.scenario.postDeathSeries.points`;
        const points = selected && Array.isArray(selectedPostDeathResources)
          ? selectedPostDeathResources
          : buildSeriesPoints(
            getPath(appliedScenario.scenario, "postDeathSeries.points"),
            "appliedPostDeath",
            ["endingResources", "availableResources"],
            sourcePath
          );

        if (!points.length) {
          return null;
        }

        const scenarioDates = getScenarioDates(appliedScenario.scenario);
        const preDeathContextRawPoints = buildAppliedPreDeathContextPoints(appliedScenario, appliedScenarioIndex, scenarioDates);
        const projectedNetWorthAtDeath = preDeathContextRawPoints.length
          ? toOptionalNumber(preDeathContextRawPoints[preDeathContextRawPoints.length - 1].value)
          : null;
        const survivorResourcesSource = getFirstNumber(appliedScenario.scenario, [
          "deathEvent.resourcesAfterObligations",
          "timelineFacts.resourcesAfterObligations"
        ]);
        const survivorResourcesAtDeath = survivorResourcesSource.value != null
          ? survivorResourcesSource.value
          : getRunwayResourceValue(points[0]);
        const survivorResourcesAtDeathSourcePath = survivorResourcesSource.value != null
          ? `appliedScenarios.${sourceIndex}.scenario.${survivorResourcesSource.sourcePath || "deathEvent.resourcesAfterObligations"}`
          : `${sourcePath}.0`;
        return {
          scenarioId,
          label: getAppliedScenarioLabel(appliedScenario, appliedScenarioIndex),
          selected,
          sourceIndex: appliedScenarioIndex,
          sourcePath,
          deathDate: scenarioDates.deathDate,
          valuationDate: scenarioDates.valuationDate,
          projectionHorizonMonths: scenarioDates.projectionHorizonMonths,
          points,
          preDeathContextRawPoints,
          projectedNetWorthAtDeath,
          survivorResourcesAtDeath,
          survivorResourcesAtDeathSourcePath,
          deathLineLabel: getAppliedScenarioLabel(appliedScenario, appliedScenarioIndex),
          depletion: getDepletionInfo(points, getPath(appliedScenario.scenario, "postDeathSeries.depletion")),
          trace: {
            selectedScenario: selected,
            sourcePath,
            preDeathContextSourcePath: `appliedScenarios.${appliedScenarioIndex}.scenario.preDeathSeries`,
            survivorResourcesAtDeathSourcePath,
            rawDatesPreserved: true
          }
        };
      })
      .filter(Boolean);

    if (!seriesRecords.length) {
      return [];
    }

    const selectedRecords = seriesRecords.filter(function (series) {
      return series.selected === true;
    });
    const comparisonRecords = seriesRecords.filter(function (series) {
      return series.selected !== true;
    });
    const visibleRecords = (selectedRecords.length ? selectedRecords.concat(comparisonRecords) : seriesRecords)
      .slice(0, MAX_VISIBLE_APPLIED_GRAPH_SCENARIOS);

    return visibleRecords.map(function (series, renderIndex) {
      return Object.assign({}, series, {
        pathId: getAppliedScenarioPostDeathPathId(renderIndex),
        preDeathPathId: getAppliedScenarioPreDeathPathId(renderIndex),
        pathMode: "linear",
        preDeathPathMode: "linear",
        scenarioRole: series.selected ? "selected" : "comparison",
        renderIndex
      });
    });
  }

  function getRunwayResourceValue(point) {
    return toOptionalNumber(point?.endingResources ?? point?.value);
  }

  function getRunwayDeficitValue(point) {
    const unmetNeed = toOptionalNumber(point?.accumulatedUnmetNeed);
    if (unmetNeed != null) {
      return Math.max(0, unmetNeed);
    }
    const resourceValue = getRunwayResourceValue(point);
    return resourceValue != null && resourceValue < 0 ? Math.abs(resourceValue) : 0;
  }

  function getRunwayDeficitSource(point) {
    return toOptionalNumber(point?.accumulatedUnmetNeed) != null
      ? "accumulatedUnmetNeed"
      : "signedEndingResources";
  }

  function cloneRunwayPoint(point) {
    return clonePlainValue(point);
  }

  function buildScenarioDeathLineAnchor(series, yDomain, projection) {
    const contextPoints = Array.isArray(series?.preDeathContextPoints) ? series.preDeathContextPoints : [];
    const contextTarget = contextPoints.length ? contextPoints[contextPoints.length - 1] : null;
    const deathValue = toOptionalNumber(
      series?.projectedNetWorthAtDeath
        ?? contextTarget?.value
        ?? series?.points?.[0]?.value
    );
    const deathXRatio = toOptionalNumber(projection?.deathXRatio) ?? DEATH_RELATIVE_DEATH_X_RATIO;
    const deathDate = normalizeDateOnly(projection?.deathDate || series?.deathDate || contextTarget?.date);
    if (deathValue == null || !deathDate) {
      return null;
    }

    return {
      id: `${series.scenarioId || "applied-scenario"}-death-line-anchor`,
      scenarioId: series.scenarioId,
      label: normalizeString(series.deathLineLabel || series.label) || "Applied scenario",
      scenarioRole: series.scenarioRole || null,
      selected: Boolean(series.selected),
      pathId: series.pathId || null,
      preDeathPathId: series.preDeathPathId || null,
      date: deathDate,
      phase: "deathEvent",
      value: deathValue,
      rawValue: deathValue,
      displayedValue: deathValue,
      xRatio: deathXRatio,
      yRatio: getValueRatio(deathValue, yDomain),
      relativeMonthsFromDeath: 0,
      relativeYearsFromDeath: 0,
      sourcePath: contextTarget?.sourcePath || series?.sourcePath || null,
      sourcePaths: Array.isArray(contextTarget?.sourcePaths) ? clonePlainValue(contextTarget.sourcePaths) : [],
      trace: {
        identityAnchor: true,
        displayOnlyScenarioLabel: true,
        preDeathContextDisplayOnly: contextTarget?.trace?.preDeathContextDisplayOnly === true,
        rawDatePreserved: true,
        rawValuePreserved: true,
        deathAlignedToSharedAnchor: true,
        xProjectionMode: projection?.mode || null
      }
    };
  }

  function cloneDeficitPoint(point, yDomain) {
    const cloned = clonePlainValue(point);
    const deficitValue = getRunwayDeficitValue(point);
    const visualMax = Math.max(toOptionalNumber(yDomain?.deficitVisualMax ?? yDomain?.deficitMax) || 1, 1);
    cloned.deficitValue = deficitValue;
    cloned.deficitSource = getRunwayDeficitSource(point);
    cloned.deficitVisualValue = Math.min(deficitValue, visualMax);
    cloned.deficitVisualScaleCapped = deficitValue > visualMax;
    cloned.deficitVisualClipped = cloned.deficitVisualScaleCapped;
    cloned.yRatio = getValueRatio(-deficitValue, yDomain);
    cloned.deficitYRatio = cloned.yRatio;
    cloned.trace = Object.assign({}, isPlainObject(cloned.trace) ? cloned.trace : {}, {
      rawDeficitValuePreserved: true,
      deficitVisualScaleMode: yDomain?.deficitVisualScaleMode || null,
      deficitVisualScaleCapped: cloned.deficitVisualScaleCapped,
      deficitVisualClipped: cloned.deficitVisualClipped
    });
    return cloned;
  }

  function hasSameVisualXRatio(leftPoint, rightPoint) {
    const leftX = toOptionalNumber(leftPoint?.xRatio);
    const rightX = toOptionalNumber(rightPoint?.xRatio);
    return leftX != null && rightX != null && Math.abs(leftX - rightX) <= 0.000001;
  }

  function getZeroCrossingRatio(previousPoint, currentPoint) {
    const previousValue = getRunwayResourceValue(previousPoint);
    const currentValue = getRunwayResourceValue(currentPoint);
    if (previousValue == null || currentValue == null || previousValue <= 0 || currentValue > 0) {
      return null;
    }
    const span = previousValue - currentValue;
    if (span <= 0) {
      return null;
    }
    return Math.max(0, Math.min(1, previousValue / span));
  }

  function interpolateDateOnly(previousPoint, currentPoint, ratio) {
    const previousDate = parseDateOnly(previousPoint?.date);
    const currentDate = parseDateOnly(currentPoint?.date);
    if (!previousDate || !currentDate || ratio == null) {
      return normalizeDateOnly(currentPoint?.date || previousPoint?.date);
    }
    const timestamp = previousDate.getTime() + ((currentDate.getTime() - previousDate.getTime()) * ratio);
    return normalizeDateOnly(new Date(timestamp));
  }

  function interpolateNumber(previousValue, currentValue, ratio) {
    const previousNumber = toOptionalNumber(previousValue);
    const currentNumber = toOptionalNumber(currentValue);
    if (previousNumber == null || currentNumber == null || ratio == null) {
      return currentNumber ?? previousNumber ?? null;
    }
    return previousNumber + ((currentNumber - previousNumber) * ratio);
  }

  function makeZeroCrossingPoint(previousPoint, currentPoint, series, xDomain, yDomain, projection) {
    const ratio = getZeroCrossingRatio(previousPoint, currentPoint);
    const explicitDepletion = isPlainObject(series?.depletion) ? series.depletion : {};
    const explicitDate = normalizeDateOnly(explicitDepletion.date);
    const explicitMonthIndex = toOptionalNumber(explicitDepletion.monthIndex);
    const date = interpolateDateOnly(previousPoint, currentPoint, ratio);
    const monthIndex = interpolateNumber(previousPoint?.monthIndex, currentPoint?.monthIndex, ratio);
    const sourcePaths = [];
    appendUnique(sourcePaths, Array.isArray(previousPoint?.sourcePaths) ? previousPoint.sourcePaths : []);
    appendUnique(sourcePaths, Array.isArray(currentPoint?.sourcePaths) ? currentPoint.sourcePaths : []);
    appendUnique(sourcePaths, Array.isArray(explicitDepletion.sourcePaths) ? explicitDepletion.sourcePaths : []);
    const interpolatedX = interpolateNumber(previousPoint?.xRatio, currentPoint?.xRatio, ratio);
    const relativeMonthsFromDeath = isPlainObject(projection)
      ? getPointRelativeMonthsFromDeath({ date, monthIndex, phase: "postDeath" }, projection, "postDeath")
      : null;
    return {
      id: `${series.pathId || series.scenarioId || "applied-scenario"}-zero-crossing`,
      date,
      monthIndex,
      phase: "postDeath",
      value: 0,
      rawValue: 0,
      displayedValue: 0,
      endingResources: 0,
      availableResources: 0,
      accumulatedUnmetNeed: 0,
      xRatio: getDeathRelativeXRatio(relativeMonthsFromDeath, projection) ?? getDateRatio(date, xDomain) ?? interpolatedX,
      yRatio: getValueRatio(0, yDomain),
      relativeMonthsFromDeath,
      relativeYearsFromDeath: relativeMonthsFromDeath == null ? null : relativeMonthsFromDeath / MONTHS_PER_YEAR,
      sourcePath: `${series.sourcePath}.zeroCrossing`,
      sourcePaths,
      status: "depleted",
      precision: null,
      trace: {
        visualInterpolation: true,
        interpolationKind: "zeroCrossing",
        interpolationReason: "runwayDepletionBoundary",
        explicitDepletionDate: explicitDate || null,
        explicitDepletionMonthIndex: explicitMonthIndex,
        explicitDepletionPreservedAsMetadata: Boolean(explicitDate || explicitMonthIndex != null),
        depletionDateMatchedInterpolatedZeroCrossing: !explicitDate || explicitDate === date,
        depletionMonthMatchedInterpolatedZeroCrossing: explicitMonthIndex == null
          || (monthIndex != null && Math.abs(explicitMonthIndex - monthIndex) <= 0.000001),
        xProjectionMode: isPlainObject(projection) ? projection.mode : null,
        rawDatePreserved: true,
        sourcePointIds: [previousPoint?.id, currentPoint?.id].filter(Boolean)
      }
    };
  }

  function makeSurvivorResourcesAtDeathStartPoint(series, yDomain, projection) {
    const value = toOptionalNumber(series?.survivorResourcesAtDeath);
    const deathDate = normalizeDateOnly(projection?.deathDate || series?.deathDate);
    const deathXRatio = toOptionalNumber(projection?.deathXRatio) ?? DEATH_RELATIVE_DEATH_X_RATIO;
    const postDeathRunwayStartXRatio = toOptionalNumber(projection?.postDeathRunwayStartXRatio)
      ?? toOptionalNumber(projection?.survivorResourcesXRatio)
      ?? deathXRatio;
    if (value == null || !deathDate || deathXRatio == null || postDeathRunwayStartXRatio == null) {
      return null;
    }

    const sourcePath = normalizeString(series?.survivorResourcesAtDeathSourcePath)
      || `${series?.sourcePath || "appliedScenario"}.survivorResourcesAtDeath`;
    return {
      id: `${series?.pathId || series?.scenarioId || "applied-scenario"}-survivor-resources-at-death`,
      date: deathDate,
      monthIndex: 0,
      phase: "deathEvent",
      value,
      rawValue: value,
      displayedValue: value,
      endingResources: value,
      availableResources: value,
      xRatio: postDeathRunwayStartXRatio,
      yRatio: getValueRatio(value, yDomain),
      relativeMonthsFromDeath: 0,
      relativeYearsFromDeath: 0,
      sourcePath,
      sourcePaths: [sourcePath],
      status: "starting-funds-after-conversion",
      precision: "display-context",
      trace: {
        visualStartPoint: true,
        visualInterpolation: true,
        interpolationKind: "survivorResourcesAtDeathStart",
        interpolationReason: "postDeathRunwayStartsAtDeathLine",
        displayRole: "postDeathRunwayStart",
        rawValuesPreserved: true,
        rawDatesPreserved: true,
        rawValuePreserved: true,
        rawDatePreserved: true,
        deathAlignedToSharedAnchor: true,
        deathXRatio,
        postDeathRunwayStartXRatio,
        survivorResourcesXRatio: postDeathRunwayStartXRatio,
        displayXOffsetFromDeathAxis: postDeathRunwayStartXRatio !== deathXRatio,
        xProjectionMode: isPlainObject(projection) ? projection.mode : null,
        noFinancialCalculationChanged: true,
        sourcePointIds: []
      }
    };
  }

  function buildAppliedRunwayScenario(series, xDomain, yDomain, projection) {
    const rawPoints = Array.isArray(series?.rawPoints)
      ? series.rawPoints.map(cloneRunwayPoint)
      : Array.isArray(series?.points)
        ? series.points.map(cloneRunwayPoint)
        : [];
    const renderPoints = Array.isArray(series?.points)
      ? series.points.map(cloneRunwayPoint)
      : [];
    const preDeathContextPoints = Array.isArray(series?.preDeathContextPoints)
      ? series.preDeathContextPoints.map(cloneRunwayPoint)
      : [];
    const projectedNetWorthAtDeath = toOptionalNumber(series?.projectedNetWorthAtDeath);
    const survivorResourcesAtDeath = toOptionalNumber(series?.survivorResourcesAtDeath);
    const survivorResourcesAtDeathPoint = makeSurvivorResourcesAtDeathStartPoint(series, yDomain, projection);
    const deathLineLabel = normalizeString(series?.deathLineLabel || series?.label);
    const preDeathContextTrace = isPlainObject(preDeathContextPoints[0]?.trace) ? preDeathContextPoints[0].trace : {};
    const fundedRunwayPoints = [];
    const deficitPoints = [];
    const runwayLinePoints = [];
    let depletionPoint = null;
    let previousPoint = null;
    let visualInterpolationPointCount = 0;
    let skippedSharedXDeficitPointCount = 0;
    const visualInterpolationKinds = [];

    if (survivorResourcesAtDeathPoint) {
      const survivorValue = getRunwayResourceValue(survivorResourcesAtDeathPoint);
      if (survivorValue != null && survivorValue >= 0) {
        const startPoint = cloneRunwayPoint(survivorResourcesAtDeathPoint);
        fundedRunwayPoints.push(startPoint);
        runwayLinePoints.push(cloneRunwayPoint(survivorResourcesAtDeathPoint));
        previousPoint = survivorResourcesAtDeathPoint;
        visualInterpolationPointCount += 1;
        visualInterpolationKinds.push("survivorResourcesAtDeathStart");
      }
    }

    renderPoints.forEach(function (point) {
      const resourceValue = getRunwayResourceValue(point);
      if (resourceValue == null) {
        previousPoint = point;
        return;
      }

      if (!depletionPoint && resourceValue > 0) {
        fundedRunwayPoints.push(cloneRunwayPoint(point));
        runwayLinePoints.push(cloneRunwayPoint(point));
        previousPoint = point;
        return;
      }

      if (!depletionPoint && resourceValue === 0) {
        depletionPoint = cloneRunwayPoint(point);
        fundedRunwayPoints.push(cloneRunwayPoint(depletionPoint));
        runwayLinePoints.push(cloneRunwayPoint(depletionPoint));
        deficitPoints.push(cloneDeficitPoint(depletionPoint, yDomain));
        previousPoint = point;
        return;
      }

      if (!depletionPoint && resourceValue < 0) {
        depletionPoint = makeZeroCrossingPoint(previousPoint, point, series, xDomain, yDomain, projection);
        visualInterpolationPointCount += 1;
        appendUnique(visualInterpolationKinds, ["zeroCrossing"]);
        fundedRunwayPoints.push(cloneRunwayPoint(depletionPoint));
        deficitPoints.push(cloneDeficitPoint(depletionPoint, yDomain));
        if (!runwayLinePoints.some(function (linePoint) {
          return linePoint?.id && linePoint.id === depletionPoint.id;
        })) {
          runwayLinePoints.push(cloneRunwayPoint(depletionPoint));
        }
      }

      if (depletionPoint) {
        if (
          deficitPoints.length === 1
          && hasSameVisualXRatio(point, depletionPoint)
          && getRunwayDeficitValue(point) > 0
        ) {
          skippedSharedXDeficitPointCount += 1;
        } else {
          deficitPoints.push(cloneDeficitPoint(point, yDomain));
        }
        runwayLinePoints.push(cloneRunwayPoint(point));
      }
      previousPoint = point;
    });

    return {
      scenarioId: series.scenarioId,
      label: series.label,
      selected: Boolean(series.selected),
      pathId: series.pathId,
      preDeathPathId: series.preDeathPathId,
      deathDate: normalizeDateOnly(projection?.deathDate || series.deathDate),
      deathXRatio: toOptionalNumber(projection?.deathXRatio),
      projectedNetWorthAtDeath,
      survivorResourcesAtDeath,
      survivorResourcesAtDeathPoint: survivorResourcesAtDeathPoint ? cloneRunwayPoint(survivorResourcesAtDeathPoint) : null,
      deathLineLabel,
      preDeathContextMode: preDeathContextTrace.preDeathContextMode || null,
      preDeathContextDisplayOnly: preDeathContextTrace.preDeathContextDisplayOnly === true,
      preDeathContextYears: preDeathContextTrace.preDeathContextYears ?? null,
      preDeathContextGrowthSource: preDeathContextTrace.preDeathContextGrowthSource || null,
      rawPoints,
      preDeathContextPoints,
      runwayLinePoints,
      fundedRunwayPoints,
      deficitPoints,
      depletionPoint: depletionPoint ? cloneRunwayPoint(depletionPoint) : null,
      deathLineAnchor: buildScenarioDeathLineAnchor(series, yDomain, projection),
      pathMode: series.pathMode || "linear",
      preDeathPathMode: series.preDeathPathMode || "linear",
      scenarioRole: series.scenarioRole || null,
      trace: {
        rawValuesPreserved: true,
        rawPointCount: rawPoints.length,
        preDeathContextPointCount: preDeathContextPoints.length,
        survivorResourcesAtDeathPreserved: survivorResourcesAtDeath != null,
        survivorResourcesAtDeathSourcePath: normalizeString(series?.survivorResourcesAtDeathSourcePath) || null,
        preDeathContextMode: preDeathContextTrace.preDeathContextMode || null,
        preDeathContextDisplayOnly: preDeathContextTrace.preDeathContextDisplayOnly === true,
        preDeathContextYears: preDeathContextTrace.preDeathContextYears ?? null,
        preDeathContextGrowthSource: preDeathContextTrace.preDeathContextGrowthSource || null,
        projectedNetWorthAtDeathPreserved: projectedNetWorthAtDeath != null,
        deathLineLabelPreserved: Boolean(deathLineLabel),
        depletionDatePreserved: !series.depletion?.date
          || !depletionPoint
          || normalizeDateOnly(depletionPoint.date) === normalizeDateOnly(series.depletion.date),
        visualInterpolationPointCount,
        visualInterpolationKinds,
        runwayLinePointCount: runwayLinePoints.length,
        runwayLineAllowsNegativeValues: runwayLinePoints.some(function (point) {
          const value = getRunwayResourceValue(point);
          return value != null && value < 0;
        }),
        skippedSharedXDeficitPointCount,
        sharedDepletionAnchorForFundedAndDeficit: Boolean(depletionPoint && deficitPoints[0]),
        sourcePath: series.sourcePath,
        rawDatesPreserved: true,
        deathAlignedToSharedAnchor: isPlainObject(projection),
        calculationHorizonPreserved: true,
        xProjectionMode: isPlainObject(projection) ? projection.mode : null,
        graphContractMode: GRAPH_CONTRACT_MODE_SURVIVOR_RUNWAY_COMPARISON
      }
    };
  }

  function buildAppliedRunwayScenarios(appliedSeries, xDomain, yDomain) {
    return (Array.isArray(appliedSeries) ? appliedSeries : []).map(function (series) {
      return buildAppliedRunwayScenario(series, xDomain, yDomain, series?.xProjection);
    });
  }

  function normalizeComparisonPathId(pathId) {
    return LIFESTYLE_COMPARISON_PATH_ID;
  }

  function normalizeComparisonKind(comparisonScenario) {
    return isLifestyleComparisonScenario(comparisonScenario)
      ? LIFESTYLE_COMPARISON_KIND
      : String(comparisonScenario?.kind || "comparison").trim();
  }

  function getComparisonPathMode(comparisonScenario, kind, pathId) {
    return "linear";
  }

  function isCompleteGraphComparison(comparisonScenario, comparisonSeries) {
    const status = String(comparisonScenario?.status || "").trim();
    const kind = String(comparisonSeries?.kind || comparisonScenario?.kind || "").trim();
    if (status && status !== "complete") {
      return false;
    }
    return kind === LIFESTYLE_COMPARISON_KIND
      && isPlainObject(comparisonSeries)
      && Array.isArray(comparisonSeries.points)
      && comparisonSeries.points.length >= 2;
  }

  function isLifestyleComparisonScenario(comparisonScenario) {
    return String(comparisonScenario?.kind || "").trim() === LIFESTYLE_COMPARISON_KIND
      || String(comparisonScenario?.scenarioId || "").trim() === "income-impact-lifestyle-adjusted-comparison"
      || String(comparisonScenario?.pathId || comparisonScenario?.graphPathId || "").trim() === LIFESTYLE_COMPARISON_PATH_ID
      || String(comparisonScenario?.trace?.calculationMethod || "").trim() === "income-impact-lifestyle-comparison-adapter-v1";
  }

  function isNeutralLifestyleComparison(comparisonScenario) {
    const monthlyDelta = toOptionalNumber(comparisonScenario?.trace?.monthlyDelta);
    return isLifestyleComparisonScenario(comparisonScenario)
      && monthlyDelta != null
      && monthlyDelta === 0;
  }

  function getLocalValueExtent(values) {
    const numericValues = values.filter(function (value) {
      return Number.isFinite(value);
    });
    if (!numericValues.length) {
      return null;
    }
    let min = Math.min(...numericValues);
    let max = Math.max(...numericValues);
    if (min === max) {
      const magnitude = Math.max(Math.abs(min), 1);
      const padding = Math.max(magnitude * 0.03, 1);
      return {
        min: min - padding,
        max: max + padding
      };
    }
    const range = max - min;
    const magnitude = Math.max(Math.abs(max), Math.abs(min), 1);
    const padding = Math.max(range * 0.08, magnitude * 0.01, 1);
    return {
      min: min - padding,
      max: max + padding
    };
  }

  function getComparisonEarlyDetailSeries() {
    return null;
  }

  function makeComparisonMarker(input) {
    return {
      id: String(input.id || `${input.scenarioId}-${input.markerType}`),
      scenarioId: String(input.scenarioId || ""),
      kind: "comparison",
      markerType: String(input.markerType || ""),
      label: String(input.label || ""),
      summary: String(input.summary || ""),
      date: normalizeDateOnly(input.date),
      monthIndex: input.monthIndex ?? null,
      value: toOptionalNumber(input.value),
      pathTarget: String(input.pathTarget || ""),
      lane: "comparison",
      positionable: Boolean(normalizeDateOnly(input.date) && toOptionalNumber(input.value) != null),
      sourcePaths: Array.isArray(input.sourcePaths) ? clonePlainValue(input.sourcePaths) : [],
      trace: isPlainObject(input.trace) ? clonePlainValue(input.trace) : {}
    };
  }

  function findPointForDepletion(points, depletion) {
    const depletionDate = normalizeDateOnly(depletion?.depletionDate);
    const depletionMonthIndex = toOptionalNumber(depletion?.depletionMonthIndex ?? depletion?.monthsCovered);
    const byDate = depletionDate
      ? points.find(function (point) { return point.date === depletionDate; })
      : null;
    if (byDate) {
      return byDate;
    }
    if (depletionMonthIndex != null) {
      const byMonth = points.find(function (point) {
        return toOptionalNumber(point.monthIndex) === depletionMonthIndex;
      });
      if (byMonth) {
        return byMonth;
      }
    }
    return null;
  }

  function getDepletionInfo(points, explicitDepletion) {
    const depletion = isPlainObject(explicitDepletion) ? explicitDepletion : {};
    const depletedPoint = findPointForDepletion(points, depletion)
      || points.find(function (point) {
        const value = toOptionalNumber(point.value ?? point.endingResources ?? point.availableResources);
        return value != null && value <= 0;
      });
    const depleted = depletion.depleted === true || Boolean(depletedPoint);
    if (!depleted) {
      return null;
    }
    const date = normalizeDateOnly(depletion.depletionDate) || normalizeDateOnly(depletedPoint?.date);
    if (!date) {
      return null;
    }
    return {
      date,
      monthIndex: toOptionalNumber(depletion.depletionMonthIndex ?? depletion.monthsCovered ?? depletedPoint?.monthIndex),
      value: 0,
      sourcePaths: Array.isArray(depletedPoint?.sourcePaths) ? clonePlainValue(depletedPoint.sourcePaths) : []
    };
  }

  function findSeriesPointForMonth(points, monthIndex) {
    const targetMonth = toOptionalNumber(monthIndex);
    if (targetMonth == null) {
      return null;
    }
    return points.find(function (point) {
      return toOptionalNumber(point.monthIndex) === targetMonth;
    }) || points.find(function (point) {
      const pointMonth = toOptionalNumber(point.monthIndex);
      return pointMonth != null && pointMonth >= targetMonth;
    }) || null;
  }

  function buildComparisonMarkers(comparisonScenarios, comparisonSeries, scenario, basePostDeathResources) {
    return (Array.isArray(comparisonScenarios) ? comparisonScenarios : [])
      .filter(isPlainObject)
      .reduce(function (markers, comparisonScenario, index) {
        const series = comparisonSeries.find(function (candidate) {
          return candidate.sourceIndex === index;
        });
        if (!isCompleteGraphComparison(comparisonScenario, series)) {
          return markers;
        }

        const scenarioId = series.scenarioId;
        const firstPoint = series.points[0];
        const pathTarget = series.pathId || LIFESTYLE_COMPARISON_PATH_ID;
        const reductionsApplied = Array.isArray(comparisonScenario.reductionsApplied)
          ? comparisonScenario.reductionsApplied
          : [];
        const pausesApplied = Array.isArray(comparisonScenario.pausesApplied)
          ? comparisonScenario.pausesApplied
          : [];
        const rawPostDeathSeries = isPlainObject(comparisonScenario.postDeathSeries)
          ? comparisonScenario.postDeathSeries
          : {};
        const comparisonDepletion = getDepletionInfo(
          series.points,
          comparisonScenario.depletion || rawPostDeathSeries.depletion
        );
        const baseDepletion = getDepletionInfo(
          basePostDeathResources,
          getPath(scenario, "postDeathSeries.depletion")
        );
        const accumulatedUnmetNeed = toOptionalNumber(
          comparisonScenario.accumulatedUnmetNeed ?? rawPostDeathSeries.summary?.accumulatedUnmetNeed
        );
        const lastPoint = series.points.at(-1);

        if (isNeutralLifestyleComparison(comparisonScenario)) {
          return markers;
        }

        if (reductionsApplied.length && firstPoint) {
          markers.push(makeComparisonMarker({
            id: `${scenarioId}-comparison-action`,
            scenarioId,
            markerType: "comparisonAction",
            label: "Lifestyle adjustment",
            summary: `${reductionsApplied.length} comparison adjustment${reductionsApplied.length === 1 ? "" : "s"} represented in the lifestyle scenario.`,
            date: firstPoint.date,
            monthIndex: firstPoint.monthIndex,
            value: firstPoint.value,
            pathTarget,
            sourcePaths: [].concat(firstPoint.sourcePaths || [], ["comparisonScenarios.reductionsApplied"]),
            trace: {
              appliedActionCount: reductionsApplied.length,
              timingPolicy: "first-post-death-comparison-point"
            }
          }));
        }

        if (pausesApplied.length && firstPoint) {
          markers.push(makeComparisonMarker({
            id: `${scenarioId}-comparison-pause`,
            scenarioId,
            markerType: "comparisonPause",
            label: "Lifestyle pause",
            summary: `${pausesApplied.length} comparison pause${pausesApplied.length === 1 ? "" : "s"} represented in the lifestyle scenario.`,
            date: firstPoint.date,
            monthIndex: firstPoint.monthIndex,
            value: firstPoint.value,
            pathTarget,
            sourcePaths: [].concat(firstPoint.sourcePaths || [], ["comparisonScenarios.pausesApplied"]),
            trace: {
              appliedActionCount: pausesApplied.length,
              timingPolicy: "first-post-death-comparison-point"
            }
          }));
        }

        if (baseDepletion && !markers.some(function (marker) { return marker.markerType === "baseDepletion"; })) {
          markers.push(makeComparisonMarker({
            id: `${scenarioId}-base-depletion`,
            scenarioId,
            markerType: "baseDepletion",
            label: "Base depletion",
            summary: "Base projection depletion point.",
            date: baseDepletion.date,
            monthIndex: baseDepletion.monthIndex,
            value: baseDepletion.value,
            pathTarget: "postDeathResources",
            sourcePaths: [].concat(baseDepletion.sourcePaths || [], ["scenario.postDeathSeries.depletion"]),
            trace: {
              baseScenarioMutated: false
            }
          }));
        }

        if (comparisonDepletion) {
          markers.push(makeComparisonMarker({
            id: `${scenarioId}-lifestyle-depletion`,
            scenarioId,
            markerType: "lifestyleDepletion",
            label: "Lifestyle depletion",
            summary: "Lifestyle comparison depletion point.",
            date: comparisonDepletion.date,
            monthIndex: comparisonDepletion.monthIndex,
            value: comparisonDepletion.value,
            pathTarget,
            sourcePaths: [].concat(comparisonDepletion.sourcePaths || [], ["comparisonScenarios.depletion"]),
            trace: {
              baseScenarioMutated: false
            }
          }));
        }

        if (comparisonDepletion || (accumulatedUnmetNeed != null && accumulatedUnmetNeed > 0)) {
          const shortfallPoint = comparisonDepletion || lastPoint;
          if (shortfallPoint) {
            markers.push(makeComparisonMarker({
              id: `${scenarioId}-shortfall-remains`,
              scenarioId,
              markerType: "shortfallRemains",
              label: "Shortfall remains",
              summary: "Lifestyle comparison still shows remaining shortfall.",
              date: shortfallPoint.date,
              monthIndex: shortfallPoint.monthIndex,
              value: shortfallPoint.value,
              pathTarget,
              sourcePaths: [].concat(shortfallPoint.sourcePaths || [], ["comparisonScenarios.accumulatedUnmetNeed"]),
              trace: {
                accumulatedUnmetNeed,
                comparisonScenarioDepleted: Boolean(comparisonDepletion)
              }
            }));
          }
        }

        return markers;
      }, []);
  }

  function getScenarioDates(scenario) {
    const scenarioFacts = isPlainObject(scenario?.scenario) ? scenario.scenario : {};
    const deathEvent = isPlainObject(scenario?.deathEvent) ? scenario.deathEvent : {};
    return {
      valuationDate: normalizeDateOnly(scenarioFacts.valuationDate),
      deathDate: normalizeDateOnly(deathEvent.date || scenarioFacts.selectedDeathDate),
      selectedDeathAge: scenarioFacts.selectedDeathAge ?? deathEvent.age ?? null,
      projectionHorizonMonths: toOptionalNumber(scenarioFacts.projectionHorizonMonths)
    };
  }

  function buildDeathTransition(scenario, dates, dataGaps) {
    const deathEvent = isPlainObject(scenario?.deathEvent) ? scenario.deathEvent : {};
    const layer2Resources = isPlainObject(deathEvent?.layer2?.resources) ? deathEvent.layer2.resources : {};
    const stages = [
      {
        id: "assets-before-death",
        label: "Assets before death",
        value: toOptionalNumber(deathEvent.assetsBeforeDeath),
        sourcePath: "deathEvent.assetsBeforeDeath"
      },
      {
        id: "survivor-available-treated-assets",
        label: "Treated assets at death",
        value: toOptionalNumber(deathEvent.survivorAvailableTreatedAssets),
        sourcePath: "deathEvent.survivorAvailableTreatedAssets"
      },
      {
        id: "resources-before-obligations",
        label: "Resources before obligations",
        value: toOptionalNumber(layer2Resources.totalResourcesBeforeObligations),
        sourcePath: "deathEvent.layer2.resources.totalResourcesBeforeObligations"
      },
      {
        id: "resources-after-obligations",
        label: "Resources after obligations",
        value: toOptionalNumber(deathEvent.resourcesAfterObligations),
        sourcePath: "deathEvent.resourcesAfterObligations"
      }
    ].filter(function (stage) {
      return stage.value != null;
    });

    if (!dates.deathDate) {
      dataGaps.push(makeIssue(
        "missing-death-event-date",
        "A selected death date is required to position the death event.",
        ["scenario.scenario.selectedDeathDate", "scenario.deathEvent.date"]
      ));
    }

    if (stages.length < 2) {
      dataGaps.push(makeIssue(
        "missing-death-event-transition-values",
        "Death-event resource values are incomplete, so the transition cannot be fully modeled.",
        ["scenario.deathEvent"]
      ));
    }

    return {
      id: "death-transition",
      date: dates.deathDate,
      age: dates.selectedDeathAge,
      stages: stages.map(function (stage, index) {
        return {
          ...stage,
          date: dates.deathDate,
          phase: "deathEvent",
          sequence: index
        };
      }),
      sourcePaths: [
        "scenario.deathEvent.assetsBeforeDeath",
        "scenario.deathEvent.survivorAvailableTreatedAssets",
        "scenario.deathEvent.layer2.resources.totalResourcesBeforeObligations",
        "scenario.deathEvent.resourcesAfterObligations"
      ]
    };
  }

  function buildCallouts(scenario, dates, preDeathMode) {
    const deathEvent = isPlainObject(scenario?.deathEvent) ? scenario.deathEvent : {};
    const facts = isPlainObject(scenario?.timelineFacts) ? scenario.timelineFacts : {};
    const callouts = [];

    if (preDeathMode === "current-point-only") {
      callouts.push({
        id: "current-age-no-prior-trend",
        label: "Before-death trend",
        value: "No prior modeled trend for current-age death.",
        kind: "text",
        phase: "preDeath",
        sourcePath: "preDeathSeries.mode"
      });
    }

    [
      ["assets-before-death", "Assets before death", deathEvent.assetsBeforeDeath, "deathEvent.assetsBeforeDeath"],
      ["treated-assets-at-death", "Treated assets at death", deathEvent.survivorAvailableTreatedAssets, "deathEvent.survivorAvailableTreatedAssets"],
      ["coverage-added", "Coverage added at death", deathEvent.coverageAdded, "deathEvent.coverageAdded"],
      ["immediate-obligations", "Immediate obligations", deathEvent.immediateObligations, "deathEvent.immediateObligations"],
      ["resources-after-obligations", "Resources after obligations", deathEvent.resourcesAfterObligations, "deathEvent.resourcesAfterObligations"]
    ].forEach(function (entry) {
      if (toOptionalNumber(entry[2]) != null) {
        callouts.push({
          id: entry[0],
          label: entry[1],
          value: toOptionalNumber(entry[2]),
          kind: "currency",
          phase: "deathEvent",
          date: dates.deathDate,
          sourcePath: entry[3]
        });
      }
    });

    callouts.push({
      id: "runway-months-covered",
      label: "Runway covered",
      value: facts.monthsCovered ?? null,
      kind: "months",
      phase: "postDeath",
      sourcePath: "timelineFacts.monthsCovered"
    });

    callouts.push({
      id: "depletion-date",
      label: "Depletion date",
      value: facts.depletionDate || "Not depleted within horizon",
      kind: "dateOrText",
      phase: "postDeath",
      sourcePath: "timelineFacts.depletionDate"
    });

    return callouts;
  }

  function resolveMarkerDate(event, dates) {
    const explicitDate = normalizeDateOnly(event?.date);
    if (explicitDate) {
      return explicitDate;
    }
    const monthIndex = toOptionalNumber(event?.monthIndex);
    const phase = String(event?.phase || "").trim();
    if (phase === "deathEvent" && dates.deathDate) {
      return dates.deathDate;
    }
    if (monthIndex != null && phase === "postDeath" && dates.deathDate) {
      return normalizeDateOnly(addMonths(parseDateOnly(dates.deathDate), monthIndex));
    }
    if (monthIndex != null && phase === "preDeath" && dates.valuationDate) {
      return normalizeDateOnly(addMonths(parseDateOnly(dates.valuationDate), monthIndex));
    }
    return "";
  }

  function resolveMarkerValue(event, scenario) {
    const evidence = Array.isArray(event?.evidence) ? event.evidence : [];
    for (const item of evidence) {
      const evidenceValue = toOptionalNumber(item?.value);
      if (evidenceValue != null && String(item?.path || "").match(/resources|asset|coverage|obligation|need|unmet/i)) {
        return evidenceValue;
      }
    }

    if (event?.phase === "deathEvent") {
      return toOptionalNumber(scenario?.deathEvent?.resourcesAfterObligations);
    }
    if (event?.phase === "postDeath" && event?.ruleId === "survivor-resources-depleted") {
      return 0;
    }
    return null;
  }

  function buildMarkers(events, kind, scenario, dates) {
    return (Array.isArray(events) ? events : [])
      .filter(isPlainObject)
      .map(function (event) {
        const date = resolveMarkerDate(event, dates);
        const value = resolveMarkerValue(event, scenario);
        const positionable = Boolean(date && value != null && event.phase !== "dataQuality");
        return {
          id: String(event.id || event.ruleId || `${kind}-event`),
          ruleId: String(event.ruleId || event.id || ""),
          kind,
          category: String(event.category || ""),
          severity: String(event.severity || ""),
          title: String(event.title || event.markerLabel || "Scenario event"),
          summary: String(event.summary || ""),
          markerLabel: String(event.markerLabel || event.title || ""),
          date,
          monthIndex: event.monthIndex ?? null,
          phase: String(event.phase || ""),
          priority: toOptionalNumber(event.priority) ?? null,
          value,
          positionable,
          evidence: Array.isArray(event.evidence) ? clonePlainValue(event.evidence) : [],
          sourcePaths: Array.isArray(event.sourcePaths) ? clonePlainValue(event.sourcePaths) : [],
          trace: isPlainObject(event.trace) ? clonePlainValue(event.trace) : {}
        };
      });
  }

  function getDateExtent(values, fallbackStart, fallbackEnd) {
    const timestamps = values
      .map(parseDateOnly)
      .filter(function (date) {
        return date && !Number.isNaN(date.getTime());
      })
      .map(function (date) {
        return date.getTime();
      });
    const startDate = parseDateOnly(fallbackStart);
    const endDate = parseDateOnly(fallbackEnd);
    if (startDate && !Number.isNaN(startDate.getTime())) {
      timestamps.push(startDate.getTime());
    }
    if (endDate && !Number.isNaN(endDate.getTime())) {
      timestamps.push(endDate.getTime());
    }
    if (!timestamps.length) {
      const today = new Date(2000, 0, 1);
      return {
        min: today,
        max: addMonths(today, 1)
      };
    }
    const min = new Date(Math.min(...timestamps));
    let max = new Date(Math.max(...timestamps));
    if (max.getTime() <= min.getTime()) {
      max = addMonths(min, 1);
    }
    return { min, max };
  }

  function getValueExtent(values) {
    const numericValues = values.filter(function (value) {
      return Number.isFinite(value);
    });
    numericValues.push(0);
    if (!numericValues.length) {
      return { min: -1, max: 1 };
    }
    let min = Math.min(...numericValues);
    let max = Math.max(...numericValues);
    if (min === max) {
      if (min > 0) {
        min = 0;
      } else if (max < 0) {
        max = 0;
      } else {
        min = -1;
        max = 1;
      }
    }
    const range = max - min;
    const magnitude = Math.max(Math.abs(max), Math.abs(min), 1);
    const padding = Math.max(range * 0.08, magnitude * 0.03);
    return {
      min: min - padding,
      max: max + padding
    };
  }

  function getPositiveRunwayValues(seriesList) {
    return (Array.isArray(seriesList) ? seriesList : [])
      .reduce(function (values, series) {
        if (!isPlainObject(series)) {
          return values;
        }
        const survivorResourcesAtDeath = toOptionalNumber(series.survivorResourcesAtDeath);
        if (survivorResourcesAtDeath != null && survivorResourcesAtDeath > 0) {
          values.push(survivorResourcesAtDeath);
        }
        (Array.isArray(series.points) ? series.points : [])
          .forEach(function (point) {
            const value = getRunwayResourceValue(point);
            if (value != null && value > 0) {
              values.push(value);
            }
          });
        return values;
      }, []);
  }

  function getSelectedRunwaySeries(seriesList) {
    const safeSeries = Array.isArray(seriesList) ? seriesList.filter(isPlainObject) : [];
    return safeSeries.find(function (series) {
      return series.selected;
    }) || safeSeries[0] || null;
  }

  function getSelectedDeficitValues(series) {
    if (!isPlainObject(series) || !Array.isArray(series.points)) {
      return [];
    }
    return series.points
      .map(getRunwayDeficitValue)
      .filter(function (value) {
        return value != null && value > 0;
      });
  }

  function getVisibleDomainPointMonth(point, series) {
    const monthIndex = toOptionalNumber(point?.monthIndex);
    if (monthIndex != null && monthIndex >= 0) {
      return monthIndex;
    }
    const deathDate = normalizeDateOnly(series?.deathDate);
    const pointDate = normalizeDateOnly(point?.date);
    if (deathDate && pointDate) {
      const dateMonth = getApproximateMonthDelta(deathDate, pointDate);
      return dateMonth != null && dateMonth >= 0 ? dateMonth : null;
    }
    return null;
  }

  function makeVisibleDomainBoundaryPoint(previousPoint, currentPoint, series, displayHorizonMonths) {
    const previousMonths = getVisibleDomainPointMonth(previousPoint, series);
    const currentMonths = getVisibleDomainPointMonth(currentPoint, series);
    if (
      displayHorizonMonths == null
      || previousMonths == null
      || currentMonths == null
      || currentMonths === previousMonths
      || displayHorizonMonths < previousMonths
      || displayHorizonMonths > currentMonths
    ) {
      return null;
    }

    const interpolationRatio = (displayHorizonMonths - previousMonths) / (currentMonths - previousMonths);
    const value = interpolateNumber(
      getRunwayResourceValue(previousPoint),
      getRunwayResourceValue(currentPoint),
      interpolationRatio
    );
    if (value == null) {
      return null;
    }
    const deathDate = parseDateOnly(series?.deathDate);
    const accumulatedUnmetNeed = interpolateNumber(
      previousPoint?.accumulatedUnmetNeed ?? 0,
      currentPoint?.accumulatedUnmetNeed,
      interpolationRatio
    );
    const boundaryPoint = Object.assign({}, clonePlainValue(currentPoint), {
      id: `${normalizeString(series?.scenarioId || series?.pathId) || "selected-scenario"}-visible-domain-boundary`,
      date: normalizeDateOnly(addMonths(deathDate, displayHorizonMonths))
        || interpolateDateOnly(previousPoint, currentPoint, interpolationRatio),
      monthIndex: displayHorizonMonths,
      value,
      rawValue: value,
      displayedValue: value,
      endingResources: value,
      availableResources: value,
      trace: Object.assign({}, isPlainObject(currentPoint?.trace) ? currentPoint.trace : {}, {
        visibleWindowDomainBoundary: true,
        displayHorizonMonths,
        sourcePointIds: [previousPoint?.id, currentPoint?.id].filter(Boolean),
        noFinancialCalculationChanged: true
      })
    });
    if (accumulatedUnmetNeed != null) {
      boundaryPoint.accumulatedUnmetNeed = accumulatedUnmetNeed;
    }
    return boundaryPoint;
  }

  function makeVisibleDomainStartPoint(series) {
    const value = toOptionalNumber(series?.survivorResourcesAtDeath);
    const deathDate = normalizeDateOnly(series?.deathDate);
    if (value == null || !deathDate) {
      return null;
    }
    const sourcePath = normalizeString(series?.survivorResourcesAtDeathSourcePath)
      || `${normalizeString(series?.sourcePath) || "selectedScenario"}.survivorResourcesAtDeath`;
    return {
      id: `${normalizeString(series?.scenarioId || series?.pathId) || "selected-scenario"}-visible-domain-start`,
      date: deathDate,
      monthIndex: 0,
      phase: "deathEvent",
      value,
      rawValue: value,
      displayedValue: value,
      endingResources: value,
      availableResources: value,
      sourcePath,
      sourcePaths: [sourcePath],
      trace: {
        visibleWindowDomainStart: true,
        noFinancialCalculationChanged: true
      }
    };
  }

  function getVisibleWindowDomainPoints(series, displayHorizonMonths) {
    const sourcePoints = Array.isArray(series?.points) ? series.points : [];
    const horizonMonths = toOptionalNumber(displayHorizonMonths);
    if (horizonMonths == null || !sourcePoints.length) {
      return sourcePoints.map(cloneRunwayPoint);
    }
    const visiblePoints = [];
    const startPoint = makeVisibleDomainStartPoint(series);
    let previousPoint = startPoint;
    if (startPoint) {
      visiblePoints.push(cloneRunwayPoint(startPoint));
    }
    for (let index = 0; index < sourcePoints.length; index += 1) {
      const point = sourcePoints[index];
      const month = getVisibleDomainPointMonth(point, series);
      if (month == null || month <= horizonMonths) {
        visiblePoints.push(cloneRunwayPoint(point));
        previousPoint = point;
        continue;
      }
      const previousMonth = getVisibleDomainPointMonth(previousPoint, series);
      if (previousPoint && previousMonth != null && previousMonth < horizonMonths) {
        const boundaryPoint = makeVisibleDomainBoundaryPoint(previousPoint, point, series, horizonMonths);
        if (boundaryPoint) {
          visiblePoints.push(boundaryPoint);
        }
      }
      break;
    }
    return visiblePoints;
  }

  function getRunwayValueDomain(input) {
    const appliedSeries = Array.isArray(input?.appliedPostDeathResources) && input.appliedPostDeathResources.length
      ? input.appliedPostDeathResources
      : [{
          scenarioId: "selected-post-death-resources",
          selected: true,
          points: Array.isArray(input?.postDeathResources) ? input.postDeathResources : []
        }];
    const selectedSeries = getSelectedRunwaySeries(appliedSeries);
    const selectedVisibleSeries = selectedSeries
      ? Object.assign({}, selectedSeries, {
          points: getVisibleWindowDomainPoints(selectedSeries, input?.displayHorizonMonths)
        })
      : null;
    const positiveValues = getPositiveRunwayValues(selectedVisibleSeries ? [selectedVisibleSeries] : []);
    const selectedDeficitValues = getSelectedDeficitValues(selectedVisibleSeries);
    const rawPositiveMax = positiveValues.length ? Math.max(...positiveValues) : 0;
    const rawDeficitMax = selectedDeficitValues.length ? Math.max(...selectedDeficitValues) : 0;
    const paddedDomain = getValueExtent([
      rawPositiveMax > 0 ? rawPositiveMax : 0,
      rawDeficitMax > 0 ? -rawDeficitMax : 0
    ]);
    const stableDomain = getStableZeroRatioValueExtent(paddedDomain, STABLE_LAYOUT_FRAME.zeroYRatio);
    const span = stableDomain.max - stableDomain.min;
    const zeroYRatio = span > 0
      ? clampRatio(1 - ((0 - stableDomain.min) / span))
      : 0.5;
    const positiveMax = stableDomain.max;
    const deficitMax = Math.abs(Math.min(stableDomain.min, 0));
    return {
      min: stableDomain.min,
      max: stableDomain.max,
      signed: rawDeficitMax > 0,
      verticalScaleMode: VERTICAL_SCALE_MODE_CONTINUOUS_LINEAR,
      zeroYRatio,
      fundedRunwayHeightRatio: zeroYRatio,
      deficitHeightRatio: 1 - zeroYRatio,
      positiveMax,
      deficitMax,
      deficitVisualMax: rawDeficitMax,
      deficitVisualScaleMode: "continuousLinear",
      deficitVisualScaleCapped: false,
      rawPositiveMax,
      rawDeficitMax,
      visibleDomainPointCount: Array.isArray(selectedVisibleSeries?.points) ? selectedVisibleSeries.points.length : 0,
      visibleDomainBoundaryPointIncluded: Boolean(selectedVisibleSeries?.points?.some(function (point) {
        return point?.trace?.visibleWindowDomainBoundary === true;
      })),
      trace: {
        positiveDomainSource: "selectedAppliedScenarioFundedRunway",
        deficitDomainSource: "selectedAppliedScenarioDeficit",
        yDomainWindowSource: "selectedVisibleDisplayHorizon",
        displayHorizonMonths: toOptionalNumber(input?.displayHorizonMonths),
        negativeValuesCompressFundedRunway: false,
        fixedZeroRatioApplied: true,
        fixedZeroRatio: STABLE_LAYOUT_FRAME.zeroYRatio,
        stableZeroRatioDomainApplied: true,
        continuousLinearScaleApplied: true,
        selectedScenarioOnlyScale: true,
        rawDeficitValuesPreserved: true,
        deficitVisualCompressionRemoved: true
      }
    };
  }

  function getStableZeroRatioValueExtent(domain, zeroYRatio) {
    const safeDomain = isPlainObject(domain) ? domain : {};
    const targetZero = clampRatio(toOptionalNumber(zeroYRatio) ?? STABLE_LAYOUT_FRAME.zeroYRatio);
    const negativeBandRatio = 1 - targetZero;
    const rawMax = Math.max(toOptionalNumber(safeDomain.max) || 0, 1);
    const rawDeficitMax = Math.abs(Math.min(toOptionalNumber(safeDomain.min) || 0, 0));
    if (targetZero <= 0 || negativeBandRatio <= 0) {
      return {
        min: safeDomain.min ?? -1,
        max: safeDomain.max ?? 1
      };
    }
    const maxRequiredByDeficit = rawDeficitMax * (targetZero / negativeBandRatio);
    const max = Math.max(rawMax, maxRequiredByDeficit, 1);
    const min = -(max * (negativeBandRatio / targetZero));
    return {
      min,
      max
    };
  }

  function getDateRatio(dateValue, domain) {
    const date = parseDateOnly(dateValue);
    if (!date || Number.isNaN(date.getTime())) {
      return null;
    }
    const span = domain.max.getTime() - domain.min.getTime();
    if (span <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, (date.getTime() - domain.min.getTime()) / span));
  }

  function clampRatio(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }
    return Math.max(0, Math.min(1, number));
  }

  function clampDisplayHorizonMonths(value) {
    const months = toOptionalNumber(value);
    if (months == null || months <= 0) {
      return DEFAULT_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS;
    }
    return Math.max(
      MIN_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS,
      Math.min(MAX_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS, months)
    );
  }

  function getAdaptiveDisplayHorizonRoundingMonths(value) {
    const months = toOptionalNumber(value);
    if (months == null || months <= 0) {
      return DISPLAY_HORIZON_ROUNDING_MONTHS;
    }
    if (months <= 1) {
      return ONE_DAY_IN_MONTHS;
    }
    if (months <= 3) {
      return ONE_WEEK_IN_MONTHS;
    }
    if (months <= 12) {
      return 1;
    }
    if (months <= 60) {
      return 6;
    }
    if (months <= 180) {
      return MONTHS_PER_YEAR;
    }
    if (months <= 360) {
      return 24;
    }
    return DISPLAY_HORIZON_ROUNDING_MONTHS;
  }

  function roundDisplayHorizonMonths(value, roundingMonths) {
    const months = toOptionalNumber(value);
    if (months == null || months <= 0) {
      return DEFAULT_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS;
    }
    const step = Math.max(toOptionalNumber(roundingMonths) || getAdaptiveDisplayHorizonRoundingMonths(months), ONE_DAY_IN_MONTHS);
    const rounded = Math.ceil(months / step) * step;
    return clampDisplayHorizonMonths(rounded);
  }

  function getPostDepletionDisplayPaddingMonths(depletionMonths) {
    const months = Math.max(toOptionalNumber(depletionMonths) || 0, 0);
    if (months <= 0) {
      return MIN_POST_DEPLETION_DISPLAY_PADDING_MONTHS;
    }
    if (months < 1) {
      return Math.max(
        MIN_POST_DEPLETION_DISPLAY_PADDING_MONTHS,
        Math.min(ONE_WEEK_IN_MONTHS, Math.ceil(months * DAYS_PER_MONTH * 0.5) * ONE_DAY_IN_MONTHS)
      );
    }
    return Math.max(
      MIN_POST_DEPLETION_DISPLAY_PADDING_MONTHS,
      Math.min(
        MAX_POST_DEPLETION_DISPLAY_PADDING_MONTHS,
        Math.ceil(months * ((1 - DEPLETION_RUNWAY_TARGET_X_RATIO) / DEPLETION_RUNWAY_TARGET_X_RATIO))
      )
    );
  }

  function resolveDepletionDrivenDisplayHorizonMonths(depletionMonths) {
    const months = Math.max(toOptionalNumber(depletionMonths) || 0, 0);
    const paddingMonths = getPostDepletionDisplayPaddingMonths(months);
    const targetMonths = months > 0
      ? Math.max(months + paddingMonths, months / DEPLETION_RUNWAY_TARGET_X_RATIO)
      : MIN_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS;
    const roundingMonths = getAdaptiveDisplayHorizonRoundingMonths(targetMonths);
    return {
      displayHorizonMonths: roundDisplayHorizonMonths(targetMonths, roundingMonths),
      postDepletionDisplayPaddingMonths: paddingMonths,
      displayHorizonRoundingMonths: roundingMonths,
      displayHorizonTargetRunwayRatio: DEPLETION_RUNWAY_TARGET_X_RATIO
    };
  }

  function getSeriesPointMonthForDepletion(series, point) {
    const monthIndex = toOptionalNumber(point?.monthIndex);
    if (monthIndex != null && monthIndex >= 0) {
      return monthIndex;
    }
    const deathDate = normalizeDateOnly(series?.deathDate);
    const pointDate = normalizeDateOnly(point?.date);
    if (deathDate && pointDate) {
      const dateMonth = getApproximateMonthDelta(deathDate, pointDate);
      return dateMonth != null && dateMonth >= 0 ? dateMonth : null;
    }
    return null;
  }

  function getSeriesSignedZeroCrossingMonths(series) {
    if (!isPlainObject(series)) {
      return null;
    }
    const points = (Array.isArray(series.points) ? series.points : [])
      .map(function (point) {
        return {
          month: getSeriesPointMonthForDepletion(series, point),
          value: getComparableSeriesPointValue(point)
        };
      })
      .filter(function (point) {
        return point.month != null && point.month >= 0 && point.value != null;
      })
      .sort(function (left, right) {
        return left.month - right.month;
      });
    let previousPoint = null;
    for (const point of points) {
      if (Math.abs(point.value) <= 0.000001) {
        return point.month;
      }
      if (previousPoint && previousPoint.value > 0 && point.value < 0 && point.month > previousPoint.month) {
        const span = previousPoint.value - point.value;
        if (span > 0) {
          return previousPoint.month + ((point.month - previousPoint.month) * (previousPoint.value / span));
        }
      }
      previousPoint = point;
    }
    return null;
  }

  function getSeriesDepletionMonths(series) {
    const signedZeroCrossingMonth = getSeriesSignedZeroCrossingMonths(series);
    if (signedZeroCrossingMonth != null && signedZeroCrossingMonth >= 0) {
      return signedZeroCrossingMonth;
    }
    if (!isPlainObject(series?.depletion)) {
      return null;
    }
    const explicitMonth = toOptionalNumber(series.depletion.monthIndex);
    if (explicitMonth != null && explicitMonth >= 0) {
      return explicitMonth;
    }
    const deathDate = normalizeDateOnly(series.deathDate);
    const depletionDate = normalizeDateOnly(series.depletion.date);
    if (deathDate && depletionDate) {
      const dateMonth = getApproximateMonthDelta(deathDate, depletionDate);
      return dateMonth != null && dateMonth >= 0 ? dateMonth : null;
    }
    return null;
  }

  function getSeriesRunwayEndMonths(series) {
    if (!isPlainObject(series)) {
      return null;
    }
    const points = Array.isArray(series.points) ? series.points : [];
    const pointMonths = points
      .map(function (point) {
        const monthIndex = toOptionalNumber(point?.monthIndex);
        if (monthIndex != null && monthIndex >= 0) {
          return monthIndex;
        }
        const deathDate = normalizeDateOnly(series.deathDate);
        const pointDate = normalizeDateOnly(point?.date);
        if (deathDate && pointDate) {
          const dateMonth = getApproximateMonthDelta(deathDate, pointDate);
          return dateMonth != null && dateMonth >= 0 ? dateMonth : null;
        }
        return null;
      })
      .filter(function (month) {
        return month != null && month >= 0;
      });
    if (pointMonths.length) {
      return Math.max(...pointMonths);
    }
    const projectionHorizonMonths = toOptionalNumber(series.projectionHorizonMonths);
    return projectionHorizonMonths != null && projectionHorizonMonths > 0 ? projectionHorizonMonths : null;
  }

  function resolveDeathRelativeDisplayHorizon(dates, activeSeries) {
    const safeDates = isPlainObject(dates) ? dates : {};
    const calculationHorizonMonths = toOptionalNumber(safeDates.projectionHorizonMonths);
    const fallbackHorizonMonths = clampDisplayHorizonMonths(
      calculationHorizonMonths != null && calculationHorizonMonths > 0
        ? calculationHorizonMonths
        : DEFAULT_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS
    );
    const depletionMonths = (Array.isArray(activeSeries) ? activeSeries : [])
      .map(getSeriesDepletionMonths)
      .filter(function (month) {
        return month != null && month >= 0;
      });
    const latestAppliedScenarioDepletionMonths = depletionMonths.length
      ? Math.max(...depletionMonths)
      : null;
    const runwayEndMonths = (Array.isArray(activeSeries) ? activeSeries : [])
      .map(getSeriesRunwayEndMonths)
      .filter(function (month) {
        return month != null && month >= 0;
      });
    const latestAppliedScenarioRunwayEndMonths = runwayEndMonths.length
      ? Math.max(...runwayEndMonths)
      : null;
    const visibleDepletionMonths = depletionMonths.filter(function (month) {
      return latestAppliedScenarioRunwayEndMonths == null || month <= latestAppliedScenarioRunwayEndMonths;
    });
    const latestVisibleAppliedScenarioDepletionMonths = visibleDepletionMonths.length
      ? Math.max(...visibleDepletionMonths)
      : null;

    if (latestVisibleAppliedScenarioDepletionMonths != null) {
      const horizon = resolveDepletionDrivenDisplayHorizonMonths(latestVisibleAppliedScenarioDepletionMonths);
      return {
        displayHorizonMode: DISPLAY_HORIZON_MODE_AUTO_DEPLETION,
        displayHorizonMonths: horizon.displayHorizonMonths,
        displayHorizonReason: "latest-visible-applied-scenario-depletion",
        calculationHorizonMonths,
        latestAppliedScenarioDepletionMonths,
        latestVisibleAppliedScenarioDepletionMonths,
        latestAppliedScenarioRunwayEndMonths,
        displayHorizonBasis: "latestVisibleAppliedScenarioDepletion",
        postDepletionDisplayPaddingMonths: horizon.postDepletionDisplayPaddingMonths,
        displayHorizonRoundingMonths: horizon.displayHorizonRoundingMonths,
        displayHorizonTargetRunwayRatio: horizon.displayHorizonTargetRunwayRatio,
        displayHorizonAutoSized: true
      };
    }

    const hasBeyondCalculationHorizon = calculationHorizonMonths != null
      && calculationHorizonMonths > 0
      && depletionMonths.some(function (month) {
        return month > calculationHorizonMonths;
      });
    if (latestAppliedScenarioRunwayEndMonths != null) {
      const roundingMonths = getAdaptiveDisplayHorizonRoundingMonths(latestAppliedScenarioRunwayEndMonths);
      return {
        displayHorizonMode: DISPLAY_HORIZON_MODE_AUTO_DEPLETION,
        displayHorizonMonths: roundDisplayHorizonMonths(latestAppliedScenarioRunwayEndMonths, roundingMonths),
        displayHorizonReason: "latest-visible-applied-scenario-runway-end",
        calculationHorizonMonths,
        latestAppliedScenarioDepletionMonths,
        latestVisibleAppliedScenarioDepletionMonths: null,
        latestAppliedScenarioRunwayEndMonths,
        displayHorizonBasis: "latestAppliedScenarioRunwayEnd",
        postDepletionDisplayPaddingMonths: null,
        displayHorizonRoundingMonths: roundingMonths,
        displayHorizonTargetRunwayRatio: null,
        displayHorizonAutoSized: true
      };
    }

    return {
      displayHorizonMode: DISPLAY_HORIZON_MODE_AUTO_DEPLETION,
      displayHorizonMonths: fallbackHorizonMonths,
      displayHorizonReason: hasBeyondCalculationHorizon
        ? "depletion-beyond-calculation-horizon-fallback-to-calculation-horizon"
        : "no-visible-applied-scenario-depletion-fallback-to-calculation-horizon",
      calculationHorizonMonths,
      latestAppliedScenarioDepletionMonths,
      latestVisibleAppliedScenarioDepletionMonths: null,
      latestAppliedScenarioRunwayEndMonths,
      displayHorizonBasis: "calculationHorizonFallback",
      postDepletionDisplayPaddingMonths: null,
      displayHorizonRoundingMonths: getAdaptiveDisplayHorizonRoundingMonths(fallbackHorizonMonths),
      displayHorizonTargetRunwayRatio: null,
      displayHorizonAutoSized: false
    };
  }

  function makeDeathRelativeRunwayProjection(dates, activeSeries) {
    const safeDates = isPlainObject(dates) ? dates : {};
    const displayHorizon = resolveDeathRelativeDisplayHorizon(safeDates, activeSeries);
    const postDeathDisplayHorizonMonths = displayHorizon.displayHorizonMonths;
    const calculationHorizonMonths = displayHorizon.calculationHorizonMonths;
    const deathDate = normalizeDateOnly(safeDates.deathDate);
    const parsedDeathDate = parseDateOnly(deathDate);
    const displayHorizonEndDate = parsedDeathDate
      ? normalizeDateOnly(addRelativeMonths(parsedDeathDate, postDeathDisplayHorizonMonths))
      : "";
    const calculationHorizonEndDate = parsedDeathDate && calculationHorizonMonths != null
      ? normalizeDateOnly(addMonths(parsedDeathDate, calculationHorizonMonths))
      : "";
    const deathXRatio = DEATH_RELATIVE_DEATH_X_RATIO;
    const postDeathRunwayStartXRatio = deathXRatio;
    return {
      mode: PROJECTION_MODE_DEATH_RELATIVE_RUNWAY,
      xAxisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
      deathXRatio,
      survivorResourcesXRatio: postDeathRunwayStartXRatio,
      postDeathRunwayStartXRatio,
      preDeathContextYears: DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS,
      preDeathContextMonths: DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS * MONTHS_PER_YEAR,
      displayHorizonMode: displayHorizon.displayHorizonMode,
      displayHorizonYears: postDeathDisplayHorizonMonths / MONTHS_PER_YEAR,
      displayHorizonMonths: postDeathDisplayHorizonMonths,
      displayHorizonReason: displayHorizon.displayHorizonReason,
      displayHorizonEndDate,
      postDeathDisplayHorizonMonths,
      calculationHorizonMonths,
      calculationHorizonYears: calculationHorizonMonths == null ? null : calculationHorizonMonths / MONTHS_PER_YEAR,
      calculationHorizonEndDate,
      latestAppliedScenarioDepletionMonths: displayHorizon.latestAppliedScenarioDepletionMonths,
      latestVisibleAppliedScenarioDepletionMonths: displayHorizon.latestVisibleAppliedScenarioDepletionMonths,
      latestAppliedScenarioRunwayEndMonths: displayHorizon.latestAppliedScenarioRunwayEndMonths,
      displayHorizonBasis: displayHorizon.displayHorizonBasis,
      postDepletionDisplayPaddingMonths: displayHorizon.postDepletionDisplayPaddingMonths,
      displayHorizonRoundingMonths: displayHorizon.displayHorizonRoundingMonths,
      displayHorizonTargetRunwayRatio: displayHorizon.displayHorizonTargetRunwayRatio,
      deathDate,
      valuationDate: normalizeDateOnly(safeDates.valuationDate),
      trace: {
        rawDatesPreserved: true,
        deathAlignedToSharedAnchor: true,
        calculationHorizonPreserved: true,
        postDeathRunwayStartsAtDeathLine: true,
        displayHorizonAutoSized: displayHorizon.displayHorizonAutoSized,
        displayHorizonTargetRunwayRatio: displayHorizon.displayHorizonTargetRunwayRatio,
        adaptiveDisplayHorizonApplied: true
      }
    };
  }

  function getStableLayoutFrameLineSource(series) {
    if (series?.trace?.layoutFrameLineSource) {
      return normalizeString(series.trace.layoutFrameLineSource);
    }
    if (series?.kind === LIFESTYLE_COMPARISON_KIND || series?.pathId === LIFESTYLE_COMPARISON_PATH_ID) {
      return "manual-lifestyle-comparison-depletion";
    }
    if (series?.scenarioRole === "comparison" || series?.selected === false) {
      return "visible-applied-comparison-depletion";
    }
    if (series?.selected === true) {
      return "selected-scenario-depletion";
    }
    return "current-rendered-scenario-depletion";
  }

  function makeStableLayoutFrameLine(series, fallbackRole) {
    if (!isPlainObject(series)) {
      return null;
    }
    const depletionMonth = getSeriesDepletionMonths(series);
    const runwayEndMonth = getSeriesRunwayEndMonths(series);
    return {
      scenarioId: normalizeString(series.scenarioId || series.pathId || fallbackRole) || fallbackRole,
      label: normalizeString(series.label) || fallbackRole,
      pathId: normalizeString(series.pathId),
      role: normalizeString(series.scenarioRole || fallbackRole),
      selected: series.selected === true,
      depletionMonth,
      runwayEndMonth,
      anchorEligible: depletionMonth != null && depletionMonth >= 0,
      source: getStableLayoutFrameLineSource(series),
      sourcePath: normalizeString(series.sourcePath)
    };
  }

  function buildStableLayoutFrame(input) {
    const selectedSeries = Array.isArray(input?.appliedPostDeathResources) && input.appliedPostDeathResources.length
      ? input.appliedPostDeathResources
      : (isPlainObject(input?.basePostDeathDisplaySeries) ? [input.basePostDeathDisplaySeries] : []);
    const manualComparisonSeries = Array.isArray(input?.comparisonPostDeathResources)
      ? input.comparisonPostDeathResources
      : [];
    const consideredLines = []
      .concat(selectedSeries.map(function (series) {
        return makeStableLayoutFrameLine(series, series?.selected === false ? "applied-comparison" : "selected");
      }))
      .concat(manualComparisonSeries.map(function (series) {
        return makeStableLayoutFrameLine(series, "manual-lifestyle-comparison");
      }))
      .filter(Boolean);
    const depletionAnchors = consideredLines.filter(function (line) {
      return line.anchorEligible === true;
    });
    const zeroCrossingAnchor = depletionAnchors.length
      ? depletionAnchors.reduce(function (winner, line) {
          if (!winner || line.depletionMonth > winner.depletionMonth) {
            return line;
          }
          return winner;
        }, null)
      : null;
    const projectionHorizonMonths = toOptionalNumber(input?.projection?.postDeathDisplayHorizonMonths)
      ?? toOptionalNumber(input?.projection?.displayHorizonMonths)
      ?? toOptionalNumber(input?.dates?.projectionHorizonMonths)
      ?? DEFAULT_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS;
    const anchorDomainMonths = zeroCrossingAnchor
      ? Math.max(
          zeroCrossingAnchor.depletionMonth,
          Math.ceil(zeroCrossingAnchor.depletionMonth / STABLE_LAYOUT_FRAME.runoutAnchorXRatio)
        )
      : projectionHorizonMonths;
    const xDomainMonths = clampDisplayHorizonMonths(anchorDomainMonths);

    return {
      mode: STABLE_LAYOUT_FRAME_MODE,
      plotLeft: STABLE_LAYOUT_FRAME.plotLeft,
      plotRight: STABLE_LAYOUT_FRAME.plotRight,
      plotTop: STABLE_LAYOUT_FRAME.plotTop,
      plotBottom: STABLE_LAYOUT_FRAME.plotBottom,
      deathXRatio: STABLE_LAYOUT_FRAME.deathXRatio,
      zeroYRatio: STABLE_LAYOUT_FRAME.zeroYRatio,
      runoutAnchorXRatio: STABLE_LAYOUT_FRAME.runoutAnchorXRatio,
      negativeSupportBandRatio: STABLE_LAYOUT_FRAME.negativeSupportBandRatio,
      xDomainMonths,
      yDomain: {
        min: input?.yDomain?.min ?? null,
        max: input?.yDomain?.max ?? null,
        signed: input?.yDomain?.signed === true,
        verticalScaleMode: input?.yDomain?.verticalScaleMode || null,
        source: "axes.y"
      },
      zeroCrossingAnchorScenarioId: zeroCrossingAnchor?.scenarioId || null,
      zeroCrossingAnchorMonth: zeroCrossingAnchor?.depletionMonth ?? null,
      zeroCrossingAnchorSource: zeroCrossingAnchor?.source || "projection-horizon",
      trace: {
        source: "income-impact-timeline-graph-model.layoutFrame",
        rendererConsumesLayoutFrame: true,
        frameCoordinatesSource: "income-loss-impact-display layout-frame projection helpers",
        consideredVisibleResourceLines: clonePlainValue(consideredLines),
        consideredLineCount: consideredLines.length,
        depletionAnchorCount: depletionAnchors.length,
        projectionHorizonMonths,
        anchorDomainMonths,
        ratiosStableAcrossScenarios: true,
        manualLifestyleComparisonIncluded: manualComparisonSeries.length > 0,
        appliedComparisonIncluded: selectedSeries.some(function (series) {
          return series?.scenarioRole === "comparison" || series?.selected === false;
        })
      }
    };
  }

  function getGraphViewFramePointMonth(point) {
    if (!isPlainObject(point)) {
      return null;
    }
    const explicitMonth = toOptionalNumber(
      point.relativeMonthsFromDeath ??
        point.monthOffset ??
        point.monthIndex ??
        point.monthsAfterDeath ??
        point.elapsedMonth ??
        point.month
    );
    if (explicitMonth != null) {
      return explicitMonth;
    }
    const relativeYears = toOptionalNumber(point.relativeYearsFromDeath ?? point.relativeYears);
    return relativeYears == null ? null : relativeYears * MONTHS_PER_YEAR;
  }

  function getSelectedAppliedRunwayScenario(appliedRunwayScenarios, selectedScenarioId) {
    const safeScenarios = Array.isArray(appliedRunwayScenarios)
      ? appliedRunwayScenarios.filter(isPlainObject)
      : [];
    const normalizedSelectedScenarioId = normalizeString(selectedScenarioId);
    return safeScenarios.find(function (series) {
      return normalizedSelectedScenarioId && normalizeString(series.scenarioId) === normalizedSelectedScenarioId;
    }) || safeScenarios.find(function (series) {
      return series.selected === true;
    }) || safeScenarios[0] || null;
  }

  function getPostDeathFocusRunwayStartPoint(appliedRunwayScenarios, selectedScenarioId) {
    const selectedSeries = getSelectedAppliedRunwayScenario(appliedRunwayScenarios, selectedScenarioId);
    const runwayLinePoints = Array.isArray(selectedSeries?.runwayLinePoints) ? selectedSeries.runwayLinePoints : [];
    const seriesPoints = Array.isArray(selectedSeries?.points) ? selectedSeries.points : [];
    const candidates = runwayLinePoints.length ? runwayLinePoints : seriesPoints;
    return candidates.find(function (point) {
      return getGraphViewFramePointMonth(point) === 0;
    }) || candidates[0] || selectedSeries?.survivorResourcesAtDeathPoint || null;
  }

  function makePostDeathFocusStartAnchor(appliedRunwayScenarios, selectedScenarioId, layoutFrame) {
    const zeroYRatio = toOptionalNumber(layoutFrame?.zeroYRatio);
    const startPoint = getPostDeathFocusRunwayStartPoint(appliedRunwayScenarios, selectedScenarioId);
    const startValue = getRunwayResourceValue(startPoint);
    if (zeroYRatio == null || startValue == null || startValue <= 0) {
      return null;
    }
    const targetYRatio = Math.max(
      0,
      Math.min(
        POST_DEATH_FOCUS_RUNWAY_START_Y_RATIO,
        Math.max(0, zeroYRatio - POST_DEATH_FOCUS_MIN_ZERO_GAP_RATIO)
      )
    );
    const positiveBandRatio = zeroYRatio - targetYRatio;
    if (positiveBandRatio <= 0.000001) {
      return null;
    }
    return {
      yRatio: targetYRatio,
      value: startValue,
      yDomainMax: startValue * (zeroYRatio / positiveBandRatio),
      month: getGraphViewFramePointMonth(startPoint)
    };
  }

  function makePostDeathFocusLinearYDomain(layoutYDomain, startAnchor, layoutFrame) {
    if (!isPlainObject(layoutYDomain) || !startAnchor) {
      return {
        yDomain: layoutYDomain,
        source: "shared-layout-frame",
        linearScaleApplied: false
      };
    }
    const zeroYRatio = toOptionalNumber(layoutFrame?.zeroYRatio);
    const focusMax = toOptionalNumber(startAnchor.yDomainMax);
    if (zeroYRatio == null || focusMax == null || focusMax <= 0 || zeroYRatio <= 0 || zeroYRatio >= 1) {
      return {
        yDomain: layoutYDomain,
        source: "shared-layout-frame",
        linearScaleApplied: false
      };
    }
    const positiveBandRatio = zeroYRatio;
    const negativeBandRatio = 1 - zeroYRatio;
    return {
      yDomain: Object.assign({}, layoutYDomain, {
        max: focusMax,
        min: -(focusMax * (negativeBandRatio / positiveBandRatio))
      }),
      source: "start-anchor-domain",
      linearScaleApplied: true
    };
  }

  function getPostDeathFocusSelectedZeroAnchor(appliedRunwayScenarios, selectedScenarioId, layoutFrame) {
    const selectedSeries = getSelectedAppliedRunwayScenario(appliedRunwayScenarios, selectedScenarioId);
    const depletionPoint = isPlainObject(selectedSeries?.depletionPoint) ? selectedSeries.depletionPoint : null;
    const zeroMonth = toOptionalNumber(
      depletionPoint?.relativeMonthsFromDeath ??
        depletionPoint?.monthOffset ??
        depletionPoint?.monthIndex
    );
    const runoutAnchorXRatio = toOptionalNumber(layoutFrame?.runoutAnchorXRatio);
    if (!selectedSeries || zeroMonth == null || zeroMonth <= 0 || runoutAnchorXRatio == null || runoutAnchorXRatio <= 0) {
      return null;
    }
    return {
      scenarioId: normalizeString(selectedSeries.scenarioId || selectedScenarioId),
      month: zeroMonth,
      xDomainMonths: zeroMonth / runoutAnchorXRatio,
      runoutAnchorXRatio
    };
  }

  function formatPostDeathFocusXTickLabel(relativeMonths) {
    const months = toOptionalNumber(relativeMonths);
    if (months == null) {
      return "";
    }
    if (months < 1) {
      const days = Math.max(1, Math.round(months * DAYS_PER_MONTH));
      return `+${days} ${days === 1 ? "day" : "days"}`;
    }
    if (months < MONTHS_PER_YEAR) {
      return `+${Math.round(months)} mo`;
    }
    const years = months / MONTHS_PER_YEAR;
    if (Math.abs(years - Math.round(years)) <= 0.000001) {
      const roundedYears = Math.round(years);
      return `+${roundedYears} ${roundedYears === 1 ? "year" : "years"}`;
    }
    return `+${Number(years.toFixed(1))} years`;
  }

  function getPostDeathFocusXTickMonths(displayHorizonMonths) {
    const horizonMonths = Math.max(toOptionalNumber(displayHorizonMonths) || 0, 0);
    if (horizonMonths <= 0) {
      return [];
    }
    let stepMonths;
    if (horizonMonths <= 1) {
      const horizonDays = Math.max(1, Math.round(horizonMonths * DAYS_PER_MONTH));
      const stepDays = horizonDays <= 7 ? 1 : 7;
      stepMonths = stepDays * ONE_DAY_IN_MONTHS;
    } else if (horizonMonths <= 3) {
      stepMonths = ONE_WEEK_IN_MONTHS;
    } else if (horizonMonths <= 12) {
      stepMonths = 1;
    } else if (horizonMonths <= 24) {
      stepMonths = 6;
    } else if (horizonMonths <= 60) {
      stepMonths = MONTHS_PER_YEAR;
    } else if (horizonMonths <= 240) {
      stepMonths = 24;
    } else {
      return [5, 10, 15, 20, 30, 40]
        .map(function (years) { return years * MONTHS_PER_YEAR; })
        .filter(function (months) { return months <= horizonMonths; });
    }
    const ticks = [];
    for (let month = stepMonths; month <= horizonMonths + (stepMonths * 0.001); month += stepMonths) {
      ticks.push(Number(month.toFixed(6)));
    }
    const lastTick = ticks[ticks.length - 1];
    if (Math.abs((lastTick ?? 0) - horizonMonths) > 0.000001) {
      ticks.push(Number(horizonMonths.toFixed(6)));
    }
    return ticks;
  }

  function makePostDeathFocusXTicks(dates, layoutFrame) {
    const deathDate = normalizeDateOnly(dates?.deathDate);
    const parsedDeathDate = parseDateOnly(deathDate);
    const horizonMonths = toOptionalNumber(layoutFrame?.xDomainMonths);
    if (horizonMonths == null || horizonMonths <= 0) {
      return [];
    }
    const ticks = [{
      id: "death",
      key: "death",
      label: "Death",
      date: deathDate,
      xRatio: 0,
      relativeYears: 0,
      relativeMonths: 0,
      axisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
      trace: {
        generatedBy: CALCULATION_METHOD,
        graphViewFrameMode: GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS,
        displayOnlyAxisLabel: true,
        regeneratedForPostDeathFocus: true
      }
    }];
    getPostDeathFocusXTickMonths(horizonMonths).forEach(function (relativeMonths) {
      const tickDate = parsedDeathDate ? addRelativeMonths(parsedDeathDate, relativeMonths) : null;
      ticks.push({
        id: `plus-${relativeMonths}`,
        key: `plus-${relativeMonths}`,
        label: formatPostDeathFocusXTickLabel(relativeMonths),
        date: tickDate ? normalizeDateOnly(tickDate) : "",
        xRatio: 0,
        relativeYears: relativeMonths / MONTHS_PER_YEAR,
        relativeMonths,
        axisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
        trace: {
          generatedBy: CALCULATION_METHOD,
          graphViewFrameMode: GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS,
          displayOnlyAxisLabel: true,
          regeneratedForPostDeathFocus: true
        }
      });
    });
    return ticks;
  }

  function getPostDeathFocusYRatioForValue(value, yDomain, zeroYRatio) {
    const number = toOptionalNumber(value);
    const zeroRatio = toOptionalNumber(zeroYRatio);
    if (number == null || zeroRatio == null) {
      return null;
    }
    if (Math.abs(number) <= 0.000001) {
      return zeroRatio;
    }
    const max = Math.max(toOptionalNumber(yDomain?.max) || 0, 1);
    const min = Math.min(toOptionalNumber(yDomain?.min) || 0, -1);
    if (number > 0) {
      return zeroRatio - ((number / max) * zeroRatio);
    }
    const negativeBandRatio = Math.max(0.000001, 1 - zeroRatio);
    return zeroRatio + ((Math.abs(number) / Math.abs(min)) * negativeBandRatio);
  }

  function makePostDeathFocusYTicks(layoutFrame) {
    const yDomain = isPlainObject(layoutFrame?.yDomain) ? layoutFrame.yDomain : {};
    const max = Math.max(toOptionalNumber(yDomain.max) || 0, 0);
    const deficitMax = Math.abs(Math.min(toOptionalNumber(yDomain.min) || 0, 0));
    const zeroYRatio = toOptionalNumber(layoutFrame?.zeroYRatio);
    const maxMagnitude = Math.max(max, deficitMax);
    const tickStep = getNiceContinuousAxisStep(maxMagnitude, 4);
    const ticks = [];
    if (tickStep > 0 && max > 0) {
      for (let value = tickStep; value <= max + (tickStep * 0.001); value += tickStep) {
        const roundedValue = roundAxisValue(value);
        ticks.push({
          key: `focus-funded-${Math.round(roundedValue)}`,
          zone: "fundedRunway",
          value: roundedValue,
          yRatio: getPostDeathFocusYRatioForValue(roundedValue, yDomain, zeroYRatio),
          trace: {
            generatedBy: CALCULATION_METHOD,
            graphViewFrameMode: GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS,
            regeneratedForPostDeathFocus: true,
            tickStep
          }
        });
      }
    }
    ticks.push({
      key: "focus-zero",
      zone: "zero",
      value: 0,
      yRatio: getPostDeathFocusYRatioForValue(0, yDomain, zeroYRatio),
      baseline: true,
      trace: {
        generatedBy: CALCULATION_METHOD,
        graphViewFrameMode: GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS,
        regeneratedForPostDeathFocus: true,
        tickStep
      }
    });
    if (tickStep > 0 && deficitMax > 0) {
      for (let value = -tickStep; value >= -deficitMax - (tickStep * 0.001); value -= tickStep) {
        const roundedValue = roundAxisValue(value);
        ticks.push({
          key: `focus-deficit-${Math.round(Math.abs(roundedValue))}`,
          zone: "deficit",
          value: roundedValue,
          yRatio: getPostDeathFocusYRatioForValue(roundedValue, yDomain, zeroYRatio),
          trace: {
            generatedBy: CALCULATION_METHOD,
            graphViewFrameMode: GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS,
            regeneratedForPostDeathFocus: true,
            tickStep
          }
        });
      }
    }
    return ticks;
  }

  function makeGraphViewFrame(input) {
    const mode = normalizeString(input?.mode);
    const layoutFrame = isPlainObject(input?.layoutFrame) ? input.layoutFrame : {};
    const xDomainMonths = toOptionalNumber(input?.xDomainMonths ?? layoutFrame.xDomainMonths);
    const zeroYRatio = toOptionalNumber(input?.zeroYRatio ?? layoutFrame.zeroYRatio);
    const deathAnchorXRatio = toOptionalNumber(input?.deathAnchorXRatio ?? layoutFrame.deathXRatio);
    const runoutAnchorXRatio = toOptionalNumber(input?.runoutAnchorXRatio ?? layoutFrame.runoutAnchorXRatio);
    const yDomain = isPlainObject(input?.yDomain)
      ? clonePlainValue(input.yDomain)
      : (isPlainObject(layoutFrame.yDomain) ? clonePlainValue(layoutFrame.yDomain) : {});
    const runoutAnchorMonth = toOptionalNumber(input?.runoutAnchorMonth ?? layoutFrame.zeroCrossingAnchorMonth);
    return {
      mode,
      xDomainMonths,
      yDomain,
      zeroYRatio,
      deathAnchorXRatio,
      runoutAnchorXRatio,
      anchors: {
        death: {
          xRatio: deathAnchorXRatio,
          month: 0
        },
        zero: {
          yRatio: zeroYRatio,
          value: 0
        },
        runout: {
          scenarioId: normalizeString(input?.runoutAnchorScenarioId ?? layoutFrame.zeroCrossingAnchorScenarioId) || null,
          month: runoutAnchorMonth,
          xRatio: toOptionalNumber(input?.runoutAnchorXRatioOverride) ?? runoutAnchorXRatio,
          source: normalizeString(input?.runoutAnchorSource ?? layoutFrame.zeroCrossingAnchorSource) || null
        },
        runwayStart: isPlainObject(input?.runwayStartAnchor) ? clonePlainValue(input.runwayStartAnchor) : null
      },
      xTicks: Array.isArray(input?.xTicks) ? clonePlainValue(input.xTicks) : [],
      yTicks: Array.isArray(input?.yTicks) ? clonePlainValue(input.yTicks) : [],
      trace: Object.assign({
        generatedBy: CALCULATION_METHOD,
        viewFrameOwner: "graph-model",
        graphViewFrameMode: mode
      }, isPlainObject(input?.trace) ? clonePlainValue(input.trace) : {})
    };
  }

  function buildIncomeImpactGraphViewFrames(input) {
    const layoutFrame = isPlainObject(input?.layoutFrame) ? input.layoutFrame : null;
    const axes = isPlainObject(input?.axes) ? input.axes : {};
    if (!layoutFrame) {
      return {
        viewFrames: {},
        selectedViewFrameMode: null,
        activeViewFrame: null
      };
    }
    const selectedScenarioId = normalizeString(input?.selectedScenarioId);
    const focusStartAnchor = makePostDeathFocusStartAnchor(input?.appliedRunwayScenarios, selectedScenarioId, layoutFrame);
    const selectedZeroAnchor = getPostDeathFocusSelectedZeroAnchor(input?.appliedRunwayScenarios, selectedScenarioId, layoutFrame);
    const focusYDomain = focusStartAnchor
      ? makePostDeathFocusLinearYDomain(layoutFrame.yDomain, focusStartAnchor, layoutFrame)
      : {
        yDomain: layoutFrame.yDomain,
        source: "shared-layout-frame",
        linearScaleApplied: false
      };
    const focusedFrameSeed = Object.assign({}, layoutFrame, {
      deathXRatio: 0,
      xDomainMonths: selectedZeroAnchor?.xDomainMonths ?? layoutFrame.xDomainMonths,
      zeroCrossingAnchorScenarioId: selectedZeroAnchor?.scenarioId || layoutFrame.zeroCrossingAnchorScenarioId,
      zeroCrossingAnchorMonth: selectedZeroAnchor?.month ?? layoutFrame.zeroCrossingAnchorMonth,
      zeroCrossingAnchorSource: selectedZeroAnchor ? "post-death-focus-selected-depletion" : layoutFrame.zeroCrossingAnchorSource,
      postDeathFocusStartYRatio: focusStartAnchor?.yRatio ?? null,
      postDeathFocusStartValue: focusStartAnchor?.value ?? null,
      yDomain: focusYDomain.yDomain
    });
    const deathLeadUp = makeGraphViewFrame({
      mode: GRAPH_VIEW_FRAME_MODE_DEATH_LEAD_UP,
      layoutFrame,
      xTicks: axes.x?.ticks,
      yTicks: axes.y?.ticks,
      runoutAnchorMonth: layoutFrame.zeroCrossingAnchorMonth,
      runoutAnchorScenarioId: layoutFrame.zeroCrossingAnchorScenarioId,
      runoutAnchorSource: layoutFrame.zeroCrossingAnchorSource,
      trace: {
        source: "stable-layout-frame",
        rendererShouldUseViewFrame: true,
        preservesPreDeathLeadUp: true
      }
    });
    const focused = makeGraphViewFrame({
      mode: GRAPH_VIEW_FRAME_MODE_POST_DEATH_FOCUS,
      layoutFrame: focusedFrameSeed,
      xTicks: makePostDeathFocusXTicks(input?.dates, focusedFrameSeed),
      yTicks: makePostDeathFocusYTicks(focusedFrameSeed),
      runoutAnchorMonth: focusedFrameSeed.zeroCrossingAnchorMonth,
      runoutAnchorScenarioId: focusedFrameSeed.zeroCrossingAnchorScenarioId,
      runoutAnchorSource: focusedFrameSeed.zeroCrossingAnchorSource,
      runwayStartAnchor: focusStartAnchor,
      trace: {
        source: "post-death-focus-view-frame",
        rendererShouldUseViewFrame: true,
        fullLeadUpDeathXRatio: toOptionalNumber(layoutFrame.deathXRatio),
        postDeathFocusStartAnchorYRatio: focusStartAnchor?.yRatio ?? null,
        postDeathFocusStartAnchorValue: focusStartAnchor?.value ?? null,
        postDeathFocusStartAnchorMonth: focusStartAnchor?.month ?? null,
        postDeathFocusYDomainMax: toOptionalNumber(focusYDomain.yDomain?.max),
        postDeathFocusYDomainMin: toOptionalNumber(focusYDomain.yDomain?.min),
        postDeathFocusYDomainSource: focusYDomain.source,
        postDeathFocusLinearYScaleApplied: focusYDomain.linearScaleApplied === true,
        postDeathFocusSelectedZeroAnchorScenarioId: selectedZeroAnchor?.scenarioId || null,
        postDeathFocusSelectedZeroAnchorMonth: selectedZeroAnchor?.month ?? null,
        postDeathFocusSelectedXDomainMonths: selectedZeroAnchor?.xDomainMonths ?? null,
        postDeathFocusSelectedRunoutAnchorXRatio: selectedZeroAnchor?.runoutAnchorXRatio ?? null,
        postDeathFocusXDomainSource: selectedZeroAnchor ? "selected-scenario-zero-crossing" : "shared-layout-frame"
      }
    });
    return {
      viewFrames: {
        focused,
        postDeathFocus: focused,
        deathLeadUp
      },
      selectedViewFrameMode: GRAPH_VIEW_FRAME_MODE_DEATH_LEAD_UP,
      activeViewFrame: deathLeadUp
    };
  }

  function getDeathRelativeXRatio(relativeMonths, projection) {
    const months = toOptionalNumber(relativeMonths);
    if (months == null || !isPlainObject(projection)) {
      return null;
    }
    const deathXRatio = toOptionalNumber(projection.deathXRatio) ?? DEATH_RELATIVE_DEATH_X_RATIO;
    if (months < 0) {
      const preDeathMonths = Math.max(
        toOptionalNumber(projection.preDeathContextMonths) || (DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS * MONTHS_PER_YEAR),
        1
      );
      return clampRatio(deathXRatio - (Math.min(Math.abs(months), preDeathMonths) / preDeathMonths * deathXRatio));
    }
    const postDeathMonths = Math.max(
      toOptionalNumber(projection.postDeathDisplayHorizonMonths) || DEFAULT_DEATH_RELATIVE_DISPLAY_HORIZON_MONTHS,
      1
    );
    const postDeathRunwayStartXRatio = toOptionalNumber(projection.postDeathRunwayStartXRatio)
      ?? toOptionalNumber(projection.survivorResourcesXRatio)
      ?? deathXRatio;
    return clampRatio(
      postDeathRunwayStartXRatio
        + (Math.min(months, postDeathMonths) / postDeathMonths * (1 - postDeathRunwayStartXRatio))
    );
  }

  function getPointRelativeMonthsFromDeath(point, projection, phaseFallback) {
    if (!isPlainObject(point) || !isPlainObject(projection)) {
      return null;
    }
    const phase = normalizeString(point.phase || phaseFallback);
    const pointMonthIndex = toOptionalNumber(point.monthIndex);
    if (phase === "deathEvent") {
      return 0;
    }
    if (phase === "postDeath" || phase === "appliedPostDeath") {
      if (pointMonthIndex != null) {
        return pointMonthIndex;
      }
    }
    const deathDate = normalizeDateOnly(projection.deathDate);
    const pointDate = normalizeDateOnly(point.date);
    if (deathDate && pointDate) {
      return getApproximateMonthDelta(deathDate, pointDate);
    }
    return pointMonthIndex;
  }

  function getPreDeathContextWindowPoints(points, projection) {
    const contextMonths = Math.max(
      toOptionalNumber(projection?.preDeathContextMonths) || (DEATH_RELATIVE_PRE_DEATH_CONTEXT_YEARS * MONTHS_PER_YEAR),
      1
    );
    return (Array.isArray(points) ? points : []).filter(function (point) {
      const relativeMonths = toOptionalNumber(point?.relativeMonthsFromDeath);
      return relativeMonths == null || relativeMonths >= -contextMonths;
    });
  }

  function getValueRatio(value, domain) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }
    const span = domain.max - domain.min;
    if (span <= 0) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, 1 - ((number - domain.min) / span)));
  }

  function enrichPoint(point, xDomain, yDomain, projection, phaseFallback) {
    const phase = normalizeString(point?.phase || phaseFallback);
    const relativeMonthsFromDeath = isPlainObject(projection)
      ? getPointRelativeMonthsFromDeath(point, projection, phaseFallback)
      : null;
    const projectedXRatio = isPlainObject(projection)
      ? (phase === "deathEvent"
        ? (toOptionalNumber(projection.deathXRatio) ?? DEATH_RELATIVE_DEATH_X_RATIO)
        : getDeathRelativeXRatio(relativeMonthsFromDeath, projection))
      : null;
    const enriched = {
      ...point,
      xRatio: projectedXRatio ?? getDateRatio(point.date, xDomain),
      yRatio: getValueRatio(point.value, yDomain)
    };
    if (relativeMonthsFromDeath != null) {
      const pointTrace = isPlainObject(point.trace) ? point.trace : {};
      enriched.relativeMonthsFromDeath = relativeMonthsFromDeath;
      enriched.relativeYearsFromDeath = relativeMonthsFromDeath / MONTHS_PER_YEAR;
      enriched.trace = Object.assign({}, pointTrace, {
        xProjectionMode: PROJECTION_MODE_DEATH_RELATIVE_RUNWAY,
        rawDatePreserved: pointTrace.rawDatePreserved === false ? false : true,
        rawValuePreserved: pointTrace.rawValuePreserved === false ? false : true
      });
    }
    return enriched;
  }

  function getPostDeathRenderableMonth(point) {
    const relativeMonths = toOptionalNumber(point?.relativeMonthsFromDeath);
    if (relativeMonths != null) {
      return relativeMonths;
    }
    return toOptionalNumber(point?.monthIndex);
  }

  function makeDisplayHorizonClipPoint(previousPoint, currentPoint, yDomain, projection, sourcePath) {
    const displayHorizonMonths = toOptionalNumber(projection?.postDeathDisplayHorizonMonths);
    const previousMonths = getPostDeathRenderableMonth(previousPoint);
    const currentMonths = getPostDeathRenderableMonth(currentPoint);
    if (
      displayHorizonMonths == null
      || previousMonths == null
      || currentMonths == null
      || currentMonths === previousMonths
      || displayHorizonMonths < previousMonths
      || displayHorizonMonths > currentMonths
    ) {
      return null;
    }

    const interpolationRatio = (displayHorizonMonths - previousMonths) / (currentMonths - previousMonths);
    const value = interpolateNumber(
      getRunwayResourceValue(previousPoint),
      getRunwayResourceValue(currentPoint),
      interpolationRatio
    );
    if (value == null) {
      return null;
    }

    const deathDate = parseDateOnly(projection?.deathDate);
    const date = normalizeDateOnly(addMonths(deathDate, displayHorizonMonths))
      || interpolateDateOnly(previousPoint, currentPoint, interpolationRatio);
    const accumulatedUnmetNeed = interpolateNumber(
      previousPoint?.accumulatedUnmetNeed,
      currentPoint?.accumulatedUnmetNeed,
      interpolationRatio
    );
    const availableResources = interpolateNumber(
      previousPoint?.availableResources,
      currentPoint?.availableResources,
      interpolationRatio
    );
    const sourcePaths = []
      .concat(Array.isArray(previousPoint?.sourcePaths) ? previousPoint.sourcePaths : [])
      .concat(Array.isArray(currentPoint?.sourcePaths) ? currentPoint.sourcePaths : []);

    const clippedPoint = Object.assign({}, clonePlainValue(currentPoint), {
      id: `${normalizeString(sourcePath) || "postDeathSeries"}.displayHorizonClip`,
      date,
      monthIndex: displayHorizonMonths,
      phase: currentPoint?.phase || previousPoint?.phase || "postDeath",
      value,
      rawValue: value,
      displayedValue: value,
      endingResources: value,
      availableResources: availableResources ?? value,
      xRatio: getDeathRelativeXRatio(displayHorizonMonths, projection),
      yRatio: getValueRatio(value, yDomain),
      relativeMonthsFromDeath: displayHorizonMonths,
      relativeYearsFromDeath: displayHorizonMonths / MONTHS_PER_YEAR,
      sourcePath: `${normalizeString(sourcePath) || "postDeathSeries"}.displayHorizonClip`,
      sourcePaths,
      status: currentPoint?.status || "display-horizon-clip",
      precision: "visual-interpolation",
      trace: Object.assign(
        {},
        isPlainObject(currentPoint?.trace) ? currentPoint.trace : {},
        {
          visualInterpolation: true,
          interpolationKind: "displayHorizonClip",
          displayHorizonClip: true,
          displayHorizonMonths,
          displayHorizonClippedAtGraphBoundary: true,
          rawSourcePointsPreserved: true,
          rawDatesPreserved: true,
          rawValuesPreserved: true,
          noFinancialCalculationChanged: true,
          sourcePointIds: [previousPoint?.id, currentPoint?.id].filter(Boolean),
          sourceRelativeMonths: [previousMonths, currentMonths]
        }
      )
    });

    if (accumulatedUnmetNeed != null) {
      clippedPoint.accumulatedUnmetNeed = accumulatedUnmetNeed;
    }
    return clippedPoint;
  }

  function clipPostDeathPointsToDisplayHorizon(points, yDomain, projection, sourcePath, startBoundaryPoint) {
    const sourcePoints = Array.isArray(points) ? points : [];
    const displayHorizonMonths = toOptionalNumber(projection?.postDeathDisplayHorizonMonths);
    if (displayHorizonMonths == null || !sourcePoints.length) {
      return {
        points: sourcePoints.map(cloneRunwayPoint),
        clipped: false,
        clippedPointCount: 0,
        interpolationPointAdded: false
      };
    }

    const renderPoints = [];
    let previousPoint = isPlainObject(startBoundaryPoint) ? startBoundaryPoint : null;
    let clippedPointCount = 0;
    let interpolationPointAdded = false;
    for (let index = 0; index < sourcePoints.length; index += 1) {
      const point = sourcePoints[index];
      const relativeMonths = getPostDeathRenderableMonth(point);
      if (relativeMonths == null || relativeMonths <= displayHorizonMonths) {
        renderPoints.push(cloneRunwayPoint(point));
        previousPoint = point;
        continue;
      }

      clippedPointCount = sourcePoints.length - index;
      const previousMonths = getPostDeathRenderableMonth(previousPoint);
      if (previousPoint && previousMonths != null && previousMonths <= displayHorizonMonths) {
        const clipPoint = makeDisplayHorizonClipPoint(previousPoint, point, yDomain, projection, sourcePath);
        if (clipPoint) {
          renderPoints.push(clipPoint);
          interpolationPointAdded = true;
        }
      }
      break;
    }

    return {
      points: renderPoints,
      clipped: clippedPointCount > 0,
      clippedPointCount,
      interpolationPointAdded
    };
  }

  function makeContinuousLinearYTicks(domain) {
    const ticks = [];
    const positiveMax = Math.max(toOptionalNumber(domain?.max) || 0, 0);
    const deficitMax = Math.abs(Math.min(toOptionalNumber(domain?.min) || 0, 0));
    const rawDeficitMax = toOptionalNumber(domain?.rawDeficitMax) || 0;
    const axisStep = getContinuousLinearAxisStep(domain);
    const tickStep = getContinuousLinearRenderedTickStep(domain, axisStep);

    if (tickStep > 0 && positiveMax > 0) {
      for (let value = tickStep; value <= positiveMax + (tickStep * 0.001); value += tickStep) {
        const roundedValue = roundAxisValue(value);
        ticks.push({
          key: `funded-runway-${Math.round(roundedValue)}`,
          zone: "fundedRunway",
          value: roundedValue,
          yRatio: getValueRatio(roundedValue, domain),
          trace: {
            tickStep,
            axisResolutionStep: axisStep,
            incrementIndex: Math.round(roundedValue / tickStep),
            sharedPositiveNegativeIncrement: true
          }
        });
      }
    }
    ticks.push({
      key: "zero",
      zone: "zero",
      value: 0,
      yRatio: getValueRatio(0, domain),
      baseline: true
    });
    if (tickStep > 0 && deficitMax > 0 && rawDeficitMax > 0) {
      for (let value = -tickStep; value >= -deficitMax - (tickStep * 0.001); value -= tickStep) {
        const roundedValue = roundAxisValue(value);
        ticks.push({
          key: `deficit-${Math.round(Math.abs(roundedValue))}`,
          zone: "deficit",
          value: roundedValue,
          rawValue: Math.abs(Math.abs(roundedValue) - rawDeficitMax) <= tickStep * 0.5
            ? -rawDeficitMax
            : null,
          yRatio: getValueRatio(roundedValue, domain),
          trace: {
            tickStep,
            axisResolutionStep: axisStep,
            incrementIndex: Math.round(Math.abs(roundedValue) / tickStep),
            sharedPositiveNegativeIncrement: true,
            rawDeficitMax,
            deficitVisualScaleCapped: false,
            continuousLinearScaleApplied: true
          }
        });
      }
    }
    return ticks;
  }

  function getNiceContinuousAxisStep(maxMagnitude, targetSteps) {
    const magnitude = toOptionalNumber(maxMagnitude);
    const steps = Math.max(1, Math.floor(toOptionalNumber(targetSteps) || 4));
    if (magnitude == null || magnitude <= 0) {
      return 0;
    }
    const roughStep = magnitude / steps;
    const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / power;
    const niceFactor = normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10;
    return roundAxisValue(niceFactor * power);
  }

  function getContinuousLinearAxisStep(domain) {
    const maxMagnitude = Math.max(
      Math.max(toOptionalNumber(domain?.max) || 0, 0),
      Math.abs(Math.min(toOptionalNumber(domain?.min) || 0, 0))
    );
    const rawMagnitude = Math.max(
      Math.max(toOptionalNumber(domain?.rawPositiveMax) || 0, 0),
      Math.max(toOptionalNumber(domain?.rawDeficitMax) || 0, 0)
    );
    if (rawMagnitude > 0 && rawMagnitude <= SMALL_RUNWAY_AXIS_MAX_MAGNITUDE) {
      return MIN_SMALL_RUNWAY_AXIS_STEP;
    }
    return getNiceContinuousAxisStep(maxMagnitude, 4);
  }

  function getContinuousLinearRenderedTickStep(domain, axisStep) {
    const resolutionStep = toOptionalNumber(axisStep) || 0;
    const maxMagnitude = Math.max(
      Math.max(toOptionalNumber(domain?.max) || 0, 0),
      Math.abs(Math.min(toOptionalNumber(domain?.min) || 0, 0))
    );
    const majorStep = getNiceContinuousAxisStep(maxMagnitude, 4);
    return Math.max(resolutionStep, majorStep);
  }

  function roundAxisValue(value) {
    const number = toOptionalNumber(value);
    return number == null ? 0 : Math.round(number * 100) / 100;
  }

  function makeYTicks(domain) {
    if (domain?.verticalScaleMode === VERTICAL_SCALE_MODE_CONTINUOUS_LINEAR) {
      return makeContinuousLinearYTicks(domain);
    }
    const ticks = [];
    const count = 5;
    const step = (domain.max - domain.min) / (count - 1);
    for (let index = 0; index < count; index += 1) {
      const value = domain.min + (step * index);
      ticks.push({
        value,
        yRatio: getValueRatio(value, domain)
      });
    }
    if (domain.min < 0 && domain.max > 0 && !ticks.some(function (tick) { return Math.abs(tick.value) < 1e-6; })) {
      ticks.push({
        value: 0,
        yRatio: getValueRatio(0, domain),
        baseline: true
      });
    }
    return ticks.sort(function (left, right) {
      return left.value - right.value;
    });
  }

  function dateIsBefore(left, right) {
    const leftDate = parseDateOnly(left);
    const rightDate = parseDateOnly(right);
    return Boolean(leftDate && rightDate && leftDate.getTime() < rightDate.getTime());
  }

  function dateIsWithinDomain(date, xDomain) {
    const parsedDate = parseDateOnly(date);
    const domainMin = parseDateOnly(xDomain?.min);
    const domainMax = parseDateOnly(xDomain?.max);
    if (!parsedDate || !domainMin || !domainMax) {
      return false;
    }
    return parsedDate.getTime() >= domainMin.getTime()
      && parsedDate.getTime() <= domainMax.getTime();
  }

  function createDeathRelativeXTick(input, xDomain, projection) {
    const date = normalizeDateOnly(input.date);
    if (!date || (!isPlainObject(projection) && !dateIsWithinDomain(date, xDomain))) {
      return null;
    }

    const relativeYears = toOptionalNumber(input.relativeYears);
    const relativeMonths = relativeYears == null ? null : relativeYears * MONTHS_PER_YEAR;
    const xRatio = isPlainObject(projection)
      ? (relativeMonths === 0
        ? (toOptionalNumber(projection.deathXRatio) ?? DEATH_RELATIVE_DEATH_X_RATIO)
        : getDeathRelativeXRatio(relativeMonths ?? -projection.preDeathContextMonths, projection))
      : getDateRatio(date, xDomain);
    return {
      id: input.id,
      key: input.id,
      label: input.label,
      date,
      xRatio,
      relativeYears,
      relativeMonths,
      axisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
      trace: {
        displayOnlyAxisLabel: true,
        rawDatePreserved: true,
        projectionMode: isPlainObject(projection) ? projection.mode : null
      }
    };
  }

  function formatRelativeXTickLabel(relativeMonths) {
    const months = toOptionalNumber(relativeMonths);
    if (months == null) {
      return "";
    }
    if (months < 1) {
      const days = Math.max(1, Math.round(months * DAYS_PER_MONTH));
      return `+${days} ${days === 1 ? "day" : "days"}`;
    }
    if (months < MONTHS_PER_YEAR) {
      return `+${Math.round(months)} mo`;
    }
    const years = months / MONTHS_PER_YEAR;
    if (Math.abs(years - Math.round(years)) <= 0.000001) {
      const roundedYears = Math.round(years);
      return `+${roundedYears} ${roundedYears === 1 ? "year" : "years"}`;
    }
    return `+${Number(years.toFixed(1))} years`;
  }

  function getDeathRelativeXTickMonths(displayHorizonMonths) {
    const horizonMonths = Math.max(toOptionalNumber(displayHorizonMonths) || 0, 0);
    if (horizonMonths <= 0) {
      return DEATH_RELATIVE_X_TICK_YEARS.map(function (years) {
        return years * MONTHS_PER_YEAR;
      });
    }

    let stepMonths;
    if (horizonMonths <= 1) {
      const horizonDays = Math.max(1, Math.round(horizonMonths * DAYS_PER_MONTH));
      const stepDays = horizonDays <= 7 ? 1 : 7;
      stepMonths = stepDays * ONE_DAY_IN_MONTHS;
    } else if (horizonMonths <= 3) {
      stepMonths = ONE_WEEK_IN_MONTHS;
    } else if (horizonMonths <= 12) {
      stepMonths = 1;
    } else if (horizonMonths <= 24) {
      stepMonths = 6;
    } else if (horizonMonths <= 60) {
      stepMonths = MONTHS_PER_YEAR;
    } else if (horizonMonths <= 240) {
      stepMonths = 24;
    } else {
      return DEATH_RELATIVE_X_TICK_YEARS
        .map(function (years) {
          return years * MONTHS_PER_YEAR;
        })
        .filter(function (months) {
          return months <= horizonMonths;
        });
    }

    const ticks = [];
    for (let month = stepMonths; month <= horizonMonths; month += stepMonths) {
      ticks.push(Number(month.toFixed(6)));
    }
    const lastTick = ticks[ticks.length - 1];
    if (horizonMonths > 0 && (lastTick == null || Math.abs(lastTick - horizonMonths) > 0.000001)) {
      ticks.push(horizonMonths);
    }
    return ticks;
  }

  function makeXTicks(dates, xDomain, projection) {
    const deathDate = normalizeDateOnly(dates.deathDate);
    if (!deathDate || !parseDateOnly(deathDate)) {
      return [];
    }

    const ticks = [];
    const domainStart = normalizeDateOnly(xDomain.min);
    if (domainStart && dateIsBefore(domainStart, deathDate)) {
      const preDeathTick = createDeathRelativeXTick({
        id: "before-death",
        label: "Before death",
        date: domainStart,
        relativeYears: null
      }, xDomain, projection);
      if (preDeathTick) {
        ticks.push(preDeathTick);
      }
    }

    const deathTick = createDeathRelativeXTick({
      id: "death",
      label: "Death",
      date: deathDate,
      relativeYears: 0
    }, xDomain, projection);
    if (deathTick) {
      ticks.push(deathTick);
    }

    const parsedDeathDate = parseDateOnly(deathDate);
    const displayHorizonMonths = isPlainObject(projection)
      ? toOptionalNumber(projection.postDeathDisplayHorizonMonths)
      : null;
    getDeathRelativeXTickMonths(displayHorizonMonths).forEach(function (relativeMonths) {
      if (displayHorizonMonths != null && relativeMonths > displayHorizonMonths) {
        return;
      }
      const tickDate = addRelativeMonths(parsedDeathDate, relativeMonths);
      const tick = createDeathRelativeXTick({
        id: `plus-${relativeMonths}`,
        label: formatRelativeXTickLabel(relativeMonths),
        date: tickDate,
        relativeYears: relativeMonths / MONTHS_PER_YEAR
      }, xDomain, projection);
      if (tick) {
        ticks.push(tick);
      }
    });

    return ticks;
  }

  function makePhases(dates, xDomain, postDeathPoints, projection) {
    const deathX = isPlainObject(projection)
      ? projection.deathXRatio
      : getDateRatio(dates.deathDate, xDomain);
    const startDate = normalizeDateOnly(xDomain.min);
    const endDate = normalizeDateOnly(xDomain.max);
    const preAvailable = Boolean(dates.valuationDate && dates.deathDate && dates.valuationDate !== dates.deathDate);
    return {
      preDeath: {
        id: "preDeath",
        label: PHASE_LABELS.preDeath,
        startDate: dates.valuationDate || startDate,
        endDate: dates.deathDate || startDate,
        startXRatio: 0,
        endXRatio: deathX,
        available: preAvailable
      },
      deathEvent: {
        id: "deathEvent",
        label: PHASE_LABELS.deathEvent,
        date: dates.deathDate,
        xRatio: deathX,
        age: dates.selectedDeathAge
      },
      postDeath: {
        id: "postDeath",
        label: PHASE_LABELS.postDeath,
        startDate: dates.deathDate,
        endDate,
        startXRatio: deathX,
        endXRatio: 1,
        available: postDeathPoints.length > 0
      }
    };
  }

  function selectEvent(markers, selectedEventId) {
    const selectable = markers.filter(function (marker) {
      return marker.kind === "risk" && marker.positionable;
    });
    if (selectedEventId) {
      const selected = markers.find(function (marker) {
        return marker.id === selectedEventId || marker.ruleId === selectedEventId;
      });
      if (selected) {
        return selected;
      }
    }
    return selectable[0] || markers.find(function (marker) { return marker.positionable; }) || null;
  }

  function buildIncomeImpactTimelineGraphModel(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const scenarioInput = normalizeGraphModelScenarioInput(safeInput);
    const scenario = scenarioInput.scenario;
    const riskEvaluation = scenarioInput.riskEvaluation;
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const dataGaps = [];
    const warnings = [];

    if (!isPlainObject(scenario)) {
      dataGaps.push(makeIssue(
        "missing-composer-scenario",
        "A composed Income Impact scenario is required before the graph can render.",
        ["scenario"]
      ));
      return {
        status: "unavailable",
        phases: {},
        series: {
          preDeathAssets: [],
          deathTransition: [],
          postDeathResources: [],
          appliedScenarioKeyItems: Array.isArray(scenarioInput.appliedScenarioKeyItems)
            ? clonePlainValue(scenarioInput.appliedScenarioKeyItems)
            : []
        },
        axes: {},
        markers: [],
        selectedEvent: null,
        callouts: [],
        warnings,
        dataGaps,
        trace: {
          calculationMethod: CALCULATION_METHOD,
          scenarioModelMode: scenarioInput.scenarioModelMode,
          appliedScenarioCount: scenarioInput.appliedScenarioCount,
          visibleAppliedScenarioCount: 0,
          selectedScenarioId: scenarioInput.selectedScenarioId,
          selectedAppliedScenarioId: scenarioInput.selectedAppliedScenarioId,
          noFinancialCalculationsPerformed: true,
          statement: "The graph model only maps composer and risk-evaluator output for display."
        }
      };
    }

    const dates = getScenarioDates(scenario);
    const preDeath = isPlainObject(scenario.preDeathSeries) ? scenario.preDeathSeries : {};
    const preDeathMode = String(preDeath.mode || "").trim();
    const currentPointOnly = preDeathMode === "current-point-only"
      && (options.currentAgeMode || DEFAULT_CURRENT_AGE_MODE) === DEFAULT_CURRENT_AGE_MODE;
    const preDeathAssets = currentPointOnly
      ? []
      : buildSeriesPoints(preDeath.points, "preDeath", ["endingAssets"], "preDeathSeries.points");
    if (!currentPointOnly && preDeathMode === "forward-projection" && preDeathAssets.length < 2) {
      dataGaps.push(makeIssue(
        "missing-forward-pre-death-points",
        "Forward pre-death graph points are missing or incomplete.",
        ["preDeathSeries.points"]
      ));
    }

    const deathTransition = buildDeathTransition(scenario, dates, dataGaps);
    const postDeathResources = buildSeriesPoints(
      getPath(scenario, "postDeathSeries.points"),
      "postDeath",
      ["endingResources", "availableResources"],
      "postDeathSeries.points"
    );
    if (!postDeathResources.length) {
      dataGaps.push(makeIssue(
        "missing-post-death-runway-points",
        "Survivor runway graph points are missing or incomplete.",
        ["postDeathSeries.points"]
      ));
    }

    const appliedPostDeathResources = buildAppliedPostDeathSeries(scenarioInput, postDeathResources);
    const basePostDeathDisplaySeries = {
      deathDate: dates.deathDate,
      projectionHorizonMonths: dates.projectionHorizonMonths,
      points: postDeathResources,
      depletion: getDepletionInfo(postDeathResources, getPath(scenario, "postDeathSeries.depletion"))
    };
    const deathRelativeProjection = makeDeathRelativeRunwayProjection(
      dates,
      appliedPostDeathResources.length ? appliedPostDeathResources : [basePostDeathDisplaySeries]
    );
    const appliedPostDeathPoints = appliedPostDeathResources.reduce(function (points, appliedSeries) {
      return points.concat(appliedSeries.points);
    }, []);
    const comparisonPostDeathResources = buildComparisonSeries(scenarioInput.comparisonScenarios, postDeathResources);
    const comparisonPoints = comparisonPostDeathResources.reduce(function (points, comparisonSeries) {
      return points.concat(comparisonSeries.points);
    }, []);
    const comparisonMarkers = buildComparisonMarkers(
      scenarioInput.comparisonScenarios,
      comparisonPostDeathResources,
      scenario,
      postDeathResources
    );
    const comparisonEarlyDetail = getComparisonEarlyDetailSeries(comparisonPostDeathResources);

    const riskMarkers = buildMarkers(riskEvaluation.events, "risk", scenario, dates);
    const stableMarkers = buildMarkers(riskEvaluation.stableEvents, "stable", scenario, dates);
    const markers = riskMarkers.concat(stableMarkers);

    const possibleEndFromHorizon = dates.deathDate && dates.projectionHorizonMonths != null
      ? normalizeDateOnly(addMonths(parseDateOnly(dates.deathDate), dates.projectionHorizonMonths))
      : "";
    const xDomain = getDateExtent(
      []
        .concat(preDeathAssets.map(function (point) { return point.date; }))
        .concat(deathTransition.date ? [deathTransition.date] : [])
        .concat(postDeathResources.map(function (point) { return point.date; }))
        .concat(appliedPostDeathPoints.map(function (point) { return point.date; }))
        .concat(comparisonPoints.map(function (point) { return point.date; }))
        .concat(comparisonMarkers.filter(function (marker) { return marker.positionable; }).map(function (marker) { return marker.date; }))
        .concat(markers.filter(function (marker) { return marker.positionable; }).map(function (marker) { return marker.date; })),
      dates.valuationDate || dates.deathDate,
      possibleEndFromHorizon || dates.deathDate
    );
    const yDomain = getRunwayValueDomain({
      appliedPostDeathResources,
      postDeathResources,
      displayHorizonMonths: deathRelativeProjection.postDeathDisplayHorizonMonths
    });
    const layoutFrame = buildStableLayoutFrame({
      dates,
      projection: deathRelativeProjection,
      yDomain,
      appliedPostDeathResources: appliedPostDeathResources.length
        ? appliedPostDeathResources
        : [basePostDeathDisplaySeries],
      comparisonPostDeathResources,
      basePostDeathDisplaySeries
    });

    const enrichedPreDeath = preDeathAssets.map(function (point) {
      return enrichPoint(point, xDomain, yDomain, deathRelativeProjection, "preDeath");
    });
    const enrichedPostDeath = postDeathResources.map(function (point) {
      return enrichPoint(point, xDomain, yDomain, deathRelativeProjection, "postDeath");
    });
    const enrichedAppliedPostDeath = appliedPostDeathResources.map(function (appliedSeries) {
      const seriesProjection = makeDeathRelativeRunwayProjection({
        valuationDate: appliedSeries.valuationDate || dates.valuationDate,
        deathDate: appliedSeries.deathDate || dates.deathDate,
        projectionHorizonMonths: deathRelativeProjection.postDeathDisplayHorizonMonths
      });
      const preDeathContextPoints = getPreDeathContextWindowPoints(
        (Array.isArray(appliedSeries.preDeathContextRawPoints) ? appliedSeries.preDeathContextRawPoints : [])
          .map(function (point) {
            return enrichPoint(point, xDomain, yDomain, seriesProjection, point.phase || "appliedPreDeath");
          }),
        seriesProjection
      );
      const rawPoints = appliedSeries.points.map(function (point) {
        return enrichPoint(point, xDomain, yDomain, seriesProjection, "postDeath");
      });
      const displayStartPoint = makeSurvivorResourcesAtDeathStartPoint(appliedSeries, yDomain, seriesProjection);
      const clipped = clipPostDeathPointsToDisplayHorizon(
        rawPoints,
        yDomain,
        seriesProjection,
        appliedSeries.sourcePath || appliedSeries.pathId || appliedSeries.scenarioId,
        displayStartPoint
      );
      return Object.assign({}, appliedSeries, {
        xProjection: seriesProjection,
        preDeathContextPoints,
        rawPoints,
        points: clipped.points,
        trace: Object.assign({}, isPlainObject(appliedSeries.trace) ? appliedSeries.trace : {}, {
          displayHorizonClipApplied: clipped.clipped,
          displayHorizonClippedPointCount: clipped.clippedPointCount,
          displayHorizonClipInterpolationPointAdded: clipped.interpolationPointAdded,
          rawSourcePointsPreserved: true
        })
      });
    });
    const enrichedComparisonPostDeath = comparisonPostDeathResources.map(function (comparisonSeries) {
      const rawPoints = comparisonSeries.points.map(function (point) {
        return enrichPoint(point, xDomain, yDomain, deathRelativeProjection, "postDeath");
      });
      const clipped = clipPostDeathPointsToDisplayHorizon(
        rawPoints,
        yDomain,
        deathRelativeProjection,
        comparisonSeries.sourcePath || comparisonSeries.pathId || comparisonSeries.scenarioId
      );
      return Object.assign({}, comparisonSeries, {
        rawPoints,
        points: clipped.points,
        trace: Object.assign({}, isPlainObject(comparisonSeries.trace) ? comparisonSeries.trace : {}, {
          displayHorizonClipApplied: clipped.clipped,
          displayHorizonClippedPointCount: clipped.clippedPointCount,
          displayHorizonClipInterpolationPointAdded: clipped.interpolationPointAdded,
          rawSourcePointsPreserved: true
        })
      });
    });
    const enrichedDeathStages = deathTransition.stages.map(function (stage) {
      return enrichPoint(stage, xDomain, yDomain, deathRelativeProjection, "deathEvent");
    });
    const enrichedMarkers = markers.map(function (marker) {
      return marker.positionable ? enrichPoint(marker, xDomain, yDomain, deathRelativeProjection, marker.phase) : marker;
    });
    const enrichedComparisonMarkers = comparisonMarkers.map(function (marker) {
      return marker.positionable ? enrichPoint(marker, xDomain, yDomain, deathRelativeProjection, marker.phase || "postDeath") : marker;
    });
    const appliedRunwayScenarios = buildAppliedRunwayScenarios(enrichedAppliedPostDeath, xDomain, yDomain);
    const usable = enrichedDeathStages.length >= 2 || enrichedPreDeath.length >= 2 || enrichedPostDeath.length >= 2;
    const axes = {
      x: {
        xAxisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
        domainStart: normalizeDateOnly(xDomain.min),
        domainEnd: normalizeDateOnly(xDomain.max),
        deathDate: dates.deathDate,
        deathXRatio: deathRelativeProjection.deathXRatio,
        projectionMode: deathRelativeProjection.mode,
        displayHorizonMode: deathRelativeProjection.displayHorizonMode,
        displayHorizonYears: deathRelativeProjection.displayHorizonYears,
        displayHorizonMonths: deathRelativeProjection.displayHorizonMonths,
        displayHorizonReason: deathRelativeProjection.displayHorizonReason,
        displayHorizonEndDate: deathRelativeProjection.displayHorizonEndDate,
        postDeathDisplayHorizonMonths: deathRelativeProjection.postDeathDisplayHorizonMonths,
        calculationHorizonMonths: deathRelativeProjection.calculationHorizonMonths,
        calculationHorizonEndDate: deathRelativeProjection.calculationHorizonEndDate,
        latestAppliedScenarioDepletionMonths: deathRelativeProjection.latestAppliedScenarioDepletionMonths,
        latestAppliedScenarioRunwayEndMonths: deathRelativeProjection.latestAppliedScenarioRunwayEndMonths,
        displayHorizonBasis: deathRelativeProjection.displayHorizonBasis,
        postDepletionDisplayPaddingMonths: deathRelativeProjection.postDepletionDisplayPaddingMonths,
        displayHorizonRoundingMonths: deathRelativeProjection.displayHorizonRoundingMonths,
        displayHorizonTargetRunwayRatio: deathRelativeProjection.displayHorizonTargetRunwayRatio,
        ticks: makeXTicks(dates, xDomain, deathRelativeProjection)
      },
      y: {
        min: yDomain.min,
        max: yDomain.max,
        signed: yDomain.signed,
        verticalScaleMode: yDomain.verticalScaleMode,
        zeroYRatio: yDomain.zeroYRatio,
        fundedRunwayHeightRatio: yDomain.fundedRunwayHeightRatio,
        deficitHeightRatio: yDomain.deficitHeightRatio,
        positiveMax: yDomain.positiveMax,
        deficitMax: yDomain.deficitMax,
        deficitVisualMax: yDomain.deficitVisualMax,
        deficitVisualScaleMode: yDomain.deficitVisualScaleMode,
        deficitVisualScaleCapped: yDomain.deficitVisualScaleCapped,
        rawPositiveMax: yDomain.rawPositiveMax,
        rawDeficitMax: yDomain.rawDeficitMax,
        visibleDomainPointCount: yDomain.visibleDomainPointCount,
        visibleDomainBoundaryPointIncluded: yDomain.visibleDomainBoundaryPointIncluded,
        trace: clonePlainValue(yDomain.trace),
        ticks: makeYTicks(yDomain)
      }
    };
    const graphViewFrameContract = buildIncomeImpactGraphViewFrames({
      dates,
      layoutFrame,
      axes,
      appliedRunwayScenarios,
      selectedScenarioId: scenarioInput.selectedScenarioId
    });

    const result = {
      status: usable ? (scenario.status === "complete" && !dataGaps.length ? "complete" : "partial") : "unavailable",
      projection: clonePlainValue(deathRelativeProjection),
      layoutFrame,
      phases: makePhases(dates, xDomain, enrichedPostDeath, deathRelativeProjection),
      series: {
        preDeathAssets: enrichedPreDeath,
        currentAnchor: currentPointOnly && enrichedDeathStages.length
          ? {
              ...enrichedDeathStages[0],
              id: "current-death-anchor",
              phase: "deathEvent",
              sourcePath: "deathEvent.assetsBeforeDeath"
            }
          : null,
        deathTransition: enrichedDeathStages,
        postDeathResources: enrichedPostDeath,
        appliedScenarioKeyItems: Array.isArray(scenarioInput.appliedScenarioKeyItems)
          ? clonePlainValue(scenarioInput.appliedScenarioKeyItems)
          : []
      },
      axes,
      viewFrames: clonePlainValue(graphViewFrameContract.viewFrames),
      selectedViewFrameMode: graphViewFrameContract.selectedViewFrameMode,
      activeViewFrame: clonePlainValue(graphViewFrameContract.activeViewFrame),
      markers: enrichedMarkers,
      comparisonMarkers: enrichedComparisonMarkers,
      selectedEvent: clonePlainValue(selectEvent(enrichedMarkers, options.selectedEventId)),
      callouts: buildCallouts(scenario, dates, preDeathMode),
      warnings: []
        .concat(Array.isArray(scenario.warnings) ? clonePlainValue(scenario.warnings) : [])
        .concat(Array.isArray(riskEvaluation.warnings) ? clonePlainValue(riskEvaluation.warnings) : [])
        .concat(warnings),
      dataGaps: []
        .concat(Array.isArray(scenario.dataGaps) ? clonePlainValue(scenario.dataGaps) : [])
        .concat(Array.isArray(riskEvaluation.dataGaps) ? clonePlainValue(riskEvaluation.dataGaps) : [])
        .concat(dataGaps),
      trace: {
        calculationMethod: CALCULATION_METHOD,
        inputSources: [
          "composeIncomeImpactScenario.preDeathSeries",
          "composeIncomeImpactScenario.deathEvent",
          "composeIncomeImpactScenario.postDeathSeries",
          "evaluateIncomeImpactRiskEvents.events",
          "evaluateIncomeImpactRiskEvents.stableEvents"
        ],
        scenarioModelMode: scenarioInput.scenarioModelMode,
        graphContractMode: GRAPH_CONTRACT_MODE_SURVIVOR_RUNWAY_COMPARISON,
        appliedScenarioCount: scenarioInput.appliedScenarioCount,
        visibleAppliedScenarioCount: appliedRunwayScenarios.length,
        hiddenAppliedScenarioCount: Math.max((scenarioInput.appliedScenarioCount || 0) - appliedRunwayScenarios.length, 0),
        selectedScenarioId: scenarioInput.selectedScenarioId,
        selectedAppliedScenarioId: scenarioInput.selectedAppliedScenarioId,
        selectedAppliedScenario: scenarioInput.selectedAppliedScenario,
        xAxisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
        projectionMode: PROJECTION_MODE_DEATH_RELATIVE_RUNWAY,
        displayHorizonMode: deathRelativeProjection.displayHorizonMode,
        displayHorizonYears: deathRelativeProjection.displayHorizonYears,
        displayHorizonMonths: deathRelativeProjection.displayHorizonMonths,
        displayHorizonReason: deathRelativeProjection.displayHorizonReason,
        displayHorizonEndDate: deathRelativeProjection.displayHorizonEndDate,
        displayHorizonAutoSized: deathRelativeProjection.trace.displayHorizonAutoSized,
        calculationHorizonMonths: deathRelativeProjection.calculationHorizonMonths,
        calculationHorizonEndDate: deathRelativeProjection.calculationHorizonEndDate,
        latestAppliedScenarioDepletionMonths: deathRelativeProjection.latestAppliedScenarioDepletionMonths,
        latestAppliedScenarioRunwayEndMonths: deathRelativeProjection.latestAppliedScenarioRunwayEndMonths,
        displayHorizonBasis: deathRelativeProjection.displayHorizonBasis,
        postDepletionDisplayPaddingMonths: deathRelativeProjection.postDepletionDisplayPaddingMonths,
        displayHorizonRoundingMonths: deathRelativeProjection.displayHorizonRoundingMonths,
        displayHorizonTargetRunwayRatio: deathRelativeProjection.displayHorizonTargetRunwayRatio,
        verticalScaleMode: yDomain.verticalScaleMode,
        zeroYRatio: yDomain.zeroYRatio,
        fundedRunwayHeightRatio: yDomain.fundedRunwayHeightRatio,
        deficitHeightRatio: yDomain.deficitHeightRatio,
        rawDeficitMax: yDomain.rawDeficitMax,
        deficitVisualMax: yDomain.deficitVisualMax,
        deficitVisualScaleMode: yDomain.deficitVisualScaleMode,
        deficitVisualScaleCapped: yDomain.deficitVisualScaleCapped,
        visibleDomainPointCount: yDomain.visibleDomainPointCount,
        visibleDomainBoundaryPointIncluded: yDomain.visibleDomainBoundaryPointIncluded,
        yDomainWindowSource: yDomain.trace.yDomainWindowSource,
        layoutFrameMode: layoutFrame.mode,
        layoutFrameZeroYRatio: layoutFrame.zeroYRatio,
        layoutFrameRunoutAnchorXRatio: layoutFrame.runoutAnchorXRatio,
        layoutFrameAnchorScenarioId: layoutFrame.zeroCrossingAnchorScenarioId,
        layoutFrameAnchorMonth: layoutFrame.zeroCrossingAnchorMonth,
        viewFrameContractEnabled: true,
        viewFrameOwner: "graph-model",
        viewFrameModes: Object.keys(graphViewFrameContract.viewFrames || {}),
        selectedViewFrameMode: graphViewFrameContract.selectedViewFrameMode,
        activeViewFrameMode: graphViewFrameContract.activeViewFrame?.mode || null,
        focusedViewFrameGenerated: Boolean(graphViewFrameContract.viewFrames?.postDeathFocus || graphViewFrameContract.viewFrames?.focused),
        deathLeadUpViewFrameGenerated: Boolean(graphViewFrameContract.viewFrames?.deathLeadUp),
        negativeValuesCompressFundedRunway: false,
        rawDatesPreserved: true,
        deathAlignedToSharedAnchor: true,
        calculationHorizonPreserved: true,
        preDeathMode,
        currentAgeMode: options.currentAgeMode || DEFAULT_CURRENT_AGE_MODE,
        noFinancialCalculationsPerformed: true,
        noFakePoints: true,
        noBackcast: true,
        rawDeathTransitionPathRendered: false,
        noLocalScaleOverlay: true,
        statement: "This helper builds a display-only graph model from the composed Income Impact scenario and Layer 4 risk events."
      }
    };

    if (enrichedComparisonPostDeath.length) {
      result.series.comparisonPostDeathResources = enrichedComparisonPostDeath;
      result.trace.comparisonScenariosEnabled = true;
      result.trace.comparisonScenarioCount = enrichedComparisonPostDeath.length;
      result.trace.baseSeriesUnchanged = true;
      result.trace.comparisonMarkersCreated = enrichedComparisonMarkers.length > 0;
      result.trace.comparisonMarkerCount = enrichedComparisonMarkers.length;
    }

    if (appliedRunwayScenarios.length) {
      result.series.appliedRunwayScenarios = appliedRunwayScenarios;
      result.trace.appliedRunwayScenarioCount = appliedRunwayScenarios.length;
      result.trace.renderedAppliedScenarioCount = appliedRunwayScenarios.length;
      result.trace.stableAppliedScenarioOrder = true;
      result.trace.appliedScenarioPathIds = appliedRunwayScenarios.map(function (series) {
        return series.pathId;
      });
      result.trace.appliedRunwayContractEnabled = true;
      result.trace.appliedPreDeathContextEnabled = appliedRunwayScenarios.some(function (series) {
        return Array.isArray(series.preDeathContextPoints) && series.preDeathContextPoints.length > 0;
      });
      result.trace.appliedPreDeathContextPathIds = appliedRunwayScenarios
        .filter(function (series) {
          return Array.isArray(series.preDeathContextPoints) && series.preDeathContextPoints.length > 0;
        })
        .map(function (series) {
          return series.preDeathPathId;
        });
    }

    if (enrichedAppliedPostDeath.length > 1) {
      result.series.appliedPostDeathResources = enrichedAppliedPostDeath;
      result.trace.appliedScenarioPathsEnabled = true;
      result.trace.renderedAppliedScenarioCount = enrichedAppliedPostDeath.length;
      result.trace.appliedScenarioPathIds = enrichedAppliedPostDeath.map(function (series) {
        return series.pathId;
      });
      result.trace.selectedAppliedScenarioPathId = (enrichedAppliedPostDeath.find(function (series) {
        return series.selected === true;
      }) || enrichedAppliedPostDeath[0])?.pathId || null;
    }

    if (comparisonEarlyDetail) {
      result.series.comparisonEarlyDetail = comparisonEarlyDetail;
      result.trace.comparisonEarlyDetailCreated = true;
      result.trace.comparisonEarlyDetailWindowMonths = comparisonEarlyDetail.windowMonths;
      result.trace.comparisonEarlyDetailUsesLocalScale = true;
      result.trace.comparisonEarlyDetailArtificialOffsetApplied = false;
    }

    return result;
  }

  lensAnalysis.buildIncomeImpactTimelineGraphModel = buildIncomeImpactTimelineGraphModel;
})(typeof globalThis !== "undefined" ? globalThis : this);
