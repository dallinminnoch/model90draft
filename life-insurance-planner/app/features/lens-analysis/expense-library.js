(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens analysis expense library metadata.
  // Purpose: define searchable raw expense types that future PMI
  // expenseRecords[] rows can use. Runtime behavior stays outside this
  // metadata module.

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
    ["prescriptionMedications", "Prescription Medications", "ongoingHealthcare", "Recurring prescription medication expense.", "prescriptions|medications|pharmacy", "monthly", "ongoing"],
    ["specialistVisits", "Specialist Visits", "ongoingHealthcare", "Recurring or periodic medical specialist visit expense.", "specialist|doctor visit|provider visit", "quarterly", "ongoing"],
    ["therapyCounseling", "Therapy / Counseling", "mentalHealthCare", "Recurring therapy, counseling, or mental health care expense.", "therapy|counseling|mental health|behavioral health", "monthly", "ongoing"],
    ["psychiatricMedicationManagement", "Psychiatric Medication Management", "mentalHealthCare", "Recurring psychiatric medication management or behavioral health provider expense.", "psychiatry|medication management|behavioral health", "monthly", "ongoing"],
    ["inpatientMentalHealthCare", "Inpatient Mental Health Care", "mentalHealthCare", "Inpatient or intensive mental health care expense.", "inpatient mental health|psychiatric facility|intensive care", "monthly", "fixedYears", { suggestedTermYears: 1 }],
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
    ["longTermCareInsurancePremiums", "Long-Term Care Insurance Premiums", "longTermCare", "Recurring long-term care insurance premium expense.", "ltc insurance|long term care premium|care insurance", "annual", "ongoing"],
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
    ["homeownersInsurance", "Homeowners Insurance", "housingExpense", "Recurring homeowners insurance expense.", "homeowners insurance|hazard insurance|property insurance", "annual", "ongoing"],
    ["homeMaintenanceRepairs", "Home Maintenance / Repairs", "housingExpense", "Recurring or periodic home maintenance and repair expense.", "home maintenance|repairs|house repairs|maintenance", "annual", "ongoing"],
    ["hoaDues", "HOA Dues", "housingExpense", "Recurring homeowners association dues expense.", "hoa|association dues|condo dues", "monthly", "ongoing"],
    ["propertyAssessments", "Property Assessments", "housingExpense", "Periodic property assessment or special assessment expense.", "property assessment|special assessment|tax assessment", "annual", "ongoing"],
    ["householdUtilities", "Utilities", "utilities", "Recurring household utility expense.", "utilities|electric|gas|water|trash|household utilities", "monthly", "ongoing"],
    ["internetPhone", "Internet / Phone", "utilities", "Recurring internet and phone expense.", "internet|phone|cell phone|broadband", "monthly", "ongoing"],
    ["groceries", "Groceries", "foodGroceries", "Recurring grocery and household food expense.", "groceries|food|household food", "monthly", "ongoing"],
    ["transportationFuel", "Transportation Fuel", "transportation", "Recurring fuel or transportation expense.", "fuel|gasoline|transportation", "monthly", "ongoing"],
    ["vehicleInsurance", "Vehicle Insurance", "transportation", "Recurring vehicle insurance expense.", "auto insurance|vehicle insurance|car insurance", "monthly", "ongoing"],
    ["vehicleMaintenance", "Vehicle Maintenance", "transportation", "Recurring or periodic vehicle maintenance expense.", "vehicle maintenance|car maintenance|repairs", "annual", "ongoing"],
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
    ["petCare", "Pet Care", "otherLivingExpense", "Recurring pet care expense.", "pet care|veterinary|pet food|animal care", "monthly", "ongoing"],

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

  function toExpenseLibraryEntry(definition, index) {
    const options = definition[7] && typeof definition[7] === "object" ? definition[7] : {};
    const category = getCategory(definition[2]);
    const categoryLabel = category && category.label ? category.label : definition[2];
    const defaultFrequency = isValidFrequency(definition[5]) ? definition[5] : "monthly";
    const defaultTermType = isValidTermType(definition[6]) ? definition[6] : "ongoing";
    const searchTerms = splitSearchTerms(definition[4]);

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
      sortOrder: Number.isFinite(Number(options.sortOrder)) ? Number(options.sortOrder) : (index + 1) * 10
    });
  }

  const EXPENSE_LIBRARY_ENTRIES = Object.freeze(
    RAW_EXPENSE_LIBRARY_ENTRIES.map(toExpenseLibraryEntry)
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

  lensAnalysis.expenseLibrary = Object.freeze({
    EXPENSE_LIBRARY_ENTRIES,
    EXPENSE_LIBRARY_GROUPS,
    PROTECTED_SCALAR_EXPENSE_TYPE_KEYS,
    getExpenseLibraryEntries,
    getExpenseLibraryEntry,
    findExpenseLibraryEntry
  });
})(window);
