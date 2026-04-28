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
  const ASSET_OFFSET_SOURCE_LEGACY = "legacy";
  const ASSET_OFFSET_SOURCE_TREATED = "treated";
  const ASSET_OFFSET_SOURCE_DISABLED = "disabled";
  const ASSET_OFFSET_SOURCE_LEGACY_FALLBACK = "legacy-fallback";
  const ASSET_OFFSET_SOURCE_ZERO = "zero";
  const LEGACY_ASSET_OFFSET_SOURCE_PATH = "offsetAssets.totalAvailableOffsetAssetValue";
  const TREATED_ASSET_OFFSET_SOURCE_PATH = "treatedAssetOffsets.totalTreatedAssetValue";

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

  function getAssetOffsetSourceSetting(settings) {
    const value = String(settings?.assetOffsetSource || ASSET_OFFSET_SOURCE_LEGACY).trim().toLowerCase();
    return value === ASSET_OFFSET_SOURCE_TREATED ? ASSET_OFFSET_SOURCE_TREATED : ASSET_OFFSET_SOURCE_LEGACY;
  }

  function getFallbackToLegacyOffsetAssetsSetting(settings) {
    return getBooleanSetting(settings, "fallbackToLegacyOffsetAssets", true);
  }

  function hasNumericAssetOffset(value) {
    return toOptionalNumber(value) != null;
  }

  function createAssetOffsetSelectionResult(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const includeOffsetAssets = normalizedOptions.includeOffsetAssets === true;
    const requestedAssetOffsetSource = normalizedOptions.requestedAssetOffsetSource || ASSET_OFFSET_SOURCE_LEGACY;
    const effectiveAssetOffsetSource = normalizedOptions.effectiveAssetOffsetSource || ASSET_OFFSET_SOURCE_LEGACY;
    const fallbackToLegacyOffsetAssets = normalizedOptions.fallbackToLegacyOffsetAssets === true;
    const fallbackUsed = normalizedOptions.fallbackUsed === true;
    const sourcePath = normalizedOptions.sourcePath || null;
    const sourcePaths = sourcePath
      ? [
          sourcePath,
          "settings.includeOffsetAssets",
          "settings.assetOffsetSource",
          "settings.fallbackToLegacyOffsetAssets"
        ]
      : [
          "settings.includeOffsetAssets",
          "settings.assetOffsetSource",
          "settings.fallbackToLegacyOffsetAssets"
        ];
    const value = normalizedOptions.value == null ? 0 : normalizedOptions.value;

    return {
      value,
      formula: includeOffsetAssets && sourcePath ? sourcePath : "disabled by settings",
      sourcePath,
      sourcePaths,
      traceInputs: {
        includeOffsetAssets,
        assetOffsetSource: requestedAssetOffsetSource,
        requestedAssetOffsetSource,
        effectiveAssetOffsetSource,
        fallbackToLegacyOffsetAssets,
        fallbackUsed,
        selectedAssetOffsetValue: value,
        treatedAssetOffsetsAvailable: normalizedOptions.treatedAssetOffsetsAvailable === true,
        legacyOffsetAssetsAvailable: normalizedOptions.legacyOffsetAssetsAvailable === true
      },
      assumptionFields: {
        assetOffsetSource: requestedAssetOffsetSource,
        effectiveAssetOffsetSource,
        fallbackToLegacyOffsetAssets,
        assetOffsetFallbackUsed: fallbackUsed
      }
    };
  }

  function resolveAssetOffsetSelection(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const model = isPlainObject(normalizedOptions.model) ? normalizedOptions.model : {};
    const settings = isPlainObject(normalizedOptions.settings) ? normalizedOptions.settings : {};
    const warnings = Array.isArray(normalizedOptions.warnings) ? normalizedOptions.warnings : [];
    const includeOffsetAssets = normalizedOptions.includeOffsetAssets === true;
    const requestedAssetOffsetSource = getAssetOffsetSourceSetting(settings);
    const fallbackToLegacyOffsetAssets = getFallbackToLegacyOffsetAssetsSetting(settings);
    const methodLabel = normalizedOptions.methodLabel || "analysis";
    const legacyRawValue = getPath(model, LEGACY_ASSET_OFFSET_SOURCE_PATH);
    const treatedRawValue = getPath(model, TREATED_ASSET_OFFSET_SOURCE_PATH);
    const legacyOffsetAssetsAvailable = hasNumericAssetOffset(legacyRawValue);
    const treatedAssetOffsetsAvailable = hasNumericAssetOffset(treatedRawValue);

    function createResult(resultOptions) {
      return createAssetOffsetSelectionResult({
        includeOffsetAssets,
        requestedAssetOffsetSource,
        fallbackToLegacyOffsetAssets,
        treatedAssetOffsetsAvailable,
        legacyOffsetAssetsAvailable,
        ...resultOptions
      });
    }

    function normalizeLegacyOffset(effectiveAssetOffsetSource, fallbackUsed) {
      const value = normalizeComponentNumber({
        value: legacyRawValue,
        sourcePath: LEGACY_ASSET_OFFSET_SOURCE_PATH,
        warnings,
        warnWhenMissing: true,
        missingCode: normalizedOptions.legacyMissingCode || "offset-assets-missing",
        missingMessage: normalizedOptions.legacyMissingMessage || "totalAvailableOffsetAssetValue was missing; asset offset defaulted to 0.",
        missingSeverity: "info",
        negativeCode: normalizedOptions.legacyNegativeCode || "negative-value-treated-as-zero",
        negativeMessage: normalizedOptions.legacyNegativeMessage || "totalAvailableOffsetAssetValue was negative and was treated as 0."
      });

      return createResult({
        value,
        sourcePath: LEGACY_ASSET_OFFSET_SOURCE_PATH,
        effectiveAssetOffsetSource,
        fallbackUsed
      });
    }

    if (!includeOffsetAssets) {
      return createResult({
        value: 0,
        sourcePath: null,
        effectiveAssetOffsetSource: ASSET_OFFSET_SOURCE_DISABLED,
        fallbackUsed: false
      });
    }

    if (requestedAssetOffsetSource === ASSET_OFFSET_SOURCE_TREATED) {
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
          fallbackUsed: false
        });
      }

      if (fallbackToLegacyOffsetAssets) {
        addWarning(
          warnings,
          "treated-offset-assets-missing-legacy-fallback",
          "treatedAssetOffsets.totalTreatedAssetValue was missing; asset offset fell back to legacy offsetAssets.",
          "info",
          [TREATED_ASSET_OFFSET_SOURCE_PATH, "settings.assetOffsetSource", "settings.fallbackToLegacyOffsetAssets"]
        );
        return normalizeLegacyOffset(ASSET_OFFSET_SOURCE_LEGACY_FALLBACK, true);
      }

      addWarning(
        warnings,
        "treated-offset-assets-missing-no-fallback",
        "treatedAssetOffsets.totalTreatedAssetValue was missing and legacy fallback was disabled; asset offset defaulted to 0.",
        "info",
        [TREATED_ASSET_OFFSET_SOURCE_PATH, "settings.assetOffsetSource", "settings.fallbackToLegacyOffsetAssets"]
      );
      return createResult({
        value: 0,
        sourcePath: TREATED_ASSET_OFFSET_SOURCE_PATH,
        effectiveAssetOffsetSource: ASSET_OFFSET_SOURCE_ZERO,
        fallbackUsed: false
      });
    }

    return normalizeLegacyOffset(ASSET_OFFSET_SOURCE_LEGACY, false);
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

  function createEssentialSupportComponent(model, settings, needsSupportDurationYears, includeSurvivorIncomeOffset, warnings) {
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

      if (!includeSurvivorIncomeOffset) {
        return {
          value: grossSupportNeed,
          source: "ongoingSupport.annualTotalEssentialSupportCost",
          formula: essentialSupportFormula,
          inputs: {
            annualTotalEssentialSupportCost: annualSupport.value,
            needsSupportDurationYears,
            includeSurvivorIncomeOffset,
            inflation: supportProjection.trace
          },
          sourcePaths: supportProjection.trace.sourcePaths,
          survivorIncomeOffset: 0,
          supportDetails: {
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
          inflation: supportProjection.trace
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
        ["settings.includeOffsetAssets", "offsetAssets.totalAvailableOffsetAssetValue"]
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
    const existingCoverageOffset = includeExistingCoverageOffset
      ? normalizeComponentNumber({
          value: getPath(model, "existingCoverage.totalExistingCoverage"),
          sourcePath: "existingCoverage.totalExistingCoverage",
          warnings,
          warnWhenMissing: true,
          missingCode: "existing-coverage-missing",
          missingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
          missingSeverity: "info",
          negativeCode: "negative-existing-coverage",
          negativeMessage: "totalExistingCoverage was negative and was treated as 0 for DIME."
        })
      : 0;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      settings: normalizedSettings,
      warnings,
      includeOffsetAssets,
      methodLabel: "DIME",
      legacyMissingCode: "offset-assets-missing",
      legacyMissingMessage: "totalAvailableOffsetAssetValue was missing; asset offset defaulted to 0.",
      legacyNegativeCode: "negative-offset-assets",
      legacyNegativeMessage: "totalAvailableOffsetAssetValue was negative and was treated as 0 for DIME."
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
      formula: includeExistingCoverageOffset
        ? "existingCoverage.totalExistingCoverage"
        : "disabled by settings",
      inputs: {
        includeExistingCoverageOffset
      },
      value: existingCoverageOffset,
      sourcePaths: ["existingCoverage.totalExistingCoverage", "settings.includeExistingCoverageOffset"]
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
    const includeDiscretionarySupport = normalizedSettings.includeDiscretionarySupport === true;
    const includeSurvivorIncomeOffset = getBooleanSetting(normalizedSettings, "includeSurvivorIncomeOffset", true);

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
      warnings
    );
    const education = normalizeComponentNumber({
      value: getPath(model, "educationSupport.totalEducationFundingNeed"),
      sourcePath: "educationSupport.totalEducationFundingNeed",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-education-funding-need",
      missingMessage: "totalEducationFundingNeed was missing; Needs Analysis education component defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "totalEducationFundingNeed was negative and was treated as 0 for Needs Analysis."
    });
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

    const existingCoverageOffset = includeExistingCoverageOffset
      ? normalizeComponentNumber({
          value: getPath(model, "existingCoverage.totalExistingCoverage"),
          sourcePath: "existingCoverage.totalExistingCoverage",
          warnings,
          warnWhenMissing: true,
          missingCode: "missing-existing-coverage",
          missingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
          missingSeverity: "info",
          negativeCode: "negative-value-treated-as-zero",
          negativeMessage: "totalExistingCoverage was negative and was treated as 0 for Needs Analysis."
        })
      : 0;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      settings: normalizedSettings,
      warnings,
      includeOffsetAssets,
      methodLabel: "Needs Analysis",
      legacyMissingCode: "missing-offset-assets",
      legacyMissingMessage: "totalAvailableOffsetAssetValue was missing; asset offset defaulted to 0.",
      legacyNegativeCode: "negative-value-treated-as-zero",
      legacyNegativeMessage: "totalAvailableOffsetAssetValue was negative and was treated as 0 for Needs Analysis."
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
        formula: supportDetails.inflation.applied
          ? "project annualTotalEssentialSupportCost by household expense inflation over needsSupportDurationYears"
          : "current-dollar essential support total used",
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
          reason: supportDetails.inflation.reason,
          helperWarnings: supportDetails.inflation.helperWarnings
        },
        value: supportDetails.inflation.projectedTotal,
        sourcePaths: supportDetails.inflation.sourcePaths
      }));
    }
    trace.push(createTraceRow({
      key: "grossAnnualHouseholdSupportNeed",
      label: "Gross Annual Household Support Need",
      formula: "ongoingSupport.annualTotalEssentialSupportCost",
      inputs: {
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
      formula: includeSurvivorIncomeOffset
        ? "survivorScenario.survivorNetAnnualIncome"
        : "disabled by settings",
      inputs: {
        includeSurvivorIncomeOffset
      },
      value: supportDetails.survivorNetAnnualIncome == null ? null : supportDetails.survivorNetAnnualIncome,
      sourcePaths: ["survivorScenario.survivorNetAnnualIncome", "settings.includeSurvivorIncomeOffset"]
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
      formula: "educationSupport.totalEducationFundingNeed",
      inputs: {
        totalEducationFundingNeed: education
      },
      value: education,
      sourcePaths: ["educationSupport.totalEducationFundingNeed"]
    }));
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
      formula: includeExistingCoverageOffset
        ? "existingCoverage.totalExistingCoverage"
        : "disabled by settings",
      inputs: {
        includeExistingCoverageOffset
      },
      value: existingCoverageOffset,
      sourcePaths: ["existingCoverage.totalExistingCoverage", "settings.includeExistingCoverageOffset"]
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
        ? "applied inside essential support; not added to totalOffset"
        : "disabled by settings",
      inputs: {
        survivorNetAnnualIncome: supportDetails.survivorNetAnnualIncome,
        survivorIncomeStartDelayMonths: supportDetails.survivorIncomeStartDelayMonths,
        incomeOffsetMonths: supportDetails.incomeOffsetMonths,
        includeSurvivorIncomeOffset,
        includedInTotalOffset: false
      },
      value: survivorIncomeOffset,
      sourcePaths: ["survivorScenario.survivorNetAnnualIncome", "settings.includeSurvivorIncomeOffset"]
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
        includeTransitionNeeds,
        includeDiscretionarySupport,
        includeSurvivorIncomeOffset,
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
        ["settings.includeOffsetAssets", "offsetAssets.totalAvailableOffsetAssetValue"]
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

    const existingCoverageOffset = includeExistingCoverageOffset
      ? normalizeComponentNumber({
          value: getPath(model, "existingCoverage.totalExistingCoverage"),
          sourcePath: "existingCoverage.totalExistingCoverage",
          warnings,
          warnWhenMissing: true,
          missingCode: "existing-coverage-missing",
          missingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
          missingSeverity: "info",
          negativeCode: "negative-value-treated-as-zero",
          negativeMessage: "totalExistingCoverage was negative and was treated as 0 for Simple HLV."
        })
      : 0;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      settings: normalizedSettings,
      warnings,
      includeOffsetAssets,
      methodLabel: "Simple HLV",
      legacyMissingCode: "offset-assets-missing",
      legacyMissingMessage: "totalAvailableOffsetAssetValue was missing; asset offset defaulted to 0.",
      legacyNegativeCode: "negative-value-treated-as-zero",
      legacyNegativeMessage: "totalAvailableOffsetAssetValue was negative and was treated as 0 for Simple HLV."
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
      formula: includeExistingCoverageOffset
        ? "existingCoverage.totalExistingCoverage"
        : "disabled by settings",
      inputs: {
        includeExistingCoverageOffset
      },
      value: existingCoverageOffset,
      sourcePaths: ["existingCoverage.totalExistingCoverage", "settings.includeExistingCoverageOffset"]
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
