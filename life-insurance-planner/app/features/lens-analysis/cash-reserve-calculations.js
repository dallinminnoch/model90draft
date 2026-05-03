(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis cash reserve helper.
  // Purpose: prepare traceable, reporting-only cash reserve calculations.
  // Non-goals: no DOM access, no storage access, no method wiring, no offset
  // replacement, no display rendering, and no model mutation.

  const CALCULATION_VERSION = 1;
  const SOURCE = "cash-reserve-calculations";
  const MIN_RESERVE_MONTHS = 0;
  const MAX_RESERVE_MONTHS = 24;
  const DEFAULT_RESERVE_MONTHS = 6;
  const MIN_FIXED_RESERVE_AMOUNT = 0;
  const MAX_FIXED_RESERVE_AMOUNT = 10000000;
  const DEFAULT_FIXED_RESERVE_AMOUNT = 0;
  const SAVED_ONLY_CONSUMPTION_STATUS = "saved-only";

  const CASH_RESERVE_MODES = Object.freeze([
    "reportingOnly",
    "methodActiveFuture"
  ]);
  const CASH_RESERVE_METHODS = Object.freeze([
    "monthsOfEssentialExpenses",
    "fixedDollarAmount"
  ]);
  const CASH_RESERVE_EXPENSE_BASIS_VALUES = Object.freeze([
    "essentialSupport",
    "essentialPlusHealthcare",
    "essentialPlusHealthcareAndDiscretionary"
  ]);
  const CASH_RESERVE_ASSET_SCOPE_VALUES = Object.freeze([
    "cashAndCashEquivalents",
    "liquidAssetsFuture",
    "selectedAssetsFuture"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
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

  function roundNumber(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
  }

  function pushWarning(warnings, code, message, details) {
    warnings.push(createWarning(code, message, details));
  }

  function normalizeEnum(value, allowedValues, defaultValue, warnings, code, message) {
    const normalized = normalizeString(value);
    if (allowedValues.includes(normalized)) {
      return normalized;
    }

    if (normalized) {
      pushWarning(warnings, code, message, { received: normalized, defaultValue });
    }
    return defaultValue;
  }

  function normalizeBoolean(value, fallback) {
    return typeof value === "boolean" ? value : Boolean(fallback);
  }

  function normalizeNumber(value, fallback, min, max, warnings, code, message) {
    const parsed = toOptionalNumber(value);
    if (parsed === null) {
      pushWarning(warnings, code, message, { received: value, defaultValue: fallback });
      return fallback;
    }

    const clamped = Math.min(max, Math.max(min, parsed));
    if (clamped !== parsed) {
      pushWarning(warnings, `${code}-clamped`, message, {
        received: parsed,
        min,
        max,
        used: roundNumber(clamped)
      });
    }

    return roundNumber(clamped);
  }

  function normalizeCashReserveAssumptions(cashReserveAssumptions, warnings) {
    const saved = isPlainObject(cashReserveAssumptions) ? cashReserveAssumptions : {};
    const mode = normalizeEnum(
      saved.mode,
      CASH_RESERVE_MODES,
      "reportingOnly",
      warnings,
      "invalid-cash-reserve-mode",
      "Cash reserve mode was invalid and defaulted to reportingOnly."
    );
    const reserveMethod = normalizeEnum(
      saved.reserveMethod,
      CASH_RESERVE_METHODS,
      "monthsOfEssentialExpenses",
      warnings,
      "invalid-cash-reserve-method",
      "Cash reserve method was invalid and defaulted to monthsOfEssentialExpenses."
    );
    const expenseBasis = normalizeEnum(
      saved.expenseBasis,
      CASH_RESERVE_EXPENSE_BASIS_VALUES,
      "essentialSupport",
      warnings,
      "invalid-cash-reserve-expense-basis",
      "Cash reserve expense basis was invalid and defaulted to essentialSupport."
    );
    const applyToAssetScope = normalizeEnum(
      saved.applyToAssetScope,
      CASH_RESERVE_ASSET_SCOPE_VALUES,
      "cashAndCashEquivalents",
      warnings,
      "invalid-cash-reserve-asset-scope",
      "Cash reserve asset scope was invalid and defaulted to cashAndCashEquivalents."
    );
    const reserveMonths = normalizeNumber(
      saved.reserveMonths,
      DEFAULT_RESERVE_MONTHS,
      MIN_RESERVE_MONTHS,
      MAX_RESERVE_MONTHS,
      warnings,
      "invalid-cash-reserve-months",
      "Cash reserve months was missing, invalid, or outside the supported 0-24 range."
    );
    const fixedReserveAmount = normalizeNumber(
      saved.fixedReserveAmount,
      DEFAULT_FIXED_RESERVE_AMOUNT,
      MIN_FIXED_RESERVE_AMOUNT,
      MAX_FIXED_RESERVE_AMOUNT,
      warnings,
      "invalid-fixed-cash-reserve-amount",
      "Fixed cash reserve amount was missing, invalid, or outside the supported range."
    );

    if (mode === "methodActiveFuture") {
      pushWarning(
        warnings,
        "cash-reserve-method-active-future-inactive",
        "Cash reserve method-active mode is a future enum only and is not consumed by current methods."
      );
    }

    return {
      enabled: normalizeBoolean(saved.enabled, false),
      mode,
      reserveMethod,
      reserveMonths,
      fixedReserveAmount,
      expenseBasis,
      applyToAssetScope,
      excludeEmergencyFundAssets: normalizeBoolean(saved.excludeEmergencyFundAssets, true),
      includeHealthcareExpenses: normalizeBoolean(saved.includeHealthcareExpenses, false),
      includeDiscretionaryExpenses: normalizeBoolean(saved.includeDiscretionaryExpenses, false),
      source: "analysis-setup",
      consumptionStatus: SAVED_ONLY_CONSUMPTION_STATUS
    };
  }

  function getAssetList(assetFacts) {
    if (Array.isArray(assetFacts)) {
      return assetFacts;
    }

    if (Array.isArray(assetFacts?.assets)) {
      return assetFacts.assets;
    }

    return [];
  }

  function getTaxonomyCategories(assetTaxonomy) {
    const safeTaxonomy = isPlainObject(assetTaxonomy)
      ? assetTaxonomy
      : (isPlainObject(lensAnalysis.assetTaxonomy) ? lensAnalysis.assetTaxonomy : {});
    if (Array.isArray(safeTaxonomy.DEFAULT_ASSET_CATEGORIES)) {
      return safeTaxonomy.DEFAULT_ASSET_CATEGORIES;
    }

    if (Array.isArray(safeTaxonomy.categories)) {
      return safeTaxonomy.categories;
    }

    return [];
  }

  function getCategoryByKey(assetTaxonomy, categoryKey) {
    const safeCategoryKey = normalizeString(categoryKey);
    if (!safeCategoryKey) {
      return null;
    }

    return getTaxonomyCategories(assetTaxonomy).find(function (category) {
      return category && category.categoryKey === safeCategoryKey;
    }) || null;
  }

  function getAssetLibraryEntries(assetLibrary) {
    const safeLibrary = isPlainObject(assetLibrary)
      ? assetLibrary
      : (isPlainObject(lensAnalysis.assetLibrary) ? lensAnalysis.assetLibrary : {});

    if (typeof safeLibrary.getAssetLibraryEntries === "function") {
      return safeLibrary.getAssetLibraryEntries();
    }

    if (Array.isArray(safeLibrary.ASSET_LIBRARY_ENTRIES)) {
      return safeLibrary.ASSET_LIBRARY_ENTRIES;
    }

    return [];
  }

  function getLibraryEntryByType(assetLibrary, typeKey) {
    const safeTypeKey = normalizeString(typeKey);
    if (!safeTypeKey) {
      return null;
    }

    const safeLibrary = isPlainObject(assetLibrary)
      ? assetLibrary
      : (isPlainObject(lensAnalysis.assetLibrary) ? lensAnalysis.assetLibrary : {});
    if (typeof safeLibrary.findAssetLibraryEntry === "function") {
      return safeLibrary.findAssetLibraryEntry(safeTypeKey);
    }

    return getAssetLibraryEntries(safeLibrary).find(function (entry) {
      return entry && entry.typeKey === safeTypeKey;
    }) || null;
  }

  function getReserveMetadata(asset, input) {
    const category = getCategoryByKey(input.assetTaxonomy, asset.categoryKey);
    const libraryEntry = getLibraryEntryByType(input.assetLibrary, asset.typeKey);
    const metadataSource = libraryEntry && libraryEntry.reserveRole ? "asset-library" : "asset-taxonomy";

    return {
      reserveRole: normalizeString(libraryEntry?.reserveRole)
        || normalizeString(category?.reserveRole)
        || "review",
      reserveTreatmentDefault: normalizeString(libraryEntry?.reserveTreatmentDefault)
        || normalizeString(category?.reserveTreatmentDefault)
        || "review",
      reserveEligible: typeof libraryEntry?.reserveEligible === "boolean"
        ? libraryEntry.reserveEligible
        : category?.reserveEligible === true,
      reservedByDefault: typeof libraryEntry?.reservedByDefault === "boolean"
        ? libraryEntry.reservedByDefault
        : category?.reservedByDefault === true,
      reserveReviewRequired: typeof libraryEntry?.reserveReviewRequired === "boolean"
        ? libraryEntry.reserveReviewRequired
        : category?.reserveReviewRequired === true,
      reserveRationale: normalizeString(libraryEntry?.reserveRationale)
        || normalizeString(category?.reserveRationale)
        || null,
      metadataSource
    };
  }

  function createAssetSummary(asset, reserveMetadata, classification, warnings) {
    return {
      assetFactId: normalizeString(asset.assetFactId)
        || normalizeString(asset.assetId)
        || normalizeString(asset.sourceKey)
        || null,
      sourceKey: normalizeString(asset.sourceKey) || null,
      categoryKey: normalizeString(asset.categoryKey) || null,
      typeKey: normalizeString(asset.typeKey) || null,
      label: normalizeString(asset.label)
        || normalizeString(asset.typeKey)
        || normalizeString(asset.categoryKey)
        || "Asset",
      value: roundMoney(Math.max(0, toOptionalNumber(asset.currentValue) || 0)),
      reserveRole: reserveMetadata.reserveRole,
      reserveTreatmentDefault: reserveMetadata.reserveTreatmentDefault,
      reserveEligible: reserveMetadata.reserveEligible,
      reservedByDefault: reserveMetadata.reservedByDefault,
      reserveReviewRequired: reserveMetadata.reserveReviewRequired,
      reserveRationale: reserveMetadata.reserveRationale,
      metadataSource: reserveMetadata.metadataSource,
      classification,
      warnings
    };
  }

  function classifyAsset(asset, input, resultWarnings) {
    const categoryKey = normalizeString(asset?.categoryKey);
    const typeKey = normalizeString(asset?.typeKey);
    const label = normalizeString(asset?.label) || typeKey || categoryKey || "Asset";
    const currentValue = toOptionalNumber(asset?.currentValue);

    if (!isPlainObject(asset)) {
      const warning = createWarning(
        "invalid-cash-reserve-asset-fact",
        "Asset fact was invalid and excluded from cash reserve calculation."
      );
      resultWarnings.push(warning);
      return {
        bucket: "excluded",
        summary: createAssetSummary(
          { label: "Invalid asset fact", currentValue: 0 },
          {
            reserveRole: "review",
            reserveTreatmentDefault: "review",
            reserveEligible: false,
            reservedByDefault: false,
            reserveReviewRequired: true,
            reserveRationale: null,
            metadataSource: "fallback"
          },
          "invalid",
          [warning]
        )
      };
    }

    if (!categoryKey) {
      const warning = createWarning(
        "missing-cash-reserve-asset-category",
        "Asset fact was missing categoryKey and excluded from cash reserve calculation.",
        { label }
      );
      resultWarnings.push(warning);
      return {
        bucket: "excluded",
        summary: createAssetSummary(asset, {
          reserveRole: "review",
          reserveTreatmentDefault: "review",
          reserveEligible: false,
          reservedByDefault: false,
          reserveReviewRequired: true,
          reserveRationale: null,
          metadataSource: "fallback"
        }, "missing-category", [warning])
      };
    }

    if (currentValue === null || currentValue <= 0) {
      const warning = createWarning(
        "missing-positive-cash-reserve-asset-value",
        "Asset fact was missing a positive current value and excluded from cash reserve calculation.",
        { categoryKey, typeKey: typeKey || null }
      );
      resultWarnings.push(warning);
      return {
        bucket: "excluded",
        summary: createAssetSummary(asset, getReserveMetadata(asset, input), "missing-positive-value", [warning])
      };
    }

    const reserveMetadata = getReserveMetadata(asset, input);
    const assetWarnings = [];
    let classification = "review";
    let bucket = "review";

    if (
      reserveMetadata.reserveRole === "escrowedRestricted"
      || reserveMetadata.reserveTreatmentDefault === "excluded"
    ) {
      classification = "restricted-or-escrowed";
      bucket = "excluded";
      assetWarnings.push(createWarning(
        "cash-reserve-restricted-cash-excluded",
        "Restricted or escrowed cash was excluded from reserve-available cash.",
        { categoryKey, typeKey: typeKey || null }
      ));
    } else if (
      reserveMetadata.reserveRole === "emergencyReserve"
      || categoryKey === "emergencyFund"
    ) {
      classification = "explicit-emergency-reserve";
      bucket = "included";
      assetWarnings.push(createWarning(
        "cash-reserve-emergency-fund-preserved",
        "Emergency fund assets are preserved by default for cash reserve reporting.",
        { categoryKey, typeKey: typeKey || null }
      ));
    } else if (reserveMetadata.reserveRole === "businessReserve") {
      classification = "business-reserve-review";
      bucket = "review";
      assetWarnings.push(createWarning(
        "cash-reserve-business-reserve-review-required",
        "Business cash reserves require advisor review before offset use.",
        { categoryKey, typeKey: typeKey || null }
      ));
    } else if (
      reserveMetadata.reserveRole === "reserveEligible"
      && reserveMetadata.reservedByDefault === true
    ) {
      classification = "reserve-review";
      bucket = "review";
      assetWarnings.push(createWarning(
        "cash-reserve-preserved-reserve-review-required",
        "Reserve-designated cash should be reviewed before offset use.",
        { categoryKey, typeKey: typeKey || null }
      ));
    } else if (
      reserveMetadata.reserveRole === "cashEquivalent"
      || categoryKey === "cashAndCashEquivalents"
    ) {
      classification = "cash-equivalent";
      bucket = "included";
    } else {
      classification = "review";
      bucket = "review";
      assetWarnings.push(createWarning(
        "cash-reserve-asset-review-required",
        "Asset reserve treatment requires advisor review.",
        { categoryKey, typeKey: typeKey || null }
      ));
    }

    assetWarnings.forEach(function (warning) {
      resultWarnings.push(warning);
    });

    return {
      bucket,
      summary: createAssetSummary(asset, reserveMetadata, classification, assetWarnings)
    };
  }

  function getNonNegativeMonthlyValue(value) {
    const parsed = toOptionalNumber(value);
    return parsed !== null && parsed >= 0 ? parsed : null;
  }

  function resolveEssentialMonthlyBasis(ongoingSupport, warnings) {
    const monthlyTotal = getNonNegativeMonthlyValue(ongoingSupport?.monthlyTotalEssentialSupportCost);
    if (monthlyTotal !== null) {
      return {
        value: monthlyTotal,
        source: "ongoingSupport.monthlyTotalEssentialSupportCost"
      };
    }

    const monthlyHousing = getNonNegativeMonthlyValue(ongoingSupport?.monthlyHousingSupportCost);
    const monthlyNonHousing = getNonNegativeMonthlyValue(ongoingSupport?.monthlyNonHousingEssentialSupportCost);
    if (monthlyHousing !== null || monthlyNonHousing !== null) {
      return {
        value: (monthlyHousing || 0) + (monthlyNonHousing || 0),
        source: "ongoingSupport.monthlyHousingSupportCost + ongoingSupport.monthlyNonHousingEssentialSupportCost"
      };
    }

    pushWarning(
      warnings,
      "missing-monthly-essential-support-basis",
      "Monthly essential support basis was missing or invalid; cash reserve basis used 0."
    );
    return {
      value: 0,
      source: "missing-essential-support-basis"
    };
  }

  function resolveDiscretionaryMonthlyBasis(ongoingSupport, warnings) {
    const monthlyDiscretionary = getNonNegativeMonthlyValue(
      ongoingSupport?.monthlyDiscretionaryPersonalSpending
    );
    if (monthlyDiscretionary !== null) {
      return {
        value: monthlyDiscretionary,
        source: "ongoingSupport.monthlyDiscretionaryPersonalSpending"
      };
    }

    const annualDiscretionary = getNonNegativeMonthlyValue(
      ongoingSupport?.annualDiscretionaryPersonalSpending
    );
    if (annualDiscretionary !== null) {
      return {
        value: annualDiscretionary / 12,
        source: "ongoingSupport.annualDiscretionaryPersonalSpending / 12"
      };
    }

    pushWarning(
      warnings,
      "missing-monthly-discretionary-reserve-basis",
      "Discretionary reserve basis was requested but unavailable; cash reserve basis used available inputs only."
    );
    return {
      value: 0,
      source: "missing-discretionary-basis"
    };
  }

  function resolveMonthlyReserveBasis(ongoingSupport, assumptions, warnings) {
    const essentialBasis = resolveEssentialMonthlyBasis(ongoingSupport, warnings);
    let monthlyReserveBasis = essentialBasis.value;
    const sourcePaths = [essentialBasis.source];

    if (
      assumptions.expenseBasis === "essentialPlusHealthcare"
      || assumptions.expenseBasis === "essentialPlusHealthcareAndDiscretionary"
      || assumptions.includeHealthcareExpenses === true
    ) {
      pushWarning(
        warnings,
        "healthcare-reserve-basis-unavailable",
        "Healthcare reserve basis was requested but no separate current monthly healthcare reserve basis was supplied; cash reserve basis used essential support only for healthcare."
      );
      sourcePaths.push("healthcare-basis-unavailable");
    }

    if (
      assumptions.expenseBasis === "essentialPlusHealthcareAndDiscretionary"
      || assumptions.includeDiscretionaryExpenses === true
    ) {
      const discretionaryBasis = resolveDiscretionaryMonthlyBasis(ongoingSupport, warnings);
      monthlyReserveBasis += discretionaryBasis.value;
      sourcePaths.push(discretionaryBasis.source);
    }

    return {
      monthlyReserveBasis: roundMoney(monthlyReserveBasis),
      sourcePaths
    };
  }

  function calculateCashReserveProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [
      createWarning(
        "cash-reserve-reporting-only",
        "Cash reserve projection is reporting-only and is not consumed by current methods."
      )
    ];
    const assumptions = normalizeCashReserveAssumptions(
      safeInput.cashReserveAssumptions,
      warnings
    );
    const ongoingSupport = isPlainObject(safeInput.ongoingSupport) ? safeInput.ongoingSupport : {};
    const reserveBasis = resolveMonthlyReserveBasis(ongoingSupport, assumptions, warnings);
    const requiredReserveAmount = assumptions.reserveMethod === "fixedDollarAmount"
      ? assumptions.fixedReserveAmount
      : reserveBasis.monthlyReserveBasis * assumptions.reserveMonths;
    const includedAssets = [];
    const excludedAssets = [];
    const reviewAssets = [];

    getAssetList(safeInput.assetFacts).forEach(function (asset) {
      const classified = classifyAsset(asset, safeInput, warnings);
      if (classified.bucket === "included") {
        includedAssets.push(classified.summary);
      } else if (classified.bucket === "excluded") {
        excludedAssets.push(classified.summary);
      } else {
        reviewAssets.push(classified.summary);
      }
    });

    const totalCashEquivalentValue = includedAssets.reduce(function (total, asset) {
      return asset.classification === "cash-equivalent" ? total + asset.value : total;
    }, 0);
    const totalExplicitEmergencyFundValue = includedAssets.reduce(function (total, asset) {
      return asset.classification === "explicit-emergency-reserve" ? total + asset.value : total;
    }, 0);
    const totalRestrictedOrEscrowedCashValue = excludedAssets.reduce(function (total, asset) {
      return asset.classification === "restricted-or-escrowed" ? total + asset.value : total;
    }, 0);
    const totalBusinessReserveValue = reviewAssets.reduce(function (total, asset) {
      return asset.classification === "business-reserve-review" ? total + asset.value : total;
    }, 0);
    const emergencyFundReservedAmount = assumptions.excludeEmergencyFundAssets
      ? totalExplicitEmergencyFundValue
      : 0;

    if (!assumptions.excludeEmergencyFundAssets && totalExplicitEmergencyFundValue > 0) {
      pushWarning(
        warnings,
        "cash-reserve-emergency-fund-included-in-cash-pool",
        "Emergency fund assets were not excluded and may appear in available cash reporting; review before offset use."
      );
    }

    const remainingReserveNeededAfterEmergencyFund = Math.max(
      requiredReserveAmount - emergencyFundReservedAmount,
      0
    );
    const liquidPoolForReserve = assumptions.excludeEmergencyFundAssets
      ? totalCashEquivalentValue
      : totalCashEquivalentValue + totalExplicitEmergencyFundValue;
    const cashAvailableAboveReserve = Math.max(
      liquidPoolForReserve - remainingReserveNeededAfterEmergencyFund,
      0
    );
    const cashReservedFromPool = Math.min(
      liquidPoolForReserve,
      remainingReserveNeededAfterEmergencyFund
    );
    const totalReservedAmount = emergencyFundReservedAmount + cashReservedFromPool;

    if (totalReservedAmount < requiredReserveAmount) {
      pushWarning(
        warnings,
        "insufficient-cash-reserve-assets",
        "Available reserve-eligible cash was insufficient to satisfy the required reserve amount.",
        {
          requiredReserveAmount: roundMoney(requiredReserveAmount),
          totalReservedAmount: roundMoney(totalReservedAmount)
        }
      );
    }

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      applied: true,
      consumedByMethods: false,
      enabled: assumptions.enabled,
      mode: assumptions.mode,
      reserveMethod: assumptions.reserveMethod,
      reserveMonths: assumptions.reserveMonths,
      fixedReserveAmount: roundMoney(assumptions.fixedReserveAmount),
      expenseBasis: assumptions.expenseBasis,
      monthlyReserveBasis: reserveBasis.monthlyReserveBasis,
      monthlyReserveBasisSourcePaths: reserveBasis.sourcePaths,
      requiredReserveAmount: roundMoney(requiredReserveAmount),
      applyToAssetScope: assumptions.applyToAssetScope,
      excludeEmergencyFundAssets: assumptions.excludeEmergencyFundAssets,
      includeHealthcareExpenses: assumptions.includeHealthcareExpenses,
      includeDiscretionaryExpenses: assumptions.includeDiscretionaryExpenses,
      totalCashEquivalentValue: roundMoney(totalCashEquivalentValue),
      totalExplicitEmergencyFundValue: roundMoney(totalExplicitEmergencyFundValue),
      totalRestrictedOrEscrowedCashValue: roundMoney(totalRestrictedOrEscrowedCashValue),
      totalBusinessReserveValue: roundMoney(totalBusinessReserveValue),
      emergencyFundReservedAmount: roundMoney(emergencyFundReservedAmount),
      remainingReserveNeededAfterEmergencyFund: roundMoney(remainingReserveNeededAfterEmergencyFund),
      cashAvailableAboveReserve: roundMoney(cashAvailableAboveReserve),
      totalReservedAmount: roundMoney(totalReservedAmount),
      totalAvailableAfterReserve: roundMoney(cashAvailableAboveReserve),
      includedAssets,
      excludedAssets,
      reviewAssets,
      warnings,
      valuationDate: normalizeString(safeInput.valuationDate) || null,
      valuationDateSource: normalizeString(safeInput.valuationDateSource) || null
    };
  }

  lensAnalysis.calculateCashReserveProjection = calculateCashReserveProjection;
})(typeof window !== "undefined" ? window : globalThis);
