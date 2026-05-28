(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis debt amortization helpers.
  // Purpose: calculate traceable payoff terms from debt balance, payment, rate,
  // and payment frequency facts.
  // Non-goals: no DOM, storage, rendering, treatment assumptions, method formulas,
  // coverage strategy layout, or debt record persistence.

  const DEFAULT_MAX_MONTHS = 600;
  const MIN_RATE = 0;

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
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function normalizeAnnualRate(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      return {
        annualRate: null,
        monthlyRate: null,
        sourceValue: value
      };
    }
    if (parsed < MIN_RATE) {
      addIssue(
        warnings,
        "debt-payoff-term-rate-invalid",
        "Debt payoff term calculation ignored a negative interest rate.",
        { received: parsed }
      );
      return {
        annualRate: null,
        monthlyRate: null,
        sourceValue: parsed
      };
    }

    const annualRate = parsed > 1 ? parsed / 100 : parsed;
    return {
      annualRate,
      monthlyRate: annualRate / 12,
      sourceValue: parsed
    };
  }

  function normalizePaymentFrequency(value, warnings) {
    const normalized = normalizeString(value)
      .replace(/[\s_-]+/g, "")
      .toLowerCase();
    const frequencyMap = {
      monthly: { key: "monthly", monthlyMultiplier: 1 },
      annual: { key: "annual", monthlyMultiplier: 1 / 12 },
      annually: { key: "annual", monthlyMultiplier: 1 / 12 },
      yearly: { key: "annual", monthlyMultiplier: 1 / 12 },
      weekly: { key: "weekly", monthlyMultiplier: 52 / 12 },
      biweekly: { key: "biweekly", monthlyMultiplier: 26 / 12 },
      everytwoweeks: { key: "biweekly", monthlyMultiplier: 26 / 12 },
      semimonthly: { key: "semiMonthly", monthlyMultiplier: 2 },
      twiceamonth: { key: "semiMonthly", monthlyMultiplier: 2 },
      twicepermonth: { key: "semiMonthly", monthlyMultiplier: 2 },
      semiannual: { key: "semiAnnual", monthlyMultiplier: 1 / 6 },
      semiannually: { key: "semiAnnual", monthlyMultiplier: 1 / 6 },
      quarterly: { key: "quarterly", monthlyMultiplier: 1 / 3 }
    };
    if (frequencyMap[normalized]) {
      return frequencyMap[normalized];
    }
    addIssue(
      warnings,
      "debt-payoff-term-payment-frequency-unrecognized",
      "Debt payoff term calculation assumed monthly frequency because payment frequency was unrecognized.",
      { paymentFrequency: value ?? null }
    );
    return {
      key: "monthly",
      monthlyMultiplier: 1,
      defaulted: true
    };
  }

  function projectBalanceAfterMonths(balance, monthlyPayment, monthlyRate, months) {
    const safeBalance = Math.max(0, Number(balance) || 0);
    const safePayment = Math.max(0, Number(monthlyPayment) || 0);
    const safeMonths = Math.max(0, Math.round(Number(months) || 0));
    const safeRate = Math.max(0, Number(monthlyRate) || 0);
    if (safeBalance <= 0 || safeMonths <= 0) {
      return roundMoney(safeBalance);
    }
    if (safePayment <= 0) {
      return roundMoney(safeBalance);
    }

    let balanceRemaining = safeBalance;
    for (let month = 0; month < safeMonths; month += 1) {
      if (balanceRemaining <= 0) {
        return 0;
      }
      balanceRemaining = safeRate > 0
        ? balanceRemaining * (1 + safeRate) - safePayment
        : balanceRemaining - safePayment;
      if (!Number.isFinite(balanceRemaining)) {
        return null;
      }
    }
    return roundMoney(Math.max(0, balanceRemaining));
  }

  function calculateAmortizedPayoffMonths(balance, monthlyPayment, monthlyRate) {
    if (monthlyRate <= 0) {
      return Math.ceil(balance / monthlyPayment);
    }
    if (monthlyPayment <= balance * monthlyRate) {
      return null;
    }
    const months = -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate);
    return Number.isFinite(months) && months > 0 ? Math.ceil(months) : null;
  }

  function calculateDebtPayoffTerm(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const currentBalance = toOptionalNumber(safeInput.currentBalance ?? safeInput.balance);
    const paymentAmount = toOptionalNumber(safeInput.paymentAmount ?? safeInput.minimumPaymentAmount);
    const enteredRemainingTermMonths = toOptionalNumber(
      safeInput.enteredRemainingTermMonths
      ?? safeInput.userEnteredRemainingTermMonths
      ?? safeInput.remainingTermMonths
    );
    const maxMonths = Math.max(1, Math.round(toOptionalNumber(safeInput.maxMonths) || DEFAULT_MAX_MONTHS));
    const frequency = normalizePaymentFrequency(safeInput.paymentFrequency || "monthly", warnings);
    const rate = normalizeAnnualRate(safeInput.interestRatePercent ?? safeInput.annualInterestRate, warnings);
    const monthlyPayment = paymentAmount == null ? null : roundMoney(paymentAmount * frequency.monthlyMultiplier);
    const baseResult = {
      calculatedPayoffMonths: null,
      projectedBalanceAtUserTerm: null,
      monthlyPaymentUsed: monthlyPayment,
      monthlyRateUsed: rate.monthlyRate == null ? null : roundRate(rate.monthlyRate),
      annualRateUsed: rate.annualRate == null ? null : roundRate(rate.annualRate),
      calculationMode: "unavailable",
      warnings,
      dataGaps,
      trace: {
        currentBalance: currentBalance == null ? null : roundMoney(currentBalance),
        paymentAmount: paymentAmount == null ? null : roundMoney(paymentAmount),
        paymentFrequency: frequency.key,
        paymentFrequencyMultiplier: frequency.monthlyMultiplier,
        interestRateInput: rate.sourceValue ?? null,
        enteredRemainingTermMonths: enteredRemainingTermMonths == null ? null : Math.ceil(enteredRemainingTermMonths),
        maxMonths
      }
    };

    if (currentBalance == null) {
      addIssue(dataGaps, "debt-payoff-term-balance-missing", "Debt payoff term requires a numeric balance.", {
        received: safeInput.currentBalance ?? safeInput.balance ?? null
      });
      return baseResult;
    }

    if (currentBalance <= 0) {
      return Object.assign({}, baseResult, {
        calculatedPayoffMonths: 0,
        projectedBalanceAtUserTerm: 0,
        calculationMode: "zeroBalance",
        trace: Object.assign({}, baseResult.trace, { currentBalance: 0 })
      });
    }

    if (monthlyPayment == null || monthlyPayment <= 0) {
      addIssue(dataGaps, "debt-payoff-term-payment-missing", "Debt payoff term requires a positive payment amount.", {
        received: safeInput.paymentAmount ?? safeInput.minimumPaymentAmount ?? null
      });
      return baseResult;
    }

    if (rate.annualRate == null) {
      const months = Math.ceil(currentBalance / monthlyPayment);
      if (enteredRemainingTermMonths != null) {
        baseResult.projectedBalanceAtUserTerm = projectBalanceAfterMonths(
          currentBalance,
          monthlyPayment,
          0,
          enteredRemainingTermMonths
        );
      }
      addIssue(
        warnings,
        "debt-payoff-term-rate-missing-straight-line",
        "Debt payoff term used a straight-line estimate because interest rate was missing.",
        { currentBalance, monthlyPayment }
      );
      return Object.assign({}, baseResult, {
        calculatedPayoffMonths: months > maxMonths ? null : months,
        calculationMode: months > maxMonths ? "notPaidWithinMaxMonths" : "straightLineNoRate"
      });
    }

    if (monthlyPayment <= currentBalance * rate.monthlyRate) {
      addIssue(
        warnings,
        "debt-payoff-term-negative-amortization",
        "Debt payment does not cover first-month interest; no calculated payoff term was created.",
        { currentBalance, monthlyPayment, monthlyInterestAmount: roundMoney(currentBalance * rate.monthlyRate) }
      );
      if (enteredRemainingTermMonths != null) {
        baseResult.projectedBalanceAtUserTerm = projectBalanceAfterMonths(
          currentBalance,
          monthlyPayment,
          rate.monthlyRate,
          enteredRemainingTermMonths
        );
      }
      return Object.assign({}, baseResult, {
        calculationMode: "negativeAmortization"
      });
    }

    const payoffMonths = calculateAmortizedPayoffMonths(currentBalance, monthlyPayment, rate.monthlyRate);
    if (enteredRemainingTermMonths != null) {
      baseResult.projectedBalanceAtUserTerm = projectBalanceAfterMonths(
        currentBalance,
        monthlyPayment,
        rate.monthlyRate,
        enteredRemainingTermMonths
      );
    }
    if (payoffMonths == null || payoffMonths > maxMonths) {
      addIssue(
        warnings,
        "debt-payoff-term-not-paid-within-max-months",
        "Debt payoff term exceeded the supported projection cap.",
        { currentBalance, monthlyPayment, maxMonths }
      );
      return Object.assign({}, baseResult, {
        calculatedPayoffMonths: null,
        calculationMode: "notPaidWithinMaxMonths"
      });
    }

    return Object.assign({}, baseResult, {
      calculatedPayoffMonths: payoffMonths,
      calculationMode: "amortized"
    });
  }

  lensAnalysis.calculateDebtPayoffTerm = calculateDebtPayoffTerm;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      calculateDebtPayoffTerm
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
