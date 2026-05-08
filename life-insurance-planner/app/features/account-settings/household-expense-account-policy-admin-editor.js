(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: admin household expense policy lifestyle range override editor.
  // Non-goals: no calculation logic, no compression/threshold editing, no runtime graph wiring.

  const TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const POLICY_EDITOR_HOST_SELECTOR = "[data-household-expense-account-policy-editor]";
  const FOOD_AT_HOME_BAND_KEYS = Object.freeze([
    "infantToddler",
    "youngChild",
    "olderChild",
    "teenMale",
    "teenFemale",
    "adultMale",
    "adultFemale",
    "adultUnknown",
    "childUnknown"
  ]);
  const HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS = Object.freeze(["1", "2", "3", "4", "5", "6Plus"]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      const clone = {};
      Object.keys(value).sort().forEach(function (key) {
        const nextValue = clonePlainValue(value[key]);
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

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRatio(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "n/a";
  }

  function formatRatioInputValue(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "";
  }

  function asFiniteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function asOptionalFiniteNumber(value) {
    if (value == null || String(value).trim() === "") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function normalizeRatioForSave(value) {
    const numericValue = asFiniteNumber(value);
    return numericValue === null ? null : Number(numericValue.toFixed(4));
  }

  function ratiosEqual(left, right) {
    const leftValue = asFiniteNumber(left);
    const rightValue = asFiniteNumber(right);
    if (leftValue === null || rightValue === null) {
      return leftValue === rightValue;
    }
    return Math.abs(leftValue - rightValue) <= 0.000001;
  }

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeNullableText(value) {
    const text = String(value == null ? "" : value).trim();
    return text || null;
  }

  function normalizeFoodAtHomeSource(value) {
    return normalizeNullableText(value) || "ADMIN_ENTERED";
  }

  function formatNumberInputValue(value) {
    const numericValue = asOptionalFiniteNumber(value);
    return numericValue === null ? "" : String(numericValue);
  }

  function getWarningList(source) {
    return Array.isArray(source?.warnings) ? source.warnings.filter(isPlainObject) : [];
  }

  function getDataGapList(source) {
    return Array.isArray(source?.dataGaps) ? source.dataGaps.filter(isPlainObject) : [];
  }

  function getPolicyInputs(currentLensAnalysis) {
    const lensAnalysis = isPlainObject(currentLensAnalysis) ? currentLensAnalysis : {};
    const lifestylePolicy = lensAnalysis.householdExpenseLifestyleRangePolicy;
    const compressionPolicy = lensAnalysis.householdExpenseCompressionPolicy;
    const compressionThresholds = lensAnalysis.expenseCompressionThresholds;

    return {
      defaultLifestyleRangePolicies: lifestylePolicy && typeof lifestylePolicy.listLifestyleRangePolicies === "function"
        ? lifestylePolicy.listLifestyleRangePolicies()
        : [],
      defaultCompressionPolicyRules: compressionPolicy && typeof compressionPolicy.getHouseholdExpenseCompressionPolicyRules === "function"
        ? compressionPolicy.getHouseholdExpenseCompressionPolicyRules()
        : [],
      defaultCompressionThresholdRules: compressionThresholds && typeof compressionThresholds.getExpenseCompressionThresholdRules === "function"
        ? compressionThresholds.getExpenseCompressionThresholdRules()
        : []
    };
  }

  function getPolicyStatus(storageResult, resolvedPolicy) {
    if (storageResult?.status === "loaded") {
      return {
        code: "accountOverride",
        label: "Saved account override"
      };
    }

    if (storageResult?.status === "fallback" && storageResult?.metadata?.fallbackReason === "missing-account-policy") {
      return {
        code: "defaultSeedPolicy",
        label: "Default seed policy"
      };
    }

    if (!resolvedPolicy) {
      return {
        code: "fallbackPolicy",
        label: "Fallback policy"
      };
    }

    return {
      code: "fallbackPolicy",
      label: "Fallback policy"
    };
  }

  function getLoadedAccountPolicy(storageResult) {
    return storageResult?.status === "loaded" && isPlainObject(storageResult.accountPolicy)
      ? storageResult.accountPolicy
      : null;
  }

  function createEmptyAccountPolicy(accountId, storageApi) {
    if (storageApi && typeof storageApi.createEmptyHouseholdExpenseAccountPolicy === "function") {
      return storageApi.createEmptyHouseholdExpenseAccountPolicy({ accountId });
    }

    return {
      version: 1,
      lifestyleRangeOverrides: [],
      compressionThresholdOverrides: [],
      compressionPolicyOverrides: [],
      guardrails: {},
      metadata: {
        accountId: accountId || null,
        source: "adminEditorEmptyPolicy"
      }
    };
  }

  function getAccountPolicyForSave(storageResult, accountId, storageApi) {
    const loadedPolicy = getLoadedAccountPolicy(storageResult);
    return loadedPolicy
      ? clonePlainValue(loadedPolicy)
      : createEmptyAccountPolicy(accountId, storageApi);
  }

  function getLifestyleOverrideRows(accountPolicy) {
    return Array.isArray(accountPolicy?.lifestyleRangeOverrides)
      ? accountPolicy.lifestyleRangeOverrides.filter(isPlainObject).map(clonePlainValue)
      : [];
  }

  function getLivingFloorAssumptions(accountPolicy) {
    return isPlainObject(accountPolicy?.livingFloorAssumptions)
      ? accountPolicy.livingFloorAssumptions
      : {};
  }

  function getFoodAtHomeAssumptions(accountPolicy) {
    const assumptions = getLivingFloorAssumptions(accountPolicy);
    return isPlainObject(assumptions.foodAtHome) ? assumptions.foodAtHome : {};
  }

  function toFoodAtHomeBandEditorRows(monthlyAmountsByBand) {
    const values = isPlainObject(monthlyAmountsByBand) ? monthlyAmountsByBand : {};
    return FOOD_AT_HOME_BAND_KEYS.map(function (bandKey) {
      return {
        bandKey,
        value: asOptionalFiniteNumber(values[bandKey]),
        inputValue: formatNumberInputValue(values[bandKey])
      };
    });
  }

  function toHouseholdSizeFactorEditorRows(householdSizeAdjustmentFactors) {
    const values = isPlainObject(householdSizeAdjustmentFactors) ? householdSizeAdjustmentFactors : {};
    return HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.map(function (factorKey) {
      return {
        factorKey,
        value: asOptionalFiniteNumber(values[factorKey]),
        inputValue: formatNumberInputValue(values[factorKey])
      };
    });
  }

  function buildFoodAtHomeFloorAssumptionsEditorModel(accountPolicy) {
    const foodAtHome = getFoodAtHomeAssumptions(accountPolicy);
    return {
      planningBucketKey: "foodAtHomeConsumables",
      source: normalizeFoodAtHomeSource(foodAtHome.source),
      sourcePeriod: normalizeNullableText(foodAtHome.sourcePeriod),
      bandRows: toFoodAtHomeBandEditorRows(foodAtHome.monthlyAmountsByBand),
      householdSizeAdjustmentFactorRows: toHouseholdSizeFactorEditorRows(foodAtHome.householdSizeAdjustmentFactors)
    };
  }

  function rowMatchesPolicy(override, policy) {
    const rangePolicyId = normalizeKey(override.rangePolicyId || override.overrideKey);
    const expenseTypeKey = normalizeKey(override.expenseTypeKey || override.typeKey || override.overrideKey);
    const categoryKey = normalizeKey(override.categoryKey);

    return Boolean(
      (rangePolicyId && rangePolicyId === normalizeKey(policy.rangePolicyId))
      || (expenseTypeKey && expenseTypeKey === normalizeKey(policy.expenseTypeKey))
      || (categoryKey && categoryKey === normalizeKey(policy.categoryKey))
    );
  }

  function findResolvedPolicy(resolvedRows, defaultPolicy) {
    return resolvedRows.find(function (candidate) {
      return normalizeKey(candidate.expenseTypeKey) === normalizeKey(defaultPolicy.expenseTypeKey);
    }) || defaultPolicy;
  }

  function getSparseOverridePreview(override) {
    if (!isPlainObject(override)) {
      return null;
    }

    const preview = {};
    [
      "rangePolicyId",
      "expenseTypeKey",
      "conservativeFloorRatio",
      "elevatedCeilingRatio"
    ].forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(override, field)) {
        preview[field] = clonePlainValue(override[field]);
      }
    });
    return preview;
  }

  function getMaxElevatedCeilingRatio(currentLensAnalysis) {
    const value = Number(currentLensAnalysis?.householdExpenseAccountPolicyResolver?.DEFAULT_HARD_GUARDRAILS?.maxElevatedCeilingRatio);
    return Number.isFinite(value) && value >= 1 ? value : 2;
  }

  function buildLifestyleRangeEditorRows(defaultRows, resolvedRows, overrideRows) {
    const resolvedList = Array.isArray(resolvedRows) ? resolvedRows : [];
    const overrides = Array.isArray(overrideRows) ? overrideRows : [];

    return (Array.isArray(defaultRows) ? defaultRows : [])
      .filter(function (row) {
        return row && row.sliderEligible === true;
      })
      .map(function (defaultPolicy) {
        const resolvedPolicy = findResolvedPolicy(resolvedList, defaultPolicy);
        const override = overrides.find(function (candidate) {
          return rowMatchesPolicy(candidate, defaultPolicy);
        }) || null;

        return {
          rangePolicyId: defaultPolicy.rangePolicyId || null,
          displayName: defaultPolicy.displayName || defaultPolicy.expenseTypeKey || "Unnamed expense",
          expenseTypeKey: defaultPolicy.expenseTypeKey || null,
          categoryKey: defaultPolicy.categoryKey || null,
          rangeBehavior: defaultPolicy.rangeBehavior || null,
          defaultConservativeFloorRatio: defaultPolicy.conservativeFloorRatio,
          defaultElevatedCeilingRatio: defaultPolicy.elevatedCeilingRatio,
          resolvedConservativeFloorRatio: resolvedPolicy.conservativeFloorRatio,
          resolvedElevatedCeilingRatio: resolvedPolicy.elevatedCeilingRatio,
          overrideStatus: override ? "accountOverride" : "defaultSeedPolicy",
          sparseOverridePreview: getSparseOverridePreview(override)
        };
      });
  }

  function buildHouseholdExpensePolicyEditorModel(input) {
    const options = isPlainObject(input) ? input : {};
    const currentLensAnalysis = isPlainObject(options.currentLensAnalysis)
      ? options.currentLensAnalysis
      : (global.LensApp?.lensAnalysis || {});
    const storageApi = options.storageApi || global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    const resolver = options.resolver || currentLensAnalysis.householdExpenseAccountPolicyResolver?.resolveHouseholdExpenseAccountPolicy;
    const storage = options.storage || global.localStorage;
    const accountId = options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID;
    const warnings = [];
    const dataGaps = [];

    let storageResult = null;
    if (storageApi && typeof storageApi.loadHouseholdExpenseAccountPolicy === "function") {
      storageResult = storageApi.loadHouseholdExpenseAccountPolicy({
        accountId,
        storage
      });
      warnings.push.apply(warnings, getWarningList(storageResult));
      dataGaps.push.apply(dataGaps, getDataGapList(storageResult));
    } else {
      warnings.push({
        code: "household-expense-policy-storage-unavailable",
        message: "Household expense account policy storage adapter is unavailable."
      });
    }

    const policyInputs = getPolicyInputs(currentLensAnalysis);
    const accountPolicy = getLoadedAccountPolicy(storageResult);
    let resolvedPolicy = null;
    if (typeof resolver === "function") {
      resolvedPolicy = resolver(Object.assign({}, policyInputs, {
        accountPolicy
      }));
      warnings.push.apply(warnings, getWarningList(resolvedPolicy));
      dataGaps.push.apply(dataGaps, getDataGapList(resolvedPolicy));
    } else {
      dataGaps.push({
        code: "household-expense-policy-resolver-unavailable",
        message: "Household expense account policy resolver is unavailable."
      });
    }

    const resolvedRows = Array.isArray(resolvedPolicy?.resolvedLifestyleRangePolicies)
      ? resolvedPolicy.resolvedLifestyleRangePolicies
      : policyInputs.defaultLifestyleRangePolicies;
    const overrideRows = getLifestyleOverrideRows(accountPolicy);
    const accountPolicyForSave = getAccountPolicyForSave(storageResult, accountId, storageApi);
    const rows = buildLifestyleRangeEditorRows(
      policyInputs.defaultLifestyleRangePolicies,
      resolvedRows,
      overrideRows
    );
    const status = getPolicyStatus(storageResult, resolvedPolicy);

    return clonePlainValue({
      accountId,
      accountIdSource: "temporaryLocalAdminFallback",
      status,
      rows,
      counts: {
        previewRows: rows.length,
        lifestyleRangeOverrides: status.code === "accountOverride" ? overrideRows.length : 0,
        rowsWithOverrides: rows.filter(function (row) {
          return row.overrideStatus === "accountOverride";
        }).length,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      },
      accountPolicy: accountPolicyForSave,
      foodAtHomeFloorAssumptions: buildFoodAtHomeFloorAssumptionsEditorModel(accountPolicyForSave),
      limits: {
        maxElevatedCeilingRatio: getMaxElevatedCeilingRatio(currentLensAnalysis)
      },
      warnings,
      dataGaps,
      trace: {
        source: "admin-household-expense-account-policy-editor-v1",
        accountId,
        accountIdSource: "temporaryLocalAdminFallback",
        storageStatus: storageResult?.status || "unavailable",
        storageFallbackReason: storageResult?.metadata?.fallbackReason || null,
        policySource: status.code,
        resolverAvailable: typeof resolver === "function",
        editableNamespaces: ["lifestyleRangeOverrides", "livingFloorAssumptions.foodAtHome"],
        editableFields: [
          "conservativeFloorRatio",
          "elevatedCeilingRatio",
          "foodAtHome.source",
          "foodAtHome.sourcePeriod",
          "foodAtHome.monthlyAmountsByBand",
          "foodAtHome.householdSizeAdjustmentFactors"
        ],
        sparseOverridePayloadOnly: true
      }
    });
  }

  function validateLifestyleRatioDraftRow(draftRow, maxElevatedCeilingRatio) {
    const row = isPlainObject(draftRow) ? draftRow : {};
    const maxCeiling = Number.isFinite(Number(maxElevatedCeilingRatio))
      ? Number(maxElevatedCeilingRatio)
      : 2;
    const floor = asFiniteNumber(row.conservativeFloorRatio);
    const ceiling = asFiniteNumber(row.elevatedCeilingRatio);
    const messages = [];

    if (floor === null) {
      messages.push("Conservative floor must be a finite number.");
    } else {
      if (floor < 0) {
        messages.push("Conservative floor must be at least 0.00.");
      }
      if (floor > 1) {
        messages.push("Conservative floor must be 1.00 or lower.");
      }
    }

    if (ceiling === null) {
      messages.push("Elevated ceiling must be a finite number.");
    } else {
      if (ceiling < 1) {
        messages.push("Elevated ceiling must be at least 1.00.");
      }
      if (ceiling > maxCeiling) {
        messages.push(`Elevated ceiling must be ${formatRatio(maxCeiling)} or lower.`);
      }
    }

    if (floor !== null && ceiling !== null && floor > ceiling) {
      messages.push("Conservative floor cannot exceed elevated ceiling.");
    }

    return {
      expenseTypeKey: row.expenseTypeKey || null,
      valid: messages.length === 0,
      messages
    };
  }

  function buildSparseLifestyleRangeSavePlan(input) {
    const options = isPlainObject(input) ? input : {};
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const draftRows = Array.isArray(options.draftRows) ? options.draftRows : [];
    const maxCeiling = Number.isFinite(Number(options.maxElevatedCeilingRatio))
      ? Number(options.maxElevatedCeilingRatio)
      : 2;
    const validationMessages = {};
    const sparseOverrides = [];
    const rowsByType = rows.reduce(function (map, row) {
      const key = normalizeKey(row.expenseTypeKey);
      if (key) {
        map[key] = row;
      }
      return map;
    }, {});

    draftRows.forEach(function (draftRow) {
      const expenseTypeKey = normalizeKey(draftRow?.expenseTypeKey);
      const sourceRow = rowsByType[expenseTypeKey];
      if (!sourceRow) {
        return;
      }

      const validation = validateLifestyleRatioDraftRow(draftRow, maxCeiling);
      if (!validation.valid) {
        validationMessages[expenseTypeKey] = validation.messages;
        return;
      }

      const conservativeFloorRatio = normalizeRatioForSave(draftRow.conservativeFloorRatio);
      const elevatedCeilingRatio = normalizeRatioForSave(draftRow.elevatedCeilingRatio);
      const isDefaultFloor = ratiosEqual(conservativeFloorRatio, sourceRow.defaultConservativeFloorRatio);
      const isDefaultCeiling = ratiosEqual(elevatedCeilingRatio, sourceRow.defaultElevatedCeilingRatio);

      if (!isDefaultFloor || !isDefaultCeiling) {
        sparseOverrides.push({
          expenseTypeKey,
          conservativeFloorRatio,
          elevatedCeilingRatio
        });
      }
    });

    return clonePlainValue({
      valid: Object.keys(validationMessages).length === 0,
      sparseLifestyleRangeOverrides: sparseOverrides,
      validationMessages,
      trace: {
        source: "admin-lifestyle-range-ratio-save-plan",
        draftRows: draftRows.length,
        sparseOverrides: sparseOverrides.length,
        invalidRows: Object.keys(validationMessages).length
      }
    });
  }

  function buildAccountPolicyWithLifestyleOverrides(existingAccountPolicy, sparseLifestyleRangeOverrides, accountId) {
    const existing = isPlainObject(existingAccountPolicy) ? existingAccountPolicy : {};
    const metadata = isPlainObject(existing.metadata) ? clonePlainValue(existing.metadata) : {};

    return clonePlainValue({
      version: Number.isFinite(Number(existing.version)) ? Number(existing.version) : 1,
      lifestyleRangeOverrides: Array.isArray(sparseLifestyleRangeOverrides)
        ? sparseLifestyleRangeOverrides.map(clonePlainValue)
        : [],
      compressionThresholdOverrides: Array.isArray(existing.compressionThresholdOverrides)
        ? clonePlainValue(existing.compressionThresholdOverrides)
        : [],
      compressionPolicyOverrides: Array.isArray(existing.compressionPolicyOverrides)
        ? clonePlainValue(existing.compressionPolicyOverrides)
        : [],
      guardrails: isPlainObject(existing.guardrails) ? clonePlainValue(existing.guardrails) : {},
      livingFloorAssumptions: isPlainObject(existing.livingFloorAssumptions)
        ? clonePlainValue(existing.livingFloorAssumptions)
        : {},
      metadata: Object.assign({}, metadata, {
        accountId: accountId || metadata.accountId || null,
        source: metadata.source || "adminLifestyleRangeEditorV1",
        lastEditedNamespace: "lifestyleRangeOverrides"
      })
    });
  }

  function buildLifestyleRangeSavePayload(input) {
    const options = isPlainObject(input) ? input : {};
    const plan = buildSparseLifestyleRangeSavePlan(options);
    if (!plan.valid) {
      return clonePlainValue({
        valid: false,
        validationMessages: plan.validationMessages,
        trace: plan.trace
      });
    }

    return clonePlainValue({
      valid: true,
      accountPolicy: buildAccountPolicyWithLifestyleOverrides(
        options.accountPolicy,
        plan.sparseLifestyleRangeOverrides,
        options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID
      ),
      sparseLifestyleRangeOverrides: plan.sparseLifestyleRangeOverrides,
      validationMessages: {},
      trace: Object.assign({}, plan.trace, {
        payloadShape: "sparse-account-policy-override"
      })
    });
  }

  function createBlankFoodAtHomeFloorAssumptionsDraft() {
    return {
      source: "ADMIN_ENTERED",
      sourcePeriod: null,
      monthlyAmountsByBand: FOOD_AT_HOME_BAND_KEYS.reduce(function (values, bandKey) {
        values[bandKey] = null;
        return values;
      }, {}),
      householdSizeAdjustmentFactors: HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.reduce(function (values, factorKey) {
        values[factorKey] = null;
        return values;
      }, {})
    };
  }

  function normalizeOptionalDollarDraftValue(value, label, messages) {
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      return null;
    }

    const numericValue = asOptionalFiniteNumber(text);
    if (numericValue === null) {
      messages.push(`${label} must be a finite dollar amount.`);
      return null;
    }

    if (numericValue < 0) {
      messages.push(`${label} must be 0 or greater.`);
      return null;
    }

    return Number(numericValue.toFixed(2));
  }

  function normalizeOptionalHouseholdFactorDraftValue(value, label, messages) {
    const text = String(value == null ? "" : value).trim();
    if (!text) {
      return null;
    }

    const numericValue = asOptionalFiniteNumber(text);
    if (numericValue === null) {
      messages.push(`${label} must be a finite adjustment factor.`);
      return null;
    }

    if (numericValue < 0.25 || numericValue > 3) {
      messages.push(`${label} must be between 0.25 and 3.00.`);
      return null;
    }

    return Number(numericValue.toFixed(4));
  }

  function validateFoodAtHomeFloorAssumptionsDraft(draft) {
    const row = isPlainObject(draft) ? draft : {};
    const monthlyAmountsByBand = isPlainObject(row.monthlyAmountsByBand) ? row.monthlyAmountsByBand : {};
    const householdSizeAdjustmentFactors = isPlainObject(row.householdSizeAdjustmentFactors)
      ? row.householdSizeAdjustmentFactors
      : {};
    const messages = [];

    const normalizedMonthlyAmounts = FOOD_AT_HOME_BAND_KEYS.reduce(function (values, bandKey) {
      values[bandKey] = normalizeOptionalDollarDraftValue(
        monthlyAmountsByBand[bandKey],
        `${bandKey} monthly amount`,
        messages
      );
      return values;
    }, {});

    const normalizedHouseholdFactors = HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.reduce(function (values, factorKey) {
      values[factorKey] = normalizeOptionalHouseholdFactorDraftValue(
        householdSizeAdjustmentFactors[factorKey],
        `${factorKey} household-size factor`,
        messages
      );
      return values;
    }, {});

    return clonePlainValue({
      valid: messages.length === 0,
      foodAtHome: {
        planningBucketKey: "foodAtHomeConsumables",
        source: normalizeFoodAtHomeSource(row.source),
        sourcePeriod: normalizeNullableText(row.sourcePeriod),
        monthlyAmountsByBand: normalizedMonthlyAmounts,
        householdSizeAdjustmentFactors: normalizedHouseholdFactors
      },
      validationMessages: messages,
      trace: {
        source: "admin-food-at-home-floor-assumptions-validation",
        editableNamespace: "livingFloorAssumptions.foodAtHome",
        invalidValues: messages.length
      }
    });
  }

  function buildAccountPolicyWithFoodAtHomeFloorAssumptions(existingAccountPolicy, foodAtHomeAssumptions, accountId) {
    const existing = isPlainObject(existingAccountPolicy) ? existingAccountPolicy : {};
    const metadata = isPlainObject(existing.metadata) ? clonePlainValue(existing.metadata) : {};
    const existingLivingFloorAssumptions = getLivingFloorAssumptions(existing);
    const nextLivingFloorAssumptions = Object.assign({}, clonePlainValue(existingLivingFloorAssumptions), {
      version: Number.isFinite(Number(existingLivingFloorAssumptions.version))
        ? Number(existingLivingFloorAssumptions.version)
        : 1,
      foodAtHome: clonePlainValue(foodAtHomeAssumptions)
    });

    return clonePlainValue({
      version: Number.isFinite(Number(existing.version)) ? Number(existing.version) : 1,
      lifestyleRangeOverrides: Array.isArray(existing.lifestyleRangeOverrides)
        ? clonePlainValue(existing.lifestyleRangeOverrides)
        : [],
      compressionThresholdOverrides: Array.isArray(existing.compressionThresholdOverrides)
        ? clonePlainValue(existing.compressionThresholdOverrides)
        : [],
      compressionPolicyOverrides: Array.isArray(existing.compressionPolicyOverrides)
        ? clonePlainValue(existing.compressionPolicyOverrides)
        : [],
      guardrails: isPlainObject(existing.guardrails) ? clonePlainValue(existing.guardrails) : {},
      livingFloorAssumptions: nextLivingFloorAssumptions,
      metadata: Object.assign({}, metadata, {
        accountId: accountId || metadata.accountId || null,
        source: metadata.source || "adminFoodAtHomeFloorEditorV1",
        lastEditedNamespace: "livingFloorAssumptions.foodAtHome"
      })
    });
  }

  function buildFoodAtHomeFloorAssumptionsSavePayload(input) {
    const options = isPlainObject(input) ? input : {};
    const validation = validateFoodAtHomeFloorAssumptionsDraft(options.draftFoodAtHome);
    if (!validation.valid) {
      return clonePlainValue({
        valid: false,
        validationMessages: validation.validationMessages,
        trace: validation.trace
      });
    }

    return clonePlainValue({
      valid: true,
      accountPolicy: buildAccountPolicyWithFoodAtHomeFloorAssumptions(
        options.accountPolicy,
        validation.foodAtHome,
        options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID
      ),
      foodAtHome: validation.foodAtHome,
      validationMessages: [],
      trace: Object.assign({}, validation.trace, {
        payloadShape: "account-policy-living-floor-food-at-home"
      })
    });
  }

  function buildFoodAtHomeFloorAssumptionsResetPayload(input) {
    const options = isPlainObject(input) ? input : {};
    return buildFoodAtHomeFloorAssumptionsSavePayload(Object.assign({}, options, {
      draftFoodAtHome: createBlankFoodAtHomeFloorAssumptionsDraft()
    }));
  }

  function renderOverrideStatus(status) {
    return status === "accountOverride" ? "Account override" : "Default";
  }

  function renderResetButton(row) {
    const disabledAttribute = row.overrideStatus === "accountOverride" ? "" : " disabled";
    return `<button type="button" class="admin-action-button" data-household-expense-policy-reset-row data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}"${disabledAttribute}>Reset to default</button>`;
  }

  function renderEditorRow(row) {
    return `
      <tr class="admin-tax-bracket-row" data-household-expense-policy-editor-row data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}" data-override-status="${escapeHtml(row.overrideStatus || "defaultSeedPolicy")}">
        <td>${escapeHtml(row.displayName)}</td>
        <td><code>${escapeHtml(row.expenseTypeKey || "")}</code></td>
        <td>${escapeHtml(row.rangeBehavior || "")}</td>
        <td>${escapeHtml(formatRatio(row.defaultConservativeFloorRatio))}</td>
        <td>${escapeHtml(formatRatio(row.defaultElevatedCeilingRatio))}</td>
        <td>${escapeHtml(formatRatio(row.resolvedConservativeFloorRatio))}</td>
        <td>${escapeHtml(formatRatio(row.resolvedElevatedCeilingRatio))}</td>
        <td>
          <input class="admin-tax-bracket-input" type="number" step="0.01" min="0" max="1" value="${escapeHtml(formatRatioInputValue(row.resolvedConservativeFloorRatio))}" data-household-expense-policy-ratio-input data-ratio-field="conservativeFloorRatio" data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}" aria-label="${escapeHtml(row.displayName)} conservative floor ratio">
        </td>
        <td>
          <input class="admin-tax-bracket-input" type="number" step="0.01" min="1" max="2" value="${escapeHtml(formatRatioInputValue(row.resolvedElevatedCeilingRatio))}" data-household-expense-policy-ratio-input data-ratio-field="elevatedCeilingRatio" data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}" aria-label="${escapeHtml(row.displayName)} elevated ceiling ratio">
        </td>
        <td>${escapeHtml(renderOverrideStatus(row.overrideStatus))}</td>
        <td>${renderResetButton(row)}</td>
        <td><span data-household-expense-policy-row-feedback data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}"></span></td>
      </tr>
    `;
  }

  function renderFoodAtHomeBandEditorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-food-at-home-floor-band-row="${escapeHtml(row.bandKey)}">
          <td><code>${escapeHtml(row.bandKey)}</code></td>
          <td>
            <input class="admin-tax-bracket-input" type="number" step="0.01" min="0" value="${escapeHtml(row.inputValue)}" data-food-at-home-floor-input data-food-at-home-band-key="${escapeHtml(row.bandKey)}" aria-label="${escapeHtml(row.bandKey)} monthly amount">
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderFoodAtHomeHouseholdSizeFactorEditorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-food-at-home-floor-household-size-row="${escapeHtml(row.factorKey)}">
          <td><code>${escapeHtml(row.factorKey)}</code></td>
          <td>
            <input class="admin-tax-bracket-input" type="number" step="0.0001" min="0.25" max="3" value="${escapeHtml(row.inputValue)}" data-food-at-home-factor-input data-food-at-home-household-size-factor-key="${escapeHtml(row.factorKey)}" aria-label="${escapeHtml(row.factorKey)} household-size adjustment factor">
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderFoodAtHomeFloorAssumptionsEditor(foodAtHomeModel) {
    const model = isPlainObject(foodAtHomeModel)
      ? foodAtHomeModel
      : buildFoodAtHomeFloorAssumptionsEditorModel({});
    const bandRows = Array.isArray(model.bandRows) ? model.bandRows : [];
    const factorRows = Array.isArray(model.householdSizeAdjustmentFactorRows)
      ? model.householdSizeAdjustmentFactorRows
      : [];

    return `
      <section class="admin-tax-bracket-group" data-food-at-home-floor-assumptions-editor>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Food at Home Floor Assumptions</span>
            <h3>USDA-Style Band Values</h3>
            <p class="panel-copy">Saves only <code>accountPolicy.livingFloorAssumptions.foodAtHome</code>. These values are stored for future floor calculations and are not used by runtime math yet.</p>
          </div>
          <div>
            <button type="button" class="admin-action-button" data-food-at-home-floor-save>Save Food at Home</button>
            <button type="button" class="admin-action-button" data-food-at-home-floor-reset>Clear Food at Home</button>
          </div>
        </div>
        <div class="panel-copy" data-food-at-home-floor-editor-feedback role="status" aria-live="polite"></div>
        <table class="admin-tax-bracket-table" data-food-at-home-floor-source-table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr class="admin-tax-bracket-row">
              <td><code>source</code></td>
              <td>
                <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(model.source || "ADMIN_ENTERED")}" data-food-at-home-floor-source aria-label="Food at Home source">
              </td>
            </tr>
            <tr class="admin-tax-bracket-row">
              <td><code>sourcePeriod</code></td>
              <td>
                <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(model.sourcePeriod || "")}" data-food-at-home-floor-source-period aria-label="Food at Home source period">
              </td>
            </tr>
          </tbody>
        </table>
        <table class="admin-tax-bracket-table" data-food-at-home-floor-band-inputs>
          <thead>
            <tr>
              <th>Age/Sex Band</th>
              <th>Monthly Amount</th>
            </tr>
          </thead>
          <tbody>
            ${renderFoodAtHomeBandEditorRows(bandRows)}
          </tbody>
        </table>
        <table class="admin-tax-bracket-table" data-food-at-home-floor-household-size-factor-inputs>
          <thead>
            <tr>
              <th>Household Size</th>
              <th>Adjustment Factor</th>
            </tr>
          </thead>
          <tbody>
            ${renderFoodAtHomeHouseholdSizeFactorEditorRows(factorRows)}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderHouseholdExpensePolicyEditor(model) {
    const safeModel = isPlainObject(model) ? model : buildHouseholdExpensePolicyEditorModel();
    const rows = Array.isArray(safeModel.rows) ? safeModel.rows : [];
    const counts = isPlainObject(safeModel.counts) ? safeModel.counts : {};
    const status = isPlainObject(safeModel.status) ? safeModel.status : {};
    const limits = isPlainObject(safeModel.limits) ? safeModel.limits : {};

    return `
      <div class="admin-household-expense-policy-editor-shell" data-household-expense-account-policy-editor-shell data-policy-status="${escapeHtml(status.code || "unknown")}">
        <section class="admin-tax-bracket-group">
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Lifestyle Range Overrides</span>
              <h3>Ratio Controls</h3>
              <p class="panel-copy"><strong>Affects all users on this account.</strong> V1 edits are limited to seed-approved lifestyle slider rows and only save changed floor/ceiling ratios.</p>
              <p class="panel-copy">Policy source: ${escapeHtml(status.label || "Policy unavailable")} · Rows: ${escapeHtml(counts.previewRows || 0)} · Overrides: ${escapeHtml(counts.rowsWithOverrides || 0)} · Warnings: ${escapeHtml(counts.warnings || 0)}</p>
            </div>
            <div>
              <button type="button" class="admin-action-button" data-household-expense-policy-save>Save changes</button>
            </div>
          </div>
          <p class="panel-copy">Allowed values: floor 0.00-1.00, ceiling 1.00-${escapeHtml(formatRatio(limits.maxElevatedCeilingRatio || 2))}.</p>
          <div class="panel-copy" data-household-expense-policy-editor-feedback role="status" aria-live="polite"></div>
          <table class="admin-tax-bracket-table" data-household-expense-lifestyle-range-editor-table>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Type Key</th>
                <th>Behavior</th>
                <th>Default Floor</th>
                <th>Default Ceiling</th>
                <th>Resolved Floor</th>
                <th>Resolved Ceiling</th>
                <th>Edit Floor</th>
                <th>Edit Ceiling</th>
                <th>Status</th>
                <th>Reset</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(renderEditorRow).join("") : `
                <tr class="admin-tax-bracket-row">
                  <td colspan="11">No slider-eligible lifestyle range policy rows are available.</td>
                </tr>
              `}
            </tbody>
          </table>
        </section>
        ${renderFoodAtHomeFloorAssumptionsEditor(safeModel.foodAtHomeFloorAssumptions)}
      </div>
    `;
  }

  function collectDraftRowsFromHost(host) {
    const rows = Array.from(host?.querySelectorAll?.("[data-household-expense-policy-editor-row]") || []);
    return rows.map(function (row) {
      const expenseTypeKey = normalizeKey(row.getAttribute("data-expense-type-key"));
      const floorInput = row.querySelector('[data-household-expense-policy-ratio-input][data-ratio-field="conservativeFloorRatio"]');
      const ceilingInput = row.querySelector('[data-household-expense-policy-ratio-input][data-ratio-field="elevatedCeilingRatio"]');
      return {
        expenseTypeKey,
        conservativeFloorRatio: floorInput ? floorInput.value : null,
        elevatedCeilingRatio: ceilingInput ? ceilingInput.value : null
      };
    });
  }

  function collectFoodAtHomeFloorDraftFromHost(host) {
    const section = host?.querySelector?.("[data-food-at-home-floor-assumptions-editor]");
    const monthlyAmountsByBand = {};
    const householdSizeAdjustmentFactors = {};

    FOOD_AT_HOME_BAND_KEYS.forEach(function (bandKey) {
      const input = section?.querySelector?.(`[data-food-at-home-band-key="${bandKey}"]`);
      monthlyAmountsByBand[bandKey] = input ? input.value : null;
    });

    HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.forEach(function (factorKey) {
      const input = section?.querySelector?.(`[data-food-at-home-household-size-factor-key="${factorKey}"]`);
      householdSizeAdjustmentFactors[factorKey] = input ? input.value : null;
    });

    return {
      source: section?.querySelector?.("[data-food-at-home-floor-source]")?.value || "ADMIN_ENTERED",
      sourcePeriod: section?.querySelector?.("[data-food-at-home-floor-source-period]")?.value || null,
      monthlyAmountsByBand,
      householdSizeAdjustmentFactors
    };
  }

  function clearEditorFeedback(host) {
    const sectionFeedback = host?.querySelector?.("[data-household-expense-policy-editor-feedback]");
    if (sectionFeedback) {
      sectionFeedback.textContent = "";
    }
    Array.from(host?.querySelectorAll?.("[data-household-expense-policy-row-feedback]") || []).forEach(function (element) {
      element.textContent = "";
    });
  }

  function setFoodAtHomeFloorEditorFeedback(host, message) {
    const sectionFeedback = host?.querySelector?.("[data-food-at-home-floor-editor-feedback]");
    if (sectionFeedback) {
      sectionFeedback.textContent = message || "";
    }
  }

  function findRowFeedbackElement(host, expenseTypeKey) {
    return Array.from(host?.querySelectorAll?.("[data-household-expense-policy-row-feedback]") || []).find(function (element) {
      return normalizeKey(element.getAttribute("data-expense-type-key")) === normalizeKey(expenseTypeKey);
    }) || null;
  }

  function renderValidationMessages(host, validationMessages) {
    clearEditorFeedback(host);
    Object.keys(validationMessages || {}).forEach(function (expenseTypeKey) {
      const rowFeedback = findRowFeedbackElement(host, expenseTypeKey);
      if (rowFeedback) {
        rowFeedback.textContent = validationMessages[expenseTypeKey].join(" ");
      }
    });

    const sectionFeedback = host?.querySelector?.("[data-household-expense-policy-editor-feedback]");
    if (sectionFeedback) {
      sectionFeedback.textContent = "Fix the highlighted lifestyle ratio values before saving.";
    }
  }

  function renderFoodAtHomeValidationMessages(host, validationMessages) {
    const messages = Array.isArray(validationMessages) ? validationMessages : [];
    setFoodAtHomeFloorEditorFeedback(
      host,
      messages.length
        ? `Fix Food at Home floor assumptions before saving: ${messages.join(" ")}`
        : ""
    );
  }

  function rerenderEditorHost(host, model, message) {
    host.innerHTML = renderHouseholdExpensePolicyEditor(model);
    if (message) {
      const sectionFeedback = host.querySelector?.("[data-household-expense-policy-editor-feedback]");
      if (sectionFeedback) {
        sectionFeedback.textContent = message;
      }
    }
  }

  function refreshReadOnlyPolicySummary() {
    const display = global.LensApp?.accountSettings?.householdExpenseAccountPolicyAdminDisplay;
    if (display && typeof display.initializeHouseholdExpenseAccountPolicyAdminDisplay === "function") {
      display.initializeHouseholdExpenseAccountPolicyAdminDisplay();
    }
  }

  function saveLifestyleRangeEditorChanges(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      const sectionFeedback = host?.querySelector?.("[data-household-expense-policy-editor-feedback]");
      if (sectionFeedback) {
        sectionFeedback.textContent = "Household expense account policy storage is unavailable.";
      }
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const draftRows = collectDraftRowsFromHost(host);
    const payload = buildLifestyleRangeSavePayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      rows: model.rows,
      draftRows,
      maxElevatedCeilingRatio: model.limits?.maxElevatedCeilingRatio
    });

    if (!payload.valid) {
      renderValidationMessages(host, payload.validationMessages);
      return {
        status: "validationFailed",
        saved: false,
        validationMessages: payload.validationMessages,
        trace: payload.trace
      };
    }

    const saveResult = storageApi.saveHouseholdExpenseAccountPolicy({
      accountId: model.accountId,
      accountPolicy: payload.accountPolicy,
      metadata: {
        source: "browserLocalV1",
        updatedAt: new Date().toISOString(),
        updatedBy: "admin-household-expense-policy-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    const warningCount = Array.isArray(nextModel.warnings) ? nextModel.warnings.length : 0;
    rerenderEditorHost(
      host,
      nextModel,
      saveResult?.saved
        ? `Saved lifestyle range overrides. Active sparse overrides: ${nextModel.counts.rowsWithOverrides}. Resolver warnings: ${warningCount}.`
        : "Household expense policy changes were not saved."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function resetLifestyleRangeEditorRow(host, expenseTypeKey) {
    const normalizedExpenseTypeKey = normalizeKey(expenseTypeKey);
    if (!normalizedExpenseTypeKey) {
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "missing-expense-type-key" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const draftRows = model.rows.map(function (row) {
      return {
        expenseTypeKey: row.expenseTypeKey,
        conservativeFloorRatio: row.expenseTypeKey === normalizedExpenseTypeKey
          ? row.defaultConservativeFloorRatio
          : row.resolvedConservativeFloorRatio,
        elevatedCeilingRatio: row.expenseTypeKey === normalizedExpenseTypeKey
          ? row.defaultElevatedCeilingRatio
          : row.resolvedElevatedCeilingRatio
      };
    });
    const payload = buildLifestyleRangeSavePayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      rows: model.rows,
      draftRows,
      maxElevatedCeilingRatio: model.limits?.maxElevatedCeilingRatio
    });

    if (!payload.valid) {
      renderValidationMessages(host, payload.validationMessages);
      return {
        status: "validationFailed",
        saved: false,
        validationMessages: payload.validationMessages,
        trace: payload.trace
      };
    }

    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const saveResult = storageApi.saveHouseholdExpenseAccountPolicy({
      accountId: model.accountId,
      accountPolicy: payload.accountPolicy,
      metadata: {
        source: "browserLocalV1",
        updatedAt: new Date().toISOString(),
        updatedBy: "admin-household-expense-policy-editor"
      },
      storage: global.localStorage
    });
    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel, `Reset ${normalizedExpenseTypeKey} to default lifestyle ratios.`);
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function saveFoodAtHomeFloorAssumptions(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      setFoodAtHomeFloorEditorFeedback(host, "Household expense account policy storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildFoodAtHomeFloorAssumptionsSavePayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      draftFoodAtHome: collectFoodAtHomeFloorDraftFromHost(host)
    });

    if (!payload.valid) {
      renderFoodAtHomeValidationMessages(host, payload.validationMessages);
      return {
        status: "validationFailed",
        saved: false,
        validationMessages: payload.validationMessages,
        trace: payload.trace
      };
    }

    const saveResult = storageApi.saveHouseholdExpenseAccountPolicy({
      accountId: model.accountId,
      accountPolicy: payload.accountPolicy,
      metadata: {
        source: "browserLocalV1",
        updatedAt: new Date().toISOString(),
        updatedBy: "admin-food-at-home-floor-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel);
    setFoodAtHomeFloorEditorFeedback(
      host,
      saveResult?.saved
        ? "Saved Food at Home floor assumptions."
        : "Food at Home floor assumptions were not saved."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function resetFoodAtHomeFloorAssumptions(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      setFoodAtHomeFloorEditorFeedback(host, "Household expense account policy storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildFoodAtHomeFloorAssumptionsResetPayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy
    });

    if (!payload.valid) {
      renderFoodAtHomeValidationMessages(host, payload.validationMessages);
      return {
        status: "validationFailed",
        saved: false,
        validationMessages: payload.validationMessages,
        trace: payload.trace
      };
    }

    const saveResult = storageApi.saveHouseholdExpenseAccountPolicy({
      accountId: model.accountId,
      accountPolicy: payload.accountPolicy,
      metadata: {
        source: "browserLocalV1",
        updatedAt: new Date().toISOString(),
        updatedBy: "admin-food-at-home-floor-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel);
    setFoodAtHomeFloorEditorFeedback(
      host,
      saveResult?.saved
        ? "Cleared Food at Home floor assumptions."
        : "Food at Home floor assumptions were not cleared."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function handleEditorClick(event) {
    const target = event?.target;
    const host = target?.closest?.(POLICY_EDITOR_HOST_SELECTOR);
    if (!host) {
      return;
    }

    const saveButton = target.closest?.("[data-household-expense-policy-save]");
    if (saveButton) {
      event.preventDefault();
      saveLifestyleRangeEditorChanges(host);
      return;
    }

    const foodAtHomeSaveButton = target.closest?.("[data-food-at-home-floor-save]");
    if (foodAtHomeSaveButton) {
      event.preventDefault();
      saveFoodAtHomeFloorAssumptions(host);
      return;
    }

    const foodAtHomeResetButton = target.closest?.("[data-food-at-home-floor-reset]");
    if (foodAtHomeResetButton) {
      event.preventDefault();
      resetFoodAtHomeFloorAssumptions(host);
      return;
    }

    const resetButton = target.closest?.("[data-household-expense-policy-reset-row]");
    if (resetButton) {
      event.preventDefault();
      resetLifestyleRangeEditorRow(host, resetButton.getAttribute("data-expense-type-key"));
    }
  }

  function initializeHouseholdExpenseAccountPolicyAdminEditor() {
    const host = global.document?.querySelector?.(POLICY_EDITOR_HOST_SELECTOR);
    if (!host) {
      return null;
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    host.innerHTML = renderHouseholdExpensePolicyEditor(model);
    if (host.dataset && host.dataset.householdExpensePolicyEditorBound !== "true") {
      host.addEventListener?.("click", handleEditorClick);
      host.dataset.householdExpensePolicyEditorBound = "true";
    }
    return model;
  }

  accountSettings.householdExpenseAccountPolicyAdminEditor = Object.freeze({
    TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID,
    FOOD_AT_HOME_BAND_KEYS,
    HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS,
    buildLifestyleRangeEditorRows,
    buildFoodAtHomeFloorAssumptionsEditorModel,
    validateLifestyleRatioDraftRow,
    validateFoodAtHomeFloorAssumptionsDraft,
    buildSparseLifestyleRangeSavePlan,
    buildAccountPolicyWithLifestyleOverrides,
    buildAccountPolicyWithFoodAtHomeFloorAssumptions,
    buildLifestyleRangeSavePayload,
    buildFoodAtHomeFloorAssumptionsSavePayload,
    buildFoodAtHomeFloorAssumptionsResetPayload,
    saveLifestyleRangeEditorChanges,
    resetLifestyleRangeEditorRow,
    saveFoodAtHomeFloorAssumptions,
    resetFoodAtHomeFloorAssumptions,
    buildHouseholdExpensePolicyEditorModel,
    renderFoodAtHomeFloorAssumptionsEditor,
    renderHouseholdExpensePolicyEditor,
    initializeHouseholdExpenseAccountPolicyAdminEditor
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeHouseholdExpenseAccountPolicyAdminEditor);
})(typeof globalThis !== "undefined" ? globalThis : this);
