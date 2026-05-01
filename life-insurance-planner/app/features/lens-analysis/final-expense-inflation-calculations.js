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
  const HEALTHCARE_RATE_SOURCE_PATH = "settings.inflationAssumptions.healthcareInflationRatePercent";
  const TARGET_AGE_SOURCE_PATH = "settings.inflationAssumptions.finalExpenseTargetAge";
  const MEDICAL_FINAL_EXPENSE_CATEGORY = "medicalFinalExpense";
  const NON_MEDICAL_FINAL_EXPENSE_CATEGORIES = Object.freeze([
    "funeralBurial",
    "estateSettlement",
    "otherFinalExpense"
  ]);

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

  function normalizeNonNegativeAmount(value) {
    const amount = toOptionalNumber(value);
    return amount == null ? 0 : Math.max(0, amount);
  }

  function uniqueStrings(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(function (value) {
          return typeof value === "string" ? value.trim() : "";
        })
        .filter(Boolean)
    ));
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

  function isKnownNonMedicalFinalExpenseCategory(categoryKey) {
    return NON_MEDICAL_FINAL_EXPENSE_CATEGORIES.indexOf(String(categoryKey || "")) >= 0;
  }

  function getFactCurrentDollarAmount(fact) {
    if (!isPlainObject(fact)) {
      return 0;
    }

    const oneTimeAmount = toOptionalNumber(fact.oneTimeAmount);
    if (oneTimeAmount != null) {
      return Math.max(0, oneTimeAmount);
    }

    return normalizeNonNegativeAmount(fact.amount);
  }

  function resolveExpenseFactsFinalExpenseSource(expenseFacts) {
    const facts = Array.isArray(expenseFacts?.expenses) ? expenseFacts.expenses : [];
    const finalExpenseFacts = facts.filter(function (fact) {
      const categoryKey = String(fact?.categoryKey || "");
      return isPlainObject(fact)
        && fact.isFinalExpenseComponent === true
        && (
          categoryKey === MEDICAL_FINAL_EXPENSE_CATEGORY
          || isKnownNonMedicalFinalExpenseCategory(categoryKey)
        );
    });

    if (!finalExpenseFacts.length) {
      return null;
    }

    const source = {
      sourceMode: "expenseFacts-final-expense-components",
      medicalAmount: 0,
      nonMedicalAmount: 0,
      medicalSourcePaths: [],
      nonMedicalSourcePaths: []
    };

    finalExpenseFacts.forEach(function (fact, index) {
      const amount = getFactCurrentDollarAmount(fact);
      const sourcePath = fact.sourcePath || `expenseFacts.expenses[${index}]`;
      if (String(fact.categoryKey || "") === MEDICAL_FINAL_EXPENSE_CATEGORY) {
        source.medicalAmount += amount;
        source.medicalSourcePaths.push(sourcePath);
        return;
      }

      if (isKnownNonMedicalFinalExpenseCategory(fact.categoryKey)) {
        source.nonMedicalAmount += amount;
        source.nonMedicalSourcePaths.push(sourcePath);
      }
    });

    source.medicalAmount = roundMoney(source.medicalAmount);
    source.nonMedicalAmount = roundMoney(source.nonMedicalAmount);
    source.medicalSourcePaths = uniqueStrings(source.medicalSourcePaths);
    source.nonMedicalSourcePaths = uniqueStrings(source.nonMedicalSourcePaths);
    return source;
  }

  function resolveFinalExpensesFallbackSource(finalExpenses) {
    const source = isPlainObject(finalExpenses) ? finalExpenses : {};
    const medicalAmount = normalizeNonNegativeAmount(source.medicalEndOfLifeCost);
    const funeralAmount = normalizeNonNegativeAmount(source.funeralAndBurialCost);
    const estateAmount = normalizeNonNegativeAmount(source.estateSettlementCost);
    const otherAmount = normalizeNonNegativeAmount(source.otherFinalExpenses);
    const nonMedicalAmount = roundMoney(funeralAmount + estateAmount + otherAmount);
    const totalFromSubcomponents = roundMoney(medicalAmount + nonMedicalAmount);
    const totalFinalExpenseNeed = normalizeNonNegativeAmount(source.totalFinalExpenseNeed);
    const useTotalFallback = totalFromSubcomponents <= 0 && totalFinalExpenseNeed > 0;

    return {
      sourceMode: "finalExpenses-fallback",
      medicalAmount: useTotalFallback ? 0 : roundMoney(medicalAmount),
      nonMedicalAmount: useTotalFallback ? roundMoney(totalFinalExpenseNeed) : nonMedicalAmount,
      medicalSourcePaths: useTotalFallback ? [] : ["finalExpenses.medicalEndOfLifeCost"],
      nonMedicalSourcePaths: useTotalFallback
        ? ["finalExpenses.totalFinalExpenseNeed"]
        : [
            "finalExpenses.funeralAndBurialCost",
            "finalExpenses.estateSettlementCost",
            "finalExpenses.otherFinalExpenses"
          ]
    };
  }

  function resolveFinalExpenseBucketSource(input) {
    return resolveExpenseFactsFinalExpenseSource(input.expenseFacts)
      || resolveFinalExpensesFallbackSource(input.finalExpenses);
  }

  function createBucketBaseTrace(input) {
    const source = resolveFinalExpenseBucketSource(input);
    const currentMedicalFinalExpenseAmount = roundMoney(source.medicalAmount);
    const currentNonMedicalFinalExpenseAmount = roundMoney(source.nonMedicalAmount);
    const currentFinalExpenseAmount = roundMoney(
      currentMedicalFinalExpenseAmount + currentNonMedicalFinalExpenseAmount
    );
    const healthcareRate = toOptionalNumber(input.healthcareInflationRatePercent);
    const finalExpenseRate = toOptionalNumber(input.finalExpenseInflationRatePercent);
    const targetAge = toOptionalNumber(input.finalExpenseTargetAge);
    const parsedDateOfBirth = parseDateOnly(input.clientDateOfBirth);
    const parsedValuationDate = parseDateOnly(input.valuationDate);
    const currentAge = parsedDateOfBirth && parsedValuationDate
      ? calculateCurrentAge(parsedDateOfBirth.normalizedDate, parsedValuationDate.normalizedDate)
      : null;
    const medicalSourcePaths = uniqueStrings(source.medicalSourcePaths);
    const nonMedicalSourcePaths = uniqueStrings(source.nonMedicalSourcePaths);

    return {
      source: "final-expense-inflation-calculations",
      calculationVersion: CALCULATION_VERSION,
      sourceMode: source.sourceMode,
      currentFinalExpenseAmount,
      projectedFinalExpenseAmount: currentFinalExpenseAmount,
      currentMedicalFinalExpenseAmount,
      projectedMedicalFinalExpenseAmount: currentMedicalFinalExpenseAmount,
      currentNonMedicalFinalExpenseAmount,
      projectedNonMedicalFinalExpenseAmount: currentNonMedicalFinalExpenseAmount,
      healthcareInflationRatePercent: healthcareRate,
      finalExpenseInflationRatePercent: finalExpenseRate,
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
      medicalApplied: false,
      nonMedicalApplied: false,
      reason: null,
      warningCode: null,
      medicalReason: null,
      medicalWarningCode: null,
      nonMedicalReason: null,
      nonMedicalWarningCode: null,
      sourcePaths: uniqueStrings([
        ...medicalSourcePaths,
        ...nonMedicalSourcePaths
      ]),
      medicalSourcePaths,
      nonMedicalSourcePaths,
      healthcareRateSourcePath: input.healthcareRateSourcePath || HEALTHCARE_RATE_SOURCE_PATH,
      finalExpenseRateSourcePath: input.finalExpenseRateSourcePath || input.rateSourcePath || RATE_SOURCE_PATH,
      rateSourcePath: input.finalExpenseRateSourcePath || input.rateSourcePath || RATE_SOURCE_PATH,
      targetAgeSourcePath: input.targetAgeSourcePath || TARGET_AGE_SOURCE_PATH
    };
  }

  function withBucketFallback(baseTrace, reason, warningCode) {
    return {
      ...baseTrace,
      projectedFinalExpenseAmount: baseTrace.currentFinalExpenseAmount,
      projectedMedicalFinalExpenseAmount: baseTrace.currentMedicalFinalExpenseAmount,
      projectedNonMedicalFinalExpenseAmount: baseTrace.currentNonMedicalFinalExpenseAmount,
      applied: false,
      medicalApplied: false,
      nonMedicalApplied: false,
      reason,
      warningCode: warningCode || null,
      medicalReason: reason,
      medicalWarningCode: warningCode || null,
      nonMedicalReason: reason,
      nonMedicalWarningCode: warningCode || null
    };
  }

  function projectFinalExpenseBucket(amount, rate, projectionYears, invalidRateReason, invalidRateWarningCode, zeroReason) {
    if (amount <= 0) {
      return {
        currentAmount: roundMoney(amount),
        projectedAmount: roundMoney(amount),
        applied: false,
        reason: zeroReason,
        warningCode: null
      };
    }

    if (rate == null || rate < 0) {
      return {
        currentAmount: roundMoney(amount),
        projectedAmount: roundMoney(amount),
        applied: false,
        reason: invalidRateReason,
        warningCode: invalidRateWarningCode
      };
    }

    return {
      currentAmount: roundMoney(amount),
      projectedAmount: roundMoney(amount * Math.pow(1 + rate / 100, projectionYears)),
      applied: true,
      reason: "final-expense-bucket-inflation-applied",
      warningCode: null
    };
  }

  function summarizeBucketProjection(medicalProjection, nonMedicalProjection) {
    if (medicalProjection.applied && nonMedicalProjection.applied) {
      return {
        applied: true,
        reason: "final-expense-bucket-inflation-applied",
        warningCode: null
      };
    }

    if (medicalProjection.applied || nonMedicalProjection.applied) {
      return {
        applied: true,
        reason: "partial-final-expense-bucket-inflation-applied",
        warningCode: null
      };
    }

    return {
      applied: false,
      reason: "final-expense-bucket-inflation-not-applied",
      warningCode: null
    };
  }

  function calculateFinalExpenseBucketInflationProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const baseTrace = createBucketBaseTrace(safeInput);
    const targetAge = baseTrace.finalExpenseTargetAge;
    const dateOfBirthStatus = String(baseTrace.clientDateOfBirthStatus || "");

    if (safeInput.enabled !== true) {
      return withBucketFallback(
        baseTrace,
        "inflation-assumptions-disabled",
        "final-expense-inflation-disabled"
      );
    }

    if (baseTrace.currentFinalExpenseAmount <= 0) {
      return withBucketFallback(
        baseTrace,
        "zero-or-missing-current-final-expense",
        "zero-or-missing-current-final-expense"
      );
    }

    if (targetAge == null || targetAge < 0) {
      return withBucketFallback(
        baseTrace,
        "final-expense-target-age-unavailable",
        "invalid-final-expense-target-age"
      );
    }

    if (dateOfBirthStatus === "invalid") {
      return withBucketFallback(
        baseTrace,
        "client-date-of-birth-invalid",
        "invalid-client-date-of-birth"
      );
    }

    if (dateOfBirthStatus === "missing" || !baseTrace.clientDateOfBirth) {
      return withBucketFallback(
        baseTrace,
        "client-date-of-birth-missing",
        "missing-client-date-of-birth"
      );
    }

    if (baseTrace.currentAge == null) {
      return withBucketFallback(
        baseTrace,
        "client-date-of-birth-invalid",
        "invalid-client-date-of-birth"
      );
    }

    if (baseTrace.valuationDateDefaulted === true || !baseTrace.valuationDate) {
      return withBucketFallback(
        baseTrace,
        "valuation-date-unavailable",
        safeInput.valuationDateWarningCode || "final-expense-valuation-date-unavailable"
      );
    }

    const projectionYears = Math.max(0, targetAge - baseTrace.currentAge);
    if (projectionYears <= 0) {
      return withBucketFallback(
        {
          ...baseTrace,
          projectionYears
        },
        "target-age-not-greater-than-current-age",
        "final-expense-target-age-not-greater-than-current-age"
      );
    }

    const medicalProjection = projectFinalExpenseBucket(
      baseTrace.currentMedicalFinalExpenseAmount,
      baseTrace.healthcareInflationRatePercent,
      projectionYears,
      "healthcare-inflation-rate-unavailable",
      "invalid-healthcare-inflation-rate",
      "zero-or-missing-medical-final-expense"
    );
    const nonMedicalProjection = projectFinalExpenseBucket(
      baseTrace.currentNonMedicalFinalExpenseAmount,
      baseTrace.finalExpenseInflationRatePercent,
      projectionYears,
      "final-expense-inflation-rate-unavailable",
      "invalid-final-expense-inflation-rate",
      "zero-or-missing-non-medical-final-expense"
    );
    const summary = summarizeBucketProjection(medicalProjection, nonMedicalProjection);

    return {
      ...baseTrace,
      projectedMedicalFinalExpenseAmount: medicalProjection.projectedAmount,
      projectedNonMedicalFinalExpenseAmount: nonMedicalProjection.projectedAmount,
      projectedFinalExpenseAmount: roundMoney(
        medicalProjection.projectedAmount + nonMedicalProjection.projectedAmount
      ),
      projectionYears,
      applied: summary.applied,
      medicalApplied: medicalProjection.applied,
      nonMedicalApplied: nonMedicalProjection.applied,
      reason: summary.reason,
      warningCode: summary.warningCode,
      medicalReason: medicalProjection.reason,
      medicalWarningCode: medicalProjection.warningCode,
      nonMedicalReason: nonMedicalProjection.reason,
      nonMedicalWarningCode: nonMedicalProjection.warningCode
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

  lensAnalysis.calculateFinalExpenseBucketInflationProjection = calculateFinalExpenseBucketInflationProjection;
  lensAnalysis.calculateFinalExpenseInflationProjection = calculateFinalExpenseInflationProjection;
})(window);
