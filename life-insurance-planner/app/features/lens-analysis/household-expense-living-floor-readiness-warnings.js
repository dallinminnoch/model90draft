(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: inactive living-floor readiness notice builder.
  // Non-goals: no floor calculation, profile reads, DOM access,
  // persistence, Analysis Setup rendering, or runtime graph consumption.

  const READINESS_WARNING_BUILDER_VERSION = 1;
  const ACTIVE_RUNTIME_CONSUMER = false;

  const NOTICE_SEVERITY_VALUES = Object.freeze([
    "info",
    "warning",
    "blocking"
  ]);

  const NOTICE_CODE_VALUES = Object.freeze([
    "foodAtHomeBandValuesMissing",
    "foodAtHomeHouseholdSizeFactorsMissing",
    "missingAgeFallbackUsed",
    "missingSexFallbackUsed",
    "noSurvivingAdultDetected",
    "moneyFloorBucketIncomplete",
    "livingFloorAssumptionsIncomplete",
    "floorCalculationUnavailable",
    "ratioFallbackWouldApply",
    "livingFloorAssumptionsReady"
  ]);

  const MONEY_FLOOR_BUCKET_KEYS = Object.freeze([
    "foodAtHomeConsumables",
    "householdConsumables",
    "communicationsConnectivity",
    "transportationBasics"
  ]);

  const EXCLUDED_OR_RATIO_BUCKET_KEYS = Object.freeze([
    "housingCore",
    "basicUtilities",
    "vehicleOwnershipMaintenance",
    "insurancePremiums",
    "healthcareCare",
    "childcareDependentSupport",
    "educationEnrichment",
    "finalExpenses",
    "debtObligations",
    "taxesLegalAdministrative",
    "givingCommunity",
    "businessSelfEmployment",
    "financialFeesTransactionCosts",
    "periodicSinkingFundOneTime",
    "customUnknown",
    "petsCoreCare",
    "diningTakeout",
    "subscriptionsMemberships",
    "entertainmentRecreation",
    "travelVacations",
    "petsDiscretionary",
    "savingsGoalContributions",
    "personalLivingClothing",
    "householdServices"
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

  const HOUSEHOLD_SIZE_FACTOR_KEYS = Object.freeze([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6Plus"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce(function (clone, key) {
        const clonedValue = clonePlainValue(value[key]);
        if (clonedValue !== undefined) {
          clone[key] = clonedValue;
        }
        return clone;
      }, {});
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    return value === undefined ? null : value;
  }

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value).replace(/[$,%\s,]/g, "").trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isNonnegativeNumberLike(value) {
    const parsed = toOptionalNumber(value);
    return parsed !== null && parsed >= 0;
  }

  function isPositiveNumberLike(value) {
    const parsed = toOptionalNumber(value);
    return parsed !== null && parsed > 0;
  }

  function uniqueSorted(values) {
    return values.reduce(function (set, value) {
      const normalized = normalizeKey(value);
      if (normalized) {
        set[normalized] = true;
      }
      return set;
    }, {});
  }

  function sortedKeysFromSet(set) {
    return Object.keys(set).sort();
  }

  function getMoneyFloorBucketKeys() {
    const metadataApi = lensAnalysis.householdExpenseLivingFloorMetadata || {};
    if (typeof metadataApi.getHouseholdExpenseLivingFloorMetadata === "function") {
      const keys = metadataApi.getHouseholdExpenseLivingFloorMetadata()
        .filter(function (row) {
          return row && row.adjustmentClass === "moneyFloorAdjusted";
        })
        .map(function (row) {
          return normalizeKey(row.planningBucketKey);
        })
        .filter(Boolean)
        .sort();

      if (keys.length) {
        return keys;
      }
    }

    return MONEY_FLOOR_BUCKET_KEYS.slice().sort();
  }

  function getExcludedOrRatioBucketSet() {
    return EXCLUDED_OR_RATIO_BUCKET_KEYS.reduce(function (set, bucketKey) {
      set[bucketKey] = true;
      return set;
    }, {});
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function createNotice(code, severity, title, message, affectedBucketKeys, trace) {
    return {
      code,
      severity: NOTICE_SEVERITY_VALUES.includes(severity) ? severity : "info",
      title,
      message,
      affectedBucketKeys: sortedKeysFromSet(uniqueSorted(affectedBucketKeys || [])),
      trace: clonePlainValue(trace || {})
    };
  }

  function addNotice(state, code, severity, title, message, affectedBucketKeys, trace, options) {
    const notice = createNotice(code, severity, title, message, affectedBucketKeys, trace);
    const dedupeKey = [
      notice.code,
      notice.severity,
      notice.affectedBucketKeys.join("|"),
      JSON.stringify(notice.trace)
    ].join("::");

    if (state.noticeDedupe[dedupeKey]) {
      return;
    }

    state.noticeDedupe[dedupeKey] = true;
    state.notices.push(notice);

    if (notice.severity === "warning" || notice.severity === "blocking") {
      state.warnings.push(createIssue(notice.code, notice.message, {
        affectedBucketKeys: notice.affectedBucketKeys,
        trace: notice.trace
      }));
    }

    if (options && options.dataGap) {
      state.dataGaps.push(createIssue(notice.code, notice.message, {
        affectedBucketKeys: notice.affectedBucketKeys,
        trace: notice.trace
      }));
    }
  }

  function getFoodAtHomeAssumptions(livingFloorAssumptions) {
    const foodAtHome = isPlainObject(livingFloorAssumptions.foodAtHome)
      ? livingFloorAssumptions.foodAtHome
      : {};
    return {
      monthlyAmountsByBand: isPlainObject(foodAtHome.monthlyAmountsByBand)
        ? foodAtHome.monthlyAmountsByBand
        : {},
      householdSizeAdjustmentFactors: isPlainObject(foodAtHome.householdSizeAdjustmentFactors)
        ? foodAtHome.householdSizeAdjustmentFactors
        : {}
    };
  }

  function getMissingFoodBandKeys(livingFloorAssumptions) {
    const foodAtHome = getFoodAtHomeAssumptions(livingFloorAssumptions);
    return FOOD_AT_HOME_BAND_KEYS.filter(function (bandKey) {
      return !isNonnegativeNumberLike(foodAtHome.monthlyAmountsByBand[bandKey]);
    });
  }

  function getMissingHouseholdSizeFactorKeys(livingFloorAssumptions) {
    const foodAtHome = getFoodAtHomeAssumptions(livingFloorAssumptions);
    return HOUSEHOLD_SIZE_FACTOR_KEYS.filter(function (factorKey) {
      return !isPositiveNumberLike(foodAtHome.householdSizeAdjustmentFactors[factorKey]);
    });
  }

  function getCalculationBuckets(livingFloorCalculationResult) {
    return isPlainObject(livingFloorCalculationResult.buckets)
      ? livingFloorCalculationResult.buckets
      : {};
  }

  function getBucketResult(livingFloorCalculationResult, bucketKey) {
    const buckets = getCalculationBuckets(livingFloorCalculationResult);
    return isPlainObject(buckets[bucketKey]) ? buckets[bucketKey] : null;
  }

  function getCalculatedMoneyBucketKeys(livingFloorCalculationResult, moneyBucketKeys) {
    const buckets = getCalculationBuckets(livingFloorCalculationResult);
    const calculatedKeys = Object.keys(buckets).filter(function (bucketKey) {
      return moneyBucketKeys.includes(bucketKey);
    });
    return calculatedKeys.length ? calculatedKeys.sort() : moneyBucketKeys.slice();
  }

  function getIncompleteMoneyBucketKeys(livingFloorCalculationResult, moneyBucketKeys) {
    return getCalculatedMoneyBucketKeys(livingFloorCalculationResult, moneyBucketKeys).filter(function (bucketKey) {
      const bucket = getBucketResult(livingFloorCalculationResult, bucketKey);
      return !bucket || !Number.isFinite(bucket.floorAmountMonthly);
    });
  }

  function getFloorUnavailableBucketKeys(livingFloorCalculationResult, moneyBucketKeys) {
    return getCalculatedMoneyBucketKeys(livingFloorCalculationResult, moneyBucketKeys).filter(function (bucketKey) {
      const bucket = getBucketResult(livingFloorCalculationResult, bucketKey);
      return !bucket || (Array.isArray(bucket.dataGaps) && bucket.dataGaps.length > 0);
    });
  }

  function hasInputAssumptionGaps(livingFloorAssumptions) {
    if (!isPlainObject(livingFloorAssumptions)) {
      return true;
    }

    if (getMissingFoodBandKeys(livingFloorAssumptions).length) {
      return true;
    }

    if (getMissingHouseholdSizeFactorKeys(livingFloorAssumptions).length) {
      return true;
    }

    const bucketFloors = isPlainObject(livingFloorAssumptions.model90DefaultBucketFloors)
      ? livingFloorAssumptions.model90DefaultBucketFloors
      : {};

    return [
      ["householdConsumables", "monthlyBaseAmount", "monthlyPerMemberAmount"],
      ["communicationsConnectivity", "monthlyBaseAmount", "monthlyPerMemberAmount"],
      ["transportationBasics", "monthlyBaseAmount", "monthlyPerAdultDriverAmount"]
    ].some(function (bucketFields) {
      const bucketKey = bucketFields[0];
      const row = isPlainObject(bucketFloors[bucketKey]) ? bucketFloors[bucketKey] : {};
      return bucketFields.slice(1).some(function (field) {
        return !isNonnegativeNumberLike(row[field]);
      });
    });
  }

  function addFoodAssumptionNotices(state, livingFloorAssumptions) {
    const missingBandKeys = getMissingFoodBandKeys(livingFloorAssumptions);
    if (missingBandKeys.length) {
      addNotice(
        state,
        "foodAtHomeBandValuesMissing",
        "warning",
        "Food at Home dollar values are incomplete",
        "Food at Home needs monthly dollar values for all USDA-style age and sex bands before its estimated floor can be trusted.",
        ["foodAtHomeConsumables"],
        { missingBandKeys },
        { dataGap: true }
      );
    }

    const missingFactorKeys = getMissingHouseholdSizeFactorKeys(livingFloorAssumptions);
    if (missingFactorKeys.length) {
      addNotice(
        state,
        "foodAtHomeHouseholdSizeFactorsMissing",
        "warning",
        "Food household-size factors are incomplete",
        "Food at Home needs household-size adjustment factors before the estimated floor can scale reliably by remaining household size.",
        ["foodAtHomeConsumables"],
        { missingHouseholdSizeFactorKeys: missingFactorKeys },
        { dataGap: true }
      );
    }
  }

  function addHouseholdContextNotices(state, householdContext, moneyBucketKeys) {
    if (householdContext.missingAgeFallbackUsed) {
      addNotice(
        state,
        "missingAgeFallbackUsed",
        "warning",
        "Household age fallback used",
        "One or more remaining household members used an age fallback band for Food at Home floor sizing.",
        ["foodAtHomeConsumables"],
        {
          missingAgeFallbackUsed: true,
          householdMemberBandCounts: householdContext.householdMemberBandCounts || null
        },
        { dataGap: true }
      );
    }

    if (householdContext.missingSexFallbackUsed) {
      addNotice(
        state,
        "missingSexFallbackUsed",
        "warning",
        "Household sex fallback used",
        "One or more remaining household members used a sex/gender fallback band for Food at Home floor sizing.",
        ["foodAtHomeConsumables"],
        {
          missingSexFallbackUsed: true,
          householdMemberBandCounts: householdContext.householdMemberBandCounts || null
        },
        { dataGap: true }
      );
    }

    if (householdContext.noSurvivingAdultDetected) {
      addNotice(
        state,
        "noSurvivingAdultDetected",
        "warning",
        "No surviving adult detected",
        "The remaining-household resolver did not detect a surviving adult, so it used the adult-equivalent fallback for floor sizing.",
        moneyBucketKeys,
        {
          noSurvivingAdultDetected: true,
          adultEquivalentFallbackUsed: Boolean(householdContext.adultEquivalentFallbackUsed)
        },
        { dataGap: true }
      );
    }
  }

  function addCalculationNotices(state, livingFloorCalculationResult, moneyBucketKeys) {
    const incompleteBucketKeys = getIncompleteMoneyBucketKeys(livingFloorCalculationResult, moneyBucketKeys);
    if (incompleteBucketKeys.length) {
      addNotice(
        state,
        "moneyFloorBucketIncomplete",
        "warning",
        "Money-floor bucket assumptions are incomplete",
        "One or more money-floor buckets could not produce an estimated monthly dollar floor from the available assumptions.",
        incompleteBucketKeys,
        { incompleteBucketKeys },
        { dataGap: true }
      );
    }

    const unavailableBucketKeys = getFloorUnavailableBucketKeys(livingFloorCalculationResult, moneyBucketKeys);
    if (unavailableBucketKeys.length) {
      addNotice(
        state,
        "floorCalculationUnavailable",
        "warning",
        "Estimated floor calculation unavailable",
        "The inactive calculator reported data gaps for one or more money-floor buckets.",
        unavailableBucketKeys,
        { unavailableBucketKeys },
        { dataGap: true }
      );

      addNotice(
        state,
        "ratioFallbackWouldApply",
        "info",
        "Ratio fallback would apply",
        "If a dollar floor is unavailable later, the lifestyle ratio floor can still serve as the conservative floor for that bucket.",
        unavailableBucketKeys,
        { unavailableBucketKeys }
      );
    }
  }

  function addAssumptionCompletenessNotices(state, livingFloorAssumptions, livingFloorCalculationResult, moneyBucketKeys) {
    const incompleteBucketKeys = getIncompleteMoneyBucketKeys(livingFloorCalculationResult, moneyBucketKeys);
    if (hasInputAssumptionGaps(livingFloorAssumptions) || incompleteBucketKeys.length) {
      addNotice(
        state,
        "livingFloorAssumptionsIncomplete",
        "warning",
        "Living-floor assumptions are incomplete",
        "One or more admin-managed living-floor assumptions are missing, so future dollar floors are not fully ready.",
        incompleteBucketKeys.length ? incompleteBucketKeys : moneyBucketKeys,
        {
          incompleteBucketKeys,
          inputAssumptionGapsDetected: hasInputAssumptionGaps(livingFloorAssumptions)
        },
        { dataGap: true }
      );
      return;
    }

    addNotice(
      state,
      "livingFloorAssumptionsReady",
      "info",
      "Living-floor assumptions are ready",
      "All money-floor buckets produced estimated monthly dollar floors from the supplied inactive assumptions.",
      moneyBucketKeys,
      { calculatedBucketKeys: moneyBucketKeys }
    );
  }

  function addExcludedBucketGuardrail(state, livingFloorCalculationResult) {
    const excludedOrRatioBucketSet = getExcludedOrRatioBucketSet();
    const buckets = getCalculationBuckets(livingFloorCalculationResult);
    Object.keys(buckets).forEach(function (bucketKey) {
      if (!excludedOrRatioBucketSet[bucketKey]) {
        return;
      }

      state.warnings.push(createIssue(
        "unexpected-excluded-bucket-floor-result",
        "An excluded or ratio-adjusted bucket was present in the living-floor calculation result.",
        { planningBucketKey: bucketKey }
      ));
    });
  }

  function buildHouseholdExpenseLivingFloorReadinessWarnings(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const livingFloorAssumptions = isPlainObject(safeInput.livingFloorAssumptions)
      ? safeInput.livingFloorAssumptions
      : {};
    const householdContext = isPlainObject(safeInput.householdContext) ? safeInput.householdContext : {};
    const livingFloorCalculationResult = isPlainObject(safeInput.livingFloorCalculationResult)
      ? safeInput.livingFloorCalculationResult
      : {};
    const moneyBucketKeys = getMoneyFloorBucketKeys();
    const state = {
      notices: [],
      warnings: [],
      dataGaps: [],
      noticeDedupe: {}
    };

    addFoodAssumptionNotices(state, livingFloorAssumptions);
    addHouseholdContextNotices(state, householdContext, moneyBucketKeys);
    addCalculationNotices(state, livingFloorCalculationResult, moneyBucketKeys);
    addAssumptionCompletenessNotices(state, livingFloorAssumptions, livingFloorCalculationResult, moneyBucketKeys);
    addExcludedBucketGuardrail(state, livingFloorCalculationResult);

    return {
      notices: state.notices,
      warnings: state.warnings,
      dataGaps: state.dataGaps,
      metadata: {
        builderVersion: READINESS_WARNING_BUILDER_VERSION,
        activeRuntimeConsumer: ACTIVE_RUNTIME_CONSUMER,
        evaluatedBucketKeys: moneyBucketKeys
      }
    };
  }

  lensAnalysis.householdExpenseLivingFloorReadinessWarnings = Object.freeze({
    READINESS_WARNING_BUILDER_VERSION,
    NOTICE_SEVERITY_VALUES,
    NOTICE_CODE_VALUES,
    buildHouseholdExpenseLivingFloorReadinessWarnings
  });
})(window);
