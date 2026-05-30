(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: pure account/analysis/system resolution for expense inflation defaults.
  // Non-goals: no storage access, no admin UI, no Analysis Setup seeding, no calculations.

  const EXPENSE_INFLATION_ACCOUNT_DEFAULTS_RESOLVER_VERSION = 1;
  const MIN_EXPENSE_INFLATION_RATE_PERCENT = 0;
  const MAX_EXPENSE_INFLATION_RATE_PERCENT = 10;
  const EXPENSE_INFLATION_RATE_FIELDS = Object.freeze([
    "generalInflationRatePercent",
    "healthcareInflationRatePercent",
    "longTermCareInflationRatePercent",
    "educationInflationRatePercent",
    "housingOperatingInflationRatePercent",
    "childcareDependentCareInflationRatePercent",
    "foodInflationRatePercent",
    "transportationOperatingInflationRatePercent",
    "finalExpenseInflationRatePercent"
  ]);

  const SYSTEM_EXPENSE_INFLATION_DEFAULTS = Object.freeze({
    version: 1,
    generalInflationRatePercent: 3,
    healthcareInflationRatePercent: 5,
    longTermCareInflationRatePercent: 5,
    educationInflationRatePercent: 5,
    housingOperatingInflationRatePercent: 3.5,
    childcareDependentCareInflationRatePercent: 4,
    foodInflationRatePercent: 3.25,
    transportationOperatingInflationRatePercent: 3.5,
    finalExpenseInflationRatePercent: 3.75
  });

  const SOURCE_CODES = Object.freeze({
    ANALYSIS_SAVED: "analysis-saved",
    ACCOUNT_DEFAULT: "account-default",
    SYSTEM_FALLBACK: "system-fallback",
    INVALID_ANALYSIS_FALLBACK: "invalid-analysis-fallback",
    INVALID_ACCOUNT_FALLBACK: "invalid-account-fallback"
  });

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function cloneSerializable(value) {
    if (Array.isArray(value)) {
      return value.map(cloneSerializable);
    }

    if (isPlainObject(value)) {
      const clone = {};
      Object.keys(value).sort().forEach(function (key) {
        const nextValue = cloneSerializable(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
      });
      return clone;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (value === undefined) {
      return undefined;
    }

    return value;
  }

  function normalizeRateValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    if (
      numericValue < MIN_EXPENSE_INFLATION_RATE_PERCENT
      || numericValue > MAX_EXPENSE_INFLATION_RATE_PERCENT
    ) {
      return null;
    }

    return Number(numericValue.toFixed(2));
  }

  function hasOwn(source, fieldName) {
    return isPlainObject(source) && Object.prototype.hasOwnProperty.call(source, fieldName);
  }

  function addWarning(warnings, code, message, details) {
    warnings.push({
      code,
      message,
      details: cloneSerializable(details || {})
    });
  }

  function addDataGap(dataGaps, code, message, details) {
    dataGaps.push({
      code,
      message,
      details: cloneSerializable(details || {})
    });
  }

  function getExpenseInflationSystemDefaults() {
    return cloneSerializable(SYSTEM_EXPENSE_INFLATION_DEFAULTS);
  }

  function createTraceEntry(fieldName, source, rawValue, resolvedValue, reason) {
    return {
      fieldName,
      source,
      rawValue: cloneSerializable(rawValue),
      resolvedValue,
      reason: reason || null
    };
  }

  function resolveSystemFallback(fieldName, systemDefaults, warnings) {
    const explicitSystemValue = hasOwn(systemDefaults, fieldName)
      ? normalizeRateValue(systemDefaults[fieldName])
      : null;

    if (explicitSystemValue !== null) {
      return explicitSystemValue;
    }

    if (hasOwn(systemDefaults, fieldName)) {
      addWarning(
        warnings,
        "invalid-system-expense-inflation-default",
        "System expense inflation fallback was invalid; built-in MODEL90 fallback was used.",
        { fieldName, rawValue: systemDefaults[fieldName] }
      );
    }

    return SYSTEM_EXPENSE_INFLATION_DEFAULTS[fieldName];
  }

  function resolveField(fieldName, sources, warnings, dataGaps, traceEntries) {
    const systemValue = resolveSystemFallback(fieldName, sources.systemDefaults, warnings);

    if (hasOwn(sources.analysisInflationAssumptions, fieldName)) {
      const analysisValue = normalizeRateValue(sources.analysisInflationAssumptions[fieldName]);
      if (analysisValue !== null) {
        traceEntries.push(createTraceEntry(
          fieldName,
          SOURCE_CODES.ANALYSIS_SAVED,
          sources.analysisInflationAssumptions[fieldName],
          analysisValue
        ));
        return {
          value: analysisValue,
          source: SOURCE_CODES.ANALYSIS_SAVED
        };
      }

      addWarning(
        warnings,
        "invalid-analysis-expense-inflation-default",
        "Saved analysis expense inflation value was invalid and did not override account/system defaults.",
        { fieldName, rawValue: sources.analysisInflationAssumptions[fieldName] }
      );
    }

    if (hasOwn(sources.accountDefaults, fieldName)) {
      const accountValue = normalizeRateValue(sources.accountDefaults[fieldName]);
      if (accountValue !== null) {
        traceEntries.push(createTraceEntry(
          fieldName,
          hasOwn(sources.analysisInflationAssumptions, fieldName)
            ? SOURCE_CODES.INVALID_ANALYSIS_FALLBACK
            : SOURCE_CODES.ACCOUNT_DEFAULT,
          sources.accountDefaults[fieldName],
          accountValue,
          hasOwn(sources.analysisInflationAssumptions, fieldName) ? "analysis-saved-value-invalid" : null
        ));
        return {
          value: accountValue,
          source: hasOwn(sources.analysisInflationAssumptions, fieldName)
            ? SOURCE_CODES.INVALID_ANALYSIS_FALLBACK
            : SOURCE_CODES.ACCOUNT_DEFAULT
        };
      }

      addWarning(
        warnings,
        "invalid-account-expense-inflation-default",
        "Account expense inflation default was invalid and did not override system fallback.",
        { fieldName, rawValue: sources.accountDefaults[fieldName] }
      );
    }

    if (!isPlainObject(sources.accountDefaults)) {
      addDataGap(
        dataGaps,
        "missing-account-expense-inflation-defaults",
        "No account expense inflation defaults were provided; system fallback was used.",
        { fieldName }
      );
    } else if (!hasOwn(sources.accountDefaults, fieldName)) {
      addDataGap(
        dataGaps,
        "missing-account-expense-inflation-default",
        "Account expense inflation default was missing; system fallback was used.",
        { fieldName }
      );
    }

    traceEntries.push(createTraceEntry(
      fieldName,
      hasOwn(sources.accountDefaults, fieldName)
        ? SOURCE_CODES.INVALID_ACCOUNT_FALLBACK
        : SOURCE_CODES.SYSTEM_FALLBACK,
      hasOwn(sources.accountDefaults, fieldName) ? sources.accountDefaults[fieldName] : systemValue,
      systemValue,
      hasOwn(sources.accountDefaults, fieldName) ? "account-default-invalid" : null
    ));

    return {
      value: systemValue,
      source: hasOwn(sources.accountDefaults, fieldName)
        ? SOURCE_CODES.INVALID_ACCOUNT_FALLBACK
        : SOURCE_CODES.SYSTEM_FALLBACK
    };
  }

  function getAccountDefaultsInput(input) {
    const options = isPlainObject(input) ? input : {};
    const accountDefaults = options.accountDefaults;

    if (isPlainObject(accountDefaults?.expenseInflationDefaults)) {
      return accountDefaults.expenseInflationDefaults;
    }

    if (isPlainObject(accountDefaults?.accountDefaults?.expenseInflationDefaults)) {
      return accountDefaults.accountDefaults.expenseInflationDefaults;
    }

    return accountDefaults;
  }

  function resolveExpenseInflationDefaults(input) {
    const options = isPlainObject(input) ? input : {};
    const warnings = [];
    const dataGaps = [];
    const traceEntries = [];
    const resolvedDefaults = { version: SYSTEM_EXPENSE_INFLATION_DEFAULTS.version };
    const fieldSources = {};
    const sources = {
      analysisInflationAssumptions: isPlainObject(options.analysisInflationAssumptions)
        ? cloneSerializable(options.analysisInflationAssumptions)
        : null,
      accountDefaults: isPlainObject(getAccountDefaultsInput(options))
        ? cloneSerializable(getAccountDefaultsInput(options))
        : null,
      systemDefaults: isPlainObject(options.systemDefaults)
        ? cloneSerializable(options.systemDefaults)
        : getExpenseInflationSystemDefaults()
    };

    EXPENSE_INFLATION_RATE_FIELDS.forEach(function (fieldName) {
      const result = resolveField(fieldName, sources, warnings, dataGaps, traceEntries);
      resolvedDefaults[fieldName] = result.value;
      fieldSources[fieldName] = result.source;
    });

    return cloneSerializable({
      resolvedDefaults,
      fieldSources,
      warnings,
      dataGaps,
      trace: {
        calculationMethod: "expense-inflation-account-defaults-resolver-v1",
        resolverVersion: EXPENSE_INFLATION_ACCOUNT_DEFAULTS_RESOLVER_VERSION,
        resolutionOrder: ["analysis-saved", "account-default", "system-fallback"],
        rateFields: EXPENSE_INFLATION_RATE_FIELDS.slice(),
        entries: traceEntries,
        summary: {
          analysisSaved: Object.keys(fieldSources).filter(function (fieldName) {
            return fieldSources[fieldName] === SOURCE_CODES.ANALYSIS_SAVED;
          }).length,
          accountDefault: Object.keys(fieldSources).filter(function (fieldName) {
            return fieldSources[fieldName] === SOURCE_CODES.ACCOUNT_DEFAULT;
          }).length,
          systemFallback: Object.keys(fieldSources).filter(function (fieldName) {
            return fieldSources[fieldName] === SOURCE_CODES.SYSTEM_FALLBACK;
          }).length,
          invalidAnalysisFallback: Object.keys(fieldSources).filter(function (fieldName) {
            return fieldSources[fieldName] === SOURCE_CODES.INVALID_ANALYSIS_FALLBACK;
          }).length,
          invalidAccountFallback: Object.keys(fieldSources).filter(function (fieldName) {
            return fieldSources[fieldName] === SOURCE_CODES.INVALID_ACCOUNT_FALLBACK;
          }).length,
          warningCount: warnings.length,
          dataGapCount: dataGaps.length
        }
      },
      metadata: {
        resolverVersion: EXPENSE_INFLATION_ACCOUNT_DEFAULTS_RESOLVER_VERSION,
        diagnosticOnly: true,
        graphMathChanged: false
      }
    });
  }

  accountSettings.expenseInflationAccountDefaultsResolver = Object.freeze({
    EXPENSE_INFLATION_ACCOUNT_DEFAULTS_RESOLVER_VERSION,
    EXPENSE_INFLATION_RATE_FIELDS,
    MIN_EXPENSE_INFLATION_RATE_PERCENT,
    MAX_EXPENSE_INFLATION_RATE_PERCENT,
    SOURCE_CODES,
    getExpenseInflationSystemDefaults,
    resolveExpenseInflationDefaults
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
