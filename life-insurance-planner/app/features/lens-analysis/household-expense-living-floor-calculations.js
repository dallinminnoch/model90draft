(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: inactive household expense living-floor calculation helper.
  // Non-goals: no scenario wiring, rendering, persistence, policy resolution,
  // normalization, or effective conservative floor calculation.

  const CALCULATION_VERSION = 1;
  const CALCULATED_AT_MODE = "inactive-helper";

  const MONEY_FLOOR_BUCKET_KEYS = Object.freeze([
    "foodAtHomeConsumables",
    "householdConsumables",
    "communicationsConnectivity",
    "transportationBasics"
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

  const MODEL90_DEFAULT_BUCKET_CONFIG = Object.freeze({
    householdConsumables: Object.freeze({
      planningBucketKey: "householdConsumables",
      perUnitField: "monthlyPerMemberAmount",
      sizingTraceField: "survivingHouseholdMembers"
    }),
    communicationsConnectivity: Object.freeze({
      planningBucketKey: "communicationsConnectivity",
      perUnitField: "monthlyPerMemberAmount",
      sizingTraceField: "survivingHouseholdMembers"
    }),
    transportationBasics: Object.freeze({
      planningBucketKey: "transportationBasics",
      perUnitField: "monthlyPerAdultDriverAmount",
      sizingTraceField: "adultDriverCount"
    })
  });

  const FALLBACK_MONEY_BUCKET_METADATA = Object.freeze({
    foodAtHomeConsumables: Object.freeze({
      planningBucketKey: "foodAtHomeConsumables",
      adjustmentClass: "moneyFloorAdjusted",
      floorSource: "USDA_FOOD_PLAN",
      householdSizingMethod: "usdaAgeSexBandWeighted"
    }),
    householdConsumables: Object.freeze({
      planningBucketKey: "householdConsumables",
      adjustmentClass: "moneyFloorAdjusted",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "householdBasePlusMember"
    }),
    communicationsConnectivity: Object.freeze({
      planningBucketKey: "communicationsConnectivity",
      adjustmentClass: "moneyFloorAdjusted",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "fixedHouseholdPlusMember"
    }),
    transportationBasics: Object.freeze({
      planningBucketKey: "transportationBasics",
      adjustmentClass: "moneyFloorAdjusted",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "adultDriverWeighted"
    })
  });

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

  function toNonnegativeNumber(value) {
    const parsed = toOptionalNumber(value);
    return parsed === null || parsed < 0 ? null : parsed;
  }

  function toPositiveNumber(value) {
    const parsed = toOptionalNumber(value);
    return parsed === null || parsed <= 0 ? null : parsed;
  }

  function roundMoney(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function createIssue(code, message, details) {
    const issue = { code, message };
    if (details !== undefined) {
      issue.details = clonePlainValue(details);
    }
    return issue;
  }

  function addIssue(bucketIssues, topLevelIssues, planningBucketKey, code, message, details) {
    const issue = createIssue(code, message, details);
    bucketIssues.push(issue);
    topLevelIssues.push(Object.assign({ planningBucketKey }, issue));
  }

  function getMetadataApi() {
    return lensAnalysis.householdExpenseLivingFloorMetadata || {};
  }

  function getMoneyBucketMetadataByKey() {
    const metadataApi = getMetadataApi();
    const rows = typeof metadataApi.getHouseholdExpenseLivingFloorMetadata === "function"
      ? metadataApi.getHouseholdExpenseLivingFloorMetadata()
      : MONEY_FLOOR_BUCKET_KEYS.map(function (bucketKey) {
          return FALLBACK_MONEY_BUCKET_METADATA[bucketKey];
        });

    return rows.reduce(function (map, row) {
      const key = normalizeKey(row && row.planningBucketKey);
      if (key && row.adjustmentClass === "moneyFloorAdjusted") {
        map[key] = Object.assign({}, FALLBACK_MONEY_BUCKET_METADATA[key] || {}, clonePlainValue(row));
      }
      return map;
    }, {});
  }

  function getTargetBucketKeys(input, warnings) {
    const metadataByKey = getMoneyBucketMetadataByKey();
    const moneyBucketSet = Object.keys(metadataByKey).length
      ? Object.keys(metadataByKey).reduce(function (set, bucketKey) {
          set[bucketKey] = true;
          return set;
        }, {})
      : MONEY_FLOOR_BUCKET_KEYS.reduce(function (set, bucketKey) {
          set[bucketKey] = true;
          return set;
        }, {});

    const requestedKeys = Array.isArray(input.planningBucketKeys)
      ? input.planningBucketKeys.map(normalizeKey).filter(Boolean)
      : MONEY_FLOOR_BUCKET_KEYS.slice();
    const seen = {};

    return requestedKeys.reduce(function (keys, bucketKey) {
      if (seen[bucketKey]) {
        return keys;
      }

      seen[bucketKey] = true;
      if (moneyBucketSet[bucketKey]) {
        keys.push(bucketKey);
      } else {
        warnings.push(createIssue(
          "bucket-not-money-floor-adjusted",
          "Planning bucket was not calculated because it is not money-floor adjusted.",
          { planningBucketKey: bucketKey }
        ));
      }
      return keys;
    }, []);
  }

  function getSurvivingHouseholdMembers(householdContext, warnings) {
    const count = toNonnegativeNumber(householdContext.survivingHouseholdMembers);
    if (count === null) {
      return null;
    }

    if (count < 1) {
      warnings.push(createIssue(
        "surviving-household-members-clamped",
        "Surviving household member count was below one and was clamped to one.",
        { received: count, used: 1 }
      ));
      return 1;
    }

    return count;
  }

  function getHouseholdSizeFactorKey(survivingHouseholdMembers) {
    if (!Number.isFinite(survivingHouseholdMembers)) {
      return "";
    }

    const householdSize = Math.max(1, Math.ceil(survivingHouseholdMembers));
    return householdSize >= 6 ? "6Plus" : String(householdSize);
  }

  function normalizeBandCounts(householdMemberBandCounts) {
    const source = isPlainObject(householdMemberBandCounts) ? householdMemberBandCounts : {};
    return FOOD_AT_HOME_BAND_KEYS.reduce(function (counts, bandKey) {
      const parsed = toNonnegativeNumber(source[bandKey]);
      counts[bandKey] = parsed === null ? 0 : parsed;
      return counts;
    }, {});
  }

  function createBucketResult(planningBucketKey, metadata, householdContext) {
    return {
      planningBucketKey,
      floorAmountMonthly: null,
      floorAmountAnnual: null,
      floorSource: metadata.floorSource || "NONE",
      householdSizingMethod: metadata.householdSizingMethod || "none",
      warnings: [],
      dataGaps: [],
      trace: {
        survivingHouseholdMembers: householdContext.survivingHouseholdMembers == null
          ? null
          : clonePlainValue(householdContext.survivingHouseholdMembers),
        householdMemberBandCounts: clonePlainValue(householdContext.householdMemberBandCounts || {}),
        noSurvivingAdultDetected: householdContext.noSurvivingAdultDetected === true,
        missingAgeFallbackUsed: householdContext.missingAgeFallbackUsed === true,
        missingSexFallbackUsed: householdContext.missingSexFallbackUsed === true
      }
    };
  }

  function finalizeBucketResult(result, floorAmountMonthly) {
    result.floorAmountMonthly = roundMoney(floorAmountMonthly);
    result.floorAmountAnnual = roundMoney(floorAmountMonthly * 12);
    result.trace.floorAmountMonthly = result.floorAmountMonthly;
    return result;
  }

  function calculateFoodAtHomeFloor(livingFloorAssumptions, householdContext, metadata, topWarnings, topDataGaps) {
    const foodAtHome = isPlainObject(livingFloorAssumptions.foodAtHome) ? livingFloorAssumptions.foodAtHome : {};
    const monthlyAmountsByBand = isPlainObject(foodAtHome.monthlyAmountsByBand) ? foodAtHome.monthlyAmountsByBand : {};
    const householdSizeAdjustmentFactors = isPlainObject(foodAtHome.householdSizeAdjustmentFactors)
      ? foodAtHome.householdSizeAdjustmentFactors
      : {};
    const localWarnings = [];
    const survivingHouseholdMembers = getSurvivingHouseholdMembers(householdContext, localWarnings);
    const result = createBucketResult("foodAtHomeConsumables", metadata, householdContext);
    result.warnings = localWarnings;
    localWarnings.forEach(function (warning) {
      topWarnings.push(Object.assign({ planningBucketKey: result.planningBucketKey }, warning));
    });

    const bandCounts = normalizeBandCounts(householdContext.householdMemberBandCounts);
    const activeBandKeys = FOOD_AT_HOME_BAND_KEYS.filter(function (bandKey) {
      return bandCounts[bandKey] > 0;
    });

    if (!activeBandKeys.length) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        result.planningBucketKey,
        "missing-food-household-band-counts",
        "Food at Home floor could not be calculated because no remaining household band counts were supplied.",
        { expectedBandKeys: FOOD_AT_HOME_BAND_KEYS }
      );
    }

    const subtotal = activeBandKeys.reduce(function (total, bandKey) {
      const amount = toNonnegativeNumber(monthlyAmountsByBand[bandKey]);
      if (amount === null) {
        addIssue(
          result.dataGaps,
          topDataGaps,
          result.planningBucketKey,
          "missing-food-band-amount",
          "Food at Home floor could not be calculated because a required band amount is missing.",
          { bandKey }
        );
        return total;
      }
      return total + amount * bandCounts[bandKey];
    }, 0);

    if (survivingHouseholdMembers === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        result.planningBucketKey,
        "missing-surviving-household-members",
        "Food at Home floor could not be calculated because surviving household size is missing."
      );
    }

    const householdSizeFactorKey = getHouseholdSizeFactorKey(survivingHouseholdMembers);
    const householdSizeFactor = householdSizeFactorKey
      ? toPositiveNumber(householdSizeAdjustmentFactors[householdSizeFactorKey])
      : null;
    if (householdSizeFactor === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        result.planningBucketKey,
        "missing-food-household-size-adjustment-factor",
        "Food at Home floor could not be calculated because the household-size adjustment factor is missing.",
        { factorKey: householdSizeFactorKey || null }
      );
    }

    result.trace.householdMemberBandCounts = bandCounts;
    result.trace.activeFoodBandKeys = activeBandKeys;
    result.trace.foodBandSubtotal = roundMoney(subtotal);
    result.trace.householdSizeAdjustmentFactorKey = householdSizeFactorKey || null;
    result.trace.householdSizeAdjustmentFactor = householdSizeFactor;

    if (result.dataGaps.length) {
      return result;
    }

    return finalizeBucketResult(result, subtotal * householdSizeFactor);
  }

  function getModel90DefaultBucketFloors(livingFloorAssumptions) {
    return isPlainObject(livingFloorAssumptions.model90DefaultBucketFloors)
      ? livingFloorAssumptions.model90DefaultBucketFloors
      : {};
  }

  function calculateBasePlusMemberFloor(planningBucketKey, livingFloorAssumptions, householdContext, metadata, topWarnings, topDataGaps) {
    const bucketRows = getModel90DefaultBucketFloors(livingFloorAssumptions);
    const config = MODEL90_DEFAULT_BUCKET_CONFIG[planningBucketKey];
    const row = isPlainObject(bucketRows[planningBucketKey]) ? bucketRows[planningBucketKey] : {};
    const result = createBucketResult(planningBucketKey, metadata, householdContext);
    const monthlyBaseAmount = toNonnegativeNumber(row.monthlyBaseAmount);
    const monthlyPerMemberAmount = toNonnegativeNumber(row[config.perUnitField]);
    const survivingHouseholdMembers = getSurvivingHouseholdMembers(householdContext, result.warnings);

    result.warnings.forEach(function (warning) {
      topWarnings.push(Object.assign({ planningBucketKey }, warning));
    });

    if (monthlyBaseAmount === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        planningBucketKey,
        "missing-model90-monthly-base-amount",
        "MODEL90 default bucket floor could not be calculated because monthlyBaseAmount is missing."
      );
    }

    if (monthlyPerMemberAmount === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        planningBucketKey,
        "missing-model90-per-member-amount",
        "MODEL90 default bucket floor could not be calculated because the per-member amount is missing.",
        { field: config.perUnitField }
      );
    }

    if (survivingHouseholdMembers === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        planningBucketKey,
        "missing-surviving-household-members",
        "MODEL90 default bucket floor could not be calculated because surviving household size is missing."
      );
    }

    result.trace.monthlyBaseAmount = monthlyBaseAmount;
    result.trace[config.perUnitField] = monthlyPerMemberAmount;

    if (result.dataGaps.length) {
      return result;
    }

    return finalizeBucketResult(
      result,
      monthlyBaseAmount + monthlyPerMemberAmount * survivingHouseholdMembers
    );
  }

  function getAdultDriverCount(householdContext, warnings) {
    const adultDriverCount = toNonnegativeNumber(householdContext.adultDriverCount);
    if (adultDriverCount !== null) {
      return {
        count: adultDriverCount,
        source: "adultDriverCount"
      };
    }

    const survivingAdultCount = toNonnegativeNumber(householdContext.survivingAdultCount);
    if (survivingAdultCount !== null) {
      warnings.push(createIssue(
        "adult-driver-count-fallback",
        "Transportation floor used survivingAdultCount because adultDriverCount was missing.",
        { source: "survivingAdultCount", used: survivingAdultCount }
      ));
      return {
        count: survivingAdultCount,
        source: "survivingAdultCount"
      };
    }

    const adultCount = toNonnegativeNumber(householdContext.adultCount);
    if (adultCount !== null) {
      warnings.push(createIssue(
        "adult-driver-count-fallback",
        "Transportation floor used adultCount because adultDriverCount was missing.",
        { source: "adultCount", used: adultCount }
      ));
      return {
        count: adultCount,
        source: "adultCount"
      };
    }

    warnings.push(createIssue(
      "adult-driver-count-fallback",
      "Transportation floor used one adult driver because adult driver and adult counts were missing.",
      { source: "fallbackOne", used: 1 }
    ));
    return {
      count: 1,
      source: "fallbackOne"
    };
  }

  function calculateTransportationBasicsFloor(livingFloorAssumptions, householdContext, metadata, topWarnings, topDataGaps) {
    const bucketRows = getModel90DefaultBucketFloors(livingFloorAssumptions);
    const row = isPlainObject(bucketRows.transportationBasics) ? bucketRows.transportationBasics : {};
    const result = createBucketResult("transportationBasics", metadata, householdContext);
    const monthlyBaseAmount = toNonnegativeNumber(row.monthlyBaseAmount);
    const monthlyPerAdultDriverAmount = toNonnegativeNumber(row.monthlyPerAdultDriverAmount);
    const adultDriver = getAdultDriverCount(householdContext, result.warnings);

    result.warnings.forEach(function (warning) {
      topWarnings.push(Object.assign({ planningBucketKey: result.planningBucketKey }, warning));
    });

    if (monthlyBaseAmount === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        result.planningBucketKey,
        "missing-model90-monthly-base-amount",
        "MODEL90 default bucket floor could not be calculated because monthlyBaseAmount is missing."
      );
    }

    if (monthlyPerAdultDriverAmount === null) {
      addIssue(
        result.dataGaps,
        topDataGaps,
        result.planningBucketKey,
        "missing-model90-per-adult-driver-amount",
        "MODEL90 default bucket floor could not be calculated because monthlyPerAdultDriverAmount is missing."
      );
    }

    result.trace.monthlyBaseAmount = monthlyBaseAmount;
    result.trace.monthlyPerAdultDriverAmount = monthlyPerAdultDriverAmount;
    result.trace.adultDriverCount = adultDriver.count;
    result.trace.adultDriverCountSource = adultDriver.source;

    if (result.dataGaps.length) {
      return result;
    }

    return finalizeBucketResult(
      result,
      monthlyBaseAmount + monthlyPerAdultDriverAmount * adultDriver.count
    );
  }

  function createTopLevelTrace(input, householdContext, survivingHouseholdMembers) {
    return {
      survivingHouseholdMembers,
      householdMemberBandCounts: clonePlainValue(householdContext.householdMemberBandCounts || {}),
      noSurvivingAdultDetected: householdContext.noSurvivingAdultDetected === true,
      missingAgeFallbackUsed: householdContext.missingAgeFallbackUsed === true,
      missingSexFallbackUsed: householdContext.missingSexFallbackUsed === true,
      calculatedAtMode: CALCULATED_AT_MODE,
      requestedPlanningBucketKeys: Array.isArray(input.planningBucketKeys)
        ? input.planningBucketKeys.map(normalizeKey).filter(Boolean)
        : null
    };
  }

  function calculateHouseholdExpenseLivingFloors(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const livingFloorAssumptions = isPlainObject(safeInput.livingFloorAssumptions)
      ? safeInput.livingFloorAssumptions
      : {};
    const householdContext = isPlainObject(safeInput.householdContext) ? safeInput.householdContext : {};
    const warnings = [];
    const dataGaps = [];
    const metadataByKey = getMoneyBucketMetadataByKey();
    const targetBucketKeys = getTargetBucketKeys(safeInput, warnings);
    const topLevelHouseholdWarnings = [];
    const survivingHouseholdMembers = getSurvivingHouseholdMembers(householdContext, topLevelHouseholdWarnings);
    topLevelHouseholdWarnings.forEach(function (warning) {
      warnings.push(Object.assign({ planningBucketKey: null }, warning));
    });

    const buckets = targetBucketKeys.reduce(function (bucketResults, planningBucketKey) {
      const metadata = metadataByKey[planningBucketKey] || FALLBACK_MONEY_BUCKET_METADATA[planningBucketKey] || {};
      if (planningBucketKey === "foodAtHomeConsumables") {
        bucketResults[planningBucketKey] = calculateFoodAtHomeFloor(
          livingFloorAssumptions,
          householdContext,
          metadata,
          warnings,
          dataGaps
        );
        return bucketResults;
      }

      if (planningBucketKey === "transportationBasics") {
        bucketResults[planningBucketKey] = calculateTransportationBasicsFloor(
          livingFloorAssumptions,
          householdContext,
          metadata,
          warnings,
          dataGaps
        );
        return bucketResults;
      }

      if (MODEL90_DEFAULT_BUCKET_CONFIG[planningBucketKey]) {
        bucketResults[planningBucketKey] = calculateBasePlusMemberFloor(
          planningBucketKey,
          livingFloorAssumptions,
          householdContext,
          metadata,
          warnings,
          dataGaps
        );
      }

      return bucketResults;
    }, {});

    return {
      buckets,
      warnings,
      dataGaps,
      trace: createTopLevelTrace(safeInput, householdContext, survivingHouseholdMembers),
      metadata: {
        calculationVersion: CALCULATION_VERSION,
        activeRuntimeConsumer: false,
        calculatedAtMode: CALCULATED_AT_MODE,
        calculatedBucketKeys: Object.keys(buckets)
      }
    };
  }

  lensAnalysis.householdExpenseLivingFloorCalculations = Object.freeze({
    CALCULATION_VERSION,
    CALCULATED_AT_MODE,
    MONEY_FLOOR_BUCKET_KEYS,
    FOOD_AT_HOME_BAND_KEYS,
    calculateHouseholdExpenseLivingFloors
  });
})(window);
