(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const CALCULATION_METHOD = "income-impact-timeline-graph-model-v1";
  const DEFAULT_CURRENT_AGE_MODE = "death-event-only";
  const COMPRESSION_EARLY_DETAIL_WINDOW_MONTHS = 24;
  const LIFESTYLE_COMPARISON_KIND = "lifestyleComparison";
  const LIFESTYLE_COMPARISON_PATH_ID = "lifestyle-post-death-resources";
  const POST_DEATH_RESOURCES_PATH_ID = "postDeathResources";
  const MAX_RENDERED_APPLIED_SCENARIOS = 2;
  const X_AXIS_MODE_DEATH_RELATIVE_YEARS = "deathRelativeYears";
  const DEATH_RELATIVE_X_TICK_YEARS = Object.freeze([5, 10, 15, 20, 30]);
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
        return {
          id: `${phase}-${index + 1}`,
          date,
          monthIndex: toOptionalNumber(point.monthIndex) ?? index + 1,
          phase,
          value: valueResult.value,
          displayedValue: valueResult.value,
          sourcePath: `${sourcePath}.${index}.${valueResult.sourcePath || "value"}`,
          sourcePaths: Array.isArray(point.sourcePaths) ? clonePlainValue(point.sourcePaths) : [],
          status: point.status || null,
          precision: point.precision || null,
          trace: isPlainObject(point.trace) ? clonePlainValue(point.trace) : {}
        };
      })
      .filter(Boolean);
  }

  function buildComparisonSeries(comparisonScenarios) {
    return (Array.isArray(comparisonScenarios) ? comparisonScenarios : [])
      .map(function (comparisonScenario, index) {
        if (!isPlainObject(comparisonScenario) || !isLifestyleComparisonScenario(comparisonScenario)) {
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
        return {
          scenarioId: String(comparisonScenario.scenarioId || `comparison-scenario-${index + 1}`),
          kind,
          label: String(comparisonScenario.label || "Comparison scenario"),
          pathId,
          pathMode: getComparisonPathMode(comparisonScenario, kind, pathId),
          sourceIndex: index,
          points,
          sourcePath: `comparisonScenarios.${index}.postDeathSeries.points`,
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

  function getAppliedScenarioLabel(appliedScenario, index) {
    return normalizeString(appliedScenario?.label)
      || (index === 0 ? "Current scenario" : `Scenario ${index + 1}`);
  }

  function getAppliedScenarioPostDeathPathId(renderIndex) {
    return renderIndex === 0
      ? POST_DEATH_RESOURCES_PATH_ID
      : `${POST_DEATH_RESOURCES_PATH_ID}--scenario-${renderIndex + 1}`;
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
    const seriesRecords = appliedScenarios
      .map(function (appliedScenario, sourceIndex) {
        if (!isPlainObject(appliedScenario) || !isPlainObject(appliedScenario.scenario)) {
          return null;
        }

        const scenarioId = getAppliedScenarioId(appliedScenario, sourceIndex);
        const selected = selectedAppliedScenarioId
          ? scenarioId === selectedAppliedScenarioId
          : sourceIndex === 0;
        const sourcePath = `appliedScenarios.${sourceIndex}.scenario.postDeathSeries.points`;
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

        return {
          scenarioId,
          label: getAppliedScenarioLabel(appliedScenario, sourceIndex),
          selected,
          sourceIndex,
          sourcePath,
          points,
          trace: {
            selectedScenario: selected,
            sourcePath
          }
        };
      })
      .filter(Boolean);

    if (!seriesRecords.length) {
      return [];
    }

    const selectedRecord = seriesRecords.find(function (series) {
      return series.selected;
    });
    const orderedRecords = (selectedRecord
      ? [selectedRecord].concat(seriesRecords.filter(function (series) {
        return series.scenarioId !== selectedRecord.scenarioId;
      }))
      : seriesRecords
    ).slice(0, MAX_RENDERED_APPLIED_SCENARIOS);

    return orderedRecords.map(function (series, renderIndex) {
      return Object.assign({}, series, {
        pathId: getAppliedScenarioPostDeathPathId(renderIndex),
        pathMode: "smooth",
        renderIndex
      });
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
    const explicitMode = String(comparisonScenario?.pathMode || comparisonScenario?.renderMode || "").trim();
    return "smooth";
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
        "A selected death date is required to position the death-event bridge.",
        ["scenario.scenario.selectedDeathDate", "scenario.deathEvent.date"]
      ));
    }

    if (stages.length < 2) {
      dataGaps.push(makeIssue(
        "missing-death-event-bridge-values",
        "Death-event resource values are incomplete, so the bridge cannot be fully rendered.",
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

  function enrichPoint(point, xDomain, yDomain) {
    return {
      ...point,
      xRatio: getDateRatio(point.date, xDomain),
      yRatio: getValueRatio(point.value, yDomain)
    };
  }

  function makeYTicks(domain) {
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

  function createDeathRelativeXTick(input, xDomain) {
    const date = normalizeDateOnly(input.date);
    if (!date || !dateIsWithinDomain(date, xDomain)) {
      return null;
    }

    const relativeYears = toOptionalNumber(input.relativeYears);
    return {
      id: input.id,
      key: input.id,
      label: input.label,
      date,
      xRatio: getDateRatio(date, xDomain),
      relativeYears,
      relativeMonths: relativeYears == null ? null : relativeYears * 12,
      axisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
      trace: {
        displayOnlyAxisLabel: true,
        rawDatePreserved: true
      }
    };
  }

  function makeXTicks(dates, xDomain) {
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
      }, xDomain);
      if (preDeathTick) {
        ticks.push(preDeathTick);
      }
    }

    const deathTick = createDeathRelativeXTick({
      id: "death",
      label: "Death",
      date: deathDate,
      relativeYears: 0
    }, xDomain);
    if (deathTick) {
      ticks.push(deathTick);
    }

    const parsedDeathDate = parseDateOnly(deathDate);
    DEATH_RELATIVE_X_TICK_YEARS.forEach(function (relativeYears) {
      const tickDate = addMonths(parsedDeathDate, relativeYears * 12);
      const tick = createDeathRelativeXTick({
        id: `plus-${relativeYears}`,
        label: `+${relativeYears} years`,
        date: tickDate,
        relativeYears
      }, xDomain);
      if (tick) {
        ticks.push(tick);
      }
    });

    return ticks;
  }

  function makePhases(dates, xDomain, postDeathPoints) {
    const deathX = getDateRatio(dates.deathDate, xDomain);
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
          postDeathResources: []
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
    const appliedPostDeathPoints = appliedPostDeathResources.reduce(function (points, appliedSeries) {
      return points.concat(appliedSeries.points);
    }, []);
    const comparisonPostDeathResources = buildComparisonSeries(scenarioInput.comparisonScenarios);
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
    const yDomain = getValueExtent(
      []
        .concat(preDeathAssets.map(function (point) { return point.value; }))
        .concat(deathTransition.stages.map(function (stage) { return stage.value; }))
        .concat(postDeathResources.map(function (point) { return point.value; }))
        .concat(appliedPostDeathPoints.map(function (point) { return point.value; }))
        .concat(comparisonPoints.map(function (point) { return point.value; }))
        .concat(comparisonMarkers.filter(function (marker) { return marker.positionable && marker.value != null; }).map(function (marker) { return marker.value; }))
        .concat(markers.filter(function (marker) { return marker.positionable && marker.value != null; }).map(function (marker) { return marker.value; }))
    );

    const enrichedPreDeath = preDeathAssets.map(function (point) {
      return enrichPoint(point, xDomain, yDomain);
    });
    const enrichedPostDeath = postDeathResources.map(function (point) {
      return enrichPoint(point, xDomain, yDomain);
    });
    const enrichedAppliedPostDeath = appliedPostDeathResources.map(function (appliedSeries) {
      return Object.assign({}, appliedSeries, {
        points: appliedSeries.points.map(function (point) {
          return enrichPoint(point, xDomain, yDomain);
        })
      });
    });
    const enrichedComparisonPostDeath = comparisonPostDeathResources.map(function (comparisonSeries) {
      return Object.assign({}, comparisonSeries, {
        points: comparisonSeries.points.map(function (point) {
          return enrichPoint(point, xDomain, yDomain);
        })
      });
    });
    const enrichedDeathStages = deathTransition.stages.map(function (stage) {
      return enrichPoint(stage, xDomain, yDomain);
    });
    const enrichedMarkers = markers.map(function (marker) {
      return marker.positionable ? enrichPoint(marker, xDomain, yDomain) : marker;
    });
    const enrichedComparisonMarkers = comparisonMarkers.map(function (marker) {
      return marker.positionable ? enrichPoint(marker, xDomain, yDomain) : marker;
    });
    const usable = enrichedDeathStages.length >= 2 || enrichedPreDeath.length >= 2 || enrichedPostDeath.length >= 2;

    const result = {
      status: usable ? (scenario.status === "complete" && !dataGaps.length ? "complete" : "partial") : "unavailable",
      phases: makePhases(dates, xDomain, enrichedPostDeath),
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
        postDeathResources: enrichedPostDeath
      },
      axes: {
        x: {
          xAxisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
          domainStart: normalizeDateOnly(xDomain.min),
          domainEnd: normalizeDateOnly(xDomain.max),
          deathDate: dates.deathDate,
          ticks: makeXTicks(dates, xDomain)
        },
        y: {
          min: yDomain.min,
          max: yDomain.max,
          signed: yDomain.min < 0,
          zeroYRatio: getValueRatio(0, yDomain),
          ticks: makeYTicks(yDomain)
        }
      },
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
        appliedScenarioCount: scenarioInput.appliedScenarioCount,
        selectedScenarioId: scenarioInput.selectedScenarioId,
        selectedAppliedScenarioId: scenarioInput.selectedAppliedScenarioId,
        selectedAppliedScenario: scenarioInput.selectedAppliedScenario,
        xAxisMode: X_AXIS_MODE_DEATH_RELATIVE_YEARS,
        preDeathMode,
        currentAgeMode: options.currentAgeMode || DEFAULT_CURRENT_AGE_MODE,
        noFinancialCalculationsPerformed: true,
        noFakePoints: true,
        noBackcast: true,
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

    if (enrichedAppliedPostDeath.length > 1) {
      result.series.appliedPostDeathResources = enrichedAppliedPostDeath;
      result.trace.appliedScenarioPathsEnabled = true;
      result.trace.renderedAppliedScenarioCount = enrichedAppliedPostDeath.length;
      result.trace.appliedScenarioPathIds = enrichedAppliedPostDeath.map(function (series) {
        return series.pathId;
      });
      result.trace.selectedAppliedScenarioPathId = POST_DEATH_RESOURCES_PATH_ID;
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
