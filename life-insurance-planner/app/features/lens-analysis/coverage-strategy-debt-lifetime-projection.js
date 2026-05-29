(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Coverage Strategy debt lifetime projection.
  // Purpose: project non-mortgage debt payoff obligations across future death
  // years from explicit debt facts. Non-goals: no DOM, storage, PMI writes,
  // mortgage projection, resource math, coverage layers, or gap/surplus math.
  const COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-debt-lifetime-projection-v1";
  const DEFAULT_VALUATION_DATE = "2026-01-01";
  const MIN_PAYOFF_PERCENT = 0;
  const MAX_PAYOFF_PERCENT = 100;

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
    return Number.isFinite(value) ? Math.max(0, Number(value.toFixed(2))) : 0;
  }

  function roundRate(value) {
    return Number.isFinite(value) ? Number(value.toFixed(10)) : null;
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
    const existing = target.find(function (issue) {
      return issue && issue.code === code;
    });
    if (existing) {
      return existing;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function addRecordIssue(target, code, message, details) {
    if (!Array.isArray(target)) {
      return null;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
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

  function formatDateOnly(date) {
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function addYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const target = new Date(dateResult.date.getTime());
    target.setUTCFullYear(target.getUTCFullYear() + years);
    return formatDateOnly(target);
  }

  function monthsBetween(startDate, endDate) {
    const wholeMonths = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
      + (endDate.getUTCMonth() - startDate.getUTCMonth());
    return endDate.getUTCDate() < startDate.getUTCDate() ? wholeMonths - 1 : wholeMonths;
  }

  function normalizeAnnualRate(value) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      return null;
    }
    return parsed > 1 ? parsed / 100 : parsed;
  }

  function normalizePayoffPercent(debt) {
    const explicit = toOptionalNumber(debt?.payoffPercent);
    if (explicit != null) {
      return Math.min(MAX_PAYOFF_PERCENT, Math.max(MIN_PAYOFF_PERCENT, explicit));
    }
    const treatedAmount = toOptionalNumber(debt?.treatedAmount);
    const balance = toOptionalNumber(debt?.rawBalance ?? debt?.currentBalance ?? debt?.balance);
    if (treatedAmount != null && balance != null && balance > 0) {
      return Math.min(MAX_PAYOFF_PERCENT, Math.max(MIN_PAYOFF_PERCENT, (treatedAmount / balance) * 100));
    }
    return MAX_PAYOFF_PERCENT;
  }

  function normalizePaymentFrequency(value, warnings, debt) {
    const key = normalizeString(value || debt?.paymentFrequency || debt?.minimumPaymentFrequency || "monthly")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    const multipliers = {
      monthly: 1,
      month: 1,
      semimonthly: 2,
      twiceamonth: 2,
      biweekly: 26 / 12,
      everytwoweeks: 26 / 12,
      weekly: 52 / 12,
      quarterly: 1 / 3,
      annual: 1 / 12,
      annually: 1 / 12,
      yearly: 1 / 12
    };
    if (multipliers[key] != null) {
      return {
        key: key || "monthly",
        monthlyMultiplier: multipliers[key]
      };
    }
    addIssue(
      warnings,
      "debt-projection-payment-frequency-unrecognized",
      "Debt payment frequency was unrecognized; monthly frequency was assumed for projection.",
      {
        debtFactId: debt?.debtFactId || null,
        paymentFrequency: value || debt?.paymentFrequency || debt?.minimumPaymentFrequency || null
      }
    );
    return {
      key: "monthly",
      monthlyMultiplier: 1
    };
  }

  function buildPointSpine(input, valuationDateResult, warnings) {
    const safePoints = Array.isArray(input?.needPoints) ? input.needPoints : [];
    if (safePoints.length) {
      return safePoints.map(function (point, index) {
        const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex ?? index) || 0));
        const fallbackDate = addYears(valuationDateResult, yearIndex);
        const parsedDate = normalizeDateOnly(point?.date) || normalizeDateOnly(fallbackDate);
        if (!parsedDate) {
          addIssue(
            warnings,
            "debt-projection-point-date-missing",
            "Debt projection used yearIndex * 12 because a need point date was unavailable.",
            { yearIndex }
          );
        }
        return {
          yearIndex,
          date: parsedDate?.normalizedDate || point?.date || fallbackDate || null,
          calendarYear: point?.calendarYear ?? parsedDate?.calendarYear ?? null,
          age: toOptionalNumber(point?.age)
        };
      });
    }

    const horizonYears = Math.max(0, Math.round(toOptionalNumber(input?.horizonYears ?? input?.projectionYears) || 0));
    return Array.from({ length: horizonYears + 1 }, function (_unused, yearIndex) {
      const date = addYears(valuationDateResult, yearIndex);
      const parsedDate = normalizeDateOnly(date);
      return {
        yearIndex,
        date,
        calendarYear: parsedDate?.calendarYear ?? null,
        age: null
      };
    });
  }

  function isMortgageDebt(debt) {
    if (!isPlainObject(debt)) {
      return false;
    }
    if (debt.isMortgage === true) {
      return true;
    }
    const candidates = [
      debt.categoryKey,
      debt.typeKey,
      debt.sourceKey,
      debt.debtType,
      debt.label
    ].map(function (value) {
      return normalizeString(value).toLowerCase();
    });
    return candidates.some(function (value) {
      return value === "mortgagebalance"
        || value === "primaryresidencemortgage"
        || value === "primary residence mortgage"
        || value === "mortgage";
    });
  }

  function classifyNonMortgageDebtOptionKey(debt) {
    const candidates = [
      debt?.categoryKey,
      debt?.typeKey,
      debt?.sourceKey,
      debt?.debtType,
      debt?.label
    ].map(function (value) {
      return normalizeString(value).toLowerCase();
    });
    if (candidates.some(function (value) {
      return value.includes("creditcard") || value.includes("credit card");
    })) {
      return "includeCreditCards";
    }
    if (candidates.some(function (value) {
      return value.includes("autoloan") || value.includes("auto loan") || value.includes("vehicle");
    })) {
      return "includeAutoLoans";
    }
    if (candidates.some(function (value) {
      return value.includes("studentloan") || value.includes("student loan") || value.includes("educationdebt");
    })) {
      return "includeStudentLoans";
    }
    if (candidates.some(function (value) {
      return value.includes("personalloan") || value.includes("personal loan");
    })) {
      return "includePersonalLoans";
    }
    return "includeOtherNonMortgageDebts";
  }

  function isDebtIncludedByOptions(debt, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const optionKey = classifyNonMortgageDebtOptionKey(debt);
    return {
      optionKey,
      included: safeOptions[optionKey] !== false
    };
  }

  function projectAmortizedBalance(principal, monthlyRate, monthlyPayment, elapsedMonths) {
    const months = Math.max(0, Math.round(elapsedMonths));
    if (months <= 0) {
      return principal;
    }
    if (monthlyRate <= 0) {
      return roundMoney(principal - monthlyPayment * months);
    }
    const factor = Math.pow(1 + monthlyRate, months);
    const balance = principal * factor - monthlyPayment * ((factor - 1) / monthlyRate);
    return roundMoney(balance);
  }

  function calculateAmortizedTermMonths(principal, monthlyRate, monthlyPayment) {
    const safePrincipal = toOptionalNumber(principal);
    const safeRate = toOptionalNumber(monthlyRate);
    const safePayment = toOptionalNumber(monthlyPayment);
    if (
      safePrincipal == null
      || safePrincipal <= 0
      || safeRate == null
      || safeRate < 0
      || safePayment == null
      || safePayment <= 0
    ) {
      return null;
    }
    if (safeRate <= 0) {
      return Math.ceil(safePrincipal / safePayment);
    }
    const monthlyInterestAmount = safePrincipal * safeRate;
    if (safePayment <= monthlyInterestAmount) {
      return null;
    }
    const months = -Math.log(1 - (safeRate * safePrincipal) / safePayment) / Math.log(1 + safeRate);
    return Number.isFinite(months) && months >= 0 ? Math.ceil(months) : null;
  }

  function projectStraightLineBalance(principal, remainingTermMonths, elapsedMonths) {
    const safeTerm = Math.max(0, Math.round(remainingTermMonths));
    const months = Math.max(0, Math.round(elapsedMonths));
    if (safeTerm <= 0 || months >= safeTerm) {
      return 0;
    }
    return roundMoney(principal * (1 - months / safeTerm));
  }

  function normalizeDebtRecord(debt, index, warnings, dataGaps, options) {
    const safeDebt = isPlainObject(debt) ? debt : {};
    const debtFactId = normalizeString(safeDebt.debtFactId || safeDebt.debtId || safeDebt.id) || `debt-${index + 1}`;
    if (isMortgageDebt(safeDebt)) {
      return {
        debtFactId,
        excluded: true,
        exclusionReason: "mortgage-debt-excluded",
        trace: {
          debtFactId,
          label: normalizeString(safeDebt.label) || null,
          categoryKey: normalizeString(safeDebt.categoryKey) || null,
          typeKey: normalizeString(safeDebt.typeKey) || null,
          sourceKey: normalizeString(safeDebt.sourceKey) || null
        }
      };
    }
    const optionDecision = isDebtIncludedByOptions(safeDebt, options);
    if (!optionDecision.included) {
      return {
        debtFactId,
        excluded: true,
        exclusionReason: "option-excluded",
        trace: {
          debtFactId,
          label: normalizeString(safeDebt.label) || null,
          optionKey: optionDecision.optionKey,
          projectionMode: "unavailable"
        }
      };
    }

    const rawBalance = toOptionalNumber(
      safeDebt.rawBalance
      ?? safeDebt.currentBalance
      ?? safeDebt.balance
      ?? safeDebt.outstandingBalance
      ?? safeDebt.payoffAmount
      ?? safeDebt.currentPayoffAmount
      ?? safeDebt.treatedAmount
    );
    const payoffPercent = normalizePayoffPercent(safeDebt);
    const included = safeDebt.included === false
      || normalizeString(safeDebt.treatmentMode).toLowerCase() === "exclude"
      || normalizeString(safeDebt.treatmentMode).toLowerCase() === "deferred"
      || payoffPercent <= 0
      ? false
      : true;
    const annualInterestRate = normalizeAnnualRate(
      safeDebt.annualInterestRate
      ?? safeDebt.annualInterestRatePercent
      ?? safeDebt.interestRatePercent
      ?? safeDebt.interestRate
    );
    const paymentValue = toOptionalNumber(
      safeDebt.monthlyPayment
      ?? safeDebt.minimumMonthlyPayment
      ?? safeDebt.paymentAmount
      ?? safeDebt.minimumPayment
    );
    const frequency = normalizePaymentFrequency(
      safeDebt.paymentFrequency || safeDebt.minimumPaymentFrequency,
      warnings,
      safeDebt
    );
    const monthlyPayment = paymentValue == null ? null : roundMoney(paymentValue * frequency.monthlyMultiplier);
    const remainingTermMonths = toOptionalNumber(
      safeDebt.remainingTermMonths
      ?? safeDebt.termRemainingMonths
      ?? safeDebt.calculatedRemainingTermMonths
      ?? safeDebt.enteredRemainingTermMonths
      ?? safeDebt.termMonths
    );

    if (!included) {
      return {
        debtFactId,
        excluded: true,
        exclusionReason: "not-treated-as-payoff-obligation",
        trace: {
          debtFactId,
          label: normalizeString(safeDebt.label) || null,
          payoffPercent,
          treatmentMode: normalizeString(safeDebt.treatmentMode) || null,
          included: safeDebt.included ?? null
        }
      };
    }

    if (rawBalance == null || rawBalance < 0) {
      addIssue(
        dataGaps,
        "debt-projection-amount-unavailable",
        "Debt lifetime projection requires a valid current balance or payoff amount; this debt was excluded from projected payoff.",
        { debtFactId, currentBalance: safeDebt.currentBalance ?? safeDebt.rawBalance ?? null }
      );
      return {
        debtFactId,
        excluded: true,
        exclusionReason: "unavailable",
        trace: {
          debtFactId,
          label: normalizeString(safeDebt.label) || null,
          projectionMode: "unavailable"
        }
      };
    }

    const hasRemainingTerm = remainingTermMonths != null && remainingTermMonths > 0;
    const hasMonthlyPayment = monthlyPayment != null && monthlyPayment > 0;
    const hasAnnualRate = annualInterestRate != null;
    const enteredRemainingTermMonths = toOptionalNumber(
      safeDebt.enteredRemainingTermMonths
      ?? safeDebt.userEnteredRemainingTermMonths
    );
    const calculatedAmortizedTermMonths = toOptionalNumber(
      safeDebt.calculatedAmortizedTermMonths
      ?? safeDebt.calculatedRemainingTermMonths
    ) ?? calculateAmortizedTermMonths(rawBalance, annualInterestRate == null ? null : annualInterestRate / 12, monthlyPayment);
    const recordWarnings = [];
    let projectionMode = "flatFallback";
    if (hasMonthlyPayment && hasAnnualRate) {
      projectionMode = "amortized";
      if (monthlyPayment <= rawBalance * (annualInterestRate / 12)) {
        projectionMode = "flatFallback";
        addIssue(
          warnings,
          "debt-projection-negative-amortization-flat-fallback",
          "Debt payment does not cover projected monthly interest; flat fallback was used to avoid silently increasing payoff need.",
          {
            debtFactId,
            currentBalance: rawBalance,
            monthlyPayment,
            monthlyInterestAmount: roundMoney(rawBalance * (annualInterestRate / 12))
          }
        );
      }
    } else if (hasRemainingTerm) {
      projectionMode = "termStraightLine";
      addIssue(
        warnings,
        hasAnnualRate
          ? "debt-projection-payment-missing-term-straight-line"
          : "debt-projection-rate-missing-term-straight-line",
        hasAnnualRate
          ? "Debt payment was missing; straight-line balance decline over the remaining term was used instead of inventing amortized precision."
          : "Debt interest rate was missing; straight-line balance decline over the remaining term was used.",
        {
          debtFactId,
          remainingTermMonths,
          paymentAmount: safeDebt.monthlyPayment ?? safeDebt.minimumMonthlyPayment ?? null,
          interestRatePercent: safeDebt.interestRatePercent ?? safeDebt.annualInterestRatePercent ?? null
        }
      );
    } else if (hasMonthlyPayment) {
      projectionMode = "paymentStraightLine";
      addIssue(
        warnings,
        "debt-projection-term-rate-missing-payment-straight-line",
        "Debt term and/or interest rate was missing; monthly payment straight-line balance decline was used.",
        {
          debtFactId,
          monthlyPayment,
          interestRatePercent: safeDebt.interestRatePercent ?? safeDebt.annualInterestRatePercent ?? null,
          remainingTermMonths: safeDebt.remainingTermMonths ?? null
        }
      );
    } else {
      projectionMode = "flatFallback";
      addIssue(
        dataGaps,
        "debt-projection-payoff-timing-unavailable",
        "Debt payoff timing was unavailable; flat fallback kept the non-mortgage debt obligation through the horizon.",
        {
          debtFactId,
          currentBalance: rawBalance,
          monthlyPayment: safeDebt.monthlyPayment ?? safeDebt.minimumMonthlyPayment ?? null,
          remainingTermMonths: safeDebt.remainingTermMonths ?? null,
          interestRatePercent: safeDebt.interestRatePercent ?? safeDebt.annualInterestRatePercent ?? null
        }
      );
    }

    const termMismatch = Boolean(
      projectionMode === "amortized"
      && enteredRemainingTermMonths != null
      && calculatedAmortizedTermMonths != null
      && Math.abs(Math.ceil(enteredRemainingTermMonths) - Math.ceil(calculatedAmortizedTermMonths)) > 1
    );
    if (termMismatch) {
      const mismatchWarning = addRecordIssue(
        warnings,
        "debt-record-payment-term-mismatch",
        "Debt entered remaining term differs from the payoff term implied by balance, payment, and rate; amortization based on payment/rate was used for projection.",
        {
          debtId: debtFactId,
          debtFactId,
          label: normalizeString(safeDebt.label) || null,
          enteredRemainingTermMonths: Math.ceil(enteredRemainingTermMonths),
          calculatedAmortizedTermMonths: Math.ceil(calculatedAmortizedTermMonths),
          balance: roundMoney(rawBalance),
          monthlyPayment,
          interestRatePercent: annualInterestRate == null ? null : roundRate(annualInterestRate * 100),
          projectionMode,
          sourcePath: normalizeString(safeDebt.sourcePath) || null,
          explanation: "Coverage Strategy used payment/rate amortization for the non-mortgage debt projection instead of the user-entered remaining term."
        }
      );
      if (mismatchWarning) {
        recordWarnings.push(mismatchWarning);
      }
    }

    return {
      debtFactId,
      label: normalizeString(safeDebt.label) || `Debt ${index + 1}`,
      categoryKey: normalizeString(safeDebt.categoryKey) || null,
      typeKey: normalizeString(safeDebt.typeKey) || null,
      sourceKey: normalizeString(safeDebt.sourceKey) || null,
      currentBalance: roundMoney(rawBalance),
      payoffPercent,
      annualInterestRate,
      monthlyInterestRate: annualInterestRate == null ? null : annualInterestRate / 12,
      monthlyPayment,
      remainingTermMonths: remainingTermMonths == null ? null : Math.round(remainingTermMonths),
      enteredRemainingTermMonths: enteredRemainingTermMonths == null ? null : Math.ceil(enteredRemainingTermMonths),
      calculatedAmortizedTermMonths: calculatedAmortizedTermMonths == null
        ? null
        : Math.ceil(calculatedAmortizedTermMonths),
      projectionMode,
      warnings: recordWarnings,
      trace: {
        debtFactId,
        label: normalizeString(safeDebt.label) || null,
        categoryKey: normalizeString(safeDebt.categoryKey) || null,
        typeKey: normalizeString(safeDebt.typeKey) || null,
        sourceKey: normalizeString(safeDebt.sourceKey) || null,
        rawBalance: roundMoney(rawBalance),
        treatedAmount: toOptionalNumber(safeDebt.treatedAmount),
        payoffPercent,
        projectionMode,
        monthlyPayment,
        annualInterestRate: annualInterestRate == null ? null : roundRate(annualInterestRate),
        remainingTermMonths: remainingTermMonths == null ? null : Math.round(remainingTermMonths),
        enteredRemainingTermMonths: enteredRemainingTermMonths == null ? null : Math.ceil(enteredRemainingTermMonths),
        calculatedAmortizedTermMonths: calculatedAmortizedTermMonths == null
          ? null
          : Math.ceil(calculatedAmortizedTermMonths),
        paymentTermMismatch: termMismatch,
        warnings: recordWarnings,
        paymentFrequency: frequency.key,
        sourcePath: normalizeString(safeDebt.sourcePath) || null,
        source: "coverage-strategy-debt-lifetime-projection"
      }
    };
  }

  function projectDebtAtPoint(debt, point, valuationDateResult) {
    const parsedPointDate = normalizeDateOnly(point.date);
    const elapsedMonths = parsedPointDate
      ? Math.max(0, monthsBetween(valuationDateResult.date, parsedPointDate.date))
      : Math.max(0, point.yearIndex * 12);
    let projectedBalance = debt.currentBalance;

    if (debt.projectionMode === "amortized") {
      projectedBalance = debt.remainingTermMonths != null && elapsedMonths >= debt.remainingTermMonths
        ? 0
        : projectAmortizedBalance(
            debt.currentBalance,
            debt.monthlyInterestRate,
            debt.monthlyPayment,
            elapsedMonths
          );
    } else if (debt.projectionMode === "termStraightLine") {
      projectedBalance = projectStraightLineBalance(debt.currentBalance, debt.remainingTermMonths, elapsedMonths);
    } else if (debt.projectionMode === "paymentStraightLine") {
      projectedBalance = roundMoney(debt.currentBalance - debt.monthlyPayment * elapsedMonths);
    }

    projectedBalance = roundMoney(Math.max(0, projectedBalance));
    return {
      yearIndex: point.yearIndex,
      date: point.date,
      calendarYear: point.calendarYear,
      age: point.age,
      debtFactId: debt.debtFactId,
      label: debt.label,
      categoryKey: debt.categoryKey,
      typeKey: debt.typeKey,
      sourceKey: debt.sourceKey,
      elapsedMonths,
      projectedBalance,
      payoffObligationAmount: roundMoney(projectedBalance * (debt.payoffPercent / 100)),
      remainingTermMonths: debt.remainingTermMonths == null
        ? null
        : Math.max(0, debt.remainingTermMonths - elapsedMonths),
      projectionMode: debt.projectionMode,
      sourceFactsUsed: {
        currentBalance: debt.currentBalance,
        annualInterestRate: debt.annualInterestRate == null ? null : roundRate(debt.annualInterestRate),
        monthlyInterestRate: debt.monthlyInterestRate == null ? null : roundRate(debt.monthlyInterestRate),
        monthlyPayment: debt.monthlyPayment,
        remainingTermMonths: debt.remainingTermMonths,
        payoffPercent: debt.payoffPercent
      }
    };
  }

  function summarizeProjectionModes(projectedDebts) {
    return projectedDebts.reduce(function (summary, debt) {
      const key = debt.projectionMode || "unknown";
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {});
  }

  function buildDebtLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate) || normalizeDateOnly(DEFAULT_VALUATION_DATE);
    if (!normalizeDateOnly(safeInput.valuationDate)) {
      addIssue(
        warnings,
        "debt-projection-valuation-date-defaulted",
        "Debt projection valuationDate was missing or invalid; a deterministic fallback date was used.",
        { fallbackValuationDate: DEFAULT_VALUATION_DATE }
      );
    }

    const sourceDebts = Array.isArray(safeInput.debts) ? safeInput.debts : [];
    if (!sourceDebts.length) {
      addIssue(
        dataGaps,
        "debt-projection-debt-records-missing",
        "Debt lifetime projection requires normalized non-mortgage debt records; no records were provided.",
        {}
      );
    }

    const normalizedRows = sourceDebts.map(function (debt, index) {
      return normalizeDebtRecord(debt, index, warnings, dataGaps, safeInput.options);
    });
    const includedDebts = normalizedRows.filter(function (debt) {
      return debt && debt.excluded !== true;
    });
    const excludedDebts = normalizedRows.filter(function (debt) {
      return debt && debt.excluded === true;
    });
    const pointSpine = buildPointSpine(safeInput, valuationDateResult, warnings);
    const debtRecordProjections = includedDebts.map(function (debt) {
      return {
        debtFactId: debt.debtFactId,
        label: debt.label,
        categoryKey: debt.categoryKey,
        typeKey: debt.typeKey,
        sourceKey: debt.sourceKey,
        projectionMode: debt.projectionMode,
        warnings: Array.isArray(debt.warnings) ? clonePlainValue(debt.warnings) : [],
        points: pointSpine.map(function (point) {
          return projectDebtAtPoint(debt, point, valuationDateResult);
        }),
        trace: clonePlainValue(debt.trace)
      };
    });

    const projectionsByYear = new Map();
    debtRecordProjections.forEach(function (record) {
      record.points.forEach(function (point) {
        const existing = projectionsByYear.get(point.yearIndex) || [];
        existing.push(point);
        projectionsByYear.set(point.yearIndex, existing);
      });
    });

    const debtPoints = pointSpine.map(function (point) {
      const pointDebts = projectionsByYear.get(point.yearIndex) || [];
      const projectedDebtBalance = roundMoney(pointDebts.reduce(function (sum, debt) {
        return sum + debt.projectedBalance;
      }, 0));
      const payoffObligationAmount = roundMoney(pointDebts.reduce(function (sum, debt) {
        return sum + debt.payoffObligationAmount;
      }, 0));
      const modeCounts = summarizeProjectionModes(pointDebts);

      return {
        yearIndex: point.yearIndex,
        date: point.date,
        calendarYear: point.calendarYear,
        age: point.age,
        elapsedMonths: pointDebts.length ? pointDebts[0].elapsedMonths : Math.max(0, point.yearIndex * 12),
        projectedDebtBalance,
        payoffObligationAmount,
        debtsIncludedCount: includedDebts.length,
        debtsFallbackCount:
          (modeCounts.termStraightLine || 0)
          + (modeCounts.paymentStraightLine || 0)
          + (modeCounts.flatFallback || 0),
        warnings: [],
        dataGaps: [],
        trace: {
          adapterVersion: COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION,
          projectionModeCounts: modeCounts,
          debtRecordCount: pointDebts.length,
          source: "coverage-strategy-debt-lifetime-projection",
          debts: pointDebts.map(function (debt) {
            return {
              debtFactId: debt.debtFactId,
              projectionMode: debt.projectionMode,
              projectedBalance: debt.projectedBalance,
              payoffObligationAmount: debt.payoffObligationAmount,
              remainingTermMonths: debt.remainingTermMonths,
              sourceFactsUsed: debt.sourceFactsUsed
            };
          })
        }
      };
    });

    const projectionModeCounts = includedDebts.reduce(function (summary, debt) {
      const key = debt.projectionMode || "unknown";
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {});

    return {
      adapterVersion: COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      debtPoints,
      debtRecordProjections,
      assumptionsUsed: {
        valuationDate: valuationDateResult.normalizedDate,
        debtsInputCount: sourceDebts.length,
        debtsIncludedCount: includedDebts.length,
        debtsExcludedCount: excludedDebts.length,
        projectionModeCounts
      },
      warnings,
      dataGaps,
      trace: {
        adapterVersion: COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION,
        pointCount: debtPoints.length,
        debtRecordCount: debtRecordProjections.length,
        excludedDebts: excludedDebts.map(function (debt) {
          return {
            debtFactId: debt.debtFactId,
            exclusionReason: debt.exclusionReason,
            trace: debt.trace || {}
          };
        }),
        displayHtmlUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.buildDebtLifetimeProjection = buildDebtLifetimeProjection;
  lensAnalysis.buildNonMortgageDebtLifetimeProjection = buildDebtLifetimeProjection;
  lensAnalysis.calculateCoverageStrategyNonMortgageDebtLifetimeProjection = buildDebtLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_DEBT_LIFETIME_PROJECTION_VERSION,
      buildDebtLifetimeProjection,
      buildNonMortgageDebtLifetimeProjection: buildDebtLifetimeProjection,
      calculateCoverageStrategyNonMortgageDebtLifetimeProjection: buildDebtLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
