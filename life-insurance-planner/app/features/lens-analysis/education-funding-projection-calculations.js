(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis education funding projection helper.
  // Purpose: provide pure per-child education funding timing calculations for
  // future method wiring. This file is intentionally not loaded by production
  // pages yet.
  // Non-goals: no DOM access, no storage access, no method wiring, no adapter
  // mapping, no PMI mutation, no Lens model mutation, and no planned-dependent
  // projection unless dated child records are explicitly supplied.

  const CALCULATION_VERSION = 1;
  const DEFAULT_EDUCATION_START_AGE = 18;
  const DEFAULT_TIMING = "annual";
  const MAX_RATE_PERCENT = 100;
  const MAX_REASONABLE_AGE = 120;

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
        createWarning(invalidCode, `${fieldName} is missing or invalid; ${fallback} was used.`, {
          received: value
        })
      );
      return fallback;
    }

    if (parsed < 0) {
      warnings.push(
        createWarning(negativeCode, `${fieldName} cannot be negative; ${fallback} was used.`, {
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

  function normalizeEducationStartAge(value, warnings) {
    const parsed = toOptionalNumber(value);

    if (parsed === null) {
      warnings.push(
        createWarning(
          "invalid-education-start-age",
          "educationStartAge is missing or invalid; 18 was used.",
          { received: value, fallback: DEFAULT_EDUCATION_START_AGE }
        )
      );
      return DEFAULT_EDUCATION_START_AGE;
    }

    if (parsed <= 0 || parsed > MAX_REASONABLE_AGE) {
      warnings.push(
        createWarning(
          "education-start-age-out-of-range",
          "educationStartAge was outside the supported range; 18 was used.",
          { received: parsed, fallback: DEFAULT_EDUCATION_START_AGE }
        )
      );
      return DEFAULT_EDUCATION_START_AGE;
    }

    return parsed;
  }

  function formatDateParts(year, monthIndex, day) {
    const month = String(monthIndex + 1).padStart(2, "0");
    const normalizedDay = String(day).padStart(2, "0");
    return `${year}-${month}-${normalizedDay}`;
  }

  function parseDateInput(value) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
      return {
        date,
        normalizedDate: formatDateParts(date.getFullYear(), date.getMonth(), date.getDate())
      };
    }

    const normalized = normalizeString(value);
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== month - 1
      || date.getDate() !== day
    ) {
      return null;
    }

    return {
      date,
      normalizedDate: formatDateParts(year, month - 1, day)
    };
  }

  function normalizeAsOfDate(value, warnings) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      warnings.push(
        createWarning("missing-as-of-date", "asOfDate is required for education projection; current-dollar amounts were returned.")
      );

      return {
        date: null,
        normalizedDate: null,
        warningCode: "missing-as-of-date"
      };
    }

    const parsed = parseDateInput(value);
    if (parsed) {
      return parsed;
    }

    warnings.push(
      createWarning("invalid-as-of-date", "asOfDate was invalid; current-dollar amounts were returned.", {
        received: value
      })
    );

    return {
      date: null,
      normalizedDate: null,
      warningCode: "invalid-as-of-date"
    };
  }

  function calculateAgeFromDateOfBirth(dateOfBirthValue, asOfDateValue) {
    const birthDate = parseDateInput(dateOfBirthValue);
    const asOfDate = parseDateInput(asOfDateValue);

    if (!birthDate || !asOfDate || birthDate.date > asOfDate.date) {
      return null;
    }

    let age = asOfDate.date.getFullYear() - birthDate.date.getFullYear();
    const monthDelta = asOfDate.date.getMonth() - birthDate.date.getMonth();

    if (monthDelta < 0 || (monthDelta === 0 && asOfDate.date.getDate() < birthDate.date.getDate())) {
      age -= 1;
    }

    return Number.isFinite(age) && age >= 0 ? age : null;
  }

  function calculateYearsUntilEducationStart(currentAge, educationStartAge) {
    const age = toOptionalNumber(currentAge);
    const startAge = toOptionalNumber(educationStartAge);

    if (age === null || startAge === null) {
      return null;
    }

    return Math.max(startAge - age, 0);
  }

  function normalizeEducationProjectionInput(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const asOfDate = normalizeAsOfDate(safeInput.asOfDate, warnings);
    const dependentDetails = Array.isArray(safeInput.dependentDetails)
      ? safeInput.dependentDetails.slice()
      : [];

    if (!Array.isArray(safeInput.dependentDetails)) {
      warnings.push(
        createWarning("invalid-dependent-details", "dependentDetails must be an array; no children were projected.", {
          receivedType: typeof safeInput.dependentDetails
        })
      );
    }

    return {
      dependentDetails,
      perChildFundingAmount: roundValue(normalizeNonNegativeNumber(safeInput.perChildFundingAmount, 0, {
        warnings,
        fieldName: "perChildFundingAmount",
        invalidCode: "invalid-per-child-funding-amount",
        negativeCode: "negative-per-child-funding-amount"
      })),
      ratePercent: normalizeRatePercent(safeInput.ratePercent, warnings),
      enabled: safeInput.enabled === true,
      educationStartAge: normalizeEducationStartAge(safeInput.educationStartAge, warnings),
      timing: normalizeTiming(safeInput.timing),
      asOfDate: asOfDate.normalizedDate,
      asOfDateObject: asOfDate.date,
      asOfDateWarningCode: asOfDate.warningCode || null,
      source: safeInput.source === undefined ? null : safeInput.source,
      warnings
    };
  }

  function getChildIdentifier(child, index) {
    if (!isPlainObject(child)) {
      return null;
    }

    const id = normalizeString(child.id);
    return id || null;
  }

  function getDateOfBirthValue(child) {
    if (!isPlainObject(child)) {
      return "";
    }

    return child.dateOfBirth ?? child.birthDate ?? "";
  }

  function createInvalidChildRow(child, index, warnings) {
    return {
      index,
      id: getChildIdentifier(child, index),
      dateOfBirth: isPlainObject(child) ? normalizeString(getDateOfBirthValue(child)) : "",
      currentAge: null,
      yearsUntilEducationStart: null,
      baseAmount: 0,
      projectedAmount: 0,
      inflationFactor: 1,
      applied: false,
      warnings
    };
  }

  function createCurrentDollarUnavailableAsOfDateRow(child, index, normalized, parsedBirthDate) {
    return {
      index,
      id: getChildIdentifier(child, index),
      dateOfBirth: parsedBirthDate.normalizedDate,
      currentAge: null,
      yearsUntilEducationStart: null,
      baseAmount: normalized.perChildFundingAmount,
      projectedAmount: normalized.perChildFundingAmount,
      inflationFactor: 1,
      applied: false,
      warnings: []
    };
  }

  function getInflationExponent(yearsUntilEducationStart, timing) {
    if (timing === "beginning") {
      return Math.max(yearsUntilEducationStart - 1, 0);
    }

    return yearsUntilEducationStart;
  }

  function createProjectedChildRow(child, index, normalized) {
    const dateOfBirthValue = getDateOfBirthValue(child);
    const parsedBirthDate = parseDateInput(dateOfBirthValue);
    const childWarnings = [];

    if (!normalizeString(dateOfBirthValue)) {
      childWarnings.push(
        createWarning("missing-date-of-birth", "Child dateOfBirth was missing; child was not projected.", {
          index
        })
      );
      return createInvalidChildRow(child, index, childWarnings);
    }

    if (!parsedBirthDate) {
      childWarnings.push(
        createWarning("invalid-date-of-birth", "Child dateOfBirth was invalid; child was not projected.", {
          index,
          received: dateOfBirthValue
        })
      );
      return createInvalidChildRow(child, index, childWarnings);
    }

    if (!normalized.asOfDateObject) {
      return createCurrentDollarUnavailableAsOfDateRow(child, index, normalized, parsedBirthDate);
    }

    if (parsedBirthDate.date > normalized.asOfDateObject) {
      childWarnings.push(
        createWarning("future-date-of-birth", "Child dateOfBirth is after asOfDate; child was not projected.", {
          index,
          received: parsedBirthDate.normalizedDate,
          asOfDate: normalized.asOfDate
        })
      );
      return createInvalidChildRow(child, index, childWarnings);
    }

    const currentAge = calculateAgeFromDateOfBirth(parsedBirthDate.normalizedDate, normalized.asOfDate);
    const yearsUntilEducationStart = calculateYearsUntilEducationStart(
      currentAge,
      normalized.educationStartAge
    );
    const exponent = getInflationExponent(yearsUntilEducationStart, normalized.timing);
    const shouldApplyInflation = normalized.enabled === true && normalized.ratePercent > 0;
    const inflationFactor = shouldApplyInflation
      ? Math.pow(1 + normalized.ratePercent / 100, exponent)
      : 1;
    const projectedAmount = normalized.perChildFundingAmount * inflationFactor;

    return {
      index,
      id: getChildIdentifier(child, index),
      dateOfBirth: parsedBirthDate.normalizedDate,
      currentAge,
      yearsUntilEducationStart: roundRatio(yearsUntilEducationStart),
      baseAmount: normalized.perChildFundingAmount,
      projectedAmount: roundValue(projectedAmount),
      inflationFactor: roundRatio(inflationFactor),
      applied: shouldApplyInflation,
      warnings: childWarnings
    };
  }

  function buildEducationProjectionRows(dependentDetails, normalizedInput) {
    const normalized = isPlainObject(normalizedInput) && Array.isArray(normalizedInput.warnings)
      ? normalizedInput
      : normalizeEducationProjectionInput(normalizedInput);
    const safeDependentDetails = Array.isArray(dependentDetails) ? dependentDetails : [];

    return safeDependentDetails.map(function (child, index) {
      return createProjectedChildRow(child, index, normalized);
    });
  }

  function sumEducationProjectionRows(rows, fieldName) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const key = normalizeString(fieldName) || "projectedAmount";

    return roundValue(
      safeRows.reduce(function (total, row) {
        if (!isPlainObject(row)) {
          return total;
        }

        const value = toOptionalNumber(row[key]);
        return total + (value === null ? 0 : value);
      }, 0)
    );
  }

  function collectChildWarnings(childRows) {
    const safeRows = Array.isArray(childRows) ? childRows : [];

    return safeRows.reduce(function (warnings, row) {
      if (!isPlainObject(row) || !Array.isArray(row.warnings)) {
        return warnings;
      }

      return warnings.concat(row.warnings);
    }, []);
  }

  function getTraceReason(normalized, applied, validChildCount) {
    if (!normalized.enabled) {
      return "education-inflation-disabled";
    }

    if (!normalized.asOfDateObject) {
      return normalized.asOfDateWarningCode || "missing-as-of-date";
    }

    if (validChildCount <= 0) {
      return "no-valid-dependent-birthdates";
    }

    if (normalized.ratePercent <= 0) {
      return "zero-rate-current-dollar";
    }

    return applied ? "education-inflation-applied" : "education-inflation-not-applied";
  }

  function buildEducationProjectionTrace(normalized, childRows, projectedTotal, applied) {
    const childWarningCodes = childRows.reduce(function (codes, row) {
      if (!isPlainObject(row) || !Array.isArray(row.warnings)) {
        return codes;
      }

      row.warnings.forEach(function (warning) {
        if (warning && warning.code) {
          codes.push(warning.code);
        }
      });
      return codes;
    }, []);
    const validChildCount = childRows.filter(function (row) {
      return isPlainObject(row) && row.currentAge !== null;
    }).length;

    return {
      source: "education-funding-projection-calculations",
      calculationVersion: CALCULATION_VERSION,
      inputSource: normalized.source,
      enabled: normalized.enabled,
      applied,
      reason: getTraceReason(normalized, applied, validChildCount),
      ratePercent: normalized.ratePercent,
      educationStartAge: normalized.educationStartAge,
      timing: normalized.timing,
      asOfDate: normalized.asOfDate,
      perChildFundingAmount: normalized.perChildFundingAmount,
      currentDollarTotal: sumEducationProjectionRows(childRows, "baseAmount"),
      projectedTotal,
      inputChildCount: normalized.dependentDetails.length,
      validChildCount,
      formula: !normalized.asOfDateObject
        ? "sum(perChildFundingAmount for each child with valid dateOfBirth); projection unavailable without valid asOfDate"
        : (applied
          ? "sum(perChildFundingAmount * (1 + ratePercent / 100) ^ yearsUntilEducationStart for each valid dated child)"
          : "sum(perChildFundingAmount for each valid dated child); education inflation not applied"),
      warningCodes: normalized.warnings.map(function (warning) {
        return warning.code;
      }).concat(childWarningCodes)
    };
  }

  function calculateEducationFundingProjection(input) {
    const normalized = normalizeEducationProjectionInput(input);
    const childRows = buildEducationProjectionRows(normalized.dependentDetails, normalized);
    const currentDollarTotal = sumEducationProjectionRows(childRows, "baseAmount");
    const projectedTotal = sumEducationProjectionRows(childRows, "projectedAmount");
    const applied = childRows.some(function (row) {
      return isPlainObject(row) && row.applied === true;
    });

    if (!normalized.enabled) {
      normalized.warnings.push(
        createWarning(
          "education-inflation-disabled",
          "Education inflation was disabled; current-dollar per-child funding amounts were returned."
        )
      );
    }
    const warnings = normalized.warnings.concat(collectChildWarnings(childRows));

    return {
      currentDollarTotal,
      projectedTotal: normalized.enabled ? projectedTotal : currentDollarTotal,
      childRows,
      applied,
      ratePercent: normalized.ratePercent,
      educationStartAge: normalized.educationStartAge,
      timing: normalized.timing,
      source: normalized.source,
      warnings,
      trace: buildEducationProjectionTrace(
        normalized,
        childRows,
        normalized.enabled ? projectedTotal : currentDollarTotal,
        applied
      )
    };
  }

  lensAnalysis.calculateEducationFundingProjection = calculateEducationFundingProjection;
  lensAnalysis.normalizeEducationProjectionInput = normalizeEducationProjectionInput;
  lensAnalysis.calculateEducationProjectionAgeFromDateOfBirth = calculateAgeFromDateOfBirth;
  lensAnalysis.calculateYearsUntilEducationStart = calculateYearsUntilEducationStart;
  lensAnalysis.buildEducationProjectionRows = buildEducationProjectionRows;
  lensAnalysis.sumEducationProjectionRows = sumEducationProjectionRows;
})(window);
