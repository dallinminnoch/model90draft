// Coverage Strategy final expense lifetime projection engine.
// Future home after folder reorganization:
// app/features/lens-analysis/coverage-strategy/projections/final-expense-lifetime-projection.js
// Backend-ready pure calculation engine: accepts normalized final expense facts and explicit assumptions, returns serializable projection output.
// Owns Coverage Strategy-specific death-year final expense projection.
// Does not own PMI intake, Needs/LENS aggregate final expense math, recurring healthcare math, debt, storage, DOM, or display rendering.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_FINAL_EXPENSE_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-final-expense-lifetime-projection-v1";
  const FINAL_EXPENSE_CATEGORY_KEYS = Object.freeze([
    "funeralBurial",
    "medicalFinalExpense",
    "estateSettlement",
    "otherFinalExpense"
  ]);
  const RECURRING_HEALTHCARE_CATEGORY_KEYS = Object.freeze([
    "ongoingHealthcare",
    "dentalCare",
    "visionCare",
    "mentalHealthCare",
    "longTermCare",
    "homeHealthCare",
    "medicalEquipment",
    "otherHealthcare"
  ]);

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

  function normalizePercentRate(value, rateKind, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      if (value != null && value !== "") {
        addIssue(
          warnings,
          `invalid-${rateKind}-inflation-rate-current-dollar`,
          "Inflation rate was invalid; Coverage Strategy final expense projection used current dollars for the affected component.",
          { received: value, rateKind }
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

  function getCurrentDollarAmount(fact) {
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

  function isDebtLikeFact(fact) {
    const source = normalizeString(fact.source);
    const sourceKey = normalizeString(fact.sourceKey);
    const sourcePath = normalizeString(fact.sourcePath);
    const typeKey = normalizeString(fact.typeKey);
    const categoryKey = normalizeString(fact.categoryKey);
    return fact.isDebtPaymentExpense === true
      || sourceKey === "debtRecords"
      || /debtRecords/.test(source)
      || /debtRecords/.test(sourcePath)
      || /debt/i.test(typeKey)
      || /debt/i.test(categoryKey);
  }

  function componentFromCategory(categoryKey) {
    if (categoryKey === "medicalFinalExpense") {
      return "medicalEndOfLife";
    }
    if (categoryKey === "funeralBurial") {
      return "funeralBurial";
    }
    if (categoryKey === "estateSettlement") {
      return "estateSettlement";
    }
    if (categoryKey === "otherFinalExpense") {
      return "otherFinalExpense";
    }
    return "otherFinalExpense";
  }

  function createExcludedRecord(fact, index, code, message) {
    const safeFact = isPlainObject(fact) ? fact : {};
    return {
      expenseFactId: safeFact.expenseFactId || null,
      expenseRecordId: safeFact.expenseRecordId || null,
      sourcePath: safeFact.sourcePath || `expenseFacts.expenses[${index}]`,
      typeKey: safeFact.typeKey || null,
      categoryKey: safeFact.categoryKey || null,
      label: safeFact.label || safeFact.typeKey || null,
      exclusionCode: code,
      exclusionReason: message,
      trace: {
        isFinalExpenseComponent: safeFact.isFinalExpenseComponent === true,
        isHealthcareSensitive: safeFact.isHealthcareSensitive === true,
        sourceKey: safeFact.sourceKey || null,
        source: safeFact.source || null
      }
    };
  }

  function classifyExpenseFact(fact, index) {
    if (!isPlainObject(fact)) {
      return {
        included: false,
        record: createExcludedRecord(null, index, "invalid-expense-fact", "Expense fact was not an object.")
      };
    }
    if (isDebtLikeFact(fact)) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "debt-like-final-expense-excluded",
          "Debt and generated debt-payment facts are handled by debt projection."
        )
      };
    }
    const categoryKey = normalizeString(fact.categoryKey);
    if (RECURRING_HEALTHCARE_CATEGORY_KEYS.indexOf(categoryKey) !== -1) {
      return {
        included: false,
        record: createExcludedRecord(
          fact,
          index,
          "recurring-healthcare-final-expense-excluded",
          "Recurring healthcare facts are handled by healthcare lifetime projection."
        )
      };
    }
    if (fact.isFinalExpenseComponent === true || FINAL_EXPENSE_CATEGORY_KEYS.indexOf(categoryKey) !== -1) {
      return {
        included: true,
        fact
      };
    }
    return {
      included: false,
      record: createExcludedRecord(
        fact,
        index,
        "non-final-expense-excluded",
        "Expense fact is not classified as a final expense component."
      )
    };
  }

  function createIncludedRecord(fact, index, sourcePrefix) {
    const amountResult = getCurrentDollarAmount(fact);
    if (amountResult.amount == null) {
      return {
        excluded: true,
        record: {
          expenseFactId: fact.expenseFactId || null,
          expenseRecordId: fact.expenseRecordId || null,
          sourcePath: fact.sourcePath || `${sourcePrefix || "expenseFacts.expenses"}[${index}]`,
          typeKey: fact.typeKey || null,
          categoryKey: fact.categoryKey || null,
          label: fact.label || fact.typeKey || null,
          exclusionCode: "invalid-final-expense-amount",
          exclusionReason: "Final expense record was eligible by category but missing a usable current-dollar amount.",
          trace: {
            isFinalExpenseComponent: fact.isFinalExpenseComponent === true
          }
        }
      };
    }
    const categoryKey = normalizeString(fact.categoryKey);
    const componentKey = fact.componentKey || componentFromCategory(categoryKey);
    const inflationRole = componentKey === "medicalEndOfLife"
      ? "healthcareInflation"
      : "finalExpenseInflation";
    return {
      excluded: false,
      record: {
        expenseFactId: fact.expenseFactId || null,
        expenseRecordId: fact.expenseRecordId || null,
        sourcePath: fact.sourcePath || `${sourcePrefix || "expenseFacts.expenses"}[${index}]`,
        typeKey: fact.typeKey || null,
        categoryKey: categoryKey || null,
        label: fact.label || fact.typeKey || componentKey,
        componentKey,
        currentAmount: roundMoney(amountResult.amount),
        amountSource: amountResult.source,
        inflationRole,
        trace: {
          source: fact.source || null,
          sourceKey: fact.sourceKey || null,
          sourcePath: fact.sourcePath || `${sourcePrefix || "expenseFacts.expenses"}[${index}]`,
          isFinalExpenseComponent: fact.isFinalExpenseComponent === true,
          isHealthcareSensitive: fact.isHealthcareSensitive === true
        }
      }
    };
  }

  function scalarAmount(source, paths) {
    for (let index = 0; index < paths.length; index += 1) {
      const value = toOptionalNumber(source[paths[index]]);
      if (value != null && value >= 0) {
        return {
          amount: value,
          field: paths[index]
        };
      }
    }
    return {
      amount: null,
      field: null
    };
  }

  function createScalarFact(amountResult, field, categoryKey, componentKey, label) {
    if (amountResult.amount == null || !(amountResult.amount > 0)) {
      return null;
    }
    return {
      expenseFactId: `final-expense:${field}`,
      expenseRecordId: null,
      sourcePath: `finalExpenseFacts.${field}`,
      source: "finalExpenseFacts",
      sourceKey: "finalExpenseFacts",
      typeKey: field,
      categoryKey,
      componentKey,
      label,
      amount: amountResult.amount,
      isFinalExpenseComponent: true
    };
  }

  function buildScalarFinalExpenseFacts(finalExpenseFacts) {
    const source = isPlainObject(finalExpenseFacts) ? finalExpenseFacts : {};
    const facts = [];
    const medical = scalarAmount(source, ["medicalEndOfLifeCost", "medicalEndOfLifeCosts"]);
    const funeral = scalarAmount(source, ["funeralAndBurialCost", "funeralBurialEstimate"]);
    const estate = scalarAmount(source, ["estateSettlementCost", "estateSettlementCosts"]);
    const other = scalarAmount(source, ["otherFinalExpenses"]);
    [
      createScalarFact(medical, medical.field, "medicalFinalExpense", "medicalEndOfLife", "Medical end-of-life costs"),
      createScalarFact(funeral, funeral.field, "funeralBurial", "funeralBurial", "Funeral and burial"),
      createScalarFact(estate, estate.field, "estateSettlement", "estateSettlement", "Estate settlement"),
      createScalarFact(other, other.field, "otherFinalExpense", "otherFinalExpense", "Other final expenses")
    ].forEach(function (fact) {
      if (fact) {
        facts.push(fact);
      }
    });
    if (!facts.length) {
      const total = scalarAmount(source, ["totalFinalExpenseNeed", "combinedFinalExpenseUsed"]);
      const totalFact = createScalarFact(
        total,
        total.field,
        "otherFinalExpense",
        "otherFinalExpense",
        "Total final expense fallback"
      );
      if (totalFact) {
        facts.push(totalFact);
      }
    }
    return facts;
  }

  function collectRecords(input, warnings, dataGaps) {
    const includedRecords = [];
    const excludedRecords = [];
    const expenseFacts = getExpenseFactArray(input.expenseFacts);
    expenseFacts.forEach(function (fact, index) {
      const classification = classifyExpenseFact(fact, index);
      if (!classification.included) {
        excludedRecords.push(classification.record);
        return;
      }
      const included = createIncludedRecord(classification.fact, index, "expenseFacts.expenses");
      if (included.excluded) {
        excludedRecords.push(included.record);
        addIssue(
          dataGaps,
          "invalid-final-expense-amount",
          "Final expense fact was present but missing a usable amount.",
          { sourcePath: included.record.sourcePath }
        );
        return;
      }
      includedRecords.push(included.record);
    });

    if (includedRecords.length) {
      return {
        includedRecords,
        excludedRecords
      };
    }

    buildScalarFinalExpenseFacts(input.finalExpenseFacts).forEach(function (fact, index) {
      const included = createIncludedRecord(fact, index, "finalExpenseFacts");
      if (included.excluded) {
        excludedRecords.push(included.record);
        return;
      }
      includedRecords.push(included.record);
    });

    if (!includedRecords.length) {
      addIssue(
        warnings,
        "final-expense-lifetime-no-records",
        "Coverage Strategy final expense lifetime projection did not find normalized final expense records.",
        { expenseFactCount: expenseFacts.length }
      );
    }

    return {
      includedRecords,
      excludedRecords
    };
  }

  function getElapsedYears(point, valuationDateResult, warnings) {
    const pointDate = normalizeDateOnly(point?.date);
    if (valuationDateResult && pointDate) {
      return {
        elapsedYears: calculateYearsBetweenDates(valuationDateResult, pointDate),
        source: "needPoint.date-valuationDate"
      };
    }
    const yearIndex = toOptionalNumber(point?.yearIndex);
    if (yearIndex != null && yearIndex >= 0) {
      if (valuationDateResult && !pointDate) {
        addIssue(
          warnings,
          "final-expense-point-date-missing-year-index-used",
          "Final expense projection used yearIndex because a need point date was missing or invalid.",
          { yearIndex }
        );
      }
      return {
        elapsedYears: yearIndex,
        source: "needPoint.yearIndex"
      };
    }
    addIssue(
      warnings,
      "final-expense-point-elapsed-years-unavailable",
      "Final expense projection could not determine elapsed years for a need point; current-dollar amount was used.",
      { point: clonePlainValue(point) }
    );
    return {
      elapsedYears: 0,
      source: "current-dollar-fallback"
    };
  }

  function projectRecord(record, elapsedYears, rateResults) {
    const rateResult = record.inflationRole === "healthcareInflation"
      ? rateResults.healthcare
      : rateResults.finalExpense;
    const factor = Math.pow(1 + Math.max(0, rateResult.annualRate), Math.max(0, elapsedYears || 0));
    return {
      amount: roundMoney(record.currentAmount * factor),
      inflationAnnualRate: roundRatio(rateResult.annualRate),
      inflationRole: record.inflationRole,
      inflationApplied: rateResult.applied,
      inflationFactor: roundRatio(factor)
    };
  }

  function addComponentAmount(point, componentKey, amount) {
    if (componentKey === "medicalEndOfLife") {
      point.medicalEndOfLifeAmount = roundMoney(point.medicalEndOfLifeAmount + amount);
    } else if (componentKey === "funeralBurial") {
      point.funeralBurialAmount = roundMoney(point.funeralBurialAmount + amount);
    } else if (componentKey === "estateSettlement") {
      point.estateSettlementAmount = roundMoney(point.estateSettlementAmount + amount);
    } else {
      point.otherFinalExpenseAmount = roundMoney(point.otherFinalExpenseAmount + amount);
    }
  }

  function buildCoverageStrategyFinalExpenseLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const needPoints = getNeedPoints(safeInput);
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate);
    if (!valuationDateResult) {
      addIssue(
        dataGaps,
        "final-expense-valuation-date-missing",
        "Coverage Strategy final expense projection needs a valid valuationDate for point date elapsed-year calculation.",
        { valuationDate: safeInput.valuationDate || null }
      );
    }
    const rateResults = {
      finalExpense: normalizePercentRate(
        safeInput.finalExpenseInflationRatePercent,
        "final-expense",
        warnings
      ),
      healthcare: normalizePercentRate(
        safeInput.healthcareInflationRatePercent,
        "healthcare",
        warnings
      )
    };
    const records = collectRecords(safeInput, warnings, dataGaps);
    const finalExpensePoints = needPoints.map(function (point) {
      const elapsed = getElapsedYears(point, valuationDateResult, warnings);
      const includedPointRecords = [];
      const pointResult = {
        yearIndex: Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0)),
        date: point?.date || null,
        calendarYear: point?.calendarYear ?? null,
        elapsedYears: roundRatio(elapsed.elapsedYears),
        finalExpenseNeedAmount: 0,
        funeralBurialAmount: 0,
        medicalEndOfLifeAmount: 0,
        estateSettlementAmount: 0,
        otherFinalExpenseAmount: 0,
        includedRecordCount: 0,
        excludedRecordCount: records.excludedRecords.length,
        includedRecords: includedPointRecords,
        excludedRecords: records.excludedRecords.map(clonePlainValue),
        warnings: [],
        dataGaps: [],
        trace: {
          source: "coverage-strategy-final-expense-lifetime-projection",
          projectionMode: "death-year-event-cost",
          elapsedYearsSource: elapsed.source,
          finalExpenseInflationAnnualRate: roundRatio(rateResults.finalExpense.annualRate),
          healthcareInflationAnnualRate: roundRatio(rateResults.healthcare.annualRate),
          annualStreamUsed: false
        }
      };
      records.includedRecords.forEach(function (record) {
        const projection = projectRecord(record, elapsed.elapsedYears, rateResults);
        addComponentAmount(pointResult, record.componentKey, projection.amount);
        pointResult.finalExpenseNeedAmount = roundMoney(pointResult.finalExpenseNeedAmount + projection.amount);
        includedPointRecords.push({
          expenseFactId: record.expenseFactId,
          expenseRecordId: record.expenseRecordId,
          typeKey: record.typeKey,
          categoryKey: record.categoryKey,
          label: record.label,
          sourcePath: record.sourcePath,
          componentKey: record.componentKey,
          currentAmount: record.currentAmount,
          projectedAmount: projection.amount,
          inflationRole: projection.inflationRole,
          inflationAnnualRate: projection.inflationAnnualRate,
          inflationFactor: projection.inflationFactor
        });
      });
      pointResult.includedRecordCount = includedPointRecords.length;
      return pointResult;
    });

    return {
      projectionVersion: COVERAGE_STRATEGY_FINAL_EXPENSE_LIFETIME_PROJECTION_VERSION,
      status: records.includedRecords.length ? "complete" : "unavailable",
      finalExpensePoints,
      includedRecords: records.includedRecords.map(clonePlainValue),
      excludedRecords: records.excludedRecords.map(clonePlainValue),
      assumptionsUsed: {
        valuationDate: valuationDateResult ? valuationDateResult.normalizedDate : null,
        finalExpenseInflationRateInput: rateResults.finalExpense.sourceValue,
        finalExpenseInflationAnnualRate: roundRatio(rateResults.finalExpense.annualRate),
        finalExpenseInflationApplied: rateResults.finalExpense.applied,
        healthcareInflationRateInput: rateResults.healthcare.sourceValue,
        healthcareInflationAnnualRate: roundRatio(rateResults.healthcare.annualRate),
        healthcareInflationApplied: rateResults.healthcare.applied,
        medicalFinalExpenseInflationRole: "healthcareInflation",
        nonMedicalFinalExpenseInflationRole: "finalExpenseInflation",
        deathYearEventCost: true,
        annualStreamUsed: false
      },
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-final-expense-lifetime-projection",
        inputExpenseFactCount: getExpenseFactArray(safeInput.expenseFacts).length,
        includedRecordCount: records.includedRecords.length,
        excludedRecordCount: records.excludedRecords.length,
        pointCount: finalExpensePoints.length,
        displayHtmlUsed: false,
        storageUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_FINAL_EXPENSE_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_FINAL_EXPENSE_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.buildCoverageStrategyFinalExpenseLifetimeProjection =
    buildCoverageStrategyFinalExpenseLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_FINAL_EXPENSE_LIFETIME_PROJECTION_VERSION,
      buildCoverageStrategyFinalExpenseLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
