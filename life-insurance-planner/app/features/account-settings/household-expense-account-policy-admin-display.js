(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const accountSettings = LensApp.accountSettings || (LensApp.accountSettings = {});

  // Owner: admin read-only household expense account policy display.
  // Non-goals: no editing, no saving, no policy calculations, no runtime graph wiring.

  const TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID = "temporary-local-household-expense-policy-account-v1";
  const POLICY_DISPLAY_HOST_SELECTOR = "[data-household-expense-account-policy-status]";

  const PROTECTED_CATEGORY_SUMMARY = Object.freeze([
    { label: "Housing", status: "Locked / protected" },
    { label: "Debt obligations", status: "Locked / protected" },
    { label: "Tax and legal", status: "Locked / protected" },
    { label: "Healthcare", status: "Locked / protected" },
    { label: "Childcare / dependent care", status: "Locked / protected" },
    { label: "Insurance / protection", status: "Locked / protected" },
    { label: "Giving / remittances", status: "Locked / values-sensitive" }
  ]);
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

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function countNamespaceRows(accountPolicy, namespace) {
    return Array.isArray(accountPolicy?.[namespace]) ? accountPolicy[namespace].length : 0;
  }

  function getExpenseLibraryRows(currentLensAnalysis) {
    const library = currentLensAnalysis?.expenseLibrary;
    return library && typeof library.getExpenseLibraryEntries === "function"
      ? library.getExpenseLibraryEntries()
      : [];
  }

  function getPlanningBucketSummaryApi(currentLensAnalysis) {
    const summaryApi = currentLensAnalysis?.householdExpensePlanningBucketPolicySummary;
    if (summaryApi && typeof summaryApi.summarizeHouseholdExpensePlanningBucketPolicy === "function") {
      return summaryApi.summarizeHouseholdExpensePlanningBucketPolicy;
    }

    if (typeof currentLensAnalysis?.summarizeHouseholdExpensePlanningBucketPolicy === "function") {
      return currentLensAnalysis.summarizeHouseholdExpensePlanningBucketPolicy;
    }

    return null;
  }

  function getLivingFloorMetadataApi(currentLensAnalysis) {
    const metadataApi = currentLensAnalysis?.householdExpenseLivingFloorMetadata;
    if (metadataApi && typeof metadataApi.getHouseholdExpenseLivingFloorMetadata === "function") {
      return metadataApi;
    }

    return null;
  }

  function getPlanningBucketLabelMap(currentLensAnalysis) {
    const library = currentLensAnalysis?.expenseLibrary;
    const buckets = library && typeof library.getExpensePlanningBuckets === "function"
      ? library.getExpensePlanningBuckets()
      : [];

    return buckets.reduce(function (map, bucket) {
      if (bucket?.planningBucketKey) {
        map[bucket.planningBucketKey] = bucket.planningBucketLabel || bucket.label || bucket.planningBucketKey;
      }
      return map;
    }, {});
  }

  function getExpenseLabelMap(libraryRows) {
    return (Array.isArray(libraryRows) ? libraryRows : []).reduce(function (map, row) {
      const typeKey = row && (row.typeKey || row.expenseTypeKey);
      if (typeKey) {
        map[typeKey] = row.label || row.displayName || typeKey;
      }
      return map;
    }, {});
  }

  function formatRatio(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "n/a";
  }

  function asFiniteNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function hasTextValue(value) {
    return typeof value === "string" && value.trim() !== "";
  }

  function hasNumericValue(value) {
    return asFiniteNumber(value) !== null;
  }

  function formatNotSet(value) {
    if (value == null || value === "") {
      return "Not set";
    }

    return String(value);
  }

  function formatDollarValue(value) {
    const numericValue = asFiniteNumber(value);
    return numericValue === null ? "Not set" : `$${numericValue.toFixed(2)}`;
  }

  function formatMultiplierValue(value) {
    const numericValue = asFiniteNumber(value);
    return numericValue === null ? "Not set" : numericValue.toFixed(2);
  }

  function formatRatioSetSummary(ratioSets) {
    const rows = Array.isArray(ratioSets) ? ratioSets : [];
    if (!rows.length) {
      return "No policy ratio sets";
    }

    return rows.map(function (ratioSet) {
      const rowCount = Array.isArray(ratioSet.expenseTypeKeys) ? ratioSet.expenseTypeKeys.length : 0;
      if (ratioSet.sliderEligible === true) {
        return `${ratioSet.rangeBehavior || "slider"} ${formatRatio(ratioSet.conservativeFloorRatio)}-${formatRatio(ratioSet.elevatedCeilingRatio)} (${rowCount})`;
      }

      return `${ratioSet.rangeBehavior || "locked"} locked (${rowCount})`;
    }).join("; ");
  }

  function formatValueSummary(values) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    return list.length ? list.join(", ") : "n/a";
  }

  function mapExceptionLabels(exceptionCandidates, labelByType) {
    return (Array.isArray(exceptionCandidates) ? exceptionCandidates : [])
      .map(function (candidate) {
        const typeKey = candidate.expenseTypeKey || "";
        const label = labelByType[typeKey] || typeKey;
        return {
          expenseTypeKey: typeKey,
          label,
          code: candidate.code || "exception"
        };
      });
  }

  function toBucketDisplayRow(bucket, labelByType) {
    const exceptionRows = mapExceptionLabels(bucket.exceptionCandidates, labelByType);
    return {
      planningBucketKey: bucket.planningBucketKey || "",
      planningBucketLabel: bucket.planningBucketLabel || bucket.planningBucketKey || "Unnamed bucket",
      lifestylePolicyRowCount: Number(bucket.lifestylePolicyRowCount) || 0,
      sliderEligibleRowCount: Number(bucket.sliderEligibleRowCount) || 0,
      ratioSetSummary: formatRatioSetSummary(bucket.distinctRatioSets),
      cleanBucketCandidate: bucket.cleanBucketCandidate === true,
      treatmentIncludedSummary: formatValueSummary(bucket.distinctLifestyleTreatmentIncludedValues),
      treatmentReasonSummary: formatValueSummary(bucket.distinctLifestyleTreatmentReasonValues),
      exceptionCount: exceptionRows.length,
      exceptionRows
    };
  }

  function toNoPolicyBucketDisplayRow(bucket) {
    return {
      planningBucketKey: bucket.planningBucketKey || "",
      planningBucketLabel: bucket.planningBucketLabel || bucket.planningBucketKey || "Unnamed bucket",
      lifestylePolicyRowCount: Number(bucket.lifestylePolicyRowCount) || 0,
      sliderEligibleRowCount: Number(bucket.sliderEligibleRowCount) || 0,
      treatmentIncludedSummary: String(bucket.lifestyleTreatmentIncluded),
      treatmentReasonSummary: bucket.lifestyleTreatmentReason || "no-policy-row",
      ratioSetSummary: "No lifestyle policy rows",
      cleanBucketCandidate: false,
      exceptionCount: 0,
      exceptionRows: []
    };
  }

  function buildPlanningBucketSummaryDisplayModel(currentLensAnalysis) {
    const summarize = getPlanningBucketSummaryApi(currentLensAnalysis);
    if (typeof summarize !== "function") {
      return {
        available: false,
        cleanIncludedBuckets: [],
        mixedExceptionBuckets: [],
        lockedSourceOwnedBuckets: [],
        trace: {
          source: "admin-household-expense-planning-bucket-summary-display",
          readOnly: true,
          helperAvailable: false
        }
      };
    }

    const summary = summarize();
    const buckets = Array.isArray(summary?.buckets) ? summary.buckets : [];
    const noPolicyRows = Array.isArray(summary?.noPolicyRows) ? summary.noPolicyRows : [];
    const labelByType = getExpenseLabelMap(getExpenseLibraryRows(currentLensAnalysis));

    return {
      available: true,
      summaryVersion: summary.summaryVersion || null,
      lifestylePolicyRowCount: Number(summary.lifestylePolicyRowCount) || 0,
      sliderEligibleRowCount: Number(summary.sliderEligibleRowCount) || 0,
      cleanIncludedBuckets: buckets
        .filter(function (bucket) {
          return bucket.cleanBucketCandidate === true;
        })
        .map(function (bucket) {
          return toBucketDisplayRow(bucket, labelByType);
        }),
      mixedExceptionBuckets: buckets
        .filter(function (bucket) {
          return bucket.sliderEligibleRowCount > 0 && bucket.cleanBucketCandidate !== true;
        })
        .map(function (bucket) {
          return toBucketDisplayRow(bucket, labelByType);
        }),
      lockedSourceOwnedBuckets: buckets
        .filter(function (bucket) {
          return bucket.sliderEligibleRowCount === 0;
        })
        .map(function (bucket) {
          return toBucketDisplayRow(bucket, labelByType);
        })
        .concat(noPolicyRows
          .filter(function (bucket) {
            return bucket.lifestyleTreatmentIncluded !== true;
          })
          .map(toNoPolicyBucketDisplayRow)),
      trace: {
        source: "admin-household-expense-planning-bucket-summary-display",
        readOnly: true,
        helperAvailable: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function toLivingFloorDisplayRow(row, bucketLabelByKey) {
    return {
      planningBucketKey: row.planningBucketKey || "",
      planningBucketLabel: bucketLabelByKey[row.planningBucketKey] || row.planningBucketKey || "Unnamed bucket",
      adjustmentClass: row.adjustmentClass || "",
      minimumFloorMode: row.minimumFloorMode || "",
      benchmarkAvailable: row.benchmarkAvailable === true,
      benchmarkSource: row.benchmarkSource || "NONE",
      floorSource: row.floorSource || "NONE",
      stateAdjustmentSource: row.stateAdjustmentSource || "NONE",
      householdSizingMethod: row.householdSizingMethod || "none",
      adminEditable: row.adminEditable === true,
      adminDollarInputsRequired: row.adminDollarInputsRequired === true,
      sourceDataStatus: row.sourceDataStatus || "notApplicable",
      usesSurvivingHousehold: row.usesSurvivingHousehold === true,
      notes: row.notes || ""
    };
  }

  function buildLivingFloorMetadataDisplayModel(currentLensAnalysis) {
    const metadataApi = getLivingFloorMetadataApi(currentLensAnalysis);
    if (!metadataApi) {
      return {
        available: false,
        moneyFloorAdjustedBuckets: [],
        ratioAdjustedBuckets: [],
        excludedFromAdjustmentBuckets: [],
        foodAtHomeBands: [],
        stateSourcePriority: [],
        householdSizingRule: null,
        traceFields: [],
        trace: {
          source: "admin-household-expense-living-floor-metadata-display",
          readOnly: true,
          helperAvailable: false
        }
      };
    }

    const bucketLabelByKey = getPlanningBucketLabelMap(currentLensAnalysis);
    const rows = metadataApi.getHouseholdExpenseLivingFloorMetadata().map(function (row) {
      return toLivingFloorDisplayRow(row, bucketLabelByKey);
    });

    return {
      available: true,
      metadataVersion: metadataApi.LIVING_FLOOR_METADATA_VERSION || null,
      moneyFloorAdjustedBuckets: rows.filter(function (row) {
        return row.adjustmentClass === "moneyFloorAdjusted";
      }),
      ratioAdjustedBuckets: rows.filter(function (row) {
        return row.adjustmentClass === "ratioAdjusted";
      }),
      excludedFromAdjustmentBuckets: rows.filter(function (row) {
        return row.adjustmentClass === "excludedFromAdjustment";
      }),
      foodAtHomeBands: typeof metadataApi.getFoodAtHomeHouseholdMemberBands === "function"
        ? metadataApi.getFoodAtHomeHouseholdMemberBands()
        : [],
      stateSourcePriority: typeof metadataApi.getHouseholdExpenseLivingFloorStateSourcePriority === "function"
        ? metadataApi.getHouseholdExpenseLivingFloorStateSourcePriority()
        : [],
      householdSizingRule: typeof metadataApi.getHouseholdExpenseLivingFloorHouseholdSizingRule === "function"
        ? metadataApi.getHouseholdExpenseLivingFloorHouseholdSizingRule()
        : null,
      traceFields: typeof metadataApi.getHouseholdExpenseLivingFloorTraceFields === "function"
        ? metadataApi.getHouseholdExpenseLivingFloorTraceFields()
        : [],
      trace: {
        source: "admin-household-expense-living-floor-metadata-display",
        readOnly: true,
        helperAvailable: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function toFoodBandAssumptionRows(monthlyAmountsByBand) {
    const values = isPlainObject(monthlyAmountsByBand) ? monthlyAmountsByBand : {};
    return FOOD_AT_HOME_BAND_KEYS.map(function (bandKey) {
      return {
        bandKey,
        value: hasNumericValue(values[bandKey]) ? Number(values[bandKey]) : null,
        displayValue: formatDollarValue(values[bandKey])
      };
    });
  }

  function toHouseholdSizeFactorRows(householdSizeAdjustmentFactors) {
    const values = isPlainObject(householdSizeAdjustmentFactors) ? householdSizeAdjustmentFactors : {};
    return HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.map(function (factorKey) {
      return {
        factorKey,
        value: hasNumericValue(values[factorKey]) ? Number(values[factorKey]) : null,
        displayValue: formatMultiplierValue(values[factorKey])
      };
    });
  }

  function toStateMultiplierRows(stateMultipliers) {
    const rows = isPlainObject(stateMultipliers) ? stateMultipliers : {};
    return Object.keys(rows).sort().map(function (stateKey) {
      const row = isPlainObject(rows[stateKey]) ? rows[stateKey] : {};
      return {
        stateKey,
        multiplier: hasNumericValue(row.multiplier) ? Number(row.multiplier) : null,
        multiplierDisplay: formatMultiplierValue(row.multiplier),
        source: formatNotSet(row.source),
        sourcePeriod: formatNotSet(row.sourcePeriod),
        notes: formatNotSet(row.notes)
      };
    });
  }

  function toBucketStateMultiplierRows(bucketStateAdjustmentMultipliers) {
    const buckets = isPlainObject(bucketStateAdjustmentMultipliers) ? bucketStateAdjustmentMultipliers : {};
    return Object.keys(buckets).sort().map(function (planningBucketKey) {
      const stateRows = toStateMultiplierRows(buckets[planningBucketKey]);
      return {
        planningBucketKey,
        stateRowCount: stateRows.length,
        stateRows
      };
    });
  }

  function toModel90DefaultBucketFloorRows(model90DefaultBucketFloors, bucketLabelByKey) {
    const floors = isPlainObject(model90DefaultBucketFloors) ? model90DefaultBucketFloors : {};
    return MODEL90_DEFAULT_BUCKET_FLOOR_KEYS.map(function (planningBucketKey) {
      const row = isPlainObject(floors[planningBucketKey]) ? floors[planningBucketKey] : {};
      const perMemberField = planningBucketKey === "transportationBasics"
        ? "monthlyPerAdultDriverAmount"
        : "monthlyPerMemberAmount";
      return {
        planningBucketKey,
        planningBucketLabel: bucketLabelByKey[planningBucketKey] || planningBucketKey,
        monthlyBaseAmount: hasNumericValue(row.monthlyBaseAmount) ? Number(row.monthlyBaseAmount) : null,
        monthlyBaseAmountDisplay: formatDollarValue(row.monthlyBaseAmount),
        perMemberField,
        perMemberAmount: hasNumericValue(row[perMemberField]) ? Number(row[perMemberField]) : null,
        perMemberAmountDisplay: formatDollarValue(row[perMemberField]),
        stateAdjustmentEnabled: row.stateAdjustmentEnabled === true,
        sourcePeriod: formatNotSet(row.sourcePeriod),
        notes: formatNotSet(row.notes)
      };
    });
  }

  function countSavedAssumptionValues(model) {
    let count = 0;
    model.foodAtHome.bandRows.forEach(function (row) {
      if (row.value !== null) {
        count += 1;
      }
    });
    model.foodAtHome.householdSizeAdjustmentFactorRows.forEach(function (row) {
      if (row.value !== null) {
        count += 1;
      }
    });
    if (hasTextValue(model.foodAtHome.sourcePeriodRaw)) {
      count += 1;
    }
    model.stateCostAdjustmentMultipliers.globalStateRows.forEach(function (row) {
      if (row.multiplier !== null || row.sourcePeriod !== "Not set" || row.notes !== "Not set") {
        count += 1;
      }
    });
    model.stateCostAdjustmentMultipliers.bucketStateRows.forEach(function (bucketRow) {
      bucketRow.stateRows.forEach(function (row) {
        if (row.multiplier !== null || row.sourcePeriod !== "Not set" || row.notes !== "Not set") {
          count += 1;
        }
      });
    });
    model.model90DefaultBucketFloors.forEach(function (row) {
      if (
        row.monthlyBaseAmount !== null
        || row.perMemberAmount !== null
        || row.sourcePeriod !== "Not set"
        || row.notes !== "Not set"
      ) {
        count += 1;
      }
    });
    return count;
  }

  function getSavedLivingFloorStatus(model) {
    const bandCount = model.foodAtHome.bandRows.filter(function (row) {
      return row.value !== null;
    }).length;
    const factorCount = model.foodAtHome.householdSizeAdjustmentFactorRows.filter(function (row) {
      return row.value !== null;
    }).length;

    if (
      bandCount === FOOD_AT_HOME_BAND_KEYS.length
      && factorCount === HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.length
    ) {
      return {
        code: "configured",
        label: "Configured"
      };
    }

    if (countSavedAssumptionValues(model) > 0) {
      return {
        code: "partiallyConfigured",
        label: "Partially configured"
      };
    }

    return {
      code: "notConfigured",
      label: "Not configured"
    };
  }

  function buildSavedLivingFloorAssumptionsDisplayModel(accountPolicy, currentLensAnalysis) {
    const bucketLabelByKey = getPlanningBucketLabelMap(currentLensAnalysis);
    const assumptions = isPlainObject(accountPolicy?.livingFloorAssumptions)
      ? accountPolicy.livingFloorAssumptions
      : {};
    const foodAtHome = isPlainObject(assumptions.foodAtHome) ? assumptions.foodAtHome : {};
    const stateMultipliers = isPlainObject(assumptions.stateCostAdjustmentMultipliers)
      ? assumptions.stateCostAdjustmentMultipliers
      : {};

    const model = {
      available: true,
      version: assumptions.version || null,
      foodAtHome: {
        planningBucketKey: foodAtHome.planningBucketKey || "foodAtHomeConsumables",
        source: formatNotSet(foodAtHome.source),
        sourcePeriod: formatNotSet(foodAtHome.sourcePeriod),
        sourcePeriodRaw: foodAtHome.sourcePeriod || null,
        bandRows: toFoodBandAssumptionRows(foodAtHome.monthlyAmountsByBand),
        householdSizeAdjustmentFactorRows: toHouseholdSizeFactorRows(foodAtHome.householdSizeAdjustmentFactors)
      },
      stateCostAdjustmentMultipliers: {
        version: stateMultipliers.version || null,
        appliesToAdjustmentClass: formatNotSet(stateMultipliers.appliesToAdjustmentClass),
        defaultMultiplier: formatMultiplierValue(stateMultipliers.defaultMultiplier),
        globalStateRows: toStateMultiplierRows(stateMultipliers.globalStateAdjustmentMultipliersByState),
        bucketStateRows: toBucketStateMultiplierRows(stateMultipliers.bucketStateAdjustmentMultipliers)
      },
      model90DefaultBucketFloors: toModel90DefaultBucketFloorRows(
        assumptions.model90DefaultBucketFloors,
        bucketLabelByKey
      ),
      trace: {
        source: "admin-household-expense-saved-living-floor-assumptions-display",
        readOnly: true,
        editableControlsRendered: false,
        saveControlsRendered: false,
        calculationsPerformed: false
      }
    };
    const status = getSavedLivingFloorStatus(model);
    model.status = status;
    model.counts = {
      configuredFoodAtHomeBands: model.foodAtHome.bandRows.filter(function (row) {
        return row.value !== null;
      }).length,
      requiredFoodAtHomeBands: FOOD_AT_HOME_BAND_KEYS.length,
      configuredHouseholdSizeFactors: model.foodAtHome.householdSizeAdjustmentFactorRows.filter(function (row) {
        return row.value !== null;
      }).length,
      requiredHouseholdSizeFactors: HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.length,
      globalStateMultiplierRows: model.stateCostAdjustmentMultipliers.globalStateRows.length,
      bucketStateMultiplierGroups: model.stateCostAdjustmentMultipliers.bucketStateRows.length,
      model90DefaultBucketFloors: model.model90DefaultBucketFloors.length,
      savedAssumptionValues: countSavedAssumptionValues(model)
    };
    return model;
  }

  function getPolicyStatus(storageResult, resolvedPolicy) {
    if (storageResult?.status === "loaded") {
      return {
        code: "accountOverride",
        label: "Saved account override",
        message: "A saved browser-local account policy override is being resolved against MODEL90 seed defaults."
      };
    }

    if (storageResult?.status === "fallback" && storageResult?.metadata?.fallbackReason === "missing-account-policy") {
      return {
        code: "defaultSeedPolicy",
        label: "Default seed policy only",
        message: "No saved browser-local account override was found. MODEL90 seed policies are active."
      };
    }

    if (!resolvedPolicy) {
      return {
        code: "fallbackPolicy",
        label: "Fallback policy",
        message: "Policy resolution could not complete. Runtime helpers will rely on their safe seed fallbacks."
      };
    }

    return {
      code: "fallbackPolicy",
      label: "Fallback policy",
      message: "Saved policy could not be used safely. MODEL90 seed policies are active with warning trace."
    };
  }

  function buildHouseholdExpensePolicyDisplayModel(input) {
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
    const accountPolicy = storageResult?.status === "loaded" && isPlainObject(storageResult.accountPolicy)
      ? storageResult.accountPolicy
      : null;
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

    const activePolicy = isPlainObject(resolvedPolicy) ? resolvedPolicy : {};
    const loadedPolicy = isPlainObject(storageResult?.accountPolicy) ? storageResult.accountPolicy : {};
    const status = getPolicyStatus(storageResult, resolvedPolicy);
    const planningBucketSummary = buildPlanningBucketSummaryDisplayModel(currentLensAnalysis);
    const livingFloorMetadata = buildLivingFloorMetadataDisplayModel(currentLensAnalysis);
    const savedLivingFloorAssumptions = buildSavedLivingFloorAssumptionsDisplayModel(loadedPolicy, currentLensAnalysis);
    if (planningBucketSummary.available !== true) {
      dataGaps.push({
        code: "household-expense-planning-bucket-summary-unavailable",
        message: "Planning bucket policy summary helper is unavailable."
      });
    }
    if (livingFloorMetadata.available !== true) {
      dataGaps.push({
        code: "household-expense-living-floor-metadata-unavailable",
        message: "Household expense living-floor metadata helper is unavailable."
      });
    }

    return {
      accountId,
      accountIdSource: "temporaryLocalAdminFallback",
      status,
      counts: {
        lifestyleRangePolicyRows: Array.isArray(activePolicy.resolvedLifestyleRangePolicies)
          ? activePolicy.resolvedLifestyleRangePolicies.length
          : policyInputs.defaultLifestyleRangePolicies.length,
        compressionPolicyRows: Array.isArray(activePolicy.resolvedCompressionPolicyRules)
          ? activePolicy.resolvedCompressionPolicyRules.length
          : policyInputs.defaultCompressionPolicyRules.length,
        compressionThresholdRows: Array.isArray(activePolicy.resolvedCompressionThresholdRules)
          ? activePolicy.resolvedCompressionThresholdRules.length
          : policyInputs.defaultCompressionThresholdRules.length,
        lifestyleRangeOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "lifestyleRangeOverrides") : 0,
        compressionPolicyOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "compressionPolicyOverrides") : 0,
        compressionThresholdOverrides: status.code === "accountOverride" ? countNamespaceRows(loadedPolicy, "compressionThresholdOverrides") : 0,
        warnings: warnings.length,
        dataGaps: dataGaps.length
      },
      protectedCategories: PROTECTED_CATEGORY_SUMMARY.map(function (row) {
        return Object.assign({}, row);
      }),
      planningBucketSummary,
      livingFloorMetadata,
      savedLivingFloorAssumptions,
      warnings,
      dataGaps,
      trace: {
        source: "admin-household-expense-account-policy-read-only-display",
        accountId,
        accountIdSource: "temporaryLocalAdminFallback",
        storageStatus: storageResult?.status || "unavailable",
        storageFallbackReason: storageResult?.metadata?.fallbackReason || null,
        policySource: status.code,
        resolverAvailable: typeof resolver === "function",
        readOnly: true,
        editableControlsRendered: false,
        saveControlsRendered: false
      }
    };
  }

  function renderCountCard(label, value) {
    return `
      <article class="admin-summary-card">
        <span class="section-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `;
  }

  function renderBucketExceptionSummary(row) {
    const exceptions = Array.isArray(row.exceptionRows) ? row.exceptionRows : [];
    if (!exceptions.length) {
      return "No drift exceptions";
    }

    return exceptions.slice(0, 4).map(function (exception) {
      return `${exception.label} (${exception.code})`;
    }).join("; ");
  }

  function renderBucketKeyLabel(row) {
    return `
      <strong>${escapeHtml(row.planningBucketLabel)}</strong>
      <span><code>${escapeHtml(row.planningBucketKey)}</code></span>
    `;
  }

  function renderCleanBucketRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-planning-bucket-summary-row data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.lifestylePolicyRowCount)}</td>
          <td>${escapeHtml(row.sliderEligibleRowCount)}</td>
          <td>${escapeHtml(row.ratioSetSummary)}</td>
          <td>${row.cleanBucketCandidate ? "Yes" : "No"}</td>
        </tr>
      `;
    }).join("");
  }

  function renderMixedBucketRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-planning-bucket-summary-row data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.lifestylePolicyRowCount)}</td>
          <td>${escapeHtml(row.sliderEligibleRowCount)}</td>
          <td>${escapeHtml(row.ratioSetSummary)}</td>
          <td>${escapeHtml(row.exceptionCount)}</td>
          <td>${escapeHtml(renderBucketExceptionSummary(row))}</td>
        </tr>
      `;
    }).join("");
  }

  function renderLockedBucketRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-planning-bucket-summary-row data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.lifestylePolicyRowCount)}</td>
          <td>${escapeHtml(row.treatmentReasonSummary)}</td>
          <td>${escapeHtml(row.ratioSetSummary)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderPlanningBucketSummaryTable(title, description, rows, columns, bodyHtml) {
    return `
      <section class="admin-tax-bracket-group" data-planning-bucket-summary-section="${escapeHtml(title)}">
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">${escapeHtml(title)}</span>
            <p class="panel-copy">${escapeHtml(description)}</p>
          </div>
        </div>
        <table class="admin-tax-bracket-table">
          <thead>
            <tr>
              ${columns.map(function (column) {
                return `<th>${escapeHtml(column)}</th>`;
              }).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length ? bodyHtml : `
              <tr class="admin-tax-bracket-row">
                <td colspan="${escapeHtml(columns.length)}">No buckets in this group.</td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderPlanningBucketSummary(summary) {
    const safeSummary = isPlainObject(summary) ? summary : {};
    const cleanRows = Array.isArray(safeSummary.cleanIncludedBuckets) ? safeSummary.cleanIncludedBuckets : [];
    const mixedRows = Array.isArray(safeSummary.mixedExceptionBuckets) ? safeSummary.mixedExceptionBuckets : [];
    const lockedRows = Array.isArray(safeSummary.lockedSourceOwnedBuckets) ? safeSummary.lockedSourceOwnedBuckets : [];

    if (safeSummary.available !== true) {
      return `
        <section class="admin-tax-bracket-group" data-household-expense-planning-bucket-summary>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Planning Bucket Summary</span>
              <h3>Unavailable</h3>
              <p class="panel-copy">Planning bucket policy summary helper is not loaded.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-tax-bracket-group" data-household-expense-planning-bucket-summary>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Planning Bucket Summary</span>
            <h3>Read-only Bucket Policy Summary</h3>
            <p class="panel-copy">Current type-level lifestyle policy grouped by planning bucket. Bucket-level editing is not enabled in this section.</p>
          </div>
        </div>
        <div class="admin-summary-grid" data-household-expense-planning-bucket-summary-counts>
          ${renderCountCard("Lifestyle policy rows", safeSummary.lifestylePolicyRowCount || 0)}
          ${renderCountCard("Slider rows", safeSummary.sliderEligibleRowCount || 0)}
          ${renderCountCard("Clean included buckets", cleanRows.length)}
          ${renderCountCard("Mixed buckets", mixedRows.length)}
          ${renderCountCard("Locked / source-owned buckets", lockedRows.length)}
        </div>
        ${renderPlanningBucketSummaryTable(
          "Clean Included Buckets",
          "Included buckets whose slider-eligible rows share one ratio set.",
          cleanRows,
          ["Bucket", "Rows", "Slider Rows", "Ratio Sets", "Clean"],
          renderCleanBucketRows(cleanRows)
        )}
        ${renderPlanningBucketSummaryTable(
          "Mixed Buckets / Row Exceptions",
          "Included buckets that still need row-level review before bucket-level controls.",
          mixedRows,
          ["Bucket", "Rows", "Slider Rows", "Ratio Sets", "Exceptions", "Exception Detail"],
          renderMixedBucketRows(mixedRows)
        )}
        ${renderPlanningBucketSummaryTable(
          "Locked Or Source-Owned Buckets",
          "Excluded, protected, source-owned, or no-policy buckets shown for admin context.",
          lockedRows,
          ["Bucket", "Rows", "Treatment Reason", "Policy Summary"],
          renderLockedBucketRows(lockedRows)
        )}
      </section>
    `;
  }

  function renderBoolean(value) {
    return value === true ? "Yes" : "No";
  }

  function renderLivingFloorBucketKeyLabel(row) {
    return `
      <strong>${escapeHtml(row.planningBucketLabel)}</strong>
      <span><code>${escapeHtml(row.planningBucketKey)}</code></span>
    `;
  }

  function renderMoneyFloorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-row data-living-floor-adjustment-class="${escapeHtml(row.adjustmentClass)}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderLivingFloorBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.minimumFloorMode)}</td>
          <td>${escapeHtml(row.benchmarkSource)}</td>
          <td>${escapeHtml(row.floorSource)}</td>
          <td>${escapeHtml(row.stateAdjustmentSource)}</td>
          <td>${escapeHtml(row.householdSizingMethod)}</td>
          <td>${renderBoolean(row.adminDollarInputsRequired)}</td>
          <td>${escapeHtml(row.sourceDataStatus)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderRatioAdjustedRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-row data-living-floor-adjustment-class="${escapeHtml(row.adjustmentClass)}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderLivingFloorBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.minimumFloorMode)}</td>
          <td>${renderBoolean(row.adminEditable)}</td>
          <td>${escapeHtml(row.benchmarkSource)}</td>
          <td>${escapeHtml(row.notes || "Ratio-only adjustment")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderExcludedAdjustmentRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-row data-living-floor-adjustment-class="${escapeHtml(row.adjustmentClass)}" data-planning-bucket-key="${escapeHtml(row.planningBucketKey)}">
          <td>${renderLivingFloorBucketKeyLabel(row)}</td>
          <td>${escapeHtml(row.minimumFloorMode)}</td>
          <td>${renderBoolean(row.benchmarkAvailable)}</td>
          <td>${escapeHtml(row.benchmarkSource)}</td>
          <td>${escapeHtml(row.householdSizingMethod)}</td>
          <td>${renderBoolean(row.adminEditable)}</td>
          <td>${escapeHtml(row.notes || "Excluded from adjustment")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderLivingFloorTable(title, description, rows, columns, bodyHtml) {
    return `
      <section class="admin-tax-bracket-group" data-living-floor-section="${escapeHtml(title)}">
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">${escapeHtml(title)}</span>
            <p class="panel-copy">${escapeHtml(description)}</p>
          </div>
        </div>
        <table class="admin-tax-bracket-table">
          <thead>
            <tr>
              ${columns.map(function (column) {
                return `<th>${escapeHtml(column)}</th>`;
              }).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.length ? bodyHtml : `
              <tr class="admin-tax-bracket-row">
                <td colspan="${escapeHtml(columns.length)}">No buckets in this group.</td>
              </tr>
            `}
          </tbody>
        </table>
      </section>
    `;
  }

  function formatBandRange(band) {
    const minAge = band.minAge == null ? "" : String(band.minAge);
    const maxAge = band.maxAge == null ? "+" : String(band.maxAge);
    return `${minAge}-${maxAge}`;
  }

  function renderFoodAtHomeBandRows(bands) {
    return bands.map(function (band) {
      return `
        <tr class="admin-tax-bracket-row" data-living-floor-food-band="${escapeHtml(band.bandKey)}">
          <td><code>${escapeHtml(band.bandKey)}</code></td>
          <td>${escapeHtml(formatBandRange(band))}</td>
          <td>${escapeHtml(band.sex || "any")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderFoodAtHomeSizingDetails(summary) {
    const bands = Array.isArray(summary.foodAtHomeBands) ? summary.foodAtHomeBands : [];
    const stateSourcePriority = Array.isArray(summary.stateSourcePriority) ? summary.stateSourcePriority : [];
    const sizingRule = isPlainObject(summary.householdSizingRule) ? summary.householdSizingRule : {};

    return `
      <section class="admin-tax-bracket-group" data-living-floor-supporting-metadata>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Food at Home Sizing Details</span>
            <p class="panel-copy">Metadata only. No dollar floors, state multipliers, or calculations are active.</p>
          </div>
        </div>
        <table class="admin-tax-bracket-table" data-living-floor-food-bands>
          <thead>
            <tr>
              <th>Band</th>
              <th>Age Range</th>
              <th>Sex</th>
            </tr>
          </thead>
          <tbody>
            ${renderFoodAtHomeBandRows(bands)}
          </tbody>
        </table>
        <div class="admin-summary-grid" data-living-floor-household-state-metadata>
          ${renderCountCard("Sizing rule", sizingRule.householdSizingRuleKey || "n/a")}
          ${renderCountCard("Deceased insured default", sizingRule.deceasedInsuredCountDefault == null ? "n/a" : sizingRule.deceasedInsuredCountDefault)}
          ${renderCountCard("Includes current dependents", renderBoolean(sizingRule.includeCurrentDependents))}
          ${renderCountCard("Projected dependents", sizingRule.includeProjectedFutureDependents === false ? "Excluded" : "Review")}
          ${renderCountCard("Minimum household size", sizingRule.survivingHouseholdSizeMinimum == null ? "n/a" : sizingRule.survivingHouseholdSizeMinimum)}
          ${renderCountCard("State priority", stateSourcePriority.join(" -> ") || "n/a")}
        </div>
      </section>
    `;
  }

  function renderLivingFloorMetadataSummary(summary) {
    const safeSummary = isPlainObject(summary) ? summary : {};
    const moneyFloorRows = Array.isArray(safeSummary.moneyFloorAdjustedBuckets) ? safeSummary.moneyFloorAdjustedBuckets : [];
    const ratioRows = Array.isArray(safeSummary.ratioAdjustedBuckets) ? safeSummary.ratioAdjustedBuckets : [];
    const excludedRows = Array.isArray(safeSummary.excludedFromAdjustmentBuckets) ? safeSummary.excludedFromAdjustmentBuckets : [];

    if (safeSummary.available !== true) {
      return `
        <section class="admin-tax-bracket-group" data-household-expense-living-floor-metadata>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Living Floor Metadata</span>
              <h3>Unavailable</h3>
              <p class="panel-copy">Household expense living-floor metadata helper is not loaded.</p>
            </div>
          </div>
        </section>
      `;
    }

    return `
      <section class="admin-tax-bracket-group" data-household-expense-living-floor-metadata>
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Living Floor Metadata</span>
            <h3>Expense Floor Model</h3>
            <p class="panel-copy">Read-only bucket classification for future dollar floors and ratio-only adjustment. No floor calculations or editable dollar inputs are active.</p>
          </div>
        </div>
        <div class="admin-summary-grid" data-living-floor-class-counts>
          ${renderCountCard("Money-floor adjusted", moneyFloorRows.length)}
          ${renderCountCard("Ratio-adjusted", ratioRows.length)}
          ${renderCountCard("Excluded from adjustment", excludedRows.length)}
        </div>
        ${renderLivingFloorTable(
          "Money-Floor Adjusted",
          "Buckets intended to use one estimated dollar floor after bucket-level aggregation.",
          moneyFloorRows,
          ["Bucket", "Floor Mode", "Benchmark", "Floor Source", "State Source", "Sizing", "Dollar Inputs", "Source Data"],
          renderMoneyFloorRows(moneyFloorRows)
        )}
        ${renderLivingFloorTable(
          "Ratio-Adjusted",
          "Buckets that remain ratio-only, including zero-floor discretionary categories.",
          ratioRows,
          ["Bucket", "Floor Mode", "Admin Editable", "Benchmark", "Notes"],
          renderRatioAdjustedRows(ratioRows)
        )}
        ${renderLivingFloorTable(
          "Excluded From Adjustment",
          "Protected, source-owned, contractual, or unknown buckets excluded from adjustment.",
          excludedRows,
          ["Bucket", "Floor Mode", "Benchmark Available", "Benchmark", "Sizing", "Admin Editable", "Notes"],
          renderExcludedAdjustmentRows(excludedRows)
        )}
        ${renderFoodAtHomeSizingDetails(safeSummary)}
      </section>
    `;
  }

  function renderSavedFoodAtHomeBandRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-saved-living-floor-food-band="${escapeHtml(row.bandKey)}">
          <td><code>${escapeHtml(row.bandKey)}</code></td>
          <td>${escapeHtml(row.displayValue)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderSavedHouseholdSizeFactorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-saved-living-floor-household-size-factor="${escapeHtml(row.factorKey)}">
          <td><code>${escapeHtml(row.factorKey)}</code></td>
          <td>${escapeHtml(row.displayValue)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderSavedStateMultiplierRows(rows) {
    if (!rows.length) {
      return `
        <tr class="admin-tax-bracket-row">
          <td colspan="5">No saved state multiplier rows.</td>
        </tr>
      `;
    }

    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-saved-living-floor-state-multiplier="${escapeHtml(row.stateKey)}">
          <td><code>${escapeHtml(row.stateKey)}</code></td>
          <td>${escapeHtml(row.multiplierDisplay)}</td>
          <td>${escapeHtml(row.source)}</td>
          <td>${escapeHtml(row.sourcePeriod)}</td>
          <td>${escapeHtml(row.notes)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderSavedBucketStateMultiplierRows(rows) {
    if (!rows.length) {
      return `
        <tr class="admin-tax-bracket-row">
          <td colspan="3">No saved bucket-specific state multiplier groups.</td>
        </tr>
      `;
    }

    return rows.map(function (row) {
      const stateKeys = row.stateRows.map(function (stateRow) {
        return stateRow.stateKey;
      }).join(", ") || "Not set";
      return `
        <tr class="admin-tax-bracket-row" data-saved-living-floor-bucket-state-multiplier="${escapeHtml(row.planningBucketKey)}">
          <td><code>${escapeHtml(row.planningBucketKey)}</code></td>
          <td>${escapeHtml(row.stateRowCount)}</td>
          <td>${escapeHtml(stateKeys)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderSavedModel90DefaultBucketFloorRows(rows) {
    return rows.map(function (row) {
      return `
        <tr class="admin-tax-bracket-row" data-saved-living-floor-model90-default-bucket="${escapeHtml(row.planningBucketKey)}">
          <td>
            <strong>${escapeHtml(row.planningBucketLabel)}</strong>
            <span><code>${escapeHtml(row.planningBucketKey)}</code></span>
          </td>
          <td>${escapeHtml(row.monthlyBaseAmountDisplay)}</td>
          <td>${escapeHtml(row.perMemberField)}</td>
          <td>${escapeHtml(row.perMemberAmountDisplay)}</td>
          <td>${renderBoolean(row.stateAdjustmentEnabled)}</td>
          <td>${escapeHtml(row.sourcePeriod)}</td>
          <td>${escapeHtml(row.notes)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderSavedLivingFloorAssumptions(summary) {
    const safeSummary = isPlainObject(summary) ? summary : buildSavedLivingFloorAssumptionsDisplayModel();
    const foodAtHome = isPlainObject(safeSummary.foodAtHome) ? safeSummary.foodAtHome : {};
    const stateMultipliers = isPlainObject(safeSummary.stateCostAdjustmentMultipliers)
      ? safeSummary.stateCostAdjustmentMultipliers
      : {};
    const counts = isPlainObject(safeSummary.counts) ? safeSummary.counts : {};
    const status = isPlainObject(safeSummary.status) ? safeSummary.status : { label: "Not configured", code: "notConfigured" };
    const bandRows = Array.isArray(foodAtHome.bandRows) ? foodAtHome.bandRows : [];
    const factorRows = Array.isArray(foodAtHome.householdSizeAdjustmentFactorRows)
      ? foodAtHome.householdSizeAdjustmentFactorRows
      : [];
    const globalStateRows = Array.isArray(stateMultipliers.globalStateRows) ? stateMultipliers.globalStateRows : [];
    const bucketStateRows = Array.isArray(stateMultipliers.bucketStateRows) ? stateMultipliers.bucketStateRows : [];
    const model90Rows = Array.isArray(safeSummary.model90DefaultBucketFloors) ? safeSummary.model90DefaultBucketFloors : [];

    return `
      <section class="admin-tax-bracket-group" data-household-expense-saved-living-floor-assumptions data-saved-living-floor-status="${escapeHtml(status.code || "notConfigured")}">
        <div class="admin-tax-bracket-toolbar">
          <div>
            <span class="section-label">Saved Living Floor Assumptions</span>
            <h3>${escapeHtml(status.label || "Not configured")}</h3>
            <p class="panel-copy">Saved account-policy assumption values for future household expense floor controls. This section is read-only and does not calculate floors.</p>
          </div>
        </div>
        <div class="admin-summary-grid" data-saved-living-floor-counts>
          ${renderCountCard("Food bands set", `${counts.configuredFoodAtHomeBands || 0}/${counts.requiredFoodAtHomeBands || FOOD_AT_HOME_BAND_KEYS.length}`)}
          ${renderCountCard("Household factors set", `${counts.configuredHouseholdSizeFactors || 0}/${counts.requiredHouseholdSizeFactors || HOUSEHOLD_SIZE_ADJUSTMENT_FACTOR_KEYS.length}`)}
          ${renderCountCard("State multiplier rows", counts.globalStateMultiplierRows || 0)}
          ${renderCountCard("Bucket state groups", counts.bucketStateMultiplierGroups || 0)}
          ${renderCountCard("MODEL90 bucket shells", counts.model90DefaultBucketFloors || 0)}
        </div>
        <section class="admin-tax-bracket-group" data-saved-living-floor-food-at-home>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">Food at Home</span>
              <p class="panel-copy">Source: ${escapeHtml(foodAtHome.source || "Not set")} · Source period: ${escapeHtml(foodAtHome.sourcePeriod || "Not set")}</p>
            </div>
          </div>
          <table class="admin-tax-bracket-table" data-saved-living-floor-food-bands>
            <thead>
              <tr>
                <th>Band</th>
                <th>Monthly Amount</th>
              </tr>
            </thead>
            <tbody>
              ${renderSavedFoodAtHomeBandRows(bandRows)}
            </tbody>
          </table>
          <table class="admin-tax-bracket-table" data-saved-living-floor-household-size-factors>
            <thead>
              <tr>
                <th>Household Size</th>
                <th>Adjustment Factor</th>
              </tr>
            </thead>
            <tbody>
              ${renderSavedHouseholdSizeFactorRows(factorRows)}
            </tbody>
          </table>
        </section>
        <section class="admin-tax-bracket-group" data-saved-living-floor-state-multipliers>
          <div class="admin-tax-bracket-toolbar">
            <div>
              <span class="section-label">State Cost Adjustment Multipliers</span>
              <p class="panel-copy">Applies to: ${escapeHtml(stateMultipliers.appliesToAdjustmentClass || "Not set")} · Default multiplier: ${escapeHtml(stateMultipliers.defaultMultiplier || "Not set")}</p>
            </div>
          </div>
          <table class="admin-tax-bracket-table" data-saved-living-floor-global-state-multipliers>
            <thead>
              <tr>
                <th>State</th>
                <th>Multiplier</th>
                <th>Source</th>
                <th>Source Period</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${renderSavedStateMultiplierRows(globalStateRows)}
            </tbody>
          </table>
          <table class="admin-tax-bracket-table" data-saved-living-floor-bucket-state-multipliers>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>State Rows</th>
                <th>States</th>
              </tr>
            </thead>
            <tbody>
              ${renderSavedBucketStateMultiplierRows(bucketStateRows)}
            </tbody>
          </table>
        </section>
        <section class="admin-tax-bracket-group" data-saved-living-floor-model90-defaults>
          <div class="admin-tax-bracket-toolbar">
            <span class="section-label">MODEL90 Default Bucket Floors</span>
          </div>
          <table class="admin-tax-bracket-table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Base Amount</th>
                <th>Member Field</th>
                <th>Member Amount</th>
                <th>State Adj.</th>
                <th>Source Period</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${renderSavedModel90DefaultBucketFloorRows(model90Rows)}
            </tbody>
          </table>
        </section>
      </section>
    `;
  }

  function renderHouseholdExpensePolicyDisplay(model) {
    const safeModel = isPlainObject(model) ? model : buildHouseholdExpensePolicyDisplayModel();
    const counts = isPlainObject(safeModel.counts) ? safeModel.counts : {};
    const status = isPlainObject(safeModel.status) ? safeModel.status : {};
    const protectedRows = Array.isArray(safeModel.protectedCategories) ? safeModel.protectedCategories : [];

    return `
      <div class="admin-household-expense-policy-readonly" data-household-expense-account-policy-readonly data-policy-status="${escapeHtml(status.code || "unknown")}">
        <details class="admin-tax-bracket-group" data-household-expense-policy-diagnostics>
          <summary class="admin-tax-bracket-toolbar" data-household-expense-policy-diagnostics-summary>
            <span class="section-label">Advanced / Diagnostics</span>
            <strong>Policy diagnostics and read-only metadata</strong>
            <span>Policy source, bucket summaries, living-floor metadata, saved assumptions, and protected categories remain available here.</span>
          </summary>
          <div data-household-expense-policy-diagnostics-body>
            <div class="admin-tax-bracket-group" data-household-expense-policy-source-summary>
              <div class="admin-tax-bracket-toolbar">
                <div>
                  <span class="section-label">Policy Source</span>
                  <h3>${escapeHtml(status.label || "Policy unavailable")}</h3>
                  <p class="panel-copy">${escapeHtml(status.message || "Household expense policy status is unavailable.")}</p>
                  <p class="panel-copy">Account scope: ${escapeHtml(safeModel.accountId || "Not available")} (${escapeHtml(safeModel.accountIdSource || "unknown")})</p>
                </div>
              </div>
              <div class="admin-summary-grid" data-household-expense-policy-counts>
                ${renderCountCard("Lifestyle range rows", counts.lifestyleRangePolicyRows || 0)}
                ${renderCountCard("Compression policy rows", counts.compressionPolicyRows || 0)}
                ${renderCountCard("Compression threshold rows", counts.compressionThresholdRows || 0)}
                ${renderCountCard("Lifestyle overrides", counts.lifestyleRangeOverrides || 0)}
                ${renderCountCard("Compression overrides", counts.compressionPolicyOverrides || 0)}
                ${renderCountCard("Threshold overrides", counts.compressionThresholdOverrides || 0)}
                ${renderCountCard("Warnings", counts.warnings || 0)}
                ${renderCountCard("Data gaps", counts.dataGaps || 0)}
              </div>
            </div>
            ${renderPlanningBucketSummary(safeModel.planningBucketSummary)}
            ${renderLivingFloorMetadataSummary(safeModel.livingFloorMetadata)}
            ${renderSavedLivingFloorAssumptions(safeModel.savedLivingFloorAssumptions)}
            <div class="admin-tax-bracket-group" data-household-expense-policy-protected-summary>
              <div class="admin-tax-bracket-toolbar">
                <span class="section-label">Protected Categories</span>
              </div>
              <ul class="admin-tax-bracket-list">
                ${protectedRows.map(function (row) {
                  return `<li><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.status)}</span></li>`;
                }).join("")}
              </ul>
            </div>
          </div>
        </details>
      </div>
    `;
  }

  function initializeHouseholdExpenseAccountPolicyAdminDisplay() {
    const host = global.document?.querySelector?.(POLICY_DISPLAY_HOST_SELECTOR);
    if (!host) {
      return null;
    }

    const model = buildHouseholdExpensePolicyDisplayModel();
    host.innerHTML = renderHouseholdExpensePolicyDisplay(model);
    return model;
  }

  accountSettings.householdExpenseAccountPolicyAdminDisplay = Object.freeze({
    TEMPORARY_LOCAL_HOUSEHOLD_EXPENSE_POLICY_ACCOUNT_ID,
    PROTECTED_CATEGORY_SUMMARY,
    buildPlanningBucketSummaryDisplayModel,
    buildLivingFloorMetadataDisplayModel,
    buildSavedLivingFloorAssumptionsDisplayModel,
    buildHouseholdExpensePolicyDisplayModel,
    renderSavedLivingFloorAssumptions,
    renderHouseholdExpensePolicyDisplay,
    initializeHouseholdExpenseAccountPolicyAdminDisplay
  });

  global.document?.addEventListener?.("DOMContentLoaded", initializeHouseholdExpenseAccountPolicyAdminDisplay);
})(typeof globalThis !== "undefined" ? globalThis : this);
