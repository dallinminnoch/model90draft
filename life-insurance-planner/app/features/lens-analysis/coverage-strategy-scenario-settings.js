// Coverage Strategy scenario settings owner.
// Future home after folder reorganization:
// app/features/lens-analysis/coverage-strategy/scenario-settings.js
// Backend-ready pure settings resolver: accepts explicit saved/runtime payloads and returns serializable scenario settings.
// Owns Coverage Strategy graph scenario settings only; does not own global Analysis Setup assumptions, storage, DOM, or display rendering.
(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  const COVERAGE_STRATEGY_SCENARIO_SETTINGS_VERSION = "coverage-strategy-scenario-settings-v1";
  const SCENARIO_SETTINGS_SCHEMA_VERSION = 1;

  const DEFAULT_EDUCATION_SETTINGS = Object.freeze({
    educationTreatmentMode: "planAsUnfundedNeed",
    educationPaymentScheduleMode: "fourYearAnnual",
    useEducationSavingsOffset: false,
    educationResourceSpendingMode: "off",
    projectedDependentTimingMode: "untimedKeepThroughHorizon",
    projectedDependentTimingRows: []
  });

  const ALLOWED_EDUCATION_TREATMENT_MODES = Object.freeze([
    "planAsUnfundedNeed",
    "useEducationSavingsOnly",
    "assumePaidWhenDue",
    "useSavingsThenEligibleResources"
  ]);
  const ALLOWED_PAYMENT_SCHEDULE_MODES = Object.freeze([
    "fourYearAnnual",
    "lumpSumAtStart",
    "custom"
  ]);
  const ALLOWED_RESOURCE_SPENDING_MODES = Object.freeze([
    "off",
    "educationSpendWaterfall"
  ]);
  const ALLOWED_PROJECTED_DEPENDENT_TIMING_MODES = Object.freeze([
    "untimedKeepThroughHorizon",
    "expectedBirthYear",
    "excludeUntilProfiled"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(Object(source), key);
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function getPath(source, path) {
    const parts = normalizeString(path).split(".").filter(Boolean);
    let current = source;
    for (let index = 0; index < parts.length; index += 1) {
      if (!isPlainObject(current) && !Array.isArray(current)) {
        return undefined;
      }
      current = current[parts[index]];
    }
    return current;
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "on", "1"].includes(normalized)) {
        return true;
      }
      if (["false", "no", "off", "0"].includes(normalized)) {
        return false;
      }
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
    return null;
  }

  function normalizeMode(value, allowedModes, fallback) {
    const normalized = normalizeString(value);
    return allowedModes.includes(normalized) ? normalized : fallback;
  }

  function normalizeExpectedBirthYear(value) {
    const rawValue = normalizeString(value);
    if (!rawValue) {
      return {
        rawExpectedBirthYear: "",
        expectedBirthYear: null,
        validationStatus: "untimed",
        validationCode: null
      };
    }
    if (!/^\d{4}$/.test(rawValue)) {
      return {
        rawExpectedBirthYear: rawValue,
        expectedBirthYear: null,
        validationStatus: "invalid",
        validationCode: "projected-dependent-birth-year-invalid"
      };
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 1900 || parsed > 2200) {
      return {
        rawExpectedBirthYear: rawValue,
        expectedBirthYear: null,
        validationStatus: "invalid",
        validationCode: "projected-dependent-birth-year-invalid"
      };
    }
    return {
      rawExpectedBirthYear: rawValue,
      expectedBirthYear: parsed,
      validationStatus: "valid",
      validationCode: null
    };
  }

  function normalizeProjectedDependentTimingRows(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(function (row, index) {
      const safeRow = isPlainObject(row) ? row : {};
      const birthYearResult = normalizeExpectedBirthYear(
        safeRow.rawExpectedBirthYear
        ?? safeRow.expectedBirthYear
        ?? safeRow.birthYear
      );
      const resolvedTimingMode = birthYearResult.expectedBirthYear != null
        ? "expectedBirthYear"
        : normalizeMode(
            safeRow.timingMode,
            ALLOWED_PROJECTED_DEPENDENT_TIMING_MODES,
            DEFAULT_EDUCATION_SETTINGS.projectedDependentTimingMode
          );
      return {
        id: normalizeString(safeRow.id) || `projected-dependent-${index + 1}`,
        label: normalizeString(safeRow.label) || `Projected dependent ${index + 1}`,
        included: normalizeBoolean(safeRow.included) !== false,
        timingMode: resolvedTimingMode,
        expectedBirthYear: birthYearResult.expectedBirthYear,
        rawExpectedBirthYear: birthYearResult.rawExpectedBirthYear,
        validationStatus: birthYearResult.validationStatus,
        validationCode: birthYearResult.validationCode,
        educationFundingAmount: safeRow.educationFundingAmount ?? null
      };
    });
  }

  function candidate(label, path, value, kind) {
    return {
      label,
      path,
      value,
      kind: kind || "scenario"
    };
  }

  function buildCandidates(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const profileRecord = isPlainObject(safeInput.profileRecord) ? safeInput.profileRecord : {};
    const analysisSettings = isPlainObject(safeInput.analysisSettings) ? safeInput.analysisSettings : {};
    const candidates = [];

    if (isPlainObject(safeInput.runtimeScenarioSettings)) {
      candidates.push(candidate(
        "runtimeScenarioSettings",
        "runtimeScenarioSettings",
        safeInput.runtimeScenarioSettings,
        "runtime"
      ));
    }
    if (isPlainObject(safeInput.savedScenarioSettings)) {
      candidates.push(candidate(
        "savedScenarioSettings",
        "savedScenarioSettings",
        safeInput.savedScenarioSettings,
        "saved"
      ));
    }
    if (isPlainObject(profileRecord.coverageStrategyScenarioSettings)) {
      candidates.push(candidate(
        "profileRecord.coverageStrategyScenarioSettings",
        "profileRecord.coverageStrategyScenarioSettings",
        profileRecord.coverageStrategyScenarioSettings,
        "saved"
      ));
    }
    if (isPlainObject(profileRecord.analysisSettings?.coverageStrategyScenarioSettings)) {
      candidates.push(candidate(
        "profileRecord.analysisSettings.coverageStrategyScenarioSettings",
        "profileRecord.analysisSettings.coverageStrategyScenarioSettings",
        profileRecord.analysisSettings.coverageStrategyScenarioSettings,
        "saved"
      ));
    }
    if (isPlainObject(analysisSettings.coverageStrategyScenarioSettings)) {
      candidates.push(candidate(
        "analysisSettings.coverageStrategyScenarioSettings",
        "analysisSettings.coverageStrategyScenarioSettings",
        analysisSettings.coverageStrategyScenarioSettings,
        "saved"
      ));
    }

    return candidates;
  }

  function buildLegacyCandidates(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const profileRecord = isPlainObject(safeInput.profileRecord) ? safeInput.profileRecord : {};
    const analysisSettings = isPlainObject(safeInput.analysisSettings) ? safeInput.analysisSettings : {};
    const candidates = [];
    [
      {
        source: analysisSettings,
        prefix: "analysisSettings"
      },
      {
        source: profileRecord.analysisSettings,
        prefix: "profileRecord.analysisSettings"
      }
    ].forEach(function (entry) {
      if (!isPlainObject(entry.source)) {
        return;
      }
      [
        "educationAssumptions.useExistingEducationSavingsOffset",
        "educationAssumptions.fundingTreatment.useExistingEducationSavingsOffset"
      ].forEach(function (path) {
        const value = getPath(entry.source, path);
        if (value !== undefined) {
          candidates.push(candidate(
            `${entry.prefix}.${path}`,
            `${entry.prefix}.${path}`,
            value,
            "legacy"
          ));
        }
      });
    });
    return candidates;
  }

  function findScenarioValue(candidates, path) {
    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      const value = getPath(item.value, path);
      if (value !== undefined) {
        return {
          value,
          sourcePath: `${item.path}.${path}`,
          sourceLabel: item.label,
          kind: item.kind
        };
      }
    }
    return null;
  }

  function resolveModeField(candidates, path, allowedModes, fallback, defaultPath, fieldSources) {
    const match = findScenarioValue(candidates, path);
    if (match) {
      fieldSources[path] = match.sourcePath;
      return normalizeMode(match.value, allowedModes, fallback);
    }
    fieldSources[path] = defaultPath;
    return fallback;
  }

  function resolveBooleanField(candidates, path, fallback, defaultPath, fieldSources) {
    const match = findScenarioValue(candidates, path);
    if (match) {
      const normalized = normalizeBoolean(match.value);
      fieldSources[path] = match.sourcePath;
      return normalized == null ? fallback : normalized;
    }
    fieldSources[path] = defaultPath;
    return fallback;
  }

  function resolveEducationSavingsOffset(candidates, legacyCandidates, fieldSources, legacyMappings) {
    const scenarioMatch = findScenarioValue(candidates, "education.useEducationSavingsOffset");
    if (scenarioMatch) {
      const normalized = normalizeBoolean(scenarioMatch.value);
      fieldSources["education.useEducationSavingsOffset"] = scenarioMatch.sourcePath;
      return normalized == null ? DEFAULT_EDUCATION_SETTINGS.useEducationSavingsOffset : normalized;
    }

    const legacyMatch = legacyCandidates.find(function (item) {
      return normalizeBoolean(item.value) != null;
    });
    if (legacyMatch) {
      legacyMappings.push({
        code: "education-savings-offset-legacy-analysis-setting-mapped",
        from: legacyMatch.path,
        to: "coverageStrategyScenarioSettings.education.useEducationSavingsOffset"
      });
      fieldSources["education.useEducationSavingsOffset"] = legacyMatch.path;
      return normalizeBoolean(legacyMatch.value);
    }

    fieldSources["education.useEducationSavingsOffset"] =
      "coverage-strategy-defaults.education.useEducationSavingsOffset";
    return DEFAULT_EDUCATION_SETTINGS.useEducationSavingsOffset;
  }

  function resolveCoverageStrategyScenarioSettings(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const candidates = buildCandidates(safeInput);
    const legacyCandidates = buildLegacyCandidates(safeInput);
    const fieldSources = {};
    const legacyMappings = [];

    const education = {
      educationTreatmentMode: resolveModeField(
        candidates,
        "education.educationTreatmentMode",
        ALLOWED_EDUCATION_TREATMENT_MODES,
        DEFAULT_EDUCATION_SETTINGS.educationTreatmentMode,
        "coverage-strategy-defaults.education.educationTreatmentMode",
        fieldSources
      ),
      educationPaymentScheduleMode: resolveModeField(
        candidates,
        "education.educationPaymentScheduleMode",
        ALLOWED_PAYMENT_SCHEDULE_MODES,
        DEFAULT_EDUCATION_SETTINGS.educationPaymentScheduleMode,
        "coverage-strategy-defaults.education.educationPaymentScheduleMode",
        fieldSources
      ),
      useEducationSavingsOffset: resolveEducationSavingsOffset(
        candidates,
        legacyCandidates,
        fieldSources,
        legacyMappings
      ),
      educationResourceSpendingMode: resolveModeField(
        candidates,
        "education.educationResourceSpendingMode",
        ALLOWED_RESOURCE_SPENDING_MODES,
        DEFAULT_EDUCATION_SETTINGS.educationResourceSpendingMode,
        "coverage-strategy-defaults.education.educationResourceSpendingMode",
        fieldSources
      ),
      projectedDependentTimingMode: resolveModeField(
        candidates,
        "education.projectedDependentTimingMode",
        ALLOWED_PROJECTED_DEPENDENT_TIMING_MODES,
        DEFAULT_EDUCATION_SETTINGS.projectedDependentTimingMode,
        "coverage-strategy-defaults.education.projectedDependentTimingMode",
        fieldSources
      ),
      projectedDependentTimingRows: normalizeProjectedDependentTimingRows(
        findScenarioValue(candidates, "education.projectedDependentTimingRows")?.value
      )
    };
    fieldSources["education.projectedDependentTimingRows"] =
      findScenarioValue(candidates, "education.projectedDependentTimingRows")?.sourcePath
      || "coverage-strategy-defaults.education.projectedDependentTimingRows";

    const selectedSource = candidates.length
      ? candidates[0].label
      : (legacyMappings.length ? "legacy-analysis-settings" : "coverage-strategy-defaults");
    const persisted = candidates.some(function (item) {
      return item.kind === "saved";
    });

    return {
      version: SCENARIO_SETTINGS_SCHEMA_VERSION,
      source: selectedSource,
      persisted,
      persistenceStatus: persisted ? "saved-scenario-settings-resolved" : "runtime-default-resolved",
      visibleControlsAdded: false,
      controlsVisible: false,
      education,
      warnings: [],
      dataGaps: [],
      trace: {
        source: "coverage-strategy-scenario-settings",
        resolverVersion: COVERAGE_STRATEGY_SCENARIO_SETTINGS_VERSION,
        sourcePrecedence: [
          "runtimeScenarioSettings",
          "savedScenarioSettings",
          "profileRecord.coverageStrategyScenarioSettings",
          "profileRecord.analysisSettings.coverageStrategyScenarioSettings",
          "analysisSettings.coverageStrategyScenarioSettings",
          "legacy analysisSettings.educationAssumptions.useExistingEducationSavingsOffset",
          "coverage-strategy-defaults"
        ],
        selectedSource,
        fieldSources,
        legacyMappings,
        visibleControlsAdded: false,
        storageRead: false,
        storageWritten: false,
        inputMutated: false
      }
    };
  }

  lensAnalysis.COVERAGE_STRATEGY_SCENARIO_SETTINGS_VERSION =
    COVERAGE_STRATEGY_SCENARIO_SETTINGS_VERSION;
  lensAnalysis.resolveCoverageStrategyScenarioSettings = resolveCoverageStrategyScenarioSettings;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      COVERAGE_STRATEGY_SCENARIO_SETTINGS_VERSION,
      resolveCoverageStrategyScenarioSettings
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
