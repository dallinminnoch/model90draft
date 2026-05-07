(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis passive expense compression threshold defaults.
  // Purpose: define MODEL90 system default threshold rules for future advisor-
  // editable household expense compression policy.
  // Non-goals: no runtime compression, no formula behavior, no normalization
  // behavior and no advisor override persistence.

  const EXPENSE_THRESHOLD_BASIS_VALUES = Object.freeze([
    "perHouseholdMemberMonthly",
    "perHouseholdMonthly",
    "perDependentMonthly",
    "percentOfIncome",
    "fixedMonthly",
    "advisorDefined",
    "notThresholdBased"
  ]);

  const EXPENSE_THRESHOLD_BEHAVIOR_CLASS_VALUES = Object.freeze([
    "protectedEssential",
    "flexibleEssential",
    "discretionary",
    "pauseCandidate",
    "advisorConfirmed",
    "generatedDebt",
    "customReview",
    "notThresholdBased"
  ]);

  const EXPENSE_THRESHOLD_UNIT_VALUES = Object.freeze([
    "usdMonthly",
    "percentOfIncome",
    "none"
  ]);

  const EXPENSE_THRESHOLD_TIER_KEYS = Object.freeze([
    "minimum",
    "conservative",
    "average",
    "comfortable"
  ]);

  const DEFAULT_EXPENSE_COMPRESSION_THRESHOLD_RULES = Object.freeze([
    createThresholdRule({
      thresholdId: "groceries-per-member-monthly-v1",
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMemberMonthly",
      tiers: { minimum: 150, conservative: 250, average: 350, comfortable: 450 },
      canAutoReduce: true,
      canReduceToZero: false,
      protectedFloor: 150,
      compressionOrderGroup: "protected-food-late",
      notes: "Compress only after dining out, takeout, travel, and discretionary lifestyle categories."
    }),
    createThresholdRule({
      thresholdId: "household-consumables-per-member-monthly-v1",
      expenseTypeKey: "householdConsumablesSupplies",
      categoryKey: "foodGroceries",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMemberMonthly",
      tiers: { minimum: 25, conservative: 40, average: 60, comfortable: 90 },
      canAutoReduce: true,
      canReduceToZero: false,
      protectedFloor: 25,
      compressionOrderGroup: "protected-household-late",
      notes: "Covers paper goods, cleaning supplies, toiletries, laundry supplies, and basic household consumables."
    }),
    createThresholdRule({
      thresholdId: "dining-out-per-member-monthly-v1",
      expenseTypeKey: "diningOutRestaurants",
      categoryKey: "foodGroceries",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMemberMonthly",
      tiers: { minimum: 0, conservative: 50, average: 100, comfortable: 175 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-discretionary-food",
      notes: "Early food-related discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "takeout-convenience-food-per-member-monthly-v1",
      expenseTypeKey: "takeoutConvenienceFood",
      categoryKey: "foodGroceries",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMemberMonthly",
      tiers: { minimum: 0, conservative: 35, average: 75, comfortable: 125 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-discretionary-food",
      notes: "Early food-related discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "meal-delivery-services-household-monthly-v1",
      expenseTypeKey: "mealDeliveryServices",
      categoryKey: "foodGroceries",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 75, comfortable: 150 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-discretionary-food",
      notes: "Early convenience-food compression candidate."
    }),
    createThresholdRule({
      thresholdId: "grocery-delivery-fees-household-monthly-v1",
      expenseTypeKey: "groceryDeliveryFeesTips",
      categoryKey: "foodGroceries",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 15, average: 35, comfortable: 75 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "medium-food-convenience",
      notes: "Can compress after higher-impact discretionary food and lifestyle reductions."
    }),
    createThresholdRule({
      thresholdId: "alcohol-social-beverages-household-monthly-v1",
      expenseTypeKey: "alcoholSocialBeverages",
      categoryKey: "foodGroceries",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 75, comfortable: 150 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-discretionary-food",
      notes: "Early discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "entertainment-recreation-household-monthly-v1",
      expenseTypeKey: "entertainmentRecreation",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 50, average: 125, comfortable: 250 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary lifestyle compression candidate."
    }),
    createThresholdRule({
      thresholdId: "streaming-digital-subscriptions-household-monthly-v1",
      expenseTypeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 60, comfortable: 120 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-subscriptions",
      notes: "Early recurring discretionary subscription compression candidate."
    }),
    createThresholdRule({
      thresholdId: "gym-fitness-memberships-household-monthly-v1",
      expenseTypeKey: "gymFitnessMemberships",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 30, average: 80, comfortable: 160 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Compressible, with advisor discretion for health-related use cases."
    }),
    createThresholdRule({
      thresholdId: "clubs-social-memberships-household-monthly-v1",
      expenseTypeKey: "clubsSocialMemberships",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 0, average: 100, comfortable: 300 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "hobbies-recreation-gear-household-monthly-v1",
      expenseTypeKey: "hobbiesRecreationGear",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 75, comfortable: 175 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "events-concerts-sports-household-monthly-v1",
      expenseTypeKey: "eventsConcertsSportingEvents",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 100, comfortable: 250 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "gaming-in-app-household-monthly-v1",
      expenseTypeKey: "gamingInAppPurchases",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 10, average: 40, comfortable: 100 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "date-nights-family-outings-household-monthly-v1",
      expenseTypeKey: "dateNightsFamilyOutings",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 40, average: 120, comfortable: 250 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary lifestyle compression candidate."
    }),
    createThresholdRule({
      thresholdId: "luxury-purchases-household-monthly-v1",
      expenseTypeKey: "luxuryPurchases",
      categoryKey: "discretionaryLifestyle",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 0, average: 100, comfortable: 300 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-lifestyle",
      notes: "Early discretionary compression candidate."
    }),
    createThresholdRule({
      thresholdId: "vacations-travel-household-monthly-v1",
      expenseTypeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 100, average: 250, comfortable: 500 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-travel",
      notes: "Monthly equivalent of travel spending; reduce before protected household essentials."
    }),
    createThresholdRule({
      thresholdId: "weekend-short-trips-household-monthly-v1",
      expenseTypeKey: "weekendShortTrips",
      categoryKey: "travelVacations",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 40, average: 125, comfortable: 250 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-travel",
      notes: "Early discretionary travel compression candidate."
    }),
    createThresholdRule({
      thresholdId: "lodging-household-monthly-v1",
      expenseTypeKey: "lodging",
      categoryKey: "travelVacations",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 50, average: 150, comfortable: 350 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-travel",
      notes: "Monthly equivalent of travel lodging."
    }),
    createThresholdRule({
      thresholdId: "travel-food-entertainment-household-monthly-v1",
      expenseTypeKey: "travelFoodEntertainment",
      categoryKey: "travelVacations",
      behaviorClass: "discretionary",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 100, comfortable: 250 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "early-travel",
      notes: "Monthly equivalent of discretionary travel food and entertainment."
    }),
    createThresholdRule({
      thresholdId: "fuel-household-monthly-v1",
      expenseTypeKey: "fuel",
      categoryKey: "transportation",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 100, conservative: 200, average: 350, comfortable: 550 },
      canAutoReduce: false,
      canReduceToZero: false,
      protectedFloor: 100,
      compressionOrderGroup: "protected-transportation-review",
      notes: "Transportation fuel may be reviewed, but should not be auto-reduced without advisor confirmation of alternatives."
    }),
    createThresholdRule({
      thresholdId: "public-transit-household-monthly-v1",
      expenseTypeKey: "publicTransit",
      categoryKey: "transportation",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 25, conservative: 75, average: 150, comfortable: 250 },
      canAutoReduce: false,
      canReduceToZero: false,
      protectedFloor: 25,
      compressionOrderGroup: "protected-transportation-review",
      notes: "Transit can be reviewed but should not be auto-reduced where it supports work, school, or caregiving."
    }),
    createThresholdRule({
      thresholdId: "rideshare-taxi-household-monthly-v1",
      expenseTypeKey: "rideshareTaxi",
      categoryKey: "transportation",
      behaviorClass: "flexibleEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 75, comfortable: 175 },
      canAutoReduce: true,
      canReduceToZero: false,
      compressionOrderGroup: "medium-transportation",
      notes: "Context-sensitive transportation expense; advisor should review if it supports work, healthcare, school, or caregiving."
    }),
    createThresholdRule({
      thresholdId: "internet-household-monthly-v1",
      expenseTypeKey: "internet",
      categoryKey: "utilities",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 50, conservative: 80, average: 120, comfortable: 180 },
      canAutoReduce: false,
      canReduceToZero: false,
      protectedFloor: 50,
      compressionOrderGroup: "protected-utilities-review",
      notes: "Review plan fit, but do not auto-reduce essential connectivity."
    }),
    createThresholdRule({
      thresholdId: "mobile-phone-household-monthly-v1",
      expenseTypeKey: "mobilePhone",
      categoryKey: "utilities",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 30, conservative: 60, average: 120, comfortable: 220 },
      canAutoReduce: false,
      canReduceToZero: false,
      protectedFloor: 30,
      compressionOrderGroup: "protected-utilities-review",
      notes: "Review plan fit, but do not auto-reduce essential communications."
    }),
    createThresholdRule({
      thresholdId: "electricity-household-monthly-v1",
      expenseTypeKey: "electricity",
      categoryKey: "utilities",
      behaviorClass: "protectedEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 100, conservative: 175, average: 300, comfortable: 500 },
      canAutoReduce: false,
      canReduceToZero: false,
      protectedFloor: 100,
      compressionOrderGroup: "protected-utilities-review",
      notes: "Protected utility; future engine may flag high usage but should not auto-reduce service."
    }),
    createThresholdRule({
      thresholdId: "personal-care-household-monthly-v1",
      expenseTypeKey: "personalCare",
      categoryKey: "personalLiving",
      behaviorClass: "flexibleEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 25, conservative: 75, average: 150, comfortable: 300 },
      canAutoReduce: true,
      canReduceToZero: false,
      protectedFloor: 25,
      compressionOrderGroup: "medium-personal-living",
      notes: "Flexible personal living expense; preserve basic grooming and hygiene floor."
    }),
    createThresholdRule({
      thresholdId: "pet-food-supplies-household-monthly-v1",
      expenseTypeKey: "petFoodSupplies",
      categoryKey: "pets",
      behaviorClass: "flexibleEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 25, conservative: 75, average: 150, comfortable: 300 },
      canAutoReduce: false,
      canReduceToZero: false,
      protectedFloor: 25,
      compressionOrderGroup: "late-pet-care",
      notes: "Pet care review threshold; do not auto-reduce basic pet food and supplies."
    }),
    createThresholdRule({
      thresholdId: "pet-grooming-training-household-monthly-v1",
      expenseTypeKey: "petGroomingTraining",
      categoryKey: "pets",
      behaviorClass: "flexibleEssential",
      thresholdBasis: "perHouseholdMonthly",
      tiers: { minimum: 0, conservative: 25, average: 75, comfortable: 150 },
      canAutoReduce: true,
      canReduceToZero: false,
      compressionOrderGroup: "medium-pet-care",
      notes: "Compressible pet expense, with advisor review for medically necessary grooming or service-animal needs."
    }),
    createThresholdRule({
      thresholdId: "bank-overdraft-fees-fixed-monthly-v1",
      expenseTypeKey: "bankFees",
      categoryKey: "bankingFinanceCharges",
      behaviorClass: "flexibleEssential",
      thresholdBasis: "fixedMonthly",
      tiers: { minimum: 0, conservative: 0, average: 15, comfortable: 50 },
      canAutoReduce: true,
      canReduceToZero: true,
      compressionOrderGroup: "fee-reduction-review",
      notes: "Representative banking-fee threshold; future advisor settings may split bankFees and overdraftFees."
    })
  ]);

  function createThresholdRule(options) {
    const safeOptions = options || {};
    return Object.freeze({
      thresholdId: safeOptions.thresholdId,
      expenseTypeKey: safeOptions.expenseTypeKey,
      categoryKey: safeOptions.categoryKey,
      behaviorClass: safeOptions.behaviorClass,
      thresholdBasis: safeOptions.thresholdBasis,
      tiers: Object.freeze({
        minimum: safeOptions.tiers.minimum,
        conservative: safeOptions.tiers.conservative,
        average: safeOptions.tiers.average,
        comfortable: safeOptions.tiers.comfortable
      }),
      unit: safeOptions.unit || "usdMonthly",
      canAutoReduce: safeOptions.canAutoReduce === true,
      requiresAdvisorConfirmation: safeOptions.requiresAdvisorConfirmation === true,
      canPause: safeOptions.canPause === true,
      canReduceToZero: safeOptions.canReduceToZero === true,
      protectedFloor: Number.isFinite(Number(safeOptions.protectedFloor)) ? Number(safeOptions.protectedFloor) : null,
      compressionOrderGroup: safeOptions.compressionOrderGroup,
      advisorEditable: safeOptions.advisorEditable !== false,
      version: Number.isFinite(Number(safeOptions.version)) ? Number(safeOptions.version) : 1,
      notes: safeOptions.notes || null
    });
  }

  function cloneThresholdRule(rule) {
    return {
      ...rule,
      tiers: { ...rule.tiers }
    };
  }

  function getExpenseCompressionThresholdRules() {
    return DEFAULT_EXPENSE_COMPRESSION_THRESHOLD_RULES.map(cloneThresholdRule);
  }

  function getExpenseCompressionThresholdRule(thresholdId) {
    const normalizedId = String(thresholdId == null ? "" : thresholdId).trim();
    const rule = DEFAULT_EXPENSE_COMPRESSION_THRESHOLD_RULES.find(function (item) {
      return item.thresholdId === normalizedId;
    });
    return rule ? cloneThresholdRule(rule) : null;
  }

  function getExpenseCompressionThresholdRuleByType(expenseTypeKey) {
    const normalizedTypeKey = String(expenseTypeKey == null ? "" : expenseTypeKey).trim();
    const rule = DEFAULT_EXPENSE_COMPRESSION_THRESHOLD_RULES.find(function (item) {
      return item.expenseTypeKey === normalizedTypeKey;
    });
    return rule ? cloneThresholdRule(rule) : null;
  }

  lensAnalysis.expenseCompressionThresholds = {
    EXPENSE_THRESHOLD_BASIS_VALUES,
    EXPENSE_THRESHOLD_BEHAVIOR_CLASS_VALUES,
    EXPENSE_THRESHOLD_UNIT_VALUES,
    EXPENSE_THRESHOLD_TIER_KEYS,
    DEFAULT_EXPENSE_COMPRESSION_THRESHOLD_RULES,
    getExpenseCompressionThresholdRules,
    getExpenseCompressionThresholdRule,
    getExpenseCompressionThresholdRuleByType
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
