(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis inflation projection helper.
  // Purpose: provide pure current-dollar-to-projected-output calculations for
  // future method wiring. This file is intentionally not loaded by production
  // pages yet.
  // Non-goals: no DOM access, no storage access, no method wiring, no adapter
  // mapping, no PMI mutation, and no Lens model mutation.

  const CALCULATION_VERSION = 1;
  const DEFAULT_TIMING = "annual";
  const MAX_RATE_PERCENT = 100;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toOptionalNumber(value) {
    if (typeof lensAnalysis.toOptionalNumber === "function") {
      return lensAnalysis.toOptionalNumber(value);
    }

    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value).replace(/[$,%\s,]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundValue(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRatio(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
  }

  function normalizeTiming(value) {
    const normalized = normalizeString(value).toLowerCase();

    if (normalized === "start" || normalized === "beginning") {
      return "beginning";
    }

    if (normalized === "end" || normalized === "annual" || normalized === "year-end") {
      return "annual";
    }

    return DEFAULT_TIMING;
  }

  function normalizeNonNegativeNumber(value, fallback, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const warnings = Array.isArray(safeOptions.warnings) ? safeOptions.warnings : [];
    const fieldName = normalizeString(safeOptions.fieldName) || "value";
    const invalidCode = normalizeString(safeOptions.invalidCode) || `invalid-${fieldName}`;
    const negativeCode = normalizeString(safeOptions.negativeCode) || `negative-${fieldName}`;
    const parsed = toOptionalNumber(value);

    if (parsed === null) {
      warnings.push(
        createWarning(invalidCode, `${fieldName} is missing or invalid; 0 was used.`, {
          received: value
        })
      );
      return fallback;
    }

    if (parsed < 0) {
      warnings.push(
        createWarning(negativeCode, `${fieldName} cannot be negative; 0 was used.`, {
          received: parsed
        })
      );
      return fallback;
    }

    return parsed;
  }

  function normalizeRatePercent(value, warnings) {
    const parsed = toOptionalNumber(value);

    if (parsed === null) {
      warnings.push(
        createWarning("invalid-rate-percent", "ratePercent is missing or invalid; 0 was used.", {
          received: value
        })
      );
      return 0;
    }

    if (parsed < 0) {
      warnings.push(
        createWarning("negative-rate-percent", "ratePercent cannot be negative; 0 was used.", {
          received: parsed
        })
      );
      return 0;
    }

    if (parsed > MAX_RATE_PERCENT) {
      warnings.push(
        createWarning("rate-percent-clamped", "ratePercent was above 100%; 100 was used.", {
          received: parsed,
          max: MAX_RATE_PERCENT
        })
      );
      return MAX_RATE_PERCENT;
    }

    return parsed;
  }

  function normalizeInflationProjectionInput(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const amount = normalizeNonNegativeNumber(safeInput.amount, 0, {
      warnings,
      fieldName: "amount",
      invalidCode: "invalid-amount",
      negativeCode: "negative-amount"
    });
    const durationYears = normalizeNonNegativeNumber(safeInput.durationYears, 0, {
      warnings,
      fieldName: "durationYears",
      invalidCode: "invalid-duration-years",
      negativeCode: "negative-duration-years"
    });
    const ratePercent = normalizeRatePercent(safeInput.ratePercent, warnings);

    return {
      amount: roundValue(amount),
      durationYears,
      ratePercent,
      enabled: safeInput.enabled === true,
      timing: normalizeTiming(safeInput.timing),
      label: normalizeString(safeInput.label) || null,
      source: safeInput.source === undefined ? null : safeInput.source,
      warnings
    };
  }

  function getInflationExponent(yearIndex, timing) {
    return timing === "beginning" ? yearIndex - 1 : yearIndex;
  }

  function createAnnualValue(amount, ratePercent, timing, yearIndex, yearFraction) {
    const exponent = getInflationExponent(yearIndex, timing);
    const inflationFactor = Math.pow(1 + ratePercent / 100, exponent);
    const annualizedAmount = amount * inflationFactor;

    return {
      year: yearIndex,
      yearFraction: roundRatio(yearFraction),
      inflationFactor: roundRatio(inflationFactor),
      annualizedAmount: roundValue(annualizedAmount),
      amount: roundValue(annualizedAmount * yearFraction)
    };
  }

  function buildAnnualInflationValues(input) {
    const normalized = isPlainObject(input) && Array.isArray(input.warnings)
      ? input
      : normalizeInflationProjectionInput(input);
    const amount = normalized.amount;
    const durationYears = normalized.durationYears;
    const ratePercent = normalized.ratePercent;
    const timing = normalizeTiming(normalized.timing);
    const fullYears = Math.floor(durationYears);
    const partialYear = durationYears - fullYears;
    const values = [];

    for (let yearIndex = 1; yearIndex <= fullYears; yearIndex += 1) {
      values.push(createAnnualValue(amount, ratePercent, timing, yearIndex, 1));
    }

    if (partialYear > 0) {
      values.push(createAnnualValue(amount, ratePercent, timing, fullYears + 1, partialYear));
    }

    return values;
  }

  function buildCurrentDollarAnnualValues(amount, durationYears) {
    const fullYears = Math.floor(durationYears);
    const partialYear = durationYears - fullYears;
    const values = [];

    for (let yearIndex = 1; yearIndex <= fullYears; yearIndex += 1) {
      values.push({
        year: yearIndex,
        yearFraction: 1,
        inflationFactor: 1,
        annualizedAmount: roundValue(amount),
        amount: roundValue(amount)
      });
    }

    if (partialYear > 0) {
      values.push({
        year: fullYears + 1,
        yearFraction: roundRatio(partialYear),
        inflationFactor: 1,
        annualizedAmount: roundValue(amount),
        amount: roundValue(amount * partialYear)
      });
    }

    return values;
  }

  function sumInflationValues(values) {
    const safeValues = Array.isArray(values) ? values : [];
    return roundValue(
      safeValues.reduce((total, value) => {
        const amount = isPlainObject(value) ? toOptionalNumber(value.amount) : null;
        return total + (amount === null ? 0 : amount);
      }, 0)
    );
  }

  function buildProjectionTrace(normalized, annualValues, projectedTotal, applied) {
    const formula = applied
      ? "sum(amount * (1 + ratePercent / 100) ^ yearIndex for each projected year)"
      : "amount * durationYears; inflation disabled";

    return {
      source: "inflation-projection-calculations",
      calculationVersion: CALCULATION_VERSION,
      label: normalized.label,
      inputSource: normalized.source,
      baseAmount: normalized.amount,
      durationYears: normalized.durationYears,
      ratePercent: normalized.ratePercent,
      enabled: normalized.enabled,
      applied,
      timing: normalized.timing,
      projectedTotal,
      annualValueCount: annualValues.length,
      formula,
      warningCodes: normalized.warnings.map((warning) => warning.code)
    };
  }

  function calculateInflationProjection(input) {
    const normalized = normalizeInflationProjectionInput(input);
    const annualValues = normalized.enabled
      ? buildAnnualInflationValues(normalized)
      : buildCurrentDollarAnnualValues(normalized.amount, normalized.durationYears);
    const projectedTotal = normalized.enabled
      ? sumInflationValues(annualValues)
      : roundValue(normalized.amount * normalized.durationYears);
    const applied = normalized.enabled === true;

    if (!normalized.enabled) {
      normalized.warnings.push(
        createWarning(
          "inflation-disabled",
          "Inflation projection was disabled; current-dollar values were returned."
        )
      );
    }

    return {
      amount: normalized.amount,
      projectedTotal,
      annualValues,
      applied,
      ratePercent: normalized.ratePercent,
      durationYears: normalized.durationYears,
      timing: normalized.timing,
      label: normalized.label,
      source: normalized.source,
      warnings: normalized.warnings,
      trace: buildProjectionTrace(normalized, annualValues, projectedTotal, applied)
    };
  }

  lensAnalysis.calculateInflationProjection = calculateInflationProjection;
  lensAnalysis.normalizeInflationProjectionInput = normalizeInflationProjectionInput;
  lensAnalysis.buildAnnualInflationValues = buildAnnualInflationValues;
  lensAnalysis.sumInflationValues = sumInflationValues;
})(window);
