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
  const MODEL90_DEFAULT_BUCKET_FLOOR_KEYS = Object.freeze([
    "householdConsumables",
    "communicationsConnectivity",
    "transportationBasics"
  ]);
  const MODEL90_DEFAULT_BUCKET_FLOOR_CONFIG = Object.freeze({
    householdConsumables: Object.freeze({
      planningBucketLabel: "Household Consumables",
      perUnitField: "monthlyPerMemberAmount",
      perUnitLabel: "Monthly Per Member"
    }),
    communicationsConnectivity: Object.freeze({
      planningBucketLabel: "Communications / Connectivity",
      perUnitField: "monthlyPerMemberAmount",
      perUnitLabel: "Monthly Per Member"
    }),
    transportationBasics: Object.freeze({
      planningBucketLabel: "Transportation Basics",
      perUnitField: "monthlyPerAdultDriverAmount",
      perUnitLabel: "Monthly Per Adult Driver"
    })
  });
  const STATE_CODE_VALUES = Object.freeze([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
    "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
    "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
    "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI",
    "WY"
  ]);
  const GRAPH_ADJUSTMENT_TYPE_OPTIONS = Object.freeze([
    Object.freeze({
      adjustmentClass: "moneyFloorAdjusted",
      label: "Included with floor"
    }),
    Object.freeze({
      adjustmentClass: "ratioAdjusted",
      label: "Included ratio-only"
    }),
    Object.freeze({
      adjustmentClass: "excludedFromAdjustment",
      label: "Excluded / protected"
    })
  ]);
  const GRAPH_ADJUSTMENT_CLASS_VALUES = Object.freeze(GRAPH_ADJUSTMENT_TYPE_OPTIONS.map(function (option) {
    return option.adjustmentClass;
  }));
  const GRAPH_MINIMUM_FLOOR_MODE_VALUES = Object.freeze([
    "estimatedDollarFloor",
    "zeroFloor",
    "ratioFloorOnly",
    "notAdjusted"
  ]);

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

  function normalizeStateMultiplierSource(value) {
    return normalizeNullableText(value) || "ADMIN_ENTERED";
  }

  function normalizeModel90DefaultFloorSource(value) {
    return normalizeNullableText(value) || "ADMIN_ENTERED";
  }

  function normalizeAdjustmentSource(value) {
    return normalizeNullableText(value) || "ADMIN_ENTERED";
  }

  function normalizeAdjustmentClass(value) {
    const adjustmentClass = normalizeNullableText(value);
    return GRAPH_ADJUSTMENT_CLASS_VALUES.includes(adjustmentClass) ? adjustmentClass : null;
  }

  function normalizeMinimumFloorMode(value) {
    const minimumFloorMode = normalizeNullableText(value);
    return GRAPH_MINIMUM_FLOOR_MODE_VALUES.includes(minimumFloorMode) ? minimumFloorMode : null;
  }

  function deriveMinimumFloorModeForAdjustmentClass(adjustmentClass, sourceRow, requestedMinimumFloorMode) {
    const requestedMode = normalizeMinimumFloorMode(requestedMinimumFloorMode);

    if (adjustmentClass === "moneyFloorAdjusted") {
      return "estimatedDollarFloor";
    }

    if (adjustmentClass === "excludedFromAdjustment") {
      return "notAdjusted";
    }

    if (adjustmentClass === "ratioAdjusted") {
      if (requestedMode === "ratioFloorOnly" || requestedMode === "zeroFloor") {
        return requestedMode;
      }

      return sourceRow?.defaultMinimumFloorMode === "ratioFloorOnly" || sourceRow?.minimumFloorMode === "ratioFloorOnly"
        ? "ratioFloorOnly"
        : "zeroFloor";
    }

    return null;
  }

  function formatAdjustmentTypeDisplayFromClass(adjustmentClass) {
    const option = GRAPH_ADJUSTMENT_TYPE_OPTIONS.find(function (candidate) {
      return candidate.adjustmentClass === adjustmentClass;
    });

    return option ? option.label : "Metadata unavailable";
  }

  function normalizeStateCode(value) {
    const stateCode = String(value == null ? "" : value).trim().toUpperCase();
    return STATE_CODE_VALUES.includes(stateCode) ? stateCode : "";
  }

  function formatNumberInputValue(value) {
    const numericValue = asOptionalFiniteNumber(value);
    return numericValue === null ? "" : String(numericValue);
  }

  function formatMultiplierInputValue(value, fallback) {
    const numericValue = asOptionalFiniteNumber(value);
    if (numericValue !== null) {
      return String(numericValue);
    }

    return fallback == null ? "" : String(fallback);
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
      graphAdjustmentOverrides: [],
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

  function getGraphAdjustmentOverrideRows(accountPolicy) {
    return Array.isArray(accountPolicy?.graphAdjustmentOverrides)
      ? accountPolicy.graphAdjustmentOverrides.filter(isPlainObject).map(clonePlainValue)
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

  function getStateCostAdjustmentMultipliers(accountPolicy) {
    const assumptions = getLivingFloorAssumptions(accountPolicy);
    return isPlainObject(assumptions.stateCostAdjustmentMultipliers)
      ? assumptions.stateCostAdjustmentMultipliers
      : {};
  }

  function getModel90DefaultBucketFloors(accountPolicy) {
    const assumptions = getLivingFloorAssumptions(accountPolicy);
    return isPlainObject(assumptions.model90DefaultBucketFloors)
      ? assumptions.model90DefaultBucketFloors
      : {};
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

  function toStateCostAdjustmentMultiplierEditorRows(globalStateAdjustmentMultipliersByState) {
    const rows = isPlainObject(globalStateAdjustmentMultipliersByState)
      ? globalStateAdjustmentMultipliersByState
      : {};

    return Object.keys(rows).sort().map(function (stateKey) {
      const row = isPlainObject(rows[stateKey]) ? rows[stateKey] : {};
      return {
        stateCode: normalizeStateCode(stateKey) || String(stateKey || "").trim().toUpperCase(),
        multiplier: asOptionalFiniteNumber(row.multiplier),
        multiplierInputValue: formatMultiplierInputValue(row.multiplier),
        source: normalizeStateMultiplierSource(row.source),
        sourcePeriod: normalizeNullableText(row.sourcePeriod),
        notes: normalizeNullableText(row.notes)
      };
    });
  }

  function buildStateCostAdjustmentMultipliersEditorModel(accountPolicy) {
    const stateMultipliers = getStateCostAdjustmentMultipliers(accountPolicy);
    return {
      version: Number.isFinite(Number(stateMultipliers.version)) ? Number(stateMultipliers.version) : 1,
      appliesToAdjustmentClass: "moneyFloorAdjusted",
      defaultMultiplier: asOptionalFiniteNumber(stateMultipliers.defaultMultiplier) || 1,
      defaultMultiplierInputValue: formatMultiplierInputValue(stateMultipliers.defaultMultiplier, 1),
      globalStateRows: toStateCostAdjustmentMultiplierEditorRows(stateMultipliers.globalStateAdjustmentMultipliersByState),
      bucketStateAdjustmentMultipliers: isPlainObject(stateMultipliers.bucketStateAdjustmentMultipliers)
        ? clonePlainValue(stateMultipliers.bucketStateAdjustmentMultipliers)
        : {}
    };
  }

  function toModel90DefaultBucketFloorEditorRows(model90DefaultBucketFloors) {
    const floors = isPlainObject(model90DefaultBucketFloors) ? model90DefaultBucketFloors : {};
    return MODEL90_DEFAULT_BUCKET_FLOOR_KEYS.map(function (planningBucketKey) {
      const config = MODEL90_DEFAULT_BUCKET_FLOOR_CONFIG[planningBucketKey];
      const row = isPlainObject(floors[planningBucketKey]) ? floors[planningBucketKey] : {};
      const perUnitField = config.perUnitField;
      return {
        planningBucketKey,
        planningBucketLabel: config.planningBucketLabel,
        perUnitField,
        perUnitLabel: config.perUnitLabel,
        monthlyBaseAmount: asOptionalFiniteNumber(row.monthlyBaseAmount),
        monthlyBaseAmountInputValue: formatNumberInputValue(row.monthlyBaseAmount),
        perUnitAmount: asOptionalFiniteNumber(row[perUnitField]),
        perUnitAmountInputValue: formatNumberInputValue(row[perUnitField]),
        stateAdjustmentEnabled: row.stateAdjustmentEnabled !== false,
        source: normalizeModel90DefaultFloorSource(row.source),
        sourcePeriod: normalizeNullableText(row.sourcePeriod),
        notes: normalizeNullableText(row.notes)
      };
    });
  }

  function buildModel90DefaultBucketFloorsEditorModel(accountPolicy) {
    return {
      rows: toModel90DefaultBucketFloorEditorRows(getModel90DefaultBucketFloors(accountPolicy))
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

  function getExpenseLibraryRows(currentLensAnalysis) {
    const libraryApi = currentLensAnalysis?.expenseLibrary;
    return libraryApi && typeof libraryApi.getExpenseLibraryEntries === "function"
      ? libraryApi.getExpenseLibraryEntries()
      : [];
  }

  function getLivingFloorMetadataRows(currentLensAnalysis) {
    const metadataApi = currentLensAnalysis?.householdExpenseLivingFloorMetadata;
    return metadataApi && typeof metadataApi.getHouseholdExpenseLivingFloorMetadata === "function"
      ? metadataApi.getHouseholdExpenseLivingFloorMetadata()
      : [];
  }

  function getGraphAdjustmentPolicyResolver(currentLensAnalysis) {
    const resolverApi = currentLensAnalysis?.householdExpenseGraphAdjustmentPolicyResolver;
    return typeof resolverApi?.resolveHouseholdExpenseGraphAdjustmentPolicy === "function"
      ? resolverApi.resolveHouseholdExpenseGraphAdjustmentPolicy
      : null;
  }

  function buildExpenseLibraryByTypeKey(expenseLibraryRows) {
    return (Array.isArray(expenseLibraryRows) ? expenseLibraryRows : []).reduce(function (map, row) {
      const typeKey = row?.typeKey || row?.expenseTypeKey;
      if (typeKey) {
        map[typeKey] = row;
      }
      return map;
    }, {});
  }

  function buildRowsByExpenseTypeKey(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(function (map, row) {
      const expenseTypeKey = normalizeKey(row?.expenseTypeKey);
      if (expenseTypeKey) {
        map[expenseTypeKey] = row;
      }
      return map;
    }, {});
  }

  function formatGraphFloorStatus(status) {
    const labels = {
      notConfigured: "not configured",
      partiallyConfigured: "partially configured",
      configured: "configured",
      notApplicable: "not applicable"
    };

    return labels[status] || status || "not applicable";
  }

  function formatMinimumFloorDisplayFromPreview(resolvedGraphRow) {
    if (!resolvedGraphRow) {
      return "Metadata unavailable";
    }

    return resolvedGraphRow.floorSourceLabel || resolvedGraphRow.minimumFloorMode || "Not set";
  }

  function formatFloorStatusDisplayFromPreview(resolvedGraphRow) {
    if (!resolvedGraphRow) {
      return "Metadata unavailable";
    }

    const label = resolvedGraphRow.floorSourceLabel || "No dollar source";
    return `${label} / ${formatGraphFloorStatus(resolvedGraphRow.floorSourceStatus)}`;
  }

  function buildGraphAdjustmentPreviewPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const resolver = getGraphAdjustmentPolicyResolver(options.currentLensAnalysis);
    if (typeof resolver !== "function") {
      return {
        rows: [],
        warnings: [{
          code: "graph-adjustment-preview-resolver-unavailable",
          message: "Graph adjustment preview resolver is unavailable."
        }],
        dataGaps: [],
        metadata: { activeRuntimeConsumer: false }
      };
    }

    return resolver({
      expenseLibraryRows: options.expenseLibraryRows,
      lifestylePolicyRows: options.lifestylePolicyRows,
      livingFloorMetadata: options.livingFloorMetadata,
      accountPolicy: options.accountPolicy,
      includeOnlyGraphRows: true
    });
  }

  function buildLifestyleRangeEditorRows(defaultRows, resolvedGraphRows, defaultGraphRows, overrideRows, currentLensAnalysis) {
    const resolvedGraphRowsByTypeKey = buildRowsByExpenseTypeKey(resolvedGraphRows);
    const defaultGraphRowsByTypeKey = buildRowsByExpenseTypeKey(defaultGraphRows);
    const overrides = Array.isArray(overrideRows) ? overrideRows : [];
    const expenseLibraryByTypeKey = buildExpenseLibraryByTypeKey(getExpenseLibraryRows(currentLensAnalysis));

    return (Array.isArray(defaultRows) ? defaultRows : [])
      .filter(function (row) {
        return row && row.sliderEligible === true;
      })
      .map(function (defaultPolicy) {
        const expenseTypeKey = normalizeKey(defaultPolicy.expenseTypeKey);
        const resolvedGraphRow = resolvedGraphRowsByTypeKey[expenseTypeKey] || null;
        const defaultGraphRow = defaultGraphRowsByTypeKey[expenseTypeKey] || resolvedGraphRow || null;
        const override = overrides.find(function (candidate) {
          return rowMatchesPolicy(candidate, defaultPolicy);
        }) || null;
        const libraryEntry = expenseTypeKey ? expenseLibraryByTypeKey[expenseTypeKey] : null;
        const planningBucketKey = resolvedGraphRow?.planningBucketKey || defaultGraphRow?.planningBucketKey || libraryEntry?.planningBucketKey || null;
        const adjustmentClass = normalizeAdjustmentClass(resolvedGraphRow?.adjustmentClass) || defaultGraphRow?.adjustmentClass || null;
        const minimumFloorMode = normalizeMinimumFloorMode(resolvedGraphRow?.minimumFloorMode) || defaultGraphRow?.minimumFloorMode || null;
        const defaultAdjustmentClass = normalizeAdjustmentClass(defaultGraphRow?.adjustmentClass) || adjustmentClass;
        const defaultMinimumFloorMode = normalizeMinimumFloorMode(defaultGraphRow?.minimumFloorMode) || minimumFloorMode;
        const adjustmentOverrideStatus = resolvedGraphRow?.sourceTrace?.adjustmentClassSource === "graphAdjustmentOverrides"
          || resolvedGraphRow?.sourceTrace?.minimumFloorModeSource === "graphAdjustmentOverrides"
          ? "accountOverride"
          : "defaultSeedPolicy";
        const resolvedConservativeFloorRatio = Object.prototype.hasOwnProperty.call(resolvedGraphRow || {}, "conservativeFloorRatio")
          ? resolvedGraphRow.conservativeFloorRatio
          : defaultPolicy.conservativeFloorRatio;
        const resolvedElevatedCeilingRatio = Object.prototype.hasOwnProperty.call(resolvedGraphRow || {}, "elevatedCeilingRatio")
          ? resolvedGraphRow.elevatedCeilingRatio
          : defaultPolicy.elevatedCeilingRatio;

        return {
          rangePolicyId: defaultPolicy.rangePolicyId || null,
          displayName: resolvedGraphRow?.label || defaultPolicy.displayName || defaultPolicy.expenseTypeKey || "Unnamed expense",
          expenseTypeKey: defaultPolicy.expenseTypeKey || null,
          categoryKey: defaultPolicy.categoryKey || null,
          rangeBehavior: defaultPolicy.rangeBehavior || null,
          planningBucketKey,
          planningBucketLabel: libraryEntry?.planningBucketLabel || planningBucketKey || "Not available",
          adjustmentTypeDisplay: formatAdjustmentTypeDisplayFromClass(adjustmentClass),
          minimumFloorDisplay: formatMinimumFloorDisplayFromPreview(resolvedGraphRow),
          floorStatusDisplay: formatFloorStatusDisplayFromPreview(resolvedGraphRow),
          floorSourceLabel: resolvedGraphRow?.floorSourceLabel || null,
          floorSourceStatus: resolvedGraphRow?.floorSourceStatus || null,
          graphAdjustable: resolvedGraphRow?.graphAdjustable === true,
          graphAdjustmentSourceTrace: isPlainObject(resolvedGraphRow?.sourceTrace) ? clonePlainValue(resolvedGraphRow.sourceTrace) : {},
          adjustmentClass,
          minimumFloorMode,
          defaultAdjustmentClass,
          defaultAdjustmentTypeDisplay: formatAdjustmentTypeDisplayFromClass(defaultAdjustmentClass),
          defaultMinimumFloorMode,
          adjustmentOverrideStatus,
          defaultConservativeFloorRatio: defaultPolicy.conservativeFloorRatio,
          defaultElevatedCeilingRatio: defaultPolicy.elevatedCeilingRatio,
          resolvedConservativeFloorRatio,
          resolvedElevatedCeilingRatio,
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

    const overrideRows = getLifestyleOverrideRows(accountPolicy);
    const accountPolicyForSave = getAccountPolicyForSave(storageResult, accountId, storageApi);
    const graphAdjustmentOverrideRows = getGraphAdjustmentOverrideRows(accountPolicyForSave);
    const expenseLibraryRows = getExpenseLibraryRows(currentLensAnalysis);
    const livingFloorMetadataRows = getLivingFloorMetadataRows(currentLensAnalysis);
    const graphAdjustmentPreviewPolicy = buildGraphAdjustmentPreviewPolicy({
      currentLensAnalysis,
      expenseLibraryRows,
      lifestylePolicyRows: policyInputs.defaultLifestyleRangePolicies,
      livingFloorMetadata: livingFloorMetadataRows,
      accountPolicy: accountPolicyForSave
    });
    warnings.push.apply(warnings, getWarningList(graphAdjustmentPreviewPolicy));
    dataGaps.push.apply(dataGaps, getDataGapList(graphAdjustmentPreviewPolicy));

    const defaultGraphAdjustmentPreviewPolicy = buildGraphAdjustmentPreviewPolicy({
      currentLensAnalysis,
      expenseLibraryRows,
      lifestylePolicyRows: policyInputs.defaultLifestyleRangePolicies,
      livingFloorMetadata: livingFloorMetadataRows,
      accountPolicy: Object.assign({}, accountPolicyForSave, {
        lifestyleRangeOverrides: [],
        graphAdjustmentOverrides: []
      })
    });
    const rows = buildLifestyleRangeEditorRows(
      policyInputs.defaultLifestyleRangePolicies,
      graphAdjustmentPreviewPolicy.rows,
      defaultGraphAdjustmentPreviewPolicy.rows,
      overrideRows,
      currentLensAnalysis
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
        graphAdjustmentOverrides: graphAdjustmentOverrideRows.length,
        rowsWithGraphAdjustmentOverrides: rows.filter(function (row) {
          return row.adjustmentOverrideStatus === "accountOverride";
        }).length,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      },
      accountPolicy: accountPolicyForSave,
      foodAtHomeFloorAssumptions: buildFoodAtHomeFloorAssumptionsEditorModel(accountPolicyForSave),
      stateCostAdjustmentMultipliers: buildStateCostAdjustmentMultipliersEditorModel(accountPolicyForSave),
      model90DefaultBucketFloors: buildModel90DefaultBucketFloorsEditorModel(accountPolicyForSave),
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
        graphAdjustmentPolicyPreviewResolverAvailable: Boolean(getGraphAdjustmentPolicyResolver(currentLensAnalysis)),
        graphAdjustmentPolicyPreviewRows: Array.isArray(graphAdjustmentPreviewPolicy.rows)
          ? graphAdjustmentPreviewPolicy.rows.length
          : 0,
        graphAdjustmentPolicyPreviewActiveRuntimeConsumer: graphAdjustmentPreviewPolicy.metadata?.activeRuntimeConsumer === true,
        graphAdjustmentPolicyDisplaySource: "householdExpenseGraphAdjustmentPolicyResolver",
        editableNamespaces: [
          "lifestyleRangeOverrides",
          "graphAdjustmentOverrides",
          "livingFloorAssumptions.foodAtHome",
          "livingFloorAssumptions.stateCostAdjustmentMultipliers",
          "livingFloorAssumptions.model90DefaultBucketFloors"
        ],
        editableFields: [
          "conservativeFloorRatio",
          "elevatedCeilingRatio",
          "graphAdjustmentOverrides.adjustmentClass",
          "graphAdjustmentOverrides.minimumFloorMode",
          "foodAtHome.source",
          "foodAtHome.sourcePeriod",
          "foodAtHome.monthlyAmountsByBand",
          "foodAtHome.householdSizeAdjustmentFactors",
          "stateCostAdjustmentMultipliers.defaultMultiplier",
          "stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState",
          "model90DefaultBucketFloors.monthlyBaseAmount",
          "model90DefaultBucketFloors.monthlyPerMemberAmount",
          "model90DefaultBucketFloors.monthlyPerAdultDriverAmount",
          "model90DefaultBucketFloors.stateAdjustmentEnabled"
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
      graphAdjustmentOverrides: getGraphAdjustmentOverrideRows(existing),
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

  function buildSparseGraphAdjustmentSavePlan(input) {
    const options = isPlainObject(input) ? input : {};
    const sourceRows = Array.isArray(options.rows) ? options.rows : [];
    const draftRows = Array.isArray(options.draftRows) ? options.draftRows : [];
    const draftByTypeKey = draftRows.reduce(function (map, draftRow) {
      const expenseTypeKey = normalizeKey(draftRow?.expenseTypeKey);
      if (expenseTypeKey) {
        map[expenseTypeKey] = draftRow;
      }
      return map;
    }, {});
    const validationMessages = {};
    const sparseOverrides = [];
    const updatedAt = normalizeNullableText(options.updatedAt);

    sourceRows.forEach(function (sourceRow) {
      const expenseTypeKey = normalizeKey(sourceRow?.expenseTypeKey);
      if (!expenseTypeKey) {
        return;
      }

      const draftRow = draftByTypeKey[expenseTypeKey] || {};
      const adjustmentClass = normalizeAdjustmentClass(draftRow.adjustmentClass || sourceRow.adjustmentClass);
      if (!adjustmentClass) {
        validationMessages[expenseTypeKey] = ["Choose a valid adjustment type."];
        return;
      }

      const minimumFloorMode = deriveMinimumFloorModeForAdjustmentClass(adjustmentClass, sourceRow, draftRow.minimumFloorMode);
      if (!minimumFloorMode) {
        validationMessages[expenseTypeKey] = ["Choose a valid minimum floor mode for the adjustment type."];
        return;
      }

      const isDefaultAdjustment = adjustmentClass === sourceRow.defaultAdjustmentClass
        && minimumFloorMode === sourceRow.defaultMinimumFloorMode;
      if (!isDefaultAdjustment) {
        sparseOverrides.push({
          expenseTypeKey,
          adjustmentClass,
          minimumFloorMode,
          updatedAt,
          source: normalizeAdjustmentSource(draftRow.source)
        });
      }
    });

    return clonePlainValue({
      valid: Object.keys(validationMessages).length === 0,
      sparseGraphAdjustmentOverrides: sparseOverrides,
      validationMessages,
      trace: {
        source: "admin-graph-adjustment-type-save-plan",
        draftRows: draftRows.length,
        sparseOverrides: sparseOverrides.length,
        invalidRows: Object.keys(validationMessages).length
      }
    });
  }

  function buildAccountPolicyWithGraphAdjustmentOverrides(existingAccountPolicy, sparseGraphAdjustmentOverrides, accountId) {
    const existing = isPlainObject(existingAccountPolicy) ? existingAccountPolicy : {};
    const metadata = isPlainObject(existing.metadata) ? clonePlainValue(existing.metadata) : {};

    return clonePlainValue({
      version: Number.isFinite(Number(existing.version)) ? Number(existing.version) : 1,
      lifestyleRangeOverrides: Array.isArray(existing.lifestyleRangeOverrides)
        ? clonePlainValue(existing.lifestyleRangeOverrides)
        : [],
      graphAdjustmentOverrides: Array.isArray(sparseGraphAdjustmentOverrides)
        ? sparseGraphAdjustmentOverrides.map(clonePlainValue)
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
        source: metadata.source || "adminGraphAdjustmentEditorV1",
        lastEditedNamespace: "graphAdjustmentOverrides"
      })
    });
  }

  function buildGraphAdjustmentSavePayload(input) {
    const options = isPlainObject(input) ? input : {};
    const plan = buildSparseGraphAdjustmentSavePlan(options);
    if (!plan.valid) {
      return clonePlainValue({
        valid: false,
        validationMessages: plan.validationMessages,
        trace: plan.trace
      });
    }

    return clonePlainValue({
      valid: true,
      accountPolicy: buildAccountPolicyWithGraphAdjustmentOverrides(
        options.accountPolicy,
        plan.sparseGraphAdjustmentOverrides,
        options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID
      ),
      sparseGraphAdjustmentOverrides: plan.sparseGraphAdjustmentOverrides,
      validationMessages: {},
      trace: Object.assign({}, plan.trace, {
        payloadShape: "sparse-account-policy-graph-adjustment-override"
      })
    });
  }

  function buildGraphAdjustmentRowResetPayload(input) {
    const options = isPlainObject(input) ? input : {};
    const expenseTypeKey = normalizeKey(options.expenseTypeKey);
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const rowExists = rows.some(function (row) {
      return normalizeKey(row?.expenseTypeKey) === expenseTypeKey;
    });

    if (!expenseTypeKey || !rowExists) {
      return clonePlainValue({
        valid: false,
        validationMessages: {
          [expenseTypeKey || "missing-expense-type-key"]: ["Choose a valid graph adjustment row to reset."]
        },
        trace: {
          source: "admin-graph-adjustment-type-reset-plan",
          invalidRows: 1
        }
      });
    }

    const remainingOverrides = getGraphAdjustmentOverrideRows(options.accountPolicy).filter(function (override) {
      return normalizeKey(override.expenseTypeKey) !== expenseTypeKey;
    });

    return clonePlainValue({
      valid: true,
      accountPolicy: buildAccountPolicyWithGraphAdjustmentOverrides(
        options.accountPolicy,
        remainingOverrides,
        options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID
      ),
      sparseGraphAdjustmentOverrides: remainingOverrides,
      validationMessages: {},
      trace: {
        source: "admin-graph-adjustment-type-reset-plan",
        resetExpenseTypeKey: expenseTypeKey,
        sparseOverrides: remainingOverrides.length
      }
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

  function createBlankModel90DefaultBucketFloorsDraft() {
    return MODEL90_DEFAULT_BUCKET_FLOOR_KEYS.reduce(function (floors, planningBucketKey) {
      const config = MODEL90_DEFAULT_BUCKET_FLOOR_CONFIG[planningBucketKey];
      floors[planningBucketKey] = {
        source: "ADMIN_ENTERED",
        sourcePeriod: null,
        monthlyBaseAmount: null,
        [config.perUnitField]: null,
        stateAdjustmentEnabled: true,
        notes: null
      };
      return floors;
    }, {});
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

  function normalizeRequiredMultiplierDraftValue(value, label, messages) {
    const text = String(value == null ? "" : value).trim();
    const numericValue = asOptionalFiniteNumber(text);
    if (numericValue === null) {
      messages.push(`${label} must be a finite multiplier.`);
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
      graphAdjustmentOverrides: getGraphAdjustmentOverrideRows(existing),
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

  function isBlankStateMultiplierDraftRow(row) {
    const draftRow = isPlainObject(row) ? row : {};
    return !normalizeKey(draftRow.stateCode)
      && !normalizeKey(draftRow.multiplier)
      && !normalizeKey(draftRow.sourcePeriod)
      && !normalizeKey(draftRow.notes);
  }

  function validateStateCostAdjustmentMultipliersDraft(draft) {
    const row = isPlainObject(draft) ? draft : {};
    const messages = [];
    const defaultMultiplier = normalizeRequiredMultiplierDraftValue(
      row.defaultMultiplier,
      "defaultMultiplier",
      messages
    );
    const globalRows = Array.isArray(row.globalStateRows) ? row.globalStateRows : [];
    const seenStateCodes = new Set();
    const globalStateAdjustmentMultipliersByState = {};

    globalRows.forEach(function (draftRow, index) {
      if (isBlankStateMultiplierDraftRow(draftRow)) {
        return;
      }

      const rawStateCode = normalizeKey(draftRow?.stateCode).toUpperCase();
      const stateCode = normalizeStateCode(rawStateCode);
      if (!stateCode) {
        messages.push(`Row ${index + 1} state code must be a valid USPS state code.`);
        return;
      }

      if (seenStateCodes.has(stateCode)) {
        messages.push(`${stateCode} has duplicate state multiplier rows.`);
        return;
      }
      seenStateCodes.add(stateCode);

      const multiplier = normalizeRequiredMultiplierDraftValue(
        draftRow?.multiplier,
        `${stateCode} multiplier`,
        messages
      );
      if (multiplier === null) {
        return;
      }

      globalStateAdjustmentMultipliersByState[stateCode] = {
        multiplier,
        source: normalizeStateMultiplierSource(draftRow?.source),
        sourcePeriod: normalizeNullableText(draftRow?.sourcePeriod),
        notes: normalizeNullableText(draftRow?.notes)
      };
    });

    return clonePlainValue({
      valid: messages.length === 0,
      stateCostAdjustmentMultipliers: {
        version: 1,
        appliesToAdjustmentClass: "moneyFloorAdjusted",
        defaultMultiplier: defaultMultiplier === null ? 1 : defaultMultiplier,
        globalStateAdjustmentMultipliersByState,
        bucketStateAdjustmentMultipliers: {}
      },
      validationMessages: messages,
      trace: {
        source: "admin-state-cost-adjustment-multipliers-validation",
        editableNamespace: "livingFloorAssumptions.stateCostAdjustmentMultipliers",
        globalStateRows: Object.keys(globalStateAdjustmentMultipliersByState).length,
        invalidValues: messages.length
      }
    });
  }

  function validateModel90DefaultBucketFloorsDraft(draft) {
    const row = isPlainObject(draft) ? draft : {};
    const messages = [];
    const model90DefaultBucketFloors = MODEL90_DEFAULT_BUCKET_FLOOR_KEYS.reduce(function (floors, planningBucketKey) {
      const config = MODEL90_DEFAULT_BUCKET_FLOOR_CONFIG[planningBucketKey];
      const sourceRow = isPlainObject(row[planningBucketKey]) ? row[planningBucketKey] : {};
      const monthlyBaseAmount = normalizeOptionalDollarDraftValue(
        sourceRow.monthlyBaseAmount,
        `${planningBucketKey} monthlyBaseAmount`,
        messages
      );
      const perUnitAmount = normalizeOptionalDollarDraftValue(
        sourceRow[config.perUnitField],
        `${planningBucketKey} ${config.perUnitField}`,
        messages
      );

      floors[planningBucketKey] = {
        planningBucketKey,
        source: normalizeModel90DefaultFloorSource(sourceRow.source),
        sourcePeriod: normalizeNullableText(sourceRow.sourcePeriod),
        monthlyBaseAmount,
        [config.perUnitField]: perUnitAmount,
        stateAdjustmentEnabled: Object.prototype.hasOwnProperty.call(sourceRow, "stateAdjustmentEnabled")
          ? sourceRow.stateAdjustmentEnabled === true
          : true,
        notes: normalizeNullableText(sourceRow.notes)
      };
      return floors;
    }, {});

    return clonePlainValue({
      valid: messages.length === 0,
      model90DefaultBucketFloors,
      validationMessages: messages,
      trace: {
        source: "admin-model90-default-bucket-floors-validation",
        editableNamespace: "livingFloorAssumptions.model90DefaultBucketFloors",
        bucketRows: MODEL90_DEFAULT_BUCKET_FLOOR_KEYS.length,
        invalidValues: messages.length
      }
    });
  }

  function buildAccountPolicyWithStateCostAdjustmentMultipliers(existingAccountPolicy, stateCostAdjustmentMultipliers, accountId) {
    const existing = isPlainObject(existingAccountPolicy) ? existingAccountPolicy : {};
    const metadata = isPlainObject(existing.metadata) ? clonePlainValue(existing.metadata) : {};
    const existingLivingFloorAssumptions = getLivingFloorAssumptions(existing);
    const existingStateMultipliers = getStateCostAdjustmentMultipliers(existing);
    const nextStateMultipliers = {
      version: 1,
      appliesToAdjustmentClass: "moneyFloorAdjusted",
      defaultMultiplier: stateCostAdjustmentMultipliers.defaultMultiplier,
      globalStateAdjustmentMultipliersByState: clonePlainValue(stateCostAdjustmentMultipliers.globalStateAdjustmentMultipliersByState),
      bucketStateAdjustmentMultipliers: isPlainObject(existingStateMultipliers.bucketStateAdjustmentMultipliers)
        ? clonePlainValue(existingStateMultipliers.bucketStateAdjustmentMultipliers)
        : {}
    };
    const nextLivingFloorAssumptions = Object.assign({}, clonePlainValue(existingLivingFloorAssumptions), {
      version: Number.isFinite(Number(existingLivingFloorAssumptions.version))
        ? Number(existingLivingFloorAssumptions.version)
        : 1,
      stateCostAdjustmentMultipliers: nextStateMultipliers
    });

    return clonePlainValue({
      version: Number.isFinite(Number(existing.version)) ? Number(existing.version) : 1,
      lifestyleRangeOverrides: Array.isArray(existing.lifestyleRangeOverrides)
        ? clonePlainValue(existing.lifestyleRangeOverrides)
        : [],
      graphAdjustmentOverrides: getGraphAdjustmentOverrideRows(existing),
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
        source: metadata.source || "adminStateCostAdjustmentEditorV1",
        lastEditedNamespace: "livingFloorAssumptions.stateCostAdjustmentMultipliers"
      })
    });
  }

  function buildAccountPolicyWithModel90DefaultBucketFloors(existingAccountPolicy, model90DefaultBucketFloors, accountId) {
    const existing = isPlainObject(existingAccountPolicy) ? existingAccountPolicy : {};
    const metadata = isPlainObject(existing.metadata) ? clonePlainValue(existing.metadata) : {};
    const existingLivingFloorAssumptions = getLivingFloorAssumptions(existing);
    const nextLivingFloorAssumptions = Object.assign({}, clonePlainValue(existingLivingFloorAssumptions), {
      version: Number.isFinite(Number(existingLivingFloorAssumptions.version))
        ? Number(existingLivingFloorAssumptions.version)
        : 1,
      model90DefaultBucketFloors: clonePlainValue(model90DefaultBucketFloors)
    });

    return clonePlainValue({
      version: Number.isFinite(Number(existing.version)) ? Number(existing.version) : 1,
      lifestyleRangeOverrides: Array.isArray(existing.lifestyleRangeOverrides)
        ? clonePlainValue(existing.lifestyleRangeOverrides)
        : [],
      graphAdjustmentOverrides: getGraphAdjustmentOverrideRows(existing),
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
        source: metadata.source || "adminModel90DefaultBucketFloorsEditorV1",
        lastEditedNamespace: "livingFloorAssumptions.model90DefaultBucketFloors"
      })
    });
  }

  function buildStateCostAdjustmentMultipliersSavePayload(input) {
    const options = isPlainObject(input) ? input : {};
    const validation = validateStateCostAdjustmentMultipliersDraft(options.draftStateCostAdjustmentMultipliers);
    if (!validation.valid) {
      return clonePlainValue({
        valid: false,
        validationMessages: validation.validationMessages,
        trace: validation.trace
      });
    }

    return clonePlainValue({
      valid: true,
      accountPolicy: buildAccountPolicyWithStateCostAdjustmentMultipliers(
        options.accountPolicy,
        validation.stateCostAdjustmentMultipliers,
        options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID
      ),
      stateCostAdjustmentMultipliers: validation.stateCostAdjustmentMultipliers,
      validationMessages: [],
      trace: Object.assign({}, validation.trace, {
        payloadShape: "account-policy-living-floor-state-cost-adjustment"
      })
    });
  }

  function buildStateCostAdjustmentMultipliersResetPayload(input) {
    const options = isPlainObject(input) ? input : {};
    return buildStateCostAdjustmentMultipliersSavePayload(Object.assign({}, options, {
      draftStateCostAdjustmentMultipliers: {
        defaultMultiplier: 1,
        globalStateRows: []
      }
    }));
  }

  function buildModel90DefaultBucketFloorsSavePayload(input) {
    const options = isPlainObject(input) ? input : {};
    const validation = validateModel90DefaultBucketFloorsDraft(options.draftModel90DefaultBucketFloors);
    if (!validation.valid) {
      return clonePlainValue({
        valid: false,
        validationMessages: validation.validationMessages,
        trace: validation.trace
      });
    }

    return clonePlainValue({
      valid: true,
      accountPolicy: buildAccountPolicyWithModel90DefaultBucketFloors(
        options.accountPolicy,
        validation.model90DefaultBucketFloors,
        options.accountId || TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID
      ),
      model90DefaultBucketFloors: validation.model90DefaultBucketFloors,
      validationMessages: [],
      trace: Object.assign({}, validation.trace, {
        payloadShape: "account-policy-living-floor-model90-default-bucket-floors"
      })
    });
  }

  function buildModel90DefaultBucketFloorsResetPayload(input) {
    const options = isPlainObject(input) ? input : {};
    return buildModel90DefaultBucketFloorsSavePayload(Object.assign({}, options, {
      draftModel90DefaultBucketFloors: createBlankModel90DefaultBucketFloorsDraft()
    }));
  }

  function renderOverrideStatus(status) {
    return status === "accountOverride" ? "Account override" : "Default";
  }

  function renderResetButton(row) {
    const disabledAttribute = row.overrideStatus === "accountOverride" ? "" : " disabled";
    return `<button type="button" class="admin-action-button" data-household-expense-policy-reset-row data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}"${disabledAttribute}>Reset to default</button>`;
  }

  function renderAdjustmentTypeOptions(row) {
    return GRAPH_ADJUSTMENT_TYPE_OPTIONS.map(function (option) {
      const selectedAttribute = option.adjustmentClass === row.adjustmentClass ? " selected" : "";
      return `<option value="${escapeHtml(option.adjustmentClass)}"${selectedAttribute}>${escapeHtml(option.label)}</option>`;
    }).join("");
  }

  function renderAdjustmentTypeControl(row) {
    const resetDisabledAttribute = row.adjustmentOverrideStatus === "accountOverride" ? "" : " disabled";
    return `
      <select class="admin-tax-bracket-input" data-graph-adjustment-type-input data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}" aria-label="${escapeHtml(row.displayName)} adjustment type">
        ${renderAdjustmentTypeOptions(row)}
      </select>
      <div class="panel-copy">Default: ${escapeHtml(row.defaultAdjustmentTypeDisplay || "Metadata unavailable")}</div>
      <button type="button" class="admin-action-button" data-graph-adjustment-reset-row data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}"${resetDisabledAttribute}>Reset type</button>
    `;
  }

  function renderEditorRow(row) {
    return `
      <tr class="admin-tax-bracket-row" data-household-expense-policy-editor-row data-expense-type-key="${escapeHtml(row.expenseTypeKey || "")}" data-override-status="${escapeHtml(row.overrideStatus || "defaultSeedPolicy")}" data-graph-adjustment-override-status="${escapeHtml(row.adjustmentOverrideStatus || "defaultSeedPolicy")}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey || "")}" data-adjustment-class="${escapeHtml(row.adjustmentClass || "")}" data-minimum-floor-mode="${escapeHtml(row.minimumFloorMode || "")}" data-default-adjustment-class="${escapeHtml(row.defaultAdjustmentClass || "")}" data-default-minimum-floor-mode="${escapeHtml(row.defaultMinimumFloorMode || "")}" data-graph-adjustable="${row.graphAdjustable ? "true" : "false"}">
        <td>${escapeHtml(row.displayName)}</td>
        <td><code>${escapeHtml(row.expenseTypeKey || "")}</code></td>
        <td>
          <strong>${escapeHtml(row.planningBucketLabel || "Not available")}</strong><br>
          <code>${escapeHtml(row.planningBucketKey || "")}</code>
        </td>
        <td>${escapeHtml(row.rangeBehavior || "")}</td>
        <td>${renderAdjustmentTypeControl(row)}</td>
        <td>${escapeHtml(row.minimumFloorDisplay || "Metadata unavailable")}</td>
        <td>${escapeHtml(row.floorStatusDisplay || "Metadata unavailable")}</td>
        <td>${row.graphAdjustable ? "Yes" : "No"}</td>
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

  function renderStateCostAdjustmentMultiplierRow(row) {
    const stateCode = row?.stateCode || "";
    const multiplierInputValue = row?.multiplierInputValue || "";
    const source = row?.source || "ADMIN_ENTERED";
    const sourcePeriod = row?.sourcePeriod || "";
    const notes = row?.notes || "";

    return `
      <tr class="admin-tax-bracket-row" data-state-cost-adjustment-row>
        <td>
          <input class="admin-tax-bracket-input" type="text" maxlength="2" value="${escapeHtml(stateCode)}" data-state-cost-adjustment-state-code aria-label="State cost adjustment state code">
        </td>
        <td>
          <input class="admin-tax-bracket-input" type="number" step="0.0001" min="0.25" max="3" value="${escapeHtml(multiplierInputValue)}" data-state-cost-adjustment-multiplier aria-label="State cost adjustment multiplier">
        </td>
        <td>
          <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(source)}" data-state-cost-adjustment-source aria-label="State cost adjustment source">
        </td>
        <td>
          <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(sourcePeriod)}" data-state-cost-adjustment-source-period aria-label="State cost adjustment source period">
        </td>
        <td>
          <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(notes)}" data-state-cost-adjustment-notes aria-label="State cost adjustment notes">
        </td>
        <td>
          <button type="button" class="admin-action-button" data-state-cost-adjustment-remove-row>Remove row</button>
        </td>
      </tr>
    `;
  }

  function renderStateCostAdjustmentMultiplierRows(rows) {
    if (!rows.length) {
      return `
        <tr class="admin-tax-bracket-row" data-state-cost-adjustment-empty-row>
          <td colspan="6">No saved global state multiplier rows.</td>
        </tr>
      `;
    }

    return rows.map(renderStateCostAdjustmentMultiplierRow).join("");
  }

  function renderStateCostAdjustmentMultipliersEditor(stateMultiplierModel) {
    const model = isPlainObject(stateMultiplierModel)
      ? stateMultiplierModel
      : buildStateCostAdjustmentMultipliersEditorModel({});
    const rows = Array.isArray(model.globalStateRows) ? model.globalStateRows : [];

    return `
      <section class="admin-tax-bracket-group" data-state-cost-adjustment-multipliers-editor>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">State Cost Adjustment Multipliers</span>
            <h3>Global State Multipliers</h3>
            <p class="panel-copy">Saves only <code>accountPolicy.livingFloorAssumptions.stateCostAdjustmentMultipliers</code>. Future floor calculations will apply these only to money-floor adjusted buckets.</p>
            <p class="panel-copy">Applies to adjustment class: <code>moneyFloorAdjusted</code>. Bucket-specific state multipliers are preserved but not editable in this pass.</p>
          </div>
          <div>
            <button type="button" class="admin-action-button" data-state-cost-adjustment-save>Save State Multipliers</button>
            <button type="button" class="admin-action-button" data-state-cost-adjustment-add-row>Add State Row</button>
            <button type="button" class="admin-action-button" data-state-cost-adjustment-reset>Clear State Multipliers</button>
          </div>
        </div>
        <div class="panel-copy" data-state-cost-adjustment-editor-feedback role="status" aria-live="polite"></div>
        <table class="admin-tax-bracket-table" data-state-cost-adjustment-default-table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr class="admin-tax-bracket-row">
              <td><code>defaultMultiplier</code></td>
              <td>
                <input class="admin-tax-bracket-input" type="number" step="0.0001" min="0.25" max="3" value="${escapeHtml(model.defaultMultiplierInputValue || "1")}" data-state-cost-adjustment-default-multiplier aria-label="Default state cost adjustment multiplier">
              </td>
            </tr>
          </tbody>
        </table>
        <table class="admin-tax-bracket-table" data-state-cost-adjustment-global-state-table>
          <thead>
            <tr>
              <th>State</th>
              <th>Multiplier</th>
              <th>Source</th>
              <th>Source Period</th>
              <th>Notes</th>
              <th>Remove</th>
            </tr>
          </thead>
          <tbody data-state-cost-adjustment-global-state-rows>
            ${renderStateCostAdjustmentMultiplierRows(rows)}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderModel90DefaultBucketFloorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-model90-default-bucket-floor-row data-model90-default-bucket-floor-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>
            <strong>${escapeHtml(row.planningBucketLabel)}</strong><br>
            <code>${escapeHtml(row.planningBucketKey)}</code>
          </td>
          <td>
            <input class="admin-tax-bracket-input" type="number" step="0.01" min="0" value="${escapeHtml(row.monthlyBaseAmountInputValue)}" data-model90-default-bucket-floor-monthly-base-amount aria-label="${escapeHtml(row.planningBucketLabel)} monthly base amount">
          </td>
          <td>
            <input class="admin-tax-bracket-input" type="number" step="0.01" min="0" value="${escapeHtml(row.perUnitAmountInputValue)}" data-model90-default-bucket-floor-per-unit-amount data-model90-default-bucket-floor-per-unit-field="${escapeHtml(row.perUnitField)}" aria-label="${escapeHtml(row.planningBucketLabel)} ${escapeHtml(row.perUnitLabel)}">
            <div class="panel-copy"><code>${escapeHtml(row.perUnitField)}</code></div>
          </td>
          <td>
            <input type="checkbox" ${row.stateAdjustmentEnabled ? "checked" : ""} data-model90-default-bucket-floor-state-adjustment-enabled aria-label="${escapeHtml(row.planningBucketLabel)} state adjustment enabled">
          </td>
          <td>
            <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(row.source || "ADMIN_ENTERED")}" data-model90-default-bucket-floor-source aria-label="${escapeHtml(row.planningBucketLabel)} source">
          </td>
          <td>
            <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(row.sourcePeriod || "")}" data-model90-default-bucket-floor-source-period aria-label="${escapeHtml(row.planningBucketLabel)} source period">
          </td>
          <td>
            <input class="admin-tax-bracket-input" type="text" value="${escapeHtml(row.notes || "")}" data-model90-default-bucket-floor-notes aria-label="${escapeHtml(row.planningBucketLabel)} notes">
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderModel90DefaultBucketFloorsEditor(model90DefaultBucketFloorsModel) {
    const model = isPlainObject(model90DefaultBucketFloorsModel)
      ? model90DefaultBucketFloorsModel
      : buildModel90DefaultBucketFloorsEditorModel({});
    const rows = Array.isArray(model.rows) ? model.rows : [];

    return `
      <section class="admin-tax-bracket-group" data-model90-default-bucket-floors-editor>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">MODEL90 Default Floor Assumptions</span>
            <h3>Money-Floor Bucket Defaults</h3>
            <p class="panel-copy">Saves only <code>accountPolicy.livingFloorAssumptions.model90DefaultBucketFloors</code>. These values are stored for future living-floor calculations and are not used by runtime math yet.</p>
          </div>
          <div>
            <button type="button" class="admin-action-button" data-model90-default-bucket-floors-save>Save MODEL90 Defaults</button>
            <button type="button" class="admin-action-button" data-model90-default-bucket-floors-reset>Clear MODEL90 Defaults</button>
          </div>
        </div>
        <div class="panel-copy" data-model90-default-bucket-floors-editor-feedback role="status" aria-live="polite"></div>
        <table class="admin-tax-bracket-table" data-model90-default-bucket-floors-table>
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Monthly Base</th>
              <th>Per-Unit Amount</th>
              <th>State Adjusted</th>
              <th>Source</th>
              <th>Source Period</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${renderModel90DefaultBucketFloorRows(rows)}
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
        <section class="admin-tax-bracket-group" data-household-expense-graph-adjustment-controls>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Income Impact Adjustment Controls</span>
              <h3>Graph-Affecting Ratio Controls</h3>
              <p class="panel-copy"><strong>Affects all users on this account.</strong> All seed-approved graph adjustment rows remain editable here. Adjustment type overrides are saved for admin policy only and are not consumed by runtime math yet.</p>
              <p class="panel-copy">Policy source: ${escapeHtml(status.label || "Policy unavailable")} · Graph rows: ${escapeHtml(counts.previewRows || 0)} · Ratio overrides: ${escapeHtml(counts.rowsWithOverrides || 0)} · Type overrides: ${escapeHtml(counts.rowsWithGraphAdjustmentOverrides || 0)} · Warnings: ${escapeHtml(counts.warnings || 0)}</p>
            </div>
            <div>
              <button type="button" class="admin-action-button" data-household-expense-policy-save>Save Ratios</button>
              <button type="button" class="admin-action-button" data-graph-adjustment-save>Save Adjustment Types</button>
            </div>
          </div>
          <p class="panel-copy">Allowed values: floor 0.00-1.00, ceiling 1.00-${escapeHtml(formatRatio(limits.maxElevatedCeilingRatio || 2))}.</p>
          <div class="panel-copy" data-household-expense-policy-editor-feedback role="status" aria-live="polite"></div>
          <table class="admin-tax-bracket-table" data-household-expense-lifestyle-range-editor-table>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Type Key</th>
                <th>Planning Bucket</th>
                <th>Behavior</th>
                <th>Adjustment Type</th>
                <th>Minimum Floor</th>
                <th>Floor Source / Status</th>
                <th>Graph Adjustable</th>
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
                  <td colspan="17">No slider-eligible lifestyle range policy rows are available.</td>
                </tr>
              `}
            </tbody>
          </table>
        </section>
        ${renderFoodAtHomeFloorAssumptionsEditor(safeModel.foodAtHomeFloorAssumptions)}
        ${renderStateCostAdjustmentMultipliersEditor(safeModel.stateCostAdjustmentMultipliers)}
        ${renderModel90DefaultBucketFloorsEditor(safeModel.model90DefaultBucketFloors)}
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

  function collectGraphAdjustmentDraftRowsFromHost(host) {
    const rows = Array.from(host?.querySelectorAll?.("[data-household-expense-policy-editor-row]") || []);
    return rows.map(function (row) {
      const expenseTypeKey = normalizeKey(row.getAttribute("data-expense-type-key"));
      const adjustmentInput = row.querySelector("[data-graph-adjustment-type-input]");
      return {
        expenseTypeKey,
        adjustmentClass: adjustmentInput ? adjustmentInput.value : row.getAttribute("data-adjustment-class"),
        source: "ADMIN_ENTERED"
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

  function collectStateCostAdjustmentMultipliersDraftFromHost(host) {
    const section = host?.querySelector?.("[data-state-cost-adjustment-multipliers-editor]");
    const defaultMultiplierInput = section?.querySelector?.("[data-state-cost-adjustment-default-multiplier]");
    const globalStateRows = Array.from(section?.querySelectorAll?.("[data-state-cost-adjustment-row]") || [])
      .map(function (row) {
        return {
          stateCode: row.querySelector?.("[data-state-cost-adjustment-state-code]")?.value || "",
          multiplier: row.querySelector?.("[data-state-cost-adjustment-multiplier]")?.value || "",
          source: row.querySelector?.("[data-state-cost-adjustment-source]")?.value || "",
          sourcePeriod: row.querySelector?.("[data-state-cost-adjustment-source-period]")?.value || "",
          notes: row.querySelector?.("[data-state-cost-adjustment-notes]")?.value || ""
        };
      });

    return {
      defaultMultiplier: defaultMultiplierInput ? defaultMultiplierInput.value : 1,
      globalStateRows
    };
  }

  function collectModel90DefaultBucketFloorsDraftFromHost(host) {
    const section = host?.querySelector?.("[data-model90-default-bucket-floors-editor]");
    return MODEL90_DEFAULT_BUCKET_FLOOR_KEYS.reduce(function (floors, planningBucketKey) {
      const row = section?.querySelector?.(`[data-model90-default-bucket-floor-bucket-key="${planningBucketKey}"]`);
      const perUnitField = MODEL90_DEFAULT_BUCKET_FLOOR_CONFIG[planningBucketKey].perUnitField;
      floors[planningBucketKey] = {
        source: row?.querySelector?.("[data-model90-default-bucket-floor-source]")?.value || "ADMIN_ENTERED",
        sourcePeriod: row?.querySelector?.("[data-model90-default-bucket-floor-source-period]")?.value || null,
        monthlyBaseAmount: row?.querySelector?.("[data-model90-default-bucket-floor-monthly-base-amount]")?.value || null,
        [perUnitField]: row?.querySelector?.("[data-model90-default-bucket-floor-per-unit-amount]")?.value || null,
        stateAdjustmentEnabled: row?.querySelector?.("[data-model90-default-bucket-floor-state-adjustment-enabled]")?.checked === true,
        notes: row?.querySelector?.("[data-model90-default-bucket-floor-notes]")?.value || null
      };
      return floors;
    }, {});
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

  function setStateCostAdjustmentEditorFeedback(host, message) {
    const sectionFeedback = host?.querySelector?.("[data-state-cost-adjustment-editor-feedback]");
    if (sectionFeedback) {
      sectionFeedback.textContent = message || "";
    }
  }

  function setModel90DefaultBucketFloorsEditorFeedback(host, message) {
    const sectionFeedback = host?.querySelector?.("[data-model90-default-bucket-floors-editor-feedback]");
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

  function renderGraphAdjustmentValidationMessages(host, validationMessages) {
    clearEditorFeedback(host);
    Object.keys(validationMessages || {}).forEach(function (expenseTypeKey) {
      const rowFeedback = findRowFeedbackElement(host, expenseTypeKey);
      if (rowFeedback) {
        rowFeedback.textContent = validationMessages[expenseTypeKey].join(" ");
      }
    });

    const sectionFeedback = host?.querySelector?.("[data-household-expense-policy-editor-feedback]");
    if (sectionFeedback) {
      sectionFeedback.textContent = "Fix the highlighted adjustment type values before saving.";
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

  function renderStateCostAdjustmentValidationMessages(host, validationMessages) {
    const messages = Array.isArray(validationMessages) ? validationMessages : [];
    setStateCostAdjustmentEditorFeedback(
      host,
      messages.length
        ? `Fix State Cost Adjustment Multipliers before saving: ${messages.join(" ")}`
        : ""
    );
  }

  function renderModel90DefaultBucketFloorsValidationMessages(host, validationMessages) {
    const messages = Array.isArray(validationMessages) ? validationMessages : [];
    setModel90DefaultBucketFloorsEditorFeedback(
      host,
      messages.length
        ? `Fix MODEL90 Default Floor Assumptions before saving: ${messages.join(" ")}`
        : ""
    );
  }

  function addStateCostAdjustmentMultiplierRow(host) {
    const body = host?.querySelector?.("[data-state-cost-adjustment-global-state-rows]");
    if (!body) {
      return null;
    }

    const emptyRow = body.querySelector?.("[data-state-cost-adjustment-empty-row]");
    if (emptyRow) {
      emptyRow.remove();
    }

    body.insertAdjacentHTML("beforeend", renderStateCostAdjustmentMultiplierRow({
      stateCode: "",
      multiplierInputValue: "",
      source: "ADMIN_ENTERED",
      sourcePeriod: "",
      notes: ""
    }));
    setStateCostAdjustmentEditorFeedback(host, "Added a blank state multiplier row.");
    return body.querySelector?.("[data-state-cost-adjustment-row]:last-child") || null;
  }

  function removeStateCostAdjustmentMultiplierRow(host, row) {
    const body = host?.querySelector?.("[data-state-cost-adjustment-global-state-rows]");
    row?.remove?.();
    if (body && !body.querySelector("[data-state-cost-adjustment-row]")) {
      body.innerHTML = renderStateCostAdjustmentMultiplierRows([]);
    }
    setStateCostAdjustmentEditorFeedback(host, "Removed state multiplier row from the draft. Save to persist.");
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

  function saveGraphAdjustmentTypeChanges(host) {
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
    const payload = buildGraphAdjustmentSavePayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      rows: model.rows,
      draftRows: collectGraphAdjustmentDraftRowsFromHost(host),
      updatedAt: new Date().toISOString()
    });

    if (!payload.valid) {
      renderGraphAdjustmentValidationMessages(host, payload.validationMessages);
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
        updatedBy: "admin-graph-adjustment-type-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(
      host,
      nextModel,
      saveResult?.saved
        ? `Saved adjustment type overrides. Active type overrides: ${nextModel.counts.rowsWithGraphAdjustmentOverrides}.`
        : "Adjustment type changes were not saved."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function resetGraphAdjustmentTypeRow(host, expenseTypeKey) {
    const normalizedExpenseTypeKey = normalizeKey(expenseTypeKey);
    if (!normalizedExpenseTypeKey) {
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "missing-expense-type-key" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildGraphAdjustmentRowResetPayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      rows: model.rows,
      expenseTypeKey: normalizedExpenseTypeKey
    });

    if (!payload.valid) {
      renderGraphAdjustmentValidationMessages(host, payload.validationMessages);
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
        updatedBy: "admin-graph-adjustment-type-editor"
      },
      storage: global.localStorage
    });
    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel, `Reset ${normalizedExpenseTypeKey} to default adjustment type.`);
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

  function saveStateCostAdjustmentMultipliers(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      setStateCostAdjustmentEditorFeedback(host, "Household expense account policy storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildStateCostAdjustmentMultipliersSavePayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      draftStateCostAdjustmentMultipliers: collectStateCostAdjustmentMultipliersDraftFromHost(host)
    });

    if (!payload.valid) {
      renderStateCostAdjustmentValidationMessages(host, payload.validationMessages);
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
        updatedBy: "admin-state-cost-adjustment-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel);
    setStateCostAdjustmentEditorFeedback(
      host,
      saveResult?.saved
        ? "Saved state cost adjustment multipliers."
        : "State cost adjustment multipliers were not saved."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function resetStateCostAdjustmentMultipliers(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      setStateCostAdjustmentEditorFeedback(host, "Household expense account policy storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildStateCostAdjustmentMultipliersResetPayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy
    });

    if (!payload.valid) {
      renderStateCostAdjustmentValidationMessages(host, payload.validationMessages);
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
        updatedBy: "admin-state-cost-adjustment-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel);
    setStateCostAdjustmentEditorFeedback(
      host,
      saveResult?.saved
        ? "Cleared state cost adjustment multipliers."
        : "State cost adjustment multipliers were not cleared."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function saveModel90DefaultBucketFloors(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      setModel90DefaultBucketFloorsEditorFeedback(host, "Household expense account policy storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildModel90DefaultBucketFloorsSavePayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy,
      draftModel90DefaultBucketFloors: collectModel90DefaultBucketFloorsDraftFromHost(host)
    });

    if (!payload.valid) {
      renderModel90DefaultBucketFloorsValidationMessages(host, payload.validationMessages);
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
        updatedBy: "admin-model90-default-bucket-floors-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel);
    setModel90DefaultBucketFloorsEditorFeedback(
      host,
      saveResult?.saved
        ? "Saved MODEL90 default floor assumptions."
        : "MODEL90 default floor assumptions were not saved."
    );
    refreshReadOnlyPolicySummary();
    return saveResult;
  }

  function resetModel90DefaultBucketFloors(host) {
    const storageApi = global.LensApp?.accountSettings?.householdExpenseAccountPolicyStorage;
    if (!storageApi || typeof storageApi.saveHouseholdExpenseAccountPolicy !== "function") {
      setModel90DefaultBucketFloorsEditorFeedback(host, "Household expense account policy storage is unavailable.");
      return {
        status: "notSaved",
        saved: false,
        warnings: [{ code: "household-expense-policy-storage-unavailable" }]
      };
    }

    const model = buildHouseholdExpensePolicyEditorModel();
    const payload = buildModel90DefaultBucketFloorsResetPayload({
      accountId: model.accountId,
      accountPolicy: model.accountPolicy
    });

    if (!payload.valid) {
      renderModel90DefaultBucketFloorsValidationMessages(host, payload.validationMessages);
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
        updatedBy: "admin-model90-default-bucket-floors-editor"
      },
      storage: global.localStorage
    });

    const nextModel = buildHouseholdExpensePolicyEditorModel();
    rerenderEditorHost(host, nextModel);
    setModel90DefaultBucketFloorsEditorFeedback(
      host,
      saveResult?.saved
        ? "Cleared MODEL90 default floor assumptions."
        : "MODEL90 default floor assumptions were not cleared."
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

    const graphAdjustmentSaveButton = target.closest?.("[data-graph-adjustment-save]");
    if (graphAdjustmentSaveButton) {
      event.preventDefault();
      saveGraphAdjustmentTypeChanges(host);
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

    const stateMultiplierSaveButton = target.closest?.("[data-state-cost-adjustment-save]");
    if (stateMultiplierSaveButton) {
      event.preventDefault();
      saveStateCostAdjustmentMultipliers(host);
      return;
    }

    const stateMultiplierAddButton = target.closest?.("[data-state-cost-adjustment-add-row]");
    if (stateMultiplierAddButton) {
      event.preventDefault();
      addStateCostAdjustmentMultiplierRow(host);
      return;
    }

    const stateMultiplierResetButton = target.closest?.("[data-state-cost-adjustment-reset]");
    if (stateMultiplierResetButton) {
      event.preventDefault();
      resetStateCostAdjustmentMultipliers(host);
      return;
    }

    const stateMultiplierRemoveButton = target.closest?.("[data-state-cost-adjustment-remove-row]");
    if (stateMultiplierRemoveButton) {
      event.preventDefault();
      removeStateCostAdjustmentMultiplierRow(host, stateMultiplierRemoveButton.closest("[data-state-cost-adjustment-row]"));
      return;
    }

    const model90DefaultFloorsSaveButton = target.closest?.("[data-model90-default-bucket-floors-save]");
    if (model90DefaultFloorsSaveButton) {
      event.preventDefault();
      saveModel90DefaultBucketFloors(host);
      return;
    }

    const model90DefaultFloorsResetButton = target.closest?.("[data-model90-default-bucket-floors-reset]");
    if (model90DefaultFloorsResetButton) {
      event.preventDefault();
      resetModel90DefaultBucketFloors(host);
      return;
    }

    const resetButton = target.closest?.("[data-household-expense-policy-reset-row]");
    if (resetButton) {
      event.preventDefault();
      resetLifestyleRangeEditorRow(host, resetButton.getAttribute("data-expense-type-key"));
      return;
    }

    const graphAdjustmentResetButton = target.closest?.("[data-graph-adjustment-reset-row]");
    if (graphAdjustmentResetButton) {
      event.preventDefault();
      resetGraphAdjustmentTypeRow(host, graphAdjustmentResetButton.getAttribute("data-expense-type-key"));
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
    MODEL90_DEFAULT_BUCKET_FLOOR_KEYS,
    STATE_CODE_VALUES,
    GRAPH_ADJUSTMENT_TYPE_OPTIONS,
    buildLifestyleRangeEditorRows,
    buildFoodAtHomeFloorAssumptionsEditorModel,
    buildStateCostAdjustmentMultipliersEditorModel,
    buildModel90DefaultBucketFloorsEditorModel,
    validateLifestyleRatioDraftRow,
    validateFoodAtHomeFloorAssumptionsDraft,
    validateStateCostAdjustmentMultipliersDraft,
    validateModel90DefaultBucketFloorsDraft,
    buildSparseLifestyleRangeSavePlan,
    buildAccountPolicyWithLifestyleOverrides,
    buildSparseGraphAdjustmentSavePlan,
    buildAccountPolicyWithGraphAdjustmentOverrides,
    buildAccountPolicyWithFoodAtHomeFloorAssumptions,
    buildAccountPolicyWithStateCostAdjustmentMultipliers,
    buildAccountPolicyWithModel90DefaultBucketFloors,
    buildLifestyleRangeSavePayload,
    buildGraphAdjustmentSavePayload,
    buildGraphAdjustmentRowResetPayload,
    buildFoodAtHomeFloorAssumptionsSavePayload,
    buildFoodAtHomeFloorAssumptionsResetPayload,
    buildStateCostAdjustmentMultipliersSavePayload,
    buildStateCostAdjustmentMultipliersResetPayload,
    buildModel90DefaultBucketFloorsSavePayload,
    buildModel90DefaultBucketFloorsResetPayload,
    saveLifestyleRangeEditorChanges,
    resetLifestyleRangeEditorRow,
    saveGraphAdjustmentTypeChanges,
    resetGraphAdjustmentTypeRow,
    saveFoodAtHomeFloorAssumptions,
    resetFoodAtHomeFloorAssumptions,
    saveStateCostAdjustmentMultipliers,
    resetStateCostAdjustmentMultipliers,
    saveModel90DefaultBucketFloors,
    resetModel90DefaultBucketFloors,
    buildHouseholdExpensePolicyEditorModel,
    renderFoodAtHomeFloorAssumptionsEditor,
    renderStateCostAdjustmentMultipliersEditor,
    renderModel90DefaultBucketFloorsEditor,
    renderHouseholdExpensePolicyEditor,
    initializeHouseholdExpenseAccountPolicyAdminEditor
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeHouseholdExpenseAccountPolicyAdminEditor);
})(typeof globalThis !== "undefined" ? globalThis : this);
