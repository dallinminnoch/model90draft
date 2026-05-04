(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis projected asset offset helper.
  // Purpose: prepare an inactive method-consumption candidate from already
  // treated asset offsets and saved growth assumptions.
  // Non-goals: no DOM access, no storage access, no method wiring, no raw asset
  // projection totals, no cash reserve consumption, and no model mutation.

  const CALCULATION_VERSION = 1;
  const SOURCE = "projected-asset-offset-calculations";
  const MIN_PROJECTION_YEARS = 0;
  const MAX_PROJECTION_YEARS = 60;
  const MIN_GROWTH_RATE_PERCENT = 0;
  const MAX_GROWTH_RATE_PERCENT = 12;
  const DEFAULT_SOURCE_MODE = "currentDollarOnly";
  const SUPPORTED_SOURCE_MODES = Object.freeze([
    "currentDollarOnly",
    "reportingOnly",
    "projectedOffsets"
  ]);
  const CONSUMPTION_STATUS = "saved-only";
  const ACTIVATION_STATUS = "future-inactive";
  const EMERGENCY_FUND_CATEGORY_KEY = "emergencyFund";
  const RESTRICTED_GROUPS = Object.freeze([
    "restrictedPurpose"
  ]);
  const REVIEW_ONLY_STATUSES = Object.freeze([
    "review-only",
    "not-recommended"
  ]);
  const LIQUIDITY_INELIGIBLE_TREATMENT_PRESETS = Object.freeze([
    "business-illiquid",
    "restricted-purpose",
    "restricted-asset",
    "case-specific",
    "alternative-asset",
    "real-estate-equity"
  ]);
  const RESTRICTED_TREATMENT_PRESETS = Object.freeze([
    "restricted-purpose",
    "restricted-asset"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toOptionalNumber(value) {
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

  function roundRate(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundYears(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  }

  function cloneSerializable(value) {
    if (value == null) {
      return value;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return value;
    }
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
  }

  function getTaxonomyCategories(assetTaxonomy) {
    const safeTaxonomy = isPlainObject(assetTaxonomy) ? assetTaxonomy : {};
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

  function resolveProjectionAssumptions(input) {
    const safeInput = isPlainObject(input) ? input : {};
    if (isPlainObject(safeInput.assetGrowthProjectionAssumptions)) {
      return safeInput.assetGrowthProjectionAssumptions;
    }

    if (isPlainObject(safeInput.assetTreatmentAssumptions?.assetGrowthProjectionAssumptions)) {
      return safeInput.assetTreatmentAssumptions.assetGrowthProjectionAssumptions;
    }

    return {};
  }

  function normalizeSourceMode(value, warnings) {
    const normalized = normalizeString(value);
    if (SUPPORTED_SOURCE_MODES.includes(normalized)) {
      return normalized;
    }

    if (normalized) {
      warnings.push(createWarning(
        "invalid-projected-asset-offset-source-mode",
        "Projected asset offset source mode was invalid and defaulted to current-dollar only.",
        { received: normalized, defaultValue: DEFAULT_SOURCE_MODE }
      ));
    }

    return DEFAULT_SOURCE_MODE;
  }

  function normalizeProjectionYears(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed === null) {
      warnings.push(createWarning(
        "invalid-projected-asset-offset-projection-years",
        "Projected asset offset projection years was missing or invalid; the inactive candidate remains unchanged.",
        { received: value, defaultValue: 0 }
      ));
      return {
        value: 0,
        defaulted: true,
        clamped: false,
        usable: false
      };
    }

    const clamped = Math.min(MAX_PROJECTION_YEARS, Math.max(MIN_PROJECTION_YEARS, parsed));
    if (clamped !== parsed) {
      warnings.push(createWarning(
        "projected-asset-offset-projection-years-clamped",
        "Projected asset offset projection years was outside the supported 0-60 range and was clamped.",
        {
          received: parsed,
          min: MIN_PROJECTION_YEARS,
          max: MAX_PROJECTION_YEARS,
          used: roundYears(clamped)
        }
      ));
    }

    if (clamped === 0) {
      warnings.push(createWarning(
        "projected-asset-offset-zero-projection-years",
        "Projected asset offset projection years is 0; the inactive candidate remains equal to the current treated asset offset."
      ));
    }

    return {
      value: roundYears(clamped),
      defaulted: false,
      clamped: clamped !== parsed,
      usable: clamped > 0
    };
  }

  function normalizeGrowthRatePercent(value, categoryKey, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed === null) {
      warnings.push(createWarning(
        "invalid-projected-asset-offset-growth-rate",
        "Projected asset offset growth rate was missing or invalid and defaulted to 0.",
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
        "projected-asset-offset-growth-rate-clamped",
        "Projected asset offset growth rate was outside the supported 0-12 range and was clamped.",
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

  function getAssumptionForCategory(assetTreatmentAssumptions, categoryKey) {
    const assets = isPlainObject(assetTreatmentAssumptions?.assets)
      ? assetTreatmentAssumptions.assets
      : {};
    return isPlainObject(assets[categoryKey]) ? assets[categoryKey] : null;
  }

  function getTreatedAssets(treatedAssetOffsets) {
    return Array.isArray(treatedAssetOffsets?.assets) ? treatedAssetOffsets.assets : [];
  }

  function createExclusion(categoryKey, label, treatedValue, reason, warningCode, details) {
    return {
      categoryKey: categoryKey || null,
      label: label || "Asset",
      treatedValue: roundMoney(treatedValue),
      reason,
      warningCode,
      ...(isPlainObject(details) ? details : {})
    };
  }

  function getTraceClassification(asset) {
    const trace = isPlainObject(asset?.trace) ? asset.trace : {};

    return {
      group: normalizeString(trace.group) || normalizeString(asset?.group) || null,
      treatmentPreset: normalizeString(trace.treatmentPreset) || null,
      taxTreatment: normalizeString(trace.taxTreatment) || null,
      reserveRole: normalizeString(trace.reserveRole)
        || normalizeString(asset?.reserveRole)
        || normalizeString(trace.metadata?.reserveRole)
        || null,
      reserveTreatmentDefault: normalizeString(trace.reserveTreatmentDefault)
        || normalizeString(asset?.reserveTreatmentDefault)
        || normalizeString(trace.metadata?.reserveTreatmentDefault)
        || null,
      reserveEligible:
        typeof trace.reserveEligible === "boolean"
          ? trace.reserveEligible
          : typeof asset?.reserveEligible === "boolean"
            ? asset.reserveEligible
            : typeof trace.metadata?.reserveEligible === "boolean"
              ? trace.metadata.reserveEligible
              : null
    };
  }

  function getExclusionForRestrictedOrReviewCategory(category, asset, categoryKey, label, treatedValue) {
    const traceClassification = getTraceClassification(asset);
    const taxonomyGroup = normalizeString(category?.group);
    const taxonomyStatus = normalizeString(category?.growthAssumptionStatus);
    const taxonomyBias = normalizeString(category?.defaultTreatmentBias);
    const reserveRole = normalizeString(category?.reserveRole) || traceClassification.reserveRole;
    const reserveTreatmentDefault = normalizeString(category?.reserveTreatmentDefault)
      || traceClassification.reserveTreatmentDefault;
    const reserveEligible = typeof category?.reserveEligible === "boolean"
      ? category.reserveEligible
      : traceClassification.reserveEligible;

    if (categoryKey === EMERGENCY_FUND_CATEGORY_KEY) {
      return createExclusion(
        categoryKey,
        label,
        treatedValue,
        "Emergency Fund is excluded from projected method-consumed asset growth candidates in v1.",
        "emergency-fund-excluded-from-projected-asset-offset",
        { classificationSource: "asset-taxonomy.categoryKey" }
      );
    }

    if (
      RESTRICTED_GROUPS.includes(taxonomyGroup)
      || RESTRICTED_GROUPS.includes(traceClassification.group)
      || RESTRICTED_TREATMENT_PRESETS.includes(taxonomyBias)
      || RESTRICTED_TREATMENT_PRESETS.includes(traceClassification.treatmentPreset)
      || reserveRole === "escrowedRestricted"
    ) {
      return createExclusion(
        categoryKey,
        label,
        treatedValue,
        "Restricted or purpose-limited assets are excluded from the projected method-consumed growth candidate in v1.",
        "restricted-asset-excluded-from-projected-asset-offset",
        {
          classificationSource: "asset-taxonomy-or-treated-asset-trace",
          taxonomyGroup,
          treatmentPreset: traceClassification.treatmentPreset,
          reserveRole
        }
      );
    }

    if (
      REVIEW_ONLY_STATUSES.includes(taxonomyStatus)
      || category?.growthReviewRequired === true
      || category?.reserveReviewRequired === true
      || reserveRole === "review"
      || reserveTreatmentDefault === "review"
    ) {
      return createExclusion(
        categoryKey,
        label,
        treatedValue,
        "Review-only assets are excluded from the projected method-consumed growth candidate in v1.",
        "review-only-asset-excluded-from-projected-asset-offset",
        {
          classificationSource: "asset-taxonomy",
          growthAssumptionStatus: taxonomyStatus || null,
          growthReviewRequired: category?.growthReviewRequired === true,
          reserveRole,
          reserveTreatmentDefault
        }
      );
    }

    if (
      reserveEligible === false
      || reserveTreatmentDefault === "excluded"
      || LIQUIDITY_INELIGIBLE_TREATMENT_PRESETS.includes(taxonomyBias)
      || LIQUIDITY_INELIGIBLE_TREATMENT_PRESETS.includes(traceClassification.treatmentPreset)
    ) {
      return createExclusion(
        categoryKey,
        label,
        treatedValue,
        "Liquidity-ineligible assets are excluded from the projected method-consumed growth candidate in v1.",
        "liquidity-ineligible-asset-excluded-from-projected-asset-offset",
        {
          classificationSource: "asset-taxonomy-or-treated-asset-trace",
          defaultTreatmentBias: taxonomyBias || null,
          treatmentPreset: traceClassification.treatmentPreset,
          reserveEligible,
          reserveTreatmentDefault
        }
      );
    }

    return null;
  }

  function aggregateEligibleTreatedAssets(input, warnings, projectionYears) {
    const safeInput = isPlainObject(input) ? input : {};
    const treatedAssets = getTreatedAssets(safeInput.treatedAssetOffsets);
    const assetTreatmentAssumptions = isPlainObject(safeInput.assetTreatmentAssumptions)
      ? safeInput.assetTreatmentAssumptions
      : {};
    const categoriesByKey = new Map();
    const excludedCategories = [];

    treatedAssets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        excludedCategories.push(createExclusion(
          null,
          "Invalid treated asset",
          0,
          "Treated asset entry is not an object.",
          "invalid-treated-asset",
          { sourceIndex: index }
        ));
        return;
      }

      const categoryKey = normalizeString(asset.categoryKey);
      const category = getCategoryByKey(safeInput.assetTaxonomy, categoryKey);
      const label = normalizeString(asset.label) || normalizeString(category?.label) || categoryKey || "Asset";
      const treatedValue = toOptionalNumber(asset.treatedValue);

      if (!categoryKey) {
        excludedCategories.push(createExclusion(
          null,
          label,
          treatedValue || 0,
          "Treated asset is missing categoryKey.",
          "missing-treated-asset-category-key",
          { sourceIndex: index }
        ));
        return;
      }

      if (asset.include !== true) {
        excludedCategories.push(createExclusion(
          categoryKey,
          label,
          treatedValue || 0,
          "Asset is not included in treatedAssetOffsets and is excluded from projected method-consumed growth.",
          "treated-asset-not-included",
          { sourceIndex: index }
        ));
        return;
      }

      if (treatedValue === null || treatedValue <= 0) {
        excludedCategories.push(createExclusion(
          categoryKey,
          label,
          treatedValue || 0,
          "Asset does not have a positive treated value.",
          "non-positive-treated-asset-value",
          { sourceIndex: index }
        ));
        return;
      }

      const restrictionExclusion = getExclusionForRestrictedOrReviewCategory(
        category,
        asset,
        categoryKey,
        label,
        treatedValue
      );
      if (restrictionExclusion) {
        excludedCategories.push({
          ...restrictionExclusion,
          sourceIndex: index
        });
        return;
      }

      const assumption = getAssumptionForCategory(assetTreatmentAssumptions, categoryKey);
      if (!assumption) {
        excludedCategories.push(createExclusion(
          categoryKey,
          label,
          treatedValue,
          "No asset growth assumption exists for this treated category.",
          "missing-projected-asset-offset-growth-assumption",
          { sourceIndex: index }
        ));
        warnings.push(createWarning(
          "missing-projected-asset-offset-growth-assumption",
          "No asset growth assumption exists for a treated asset category; it was excluded from the inactive candidate.",
          { categoryKey }
        ));
        return;
      }

      const rateWarnings = [];
      const rate = normalizeGrowthRatePercent(
        assumption.assumedAnnualGrowthRatePercent,
        categoryKey,
        rateWarnings
      );
      rateWarnings.forEach(function (warning) {
        warnings.push(warning);
      });

      const existing = categoriesByKey.get(categoryKey) || {
        categoryKey,
        label,
        treatedValue: 0,
        sourceAssetCount: 0,
        assumedAnnualGrowthRatePercent: rate.value,
        assumedAnnualGrowthRateSource: normalizeString(assumption.assumedAnnualGrowthRateSource) || null,
        assumedAnnualGrowthRateProfile: normalizeString(assumption.assumedAnnualGrowthRateProfile) || null,
        growthConsumptionStatus: normalizeString(assumption.growthConsumptionStatus) || CONSUMPTION_STATUS,
        projectionYears,
        warnings: []
      };

      existing.treatedValue += treatedValue;
      existing.sourceAssetCount += 1;
      existing.warnings = existing.warnings.concat(rateWarnings);
      categoriesByKey.set(categoryKey, existing);
    });

    const includedCategories = Array.from(categoriesByKey.values()).map(function (category) {
      const treatedValue = Math.max(0, category.treatedValue);
      const growthFactor = Math.pow(1 + category.assumedAnnualGrowthRatePercent / 100, projectionYears);
      const projectedTreatedValue = treatedValue * growthFactor;
      const projectedGrowthAdjustment = projectedTreatedValue - treatedValue;

      return {
        ...category,
        treatedValue: roundMoney(treatedValue),
        projectedTreatedValue: roundMoney(projectedTreatedValue),
        projectedGrowthAdjustment: roundMoney(projectedGrowthAdjustment),
        projectionYears
      };
    });

    return {
      includedCategories,
      excludedCategories
    };
  }

  function calculateProjectedAssetOffset(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const warnings = [
      createWarning(
        "projected-asset-offset-future-inactive",
        "Projected asset offset is prepared as an inactive future candidate and is not consumed by current methods."
      )
    ];
    const projectionAssumptions = resolveProjectionAssumptions(safeInput);
    const sourceMode = normalizeSourceMode(projectionAssumptions.mode, warnings);
    let normalizedProjectionYears = normalizeProjectionYears(
      projectionAssumptions.projectionYears,
      warnings
    );
    if (sourceMode === "currentDollarOnly" && normalizedProjectionYears.value !== 0) {
      warnings.push(createWarning(
        "projected-asset-offset-current-dollar-years-ignored",
        "Current-dollar-only source mode ignores saved projection years; the inactive candidate remains unchanged.",
        { received: normalizedProjectionYears.value, used: 0 }
      ));
      normalizedProjectionYears = {
        value: 0,
        defaulted: normalizedProjectionYears.defaulted,
        clamped: normalizedProjectionYears.clamped,
        usable: false
      };
    }
    const projectionYears = normalizedProjectionYears.value;
    const currentTreatedAssetOffset = roundMoney(
      toOptionalNumber(safeInput.treatedAssetOffsets?.totalTreatedAssetValue) || 0
    );
    const aggregated = aggregateEligibleTreatedAssets(safeInput, warnings, projectionYears);
    const eligibleTreatedBase = aggregated.includedCategories.reduce(function (total, category) {
      return total + category.treatedValue;
    }, 0);
    const projectedTreatedValue = aggregated.includedCategories.reduce(function (total, category) {
      return total + category.projectedTreatedValue;
    }, 0);
    const projectedGrowthAdjustment = normalizedProjectionYears.usable
      ? roundMoney(projectedTreatedValue - eligibleTreatedBase)
      : 0;
    const effectiveProjectedAssetOffset = roundMoney(
      currentTreatedAssetOffset + projectedGrowthAdjustment
    );

    if (!getTreatedAssets(safeInput.treatedAssetOffsets).length) {
      warnings.push(createWarning(
        "missing-treated-asset-offset-assets",
        "treatedAssetOffsets.assets is missing or empty; no projected asset offset candidate categories were prepared."
      ));
    }

    if (toOptionalNumber(safeInput.treatedAssetOffsets?.totalTreatedAssetValue) === null) {
      warnings.push(createWarning(
        "missing-current-treated-asset-offset",
        "treatedAssetOffsets.totalTreatedAssetValue was missing or invalid; the inactive candidate uses 0 as the current treated asset offset."
      ));
    }

    if (!aggregated.includedCategories.length) {
      warnings.push(createWarning(
        "no-eligible-projected-asset-offset-categories",
        "No treated asset categories were eligible for projected method-consumed growth in the inactive candidate."
      ));
    }

    if (sourceMode === "projectedOffsets") {
      warnings.push(createWarning(
        "projected-asset-offset-source-mode-future-inactive",
        "Saved projectedOffsets mode is preserved as a future inactive candidate and does not activate method consumption."
      ));
    }

    if (sourceMode === "currentDollarOnly") {
      warnings.push(createWarning(
        "projected-asset-offset-current-dollar-only",
        "Current-dollar-only mode keeps the inactive projected asset offset equal to the current treated asset offset."
      ));
    }

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      currentTreatedAssetOffset,
      eligibleTreatedBase: roundMoney(eligibleTreatedBase),
      projectedTreatedValue: normalizedProjectionYears.usable
        ? roundMoney(projectedTreatedValue)
        : roundMoney(eligibleTreatedBase),
      projectedGrowthAdjustment,
      effectiveProjectedAssetOffset,
      projectionYears,
      projectionYearsSource: normalizeString(projectionAssumptions.projectionYearsSource)
        || "assetGrowthProjectionAssumptions.projectionYears",
      projectionYearsDefaulted: normalizedProjectionYears.defaulted,
      projectionYearsClamped: normalizedProjectionYears.clamped,
      sourceMode,
      sourceModeSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode",
      projectionMode: sourceMode === "projectedOffsets"
        ? "projectedOffsetsFutureInactive"
        : sourceMode,
      consumptionStatus: CONSUMPTION_STATUS,
      consumedByMethods: false,
      activationStatus: ACTIVATION_STATUS,
      includedCategoryCount: aggregated.includedCategories.length,
      excludedCategoryCount: aggregated.excludedCategories.length,
      includedCategories: cloneSerializable(aggregated.includedCategories),
      excludedCategories: cloneSerializable(aggregated.excludedCategories),
      warnings,
      trace: {
        source: SOURCE,
        calculationVersion: CALCULATION_VERSION,
        currentTreatedAssetOffset,
        currentTreatedAssetOffsetSource: "treatedAssetOffsets.totalTreatedAssetValue",
        eligibleTreatedBase: roundMoney(eligibleTreatedBase),
        eligibleTreatedBaseSource: "treatedAssetOffsets.assets[].treatedValue",
        projectedTreatedValue: normalizedProjectionYears.usable
          ? roundMoney(projectedTreatedValue)
          : roundMoney(eligibleTreatedBase),
        projectedGrowthAdjustment,
        effectiveProjectedAssetOffset,
        effectiveProjectedAssetOffsetFormula:
          "treatedAssetOffsets.totalTreatedAssetValue + projectedGrowthAdjustment",
        projectedGrowthAdjustmentFormula:
          "sum(eligible treatedValue * ((1 + assumedAnnualGrowthRatePercent / 100) ^ projectionYears - 1))",
        projectionYears,
        sourceMode,
        projectionMode: sourceMode === "projectedOffsets"
          ? "projectedOffsetsFutureInactive"
          : sourceMode,
        consumptionStatus: CONSUMPTION_STATUS,
        consumedByMethods: false,
        activationStatus: ACTIVATION_STATUS,
        includedCategoryKeys: aggregated.includedCategories.map(function (category) {
          return category.categoryKey;
        }),
        excludedCategoryKeys: aggregated.excludedCategories.map(function (category) {
          return category.categoryKey;
        }).filter(Boolean),
        excludedInputFamilies: [
          "projectedAssetGrowth.projectedTotalAssetValue",
          "projectedAssetGrowth.totalProjectedGrowthAmount",
          "cashReserveProjection"
        ]
      },
      metadata: {
        source: SOURCE,
        calculationVersion: CALCULATION_VERSION,
        inputBasis: "treatedAssetOffsets",
        growthAssumptionSource: "assetTreatmentAssumptions.assets",
        savedDataShapeChanged: false,
        methodConsumption: "inactive-prep-only",
        consumedByMethods: false
      }
    };
  }

  lensAnalysis.calculateProjectedAssetOffset = calculateProjectedAssetOffset;
})(typeof window !== "undefined" ? window : globalThis);
