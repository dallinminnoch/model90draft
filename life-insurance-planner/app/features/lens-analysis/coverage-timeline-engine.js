(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis pure coverage timeline engine.
  // Purpose: calculate deterministic coverage need, policy-layer coverage,
  // gaps, surplus, events, and trace for the future motherboard surface.
  // Non-goals: no DOM, storage, graph rendering, AI, saved-shape changes,
  // method formula changes, or Existing Coverage manager behavior changes.
  const COVERAGE_TIMELINE_ENGINE_VERSION = "coverage-timeline-engine-v1";
  const SUPPORTED_CADENCE = "annual";
  const DEFAULT_SOURCE = "hypothetical";
  const POLICY_SOURCES = Object.freeze(["existing", "hypothetical", "recommended"]);
  const PERMANENT_TYPES = Object.freeze(["wholeLife", "universalLife"]);
  const SUPPORTED_POLICY_TYPES = Object.freeze([
    "term",
    "decreasingTerm",
    "wholeLife",
    "universalLife",
    "groupLife",
    "custom"
  ]);

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
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value)
      .replace(/[$,%\s,]/g, "")
      .trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toWholeYearIndex(value) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      return null;
    }
    return Math.max(0, Math.round(parsed));
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundPercent(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
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

  function addYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const target = new Date(dateResult.date.getTime());
    target.setUTCFullYear(target.getUTCFullYear() + years);
    return [
      String(target.getUTCFullYear()).padStart(4, "0"),
      String(target.getUTCMonth() + 1).padStart(2, "0"),
      String(target.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function getCalendarYear(date) {
    const parsed = normalizeDateOnly(date);
    return parsed ? parsed.calendarYear : null;
  }

  function normalizeHorizonYears(input, needPoints, warnings, dataGaps) {
    const direct = toWholeYearIndex(input?.horizonYears);
    if (direct != null) {
      return direct;
    }

    const maxNeedYear = Array.isArray(needPoints)
      ? needPoints.reduce(function (max, point) {
          const yearIndex = toWholeYearIndex(point?.yearIndex);
          return yearIndex == null ? max : Math.max(max, yearIndex);
        }, 0)
      : 0;

    warnings.push(createIssue(
      "horizon-years-defaulted",
      "horizonYears was missing or invalid and defaulted from supplied need points.",
      { horizonYears: maxNeedYear }
    ));

    if (maxNeedYear === 0) {
      dataGaps.push(createIssue(
        "missing-horizon-years",
        "A usable horizonYears value or need point yearIndex values are required.",
        {}
      ));
    }

    return maxNeedYear;
  }

  function normalizeNeedPoints(rawNeedPoints, horizonYears, warnings, dataGaps) {
    if (!Array.isArray(rawNeedPoints) || rawNeedPoints.length === 0) {
      dataGaps.push(createIssue(
        "missing-need-points",
        "needPoints must include at least one supplied annual need point.",
        {}
      ));
      return new Map();
    }

    const needByYear = new Map();
    rawNeedPoints.forEach(function (point, index) {
      if (!isPlainObject(point)) {
        warnings.push(createIssue(
          "invalid-need-point",
          "Need point was ignored because it was not an object.",
          { index }
        ));
        return;
      }

      const yearIndex = toWholeYearIndex(point.yearIndex ?? index);
      if (yearIndex == null || yearIndex > horizonYears) {
        warnings.push(createIssue(
          "invalid-need-point-year-index",
          "Need point was ignored because yearIndex was outside the projection horizon.",
          { index, yearIndex }
        ));
        return;
      }

      const needAmount = toOptionalNumber(point.needAmount);
      if (needAmount == null || needAmount < 0) {
        warnings.push(createIssue(
          "invalid-need-amount",
          "Need point had an invalid needAmount and was treated as 0.",
          { index, yearIndex }
        ));
      }

      needByYear.set(yearIndex, {
        yearIndex,
        age: toOptionalNumber(point.age),
        date: normalizeString(point.date),
        needAmount: roundMoney(Math.max(0, needAmount || 0)),
        trace: isPlainObject(point.trace) ? clonePlainValue(point.trace) : {}
      });
    });

    return needByYear;
  }

  function normalizePolicySource(source, warnings, layerId) {
    const normalized = normalizeString(source);
    if (POLICY_SOURCES.includes(normalized)) {
      return normalized;
    }
    if (normalized) {
      warnings.push(createIssue(
        "unsupported-policy-source",
        "Policy layer source was unsupported and defaulted to hypothetical.",
        { layerId, source: normalized }
      ));
    }
    return DEFAULT_SOURCE;
  }

  function normalizePolicyType(policyType, warnings, layerId) {
    const normalized = normalizeString(policyType);
    if (SUPPORTED_POLICY_TYPES.includes(normalized)) {
      return normalized;
    }
    warnings.push(createIssue(
      "unsupported-policy-type",
      "Policy layer type is unsupported and will contribute zero coverage.",
      { layerId, policyType: normalized || null }
    ));
    return normalized || "unsupported";
  }

  function normalizeSchedulePoint(point, index, layerId, warnings) {
    if (!isPlainObject(point)) {
      warnings.push(createIssue(
        "invalid-custom-schedule-point",
        "Custom benefit schedule point was ignored because it was not an object.",
        { layerId, index }
      ));
      return null;
    }

    const yearIndex = toWholeYearIndex(point.yearIndex);
    const rawAmount = point.benefitAmount ?? point.deathBenefit ?? point.amount;
    const amount = toOptionalNumber(rawAmount);
    if (yearIndex == null || amount == null || amount < 0) {
      warnings.push(createIssue(
        "invalid-custom-schedule-point",
        "Custom benefit schedule point was ignored because yearIndex or benefit amount was invalid.",
        { layerId, index }
      ));
      return null;
    }

    return {
      yearIndex,
      amount: roundMoney(amount)
    };
  }

  function normalizePolicyLayer(layer, index, horizonYears, warnings) {
    const source = isPlainObject(layer) ? layer : {};
    const layerId = normalizeString(source.id) || `policy-layer-${index + 1}`;
    const policyType = normalizePolicyType(source.policyType, warnings, layerId);
    const startYearIndex = toWholeYearIndex(source.startYearIndex);
    const endYearIndex = toWholeYearIndex(source.endYearIndex);
    const deathBenefit = toOptionalNumber(source.deathBenefit);
    const included = source.included === false ? false : true;
    const scheduleSource = isPlainObject(source.benefitSchedule)
      ? source.benefitSchedule.points
      : source.benefitSchedule;
    const schedule = Array.isArray(scheduleSource)
      ? scheduleSource
          .map(function (point, pointIndex) {
            return normalizeSchedulePoint(point, pointIndex, layerId, warnings);
          })
          .filter(Boolean)
      : [];

    if (!isPlainObject(layer)) {
      warnings.push(createIssue(
        "invalid-policy-layer",
        "Policy layer was not an object and will contribute zero coverage.",
        { index }
      ));
    }
    if (startYearIndex == null) {
      warnings.push(createIssue(
        "invalid-policy-layer-start",
        "Policy layer startYearIndex was missing or invalid and defaulted to 0.",
        { layerId }
      ));
    }
    if (!SUPPORTED_POLICY_TYPES.includes(policyType)) {
      return {
        id: layerId,
        source: normalizePolicySource(source.source, warnings, layerId),
        name: normalizeString(source.name) || layerId,
        policyType,
        startYearIndex: startYearIndex ?? 0,
        endYearIndex,
        deathBenefit: 0,
        included,
        benefitSchedule: schedule,
        cashValue: isPlainObject(source.cashValue) ? clonePlainValue(source.cashValue) : null,
        premium: isPlainObject(source.premium) ? clonePlainValue(source.premium) : null,
        notes: normalizeString(source.notes),
        warnings: ["unsupported-policy-type"]
      };
    }

    const normalizedLayer = {
      id: layerId,
      source: normalizePolicySource(source.source, warnings, layerId),
      name: normalizeString(source.name) || layerId,
      policyType,
      startYearIndex: startYearIndex ?? 0,
      endYearIndex,
      deathBenefit: roundMoney(Math.max(0, deathBenefit || 0)),
      included,
      benefitSchedule: schedule,
      cashValue: isPlainObject(source.cashValue) ? clonePlainValue(source.cashValue) : null,
      premium: isPlainObject(source.premium) ? clonePlainValue(source.premium) : null,
      notes: normalizeString(source.notes),
      warnings: []
    };

    if (!included) {
      return normalizedLayer;
    }

    if (policyType !== "custom" && (deathBenefit == null || deathBenefit <= 0)) {
      normalizedLayer.warnings.push("invalid-death-benefit");
      warnings.push(createIssue(
        "invalid-death-benefit",
        "Policy layer deathBenefit was missing or invalid and will contribute zero coverage.",
        { layerId }
      ));
    }

    if (policyType === "decreasingTerm") {
      if (endYearIndex == null || endYearIndex <= normalizedLayer.startYearIndex) {
        normalizedLayer.warnings.push("invalid-decreasing-term-window");
        warnings.push(createIssue(
          "invalid-decreasing-term-window",
          "Decreasing term layer requires endYearIndex greater than startYearIndex.",
          { layerId, startYearIndex: normalizedLayer.startYearIndex, endYearIndex }
        ));
      }
    } else if (policyType === "groupLife" && endYearIndex == null) {
      normalizedLayer.endYearIndex = horizonYears;
      normalizedLayer.warnings.push("group-life-missing-end");
      warnings.push(createIssue(
        "group-life-missing-end",
        "Group life layer did not provide endYearIndex and was capped at the projection horizon.",
        { layerId, horizonYears }
      ));
    } else if (policyType === "term" && endYearIndex == null) {
      normalizedLayer.endYearIndex = horizonYears;
      normalizedLayer.warnings.push("term-missing-end");
      warnings.push(createIssue(
        "term-missing-end",
        "Term layer did not provide endYearIndex and was capped at the projection horizon.",
        { layerId, horizonYears }
      ));
    }

    if (policyType === "custom" && schedule.length === 0) {
      normalizedLayer.warnings.push("custom-layer-missing-schedule");
      warnings.push(createIssue(
        "custom-layer-missing-schedule",
        "Custom layer requires benefitSchedule points and will contribute zero coverage.",
        { layerId }
      ));
    }

    return normalizedLayer;
  }

  function getCustomScheduleAmount(layer, yearIndex) {
    const exact = layer.benefitSchedule.find(function (point) {
      return point.yearIndex === yearIndex;
    });
    return exact ? exact.amount : 0;
  }

  function calculateLayerContribution(layer, yearIndex) {
    if (layer.included === false) {
      return {
        amount: 0,
        active: false,
        reason: "excluded"
      };
    }

    if (layer.deathBenefit <= 0 && layer.policyType !== "custom") {
      return {
        amount: 0,
        active: false,
        reason: "invalid-death-benefit"
      };
    }

    if (yearIndex < layer.startYearIndex) {
      return {
        amount: 0,
        active: false,
        reason: "before-start"
      };
    }

    if (layer.policyType === "custom") {
      const amount = getCustomScheduleAmount(layer, yearIndex);
      return {
        amount,
        active: amount > 0,
        reason: amount > 0 ? "custom-schedule" : "custom-schedule-zero"
      };
    }

    if (layer.policyType === "decreasingTerm") {
      if (layer.endYearIndex == null || layer.endYearIndex <= layer.startYearIndex) {
        return {
          amount: 0,
          active: false,
          reason: "invalid-decreasing-term-window"
        };
      }
      if (yearIndex >= layer.endYearIndex) {
        return {
          amount: 0,
          active: false,
          reason: "decreasing-term-zero"
        };
      }
      const termLength = layer.endYearIndex - layer.startYearIndex;
      const elapsed = yearIndex - layer.startYearIndex;
      return {
        amount: roundMoney(layer.deathBenefit * Math.max(0, 1 - (elapsed / termLength))),
        active: true,
        reason: "decreasing-term-linear"
      };
    }

    const endsAt = layer.endYearIndex;
    if (endsAt != null && yearIndex > endsAt) {
      return {
        amount: 0,
        active: false,
        reason: "after-end"
      };
    }

    if (PERMANENT_TYPES.includes(layer.policyType) || layer.policyType === "term" || layer.policyType === "groupLife") {
      return {
        amount: layer.deathBenefit,
        active: true,
        reason: PERMANENT_TYPES.includes(layer.policyType) ? "permanent-active" : "level-active"
      };
    }

    return {
      amount: 0,
      active: false,
      reason: "unsupported-policy-type"
    };
  }

  function createLayerContribution(layer, yearIndex) {
    const contribution = calculateLayerContribution(layer, yearIndex);
    return {
      layerId: layer.id,
      source: layer.source,
      policyType: layer.policyType,
      amount: roundMoney(contribution.amount),
      active: contribution.active,
      reason: contribution.reason
    };
  }

  function createLayerBoundaryEvents(layer, yearIndex, contribution) {
    const events = [];
    if (layer.included === false) {
      return events;
    }
    if (yearIndex === layer.startYearIndex && contribution.amount > 0) {
      events.push({
        id: `${layer.id}:starts:${yearIndex}`,
        type: "policy-starts",
        yearIndex,
        layerId: layer.id,
        source: layer.source,
        policyType: layer.policyType,
        amount: contribution.amount
      });
    }
    if (layer.policyType === "decreasingTerm" && yearIndex === layer.endYearIndex) {
      events.push({
        id: `${layer.id}:zero:${yearIndex}`,
        type: "decreasing-term-reaches-zero",
        yearIndex,
        layerId: layer.id,
        source: layer.source,
        policyType: layer.policyType,
        amount: 0
      });
    } else if (layer.endYearIndex != null && yearIndex === layer.endYearIndex + 1) {
      events.push({
        id: `${layer.id}:expires:${yearIndex}`,
        type: "policy-expires",
        yearIndex,
        layerId: layer.id,
        source: layer.source,
        policyType: layer.policyType,
        amount: 0
      });
    }
    return events;
  }

  function summarizePoints(points, policyLayers) {
    const totalNeed = roundMoney(points.reduce(function (sum, point) {
      return sum + point.recommendedNeed;
    }, 0));
    const coveredNeed = roundMoney(points.reduce(function (sum, point) {
      return sum + Math.min(point.recommendedNeed, point.totalCoverageAmount);
    }, 0));
    const layersWithContribution = new Set();
    let largestCoverageCliff = 0;

    points.forEach(function (point, index) {
      point.layerContributions.forEach(function (contribution) {
        if (contribution.amount > 0) {
          layersWithContribution.add(contribution.layerId);
        }
      });
      if (index > 0) {
        largestCoverageCliff = Math.max(
          largestCoverageCliff,
          roundMoney(points[index - 1].totalCoverageAmount - point.totalCoverageAmount)
        );
      }
    });

    return {
      peakNeed: roundMoney(Math.max(0, ...points.map((point) => point.recommendedNeed))),
      peakGap: roundMoney(Math.max(0, ...points.map((point) => point.coverageGap))),
      peakSurplus: roundMoney(Math.max(0, ...points.map((point) => point.surplusCoverage))),
      yearsWithGap: points.filter((point) => point.coverageGap > 0).length,
      yearsFullyCovered: points.filter((point) => point.recommendedNeed > 0 && point.coverageGap === 0).length,
      gapCoveredPercentOverall: totalNeed > 0 ? roundPercent((coveredNeed / totalNeed) * 100) : 100,
      largestCoverageCliff: roundMoney(Math.max(0, largestCoverageCliff)),
      activeLayerCount: layersWithContribution.size,
      includedLayerCount: policyLayers.filter((layer) => layer.included !== false).length
    };
  }

  function calculateCoverageTimeline(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const cadence = normalizeString(safeInput.cadence || SUPPORTED_CADENCE);
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate);
    const rawNeedPoints = Array.isArray(safeInput.needPoints) ? safeInput.needPoints : [];

    if (cadence !== SUPPORTED_CADENCE) {
      dataGaps.push(createIssue(
        "unsupported-cadence",
        "Only annual cadence is supported by coverage timeline engine v1.",
        { cadence }
      ));
    }
    if (!valuationDateResult) {
      dataGaps.push(createIssue(
        "missing-valuation-date",
        "A valid valuationDate is required.",
        { valuationDate: safeInput.valuationDate ?? null }
      ));
    }

    const horizonYears = normalizeHorizonYears(safeInput, rawNeedPoints, warnings, dataGaps);
    const needByYear = normalizeNeedPoints(rawNeedPoints, horizonYears, warnings, dataGaps);
    const client = isPlainObject(safeInput.client) ? safeInput.client : {};
    const currentAge = toOptionalNumber(client.currentAge);
    const policyLayers = Array.isArray(safeInput.policyLayers)
      ? safeInput.policyLayers.map(function (layer, index) {
          return normalizePolicyLayer(layer, index, horizonYears, warnings);
        })
      : [];

    if (!Array.isArray(safeInput.policyLayers)) {
      warnings.push(createIssue(
        "missing-policy-layers",
        "policyLayers was missing or not an array and defaulted to an empty list.",
        {}
      ));
    }

    const points = [];
    const allEvents = [];
    let previousGap = 0;
    let previousSurplus = 0;
    let previousCoverage = 0;

    for (let index = 0; index <= horizonYears; index += 1) {
      const needPoint = needByYear.get(index);
      if (!needPoint && rawNeedPoints.length > 0) {
        warnings.push(createIssue(
          "missing-need-point-for-year",
          "No need point was supplied for a projected year; recommendedNeed defaulted to 0.",
          { yearIndex: index }
        ));
      }

      const date = needPoint?.date || addYears(valuationDateResult, index) || null;
      const layerContributions = policyLayers.map(function (layer) {
        return createLayerContribution(layer, index);
      });
      const existingCoverageAmount = roundMoney(layerContributions.reduce(function (sum, contribution) {
        return sum + (contribution.source === "existing" ? contribution.amount : 0);
      }, 0));
      const hypotheticalCoverageAmount = roundMoney(layerContributions.reduce(function (sum, contribution) {
        return sum + (contribution.source === "hypothetical" ? contribution.amount : 0);
      }, 0));
      const recommendedCoverageAmount = roundMoney(layerContributions.reduce(function (sum, contribution) {
        return sum + (contribution.source === "recommended" ? contribution.amount : 0);
      }, 0));
      const totalCoverageAmount = roundMoney(
        existingCoverageAmount + hypotheticalCoverageAmount + recommendedCoverageAmount
      );
      const recommendedNeed = roundMoney(needPoint?.needAmount || 0);
      const coverageGap = roundMoney(Math.max(recommendedNeed - totalCoverageAmount, 0));
      const surplusCoverage = roundMoney(Math.max(totalCoverageAmount - recommendedNeed, 0));
      const events = [];

      layerContributions.forEach(function (contribution) {
        const layer = policyLayers.find((candidate) => candidate.id === contribution.layerId);
        events.push(...createLayerBoundaryEvents(layer, index, contribution));
      });

      if (coverageGap > 0 && previousGap <= 0) {
        events.push({
          id: `coverage-gap-begins:${index}`,
          type: "coverage-gap-begins",
          yearIndex: index,
          amount: coverageGap
        });
      }
      if (coverageGap === 0 && previousGap > 0) {
        events.push({
          id: `coverage-gap-closes:${index}`,
          type: "coverage-gap-closes",
          yearIndex: index,
          amount: 0
        });
      }
      if (surplusCoverage > 0 && previousSurplus <= 0) {
        events.push({
          id: `surplus-begins:${index}`,
          type: "surplus-begins",
          yearIndex: index,
          amount: surplusCoverage
        });
      }
      if (index > 0 && previousCoverage > totalCoverageAmount) {
        const dropAmount = roundMoney(previousCoverage - totalCoverageAmount);
        if (dropAmount > 0) {
          events.push({
            id: `coverage-cliff:${index}`,
            type: "coverage-cliff",
            yearIndex: index,
            amount: dropAmount
          });
        }
      }

      const point = {
        index,
        date,
        calendarYear: getCalendarYear(date),
        clientAge: needPoint?.age ?? (currentAge == null ? null : roundPercent(currentAge + index)),
        recommendedNeed,
        existingCoverageAmount,
        hypotheticalCoverageAmount,
        recommendedCoverageAmount,
        totalCoverageAmount,
        coverageGap,
        surplusCoverage,
        layerContributions,
        events,
        trace: {
          needSource: needPoint ? "supplied-need-points" : "defaulted-missing-need-point",
          needTrace: needPoint?.trace || {},
          layerContributionCount: layerContributions.length
        }
      };

      points.push(point);
      allEvents.push(...events);
      previousGap = coverageGap;
      previousSurplus = surplusCoverage;
      previousCoverage = totalCoverageAmount;
    }

    const summary = summarizePoints(points, policyLayers);

    return {
      calculationVersion: COVERAGE_TIMELINE_ENGINE_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      cadence: SUPPORTED_CADENCE,
      valuationDate: valuationDateResult?.normalizedDate || normalizeString(safeInput.valuationDate),
      horizonYears,
      assumptions: {
        cadence: SUPPORTED_CADENCE,
        needSource: "supplied-need-points",
        policyLayerSource: "supplied-policy-layers"
      },
      points,
      policyLayers,
      events: allEvents,
      summary,
      warnings,
      dataGaps,
      trace: {
        calculationVersion: COVERAGE_TIMELINE_ENGINE_VERSION,
        inputAssumptions: {
          cadence,
          horizonYears,
          valuationDate: valuationDateResult?.normalizedDate || null
        },
        needSource: "supplied-need-points",
        suppliedNeedPointCount: rawNeedPoints.length,
        suppliedLayerCount: Array.isArray(safeInput.policyLayers) ? safeInput.policyLayers.length : 0,
        normalizedLayerCount: policyLayers.length,
        warningCount: warnings.length,
        dataGapCount: dataGaps.length
      }
    };
  }

  lensAnalysis.COVERAGE_TIMELINE_ENGINE_VERSION = COVERAGE_TIMELINE_ENGINE_VERSION;
  lensAnalysis.calculateCoverageTimeline = calculateCoverageTimeline;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_TIMELINE_ENGINE_VERSION,
      calculateCoverageTimeline
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
