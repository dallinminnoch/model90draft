(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis asset growth projection helper.
  // Purpose: prepare traceable, saved-only gross asset growth projections.
  // Non-goals: no DOM access, no storage access, no method wiring, no adapter
  // mapping, no treated-offset replacement, no analysis display rendering, and no model
  // mutation.

  const CALCULATION_VERSION = 1;
  const SOURCE = "asset-growth-projection-calculations";
  const MIN_PROJECTION_YEARS = 0;
  const MAX_PROJECTION_YEARS = 60;
  const MIN_GROWTH_RATE_PERCENT = 0;
  const MAX_GROWTH_RATE_PERCENT = 12;
  const SAVED_ONLY_CONSUMPTION_STATUS = "saved-only";

  const REVIEW_CATEGORY_WARNINGS = Object.freeze({
    digitalAssetsCrypto: Object.freeze({
      code: "digital-assets-crypto-growth-review-required",
      message: "Digital Assets / Crypto uses 0 default growth and requires advisor review before any future growth treatment is applied."
    }),
    otherCustomAsset: Object.freeze({
      code: "other-custom-asset-growth-review-required",
      message: "Other / Custom Asset uses 0 default growth and requires advisor classification before any future growth treatment is applied."
    }),
    emergencyFund: Object.freeze({
      code: "emergency-fund-growth-caution",
      message: "Emergency Fund growth assumptions should be reviewed because reserve preservation and liquidity matter."
    }),
    trustRestrictedAssets: Object.freeze({
      code: "trust-restricted-assets-access-limited",
      message: "Trust / Restricted Assets may be access-limited and need advisor review before growth assumptions are used."
    }),
    businessPrivateCompanyValue: Object.freeze({
      code: "business-private-company-growth-review-required",
      message: "Business / Private Company Value is case-specific and should be reviewed before growth assumptions are used."
    }),
    stockCompensationDeferredCompensation: Object.freeze({
      code: "stock-deferred-compensation-vesting-forfeiture-review",
      message: "Stock Compensation / Deferred Compensation may have vesting, forfeiture, concentration, or employer risk that requires review."
    })
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRate(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundYears(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
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

  function normalizeProjectionYears(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed === null) {
      warnings.push(createWarning(
        "invalid-asset-growth-projection-years",
        "Asset growth projection years was missing or invalid and defaulted to 0.",
        { received: value, defaultValue: 0 }
      ));
      return {
        value: 0,
        defaulted: true,
        clamped: false
      };
    }

    const clamped = Math.min(MAX_PROJECTION_YEARS, Math.max(MIN_PROJECTION_YEARS, parsed));
    if (clamped !== parsed) {
      warnings.push(createWarning(
        "asset-growth-projection-years-clamped",
        "Asset growth projection years was outside the supported 0-60 range and was clamped.",
        {
          received: parsed,
          min: MIN_PROJECTION_YEARS,
          max: MAX_PROJECTION_YEARS,
          used: roundYears(clamped)
        }
      ));
    }

    return {
      value: roundYears(clamped),
      defaulted: false,
      clamped: clamped !== parsed
    };
  }

  function normalizeGrowthRatePercent(value, categoryKey, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed === null) {
      warnings.push(createWarning(
        "invalid-asset-growth-rate",
        "Asset growth rate was missing or invalid and defaulted to 0.",
        { categoryKey, received: value, defaultValue: 0 }
      ));
      return {
        value: 0,
        defaulted: true,
        clamped: false
      };
    }

    const clamped = Math.min(MAX_GROWTH_RATE_PERCENT, Math.max(MIN_GROWTH_RATE_PERCENT, parsed));
    if (clamped !== parsed) {
      warnings.push(createWarning(
        "asset-growth-rate-clamped",
        "Asset growth rate was outside the supported 0-12 range and was clamped.",
        {
          categoryKey,
          received: parsed,
          min: MIN_GROWTH_RATE_PERCENT,
          max: MAX_GROWTH_RATE_PERCENT,
          used: roundRate(clamped)
        }
      ));
    }

    return {
      value: roundRate(clamped),
      defaulted: false,
      clamped: clamped !== parsed
    };
  }

  function createReviewWarnings(category, categoryKey) {
    const warnings = [];
    const assumptionStatus = normalizeString(category?.growthAssumptionStatus) || null;
    const reviewRequired = category?.growthReviewRequired === true || assumptionStatus === "review-only";

    if (reviewRequired) {
      warnings.push(createWarning(
        "asset-growth-review-only-category",
        "Asset growth assumption is review-only for this category.",
        {
          categoryKey,
          assumptionStatus,
          rationale: normalizeString(category?.growthDefaultRationale) || null
        }
      ));
    }

    const specificWarning = REVIEW_CATEGORY_WARNINGS[categoryKey];
    if (specificWarning) {
      warnings.push(createWarning(specificWarning.code, specificWarning.message, { categoryKey }));
    }

    return warnings;
  }

  function getAssumptionForCategory(assetTreatmentAssumptions, categoryKey) {
    const assets = isPlainObject(assetTreatmentAssumptions?.assets)
      ? assetTreatmentAssumptions.assets
      : {};
    return isPlainObject(assets[categoryKey]) ? assets[categoryKey] : null;
  }

  function aggregateAssetFacts(assetFacts, assetTaxonomy) {
    const categories = new Map();
    const excludedCategories = [];

    getAssetList(assetFacts).forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        excludedCategories.push({
          categoryKey: null,
          label: "Invalid asset fact",
          reason: "Invalid asset fact.",
          warningCode: "invalid-asset-fact",
          sourceIndex: index
        });
        return;
      }

      const categoryKey = normalizeString(asset.categoryKey);
      const category = getCategoryByKey(assetTaxonomy, categoryKey);
      const label = normalizeString(asset.label)
        || normalizeString(category?.label)
        || categoryKey
        || "Uncategorized asset";
      const currentValue = toOptionalNumber(asset.currentValue);

      if (!categoryKey) {
        excludedCategories.push({
          categoryKey: null,
          label,
          reason: "Asset fact is missing categoryKey.",
          warningCode: "missing-asset-category-key",
          sourceIndex: index
        });
        return;
      }

      if (currentValue === null || currentValue <= 0) {
        excludedCategories.push({
          categoryKey,
          label,
          reason: "Asset fact is missing a positive current value.",
          warningCode: "missing-positive-asset-current-value",
          sourceIndex: index
        });
        return;
      }

      const existing = categories.get(categoryKey) || {
        categoryKey,
        label,
        currentValue: 0,
        sourceAssetCount: 0
      };
      existing.currentValue += currentValue;
      existing.sourceAssetCount += 1;
      categories.set(categoryKey, existing);
    });

    return {
      includedCandidateCategories: Array.from(categories.values()),
      excludedCategories
    };
  }

  function projectAssetCategory(categoryCandidate, input, projectionYears, resultWarnings) {
    const categoryKey = categoryCandidate.categoryKey;
    const category = getCategoryByKey(input.assetTaxonomy, categoryKey);
    const assumption = getAssumptionForCategory(input.assetTreatmentAssumptions, categoryKey);
    const label = normalizeString(categoryCandidate.label)
      || normalizeString(category?.label)
      || categoryKey;

    if (!assumption) {
      return {
        excluded: {
          categoryKey,
          label,
          currentValue: roundMoney(categoryCandidate.currentValue),
          reason: "No asset treatment assumption exists for this category.",
          warningCode: "missing-asset-growth-assumption"
        }
      };
    }

    const categoryWarnings = [];
    const rate = normalizeGrowthRatePercent(
      assumption.assumedAnnualGrowthRatePercent,
      categoryKey,
      categoryWarnings
    );
    const reviewWarnings = createReviewWarnings(category, categoryKey);
    const currentValue = Math.max(0, categoryCandidate.currentValue);
    const growthFactor = Math.pow(1 + rate.value / 100, projectionYears);
    const projectedValue = currentValue * growthFactor;
    const warnings = categoryWarnings.concat(reviewWarnings);

    warnings.forEach(function (warning) {
      resultWarnings.push(warning);
    });

    return {
      included: {
        categoryKey,
        label,
        currentValue: roundMoney(currentValue),
        sourceAssetCount: categoryCandidate.sourceAssetCount,
        assumedAnnualGrowthRatePercent: rate.value,
        assumedAnnualGrowthRateSource: normalizeString(assumption.assumedAnnualGrowthRateSource) || null,
        assumedAnnualGrowthRateProfile: normalizeString(assumption.assumedAnnualGrowthRateProfile) || null,
        growthConsumptionStatus: normalizeString(assumption.growthConsumptionStatus) || SAVED_ONLY_CONSUMPTION_STATUS,
        projectedValue: roundMoney(projectedValue),
        projectedGrowthAmount: roundMoney(projectedValue - currentValue),
        projectionYears,
        reviewRequired: category?.growthReviewRequired === true,
        assumptionStatus: normalizeString(category?.growthAssumptionStatus) || null,
        warnings
      }
    };
  }

  function calculateAssetGrowthProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [];
    const normalizedProjectionYears = normalizeProjectionYears(safeInput.projectionYears, warnings);
    const projectionYears = normalizedProjectionYears.value;
    const aggregated = aggregateAssetFacts(safeInput.assetFacts, safeInput.assetTaxonomy);
    const includedCategories = [];
    const excludedCategories = aggregated.excludedCategories.slice();

    aggregated.includedCandidateCategories.forEach(function (categoryCandidate) {
      const projectedCategory = projectAssetCategory(
        categoryCandidate,
        safeInput,
        projectionYears,
        warnings
      );
      if (projectedCategory.included) {
        includedCategories.push(projectedCategory.included);
      }
      if (projectedCategory.excluded) {
        excludedCategories.push(projectedCategory.excluded);
      }
    });

    const currentTotalAssetValue = includedCategories.reduce(function (total, category) {
      return total + category.currentValue;
    }, 0);
    const projectedTotalAssetValue = includedCategories.reduce(function (total, category) {
      return total + category.projectedValue;
    }, 0);
    const reviewWarningCount = warnings.filter(function (warning) {
      return normalizeString(warning.code).indexOf("review") >= 0
        || normalizeString(warning.code).indexOf("caution") >= 0
        || normalizeString(warning.code).indexOf("access-limited") >= 0
        || normalizeString(warning.code).indexOf("vesting-forfeiture") >= 0;
    }).length;

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      applied: true,
      projectionYears,
      projectionYearsSource: normalizeString(safeInput.projectionYearsSource) || null,
      projectionYearsDefaulted: normalizedProjectionYears.defaulted,
      projectionYearsClamped: normalizedProjectionYears.clamped,
      currentTotalAssetValue: roundMoney(currentTotalAssetValue),
      projectedTotalAssetValue: roundMoney(projectedTotalAssetValue),
      totalProjectedGrowthAmount: roundMoney(projectedTotalAssetValue - currentTotalAssetValue),
      includedCategoryCount: includedCategories.length,
      excludedCategoryCount: excludedCategories.length,
      reviewWarningCount,
      includedCategories,
      excludedCategories,
      warnings,
      valuationDate: normalizeString(safeInput.valuationDate) || null,
      valuationDateSource: normalizeString(safeInput.valuationDateSource) || null,
      consumedByMethods: false
    };
  }

  lensAnalysis.calculateAssetGrowthProjection = calculateAssetGrowthProjection;
})(typeof window !== "undefined" ? window : globalThis);
