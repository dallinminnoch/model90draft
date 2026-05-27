(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const SOURCE = "savings-resource-allocation-adapter";
  const CALCULATION_VERSION = 1;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    const normalized = String(value).replace(/[$,%\s,]/g, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function roundMoney(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : 0;
  }

  function roundRate(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(10)) : null;
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

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(function (value) {
        return normalizeString(value);
      })
      .filter(Boolean)));
  }

  function createWarning(code, message, details) {
    return {
      code,
      message,
      ...(isPlainObject(details) ? { details: clonePlainValue(details) } : {})
    };
  }

  function getSavingsContributionFacts(input) {
    const facts = input?.savingsContributionFacts;
    if (Array.isArray(facts)) {
      return facts;
    }
    if (Array.isArray(facts?.facts)) {
      return facts.facts;
    }
    return [];
  }

  function getProjectedCategories(input) {
    const categories = input?.projectedAssetGrowth?.includedCategories;
    return Array.isArray(categories) ? categories : [];
  }

  function getAssetFacts(input) {
    const assets = input?.assetFacts?.assets;
    return Array.isArray(assets) ? assets : [];
  }

  function getCurrentAssetValue(input, categoryKey, projectedCategory) {
    const projectedValue = toOptionalNumber(projectedCategory?.currentValue);
    if (projectedValue != null) {
      return roundMoney(projectedValue);
    }
    return roundMoney(getAssetFacts(input).reduce(function (total, asset) {
      const assetCategoryKey = normalizeString(asset?.categoryKey || asset?.assetCategoryKey);
      if (assetCategoryKey !== categoryKey) {
        return total;
      }
      return total + (toOptionalNumber(asset?.currentValue ?? asset?.value ?? asset?.amount) || 0);
    }, 0));
  }

  function getFactIndexes(facts) {
    const bySourceRecordId = new Map();
    const bySourcePath = new Map();
    const byTypeAndLabel = new Map();

    facts.forEach(function (fact, index) {
      if (!isPlainObject(fact)) {
        return;
      }
      const sourceRecordId = normalizeString(fact.sourceRecordId || fact.expenseId || fact.id);
      const sourcePath = normalizeString(fact.sourcePath);
      const typeAndLabel = [
        normalizeString(fact.typeKey || fact.contributionType),
        normalizeString(fact.label),
        roundMoney(toOptionalNumber(fact.monthlyAmount ?? fact.monthlyContributionAmount) || 0)
      ].join("|");
      const indexedFact = {
        fact,
        index
      };
      if (sourceRecordId && !bySourceRecordId.has(sourceRecordId)) {
        bySourceRecordId.set(sourceRecordId, indexedFact);
      }
      if (sourcePath && !bySourcePath.has(sourcePath)) {
        bySourcePath.set(sourcePath, indexedFact);
      }
      if (typeAndLabel && !byTypeAndLabel.has(typeAndLabel)) {
        byTypeAndLabel.set(typeAndLabel, indexedFact);
      }
    });

    return {
      bySourceRecordId,
      bySourcePath,
      byTypeAndLabel
    };
  }

  function findSourceFact(record, indexes) {
    const sourceRecordId = normalizeString(record?.sourceRecordId || record?.expenseId || record?.id);
    if (sourceRecordId && indexes.bySourceRecordId.has(sourceRecordId)) {
      return indexes.bySourceRecordId.get(sourceRecordId);
    }
    const sourcePath = normalizeString(record?.sourcePath);
    if (sourcePath && indexes.bySourcePath.has(sourcePath)) {
      return indexes.bySourcePath.get(sourcePath);
    }
    const typeAndLabel = [
      normalizeString(record?.typeKey || record?.contributionType),
      normalizeString(record?.label),
      roundMoney(toOptionalNumber(record?.monthlyContributionAmount ?? record?.monthlyAmount) || 0)
    ].join("|");
    return indexes.byTypeAndLabel.get(typeAndLabel) || null;
  }

  function buildSavingsResourceAllocations(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const facts = getSavingsContributionFacts(safeInput);
    const projectedCategories = getProjectedCategories(safeInput);
    const factIndexes = getFactIndexes(facts);
    const savingAllocations = [];
    const warnings = [];
    const dataGaps = [];
    const sourcePaths = [];

    projectedCategories.forEach(function (category, categoryIndex) {
      if (!isPlainObject(category)) {
        return;
      }
      const targetAssetCategoryKey = normalizeString(category.categoryKey || category.key);
      const targetAssetCategoryLabel = normalizeString(category.label) || targetAssetCategoryKey;
      const sourceRecords = Array.isArray(category.contributionSourceRecords)
        ? category.contributionSourceRecords
        : [];
      const annualGrowthRatePercent = toOptionalNumber(
        category.assumedAnnualGrowthRatePercent
        ?? category.annualGrowthRatePercent
        ?? category.growthRatePercent
      );
      const annualGrowthRate = annualGrowthRatePercent == null
        ? null
        : roundRate(annualGrowthRatePercent / 100);
      const growthStatus = annualGrowthRate == null
        ? (normalizeString(category.growthConsumptionStatus) || "saved-only")
        : "method-active";
      const currentAssetValue = getCurrentAssetValue(safeInput, targetAssetCategoryKey, category);

      sourceRecords.forEach(function (record, recordIndex) {
        if (!isPlainObject(record)) {
          warnings.push(createWarning(
            "invalid-saving-allocation-source-record",
            "Projected savings contribution source record is invalid.",
            { categoryIndex, recordIndex }
          ));
          return;
        }

        const monthlyAmount = toOptionalNumber(record.monthlyContributionAmount ?? record.monthlyAmount);
        if (monthlyAmount == null || monthlyAmount <= 0 || !targetAssetCategoryKey) {
          dataGaps.push(createWarning(
            "missing-saving-allocation-source-values",
            "Savings allocation source record is missing a positive amount or target category.",
            { categoryIndex, recordIndex, targetAssetCategoryKey: targetAssetCategoryKey || null }
          ));
          return;
        }

        const indexedFact = findSourceFact(record, factIndexes);
        const sourceFact = indexedFact?.fact || null;
        const sourceFactIndex = indexedFact?.index;
        const sourceFactPath = sourceFact
          ? `lensModel.savingsContributionFacts.facts.${sourceFactIndex}`
          : null;
        const legacyContextPath = `lensModel.projectedAssetGrowth.includedCategories.${categoryIndex}.contributionSourceRecords.${recordIndex}`;
        const allocationSourcePaths = uniqueStrings([
          sourceFact?.sourcePath,
          sourceFactPath,
          sourceFact ? null : normalizeString(record.sourcePath),
          sourceFact ? null : legacyContextPath
        ]);
        const sourceRecordId = normalizeString(sourceFact?.sourceRecordId || record.sourceRecordId || record.expenseId || record.id);
        const typeKey = normalizeString(sourceFact?.typeKey || record.typeKey || record.contributionType);

        sourcePaths.push(...allocationSourcePaths);
        savingAllocations.push({
          source: sourceFact ? "savingsContributionFact" : "legacyProjectedAssetGrowthContribution",
          sourceFactId: normalizeString(sourceFact?.id) || null,
          sourceRecordId: sourceRecordId || null,
          id: typeKey || sourceRecordId || `saving-allocation-${categoryIndex + 1}-${recordIndex + 1}`,
          typeKey: typeKey || null,
          label: normalizeString(sourceFact?.label || record.label) || targetAssetCategoryLabel || "Saving allocation",
          targetAssetCategoryKey,
          targetAssetCategoryLabel,
          monthlyAmount: roundMoney(monthlyAmount),
          monthlyContributionAmount: roundMoney(monthlyAmount),
          annualAmount: roundMoney((toOptionalNumber(sourceFact?.annualAmount ?? sourceFact?.annualContributionAmount) || monthlyAmount * 12)),
          annualContributionAmount: roundMoney((toOptionalNumber(sourceFact?.annualAmount ?? sourceFact?.annualContributionAmount) || monthlyAmount * 12)),
          annualGrowthRate,
          assumedAnnualGrowthRatePercent: annualGrowthRatePercent,
          growthRate: annualGrowthRate,
          growthSource: normalizeString(category.assumedAnnualGrowthRateSource) || null,
          growthEligible: annualGrowthRate != null,
          growthStatus,
          currentAssetValue,
          status: "active",
          sourcePaths: allocationSourcePaths,
          trace: {
            source: SOURCE,
            calculationVersion: CALCULATION_VERSION,
            sourceFactPath,
            canonicalFactSourcePath: normalizeString(sourceFact?.sourcePath) || null,
            projectedCategoryContextPath: `lensModel.projectedAssetGrowth.includedCategories.${categoryIndex}`,
            projectedContributionContextPath: legacyContextPath,
            projectedGrowthTotalsConsumed: false,
            adapterOutputPath: "lensModel.resourceProjectionInputs.savingAllocations"
          }
        });
      });
    });

    if (facts.length && !savingAllocations.length) {
      warnings.push(createWarning(
        "missing-savings-resource-allocation-context",
        "Canonical savings contribution facts exist, but no projected asset growth contribution context was available.",
        { factCount: facts.length }
      ));
    }

    return {
      source: SOURCE,
      calculationVersion: CALCULATION_VERSION,
      savingAllocations,
      warnings,
      dataGaps,
      trace: {
        source: SOURCE,
        calculationVersion: CALCULATION_VERSION,
        primarySource: "lensModel.savingsContributionFacts.facts",
        categoryContextSource: "lensModel.projectedAssetGrowth.includedCategories",
        outputPath: "lensModel.resourceProjectionInputs.savingAllocations",
        allocationCount: savingAllocations.length,
        sourceFactCount: facts.length,
        projectedCategoryCount: projectedCategories.length,
        projectedGrowthTotalsConsumed: false,
        legacyProjectedAssetGrowthContextUsed: true,
        sourcePaths: uniqueStrings(sourcePaths)
      },
      metadata: {
        source: SOURCE,
        savedDataShapeChanged: false,
        outputConsumer: "Income Impact Layer 1 resource projection",
        projectedGrowthTotalsConsumed: false
      }
    };
  }

  lensAnalysis.buildSavingsResourceAllocations = buildSavingsResourceAllocations;
})(typeof window !== "undefined" ? window : globalThis);
