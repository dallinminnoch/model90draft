(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: PMI housing records controller.
  // Purpose: collect visible repeatable housingRecords[] rows for product review.
  // Non-goals: no normalization, no old scalar sync, no treatment assumptions,
  // no ledger wiring, no graph math, no calculations, and no storage access.

  let generatedHousingRecordCounter = 0;
  let activeController = null;

  const HOUSING_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: "primaryResidence", label: "Primary residence" }),
    Object.freeze({ value: "secondHomeVacationProperty", label: "Second Home / Vacation Property" }),
    Object.freeze({ value: "rentalInvestmentProperty", label: "Rental / Investment Property" }),
    Object.freeze({ value: "temporaryHousing", label: "Temporary Housing" }),
    Object.freeze({ value: "housingOperatingCostOnly", label: "Housing Operating Costs Only" }),
    Object.freeze({ value: "otherHousingObligation", label: "Other Housing Obligation" })
  ]);

  const PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS = Object.freeze([
    Object.freeze({ value: "ownWithMortgage", label: "Own with mortgage" }),
    Object.freeze({ value: "ownFreeAndClear", label: "Own free and clear" }),
    Object.freeze({ value: "rent", label: "Rent" })
  ]);

  const CONTINUES_AFTER_DEATH_OPTIONS = Object.freeze([
    Object.freeze({ value: "yes", label: "Yes" }),
    Object.freeze({ value: "no", label: "No" })
  ]);

  const PROPERTY_SECURED_DEBT_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: "secondMortgage", label: "Second Mortgage" }),
    Object.freeze({ value: "heloc", label: "HELOC" }),
    Object.freeze({ value: "homeEquityLoan", label: "Home Equity Loan" }),
    Object.freeze({ value: "otherPropertySecuredDebt", label: "Other Property-Secured Debt" })
  ]);

  const HOME_SQUARE_FOOTAGE_OPTIONS = Object.freeze([
    Object.freeze({ value: "", label: "Sq Ft" }),
    Object.freeze({ value: "Under 1,500 sq ft", label: "Under 1,500" }),
    Object.freeze({ value: "1,500-2,499 sq ft", label: "1,500-2,499" }),
    Object.freeze({ value: "2,500-3,499 sq ft", label: "2,500-3,499" }),
    Object.freeze({ value: "3,500+ sq ft", label: "3,500+" })
  ]);

  const CALCULATED_HOUSING_FIELD_KEYS = Object.freeze([
    "monthlyMaintenanceRecommendation",
    "monthlyMortgagePaymentOnly",
    "associatedMonthlyCosts",
    "calculatedMonthlyMortgagePayment"
  ]);

  const CALCULATION_SOURCE_FIELD_KEYS = Object.freeze([
    "typeKey",
    "currentBalance",
    "mortgageTermRemainingYears",
    "mortgageTermRemainingMonths",
    "interestRatePercent",
    "rentMonthly",
    "otherHousingCostMonthly",
    "utilitiesMonthly",
    "homeownersInsuranceMonthly",
    "rentersInsuranceMonthly",
    "propertyTaxMonthly",
    "hoaMonthly",
    "homeSquareFootage",
    "homeAgeYears"
  ]);

  const REMOVED_ESCROW_FIELD_KEYS = Object.freeze([
    "escrowStatus",
    "costsIncludedInPayment",
    "propertyTaxIncludedInPayment",
    "insuranceIncludedInPayment",
    "homeownersInsuranceIncludedInPayment",
    "hoaIncludedInPayment"
  ]);

  const REMOVED_TOP_LEVEL_MORTGAGE_FIELD_KEYS = Object.freeze([
    "monthlyPayment",
    "mortgageTermRemainingYears",
    "mortgageTermRemainingMonths",
    "remainingTermMonths"
  ]);

  const REMOVED_TOP_LEVEL_MAINTENANCE_FIELD_KEYS = Object.freeze([
    "maintenanceMonthly"
  ]);

  const REMOVED_TOP_LEVEL_SECURED_DEBT_TYPES = Object.freeze([
    "secondMortgageHeloc",
    "secondMortgage",
    "heloc",
    "homeEquityLoan"
  ]);

  const LEGACY_PRIMARY_RESIDENCE_TYPE_ARRANGEMENTS = Object.freeze({
    primaryResidenceMortgage: "ownWithMortgage",
    primaryResidenceRent: "rent",
    primaryResidenceOwnedFreeAndClear: "ownFreeAndClear"
  });

  const PROPERTY_SECURED_DEBT_OWNER_TYPES = Object.freeze([
    "primaryResidence",
    "secondHomeVacationProperty",
    "rentalInvestmentProperty",
    "housingOperatingCostOnly"
  ]);

  const PROPERTY_SECURED_DEBT_FIELD_KEYS = Object.freeze([
    "debtType",
    "label",
    "currentBalance",
    "monthlyPayment",
    "interestRatePercent",
    "rateType",
    "paymentType",
    "remainingTermMonths",
    "lienPosition",
    "continuesAfterDeath",
    "creditLimit",
    "drawPeriodEndDate",
    "interestOnlyDuringDrawPeriod",
    "repaymentPeriodMonths",
    "originalLoanAmount",
    "originalTermMonths",
    "balloonPaymentDate",
    "balloonAmount"
  ]);

  const PROPERTY_SECURED_DEBT_HELOC_FIELDS = Object.freeze([
    "creditLimit",
    "drawPeriodEndDate",
    "interestOnlyDuringDrawPeriod",
    "repaymentPeriodMonths"
  ]);

  const PROPERTY_SECURED_DEBT_INSTALLMENT_FIELDS = Object.freeze([
    "originalLoanAmount",
    "originalTermMonths",
    "balloonPaymentDate",
    "balloonAmount"
  ]);

  const FIELD_DEFINITIONS = Object.freeze({
    label: Object.freeze({ label: "Record Label", type: "text", placeholder: "Housing record" }),
    typeKey: Object.freeze({ label: "Housing Type", type: "housingType" }),
    primaryResidenceArrangement: Object.freeze({ label: "Primary Residence Arrangement", type: "primaryResidenceArrangement" }),
    continuesAfterDeath: Object.freeze({ label: "Survivor expected to remain?", type: "continuesAfterDeath" }),
    propertyValue: Object.freeze({ label: "Property Value", type: "number", step: "1000", suffix: "USD" }),
    currentBalance: Object.freeze({ label: "Current Balance", type: "number", step: "1000", suffix: "USD" }),
    monthlyPayment: Object.freeze({ label: "Monthly Payment", type: "number", step: "50", suffix: "USD" }),
    interestRatePercent: Object.freeze({ label: "Interest Rate", type: "number", step: "0.01", suffix: "%" }),
    remainingTermMonths: Object.freeze({ label: "Remaining Term", type: "number", step: "1", suffix: "Months" }),
    propertyTaxMonthly: Object.freeze({ label: "Monthly Property Tax", type: "number", step: "25", suffix: "USD" }),
    homeownersInsuranceMonthly: Object.freeze({ label: "Housing Insurance", type: "number", step: "25", suffix: "USD" }),
    hoaMonthly: Object.freeze({ label: "HOA", type: "number", step: "25", suffix: "USD" }),
    utilitiesMonthly: Object.freeze({ label: "Utilities", type: "number", step: "25", suffix: "USD" }),
    homeSquareFootage: Object.freeze({ label: "Home Square Footage", type: "homeSquareFootage" }),
    homeAgeYears: Object.freeze({ label: "Home Age", type: "text", inputMode: "numeric", placeholder: "Years" }),
    monthlyMaintenanceRecommendation: Object.freeze({ label: "Recommended Maintenance / Repairs", type: "calculatedCurrency" }),
    mortgageTermRemainingYears: Object.freeze({ label: "Remaining Term Years", type: "number", step: "1", suffix: "Years" }),
    mortgageTermRemainingMonths: Object.freeze({ label: "Remaining Term Months", type: "number", step: "1", max: "11", suffix: "Months" }),
    monthlyMortgagePaymentOnly: Object.freeze({ label: "Calculated Mortgage Payment", type: "calculatedCurrency" }),
    associatedMonthlyCosts: Object.freeze({ label: "Associated Monthly Costs", type: "calculatedCurrency" }),
    calculatedMonthlyMortgagePayment: Object.freeze({ label: "Calculated Monthly Burden", type: "calculatedCurrency" }),
    rentMonthly: Object.freeze({ label: "Monthly Rent", type: "number", step: "50", suffix: "USD" }),
    leaseTermMonths: Object.freeze({ label: "Lease Term", type: "number", step: "1", suffix: "Months" }),
    otherHousingCostMonthly: Object.freeze({ label: "Other Housing Costs", type: "number", step: "25", suffix: "USD" }),
    rentersInsuranceMonthly: Object.freeze({ label: "Renters Insurance", type: "number", step: "25", suffix: "USD" }),
    equityAmount: Object.freeze({ label: "Equity", type: "number", step: "1000", suffix: "USD" }),
    debtSubType: Object.freeze({
      label: "Debt Type",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "secondMortgage", label: "Second Mortgage" }),
        Object.freeze({ value: "heloc", label: "HELOC" }),
        Object.freeze({ value: "homeEquityLoan", label: "Home Equity Loan" })
      ])
    }),
    rateType: Object.freeze({
      label: "Rate Type",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "fixed", label: "Fixed" }),
        Object.freeze({ value: "variable", label: "Variable" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    paymentType: Object.freeze({
      label: "Payment Type",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "principalAndInterest", label: "Principal + Interest" }),
        Object.freeze({ value: "interestOnly", label: "Interest-Only" }),
        Object.freeze({ value: "minimumPayment", label: "Minimum Payment" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    creditLimit: Object.freeze({ label: "Credit Limit", type: "number", step: "1000", suffix: "USD", showForDebtSubType: "heloc" }),
    drawPeriodEndDate: Object.freeze({ label: "Draw Period End Date", type: "date", showForDebtSubType: "heloc" }),
    interestOnlyDuringDrawPeriod: Object.freeze({
      label: "Interest-Only During Draw Period",
      type: "select",
      showForDebtSubType: "heloc",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "yes", label: "Yes" }),
        Object.freeze({ value: "no", label: "No" }),
        Object.freeze({ value: "unknown", label: "Unknown" })
      ])
    }),
    repaymentPeriodMonths: Object.freeze({ label: "Repayment Period", type: "number", step: "1", suffix: "Months", showForDebtSubType: "heloc" }),
    lienPosition: Object.freeze({ label: "Lien Position", type: "number", step: "1" }),
    linkedPropertyLabel: Object.freeze({ label: "Linked Property", type: "text", placeholder: "Property label" }),
    mortgageBalance: Object.freeze({ label: "Mortgage Balance, If Any", type: "number", step: "1000", suffix: "USD" }),
    grossMonthlyRentReceived: Object.freeze({ label: "Gross Monthly Rent Received", type: "number", step: "50", suffix: "USD" }),
    monthlyCost: Object.freeze({ label: "Monthly Cost", type: "number", step: "25", suffix: "USD" }),
    expectedDurationMonths: Object.freeze({ label: "Expected Duration", type: "number", step: "1", suffix: "Months" }),
    reasonLabel: Object.freeze({ label: "Reason / Label", type: "text", placeholder: "Relocation, bridge housing, etc." }),
    notes: Object.freeze({ label: "Notes", type: "textarea" }),
    reviewStatus: Object.freeze({
      label: "Review Status",
      type: "select",
      options: Object.freeze([
        Object.freeze({ value: "", label: "Select" }),
        Object.freeze({ value: "review", label: "Review" }),
        Object.freeze({ value: "confirmed", label: "Confirmed" }),
        Object.freeze({ value: "excluded", label: "Excluded" })
      ])
    })
  });

  const BASE_FIELDS = Object.freeze(["typeKey", "label", "continuesAfterDeath"]);
  const PRIMARY_RESIDENCE_BASE_FIELDS = Object.freeze(["typeKey", "label", "primaryResidenceArrangement", "continuesAfterDeath"]);

  const PRIMARY_RESIDENCE_FIELD_GROUPS_BY_ARRANGEMENT = Object.freeze({
    ownWithMortgage: Object.freeze([
      "propertyValue",
      "equityAmount",
      "currentBalance",
      "interestRatePercent",
      "monthlyMortgagePaymentOnly",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "homeSquareFootage",
      "homeAgeYears",
      "monthlyMaintenanceRecommendation",
      "utilitiesMonthly",
      "otherHousingCostMonthly",
      "associatedMonthlyCosts",
      "calculatedMonthlyMortgagePayment"
    ]),
    rent: Object.freeze([
      "rentMonthly",
      "leaseTermMonths",
      "otherHousingCostMonthly",
      "utilitiesMonthly",
      "rentersInsuranceMonthly"
    ]),
    ownFreeAndClear: Object.freeze([
      "propertyValue",
      "equityAmount",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "homeSquareFootage",
      "homeAgeYears",
      "monthlyMaintenanceRecommendation",
      "utilitiesMonthly",
      "otherHousingCostMonthly",
      "associatedMonthlyCosts",
      "calculatedMonthlyMortgagePayment"
    ])
  });

  const FIELD_SECTION_CONFIGS = Object.freeze([
    Object.freeze({
      sectionKey: "classification",
      label: "Classification",
      fields: Object.freeze(["typeKey", "label", "primaryResidenceArrangement", "continuesAfterDeath"])
    }),
    Object.freeze({
      sectionKey: "propertyMortgage",
      label: "Property & Mortgage",
      fields: Object.freeze([
        "propertyValue",
        "equityAmount",
        "currentBalance",
        "mortgageBalance",
        "interestRatePercent",
        "monthlyMortgagePaymentOnly",
        "propertyTaxMonthly",
        "grossMonthlyRentReceived"
      ])
    }),
    Object.freeze({
      sectionKey: "homeDetails",
      label: "Home Details",
      fields: Object.freeze(["homeSquareFootage", "homeAgeYears"])
    }),
    Object.freeze({
      sectionKey: "monthlyCosts",
      label: "Monthly Costs",
      fields: Object.freeze([
        "rentMonthly",
        "leaseTermMonths",
        "homeownersInsuranceMonthly",
        "rentersInsuranceMonthly",
        "hoaMonthly",
        "utilitiesMonthly",
        "otherHousingCostMonthly",
        "monthlyMaintenanceRecommendation"
      ])
    }),
    Object.freeze({
      sectionKey: "summary",
      label: "Summary",
      fields: Object.freeze(["associatedMonthlyCosts", "calculatedMonthlyMortgagePayment"])
    }),
    Object.freeze({
      sectionKey: "details",
      label: "Details",
      fields: Object.freeze(["monthlyCost", "expectedDurationMonths", "reasonLabel", "notes", "reviewStatus"])
    })
  ]);

  const FIELD_GROUPS_BY_TYPE = Object.freeze({
    secondHomeVacationProperty: Object.freeze([
      "propertyValue",
      "mortgageBalance",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "homeSquareFootage",
      "homeAgeYears",
      "monthlyMaintenanceRecommendation",
      "utilitiesMonthly",
      "otherHousingCostMonthly",
      "associatedMonthlyCosts",
      "calculatedMonthlyMortgagePayment"
    ]),
    rentalInvestmentProperty: Object.freeze([
      "propertyValue",
      "mortgageBalance",
      "grossMonthlyRentReceived",
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "homeSquareFootage",
      "homeAgeYears",
      "monthlyMaintenanceRecommendation",
      "utilitiesMonthly",
      "otherHousingCostMonthly",
      "associatedMonthlyCosts",
      "calculatedMonthlyMortgagePayment"
    ]),
    temporaryHousing: Object.freeze([
      "monthlyCost",
      "expectedDurationMonths",
      "reasonLabel"
    ]),
    housingOperatingCostOnly: Object.freeze([
      "propertyTaxMonthly",
      "homeownersInsuranceMonthly",
      "hoaMonthly",
      "homeSquareFootage",
      "homeAgeYears",
      "monthlyMaintenanceRecommendation",
      "utilitiesMonthly",
      "otherHousingCostMonthly",
      "associatedMonthlyCosts",
      "calculatedMonthlyMortgagePayment"
    ]),
    otherHousingObligation: Object.freeze([
      "monthlyCost",
      "notes",
      "reviewStatus"
    ])
  });

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function toOptionalNumber(value) {
    if (typeof lensAnalysis.toOptionalNumber === "function") {
      return lensAnalysis.toOptionalNumber(value);
    }

    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const normalized = String(value)
      .replace(/,/g, "")
      .replace(/[^0-9.-]/g, "")
      .trim();

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseCurrencyLikeNumber(value) {
    const optionalValue = toOptionalNumber(value);
    return optionalValue == null ? 0 : optionalValue;
  }

  function isTrue(value) {
    return value === true || normalizeString(value).toLowerCase() === "true";
  }

  function normalizeContinuesAfterDeath(value) {
    return normalizeString(value).toLowerCase() === "no" ? "no" : "yes";
  }

  function formatNumberWithCommas(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return "";
    }

    return Math.round(numericValue).toLocaleString("en-US");
  }

  function formatCurrencyDisplay(value) {
    const numericValue = toOptionalNumber(value);
    return numericValue == null ? "" : `$${formatNumberWithCommas(numericValue)}`;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getTypeConfig(typeKey) {
    return HOUSING_TYPE_OPTIONS.find((option) => option.value === typeKey) || HOUSING_TYPE_OPTIONS[0];
  }

  function getPrimaryResidenceArrangementConfig(arrangement) {
    return PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS.find((option) => option.value === arrangement)
      || PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS[0];
  }

  function normalizePrimaryResidenceArrangement(value) {
    return getPrimaryResidenceArrangementConfig(normalizeString(value)).value;
  }

  function getPrimaryResidenceArrangementForSource(source) {
    const rawTypeKey = normalizeString(source?.typeKey);
    return normalizePrimaryResidenceArrangement(
      source?.primaryResidenceArrangement
      || LEGACY_PRIMARY_RESIDENCE_TYPE_ARRANGEMENTS[rawTypeKey]
      || ""
    );
  }

  function getPropertySecuredDebtTypeConfig(debtType) {
    return PROPERTY_SECURED_DEBT_TYPE_OPTIONS.find((option) => option.value === debtType)
      || PROPERTY_SECURED_DEBT_TYPE_OPTIONS[0];
  }

  function normalizePropertySecuredDebtType(value) {
    const normalizedValue = normalizeString(value);
    if (normalizedValue === "firstMortgage") {
      return "otherPropertySecuredDebt";
    }
    if (normalizedValue === "secondMortgageHeloc") {
      return "secondMortgage";
    }
    return getPropertySecuredDebtTypeConfig(normalizedValue).value;
  }

  function supportsPropertySecuredDebts(recordOrTypeKey) {
    const typeKey = typeof recordOrTypeKey === "string"
      ? getTypeConfig(recordOrTypeKey).value
      : getTypeConfig(recordOrTypeKey?.typeKey).value;
    if (!PROPERTY_SECURED_DEBT_OWNER_TYPES.includes(typeKey)) {
      return false;
    }
    if (typeKey === "primaryResidence" && typeof recordOrTypeKey !== "string") {
      return normalizePrimaryResidenceArrangement(recordOrTypeKey?.primaryResidenceArrangement) !== "rent";
    }
    return true;
  }

  function omitRemovedEscrowFields(record) {
    const source = record && typeof record === "object" ? record : {};
    const sanitized = { ...source };
    REMOVED_ESCROW_FIELD_KEYS.forEach((fieldKey) => {
      delete sanitized[fieldKey];
    });
    return sanitized;
  }

  function omitRemovedHousingRecordFields(record) {
    const sanitized = omitRemovedEscrowFields(record);
    delete sanitized.propertyRole;
    REMOVED_TOP_LEVEL_MORTGAGE_FIELD_KEYS.forEach((fieldKey) => {
      delete sanitized[fieldKey];
    });
    REMOVED_TOP_LEVEL_MAINTENANCE_FIELD_KEYS.forEach((fieldKey) => {
      delete sanitized[fieldKey];
    });
    return sanitized;
  }

  function getStaleSecuredDebtNotes(source, debtType) {
    const debtLabel = getPropertySecuredDebtTypeConfig(debtType).label;
    const noteParts = [
      `Converted from old top-level ${debtLabel} housing record.`
    ];
    [
      ["Current balance", source.currentBalance],
      ["Monthly payment", source.monthlyPayment],
      ["Interest rate", source.interestRatePercent],
      ["Rate type", source.rateType],
      ["Payment type", source.paymentType],
      ["Remaining term", source.remainingTermMonths],
      ["Credit limit", source.creditLimit],
      ["Draw period end date", source.drawPeriodEndDate],
      ["Repayment period", source.repaymentPeriodMonths],
      ["Lien position", source.lienPosition],
      ["Linked property", source.linkedPropertyLabel]
    ].forEach(([label, value]) => {
      const normalizedValue = normalizeString(value);
      if (normalizedValue) {
        noteParts.push(`${label}: ${normalizedValue}`);
      }
    });
    return noteParts.join(" ");
  }

  function migrateRemovedTopLevelSecuredDebtRecord(record) {
    const source = record && typeof record === "object" ? record : {};
    if (!REMOVED_TOP_LEVEL_SECURED_DEBT_TYPES.includes(normalizeString(source.typeKey))) {
      return source;
    }

    const debtType = normalizePropertySecuredDebtType(source.debtSubType || source.typeKey);
    const debtLabel = getPropertySecuredDebtTypeConfig(debtType).label;
    const existingNotes = normalizeString(source.notes);
    return {
      ...source,
      typeKey: "otherHousingObligation",
      label: normalizeString(source.label) || debtLabel,
      monthlyCost: source.monthlyCost || source.monthlyPayment || "",
      notes: [existingNotes, getStaleSecuredDebtNotes(source, debtType)].filter(Boolean).join(" ")
    };
  }

  function createPropertySecuredDebt(partialDebt) {
    const source = partialDebt && typeof partialDebt === "object" ? partialDebt : {};
    const debtType = normalizePropertySecuredDebtType(source.debtType || source.debtSubType);
    const typeLabel = getPropertySecuredDebtTypeConfig(debtType).label;
    const securedDebtId = normalizeString(source.securedDebtId)
      || `property-secured-debt-${Date.now().toString(36)}-${++generatedHousingRecordCounter}`;
    const label = normalizeString(source.label) || typeLabel;

    return {
      ...source,
      securedDebtId,
      debtType,
      label,
      continuesAfterDeath: normalizeContinuesAfterDeath(source.continuesAfterDeath)
    };
  }

  function getHousingStatusForRecord(record) {
    const typeKey = getTypeConfig(record?.typeKey).value;
    const primaryResidenceArrangement = normalizePrimaryResidenceArrangement(record?.primaryResidenceArrangement);
    if (typeKey === "primaryResidence" && primaryResidenceArrangement === "rent") {
      return "Renter";
    }
    if (typeKey === "primaryResidence" && primaryResidenceArrangement === "ownWithMortgage") {
      return "Homeowner";
    }
    if (
      (typeKey === "primaryResidence" && primaryResidenceArrangement === "ownFreeAndClear")
      || typeKey === "secondHomeVacationProperty"
      || typeKey === "rentalInvestmentProperty"
      || typeKey === "housingOperatingCostOnly"
    ) {
      return "Owns Free and Clear";
    }
    return "";
  }

  function normalizeHomeAgeValue(value) {
    const rawValue = normalizeString(value);
    if (!rawValue) {
      return "";
    }

    const numericValue = Math.max(0, Math.round(parseCurrencyLikeNumber(rawValue)));
    return numericValue > 41 ? "42+" : String(numericValue);
  }

  function mapRecordToHousingCalculationSource(record) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const housingStatus = getHousingStatusForRecord(safeRecord);
    return {
      housingStatus,
      mortgageBalance: safeRecord.currentBalance,
      monthlyMortgagePaymentOnly: safeRecord.monthlyMortgagePaymentOnly,
      monthlyMortgagePaymentOnlyManualOverride: safeRecord.monthlyMortgagePaymentOnlyManualOverride,
      mortgageTermRemainingYears: safeRecord.mortgageTermRemainingYears,
      mortgageTermRemainingMonths: safeRecord.mortgageTermRemainingMonths,
      mortgageInterestRate: safeRecord.interestRatePercent,
      monthlyHousingCost: safeRecord.rentMonthly,
      otherMonthlyRenterHousingCosts: safeRecord.otherHousingCostMonthly,
      utilitiesCost: safeRecord.utilitiesMonthly,
      housingInsuranceCost: safeRecord.rentersInsuranceMonthly || safeRecord.homeownersInsuranceMonthly,
      propertyTax: safeRecord.propertyTaxMonthly,
      monthlyHoaCost: safeRecord.hoaMonthly,
      homeSquareFootage: safeRecord.homeSquareFootage,
      homeAgeYears: safeRecord.homeAgeYears,
      monthlyMaintenanceRecommendation: safeRecord.monthlyMaintenanceRecommendation,
      monthlyMaintenanceRecommendationManualOverride: safeRecord.monthlyMaintenanceRecommendationManualOverride,
      associatedMonthlyCosts: safeRecord.associatedMonthlyCosts,
      associatedMonthlyCostsManualOverride: safeRecord.associatedMonthlyCostsManualOverride,
      calculatedMonthlyMortgagePayment: safeRecord.calculatedMonthlyMortgagePayment,
      calculatedMonthlyMortgagePaymentManualOverride: safeRecord.calculatedMonthlyMortgagePaymentManualOverride
    };
  }

  function getCalculatedHousingValues(record, controller) {
    const calculateHousingSupportInputs = lensAnalysis.housingSupportCalculations?.calculateHousingSupportInputs;
    if (typeof calculateHousingSupportInputs !== "function") {
      return {};
    }

    const maintenanceRows = typeof controller?.maintenanceRowsProvider === "function"
      ? controller.maintenanceRowsProvider()
      : null;
    return calculateHousingSupportInputs(mapRecordToHousingCalculationSource(record), { maintenanceRows }).values || {};
  }

  function applyCalculatedValuesToRecord(record, controller) {
    if (!record || typeof record !== "object") {
      return;
    }

    const values = getCalculatedHousingValues(record, controller);
    const valueByField = {
      monthlyMaintenanceRecommendation: values.calculatedMaintenanceRecommendation,
      monthlyMortgagePaymentOnly: values.calculatedMortgagePaymentOnly,
      associatedMonthlyCosts: values.calculatedAssociatedMonthlyCosts,
      calculatedMonthlyMortgagePayment: values.calculatedMonthlyHousingSupportCost
    };

    CALCULATED_HOUSING_FIELD_KEYS.forEach((fieldKey) => {
      const calculatedValue = valueByField[fieldKey];
      const calculatedKey = `${fieldKey}CalculatedValue`;
      const manualOverrideKey = `${fieldKey}ManualOverride`;
      record[calculatedKey] = calculatedValue == null ? "" : String(Math.round(calculatedValue));
      if (!isTrue(record[manualOverrideKey])) {
        record[fieldKey] = record[calculatedKey];
      }
    });
  }

  function createHousingRecord(partialRecord) {
    const source = migrateRemovedTopLevelSecuredDebtRecord(omitRemovedHousingRecordFields(partialRecord));
    const rawTypeKey = normalizeString(source.typeKey);
    const typeKey = LEGACY_PRIMARY_RESIDENCE_TYPE_ARRANGEMENTS[rawTypeKey]
      ? "primaryResidence"
      : getTypeConfig(source.typeKey).value;
    const primaryResidenceArrangement = typeKey === "primaryResidence"
      ? getPrimaryResidenceArrangementForSource(source)
      : normalizePrimaryResidenceArrangement(source.primaryResidenceArrangement);
    const label = normalizeString(source.label) || getTypeConfig(typeKey).label;
    const housingRecordId = normalizeString(source.housingRecordId)
      || `housing-record-${Date.now().toString(36)}-${++generatedHousingRecordCounter}`;
    const recordForSupport = { typeKey, primaryResidenceArrangement };
    const propertySecuredDebts = supportsPropertySecuredDebts(recordForSupport) && Array.isArray(source.propertySecuredDebts)
      ? source.propertySecuredDebts.map(createPropertySecuredDebt)
      : [];

    const housingRecord = {
      housingRecordId,
      typeKey,
      label,
      continuesAfterDeath: normalizeContinuesAfterDeath(source.continuesAfterDeath),
      ...source,
      housingRecordId,
      typeKey,
      primaryResidenceArrangement,
      label,
      continuesAfterDeath: normalizeContinuesAfterDeath(source.continuesAfterDeath),
      propertySecuredDebts
    };
    if (typeKey !== "primaryResidence") {
      delete housingRecord.primaryResidenceArrangement;
    }
    return housingRecord;
  }

  function serializeHousingRecord(record) {
    const sanitizedRecord = {
      ...omitRemovedHousingRecordFields(record),
      continuesAfterDeath: normalizeContinuesAfterDeath(record?.continuesAfterDeath)
    };
    const typeKey = getTypeConfig(sanitizedRecord.typeKey).value;
    const recordForSupport = {
      ...sanitizedRecord,
      typeKey,
      primaryResidenceArrangement: typeKey === "primaryResidence"
        ? normalizePrimaryResidenceArrangement(sanitizedRecord.primaryResidenceArrangement)
        : sanitizedRecord.primaryResidenceArrangement
    };
    if (!supportsPropertySecuredDebts(recordForSupport)) {
      const { propertySecuredDebts, ...recordWithoutSecuredDebts } = sanitizedRecord;
      if (typeKey !== "primaryResidence") {
        delete recordWithoutSecuredDebts.primaryResidenceArrangement;
      }
      return recordWithoutSecuredDebts;
    }

    const serializedRecord = {
      ...sanitizedRecord,
      propertySecuredDebts: Array.isArray(sanitizedRecord.propertySecuredDebts)
        ? sanitizedRecord.propertySecuredDebts.map(createPropertySecuredDebt)
        : []
    };
    if (typeKey !== "primaryResidence") {
      delete serializedRecord.primaryResidenceArrangement;
    }
    return serializedRecord;
  }

  function renderOptions(options, selectedValue) {
    return options.map((option) => {
      const selected = option.value === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    }).join("");
  }

  function shouldShowField(fieldConfig, record) {
    if (!fieldConfig || !fieldConfig.showForDebtSubType) {
      return true;
    }

    return normalizeString(record.debtSubType) === fieldConfig.showForDebtSubType;
  }

  function getBaseFieldsForRecord(record) {
    const typeKey = getTypeConfig(record?.typeKey).value;
    if (typeKey !== "primaryResidence") {
      return BASE_FIELDS;
    }
    return PRIMARY_RESIDENCE_BASE_FIELDS;
  }

  function getFieldGroupForRecord(record) {
    const typeKey = getTypeConfig(record?.typeKey).value;
    if (typeKey === "primaryResidence") {
      return PRIMARY_RESIDENCE_FIELD_GROUPS_BY_ARRANGEMENT[
        normalizePrimaryResidenceArrangement(record?.primaryResidenceArrangement)
      ] || PRIMARY_RESIDENCE_FIELD_GROUPS_BY_ARRANGEMENT.ownWithMortgage;
    }
    return FIELD_GROUPS_BY_TYPE[typeKey] || PRIMARY_RESIDENCE_FIELD_GROUPS_BY_ARRANGEMENT.ownWithMortgage;
  }

  function getFieldLabel(fieldKey, fieldConfig, record) {
    const typeKey = getTypeConfig(record?.typeKey).value;
    const primaryResidenceArrangement = normalizePrimaryResidenceArrangement(record?.primaryResidenceArrangement);
    const isMainMortgageRecord = (
      (typeKey === "primaryResidence" && primaryResidenceArrangement === "ownWithMortgage")
      || typeKey === "secondHomeVacationProperty"
      || typeKey === "rentalInvestmentProperty"
    );

    if (isMainMortgageRecord) {
      if (fieldKey === "currentBalance" || fieldKey === "mortgageBalance") {
        return "Mortgage Balance";
      }
      if (fieldKey === "interestRatePercent") {
        return "Mortgage Interest Rate";
      }
    }

    if (fieldKey !== "monthlyPayment") {
      return fieldConfig.label;
    }

    return fieldConfig.label;
  }

  function renderControl(fieldKey, fieldConfig, record) {
    const value = normalizeString(record[fieldKey]);
    const commonAttributes = `data-pmi-housing-record-input="${escapeHtml(fieldKey)}"`;

    if (fieldConfig.type === "housingType") {
      return `<select ${commonAttributes}>${renderOptions(HOUSING_TYPE_OPTIONS, record.typeKey)}</select>`;
    }

    if (fieldConfig.type === "primaryResidenceArrangement") {
      return `<select ${commonAttributes}>${renderOptions(PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS, record.primaryResidenceArrangement)}</select>`;
    }

    if (fieldConfig.type === "continuesAfterDeath") {
      return `<select ${commonAttributes}>${renderOptions(CONTINUES_AFTER_DEATH_OPTIONS, record.continuesAfterDeath)}</select>`;
    }

    if (fieldConfig.type === "homeSquareFootage") {
      return `<select ${commonAttributes}>${renderOptions(HOME_SQUARE_FOOTAGE_OPTIONS, value)}</select>`;
    }

    if (fieldConfig.type === "select") {
      return `<select ${commonAttributes}>${renderOptions(fieldConfig.options, value)}</select>`;
    }

    if (fieldConfig.type === "textarea") {
      return `<textarea ${commonAttributes} rows="2">${escapeHtml(value)}</textarea>`;
    }

    if (fieldConfig.type === "calculatedCurrency") {
      const manualOverride = isTrue(record[`${fieldKey}ManualOverride`]);
      return `
        <div class="profile-currency-field pmi-housing-record-input-shell pmi-housing-record-calculated-shell">
          <input ${commonAttributes} data-pmi-housing-record-calculated-input="${escapeHtml(fieldKey)}" type="text" inputmode="decimal" value="${escapeHtml(formatCurrencyDisplay(value))}" readonly>
          <span class="profile-currency-suffix">USD</span>
          <button class="net-income-action pmi-housing-record-calculated-action" type="button" data-pmi-housing-record-calculated-action="${escapeHtml(fieldKey)}">${manualOverride ? "Reset" : "Edit"}</button>
        </div>
      `;
    }

    const inputType = fieldConfig.type === "date" ? "date" : fieldConfig.type === "number" ? "number" : "text";
    const step = fieldConfig.step ? ` step="${escapeHtml(fieldConfig.step)}"` : "";
    const min = inputType === "number" ? ' min="0"' : "";
    const max = fieldConfig.max ? ` max="${escapeHtml(fieldConfig.max)}"` : "";
    const inputMode = fieldConfig.inputMode ? ` inputmode="${escapeHtml(fieldConfig.inputMode)}"` : "";
    const placeholder = fieldConfig.placeholder ? ` placeholder="${escapeHtml(fieldConfig.placeholder)}"` : "";
    const control = `<input ${commonAttributes} type="${inputType}" value="${escapeHtml(value)}"${min}${max}${step}${inputMode}${placeholder}>`;

    if (!fieldConfig.suffix) {
      return control;
    }

    return `
      <div class="profile-currency-field pmi-housing-record-input-shell">
        ${control}
        <span class="profile-currency-suffix">${escapeHtml(fieldConfig.suffix)}</span>
      </div>
    `;
  }

  function renderField(fieldKey, record, groupName) {
    const fieldConfig = FIELD_DEFINITIONS[fieldKey];
    if (!shouldShowField(fieldConfig, record)) {
      return "";
    }
    const label = getFieldLabel(fieldKey, fieldConfig, record);

    return `
      <label class="pmi-housing-record-field" data-housing-record-field-group="${escapeHtml(groupName)}">
        <span>${escapeHtml(label)}</span>
        ${renderControl(fieldKey, fieldConfig, record)}
      </label>
    `;
  }

  function getFieldSectionGroups(fieldKeys) {
    const remainingFieldKeys = fieldKeys.slice();
    const sections = FIELD_SECTION_CONFIGS.map((sectionConfig) => {
      const fields = sectionConfig.fields.filter((fieldKey) => remainingFieldKeys.includes(fieldKey));
      fields.forEach((fieldKey) => {
        const index = remainingFieldKeys.indexOf(fieldKey);
        if (index >= 0) {
          remainingFieldKeys.splice(index, 1);
        }
      });
      return { ...sectionConfig, fields };
    }).filter((sectionConfig) => sectionConfig.fields.length);

    if (remainingFieldKeys.length) {
      sections.push({
        sectionKey: "other",
        label: "Additional Details",
        fields: remainingFieldKeys
      });
    }

    return sections;
  }

  function renderFieldSection(sectionConfig, record) {
    return `
      <section class="pmi-housing-record-section pmi-housing-record-section--${escapeHtml(sectionConfig.sectionKey)}" data-pmi-housing-record-section="${escapeHtml(sectionConfig.sectionKey)}">
        <div class="pmi-housing-record-section-divider">
          <span>${escapeHtml(sectionConfig.label)}</span>
        </div>
        <div class="pmi-housing-record-fields">
          ${sectionConfig.fields.map((fieldKey) => renderField(fieldKey, record, sectionConfig.sectionKey)).join("")}
        </div>
      </section>
    `;
  }

  function renderPropertySecuredDebtInput(debt, fieldKey, config) {
    const value = normalizeString(debt[fieldKey]);
    const commonAttributes = `data-pmi-property-secured-debt-input="${escapeHtml(fieldKey)}"`;

    if (config.type === "select") {
      return `<select ${commonAttributes}>${renderOptions(config.options, value)}</select>`;
    }

    if (config.type === "date") {
      return `<input ${commonAttributes} type="date" value="${escapeHtml(value)}">`;
    }

    const step = config.step ? ` step="${escapeHtml(config.step)}"` : "";
    const min = config.type === "number" ? ' min="0"' : "";
    const placeholder = config.placeholder ? ` placeholder="${escapeHtml(config.placeholder)}"` : "";
    const control = `<input ${commonAttributes} type="${config.type === "number" ? "number" : "text"}" value="${escapeHtml(value)}"${min}${step}${placeholder}>`;

    if (!config.suffix) {
      return control;
    }

    return `
      <div class="profile-currency-field pmi-housing-record-input-shell">
        ${control}
        <span class="profile-currency-suffix">${escapeHtml(config.suffix)}</span>
      </div>
    `;
  }

  function getPropertySecuredDebtFieldConfig(fieldKey) {
    const fieldConfigs = {
      debtType: { label: "Debt Type", type: "select", options: PROPERTY_SECURED_DEBT_TYPE_OPTIONS },
      label: { label: "Label", type: "text", placeholder: "Property-secured debt" },
      currentBalance: { label: "Debt Balance", type: "number", step: "1000", suffix: "USD" },
      monthlyPayment: { label: "Debt Monthly Payment", type: "number", step: "50", suffix: "USD" },
      interestRatePercent: { label: "Debt Interest Rate", type: "number", step: "0.01", suffix: "%" },
      rateType: FIELD_DEFINITIONS.rateType,
      paymentType: FIELD_DEFINITIONS.paymentType,
      remainingTermMonths: { label: "Debt Remaining Term", type: "number", step: "1", suffix: "Months" },
      lienPosition: FIELD_DEFINITIONS.lienPosition,
      continuesAfterDeath: { label: "Survivor expected to remain?", type: "select", options: CONTINUES_AFTER_DEATH_OPTIONS },
      creditLimit: { label: "Credit Limit", type: "number", step: "1000", suffix: "USD" },
      drawPeriodEndDate: { label: "Draw Period End Date", type: "date" },
      interestOnlyDuringDrawPeriod: {
        label: "Interest-Only During Draw Period",
        type: "select",
        options: FIELD_DEFINITIONS.interestOnlyDuringDrawPeriod.options
      },
      repaymentPeriodMonths: { label: "Repayment Period", type: "number", step: "1", suffix: "Months" },
      originalLoanAmount: { label: "Original Loan Amount", type: "number", step: "1000", suffix: "USD" },
      originalTermMonths: { label: "Original Term", type: "number", step: "1", suffix: "Months" },
      balloonPaymentDate: { label: "Balloon Payment Date", type: "date" },
      balloonAmount: { label: "Balloon Amount", type: "number", step: "1000", suffix: "USD" }
    };
    return fieldConfigs[fieldKey];
  }

  function shouldShowPropertySecuredDebtField(fieldKey, debt) {
    const debtType = normalizePropertySecuredDebtType(debt?.debtType);
    if (PROPERTY_SECURED_DEBT_HELOC_FIELDS.includes(fieldKey)) {
      return debtType === "heloc";
    }
    if (PROPERTY_SECURED_DEBT_INSTALLMENT_FIELDS.includes(fieldKey)) {
      return debtType === "secondMortgage" || debtType === "homeEquityLoan";
    }
    return true;
  }

  function renderPropertySecuredDebtField(fieldKey, debt) {
    if (!shouldShowPropertySecuredDebtField(fieldKey, debt)) {
      return "";
    }

    const config = getPropertySecuredDebtFieldConfig(fieldKey);
    if (!config) {
      return "";
    }

    return `
      <label class="pmi-housing-record-field pmi-property-secured-debt-field">
        <span>${escapeHtml(config.label)}</span>
        ${renderPropertySecuredDebtInput(debt, fieldKey, config)}
      </label>
    `;
  }

  function renderPropertySecuredDebtItem(debt, debtIndex) {
    const safeDebt = createPropertySecuredDebt(debt);
    const debtLabel = safeDebt.label || getPropertySecuredDebtTypeConfig(safeDebt.debtType).label;
    return `
      <article class="pmi-property-secured-debt-card" data-pmi-property-secured-debt-entry data-secured-debt-id="${escapeHtml(safeDebt.securedDebtId)}">
        <div class="pmi-property-secured-debt-card-header">
          <div>
            <span class="pmi-housing-record-index">Debt ${debtIndex + 1}</span>
            <h4>${escapeHtml(debtLabel)}</h4>
          </div>
          <button class="pmi-housing-record-remove" type="button" data-pmi-property-secured-debt-remove aria-label="Remove property-secured debt">Remove</button>
        </div>
        <div class="pmi-housing-record-fields pmi-property-secured-debt-fields">
          ${PROPERTY_SECURED_DEBT_FIELD_KEYS.map((fieldKey) => renderPropertySecuredDebtField(fieldKey, safeDebt)).join("")}
        </div>
      </article>
    `;
  }

  function renderPropertySecuredDebtSection(record) {
    if (!supportsPropertySecuredDebts(record)) {
      return "";
    }

    const debts = Array.isArray(record.propertySecuredDebts)
      ? record.propertySecuredDebts.map(createPropertySecuredDebt)
      : [];
    return `
      <section class="pmi-property-secured-debts-section" data-pmi-property-secured-debts-section>
        <div class="pmi-property-secured-debts-header">
          <div>
            <span class="pmi-housing-records-kicker">Additional Property-Secured Debts</span>
            <h4>Additional Property-Secured Debts</h4>
          </div>
          <button class="pmi-housing-records-add-button" type="button" data-pmi-property-secured-debt-add>Add Secured Debt</button>
        </div>
        <div class="pmi-property-secured-debts-list" data-pmi-property-secured-debts-list>
          ${debts.length ? debts.map(renderPropertySecuredDebtItem).join("") : '<p class="pmi-housing-records-empty">Add a property-secured debt when applicable.</p>'}
        </div>
      </section>
    `;
  }

  function renderRecord(record, index) {
    const baseFields = getBaseFieldsForRecord(record);
    const typeFields = getFieldGroupForRecord(record);
    const fieldSections = getFieldSectionGroups([...baseFields, ...typeFields]);
    const typeLabel = getTypeConfig(record.typeKey).label;

    return `
      <article class="pmi-housing-record-card" data-pmi-housing-record-entry data-housing-record-id="${escapeHtml(record.housingRecordId)}">
        <div class="pmi-housing-record-card-header">
          <div>
            <span class="pmi-reference-card-num pmi-housing-record-index">Housing ${index + 1}</span>
            <h3>${escapeHtml(record.label || typeLabel)}</h3>
          </div>
          <button class="pmi-housing-record-remove" type="button" data-pmi-housing-record-remove aria-label="Remove housing record">Remove</button>
        </div>
        <div class="pmi-housing-record-sections">
          ${fieldSections.map((sectionConfig) => renderFieldSection(sectionConfig, record)).join("")}
        </div>
        ${renderPropertySecuredDebtSection(record)}
      </article>
    `;
  }

  function renderShell(root) {
    if (!root || root.dataset.pmiHousingRecordsInitialized === "true") {
      return;
    }

    root.innerHTML = `
      <div class="pmi-housing-records-shell" data-pmi-housing-records-shell>
        <div class="pmi-housing-records-toolbar">
          <div>
            <span class="pmi-housing-records-kicker">Housing Records</span>
            <h3>Housing Records</h3>
          </div>
          <button class="pmi-housing-records-add-button" type="button" data-pmi-housing-record-add>Add Housing Record</button>
        </div>
        <div class="pmi-housing-records-list" data-pmi-housing-records-list></div>
      </div>
    `;
    root.dataset.pmiHousingRecordsInitialized = "true";
  }

  function initPmiHousingRecords(options) {
    const safeOptions = options && typeof options === "object" ? options : {};
    const root = typeof safeOptions.root === "string"
      ? document.querySelector(safeOptions.root)
      : safeOptions.root;

    if (!root) {
      return null;
    }

    renderShell(root);

    const controller = {
      root,
      records: [],
      addButton: root.querySelector("[data-pmi-housing-record-add]"),
      list: root.querySelector("[data-pmi-housing-records-list]"),
      maintenanceRowsProvider: typeof safeOptions.maintenanceRowsProvider === "function"
        ? safeOptions.maintenanceRowsProvider
        : null
    };

    function syncRecordFromRow(row) {
      if (!row) {
        return;
      }

      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record) {
        return;
      }

      row.querySelectorAll("[data-pmi-housing-record-input]").forEach((field) => {
        const fieldKey = field.getAttribute("data-pmi-housing-record-input");
        if (field.dataset.pmiHousingRecordCalculatedInput && field.readOnly) {
          return;
        }
        record[fieldKey] = field.value;
      });
      record.typeKey = getTypeConfig(record.typeKey).value;
      delete record.propertyRole;
      record.continuesAfterDeath = normalizeContinuesAfterDeath(record.continuesAfterDeath);
      if (record.typeKey === "primaryResidence") {
        record.primaryResidenceArrangement = normalizePrimaryResidenceArrangement(record.primaryResidenceArrangement);
      } else {
        delete record.primaryResidenceArrangement;
      }
      record.label = normalizeString(record.label) || getTypeConfig(record.typeKey).label;
      syncPropertySecuredDebtsFromRow(row, record);
      if (!supportsPropertySecuredDebts(record)) {
        record.propertySecuredDebts = [];
      }
    }

    function syncPropertySecuredDebtsFromRow(row, record) {
      if (!row || !record || !supportsPropertySecuredDebts(record)) {
        return;
      }

      record.propertySecuredDebts = Array.from(row.querySelectorAll("[data-pmi-property-secured-debt-entry]"))
        .map((debtRow) => {
          const debt = {
            securedDebtId: normalizeString(debtRow.getAttribute("data-secured-debt-id"))
          };
          debtRow.querySelectorAll("[data-pmi-property-secured-debt-input]").forEach((field) => {
            const fieldKey = field.getAttribute("data-pmi-property-secured-debt-input");
            debt[fieldKey] = field.value;
          });
          return createPropertySecuredDebt(debt);
        });
    }

    function syncRecordsFromDom() {
      controller.list?.querySelectorAll("[data-pmi-housing-record-entry]").forEach(syncRecordFromRow);
    }

    function notifyChange() {
      root.dispatchEvent(new CustomEvent("pmiHousingRecordsChange", {
        bubbles: true,
        detail: { records: serializeHousingRecords() }
      }));
    }

    function updateCalculatedDisplaysForRow(row) {
      if (!row) {
        return;
      }

      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record) {
        return;
      }

      applyCalculatedValuesToRecord(record, controller);
      CALCULATED_HOUSING_FIELD_KEYS.forEach((fieldKey) => {
        const input = row.querySelector(`[data-pmi-housing-record-calculated-input="${fieldKey}"]`);
        const actionButton = row.querySelector(`[data-pmi-housing-record-calculated-action="${fieldKey}"]`);
        if (!input || input.dataset.editing === "true") {
          return;
        }

        input.value = formatCurrencyDisplay(record[fieldKey]);
        input.readOnly = true;
        input.closest(".profile-currency-field")?.classList.remove("is-editing");
        if (actionButton) {
          actionButton.textContent = isTrue(record[`${fieldKey}ManualOverride`]) ? "Reset" : "Edit";
        }
      });
    }

    function beginCalculatedFieldEdit(row, fieldKey) {
      const input = row?.querySelector(`[data-pmi-housing-record-calculated-input="${fieldKey}"]`);
      if (!input) {
        return;
      }

      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record) {
        return;
      }

      input.dataset.editing = "true";
      input.readOnly = false;
      input.closest(".profile-currency-field")?.classList.add("is-editing");
      input.value = String(parseCurrencyLikeNumber(record[fieldKey]) || 0);
      input.focus();
      input.select();
    }

    function resetCalculatedField(row, fieldKey) {
      const recordId = row?.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record) {
        return;
      }

      delete record[`${fieldKey}ManualOverride`];
      delete record[`${fieldKey}ManualValue`];
      applyCalculatedValuesToRecord(record, controller);
      renderRows();
      notifyChange();
    }

    function finalizeCalculatedFieldEdit(input) {
      if (!input || input.dataset.editing !== "true") {
        return;
      }

      const row = input.closest("[data-pmi-housing-record-entry]");
      const fieldKey = input.getAttribute("data-pmi-housing-record-calculated-input");
      const recordId = row?.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record || !fieldKey) {
        return;
      }

      const typedValue = parseCurrencyLikeNumber(input.value);
      const calculatedValue = parseCurrencyLikeNumber(record[`${fieldKey}CalculatedValue`]);
      if (input.value.trim() && typedValue !== calculatedValue) {
        record[fieldKey] = String(typedValue);
        record[`${fieldKey}ManualOverride`] = true;
        record[`${fieldKey}ManualValue`] = String(typedValue);
      } else {
        delete record[`${fieldKey}ManualOverride`];
        delete record[`${fieldKey}ManualValue`];
      }

      delete input.dataset.editing;
      renderRows();
      notifyChange();
    }

    function renderRows() {
      if (!controller.list) {
        return;
      }

      controller.records.forEach((record) => applyCalculatedValuesToRecord(record, controller));
      controller.list.innerHTML = controller.records.length
        ? controller.records.map(renderRecord).join("")
        : '<p class="pmi-housing-records-empty">Add a housing record to begin.</p>';
    }

    function addHousingRecord(partialRecord) {
      syncRecordsFromDom();
      controller.records.push(createHousingRecord(partialRecord));
      renderRows();
      notifyChange();
    }

    function hydrateHousingRecords(records) {
      controller.records = Array.isArray(records)
        ? records.map(createHousingRecord)
        : [];
      renderRows();
    }

    function serializeHousingRecords() {
      syncRecordsFromDom();
      return controller.records.map(serializeHousingRecord);
    }

    controller.hydrateHousingRecords = hydrateHousingRecords;
    controller.serializeHousingRecords = serializeHousingRecords;
    controller.addHousingRecord = addHousingRecord;

    controller.addButton?.addEventListener("click", () => addHousingRecord({}));
    controller.list?.addEventListener("click", (event) => {
      const securedDebtAddButton = event.target.closest("[data-pmi-property-secured-debt-add]");
      if (securedDebtAddButton) {
        const row = securedDebtAddButton.closest("[data-pmi-housing-record-entry]");
        const recordId = row?.getAttribute("data-housing-record-id");
        const record = controller.records.find((entry) => entry.housingRecordId === recordId);
        if (record && supportsPropertySecuredDebts(record)) {
          syncRecordFromRow(row);
          record.propertySecuredDebts = Array.isArray(record.propertySecuredDebts) ? record.propertySecuredDebts : [];
          record.propertySecuredDebts.push(createPropertySecuredDebt({}));
          renderRows();
          notifyChange();
        }
        return;
      }

      const securedDebtRemoveButton = event.target.closest("[data-pmi-property-secured-debt-remove]");
      if (securedDebtRemoveButton) {
        const row = securedDebtRemoveButton.closest("[data-pmi-housing-record-entry]");
        const debtRow = securedDebtRemoveButton.closest("[data-pmi-property-secured-debt-entry]");
        const recordId = row?.getAttribute("data-housing-record-id");
        const securedDebtId = debtRow?.getAttribute("data-secured-debt-id");
        const record = controller.records.find((entry) => entry.housingRecordId === recordId);
        if (record) {
          record.propertySecuredDebts = (record.propertySecuredDebts || []).filter((debt) => debt.securedDebtId !== securedDebtId);
          renderRows();
          notifyChange();
        }
        return;
      }

      const calculatedActionButton = event.target.closest("[data-pmi-housing-record-calculated-action]");
      if (calculatedActionButton) {
        const row = calculatedActionButton.closest("[data-pmi-housing-record-entry]");
        const fieldKey = calculatedActionButton.getAttribute("data-pmi-housing-record-calculated-action");
        const input = row?.querySelector(`[data-pmi-housing-record-calculated-input="${fieldKey}"]`);
        if (input?.dataset.editing === "true" || calculatedActionButton.textContent === "Reset") {
          resetCalculatedField(row, fieldKey);
        } else {
          beginCalculatedFieldEdit(row, fieldKey);
        }
        return;
      }

      const removeButton = event.target.closest("[data-pmi-housing-record-remove]");
      if (!removeButton) {
        return;
      }

      const row = removeButton.closest("[data-pmi-housing-record-entry]");
      const recordId = row?.getAttribute("data-housing-record-id");
      controller.records = controller.records.filter((record) => record.housingRecordId !== recordId);
      renderRows();
      notifyChange();
    });

    controller.list?.addEventListener("input", (event) => {
      const row = event.target.closest("[data-pmi-housing-record-entry]");
      if (!row) {
        return;
      }

      const securedDebtFieldKey = event.target.getAttribute("data-pmi-property-secured-debt-input");
      if (securedDebtFieldKey) {
        const recordId = row.getAttribute("data-housing-record-id");
        const record = controller.records.find((entry) => entry.housingRecordId === recordId);
        if (record) {
          syncPropertySecuredDebtsFromRow(row, record);
          if (securedDebtFieldKey === "debtType") {
            renderRows();
          }
          notifyChange();
        }
        return;
      }

      const fieldKey = event.target.getAttribute("data-pmi-housing-record-input");
      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      const previousTypeKey = record?.typeKey;
      syncRecordFromRow(row);
      if (fieldKey === "typeKey" || fieldKey === "primaryResidenceArrangement" || fieldKey === "debtSubType") {
        if (fieldKey === "typeKey" && record) {
          const previousTypeLabel = getTypeConfig(previousTypeKey).label;
          const currentLabel = normalizeString(record.label);
          if (!currentLabel || currentLabel === previousTypeLabel) {
            record.label = getTypeConfig(record.typeKey).label;
          }
        }
        renderRows();
      } else if (CALCULATION_SOURCE_FIELD_KEYS.includes(fieldKey)) {
        updateCalculatedDisplaysForRow(row);
      }
      notifyChange();
    });

    controller.list?.addEventListener("change", (event) => {
      const row = event.target.closest("[data-pmi-housing-record-entry]");
      if (!row) {
        return;
      }

      const securedDebtFieldKey = event.target.getAttribute("data-pmi-property-secured-debt-input");
      if (securedDebtFieldKey) {
        const recordId = row.getAttribute("data-housing-record-id");
        const record = controller.records.find((entry) => entry.housingRecordId === recordId);
        if (record) {
          syncPropertySecuredDebtsFromRow(row, record);
          if (securedDebtFieldKey === "debtType") {
            renderRows();
          }
          notifyChange();
        }
        return;
      }

      const fieldKey = event.target.getAttribute("data-pmi-housing-record-input");
      const recordId = row.getAttribute("data-housing-record-id");
      const record = controller.records.find((entry) => entry.housingRecordId === recordId);
      if (!record) {
        return;
      }

      syncRecordFromRow(row);
      if (fieldKey === "homeAgeYears") {
        record.homeAgeYears = normalizeHomeAgeValue(record.homeAgeYears);
        event.target.value = record.homeAgeYears;
      }

      if (fieldKey === "typeKey" || fieldKey === "primaryResidenceArrangement") {
        renderRows();
        notifyChange();
      } else if (CALCULATION_SOURCE_FIELD_KEYS.includes(fieldKey)) {
        updateCalculatedDisplaysForRow(row);
        notifyChange();
      }
    });

    controller.list?.addEventListener("blur", (event) => {
      const calculatedInput = event.target.closest("[data-pmi-housing-record-calculated-input]");
      if (calculatedInput) {
        finalizeCalculatedFieldEdit(calculatedInput);
        return;
      }

      const row = event.target.closest("[data-pmi-housing-record-entry]");
      const fieldKey = event.target.getAttribute("data-pmi-housing-record-input");
      if (row && fieldKey === "homeAgeYears") {
        syncRecordFromRow(row);
        const recordId = row.getAttribute("data-housing-record-id");
        const record = controller.records.find((entry) => entry.housingRecordId === recordId);
        if (record) {
          record.homeAgeYears = normalizeHomeAgeValue(record.homeAgeYears);
          event.target.value = record.homeAgeYears;
          updateCalculatedDisplaysForRow(row);
          notifyChange();
        }
      }
    }, true);

    hydrateHousingRecords([]);
    activeController = controller;
    return controller;
  }

  function hydrateHousingRecords(records) {
    if (activeController && typeof activeController.hydrateHousingRecords === "function") {
      activeController.hydrateHousingRecords(records);
    }
  }

  function serializeHousingRecords() {
    return activeController && typeof activeController.serializeHousingRecords === "function"
      ? activeController.serializeHousingRecords()
      : [];
  }

  lensAnalysis.pmiHousingRecords = {
    initPmiHousingRecords,
    hydrateHousingRecords,
    serializeHousingRecords,
    createHousingRecord,
    housingTypeOptions: HOUSING_TYPE_OPTIONS,
    primaryResidenceArrangementOptions: PRIMARY_RESIDENCE_ARRANGEMENT_OPTIONS,
    fieldGroupsByType: FIELD_GROUPS_BY_TYPE
  };
})(window);
