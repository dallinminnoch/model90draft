(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: pure preview resolver for account-level graph adjustment policy.
  // Non-goals: no storage reads, DOM reads, runtime graph wiring, or dollar-floor calculations.

  const HOUSEHOLD_EXPENSE_GRAPH_ADJUSTMENT_POLICY_RESOLVER_VERSION = 1;

  const ADJUSTMENT_CLASS_VALUES = Object.freeze([
    "moneyFloorAdjusted",
    "ratioAdjusted",
    "excludedFromAdjustment"
  ]);

  const MINIMUM_FLOOR_MODE_VALUES = Object.freeze([
    "estimatedDollarFloor",
    "zeroFloor",
    "ratioFloorOnly",
    "notAdjusted"
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

  const HOUSEHOLD_SIZE_FACTOR_KEYS = Object.freeze(["1", "2", "3", "4", "5", "6Plus"]);

  const MODEL90_DEFAULT_BUCKET_FLOOR_FIELDS = Object.freeze({
    householdConsumables: Object.freeze(["monthlyBaseAmount", "monthlyPerMemberAmount"]),
    communicationsConnectivity: Object.freeze(["monthlyBaseAmount", "monthlyPerMemberAmount"]),
    transportationBasics: Object.freeze(["monthlyBaseAmount", "monthlyPerAdultDriverAmount"])
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (value && typeof value === "object") {
      return Object.keys(value).reduce(function (clone, key) {
        const nextValue = clonePlainValue(value[key]);
        if (nextValue !== undefined) {
          clone[key] = nextValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (value === undefined) {
      return undefined;
    }

    return value;
  }

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeText(value) {
    const text = normalizeKey(value);
    return text || null;
  }

  function normalizeAdjustmentClass(value) {
    const adjustmentClass = normalizeText(value);
    return ADJUSTMENT_CLASS_VALUES.includes(adjustmentClass) ? adjustmentClass : null;
  }

  function normalizeMinimumFloorMode(value) {
    const minimumFloorMode = normalizeText(value);
    return MINIMUM_FLOOR_MODE_VALUES.includes(minimumFloorMode) ? minimumFloorMode : null;
  }

  function asFiniteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function isConfiguredNumber(value) {
    const numericValue = asFiniteNumber(value);
    return numericValue !== null && numericValue >= 0;
  }

  function isConfiguredPositiveNumber(value) {
    const numericValue = asFiniteNumber(value);
    return numericValue !== null && numericValue > 0;
  }

  function addIssue(list, code, message, details) {
    list.push({
      code,
      message,
      details: clonePlainValue(details || {})
    });
  }

  function buildMapByKey(rows, keyField) {
    return (Array.isArray(rows) ? rows : []).reduce(function (map, row) {
      const key = normalizeKey(row && row[keyField]);
      if (key) {
        map[key] = row;
      }
      return map;
    }, {});
  }

  function getDefaultExpenseLibraryRows() {
    const library = lensAnalysis.expenseLibrary;
    return typeof library?.getExpenseLibraryEntries === "function"
      ? library.getExpenseLibraryEntries()
      : [];
  }

  function getDefaultLifestylePolicyRows() {
    const policy = lensAnalysis.householdExpenseLifestyleRangePolicy;
    return typeof policy?.listLifestyleRangePolicies === "function"
      ? policy.listLifestyleRangePolicies()
      : [];
  }

  function getDefaultLivingFloorMetadata() {
    const metadata = lensAnalysis.householdExpenseLivingFloorMetadata;
    return typeof metadata?.getHouseholdExpenseLivingFloorMetadata === "function"
      ? metadata.getHouseholdExpenseLivingFloorMetadata()
      : [];
  }

  function normalizeInputRows(rows, fallbackRows) {
    return Array.isArray(rows) ? rows.map(clonePlainValue) : fallbackRows.map(clonePlainValue);
  }

  function deriveMinimumFloorMode(adjustmentClass, sourceRow, requestedMinimumFloorMode) {
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

  function getDefaultAdjustmentContext(lifestyleRow, expenseEntry, livingFloorMetadata) {
    const adjustmentClass = normalizeAdjustmentClass(livingFloorMetadata?.adjustmentClass)
      || (expenseEntry?.lifestyleTreatmentIncluded === true ? "ratioAdjusted" : null)
      || (expenseEntry?.lifestyleTreatmentIncluded === false ? "excludedFromAdjustment" : null)
      || (lifestyleRow?.sliderEligible === true ? "ratioAdjusted" : "excludedFromAdjustment");
    const minimumFloorMode = deriveMinimumFloorMode(
      adjustmentClass,
      {},
      livingFloorMetadata?.minimumFloorMode
    );

    return {
      adjustmentClass,
      minimumFloorMode
    };
  }

  function normalizeGraphAdjustmentOverrides(rawOverrides, knownRowsByTypeKey, defaultContextByTypeKey, warnings) {
    if (rawOverrides == null) {
      return {};
    }

    if (!Array.isArray(rawOverrides)) {
      addIssue(
        warnings,
        "invalid-graph-adjustment-overrides",
        "Graph adjustment overrides were ignored because the namespace is not an array.",
        { sourcePath: "accountPolicy.graphAdjustmentOverrides" }
      );
      return {};
    }

    const resolvedByTypeKey = {};
    const seenTypeKeys = {};

    rawOverrides.forEach(function (override, index) {
      if (!isPlainObject(override)) {
        addIssue(
          warnings,
          "invalid-graph-adjustment-override-row",
          "A graph adjustment override row was ignored because it is not an object.",
          { index }
        );
        return;
      }

      const expenseTypeKey = normalizeKey(override.expenseTypeKey);
      if (!expenseTypeKey) {
        addIssue(
          warnings,
          "invalid-graph-adjustment-expense-type-key",
          "A graph adjustment override row was ignored because it has no expenseTypeKey.",
          { index }
        );
        return;
      }

      if (!knownRowsByTypeKey[expenseTypeKey]) {
        addIssue(
          warnings,
          "unknown-graph-adjustment-expense-type-key",
          "A graph adjustment override row was ignored because it does not match a seed lifestyle policy row.",
          { expenseTypeKey, index }
        );
        return;
      }

      if (knownRowsByTypeKey[expenseTypeKey].sliderEligible !== true) {
        addIssue(
          warnings,
          "locked-graph-adjustment-override",
          "A graph adjustment override row was ignored because the seed row is not graph adjustable.",
          { expenseTypeKey, index }
        );
        return;
      }

      const adjustmentClass = normalizeAdjustmentClass(override.adjustmentClass);
      if (!adjustmentClass) {
        addIssue(
          warnings,
          "invalid-graph-adjustment-class",
          "A graph adjustment override row was ignored because its adjustmentClass is invalid.",
          { expenseTypeKey, index, adjustmentClass: override.adjustmentClass || null }
        );
        return;
      }

      if (seenTypeKeys[expenseTypeKey]) {
        addIssue(
          warnings,
          "duplicate-graph-adjustment-override",
          "Duplicate graph adjustment overrides were resolved deterministically; the last valid row wins.",
          { expenseTypeKey }
        );
      }
      seenTypeKeys[expenseTypeKey] = true;

      const requestedMode = normalizeMinimumFloorMode(override.minimumFloorMode);
      if (override.minimumFloorMode != null && !requestedMode) {
        addIssue(
          warnings,
          "invalid-graph-adjustment-minimum-floor-mode",
          "A graph adjustment override minimumFloorMode was invalid; the mode was derived from the adjustment class.",
          { expenseTypeKey, minimumFloorMode: override.minimumFloorMode }
        );
      }

      const defaultContext = defaultContextByTypeKey[expenseTypeKey] || {};
      const minimumFloorMode = deriveMinimumFloorMode(
        adjustmentClass,
        {
          defaultMinimumFloorMode: defaultContext.minimumFloorMode,
          minimumFloorMode: defaultContext.minimumFloorMode
        },
        requestedMode
      );

      resolvedByTypeKey[expenseTypeKey] = {
        expenseTypeKey,
        adjustmentClass,
        minimumFloorMode,
        source: normalizeText(override.source) || "ADMIN_ENTERED",
        updatedAt: normalizeText(override.updatedAt)
      };
    });

    return resolvedByTypeKey;
  }

  function normalizeLifestyleRangeOverrides(rawOverrides, knownRowsByTypeKey, warnings) {
    if (rawOverrides == null) {
      return {};
    }

    if (!Array.isArray(rawOverrides)) {
      addIssue(
        warnings,
        "invalid-lifestyle-range-overrides",
        "Lifestyle range overrides were ignored because the namespace is not an array.",
        { sourcePath: "accountPolicy.lifestyleRangeOverrides" }
      );
      return {};
    }

    const resolvedByTypeKey = {};
    const seenTypeKeys = {};

    rawOverrides.forEach(function (override, index) {
      if (!isPlainObject(override)) {
        addIssue(warnings, "invalid-lifestyle-range-override-row", "A lifestyle range override row was ignored because it is not an object.", { index });
        return;
      }

      const expenseTypeKey = normalizeKey(override.expenseTypeKey);
      const defaultRow = knownRowsByTypeKey[expenseTypeKey];
      if (!expenseTypeKey || !defaultRow) {
        addIssue(
          warnings,
          "unknown-lifestyle-range-override-expense-type-key",
          "A lifestyle range override row was ignored because it does not match a seed lifestyle policy row.",
          { expenseTypeKey: expenseTypeKey || null, index }
        );
        return;
      }

      if (defaultRow.sliderEligible !== true) {
        addIssue(
          warnings,
          "locked-lifestyle-range-override",
          "A lifestyle range override row was ignored because the seed row is not graph adjustable.",
          { expenseTypeKey, index }
        );
        return;
      }

      const conservativeFloorRatio = Object.prototype.hasOwnProperty.call(override, "conservativeFloorRatio")
        ? asFiniteNumber(override.conservativeFloorRatio)
        : null;
      const elevatedCeilingRatio = Object.prototype.hasOwnProperty.call(override, "elevatedCeilingRatio")
        ? asFiniteNumber(override.elevatedCeilingRatio)
        : null;
      const hasConservativeFloorRatio = conservativeFloorRatio !== null && conservativeFloorRatio >= 0 && conservativeFloorRatio <= 1;
      const hasElevatedCeilingRatio = elevatedCeilingRatio !== null && elevatedCeilingRatio >= 1 && elevatedCeilingRatio <= 3;

      if (!hasConservativeFloorRatio && !hasElevatedCeilingRatio) {
        addIssue(
          warnings,
          "invalid-lifestyle-range-override-ratios",
          "A lifestyle range override row was ignored because it has no valid ratio values.",
          { expenseTypeKey, index }
        );
        return;
      }

      if (seenTypeKeys[expenseTypeKey]) {
        addIssue(
          warnings,
          "duplicate-lifestyle-range-override",
          "Duplicate lifestyle range overrides were resolved deterministically; the last valid row wins.",
          { expenseTypeKey }
        );
      }
      seenTypeKeys[expenseTypeKey] = true;

      resolvedByTypeKey[expenseTypeKey] = {
        expenseTypeKey,
        conservativeFloorRatio: hasConservativeFloorRatio ? conservativeFloorRatio : undefined,
        elevatedCeilingRatio: hasElevatedCeilingRatio ? elevatedCeilingRatio : undefined
      };
    });

    return resolvedByTypeKey;
  }

  function getFoodAtHomeFloorStatus(livingFloorAssumptions) {
    const foodAtHome = isPlainObject(livingFloorAssumptions?.foodAtHome)
      ? livingFloorAssumptions.foodAtHome
      : {};
    const monthlyAmountsByBand = isPlainObject(foodAtHome.monthlyAmountsByBand)
      ? foodAtHome.monthlyAmountsByBand
      : {};
    const householdSizeAdjustmentFactors = isPlainObject(foodAtHome.householdSizeAdjustmentFactors)
      ? foodAtHome.householdSizeAdjustmentFactors
      : {};
    const configuredBandCount = FOOD_AT_HOME_BAND_KEYS.filter(function (bandKey) {
      return isConfiguredNumber(monthlyAmountsByBand[bandKey]);
    }).length;
    const configuredFactorCount = HOUSEHOLD_SIZE_FACTOR_KEYS.filter(function (factorKey) {
      return isConfiguredPositiveNumber(householdSizeAdjustmentFactors[factorKey]);
    }).length;

    if (configuredBandCount === FOOD_AT_HOME_BAND_KEYS.length && configuredFactorCount === HOUSEHOLD_SIZE_FACTOR_KEYS.length) {
      return "configured";
    }

    if (configuredBandCount > 0 || configuredFactorCount > 0) {
      return "partiallyConfigured";
    }

    return "notConfigured";
  }

  function getModel90DefaultFloorStatus(livingFloorAssumptions, planningBucketKey) {
    const model90DefaultBucketFloors = isPlainObject(livingFloorAssumptions?.model90DefaultBucketFloors)
      ? livingFloorAssumptions.model90DefaultBucketFloors
      : {};
    const bucketAssumptions = isPlainObject(model90DefaultBucketFloors[planningBucketKey])
      ? model90DefaultBucketFloors[planningBucketKey]
      : {};
    const requiredFields = MODEL90_DEFAULT_BUCKET_FLOOR_FIELDS[planningBucketKey] || [];
    const configuredCount = requiredFields.filter(function (field) {
      return isConfiguredNumber(bucketAssumptions[field]);
    }).length;

    if (configuredCount === requiredFields.length && requiredFields.length > 0) {
      return "configured";
    }

    if (configuredCount > 0) {
      return "partiallyConfigured";
    }

    return "notConfigured";
  }

  function getFloorSourceContext(row) {
    if (row.adjustmentClass === "excludedFromAdjustment" || row.minimumFloorMode === "notAdjusted") {
      return {
        floorSourceLabel: "Not adjusted",
        floorSourceStatus: "notApplicable"
      };
    }

    if (row.planningBucketKey === "foodAtHomeConsumables" && row.minimumFloorMode === "estimatedDollarFloor") {
      return {
        floorSourceLabel: "Food at Home model / USDA Food Plan",
        floorSourceStatus: getFoodAtHomeFloorStatus(row.livingFloorAssumptions)
      };
    }

    if (Object.prototype.hasOwnProperty.call(MODEL90_DEFAULT_BUCKET_FLOOR_FIELDS, row.planningBucketKey)
      && row.minimumFloorMode === "estimatedDollarFloor") {
      return {
        floorSourceLabel: "MODEL90 default floor",
        floorSourceStatus: getModel90DefaultFloorStatus(row.livingFloorAssumptions, row.planningBucketKey)
      };
    }

    if (row.minimumFloorMode === "zeroFloor") {
      return {
        floorSourceLabel: row.planningBucketKey === "savingsGoalContributions"
          ? "Pauseable / $0 floor"
          : "$0 floor / no dollar source",
        floorSourceStatus: "notApplicable"
      };
    }

    if (row.minimumFloorMode === "ratioFloorOnly") {
      return {
        floorSourceLabel: "Ratio floor only / no dollar source",
        floorSourceStatus: "notApplicable"
      };
    }

    return {
      floorSourceLabel: "No dollar source",
      floorSourceStatus: "notApplicable"
    };
  }

  function resolveHouseholdExpenseGraphAdjustmentPolicy(input) {
    const options = isPlainObject(input) ? input : {};
    const includeOnlyGraphRows = options.includeOnlyGraphRows !== false;
    const warnings = [];
    const dataGaps = [];

    const expenseLibraryRows = normalizeInputRows(options.expenseLibraryRows, getDefaultExpenseLibraryRows());
    const lifestylePolicyRows = normalizeInputRows(options.lifestylePolicyRows, getDefaultLifestylePolicyRows());
    const livingFloorMetadataRows = normalizeInputRows(options.livingFloorMetadata, getDefaultLivingFloorMetadata());
    const accountPolicy = isPlainObject(options.accountPolicy) ? clonePlainValue(options.accountPolicy) : {};
    const livingFloorAssumptions = isPlainObject(accountPolicy.livingFloorAssumptions)
      ? accountPolicy.livingFloorAssumptions
      : {};

    if (!expenseLibraryRows.length) {
      addIssue(dataGaps, "missing-expense-library-rows", "Expense library rows were not provided.");
    }
    if (!lifestylePolicyRows.length) {
      addIssue(dataGaps, "missing-lifestyle-policy-rows", "Lifestyle policy rows were not provided.");
    }
    if (!livingFloorMetadataRows.length) {
      addIssue(dataGaps, "missing-living-floor-metadata", "Living-floor metadata rows were not provided.");
    }

    const expenseLibraryByTypeKey = buildMapByKey(expenseLibraryRows, "typeKey");
    const lifestylePolicyByTypeKey = buildMapByKey(lifestylePolicyRows, "expenseTypeKey");
    const livingFloorMetadataByBucket = buildMapByKey(livingFloorMetadataRows, "planningBucketKey");
    const defaultContextByTypeKey = {};

    lifestylePolicyRows.forEach(function (policyRow) {
      const expenseTypeKey = normalizeKey(policyRow?.expenseTypeKey);
      const expenseEntry = expenseLibraryByTypeKey[expenseTypeKey];
      const planningBucketKey = normalizeKey(expenseEntry?.planningBucketKey || policyRow?.planningBucketKey);
      const metadata = livingFloorMetadataByBucket[planningBucketKey];
      defaultContextByTypeKey[expenseTypeKey] = getDefaultAdjustmentContext(policyRow, expenseEntry, metadata);
    });

    const graphAdjustmentOverridesByTypeKey = normalizeGraphAdjustmentOverrides(
      accountPolicy.graphAdjustmentOverrides,
      lifestylePolicyByTypeKey,
      defaultContextByTypeKey,
      warnings
    );
    const lifestyleRangeOverridesByTypeKey = normalizeLifestyleRangeOverrides(
      accountPolicy.lifestyleRangeOverrides,
      lifestylePolicyByTypeKey,
      warnings
    );

    const rows = lifestylePolicyRows
      .filter(function (policyRow) {
        return includeOnlyGraphRows ? policyRow?.sliderEligible === true : true;
      })
      .map(function (policyRow) {
        const expenseTypeKey = normalizeKey(policyRow?.expenseTypeKey);
        const rowWarnings = [];
        const rowDataGaps = [];
        const expenseEntry = expenseLibraryByTypeKey[expenseTypeKey];
        const planningBucketKey = normalizeKey(expenseEntry?.planningBucketKey || policyRow?.planningBucketKey);
        const livingFloorMetadata = livingFloorMetadataByBucket[planningBucketKey];
        const defaultContext = defaultContextByTypeKey[expenseTypeKey] || getDefaultAdjustmentContext(policyRow, expenseEntry, livingFloorMetadata);
        const graphOverride = graphAdjustmentOverridesByTypeKey[expenseTypeKey];
        const lifestyleOverride = lifestyleRangeOverridesByTypeKey[expenseTypeKey];
        const adjustmentClass = graphOverride?.adjustmentClass || defaultContext.adjustmentClass;
        const minimumFloorMode = deriveMinimumFloorMode(
          adjustmentClass,
          {
            defaultMinimumFloorMode: defaultContext.minimumFloorMode,
            minimumFloorMode: defaultContext.minimumFloorMode
          },
          graphOverride?.minimumFloorMode || defaultContext.minimumFloorMode
        );
        const conservativeFloorRatio = Object.prototype.hasOwnProperty.call(lifestyleOverride || {}, "conservativeFloorRatio")
          ? lifestyleOverride.conservativeFloorRatio
          : policyRow.conservativeFloorRatio;
        const elevatedCeilingRatio = Object.prototype.hasOwnProperty.call(lifestyleOverride || {}, "elevatedCeilingRatio")
          ? lifestyleOverride.elevatedCeilingRatio
          : policyRow.elevatedCeilingRatio;

        if (!expenseEntry) {
          addIssue(rowDataGaps, "missing-expense-library-row", "The lifestyle policy row does not resolve to an expense library row.", { expenseTypeKey });
        }
        if (!planningBucketKey) {
          addIssue(rowDataGaps, "missing-planning-bucket-key", "The row does not resolve to a planning bucket.", { expenseTypeKey });
        }
        if (planningBucketKey && !livingFloorMetadata) {
          addIssue(rowDataGaps, "missing-living-floor-bucket-metadata", "The planning bucket has no living-floor metadata.", { expenseTypeKey, planningBucketKey });
        }

        rowDataGaps.forEach(function (gap) {
          dataGaps.push(gap);
        });

        const floorSourceContext = getFloorSourceContext({
          planningBucketKey,
          adjustmentClass,
          minimumFloorMode,
          livingFloorAssumptions
        });
        const seedSliderEligible = policyRow.sliderEligible === true;
        const graphAdjustable = seedSliderEligible && adjustmentClass !== "excludedFromAdjustment";

        return {
          expenseTypeKey,
          label: policyRow.displayName || expenseEntry?.label || expenseTypeKey,
          planningBucketKey: planningBucketKey || null,
          adjustmentClass,
          minimumFloorMode,
          conservativeFloorRatio,
          elevatedCeilingRatio,
          floorSourceStatus: floorSourceContext.floorSourceStatus,
          floorSourceLabel: floorSourceContext.floorSourceLabel,
          graphAdjustable,
          sourceTrace: {
            seedPolicySource: "householdExpenseLifestyleRangePolicy",
            planningBucketSource: expenseEntry ? "expenseLibrary" : "missing",
            adjustmentClassSource: graphOverride ? "graphAdjustmentOverrides" : "livingFloorMetadata",
            minimumFloorModeSource: graphOverride ? "graphAdjustmentOverrides" : "livingFloorMetadata",
            ratioSource: lifestyleOverride ? "lifestyleRangeOverrides" : "seedLifestylePolicy",
            floorSourceStatusSource: "livingFloorAssumptions"
          },
          warnings: rowWarnings,
          dataGaps: rowDataGaps
        };
      });

    const counts = {
      totalRows: rows.length,
      graphRows: rows.filter(function (row) {
        return lifestylePolicyByTypeKey[row.expenseTypeKey]?.sliderEligible === true;
      }).length,
      moneyFloorAdjusted: rows.filter(function (row) {
        return row.adjustmentClass === "moneyFloorAdjusted";
      }).length,
      ratioAdjusted: rows.filter(function (row) {
        return row.adjustmentClass === "ratioAdjusted";
      }).length,
      excludedFromAdjustment: rows.filter(function (row) {
        return row.adjustmentClass === "excludedFromAdjustment";
      }).length
    };

    return clonePlainValue({
      rows,
      counts,
      warnings,
      dataGaps,
      metadata: {
        resolverVersion: HOUSEHOLD_EXPENSE_GRAPH_ADJUSTMENT_POLICY_RESOLVER_VERSION,
        activeRuntimeConsumer: false,
        includeOnlyGraphRows,
        duplicateOverridePolicy: "lastValidWins"
      }
    });
  }

  lensAnalysis.householdExpenseGraphAdjustmentPolicyResolver = Object.freeze({
    HOUSEHOLD_EXPENSE_GRAPH_ADJUSTMENT_POLICY_RESOLVER_VERSION,
    ADJUSTMENT_CLASS_VALUES,
    MINIMUM_FLOOR_MODE_VALUES,
    resolveHouseholdExpenseGraphAdjustmentPolicy
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
