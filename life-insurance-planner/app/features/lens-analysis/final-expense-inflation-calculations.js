(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis final expense inflation helper.
  // Purpose: project a current-dollar final expense amount to a target age from
  // explicit DOB and valuation facts. Keep method wiring and rendering out.
  // Non-goals: no DOM access, no storage access, no model mutation, no Step 3
  // rendering, and no recurring support/education projection math.

  const CALCULATION_VERSION = 1;
  const RATE_SOURCE_PATH = "settings.inflationAssumptions.finalExpenseInflationRatePercent";
  const TARGET_AGE_SOURCE_PATH = "settings.inflationAssumptions.finalExpenseTargetAge";

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function toOptionalNumber(value) {
    if (typeof lensAnalysis.toOptionalNumber === "function") {
      return lensAnalysis.toOptionalNumber(value);
    }

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

  function formatDateOnlyFromDate(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDateOnly(value) {
    if (value == null || value === "") {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? null
        : {
            date: new Date(value.getFullYear(), value.getMonth(), value.getDate()),
            normalizedDate: formatDateOnlyFromDate(value)
          };
    }

    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return {
      date,
      normalizedDate: formatDateOnlyFromDate(date)
    };
  }

  function calculateCurrentAge(dateOfBirth, valuationDate) {
    const birth = parseDateOnly(dateOfBirth);
    const valuation = parseDateOnly(valuationDate);
    if (!birth || !valuation) {
      return null;
    }

    let age = valuation.date.getFullYear() - birth.date.getFullYear();
    const birthdayHasOccurred = valuation.date.getMonth() > birth.date.getMonth()
      || (
        valuation.date.getMonth() === birth.date.getMonth()
        && valuation.date.getDate() >= birth.date.getDate()
      );
    if (!birthdayHasOccurred) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function getDateOfBirthStatus(input, parsedDateOfBirth) {
    const explicitStatus = String(input.clientDateOfBirthStatus || "").trim();
    if (explicitStatus) {
      return explicitStatus;
    }

    if (input.clientDateOfBirth == null || input.clientDateOfBirth === "") {
      return "missing";
    }

    return parsedDateOfBirth ? "valid" : "invalid";
  }

  function createBaseTrace(input) {
    const amount = toOptionalNumber(input.currentFinalExpenseAmount);
    const currentFinalExpenseAmount = amount == null ? 0 : Math.max(0, amount);
    const rate = toOptionalNumber(input.finalExpenseInflationRatePercent);
    const targetAge = toOptionalNumber(input.finalExpenseTargetAge);
    const parsedDateOfBirth = parseDateOnly(input.clientDateOfBirth);
    const parsedValuationDate = parseDateOnly(input.valuationDate);
    const currentAge = parsedDateOfBirth && parsedValuationDate
      ? calculateCurrentAge(parsedDateOfBirth.normalizedDate, parsedValuationDate.normalizedDate)
      : null;

    return {
      source: "final-expense-inflation-calculations",
      calculationVersion: CALCULATION_VERSION,
      currentFinalExpenseAmount: roundMoney(currentFinalExpenseAmount),
      projectedFinalExpenseAmount: roundMoney(currentFinalExpenseAmount),
      finalExpenseInflationRatePercent: rate,
      finalExpenseTargetAge: targetAge,
      clientDateOfBirth: parsedDateOfBirth ? parsedDateOfBirth.normalizedDate : null,
      clientDateOfBirthSourcePath: input.clientDateOfBirthSourcePath || null,
      clientDateOfBirthStatus: getDateOfBirthStatus(input, parsedDateOfBirth),
      valuationDate: parsedValuationDate ? parsedValuationDate.normalizedDate : null,
      valuationDateSource: input.valuationDateSource || null,
      valuationDateDefaulted: input.valuationDateDefaulted === true,
      currentAge,
      projectionYears: 0,
      applied: false,
      reason: null,
      warningCode: null,
      rateSourcePath: input.rateSourcePath || RATE_SOURCE_PATH,
      targetAgeSourcePath: input.targetAgeSourcePath || TARGET_AGE_SOURCE_PATH
    };
  }

  function withFallback(baseTrace, reason, warningCode) {
    return {
      ...baseTrace,
      applied: false,
      reason,
      warningCode: warningCode || null,
      projectedFinalExpenseAmount: baseTrace.currentFinalExpenseAmount
    };
  }

  function calculateFinalExpenseInflationProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const baseTrace = createBaseTrace(safeInput);
    const rate = baseTrace.finalExpenseInflationRatePercent;
    const targetAge = baseTrace.finalExpenseTargetAge;
    const dateOfBirthStatus = String(baseTrace.clientDateOfBirthStatus || "");

    if (safeInput.enabled !== true) {
      return withFallback(
        baseTrace,
        "inflation-assumptions-disabled",
        "final-expense-inflation-disabled"
      );
    }

    if (baseTrace.currentFinalExpenseAmount <= 0) {
      return withFallback(
        baseTrace,
        "zero-or-missing-current-final-expense",
        "zero-or-missing-current-final-expense"
      );
    }

    if (rate == null || rate < 0) {
      return withFallback(
        baseTrace,
        "final-expense-inflation-rate-unavailable",
        "invalid-final-expense-inflation-rate"
      );
    }

    if (targetAge == null || targetAge < 0) {
      return withFallback(
        baseTrace,
        "final-expense-target-age-unavailable",
        "invalid-final-expense-target-age"
      );
    }

    if (dateOfBirthStatus === "invalid") {
      return withFallback(
        baseTrace,
        "client-date-of-birth-invalid",
        "invalid-client-date-of-birth"
      );
    }

    if (dateOfBirthStatus === "missing" || !baseTrace.clientDateOfBirth) {
      return withFallback(
        baseTrace,
        "client-date-of-birth-missing",
        "missing-client-date-of-birth"
      );
    }

    if (baseTrace.currentAge == null) {
      return withFallback(
        baseTrace,
        "client-date-of-birth-invalid",
        "invalid-client-date-of-birth"
      );
    }

    if (baseTrace.valuationDateDefaulted === true || !baseTrace.valuationDate) {
      return withFallback(
        baseTrace,
        "valuation-date-unavailable",
        safeInput.valuationDateWarningCode || "final-expense-valuation-date-unavailable"
      );
    }

    const projectionYears = Math.max(0, targetAge - baseTrace.currentAge);
    if (projectionYears <= 0) {
      return withFallback(
        {
          ...baseTrace,
          projectionYears
        },
        "target-age-not-greater-than-current-age",
        "final-expense-target-age-not-greater-than-current-age"
      );
    }

    const inflationFactor = Math.pow(1 + rate / 100, projectionYears);
    const projectedFinalExpenseAmount = roundMoney(baseTrace.currentFinalExpenseAmount * inflationFactor);

    return {
      ...baseTrace,
      projectedFinalExpenseAmount,
      projectionYears,
      applied: true,
      reason: "final-expense-inflation-applied",
      warningCode: null
    };
  }

  lensAnalysis.calculateFinalExpenseInflationProjection = calculateFinalExpenseInflationProjection;
})(window);
