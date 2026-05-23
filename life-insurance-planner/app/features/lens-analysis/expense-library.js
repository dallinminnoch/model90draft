(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis expense library metadata.
  // Purpose: define searchable raw expense types that future PMI
  // expenseRecords[] rows can use. Runtime behavior stays outside this
  // metadata module.

  const EXPENSE_UI_AVAILABILITY_VALUES = Object.freeze(["initial", "advanced", "future"]);
  const EXPENSE_CONTINUATION_STATUS_VALUES = Object.freeze(["continues", "stops", "review"]);
  const EXPENSE_DEFAULT_NEED_TYPE_VALUES = Object.freeze([
    "protectedEssential",
    "flexibleEssential",
    "discretionary",
    "savingsContribution",
    "debtObligation",
    "legalObligation",
    "businessIncomePreserving",
    "finalExpense",
    "custom",
    "rawReview"
  ]);
  const EXPENSE_PRIORITY_CLASS_VALUES = Object.freeze([
    "protected",
    "essential",
    "flexible",
    "discretionary",
    "pauseCandidate",
    "generated",
    "rawReview"
  ]);
  const EXPENSE_COMPRESSION_TIER_VALUES = Object.freeze([
    "none",
    "advisorConfirmed",
    "late",
    "medium",
    "early",
    "pauseCandidate",
    "generatedOnly",
    "rawReview"
  ]);
  const EXPENSE_INFLATION_BUCKET_KEYS = Object.freeze([
    "householdExpenseInflation",
    "generalInflation",
    "healthcareInflation",
    "finalExpenseInflation",
    "educationInflation",
    "noInflationCurrentDollar"
  ]);
  const EXPENSE_LIFESTYLE_TREATMENT_REASONS = Object.freeze([
    "lifestyleFlexible",
    "pauseableGoalContribution",
    "protectedNeed",
    "contractualObligation",
    "legalTax",
    "sourceOwnedDebt",
    "sourceOwnedFinalExpense",
    "sourceOwnedHealthcare",
    "sourceOwnedEducation",
    "valuesBased",
    "businessOrIncomePreserving",
    "unknownExcluded"
  ]);
  const COMMON_EXPENSE_RECORD_SOURCE_FIELDS = Object.freeze([
    Object.freeze({
      typeKey: "householdInsurancePremiums",
      ongoingSupportField: "monthlyOtherInsuranceCost"
    }),
    Object.freeze({
      typeKey: "medicalOutOfPocket",
      ongoingSupportField: "monthlyHealthcareOutOfPocketCost",
      expenseFactCategoryKey: "otherLivingExpense",
      compressionCategoryKey: "ongoingHealthcare"
    }),
    Object.freeze({
      typeKey: "groceries",
      ongoingSupportField: "monthlyFoodCost"
    }),
    Object.freeze({
      typeKey: "householdTransportation",
      ongoingSupportField: "monthlyTransportationCost"
    }),
    Object.freeze({
      typeKey: "childcareExpense",
      ongoingSupportField: "monthlyChildcareAndDependentCareCost"
    }),
    Object.freeze({
      typeKey: "internetPhone",
      ongoingSupportField: "monthlyPhoneAndInternetCost"
    }),
    Object.freeze({
      typeKey: "householdConsumablesSupplies",
      ongoingSupportField: "monthlyHouseholdSuppliesCost"
    }),
    Object.freeze({
      typeKey: "entertainmentRecreation",
      ongoingSupportField: "monthlyTravelAndDiscretionaryCost"
    }),
    Object.freeze({
      typeKey: "recurringPersonalSpendingDefault",
      ongoingSupportField: "monthlySubscriptionsCost"
    })
  ]);
  const COMMON_EXPENSE_RECORD_SOURCE_FIELD_BY_TYPE_KEY = Object.freeze(
    COMMON_EXPENSE_RECORD_SOURCE_FIELDS.reduce(function (map, field) {
      map[field.typeKey] = field;
      return map;
    }, {})
  );
  const EXPENSE_PLANNING_BUCKETS = Object.freeze([
    Object.freeze({
      planningBucketKey: "finalExpenses",
      planningBucketLabel: "Final Expenses",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedFinalExpense",
      inflationBucketKey: "finalExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "healthcareCare",
      planningBucketLabel: "Healthcare Care",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedHealthcare",
      inflationBucketKey: "healthcareInflation"
    }),
    Object.freeze({
      planningBucketKey: "housingCore",
      planningBucketLabel: "Housing",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "protectedNeed",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "basicUtilities",
      planningBucketLabel: "Basic Utilities",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "protectedNeed",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "communicationsConnectivity",
      planningBucketLabel: "Communications & Connectivity",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "foodAtHomeConsumables",
      planningBucketLabel: "Food at Home / Consumables",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "householdConsumables",
      planningBucketLabel: "Household Consumables",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "diningTakeout",
      planningBucketLabel: "Dining / Takeout",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "transportationBasics",
      planningBucketLabel: "Transportation Basics",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "vehicleOwnershipMaintenance",
      planningBucketLabel: "Vehicle Ownership / Maintenance",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "contractualObligation",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "insurancePremiums",
      planningBucketLabel: "Insurance Premiums",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "contractualObligation",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "childcareDependentSupport",
      planningBucketLabel: "Childcare & Dependent Support",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "protectedNeed",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "educationEnrichment",
      planningBucketLabel: "Education & Enrichment",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedEducation",
      inflationBucketKey: "educationInflation"
    }),
    Object.freeze({
      planningBucketKey: "personalLivingClothing",
      planningBucketLabel: "Personal Living / Clothing",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "householdServices",
      planningBucketLabel: "Household Services",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "subscriptionsMemberships",
      planningBucketLabel: "Subscriptions / Memberships",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "entertainmentRecreation",
      planningBucketLabel: "Entertainment / Recreation",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "travelVacations",
      planningBucketLabel: "Travel / Vacations",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "petsCoreCare",
      planningBucketLabel: "Pet Core Care",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "protectedNeed",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "petsDiscretionary",
      planningBucketLabel: "Pet Discretionary",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "lifestyleFlexible",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "givingCommunity",
      planningBucketLabel: "Giving / Community",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "valuesBased",
      inflationBucketKey: "householdExpenseInflation"
    }),
    Object.freeze({
      planningBucketKey: "taxesLegalAdministrative",
      planningBucketLabel: "Taxes / Legal / Administrative",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "legalTax",
      inflationBucketKey: "noInflationCurrentDollar"
    }),
    Object.freeze({
      planningBucketKey: "debtObligations",
      planningBucketLabel: "Debt Obligations",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "sourceOwnedDebt",
      inflationBucketKey: "noInflationCurrentDollar"
    }),
    Object.freeze({
      planningBucketKey: "savingsGoalContributions",
      planningBucketLabel: "Savings / Goal Contributions",
      lifestyleTreatmentIncluded: true,
      lifestyleTreatmentReason: "pauseableGoalContribution",
      inflationBucketKey: "noInflationCurrentDollar"
    }),
    Object.freeze({
      planningBucketKey: "businessSelfEmployment",
      planningBucketLabel: "Business / Self-Employment",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "businessOrIncomePreserving",
      inflationBucketKey: "generalInflation"
    }),
    Object.freeze({
      planningBucketKey: "financialFeesTransactionCosts",
      planningBucketLabel: "Financial Fees / Transaction Costs",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "unknownExcluded",
      inflationBucketKey: "noInflationCurrentDollar"
    }),
    Object.freeze({
      planningBucketKey: "periodicSinkingFundOneTime",
      planningBucketLabel: "Periodic / Sinking Fund / One-Time",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "unknownExcluded",
      inflationBucketKey: "noInflationCurrentDollar"
    }),
    Object.freeze({
      planningBucketKey: "customUnknown",
      planningBucketLabel: "Custom / Unknown",
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "unknownExcluded",
      inflationBucketKey: "noInflationCurrentDollar"
    })
  ]);
  const EXPENSE_PLANNING_BUCKET_KEYS = Object.freeze(
    EXPENSE_PLANNING_BUCKETS.map(function (bucket) {
      return bucket.planningBucketKey;
    })
  );
  const EXPENSE_PLANNING_BUCKETS_BY_KEY = Object.freeze(
    EXPENSE_PLANNING_BUCKETS.reduce(function (bucketMap, bucket) {
      bucketMap[bucket.planningBucketKey] = bucket;
      return bucketMap;
    }, {})
  );

  const EXPENSE_UI_AVAILABILITY_BY_TYPE_KEY = Object.freeze({
    funeralBurialEstimate: "future",
    medicalEndOfLifeCosts: "future",
    estateSettlementCosts: "future",
    otherFinalExpenses: "future",

    healthInsurancePremiums: "initial",
    medicarePartBPremiums: "initial",
    medicarePartDPremiums: "initial",
    medigapPremiums: "initial",
    medicareAdvantagePremiums: "initial",
    cobraPremiums: "initial",
    hsaContributions: "future",
    medicalOutOfPocket: "initial",
    healthcareOutOfPocketSupportDefault: "future",
    prescriptionMedications: "initial",
    specialistVisits: "initial",
    therapyCounseling: "initial",
    psychiatricMedicationManagement: "initial",
    inpatientMentalHealthCare: "advanced",
    physicalTherapy: "initial",
    dentalInsurance: "initial",
    dentalOutOfPocket: "initial",
    orthodontics: "initial",
    majorDentalWork: "initial",
    denturesImplants: "initial",
    visionInsurance: "initial",
    visionOutOfPocket: "initial",
    glassesContacts: "initial",
    eyeSurgery: "initial",
    hearingAidsAudiology: "initial",
    durableMedicalEquipment: "initial",
    adaptiveHomeModification: "initial",
    mobilityVehicleModification: "initial",
    mobilityAids: "initial",
    homeHealthAide: "initial",
    medicalAlertMonitoring: "initial",
    longTermCareInsurancePremiums: "initial",
    nursingCare: "advanced",
    assistedLiving: "advanced",
    memoryCare: "advanced",
    adultDayCare: "initial",
    respiteCare: "initial",
    specialNeedsCare: "initial",
    hospiceCare: "future",
    hospitalFinalBill: "future",
    endOfLifePrescriptionCosts: "future",
    otherHealthcareExpense: "initial",

    cremation: "future",
    burialPlot: "future",
    headstoneMarker: "future",
    memorialService: "future",
    obituaryDeathCertificates: "future",
    travelForFamilyFinalArrangements: "future",
    probateAttorney: "future",
    executorFees: "future",
    finalTaxPreparation: "future",
    estateAdministrationCosts: "future",

    rentOrMortgagePayment: "initial",
    propertyTaxes: "initial",
    monthlyPropertyTaxDefault: "future",
    homeownersInsurance: "initial",
    housingInsuranceDefault: "future",
    homeMaintenanceRepairs: "initial",
    monthlyHomeMaintenanceDefault: "future",
    hoaDues: "initial",
    propertyAssessments: "initial",
    householdUtilities: "initial",
    internetPhone: "initial",
    groceries: "initial",
    diningTakeout: "initial",
    transportationFuel: "initial",
    householdTransportation: "future",
    vehicleInsurance: "initial",
    vehicleMaintenance: "initial",
    householdInsurancePremiums: "future",
    rentersInsurance: "initial",
    umbrellaInsurance: "initial",
    disabilityInsurancePremiums: "initial",
    lifeInsurancePremiums: "future",
    petInsurance: "initial",
    childcareExpense: "initial",
    dependentSupportExpense: "initial",
    personalCare: "initial",
    householdSupplies: "initial",
    clothing: "initial",
    subscriptionsMemberships: "initial",
    householdServices: "initial",
    recurringPersonalSpendingDefault: "future",
    discretionaryTravelEntertainment: "future",
    otherHouseholdExpenseDefault: "future",
    petCare: "initial",

    educationEnrichment: "initial",
    privateSchoolTuition: "initial",
    tutoring: "initial",
    collegeApplicationTesting: "advanced",
    schoolSupplies: "initial",
    childActivitiesSports: "initial",
    earlyEducationChildcare: "initial",

    businessOverheadRent: "future",
    businessPayrollCoverage: "future",
    professionalLicensingFees: "future",
    professionalAdvisorFees: "future",
    keyPersonRecruitingReplacement: "future",

    customExpenseRecord: "initial"
  });

  const DEFAULT_CONTINUATION_STATUS_BY_TYPE_KEY = Object.freeze({
    funeralBurialEstimate: "continues",
    medicalEndOfLifeCosts: "continues",
    estateSettlementCosts: "continues",
    otherFinalExpenses: "continues",

    rentOrMortgagePayment: "continues",
    propertyTaxes: "continues",
    homeownersInsurance: "continues",
    homeMaintenanceRepairs: "continues",
    hoaDues: "continues",
    propertyAssessments: "continues",
    householdUtilities: "continues",
    internetPhone: "continues",
    groceries: "continues",
    householdSupplies: "continues",
    diningTakeout: "review",
    childcareExpense: "continues",
    dependentSupportExpense: "continues",
    otherHouseholdExpenseDefault: "continues",
    housingInsuranceDefault: "continues",
    monthlyPropertyTaxDefault: "continues",
    monthlyHomeMaintenanceDefault: "continues",

    transportationFuel: "review",
    householdTransportation: "review",
    vehicleInsurance: "review",
    vehicleMaintenance: "review",
    householdInsurancePremiums: "review",
    rentersInsurance: "review",
    umbrellaInsurance: "review",
    petInsurance: "review",
    disabilityInsurancePremiums: "stops",
    lifeInsurancePremiums: "stops",
    personalCare: "review",
    clothing: "review",
    subscriptionsMemberships: "review",
    householdServices: "review",
    recurringPersonalSpendingDefault: "review",
    discretionaryTravelEntertainment: "review",
    petCare: "review",

    educationEnrichment: "continues",
    privateSchoolTuition: "continues",
    tutoring: "continues",
    collegeApplicationTesting: "continues",
    schoolSupplies: "continues",
    childActivitiesSports: "continues",
    earlyEducationChildcare: "continues",

    businessOverheadRent: "review",
    businessPayrollCoverage: "review",
    professionalLicensingFees: "review",
    professionalAdvisorFees: "review",
    keyPersonRecruitingReplacement: "review",
    customExpenseRecord: "review"
  });

  const PROTECTED_SCALAR_EXPENSE_OPTIONS = Object.freeze({
    funeralBurialEstimate: Object.freeze({
      isDefaultExpense: true,
      isScalarFieldOwned: true,
      isProtected: true,
      isAddable: false,
      ownedByField: "funeralBurialEstimate",
      sourcePath: "protectionModeling.data.funeralBurialEstimate",
      duplicateProtection: "funeralBurialEstimate-remains-single-source"
    }),
    medicalEndOfLifeCosts: Object.freeze({
      isDefaultExpense: true,
      isScalarFieldOwned: true,
      isProtected: true,
      isAddable: false,
      ownedByField: "medicalEndOfLifeCosts",
      sourcePath: "protectionModeling.data.medicalEndOfLifeCosts",
      duplicateProtection: "medicalEndOfLifeCosts-remains-single-source"
    }),
    estateSettlementCosts: Object.freeze({
      isDefaultExpense: true,
      isScalarFieldOwned: true,
      isProtected: true,
      isAddable: false,
      ownedByField: "estateSettlementCosts",
      sourcePath: "protectionModeling.data.estateSettlementCosts",
      duplicateProtection: "estateSettlementCosts-remains-single-source"
    }),
    otherFinalExpenses: Object.freeze({
      isDefaultExpense: true,
      isScalarFieldOwned: true,
      isProtected: true,
      isAddable: false,
      ownedByField: "otherFinalExpenses",
      sourcePath: "protectionModeling.data.otherFinalExpenses",
      duplicateProtection: "otherFinalExpenses-remains-single-source"
    })
  });

  const RAW_EXPENSE_LIBRARY_ENTRIES = Object.freeze([
    ["funeralBurialEstimate", "Funeral / Burial Estimate", "funeralBurial", "Scalar-owned funeral and burial estimate from the current PMI final expenses section.", "funeral|burial|cremation|final expense", "oneTime", "oneTime", PROTECTED_SCALAR_EXPENSE_OPTIONS.funeralBurialEstimate],
    ["medicalEndOfLifeCosts", "Medical End-of-Life Costs", "medicalFinalExpense", "Scalar-owned medical end-of-life cost estimate from the current PMI final expenses section.", "medical final expense|end of life|hospital|hospice", "oneTime", "oneTime", PROTECTED_SCALAR_EXPENSE_OPTIONS.medicalEndOfLifeCosts],
    ["estateSettlementCosts", "Estate Settlement Costs", "estateSettlement", "Scalar-owned estate settlement cost estimate from the current PMI final expenses section.", "estate|settlement|probate|executor", "oneTime", "oneTime", PROTECTED_SCALAR_EXPENSE_OPTIONS.estateSettlementCosts],
    ["otherFinalExpenses", "Other Final Expenses", "otherFinalExpense", "Scalar-owned other final expense amount from the current PMI final expenses section.", "other final expense|misc final expense", "oneTime", "oneTime", PROTECTED_SCALAR_EXPENSE_OPTIONS.otherFinalExpenses],

    ["healthInsurancePremiums", "Health Insurance Premiums", "ongoingHealthcare", "Recurring health insurance premium expense.", "health insurance|medical premium|premium", "monthly", "ongoing"],
    ["medicarePartBPremiums", "Medicare Part B Premiums", "ongoingHealthcare", "Recurring Medicare Part B premium expense.", "medicare part b|medicare premiums|medical insurance", "monthly", "ongoing"],
    ["medicarePartDPremiums", "Medicare Part D Premiums", "ongoingHealthcare", "Recurring Medicare Part D prescription drug premium expense.", "medicare part d|drug plan|prescription coverage", "monthly", "ongoing"],
    ["medigapPremiums", "Medigap Premiums", "ongoingHealthcare", "Recurring Medicare supplement premium expense.", "medigap|medicare supplement|supplemental medicare", "monthly", "ongoing"],
    ["medicareAdvantagePremiums", "Medicare Advantage Premiums", "ongoingHealthcare", "Recurring Medicare Advantage plan premium expense.", "medicare advantage|part c|advantage plan", "monthly", "ongoing"],
    ["cobraPremiums", "COBRA Premiums", "ongoingHealthcare", "Temporary COBRA health insurance premium expense.", "cobra|temporary health coverage|continuation coverage", "monthly", "fixedYears", { suggestedTermYears: 1 }],
    ["hsaContributions", "HSA Contributions", "ongoingHealthcare", "Recurring health savings account contribution expense.", "hsa|health savings account|medical savings", "monthly", "ongoing"],
    ["medicalOutOfPocket", "Medical Out-of-Pocket", "ongoingHealthcare", "Recurring medical out-of-pocket expense.", "medical out of pocket|copay|deductible|coinsurance", "monthly", "ongoing"],
    ["healthcareOutOfPocketSupportDefault", "Healthcare / Out-of-Pocket Medical", "ongoingHealthcare", "Legacy alias for broad household healthcare and out-of-pocket medical support.", "healthcare out of pocket|medical out of pocket|support healthcare|copay|deductible", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "review" }],
    ["prescriptionMedications", "Prescription Medications", "ongoingHealthcare", "Recurring prescription medication expense.", "prescriptions|medications|pharmacy", "monthly", "ongoing"],
    ["specialistVisits", "Specialist Visits", "ongoingHealthcare", "Recurring or periodic medical specialist visit expense.", "specialist|doctor visit|provider visit", "quarterly", "ongoing"],
    ["therapyCounseling", "Therapy / Counseling", "mentalHealthCare", "Recurring therapy, counseling, or mental health care expense.", "therapy|counseling|mental health|behavioral health", "monthly", "ongoing"],
    ["psychiatricMedicationManagement", "Psychiatric Medication Management", "mentalHealthCare", "Recurring psychiatric medication management or behavioral health provider expense.", "psychiatry|medication management|behavioral health", "monthly", "ongoing"],
    ["inpatientMentalHealthCare", "Inpatient Mental Health Care", "mentalHealthCare", "Inpatient or intensive mental health care expense.", "inpatient mental health|psychiatric facility|intensive care", "oneTime", "oneTime"],
    ["physicalTherapy", "Physical Therapy", "ongoingHealthcare", "Physical therapy or rehabilitative care expense.", "physical therapy|rehab|rehabilitation", "monthly", "fixedYears", { suggestedTermYears: 1 }],
    ["dentalInsurance", "Dental Insurance", "dentalCare", "Recurring dental insurance premium expense.", "dental insurance|dental premium", "monthly", "ongoing"],
    ["dentalOutOfPocket", "Dental Out-of-Pocket", "dentalCare", "Routine or recurring dental out-of-pocket expense.", "dental out of pocket|dentist|dental care", "annual", "ongoing"],
    ["orthodontics", "Orthodontics", "dentalCare", "Orthodontic care expense.", "orthodontics|braces|aligners", "monthly", "fixedYears", { suggestedTermYears: 2 }],
    ["majorDentalWork", "Major Dental Work", "dentalCare", "One-time major dental work expense.", "major dental|root canal|crowns|oral surgery", "oneTime", "oneTime"],
    ["denturesImplants", "Dentures / Implants", "dentalCare", "One-time dentures, dental implant, or restorative dental expense.", "dentures|implants|restorative dental", "oneTime", "oneTime"],
    ["visionInsurance", "Vision Insurance", "visionCare", "Recurring vision insurance premium expense.", "vision insurance|eye insurance|vision premium", "monthly", "ongoing"],
    ["visionOutOfPocket", "Vision Out-of-Pocket", "visionCare", "Vision care out-of-pocket expense.", "vision out of pocket|glasses|contacts|eye exam", "annual", "ongoing"],
    ["glassesContacts", "Glasses / Contacts", "visionCare", "Recurring eyewear, glasses, contacts, or lens expense.", "glasses|contacts|eyewear|lenses", "annual", "ongoing"],
    ["eyeSurgery", "Eye Surgery", "visionCare", "One-time eye surgery or corrective vision procedure expense.", "eye surgery|lasik|cataract|vision procedure", "oneTime", "oneTime"],
    ["hearingAidsAudiology", "Hearing Aids / Audiology", "medicalEquipment", "One-time hearing aid or audiology equipment expense.", "hearing aids|audiology|hearing", "oneTime", "oneTime"],
    ["durableMedicalEquipment", "Durable Medical Equipment", "medicalEquipment", "One-time durable medical equipment expense.", "dme|wheelchair|medical equipment|mobility aid", "oneTime", "oneTime"],
    ["adaptiveHomeModification", "Adaptive Home Modification", "medicalEquipment", "One-time home modification for accessibility or medical support.", "adaptive home|home modification|accessibility|ramps", "oneTime", "oneTime"],
    ["mobilityVehicleModification", "Mobility Vehicle Modification", "medicalEquipment", "One-time vehicle modification for mobility or accessibility needs.", "vehicle modification|mobility vehicle|wheelchair van", "oneTime", "oneTime"],
    ["mobilityAids", "Mobility Aids", "medicalEquipment", "One-time mobility aid or assistive device expense.", "mobility aids|walker|scooter|assistive device", "oneTime", "oneTime"],
    ["homeHealthAide", "Home Health Aide", "homeHealthCare", "Home health aide or in-home care expense.", "home health|home aide|in home care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["medicalAlertMonitoring", "Medical Alert Monitoring", "homeHealthCare", "Recurring medical alert monitoring or emergency response service expense.", "medical alert|emergency response|monitoring", "monthly", "ongoing"],
    ["longTermCareInsurancePremiums", "Long-Term Care Insurance Premiums", "longTermCare", "Recurring long-term care insurance premium expense.", "ltc insurance|long term care premium|care insurance", "monthly", "ongoing"],
    ["nursingCare", "Nursing Care", "longTermCare", "Nursing care or skilled nursing expense.", "nursing care|skilled nursing|care facility", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["assistedLiving", "Assisted Living", "longTermCare", "Assisted living care expense.", "assisted living|care residence|senior care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["memoryCare", "Memory Care", "longTermCare", "Memory care or dementia care expense.", "memory care|dementia care|alzheimers care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["adultDayCare", "Adult Day Care", "longTermCare", "Adult day care or daytime supervised care expense.", "adult day care|day program|senior day care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["respiteCare", "Respite Care", "longTermCare", "Temporary respite care or relief caregiver expense.", "respite care|relief care|temporary care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["specialNeedsCare", "Special Needs Care", "longTermCare", "Special needs support or specialized dependent care expense.", "special needs|specialized care|dependent care support", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["hospiceCare", "Hospice Care", "medicalFinalExpense", "One-time hospice or end-of-life care expense.", "hospice|end of life care|final medical", "oneTime", "oneTime"],
    ["hospitalFinalBill", "Hospital Final Bill", "medicalFinalExpense", "One-time hospital or final medical bill expense.", "hospital bill|final medical bill|medical final expense", "oneTime", "oneTime"],
    ["endOfLifePrescriptionCosts", "End-of-Life Prescription Costs", "medicalFinalExpense", "One-time end-of-life medication or prescription expense.", "end of life prescriptions|final medications|pharmacy", "oneTime", "oneTime"],
    ["otherHealthcareExpense", "Other Healthcare Expense", "otherHealthcare", "Other healthcare expense not captured by standard healthcare categories.", "other healthcare|medical expense|health cost", "monthly", "ongoing", { isCustomType: true }],

    ["cremation", "Cremation", "funeralBurial", "One-time cremation expense.", "cremation|funeral|burial", "oneTime", "oneTime"],
    ["burialPlot", "Burial Plot", "funeralBurial", "One-time burial plot or cemetery plot expense.", "burial plot|cemetery|grave plot", "oneTime", "oneTime"],
    ["headstoneMarker", "Headstone / Marker", "funeralBurial", "One-time headstone, marker, or monument expense.", "headstone|marker|monument", "oneTime", "oneTime"],
    ["memorialService", "Memorial Service", "funeralBurial", "One-time memorial service or final arrangement expense.", "memorial|service|funeral service", "oneTime", "oneTime"],
    ["obituaryDeathCertificates", "Obituary / Death Certificates", "otherFinalExpense", "One-time obituary, death certificate, and administrative final expense.", "obituary|death certificates|certificates", "oneTime", "oneTime"],
    ["travelForFamilyFinalArrangements", "Travel for Family Final Arrangements", "otherFinalExpense", "One-time travel expense for family final arrangements.", "family travel|final arrangements|travel", "oneTime", "oneTime"],
    ["probateAttorney", "Probate Attorney", "estateSettlement", "One-time probate attorney expense.", "probate attorney|estate lawyer|legal", "oneTime", "oneTime"],
    ["executorFees", "Executor Fees", "estateSettlement", "One-time executor or personal representative fee.", "executor|personal representative|estate fee", "oneTime", "oneTime"],
    ["finalTaxPreparation", "Final Tax Preparation", "estateSettlement", "One-time final tax preparation expense.", "final tax|tax preparation|estate tax prep", "oneTime", "oneTime"],
    ["estateAdministrationCosts", "Estate Administration Costs", "estateSettlement", "One-time estate administration expense.", "estate administration|probate cost|administration", "oneTime", "oneTime"],

    ["rentOrMortgagePayment", "Rent or Mortgage Payment", "housingExpense", "Recurring housing payment expense.", "rent|mortgage payment|housing payment", "monthly", "ongoing"],
    ["propertyTaxes", "Property Taxes", "housingExpense", "Recurring property tax expense.", "property tax|real estate tax", "annual", "ongoing"],
    ["monthlyPropertyTaxDefault", "Monthly Property Tax", "housingExpense", "Future scalar support mapping for monthly property-tax costs.", "monthly property tax|property tax|housing tax|support property tax", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "continues" }],
    ["homeownersInsurance", "Homeowners Insurance", "housingExpense", "Recurring homeowners insurance expense.", "homeowners insurance|hazard insurance|property insurance", "annual", "ongoing"],
    ["housingInsuranceDefault", "Housing Insurance", "housingExpense", "Future scalar support mapping for monthly housing insurance costs.", "housing insurance|homeowners insurance|renters insurance|hazard insurance|support housing insurance", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "continues" }],
    ["homeMaintenanceRepairs", "Home Maintenance / Repairs", "housingExpense", "Recurring or periodic home maintenance and repair expense.", "home maintenance|repairs|house repairs|maintenance", "annual", "ongoing"],
    ["monthlyHomeMaintenanceDefault", "Monthly Maintenance / Repairs", "housingExpense", "Future scalar support mapping for monthly home maintenance and repair costs.", "monthly maintenance|home repairs|housing maintenance|support maintenance", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "continues" }],
    ["hoaDues", "HOA Dues", "housingExpense", "Recurring homeowners association dues expense.", "hoa|association dues|condo dues", "monthly", "ongoing"],
    ["propertyAssessments", "Property Assessments", "housingExpense", "Periodic property assessment or special assessment expense.", "property assessment|special assessment|tax assessment", "annual", "ongoing"],
    ["householdUtilities", "Utilities", "utilities", "Recurring household utility expense.", "utilities|electric|gas|water|trash|household utilities", "monthly", "ongoing"],
    ["internetPhone", "Internet / Phone", "utilities", "Recurring internet and phone expense.", "internet|phone|cell phone|broadband", "monthly", "ongoing"],
    ["groceries", "Groceries", "foodGroceries", "Recurring grocery and household food expense.", "groceries|food|household food", "monthly", "ongoing"],
    ["diningTakeout", "Dining / Takeout", "foodGroceries", "Broad food-away-from-home expense for dining out, takeout, convenience food, and meal delivery.", "dining|takeout|restaurants|food away from home|meal delivery", "monthly", "ongoing"],
    ["transportationFuel", "Transportation Fuel", "transportation", "Recurring fuel or transportation expense.", "fuel|gasoline|transportation", "monthly", "ongoing"],
    ["householdTransportation", "Household Transportation", "transportation", "Record-first starter mapping for broad household transportation costs.", "household transportation|transportation|fuel|transit|vehicle costs|support transportation", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "review" }],
    ["vehicleInsurance", "Vehicle Insurance", "transportation", "Recurring vehicle insurance expense.", "auto insurance|vehicle insurance|car insurance", "monthly", "ongoing"],
    ["vehicleMaintenance", "Vehicle Maintenance", "transportation", "Recurring or periodic vehicle maintenance expense.", "vehicle maintenance|car maintenance|repairs", "annual", "ongoing"],
    ["householdInsurancePremiums", "Household Insurance Premiums", "insurancePremiums", "Record-first starter mapping for broad non-housing household insurance premiums.", "household insurance|insurance premiums|non-housing insurance|support insurance", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "review" }],
    ["rentersInsurance", "Renters Insurance", "insurancePremiums", "Recurring renters insurance premium expense.", "renters insurance|tenant insurance|renter premium", "monthly", "ongoing"],
    ["umbrellaInsurance", "Umbrella Insurance", "insurancePremiums", "Recurring umbrella liability insurance premium expense.", "umbrella insurance|liability insurance|excess liability", "annual", "ongoing"],
    ["disabilityInsurancePremiums", "Disability Insurance Premiums", "insurancePremiums", "Recurring disability insurance premium expense.", "disability insurance|income protection premium|di premium", "monthly", "ongoing"],
    ["lifeInsurancePremiums", "Life Insurance Premiums", "insurancePremiums", "Recurring life insurance premium expense.", "life insurance premium|policy premium|coverage premium", "monthly", "ongoing"],
    ["petInsurance", "Pet Insurance", "insurancePremiums", "Recurring pet insurance premium expense.", "pet insurance|animal insurance|pet premium", "monthly", "ongoing"],
    ["childcareExpense", "Childcare", "childcare", "Recurring childcare expense.", "childcare|daycare|dependent care", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["dependentSupportExpense", "Dependent Support", "dependentSupport", "Recurring dependent support expense.", "dependent support|family support|care support", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["personalCare", "Personal Care", "personalLiving", "Recurring personal care expense.", "personal care|household personal|living expense", "monthly", "ongoing"],
    ["householdSupplies", "Household Supplies", "personalLiving", "Recurring household supplies expense.", "household supplies|cleaning supplies|home supplies", "monthly", "ongoing"],
    ["clothing", "Clothing", "personalLiving", "Recurring clothing and apparel expense.", "clothing|apparel|shoes", "monthly", "ongoing"],
    ["subscriptionsMemberships", "Subscriptions / Memberships", "personalLiving", "Recurring subscriptions, memberships, or club dues expense.", "subscriptions|memberships|dues|streaming", "monthly", "ongoing"],
    ["householdServices", "Household Services", "personalLiving", "Broad household service expense for house cleaning, lawn, snow, pest, pool, dry cleaning, and similar services.", "household services|house cleaning|lawn care|snow removal|pest control|pool service|dry cleaning|laundry", "monthly", "ongoing", { notes: "Broad parent covers mixed housing and personal-living service children; personalLiving is the current best taxonomy fit for the aggregate parent." }],
    ["recurringPersonalSpendingDefault", "Recurring Personal Spending", "personalLiving", "Record-first starter mapping for broad recurring personal spending.", "recurring personal spending|subscriptions|memberships|personal spending|support discretionary", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "review" }],
    ["discretionaryTravelEntertainment", "Entertainment / Travel", "personalLiving", "Record-first support mapping for entertainment, travel, and other discretionary personal spending.", "entertainment|travel|discretionary travel|personal spending|support discretionary", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "review" }],
    ["otherHouseholdExpenseDefault", "Other Household Expenses", "otherLivingExpense", "Add Expense catch-all mapping for broad other household expenses likely to continue.", "other household expenses|household expense|support household|living expense", "monthly", "ongoing", { uiAvailability: "future", defaultContinuationStatus: "continues" }],
    ["petCare", "Pet Care", "otherLivingExpense", "Recurring pet care expense.", "pet care|veterinary|pet food|animal care", "monthly", "ongoing"],

    ["educationEnrichment", "Education & Enrichment", "educationExpense", "Broad protected education and enrichment expense for school, tutoring, activities, college, special education, and related support.", "education|enrichment|school|tutoring|college|activities|special education", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues", defaultNeedType: "protectedEssential", priorityClass: "protected", compressionTier: "advisorConfirmed", requiresAdvisorConfirmation: true, protectedCategory: true, notes: "Broad education/enrichment parent is review-only and not lifestyle-adjustable in V1." }],
    ["privateSchoolTuition", "Private School Tuition", "educationExpense", "Annual private school tuition expense.", "private school|tuition|school", "annual", "fixedYears", { suggestedTermYears: 4 }],
    ["tutoring", "Tutoring", "educationExpense", "Recurring tutoring or academic support expense.", "tutoring|academic support|education", "monthly", "fixedYears", { suggestedTermYears: 2 }],
    ["collegeApplicationTesting", "College Application / Testing", "educationExpense", "One-time college application, testing, or preparation expense.", "college application|testing|sat|act", "oneTime", "oneTime"],
    ["schoolSupplies", "School Supplies", "educationExpense", "Annual school supplies or classroom materials expense.", "school supplies|classroom supplies|books", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["childActivitiesSports", "Child Activities / Sports", "childActivityExpense", "Recurring child activities, sports, or enrichment expense.", "child activities|sports|enrichment", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["earlyEducationChildcare", "Childcare Education", "childcareEducation", "Recurring education-linked childcare or early education expense.", "preschool|daycare education|early education", "monthly", "fixedYears", { suggestedTermYears: 5 }],

    ["businessOverheadRent", "Business Overhead Rent", "businessOverhead", "Recurring business rent or location overhead expense.", "business rent|office rent|overhead", "monthly", "fixedYears", { suggestedTermYears: 1 }],
    ["businessPayrollCoverage", "Business Payroll Coverage", "businessOverhead", "Recurring business payroll coverage expense.", "payroll|business payroll|employee payroll", "monthly", "fixedYears", { suggestedTermYears: 1 }],
    ["professionalLicensingFees", "Professional Licensing Fees", "professionalServices", "Recurring professional licensing or credential expense.", "licensing|professional license|credential", "annual", "ongoing"],
    ["professionalAdvisorFees", "Professional Advisor Fees", "professionalServices", "Recurring professional advisor or service fee.", "advisor fees|professional fees|consultant", "annual", "ongoing"],
    ["keyPersonRecruitingReplacement", "Key Person Replacement Expense", "keyPersonReplacementExpense", "One-time key person replacement or recruiting expense.", "key person|replacement|recruiting", "oneTime", "oneTime"],

    ["customExpenseRecord", "Custom Expense", "customExpense", "Advisor-defined expense not covered by the standard expense library.", "custom|other expense|advisor defined", "monthly", "ongoing", { isCustomType: true }]
  ]);

  const GENERATED_DEBT_PAYMENT_OPTIONS = Object.freeze({
    uiAvailability: "future",
    isAddable: false,
    sourcePath: "protectionModeling.data.debtRecords",
    duplicateProtection: "debtRecords-generated-payment-source",
    defaultNeedType: "debtObligation",
    priorityClass: "generated",
    compressionTier: "generatedOnly",
    requiresAdvisorConfirmation: true,
    formulaActiveNow: false,
    triageEligibleLater: false,
    interventionCandidate: false,
    sourceOwnedBy: "debtRecords",
    generatedOnly: true,
    protectedCategory: true,
    notes: "Generated/source-linked from Debt Records; not manually addable and not auto-compressible."
  });

  const ADDITIONAL_COMPRESSED_EXPENSE_LIBRARY_ENTRIES = Object.freeze([
    ["diningOutRestaurants", "Dining Out / Restaurants", "foodGroceries", "Restaurant meals and dining-out costs separated from groceries.", "dining out|restaurants|restaurant meals|eating out", "monthly", "ongoing"],
    ["takeoutConvenienceFood", "Takeout / Convenience Food", "foodGroceries", "Takeout, drive-through, and convenience food costs.", "takeout|convenience food|drive through|fast food", "monthly", "ongoing"],
    ["schoolLunches", "School Lunches", "foodGroceries", "Recurring school lunch or meal account costs.", "school lunches|meal account|cafeteria", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["mealDeliveryServices", "Meal Delivery Services", "foodGroceries", "Meal kit, prepared meal, and food delivery subscription costs.", "meal delivery|meal kit|prepared meals|food delivery", "monthly", "ongoing"],
    ["groceryDeliveryFeesTips", "Grocery Delivery Fees / Tips", "foodGroceries", "Grocery delivery fees, service charges, and tips.", "grocery delivery|delivery fees|grocery tips|service fee", "monthly", "ongoing"],
    ["specialtyDietAllergyFoodPremium", "Specialty Diet / Allergy Food Premium", "foodGroceries", "Extra food cost for allergy, medical, religious, or specialty dietary needs.", "specialty diet|allergy food|gluten free|medical diet|kosher|halal", "monthly", "ongoing"],
    ["alcoholSocialBeverages", "Alcohol / Social Beverages", "foodGroceries", "Alcohol, social beverages, and related household beverage costs.", "alcohol|beverages|social drinks|wine|beer", "monthly", "ongoing"],
    ["householdConsumablesSupplies", "Household Consumables & Supplies", "foodGroceries", "Paper goods, cleaning supplies, toiletries, laundry supplies, and basic household consumables.", "household consumables|paper goods|cleaning supplies|toiletries|laundry supplies|basic supplies", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],

    ["entertainmentRecreation", "Entertainment / Recreation", "discretionaryLifestyle", "Entertainment and recreation spending.", "entertainment|recreation|fun|activities", "monthly", "ongoing"],
    ["streamingDigitalSubscriptions", "Streaming & Digital Subscriptions", "discretionaryLifestyle", "Streaming, app, cloud, and digital subscription costs.", "streaming|digital subscriptions|apps|cloud|media subscription", "monthly", "ongoing"],
    ["gymFitnessMemberships", "Gym / Fitness Memberships", "discretionaryLifestyle", "Gym, fitness studio, and wellness membership costs.", "gym|fitness|workout|membership", "monthly", "ongoing"],
    ["clubsSocialMemberships", "Clubs / Social Memberships", "discretionaryLifestyle", "Club dues, social memberships, and private membership costs.", "club dues|social membership|country club|association", "monthly", "ongoing"],
    ["hobbiesRecreationGear", "Hobbies & Recreation Gear", "discretionaryLifestyle", "Hobby supplies, recreation gear, and personal-interest equipment.", "hobbies|recreation gear|crafts|gear", "monthly", "ongoing"],
    ["eventsConcertsSportingEvents", "Events / Concerts / Sporting Events", "discretionaryLifestyle", "Tickets and event spending for concerts, shows, and sporting events.", "events|concerts|sporting events|tickets|shows", "monthly", "ongoing"],
    ["gamingInAppPurchases", "Gaming / In-App Purchases", "discretionaryLifestyle", "Gaming subscriptions, game purchases, and in-app spending.", "gaming|in app purchases|video games|game subscription", "monthly", "ongoing"],
    ["booksMediaMusic", "Books / Media / Music", "discretionaryLifestyle", "Books, music, media, and related content spending.", "books|media|music|audio books|content", "monthly", "ongoing"],
    ["dateNightsFamilyOutings", "Date Nights / Family Outings", "discretionaryLifestyle", "Date nights, family outings, and discretionary social outings.", "date nights|family outings|social outings", "monthly", "ongoing"],
    ["personalSpendingAllowance", "Personal Spending Allowance", "discretionaryLifestyle", "Personal allowance or discretionary spending budget.", "allowance|personal spending|discretionary spending", "monthly", "ongoing"],
    ["miscellaneousLifestyleSpending", "Miscellaneous Lifestyle Spending", "discretionaryLifestyle", "Miscellaneous discretionary lifestyle expenses.", "misc lifestyle|miscellaneous spending|discretionary misc", "monthly", "ongoing"],
    ["tobaccoVaping", "Tobacco / Vaping", "discretionaryLifestyle", "Tobacco, vaping, and nicotine product spending.", "tobacco|vaping|nicotine|cigarettes", "monthly", "ongoing"],
    ["lotteryGamblingSpend", "Lottery / Gambling Spend", "discretionaryLifestyle", "Lottery, casino, sportsbook, and gambling spending.", "lottery|gambling|casino|sportsbook", "monthly", "ongoing"],
    ["luxuryPurchases", "Luxury Purchases", "discretionaryLifestyle", "Luxury purchases and high-discretionary consumer spending.", "luxury purchases|luxury|designer|premium purchases", "monthly", "ongoing"],
    ["seasonalActivitiesRecreationPasses", "Seasonal Activities & Recreation Passes", "discretionaryLifestyle", "Seasonal recreation passes, memberships, and activity costs.", "seasonal activities|recreation passes|ski pass|pool pass", "annual", "ongoing"],

    ["vacationsTravel", "Vacations / Travel", "travelVacations", "Vacation and travel spending.", "vacations|travel|trips", "annual", "ongoing"],
    ["weekendShortTrips", "Weekend Trips / Short Trips", "travelVacations", "Weekend travel and short-trip spending.", "weekend trips|short trips|getaways", "quarterly", "ongoing"],
    ["holidayFamilyVisitTravel", "Holiday / Family Visit Travel", "travelVacations", "Holiday, family visit, and obligation travel.", "holiday travel|family visit travel|family travel", "annual", "ongoing"],
    ["travelTransportation", "Travel Transportation", "travelVacations", "Airfare, rental cars, trains, fuel, and transportation during travel.", "airfare|rental car|train|travel transport", "annual", "ongoing"],
    ["lodging", "Lodging", "travelVacations", "Hotel, rental, and lodging costs during travel.", "lodging|hotel|vacation rental|airbnb", "annual", "ongoing"],
    ["travelFoodEntertainment", "Travel Food & Entertainment", "travelVacations", "Food, entertainment, and activity spending while traveling.", "travel food|travel entertainment|vacation food", "annual", "ongoing"],
    ["travelInsuranceDocumentsGear", "Travel Insurance / Documents / Gear", "travelVacations", "Travel insurance, passport, document, luggage, and travel gear costs.", "travel insurance|passport|documents|luggage|travel gear", "annual", "ongoing"],
    ["timeshareVacationClubFees", "Timeshare / Vacation Club Fees", "travelVacations", "Timeshare, vacation club, and travel membership fees.", "timeshare|vacation club|travel membership", "annual", "ongoing"],

    ["fuel", "Fuel", "transportation", "Vehicle fuel and household driving costs.", "fuel|gas|gasoline|diesel|charging", "monthly", "ongoing"],
    ["tiresMajorAutoRepair", "Tires / Major Auto Repair", "transportation", "Tires, major repairs, and larger vehicle service events.", "tires|major auto repair|vehicle repair|brakes", "annual", "ongoing"],
    ["registrationInspectionEmissions", "Registration / Inspection / Emissions", "transportation", "Vehicle registration, inspection, emissions, and title fees.", "registration|inspection|emissions|tags|title", "annual", "ongoing"],
    ["parkingTollsCommuting", "Parking / Tolls / Commuting", "transportation", "Parking, tolls, commuting passes, and commuting costs.", "parking|tolls|commuting|commuter", "monthly", "ongoing"],
    ["publicTransit", "Public Transit", "transportation", "Bus, rail, subway, commuter train, and transit pass costs.", "public transit|bus|rail|subway|transit pass", "monthly", "ongoing"],
    ["rideshareTaxi", "Rideshare / Taxi", "transportation", "Rideshare, taxi, and car service costs.", "rideshare|taxi|uber|lyft|car service", "monthly", "ongoing"],
    ["vehicleReplacementFund", "Vehicle Replacement Fund", "transportation", "Recurring vehicle replacement savings contribution treated as an expense goal.", "vehicle replacement|car replacement fund|replacement savings", "monthly", "ongoing"],
    ["motorcycleRvBoatCosts", "Motorcycle / RV / Boat Costs", "transportation", "Operating and ownership costs for motorcycles, RVs, boats, and recreational vehicles.", "motorcycle|rv|boat|recreational vehicle", "monthly", "ongoing"],
    ["vehicleRvBoatStorage", "Vehicle / RV / Boat Storage", "transportation", "Storage costs for vehicles, RVs, boats, trailers, or seasonal equipment.", "vehicle storage|rv storage|boat storage|garage", "monthly", "ongoing"],
    ["childSchoolTransportation", "Child / School Transportation", "transportation", "School transportation, child transportation, and related transit costs.", "school transportation|child transportation|bus fee|carpool", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["vehicleMiscellaneous", "Vehicle Miscellaneous", "transportation", "Other vehicle ownership and transportation costs.", "vehicle misc|auto miscellaneous|car expense", "monthly", "ongoing"],

    ["autoLoanPayment", "Auto Loan Payment", "debtObligations", "Generated debt-payment expense display row owned by Debt Records.", "auto loan payment|car loan payment|debt payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["autoLeasePayment", "Auto Lease Payment", "debtObligations", "Generated auto lease payment expense display row owned by Debt Records.", "auto lease payment|vehicle lease payment|debt payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["creditCardMinimumPayment", "Credit Card Minimum Payment", "debtObligations", "Generated credit-card minimum payment expense display row owned by Debt Records.", "credit card minimum|minimum payment|card payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["studentLoanPayment", "Student Loan Payment", "debtObligations", "Generated student loan payment expense display row owned by Debt Records.", "student loan payment|education debt payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["personalLoanPayment", "Personal Loan Payment", "debtObligations", "Generated personal loan payment expense display row owned by Debt Records.", "personal loan payment|installment loan payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["taxDebtIrsPaymentPlan", "Tax Debt / IRS Payment Plan", "debtObligations", "Generated tax debt or IRS payment plan expense display row owned by Debt Records.", "tax debt|irs payment plan|tax payment plan", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["medicalDebtPayment", "Medical Debt Payment", "debtObligations", "Generated medical debt payment expense display row owned by Debt Records.", "medical debt payment|hospital payment plan", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["businessDebtPayment", "Business Debt Payment", "debtObligations", "Generated business debt payment expense display row owned by Debt Records.", "business debt payment|business loan payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],
    ["otherDebtPayment", "Other Debt Payment", "debtObligations", "Generated other debt payment expense display row owned by Debt Records.", "other debt payment|misc debt payment", "monthly", "ongoing", GENERATED_DEBT_PAYMENT_OPTIONS],

    ["retirementContributions", "Retirement Contributions", "savingsGoalContributions", "401(k), IRA, pension, and other retirement contributions.", "retirement contributions|401k|ira|pension", "monthly", "ongoing"],
    ["brokerageInvestmentContributions", "Brokerage / General Investment Contributions", "savingsGoalContributions", "Taxable brokerage and general investment contributions.", "brokerage contributions|investment contributions|taxable investment", "monthly", "ongoing"],
    ["educationSavingsContributions", "Education Savings Contributions", "savingsGoalContributions", "529, ESA, and other education savings contributions kept separate from education expenses.", "529|education savings|college savings|esa", "monthly", "ongoing"],
    ["emergencyFundContributions", "Emergency Fund Contributions", "savingsGoalContributions", "Emergency fund contributions kept separate from emergency fund assets.", "emergency fund contributions|cash reserve savings", "monthly", "ongoing"],
    ["sinkingFundContributions", "Sinking Fund Contributions", "savingsGoalContributions", "Recurring contributions to planned periodic expense reserves.", "sinking fund|reserve contribution|planned savings", "monthly", "ongoing"],
    ["vacationLifestyleGoalContributions", "Vacation / Lifestyle Goal Contributions", "savingsGoalContributions", "Savings contributions for vacation or lifestyle goals.", "vacation savings|lifestyle goal|goal contribution", "monthly", "ongoing"],
    ["vehicleReplacementContributions", "Vehicle Replacement Contributions", "savingsGoalContributions", "Savings contributions for a future vehicle replacement.", "vehicle replacement contribution|car savings", "monthly", "ongoing"],
    ["homeRepairReserveContributions", "Home Repair Reserve Contributions", "savingsGoalContributions", "Savings contributions for future home repairs or maintenance reserve.", "home repair reserve|maintenance reserve", "monthly", "ongoing"],
    ["taxReserveContributions", "Tax Reserve Contributions", "savingsGoalContributions", "Savings contributions for future taxes or tax true-ups.", "tax reserve|tax savings|tax true up reserve", "monthly", "ongoing"],
    ["businessReserveContributions", "Business Reserve Contributions", "savingsGoalContributions", "Savings contributions for business reserves or business continuity.", "business reserve|business savings|operating reserve", "monthly", "ongoing"],
    ["charitableGivingReserve", "Charitable / Giving Reserve", "savingsGoalContributions", "Savings reserve for charitable giving or future gifts.", "giving reserve|charitable reserve|donation savings", "monthly", "ongoing"],
    ["familyEventWeddingSavings", "Family Event / Wedding Savings", "savingsGoalContributions", "Savings for weddings, family events, and major celebrations.", "wedding savings|family event savings|celebration savings", "monthly", "ongoing"],
    ["downPaymentSavings", "Down Payment Savings", "savingsGoalContributions", "Home, property, or major purchase down-payment savings.", "down payment savings|home down payment|property savings", "monthly", "ongoing"],
    ["otherGoalSavings", "Other Goal Savings", "savingsGoalContributions", "Other advisor-defined goal savings contribution.", "other goal savings|custom savings goal", "monthly", "ongoing"],

    ["federalStateLocalIncomeTaxPayments", "Federal / State / Local Income Tax Payments", "taxes", "Income tax payments not captured through payroll withholding.", "income tax payments|federal tax|state tax|local tax", "monthly", "ongoing"],
    ["selfEmploymentTax", "Self-Employment Tax", "taxes", "Self-employment tax payments or reserve contributions.", "self employment tax|se tax|1099 tax", "quarterly", "ongoing"],
    ["quarterlyEstimatedTaxes", "Quarterly Estimated Taxes", "taxes", "Quarterly estimated federal, state, or local tax payments.", "estimated taxes|quarterly taxes|tax estimates", "quarterly", "ongoing"],
    ["taxPreparationFees", "Tax Preparation Fees", "taxes", "Tax preparation and filing fees.", "tax prep|tax preparation|filing fees", "annual", "ongoing"],
    ["taxPenaltyPaymentPlan", "Tax Penalty / Payment Plan", "taxes", "Tax penalty, installment agreement, or payment-plan cost.", "tax penalty|payment plan|tax installment", "monthly", "ongoing"],
    ["payrollTaxWithholdingGap", "Payroll Tax Withholding Gap", "taxes", "Projected payroll tax withholding shortfall or gap.", "payroll tax gap|withholding gap|tax withholding", "monthly", "ongoing"],
    ["capitalGainsTaxReserve", "Capital Gains Tax Reserve", "taxes", "Reserve for expected capital gains taxes.", "capital gains tax|investment tax reserve", "oneTime", "oneTime"],
    ["propertyTaxEscrowShortage", "Property Tax Escrow Shortage", "taxes", "Property tax escrow shortage or catch-up payment.", "property tax escrow|escrow shortage|tax shortage", "oneTime", "oneTime"],
    ["businessTaxPayments", "Business Tax Payments", "taxes", "Business tax payments or reserves.", "business tax|entity tax|business taxes", "quarterly", "ongoing"],
    ["estateProbateTaxCosts", "Estate / Probate Tax Costs", "taxes", "Estate, probate, inheritance, or administration tax costs.", "estate tax|probate tax|inheritance tax", "oneTime", "oneTime"],

    ["termLifePremiums", "Term Life Premiums", "insurancePremiums", "Term life insurance premium expense.", "term life premium|term insurance|life premium", "monthly", "ongoing"],
    ["permanentLifePremiums", "Whole Life / Permanent Life Premiums", "insurancePremiums", "Whole life, universal life, or permanent life premium expense.", "whole life|permanent life|universal life", "monthly", "ongoing"],
    ["autoInsurance", "Auto Insurance", "insurancePremiums", "Auto insurance premium expense.", "auto insurance|car insurance|vehicle insurance", "monthly", "ongoing"],
    ["homeRentersInsurance", "Home / Renters Insurance", "insurancePremiums", "Homeowners, renters, condo, or tenant insurance premium expense.", "home insurance|renters insurance|condo insurance", "monthly", "ongoing"],
    ["longTermCareInsurance", "Long-Term Care Insurance", "insurancePremiums", "Long-term care insurance premium expense.", "long term care insurance|ltc premium", "monthly", "ongoing"],
    ["businessProfessionalInsurance", "Business / Professional Insurance", "insurancePremiums", "Business, professional, or E&O insurance premium expense.", "business insurance|professional insurance|e and o", "monthly", "ongoing"],
    ["malpracticeLiabilityInsurance", "Malpractice / Liability Insurance", "insurancePremiums", "Malpractice or liability insurance premium expense.", "malpractice|liability insurance|professional liability", "monthly", "ongoing"],
    ["floodEarthquakeWindInsurance", "Flood / Earthquake / Wind Insurance", "insurancePremiums", "Specialty property hazard insurance premium expense.", "flood insurance|earthquake insurance|wind insurance|hazard", "annual", "ongoing"],
    ["valuableArticlesJewelryInsurance", "Valuable Articles / Jewelry Insurance", "insurancePremiums", "Valuable articles, jewelry, collectibles, or scheduled property insurance.", "valuable articles|jewelry insurance|scheduled property", "annual", "ongoing"],
    ["warrantyProtectionPlans", "Warranty / Protection Plans", "insurancePremiums", "Warranty and consumer protection plan expenses.", "warranty|protection plan|extended warranty", "monthly", "ongoing"],
    ["travelEventInsurance", "Travel / Event Insurance", "insurancePremiums", "Travel or event insurance premium expense.", "travel insurance|event insurance|trip insurance", "annual", "ongoing"],

    ["mortgageInsurancePmi", "Mortgage Insurance / PMI", "housingExpense", "Private mortgage insurance or mortgage insurance premium expense.", "pmi|mortgage insurance|private mortgage insurance", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["secondMortgageHelocHomeEquityPayment", "Second Mortgage / HELOC / Home Equity Payment", "housingExpense", "Second mortgage, HELOC, or home equity payment shown separately from primary housing.", "second mortgage|heloc|home equity payment", "monthly", "ongoing"],
    ["hoaAssessments", "HOA / Assessments", "housingExpense", "HOA dues, condo fees, and special assessments.", "hoa|assessments|condo fees|association dues", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["utilitiesEscrowUtilityArrears", "Utilities Escrow / Utility Arrears", "housingExpense", "Utility arrears, escrow, or payment-plan costs tied to housing.", "utility arrears|utility escrow|utility payment plan", "monthly", "ongoing"],
    ["majorHomeRepairReserve", "Major Home Repair Reserve", "housingExpense", "Reserve for major home repairs and capital maintenance.", "major home repair|home repair reserve|capital repairs", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["securitySystem", "Security System", "housingExpense", "Home security system equipment or monitoring costs.", "security system|alarm|home monitoring", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["lawnSnowPestPoolServices", "Lawn / Snow / Pest / Pool Services", "housingExpense", "Lawn care, snow removal, pest control, pool service, and exterior services.", "lawn|snow removal|pest control|pool service", "monthly", "ongoing"],
    ["houseCleaning", "House Cleaning", "housingExpense", "House cleaning and household cleaning service expense.", "house cleaning|cleaning service|maid service", "monthly", "ongoing"],
    ["applianceFurnitureReplacement", "Appliance / Furniture Replacement", "housingExpense", "Replacement reserve for appliances, furniture, and major home goods.", "appliance replacement|furniture replacement|home goods replacement", "annual", "ongoing"],
    ["storageUnitGarageRental", "Storage Unit / Garage Rental", "housingExpense", "Storage unit, garage rental, or offsite storage expense.", "storage unit|garage rental|offsite storage", "monthly", "ongoing"],
    ["movingTemporaryHousingCosts", "Moving / Temporary Housing Costs", "housingExpense", "Moving, temporary housing, and transition housing costs.", "moving|temporary housing|relocation housing", "oneTime", "oneTime"],
    ["assistedLivingHousingComponent", "Assisted Living Housing Component", "housingExpense", "Housing component of assisted living or senior housing costs.", "assisted living housing|senior housing|care housing", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["secondHomeCosts", "Second Home Costs", "housingExpense", "Recurring second home ownership and carrying costs.", "second home|vacation home|second property", "monthly", "ongoing"],
    ["rentalPropertyCarryingCosts", "Rental Property Carrying Costs", "housingExpense", "Rental property mortgage, tax, insurance, maintenance, vacancy, and carrying costs.", "rental property|investment property|carrying costs", "monthly", "ongoing"],

    ["electricity", "Electricity", "utilities", "Electric utility expense.", "electricity|electric bill|power bill", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["gasHeatingFuelPropaneOil", "Gas / Heating Fuel / Propane / Oil", "utilities", "Gas, heating fuel, propane, oil, and home heating utility expense.", "gas|heating fuel|propane|oil|heat", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["waterSewer", "Water / Sewer", "utilities", "Water and sewer utility expense.", "water|sewer|utility", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["trashRecycling", "Trash / Recycling", "utilities", "Trash, recycling, and waste collection expense.", "trash|recycling|waste collection", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["internet", "Internet", "utilities", "Internet service expense.", "internet|broadband|wifi", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["mobilePhone", "Mobile Phone", "utilities", "Mobile phone and cellular service expense.", "mobile phone|cell phone|wireless", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["landline", "Landline", "utilities", "Landline phone service expense.", "landline|home phone|telephone", "monthly", "ongoing"],
    ["cableTv", "Cable TV", "utilities", "Cable TV service expense.", "cable tv|television|cable", "monthly", "ongoing"],
    ["streamingInternetBundle", "Streaming / Internet Bundle", "utilities", "Bundled streaming, cable, internet, and communication package expense.", "streaming bundle|internet bundle|cable bundle", "monthly", "ongoing"],
    ["homeSecurityMonitoring", "Home Security Monitoring", "utilities", "Home security monitoring service expense.", "security monitoring|alarm monitoring|home security", "monthly", "ongoing"],
    ["utilityArrearsPaymentPlan", "Utility Arrears / Payment Plan", "utilities", "Utility arrears or payment plan expense.", "utility arrears|utility payment plan|past due utility", "monthly", "ongoing"],
    ["generatorBackupPower", "Generator / Backup Power", "utilities", "Generator, backup power, and related recurring or reserve costs.", "generator|backup power|battery backup", "annual", "ongoing"],
    ["solarLoanLeasePayment", "Solar Loan / Lease Payment", "utilities", "Solar loan, lease, or power purchase payment.", "solar loan|solar lease|solar payment", "monthly", "ongoing"],

    ["daycareChildcare", "Daycare / Childcare", "familySupport", "Daycare and childcare expense.", "daycare|childcare|child care", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["nannyInHomeChildcare", "Nanny / In-Home Childcare", "familySupport", "Nanny, au pair, or in-home childcare expense.", "nanny|au pair|in home childcare", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["babysitting", "Babysitting", "familySupport", "Babysitting and occasional child supervision costs.", "babysitting|sitter|child supervision", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["afterSchoolCare", "After-School Care", "familySupport", "After-school care and supervised program costs.", "after school care|school program|extended care", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["summerCampChildcareCamp", "Summer Camp / Childcare Camp", "familySupport", "Summer camp used as childcare or dependent supervision.", "summer camp|childcare camp|camp", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["preschool", "Preschool", "familySupport", "Preschool and pre-kindergarten tuition or care expense.", "preschool|pre k|early childhood", "monthly", "fixedYears", { suggestedTermYears: 3, defaultContinuationStatus: "continues" }],
    ["elderCareSupport", "Elder Care Support", "familySupport", "Support costs for elder care or aging family members.", "elder care|aging parent|senior support", "monthly", "ongoing"],
    ["parentAdultChildSupport", "Parent / Adult Child Support", "familySupport", "Financial support for parents, adult children, or extended family.", "parent support|adult child support|family assistance", "monthly", "ongoing"],
    ["specialNeedsNonmedicalSupport", "Special Needs Nonmedical Support", "familySupport", "Nonmedical special needs support, supervision, and services.", "special needs nonmedical|support services|care support", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["disabilitySupportServices", "Disability Support Services", "familySupport", "Disability support services not captured as healthcare.", "disability support|support services|nonmedical disability", "monthly", "ongoing", { defaultContinuationStatus: "continues" }],
    ["childSupportPaid", "Child Support Paid", "familySupport", "Child support paid as a legal obligation.", "child support|support obligation|court ordered support", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["alimonyPaid", "Alimony Paid", "familySupport", "Alimony or spousal support paid as a legal obligation.", "alimony|spousal support|maintenance", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["fosterAdoptionExpenses", "Foster / Adoption Expenses", "familySupport", "Foster care, adoption, and related family-building expenses.", "foster|adoption|adoption fees", "oneTime", "oneTime"],
    ["extracurricularLessonsActivities", "Extracurricular Lessons & Activities", "familySupport", "Lessons, activities, clubs, and enrichment costs for dependents.", "extracurricular|lessons|activities|clubs", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["youthSportsTravelSports", "Youth Sports / Travel Sports", "familySupport", "Youth sports, team fees, travel sports, and related activity costs.", "youth sports|travel sports|team fees", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["schoolFeesUniforms", "School Fees / Uniforms", "familySupport", "School fees, uniforms, required supplies, and recurring school charges.", "school fees|uniforms|required supplies", "annual", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["dependentTransportation", "Dependent Transportation", "familySupport", "Transportation for children, dependents, elders, or supported family members.", "dependent transportation|child transport|elder transport", "monthly", "ongoing"],
    ["caregiverTravel", "Caregiver Travel", "familySupport", "Travel required for caregiving, family support, or care coordination.", "caregiver travel|care travel|family support travel", "monthly", "ongoing"],

    ["collegeTuition", "College Tuition", "educationExpense", "College tuition expense.", "college tuition|university tuition|higher education", "annual", "fixedYears", { suggestedTermYears: 4, defaultContinuationStatus: "continues" }],
    ["collegeRoomBoard", "College Room & Board", "educationExpense", "College room and board expense.", "room and board|college housing|meal plan", "annual", "fixedYears", { suggestedTermYears: 4, defaultContinuationStatus: "continues" }],
    ["collegeBooksFees", "College Books / Fees", "educationExpense", "College books, fees, materials, and required charges.", "college books|college fees|materials", "annual", "fixedYears", { suggestedTermYears: 4, defaultContinuationStatus: "continues" }],
    ["communityCollegeTradeCertification", "Community College / Trade School / Certification", "educationExpense", "Community college, trade school, credential, or certification cost.", "community college|trade school|certification|credential", "annual", "fixedYears", { suggestedTermYears: 2, defaultContinuationStatus: "continues" }],
    ["graduateSchoolSupport", "Graduate School Support", "educationExpense", "Graduate school tuition, fees, and support expenses.", "graduate school|masters|doctoral|professional school", "annual", "fixedYears", { suggestedTermYears: 3 }],
    ["studentHousing", "Student Housing", "educationExpense", "Student housing and education-related living expense.", "student housing|dorm|off campus housing", "monthly", "fixedYears", { suggestedTermYears: 4 }],
    ["schoolTransportation", "School Transportation", "educationExpense", "School transportation, bus, commute, and education travel costs.", "school transportation|student transport|bus", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["schoolMeals", "School Meals", "educationExpense", "School meals and education-related food program costs.", "school meals|lunch account|meal plan", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["schoolTechnology", "School Technology", "educationExpense", "School laptop, tablet, software, device, and technology costs.", "school technology|laptop|tablet|education software", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["testPrepApplicationFees", "Test Prep / Application Fees", "educationExpense", "Test prep, standardized testing, and application fees.", "test prep|application fees|sat|act|college application", "oneTime", "oneTime"],
    ["activityFieldTripFees", "Activity / Field Trip Fees", "educationExpense", "Field trips, activity fees, and school activity costs.", "field trip|activity fees|school activity", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["specialEducationServices", "Special Education Services", "educationExpense", "Special education services, testing, advocacy, and support.", "special education|iep|education services|advocacy", "monthly", "fixedYears", { suggestedTermYears: 5, defaultContinuationStatus: "continues" }],
    ["homeschoolCurriculum", "Homeschool Curriculum", "educationExpense", "Homeschool curriculum, materials, and program costs.", "homeschool|curriculum|home education", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["onlineLearningEducationApps", "Online Learning / Education Apps", "educationExpense", "Online learning subscriptions, education apps, and digital coursework.", "online learning|education apps|digital learning", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["musicSportsClubEnrichment", "Music / Sports / Club Enrichment", "educationExpense", "Music, sports, clubs, and enrichment program costs.", "music lessons|sports|clubs|enrichment", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["summerAcademicPrograms", "Summer Academic Programs", "educationExpense", "Summer academic, bridge, enrichment, or tutoring programs.", "summer academic|academic camp|summer school", "annual", "fixedYears", { suggestedTermYears: 5 }],

    ["deductibleAnnualExposureReserve", "Deductible / Annual Exposure Reserve", "ongoingHealthcare", "Reserve for annual deductible and healthcare exposure.", "deductible reserve|annual exposure|out of pocket max", "monthly", "ongoing"],
    ["copaysCoinsurance", "Copays / Coinsurance", "ongoingHealthcare", "Copay and coinsurance costs.", "copays|coinsurance|doctor copay", "monthly", "ongoing"],
    ["prescriptionsMedicalSupplies", "Prescriptions / Medical Supplies", "ongoingHealthcare", "Prescriptions and recurring medical supplies.", "prescriptions|medical supplies|pharmacy", "monthly", "ongoing"],
    ["chronicConditionSupplies", "Chronic Condition Supplies", "ongoingHealthcare", "Supplies for ongoing chronic condition management.", "chronic condition|diabetes supplies|medical supplies", "monthly", "ongoing"],
    ["dentalVisionOrthodontics", "Dental / Vision / Orthodontics", "ongoingHealthcare", "Combined dental, vision, and orthodontic costs.", "dental|vision|orthodontics|braces", "monthly", "ongoing"],
    ["fertilityMaternityPediatricCare", "Fertility / Maternity / Pediatric Care", "ongoingHealthcare", "Fertility, maternity, pediatric, and family medical care costs.", "fertility|maternity|pediatric|family medical", "monthly", "fixedYears", { suggestedTermYears: 2 }],
    ["mentalHealthCare", "Mental Health Care", "ongoingHealthcare", "Mental health care, counseling, therapy, and behavioral health costs.", "mental health|therapy|counseling|behavioral health", "monthly", "ongoing"],
    ["medicalTravel", "Medical Travel", "ongoingHealthcare", "Travel required for medical care, treatment, or specialists.", "medical travel|treatment travel|doctor travel", "monthly", "ongoing"],
    ["nonCoveredTreatments", "Non-Covered Treatments", "ongoingHealthcare", "Treatments not covered by insurance.", "non covered treatments|not covered|cash pay medical", "monthly", "ongoing"],
    ["alternativeComplementaryCare", "Alternative / Complementary Care", "ongoingHealthcare", "Alternative, complementary, chiropractic, acupuncture, or wellness care.", "alternative care|complementary care|chiropractic|acupuncture", "monthly", "ongoing"],
    ["careCoordinatorAdvocate", "Care Coordinator / Advocate", "ongoingHealthcare", "Care coordinator, medical advocate, or navigation support.", "care coordinator|medical advocate|patient advocate", "monthly", "ongoing"],
    ["inHomeNursingHomeHealth", "In-Home Nursing / Home Health", "ongoingHealthcare", "In-home nursing, home health, and clinical home care.", "in home nursing|home health|nursing care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["assistedLivingMemoryCareNursingHome", "Assisted Living / Memory Care / Nursing Home", "longTermCare", "Facility-based long-term care, assisted living, memory care, or nursing home costs.", "assisted living|memory care|nursing home|long term care", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["hospiceEndOfLifeCare", "Hospice / End-of-Life Care", "medicalFinalExpense", "Hospice and end-of-life care costs.", "hospice|end of life care|palliative", "oneTime", "oneTime"],
    ["medicalDeviceMonitoringSubscription", "Medical Device Monitoring / Subscription", "ongoingHealthcare", "Medical device monitoring, connected device, or subscription costs.", "medical device monitoring|device subscription|remote monitoring", "monthly", "ongoing"],
    ["serviceAnimalCosts", "Service Animal Costs", "ongoingHealthcare", "Service animal care and support costs.", "service animal|service dog|medical animal", "monthly", "ongoing"],
    ["specialMedicalDiet", "Special Medical Diet", "ongoingHealthcare", "Special diet costs driven by medical needs.", "special medical diet|medical diet|nutrition support", "monthly", "ongoing"],

    ["dryCleaningLaundry", "Dry Cleaning / Laundry", "personalLiving", "Dry cleaning, laundry, and garment care costs.", "dry cleaning|laundry|garment care", "monthly", "ongoing"],
    ["workClothing", "Work Clothing", "personalLiving", "Work clothing, uniforms, and professional wardrobe costs.", "work clothing|uniforms|professional clothing", "annual", "ongoing"],
    ["childrensClothing", "Children's Clothing", "personalLiving", "Children's clothing expense.", "childrens clothing|kids clothes|children clothes", "monthly", "fixedYears", { suggestedTermYears: 5 }],
    ["shoesBasicClothing", "Shoes / Basic Clothing", "personalLiving", "Shoes and basic clothing expense.", "shoes|basic clothing|apparel", "monthly", "ongoing"],
    ["diapersBabySupplies", "Diapers / Baby Supplies", "personalLiving", "Diapers and baby supplies.", "diapers|baby supplies|wipes", "monthly", "fixedYears", { suggestedTermYears: 3 }],
    ["formulaInfantSupplies", "Formula / Infant Supplies", "personalLiving", "Formula and infant supplies.", "formula|infant supplies|baby formula", "monthly", "fixedYears", { suggestedTermYears: 2 }],
    ["personalHygieneProducts", "Personal Hygiene Products", "personalLiving", "Personal hygiene and grooming consumables.", "personal hygiene|hygiene products|toiletries", "monthly", "ongoing"],
    ["applianceRepair", "Appliance Repair", "personalLiving", "Appliance repair and service expense.", "appliance repair|repair service|home appliance", "annual", "ongoing"],
    ["furnitureHomeGoods", "Furniture / Home Goods", "personalLiving", "Furniture, home goods, and household item spending.", "furniture|home goods|household items", "annual", "ongoing"],
    ["electronicsReplacement", "Electronics Replacement", "personalLiving", "Electronics replacement and device reserve costs.", "electronics replacement|devices|electronics", "annual", "ongoing"],
    ["computerPhoneReplacement", "Computer / Phone Replacement", "personalLiving", "Computer, phone, and personal technology replacement costs.", "computer replacement|phone replacement|technology replacement", "annual", "ongoing"],
    ["safetyEquipment", "Safety Equipment", "personalLiving", "Safety equipment, alarms, protective equipment, and emergency supplies.", "safety equipment|emergency supplies|protective equipment", "annual", "ongoing"],
    ["homeOrganizationDecor", "Home Organization / Decor", "personalLiving", "Home organization, decor, and nonessential home goods.", "home organization|decor|home decor", "monthly", "ongoing"],
    ["storageMovingSupplies", "Storage / Moving Supplies", "personalLiving", "Storage bins, packing, and moving supplies.", "storage supplies|moving supplies|packing", "annual", "ongoing"],

    ["charitableGiving", "Charitable Giving", "givingCommunity", "Charitable donations and nonprofit giving.", "charitable giving|donations|nonprofit", "monthly", "ongoing"],
    ["tithingReligiousGiving", "Tithing / Religious Giving", "givingCommunity", "Tithing and religious giving that should be advisor-confirmed before compression.", "tithing|religious giving|church giving|temple giving", "monthly", "ongoing"],
    ["remittancesFamilyAssistance", "Remittances / Family Assistance", "givingCommunity", "Remittances and family assistance that should be advisor-confirmed before compression.", "remittances|family assistance|send money|family support", "monthly", "ongoing"],
    ["giftsHolidaysCelebrations", "Gifts / Holidays / Celebrations", "givingCommunity", "Gift, holiday, birthday, and celebration spending.", "gifts|holidays|celebrations|birthdays", "annual", "ongoing"],
    ["weddingsFamilyEvents", "Weddings / Family Events", "givingCommunity", "Weddings, reunions, graduations, and family event spending.", "weddings|family events|reunions|graduations", "annual", "ongoing"],
    ["funeralAttendanceFamilyTravel", "Funeral Attendance / Family Travel", "givingCommunity", "Travel and costs to attend family funerals or obligations.", "funeral attendance|family travel|obligation travel", "oneTime", "oneTime"],
    ["communityDues", "Community Dues", "givingCommunity", "Community dues, neighborhood dues, and local obligations.", "community dues|neighborhood dues|local dues", "annual", "ongoing"],
    ["politicalContributions", "Political Contributions", "givingCommunity", "Political contributions and civic donations.", "political contributions|campaign donations|civic giving", "annual", "ongoing"],

    ["petFoodSupplies", "Pet Food & Supplies", "pets", "Pet food and supplies.", "pet food|pet supplies|animal supplies", "monthly", "ongoing"],
    ["veterinaryCare", "Veterinary Care", "pets", "Veterinary care and routine pet medical costs.", "veterinary|vet care|animal medical", "annual", "ongoing"],
    ["petMedication", "Pet Medication", "pets", "Pet medication and recurring animal prescriptions.", "pet medication|animal medication|pet prescriptions", "monthly", "ongoing"],
    ["petBoarding", "Pet Boarding", "pets", "Pet boarding, sitting, and daycare costs.", "pet boarding|pet sitting|pet daycare", "monthly", "ongoing"],
    ["petGroomingTraining", "Pet Grooming / Training", "pets", "Pet grooming, training, and behavior support.", "pet grooming|pet training|animal training", "monthly", "ongoing"],
    ["emergencyVetReserve", "Emergency Vet Reserve", "pets", "Reserve for emergency veterinary care.", "emergency vet|vet reserve|pet emergency", "monthly", "ongoing"],
    ["petRentFees", "Pet Rent / Pet Fees", "pets", "Pet rent, deposits, and housing-related pet fees.", "pet rent|pet fees|pet deposit", "monthly", "ongoing"],

    ["financialPlanningFees", "Financial Planning Fees", "legalAdministrative", "Financial planning fees and planning retainers.", "financial planning|planning fee|advisor planning", "annual", "ongoing"],
    ["investmentAdvisoryFees", "Investment Advisory Fees", "legalAdministrative", "Investment advisory, AUM, platform, or portfolio management fees.", "investment advisory|aum fee|portfolio fee", "annual", "ongoing"],
    ["cpaTaxPrep", "CPA / Tax Prep", "legalAdministrative", "CPA and tax preparation fees.", "cpa|tax prep|tax accountant", "annual", "ongoing"],
    ["bookkeeping", "Bookkeeping", "legalAdministrative", "Bookkeeping and administrative accounting expense.", "bookkeeping|bookkeeper|accounting admin", "monthly", "ongoing"],
    ["estateAttorneyProbateTrusteeExecutorFees", "Estate Attorney / Probate / Trustee / Executor Fees", "legalAdministrative", "Estate attorney, probate, trustee, and executor fees.", "estate attorney|probate|trustee|executor", "oneTime", "oneTime"],
    ["legalFeesCourtFees", "Legal Fees / Court Fees", "legalAdministrative", "Legal fees, court costs, and related professional expenses.", "legal fees|court fees|attorney|lawyer", "oneTime", "oneTime"],
    ["immigrationAttorneyFilingFees", "Immigration Attorney / Filing Fees", "legalAdministrative", "Immigration attorney, filing, and documentation fees.", "immigration attorney|filing fees|visa fees", "oneTime", "oneTime"],
    ["licensingCredentialFees", "Licensing / Credential Fees", "legalAdministrative", "Licensing, credential, renewal, and professional qualification fees.", "licensing|credential fees|license renewal", "annual", "ongoing"],
    ["unionDues", "Union Dues", "legalAdministrative", "Union dues and labor organization costs.", "union dues|labor dues|union", "monthly", "ongoing"],
    ["professionalAssociationDues", "Professional Association Dues", "legalAdministrative", "Professional association, board, and industry dues.", "professional association|association dues|industry dues", "annual", "ongoing"],
    ["continuingEducation", "Continuing Education", "legalAdministrative", "Continuing education, CE, and professional development costs.", "continuing education|ce credits|professional development", "annual", "ongoing"],
    ["notaryDocumentFees", "Notary / Document Fees", "legalAdministrative", "Notary, document, filing, and administrative fees.", "notary|document fees|filing fees", "oneTime", "oneTime"],

    ["officeRentCoworking", "Office Rent / Coworking", "businessSelfEmployment", "Office rent, coworking, and workspace costs.", "office rent|coworking|workspace", "monthly", "ongoing"],
    ["businessInsuranceProfessionalLiability", "Business Insurance / Professional Liability", "businessSelfEmployment", "Business insurance and professional liability premiums.", "business insurance|professional liability|e and o", "monthly", "ongoing"],
    ["softwareSaasWebsiteHosting", "Software / SaaS / Website / Hosting", "businessSelfEmployment", "Business software, SaaS, website, hosting, and domain costs.", "software|saas|website|hosting|domain", "monthly", "ongoing"],
    ["marketingAdvertising", "Marketing / Advertising", "businessSelfEmployment", "Marketing, advertising, sponsorship, and lead generation costs.", "marketing|advertising|ads|lead generation", "monthly", "ongoing"],
    ["contractorPayrollCosts", "Contractor / Payroll Costs", "businessSelfEmployment", "Contractor, payroll, subcontractor, and staffing costs.", "contractor|payroll|subcontractor|staffing", "monthly", "ongoing"],
    ["businessAccountingBookkeeping", "Accounting / Bookkeeping", "businessSelfEmployment", "Business accounting and bookkeeping costs.", "business accounting|bookkeeping|accountant", "monthly", "ongoing"],
    ["businessLoanCreditCardPayment", "Business Loan / Credit Card Payment", "businessSelfEmployment", "Business debt service payment display category. Prefer Debt Records for generated payment ownership.", "business loan payment|business credit card payment|business debt", "monthly", "ongoing", { uiAvailability: "future", isAddable: false, sourcePath: "protectionModeling.data.debtRecords", duplicateProtection: "debtRecords-generated-payment-source" }],
    ["inventorySupplies", "Inventory / Supplies", "businessSelfEmployment", "Business inventory, supplies, materials, and cost of goods.", "inventory|business supplies|materials|cogs", "monthly", "ongoing"],
    ["equipmentLease", "Equipment Lease", "businessSelfEmployment", "Business equipment lease and rental costs.", "equipment lease|equipment rental|machinery lease", "monthly", "ongoing"],
    ["businessVehicleCosts", "Business Vehicle Costs", "businessSelfEmployment", "Business vehicle operation, lease, fuel, maintenance, and mileage costs.", "business vehicle|mileage|vehicle costs", "monthly", "ongoing"],
    ["licensesPermitsFranchiseFees", "Licenses / Permits / Franchise Fees", "businessSelfEmployment", "Business licenses, permits, registrations, and franchise fees.", "licenses|permits|franchise fees|business registration", "annual", "ongoing"],
    ["merchantFeesShippingPostage", "Merchant Fees / Shipping / Postage", "businessSelfEmployment", "Merchant processing, shipping, postage, and fulfillment costs.", "merchant fees|shipping|postage|processing fees", "monthly", "ongoing"],
    ["clientEntertainment", "Client Entertainment", "businessSelfEmployment", "Client meals, entertainment, relationship, and business development expenses.", "client entertainment|client meals|business development", "monthly", "ongoing"],
    ["businessTaxReserve", "Business Tax Reserve", "businessSelfEmployment", "Business tax reserve or set-aside contribution.", "business tax reserve|tax set aside|business taxes", "monthly", "ongoing"],
    ["ownerDrawGap", "Owner Draw Gap", "businessSelfEmployment", "Owner draw or compensation gap needed to preserve household income.", "owner draw|owner compensation|draw gap", "monthly", "ongoing"],

    ["bankFees", "Bank Fees", "bankingFinanceCharges", "Bank service charges and account fees.", "bank fees|service charges|account fees", "monthly", "ongoing"],
    ["overdraftFees", "Overdraft Fees", "bankingFinanceCharges", "Overdraft and nonsufficient funds fees.", "overdraft|nsf|insufficient funds", "monthly", "ongoing"],
    ["atmCheckCashingMoneyOrderFees", "ATM / Check Cashing / Money Order Fees", "bankingFinanceCharges", "ATM, check cashing, money order, and cash access fees.", "atm fees|check cashing|money order|cash access", "monthly", "ongoing"],
    ["creditCardInterest", "Credit Card Interest", "bankingFinanceCharges", "Credit card interest and finance charges.", "credit card interest|finance charges|card interest", "monthly", "ongoing"],
    ["loanOriginationRefinanceCosts", "Loan Origination / Refinance Costs", "bankingFinanceCharges", "Loan origination, refinance, and closing cost fees.", "loan origination|refinance costs|closing costs", "oneTime", "oneTime"],
    ["wireTransferFees", "Wire / Transfer Fees", "bankingFinanceCharges", "Wire, transfer, ACH, and payment transfer fees.", "wire fees|transfer fees|ach fees", "monthly", "ongoing"],
    ["investmentAccountFees", "Investment Account Fees", "bankingFinanceCharges", "Investment account platform, custody, and administrative fees.", "investment account fees|custody fees|platform fees", "annual", "ongoing"],
    ["safeDepositBox", "Safe Deposit Box", "bankingFinanceCharges", "Safe deposit box rental fee.", "safe deposit box|deposit box", "annual", "ongoing"],
    ["creditMonitoringIdentityProtection", "Credit Monitoring / Identity Protection", "bankingFinanceCharges", "Credit monitoring, identity protection, and fraud monitoring services.", "credit monitoring|identity protection|fraud monitoring", "monthly", "ongoing"],

    ["annualInsurancePremiums", "Annual Insurance Premiums", "periodicSinkingFund", "Annual insurance premiums and renewal costs.", "annual insurance|insurance renewal|premium", "annual", "ongoing"],
    ["annualPropertyTaxes", "Annual Property Taxes", "periodicSinkingFund", "Annual property tax bill or escrow true-up.", "annual property tax|property tax bill|tax true up", "annual", "ongoing"],
    ["annualVehicleRegistration", "Annual Vehicle Registration", "periodicSinkingFund", "Annual vehicle registration and renewal fees.", "annual vehicle registration|registration renewal|tags", "annual", "ongoing"],
    ["annualSchoolFees", "Annual School Fees", "periodicSinkingFund", "Annual school fees and required school-year costs.", "annual school fees|school year fees|school costs", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["holidaySeasonalSpending", "Holiday / Seasonal Spending", "periodicSinkingFund", "Holiday and seasonal spending.", "holiday spending|seasonal spending|christmas|holidays", "annual", "ongoing"],
    ["backToSchoolCosts", "Back-to-School Costs", "periodicSinkingFund", "Back-to-school clothing, supplies, fees, and technology costs.", "back to school|school supplies|school year", "annual", "fixedYears", { suggestedTermYears: 5 }],
    ["medicalDeductibleExposure", "Medical Deductible Exposure", "periodicSinkingFund", "Annual medical deductible exposure or reserve.", "medical deductible|deductible exposure|health reserve", "annual", "ongoing"],
    ["homeRepairReserve", "Home Repair Reserve", "periodicSinkingFund", "Reserve for home repair and maintenance events.", "home repair reserve|maintenance reserve|home reserve", "monthly", "ongoing"],
    ["autoRepairReserve", "Auto Repair Reserve", "periodicSinkingFund", "Reserve for auto repairs, tires, and major vehicle maintenance.", "auto repair reserve|car repair reserve|vehicle reserve", "monthly", "ongoing"],
    ["applianceTechFurnitureReplacement", "Appliance / Tech / Furniture Replacement", "periodicSinkingFund", "Reserve for appliance, technology, and furniture replacement.", "appliance tech furniture|replacement reserve|home goods reserve", "monthly", "ongoing"],
    ["homeAssessment", "Home Assessment", "periodicSinkingFund", "Home assessment, special assessment, or property assessment expense.", "home assessment|special assessment|property assessment", "oneTime", "oneTime"],
    ["movingCosts", "Moving Costs", "periodicSinkingFund", "Moving, packing, truck, mover, and relocation costs.", "moving costs|relocation|movers", "oneTime", "oneTime"],
    ["funeralBurialCosts", "Funeral / Burial Costs", "periodicSinkingFund", "Funeral and burial cost planning entry.", "funeral costs|burial costs|final expenses", "oneTime", "oneTime"],
    ["emergencyTravel", "Emergency Travel", "periodicSinkingFund", "Emergency travel for family, medical, funeral, or crisis needs.", "emergency travel|crisis travel|urgent travel", "oneTime", "oneTime"],
    ["legalSettlementJudgment", "Legal Settlement / Judgment", "periodicSinkingFund", "Legal settlement, judgment, or one-time court obligation.", "legal settlement|judgment|court judgment", "oneTime", "oneTime"],
    ["taxBillTrueUp", "Tax Bill / True-Up", "periodicSinkingFund", "Tax bill, true-up, or one-time tax shortfall.", "tax bill|tax true up|tax shortfall", "oneTime", "oneTime"],
    ["otherCustomExpense", "Other / Custom Expense", "customExpense", "Other advisor-defined custom expense.", "other custom expense|miscellaneous expense|custom", "monthly", "ongoing", { isCustomType: true }]
  ]);

  function getExpenseTaxonomyApi() {
    return lensAnalysis.expenseTaxonomy && typeof lensAnalysis.expenseTaxonomy === "object"
      ? lensAnalysis.expenseTaxonomy
      : {};
  }

  function splitSearchTerms(value) {
    return String(value == null ? "" : value)
      .split("|")
      .map(function (term) {
        return term.trim();
      })
      .filter(Boolean);
  }

  function getCategory(categoryKey) {
    const taxonomy = getExpenseTaxonomyApi();
    if (typeof taxonomy.getExpenseCategory === "function") {
      return taxonomy.getExpenseCategory(categoryKey);
    }

    const categories = Array.isArray(taxonomy.DEFAULT_EXPENSE_CATEGORIES)
      ? taxonomy.DEFAULT_EXPENSE_CATEGORIES
      : [];
    return categories.find(function (category) {
      return category && category.categoryKey === categoryKey;
    }) || null;
  }

  function isValidFrequency(frequency) {
    const taxonomy = getExpenseTaxonomyApi();
    return typeof taxonomy.isValidExpenseFrequency === "function"
      ? taxonomy.isValidExpenseFrequency(frequency)
      : false;
  }

  function isValidTermType(termType) {
    const taxonomy = getExpenseTaxonomyApi();
    return typeof taxonomy.isValidExpenseTermType === "function"
      ? taxonomy.isValidExpenseTermType(termType)
      : false;
  }

  function normalizeUiAvailability(typeKey, value) {
    if (EXPENSE_UI_AVAILABILITY_VALUES.indexOf(value) !== -1) {
      return value;
    }

    const mappedAvailability = EXPENSE_UI_AVAILABILITY_BY_TYPE_KEY[typeKey];
    if (EXPENSE_UI_AVAILABILITY_VALUES.indexOf(mappedAvailability) !== -1) {
      return mappedAvailability;
    }

    return "initial";
  }

  function normalizeContinuationStatus(value, fallback) {
    const normalized = String(value == null ? "" : value).trim();
    if (EXPENSE_CONTINUATION_STATUS_VALUES.indexOf(normalized) !== -1) {
      return normalized;
    }

    const fallbackStatus = String(fallback == null ? "" : fallback).trim();
    return EXPENSE_CONTINUATION_STATUS_VALUES.indexOf(fallbackStatus) !== -1
      ? fallbackStatus
      : "review";
  }

  function includesValue(values, value) {
    return values.indexOf(value) !== -1;
  }

  const HEALTHCARE_CATEGORY_KEYS = Object.freeze([
    "ongoingHealthcare",
    "dentalCare",
    "visionCare",
    "mentalHealthCare",
    "longTermCare",
    "homeHealthCare",
    "medicalEquipment",
    "otherHealthcare",
    "medicalFinalExpense"
  ]);

  const EDUCATION_CATEGORY_KEYS = Object.freeze([
    "educationExpense",
    "childActivityExpense",
    "childcareEducation"
  ]);

  const BUSINESS_CATEGORY_KEYS = Object.freeze([
    "businessOverhead",
    "professionalServices",
    "keyPersonReplacementExpense",
    "businessSelfEmployment"
  ]);

  const FINAL_EXPENSE_CATEGORY_KEYS = Object.freeze([
    "medicalFinalExpense",
    "funeralBurial",
    "estateSettlement",
    "otherFinalExpense"
  ]);

  const HEALTHCARE_CARE_CATEGORY_KEYS = Object.freeze([
    "ongoingHealthcare",
    "dentalCare",
    "visionCare",
    "mentalHealthCare",
    "longTermCare",
    "homeHealthCare",
    "medicalEquipment",
    "otherHealthcare"
  ]);

  const DINING_TAKEOUT_TYPE_KEYS = Object.freeze([
    "diningTakeout",
    "diningOutRestaurants",
    "takeoutConvenienceFood",
    "mealDeliveryServices",
    "alcoholSocialBeverages"
  ]);

  const HOUSEHOLD_SERVICES_TYPE_KEYS = Object.freeze([
    "householdServices",
    "houseCleaning",
    "lawnSnowPestPoolServices",
    "dryCleaningLaundry",
    "homeSecurityMonitoring",
    "securitySystem"
  ]);

  const HOUSEHOLD_CONSUMABLE_TYPE_KEYS = Object.freeze([
    "householdConsumablesSupplies",
    "householdSupplies"
  ]);

  const CHILDCARE_DEPENDENT_SUPPORT_TYPE_KEYS = Object.freeze([
    "diapersBabySupplies",
    "formulaInfantSupplies"
  ]);

  const COMMUNICATIONS_CONNECTIVITY_TYPE_KEYS = Object.freeze([
    "internetPhone",
    "internet",
    "mobilePhone",
    "landline",
    "cableTv",
    "streamingInternetBundle"
  ]);

  const VEHICLE_OWNERSHIP_MAINTENANCE_TYPE_KEYS = Object.freeze([
    "vehicleInsurance",
    "vehicleMaintenance",
    "tiresMajorAutoRepair",
    "registrationInspectionEmissions",
    "vehicleReplacementFund",
    "motorcycleRvBoatCosts",
    "vehicleRvBoatStorage",
    "vehicleMiscellaneous",
    "annualVehicleRegistration",
    "autoRepairReserve"
  ]);

  const SUBSCRIPTIONS_MEMBERSHIPS_TYPE_KEYS = Object.freeze([
    "subscriptionsMemberships",
    "streamingDigitalSubscriptions",
    "gymFitnessMemberships",
    "clubsSocialMemberships"
  ]);

  const PETS_DISCRETIONARY_TYPE_KEYS = Object.freeze([
    "petBoarding",
    "petGroomingTraining"
  ]);

  const PLANNING_BUCKET_KEY_BY_TYPE_KEY = Object.freeze({
    schoolMeals: "foodAtHomeConsumables",
    childActivitiesSports: "entertainmentRecreation",
    extracurricularLessonsActivities: "entertainmentRecreation",
    youthSportsTravelSports: "entertainmentRecreation",
    activityFieldTripFees: "entertainmentRecreation",
    musicSportsClubEnrichment: "entertainmentRecreation",
    healthInsurancePremiums: "insurancePremiums",
    medicarePartBPremiums: "insurancePremiums",
    medicarePartDPremiums: "insurancePremiums",
    medigapPremiums: "insurancePremiums",
    medicareAdvantagePremiums: "insurancePremiums",
    cobraPremiums: "insurancePremiums",
    dentalInsurance: "insurancePremiums",
    visionInsurance: "insurancePremiums",
    longTermCareInsurancePremiums: "insurancePremiums",
    homeownersInsurance: "insurancePremiums",
    housingInsuranceDefault: "insurancePremiums",
    vehicleInsurance: "insurancePremiums",
    financialPlanningFees: "financialFeesTransactionCosts",
    investmentAdvisoryFees: "financialFeesTransactionCosts",
    bookkeeping: "financialFeesTransactionCosts",
    licensingCredentialFees: "businessSelfEmployment",
    unionDues: "businessSelfEmployment",
    professionalAssociationDues: "businessSelfEmployment",
    continuingEducation: "businessSelfEmployment",
    giftsHolidaysCelebrations: "entertainmentRecreation",
    holidaySeasonalSpending: "entertainmentRecreation",
    weddingsFamilyEvents: "entertainmentRecreation",
    timeshareVacationClubFees: "travelVacations",
    utilityArrearsPaymentPlan: "basicUtilities",
    solarLoanLeasePayment: "basicUtilities"
  });

  const PLANNING_METADATA_OVERRIDES_BY_TYPE_KEY = Object.freeze({
    timeshareVacationClubFees: Object.freeze({
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "contractualObligation"
    }),
    utilityArrearsPaymentPlan: Object.freeze({
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "contractualObligation",
      inflationBucketKey: "noInflationCurrentDollar"
    }),
    solarLoanLeasePayment: Object.freeze({
      lifestyleTreatmentIncluded: false,
      lifestyleTreatmentReason: "contractualObligation",
      inflationBucketKey: "noInflationCurrentDollar"
    })
  });

  const PERIODIC_FINAL_EXPENSE_TYPE_KEYS = Object.freeze([
    "funeralBurialCosts"
  ]);

  const PERIODIC_HEALTHCARE_TYPE_KEYS = Object.freeze([
    "medicalDeductibleExposure"
  ]);

  const PERIODIC_EDUCATION_TYPE_KEYS = Object.freeze([
    "annualSchoolFees",
    "backToSchoolCosts"
  ]);

  const PERIODIC_INSURANCE_TYPE_KEYS = Object.freeze([
    "annualInsurancePremiums"
  ]);

  const PERIODIC_HOUSING_TYPE_KEYS = Object.freeze([
    "annualPropertyTaxes"
  ]);

  const PERIODIC_TAX_LEGAL_TYPE_KEYS = Object.freeze([
    "legalSettlementJudgment",
    "taxBillTrueUp"
  ]);

  const EARLY_COMPRESSIBLE_TYPE_KEYS = Object.freeze([
    "diningTakeout",
    "diningOutRestaurants",
    "takeoutConvenienceFood",
    "mealDeliveryServices",
    "groceryDeliveryFeesTips",
    "alcoholSocialBeverages",
    "entertainmentRecreation",
    "streamingDigitalSubscriptions",
    "gymFitnessMemberships",
    "clubsSocialMemberships",
    "hobbiesRecreationGear",
    "eventsConcertsSportingEvents",
    "gamingInAppPurchases",
    "booksMediaMusic",
    "dateNightsFamilyOutings",
    "personalSpendingAllowance",
    "miscellaneousLifestyleSpending",
    "tobaccoVaping",
    "lotteryGamblingSpend",
    "luxuryPurchases",
    "seasonalActivitiesRecreationPasses",
    "vacationsTravel",
    "weekendShortTrips",
    "travelTransportation",
    "lodging",
    "travelFoodEntertainment",
    "travelInsuranceDocumentsGear",
    "timeshareVacationClubFees",
    "discretionaryTravelEntertainment",
    "recurringPersonalSpendingDefault",
    "subscriptionsMemberships",
    "homeOrganizationDecor",
    "clientEntertainment"
  ]);

  const PROTECTED_ESSENTIAL_TYPE_KEYS = Object.freeze([
    "groceries",
    "householdConsumablesSupplies",
    "specialtyDietAllergyFoodPremium",
    "rentOrMortgagePayment",
    "propertyTaxes",
    "monthlyPropertyTaxDefault",
    "homeownersInsurance",
    "housingInsuranceDefault",
    "homeMaintenanceRepairs",
    "monthlyHomeMaintenanceDefault",
    "hoaDues",
    "householdUtilities",
    "electricity",
    "gasHeatingFuelPropaneOil",
    "waterSewer",
    "trashRecycling",
    "internet",
    "mobilePhone",
    "internetPhone",
    "fuel",
    "transportationFuel",
    "publicTransit",
    "vehicleInsurance",
    "vehicleMaintenance",
    "autoInsurance",
    "registrationInspectionEmissions",
    "parkingTollsCommuting",
    "daycareChildcare",
    "childcareExpense",
    "dependentSupportExpense",
    "earlyEducationChildcare",
    "healthInsurancePremiums",
    "medicalOutOfPocket",
    "healthcareOutOfPocketSupportDefault",
    "prescriptionMedications",
    "chronicConditionSupplies",
    "deductibleAnnualExposureReserve",
    "mentalHealthCare",
    "medicalDeductibleExposure",
    "disabilityInsurancePremiums",
    "lifeInsurancePremiums",
    "termLifePremiums",
    "permanentLifePremiums"
  ]);

  const SAVINGS_CONTRIBUTION_TYPE_KEYS = Object.freeze([
    "hsaContributions",
    "retirementContributions",
    "brokerageInvestmentContributions",
    "educationSavingsContributions",
    "emergencyFundContributions",
    "sinkingFundContributions",
    "vacationLifestyleGoalContributions",
    "vehicleReplacementContributions",
    "homeRepairReserveContributions",
    "taxReserveContributions",
    "businessReserveContributions",
    "charitableGivingReserve",
    "familyEventWeddingSavings",
    "downPaymentSavings",
    "otherGoalSavings"
  ]);

  const ADVISOR_CONFIRMATION_TYPE_KEYS = Object.freeze([
    "charitableGiving",
    "tithingReligiousGiving",
    "remittancesFamilyAssistance",
    "childSupportPaid",
    "alimonyPaid",
    "legalFeesCourtFees",
    "legalSettlementJudgment",
    "estateAttorneyProbateTrusteeExecutorFees",
    "immigrationAttorneyFilingFees",
    "taxBillTrueUp",
    "taxPenaltyPaymentPlan",
    "taxDebtIrsPaymentPlan",
    "quarterlyEstimatedTaxes",
    "selfEmploymentTax",
    "businessTaxPayments",
    "businessTaxReserve",
    "ownerDrawGap",
    "officeRentCoworking",
    "businessInsuranceProfessionalLiability",
    "contractorPayrollCosts",
    "inventorySupplies",
    "equipmentLease",
    "businessVehicleCosts",
    "merchantFeesShippingPostage"
  ]);

  function normalizeMetadataToken(value, allowedValues, fallback) {
    const normalized = String(value == null ? "" : value).trim();
    return allowedValues.indexOf(normalized) !== -1 ? normalized : fallback;
  }

  function isGeneratedDebtPaymentEntry(options) {
    return options.generatedOnly === true
      || options.sourceOwnedBy === "debtRecords"
      || options.sourcePath === "protectionModeling.data.debtRecords";
  }

  function isSavingsContributionType(typeKey, categoryKey) {
    return categoryKey === "savingsGoalContributions"
      || includesValue(SAVINGS_CONTRIBUTION_TYPE_KEYS, typeKey);
  }

  function getExpensePlanningBucketMetadata(planningBucketKey) {
    const normalizedPlanningBucketKey = String(planningBucketKey == null ? "" : planningBucketKey).trim();
    const bucket = EXPENSE_PLANNING_BUCKETS_BY_KEY[normalizedPlanningBucketKey] || EXPENSE_PLANNING_BUCKETS_BY_KEY.customUnknown;
    return Object.assign({}, bucket);
  }

  function getExpensePlanningEntryMetadata(typeKey, planningBucketKey) {
    const metadata = getExpensePlanningBucketMetadata(planningBucketKey);
    const overrides = PLANNING_METADATA_OVERRIDES_BY_TYPE_KEY[typeKey];
    return overrides ? Object.assign(metadata, overrides) : metadata;
  }

  function inferPlanningBucketKey(typeKey, categoryKey, category, options) {
    const explicitPlanningBucketKey = normalizeMetadataToken(options.planningBucketKey, EXPENSE_PLANNING_BUCKET_KEYS, null);
    if (explicitPlanningBucketKey) {
      return explicitPlanningBucketKey;
    }

    if (isGeneratedDebtPaymentEntry(options) || categoryKey === "debtObligations") {
      return "debtObligations";
    }

    if (isSavingsContributionType(typeKey, categoryKey)) {
      return "savingsGoalContributions";
    }

    if (PLANNING_BUCKET_KEY_BY_TYPE_KEY[typeKey]) {
      return PLANNING_BUCKET_KEY_BY_TYPE_KEY[typeKey];
    }

    if (includesValue(FINAL_EXPENSE_CATEGORY_KEYS, categoryKey) || includesValue(PERIODIC_FINAL_EXPENSE_TYPE_KEYS, typeKey)) {
      return "finalExpenses";
    }

    if (includesValue(HEALTHCARE_CARE_CATEGORY_KEYS, categoryKey) || includesValue(PERIODIC_HEALTHCARE_TYPE_KEYS, typeKey)) {
      return "healthcareCare";
    }

    if (includesValue(EDUCATION_CATEGORY_KEYS, categoryKey) || includesValue(PERIODIC_EDUCATION_TYPE_KEYS, typeKey)) {
      return "educationEnrichment";
    }

    if (includesValue(HOUSEHOLD_SERVICES_TYPE_KEYS, typeKey)) {
      return "householdServices";
    }

    if (includesValue(DINING_TAKEOUT_TYPE_KEYS, typeKey)) {
      return "diningTakeout";
    }

    if (includesValue(HOUSEHOLD_CONSUMABLE_TYPE_KEYS, typeKey)) {
      return "householdConsumables";
    }

    if (includesValue(CHILDCARE_DEPENDENT_SUPPORT_TYPE_KEYS, typeKey)) {
      return "childcareDependentSupport";
    }

    if (includesValue(SUBSCRIPTIONS_MEMBERSHIPS_TYPE_KEYS, typeKey)) {
      return "subscriptionsMemberships";
    }

    if (includesValue(PERIODIC_HOUSING_TYPE_KEYS, typeKey)) {
      return "housingCore";
    }

    if (includesValue(VEHICLE_OWNERSHIP_MAINTENANCE_TYPE_KEYS, typeKey)) {
      return "vehicleOwnershipMaintenance";
    }

    if (includesValue(PERIODIC_INSURANCE_TYPE_KEYS, typeKey) || categoryKey === "insurancePremiums") {
      return "insurancePremiums";
    }

    if (includesValue(PERIODIC_TAX_LEGAL_TYPE_KEYS, typeKey)
      || categoryKey === "taxes"
      || categoryKey === "legalAdministrative") {
      return "taxesLegalAdministrative";
    }

    if (includesValue(BUSINESS_CATEGORY_KEYS, categoryKey)) {
      return "businessSelfEmployment";
    }

    if (categoryKey === "housingExpense") {
      return "housingCore";
    }

    if (categoryKey === "utilities") {
      return includesValue(COMMUNICATIONS_CONNECTIVITY_TYPE_KEYS, typeKey)
        ? "communicationsConnectivity"
        : "basicUtilities";
    }

    if (categoryKey === "foodGroceries") {
      return "foodAtHomeConsumables";
    }

    if (categoryKey === "transportation") {
      return includesValue(VEHICLE_OWNERSHIP_MAINTENANCE_TYPE_KEYS, typeKey)
        ? "vehicleOwnershipMaintenance"
        : "transportationBasics";
    }

    if (categoryKey === "childcare" || categoryKey === "dependentSupport" || categoryKey === "familySupport") {
      return "childcareDependentSupport";
    }

    if (categoryKey === "personalLiving") {
      if (typeKey === "discretionaryTravelEntertainment") {
        return "entertainmentRecreation";
      }

      return "personalLivingClothing";
    }

    if (categoryKey === "discretionaryLifestyle") {
      return "entertainmentRecreation";
    }

    if (categoryKey === "travelVacations") {
      return "travelVacations";
    }

    if (categoryKey === "givingCommunity") {
      return "givingCommunity";
    }

    if (categoryKey === "pets" || typeKey === "petCare") {
      return includesValue(PETS_DISCRETIONARY_TYPE_KEYS, typeKey)
        ? "petsDiscretionary"
        : "petsCoreCare";
    }

    if (categoryKey === "bankingFinanceCharges") {
      return "financialFeesTransactionCosts";
    }

    if (categoryKey === "periodicSinkingFund") {
      return "periodicSinkingFundOneTime";
    }

    if (categoryKey === "customExpense") {
      return "customUnknown";
    }

    if (category && category.domain === "business") {
      return "businessSelfEmployment";
    }

    return "customUnknown";
  }

  function inferSourceOwnedBy(options) {
    if (options.sourceOwnedBy) {
      return options.sourceOwnedBy;
    }

    if (isGeneratedDebtPaymentEntry(options)) {
      return "debtRecords";
    }

    if (options.isScalarFieldOwned === true || options.ownedByField) {
      return "pmiScalarField";
    }

    return null;
  }

  function inferDefaultNeedType(typeKey, categoryKey, category, options) {
    if (isGeneratedDebtPaymentEntry(options) || categoryKey === "debtObligations") {
      return "debtObligation";
    }

    if (includesValue(FINAL_EXPENSE_CATEGORY_KEYS, categoryKey)) {
      return "finalExpense";
    }

    if (isSavingsContributionType(typeKey, categoryKey)) {
      return "savingsContribution";
    }

    if (categoryKey === "taxes" || categoryKey === "legalAdministrative") {
      return "legalObligation";
    }

    if (includesValue(BUSINESS_CATEGORY_KEYS, categoryKey)) {
      return "businessIncomePreserving";
    }

    if (categoryKey === "customExpense") {
      return "custom";
    }

    if (includesValue(EARLY_COMPRESSIBLE_TYPE_KEYS, typeKey) || categoryKey === "discretionaryLifestyle" || categoryKey === "travelVacations") {
      return "discretionary";
    }

    if (
      includesValue(PROTECTED_ESSENTIAL_TYPE_KEYS, typeKey)
      || includesValue(HEALTHCARE_CATEGORY_KEYS, categoryKey)
      || categoryKey === "housingExpense"
      || categoryKey === "utilities"
    ) {
      return "protectedEssential";
    }

    if (category && category.domain === "living") {
      return "flexibleEssential";
    }

    return "rawReview";
  }

  function inferRequiresAdvisorConfirmation(typeKey, categoryKey, category, options) {
    if (options.requiresAdvisorConfirmation === true) {
      return true;
    }

    return isGeneratedDebtPaymentEntry(options)
      || includesValue(HEALTHCARE_CATEGORY_KEYS, categoryKey)
      || includesValue(EDUCATION_CATEGORY_KEYS, categoryKey)
      || includesValue(BUSINESS_CATEGORY_KEYS, categoryKey)
      || categoryKey === "taxes"
      || categoryKey === "legalAdministrative"
      || categoryKey === "debtObligations"
      || includesValue(ADVISOR_CONFIRMATION_TYPE_KEYS, typeKey)
      || (category && category.isFinalExpenseComponent === true);
  }

  function inferProtectedCategory(typeKey, categoryKey, category, defaultNeedType, options) {
    if (options.protectedCategory === true || options.isProtected === true) {
      return true;
    }

    return defaultNeedType === "protectedEssential"
      || defaultNeedType === "finalExpense"
      || defaultNeedType === "legalObligation"
      || defaultNeedType === "debtObligation"
      || includesValue(PROTECTED_ESSENTIAL_TYPE_KEYS, typeKey)
      || (category && category.isFinalExpenseComponent === true);
  }

  function inferPriorityClass(typeKey, categoryKey, defaultNeedType, protectedCategory, options) {
    if (isGeneratedDebtPaymentEntry(options)) {
      return "generated";
    }

    if (isSavingsContributionType(typeKey, categoryKey)) {
      return "pauseCandidate";
    }

    if (protectedCategory) {
      return "protected";
    }

    if (defaultNeedType === "discretionary") {
      return "discretionary";
    }

    if (defaultNeedType === "flexibleEssential") {
      return "flexible";
    }

    if (defaultNeedType === "businessIncomePreserving") {
      return "essential";
    }

    return "rawReview";
  }

  function inferCompressionTier(typeKey, categoryKey, defaultNeedType, requiresAdvisorConfirmation, protectedCategory, options) {
    if (isGeneratedDebtPaymentEntry(options)) {
      return "generatedOnly";
    }

    if (isSavingsContributionType(typeKey, categoryKey)) {
      return "pauseCandidate";
    }

    if (includesValue(EARLY_COMPRESSIBLE_TYPE_KEYS, typeKey) || defaultNeedType === "discretionary") {
      return "early";
    }

    if (requiresAdvisorConfirmation) {
      return "advisorConfirmed";
    }

    if (protectedCategory) {
      return "none";
    }

    if (defaultNeedType === "flexibleEssential") {
      return "late";
    }

    return "rawReview";
  }

  function inferFormulaOwnerNow(typeKey, category, options) {
    if (options.formulaOwnerNow) {
      return options.formulaOwnerNow;
    }

    if (options.isScalarFieldOwned === true && category && category.isFinalExpenseComponent === true) {
      return "pmi-final-expense-scalar";
    }

    return null;
  }

  function inferFormulaActiveNow(category, options) {
    if (Object.prototype.hasOwnProperty.call(options, "formulaActiveNow")) {
      return options.formulaActiveNow === true;
    }

    return options.isScalarFieldOwned === true
      && category
      && category.isFinalExpenseComponent === true;
  }

  function inferBehaviorMetadata(definition, category, options) {
    const typeKey = definition[0];
    const categoryKey = definition[2];
    const generatedOnly = options.generatedOnly === true || isGeneratedDebtPaymentEntry(options);
    const defaultNeedType = normalizeMetadataToken(
      options.defaultNeedType,
      EXPENSE_DEFAULT_NEED_TYPE_VALUES,
      inferDefaultNeedType(typeKey, categoryKey, category, options)
    );
    const requiresAdvisorConfirmation = Object.prototype.hasOwnProperty.call(options, "requiresAdvisorConfirmation")
      ? options.requiresAdvisorConfirmation === true
      : inferRequiresAdvisorConfirmation(typeKey, categoryKey, category, options);
    const protectedCategory = Object.prototype.hasOwnProperty.call(options, "protectedCategory")
      ? options.protectedCategory === true
      : inferProtectedCategory(typeKey, categoryKey, category, defaultNeedType, options);
    const priorityClass = normalizeMetadataToken(
      options.priorityClass,
      EXPENSE_PRIORITY_CLASS_VALUES,
      inferPriorityClass(typeKey, categoryKey, defaultNeedType, protectedCategory, options)
    );
    const compressionTier = normalizeMetadataToken(
      options.compressionTier,
      EXPENSE_COMPRESSION_TIER_VALUES,
      inferCompressionTier(typeKey, categoryKey, defaultNeedType, requiresAdvisorConfirmation, protectedCategory, options)
    );
    const triageEligibleLater = Object.prototype.hasOwnProperty.call(options, "triageEligibleLater")
      ? options.triageEligibleLater === true
      : generatedOnly !== true && options.isScalarFieldOwned !== true;
    const interventionCandidate = Object.prototype.hasOwnProperty.call(options, "interventionCandidate")
      ? options.interventionCandidate === true
      : compressionTier === "early" || compressionTier === "medium" || compressionTier === "pauseCandidate";
    const planningBucket = getExpensePlanningEntryMetadata(
      typeKey,
      inferPlanningBucketKey(typeKey, categoryKey, category, options)
    );

    return {
      defaultNeedType,
      priorityClass,
      compressionTier,
      requiresAdvisorConfirmation,
      formulaOwnerNow: inferFormulaOwnerNow(typeKey, category, options),
      formulaActiveNow: inferFormulaActiveNow(category, options),
      triageEligibleLater,
      interventionCandidate,
      sourceOwnedBy: inferSourceOwnedBy(options),
      generatedOnly,
      protectedCategory,
      planningBucketKey: planningBucket.planningBucketKey,
      planningBucketLabel: planningBucket.planningBucketLabel,
      lifestyleTreatmentIncluded: planningBucket.lifestyleTreatmentIncluded,
      lifestyleTreatmentReason: planningBucket.lifestyleTreatmentReason,
      inflationBucketKey: planningBucket.inflationBucketKey,
      notes: options.notes || null
    };
  }

  function getDefaultContinuationStatus(definition, category, options) {
    if (Object.prototype.hasOwnProperty.call(options, "defaultContinuationStatus")) {
      return normalizeContinuationStatus(options.defaultContinuationStatus, "review");
    }

    const typeKey = definition[0];
    if (Object.prototype.hasOwnProperty.call(DEFAULT_CONTINUATION_STATUS_BY_TYPE_KEY, typeKey)) {
      return DEFAULT_CONTINUATION_STATUS_BY_TYPE_KEY[typeKey];
    }

    if (category && category.isFinalExpenseComponent === true) {
      return "continues";
    }

    const domain = category && category.domain;
    if (domain === "education") {
      return "continues";
    }

    return "review";
  }

  function toExpenseLibraryEntry(definition, index) {
    const options = definition[7] && typeof definition[7] === "object" ? definition[7] : {};
    const category = getCategory(definition[2]);
    const categoryLabel = category && category.label ? category.label : definition[2];
    const defaultFrequency = isValidFrequency(definition[5]) ? definition[5] : "monthly";
    const defaultTermType = isValidTermType(definition[6]) ? definition[6] : "ongoing";
    const searchTerms = splitSearchTerms(definition[4]);
    const behaviorMetadata = inferBehaviorMetadata(definition, category, options);

    if (categoryLabel && searchTerms.indexOf(categoryLabel) === -1) {
      searchTerms.push(categoryLabel);
    }

    return Object.freeze({
      libraryEntryKey: definition[0],
      typeKey: definition[0],
      label: definition[1],
      categoryKey: definition[2],
      groupKey: definition[2],
      group: categoryLabel,
      description: definition[3],
      defaultFrequency,
      defaultTermType,
      defaultContinuationStatus: getDefaultContinuationStatus(definition, category, options),
      uiAvailability: normalizeUiAvailability(definition[0], options.uiAvailability),
      suggestedTermYears: Number.isFinite(Number(options.suggestedTermYears))
        ? Number(options.suggestedTermYears)
        : null,
      tags: Object.freeze(searchTerms.slice()),
      searchTerms: Object.freeze(searchTerms),
      isDefaultExpense: options.isDefaultExpense === true,
      isScalarFieldOwned: options.isScalarFieldOwned === true,
      isProtected: options.isProtected === true,
      isAddable: options.isAddable !== false,
      isCustomType: options.isCustomType === true,
      ownedByField: options.ownedByField || null,
      sourcePath: options.sourcePath || null,
      duplicateProtection: options.duplicateProtection || null,
      defaultNeedType: behaviorMetadata.defaultNeedType,
      priorityClass: behaviorMetadata.priorityClass,
      compressionTier: behaviorMetadata.compressionTier,
      requiresAdvisorConfirmation: behaviorMetadata.requiresAdvisorConfirmation,
      formulaOwnerNow: behaviorMetadata.formulaOwnerNow,
      formulaActiveNow: behaviorMetadata.formulaActiveNow,
      triageEligibleLater: behaviorMetadata.triageEligibleLater,
      interventionCandidate: behaviorMetadata.interventionCandidate,
      sourceOwnedBy: behaviorMetadata.sourceOwnedBy,
      generatedOnly: behaviorMetadata.generatedOnly,
      protectedCategory: behaviorMetadata.protectedCategory,
      planningBucketKey: behaviorMetadata.planningBucketKey,
      planningBucketLabel: behaviorMetadata.planningBucketLabel,
      lifestyleTreatmentIncluded: behaviorMetadata.lifestyleTreatmentIncluded,
      lifestyleTreatmentReason: behaviorMetadata.lifestyleTreatmentReason,
      inflationBucketKey: behaviorMetadata.inflationBucketKey,
      notes: behaviorMetadata.notes,
      sortOrder: Number.isFinite(Number(options.sortOrder)) ? Number(options.sortOrder) : (index + 1) * 10
    });
  }

  const EXPENSE_LIBRARY_ENTRIES = Object.freeze(
    RAW_EXPENSE_LIBRARY_ENTRIES
      .concat(ADDITIONAL_COMPRESSED_EXPENSE_LIBRARY_ENTRIES)
      .map(toExpenseLibraryEntry)
  );

  const EXPENSE_LIBRARY_GROUPS = Object.freeze(
    EXPENSE_LIBRARY_ENTRIES.reduce(function (groups, entry) {
      if (entry.group && groups.indexOf(entry.group) === -1) {
        groups.push(entry.group);
      }
      return groups;
    }, [])
  );

  const PROTECTED_SCALAR_EXPENSE_TYPE_KEYS = Object.freeze(
    EXPENSE_LIBRARY_ENTRIES
      .filter(function (entry) {
        return entry.isProtected === true || entry.isScalarFieldOwned === true;
      })
      .map(function (entry) {
        return entry.typeKey;
      })
  );

  function cloneEntry(entry) {
    return Object.assign({}, entry, {
      tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
      searchTerms: Array.isArray(entry.searchTerms) ? entry.searchTerms.slice() : []
    });
  }

  function getExpenseLibraryEntries() {
    return EXPENSE_LIBRARY_ENTRIES.map(cloneEntry);
  }

  function getExpenseLibraryEntry(typeKey) {
    const normalizedTypeKey = String(typeKey == null ? "" : typeKey).trim();
    if (!normalizedTypeKey) {
      return null;
    }

    const entry = EXPENSE_LIBRARY_ENTRIES.find(function (candidate) {
      return candidate.typeKey === normalizedTypeKey
        || candidate.libraryEntryKey === normalizedTypeKey;
    });
    return entry ? cloneEntry(entry) : null;
  }

  function findExpenseLibraryEntry(typeKey) {
    return getExpenseLibraryEntry(typeKey);
  }

  function getExpensePlanningBuckets() {
    return EXPENSE_PLANNING_BUCKETS.map(function (bucket) {
      return Object.assign({}, bucket);
    });
  }

  function getExpensePlanningBucket(planningBucketKey) {
    const normalizedPlanningBucketKey = String(planningBucketKey == null ? "" : planningBucketKey).trim();
    const bucket = EXPENSE_PLANNING_BUCKETS_BY_KEY[normalizedPlanningBucketKey];
    return bucket ? Object.assign({}, bucket) : null;
  }

  function getCommonExpenseRecordSourceFields() {
    return COMMON_EXPENSE_RECORD_SOURCE_FIELDS.map(function (field) {
      return Object.assign({}, field);
    });
  }

  function getCommonExpenseRecordSourceField(typeKey) {
    const normalizedTypeKey = String(typeKey == null ? "" : typeKey).trim();
    const field = COMMON_EXPENSE_RECORD_SOURCE_FIELD_BY_TYPE_KEY[normalizedTypeKey];
    return field ? Object.assign({}, field) : null;
  }

  lensAnalysis.expenseLibrary = Object.freeze({
    EXPENSE_UI_AVAILABILITY_VALUES,
    EXPENSE_CONTINUATION_STATUS_VALUES,
    EXPENSE_DEFAULT_NEED_TYPE_VALUES,
    EXPENSE_PRIORITY_CLASS_VALUES,
    EXPENSE_COMPRESSION_TIER_VALUES,
    EXPENSE_INFLATION_BUCKET_KEYS,
    EXPENSE_LIFESTYLE_TREATMENT_REASONS,
    COMMON_EXPENSE_RECORD_SOURCE_FIELDS,
    EXPENSE_PLANNING_BUCKET_KEYS,
    EXPENSE_PLANNING_BUCKETS,
    EXPENSE_UI_AVAILABILITY_BY_TYPE_KEY,
    EXPENSE_LIBRARY_ENTRIES,
    EXPENSE_LIBRARY_GROUPS,
    PROTECTED_SCALAR_EXPENSE_TYPE_KEYS,
    getExpenseLibraryEntries,
    getExpenseLibraryEntry,
    findExpenseLibraryEntry,
    getExpensePlanningBuckets,
    getExpensePlanningBucket,
    getCommonExpenseRecordSourceFields,
    getCommonExpenseRecordSourceField
  });
})(window);
