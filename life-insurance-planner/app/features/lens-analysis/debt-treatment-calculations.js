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

  const MORTGAGE_TREATMENT_MODES = Object.freeze(["payoff", "support"]);
  const NON_MORTGAGE_TREATMENT_MODES = Object.freeze(["payoff", "exclude", "custom"]);
  const DEBT_CATEGORY_TREATMENT_KEYS = Object.freeze([
    "realEstateSecuredDebt",
    "securedConsumerDebt",
    "unsecuredConsumerDebt",
    "educationDebt",
    "medicalDebt",
    "taxLegalDebt",
    "businessDebt",
    "privatePersonalDebt",
    "consumerFinanceDebt",
    "otherDebt"
  ]);
  const RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT = Object.freeze({
    include: true,
    mode: "payoff",
    payoffPercent: 100
  });

  const RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT_MAP = Object.freeze({
    realEstateSecuredDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    securedConsumerDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    unsecuredConsumerDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    educationDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    medicalDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    taxLegalDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    businessDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    privatePersonalDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    consumerFinanceDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    otherDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT
  });

  const RAW_EQUIVALENT_LEGACY_NON_MORTGAGE_TREATMENT_MAP = Object.freeze({
    autoLoans: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    creditCardDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    studentLoans: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    personalLoans: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    taxLiabilities: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    businessDebt: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    otherRealEstateLoans: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT,
    otherLoanObligations: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT
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
    debtCategoryTreatment: RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT_MAP,
    nonMortgageDebtTreatment: RAW_EQUIVALENT_LEGACY_NON_MORTGAGE_TREATMENT_MAP,
    source: "debt-treatment-calculations-raw-equivalent-defaults"
  });

  const LEGACY_TREATMENT_KEYS_BY_CATEGORY = Object.freeze({
    realEstateSecuredDebt: Object.freeze(["otherRealEstateLoans"]),
    securedConsumerDebt: Object.freeze(["autoLoans"]),
    unsecuredConsumerDebt: Object.freeze(["creditCardDebt", "personalLoans"]),
    educationDebt: Object.freeze(["studentLoans"]),
    medicalDebt: Object.freeze([]),
    taxLegalDebt: Object.freeze(["taxLiabilities"]),
    businessDebt: Object.freeze(["businessDebt"]),
    privatePersonalDebt: Object.freeze([]),
    consumerFinanceDebt: Object.freeze([]),
    otherDebt: Object.freeze(["otherLoanObligations"])
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

  function normalizeMortgageTreatmentMode(value, fallback, warnings) {
    const normalized = toTrimmedString(value);
    if (!normalized) {
      return fallback;
    }

    if (normalized === "custom") {
      pushWarning(
        warnings,
        "mortgage-custom-mode-deprecated-defaulted-to-payoff",
        "Mortgage custom mode is deprecated until a precise formula exists; payoff mode was used.",
        { field: "mortgageTreatment.mode", received: value, fallback: "payoff" }
      );
      return "payoff";
    }

    return normalizeMode(
      normalized,
      MORTGAGE_TREATMENT_MODES,
      fallback,
      "mortgageTreatment.mode",
      warnings
    );
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
    const safeFallback = isPlainObject(fallback) ? fallback : RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT;
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

  function areDebtCategoryTreatmentsEquivalent(left, right) {
    return Boolean(left && right)
      && left.include === right.include
      && left.mode === right.mode
      && left.payoffPercent === right.payoffPercent;
  }

  function getRawEquivalentCategoryTreatment(categoryKey) {
    return RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT_MAP[categoryKey]
      || RAW_EQUIVALENT_DEBT_CATEGORY_TREATMENT;
  }

  function resolveLegacyCategoryTreatment(categoryKey, sourceNonMortgage, warnings) {
    const legacyKeys = LEGACY_TREATMENT_KEYS_BY_CATEGORY[categoryKey] || [];
    const presentLegacyKeys = legacyKeys.filter(function (legacyKey) {
      return isPlainObject(sourceNonMortgage[legacyKey]);
    });

    if (!presentLegacyKeys.length) {
      return null;
    }

    const defaultTreatment = getRawEquivalentCategoryTreatment(categoryKey);
    const migratedTreatments = presentLegacyKeys.map(function (legacyKey) {
      return {
        legacyKey,
        treatment: normalizeNonMortgageTreatment(
          sourceNonMortgage[legacyKey],
          defaultTreatment,
          legacyKey,
          warnings
        )
      };
    });
    const firstTreatment = migratedTreatments[0].treatment;
    const hasConflict = migratedTreatments.some(function (candidate) {
      return !areDebtCategoryTreatmentsEquivalent(candidate.treatment, firstTreatment);
    });

    if (hasConflict) {
      pushWarning(
        warnings,
        "legacy-debt-category-treatment-conflict-defaulted",
        "Multiple legacy scalar debt treatment keys map to one broad debt category and conflicted; the raw-equivalent category default was used.",
        {
          categoryKey,
          legacyKeys: presentLegacyKeys.slice(),
          defaultTreatment
        }
      );
      return {
        treatment: defaultTreatment,
        source: "raw-equivalent-default",
        conflict: true,
        legacyKeys: presentLegacyKeys.slice()
      };
    }

    pushWarning(
      warnings,
      "legacy-debt-category-treatment-migrated",
      "Legacy scalar debt treatment was interpreted as broad debt category treatment for compatibility.",
      {
        categoryKey,
        legacyKeys: presentLegacyKeys.slice()
      }
    );
    return {
      treatment: firstTreatment,
      source: "legacy-nonMortgageDebtTreatment",
      conflict: false,
      legacyKeys: presentLegacyKeys.slice()
    };
  }

  function normalizeDebtTreatmentAssumptionsInternal(source, warnings) {
    const safeSource = isPlainObject(source) ? source : {};
    const defaultAssumptions = RAW_EQUIVALENT_DEBT_TREATMENT_ASSUMPTIONS;
    const sourceMissing = !isPlainObject(source);
    const mortgageSource = isPlainObject(safeSource.mortgageTreatment) ? safeSource.mortgageTreatment : {};
    const mortgageDefault = defaultAssumptions.mortgageTreatment;
    const sourceCategoryTreatment = isPlainObject(safeSource.debtCategoryTreatment)
      ? safeSource.debtCategoryTreatment
      : {};
    const hasPrimaryCategoryTreatmentSource = isPlainObject(safeSource.debtCategoryTreatment);
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
        mode: normalizeMortgageTreatmentMode(
          mortgageSource.mode,
          mortgageDefault.mode,
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
      debtCategoryTreatment: {},
      nonMortgageDebtTreatment: isPlainObject(safeSource.nonMortgageDebtTreatment)
        ? clonePlainValue(safeSource.nonMortgageDebtTreatment)
        : {},
      categoryTreatmentSources: {},
      defaultedDebtCategoryKeys: [],
      legacyCompatibility: {
        used: false,
        migratedCategoryKeys: [],
        conflictCategoryKeys: []
      },
      source: toTrimmedString(safeSource.source) || defaultAssumptions.source
    };

    DEBT_CATEGORY_TREATMENT_KEYS.forEach(function (categoryKey) {
      const defaultTreatment = getRawEquivalentCategoryTreatment(categoryKey);

      if (hasPrimaryCategoryTreatmentSource && isPlainObject(sourceCategoryTreatment[categoryKey])) {
        normalized.debtCategoryTreatment[categoryKey] = normalizeNonMortgageTreatment(
          sourceCategoryTreatment[categoryKey],
          defaultTreatment,
          categoryKey,
          warnings
        );
        normalized.categoryTreatmentSources[categoryKey] = "debtCategoryTreatment";
        return;
      }

      if (hasPrimaryCategoryTreatmentSource) {
        normalized.debtCategoryTreatment[categoryKey] = defaultTreatment;
        normalized.categoryTreatmentSources[categoryKey] = "raw-equivalent-default";
        normalized.defaultedDebtCategoryKeys.push(categoryKey);
        pushWarning(
          warnings,
          "missing-debt-category-treatment-defaulted",
          "Debt category treatment was missing; the raw-equivalent default was used.",
          { categoryKey }
        );
        return;
      }

      const legacyTreatment = resolveLegacyCategoryTreatment(categoryKey, sourceNonMortgage, warnings);
      if (legacyTreatment) {
        normalized.debtCategoryTreatment[categoryKey] = legacyTreatment.treatment;
        normalized.categoryTreatmentSources[categoryKey] = legacyTreatment.source;
        normalized.legacyCompatibility.used = normalized.legacyCompatibility.used || legacyTreatment.source === "legacy-nonMortgageDebtTreatment";
        if (legacyTreatment.conflict) {
          normalized.legacyCompatibility.conflictCategoryKeys.push(categoryKey);
        } else {
          normalized.legacyCompatibility.migratedCategoryKeys.push(categoryKey);
        }
        return;
      }

      normalized.debtCategoryTreatment[categoryKey] = defaultTreatment;
      normalized.categoryTreatmentSources[categoryKey] = "raw-equivalent-default";
      normalized.defaultedDebtCategoryKeys.push(categoryKey);
      pushWarning(
        warnings,
        "missing-debt-category-treatment-defaulted",
        "Debt category treatment was missing; the raw-equivalent default was used.",
        { categoryKey }
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

  function isRawEquivalentCategoryTreatment(treatment) {
    return treatment.include !== false
      && treatment.mode === "payoff"
      && treatment.payoffPercent === 100;
  }

  function isRawEquivalentAssumptions(assumptions) {
    const mortgage = assumptions.mortgageTreatment || {};
    if (mortgage.include === false || mortgage.mode !== "payoff" || mortgage.payoffPercent !== 100) {
      return false;
    }

    return DEBT_CATEGORY_TREATMENT_KEYS.every(function (categoryKey) {
      return isRawEquivalentCategoryTreatment(assumptions.debtCategoryTreatment[categoryKey]);
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

  function getTreatmentKeyForDebt(debt, warnings) {
    if (isPrimaryMortgageDebt(debt)) {
      return "mortgage";
    }

    if (DEBT_CATEGORY_TREATMENT_KEYS.indexOf(debt.categoryKey) !== -1) {
      return debt.categoryKey;
    }

    pushWarning(
      warnings,
      "invalid-debt-category-treatment-key-defaulted",
      "Debt fact categoryKey was missing or unknown; otherDebt treatment was used.",
      {
        debtFactId: debt.debtFactId,
        categoryKey: debt.categoryKey || null,
        sourceKey: debt.sourceKey || null,
        typeKey: debt.typeKey || null
      }
    );
    return "otherDebt";
  }

  function getMortgageSupportFieldValue(source, fieldNames) {
    const safeSource = isPlainObject(source) ? source : {};
    const names = Array.isArray(fieldNames) ? fieldNames : [];
    for (let index = 0; index < names.length; index += 1) {
      const fieldName = names[index];
      if (Object.prototype.hasOwnProperty.call(safeSource, fieldName)) {
        return safeSource[fieldName];
      }
    }
    return null;
  }

  function normalizeMortgageSupportFacts(source) {
    const safeSource = isPlainObject(source) ? source : {};
    return {
      monthlyMortgagePayment: toOptionalNumber(safeSource.monthlyMortgagePayment),
      monthlyMortgagePaymentSourcePath: toTrimmedString(safeSource.monthlyMortgagePaymentSourcePath) || null,
      remainingTermMonths: toOptionalNumber(getMortgageSupportFieldValue(safeSource, [
        "remainingTermMonths",
        "mortgageRemainingTermMonths"
      ])),
      remainingTermMonthsSourcePath: toTrimmedString(getMortgageSupportFieldValue(safeSource, [
        "remainingTermMonthsSourcePath",
        "mortgageRemainingTermMonthsSourcePath"
      ])) || null
    };
  }

  function createMortgageSupportTrace(fields) {
    const safeFields = isPlainObject(fields) ? fields : {};
    return {
      mortgageTreatmentMode: "support",
      monthlyMortgagePaymentUsed: safeFields.monthlyMortgagePaymentUsed ?? null,
      monthlyMortgagePaymentSourcePath: safeFields.monthlyMortgagePaymentSourcePath || null,
      supportYearsRequested: safeFields.supportYearsRequested ?? null,
      supportMonthsRequested: safeFields.supportMonthsRequested ?? null,
      supportMonthsUsed: safeFields.supportMonthsUsed ?? null,
      remainingTermMonths: safeFields.remainingTermMonths ?? null,
      remainingTermMonthsSourcePath: safeFields.remainingTermMonthsSourcePath || null,
      remainingTermCapApplied: safeFields.remainingTermCapApplied === true,
      noCapReason: safeFields.noCapReason || null,
      noInflationApplied: true,
      noDiscountingApplied: true,
      mortgageSupportAmount: safeFields.mortgageSupportAmount ?? null,
      fallbackReason: safeFields.fallbackReason || null
    };
  }

  function applyMortgageSupportFallback(result, rawBalance, warnings, code, message, details, traceFields) {
    const warning = pushWarning(warnings, code, message, details);
    result.warningCodes.push(warning.code);
    result.treatedAmount = rawBalance;
    result.excludedAmount = 0;
    result.mortgageSupportTrace = createMortgageSupportTrace({
      ...traceFields,
      mortgageSupportAmount: null,
      fallbackReason: code
    });
    return result;
  }

  function applyMortgageSupportTreatment(result, debt, treatment, warnings, mortgageSupportFacts) {
    const rawBalance = roundMoney(debt.currentBalance);
    const supportYears = toOptionalNumber(treatment.paymentSupportYears);
    const supportMonthsRequested = supportYears == null ? null : supportYears * 12;
    const monthlyMortgagePayment = toOptionalNumber(mortgageSupportFacts.monthlyMortgagePayment);
    const remainingTermMonths = toOptionalNumber(mortgageSupportFacts.remainingTermMonths);
    const hasReliableRemainingTerm = remainingTermMonths != null && remainingTermMonths > 0;
    const baseTraceFields = {
      monthlyMortgagePaymentUsed: monthlyMortgagePayment != null && monthlyMortgagePayment >= 0
        ? monthlyMortgagePayment
        : null,
      monthlyMortgagePaymentSourcePath: mortgageSupportFacts.monthlyMortgagePaymentSourcePath,
      supportYearsRequested: supportYears,
      supportMonthsRequested,
      supportMonthsUsed: null,
      remainingTermMonths,
      remainingTermMonthsSourcePath: mortgageSupportFacts.remainingTermMonthsSourcePath,
      remainingTermCapApplied: false,
      noCapReason: hasReliableRemainingTerm ? null : "remaining-term-missing-or-invalid"
    };

    if (monthlyMortgagePayment == null || monthlyMortgagePayment < 0) {
      return applyMortgageSupportFallback(
        result,
        rawBalance,
        warnings,
        "mortgage-support-payment-unavailable-defaulted-to-payoff",
        "Mortgage support mode requires a valid monthly mortgage payment; payoff mode was used.",
        {
          debtFactId: debt.debtFactId,
          sourcePath: mortgageSupportFacts.monthlyMortgagePaymentSourcePath || null,
          received: mortgageSupportFacts.monthlyMortgagePayment
        },
        baseTraceFields
      );
    }

    if (supportYears == null || supportYears <= 0) {
      return applyMortgageSupportFallback(
        result,
        rawBalance,
        warnings,
        "mortgage-support-years-unavailable-defaulted-to-payoff",
        "Mortgage support mode requires positive support years; payoff mode was used.",
        {
          debtFactId: debt.debtFactId,
          field: "mortgageTreatment.paymentSupportYears",
          received: treatment.paymentSupportYears
        },
        baseTraceFields
      );
    }

    const supportMonthsUsed = hasReliableRemainingTerm
      ? Math.min(supportMonthsRequested, remainingTermMonths)
      : supportMonthsRequested;
    const remainingTermCapApplied = hasReliableRemainingTerm && remainingTermMonths < supportMonthsRequested;
    const noCapReason = remainingTermCapApplied
      ? null
      : (
          hasReliableRemainingTerm
            ? "remaining-term-not-shorter-than-support-period"
            : "remaining-term-missing-or-invalid"
        );
    const mortgageSupportAmount = roundMoney(monthlyMortgagePayment * supportMonthsUsed);

    result.treatedAmount = mortgageSupportAmount;
    result.excludedAmount = roundMoney(rawBalance - mortgageSupportAmount);
    result.mortgageSupportTrace = createMortgageSupportTrace({
      ...baseTraceFields,
      supportMonthsUsed,
      remainingTermCapApplied,
      noCapReason,
      mortgageSupportAmount
    });
    return result;
  }

  function calculateAppliedTreatment(debt, treatment, kind, warnings, context) {
    const rawBalance = roundMoney(debt.currentBalance);
    const include = treatment.include !== false;
    const mode = treatment.mode || "payoff";
    const safeContext = isPlainObject(context) ? context : {};
    const mortgageSupportFacts = isPlainObject(safeContext.mortgageSupportFacts)
      ? safeContext.mortgageSupportFacts
      : {};
    const result = {
      included: include,
      treatmentMode: mode,
      payoffPercent: treatment.payoffPercent,
      treatedAmount: 0,
      excludedAmount: 0,
      deferredAmount: 0,
      exclusionReason: null,
      warningCodes: [],
      mortgageSupportTrace: null
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

    if (kind === "mortgage" && mode === "support") {
      return applyMortgageSupportTreatment(result, debt, treatment, warnings, mortgageSupportFacts);
    }

    if (kind === "non-mortgage" && mode === "custom") {
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
    const traceRow = {
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

    if (isPlainObject(applied.mortgageSupportTrace)) {
      Object.assign(traceRow, clonePlainValue(applied.mortgageSupportTrace));
    }

    return traceRow;
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
    const mortgageSupportFacts = normalizeMortgageSupportFacts(safeInput.mortgageSupportFacts);
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

      const treatmentKey = getTreatmentKeyForDebt(normalizedDebt, warnings);
      const treatment = isMortgage
        ? assumptions.mortgageTreatment
        : assumptions.debtCategoryTreatment[treatmentKey]
          || getRawEquivalentCategoryTreatment(treatmentKey);
      const applied = calculateAppliedTreatment(
        normalizedDebt,
        treatment,
        isMortgage ? "mortgage" : "non-mortgage",
        warnings,
        { mortgageSupportFacts }
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
        categoryTreatmentSources: clonePlainValue(assumptions.categoryTreatmentSources),
        defaultedDebtCategoryKeys: assumptions.defaultedDebtCategoryKeys.slice(),
        legacyCompatibility: clonePlainValue(assumptions.legacyCompatibility),
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
