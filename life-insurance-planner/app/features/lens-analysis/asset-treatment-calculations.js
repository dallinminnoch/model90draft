(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis asset treatment helper.
  // Purpose: calculate treated asset values from raw assetFacts and Analysis Setup assumptions.
  // Non-goals: no DOM access, no storage access, no method wiring, and no formula ownership.

  const CALCULATION_VERSION = 1;

  const CATEGORY_TREATMENT_ALIASES = Object.freeze({
    cashAndCashEquivalents: Object.freeze(["cashSavings"]),
    taxableBrokerageInvestments: Object.freeze(["taxableBrokerage", "brokerageAccounts"]),
    rothTaxAdvantagedRetirementAssets: Object.freeze(["rothRetirementAssets"]),
    primaryResidenceEquity: Object.freeze(["realEstateEquity"]),
    businessPrivateCompanyValue: Object.freeze(["businessValue"]),
    otherCustomAsset: Object.freeze(["otherAssets"]),
  });

  const SAFE_EXCLUDED_TREATMENT = Object.freeze({
    include: false,
    treatmentPreset: "custom",
    taxTreatment: "custom",
    taxDragPercent: 0,
    liquidityHaircutPercent: 25,
  });

  const DEFAULT_TREATMENTS_BY_BIAS = Object.freeze({
    "cash-like": Object.freeze({
      include: true,
      treatmentPreset: "cash-like",
      taxTreatment: "no-tax-drag",
      taxDragPercent: 0,
      liquidityHaircutPercent: 0,
    }),
    "step-up-investment": Object.freeze({
      include: true,
      treatmentPreset: "step-up-investment",
      taxTreatment: "step-up-eligible",
      taxDragPercent: 0,
      liquidityHaircutPercent: 5,
    }),
    "taxable-retirement": Object.freeze({
      include: true,
      treatmentPreset: "taxable-retirement",
      taxTreatment: "ordinary-income-on-distribution",
      taxDragPercent: 25,
      liquidityHaircutPercent: 5,
    }),
    "roth-retirement": Object.freeze({
      include: true,
      treatmentPreset: "roth-retirement",
      taxTreatment: "tax-advantaged",
      taxDragPercent: 0,
      liquidityHaircutPercent: 5,
    }),
    "qualified-annuity": Object.freeze({
      include: true,
      treatmentPreset: "qualified-annuity",
      taxTreatment: "ordinary-income-on-distribution",
      taxDragPercent: 25,
      liquidityHaircutPercent: 5,
    }),
    "nonqualified-annuity": Object.freeze({
      include: true,
      treatmentPreset: "nonqualified-annuity",
      taxTreatment: "partially-taxable",
      taxDragPercent: 15,
      liquidityHaircutPercent: 10,
    }),
    "real-estate-equity": Object.freeze({
      include: false,
      treatmentPreset: "real-estate-equity",
      taxTreatment: "step-up-eligible",
      taxDragPercent: 0,
      liquidityHaircutPercent: 25,
    }),
    "business-illiquid": Object.freeze({
      include: false,
      treatmentPreset: "business-illiquid",
      taxTreatment: "case-specific",
      taxDragPercent: 10,
      liquidityHaircutPercent: 50,
    }),
    "restricted-purpose": Object.freeze({
      include: false,
      treatmentPreset: "custom",
      taxTreatment: "custom",
      taxDragPercent: 0,
      liquidityHaircutPercent: 25,
    }),
    "restricted-asset": Object.freeze({
      include: false,
      treatmentPreset: "custom",
      taxTreatment: "custom",
      taxDragPercent: 0,
      liquidityHaircutPercent: 40,
    }),
    "case-specific": Object.freeze({
      include: false,
      treatmentPreset: "custom",
      taxTreatment: "case-specific",
      taxDragPercent: 15,
      liquidityHaircutPercent: 25,
    }),
    "alternative-asset": Object.freeze({
      include: false,
      treatmentPreset: "custom",
      taxTreatment: "custom",
      taxDragPercent: 0,
      liquidityHaircutPercent: 50,
    }),
    custom: SAFE_EXCLUDED_TREATMENT,
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

    const normalized = String(value).replace(/[$,%\s,]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clampPercent(value, fallback) {
    const parsed = toOptionalNumber(value);
    const base = parsed === null ? fallback : parsed;
    const safe = Number.isFinite(base) ? base : 0;
    return Math.min(100, Math.max(0, safe));
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
  }

  function getTaxonomyCategories() {
    const taxonomy = lensAnalysis.assetTaxonomy;
    return taxonomy && Array.isArray(taxonomy.DEFAULT_ASSET_CATEGORIES)
      ? taxonomy.DEFAULT_ASSET_CATEGORIES
      : [];
  }

  function getTaxonomyCategory(categoryKey) {
    if (!categoryKey) {
      return null;
    }

    return getTaxonomyCategories().find((category) => category.categoryKey === categoryKey) || null;
  }

  function getDefaultTreatmentForCategory(categoryKey) {
    const category = getTaxonomyCategory(categoryKey);
    const bias = category ? category.defaultTreatmentBias : null;
    const treatment = bias ? DEFAULT_TREATMENTS_BY_BIAS[bias] : null;

    return {
      treatment: normalizeTreatmentConfig(treatment || SAFE_EXCLUDED_TREATMENT, {
        fallback: SAFE_EXCLUDED_TREATMENT,
        source: treatment ? "asset-taxonomy-default" : "safe-excluded-default",
        sourceKey: bias || null,
      }),
      category,
      bias,
      usedTaxonomyDefault: Boolean(treatment),
    };
  }

  function normalizeTreatmentConfig(treatment, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const fallback = isPlainObject(safeOptions.fallback)
      ? safeOptions.fallback
      : SAFE_EXCLUDED_TREATMENT;
    const safeTreatment = isPlainObject(treatment) ? treatment : {};

    return {
      include:
        typeof safeTreatment.include === "boolean"
          ? safeTreatment.include
          : Boolean(fallback.include),
      treatmentPreset:
        normalizeString(safeTreatment.treatmentPreset) ||
        normalizeString(fallback.treatmentPreset) ||
        "custom",
      taxTreatment:
        normalizeString(safeTreatment.taxTreatment) ||
        normalizeString(fallback.taxTreatment) ||
        "custom",
      taxDragPercent: clampPercent(safeTreatment.taxDragPercent, fallback.taxDragPercent),
      liquidityHaircutPercent: clampPercent(
        safeTreatment.liquidityHaircutPercent !== undefined
          ? safeTreatment.liquidityHaircutPercent
          : safeTreatment.liquidityDiscountPercent,
        fallback.liquidityHaircutPercent
      ),
      source: safeOptions.source || safeTreatment.source || null,
      sourceKey: safeOptions.sourceKey || safeTreatment.sourceKey || null,
    };
  }

  function normalizeAssetTreatmentAssumptions(assumptions) {
    const safeAssumptions = isPlainObject(assumptions) ? assumptions : {};
    const sourceAssets = isPlainObject(safeAssumptions.assets) ? safeAssumptions.assets : {};
    const normalizedAssets = {};

    Object.keys(sourceAssets).forEach((key) => {
      normalizedAssets[key] = normalizeTreatmentConfig(sourceAssets[key], {
        fallback: SAFE_EXCLUDED_TREATMENT,
        source: "assetTreatmentAssumptions.assets",
        sourceKey: key,
      });
    });

    const customAssets = Array.isArray(safeAssumptions.customAssets)
      ? safeAssumptions.customAssets
          .filter(isPlainObject)
          .map((customAsset, index) =>
            normalizeTreatmentConfig(customAsset, {
              fallback: SAFE_EXCLUDED_TREATMENT,
              source: "assetTreatmentAssumptions.customAssets",
              sourceKey:
                normalizeString(customAsset.id) ||
                normalizeString(customAsset.categoryKey) ||
                `custom-${index + 1}`,
            })
          )
      : [];

    return {
      enabled: safeAssumptions.enabled === true,
      defaultProfile: normalizeString(safeAssumptions.defaultProfile) || null,
      assets: normalizedAssets,
      customAssets,
      source: normalizeString(safeAssumptions.source) || null,
    };
  }

  function getAssetTreatmentCandidateKeys(categoryKey) {
    const safeCategoryKey = normalizeString(categoryKey);
    const aliases = CATEGORY_TREATMENT_ALIASES[safeCategoryKey] || [];
    return [safeCategoryKey].concat(aliases).filter(Boolean);
  }

  function getAssetTreatmentForCategory(categoryKey, assumptions) {
    const normalizedAssumptions = normalizeAssetTreatmentAssumptions(assumptions);
    const candidateKeys = getAssetTreatmentCandidateKeys(categoryKey);

    for (let index = 0; index < candidateKeys.length; index += 1) {
      const key = candidateKeys[index];
      if (normalizedAssumptions.assets[key]) {
        return normalizedAssumptions.assets[key];
      }
    }

    if (
      normalizeString(categoryKey) === "otherCustomAsset" &&
      Array.isArray(normalizedAssumptions.customAssets) &&
      normalizedAssumptions.customAssets.length
    ) {
      return normalizedAssumptions.customAssets[0];
    }

    return null;
  }

  function normalizeAssetFact(asset, index) {
    const safeAsset = isPlainObject(asset) ? asset : {};
    const categoryKey = normalizeString(safeAsset.categoryKey);
    const taxonomyCategory = getTaxonomyCategory(categoryKey);
    const rawValue = toOptionalNumber(
      safeAsset.currentValue !== undefined
        ? safeAsset.currentValue
        : safeAsset.rawValue !== undefined
          ? safeAsset.rawValue
          : safeAsset.value
    );

    return {
      assetId:
        normalizeString(safeAsset.assetId) ||
        categoryKey ||
        `asset-${Number.isInteger(index) ? index + 1 : 1}`,
      categoryKey,
      typeKey: normalizeString(safeAsset.typeKey) || null,
      label: normalizeString(safeAsset.label) || (taxonomyCategory && taxonomyCategory.label) || categoryKey || "Asset",
      group: normalizeString(safeAsset.group) || (taxonomyCategory && taxonomyCategory.group) || null,
      rawValue,
      source: normalizeString(safeAsset.source) || null,
      isDefaultAsset: safeAsset.isDefaultAsset === true,
      isCustomAsset: safeAsset.isCustomAsset === true,
      hasPmiSource: safeAsset.hasPmiSource === true,
      sourceKey: normalizeString(safeAsset.sourceKey) || null,
      legacySourceKeys: Array.isArray(safeAsset.legacySourceKeys)
        ? safeAsset.legacySourceKeys.slice()
        : [],
      notes: normalizeString(safeAsset.notes) || null,
      metadata: isPlainObject(safeAsset.metadata) ? Object.assign({}, safeAsset.metadata) : {},
    };
  }

  function calculateTreatedAssetValue(asset, treatment, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const normalizedAsset = normalizeAssetFact(asset, safeOptions.index);
    const normalizedTreatment = normalizeTreatmentConfig(treatment, {
      fallback: SAFE_EXCLUDED_TREATMENT,
      source: treatment && treatment.source,
      sourceKey: treatment && treatment.sourceKey,
    });
    const warnings = [];

    if (!normalizedAsset.categoryKey) {
      warnings.push(
        createWarning("missing-asset-category", "Asset is missing a category key.", {
          assetId: normalizedAsset.assetId,
        })
      );
    }

    if (normalizedAsset.rawValue === null || normalizedAsset.rawValue < 0) {
      warnings.push(
        createWarning("invalid-asset-value", "Asset currentValue is missing or invalid.", {
          assetId: normalizedAsset.assetId,
          categoryKey: normalizedAsset.categoryKey,
        })
      );
    }

    const rawValue = normalizedAsset.rawValue === null ? 0 : Math.max(0, normalizedAsset.rawValue);
    const include = normalizedTreatment.include === true && warnings.every((warning) => warning.code !== "invalid-asset-value");
    const taxDragPercent = normalizedTreatment.taxDragPercent;
    const liquidityDiscountPercent = normalizedTreatment.liquidityHaircutPercent;
    const planningDiscountPercent = 0;
    const afterTaxValue = include ? rawValue * (1 - taxDragPercent / 100) : 0;
    const treatedValue = include ? afterTaxValue * (1 - liquidityDiscountPercent / 100) : 0;

    return {
      asset: {
        assetId: normalizedAsset.assetId,
        categoryKey: normalizedAsset.categoryKey,
        typeKey: normalizedAsset.typeKey,
        label: normalizedAsset.label,
        rawValue: roundMoney(rawValue),
        include,
        taxDragPercent,
        liquidityDiscountPercent,
        planningDiscountPercent,
        treatedValue: roundMoney(treatedValue),
        source: normalizedAsset.source,
        isDefaultAsset: normalizedAsset.isDefaultAsset,
        isCustomAsset: normalizedAsset.isCustomAsset,
        hasPmiSource: normalizedAsset.hasPmiSource,
        warnings,
        trace: {
          group: normalizedAsset.group,
          typeKey: normalizedAsset.typeKey,
          isDefaultAsset: normalizedAsset.isDefaultAsset,
          isCustomAsset: normalizedAsset.isCustomAsset,
          sourceKey: normalizedAsset.sourceKey,
          legacySourceKeys: normalizedAsset.legacySourceKeys,
          treatmentSource: normalizedTreatment.source,
          treatmentSourceKey: normalizedTreatment.sourceKey,
          treatmentPreset: normalizedTreatment.treatmentPreset,
          taxTreatment: normalizedTreatment.taxTreatment,
          afterTaxValue: roundMoney(afterTaxValue),
          formula:
            "rawValue * (1 - taxDragPercent / 100) * (1 - liquidityDiscountPercent / 100)",
          planningDiscountNote:
            "No separate planning discount field exists yet; liquidityDiscountPercent uses the saved liquidityHaircutPercent.",
          notes: normalizedAsset.notes,
          metadata: normalizedAsset.metadata,
        },
      },
      warnings,
    };
  }

  function calculateAssetTreatment(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const assetFacts = isPlainObject(safeInput.assetFacts) ? safeInput.assetFacts : {};
    const normalizedAssumptions = normalizeAssetTreatmentAssumptions(
      safeInput.assetTreatmentAssumptions
    );
    const sourceAssets = Array.isArray(assetFacts.assets) ? assetFacts.assets : [];
    const warnings = [];
    const trace = [];

    if (!Array.isArray(assetFacts.assets)) {
      warnings.push(
        createWarning("missing-asset-facts", "assetFacts.assets is missing or not an array.")
      );
    }

    if (!normalizedAssumptions.enabled) {
      warnings.push(
        createWarning(
          "asset-treatment-assumptions-disabled",
          "Asset Treatment assumptions are not marked enabled; values are calculated for preview/helper use only."
        )
      );
    }

    const assets = sourceAssets.map((asset, index) => {
      const normalizedAsset = normalizeAssetFact(asset, index);
      const savedTreatment = getAssetTreatmentForCategory(
        normalizedAsset.categoryKey,
        normalizedAssumptions
      );
      let treatment = savedTreatment;

      if (!treatment) {
        const defaultTreatment = getDefaultTreatmentForCategory(normalizedAsset.categoryKey);
        treatment = defaultTreatment.treatment;
        warnings.push(
          createWarning(
            "missing-asset-treatment-assumption",
            "No saved asset treatment assumption was found for this category; a conservative default was used.",
            {
              assetId: normalizedAsset.assetId,
              categoryKey: normalizedAsset.categoryKey,
              defaultSource: treatment.source,
              defaultTreatmentBias: defaultTreatment.bias,
            }
          )
        );
      }

      const calculated = calculateTreatedAssetValue(normalizedAsset, treatment, { index });
      warnings.push(...calculated.warnings);
      trace.push({
        assetId: calculated.asset.assetId,
        categoryKey: calculated.asset.categoryKey,
        typeKey: calculated.asset.typeKey,
        isDefaultAsset: calculated.asset.isDefaultAsset,
        isCustomAsset: calculated.asset.isCustomAsset,
        treatmentSource: calculated.asset.trace.treatmentSource,
        treatmentSourceKey: calculated.asset.trace.treatmentSourceKey,
        treatedValue: calculated.asset.treatedValue,
      });
      return calculated.asset;
    });

    const totals = assets.reduce(
      (summary, asset) => {
        summary.totalRawAssetValue += asset.rawValue;
        if (asset.include) {
          summary.totalIncludedRawValue += asset.rawValue;
          summary.totalTreatedAssetValue += asset.treatedValue;
        } else {
          summary.excludedAssetValue += asset.rawValue;
        }
        return summary;
      },
      {
        totalRawAssetValue: 0,
        totalIncludedRawValue: 0,
        totalTreatedAssetValue: 0,
        excludedAssetValue: 0,
      }
    );

    return {
      assets,
      totalRawAssetValue: roundMoney(totals.totalRawAssetValue),
      totalIncludedRawValue: roundMoney(totals.totalIncludedRawValue),
      totalTreatedAssetValue: roundMoney(totals.totalTreatedAssetValue),
      excludedAssetValue: roundMoney(totals.excludedAssetValue),
      warnings,
      trace,
      metadata: {
        source: "asset-treatment-calculations",
        calculationVersion: CALCULATION_VERSION,
        assumptionsEnabled: normalizedAssumptions.enabled,
        assumptionsSource: normalizedAssumptions.source,
        defaultProfile: normalizedAssumptions.defaultProfile,
        assetCount: assets.length,
        taxonomySource: getTaxonomyCategories().length ? "asset-taxonomy" : "unavailable",
      },
    };
  }

  lensAnalysis.calculateAssetTreatment = calculateAssetTreatment;
  lensAnalysis.normalizeAssetTreatmentAssumptions = normalizeAssetTreatmentAssumptions;
  lensAnalysis.getAssetTreatmentForCategory = getAssetTreatmentForCategory;
  lensAnalysis.calculateTreatedAssetValue = calculateTreatedAssetValue;
})(window);
