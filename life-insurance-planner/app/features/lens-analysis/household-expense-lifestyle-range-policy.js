(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: passive Income Impact lifestyle range metadata.
  // Non-goals: no slider math, no graph/display behavior, no storage.

  const HOUSEHOLD_EXPENSE_LIFESTYLE_RANGE_POLICY_VERSION = 1;

  const LIFESTYLE_RANGE_BEHAVIORS = Object.freeze({
    FIXED: "fixed",
    COMPRESSIBLE: "compressible",
    PAUSEABLE: "pauseable",
    EXPANDABLE: "expandable",
    REVIEW_ONLY: "reviewOnly"
  });

  const SOURCE_POLICY_DECISIONS = Object.freeze({
    YES: "YES",
    NO: "NO",
    PAUSE: "PAUSE",
    INTERVENTION: "INTERVENTION",
    REVIEW: "REVIEW"
  });

  const TIER_KEYS = Object.freeze({
    MINIMUM: "minimum",
    CONSERVATIVE: "conservative",
    AVERAGE: "average",
    COMFORTABLE: "comfortable",
    NOT_APPLICABLE: "notApplicable"
  });

  function normalizeKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function rangePolicyIdFromTypeKey(typeKey) {
    return "household-expense-lifestyle-range-" + normalizeKey(typeKey)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      + "-v" + HOUSEHOLD_EXPENSE_LIFESTYLE_RANGE_POLICY_VERSION;
  }

  function makePolicy(row) {
    const sliderEligible = row.sliderEligible === true;
    const allowBelowBaseline = sliderEligible && row.allowBelowBaseline !== false;
    const allowAboveBaseline = sliderEligible && row.allowAboveBaseline === true;
    const rangeBehavior = row.rangeBehavior || (sliderEligible ? LIFESTYLE_RANGE_BEHAVIORS.COMPRESSIBLE : LIFESTYLE_RANGE_BEHAVIORS.FIXED);

    return Object.freeze({
      rangePolicyId: row.rangePolicyId || rangePolicyIdFromTypeKey(row.expenseTypeKey),
      expenseTypeKey: row.expenseTypeKey,
      categoryKey: row.categoryKey,
      displayName: row.displayName,
      sliderEligible,
      rangeBehavior,
      conservativeFloorRatio: typeof row.conservativeFloorRatio === "number" ? row.conservativeFloorRatio : null,
      elevatedCeilingRatio: typeof row.elevatedCeilingRatio === "number" ? row.elevatedCeilingRatio : null,
      floorTierKey: row.floorTierKey || TIER_KEYS.NOT_APPLICABLE,
      ceilingTierKey: row.ceilingTierKey || TIER_KEYS.NOT_APPLICABLE,
      ceilingTierMultiplier: typeof row.ceilingTierMultiplier === "number" ? row.ceilingTierMultiplier : null,
      protectedFloorPolicy: row.protectedFloorPolicy || "preserveCurrent",
      allowBelowBaseline,
      allowAboveBaseline,
      requiresAdvisorReview: row.requiresAdvisorReview === true || rangeBehavior === LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY,
      sourcePolicyDecision: row.sourcePolicyDecision || SOURCE_POLICY_DECISIONS.REVIEW,
      notes: row.notes || null,
      version: HOUSEHOLD_EXPENSE_LIFESTYLE_RANGE_POLICY_VERSION
    });
  }

  function fixedPolicy(expenseTypeKey, categoryKey, displayName, sourcePolicyDecision, notes) {
    return makePolicy({
      expenseTypeKey,
      categoryKey,
      displayName,
      sliderEligible: false,
      rangeBehavior: LIFESTYLE_RANGE_BEHAVIORS.FIXED,
      conservativeFloorRatio: 1,
      elevatedCeilingRatio: 1,
      allowBelowBaseline: false,
      allowAboveBaseline: false,
      protectedFloorPolicy: "preserveCurrent",
      sourcePolicyDecision,
      notes
    });
  }

  function reviewPolicy(expenseTypeKey, categoryKey, displayName, sourcePolicyDecision, notes) {
    return makePolicy({
      expenseTypeKey,
      categoryKey,
      displayName,
      sliderEligible: false,
      rangeBehavior: LIFESTYLE_RANGE_BEHAVIORS.REVIEW_ONLY,
      conservativeFloorRatio: 1,
      elevatedCeilingRatio: 1,
      allowBelowBaseline: false,
      allowAboveBaseline: false,
      protectedFloorPolicy: "preserveCurrent",
      requiresAdvisorReview: true,
      sourcePolicyDecision,
      notes
    });
  }

  function compressiblePolicy(options) {
    return makePolicy(Object.assign({
      sliderEligible: true,
      rangeBehavior: LIFESTYLE_RANGE_BEHAVIORS.COMPRESSIBLE,
      allowBelowBaseline: true,
      allowAboveBaseline: true,
      protectedFloorPolicy: "thresholdFloorIfPresent",
      sourcePolicyDecision: SOURCE_POLICY_DECISIONS.YES
    }, options));
  }

  function expandablePolicy(options) {
    return makePolicy(Object.assign({
      sliderEligible: true,
      rangeBehavior: LIFESTYLE_RANGE_BEHAVIORS.EXPANDABLE,
      allowBelowBaseline: true,
      allowAboveBaseline: true,
      protectedFloorPolicy: "thresholdFloorIfPresent",
      sourcePolicyDecision: SOURCE_POLICY_DECISIONS.YES
    }, options));
  }

  function pauseablePolicy(expenseTypeKey, categoryKey, displayName) {
    return makePolicy({
      expenseTypeKey,
      categoryKey,
      displayName,
      sliderEligible: true,
      rangeBehavior: LIFESTYLE_RANGE_BEHAVIORS.PAUSEABLE,
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.NOT_APPLICABLE,
      ceilingTierMultiplier: null,
      protectedFloorPolicy: "allowPauseToZero",
      allowBelowBaseline: true,
      allowAboveBaseline: false,
      sourcePolicyDecision: SOURCE_POLICY_DECISIONS.PAUSE,
      notes: "Lifestyle conservative endpoint may pause contribution cash flow; it does not spend existing assets."
    });
  }

  const householdExpenseLifestyleRangePolicyRules = Object.freeze([
    fixedPolicy(
      "rentOrMortgagePayment",
      "housingExpense",
      "Rent or Mortgage Payment",
      SOURCE_POLICY_DECISIONS.INTERVENTION,
      "Housing payment changes are intervention-level decisions, not lifestyle slider movement."
    ),
    fixedPolicy("propertyTaxes", "housingExpense", "Property Taxes", SOURCE_POLICY_DECISIONS.NO, "Property taxes are fixed/protected housing costs."),
    fixedPolicy("homeRentersInsurance", "housingExpense", "Homeowners / Renters Insurance", SOURCE_POLICY_DECISIONS.NO, "Housing insurance is not automatic lifestyle slider movement."),
    fixedPolicy("hoaAssessments", "housingExpense", "HOA / Assessments", SOURCE_POLICY_DECISIONS.NO, "HOA and assessments are contractual housing costs."),
    fixedPolicy("mortgageInsurancePmi", "housingExpense", "Mortgage Insurance / PMI", SOURCE_POLICY_DECISIONS.NO, "Mortgage insurance is housing/protection cost, not lifestyle spend."),

    compressiblePolicy({
      expenseTypeKey: "groceries",
      categoryKey: "foodGroceries",
      displayName: "Groceries",
      conservativeFloorRatio: 0.8,
      elevatedCeilingRatio: 1.15,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "useThresholdProtectedFloor",
      notes: "Protected flexible essential with narrow movement; never below the resolved protected floor."
    }),
    compressiblePolicy({
      expenseTypeKey: "householdConsumablesSupplies",
      categoryKey: "foodGroceries",
      displayName: "Household Consumables & Supplies",
      conservativeFloorRatio: 0.75,
      elevatedCeilingRatio: 1.2,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "useThresholdProtectedFloor",
      notes: "Basic household consumables are flexible but protected from deep cuts."
    }),
    expandablePolicy({
      expenseTypeKey: "diningOutRestaurants",
      categoryKey: "foodGroceries",
      displayName: "Dining Out / Restaurants",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.75,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.25,
      protectedFloorPolicy: "allowZero",
      notes: "Wide lifestyle range; early discretionary food spending."
    }),
    expandablePolicy({
      expenseTypeKey: "takeoutConvenienceFood",
      categoryKey: "foodGroceries",
      displayName: "Takeout / Convenience Food",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.6,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.2,
      protectedFloorPolicy: "allowZero",
      notes: "Convenience food can move materially with lifestyle setting."
    }),
    expandablePolicy({
      expenseTypeKey: "mealDeliveryServices",
      categoryKey: "foodGroceries",
      displayName: "Meal Delivery Services",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.75,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.25,
      protectedFloorPolicy: "allowZero",
      notes: "Convenience service can approach zero at the conservative endpoint."
    }),
    expandablePolicy({
      expenseTypeKey: "groceryDeliveryFeesTips",
      categoryKey: "foodGroceries",
      displayName: "Grocery Delivery Fees / Tips",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.5,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.15,
      protectedFloorPolicy: "allowZero",
      notes: "Delivery convenience can reduce before grocery staples."
    }),
    expandablePolicy({
      expenseTypeKey: "alcoholSocialBeverages",
      categoryKey: "foodGroceries",
      displayName: "Alcohol / Social Beverages",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.75,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.25,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary social beverage spending can move widely."
    }),

    expandablePolicy({
      expenseTypeKey: "streamingDigitalSubscriptions",
      categoryKey: "discretionaryLifestyle",
      displayName: "Streaming & Digital Subscriptions",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.5,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.15,
      protectedFloorPolicy: "allowZero",
      notes: "Recurring subscription bundle can approach zero and expand modestly."
    }),
    expandablePolicy({
      expenseTypeKey: "subscriptionsMemberships",
      categoryKey: "discretionaryLifestyle",
      displayName: "Subscriptions / Memberships",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.5,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.15,
      protectedFloorPolicy: "allowZero",
      notes: "Legacy/scalar subscription category maps to a wide recurring lifestyle range."
    }),
    expandablePolicy({
      expenseTypeKey: "entertainmentRecreation",
      categoryKey: "discretionaryLifestyle",
      displayName: "Entertainment / Recreation",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.6,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.2,
      protectedFloorPolicy: "allowZero",
      notes: "General discretionary lifestyle spending."
    }),
    expandablePolicy({
      expenseTypeKey: "luxuryPurchases",
      categoryKey: "discretionaryLifestyle",
      displayName: "Luxury Purchases",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.75,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.25,
      protectedFloorPolicy: "allowZero",
      notes: "Luxury purchases are slider-eligible but capped by ratio and tier policy."
    }),
    expandablePolicy({
      expenseTypeKey: "gamingInAppPurchases",
      categoryKey: "discretionaryLifestyle",
      displayName: "Gaming / In-App Purchases",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.5,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.15,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary digital spending."
    }),
    expandablePolicy({
      expenseTypeKey: "gymFitnessMemberships",
      categoryKey: "discretionaryLifestyle",
      displayName: "Gym / Fitness Memberships",
      conservativeFloorRatio: 0.25,
      elevatedCeilingRatio: 1.35,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.1,
      protectedFloorPolicy: "allowLowNonzero",
      notes: "Fitness may be discretionary or health-supporting; keep movement moderate."
    }),

    expandablePolicy({
      expenseTypeKey: "vacationsTravel",
      categoryKey: "travelVacations",
      displayName: "Vacations / Travel",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.8,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.25,
      protectedFloorPolicy: "allowZero",
      notes: "Wide range, capped to avoid fantasy projections."
    }),
    expandablePolicy({
      expenseTypeKey: "weekendShortTrips",
      categoryKey: "travelVacations",
      displayName: "Weekend Trips / Short Trips",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.7,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.2,
      protectedFloorPolicy: "allowZero",
      notes: "Short-trip spending can move widely with lifestyle."
    }),
    expandablePolicy({
      expenseTypeKey: "travelTransportation",
      categoryKey: "travelVacations",
      displayName: "Travel Transportation",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.6,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.15,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary travel transportation range."
    }),
    expandablePolicy({
      expenseTypeKey: "lodging",
      categoryKey: "travelVacations",
      displayName: "Lodging",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.7,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.2,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary travel lodging range."
    }),
    expandablePolicy({
      expenseTypeKey: "travelFoodEntertainment",
      categoryKey: "travelVacations",
      displayName: "Travel Food & Entertainment",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.6,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.15,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary spending while traveling."
    }),

    compressiblePolicy({
      expenseTypeKey: "fuel",
      categoryKey: "transportation",
      displayName: "Fuel",
      conservativeFloorRatio: 0.85,
      elevatedCeilingRatio: 1.15,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "preserveTransportationNeed",
      notes: "Necessary transportation has narrow movement."
    }),
    compressiblePolicy({
      expenseTypeKey: "publicTransit",
      categoryKey: "transportation",
      displayName: "Public Transit",
      conservativeFloorRatio: 0.85,
      elevatedCeilingRatio: 1.1,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "preserveTransportationNeed",
      notes: "Necessary transit has narrow movement."
    }),
    expandablePolicy({
      expenseTypeKey: "rideshareTaxi",
      categoryKey: "transportation",
      displayName: "Rideshare / Taxi",
      conservativeFloorRatio: 0.25,
      elevatedCeilingRatio: 1.35,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.1,
      protectedFloorPolicy: "allowLowNonzero",
      notes: "Transportation convenience can move, but remains capped."
    }),
    fixedPolicy("autoLoanPayment", "debtObligations", "Auto Loan Payment", SOURCE_POLICY_DECISIONS.NO, "Debt payments are source-owned and fixed for lifestyle slider V1."),
    fixedPolicy("autoLeasePayment", "debtObligations", "Auto Lease Payment", SOURCE_POLICY_DECISIONS.NO, "Debt payments are source-owned and fixed for lifestyle slider V1."),
    fixedPolicy("creditCardMinimumPayment", "debtObligations", "Credit Card Minimum Payment", SOURCE_POLICY_DECISIONS.NO, "Debt minimum payments are fixed/source-owned, not lifestyle spend."),
    fixedPolicy("studentLoanPayment", "debtObligations", "Student Loan Payment", SOURCE_POLICY_DECISIONS.NO, "Debt payments are source-owned and fixed for lifestyle slider V1."),
    fixedPolicy("personalLoanPayment", "debtObligations", "Personal Loan Payment", SOURCE_POLICY_DECISIONS.NO, "Debt payments are source-owned and fixed for lifestyle slider V1."),
    fixedPolicy("medicalDebtPayment", "debtObligations", "Medical Debt Payment", SOURCE_POLICY_DECISIONS.NO, "Debt payments are source-owned and fixed for lifestyle slider V1."),
    fixedPolicy("businessDebtPayment", "debtObligations", "Business Debt Payment", SOURCE_POLICY_DECISIONS.NO, "Business debt is not automatic lifestyle slider movement."),
    fixedPolicy("otherDebtPayment", "debtObligations", "Other Debt Payment", SOURCE_POLICY_DECISIONS.NO, "Debt payments are source-owned and fixed for lifestyle slider V1."),

    reviewPolicy("electricity", "utilities", "Electricity", SOURCE_POLICY_DECISIONS.NO, "Basic utility; avoid automatic lifestyle movement in V1."),
    reviewPolicy("gasHeatingFuelPropaneOil", "utilities", "Gas / Heating Fuel / Propane / Oil", SOURCE_POLICY_DECISIONS.NO, "Basic utility; avoid automatic lifestyle movement in V1."),
    reviewPolicy("waterSewer", "utilities", "Water / Sewer", SOURCE_POLICY_DECISIONS.NO, "Basic utility; avoid automatic lifestyle movement in V1."),
    reviewPolicy("trashRecycling", "utilities", "Trash / Recycling", SOURCE_POLICY_DECISIONS.NO, "Basic utility; avoid automatic lifestyle movement in V1."),
    compressiblePolicy({
      expenseTypeKey: "internet",
      categoryKey: "utilities",
      displayName: "Internet",
      conservativeFloorRatio: 0.8,
      elevatedCeilingRatio: 1.2,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "preserveBasicService",
      notes: "Narrow range for plan-level lifestyle movement."
    }),
    compressiblePolicy({
      expenseTypeKey: "mobilePhone",
      categoryKey: "utilities",
      displayName: "Mobile Phone",
      conservativeFloorRatio: 0.8,
      elevatedCeilingRatio: 1.2,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "preserveBasicService",
      notes: "Narrow range for plan-level lifestyle movement."
    }),

    reviewPolicy("daycareChildcare", "familySupport", "Daycare / Childcare", SOURCE_POLICY_DECISIONS.NO, "Protected dependent expense; advisor review required."),
    reviewPolicy("nannyInHomeChildcare", "familySupport", "Nanny / In-Home Childcare", SOURCE_POLICY_DECISIONS.NO, "Protected dependent expense; advisor review required."),
    reviewPolicy("afterSchoolCare", "familySupport", "After-School Care", SOURCE_POLICY_DECISIONS.NO, "Dependent support; advisor review required."),
    reviewPolicy("privateSchoolTuition", "educationExpense", "Private School Tuition", SOURCE_POLICY_DECISIONS.NO, "Education/dependent expense is not automatic lifestyle movement."),
    reviewPolicy("collegeTuition", "educationExpense", "College Tuition", SOURCE_POLICY_DECISIONS.NO, "Education expense is not automatic lifestyle movement."),
    reviewPolicy("specialEducationServices", "educationExpense", "Special Education Services", SOURCE_POLICY_DECISIONS.NO, "Protected education expense; advisor review required."),

    reviewPolicy("healthInsurancePremiums", "insurancePremiums", "Health Insurance Premiums", SOURCE_POLICY_DECISIONS.NO, "Insurance premiums are fixed/review-only."),
    reviewPolicy("lifeInsurancePremiums", "insurancePremiums", "Life Insurance Premiums", SOURCE_POLICY_DECISIONS.NO, "Protection premiums are not automatic lifestyle slider movement."),
    reviewPolicy("termLifePremiums", "insurancePremiums", "Term Life Premiums", SOURCE_POLICY_DECISIONS.NO, "Protection premiums are not automatic lifestyle slider movement."),
    reviewPolicy("permanentLifePremiums", "insurancePremiums", "Whole Life / Permanent Life Premiums", SOURCE_POLICY_DECISIONS.NO, "Protection premiums are not automatic lifestyle slider movement."),
    reviewPolicy("disabilityInsurancePremiums", "insurancePremiums", "Disability Insurance Premiums", SOURCE_POLICY_DECISIONS.NO, "Protection premiums are not automatic lifestyle slider movement."),
    reviewPolicy("longTermCareInsurance", "insurancePremiums", "Long-Term Care Insurance", SOURCE_POLICY_DECISIONS.NO, "Protection premiums are not automatic lifestyle slider movement."),
    reviewPolicy("copaysCoinsurance", "ongoingHealthcare", "Copays / Coinsurance", SOURCE_POLICY_DECISIONS.NO, "Healthcare is protected/review-only in V1."),
    reviewPolicy("prescriptionsMedicalSupplies", "ongoingHealthcare", "Prescriptions / Medical Supplies", SOURCE_POLICY_DECISIONS.NO, "Healthcare is protected/review-only in V1."),
    reviewPolicy("mentalHealthCare", "ongoingHealthcare", "Mental Health Care", SOURCE_POLICY_DECISIONS.NO, "Healthcare is protected/review-only in V1."),
    reviewPolicy("dentalVisionOrthodontics", "ongoingHealthcare", "Dental / Vision / Orthodontics", SOURCE_POLICY_DECISIONS.NO, "Healthcare is protected/review-only in V1."),

    compressiblePolicy({
      expenseTypeKey: "petFoodSupplies",
      categoryKey: "pets",
      displayName: "Pet Food & Supplies",
      conservativeFloorRatio: 0.85,
      elevatedCeilingRatio: 1.15,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "preservePetCareNeed",
      notes: "Core pet supplies are flexible only within a narrow range."
    }),
    expandablePolicy({
      expenseTypeKey: "petGroomingTraining",
      categoryKey: "pets",
      displayName: "Pet Grooming / Training",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.35,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.1,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary pet services can move; core veterinary care is excluded."
    }),
    expandablePolicy({
      expenseTypeKey: "petBoarding",
      categoryKey: "pets",
      displayName: "Pet Boarding",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.35,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.1,
      protectedFloorPolicy: "allowZero",
      notes: "Discretionary pet service range."
    }),
    reviewPolicy("veterinaryCare", "pets", "Veterinary Care", SOURCE_POLICY_DECISIONS.NO, "Core pet care is protected/review-only."),
    reviewPolicy("petMedication", "pets", "Pet Medication", SOURCE_POLICY_DECISIONS.NO, "Pet medication is protected/review-only."),

    expandablePolicy({
      expenseTypeKey: "houseCleaning",
      categoryKey: "housingExpense",
      displayName: "House Cleaning",
      conservativeFloorRatio: 0,
      elevatedCeilingRatio: 1.4,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.1,
      protectedFloorPolicy: "allowZero",
      notes: "Household service can move materially with lifestyle."
    }),
    expandablePolicy({
      expenseTypeKey: "lawnSnowPestPoolServices",
      categoryKey: "housingExpense",
      displayName: "Lawn / Snow / Pest / Pool Services",
      conservativeFloorRatio: 0.25,
      elevatedCeilingRatio: 1.35,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1.1,
      protectedFloorPolicy: "allowLowNonzero",
      notes: "Household services can be reduced or elevated within a capped range."
    }),
    expandablePolicy({
      expenseTypeKey: "dryCleaningLaundry",
      categoryKey: "personalLiving",
      displayName: "Dry Cleaning / Laundry",
      conservativeFloorRatio: 0.25,
      elevatedCeilingRatio: 1.25,
      floorTierKey: TIER_KEYS.MINIMUM,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "allowLowNonzero",
      notes: "Moderate lifestyle service range."
    }),
    expandablePolicy({
      expenseTypeKey: "personalCare",
      categoryKey: "personalLiving",
      displayName: "Personal Care / Grooming",
      conservativeFloorRatio: 0.4,
      elevatedCeilingRatio: 1.25,
      floorTierKey: TIER_KEYS.CONSERVATIVE,
      ceilingTierKey: TIER_KEYS.COMFORTABLE,
      ceilingTierMultiplier: 1,
      protectedFloorPolicy: "allowModerateReduction",
      notes: "Personal care range is moderate, not zero by default."
    }),

    reviewPolicy("tithingReligiousGiving", "givingCommunity", "Tithing / Religious Giving", SOURCE_POLICY_DECISIONS.NO, "Values-sensitive giving requires advisor/client review."),
    reviewPolicy("remittancesFamilyAssistance", "givingCommunity", "Remittances / Family Assistance", SOURCE_POLICY_DECISIONS.NO, "Values-sensitive family assistance requires review."),
    reviewPolicy("charitableGiving", "givingCommunity", "Charitable Giving", SOURCE_POLICY_DECISIONS.NO, "Charitable giving is review-only in V1."),
    reviewPolicy("weddingsFamilyEvents", "givingCommunity", "Weddings / Family Events", SOURCE_POLICY_DECISIONS.NO, "Family/values-sensitive spending requires review."),

    fixedPolicy("federalStateLocalIncomeTaxPayments", "taxes", "Federal / State / Local Income Tax Payments", SOURCE_POLICY_DECISIONS.NO, "Taxes are fixed obligations."),
    fixedPolicy("quarterlyEstimatedTaxes", "taxes", "Quarterly Estimated Taxes", SOURCE_POLICY_DECISIONS.NO, "Taxes are fixed obligations."),
    fixedPolicy("selfEmploymentTax", "taxes", "Self-Employment Tax", SOURCE_POLICY_DECISIONS.NO, "Taxes are fixed obligations."),
    fixedPolicy("taxPreparationFees", "taxes", "Tax Preparation Fees", SOURCE_POLICY_DECISIONS.NO, "Tax preparation is review-only/fixed for lifestyle slider V1."),
    fixedPolicy("taxDebtIrsPaymentPlan", "debtObligations", "Tax Debt / IRS Payment Plan", SOURCE_POLICY_DECISIONS.NO, "Tax payment plans are obligations, not lifestyle spend."),

    pauseablePolicy("homeRepairReserveContributions", "savingsGoalContributions", "Home Repair Reserve Contributions"),
    pauseablePolicy("educationSavingsContributions", "savingsGoalContributions", "Education Savings Contributions"),
    pauseablePolicy("retirementContributions", "savingsGoalContributions", "Retirement Contributions"),
    pauseablePolicy("emergencyFundContributions", "savingsGoalContributions", "Emergency Fund Contributions"),
    pauseablePolicy("brokerageInvestmentContributions", "savingsGoalContributions", "Brokerage / General Investment Contributions"),
    pauseablePolicy("vacationLifestyleGoalContributions", "savingsGoalContributions", "Vacation / Lifestyle Goal Contributions"),
    pauseablePolicy("vehicleReplacementContributions", "savingsGoalContributions", "Vehicle Replacement Contributions"),
    pauseablePolicy("sinkingFundContributions", "savingsGoalContributions", "Sinking Fund Contributions"),
    pauseablePolicy("otherGoalSavings", "savingsGoalContributions", "Other Goal Savings")
  ]);

  function clonePolicy(policy) {
    return Object.assign({}, policy);
  }

  function listLifestyleRangePolicies() {
    return householdExpenseLifestyleRangePolicyRules.map(clonePolicy);
  }

  function resolveLifestyleRangePolicy(expenseLike) {
    const source = expenseLike || {};
    const expenseTypeKey = normalizeKey(source.expenseTypeKey || source.typeKey);
    const categoryKey = normalizeKey(source.categoryKey);
    let rule = null;

    if (expenseTypeKey) {
      rule = householdExpenseLifestyleRangePolicyRules.find(function (candidate) {
        return candidate.expenseTypeKey === expenseTypeKey;
      });
    }

    if (!rule && categoryKey) {
      rule = householdExpenseLifestyleRangePolicyRules.find(function (candidate) {
        return candidate.categoryKey === categoryKey && candidate.sliderEligible === false;
      }) || householdExpenseLifestyleRangePolicyRules.find(function (candidate) {
        return candidate.categoryKey === categoryKey;
      });
    }

    return rule ? clonePolicy(rule) : null;
  }

  lensAnalysis.householdExpenseLifestyleRangePolicy = Object.freeze({
    HOUSEHOLD_EXPENSE_LIFESTYLE_RANGE_POLICY_VERSION,
    LIFESTYLE_RANGE_BEHAVIORS,
    SOURCE_POLICY_DECISIONS,
    TIER_KEYS,
    householdExpenseLifestyleRangePolicyRules,
    listLifestyleRangePolicies,
    resolveLifestyleRangePolicy
  });
})(globalThis);
