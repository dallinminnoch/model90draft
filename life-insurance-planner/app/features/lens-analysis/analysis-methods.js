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
  const DEFAULT_SIMPLE_NEEDS_SETTINGS = Object.freeze({
    supportYears: 10,
    includeExistingCoverageOffset: true,
    includeAssetOffsets: false,
    includeDebtPayoff: true,
    includeEssentialSupport: true,
    includeEducation: true,
    includeFinalExpenses: true,
    source: "method-defaults"
  });
  const ASSET_OFFSET_SOURCE_TREATED = "treated";
  const ASSET_OFFSET_SOURCE_DISABLED = "disabled";
  const ASSET_OFFSET_SOURCE_ZERO = "zero";
  const TREATED_ASSET_OFFSET_SOURCE_PATH = "treatedAssetOffsets.totalTreatedAssetValue";
  const EXISTING_COVERAGE_OFFSET_SOURCE_PATH = "existingCoverage.totalExistingCoverage";
  const TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH = "treatedExistingCoverageOffset.totalTreatedCoverageOffset";
  const TREATED_EXISTING_COVERAGE_METHOD_CONSUMPTION_SOURCE_PATH = "treatedExistingCoverageOffset.metadata.consumedByMethods";
  const TREATED_DEBT_DIME_NON_MORTGAGE_SOURCE_PATH = "treatedDebtPayoff.dime.nonMortgageDebtAmount";
  const TREATED_DEBT_DIME_MORTGAGE_SOURCE_PATH = "treatedDebtPayoff.dime.mortgageAmount";
  const TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH = "treatedDebtPayoff.needs.debtPayoffAmount";
  const HEALTHCARE_INFLATION_RATE_SOURCE_PATH = "settings.inflationAssumptions.healthcareInflationRatePercent";
  const FINAL_EXPENSE_INFLATION_RATE_SOURCE_PATH = "settings.inflationAssumptions.finalExpenseInflationRatePercent";
  const FINAL_EXPENSE_TARGET_AGE_SOURCE_PATH = "settings.inflationAssumptions.finalExpenseTargetAge";

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

  function uniqueStrings(values) {
    return Array.from(new Set(
      (Array.isArray(values) ? values : [])
        .map(function (value) {
          return typeof value === "string" ? value.trim() : "";
        })
        .filter(Boolean)
    ));
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

  function getSurvivorIncomeDerivation(model) {
    const derivation = getPath(model, "survivorScenario.survivorIncomeDerivation");
    return isPlainObject(derivation) ? derivation : {};
  }

  function getSurvivorIncomeSuppressionReason(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    if (normalizedOptions.includeEssentialSupport === false) {
      return "essential-support-excluded";
    }

    if (normalizedOptions.includeSurvivorIncomeOffset !== true) {
      return "survivor-income-offset-disabled";
    }

    if (normalizedOptions.survivorContinuesWorking === false) {
      return "survivor-not-working";
    }

    if (normalizedOptions.survivorIncomeOffsetApplied !== true) {
      return "survivor-income-unavailable-or-zero";
    }

    return null;
  }

  function createSurvivorIncomeDerivationTraceInputs(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const derivation = isPlainObject(normalizedOptions.derivation)
      ? normalizedOptions.derivation
      : {};
    const supportDetails = isPlainObject(normalizedOptions.supportDetails)
      ? normalizedOptions.supportDetails
      : {};
    const survivorIncomeOffsetApplied = supportDetails.survivorIncomeOffsetApplied === true;
    const survivorContinuesWorking = Object.prototype.hasOwnProperty.call(derivation, "survivorContinuesWorking")
      ? derivation.survivorContinuesWorking
      : normalizedOptions.survivorContinuesWorking;
    const survivorIncomeStartDelayMonths = supportDetails.survivorIncomeStartDelayMonths == null
      ? (derivation.survivorIncomeStartDelayMonths ?? null)
      : supportDetails.survivorIncomeStartDelayMonths;
    const survivorNetAnnualIncomeUsed = supportDetails.survivorNetAnnualIncome == null
      ? null
      : supportDetails.survivorNetAnnualIncome;
    const survivorIncomeSuppressionReason = getSurvivorIncomeSuppressionReason({
      includeEssentialSupport: normalizedOptions.includeEssentialSupport,
      includeSurvivorIncomeOffset: normalizedOptions.includeSurvivorIncomeOffset,
      survivorContinuesWorking,
      survivorIncomeOffsetApplied
    });

    return {
      survivorIncomeSource: derivation.survivorIncomeSource || "unavailable",
      rawSpouseIncome: derivation.rawSpouseIncome ?? null,
      rawSpouseIncomeSourcePath: derivation.rawSpouseIncomeSourcePath || "protectionModeling.data.spouseIncome",
      survivorContinuesWorking,
      workReductionPercent: derivation.expectedSurvivorWorkReductionPercent ?? null,
      adjustedSurvivorGrossIncome: derivation.adjustedSurvivorGrossIncome ?? null,
      survivorNetAnnualIncomePrepared: derivation.survivorNetAnnualIncomePrepared ?? null,
      survivorNetAnnualIncomeUsed,
      survivorIncomeDerivedFromSpouseIncome: derivation.survivorIncomeDerivedFromSpouseIncome === true,
      legacySurvivorIncomeFallbackUsed: derivation.legacySurvivorIncomeFallbackUsed === true,
      applyStartDelay: Object.prototype.hasOwnProperty.call(derivation, "applyStartDelay")
        ? derivation.applyStartDelay
        : null,
      survivorIncomeStartDelayMonths,
      supportDurationYears: normalizedOptions.needsSupportDurationYears,
      survivorIncomeOffsetApplied,
      survivorIncomeOffsetSuppressed: supportDetails.survivorIncomeOffsetSuppressed === true,
      survivorIncomeSuppressionReason,
      fallbackReasons: Array.isArray(derivation.fallbackReasons) ? derivation.fallbackReasons : [],
      derivationWarnings: Array.isArray(derivation.warnings) ? derivation.warnings : []
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

  function getSingleOrSummarySourcePath(sourcePaths, fallbackSource) {
    if (!Array.isArray(sourcePaths) || !sourcePaths.length) {
      return fallbackSource || null;
    }

    return sourcePaths.length === 1 ? sourcePaths[0] : fallbackSource || sourcePaths[0];
  }

  function createDebtTreatmentWarningSummaries(treatedDebtPayoff) {
    const metadata = isPlainObject(treatedDebtPayoff?.metadata) ? treatedDebtPayoff.metadata : {};
    const sourceWarnings = Array.isArray(treatedDebtPayoff?.warnings) && treatedDebtPayoff.warnings.length
      ? treatedDebtPayoff.warnings
      : (Array.isArray(metadata.warnings) ? metadata.warnings : []);

    return sourceWarnings
      .filter(function (warning) {
        return isPlainObject(warning);
      })
      .map(function (warning) {
        return {
          code: warning.code || null,
          message: warning.message || "",
          severity: warning.severity || null,
          sourcePaths: Array.isArray(warning.sourcePaths) ? warning.sourcePaths.slice() : []
        };
      });
  }

  function createTreatedDebtPayoffTraceContext(model) {
    const treatedDebtPayoff = isPlainObject(model?.treatedDebtPayoff) ? model.treatedDebtPayoff : null;
    const metadata = isPlainObject(treatedDebtPayoff?.metadata) ? treatedDebtPayoff.metadata : {};
    const trace = isPlainObject(treatedDebtPayoff?.trace) ? treatedDebtPayoff.trace : {};
    const dime = isPlainObject(treatedDebtPayoff?.dime) ? treatedDebtPayoff.dime : {};
    const needs = isPlainObject(treatedDebtPayoff?.needs) ? treatedDebtPayoff.needs : {};
    const rawTotals = isPlainObject(treatedDebtPayoff?.rawTotals) ? treatedDebtPayoff.rawTotals : {};
    const warnings = createDebtTreatmentWarningSummaries(treatedDebtPayoff);
    const fallbackReason = treatedDebtPayoff
      ? (metadata.reason || null)
      : "missing-treatedDebtPayoff";
    const hasPreparedValues = toOptionalNumber(dime.nonMortgageDebtAmount) != null
      || toOptionalNumber(dime.mortgageAmount) != null
      || toOptionalNumber(needs.debtPayoffAmount) != null;
    const treatedDebtPayoffAvailable = Boolean(treatedDebtPayoff && hasPreparedValues && !fallbackReason);
    const manualTotalDebtPayoffOverride = metadata.manualTotalDebtPayoffOverride === true
      || trace.manualTotalDebtPayoffOverride === true;

    return {
      treatedDebtPayoffAvailable,
      treatedDebtConsumedByMethods: false,
      fallbackReason: treatedDebtPayoffAvailable
        ? null
        : (fallbackReason || "treated-debt-values-unavailable"),
      preparedDebtSource: treatedDebtPayoff?.source || metadata.source || null,
      preparedDebtFallbackSource: treatedDebtPayoff?.fallbackSource || metadata.fallbackSource || null,
      rawEquivalentDefault: treatedDebtPayoff?.rawEquivalentDefault === true,
      treatmentApplied: treatedDebtPayoff?.treatmentApplied === true,
      rawTotalDebtAmount: toOptionalNumber(rawTotals.totalDebtBalance),
      rawNonMortgageDebtAmount: toOptionalNumber(rawTotals.nonMortgageDebtBalance),
      rawMortgageAmount: toOptionalNumber(rawTotals.mortgageBalance),
      preparedDimeNonMortgageDebtAmount: toOptionalNumber(dime.nonMortgageDebtAmount),
      preparedDimeMortgageAmount: toOptionalNumber(dime.mortgageAmount),
      preparedNeedsDebtPayoffAmount: toOptionalNumber(needs.debtPayoffAmount),
      preparedNeedsMortgagePayoffAmount: toOptionalNumber(needs.mortgagePayoffAmount),
      preparedNeedsNonMortgageDebtAmount: toOptionalNumber(needs.nonMortgageDebtAmount),
      excludedDebtAmount: toOptionalNumber(treatedDebtPayoff?.excludedDebtAmount ?? rawTotals.excludedDebtAmount),
      deferredDebtAmount: toOptionalNumber(treatedDebtPayoff?.deferredDebtAmount ?? rawTotals.deferredDebtAmount),
      manualTotalDebtPayoffOverride,
      manualTotalDebtPayoffAmount: manualTotalDebtPayoffOverride
        ? toOptionalNumber(metadata.manualTotalDebtPayoffNeed)
        : null,
      manualOverrideSource: manualTotalDebtPayoffOverride
        ? (metadata.manualOverrideSource || null)
        : null,
      warnings,
      warningCodes: warnings
        .map(function (warning) {
          return warning.code;
        })
        .filter(Boolean)
    };
  }

  function createBaseDebtTreatmentTraceInputs(context) {
    return {
      treatedDebtPayoffAvailable: context.treatedDebtPayoffAvailable,
      treatedDebtConsumedByMethods: false,
      preparedDebtSource: context.preparedDebtSource,
      preparedDebtFallbackSource: context.preparedDebtFallbackSource,
      rawEquivalentDefault: context.rawEquivalentDefault,
      treatmentApplied: context.treatmentApplied,
      excludedDebtAmount: context.excludedDebtAmount,
      deferredDebtAmount: context.deferredDebtAmount,
      warningCodes: context.warningCodes,
      warnings: context.warnings,
      fallbackReason: context.fallbackReason
    };
  }

  function resolveNeedsDebtPayoffSelection(rawDebtPayoffComponent, treatedDebtTraceContext) {
    const rawSourcePaths = Array.isArray(rawDebtPayoffComponent?.sourcePaths)
      ? rawDebtPayoffComponent.sourcePaths.slice()
      : [];
    const rawSource = rawDebtPayoffComponent?.source || null;
    const rawFallbackSourcePath = getSingleOrSummarySourcePath(rawSourcePaths, rawSource);
    const preparedDebtPayoffAmount = toOptionalNumber(treatedDebtTraceContext?.preparedNeedsDebtPayoffAmount);
    const hasValidPreparedDebtPayoff = treatedDebtTraceContext?.treatedDebtPayoffAvailable === true
      && preparedDebtPayoffAmount != null
      && preparedDebtPayoffAmount >= 0;

    if (hasValidPreparedDebtPayoff) {
      return {
        value: preparedDebtPayoffAmount,
        formula: TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH,
        source: TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH,
        sourcePaths: [TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH],
        currentMethodDebtSourcePath: TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH,
        currentMethodDebtSourcePaths: [TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH],
        fallbackDebtSourcePath: rawFallbackSourcePath,
        fallbackDebtSourcePaths: rawSourcePaths,
        treatedDebtConsumedByMethods: true,
        fallbackReason: null
      };
    }

    return {
      value: rawDebtPayoffComponent.value,
      formula: rawDebtPayoffComponent.source === "debtPayoff.totalDebtPayoffNeed"
        ? "debtPayoff.totalDebtPayoffNeed"
        : "Sum of available debt payoff fields",
      source: rawSource,
      sourcePaths: rawSourcePaths,
      currentMethodDebtSourcePath: rawFallbackSourcePath,
      currentMethodDebtSourcePaths: rawSourcePaths,
      fallbackDebtSourcePath: rawFallbackSourcePath,
      fallbackDebtSourcePaths: rawSourcePaths,
      treatedDebtConsumedByMethods: false,
      fallbackReason: treatedDebtTraceContext?.fallbackReason
        || (preparedDebtPayoffAmount != null && preparedDebtPayoffAmount < 0
          ? "invalid-treated-debt-payoff-amount"
          : "treated-debt-payoff-unavailable")
    };
  }

  function resolveDimeDebtTreatmentSelection(options) {
    const normalizedOptions = isPlainObject(options) ? options : {};
    const rawSourcePaths = Array.isArray(normalizedOptions.rawSourcePaths)
      ? normalizedOptions.rawSourcePaths.slice()
      : [];
    const rawSource = normalizedOptions.rawSource || null;
    const rawFallbackSourcePath = getSingleOrSummarySourcePath(rawSourcePaths, rawSource);
    const preparedAmount = toOptionalNumber(normalizedOptions.preparedAmount);
    const hasValidPreparedAmount = normalizedOptions.treatedDebtPayoffAvailable === true
      && preparedAmount != null
      && preparedAmount >= 0;

    if (hasValidPreparedAmount) {
      return {
        value: preparedAmount,
        formula: normalizedOptions.preparedSourcePath,
        source: normalizedOptions.preparedSourcePath,
        sourcePaths: [normalizedOptions.preparedSourcePath],
        currentMethodDebtSourcePath: normalizedOptions.preparedSourcePath,
        currentMethodDebtSourcePaths: [normalizedOptions.preparedSourcePath],
        fallbackDebtSourcePath: rawFallbackSourcePath,
        fallbackDebtSourcePaths: rawSourcePaths,
        treatedDebtConsumedByMethods: true,
        fallbackReason: null
      };
    }

    return {
      value: normalizedOptions.rawValue,
      formula: normalizedOptions.rawFormula,
      source: rawSource,
      sourcePaths: rawSourcePaths,
      currentMethodDebtSourcePath: rawFallbackSourcePath,
      currentMethodDebtSourcePaths: rawSourcePaths,
      fallbackDebtSourcePath: rawFallbackSourcePath,
      fallbackDebtSourcePaths: rawSourcePaths,
      treatedDebtConsumedByMethods: false,
      fallbackReason: normalizedOptions.fallbackReason
        || (preparedAmount != null && preparedAmount < 0
          ? normalizedOptions.invalidFallbackReason
          : normalizedOptions.unavailableFallbackReason)
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
        "Invalid LENS Analysis support duration setting was ignored.",
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
          negativeMessage: "totalDebtPayoffNeed was negative and was treated as 0 for LENS Analysis."
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
        negativeMessage: field.label + " was negative and was treated as 0 for LENS Analysis."
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
        "LENS Analysis debt payoff used the sum of available debt fields because totalDebtPayoffNeed was missing.",
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
      "totalDebtPayoffNeed was missing; LENS Analysis debt payoff component defaulted to 0.",
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
      missingMessage: "totalEducationFundingNeed was missing; LENS Analysis education component defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "totalEducationFundingNeed was negative and was treated as 0 for LENS Analysis."
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
        negativeMessage: "annualTotalEssentialSupportCost was negative and was treated as 0 for LENS Analysis."
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
              negativeMessage: "survivorNetAnnualIncome was negative and was treated as 0 for LENS Analysis."
            }
          );
      let survivorNetAnnualIncome = 0;

      if (survivorIncome.hasValue) {
        survivorNetAnnualIncome = survivorIncome.value;
      } else if (!survivorIncomeMissingIsExpected) {
        addWarning(
          warnings,
          "missing-survivor-income-for-offset",
          "survivorNetAnnualIncome was missing; LENS Analysis support used no survivor income reduction.",
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
            "survivorIncomeStartDelayMonths was missing; survivor income was treated as starting immediately for LENS Analysis.",
            "info",
            [delayPath]
          );
        }
      } else if (rawDelayMonths < 0) {
        addWarning(
          warnings,
          "negative-value-treated-as-zero",
          "survivorIncomeStartDelayMonths was negative and was treated as 0 for LENS Analysis.",
          "warning",
          [delayPath]
        );
      } else if (rawDelayMonths > totalSupportMonths) {
        delayMonths = totalSupportMonths;
        addWarning(
          warnings,
          "survivor-income-delay-exceeds-support-duration",
          "survivorIncomeStartDelayMonths exceeded the LENS Analysis support duration and was clamped to the support duration.",
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
          "Survivor income growth is captured but not applied to the v1 LENS Analysis support calculation.",
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
          negativeMessage: "annualIncomeReplacementBase was negative and was treated as 0 for LENS Analysis income fallback."
        }
      );

      if (incomeReplacementBase.hasValue) {
        addWarning(
          warnings,
          "essential-support-income-fallback-used",
          "LENS Analysis used annualIncomeReplacementBase because annualTotalEssentialSupportCost was missing and allowIncomeFallback was true.",
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
      "annualTotalEssentialSupportCost was missing; LENS Analysis essential support component defaulted to 0.",
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

  function getFinalExpenseInflationWarningSeverity(warningCode) {
    if (!warningCode) {
      return null;
    }

    if (
      warningCode === "final-expense-inflation-disabled"
      || warningCode === "zero-or-missing-current-final-expense"
      || warningCode === "final-expense-target-age-not-greater-than-current-age"
    ) {
      return "info";
    }

    return "warning";
  }

  function getFinalExpenseInflationWarningMessage(projection) {
    const reasonMessages = {
      "inflation-assumptions-disabled": "Inflation Assumptions are disabled.",
      "zero-or-missing-current-final-expense": "current final expense is zero or missing.",
      "healthcare-inflation-rate-unavailable": "the healthcare inflation rate is missing or invalid.",
      "final-expense-inflation-rate-unavailable": "the final expense inflation rate is missing or invalid.",
      "final-expense-target-age-unavailable": "the final expense target age is missing or invalid.",
      "client-date-of-birth-missing": "client date of birth is missing.",
      "client-date-of-birth-invalid": "client date of birth is invalid.",
      "valuation-date-unavailable": "Planning As-Of Date is missing, invalid, or defaulted.",
      "target-age-not-greater-than-current-age": "the target age is not greater than current age.",
      "final-expense-bucket-inflation-helper-unavailable": "the final expense inflation helper is unavailable.",
      "final-expense-inflation-helper-unavailable": "the final expense inflation helper is unavailable."
    };
    const reason = reasonMessages[projection.reason] || projection.reason || "the required inputs were unavailable.";
    return `Final expense inflation used current-dollar final expenses because ${reason}`;
  }

  function getFinalExpenseBucketWarningMessage(projection, bucketKey) {
    const isMedical = bucketKey === "medical";
    const reason = isMedical ? projection.medicalReason : projection.nonMedicalReason;
    const reasonMessages = {
      "healthcare-inflation-rate-unavailable": "the healthcare inflation rate is missing or invalid.",
      "final-expense-inflation-rate-unavailable": "the final expense inflation rate is missing or invalid."
    };
    const label = isMedical ? "Medical final expense" : "Non-medical final expense";
    return `${label} inflation used current-dollar ${label.toLowerCase()} because ${reasonMessages[reason] || reason || "the required inputs were unavailable."}`;
  }

  function addFinalExpenseProjectionWarnings(warnings, projection, sourcePaths) {
    const seen = {};
    const sharedSeverity = getFinalExpenseInflationWarningSeverity(projection.warningCode);
    if (sharedSeverity) {
      addWarning(
        warnings,
        projection.warningCode,
        getFinalExpenseInflationWarningMessage(projection),
        sharedSeverity,
        sourcePaths
      );
      seen[projection.warningCode] = true;
    }

    [
      {
        bucketKey: "medical",
        code: projection.medicalWarningCode,
        sourcePaths: projection.medicalSourcePaths || []
      },
      {
        bucketKey: "nonMedical",
        code: projection.nonMedicalWarningCode,
        sourcePaths: projection.nonMedicalSourcePaths || []
      }
    ].forEach(function (entry) {
      if (!entry.code || seen[entry.code]) {
        return;
      }

      const severity = getFinalExpenseInflationWarningSeverity(entry.code);
      if (!severity) {
        return;
      }

      addWarning(
        warnings,
        entry.code,
        getFinalExpenseBucketWarningMessage(projection, entry.bucketKey),
        severity,
        uniqueStrings([
          ...(entry.sourcePaths || []),
          entry.bucketKey === "medical"
            ? HEALTHCARE_INFLATION_RATE_SOURCE_PATH
            : FINAL_EXPENSE_INFLATION_RATE_SOURCE_PATH
        ])
      );
      seen[entry.code] = true;
    });
  }

  function createCurrentDollarFinalExpenseInflationTrace(options) {
    const normalizedOptions = isPlainObject(options) ? options : {};
    const currentFinalExpenseAmount = normalizedOptions.currentFinalExpenseAmount || 0;
    const finalExpenses = getPath(normalizedOptions.model, "finalExpenses") || {};
    const medicalFinalExpenseAmount = Math.max(0, toOptionalNumber(finalExpenses.medicalEndOfLifeCost) || 0);
    const nonMedicalFinalExpenseAmountFromSubcomponents = Math.max(0, toOptionalNumber(finalExpenses.funeralAndBurialCost) || 0)
      + Math.max(0, toOptionalNumber(finalExpenses.estateSettlementCost) || 0)
      + Math.max(0, toOptionalNumber(finalExpenses.otherFinalExpenses) || 0);
    const nonMedicalFinalExpenseAmount = nonMedicalFinalExpenseAmountFromSubcomponents > 0
      ? nonMedicalFinalExpenseAmountFromSubcomponents
      : Math.max(0, currentFinalExpenseAmount - medicalFinalExpenseAmount);
    return {
      source: "analysis-methods-current-dollar-fallback",
      sourceMode: "finalExpenses-fallback",
      currentFinalExpenseAmount,
      projectedFinalExpenseAmount: currentFinalExpenseAmount,
      currentMedicalFinalExpenseAmount: medicalFinalExpenseAmount,
      projectedMedicalFinalExpenseAmount: medicalFinalExpenseAmount,
      currentNonMedicalFinalExpenseAmount: nonMedicalFinalExpenseAmount,
      projectedNonMedicalFinalExpenseAmount: nonMedicalFinalExpenseAmount,
      healthcareInflationRatePercent: null,
      finalExpenseInflationRatePercent: null,
      finalExpenseTargetAge: null,
      clientDateOfBirth: getPath(normalizedOptions.model, "profileFacts.clientDateOfBirth") || null,
      clientDateOfBirthSourcePath: getPath(normalizedOptions.model, "profileFacts.clientDateOfBirthSourcePath") || null,
      clientDateOfBirthStatus: getPath(normalizedOptions.model, "profileFacts.clientDateOfBirthStatus") || null,
      valuationDate: normalizedOptions.settings?.valuationDate || null,
      valuationDateSource: normalizedOptions.settings?.valuationDateSource || null,
      valuationDateDefaulted: normalizedOptions.settings?.valuationDateDefaulted === true,
      currentAge: null,
      projectionYears: 0,
      applied: false,
      medicalApplied: false,
      nonMedicalApplied: false,
      reason: normalizedOptions.reason || "final-expense-inflation-helper-unavailable",
      warningCode: normalizedOptions.warningCode || "final-expense-inflation-helper-unavailable",
      medicalReason: normalizedOptions.reason || "final-expense-inflation-helper-unavailable",
      medicalWarningCode: normalizedOptions.warningCode || "final-expense-inflation-helper-unavailable",
      nonMedicalReason: normalizedOptions.reason || "final-expense-inflation-helper-unavailable",
      nonMedicalWarningCode: normalizedOptions.warningCode || "final-expense-inflation-helper-unavailable",
      sourcePaths: ["finalExpenses.totalFinalExpenseNeed"],
      medicalSourcePaths: ["finalExpenses.medicalEndOfLifeCost"],
      nonMedicalSourcePaths: [
        "finalExpenses.funeralAndBurialCost",
        "finalExpenses.estateSettlementCost",
        "finalExpenses.otherFinalExpenses"
      ],
      healthcareRateSourcePath: HEALTHCARE_INFLATION_RATE_SOURCE_PATH,
      finalExpenseRateSourcePath: FINAL_EXPENSE_INFLATION_RATE_SOURCE_PATH,
      rateSourcePath: FINAL_EXPENSE_INFLATION_RATE_SOURCE_PATH,
      targetAgeSourcePath: FINAL_EXPENSE_TARGET_AGE_SOURCE_PATH
    };
  }

  function createNeedsFinalExpensesComponent(model, settings, warnings) {
    const currentFinalExpenseAmount = normalizeComponentNumber({
      value: getPath(model, "finalExpenses.totalFinalExpenseNeed"),
      sourcePath: "finalExpenses.totalFinalExpenseNeed",
      warnings,
      warnWhenMissing: true,
      missingCode: "missing-final-expense-need",
      missingMessage: "totalFinalExpenseNeed was missing; LENS Analysis final expenses component defaulted to 0.",
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: "totalFinalExpenseNeed was negative and was treated as 0 for LENS Analysis."
    });
    const inflationAssumptions = isPlainObject(settings.inflationAssumptions)
      ? settings.inflationAssumptions
      : {};
    const calculateFinalExpenseBucketInflationProjection = lensAnalysis.calculateFinalExpenseBucketInflationProjection;
    const settingSourcePaths = [
      "settings.inflationAssumptions.enabled",
      HEALTHCARE_INFLATION_RATE_SOURCE_PATH,
      FINAL_EXPENSE_INFLATION_RATE_SOURCE_PATH,
      FINAL_EXPENSE_TARGET_AGE_SOURCE_PATH,
      "profileFacts.clientDateOfBirth",
      "settings.valuationDate"
    ];
    const projection = typeof calculateFinalExpenseBucketInflationProjection === "function"
      ? calculateFinalExpenseBucketInflationProjection({
          enabled: inflationAssumptions.enabled === true,
          expenseFacts: getPath(model, "expenseFacts"),
          finalExpenses: getPath(model, "finalExpenses"),
          healthcareInflationRatePercent: inflationAssumptions.healthcareInflationRatePercent,
          finalExpenseInflationRatePercent: inflationAssumptions.finalExpenseInflationRatePercent,
          finalExpenseTargetAge: inflationAssumptions.finalExpenseTargetAge,
          clientDateOfBirth: getPath(model, "profileFacts.clientDateOfBirth"),
          clientDateOfBirthSourcePath: getPath(model, "profileFacts.clientDateOfBirthSourcePath"),
          clientDateOfBirthStatus: getPath(model, "profileFacts.clientDateOfBirthStatus"),
          valuationDate: settings.valuationDate,
          valuationDateSource: settings.valuationDateSource,
          valuationDateDefaulted: settings.valuationDateDefaulted,
          valuationDateWarningCode: settings.valuationDateWarningCode,
          healthcareRateSourcePath: HEALTHCARE_INFLATION_RATE_SOURCE_PATH,
          finalExpenseRateSourcePath: FINAL_EXPENSE_INFLATION_RATE_SOURCE_PATH,
          targetAgeSourcePath: FINAL_EXPENSE_TARGET_AGE_SOURCE_PATH
        })
      : createCurrentDollarFinalExpenseInflationTrace({
          model,
          settings,
          currentFinalExpenseAmount,
          reason: "final-expense-bucket-inflation-helper-unavailable",
          warningCode: "final-expense-bucket-inflation-helper-unavailable"
        });
    const resolvedSourcePaths = uniqueStrings([
      ...settingSourcePaths,
      ...(Array.isArray(projection.sourcePaths) ? projection.sourcePaths : []),
      ...(Array.isArray(projection.medicalSourcePaths) ? projection.medicalSourcePaths : []),
      ...(Array.isArray(projection.nonMedicalSourcePaths) ? projection.nonMedicalSourcePaths : [])
    ]);

    addFinalExpenseProjectionWarnings(warnings, projection, resolvedSourcePaths);

    return {
      value: projection.projectedFinalExpenseAmount,
      formula: projection.applied
        ? "medical final expense projected by healthcare inflation plus non-medical final expense projected by final expense inflation"
        : "current-dollar final expense buckets",
      inputs: {
        ...projection,
        totalFinalExpenseNeed: currentFinalExpenseAmount
      },
      sourcePaths: resolvedSourcePaths,
      inflation: projection
    };
  }

  function createHealthcareExpenseFallbackProjection(options) {
    const normalizedOptions = isPlainObject(options) ? options : {};
    const settings = isPlainObject(normalizedOptions.settings) ? normalizedOptions.settings : {};
    const assumptions = isPlainObject(settings.healthcareExpenseAssumptions)
      ? settings.healthcareExpenseAssumptions
      : {};
    const reason = normalizedOptions.reason || "healthcare-expense-projection-unavailable";
    const warningCode = normalizedOptions.warningCode || reason;
    const warningMessage = normalizedOptions.warningMessage
      || "Healthcare expense projection was unavailable; LENS healthcareExpenses defaulted to 0.";
    const traceWarning = createWarning(
      warningCode,
      warningMessage,
      "warning",
      normalizedOptions.sourcePaths || ["LensApp.lensAnalysis.calculateHealthcareExpenseProjection"]
    );

    return {
      source: "analysis-methods-healthcare-expense-fallback",
      applied: false,
      enabled: assumptions.enabled === true,
      projectedHealthcareExpenseAmount: 0,
      projectedRecurringHealthcareExpenseAmount: 0,
      includedOneTimeHealthcareExpenseAmount: 0,
      currentAnnualHealthcareExpenseAmount: 0,
      healthcareInflationRatePercent: getPath(settings, "inflationAssumptions.healthcareInflationRatePercent") ?? null,
      projectionYears: assumptions.projectionYears ?? null,
      projectionYearsSource: null,
      includeOneTimeHealthcareExpenses: assumptions.includeOneTimeHealthcareExpenses === true,
      oneTimeProjectionMode: assumptions.oneTimeProjectionMode || "currentDollarOnly",
      includedRecordCount: 0,
      excludedRecordCount: 0,
      includedBuckets: [],
      excludedBuckets: [],
      includedRecords: [],
      excludedRecords: [],
      warnings: [traceWarning],
      warningCount: 1,
      reason,
      warningCode,
      valuationDate: settings.valuationDate || null,
      valuationDateSource: settings.valuationDateSource || null,
      valuationDateDefaulted: settings.valuationDateDefaulted === true,
      clientDateOfBirth: getPath(normalizedOptions.model, "profileFacts.clientDateOfBirth") || null,
      clientDateOfBirthStatus: getPath(normalizedOptions.model, "profileFacts.clientDateOfBirthStatus") || null
    };
  }

  function normalizeHealthcareExpenseProjectionAmount(projection) {
    const projectedAmount = toOptionalNumber(projection?.projectedHealthcareExpenseAmount);
    return projectedAmount == null ? null : Math.max(0, projectedAmount);
  }

  function getHealthcareExpenseProjectionSourcePaths(projection) {
    const recordSourcePaths = []
      .concat(Array.isArray(projection?.includedRecords) ? projection.includedRecords : [])
      .concat(Array.isArray(projection?.excludedRecords) ? projection.excludedRecords : [])
      .map(function (record) {
        return record?.sourcePath;
      });

    return uniqueStrings([
      "settings.healthcareExpenseAssumptions",
      "settings.healthcareExpenseAssumptions.enabled",
      "settings.healthcareExpenseAssumptions.projectionYears",
      "settings.healthcareExpenseAssumptions.includeOneTimeHealthcareExpenses",
      HEALTHCARE_INFLATION_RATE_SOURCE_PATH,
      "expenseFacts.expenses",
      "profileFacts.clientDateOfBirth",
      "settings.valuationDate",
      ...recordSourcePaths
    ]);
  }

  function addHealthcareExpenseOverlapWarning(projection, warnings) {
    if (
      projection?.enabled !== true
      || !(toOptionalNumber(projection.includedRecordCount) > 0)
    ) {
      return projection;
    }

    const warning = createWarning(
      "healthcare-expense-overlap-review",
      "Entered healthcare expense records may overlap existing household healthcare or out-of-pocket support; review before relying on the LENS healthcareExpenses component.",
      "info",
      [
        "expenseFacts.expenses",
        "ongoingSupport.monthlyHealthcareOutOfPocketCost",
        "ongoingSupport.annualTotalEssentialSupportCost",
        "settings.healthcareExpenseAssumptions.enabled"
      ]
    );
    addWarning(
      warnings,
      warning.code,
      warning.message,
      warning.severity,
      warning.sourcePaths
    );

    const projectionWarnings = Array.isArray(projection.warnings) ? projection.warnings : [];
    return {
      ...projection,
      warnings: [
        ...projectionWarnings,
        warning
      ],
      warningCount: projectionWarnings.length + 1
    };
  }

  function createNeedsHealthcareExpensesComponent(model, settings, warnings) {
    const assumptions = isPlainObject(settings.healthcareExpenseAssumptions)
      ? settings.healthcareExpenseAssumptions
      : {};
    const healthcareExpensesEnabled = assumptions.enabled === true;
    const calculateHealthcareExpenseProjection = lensAnalysis.calculateHealthcareExpenseProjection;
    let projection;

    if (typeof calculateHealthcareExpenseProjection === "function") {
      projection = calculateHealthcareExpenseProjection({
        expenseFacts: getPath(model, "expenseFacts"),
        healthcareExpenseAssumptions: assumptions,
        inflationAssumptions: isPlainObject(settings.inflationAssumptions)
          ? settings.inflationAssumptions
          : {},
        profileFacts: getPath(model, "profileFacts"),
        valuationDate: settings.valuationDate,
        valuationDateSource: settings.valuationDateSource,
        valuationDateDefaulted: settings.valuationDateDefaulted
      });
    } else if (healthcareExpensesEnabled) {
      addWarning(
        warnings,
        "healthcare-expense-inflation-helper-unavailable",
        "Healthcare expense projection helper was unavailable; LENS healthcareExpenses defaulted to 0.",
        "warning",
        ["LensApp.lensAnalysis.calculateHealthcareExpenseProjection"]
      );
      projection = createHealthcareExpenseFallbackProjection({
        model,
        settings,
        reason: "healthcare-expense-inflation-helper-unavailable",
        warningCode: "healthcare-expense-inflation-helper-unavailable",
        warningMessage: "Healthcare expense projection helper was unavailable; LENS healthcareExpenses defaulted to 0."
      });
    } else {
      projection = {
        source: "analysis-methods-healthcare-expense-disabled",
        applied: false,
        enabled: false,
        projectedHealthcareExpenseAmount: 0,
        projectedRecurringHealthcareExpenseAmount: 0,
        includedOneTimeHealthcareExpenseAmount: 0,
        currentAnnualHealthcareExpenseAmount: 0,
        healthcareInflationRatePercent: getPath(settings, "inflationAssumptions.healthcareInflationRatePercent") ?? null,
        projectionYears: assumptions.projectionYears ?? null,
        projectionYearsSource: null,
        includeOneTimeHealthcareExpenses: assumptions.includeOneTimeHealthcareExpenses === true,
        oneTimeProjectionMode: assumptions.oneTimeProjectionMode || "currentDollarOnly",
        includedRecordCount: 0,
        excludedRecordCount: 0,
        includedBuckets: [],
        excludedBuckets: [],
        includedRecords: [],
        excludedRecords: [],
        warnings: [],
        warningCount: 0,
        reason: "Healthcare expense assumptions are disabled; recurring/non-final healthcare expense records remain raw-only.",
        warningCode: "healthcare-expense-assumptions-disabled",
        valuationDate: settings.valuationDate || null,
        valuationDateSource: settings.valuationDateSource || null,
        valuationDateDefaulted: settings.valuationDateDefaulted === true,
        clientDateOfBirth: getPath(model, "profileFacts.clientDateOfBirth") || null,
        clientDateOfBirthStatus: getPath(model, "profileFacts.clientDateOfBirthStatus") || null
      };
    }

    let componentValue = normalizeHealthcareExpenseProjectionAmount(projection);
    if (!isPlainObject(projection) || componentValue == null) {
      addWarning(
        warnings,
        "invalid-healthcare-expense-projection-result",
        "Healthcare expense projection helper returned an invalid result; LENS healthcareExpenses defaulted to 0.",
        "warning",
        ["LensApp.lensAnalysis.calculateHealthcareExpenseProjection"]
      );
      projection = createHealthcareExpenseFallbackProjection({
        model,
        settings,
        reason: "invalid-healthcare-expense-projection-result",
        warningCode: "invalid-healthcare-expense-projection-result",
        warningMessage: "Healthcare expense projection helper returned an invalid result; LENS healthcareExpenses defaulted to 0."
      });
      componentValue = 0;
    }

    const traceProjection = addHealthcareExpenseOverlapWarning(projection, warnings);
    const value = healthcareExpensesEnabled ? componentValue : 0;

    return {
      value,
      formula: healthcareExpensesEnabled
        ? "healthcare expense projection helper for eligible non-final healthcare expense records"
        : "disabled by healthcareExpenseAssumptions.enabled",
      inputs: traceProjection,
      sourcePaths: getHealthcareExpenseProjectionSourcePaths(traceProjection),
      projection: traceProjection
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
      negativeMessage: "annualDiscretionaryPersonalSpending was negative and was treated as 0 for LENS Analysis."
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

  function resolveSimpleNeedsSupportYears(settings, warnings) {
    if (!hasOwn(settings, "supportYears")) {
      return {
        value: DEFAULT_SIMPLE_NEEDS_SETTINGS.supportYears,
        source: "default-10-years",
        sourcePaths: ["settings.supportYears"]
      };
    }

    const supportYears = toOptionalNumber(settings.supportYears);
    if (supportYears != null && supportYears >= 0) {
      return {
        value: supportYears,
        source: "settings",
        sourcePaths: ["settings.supportYears"]
      };
    }

    addWarning(
      warnings,
      "invalid-simple-needs-support-years",
      "Invalid Simple Needs support years setting; defaulted to 10 years.",
      "warning",
      ["settings.supportYears"]
    );

    return {
      value: DEFAULT_SIMPLE_NEEDS_SETTINGS.supportYears,
      source: "default-10-years",
      sourcePaths: ["settings.supportYears"]
    };
  }

  function createSimpleNeedsScalarComponent(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const includeComponent = normalizedOptions.includeComponent !== false;
    if (!includeComponent) {
      return {
        value: 0,
        formula: "disabled by settings",
        source: "settings",
        inputs: {
          included: false
        },
        sourcePaths: [normalizedOptions.settingSourcePath]
      };
    }

    const value = normalizeComponentNumber({
      value: getPath(normalizedOptions.model, normalizedOptions.sourcePath),
      sourcePath: normalizedOptions.sourcePath,
      warnings: normalizedOptions.warnings,
      warnWhenMissing: true,
      missingCode: normalizedOptions.missingCode,
      missingMessage: normalizedOptions.missingMessage,
      negativeCode: "negative-value-treated-as-zero",
      negativeMessage: normalizedOptions.negativeMessage
    });

    return {
      value,
      formula: normalizedOptions.sourcePath,
      source: normalizedOptions.sourcePath,
      inputs: {
        included: true,
        value
      },
      sourcePaths: [normalizedOptions.sourcePath]
    };
  }

  function createSimpleNeedsEssentialSupportComponent(model, supportYears, includeEssentialSupport, warnings) {
    if (!includeEssentialSupport) {
      return {
        value: 0,
        annualValue: 0,
        formula: "disabled by settings",
        source: "settings",
        inputs: {
          included: false,
          supportYears
        },
        sourcePaths: ["settings.includeEssentialSupport"]
      };
    }

    const annualSupport = normalizeNonNegativeNumber(
      getPath(model, "ongoingSupport.annualTotalEssentialSupportCost"),
      "ongoingSupport.annualTotalEssentialSupportCost",
      warnings,
      {
        negativeCode: "negative-value-treated-as-zero",
        negativeMessage: "annualTotalEssentialSupportCost was negative and was treated as 0 for Simple Needs."
      }
    );

    if (annualSupport.hasValue) {
      return {
        value: annualSupport.value * supportYears,
        annualValue: annualSupport.value,
        formula: "annualTotalEssentialSupportCost x supportYears",
        source: "ongoingSupport.annualTotalEssentialSupportCost",
        inputs: {
          included: true,
          annualTotalEssentialSupportCost: annualSupport.value,
          supportYears
        },
        sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost", "settings.supportYears"]
      };
    }

    const fallbackIncome = normalizeNonNegativeNumber(
      getPath(model, "incomeBasis.annualIncomeReplacementBase"),
      "incomeBasis.annualIncomeReplacementBase",
      warnings,
      {
        negativeCode: "negative-value-treated-as-zero",
        negativeMessage: "annualIncomeReplacementBase was negative and was treated as 0 for Simple Needs essential support fallback."
      }
    );

    if (fallbackIncome.hasValue) {
      addWarning(
        warnings,
        "simple-needs-essential-support-income-fallback-used",
        "Simple Needs used annualIncomeReplacementBase because annualTotalEssentialSupportCost was missing.",
        "warning",
        ["ongoingSupport.annualTotalEssentialSupportCost", "incomeBasis.annualIncomeReplacementBase"]
      );

      return {
        value: fallbackIncome.value * supportYears,
        annualValue: fallbackIncome.value,
        formula: "annualIncomeReplacementBase x supportYears",
        source: "incomeBasis.annualIncomeReplacementBase",
        inputs: {
          included: true,
          annualIncomeReplacementBase: fallbackIncome.value,
          supportYears
        },
        sourcePaths: ["incomeBasis.annualIncomeReplacementBase", "settings.supportYears"]
      };
    }

    addWarning(
      warnings,
      "missing-simple-needs-essential-support-basis",
      "annualTotalEssentialSupportCost and annualIncomeReplacementBase were missing; Simple Needs essential support defaulted to 0.",
      "warning",
      ["ongoingSupport.annualTotalEssentialSupportCost", "incomeBasis.annualIncomeReplacementBase"]
    );

    return {
      value: 0,
      annualValue: null,
      formula: "annualTotalEssentialSupportCost x supportYears",
      source: "missing-default-zero",
      inputs: {
        included: true,
        annualTotalEssentialSupportCost: null,
        annualIncomeReplacementBase: null,
        supportYears
      },
      sourcePaths: ["ongoingSupport.annualTotalEssentialSupportCost", "incomeBasis.annualIncomeReplacementBase", "settings.supportYears"]
    };
  }

  function runSimpleNeedsAnalysis(lensModel, settings) {
    const model = isPlainObject(lensModel) ? lensModel : {};
    const normalizedSettings = isPlainObject(settings) ? settings : {};
    const warnings = [];
    const trace = [];
    const supportYearsResult = resolveSimpleNeedsSupportYears(normalizedSettings, warnings);
    const supportYears = supportYearsResult.value;
    const includeExistingCoverageOffset = getBooleanSetting(
      normalizedSettings,
      "includeExistingCoverageOffset",
      DEFAULT_SIMPLE_NEEDS_SETTINGS.includeExistingCoverageOffset
    );
    const includeAssetOffsets = normalizedSettings.includeAssetOffsets === true;
    const includeDebtPayoff = getBooleanSetting(
      normalizedSettings,
      "includeDebtPayoff",
      DEFAULT_SIMPLE_NEEDS_SETTINGS.includeDebtPayoff
    );
    const includeEssentialSupport = getBooleanSetting(
      normalizedSettings,
      "includeEssentialSupport",
      DEFAULT_SIMPLE_NEEDS_SETTINGS.includeEssentialSupport
    );
    const includeEducation = getBooleanSetting(
      normalizedSettings,
      "includeEducation",
      DEFAULT_SIMPLE_NEEDS_SETTINGS.includeEducation
    );
    const includeFinalExpenses = getBooleanSetting(
      normalizedSettings,
      "includeFinalExpenses",
      DEFAULT_SIMPLE_NEEDS_SETTINGS.includeFinalExpenses
    );
    const settingsSource = typeof normalizedSettings.source === "string" && normalizedSettings.source.trim()
      ? normalizedSettings.source.trim()
      : DEFAULT_SIMPLE_NEEDS_SETTINGS.source;

    addWarning(
      warnings,
      "simple-needs-current-dollar-only",
      "Simple Needs uses current-dollar normalized fields only and does not consume advanced LENS projections or reporting-only traces.",
      "info",
      []
    );

    if (!includeAssetOffsets) {
      addWarning(
        warnings,
        "simple-needs-asset-offsets-disabled-by-default",
        "Asset offsets were not applied because Simple Needs only includes current-dollar treated asset offsets when includeAssetOffsets is true.",
        "info",
        ["settings.includeAssetOffsets", TREATED_ASSET_OFFSET_SOURCE_PATH]
      );
    }

    const debtPayoffComponent = createSimpleNeedsScalarComponent({
      model,
      warnings,
      includeComponent: includeDebtPayoff,
      sourcePath: "debtPayoff.totalDebtPayoffNeed",
      settingSourcePath: "settings.includeDebtPayoff",
      missingCode: "missing-simple-needs-debt-payoff",
      missingMessage: "totalDebtPayoffNeed was missing; Simple Needs debt payoff defaulted to 0.",
      negativeMessage: "totalDebtPayoffNeed was negative and was treated as 0 for Simple Needs."
    });
    const essentialSupportComponent = createSimpleNeedsEssentialSupportComponent(
      model,
      supportYears,
      includeEssentialSupport,
      warnings
    );
    const educationComponent = createSimpleNeedsScalarComponent({
      model,
      warnings,
      includeComponent: includeEducation,
      sourcePath: "educationSupport.totalEducationFundingNeed",
      settingSourcePath: "settings.includeEducation",
      missingCode: "missing-simple-needs-education",
      missingMessage: "totalEducationFundingNeed was missing; Simple Needs education defaulted to 0.",
      negativeMessage: "totalEducationFundingNeed was negative and was treated as 0 for Simple Needs."
    });
    const finalExpensesComponent = createSimpleNeedsScalarComponent({
      model,
      warnings,
      includeComponent: includeFinalExpenses,
      sourcePath: "finalExpenses.totalFinalExpenseNeed",
      settingSourcePath: "settings.includeFinalExpenses",
      missingCode: "missing-simple-needs-final-expenses",
      missingMessage: "totalFinalExpenseNeed was missing; Simple Needs final expenses defaulted to 0.",
      negativeMessage: "totalFinalExpenseNeed was negative and was treated as 0 for Simple Needs."
    });
    const existingCoverageOffsetSelection = resolveExistingCoverageOffsetSelection({
      model,
      warnings,
      includeExistingCoverageOffset,
      methodLabel: "Simple Needs",
      rawMissingCode: "simple-needs-existing-coverage-missing",
      rawMissingMessage: "totalExistingCoverage was missing; Simple Needs existing coverage offset defaulted to 0.",
      rawNegativeCode: "negative-value-treated-as-zero",
      rawNegativeMessage: "totalExistingCoverage was negative and was treated as 0 for Simple Needs."
    });
    const existingCoverageOffset = existingCoverageOffsetSelection.value;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      warnings,
      includeOffsetAssets: includeAssetOffsets,
      methodLabel: "Simple Needs"
    });
    const assetOffset = assetOffsetSelection.value;
    const grossNeed = debtPayoffComponent.value
      + essentialSupportComponent.value
      + educationComponent.value
      + finalExpensesComponent.value;
    const totalOffset = existingCoverageOffset + assetOffset;
    const rawUncappedGap = grossNeed - totalOffset;
    const netCoverageGap = Math.max(rawUncappedGap, 0);

    trace.push(createTraceRow({
      key: "debtPayoff",
      label: "Debt Payoff",
      formula: debtPayoffComponent.formula,
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
    trace.push(createTraceRow({
      key: "education",
      label: "Education",
      formula: educationComponent.formula,
      inputs: educationComponent.inputs,
      value: educationComponent.value,
      sourcePaths: educationComponent.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "finalExpenses",
      label: "Final Expenses",
      formula: finalExpensesComponent.formula,
      inputs: finalExpensesComponent.inputs,
      value: finalExpensesComponent.value,
      sourcePaths: finalExpensesComponent.sourcePaths
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
      key: "grossNeed",
      label: "Gross Simple Needs",
      formula: "debtPayoff + essentialSupport + education + finalExpenses",
      inputs: {
        debtPayoff: debtPayoffComponent.value,
        essentialSupport: essentialSupportComponent.value,
        education: educationComponent.value,
        finalExpenses: finalExpensesComponent.value
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

    return {
      method: "simpleNeeds",
      methodKey: "simpleNeeds",
      label: "Simple Needs Analysis",
      grossNeed,
      netNeed: netCoverageGap,
      coverageGap: netCoverageGap,
      netCoverageGap,
      rawUncappedGap,
      components: {
        debtPayoff: debtPayoffComponent.value,
        essentialSupport: essentialSupportComponent.value,
        education: educationComponent.value,
        finalExpenses: finalExpensesComponent.value
      },
      commonOffsets: {
        existingCoverageOffset,
        assetOffset,
        totalOffset
      },
      assumptions: {
        source: settingsSource,
        supportYears,
        supportYearsSource: supportYearsResult.source,
        currentDollarOnly: true,
        includeExistingCoverageOffset,
        includeAssetOffsets,
        includeDebtPayoff,
        includeEssentialSupport,
        includeEducation,
        includeFinalExpenses,
        ...assetOffsetSelection.assumptionFields,
        debtPayoffSource: debtPayoffComponent.source,
        essentialSupportSource: essentialSupportComponent.source,
        educationSource: educationComponent.source,
        finalExpensesSource: finalExpensesComponent.source,
        advancedLensAssumptionsConsumed: false
      },
      warnings,
      trace
    };
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
    const treatedDebtTraceContext = createTreatedDebtPayoffTraceContext(model);
    const debtSelection = resolveDimeDebtTreatmentSelection({
      rawValue: debtComponent.value,
      rawFormula: debtComponent.source === "explicit-non-mortgage-debt-fields"
        ? "Sum of non-mortgage debt fields"
        : "Fallback debt total minus mortgage when available",
      rawSource: debtComponent.source,
      rawSourcePaths: debtComponent.sourcePaths,
      preparedAmount: treatedDebtTraceContext.preparedDimeNonMortgageDebtAmount,
      preparedSourcePath: TREATED_DEBT_DIME_NON_MORTGAGE_SOURCE_PATH,
      treatedDebtPayoffAvailable: treatedDebtTraceContext.treatedDebtPayoffAvailable,
      fallbackReason: treatedDebtTraceContext.fallbackReason,
      invalidFallbackReason: "invalid-treated-dime-non-mortgage-debt-amount",
      unavailableFallbackReason: "treated-dime-non-mortgage-debt-unavailable"
    });
    const mortgageSelection = resolveDimeDebtTreatmentSelection({
      rawValue: mortgage,
      rawFormula: "mortgageBalance",
      rawSource: "debtPayoff.mortgageBalance",
      rawSourcePaths: ["debtPayoff.mortgageBalance"],
      preparedAmount: treatedDebtTraceContext.preparedDimeMortgageAmount,
      preparedSourcePath: TREATED_DEBT_DIME_MORTGAGE_SOURCE_PATH,
      treatedDebtPayoffAvailable: treatedDebtTraceContext.treatedDebtPayoffAvailable,
      fallbackReason: treatedDebtTraceContext.fallbackReason,
      invalidFallbackReason: "invalid-treated-dime-mortgage-amount",
      unavailableFallbackReason: "treated-dime-mortgage-unavailable"
    });

    const grossNeed = debtSelection.value + income + mortgageSelection.value + education;
    const totalOffset = existingCoverageOffset + assetOffset;
    const rawUncappedGap = grossNeed - totalOffset;
    const netCoverageGap = Math.max(rawUncappedGap, 0);

    trace.push(createTraceRow({
      key: "debt",
      label: "Debt",
      formula: debtSelection.formula,
      inputs: {
        ...debtComponent.inputs,
        ...createBaseDebtTreatmentTraceInputs(treatedDebtTraceContext),
        treatedDebtConsumedByMethods: debtSelection.treatedDebtConsumedByMethods,
        fallbackReason: debtSelection.fallbackReason,
        currentMethodDebtSourcePath: debtSelection.currentMethodDebtSourcePath,
        currentMethodDebtSourcePaths: debtSelection.currentMethodDebtSourcePaths,
        fallbackDebtSourcePath: debtSelection.fallbackDebtSourcePath,
        fallbackDebtSourcePaths: debtSelection.fallbackDebtSourcePaths,
        preparedDebtSourcePath: TREATED_DEBT_DIME_NON_MORTGAGE_SOURCE_PATH,
        rawNonMortgageDebtAmount: debtComponent.value,
        preparedNonMortgageDebtAmount: treatedDebtTraceContext.preparedDimeNonMortgageDebtAmount,
        rawMortgageAmount: mortgage,
        preparedMortgageAmount: treatedDebtTraceContext.preparedDimeMortgageAmount
      },
      value: debtSelection.value,
      sourcePaths: debtSelection.sourcePaths
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
      formula: mortgageSelection.formula,
      inputs: {
        mortgageBalance: mortgage,
        ...createBaseDebtTreatmentTraceInputs(treatedDebtTraceContext),
        treatedDebtConsumedByMethods: mortgageSelection.treatedDebtConsumedByMethods,
        fallbackReason: mortgageSelection.fallbackReason,
        currentMethodDebtSourcePath: mortgageSelection.currentMethodDebtSourcePath,
        currentMethodDebtSourcePaths: mortgageSelection.currentMethodDebtSourcePaths,
        fallbackDebtSourcePath: mortgageSelection.fallbackDebtSourcePath,
        fallbackDebtSourcePaths: mortgageSelection.fallbackDebtSourcePaths,
        preparedDebtSourcePath: TREATED_DEBT_DIME_MORTGAGE_SOURCE_PATH,
        rawNonMortgageDebtAmount: debtComponent.value,
        preparedNonMortgageDebtAmount: treatedDebtTraceContext.preparedDimeNonMortgageDebtAmount,
        rawMortgageAmount: mortgage,
        preparedMortgageAmount: treatedDebtTraceContext.preparedDimeMortgageAmount
      },
      value: mortgageSelection.value,
      sourcePaths: mortgageSelection.sourcePaths
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
        debt: debtSelection.value,
        income,
        mortgage: mortgageSelection.value,
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
        debt: debtSelection.value,
        income,
        mortgage: mortgageSelection.value,
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
        debtComponentSource: debtSelection.source,
        incomeComponentSource: "incomeBasis.annualIncomeReplacementBase",
        mortgageComponentSource: mortgageSelection.source,
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
    const finalExpensesComponent = createNeedsFinalExpensesComponent(
      model,
      normalizedSettings,
      warnings
    );
    const finalExpenses = finalExpensesComponent.value;
    const healthcareExpensesComponent = createNeedsHealthcareExpensesComponent(
      model,
      normalizedSettings,
      warnings
    );
    const healthcareExpenses = healthcareExpensesComponent.value;
    const transitionNeeds = includeTransitionNeeds
      ? normalizeComponentNumber({
          value: getPath(model, "transitionNeeds.totalTransitionNeed"),
          sourcePath: "transitionNeeds.totalTransitionNeed",
          warnings,
          warnWhenMissing: true,
          missingCode: "missing-transition-need",
          missingMessage: "totalTransitionNeed was missing; LENS Analysis transition needs component defaulted to 0.",
          negativeCode: "negative-value-treated-as-zero",
          negativeMessage: "totalTransitionNeed was negative and was treated as 0 for LENS Analysis."
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
      methodLabel: "LENS Analysis",
      rawMissingCode: "missing-existing-coverage",
      rawMissingMessage: "totalExistingCoverage was missing; existing coverage offset defaulted to 0.",
      rawNegativeCode: "negative-value-treated-as-zero",
      rawNegativeMessage: "totalExistingCoverage was negative and was treated as 0 for LENS Analysis."
    });
    const existingCoverageOffset = existingCoverageOffsetSelection.value;
    const assetOffsetSelection = resolveAssetOffsetSelection({
      model,
      warnings,
      includeOffsetAssets,
      methodLabel: "LENS Analysis"
    });
    const assetOffset = assetOffsetSelection.value;
    const survivorIncomeOffset = essentialSupportComponent.survivorIncomeOffset || 0;
    const supportDetails = essentialSupportComponent.supportDetails || {};
    const survivorIncomeDerivation = getSurvivorIncomeDerivation(model);
    const survivorIncomeDerivationTraceInputs = createSurvivorIncomeDerivationTraceInputs({
      derivation: survivorIncomeDerivation,
      supportDetails,
      includeEssentialSupport,
      includeSurvivorIncomeOffset,
      needsSupportDurationYears,
      survivorContinuesWorking: getPath(model, "survivorScenario.survivorContinuesWorking")
    });
    const treatedDebtTraceContext = createTreatedDebtPayoffTraceContext(model);
    const debtPayoffSelection = resolveNeedsDebtPayoffSelection(debtPayoffComponent, treatedDebtTraceContext);
    const rawDebtPayoffMortgageAmount = toOptionalNumber(getPath(model, "debtPayoff.mortgageBalance"));
    const rawNeedsMortgageAmount = treatedDebtTraceContext.rawMortgageAmount == null
      ? rawDebtPayoffMortgageAmount
      : treatedDebtTraceContext.rawMortgageAmount;
    const rawNeedsNonMortgageDebtAmount = treatedDebtTraceContext.rawNonMortgageDebtAmount == null
      ? (
          rawNeedsMortgageAmount == null
            ? null
            : Math.max(0, debtPayoffComponent.value - Math.max(0, rawNeedsMortgageAmount))
        )
      : treatedDebtTraceContext.rawNonMortgageDebtAmount;

    const grossNeed = debtPayoffSelection.value
      + essentialSupportComponent.value
      + education
      + finalExpenses
      + healthcareExpenses
      + transitionNeeds
      + discretionarySupport;
    const totalOffset = existingCoverageOffset + assetOffset;
    const rawUncappedGap = grossNeed - totalOffset;
    const netCoverageGap = Math.max(rawUncappedGap, 0);

    trace.push(createTraceRow({
      key: "debtPayoff",
      label: "Debt Payoff",
      formula: debtPayoffSelection.formula,
      inputs: {
        ...debtPayoffComponent.inputs,
        ...createBaseDebtTreatmentTraceInputs(treatedDebtTraceContext),
        treatedDebtConsumedByMethods: debtPayoffSelection.treatedDebtConsumedByMethods,
        fallbackReason: debtPayoffSelection.fallbackReason,
        currentMethodDebtSourcePath: debtPayoffSelection.currentMethodDebtSourcePath,
        currentMethodDebtSourcePaths: debtPayoffSelection.currentMethodDebtSourcePaths,
        fallbackDebtSourcePath: debtPayoffSelection.fallbackDebtSourcePath,
        fallbackDebtSourcePaths: debtPayoffSelection.fallbackDebtSourcePaths,
        preparedDebtSourcePath: TREATED_DEBT_NEEDS_TOTAL_SOURCE_PATH,
        rawDebtPayoffAmount: debtPayoffComponent.value,
        rawMortgageAmount: rawNeedsMortgageAmount,
        rawNonMortgageDebtAmount: rawNeedsNonMortgageDebtAmount,
        preparedDebtPayoffAmount: treatedDebtTraceContext.preparedNeedsDebtPayoffAmount,
        preparedMortgagePayoffAmount: treatedDebtTraceContext.preparedNeedsMortgagePayoffAmount,
        preparedNonMortgageDebtAmount: treatedDebtTraceContext.preparedNeedsNonMortgageDebtAmount,
        manualTotalDebtPayoffOverride: treatedDebtTraceContext.manualTotalDebtPayoffOverride,
        manualTotalDebtPayoffAmount: treatedDebtTraceContext.manualTotalDebtPayoffAmount,
        manualOverrideSource: treatedDebtTraceContext.manualOverrideSource,
        manualOverridePolicy: "metadata-only"
      },
      value: debtPayoffSelection.value,
      sourcePaths: debtPayoffSelection.sourcePaths
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
      key: "survivorIncomeDerivation",
      label: "Survivor Income Derivation",
      formula: survivorIncomeDerivationTraceInputs.survivorIncomeDerivedFromSpouseIncome
        ? "spouse income x (1 - work reduction)"
        : survivorIncomeDerivationTraceInputs.survivorIncomeSource,
      inputs: survivorIncomeDerivationTraceInputs,
      value: survivorIncomeDerivationTraceInputs.survivorNetAnnualIncomeUsed,
      sourcePaths: [
        "survivorScenario.survivorIncomeDerivation",
        "survivorScenario.survivorNetAnnualIncome",
        "survivorScenario.survivorIncomeStartDelayMonths",
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
      formula: finalExpensesComponent.formula,
      inputs: finalExpensesComponent.inputs,
      value: finalExpenses,
      sourcePaths: finalExpensesComponent.sourcePaths
    }));
    trace.push(createTraceRow({
      key: "healthcareExpenses",
      label: "Healthcare Expenses",
      formula: healthcareExpensesComponent.formula,
      inputs: healthcareExpensesComponent.inputs,
      value: healthcareExpenses,
      sourcePaths: healthcareExpensesComponent.sourcePaths
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
        survivorIncomeSource: survivorIncomeDerivationTraceInputs.survivorIncomeSource,
        rawSpouseIncome: survivorIncomeDerivationTraceInputs.rawSpouseIncome,
        survivorContinuesWorking: survivorIncomeDerivationTraceInputs.survivorContinuesWorking,
        workReductionPercent: survivorIncomeDerivationTraceInputs.workReductionPercent,
        survivorNetAnnualIncomeUsed: survivorIncomeDerivationTraceInputs.survivorNetAnnualIncomeUsed,
        survivorNetAnnualIncome: supportDetails.survivorNetAnnualIncome,
        applyStartDelay: survivorIncomeDerivationTraceInputs.applyStartDelay,
        survivorIncomeStartDelayMonths: supportDetails.survivorIncomeStartDelayMonths,
        incomeOffsetMonths: supportDetails.incomeOffsetMonths,
        supportDurationYears: needsSupportDurationYears,
        includeEssentialSupport,
        includeSurvivorIncomeOffset,
        essentialSupportExcluded: includeEssentialSupport === false,
        survivorIncomeOffsetApplied: supportDetails.survivorIncomeOffsetApplied === true,
        survivorIncomeOffsetSuppressed: supportDetails.survivorIncomeOffsetSuppressed === true,
        survivorIncomeSuppressionReason: survivorIncomeDerivationTraceInputs.survivorIncomeSuppressionReason,
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
      formula: "debtPayoff + essentialSupport + education + finalExpenses + healthcareExpenses + transitionNeeds + discretionarySupport",
      inputs: {
        debtPayoff: debtPayoffSelection.value,
        essentialSupport: essentialSupportComponent.value,
        education,
        finalExpenses,
        healthcareExpenses,
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
      label: "LENS Analysis",
      grossNeed,
      netCoverageGap,
      rawUncappedGap,
      components: {
        debtPayoff: debtPayoffSelection.value,
        essentialSupport: essentialSupportComponent.value,
        education,
        finalExpenses,
        healthcareExpenses,
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
        healthcareExpenseAssumptions: healthcareExpensesComponent.inputs
          ? {
              enabled: healthcareExpensesComponent.inputs.enabled === true,
              projectionYears: healthcareExpensesComponent.inputs.projectionYears,
              includeOneTimeHealthcareExpenses: healthcareExpensesComponent.inputs.includeOneTimeHealthcareExpenses === true,
              oneTimeProjectionMode: healthcareExpensesComponent.inputs.oneTimeProjectionMode || null
            }
          : null,
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
    DEFAULT_SIMPLE_NEEDS_SETTINGS,
    runDimeAnalysis,
    runSimpleNeedsAnalysis,
    runNeedsAnalysis,
    runHumanLifeValueAnalysis,
    runAnalysisMethods
  };

  lensAnalysis.analysisMethods = Object.assign(
    lensAnalysis.analysisMethods || {},
    analysisMethods
  );
})(window);
