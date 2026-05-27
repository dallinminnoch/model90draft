(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis savings contribution facts.
  // Purpose: canonicalize saved PMI savings habits into traceable contribution
  // facts without changing the saved PMI record shape.
  // Non-goals: no DOM access, no storage writes, no budget-widget behavior, no
  // coverage math, and no graph/layout rendering.

  const SOURCE = "savings-contribution-facts";
  const CALCULATION_VERSION = 1;
  const SAVINGS_HABIT_CATEGORY_KEY = "savingsGoalContributions";

  const DEFAULT_TARGET_ASSET_CATEGORIES = Object.freeze({
    retirementContributions: "traditionalRetirementAssets",
    brokerageInvestmentContributions: "taxableBrokerageInvestments",
    educationSavingsContributions: "educationSpecificSavings",
    emergencyFundContributions: "emergencyFund",
    sinkingFundContributions: "cashAndCashEquivalents",
    vacationLifestyleGoalContributions: "cashAndCashEquivalents",
    vehicleReplacementContributions: "cashAndCashEquivalents",
    homeRepairReserveContributions: "cashAndCashEquivalents",
    taxReserveContributions: "cashAndCashEquivalents",
    businessReserveContributions: "cashAndCashEquivalents",
    charitableGivingReserve: "cashAndCashEquivalents",
    familyEventWeddingSavings: "cashAndCashEquivalents",
    downPaymentSavings: "cashAndCashEquivalents",
    otherGoalSavings: "cashAndCashEquivalents"
  });

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

  function toOptionalNonNegativeNumber(value) {
    const parsed = toOptionalNumber(value);
    return parsed == null || parsed < 0 ? null : parsed;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function normalizeFrequency(value) {
    const normalized = normalizeString(value);
    const compact = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (compact === "onetime" || compact === "once") {
      return "oneTime";
    }
    if (compact === "weekly") {
      return "weekly";
    }
    if (compact === "biweekly" || compact === "everytwoweeks") {
      return "biweekly";
    }
    if (compact === "quarterly") {
      return "quarterly";
    }
    if (compact === "semiannual" || compact === "semiannually" || compact === "twiceyearly") {
      return "semiAnnual";
    }
    if (compact === "annual" || compact === "annually" || compact === "yearly") {
      return "annual";
    }
    return compact === "monthly" ? "monthly" : (normalized || "monthly");
  }

  function toMonthlyAmount(amount, frequency) {
    const numericAmount = toOptionalNonNegativeNumber(amount);
    if (numericAmount == null) {
      return null;
    }

    const factors = {
      weekly: 52 / 12,
      biweekly: 26 / 12,
      monthly: 1,
      quarterly: 1 / 3,
      semiAnnual: 1 / 6,
      annual: 1 / 12
    };
    const normalizedFrequency = normalizeFrequency(frequency);
    if (normalizedFrequency === "oneTime") {
      return null;
    }

    const factor = factors[normalizedFrequency];
    return Number.isFinite(factor) ? roundMoney(numericAmount * factor) : null;
  }

  function createWarning(code, message, details) {
    return {
      code,
      message,
      ...(details && typeof details === "object" ? { details } : {})
    };
  }

  function getAssetTaxonomyCategories(assetTaxonomy) {
    const safeTaxonomy = isPlainObject(assetTaxonomy) ? assetTaxonomy : lensAnalysis.assetTaxonomy;
    if (Array.isArray(safeTaxonomy?.categories)) {
      return safeTaxonomy.categories;
    }
    if (Array.isArray(safeTaxonomy?.DEFAULT_ASSET_CATEGORIES)) {
      return safeTaxonomy.DEFAULT_ASSET_CATEGORIES;
    }
    return [];
  }

  function getAssetTaxonomyCategory(assetTaxonomy, categoryKey) {
    const normalizedKey = normalizeString(categoryKey);
    if (!normalizedKey) {
      return null;
    }
    return getAssetTaxonomyCategories(assetTaxonomy).find(function (category) {
      return normalizeString(category?.categoryKey || category?.key) === normalizedKey;
    }) || null;
  }

  function getAssetCategoryLabel(assetTaxonomy, categoryKey) {
    const category = getAssetTaxonomyCategory(assetTaxonomy, categoryKey);
    return normalizeString(category?.label) || normalizeString(categoryKey);
  }

  function getSourceRecords(input) {
    if (Array.isArray(input)) {
      return {
        records: input,
        baseSourcePath: "savingsHabitRecords"
      };
    }

    const safeInput = isPlainObject(input) ? input : {};
    if (Array.isArray(safeInput.savingsContributionFacts)) {
      return {
        records: safeInput.savingsContributionFacts,
        baseSourcePath: "savingsContributionFacts"
      };
    }
    if (Array.isArray(safeInput.savingsContributionRecords)) {
      return {
        records: safeInput.savingsContributionRecords,
        baseSourcePath: "savingsContributionRecords"
      };
    }
    if (Array.isArray(safeInput.savingsHabitRecords)) {
      return {
        records: safeInput.savingsHabitRecords,
        baseSourcePath: "savingsHabitRecords"
      };
    }

    return {
      records: [],
      baseSourcePath: "savingsHabitRecords"
    };
  }

  function resolveTargetAssetCategoryKey(record) {
    const typeKey = normalizeString(record?.typeKey || record?.libraryEntryKey || record?.contributionType);
    const explicit = normalizeString(record?.targetAssetCategoryKey || record?.assetCategoryKey);
    if (explicit) {
      return {
        targetAssetCategoryKey: explicit,
        targetMappingSource: "record"
      };
    }

    const fallback = DEFAULT_TARGET_ASSET_CATEGORIES[typeKey];
    return {
      targetAssetCategoryKey: fallback || "",
      targetMappingSource: fallback ? "type-default" : "missing"
    };
  }

  function normalizeSavingsContributionFacts(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const assetTaxonomy = safeInput.assetTaxonomy || lensAnalysis.assetTaxonomy;
    const source = getSourceRecords(input);
    const facts = [];
    const excludedFacts = [];
    const warnings = [];

    source.records.forEach(function (record, index) {
      const sourcePath = normalizeString(record?.sourcePath) || `${source.baseSourcePath}.${index}`;
      if (!isPlainObject(record)) {
        const warning = createWarning(
          "invalid-savings-contribution-record",
          "Savings contribution record is invalid.",
          { sourcePath }
        );
        warnings.push(warning);
        excludedFacts.push({
          sourcePath,
          reason: warning.message,
          warningCode: warning.code
        });
        return;
      }

      const typeKey = normalizeString(record.typeKey || record.libraryEntryKey || record.contributionType);
      const categoryKey = normalizeString(record.categoryKey) || SAVINGS_HABIT_CATEGORY_KEY;
      const label = normalizeString(record.label) || typeKey || "Savings contribution";
      const frequency = normalizeFrequency(record.frequency);
      const amount = toOptionalNonNegativeNumber(record.amount ?? record.contributionAmount);
      const monthlyAmount = toOptionalNonNegativeNumber(record.monthlyAmount ?? record.monthlyContributionAmount)
        ?? toMonthlyAmount(amount, frequency);
      const annualAmount = monthlyAmount == null ? null : roundMoney(monthlyAmount * 12);
      const targetResolution = resolveTargetAssetCategoryKey(record);
      const targetAssetCategoryKey = targetResolution.targetAssetCategoryKey;
      const targetCategory = getAssetTaxonomyCategory(assetTaxonomy, targetAssetCategoryKey);
      const factWarnings = [];

      if (monthlyAmount == null || monthlyAmount <= 0) {
        const warning = createWarning(
          "missing-positive-savings-contribution-amount",
          "Savings contribution record is missing a positive recurring amount.",
          { sourcePath, typeKey: typeKey || null }
        );
        warnings.push(warning);
        excludedFacts.push({
          sourcePath,
          sourceRecordId: normalizeString(record.expenseId || record.id) || null,
          typeKey: typeKey || null,
          label,
          reason: warning.message,
          warningCode: warning.code
        });
        return;
      }

      if (!targetAssetCategoryKey) {
        const warning = createWarning(
          "missing-savings-contribution-target-asset-category",
          "Savings contribution record is missing a target asset category.",
          { sourcePath, typeKey: typeKey || null }
        );
        warnings.push(warning);
        excludedFacts.push({
          sourcePath,
          sourceRecordId: normalizeString(record.expenseId || record.id) || null,
          typeKey: typeKey || null,
          label,
          monthlyAmount,
          annualAmount,
          reason: warning.message,
          warningCode: warning.code
        });
        return;
      }

      if (getAssetTaxonomyCategories(assetTaxonomy).length && !targetCategory) {
        const warning = createWarning(
          "invalid-savings-contribution-target-asset-category",
          "Savings contribution target asset category is not recognized.",
          { sourcePath, typeKey: typeKey || null, targetAssetCategoryKey }
        );
        warnings.push(warning);
        excludedFacts.push({
          sourcePath,
          sourceRecordId: normalizeString(record.expenseId || record.id) || null,
          typeKey: typeKey || null,
          label,
          targetAssetCategoryKey,
          monthlyAmount,
          annualAmount,
          reason: warning.message,
          warningCode: warning.code
        });
        return;
      }

      const sourceRecordId = normalizeString(record.sourceRecordId || record.expenseId || record.id)
        || `savings_contribution_${index + 1}`;
      facts.push({
        id: `savings_contribution_fact_${index + 1}`,
        sourceRecordId,
        sourcePath,
        label,
        amount,
        frequency,
        monthlyAmount,
        monthlyContributionAmount: monthlyAmount,
        annualAmount,
        annualContributionAmount: annualAmount,
        termType: normalizeString(record.termType) || "ongoing",
        termYears: toOptionalNonNegativeNumber(record.termYears),
        endAge: toOptionalNonNegativeNumber(record.endAge),
        endDate: normalizeString(record.endDate) || null,
        continuationStatus: normalizeString(record.continuationStatus) || null,
        targetAssetCategoryKey,
        targetAssetCategoryLabel: normalizeString(record.targetAssetCategoryLabel)
          || getAssetCategoryLabel(assetTaxonomy, targetAssetCategoryKey),
        contributionType: typeKey || null,
        typeKey: typeKey || null,
        categoryKey,
        source: SOURCE,
        warnings: factWarnings,
        trace: {
          source: source.baseSourcePath,
          sourcePath,
          targetMappingSource: targetResolution.targetMappingSource,
          canonicalDestination: "savingsContributionFacts.facts"
        }
      });
    });

    const totalMonthlyAmount = facts.reduce(function (total, fact) {
      return total + fact.monthlyAmount;
    }, 0);
    const totalAnnualAmount = facts.reduce(function (total, fact) {
      return total + fact.annualAmount;
    }, 0);

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      facts,
      excludedFacts,
      warnings,
      totalMonthlyAmount: roundMoney(totalMonthlyAmount),
      totalAnnualAmount: roundMoney(totalAnnualAmount),
      sourceRecordCount: source.records.length,
      acceptedFactCount: facts.length,
      excludedFactCount: excludedFacts.length,
      metadata: {
        sourceShape: source.baseSourcePath,
        savedDataShapeChanged: false
      }
    };
  }

  function mapSavingsContributionsToAssetCategories(input) {
    const normalized = normalizeSavingsContributionFacts(input);
    const categoriesByKey = new Map();

    normalized.facts.forEach(function (fact) {
      const existing = categoriesByKey.get(fact.targetAssetCategoryKey) || {
        categoryKey: fact.targetAssetCategoryKey,
        label: fact.targetAssetCategoryLabel,
        monthlyAmount: 0,
        annualAmount: 0,
        contributionFactCount: 0,
        sourceRecordIds: [],
        sourcePaths: [],
        facts: []
      };
      existing.monthlyAmount = roundMoney(existing.monthlyAmount + fact.monthlyAmount);
      existing.annualAmount = roundMoney(existing.annualAmount + fact.annualAmount);
      existing.contributionFactCount += 1;
      existing.sourceRecordIds.push(fact.sourceRecordId);
      existing.sourcePaths.push(fact.sourcePath);
      existing.facts.push(fact);
      categoriesByKey.set(fact.targetAssetCategoryKey, existing);
    });

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      categories: Array.from(categoriesByKey.values()).map(function (category) {
        return {
          ...category,
          sourceRecordIds: category.sourceRecordIds.filter(function (value, index, values) {
            return value && values.indexOf(value) === index;
          }),
          sourcePaths: category.sourcePaths.filter(function (value, index, values) {
            return value && values.indexOf(value) === index;
          })
        };
      }),
      facts: normalized.facts,
      excludedFacts: normalized.excludedFacts,
      warnings: normalized.warnings,
      totalMonthlyAmount: normalized.totalMonthlyAmount,
      totalAnnualAmount: normalized.totalAnnualAmount,
      metadata: normalized.metadata
    };
  }

  lensAnalysis.savingsContributionFacts = {
    DEFAULT_TARGET_ASSET_CATEGORIES,
    normalizeSavingsContributionFacts,
    mapSavingsContributionsToAssetCategories
  };
  lensAnalysis.normalizeSavingsContributionFacts = normalizeSavingsContributionFacts;
  lensAnalysis.mapSavingsContributionsToAssetCategories = mapSavingsContributionsToAssetCategories;
})(typeof window !== "undefined" ? window : globalThis);
