// Coverage Strategy education lifetime projection engine.
// Future home after folder reorganization:
// app/features/lens-analysis/coverage-strategy/projections/education-lifetime-projection.js
// Backend-ready pure calculation engine: accepts education support facts, dependent timing inputs, education-specific asset facts, and explicit assumptions; returns serializable projection output.
// Owns Coverage Strategy-specific death-year remaining education obligation projection and optional education-specific savings offset projection.
// Does not own PMI intake, Needs/LENS aggregate education math, general resource spending, storage, DOM, or display rendering.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION =
    "coverage-strategy-education-lifetime-projection-v1";
  const DEFAULT_EDUCATION_START_AGE = 18;
  const DEFAULT_PAYMENT_YEARS = 4;
  const EDUCATION_PAYMENT_SCHEDULE_MODE_FOUR_YEAR_ANNUAL = "fourYearAnnual";
  const EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START = "lumpSumAtStart";
  const ALLOWED_EDUCATION_PAYMENT_SCHEDULE_MODES = Object.freeze([
    EDUCATION_PAYMENT_SCHEDULE_MODE_FOUR_YEAR_ANNUAL,
    EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
  ]);
  const EDUCATION_RESOURCE_SPENDING_MODE_OFF = "off";
  const EDUCATION_RESOURCE_SPENDING_MODE_EDUCATION_SAVINGS_ONLY = "educationSavingsOnly";
  const EDUCATION_RESOURCE_SPENDING_MODE_ELIGIBLE_RESOURCES_AFTER_EDUCATION_SAVINGS =
    "eligibleResourcesAfterEducationSavings";
  const ALLOWED_EDUCATION_RESOURCE_SPENDING_MODES = Object.freeze([
    EDUCATION_RESOURCE_SPENDING_MODE_OFF,
    EDUCATION_RESOURCE_SPENDING_MODE_EDUCATION_SAVINGS_ONLY,
    EDUCATION_RESOURCE_SPENDING_MODE_ELIGIBLE_RESOURCES_AFTER_EDUCATION_SAVINGS
  ]);
  const EDUCATION_ASSET_CATEGORY_KEY = "educationSpecificSavings";
  const EDUCATION_ASSET_TEXT_PATTERN =
    /(529|coverdell|prepaid\s*tuition|education\s*(specific|savings|account|trust|fund)|college\s*savings|esa)/i;

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

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(Object(source), key);
  }

  function toOptionalNumber(value) {
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
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  function roundRatio(value) {
    return Number.isFinite(value) ? Number(value.toFixed(8)) : 0;
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
    const issue = createIssue(code, message, details);
    target.push(issue);
    return issue;
  }

  function normalizeDateOnly(value) {
    const raw = normalizeString(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
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
      normalizedDate: [
        String(year).padStart(4, "0"),
        String(monthIndex + 1).padStart(2, "0"),
        String(day).padStart(2, "0")
      ].join("-"),
      calendarYear: year
    };
  }

  function addCalendarYears(dateResult, years) {
    if (!dateResult || !(dateResult.date instanceof Date)) {
      return null;
    }
    const date = new Date(dateResult.date.getTime());
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return {
      date,
      normalizedDate: [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0")
      ].join("-"),
      calendarYear: date.getUTCFullYear()
    };
  }

  function calculateAge(dateOfBirth, valuationDate) {
    const birth = normalizeDateOnly(dateOfBirth);
    const valuation = normalizeDateOnly(valuationDate);
    if (!birth || !valuation || birth.date > valuation.date) {
      return null;
    }
    let age = valuation.date.getUTCFullYear() - birth.date.getUTCFullYear();
    const monthDelta = valuation.date.getUTCMonth() - birth.date.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && valuation.date.getUTCDate() < birth.date.getUTCDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function normalizePercentRate(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0) {
      if (value != null && value !== "") {
        addIssue(
          warnings,
          "invalid-education-inflation-rate-current-dollar",
          "Education inflation rate was invalid; Coverage Strategy education projection used current dollars.",
          { received: value }
        );
      }
      return {
        annualRate: 0,
        sourceValue: value,
        applied: false
      };
    }
    let annualRate;
    if (parsed > 1) {
      annualRate = parsed / 100;
    } else if (parsed >= 0.1) {
      annualRate = parsed / 100;
    } else {
      annualRate = parsed;
    }
    return {
      annualRate: Math.max(0, annualRate),
      sourceValue: value,
      applied: annualRate > 0
    };
  }

  function normalizeEducationStartAge(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null || parsed < 0 || parsed > 120) {
      if (value != null && value !== "") {
        addIssue(
          warnings,
          "invalid-education-start-age-defaulted",
          "Education start age was invalid; Coverage Strategy used age 18.",
          { received: value, fallback: DEFAULT_EDUCATION_START_AGE }
        );
      }
      return DEFAULT_EDUCATION_START_AGE;
    }
    return Math.round(parsed);
  }

  function resolveEducationPaymentScheduleMode(coverageStrategyScenarioSettings, warnings) {
    const rawMode = coverageStrategyScenarioSettings?.education?.educationPaymentScheduleMode;
    const sourcePath = coverageStrategyScenarioSettings?.trace?.fieldSources?.["education.educationPaymentScheduleMode"]
      || "coverageStrategyScenarioSettings.education.educationPaymentScheduleMode";
    const normalized = normalizeString(rawMode);
    if (ALLOWED_EDUCATION_PAYMENT_SCHEDULE_MODES.includes(normalized)) {
      return {
        mode: normalized,
        sourcePath,
        defaulted: false,
        supportedValues: ALLOWED_EDUCATION_PAYMENT_SCHEDULE_MODES.slice()
      };
    }
    if (rawMode != null && rawMode !== "") {
      addIssue(
        warnings,
        "education-payment-schedule-mode-unsupported",
        "Unsupported Coverage Strategy education payment schedule mode was defaulted to four-year annual.",
        {
          received: rawMode,
          fallback: EDUCATION_PAYMENT_SCHEDULE_MODE_FOUR_YEAR_ANNUAL,
          sourcePath,
          supportedValues: ALLOWED_EDUCATION_PAYMENT_SCHEDULE_MODES.slice()
        }
      );
    }
    return {
      mode: EDUCATION_PAYMENT_SCHEDULE_MODE_FOUR_YEAR_ANNUAL,
      sourcePath: rawMode == null || rawMode === ""
        ? "coverage-strategy-defaults.education.educationPaymentScheduleMode"
        : sourcePath,
      defaulted: true,
      supportedValues: ALLOWED_EDUCATION_PAYMENT_SCHEDULE_MODES.slice()
    };
  }

  function getNeedPoints(input) {
    return Array.isArray(input?.needPoints) ? input.needPoints : [];
  }

  function getAssetList(container) {
    if (Array.isArray(container)) {
      return container;
    }
    if (Array.isArray(container?.assets)) {
      return container.assets;
    }
    return [];
  }

  function getPointCalendarYear(point, valuationYear) {
    const calendarYear = toOptionalNumber(point?.calendarYear);
    if (calendarYear != null) {
      return Math.round(calendarYear);
    }
    const yearIndex = toOptionalNumber(point?.yearIndex);
    if (valuationYear != null && yearIndex != null) {
      return valuationYear + Math.round(yearIndex);
    }
    return null;
  }

  function getDependentId(dependent, index, prefix) {
    const id = normalizeString(dependent?.id || dependent?.dependentId || dependent?.expenseFactId);
    return id || `${prefix || "dependent"}-${index + 1}`;
  }

  function getDependentDateOfBirth(dependent) {
    return normalizeString(dependent?.dateOfBirth ?? dependent?.birthDate ?? "");
  }

  function getAssetId(asset, index, fallbackPrefix) {
    return normalizeString(asset?.assetId || asset?.id || asset?.sourceKey) || `${fallbackPrefix || "asset"}-${index + 1}`;
  }

  function getAssetCategoryKey(asset) {
    return normalizeString(asset?.categoryKey || asset?.assetCategoryKey || asset?.category || asset?.assetCategory);
  }

  function getAssetTypeKey(asset) {
    return normalizeString(asset?.typeKey || asset?.assetTypeKey || asset?.type || asset?.sourceKey);
  }

  function getAssetLabel(asset) {
    return normalizeString(asset?.label || asset?.name || asset?.description || getAssetTypeKey(asset) || getAssetCategoryKey(asset));
  }

  function getAssetCurrentValue(asset) {
    return toOptionalNumber(
      asset?.currentValue
      ?? asset?.rawValue
      ?? asset?.value
      ?? asset?.amount
      ?? asset?.balance
    );
  }

  function getSourcePaths(row, fallback) {
    if (Array.isArray(row?.sourcePaths)) {
      return row.sourcePaths.map(normalizeString).filter(Boolean);
    }
    if (normalizeString(row?.sourcePath)) {
      return [normalizeString(row.sourcePath)];
    }
    return fallback ? [fallback] : [];
  }

  function isEducationSavingsAsset(asset) {
    const categoryKey = getAssetCategoryKey(asset);
    if (categoryKey === EDUCATION_ASSET_CATEGORY_KEY) {
      return true;
    }
    const searchable = [
      categoryKey,
      getAssetTypeKey(asset),
      getAssetLabel(asset),
      asset?.sourceKey,
      asset?.metadata?.taxonomyCategoryLabel
    ].map(normalizeString).join("|");
    return EDUCATION_ASSET_TEXT_PATTERN.test(searchable);
  }

  function createTreatedAssetLookup(treatedAssetOffsets) {
    const lookup = new Map();
    getAssetList(treatedAssetOffsets).forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        return;
      }
      [
        asset.assetId,
        asset.id,
        asset.sourceKey,
        getAssetId(asset, index, "treated-asset")
      ].map(normalizeString).filter(Boolean).forEach(function (key) {
        if (!lookup.has(key)) {
          lookup.set(key, asset);
        }
      });
    });
    return lookup;
  }

  function resolveEducationSavingsOffsetActivation(educationAssumptions, coverageStrategyScenarioSettings, eligibleAssetCount, dataGaps) {
    const scenarioEducation = isPlainObject(coverageStrategyScenarioSettings?.education)
      ? coverageStrategyScenarioSettings.education
      : {};
    if (hasOwn(scenarioEducation, "useEducationSavingsOffset")) {
      const rawValue = scenarioEducation.useEducationSavingsOffset;
      const sourcePath = coverageStrategyScenarioSettings?.trace?.fieldSources?.["education.useEducationSavingsOffset"]
        || "coverageStrategyScenarioSettings.education.useEducationSavingsOffset";
      return {
        active: rawValue === true,
        status: rawValue === true ? "active" : "disabled",
        settingAvailable: true,
        sourcePath,
        traceCode: rawValue === true ? "education-savings-offset-active" : "education-savings-offset-disabled",
        ownership: "coverage-strategy-scenario-settings",
        legacyMapped: Array.isArray(coverageStrategyScenarioSettings?.trace?.legacyMappings)
          && coverageStrategyScenarioSettings.trace.legacyMappings.some(function (mapping) {
            return mapping && mapping.code === "education-savings-offset-legacy-analysis-setting-mapped";
          })
      };
    }

    const hasTopLevelSetting = hasOwn(educationAssumptions, "useExistingEducationSavingsOffset");
    const fundingTreatment = isPlainObject(educationAssumptions?.fundingTreatment)
      ? educationAssumptions.fundingTreatment
      : {};
    const hasNestedSetting = hasOwn(fundingTreatment, "useExistingEducationSavingsOffset");
    const rawValue = hasTopLevelSetting
      ? educationAssumptions.useExistingEducationSavingsOffset
      : (hasNestedSetting ? fundingTreatment.useExistingEducationSavingsOffset : undefined);

    if (typeof rawValue === "boolean") {
      return {
        active: rawValue,
        status: rawValue ? "active" : "disabled",
        settingAvailable: true,
        sourcePath: hasTopLevelSetting
          ? "educationAssumptions.useExistingEducationSavingsOffset"
          : "educationAssumptions.fundingTreatment.useExistingEducationSavingsOffset",
        traceCode: rawValue ? "education-savings-offset-active" : "education-savings-offset-disabled",
        ownership: "legacy-education-assumptions",
        legacyMapped: false
      };
    }

    if (eligibleAssetCount > 0) {
      addIssue(
        dataGaps,
        "education-savings-offset-assumption-unavailable",
        "Education-specific savings were available, but no resolved education savings offset assumption was available; no offset was applied.",
        { eligibleAssetCount }
      );
    }

    return {
      active: false,
      status: "assumption-unavailable",
      settingAvailable: false,
      sourcePath: null,
      traceCode: "education-savings-offset-assumption-unavailable",
      ownership: "unavailable",
      legacyMapped: false
    };
  }

  function resolveEducationResourceSpendingMode(coverageStrategyScenarioSettings, educationSavingsOffsetActivation, warnings) {
    const scenarioEducation = isPlainObject(coverageStrategyScenarioSettings?.education)
      ? coverageStrategyScenarioSettings.education
      : {};
    const hasMode = hasOwn(scenarioEducation, "educationResourceSpendingMode");
    const rawMode = hasMode ? normalizeString(scenarioEducation.educationResourceSpendingMode) : "";
    const sourcePath = coverageStrategyScenarioSettings?.trace?.fieldSources?.["education.educationResourceSpendingMode"]
      || (hasMode ? "coverageStrategyScenarioSettings.education.educationResourceSpendingMode" : null);
    if (hasMode && ALLOWED_EDUCATION_RESOURCE_SPENDING_MODES.includes(rawMode)) {
      return {
        selectedMode: rawMode,
        effectiveMode: rawMode,
        sourcePath,
        source: sourcePath,
        explicit: true,
        defaulted: false,
        derivedFromUseEducationSavingsOffset: false,
        educationSavingsOffsetActive: rawMode === EDUCATION_RESOURCE_SPENDING_MODE_EDUCATION_SAVINGS_ONLY
          || rawMode === EDUCATION_RESOURCE_SPENDING_MODE_ELIGIBLE_RESOURCES_AFTER_EDUCATION_SAVINGS,
        broaderEligibleResourcesRequested:
          rawMode === EDUCATION_RESOURCE_SPENDING_MODE_ELIGIBLE_RESOURCES_AFTER_EDUCATION_SAVINGS,
        traceCode: "education-resource-spending-mode-resolved"
      };
    }

    if (hasMode) {
      addIssue(
        warnings,
        "education-resource-spending-mode-unsupported",
        "Unsupported Coverage Strategy education resource spending mode was defaulted to off.",
        {
          received: scenarioEducation.educationResourceSpendingMode,
          sourcePath,
          fallback: EDUCATION_RESOURCE_SPENDING_MODE_OFF,
          supportedValues: ALLOWED_EDUCATION_RESOURCE_SPENDING_MODES.slice()
        }
      );
      return {
        selectedMode: EDUCATION_RESOURCE_SPENDING_MODE_OFF,
        effectiveMode: EDUCATION_RESOURCE_SPENDING_MODE_OFF,
        sourcePath,
        source: sourcePath,
        explicit: true,
        defaulted: true,
        derivedFromUseEducationSavingsOffset: false,
        educationSavingsOffsetActive: false,
        broaderEligibleResourcesRequested: false,
        traceCode: "education-resource-spending-mode-defaulted"
      };
    }

    if (educationSavingsOffsetActivation?.active === true) {
      return {
        selectedMode: EDUCATION_RESOURCE_SPENDING_MODE_EDUCATION_SAVINGS_ONLY,
        effectiveMode: EDUCATION_RESOURCE_SPENDING_MODE_EDUCATION_SAVINGS_ONLY,
        sourcePath: educationSavingsOffsetActivation.sourcePath,
        source: "derived-from-education.useEducationSavingsOffset",
        explicit: false,
        defaulted: true,
        derivedFromUseEducationSavingsOffset: true,
        educationSavingsOffsetActive: true,
        broaderEligibleResourcesRequested: false,
        traceCode: "education-resource-spending-mode-derived-from-education-savings-offset"
      };
    }

    return {
      selectedMode: EDUCATION_RESOURCE_SPENDING_MODE_OFF,
      effectiveMode: EDUCATION_RESOURCE_SPENDING_MODE_OFF,
      sourcePath: "coverage-strategy-defaults.education.educationResourceSpendingMode",
      source: "coverage-strategy-defaults.education.educationResourceSpendingMode",
      explicit: false,
      defaulted: true,
      derivedFromUseEducationSavingsOffset: false,
      educationSavingsOffsetActive: false,
      broaderEligibleResourcesRequested: false,
      traceCode: "education-resource-spending-mode-defaulted"
    };
  }

  function applyEducationResourceSpendingModeToSavingsActivation(activation, resourceMode) {
    const savingsActive = resourceMode?.educationSavingsOffsetActive === true;
    const explicitResourceModeOff = resourceMode?.effectiveMode === EDUCATION_RESOURCE_SPENDING_MODE_OFF
      && resourceMode?.explicit === true;
    return {
      ...activation,
      active: savingsActive,
      status: savingsActive
        ? "active"
        : (explicitResourceModeOff
          ? "disabled-by-education-resource-spending-mode-off"
          : activation.status),
      traceCode: savingsActive
        ? "education-savings-offset-active"
        : (explicitResourceModeOff
          ? "education-savings-offset-disabled-by-resource-spending-mode-off"
          : activation.traceCode),
      resourceSpendingMode: resourceMode?.effectiveMode || EDUCATION_RESOURCE_SPENDING_MODE_OFF,
      resourceSpendingModeSource: resourceMode?.source || null
    };
  }

  function resolveBroaderEligibleResourceSpending(resourceMode, dataGaps) {
    if (resourceMode?.effectiveMode !== EDUCATION_RESOURCE_SPENDING_MODE_ELIGIBLE_RESOURCES_AFTER_EDUCATION_SAVINGS) {
      return {
        requested: false,
        status: "not-requested",
        applied: false,
        totalApplied: 0,
        sourceAvailable: false,
        warningCode: null
      };
    }

    const issue = addIssue(
      dataGaps,
      "education-eligible-resource-spending-source-unavailable",
      "Eligible resource spending after education savings was requested, but no safe broader eligible resource allocation source is available; no broader resources were applied.",
      {
        educationResourceSpendingMode: resourceMode.effectiveMode,
        broaderEligibleResourceOffsetApplied: 0,
        resourceLineReductionApplied: false,
        generalResourceReductionApplied: false
      }
    );
    return {
      requested: true,
      status: "unavailable",
      applied: false,
      totalApplied: 0,
      sourceAvailable: false,
      warningCode: issue?.code || "education-eligible-resource-spending-source-unavailable"
    };
  }

  function createEducationResourceSpendingTrace(resourceMode, broaderResourceSpending, educationSavingsOffsetApplied, remainingNeedAfterEducationSavings) {
    return {
      selectedMode: resourceMode?.selectedMode || EDUCATION_RESOURCE_SPENDING_MODE_OFF,
      effectiveMode: resourceMode?.effectiveMode || EDUCATION_RESOURCE_SPENDING_MODE_OFF,
      modeSource: resourceMode?.source || null,
      modeSourcePath: resourceMode?.sourcePath || null,
      modeExplicit: resourceMode?.explicit === true,
      modeDefaulted: resourceMode?.defaulted === true,
      modeDerivedFromUseEducationSavingsOffset: resourceMode?.derivedFromUseEducationSavingsOffset === true,
      educationSavingsOffsetApplied: roundMoney(educationSavingsOffsetApplied),
      remainingNeedAfterEducationSavings: roundMoney(remainingNeedAfterEducationSavings),
      broaderEligibleResourcesRequested: broaderResourceSpending?.requested === true,
      broaderEligibleResourceOffsetApplied: roundMoney(broaderResourceSpending?.totalApplied || 0),
      broaderEligibleResourceStatus: broaderResourceSpending?.status || "not-requested",
      broaderEligibleResourceSourceAvailable: broaderResourceSpending?.sourceAvailable === true,
      warningCode: broaderResourceSpending?.warningCode || null,
      resourceLineReductionApplied: false,
      generalResourceReductionApplied: false,
      visibleResourceSpendingControl: false
    };
  }

  function collectEducationSavingsAssets(input, warnings) {
    const rawAssets = getAssetList(input.assetFacts);
    const treatedLookup = createTreatedAssetLookup(input.treatedAssetOffsets);
    const eligibleAssets = [];
    const excludedAssets = [];
    const sourceAssets = rawAssets.length ? rawAssets : getAssetList(input.treatedAssetOffsets);

    sourceAssets.forEach(function (asset, index) {
      if (!isPlainObject(asset)) {
        return;
      }
      const assetId = getAssetId(asset, index, "education-asset");
      const categoryKey = getAssetCategoryKey(asset);
      const typeKey = getAssetTypeKey(asset);
      const label = getAssetLabel(asset);
      const sourcePath = rawAssets.length
        ? `assetFacts.assets[${index}]`
        : `treatedAssetOffsets.assets[${index}]`;
      if (!isEducationSavingsAsset(asset)) {
        excludedAssets.push({
          assetId,
          categoryKey,
          typeKey,
          label,
          exclusionCode: "not-education-specific-savings",
          sourcePaths: getSourcePaths(asset, sourcePath)
        });
        return;
      }

      const treated = treatedLookup.get(assetId)
        || treatedLookup.get(normalizeString(asset.assetId))
        || treatedLookup.get(normalizeString(asset.id))
        || null;
      const rawValue = getAssetCurrentValue(asset);
      const treatedValue = treated ? toOptionalNumber(treated.treatedValue) : null;
      const includedInGeneralResources = treated?.include === true || treated?.included === true;
      const generalResourceInclusionStatus = treated
        ? (includedInGeneralResources ? "included-in-treated-assets" : "excluded-from-treated-assets")
        : "unknown";

      if (!(rawValue > 0)) {
        excludedAssets.push({
          assetId,
          categoryKey,
          typeKey,
          label,
          exclusionCode: "missing-education-savings-current-value",
          rawValue: rawValue == null ? null : rawValue,
          sourcePaths: getSourcePaths(asset, sourcePath)
        });
        return;
      }

      if (includedInGeneralResources) {
        const warning = createIssue(
          "education-savings-offset-resource-double-count-risk",
          "Education-specific savings were included in treated resources, so they were not also used as an education savings offset.",
          {
            assetId,
            categoryKey,
            rawValue,
            treatedValue,
            sourcePaths: getSourcePaths(asset, sourcePath)
          }
        );
        warnings.push(warning);
        excludedAssets.push({
          assetId,
          categoryKey,
          typeKey,
          label,
          exclusionCode: warning.code,
          rawValue: roundMoney(rawValue),
          treatedValue: treatedValue == null ? null : roundMoney(treatedValue),
          generalResourceInclusionStatus,
          sourcePaths: getSourcePaths(asset, sourcePath)
        });
        return;
      }

      eligibleAssets.push({
        assetId,
        categoryKey,
        typeKey,
        label,
        rawValue: roundMoney(rawValue),
        treatedValue: treatedValue == null ? null : roundMoney(treatedValue),
        offsetValue: roundMoney(rawValue),
        offsetValueSource: "assetFacts.assets.currentValue",
        treatedAssetSourceAvailable: Boolean(treated),
        generalResourceInclusionStatus,
        sourcePaths: getSourcePaths(asset, sourcePath),
        trace: {
          source: "coverage-strategy-education-lifetime-projection",
          resourceLineReductionApplied: false,
          treatedValueUsedForOffset: false,
          rawCurrentValueUsedForOffset: true
        }
      });
    });

    return {
      eligibleAssets,
      excludedAssets,
      totalEducationSavingsAvailable: roundMoney(eligibleAssets.reduce(function (sum, asset) {
        return sum + Math.max(0, toOptionalNumber(asset.offsetValue) || 0);
      }, 0))
    };
  }

  function collectCurrentDependents(input) {
    const educationSupport = isPlainObject(input.educationSupport) ? input.educationSupport : {};
    const candidates = [];
    if (Array.isArray(input.profileDependents)) {
      candidates.push(...input.profileDependents);
    }
    if (Array.isArray(educationSupport.currentDependentDetails)) {
      candidates.push(...educationSupport.currentDependentDetails);
    }
    const seen = new Set();
    return candidates.filter(function (dependent, index) {
      if (!isPlainObject(dependent)) {
        return false;
      }
      const stableId = normalizeString(dependent.id || dependent.dependentId);
      const stableDob = getDependentDateOfBirth(dependent);
      const key = stableId || stableDob
        ? [stableId, stableDob].join("|")
        : `current-dependent-index-${index}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function getFundingTargetTrace(educationAssumptions) {
    const fundingTargetPercent = toOptionalNumber(educationAssumptions?.fundingTargetPercent);
    return {
      fundingTargetPercent: fundingTargetPercent == null ? null : fundingTargetPercent,
      fundingTargetPercentApplied: false,
      fundingTargetTreatment: "preserved-current-needs-aggregate-behavior"
    };
  }

  function resolvePerCurrentDependentFunding(educationSupport, currentDependentCount) {
    const direct = toOptionalNumber(educationSupport.perLinkedDependentEducationFunding);
    if (direct != null && direct >= 0) {
      return {
        amount: direct,
        source: "educationSupport.perLinkedDependentEducationFunding"
      };
    }
    const total = toOptionalNumber(educationSupport.linkedDependentEducationFundingNeed);
    if (total != null && total >= 0 && currentDependentCount > 0) {
      return {
        amount: total / currentDependentCount,
        source: "educationSupport.linkedDependentEducationFundingNeed/currentDependentCount"
      };
    }
    return {
      amount: 0,
      source: "missing-current-dependent-funding"
    };
  }

  function resolvePerProjectedDependentFunding(educationSupport, projectedCount) {
    const direct = toOptionalNumber(educationSupport.perDesiredAdditionalDependentEducationFunding);
    if (direct != null && direct >= 0) {
      return {
        amount: direct,
        source: "educationSupport.perDesiredAdditionalDependentEducationFunding"
      };
    }
    const total = toOptionalNumber(educationSupport.desiredAdditionalDependentEducationFundingNeed);
    if (total != null && total >= 0 && projectedCount > 0) {
      return {
        amount: total / projectedCount,
        source: "educationSupport.desiredAdditionalDependentEducationFundingNeed/projectedCount"
      };
    }
    return {
      amount: 0,
      source: "missing-projected-dependent-funding"
    };
  }

  function getInflationFactor(context, paymentYear) {
    if (!context.applyEducationInflation || !(context.educationInflationAnnualRate > 0)) {
      return 1;
    }
    const elapsedYears = Math.max(0, paymentYear - context.valuationYear);
    return Math.pow(1 + context.educationInflationAnnualRate, elapsedYears);
  }

  function createPaymentSchedule(dependent, context, options) {
    const scheduleMode = context.educationPaymentScheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
      ? EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
      : EDUCATION_PAYMENT_SCHEDULE_MODE_FOUR_YEAR_ANNUAL;
    const paymentYearCount = scheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
      ? 1
      : Math.max(1, Math.round(toOptionalNumber(context.paymentYearCount) || DEFAULT_PAYMENT_YEARS));
    const baseTotal = Math.max(0, toOptionalNumber(options.baseTotal) || 0);
    const basePayment = scheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
      ? baseTotal
      : baseTotal / paymentYearCount;
    const dateOfBirth = options.dateOfBirth;
    const birth = normalizeDateOnly(dateOfBirth);
    const educationStartDate = addCalendarYears(birth, context.educationStartAge);
    const educationStartYear = educationStartDate ? educationStartDate.calendarYear : null;
    const payments = [];
    for (let offset = 0; offset < paymentYearCount; offset += 1) {
      const paymentYear = educationStartYear == null ? null : educationStartYear + offset;
      const inflationFactor = paymentYear == null ? 1 : getInflationFactor(context, paymentYear);
      payments.push({
        paymentIndex: offset + 1,
        paymentYear,
        baseAmount: roundMoney(basePayment),
        amount: roundMoney(basePayment * inflationFactor),
        paymentScheduleMode: scheduleMode,
        inflationFactor: roundRatio(inflationFactor),
        inflationApplied: context.applyEducationInflation && context.educationInflationAnnualRate > 0,
        remainingRule: "calendarYear<=paymentYear"
      });
    }
    return {
      id: options.id,
      kind: options.kind,
      dateOfBirth,
      birthYear: birth ? birth.calendarYear : null,
      currentAge: calculateAge(dateOfBirth, context.valuationDate),
      educationStartAge: context.educationStartAge,
      educationStartYear,
      baseTotal: roundMoney(baseTotal),
      paymentYearCount,
      payments,
      sourcePath: options.sourcePath || null,
      trace: {
        source: "coverage-strategy-education-lifetime-projection",
        scheduleMode: scheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
          ? "lump-sum-at-education-start"
          : "four-equal-annual-payments",
        educationPaymentScheduleMode: scheduleMode,
        annualPointRule: "annual-calendar-year-basis",
        fundingSource: options.fundingSource,
        fundingTargetPercentApplied: false
      }
    };
  }

  function remainingScheduleAmount(schedule, pointCalendarYear) {
    if (pointCalendarYear == null) {
      return 0;
    }
    return roundMoney(schedule.payments.reduce(function (sum, payment) {
      if (payment.paymentYear != null && pointCalendarYear <= payment.paymentYear) {
        return sum + Math.max(0, toOptionalNumber(payment.amount) || 0);
      }
      return sum;
    }, 0));
  }

  function buildCurrentDependentSchedules(input, context, warnings, dataGaps) {
    const educationSupport = isPlainObject(input.educationSupport) ? input.educationSupport : {};
    const dependents = collectCurrentDependents(input);
    const funding = resolvePerCurrentDependentFunding(educationSupport, dependents.length);
    const schedules = [];
    const excluded = [];
    dependents.forEach(function (dependent, index) {
      const id = getDependentId(dependent, index, "current-dependent");
      const dateOfBirth = getDependentDateOfBirth(dependent);
      const sourcePath = dependent.sourcePath || `educationSupport.currentDependentDetails[${index}]`;
      if (!normalizeDateOnly(dateOfBirth)) {
        const issue = createIssue(
          "current-dependent-education-dob-missing",
          "Current dependent education timing requires a valid dateOfBirth; no fake timing was created.",
          { id, sourcePath, dateOfBirth: dateOfBirth || null }
        );
        warnings.push(issue);
        dataGaps.push(issue);
        excluded.push({
          id,
          kind: "currentDependent",
          sourcePath,
          exclusionCode: issue.code,
          exclusionReason: issue.message,
          trace: issue.details
        });
        return;
      }
      schedules.push(createPaymentSchedule(dependent, context, {
        id,
        kind: "currentDependent",
        dateOfBirth,
        baseTotal: funding.amount,
        fundingSource: funding.source,
        sourcePath
      }));
    });
    return {
      schedules,
      excluded,
      funding
    };
  }

  function normalizeBirthYear(value) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      return null;
    }
    const rounded = Math.round(parsed);
    return rounded >= 1900 && rounded <= 2200 ? rounded : null;
  }

  function buildProjectedDependentSchedules(input, context, warnings) {
    const educationSupport = isPlainObject(input.educationSupport) ? input.educationSupport : {};
    const projectedDependents = Array.isArray(input.projectedDependents) ? input.projectedDependents : [];
    const aggregateCount = Math.max(0, Math.round(toOptionalNumber(
      educationSupport.desiredAdditionalDependentCount
      ?? educationSupport.projectedDependentsCount
    ) || 0));
    const funding = resolvePerProjectedDependentFunding(educationSupport, aggregateCount || projectedDependents.length);
    const timedSchedules = [];
    const excluded = [];
    projectedDependents.forEach(function (dependent, index) {
      if (!isPlainObject(dependent)) {
        return;
      }
      const id = getDependentId(dependent, index, "projected-dependent");
      const birthYear = normalizeBirthYear(
        dependent.expectedBirthYear
        ?? dependent.birthYear
        ?? dependent.projectedBirthYear
      );
      const sourcePath = dependent.sourcePath || `projectedDependents[${index}]`;
      const birthYearInvalid = dependent.validationStatus === "invalid"
        || normalizeString(dependent.validationCode) === "projected-dependent-birth-year-invalid";
      if (birthYearInvalid) {
        warnings.push(createIssue(
          "projected-dependent-birth-year-invalid",
          "Projected dependent birth year was invalid; Coverage Strategy kept the remaining aggregate projected dependent education need untimed.",
          {
            id,
            rawExpectedBirthYear: dependent.rawExpectedBirthYear ?? dependent.expectedBirthYear ?? null,
            sourcePath
          }
        ));
        excluded.push({
          id,
          kind: "projectedDependent",
          sourcePath,
          exclusionCode: "projected-dependent-birth-year-invalid",
          exclusionReason: "Projected dependent birth year was invalid.",
          trace: {
            keptAsUntimedAggregateCandidate: true,
            rawExpectedBirthYear: dependent.rawExpectedBirthYear ?? dependent.expectedBirthYear ?? null
          }
        });
        return;
      }
      if (birthYear == null) {
        excluded.push({
          id,
          kind: "projectedDependent",
          sourcePath,
          exclusionCode: "projected-dependent-birth-year-missing",
          exclusionReason: "Projected dependent has no birth year timing anchor.",
          trace: {
            keptAsUntimedAggregateCandidate: true
          }
        });
        return;
      }
      const warning = createIssue(
        "projected-dependent-birth-year-defaulted-to-jan-1",
        "Projected dependent birth year was converted to a January 1 DOB for annual Coverage Strategy scheduling.",
        { id, birthYear, assumedDateOfBirth: `${birthYear}-01-01`, sourcePath }
      );
      warnings.push(warning);
      timedSchedules.push(createPaymentSchedule(dependent, context, {
        id,
        kind: "projectedDependent",
        dateOfBirth: `${birthYear}-01-01`,
        baseTotal: toOptionalNumber(dependent.educationFundingAmount) ?? funding.amount,
        fundingSource: dependent.educationFundingAmount == null
          ? funding.source
          : "projectedDependents.educationFundingAmount",
        sourcePath
      }));
    });
    return {
      timedSchedules,
      excluded,
      aggregateCount,
      funding
    };
  }

  function resolveUntimedProjectedDependentNeed(educationSupport, projectedModel, educationAssumptions, context, warnings) {
    const includeProjectedDependents = educationAssumptions.includeProjectedDependents !== false;
    const aggregateTotal = Math.max(0, toOptionalNumber(
      educationSupport.desiredAdditionalDependentEducationFundingNeed
      ?? educationSupport.projectedDependentEducationFundingNeed
    ) || 0);
    const timedTotal = roundMoney(projectedModel.timedSchedules.reduce(function (sum, schedule) {
      return sum + Math.max(0, toOptionalNumber(schedule.baseTotal) || 0);
    }, 0));
    if (!includeProjectedDependents) {
      if (aggregateTotal > 0 || projectedModel.timedSchedules.length) {
        warnings.push(createIssue(
          "projected-dependent-education-excluded-by-setting",
          "Projected dependent education funding was excluded by the education assumptions.",
          { aggregateTotal, timedProjectedDependentCount: projectedModel.timedSchedules.length }
        ));
      }
      return {
        amount: 0,
        status: aggregateTotal > 0 ? "excluded-by-setting" : "not-present",
        count: 0,
        traceCode: "projected-dependent-education-excluded-by-setting"
      };
    }
    const untimedAmount = roundMoney(Math.max(0, aggregateTotal - timedTotal));
    if (untimedAmount > 0) {
      warnings.push(createIssue(
        "projected-dependent-education-kept-through-horizon",
        "Projected dependent education funding has no timing anchor; Coverage Strategy kept it through the projection horizon.",
        {
          untimedProjectedDependentNeedAmount: untimedAmount,
          projectedDependentCount: projectedModel.aggregateCount
        }
      ));
      if (context.educationPaymentScheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START) {
        warnings.push(createIssue(
          "projected-dependent-untimed-schedule-mode-not-applied",
          "Projected dependent education had no birth year, so the selected payment schedule mode could not time the aggregate need.",
          {
            educationPaymentScheduleMode: context.educationPaymentScheduleMode,
            untimedProjectedDependentNeedAmount: untimedAmount,
            timingTreatment: "kept-through-horizon-current-dollar"
          }
        ));
      }
    }
    return {
      amount: untimedAmount,
      status: untimedAmount > 0 ? "kept-through-horizon" : "not-present",
      count: untimedAmount > 0 ? Math.max(0, projectedModel.aggregateCount - projectedModel.timedSchedules.length) : 0,
      traceCode: untimedAmount > 0
        ? "projected-dependent-education-kept-through-horizon"
        : "projected-dependent-education-not-present"
    };
  }

  function createPointScheduleRecord(schedule, grossAmount, pointCalendarYear, offsetAmount) {
    const safeOffset = roundMoney(Math.min(
      Math.max(0, offsetAmount || 0),
      Math.max(0, grossAmount || 0)
    ));
    const netAmount = roundMoney(Math.max(0, (grossAmount || 0) - safeOffset));
    return {
      id: schedule.id,
      kind: schedule.kind,
      amount: netAmount,
      grossAmount,
      educationSavingsOffsetAmount: safeOffset,
      netAmount,
      educationStartYear: schedule.educationStartYear,
      sourcePath: schedule.sourcePath,
      unpaidPayments: schedule.payments.filter(function (payment) {
        return payment.paymentYear != null && grossAmount > 0 && pointCalendarYear <= payment.paymentYear;
      }).map(clonePlainValue)
    };
  }

  function collectUnpaidPaymentObligations(schedule, pointCalendarYear) {
    if (pointCalendarYear == null) {
      return [];
    }
    return schedule.payments.filter(function (payment) {
      return payment.paymentYear != null && pointCalendarYear <= payment.paymentYear;
    }).map(function (payment) {
      return {
        id: `${schedule.id}:payment-${payment.paymentIndex}`,
        dependentId: schedule.id,
        dependentKind: schedule.kind,
        obligationType: "scheduled-payment",
        paymentYear: payment.paymentYear,
        amount: Math.max(0, toOptionalNumber(payment.amount) || 0),
        sourcePath: schedule.sourcePath
      };
    }).filter(function (item) {
      return item.amount > 0;
    });
  }

  function allocateEducationSavingsOffset(obligations, availableAmount) {
    const sorted = (Array.isArray(obligations) ? obligations : []).slice().sort(function (left, right) {
      const leftYear = left.paymentYear == null ? Number.POSITIVE_INFINITY : left.paymentYear;
      const rightYear = right.paymentYear == null ? Number.POSITIVE_INFINITY : right.paymentYear;
      if (leftYear !== rightYear) {
        return leftYear - rightYear;
      }
      return normalizeString(left.id).localeCompare(normalizeString(right.id));
    });
    let remainingOffset = Math.max(0, toOptionalNumber(availableAmount) || 0);
    const appliedByDependentId = {};
    const appliedByObligation = [];
    let appliedToTimedCurrentDependents = 0;
    let appliedToTimedProjectedDependents = 0;
    let appliedToUntimedProjectedDependents = 0;

    sorted.forEach(function (item) {
      if (!(remainingOffset > 0) || !(item.amount > 0)) {
        return;
      }
      const applied = roundMoney(Math.min(remainingOffset, item.amount));
      remainingOffset = roundMoney(remainingOffset - applied);
      if (item.dependentId) {
        appliedByDependentId[item.dependentId] = roundMoney((appliedByDependentId[item.dependentId] || 0) + applied);
      }
      if (item.dependentKind === "currentDependent") {
        appliedToTimedCurrentDependents = roundMoney(appliedToTimedCurrentDependents + applied);
      } else if (item.dependentKind === "projectedDependent") {
        appliedToTimedProjectedDependents = roundMoney(appliedToTimedProjectedDependents + applied);
      } else if (item.dependentKind === "projectedDependentAggregate") {
        appliedToUntimedProjectedDependents = roundMoney(appliedToUntimedProjectedDependents + applied);
      }
      appliedByObligation.push({
        id: item.id,
        dependentId: item.dependentId || null,
        dependentKind: item.dependentKind || null,
        obligationType: item.obligationType,
        paymentYear: item.paymentYear ?? null,
        grossAmount: roundMoney(item.amount),
        offsetAmount: applied,
        netAmount: roundMoney(Math.max(0, item.amount - applied)),
        sourcePath: item.sourcePath || null
      });
    });

    const totalApplied = roundMoney(appliedByObligation.reduce(function (sum, item) {
      return sum + item.offsetAmount;
    }, 0));
    return {
      totalApplied,
      remainingOffsetAvailable: roundMoney(remainingOffset),
      appliedByDependentId,
      appliedByObligation,
      appliedToTimedCurrentDependents,
      appliedToTimedProjectedDependents,
      appliedToUntimedProjectedDependents,
      allocationRule: "earliest-unpaid-education-payments-first"
    };
  }

  function buildCoverageStrategyEducationLifetimeProjection(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const educationSupport = isPlainObject(safeInput.educationSupport) ? safeInput.educationSupport : {};
    const educationAssumptions = isPlainObject(safeInput.educationAssumptions) ? safeInput.educationAssumptions : {};
    const coverageStrategyScenarioSettings = isPlainObject(safeInput.coverageStrategyScenarioSettings)
      ? clonePlainValue(safeInput.coverageStrategyScenarioSettings)
      : null;
    const needPoints = getNeedPoints(safeInput);
    const warnings = [];
    const dataGaps = [];
    const valuationDateResult = normalizeDateOnly(safeInput.valuationDate);
    if (!valuationDateResult) {
      addIssue(
        dataGaps,
        "education-lifetime-valuation-date-missing",
        "Coverage Strategy education lifetime projection needs a valid valuationDate for dependent timing.",
        { valuationDate: safeInput.valuationDate || null }
      );
    }
    const rateResult = normalizePercentRate(safeInput.educationInflationRatePercent, warnings);
    const includeEducationFunding = educationAssumptions.includeEducationFunding !== false;
    const educationStartAge = normalizeEducationStartAge(educationAssumptions.educationStartAge, warnings);
    const paymentScheduleModeResult = resolveEducationPaymentScheduleMode(
      coverageStrategyScenarioSettings,
      warnings
    );
    const educationSavingsAssets = collectEducationSavingsAssets(safeInput, warnings);
    const rawEducationSavingsOffsetActivation = resolveEducationSavingsOffsetActivation(
      educationAssumptions,
      coverageStrategyScenarioSettings,
      educationSavingsAssets.eligibleAssets.length,
      dataGaps
    );
    const educationResourceSpendingMode = resolveEducationResourceSpendingMode(
      coverageStrategyScenarioSettings,
      rawEducationSavingsOffsetActivation,
      warnings
    );
    const educationSavingsOffsetActivation = applyEducationResourceSpendingModeToSavingsActivation(
      rawEducationSavingsOffsetActivation,
      educationResourceSpendingMode
    );
    const broaderEligibleResourceSpending = resolveBroaderEligibleResourceSpending(
      educationResourceSpendingMode,
      dataGaps
    );
    const educationSavingsOffsetActive = educationSavingsOffsetActivation.active === true;
    const activeEducationSavingsOffsetAvailable = educationSavingsOffsetActive
      ? educationSavingsAssets.totalEducationSavingsAvailable
      : 0;
    const context = {
      valuationDate: valuationDateResult ? valuationDateResult.normalizedDate : null,
      valuationYear: valuationDateResult ? valuationDateResult.calendarYear : null,
      educationStartAge,
      educationPaymentScheduleMode: paymentScheduleModeResult.mode,
      educationPaymentScheduleModeSource: paymentScheduleModeResult.sourcePath,
      educationPaymentScheduleModeDefaulted: paymentScheduleModeResult.defaulted,
      paymentYearCount: paymentScheduleModeResult.mode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START
        ? 1
        : (toOptionalNumber(safeInput.options?.paymentYearCount) || DEFAULT_PAYMENT_YEARS),
      applyEducationInflation: includeEducationFunding
        && educationAssumptions.applyEducationInflation === true
        && rateResult.annualRate > 0,
      educationInflationAnnualRate: rateResult.annualRate
    };

    if (!includeEducationFunding) {
      return {
        projectionVersion: COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION,
        status: "complete",
        educationPoints: needPoints.map(function (point) {
          return {
            yearIndex: Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0)),
            date: point?.date || null,
            calendarYear: point?.calendarYear ?? null,
            clientAge: point?.age ?? null,
            educationNeedAmount: 0,
            currentDependentNeedAmount: 0,
            projectedDependentNeedAmount: 0,
            untimedProjectedDependentNeedAmount: 0,
            includedDependentCount: 0,
            excludedDependentCount: 0,
            warnings: [],
            dataGaps: [],
            trace: {
              source: "coverage-strategy-education-lifetime-projection",
              projectionMode: "education-funding-excluded-by-setting",
              educationSavingsOffsetStatus: educationSavingsOffsetActivation.status,
              educationSavingsOffsetApplied: false,
              educationPaymentScheduleMode: context.educationPaymentScheduleMode,
              educationPaymentScheduleModeSource: context.educationPaymentScheduleModeSource,
              educationSavingsOffsetOwnership: educationSavingsOffsetActivation.ownership,
              educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
              effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
              educationResourceSpendingModeSource: educationResourceSpendingMode.source,
              broaderEligibleResourceOffsetApplied: 0,
              coverageStrategyScenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
              resourceSpendingApplied: false,
              generalResourceReductionApplied: false
            }
          };
        }),
        currentDependentSchedules: [],
        projectedDependentSchedules: [],
        untimedProjectedDependents: [],
        includedDependents: [],
        excludedDependents: [],
        assumptionsUsed: {
          includeEducationFunding: false,
          educationPaymentScheduleMode: context.educationPaymentScheduleMode,
          educationPaymentScheduleModeSource: context.educationPaymentScheduleModeSource,
          educationPaymentScheduleModeDefaulted: context.educationPaymentScheduleModeDefaulted,
          educationSavingsOffsetApplied: false,
          educationSavingsOffsetStatus: educationSavingsOffsetActivation.status,
          educationSavingsOffsetSettingSource: educationSavingsOffsetActivation.sourcePath,
          educationSavingsOffsetSettingOwnership: educationSavingsOffsetActivation.ownership,
          educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
          effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
          educationResourceSpendingModeSource: educationResourceSpendingMode.source,
          broaderEligibleResourceOffsetApplied: 0,
          coverageStrategyScenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
          resourceSpendingApplied: false
        },
        educationSavingsOffset: {
          status: educationSavingsOffsetActivation.status,
          active: false,
          settingAvailable: educationSavingsOffsetActivation.settingAvailable,
          settingSourcePath: educationSavingsOffsetActivation.sourcePath,
          settingOwnership: educationSavingsOffsetActivation.ownership,
          legacyMapped: educationSavingsOffsetActivation.legacyMapped === true,
          scenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
          totalEducationSavingsAvailable: educationSavingsAssets.totalEducationSavingsAvailable,
          totalEducationSavingsApplied: 0,
          eligibleEducationSavingsAssets: educationSavingsAssets.eligibleAssets.map(clonePlainValue),
          excludedEducationSavingsAssets: educationSavingsAssets.excludedAssets.map(clonePlainValue),
          allocationRule: "not-applied-education-funding-excluded",
          resourceReductionApplied: false
        },
        educationResourceSpending: createEducationResourceSpendingTrace(
          educationResourceSpendingMode,
          broaderEligibleResourceSpending,
          0,
          0
        ),
        warnings,
        dataGaps,
        trace: {
          source: "coverage-strategy-education-lifetime-projection",
          educationPaymentScheduleMode: context.educationPaymentScheduleMode,
          educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
          effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
          broaderEligibleResourceOffsetApplied: 0,
          displayHtmlUsed: false,
          storageUsed: false,
          inputMutated: false
        }
      };
    }

    const currentModel = buildCurrentDependentSchedules(safeInput, context, warnings, dataGaps);
    const projectedModel = buildProjectedDependentSchedules(safeInput, context, warnings);
    const untimedProjected = resolveUntimedProjectedDependentNeed(
      educationSupport,
      projectedModel,
      educationAssumptions,
      context,
      warnings
    );
    const timedSchedules = currentModel.schedules.concat(
      educationAssumptions.includeProjectedDependents === false ? [] : projectedModel.timedSchedules
    );
    const excludedDependents = currentModel.excluded.concat(projectedModel.excluded);
    const includedDependents = timedSchedules.map(function (schedule) {
      return {
        id: schedule.id,
        kind: schedule.kind,
        dateOfBirth: schedule.dateOfBirth,
        educationStartYear: schedule.educationStartYear,
        baseTotal: schedule.baseTotal,
        sourcePath: schedule.sourcePath
      };
    });
    const untimedProjectedDependents = untimedProjected.amount > 0
      ? [{
          id: "projected-dependent-untimed-aggregate",
          kind: "projectedDependentAggregate",
          amount: untimedProjected.amount,
          count: untimedProjected.count,
          sourcePath: "educationSupport.desiredAdditionalDependentEducationFundingNeed",
          trace: {
            code: untimedProjected.traceCode,
            inflationSource: "projected-dependent-untimed-current-dollar"
          }
        }]
      : [];

    if (!timedSchedules.length && !(untimedProjected.amount > 0) && (toOptionalNumber(educationSupport.totalEducationFundingNeed) || 0) > 0) {
      addIssue(
        dataGaps,
        "education-lifetime-schedule-unavailable",
        "Coverage Strategy could not build a timed education lifetime schedule from available education facts.",
        { totalEducationFundingNeed: educationSupport.totalEducationFundingNeed }
      );
    }

    const educationPoints = needPoints.map(function (point) {
      const yearIndex = Math.max(0, Math.round(toOptionalNumber(point?.yearIndex) || 0));
      const pointCalendarYear = getPointCalendarYear(point, context.valuationYear);
      const currentPointRecords = [];
      const projectedPointRecords = [];
      const obligations = [];
      let grossCurrentDependentNeedAmount = 0;
      let grossTimedProjectedNeedAmount = 0;
      timedSchedules.forEach(function (schedule) {
        const amount = remainingScheduleAmount(schedule, pointCalendarYear);
        const scheduleObligations = collectUnpaidPaymentObligations(schedule, pointCalendarYear);
        obligations.push(...scheduleObligations);
        if (schedule.kind === "currentDependent") {
          grossCurrentDependentNeedAmount = roundMoney(grossCurrentDependentNeedAmount + amount);
          return;
        }
        grossTimedProjectedNeedAmount = roundMoney(grossTimedProjectedNeedAmount + amount);
      });
      const grossUntimedProjectedDependentNeedAmount = untimedProjected.amount;
      if (grossUntimedProjectedDependentNeedAmount > 0 && educationAssumptions.includeProjectedDependents !== false) {
        obligations.push({
          id: "projected-dependent-untimed-aggregate",
          dependentId: "projected-dependent-untimed-aggregate",
          dependentKind: "projectedDependentAggregate",
          obligationType: "untimed-projected-dependent-aggregate",
          paymentYear: null,
          amount: grossUntimedProjectedDependentNeedAmount,
          sourcePath: "educationSupport.desiredAdditionalDependentEducationFundingNeed"
        });
      }
      const offsetAllocation = allocateEducationSavingsOffset(
        obligations,
        activeEducationSavingsOffsetAvailable
      );
      timedSchedules.forEach(function (schedule) {
        const amount = remainingScheduleAmount(schedule, pointCalendarYear);
        if (!(amount > 0)) {
          return;
        }
        const scheduleOffset = educationSavingsOffsetActive
          ? (offsetAllocation.appliedByDependentId[schedule.id] || 0)
          : 0;
        if (schedule.kind === "currentDependent") {
          currentPointRecords.push(createPointScheduleRecord(schedule, amount, pointCalendarYear, scheduleOffset));
          return;
        }
        projectedPointRecords.push(createPointScheduleRecord(schedule, amount, pointCalendarYear, scheduleOffset));
      });
      const educationSavingsOffsetAmount = educationSavingsOffsetActive
        ? offsetAllocation.totalApplied
        : 0;
      const currentDependentNeedAmount = roundMoney(Math.max(
        0,
        grossCurrentDependentNeedAmount - (educationSavingsOffsetActive ? offsetAllocation.appliedToTimedCurrentDependents : 0)
      ));
      const timedProjectedNeedAmount = roundMoney(Math.max(
        0,
        grossTimedProjectedNeedAmount - (educationSavingsOffsetActive ? offsetAllocation.appliedToTimedProjectedDependents : 0)
      ));
      const untimedProjectedDependentNeedAmount = roundMoney(Math.max(
        0,
        grossUntimedProjectedDependentNeedAmount - (educationSavingsOffsetActive ? offsetAllocation.appliedToUntimedProjectedDependents : 0)
      ));
      const grossProjectedDependentNeedAmount = roundMoney(
        grossTimedProjectedNeedAmount + grossUntimedProjectedDependentNeedAmount
      );
      const grossEducationNeedAmount = roundMoney(
        grossCurrentDependentNeedAmount + grossProjectedDependentNeedAmount
      );
      const projectedDependentNeedAmount = roundMoney(timedProjectedNeedAmount + untimedProjectedDependentNeedAmount);
      const educationNeedAmount = roundMoney(Math.max(0, grossEducationNeedAmount - educationSavingsOffsetAmount));
      const remainingNeedAfterEducationSavings = educationNeedAmount;
      const broaderEligibleResourceOffsetAmount = 0;
      const educationResourceSpendingOffsetAmount = roundMoney(
        educationSavingsOffsetAmount + broaderEligibleResourceOffsetAmount
      );
      const pointWarnings = [];
      if (
        educationSavingsOffsetActive
        && offsetAllocation.appliedToUntimedProjectedDependents > 0
      ) {
        pointWarnings.push(createIssue(
          "education-savings-offset-applied-to-untimed-projected-dependent-aggregate",
          "Remaining education savings offset was applied to untimed projected dependent aggregate need without inventing timing.",
          {
            yearIndex,
            offsetAmount: offsetAllocation.appliedToUntimedProjectedDependents
          }
        ));
      }
      return {
        yearIndex,
        date: point?.date || null,
        calendarYear: point?.calendarYear ?? null,
        clientAge: point?.age ?? null,
        educationNeedAmount,
        grossEducationNeedAmount,
        educationSavingsOffsetAmount,
        educationResourceSpendingOffsetAmount,
        broaderEligibleResourceOffsetAmount,
        remainingEducationNeedAfterEducationSavings: remainingNeedAfterEducationSavings,
        netEducationNeedAmount: educationNeedAmount,
        currentDependentNeedAmount,
        grossCurrentDependentNeedAmount,
        currentDependentEducationSavingsOffsetAmount: educationSavingsOffsetActive
          ? offsetAllocation.appliedToTimedCurrentDependents
          : 0,
        netCurrentDependentNeedAmount: currentDependentNeedAmount,
        projectedDependentNeedAmount,
        grossProjectedDependentNeedAmount,
        projectedDependentEducationSavingsOffsetAmount: educationSavingsOffsetActive
          ? roundMoney(offsetAllocation.appliedToTimedProjectedDependents + offsetAllocation.appliedToUntimedProjectedDependents)
          : 0,
        netProjectedDependentNeedAmount: projectedDependentNeedAmount,
        untimedProjectedDependentNeedAmount,
        grossUntimedProjectedDependentNeedAmount,
        untimedProjectedDependentEducationSavingsOffsetAmount: educationSavingsOffsetActive
          ? offsetAllocation.appliedToUntimedProjectedDependents
          : 0,
        netUntimedProjectedDependentNeedAmount: untimedProjectedDependentNeedAmount,
        remainingEducationSavingsOffsetAvailable: educationSavingsOffsetActive
          ? offsetAllocation.remainingOffsetAvailable
          : educationSavingsAssets.totalEducationSavingsAvailable,
        includedDependentCount: currentPointRecords.length + projectedPointRecords.length + untimedProjectedDependents.length,
        excludedDependentCount: excludedDependents.length,
        includedRecords: currentPointRecords.concat(projectedPointRecords).concat(untimedProjectedDependents.map(function (record) {
          const offsetAmount = educationSavingsOffsetActive
            ? offsetAllocation.appliedToUntimedProjectedDependents
            : 0;
          return {
            ...clonePlainValue(record),
            grossAmount: grossUntimedProjectedDependentNeedAmount,
            educationSavingsOffsetAmount: offsetAmount,
            broaderEligibleResourceOffsetAmount: 0,
            netAmount: untimedProjectedDependentNeedAmount,
            amount: untimedProjectedDependentNeedAmount
          };
        })),
        excludedDependents: excludedDependents.map(clonePlainValue),
        warnings: pointWarnings,
        dataGaps: [],
        trace: {
          source: "coverage-strategy-education-lifetime-projection",
          projectionMode: "record-level-education-obligation-schedule",
          annualPointRule: "annual-calendar-year-basis",
          educationPaymentScheduleMode: context.educationPaymentScheduleMode,
          educationPaymentScheduleModeSource: context.educationPaymentScheduleModeSource,
          fourYearPaymentScheduleUsed: context.educationPaymentScheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_FOUR_YEAR_ANNUAL,
          lumpSumAtStartScheduleUsed: context.educationPaymentScheduleMode === EDUCATION_PAYMENT_SCHEDULE_MODE_LUMP_SUM_AT_START,
          educationSavingsOffsetStatus: educationSavingsOffsetActivation.status,
          educationSavingsOffsetApplied: educationSavingsOffsetActive && educationSavingsOffsetAmount > 0,
          educationSavingsOffsetActivationTraceCode: educationSavingsOffsetActivation.traceCode,
          educationSavingsOffsetOwnership: educationSavingsOffsetActivation.ownership,
          coverageStrategyScenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
          educationSavingsOffsetAllocationRule: educationSavingsOffsetActive
            ? offsetAllocation.allocationRule
            : "not-applied",
          educationSavingsOffsetObligations: educationSavingsOffsetActive
            ? offsetAllocation.appliedByObligation
            : [],
          educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
          effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
          educationResourceSpendingModeSource: educationResourceSpendingMode.source,
          educationResourceSpendingModeSourcePath: educationResourceSpendingMode.sourcePath,
          educationResourceSpendingModeDerivedFromUseEducationSavingsOffset:
            educationResourceSpendingMode.derivedFromUseEducationSavingsOffset === true,
          educationResourceSpendingOffsetAmount,
          remainingEducationNeedAfterEducationSavings: remainingNeedAfterEducationSavings,
          broaderEligibleResourcesRequested: broaderEligibleResourceSpending.requested === true,
          broaderEligibleResourceStatus: broaderEligibleResourceSpending.status,
          broaderEligibleResourceOffsetAmount,
          broaderEligibleResourceOffsetApplied: broaderEligibleResourceOffsetAmount,
          broaderEligibleResourceSourceAvailable: broaderEligibleResourceSpending.sourceAvailable === true,
          broaderEligibleResourceWarningCode: broaderEligibleResourceSpending.warningCode,
          educationSpecificSavingsConsumed: educationSavingsOffsetActive && educationSavingsOffsetAmount > 0,
          resourceSpendingApplied: false,
          generalResourceReductionApplied: false,
          untimedProjectedDependentStatus: untimedProjected.status
        }
      };
    });
    const maxEducationSavingsApplied = roundMoney(educationPoints.reduce(function (max, point) {
      return Math.max(max, toOptionalNumber(point.educationSavingsOffsetAmount) || 0);
    }, 0));

    return {
      projectionVersion: COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION,
      status: educationPoints.length ? "complete" : "unavailable",
      educationPoints,
      currentDependentSchedules: currentModel.schedules.map(clonePlainValue),
      projectedDependentSchedules: projectedModel.timedSchedules.map(clonePlainValue),
      untimedProjectedDependents: untimedProjectedDependents.map(clonePlainValue),
      includedDependents,
      excludedDependents,
      assumptionsUsed: {
        valuationDate: context.valuationDate,
        educationStartAge,
        educationPaymentScheduleMode: context.educationPaymentScheduleMode,
        educationPaymentScheduleModeSource: context.educationPaymentScheduleModeSource,
        educationPaymentScheduleModeDefaulted: context.educationPaymentScheduleModeDefaulted,
        paymentYearCount: context.paymentYearCount,
        includeEducationFunding,
        includeProjectedDependents: educationAssumptions.includeProjectedDependents !== false,
        applyEducationInflation: educationAssumptions.applyEducationInflation === true,
        educationInflationRateInput: rateResult.sourceValue,
        educationInflationAnnualRate: roundRatio(rateResult.annualRate),
        educationInflationApplied: context.applyEducationInflation,
        annualPointRule: "annual-calendar-year-basis",
        projectedDependentUntimedRule: "keep-through-coverage-strategy-projection-horizon",
        educationSavingsOffsetApplied: educationSavingsOffsetActive && maxEducationSavingsApplied > 0,
        educationSavingsOffsetStatus: educationSavingsOffsetActivation.status,
        educationSavingsOffsetSettingSource: educationSavingsOffsetActivation.sourcePath,
        educationSavingsOffsetSettingOwnership: educationSavingsOffsetActivation.ownership,
        educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
        effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
        educationResourceSpendingModeSource: educationResourceSpendingMode.source,
        educationResourceSpendingModeSourcePath: educationResourceSpendingMode.sourcePath,
        educationResourceSpendingModeDerivedFromUseEducationSavingsOffset:
          educationResourceSpendingMode.derivedFromUseEducationSavingsOffset === true,
        broaderEligibleResourceOffsetApplied: broaderEligibleResourceSpending.totalApplied,
        broaderEligibleResourceStatus: broaderEligibleResourceSpending.status,
        coverageStrategyScenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
        resourceSpendingApplied: false,
        generalResourceReductionApplied: false,
        educationSpecificSavingsConsumed: educationSavingsOffsetActive && maxEducationSavingsApplied > 0,
        fundingTarget: getFundingTargetTrace(educationAssumptions)
      },
      educationSavingsOffset: {
        status: educationSavingsOffsetActivation.status,
        active: educationSavingsOffsetActive,
        settingAvailable: educationSavingsOffsetActivation.settingAvailable,
        settingSourcePath: educationSavingsOffsetActivation.sourcePath,
        settingOwnership: educationSavingsOffsetActivation.ownership,
        legacyMapped: educationSavingsOffsetActivation.legacyMapped === true,
        scenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
        totalEducationSavingsAvailable: educationSavingsAssets.totalEducationSavingsAvailable,
        totalEducationSavingsApplied: maxEducationSavingsApplied,
        eligibleEducationSavingsAssets: educationSavingsAssets.eligibleAssets.map(clonePlainValue),
        excludedEducationSavingsAssets: educationSavingsAssets.excludedAssets.map(clonePlainValue),
        allocationRule: educationSavingsOffsetActive
          ? "earliest-unpaid-education-payments-first"
          : "not-applied",
        resourceReductionApplied: false,
        generalResourceSpendingApplied: false,
        trace: {
          source: "coverage-strategy-education-lifetime-projection",
          resourceLineMathChanged: false,
          rawEducationSpecificAssetValuesUsed: educationSavingsOffsetActive,
          treatedAssetOffsetsUsedForDoubleCountGuard: true,
          educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
          effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
          broaderEligibleResourceOffsetApplied: broaderEligibleResourceSpending.totalApplied,
          broaderEligibleResourceStatus: broaderEligibleResourceSpending.status,
          generalResourceReductionApplied: false
        }
      },
      educationResourceSpending: createEducationResourceSpendingTrace(
        educationResourceSpendingMode,
        broaderEligibleResourceSpending,
        maxEducationSavingsApplied,
        roundMoney(Math.max(0, educationPoints.reduce(function (max, point) {
          return Math.max(max, toOptionalNumber(point.remainingEducationNeedAfterEducationSavings) || 0);
        }, 0)))
      ),
      warnings,
      dataGaps,
      trace: {
        source: "coverage-strategy-education-lifetime-projection",
        educationPaymentScheduleMode: context.educationPaymentScheduleMode,
        educationPaymentScheduleModeSource: context.educationPaymentScheduleModeSource,
        educationPaymentScheduleModeDefaulted: context.educationPaymentScheduleModeDefaulted,
        visiblePaymentScheduleControl: false,
        currentDependentScheduleCount: currentModel.schedules.length,
        projectedDependentScheduleCount: projectedModel.timedSchedules.length,
        untimedProjectedDependentCount: untimedProjectedDependents.length,
        excludedDependentCount: excludedDependents.length,
        pointCount: educationPoints.length,
        educationSavingsOffsetStatus: educationSavingsOffsetActivation.status,
        educationSavingsOffsetApplied: educationSavingsOffsetActive && maxEducationSavingsApplied > 0,
        educationSavingsOffsetOwnership: educationSavingsOffsetActivation.ownership,
        educationResourceSpendingMode: educationResourceSpendingMode.selectedMode,
        effectiveEducationResourceSpendingMode: educationResourceSpendingMode.effectiveMode,
        educationResourceSpendingModeSource: educationResourceSpendingMode.source,
        broaderEligibleResourceOffsetApplied: broaderEligibleResourceSpending.totalApplied,
        broaderEligibleResourceStatus: broaderEligibleResourceSpending.status,
        visibleResourceSpendingControl: false,
        coverageStrategyScenarioSettingsSource: coverageStrategyScenarioSettings?.source || null,
        generalResourceReductionApplied: false,
        displayHtmlUsed: false,
        storageUsed: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION =
    COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION;
  lensAnalysis.buildCoverageStrategyEducationLifetimeProjection =
    buildCoverageStrategyEducationLifetimeProjection;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_EDUCATION_LIFETIME_PROJECTION_VERSION,
      buildCoverageStrategyEducationLifetimeProjection
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
