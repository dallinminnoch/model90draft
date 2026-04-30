(function (globalScope) {
  const root = globalScope || {};
  const LensApp = root.LensApp || (root.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis debt treatment helper.
  // Purpose: calculate future treated debt values from canonical raw debtFacts
  // and Analysis Setup debt treatment assumptions.
  // Non-goals: no DOM access, no storage access, no model-builder wiring, no
  // method consumption, no debtPayoff mutation, and no Step 3 rendering.

  const CALCULATION_VERSION = 1;

  const MORTGAGE_TREATMENT_MODES = Object.freeze(["payoff", "support", "custom"]);
  const NON_MORTGAGE_TREATMENT_MODES = Object.freeze(["payoff", "exclude", "custom"]);
  const NON_MORTGAGE_TREATMENT_KEYS = Object.freeze([
    "autoLoans",
    "creditCardDebt",
    "studentLoans",
    "personalLoans",
    "taxLiabilities",
    "businessDebt",
    "otherRealEstateLoans",
    "otherLoanObligations"
  ]);

  const RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT = Object.freeze({
    include: true,
    mode: "payoff",
    payoffPercent: 100
  });

  const RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS = Object.freeze({
    enabled: false,
    globalTreatmentProfile: "balanced",
    mortgageTreatment: Object.freeze({
      include: true,
      mode: "payoff",
      payoffPercent: 100,
      paymentSupportYears: null
    }),
    nonMortgageDebtTreatment: Object.freeze({
      autoLoans: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      creditCardDebt: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      studentLoans: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      personalLoans: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      taxLiabilities: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      businessDebt: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      otherRealEstateLoans: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT,
      otherLoanObligations: RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT
    }),
    source: "debt-treatment-calculations-raw-equivalent-defaults"
  });

  const CATEGORY_TO_TREATMENT_KEY = Object.freeze({
    realEstateSecuredDebt: "otherRealEstateLoans",
    securedConsumerDebt: "autoLoans",
    unsecuredConsumerDebt: "creditCardDebt",
    educationDebt: "studentLoans",
    medicalDebt: "otherLoanObligations",
    taxLegalDebt: "taxLiabilities",
    businessDebt: "businessDebt",
    privatePersonalDebt: "otherLoanObligations",
    consumerFinanceDebt: "otherLoanObligations",
    otherDebt: "otherLoanObligations"
  });

  const SOURCE_TO_TREATMENT_KEY = Object.freeze({
    otherRealEstateLoans: "otherRealEstateLoans",
    otherRealEstateLoanBalance: "otherRealEstateLoans",
    autoLoans: "autoLoans",
    autoLoanBalance: "autoLoans",
    creditCardDebt: "creditCardDebt",
    creditCardBalance: "creditCardDebt",
    studentLoans: "studentLoans",
    studentLoanBalance: "studentLoans",
    personalLoans: "personalLoans",
    personalLoanBalance: "personalLoans",
    taxLiabilities: "taxLiabilities",
    outstandingTaxLiabilities: "taxLiabilities",
    businessDebt: "businessDebt",
    businessDebtBalance: "businessDebt",
    otherLoanObligations: "otherLoanObligations",
    otherDebtPayoffNeeds: "otherLoanObligations"
  });

  const DEBT_PAYOFF_COMPATIBILITY_FIELDS = Object.freeze([
    Object.freeze({
      key: "mortgageBalance",
      categoryKey: "realEstateSecuredDebt",
      label: "Primary Residence Mortgage",
      isHousingFieldOwned: true
    }),
    Object.freeze({
      key: "otherRealEstateLoanBalance",
      categoryKey: "realEstateSecuredDebt",
      label: "Other Real Estate Loans",
      treatmentKey: "otherRealEstateLoans"
    }),
    Object.freeze({
      key: "autoLoanBalance",
      categoryKey: "securedConsumerDebt",
      label: "Auto Loans",
      treatmentKey: "autoLoans"
    }),
    Object.freeze({
      key: "creditCardBalance",
      categoryKey: "unsecuredConsumerDebt",
      label: "Credit Card Debt",
      treatmentKey: "creditCardDebt"
    }),
    Object.freeze({
      key: "studentLoanBalance",
      categoryKey: "educationDebt",
      label: "Student Loans",
      treatmentKey: "studentLoans"
    }),
    Object.freeze({
      key: "personalLoanBalance",
      categoryKey: "unsecuredConsumerDebt",
      label: "Personal Loans",
      treatmentKey: "personalLoans"
    }),
    Object.freeze({
      key: "outstandingTaxLiabilities",
      categoryKey: "taxLegalDebt",
      label: "Tax Liabilities",
      treatmentKey: "taxLiabilities"
    }),
    Object.freeze({
      key: "businessDebtBalance",
      categoryKey: "businessDebt",
      label: "Business Debt",
      treatmentKey: "businessDebt"
    }),
    Object.freeze({
      key: "otherDebtPayoffNeeds",
      categoryKey: "otherDebt",
      label: "Other Debt",
      treatmentKey: "otherLoanObligations"
    })
  ]);

  const BLOCKED_EQUITY_KEYS = Object.freeze([
    "primaryResidenceEquity",
    "realEstateEquity"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function toTrimmedString(value) {
    return String(value == null ? "" : value).trim();
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

  function roundMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).reduce(function (next, key) {
        next[key] = clonePlainValue(value[key]);
        return next;
      }, {});
    }

    return value;
  }

  function createWarning(code, message, details) {
    return {
      code,
      message,
      severity: "warning",
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function pushWarning(warnings, code, message, details) {
    const warning = createWarning(code, message, details);
    warnings.push(warning);
    return warning;
  }

  function normalizeMode(value, allowedModes, fallback, warningKey, warnings) {
    const normalized = toTrimmedString(value);
    if (!normalized) {
      return fallback;
    }

    if (allowedModes.indexOf(normalized) !== -1) {
      return normalized;
    }

    pushWarning(
      warnings,
      "invalid-debt-treatment-mode",
      "Debt treatment mode was invalid; the raw-equivalent payoff mode was used.",
      { field: warningKey, received: value, fallback }
    );
    return fallback;
  }

  function normalizePayoffPercent(value, fallback, fieldName, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      if (value !== null && value !== undefined && value !== "") {
        pushWarning(
          warnings,
          "invalid-debt-payoff-percent",
          "Debt payoff percent was invalid; the raw-equivalent percent was used.",
          { field: fieldName, received: value, fallback }
        );
      }
      return fallback;
    }

    if (parsed < 0) {
      pushWarning(
        warnings,
        "debt-payoff-percent-clamped",
        "Debt payoff percent was below 0 and was clamped to 0.",
        { field: fieldName, received: parsed, clampedValue: 0 }
      );
      return 0;
    }

    if (parsed > 100) {
      pushWarning(
        warnings,
        "debt-payoff-percent-clamped",
        "Debt payoff percent was above 100 and was clamped to 100.",
        { field: fieldName, received: parsed, clampedValue: 100 }
      );
      return 100;
    }

    return parsed;
  }

  function normalizeOptionalNonNegativeNumber(value, fallback, fieldName, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      if (value !== null && value !== undefined && value !== "") {
        pushWarning(
          warnings,
          "invalid-debt-support-years",
          "Debt support years was invalid; the raw-equivalent value was used.",
          { field: fieldName, received: value, fallback }
        );
      }
      return fallback == null ? null : fallback;
    }

    if (parsed < 0) {
      pushWarning(
        warnings,
        "negative-debt-support-years",
        "Debt support years cannot be negative; the raw-equivalent value was used.",
        { field: fieldName, received: parsed, fallback }
      );
      return fallback == null ? null : fallback;
    }

    return parsed;
  }

  function normalizeNonMortgageTreatment(source, fallback, key, warnings) {
    const safeSource = isPlainObject(source) ? source : {};
    const safeFallback = isPlainObject(fallback) ? fallback : RAW_EQUIVALENT_NON_MORTGAGE_TREATMENT;
    return {
      include: typeof safeSource.include === "boolean"
        ? safeSource.include
        : safeFallback.include !== false,
      mode: normalizeMode(
        safeSource.mode,
        NON_MORTGAGE_TREATMENT_MODES,
        safeFallback.mode || "payoff",
        `${key}.mode`,
        warnings
      ),
      payoffPercent: normalizePayoffPercent(
        safeSource.payoffPercent,
        normalizePayoffPercent(safeFallback.payoffPercent, 100, `${key}.fallbackPayoffPercent`, warnings),
        `${key}.payoffPercent`,
        warnings
      )
    };
  }

  function normalizeDebtTreatmentAssumptionsInternal(source, warnings) {
    const safeSource = isPlainObject(source) ? source : {};
    const defaultAssumptions = RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS;
    const sourceMissing = !isPlainObject(source);
    const mortgageSource = isPlainObject(safeSource.mortgageTreatment) ? safeSource.mortgageTreatment : {};
    const mortgageDefault = defaultAssumptions.mortgageTreatment;
    const sourceNonMortgage = isPlainObject(safeSource.nonMortgageDebtTreatment)
      ? safeSource.nonMortgageDebtTreatment
      : {};

    if (sourceMissing) {
      pushWarning(
        warnings,
        "missing-debt-treatment-assumptions-defaulted",
        "Debt treatment assumptions were missing; raw-equivalent defaults were used.",
        { defaultSource: defaultAssumptions.source }
      );
    }

    const normalized = {
      enabled: typeof safeSource.enabled === "boolean" ? safeSource.enabled : defaultAssumptions.enabled,
      globalTreatmentProfile: toTrimmedString(safeSource.globalTreatmentProfile)
        || defaultAssumptions.globalTreatmentProfile,
      mortgageTreatment: {
        include: typeof mortgageSource.include === "boolean"
          ? mortgageSource.include
          : mortgageDefault.include,
        mode: normalizeMode(
          mortgageSource.mode,
          MORTGAGE_TREATMENT_MODES,
          mortgageDefault.mode,
          "mortgageTreatment.mode",
          warnings
        ),
        payoffPercent: normalizePayoffPercent(
          mortgageSource.payoffPercent,
          mortgageDefault.payoffPercent,
          "mortgageTreatment.payoffPercent",
          warnings
        ),
        paymentSupportYears: normalizeOptionalNonNegativeNumber(
          mortgageSource.paymentSupportYears,
          mortgageDefault.paymentSupportYears,
          "mortgageTreatment.paymentSupportYears",
          warnings
        )
      },
      nonMortgageDebtTreatment: {},
      source: toTrimmedString(safeSource.source) || defaultAssumptions.source
    };

    NON_MORTGAGE_TREATMENT_KEYS.forEach(function (key) {
      normalized.nonMortgageDebtTreatment[key] = normalizeNonMortgageTreatment(
        sourceNonMortgage[key],
        defaultAssumptions.nonMortgageDebtTreatment[key],
        key,
        warnings
      );
    });

    return {
      assumptions: normalized,
      defaulted: sourceMissing
    };
  }

  function normalizeDebtTreatmentAssumptions(source) {
    return normalizeDebtTreatmentAssumptionsInternal(source, []).assumptions;
  }

  function isRawEquivalentNonMortgageTreatment(treatment) {
    return treatment.include !== false
      && treatment.mode === "payoff"
      && treatment.payoffPercent === 100;
  }

  function isRawEquivalentAssumptions(assumptions) {
    const mortgage = assumptions.mortgageTreatment || {};
    if (mortgage.include === false || mortgage.mode !== "payoff" || mortgage.payoffPercent !== 100) {
      return false;
    }

    return NON_MORTGAGE_TREATMENT_KEYS.every(function (key) {
      return isRawEquivalentNonMortgageTreatment(assumptions.nonMortgageDebtTreatment[key]);
    });
  }

  function isBlockedEquityDebt(debt) {
    return BLOCKED_EQUITY_KEYS.some(function (blockedKey) {
      return debt.categoryKey === blockedKey
        || debt.typeKey === blockedKey
        || debt.sourceKey === blockedKey;
    });
  }

  function isProtectedPrimaryMortgageRecord(debt) {
    return debt.typeKey === "primaryResidenceMortgage"
      || debt.sourceKey === "primaryResidenceMortgage"
      || (debt.isHousingFieldOwned === true && debt.sourceKey !== "mortgageBalance");
  }

  function isPrimaryMortgageDebt(debt) {
    return debt.sourceKey === "mortgageBalance"
      || debt.typeKey === "mortgageBalance";
  }

  function normalizeDebtFact(debt, index, warnings) {
    const safeDebt = isPlainObject(debt) ? debt : {};
    const normalized = {
      debtFactId: toTrimmedString(safeDebt.debtFactId) || `debt_fact_${index}`,
      categoryKey: toTrimmedString(safeDebt.categoryKey),
      typeKey: toTrimmedString(safeDebt.typeKey),
      label: toTrimmedString(safeDebt.label) || `Debt ${index + 1}`,
      currentBalance: toOptionalNumber(safeDebt.currentBalance),
      minimumMonthlyPayment: toOptionalNumber(safeDebt.minimumMonthlyPayment),
      interestRatePercent: toOptionalNumber(safeDebt.interestRatePercent),
      remainingTermMonths: toOptionalNumber(safeDebt.remainingTermMonths),
      securedBy: toTrimmedString(safeDebt.securedBy) || null,
      sourceKey: toTrimmedString(safeDebt.sourceKey),
      source: toTrimmedString(safeDebt.source) || null,
      isHousingFieldOwned: safeDebt.isHousingFieldOwned === true,
      isScalarCompatibilityDebt: safeDebt.isScalarCompatibilityDebt === true,
      isRepeatableDebtRecord: safeDebt.isRepeatableDebtRecord === true,
      isCustomDebt: safeDebt.isCustomDebt === true,
      metadata: isPlainObject(safeDebt.metadata) ? clonePlainValue(safeDebt.metadata) : {}
    };

    if (isBlockedEquityDebt(normalized)) {
      pushWarning(
        warnings,
        "equity-debt-treatment-record-ignored",
        "Equity fields are not debt and were ignored by debt treatment calculations.",
        {
          index,
          debtFactId: normalized.debtFactId,
          categoryKey: normalized.categoryKey || null,
          typeKey: normalized.typeKey || null,
          sourceKey: normalized.sourceKey || null
        }
      );
      return null;
    }

    if (isProtectedPrimaryMortgageRecord(normalized)) {
      pushWarning(
        warnings,
        "protected-mortgage-debt-treatment-record-ignored",
        "Primary residence mortgage records are ignored unless they come from mortgageBalance.",
        {
          index,
          debtFactId: normalized.debtFactId,
          typeKey: normalized.typeKey || null,
          sourceKey: normalized.sourceKey || null
        }
      );
      return null;
    }

    if (normalized.currentBalance == null) {
      pushWarning(
        warnings,
        "missing-debt-treatment-balance",
        "Debt fact was missing a numeric currentBalance and was ignored.",
        { index, debtFactId: normalized.debtFactId }
      );
      return null;
    }

    if (normalized.currentBalance < 0) {
      pushWarning(
        warnings,
        "negative-debt-treatment-balance",
        "Debt fact had a negative currentBalance and was ignored.",
        { index, debtFactId: normalized.debtFactId, currentBalance: normalized.currentBalance }
      );
      return null;
    }

    normalized.currentBalance = roundMoney(normalized.currentBalance);
    return normalized;
  }

  function createDebtFactsFromDebtPayoff(debtPayoff, warnings) {
    const safeDebtPayoff = isPlainObject(debtPayoff) ? debtPayoff : {};
    const debts = [];

    DEBT_PAYOFF_COMPATIBILITY_FIELDS.forEach(function (field) {
      const rawValue = toOptionalNumber(safeDebtPayoff[field.key]);
      if (rawValue == null) {
        return;
      }

      if (rawValue < 0) {
        pushWarning(
          warnings,
          "negative-debt-payoff-compatibility-balance",
          "Debt payoff compatibility field was negative and was ignored.",
          { sourceKey: field.key, currentBalance: rawValue }
        );
        return;
      }

      debts.push({
        debtFactId: `debt_payoff_${field.key}`,
        categoryKey: field.categoryKey,
        typeKey: field.key,
        label: field.label,
        currentBalance: rawValue,
        minimumMonthlyPayment: null,
        interestRatePercent: null,
        remainingTermMonths: null,
        securedBy: null,
        sourceKey: field.key,
        source: "debtPayoff-compatibility",
        isHousingFieldOwned: field.isHousingFieldOwned === true,
        isScalarCompatibilityDebt: true,
        isRepeatableDebtRecord: false,
        isCustomDebt: false,
        metadata: {
          sourceType: "compatibility",
          recordSource: "debtPayoff"
        }
      });
    });

    return debts;
  }

  function getTreatmentKeyForDebt(debt) {
    if (isPrimaryMortgageDebt(debt)) {
      return "mortgage";
    }

    return SOURCE_TO_TREATMENT_KEY[debt.sourceKey]
      || SOURCE_TO_TREATMENT_KEY[debt.typeKey]
      || CATEGORY_TO_TREATMENT_KEY[debt.categoryKey]
      || "otherLoanObligations";
  }

  function calculateAppliedTreatment(debt, treatment, kind, warnings) {
    const rawBalance = roundMoney(debt.currentBalance);
    const include = treatment.include !== false;
    const mode = treatment.mode || "payoff";
    const result = {
      included: include,
      treatmentMode: mode,
      payoffPercent: treatment.payoffPercent,
      treatedAmount: 0,
      excludedAmount: 0,
      deferredAmount: 0,
      exclusionReason: null,
      warningCodes: []
    };

    if (!include) {
      result.excludedAmount = rawBalance;
      result.exclusionReason = "excluded-by-include-setting";
      return result;
    }

    if (kind === "non-mortgage" && mode === "exclude") {
      result.included = false;
      result.excludedAmount = rawBalance;
      result.exclusionReason = "excluded-by-mode";
      return result;
    }

    if ((kind === "mortgage" && (mode === "support" || mode === "custom"))
      || (kind === "non-mortgage" && mode === "custom")) {
      const warning = pushWarning(
        warnings,
        "debt-treatment-mode-deferred",
        "Debt treatment mode is saved but exact formula behavior is not defined yet; raw-equivalent payoff was used.",
        {
          debtFactId: debt.debtFactId,
          categoryKey: debt.categoryKey || null,
          typeKey: debt.typeKey || null,
          mode,
          kind
        }
      );
      result.warningCodes.push(warning.code);
      result.treatedAmount = rawBalance;
      result.deferredAmount = rawBalance;
      return result;
    }

    const payoffPercent = Number.isFinite(treatment.payoffPercent) ? treatment.payoffPercent : 100;
    result.treatedAmount = roundMoney(rawBalance * (payoffPercent / 100));
    result.excludedAmount = roundMoney(rawBalance - result.treatedAmount);
    return result;
  }

  function createDebtTraceRow(debt, treatmentKey, applied, isMortgage) {
    return {
      debtFactId: debt.debtFactId,
      categoryKey: debt.categoryKey || null,
      typeKey: debt.typeKey || null,
      label: debt.label,
      sourceKey: debt.sourceKey || null,
      source: debt.source || null,
      treatmentKey,
      treatmentMode: applied.treatmentMode,
      isMortgage,
      rawBalance: debt.currentBalance,
      included: applied.included,
      payoffPercent: applied.payoffPercent,
      treatedAmount: roundMoney(applied.treatedAmount),
      excludedAmount: roundMoney(applied.excludedAmount),
      deferredAmount: roundMoney(applied.deferredAmount),
      exclusionReason: applied.exclusionReason,
      warningCodes: applied.warningCodes.slice()
    };
  }

  function getDebtPayoffManualOverrideMetadata(debtPayoff, debtFacts) {
    const debtFactsMetadata = isPlainObject(debtFacts?.metadata) ? debtFacts.metadata : {};
    const safeDebtPayoff = isPlainObject(debtPayoff) ? debtPayoff : {};
    const manualOverride = debtFactsMetadata.manualTotalDebtPayoffOverride === true
      || safeDebtPayoff.totalDebtPayoffNeedManualOverride === true;

    return {
      manualTotalDebtPayoffOverride: manualOverride,
      manualTotalDebtPayoffNeed: manualOverride
        ? (
            toOptionalNumber(debtFactsMetadata.manualTotalDebtPayoffNeed) != null
              ? toOptionalNumber(debtFactsMetadata.manualTotalDebtPayoffNeed)
              : toOptionalNumber(safeDebtPayoff.totalDebtPayoffNeed)
          )
        : null,
      manualOverrideSource: manualOverride
        ? (debtFactsMetadata.manualOverrideSource || "debtPayoff.totalDebtPayoffNeed")
        : null
    };
  }

  function calculateDebtTreatment(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const normalizedAssumptionsResult = normalizeDebtTreatmentAssumptionsInternal(
      safeInput.debtTreatmentAssumptions,
      warnings
    );
    const assumptions = normalizedAssumptionsResult.assumptions;
    const sourceDebtFacts = isPlainObject(safeInput.debtFacts) && Array.isArray(safeInput.debtFacts.debts)
      ? safeInput.debtFacts.debts
      : [];
    const fallbackDebts = !sourceDebtFacts.length
      ? createDebtFactsFromDebtPayoff(safeInput.debtPayoff, warnings)
      : [];
    const source = sourceDebtFacts.length ? "debtFacts" : "debtPayoff-compatibility";
    const sourceDebts = sourceDebtFacts.length ? sourceDebtFacts : fallbackDebts;
    let primaryMortgageSeen = false;
    const debts = [];
    const trace = [];

    sourceDebts.forEach(function (sourceDebt, index) {
      const normalizedDebt = normalizeDebtFact(sourceDebt, index, warnings);
      if (!normalizedDebt) {
        return;
      }

      const isMortgage = isPrimaryMortgageDebt(normalizedDebt);
      if (isMortgage && primaryMortgageSeen) {
        pushWarning(
          warnings,
          "duplicate-primary-mortgage-ignored",
          "Additional primary residence mortgage debt facts were ignored so mortgageBalance is not double-counted.",
          { debtFactId: normalizedDebt.debtFactId, sourceKey: normalizedDebt.sourceKey || null }
        );
        return;
      }

      if (isMortgage) {
        primaryMortgageSeen = true;
      }

      const treatmentKey = getTreatmentKeyForDebt(normalizedDebt);
      const treatment = isMortgage
        ? assumptions.mortgageTreatment
        : assumptions.nonMortgageDebtTreatment[treatmentKey]
          || assumptions.nonMortgageDebtTreatment.otherLoanObligations;
      const applied = calculateAppliedTreatment(
        normalizedDebt,
        treatment,
        isMortgage ? "mortgage" : "non-mortgage",
        warnings
      );
      const traceRow = createDebtTraceRow(normalizedDebt, treatmentKey, applied, isMortgage);
      debts.push(traceRow);
      trace.push(traceRow);
    });

    const totals = debts.reduce(function (summary, debt) {
      summary.rawDebtAmount += debt.rawBalance;
      summary.treatedDebtAmount += debt.treatedAmount;
      summary.excludedDebtAmount += debt.excludedAmount;
      summary.deferredDebtAmount += debt.deferredAmount;

      if (debt.isMortgage) {
        summary.rawMortgageAmount += debt.rawBalance;
        summary.treatedMortgageAmount += debt.treatedAmount;
        return summary;
      }

      summary.rawNonMortgageDebtAmount += debt.rawBalance;
      summary.treatedNonMortgageDebtAmount += debt.treatedAmount;
      return summary;
    }, {
      rawDebtAmount: 0,
      rawMortgageAmount: 0,
      rawNonMortgageDebtAmount: 0,
      treatedDebtAmount: 0,
      treatedMortgageAmount: 0,
      treatedNonMortgageDebtAmount: 0,
      excludedDebtAmount: 0,
      deferredDebtAmount: 0
    });
    const manualOverrideMetadata = getDebtPayoffManualOverrideMetadata(safeInput.debtPayoff, safeInput.debtFacts);
    const rawEquivalentDefault = isRawEquivalentAssumptions(assumptions);

    return {
      rawEquivalentDefault,
      treatmentApplied: assumptions.enabled === true,
      source,
      fallbackSource: source === "debtFacts" && isPlainObject(safeInput.debtPayoff)
        ? "debtPayoff-compatibility"
        : null,
      dime: {
        nonMortgageDebtAmount: roundMoney(totals.treatedNonMortgageDebtAmount),
        mortgageAmount: roundMoney(totals.treatedMortgageAmount),
        totalDebtAndMortgageAmount: roundMoney(totals.treatedNonMortgageDebtAmount + totals.treatedMortgageAmount)
      },
      needs: {
        debtPayoffAmount: roundMoney(totals.treatedDebtAmount),
        mortgagePayoffAmount: roundMoney(totals.treatedMortgageAmount),
        nonMortgageDebtAmount: roundMoney(totals.treatedNonMortgageDebtAmount)
      },
      rawTotals: {
        totalDebtBalance: roundMoney(totals.rawDebtAmount),
        mortgageBalance: roundMoney(totals.rawMortgageAmount),
        nonMortgageDebtBalance: roundMoney(totals.rawNonMortgageDebtAmount),
        excludedDebtAmount: roundMoney(totals.excludedDebtAmount),
        deferredDebtAmount: roundMoney(totals.deferredDebtAmount)
      },
      excludedDebtAmount: roundMoney(totals.excludedDebtAmount),
      deferredDebtAmount: roundMoney(totals.deferredDebtAmount),
      debts,
      warnings,
      trace: {
        debts: trace,
        rawEquivalentDefault,
        treatmentApplied: assumptions.enabled === true,
        source,
        fallbackSource: source === "debtFacts" && isPlainObject(safeInput.debtPayoff)
          ? "debtPayoff-compatibility"
          : null,
        manualTotalDebtPayoffOverride: manualOverrideMetadata.manualTotalDebtPayoffOverride
      },
      metadata: {
        source: "debt-treatment-calculations",
        calculationVersion: CALCULATION_VERSION,
        assumptionsSource: assumptions.source,
        assumptionsDefaulted: normalizedAssumptionsResult.defaulted,
        assumptionsEnabled: assumptions.enabled === true,
        manualTotalDebtPayoffOverride: manualOverrideMetadata.manualTotalDebtPayoffOverride,
        manualTotalDebtPayoffNeed: manualOverrideMetadata.manualTotalDebtPayoffNeed,
        manualOverrideSource: manualOverrideMetadata.manualOverrideSource,
        debtFactCount: sourceDebtFacts.length,
        treatedDebtCount: debts.length,
        warnings
      }
    };
  }

  lensAnalysis.RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS = RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS;
  lensAnalysis.normalizeDebtTreatmentAssumptions = normalizeDebtTreatmentAssumptions;
  lensAnalysis.calculateDebtTreatment = calculateDebtTreatment;
})(typeof window !== "undefined" ? window : globalThis);
