(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis Income Loss Impact timeline helper.
  // Purpose: calculate fact-based, output-neutral household impact timeline
  // data from normalized linked profile / PMI facts for the Income Impact page.
  // Non-goals: no DOM access, no storage access, no method calls, no
  // recommendation logic, no save/load behavior, no UI state ownership, and no
  // model mutation.

  const CALCULATION_VERSION = 1;
  const DEFAULT_DEPENDENT_MILESTONE_AGE = 18;
  const DEFAULT_RUNWAY_PROJECTION_YEARS = 40;
  const MIN_RUNWAY_PROJECTION_YEARS = 5;
  const MAX_RUNWAY_PROJECTION_YEARS = 100;
  const PRE_DEATH_CONTEXT_YEARS = 5;
  const MONTHLY_RESOLUTION_MONTHS_AFTER_DEATH = 24;
  const MORTGAGE_TREATMENT_OVERRIDES = Object.freeze([
    "followAssumptions",
    "payOffMortgage",
    "continueMortgagePayments"
  ]);
  const PROJECTED_ASSET_OFFSET_ACTIVE_STATUS = "method-active";
  const PROJECTED_ASSET_OFFSET_MIN_ACTIVATION_VERSION = 1;
  const HOUSEHOLD_ASSET_GROWTH_CURRENT_DOLLAR_SOURCE_PATH =
    "incomeLossImpact.householdPosition.assetGrowth.currentDollar";
  const HOUSEHOLD_ASSET_GROWTH_EXCLUDED_CATEGORY_KEYS = Object.freeze([
    "emergencyFund",
    "qualifiedAnnuities",
    "nonqualifiedAnnuities",
    "primaryResidenceEquity",
    "otherRealEstateEquity",
    "businessPrivateCompanyValue",
    "educationSpecificSavings",
    "trustRestrictedAssets",
    "stockCompensationDeferredCompensation",
    "digitalAssetsCrypto",
    "otherCustomAsset"
  ]);
  const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (typeof lensAnalysis.toOptionalNumber === "function") {
      return lensAnalysis.toOptionalNumber(value);
    }

    if (value == null || value === "") {
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
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function roundYears(value) {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  }

  function clampNumber(value, min, max) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }
    return Math.max(min, Math.min(max, number));
  }

  function formatMoney(value) {
    const number = toOptionalNumber(value);
    return number == null ? "Not available" : MONEY_FORMATTER.format(number);
  }

  function formatYearsMonths(value) {
    const yearsValue = toOptionalNumber(value);
    if (yearsValue == null || yearsValue < 0) {
      return "Not available";
    }

    const totalMonths = Math.round(yearsValue * 12);
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return `${years} ${years === 1 ? "year" : "years"} ${months} ${months === 1 ? "month" : "months"}`;
  }

  function getYearsMonthsParts(value) {
    const yearsValue = toOptionalNumber(value);
    if (yearsValue == null || yearsValue < 0) {
      return {
        years: null,
        months: null,
        totalMonths: null
      };
    }

    const totalMonths = Math.round(yearsValue * 12);
    return {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12,
      totalMonths
    };
  }

  function createWarning(code, message, details) {
    const warning = { code, message };
    if (details !== undefined) {
      warning.details = details;
    }
    return warning;
  }

  function createDataGap(code, label, sourcePaths, details) {
    const dataGap = {
      code,
      label,
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths.slice() : []
    };
    if (details !== undefined) {
      dataGap.details = details;
    }
    return dataGap;
  }

  function formatDateOnly(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDateOnly(value) {
    if (value == null || value === "") {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }
      const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
      return {
        date,
        normalizedDate: formatDateOnly(date)
      };
    }

    const match = normalizeString(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return {
      date,
      normalizedDate: formatDateOnly(date)
    };
  }

  function addYears(date, years) {
    const output = new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
    if (date.getMonth() === 1 && date.getDate() === 29 && output.getMonth() !== 1) {
      return new Date(date.getFullYear() + years, 1, 28);
    }
    return output;
  }

  function addMonths(date, months) {
    const output = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
    if (output.getDate() !== date.getDate()) {
      return new Date(output.getFullYear(), output.getMonth(), 0);
    }
    return output;
  }

  function calculateWholeMonthsBetweenDates(startDate, endDate) {
    if (!startDate || !endDate) {
      return null;
    }

    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12
      + (endDate.getMonth() - startDate.getMonth());
    if (endDate.getDate() < startDate.getDate()) {
      months -= 1;
    }
    return months;
  }

  function calculateAge(dateOfBirth, asOfDate) {
    if (!dateOfBirth || !asOfDate) {
      return null;
    }

    let age = asOfDate.getFullYear() - dateOfBirth.getFullYear();
    const birthdayHasOccurred = asOfDate.getMonth() > dateOfBirth.getMonth()
      || (
        asOfDate.getMonth() === dateOfBirth.getMonth()
        && asOfDate.getDate() >= dateOfBirth.getDate()
      );
    if (!birthdayHasOccurred) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function getPath(source, path) {
    return normalizeString(path)
      .split(".")
      .filter(Boolean)
      .reduce(function (current, key) {
        return current && typeof current === "object" ? current[key] : undefined;
      }, source);
  }

  function getNumber(source, path) {
    return toOptionalNumber(getPath(source, path));
  }

  function firstNumber(source, candidates) {
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    for (let index = 0; index < safeCandidates.length; index += 1) {
      const candidate = safeCandidates[index];
      const value = getNumber(source, candidate.path);
      if (value != null) {
        return {
          value,
          sourcePath: candidate.path
        };
      }
    }
    return {
      value: null,
      sourcePath: safeCandidates[0]?.path || null
    };
  }

  function sumKnownValues(items) {
    let total = 0;
    let hasAny = false;
    const sourcePaths = [];

    (Array.isArray(items) ? items : []).forEach(function (item) {
      const value = toOptionalNumber(item?.value);
      if (value == null) {
        return;
      }
      hasAny = true;
      total += value;
      if (item.sourcePath) {
        sourcePaths.push(item.sourcePath);
      }
    });

    return {
      value: hasAny ? total : null,
      sourcePaths
    };
  }

  function uniqueStrings(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeString)
        .filter(Boolean)
    ));
  }

  function createRunwayValue(value, sourcePath, sourcePaths, status) {
    const normalizedValue = toOptionalNumber(value);
    const normalizedSourcePaths = uniqueStrings(
      Array.isArray(sourcePaths) && sourcePaths.length
        ? sourcePaths
        : (sourcePath ? [sourcePath] : [])
    );

    return {
      value: normalizedValue,
      sourcePath: sourcePath || normalizedSourcePaths[0] || null,
      sourcePaths: normalizedSourcePaths,
      status: status || (normalizedValue == null ? "missing" : "available")
    };
  }

  function createMissingRunwayValue(sourcePaths, status) {
    return createRunwayValue(null, null, sourcePaths, status || "missing");
  }

  function firstRunwayValue(source, candidates) {
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    for (let index = 0; index < safeCandidates.length; index += 1) {
      const candidate = safeCandidates[index];
      const value = getNumber(source, candidate.path);
      if (value != null) {
        return createRunwayValue(
          value,
          candidate.path,
          candidate.sourcePaths || [candidate.path],
          candidate.status
        );
      }
    }
    return createMissingRunwayValue(
      safeCandidates.map(function (candidate) {
        return candidate.path;
      }),
      "missing"
    );
  }

  function getHouseholdAssetGrowthGateSourcePaths() {
    return [
      "analysisSettings.projectedAssetOffsetAssumptions.enabled",
      "analysisSettings.projectedAssetOffsetAssumptions.consumptionStatus",
      "analysisSettings.projectedAssetOffsetAssumptions.activationVersion",
      "analysisSettings.assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode"
    ];
  }

  function getProjectedAssetOffsetSourcePaths() {
    return [
      "projectedAssetOffset.effectiveProjectedAssetOffset",
      "projectedAssetOffset.currentTreatedAssetOffset",
      "projectedAssetOffset.projectedGrowthAdjustment",
      "projectedAssetOffset.projectionYears",
      "projectedAssetOffset.includedCategories",
      "projectedAssetOffset.excludedCategories"
    ];
  }

  function createHouseholdAssetGrowthInput(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const active = safeOptions.active === true;
    const annualRatePercent = toOptionalNumber(safeOptions.annualRatePercent);
    const sourcePaths = uniqueStrings(
      (active ? [] : [HOUSEHOLD_ASSET_GROWTH_CURRENT_DOLLAR_SOURCE_PATH])
        .concat(safeOptions.sourcePaths || [])
    );
    return {
      value: active && annualRatePercent != null ? annualRatePercent : 0,
      annualRatePercent: active && annualRatePercent != null ? annualRatePercent : 0,
      active,
      status: safeOptions.status || (active ? "method-active" : "current-dollar"),
      sourcePath: safeOptions.sourcePath || (active
        ? "projectedAssetOffset.includedCategories"
        : HOUSEHOLD_ASSET_GROWTH_CURRENT_DOLLAR_SOURCE_PATH),
      sourcePaths,
      trace: isPlainObject(safeOptions.trace)
        ? safeOptions.trace
        : {
            active,
            fallbackReason: safeOptions.fallbackReason || null,
            sourcePaths
          },
      warnings: Array.isArray(safeOptions.warnings) ? safeOptions.warnings.slice() : [],
      dataGaps: Array.isArray(safeOptions.dataGaps) ? safeOptions.dataGaps.slice() : []
    };
  }

  function createInactiveHouseholdAssetGrowthInput(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const gate = isPlainObject(safeOptions.gate) ? safeOptions.gate : {};
    const fallbackReason = safeOptions.fallbackReason || "asset-growth-current-dollar";
    const sourcePaths = uniqueStrings(
      getHouseholdAssetGrowthGateSourcePaths()
        .concat(safeOptions.sourcePaths || [])
    );
    return createHouseholdAssetGrowthInput({
      active: false,
      status: safeOptions.status || "current-dollar",
      fallbackReason,
      sourcePaths,
      warnings: safeOptions.warnings,
      dataGaps: safeOptions.dataGaps,
      trace: {
        active: false,
        activeGate: gate,
        sourceMode: gate.sourceMode || null,
        includedEligibleCategoryKeys: [],
        excludedCategoryKeys: [],
        eligibleGrowthBase: 0,
        totalTreatedBase: safeOptions.totalTreatedBase == null ? null : roundMoney(safeOptions.totalTreatedBase),
        selectedAnnualGrowthRatePercent: 0,
        fallbackReason,
        sourcePaths
      }
    });
  }

  function getHouseholdPositionAnalysisSettings(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    if (isPlainObject(safeOptions.analysisSettings)) {
      return safeOptions.analysisSettings;
    }
    if (isPlainObject(safeOptions.profileRecord?.analysisSettings)) {
      return safeOptions.profileRecord.analysisSettings;
    }
    return {};
  }

  function resolveHouseholdAssetGrowthGate(analysisSettings) {
    const safeSettings = isPlainObject(analysisSettings) ? analysisSettings : {};
    const projectedAssumptions = isPlainObject(safeSettings.projectedAssetOffsetAssumptions)
      ? safeSettings.projectedAssetOffsetAssumptions
      : {};
    const projectionAssumptions = isPlainObject(
      safeSettings.assetTreatmentAssumptions?.assetGrowthProjectionAssumptions
    )
      ? safeSettings.assetTreatmentAssumptions.assetGrowthProjectionAssumptions
      : {};
    const activationVersion = toOptionalNumber(projectedAssumptions.activationVersion);
    const consumptionStatus = normalizeString(projectedAssumptions.consumptionStatus);
    const sourceMode = normalizeString(projectionAssumptions.mode);
    const enabled = projectedAssumptions.enabled === true;
    const requested = enabled
      || consumptionStatus === PROJECTED_ASSET_OFFSET_ACTIVE_STATUS
      || (activationVersion != null && activationVersion >= PROJECTED_ASSET_OFFSET_MIN_ACTIVATION_VERSION)
      || sourceMode === "projectedOffsets";
    const active = enabled
      && consumptionStatus === PROJECTED_ASSET_OFFSET_ACTIVE_STATUS
      && activationVersion != null
      && activationVersion >= PROJECTED_ASSET_OFFSET_MIN_ACTIVATION_VERSION
      && sourceMode === "projectedOffsets";

    return {
      active,
      requested,
      enabled,
      consumptionStatus: consumptionStatus || null,
      activationVersion,
      sourceMode: sourceMode || null,
      sourcePaths: getHouseholdAssetGrowthGateSourcePaths()
    };
  }

  function getCategoryKeys(rows) {
    return uniqueStrings((Array.isArray(rows) ? rows : []).map(function (row) {
      return row?.categoryKey;
    }));
  }

  function getHouseholdAssetGrowthEligibleRows(projectedAssetOffset) {
    const includedCategories = Array.isArray(projectedAssetOffset?.includedCategories)
      ? projectedAssetOffset.includedCategories
      : [];
    const eligibleRows = [];
    const guardExcludedCategoryKeys = [];

    includedCategories.forEach(function (row) {
      const categoryKey = normalizeString(row?.categoryKey);
      const treatedValue = toOptionalNumber(row?.treatedValue);
      const rate = toOptionalNumber(row?.assumedAnnualGrowthRatePercent);
      if (!categoryKey) {
        return;
      }
      if (HOUSEHOLD_ASSET_GROWTH_EXCLUDED_CATEGORY_KEYS.includes(categoryKey)) {
        guardExcludedCategoryKeys.push(categoryKey);
        return;
      }
      if (treatedValue == null || treatedValue <= 0 || rate == null || rate < 0) {
        guardExcludedCategoryKeys.push(categoryKey);
        return;
      }
      eligibleRows.push({
        categoryKey,
        treatedValue,
        rate,
        projectedTreatedValue: toOptionalNumber(row?.projectedTreatedValue)
      });
    });

    return {
      eligibleRows,
      guardExcludedCategoryKeys: uniqueStrings(guardExcludedCategoryKeys)
    };
  }

  function resolveHouseholdAssetGrowthRateFromProjectedOffset(projectedAssetOffset, eligibleRows, projectionYears, totalTreatedBase) {
    let eligibleGrowthBase = 0;
    let weightedRateTotal = 0;
    let projectedEligibleValue = 0;

    eligibleRows.forEach(function (row) {
      const projectedValue = row.projectedTreatedValue != null
        ? row.projectedTreatedValue
        : row.treatedValue * Math.pow(1 + row.rate / 100, projectionYears);
      eligibleGrowthBase += row.treatedValue;
      weightedRateTotal += row.treatedValue * row.rate;
      projectedEligibleValue += Math.max(row.treatedValue, projectedValue);
    });

    const eligibleGrowthAdjustment = Math.max(0, projectedEligibleValue - eligibleGrowthBase);
    const blendedCategoryRate = eligibleGrowthBase > 0 ? weightedRateTotal / eligibleGrowthBase : 0;
    const preparedGrowthAdjustment = toOptionalNumber(projectedAssetOffset?.projectedGrowthAdjustment) || 0;
    const selectedGrowthAdjustment = eligibleGrowthAdjustment > 0
      ? eligibleGrowthAdjustment
      : preparedGrowthAdjustment;
    const annualRatePercent = totalTreatedBase > 0 && projectionYears > 0 && selectedGrowthAdjustment > 0
      ? (Math.pow((totalTreatedBase + selectedGrowthAdjustment) / totalTreatedBase, 1 / projectionYears) - 1) * 100
      : 0;

    return {
      annualRatePercent: roundYears(annualRatePercent) || 0,
      blendedCategoryRate: roundYears(blendedCategoryRate) || 0,
      eligibleGrowthBase: roundMoney(eligibleGrowthBase),
      selectedGrowthAdjustment: roundMoney(selectedGrowthAdjustment),
      preparedGrowthAdjustment: roundMoney(preparedGrowthAdjustment)
    };
  }

  function resolveHouseholdPositionAssetGrowthInput(lensModel, startingResources, options) {
    const analysisSettings = getHouseholdPositionAnalysisSettings(options);
    const gate = resolveHouseholdAssetGrowthGate(analysisSettings);
    const startingResourceValue = toOptionalNumber(startingResources?.value);
    const baseSourcePaths = gate.sourcePaths.concat(getProjectedAssetOffsetSourcePaths());

    if (!gate.active) {
      return createInactiveHouseholdAssetGrowthInput({
        gate,
        status: gate.requested ? "projected-asset-growth-gate-inactive" : "current-dollar",
        fallbackReason: gate.requested
          ? "projected-asset-offset-active-gate-invalid"
          : "projected-asset-offset-active-gate-missing",
        totalTreatedBase: startingResourceValue,
        sourcePaths: baseSourcePaths,
        warnings: gate.requested
          ? [
              createWarning(
                "household-asset-growth-active-gate-invalid",
                "Household asset growth remained current-dollar because the projected asset offset active gate was incomplete or invalid.",
                {
                  enabled: gate.enabled,
                  consumptionStatus: gate.consumptionStatus,
                  activationVersion: gate.activationVersion,
                  sourceMode: gate.sourceMode
                }
              )
            ]
          : []
      });
    }

    const projectedAssetOffset = isPlainObject(lensModel?.projectedAssetOffset)
      ? lensModel.projectedAssetOffset
      : null;
    if (!projectedAssetOffset) {
      const sourcePaths = uniqueStrings(baseSourcePaths);
      return createInactiveHouseholdAssetGrowthInput({
        gate,
        status: "projected-asset-growth-missing-prepared-output",
        fallbackReason: "missing-projected-asset-offset",
        totalTreatedBase: startingResourceValue,
        sourcePaths,
        warnings: [
          createWarning(
            "household-asset-growth-missing-projected-offset",
            "Projected asset offset active marker was present, but prepared projectedAssetOffset output was missing; household position used current-dollar growth.",
            { sourcePaths }
          )
        ],
        dataGaps: [
          createDataGap(
            "missing-projected-asset-offset-for-household-growth",
            "Projected asset offset output is required before Household Financial Position can apply active asset growth.",
            sourcePaths
          )
        ]
      });
    }

    const currentTreatedAssetOffset = toOptionalNumber(projectedAssetOffset.currentTreatedAssetOffset);
    const effectiveProjectedAssetOffset = toOptionalNumber(projectedAssetOffset.effectiveProjectedAssetOffset);
    const projectedGrowthAdjustment = toOptionalNumber(projectedAssetOffset.projectedGrowthAdjustment);
    const projectionYears = toOptionalNumber(projectedAssetOffset.projectionYears);
    const sourceMode = normalizeString(projectedAssetOffset.sourceMode);
    const formulaMatches = currentTreatedAssetOffset != null
      && projectedGrowthAdjustment != null
      && effectiveProjectedAssetOffset != null
      && roundMoney(currentTreatedAssetOffset + projectedGrowthAdjustment) === roundMoney(effectiveProjectedAssetOffset);
    const treatedBaseMatches = startingResourceValue != null
      && currentTreatedAssetOffset != null
      && roundMoney(startingResourceValue) === roundMoney(currentTreatedAssetOffset);
    const projectedCategories = getHouseholdAssetGrowthEligibleRows(projectedAssetOffset);
    const excludedCategoryKeys = uniqueStrings(
      getCategoryKeys(projectedAssetOffset.excludedCategories)
        .concat(projectedCategories.guardExcludedCategoryKeys)
    );

    if (
      sourceMode !== "projectedOffsets"
      || !treatedBaseMatches
      || !formulaMatches
      || projectionYears == null
      || projectionYears <= 0
      || projectedGrowthAdjustment == null
      || projectedGrowthAdjustment <= 0
    ) {
      const fallbackReason = sourceMode !== "projectedOffsets"
        ? "projected-asset-offset-source-mode-mismatch"
        : !treatedBaseMatches
          ? "projected-asset-offset-treated-base-mismatch"
          : !formulaMatches
            ? "projected-asset-offset-formula-mismatch"
            : "invalid-projected-asset-offset-growth";
      const sourcePaths = uniqueStrings(baseSourcePaths);
      return createInactiveHouseholdAssetGrowthInput({
        gate,
        status: "projected-asset-growth-invalid-prepared-output",
        fallbackReason,
        totalTreatedBase: startingResourceValue,
        sourcePaths,
        warnings: [
          createWarning(
            "household-asset-growth-invalid-projected-offset",
            "Projected asset offset active marker was present, but prepared projectedAssetOffset output was invalid; household position used current-dollar growth.",
            {
              fallbackReason,
              currentTreatedAssetOffset,
              projectedGrowthAdjustment,
              effectiveProjectedAssetOffset,
              projectionYears,
              sourceMode
            }
          )
        ],
        dataGaps: [
          createDataGap(
            "invalid-projected-asset-offset-for-household-growth",
            "Valid projected asset offset output is required before Household Financial Position can apply active asset growth.",
            sourcePaths,
            { fallbackReason }
          )
        ]
      });
    }

    if (!projectedCategories.eligibleRows.length) {
      const sourcePaths = uniqueStrings(baseSourcePaths);
      return createInactiveHouseholdAssetGrowthInput({
        gate,
        status: "projected-asset-growth-no-eligible-categories",
        fallbackReason: "no-eligible-projected-asset-offset-categories",
        totalTreatedBase: startingResourceValue,
        sourcePaths,
        warnings: [
          createWarning(
            "household-asset-growth-no-eligible-categories",
            "Projected asset offset active marker was present, but no eligible projected asset categories were available for Household Financial Position growth.",
            { excludedCategoryKeys }
          )
        ],
        dataGaps: [
          createDataGap(
            "missing-eligible-projected-asset-categories-for-household-growth",
            "Eligible projected asset categories are required before Household Financial Position can apply active asset growth.",
            sourcePaths,
            { excludedCategoryKeys }
          )
        ]
      });
    }

    const resolvedRate = resolveHouseholdAssetGrowthRateFromProjectedOffset(
      projectedAssetOffset,
      projectedCategories.eligibleRows,
      projectionYears,
      currentTreatedAssetOffset
    );
    if (resolvedRate.annualRatePercent <= 0) {
      const sourcePaths = uniqueStrings(baseSourcePaths);
      return createInactiveHouseholdAssetGrowthInput({
        gate,
        status: "projected-asset-growth-zero-rate",
        fallbackReason: "eligible-projected-asset-growth-rate-zero",
        totalTreatedBase: startingResourceValue,
        sourcePaths,
        warnings: [
          createWarning(
            "household-asset-growth-zero-active-rate",
            "Projected asset offset active marker was present, but eligible growth resolved to a 0% rate; household position used current-dollar growth."
          )
        ]
      });
    }

    const includedEligibleCategoryKeys = projectedCategories.eligibleRows.map(function (row) {
      return row.categoryKey;
    });
    const sourcePaths = uniqueStrings(
      baseSourcePaths.concat([
        "projectedAssetOffset.includedCategories[].treatedValue",
        "projectedAssetOffset.includedCategories[].projectedTreatedValue",
        "projectedAssetOffset.includedCategories[].assumedAnnualGrowthRatePercent"
      ])
    );
    return createHouseholdAssetGrowthInput({
      active: true,
      annualRatePercent: resolvedRate.annualRatePercent,
      status: "method-active",
      sourcePath: "projectedAssetOffset.includedCategories",
      sourcePaths,
      trace: {
        active: true,
        activeGate: gate,
        sourceMode,
        includedEligibleCategoryKeys,
        excludedCategoryKeys,
        eligibleGrowthBase: resolvedRate.eligibleGrowthBase,
        totalTreatedBase: roundMoney(currentTreatedAssetOffset),
        selectedAnnualGrowthRatePercent: resolvedRate.annualRatePercent,
        blendedCategoryGrowthRatePercent: resolvedRate.blendedCategoryRate,
        selectedGrowthAdjustment: resolvedRate.selectedGrowthAdjustment,
        preparedProjectedGrowthAdjustment: resolvedRate.preparedGrowthAdjustment,
        projectionYears,
        rateBasis: "total-treated-base-equivalent-rate-from-eligible-projected-offset-growth",
        fallbackReason: null,
        sourcePaths
      }
    });
  }

  function resolveProjectedAssetOffsetCandidate(lensModel, treatedAssetValue) {
    const projectedAssetOffset = isPlainObject(lensModel?.projectedAssetOffset)
      ? lensModel.projectedAssetOffset
      : null;
    const metadata = isPlainObject(projectedAssetOffset?.metadata)
      ? projectedAssetOffset.metadata
      : {};
    const effectiveProjectedAssetOffset = getNumber(lensModel, "projectedAssetOffset.effectiveProjectedAssetOffset");
    const currentTreatedAssetOffset = getNumber(lensModel, "projectedAssetOffset.currentTreatedAssetOffset");
    const projectedGrowthAdjustment = getNumber(lensModel, "projectedAssetOffset.projectedGrowthAdjustment");
    const projectionYears = getNumber(lensModel, "projectedAssetOffset.projectionYears");
    const sourceMode = normalizeString(projectedAssetOffset?.sourceMode || metadata.sourceMode);
    const activationStatus = normalizeString(projectedAssetOffset?.activationStatus || metadata.activationStatus);
    const consumptionStatus = normalizeString(projectedAssetOffset?.consumptionStatus || metadata.consumptionStatus);
    const consumedByMethods = projectedAssetOffset?.consumedByMethods === true
      || metadata.consumedByMethods === true
      || activationStatus === "method-active"
      || consumptionStatus === "method-active";
    const treatedBaseMatches = treatedAssetValue != null
      && currentTreatedAssetOffset != null
      && roundMoney(currentTreatedAssetOffset) === roundMoney(treatedAssetValue);
    const active = Boolean(
      projectedAssetOffset
      && consumedByMethods
      && sourceMode === "projectedOffsets"
      && effectiveProjectedAssetOffset != null
      && effectiveProjectedAssetOffset > 0
      && projectedGrowthAdjustment != null
      && projectedGrowthAdjustment > 0
      && projectionYears != null
      && projectionYears > 0
      && treatedBaseMatches
    );

    return {
      active,
      value: active ? effectiveProjectedAssetOffset : null,
      sourcePath: active ? "projectedAssetOffset.effectiveProjectedAssetOffset" : null,
      sourcePaths: uniqueStrings([
        "projectedAssetOffset.effectiveProjectedAssetOffset",
        "projectedAssetOffset.currentTreatedAssetOffset",
        "projectedAssetOffset.projectedGrowthAdjustment",
        "projectedAssetOffset.projectionYears",
        "projectedAssetOffset.activationStatus",
        "projectedAssetOffset.consumptionStatus",
        "projectedAssetOffset.metadata.consumedByMethods"
      ]),
      status: active ? "method-active-used" : "excluded",
      reason: active ? null : "projected-asset-offset-not-method-active",
      sourceMode: sourceMode || null,
      activationStatus: activationStatus || null,
      consumptionStatus: consumptionStatus || null,
      consumedByMethods,
      currentTreatedAssetOffset,
      projectedGrowthAdjustment,
      effectiveProjectedAssetOffset,
      projectionYears
    };
  }

  function resolveCoverageRunwayInput(lensModel) {
    const treatedCoverage = firstRunwayValue(lensModel, [
      { path: "treatedExistingCoverageOffset.totalTreatedCoverageOffset", status: "treated" }
    ]);
    if (treatedCoverage.value != null) {
      return treatedCoverage;
    }

    const rawCoverage = firstRunwayValue(lensModel, [
      { path: "existingCoverage.totalExistingCoverage", status: "raw-fallback" },
      { path: "existingCoverage.totalProfileCoverage", status: "raw-fallback" }
    ]);
    if (rawCoverage.value != null) {
      return {
        ...rawCoverage,
        sourcePaths: uniqueStrings(treatedCoverage.sourcePaths.concat(rawCoverage.sourcePaths))
      };
    }

    return createMissingRunwayValue(
      treatedCoverage.sourcePaths.concat(rawCoverage.sourcePaths),
      "missing"
    );
  }

  function resolveAssetRunwayInput(lensModel) {
    const treatedAssets = firstRunwayValue(lensModel, [
      { path: "treatedAssetOffsets.totalTreatedAssetValue", status: "treated" }
    ]);
    const projectedAssetOffsetCandidate = resolveProjectedAssetOffsetCandidate(
      lensModel,
      treatedAssets.value
    );

    if (projectedAssetOffsetCandidate.active) {
      return {
        assets: createRunwayValue(
          projectedAssetOffsetCandidate.value,
          projectedAssetOffsetCandidate.sourcePath,
          projectedAssetOffsetCandidate.sourcePaths,
          "projected-method-active"
        ),
        projectedAssetOffsetCandidate
      };
    }

    if (treatedAssets.value != null) {
      return {
        assets: treatedAssets,
        projectedAssetOffsetCandidate
      };
    }

    const legacyTotal = firstRunwayValue(lensModel, [
      { path: "offsetAssets.totalAvailableOffsetAssetValue", status: "legacy-offset-assets-fallback" }
    ]);
    const legacyComponents = sumKnownValues([
      { value: getNumber(lensModel, "offsetAssets.cashSavings.availableValue"), sourcePath: "offsetAssets.cashSavings.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.currentEmergencyFund.availableValue"), sourcePath: "offsetAssets.currentEmergencyFund.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.brokerageAccounts.availableValue"), sourcePath: "offsetAssets.brokerageAccounts.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.retirementAccounts.availableValue"), sourcePath: "offsetAssets.retirementAccounts.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.realEstateEquity.availableValue"), sourcePath: "offsetAssets.realEstateEquity.availableValue" },
      { value: getNumber(lensModel, "offsetAssets.businessValue.availableValue"), sourcePath: "offsetAssets.businessValue.availableValue" }
    ]);

    if (legacyTotal.value != null) {
      return {
        assets: {
          ...legacyTotal,
          sourcePaths: uniqueStrings(treatedAssets.sourcePaths.concat(legacyTotal.sourcePaths))
        },
        projectedAssetOffsetCandidate
      };
    }

    if (legacyComponents.value != null) {
      return {
        assets: createRunwayValue(
          legacyComponents.value,
          legacyComponents.sourcePaths.join(" + "),
          treatedAssets.sourcePaths.concat(legacyComponents.sourcePaths),
          "legacy-offset-assets-fallback"
        ),
        projectedAssetOffsetCandidate
      };
    }

    return {
      assets: createMissingRunwayValue(
        treatedAssets.sourcePaths.concat(legacyTotal.sourcePaths).concat(legacyComponents.sourcePaths),
        "missing"
      ),
      projectedAssetOffsetCandidate
    };
  }

  function getTreatedAssetCategoryValues(lensModel) {
    const treatedAssetOffsets = isPlainObject(lensModel?.treatedAssetOffsets)
      ? lensModel.treatedAssetOffsets
      : {};
    const assets = Array.isArray(treatedAssetOffsets.assets)
      ? treatedAssetOffsets.assets
      : [];
    const valuesByCategory = new Map();

    assets.forEach(function (asset) {
      if (!isPlainObject(asset) || asset.include !== true) {
        return;
      }

      const categoryKey = normalizeString(asset.categoryKey);
      const treatedValue = toOptionalNumber(asset.treatedValue);
      if (!categoryKey || treatedValue == null || treatedValue <= 0) {
        return;
      }

      valuesByCategory.set(
        categoryKey,
        (valuesByCategory.get(categoryKey) || 0) + treatedValue
      );
    });

    return valuesByCategory;
  }

  function getProjectedAssetGrowthRows(lensModel) {
    const projectedAssetGrowth = isPlainObject(lensModel?.projectedAssetGrowth)
      ? lensModel.projectedAssetGrowth
      : {};
    return Array.isArray(projectedAssetGrowth.includedCategories)
      ? projectedAssetGrowth.includedCategories
      : [];
  }

  function createAssetGrowthRunwayInput(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const growthRate = toOptionalNumber(safeOptions.growthRate);
    return {
      projectionMode: growthRate != null && growthRate > 0 ? "asset-growth" : "current-dollar",
      growthRate: growthRate == null ? 0 : roundYears(Math.max(0, growthRate)),
      sourcePath: safeOptions.sourcePath || null,
      sourcePaths: uniqueStrings(safeOptions.sourcePaths),
      status: safeOptions.status || "current-dollar",
      warnings: Array.isArray(safeOptions.warnings) ? safeOptions.warnings.slice() : []
    };
  }

  function resolveAssetGrowthRunwayInput(lensModel, assetInput) {
    const safeAssetInput = isPlainObject(assetInput) ? assetInput : {};
    const projectedCandidate = isPlainObject(safeAssetInput.projectedAssetOffsetCandidate)
      ? safeAssetInput.projectedAssetOffsetCandidate
      : null;
    const baseSourcePaths = [
      "projectedAssetGrowth.includedCategories",
      "treatedAssetOffsets.assets",
      "treatedAssetOffsets.totalTreatedAssetValue"
    ];

    if (safeAssetInput.assets?.status === "projected-method-active") {
      return createAssetGrowthRunwayInput({
        sourcePaths: baseSourcePaths.concat(projectedCandidate?.sourcePaths || []),
        status: "projected-offset-growth-excluded",
        warnings: [
          createWarning(
            "projected-asset-offset-growth-double-count-prevented",
            "Asset growth was not separately applied because the selected asset bucket already used a method-active projected asset offset."
          )
        ]
      });
    }

    const treatedValuesByCategory = getTreatedAssetCategoryValues(lensModel);
    const totalTreatedValue = Array.from(treatedValuesByCategory.values()).reduce(function (total, value) {
      return total + value;
    }, 0);
    if (totalTreatedValue <= 0) {
      return createAssetGrowthRunwayInput({
        sourcePaths: baseSourcePaths,
        status: "missing-treated-asset-category-values",
        warnings: [
          createWarning(
            "asset-growth-runway-missing-treated-assets",
            "Prepared asset growth was not applied because treated asset category values were unavailable."
          )
        ]
      });
    }

    const projectedRows = getProjectedAssetGrowthRows(lensModel);
    if (!projectedRows.length) {
      return createAssetGrowthRunwayInput({
        sourcePaths: baseSourcePaths,
        status: "missing-projected-asset-growth"
      });
    }

    const projectedRowsByCategory = new Map();
    projectedRows.forEach(function (row, index) {
      if (!isPlainObject(row)) {
        return;
      }
      const categoryKey = normalizeString(row.categoryKey);
      if (!categoryKey || projectedRowsByCategory.has(categoryKey)) {
        return;
      }
      projectedRowsByCategory.set(categoryKey, { row, index });
    });

    let weightedRateTotal = 0;
    const missingCategories = [];
    const sourcePaths = baseSourcePaths.slice();
    treatedValuesByCategory.forEach(function (treatedValue, categoryKey) {
      const projectedEntry = projectedRowsByCategory.get(categoryKey);
      const projectedRow = projectedEntry?.row;
      const rate = toOptionalNumber(projectedRow?.assumedAnnualGrowthRatePercent);
      if (!projectedRow || rate == null || rate < 0) {
        missingCategories.push(categoryKey);
        return;
      }

      weightedRateTotal += treatedValue * rate;
      sourcePaths.push(
        `projectedAssetGrowth.includedCategories[${projectedEntry.index}].assumedAnnualGrowthRatePercent`
      );
    });

    if (missingCategories.length) {
      return createAssetGrowthRunwayInput({
        sourcePaths,
        status: "category-mapping-incomplete",
        warnings: [
          createWarning(
            "asset-growth-runway-category-mapping-incomplete",
            "Prepared asset growth was not applied because every treated asset category must have a valid prepared growth row.",
            { missingCategories }
          )
        ]
      });
    }

    const blendedRate = totalTreatedValue > 0 ? weightedRateTotal / totalTreatedValue : 0;
    return createAssetGrowthRunwayInput({
      growthRate: blendedRate,
      sourcePath: "projectedAssetGrowth.includedCategories[].assumedAnnualGrowthRatePercent",
      sourcePaths,
      status: "prepared-asset-growth"
    });
  }

  function resolveDebtRunwayInput(lensModel) {
    const preparedMortgageTreatmentTrace = getPreparedMortgageTreatmentTrace(lensModel);
    const treatedDebt = firstRunwayValue(lensModel, [
      { path: "treatedDebtPayoff.needs.debtPayoffAmount", status: "treated" }
    ]);
    const rawDebtTotal = firstRunwayValue(lensModel, [
      { path: "debtPayoff.totalDebtPayoffNeed", status: "raw-fallback" }
    ]);
    const nonMortgageDebt = sumKnownValues([
      { value: getNumber(lensModel, "debtPayoff.otherRealEstateLoanBalance"), sourcePath: "debtPayoff.otherRealEstateLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.autoLoanBalance"), sourcePath: "debtPayoff.autoLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.creditCardBalance"), sourcePath: "debtPayoff.creditCardBalance" },
      { value: getNumber(lensModel, "debtPayoff.studentLoanBalance"), sourcePath: "debtPayoff.studentLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.personalLoanBalance"), sourcePath: "debtPayoff.personalLoanBalance" },
      { value: getNumber(lensModel, "debtPayoff.businessDebtBalance"), sourcePath: "debtPayoff.businessDebtBalance" },
      { value: getNumber(lensModel, "debtPayoff.outstandingTaxLiabilities"), sourcePath: "debtPayoff.outstandingTaxLiabilities" },
      { value: getNumber(lensModel, "debtPayoff.otherDebtPayoffNeeds"), sourcePath: "debtPayoff.otherDebtPayoffNeeds" }
    ]);
    const mortgage = firstRunwayValue(lensModel, [
      { path: "treatedDebtPayoff.needs.mortgagePayoffAmount", status: "treated" },
      { path: "treatedDebtPayoff.dime.mortgageAmount", status: "treated" },
      { path: "debtPayoff.mortgageBalance", status: "raw-fallback" }
    ]);

    if (treatedDebt.value != null) {
      return {
        debtPayoff: treatedDebt,
        mortgage,
        nonMortgageDebt: nonMortgageDebt.value == null
          ? createMissingRunwayValue(nonMortgageDebt.sourcePaths, "missing")
          : createRunwayValue(nonMortgageDebt.value, "debtPayoff.nonMortgageComponents", nonMortgageDebt.sourcePaths, "raw-detail"),
        preparedMortgageTreatmentTrace,
        sourceStatus: "treated"
      };
    }

    if (rawDebtTotal.value != null) {
      return {
        debtPayoff: {
          ...rawDebtTotal,
          sourcePaths: uniqueStrings(treatedDebt.sourcePaths.concat(rawDebtTotal.sourcePaths))
        },
        mortgage,
        nonMortgageDebt: nonMortgageDebt.value == null
          ? createMissingRunwayValue(nonMortgageDebt.sourcePaths, "missing")
          : createRunwayValue(nonMortgageDebt.value, "debtPayoff.nonMortgageComponents", nonMortgageDebt.sourcePaths, "raw-detail"),
        preparedMortgageTreatmentTrace,
        sourceStatus: "raw-fallback"
      };
    }

    const fallbackDebt = sumKnownValues([
      { value: nonMortgageDebt.value, sourcePath: "debtPayoff.nonMortgageComponents" },
      { value: mortgage.value, sourcePath: mortgage.sourcePath }
    ]);

    return {
      debtPayoff: fallbackDebt.value == null
        ? createMissingRunwayValue(treatedDebt.sourcePaths.concat(rawDebtTotal.sourcePaths).concat(nonMortgageDebt.sourcePaths).concat(mortgage.sourcePaths), "missing")
        : createRunwayValue(fallbackDebt.value, fallbackDebt.sourcePaths.join(" + "), fallbackDebt.sourcePaths, "raw-component-fallback"),
      mortgage,
      nonMortgageDebt: nonMortgageDebt.value == null
        ? createMissingRunwayValue(nonMortgageDebt.sourcePaths, "missing")
        : createRunwayValue(nonMortgageDebt.value, "debtPayoff.nonMortgageComponents", nonMortgageDebt.sourcePaths, "raw-detail"),
      preparedMortgageTreatmentTrace,
      sourceStatus: fallbackDebt.value == null ? "missing" : "raw-component-fallback"
    };
  }

  function resolveAnnualNeedRunwayInput(lensModel, options) {
    const essentialSupport = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.annualTotalEssentialSupportCost", status: "prepared-bucket" },
      { path: "ongoingSupport.annualNonHousingEssentialSupportCost", status: "partial-bucket-fallback" }
    ]);
    const monthlyEssentialExpenses = getNumber(lensModel, "ongoingSupport.monthlyTotalEssentialSupportCost");
    const resolvedEssentialSupport = essentialSupport.value == null && monthlyEssentialExpenses != null
      ? createRunwayValue(
          monthlyEssentialExpenses * 12,
          "ongoingSupport.monthlyTotalEssentialSupportCost",
          ["ongoingSupport.monthlyTotalEssentialSupportCost"],
          "monthly-annualized-fallback"
        )
      : essentialSupport;
    const discretionarySupport = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.annualDiscretionaryPersonalSpending", status: "available-not-included" }
    ]);
    const includeDiscretionarySupport = options?.includeDiscretionarySupport === true;
    const healthcare = createMissingRunwayValue(
      [
        "expenseFacts.expenses",
        "healthcareExpenses.projectedHealthcareExpenseAmount"
      ],
      "not-included-no-prepared-healthcare-bucket"
    );
    const annualHouseholdNeed = includeDiscretionarySupport && discretionarySupport.value != null
      ? createRunwayValue(
          resolvedEssentialSupport.value + discretionarySupport.value,
          "ongoingSupport.annualTotalEssentialSupportCost + ongoingSupport.annualDiscretionaryPersonalSpending",
          resolvedEssentialSupport.sourcePaths.concat(discretionarySupport.sourcePaths),
          "essential-plus-discretionary"
        )
      : resolvedEssentialSupport;

    return {
      essentialSupport: resolvedEssentialSupport,
      discretionarySupport: discretionarySupport.value == null
        ? discretionarySupport
        : {
            ...discretionarySupport,
            status: includeDiscretionarySupport ? "included" : "not-included-no-active-state"
          },
      healthcare,
      education: createMissingRunwayValue(["educationSupport.totalEducationFundingNeed"], "milestone-only"),
      annualHouseholdNeed
    };
  }

  function resolveIncomeOffsetRunwayInput(lensModel) {
    const survivorIncome = firstRunwayValue(lensModel, [
      { path: "survivorScenario.survivorNetAnnualIncome", status: "net-income" },
      { path: "survivorScenario.survivorGrossAnnualIncome", status: "gross-fallback" },
      { path: "incomeBasis.spouseOrPartnerNetAnnualIncome", status: "spouse-net-fallback" },
      { path: "incomeBasis.spouseOrPartnerGrossAnnualIncome", status: "spouse-gross-fallback" }
    ]);

    return {
      survivorIncome,
      survivorIncomeStartDelayMonths: Math.max(
        0,
        toOptionalNumber(getPath(lensModel, "survivorScenario.survivorIncomeStartDelayMonths")) || 0
      ),
      survivorWorkReduction: firstRunwayValue(lensModel, [
        { path: "survivorScenario.spouseExpectedWorkReductionAtDeath", status: "available" }
      ])
    };
  }

  function resolveMortgagePaymentRunwayInput(lensModel) {
    const monthlyPayment = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.monthlyMortgagePayment", status: "prepared-bucket" },
      { path: "ongoingSupport.calculatedMonthlyMortgagePayment", status: "legacy-calculated-fallback" },
      { path: "ongoingSupport.monthlyMortgagePaymentOnly", status: "legacy-payment-fallback" }
    ]);
    const remainingTermMonths = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.mortgageRemainingTermMonths", status: "prepared-bucket" }
    ]);

    return {
      monthlyPayment,
      remainingTermMonths,
      annualPayment: monthlyPayment.value == null
        ? createMissingRunwayValue(monthlyPayment.sourcePaths, "missing")
        : createRunwayValue(
            monthlyPayment.value * 12,
            `${monthlyPayment.sourcePath || "ongoingSupport.monthlyMortgagePayment"} * 12`,
            monthlyPayment.sourcePaths,
            monthlyPayment.status
          )
    };
  }

  function debtPayoffIncludesMortgage(debtPayoff, mortgage) {
    if (debtPayoff?.value == null || mortgage?.value == null) {
      return false;
    }

    const debtSourcePaths = uniqueStrings(debtPayoff.sourcePaths);
    const mortgageSourcePaths = uniqueStrings(mortgage.sourcePaths);
    if (mortgageSourcePaths.some(function (sourcePath) {
      return debtSourcePaths.includes(sourcePath);
    })) {
      return true;
    }

    if (
      debtSourcePaths.includes("treatedDebtPayoff.needs.debtPayoffAmount")
      && (
        mortgageSourcePaths.includes("treatedDebtPayoff.needs.mortgagePayoffAmount")
        || mortgageSourcePaths.includes("treatedDebtPayoff.dime.mortgageAmount")
      )
    ) {
      return true;
    }

    return false;
  }

  function getPreparedMortgageTreatmentTrace(lensModel) {
    const treatedDebtPayoff = isPlainObject(lensModel?.treatedDebtPayoff)
      ? lensModel.treatedDebtPayoff
      : {};
    const candidateRows = []
      .concat(Array.isArray(treatedDebtPayoff.debts) ? treatedDebtPayoff.debts : [])
      .concat(Array.isArray(treatedDebtPayoff.trace?.debts) ? treatedDebtPayoff.trace.debts : []);
    return candidateRows.find(function (row) {
      return isPlainObject(row) && row.isMortgage === true;
    }) || null;
  }

  function isPreparedMortgageSupportMode(mortgageTreatmentTrace) {
    if (!isPlainObject(mortgageTreatmentTrace)) {
      return false;
    }

    const treatmentMode = normalizeString(
      mortgageTreatmentTrace.mortgageTreatmentMode || mortgageTreatmentTrace.treatmentMode
    );
    return treatmentMode === "support"
      && mortgageTreatmentTrace.fallbackReason !== "mortgage-support-years-unavailable-defaulted-to-payoff";
  }

  function createAdjustedDebtRunwayValue(value, sourcePath, sourcePaths, status) {
    const normalizedValue = toOptionalNumber(value);
    return createRunwayValue(
      normalizedValue == null ? null : Math.max(0, normalizedValue),
      sourcePath,
      sourcePaths,
      status
    );
  }

  function createMortgageTreatmentTrace(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return {
      override: safeOptions.override || "followAssumptions",
      source: `options.scenario.mortgageTreatmentOverride:${safeOptions.override || "followAssumptions"}`,
      immediatePayoffAmount: safeOptions.immediatePayoffAmount == null ? null : roundMoney(safeOptions.immediatePayoffAmount),
      payoffAlreadyIncluded: safeOptions.payoffAlreadyIncluded === true,
      scheduledAnnualPayment: safeOptions.scheduledAnnualPayment == null ? null : roundMoney(safeOptions.scheduledAnnualPayment),
      scheduledMonthlyPayment: safeOptions.scheduledMonthlyPayment == null ? null : roundMoney(safeOptions.scheduledMonthlyPayment),
      scheduledTermMonths: safeOptions.scheduledTermMonths == null ? null : safeOptions.scheduledTermMonths,
      assumptionTreatment: safeOptions.assumptionTreatment || null,
      sourcePaths: uniqueStrings(safeOptions.sourcePaths),
      warnings: Array.isArray(safeOptions.warnings) ? safeOptions.warnings.slice() : [],
      dataGaps: Array.isArray(safeOptions.dataGaps) ? safeOptions.dataGaps.slice() : [],
      trace: Array.isArray(safeOptions.trace) ? safeOptions.trace.slice() : []
    };
  }

  function applyMortgagePaymentsContinueTreatment(adjusted, debtPayoff, mortgage, nonMortgageDebt, mortgagePaymentInput, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const override = safeOptions.override || "continueMortgagePayments";
    const sourcePathPrefix = safeOptions.sourcePathPrefix || "incomeLossImpact.scenario.continueMortgagePayments";
    const sourceStatus = safeOptions.sourceStatus || "scenario-continue-mortgage-payments";
    const traceLabel = safeOptions.traceLabel || "continueMortgagePayments";
    const assumptionTreatment = safeOptions.assumptionTreatment || null;
    const mortgageIncluded = debtPayoffIncludesMortgage(debtPayoff, mortgage);
    const monthlyPayment = mortgagePaymentInput?.monthlyPayment || createMissingRunwayValue(["ongoingSupport.monthlyMortgagePayment"], "missing");
    const remainingTermMonths = mortgagePaymentInput?.remainingTermMonths || createMissingRunwayValue(["ongoingSupport.mortgageRemainingTermMonths"], "missing");

    if (mortgageIncluded) {
      const fallbackNonMortgageValue = debtPayoff.value != null && mortgage.value != null
        ? Math.max(0, debtPayoff.value - mortgage.value)
        : (nonMortgageDebt.value != null ? nonMortgageDebt.value : null);
      adjusted.debtPayoff = fallbackNonMortgageValue == null
        ? createMissingRunwayValue(debtPayoff.sourcePaths.concat(nonMortgageDebt.sourcePaths), "missing-non-mortgage-debt")
        : createAdjustedDebtRunwayValue(
            fallbackNonMortgageValue,
            `${sourcePathPrefix}.debtPayoffLessMortgage`,
            nonMortgageDebt.sourcePaths.concat(debtPayoff.sourcePaths).concat(mortgage.sourcePaths),
            "scenario-excludes-mortgage-payoff"
          );
      adjusted.sourceStatus = sourceStatus;
    }

    const dataGaps = [];
    if (monthlyPayment.value == null) {
      dataGaps.push(createDataGap(
        "missing-mortgage-payment",
        "Monthly mortgage payment is missing; continue-mortgage-payments scenario could not schedule mortgage payments.",
        monthlyPayment.sourcePaths
      ));
    }
    if (remainingTermMonths.value == null || remainingTermMonths.value <= 0) {
      dataGaps.push(createDataGap(
        "missing-mortgage-term",
        "Mortgage remaining term is missing; continue-mortgage-payments scenario could not schedule mortgage payments.",
        remainingTermMonths.sourcePaths
      ));
    }

    if (!dataGaps.length) {
      adjusted.scheduledObligations = {
        value: monthlyPayment.value * 12,
        monthlyAmount: monthlyPayment.value,
        termMonths: remainingTermMonths.value,
        sourcePath: `${sourcePathPrefix}.scheduledMortgagePayments`,
        sourcePaths: monthlyPayment.sourcePaths.concat(remainingTermMonths.sourcePaths),
        status: "mortgage-payments-continue",
        warnings: [],
        dataGaps: []
      };
    }

    adjusted.mortgageTreatment = createMortgageTreatmentTrace({
      override,
      payoffAlreadyIncluded: mortgageIncluded,
      scheduledAnnualPayment: dataGaps.length ? null : monthlyPayment.value * 12,
      scheduledMonthlyPayment: dataGaps.length ? null : monthlyPayment.value,
      scheduledTermMonths: dataGaps.length ? null : remainingTermMonths.value,
      assumptionTreatment,
      sourcePaths: debtPayoff.sourcePaths
        .concat(mortgage.sourcePaths)
        .concat(monthlyPayment.sourcePaths)
        .concat(remainingTermMonths.sourcePaths),
      dataGaps,
      trace: dataGaps.length
        ? [`${traceLabel} requested but mortgage payment or term facts were missing.`]
        : [`${traceLabel} removed immediate mortgage payoff when present and scheduled mortgage payments into projection points.`]
    });
    return adjusted;
  }

  function applyMortgageTreatmentOverride(debtInput, mortgagePaymentInput, options) {
    const safeDebtInput = isPlainObject(debtInput) ? debtInput : {};
    const override = resolveMortgageTreatmentOverride(options);
    const debtPayoff = isPlainObject(safeDebtInput.debtPayoff)
      ? safeDebtInput.debtPayoff
      : createMissingRunwayValue([], "missing");
    const mortgage = isPlainObject(safeDebtInput.mortgage)
      ? safeDebtInput.mortgage
      : createMissingRunwayValue(["debtPayoff.mortgageBalance"], "missing");
    const nonMortgageDebt = isPlainObject(safeDebtInput.nonMortgageDebt)
      ? safeDebtInput.nonMortgageDebt
      : createMissingRunwayValue([], "missing");
    const mortgageIncluded = debtPayoffIncludesMortgage(debtPayoff, mortgage);

    const adjusted = {
      debtPayoff,
      mortgage,
      nonMortgageDebt,
      sourceStatus: safeDebtInput.sourceStatus || "missing",
      mortgageTreatment: createMortgageTreatmentTrace({
        override,
        payoffAlreadyIncluded: mortgageIncluded,
        sourcePaths: debtPayoff.sourcePaths.concat(mortgage.sourcePaths),
        trace: ["followAssumptions preserves prepared debt and mortgage bucket behavior."]
      }),
      scheduledObligations: {
        value: 0,
        sourcePath: "incomeLossImpact.projection.scheduledObligations.none",
        sourcePaths: [],
        status: "none",
        warnings: [],
        dataGaps: []
      }
    };

    if (override === "followAssumptions") {
      if (isPreparedMortgageSupportMode(safeDebtInput.preparedMortgageTreatmentTrace)) {
        return applyMortgagePaymentsContinueTreatment(
          adjusted,
          debtPayoff,
          mortgage,
          nonMortgageDebt,
          mortgagePaymentInput,
          {
            override,
            sourcePathPrefix: "incomeLossImpact.assumptions.followAssumptions",
            sourceStatus: "assumption-controls-continue-mortgage-payments",
            traceLabel: "followAssumptions mortgage support",
            assumptionTreatment: "mortgageSupport"
          }
        );
      }
      return adjusted;
    }

    if (override === "payOffMortgage") {
      if (mortgage.value == null) {
        adjusted.mortgageTreatment = createMortgageTreatmentTrace({
          override,
          payoffAlreadyIncluded: false,
          sourcePaths: mortgage.sourcePaths,
          dataGaps: [
            createDataGap(
              "missing-mortgage-payoff-amount",
              "Mortgage payoff amount is missing; pay-off-mortgage scenario could not add an immediate mortgage obligation.",
              mortgage.sourcePaths
            )
          ],
          trace: ["payOffMortgage requested but no mortgage payoff amount was available."]
        });
        return adjusted;
      }

      if (mortgageIncluded) {
        adjusted.mortgageTreatment = createMortgageTreatmentTrace({
          override,
          immediatePayoffAmount: 0,
          payoffAlreadyIncluded: true,
          sourcePaths: debtPayoff.sourcePaths.concat(mortgage.sourcePaths),
          trace: ["payOffMortgage did not add mortgage again because the prepared debt payoff bucket already includes mortgage."]
        });
        return adjusted;
      }

      adjusted.debtPayoff = createAdjustedDebtRunwayValue(
        (debtPayoff.value == null ? 0 : debtPayoff.value) + mortgage.value,
        "incomeLossImpact.scenario.payOffMortgage.debtPayoff",
        debtPayoff.sourcePaths.concat(mortgage.sourcePaths),
        "scenario-payoff-mortgage"
      );
      adjusted.sourceStatus = "scenario-payoff-mortgage";
      adjusted.mortgageTreatment = createMortgageTreatmentTrace({
        override,
        immediatePayoffAmount: mortgage.value,
        payoffAlreadyIncluded: false,
        sourcePaths: debtPayoff.sourcePaths.concat(mortgage.sourcePaths),
        trace: ["payOffMortgage added mortgage as a preview-only immediate obligation."]
      });
      return adjusted;
    }

    return applyMortgagePaymentsContinueTreatment(
      adjusted,
      debtPayoff,
      mortgage,
      nonMortgageDebt,
      mortgagePaymentInput,
      { override }
    );
  }

  function resolveFinancialRunwayInputs(lensModel, options) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const assetInput = resolveAssetRunwayInput(safeLensModel);
    const debtInput = applyMortgageTreatmentOverride(
      resolveDebtRunwayInput(safeLensModel),
      resolveMortgagePaymentRunwayInput(safeLensModel),
      options
    );
    const incomeOffsets = resolveIncomeOffsetRunwayInput(safeLensModel);
    const survivorIncomeDelayWarnings = incomeOffsets.survivorIncomeStartDelayMonths > 0
      ? [
          createWarning(
            "survivor-income-delay-projection-deferred",
            "Survivor income delay is traced but not prorated into projection points in this scaffold."
          )
        ]
      : [];

    return {
      availableAtDeath: {
        coverage: resolveCoverageRunwayInput(safeLensModel),
        assets: assetInput.assets,
        projectedAssetOffsetCandidate: assetInput.projectedAssetOffsetCandidate
      },
      immediateObligations: {
        finalExpenses: firstRunwayValue(safeLensModel, [
          { path: "finalExpenses.totalFinalExpenseNeed", status: "prepared-bucket" }
        ]),
        transitionNeeds: firstRunwayValue(safeLensModel, [
          { path: "transitionNeeds.totalTransitionNeed", status: "prepared-bucket" }
        ]),
        debtPayoff: debtInput.debtPayoff,
        mortgage: debtInput.mortgage,
        nonMortgageDebt: debtInput.nonMortgageDebt,
        debtSourceStatus: debtInput.sourceStatus,
        mortgageTreatment: debtInput.mortgageTreatment
      },
      annualNeeds: resolveAnnualNeedRunwayInput(safeLensModel, options),
      incomeOffsets,
      projection: {
        assetGrowth: resolveAssetGrowthRunwayInput(safeLensModel, assetInput),
        survivorIncomeDelay: {
          months: incomeOffsets.survivorIncomeStartDelayMonths,
          status: incomeOffsets.survivorIncomeStartDelayMonths > 0 ? "deferred" : "not-applicable",
          sourcePaths: ["survivorScenario.survivorIncomeStartDelayMonths"],
          warnings: survivorIncomeDelayWarnings
        },
        scheduledObligations: debtInput.scheduledObligations,
        mortgageTreatment: debtInput.mortgageTreatment
      },
      milestones: {
        dependents: firstRunwayValue(safeLensModel, [
          { path: "educationSupport.linkedDependentCount", status: "available" }
        ]),
        educationWindows: firstRunwayValue(safeLensModel, [
          { path: "educationSupport.totalEducationFundingNeed", status: "milestone-only" },
          { path: "educationSupport.linkedDependentEducationFundingNeed", status: "milestone-only" }
        ]),
        mortgageTerm: firstRunwayValue(safeLensModel, [
          { path: "ongoingSupport.mortgageRemainingTermMonths", status: "available" }
        ]),
        depletionDate: createMissingRunwayValue(["incomeLossImpact.formula.depletionDate"], "calculated-after-runway")
      }
    };
  }

  function resolveHouseholdPositionStartingResourcesInput(lensModel) {
    return firstRunwayValue(lensModel, [
      { path: "treatedAssetOffsets.totalTreatedAssetValue", status: "treated-current-assets" }
    ]);
  }

  function resolveHouseholdPositionRecurringIncomeInput(lensModel) {
    const insuredNetIncome = firstRunwayValue(lensModel, [
      { path: "incomeBasis.insuredNetAnnualIncome", status: "net-income" }
    ]);
    const spouseNetIncome = firstRunwayValue(lensModel, [
      { path: "incomeBasis.spouseOrPartnerNetAnnualIncome", status: "net-income" }
    ]);
    const knownIncome = sumKnownValues([
      { value: insuredNetIncome.value, sourcePath: insuredNetIncome.sourcePath },
      { value: spouseNetIncome.value, sourcePath: spouseNetIncome.sourcePath }
    ]);

    if (knownIncome.value == null) {
      return createMissingRunwayValue(
        uniqueStrings(insuredNetIncome.sourcePaths.concat(spouseNetIncome.sourcePaths)),
        "missing-net-household-income"
      );
    }

    return createRunwayValue(
      knownIncome.value,
      "incomeBasis.insuredNetAnnualIncome + incomeBasis.spouseOrPartnerNetAnnualIncome",
      knownIncome.sourcePaths,
      "net-household-income"
    );
  }

  function resolveHouseholdPositionRecurringExpenseInput(lensModel) {
    const annualExpenses = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.annualTotalEssentialSupportCost", status: "prepared-bucket" }
    ]);
    if (annualExpenses.value != null) {
      return annualExpenses;
    }

    const monthlyExpenses = firstRunwayValue(lensModel, [
      { path: "ongoingSupport.monthlyTotalEssentialSupportCost", status: "monthly-prepared-bucket" }
    ]);
    if (monthlyExpenses.value != null) {
      return createRunwayValue(
        monthlyExpenses.value * 12,
        "ongoingSupport.monthlyTotalEssentialSupportCost * 12",
        monthlyExpenses.sourcePaths,
        "monthly-annualized-prepared-bucket"
      );
    }

    return createMissingRunwayValue(
      annualExpenses.sourcePaths.concat(monthlyExpenses.sourcePaths),
      "missing-recurring-expenses"
    );
  }

  function buildHouseholdFinancialPositionInput(lensModel, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const startingResources = resolveHouseholdPositionStartingResourcesInput(lensModel);
    const recurringIncome = resolveHouseholdPositionRecurringIncomeInput(lensModel);
    const recurringExpenses = resolveHouseholdPositionRecurringExpenseInput(lensModel);
    const assetGrowth = resolveHouseholdPositionAssetGrowthInput(
      lensModel,
      startingResources,
      safeOptions
    );

    return {
      asOfDate: safeOptions.asOfDate,
      targetDate: safeOptions.targetDate,
      startingResources: {
        value: startingResources.value,
        status: startingResources.status,
        sourcePath: startingResources.sourcePath,
        sourcePaths: startingResources.sourcePaths
      },
      recurringIncome: {
        value: recurringIncome.value,
        frequency: "annual",
        status: recurringIncome.status,
        sourcePath: recurringIncome.sourcePath,
        sourcePaths: recurringIncome.sourcePaths
      },
      recurringExpenses: {
        value: recurringExpenses.value,
        frequency: "annual",
        status: recurringExpenses.status,
        sourcePath: recurringExpenses.sourcePath,
        sourcePaths: recurringExpenses.sourcePaths
      },
      scheduledObligations: [],
      assetGrowth,
      options: {
        product: "generic-household-position",
        scheduledObligationsPolicy: "none-added-mortgage-already-in-recurring-expenses",
        projectionMode: assetGrowth.active ? "asset-growth" : "current-dollar",
        assetGrowthStatus: assetGrowth.status,
        includePreTargetContext: safeOptions.includePreTargetContext === true,
        preTargetMonths: toOptionalNumber(safeOptions.preTargetMonths),
        preTargetMode: normalizeString(safeOptions.preTargetMode)
      }
    };
  }

  function applyHouseholdAssetGrowthDiagnostics(householdPosition, assetGrowthInput) {
    if (!isPlainObject(householdPosition) || !isPlainObject(assetGrowthInput)) {
      return householdPosition;
    }

    householdPosition.warnings = (Array.isArray(householdPosition.warnings)
      ? householdPosition.warnings
      : []).concat(assetGrowthInput.warnings || []);
    householdPosition.dataGaps = (Array.isArray(householdPosition.dataGaps)
      ? householdPosition.dataGaps
      : []).concat(assetGrowthInput.dataGaps || []);
    householdPosition.sourcePaths = uniqueStrings(
      (householdPosition.sourcePaths || []).concat(assetGrowthInput.sourcePaths || [])
    );
    householdPosition.trace = isPlainObject(householdPosition.trace)
      ? householdPosition.trace
      : {};
    householdPosition.trace.assetGrowth = isPlainObject(assetGrowthInput.trace)
      ? assetGrowthInput.trace
      : null;
    householdPosition.trace.sourcePaths = uniqueStrings(
      (householdPosition.trace.sourcePaths || []).concat(assetGrowthInput.sourcePaths || [])
    );
    if (isPlainObject(householdPosition.inputs?.assetGrowth)) {
      householdPosition.inputs.assetGrowth.trace = isPlainObject(assetGrowthInput.trace)
        ? assetGrowthInput.trace
        : null;
      householdPosition.inputs.assetGrowth.warnings = (assetGrowthInput.warnings || []).slice();
      householdPosition.inputs.assetGrowth.dataGaps = (assetGrowthInput.dataGaps || []).slice();
    }
    return householdPosition;
  }

  function createHouseholdFinancialPositionFallback(input, fallbackStartingResources) {
    const fallbackResources = isPlainObject(fallbackStartingResources)
      ? fallbackStartingResources
      : {};
    const inputStartingBalance = toOptionalNumber(input?.startingResources?.value);
    const fallbackStartingBalance = toOptionalNumber(fallbackResources.value);
    const startingBalance = inputStartingBalance == null ? fallbackStartingBalance : inputStartingBalance;
    const asOfDate = parseDateOnly(input?.asOfDate);
    const targetDate = parseDateOnly(input?.targetDate);
    const sourcePaths = uniqueStrings(
      (input?.startingResources?.sourcePaths || []).concat(fallbackResources.sourcePaths || [])
    );
    return {
      status: "helper-unavailable-current-assets-fallback",
      asOfDate: asOfDate ? asOfDate.normalizedDate : null,
      targetDate: targetDate ? targetDate.normalizedDate : null,
      durationMonths: asOfDate && targetDate
        ? calculateWholeMonthsBetweenDates(asOfDate.date, targetDate.date)
        : null,
      startingBalance: startingBalance == null ? null : roundMoney(startingBalance),
      targetBalance: startingBalance == null ? null : roundMoney(startingBalance),
      totalIncome: 0,
      totalExpenses: 0,
      totalScheduledObligations: 0,
      totalAssetGrowth: 0,
      preTargetPoints: [],
      points: [],
      inputs: input,
      sourcePaths,
      warnings: [
        createWarning(
          "missing-household-financial-position-helper",
          "Household financial position helper was unavailable; current treated assets were used as the target asset position."
        )
      ],
      dataGaps: [],
      trace: {
        formula: ["household financial position helper unavailable; no pre-target projection points were generated."],
        sourcePaths
      }
    };
  }

  function calculateHouseholdPositionForRunway(lensModel, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const input = buildHouseholdFinancialPositionInput(lensModel, safeOptions);
    let result;
    if (typeof lensAnalysis.calculateHouseholdFinancialPosition !== "function") {
      result = createHouseholdFinancialPositionFallback(input, safeOptions.fallbackStartingResources);
    } else {
      result = lensAnalysis.calculateHouseholdFinancialPosition(input);
    }
    return applyHouseholdAssetGrowthDiagnostics(result, input.assetGrowth);
  }

  function addUnique(target, values) {
    (Array.isArray(values) ? values : []).forEach(function (value) {
      const normalized = normalizeString(value);
      if (normalized && !target.includes(normalized)) {
        target.push(normalized);
      }
    });
  }

  function createEvent(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return {
      id: normalizeString(safeOptions.id),
      type: normalizeString(safeOptions.type),
      date: safeOptions.date || null,
      age: safeOptions.age == null ? null : safeOptions.age,
      label: normalizeString(safeOptions.label),
      amount: safeOptions.amount == null ? null : roundMoney(safeOptions.amount),
      sourcePaths: Array.isArray(safeOptions.sourcePaths) ? safeOptions.sourcePaths.slice() : [],
      confidence: normalizeString(safeOptions.confidence) || "unknown",
      warnings: Array.isArray(safeOptions.warnings) ? safeOptions.warnings.slice() : []
    };
  }

  function createSummaryCard(id, title, value, displayValue, status, sourcePaths) {
    return {
      id,
      title,
      value: value == null ? null : value,
      displayValue,
      status,
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths.slice() : []
    };
  }

  function addDataGap(output, code, label, sourcePaths, details) {
    const dataGap = createDataGap(code, label, sourcePaths, details);
    output.dataGaps.push(dataGap);
    output.timelineEvents.push(createEvent({
      id: `data-gap-${code}`,
      type: "dataGap",
      date: output.selectedDeath.date,
      age: output.selectedDeath.age,
      label,
      sourcePaths,
      confidence: "missing",
      warnings: [code]
    }));
    return dataGap;
  }

  function resolveProjectionYears(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const scenario = isPlainObject(safeOptions.scenario) ? safeOptions.scenario : {};
    const requestedProjectionYears = scenario.projectionHorizonYears != null
      ? scenario.projectionHorizonYears
      : safeOptions.projectionYears;
    const projectionYears = Math.round(
      clampNumber(
        requestedProjectionYears,
        MIN_RUNWAY_PROJECTION_YEARS,
        MAX_RUNWAY_PROJECTION_YEARS
      ) || DEFAULT_RUNWAY_PROJECTION_YEARS
    );
    return Math.max(MIN_RUNWAY_PROJECTION_YEARS, Math.min(MAX_RUNWAY_PROJECTION_YEARS, projectionYears));
  }

  function resolveMortgageTreatmentOverride(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const scenario = isPlainObject(safeOptions.scenario) ? safeOptions.scenario : {};
    const requestedOverride = normalizeString(scenario.mortgageTreatmentOverride);
    return MORTGAGE_TREATMENT_OVERRIDES.includes(requestedOverride)
      ? requestedOverride
      : "followAssumptions";
  }

  function normalizeScheduledObligationProjectionInput(value) {
    if (isPlainObject(value)) {
      const monthlyAmount = toOptionalNumber(value.monthlyAmount);
      const termMonths = toOptionalNumber(value.termMonths);
      const annualAmount = toOptionalNumber(value.value) || (monthlyAmount == null ? 0 : monthlyAmount * 12);
      return {
        annualAmount: Math.max(0, annualAmount || 0),
        monthlyAmount: monthlyAmount == null ? null : Math.max(0, monthlyAmount),
        termMonths: termMonths == null ? null : Math.max(0, Math.round(termMonths)),
        sourcePaths: uniqueStrings(value.sourcePaths),
        status: normalizeString(value.status)
      };
    }

    const annualAmount = toOptionalNumber(value);
    return {
      annualAmount: Math.max(0, annualAmount || 0),
      monthlyAmount: null,
      termMonths: null,
      sourcePaths: [],
      status: annualAmount == null ? "none" : "annual"
    };
  }

  function getScheduledObligationAmountForProjectionYear(scheduledObligations, yearIndex) {
    if (!scheduledObligations || yearIndex <= 0) {
      return 0;
    }

    if (scheduledObligations.monthlyAmount != null && scheduledObligations.termMonths != null) {
      const startMonth = (yearIndex - 1) * 12;
      const monthsInYear = Math.max(0, Math.min(12, scheduledObligations.termMonths - startMonth));
      return scheduledObligations.monthlyAmount * monthsInYear;
    }

    return scheduledObligations.annualAmount || 0;
  }

  function getScheduledObligationAmountForMonth(scheduledObligations, monthIndex) {
    if (!scheduledObligations || monthIndex <= 0) {
      return 0;
    }

    if (scheduledObligations.monthlyAmount == null) {
      return 0;
    }

    if (scheduledObligations.termMonths != null && monthIndex > scheduledObligations.termMonths) {
      return 0;
    }

    return scheduledObligations.monthlyAmount;
  }

  function buildRunwayProjectionPoints(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const deathDate = parseDateOnly(safeOptions.selectedDeathDate);
    const selectedDeathAge = toOptionalNumber(safeOptions.selectedDeathAge);
    const netAvailableResources = toOptionalNumber(safeOptions.netAvailableResources);
    const annualShortfall = toOptionalNumber(safeOptions.annualShortfall);
    const annualNeed = toOptionalNumber(safeOptions.annualNeed);
    const survivorIncomeOffset = toOptionalNumber(safeOptions.survivorIncomeOffset);
    const growthRate = Math.max(0, toOptionalNumber(safeOptions.growthRate) || 0);
    const scheduledObligations = normalizeScheduledObligationProjectionInput(safeOptions.scheduledObligations);
    const sourcePaths = uniqueStrings(safeOptions.sourcePaths).concat(scheduledObligations.sourcePaths);
    const projectionYears = resolveProjectionYears(safeOptions.options);

    if (netAvailableResources == null || annualShortfall == null || !deathDate) {
      return [];
    }

    const effectiveShortfall = Math.max(0, annualShortfall);
    const points = [];
    let startingBalance = netAvailableResources;
    for (let yearIndex = 0; yearIndex <= projectionYears; yearIndex += 1) {
      const growthAmount = yearIndex === 0 || startingBalance <= 0
        ? 0
        : startingBalance * (growthRate / 100);
      const yearScheduledObligations = getScheduledObligationAmountForProjectionYear(scheduledObligations, yearIndex);
      const endingBalance = yearIndex === 0
        ? netAvailableResources
        : startingBalance + growthAmount - effectiveShortfall - yearScheduledObligations;
      const pointDate = addYears(deathDate.date, yearIndex);
      let status = "available";
      if (yearIndex === 0) {
        status = "starting";
      } else if (effectiveShortfall <= 0 && yearScheduledObligations <= 0) {
        status = "no-shortfall";
      } else if (startingBalance <= 0 || endingBalance <= 0) {
        status = "depleted";
      }

      points.push({
        yearIndex,
        date: formatDateOnly(pointDate),
        age: selectedDeathAge == null ? null : roundYears(selectedDeathAge + yearIndex),
        startingBalance: roundMoney(startingBalance),
        growthAmount: roundMoney(growthAmount),
        growthRate: roundYears(growthRate),
        annualNeed: annualNeed == null ? null : roundMoney(annualNeed),
        survivorIncomeOffset: survivorIncomeOffset == null ? null : roundMoney(survivorIncomeOffset),
        annualShortfall: roundMoney(effectiveShortfall),
        scheduledObligations: roundMoney(yearScheduledObligations),
        endingBalance: roundMoney(endingBalance),
        status,
        sourcePaths
      });

      startingBalance = endingBalance;
    }

    return points;
  }

  function getRunwayDurationYearsFromProjectionPoints(points) {
    const safePoints = Array.isArray(points) ? points : [];
    for (let index = 1; index < safePoints.length; index += 1) {
      const point = safePoints[index];
      if (!isPlainObject(point) || point.status !== "depleted") {
        continue;
      }

      const startingBalance = toOptionalNumber(point.startingBalance);
      const growthAmount = toOptionalNumber(point.growthAmount) || 0;
      const annualShortfall = toOptionalNumber(point.annualShortfall) || 0;
      const scheduledObligations = toOptionalNumber(point.scheduledObligations) || 0;
      const annualUse = annualShortfall + scheduledObligations;
      if (startingBalance == null || annualUse <= 0) {
        return Math.max(0, index - 1);
      }

      const availableBeforeUse = Math.max(0, startingBalance + growthAmount);
      const yearFraction = Math.max(0, Math.min(1, availableBeforeUse / annualUse));
      return roundYears(Math.max(0, point.yearIndex - 1 + yearFraction));
    }

    return null;
  }

  function createScenarioTimelineBase() {
    return {
      version: 1,
      scenario: {
        deathAge: null,
        deathDate: null,
        projectionHorizonYears: DEFAULT_RUNWAY_PROJECTION_YEARS,
        mortgageTreatmentOverride: "followAssumptions",
        source: "unresolved",
        status: "unresolved"
      },
      axis: {
        startDate: null,
        deathDate: null,
        endDate: null,
        preDeathYears: PRE_DEATH_CONTEXT_YEARS,
        monthlyResolutionMonths: MONTHLY_RESOLUTION_MONTHS_AFTER_DEATH,
        postMonth24Resolution: "annual"
      },
      resourceSeries: {
        yAxis: "remainingAvailableResources",
        points: []
      },
      eventLanes: {
        resources: [],
        housing: [],
        education: [],
        income: [],
        dataQuality: []
      },
      pivotalEvents: {
        risks: [],
        stable: []
      },
      dataGaps: [],
      warnings: [],
      trace: {
        sourcePaths: [],
        formula: [],
        deferred: []
      }
    };
  }

  function createScenarioTimelinePoint(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const endingBalance = toOptionalNumber(safeOptions.endingBalance);
    const displayedBalance = endingBalance;
    const accumulatedUnmetNeed = endingBalance == null ? 0 : Math.max(0, -endingBalance);
    return {
      id: normalizeString(safeOptions.id),
      date: safeOptions.date || null,
      age: safeOptions.age == null ? null : roundYears(safeOptions.age),
      relativeMonthIndex: safeOptions.relativeMonthIndex == null ? null : safeOptions.relativeMonthIndex,
      relativeYear: safeOptions.relativeYear == null ? null : roundYears(safeOptions.relativeYear),
      phase: normalizeString(safeOptions.phase),
      resolution: normalizeString(safeOptions.resolution),
      startingBalance: safeOptions.startingBalance == null ? null : roundMoney(safeOptions.startingBalance),
      growthAmount: safeOptions.growthAmount == null ? null : roundMoney(safeOptions.growthAmount),
      householdNeed: safeOptions.householdNeed == null ? null : roundMoney(safeOptions.householdNeed),
      survivorIncomeOffset: safeOptions.survivorIncomeOffset == null ? null : roundMoney(safeOptions.survivorIncomeOffset),
      annualShortfall: safeOptions.annualShortfall == null ? null : roundMoney(safeOptions.annualShortfall),
      scheduledObligations: safeOptions.scheduledObligations == null ? null : roundMoney(safeOptions.scheduledObligations),
      endingBalance: endingBalance == null ? null : roundMoney(endingBalance),
      displayedBalance: displayedBalance == null ? null : roundMoney(displayedBalance),
      accumulatedUnmetNeed: roundMoney(accumulatedUnmetNeed),
      status: normalizeString(safeOptions.status),
      sourcePaths: Array.isArray(safeOptions.sourcePaths) ? safeOptions.sourcePaths.slice() : []
    };
  }

  function createScenarioLaneEvent(options) {
    const safeOptions = isPlainObject(options) ? options : {};
    return {
      id: normalizeString(safeOptions.id),
      type: normalizeString(safeOptions.type),
      date: safeOptions.date || null,
      age: safeOptions.age == null ? null : roundYears(safeOptions.age),
      relativeMonthIndex: safeOptions.relativeMonthIndex == null ? null : safeOptions.relativeMonthIndex,
      label: normalizeString(safeOptions.label),
      lane: normalizeString(safeOptions.lane),
      status: normalizeString(safeOptions.status),
      sourcePaths: Array.isArray(safeOptions.sourcePaths) ? safeOptions.sourcePaths.slice() : []
    };
  }

  function buildScenarioTimeline(output, input) {
    const scenarioTimeline = createScenarioTimelineBase();
    const safeInput = isPlainObject(input) ? input : {};
    const options = isPlainObject(safeInput.options) ? safeInput.options : {};
    const financialRunway = isPlainObject(output?.financialRunway) ? output.financialRunway : {};
    const deathDate = parseDateOnly(output?.selectedDeath?.date);
    const deathAge = toOptionalNumber(output?.selectedDeath?.age);
    const projectionHorizonYears = resolveProjectionYears(options);
    const mortgageTreatmentOverride = resolveMortgageTreatmentOverride(options);
    const evaluateIncomeImpactWarningEvents = lensAnalysis.evaluateIncomeImpactWarningEvents;

    scenarioTimeline.scenario = {
      deathAge: deathAge == null ? null : deathAge,
      deathDate: deathDate ? deathDate.normalizedDate : null,
      projectionHorizonYears,
      mortgageTreatmentOverride,
      source: output?.selectedDeath?.source || "unresolved",
      status: output?.selectedDeath?.status || "unresolved"
    };
    scenarioTimeline.axis.preDeathYears = PRE_DEATH_CONTEXT_YEARS;
    scenarioTimeline.axis.monthlyResolutionMonths = MONTHLY_RESOLUTION_MONTHS_AFTER_DEATH;
    scenarioTimeline.axis.postMonth24Resolution = "annual";
    scenarioTimeline.dataGaps = Array.isArray(output?.dataGaps) ? output.dataGaps.slice() : [];
    scenarioTimeline.warnings = Array.isArray(output?.warnings) ? output.warnings.slice() : [];
    scenarioTimeline.trace.sourcePaths = uniqueStrings(financialRunway.sourcePaths || []);
    scenarioTimeline.trace.formula = [
      "scenarioTimeline.resourceSeries uses remaining available resources for the y-axis.",
      "pre-death points use reusable household financial position projection points when available.",
      "post-death points use monthly resolution for the first 24 months and annual resolution after month 24.",
      "displayedBalance preserves endingBalance, including below-zero values; accumulatedUnmetNeed also tracks negative balances separately.",
      "mortgageTreatmentOverride changes preview-only immediate mortgage payoff or scheduled mortgage payments without changing saved assumptions or recommendations."
    ];
    scenarioTimeline.trace.deferred = [
      "pivotal-warning-events-library",
      "housing-risk-marker-evaluation",
      "education-risk-marker-evaluation"
    ];

    function applyPivotalWarningEvents() {
      if (typeof evaluateIncomeImpactWarningEvents !== "function") {
        return;
      }

      const evaluatedEvents = evaluateIncomeImpactWarningEvents({
        scenarioTimeline,
        financialRunway,
        timelineEvents: output.timelineEvents,
        dataGaps: output.dataGaps,
        warnings: output.warnings,
        lensModel: isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {}
      });

      if (!isPlainObject(evaluatedEvents)) {
        return;
      }

      scenarioTimeline.pivotalEvents = {
        risks: Array.isArray(evaluatedEvents.risks) ? evaluatedEvents.risks.slice() : [],
        stable: Array.isArray(evaluatedEvents.stable) ? evaluatedEvents.stable.slice() : []
      };
      scenarioTimeline.trace.warningEvents = isPlainObject(evaluatedEvents.trace)
        ? {
            evaluatedDefinitions: Array.isArray(evaluatedEvents.trace.evaluatedDefinitions)
              ? evaluatedEvents.trace.evaluatedDefinitions.slice()
              : [],
            deferredDefinitions: Array.isArray(evaluatedEvents.trace.deferredDefinitions)
              ? evaluatedEvents.trace.deferredDefinitions.slice()
              : [],
            source: evaluatedEvents.trace.source || "income-impact-warning-events-library"
          }
        : {
            evaluatedDefinitions: [],
            deferredDefinitions: [],
            source: "income-impact-warning-events-library"
          };
      scenarioTimeline.trace.deferred = scenarioTimeline.trace.deferred.filter(function (item) {
        return item !== "pivotal-warning-events-library";
      });
    }

    if (!deathDate) {
      scenarioTimeline.trace.formula.push("scenarioTimeline points were not generated because selected death date is unavailable.");
      applyPivotalWarningEvents();
      return scenarioTimeline;
    }

    const axisStart = addYears(deathDate.date, -PRE_DEATH_CONTEXT_YEARS);
    const axisEnd = addYears(deathDate.date, projectionHorizonYears);
    scenarioTimeline.axis.startDate = formatDateOnly(axisStart);
    scenarioTimeline.axis.deathDate = deathDate.normalizedDate;
    scenarioTimeline.axis.endDate = formatDateOnly(axisEnd);

    const netAvailableResources = toOptionalNumber(financialRunway.netAvailableResources);
    const annualShortfall = toOptionalNumber(financialRunway.annualShortfall);
    const annualNeed = toOptionalNumber(financialRunway.annualHouseholdNeed);
    const survivorIncomeOffset = toOptionalNumber(financialRunway.annualSurvivorIncome);
    const growthRate = toOptionalNumber(financialRunway.inputs?.projection?.assetGrowth?.growthRate) || 0;
    const scheduledObligations = normalizeScheduledObligationProjectionInput(
      financialRunway.scheduledObligations || financialRunway.inputs?.projection?.scheduledObligations
    );
    const mortgageTreatment = financialRunway.mortgageTreatment || financialRunway.inputs?.projection?.mortgageTreatment;
    const sourcePaths = uniqueStrings(financialRunway.sourcePaths || []);
    if (netAvailableResources == null || annualShortfall == null) {
      scenarioTimeline.trace.formula.push("scenarioTimeline resource points require net available resources and annual shortfall.");
      applyPivotalWarningEvents();
      return scenarioTimeline;
    }

    const householdPosition = isPlainObject(financialRunway.householdPosition)
      ? financialRunway.householdPosition
      : null;
    const explicitHouseholdPositionAtTarget = toOptionalNumber(financialRunway.householdPositionAtTarget);
    const householdPositionTargetBalance = explicitHouseholdPositionAtTarget == null
      ? toOptionalNumber(householdPosition?.targetBalance)
      : explicitHouseholdPositionAtTarget;
    const householdPositionTargetSourcePaths = uniqueStrings(
      ["householdPosition.targetBalance", "treatedAssetOffsets.totalTreatedAssetValue"]
        .concat(householdPosition?.sourcePaths || [])
    );
    const householdPositionPoints = Array.isArray(householdPosition?.points)
      ? householdPosition.points
      : [];
    const householdPreTargetPoints = Array.isArray(householdPosition?.preTargetPoints)
      ? householdPosition.preTargetPoints
      : [];
    let preDeathHouseholdPointCount = 0;

    householdPreTargetPoints.forEach(function (point) {
      if (!isPlainObject(point)) {
        return;
      }

      const parsedPointDate = parseDateOnly(point.date);
      if (!parsedPointDate || parsedPointDate.date < axisStart || parsedPointDate.date >= deathDate.date) {
        return;
      }

      const relativeMonthIndex = calculateWholeMonthsBetweenDates(deathDate.date, parsedPointDate.date);
      const monthlyNetCashFlow = toOptionalNumber(point.netCashFlow);
      const monthlyExpenses = toOptionalNumber(point.expenses);
      const pointStatus = normalizeString(point.status) || "modeledBackcast";
      const pointResolution = pointStatus === "currentPositionContext"
        ? "currentPositionContextMonthly"
        : "modeledBackcastMonthly";
      scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
        id: `pre-target-household-position-modeled-backcast-month-${Math.abs(toOptionalNumber(point.monthIndex) || preDeathHouseholdPointCount + 1)}`,
        date: parsedPointDate.normalizedDate,
        age: deathAge == null || relativeMonthIndex == null ? null : deathAge + relativeMonthIndex / 12,
        relativeMonthIndex,
        relativeYear: relativeMonthIndex == null ? null : relativeMonthIndex / 12,
        phase: "preDeath",
        resolution: pointResolution,
        startingBalance: point.startingBalance,
        growthAmount: 0,
        householdNeed: monthlyExpenses == null ? annualNeed : monthlyExpenses * 12,
        survivorIncomeOffset: null,
        annualShortfall: monthlyNetCashFlow == null ? null : Math.max(0, -monthlyNetCashFlow * 12),
        scheduledObligations: point.scheduledObligations,
        endingBalance: point.endingBalance,
        status: pointStatus,
        sourcePaths: uniqueStrings(sourcePaths.concat(point.sourcePaths || []))
      }));
      preDeathHouseholdPointCount += 1;
    });

    householdPositionPoints.forEach(function (point) {
      if (!isPlainObject(point) || point.monthIndex === householdPosition.durationMonths) {
        return;
      }

      const parsedPointDate = parseDateOnly(point.date);
      if (!parsedPointDate || parsedPointDate.date < axisStart || parsedPointDate.date >= deathDate.date) {
        return;
      }

      const relativeMonthIndex = calculateWholeMonthsBetweenDates(deathDate.date, parsedPointDate.date);
      const monthlyNetCashFlow = toOptionalNumber(point.netCashFlow);
      const monthlyExpenses = toOptionalNumber(point.expenses);
      scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
        id: `pre-target-household-position-month-${point.monthIndex}`,
        date: parsedPointDate.normalizedDate,
        age: deathAge == null || relativeMonthIndex == null ? null : deathAge + relativeMonthIndex / 12,
        relativeMonthIndex,
        relativeYear: relativeMonthIndex == null ? null : relativeMonthIndex / 12,
        phase: "preDeath",
        resolution: "monthly",
        startingBalance: point.startingBalance,
        growthAmount: point.growth,
        householdNeed: monthlyExpenses == null ? annualNeed : monthlyExpenses * 12,
        survivorIncomeOffset: null,
        annualShortfall: monthlyNetCashFlow == null ? null : Math.max(0, -monthlyNetCashFlow * 12),
        scheduledObligations: point.scheduledObligations,
        endingBalance: point.endingBalance,
        status: point.status || "projected",
        sourcePaths: uniqueStrings(sourcePaths.concat(point.sourcePaths || []))
      }));
      preDeathHouseholdPointCount += 1;
    });

    if (!preDeathHouseholdPointCount && !householdPosition) {
      scenarioTimeline.trace.formula.push("flat pre-death fallback used because household financial position output was unavailable.");
      for (let yearOffset = -PRE_DEATH_CONTEXT_YEARS; yearOffset < 0; yearOffset += 1) {
        const pointDate = addYears(deathDate.date, yearOffset);
        scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
          id: `pre-death-year-${Math.abs(yearOffset)}`,
          date: formatDateOnly(pointDate),
          age: deathAge == null ? null : deathAge + yearOffset,
          relativeMonthIndex: yearOffset * 12,
          relativeYear: yearOffset,
          phase: "preDeath",
          resolution: "baseline",
          startingBalance: netAvailableResources,
          growthAmount: 0,
          householdNeed: annualNeed,
          survivorIncomeOffset,
          annualShortfall,
          scheduledObligations: 0,
          endingBalance: netAvailableResources,
          status: "context",
          sourcePaths
        }));
      }
    } else if (!preDeathHouseholdPointCount) {
      scenarioTimeline.trace.formula.push("pre-death household position points were not generated because household position inputs had data gaps or fell outside the visible pre-death context.");
    }

    if (householdPositionTargetBalance != null) {
      scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
        id: "pre-death-household-position-target",
        date: deathDate.normalizedDate,
        age: deathAge,
        relativeMonthIndex: 0,
        relativeYear: 0,
        phase: "preDeath",
        resolution: "targetThreshold",
        startingBalance: householdPositionTargetBalance,
        growthAmount: 0,
        householdNeed: annualNeed,
        survivorIncomeOffset: null,
        annualShortfall: null,
        scheduledObligations: 0,
        endingBalance: householdPositionTargetBalance,
        status: "preDeathTarget",
        sourcePaths: uniqueStrings(sourcePaths.concat(householdPositionTargetSourcePaths))
      }));
      scenarioTimeline.trace.formula.push("pre-death target threshold point uses householdPosition.targetBalance before death benefits and immediate death obligations are applied.");
    }

    scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
      id: "death-point",
      date: deathDate.normalizedDate,
      age: deathAge,
      relativeMonthIndex: 0,
      relativeYear: 0,
      phase: "death",
      resolution: "death",
      startingBalance: netAvailableResources,
      growthAmount: 0,
      householdNeed: annualNeed,
      survivorIncomeOffset,
      annualShortfall,
      scheduledObligations: 0,
      endingBalance: netAvailableResources,
      status: netAvailableResources <= 0 ? "depleted" : "starting",
      sourcePaths
    }));

    scenarioTimeline.eventLanes.resources.push(createScenarioLaneEvent({
      id: "death-marker",
      type: "death",
      date: deathDate.normalizedDate,
      age: deathAge,
      relativeMonthIndex: 0,
      label: "Death scenario begins",
      lane: "resources",
      status: "scenario-marker",
      sourcePaths: ["selectedDeathDate", "selectedDeathAge", "profileFacts.clientDateOfBirth"]
    }));

    const mortgagePaymentsContinueActive = mortgageTreatment?.override === "continueMortgagePayments"
      || mortgageTreatment?.assumptionTreatment === "mortgageSupport";

    if (mortgageTreatment?.override === "payOffMortgage") {
      scenarioTimeline.eventLanes.housing.push(createScenarioLaneEvent({
        id: "mortgage-payoff-at-death",
        type: "mortgagePayoffAtDeath",
        date: deathDate.normalizedDate,
        age: deathAge,
        relativeMonthIndex: 0,
        label: mortgageTreatment.payoffAlreadyIncluded
          ? "Mortgage payoff already included"
          : "Mortgage payoff at death",
        lane: "housing",
        status: mortgageTreatment.payoffAlreadyIncluded ? "included-in-prepared-debt" : "scenario-override",
        sourcePaths: mortgageTreatment.sourcePaths
      }));
    } else if (mortgagePaymentsContinueActive) {
      if (scheduledObligations.annualAmount > 0 && scheduledObligations.termMonths != null) {
        scenarioTimeline.eventLanes.housing.push(createScenarioLaneEvent({
          id: "mortgage-payments-continue",
          type: "mortgagePaymentsContinue",
          date: deathDate.normalizedDate,
          age: deathAge,
          relativeMonthIndex: 0,
          label: "Mortgage payments continue",
          lane: "housing",
          status: mortgageTreatment?.assumptionTreatment === "mortgageSupport" ? "assumption-controls" : "scenario-override",
          sourcePaths: scheduledObligations.sourcePaths
        }));
      } else {
        scenarioTimeline.eventLanes.dataQuality.push(createScenarioLaneEvent({
          id: "mortgage-data-gap",
          type: "mortgageDataGap",
          date: deathDate.normalizedDate,
          age: deathAge,
          relativeMonthIndex: 0,
          label: "Mortgage payment timing missing",
          lane: "dataQuality",
          status: "missing-facts",
          sourcePaths: mortgageTreatment.sourcePaths
        }));
      }
    }

    const effectiveAnnualShortfall = Math.max(0, annualShortfall);
    const monthlyShortfall = effectiveAnnualShortfall / 12;
    const monthlyGrowthRate = growthRate > 0 ? growthRate / 100 / 12 : 0;
    let runningBalance = netAvailableResources;
    for (let monthIndex = 1; monthIndex <= MONTHLY_RESOLUTION_MONTHS_AFTER_DEATH; monthIndex += 1) {
      const pointDate = addMonths(deathDate.date, monthIndex);
      const startingBalance = runningBalance;
      const growthAmount = startingBalance > 0 ? startingBalance * monthlyGrowthRate : 0;
      const monthlyScheduledObligations = getScheduledObligationAmountForMonth(scheduledObligations, monthIndex);
      const endingBalance = startingBalance + growthAmount - monthlyShortfall - monthlyScheduledObligations;
      runningBalance = endingBalance;
      scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
        id: `post-death-month-${monthIndex}`,
        date: formatDateOnly(pointDate),
        age: deathAge == null ? null : deathAge + monthIndex / 12,
        relativeMonthIndex: monthIndex,
        relativeYear: monthIndex / 12,
        phase: "postDeath",
        resolution: "monthly",
        startingBalance,
        growthAmount,
        householdNeed: annualNeed,
        survivorIncomeOffset,
        annualShortfall: effectiveAnnualShortfall,
        scheduledObligations: monthlyScheduledObligations,
        endingBalance,
        status: endingBalance <= 0 ? "depleted" : "available",
        sourcePaths
      }));
    }

    for (let yearIndex = 3; yearIndex <= projectionHorizonYears; yearIndex += 1) {
      const pointDate = addYears(deathDate.date, yearIndex);
      const startingBalance = runningBalance;
      const growthAmount = startingBalance > 0 ? startingBalance * (growthRate / 100) : 0;
      const yearScheduledObligations = getScheduledObligationAmountForProjectionYear(scheduledObligations, yearIndex);
      const endingBalance = startingBalance + growthAmount - effectiveAnnualShortfall - yearScheduledObligations;
      runningBalance = endingBalance;
      scenarioTimeline.resourceSeries.points.push(createScenarioTimelinePoint({
        id: `post-death-year-${yearIndex}`,
        date: formatDateOnly(pointDate),
        age: deathAge == null ? null : deathAge + yearIndex,
        relativeMonthIndex: yearIndex * 12,
        relativeYear: yearIndex,
        phase: "postDeath",
        resolution: "annual",
        startingBalance,
        growthAmount,
        householdNeed: annualNeed,
        survivorIncomeOffset,
        annualShortfall: effectiveAnnualShortfall,
        scheduledObligations: yearScheduledObligations,
        endingBalance,
        status: endingBalance <= 0 ? "depleted" : "available",
        sourcePaths
      }));
    }

    const depletionDate = parseDateOnly(financialRunway.depletionDate);
    if (depletionDate) {
      scenarioTimeline.eventLanes.resources.push(createScenarioLaneEvent({
        id: "resources-depleted-marker",
        type: "resourcesDepleted",
        date: depletionDate.normalizedDate,
        age: deathAge == null || financialRunway.totalMonthsOfSecurity == null
          ? null
          : deathAge + financialRunway.totalMonthsOfSecurity / 12,
        relativeMonthIndex: calculateWholeMonthsBetweenDates(deathDate.date, depletionDate.date),
        label: "Resources depleted",
        lane: "resources",
        status: "depletion-marker",
        sourcePaths: ["incomeLossImpact.formula.yearsOfFinancialSecurity"]
      }));
    } else {
      scenarioTimeline.trace.formula.push("resources depleted marker deferred because depletion date is unavailable.");
    }

    applyPivotalWarningEvents();
    return scenarioTimeline;
  }

  function getDependentDetailsFromProfile(profileRecord) {
    const source = profileRecord?.dependentDetails;
    if (Array.isArray(source)) {
      return source;
    }

    if (typeof source !== "string" || !source.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function getDependentRows(lensModel, profileRecord) {
    const canonicalDetails = getPath(lensModel, "educationSupport.currentDependentDetails");
    const sourceDetails = Array.isArray(canonicalDetails)
      ? canonicalDetails
      : getDependentDetailsFromProfile(profileRecord);

    return (Array.isArray(sourceDetails) ? sourceDetails : [])
      .map(function (detail, index) {
        if (!isPlainObject(detail)) {
          return null;
        }
        const rawDateOfBirth = normalizeString(detail.dateOfBirth || detail.birthDate);
        const parsedDateOfBirth = parseDateOnly(rawDateOfBirth);
        if (!parsedDateOfBirth) {
          return null;
        }
        return {
          id: normalizeString(detail.id) || `dependent-${index + 1}`,
          index,
          dateOfBirth: parsedDateOfBirth.normalizedDate,
          sourcePath: Array.isArray(canonicalDetails)
            ? `educationSupport.currentDependentDetails[${index}].dateOfBirth`
            : `profileRecord.dependentDetails[${index}].dateOfBirth`
        };
      })
      .filter(Boolean);
  }

  function resolveSelectedDeath(input, output, parsedDateOfBirth, parsedValuationDate) {
    const scenarioInput = isPlainObject(input?.options?.scenario) ? input.options.scenario : {};
    const selectedDeathAge = toOptionalNumber(
      input?.selectedDeathAge != null ? input.selectedDeathAge : scenarioInput.deathAge
    );
    const parsedSelectedDeathDate = parseDateOnly(input?.selectedDeathDate);
    const hasDateOfBirth = Boolean(parsedDateOfBirth);
    let selectedDate = null;
    let selectedAge = null;
    let source = "unresolved";
    let status = "unresolved";

    if (hasDateOfBirth && selectedDeathAge != null) {
      const roundedSelectedDeathAge = Math.round(selectedDeathAge);
      const currentAge = parsedValuationDate
        ? calculateAge(parsedDateOfBirth.date, parsedValuationDate.date)
        : null;
      const effectiveSelectedDeathAge = currentAge == null
        ? roundedSelectedDeathAge
        : Math.max(currentAge, roundedSelectedDeathAge);
      selectedDate = currentAge != null
        && effectiveSelectedDeathAge === currentAge
        && parsedValuationDate
          ? parsedValuationDate.date
          : addYears(parsedDateOfBirth.date, effectiveSelectedDeathAge);
      selectedAge = effectiveSelectedDeathAge;
      source = "selectedDeathAge";
      status = "resolved";
    } else if (parsedSelectedDeathDate) {
      selectedDate = parsedSelectedDeathDate.date;
      selectedAge = hasDateOfBirth ? calculateAge(parsedDateOfBirth.date, selectedDate) : null;
      source = "selectedDeathDate";
      status = hasDateOfBirth ? "resolved" : "date-only";
    } else if (hasDateOfBirth && parsedValuationDate) {
      selectedDate = parsedValuationDate.date;
      selectedAge = calculateAge(parsedDateOfBirth.date, selectedDate);
      source = "valuationDate";
      status = "defaulted";
    } else if (selectedDeathAge != null) {
      selectedAge = selectedDeathAge;
      source = "selectedDeathAge";
      status = "age-only";
    }

    output.selectedDeath = {
      date: selectedDate ? formatDateOnly(selectedDate) : null,
      age: selectedAge == null ? null : selectedAge,
      source,
      status
    };
  }

  function createBaseOutput() {
    return {
      version: CALCULATION_VERSION,
      selectedDeath: {
        date: null,
        age: null,
        source: "unresolved",
        status: "unresolved"
      },
      summaryCards: [],
      householdImpact: {},
      incomeImpact: {},
      obligations: {},
      liquidity: {},
      financialRunway: {
        status: "not-available",
        startingResources: null,
        existingCoverage: null,
        availableAssets: null,
        householdPositionAtTarget: null,
        immediateObligations: null,
        netAvailableResources: null,
        annualHouseholdNeed: null,
        annualSurvivorIncome: null,
        annualShortfall: null,
        yearsOfSecurity: null,
        monthsOfSecurity: null,
        totalMonthsOfSecurity: null,
        depletionYear: null,
        depletionDate: null,
        projectionYears: DEFAULT_RUNWAY_PROJECTION_YEARS,
        projectionPoints: [],
        householdPosition: null,
        sourcePaths: [],
        warnings: [],
        dataGaps: []
      },
      scenarioTimeline: createScenarioTimelineBase(),
      dependents: {
        rows: [],
        milestones: []
      },
      timelineEvents: [],
      warnings: [],
      dataGaps: [],
      trace: {
        sourcePaths: [],
        formula: []
      }
    };
  }

  function calculateIncomeLossImpactTimeline(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const output = createBaseOutput();
    const lensModel = isPlainObject(safeInput.lensModel) ? safeInput.lensModel : {};
    const profileRecord = isPlainObject(safeInput.profileRecord) ? safeInput.profileRecord : null;
    const parsedValuationDate = parseDateOnly(safeInput.valuationDate);
    const clientDateOfBirth = getPath(lensModel, "profileFacts.clientDateOfBirth");
    const parsedDateOfBirth = parseDateOnly(clientDateOfBirth);

    if (!isPlainObject(safeInput.lensModel)) {
      output.warnings.push(createWarning("missing-lens-model", "lensModel is required; sparse output was returned."));
    }

    if (!parsedValuationDate) {
      addDataGap(output, "missing-valuation-date", "Valuation date is required for deterministic age and date math.", ["valuationDate"]);
    }

    if (!parsedDateOfBirth) {
      addDataGap(output, "missing-client-dob", "Client date of birth is missing or invalid.", ["profileFacts.clientDateOfBirth"]);
    }

    resolveSelectedDeath(safeInput, output, parsedDateOfBirth, parsedValuationDate);
    if (output.selectedDeath.date || output.selectedDeath.age != null) {
      output.timelineEvents.push(createEvent({
        id: "death-event",
        type: "death",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Selected death event",
        sourcePaths: ["selectedDeathDate", "selectedDeathAge", "profileFacts.clientDateOfBirth"],
        confidence: output.selectedDeath.status === "resolved" ? "calculated" : output.selectedDeath.status
      }));
    }

    const financialRunwayInputs = resolveFinancialRunwayInputs(lensModel, safeInput.options);

    const insuredIncome = firstNumber(lensModel, [
      { path: "incomeBasis.annualIncomeReplacementBase" },
      { path: "incomeBasis.insuredNetAnnualIncome" },
      { path: "incomeBasis.insuredGrossAnnualIncome" }
    ]);
    if (insuredIncome.value == null) {
      addDataGap(output, "missing-insured-income", "Insured income is missing.", ["incomeBasis.annualIncomeReplacementBase", "incomeBasis.insuredNetAnnualIncome", "incomeBasis.insuredGrossAnnualIncome"]);
    } else {
      output.timelineEvents.push(createEvent({
        id: "insured-income-stops",
        type: "incomeStops",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Insured income stops",
        amount: insuredIncome.value,
        sourcePaths: [insuredIncome.sourcePath],
        confidence: "reported"
      }));
      addUnique(output.trace.sourcePaths, [insuredIncome.sourcePath]);
    }

    const survivorIncome = financialRunwayInputs.incomeOffsets.survivorIncome;
    const survivorIncomeStartDelayMonths = financialRunwayInputs.incomeOffsets.survivorIncomeStartDelayMonths;
    if (survivorIncome.value == null) {
      addDataGap(output, "missing-survivor-income", "Survivor income is missing.", survivorIncome.sourcePaths);
    } else {
      const deathDate = parseDateOnly(output.selectedDeath.date);
      const survivorIncomeStartDate = deathDate
        ? formatDateOnly(addMonths(deathDate.date, survivorIncomeStartDelayMonths))
        : null;
      output.timelineEvents.push(createEvent({
        id: "survivor-income-continues",
        type: "survivorIncomeContinues",
        date: survivorIncomeStartDate,
        age: output.selectedDeath.age,
        label: survivorIncomeStartDelayMonths > 0
          ? `Survivor income begins after ${survivorIncomeStartDelayMonths} months`
          : "Survivor income continues",
        amount: survivorIncome.value,
        sourcePaths: survivorIncome.sourcePaths.concat(["survivorScenario.survivorIncomeStartDelayMonths"]),
        confidence: "calculated"
      }));
      addUnique(output.trace.sourcePaths, [survivorIncome.sourcePath, "survivorScenario.survivorIncomeStartDelayMonths"]);
    }

    const annualHouseholdNeed = financialRunwayInputs.annualNeeds.annualHouseholdNeed;
    const resolvedAnnualEssentialExpenses = annualHouseholdNeed.value;
    const annualEssentialSourcePaths = annualHouseholdNeed.sourcePaths;
    if (resolvedAnnualEssentialExpenses == null) {
      addDataGap(output, "missing-annual-essential-expenses", "Annual essential household expenses are missing.", annualHouseholdNeed.sourcePaths);
    }

    const coverage = financialRunwayInputs.availableAtDeath.coverage;
    if (coverage.value == null) {
      addDataGap(output, "missing-existing-coverage", "Existing coverage is missing.", coverage.sourcePaths);
    } else {
      output.timelineEvents.push(createEvent({
        id: "coverage-available",
        type: "coverageAvailable",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Existing coverage available",
        amount: coverage.value,
        sourcePaths: coverage.sourcePaths,
        confidence: "calculated"
      }));
      addUnique(output.trace.sourcePaths, [coverage.sourcePath]);
    }

    const assets = financialRunwayInputs.availableAtDeath.assets;
    const availableAssetValue = assets.value;
    const availableAssetSourcePaths = assets.sourcePaths;
    if (availableAssetValue == null) {
      addDataGap(output, "missing-assets-liquidity", "Available asset and liquidity facts are missing.", assets.sourcePaths);
    }

    const finalExpenses = financialRunwayInputs.immediateObligations.finalExpenses;
    if (finalExpenses.value != null) {
      output.timelineEvents.push(createEvent({
        id: "final-expenses-due",
        type: "finalExpensesDue",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Final expenses due",
        amount: finalExpenses.value,
        sourcePaths: finalExpenses.sourcePaths,
        confidence: "calculated"
      }));
    }

    const transitionNeeds = financialRunwayInputs.immediateObligations.transitionNeeds;
    const mortgage = financialRunwayInputs.immediateObligations.mortgage;
    if (mortgage.value != null) {
      output.timelineEvents.push(createEvent({
        id: "mortgage-obligation",
        type: "mortgageObligation",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Mortgage obligation",
        amount: mortgage.value,
        sourcePaths: mortgage.sourcePaths,
        confidence: mortgage.status === "treated" ? "calculated" : "reported"
      }));
    }

    const debtPayoffTotal = financialRunwayInputs.immediateObligations.debtPayoff;
    const nonMortgageDebt = financialRunwayInputs.immediateObligations.nonMortgageDebt;
    if (nonMortgageDebt.value != null || debtPayoffTotal.value != null) {
      const eventAmount = debtPayoffTotal.status === "treated" || nonMortgageDebt.value == null
        ? debtPayoffTotal.value
        : nonMortgageDebt.value;
      const sourcePaths = debtPayoffTotal.status === "treated" || nonMortgageDebt.value == null
        ? debtPayoffTotal.sourcePaths
        : nonMortgageDebt.sourcePaths;
      output.timelineEvents.push(createEvent({
        id: "debt-obligation",
        type: "debtObligation",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Debt obligations",
        amount: eventAmount,
        sourcePaths,
        confidence: debtPayoffTotal.status === "treated" ? "calculated" : "reported"
      }));
    }

    const immediateDebt = debtPayoffTotal;
    const immediateObligations = sumKnownValues([
      { value: finalExpenses.value, sourcePath: finalExpenses.sourcePath },
      { value: transitionNeeds.value, sourcePath: transitionNeeds.sourcePath },
      { value: immediateDebt.value, sourcePath: immediateDebt.sourcePaths.join(" + ") }
    ]);
    if (immediateObligations.value == null) {
      addDataGap(output, "missing-immediate-obligations", "Immediate obligation facts are missing.", [
        "finalExpenses.totalFinalExpenseNeed",
        "transitionNeeds.totalTransitionNeed",
        "treatedDebtPayoff.needs.debtPayoffAmount",
        "debtPayoff.totalDebtPayoffNeed"
      ]);
    }

    const householdPosition = calculateHouseholdPositionForRunway(lensModel, {
      asOfDate: parsedValuationDate ? parsedValuationDate.normalizedDate : safeInput.valuationDate,
      targetDate: output.selectedDeath.date,
      fallbackStartingResources: assets,
      analysisSettings: safeInput.analysisSettings,
      profileRecord,
      includePreTargetContext: true,
      preTargetMonths: PRE_DEATH_CONTEXT_YEARS * 12,
      preTargetMode: "modeledBackcast"
    });
    (Array.isArray(householdPosition?.warnings) ? householdPosition.warnings : []).forEach(function (warning) {
      output.warnings.push(warning);
    });
    (Array.isArray(householdPosition?.dataGaps) ? householdPosition.dataGaps : []).forEach(function (dataGap) {
      addDataGap(output, dataGap.code, dataGap.label, dataGap.sourcePaths, dataGap.details);
    });
    const householdPositionTargetAssets = householdPosition?.targetBalance == null
      ? createMissingRunwayValue(householdPosition?.sourcePaths || ["treatedAssetOffsets.totalTreatedAssetValue"], "missing-household-position-target")
      : createRunwayValue(
          householdPosition.targetBalance,
          "householdPosition.targetBalance",
          uniqueStrings([
            "householdPosition.targetBalance",
            "treatedAssetOffsets.totalTreatedAssetValue"
          ].concat(householdPosition.sourcePaths || [])),
          "household-position-target"
        );

    const totalResources = sumKnownValues([
      { value: coverage.value, sourcePath: coverage.sourcePath },
      { value: householdPositionTargetAssets.value, sourcePath: householdPositionTargetAssets.sourcePath }
    ]);
    const netAvailableResources = totalResources.value == null
      ? null
      : totalResources.value - (immediateObligations.value == null ? 0 : immediateObligations.value);

    if (totalResources.value != null) {
      output.timelineEvents.push(createEvent({
        id: "liquidity-checkpoint",
        type: "liquidityCheckpoint",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: "Available coverage and liquidity",
        amount: netAvailableResources,
        sourcePaths: totalResources.sourcePaths
          .concat(householdPositionTargetAssets.sourcePaths)
          .concat(immediateObligations.sourcePaths),
        confidence: "calculated"
      }));
    }

    const effectiveSurvivorIncome = survivorIncome.value == null ? 0 : survivorIncome.value;
    const annualShortfallSourcePaths = uniqueStrings(
      annualEssentialSourcePaths.concat(survivorIncome.sourcePath ? [survivorIncome.sourcePath] : survivorIncome.sourcePaths)
    );
    const annualShortfall = resolvedAnnualEssentialExpenses == null
      ? null
      : resolvedAnnualEssentialExpenses - effectiveSurvivorIncome;
    if (resolvedAnnualEssentialExpenses != null && survivorIncome.value == null) {
      output.warnings.push(createWarning(
        "missing-survivor-income-runway-assumed-zero",
        "Financial runway is a partial estimate because survivor income is missing and treated as $0 for this preview."
      ));
    }
    if (annualShortfall != null) {
      output.timelineEvents.push(createEvent({
        id: "household-expense-runway",
        type: "householdExpenseRunway",
        date: output.selectedDeath.date,
        age: output.selectedDeath.age,
        label: annualShortfall > 0 ? "Annual household shortfall" : "No annual household shortfall",
        amount: Math.max(0, annualShortfall),
        sourcePaths: annualShortfallSourcePaths,
        confidence: "calculated"
      }));
    }

    let yearsOfFinancialSecurity = null;
    let yearsOfFinancialSecurityStatus = "not-available";
    const projectionYears = resolveProjectionYears(safeInput.options);
    const assetGrowth = financialRunwayInputs.projection.assetGrowth;
    const survivorIncomeDelay = financialRunwayInputs.projection.survivorIncomeDelay;
    const scheduledObligations = financialRunwayInputs.projection.scheduledObligations;
    const mortgageTreatment = financialRunwayInputs.projection.mortgageTreatment;
    (Array.isArray(mortgageTreatment?.warnings) ? mortgageTreatment.warnings : []).forEach(function (warning) {
      output.warnings.push(warning);
    });
    (Array.isArray(mortgageTreatment?.dataGaps) ? mortgageTreatment.dataGaps : []).forEach(function (dataGap) {
      addDataGap(output, dataGap.code, dataGap.label, dataGap.sourcePaths, dataGap.details);
    });
    (Array.isArray(scheduledObligations?.warnings) ? scheduledObligations.warnings : []).forEach(function (warning) {
      output.warnings.push(warning);
    });
    (Array.isArray(scheduledObligations?.dataGaps) ? scheduledObligations.dataGaps : []).forEach(function (dataGap) {
      addDataGap(output, dataGap.code, dataGap.label, dataGap.sourcePaths, dataGap.details);
    });
    const runwaySourcePaths = totalResources.sourcePaths
      .concat(householdPositionTargetAssets.sourcePaths)
      .concat(householdPosition?.sourcePaths || [])
      .concat(immediateObligations.sourcePaths)
      .concat(annualShortfallSourcePaths)
      .concat(survivorIncome.sourcePath ? [survivorIncome.sourcePath] : [])
      .concat(assetGrowth.sourcePaths || [])
      .concat(scheduledObligations.sourcePaths || []);
    let projectionPoints = [];
    const missingRunwayCriticalFacts = [];
    if (coverage.value == null) {
      missingRunwayCriticalFacts.push("existing coverage");
    }
    if (availableAssetValue == null) {
      missingRunwayCriticalFacts.push("available assets/liquidity");
    }
    if (householdPositionTargetAssets.value == null) {
      missingRunwayCriticalFacts.push("pre-target household position");
    }
    if (immediateObligations.value == null) {
      missingRunwayCriticalFacts.push("immediate obligations");
    }
    if (resolvedAnnualEssentialExpenses == null) {
      missingRunwayCriticalFacts.push("annual household need");
    }
    if (survivorIncome.value == null) {
      missingRunwayCriticalFacts.push("survivor income");
    }

    if (annualShortfall == null) {
      output.warnings.push(createWarning("missing-annual-shortfall", "Years of Financial Security was not calculated because annual shortfall inputs are missing."));
    } else if (annualShortfall <= 0) {
      yearsOfFinancialSecurityStatus = "no-shortfall";
      output.warnings.push(createWarning("no-annual-household-shortfall", "Years of Financial Security was not calculated because survivor income covers annual essential expenses."));
    } else if (netAvailableResources == null) {
      output.warnings.push(createWarning("missing-net-available-resources", "Years of Financial Security was not calculated because coverage, household position, or immediate obligation facts are missing."));
    } else {
      projectionPoints = buildRunwayProjectionPoints({
        selectedDeathDate: output.selectedDeath.date,
        selectedDeathAge: output.selectedDeath.age,
        netAvailableResources,
        annualNeed: resolvedAnnualEssentialExpenses,
        survivorIncomeOffset: effectiveSurvivorIncome,
        annualShortfall,
        growthRate: assetGrowth.growthRate,
        scheduledObligations,
        sourcePaths: runwaySourcePaths,
        options: { projectionYears }
      });
      yearsOfFinancialSecurity = getRunwayDurationYearsFromProjectionPoints(projectionPoints);
      if (yearsOfFinancialSecurity == null) {
        yearsOfFinancialSecurity = Math.max(0, netAvailableResources) / annualShortfall;
      }
      yearsOfFinancialSecurityStatus = missingRunwayCriticalFacts.length ? "partial-estimate" : "complete";
      if (missingRunwayCriticalFacts.length) {
        output.warnings.push(createWarning(
          "partial-financial-runway",
          "Financial runway is a partial estimate because critical facts are missing.",
          {
            missingCriticalFacts: missingRunwayCriticalFacts.slice()
          }
        ));
      }
    }

    const securityParts = getYearsMonthsParts(yearsOfFinancialSecurity);
    const depletionDate = yearsOfFinancialSecurity == null
      ? null
      : parseDateOnly(output.selectedDeath.date);
    const depletionDateValue = depletionDate
      ? formatDateOnly(addMonths(depletionDate.date, securityParts.totalMonths || 0))
      : null;
    const runwayStatus = yearsOfFinancialSecurityStatus;
    const supportNeedEndDate = parseDateOnly(depletionDateValue);
    if ((runwayStatus === "complete" || runwayStatus === "partial-estimate") && supportNeedEndDate) {
      output.timelineEvents.push(createEvent({
        id: "support-need-ends",
        type: "supportNeedEnds",
        date: depletionDateValue,
        age: output.selectedDeath.age == null || yearsOfFinancialSecurity == null
          ? null
          : roundYears(output.selectedDeath.age + yearsOfFinancialSecurity),
        label: "Estimated security runway ends",
        sourcePaths: ["incomeLossImpact.formula.yearsOfFinancialSecurity"],
        confidence: "calculated"
      }));
    }

    output.financialRunway = {
      status: runwayStatus,
      projectionMode: assetGrowth.projectionMode,
      startingResources: totalResources.value == null ? null : roundMoney(totalResources.value),
      existingCoverage: coverage.value == null ? null : roundMoney(coverage.value),
      availableAssets: availableAssetValue == null ? null : roundMoney(availableAssetValue),
      householdPositionAtTarget: householdPositionTargetAssets.value == null ? null : roundMoney(householdPositionTargetAssets.value),
      immediateObligations: immediateObligations.value == null ? null : roundMoney(immediateObligations.value),
      netAvailableResources: netAvailableResources == null ? null : roundMoney(netAvailableResources),
      annualHouseholdNeed: resolvedAnnualEssentialExpenses == null ? null : roundMoney(resolvedAnnualEssentialExpenses),
      annualSurvivorIncome: survivorIncome.value == null ? null : roundMoney(survivorIncome.value),
      annualShortfall: annualShortfall == null ? null : roundMoney(Math.max(0, annualShortfall)),
      yearsOfSecurity: securityParts.years,
      monthsOfSecurity: securityParts.months,
      totalMonthsOfSecurity: securityParts.totalMonths,
      depletionYear: depletionDateValue ? parseDateOnly(depletionDateValue)?.date.getFullYear() || null : null,
      depletionDate: depletionDateValue,
      projectionYears,
      projectionPoints,
      householdPosition,
      mortgageTreatment,
      scheduledObligations,
      inputs: financialRunwayInputs,
      sourcePaths: uniqueStrings(runwaySourcePaths),
      warnings: output.warnings.slice(),
      dataGaps: output.dataGaps.slice()
    };

    output.householdImpact = {
      annualEssentialExpenses: resolvedAnnualEssentialExpenses == null ? null : roundMoney(resolvedAnnualEssentialExpenses),
      annualHouseholdShortfall: annualShortfall == null ? null : roundMoney(Math.max(0, annualShortfall))
    };
    output.incomeImpact = {
      insuredIncomeStopped: insuredIncome.value == null ? null : roundMoney(insuredIncome.value),
      survivorIncome: survivorIncome.value == null ? null : roundMoney(survivorIncome.value),
      survivorIncomeStartDelayMonths,
      annualHouseholdShortfall: output.householdImpact.annualHouseholdShortfall
    };
    output.obligations = {
      finalExpenses: finalExpenses.value == null ? null : roundMoney(finalExpenses.value),
      transitionNeeds: transitionNeeds.value == null ? null : roundMoney(transitionNeeds.value),
      debtPayoff: immediateDebt.value == null ? null : roundMoney(immediateDebt.value),
      mortgageBalance: mortgage.value == null ? null : roundMoney(mortgage.value),
      immediateObligationsTotal: immediateObligations.value == null ? null : roundMoney(immediateObligations.value)
    };
    output.liquidity = {
      existingCoverage: coverage.value == null ? null : roundMoney(coverage.value),
      availableAssets: availableAssetValue == null ? null : roundMoney(availableAssetValue),
      householdPositionAtTarget: householdPositionTargetAssets.value == null ? null : roundMoney(householdPositionTargetAssets.value),
      netAvailableResources: netAvailableResources == null ? null : roundMoney(netAvailableResources)
    };

    const dependentRows = getDependentRows(lensModel, profileRecord);
    output.dependents.rows = dependentRows;
    dependentRows.forEach(function (dependent) {
      const parsedDependentBirthDate = parseDateOnly(dependent.dateOfBirth);
      const milestoneDate = parsedDependentBirthDate
        ? addYears(parsedDependentBirthDate.date, DEFAULT_DEPENDENT_MILESTONE_AGE)
        : null;
      const milestone = {
        id: `${dependent.id}-age-${DEFAULT_DEPENDENT_MILESTONE_AGE}`,
        dependentId: dependent.id,
        date: milestoneDate ? formatDateOnly(milestoneDate) : null,
        age: DEFAULT_DEPENDENT_MILESTONE_AGE,
        label: `Dependent reaches age ${DEFAULT_DEPENDENT_MILESTONE_AGE}`,
        sourcePaths: [dependent.sourcePath]
      };
      output.dependents.milestones.push(milestone);
      output.timelineEvents.push(createEvent({
        id: `dependent-milestone-${dependent.id}`,
        type: "dependentMilestone",
        date: milestone.date,
        label: milestone.label,
        sourcePaths: milestone.sourcePaths,
        confidence: "calculated"
      }));
    });

    const linkedDependentCount = getNumber(lensModel, "educationSupport.linkedDependentCount");
    if (!dependentRows.length && linkedDependentCount != null && linkedDependentCount > 0) {
      addDataGap(output, "missing-dependent-dobs", "Dependent date of birth details are missing; dependent milestones cannot be dated.", ["educationSupport.linkedDependentCount", "educationSupport.currentDependentDetails"]);
    }

    const educationFunding = firstNumber(lensModel, [
      { path: "educationSupport.totalEducationFundingNeed" },
      { path: "educationSupport.linkedDependentEducationFundingNeed" }
    ]);
    if (educationFunding.value != null && dependentRows.length) {
      const firstMilestone = output.dependents.milestones[0];
      output.timelineEvents.push(createEvent({
        id: "education-window",
        type: "educationWindow",
        date: firstMilestone?.date || null,
        label: "Education funding window",
        amount: educationFunding.value,
        sourcePaths: [educationFunding.sourcePath, "educationSupport.currentDependentDetails"],
        confidence: "calculated"
      }));
    } else if (educationFunding.value != null && linkedDependentCount != null && linkedDependentCount > 0) {
      addDataGap(output, "missing-education-window-dates", "Education funding exists, but dependent birth dates are missing.", [educationFunding.sourcePath, "educationSupport.currentDependentDetails"]);
    }

    output.summaryCards = [
      createSummaryCard(
        "yearsOfFinancialSecurity",
        "Years of Financial Security",
        yearsOfFinancialSecurity == null ? null : roundYears(yearsOfFinancialSecurity),
        yearsOfFinancialSecurityStatus === "no-shortfall"
          ? "No shortfall"
          : (yearsOfFinancialSecurityStatus === "partial-estimate"
            ? "Partial runway estimate"
            : formatYearsMonths(yearsOfFinancialSecurity)),
        yearsOfFinancialSecurityStatus,
        ["incomeLossImpact.formula.yearsOfFinancialSecurity"]
      ),
      createSummaryCard(
        "existingCoverageAvailable",
        "Existing Coverage Available",
        coverage.value == null ? null : roundMoney(coverage.value),
        formatMoney(coverage.value),
        coverage.value == null ? "notAvailable" : "available",
        [coverage.sourcePath]
      ),
      createSummaryCard(
        "annualHouseholdShortfall",
        "Annual Household Shortfall",
        annualShortfall == null ? null : roundMoney(Math.max(0, annualShortfall)),
        annualShortfall == null ? "Not available" : formatMoney(Math.max(0, annualShortfall)),
        annualShortfall == null ? "notAvailable" : (annualShortfall <= 0 ? "noShortfall" : "available"),
        annualShortfallSourcePaths
      ),
      createSummaryCard(
        "immediateObligations",
        "Immediate Obligations",
        immediateObligations.value == null ? null : roundMoney(immediateObligations.value),
        formatMoney(immediateObligations.value),
        immediateObligations.value == null ? "notAvailable" : "available",
        immediateObligations.sourcePaths
      )
    ];
    output.scenarioTimeline = buildScenarioTimeline(output, safeInput);

    output.trace.formula.push(
      "householdPosition.targetBalance = treatedAssetOffsets.totalTreatedAssetValue + mature net household income - mature recurring expenses + active gated asset growth through selected death date",
      "netAvailableResources = preferred coverage bucket + householdPosition.targetBalance - immediate obligations",
      "annualHouseholdShortfall = ongoingSupport.annualTotalEssentialSupportCost - survivorScenario.survivorNetAnnualIncome",
      "yearsOfFinancialSecurity = netAvailableResources / annualHouseholdShortfall",
      "projectionPoints ledger fields: startingBalance + growthAmount - annualShortfall - scheduledObligations = endingBalance",
      assetGrowth.projectionMode === "asset-growth"
        ? "projectionMode asset-growth uses prepared projectedAssetGrowth category rates matched to treatedAssetOffsets.assets"
        : "projectionMode current-dollar uses 0% growth when prepared asset growth is unavailable or unsafe",
      "coverage source priority: treatedExistingCoverageOffset.totalTreatedCoverageOffset, then existingCoverage totals",
      "pre-target household position starting resources use treatedAssetOffsets.totalTreatedAssetValue only; life insurance coverage is added only at the death point",
      "asset source priority for current asset display remains method-active projectedAssetOffset, then treatedAssetOffsets.totalTreatedAssetValue, then legacy offsetAssets",
      "immediate obligations include finalExpenses.totalFinalExpenseNeed + transitionNeeds.totalTransitionNeed + treatedDebtPayoff.needs.debtPayoffAmount when available"
    );
    if (survivorIncomeDelay.status === "deferred") {
      output.trace.formula.push("survivorIncomeStartDelayMonths is traced but not prorated into projection points in this scaffold");
    }
    if (scheduledObligations.status === "deferred") {
      output.trace.formula.push("scheduled education and mortgage obligations are deferred from year-specific projection points in this scaffold");
    }
    addUnique(output.trace.sourcePaths, totalResources.sourcePaths);
    addUnique(output.trace.sourcePaths, immediateObligations.sourcePaths);
    addUnique(output.trace.sourcePaths, annualEssentialSourcePaths);

    return output;
  }

  lensAnalysis.calculateIncomeLossImpactTimeline = calculateIncomeLossImpactTimeline;
})(typeof globalThis !== "undefined" ? globalThis : this);
