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

  function normalizeFrequency(value) {
    const compact = normalizeString(value).replace(/[\s_-]+/g, "").toLowerCase();
    if (!compact) {
      return "monthly";
    }

    if (compact === "onetime" || compact === "oneoff") {
      return "oneTime";
    }

    if (compact === "semiannual" || compact === "semiannually" || compact === "semiannualy") {
      return "semiAnnual";
    }

    if (compact === "biweekly" || compact === "everytwoweeks") {
      return "biweekly";
    }

    if (compact === "weekly" || compact === "monthly" || compact === "quarterly" || compact === "annual") {
      return compact;
    }

    if (compact === "annually" || compact === "yearly") {
      return "annual";
    }

    return compact;
  }

  function toMonthlyContributionAmount(amount, frequency) {
    const numericAmount = toOptionalNumber(amount);
    if (numericAmount === null || numericAmount <= 0) {
      return null;
    }

    const normalizedFrequency = normalizeFrequency(frequency);
    const monthlyFactors = {
      weekly: 52 / 12,
      biweekly: 26 / 12,
      monthly: 1,
      quarterly: 1 / 3,
      semiAnnual: 1 / 6,
      annual: 1 / 12
    };

    if (normalizedFrequency === "oneTime") {
      return null;
    }

    const factor = monthlyFactors[normalizedFrequency];
    return Number.isFinite(factor) ? numericAmount * factor : null;
  }

  function calculateFutureMonthlyContributionValue(monthlyContributionAmount, annualGrowthRatePercent, projectionYears) {
    const monthlyContribution = Number(monthlyContributionAmount);
    const years = Number(projectionYears);
    if (!Number.isFinite(monthlyContribution) || monthlyContribution <= 0 || !Number.isFinite(years) || years <= 0) {
      return 0;
    }

    const totalMonths = years * 12;
    const annualRate = Math.max(0, Number(annualGrowthRatePercent) || 0) / 100;
    if (annualRate === 0) {
      return monthlyContribution * totalMonths;
    }

    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
      return monthlyContribution * totalMonths;
    }

    return monthlyContribution * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate);
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

  function getDefaultGrowthProfile(assetTreatmentAssumptions) {
    const profile = normalizeString(assetTreatmentAssumptions?.defaultProfile);
    return profile || "balanced";
  }

  function getDefaultGrowthAssumptionForCategory(assetTaxonomy, assetTreatmentAssumptions, categoryKey) {
    const category = getCategoryByKey(assetTaxonomy, categoryKey);
    const profile = getDefaultGrowthProfile(assetTreatmentAssumptions);
    const defaults = isPlainObject(category?.growthDefaults) ? category.growthDefaults : {};
    const profileDefault = isPlainObject(defaults[profile])
      ? defaults[profile]
      : defaults.balanced;

    if (!isPlainObject(profileDefault)) {
      return null;
    }

    return {
      assumedAnnualGrowthRatePercent: profileDefault.assumedAnnualGrowthRatePercent,
      assumedAnnualGrowthRateSource: "asset-taxonomy-default",
      assumedAnnualGrowthRateProfile: profile,
      growthConsumptionStatus: SAVED_ONLY_CONSUMPTION_STATUS,
      defaultedFromTaxonomy: true
    };
  }

  function getSavingsContributionRecords(input) {
    if (Array.isArray(input?.savingsContributionRecords)) {
      return input.savingsContributionRecords;
    }

    if (Array.isArray(input?.savingsHabitRecords)) {
      return input.savingsHabitRecords;
    }

    return [];
  }

  function getSavingsContributionMapping(input, record) {
    const mappings = isPlainObject(input?.savingsContributionMappings)
      ? input.savingsContributionMappings
      : {};
    const typeKey = normalizeString(record?.typeKey || record?.libraryEntryKey);
    return isPlainObject(mappings[typeKey]) ? mappings[typeKey] : null;
  }

  function aggregateSavingsContributions(input, assetTaxonomy) {
    const categories = new Map();
    const excludedContributionRecords = [];

    getSavingsContributionRecords(input).forEach(function (record, index) {
      if (!isPlainObject(record)) {
        excludedContributionRecords.push({
          sourceIndex: index,
          typeKey: null,
          label: "Invalid savings contribution",
          reason: "Savings contribution record is invalid.",
          warningCode: "invalid-savings-contribution-record"
        });
        return;
      }

      const mapping = getSavingsContributionMapping(input, record);
      const typeKey = normalizeString(record.typeKey || record.libraryEntryKey);
      const label = normalizeString(record.label) || typeKey || "Savings contribution";
      const monthlyContributionAmount = toMonthlyContributionAmount(record.amount, record.frequency);
      const targetAssetCategoryKey = normalizeString(
        record.targetAssetCategoryKey
        || record.assetCategoryKey
        || mapping?.targetAssetCategoryKey
        || mapping?.assetCategoryKey
        || mapping?.categoryKey
      );
      const targetAssetTypeKey = normalizeString(
        record.targetAssetTypeKey
        || record.assetTypeKey
        || mapping?.targetAssetTypeKey
        || mapping?.assetTypeKey
      ) || null;

      if (monthlyContributionAmount === null) {
        excludedContributionRecords.push({
          sourceIndex: index,
          typeKey,
          label,
          reason: "Savings contribution record is missing a positive recurring amount.",
          warningCode: "missing-positive-savings-contribution-amount"
        });
        return;
      }

      if (!targetAssetCategoryKey) {
        excludedContributionRecords.push({
          sourceIndex: index,
          typeKey,
          label,
          monthlyContributionAmount: roundMoney(monthlyContributionAmount),
          reason: "Savings contribution record is missing a target asset category.",
          warningCode: "missing-savings-contribution-target-asset-category"
        });
        return;
      }

      const category = getCategoryByKey(assetTaxonomy, targetAssetCategoryKey);
      if (!category) {
        excludedContributionRecords.push({
          sourceIndex: index,
          typeKey,
          label,
          targetAssetCategoryKey,
          monthlyContributionAmount: roundMoney(monthlyContributionAmount),
          reason: "Savings contribution target asset category is not recognized.",
          warningCode: "invalid-savings-contribution-target-asset-category"
        });
        return;
      }

      const existing = categories.get(targetAssetCategoryKey) || {
        categoryKey: targetAssetCategoryKey,
        label: normalizeString(category.label) || targetAssetCategoryKey,
        monthlyContributionAmount: 0,
        contributionRecordCount: 0,
        sourceRecords: []
      };
      existing.monthlyContributionAmount += monthlyContributionAmount;
      existing.contributionRecordCount += 1;
      existing.sourceRecords.push({
        sourceIndex: index,
        typeKey,
        label,
        targetAssetTypeKey,
        monthlyContributionAmount: roundMoney(monthlyContributionAmount),
        frequency: normalizeFrequency(record.frequency),
        mappingSource: record.targetAssetCategoryKey || record.assetCategoryKey
          ? "record"
          : (mapping ? "mapping" : "none")
      });
      categories.set(targetAssetCategoryKey, existing);
    });

    return {
      contributionCategories: Array.from(categories.values()),
      excludedContributionRecords
    };
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

  function projectAssetCategory(categoryCandidate, input, projectionYears, resultWarnings, contributionCandidate) {
    const categoryKey = categoryCandidate.categoryKey;
    const category = getCategoryByKey(input.assetTaxonomy, categoryKey);
    const savedAssumption = getAssumptionForCategory(input.assetTreatmentAssumptions, categoryKey);
    const contributionHasAmount = (toOptionalNumber(contributionCandidate?.monthlyContributionAmount) || 0) > 0;
    const defaultAssumption = !savedAssumption && contributionHasAmount
      ? getDefaultGrowthAssumptionForCategory(input.assetTaxonomy, input.assetTreatmentAssumptions, categoryKey)
      : null;
    const assumption = savedAssumption || defaultAssumption;
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
    const projectedCurrentAssetValue = currentValue * growthFactor;
    const monthlyContributionAmount = Math.max(0, toOptionalNumber(contributionCandidate?.monthlyContributionAmount) || 0);
    const contributionPrincipal = monthlyContributionAmount * projectionYears * 12;
    const projectedContributionValue = calculateFutureMonthlyContributionValue(
      monthlyContributionAmount,
      rate.value,
      projectionYears
    );
    const projectedValue = projectedCurrentAssetValue + projectedContributionValue;
    const warnings = categoryWarnings.concat(reviewWarnings);

    if (defaultAssumption) {
      warnings.push(createWarning(
        "missing-asset-growth-assumption-defaulted",
        "No saved asset growth assumption exists for this savings contribution target; taxonomy defaults were used for contribution allocation.",
        {
          categoryKey,
          assumedAnnualGrowthRateProfile: defaultAssumption.assumedAnnualGrowthRateProfile
        }
      ));
    }

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
        projectedCurrentAssetValue: roundMoney(projectedCurrentAssetValue),
        monthlyContributionAmount: roundMoney(monthlyContributionAmount),
        contributionRecordCount: contributionCandidate?.contributionRecordCount || 0,
        contributionPrincipal: roundMoney(contributionPrincipal),
        projectedContributionValue: roundMoney(projectedContributionValue),
        contributionGrowthAmount: roundMoney(projectedContributionValue - contributionPrincipal),
        contributionSourceRecords: Array.isArray(contributionCandidate?.sourceRecords)
          ? contributionCandidate.sourceRecords.slice()
          : [],
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
    const hasAssetFacts = isPlainObject(safeInput.assetFacts) && Array.isArray(safeInput.assetFacts.assets);
    if (!hasAssetFacts) {
      warnings.push(createWarning(
        "missing-asset-facts",
        "assetFacts.assets is missing; asset growth projection used savings contribution records only."
      ));
    }
    const aggregated = aggregateAssetFacts(
      hasAssetFacts ? safeInput.assetFacts : { assets: [] },
      safeInput.assetTaxonomy
    );
    const contributionAggregation = aggregateSavingsContributions(safeInput, safeInput.assetTaxonomy);
    const contributionCategories = new Map();
    contributionAggregation.contributionCategories.forEach(function (category) {
      contributionCategories.set(category.categoryKey, category);
    });
    const contributionOnlyCategories = contributionAggregation.contributionCategories.filter(function (category) {
      return !aggregated.includedCandidateCategories.some(function (assetCategory) {
        return assetCategory.categoryKey === category.categoryKey;
      });
    });
    const includedCategories = [];
    const excludedCategories = aggregated.excludedCategories.slice();

    aggregated.includedCandidateCategories.concat(contributionOnlyCategories.map(function (category) {
      return {
        categoryKey: category.categoryKey,
        label: category.label,
        currentValue: 0,
        sourceAssetCount: 0
      };
    })).forEach(function (categoryCandidate) {
      const projectedCategory = projectAssetCategory(
        categoryCandidate,
        safeInput,
        projectionYears,
        warnings,
        contributionCategories.get(categoryCandidate.categoryKey)
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
    const totalMonthlyContributionAmount = includedCategories.reduce(function (total, category) {
      return total + category.monthlyContributionAmount;
    }, 0);
    const totalContributionPrincipal = includedCategories.reduce(function (total, category) {
      return total + category.contributionPrincipal;
    }, 0);
    const totalProjectedContributionValue = includedCategories.reduce(function (total, category) {
      return total + category.projectedContributionValue;
    }, 0);
    const totalContributionGrowthAmount = includedCategories.reduce(function (total, category) {
      return total + category.contributionGrowthAmount;
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
      totalMonthlyContributionAmount: roundMoney(totalMonthlyContributionAmount),
      totalContributionPrincipal: roundMoney(totalContributionPrincipal),
      totalProjectedContributionValue: roundMoney(totalProjectedContributionValue),
      totalContributionGrowthAmount: roundMoney(totalContributionGrowthAmount),
      includedCategoryCount: includedCategories.length,
      excludedCategoryCount: excludedCategories.length,
      excludedContributionRecordCount: contributionAggregation.excludedContributionRecords.length,
      reviewWarningCount,
      includedCategories,
      excludedCategories,
      excludedContributionRecords: contributionAggregation.excludedContributionRecords,
      warnings,
      valuationDate: normalizeString(safeInput.valuationDate) || null,
      valuationDateSource: normalizeString(safeInput.valuationDateSource) || null,
      consumedByMethods: false
    };
  }

  lensAnalysis.calculateAssetGrowthProjection = calculateAssetGrowthProjection;
})(typeof window !== "undefined" ? window : globalThis);
