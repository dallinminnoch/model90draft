(function (global) {
  const root = global.LensApp = global.LensApp || {};
  const lensAnalysis = root.lensAnalysis = root.lensAnalysis || {};

  const VERSION = "income-impact-resource-bucket-adapter-v1";
  const SOURCE = "income-impact-resource-bucket-adapter";

  const BUCKET_FAMILIES = Object.freeze({
    cash: "cash",
    emergencyFund: "emergencyFund",
    taxableInvestments: "taxableInvestments",
    educationSavings: "educationSavings",
    retirementAssets: "retirementAssets",
    homeEquity: "homeEquity",
    otherLiquid: "otherLiquid",
    otherIlliquid: "otherIlliquid",
    businessAssets: "businessAssets",
    unknown: "unknown"
  });

  const EVIDENCE_LEVELS = Object.freeze({
    traceBacked: "trace-backed",
    assumptionBacked: "assumption-backed"
  });

  const CATEGORY_TO_FAMILY = Object.freeze({
    cashAndCashEquivalents: BUCKET_FAMILIES.cash,
    emergencyFund: BUCKET_FAMILIES.emergencyFund,
    taxableBrokerageInvestments: BUCKET_FAMILIES.taxableInvestments,
    traditionalRetirementAssets: BUCKET_FAMILIES.retirementAssets,
    rothTaxAdvantagedRetirementAssets: BUCKET_FAMILIES.retirementAssets,
    qualifiedAnnuities: BUCKET_FAMILIES.retirementAssets,
    educationSpecificSavings: BUCKET_FAMILIES.educationSavings,
    primaryResidenceEquity: BUCKET_FAMILIES.homeEquity,
    otherRealEstateEquity: BUCKET_FAMILIES.homeEquity,
    businessPrivateCompanyValue: BUCKET_FAMILIES.businessAssets,
    trustRestrictedAssets: BUCKET_FAMILIES.otherIlliquid,
    stockCompensationDeferredCompensation: BUCKET_FAMILIES.otherIlliquid,
    digitalAssetsCrypto: BUCKET_FAMILIES.otherIlliquid,
    nonqualifiedAnnuities: BUCKET_FAMILIES.otherIlliquid,
    otherCustomAsset: BUCKET_FAMILIES.unknown
  });

  const TYPE_TO_FAMILY = Object.freeze({
    emergencyFundReserve: BUCKET_FAMILIES.emergencyFund,
    checkingAccount: BUCKET_FAMILIES.cash,
    savingsAccount: BUCKET_FAMILIES.cash,
    highYieldSavingsAccount: BUCKET_FAMILIES.cash,
    moneyMarketAccount: BUCKET_FAMILIES.cash,
    certificateOfDeposit: BUCKET_FAMILIES.cash,
    taxableBrokerageAccount: BUCKET_FAMILIES.taxableInvestments,
    mutualFundAccount: BUCKET_FAMILIES.taxableInvestments,
    individualStocks: BUCKET_FAMILIES.taxableInvestments,
    individualBonds: BUCKET_FAMILIES.taxableInvestments,
    plan529Account: BUCKET_FAMILIES.educationSavings,
    coverdellEsa: BUCKET_FAMILIES.educationSavings,
    educationSavingsAccount: BUCKET_FAMILIES.educationSavings,
    traditional401k: BUCKET_FAMILIES.retirementAssets,
    roth401k: BUCKET_FAMILIES.retirementAssets,
    traditionalIra: BUCKET_FAMILIES.retirementAssets,
    rothIra: BUCKET_FAMILIES.retirementAssets,
    sepIra: BUCKET_FAMILIES.retirementAssets,
    simpleIra: BUCKET_FAMILIES.retirementAssets,
    pensionLumpSum: BUCKET_FAMILIES.retirementAssets,
    qualifiedAnnuity: BUCKET_FAMILIES.retirementAssets,
    primaryResidenceEquity: BUCKET_FAMILIES.homeEquity,
    helocAvailableEquity: BUCKET_FAMILIES.homeEquity,
    rentalPropertyEquity: BUCKET_FAMILIES.homeEquity,
    businessOwnershipValue: BUCKET_FAMILIES.businessAssets
  });

  const REVIEW_REQUIRED_CATEGORIES = Object.freeze({
    trustRestrictedAssets: true,
    stockCompensationDeferredCompensation: true,
    digitalAssetsCrypto: true,
    nonqualifiedAnnuities: true,
    otherCustomAsset: true
  });

  const BACKEND_ONLY_CATEGORIES = Object.freeze({
    primaryResidenceEquity: true,
    otherRealEstateEquity: true
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }
    const output = {};
    Object.keys(value).forEach(function (key) {
      output[key] = clonePlainValue(value[key]);
    });
    return output;
  }

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function toOptionalNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/[$,%\s,]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function roundMoney(value) {
    const numeric = toOptionalNumber(value);
    return numeric == null ? null : Math.round(numeric * 100) / 100;
  }

  function makeWarning(id, message, sourcePath, details) {
    return {
      id,
      message,
      sourcePath: sourcePath || null,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function normalizeAssetId(asset, index) {
    return normalizeString(asset?.assetId || asset?.id || asset?.sourceKey)
      || `asset-${index + 1}`;
  }

  function buildTreatedAssetIndex(treatedAssetOffsets, warnings) {
    const source = isPlainObject(treatedAssetOffsets) ? treatedAssetOffsets : {};
    const treatedAssets = Array.isArray(source.assets) ? source.assets : [];
    const byAssetId = new Map();

    treatedAssets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        return;
      }
      const assetId = normalizeString(asset.assetId || asset.id);
      if (!assetId) {
        warnings.push(makeWarning(
          "treated-asset-missing-id",
          "A treated asset offset entry is missing assetId and could not be joined to asset facts.",
          `treatedAssetOffsets.assets[${index}]`
        ));
        return;
      }
      if (!byAssetId.has(assetId)) {
        byAssetId.set(assetId, {
          asset,
          sourcePath: `treatedAssetOffsets.assets[${index}]`,
          index
        });
      }
    });

    return {
      treatedAssets,
      byAssetId
    };
  }

  function classifyFamily(asset) {
    const categoryKey = normalizeString(asset?.categoryKey);
    const typeKey = normalizeString(asset?.typeKey);
    if (typeKey && TYPE_TO_FAMILY[typeKey]) {
      return {
        family: TYPE_TO_FAMILY[typeKey],
        source: "typeKey"
      };
    }
    if (categoryKey && CATEGORY_TO_FAMILY[categoryKey]) {
      return {
        family: CATEGORY_TO_FAMILY[categoryKey],
        source: "categoryKey"
      };
    }
    return {
      family: BUCKET_FAMILIES.unknown,
      source: categoryKey || typeKey ? "unmapped-key" : "missing-key"
    };
  }

  function getLiquidityTier(family) {
    switch (family) {
      case BUCKET_FAMILIES.cash:
      case BUCKET_FAMILIES.emergencyFund:
      case BUCKET_FAMILIES.taxableInvestments:
      case BUCKET_FAMILIES.otherLiquid:
        return "liquid";
      case BUCKET_FAMILIES.educationSavings:
      case BUCKET_FAMILIES.retirementAssets:
        return "restricted";
      case BUCKET_FAMILIES.homeEquity:
      case BUCKET_FAMILIES.businessAssets:
      case BUCKET_FAMILIES.otherIlliquid:
        return "illiquid";
      default:
        return "unknown";
    }
  }

  function resolveBucketValue(asset, treatedMatch, sourcePath, warnings) {
    if (treatedMatch) {
      const treatedAsset = treatedMatch.asset;
      const included = treatedAsset.include === true;
      if (!included) {
        warnings.push(makeWarning(
          "asset-excluded-by-treatment",
          "Asset treatment excludes this asset from spendable resource buckets.",
          treatedMatch.sourcePath,
          { assetId: normalizeString(asset.assetId), categoryKey: normalizeString(asset.categoryKey) }
        ));
        return {
          included: false,
          startingValue: 0,
          evidenceLevel: EVIDENCE_LEVELS.traceBacked,
          valueSourcePath: `${treatedMatch.sourcePath}.treatedValue`
        };
      }

      const treatedValue = roundMoney(treatedAsset.treatedValue);
      if (treatedValue == null || treatedValue <= 0) {
        warnings.push(makeWarning(
          "invalid-treated-asset-value",
          "Included treated asset is missing a positive treatedValue.",
          `${treatedMatch.sourcePath}.treatedValue`,
          { assetId: normalizeString(asset.assetId), categoryKey: normalizeString(asset.categoryKey) }
        ));
        return null;
      }

      return {
        included: true,
        startingValue: treatedValue,
        evidenceLevel: EVIDENCE_LEVELS.traceBacked,
        valueSourcePath: `${treatedMatch.sourcePath}.treatedValue`
      };
    }

    const rawValue = roundMoney(asset.currentValue ?? asset.rawValue ?? asset.value);
    warnings.push(makeWarning(
      "missing-treated-asset-overlay",
      "No treated asset offset entry was available; raw currentValue was used as an assumption-backed bucket value.",
      sourcePath,
      { assetId: normalizeString(asset.assetId), categoryKey: normalizeString(asset.categoryKey) }
    ));
    if (rawValue == null || rawValue <= 0) {
      warnings.push(makeWarning(
        "invalid-raw-asset-value",
        "Asset fact is missing a positive currentValue and was not included in resource buckets.",
        sourcePath,
        { assetId: normalizeString(asset.assetId), categoryKey: normalizeString(asset.categoryKey) }
      ));
      return null;
    }

    return {
      included: true,
      startingValue: rawValue,
      evidenceLevel: EVIDENCE_LEVELS.assumptionBacked,
      valueSourcePath: `${sourcePath}.currentValue`
    };
  }

  function buildBucketFromAsset(asset, index, treatedMatch, warnings) {
    const sourcePath = `assetFacts.assets[${index}]`;
    const assetId = normalizeAssetId(asset, index);
    const categoryKey = normalizeString(asset.categoryKey);
    const typeKey = normalizeString(asset.typeKey);
    const classification = classifyFamily(asset);
    const bucketWarnings = [];

    if (classification.family === BUCKET_FAMILIES.unknown) {
      bucketWarnings.push(makeWarning(
        "ambiguous-asset-bucket-family",
        "Asset category/type could not be safely mapped to a resource bucket family.",
        sourcePath,
        { assetId, categoryKey: categoryKey || null, typeKey: typeKey || null }
      ));
    }
    if (REVIEW_REQUIRED_CATEGORIES[categoryKey]) {
      bucketWarnings.push(makeWarning(
        "asset-bucket-review-required",
        "Asset category requires advisor review before using a more specific emotional resource label.",
        sourcePath,
        { assetId, categoryKey }
      ));
    }
    if (BACKEND_ONLY_CATEGORIES[categoryKey]) {
      bucketWarnings.push(makeWarning(
        "asset-bucket-backend-only",
        "Home-equity style assets are bucketed for backend trace only and should not activate visible storyline priority by themselves.",
        sourcePath,
        { assetId, categoryKey }
      ));
    }

    const valueResolution = resolveBucketValue(asset, treatedMatch, sourcePath, bucketWarnings);
    warnings.push.apply(warnings, bucketWarnings);
    if (!valueResolution) {
      return null;
    }

    const label = normalizeString(asset.label || asset.name) || assetId;
    return {
      id: `asset-${assetId}`,
      family: classification.family,
      label,
      startingValue: valueResolution.startingValue,
      liquidityTier: getLiquidityTier(classification.family),
      included: valueResolution.included,
      sourcePath,
      evidenceLevel: valueResolution.evidenceLevel,
      warnings: bucketWarnings,
      trace: {
        source: SOURCE,
        assetId,
        categoryKey: categoryKey || null,
        typeKey: typeKey || null,
        classificationSource: classification.source,
        valueSourcePath: valueResolution.valueSourcePath,
        treatedAssetSourcePath: treatedMatch?.sourcePath || null,
        treatedOverlayAvailable: Boolean(treatedMatch),
        treatedIncluded: treatedMatch ? treatedMatch.asset.include === true : null,
        rawValue: roundMoney(asset.currentValue ?? asset.rawValue ?? asset.value),
        treatedValue: treatedMatch ? roundMoney(treatedMatch.asset.treatedValue) : null,
        backendOnly: BACKEND_ONLY_CATEGORIES[categoryKey] === true
      }
    };
  }

  function summarizeBuckets(resourceBuckets, trace) {
    const countsByFamily = {};
    const includedByFamily = {};
    resourceBuckets.forEach(function (bucket) {
      countsByFamily[bucket.family] = (countsByFamily[bucket.family] || 0) + 1;
      if (bucket.included) {
        includedByFamily[bucket.family] = (includedByFamily[bucket.family] || 0) + 1;
      }
    });
    trace.bucketSourceSummary = {
      mode: resourceBuckets.length ? "lensModelAssetFacts" : "missing",
      totalBuckets: resourceBuckets.length,
      includedBuckets: resourceBuckets.filter(function (bucket) { return bucket.included; }).length,
      countsByFamily,
      includedByFamily
    };
  }

  function buildIncomeImpactResourceBucketsFromLensModel(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const assetFacts = isPlainObject(safeInput.assetFacts) ? safeInput.assetFacts : {};
    const warnings = [];
    const trace = {
      source: SOURCE,
      rawAssetCount: Array.isArray(assetFacts.assets) ? assetFacts.assets.length : 0,
      treatedAssetCount: Array.isArray(safeInput.treatedAssetOffsets?.assets)
        ? safeInput.treatedAssetOffsets.assets.length
        : 0,
      bucketSourceSummary: {}
    };

    if (!Array.isArray(assetFacts.assets)) {
      warnings.push(makeWarning(
        "missing-asset-facts",
        "assetFacts.assets is missing; resource buckets were not built from Lens assets.",
        "assetFacts.assets"
      ));
      summarizeBuckets([], trace);
      return {
        version: VERSION,
        resourceBuckets: [],
        warnings,
        trace
      };
    }

    const treatedIndex = buildTreatedAssetIndex(safeInput.treatedAssetOffsets, warnings);
    const matchedTreatedIds = new Set();
    const resourceBuckets = [];

    assetFacts.assets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        warnings.push(makeWarning(
          "invalid-asset-fact",
          "Asset fact entry is not an object and was skipped.",
          `assetFacts.assets[${index}]`
        ));
        return;
      }
      const assetId = normalizeAssetId(asset, index);
      const treatedMatch = treatedIndex.byAssetId.get(assetId) || null;
      if (treatedMatch) {
        matchedTreatedIds.add(assetId);
      }
      const bucket = buildBucketFromAsset(asset, index, treatedMatch, warnings);
      if (bucket) {
        resourceBuckets.push(bucket);
      }
    });

    treatedIndex.treatedAssets.forEach(function (asset, index) {
      const assetId = normalizeString(asset?.assetId || asset?.id);
      if (assetId && !matchedTreatedIds.has(assetId)) {
        warnings.push(makeWarning(
          "treated-asset-without-asset-fact",
          "A treated asset offset could not be joined to assetFacts.assets and was not bucketed.",
          `treatedAssetOffsets.assets[${index}]`,
          { assetId }
        ));
      }
    });

    summarizeBuckets(resourceBuckets, trace);

    return {
      version: VERSION,
      resourceBuckets,
      warnings,
      trace
    };
  }

  lensAnalysis.buildIncomeImpactResourceBucketsFromLensModel = buildIncomeImpactResourceBucketsFromLensModel;
  lensAnalysis.incomeImpactResourceBucketAdapterVersion = VERSION;
  lensAnalysis.incomeImpactResourceBucketAdapterFamilies = BUCKET_FAMILIES;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildIncomeImpactResourceBucketsFromLensModel,
      INCOME_IMPACT_RESOURCE_BUCKET_ADAPTER_VERSION: VERSION,
      INCOME_IMPACT_RESOURCE_BUCKET_ADAPTER_SOURCE: SOURCE,
      INCOME_IMPACT_RESOURCE_BUCKET_ADAPTER_FAMILIES: BUCKET_FAMILIES
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
