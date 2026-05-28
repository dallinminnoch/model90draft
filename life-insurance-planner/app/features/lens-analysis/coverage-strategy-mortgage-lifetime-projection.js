(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Coverage Strategy mortgage lifetime projection.
  // Purpose: project mortgage payoff obligations across future death years from
  // explicit mortgage facts. Non-goals: no DOM, storage, PMI writes, Analysis
  // Setup changes, support-stream math, resource math, or coverage-layer math.
  const COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-mortgage-lifetime-projection-v1";
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

  function normalizeAnnualRate(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      return null;
    }
    return parsed > 1 ? parsed / 100 : parsed;
  }

  function normalizePayoffPercent(value, fallback) {
    const parsed = toOptionalNumber(value);
    const candidate = parsed == null ? fallback : parsed;
    const safeFallback = fallback == null ? MAX_PAYOFF_PERCENT : fallback;
    return Math.min(MAX_PAYOFF_PERCENT, Math.max(MIN_PAYOFF_PERCENT, candidate ?? safeFallback));
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
            "mortgage-projection-point-date-missing",
            "Mortgage projection used yearIndex * 12 because a need point date was unavailable.",
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

    const horizonYears = Math.max(0, Math.round(toOptionalNumber(input?.horizonYears) || 0));
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

  function projectStraightLineBalance(principal, remainingTermMonths, elapsedMonths) {
    const safeTerm = Math.max(0, Math.round(remainingTermMonths));
    const months = Math.max(0, Math.round(elapsedMonths));
    if (safeTerm <= 0 || months >= safeTerm) {
      return 0;
    }
    return roundMoney(principal * (1 - months / safeTerm));
  }

  function resolveProjectionMode(input, warnings, dataGaps) {
    const currentBalance = toOptionalNumber(input?.currentBalance);
    const remainingTermMonths = toOptionalNumber(input?.remainingTermMonths);
    const monthlyPayment = toOptionalNumber(input?.monthlyPayment);
    const annualGrowthRate = normalizeAnnualRate(
      input?.annualInterestRate ?? input?.annualInterestRatePercent ?? input?.interestRatePercent,
      warnings
    );

    if (currentBalance == null || currentBalance < 0) {
      addIssue(
        dataGaps,
        "mortgage-projection-balance-missing",
        "Mortgage lifetime projection requires a valid current balance.",
        { currentBalance: input?.currentBalance ?? null }
      );
      return {
        projectionMode: "unavailable",
        currentBalance: null,
        remainingTermMonths,
        monthlyPayment,
        annualInterestRate: annualGrowthRate,
        monthlyInterestRate: null
      };
    }

    if (remainingTermMonths == null || remainingTermMonths <= 0) {
      addIssue(
        dataGaps,
        "mortgage-projection-term-missing",
        "Mortgage lifetime projection requires a valid remaining term; flat fallback was used.",
        { remainingTermMonths: input?.remainingTermMonths ?? null }
      );
      return {
        projectionMode: "flatFallback",
        currentBalance: roundMoney(currentBalance),
        remainingTermMonths: null,
        monthlyPayment,
        annualInterestRate: annualGrowthRate,
        monthlyInterestRate: annualGrowthRate == null ? null : annualGrowthRate / 12
      };
    }

    if (annualGrowthRate == null) {
      addIssue(
        warnings,
        "mortgage-projection-rate-missing-straight-line",
        "Mortgage interest rate was missing; straight-line balance decline fallback was used.",
        { remainingTermMonths }
      );
      return {
        projectionMode: "straightLineFallback",
        currentBalance: roundMoney(currentBalance),
        remainingTermMonths: Math.round(remainingTermMonths),
        monthlyPayment,
        annualInterestRate: null,
        monthlyInterestRate: null
      };
    }

    const monthlyInterestRate = annualGrowthRate / 12;
    if (monthlyPayment == null || monthlyPayment <= 0) {
      addIssue(
        warnings,
        "mortgage-projection-payment-missing-straight-line",
        "Mortgage payment was missing; straight-line balance decline fallback was used instead of inventing amortized precision.",
        { monthlyPayment: input?.monthlyPayment ?? null }
      );
      return {
        projectionMode: "straightLineFallback",
        currentBalance: roundMoney(currentBalance),
        remainingTermMonths: Math.round(remainingTermMonths),
        monthlyPayment,
        annualInterestRate: annualGrowthRate,
        monthlyInterestRate
      };
    }

    if (monthlyPayment <= currentBalance * monthlyInterestRate) {
      addIssue(
        warnings,
        "mortgage-projection-negative-amortization-flat-fallback",
        "Mortgage payment does not cover projected monthly interest; flat fallback was used to avoid silently increasing payoff need.",
        {
          currentBalance,
          monthlyPayment,
          monthlyInterestAmount: roundMoney(currentBalance * monthlyInterestRate)
        }
      );
      return {
        projectionMode: "flatFallback",
        currentBalance: roundMoney(currentBalance),
        remainingTermMonths: Math.round(remainingTermMonths),
        monthlyPayment,
        annualInterestRate: annualGrowthRate,
        monthlyInterestRate
      };
    }

    return {
      projectionMode: "amortized",
      currentBalance: roundMoney(currentBalance),
      remainingTermMonths: Math.round(remainingTermMonths),
      monthlyPayment: roundMoney(monthlyPayment),
      annualInterestRate: annualGrowthRate,
      monthlyInterestRate
    };
  }

  function buildMortgageLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate) || normalizeDateOnly(DEFAULT_VALUATION_DATE);
    if (!normalizeDateOnly(safeInput.valuationDate)) {
      addIssue(
        warnings,
        "mortgage-projection-valuation-date-defaulted",
        "Mortgage projection valuationDate was missing or invalid; a deterministic fallback date was used.",
        { fallbackValuationDate: DEFAULT_VALUATION_DATE }
      );
    }

    const mode = resolveProjectionMode(safeInput, warnings, dataGaps);
    const payoffPercentFallback = mode.currentBalance && toOptionalNumber(safeInput.currentPayoffAmount) != null
      ? (toOptionalNumber(safeInput.currentPayoffAmount) / mode.currentBalance) * 100
      : MAX_PAYOFF_PERCENT;
    const payoffPercent = normalizePayoffPercent(safeInput.payoffPercent, payoffPercentFallback);
    const pointSpine = buildPointSpine(safeInput, valuationDateResult, warnings);
    const mortgagePoints = mode.currentBalance == null
      ? []
      : pointSpine.map(function (point) {
          const parsedPointDate = normalizeDateOnly(point.date);
          const elapsedMonths = parsedPointDate
            ? Math.max(0, monthsBetween(valuationDateResult.date, parsedPointDate.date))
            : Math.max(0, point.yearIndex * 12);
          let projectedBalance = mode.currentBalance;
          if (mode.projectionMode === "amortized") {
            projectedBalance = elapsedMonths >= mode.remainingTermMonths
              ? 0
              : projectAmortizedBalance(
                  mode.currentBalance,
                  mode.monthlyInterestRate,
                  mode.monthlyPayment,
                  elapsedMonths
                );
          } else if (mode.projectionMode === "straightLineFallback") {
            projectedBalance = projectStraightLineBalance(mode.currentBalance, mode.remainingTermMonths, elapsedMonths);
          }
          projectedBalance = roundMoney(Math.max(0, projectedBalance));

          return {
            yearIndex: point.yearIndex,
            date: point.date,
            calendarYear: point.calendarYear,
            age: point.age,
            elapsedMonths,
            projectedBalance,
            projectedMonthlyPayment: mode.projectionMode === "amortized" ? mode.monthlyPayment : null,
            remainingTermMonths: mode.remainingTermMonths == null
              ? null
              : Math.max(0, mode.remainingTermMonths - elapsedMonths),
            payoffObligationAmount: roundMoney(projectedBalance * (payoffPercent / 100)),
            projectionMode: mode.projectionMode,
            warnings: [],
            dataGaps: [],
            trace: {
              adapterVersion: COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION,
              currentBalance: mode.currentBalance,
              annualInterestRate: mode.annualInterestRate == null ? null : roundRate(mode.annualInterestRate),
              monthlyInterestRate: mode.monthlyInterestRate == null ? null : roundRate(mode.monthlyInterestRate),
              monthlyPayment: mode.monthlyPayment == null ? null : mode.monthlyPayment,
              payoffPercent,
              source: "coverage-strategy-mortgage-lifetime-projection"
            }
          };
        });

    return {
      adapterVersion: COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      mortgagePoints,
      assumptionsUsed: {
        currentBalance: mode.currentBalance,
        annualInterestRate: mode.annualInterestRate == null ? null : roundRate(mode.annualInterestRate),
        monthlyInterestRate: mode.monthlyInterestRate == null ? null : roundRate(mode.monthlyInterestRate),
        monthlyPayment: mode.monthlyPayment == null ? null : mode.monthlyPayment,
        remainingTermMonths: mode.remainingTermMonths,
        payoffPercent,
        projectionMode: mode.projectionMode
      },
      warnings,
      dataGaps,
      trace: {
        adapterVersion: COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION,
        projectionMode: mode.projectionMode,
        pointCount: mortgagePoints.length,
        displayHtmlUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.buildMortgageLifetimeProjection = buildMortgageLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_MORTGAGE_LIFETIME_PROJECTION_VERSION,
      buildMortgageLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
