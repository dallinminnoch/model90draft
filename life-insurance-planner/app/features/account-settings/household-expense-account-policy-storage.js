(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: backend-shaped browser-local household expense account policy persistence.
  // Non-goals: no calculation logic, no resolver guardrails, no page/runtime wiring.

  const HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION = 1;
  const HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_TYPE = "householdExpensePolicy";
  const HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_PREFIX = "model90.householdExpenseAccountPolicy.v1";

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

  function createHouseholdExpenseAccountPolicyStorageKey(accountId) {
    const normalizedAccountId = normalizeAccountId(accountId) || "missing-account-id";
    return HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_PREFIX + ":" + encodeURIComponent(normalizedAccountId);
  }

  function addWarning(warnings, code, message, details) {
    warnings.push({
      code,
      message,
      details: cloneSerializable(details || {})
    });
  }

  function makeTrace(operation, accountId, status, details) {
    return {
      calculationMethod: "household-expense-account-policy-storage-v1",
      storageVersion: HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION,
      operation,
      accountId,
      status,
      details: cloneSerializable(details || {})
    };
  }

  function normalizeArrayNamespace(value) {
    return Array.isArray(value) ? cloneSerializable(value) : [];
  }

  function normalizeObjectNamespace(value) {
    return isPlainObject(value) ? cloneSerializable(value) : {};
  }

  function createEmptyHouseholdExpenseAccountPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const accountId = normalizeAccountId(options.accountId);

    return {
      version: HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION,
      lifestyleRangeOverrides: [],
      compressionThresholdOverrides: [],
      compressionPolicyOverrides: [],
      guardrails: {},
      metadata: {
        accountId: accountId || null,
        source: "emptyPolicy"
      }
    };
  }

  function normalizeAccountPolicy(accountPolicy, accountId) {
    const policy = isPlainObject(accountPolicy) ? accountPolicy : {};
    const metadata = normalizeObjectNamespace(policy.metadata);

    return {
      version: Number.isFinite(Number(policy.version))
        ? Number(policy.version)
        : HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION,
      lifestyleRangeOverrides: normalizeArrayNamespace(policy.lifestyleRangeOverrides),
      compressionThresholdOverrides: normalizeArrayNamespace(policy.compressionThresholdOverrides),
      compressionPolicyOverrides: normalizeArrayNamespace(policy.compressionPolicyOverrides),
      guardrails: normalizeObjectNamespace(policy.guardrails),
      metadata: Object.assign({}, metadata, {
        accountId: normalizeAccountId(accountId) || metadata.accountId || null
      })
    };
  }

  function normalizeMetadata(metadata, accountId) {
    const explicit = normalizeObjectNamespace(metadata);
    return Object.assign({}, explicit, {
      source: explicit.source || "browserLocalV1",
      updatedAt: explicit.updatedAt || null,
      updatedBy: explicit.updatedBy || null,
      accountId: normalizeAccountId(accountId) || explicit.accountId || null
    });
  }

  function createEnvelope(accountId, accountPolicy, metadata) {
    const normalizedAccountId = normalizeAccountId(accountId);
    const normalizedPolicy = normalizeAccountPolicy(accountPolicy, normalizedAccountId);

    return {
      version: HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION,
      policyType: HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_TYPE,
      accountId: normalizedAccountId || null,
      accountPolicy: normalizedPolicy,
      metadata: normalizeMetadata(metadata, normalizedAccountId)
    };
  }

  function makeFallbackResult(operation, accountId, storageKey, warnings, reasonCode, message, details) {
    if (reasonCode && message) {
      addWarning(warnings, reasonCode, message, details);
    }

    const emptyPolicy = createEmptyHouseholdExpenseAccountPolicy({ accountId });
    const envelope = createEnvelope(accountId, emptyPolicy, {
      source: "browserLocalV1",
      fallbackReason: reasonCode || null
    });

    return {
      status: "fallback",
      accountId: normalizeAccountId(accountId) || null,
      storageKey,
      accountPolicy: emptyPolicy,
      envelope,
      warnings,
      dataGaps: [],
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

  function getStorageMethod(storage, methodName) {
    return storage && typeof storage[methodName] === "function" ? storage[methodName].bind(storage) : null;
  }

  function parseStoredEnvelope(rawValue, accountId, storageKey, warnings) {
    let parsed;
    try {
      parsed = JSON.parse(rawValue);
    } catch (error) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "corrupt-account-policy-json",
        "Saved household expense account policy could not be parsed.",
        { errorMessage: error && error.message ? error.message : String(error) }
      );
    }

    if (!isPlainObject(parsed)) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "invalid-account-policy-envelope",
        "Saved household expense account policy envelope was ignored because it is not an object."
      );
    }

    if (parsed.version !== HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "unsupported-account-policy-envelope-version",
        "Saved household expense account policy uses an unsupported envelope version.",
        { version: parsed.version == null ? null : parsed.version }
      );
    }

    if (parsed.policyType !== HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_TYPE) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "invalid-account-policy-type",
        "Saved household expense account policy envelope had an invalid policy type.",
        { policyType: parsed.policyType == null ? null : parsed.policyType }
      );
    }

    const requestedAccountId = normalizeAccountId(accountId);
    const envelopeAccountId = normalizeAccountId(parsed.accountId);
    if (requestedAccountId && envelopeAccountId && requestedAccountId !== envelopeAccountId) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "account-policy-account-id-mismatch",
        "Saved household expense account policy belonged to a different account id.",
        { envelopeAccountId }
      );
    }

    if (!isPlainObject(parsed.accountPolicy)) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "invalid-account-policy-body",
        "Saved household expense account policy body was ignored because it is not an object."
      );
    }

    const normalizedEnvelope = createEnvelope(
      requestedAccountId || envelopeAccountId,
      parsed.accountPolicy,
      parsed.metadata
    );

    return {
      status: "loaded",
      accountId: normalizedEnvelope.accountId,
      storageKey,
      accountPolicy: normalizedEnvelope.accountPolicy,
      envelope: normalizedEnvelope,
      warnings,
      dataGaps: [],
      metadata: Object.assign({}, normalizedEnvelope.metadata, {
        source: "browserLocalV1",
        fallback: false
      }),
      trace: makeTrace("load", normalizedEnvelope.accountId, "loaded", {
        namespaceCounts: {
          lifestyleRangeOverrides: normalizedEnvelope.accountPolicy.lifestyleRangeOverrides.length,
          compressionThresholdOverrides: normalizedEnvelope.accountPolicy.compressionThresholdOverrides.length,
          compressionPolicyOverrides: normalizedEnvelope.accountPolicy.compressionPolicyOverrides.length
        }
      })
    };
  }

  function loadHouseholdExpenseAccountPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const accountId = normalizeAccountId(options.accountId);
    const storageKey = createHouseholdExpenseAccountPolicyStorageKey(accountId);
    const warnings = [];

    if (!accountId) {
      addWarning(warnings, "missing-account-id", "Household expense account policy storage was requested without an account id.");
    }

    const getItem = getStorageMethod(options.storage, "getItem");
    if (!getItem) {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "storage-unavailable",
        "Household expense account policy storage was unavailable."
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
        "storage-read-failed",
        "Household expense account policy storage could not be read.",
        { errorMessage: error && error.message ? error.message : String(error) }
      );
    }

    if (rawValue == null || rawValue === "") {
      return makeFallbackResult(
        "load",
        accountId,
        storageKey,
        warnings,
        "missing-account-policy",
        "No saved household expense account policy was found for this account."
      );
    }

    return parseStoredEnvelope(rawValue, accountId, storageKey, warnings);
  }

  function saveHouseholdExpenseAccountPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const accountId = normalizeAccountId(options.accountId);
    const storageKey = createHouseholdExpenseAccountPolicyStorageKey(accountId);
    const warnings = [];

    if (!accountId) {
      addWarning(warnings, "missing-account-id", "Household expense account policy storage was requested without an account id.");
    }

    const setItem = getStorageMethod(options.storage, "setItem");
    const envelope = createEnvelope(accountId, options.accountPolicy, options.metadata);

    if (!setItem) {
      const fallback = makeFallbackResult(
        "save",
        accountId,
        storageKey,
        warnings,
        "storage-unavailable",
        "Household expense account policy storage was unavailable."
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
        "storage-write-failed",
        "Household expense account policy storage could not be written.",
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
      accountPolicy: envelope.accountPolicy,
      envelope,
      warnings,
      dataGaps: [],
      metadata: Object.assign({}, envelope.metadata, {
        fallback: false
      }),
      trace: makeTrace("save", envelope.accountId, "saved", {
        namespaceCounts: {
          lifestyleRangeOverrides: envelope.accountPolicy.lifestyleRangeOverrides.length,
          compressionThresholdOverrides: envelope.accountPolicy.compressionThresholdOverrides.length,
          compressionPolicyOverrides: envelope.accountPolicy.compressionPolicyOverrides.length
        }
      })
    };
  }

  function removeHouseholdExpenseAccountPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const accountId = normalizeAccountId(options.accountId);
    const storageKey = createHouseholdExpenseAccountPolicyStorageKey(accountId);
    const warnings = [];

    if (!accountId) {
      addWarning(warnings, "missing-account-id", "Household expense account policy storage was requested without an account id.");
    }

    const removeItem = getStorageMethod(options.storage, "removeItem");
    if (!removeItem) {
      return {
        status: "notRemoved",
        removed: false,
        accountId: accountId || null,
        storageKey,
        warnings: warnings.concat([{
          code: "storage-unavailable",
          message: "Household expense account policy storage was unavailable.",
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
          message: "Household expense account policy storage could not be removed.",
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

  accountSettings.householdExpenseAccountPolicyStorage = Object.freeze({
    HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_VERSION,
    HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_TYPE,
    HOUSEHOLD_EXPENSE_ACCOUNT_POLICY_STORAGE_PREFIX,
    createHouseholdExpenseAccountPolicyStorageKey,
    createEmptyHouseholdExpenseAccountPolicy,
    loadHouseholdExpenseAccountPolicy,
    saveHouseholdExpenseAccountPolicy,
    removeHouseholdExpenseAccountPolicy
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
