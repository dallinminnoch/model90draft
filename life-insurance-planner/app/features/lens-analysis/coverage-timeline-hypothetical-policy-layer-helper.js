(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis pure hypothetical policy layer helper.
  // Purpose: normalize advisor-created hypothetical policy definitions into
  // coverage timeline engine policy layers.
  // Non-goals: no DOM, storage, graph rendering, UI editor, scenario save/load,
  // premium affordability math, cash value projection, method formula changes,
  // Income Impact changes, or AI recommendations.
  const HELPER_VERSION = "coverage-timeline-hypothetical-policy-layer-helper-v1";
  const SUPPORTED_POLICY_TYPES = Object.freeze([
    "term",
    "decreasingTerm",
    "wholeLife",
    "universalLife",
    "groupLife",
    "custom"
  ]);
  const PERMANENT_POLICY_TYPES = Object.freeze(["wholeLife", "universalLife"]);

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

  function normalizeType(value) {
    return normalizeString(value).replace(/[\s_-]+/g, "").toLowerCase();
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

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function normalizePolicyType(policyType, warnings, sourceId) {
    const raw = normalizeString(policyType);
    const compact = normalizeType(raw);
    if (raw === "decreasingTerm" || compact === "decreasingterm") {
      return "decreasingTerm";
    }
    if (raw === "wholeLife" || compact === "wholelife" || compact === "permanent") {
      return "wholeLife";
    }
    if (raw === "universalLife" || compact === "universallife" || compact === "iul" || compact === "vul") {
      return "universalLife";
    }
    if (raw === "groupLife" || compact === "grouplife") {
      return "groupLife";
    }
    if (raw === "custom" || compact === "custom") {
      return "custom";
    }
    if (raw === "term" || compact === "term" || compact === "termlife") {
      return "term";
    }
    warnings.push(createIssue(
      "unsupported-policy-type",
      "Hypothetical policy type was missing or unsupported and was converted to an excluded custom layer.",
      { sourceId, policyType: raw || null }
    ));
    return "custom";
  }

  function getLayerId(source, index) {
    const rawId = normalizeString(source.id);
    if (rawId) {
      return rawId;
    }
    const rawName = normalizeString(source.name);
    if (rawName) {
      return rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `hypothetical-policy-${index + 1}`;
    }
    return `hypothetical-policy-${index + 1}`;
  }

  function normalizeStartYearIndex(source, warnings, dataGaps, sourceId) {
    const startYearIndex = toWholeYearIndex(source.startYearIndex);
    if (startYearIndex != null) {
      return {
        value: startYearIndex,
        source: "startYearIndex",
        assumed: false
      };
    }

    const startAge = toOptionalNumber(source.startAge);
    const currentAge = toOptionalNumber(source.currentAge ?? source.clientCurrentAge);
    if (startAge != null && currentAge != null && startAge >= currentAge) {
      return {
        value: Math.round(startAge - currentAge),
        source: "startAge-currentAge",
        assumed: false
      };
    }

    dataGaps.push(createIssue(
      "missing-start",
      "Hypothetical policy startYearIndex was missing or invalid.",
      { sourceId }
    ));
    warnings.push(createIssue(
      "start-defaulted",
      "Hypothetical policy start defaulted to year 0 so an excluded layer can preserve trace.",
      { sourceId }
    ));
    return {
      value: 0,
      source: "defaulted-year-0",
      assumed: true
    };
  }

  function normalizeEndYearIndex(source, startYearIndex) {
    const endYearIndex = toWholeYearIndex(source.endYearIndex);
    if (endYearIndex != null) {
      return {
        value: endYearIndex,
        source: "endYearIndex",
        assumed: false
      };
    }
    const durationYears = toWholeYearIndex(source.durationYears);
    if (durationYears != null) {
      return {
        value: startYearIndex + durationYears,
        source: "startYearIndex-plus-durationYears",
        durationYears,
        assumed: false
      };
    }
    return {
      value: null,
      source: null,
      assumed: false
    };
  }

  function normalizeSchedulePoint(point, index, sourceId, warnings) {
    if (!isPlainObject(point)) {
      warnings.push(createIssue(
        "invalid-custom-schedule-point",
        "Custom benefit schedule point was ignored because it was not an object.",
        { sourceId, index }
      ));
      return null;
    }
    const yearIndex = toWholeYearIndex(point.yearIndex);
    const amount = toOptionalNumber(point.amount ?? point.benefitAmount ?? point.deathBenefit);
    if (yearIndex == null || amount == null || amount < 0) {
      warnings.push(createIssue(
        "invalid-custom-schedule-point",
        "Custom benefit schedule point was ignored because yearIndex or amount was invalid.",
        { sourceId, index }
      ));
      return null;
    }
    return {
      yearIndex,
      amount: roundMoney(amount)
    };
  }

  function normalizeExplicitSchedule(source, warnings, sourceId) {
    const sourceSchedule = isPlainObject(source.benefitSchedule)
      ? source.benefitSchedule.points
      : source.benefitSchedule;
    return Array.isArray(sourceSchedule)
      ? sourceSchedule
          .map(function (point, index) {
            return normalizeSchedulePoint(point, index, sourceId, warnings);
          })
          .filter(Boolean)
          .sort((left, right) => left.yearIndex - right.yearIndex)
      : [];
  }

  function buildLinearDecreasingSchedule(startYearIndex, endYearIndex, initialBenefit, finalBenefit) {
    if (endYearIndex == null || endYearIndex <= startYearIndex) {
      return [];
    }
    const duration = endYearIndex - startYearIndex;
    const points = [];
    for (let yearIndex = startYearIndex; yearIndex <= endYearIndex; yearIndex += 1) {
      const elapsed = yearIndex - startYearIndex;
      const ratio = elapsed / duration;
      points.push({
        yearIndex,
        amount: roundMoney(initialBenefit - ((initialBenefit - finalBenefit) * ratio))
      });
    }
    return points;
  }

  function getPrimaryDeathBenefit(source, policyType) {
    const initial = toOptionalNumber(source.initialDeathBenefit);
    const deathBenefit = toOptionalNumber(source.deathBenefit);
    if (policyType === "decreasingTerm") {
      return initial ?? deathBenefit;
    }
    return deathBenefit ?? initial;
  }

  function normalizePremiumMetadata(source, warnings, sourceId) {
    const premiumSource = isPlainObject(source.premium) ? source.premium : {};
    const hasPremium = Object.keys(premiumSource).length > 0
      || source.premiumAmount != null
      || source.premiumMode != null;
    if (!hasPremium) {
      return null;
    }
    warnings.push(createIssue(
      "premium-display-only",
      "Premium metadata was passed through only; premium burden is not modeled in timeline gap math.",
      { sourceId }
    ));
    return {
      ...clonePlainValue(premiumSource),
      amount: toOptionalNumber(premiumSource.amount ?? source.premiumAmount),
      mode: normalizeString(premiumSource.mode ?? source.premiumMode),
      modeledInGapMath: false,
      displayOnly: true
    };
  }

  function normalizeCashValueMetadata(source, warnings, sourceId) {
    const cashValueSource = isPlainObject(source.cashValue) ? source.cashValue : {};
    const hasCashValue = Object.keys(cashValueSource).length > 0
      || source.cashValueAmount != null
      || source.currentCashValue != null;
    if (!hasCashValue) {
      return null;
    }
    warnings.push(createIssue(
      "cash-value-display-only",
      "Cash value metadata was passed through only; no cash value projection or offset math was applied.",
      { sourceId }
    ));
    return {
      ...clonePlainValue(cashValueSource),
      amount: toOptionalNumber(cashValueSource.amount ?? source.cashValueAmount ?? source.currentCashValue),
      projectedValues: Array.isArray(cashValueSource.projectedValues)
        ? clonePlainValue(cashValueSource.projectedValues)
        : [],
      modeledInGapMath: false,
      displayOnly: true
    };
  }

  function createExcludedLayer(options) {
    return {
      id: options.layerId,
      source: "hypothetical",
      name: options.name,
      policyType: options.policyType,
      startYearIndex: options.startYearIndex,
      endYearIndex: options.endYearIndex,
      deathBenefit: 0,
      included: false,
      benefitSchedule: options.benefitSchedule || [],
      premium: options.premium,
      cashValue: options.cashValue,
      notes: options.notes,
      trace: options.trace
    };
  }

  function buildHypotheticalPolicyLayer(input, index = 0) {
    const source = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const layerId = getLayerId(source, index);
    const name = normalizeString(source.name) || layerId;
    const policyType = normalizePolicyType(source.policyType, warnings, layerId);
    const start = normalizeStartYearIndex(source, warnings, dataGaps, layerId);
    const end = normalizeEndYearIndex(source, start.value);
    const premium = normalizePremiumMetadata(source, warnings, layerId);
    const cashValue = normalizeCashValueMetadata(source, warnings, layerId);
    const explicitSchedule = normalizeExplicitSchedule(source, warnings, layerId);
    const primaryDeathBenefit = getPrimaryDeathBenefit(source, policyType);
    const finalDeathBenefit = toOptionalNumber(source.finalDeathBenefit) ?? 0;
    const explicitlyExcluded = source.included === false;
    const notes = normalizeString(source.notes);
    let benefitSchedule = explicitSchedule;
    let scheduleMode = explicitSchedule.length ? "explicit-schedule" : "none";
    let included = !explicitlyExcluded;
    let deathBenefit = roundMoney(Math.max(0, primaryDeathBenefit || 0));
    const inclusionReasons = [];

    if (!isPlainObject(input)) {
      dataGaps.push(createIssue(
        "invalid-policy-input",
        "Hypothetical policy input was not an object.",
        { index }
      ));
      included = false;
      inclusionReasons.push("invalid-policy-input");
    }
    if (!normalizeString(source.id) && !normalizeString(source.name)) {
      warnings.push(createIssue(
        "missing-id-name",
        "Hypothetical policy input was missing id and name; a deterministic id was generated.",
        { layerId }
      ));
    }
    if (explicitlyExcluded) {
      inclusionReasons.push("explicitly-excluded");
    }

    if (policyType !== "custom" && (primaryDeathBenefit == null || primaryDeathBenefit <= 0)) {
      dataGaps.push(createIssue(
        "missing-death-benefit",
        "Hypothetical policy death benefit was missing or invalid.",
        { layerId, policyType }
      ));
      included = false;
      inclusionReasons.push("missing-death-benefit");
    }

    if (policyType === "term" || policyType === "decreasingTerm" || policyType === "groupLife") {
      if (end.value == null || end.value <= start.value) {
        dataGaps.push(createIssue(
          "missing-duration-end",
          "Term, decreasing term, and group life hypothetical policies require durationYears or endYearIndex.",
          { layerId, policyType }
        ));
        included = false;
        inclusionReasons.push("missing-duration-end");
      }
    }

    if (policyType === "decreasingTerm") {
      if (finalDeathBenefit > deathBenefit) {
        warnings.push(createIssue(
          "decreasing-final-benefit-greater-than-initial",
          "Decreasing term finalDeathBenefit was greater than initialDeathBenefit.",
          { layerId, initialDeathBenefit: deathBenefit, finalDeathBenefit }
        ));
      }
      benefitSchedule = explicitSchedule.length
        ? explicitSchedule
        : buildLinearDecreasingSchedule(start.value, end.value, deathBenefit, Math.max(0, finalDeathBenefit));
      scheduleMode = explicitSchedule.length ? "explicit-schedule" : "linear-decreasing";
    }

    if (policyType === "custom") {
      if (!explicitSchedule.length) {
        dataGaps.push(createIssue(
          "custom-schedule-missing",
          "Custom hypothetical policy requires valid benefitSchedule points.",
          { layerId }
        ));
        included = false;
        inclusionReasons.push("custom-schedule-missing");
      } else {
        deathBenefit = 0;
        scheduleMode = "explicit-schedule";
      }
    }

    if (PERMANENT_POLICY_TYPES.includes(policyType)) {
      scheduleMode = "permanent-level";
    } else if (policyType === "term" || policyType === "groupLife") {
      scheduleMode = "level-window";
    }

    const trace = {
      helperVersion: HELPER_VERSION,
      sourceInputId: normalizeString(source.id) || null,
      sourceInputName: normalizeString(source.name) || null,
      normalizedPolicyType: policyType,
      benefitScheduleMode: scheduleMode,
      startEndAssumptions: {
        startYearIndex: start.value,
        startSource: start.source,
        startAssumed: start.assumed,
        endYearIndex: end.value,
        endSource: end.source,
        endAssumed: end.assumed
      },
      inclusion: {
        included,
        reason: included ? "included" : (inclusionReasons.join(",") || "validation-failed")
      },
      premiumTreatment: premium ? "display-only-not-modeled" : "none",
      cashValueTreatment: cashValue ? "display-only-not-modeled" : "none",
      warningCount: warnings.length,
      dataGapCount: dataGaps.length
    };

    const baseLayer = {
      id: layerId,
      source: "hypothetical",
      name,
      policyType,
      startYearIndex: start.value,
      endYearIndex: end.value,
      deathBenefit,
      included,
      benefitSchedule,
      premium,
      cashValue,
      notes,
      trace
    };

    return {
      layer: included
        ? baseLayer
        : createExcludedLayer({
            layerId,
            name,
            policyType,
            startYearIndex: start.value,
            endYearIndex: end.value,
            benefitSchedule,
            premium,
            cashValue,
            notes,
            trace
          }),
      warnings,
      dataGaps,
      trace
    };
  }

  function buildHypotheticalPolicyLayers(inputs) {
    const sourceInputs = Array.isArray(inputs) ? inputs : [];
    const warnings = [];
    const dataGaps = [];
    if (!Array.isArray(inputs)) {
      dataGaps.push(createIssue(
        "missing-hypothetical-policy-inputs",
        "Hypothetical policy inputs must be supplied as an array.",
        {}
      ));
    }
    const results = sourceInputs.map(function (input, index) {
      return buildHypotheticalPolicyLayer(input, index);
    });
    const layers = results.map((result) => result.layer);
    results.forEach(function (result) {
      warnings.push(...result.warnings);
      dataGaps.push(...result.dataGaps);
    });
    return {
      layers,
      warnings,
      dataGaps,
      trace: {
        helperVersion: HELPER_VERSION,
        inputCount: sourceInputs.length,
        layerCount: layers.length,
        includedCount: layers.filter((layer) => layer && layer.included !== false).length,
        warningCount: warnings.length,
        dataGapCount: dataGaps.length
      }
    };
  }

  lensAnalysis.COVERAGE_TIMELINE_HYPOTHETICAL_POLICY_LAYER_HELPER_VERSION = HELPER_VERSION;
  lensAnalysis.buildHypotheticalPolicyLayer = buildHypotheticalPolicyLayer;
  lensAnalysis.buildHypotheticalPolicyLayers = buildHypotheticalPolicyLayers;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_TIMELINE_HYPOTHETICAL_POLICY_LAYER_HELPER_VERSION: HELPER_VERSION,
      buildHypotheticalPolicyLayer,
      buildHypotheticalPolicyLayers
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
