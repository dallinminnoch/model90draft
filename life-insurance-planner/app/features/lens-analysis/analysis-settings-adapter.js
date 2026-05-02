(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});
  const ASSET_OFFSET_SOURCE_TREATED = "treated";
  const DEFAULT_INFLATION_ASSUMPTIONS = Object.freeze({
    enabled: true,
    generalInflationRatePercent: 3,
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 85,
    source: "analysis-setup"
  });
  const INFLATION_RATE_FIELDS = Object.freeze([
    "generalInflationRatePercent",
    "householdExpenseInflationRatePercent",
    "educationInflationRatePercent",
    "healthcareInflationRatePercent",
    "finalExpenseInflationRatePercent"
  ]);
  const MAX_INFLATION_RATE_PERCENT = 100;
  const MIN_FINAL_EXPENSE_TARGET_AGE = 0;
  const MAX_FINAL_EXPENSE_TARGET_AGE = 120;
  const DEFAULT_EDUCATION_START_AGE = 18;
  const MIN_EDUCATION_START_AGE = 0;
  const MAX_EDUCATION_START_AGE = 30;
  const DEFAULT_EDUCATION_ASSUMPTIONS = Object.freeze({
    includeEducationFunding: true,
    includeProjectedDependents: true,
    applyEducationInflation: false,
    educationStartAge: DEFAULT_EDUCATION_START_AGE,
    fundingTargetPercent: 100,
    useExistingEducationSavingsOffset: false,
    source: "analysis-setup"
  });
  const HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR = "currentDollarOnly";
  const HEALTHCARE_ONE_TIME_PROJECTION_MODES = Object.freeze([
    HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR
  ]);
  const MIN_HEALTHCARE_EXPENSE_PROJECTION_YEARS = 1;
  const MAX_HEALTHCARE_EXPENSE_PROJECTION_YEARS = 60;
  const DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS = Object.freeze({
    enabled: false,
    projectionYears: 10,
    includeOneTimeHealthcareExpenses: false,
    oneTimeProjectionMode: HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR,
    source: "analysis-setup"
  });

  // Owner: lens-analysis settings adapter.
  // Purpose: map saved Analysis Setup settings into the flat settings objects
  // consumed by the pure analysis method layer.
  // Non-goals: no DOM reads, no persistence, no formula logic, no Lens model
  // mutation, and no calculation of inflation, growth, or asset treatment
  // outputs.

  const DEFAULT_DIME_SETTINGS = Object.freeze({
    dimeIncomeYears: 10,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false,
    assetOffsetSource: ASSET_OFFSET_SOURCE_TREATED
  });

  const DEFAULT_NEEDS_ANALYSIS_SETTINGS = Object.freeze({
    needsSupportDurationYears: 10,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: true,
    assetOffsetSource: ASSET_OFFSET_SOURCE_TREATED,
    includeEssentialSupport: true,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: true
  });

  const DEFAULT_HUMAN_LIFE_VALUE_SETTINGS = Object.freeze({
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false,
    assetOffsetSource: ASSET_OFFSET_SOURCE_TREATED
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source || {}, key);
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function createWarning(code, message, severity, sourcePaths) {
    return {
      code,
      message,
      severity: severity || "warning",
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths : []
    };
  }

  function createTrace(key, message, sourcePaths) {
    return {
      key,
      message,
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths : []
    };
  }

  function formatDateOnlyFromDate(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function getCurrentDateOnly() {
    const today = new Date();
    return formatDateOnlyFromDate(today);
  }

  function normalizeDateOnlyValue(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : formatDateOnlyFromDate(value);
    }

    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
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

    return formatDateOnlyFromDate(date);
  }

  function resolvePlanningValuationDate(analysisSettings, warnings, trace) {
    const savedDate = normalizeDateOnlyValue(analysisSettings.valuationDate);
    if (savedDate) {
      trace.push(createTrace(
        "planning-valuation-date-saved",
        "Planning As-Of Date came from saved Analysis Setup valuationDate.",
        ["analysisSettings.valuationDate"]
      ));
      return {
        valuationDate: savedDate,
        valuationDateSource: "analysisSettings.valuationDate",
        valuationDateDefaulted: false,
        valuationDateWarningCode: null
      };
    }

    const hasInvalidSavedDate = hasOwn(analysisSettings, "valuationDate")
      && String(analysisSettings.valuationDate || "").trim() !== "";
    const warningCode = hasInvalidSavedDate
      ? "invalid-analysis-valuation-date-defaulted"
      : "analysis-valuation-date-defaulted";
    const message = hasInvalidSavedDate
      ? "Saved Planning As-Of Date was invalid; current date was used for date-sensitive projections."
      : "Planning As-Of Date was missing; current date was used for date-sensitive projections.";

    warnings.push(createWarning(
      warningCode,
      message,
      hasInvalidSavedDate ? "warning" : "info",
      ["analysisSettings.valuationDate"]
    ));
    trace.push(createTrace(
      "planning-valuation-date-defaulted",
      message,
      ["analysisSettings.valuationDate"]
    ));

    return {
      valuationDate: getCurrentDateOnly(),
      valuationDateSource: "system-current-date-fallback",
      valuationDateDefaulted: true,
      valuationDateWarningCode: warningCode
    };
  }

  function applyPlanningValuationDateSettings(settings, valuationDateResult) {
    settings.valuationDate = valuationDateResult.valuationDate;
    settings.valuationDateSource = valuationDateResult.valuationDateSource;
    settings.valuationDateDefaulted = valuationDateResult.valuationDateDefaulted;
    settings.valuationDateWarningCode = valuationDateResult.valuationDateWarningCode;
  }

  function applyEducationValuationDateSettings(educationAssumptions, valuationDateResult) {
    educationAssumptions.valuationDate = valuationDateResult.valuationDate;
    educationAssumptions.valuationDateSource = valuationDateResult.valuationDateSource;
    educationAssumptions.valuationDateDefaulted = valuationDateResult.valuationDateDefaulted;
    educationAssumptions.valuationDateWarningCode = valuationDateResult.valuationDateWarningCode;
  }

  function cloneDefaults(defaults) {
    return { ...(isPlainObject(defaults) ? defaults : {}) };
  }

  function getDefaultSettings(defaults) {
    const safeDefaults = isPlainObject(defaults) ? defaults : {};

    return {
      dime: {
        ...DEFAULT_DIME_SETTINGS,
        ...cloneDefaults(safeDefaults.dimeSettings)
      },
      needsAnalysis: {
        ...DEFAULT_NEEDS_ANALYSIS_SETTINGS,
        ...cloneDefaults(safeDefaults.needsAnalysisSettings)
      },
      humanLifeValue: {
        ...DEFAULT_HUMAN_LIFE_VALUE_SETTINGS,
        ...cloneDefaults(safeDefaults.humanLifeValueSettings)
      }
    };
  }

  function getForwardAssetOffsetSource() {
    return ASSET_OFFSET_SOURCE_TREATED;
  }

  function applyAssetOffsetSourceSettings(settings, methodDefaults, trace) {
    settings.assetOffsetSource = getForwardAssetOffsetSource();

    if (hasOwn(methodDefaults, "assetOffsetSource")) {
      trace.push(createTrace(
        "assetOffsetSource-deprecated",
        "Saved assetOffsetSource was ignored; treated asset offsets are the forward-facing source.",
        ["analysisSettings.methodDefaults.assetOffsetSource"]
      ));
    }

    if (hasOwn(methodDefaults, "fallbackToLegacyOffsetAssets")) {
      trace.push(createTrace(
        "fallbackToLegacyOffsetAssets-deprecated",
        "Saved fallbackToLegacyOffsetAssets was ignored by the settings adapter.",
        ["analysisSettings.methodDefaults.fallbackToLegacyOffsetAssets"]
      ));
    }
  }

  function applyExistingCoverageSettings(settings, analysisSettings, trace) {
    const existingCoverage = isPlainObject(analysisSettings.existingCoverageAssumptions)
      ? analysisSettings.existingCoverageAssumptions
      : null;
    if (!existingCoverage || typeof existingCoverage.includeExistingCoverage !== "boolean") {
      return;
    }

    settings.includeExistingCoverageOffset = existingCoverage.includeExistingCoverage;
    trace.push(createTrace(
      "includeExistingCoverageOffset-existing-coverage",
      "includeExistingCoverageOffset came from Analysis Setup Existing Coverage assumptions.",
      ["analysisSettings.existingCoverageAssumptions.includeExistingCoverage"]
    ));
  }

  function applyNeedsAssetOffsetInclusionSettings(settings, methodDefaults, warnings, trace) {
    if (!hasOwn(methodDefaults, "needsIncludeOffsetAssets")) {
      settings.includeOffsetAssets = true;
      return;
    }

    if (typeof methodDefaults.needsIncludeOffsetAssets === "boolean") {
      settings.includeOffsetAssets = methodDefaults.needsIncludeOffsetAssets;
      trace.push(createTrace(
        "needs-include-offset-assets-saved",
        "includeOffsetAssets for Needs came from saved Analysis Setup method defaults.",
        ["analysisSettings.methodDefaults.needsIncludeOffsetAssets"]
      ));
      return;
    }

    settings.includeOffsetAssets = true;
    warnings.push(createWarning(
      "invalid-needs-include-offset-assets",
      "Saved Needs asset-offset inclusion was invalid and defaulted to true.",
      "warning",
      ["analysisSettings.methodDefaults.needsIncludeOffsetAssets"]
    ));
  }

  function applySurvivorSupportSettings(settings, analysisSettings, warnings, trace) {
    const survivorSupport = isPlainObject(analysisSettings.survivorSupportAssumptions)
      ? analysisSettings.survivorSupportAssumptions
      : null;
    if (!survivorSupport) {
      return;
    }

    const survivorIncomeTreatment = isPlainObject(survivorSupport.survivorIncomeTreatment)
      ? survivorSupport.survivorIncomeTreatment
      : {};
    const supportTreatment = isPlainObject(survivorSupport.supportTreatment)
      ? survivorSupport.supportTreatment
      : {};

    if (typeof survivorIncomeTreatment.includeSurvivorIncome === "boolean") {
      settings.includeSurvivorIncomeOffset = survivorIncomeTreatment.includeSurvivorIncome;
      trace.push(createTrace(
        "includeSurvivorIncomeOffset-survivor-support",
        "includeSurvivorIncomeOffset came from Analysis Setup Survivor & Support assumptions.",
        ["analysisSettings.survivorSupportAssumptions.survivorIncomeTreatment.includeSurvivorIncome"]
      ));
    }

    if (typeof supportTreatment.includeTransitionNeeds === "boolean") {
      settings.includeTransitionNeeds = supportTreatment.includeTransitionNeeds;
      trace.push(createTrace(
        "includeTransitionNeeds-survivor-support",
        "includeTransitionNeeds came from Analysis Setup Survivor & Support assumptions.",
        ["analysisSettings.survivorSupportAssumptions.supportTreatment.includeTransitionNeeds"]
      ));
    }

    if (typeof supportTreatment.includeEssentialSupport === "boolean") {
      settings.includeEssentialSupport = supportTreatment.includeEssentialSupport;
      trace.push(createTrace(
        "includeEssentialSupport-survivor-support",
        "includeEssentialSupport came from Analysis Setup Survivor & Support assumptions.",
        ["analysisSettings.survivorSupportAssumptions.supportTreatment.includeEssentialSupport"]
      ));
    }

    if (typeof supportTreatment.includeDiscretionarySupport === "boolean") {
      settings.includeDiscretionarySupport = supportTreatment.includeDiscretionarySupport;
      trace.push(createTrace(
        "includeDiscretionarySupport-survivor-support",
        "includeDiscretionarySupport came from Analysis Setup Survivor & Support assumptions.",
        ["analysisSettings.survivorSupportAssumptions.supportTreatment.includeDiscretionarySupport"]
      ));
    }

    if (hasOwn(supportTreatment, "supportDurationYears") && supportTreatment.supportDurationYears !== null) {
      const supportDurationYears = toOptionalNumber(supportTreatment.supportDurationYears);
      if (supportDurationYears != null && supportDurationYears > 0) {
        settings.needsSupportDurationYears = supportDurationYears;
        trace.push(createTrace(
          "needsSupportDurationYears-survivor-support",
          "needsSupportDurationYears came from Analysis Setup Survivor & Support support duration override.",
          ["analysisSettings.survivorSupportAssumptions.supportTreatment.supportDurationYears"]
        ));
      } else {
        warnings.push(createWarning(
          "invalid-survivor-support-duration-years",
          "Saved Survivor & Support duration override was invalid and was ignored.",
          "warning",
          ["analysisSettings.survivorSupportAssumptions.supportTreatment.supportDurationYears"]
        ));
      }
    }
  }

  function normalizeInflationRate(value, fallback, key, warnings) {
    const sourcePath = `analysisSettings.inflationAssumptions.${key}`;
    const parsed = toOptionalNumber(value);

    if (parsed == null) {
      warnings.push(createWarning(
        `invalid-${key}`,
        `${key} was invalid and defaulted to ${fallback}.`,
        "warning",
        [sourcePath]
      ));
      return fallback;
    }

    if (parsed < 0) {
      warnings.push(createWarning(
        `negative-${key}`,
        `${key} was negative and defaulted to ${fallback}.`,
        "warning",
        [sourcePath]
      ));
      return fallback;
    }

    if (parsed > MAX_INFLATION_RATE_PERCENT) {
      warnings.push(createWarning(
        `clamped-${key}`,
        `${key} was above 100 and was clamped to 100.`,
        "warning",
        [sourcePath]
      ));
      return MAX_INFLATION_RATE_PERCENT;
    }

    return parsed;
  }

  function hasUsableInflationFallback(source, key) {
    const parsed = toOptionalNumber(source[key]);
    return parsed != null && parsed >= 0;
  }

  function normalizeCurrentNeedsInflationRate(source, key, normalized, warnings) {
    const hasSavedValue = hasOwn(source, key);
    const hasGeneralFallback = hasUsableInflationFallback(source, "generalInflationRatePercent");

    if (!hasSavedValue) {
      if (hasGeneralFallback) {
        delete normalized[key];
      }
      return;
    }

    const parsed = toOptionalNumber(source[key]);
    if (parsed != null && parsed >= 0) {
      normalized[key] = normalizeInflationRate(
        source[key],
        DEFAULT_INFLATION_ASSUMPTIONS[key],
        key,
        warnings
      );
      return;
    }

    if (hasGeneralFallback) {
      warnings.push(createWarning(
        `invalid-${key}-general-fallback`,
        `${key} was invalid; Needs Analysis will use generalInflationRatePercent as the fallback.`,
        "warning",
        [`analysisSettings.inflationAssumptions.${key}`]
      ));
      delete normalized[key];
      return;
    }

    normalized[key] = normalizeInflationRate(
      source[key],
      DEFAULT_INFLATION_ASSUMPTIONS[key],
      key,
      warnings
    );
  }

  function normalizeCurrentNeedsFinalExpenseInflationRate(source, normalized, warnings) {
    const key = "finalExpenseInflationRatePercent";
    const sourcePath = `analysisSettings.inflationAssumptions.${key}`;

    if (!hasOwn(source, key)) {
      delete normalized[key];
      return;
    }

    const parsed = toOptionalNumber(source[key]);
    if (parsed != null && parsed >= 0) {
      normalized[key] = normalizeInflationRate(
        source[key],
        DEFAULT_INFLATION_ASSUMPTIONS[key],
        key,
        warnings
      );
      return;
    }

    warnings.push(createWarning(
      `invalid-${key}-current-dollar-fallback`,
      `${key} was invalid; Needs Analysis will use current-dollar final expenses.`,
      "warning",
      [sourcePath]
    ));
    delete normalized[key];
  }

  function normalizeFinalExpenseTargetAge(value, warnings) {
    const sourcePath = "analysisSettings.inflationAssumptions.finalExpenseTargetAge";
    const parsed = toOptionalNumber(value);

    if (parsed == null) {
      warnings.push(createWarning(
        "invalid-finalExpenseTargetAge",
        "finalExpenseTargetAge was invalid; Needs Analysis will use current-dollar final expenses.",
        "warning",
        [sourcePath]
      ));
      return null;
    }

    if (parsed < MIN_FINAL_EXPENSE_TARGET_AGE || parsed > MAX_FINAL_EXPENSE_TARGET_AGE) {
      warnings.push(createWarning(
        "out-of-range-finalExpenseTargetAge",
        "finalExpenseTargetAge was outside the supported range; Needs Analysis will use current-dollar final expenses.",
        "warning",
        [sourcePath]
      ));
      return null;
    }

    return parsed;
  }

  function normalizeEducationPercent(value, fallback, key, warnings) {
    const sourcePath = `analysisSettings.educationAssumptions.fundingTreatment.${key}`;
    const parsed = toOptionalNumber(value);

    if (parsed == null) {
      warnings.push(createWarning(
        `invalid-education-${key}`,
        `${key} was invalid and defaulted to ${fallback}.`,
        "warning",
        [sourcePath]
      ));
      return fallback;
    }

    if (parsed < 0) {
      warnings.push(createWarning(
        `negative-education-${key}`,
        `${key} was negative and defaulted to ${fallback}.`,
        "warning",
        [sourcePath]
      ));
      return fallback;
    }

    if (parsed > 100) {
      warnings.push(createWarning(
        `clamped-education-${key}`,
        `${key} was above 100 and was clamped to 100.`,
        "warning",
        [sourcePath]
      ));
      return 100;
    }

    return parsed;
  }

  function normalizeEducationStartAge(value, warnings) {
    const sourcePath = "analysisSettings.educationAssumptions.fundingTreatment.educationStartAge";
    const parsed = toOptionalNumber(value);

    if (parsed == null) {
      warnings.push(createWarning(
        "invalid-education-start-age",
        "educationStartAge was invalid and defaulted to 18.",
        "warning",
        [sourcePath]
      ));
      return DEFAULT_EDUCATION_START_AGE;
    }

    const rounded = Math.round(parsed);
    if (rounded < MIN_EDUCATION_START_AGE || rounded > MAX_EDUCATION_START_AGE) {
      warnings.push(createWarning(
        "out-of-range-education-start-age",
        "educationStartAge was outside the supported range and defaulted to 18.",
        "warning",
        [sourcePath]
      ));
      return DEFAULT_EDUCATION_START_AGE;
    }

    return rounded;
  }

  function createNeedsEducationAssumptions(analysisSettings, warnings) {
    const saved = isPlainObject(analysisSettings.educationAssumptions)
      ? analysisSettings.educationAssumptions
      : {};
    const fundingTreatment = isPlainObject(saved.fundingTreatment)
      ? saved.fundingTreatment
      : {};
    const normalized = { ...DEFAULT_EDUCATION_ASSUMPTIONS };

    if (
      hasOwn(analysisSettings, "educationAssumptions")
      && !isPlainObject(analysisSettings.educationAssumptions)
    ) {
      warnings.push(createWarning(
        "invalid-education-assumptions",
        "Saved education assumptions were invalid and default assumptions were used.",
        "warning",
        ["analysisSettings.educationAssumptions"]
      ));
    }

    [
      "includeEducationFunding",
      "includeProjectedDependents",
      "applyEducationInflation",
      "useExistingEducationSavingsOffset"
    ].forEach(function (key) {
      if (!hasOwn(fundingTreatment, key)) {
        return;
      }

      if (typeof fundingTreatment[key] === "boolean") {
        normalized[key] = fundingTreatment[key];
        return;
      }

      warnings.push(createWarning(
        `invalid-education-${key}`,
        `${key} was invalid and defaulted to ${DEFAULT_EDUCATION_ASSUMPTIONS[key]}.`,
        "warning",
        [`analysisSettings.educationAssumptions.fundingTreatment.${key}`]
      ));
    });

    if (hasOwn(fundingTreatment, "fundingTargetPercent")) {
      normalized.fundingTargetPercent = normalizeEducationPercent(
        fundingTreatment.fundingTargetPercent,
        DEFAULT_EDUCATION_ASSUMPTIONS.fundingTargetPercent,
        "fundingTargetPercent",
        warnings
      );
    }

    if (hasOwn(fundingTreatment, "educationStartAge")) {
      normalized.educationStartAge = normalizeEducationStartAge(
        fundingTreatment.educationStartAge,
        warnings
      );
    }

    if (typeof saved.source === "string" && saved.source.trim()) {
      normalized.source = saved.source.trim();
    }

    return normalized;
  }

  function normalizeHealthcareExpenseProjectionYears(value, warnings) {
    const sourcePath = "analysisSettings.healthcareExpenseAssumptions.projectionYears";
    const parsed = toOptionalNumber(value);

    if (parsed == null) {
      warnings.push(createWarning(
        "invalid-healthcare-expense-projection-years",
        "Saved healthcare expense projection years was invalid and defaulted to 10.",
        "warning",
        [sourcePath]
      ));
      return DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears;
    }

    const rounded = Math.round(parsed);
    if (
      rounded < MIN_HEALTHCARE_EXPENSE_PROJECTION_YEARS
      || rounded > MAX_HEALTHCARE_EXPENSE_PROJECTION_YEARS
    ) {
      warnings.push(createWarning(
        "out-of-range-healthcare-expense-projection-years",
        "Saved healthcare expense projection years was outside the supported range and defaulted to 10.",
        "warning",
        [sourcePath]
      ));
      return DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears;
    }

    return rounded;
  }

  function createNeedsHealthcareExpenseAssumptions(analysisSettings, warnings) {
    const saved = isPlainObject(analysisSettings.healthcareExpenseAssumptions)
      ? analysisSettings.healthcareExpenseAssumptions
      : {};
    const normalized = { ...DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS };

    if (
      hasOwn(analysisSettings, "healthcareExpenseAssumptions")
      && !isPlainObject(analysisSettings.healthcareExpenseAssumptions)
    ) {
      warnings.push(createWarning(
        "invalid-healthcare-expense-assumptions",
        "Saved healthcare expense assumptions were invalid and default assumptions were used.",
        "warning",
        ["analysisSettings.healthcareExpenseAssumptions"]
      ));
      return normalized;
    }

    if (hasOwn(saved, "enabled")) {
      if (typeof saved.enabled === "boolean") {
        normalized.enabled = saved.enabled;
      } else {
        warnings.push(createWarning(
          "invalid-healthcare-expense-enabled",
          "Saved healthcare expense enabled flag was invalid and defaulted to false.",
          "warning",
          ["analysisSettings.healthcareExpenseAssumptions.enabled"]
        ));
      }
    }

    if (hasOwn(saved, "projectionYears")) {
      normalized.projectionYears = normalizeHealthcareExpenseProjectionYears(
        saved.projectionYears,
        warnings
      );
    }

    if (hasOwn(saved, "includeOneTimeHealthcareExpenses")) {
      if (typeof saved.includeOneTimeHealthcareExpenses === "boolean") {
        normalized.includeOneTimeHealthcareExpenses = saved.includeOneTimeHealthcareExpenses;
      } else {
        warnings.push(createWarning(
          "invalid-healthcare-expense-include-one-time",
          "Saved healthcare expense one-time inclusion flag was invalid and defaulted to false.",
          "warning",
          ["analysisSettings.healthcareExpenseAssumptions.includeOneTimeHealthcareExpenses"]
        ));
      }
    }

    if (hasOwn(saved, "oneTimeProjectionMode")) {
      const normalizedMode = String(saved.oneTimeProjectionMode || "").trim();
      if (HEALTHCARE_ONE_TIME_PROJECTION_MODES.includes(normalizedMode)) {
        normalized.oneTimeProjectionMode = normalizedMode;
      } else {
        warnings.push(createWarning(
          "invalid-healthcare-expense-one-time-projection-mode",
          "Saved healthcare expense one-time projection mode was invalid and defaulted to currentDollarOnly.",
          "warning",
          ["analysisSettings.healthcareExpenseAssumptions.oneTimeProjectionMode"]
        ));
      }
    }

    if (typeof saved.source === "string" && saved.source.trim()) {
      normalized.source = saved.source.trim();
    }

    return normalized;
  }

  function createNeedsInflationAssumptions(analysisSettings, warnings) {
    const saved = isPlainObject(analysisSettings.inflationAssumptions)
      ? analysisSettings.inflationAssumptions
      : {};
    const normalized = { ...DEFAULT_INFLATION_ASSUMPTIONS };

    if (
      hasOwn(analysisSettings, "inflationAssumptions")
      && !isPlainObject(analysisSettings.inflationAssumptions)
    ) {
      warnings.push(createWarning(
        "invalid-inflation-assumptions",
        "Saved inflation assumptions were invalid and default assumptions were used.",
        "warning",
        ["analysisSettings.inflationAssumptions"]
      ));
    }

    if (hasOwn(saved, "enabled")) {
      if (typeof saved.enabled === "boolean") {
        normalized.enabled = saved.enabled;
      } else {
        warnings.push(createWarning(
          "invalid-inflation-enabled",
          "Saved inflation enabled flag was invalid and defaulted to true.",
          "warning",
          ["analysisSettings.inflationAssumptions.enabled"]
        ));
      }
    }

    INFLATION_RATE_FIELDS.forEach(function (key) {
      if (
        key === "householdExpenseInflationRatePercent"
        || key === "educationInflationRatePercent"
      ) {
        normalizeCurrentNeedsInflationRate(saved, key, normalized, warnings);
        return;
      }

      if (key === "finalExpenseInflationRatePercent") {
        normalizeCurrentNeedsFinalExpenseInflationRate(saved, normalized, warnings);
        return;
      }

      if (!hasOwn(saved, key)) {
        return;
      }

      normalized[key] = normalizeInflationRate(
        saved[key],
        DEFAULT_INFLATION_ASSUMPTIONS[key],
        key,
        warnings
      );
    });

    if (hasOwn(saved, "finalExpenseTargetAge")) {
      normalized.finalExpenseTargetAge = normalizeFinalExpenseTargetAge(
        saved.finalExpenseTargetAge,
        warnings
      );
    } else {
      delete normalized.finalExpenseTargetAge;
    }

    if (typeof saved.source === "string" && saved.source.trim()) {
      normalized.source = saved.source.trim();
    }

    return normalized;
  }

  function addPositiveSetting(options) {
    const settings = options.settings;
    const source = options.source;
    const sourceKey = options.sourceKey;
    const targetKey = options.targetKey;
    const fallback = options.fallback;
    const warningCode = options.warningCode;
    const warningMessage = options.warningMessage;
    const warnings = options.warnings;
    const trace = options.trace;
    const sourcePath = options.sourcePath;

    if (!hasOwn(source, sourceKey)) {
      return;
    }

    const number = toOptionalNumber(source[sourceKey]);
    if (number != null && number > 0) {
      settings[targetKey] = number;
      trace.push(createTrace(
        `${targetKey}-saved`,
        `${targetKey} came from saved Analysis Setup method defaults.`,
        [sourcePath]
      ));
      return;
    }

    settings[targetKey] = fallback;
    warnings.push(createWarning(
      warningCode,
      warningMessage,
      "warning",
      [sourcePath]
    ));
    trace.push(createTrace(
      `${targetKey}-fallback`,
      `${targetKey} fell back to the current method default.`,
      [sourcePath]
    ));
  }

  function addNonNegativeSetting(options) {
    const settings = options.settings;
    const source = options.source;
    const sourceKey = options.sourceKey;
    const targetKey = options.targetKey;
    const warningCode = options.warningCode;
    const warningMessage = options.warningMessage;
    const warnings = options.warnings;
    const trace = options.trace;
    const sourcePath = options.sourcePath;

    if (!hasOwn(source, sourceKey)) {
      return;
    }

    const rawValue = source[sourceKey];
    const normalizedString = String(rawValue == null ? "" : rawValue).trim();
    const normalizedLabel = normalizedString.toLowerCase();
    if (normalizedLabel === "retirement-horizon" || normalizedLabel === "retirementhorizon") {
      trace.push(createTrace(
        `${targetKey}-retirement-horizon`,
        `${targetKey} was left unset so Simple HLV can use the Lens retirement horizon.`,
        [sourcePath]
      ));
      return;
    }

    const number = toOptionalNumber(rawValue);
    if (number != null && number >= 0) {
      settings[targetKey] = number;
      trace.push(createTrace(
        `${targetKey}-saved`,
        `${targetKey} came from saved Analysis Setup method defaults.`,
        [sourcePath]
      ));
      return;
    }

    warnings.push(createWarning(
      warningCode,
      warningMessage,
      "warning",
      [sourcePath]
    ));
    trace.push(createTrace(
      `${targetKey}-fallback`,
      `${targetKey} was left unset so the method can use its built-in fallback.`,
      [sourcePath]
    ));
  }

  function addRoundingIfPresent(settings, analysisSettings, warnings, trace, sourcePath) {
    const source = String(sourcePath || "").split(".").reduce(function (value, segment) {
      return value == null ? undefined : value[segment];
    }, analysisSettings);

    if (!hasOwn(source, "roundingIncrement")) {
      return;
    }

    const roundingIncrement = toOptionalNumber(source.roundingIncrement);
    if (roundingIncrement != null && roundingIncrement > 0) {
      settings.roundingIncrement = roundingIncrement;
      trace.push(createTrace(
        "rounding-increment-saved",
        "roundingIncrement came from saved Analysis Setup settings.",
        [`analysisSettings.${sourcePath}.roundingIncrement`]
      ));
      return;
    }

    warnings.push(createWarning(
      "invalid-rounding-increment",
      "Saved rounding increment was invalid and was ignored.",
      "warning",
      [`analysisSettings.${sourcePath}.roundingIncrement`]
    ));
  }

  function addFutureSettingsTrace(analysisSettings, trace) {
    [
      {
        key: "inflationAssumptions",
        traceKey: "inflationAssumptions-current-needs-and-future-use",
        message: "Saved inflation assumptions are mapped into Needs settings. Household/general inflation can affect current Needs support, education/general inflation can affect current Needs education, healthcare inflation can affect current Needs medical final expense, and final expense inflation can affect current Needs non-medical final expense. Recurring healthcare expense facts remain raw-only."
      },
      {
        key: "growthAndReturnAssumptions",
        traceKey: "growthAndReturnAssumptions-not-applied",
        message: "Saved growth and return assumptions are present but are not applied to current method results."
      },
      {
        key: "assetTreatmentAssumptions",
        traceKey: "assetTreatmentAssumptions-not-applied",
        message: "Saved asset treatment assumptions prepare treated asset offsets for method use."
      },
      {
        key: "healthcareExpenseAssumptions",
        traceKey: "healthcareExpenseAssumptions-activation-readiness",
        message: "Saved healthcare expense assumptions are mapped into Needs settings for future healthcareExpenses activation. Current DIME, Needs, and HLV formulas do not consume them; recurring and non-final healthcare expense facts remain raw-only."
      }
    ].forEach(function (entry) {
      const key = entry.key;
      if (isPlainObject(analysisSettings[key])) {
        trace.push(createTrace(
          entry.traceKey,
          entry.message,
          [`analysisSettings.${key}`]
        ));
      }
    });
  }

  function createDimeSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const methodDefaults = isPlainObject(analysisSettings.methodDefaults) ? analysisSettings.methodDefaults : {};
    const defaults = getDefaultSettings(options.defaults);
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    const trace = Array.isArray(options.trace) ? options.trace : [];
    const valuationDateResult = options.valuationDateResult
      || resolvePlanningValuationDate(analysisSettings, warnings, trace);
    const settings = { ...defaults.dime };

    applyPlanningValuationDateSettings(settings, valuationDateResult);
    applyAssetOffsetSourceSettings(settings, methodDefaults, trace);
    applyExistingCoverageSettings(settings, analysisSettings, trace);

    addPositiveSetting({
      settings,
      source: methodDefaults,
      sourceKey: "dimeIncomeYears",
      targetKey: "dimeIncomeYears",
      fallback: defaults.dime.dimeIncomeYears,
      warningCode: "invalid-dime-income-years",
      warningMessage: "Saved DIME income years was invalid and defaulted to 10.",
      warnings,
      trace,
      sourcePath: "analysisSettings.methodDefaults.dimeIncomeYears"
    });

    addRoundingIfPresent(settings, analysisSettings, warnings, trace, "methodDefaults");

    return settings;
  }

  function createNeedsAnalysisSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const methodDefaults = isPlainObject(analysisSettings.methodDefaults) ? analysisSettings.methodDefaults : {};
    const defaults = getDefaultSettings(options.defaults);
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    const trace = Array.isArray(options.trace) ? options.trace : [];
    const valuationDateResult = options.valuationDateResult
      || resolvePlanningValuationDate(analysisSettings, warnings, trace);
    const settings = { ...defaults.needsAnalysis };

    applyPlanningValuationDateSettings(settings, valuationDateResult);
    applyAssetOffsetSourceSettings(settings, methodDefaults, trace);
    applyExistingCoverageSettings(settings, analysisSettings, trace);
    applyNeedsAssetOffsetInclusionSettings(settings, methodDefaults, warnings, trace);
    settings.inflationAssumptions = createNeedsInflationAssumptions(
      analysisSettings,
      warnings
    );
    settings.educationAssumptions = createNeedsEducationAssumptions(
      analysisSettings,
      warnings
    );
    settings.healthcareExpenseAssumptions = createNeedsHealthcareExpenseAssumptions(
      analysisSettings,
      warnings
    );
    applyEducationValuationDateSettings(settings.educationAssumptions, valuationDateResult);

    if (hasOwn(methodDefaults, "needsSupportDurationYears")) {
      addPositiveSetting({
        settings,
        source: methodDefaults,
        sourceKey: "needsSupportDurationYears",
        targetKey: "needsSupportDurationYears",
        fallback: defaults.needsAnalysis.needsSupportDurationYears,
        warningCode: "invalid-needs-support-duration-years",
        warningMessage: "Saved Needs support duration was invalid and defaulted to 10.",
        warnings,
        trace,
        sourcePath: "analysisSettings.methodDefaults.needsSupportDurationYears"
      });
    } else if (hasOwn(methodDefaults, "needsSupportYears")) {
      warnings.push(createWarning(
        "legacy-needs-support-years-key-used",
        "Saved Analysis Setup used needsSupportYears; mapped it to needsSupportDurationYears for the method layer.",
        "info",
        ["analysisSettings.methodDefaults.needsSupportYears"]
      ));
      addPositiveSetting({
        settings,
        source: methodDefaults,
        sourceKey: "needsSupportYears",
        targetKey: "needsSupportDurationYears",
        fallback: defaults.needsAnalysis.needsSupportDurationYears,
        warningCode: "invalid-needs-support-duration-years",
        warningMessage: "Saved Needs support years was invalid and defaulted to 10.",
        warnings,
        trace,
        sourcePath: "analysisSettings.methodDefaults.needsSupportYears"
      });
    }

    applySurvivorSupportSettings(settings, analysisSettings, warnings, trace);

    addRoundingIfPresent(settings, analysisSettings, warnings, trace, "methodDefaults");

    return settings;
  }

  function createHumanLifeValueSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const methodDefaults = isPlainObject(analysisSettings.methodDefaults) ? analysisSettings.methodDefaults : {};
    const defaults = getDefaultSettings(options.defaults);
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    const trace = Array.isArray(options.trace) ? options.trace : [];
    const valuationDateResult = options.valuationDateResult
      || resolvePlanningValuationDate(analysisSettings, warnings, trace);
    const settings = { ...defaults.humanLifeValue };

    applyPlanningValuationDateSettings(settings, valuationDateResult);
    applyAssetOffsetSourceSettings(settings, methodDefaults, trace);
    applyExistingCoverageSettings(settings, analysisSettings, trace);

    addNonNegativeSetting({
      settings,
      source: methodDefaults,
      sourceKey: "hlvProjectionYears",
      targetKey: "hlvProjectionYears",
      warningCode: "invalid-hlv-projection-years",
      warningMessage: "Saved Human Life Value projection years was invalid and was ignored.",
      warnings,
      trace,
      sourcePath: "analysisSettings.methodDefaults.hlvProjectionYears"
    });

    addRoundingIfPresent(settings, analysisSettings, warnings, trace, "methodDefaults");

    return settings;
  }

  function createAnalysisMethodSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const warnings = [];
    const trace = [];
    const valuationDateResult = resolvePlanningValuationDate(analysisSettings, warnings, trace);
    const sharedOptions = {
      analysisSettings,
      lensModel: options.lensModel,
      profileRecord: options.profileRecord,
      defaults: options.defaults,
      warnings,
      trace,
      valuationDateResult
    };

    const dimeSettings = createDimeSettings(sharedOptions);
    const needsAnalysisSettings = createNeedsAnalysisSettings(sharedOptions);
    const humanLifeValueSettings = createHumanLifeValueSettings(sharedOptions);

    addFutureSettingsTrace(analysisSettings, trace);

    return {
      dimeSettings,
      needsAnalysisSettings,
      humanLifeValueSettings,
      warnings,
      trace
    };
  }

  lensAnalysis.analysisSettingsAdapter = {
    DEFAULT_DIME_SETTINGS,
    DEFAULT_NEEDS_ANALYSIS_SETTINGS,
    DEFAULT_HUMAN_LIFE_VALUE_SETTINGS,
    DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS,
    createAnalysisMethodSettings,
    createDimeSettings,
    createNeedsAnalysisSettings,
    createHumanLifeValueSettings
  };
})(window);
