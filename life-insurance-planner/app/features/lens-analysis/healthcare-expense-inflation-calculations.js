(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis healthcare expense projection helper.
  // Purpose: prepare traceable projection math for the Needs healthcare
  // expense component.
  // Non-goals: no DOM access, no storage access, no adapter ownership, no
  // method calls, no Step 3 rendering, and no model mutation.

  const CALCULATION_VERSION = 1;
  const SOURCE = "healthcare-expense-inflation-calculations";
  const DEFAULT_PROJECTION_YEARS = 10;
  const MIN_PROJECTION_YEARS = 1;
  const MAX_PROJECTION_YEARS = 60;
  const ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR = "currentDollarOnly";
  const DEFAULT_ASSUMPTIONS = Object.freeze({
    enabled: true,
    projectionYears: DEFAULT_PROJECTION_YEARS,
    includeOneTimeHealthcareExpenses: true,
    oneTimeProjectionMode: ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR
  });
  const HEALTHCARE_BUCKETS = Object.freeze([
    "ongoingHealthcare",
    "dentalCare",
    "visionCare",
    "mentalHealthCare",
    "longTermCare",
    "homeHealthCare",
    "medicalEquipment",
    "otherHealthcare"
  ]);
  const FINAL_EXPENSE_BUCKETS = Object.freeze([
    "medicalFinalExpense",
    "funeralBurial",
    "estateSettlement",
    "otherFinalExpense"
  ]);
  const FREQUENCY_MULTIPLIERS = Object.freeze({
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    semiAnnual: 2,
    annual: 1
  });

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

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundYears(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  }

  function uniqueStrings(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(function (value) {
          return normalizeString(value);
        })
        .filter(Boolean)
    ));
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
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

  function addCalendarYears(date, years) {
    const nextDate = new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
    if (nextDate.getMonth() !== date.getMonth()) {
      return new Date(date.getFullYear() + years, date.getMonth() + 1, 0);
    }
    return nextDate;
  }

  function calculateYearsBetweenDates(startDate, endDate) {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
      return null;
    }
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return null;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      return 0;
    }

    let fullYears = endDate.getFullYear() - startDate.getFullYear();
    let anniversary = addCalendarYears(startDate, fullYears);
    if (anniversary.getTime() > endDate.getTime()) {
      fullYears -= 1;
      anniversary = addCalendarYears(startDate, fullYears);
    }

    const nextAnniversary = addCalendarYears(startDate, fullYears + 1);
    const denominator = nextAnniversary.getTime() - anniversary.getTime();
    const fraction = denominator > 0
      ? (endDate.getTime() - anniversary.getTime()) / denominator
      : 0;

    return roundYears(fullYears + fraction);
  }

  function getClientDateOfBirthStatus(profileFacts, parsedDateOfBirth) {
    const explicitStatus = normalizeString(profileFacts?.clientDateOfBirthStatus);
    if (explicitStatus) {
      return explicitStatus;
    }

    if (profileFacts?.clientDateOfBirth == null || profileFacts.clientDateOfBirth === "") {
      return "missing";
    }

    return parsedDateOfBirth ? "valid" : "invalid";
  }

  function normalizeProjectionYears(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      warnings.push(createWarning(
        "invalid-healthcare-expense-projection-years",
        "Healthcare expense projection years was missing or invalid and defaulted to 10.",
        { received: value, defaultValue: DEFAULT_PROJECTION_YEARS }
      ));
      return {
        value: DEFAULT_PROJECTION_YEARS,
        source: "default"
      };
    }

    const rounded = Math.round(parsed);
    const clamped = Math.min(
      MAX_PROJECTION_YEARS,
      Math.max(MIN_PROJECTION_YEARS, rounded)
    );

    if (clamped !== rounded) {
      warnings.push(createWarning(
        "clamped-healthcare-expense-projection-years",
        `Healthcare expense projection years was outside 1-60 and was clamped to ${clamped}.`,
        { received: parsed, clamped }
      ));
      return {
        value: clamped,
        source: "clamped"
      };
    }

    return {
      value: clamped,
      source: "internalHealthcareExpenseDefaults.projectionYears"
    };
  }

  function normalizeOneTimeProjectionMode(value, warnings) {
    const normalized = normalizeString(value);
    if (!normalized || normalized === ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR) {
      return ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR;
    }

    warnings.push(createWarning(
      "invalid-healthcare-one-time-projection-mode",
      "Healthcare one-time projection mode was invalid and defaulted to currentDollarOnly.",
      { received: value, defaultValue: ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR }
    ));
    return ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR;
  }

  function normalizeHealthcareInflationRate(value, warnings, inflationEnabled) {
    if (inflationEnabled !== true) {
      warnings.push(createWarning(
        "healthcare-inflation-disabled-current-dollar",
        "Healthcare inflation is disabled; recurring healthcare expenses used current-dollar projection.",
        { enabled: inflationEnabled === true }
      ));
      return {
        value: null,
        applied: false
      };
    }

    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      warnings.push(createWarning(
        "invalid-healthcare-inflation-rate-current-dollar",
        "Healthcare inflation rate was missing or invalid; recurring healthcare expenses used current-dollar projection.",
        { received: value }
      ));
      return {
        value: null,
        applied: false
      };
    }

    if (parsed > 100) {
      warnings.push(createWarning(
        "clamped-healthcare-inflation-rate",
        "Healthcare inflation rate was above 100% and was clamped to 100%.",
        { received: parsed, clamped: 100 }
      ));
      return {
        value: 100,
        applied: true
      };
    }

    return {
      value: parsed,
      applied: true
    };
  }

  function getExpenseFacts(input) {
    return Array.isArray(input?.expenseFacts?.expenses)
      ? input.expenseFacts.expenses
      : [];
  }

  function createExcludedRecord(fact, reason, warningCode, index) {
    const source = isPlainObject(fact) ? fact : {};
    return {
      expenseFactId: source.expenseFactId || null,
      typeKey: source.typeKey || null,
      categoryKey: source.categoryKey || null,
      label: source.label || source.typeKey || null,
      reason,
      warningCode: warningCode || null,
      sourcePath: source.sourcePath || `expenseFacts.expenses[${index}]`
    };
  }

  function isHealthcareBucket(categoryKey) {
    return HEALTHCARE_BUCKETS.indexOf(normalizeString(categoryKey)) >= 0;
  }

  function isFinalExpenseBucket(categoryKey) {
    return FINAL_EXPENSE_BUCKETS.indexOf(normalizeString(categoryKey)) >= 0;
  }

  function isOneTimeFact(fact) {
    return normalizeString(fact?.frequency) === "oneTime"
      || normalizeString(fact?.termType) === "oneTime";
  }

  function normalizeFrequency(value) {
    return normalizeString(value);
  }

  function getAnnualizedAmount(fact) {
    const savedAnnualizedAmount = toOptionalNumber(fact.annualizedAmount);
    if (savedAnnualizedAmount != null && savedAnnualizedAmount >= 0) {
      return {
        amount: savedAnnualizedAmount,
        source: "annualizedAmount"
      };
    }

    const amount = toOptionalNumber(fact.amount);
    const frequency = normalizeFrequency(fact.frequency);
    const multiplier = FREQUENCY_MULTIPLIERS[frequency];
    if (amount == null || amount < 0 || multiplier == null) {
      return {
        amount: null,
        source: null
      };
    }

    return {
      amount: amount * multiplier,
      source: `amount-${frequency}`
    };
  }

  function getOneTimeAmount(fact) {
    const oneTimeAmount = toOptionalNumber(fact.oneTimeAmount);
    if (oneTimeAmount != null && oneTimeAmount >= 0) {
      return {
        amount: oneTimeAmount,
        source: "oneTimeAmount"
      };
    }

    const amount = toOptionalNumber(fact.amount);
    if (amount != null && amount >= 0) {
      return {
        amount,
        source: "amount"
      };
    }

    return {
      amount: null,
      source: null
    };
  }

  function resolveDurationYears(fact, context) {
    const termType = normalizeString(fact.termType) || (isOneTimeFact(fact) ? "oneTime" : "ongoing");
    const warnings = [];

    if (termType === "oneTime") {
      return {
        durationYears: 0,
        durationSource: "oneTime-current-dollar",
        warnings
      };
    }

    if (termType === "fixedYears") {
      const termYears = toOptionalNumber(fact.termYears);
      if (termYears != null && termYears > 0) {
        return {
          durationYears: roundYears(termYears),
          durationSource: "termYears",
          warnings
        };
      }

      warnings.push(createWarning(
        "fixed-years-term-years-fallback",
        "Fixed-years healthcare expense was missing valid termYears; projectionYears fallback was used.",
        { expenseFactId: fact.expenseFactId || null }
      ));
      return {
        durationYears: context.projectionYears,
        durationSource: "internalHealthcareExpenseDefaults.projectionYears-fallback",
        warnings
      };
    }

    if (termType === "untilAge") {
      const endAge = toOptionalNumber(fact.endAge);
      if (endAge != null && context.currentAge != null) {
        return {
          durationYears: roundYears(Math.max(0, endAge - context.currentAge)),
          durationSource: "endAge-clientDateOfBirth-valuationDate",
          warnings
        };
      }

      warnings.push(createWarning(
        "until-age-duration-fallback",
        "Until-age healthcare expense was missing valid DOB, valuation date, or endAge; projectionYears fallback was used.",
        { expenseFactId: fact.expenseFactId || null }
      ));
      return {
        durationYears: context.projectionYears,
        durationSource: "internalHealthcareExpenseDefaults.projectionYears-fallback",
        warnings
      };
    }

    if (termType === "untilDate") {
      const parsedEndDate = parseDateOnly(fact.endDate);
      if (context.parsedValuationDate && parsedEndDate) {
        return {
          durationYears: calculateYearsBetweenDates(
            context.parsedValuationDate.date,
            parsedEndDate.date
          ),
          durationSource: "endDate-valuationDate",
          warnings
        };
      }

      warnings.push(createWarning(
        "until-date-duration-fallback",
        "Until-date healthcare expense was missing valid valuation date or endDate; projectionYears fallback was used.",
        { expenseFactId: fact.expenseFactId || null }
      ));
      return {
        durationYears: context.projectionYears,
        durationSource: "internalHealthcareExpenseDefaults.projectionYears-fallback",
        warnings
      };
    }

    return {
      durationYears: context.projectionYears,
      durationSource: "internalHealthcareExpenseDefaults.projectionYears",
      warnings
    };
  }

  function projectRecurringAmount(annualizedAmount, durationYears, context) {
    if (!context.healthcareInflationApplied) {
      return {
        projectedAmount: roundMoney(annualizedAmount * durationYears),
        inflationApplied: false,
        annualValues: []
      };
    }

    if (typeof lensAnalysis.calculateInflationProjection === "function") {
      const projection = lensAnalysis.calculateInflationProjection({
        amount: annualizedAmount,
        durationYears,
        ratePercent: context.healthcareInflationRatePercent,
        enabled: true,
        timing: "annual",
        source: SOURCE
      });

      return {
        projectedAmount: roundMoney(projection.projectedTotal),
        inflationApplied: projection.applied === true,
        annualValues: Array.isArray(projection.annualValues) ? projection.annualValues : []
      };
    }

    let total = 0;
    const fullYears = Math.floor(durationYears);
    const partialYear = durationYears - fullYears;
    for (let yearIndex = 1; yearIndex <= fullYears; yearIndex += 1) {
      total += annualizedAmount * Math.pow(1 + context.healthcareInflationRatePercent / 100, yearIndex);
    }
    if (partialYear > 0) {
      total += annualizedAmount
        * Math.pow(1 + context.healthcareInflationRatePercent / 100, fullYears + 1)
        * partialYear;
    }

    return {
      projectedAmount: roundMoney(total),
      inflationApplied: true,
      annualValues: []
    };
  }

  function createIncludedRecordBase(fact, index) {
    return {
      expenseFactId: fact.expenseFactId || null,
      typeKey: fact.typeKey || null,
      categoryKey: fact.categoryKey || null,
      label: fact.label || fact.typeKey || null,
      amount: toOptionalNumber(fact.amount),
      frequency: fact.frequency || null,
      termType: fact.termType || null,
      annualizedAmount: null,
      oneTimeAmount: null,
      durationYears: 0,
      durationSource: null,
      projectedAmount: 0,
      sourcePath: fact.sourcePath || `expenseFacts.expenses[${index}]`,
      warnings: []
    };
  }

  function classifyFact(fact, index, context) {
    if (!isPlainObject(fact)) {
      return {
        included: false,
        record: createExcludedRecord(null, "Invalid expense fact.", "invalid-expense-fact", index)
      };
    }

    const categoryKey = normalizeString(fact.categoryKey);
    if (fact.isFinalExpenseComponent === true || isFinalExpenseBucket(categoryKey)) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          categoryKey === "medicalFinalExpense"
            ? "Medical final expense is handled by Final Expense projection."
            : "Final expense bucket is handled by Final Expense projection.",
          categoryKey === "medicalFinalExpense"
            ? "medical-final-expense-excluded"
            : "final-expense-bucket-excluded",
          index
        )
      };
    }

    if (!isHealthcareBucket(categoryKey)) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          "Expense fact is not in a healthcare-sensitive non-final bucket.",
          "non-healthcare-bucket-excluded",
          index
        )
      };
    }

    if (!context.enabled) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
            "Automatic healthcare bucket expense projection was disabled by internal settings.",
            "healthcare-bucket-projection-disabled",
            index
          )
        };
    }

    if (isOneTimeFact(fact)) {
      if (!context.includeOneTimeHealthcareExpenses) {
        return {
          included: false,
          record: createExcludedRecord(
            fact,
            "One-time healthcare expenses are excluded by internal healthcare bucket defaults.",
            "one-time-healthcare-expense-excluded",
            index
          )
        };
      }

      const amountResult = getOneTimeAmount(fact);
      if (amountResult.amount == null) {
        return {
          included: false,
          record: createExcludedRecord(
            fact,
            "One-time healthcare expense amount was missing or invalid.",
            "invalid-one-time-healthcare-expense-amount",
            index
          )
        };
      }

      const includedRecord = createIncludedRecordBase(fact, index);
      includedRecord.oneTimeAmount = roundMoney(amountResult.amount);
      includedRecord.durationSource = "oneTime-current-dollar";
      includedRecord.projectedAmount = includedRecord.oneTimeAmount;
      return {
        included: true,
        record: includedRecord
      };
    }

    const annualizedResult = getAnnualizedAmount(fact);
    if (annualizedResult.amount == null) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          "Recurring healthcare expense annualized amount could not be determined.",
          "invalid-recurring-healthcare-expense-amount",
          index
        )
      };
    }

    const durationResult = resolveDurationYears(fact, context);
    const projection = projectRecurringAmount(
      annualizedResult.amount,
      durationResult.durationYears,
      context
    );
    const includedRecord = createIncludedRecordBase(fact, index);
    includedRecord.annualizedAmount = roundMoney(annualizedResult.amount);
    includedRecord.durationYears = durationResult.durationYears;
    includedRecord.durationSource = durationResult.durationSource;
    includedRecord.projectedAmount = projection.projectedAmount;
    includedRecord.warnings = durationResult.warnings;
    includedRecord.annualizedAmountSource = annualizedResult.source;
    includedRecord.inflationApplied = projection.inflationApplied;

    return {
      included: true,
      record: includedRecord
    };
  }

  function buildContext(input, warnings) {
    const safeInput = isPlainObject(input) ? input : {};
    const assumptions = {
      ...DEFAULT_ASSUMPTIONS,
      ...(isPlainObject(safeInput.healthcareExpenseAssumptions)
        ? safeInput.healthcareExpenseAssumptions
        : {})
    };
    const inflationAssumptions = isPlainObject(safeInput.inflationAssumptions)
      ? safeInput.inflationAssumptions
      : {};
    const profileFacts = isPlainObject(safeInput.profileFacts)
      ? safeInput.profileFacts
      : {};
    const projectionYearsResult = normalizeProjectionYears(
      assumptions.projectionYears,
      warnings
    );
    const oneTimeProjectionMode = normalizeOneTimeProjectionMode(
      assumptions.oneTimeProjectionMode,
      warnings
    );
    const rateResult = normalizeHealthcareInflationRate(
      inflationAssumptions.healthcareInflationRatePercent,
      warnings,
      inflationAssumptions.enabled === true
    );
    const parsedDateOfBirth = parseDateOnly(profileFacts.clientDateOfBirth);
    const parsedValuationDate = parseDateOnly(safeInput.valuationDate);
    const currentAge = parsedDateOfBirth && parsedValuationDate
      ? calculateCurrentAge(parsedDateOfBirth.normalizedDate, parsedValuationDate.normalizedDate)
      : null;

    return {
      enabled: assumptions.enabled !== false,
      projectionYears: projectionYearsResult.value,
      projectionYearsSource: projectionYearsResult.source,
      includeOneTimeHealthcareExpenses: assumptions.includeOneTimeHealthcareExpenses === true,
      oneTimeProjectionMode,
      healthcareInflationRatePercent: rateResult.value,
      healthcareInflationApplied: rateResult.applied,
      parsedDateOfBirth,
      parsedValuationDate,
      currentAge,
      clientDateOfBirth: parsedDateOfBirth ? parsedDateOfBirth.normalizedDate : null,
      clientDateOfBirthStatus: getClientDateOfBirthStatus(profileFacts, parsedDateOfBirth),
      valuationDate: parsedValuationDate ? parsedValuationDate.normalizedDate : null,
      valuationDateSource: safeInput.valuationDateSource || null,
      valuationDateDefaulted: safeInput.valuationDateDefaulted === true
    };
  }

  function calculateHealthcareExpenseProjection(input) {
    const warnings = [];
    const context = buildContext(input, warnings);
    const includedRecords = [];
    const excludedRecords = [];

    getExpenseFacts(input).forEach(function (fact, index) {
      const classified = classifyFact(fact, index, context);
      if (classified.included) {
        includedRecords.push(classified.record);
        (classified.record.warnings || []).forEach(function (warning) {
          warnings.push(warning);
        });
        return;
      }

      excludedRecords.push(classified.record);
    });

    const projectedRecurringHealthcareExpenseAmount = roundMoney(
      includedRecords.reduce(function (total, record) {
        return total + (record.annualizedAmount == null ? 0 : record.projectedAmount);
      }, 0)
    );
    const includedOneTimeHealthcareExpenseAmount = roundMoney(
      includedRecords.reduce(function (total, record) {
        return total + (record.oneTimeAmount == null ? 0 : record.projectedAmount);
      }, 0)
    );
    const currentAnnualHealthcareExpenseAmount = roundMoney(
      includedRecords.reduce(function (total, record) {
        return total + (record.annualizedAmount == null ? 0 : record.annualizedAmount);
      }, 0)
    );
    const projectedHealthcareExpenseAmount = context.enabled
      ? roundMoney(projectedRecurringHealthcareExpenseAmount + includedOneTimeHealthcareExpenseAmount)
      : 0;
    const applied = context.enabled === true && projectedHealthcareExpenseAmount > 0;
    const reason = context.enabled
      ? (includedRecords.length ? null : "No eligible healthcare bucket expense records were included.")
      : "Automatic healthcare bucket expense projection was disabled.";
    const warningCode = context.enabled
      ? (includedRecords.length ? null : "no-eligible-healthcare-expense-records")
      : "healthcare-bucket-projection-disabled";

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      applied,
      enabled: context.enabled,
      projectedHealthcareExpenseAmount,
      projectedRecurringHealthcareExpenseAmount: context.enabled ? projectedRecurringHealthcareExpenseAmount : 0,
      includedOneTimeHealthcareExpenseAmount: context.enabled ? includedOneTimeHealthcareExpenseAmount : 0,
      currentAnnualHealthcareExpenseAmount: context.enabled ? currentAnnualHealthcareExpenseAmount : 0,
      healthcareInflationRatePercent: context.healthcareInflationRatePercent,
      healthcareInflationApplied: context.healthcareInflationApplied,
      projectionYears: context.projectionYears,
      projectionYearsSource: context.projectionYearsSource,
      includeOneTimeHealthcareExpenses: context.includeOneTimeHealthcareExpenses,
      oneTimeProjectionMode: context.oneTimeProjectionMode,
      includedRecordCount: includedRecords.length,
      excludedRecordCount: excludedRecords.length,
      warningCount: warnings.length,
      includedBuckets: uniqueStrings(includedRecords.map(function (record) {
        return record.categoryKey;
      })),
      excludedBuckets: uniqueStrings(excludedRecords.map(function (record) {
        return record.categoryKey;
      })),
      includedRecords,
      excludedRecords,
      warnings,
      reason,
      warningCode,
      valuationDate: context.valuationDate,
      valuationDateSource: context.valuationDateSource,
      valuationDateDefaulted: context.valuationDateDefaulted,
      clientDateOfBirth: context.clientDateOfBirth,
      clientDateOfBirthStatus: context.clientDateOfBirthStatus
    };
  }

  lensAnalysis.calculateHealthcareExpenseProjection = calculateHealthcareExpenseProjection;
})(window);
