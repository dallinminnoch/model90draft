(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis Coverage Strategy data adapters.
  // Purpose: convert prepared Lens model asset, treatment, growth, and savings
  // facts into annual non-insurance resource points for the Coverage Strategy board.
  // Non-goals: no DOM, storage, graph rendering, need-line math, coverage offsets,
  // policy-layer math, Income Impact runway ownership, AI, or method formula changes.
  const COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION = "coverage-strategy-resource-line-adapter-v1";
  const DEFAULT_HORIZON_YEARS = 30;
  const ACTIVE_GROWTH_STATUS = "method-active";
  const MIN_ANNUAL_GROWTH_RATE = 0;
  const MAX_ANNUAL_GROWTH_RATE = 0.12;
  const EXCLUDED_INSURANCE_CATEGORY_PATTERN = /(lifeinsurance|existingcoverage|coveragepolicy|insuranceproceeds)/i;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
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
    const normalized = String(value)
      .replace(/[$,%\s,]/g, "")
      .trim();
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
    return Number.isFinite(value) ? Number(value.toFixed(10)) : null;
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function addIssue(target, code, message, details) {
    if (!Array.isArray(target)) {
      return null;
    }
    const existing = target.find(function (issue) {
      return issue && issue.code === code;
    });
    if (existing) {
      return existing;
    }
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(function (value) {
        return normalizeString(value);
      })
      .filter(Boolean)));
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      Number.isNaN(date.getTime())
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }
    return {
      date,
      normalizedDate: raw,
      calendarYear: year
    };
  }

  function formatDateOnly(date) {
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }

  function addYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const target = new Date(dateResult.date.getTime());
    target.setUTCFullYear(target.getUTCFullYear() + years);
    return formatDateOnly(target);
  }

  function monthsBetween(startDate, endDate) {
    const wholeMonths = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
      + (endDate.getUTCMonth() - startDate.getUTCMonth());
    return endDate.getUTCDate() < startDate.getUTCDate() ? wholeMonths - 1 : wholeMonths;
  }

  function calculateAge(dateOfBirth, targetDate) {
    const birth = normalizeDateOnly(dateOfBirth);
    const target = normalizeDateOnly(targetDate);
    if (!birth || !target || birth.date > target.date) {
      return null;
    }
    let age = target.date.getUTCFullYear() - birth.date.getUTCFullYear();
    const monthDelta = target.date.getUTCMonth() - birth.date.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && target.date.getUTCDate() < birth.date.getUTCDate())) {
      age -= 1;
    }
    return age;
  }

  function getAssetFacts(lensModel) {
    const assets = lensModel?.assetFacts?.assets;
    return Array.isArray(assets) ? assets : [];
  }

  function getSavingAllocations(lensModel) {
    const allocations = lensModel?.resourceProjectionInputs?.savingAllocations;
    return Array.isArray(allocations) ? allocations : [];
  }

  function getCurrentValue(asset) {
    return toOptionalNumber(
      asset?.currentValue
      ?? asset?.rawValue
      ?? asset?.value
      ?? asset?.amount
      ?? asset?.balance
    );
  }

  function getCategoryKey(row, fallback) {
    return normalizeString(
      row?.categoryKey
      || row?.assetCategoryKey
      || row?.typeKey
      || row?.category
      || row?.assetCategory
    ) || fallback;
  }

  function shouldExcludeInsuranceLikeRow(row) {
    const values = [
      row?.categoryKey,
      row?.assetCategoryKey,
      row?.typeKey,
      row?.category,
      row?.assetCategory,
      row?.source,
      row?.sourceKey,
      row?.label,
      row?.name
    ].map(normalizeString).join("|");
    return EXCLUDED_INSURANCE_CATEGORY_PATTERN.test(values);
  }

  function normalizeAnnualGrowthRate(value, warnings, details) {
    const parsed = toOptionalNumber(value);
    const safeDetails = isPlainObject(details) ? details : {};
    if (parsed == null) {
      return null;
    }

    const fieldName = normalizeString(safeDetails.fieldName);
    const isPercentField = /percent$/i.test(fieldName);
    const normalized = isPercentField
      ? parsed / 100
      : (parsed > 1 ? parsed / 100 : parsed);
    if (!isPercentField && parsed > 1) {
      addIssue(
        warnings,
        "resource-growth-rate-percent-like-normalized",
        "Resource growth rate looked like a percent value and was normalized to an annual decimal rate.",
        {
          ...safeDetails,
          received: parsed,
          normalizedAnnualRate: normalized
        }
      );
    }
    const clamped = Math.min(MAX_ANNUAL_GROWTH_RATE, Math.max(MIN_ANNUAL_GROWTH_RATE, normalized));
    if (clamped !== normalized) {
      addIssue(
        warnings,
        "resource-growth-rate-clamped",
        "Resource growth rate was outside the supported 0-12% annual range and was clamped.",
        {
          ...safeDetails,
          received: parsed,
          normalizedAnnualRate: normalized,
          usedAnnualRate: clamped,
          minAnnualRate: MIN_ANNUAL_GROWTH_RATE,
          maxAnnualRate: MAX_ANNUAL_GROWTH_RATE
        }
      );
    }
    return clamped;
  }

  function readGrowthRate(row, warnings, details) {
    const candidates = [
      ["annualGrowthRate", row?.annualGrowthRate],
      ["growthRate", row?.growthRate],
      ["assumedAnnualGrowthRate", row?.assumedAnnualGrowthRate],
      ["assumedAnnualGrowthRatePercent", row?.assumedAnnualGrowthRatePercent],
      ["annualGrowthRatePercent", row?.annualGrowthRatePercent],
      ["growthRatePercent", row?.growthRatePercent]
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const [fieldName, value] = candidates[index];
      if (value != null && value !== "") {
        return normalizeAnnualGrowthRate(value, warnings, {
          ...(isPlainObject(details) ? details : {}),
          fieldName
        });
      }
    }
    return null;
  }

  function resolveProjectedCategoryGrowth(lensModel, warnings) {
    const growthByCategory = new Map();
    [
      lensModel?.projectedAssetGrowth?.includedCategories,
      lensModel?.projectedAssetOffset?.includedCategories,
      lensModel?.projectedAssetOffset?.includedProjectedOffsetCategories,
      lensModel?.projectedAssetOffset?.includedAssetGrowthCategories
    ].forEach(function (categoryRows) {
      (Array.isArray(categoryRows) ? categoryRows : []).forEach(function (row, index) {
        if (!isPlainObject(row)) {
          return;
        }
        const categoryKey = getCategoryKey(row, null);
        const annualGrowthRate = readGrowthRate(row, warnings, {
          categoryKey,
          sourcePath: `lensModel.projectedAssetGrowth.includedCategories.${index}`
        });
        if (!categoryKey || annualGrowthRate == null || row.included === false) {
          return;
        }
        if (!growthByCategory.has(categoryKey)) {
          growthByCategory.set(categoryKey, {
            annualGrowthRate,
            growthStatus: normalizeString(row.growthStatus || row.growthConsumptionStatus) || "category-context",
            growthSource: normalizeString(row.assumedAnnualGrowthRateSource || row.growthSource) || null,
            sourcePath: `lensModel.projectedAssetGrowth.includedCategories.${index}`
          });
        }
      });
    });
    return growthByCategory;
  }

  function resolveGrowthForCategory(categoryKey, row, growthByCategory, warnings) {
    const directRate = readGrowthRate(row, warnings, {
      categoryKey,
      source: "asset-row"
    });
    if (directRate != null) {
      return {
        annualGrowthRate: directRate,
        growthStatus: normalizeString(row?.growthStatus) || "asset-row",
        growthSource: "asset-row"
      };
    }
    return growthByCategory.get(categoryKey) || {
      annualGrowthRate: null,
      growthStatus: "current-dollar",
      growthSource: null,
      defaultedMissingGrowth: true
    };
  }

  function normalizeAssetRows(lensModel, warnings, dataGaps) {
    const assets = getAssetFacts(lensModel);
    const growthByCategory = resolveProjectedCategoryGrowth(lensModel, warnings);
    const rows = [];
    const excludedRows = [];

    if (!assets.length) {
      addIssue(
        dataGaps,
        "missing-asset-facts",
        "assetFacts.assets is required to build Coverage Strategy resource points.",
        { sourcePath: "lensModel.assetFacts.assets" }
      );
    }

    assets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        addIssue(warnings, "invalid-asset-row", "Asset row was ignored because it was not an object.", { index });
        return;
      }

      const categoryKey = getCategoryKey(asset, `asset-${index + 1}`);
      const id = normalizeString(asset.id || asset.assetId || asset.sourceKey) || `asset-${index + 1}`;
      if (shouldExcludeInsuranceLikeRow(asset)) {
        excludedRows.push({
          id,
          categoryKey,
          label: normalizeString(asset.label || asset.name || categoryKey),
          reason: "insurance-or-coverage-source-excluded"
        });
        return;
      }

      const currentValue = getCurrentValue(asset);
      if (currentValue == null || currentValue < 0) {
        addIssue(
          dataGaps,
          "missing-current-asset-value",
          "Asset row was missing a non-negative current value.",
          { id, categoryKey, sourcePath: `lensModel.assetFacts.assets.${index}` }
        );
        return;
      }

      const growth = resolveGrowthForCategory(categoryKey, asset, growthByCategory, warnings);
      const annualGrowthRate = growth.annualGrowthRate;
      if (growth.defaultedMissingGrowth === true) {
        addIssue(
          warnings,
          "resource-growth-rate-missing-defaulted",
          "Resource growth rate was missing and defaulted to conservative 0% annual growth.",
          { categoryKey }
        );
      }
      const monthlyGrowthRate = annualGrowthRate == null
        ? 0
        : Math.pow(1 + annualGrowthRate, 1 / 12) - 1;
      rows.push({
        id,
        categoryKey,
        label: normalizeString(asset.label || asset.name || categoryKey),
        currentValue: roundMoney(currentValue),
        annualGrowthRate: annualGrowthRate == null ? 0 : roundRate(annualGrowthRate),
        monthlyGrowthRate: Number.isFinite(monthlyGrowthRate) ? monthlyGrowthRate : 0,
        growthStatus: growth.growthStatus,
        growthSource: growth.growthSource,
        sourcePaths: uniqueStrings(asset.sourcePaths || [`lensModel.assetFacts.assets.${index}`]),
        trace: {
          source: "lensModel.assetFacts.assets",
          sourceIndex: index
        }
      });
    });

    return {
      rows,
      excludedRows
    };
  }

  function ensureTargetRow(rows, allocation) {
    let target = rows.find(function (row) {
      return row.categoryKey === allocation.targetCategoryKey;
    });
    if (target) {
      if (target.annualGrowthRate == null && allocation.annualGrowthRate != null) {
        target.annualGrowthRate = roundRate(allocation.annualGrowthRate);
        target.monthlyGrowthRate = Math.pow(1 + allocation.annualGrowthRate, 1 / 12) - 1;
        target.growthStatus = allocation.growthStatus;
        target.growthSource = "saving-allocation";
      }
      return target;
    }

    target = {
      id: `saving-allocation-${allocation.targetCategoryKey}`,
      categoryKey: allocation.targetCategoryKey,
      label: allocation.targetCategoryLabel || allocation.targetCategoryKey,
      currentValue: 0,
      annualGrowthRate: allocation.annualGrowthRate == null ? null : roundRate(allocation.annualGrowthRate),
      monthlyGrowthRate: allocation.annualGrowthRate == null
        ? 0
        : Math.pow(1 + allocation.annualGrowthRate, 1 / 12) - 1,
      growthStatus: allocation.growthStatus,
      growthSource: "saving-allocation",
      sourcePaths: uniqueStrings(allocation.sourcePaths),
      trace: {
        source: "lensModel.resourceProjectionInputs.savingAllocations",
        syntheticSavingAllocationAsset: true
      }
    };
    rows.push(target);
    return target;
  }

  function normalizeSavingAllocations(lensModel, rows, warnings, dataGaps) {
    return getSavingAllocations(lensModel).reduce(function (items, allocation, index) {
      if (!isPlainObject(allocation)) {
        addIssue(warnings, "invalid-saving-allocation-row", "Saving allocation row was ignored because it was not an object.", { index });
        return items;
      }
      const monthlyAmount = toOptionalNumber(
        allocation.monthlyAmount
        ?? allocation.monthlyContributionAmount
        ?? allocation.amount
      );
      const targetCategoryKey = normalizeString(
        allocation.targetAssetCategoryKey
        || allocation.targetCategoryKey
        || allocation.assetCategoryKey
        || allocation.categoryKey
      );
      if (monthlyAmount == null || monthlyAmount <= 0) {
        addIssue(
          dataGaps,
          "missing-saving-allocation-amount",
          "Saving allocation was missing a positive monthly amount.",
          { index, sourcePath: `lensModel.resourceProjectionInputs.savingAllocations.${index}` }
        );
        return items;
      }
      if (!targetCategoryKey) {
        addIssue(
          dataGaps,
          "missing-saving-allocation-target",
          "Saving allocation was missing a target asset category.",
          { index, sourcePath: `lensModel.resourceProjectionInputs.savingAllocations.${index}` }
        );
        return items;
      }
      if (shouldExcludeInsuranceLikeRow(allocation)) {
        addIssue(
          warnings,
          "saving-allocation-target-insurance-excluded",
          "Saving allocation target looked like insurance coverage and was excluded from resources.",
          { index, targetCategoryKey }
        );
        return items;
      }

      const annualGrowthRate = readGrowthRate(allocation, warnings, {
        targetCategoryKey,
        sourcePath: `lensModel.resourceProjectionInputs.savingAllocations.${index}`
      });
      const normalizedAllocation = {
        id: normalizeString(allocation.id || allocation.typeKey || allocation.sourceRecordId) || `saving-allocation-${index + 1}`,
        label: normalizeString(allocation.label || allocation.targetAssetCategoryLabel) || targetCategoryKey,
        monthlyAmount: roundMoney(monthlyAmount),
        targetCategoryKey,
        targetCategoryLabel: normalizeString(allocation.targetAssetCategoryLabel) || targetCategoryKey,
        annualGrowthRate,
        growthStatus: normalizeString(allocation.growthStatus) || (annualGrowthRate == null ? "current-dollar" : ACTIVE_GROWTH_STATUS),
        sourcePaths: uniqueStrings(allocation.sourcePaths || [`lensModel.resourceProjectionInputs.savingAllocations.${index}`])
      };
      ensureTargetRow(rows, normalizedAllocation);
      items.push(normalizedAllocation);
      return items;
    }, []);
  }

  function cloneProjectionRows(rows) {
    return rows.map(function (row) {
      return {
        ...row,
        currentValue: roundMoney(row.currentValue),
        sourcePaths: Array.isArray(row.sourcePaths) ? row.sourcePaths.slice() : [],
        trace: isPlainObject(row.trace) ? clonePlainValue(row.trace) : {}
      };
    });
  }

  function projectRowsToMonth(baseRows, allocations, months) {
    const rows = cloneProjectionRows(baseRows);
    const contributionByCategory = new Map();
    let totalSavingContributions = 0;
    let totalGrowthAmount = 0;

    for (let month = 0; month < months; month += 1) {
      rows.forEach(function (row) {
        if (row.monthlyGrowthRate > 0 && row.currentValue > 0) {
          const growth = roundMoney(row.currentValue * row.monthlyGrowthRate);
          row.currentValue = roundMoney(row.currentValue + growth);
          totalGrowthAmount = roundMoney(totalGrowthAmount + growth);
        }
      });

      allocations.forEach(function (allocation) {
        const target = rows.find(function (row) {
          return row.categoryKey === allocation.targetCategoryKey;
        });
        if (!target) {
          return;
        }
        target.currentValue = roundMoney(target.currentValue + allocation.monthlyAmount);
        totalSavingContributions = roundMoney(totalSavingContributions + allocation.monthlyAmount);
        contributionByCategory.set(
          target.categoryKey,
          roundMoney((contributionByCategory.get(target.categoryKey) || 0) + allocation.monthlyAmount)
        );
      });
    }

    return {
      rows,
      totalSavingContributions,
      totalGrowthAmount,
      contributionByCategory
    };
  }

  function resolveAssetTreatmentAssumptions(input) {
    return input?.analysisSettings?.assetTreatmentAssumptions
      || input?.lensModel?.analysisSettings?.assetTreatmentAssumptions
      || {};
  }

  function applyTreatment(input, projectedRows, warnings, dataGaps) {
    const calculator = input?.options?.calculateAssetTreatment || lensAnalysis.calculateAssetTreatment;
    if (typeof calculator !== "function") {
      addIssue(
        dataGaps,
        "missing-asset-treatment-helper",
        "Asset treatment helper is required before projected resources can be treated.",
        { sourcePath: "LensApp.lensAnalysis.calculateAssetTreatment" }
      );
      return {
        treatedRows: projectedRows.map(function (row) {
          return {
            id: row.id,
            categoryKey: row.categoryKey,
            label: row.label,
            projectedValue: row.currentValue,
            treatedValue: 0,
            included: false,
            treatmentStatus: "missing-asset-treatment-helper"
          };
        }),
        helperWarnings: []
      };
    }

    const result = calculator({
      assetFacts: {
        assets: projectedRows.map(function (row) {
          return {
            assetId: row.id,
            id: row.id,
            categoryKey: row.categoryKey,
            label: row.label,
            currentValue: row.currentValue,
            source: "coverage-strategy-resource-line-adapter",
            sourcePaths: row.sourcePaths,
            metadata: {
              projectedResourceRow: true
            }
          };
        })
      },
      assetTreatmentAssumptions: resolveAssetTreatmentAssumptions(input),
      options: {
        source: "coverage-strategy-resource-line-adapter"
      }
    });
    const helperWarnings = Array.isArray(result?.warnings) ? clonePlainValue(result.warnings) : [];
    helperWarnings.forEach(function (warning) {
      if (warning?.code) {
        addIssue(warnings, warning.code, warning.message || "Asset treatment warning.", warning.details || {});
      }
    });

    const assets = Array.isArray(result?.assets) ? result.assets : [];
    return {
      treatedRows: projectedRows.map(function (row) {
        const treated = assets.find(function (asset) {
          return normalizeString(asset.assetId) === row.id;
        });
        return {
          id: row.id,
          categoryKey: row.categoryKey,
          label: row.label,
          projectedValue: row.currentValue,
          included: treated?.include === true,
          rawValue: treated?.rawValue ?? row.currentValue,
          taxDragPercent: treated?.taxDragPercent ?? null,
          liquidityHaircutPercent: treated?.liquidityDiscountPercent ?? treated?.liquidityHaircutPercent ?? null,
          treatedValue: roundMoney(treated?.treatedValue || 0),
          treatmentStatus: treated?.include === true ? "treated" : "excluded-by-treatment",
          sourcePaths: row.sourcePaths,
          trace: {
            growthStatus: row.growthStatus,
            growthSource: row.growthSource,
            annualGrowthRate: row.annualGrowthRate
          }
        };
      }),
      helperWarnings
    };
  }

  function normalizeNeedPoint(point, index, valuationDateResult) {
    const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex ?? index) || 0));
    const date = normalizeString(point?.date) || addYears(valuationDateResult, yearIndex);
    const parsedDate = normalizeDateOnly(date);
    return {
      yearIndex,
      date: parsedDate?.normalizedDate || date || null,
      calendarYear: point?.calendarYear ?? parsedDate?.calendarYear ?? null,
      age: toOptionalNumber(point?.age)
    };
  }

  function normalizeTimelinePoints(input, valuationDateResult, warnings, dataGaps) {
    const rawNeedPoints = Array.isArray(input?.needPoints) ? input.needPoints : [];
    if (rawNeedPoints.length) {
      return rawNeedPoints.map(function (point, index) {
        return normalizeNeedPoint(point, index, valuationDateResult);
      });
    }

    const parsedHorizon = Math.max(0, Math.round(toOptionalNumber(input?.horizonYears) ?? DEFAULT_HORIZON_YEARS));
    addIssue(
      warnings,
      "need-points-missing-horizon-derived",
      "Resource points were derived from horizonYears because needPoints were not supplied.",
      { horizonYears: parsedHorizon }
    );
    if (!input?.horizonYears) {
      addIssue(
        dataGaps,
        "missing-need-points",
        "Need points are preferred so Resource Line can align to the Coverage Need Timeline.",
        { fallbackHorizonYears: parsedHorizon }
      );
    }
    return Array.from({ length: parsedHorizon + 1 }, function (_unused, yearIndex) {
      const date = addYears(valuationDateResult, yearIndex);
      const parsedDate = normalizeDateOnly(date);
      return {
        yearIndex,
        date,
        calendarYear: parsedDate?.calendarYear ?? null,
        age: null
      };
    });
  }

  function readExcludedSurplus(input, yearIndex) {
    const sources = [
      input?.resourceProjectionInputs,
      input?.lensModel?.resourceProjectionInputs,
      input?.options
    ].filter(isPlainObject);
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const source = sources[sourceIndex];
      const pointRows = source.unassignedSurplusPoints || source.unallocatedSurplusPoints || source.excludedSurplusPoints;
      if (Array.isArray(pointRows)) {
        const point = pointRows.find(function (row) {
          return Math.round(toOptionalNumber(row?.yearIndex) || 0) === yearIndex;
        });
        const amount = toOptionalNumber(point?.amount ?? point?.unassignedSurplus ?? point?.unallocatedSurplus);
        if (amount != null) {
          return roundMoney(amount);
        }
      }
      const amount = toOptionalNumber(
        source.unassignedSurplus
        ?? source.unallocatedSurplus
        ?? source.excludedSurplus
      );
      if (amount != null) {
        return roundMoney(amount);
      }
    }
    return 0;
  }

  function buildCategoryAmounts(treatedRows) {
    return treatedRows.reduce(function (amounts, row) {
      if (row.included) {
        amounts[row.categoryKey] = roundMoney((amounts[row.categoryKey] || 0) + row.treatedValue);
      }
      return amounts;
    }, {});
  }

  function buildExcludedCategoryAmounts(treatedRows) {
    return treatedRows.reduce(function (amounts, row) {
      if (!row.included) {
        amounts[row.categoryKey] = roundMoney((amounts[row.categoryKey] || 0) + row.projectedValue);
      }
      return amounts;
    }, {});
  }

  function buildCoverageStrategyResourceLine(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const warnings = [];
    const dataGaps = [];
    const sourceValuationDate = safeInput.valuationDate
      || safeInput.analysisSettings?.valuationDate
      || lensModel.analysisSettings?.valuationDate;
    const valuationDateResult = normalizeDateOnly(sourceValuationDate);

    if (!valuationDateResult) {
      addIssue(
        dataGaps,
        "missing-valuation-date",
        "A valid valuationDate is required to build annual resource points.",
        { sourcePath: "valuationDate" }
      );
    }

    const valuationForFallback = valuationDateResult || normalizeDateOnly("2026-01-01");
    const pointSpine = normalizeTimelinePoints(safeInput, valuationForFallback, warnings, dataGaps);
    const normalizedAssets = normalizeAssetRows(lensModel, warnings, dataGaps);
    const baseRows = normalizedAssets.rows;
    const savingAllocations = normalizeSavingAllocations(lensModel, baseRows, warnings, dataGaps);
    const clientDateOfBirth = lensModel?.profileFacts?.clientDateOfBirth
      || lensModel?.client?.dateOfBirth
      || lensModel?.clientProfile?.dateOfBirth;
    const categoryPoints = [];

    const resourcePoints = pointSpine.map(function (point) {
      const pointDate = normalizeDateOnly(point.date);
      const monthCount = valuationDateResult && pointDate
        ? Math.max(0, monthsBetween(valuationDateResult.date, pointDate.date))
        : Math.max(0, point.yearIndex * 12);
      const projected = projectRowsToMonth(baseRows, savingAllocations, monthCount);
      const treatment = applyTreatment(safeInput, projected.rows, warnings, dataGaps);
      const resourceAmount = roundMoney(treatment.treatedRows.reduce(function (total, row) {
        return total + (row.included ? row.treatedValue : 0);
      }, 0));
      const grossProjectedAssetAmount = roundMoney(treatment.treatedRows.reduce(function (total, row) {
        return total + row.projectedValue;
      }, 0));
      const excludedSurplus = readExcludedSurplus(safeInput, point.yearIndex);
      const categoryAmounts = buildCategoryAmounts(treatment.treatedRows);
      const excludedCategoryAmounts = buildExcludedCategoryAmounts(treatment.treatedRows);

      treatment.treatedRows.forEach(function (row) {
        categoryPoints.push({
          yearIndex: point.yearIndex,
          date: point.date,
          categoryKey: row.categoryKey,
          label: row.label,
          projectedValue: row.projectedValue,
          treatedValue: row.treatedValue,
          included: row.included,
          treatmentStatus: row.treatmentStatus
        });
      });

      return {
        yearIndex: point.yearIndex,
        date: point.date,
        calendarYear: point.calendarYear,
        age: point.age ?? calculateAge(clientDateOfBirth, point.date),
        resourceAmount,
        eligibleResourceAmount: resourceAmount,
        grossProjectedAssetAmount,
        categoryAmounts,
        excludedCategoryAmounts,
        savingsContributionAmount: projected.totalSavingContributions,
        savingsContributionAmountsByCategory: Object.fromEntries(projected.contributionByCategory),
        growthAmount: projected.totalGrowthAmount,
        treatmentReductionAmount: roundMoney(grossProjectedAssetAmount - resourceAmount),
        excludedSurplus,
        unassignedSurplus: excludedSurplus,
        excludedRows: normalizedAssets.excludedRows,
        warnings: [],
        dataGaps: [],
        trace: {
          adapterVersion: COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION,
          primaryResourceBasis: "eligible-non-insurance-resources-before-coverage",
          alignedToNeedPoint: Array.isArray(safeInput.needPoints),
          projectionMonths: monthCount,
          existingCoverageIncluded: false,
          hypotheticalCoverageIncluded: false,
          insuranceProceedsIncluded: false,
          unallocatedSurplusIncludedInResourceAmount: false,
          survivorRunwayUsed: false,
          treatmentHelper: typeof (safeInput.options?.calculateAssetTreatment || lensAnalysis.calculateAssetTreatment) === "function"
            ? "calculateAssetTreatment"
            : "missing"
        }
      };
    });

    return {
      adapterVersion: COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION,
      status: dataGaps.length ? "partial" : "complete",
      cadence: "annual",
      valuationDate: valuationDateResult?.normalizedDate || normalizeString(sourceValuationDate),
      pointCount: resourcePoints.length,
      resourcePoints,
      categoryPoints,
      assumptionsUsed: {
        resourceMeaning: "projected eligible non-insurance resources at each future death year before coverage",
        alignedToNeedPoints: Array.isArray(safeInput.needPoints),
        assetTreatmentSource: "calculateAssetTreatment",
        savingAllocationSource: "lensModel.resourceProjectionInputs.savingAllocations",
        existingCoverageIncluded: false,
        unallocatedSurplusIncluded: false,
        rawAggregateWealthUsed: false
      },
      warnings,
      dataGaps,
      trace: {
        adapterVersion: COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION,
        source: "prepared-lens-model-asset-treatment-growth-and-savings-context",
        pointCount: resourcePoints.length,
        categoryPointCount: categoryPoints.length,
        assetRowCount: normalizedAssets.rows.length,
        savingAllocationCount: savingAllocations.length,
        excludedInsuranceLikeAssetCount: normalizedAssets.excludedRows.length,
        warningCount: warnings.length,
        dataGapCount: dataGaps.length,
        displayHtmlUsed: false,
        incomeImpactRunwayUsed: false,
        existingCoverageIncluded: false,
        unallocatedSurplusIncludedInResourceAmount: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION = COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION;
  lensAnalysis.buildCoverageStrategyResourceLine = buildCoverageStrategyResourceLine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_RESOURCE_LINE_ADAPTER_VERSION,
      buildCoverageStrategyResourceLine
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
