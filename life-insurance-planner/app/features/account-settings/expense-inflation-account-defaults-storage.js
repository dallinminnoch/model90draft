(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: backend-shaped browser-local account defaults for expense inflation assumptions.
  // Non-goals: no admin UI, no Analysis Setup wiring, no calculation consumption.

  const EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION = 1;
  const EXPENSE_INFLATION_ACCOUNT_DEFAULTS_SETTINGS_TYPE = "expenseInflationDefaults";
  const EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_PREFIX = "model90.expenseInflationAccountDefaults.v1";
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
    version: EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION,
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

  function normalizeAccountId(accountId) {
    return String(accountId == null ? "" : accountId).trim();
  }

  function getStorageMethod(storage, methodName) {
    return storage && typeof storage[methodName] === "function"
      ? storage[methodName].bind(storage)
      : null;
  }

  function createExpenseInflationAccountDefaultsStorageKey(accountId) {
    const normalizedAccountId = normalizeAccountId(accountId) || "missing-account-id";
    return EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_PREFIX + ":" + encodeURIComponent(normalizedAccountId);
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

  function makeTrace(operation, accountId, status, details) {
    return {
      calculationMethod: "expense-inflation-account-defaults-storage-v1",
      storageVersion: EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION,
      operation,
      accountId,
      status,
      details: cloneSerializable(details || {})
    };
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

  function getExpenseInflationSystemDefaults() {
    return cloneSerializable(SYSTEM_EXPENSE_INFLATION_DEFAULTS);
  }

  function normalizeExpenseInflationDefaults(input, warnings, dataGaps) {
    const defaults = isPlainObject(input) ? input : {};
    const normalized = getExpenseInflationSystemDefaults();

    if (!isPlainObject(input) && input != null) {
      addWarning(
        warnings,
        "invalid-expense-inflation-defaults",
        "Expense inflation account defaults were ignored because they were not an object."
      );
    }

    EXPENSE_INFLATION_RATE_FIELDS.forEach(function (fieldName) {
      if (!Object.prototype.hasOwnProperty.call(defaults, fieldName)) {
        addDataGap(
          dataGaps,
          "missing-expense-inflation-default",
          "Expense inflation account default was missing and fell back to the system default.",
          { fieldName, fallbackValue: normalized[fieldName] }
        );
        return;
      }

      const normalizedValue = normalizeRateValue(defaults[fieldName]);
      if (normalizedValue === null) {
        addWarning(
          warnings,
          "invalid-expense-inflation-default",
          "Expense inflation account default was invalid and fell back to the system default.",
          {
            fieldName,
            rawValue: defaults[fieldName],
            fallbackValue: normalized[fieldName],
            minRatePercent: MIN_EXPENSE_INFLATION_RATE_PERCENT,
            maxRatePercent: MAX_EXPENSE_INFLATION_RATE_PERCENT
          }
        );
        return;
      }

      normalized[fieldName] = normalizedValue;
    });

    return normalized;
  }

  function normalizeMetadata(metadata, accountId) {
    const explicit = isPlainObject(metadata) ? cloneSerializable(metadata) : {};
    return Object.assign({}, explicit, {
      source: explicit.source || "browserLocalV1",
      updatedAt: explicit.updatedAt || null,
      updatedBy: explicit.updatedBy || null,
      accountId: normalizeAccountId(accountId) || explicit.accountId || null
    });
  }

  function createEnvelope(accountId, defaults, metadata, warnings, dataGaps) {
    const normalizedAccountId = normalizeAccountId(accountId);
    const normalizedDefaults = normalizeExpenseInflationDefaults(defaults, warnings, dataGaps);

    return {
      version: EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION,
      settingsType: EXPENSE_INFLATION_ACCOUNT_DEFAULTS_SETTINGS_TYPE,
      accountId: normalizedAccountId || null,
      accountDefaults: {
        expenseInflationDefaults: normalizedDefaults
      },
      metadata: normalizeMetadata(metadata, normalizedAccountId)
    };
  }

  function makeFallbackResult(operation, accountId, storageKey, warnings, dataGaps, reasonCode, message, details) {
    if (reasonCode && message) {
      addWarning(warnings, reasonCode, message, details);
    }

    const envelopeWarnings = [];
    const envelopeDataGaps = [];
    const envelope = createEnvelope(accountId, getExpenseInflationSystemDefaults(), {
      source: "browserLocalV1",
      fallbackReason: reasonCode || null
    }, envelopeWarnings, envelopeDataGaps);

    return {
      status: "fallback",
      accountId: normalizeAccountId(accountId) || null,
      storageKey,
      accountDefaults: envelope.accountDefaults,
      envelope,
      warnings,
      dataGaps,
      metadata: {
        source: "browserLocalV1",
        fallback: true,
        fallbackReason: reasonCode || null
      },
      trace: makeTrace(operation, normalizeAccountId(accountId) || null, "fallback", {
        reasonCode: reasonCode || null
      })
    };
  }

  function parseStoredEnvelope(rawValue, accountId, storageKey, warnings, dataGaps) {
    let parsed;
    try {
      parsed = JSON.parse(rawValue);
    } catch (error) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "corrupt-expense-inflation-account-defaults",
        "Saved expense inflation account defaults could not be parsed.",
        { errorMessage: error && error.message ? error.message : String(error) }
      );
    }

    if (!isPlainObject(parsed)) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "invalid-expense-inflation-account-defaults-envelope",
        "Saved expense inflation account defaults were ignored because the envelope was not an object."
      );
    }

    if (parsed.version !== EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "unsupported-expense-inflation-account-defaults-version",
        "Saved expense inflation account defaults used an unsupported version.",
        { version: parsed.version }
      );
    }

    if (parsed.settingsType !== EXPENSE_INFLATION_ACCOUNT_DEFAULTS_SETTINGS_TYPE) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "wrong-expense-inflation-account-defaults-type",
        "Saved expense inflation account defaults used the wrong settings type.",
        { settingsType: parsed.settingsType }
      );
    }

    const normalizedAccountId = normalizeAccountId(accountId);
    const storedAccountId = normalizeAccountId(parsed.accountId);
    if (normalizedAccountId && storedAccountId && normalizedAccountId !== storedAccountId) {
      addWarning(
        warnings,
        "expense-inflation-account-defaults-account-mismatch",
        "Saved expense inflation account defaults were ignored because the account id did not match.",
        { expectedAccountId: normalizedAccountId, actualAccountId: storedAccountId }
      );
      addDataGap(
        dataGaps,
        "expense-inflation-account-defaults-account-mismatch",
        "Stored account defaults belonged to a different account."
      );
      return makeFallbackResult("load", accountId, storageKey, warnings, dataGaps);
    }

    const storedDefaults = parsed.accountDefaults?.expenseInflationDefaults;
    const envelope = createEnvelope(
      normalizedAccountId || storedAccountId,
      storedDefaults,
      parsed.metadata,
      warnings,
      dataGaps
    );

    return {
      status: "loaded",
      accountId: envelope.accountId,
      storageKey,
      accountDefaults: envelope.accountDefaults,
      envelope,
      warnings,
      dataGaps,
      metadata: Object.assign({}, envelope.metadata, {
        fallback: false
      }),
      trace: makeTrace("load", envelope.accountId, "loaded", {
        fieldCount: EXPENSE_INFLATION_RATE_FIELDS.length
      })
    };
  }

  function getOptionsFromArguments(accountIdOrOptions, defaults, metadata, storage) {
    if (isPlainObject(accountIdOrOptions)) {
      return accountIdOrOptions;
    }

    return {
      accountId: accountIdOrOptions,
      defaults,
      metadata,
      storage
    };
  }

  function loadExpenseInflationAccountDefaults(accountIdOrOptions) {
    const options = getOptionsFromArguments(accountIdOrOptions);
    const accountId = normalizeAccountId(options.accountId);
    const storageKey = createExpenseInflationAccountDefaultsStorageKey(accountId);
    const warnings = [];
    const dataGaps = [];

    if (!accountId) {
      addWarning(warnings, "missing-account-id", "Expense inflation account defaults storage was requested without an account id.");
    }

    const storage = options.storage || global.localStorage;
    const getItem = getStorageMethod(storage, "getItem");
    if (!getItem) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "storage-unavailable",
        "Expense inflation account defaults storage was unavailable."
      );
    }

    let rawValue;
    try {
      rawValue = getItem(storageKey);
    } catch (error) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "storage-read-failed",
        "Expense inflation account defaults storage could not be read.",
        { errorMessage: error && error.message ? error.message : String(error) }
      );
    }

    if (!rawValue) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "missing-expense-inflation-account-defaults",
        "No saved expense inflation account defaults were found for this account."
      );
    }

    return parseStoredEnvelope(rawValue, accountId, storageKey, warnings, dataGaps);
  }

  function saveExpenseInflationAccountDefaults(accountIdOrOptions, defaults, metadata, storage) {
    const options = getOptionsFromArguments(accountIdOrOptions, defaults, metadata, storage);
    const accountId = normalizeAccountId(options.accountId);
    const storageKey = createExpenseInflationAccountDefaultsStorageKey(accountId);
    const warnings = [];
    const dataGaps = [];

    if (!accountId) {
      addWarning(warnings, "missing-account-id", "Expense inflation account defaults storage was requested without an account id.");
    }

    const setItem = getStorageMethod(options.storage || global.localStorage, "setItem");
    const envelope = createEnvelope(accountId, options.defaults, options.metadata, warnings, dataGaps);

    if (!setItem) {
      const fallback = makeFallbackResult(
        "save",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "storage-unavailable",
        "Expense inflation account defaults storage was unavailable."
      );
      return Object.assign({}, fallback, {
        status: "notSaved",
        saved: false,
        trace: makeTrace("save", accountId || null, "notSaved", { reasonCode: "storage-unavailable" })
      });
    }

    try {
      setItem(storageKey, JSON.stringify(envelope));
    } catch (error) {
      const fallback = makeFallbackResult(
        "save",
        accountId,
        storageKey,
        warnings,
        dataGaps,
        "storage-write-failed",
        "Expense inflation account defaults storage could not be written.",
        { errorMessage: error && error.message ? error.message : String(error) }
      );
      return Object.assign({}, fallback, {
        status: "notSaved",
        saved: false,
        trace: makeTrace("save", accountId || null, "notSaved", { reasonCode: "storage-write-failed" })
      });
    }

    return {
      status: "saved",
      saved: true,
      accountId: envelope.accountId,
      storageKey,
      accountDefaults: envelope.accountDefaults,
      envelope,
      warnings,
      dataGaps,
      metadata: Object.assign({}, envelope.metadata, {
        fallback: false
      }),
      trace: makeTrace("save", envelope.accountId, "saved", {
        fieldCount: EXPENSE_INFLATION_RATE_FIELDS.length
      })
    };
  }

  function removeExpenseInflationAccountDefaults(accountIdOrOptions) {
    const options = getOptionsFromArguments(accountIdOrOptions);
    const accountId = normalizeAccountId(options.accountId);
    const storageKey = createExpenseInflationAccountDefaultsStorageKey(accountId);
    const warnings = [];

    if (!accountId) {
      addWarning(warnings, "missing-account-id", "Expense inflation account defaults storage was requested without an account id.");
    }

    const removeItem = getStorageMethod(options.storage || global.localStorage, "removeItem");
    if (!removeItem) {
      return {
        status: "notRemoved",
        removed: false,
        accountId: accountId || null,
        storageKey,
        warnings: warnings.concat([{
          code: "storage-unavailable",
          message: "Expense inflation account defaults storage was unavailable.",
          details: {}
        }]),
        dataGaps: [],
        metadata: {
          source: "browserLocalV1",
          fallback: true
        },
        trace: makeTrace("remove", accountId || null, "notRemoved", { reasonCode: "storage-unavailable" })
      };
    }

    try {
      removeItem(storageKey);
    } catch (error) {
      return {
        status: "notRemoved",
        removed: false,
        accountId: accountId || null,
        storageKey,
        warnings: warnings.concat([{
          code: "storage-remove-failed",
          message: "Expense inflation account defaults storage could not be removed.",
          details: { errorMessage: error && error.message ? error.message : String(error) }
        }]),
        dataGaps: [],
        metadata: {
          source: "browserLocalV1",
          fallback: true
        },
        trace: makeTrace("remove", accountId || null, "notRemoved", { reasonCode: "storage-remove-failed" })
      };
    }

    return {
      status: "removed",
      removed: true,
      accountId: accountId || null,
      storageKey,
      warnings,
      dataGaps: [],
      metadata: {
        source: "browserLocalV1",
        fallback: false
      },
      trace: makeTrace("remove", accountId || null, "removed")
    };
  }

  accountSettings.expenseInflationAccountDefaultsStorage = Object.freeze({
    EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_VERSION,
    EXPENSE_INFLATION_ACCOUNT_DEFAULTS_SETTINGS_TYPE,
    EXPENSE_INFLATION_ACCOUNT_DEFAULTS_STORAGE_PREFIX,
    EXPENSE_INFLATION_RATE_FIELDS,
    MIN_EXPENSE_INFLATION_RATE_PERCENT,
    MAX_EXPENSE_INFLATION_RATE_PERCENT,
    createExpenseInflationAccountDefaultsStorageKey,
    getExpenseInflationSystemDefaults,
    loadExpenseInflationAccountDefaults,
    saveExpenseInflationAccountDefaults,
    removeExpenseInflationAccountDefaults
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
