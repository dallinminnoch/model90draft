(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});
  const ASSET_OFFSET_SOURCE_LEGACY = "legacy";
  const ASSET_OFFSET_SOURCE_TREATED = "treated";
  const DEFAULT_INFLATION_ASSUMPTIONS = Object.freeze({
    enabled: true,
    generalInflationRatePercent: 3,
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: 3,
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
    assetOffsetSource: ASSET_OFFSET_SOURCE_LEGACY,
    fallbackToLegacyOffsetAssets: true
  });

  const DEFAULT_NEEDS_ANALYSIS_SETTINGS = Object.freeze({
    needsSupportDurationYears: 10,
    includeExistingCoverageOffset: true,
    includeOffsetAssets: true,
    assetOffsetSource: ASSET_OFFSET_SOURCE_LEGACY,
    fallbackToLegacyOffsetAssets: true,
    includeTransitionNeeds: true,
    includeDiscretionarySupport: false,
    includeSurvivorIncomeOffset: true
  });

  const DEFAULT_HUMAN_LIFE_VALUE_SETTINGS = Object.freeze({
    includeExistingCoverageOffset: true,
    includeOffsetAssets: false,
    assetOffsetSource: ASSET_OFFSET_SOURCE_LEGACY,
    fallbackToLegacyOffsetAssets: true
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

  function normalizeAssetOffsetSource(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (normalizedValue === ASSET_OFFSET_SOURCE_TREATED) {
      return ASSET_OFFSET_SOURCE_TREATED;
    }
    if (normalizedValue === ASSET_OFFSET_SOURCE_LEGACY) {
      return ASSET_OFFSET_SOURCE_LEGACY;
    }
    return fallback || ASSET_OFFSET_SOURCE_LEGACY;
  }

  function applyAssetOffsetSourceSettings(settings, methodDefaults, defaults, warnings, trace) {
    const savedSource = hasOwn(methodDefaults, "assetOffsetSource")
      ? normalizeAssetOffsetSource(methodDefaults.assetOffsetSource, defaults.assetOffsetSource)
      : defaults.assetOffsetSource;

    settings.assetOffsetSource = savedSource;
    settings.fallbackToLegacyOffsetAssets = typeof methodDefaults.fallbackToLegacyOffsetAssets === "boolean"
      ? methodDefaults.fallbackToLegacyOffsetAssets
      : defaults.fallbackToLegacyOffsetAssets;

    if (hasOwn(methodDefaults, "assetOffsetSource")) {
      trace.push(createTrace(
        "assetOffsetSource-saved",
        "assetOffsetSource came from saved Analysis Setup method defaults.",
        ["analysisSettings.methodDefaults.assetOffsetSource"]
      ));
    }

    if (
      hasOwn(methodDefaults, "assetOffsetSource")
      && String(methodDefaults.assetOffsetSource || "").trim().toLowerCase() !== savedSource
    ) {
      warnings.push(createWarning(
        "invalid-asset-offset-source",
        "Saved asset offset source was invalid and defaulted to legacy.",
        "warning",
        ["analysisSettings.methodDefaults.assetOffsetSource"]
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
      ["inflationAssumptions", "Saved inflation assumptions are mapped into Needs settings but are not applied to current method results."],
      ["growthAndReturnAssumptions", "Saved growth and return assumptions are present but are not applied to current method results."],
      ["assetTreatmentAssumptions", "Saved asset treatment assumptions apply through treated asset offsets; legacy offsetAssets remains a compatibility path."]
    ].forEach(function (entry) {
      const key = entry[0];
      if (isPlainObject(analysisSettings[key])) {
        trace.push(createTrace(
          `${key}-not-applied`,
          entry[1],
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
    const settings = { ...defaults.dime };

    applyAssetOffsetSourceSettings(settings, methodDefaults, defaults.dime, warnings, trace);
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
    addRoundingIfPresent(settings, analysisSettings, warnings, trace, "recommendationGuardrails");

    return settings;
  }

  function createNeedsAnalysisSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const methodDefaults = isPlainObject(analysisSettings.methodDefaults) ? analysisSettings.methodDefaults : {};
    const defaults = getDefaultSettings(options.defaults);
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    const trace = Array.isArray(options.trace) ? options.trace : [];
    const settings = { ...defaults.needsAnalysis };

    applyAssetOffsetSourceSettings(settings, methodDefaults, defaults.needsAnalysis, warnings, trace);
    applyExistingCoverageSettings(settings, analysisSettings, trace);
    applyNeedsAssetOffsetInclusionSettings(settings, methodDefaults, warnings, trace);
    settings.inflationAssumptions = createNeedsInflationAssumptions(
      analysisSettings,
      warnings
    );

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
    addRoundingIfPresent(settings, analysisSettings, warnings, trace, "recommendationGuardrails");

    return settings;
  }

  function createHumanLifeValueSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const methodDefaults = isPlainObject(analysisSettings.methodDefaults) ? analysisSettings.methodDefaults : {};
    const defaults = getDefaultSettings(options.defaults);
    const warnings = Array.isArray(options.warnings) ? options.warnings : [];
    const trace = Array.isArray(options.trace) ? options.trace : [];
    const settings = { ...defaults.humanLifeValue };

    applyAssetOffsetSourceSettings(settings, methodDefaults, defaults.humanLifeValue, warnings, trace);
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
    addRoundingIfPresent(settings, analysisSettings, warnings, trace, "recommendationGuardrails");

    return settings;
  }

  function createAnalysisMethodSettings(input) {
    const options = isPlainObject(input) ? input : {};
    const analysisSettings = isPlainObject(options.analysisSettings) ? options.analysisSettings : {};
    const warnings = [];
    const trace = [];
    const sharedOptions = {
      analysisSettings,
      lensModel: options.lensModel,
      profileRecord: options.profileRecord,
      defaults: options.defaults,
      warnings,
      trace
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
    createAnalysisMethodSettings,
    createDimeSettings,
    createNeedsAnalysisSettings,
    createHumanLifeValueSettings
  };
})(window);
