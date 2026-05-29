// Coverage Strategy healthcare lifetime projection engine.
// Future home after folder reorganization:
// app/features/lens-analysis/coverage-strategy/projections/healthcare-lifetime-projection.js
// Backend-ready pure calculation engine: accepts normalized facts and explicit assumptions, returns serializable projection output.
// Owns Coverage Strategy-specific year-by-year healthcare need projection from normalized expense facts.
// Does not own PMI intake, Needs/LENS aggregate healthcare math, final expense math, storage, DOM, or display rendering.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_HEALTHCARE_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-healthcare-lifetime-projection-v1";
  const HEALTHCARE_CATEGORY_KEYS = Object.freeze([
    "ongoingHealthcare",
    "dentalCare",
    "visionCare",
    "mentalHealthCare",
    "longTermCare",
    "homeHealthCare",
    "medicalEquipment",
    "otherHealthcare"
  ]);
  const FINAL_EXPENSE_CATEGORY_KEYS = Object.freeze([
    "medicalFinalExpense",
    "funeralBurial",
    "estateSettlement",
    "otherFinalExpense"
  ]);
  const FREQUENCY_ANNUAL_FACTORS = Object.freeze({
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    semiAnnual: 2,
    annual: 1
  });

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

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRatio(value) {
    return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function addIssue(target, code, message, details) {
    if (!Array.isArray(target)) {
      return null;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
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
      normalizedDate: [
        String(year).padStart(4, "0"),
        String(monthIndex + 1).padStart(2, "0"),
        String(day).padStart(2, "0")
      ].join("-"),
      calendarYear: year
    };
  }

  function addCalendarYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const date = new Date(dateResult.date.getTime());
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return {
      date,
      normalizedDate: [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
      ].join("-"),
      calendarYear: date.getUTCFullYear()
    };
  }

  function calculateAge(dateOfBirth, valuationDate) {
    const birth = normalizeDateOnly(dateOfBirth);
    const valuation = normalizeDateOnly(valuationDate);
    if (!birth || !valuation || birth.date > valuation.date) {
      return null;
    }
    let age = valuation.date.getUTCFullYear() - birth.date.getUTCFullYear();
    const monthDelta = valuation.date.getUTCMonth() - birth.date.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && valuation.date.getUTCDate() < birth.date.getUTCDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function calculateYearsBetweenDates(startDateResult, endDateResult) {
    if (!startDateResult || !endDateResult) {
      return null;
    }
    if (endDateResult.date.getTime() <= startDateResult.date.getTime()) {
      return 0;
    }
    let fullYears = endDateResult.date.getUTCFullYear() - startDateResult.date.getUTCFullYear();
    let anniversary = addCalendarYears(startDateResult, fullYears);
    if (anniversary.date.getTime() > endDateResult.date.getTime()) {
      fullYears -= 1;
      anniversary = addCalendarYears(startDateResult, fullYears);
    }
    const nextAnniversary = addCalendarYears(startDateResult, fullYears + 1);
    const denominator = nextAnniversary.date.getTime() - anniversary.date.getTime();
    const numerator = endDateResult.date.getTime() - anniversary.date.getTime();
    return denominator > 0 ? Number((fullYears + numerator / denominator).toFixed(8)) : fullYears;
  }

  function normalizeHealthcareInflationRate(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      if (value != null && value !== "") {
        addIssue(
          warnings,
          "invalid-healthcare-inflation-rate-current-dollar",
          "Healthcare inflation rate was invalid; Coverage Strategy healthcare projection used current dollars.",
          { received: value }
        );
      }
      return {
        annualRate: 0,
        sourceValue: value,
        applied: false
      };
    }
    let annualRate;
    if (parsed > 1) {
      annualRate = parsed / 100;
    } else if (parsed >= 0.1) {
      annualRate = parsed / 100;
    } else {
      annualRate = parsed;
    }
    return {
      annualRate: Math.max(0, annualRate),
      sourceValue: value,
      applied: annualRate > 0
    };
  }

  function getExpenseFactArray(expenseFacts) {
    if (Array.isArray(expenseFacts)) {
      return expenseFacts;
    }
    if (Array.isArray(expenseFacts?.expenses)) {
      return expenseFacts.expenses;
    }
    return [];
  }

  function getNeedPoints(input) {
    return Array.isArray(input?.needPoints) ? input.needPoints : [];
  }

  function getHorizonYears(needPoints, options) {
    const optionHorizon = toOptionalNumber(options?.horizonYears);
    if (optionHorizon != null && optionHorizon >= 0) {
      return Math.round(optionHorizon);
    }
    return Math.max(
      0,
      ...needPoints.map(function (point) {
        return Math.round(toOptionalNumber(point?.yearIndex) || 0);
      })
    );
  }

  function getAnnualizedAmount(fact) {
    const annualizedAmount = toOptionalNumber(fact.annualizedAmount);
    if (annualizedAmount != null && annualizedAmount >= 0) {
      return {
        amount: annualizedAmount,
        source: "annualizedAmount"
      };
    }
    const amount = toOptionalNumber(fact.amount);
    const frequency = normalizeString(fact.frequency) || "monthly";
    const factor = FREQUENCY_ANNUAL_FACTORS[frequency];
    if (amount == null || amount < 0 || !Number.isFinite(factor)) {
      return {
        amount: null,
        source: null
      };
    }
    return {
      amount: amount * factor,
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

  function isOneTimeFact(fact) {
    return normalizeString(fact.termType) === "oneTime"
      || normalizeString(fact.frequency) === "oneTime"
      || toOptionalNumber(fact.oneTimeAmount) != null;
  }

  function isDebtLikeFact(fact) {
    const source = normalizeString(fact.source);
    const sourceKey = normalizeString(fact.sourceKey);
    const sourcePath = normalizeString(fact.sourcePath);
    const typeKey = normalizeString(fact.typeKey);
    return fact.isDebtPaymentExpense === true
      || sourceKey === "debtRecords"
      || /debtRecords/.test(source)
      || /debtRecords/.test(sourcePath)
      || /debt/i.test(typeKey);
  }

  function isHealthcareCategoryKey(categoryKey) {
    return HEALTHCARE_CATEGORY_KEYS.indexOf(normalizeString(categoryKey)) !== -1;
  }

  function isSupportOwnedHealthcareLookingFact(fact) {
    if (!isPlainObject(fact)) {
      return false;
    }
    const typeKey = normalizeString(fact.typeKey);
    const categoryKey = normalizeString(fact.categoryKey);
    const compressionCategoryKey = normalizeString(fact.compressionCategoryKey || fact.metadata?.compressionCategoryKey);
    const ownedByField = normalizeString(fact.ownedByField || fact.metadata?.ownedByField);
    const sourceOwnedBy = normalizeString(fact.sourceOwnedBy || fact.metadata?.sourceOwnedBy);
    return typeKey === "medicalOutOfPocket"
      && categoryKey === "otherLivingExpense"
      && isHealthcareCategoryKey(compressionCategoryKey)
      && (ownedByField === "monthlyHealthcareOutOfPocketCost" || sourceOwnedBy === "ongoingSupport")
      && fact.isHealthcareSensitive === false;
  }

  function createExcludedRecord(fact, index, code, message) {
    const safeFact = isPlainObject(fact) ? fact : {};
    const compressionCategoryKey = safeFact.compressionCategoryKey || safeFact.metadata?.compressionCategoryKey || null;
    const ownedByField = safeFact.ownedByField || safeFact.metadata?.ownedByField || null;
    const sourceOwnedBy = safeFact.sourceOwnedBy || safeFact.metadata?.sourceOwnedBy || null;
    const supportOwnedHealthcareLike = code === "support-owned-healthcare-expense-excluded";
    return {
      expenseFactId: safeFact.expenseFactId || null,
      expenseRecordId: safeFact.expenseRecordId || null,
      sourcePath: safeFact.sourcePath || `expenseFacts.expenses[${index}]`,
      typeKey: safeFact.typeKey || null,
      categoryKey: safeFact.categoryKey || null,
      compressionCategoryKey,
      label: safeFact.label || safeFact.typeKey || null,
      exclusionCode: code,
      exclusionReason: message,
      trace: {
        typeKey: safeFact.typeKey || null,
        categoryKey: safeFact.categoryKey || null,
        compressionCategoryKey,
        ownedByField,
        sourceOwnedBy,
        isHealthcareSensitive: safeFact.isHealthcareSensitive === true,
        isFinalExpenseComponent: safeFact.isFinalExpenseComponent === true,
        defaultInflationRole: safeFact.defaultInflationRole || null,
        sourcePath: safeFact.sourcePath || `expenseFacts.expenses[${index}]`,
        sourceKey: safeFact.sourceKey || null,
        source: safeFact.source || null,
        overlapRiskWithEssentialSupport: supportOwnedHealthcareLike,
        mathChanged: false
      }
    };
  }

  function classifyFact(fact, index) {
    if (!isPlainObject(fact)) {
      return {
        included: false,
        record: createExcludedRecord(null, index, "invalid-expense-fact", "Expense fact was not an object.")
      };
    }
    const categoryKey = normalizeString(fact.categoryKey);
    if (fact.isFinalExpenseComponent === true || FINAL_EXPENSE_CATEGORY_KEYS.indexOf(categoryKey) !== -1) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "final-expense-healthcare-excluded",
          "Final expense facts are handled by final expense projection, not recurring healthcare."
        )
      };
    }
    if (isDebtLikeFact(fact)) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "debt-like-healthcare-excluded",
          "Debt and generated debt-payment facts are handled by debt projection."
        )
      };
    }
    if (isSupportOwnedHealthcareLookingFact(fact)) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "support-owned-healthcare-expense-excluded",
          "Healthcare-looking expense is owned by ongoing support through monthlyHealthcareOutOfPocketCost and is excluded from healthcare lifetime projection to avoid double-counting."
        )
      };
    }
    if (HEALTHCARE_CATEGORY_KEYS.indexOf(categoryKey) === -1) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "non-healthcare-expense-excluded",
          "Expense fact is not in a Coverage Strategy healthcare category."
        )
      };
    }
    if (fact.isHealthcareSensitive !== true) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "healthcare-sensitive-flag-missing",
          "Healthcare-category fact did not carry isHealthcareSensitive=true."
        )
      };
    }
    return {
      included: true,
      fact
    };
  }

  function resolveDuration(fact, context, warnings, dataGaps) {
    const rawTermType = normalizeString(fact.termType);
    const termType = rawTermType || "ongoing";
    const recordDetails = {
      expenseFactId: fact.expenseFactId || null,
      typeKey: fact.typeKey || null,
      categoryKey: fact.categoryKey || null
    };
    if (!rawTermType) {
      addIssue(
        warnings,
        "healthcare-duration-defaulted-to-ongoing",
        "Healthcare expense fact was missing termType; Coverage Strategy treated it as ongoing through the projection horizon.",
        recordDetails
      );
      return {
        termType: "ongoing",
        endYearsFromValuation: context.horizonYears + 1,
        durationSource: "coverageStrategyDefaultOngoing",
        warnings: [createIssue(
          "healthcare-duration-defaulted-to-ongoing",
          "Healthcare expense fact was missing termType; Coverage Strategy treated it as ongoing through the projection horizon.",
          recordDetails
        )],
        dataGaps: []
      };
    }
    if (termType === "ongoing") {
      return {
        termType,
        endYearsFromValuation: context.horizonYears + 1,
        durationSource: "coverageStrategyProjectionHorizon",
        warnings: [],
        dataGaps: []
      };
    }
    if (termType === "fixedYears") {
      const termYears = toOptionalNumber(fact.termYears);
      if (termYears != null && termYears > 0) {
        return {
          termType,
          endYearsFromValuation: termYears,
          durationSource: "termYears",
          warnings: [],
          dataGaps: []
        };
      }
      const warning = createIssue(
        "healthcare-fixed-years-missing-term-defaulted-to-ongoing",
        "Fixed-years healthcare expense was missing valid termYears; Coverage Strategy treated it as ongoing through the projection horizon.",
        recordDetails
      );
      warnings.push(warning);
      dataGaps.push(warning);
      return {
        termType,
        endYearsFromValuation: context.horizonYears + 1,
        durationSource: "coverageStrategyDefaultOngoing",
        warnings: [warning],
        dataGaps: [warning]
      };
    }
    if (termType === "untilAge") {
      const endAge = toOptionalNumber(fact.endAge);
      if (endAge != null && context.currentAge != null) {
        return {
          termType,
          endYearsFromValuation: Math.max(0, endAge - context.currentAge),
          durationSource: "endAge-clientDateOfBirth-valuationDate",
          warnings: [],
          dataGaps: []
        };
      }
      const warning = createIssue(
        "healthcare-until-age-missing-facts-defaulted-to-ongoing",
        "Until-age healthcare expense was missing valid DOB, valuation date, or endAge; Coverage Strategy treated it as ongoing through the projection horizon.",
        Object.assign({}, recordDetails, { endAge })
      );
      warnings.push(warning);
      dataGaps.push(warning);
      return {
        termType,
        endYearsFromValuation: context.horizonYears + 1,
        durationSource: "coverageStrategyDefaultOngoing",
        warnings: [warning],
        dataGaps: [warning]
      };
    }
    if (termType === "untilDate") {
      const endDate = normalizeDateOnly(fact.endDate);
      const years = calculateYearsBetweenDates(context.valuationDateResult, endDate);
      if (years != null) {
        return {
          termType,
          endYearsFromValuation: Math.max(0, years),
          durationSource: "endDate-valuationDate",
          warnings: [],
          dataGaps: []
        };
      }
      const warning = createIssue(
        "healthcare-until-date-missing-facts-defaulted-to-ongoing",
        "Until-date healthcare expense was missing valid valuation date or endDate; Coverage Strategy treated it as ongoing through the projection horizon.",
        Object.assign({}, recordDetails, { endDate: fact.endDate || null })
      );
      warnings.push(warning);
      dataGaps.push(warning);
      return {
        termType,
        endYearsFromValuation: context.horizonYears + 1,
        durationSource: "coverageStrategyDefaultOngoing",
        warnings: [warning],
        dataGaps: [warning]
      };
    }
    if (termType === "oneTime") {
      return {
        termType,
        endYearsFromValuation: 0,
        durationSource: "oneTime-current-dollar-immediate",
        warnings: [],
        dataGaps: []
      };
    }
    const warning = createIssue(
      "healthcare-unknown-term-defaulted-to-ongoing",
      "Healthcare expense fact had an unknown termType; Coverage Strategy treated it as ongoing through the projection horizon.",
      Object.assign({}, recordDetails, { termType })
    );
    warnings.push(warning);
    dataGaps.push(warning);
    return {
      termType,
      endYearsFromValuation: context.horizonYears + 1,
      durationSource: "coverageStrategyDefaultOngoing",
      warnings: [warning],
      dataGaps: [warning]
    };
  }

  function getInflationFactor(rateDecimal, periodNumber) {
    if (!(rateDecimal > 0) || !(periodNumber > 0)) {
      return 1;
    }
    return Math.pow(1 + rateDecimal, periodNumber);
  }

  function calculateRemainingRecurringAmount(record, deathYearIndex, context) {
    const startYearsFromValuation = Math.max(0, toOptionalNumber(deathYearIndex) || 0);
    const endYearsFromValuation = Math.max(0, toOptionalNumber(record.endYearsFromValuation) || 0);
    if (!(endYearsFromValuation > startYearsFromValuation)) {
      return {
        amount: 0,
        annualValues: []
      };
    }
    const annualizedAmount = Math.max(0, toOptionalNumber(record.annualizedAmount) || 0);
    const annualValues = [];
    const maxPeriod = Math.ceil(Math.min(endYearsFromValuation, context.horizonYears + 1));
    for (let periodNumber = Math.floor(startYearsFromValuation) + 1; periodNumber <= maxPeriod; periodNumber += 1) {
      const periodStart = periodNumber - 1;
      const periodEnd = periodNumber;
      const overlapStart = Math.max(startYearsFromValuation, periodStart);
      const overlapEnd = Math.min(endYearsFromValuation, periodEnd);
      const yearFraction = Math.max(0, overlapEnd - overlapStart);
      if (!(yearFraction > 0)) {
        continue;
      }
      const inflationFactor = getInflationFactor(context.healthcareInflationAnnualRate, periodNumber);
      annualValues.push({
        periodNumber,
        yearFraction: roundRatio(yearFraction),
        inflationFactor: roundRatio(inflationFactor),
        annualizedAmount: roundMoney(annualizedAmount * inflationFactor),
        amount: roundMoney(annualizedAmount * inflationFactor * yearFraction)
      });
    }
    return {
      amount: roundMoney(annualValues.reduce(function (sum, value) {
        return sum + Math.max(0, toOptionalNumber(value.amount) || 0);
      }, 0)),
      annualValues
    };
  }

  function buildIncludedRecord(fact, index, context, warnings, dataGaps) {
    const duration = resolveDuration(fact, context, warnings, dataGaps);
    const base = {
      expenseFactId: fact.expenseFactId || null,
      expenseRecordId: fact.expenseRecordId || null,
      sourcePath: fact.sourcePath || `expenseFacts.expenses[${index}]`,
      typeKey: fact.typeKey || null,
      categoryKey: fact.categoryKey || null,
      label: fact.label || fact.typeKey || null,
      termType: duration.termType,
      durationSource: duration.durationSource,
      endYearsFromValuation: roundRatio(duration.endYearsFromValuation),
      warnings: duration.warnings,
      dataGaps: duration.dataGaps,
      trace: {
        sourcePath: fact.sourcePath || `expenseFacts.expenses[${index}]`,
        defaultInflationRole: fact.defaultInflationRole || null,
        isHealthcareSensitive: fact.isHealthcareSensitive === true,
        isFinalExpenseComponent: fact.isFinalExpenseComponent === true
      }
    };

    if (duration.termType === "oneTime" || isOneTimeFact(fact)) {
      const amountResult = getOneTimeAmount(fact);
      if (amountResult.amount == null) {
        const warning = createIssue(
          "invalid-one-time-healthcare-expense-amount",
          "One-time healthcare expense amount was missing or invalid.",
          { expenseFactId: fact.expenseFactId || null }
        );
        warnings.push(warning);
        dataGaps.push(warning);
        return {
          ...base,
          oneTimeAmount: null,
          amountSource: null,
          includeMode: "oneTimeImmediateCurrentDollar",
          excludedByAmount: true,
          warnings: base.warnings.concat([warning]),
          dataGaps: base.dataGaps.concat([warning])
        };
      }
      return {
        ...base,
        oneTimeAmount: roundMoney(amountResult.amount),
        amountSource: amountResult.source,
        includeMode: "oneTimeImmediateCurrentDollar"
      };
    }

    const annualizedResult = getAnnualizedAmount(fact);
    if (annualizedResult.amount == null) {
      const warning = createIssue(
        "invalid-recurring-healthcare-expense-amount",
        "Recurring healthcare expense annualized amount could not be determined.",
        { expenseFactId: fact.expenseFactId || null }
      );
      warnings.push(warning);
      dataGaps.push(warning);
      return {
        ...base,
        annualizedAmount: null,
        amountSource: null,
        includeMode: "recurringLifetime",
        excludedByAmount: true,
        warnings: base.warnings.concat([warning]),
        dataGaps: base.dataGaps.concat([warning])
      };
    }
    return {
      ...base,
      annualizedAmount: roundMoney(annualizedResult.amount),
      amountSource: annualizedResult.source,
      includeMode: "recurringLifetime"
    };
  }

  function createPointTraceRecord(record, projection) {
    return {
      expenseFactId: record.expenseFactId,
      typeKey: record.typeKey,
      categoryKey: record.categoryKey,
      label: record.label,
      amount: projection.amount,
      termType: record.termType,
      durationSource: record.durationSource,
      includeMode: record.includeMode,
      sourcePath: record.sourcePath
    };
  }

  function buildCoverageStrategyHealthcareLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const needPoints = getNeedPoints(safeInput);
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate);
    const clientDateOfBirth = normalizeString(
      safeInput.clientDateOfBirth
      || safeInput.profileFacts?.clientDateOfBirth
      || options.clientDateOfBirth
    );
    const currentAge = clientDateOfBirth && valuationDateResult
      ? calculateAge(clientDateOfBirth, valuationDateResult.normalizedDate)
      : null;
    const horizonYears = getHorizonYears(needPoints, options);
    const rateResult = normalizeHealthcareInflationRate(
      safeInput.healthcareInflationRatePercent,
      warnings
    );
    const context = {
      valuationDateResult,
      clientDateOfBirth,
      currentAge,
      horizonYears,
      healthcareInflationAnnualRate: rateResult.annualRate
    };
    if (!valuationDateResult) {
      addIssue(
        dataGaps,
        "healthcare-lifetime-valuation-date-missing",
        "Coverage Strategy healthcare lifetime projection needs a valid valuationDate for date-based durations.",
        { valuationDate: safeInput.valuationDate || null }
      );
    }

    const includedRecords = [];
    const excludedRecords = [];
    getExpenseFactArray(safeInput.expenseFacts).forEach(function (fact, index) {
      const classification = classifyFact(fact, index);
      if (!classification.included) {
        excludedRecords.push(classification.record);
        return;
      }
      const record = buildIncludedRecord(classification.fact, index, context, warnings, dataGaps);
      if (record.excludedByAmount) {
        excludedRecords.push({
          expenseFactId: record.expenseFactId,
          expenseRecordId: record.expenseRecordId,
          sourcePath: record.sourcePath,
          typeKey: record.typeKey,
          categoryKey: record.categoryKey,
          label: record.label,
          exclusionCode: "invalid-healthcare-amount",
          exclusionReason: "Healthcare record was eligible by category but missing a usable amount.",
          trace: {
            includeMode: record.includeMode,
            warnings: record.warnings,
            dataGaps: record.dataGaps
          }
        });
        return;
      }
      includedRecords.push(record);
    });

    const supportOwnedHealthcareExcludedRecords = excludedRecords.filter(function (record) {
      return record && record.exclusionCode === "support-owned-healthcare-expense-excluded";
    });
    if (supportOwnedHealthcareExcludedRecords.length) {
      addIssue(
        warnings,
        "support-owned-healthcare-expense-excluded-from-healthcare-lifetime",
        "A healthcare-looking expense is already owned by ongoing support and was excluded from healthcare lifetime projection to avoid double-counting. Review ownership if the intent is to model it as healthcare-specific lifetime need.",
        {
          supportOwnedHealthcareExpenseExcludedCount: supportOwnedHealthcareExcludedRecords.length,
          sourcePaths: [
            "expenseFacts.expenses",
            "ongoingSupport.monthlyHealthcareOutOfPocketCost",
            "coverageStrategy.healthcareLifetimeProjection"
          ],
          excludedRecords: supportOwnedHealthcareExcludedRecords.map(function (record) {
            return {
              expenseFactId: record.expenseFactId || null,
              expenseRecordId: record.expenseRecordId || null,
              typeKey: record.typeKey || null,
              categoryKey: record.categoryKey || null,
              compressionCategoryKey: record.compressionCategoryKey || null,
              ownedByField: record.trace?.ownedByField || null,
              sourceOwnedBy: record.trace?.sourceOwnedBy || null,
              sourcePath: record.sourcePath || null,
              overlapRiskWithEssentialSupport: record.trace?.overlapRiskWithEssentialSupport === true,
              mathChanged: false
            };
          })
        }
      );
    }

    const healthcarePoints = needPoints.map(function (point) {
      const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0));
      const pointIncludedRecords = [];
      let healthcareNeedAmount = 0;
      includedRecords.forEach(function (record) {
        let projection;
        if (record.includeMode === "oneTimeImmediateCurrentDollar") {
          projection = {
            amount: yearIndex === 0 ? roundMoney(record.oneTimeAmount || 0) : 0,
            annualValues: []
          };
        } else {
          projection = calculateRemainingRecurringAmount(record, yearIndex, context);
        }
        healthcareNeedAmount += projection.amount;
        if (projection.amount > 0) {
          pointIncludedRecords.push(createPointTraceRecord(record, projection));
        }
      });
      return {
        yearIndex,
        date: point?.date || null,
        calendarYear: point?.calendarYear ?? null,
        clientAge: point?.age ?? null,
        healthcareNeedAmount: roundMoney(healthcareNeedAmount),
        includedRecordCount: pointIncludedRecords.length,
        excludedRecordCount: excludedRecords.length,
        includedRecords: pointIncludedRecords,
        excludedRecords: excludedRecords.map(clonePlainValue),
        warnings: [],
        dataGaps: [],
        trace: {
          source: "coverage-strategy-healthcare-lifetime-projection",
          projectionMode: "record-level-lifetime-schedule",
          healthcareInflationAnnualRate: roundRatio(context.healthcareInflationAnnualRate),
          supportOwnedHealthcareExpenseExcludedCount: supportOwnedHealthcareExcludedRecords.length,
          projectionYearsCutoffUsed: false
        }
      };
    });

    return {
      projectionVersion: COVERAGE_STRATEGY_HEALTHCARE_LIFETIME_PROJECTION_VERSION,
      status: includedRecords.length ? "complete" : "unavailable",
      healthcarePoints,
      includedRecords: includedRecords.map(clonePlainValue),
      excludedRecords: excludedRecords.map(clonePlainValue),
      supportOwnedHealthcareExpenseExcludedCount: supportOwnedHealthcareExcludedRecords.length,
      healthcareLookingExcludedRecords: supportOwnedHealthcareExcludedRecords.map(clonePlainValue),
      assumptionsUsed: {
        valuationDate: valuationDateResult ? valuationDateResult.normalizedDate : null,
        clientDateOfBirth: clientDateOfBirth || null,
        currentAge,
        horizonYears,
        healthcareInflationRateInput: rateResult.sourceValue,
        healthcareInflationAnnualRate: roundRatio(rateResult.annualRate),
        healthcareInflationApplied: rateResult.applied,
        ongoingDurationRule: "coverage-strategy-projection-horizon",
        blankDurationRule: "default-to-ongoing-through-projection-horizon",
        internalHealthcareProjectionYearsCutoffUsed: false
      },
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-healthcare-lifetime-projection",
        inputExpenseFactCount: getExpenseFactArray(safeInput.expenseFacts).length,
        includedRecordCount: includedRecords.length,
        excludedRecordCount: excludedRecords.length,
        supportOwnedHealthcareExpenseExcludedCount: supportOwnedHealthcareExcludedRecords.length,
        pointCount: healthcarePoints.length,
        displayHtmlUsed: false,
        storageUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_HEALTHCARE_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_HEALTHCARE_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.buildCoverageStrategyHealthcareLifetimeProjection =
    buildCoverageStrategyHealthcareLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_HEALTHCARE_LIFETIME_PROJECTION_VERSION,
      buildCoverageStrategyHealthcareLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
