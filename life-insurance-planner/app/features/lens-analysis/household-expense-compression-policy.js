(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  const HOUSEHOLD_EXPENSE_COMPRESSION_POLICY_VERSION = 1;
  const EXPENSE_COMPRESSION_DECISIONS = Object.freeze({
    YES: "YES",
    NO: "NO",
    PAUSE: "PAUSE",
    INTERVENTION: "INTERVENTION"
  });
  const EXPENSE_COMPRESSION_ORDER_GROUPS = Object.freeze({
    dataQuality: Object.freeze({ key: "dataQuality", rank: 0 }),
    earlyDiscretionary: Object.freeze({ key: "earlyDiscretionary", rank: 1 }),
    travelLifestyle: Object.freeze({ key: "travelLifestyle", rank: 2 }),
    foodLifestyleBeforeGroceries: Object.freeze({ key: "foodLifestyleBeforeGroceries", rank: 3 }),
    pauseContributions: Object.freeze({ key: "pauseContributions", rank: 4 }),
    flexibleLifestyleServices: Object.freeze({ key: "flexibleLifestyleServices", rank: 5 }),
    flexibleEssentials: Object.freeze({ key: "flexibleEssentials", rank: 6 }),
    groceriesAndProtectedFlexibleEssentials: Object.freeze({ key: "groceriesAndProtectedFlexibleEssentials", rank: 7 }),
    transportationFlex: Object.freeze({ key: "transportationFlex", rank: 8 }),
    utilitiesBasicServices: Object.freeze({ key: "utilitiesBasicServices", rank: 9 }),
    pets: Object.freeze({ key: "pets", rank: 10 }),
    financialLeakage: Object.freeze({ key: "financialLeakage", rank: 11 }),
    healthcareProtected: Object.freeze({ key: "healthcareProtected", rank: 12 }),
    childcareAndDependentSupport: Object.freeze({ key: "childcareAndDependentSupport", rank: 13 }),
    education: Object.freeze({ key: "education", rank: 14 }),
    valuesSensitiveGiving: Object.freeze({ key: "valuesSensitiveGiving", rank: 15 }),
    protectionInsurance: Object.freeze({ key: "protectionInsurance", rank: 16 }),
    taxesAndLegal: Object.freeze({ key: "taxesAndLegal", rank: 17 }),
    debtObligations: Object.freeze({ key: "debtObligations", rank: 18 }),
    businessIncomePreserving: Object.freeze({ key: "businessIncomePreserving", rank: 19 }),
    housingProtected: Object.freeze({ key: "housingProtected", rank: 20 }),
    majorInterventions: Object.freeze({ key: "majorInterventions", rank: 21 })
  });

  function policyIdFromTypeKey(typeKey) {
    return "expense-compression-policy-" + String(typeKey || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      + "-v" + HOUSEHOLD_EXPENSE_COMPRESSION_POLICY_VERSION;
  }

  function makeRule(row) {
    const group = EXPENSE_COMPRESSION_ORDER_GROUPS[row.compressionOrderGroup];
    const decision = row.decision;
    const isYes = decision === EXPENSE_COMPRESSION_DECISIONS.YES;
    const isPause = decision === EXPENSE_COMPRESSION_DECISIONS.PAUSE;
    const isIntervention = decision === EXPENSE_COMPRESSION_DECISIONS.INTERVENTION;

    return Object.freeze({
      policyId: row.policyId || policyIdFromTypeKey(row.expenseTypeKey),
      expenseTypeKey: row.expenseTypeKey,
      displayName: row.displayName,
      behaviorClass: row.behaviorClass,
      decision,
      compressionOrderGroup: row.compressionOrderGroup,
      compressionOrderRank: group ? group.rank : null,
      compressionAction: row.compressionAction || (isYes ? "stepDown" : isPause ? "pauseContribution" : isIntervention ? "flagIntervention" : "reviewOnly"),
      maxStepPerPass: row.maxStepPerPass || (isYes ? "oneTier" : isPause ? "fullPause" : isIntervention ? "eventOnly" : "none"),
      canAutoReduce: isYes,
      requiresAdvisorConfirmation: row.requiresAdvisorConfirmation === true,
      canPause: isPause,
      canReduceToZero: row.canReduceToZero === true,
      protectedFloorPolicy: row.protectedFloorPolicy || (isYes ? "thresholdFloorIfPresent" : isPause ? "notApplicable" : "preserveCurrent"),
      projectionEffect: row.projectionEffect || (isYes ? "reduceExpense" : isPause ? "pauseContribution" : isIntervention ? "alternateScenario" : "none"),
      timelineTreatment: row.timelineTreatment || (isYes ? "expenseStepDown" : isPause ? "pauseContribution" : isIntervention ? "interventionEvent" : "reviewOnly"),
      notes: row.notes || null
    });
  }

  const YES_ROWS = Object.freeze([
    ["lotteryGamblingSpend", "Lottery / Gambling Spend", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["luxuryPurchases", "Luxury Purchases", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["gamingInAppPurchases", "Gaming / In-App Purchases", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["eventsConcertsSportingEvents", "Events / Concerts / Sporting Events", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["clubsSocialMemberships", "Clubs / Social Memberships", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["hobbiesRecreationGear", "Hobbies & Recreation Gear", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["entertainmentRecreation", "Entertainment / Recreation", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["streamingDigitalSubscriptions", "Streaming & Digital Subscriptions", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["booksMediaMusic", "Books / Media / Music", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["personalSpendingAllowance", "Personal Spending Allowance", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["miscellaneousLifestyleSpending", "Miscellaneous Lifestyle Spending", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["seasonalActivitiesRecreationPasses", "Seasonal Activities & Recreation Passes", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["tobaccoVaping", "Tobacco / Vaping", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["gymFitnessMemberships", "Gym / Fitness Memberships", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],
    ["clientEntertainment", "Client Entertainment", "discretionary", "earlyDiscretionary", { canReduceToZero: true }],

    ["vacationsTravel", "Vacations / Travel", "discretionary", "travelLifestyle", { canReduceToZero: true }],
    ["weekendShortTrips", "Weekend Trips / Short Trips", "discretionary", "travelLifestyle", { canReduceToZero: true }],
    ["lodging", "Lodging", "discretionary", "travelLifestyle", { canReduceToZero: true }],
    ["travelFoodEntertainment", "Travel Food & Entertainment", "discretionary", "travelLifestyle", { canReduceToZero: true }],
    ["travelTransportation", "Travel Transportation", "discretionary", "travelLifestyle", { canReduceToZero: true }],
    ["travelInsuranceDocumentsGear", "Travel Insurance / Documents / Gear", "discretionary", "travelLifestyle", { canReduceToZero: true }],

    ["diningTakeout", "Dining / Takeout", "discretionary", "foodLifestyleBeforeGroceries", { canReduceToZero: true }],
    ["diningOutRestaurants", "Dining Out / Restaurants", "discretionary", "foodLifestyleBeforeGroceries", { canReduceToZero: true }],
    ["takeoutConvenienceFood", "Takeout / Convenience Food", "discretionary", "foodLifestyleBeforeGroceries", { canReduceToZero: true }],
    ["mealDeliveryServices", "Meal Delivery Services", "discretionary", "foodLifestyleBeforeGroceries", { canReduceToZero: true }],
    ["groceryDeliveryFeesTips", "Grocery Delivery Fees / Tips", "discretionary", "foodLifestyleBeforeGroceries", { canReduceToZero: true }],
    ["alcoholSocialBeverages", "Alcohol / Social Beverages", "discretionary", "foodLifestyleBeforeGroceries", { canReduceToZero: true }],

    ["householdServices", "Household Services", "flexibleLifestyleService", "flexibleLifestyleServices"],
    ["lawnSnowPestPoolServices", "Lawn / Snow / Pest / Pool Services", "flexibleLifestyleService", "flexibleLifestyleServices"],
    ["dryCleaningLaundry", "Dry Cleaning / Laundry", "flexibleLifestyleService", "flexibleLifestyleServices"],
    ["houseCleaning", "House Cleaning", "flexibleLifestyleService", "flexibleLifestyleServices"],
    ["cableTv", "Cable TV", "flexibleLifestyleService", "flexibleLifestyleServices", { canReduceToZero: true }],
    ["streamingInternetBundle", "Streaming / Internet Bundle", "flexibleLifestyleService", "flexibleLifestyleServices"],
    ["personalCare", "Personal Care / Grooming", "flexibleLifestyleService", "flexibleLifestyleServices"],
    ["homeOrganizationDecor", "Home Organization / Decor", "flexibleLifestyleService", "flexibleLifestyleServices", { canReduceToZero: true }],
    ["furnitureHomeGoods", "Furniture / Home Goods", "flexibleLifestyleService", "flexibleLifestyleServices"],

    ["electronicsReplacement", "Electronics Replacement", "flexibleEssential", "flexibleEssentials"],
    ["childrensClothing", "Children's Clothing", "flexibleEssential", "flexibleEssentials"],
    ["schoolLunches", "School Lunches", "flexibleEssential", "flexibleEssentials"],
    ["extracurricularLessonsActivities", "Extracurricular Lessons & Activities", "flexibleEssential", "flexibleEssentials"],
    ["youthSportsTravelSports", "Youth Sports / Travel Sports", "flexibleEssential", "flexibleEssentials"],
    ["personalHygieneProducts", "Personal Hygiene Products", "flexibleEssential", "flexibleEssentials"],
    ["shoesBasicClothing", "Basic Clothing / Shoes", "flexibleEssential", "flexibleEssentials"],

    ["householdConsumablesSupplies", "Household Consumables & Supplies", "protectedFlexibleEssential", "groceriesAndProtectedFlexibleEssentials", { protectedFloorPolicy: "useThresholdProtectedFloor" }],
    ["groceries", "Groceries", "protectedFlexibleEssential", "groceriesAndProtectedFlexibleEssentials", { protectedFloorPolicy: "useThresholdProtectedFloor", notes: "Late one-tier step-down only; dining, takeout, travel, and lifestyle rows come first." }],

    ["fuel", "Fuel", "transportationFlexible", "transportationFlex"],
    ["publicTransit", "Public Transit", "transportationFlexible", "transportationFlex"],
    ["rideshareTaxi", "Rideshare / Taxi", "transportationFlexible", "transportationFlex"],

    ["internet", "Internet", "basicUtilityService", "utilitiesBasicServices"],
    ["mobilePhone", "Mobile Phone", "basicUtilityService", "utilitiesBasicServices"],

    ["petFoodSupplies", "Pet Food & Supplies", "petCare", "pets"],
    ["petGroomingTraining", "Pet Grooming / Training", "petCare", "pets"],
    ["petBoarding", "Pet Boarding", "petCare", "pets"],

    ["overdraftFees", "Overdraft Fees", "financialLeakage", "financialLeakage", { canReduceToZero: true }],
    ["creditMonitoringIdentityProtection", "Credit Monitoring / Identity Protection", "financialLeakage", "financialLeakage"],
    ["bankFees", "Bank Fees", "financialLeakage", "financialLeakage", { canReduceToZero: true }],
    ["atmCheckCashingMoneyOrderFees", "ATM / Check Cashing / Money Order Fees", "financialLeakage", "financialLeakage", { canReduceToZero: true }],

    ["giftsHolidaysCelebrations", "Gifts / Holidays / Celebrations", "valuesSensitiveFlexible", "valuesSensitiveGiving"]
  ]);

  const PAUSE_ROWS = Object.freeze([
    ["homeRepairReserveContributions", "Home Repair Reserve Contributions"],
    ["educationSavingsContributions", "Education Savings Contributions"],
    ["retirementContributions", "Retirement Contributions"],
    ["emergencyFundContributions", "Emergency Fund Contributions"],
    ["brokerageInvestmentContributions", "Brokerage / General Investment Contributions"],
    ["vacationLifestyleGoalContributions", "Vacation / Lifestyle Goal Contributions"],
    ["vehicleReplacementContributions", "Vehicle Replacement Contributions"],
    ["sinkingFundContributions", "Sinking Fund Contributions"],
    ["otherGoalSavings", "Other Goal Savings"]
  ]);

  const NO_ROWS = Object.freeze([
    ["timeshareVacationClubFees", "Timeshare / Vacation Club Fees", "contractualLifestyle", "travelLifestyle"],
    ["hsaContributions", "HSA Contributions", "healthcareProtected", "healthcareProtected"],
    ["specialtyDietAllergyFoodPremium", "Specialty Diet / Allergy Food Premium", "healthcareProtected", "healthcareProtected"],
    ["diapersBabySupplies", "Diapers / Baby Supplies", "dependentEssential", "childcareAndDependentSupport"],
    ["formulaInfantSupplies", "Formula / Infant Supplies", "dependentEssential", "childcareAndDependentSupport"],
    ["parkingTollsCommuting", "Parking / Tolls / Commuting", "transportationProtected", "transportationFlex"],
    ["vehicleMaintenance", "Vehicle Maintenance & Repairs", "transportationProtected", "transportationFlex"],
    ["tiresMajorAutoRepair", "Tires / Major Auto Repair", "transportationProtected", "transportationFlex"],
    ["registrationInspectionEmissions", "Registration / Inspection / Emissions", "transportationProtected", "transportationFlex"],
    ["autoInsurance", "Auto Insurance", "transportationProtected", "transportationFlex"],
    ["electricity", "Electricity", "basicUtilityService", "utilitiesBasicServices"],
    ["gasHeatingFuelPropaneOil", "Gas / Heating Fuel / Propane / Oil", "basicUtilityService", "utilitiesBasicServices"],
    ["waterSewer", "Water / Sewer", "basicUtilityService", "utilitiesBasicServices"],
    ["trashRecycling", "Trash / Recycling", "basicUtilityService", "utilitiesBasicServices"],
    ["veterinaryCare", "Veterinary Care", "petCareProtected", "pets"],
    ["petMedication", "Pet Medication", "petCareProtected", "pets"],
    ["healthInsurancePremiums", "Health Insurance Premiums", "healthcareProtected", "healthcareProtected"],
    ["copaysCoinsurance", "Copays / Coinsurance", "healthcareProtected", "healthcareProtected"],
    ["prescriptionsMedicalSupplies", "Prescriptions / Medical Supplies", "healthcareProtected", "healthcareProtected"],
    ["chronicConditionSupplies", "Chronic Condition Supplies", "healthcareProtected", "healthcareProtected"],
    ["mentalHealthCare", "Mental Health Care", "healthcareProtected", "healthcareProtected"],
    ["dentalVisionOrthodontics", "Dental / Vision / Orthodontics", "healthcareProtected", "healthcareProtected"],
    ["medicalTravel", "Medical Travel", "healthcareProtected", "healthcareProtected"],
    ["daycareChildcare", "Daycare / Childcare", "dependentEssential", "childcareAndDependentSupport"],
    ["nannyInHomeChildcare", "Nanny / In-Home Childcare", "dependentEssential", "childcareAndDependentSupport"],
    ["afterSchoolCare", "After-School Care", "dependentEssential", "childcareAndDependentSupport"],
    ["elderCareSupport", "Elder Care Support", "dependentEssential", "childcareAndDependentSupport"],
    ["parentAdultChildSupport", "Parent / Adult Child Support", "dependentEssential", "childcareAndDependentSupport"],
    ["specialNeedsNonmedicalSupport", "Special Needs Nonmedical Support", "dependentEssential", "childcareAndDependentSupport"],
    ["disabilitySupportServices", "Disability Support Services", "dependentEssential", "childcareAndDependentSupport"],
    ["educationEnrichment", "Education & Enrichment", "educationProtected", "education"],
    ["privateSchoolTuition", "Private School Tuition", "educationProtected", "education"],
    ["collegeTuition", "College Tuition", "educationProtected", "education"],
    ["collegeRoomBoard", "College Room & Board", "educationProtected", "education"],
    ["collegeBooksFees", "College Books / Fees", "educationProtected", "education"],
    ["schoolFeesUniforms", "School Fees / Uniforms", "educationProtected", "education"],
    ["activityFieldTripFees", "Activity / Field Trip Fees", "educationProtected", "education"],
    ["specialEducationServices", "Special Education Services", "educationProtected", "education"],
    ["tithingReligiousGiving", "Tithing / Religious Giving", "valuesSensitiveGiving", "valuesSensitiveGiving"],
    ["remittancesFamilyAssistance", "Remittances / Family Assistance", "valuesSensitiveGiving", "valuesSensitiveGiving"],
    ["charitableGiving", "Charitable Giving", "valuesSensitiveGiving", "valuesSensitiveGiving"],
    ["weddingsFamilyEvents", "Weddings / Family Events", "valuesSensitiveGiving", "valuesSensitiveGiving"],
    ["lifeInsurancePremiums", "Life Insurance Premiums", "protectionInsurance", "protectionInsurance"],
    ["termLifePremiums", "Term Life Premiums", "protectionInsurance", "protectionInsurance"],
    ["permanentLifePremiums", "Whole Life / Permanent Life Premiums", "protectionInsurance", "protectionInsurance"],
    ["disabilityInsurancePremiums", "Disability Insurance Premiums", "protectionInsurance", "protectionInsurance"],
    ["longTermCareInsurance", "Long-Term Care Insurance", "protectionInsurance", "protectionInsurance"],
    ["umbrellaInsurance", "Umbrella Insurance", "protectionInsurance", "protectionInsurance"],
    ["federalStateLocalIncomeTaxPayments", "Federal / State / Local Income Tax Payments", "taxLegalObligation", "taxesAndLegal"],
    ["quarterlyEstimatedTaxes", "Quarterly Estimated Taxes", "taxLegalObligation", "taxesAndLegal"],
    ["selfEmploymentTax", "Self-Employment Tax", "taxLegalObligation", "taxesAndLegal"],
    ["taxDebtIrsPaymentPlan", "Tax Debt / IRS Payment Plan", "taxLegalObligation", "taxesAndLegal"],
    ["taxPreparationFees", "Tax Preparation Fees", "taxLegalObligation", "taxesAndLegal"],
    ["legalFeesCourtFees", "Legal Fees / Court Fees", "taxLegalObligation", "taxesAndLegal"],
    ["creditCardMinimumPayment", "Credit Card Minimum Payment", "debtObligation", "debtObligations"],
    ["autoLoanPayment", "Auto Loan Payment", "debtObligation", "debtObligations"],
    ["autoLeasePayment", "Auto Lease Payment", "debtObligation", "debtObligations"],
    ["studentLoanPayment", "Student Loan Payment", "debtObligation", "debtObligations"],
    ["personalLoanPayment", "Personal Loan Payment", "debtObligation", "debtObligations"],
    ["medicalDebtPayment", "Medical Debt Payment", "debtObligation", "debtObligations"],
    ["businessDebtPayment", "Business Debt Payment", "debtObligation", "debtObligations"],
    ["otherDebtPayment", "Other Debt Payment", "debtObligation", "debtObligations"],
    ["businessInsuranceProfessionalLiability", "Business Insurance / Professional Liability", "businessIncomePreserving", "businessIncomePreserving"],
    ["softwareSaasWebsiteHosting", "Software / SaaS / Website / Hosting", "businessIncomePreserving", "businessIncomePreserving"],
    ["marketingAdvertising", "Marketing / Advertising", "businessIncomePreserving", "businessIncomePreserving"],
    ["contractorPayrollCosts", "Contractor / Payroll Costs", "businessIncomePreserving", "businessIncomePreserving"],
    ["propertyTaxes", "Property Taxes", "housingProtected", "housingProtected"],
    ["homeRentersInsurance", "Homeowners / Renters Insurance", "housingProtected", "housingProtected"],
    ["hoaAssessments", "HOA / Assessments", "housingProtected", "housingProtected"]
  ]);

  const INTERVENTION_ROWS = Object.freeze([
    ["rentOrMortgagePayment", "Housing Payment / Rent / Mortgage", "housingIntervention", "housingProtected", "alternateScenario", "interventionEvent"],
    ["movingTemporaryHousingCosts", "Moving / Temporary Housing Costs", "housingIntervention", "majorInterventions", "alternateScenario", "interventionEvent"],
    ["vehicleSaleCandidate", "Vehicle Sale Candidate", "transportationIntervention", "majorInterventions", "alternateScenario", "interventionEvent"],
    ["housingDecisionWindow", "Housing Decision Window", "housingIntervention", "majorInterventions", "alternateScenario", "interventionEvent"],
    ["educationGoalReduction", "Education Goal Reduction", "educationIntervention", "majorInterventions", "alternateScenario", "interventionEvent"],
    ["survivorReturnToWork", "Survivor Return-To-Work", "incomeIntervention", "majorInterventions", "alternateScenario", "interventionEvent"],
    ["debtRestructuringDefaultRisk", "Debt Restructuring / Default Risk", "debtIntervention", "majorInterventions", "alternateScenario", "interventionEvent"],
    ["financialCrisisProtectedEssentialsUnfunded", "Financial Crisis / Protected Essentials Unfunded", "crisisState", "majorInterventions", "crisisMarker", "crisisState"]
  ]);

  const householdExpenseCompressionPolicyRules = Object.freeze([
    ...YES_ROWS.map(function (row) {
      const options = row[4] || {};
      return makeRule(Object.assign({}, options, {
        expenseTypeKey: row[0],
        displayName: row[1],
        behaviorClass: row[2],
        decision: EXPENSE_COMPRESSION_DECISIONS.YES,
        compressionOrderGroup: row[3]
      }));
    }),
    ...PAUSE_ROWS.map(function (row) {
      return makeRule({
        expenseTypeKey: row[0],
        displayName: row[1],
        behaviorClass: "savingsContribution",
        decision: EXPENSE_COMPRESSION_DECISIONS.PAUSE,
        compressionOrderGroup: "pauseContributions",
        projectionEffect: "pauseContribution",
        notes: "Contribution pause candidate; does not spend or reduce existing assets."
      });
    }),
    ...NO_ROWS.map(function (row) {
      return makeRule({
        expenseTypeKey: row[0],
        displayName: row[1],
        behaviorClass: row[2],
        decision: EXPENSE_COMPRESSION_DECISIONS.NO,
        compressionOrderGroup: row[3],
        notes: "Deterministic review-only policy row; not an automatic expense cut."
      });
    }),
    ...INTERVENTION_ROWS.map(function (row) {
      return makeRule({
        expenseTypeKey: row[0],
        displayName: row[1],
        behaviorClass: row[2],
        decision: EXPENSE_COMPRESSION_DECISIONS.INTERVENTION,
        compressionOrderGroup: row[3],
        projectionEffect: row[4],
        timelineTreatment: row[5],
        protectedFloorPolicy: "notApplicable",
        notes: "Future timeline intervention marker; not an expense step-down."
      });
    })
  ]);

  function cloneRule(rule) {
    return Object.assign({}, rule);
  }

  function getHouseholdExpenseCompressionPolicyRules() {
    return householdExpenseCompressionPolicyRules.map(cloneRule);
  }

  function getHouseholdExpenseCompressionPolicyByExpenseType(expenseTypeKey) {
    const normalizedTypeKey = String(expenseTypeKey == null ? "" : expenseTypeKey).trim();
    if (!normalizedTypeKey) {
      return null;
    }

    const rule = householdExpenseCompressionPolicyRules.find(function (candidate) {
      return candidate.expenseTypeKey === normalizedTypeKey;
    });
    return rule ? cloneRule(rule) : null;
  }

  function getHouseholdExpenseCompressionPoliciesByDecision(decision) {
    const normalizedDecision = String(decision == null ? "" : decision).trim();
    return householdExpenseCompressionPolicyRules
      .filter(function (rule) {
        return rule.decision === normalizedDecision;
      })
      .map(cloneRule);
  }

  lensAnalysis.householdExpenseCompressionPolicy = Object.freeze({
    HOUSEHOLD_EXPENSE_COMPRESSION_POLICY_VERSION,
    EXPENSE_COMPRESSION_DECISIONS,
    EXPENSE_COMPRESSION_ORDER_GROUPS,
    householdExpenseCompressionPolicyRules,
    getHouseholdExpenseCompressionPolicyRules,
    getHouseholdExpenseCompressionPolicyByExpenseType,
    getHouseholdExpenseCompressionPoliciesByDecision
  });
})(globalThis);
