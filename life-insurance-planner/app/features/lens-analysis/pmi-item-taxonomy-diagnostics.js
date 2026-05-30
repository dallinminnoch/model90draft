(function (global) {
  const root = global.LensApp || (global.LensApp = {});
  const lensAnalysis = root.lensAnalysis || (root.lensAnalysis = {});

  // Owner: Lens analysis diagnostics.
  // Purpose: classify current PMI source fields, records, and library metadata
  // for future item-level ledger migration. Non-goals: no graph math,
  // normalization, taxonomy mutation, DOM, storage, or UI behavior.
  const PMI_ITEM_TAXONOMY_DIAGNOSTICS_VERSION = "pmi-item-taxonomy-diagnostics-v1";

  const ROLE_VALUES = Object.freeze([
    "need-row",
    "resource-row",
    "offset-funding-row",
    "treatment-setting",
    "timing-projection-fact",
    "supporting-calculation-fact",
    "diagnostic-display-fact",
    "unused-deprecated-candidate"
  ]);

  const OWNER_COMPONENT_VALUES = Object.freeze([
    "mortgage",
    "nonMortgageDebt",
    "education",
    "healthcare",
    "finalExpense",
    "transitionNeeds",
    "essentialSupport",
    "discretionarySupport",
    "resources",
    "existingCoverage",
    "treatmentSettings",
    "projectionFacts",
    "diagnosticOnly",
    "excluded",
    "customReview"
  ]);

  const INFLATION_TREATMENT_BY_ROLE = Object.freeze({
    householdInflation: "generalInflation",
    healthcareInflation: "healthcareInflation",
    educationInflation: "educationInflation",
    finalExpenseInflation: "finalExpenseInflation",
    none: "unknown",
    future: "unknown"
  });

  const EXPENSE_ITEM_TYPE_BY_CATEGORY = Object.freeze({
    medicalFinalExpense: "finalExpense",
    funeralBurial: "finalExpense",
    estateSettlement: "finalExpense",
    otherFinalExpense: "finalExpense",
    ongoingHealthcare: "healthcareOutOfPocket",
    dentalCare: "dentalVisionMentalHealth",
    visionCare: "dentalVisionMentalHealth",
    mentalHealthCare: "dentalVisionMentalHealth",
    longTermCare: "longTermCare",
    homeHealthCare: "longTermCare",
    medicalEquipment: "healthcareOutOfPocket",
    otherHealthcare: "healthcareOutOfPocket",
    housingExpense: "housingOperating",
    utilities: "utility",
    foodGroceries: "householdFood",
    transportation: "transportationOperating",
    insurancePremiums: "insurancePremium",
    childcare: "childcareDependentCare",
    dependentSupport: "childcareDependentCare",
    personalLiving: "householdOperating",
    otherLivingExpense: "householdOperating",
    educationExpense: "educationTuition",
    childActivityExpense: "educationActivity",
    childcareEducation: "educationActivity",
    businessOverhead: "businessObligation",
    professionalServices: "professionalService",
    keyPersonReplacementExpense: "businessObligation",
    discretionaryLifestyle: "discretionaryLifestyle",
    travelVacations: "discretionaryLifestyle",
    debtObligations: "debtPayment",
    savingsGoalContributions: "plannedSavingsContribution",
    taxes: "taxLegalObligation",
    familySupport: "childcareDependentCare",
    givingCommunity: "discretionaryLifestyle",
    pets: "householdOperating",
    legalAdministrative: "taxLegalObligation",
    businessSelfEmployment: "businessObligation",
    bankingFinanceCharges: "financialFee",
    periodicSinkingFund: "plannedReserveContribution",
    customExpense: "customReview"
  });

  const EXPENSE_ITEM_TYPE_BY_TYPE_KEY = Object.freeze({
    groceries: "householdFood",
    medicalOutOfPocket: "healthcareOutOfPocket",
    healthcareOutOfPocket: "healthcareOutOfPocket",
    healthInsurancePremiums: "healthcarePremium",
    prescriptionMedications: "healthcareOutOfPocket",
    householdTransportation: "transportationOperating",
    childcareExpense: "childcareDependentCare",
    internetPhone: "utility",
    householdConsumablesSupplies: "householdSupplies",
    funeralBurialEstimate: "finalExpense",
    medicalEndOfLifeCosts: "finalExpense",
    estateSettlementCosts: "finalExpense",
    otherFinalExpenses: "finalExpense",
    educationSavingsContributions: "plannedSavingsContribution",
    retirementContributions: "plannedSavingsContribution",
    brokerageInvestmentContributions: "plannedSavingsContribution",
    emergencyFundContributions: "plannedSavingsContribution",
    hsaContributions: "plannedSavingsContribution"
  });

  const DEBT_ITEM_TYPE_BY_TYPE_KEY = Object.freeze({
    primaryResidenceMortgage: "mortgage",
    mortgageBalance: "mortgage",
    creditCard: "creditCardDebt",
    storeCard: "creditCardDebt",
    chargeCard: "creditCardDebt",
    autoLoan: "vehicleLoan",
    secondVehicleLoan: "vehicleLoan",
    motorcycleLoan: "vehicleLoan",
    rvLoan: "vehicleLoan",
    boatLoan: "vehicleLoan",
    aircraftLoan: "vehicleLoan",
    autoLease: "vehicleLease",
    secondVehicleLease: "vehicleLease",
    studentLoan: "studentLoan",
    federalStudentLoan: "studentLoan",
    privateStudentLoan: "studentLoan",
    parentPlusLoan: "studentLoan",
    personalLoan: "personalLoan",
    unsecuredLineOfCredit: "personalLoan",
    businessLoan: "businessObligation",
    businessDebt: "businessObligation",
    taxDebt: "taxLegalObligation",
    taxLiabilities: "taxLegalObligation"
  });

  const DEBT_ITEM_TYPE_BY_CATEGORY = Object.freeze({
    realEstateSecuredDebt: "mortgage",
    securedConsumerDebt: "vehicleLoan",
    unsecuredConsumerDebt: "personalLoan",
    educationDebt: "studentLoan",
    medicalDebt: "healthcareDebt",
    taxLegalDebt: "taxLegalObligation",
    businessDebt: "businessObligation",
    privatePersonalDebt: "personalLoan",
    consumerFinanceDebt: "personalLoan",
    otherDebt: "customReview"
  });

  const ASSET_ITEM_TYPE_BY_CATEGORY = Object.freeze({
    cashAndCashEquivalents: "assetAccount",
    emergencyFund: "assetAccount",
    taxableBrokerageInvestments: "assetAccount",
    traditionalRetirementAssets: "assetAccount",
    rothTaxAdvantagedRetirementAssets: "assetAccount",
    qualifiedAnnuities: "assetAccount",
    nonqualifiedAnnuities: "assetAccount",
    primaryResidenceEquity: "assetAccount",
    otherRealEstateEquity: "assetAccount",
    businessPrivateCompanyValue: "assetAccount",
    educationSpecificSavings: "assetAccount",
    trustRestrictedAssets: "assetAccount",
    stockCompensationDeferredCompensation: "assetAccount",
    digitalAssetsCrypto: "assetAccount",
    otherCustomAsset: "customReview"
  });

  const KNOWN_SCALAR_FIELDS = Object.freeze([
    Object.freeze({
      sourcePath: "protectionModeling.data.mortgageBalance",
      itemId: "pmi:scalar:mortgageBalance",
      label: "Primary residence mortgage balance",
      sourceType: "mortgage-housing-scalar",
      currentCategoryKey: "realEstateSecuredDebt",
      recommendedItemType: "mortgage",
      recommendedOwnerComponent: "mortgage",
      recommendedDisplayGroup: "Mortgage",
      needOrResourceRole: "need-row",
      treatmentRule: "mortgageTreatment",
      projectionRule: "mortgage-amortization",
      inflationTreatment: "notInflatedAmortized",
      timingBasis: "mortgage-term-rate-payment",
      ledgerEligibility: "direct-ledger-row",
      doubleCountGroup: "mortgage",
      migrationRisk: "medium",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "protectionModeling.data.monthlyMortgagePaymentOnly",
      itemId: "pmi:scalar:monthlyMortgagePaymentOnly",
      label: "Monthly mortgage payment",
      sourceType: "mortgage-housing-scalar",
      currentCategoryKey: "housingExpense",
      recommendedItemType: "mortgage",
      recommendedOwnerComponent: "projectionFacts",
      recommendedDisplayGroup: "Mortgage",
      needOrResourceRole: "timing-projection-fact",
      treatmentRule: "mortgageTreatment",
      projectionRule: "mortgage-payment-support-fact",
      inflationTreatment: "notInflatedFixedPayment",
      timingBasis: "monthly-payment",
      ledgerEligibility: "supports-mortgage-row",
      doubleCountGroup: "mortgage",
      migrationRisk: "medium",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "protectionModeling.data.funeralBurialEstimate",
      itemId: "pmi:scalar:funeralBurialEstimate",
      label: "Funeral / burial estimate",
      sourceType: "final-expense-scalar",
      currentCategoryKey: "funeralBurial",
      recommendedItemType: "finalExpense",
      recommendedOwnerComponent: "finalExpense",
      recommendedDisplayGroup: "Final expense",
      needOrResourceRole: "need-row",
      treatmentRule: "final-expense-projection",
      projectionRule: "death-year-final-expense",
      inflationTreatment: "finalExpenseInflation",
      timingBasis: "death-triggered",
      ledgerEligibility: "direct-ledger-row",
      doubleCountGroup: "finalExpense",
      migrationRisk: "low",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "protectionModeling.data.medicalEndOfLifeCosts",
      itemId: "pmi:scalar:medicalEndOfLifeCosts",
      label: "Medical end-of-life costs",
      sourceType: "final-expense-scalar",
      currentCategoryKey: "medicalFinalExpense",
      recommendedItemType: "finalExpense",
      recommendedOwnerComponent: "finalExpense",
      recommendedDisplayGroup: "Final expense",
      needOrResourceRole: "need-row",
      treatmentRule: "final-expense-projection",
      projectionRule: "death-year-final-expense",
      inflationTreatment: "healthcareInflation",
      timingBasis: "death-triggered",
      ledgerEligibility: "direct-ledger-row",
      doubleCountGroup: "finalExpense",
      migrationRisk: "medium",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "protectionModeling.data.estateSettlementCosts",
      itemId: "pmi:scalar:estateSettlementCosts",
      label: "Estate settlement costs",
      sourceType: "final-expense-scalar",
      currentCategoryKey: "estateSettlement",
      recommendedItemType: "finalExpense",
      recommendedOwnerComponent: "finalExpense",
      recommendedDisplayGroup: "Final expense",
      needOrResourceRole: "need-row",
      treatmentRule: "final-expense-projection",
      projectionRule: "death-year-final-expense",
      inflationTreatment: "finalExpenseInflation",
      timingBasis: "death-triggered",
      ledgerEligibility: "direct-ledger-row",
      doubleCountGroup: "finalExpense",
      migrationRisk: "low",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "protectionModeling.data.otherFinalExpenses",
      itemId: "pmi:scalar:otherFinalExpenses",
      label: "Other final expenses",
      sourceType: "final-expense-scalar",
      currentCategoryKey: "otherFinalExpense",
      recommendedItemType: "finalExpense",
      recommendedOwnerComponent: "finalExpense",
      recommendedDisplayGroup: "Final expense",
      needOrResourceRole: "need-row",
      treatmentRule: "final-expense-projection",
      projectionRule: "death-year-final-expense",
      inflationTreatment: "finalExpenseInflation",
      timingBasis: "death-triggered",
      ledgerEligibility: "direct-ledger-row",
      doubleCountGroup: "finalExpense",
      migrationRisk: "low",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "protectionModeling.data.immediateLiquidityBuffer",
      itemId: "pmi:scalar:immediateLiquidityBuffer",
      label: "Immediate liquidity buffer",
      sourceType: "transition-scalar",
      currentCategoryKey: "transitionNeeds",
      recommendedItemType: "transitionLiquidity",
      recommendedOwnerComponent: "transitionNeeds",
      recommendedDisplayGroup: "Transition needs",
      needOrResourceRole: "need-row",
      treatmentRule: "transition-needs-death-triggered",
      projectionRule: "constant-death-triggered-need",
      inflationTreatment: "deferredGlobalInflationPass",
      timingBasis: "death-triggered-at-each-projection-point",
      ledgerEligibility: "direct-ledger-row",
      doubleCountGroup: "transitionNeeds",
      migrationRisk: "low",
      diagnosticStatus: "classified"
    }),
    Object.freeze({
      sourcePath: "profileRecord.coveragePolicies",
      itemId: "pmi:profile:coveragePolicies",
      label: "Existing coverage policies",
      sourceType: "profile-existing-coverage",
      currentCategoryKey: "existingCoverage",
      recommendedItemType: "existingCoveragePolicy",
      recommendedOwnerComponent: "existingCoverage",
      recommendedDisplayGroup: "Existing coverage",
      needOrResourceRole: "offset-funding-row",
      treatmentRule: "existing-coverage-treatment",
      projectionRule: "policy-term-schedule",
      inflationTreatment: "unknown",
      timingBasis: "policy-effective-and-expiration-dates",
      ledgerEligibility: "offset-row",
      doubleCountGroup: "existingCoverage",
      migrationRisk: "medium",
      diagnosticStatus: "classified"
    })
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function camelContains(value, token) {
    return normalizeString(value).toLowerCase().indexOf(normalizeString(token).toLowerCase()) >= 0;
  }

  function arrayFrom(value) {
    return Array.isArray(value) ? value : [];
  }

  function toObject(value) {
    return isPlainObject(value) ? value : {};
  }

  function getLensApi(input, key) {
    const direct = input?.[key];
    if (isPlainObject(direct)) {
      return direct;
    }
    return toObject(lensAnalysis[key]);
  }

  function getExpenseCategories(input) {
    const taxonomy = getLensApi(input, "expenseTaxonomy");
    if (typeof taxonomy.getExpenseCategories === "function") {
      return taxonomy.getExpenseCategories();
    }
    return arrayFrom(taxonomy.DEFAULT_EXPENSE_CATEGORIES);
  }

  function getDebtCategories(input) {
    return arrayFrom(getLensApi(input, "debtTaxonomy").DEFAULT_DEBT_CATEGORIES);
  }

  function getAssetCategories(input) {
    return arrayFrom(getLensApi(input, "assetTaxonomy").DEFAULT_ASSET_CATEGORIES);
  }

  function getExpenseLibraryEntries(input) {
    const library = getLensApi(input, "expenseLibrary");
    if (typeof library.getExpenseLibraryEntries === "function") {
      return library.getExpenseLibraryEntries();
    }
    return arrayFrom(library.EXPENSE_LIBRARY_ENTRIES);
  }

  function getDebtLibraryEntries(input) {
    const library = getLensApi(input, "debtLibrary");
    if (typeof library.getDebtLibraryEntries === "function") {
      return library.getDebtLibraryEntries();
    }
    return arrayFrom(library.DEBT_LIBRARY_ENTRIES);
  }

  function getAssetLibraryEntries(input) {
    const library = getLensApi(input, "assetLibrary");
    if (typeof library.getAssetLibraryEntries === "function") {
      return library.getAssetLibraryEntries();
    }
    return arrayFrom(library.ASSET_LIBRARY_ENTRIES);
  }

  function buildCategoryMap(categories) {
    return arrayFrom(categories).reduce(function (map, category) {
      if (category && category.categoryKey) {
        map[category.categoryKey] = category;
      }
      return map;
    }, {});
  }

  function getCategoryLabel(categoryMap, categoryKey, fallback) {
    return normalizeString(categoryMap?.[categoryKey]?.label)
      || normalizeString(fallback)
      || normalizeString(categoryKey)
      || null;
  }

  function mapInflationRole(defaultInflationRole, fallback) {
    const normalized = normalizeString(defaultInflationRole);
    if (INFLATION_TREATMENT_BY_ROLE[normalized]) {
      return INFLATION_TREATMENT_BY_ROLE[normalized];
    }
    return normalizeString(fallback) || "unknown";
  }

  function createIssue(code, message, details) {
    return {
      code,
      message,
      details: isPlainObject(details) ? clonePlainValue(details) : {}
    };
  }

  function normalizeRole(value, fallback) {
    const normalized = normalizeString(value);
    return ROLE_VALUES.indexOf(normalized) >= 0 ? normalized : fallback;
  }

  function normalizeOwner(value, fallback) {
    const normalized = normalizeString(value);
    return OWNER_COMPONENT_VALUES.indexOf(normalized) >= 0 ? normalized : fallback;
  }

  function inferCategoryDriver(sourceDomain, categoryKey, category) {
    if (sourceDomain === "asset") {
      return categoryKey === "otherCustomAsset" ? "mixed" : "real-world-item-type";
    }
    if (sourceDomain === "debt") {
      return category?.isHousingFieldOwned === true || categoryKey === "realEstateSecuredDebt"
        ? "mixed"
        : "real-world-item-type";
    }
    if (sourceDomain !== "expense") {
      return "unclear";
    }
    if (categoryKey === "medicalFinalExpense") {
      return "mixed";
    }
    if ([
      "ongoingHealthcare",
      "dentalCare",
      "visionCare",
      "mentalHealthCare",
      "longTermCare",
      "homeHealthCare",
      "medicalEquipment",
      "otherHealthcare",
      "educationExpense",
      "childActivityExpense",
      "childcareEducation"
    ].indexOf(categoryKey) >= 0) {
      return "mixed";
    }
    if (["debtObligations", "savingsGoalContributions"].indexOf(categoryKey) >= 0) {
      return "owner-component";
    }
    if (["periodicSinkingFund", "customExpense"].indexOf(categoryKey) >= 0) {
      return "ui-convenience";
    }
    if (["businessOverhead", "professionalServices", "legalAdministrative", "businessSelfEmployment"].indexOf(categoryKey) >= 0) {
      return "mixed";
    }
    if (normalizeString(category?.defaultInflationRole) && category.defaultInflationRole !== "none") {
      return "real-world-item-type";
    }
    return "unclear";
  }

  function getExpenseOwner(categoryKey, typeKey, entry) {
    if (typeKey === "medicalOutOfPocket" || entry?.metadata?.commonExpenseOngoingSupportField === "monthlyHealthcareOutOfPocketCost") {
      return "essentialSupport";
    }
    if (["medicalFinalExpense", "funeralBurial", "estateSettlement", "otherFinalExpense"].indexOf(categoryKey) >= 0) {
      return "finalExpense";
    }
    if ([
      "ongoingHealthcare",
      "dentalCare",
      "visionCare",
      "mentalHealthCare",
      "longTermCare",
      "homeHealthCare",
      "medicalEquipment",
      "otherHealthcare"
    ].indexOf(categoryKey) >= 0) {
      return "healthcare";
    }
    if (["educationExpense", "childActivityExpense", "childcareEducation"].indexOf(categoryKey) >= 0) {
      return "education";
    }
    if (categoryKey === "debtObligations") {
      return "nonMortgageDebt";
    }
    if (categoryKey === "savingsGoalContributions") {
      return "resources";
    }
    if (["discretionaryLifestyle", "travelVacations", "givingCommunity"].indexOf(categoryKey) >= 0) {
      return "discretionarySupport";
    }
    if (["businessOverhead", "professionalServices", "keyPersonReplacementExpense", "businessSelfEmployment"].indexOf(categoryKey) >= 0) {
      return "customReview";
    }
    if (categoryKey === "customExpense") {
      return "customReview";
    }
    return "essentialSupport";
  }

  function getExpenseRole(categoryKey, typeKey) {
    if (categoryKey === "savingsGoalContributions") {
      return "offset-funding-row";
    }
    if (categoryKey === "debtObligations") {
      return "supporting-calculation-fact";
    }
    if (categoryKey === "customExpense") {
      return "diagnostic-display-fact";
    }
    if (typeKey === "medicalOutOfPocket") {
      return "need-row";
    }
    return "need-row";
  }

  function getExpenseProjectionRule(categoryKey, owner, typeKey) {
    if (owner === "finalExpense") {
      return "death-year-final-expense";
    }
    if (owner === "healthcare") {
      return "healthcare-lifetime-projection";
    }
    if (owner === "education") {
      return "education-scheduled-obligation";
    }
    if (categoryKey === "savingsGoalContributions") {
      return "contribution-schedule-future-resource-row";
    }
    if (categoryKey === "debtObligations") {
      return "generated-from-debt-record";
    }
    if (typeKey === "medicalOutOfPocket") {
      return "support-owned-current-policy";
    }
    return "support-duration-or-future-item-ledger";
  }

  function getDisplayGroup(owner) {
    const labels = {
      mortgage: "Mortgage",
      nonMortgageDebt: "Non-mortgage debt",
      education: "Education",
      healthcare: "Healthcare",
      finalExpense: "Final expense",
      transitionNeeds: "Transition needs",
      essentialSupport: "Essential support",
      discretionarySupport: "Discretionary support",
      resources: "Resources",
      existingCoverage: "Existing coverage",
      treatmentSettings: "Treatment settings",
      projectionFacts: "Projection facts",
      diagnosticOnly: "Diagnostics",
      excluded: "Excluded",
      customReview: "Custom review"
    };
    return labels[owner] || "Diagnostics";
  }

  function getMigrationRisk(owner, categoryKey, typeKey, entry) {
    if (entry?.isDeprecated === true || entry?.metadata?.isDeprecated === true) {
      return "medium";
    }
    if (["customReview", "healthcare", "education"].indexOf(owner) >= 0) {
      return "medium";
    }
    if (typeKey === "medicalOutOfPocket" || categoryKey === "medicalFinalExpense" || categoryKey === "childcareEducation") {
      return "medium";
    }
    if (categoryKey === "debtObligations" || categoryKey === "savingsGoalContributions") {
      return "medium";
    }
    return "low";
  }

  function getLedgerEligibility(role, owner, categoryKey, entry) {
    if (role === "need-row") {
      return "direct-ledger-row";
    }
    if (role === "resource-row") {
      return "resource-ledger-row";
    }
    if (role === "offset-funding-row") {
      return "offset-or-funding-row";
    }
    if (role === "supporting-calculation-fact") {
      return "supports-owned-row";
    }
    if (entry?.isDeprecated === true || entry?.metadata?.isDeprecated === true) {
      return "deprecated-review";
    }
    if (owner === "customReview") {
      return "review-required";
    }
    return "diagnostic-only";
  }

  function baseRow(overrides) {
    const row = {
      itemId: overrides.itemId,
      sourceSurface: overrides.sourceSurface || "PMI",
      sourceType: overrides.sourceType || "unknown",
      sourcePath: overrides.sourcePath || null,
      currentCategoryKey: overrides.currentCategoryKey || null,
      currentCategoryLabel: overrides.currentCategoryLabel || null,
      currentLibraryKey: overrides.currentLibraryKey || null,
      currentInflationRole: overrides.currentInflationRole || null,
      recommendedItemType: overrides.recommendedItemType || "customReview",
      recommendedOwnerComponent: normalizeOwner(overrides.recommendedOwnerComponent, "customReview"),
      recommendedDisplayGroup: overrides.recommendedDisplayGroup || getDisplayGroup(overrides.recommendedOwnerComponent),
      needOrResourceRole: normalizeRole(overrides.needOrResourceRole, "diagnostic-display-fact"),
      treatmentRule: overrides.treatmentRule || "future-item-ledger-review",
      projectionRule: overrides.projectionRule || "future-item-ledger-review",
      inflationTreatment: overrides.inflationTreatment || "unknown",
      timingBasis: overrides.timingBasis || "unknown",
      ledgerEligibility: overrides.ledgerEligibility || "diagnostic-only",
      doubleCountGroup: overrides.doubleCountGroup || overrides.recommendedOwnerComponent || "customReview",
      migrationRisk: overrides.migrationRisk || "medium",
      diagnosticStatus: overrides.diagnosticStatus || "classified",
      rawOnlyReason: overrides.rawOnlyReason || null,
      categoryDriver: overrides.categoryDriver || "unclear",
      notes: overrides.notes || [],
      warnings: arrayFrom(overrides.warnings),
      dataGaps: arrayFrom(overrides.dataGaps),
      graphMathChanged: false,
      diagnosticOnly: true
    };
    if (!row.sourcePath) {
      row.dataGaps.push(createIssue(
        "pmi-item-taxonomy-source-path-unavailable",
        "PMI item taxonomy diagnostics could not identify a source path for this row.",
        { itemId: row.itemId }
      ));
    }
    return row;
  }

  function classifyExpense(entry, categoryMap, options) {
    const safeEntry = toObject(entry);
    const typeKey = normalizeString(safeEntry.typeKey || safeEntry.libraryEntryKey);
    const categoryKey = normalizeString(safeEntry.categoryKey || safeEntry.groupKey);
    const category = categoryMap[categoryKey] || {};
    const itemType = EXPENSE_ITEM_TYPE_BY_TYPE_KEY[typeKey]
      || EXPENSE_ITEM_TYPE_BY_CATEGORY[categoryKey]
      || "customReview";
    const owner = getExpenseOwner(categoryKey, typeKey, safeEntry);
    const role = getExpenseRole(categoryKey, typeKey);
    const categoryDriver = inferCategoryDriver("expense", categoryKey, category);
    const inflationTreatment = mapInflationRole(
      safeEntry.inflationRole || category.defaultInflationRole,
      owner === "finalExpense" ? "finalExpenseInflation" : null
    );
    const notes = [];
    const warnings = [];
    const dataGaps = [];

    if (typeKey === "medicalOutOfPocket") {
      notes.push("Current policy may keep this healthcare-looking item support-owned when sourced from ongoing support.");
    }
    if (categoryDriver === "mixed" || categoryDriver === "inflation-treatment") {
      warnings.push(createIssue(
        "pmi-item-category-driver-not-pure-item-type",
        "Current category mixes item type with owner, behavior, or inflation treatment.",
        { categoryKey, categoryDriver }
      ));
    }
    if (owner === "customReview") {
      dataGaps.push(createIssue(
        "pmi-item-owner-requires-review",
        "Future item-level ledger ownership requires advisor/product classification.",
        { categoryKey, typeKey }
      ));
    }

    return baseRow({
      itemId: options.itemId || `pmi:expense:${typeKey || categoryKey}`,
      sourceSurface: options.sourceSurface || "PMI expense records",
      sourceType: options.sourceType || "expense-library-entry",
      sourcePath: options.sourcePath || `expenseLibrary.${typeKey || categoryKey}`,
      currentCategoryKey: categoryKey || null,
      currentCategoryLabel: getCategoryLabel(categoryMap, categoryKey, safeEntry.group),
      currentLibraryKey: typeKey || null,
      currentInflationRole: normalizeString(safeEntry.inflationRole || category.defaultInflationRole) || null,
      recommendedItemType: itemType,
      recommendedOwnerComponent: owner,
      recommendedDisplayGroup: getDisplayGroup(owner),
      needOrResourceRole: role,
      treatmentRule: role === "offset-funding-row" ? "resource-funding-treatment" : "owner-component-treatment",
      projectionRule: getExpenseProjectionRule(categoryKey, owner, typeKey),
      inflationTreatment,
      timingBasis: normalizeString(safeEntry.termType || category.timingRole) || "expense-frequency-term",
      ledgerEligibility: getLedgerEligibility(role, owner, categoryKey, safeEntry),
      doubleCountGroup: owner,
      migrationRisk: getMigrationRisk(owner, categoryKey, typeKey, safeEntry),
      diagnosticStatus: owner === "customReview" ? "requires-review" : "classified",
      rawOnlyReason: role === "diagnostic-display-fact" ? "Current item is not yet formula-active as an item-level row." : null,
      categoryDriver,
      notes,
      warnings,
      dataGaps
    });
  }

  function classifyDebt(entry, categoryMap, options) {
    const safeEntry = toObject(entry);
    const typeKey = normalizeString(safeEntry.typeKey || safeEntry.libraryEntryKey || safeEntry.sourceKey);
    const categoryKey = normalizeString(safeEntry.categoryKey);
    const category = categoryMap[categoryKey] || {};
    const isLease = safeEntry.isLease === true || typeKey === "autoLease" || typeKey === "secondVehicleLease";
    const isPrimaryMortgage = typeKey === "primaryResidenceMortgage" || typeKey === "mortgageBalance" || safeEntry.isHousingFieldOwned === true;
    const owner = isPrimaryMortgage ? "mortgage" : "nonMortgageDebt";
    const itemType = DEBT_ITEM_TYPE_BY_TYPE_KEY[typeKey]
      || (isLease ? "vehicleLease" : DEBT_ITEM_TYPE_BY_CATEGORY[categoryKey])
      || "customReview";
    const role = safeEntry.isDeprecated === true ? "unused-deprecated-candidate" : "need-row";
    const notes = [];
    if (isLease) {
      notes.push("Lease obligations should be projected as payment streams, not ordinary payoff-balance debts.");
    }
    if (safeEntry.isDeprecated === true) {
      notes.push(`Deprecated compatibility alias; canonical type is ${safeEntry.canonicalTypeKey || "unknown"}.`);
    }
    return baseRow({
      itemId: options.itemId || `pmi:debt:${typeKey || categoryKey}`,
      sourceSurface: options.sourceSurface || "PMI debt records",
      sourceType: options.sourceType || "debt-library-entry",
      sourcePath: options.sourcePath || `debtLibrary.${typeKey || categoryKey}`,
      currentCategoryKey: categoryKey || null,
      currentCategoryLabel: getCategoryLabel(categoryMap, categoryKey, safeEntry.group),
      currentLibraryKey: typeKey || null,
      currentInflationRole: "none",
      recommendedItemType: itemType,
      recommendedOwnerComponent: owner,
      recommendedDisplayGroup: getDisplayGroup(owner),
      needOrResourceRole: role,
      treatmentRule: isPrimaryMortgage ? "mortgageTreatment" : "debtTreatment",
      projectionRule: isPrimaryMortgage
        ? "mortgage-amortization"
        : isLease
          ? "lease-payment-stream"
          : "non-mortgage-debt-lifetime-projection",
      inflationTreatment: isPrimaryMortgage || isLease ? "notInflatedFixedPayment" : "notInflatedAmortized",
      timingBasis: isLease ? "lease-term-payment" : "balance-payment-rate-term",
      ledgerEligibility: safeEntry.isDeprecated === true
        ? "deprecated-review"
        : isLease
          ? "direct-ledger-row-payment-stream"
          : "direct-ledger-row",
      doubleCountGroup: isPrimaryMortgage ? "mortgage" : "nonMortgageDebt",
      migrationRisk: isLease || categoryKey === "realEstateSecuredDebt" ? "medium" : "low",
      diagnosticStatus: safeEntry.isDeprecated === true ? "deprecated" : "classified",
      rawOnlyReason: safeEntry.isDeprecated === true ? "Deprecated compatibility alias should not create a new row." : null,
      categoryDriver: inferCategoryDriver("debt", categoryKey, category),
      notes
    });
  }

  function classifyAsset(entry, categoryMap, options) {
    const safeEntry = toObject(entry);
    const typeKey = normalizeString(safeEntry.typeKey || safeEntry.libraryEntryKey || safeEntry.sourceKey);
    const categoryKey = normalizeString(safeEntry.categoryKey);
    const category = categoryMap[categoryKey] || {};
    const owner = "resources";
    const migrationRisk = categoryKey === "otherCustomAsset"
      || category.reserveReviewRequired === true
      || safeEntry.reserveReviewRequired === true
      ? "medium"
      : "low";
    return baseRow({
      itemId: options.itemId || `pmi:asset:${typeKey || categoryKey}`,
      sourceSurface: options.sourceSurface || "PMI asset records",
      sourceType: options.sourceType || "asset-library-entry",
      sourcePath: options.sourcePath || `assetLibrary.${typeKey || categoryKey}`,
      currentCategoryKey: categoryKey || null,
      currentCategoryLabel: getCategoryLabel(categoryMap, categoryKey, safeEntry.group),
      currentLibraryKey: typeKey || null,
      currentInflationRole: "none",
      recommendedItemType: ASSET_ITEM_TYPE_BY_CATEGORY[categoryKey] || "assetAccount",
      recommendedOwnerComponent: owner,
      recommendedDisplayGroup: getDisplayGroup(owner),
      needOrResourceRole: "resource-row",
      treatmentRule: "asset-eligibility-treatment",
      projectionRule: "resource-line-growth-or-eligibility-policy",
      inflationTreatment: "unknown",
      timingBasis: "current-balance-and-future-eligibility",
      ledgerEligibility: "resource-ledger-row",
      doubleCountGroup: `resources:${categoryKey || "unknown"}`,
      migrationRisk,
      diagnosticStatus: "classified",
      categoryDriver: inferCategoryDriver("asset", categoryKey, category),
      notes: [
        "Asset category remains item/resource type; eligibility, reserve, and treatment are separate properties."
      ]
    });
  }

  function classifyExpenseCategory(category) {
    const safeCategory = toObject(category);
    return classifyExpense({
      typeKey: safeCategory.categoryKey,
      categoryKey: safeCategory.categoryKey,
      group: safeCategory.label,
      inflationRole: safeCategory.defaultInflationRole
    }, { [safeCategory.categoryKey]: safeCategory }, {
      itemId: `pmi:expense-category:${safeCategory.categoryKey}`,
      sourceSurface: "PMI expense taxonomy",
      sourceType: "expense-category",
      sourcePath: `expenseTaxonomy.DEFAULT_EXPENSE_CATEGORIES.${safeCategory.categoryKey}`
    });
  }

  function classifyDebtCategory(category) {
    const safeCategory = toObject(category);
    return classifyDebt({
      typeKey: safeCategory.categoryKey,
      categoryKey: safeCategory.categoryKey,
      group: safeCategory.label
    }, { [safeCategory.categoryKey]: safeCategory }, {
      itemId: `pmi:debt-category:${safeCategory.categoryKey}`,
      sourceSurface: "PMI debt taxonomy",
      sourceType: "debt-category",
      sourcePath: `debtTaxonomy.DEFAULT_DEBT_CATEGORIES.${safeCategory.categoryKey}`
    });
  }

  function classifyAssetCategory(category) {
    const safeCategory = toObject(category);
    return classifyAsset({
      typeKey: safeCategory.categoryKey,
      categoryKey: safeCategory.categoryKey,
      group: safeCategory.label
    }, { [safeCategory.categoryKey]: safeCategory }, {
      itemId: `pmi:asset-category:${safeCategory.categoryKey}`,
      sourceSurface: "PMI asset taxonomy",
      sourceType: "asset-category",
      sourcePath: `assetTaxonomy.DEFAULT_ASSET_CATEGORIES.${safeCategory.categoryKey}`
    });
  }

  function classifyNormalizedExpenseFact(expense, index, categoryMap) {
    const safeExpense = toObject(expense);
    return classifyExpense({
      ...safeExpense,
      typeKey: safeExpense.typeKey || safeExpense.libraryEntryKey,
      inflationRole: safeExpense.defaultInflationRole || safeExpense.inflationRole
    }, categoryMap, {
      itemId: `pmi:normalized-expense:${safeExpense.expenseFactId || safeExpense.expenseId || index}`,
      sourceSurface: "PMI normalized expense facts",
      sourceType: "expense-fact",
      sourcePath: safeExpense.sourcePath || safeExpense.source || `lensModel.expenseFacts.expenses.${index}`
    });
  }

  function classifyNormalizedDebtFact(debt, index, categoryMap) {
    const safeDebt = toObject(debt);
    return classifyDebt({
      ...safeDebt,
      typeKey: safeDebt.typeKey || safeDebt.debtTypeKey || safeDebt.libraryEntryKey,
      categoryKey: safeDebt.categoryKey || safeDebt.debtCategoryKey
    }, categoryMap, {
      itemId: `pmi:normalized-debt:${safeDebt.debtFactId || safeDebt.debtId || index}`,
      sourceSurface: "PMI normalized debt facts",
      sourceType: "debt-fact",
      sourcePath: safeDebt.sourcePath || safeDebt.source || `lensModel.debtFacts.debts.${index}`
    });
  }

  function classifyNormalizedAssetFact(asset, index, categoryMap) {
    const safeAsset = toObject(asset);
    return classifyAsset({
      ...safeAsset,
      typeKey: safeAsset.typeKey || safeAsset.assetTypeKey || safeAsset.libraryEntryKey,
      categoryKey: safeAsset.categoryKey || safeAsset.assetCategoryKey
    }, categoryMap, {
      itemId: `pmi:normalized-asset:${safeAsset.assetFactId || safeAsset.assetId || safeAsset.id || index}`,
      sourceSurface: "PMI normalized asset facts",
      sourceType: "asset-fact",
      sourcePath: safeAsset.sourcePath || safeAsset.source || `lensModel.assetFacts.assets.${index}`
    });
  }

  function classifySavingsContribution(fact, index) {
    const safeFact = toObject(fact);
    const typeKey = normalizeString(safeFact.typeKey || safeFact.savingsTypeKey || safeFact.libraryEntryKey);
    const targetCategoryKey = normalizeString(safeFact.targetAssetCategoryKey || safeFact.assetCategoryKey);
    return baseRow({
      itemId: `pmi:savings-contribution:${safeFact.savingsContributionFactId || safeFact.contributionId || safeFact.id || index}`,
      sourceSurface: "PMI savings habit records",
      sourceType: "savings-contribution-fact",
      sourcePath: safeFact.sourcePath || safeFact.source || `lensModel.savingsContributionFacts.facts.${index}`,
      currentCategoryKey: "savingsGoalContributions",
      currentCategoryLabel: "Savings, Investing & Goal Contributions",
      currentLibraryKey: typeKey || null,
      currentInflationRole: "none",
      recommendedItemType: "plannedSavingsContribution",
      recommendedOwnerComponent: "resources",
      recommendedDisplayGroup: "Resources",
      needOrResourceRole: "offset-funding-row",
      treatmentRule: "future-resource-funding-treatment",
      projectionRule: "planned-contribution-schedule",
      inflationTreatment: "unknown",
      timingBasis: normalizeString(safeFact.frequency) || "contribution-frequency",
      ledgerEligibility: "offset-or-funding-row",
      doubleCountGroup: targetCategoryKey ? `resources:${targetCategoryKey}` : "resources",
      migrationRisk: "medium",
      diagnosticStatus: "classified",
      categoryDriver: "owner-component",
      notes: [
        "Savings habits are future funding/resource candidates, not ordinary expense rows."
      ]
    });
  }

  function classifyScalarField(definition, protectionModelingData, profileRecord) {
    const sourcePath = definition.sourcePath || "";
    const dataKey = sourcePath.replace(/^protectionModeling\.data\./, "");
    const isProfilePath = sourcePath.indexOf("profileRecord.") === 0;
    const valuePresent = isProfilePath
      ? profileRecord && profileRecord[dataKey.replace(/^profileRecord\./, "")] != null
      : protectionModelingData && protectionModelingData[dataKey] != null;
    return baseRow({
      ...definition,
      categoryDriver: definition.currentCategoryKey === "medicalFinalExpense" ? "mixed" : "real-world-item-type",
      notes: [
        valuePresent ? "Source value present in the current diagnostic context." : "Source value not present in the current diagnostic context."
      ]
    });
  }

  function collectRows(input, metadata) {
    const safeInput = toObject(input);
    const lensModel = toObject(safeInput.lensModel);
    const protectionModelingData = toObject(safeInput.protectionModelingData || safeInput.protectionModelingPayload?.data);
    const profileRecord = toObject(safeInput.profileRecord);
    const includeCatalogRows = safeInput.includeLibraryCatalog !== false;

    const expenseCategoryMap = buildCategoryMap(metadata.expenseCategories);
    const debtCategoryMap = buildCategoryMap(metadata.debtCategories);
    const assetCategoryMap = buildCategoryMap(metadata.assetCategories);
    const rows = [];

    KNOWN_SCALAR_FIELDS.forEach(function (definition) {
      rows.push(classifyScalarField(definition, protectionModelingData, profileRecord));
    });

    arrayFrom(getLensApi(safeInput, "debtTaxonomy").CURRENT_PMI_DEBT_SOURCE_FIELDS).forEach(function (field) {
      rows.push(classifyDebt({
        typeKey: field.sourceKey,
        categoryKey: field.categoryKey,
        isHousingFieldOwned: field.isHousingFieldOwned === true
      }, debtCategoryMap, {
        itemId: `pmi:debt-scalar:${field.sourceKey}`,
        sourceSurface: "PMI debt scalar fields",
        sourceType: "debt-scalar-source-field",
        sourcePath: `protectionModeling.data.${field.sourceKey}`
      }));
    });

    metadata.assetCategories.forEach(function (category) {
      const defaultSourceKey = normalizeString(category.defaultPmiSourceKey);
      if (!defaultSourceKey) {
        return;
      }
      rows.push(classifyAsset({
        typeKey: defaultSourceKey,
        categoryKey: category.categoryKey,
        group: category.group
      }, assetCategoryMap, {
        itemId: `pmi:asset-scalar:${defaultSourceKey}`,
        sourceSurface: "PMI asset scalar fields",
        sourceType: "asset-scalar-source-field",
        sourcePath: `protectionModeling.data.${defaultSourceKey}`
      }));
    });

    arrayFrom(lensModel.expenseFacts?.expenses).forEach(function (expense, index) {
      rows.push(classifyNormalizedExpenseFact(expense, index, expenseCategoryMap));
    });
    arrayFrom(lensModel.debtFacts?.debts).forEach(function (debt, index) {
      rows.push(classifyNormalizedDebtFact(debt, index, debtCategoryMap));
    });
    arrayFrom(lensModel.assetFacts?.assets).forEach(function (asset, index) {
      rows.push(classifyNormalizedAssetFact(asset, index, assetCategoryMap));
    });
    arrayFrom(lensModel.savingsContributionFacts?.facts || lensModel.savingsContributionFacts?.records).forEach(function (fact, index) {
      rows.push(classifySavingsContribution(fact, index));
    });

    if (includeCatalogRows) {
      metadata.expenseCategories.forEach(function (category) {
        rows.push(classifyExpenseCategory(category));
      });
      metadata.debtCategories.forEach(function (category) {
        rows.push(classifyDebtCategory(category));
      });
      metadata.assetCategories.forEach(function (category) {
        rows.push(classifyAssetCategory(category));
      });
      metadata.expenseLibraryEntries.forEach(function (entry) {
        rows.push(classifyExpense(entry, expenseCategoryMap, {
          itemId: `pmi:expense-library:${entry.typeKey || entry.libraryEntryKey}`,
          sourceSurface: "PMI expense library",
          sourceType: "expense-library-entry",
          sourcePath: `expenseLibrary.${entry.typeKey || entry.libraryEntryKey}`
        }));
      });
      metadata.debtLibraryEntries.forEach(function (entry) {
        rows.push(classifyDebt(entry, debtCategoryMap, {
          itemId: `pmi:debt-library:${entry.typeKey || entry.libraryEntryKey}`,
          sourceSurface: "PMI debt library",
          sourceType: "debt-library-entry",
          sourcePath: `debtLibrary.${entry.typeKey || entry.libraryEntryKey}`
        }));
      });
      metadata.assetLibraryEntries.forEach(function (entry) {
        rows.push(classifyAsset(entry, assetCategoryMap, {
          itemId: `pmi:asset-library:${entry.typeKey || entry.libraryEntryKey}`,
          sourceSurface: "PMI asset library",
          sourceType: "asset-library-entry",
          sourcePath: `assetLibrary.${entry.typeKey || entry.libraryEntryKey}`
        }));
      });
    }

    return rows;
  }

  function summarizeBy(rows, fieldName) {
    return rows.reduce(function (summary, row) {
      const key = normalizeString(row[fieldName]) || "unknown";
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {});
  }

  function collectMissingClassificationDataGaps(rows) {
    return rows.reduce(function (gaps, row) {
      if (!row.recommendedItemType || row.recommendedItemType === "customReview") {
        gaps.push(createIssue(
          "pmi-item-taxonomy-recommended-item-type-review-needed",
          "A PMI item needs product/advisor review before it can become a final item-level ledger row.",
          { itemId: row.itemId, sourcePath: row.sourcePath }
        ));
      }
      if (!row.sourcePath) {
        gaps.push(createIssue(
          "pmi-item-taxonomy-source-path-missing",
          "A PMI item taxonomy row is missing source path evidence.",
          { itemId: row.itemId }
        ));
      }
      return gaps;
    }, []);
  }

  function buildMetadata(input) {
    return {
      expenseCategories: getExpenseCategories(input).map(clonePlainValue),
      debtCategories: getDebtCategories(input).map(clonePlainValue),
      assetCategories: getAssetCategories(input).map(clonePlainValue),
      expenseLibraryEntries: getExpenseLibraryEntries(input).map(clonePlainValue),
      debtLibraryEntries: getDebtLibraryEntries(input).map(clonePlainValue),
      assetLibraryEntries: getAssetLibraryEntries(input).map(clonePlainValue)
    };
  }

  function buildPmiItemTaxonomyDiagnostics(input) {
    const safeInput = isPlainObject(input) ? input : {};
    const metadata = buildMetadata(safeInput);
    const rows = collectRows(safeInput, metadata);
    const missingClassificationDataGaps = collectMissingClassificationDataGaps(rows);
    const warnings = [];

    if (!rows.length) {
      warnings.push(createIssue(
        "pmi-item-taxonomy-diagnostics-no-rows",
        "PMI item taxonomy diagnostics could not find source, taxonomy, or library rows to classify.",
        {}
      ));
    }

    return {
      version: PMI_ITEM_TAXONOMY_DIAGNOSTICS_VERSION,
      diagnosticOnly: true,
      graphMathChanged: false,
      normalizationChanged: false,
      taxonomiesChanged: false,
      categoriesRenamed: false,
      coverageStrategyObligationLedgerMathChanged: false,
      needLineChanged: false,
      resourceLineChanged: false,
      gapSurplusChanged: false,
      chartChanged: false,
      rows,
      categorySummary: summarizeBy(rows, "currentCategoryKey"),
      ownerSummary: summarizeBy(rows, "recommendedOwnerComponent"),
      roleSummary: summarizeBy(rows, "needOrResourceRole"),
      categoryDriverSummary: summarizeBy(rows, "categoryDriver"),
      migrationRiskSummary: summarizeBy(rows, "migrationRisk"),
      sourceTypeSummary: summarizeBy(rows, "sourceType"),
      missingClassificationDataGaps,
      warnings,
      dataGaps: missingClassificationDataGaps,
      metadata: {
        rowCount: rows.length,
        expenseCategoryCount: metadata.expenseCategories.length,
        debtCategoryCount: metadata.debtCategories.length,
        assetCategoryCount: metadata.assetCategories.length,
        expenseLibraryEntryCount: metadata.expenseLibraryEntries.length,
        debtLibraryEntryCount: metadata.debtLibraryEntries.length,
        assetLibraryEntryCount: metadata.assetLibraryEntries.length,
        libraryCatalogRowsIncluded: safeInput.includeLibraryCatalog !== false
      },
      trace: {
        source: "pmi-item-taxonomy-diagnostics",
        inputSource: "current-normalized-pmi-facts-and-taxonomy-library-metadata",
        pureDiagnosticClassifier: true,
        rawProjectionEnginesCalled: false,
        graphMathChanged: false,
        storageUsed: false,
        displayHtmlUsed: false,
        inputMutated: false,
        inflationSeparatedFromCategory: true
      }
    };
  }

  lensAnalysis.PMI_ITEM_TAXONOMY_DIAGNOSTICS_VERSION = PMI_ITEM_TAXONOMY_DIAGNOSTICS_VERSION;
  lensAnalysis.buildPmiItemTaxonomyDiagnostics = buildPmiItemTaxonomyDiagnostics;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      PMI_ITEM_TAXONOMY_DIAGNOSTICS_VERSION,
      buildPmiItemTaxonomyDiagnostics
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
