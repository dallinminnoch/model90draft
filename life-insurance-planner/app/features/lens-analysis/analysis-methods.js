(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis pure analysis method layer.
  // Purpose: consume a normalized Lens model and return traceable method
  // results. Keep formulas out of PMI pages so they can later move behind an
  // API without changing the page layer.
  // Non-goals: no DOM, no storage, no Lens model building, no recommendation
  // mutation, no coverage placement, and no HLV calculation in this pass.

  const DEFAULT_DIME_INCOME_YEARS = 10;
  const DEFAULT_NEEDS_SUPPORT_DURATION_YEARS = 10;
  const ASSET_OFFSET_SOURCE_TREATED = "treated";
  const ASSET_OFFSET_SOURCE_DISABLED = "disabled";
  const ASSET_OFFSET_SOURCE_ZERO = "zero";
  const TREATED_ASSET_OFFSET_SOURCE_PATH = "treatedAssetOffsets.totalTreatedAssetValue";
  const EXISTING_COVERAGE_OFFSET_SOURCE_PATH = "existingCoverage.totalExistingCoverage";
  const TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH = "treatedExistingCoverageOffset.totalTreatedCoverageOffset";
  const TREATED_EXISTING_COVERAGE_METHOD_CONSUMPTION_SOURCE_PATH = "treatedExistingCoverageOffset.metadata.consumedByMethods";

  const DIME_NON_MORTGAGE_DEBT_FIELDS = Object.freeze([
    Object.freeze({
      key: "otherRealEstateLoanBalance",
      sourcePath: "debtPayoff.otherRealEstateLoanBalance",
      label: "Other real estate loans"
    }),
    Object.freeze({
      key: "autoLoanBalance",
      sourcePath: "debtPayoff.autoLoanBalance",
      label: "Auto loans"
    }),
    Object.freeze({
      key: "creditCardBalance",
      sourcePath: "debtPayoff.creditCardBalance",
      label: "Credit card debt"
    }),
    Object.freeze({
      key: "studentLoanBalance",
      sourcePath: "debtPayoff.studentLoanBalance",
      label: "Student loans"
    }),
    Object.freeze({
      key: "personalLoanBalance",
      sourcePath: "debtPayoff.personalLoanBalance",
      label: "Personal loans"
    }),
    Object.freeze({
      key: "outstandingTaxLiabilities",
      sourcePath: "debtPayoff.outstandingTaxLiabilities",
      label: "Outstanding tax liabilities"
    }),
    Object.freeze({
      key: "businessDebtBalance",
      sourcePath: "debtPayoff.businessDebtBalance",
      label: "Business debt"
    }),
    Object.freeze({
      key: "otherDebtPayoffNeeds",
      sourcePath: "debtPayoff.otherDebtPayoffNeeds",
      label: "Other debt payoff needs"
    })
  ]);

  const NEEDS_DEBT_PAYOFF_FALLBACK_FIELDS = Object.freeze([
    Object.freeze({
      key: "mortgageBalance",
      sourcePath: "debtPayoff.mortgageBalance",
      label: "Mortgage balance"
    }),
    Object.freeze({
      key: "otherRealEstateLoanBalance",
      sourcePath: "debtPayoff.otherRealEstateLoanBalance",
      label: "Other real estate loans"
    }),
    Object.freeze({
      key: "autoLoanBalance",
      sourcePath: "debtPayoff.autoLoanBalance",
      label: "Auto loans"
    }),
    Object.freeze({
      key: "creditCardBalance",
      sourcePath: "debtPayoff.creditCardBalance",
      label: "Credit card debt"
    }),
    Object.freeze({
      key: "studentLoanBalance",
      sourcePath: "debtPayoff.studentLoanBalance",
      label: "Student loans"
    }),
    Object.freeze({
      key: "personalLoanBalance",
      sourcePath: "debtPayoff.personalLoanBalance",
      label: "Personal loans"
    }),
    Object.freeze({
      key: "outstandingTaxLiabilities",
      sourcePath: "debtPayoff.outstandingTaxLiabilities",
      label: "Outstanding tax liabilities"
    }),
    Object.freeze({
      key: "businessDebtBalance",
      sourcePath: "debtPayoff.businessDebtBalance",
      label: "Business debt"
    }),
    Object.freeze({
      key: "otherDebtPayoffNeeds",
      sourcePath: "debtPayoff.otherDebtPayoffNeeds",
      label: "Other debt payoff needs"
    })
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function getPath(source, path) {
    if (!isPlainObject(source) || !path) {
      return undefined;
    }

    return String(path).split(".").reduce(function (value, segment) {
      return value == null ? undefined : value[segment];
    }, source);
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value)
      .replace(/,/g, "")
      .replace(/[^0-9.-]/g, "")
      .trim();

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function createWarning(code, message, severity, sourcePaths) {
    return {
      code,
      message,
      severity: severity || "info",
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths : []
    };
  }

  function addWarning(warnings, code, message, severity, sourcePaths) {
    warnings.push(createWarning(code, message, severity, sourcePaths));
  }

  function createTraceRow(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    return {
      key: normalizedOptions.key,
      label: normalizedOptions.label,
      formula: normalizedOptions.formula,
      inputs: normalizedOptions.inputs || {},
      value: normalizedOptions.value,
      sourcePaths: Array.isArray(normalizedOptions.sourcePaths) ? normalizedOptions.sourcePaths : []
    };
  }

  function normalizeNonNegativeNumber(value, sourcePath, warnings, warningContext) {
    const numericValue = toOptionalNumber(value);
    if (numericValue == null) {
      return {
        value: null,
        hasValue: false
      };
    }

    if (numericValue < 0) {
      addWarning(
        warnings,
        warningContext.negativeCode,
        warningContext.negativeMessage,
        "warning",
        [sourcePath]
      );
      return {
        value: 0,
        hasValue: true
      };
    }

    return {
      value: numericValue,
      hasValue: true
    };
  }

  function normalizeComponentNumber(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const warnings = normalizedOptions.warnings;
    const normalized = normalizeNonNegativeNumber(
      normalizedOptions.value,
      normalizedOptions.sourcePath,
      warnings,
      {
        negativeCode: normalizedOptions.negativeCode,
        negativeMessage: normalizedOptions.negativeMessage
      }
    );

    if (!normalized.hasValue && normalizedOptions.warnWhenMissing === true) {
      addWarning(
        warnings,
        normalizedOptions.missingCode,
        normalizedOptions.missingMessage,
        normalizedOptions.missingSeverity || "info",
        [normalizedOptions.sourcePath]
      );
    }

    return normalized.value == null ? 0 : normalized.value;
  }

  function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source || {}, key);
  }

  function createDebtComponent(lensModel, warnings) {
    const debtPayoff = isPlainObject(lensModel?.debtPayoff) ? lensModel.debtPayoff : {};
    let hasAnyExplicitDebtValue = false;
    let total = 0;
    const inputs = {};

    DIME_NON_MORTGAGE_DEBT_FIELDS.forEach(function (field) {
      const rawValue = debtPayoff[field.key];
      const normalized = normalizeNonNegativeNumber(rawValue, field.sourcePath, warnings, {
        negativeCode: "negative-debt-component",
        negativeMessage: field.label + " was negative and was treated as 0 for DIME."
      });

      inputs[field.key] = normalized.value;

      if (!normalized.hasValue) {
        return;
      }

      hasAnyExplicitDebtValue = true;
      total += normalized.value;
    });

    if (hasAnyExplicitDebtValue) {
      return {
        value: total,
        source: "explicit-non-mortgage-debt-fields",
        inputs,
        sourcePaths: DIME_NON_MORTGAGE_DEBT_FIELDS.map(function (field) {
          return field.sourcePath;
        })
      };
    }

    const fallbackTotal = toOptionalNumber(debtPayoff.totalDebtPayoffNeed);
    if (fallbackTotal != null) {
      const mortgage = Math.max(0, toOptionalNumber(debtPayoff.mortgageBalance) || 0);
      const normalizedFallbackTotal = Math.max(0, fallbackTotal);
      if (fallbackTotal < 0) {
        addWarning(
          warnings,
          "negative-debt-component",
          "totalDebtPayoffNeed was negative and was treated as 0 for DIME.",
          "warning",
          ["debtPayoff.totalDebtPayoffNeed"]
        );
      }
      const safeFallbackDebt = Math.max(0, normalizedFallbackTotal - mortgage);

      addWarning(
        warnings,
        "debt-component-fallback-used",
        "DIME debt used totalDebtPayoffNeed as a fallback because individual non-mortgage debt fields were missing.",
        "warning",
        ["debtPayoff.totalDebtPayoffNeed", "debtPayoff.mortgageBalance"]
      );

      if (mortgage > 0) {
        addWarning(
          warnings,
          "possible-mortgage-double-count-prevented",
          "Mortgage balance was subtracted from the fallback debt total so DIME mortgage is not double counted.",
          "info",
          ["debtPayoff.totalDebtPayoffNeed", "debtPayoff.mortgageBalance"]
        );
      }

      return {
        value: normalizeComponentNumber({
          value: safeFallbackDebt,
          sourcePath: "debtPayoff.totalDebtPayoffNeed",
          warnings,
          negativeCode: "negative-debt-component",
          negativeMessage: "Fallback debt component was negative and was treated as 0 for DIME."
        }),
        source: mortgage > 0 ? "total-debt-payoff-minus-mortgage-fallback" : "total-debt-payoff-fallback",
        inputs: {
          totalDebtPayoffNeed: normalizedFallbackTotal,
          mortgageBalance: mortgage
        },
        sourcePaths: ["debtPayoff.totalDebtPayoffNeed", "debtPayoff.mortgageBalance"]
      };
    }

    addWarning(
      warnings,
      "missing-non-mortgage-debt-fields",
      "No non-mortgage debt fields were available; DIME debt component defaulted to 0.",
      "info",
      DIME_NON_MORTGAGE_DEBT_FIELDS.map(function (field) {
        return field.sourcePath;
      })
    );

    return {
      value: 0,
      source: "missing-default-zero",
      inputs,
      sourcePaths: DIME_NON_MORTGAGE_DEBT_FIELDS.map(function (field) {
        return field.sourcePath;
      })
    };
  }

  function getDimeIncomeYears(settings, warnings) {
    if (!hasOwn(settings, "dimeIncomeYears")) {
      return DEFAULT_DIME_INCOME_YEARS;
    }

    const years = toOptionalNumber(settings.dimeIncomeYears);
    if (years == null || years <= 0) {
      addWarning(
        warnings,
        "invalid-dime-income-years",
        "Invalid DIME income years setting; defaulted to 10 years.",
        "warning",
        ["settings.dimeIncomeYears"]
      );
      return DEFAULT_DIME_INCOME_YEARS;
    }

    return years;
  }

  function getBooleanSetting(settings, settingName, defaultValue) {
    return hasOwn(settings, settingName) ? settings[settingName] !== false : defaultValue;
  }

  function hasNumericAssetOffset(value) {
    return toOptionalNumber(value) != null;
  }

  function toTraceNumberOrNull(value) {
    const numericValue = toOptionalNumber(value);
    return numericValue == null ? null : numericValue;
  }

  function getTreatedExistingCoverageUnavailableReason(treatedCoverageOffset) {
    if (!isPlainObject(treatedCoverageOffset)) {
      return "missing-treated-existing-coverage-offset";
    }

    const metadata = isPlainObject(treatedCoverageOffset.metadata)
      ? treatedCoverageOffset.metadata
      : {};
    const metadataReason = String(metadata.reason || "").trim();
    if (metadataReason) {
      return metadataReason;
    }

    return "missing-treated-existing-coverage-total";
  }

  function createExistingCoverageOffsetTraceInputs(model, selection) {
    const treatedCoverageOffset = getPath(model, "treatedExistingCoverageOffset");
    const treatedCoverageOffsetMetadata = isPlainObject(treatedCoverageOffset?.metadata)
      ? treatedCoverageOffset.metadata
      : {};
    const treatedCoverageOffsetTotal = getPath(model, TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH);
    const treatedCoverageOffsetAvailable = isPlainObject(treatedCoverageOffset)
      && toTraceNumberOrNull(treatedCoverageOffsetTotal) != null;
    const treatedWarnings = Array.isArray(treatedCoverageOffset?.warnings)
      ? treatedCoverageOffset.warnings
      : [];
    const selected = isPlainObject(selection) ? selection : {};
    const fallbackReason = selected.fallbackReason || null;
    const fallbackNote = fallbackReason
      ? "Treated existing coverage unavailable; raw linked coverage used as fallback."
      : null;

    return {
      includeExistingCoverageOffset: selected.includeExistingCoverageOffset === true,
      rawExistingCoverageTotal: toTraceNumberOrNull(getPath(model, EXISTING_COVERAGE_OFFSET_SOURCE_PATH)),
      rawExistingCoverageOffsetUsed: selected.sourcePath === EXISTING_COVERAGE_OFFSET_SOURCE_PATH
        ? selected.value
        : null,
      methodUsedExistingCoverageOffset: selected.value,
      methodOffsetSourcePath: selected.sourcePath,
      existingCoverageOffsetStatus: selected.status || null,
      existingCoverageOffsetFallbackUsed: selected.fallbackUsed === true,
      existingCoverageOffsetFallbackReason: fallbackReason,
      existingCoverageOffsetFallbackNote: fallbackNote,
      treatedExistingCoverageOffsetAvailable: treatedCoverageOffsetAvailable,
      treatedExistingCoverageTotal: treatedCoverageOffsetAvailable
        ? toTraceNumberOrNull(treatedCoverageOffsetTotal)
        : null,
      treatedExistingCoverageConsumedByMethods: selected.sourcePath === TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
      treatedExistingCoverageMetadataConsumedByMethods: treatedCoverageOffsetMetadata.consumedByMethods === true,
      treatedExistingCoveragePreparedNotUsed: treatedCoverageOffsetAvailable
        && selected.sourcePath !== TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
      treatedExistingCoveragePolicyCount: toTraceNumberOrNull(getPath(model, "treatedExistingCoverageOffset.policyCount")),
      treatedExistingCoverageIncludedPolicyCount: toTraceNumberOrNull(getPath(model, "treatedExistingCoverageOffset.includedPolicyCount")),
      treatedExistingCoverageExcludedPolicyCount: toTraceNumberOrNull(getPath(model, "treatedExistingCoverageOffset.excludedPolicyCount")),
      treatedExistingCoverageWarningCount: treatedWarnings.length,
      treatedExistingCoverageUnavailableReason: treatedCoverageOffsetAvailable
        ? null
        : getTreatedExistingCoverageUnavailableReason(treatedCoverageOffset),
      treatedExistingCoverageTraceNote: selected.sourcePath === TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH
        ? "treatedExistingCoverageOffset method-used"
        : fallbackNote
    };
  }

  function resolveExistingCoverageOffsetSelection(options) {
    const normalizedOptions = isPlainObject(options) ? options : {};
    const model = isPlainObject(normalizedOptions.model) ? normalizedOptions.model : {};
    const warnings = Array.isArray(normalizedOptions.warnings) ? normalizedOptions.warnings : [];
    const includeExistingCoverageOffset = normalizedOptions.includeExistingCoverageOffset === true;
    const methodLabel = normalizedOptions.methodLabel || "analysis";
    const treatedCoverageOffset = getPath(model, "treatedExistingCoverageOffset");
    const treatedRawValue = getPath(model, TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH);
    const treatedCoverageOffsetAvailable = isPlainObject(treatedCoverageOffset)
      && toOptionalNumber(treatedRawValue) != null;

    if (!includeExistingCoverageOffset) {
      return {
        value: 0,
        formula: "disabled by settings",
        sourcePath: null,
        sourcePaths: ["settings.includeExistingCoverageOffset"],
        includeExistingCoverageOffset,
        status: "excluded",
        fallbackUsed: false,
        fallbackReason: null
      };
    }

    if (treatedCoverageOffsetAvailable) {
      const value = normalizeComponentNumber({
        value: treatedRawValue,
        sourcePath: TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        warnings,
        warnWhenMissing: true,
        missingCode: "treated-existing-coverage-missing",
        missingMessage: "treatedExistingCoverageOffset.totalTreatedCoverageOffset was missing; existing coverage offset defaulted to 0.",
        missingSeverity: "info",
        negativeCode: "negative-treated-existing-coverage",
        negativeMessage: `treatedExistingCoverageOffset.totalTreatedCoverageOffset was negative and was treated as 0 for ${methodLabel}.`
      });

      return {
        value,
        formula: TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        sourcePath: TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        sourcePaths: [
          TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
          TREATED_EXISTING_COVERAGE_METHOD_CONSUMPTION_SOURCE_PATH,
          "settings.includeExistingCoverageOffset"
        ],
        includeExistingCoverageOffset,
        status: value === 0 ? "treated-zero" : "treated-used",
        fallbackUsed: false,
        fallbackReason: null
      };
    }

    const fallbackReason = getTreatedExistingCoverageUnavailableReason(treatedCoverageOffset);
    addWarning(
      warnings,
      "treated-existing-coverage-unavailable-raw-fallback",
      `treatedExistingCoverageOffset.totalTreatedCoverageOffset was unavailable for ${methodLabel}; raw linked coverage was used as the existing coverage offset.`,
      "warning",
      [
        TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        "settings.includeExistingCoverageOffset"
      ]
    );

    const value = normalizeComponentNumber({
      value: getPath(model, EXISTING_COVERAGE_OFFSET_SOURCE_PATH),
      sourcePath: EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
      warnings,
      warnWhenMissing: true,
      missingCode: normalizedOptions.rawMissingCode || "existing-coverage-missing",
      missingMessage: normalizedOptions.rawMissingMessage || "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
      missingSeverity: "info",
      negativeCode: normalizedOptions.rawNegativeCode || "negative-existing-coverage",
      negativeMessage: normalizedOptions.rawNegativeMessage || `totalExistingCoverage was negative and was treated as 0 for ${methodLabel}.`
    });

    return {
      value,
      formula: EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
      sourcePath: EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
      sourcePaths: [
        EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        "settings.includeExistingCoverageOffset"
      ],
      includeExistingCoverageOffset,
      status: "raw-fallback",
      fallbackUsed: true,
      fallbackReason
    };
  }

  function createAssetOffsetSelectionResult(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const includeOffsetAssets = normalizedOptions.includeOffsetAssets === true;
    const effectiveAssetOffsetSource = normalizedOptions.effectiveAssetOffsetSource || ASSET_OFFSET_SOURCE_ZERO;
    const sourcePath = normalizedOptions.sourcePath || null;
    const sourcePaths = sourcePath
      ? [
          sourcePath,
          "settings.includeOffsetAssets"
        ]
      : [
          "settings.includeOffsetAssets"
        ];
    const value = normalizedOptions.value == null ? 0 : normalizedOptions.value;
    const assetOffsetStatus = normalizedOptions.assetOffsetStatus || null;

    return {
      value,
      formula: includeOffsetAssets && sourcePath ? sourcePath : "disabled by settings",
      sourcePath,
      sourcePaths,
      traceInputs: {
        includeOffsetAssets,
        assetOffsetSource: ASSET_OFFSET_SOURCE_TREATED,
        requestedAssetOffsetSource: ASSET_OFFSET_SOURCE_TREATED,
        effectiveAssetOffsetSource,
        fallbackToLegacyOffsetAssets: false,
        fallbackUsed: false,
        assetOffsetStatus,
        selectedAssetOffsetValue: value,
        treatedAssetOffsetsAvailable: normalizedOptions.treatedAssetOffsetsAvailable === true,
        legacyOffsetAssetsAvailable: false
      },
      assumptionFields: {
        assetOffsetSource: ASSET_OFFSET_SOURCE_TREATED,
        effectiveAssetOffsetSource,
        fallbackToLegacyOffsetAssets: false,
        assetOffsetFallbackUsed: false,
        assetOffsetStatus
      }
    };
  }

  function resolveAssetOffsetSelection(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const model = isPlainObject(normalizedOptions.model) ? normalizedOptions.model : {};
    const warnings = Array.isArray(normalizedOptions.warnings) ? normalizedOptions.warnings : [];
    const includeOffsetAssets = normalizedOptions.includeOffsetAssets === true;
    const methodLabel = normalizedOptions.methodLabel || "analysis";
    const treatedRawValue = getPath(model, TREATED_ASSET_OFFSET_SOURCE_PATH);
    const treatedAssetOffsetsAvailable = hasNumericAssetOffset(treatedRawValue);

    function createResult(resultOptions) {
      return createAssetOffsetSelectionResult({
        includeOffsetAssets,
        treatedAssetOffsetsAvailable,
        ...resultOptions
      });
    }

    if (!includeOffsetAssets) {
      return createResult({
        value: 0,
        sourcePath: null,
        effectiveAssetOffsetSource: ASSET_OFFSET_SOURCE_DISABLED,
        assetOffsetStatus: "excluded"
      });
    }

    if (treatedAssetOffsetsAvailable) {
      const value = normalizeComponentNumber({
        value: treatedRawValue,
        sourcePath: TREATED_ASSET_OFFSET_SOURCE_PATH,
        warnings,
        warnWhenMissing: true,
        missingCode: "treated-offset-assets-missing",
        missingMessage: "treatedAssetOffsets.totalTreatedAssetValue was missing; asset offset defaulted to 0.",
        missingSeverity: "info",
        negativeCode: "negative-treated-offset-assets",
        negativeMessage: `treatedAssetOffsets.totalTreatedAssetValue was negative and was treated as 0 for ${methodLabel}.`
      });

      return createResult({
        value,
        sourcePath: TREATED_ASSET_OFFSET_SOURCE_PATH,
        effectiveAssetOffsetSource: ASSET_OFFSET_SOURCE_TREATED,
        assetOffsetStatus: value === 0 ? "treated-zero" : "treated-used"
      });
    }

    addWarning(
      warnings,
      "treated-offset-assets-unavailable",
      `treatedAssetOffsets.totalTreatedAssetValue was unavailable for ${methodLabel}; asset offset defaulted to 0.`,
      "info",
      [TREATED_ASSET_OFFSET_SOURCE_PATH, "settings.includeOffsetAssets"]
    );

    return createResult({
      value: 0,
      sourcePath: TREATED_ASSET_OFFSET_SOURCE_PATH,
      effectiveAssetOffsetSource: ASSET_OFFSET_SOURCE_ZERO,
      assetOffsetStatus: "treated-unavailable"
    });
  }

  function roundToIncrement(value, increment) {
    if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
      return value;
    }

    return Math.round(value / increment) * increment;
  }

  function applyOptionalRounding(result, settings, warnings) {
    if (!hasOwn(settings, "roundingIncrement")) {
      return result;
    }

    const roundingIncrement = toOptionalNumber(settings.roundingIncrement);
    if (roundingIncrement == null || roundingIncrement <= 0) {
      addWarning(
        warnings,
        "invalid-rounding-increment",
        "Invalid rounding increment was ignored.",
        "warning",
        ["settings.roundingIncrement"]
      );
      return result;
    }

    return {
      ...result,
      grossNeed: roundToIncrement(result.grossNeed, roundingIncrement),
      netCoverageGap: roundToIncrement(result.netCoverageGap, roundingIncrement)
    };
  }

  function getPositiveNumber(value) {
    const number = toOptionalNumber(value);
    return number != null && number > 0 ? number : null;
  }

  function resolveNeedsSupportDuration(settings, warnings) {
    if (hasOwn(settings, "needsSupportDurationYears")) {
      const settingYears = getPositiveNumber(settings.needsSupportDurationYears);
      if (settingYears != null) {
        return {
          value: settingYears,
          source: "settings",
          sourcePaths: ["settings.needsSupportDurationYears"]
        };
      }

      addWarning(
        warnings,
        "invalid-needs-support-duration-years",
        "Invalid Needs Analysis support duration setting was ignored.",
        "warning",
        ["settings.needsSupportDurationYears"]
      );
    }

    return {
      value: DEFAULT_NEEDS_SUPPORT_DURATION_YEARS,
      source: "default-10-years",
      sourcePaths: ["settings.needsSupportDurationYears"]
    };
  }

  function resolveHlvProjectionYears(model, settings, warnings) {
    if (hasOwn(settings, "hlvProjectionYears")) {
      const settingYears = toOptionalNumber(settings.hlvProjectionYears);
      if (settingYears != null && settingYears >= 0) {
        return {
          value: settingYears,
          source: "settings",
          sourcePaths: ["settings.hlvProjectionYears"]
        };
      }

      addWarning(
        warnings,
        "invalid-hlv-projection-years",
        "Invalid Human Life Value projection years setting was ignored.",
        "warning",
        ["settings.hlvProjectionYears"]
      );
    }

    const retirementHorizonYears = normalizeNonNegativeNumber(
      getPath(model, "incomeBasis.insuredRetirementHorizonYears"),
      "incomeBasis.insuredRetirementHorizonYears",
      warnings,
      {
        negativeCode: "negative-value-treated-as-zero",
        negativeMessage: "insuredRetirementHorizonYears was negative and was treated as 0 for Simple HLV."
      }
    );

    if (retirementHorizonYears.hasValue) {
      return {
        value: retirementHorizonYears.value,
        source: "incomeBasis.insuredRetirementHorizonYears",
        sourcePaths: ["incomeBasis.insuredRetirementHorizonYears"]
      };
    }

    addWarning(
      warnings,
      "missing-insured-retirement-horizon-years",
      "insuredRetirementHorizonYears was missing; Simple HLV projection years defaulted to 0.",
      "warning",
      ["incomeBasis.insuredRetirementHorizonYears", "settings.hlvProjectionYears"]
    );

    return {
      value: 0,
      source: "missing-default-zero",
      sourcePaths: ["incomeBasis.insuredRetirementHorizonYears", "settings.hlvProjectionYears"]
    };
  }

  function createNeedsDebtPayoffComponent(model, warnings) {
    const debtPayoff = isPlainObject(model?.debtPayoff) ? model.debtPayoff : {};
    const totalDebtPayoffNeed = toOptionalNumber(debtPayoff.totalDebtPayoffNeed);

    if (totalDebtPayoffNeed != null) {
      return {
        value: normalizeComponentNumber({
          value: totalDebtPayoffNeed,
          sourcePath: "debtPayoff.totalDebtPayoffNeed",
          warnings,
          negativeCode: "negative-value-treated-as-zero",
          negativeMessage: "totalDebtPayoffNeed was negative and was treated as 0 for Needs Analysis."
        }),
        source: "debtPayoff.totalDebtPayoffNeed",
        inputs: {
          totalDebtPayoffNeed
        },
        sourcePaths: ["debtPayoff.totalDebtPayoffNeed"]
      };
    }

    let hasFallbackDebtValue = false;
    let fallbackTotal = 0;
    const fallbackInputs = {};

    NEEDS_DEBT_PAYOFF_FALLBACK_FIELDS.forEach(function (field) {
      const normalized = normalizeNonNegativeNumber(debtPayoff[field.key], field.sourcePath, warnings, {
        negativeCode: "negative-value-treated-as-zero",
        negativeMessage: field.label + " was negative and was treated as 0 for Needs Analysis."
      });

      fallbackInputs[field.key] = normalized.value;
      if (!normalized.hasValue) {
        return;
      }

      hasFallbackDebtValue = true;
      fallbackTotal += normalized.value;
    });

    if (hasFallbackDebtValue) {
      addWarning(
        warnings,
        "debt-payoff-fallback-used",
        "Needs Analysis debt payoff used the sum of available debt fields because totalDebtPayoffNeed was missing.",
        "info",
        NEEDS_DEBT_PAYOFF_FALLBACK_FIELDS.map(function (field) {
          return field.sourcePath;
        })
      );

      return {
        value: fallbackTotal,
        source: "sum-available-debt-payoff-fields",
        inputs: fallbackInputs,
        sourcePaths: NEEDS_DEBT_PAYOFF_FALLBACK_FIELDS.map(function (field) {
          return field.sourcePath;
        })
      };
    }

    addWarning(
      warnings,
      "missing-total-debt-payoff-need",
      "totalDebtPayoffNeed was missing; Needs Analysis debt payoff component defaulted to 0.",
      "info",
      ["debtPayoff.totalDebtPayoffNeed"]
    );

    return {
      value: 0,
      source: "missing-default-zero",
      inputs: fallbackInputs,
      sourcePaths: ["debtPayoff.totalDebtPayoffNeed"]
    };
  }

  function buildCurrentDollarAnnualSupportValues(amount, durationYears) {
    const fullYears = Math.floor(durationYears);
    const partialYear = durationYears - fullYears;
    const values = [];

    for (let year = 1; year <= fullYears; year += 1) {
      values.push({
        year,
        yearFraction: 1,
        inflationFactor: 1,
        annualizedAmount: amount,
        amount
      });
    }

    if (partialYear > 0) {
      values.push({
        year: fullYears + 1,
        yearFraction: partialYear,
        inflationFactor: 1,
        annualizedAmount: amount,
        amount: amount * partialYear
      });
    }

    return values;
  }

  function resolveEssentialSupportInflationSettings(settings) {
    const inflationAssumptions = isPlainObject(settings.inflationAssumptions)
      ? settings.inflationAssumptions
      : null;

    if (!inflationAssumptions) {
      return {
        hasSettings: false,
        enabled: false,
        ratePercent: 0,
        rateSource: null,
        sourcePaths: ["settings.inflationAssumptions"]
      };
    }

    const householdExpenseRate = toOptionalNumber(
      inflationAssumptions.householdExpenseInflationRatePercent
    );
    const generalRate = toOptionalNumber(inflationAssumptions.generalInflationRatePercent);
    const hasHouseholdRate = householdExpenseRate != null && householdExpenseRate >= 0;
    const hasGeneralRate = generalRate != null && generalRate >= 0;
    const ratePercent = hasHouseholdRate
      ? householdExpenseRate
      : (hasGeneralRate ? generalRate : 0);
    const rateSource = hasHouseholdRate
      ? "settings.inflationAssumptions.householdExpenseInflationRatePercent"
      : (hasGeneralRate ? "settings.inflationAssumptions.generalInflationRatePercent" : null);

    return {
      hasSettings: true,
      enabled: inflationAssumptions.enabled === true,
      ratePercent,
      rateSource,
      source: inflationAssumptions.source || null,
      sourcePaths: [
        "settings.inflationAssumptions.enabled",
        rateSource || "settings.inflationAssumptions"
      ]
    };
  }

  function sumProjectedSupportForMonths(annualValues, monthCount) {
    const values = Array.isArray(annualValues) ? annualValues : [];
    let remainingMonths = Math.max(0, toOptionalNumber(monthCount) || 0);
    let total = 0;

    values.forEach(function (annualValue) {
      if (remainingMonths <= 0 || !isPlainObject(annualValue)) {
        return;
      }

      const yearFraction = toOptionalNumber(annualValue.yearFraction);
      const availableMonths = (yearFraction == null ? 1 : yearFraction) * 12;
      const usedMonths = Math.min(remainingMonths, availableMonths);
      const annualizedAmount = toOptionalNumber(annualValue.annualizedAmount);
      const monthlyAmount = annualizedAmount == null ? 0 : annualizedAmount / 12;
      total += monthlyAmount * usedMonths;
      remainingMonths -= usedMonths;
    });

    return total;
  }

  function calculateEssentialSupportInflationProjection(amount, durationYears, settings) {
    const currentDollarTotal = amount * durationYears;
    const currentDollarAnnualValues = buildCurrentDollarAnnualSupportValues(amount, durationYears);
    const inflationSettings = resolveEssentialSupportInflationSettings(settings);
    const calculateInflationProjection = lensAnalysis.calculateInflationProjection;
    const baseTrace = {
      component: "essential support",
      included: true,
      includeEssentialSupport: true,
      enabled: inflationSettings.enabled,
      applied: false,
      baseAnnualAmount: amount,
      durationYears,
      ratePercent: inflationSettings.ratePercent,
      rateSource: inflationSettings.rateSource,
      currentDollarTotal,
      projectedTotal: currentDollarTotal,
      source: inflationSettings.source,
      sourcePaths: [
        "ongoingSupport.annualTotalEssentialSupportCost",
        ...inflationSettings.sourcePaths
      ],
      helperWarnings: []
    };

    if (!inflationSettings.hasSettings) {
      return {
        projectedTotal: currentDollarTotal,
        annualValues: currentDollarAnnualValues,
        applied: false,
        trace: {
          ...baseTrace,
          reason: "missing-inflation-assumptions"
        }
      };
    }

    if (typeof calculateInflationProjection !== "function") {
      return {
        projectedTotal: currentDollarTotal,
        annualValues: currentDollarAnnualValues,
        applied: false,
        trace: {
          ...baseTrace,
          sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"],
          reason: "inflation-helper-unavailable",
          helperWarnings: [
            {
              code: "inflation-helper-unavailable",
              message: "Inflation projection helper was not loaded; current-dollar essential support was used."
            }
          ]
        }
      };
    }

    const projection = calculateInflationProjection({
      amount,
      durationYears,
      ratePercent: inflationSettings.ratePercent,
      enabled: inflationSettings.enabled && inflationSettings.rateSource !== null,
      timing: "annual",
      label: "Needs essential support",
      source: inflationSettings.rateSource
    });
    const helperWarnings = Array.isArray(projection.warnings) ? projection.warnings : [];
    const projectedTotal = toOptionalNumber(projection.projectedTotal);
    const annualValues = Array.isArray(projection.annualValues)
      ? projection.annualValues
      : currentDollarAnnualValues;

    return {
      projectedTotal: projectedTotal == null ? currentDollarTotal : projectedTotal,
      annualValues,
      applied: projection.applied === true,
      trace: {
        ...baseTrace,
        enabled: inflationSettings.enabled,
        applied: projection.applied === true,
        projectedTotal: projectedTotal == null ? currentDollarTotal : projectedTotal,
        helperWarnings,
        helperTrace: projection.trace || null,
        reason: projection.applied === true ? "inflation-applied" : "inflation-disabled-or-zero-rate"
      }
    };
  }

  function createExcludedEssentialSupportInflationTrace(
    settings,
    durationYears,
    annualAmount,
    includeSurvivorIncomeOffset
  ) {
    const inflationSettings = resolveEssentialSupportInflationSettings(settings);
    const normalizedAnnualAmount = toOptionalNumber(annualAmount);
    const currentDollarTotal = normalizedAnnualAmount == null ? 0 : normalizedAnnualAmount * durationYears;

    return {
      component: "essential support",
      included: false,
      includeEssentialSupport: false,
      enabled: inflationSettings.enabled,
      applied: false,
      baseAnnualAmount: normalizedAnnualAmount,
      durationYears,
      ratePercent: inflationSettings.ratePercent,
      rateSource: inflationSettings.rateSource,
      currentDollarTotal,
      projectedTotal: currentDollarTotal,
      source: inflationSettings.source,
      sourcePaths: [
        "settings.includeEssentialSupport",
        "ongoingSupport.annualTotalEssentialSupportCost",
        ...inflationSettings.sourcePaths
      ],
      helperWarnings: [],
      reason: "essential-support-excluded-by-setting",
      essentialSupportRawAmount: normalizedAnnualAmount,
      essentialSupportPreExclusionAmount: currentDollarTotal,
      essentialSupportIncludedAmount: 0,
      essentialSupportExcludedAmount: currentDollarTotal,
      exclusionReason: "essential-support-not-included-setting",
      survivorIncomeOffsetApplied: false,
      survivorIncomeOffsetSuppressed: includeSurvivorIncomeOffset === true
    };
  }

  function calculateDiscretionarySupportInflationProjection(amount, durationYears, settings) {
    const currentDollarTotal = amount * durationYears;
    const currentDollarAnnualValues = buildCurrentDollarAnnualSupportValues(amount, durationYears);
    const inflationSettings = resolveEssentialSupportInflationSettings(settings);
    const calculateInflationProjection = lensAnalysis.calculateInflationProjection;
    const baseTrace = {
      component: "discretionary support",
      included: true,
      enabled: inflationSettings.enabled,
      applied: false,
      baseAnnualAmount: amount,
      durationYears,
      ratePercent: inflationSettings.ratePercent,
      rateSource: inflationSettings.rateSource,
      currentDollarTotal,
      projectedTotal: currentDollarTotal,
      source: inflationSettings.source,
      sourcePaths: [
        "ongoingSupport.annualDiscretionaryPersonalSpending",
        ...inflationSettings.sourcePaths
      ],
      helperWarnings: []
    };

    if (!inflationSettings.hasSettings) {
      return {
        projectedTotal: currentDollarTotal,
        annualValues: currentDollarAnnualValues,
        applied: false,
        trace: {
          ...baseTrace,
          reason: "missing-inflation-assumptions"
        }
      };
    }

    if (typeof calculateInflationProjection !== "function") {
      return {
        projectedTotal: currentDollarTotal,
        annualValues: currentDollarAnnualValues,
        applied: false,
        trace: {
          ...baseTrace,
          sourcePaths: ["ongoingSupport.annualDiscretionaryPersonalSpending"],
          reason: "inflation-helper-unavailable",
          helperWarnings: [
            {
              code: "inflation-helper-unavailable",
              message: "Inflation projection helper was not loaded; current-dollar discretionary support was used."
            }
          ]
        }
      };
    }

    const projection = calculateInflationProjection({
      amount,
      durationYears,
      ratePercent: inflationSettings.ratePercent,
      enabled: inflationSettings.enabled && inflationSettings.rateSource !== null,
      timing: "annual",
      label: "Needs discretionary support",
      source: inflationSettings.rateSource
    });
    const helperWarnings = Array.isArray(projection.warnings) ? projection.warnings : [];
    const projectedTotal = toOptionalNumber(projection.projectedTotal);
    const annualValues = Array.isArray(projection.annualValues)
      ? projection.annualValues
      : currentDollarAnnualValues;

    return {
      projectedTotal: projectedTotal == null ? currentDollarTotal : projectedTotal,
      annualValues,
      applied: projection.applied === true,
      trace: {
        ...baseTrace,
        enabled: inflationSettings.enabled,
        applied: projection.applied === true,
        projectedTotal: projectedTotal == null ? currentDollarTotal : projectedTotal,
        helperWarnings,
        helperTrace: projection.trace || null,
        reason: projection.applied === true ? "inflation-applied" : "inflation-disabled-or-zero-rate"
      }
    };
  }

  function createExcludedDiscretionarySupportInflationTrace(settings, durationYears) {
    const inflationSettings = resolveEssentialSupportInflationSettings(settings);

    return {
      component: "discretionary support",
      included: false,
      enabled: inflationSettings.enabled,
      applied: false,
      baseAnnualAmount: null,
      durationYears,
      ratePercent: inflationSettings.ratePercent,
      rateSource: inflationSettings.rateSource,
      currentDollarTotal: 0,
      projectedTotal: 0,
      source: inflationSettings.source,
      sourcePaths: [
        "settings.includeDiscretionarySupport",
        "ongoingSupport.annualDiscretionaryPersonalSpending",
        ...inflationSettings.sourcePaths
      ],
      helperWarnings: [],
      reason: "discretionary-support-excluded"
    };
  }

  function getNonNegativeEducationNumber(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }

    return Math.max(0, number);
  }

  function getEducationSettings(settings) {
    return isPlainObject(settings.educationAssumptions)
      ? settings.educationAssumptions
      : {};
  }

  function getEducationStartAgeSetting(settings) {
    const educationStartAge = toOptionalNumber(getEducationSettings(settings).educationStartAge);
    if (educationStartAge == null) {
      return 18;
    }

    const rounded = Math.round(educationStartAge);
    return rounded >= 0 && rounded <= 30 ? rounded : 18;
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

  function normalizeDateOnlyString(value) {
    if (value == null || value === "") {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : formatDateOnlyFromDate(value);
    }

    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
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

  function resolveEducationProjectionAsOfDate(settings, warnings) {
    const educationAssumptions = getEducationSettings(settings);
    const candidates = [
      {
        value: educationAssumptions.asOfDate,
        source: educationAssumptions.asOfDateSource || "settings.educationAssumptions.asOfDate",
        defaulted: educationAssumptions.asOfDateDefaulted === true,
        warningCode: educationAssumptions.asOfDateWarningCode || null
      },
      {
        value: educationAssumptions.valuationDate,
        source: educationAssumptions.valuationDateSource || "settings.educationAssumptions.valuationDate",
        defaulted: educationAssumptions.valuationDateDefaulted === true,
        warningCode: educationAssumptions.valuationDateWarningCode || null
      },
      {
        value: settings?.valuationDate,
        source: settings?.valuationDateSource || "settings.valuationDate",
        defaulted: settings?.valuationDateDefaulted === true,
        warningCode: settings?.valuationDateWarningCode || null
      },
      {
        value: settings?.asOfDate,
        source: settings?.asOfDateSource || "settings.asOfDate",
        defaulted: settings?.asOfDateDefaulted === true,
        warningCode: settings?.asOfDateWarningCode || null
      }
    ];
    let invalidDateCandidate = null;

    for (let index = 0; index < candidates.length; index += 1) {
      if (candidates[index].value == null || candidates[index].value === "") {
        continue;
      }

      const asOfDate = normalizeDateOnlyString(candidates[index].value);
      if (asOfDate) {
        return {
          asOfDate,
          valuationDate: asOfDate,
          source: candidates[index].source,
          defaulted: candidates[index].defaulted,
          warningCode: candidates[index].warningCode
        };
      }

      invalidDateCandidate = invalidDateCandidate || candidates[index];
    }

    const warningCode = invalidDateCandidate
      ? "invalid-education-valuation-date-defaulted"
      : "education-valuation-date-defaulted";
    const message = invalidDateCandidate
      ? "Education projection valuationDate was invalid; current date was used."
      : "Education projection valuationDate was missing; current date was used.";

    if (Array.isArray(warnings)) {
      warnings.push(createWarning(
        warningCode,
        message,
        invalidDateCandidate ? "warning" : "info",
        [invalidDateCandidate?.source || "settings.valuationDate"]
      ));
    }

    const fallbackDate = getCurrentDateOnly();
    return {
      asOfDate: fallbackDate,
      valuationDate: fallbackDate,
      source: "system-current-date-fallback",
      defaulted: true,
      warningCode
    };
  }

  function resolveEducationFundingInflationSettings(settings, warnings) {
    const educationAssumptions = getEducationSettings(settings);
    const inflationAssumptions = isPlainObject(settings.inflationAssumptions)
      ? settings.inflationAssumptions
      : null;
    const asOfDateResult = resolveEducationProjectionAsOfDate(settings, warnings);
    const educationRate = toOptionalNumber(inflationAssumptions?.educationInflationRatePercent);
    const generalRate = toOptionalNumber(inflationAssumptions?.generalInflationRatePercent);
    const hasEducationRate = educationRate != null && educationRate >= 0;
    const hasGeneralRate = generalRate != null && generalRate >= 0;
    const ratePercent = hasEducationRate
      ? educationRate
      : (hasGeneralRate ? generalRate : 0);
    const rateSource = hasEducationRate
      ? "settings.inflationAssumptions.educationInflationRatePercent"
      : (hasGeneralRate ? "settings.inflationAssumptions.generalInflationRatePercent" : null);

    return {
      hasInflationSettings: Boolean(inflationAssumptions),
      inflationEnabled: inflationAssumptions?.enabled === true,
      includeEducationFunding: educationAssumptions.includeEducationFunding !== false,
      includeProjectedDependentsSetting: educationAssumptions.includeProjectedDependents !== false,
      applyEducationInflation: educationAssumptions.applyEducationInflation === true,
      educationStartAge: getEducationStartAgeSetting(settings),
      asOfDate: asOfDateResult.asOfDate,
      valuationDate: asOfDateResult.valuationDate,
      asOfDateSource: asOfDateResult.source,
      valuationDateSource: asOfDateResult.source,
      valuationDateDefaulted: asOfDateResult.defaulted === true,
      valuationDateWarningCode: asOfDateResult.warningCode || null,
      ratePercent,
      rateSource,
      source: inflationAssumptions?.source || educationAssumptions.source || null,
      sourcePaths: [
        "settings.educationAssumptions",
        "settings.educationAssumptions.includeEducationFunding",
        "settings.educationAssumptions.includeProjectedDependents",
        "settings.educationAssumptions.applyEducationInflation",
        "settings.educationAssumptions.educationStartAge",
        "settings.inflationAssumptions.enabled",
        asOfDateResult.asOfDate ? asOfDateResult.source : "settings.educationAssumptions.valuationDate",
        rateSource || "settings.inflationAssumptions"
      ]
    };
  }

  function createCurrentDollarEducationInflationTrace(options) {
    const normalizedOptions = isPlainObject(options) ? options : {};
    const currentChildIncludedAmount = normalizedOptions.currentChildEducationIncludedAmount == null
      ? (normalizedOptions.currentDollarCurrentChildTotal || 0)
      : normalizedOptions.currentChildEducationIncludedAmount;
    const plannedIncludedAmount = normalizedOptions.plannedDependentEducationIncludedAmount == null
      ? (normalizedOptions.currentDollarPlannedDependentTotal || 0)
      : normalizedOptions.plannedDependentEducationIncludedAmount;
    const plannedExcludedAmount = normalizedOptions.plannedDependentEducationExcludedAmount || 0;
    const totalUsed = normalizedOptions.combinedEducationTotalUsed == null
      ? currentChildIncludedAmount + plannedIncludedAmount
      : normalizedOptions.combinedEducationTotalUsed;
    return {
      component: "education funding",
      includeEducationFundingSetting: normalizedOptions.includeEducationFunding !== false,
      includeProjectedDependentsSetting: normalizedOptions.includeProjectedDependentsSetting !== false,
      educationFundingExcluded: normalizedOptions.educationFundingExcluded === true,
      educationExcludedReason: normalizedOptions.educationExcludedReason || null,
      enabled: Boolean(normalizedOptions.enabled),
      applied: false,
      currentDatedChildCount: normalizedOptions.currentDatedChildCount || 0,
      plannedDependentCount: normalizedOptions.plannedDependentCount || 0,
      currentDollarCurrentChildTotal: normalizedOptions.currentDollarCurrentChildTotal || 0,
      projectedCurrentChildTotal: currentChildIncludedAmount,
      currentChildEducationIncludedAmount: currentChildIncludedAmount,
      currentDollarPlannedDependentTotal: normalizedOptions.currentDollarPlannedDependentTotal || 0,
      plannedDependentEducationIncludedAmount: plannedIncludedAmount,
      plannedDependentEducationExcludedAmount: plannedExcludedAmount,
      plannedDependentEducationStatus: normalizedOptions.plannedDependentEducationStatus || "current-dollar-included",
      currentEducationProjectionStatus: normalizedOptions.currentEducationProjectionStatus || "current-dollar",
      combinedEducationTotalUsed: totalUsed,
      educationStartAge: normalizedOptions.educationStartAge,
      asOfDate: normalizedOptions.asOfDate || null,
      asOfDateSource: normalizedOptions.asOfDateSource || null,
      valuationDate: normalizedOptions.valuationDate || normalizedOptions.asOfDate || null,
      valuationDateSource: normalizedOptions.valuationDateSource || normalizedOptions.asOfDateSource || null,
      valuationDateDefaulted: normalizedOptions.valuationDateDefaulted === true,
      valuationDateWarningCode: normalizedOptions.valuationDateWarningCode || null,
      ratePercent: normalizedOptions.ratePercent,
      rateSource: normalizedOptions.rateSource,
      childRows: [],
      helperWarnings: normalizedOptions.helperWarnings || [],
      reason: normalizedOptions.reason || "current-dollar-education-used",
      sourcePaths: normalizedOptions.sourcePaths || ["educationSupport.totalEducationFundingNeed"]
    };
  }

  function createNeedsEducationComponent(model, settings, warnings) {
    const currentDollarEducation = normalizeComponentNumber({
      value: getPath(model, "educationSupport.totalEducationFundingNeed"),
      sourcePath: "educationSupport.totalEducationFundingNeed",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-education-funding-need",
      missingMessage: "totalEducationFundingNeed was missing; Needs Analysis education component defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "totalEducationFundingNeed was negative and was treated as 0 for Needs Analysis."
    });
    const currentDollarTotal = currentDollarEducation;
    const educationSettings = resolveEducationFundingInflationSettings(settings, warnings);
    const currentDependentDetails = Array.isArray(getPath(model, "educationSupport.currentDependentDetails"))
      ? getPath(model, "educationSupport.currentDependentDetails").slice()
      : [];
    const currentDatedChildCount = currentDependentDetails.length;
    const plannedDependentCount = getNonNegativeEducationNumber(
      getPath(model, "educationSupport.desiredAdditionalDependentCount")
    ) || 0;
    const currentDollarCurrentChildTotal = getNonNegativeEducationNumber(
      getPath(model, "educationSupport.linkedDependentEducationFundingNeed")
    );
    const currentDollarPlannedDependentTotal = getNonNegativeEducationNumber(
      getPath(model, "educationSupport.desiredAdditionalDependentEducationFundingNeed")
    ) || 0;
    const includeProjectedDependents = educationSettings.includeProjectedDependentsSetting !== false;
    const plannedDependentEducationIncludedAmount = includeProjectedDependents
      ? currentDollarPlannedDependentTotal
      : 0;
    const plannedDependentEducationExcludedAmount = includeProjectedDependents
      ? 0
      : currentDollarPlannedDependentTotal;
    const plannedDependentEducationStatus = currentDollarPlannedDependentTotal <= 0
      ? "not-present"
      : (includeProjectedDependents ? "current-dollar-included" : "excluded-by-setting");
    const resolvedCurrentDollarCurrentChildTotal = currentDollarCurrentChildTotal == null
      ? Math.max(currentDollarTotal - currentDollarPlannedDependentTotal, 0)
      : currentDollarCurrentChildTotal;
    const perChildFundingAmount = getNonNegativeEducationNumber(
      getPath(model, "educationSupport.perLinkedDependentEducationFunding")
    );
    const baseSourcePaths = [
      "educationSupport.totalEducationFundingNeed",
      "educationSupport.linkedDependentEducationFundingNeed",
      "educationSupport.desiredAdditionalDependentEducationFundingNeed",
      "educationSupport.perLinkedDependentEducationFunding",
      "educationSupport.currentDependentDetails",
      ...educationSettings.sourcePaths
    ];
    const currentDollarTraceBase = {
      ...educationSettings,
      currentDatedChildCount,
      plannedDependentCount,
      currentDollarCurrentChildTotal: resolvedCurrentDollarCurrentChildTotal,
      currentDollarPlannedDependentTotal,
      plannedDependentEducationIncludedAmount,
      plannedDependentEducationExcludedAmount,
      plannedDependentEducationStatus,
      currentDollarTotal,
      sourcePaths: baseSourcePaths
    };

    const createCurrentDollarResult = function (reason, helperWarnings) {
      const educationFundingExcluded = !educationSettings.includeEducationFunding;
      const currentChildEducationIncludedAmount = educationFundingExcluded
        ? 0
        : resolvedCurrentDollarCurrentChildTotal;
      const effectivePlannedIncludedAmount = educationFundingExcluded
        ? 0
        : plannedDependentEducationIncludedAmount;
      const effectivePlannedExcludedAmount = educationFundingExcluded
        ? currentDollarPlannedDependentTotal
        : plannedDependentEducationExcludedAmount;
      const combinedEducationTotalUsed = currentChildEducationIncludedAmount + effectivePlannedIncludedAmount;
      return {
        value: combinedEducationTotalUsed,
        formula: educationFundingExcluded
          ? "disabled by settings"
          : (includeProjectedDependents
              ? "current-dollar education funding total used"
              : "current-child education funding only; planned-dependent education excluded by setting"),
        inputs: {
          includeEducationFunding: educationSettings.includeEducationFunding,
          includeProjectedDependents: educationSettings.includeProjectedDependentsSetting,
          totalEducationFundingNeed: currentDollarTotal,
          currentChildEducationIncludedAmount,
          plannedDependentEducationIncludedAmount: effectivePlannedIncludedAmount,
          plannedDependentEducationExcludedAmount: effectivePlannedExcludedAmount,
          combinedEducationTotalUsed,
          educationExcludedReason: educationFundingExcluded ? reason : null,
          valuationDate: educationSettings.valuationDate,
          valuationDateSource: educationSettings.valuationDateSource,
          valuationDateDefaulted: educationSettings.valuationDateDefaulted,
          valuationDateWarningCode: educationSettings.valuationDateWarningCode
        },
        sourcePaths: baseSourcePaths,
        inflation: createCurrentDollarEducationInflationTrace({
          ...currentDollarTraceBase,
          enabled: educationSettings.includeEducationFunding
            && educationSettings.applyEducationInflation
            && educationSettings.inflationEnabled
            && educationSettings.rateSource !== null,
          currentChildEducationIncludedAmount,
          plannedDependentEducationIncludedAmount: effectivePlannedIncludedAmount,
          plannedDependentEducationExcludedAmount: effectivePlannedExcludedAmount,
          plannedDependentEducationStatus: educationFundingExcluded
            ? "excluded-by-education-funding-setting"
            : plannedDependentEducationStatus,
          currentEducationProjectionStatus: educationFundingExcluded ? "excluded" : "current-dollar",
          combinedEducationTotalUsed,
          educationFundingExcluded,
          educationExcludedReason: educationFundingExcluded ? reason : null,
          asOfDate: educationSettings.asOfDate,
          asOfDateSource: educationSettings.asOfDateSource,
          valuationDate: educationSettings.valuationDate,
          valuationDateSource: educationSettings.valuationDateSource,
          valuationDateDefaulted: educationSettings.valuationDateDefaulted,
          valuationDateWarningCode: educationSettings.valuationDateWarningCode,
          helperWarnings,
          reason
        })
      };
    };

    if (!educationSettings.includeEducationFunding) {
      return createCurrentDollarResult("education-funding-not-included-setting");
    }

    if (!educationSettings.applyEducationInflation) {
      return createCurrentDollarResult("education-inflation-disabled");
    }

    if (!educationSettings.hasInflationSettings || !educationSettings.inflationEnabled) {
      return createCurrentDollarResult("inflation-assumptions-disabled-or-missing");
    }

    if (educationSettings.rateSource === null) {
      return createCurrentDollarResult("education-inflation-rate-missing");
    }

    if (!currentDependentDetails.length) {
      return createCurrentDollarResult("no-current-dependent-birthdates");
    }

    if (perChildFundingAmount == null) {
      return createCurrentDollarResult("missing-per-child-current-education-funding");
    }

    if (currentDollarCurrentChildTotal == null) {
      return createCurrentDollarResult("missing-current-child-education-subtotal");
    }

    if (resolvedCurrentDollarCurrentChildTotal <= 0) {
      return createCurrentDollarResult("no-current-child-education-funding");
    }

    const calculateEducationFundingProjection = lensAnalysis.calculateEducationFundingProjection;
    if (typeof calculateEducationFundingProjection !== "function") {
      return createCurrentDollarResult("education-projection-helper-unavailable", [
        {
          code: "education-projection-helper-unavailable",
          message: "Education funding projection helper was not loaded; current-dollar education funding was used."
        }
      ]);
    }

    const projection = calculateEducationFundingProjection({
      dependentDetails: currentDependentDetails,
      perChildFundingAmount,
      ratePercent: educationSettings.ratePercent,
      enabled: true,
      educationStartAge: educationSettings.educationStartAge,
      timing: "annual",
      asOfDate: educationSettings.valuationDate,
      source: "needs-analysis.educationSupport.currentDependentDetails"
    });
    const childRows = Array.isArray(projection.childRows) ? projection.childRows : [];
    const validChildCount = childRows.filter(function (row) {
      return isPlainObject(row) && row.currentAge !== null;
    }).length;

    if (validChildCount <= 0) {
      return createCurrentDollarResult(
        "no-valid-current-dependent-birthdates",
        Array.isArray(projection.warnings) ? projection.warnings : []
      );
    }

    const projectedDatedCurrentChildTotal = getNonNegativeEducationNumber(projection.projectedTotal);
    const currentDollarDatedChildTotal = getNonNegativeEducationNumber(projection.currentDollarTotal);
    if (projectedDatedCurrentChildTotal == null || currentDollarDatedChildTotal == null) {
      return createCurrentDollarResult(
        "education-projection-invalid",
        Array.isArray(projection.warnings) ? projection.warnings : []
      );
    }

    const currentDollarUndatedCurrentChildTotal = Math.max(
      resolvedCurrentDollarCurrentChildTotal - currentDollarDatedChildTotal,
      0
    );
    const projectedCurrentChildTotal = projectedDatedCurrentChildTotal + currentDollarUndatedCurrentChildTotal;
    const combinedEducationTotalUsed = projectedCurrentChildTotal + plannedDependentEducationIncludedAmount;
    const helperWarnings = Array.isArray(projection.warnings) ? projection.warnings : [];
    const projectionApplied = projection.applied === true;
    const inflationTrace = {
      component: "education funding",
      includeEducationFundingSetting: educationSettings.includeEducationFunding,
      includeProjectedDependentsSetting: educationSettings.includeProjectedDependentsSetting,
      educationFundingExcluded: false,
      educationExcludedReason: null,
      enabled: true,
      applied: projectionApplied,
      currentDatedChildCount: validChildCount,
      inputCurrentDatedChildCount: currentDatedChildCount,
      plannedDependentCount,
      currentDollarCurrentChildTotal: resolvedCurrentDollarCurrentChildTotal,
      currentDollarDatedChildTotal,
      currentDollarUndatedCurrentChildTotal,
      projectedDatedCurrentChildTotal,
      projectedCurrentChildTotal,
      currentChildEducationIncludedAmount: projectedCurrentChildTotal,
      currentDollarPlannedDependentTotal,
      plannedDependentEducationIncludedAmount,
      plannedDependentEducationExcludedAmount,
      plannedDependentEducationStatus,
      combinedEducationTotalUsed,
      educationStartAge: projection.educationStartAge,
      asOfDate: projection.trace?.asOfDate || educationSettings.asOfDate || null,
      asOfDateSource: educationSettings.asOfDateSource,
      valuationDate: projection.trace?.asOfDate || educationSettings.valuationDate || null,
      valuationDateSource: educationSettings.valuationDateSource,
      valuationDateDefaulted: educationSettings.valuationDateDefaulted,
      valuationDateWarningCode: educationSettings.valuationDateWarningCode,
      ratePercent: projection.ratePercent,
      rateSource: educationSettings.rateSource,
      childRows,
      helperWarnings,
      helperTrace: projection.trace || null,
      currentEducationProjectionStatus: projectionApplied ? "projected" : "current-dollar",
      reason: projectionApplied ? "education-inflation-applied" : "education-inflation-disabled-or-zero-rate",
      sourcePaths: baseSourcePaths
    };

    return {
      value: combinedEducationTotalUsed,
      formula: projectionApplied
        ? (includeProjectedDependents
            ? "project current dated child lump-sum education funding to educationStartAge + current-dollar planned dependent education funding"
            : "project current dated child lump-sum education funding to educationStartAge; planned-dependent education excluded by setting")
        : (includeProjectedDependents
            ? "current-dollar education funding total used"
            : "current-child education funding only; planned-dependent education excluded by setting"),
      inputs: {
        includeEducationFunding: educationSettings.includeEducationFunding,
        includeProjectedDependents: educationSettings.includeProjectedDependentsSetting,
        currentDollarCurrentChildTotal: resolvedCurrentDollarCurrentChildTotal,
        currentChildEducationIncludedAmount: projectedCurrentChildTotal,
        projectedCurrentChildTotal,
        currentDollarPlannedDependentTotal,
        plannedDependentEducationIncludedAmount,
        plannedDependentEducationExcludedAmount,
        combinedEducationTotalUsed,
        valuationDate: projection.trace?.asOfDate || educationSettings.valuationDate || null,
        valuationDateSource: educationSettings.valuationDateSource,
        valuationDateDefaulted: educationSettings.valuationDateDefaulted,
        valuationDateWarningCode: educationSettings.valuationDateWarningCode
      },
      sourcePaths: baseSourcePaths,
      inflation: inflationTrace
    };
  }

  function createEssentialSupportComponent(
    model,
    settings,
    needsSupportDurationYears,
    includeSurvivorIncomeOffset,
    includeEssentialSupport,
    warnings
  ) {
    const annualSupport = normalizeNonNegativeNumber(
      getPath(model, "ongoingSupport.annualTotalEssentialSupportCost"),
      "ongoingSupport.annualTotalEssentialSupportCost",
      warnings,
      {
        negativeCode: "negative-value-treated-as-zero",
        negativeMessage: "annualTotalEssentialSupportCost was negative and was treated as 0 for Needs Analysis."
      }
    );

    if (annualSupport.hasValue) {
      const totalSupportMonths = needsSupportDurationYears * 12;
      const monthlySupportNeed = annualSupport.value / 12;
      const supportProjection = calculateEssentialSupportInflationProjection(
        annualSupport.value,
        needsSupportDurationYears,
        settings
      );
      const grossSupportNeed = supportProjection.projectedTotal;
      const currentDollarGrossSupportNeed = supportProjection.trace.currentDollarTotal;
      const essentialSupportFormula = supportProjection.applied
        ? "inflation-adjusted annualTotalEssentialSupportCost over needsSupportDurationYears"
        : "annualTotalEssentialSupportCost x needsSupportDurationYears";

      if (includeEssentialSupport === false) {
        const excludedInflationTrace = {
          ...supportProjection.trace,
          included: false,
          includeEssentialSupport: false,
          reason: "essential-support-excluded-by-setting",
          essentialSupportRawAmount: annualSupport.value,
          essentialSupportPreExclusionAmount: grossSupportNeed,
          essentialSupportIncludedAmount: 0,
          essentialSupportExcludedAmount: grossSupportNeed,
          exclusionReason: "essential-support-not-included-setting",
          survivorIncomeOffsetApplied: false,
          survivorIncomeOffsetSuppressed: includeSurvivorIncomeOffset === true,
          sourcePaths: [
            "settings.includeEssentialSupport",
            ...supportProjection.trace.sourcePaths.filter(function (sourcePath) {
              return sourcePath !== "settings.includeEssentialSupport";
            })
          ]
        };

        return {
          value: 0,
          source: "settings.includeEssentialSupport",
          formula: "disabled by settings",
          inputs: {
            includeEssentialSupport: false,
            annualTotalEssentialSupportCost: annualSupport.value,
            needsSupportDurationYears,
            essentialSupportRawAmount: annualSupport.value,
            essentialSupportPreExclusionAmount: grossSupportNeed,
            essentialSupportIncludedAmount: 0,
            essentialSupportExcludedAmount: grossSupportNeed,
            exclusionReason: "essential-support-not-included-setting",
            survivorIncomeOffsetApplied: false,
            survivorIncomeOffsetSuppressed: includeSurvivorIncomeOffset === true,
            inflation: excludedInflationTrace
          },
          sourcePaths: excludedInflationTrace.sourcePaths,
          survivorIncomeOffset: 0,
          supportDetails: {
            includeEssentialSupport: false,
            monthlySupportNeed,
            totalSupportMonths,
            annualTotalEssentialSupportCost: annualSupport.value,
            survivorNetAnnualIncome: null,
            monthlySurvivorIncome: 0,
            survivorIncomeStartDelayMonths: 0,
            incomeOffsetMonths: 0,
            supportNeedDuringDelay: 0,
            projectedSupportAfterIncomeStarts: 0,
            survivorIncomeDuringIncomeMonths: 0,
            monthlySupportGapAfterIncomeStarts: 0,
            supportNeedAfterIncomeStarts: 0,
            grossSupportNeed,
            currentDollarGrossSupportNeed,
            essentialSupportRawAmount: annualSupport.value,
            essentialSupportPreExclusionAmount: grossSupportNeed,
            essentialSupportIncludedAmount: 0,
            essentialSupportExcludedAmount: grossSupportNeed,
            essentialSupportExclusionReason: "essential-support-not-included-setting",
            survivorIncomeOffsetApplied: false,
            survivorIncomeOffsetSuppressed: includeSurvivorIncomeOffset === true,
            inflation: excludedInflationTrace
          }
        };
      }

      if (!includeSurvivorIncomeOffset) {
        return {
          value: grossSupportNeed,
          source: "ongoingSupport.annualTotalEssentialSupportCost",
          formula: essentialSupportFormula,
          inputs: {
            includeEssentialSupport: true,
            annualTotalEssentialSupportCost: annualSupport.value,
            needsSupportDurationYears,
            includeSurvivorIncomeOffset,
            essentialSupportRawAmount: annualSupport.value,
            essentialSupportPreExclusionAmount: grossSupportNeed,
            essentialSupportIncludedAmount: grossSupportNeed,
            essentialSupportExcludedAmount: 0,
            exclusionReason: null,
            inflation: supportProjection.trace
          },
          sourcePaths: supportProjection.trace.sourcePaths,
          survivorIncomeOffset: 0,
          supportDetails: {
            includeEssentialSupport: true,
            monthlySupportNeed,
            totalSupportMonths,
            annualTotalEssentialSupportCost: annualSupport.value,
            survivorNetAnnualIncome: null,
            monthlySurvivorIncome: 0,
            survivorIncomeStartDelayMonths: 0,
            incomeOffsetMonths: 0,
            supportNeedDuringDelay: grossSupportNeed,
            monthlySupportGapAfterIncomeStarts: monthlySupportNeed,
            supportNeedAfterIncomeStarts: 0,
            grossSupportNeed,
            currentDollarGrossSupportNeed,
            essentialSupportRawAmount: annualSupport.value,
            essentialSupportPreExclusionAmount: grossSupportNeed,
            essentialSupportIncludedAmount: grossSupportNeed,
            essentialSupportExcludedAmount: 0,
            essentialSupportExclusionReason: null,
            survivorIncomeOffsetApplied: false,
            survivorIncomeOffsetSuppressed: false,
            inflation: supportProjection.trace
          }
        };
      }

      const survivorContinuesWorking = getPath(model, "survivorScenario.survivorContinuesWorking");
      const survivorIncomePath = "survivorScenario.survivorNetAnnualIncome";
      const survivorIncomeMissingIsExpected = survivorContinuesWorking === false;
      const survivorIncome = survivorIncomeMissingIsExpected
        ? { value: null, hasValue: false }
        : normalizeNonNegativeNumber(
            getPath(model, survivorIncomePath),
            survivorIncomePath,
            warnings,
            {
              negativeCode: "negative-value-treated-as-zero",
              negativeMessage: "survivorNetAnnualIncome was negative and was treated as 0 for Needs Analysis."
            }
          );
      let survivorNetAnnualIncome = 0;

      if (survivorIncome.hasValue) {
        survivorNetAnnualIncome = survivorIncome.value;
      } else if (!survivorIncomeMissingIsExpected) {
        addWarning(
          warnings,
          "missing-survivor-income-for-offset",
          "survivorNetAnnualIncome was missing; Needs Analysis support used no survivor income reduction.",
          "warning",
          [survivorIncomePath]
        );
      }

      const delayPath = "survivorScenario.survivorIncomeStartDelayMonths";
      const rawDelayMonths = toOptionalNumber(getPath(model, delayPath));
      let delayMonths = 0;

      if (rawDelayMonths == null) {
        if (survivorIncome.hasValue && survivorNetAnnualIncome > 0) {
          addWarning(
            warnings,
            "survivor-income-start-delay-defaulted-zero",
            "survivorIncomeStartDelayMonths was missing; survivor income was treated as starting immediately for Needs Analysis.",
            "info",
            [delayPath]
          );
        }
      } else if (rawDelayMonths < 0) {
        addWarning(
          warnings,
          "negative-value-treated-as-zero",
          "survivorIncomeStartDelayMonths was negative and was treated as 0 for Needs Analysis.",
          "warning",
          [delayPath]
        );
      } else if (rawDelayMonths > totalSupportMonths) {
        delayMonths = totalSupportMonths;
        addWarning(
          warnings,
          "survivor-income-delay-exceeds-support-duration",
          "survivorIncomeStartDelayMonths exceeded the Needs Analysis support duration and was clamped to the support duration.",
          "info",
          [delayPath]
        );
      } else {
        delayMonths = rawDelayMonths;
      }

      const incomeOffsetMonths = totalSupportMonths - delayMonths;
      const monthlySurvivorIncome = survivorNetAnnualIncome / 12;
      const supportNeedDuringDelay = sumProjectedSupportForMonths(
        supportProjection.annualValues,
        delayMonths
      );
      const projectedSupportAfterIncomeStarts = Math.max(grossSupportNeed - supportNeedDuringDelay, 0);
      const survivorIncomeDuringIncomeMonths = monthlySurvivorIncome * incomeOffsetMonths;
      const supportNeedAfterIncomeStarts = Math.max(
        projectedSupportAfterIncomeStarts - survivorIncomeDuringIncomeMonths,
        0
      );
      const monthlySupportGapAfterIncomeStarts = incomeOffsetMonths > 0
        ? supportNeedAfterIncomeStarts / incomeOffsetMonths
        : 0;
      const calculatedEssentialSupport = supportNeedDuringDelay + supportNeedAfterIncomeStarts;
      const hasPositiveSurvivorIncome = survivorNetAnnualIncome > 0;
      const essentialSupport = hasPositiveSurvivorIncome ? calculatedEssentialSupport : grossSupportNeed;
      const survivorIncomeOffset = hasPositiveSurvivorIncome ? Math.max(grossSupportNeed - essentialSupport, 0) : 0;

      const survivorIncomeGrowthRate = toOptionalNumber(
        getPath(model, "survivorScenario.survivorEarnedIncomeGrowthRatePercent")
      );
      if (survivorIncome.hasValue && survivorNetAnnualIncome > 0 && survivorIncomeGrowthRate != null) {
        addWarning(
          warnings,
          "survivor-income-growth-not-applied-v1",
          "Survivor income growth is captured but not applied to the v1 Needs Analysis support calculation.",
          "info",
          ["survivorScenario.survivorEarnedIncomeGrowthRatePercent"]
        );
      }

      return {
        value: essentialSupport,
        source: "ongoingSupport.annualTotalEssentialSupportCost",
        formula: supportProjection.applied
          ? "projected support during survivor-income delay + projected post-delay support gap"
          : "support during survivor-income delay + post-delay monthly support gap",
        inputs: {
          includeEssentialSupport: true,
          annualTotalEssentialSupportCost: annualSupport.value,
          needsSupportDurationYears,
          totalSupportMonths,
          survivorNetAnnualIncome: survivorIncome.hasValue ? survivorNetAnnualIncome : null,
          survivorIncomeStartDelayMonths: delayMonths,
          monthlySupportNeed,
          monthlySurvivorIncome,
          supportNeedDuringDelay,
          projectedSupportAfterIncomeStarts,
          survivorIncomeDuringIncomeMonths,
          monthlySupportGapAfterIncomeStarts,
          supportNeedAfterIncomeStarts,
          essentialSupportRawAmount: annualSupport.value,
          essentialSupportPreExclusionAmount: grossSupportNeed,
          essentialSupportIncludedAmount: essentialSupport,
          essentialSupportExcludedAmount: 0,
          exclusionReason: null,
          survivorIncomeOffsetApplied: survivorIncomeOffset > 0,
          inflation: supportProjection.trace
        },
        sourcePaths: [
          "ongoingSupport.annualTotalEssentialSupportCost",
          "survivorScenario.survivorNetAnnualIncome",
          "survivorScenario.survivorIncomeStartDelayMonths",
          ...supportProjection.trace.sourcePaths.filter(function (sourcePath) {
            return sourcePath !== "ongoingSupport.annualTotalEssentialSupportCost";
          })
        ],
        survivorIncomeOffset,
        supportDetails: {
          includeEssentialSupport: true,
          monthlySupportNeed,
          totalSupportMonths,
          annualTotalEssentialSupportCost: annualSupport.value,
          survivorNetAnnualIncome: survivorIncome.hasValue ? survivorNetAnnualIncome : null,
          monthlySurvivorIncome,
          survivorIncomeStartDelayMonths: delayMonths,
          incomeOffsetMonths,
          supportNeedDuringDelay,
          projectedSupportAfterIncomeStarts,
          survivorIncomeDuringIncomeMonths,
          monthlySupportGapAfterIncomeStarts,
          supportNeedAfterIncomeStarts,
          grossSupportNeed,
          currentDollarGrossSupportNeed,
          essentialSupportRawAmount: annualSupport.value,
          essentialSupportPreExclusionAmount: grossSupportNeed,
          essentialSupportIncludedAmount: essentialSupport,
          essentialSupportExcludedAmount: 0,
          essentialSupportExclusionReason: null,
          survivorIncomeOffsetApplied: survivorIncomeOffset > 0,
          survivorIncomeOffsetSuppressed: false,
          inflation: supportProjection.trace
        }
      };
    }

    if (includeEssentialSupport === false) {
      const excludedInflationTrace = createExcludedEssentialSupportInflationTrace(
        settings,
        needsSupportDurationYears,
        null,
        includeSurvivorIncomeOffset
      );

      return {
        value: 0,
        source: "settings.includeEssentialSupport",
        formula: "disabled by settings",
        inputs: {
          includeEssentialSupport: false,
          annualTotalEssentialSupportCost: null,
          needsSupportDurationYears,
          essentialSupportRawAmount: null,
          essentialSupportPreExclusionAmount: 0,
          essentialSupportIncludedAmount: 0,
          essentialSupportExcludedAmount: 0,
          exclusionReason: "essential-support-not-included-setting",
          survivorIncomeOffsetApplied: false,
          survivorIncomeOffsetSuppressed: includeSurvivorIncomeOffset === true,
          inflation: excludedInflationTrace
        },
        sourcePaths: excludedInflationTrace.sourcePaths,
        survivorIncomeOffset: 0,
        supportDetails: {
          includeEssentialSupport: false,
          monthlySupportNeed: null,
          totalSupportMonths: needsSupportDurationYears * 12,
          annualTotalEssentialSupportCost: null,
          survivorNetAnnualIncome: null,
          monthlySurvivorIncome: 0,
          survivorIncomeStartDelayMonths: 0,
          incomeOffsetMonths: 0,
          supportNeedDuringDelay: 0,
          projectedSupportAfterIncomeStarts: 0,
          survivorIncomeDuringIncomeMonths: 0,
          monthlySupportGapAfterIncomeStarts: 0,
          supportNeedAfterIncomeStarts: 0,
          grossSupportNeed: 0,
          currentDollarGrossSupportNeed: 0,
          essentialSupportRawAmount: null,
          essentialSupportPreExclusionAmount: 0,
          essentialSupportIncludedAmount: 0,
          essentialSupportExcludedAmount: 0,
          essentialSupportExclusionReason: "essential-support-not-included-setting",
          survivorIncomeOffsetApplied: false,
          survivorIncomeOffsetSuppressed: includeSurvivorIncomeOffset === true,
          inflation: excludedInflationTrace
        }
      };
    }

    if (settings.allowIncomeFallback === true) {
      const incomeReplacementBase = normalizeNonNegativeNumber(
        getPath(model, "incomeBasis.annualIncomeReplacementBase"),
        "incomeBasis.annualIncomeReplacementBase",
        warnings,
        {
          negativeCode: "negative-value-treated-as-zero",
          negativeMessage: "annualIncomeReplacementBase was negative and was treated as 0 for Needs Analysis income fallback."
        }
      );

      if (incomeReplacementBase.hasValue) {
        addWarning(
          warnings,
          "essential-support-income-fallback-used",
          "Needs Analysis used annualIncomeReplacementBase because annualTotalEssentialSupportCost was missing and allowIncomeFallback was true.",
          "warning",
          ["ongoingSupport.annualTotalEssentialSupportCost", "incomeBasis.annualIncomeReplacementBase"]
        );

        return {
          value: incomeReplacementBase.value * needsSupportDurationYears,
          source: "incomeBasis.annualIncomeReplacementBase",
          formula: "annualIncomeReplacementBase x needsSupportDurationYears",
          inputs: {
            annualIncomeReplacementBase: incomeReplacementBase.value,
            needsSupportDurationYears
          },
          sourcePaths: ["incomeBasis.annualIncomeReplacementBase"]
        };
      }
    }

    addWarning(
      warnings,
      "missing-essential-support-cost",
      "annualTotalEssentialSupportCost was missing; Needs Analysis essential support component defaulted to 0.",
      "warning",
      ["ongoingSupport.annualTotalEssentialSupportCost"]
    );

    return {
      value: 0,
      source: "missing-default-zero",
      formula: "annualTotalEssentialSupportCost x needsSupportDurationYears",
      inputs: {
        annualTotalEssentialSupportCost: null,
        needsSupportDurationYears
      },
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
    };
  }

  function createDiscretionarySupportComponent(model, settings, needsSupportDurationYears, warnings) {
    const annualDiscretionarySupport = normalizeComponentNumber({
      value: getPath(model, "ongoingSupport.annualDiscretionaryPersonalSpending"),
      sourcePath: "ongoingSupport.annualDiscretionaryPersonalSpending",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-discretionary-support-cost",
      missingMessage: "annualDiscretionaryPersonalSpending was missing; discretionary support component defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "annualDiscretionaryPersonalSpending was negative and was treated as 0 for Needs Analysis."
    });
    const supportProjection = calculateDiscretionarySupportInflationProjection(
      annualDiscretionarySupport,
      needsSupportDurationYears,
      settings
    );

    return {
      value: supportProjection.projectedTotal,
      formula: supportProjection.applied
        ? "inflation-adjusted annualDiscretionaryPersonalSpending over needsSupportDurationYears"
        : "annualDiscretionaryPersonalSpending x needsSupportDurationYears",
      inputs: {
        annualDiscretionaryPersonalSpending: annualDiscretionarySupport,
        needsSupportDurationYears,
        includeDiscretionarySupport: true,
        inflation: supportProjection.trace
      },
      sourcePaths: supportProjection.trace.sourcePaths,
      inflation: supportProjection.trace
    };
  }

  function createExcludedDiscretionarySupportComponent(settings, needsSupportDurationYears) {
    const inflation = createExcludedDiscretionarySupportInflationTrace(
      settings,
      needsSupportDurationYears
    );

    return {
      value: 0,
      formula: "disabled by settings",
      inputs: {
        annualDiscretionaryPersonalSpending: null,
        needsSupportDurationYears,
        includeDiscretionarySupport: false,
        inflation
      },
      sourcePaths: [
        "ongoingSupport.annualDiscretionaryPersonalSpending",
        "settings.includeDiscretionarySupport"
      ],
      inflation
    };
  }

  function createAnnualDurationComponent(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const annualValue = normalizeComponentNumber({
      value: normalizedOptions.value,
      sourcePath: normalizedOptions.sourcePath,
      warnings: normalizedOptions.warnings,
      warnWhenMissing: normalizedOptions.warnWhenMissing === true,
      missingCode: normalizedOptions.missingCode,
      missingMessage: normalizedOptions.missingMessage,
      missingSeverity: normalizedOptions.missingSeverity || "info",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: normalizedOptions.negativeMessage
    });

    return annualValue * normalizedOptions.durationYears;
  }

  function runDimeAnalysis(lensModel, settings) {
    const model = isPlainObject(lensModel) ? lensModel : {};
    const normalizedSettings = isPlainObject(settings) ? settings : {};
    const warnings = [];
    const trace = [];
    const dimeIncomeYears = getDimeIncomeYears(normalizedSettings, warnings);
    const includeExistingCoverageOffset = getBooleanSetting(
      normalizedSettings,
      "includeExistingCoverageOffset",
      true
    );
    const includeOffsetAssets = normalizedSettings.includeOffsetAssets === true;

    if (!includeOffsetAssets) {
      addWarning(
        warnings,
        "offset-assets-disabled-by-default",
        "Offset assets were not applied because DIME only includes asset offsets when includeOffsetAssets is true.",
        "info",
        ["settings.includeOffsetAssets", TREATED_ASSET_OFFSET_SOURCE_PATH]
      );
    }

    const debtComponent = createDebtComponent(model, warnings);
    const annualIncomeReplacementBase = normalizeComponentNumber({
      value: getPath(model, "incomeBasis.annualIncomeReplacementBase"),
      sourcePath: "incomeBasis.annualIncomeReplacementBase",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-annual-income-replacement-base",
      missingMessage: "annualIncomeReplacementBase was missing; DIME income component defaulted to 0.",
      negativeCode: "negative-annual-income-replacement-base",
      negativeMessage: "annualIncomeReplacementBase was negative and was treated as 0 for DIME."
    });
    const income = annualIncomeReplacementBase * dimeIncomeYears;
    const mortgage = normalizeComponentNumber({
      value: getPath(model, "debtPayoff.mortgageBalance"),
      sourcePath: "debtPayoff.mortgageBalance",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-mortgage-balance",
      missingMessage: "mortgageBalance was missing; DIME mortgage component defaulted to 0.",
      negativeCode: "negative-mortgage-balance",
      negativeMessage: "mortgageBalance was negative and was treated as 0 for DIME."
    });
    const education = normalizeComponentNumber({
      value: getPath(model, "educationSupport.totalEducationFundingNeed"),
      sourcePath: "educationSupport.totalEducationFundingNeed",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-education-funding-need",
      missingMessage: "totalEducationFundingNeed was missing; DIME education component defaulted to 0.",
      negativeCode: "negative-education-funding-need",
      negativeMessage: "totalEducationFundingNeed was negative and was treated as 0 for DIME."
    });
    const existingCoverageOffsetSelection = resolveExistingCoverageOffsetSelection({
      model,
      warnings,
      includeExistingCoverageOffset,
      methodLabel: "DIME",
      rawMissingCode: "existing-coverage-missing",
      rawMissingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
      rawNegativeCode: "negative-existing-coverage",
      rawNegativeMessage: "totalExistingCoverage was negative and was treated as 0 for DIME."
    });
    const existingCoverageOffset = existingCoverageOffsetSelection.value;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      warnings,
      includeOffsetAssets,
      methodLabel: "DIME"
    });
    const assetOffset = assetOffsetSelection.value;

    const grossNeed = debtComponent.value + income + mortgage + education;
    const totalOffset = existingCoverageOffset + assetOffset;
    const rawUncappedGap = grossNeed - totalOffset;
    const netCoverageGap = Math.max(rawUncappedGap, 0);

    trace.push(createTraceRow({
      key: "debt",
      label: "Debt",
      formula: debtComponent.source === "explicit-non-mortgage-debt-fields"
        ? "Sum of non-mortgage debt fields"
        : "Fallback debt total minus mortgage when available",
      inputs: debtComponent.inputs,
      value: debtComponent.value,
      sourcePaths: debtComponent.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "income",
      label: "Income",
      formula: "annualIncomeReplacementBase x dimeIncomeYears",
      inputs: {
        annualIncomeReplacementBase,
        dimeIncomeYears
      },
      value: income,
      sourcePaths: ["incomeBasis.annualIncomeReplacementBase", "settings.dimeIncomeYears"]
    }));
    trace.push(createTraceRow({
      key: "mortgage",
      label: "Mortgage",
      formula: "mortgageBalance",
      inputs: {
        mortgageBalance: mortgage
      },
      value: mortgage,
      sourcePaths: ["debtPayoff.mortgageBalance"]
    }));
    trace.push(createTraceRow({
      key: "education",
      label: "Education",
      formula: "totalEducationFundingNeed",
      inputs: {
        totalEducationFundingNeed: education
      },
      value: education,
      sourcePaths: ["educationSupport.totalEducationFundingNeed"]
    }));
    trace.push(createTraceRow({
      key: "grossNeed",
      label: "Gross DIME Need",
      formula: "debt + income + mortgage + education",
      inputs: {
        debt: debtComponent.value,
        income,
        mortgage,
        education
      },
      value: grossNeed,
      sourcePaths: []
    }));
    trace.push(createTraceRow({
      key: "existingCoverageOffset",
      label: "Existing Coverage Offset",
      formula: existingCoverageOffsetSelection.formula,
      inputs: createExistingCoverageOffsetTraceInputs(model, existingCoverageOffsetSelection),
      value: existingCoverageOffset,
      sourcePaths: existingCoverageOffsetSelection.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "assetOffset",
      label: "Asset Offset",
      formula: assetOffsetSelection.formula,
      inputs: assetOffsetSelection.traceInputs,
      value: assetOffset,
      sourcePaths: assetOffsetSelection.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "netCoverageGap",
      label: "Net Coverage Gap",
      formula: "max(grossNeed - totalOffset, 0)",
      inputs: {
        grossNeed,
        totalOffset
      },
      value: netCoverageGap,
      sourcePaths: []
    }));

    const baseResult = {
      method: "dime",
      label: "DIME Analysis",
      grossNeed,
      netCoverageGap,
      rawUncappedGap,
      components: {
        debt: debtComponent.value,
        income,
        mortgage,
        education
      },
      commonOffsets: {
        existingCoverageOffset,
        assetOffset,
        totalOffset
      },
      assumptions: {
        dimeIncomeYears,
        includeExistingCoverageOffset,
        includeOffsetAssets,
        ...assetOffsetSelection.assumptionFields,
        debtComponentSource: debtComponent.source,
        incomeComponentSource: "incomeBasis.annualIncomeReplacementBase",
        mortgageComponentSource: "debtPayoff.mortgageBalance",
        educationComponentSource: "educationSupport.totalEducationFundingNeed"
      },
      warnings,
      trace
    };

    return applyOptionalRounding(baseResult, normalizedSettings, warnings);
  }

  function runNeedsAnalysis(lensModel, settings) {
    const model = isPlainObject(lensModel) ? lensModel : {};
    const normalizedSettings = isPlainObject(settings) ? settings : {};
    const warnings = [];
    const trace = [];
    const durationResult = resolveNeedsSupportDuration(normalizedSettings, warnings);
    const needsSupportDurationYears = durationResult.value;
    const includeExistingCoverageOffset = getBooleanSetting(
      normalizedSettings,
      "includeExistingCoverageOffset",
      true
    );
    const includeOffsetAssets = getBooleanSetting(normalizedSettings, "includeOffsetAssets", true);
    const includeTransitionNeeds = getBooleanSetting(normalizedSettings, "includeTransitionNeeds", true);
    const includeEssentialSupport = getBooleanSetting(normalizedSettings, "includeEssentialSupport", true);
    const includeDiscretionarySupport = normalizedSettings.includeDiscretionarySupport === true;
    const includeSurvivorIncomeOffset = getBooleanSetting(normalizedSettings, "includeSurvivorIncomeOffset", true);

    if (!includeEssentialSupport) {
      addWarning(
        warnings,
        "essential-support-disabled",
        "Essential support was not included because includeEssentialSupport is false.",
        "info",
        ["settings.includeEssentialSupport", "ongoingSupport.annualTotalEssentialSupportCost"]
      );
    }

    if (!includeDiscretionarySupport) {
      addWarning(
        warnings,
        "discretionary-support-disabled",
        "Discretionary support was not included because includeDiscretionarySupport is not true.",
        "info",
        ["settings.includeDiscretionarySupport", "ongoingSupport.annualDiscretionaryPersonalSpending"]
      );
    }

    if (!includeSurvivorIncomeOffset) {
      addWarning(
        warnings,
        "survivor-income-offset-disabled",
        "Survivor income was not applied inside essential support because includeSurvivorIncomeOffset is false.",
        "info",
        ["settings.includeSurvivorIncomeOffset", "survivorScenario.survivorNetAnnualIncome"]
      );
    }

    const debtPayoffComponent = createNeedsDebtPayoffComponent(model, warnings);
    const essentialSupportComponent = createEssentialSupportComponent(
      model,
      normalizedSettings,
      needsSupportDurationYears,
      includeSurvivorIncomeOffset,
      includeEssentialSupport,
      warnings
    );
    const educationComponent = createNeedsEducationComponent(
      model,
      normalizedSettings,
      warnings
    );
    const education = educationComponent.value;
    const finalExpenses = normalizeComponentNumber({
      value: getPath(model, "finalExpenses.totalFinalExpenseNeed"),
      sourcePath: "finalExpenses.totalFinalExpenseNeed",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-final-expense-need",
      missingMessage: "totalFinalExpenseNeed was missing; Needs Analysis final expenses component defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "totalFinalExpenseNeed was negative and was treated as 0 for Needs Analysis."
    });
    const transitionNeeds = includeTransitionNeeds
      ? normalizeComponentNumber({
          value: getPath(model, "transitionNeeds.totalTransitionNeed"),
          sourcePath: "transitionNeeds.totalTransitionNeed",
          warnings,
          warnWhenMissing: true,
          missingCode: "missing-transition-need",
          missingMessage: "totalTransitionNeed was missing; Needs Analysis transition needs component defaulted to 0.",
          negativeCode: "negative-value-treated-as-zero",
          negativeMessage: "totalTransitionNeed was negative and was treated as 0 for Needs Analysis."
        })
      : 0;
    const discretionarySupportComponent = includeDiscretionarySupport
      ? createDiscretionarySupportComponent(
          model,
          normalizedSettings,
          needsSupportDurationYears,
          warnings
        )
      : createExcludedDiscretionarySupportComponent(
          normalizedSettings,
          needsSupportDurationYears
        );
    const discretionarySupport = discretionarySupportComponent.value;

    const existingCoverageOffsetSelection = resolveExistingCoverageOffsetSelection({
      model,
      warnings,
      includeExistingCoverageOffset,
      methodLabel: "Needs Analysis",
      rawMissingCode: "missing-existing-coverage",
      rawMissingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
      rawNegativeCode: "negative-value-treated-as-zero",
      rawNegativeMessage: "totalExistingCoverage was negative and was treated as 0 for Needs Analysis."
    });
    const existingCoverageOffset = existingCoverageOffsetSelection.value;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      warnings,
      includeOffsetAssets,
      methodLabel: "Needs Analysis"
    });
    const assetOffset = assetOffsetSelection.value;
    const survivorIncomeOffset = essentialSupportComponent.survivorIncomeOffset || 0;
    const supportDetails = essentialSupportComponent.supportDetails || {};

    const grossNeed = debtPayoffComponent.value
      + essentialSupportComponent.value
      + education
      + finalExpenses
      + transitionNeeds
      + discretionarySupport;
    const totalOffset = existingCoverageOffset + assetOffset;
    const rawUncappedGap = grossNeed - totalOffset;
    const netCoverageGap = Math.max(rawUncappedGap, 0);

    trace.push(createTraceRow({
      key: "debtPayoff",
      label: "Debt Payoff",
      formula: debtPayoffComponent.source === "debtPayoff.totalDebtPayoffNeed"
        ? "debtPayoff.totalDebtPayoffNeed"
        : "Sum of available debt payoff fields",
      inputs: debtPayoffComponent.inputs,
      value: debtPayoffComponent.value,
      sourcePaths: debtPayoffComponent.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "essentialSupport",
      label: "Essential Support",
      formula: essentialSupportComponent.formula,
      inputs: essentialSupportComponent.inputs,
      value: essentialSupportComponent.value,
      sourcePaths: essentialSupportComponent.sourcePaths
    }));
    if (supportDetails.inflation) {
      trace.push(createTraceRow({
        key: "essentialSupportInflation",
        label: "Essential Support Inflation",
        formula: supportDetails.inflation.included === false
          ? "disabled by settings"
          : (supportDetails.inflation.applied
              ? "project annualTotalEssentialSupportCost by household expense inflation over needsSupportDurationYears"
              : "current-dollar essential support total used"),
        inputs: {
          component: "essential support",
          inflationEnabled: supportDetails.inflation.enabled,
          inflationApplied: supportDetails.inflation.applied,
          baseAnnualAmount: supportDetails.inflation.baseAnnualAmount,
          durationYears: supportDetails.inflation.durationYears,
          ratePercent: supportDetails.inflation.ratePercent,
          rateSource: supportDetails.inflation.rateSource,
          currentDollarTotal: supportDetails.inflation.currentDollarTotal,
          projectedTotal: supportDetails.inflation.projectedTotal,
          included: supportDetails.inflation.included,
          includeEssentialSupport: supportDetails.inflation.includeEssentialSupport,
          essentialSupportRawAmount: supportDetails.inflation.essentialSupportRawAmount,
          essentialSupportPreExclusionAmount: supportDetails.inflation.essentialSupportPreExclusionAmount,
          essentialSupportIncludedAmount: supportDetails.inflation.essentialSupportIncludedAmount,
          essentialSupportExcludedAmount: supportDetails.inflation.essentialSupportExcludedAmount,
          exclusionReason: supportDetails.inflation.exclusionReason,
          survivorIncomeOffsetApplied: supportDetails.inflation.survivorIncomeOffsetApplied,
          survivorIncomeOffsetSuppressed: supportDetails.inflation.survivorIncomeOffsetSuppressed,
          reason: supportDetails.inflation.reason,
          helperWarnings: supportDetails.inflation.helperWarnings
        },
        value: supportDetails.inflation.included === false
          ? supportDetails.inflation.essentialSupportIncludedAmount
          : supportDetails.inflation.projectedTotal,
        sourcePaths: supportDetails.inflation.sourcePaths
      }));
    }
    trace.push(createTraceRow({
      key: "grossAnnualHouseholdSupportNeed",
      label: "Gross Annual Household Support Need",
      formula: "ongoingSupport.annualTotalEssentialSupportCost",
      inputs: {
        includeEssentialSupport,
        annualTotalEssentialSupportCost: supportDetails.annualTotalEssentialSupportCost == null
          ? null
          : supportDetails.annualTotalEssentialSupportCost
      },
      value: supportDetails.annualTotalEssentialSupportCost == null
        ? null
        : supportDetails.annualTotalEssentialSupportCost,
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost"]
    }));
    trace.push(createTraceRow({
      key: "supportDuration",
      label: "Support Duration",
      formula: "needsSupportDurationYears x 12",
      inputs: {
        needsSupportDurationYears
      },
      value: supportDetails.totalSupportMonths == null ? null : supportDetails.totalSupportMonths,
      sourcePaths: ["settings.needsSupportDurationYears"]
    }));
    trace.push(createTraceRow({
      key: "survivorNetAnnualIncomeForSupport",
      label: "Survivor Net Annual Income",
      formula: includeEssentialSupport === false
        ? "suppressed because essential support is excluded"
        : (includeSurvivorIncomeOffset
            ? "survivorScenario.survivorNetAnnualIncome"
            : "disabled by settings"),
      inputs: {
        includeEssentialSupport,
        includeSurvivorIncomeOffset
      },
      value: supportDetails.survivorNetAnnualIncome == null ? null : supportDetails.survivorNetAnnualIncome,
      sourcePaths: [
        "survivorScenario.survivorNetAnnualIncome",
        "settings.includeSurvivorIncomeOffset",
        "settings.includeEssentialSupport"
      ]
    }));
    trace.push(createTraceRow({
      key: "survivorIncomeStartDelayMonths",
      label: "Survivor Income Start Delay",
      formula: "clamp(survivorIncomeStartDelayMonths, 0, totalSupportMonths)",
      inputs: {
        totalSupportMonths: supportDetails.totalSupportMonths
      },
      value: supportDetails.survivorIncomeStartDelayMonths == null
        ? null
        : supportDetails.survivorIncomeStartDelayMonths,
      sourcePaths: ["survivorScenario.survivorIncomeStartDelayMonths"]
    }));
    trace.push(createTraceRow({
      key: "supportNeedDuringSurvivorIncomeDelay",
      label: "Support Need During Survivor Income Delay",
      formula: "monthlySupportNeed x survivorIncomeStartDelayMonths",
      inputs: {
        monthlySupportNeed: supportDetails.monthlySupportNeed,
        survivorIncomeStartDelayMonths: supportDetails.survivorIncomeStartDelayMonths
      },
      value: supportDetails.supportNeedDuringDelay == null ? null : supportDetails.supportNeedDuringDelay,
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost", "survivorScenario.survivorIncomeStartDelayMonths"]
    }));
    trace.push(createTraceRow({
      key: "supportGapAfterSurvivorIncomeStarts",
      label: "Support Gap After Survivor Income Starts",
      formula: "max(monthlySupportNeed - monthlySurvivorIncome, 0)",
      inputs: {
        monthlySupportNeed: supportDetails.monthlySupportNeed,
        monthlySurvivorIncome: supportDetails.monthlySurvivorIncome
      },
      value: supportDetails.monthlySupportGapAfterIncomeStarts == null
        ? null
        : supportDetails.monthlySupportGapAfterIncomeStarts,
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost", "survivorScenario.survivorNetAnnualIncome"]
    }));
    trace.push(createTraceRow({
      key: "supportNeedAfterSurvivorIncomeStarts",
      label: "Support Need After Survivor Income Starts",
      formula: "monthlySupportGapAfterIncomeStarts x incomeOffsetMonths",
      inputs: {
        monthlySupportGapAfterIncomeStarts: supportDetails.monthlySupportGapAfterIncomeStarts,
        incomeOffsetMonths: supportDetails.incomeOffsetMonths
      },
      value: supportDetails.supportNeedAfterIncomeStarts == null
        ? null
        : supportDetails.supportNeedAfterIncomeStarts,
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost", "survivorScenario.survivorNetAnnualIncome"]
    }));
    trace.push(createTraceRow({
      key: "education",
      label: "Education",
      formula: educationComponent.formula,
      inputs: educationComponent.inputs,
      value: education,
      sourcePaths: educationComponent.sourcePaths
    }));
    if (educationComponent.inflation) {
      trace.push(createTraceRow({
        key: "educationFundingInflation",
        label: "Education Funding Inflation",
        formula: educationComponent.inflation.applied
          ? "project current dated child lump-sum education funding to educationStartAge"
          : "current-dollar education funding total used",
        inputs: {
          component: "education funding",
          includeEducationFundingSetting: educationComponent.inflation.includeEducationFundingSetting,
          includeProjectedDependentsSetting: educationComponent.inflation.includeProjectedDependentsSetting,
          educationFundingExcluded: educationComponent.inflation.educationFundingExcluded,
          educationExcludedReason: educationComponent.inflation.educationExcludedReason,
          enabled: educationComponent.inflation.enabled,
          applied: educationComponent.inflation.applied,
          currentDatedChildCount: educationComponent.inflation.currentDatedChildCount,
          plannedDependentCount: educationComponent.inflation.plannedDependentCount,
          currentDollarCurrentChildTotal: educationComponent.inflation.currentDollarCurrentChildTotal,
          projectedCurrentChildTotal: educationComponent.inflation.projectedCurrentChildTotal,
          currentChildEducationIncludedAmount: educationComponent.inflation.currentChildEducationIncludedAmount,
          currentDollarPlannedDependentTotal: educationComponent.inflation.currentDollarPlannedDependentTotal,
          plannedDependentEducationIncludedAmount: educationComponent.inflation.plannedDependentEducationIncludedAmount,
          plannedDependentEducationExcludedAmount: educationComponent.inflation.plannedDependentEducationExcludedAmount,
          plannedDependentEducationStatus: educationComponent.inflation.plannedDependentEducationStatus,
          combinedEducationTotalUsed: educationComponent.inflation.combinedEducationTotalUsed,
          educationStartAge: educationComponent.inflation.educationStartAge,
          asOfDate: educationComponent.inflation.asOfDate,
          asOfDateSource: educationComponent.inflation.asOfDateSource,
          valuationDate: educationComponent.inflation.valuationDate,
          valuationDateSource: educationComponent.inflation.valuationDateSource,
          valuationDateDefaulted: educationComponent.inflation.valuationDateDefaulted,
          valuationDateWarningCode: educationComponent.inflation.valuationDateWarningCode,
          ratePercent: educationComponent.inflation.ratePercent,
          rateSource: educationComponent.inflation.rateSource,
          childRows: educationComponent.inflation.childRows,
          currentEducationProjectionStatus: educationComponent.inflation.currentEducationProjectionStatus,
          helperWarnings: educationComponent.inflation.helperWarnings,
          reason: educationComponent.inflation.reason
        },
        value: educationComponent.inflation.combinedEducationTotalUsed,
        sourcePaths: educationComponent.inflation.sourcePaths
      }));
    }
    trace.push(createTraceRow({
      key: "finalExpenses",
      label: "Final Expenses",
      formula: "finalExpenses.totalFinalExpenseNeed",
      inputs: {
        totalFinalExpenseNeed: finalExpenses
      },
      value: finalExpenses,
      sourcePaths: ["finalExpenses.totalFinalExpenseNeed"]
    }));
    trace.push(createTraceRow({
      key: "transitionNeeds",
      label: "Transition Needs",
      formula: includeTransitionNeeds ? "transitionNeeds.totalTransitionNeed" : "disabled by settings",
      inputs: {
        includeTransitionNeeds
      },
      value: transitionNeeds,
      sourcePaths: ["transitionNeeds.totalTransitionNeed", "settings.includeTransitionNeeds"]
    }));
    trace.push(createTraceRow({
      key: "discretionarySupport",
      label: "Discretionary Support",
      formula: discretionarySupportComponent.formula,
      inputs: discretionarySupportComponent.inputs,
      value: discretionarySupport,
      sourcePaths: discretionarySupportComponent.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "discretionarySupportInflation",
      label: "Discretionary Support Inflation",
      formula: discretionarySupportComponent.inflation.included
        ? (discretionarySupportComponent.inflation.applied
            ? "project annualDiscretionaryPersonalSpending by household expense inflation over needsSupportDurationYears"
            : "current-dollar discretionary support total used")
        : "disabled by settings",
      inputs: {
        component: "discretionary support",
        included: discretionarySupportComponent.inflation.included,
        inflationEnabled: discretionarySupportComponent.inflation.enabled,
        inflationApplied: discretionarySupportComponent.inflation.applied,
        baseAnnualAmount: discretionarySupportComponent.inflation.baseAnnualAmount,
        durationYears: discretionarySupportComponent.inflation.durationYears,
        ratePercent: discretionarySupportComponent.inflation.ratePercent,
        rateSource: discretionarySupportComponent.inflation.rateSource,
        currentDollarTotal: discretionarySupportComponent.inflation.currentDollarTotal,
        projectedTotal: discretionarySupportComponent.inflation.projectedTotal,
        reason: discretionarySupportComponent.inflation.reason,
        helperWarnings: discretionarySupportComponent.inflation.helperWarnings
      },
      value: discretionarySupportComponent.inflation.projectedTotal,
      sourcePaths: discretionarySupportComponent.inflation.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "existingCoverageOffset",
      label: "Existing Coverage Offset",
      formula: existingCoverageOffsetSelection.formula,
      inputs: createExistingCoverageOffsetTraceInputs(model, existingCoverageOffsetSelection),
      value: existingCoverageOffset,
      sourcePaths: existingCoverageOffsetSelection.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "assetOffset",
      label: "Asset Offset",
      formula: assetOffsetSelection.formula,
      inputs: assetOffsetSelection.traceInputs,
      value: assetOffset,
      sourcePaths: assetOffsetSelection.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "survivorIncomeOffset",
      label: "Survivor Income Offset",
      formula: includeSurvivorIncomeOffset
        ? (includeEssentialSupport
            ? "applied inside essential support; not added to totalOffset"
            : "suppressed because essential support is excluded")
        : "disabled by settings",
      inputs: {
        survivorNetAnnualIncome: supportDetails.survivorNetAnnualIncome,
        survivorIncomeStartDelayMonths: supportDetails.survivorIncomeStartDelayMonths,
        incomeOffsetMonths: supportDetails.incomeOffsetMonths,
        includeEssentialSupport,
        includeSurvivorIncomeOffset,
        essentialSupportExcluded: includeEssentialSupport === false,
        survivorIncomeOffsetApplied: supportDetails.survivorIncomeOffsetApplied === true,
        survivorIncomeOffsetSuppressed: supportDetails.survivorIncomeOffsetSuppressed === true,
        includedInTotalOffset: false
      },
      value: survivorIncomeOffset,
      sourcePaths: [
        "survivorScenario.survivorNetAnnualIncome",
        "settings.includeSurvivorIncomeOffset",
        "settings.includeEssentialSupport"
      ]
    }));
    trace.push(createTraceRow({
      key: "grossNeed",
      label: "Gross Need",
      formula: "debtPayoff + essentialSupport + education + finalExpenses + transitionNeeds + discretionarySupport",
      inputs: {
        debtPayoff: debtPayoffComponent.value,
        essentialSupport: essentialSupportComponent.value,
        education,
        finalExpenses,
        transitionNeeds,
        discretionarySupport
      },
      value: grossNeed,
      sourcePaths: []
    }));
    trace.push(createTraceRow({
      key: "netCoverageGap",
      label: "Net Coverage Gap",
      formula: "max(grossNeed - totalOffset, 0)",
      inputs: {
        grossNeed,
        totalOffset
      },
      value: netCoverageGap,
      sourcePaths: []
    }));

    const baseResult = {
      method: "needsAnalysis",
      label: "Needs Analysis",
      grossNeed,
      netCoverageGap,
      rawUncappedGap,
      components: {
        debtPayoff: debtPayoffComponent.value,
        essentialSupport: essentialSupportComponent.value,
        education,
        finalExpenses,
        transitionNeeds,
        discretionarySupport
      },
      commonOffsets: {
        existingCoverageOffset,
        assetOffset,
        survivorIncomeOffset,
        totalOffset
      },
      assumptions: {
        needsSupportDurationYears,
        supportDurationSource: durationResult.source,
        includeExistingCoverageOffset,
        includeOffsetAssets,
        ...assetOffsetSelection.assumptionFields,
        includeEssentialSupport,
        includeTransitionNeeds,
        includeDiscretionarySupport,
        includeSurvivorIncomeOffset,
        valuationDate: educationComponent.inflation?.valuationDate || normalizedSettings.valuationDate || null,
        valuationDateSource: educationComponent.inflation?.valuationDateSource || normalizedSettings.valuationDateSource || null,
        valuationDateDefaulted: educationComponent.inflation?.valuationDateDefaulted === true
          || normalizedSettings.valuationDateDefaulted === true,
        valuationDateWarningCode: educationComponent.inflation?.valuationDateWarningCode
          || normalizedSettings.valuationDateWarningCode
          || null,
        survivorIncomeStartDelayMonths: supportDetails.survivorIncomeStartDelayMonths == null
          ? null
          : supportDetails.survivorIncomeStartDelayMonths,
        survivorIncomeAppliedInsideSupport: includeSurvivorIncomeOffset,
        survivorIncomeGrowthApplied: false,
        survivorIncomeOffsetIncludedInTotalOffset: false
      },
      warnings,
      trace
    };

    return applyOptionalRounding(baseResult, normalizedSettings, warnings);
  }

  function runHumanLifeValueAnalysis(lensModel, settings) {
    const model = isPlainObject(lensModel) ? lensModel : {};
    const normalizedSettings = isPlainObject(settings) ? settings : {};
    const warnings = [];
    const trace = [];
    const includeExistingCoverageOffset = getBooleanSetting(
      normalizedSettings,
      "includeExistingCoverageOffset",
      true
    );
    const includeOffsetAssets = normalizedSettings.includeOffsetAssets === true;

    if (!includeOffsetAssets) {
      addWarning(
        warnings,
        "offset-assets-disabled-by-default",
        "Offset assets were not applied because Simple HLV only includes asset offsets when includeOffsetAssets is true.",
        "info",
        ["settings.includeOffsetAssets", TREATED_ASSET_OFFSET_SOURCE_PATH]
      );
    }

    const annualIncomeValue = normalizeComponentNumber({
      value: getPath(model, "incomeBasis.annualIncomeReplacementBase"),
      sourcePath: "incomeBasis.annualIncomeReplacementBase",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-annual-income-replacement-base",
      missingMessage: "annualIncomeReplacementBase was missing; Simple HLV annual income value defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "annualIncomeReplacementBase was negative and was treated as 0 for Simple HLV."
    });
    const projectionYearsResult = resolveHlvProjectionYears(model, normalizedSettings, warnings);
    const projectionYears = projectionYearsResult.value;
    const grossHumanLifeValue = annualIncomeValue * projectionYears;
    const grossNeed = grossHumanLifeValue;
    const incomeGrowthRate = toOptionalNumber(
      getPath(model, "assumptions.economicAssumptions.incomeGrowthRatePercent")
    );
    const discountRate = toOptionalNumber(
      getPath(model, "assumptions.economicAssumptions.discountRatePercent")
    );

    if (incomeGrowthRate != null) {
      addWarning(
        warnings,
        "income-growth-not-applied-v1",
        "Income growth is captured but not applied to Simple HLV.",
        "info",
        ["assumptions.economicAssumptions.incomeGrowthRatePercent"]
      );
    }

    if (discountRate == null) {
      addWarning(
        warnings,
        "discount-rate-unavailable-simple-hlv",
        "Simple HLV does not apply discounting because no active discount-rate control is available.",
        "info",
        ["assumptions.economicAssumptions.discountRatePercent"]
      );
    } else {
      addWarning(
        warnings,
        "discount-rate-unavailable-simple-hlv",
        "A discount rate is present but Simple HLV does not apply present-value discounting in v1.",
        "info",
        ["assumptions.economicAssumptions.discountRatePercent"]
      );
    }

    const existingCoverageOffsetSelection = resolveExistingCoverageOffsetSelection({
      model,
      warnings,
      includeExistingCoverageOffset,
      methodLabel: "Simple HLV",
      rawMissingCode: "existing-coverage-missing",
      rawMissingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
      rawNegativeCode: "negative-value-treated-as-zero",
      rawNegativeMessage: "totalExistingCoverage was negative and was treated as 0 for Simple HLV."
    });
    const existingCoverageOffset = existingCoverageOffsetSelection.value;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      warnings,
      includeOffsetAssets,
      methodLabel: "Simple HLV"
    });
    const assetOffset = assetOffsetSelection.value;
    const totalOffset = existingCoverageOffset + assetOffset;
    const rawUncappedGap = grossHumanLifeValue - totalOffset;
    const netCoverageGap = Math.max(rawUncappedGap, 0);

    trace.push(createTraceRow({
      key: "annualIncomeValue",
      label: "Annual Income Value",
      formula: "incomeBasis.annualIncomeReplacementBase",
      inputs: {
        annualIncomeReplacementBase: annualIncomeValue
      },
      value: annualIncomeValue,
      sourcePaths: ["incomeBasis.annualIncomeReplacementBase"]
    }));
    trace.push(createTraceRow({
      key: "projectionYears",
      label: "Projection Years",
      formula: projectionYearsResult.source === "settings"
        ? "settings.hlvProjectionYears"
        : "incomeBasis.insuredRetirementHorizonYears",
      inputs: {
        hlvProjectionYears: hasOwn(normalizedSettings, "hlvProjectionYears")
          ? normalizedSettings.hlvProjectionYears
          : null,
        insuredRetirementHorizonYears: getPath(model, "incomeBasis.insuredRetirementHorizonYears")
      },
      value: projectionYears,
      sourcePaths: projectionYearsResult.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "grossHumanLifeValue",
      label: "Gross Simple HLV",
      formula: "annualIncomeValue x projectionYears",
      inputs: {
        annualIncomeValue,
        projectionYears
      },
      value: grossHumanLifeValue,
      sourcePaths: ["incomeBasis.annualIncomeReplacementBase", ...projectionYearsResult.sourcePaths]
    }));
    trace.push(createTraceRow({
      key: "existingCoverageOffset",
      label: "Existing Coverage Offset",
      formula: existingCoverageOffsetSelection.formula,
      inputs: createExistingCoverageOffsetTraceInputs(model, existingCoverageOffsetSelection),
      value: existingCoverageOffset,
      sourcePaths: existingCoverageOffsetSelection.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "assetOffset",
      label: "Asset Offset",
      formula: assetOffsetSelection.formula,
      inputs: assetOffsetSelection.traceInputs,
      value: assetOffset,
      sourcePaths: assetOffsetSelection.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "netCoverageGap",
      label: "Net Coverage Gap",
      formula: "max(grossHumanLifeValue - totalOffset, 0)",
      inputs: {
        grossHumanLifeValue,
        totalOffset
      },
      value: netCoverageGap,
      sourcePaths: []
    }));

    return {
      method: "humanLifeValue",
      label: "Simple Human Life Value",
      grossHumanLifeValue,
      // Alias for shared method display contracts that expect a grossNeed key.
      grossNeed,
      netCoverageGap,
      rawUncappedGap,
      components: {
        annualIncomeValue,
        projectionYears,
        simpleHumanLifeValue: grossHumanLifeValue
      },
      commonOffsets: {
        existingCoverageOffset,
        assetOffset,
        totalOffset
      },
      assumptions: {
        incomeValueSource: "incomeBasis.annualIncomeReplacementBase",
        projectionYears,
        projectionYearsSource: projectionYearsResult.source,
        includeExistingCoverageOffset,
        includeOffsetAssets,
        ...assetOffsetSelection.assumptionFields,
        incomeGrowthApplied: false,
        discountRateApplied: false,
        survivorIncomeApplied: false
      },
      warnings,
      trace
    };
  }

  function runAnalysisMethods(lensModel, settings) {
    return {
      dime: runDimeAnalysis(lensModel, settings),
      needsAnalysis: runNeedsAnalysis(lensModel, settings),
      humanLifeValue: runHumanLifeValueAnalysis(lensModel, settings)
    };
  }

  const analysisMethods = {
    runDimeAnalysis,
    runNeedsAnalysis,
    runHumanLifeValueAnalysis,
    runAnalysisMethods
  };

  lensAnalysis.analysisMethods = Object.assign(
    lensAnalysis.analysisMethods || {},
    analysisMethods
  );
})(window);
