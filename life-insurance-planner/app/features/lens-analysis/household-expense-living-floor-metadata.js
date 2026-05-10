(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: passive household expense living-floor and adjustment classification metadata.
  // Non-goals: no calculations, policy resolution, storage, admin rendering, or runtime behavior.

  const LIVING_FLOOR_METADATA_VERSION = 1;

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

  const BENCHMARK_SOURCE_VALUES = Object.freeze([
    "USDA_FOOD_PLAN",
    "HUD_FMR",
    "EPI_FAMILY_BUDGET",
    "MIT_LIVING_WAGE",
    "MODEL90_DEFAULT",
    "NONE"
  ]);

  const SOURCE_DATA_STATUS_VALUES = Object.freeze([
    "notLoaded",
    "seedLoaded",
    "adminConfigured",
    "notApplicable"
  ]);

  const FOOD_AT_HOME_HOUSEHOLD_MEMBER_BANDS = Object.freeze([
    Object.freeze({ bandKey: "infantToddler", minAge: 0, maxAge: 3, sex: "any" }),
    Object.freeze({ bandKey: "youngChild", minAge: 4, maxAge: 8, sex: "any" }),
    Object.freeze({ bandKey: "olderChild", minAge: 9, maxAge: 13, sex: "any" }),
    Object.freeze({ bandKey: "teenMale", minAge: 14, maxAge: 18, sex: "male" }),
    Object.freeze({ bandKey: "teenFemale", minAge: 14, maxAge: 18, sex: "female" }),
    Object.freeze({ bandKey: "adultMale", minAge: 19, maxAge: null, sex: "male" }),
    Object.freeze({ bandKey: "adultFemale", minAge: 19, maxAge: null, sex: "female" }),
    Object.freeze({ bandKey: "adultUnknown", minAge: 19, maxAge: null, sex: "unknown" }),
    Object.freeze({ bandKey: "childUnknown", minAge: 0, maxAge: 18, sex: "unknown" })
  ]);

  const LIVING_FLOOR_TRACE_FIELDS = Object.freeze([
    "totalCurrentHouseholdMembers",
    "survivingHouseholdMembers",
    "deceasedInsuredCount",
    "householdMemberBandCounts",
    "noSurvivingAdultDetected",
    "missingAgeFallbackUsed",
    "missingSexFallbackUsed"
  ]);

  const HOUSEHOLD_SIZING_RULE = Object.freeze({
    householdSizingRuleKey: "remainingHouseholdAfterInsuredDeath",
    remainingHouseholdMembersFormula: "currentHouseholdMembers - deceasedInsured",
    deceasedInsuredCountDefault: 1,
    defaultDeceasedInsuredIdentity: "client",
    assumeClientIsDeceasedInsuredUnlessScenarioDataIdentifiesAnotherInsured: true,
    includeSurvivingSpousePartnerIfPresent: true,
    includeCurrentDependents: true,
    includeProjectedFutureDependents: false,
    survivingHouseholdSizeMinimum: 1,
    noSurvivingAdultDependentFallback: "safeAdultEquivalent",
    notes: "Floors are sized for the remaining household after insured death. Future dependents are excluded."
  });

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (value && typeof value === "object") {
      return Object.keys(value).reduce(function (clone, key) {
        clone[key] = clonePlainValue(value[key]);
        return clone;
      }, {});
    }

    return value;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }

    Object.keys(value).forEach(function (key) {
      deepFreeze(value[key]);
    });

    return Object.freeze(value);
  }

  function createMetadata(definition) {
    return deepFreeze(Object.assign({
      planningBucketKey: "",
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted",
      benchmarkAvailable: false,
      benchmarkSource: "NONE",
      floorSource: "NONE",
      householdSizingMethod: "none",
      adminEditable: false,
      adminDollarInputsRequired: false,
      sourceDataStatus: "notApplicable",
      usesSurvivingHousehold: false,
      notes: ""
    }, definition));
  }

  function moneyFloorBucket(planningBucketKey, options) {
    return createMetadata(Object.assign({
      planningBucketKey,
      adjustmentClass: "moneyFloorAdjusted",
      minimumFloorMode: "estimatedDollarFloor",
      benchmarkAvailable: true,
      adminEditable: true,
      adminDollarInputsRequired: true,
      sourceDataStatus: "notLoaded",
      usesSurvivingHousehold: true
    }, options));
  }

  function ratioBucket(planningBucketKey, minimumFloorMode, notes) {
    return createMetadata({
      planningBucketKey,
      adjustmentClass: "ratioAdjusted",
      minimumFloorMode,
      adminEditable: true,
      notes: notes || ""
    });
  }

  function excludedBucket(planningBucketKey, options) {
    return createMetadata(Object.assign({
      planningBucketKey,
      adjustmentClass: "excludedFromAdjustment",
      minimumFloorMode: "notAdjusted"
    }, options || {}));
  }

  const LIVING_FLOOR_BUCKET_METADATA = Object.freeze([
    moneyFloorBucket("foodAtHomeConsumables", {
      benchmarkSource: "USDA_FOOD_PLAN",
      floorSource: "USDA_FOOD_PLAN",
      householdSizingMethod: "usdaAgeSexBandWeighted",
      notes: "USDA national baseline dollar values are entered or imported through admin controls and sized by household-size factor."
    }),
    moneyFloorBucket("householdConsumables", {
      benchmarkSource: "MODEL90_DEFAULT",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "householdBasePlusMember",
      notes: "Direct MODEL90/admin-entered household goods and supplies floor, separate from food-at-home USDA logic."
    }),
    moneyFloorBucket("communicationsConnectivity", {
      benchmarkSource: "MODEL90_DEFAULT",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "fixedHouseholdPlusMember",
      notes: "Direct MODEL90/admin-entered basic connectivity floor for remaining household support."
    }),
    moneyFloorBucket("transportationBasics", {
      benchmarkSource: "MODEL90_DEFAULT",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "adultDriverWeighted",
      notes: "Direct MODEL90/admin-entered basic transportation floor; vehicle obligations remain excluded elsewhere."
    }),

    ratioBucket("diningTakeout", "zeroFloor"),
    ratioBucket("subscriptionsMemberships", "zeroFloor"),
    ratioBucket("entertainmentRecreation", "zeroFloor"),
    ratioBucket("travelVacations", "zeroFloor"),
    ratioBucket("petsDiscretionary", "zeroFloor"),
    ratioBucket("savingsGoalContributions", "zeroFloor", "Pauseable contribution, not compressed consumption."),
    ratioBucket("personalLivingClothing", "ratioFloorOnly"),
    ratioBucket("householdServices", "ratioFloorOnly"),

    excludedBucket("finalExpenses", {
      notes: "Source-owned final expense logic owns current output."
    }),
    excludedBucket("healthcareCare", {
      benchmarkAvailable: true,
      benchmarkSource: "EPI_FAMILY_BUDGET",
      floorSource: "EPI_FAMILY_BUDGET",
      householdSizingMethod: "ageBandWeighted",
      sourceDataStatus: "notLoaded",
      usesSurvivingHousehold: true,
      notes: "Source-owned healthcare logic; benchmark/reference only."
    }),
    excludedBucket("housingCore", {
      benchmarkAvailable: true,
      benchmarkSource: "HUD_FMR",
      floorSource: "HUD_FMR",
      householdSizingMethod: "householdSizeBand",
      sourceDataStatus: "notLoaded",
      usesSurvivingHousehold: true,
      notes: "Reference/benchmark only; does not adjust lifestyle slider."
    }),
    excludedBucket("basicUtilities", {
      benchmarkAvailable: true,
      benchmarkSource: "MODEL90_DEFAULT",
      floorSource: "MODEL90_DEFAULT",
      householdSizingMethod: "householdSizeBand",
      sourceDataStatus: "notLoaded",
      usesSurvivingHousehold: true,
      notes: "Excluded from adjustment; benchmark/reference only."
    }),
    excludedBucket("vehicleOwnershipMaintenance", {
      notes: "Vehicle ownership and maintenance obligations are protected/excluded in V1."
    }),
    excludedBucket("insurancePremiums", {
      notes: "Contractual premiums; no V1 benchmark source."
    }),
    excludedBucket("childcareDependentSupport", {
      benchmarkAvailable: true,
      benchmarkSource: "EPI_FAMILY_BUDGET",
      floorSource: "EPI_FAMILY_BUDGET",
      householdSizingMethod: "childAgeBandWeighted",
      sourceDataStatus: "notLoaded",
      usesSurvivingHousehold: true,
      notes: "Protected dependent need; benchmark/reference only."
    }),
    excludedBucket("educationEnrichment", {
      notes: "Education logic owns current output."
    }),
    excludedBucket("petsCoreCare", {
      notes: "Core pet care is protected/excluded in V1; no V1 benchmark source."
    }),
    excludedBucket("givingCommunity", {
      notes: "Values-based giving remains excluded from adjustment."
    }),
    excludedBucket("taxesLegalAdministrative", {
      notes: "Legal and tax obligations remain excluded from adjustment."
    }),
    excludedBucket("debtObligations", {
      notes: "Debt payment and payoff facts are source-owned and excluded from adjustment."
    }),
    excludedBucket("businessSelfEmployment", {
      notes: "Business and income-preserving costs remain excluded from household lifestyle adjustment."
    }),
    excludedBucket("financialFeesTransactionCosts", {
      notes: "Financial fees remain excluded until a narrower product treatment exists."
    }),
    excludedBucket("periodicSinkingFundOneTime", {
      notes: "Periodic and one-time costs remain excluded from adjustment in V1."
    }),
    excludedBucket("customUnknown", {
      notes: "Unknown/custom expenses remain excluded until classified."
    })
  ]);

  const LIVING_FLOOR_BUCKET_METADATA_BY_KEY = Object.freeze(
    LIVING_FLOOR_BUCKET_METADATA.reduce(function (map, bucket) {
      map[bucket.planningBucketKey] = bucket;
      return map;
    }, {})
  );

  function getHouseholdExpenseLivingFloorMetadata() {
    return LIVING_FLOOR_BUCKET_METADATA.map(clonePlainValue);
  }

  function getHouseholdExpenseLivingFloorMetadataByBucket(planningBucketKey) {
    const key = String(planningBucketKey == null ? "" : planningBucketKey).trim();
    const metadata = LIVING_FLOOR_BUCKET_METADATA_BY_KEY[key];
    return metadata ? clonePlainValue(metadata) : null;
  }

  function getFoodAtHomeHouseholdMemberBands() {
    return FOOD_AT_HOME_HOUSEHOLD_MEMBER_BANDS.map(clonePlainValue);
  }

  function getHouseholdExpenseLivingFloorHouseholdSizingRule() {
    return clonePlainValue(HOUSEHOLD_SIZING_RULE);
  }

  function getHouseholdExpenseLivingFloorTraceFields() {
    return LIVING_FLOOR_TRACE_FIELDS.slice();
  }

  lensAnalysis.householdExpenseLivingFloorMetadata = Object.freeze({
    LIVING_FLOOR_METADATA_VERSION,
    ADJUSTMENT_CLASS_VALUES,
    MINIMUM_FLOOR_MODE_VALUES,
    BENCHMARK_SOURCE_VALUES,
    SOURCE_DATA_STATUS_VALUES,
    FOOD_AT_HOME_HOUSEHOLD_MEMBER_BANDS,
    HOUSEHOLD_SIZING_RULE,
    LIVING_FLOOR_TRACE_FIELDS,
    LIVING_FLOOR_BUCKET_METADATA,
    getHouseholdExpenseLivingFloorMetadata,
    getHouseholdExpenseLivingFloorMetadataByBucket,
    getFoodAtHomeHouseholdMemberBands,
    getHouseholdExpenseLivingFloorHouseholdSizingRule,
    getHouseholdExpenseLivingFloorTraceFields
  });
})(window);
