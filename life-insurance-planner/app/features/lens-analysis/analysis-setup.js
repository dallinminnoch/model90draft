(function () {
  const LensApp = window.LensApp || (window.LensApp = {});

  const RATE_FIELDS = [
    "generalInflationRatePercent",
    "householdExpenseInflationRatePercent",
    "educationInflationRatePercent",
    "healthcareInflationRatePercent",
    "finalExpenseInflationRatePercent"
  ];

  const RATE_LABELS = {
    generalInflationRatePercent: "General inflation rate",
    householdExpenseInflationRatePercent: "Household expense inflation",
    educationInflationRatePercent: "Education inflation",
    healthcareInflationRatePercent: "Healthcare inflation",
    finalExpenseInflationRatePercent: "Final expense inflation"
  };

  const FINAL_EXPENSE_TARGET_AGE_FIELD = "finalExpenseTargetAge";

  const GROWTH_RATE_FIELDS = [
    "primaryIncomeGrowthRatePercent",
    "partnerIncomeGrowthRatePercent",
    "taxableInvestmentReturnRatePercent",
    "retirementAssetReturnRatePercent"
  ];

  const GROWTH_RATE_LABELS = {
    primaryIncomeGrowthRatePercent: "Primary income growth",
    partnerIncomeGrowthRatePercent: "Partner / survivor income growth",
    taxableInvestmentReturnRatePercent: "Taxable investment return",
    retirementAssetReturnRatePercent: "Retirement asset return"
  };
  const GROWTH_RETURN_BASIS_NOMINAL = "nominal";
  const GROWTH_RETURN_BASIS_REAL = "real";
  const GROWTH_RETURN_BASIS_LABELS = Object.freeze({
    nominal: "Nominal returns",
    real: "Real returns after inflation"
  });
  const GROWTH_RETURN_BASIS_KEYS = Object.freeze(Object.keys(GROWTH_RETURN_BASIS_LABELS));

  const METHOD_DEFAULT_FIELDS = [
    "dimeIncomeYears",
    "needsSupportYears",
    "hlvProjectionYears"
  ];

  const METHOD_DEFAULT_LABELS = {
    dimeIncomeYears: "DIME Income Years",
    needsSupportYears: "Needs Support Years",
    hlvProjectionYears: "HLV Projection Years"
  };
  // Deprecated settings metadata retained until adapter/methods are moved to treated-only.
  const ASSET_OFFSET_SOURCE_TREATED = "treated";

  const DEFAULT_INFLATION_ASSUMPTIONS = Object.freeze({
    enabled: true,
    generalInflationRatePercent: 3,
    householdExpenseInflationRatePercent: 3,
    educationInflationRatePercent: 5,
    healthcareInflationRatePercent: 5,
    finalExpenseInflationRatePercent: 3,
    finalExpenseTargetAge: 85,
    source: "analysis-setup"
  });

  const HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR = "currentDollarOnly";
  const HEALTHCARE_ONE_TIME_PROJECTION_MODES = Object.freeze([
    HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR
  ]);
  const DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS = Object.freeze({
    enabled: false,
    projectionYears: 10,
    includeOneTimeHealthcareExpenses: false,
    oneTimeProjectionMode: HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR,
    source: "analysis-setup"
  });

  const DEFAULT_METHOD_DEFAULTS = Object.freeze({
    dimeIncomeYears: 10,
    needsSupportYears: 10,
    hlvProjectionYears: 10,
    needsIncludeOffsetAssets: true,
    assetOffsetSource: ASSET_OFFSET_SOURCE_TREATED,
    source: "analysis-setup"
  });

  const DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS = Object.freeze({
    enabled: false,
    returnBasis: GROWTH_RETURN_BASIS_NOMINAL,
    primaryIncomeGrowthRatePercent: 3,
    partnerIncomeGrowthRatePercent: 3,
    taxableInvestmentReturnRatePercent: 5,
    retirementAssetReturnRatePercent: 4,
    source: "analysis-setup"
  });

  const POLICY_RETURN_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const POLICY_RETURN_PROFILE_KEYS = Object.freeze(Object.keys(POLICY_RETURN_PROFILE_LABELS));
  const DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS = Object.freeze({
    enabled: false,
    profile: "balanced",
    termLife: Object.freeze({
      cashValueReturnPercent: 0
    }),
    wholeLife: Object.freeze({
      guaranteedGrowthPercent: null,
      dividendCreditPercent: null
    }),
    universalLife: Object.freeze({
      currentCreditingPercent: null,
      guaranteedCreditingPercent: null
    }),
    indexedUniversalLife: Object.freeze({
      assumedCreditingPercent: null,
      capRatePercent: null,
      participationRatePercent: null,
      floorRatePercent: 0
    }),
    variableUniversalLife: Object.freeze({
      grossReturnPercent: null,
      netReturnPercent: null
    }),
    source: "analysis-setup",
    lastUpdatedAt: null
  });
  const POLICY_TYPE_RETURN_FIELD_LABELS = Object.freeze({
    "termLife.cashValueReturnPercent": "Term Life cash value return",
    "wholeLife.guaranteedGrowthPercent": "Whole Life guaranteed growth",
    "wholeLife.dividendCreditPercent": "Whole Life dividend credit",
    "universalLife.currentCreditingPercent": "Universal Life current crediting",
    "universalLife.guaranteedCreditingPercent": "Universal Life guaranteed crediting",
    "indexedUniversalLife.assumedCreditingPercent": "Indexed Universal Life assumed crediting",
    "indexedUniversalLife.capRatePercent": "Indexed Universal Life cap rate",
    "indexedUniversalLife.participationRatePercent": "Indexed Universal Life participation rate",
    "indexedUniversalLife.floorRatePercent": "Indexed Universal Life floor rate",
    "variableUniversalLife.grossReturnPercent": "Variable Universal Life gross return",
    "variableUniversalLife.netReturnPercent": "Variable Universal Life net return"
  });
  const POLICY_TYPE_RETURN_REQUIRED_ZERO_FIELDS = Object.freeze([
    "termLife.cashValueReturnPercent",
    "indexedUniversalLife.floorRatePercent"
  ]);

  const ASSET_TREATMENT_ITEMS = Object.freeze([
    { key: "cashAndCashEquivalents", label: "Cash & Cash Equivalents", sourceField: "cashSavings", legacyKeys: Object.freeze(["cashSavings"]) },
    { key: "emergencyFund", label: "Emergency Fund", sourceField: "emergencyFund", legacyKeys: Object.freeze(["emergencyFund"]) },
    { key: "taxableBrokerageInvestments", label: "Taxable Brokerage / Investments", sourceField: "brokerageAccounts", legacyKeys: Object.freeze(["taxableBrokerage", "brokerageAccounts"]) },
    { key: "traditionalRetirementAssets", label: "Traditional Retirement Assets", sourceField: "retirementAssets", legacyKeys: Object.freeze(["retirementAssets"]) },
    { key: "rothTaxAdvantagedRetirementAssets", label: "Roth / Tax-Advantaged Retirement Assets", sourceField: "rothTaxAdvantagedRetirementAssets", legacyKeys: Object.freeze(["rothRetirementAssets"]) },
    { key: "qualifiedAnnuities", label: "Qualified Annuities", sourceField: "qualifiedAnnuities", legacyKeys: Object.freeze(["qualifiedAnnuities"]) },
    { key: "nonqualifiedAnnuities", label: "Nonqualified Annuities", sourceField: "nonqualifiedAnnuities", legacyKeys: Object.freeze(["nonqualifiedAnnuities"]) },
    { key: "primaryResidenceEquity", label: "Primary Residence Equity", sourceField: "realEstateEquity", legacyKeys: Object.freeze(["realEstateEquity"]) },
    { key: "otherRealEstateEquity", label: "Other Real Estate Equity", sourceField: "otherRealEstateEquity", legacyKeys: Object.freeze([]) },
    { key: "businessPrivateCompanyValue", label: "Business / Private Company Value", sourceField: "businessValue", legacyKeys: Object.freeze(["businessValue"]) },
    { key: "educationSpecificSavings", label: "Education-Specific Savings", sourceField: "educationSpecificSavings", legacyKeys: Object.freeze([]) },
    { key: "trustRestrictedAssets", label: "Trust / Restricted Assets", sourceField: "trustRestrictedAssets", legacyKeys: Object.freeze([]) },
    { key: "stockCompensationDeferredCompensation", label: "Stock Compensation / Deferred Compensation", sourceField: "stockCompensationDeferredCompensation", legacyKeys: Object.freeze([]) },
    { key: "digitalAssetsCrypto", label: "Digital Assets / Crypto", sourceField: "digitalAssetsCrypto", legacyKeys: Object.freeze([]) },
    { key: "otherCustomAsset", label: "Other / Custom Asset", sourceField: "otherCustomAsset", legacyKeys: Object.freeze(["otherAssets"]) }
  ]);
  const PMI_BACKED_ASSET_TREATMENT_KEYS = Object.freeze([
    "cashAndCashEquivalents",
    "emergencyFund",
    "taxableBrokerageInvestments",
    "traditionalRetirementAssets",
    "primaryResidenceEquity",
    "businessPrivateCompanyValue"
  ]);
  const CUSTOM_ASSET_TREATMENT_USES_PMI_INPUT = false;
  const ANALYSIS_SETUP_DEFAULT_VIEW = "calculation";
  const ANALYSIS_SETUP_VIEW_KEYS = Object.freeze([
    ANALYSIS_SETUP_DEFAULT_VIEW,
    "offset",
    "planning"
  ]);
  const ANALYSIS_SETUP_VIEW_HASHES = Object.freeze({
    calculation: "calculation-assumptions",
    offset: "offset-treatment",
    planning: "planning-goals"
  });
  const ANALYSIS_SETUP_VIEW_HASH_LOOKUP = Object.freeze({
    calculation: "calculation",
    "calculation-assumptions": "calculation",
    offset: "offset",
    "offset-treatment": "offset",
    planning: "planning",
    "planning-goals": "planning"
  });

  const TAX_TREATMENT_LABELS = Object.freeze({
    "no-tax-drag": "No tax drag",
    "step-up-eligible": "Step-up eligible",
    "ordinary-income-on-distribution": "Ordinary income",
    "tax-advantaged": "Tax advantaged",
    "partially-taxable": "Partially taxable",
    "case-specific": "Case specific",
    custom: "Custom"
  });

  const TAX_TREATMENT_KEYS = Object.freeze(Object.keys(TAX_TREATMENT_LABELS));

  const ASSET_TREATMENT_PRESETS = Object.freeze({
    "cash-like": Object.freeze({
      label: "Cash-like",
      include: true,
      taxTreatment: "no-tax-drag",
      taxDragPercent: 0,
      liquidityHaircutPercent: 0
    }),
    "step-up-investment": Object.freeze({
      label: "Step-up eligible investment",
      include: true,
      taxTreatment: "step-up-eligible",
      taxDragPercent: 0,
      liquidityHaircutPercent: 5
    }),
    "taxable-retirement": Object.freeze({
      label: "Taxable retirement asset",
      include: true,
      taxTreatment: "ordinary-income-on-distribution",
      taxDragPercent: 25,
      liquidityHaircutPercent: 5
    }),
    "roth-retirement": Object.freeze({
      label: "Roth / tax-advantaged retirement",
      include: true,
      taxTreatment: "tax-advantaged",
      taxDragPercent: 0,
      liquidityHaircutPercent: 5
    }),
    "qualified-annuity": Object.freeze({
      label: "Qualified annuity",
      include: true,
      taxTreatment: "ordinary-income-on-distribution",
      taxDragPercent: 25,
      liquidityHaircutPercent: 5
    }),
    "nonqualified-annuity": Object.freeze({
      label: "Nonqualified annuity",
      include: true,
      taxTreatment: "partially-taxable",
      taxDragPercent: 15,
      liquidityHaircutPercent: 10
    }),
    "real-estate-equity": Object.freeze({
      label: "Real estate equity",
      include: false,
      taxTreatment: "step-up-eligible",
      taxDragPercent: 0,
      liquidityHaircutPercent: 25
    }),
    "business-illiquid": Object.freeze({
      label: "Business / illiquid asset",
      include: false,
      taxTreatment: "case-specific",
      taxDragPercent: 10,
      liquidityHaircutPercent: 50
    }),
    excluded: Object.freeze({
      label: "Excluded",
      include: false,
      taxTreatment: "no-tax-drag",
      taxDragPercent: 0,
      liquidityHaircutPercent: 100
    }),
    custom: Object.freeze({
      label: "Custom",
      taxTreatment: "custom"
    })
  });

  const ASSET_TREATMENT_PRESET_KEYS = Object.freeze(Object.keys(ASSET_TREATMENT_PRESETS));
  const ASSET_TREATMENT_DEFAULT_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const ASSET_TREATMENT_DEFAULT_PROFILE_KEYS = Object.freeze(Object.keys(ASSET_TREATMENT_DEFAULT_PROFILE_LABELS));
  const ASSET_GROWTH_RATE_PROFILE_KEYS = Object.freeze(["conservative", "balanced", "aggressive", "custom"]);
  const ASSET_GROWTH_DEFAULT_PROFILE_FALLBACK = "balanced";
  const ASSET_GROWTH_RATE_SOURCE_ADVISOR = "advisor";
  const ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT = "taxonomy-default";
  const ASSET_GROWTH_CONSUMPTION_STATUS_SAVED_ONLY = "saved-only";
  const ASSET_GROWTH_PROJECTION_MODES = Object.freeze([
    "currentDollarOnly",
    "reportingOnly",
    "projectedOffsets"
  ]);
  const MIN_ASSET_GROWTH_PROJECTION_YEARS = 0;
  const MAX_ASSET_GROWTH_PROJECTION_YEARS = 60;
  const MIN_ASSET_GROWTH_RATE_PERCENT = 0;
  const MAX_ASSET_GROWTH_RATE_PERCENT = 12;
  const DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS = Object.freeze({
    mode: "currentDollarOnly",
    projectionYears: 0,
    projectionYearsSource: "analysis-setup",
    source: "analysis-setup",
    consumptionStatus: ASSET_GROWTH_CONSUMPTION_STATUS_SAVED_ONLY
  });

  const DEFAULT_CUSTOM_ASSET_TREATMENT = Object.freeze({
    id: "custom-asset-1",
    label: "Other / Custom Asset",
    estimatedValue: null,
    include: false,
    treatmentPreset: "custom",
    taxTreatment: "custom",
    taxDragPercent: 0,
    liquidityHaircutPercent: 25
  });

  const DEFAULT_ASSET_TREATMENT_ASSUMPTIONS = Object.freeze({
    enabled: false,
    defaultProfile: "balanced",
    assets: Object.freeze({
      cashAndCashEquivalents: Object.freeze({
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      }),
      emergencyFund: Object.freeze({
        include: true,
        treatmentPreset: "cash-like",
        taxTreatment: "no-tax-drag",
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      }),
      taxableBrokerageInvestments: Object.freeze({
        include: true,
        treatmentPreset: "step-up-investment",
        taxTreatment: "step-up-eligible",
        taxDragPercent: 0,
        liquidityHaircutPercent: 5
      }),
      traditionalRetirementAssets: Object.freeze({
        include: true,
        treatmentPreset: "taxable-retirement",
        taxTreatment: "ordinary-income-on-distribution",
        taxDragPercent: 25,
        liquidityHaircutPercent: 5
      }),
      rothTaxAdvantagedRetirementAssets: Object.freeze({
        include: true,
        treatmentPreset: "roth-retirement",
        taxTreatment: "tax-advantaged",
        taxDragPercent: 0,
        liquidityHaircutPercent: 5
      }),
      qualifiedAnnuities: Object.freeze({
        include: true,
        treatmentPreset: "qualified-annuity",
        taxTreatment: "ordinary-income-on-distribution",
        taxDragPercent: 25,
        liquidityHaircutPercent: 5
      }),
      nonqualifiedAnnuities: Object.freeze({
        include: true,
        treatmentPreset: "nonqualified-annuity",
        taxTreatment: "partially-taxable",
        taxDragPercent: 15,
        liquidityHaircutPercent: 10
      }),
      primaryResidenceEquity: Object.freeze({
        include: false,
        treatmentPreset: "real-estate-equity",
        taxTreatment: "step-up-eligible",
        taxDragPercent: 0,
        liquidityHaircutPercent: 25
      }),
      otherRealEstateEquity: Object.freeze({
        include: false,
        treatmentPreset: "real-estate-equity",
        taxTreatment: "step-up-eligible",
        taxDragPercent: 0,
        liquidityHaircutPercent: 35
      }),
      businessPrivateCompanyValue: Object.freeze({
        include: false,
        treatmentPreset: "business-illiquid",
        taxTreatment: "case-specific",
        taxDragPercent: 10,
        liquidityHaircutPercent: 50
      }),
      educationSpecificSavings: Object.freeze({
        include: false,
        treatmentPreset: "custom",
        taxTreatment: "custom",
        taxDragPercent: 0,
        liquidityHaircutPercent: 25
      }),
      trustRestrictedAssets: Object.freeze({
        include: false,
        treatmentPreset: "custom",
        taxTreatment: "custom",
        taxDragPercent: 0,
        liquidityHaircutPercent: 40
      }),
      stockCompensationDeferredCompensation: Object.freeze({
        include: true,
        treatmentPreset: "custom",
        taxTreatment: "case-specific",
        taxDragPercent: 15,
        liquidityHaircutPercent: 25
      }),
      digitalAssetsCrypto: Object.freeze({
        include: false,
        treatmentPreset: "custom",
        taxTreatment: "custom",
        taxDragPercent: 0,
        liquidityHaircutPercent: 50
      }),
      otherCustomAsset: Object.freeze({
        include: false,
        treatmentPreset: "custom",
        taxTreatment: "custom",
        taxDragPercent: 0,
        liquidityHaircutPercent: 25
      })
    }),
    customAssets: Object.freeze([
      DEFAULT_CUSTOM_ASSET_TREATMENT
    ]),
    assetGrowthProjectionAssumptions: DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS,
    source: "analysis-setup"
  });

  const ASSET_TREATMENT_PROFILE_DEFAULTS = Object.freeze({
    conservative: Object.freeze({
      assets: Object.freeze({
        cashAndCashEquivalents: Object.freeze({ include: true, treatmentPreset: "cash-like", taxTreatment: "no-tax-drag", taxDragPercent: 0, liquidityHaircutPercent: 0 }),
        emergencyFund: Object.freeze({ include: true, treatmentPreset: "cash-like", taxTreatment: "no-tax-drag", taxDragPercent: 0, liquidityHaircutPercent: 0 }),
        taxableBrokerageInvestments: Object.freeze({ include: true, treatmentPreset: "step-up-investment", taxTreatment: "step-up-eligible", taxDragPercent: 5, liquidityHaircutPercent: 10 }),
        traditionalRetirementAssets: Object.freeze({ include: true, treatmentPreset: "taxable-retirement", taxTreatment: "ordinary-income-on-distribution", taxDragPercent: 30, liquidityHaircutPercent: 10 }),
        rothTaxAdvantagedRetirementAssets: Object.freeze({ include: true, treatmentPreset: "roth-retirement", taxTreatment: "tax-advantaged", taxDragPercent: 0, liquidityHaircutPercent: 10 }),
        qualifiedAnnuities: Object.freeze({ include: true, treatmentPreset: "qualified-annuity", taxTreatment: "ordinary-income-on-distribution", taxDragPercent: 30, liquidityHaircutPercent: 10 }),
        nonqualifiedAnnuities: Object.freeze({ include: true, treatmentPreset: "nonqualified-annuity", taxTreatment: "partially-taxable", taxDragPercent: 20, liquidityHaircutPercent: 15 }),
        primaryResidenceEquity: Object.freeze({ include: false, treatmentPreset: "real-estate-equity", taxTreatment: "step-up-eligible", taxDragPercent: 0, liquidityHaircutPercent: 35 }),
        otherRealEstateEquity: Object.freeze({ include: false, treatmentPreset: "real-estate-equity", taxTreatment: "step-up-eligible", taxDragPercent: 0, liquidityHaircutPercent: 40 }),
        businessPrivateCompanyValue: Object.freeze({ include: false, treatmentPreset: "business-illiquid", taxTreatment: "case-specific", taxDragPercent: 15, liquidityHaircutPercent: 60 }),
        educationSpecificSavings: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 35 }),
        trustRestrictedAssets: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 50 }),
        stockCompensationDeferredCompensation: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "case-specific", taxDragPercent: 20, liquidityHaircutPercent: 35 }),
        digitalAssetsCrypto: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 60 }),
        otherCustomAsset: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 35 })
      }),
      customAsset: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 35 })
    }),
    balanced: Object.freeze({
      assets: DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.assets,
      customAsset: DEFAULT_CUSTOM_ASSET_TREATMENT
    }),
    aggressive: Object.freeze({
      assets: Object.freeze({
        cashAndCashEquivalents: Object.freeze({ include: true, treatmentPreset: "cash-like", taxTreatment: "no-tax-drag", taxDragPercent: 0, liquidityHaircutPercent: 0 }),
        emergencyFund: Object.freeze({ include: true, treatmentPreset: "cash-like", taxTreatment: "no-tax-drag", taxDragPercent: 0, liquidityHaircutPercent: 0 }),
        taxableBrokerageInvestments: Object.freeze({ include: true, treatmentPreset: "step-up-investment", taxTreatment: "step-up-eligible", taxDragPercent: 0, liquidityHaircutPercent: 0 }),
        traditionalRetirementAssets: Object.freeze({ include: true, treatmentPreset: "taxable-retirement", taxTreatment: "ordinary-income-on-distribution", taxDragPercent: 20, liquidityHaircutPercent: 0 }),
        rothTaxAdvantagedRetirementAssets: Object.freeze({ include: true, treatmentPreset: "roth-retirement", taxTreatment: "tax-advantaged", taxDragPercent: 0, liquidityHaircutPercent: 0 }),
        qualifiedAnnuities: Object.freeze({ include: true, treatmentPreset: "qualified-annuity", taxTreatment: "ordinary-income-on-distribution", taxDragPercent: 20, liquidityHaircutPercent: 0 }),
        nonqualifiedAnnuities: Object.freeze({ include: true, treatmentPreset: "nonqualified-annuity", taxTreatment: "partially-taxable", taxDragPercent: 10, liquidityHaircutPercent: 5 }),
        primaryResidenceEquity: Object.freeze({ include: true, treatmentPreset: "real-estate-equity", taxTreatment: "step-up-eligible", taxDragPercent: 0, liquidityHaircutPercent: 15 }),
        otherRealEstateEquity: Object.freeze({ include: true, treatmentPreset: "real-estate-equity", taxTreatment: "step-up-eligible", taxDragPercent: 0, liquidityHaircutPercent: 20 }),
        businessPrivateCompanyValue: Object.freeze({ include: true, treatmentPreset: "business-illiquid", taxTreatment: "case-specific", taxDragPercent: 10, liquidityHaircutPercent: 35 }),
        educationSpecificSavings: Object.freeze({ include: true, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 15 }),
        trustRestrictedAssets: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 35 }),
        stockCompensationDeferredCompensation: Object.freeze({ include: true, treatmentPreset: "custom", taxTreatment: "case-specific", taxDragPercent: 10, liquidityHaircutPercent: 15 }),
        digitalAssetsCrypto: Object.freeze({ include: true, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 35 }),
        otherCustomAsset: Object.freeze({ include: false, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 15 })
      }),
      customAsset: Object.freeze({ include: true, treatmentPreset: "custom", taxTreatment: "custom", taxDragPercent: 0, liquidityHaircutPercent: 15 })
    })
  });

  const COVERAGE_TREATMENT_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const COVERAGE_TREATMENT_PROFILE_KEYS = Object.freeze(Object.keys(COVERAGE_TREATMENT_PROFILE_LABELS));

  const DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS = Object.freeze({
    enabled: false,
    globalTreatmentProfile: "balanced",
    includeExistingCoverage: true,
    groupCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0,
      portabilityRequired: false
    }),
    individualTermTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0,
      excludeIfExpiresWithinYears: null
    }),
    permanentCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0
    }),
    pendingCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0
    }),
    unknownCoverageTreatment: Object.freeze({
      include: true,
      reliabilityDiscountPercent: 0
    }),
    source: "analysis-setup"
  });

  const EXISTING_COVERAGE_PROFILE_DEFAULTS = Object.freeze({
    conservative: Object.freeze({
      includeExistingCoverage: true,
      groupCoverageTreatment: Object.freeze({ include: true, reliabilityDiscountPercent: 50, portabilityRequired: false }),
      pendingCoverageTreatment: Object.freeze({ include: false, reliabilityDiscountPercent: 100 }),
      unknownCoverageTreatment: Object.freeze({ include: true, reliabilityDiscountPercent: 25 })
    }),
    balanced: Object.freeze({
      includeExistingCoverage: true,
      groupCoverageTreatment: DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.groupCoverageTreatment,
      pendingCoverageTreatment: DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.pendingCoverageTreatment,
      unknownCoverageTreatment: DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.unknownCoverageTreatment
    }),
    aggressive: Object.freeze({
      includeExistingCoverage: true,
      groupCoverageTreatment: Object.freeze({ include: true, reliabilityDiscountPercent: 0, portabilityRequired: false }),
      pendingCoverageTreatment: Object.freeze({ include: true, reliabilityDiscountPercent: 50 }),
      unknownCoverageTreatment: Object.freeze({ include: true, reliabilityDiscountPercent: 0 })
    })
  });

  const DEBT_TREATMENT_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const DEBT_TREATMENT_PROFILE_KEYS = Object.freeze(Object.keys(DEBT_TREATMENT_PROFILE_LABELS));
  const MORTGAGE_TREATMENT_MODES = Object.freeze(["payoff", "support"]);
  const DEBT_CATEGORY_TREATMENT_MODES = Object.freeze(["payoff", "exclude", "custom"]);
  const DEBT_TREATMENT_SCHEMA_VERSION = 2;
  const FALLBACK_DEBT_CATEGORY_TREATMENT_ITEMS = Object.freeze([
    { key: "realEstateSecuredDebt", label: "Real Estate Secured Debt", sourceFields: Object.freeze(["otherRealEstateLoans"]) },
    { key: "securedConsumerDebt", label: "Secured Consumer Debt", sourceFields: Object.freeze(["autoLoans"]) },
    { key: "unsecuredConsumerDebt", label: "Unsecured Consumer Debt", sourceFields: Object.freeze(["creditCardDebt", "personalLoans"]) },
    { key: "educationDebt", label: "Education Debt", sourceFields: Object.freeze(["studentLoans"]) },
    { key: "medicalDebt", label: "Medical Debt", sourceFields: Object.freeze([]) },
    { key: "taxLegalDebt", label: "Tax / Legal Debt", sourceFields: Object.freeze(["taxLiabilities"]) },
    { key: "businessDebt", label: "Business Debt", sourceFields: Object.freeze(["businessDebt"]) },
    { key: "privatePersonalDebt", label: "Private / Personal Debt", sourceFields: Object.freeze([]) },
    { key: "consumerFinanceDebt", label: "Consumer Finance Debt", sourceFields: Object.freeze([]) },
    { key: "otherDebt", label: "Other Debt", sourceFields: Object.freeze(["otherLoanObligations"]) }
  ]);
  const DEBT_CATEGORY_TREATMENT_KEYS = Object.freeze(
    FALLBACK_DEBT_CATEGORY_TREATMENT_ITEMS.map(function (item) {
      return item.key;
    })
  );
  const LEGACY_DEBT_TREATMENT_KEYS_BY_CATEGORY = Object.freeze({
    realEstateSecuredDebt: Object.freeze(["otherRealEstateLoans"]),
    securedConsumerDebt: Object.freeze(["autoLoans"]),
    unsecuredConsumerDebt: Object.freeze(["creditCardDebt", "personalLoans"]),
    educationDebt: Object.freeze(["studentLoans"]),
    medicalDebt: Object.freeze([]),
    taxLegalDebt: Object.freeze(["taxLiabilities"]),
    businessDebt: Object.freeze(["businessDebt"]),
    privatePersonalDebt: Object.freeze([]),
    consumerFinanceDebt: Object.freeze([]),
    otherDebt: Object.freeze(["otherLoanObligations"])
  });

  function createDefaultDebtCategoryTreatment() {
    return Object.freeze({
      include: true,
      mode: "payoff",
      payoffPercent: 100
    });
  }

  function createDefaultDebtCategoryTreatmentMap() {
    return Object.freeze(
      DEBT_CATEGORY_TREATMENT_KEYS.reduce(function (map, categoryKey) {
        map[categoryKey] = createDefaultDebtCategoryTreatment();
        return map;
      }, {})
    );
  }

  const DEFAULT_DEBT_TREATMENT_ASSUMPTIONS = Object.freeze({
    schemaVersion: DEBT_TREATMENT_SCHEMA_VERSION,
    enabled: true,
    globalTreatmentProfile: "balanced",
    mortgageTreatment: Object.freeze({
      mode: "payoff",
      include: true,
      payoffPercent: 100,
      paymentSupportYears: null
    }),
    debtCategoryTreatment: createDefaultDebtCategoryTreatmentMap(),
    source: "analysis-setup"
  });

  const DEBT_TREATMENT_PROFILE_DEFAULTS = Object.freeze({
    conservative: Object.freeze({
      mortgageTreatment: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment,
      debtCategoryTreatment: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment
    }),
    balanced: Object.freeze({
      mortgageTreatment: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment,
      debtCategoryTreatment: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment
    }),
    aggressive: Object.freeze({
      mortgageTreatment: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment,
      debtCategoryTreatment: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment
    })
  });

  function getFallbackDebtCategoryTreatmentItem(categoryKey) {
    return FALLBACK_DEBT_CATEGORY_TREATMENT_ITEMS.find(function (item) {
      return item.key === categoryKey;
    }) || null;
  }

  function getDebtCategoryTreatmentItems() {
    const taxonomyCategories = Array.isArray(LensApp.lensAnalysis?.debtTaxonomy?.DEFAULT_DEBT_CATEGORIES)
      ? LensApp.lensAnalysis.debtTaxonomy.DEFAULT_DEBT_CATEGORIES
      : [];

    return DEBT_CATEGORY_TREATMENT_KEYS.map(function (categoryKey) {
      const fallbackItem = getFallbackDebtCategoryTreatmentItem(categoryKey);
      const taxonomyCategory = taxonomyCategories.find(function (category) {
        return category && category.categoryKey === categoryKey;
      });
      const taxonomySourceFields = Array.isArray(taxonomyCategory?.defaultPmiSourceKeys)
        ? taxonomyCategory.defaultPmiSourceKeys.filter(function (sourceField) {
            return sourceField !== "mortgageBalance";
          })
        : null;

      return {
        key: categoryKey,
        label: String(taxonomyCategory?.label || fallbackItem?.label || categoryKey),
        sourceFields: Object.freeze(
          (taxonomySourceFields || fallbackItem?.sourceFields || []).slice()
        )
      };
    });
  }

  const SURVIVOR_SUPPORT_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const SURVIVOR_SUPPORT_PROFILE_KEYS = Object.freeze(Object.keys(SURVIVOR_SUPPORT_PROFILE_LABELS));
  const DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS = Object.freeze({
    enabled: false,
    globalTreatmentProfile: "balanced",
    survivorIncomeTreatment: Object.freeze({
      includeSurvivorIncome: true,
      applyStartDelay: true,
      applyIncomeGrowth: false,
      maxReliancePercent: 100,
      incomeOffsetYears: null
    }),
    survivorScenario: Object.freeze({
      survivorContinuesWorking: true,
      expectedSurvivorWorkReductionPercent: 25,
      survivorIncomeStartDelayMonths: 3,
      survivorEarnedIncomeGrowthRatePercent: 0,
      survivorRetirementHorizonYears: null
    }),
    supportTreatment: Object.freeze({
      includeEssentialSupport: true,
      includeDiscretionarySupport: false,
      includeTransitionNeeds: true,
      supportDurationYears: null
    }),
    riskFlags: Object.freeze({
      flagHighSurvivorIncomeReliance: true,
      highRelianceThresholdPercent: 50
    }),
    source: "analysis-setup"
  });
  const SURVIVOR_SUPPORT_PROFILE_DEFAULTS = Object.freeze({
    conservative: Object.freeze({
      survivorIncomeTreatment: Object.freeze({
        includeSurvivorIncome: false,
        applyStartDelay: true,
        applyIncomeGrowth: false,
        maxReliancePercent: 0,
        incomeOffsetYears: null
      }),
      survivorScenario: Object.freeze({
        survivorContinuesWorking: false,
        expectedSurvivorWorkReductionPercent: 100,
        survivorIncomeStartDelayMonths: 12,
        survivorEarnedIncomeGrowthRatePercent: 0,
        survivorRetirementHorizonYears: null
      }),
      supportTreatment: Object.freeze({
        includeEssentialSupport: true,
        includeDiscretionarySupport: true,
        includeTransitionNeeds: true,
        supportDurationYears: null
      }),
      riskFlags: Object.freeze({
        flagHighSurvivorIncomeReliance: true,
        highRelianceThresholdPercent: 40
      })
    }),
    balanced: Object.freeze({
      survivorIncomeTreatment: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorIncomeTreatment,
      survivorScenario: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorScenario,
      supportTreatment: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.supportTreatment,
      riskFlags: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.riskFlags
    }),
    aggressive: Object.freeze({
      survivorIncomeTreatment: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorIncomeTreatment,
      survivorScenario: Object.freeze({
        survivorContinuesWorking: true,
        expectedSurvivorWorkReductionPercent: 0,
        survivorIncomeStartDelayMonths: 0,
        survivorEarnedIncomeGrowthRatePercent: 0,
        survivorRetirementHorizonYears: null
      }),
      supportTreatment: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.supportTreatment,
      riskFlags: Object.freeze({
        flagHighSurvivorIncomeReliance: true,
        highRelianceThresholdPercent: 75
      })
    })
  });

  const EDUCATION_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const EDUCATION_PROFILE_KEYS = Object.freeze(Object.keys(EDUCATION_PROFILE_LABELS));
  const DEFAULT_EDUCATION_START_AGE = 18;
  const DEFAULT_EDUCATION_ASSUMPTIONS = Object.freeze({
    enabled: false,
    globalTreatmentProfile: "balanced",
    fundingTreatment: Object.freeze({
      includeEducationFunding: true,
      fundingTargetPercent: 100,
      educationStartAge: DEFAULT_EDUCATION_START_AGE,
      includeProjectedDependents: true,
      applyEducationInflation: false,
      useExistingEducationSavingsOffset: false
    }),
    educationSavingsTreatment: Object.freeze({
      existingEducationSavingsValue: null,
      includeAsOffset: false,
      taxDragPercent: 0,
      liquidityHaircutPercent: 0
    }),
    riskFlags: Object.freeze({
      flagMissingDependentDetails: true,
      flagProjectedDependentsIncluded: true
    }),
    source: "analysis-setup"
  });
  const EDUCATION_PROFILE_DEFAULTS = Object.freeze({
    conservative: Object.freeze({
      fundingTreatment: DEFAULT_EDUCATION_ASSUMPTIONS.fundingTreatment,
      educationSavingsTreatment: DEFAULT_EDUCATION_ASSUMPTIONS.educationSavingsTreatment,
      riskFlags: DEFAULT_EDUCATION_ASSUMPTIONS.riskFlags
    }),
    balanced: Object.freeze({
      fundingTreatment: DEFAULT_EDUCATION_ASSUMPTIONS.fundingTreatment,
      educationSavingsTreatment: DEFAULT_EDUCATION_ASSUMPTIONS.educationSavingsTreatment,
      riskFlags: DEFAULT_EDUCATION_ASSUMPTIONS.riskFlags
    }),
    aggressive: Object.freeze({
      fundingTreatment: Object.freeze({
        includeEducationFunding: true,
        fundingTargetPercent: 75,
        educationStartAge: DEFAULT_EDUCATION_START_AGE,
        includeProjectedDependents: true,
        applyEducationInflation: false,
        useExistingEducationSavingsOffset: false
      }),
      educationSavingsTreatment: DEFAULT_EDUCATION_ASSUMPTIONS.educationSavingsTreatment,
      riskFlags: DEFAULT_EDUCATION_ASSUMPTIONS.riskFlags
    })
  });

  const RECOMMENDATION_PROFILE_LABELS = Object.freeze({
    conservative: "Conservative",
    balanced: "Balanced",
    aggressive: "Aggressive",
    custom: "Custom"
  });
  const RECOMMENDATION_PROFILE_KEYS = Object.freeze(Object.keys(RECOMMENDATION_PROFILE_LABELS));
  const RECOMMENDATION_RANGE_SOURCE_LABELS = Object.freeze({
    dime: "DIME",
    needsAnalysis: "Needs Analysis",
    humanLifeValue: "Human Life Value"
  });
  const RECOMMENDATION_RANGE_SOURCE_KEYS = Object.freeze(Object.keys(RECOMMENDATION_RANGE_SOURCE_LABELS));
  const RECOMMENDATION_RANGE_CONFLICT_HANDLING_VALUES = Object.freeze([
    "flagForAdvisorReview"
  ]);
  const DEFAULT_RECOMMENDATION_GUARDRAILS = Object.freeze({
    enabled: false,
    recommendationProfile: "balanced",
    riskThresholds: Object.freeze({
      assetReliance: Object.freeze({
        warningThresholdPercent: 40
      }),
      illiquidAssetReliance: Object.freeze({
        warningThresholdPercent: 25
      }),
      survivorIncomeReliance: Object.freeze({
        warningThresholdPercent: 35
      })
    }),
    rangeConstraints: Object.freeze({
      lowerBound: Object.freeze({
        source: "needsAnalysis",
        tolerancePercent: 25
      }),
      upperBound: Object.freeze({
        source: "humanLifeValue",
        tolerancePercent: 25
      }),
      conflictHandling: "flagForAdvisorReview"
    }),
    riskFlags: Object.freeze({
      flagMissingCriticalInputs: true,
      flagHeavyAssetReliance: true,
      flagHeavySurvivorIncomeReliance: true,
      flagGroupCoverageReliance: true
    }),
    source: "analysis-setup"
  });
  const RECOMMENDATION_PROFILE_DEFAULTS = Object.freeze({
    conservative: Object.freeze({
      riskThresholds: Object.freeze({
        assetReliance: Object.freeze({
          warningThresholdPercent: 35
        }),
        illiquidAssetReliance: Object.freeze({
          warningThresholdPercent: 10
        }),
        survivorIncomeReliance: Object.freeze({
          warningThresholdPercent: 35
        })
      }),
      riskFlags: Object.freeze({
        flagMissingCriticalInputs: true,
        flagHeavyAssetReliance: true,
        flagHeavySurvivorIncomeReliance: true,
        flagGroupCoverageReliance: true
      })
    }),
    balanced: Object.freeze({
      riskThresholds: DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds,
      riskFlags: DEFAULT_RECOMMENDATION_GUARDRAILS.riskFlags
    }),
    aggressive: Object.freeze({
      riskThresholds: Object.freeze({
        assetReliance: Object.freeze({
          warningThresholdPercent: 70
        }),
        illiquidAssetReliance: Object.freeze({
          warningThresholdPercent: 40
        }),
        survivorIncomeReliance: Object.freeze({
          warningThresholdPercent: 70
        })
      }),
      riskFlags: Object.freeze({
        flagMissingCriticalInputs: true,
        flagHeavyAssetReliance: true,
        flagHeavySurvivorIncomeReliance: true,
        flagGroupCoverageReliance: true
      })
    })
  });

  const MIN_RATE = 0;
  const MAX_RATE = 10;
  const MIN_FINAL_EXPENSE_TARGET_AGE = 0;
  const MAX_FINAL_EXPENSE_TARGET_AGE = 120;
  const MIN_GROWTH_RATE = 0;
  const MAX_GROWTH_RATE = 12;
  const MIN_METHOD_YEARS = 0;
  const MAX_METHOD_YEARS = 60;
  const MIN_HEALTHCARE_EXPENSE_PROJECTION_YEARS = 1;
  const MAX_HEALTHCARE_EXPENSE_PROJECTION_YEARS = 60;
  const MIN_HAIRCUT = 0;
  const MAX_HAIRCUT = 100;
  const MIN_ASSET_TREATMENT_PERCENT = 0;
  const MAX_ASSET_TREATMENT_PERCENT = 100;
  const MIN_COVERAGE_TREATMENT_PERCENT = 0;
  const MAX_COVERAGE_TREATMENT_PERCENT = 100;
  const MIN_COVERAGE_TERM_GUARDRAIL_YEARS = 0;
  const MAX_COVERAGE_TERM_GUARDRAIL_YEARS = 80;
  const MIN_DEBT_PAYOFF_PERCENT = 0;
  const MAX_DEBT_PAYOFF_PERCENT = 100;
  const MIN_DEBT_SUPPORT_YEARS = 0;
  const MAX_DEBT_SUPPORT_YEARS = 80;
  const MIN_SURVIVOR_SUPPORT_PERCENT = 0;
  const MAX_SURVIVOR_SUPPORT_PERCENT = 100;
  const MIN_SURVIVOR_SUPPORT_YEARS = 0;
  const MIN_EDUCATION_PERCENT = 0;
  const MAX_EDUCATION_PERCENT = 100;
  const MIN_EDUCATION_NUMBER = 0;
  const MIN_EDUCATION_START_AGE = 0;
  const MAX_EDUCATION_START_AGE = 30;
  const MIN_RECOMMENDATION_PERCENT = 0;
  const MAX_RECOMMENDATION_PERCENT = 100;

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function formatDateOnlyFromDate(date) {
    return [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function getCurrentDateOnly() {
    const today = new Date();
    return formatDateOnlyFromDate(today);
  }

  function normalizeAnalysisDateOnlyValue(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : formatDateOnlyFromDate(value);
    }

    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);

    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return formatDateOnlyFromDate(date);
  }

  function resolveAnalysisValuationDateForSave(analysisSettings) {
    const savedSettings = isPlainObject(analysisSettings) ? analysisSettings : {};
    const savedValuationDate = normalizeAnalysisDateOnlyValue(savedSettings.valuationDate);
    if (savedValuationDate) {
      return {
        valuationDate: savedValuationDate,
        valuationDateSource: "analysisSettings.valuationDate",
        valuationDateDefaulted: false,
        valuationDateWarningCode: null
      };
    }

    const hasInvalidSavedDate = Object.prototype.hasOwnProperty.call(savedSettings, "valuationDate")
      && String(savedSettings.valuationDate || "").trim() !== "";

    return {
      valuationDate: getCurrentDateOnly(),
      valuationDateSource: "system-current-date-fallback",
      valuationDateDefaulted: true,
      valuationDateWarningCode: hasInvalidSavedDate
        ? "invalid-analysis-valuation-date-defaulted"
        : "analysis-valuation-date-defaulted"
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getUrlValue(params, names) {
    for (let index = 0; index < names.length; index += 1) {
      const value = String(params.get(names[index]) || "").trim();
      if (value) {
        return value;
      }
    }

    return "";
  }

  function resolveLinkedProfileRecord() {
    const clientRecords = LensApp.clientRecords || {};
    const params = new URLSearchParams(window.location.search);
    const urlCaseRef = getUrlValue(params, ["caseRef", "profileCaseRef", "linkedCaseRef"]);
    const urlRecordId = getUrlValue(params, ["profileId", "recordId", "id", "linkedRecordId"]);

    let record = null;
    if ((urlCaseRef || urlRecordId) && typeof clientRecords.getClientRecordByReference === "function") {
      record = clientRecords.getClientRecordByReference(urlRecordId, urlCaseRef);
    }

    if (!record && typeof clientRecords.getCurrentLinkedRecord === "function") {
      record = clientRecords.getCurrentLinkedRecord(urlCaseRef, urlRecordId);
    }

    if (record) {
      clientRecords.setLinkedCaseRef?.(record.caseRef);
      clientRecords.setLinkedRecordId?.(record.id);
    }

    return record || null;
  }

  function normalizeRateValue(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return clampRateValue(number);
  }

  function normalizeFinalExpenseTargetAgeValue(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_FINAL_EXPENSE_TARGET_AGE,
      Math.max(MIN_FINAL_EXPENSE_TARGET_AGE, Number(number.toFixed(2)))
    );
  }

  function clampRateValue(value) {
    return Math.min(MAX_RATE, Math.max(MIN_RATE, value));
  }

  function normalizeGrowthRateValue(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return clampGrowthRateValue(number);
  }

  function clampGrowthRateValue(value) {
    return Math.min(MAX_GROWTH_RATE, Math.max(MIN_GROWTH_RATE, value));
  }

  function normalizeMethodYearValue(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(MAX_METHOD_YEARS, Math.max(MIN_METHOD_YEARS, Math.round(number)));
  }

  function normalizeHealthcareProjectionYearsValue(value, fallback) {
    const rawValue = String(value ?? "").trim();
    if (!rawValue) {
      return fallback;
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    const rounded = Math.round(number);
    return Math.min(
      MAX_HEALTHCARE_EXPENSE_PROJECTION_YEARS,
      Math.max(MIN_HEALTHCARE_EXPENSE_PROJECTION_YEARS, rounded)
    );
  }

  function normalizeHealthcareOneTimeProjectionMode(value, fallback) {
    const normalizedValue = String(value || "").trim();
    return HEALTHCARE_ONE_TIME_PROJECTION_MODES.includes(normalizedValue)
      ? normalizedValue
      : fallback || HEALTHCARE_ONE_TIME_PROJECTION_MODE_CURRENT_DOLLAR;
  }

  function getAnalysisSetupAssetOffsetSource() {
    return ASSET_OFFSET_SOURCE_TREATED;
  }

  function normalizeGrowthReturnBasis(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return GROWTH_RETURN_BASIS_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback || GROWTH_RETURN_BASIS_NOMINAL;
  }

  function parseOptionalNumberValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = String(value).replace(/[,\s]/g, "");
    if (!normalizedValue) {
      return null;
    }

    const number = Number(normalizedValue);
    return Number.isFinite(number) ? number : null;
  }

  function sanitizeNumericTextValue(value) {
    const rawValue = String(value || "");
    let nextValue = "";

    for (let index = 0; index < rawValue.length; index += 1) {
      const character = rawValue[index];
      if (character >= "0" && character <= "9") {
        nextValue += character;
      }
    }

    return nextValue;
  }

  function normalizeAssetTreatmentPreset(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return ASSET_TREATMENT_PRESET_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeTaxTreatment(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return TAX_TREATMENT_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeAssetDefaultProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return ASSET_TREATMENT_DEFAULT_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizePolicyReturnProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return POLICY_RETURN_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeCoverageTreatmentProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return COVERAGE_TREATMENT_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeDebtTreatmentProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return DEBT_TREATMENT_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeSurvivorSupportProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return SURVIVOR_SUPPORT_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeEducationProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return EDUCATION_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeRecommendationProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return RECOMMENDATION_PROFILE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeRecommendationRangeSource(value, fallback) {
    const normalizedValue = String(value || "").trim();
    return RECOMMENDATION_RANGE_SOURCE_KEYS.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeRecommendationConflictHandling(value, fallback) {
    const normalizedValue = String(value || "").trim();
    return RECOMMENDATION_RANGE_CONFLICT_HANDLING_VALUES.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeMortgageTreatmentMode(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return MORTGAGE_TREATMENT_MODES.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeDebtCategoryTreatmentMode(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return DEBT_CATEGORY_TREATMENT_MODES.includes(normalizedValue)
      ? normalizedValue
      : fallback;
  }

  function normalizeAssetTreatmentPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_ASSET_TREATMENT_PERCENT,
      Math.max(MIN_ASSET_TREATMENT_PERCENT, number)
    );
  }

  function normalizeAssetGrowthRatePercent(value, fallback) {
    const number = Number(value);
    const fallbackNumber = Number(fallback);
    const baseValue = Number.isFinite(number)
      ? number
      : (Number.isFinite(fallbackNumber) ? fallbackNumber : 0);
    const clampedValue = Math.min(
      MAX_ASSET_GROWTH_RATE_PERCENT,
      Math.max(MIN_ASSET_GROWTH_RATE_PERCENT, baseValue)
    );
    return Number(clampedValue.toFixed(2));
  }

  function normalizeAssetGrowthProjectionMode(value) {
    const normalizedValue = String(value || "").trim();
    return ASSET_GROWTH_PROJECTION_MODES.includes(normalizedValue)
      ? normalizedValue
      : DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS.mode;
  }

  function normalizeAssetGrowthProjectionYears(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS.projectionYears;
    }

    return Math.min(
      MAX_ASSET_GROWTH_PROJECTION_YEARS,
      Math.max(MIN_ASSET_GROWTH_PROJECTION_YEARS, number)
    );
  }

  function getAssetGrowthProjectionAssumptions(savedAssumptions) {
    const saved = isPlainObject(savedAssumptions) ? savedAssumptions : {};
    return {
      mode: normalizeAssetGrowthProjectionMode(saved.mode),
      projectionYears: normalizeAssetGrowthProjectionYears(saved.projectionYears),
      projectionYearsSource: DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS.projectionYearsSource,
      source: DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS.source,
      consumptionStatus: DEFAULT_ASSET_GROWTH_PROJECTION_ASSUMPTIONS.consumptionStatus
    };
  }

  function normalizeAssetGrowthRateProfile(value, fallback) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (ASSET_GROWTH_RATE_PROFILE_KEYS.includes(normalizedValue)) {
      return normalizedValue;
    }

    return ASSET_GROWTH_RATE_PROFILE_KEYS.includes(fallback)
      ? fallback
      : ASSET_GROWTH_DEFAULT_PROFILE_FALLBACK;
  }

  function getAssetGrowthSeedProfile(profile) {
    const normalizedProfile = normalizeAssetDefaultProfile(
      profile,
      DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.defaultProfile
    );
    return normalizedProfile === "custom"
      ? ASSET_GROWTH_DEFAULT_PROFILE_FALLBACK
      : normalizeAssetGrowthRateProfile(normalizedProfile, ASSET_GROWTH_DEFAULT_PROFILE_FALLBACK);
  }

  function normalizeCoverageTreatmentPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_COVERAGE_TREATMENT_PERCENT,
      Math.max(MIN_COVERAGE_TREATMENT_PERCENT, number)
    );
  }

  function normalizeDebtPayoffPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_DEBT_PAYOFF_PERCENT,
      Math.max(MIN_DEBT_PAYOFF_PERCENT, number)
    );
  }

  function normalizeSurvivorSupportPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_SURVIVOR_SUPPORT_PERCENT,
      Math.max(MIN_SURVIVOR_SUPPORT_PERCENT, number)
    );
  }

  function normalizeSurvivorSupportBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }

    const normalizedValue = String(value ?? "").trim().toLowerCase();
    if (normalizedValue === "yes" || normalizedValue === "true" || normalizedValue === "1") {
      return true;
    }
    if (normalizedValue === "no" || normalizedValue === "false" || normalizedValue === "0") {
      return false;
    }
    return fallback == null ? null : Boolean(fallback);
  }

  function normalizeEducationPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_EDUCATION_PERCENT,
      Math.max(MIN_EDUCATION_PERCENT, number)
    );
  }

  function normalizeRecommendationPercent(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_RECOMMENDATION_PERCENT,
      Math.max(MIN_RECOMMENDATION_PERCENT, number)
    );
  }

  function normalizePolicyReturnPercent(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(
      MAX_RECOMMENDATION_PERCENT,
      Math.max(MIN_RECOMMENDATION_PERCENT, number)
    );
  }

  function normalizeCoverageTermGuardrailYears(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback == null ? null : fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback == null ? null : fallback;
    }

    return Math.min(
      MAX_COVERAGE_TERM_GUARDRAIL_YEARS,
      Math.max(MIN_COVERAGE_TERM_GUARDRAIL_YEARS, Math.round(number))
    );
  }

  function normalizeDebtSupportYears(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback == null ? null : fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback == null ? null : fallback;
    }

    return Math.min(
      MAX_DEBT_SUPPORT_YEARS,
      Math.max(MIN_DEBT_SUPPORT_YEARS, number)
    );
  }

  function normalizeSurvivorSupportYears(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback == null ? null : fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback == null ? null : fallback;
    }

    return Math.max(MIN_SURVIVOR_SUPPORT_YEARS, number);
  }

  function normalizeSurvivorSupportNonNegativeNumber(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback == null ? null : fallback;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback == null ? null : fallback;
    }

    return Math.max(0, number);
  }

  function normalizeEducationStartAge(value, fallback) {
    const fallbackValue = Number.isFinite(Number(fallback))
      ? Math.round(Number(fallback))
      : DEFAULT_EDUCATION_START_AGE;

    if (value === null || value === undefined || String(value).trim() === "") {
      return fallbackValue;
    }

    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallbackValue;
    }

    const roundedAge = Math.round(number);
    if (roundedAge < MIN_EDUCATION_START_AGE || roundedAge > MAX_EDUCATION_START_AGE) {
      return fallbackValue;
    }

    return roundedAge;
  }

  function normalizeEducationMoneyValue(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback == null ? null : fallback;
    }

    const number = Number(String(value).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(number)) {
      return fallback == null ? null : fallback;
    }

    return Math.max(0, number);
  }

  function getPresetDefaults(presetKey) {
    return ASSET_TREATMENT_PRESETS[presetKey] || ASSET_TREATMENT_PRESETS.custom;
  }

  function isAssetTreatmentItemEditable(itemKey) {
    return PMI_BACKED_ASSET_TREATMENT_KEYS.includes(itemKey);
  }

  function getAssetFactsForLinkedRecord(record) {
    const createAssetFacts = LensApp.lensAnalysis?.createAssetFactsFromSourceData;
    if (typeof createAssetFacts !== "function") {
      return {
        assets: []
      };
    }

    return createAssetFacts(getLinkedProtectionModelingData(record));
  }

  function getAssetTreatmentRenderItems(linkedRecord) {
    const assetFacts = getAssetFactsForLinkedRecord(linkedRecord);
    const assets = Array.isArray(assetFacts?.assets) ? assetFacts.assets : [];

    return assets.reduce(function (items, asset, index) {
      const categoryKey = String(asset?.categoryKey || "").trim();
      const currentValue = Number(asset?.currentValue);
      if (!categoryKey || !Number.isFinite(currentValue) || currentValue <= 0) {
        return items;
      }

      const taxonomyItem = getAssetTreatmentItemByKey(categoryKey);
      const fallbackId = `${categoryKey}_${index + 1}`;
      items.push({
        key: categoryKey,
        assetId: String(asset?.assetId || fallbackId).trim() || fallbackId,
        label: String(asset?.label || taxonomyItem?.label || categoryKey).trim(),
        currentValue,
        source: String(asset?.source || "").trim(),
        isDefaultAsset: asset?.isDefaultAsset === true,
        isCustomAsset: asset?.isCustomAsset === true,
        taxonomyItem
      });

      return items;
    }, []);
  }

  function getAssetTreatmentItemByKey(itemKey) {
    const key = String(itemKey || "").trim();
    return ASSET_TREATMENT_ITEMS.find(function (item) {
      return item.key === key;
    }) || null;
  }

  function getAssetTaxonomyCategoryByKey(categoryKey) {
    const taxonomy = LensApp.lensAnalysis?.assetTaxonomy;
    const categories = Array.isArray(taxonomy?.DEFAULT_ASSET_CATEGORIES)
      ? taxonomy.DEFAULT_ASSET_CATEGORIES
      : [];
    const safeCategoryKey = String(categoryKey || "").trim();
    return categories.find(function (category) {
      return category && category.categoryKey === safeCategoryKey;
    }) || null;
  }

  function getAssetGrowthDefaultRate(categoryKey, profile) {
    const category = getAssetTaxonomyCategoryByKey(categoryKey);
    const seedProfile = getAssetGrowthSeedProfile(profile);
    const profileDefault = category?.growthDefaults?.[seedProfile];
    return normalizeAssetGrowthRatePercent(
      profileDefault?.assumedAnnualGrowthRatePercent,
      0
    );
  }

  function createAssetGrowthSavedFields(savedAsset, categoryKey, profile, options) {
    const safeOptions = isPlainObject(options) ? options : {};
    const safeSavedAsset = isPlainObject(savedAsset) ? savedAsset : {};
    const seedProfile = getAssetGrowthSeedProfile(profile);
    const defaultRate = getAssetGrowthDefaultRate(categoryKey, seedProfile);
    const savedRate = Number(safeSavedAsset.assumedAnnualGrowthRatePercent);
    const savedSource = String(safeSavedAsset.assumedAnnualGrowthRateSource || "").trim();
    const savedWasTaxonomyDefault = savedSource === ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT;
    const shouldPreserveSavedRate = Number.isFinite(savedRate)
      && (safeOptions.preserveTaxonomyDefault !== false || !savedWasTaxonomyDefault);
    const source = shouldPreserveSavedRate
      ? (savedSource || ASSET_GROWTH_RATE_SOURCE_ADVISOR)
      : ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT;
    const fallbackProfile = shouldPreserveSavedRate && source !== ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT
      ? "custom"
      : seedProfile;

    return {
      assumedAnnualGrowthRatePercent: normalizeAssetGrowthRatePercent(
        shouldPreserveSavedRate ? savedRate : defaultRate,
        defaultRate
      ),
      assumedAnnualGrowthRateSource: source,
      assumedAnnualGrowthRateProfile: normalizeAssetGrowthRateProfile(
        shouldPreserveSavedRate ? safeSavedAsset.assumedAnnualGrowthRateProfile : seedProfile,
        fallbackProfile
      ),
      growthConsumptionStatus: ASSET_GROWTH_CONSUMPTION_STATUS_SAVED_ONLY
    };
  }

  function readVisibleAssetGrowthSavedFields(fields, itemKey, currentAsset, defaultProfile) {
    const field = getAssetTreatmentField(fields, "growth", itemKey);
    const fieldSource = String(field?.dataset?.analysisAssetGrowthSource || "").trim();
    const fieldProfile = normalizeAssetGrowthRateProfile(
      field?.dataset?.analysisAssetGrowthProfile,
      defaultProfile
    );
    const baseGrowthFields = createAssetGrowthSavedFields(currentAsset, itemKey, defaultProfile, {
      preserveTaxonomyDefault: false
    });
    const fieldDefaultGrowthFields = fieldSource === ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT
      ? createAssetGrowthSavedFields({}, itemKey, fieldProfile)
      : baseGrowthFields;
    if (!field) {
      return baseGrowthFields;
    }

    const rawValue = String(field.value || "").trim();
    const number = Number(rawValue);
    if (!rawValue || !Number.isFinite(number)) {
      return fieldDefaultGrowthFields;
    }

    const value = normalizeAssetGrowthRatePercent(
      number,
      fieldDefaultGrowthFields.assumedAnnualGrowthRatePercent
    );
    const savedSource = String(currentAsset?.assumedAnnualGrowthRateSource || "").trim();
    const baseRate = normalizeAssetGrowthRatePercent(
      fieldDefaultGrowthFields.assumedAnnualGrowthRatePercent,
      0
    );
    const shouldUseAdvisorSource = fieldSource === ASSET_GROWTH_RATE_SOURCE_ADVISOR
      || (
        !fieldSource
        && savedSource
        && savedSource !== ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT
      )
      || Math.abs(value - baseRate) > 0.001;

    return {
      assumedAnnualGrowthRatePercent: value,
      assumedAnnualGrowthRateSource: shouldUseAdvisorSource
        ? ASSET_GROWTH_RATE_SOURCE_ADVISOR
        : ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT,
      assumedAnnualGrowthRateProfile: shouldUseAdvisorSource
        ? "custom"
        : fieldDefaultGrowthFields.assumedAnnualGrowthRateProfile,
      growthConsumptionStatus: ASSET_GROWTH_CONSUMPTION_STATUS_SAVED_ONLY
    };
  }

  function getAssetTreatmentDefaultForKey(itemKey) {
    const key = String(itemKey || "").trim();
    return DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.assets[key]
      || DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.assets.otherCustomAsset
      || DEFAULT_CUSTOM_ASSET_TREATMENT;
  }

  function getVisibleAssetTreatmentItemKeys(fields) {
    const fieldLists = fields?.fieldLists?.preset;
    if (isPlainObject(fieldLists)) {
      return Object.keys(fieldLists).filter(function (itemKey) {
        return Array.isArray(fieldLists[itemKey]) && fieldLists[itemKey].length > 0;
      });
    }

    return Object.keys(fields?.preset || {});
  }

  function addAssetTreatmentField(fields, groupName, attributeName, field) {
    const itemKey = String(field?.getAttribute(attributeName) || "").trim();
    if (!itemKey) {
      return;
    }

    if (!fields[groupName][itemKey]) {
      fields[groupName][itemKey] = field;
    }

    if (!fields.fieldLists[groupName][itemKey]) {
      fields.fieldLists[groupName][itemKey] = [];
    }
    fields.fieldLists[groupName][itemKey].push(field);
  }

  function getAssetTreatmentFieldList(fields, groupName, itemKey) {
    const list = fields?.fieldLists?.[groupName]?.[itemKey];
    if (Array.isArray(list)) {
      return list;
    }

    const field = fields?.[groupName]?.[itemKey];
    return field ? [field] : [];
  }

  function getAssetTreatmentField(fields, groupName, itemKey) {
    return getAssetTreatmentFieldList(fields, groupName, itemKey)[0] || null;
  }

  function setAssetTreatmentFieldsChecked(fields, groupName, itemKey, checked) {
    getAssetTreatmentFieldList(fields, groupName, itemKey).forEach(function (field) {
      field.checked = Boolean(checked);
    });
  }

  function setAssetTreatmentFieldsValue(fields, groupName, itemKey, value) {
    getAssetTreatmentFieldList(fields, groupName, itemKey).forEach(function (field) {
      field.value = value;
    });
  }

  function syncAssetTreatmentFieldValueFromSource(fields, groupName, itemKey, sourceField) {
    if (!sourceField) {
      return;
    }

    setAssetTreatmentFieldsValue(fields, groupName, itemKey, sourceField.value);
  }

  function setAssetTreatmentGrowthFieldMetadata(field, source, profile) {
    if (!field || !field.dataset) {
      return;
    }

    field.dataset.analysisAssetGrowthSource = source;
    field.dataset.analysisAssetGrowthProfile = profile;
  }

  function setAssetTreatmentGrowthFields(fields, itemKey, growthFields) {
    const safeGrowthFields = isPlainObject(growthFields) ? growthFields : {};
    const value = formatHaircutInputValue(normalizeAssetGrowthRatePercent(
      safeGrowthFields.assumedAnnualGrowthRatePercent,
      0
    ));
    const source = String(
      safeGrowthFields.assumedAnnualGrowthRateSource || ASSET_GROWTH_RATE_SOURCE_TAXONOMY_DEFAULT
    );
    const profile = normalizeAssetGrowthRateProfile(
      safeGrowthFields.assumedAnnualGrowthRateProfile,
      getAssetGrowthSeedProfile(fields?.defaultProfile)
    );

    getAssetTreatmentFieldList(fields, "growth", itemKey).forEach(function (field) {
      field.value = value;
      setAssetTreatmentGrowthFieldMetadata(field, source, profile);
    });
    getAssetTreatmentFieldList(fields, "growthSlider", itemKey).forEach(function (slider) {
      slider.value = value;
      setAssetTreatmentGrowthFieldMetadata(slider, source, profile);
      updateRateSliderProgress(slider);
    });
  }

  function markAssetTreatmentGrowthFieldsAsAdvisor(fields, itemKey) {
    getAssetTreatmentFieldList(fields, "growth", itemKey).forEach(function (field) {
      setAssetTreatmentGrowthFieldMetadata(field, ASSET_GROWTH_RATE_SOURCE_ADVISOR, "custom");
    });
    getAssetTreatmentFieldList(fields, "growthSlider", itemKey).forEach(function (field) {
      setAssetTreatmentGrowthFieldMetadata(field, ASSET_GROWTH_RATE_SOURCE_ADVISOR, "custom");
    });
  }

  function getSavedAssetTreatmentForItem(savedAssets, item) {
    if (!isPlainObject(savedAssets) || !item) {
      return {};
    }

    const candidateKeys = [item.key]
      .concat(item.legacyKey ? [item.legacyKey] : [])
      .concat(Array.isArray(item.legacyKeys) ? item.legacyKeys : []);
    for (let index = 0; index < candidateKeys.length; index += 1) {
      const candidateKey = candidateKeys[index];
      if (candidateKey && isPlainObject(savedAssets[candidateKey])) {
        return savedAssets[candidateKey];
      }
    }

    return {};
  }

  function getInflationAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.inflationAssumptions)
      ? record.analysisSettings.inflationAssumptions
      : {};
    const nextAssumptions = {
      ...DEFAULT_INFLATION_ASSUMPTIONS,
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_INFLATION_ASSUMPTIONS.enabled,
      source: String(saved.source || DEFAULT_INFLATION_ASSUMPTIONS.source)
    };

    RATE_FIELDS.forEach(function (fieldName) {
      nextAssumptions[fieldName] = normalizeRateValue(
        saved[fieldName],
        DEFAULT_INFLATION_ASSUMPTIONS[fieldName]
      );
    });

    nextAssumptions.finalExpenseTargetAge = normalizeFinalExpenseTargetAgeValue(
      saved.finalExpenseTargetAge,
      DEFAULT_INFLATION_ASSUMPTIONS.finalExpenseTargetAge
    );

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getHealthcareExpenseAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.healthcareExpenseAssumptions)
      ? record.analysisSettings.healthcareExpenseAssumptions
      : {};
    const nextAssumptions = {
      ...DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS,
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.enabled,
      projectionYears: normalizeHealthcareProjectionYearsValue(
        saved.projectionYears,
        DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears
      ),
      includeOneTimeHealthcareExpenses: typeof saved.includeOneTimeHealthcareExpenses === "boolean"
        ? saved.includeOneTimeHealthcareExpenses
        : DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.includeOneTimeHealthcareExpenses,
      oneTimeProjectionMode: normalizeHealthcareOneTimeProjectionMode(
        saved.oneTimeProjectionMode,
        DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.oneTimeProjectionMode
      ),
      source: String(saved.source || DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.source)
    };

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getRetirementYearsDefault(record) {
    const sourceData = getLinkedProtectionModelingData(record);
    const sourceValue = Object.prototype.hasOwnProperty.call(sourceData, "yearsUntilRetirement")
      ? parseOptionalNumberValue(sourceData.yearsUntilRetirement)
      : null;
    const recordValue = sourceValue === null && Object.prototype.hasOwnProperty.call(record || {}, "yearsUntilRetirement")
      ? parseOptionalNumberValue(record.yearsUntilRetirement)
      : null;
    const fallback = DEFAULT_METHOD_DEFAULTS.hlvProjectionYears;
    const value = sourceValue !== null ? sourceValue : recordValue;

    return value === null
      ? fallback
      : normalizeMethodYearValue(value, fallback);
  }

  function getDefaultMethodDefaults(record) {
    return {
      ...DEFAULT_METHOD_DEFAULTS,
      hlvProjectionYears: getRetirementYearsDefault(record)
    };
  }

  function getMethodDefaults(record) {
    const saved = isPlainObject(record?.analysisSettings?.methodDefaults)
      ? record.analysisSettings.methodDefaults
      : {};
    const defaults = getDefaultMethodDefaults(record);
    const nextDefaults = {
      ...defaults,
      source: String(saved.source || defaults.source)
    };

    nextDefaults.dimeIncomeYears = normalizeMethodYearValue(
      saved.dimeIncomeYears,
      defaults.dimeIncomeYears
    );
    nextDefaults.needsSupportYears = normalizeMethodYearValue(
      saved.needsSupportYears,
      defaults.needsSupportYears
    );
    nextDefaults.hlvProjectionYears = normalizeMethodYearValue(
      saved.hlvProjectionYears,
      defaults.hlvProjectionYears
    );
    nextDefaults.needsIncludeOffsetAssets = typeof saved.needsIncludeOffsetAssets === "boolean"
      ? saved.needsIncludeOffsetAssets
      : defaults.needsIncludeOffsetAssets;
    nextDefaults.assetOffsetSource = getAnalysisSetupAssetOffsetSource();

    if (saved.lastUpdatedAt) {
      nextDefaults.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextDefaults;
  }

  function getGrowthAndReturnAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.growthAndReturnAssumptions)
      ? record.analysisSettings.growthAndReturnAssumptions
      : {};
    const nextAssumptions = {
      ...DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS,
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS.enabled,
      returnBasis: normalizeGrowthReturnBasis(
        saved.returnBasis,
        DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS.returnBasis
      ),
      source: String(saved.source || DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS.source)
    };

    GROWTH_RATE_FIELDS.forEach(function (fieldName) {
      const savedValue = fieldName === "taxableInvestmentReturnRatePercent"
        && !Object.prototype.hasOwnProperty.call(saved, "taxableInvestmentReturnRatePercent")
        ? saved.investmentReturnRatePercent
        : saved[fieldName];
      nextAssumptions[fieldName] = normalizeGrowthRateValue(
        savedValue,
        DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS[fieldName]
      );
    });

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getPolicyTypeReturnAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.policyTypeReturnAssumptions)
      ? record.analysisSettings.policyTypeReturnAssumptions
      : {};
    const savedTermLife = isPlainObject(saved.termLife) ? saved.termLife : {};
    const savedWholeLife = isPlainObject(saved.wholeLife) ? saved.wholeLife : {};
    const savedUniversalLife = isPlainObject(saved.universalLife) ? saved.universalLife : {};
    const savedIndexedUniversalLife = isPlainObject(saved.indexedUniversalLife) ? saved.indexedUniversalLife : {};
    const savedVariableUniversalLife = isPlainObject(saved.variableUniversalLife) ? saved.variableUniversalLife : {};
    const nextAssumptions = {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.enabled,
      profile: normalizePolicyReturnProfile(
        saved.profile || saved.policyReturnProfile,
        DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.profile
      ),
      termLife: {
        cashValueReturnPercent: normalizePolicyReturnPercent(
          savedTermLife.cashValueReturnPercent ?? saved.termCashValueReturnPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.termLife.cashValueReturnPercent
        )
      },
      wholeLife: {
        guaranteedGrowthPercent: normalizePolicyReturnPercent(
          savedWholeLife.guaranteedGrowthPercent ?? saved.wholeLifeGuaranteedGrowthPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.wholeLife.guaranteedGrowthPercent
        ),
        dividendCreditPercent: normalizePolicyReturnPercent(
          savedWholeLife.dividendCreditPercent ?? saved.wholeLifeDividendCreditPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.wholeLife.dividendCreditPercent
        )
      },
      universalLife: {
        currentCreditingPercent: normalizePolicyReturnPercent(
          savedUniversalLife.currentCreditingPercent ?? saved.universalLifeCurrentCreditingPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.universalLife.currentCreditingPercent
        ),
        guaranteedCreditingPercent: normalizePolicyReturnPercent(
          savedUniversalLife.guaranteedCreditingPercent ?? saved.universalLifeGuaranteedCreditingPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.universalLife.guaranteedCreditingPercent
        )
      },
      indexedUniversalLife: {
        assumedCreditingPercent: normalizePolicyReturnPercent(
          savedIndexedUniversalLife.assumedCreditingPercent ?? saved.indexedUlAssumedCreditingPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.indexedUniversalLife.assumedCreditingPercent
        ),
        capRatePercent: normalizePolicyReturnPercent(
          savedIndexedUniversalLife.capRatePercent ?? saved.indexedUlCapRatePercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.indexedUniversalLife.capRatePercent
        ),
        participationRatePercent: normalizePolicyReturnPercent(
          savedIndexedUniversalLife.participationRatePercent ?? saved.indexedUlParticipationRatePercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.indexedUniversalLife.participationRatePercent
        ),
        floorRatePercent: normalizePolicyReturnPercent(
          savedIndexedUniversalLife.floorRatePercent ?? saved.indexedUlFloorRatePercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.indexedUniversalLife.floorRatePercent
        )
      },
      variableUniversalLife: {
        grossReturnPercent: normalizePolicyReturnPercent(
          savedVariableUniversalLife.grossReturnPercent ?? saved.variableUlGrossReturnPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.variableUniversalLife.grossReturnPercent
        ),
        netReturnPercent: normalizePolicyReturnPercent(
          savedVariableUniversalLife.netReturnPercent ?? saved.variableUlNetReturnPercent,
          DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.variableUniversalLife.netReturnPercent
        )
      },
      source: String(saved.source || DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.source),
      lastUpdatedAt: saved.lastUpdatedAt
        ? String(saved.lastUpdatedAt)
        : DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.lastUpdatedAt
    };

    return nextAssumptions;
  }

  function getAssetTreatmentAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.assetTreatmentAssumptions)
      ? record.analysisSettings.assetTreatmentAssumptions
      : {};
    const savedAssets = isPlainObject(saved.assets) ? saved.assets : {};
    const savedCustomAssets = Array.isArray(saved.customAssets) ? saved.customAssets : [];
    const nextAssumptions = {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.enabled,
      defaultProfile: normalizeAssetDefaultProfile(
        saved.defaultProfile,
        DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.defaultProfile
      ),
      assets: {},
      customAssets: [],
      assetGrowthProjectionAssumptions: getAssetGrowthProjectionAssumptions(
        saved.assetGrowthProjectionAssumptions
      ),
      source: String(saved.source || DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.source)
    };

    ASSET_TREATMENT_ITEMS.forEach(function (item) {
      const defaults = DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.assets[item.key];
      const savedAsset = getSavedAssetTreatmentForItem(savedAssets, item);
      const treatmentPreset = normalizeAssetTreatmentPreset(
        savedAsset.treatmentPreset,
        defaults.treatmentPreset
      );
      const presetDefaults = getPresetDefaults(treatmentPreset);
      const defaultTaxTreatment = defaults.taxTreatment || presetDefaults.taxTreatment || "custom";
      const savedTaxDrag = Object.prototype.hasOwnProperty.call(savedAsset, "taxDragPercent")
        ? savedAsset.taxDragPercent
        : savedAsset.taxRatePercent;

      nextAssumptions.assets[item.key] = {
        include: typeof savedAsset.include === "boolean"
          ? savedAsset.include
          : defaults.include,
        treatmentPreset,
        taxTreatment: normalizeTaxTreatment(
          savedAsset.taxTreatment,
          defaultTaxTreatment
        ),
        taxDragPercent: normalizeAssetTreatmentPercent(
          savedTaxDrag,
          defaults.taxDragPercent
        ),
        liquidityHaircutPercent: normalizeAssetTreatmentPercent(
          savedAsset.liquidityHaircutPercent,
          defaults.liquidityHaircutPercent
        ),
        ...createAssetGrowthSavedFields(savedAsset, item.key, nextAssumptions.defaultProfile)
      };
    });

    const savedLegacyOtherAsset = isPlainObject(savedAssets.otherAssets) ? savedAssets.otherAssets : {};
    const savedCustomAsset = {
      ...savedLegacyOtherAsset,
      ...(isPlainObject(savedCustomAssets[0]) ? savedCustomAssets[0] : {})
    };
    const customPreset = normalizeAssetTreatmentPreset(
      savedCustomAsset.treatmentPreset,
      DEFAULT_CUSTOM_ASSET_TREATMENT.treatmentPreset
    );
    const customTaxTreatment = normalizeTaxTreatment(
      savedCustomAsset.taxTreatment,
      getPresetDefaults(customPreset).taxTreatment || DEFAULT_CUSTOM_ASSET_TREATMENT.taxTreatment
    );
    const savedEstimatedValue = Number(savedCustomAsset.estimatedValue);
    nextAssumptions.customAssets = [
      {
        id: String(savedCustomAsset.id || DEFAULT_CUSTOM_ASSET_TREATMENT.id),
        label: String(savedCustomAsset.label || DEFAULT_CUSTOM_ASSET_TREATMENT.label),
        estimatedValue: Number.isFinite(savedEstimatedValue) && savedEstimatedValue >= 0
          ? savedEstimatedValue
          : DEFAULT_CUSTOM_ASSET_TREATMENT.estimatedValue,
        include: typeof savedCustomAsset.include === "boolean"
          ? savedCustomAsset.include
          : DEFAULT_CUSTOM_ASSET_TREATMENT.include,
        treatmentPreset: customPreset,
        taxTreatment: customTaxTreatment,
        taxDragPercent: normalizeAssetTreatmentPercent(
          savedCustomAsset.taxDragPercent,
          DEFAULT_CUSTOM_ASSET_TREATMENT.taxDragPercent
        ),
        liquidityHaircutPercent: normalizeAssetTreatmentPercent(
          savedCustomAsset.liquidityHaircutPercent,
          DEFAULT_CUSTOM_ASSET_TREATMENT.liquidityHaircutPercent
        )
      }
    ];

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getExistingCoverageAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.existingCoverageAssumptions)
      ? record.analysisSettings.existingCoverageAssumptions
      : {};
    const globalTreatmentProfile = normalizeCoverageTreatmentProfile(
      saved.globalTreatmentProfile,
      DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.globalTreatmentProfile
    );
    const profileDefaults = EXISTING_COVERAGE_PROFILE_DEFAULTS[globalTreatmentProfile]
      || EXISTING_COVERAGE_PROFILE_DEFAULTS[DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.globalTreatmentProfile];
    const defaultGroupTreatment = profileDefaults.groupCoverageTreatment
      || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.groupCoverageTreatment;
    const defaultPendingTreatment = profileDefaults.pendingCoverageTreatment
      || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.pendingCoverageTreatment;
    const defaultUnknownTreatment = profileDefaults.unknownCoverageTreatment
      || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.unknownCoverageTreatment;
    const savedGroupTreatment = isPlainObject(saved.groupCoverageTreatment) ? saved.groupCoverageTreatment : {};
    const savedIndividualTermTreatment = isPlainObject(saved.individualTermTreatment) ? saved.individualTermTreatment : {};
    const savedPermanentTreatment = isPlainObject(saved.permanentCoverageTreatment) ? saved.permanentCoverageTreatment : {};
    const savedPendingTreatment = isPlainObject(saved.pendingCoverageTreatment) ? saved.pendingCoverageTreatment : {};
    const savedUnknownTreatment = isPlainObject(saved.unknownCoverageTreatment) ? saved.unknownCoverageTreatment : {};
    const nextAssumptions = {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.enabled,
      globalTreatmentProfile,
      includeExistingCoverage: typeof saved.includeExistingCoverage === "boolean"
        ? saved.includeExistingCoverage
        : Boolean(profileDefaults.includeExistingCoverage),
      groupCoverageTreatment: {
        include: typeof savedGroupTreatment.include === "boolean"
          ? savedGroupTreatment.include
          : Boolean(defaultGroupTreatment.include),
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          savedGroupTreatment.reliabilityDiscountPercent,
          defaultGroupTreatment.reliabilityDiscountPercent
        ),
        portabilityRequired: typeof savedGroupTreatment.portabilityRequired === "boolean"
          ? savedGroupTreatment.portabilityRequired
          : Boolean(defaultGroupTreatment.portabilityRequired)
      },
      individualTermTreatment: {
        include: typeof savedIndividualTermTreatment.include === "boolean"
          ? savedIndividualTermTreatment.include
          : DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment.include,
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          savedIndividualTermTreatment.reliabilityDiscountPercent,
          DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment.reliabilityDiscountPercent
        ),
        excludeIfExpiresWithinYears: normalizeCoverageTermGuardrailYears(
          savedIndividualTermTreatment.excludeIfExpiresWithinYears,
          DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment.excludeIfExpiresWithinYears
        )
      },
      permanentCoverageTreatment: {
        include: typeof savedPermanentTreatment.include === "boolean"
          ? savedPermanentTreatment.include
          : DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.permanentCoverageTreatment.include,
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          savedPermanentTreatment.reliabilityDiscountPercent,
          DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.permanentCoverageTreatment.reliabilityDiscountPercent
        )
      },
      pendingCoverageTreatment: {
        include: typeof savedPendingTreatment.include === "boolean"
          ? savedPendingTreatment.include
          : Boolean(defaultPendingTreatment.include),
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          savedPendingTreatment.reliabilityDiscountPercent,
          defaultPendingTreatment.reliabilityDiscountPercent
        )
      },
      unknownCoverageTreatment: {
        include: typeof savedUnknownTreatment.include === "boolean"
          ? savedUnknownTreatment.include
          : Boolean(defaultUnknownTreatment.include),
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          savedUnknownTreatment.reliabilityDiscountPercent,
          defaultUnknownTreatment.reliabilityDiscountPercent
        )
      },
      source: String(saved.source || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.source)
    };

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function normalizeDebtCategoryTreatment(source, defaults) {
    const safeSource = isPlainObject(source) ? source : {};
    const safeDefaults = isPlainObject(defaults) ? defaults : createDefaultDebtCategoryTreatment();
    return {
      include: typeof safeSource.include === "boolean"
        ? safeSource.include
        : safeDefaults.include !== false,
      mode: normalizeDebtCategoryTreatmentMode(safeSource.mode, safeDefaults.mode || "payoff"),
      payoffPercent: normalizeDebtPayoffPercent(
        safeSource.payoffPercent,
        normalizeDebtPayoffPercent(safeDefaults.payoffPercent, 100)
      )
    };
  }

  function areDebtCategoryTreatmentsEquivalent(left, right) {
    return Boolean(left && right)
      && left.include === right.include
      && left.mode === right.mode
      && left.payoffPercent === right.payoffPercent;
  }

  function getLegacyDebtCategoryTreatment(categoryKey, legacyTreatments, defaults) {
    const legacyKeys = LEGACY_DEBT_TREATMENT_KEYS_BY_CATEGORY[categoryKey] || [];
    const presentLegacyKeys = legacyKeys.filter(function (legacyKey) {
      return isPlainObject(legacyTreatments?.[legacyKey]);
    });

    if (!presentLegacyKeys.length) {
      return null;
    }

    const migratedTreatments = presentLegacyKeys.map(function (legacyKey) {
      return normalizeDebtCategoryTreatment(legacyTreatments[legacyKey], defaults);
    });
    const firstTreatment = migratedTreatments[0];
    const hasConflict = migratedTreatments.some(function (treatment) {
      return !areDebtCategoryTreatmentsEquivalent(treatment, firstTreatment);
    });

    return hasConflict ? null : firstTreatment;
  }

  function getDebtTreatmentAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.debtTreatmentAssumptions)
      ? record.analysisSettings.debtTreatmentAssumptions
      : {};
    const savedMortgageTreatment = isPlainObject(saved.mortgageTreatment) ? saved.mortgageTreatment : {};
    const savedDebtCategoryTreatment = isPlainObject(saved.debtCategoryTreatment)
      ? saved.debtCategoryTreatment
      : {};
    const savedLegacyNonMortgageTreatment = isPlainObject(saved.nonMortgageDebtTreatment)
      ? saved.nonMortgageDebtTreatment
      : {};
    const hasSavedDebtCategoryTreatment = isPlainObject(saved.debtCategoryTreatment);
    const globalTreatmentProfile = normalizeDebtTreatmentProfile(
      saved.globalTreatmentProfile,
      DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.globalTreatmentProfile
    );
    const defaultMortgageTreatment = DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment;
    const nextAssumptions = {
      schemaVersion: DEBT_TREATMENT_SCHEMA_VERSION,
      enabled: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.enabled,
      globalTreatmentProfile,
      mortgageTreatment: {
        mode: normalizeMortgageTreatmentMode(
          savedMortgageTreatment.mode,
          defaultMortgageTreatment.mode
        ),
        include: typeof savedMortgageTreatment.include === "boolean"
          ? savedMortgageTreatment.include
          : defaultMortgageTreatment.include,
        payoffPercent: normalizeDebtPayoffPercent(
          savedMortgageTreatment.payoffPercent,
          defaultMortgageTreatment.payoffPercent
        ),
        paymentSupportYears: normalizeDebtSupportYears(
          savedMortgageTreatment.paymentSupportYears,
          defaultMortgageTreatment.paymentSupportYears
        )
      },
      debtCategoryTreatment: {},
      source: String(saved.source || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.source)
    };

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const defaults = DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]
        || createDefaultDebtCategoryTreatment();
      const savedTreatment = hasSavedDebtCategoryTreatment && isPlainObject(savedDebtCategoryTreatment[item.key])
        ? savedDebtCategoryTreatment[item.key]
        : getLegacyDebtCategoryTreatment(item.key, savedLegacyNonMortgageTreatment, defaults);
      nextAssumptions.debtCategoryTreatment[item.key] = normalizeDebtCategoryTreatment(
        savedTreatment,
        defaults
      );
    });

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getSurvivorSupportAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.survivorSupportAssumptions)
      ? record.analysisSettings.survivorSupportAssumptions
      : {};
    const globalTreatmentProfile = normalizeSurvivorSupportProfile(
      saved.globalTreatmentProfile,
      DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.globalTreatmentProfile
    );
    const profileDefaults = SURVIVOR_SUPPORT_PROFILE_DEFAULTS[globalTreatmentProfile]
      || SURVIVOR_SUPPORT_PROFILE_DEFAULTS[DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.globalTreatmentProfile];
    const defaultSurvivorIncomeTreatment = profileDefaults.survivorIncomeTreatment
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorIncomeTreatment;
    const defaultProfileSurvivorScenario = profileDefaults.survivorScenario
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorScenario;
    const defaultSupportTreatment = profileDefaults.supportTreatment
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.supportTreatment;
    const defaultRiskFlags = profileDefaults.riskFlags
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.riskFlags;
    const savedSurvivorIncomeTreatment = isPlainObject(saved.survivorIncomeTreatment)
      ? saved.survivorIncomeTreatment
      : {};
    const savedSurvivorScenario = isPlainObject(saved.survivorScenario)
      ? saved.survivorScenario
      : {};
    const savedSupportTreatment = isPlainObject(saved.supportTreatment)
      ? saved.supportTreatment
      : {};
    const savedRiskFlags = isPlainObject(saved.riskFlags)
      ? saved.riskFlags
      : {};
    const defaultSurvivorScenario = getSurvivorSupportDefaultScenario(record, defaultProfileSurvivorScenario);
    const nextAssumptions = {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.enabled,
      globalTreatmentProfile,
      survivorIncomeTreatment: {
        includeSurvivorIncome: typeof savedSurvivorIncomeTreatment.includeSurvivorIncome === "boolean"
          ? savedSurvivorIncomeTreatment.includeSurvivorIncome
          : Boolean(defaultSurvivorIncomeTreatment.includeSurvivorIncome),
        applyStartDelay: typeof savedSurvivorIncomeTreatment.applyStartDelay === "boolean"
          ? savedSurvivorIncomeTreatment.applyStartDelay
          : Boolean(defaultSurvivorIncomeTreatment.applyStartDelay),
        applyIncomeGrowth: typeof savedSurvivorIncomeTreatment.applyIncomeGrowth === "boolean"
          ? savedSurvivorIncomeTreatment.applyIncomeGrowth
          : Boolean(defaultSurvivorIncomeTreatment.applyIncomeGrowth),
        maxReliancePercent: normalizeSurvivorSupportPercent(
          savedSurvivorIncomeTreatment.maxReliancePercent,
          defaultSurvivorIncomeTreatment.maxReliancePercent
        ),
        incomeOffsetYears: normalizeSurvivorSupportYears(
          savedSurvivorIncomeTreatment.incomeOffsetYears,
          defaultSurvivorIncomeTreatment.incomeOffsetYears
        )
      },
      survivorScenario: {
        survivorContinuesWorking: normalizeSurvivorSupportBoolean(
          savedSurvivorScenario.survivorContinuesWorking,
          defaultSurvivorScenario.survivorContinuesWorking
        ),
        expectedSurvivorWorkReductionPercent: normalizeSurvivorSupportPercent(
          savedSurvivorScenario.expectedSurvivorWorkReductionPercent,
          defaultSurvivorScenario.expectedSurvivorWorkReductionPercent
        ),
        survivorIncomeStartDelayMonths: normalizeSurvivorSupportNonNegativeNumber(
          savedSurvivorScenario.survivorIncomeStartDelayMonths,
          defaultSurvivorScenario.survivorIncomeStartDelayMonths
        ),
        survivorEarnedIncomeGrowthRatePercent: normalizeSurvivorSupportPercent(
          savedSurvivorScenario.survivorEarnedIncomeGrowthRatePercent,
          defaultSurvivorScenario.survivorEarnedIncomeGrowthRatePercent
        ),
        survivorRetirementHorizonYears: normalizeSurvivorSupportNonNegativeNumber(
          savedSurvivorScenario.survivorRetirementHorizonYears,
          defaultSurvivorScenario.survivorRetirementHorizonYears
        )
      },
      supportTreatment: {
        includeEssentialSupport: typeof savedSupportTreatment.includeEssentialSupport === "boolean"
          ? savedSupportTreatment.includeEssentialSupport
          : Boolean(defaultSupportTreatment.includeEssentialSupport),
        includeDiscretionarySupport: typeof savedSupportTreatment.includeDiscretionarySupport === "boolean"
          ? savedSupportTreatment.includeDiscretionarySupport
          : Boolean(defaultSupportTreatment.includeDiscretionarySupport),
        includeTransitionNeeds: typeof savedSupportTreatment.includeTransitionNeeds === "boolean"
          ? savedSupportTreatment.includeTransitionNeeds
          : Boolean(defaultSupportTreatment.includeTransitionNeeds),
        supportDurationYears: normalizeSurvivorSupportYears(
          savedSupportTreatment.supportDurationYears,
          defaultSupportTreatment.supportDurationYears
        )
      },
      riskFlags: {
        flagHighSurvivorIncomeReliance: typeof savedRiskFlags.flagHighSurvivorIncomeReliance === "boolean"
          ? savedRiskFlags.flagHighSurvivorIncomeReliance
          : Boolean(defaultRiskFlags.flagHighSurvivorIncomeReliance),
        highRelianceThresholdPercent: normalizeSurvivorSupportPercent(
          savedRiskFlags.highRelianceThresholdPercent,
          defaultRiskFlags.highRelianceThresholdPercent
        )
      },
      source: String(saved.source || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.source)
    };

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getEducationAssumptions(record) {
    const saved = isPlainObject(record?.analysisSettings?.educationAssumptions)
      ? record.analysisSettings.educationAssumptions
      : {};
    const globalTreatmentProfile = normalizeEducationProfile(
      saved.globalTreatmentProfile,
      DEFAULT_EDUCATION_ASSUMPTIONS.globalTreatmentProfile
    );
    const profileDefaults = EDUCATION_PROFILE_DEFAULTS[globalTreatmentProfile]
      || EDUCATION_PROFILE_DEFAULTS[DEFAULT_EDUCATION_ASSUMPTIONS.globalTreatmentProfile];
    const defaultFundingTreatment = profileDefaults.fundingTreatment
      || DEFAULT_EDUCATION_ASSUMPTIONS.fundingTreatment;
    const defaultRiskFlags = profileDefaults.riskFlags
      || DEFAULT_EDUCATION_ASSUMPTIONS.riskFlags;
    const savedFundingTreatment = isPlainObject(saved.fundingTreatment)
      ? saved.fundingTreatment
      : {};
    const savedRiskFlags = isPlainObject(saved.riskFlags)
      ? saved.riskFlags
      : {};
    const nextAssumptions = {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_EDUCATION_ASSUMPTIONS.enabled,
      globalTreatmentProfile,
      fundingTreatment: {
        includeEducationFunding: typeof savedFundingTreatment.includeEducationFunding === "boolean"
          ? savedFundingTreatment.includeEducationFunding
          : Boolean(defaultFundingTreatment.includeEducationFunding),
        fundingTargetPercent: normalizeEducationPercent(
          savedFundingTreatment.fundingTargetPercent,
          defaultFundingTreatment.fundingTargetPercent
        ),
        educationStartAge: normalizeEducationStartAge(
          savedFundingTreatment.educationStartAge,
          defaultFundingTreatment.educationStartAge
        ),
        includeProjectedDependents: typeof savedFundingTreatment.includeProjectedDependents === "boolean"
          ? savedFundingTreatment.includeProjectedDependents
          : Boolean(defaultFundingTreatment.includeProjectedDependents),
        applyEducationInflation: typeof savedFundingTreatment.applyEducationInflation === "boolean"
          ? savedFundingTreatment.applyEducationInflation
          : Boolean(defaultFundingTreatment.applyEducationInflation),
        useExistingEducationSavingsOffset: false
      },
      educationSavingsTreatment: {
        existingEducationSavingsValue: null,
        includeAsOffset: false,
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      },
      riskFlags: {
        flagMissingDependentDetails: typeof savedRiskFlags.flagMissingDependentDetails === "boolean"
          ? savedRiskFlags.flagMissingDependentDetails
          : Boolean(defaultRiskFlags.flagMissingDependentDetails),
        flagProjectedDependentsIncluded: typeof savedRiskFlags.flagProjectedDependentsIncluded === "boolean"
          ? savedRiskFlags.flagProjectedDependentsIncluded
          : Boolean(defaultRiskFlags.flagProjectedDependentsIncluded)
      },
      source: String(saved.source || DEFAULT_EDUCATION_ASSUMPTIONS.source)
    };

    if (saved.lastUpdatedAt) {
      nextAssumptions.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextAssumptions;
  }

  function getRecommendationGuardrails(record) {
    const saved = isPlainObject(record?.analysisSettings?.recommendationGuardrails)
      ? record.analysisSettings.recommendationGuardrails
      : {};
    const recommendationProfile = normalizeRecommendationProfile(
      saved.recommendationProfile,
      DEFAULT_RECOMMENDATION_GUARDRAILS.recommendationProfile
    );
    const profileDefaults = RECOMMENDATION_PROFILE_DEFAULTS[recommendationProfile]
      || RECOMMENDATION_PROFILE_DEFAULTS[DEFAULT_RECOMMENDATION_GUARDRAILS.recommendationProfile];
    const profileRiskThresholds = profileDefaults.riskThresholds || {};
    const defaultRiskThresholds = {
      assetReliance: {
        ...DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds.assetReliance,
        ...(profileRiskThresholds.assetReliance || {})
      },
      illiquidAssetReliance: {
        ...DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds.illiquidAssetReliance,
        ...(profileRiskThresholds.illiquidAssetReliance || {})
      },
      survivorIncomeReliance: {
        ...DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds.survivorIncomeReliance,
        ...(profileRiskThresholds.survivorIncomeReliance || {})
      }
    };
    const defaultRiskFlags = {
      ...DEFAULT_RECOMMENDATION_GUARDRAILS.riskFlags,
      ...(profileDefaults.riskFlags || {})
    };
    const savedRiskThresholds = isPlainObject(saved.riskThresholds)
      ? saved.riskThresholds
      : {};
    const savedAssetReliance = isPlainObject(savedRiskThresholds.assetReliance)
      ? savedRiskThresholds.assetReliance
      : {};
    const savedIlliquidAssetReliance = isPlainObject(savedRiskThresholds.illiquidAssetReliance)
      ? savedRiskThresholds.illiquidAssetReliance
      : {};
    const savedSurvivorIncomeReliance = isPlainObject(savedRiskThresholds.survivorIncomeReliance)
      ? savedRiskThresholds.survivorIncomeReliance
      : {};
    const savedRangeConstraints = isPlainObject(saved.rangeConstraints)
      ? saved.rangeConstraints
      : {};
    const savedLowerBound = isPlainObject(savedRangeConstraints.lowerBound)
      ? savedRangeConstraints.lowerBound
      : {};
    const savedUpperBound = isPlainObject(savedRangeConstraints.upperBound)
      ? savedRangeConstraints.upperBound
      : {};
    const savedRiskFlags = isPlainObject(saved.riskFlags)
      ? saved.riskFlags
      : {};
    const nextGuardrails = {
      enabled: typeof saved.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_RECOMMENDATION_GUARDRAILS.enabled,
      recommendationProfile,
      riskThresholds: {
        assetReliance: {
          warningThresholdPercent: normalizeRecommendationPercent(
            savedAssetReliance.warningThresholdPercent,
            defaultRiskThresholds.assetReliance.warningThresholdPercent
          )
        },
        illiquidAssetReliance: {
          warningThresholdPercent: normalizeRecommendationPercent(
            savedIlliquidAssetReliance.warningThresholdPercent,
            defaultRiskThresholds.illiquidAssetReliance.warningThresholdPercent
          )
        },
        survivorIncomeReliance: {
          warningThresholdPercent: normalizeRecommendationPercent(
            savedSurvivorIncomeReliance.warningThresholdPercent,
            defaultRiskThresholds.survivorIncomeReliance.warningThresholdPercent
          )
        }
      },
      rangeConstraints: {
        lowerBound: {
          source: normalizeRecommendationRangeSource(
            savedLowerBound.source,
            DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.lowerBound.source
          ),
          tolerancePercent: normalizeRecommendationPercent(
            savedLowerBound.tolerancePercent,
            DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.lowerBound.tolerancePercent
          )
        },
        upperBound: {
          source: normalizeRecommendationRangeSource(
            savedUpperBound.source,
            DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.upperBound.source
          ),
          tolerancePercent: normalizeRecommendationPercent(
            savedUpperBound.tolerancePercent,
            DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.upperBound.tolerancePercent
          )
        },
        conflictHandling: normalizeRecommendationConflictHandling(
          savedRangeConstraints.conflictHandling,
          DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.conflictHandling
        )
      },
      riskFlags: {
        flagMissingCriticalInputs: typeof savedRiskFlags.flagMissingCriticalInputs === "boolean"
          ? savedRiskFlags.flagMissingCriticalInputs
          : Boolean(defaultRiskFlags.flagMissingCriticalInputs),
        flagHeavyAssetReliance: typeof savedRiskFlags.flagHeavyAssetReliance === "boolean"
          ? savedRiskFlags.flagHeavyAssetReliance
          : Boolean(defaultRiskFlags.flagHeavyAssetReliance),
        flagHeavySurvivorIncomeReliance: typeof savedRiskFlags.flagHeavySurvivorIncomeReliance === "boolean"
          ? savedRiskFlags.flagHeavySurvivorIncomeReliance
          : Boolean(defaultRiskFlags.flagHeavySurvivorIncomeReliance),
        flagGroupCoverageReliance: typeof savedRiskFlags.flagGroupCoverageReliance === "boolean"
          ? savedRiskFlags.flagGroupCoverageReliance
          : Boolean(defaultRiskFlags.flagGroupCoverageReliance)
      },
      source: String(saved.source || DEFAULT_RECOMMENDATION_GUARDRAILS.source)
    };

    if (saved.lastUpdatedAt) {
      nextGuardrails.lastUpdatedAt = String(saved.lastUpdatedAt);
    }

    return nextGuardrails;
  }

  function formatRateInputValue(value) {
    return Number(value || 0).toFixed(2);
  }

  function formatHaircutInputValue(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) {
      return "";
    }

    return Number.isInteger(number)
      ? String(number)
      : String(Number(number.toFixed(2)));
  }

  function formatCurrencyValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(Math.max(0, number));
  }

  function parseOptionalMoneyValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalizedValue = String(value).replace(/[$,\s]/g, "");
    if (!normalizedValue) {
      return null;
    }

    const number = Number(normalizedValue);
    return Number.isFinite(number) ? Math.max(0, number) : null;
  }

  function getPresetOptionsMarkup(selectedPreset) {
    return ASSET_TREATMENT_PRESET_KEYS.map(function (presetKey) {
      const preset = ASSET_TREATMENT_PRESETS[presetKey];
      const selected = presetKey === selectedPreset ? " selected" : "";
      return `<option value="${presetKey}"${selected}>${preset.label}</option>`;
    }).join("");
  }

  function renderAssetTreatmentRows(linkedRecord) {
    const table = document.querySelector("[data-analysis-asset-treatment-table]");
    if (!table || table.dataset.rendered === "true") {
      return;
    }

    const renderItems = getAssetTreatmentRenderItems(linkedRecord);
    if (!renderItems.length) {
      table.insertAdjacentHTML("beforeend", `
        <div class="analysis-setup-asset-row analysis-setup-asset-row--disabled" role="row" aria-disabled="true" data-analysis-asset-treatment-empty="true">
          <span class="analysis-setup-asset-label" role="cell">No asset values found yet. Add asset values in Protection Modeling Inputs.</span>
          <span role="cell"></span>
          <span role="cell"></span>
          <span role="cell"></span>
          <span role="cell"></span>
          <span role="cell"></span>
          <span role="cell"></span>
          <span role="cell"></span>
        </div>
      `);
      table.dataset.rendered = "true";
      return;
    }

    renderItems.forEach(function (item) {
      const defaults = getAssetTreatmentDefaultForKey(item.key);
      const safeLabel = escapeHtml(item.label);
      const safeKey = escapeHtml(item.key);
      const safeAssetId = escapeHtml(item.assetId);
      const currentValue = Number(item.currentValue);
      const growthFields = createAssetGrowthSavedFields({}, item.key, DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.defaultProfile);
      const growthValue = formatHaircutInputValue(growthFields.assumedAnnualGrowthRatePercent);
      table.insertAdjacentHTML("beforeend", `
        <div class="analysis-setup-asset-row" role="row" aria-disabled="false" data-analysis-asset-treatment-row="${safeKey}" data-analysis-asset-id="${safeAssetId}">
          <span class="analysis-setup-asset-label" role="cell">${safeLabel}</span>
          <span role="cell">
            <label class="analysis-setup-asset-include" aria-label="Include ${safeLabel}">
              <span class="settings-switch analysis-setup-mini-switch">
                <input class="analysis-setup-asset-field" type="checkbox" role="switch" aria-label="Include ${safeLabel}" data-analysis-asset-treatment-include="${safeKey}">
                <span class="settings-switch-track" aria-hidden="true"></span>
              </span>
            </label>
          </span>
          <span role="cell">
            <span class="analysis-setup-asset-growth-control" aria-label="${safeLabel} assumed annual growth">
              <input class="analysis-setup-asset-growth-slider analysis-setup-asset-field" type="range" min="${MIN_ASSET_GROWTH_RATE_PERCENT}" max="${MAX_ASSET_GROWTH_RATE_PERCENT}" step="0.25" value="${growthValue}" aria-label="${safeLabel} assumed annual growth slider" data-analysis-asset-treatment-growth-slider="${safeKey}" data-analysis-asset-growth-source="${growthFields.assumedAnnualGrowthRateSource}" data-analysis-asset-growth-profile="${growthFields.assumedAnnualGrowthRateProfile}">
              <span class="analysis-setup-asset-percent analysis-setup-asset-growth-percent">
                <input class="analysis-setup-asset-percent-input analysis-setup-asset-growth-input analysis-setup-asset-field" type="text" inputmode="decimal" value="${growthValue}" aria-label="${safeLabel} assumed annual growth percentage" data-analysis-asset-treatment-growth="${safeKey}" data-analysis-asset-growth-source="${growthFields.assumedAnnualGrowthRateSource}" data-analysis-asset-growth-profile="${growthFields.assumedAnnualGrowthRateProfile}">
                <span aria-hidden="true">%</span>
              </span>
            </span>
          </span>
          <span role="cell">
            <select class="analysis-setup-asset-select analysis-setup-asset-field" aria-label="${safeLabel} treatment preset" data-analysis-asset-treatment-preset="${safeKey}">
              ${getPresetOptionsMarkup(defaults.treatmentPreset)}
            </select>
          </span>
          <span role="cell">
            <span class="analysis-setup-tax-treatment-pill" data-analysis-asset-treatment-tax-treatment="${safeKey}">${TAX_TREATMENT_LABELS[defaults.taxTreatment]}</span>
          </span>
          <span role="cell">
            <span class="analysis-setup-asset-percent">
              <input class="analysis-setup-asset-percent-input analysis-setup-asset-field" type="text" inputmode="decimal" value="${defaults.taxDragPercent}" aria-label="${safeLabel} tax drag percentage" data-analysis-asset-treatment-tax="${safeKey}">
              <span aria-hidden="true">%</span>
            </span>
          </span>
          <span role="cell">
            <span class="analysis-setup-asset-percent">
              <input class="analysis-setup-asset-percent-input analysis-setup-asset-field" type="text" inputmode="decimal" value="${defaults.liquidityHaircutPercent}" aria-label="${safeLabel} liquidity and marketability haircut percentage" data-analysis-asset-treatment-haircut="${safeKey}">
              <span aria-hidden="true">%</span>
            </span>
          </span>
          <span role="cell"><span class="analysis-setup-treatment-preview" data-analysis-asset-treatment-preview="${safeKey}" data-analysis-asset-treatment-current-value="${currentValue}">No source value</span></span>
        </div>
      `);
    });

    table.dataset.rendered = "true";
  }

  function getDebtCategoryModeOptionsMarkup(selectedMode) {
    const labels = {
      payoff: "Payoff",
      exclude: "Exclude",
      custom: "Custom (deferred)"
    };
    return DEBT_CATEGORY_TREATMENT_MODES.map(function (mode) {
      const selected = mode === selectedMode ? " selected" : "";
      return `<option value="${mode}"${selected}>${labels[mode]}</option>`;
    }).join("");
  }

  function renderDebtTreatmentRows() {
    const table = document.querySelector("[data-analysis-debt-table]");
    if (!table || table.dataset.rendered === "true") {
      return;
    }

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const defaults = DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]
        || createDefaultDebtCategoryTreatment();
      table.insertAdjacentHTML("beforeend", `
        <div class="analysis-setup-debt-row" role="row" data-analysis-debt-row="${item.key}">
          <span class="analysis-setup-debt-label" role="cell">${item.label}</span>
          <span role="cell">
            <label class="analysis-setup-asset-include" aria-label="Include ${item.label}">
              <span class="settings-switch analysis-setup-mini-switch">
                <input class="analysis-setup-debt-field" type="checkbox" role="switch" aria-label="Include ${item.label}" data-analysis-debt-include="${item.key}">
                <span class="settings-switch-track" aria-hidden="true"></span>
              </span>
            </label>
          </span>
          <span role="cell">
            <select class="analysis-setup-asset-select analysis-setup-debt-field" aria-label="${item.label} debt treatment mode" data-analysis-debt-mode="${item.key}">
              ${getDebtCategoryModeOptionsMarkup(defaults.mode)}
            </select>
          </span>
          <span role="cell">
            <span class="analysis-setup-asset-percent">
              <input class="analysis-setup-asset-percent-input analysis-setup-debt-field" type="text" inputmode="decimal" value="${defaults.payoffPercent}" aria-label="${item.label} payoff percentage" data-analysis-debt-payoff="${item.key}">
              <span aria-hidden="true">%</span>
            </span>
          </span>
          <span role="cell"><span class="analysis-setup-treatment-preview" data-analysis-debt-source-preview="${item.key}">No source value</span></span>
        </div>
      `);
    });

    table.dataset.rendered = "true";
  }

  function getFieldMap() {
    const fields = {
      resetButton: document.querySelector("[data-analysis-inflation-reset]")
    };
    Array.from(document.querySelectorAll("[data-analysis-inflation-field]")).forEach(function (field) {
      fields[field.getAttribute("data-analysis-inflation-field")] = field;
    });
    return fields;
  }

  function getSliderMap() {
    const sliders = {};
    Array.from(document.querySelectorAll("[data-analysis-inflation-slider]")).forEach(function (slider) {
      sliders[slider.getAttribute("data-analysis-inflation-slider")] = slider;
    });
    return sliders;
  }

  function getHealthcareExpenseFieldMap() {
    const fields = {};
    Array.from(document.querySelectorAll("[data-analysis-healthcare-expense-field]")).forEach(function (field) {
      fields[field.getAttribute("data-analysis-healthcare-expense-field")] = field;
    });
    return fields;
  }

  function getMethodFieldMap() {
    const fields = {
      resetButton: document.querySelector("[data-analysis-method-reset]")
    };
    Array.from(document.querySelectorAll("[data-analysis-method-field]")).forEach(function (field) {
      fields[field.getAttribute("data-analysis-method-field")] = field;
    });
    return fields;
  }

  function getGrowthFieldMap() {
    const fields = {
      resetButton: document.querySelector("[data-analysis-growth-reset]")
    };
    Array.from(document.querySelectorAll("[data-analysis-growth-field]")).forEach(function (field) {
      fields[field.getAttribute("data-analysis-growth-field")] = field;
    });
    return fields;
  }

  function getGrowthSliderMap() {
    const sliders = {};
    Array.from(document.querySelectorAll("[data-analysis-growth-slider]")).forEach(function (slider) {
      sliders[slider.getAttribute("data-analysis-growth-slider")] = slider;
    });
    return sliders;
  }

  function getPolicyTypeReturnFieldMap() {
    const fields = {
      enabled: document.querySelector("[data-analysis-policy-return-enabled]"),
      profile: document.querySelector("[data-analysis-policy-return-profile]"),
      resetButton: document.querySelector("[data-analysis-policy-return-reset]"),
      values: {},
      currentAssumptions: null
    };

    Array.from(document.querySelectorAll("[data-analysis-policy-return-field]")).forEach(function (field) {
      fields.values[field.getAttribute("data-analysis-policy-return-field")] = field;
    });

    return fields;
  }

  function getAssetTreatmentFieldMap() {
    const fields = {
      defaultProfile: DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.defaultProfile,
      defaultProfileButtons: Array.from(document.querySelectorAll("[data-analysis-asset-default-profile]")),
      include: {},
      growth: {},
      growthSlider: {},
      preset: {},
      taxTreatment: {},
      tax: {},
      haircut: {},
      preview: {},
      assetGrowthProjection: {
        mode: document.querySelector("[data-analysis-asset-growth-projection-mode]"),
        projectionYears: document.querySelector("[data-analysis-asset-growth-projection-years]")
      },
      fieldLists: {
        include: {},
        growth: {},
        growthSlider: {},
        preset: {},
        taxTreatment: {},
        tax: {},
        haircut: {},
        preview: {}
      },
      custom: {
        label: {},
        value: {},
        include: {},
        preset: {},
        taxTreatment: {},
        tax: {},
        haircut: {},
        preview: {}
      }
    };

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-include]")).forEach(function (field) {
      addAssetTreatmentField(fields, "include", "data-analysis-asset-treatment-include", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-growth]")).forEach(function (field) {
      addAssetTreatmentField(fields, "growth", "data-analysis-asset-treatment-growth", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-growth-slider]")).forEach(function (field) {
      addAssetTreatmentField(fields, "growthSlider", "data-analysis-asset-treatment-growth-slider", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-preset]")).forEach(function (field) {
      addAssetTreatmentField(fields, "preset", "data-analysis-asset-treatment-preset", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-tax-treatment]")).forEach(function (field) {
      addAssetTreatmentField(fields, "taxTreatment", "data-analysis-asset-treatment-tax-treatment", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-tax]")).forEach(function (field) {
      addAssetTreatmentField(fields, "tax", "data-analysis-asset-treatment-tax", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-haircut]")).forEach(function (field) {
      addAssetTreatmentField(fields, "haircut", "data-analysis-asset-treatment-haircut", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-preview]")).forEach(function (field) {
      addAssetTreatmentField(fields, "preview", "data-analysis-asset-treatment-preview", field);
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-label]")).forEach(function (field) {
      fields.custom.label[field.getAttribute("data-analysis-asset-treatment-custom-label")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-value]")).forEach(function (field) {
      fields.custom.value[field.getAttribute("data-analysis-asset-treatment-custom-value")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-include]")).forEach(function (field) {
      fields.custom.include[field.getAttribute("data-analysis-asset-treatment-custom-include")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-preset]")).forEach(function (field) {
      fields.custom.preset[field.getAttribute("data-analysis-asset-treatment-custom-preset")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-tax-treatment]")).forEach(function (field) {
      fields.custom.taxTreatment[field.getAttribute("data-analysis-asset-treatment-custom-tax-treatment")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-tax]")).forEach(function (field) {
      fields.custom.tax[field.getAttribute("data-analysis-asset-treatment-custom-tax")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-haircut]")).forEach(function (field) {
      fields.custom.haircut[field.getAttribute("data-analysis-asset-treatment-custom-haircut")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-asset-treatment-custom-preview]")).forEach(function (field) {
      fields.custom.preview[field.getAttribute("data-analysis-asset-treatment-custom-preview")] = field;
    });

    return fields;
  }

  function getExistingCoverageFieldMap() {
    const fields = {
      defaultProfile: DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.globalTreatmentProfile,
      defaultProfileButtons: Array.from(document.querySelectorAll("[data-analysis-coverage-profile]")),
      values: {},
      fieldGroups: {},
      rawPreview: document.querySelector("[data-analysis-coverage-raw-preview]"),
      adjustedPreview: document.querySelector("[data-analysis-coverage-adjusted-preview]"),
      currentAssumptions: null
    };

    Array.from(document.querySelectorAll("[data-analysis-coverage-field]")).forEach(function (field) {
      const fieldPath = field.getAttribute("data-analysis-coverage-field");
      if (!fieldPath) {
        return;
      }
      if (!fields.values[fieldPath]) {
        fields.values[fieldPath] = field;
      }
      if (!Array.isArray(fields.fieldGroups[fieldPath])) {
        fields.fieldGroups[fieldPath] = [];
      }
      fields.fieldGroups[fieldPath].push(field);
    });

    return fields;
  }

  function getDebtTreatmentFieldMap() {
    const fields = {
      defaultProfile: DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.globalTreatmentProfile,
      defaultProfileButtons: Array.from(document.querySelectorAll("[data-analysis-debt-profile]")),
      mortgage: {},
      include: {},
      mode: {},
      payoff: {},
      sourcePreview: {},
      rawPreview: document.querySelector("[data-analysis-debt-raw-preview]"),
      adjustedPreview: document.querySelector("[data-analysis-debt-adjusted-preview]"),
      previewNote: document.querySelector("[data-analysis-debt-preview-note]"),
      currentAssumptions: null
    };

    Array.from(document.querySelectorAll("[data-analysis-debt-mortgage-field]")).forEach(function (field) {
      fields.mortgage[field.getAttribute("data-analysis-debt-mortgage-field")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-debt-include]")).forEach(function (field) {
      fields.include[field.getAttribute("data-analysis-debt-include")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-debt-mode]")).forEach(function (field) {
      fields.mode[field.getAttribute("data-analysis-debt-mode")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-debt-payoff]")).forEach(function (field) {
      fields.payoff[field.getAttribute("data-analysis-debt-payoff")] = field;
    });

    Array.from(document.querySelectorAll("[data-analysis-debt-source-preview]")).forEach(function (field) {
      fields.sourcePreview[field.getAttribute("data-analysis-debt-source-preview")] = field;
    });

    return fields;
  }

  function getSurvivorSupportFieldMap() {
    const fields = {
      defaultProfile: DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.globalTreatmentProfile,
      defaultProfileButtons: Array.from(document.querySelectorAll("[data-analysis-survivor-profile]")),
      resetButton: document.querySelector("[data-analysis-survivor-reset]"),
      values: {},
      fieldGroups: {},
      preview: {
        spouseIncome: document.querySelector("[data-analysis-survivor-preview='spouseIncome']"),
        startDelay: document.querySelector("[data-analysis-survivor-preview='startDelay']"),
        supportDuration: document.querySelector("[data-analysis-survivor-preview='supportDuration']"),
        discretionarySupport: document.querySelector("[data-analysis-survivor-preview='discretionarySupport']")
      },
      currentAssumptions: null
    };

    Array.from(document.querySelectorAll("[data-analysis-survivor-field]")).forEach(function (field) {
      const fieldPath = field.getAttribute("data-analysis-survivor-field");
      if (!fieldPath) {
        return;
      }
      if (!fields.values[fieldPath]) {
        fields.values[fieldPath] = field;
      }
      if (!Array.isArray(fields.fieldGroups[fieldPath])) {
        fields.fieldGroups[fieldPath] = [];
      }
      fields.fieldGroups[fieldPath].push(field);
    });

    return fields;
  }

  function getEducationFieldMap() {
    const fields = {
      defaultProfile: DEFAULT_EDUCATION_ASSUMPTIONS.globalTreatmentProfile,
      defaultProfileButtons: Array.from(document.querySelectorAll("[data-analysis-education-profile]")),
      values: {},
      preview: {
        currentNeed: document.querySelector("[data-analysis-education-preview='currentNeed']"),
        childrenNeedingFunding: document.querySelector("[data-analysis-education-preview='childrenNeedingFunding']"),
        projectedDependents: document.querySelector("[data-analysis-education-preview='projectedDependents']"),
        costPerChild: document.querySelector("[data-analysis-education-preview='costPerChild']")
      },
      currentAssumptions: null
    };

    Array.from(document.querySelectorAll("[data-analysis-education-field]")).forEach(function (field) {
      fields.values[field.getAttribute("data-analysis-education-field")] = field;
    });

    return fields;
  }

  function getRecommendationGuardrailFieldMap() {
    const fields = {
      enabled: document.querySelector("[data-analysis-recommendation-enabled]"),
      defaultProfile: DEFAULT_RECOMMENDATION_GUARDRAILS.recommendationProfile,
      defaultProfileButtons: Array.from(document.querySelectorAll("[data-analysis-recommendation-profile]")),
      values: {},
      preview: {
        currentMode: document.querySelector("[data-analysis-recommendation-preview='currentMode']"),
        engineStatus: document.querySelector("[data-analysis-recommendation-preview='engineStatus']"),
        savedFor: document.querySelector("[data-analysis-recommendation-preview='savedFor']")
      },
      currentAssumptions: null
    };

    Array.from(document.querySelectorAll("[data-analysis-recommendation-field]")).forEach(function (field) {
      fields.values[field.getAttribute("data-analysis-recommendation-field")] = field;
    });

    return fields;
  }

  function hasAssetTreatmentFields(fields) {
    const hasStandardFields = ASSET_TREATMENT_ITEMS.some(function (item) {
      return Boolean(
        fields.include[item.key]
        || fields.growth[item.key]
        || fields.growthSlider[item.key]
        || fields.preset[item.key]
        || fields.taxTreatment[item.key]
        || fields.tax[item.key]
        || fields.haircut[item.key]
      );
    });
    const hasCustomFields = Object.keys(fields.custom?.label || {}).length > 0;
    const hasDefaultProfileControls = Array.isArray(fields.defaultProfileButtons) && fields.defaultProfileButtons.length > 0;
    return hasDefaultProfileControls || hasStandardFields || hasCustomFields;
  }

  function hasExistingCoverageFields(fields) {
    return Boolean(
      fields.rawPreview
      || fields.adjustedPreview
      || (fields.defaultProfileButtons || []).length
      || Object.keys(fields.values || {}).length
    );
  }

  function hasHealthcareExpenseFields(fields) {
    return Boolean(
      fields.enabled
      || fields.projectionYears
      || fields.includeOneTimeHealthcareExpenses
    );
  }

  function hasDebtTreatmentFields(fields) {
    return Boolean(
      fields.rawPreview
      || fields.adjustedPreview
      || (fields.defaultProfileButtons || []).length
      || Object.keys(fields.mortgage || {}).length
      || Object.keys(fields.include || {}).length
      || Object.keys(fields.mode || {}).length
      || Object.keys(fields.payoff || {}).length
    );
  }

  function hasPolicyTypeReturnFields(fields) {
    return Boolean(
      fields.enabled
      || fields.profile
      || fields.resetButton
      || Object.keys(fields.values || {}).length
    );
  }

  function hasSurvivorSupportFields(fields) {
    return Boolean(
      (fields.defaultProfileButtons || []).length
      || Object.keys(fields.values || {}).length
      || Object.keys(fields.preview || {}).some(function (key) {
        return Boolean(fields.preview[key]);
      })
    );
  }

  function hasEducationFields(fields) {
    return Boolean(
      (fields.defaultProfileButtons || []).length
      || Object.keys(fields.values || {}).length
      || Object.keys(fields.preview || {}).some(function (key) {
        return Boolean(fields.preview[key]);
      })
    );
  }

  function hasRecommendationGuardrailFields(fields) {
    return Boolean(
      fields.enabled
      || (fields.defaultProfileButtons || []).length
      || Object.keys(fields.values || {}).length
      || Object.keys(fields.preview || {}).some(function (key) {
        return Boolean(fields.preview[key]);
      })
    );
  }

  function setRecommendationEnabled(fields, value) {
    if (fields.enabled) {
      fields.enabled.checked = Boolean(value);
    }
  }

  function setMessage(element, message, tone) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.dataset.tone = tone || "neutral";
    element.hidden = !message;
  }

  function setStatus(element, message, tone) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.dataset.tone = tone || "neutral";
  }

  function normalizeAnalysisSetupView(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return ANALYSIS_SETUP_VIEW_KEYS.includes(normalizedValue)
      ? normalizedValue
      : ANALYSIS_SETUP_DEFAULT_VIEW;
  }

  function getAnalysisSetupViewFromHash() {
    const hashValue = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
    return normalizeAnalysisSetupView(ANALYSIS_SETUP_VIEW_HASH_LOOKUP[hashValue] || hashValue);
  }

  function updateAnalysisSetupViewHash(viewName) {
    const nextHash = ANALYSIS_SETUP_VIEW_HASHES[normalizeAnalysisSetupView(viewName)];
    if (!nextHash || !window.history?.replaceState) {
      return;
    }

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${nextHash}`
    );
  }

  function getAnalysisSetupScrollContainer(viewGrid) {
    return viewGrid?.closest
      ? viewGrid.closest(".analysis-setup-panel-body")
      : null;
  }

  function getAnalysisSetupViewTarget(viewName, viewPanels) {
    const selectedView = normalizeAnalysisSetupView(viewName);
    return (viewPanels || []).find(function (panel) {
      return normalizeAnalysisSetupView(panel.getAttribute("data-analysis-setup-view-panel")) === selectedView;
    }) || null;
  }

  function scrollAnalysisSetupViewIntoPlace(viewName, viewPanels, viewGrid, options) {
    const scrollContainer = getAnalysisSetupScrollContainer(viewGrid);
    const targetPanel = getAnalysisSetupViewTarget(viewName, viewPanels);
    if (!scrollContainer || !targetPanel) {
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = targetPanel.getBoundingClientRect();
    const nextTop = Math.max(0, scrollContainer.scrollTop + targetRect.top - containerRect.top);
    if (typeof scrollContainer.scrollTo === "function") {
      scrollContainer.scrollTo({
        top: nextTop,
        behavior: options?.instantScroll ? "auto" : "smooth"
      });
      return;
    }

    scrollContainer.scrollTop = nextTop;
  }

  function getAnalysisSetupViewFromScroll(viewPanels, viewGrid) {
    const scrollContainer = getAnalysisSetupScrollContainer(viewGrid);
    if (!scrollContainer) {
      return ANALYSIS_SETUP_DEFAULT_VIEW;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const activationLine = containerRect.top + Math.min(160, containerRect.height * 0.34);
    let activeView = ANALYSIS_SETUP_DEFAULT_VIEW;

    ANALYSIS_SETUP_VIEW_KEYS.forEach(function (viewName) {
      const targetPanel = getAnalysisSetupViewTarget(viewName, viewPanels);
      if (!targetPanel) {
        return;
      }

      if (targetPanel.getBoundingClientRect().top <= activationLine) {
        activeView = viewName;
      }
    });

    return activeView;
  }

  function setAnalysisSetupView(viewName, viewTabs, viewPanels, viewGrid, options) {
    const selectedView = normalizeAnalysisSetupView(viewName);

    if (viewGrid) {
      viewGrid.dataset.analysisSetupCurrentView = selectedView;
    }

    (viewTabs || []).forEach(function (tab) {
      const tabView = normalizeAnalysisSetupView(tab.getAttribute("data-analysis-setup-view-tab"));
      const isSelected = tabView === selectedView;
      tab.setAttribute("aria-pressed", isSelected ? "true" : "false");
      tab.dataset.active = isSelected ? "true" : "false";
    });

    (viewPanels || []).forEach(function (panel) {
      const panelView = normalizeAnalysisSetupView(panel.getAttribute("data-analysis-setup-view-panel"));
      const isSelected = panelView === selectedView;
      panel.hidden = false;
      panel.dataset.active = isSelected ? "true" : "false";
    });

    if (options?.updateHash) {
      updateAnalysisSetupViewHash(selectedView);
    }

    if (options?.scrollToView) {
      scrollAnalysisSetupViewIntoPlace(selectedView, viewPanels, viewGrid, options);
    }
  }

  function bindAnalysisSetupViewScrollSync(viewTabs, viewPanels, viewGrid) {
    const scrollContainer = getAnalysisSetupScrollContainer(viewGrid);
    if (!scrollContainer || !viewPanels?.length) {
      return;
    }

    let syncQueued = false;
    const requestFrame = window.requestAnimationFrame || function (callback) {
      return window.setTimeout(callback, 16);
    };
    const syncFromScroll = function () {
      syncQueued = false;
      setAnalysisSetupView(
        getAnalysisSetupViewFromScroll(viewPanels, viewGrid),
        viewTabs,
        viewPanels,
        viewGrid,
        { updateHash: true }
      );
    };
    const requestSync = function () {
      if (syncQueued) {
        return;
      }
      syncQueued = true;
      requestFrame(syncFromScroll);
    };

    scrollContainer.addEventListener("scroll", requestSync, { passive: true });
    window.addEventListener("resize", requestSync);
  }

  function setAssetDefaultProfile(fields, profile) {
    const normalizedProfile = normalizeAssetDefaultProfile(
      profile,
      DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.defaultProfile
    );
    fields.defaultProfile = normalizedProfile;
    (fields.defaultProfileButtons || []).forEach(function (button) {
      const buttonProfile = String(button.getAttribute("data-analysis-asset-default-profile") || "").trim();
      const isActive = buttonProfile === normalizedProfile;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.dataset.active = isActive ? "true" : "false";
    });
  }

  function getAssetDefaultProfile(fields) {
    return normalizeAssetDefaultProfile(
      fields.defaultProfile,
      DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.defaultProfile
    );
  }

  function populateAssetGrowthProjectionFields(fields, assumptions) {
    const projectionAssumptions = getAssetGrowthProjectionAssumptions(
      assumptions?.assetGrowthProjectionAssumptions
    );
    const modeField = fields?.assetGrowthProjection?.mode;
    const projectionYearsField = fields?.assetGrowthProjection?.projectionYears;

    if (modeField) {
      modeField.value = projectionAssumptions.mode;
    }
    if (projectionYearsField) {
      projectionYearsField.value = formatHaircutInputValue(
        projectionAssumptions.projectionYears
      );
    }
  }

  function readAssetGrowthProjectionAssumptionsFromFields(fields, currentAssumptions) {
    const currentProjectionAssumptions = getAssetGrowthProjectionAssumptions(
      currentAssumptions?.assetGrowthProjectionAssumptions
    );
    const modeField = fields?.assetGrowthProjection?.mode;
    const projectionYearsField = fields?.assetGrowthProjection?.projectionYears;

    return getAssetGrowthProjectionAssumptions({
      mode: modeField
        ? modeField.value
        : currentProjectionAssumptions.mode,
      projectionYears: projectionYearsField
        ? projectionYearsField.value
        : currentProjectionAssumptions.projectionYears
    });
  }

  function clampAssetGrowthProjectionYearsField(fields) {
    const field = fields?.assetGrowthProjection?.projectionYears;
    if (!field) {
      return;
    }

    field.value = formatHaircutInputValue(
      normalizeAssetGrowthProjectionYears(field.value)
    );
  }

  function setExistingCoverageDefaultProfile(fields, profile) {
    const normalizedProfile = normalizeCoverageTreatmentProfile(
      profile,
      DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.globalTreatmentProfile
    );
    fields.defaultProfile = normalizedProfile;
    (fields.defaultProfileButtons || []).forEach(function (button) {
      const buttonProfile = String(button.getAttribute("data-analysis-coverage-profile") || "").trim();
      const isActive = buttonProfile === normalizedProfile;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.dataset.active = isActive ? "true" : "false";
    });
  }

  function getExistingCoverageDefaultProfile(fields) {
    return normalizeCoverageTreatmentProfile(
      fields.defaultProfile,
      DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.globalTreatmentProfile
    );
  }

  function setDebtTreatmentDefaultProfile(fields, profile) {
    const normalizedProfile = normalizeDebtTreatmentProfile(
      profile,
      DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.globalTreatmentProfile
    );
    fields.defaultProfile = normalizedProfile;
    (fields.defaultProfileButtons || []).forEach(function (button) {
      const buttonProfile = String(button.getAttribute("data-analysis-debt-profile") || "").trim();
      const isActive = buttonProfile === normalizedProfile;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.dataset.active = isActive ? "true" : "false";
    });
  }

  function getDebtTreatmentDefaultProfile(fields) {
    return normalizeDebtTreatmentProfile(
      fields.defaultProfile,
      DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.globalTreatmentProfile
    );
  }

  function setSurvivorSupportDefaultProfile(fields, profile) {
    const normalizedProfile = normalizeSurvivorSupportProfile(
      profile,
      DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.globalTreatmentProfile
    );
    fields.defaultProfile = normalizedProfile;
    (fields.defaultProfileButtons || []).forEach(function (button) {
      const buttonProfile = String(button.getAttribute("data-analysis-survivor-profile") || "").trim();
      const isActive = buttonProfile === normalizedProfile;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.dataset.active = isActive ? "true" : "false";
    });
  }

  function getSurvivorSupportDefaultProfile(fields) {
    return normalizeSurvivorSupportProfile(
      fields.defaultProfile,
      DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.globalTreatmentProfile
    );
  }

  function setEducationDefaultProfile(fields, profile) {
    const normalizedProfile = normalizeEducationProfile(
      profile,
      DEFAULT_EDUCATION_ASSUMPTIONS.globalTreatmentProfile
    );
    fields.defaultProfile = normalizedProfile;
    (fields.defaultProfileButtons || []).forEach(function (button) {
      const buttonProfile = String(button.getAttribute("data-analysis-education-profile") || "").trim();
      const isActive = buttonProfile === normalizedProfile;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.dataset.active = isActive ? "true" : "false";
    });
  }

  function getEducationDefaultProfile(fields) {
    return normalizeEducationProfile(
      fields.defaultProfile,
      DEFAULT_EDUCATION_ASSUMPTIONS.globalTreatmentProfile
    );
  }

  function setRecommendationDefaultProfile(fields, profile) {
    const normalizedProfile = normalizeRecommendationProfile(
      profile,
      DEFAULT_RECOMMENDATION_GUARDRAILS.recommendationProfile
    );
    fields.defaultProfile = normalizedProfile;
    (fields.defaultProfileButtons || []).forEach(function (button) {
      const buttonProfile = String(button.getAttribute("data-analysis-recommendation-profile") || "").trim();
      const isActive = buttonProfile === normalizedProfile;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.dataset.active = isActive ? "true" : "false";
    });
  }

  function getRecommendationDefaultProfile(fields) {
    return normalizeRecommendationProfile(
      fields.defaultProfile,
      DEFAULT_RECOMMENDATION_GUARDRAILS.recommendationProfile
    );
  }

  function getExistingCoverageFieldControls(fields, fieldPath) {
    const fieldGroup = fields.fieldGroups?.[fieldPath];
    if (Array.isArray(fieldGroup) && fieldGroup.length) {
      return fieldGroup;
    }

    const field = fields.values?.[fieldPath];
    return field ? [field] : [];
  }

  function syncExistingCoverageFieldControls(fields, fieldPath, sourceField) {
    if (!sourceField) {
      return;
    }

    getExistingCoverageFieldControls(fields, fieldPath).forEach(function (field) {
      if (!field || field === sourceField) {
        return;
      }

      if (field.type === "checkbox") {
        field.checked = Boolean(sourceField.checked);
        return;
      }

      field.value = sourceField.value;
    });
  }

  function setExistingCoverageChecked(fields, fieldPath, value) {
    getExistingCoverageFieldControls(fields, fieldPath).forEach(function (field) {
      field.checked = Boolean(value);
    });
  }

  function setExistingCoverageValue(fields, fieldPath, value) {
    getExistingCoverageFieldControls(fields, fieldPath).forEach(function (field) {
      field.value = value === null || value === undefined
        ? ""
        : formatHaircutInputValue(value);
    });
  }

  function setDebtMortgageValue(fields, fieldName, value) {
    const field = fields.mortgage?.[fieldName];
    if (!field) {
      return;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }

    field.value = value === null || value === undefined
      ? ""
      : formatHaircutInputValue(value);
  }

  function setDebtCategoryChecked(fields, itemKey, value) {
    if (fields.include?.[itemKey]) {
      fields.include[itemKey].checked = Boolean(value);
    }
  }

  function setDebtCategoryValue(fields, groupName, itemKey, value) {
    const field = fields[groupName]?.[itemKey];
    if (!field) {
      return;
    }

    field.value = value === null || value === undefined
      ? ""
      : formatHaircutInputValue(value);
  }

  function getSurvivorSupportFieldControls(fields, fieldPath) {
    const fieldGroup = fields.fieldGroups?.[fieldPath];
    if (Array.isArray(fieldGroup) && fieldGroup.length) {
      return fieldGroup;
    }

    const field = fields.values?.[fieldPath];
    return field ? [field] : [];
  }

  function syncSurvivorSupportFieldControls(fields, fieldPath, sourceField) {
    if (!sourceField) {
      return;
    }

    getSurvivorSupportFieldControls(fields, fieldPath).forEach(function (field) {
      if (!field || field === sourceField) {
        return;
      }

      if (field.type === "checkbox") {
        field.checked = Boolean(sourceField.checked);
        return;
      }

      field.value = sourceField.value;
    });
  }

  function setSurvivorSupportChecked(fields, fieldPath, value) {
    getSurvivorSupportFieldControls(fields, fieldPath).forEach(function (field) {
      field.checked = Boolean(value);
    });
  }

  function setSurvivorSupportValue(fields, fieldPath, value) {
    getSurvivorSupportFieldControls(fields, fieldPath).forEach(function (field) {
      if (field.tagName === "SELECT") {
        field.value = value === true ? "true" : value === false ? "false" : "";
        return;
      }

      field.value = value === null || value === undefined
        ? ""
        : formatHaircutInputValue(value);
    });
  }

  function setEducationChecked(fields, fieldPath, value) {
    const field = fields.values?.[fieldPath];
    if (field) {
      field.checked = Boolean(value);
    }
  }

  function setEducationValue(fields, fieldPath, value) {
    const field = fields.values?.[fieldPath];
    if (!field) {
      return;
    }

    field.value = value === null || value === undefined
      ? ""
      : formatHaircutInputValue(value);
  }

  function setRecommendationChecked(fields, fieldPath, value) {
    const field = fields.values?.[fieldPath];
    if (field) {
      field.checked = Boolean(value);
    }
  }

  function setRecommendationValue(fields, fieldPath, value) {
    const field = fields.values?.[fieldPath];
    if (!field) {
      return;
    }

    if (field.tagName === "SELECT") {
      field.value = value === null || value === undefined ? "" : String(value);
      return;
    }

    field.value = value === null || value === undefined
      ? ""
      : formatHaircutInputValue(value);
  }

  function setPolicyTypeReturnValue(fields, fieldPath, value) {
    const field = fields.values?.[fieldPath];
    if (!field) {
      return;
    }

    field.value = value === null || value === undefined
      ? ""
      : formatHaircutInputValue(value);
  }

  function getExistingCoverageCurrentAssumptions(fields) {
    return isPlainObject(fields.currentAssumptions)
      ? fields.currentAssumptions
      : DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS;
  }

  function readExistingCoverageDraftBoolean(fields, fieldPath, fallback) {
    const field = getExistingCoverageFieldControls(fields, fieldPath)[0];
    return field ? Boolean(field.checked) : Boolean(fallback);
  }

  function readExistingCoverageDraftPercent(fields, fieldPath, fallback) {
    const field = getExistingCoverageFieldControls(fields, fieldPath)[0];
    const rawValue = String(field?.value || "").trim();
    const number = Number(rawValue);
    return rawValue && Number.isFinite(number)
      ? normalizeCoverageTreatmentPercent(number, fallback)
      : fallback;
  }

  function readExistingCoverageDraftTermGuardrail(fields, fieldPath, fallback) {
    const field = getExistingCoverageFieldControls(fields, fieldPath)[0];
    const rawValue = String(field?.value || "").trim();
    return rawValue
      ? normalizeCoverageTermGuardrailYears(rawValue, fallback)
      : null;
  }

  function getExistingCoverageDraftAssumptions(fields) {
    const current = getExistingCoverageCurrentAssumptions(fields);
    const currentGroupTreatment = current.groupCoverageTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.groupCoverageTreatment;
    const currentIndividualTermTreatment = current.individualTermTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment;
    const currentPermanentTreatment = current.permanentCoverageTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.permanentCoverageTreatment;
    const currentPendingTreatment = current.pendingCoverageTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.pendingCoverageTreatment;
    const currentUnknownTreatment = current.unknownCoverageTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.unknownCoverageTreatment;

    return {
      enabled: Boolean(current.enabled),
      globalTreatmentProfile: getExistingCoverageDefaultProfile(fields),
      includeExistingCoverage: readExistingCoverageDraftBoolean(
        fields,
        "includeExistingCoverage",
        current.includeExistingCoverage
      ),
      groupCoverageTreatment: {
        include: readExistingCoverageDraftBoolean(
          fields,
          "groupCoverageTreatment.include",
          currentGroupTreatment.include
        ),
        reliabilityDiscountPercent: readExistingCoverageDraftPercent(
          fields,
          "groupCoverageTreatment.reliabilityDiscountPercent",
          currentGroupTreatment.reliabilityDiscountPercent
        ),
        portabilityRequired: Boolean(currentGroupTreatment.portabilityRequired)
      },
      individualTermTreatment: {
        include: Boolean(currentIndividualTermTreatment.include),
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          currentIndividualTermTreatment.reliabilityDiscountPercent,
          DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment.reliabilityDiscountPercent
        ),
        excludeIfExpiresWithinYears: readExistingCoverageDraftTermGuardrail(
          fields,
          "individualTermTreatment.excludeIfExpiresWithinYears",
          currentIndividualTermTreatment.excludeIfExpiresWithinYears
        )
      },
      permanentCoverageTreatment: {
        include: Boolean(currentPermanentTreatment.include),
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          currentPermanentTreatment.reliabilityDiscountPercent,
          DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.permanentCoverageTreatment.reliabilityDiscountPercent
        )
      },
      pendingCoverageTreatment: {
        include: readExistingCoverageDraftBoolean(
          fields,
          "pendingCoverageTreatment.include",
          currentPendingTreatment.include
        ),
        reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
          currentPendingTreatment.reliabilityDiscountPercent,
          DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.pendingCoverageTreatment.reliabilityDiscountPercent
        )
      },
      unknownCoverageTreatment: {
        include: readExistingCoverageDraftBoolean(
          fields,
          "unknownCoverageTreatment.include",
          currentUnknownTreatment.include
        ),
        reliabilityDiscountPercent: readExistingCoverageDraftPercent(
          fields,
          "unknownCoverageTreatment.reliabilityDiscountPercent",
          currentUnknownTreatment.reliabilityDiscountPercent
        )
      },
      source: "analysis-setup"
    };
  }

  function getDebtTreatmentCurrentAssumptions(fields) {
    return isPlainObject(fields.currentAssumptions)
      ? fields.currentAssumptions
      : DEFAULT_DEBT_TREATMENT_ASSUMPTIONS;
  }

  function getSurvivorSupportCurrentAssumptions(fields) {
    return isPlainObject(fields.currentAssumptions)
      ? fields.currentAssumptions
      : DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS;
  }

  function getEducationCurrentAssumptions(fields) {
    return isPlainObject(fields.currentAssumptions)
      ? fields.currentAssumptions
      : DEFAULT_EDUCATION_ASSUMPTIONS;
  }

  function getRecommendationCurrentGuardrails(fields) {
    return isPlainObject(fields.currentAssumptions)
      ? fields.currentAssumptions
      : DEFAULT_RECOMMENDATION_GUARDRAILS;
  }

  function readDebtDraftBoolean(field, fallback) {
    return field ? Boolean(field.checked) : Boolean(fallback);
  }

  function readDebtDraftPercent(field, fallback) {
    const rawValue = String(field?.value || "").trim();
    const number = Number(rawValue);
    return rawValue && Number.isFinite(number)
      ? normalizeDebtPayoffPercent(number, fallback)
      : fallback;
  }

  function readDebtDraftSupportYears(field, fallback) {
    const rawValue = String(field?.value || "").trim();
    return rawValue
      ? normalizeDebtSupportYears(rawValue, fallback)
      : null;
  }

  function getDebtTreatmentDraftAssumptions(fields) {
    const current = getDebtTreatmentCurrentAssumptions(fields);
    const currentMortgageTreatment = current.mortgageTreatment || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment;
    const nextAssumptions = {
      schemaVersion: DEBT_TREATMENT_SCHEMA_VERSION,
      enabled: Boolean(current.enabled),
      globalTreatmentProfile: getDebtTreatmentDefaultProfile(fields),
      mortgageTreatment: {
        mode: normalizeMortgageTreatmentMode(
          fields.mortgage?.mode?.value,
          currentMortgageTreatment.mode
        ),
        include: readDebtDraftBoolean(fields.mortgage?.include, currentMortgageTreatment.include),
        payoffPercent: readDebtDraftPercent(
          fields.mortgage?.payoffPercent,
          currentMortgageTreatment.payoffPercent
        ),
        paymentSupportYears: readDebtDraftSupportYears(
          fields.mortgage?.paymentSupportYears,
          currentMortgageTreatment.paymentSupportYears
        )
      },
      debtCategoryTreatment: {},
      source: "analysis-setup"
    };

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const currentTreatment = current.debtCategoryTreatment?.[item.key]
        || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]
        || createDefaultDebtCategoryTreatment();
      nextAssumptions.debtCategoryTreatment[item.key] = {
        include: readDebtDraftBoolean(fields.include?.[item.key], currentTreatment.include),
        mode: normalizeDebtCategoryTreatmentMode(fields.mode?.[item.key]?.value, currentTreatment.mode),
        payoffPercent: readDebtDraftPercent(fields.payoff?.[item.key], currentTreatment.payoffPercent)
      };
    });

    return nextAssumptions;
  }

  function readSurvivorSupportDraftBoolean(fields, fieldPath, fallback) {
    const field = getSurvivorSupportFieldControls(fields, fieldPath)[0];
    return field ? Boolean(field.checked) : Boolean(fallback);
  }

  function readSurvivorSupportDraftBooleanOrNull(fields, fieldPath, fallback) {
    const field = getSurvivorSupportFieldControls(fields, fieldPath)[0];
    return field
      ? normalizeSurvivorSupportBoolean(field.value, null)
      : normalizeSurvivorSupportBoolean(fallback, null);
  }

  function readSurvivorSupportDraftPercent(fields, fieldPath, fallback) {
    const field = getSurvivorSupportFieldControls(fields, fieldPath)[0];
    const rawValue = String(field?.value || "").trim();
    const number = Number(rawValue);
    return rawValue && Number.isFinite(number)
      ? normalizeSurvivorSupportPercent(number, fallback)
      : fallback;
  }

  function readSurvivorSupportDraftOptionalPercent(fields, fieldPath, fallback) {
    const field = getSurvivorSupportFieldControls(fields, fieldPath)[0];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return null;
    }

    const number = Number(rawValue);
    return Number.isFinite(number)
      ? normalizeSurvivorSupportPercent(number, fallback)
      : fallback;
  }

  function readSurvivorSupportDraftYears(fields, fieldPath, fallback) {
    const field = getSurvivorSupportFieldControls(fields, fieldPath)[0];
    const rawValue = String(field?.value || "").trim();
    return rawValue
      ? normalizeSurvivorSupportYears(rawValue, fallback)
      : null;
  }

  function readSurvivorSupportDraftNonNegativeNumber(fields, fieldPath, fallback) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    return rawValue
      ? normalizeSurvivorSupportNonNegativeNumber(rawValue, fallback)
      : null;
  }

  function getSurvivorSupportDraftAssumptions(fields) {
    const current = getSurvivorSupportCurrentAssumptions(fields);
    const currentSurvivorIncomeTreatment = current.survivorIncomeTreatment
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorIncomeTreatment;
    const currentSurvivorScenario = current.survivorScenario
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorScenario;
    const currentSupportTreatment = current.supportTreatment
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.supportTreatment;
    const currentRiskFlags = current.riskFlags
      || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.riskFlags;

    return {
      enabled: Boolean(current.enabled),
      globalTreatmentProfile: getSurvivorSupportDefaultProfile(fields),
      survivorIncomeTreatment: {
        includeSurvivorIncome: readSurvivorSupportDraftBoolean(
          fields,
          "survivorIncomeTreatment.includeSurvivorIncome",
          currentSurvivorIncomeTreatment.includeSurvivorIncome
        ),
        applyStartDelay: readSurvivorSupportDraftBoolean(
          fields,
          "survivorIncomeTreatment.applyStartDelay",
          currentSurvivorIncomeTreatment.applyStartDelay
        ),
        applyIncomeGrowth: readSurvivorSupportDraftBoolean(
          fields,
          "survivorIncomeTreatment.applyIncomeGrowth",
          currentSurvivorIncomeTreatment.applyIncomeGrowth
        ),
        maxReliancePercent: readSurvivorSupportDraftPercent(
          fields,
          "survivorIncomeTreatment.maxReliancePercent",
          currentSurvivorIncomeTreatment.maxReliancePercent
        ),
        incomeOffsetYears: normalizeSurvivorSupportYears(
          currentSurvivorIncomeTreatment.incomeOffsetYears,
          DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorIncomeTreatment.incomeOffsetYears
        )
      },
      survivorScenario: {
        survivorContinuesWorking: readSurvivorSupportDraftBooleanOrNull(
          fields,
          "survivorScenario.survivorContinuesWorking",
          currentSurvivorScenario.survivorContinuesWorking
        ),
        expectedSurvivorWorkReductionPercent: readSurvivorSupportDraftOptionalPercent(
          fields,
          "survivorScenario.expectedSurvivorWorkReductionPercent",
          currentSurvivorScenario.expectedSurvivorWorkReductionPercent
        ),
        survivorIncomeStartDelayMonths: readSurvivorSupportDraftNonNegativeNumber(
          fields,
          "survivorScenario.survivorIncomeStartDelayMonths",
          currentSurvivorScenario.survivorIncomeStartDelayMonths
        ),
        survivorEarnedIncomeGrowthRatePercent: readSurvivorSupportDraftOptionalPercent(
          fields,
          "survivorScenario.survivorEarnedIncomeGrowthRatePercent",
          currentSurvivorScenario.survivorEarnedIncomeGrowthRatePercent
        ),
        survivorRetirementHorizonYears: readSurvivorSupportDraftNonNegativeNumber(
          fields,
          "survivorScenario.survivorRetirementHorizonYears",
          currentSurvivorScenario.survivorRetirementHorizonYears
        )
      },
      supportTreatment: {
        includeEssentialSupport: readSurvivorSupportDraftBoolean(
          fields,
          "supportTreatment.includeEssentialSupport",
          currentSupportTreatment.includeEssentialSupport
        ),
        includeDiscretionarySupport: readSurvivorSupportDraftBoolean(
          fields,
          "supportTreatment.includeDiscretionarySupport",
          currentSupportTreatment.includeDiscretionarySupport
        ),
        includeTransitionNeeds: readSurvivorSupportDraftBoolean(
          fields,
          "supportTreatment.includeTransitionNeeds",
          currentSupportTreatment.includeTransitionNeeds
        ),
        supportDurationYears: readSurvivorSupportDraftYears(
          fields,
          "supportTreatment.supportDurationYears",
          currentSupportTreatment.supportDurationYears
        )
      },
      riskFlags: {
        flagHighSurvivorIncomeReliance: readSurvivorSupportDraftBoolean(
          fields,
          "riskFlags.flagHighSurvivorIncomeReliance",
          currentRiskFlags.flagHighSurvivorIncomeReliance
        ),
        highRelianceThresholdPercent: readSurvivorSupportDraftPercent(
          fields,
          "riskFlags.highRelianceThresholdPercent",
          currentRiskFlags.highRelianceThresholdPercent
        )
      },
      source: "analysis-setup"
    };
  }

  function readEducationDraftBoolean(fields, fieldPath, fallback) {
    const field = fields.values?.[fieldPath];
    return field ? Boolean(field.checked) : Boolean(fallback);
  }

  function readEducationDraftPercent(fields, fieldPath, fallback) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    const number = Number(rawValue);
    return rawValue && Number.isFinite(number)
      ? normalizeEducationPercent(number, fallback)
      : fallback;
  }

  function readRecommendationDraftBoolean(fields, fieldPath, fallback) {
    const field = fields.values?.[fieldPath];
    return field ? Boolean(field.checked) : Boolean(fallback);
  }

  function readRecommendationDraftPercent(fields, fieldPath, fallback) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    const number = Number(rawValue);
    return rawValue && Number.isFinite(number)
      ? normalizeRecommendationPercent(number, fallback)
      : fallback;
  }

  function readRecommendationDraftRangeSource(fields, fieldPath, fallback) {
    return normalizeRecommendationRangeSource(
      fields.values?.[fieldPath]?.value,
      fallback
    );
  }

  function getEducationDraftAssumptions(fields) {
    const current = getEducationCurrentAssumptions(fields);
    const currentFundingTreatment = current.fundingTreatment
      || DEFAULT_EDUCATION_ASSUMPTIONS.fundingTreatment;
    const currentRiskFlags = current.riskFlags
      || DEFAULT_EDUCATION_ASSUMPTIONS.riskFlags;

    return {
      enabled: Boolean(current.enabled),
      globalTreatmentProfile: getEducationDefaultProfile(fields),
      fundingTreatment: {
        includeEducationFunding: readEducationDraftBoolean(
          fields,
          "fundingTreatment.includeEducationFunding",
          currentFundingTreatment.includeEducationFunding
        ),
        fundingTargetPercent: readEducationDraftPercent(
          fields,
          "fundingTreatment.fundingTargetPercent",
          currentFundingTreatment.fundingTargetPercent
        ),
        educationStartAge: normalizeEducationStartAge(
          fields.values?.["fundingTreatment.educationStartAge"]?.value,
          currentFundingTreatment.educationStartAge
        ),
        includeProjectedDependents: readEducationDraftBoolean(
          fields,
          "fundingTreatment.includeProjectedDependents",
          currentFundingTreatment.includeProjectedDependents
        ),
        applyEducationInflation: readEducationDraftBoolean(
          fields,
          "fundingTreatment.applyEducationInflation",
          currentFundingTreatment.applyEducationInflation
        ),
        useExistingEducationSavingsOffset: false
      },
      educationSavingsTreatment: {
        existingEducationSavingsValue: null,
        includeAsOffset: false,
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      },
      riskFlags: {
        flagMissingDependentDetails: readEducationDraftBoolean(
          fields,
          "riskFlags.flagMissingDependentDetails",
          currentRiskFlags.flagMissingDependentDetails
        ),
        flagProjectedDependentsIncluded: readEducationDraftBoolean(
          fields,
          "riskFlags.flagProjectedDependentsIncluded",
          currentRiskFlags.flagProjectedDependentsIncluded
        )
      },
      source: "analysis-setup"
    };
  }

  function getRecommendationDraftGuardrails(fields) {
    const current = getRecommendationCurrentGuardrails(fields);
    const currentRiskThresholds = current.riskThresholds
      || DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds;
    const currentAssetReliance = currentRiskThresholds.assetReliance
      || DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds.assetReliance;
    const currentIlliquidAssetReliance = currentRiskThresholds.illiquidAssetReliance
      || DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds.illiquidAssetReliance;
    const currentSurvivorIncomeReliance = currentRiskThresholds.survivorIncomeReliance
      || DEFAULT_RECOMMENDATION_GUARDRAILS.riskThresholds.survivorIncomeReliance;
    const currentRangeConstraints = current.rangeConstraints
      || DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints;
    const currentLowerBound = currentRangeConstraints.lowerBound
      || DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.lowerBound;
    const currentUpperBound = currentRangeConstraints.upperBound
      || DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.upperBound;
    const currentRiskFlags = current.riskFlags
      || DEFAULT_RECOMMENDATION_GUARDRAILS.riskFlags;
    const recommendationProfile = getRecommendationDefaultProfile(fields);

    return {
      enabled: fields.enabled ? Boolean(fields.enabled.checked) : Boolean(current.enabled),
      recommendationProfile,
      riskThresholds: {
        assetReliance: {
          warningThresholdPercent: readRecommendationDraftPercent(
            fields,
            "riskThresholds.assetReliance.warningThresholdPercent",
            currentAssetReliance.warningThresholdPercent
          )
        },
        illiquidAssetReliance: {
          warningThresholdPercent: readRecommendationDraftPercent(
            fields,
            "riskThresholds.illiquidAssetReliance.warningThresholdPercent",
            currentIlliquidAssetReliance.warningThresholdPercent
          )
        },
        survivorIncomeReliance: {
          warningThresholdPercent: readRecommendationDraftPercent(
            fields,
            "riskThresholds.survivorIncomeReliance.warningThresholdPercent",
            currentSurvivorIncomeReliance.warningThresholdPercent
          )
        }
      },
      rangeConstraints: {
        lowerBound: {
          source: readRecommendationDraftRangeSource(
            fields,
            "rangeConstraints.lowerBound.source",
            currentLowerBound.source
          ),
          tolerancePercent: readRecommendationDraftPercent(
            fields,
            "rangeConstraints.lowerBound.tolerancePercent",
            currentLowerBound.tolerancePercent
          )
        },
        upperBound: {
          source: readRecommendationDraftRangeSource(
            fields,
            "rangeConstraints.upperBound.source",
            currentUpperBound.source
          ),
          tolerancePercent: readRecommendationDraftPercent(
            fields,
            "rangeConstraints.upperBound.tolerancePercent",
            currentUpperBound.tolerancePercent
          )
        },
        conflictHandling: normalizeRecommendationConflictHandling(
          currentRangeConstraints.conflictHandling,
          DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.conflictHandling
        )
      },
      riskFlags: {
        flagMissingCriticalInputs: readRecommendationDraftBoolean(
          fields,
          "riskFlags.flagMissingCriticalInputs",
          currentRiskFlags.flagMissingCriticalInputs
        ),
        flagHeavyAssetReliance: readRecommendationDraftBoolean(
          fields,
          "riskFlags.flagHeavyAssetReliance",
          currentRiskFlags.flagHeavyAssetReliance
        ),
        flagHeavySurvivorIncomeReliance: readRecommendationDraftBoolean(
          fields,
          "riskFlags.flagHeavySurvivorIncomeReliance",
          currentRiskFlags.flagHeavySurvivorIncomeReliance
        ),
        flagGroupCoverageReliance: readRecommendationDraftBoolean(
          fields,
          "riskFlags.flagGroupCoverageReliance",
          currentRiskFlags.flagGroupCoverageReliance
        )
      },
      source: "analysis-setup"
    };
  }

  function populateFields(fields, assumptions, sliders) {
    if (fields.enabled) {
      fields.enabled.checked = Boolean(assumptions.enabled);
    }

    RATE_FIELDS.forEach(function (fieldName) {
      const formattedValue = formatRateInputValue(assumptions[fieldName]);
      if (fields[fieldName]) {
        fields[fieldName].value = formattedValue;
      }
      if (sliders?.[fieldName]) {
        sliders[fieldName].value = formattedValue;
        updateRateSliderProgress(sliders[fieldName]);
      }
    });

    if (fields[FINAL_EXPENSE_TARGET_AGE_FIELD]) {
      fields[FINAL_EXPENSE_TARGET_AGE_FIELD].value = formatHaircutInputValue(
        assumptions.finalExpenseTargetAge
      );
    }
  }

  function populateHealthcareExpenseFields(fields, assumptions) {
    if (fields.enabled) {
      fields.enabled.checked = Boolean(assumptions.enabled);
    }
    if (fields.projectionYears) {
      fields.projectionYears.value = String(
        normalizeHealthcareProjectionYearsValue(
          assumptions.projectionYears,
          DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears
        )
      );
    }
    if (fields.includeOneTimeHealthcareExpenses) {
      fields.includeOneTimeHealthcareExpenses.checked = Boolean(
        assumptions.includeOneTimeHealthcareExpenses
      );
    }
  }

  function clampHealthcareExpenseProjectionYearsField(fields) {
    const field = fields.projectionYears;
    if (!field) {
      return;
    }

    const rawValue = String(field.value || "").trim();
    const number = rawValue ? Number(rawValue) : null;
    const nextValue = number !== null && Number.isFinite(number)
      ? normalizeHealthcareProjectionYearsValue(
        number,
        DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears
      )
      : DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears;
    field.value = String(nextValue);
  }

  function populateMethodFields(fields, defaults) {
    if (fields.dimeIncomeYears) {
      fields.dimeIncomeYears.value = formatHaircutInputValue(defaults.dimeIncomeYears);
    }
    if (fields.needsSupportYears) {
      fields.needsSupportYears.value = formatHaircutInputValue(defaults.needsSupportYears);
    }
    if (fields.hlvProjectionYears) {
      fields.hlvProjectionYears.value = formatHaircutInputValue(
        defaults.hlvProjectionYears ?? DEFAULT_METHOD_DEFAULTS.hlvProjectionYears
      );
    }
    if (fields.needsIncludeOffsetAssets) {
      fields.needsIncludeOffsetAssets.checked = defaults.needsIncludeOffsetAssets !== false;
    }
  }

  function populateDefaultMethodFields(fields, linkedRecord) {
    populateMethodFields(fields, getDefaultMethodDefaults(linkedRecord));
  }

  function resetHlvProjectionYearsToDefault(fields, linkedRecord) {
    const field = fields.hlvProjectionYears;
    if (!field) {
      return;
    }

    const rawValue = String(field.value || "").trim();
    if (rawValue) {
      return;
    }

    field.value = formatHaircutInputValue(getRetirementYearsDefault(linkedRecord));
  }

  function populateGrowthFields(fields, assumptions, sliders) {
    if (fields.enabled) {
      fields.enabled.checked = Boolean(assumptions.enabled);
    }
    if (fields.returnBasis) {
      fields.returnBasis.value = normalizeGrowthReturnBasis(
        assumptions.returnBasis,
        DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS.returnBasis
      );
    }

    GROWTH_RATE_FIELDS.forEach(function (fieldName) {
      const formattedValue = formatRateInputValue(assumptions[fieldName]);
      if (fields[fieldName]) {
        fields[fieldName].value = formattedValue;
      }
      if (sliders?.[fieldName]) {
        sliders[fieldName].value = formattedValue;
        updateRateSliderProgress(sliders[fieldName]);
      }
    });
  }

  function populatePolicyTypeReturnFields(fields, assumptions) {
    fields.currentAssumptions = assumptions;
    if (fields.enabled) {
      fields.enabled.checked = Boolean(assumptions.enabled);
    }
    if (fields.profile) {
      fields.profile.value = normalizePolicyReturnProfile(
        assumptions.profile,
        DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.profile
      );
    }

    setPolicyTypeReturnValue(fields, "termLife.cashValueReturnPercent", assumptions.termLife.cashValueReturnPercent);
    setPolicyTypeReturnValue(fields, "wholeLife.guaranteedGrowthPercent", assumptions.wholeLife.guaranteedGrowthPercent);
    setPolicyTypeReturnValue(fields, "wholeLife.dividendCreditPercent", assumptions.wholeLife.dividendCreditPercent);
    setPolicyTypeReturnValue(fields, "universalLife.currentCreditingPercent", assumptions.universalLife.currentCreditingPercent);
    setPolicyTypeReturnValue(fields, "universalLife.guaranteedCreditingPercent", assumptions.universalLife.guaranteedCreditingPercent);
    setPolicyTypeReturnValue(fields, "indexedUniversalLife.assumedCreditingPercent", assumptions.indexedUniversalLife.assumedCreditingPercent);
    setPolicyTypeReturnValue(fields, "indexedUniversalLife.capRatePercent", assumptions.indexedUniversalLife.capRatePercent);
    setPolicyTypeReturnValue(fields, "indexedUniversalLife.participationRatePercent", assumptions.indexedUniversalLife.participationRatePercent);
    setPolicyTypeReturnValue(fields, "indexedUniversalLife.floorRatePercent", assumptions.indexedUniversalLife.floorRatePercent);
    setPolicyTypeReturnValue(fields, "variableUniversalLife.grossReturnPercent", assumptions.variableUniversalLife.grossReturnPercent);
    setPolicyTypeReturnValue(fields, "variableUniversalLife.netReturnPercent", assumptions.variableUniversalLife.netReturnPercent);
  }

  function getLinkedProtectionModelingData(record) {
    const currentPayloadData = record?.protectionModeling?.data;
    if (isPlainObject(currentPayloadData)) {
      return currentPayloadData;
    }

    const entries = Array.isArray(record?.protectionModelingEntries)
      ? record.protectionModelingEntries
      : [];
    const latestEntryData = entries.length ? entries[entries.length - 1]?.data : null;
    return isPlainObject(latestEntryData) ? latestEntryData : {};
  }

  function getAssetSourceValue(record, item) {
    const sourceData = getLinkedProtectionModelingData(record);
    const sourceField = String(item?.sourceField || "").trim();

    if (sourceField && Object.prototype.hasOwnProperty.call(sourceData, sourceField)) {
      return parseOptionalMoneyValue(sourceData[sourceField]);
    }

    if (sourceField && Object.prototype.hasOwnProperty.call(record || {}, sourceField)) {
      return parseOptionalMoneyValue(record[sourceField]);
    }

    return null;
  }

  function getValidatedPreviewPercent(field) {
    const rawValue = String(field?.value || "").trim();
    const number = Number(rawValue);
    return rawValue && Number.isFinite(number)
      ? Math.min(MAX_ASSET_TREATMENT_PERCENT, Math.max(MIN_ASSET_TREATMENT_PERCENT, number))
      : 0;
  }

  function getAvailablePreviewValue(sourceValue, include, taxDragPercent, liquidityHaircutPercent) {
    if (!include) {
      return 0;
    }

    const taxMultiplier = 1 - (taxDragPercent / 100);
    const liquidityMultiplier = 1 - (liquidityHaircutPercent / 100);
    return Math.max(0, sourceValue * taxMultiplier * liquidityMultiplier);
  }

  function getCoveragePolicyArray(record) {
    return Array.isArray(record?.coveragePolicies)
      ? record.coveragePolicies.filter(function (policy) {
          return policy && typeof policy === "object";
        })
      : [];
  }

  function getCoveragePolicyRawPreviewAmount(policy) {
    const coverageUtils = LensApp.coverage || {};
    if (typeof coverageUtils.getCoverageDeathBenefitAmount === "function") {
      return coverageUtils.getCoverageDeathBenefitAmount(policy);
    }

    return parseOptionalMoneyValue(
      policy?.faceAmount != null && policy.faceAmount !== ""
        ? policy.faceAmount
        : policy?.deathBenefitAmount
    ) || 0;
  }

  function getExistingCoveragePreviewRawTotal(policies) {
    return policies.reduce(function (total, policy) {
      return total + Math.max(0, getCoveragePolicyRawPreviewAmount(policy));
    }, 0);
  }

  function getExistingCoverageTreatmentCalculator() {
    const calculator = LensApp.lensAnalysis?.calculateExistingCoverageTreatment;
    return typeof calculator === "function" ? calculator : null;
  }

  function normalizeDateOnlyCandidate(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (
      Number.isNaN(date.getTime())
      || date.getFullYear() !== year
      || date.getMonth() !== monthIndex
      || date.getDate() !== day
    ) {
      return null;
    }

    return formatDateOnlyFromDate(date);
  }

  function resolveExistingCoveragePreviewValuationDate(record, assumptions) {
    const analysisSettings = isPlainObject(record?.analysisSettings)
      ? record.analysisSettings
      : {};
    const savedAssumptions = isPlainObject(record?.analysisSettings?.existingCoverageAssumptions)
      ? record.analysisSettings.existingCoverageAssumptions
      : {};
    const candidates = [
      { value: analysisSettings.valuationDate, source: "analysisSettings.valuationDate" },
      {
        value: savedAssumptions.valuationDate,
        source: "analysisSettings.existingCoverageAssumptions.valuationDate",
        deprecated: true
      },
      {
        value: savedAssumptions.asOfDate,
        source: "analysisSettings.existingCoverageAssumptions.asOfDate",
        deprecated: true
      }
    ];
    let invalidDateSource = "";

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (candidate.value == null || String(candidate.value).trim() === "") {
        continue;
      }

      const valuationDate = normalizeDateOnlyCandidate(candidate.value);
      if (valuationDate) {
        return {
          valuationDate,
          source: candidate.source,
          warning: candidate.deprecated
            ? {
                code: "deprecated-existing-coverage-preview-valuation-date-fallback",
                message: "Existing coverage preview used a deprecated existing coverage valuation date because the shared Planning As-Of Date was unavailable.",
                details: {
                  source: candidate.source,
                  replacementSource: "analysisSettings.valuationDate"
                }
              }
            : null
        };
      }

      invalidDateSource = invalidDateSource || candidate.source;
    }

    return {
      valuationDate: null,
      source: "unavailable",
      warning: {
        code: invalidDateSource
          ? "invalid-existing-coverage-preview-valuation-date"
          : "missing-existing-coverage-preview-valuation-date",
        message: invalidDateSource
          ? "Existing coverage preview ignored an invalid Planning As-Of Date."
          : "Existing coverage preview has no valid Planning As-Of Date; date-sensitive pending and term guardrail treatment may not be applied.",
        details: {
          source: invalidDateSource || "analysisSettings.valuationDate"
        }
      }
    };
  }

  function hasExistingCoverageDateWarning(warnings) {
    return Array.isArray(warnings) && warnings.some(function (warning) {
      const code = String(warning?.code || "");
      return code.includes("effective-date") || code.includes("valuation-date");
    });
  }

  function getExistingCoveragePreviewTotals(record, assumptions) {
    const policies = getCoveragePolicyArray(record);
    const rawTotal = getExistingCoveragePreviewRawTotal(policies);
    const calculator = getExistingCoverageTreatmentCalculator();
    const valuationDateResult = resolveExistingCoveragePreviewValuationDate(record, assumptions);
    if (!calculator) {
      return {
        hasPolicies: policies.length > 0,
        rawTotal,
        adjustedTotal: null,
        warnings: [
          ...(valuationDateResult.warning ? [valuationDateResult.warning] : []),
          {
            code: "missing-existing-coverage-treatment-helper",
            message: "Existing coverage treatment preview is unavailable because the treatment helper is not loaded."
          }
        ],
        helperUsed: false,
        valuationDate: valuationDateResult.valuationDate,
        valuationDateSource: valuationDateResult.source
      };
    }

    const result = calculator({
      coveragePolicies: policies,
      existingCoverageAssumptions: assumptions,
      options: {
        valuationDate: valuationDateResult.valuationDate,
        source: "analysis-setup-preview",
        consumedByMethods: false
      }
    });

    return {
      hasPolicies: policies.length > 0,
      rawTotal: Number(result?.totalRawCoverage || 0),
      adjustedTotal: Number(result?.totalTreatedCoverageOffset || 0),
      warnings: [
        ...(valuationDateResult.warning ? [valuationDateResult.warning] : []),
        ...(Array.isArray(result?.warnings) ? result.warnings : [])
      ],
      helperUsed: true,
      valuationDate: valuationDateResult.valuationDate,
      valuationDateSource: valuationDateResult.source
    };
  }

  function syncExistingCoveragePreview(fields, linkedRecord) {
    if (!fields.rawPreview && !fields.adjustedPreview) {
      return;
    }

    const assumptions = getExistingCoverageDraftAssumptions(fields);
    fields.currentAssumptions = assumptions;
    const totals = getExistingCoveragePreviewTotals(linkedRecord, assumptions);
    const rawText = totals.hasPolicies
      ? `${formatCurrencyValue(totals.rawTotal)} total raw coverage`
      : "No linked coverage policies found";
    const adjustedText = totals.hasPolicies
      ? (totals.adjustedTotal === null
          ? "Preview unavailable - helper not loaded"
          : `${formatCurrencyValue(totals.adjustedTotal)} preview only${hasExistingCoverageDateWarning(totals.warnings) ? " - check policy dates" : ""}`)
      : "No linked coverage policies found";

    if (fields.rawPreview) {
      fields.rawPreview.textContent = rawText;
    }
    if (fields.adjustedPreview) {
      fields.adjustedPreview.textContent = adjustedText;
    }
  }

  function getDebtSourceValue(linkedRecord, sourceField) {
    const sourceData = getLinkedProtectionModelingData(linkedRecord);
    if (sourceField && Object.prototype.hasOwnProperty.call(sourceData, sourceField)) {
      return parseOptionalMoneyValue(sourceData[sourceField]);
    }

    if (sourceField && Object.prototype.hasOwnProperty.call(linkedRecord || {}, sourceField)) {
      return parseOptionalMoneyValue(linkedRecord[sourceField]);
    }

    return null;
  }

  function getDebtCategorySourceValue(linkedRecord, item) {
    const sourceFields = Array.isArray(item?.sourceFields) ? item.sourceFields : [];
    let hasSource = false;
    const total = sourceFields.reduce(function (sum, sourceField) {
      const sourceValue = getDebtSourceValue(linkedRecord, sourceField);
      if (sourceValue === null) {
        return sum;
      }

      hasSource = true;
      return sum + Math.max(0, sourceValue);
    }, 0);

    return hasSource ? total : null;
  }

  function getSurvivorSupportSourceRawValue(linkedRecord, sourceField) {
    const sourceData = getLinkedProtectionModelingData(linkedRecord);
    if (sourceField && Object.prototype.hasOwnProperty.call(sourceData, sourceField)) {
      return sourceData[sourceField];
    }

    if (sourceField && Object.prototype.hasOwnProperty.call(linkedRecord || {}, sourceField)) {
      return linkedRecord[sourceField];
    }

    return null;
  }

  function getSurvivorSupportMoneySourceValue(linkedRecord, sourceField) {
    return parseOptionalMoneyValue(getSurvivorSupportSourceRawValue(linkedRecord, sourceField));
  }

  function getSurvivorSupportNumberSourceValue(linkedRecord, sourceField) {
    return parseOptionalNumberValue(getSurvivorSupportSourceRawValue(linkedRecord, sourceField));
  }

  function getSurvivorSupportDefaultScenario(_linkedRecord, fallbackScenario) {
    const defaults = fallbackScenario || DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorScenario;
    const fallback = DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorScenario;
    return {
      survivorContinuesWorking: normalizeSurvivorSupportBoolean(
        defaults.survivorContinuesWorking,
        fallback.survivorContinuesWorking
      ),
      expectedSurvivorWorkReductionPercent: normalizeSurvivorSupportPercent(
        defaults.expectedSurvivorWorkReductionPercent,
        fallback.expectedSurvivorWorkReductionPercent
      ),
      survivorIncomeStartDelayMonths: normalizeSurvivorSupportNonNegativeNumber(
        defaults.survivorIncomeStartDelayMonths,
        fallback.survivorIncomeStartDelayMonths
      ),
      survivorEarnedIncomeGrowthRatePercent: normalizeSurvivorSupportPercent(
        defaults.survivorEarnedIncomeGrowthRatePercent,
        fallback.survivorEarnedIncomeGrowthRatePercent
      ),
      survivorRetirementHorizonYears: normalizeSurvivorSupportNonNegativeNumber(
        defaults.survivorRetirementHorizonYears,
        fallback.survivorRetirementHorizonYears
      )
    };
  }

  function getEducationSourceRawValue(linkedRecord, sourceField) {
    const sourceData = getLinkedProtectionModelingData(linkedRecord);
    if (sourceField && Object.prototype.hasOwnProperty.call(sourceData, sourceField)) {
      return sourceData[sourceField];
    }

    if (sourceField && Object.prototype.hasOwnProperty.call(linkedRecord || {}, sourceField)) {
      return linkedRecord[sourceField];
    }

    return null;
  }

  function getEducationSourceNumberValue(linkedRecord, sourceField) {
    return parseOptionalNumberValue(getEducationSourceRawValue(linkedRecord, sourceField));
  }

  function getEducationSourceMoneyValue(linkedRecord, sourceField) {
    return parseOptionalMoneyValue(getEducationSourceRawValue(linkedRecord, sourceField));
  }

  function getEducationProfileNumberValue(linkedRecord, fieldNames) {
    const safeFieldNames = Array.isArray(fieldNames) ? fieldNames : [];
    for (let index = 0; index < safeFieldNames.length; index += 1) {
      const fieldName = safeFieldNames[index];
      if (Object.prototype.hasOwnProperty.call(linkedRecord || {}, fieldName)) {
        const value = parseOptionalNumberValue(linkedRecord[fieldName]);
        if (value !== null) {
          return value;
        }
      }
    }

    return null;
  }

  function hasStructuredDependentDetailsSource(linkedRecord) {
    const dependentDetails = linkedRecord?.dependentDetails;
    if (Array.isArray(dependentDetails)) {
      return true;
    }

    if (typeof dependentDetails !== "string") {
      return false;
    }

    const normalizedDetails = dependentDetails.trim();
    if (!normalizedDetails) {
      return false;
    }

    try {
      return Array.isArray(JSON.parse(normalizedDetails));
    } catch (_error) {
      return false;
    }
  }

  function getEducationCurrentDependentProfileValue(linkedRecord, fieldNames) {
    const getCurrentDependentCount = window.LensApp?.clientRecords?.getCurrentDependentCount;
    if (hasStructuredDependentDetailsSource(linkedRecord) && typeof getCurrentDependentCount === "function") {
      return getCurrentDependentCount(linkedRecord);
    }

    return getEducationProfileNumberValue(linkedRecord, fieldNames);
  }

  function getEducationCountSourceValue(linkedRecord, sourceField, profileFields) {
    const profileValue = getEducationProfileNumberValue(linkedRecord, profileFields);
    if (profileValue !== null) {
      return profileValue;
    }

    return getEducationSourceNumberValue(linkedRecord, sourceField);
  }

  function getEducationCurrentDependentCountSourceValue(linkedRecord, sourceField, profileFields) {
    const profileValue = getEducationCurrentDependentProfileValue(linkedRecord, profileFields);
    if (profileValue !== null) {
      return profileValue;
    }

    return getEducationSourceNumberValue(linkedRecord, sourceField);
  }

  function getEducationSameFundingValue(linkedRecord) {
    const rawValue = getEducationSourceRawValue(linkedRecord, "sameEducationFunding");
    const normalizedValue = String(rawValue == null || rawValue === "" ? "Yes" : rawValue).trim().toLowerCase();
    return normalizedValue !== "no" && normalizedValue !== "false" && normalizedValue !== "0";
  }

  function getEducationSourcePreview(linkedRecord) {
    const childrenNeedingFunding = getEducationCurrentDependentCountSourceValue(
      linkedRecord,
      "childrenNeedingFunding",
      ["dependentsCount", "dependentCount"]
    );
    const projectedDependents = getEducationCountSourceValue(
      linkedRecord,
      "projectedDependentsCount",
      ["projectedDependentsCount", "desiredDependentsCount"]
    );
    const costPerChild = getEducationSourceMoneyValue(linkedRecord, "estimatedCostPerChild");
    const sameFunding = getEducationSameFundingValue(linkedRecord);
    const projectedCost = sameFunding
      ? costPerChild
      : getEducationSourceMoneyValue(linkedRecord, "projectedEducationFundingPerDependent");
    const linkedNeed = childrenNeedingFunding === null || costPerChild === null
      ? null
      : childrenNeedingFunding * costPerChild;
    const projectedNeed = projectedDependents === null || projectedCost === null
      ? null
      : projectedDependents * projectedCost;
    const hasNeed = linkedNeed !== null || projectedNeed !== null;

    return {
      childrenNeedingFunding,
      projectedDependents,
      costPerChild,
      totalEducationFundingNeed: hasNeed
        ? (linkedNeed === null ? 0 : linkedNeed) + (projectedNeed === null ? 0 : projectedNeed)
        : null
    };
  }

  function getDebtSourceTotals(linkedRecord) {
    const sourceFields = ["mortgageBalance"].concat(
      getDebtCategoryTreatmentItems().reduce(function (fields, item) {
        return fields.concat(item.sourceFields || []);
      }, [])
    );
    return sourceFields.reduce(function (totals, sourceField) {
      const sourceValue = getDebtSourceValue(linkedRecord, sourceField);
      if (sourceValue === null) {
        return totals;
      }

      totals.hasSource = true;
      totals.rawTotal += Math.max(0, sourceValue);
      return totals;
    }, {
      hasSource: false,
      rawTotal: 0
    });
  }

  function getAdjustedDebtTreatmentPreview(linkedRecord, assumptions) {
    let adjustedTotal = 0;
    let hasSource = false;
    let mortgageHandledThroughSupport = false;
    const mortgageBalance = getDebtSourceValue(linkedRecord, "mortgageBalance");
    const mortgageTreatment = assumptions.mortgageTreatment || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment;

    if (mortgageBalance !== null) {
      hasSource = true;
      if (mortgageTreatment.mode === "support") {
        mortgageHandledThroughSupport = true;
      } else if (mortgageTreatment.include) {
        adjustedTotal += Math.max(0, mortgageBalance) * (normalizeDebtPayoffPercent(
          mortgageTreatment.payoffPercent,
          DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.mortgageTreatment.payoffPercent
        ) / 100);
      }
    }

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const sourceValue = getDebtCategorySourceValue(linkedRecord, item);
      if (sourceValue === null) {
        return;
      }

      hasSource = true;
      const treatment = assumptions.debtCategoryTreatment?.[item.key]
        || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]
        || createDefaultDebtCategoryTreatment();
      if (!treatment.include || treatment.mode === "exclude") {
        return;
      }

      adjustedTotal += Math.max(0, sourceValue) * (normalizeDebtPayoffPercent(
        treatment.payoffPercent,
        DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]?.payoffPercent || 100
      ) / 100);
    });

    return {
      hasSource,
      adjustedTotal,
      mortgageHandledThroughSupport
    };
  }

  function syncDebtTreatmentPreview(fields, linkedRecord) {
    const assumptions = getDebtTreatmentDraftAssumptions(fields);
    fields.currentAssumptions = assumptions;

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const preview = fields.sourcePreview?.[item.key];
      if (!preview) {
        return;
      }

      const sourceValue = getDebtCategorySourceValue(linkedRecord, item);
      preview.textContent = sourceValue === null
        ? "No source value"
        : formatCurrencyValue(sourceValue);
    });

    const mortgagePreview = document.querySelector("[data-analysis-debt-mortgage-preview]");
    if (mortgagePreview) {
      const mortgageBalance = getDebtSourceValue(linkedRecord, "mortgageBalance");
      mortgagePreview.textContent = mortgageBalance === null
        ? "No source value"
        : formatCurrencyValue(mortgageBalance);
    }

    const rawTotals = getDebtSourceTotals(linkedRecord);
    const adjustedPreview = getAdjustedDebtTreatmentPreview(linkedRecord, assumptions);
    const noSourceText = "No saved debt data found";
    if (fields.rawPreview) {
      fields.rawPreview.textContent = rawTotals.hasSource
        ? formatCurrencyValue(rawTotals.rawTotal)
        : noSourceText;
    }
    if (fields.adjustedPreview) {
      fields.adjustedPreview.textContent = adjustedPreview.hasSource
        ? formatCurrencyValue(adjustedPreview.adjustedTotal)
        : noSourceText;
    }
    if (fields.previewNote) {
      fields.previewNote.textContent = adjustedPreview.mortgageHandledThroughSupport
        ? "Support mode uses the current monthly mortgage payment from PMI for the selected support period. It caps support at the remaining mortgage term when reliable term data is available. No inflation or discounting is applied. Taxes, insurance, HOA, utilities, and maintenance stay in ongoing household expenses."
        : "Setup preview of saved assumption effects. DIME and Needs use treated debt in Step 3; HLV remains unchanged. Non-mortgage custom treatment remains warning-backed until formulas are defined.";
    }
  }

  function syncSurvivorSupportPreview(fields, linkedRecord) {
    const assumptions = getSurvivorSupportDraftAssumptions(fields);
    fields.currentAssumptions = assumptions;

    const rawSpouseIncome = getSurvivorSupportMoneySourceValue(linkedRecord, "spouseIncome");
    const startDelayMonths = assumptions.survivorScenario?.survivorIncomeStartDelayMonths;
    const supportDurationYears = assumptions.supportTreatment?.supportDurationYears;
    const discretionaryIncluded = Boolean(assumptions.supportTreatment?.includeDiscretionarySupport);

    if (fields.preview?.spouseIncome) {
      fields.preview.spouseIncome.textContent = rawSpouseIncome === null
        ? "No raw spouse income found"
        : formatCurrencyValue(rawSpouseIncome);
    }
    if (fields.preview?.startDelay) {
      fields.preview.startDelay.textContent = startDelayMonths === null
        ? "No Analysis Setup delay"
        : `${formatHaircutInputValue(startDelayMonths)} months`;
    }
    if (fields.preview?.supportDuration) {
      fields.preview.supportDuration.textContent = supportDurationYears === null || supportDurationYears === undefined
        ? "Method Defaults"
        : `${formatHaircutInputValue(supportDurationYears)} years override`;
    }
    if (fields.preview?.discretionarySupport) {
      fields.preview.discretionarySupport.textContent = discretionaryIncluded
        ? "Included later"
        : "Excluded later";
    }
  }

  function syncEducationPreview(fields, linkedRecord) {
    const assumptions = getEducationDraftAssumptions(fields);
    fields.currentAssumptions = assumptions;

    const sourcePreview = getEducationSourcePreview(linkedRecord);
    const noSourceText = "No saved education data found";

    if (fields.preview?.currentNeed) {
      fields.preview.currentNeed.textContent = sourcePreview.totalEducationFundingNeed === null
        ? noSourceText
        : formatCurrencyValue(sourcePreview.totalEducationFundingNeed);
    }
    if (fields.preview?.childrenNeedingFunding) {
      fields.preview.childrenNeedingFunding.textContent = sourcePreview.childrenNeedingFunding === null
        ? noSourceText
        : formatHaircutInputValue(sourcePreview.childrenNeedingFunding);
    }
    if (fields.preview?.projectedDependents) {
      fields.preview.projectedDependents.textContent = sourcePreview.projectedDependents === null
        ? noSourceText
        : formatHaircutInputValue(sourcePreview.projectedDependents);
    }
    if (fields.preview?.costPerChild) {
      fields.preview.costPerChild.textContent = sourcePreview.costPerChild === null
        ? noSourceText
        : formatCurrencyValue(sourcePreview.costPerChild);
    }
  }

  function syncTaxTreatmentPill(pill, taxTreatment) {
    if (!pill) {
      return;
    }

    const normalizedTaxTreatment = normalizeTaxTreatment(taxTreatment, "custom");
    pill.textContent = TAX_TREATMENT_LABELS[normalizedTaxTreatment] || TAX_TREATMENT_LABELS.custom;
  }

  function syncAssetTreatmentPreview(fields, itemKey, linkedRecord) {
    const previews = getAssetTreatmentFieldList(fields, "preview", itemKey);
    if (!previews.length) {
      return;
    }

    const include = Boolean(getAssetTreatmentField(fields, "include", itemKey)?.checked);
    const preset = String(getAssetTreatmentField(fields, "preset", itemKey)?.value || "").trim();
    const taxDragPercent = getValidatedPreviewPercent(getAssetTreatmentField(fields, "tax", itemKey));
    const liquidityHaircutPercent = getValidatedPreviewPercent(getAssetTreatmentField(fields, "haircut", itemKey));

    previews.forEach(function (preview) {
      if (!include || preset === "excluded") {
        preview.textContent = "Excluded";
        return;
      }

      const sourceValue = parseOptionalMoneyValue(preview.getAttribute("data-analysis-asset-treatment-current-value"));
      if (sourceValue === null || sourceValue <= 0) {
        preview.textContent = "No source value";
        return;
      }

      preview.textContent = formatCurrencyValue(getAvailablePreviewValue(
        sourceValue,
        include,
        taxDragPercent,
        liquidityHaircutPercent
      ));
    });
  }

  function syncCustomAssetTreatmentPreview(fields, customAssetId) {
    const preview = fields.custom.preview[customAssetId];
    if (!preview) {
      return;
    }

    if (!CUSTOM_ASSET_TREATMENT_USES_PMI_INPUT) {
      preview.textContent = "No PMI source";
      return;
    }

    const include = Boolean(fields.custom.include[customAssetId]?.checked);
    const preset = String(fields.custom.preset[customAssetId]?.value || "").trim();
    if (!include || preset === "excluded") {
      preview.textContent = "Excluded";
      return;
    }

    const sourceValue = parseOptionalMoneyValue(fields.custom.value[customAssetId]?.value);
    if (sourceValue === null) {
      preview.textContent = "No source value";
      return;
    }

    const taxDragPercent = getValidatedPreviewPercent(fields.custom.tax[customAssetId]);
    const liquidityHaircutPercent = getValidatedPreviewPercent(fields.custom.haircut[customAssetId]);
    preview.textContent = formatCurrencyValue(getAvailablePreviewValue(
      sourceValue,
      include,
      taxDragPercent,
      liquidityHaircutPercent
    ));
  }

  function populateAssetTreatmentFields(fields, assumptions, linkedRecord) {
    fields.currentAssumptions = assumptions;
    setAssetDefaultProfile(fields, assumptions.defaultProfile);
    populateAssetGrowthProjectionFields(fields, assumptions);

    getVisibleAssetTreatmentItemKeys(fields).forEach(function (itemKey) {
      const assumption = assumptions.assets[itemKey] || getAssetTreatmentDefaultForKey(itemKey);

      setAssetTreatmentFieldsChecked(fields, "include", itemKey, assumption.include);
      setAssetTreatmentGrowthFields(fields, itemKey, createAssetGrowthSavedFields(
        assumption,
        itemKey,
        assumptions.defaultProfile
      ));
      setAssetTreatmentFieldsValue(fields, "preset", itemKey, assumption.treatmentPreset);
      getAssetTreatmentFieldList(fields, "taxTreatment", itemKey).forEach(function (field) {
        syncTaxTreatmentPill(field, assumption.taxTreatment);
      });
      setAssetTreatmentFieldsValue(fields, "tax", itemKey, formatHaircutInputValue(assumption.taxDragPercent));
      setAssetTreatmentFieldsValue(fields, "haircut", itemKey, formatHaircutInputValue(assumption.liquidityHaircutPercent));

      syncAssetTreatmentPreview(fields, itemKey, linkedRecord);
    });

    const customAssumption = (Array.isArray(assumptions.customAssets) ? assumptions.customAssets : [])[0]
      || DEFAULT_CUSTOM_ASSET_TREATMENT;
    const customAssetId = DEFAULT_CUSTOM_ASSET_TREATMENT.id;
    if (fields.custom.label[customAssetId]) {
      fields.custom.label[customAssetId].value = String(customAssumption.label || DEFAULT_CUSTOM_ASSET_TREATMENT.label);
    }
    if (fields.custom.value[customAssetId]) {
      fields.custom.value[customAssetId].value = customAssumption.estimatedValue === null
        ? ""
        : formatHaircutInputValue(customAssumption.estimatedValue);
    }
    if (fields.custom.include[customAssetId]) {
      fields.custom.include[customAssetId].checked = Boolean(customAssumption.include);
    }
    if (fields.custom.preset[customAssetId]) {
      fields.custom.preset[customAssetId].value = customAssumption.treatmentPreset;
    }
    syncTaxTreatmentPill(fields.custom.taxTreatment[customAssetId], customAssumption.taxTreatment);
    if (fields.custom.tax[customAssetId]) {
      fields.custom.tax[customAssetId].value = formatHaircutInputValue(customAssumption.taxDragPercent);
    }
    if (fields.custom.haircut[customAssetId]) {
      fields.custom.haircut[customAssetId].value = formatHaircutInputValue(customAssumption.liquidityHaircutPercent);
    }
    syncCustomAssetTreatmentPreview(fields, customAssetId);
  }

  function populateExistingCoverageFields(fields, assumptions, linkedRecord) {
    fields.currentAssumptions = assumptions;
    setExistingCoverageDefaultProfile(fields, assumptions.globalTreatmentProfile);
    setExistingCoverageChecked(fields, "includeExistingCoverage", assumptions.includeExistingCoverage);
    setExistingCoverageChecked(fields, "groupCoverageTreatment.include", assumptions.groupCoverageTreatment.include);
    setExistingCoverageValue(
      fields,
      "groupCoverageTreatment.reliabilityDiscountPercent",
      assumptions.groupCoverageTreatment.reliabilityDiscountPercent
    );
    setExistingCoverageChecked(fields, "pendingCoverageTreatment.include", assumptions.pendingCoverageTreatment.include);
    setExistingCoverageChecked(fields, "unknownCoverageTreatment.include", assumptions.unknownCoverageTreatment.include);
    setExistingCoverageValue(
      fields,
      "unknownCoverageTreatment.reliabilityDiscountPercent",
      assumptions.unknownCoverageTreatment.reliabilityDiscountPercent
    );
    setExistingCoverageValue(
      fields,
      "individualTermTreatment.excludeIfExpiresWithinYears",
      assumptions.individualTermTreatment.excludeIfExpiresWithinYears
    );
    syncExistingCoveragePreview(fields, linkedRecord);
  }

  function syncDebtSupportYearsVisibility(fields) {
    const row = document.querySelector("[data-analysis-debt-support-years-row]");
    if (!row) {
      return;
    }

    const mode = String(fields.mortgage?.mode?.value || "").trim();
    row.hidden = mode !== "support";
  }

  function populateDebtTreatmentFields(fields, assumptions, linkedRecord) {
    fields.currentAssumptions = assumptions;
    setDebtTreatmentDefaultProfile(fields, assumptions.globalTreatmentProfile);
    if (fields.mortgage.mode) {
      fields.mortgage.mode.value = assumptions.mortgageTreatment.mode;
    }
    setDebtMortgageValue(fields, "include", assumptions.mortgageTreatment.include);
    setDebtMortgageValue(fields, "payoffPercent", assumptions.mortgageTreatment.payoffPercent);
    setDebtMortgageValue(fields, "paymentSupportYears", assumptions.mortgageTreatment.paymentSupportYears);

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const assumption = assumptions.debtCategoryTreatment[item.key]
        || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]
        || createDefaultDebtCategoryTreatment();
      setDebtCategoryChecked(fields, item.key, assumption.include);
      if (fields.mode[item.key]) {
        fields.mode[item.key].value = assumption.mode;
      }
      setDebtCategoryValue(fields, "payoff", item.key, assumption.payoffPercent);
    });

    syncDebtSupportYearsVisibility(fields);
    syncDebtTreatmentPreview(fields, linkedRecord);
  }

  function populateSurvivorSupportFields(fields, assumptions, linkedRecord) {
    fields.currentAssumptions = assumptions;
    setSurvivorSupportDefaultProfile(fields, assumptions.globalTreatmentProfile);
    setSurvivorSupportChecked(
      fields,
      "survivorIncomeTreatment.includeSurvivorIncome",
      assumptions.survivorIncomeTreatment.includeSurvivorIncome
    );
    setSurvivorSupportChecked(
      fields,
      "survivorIncomeTreatment.applyStartDelay",
      assumptions.survivorIncomeTreatment.applyStartDelay
    );
    setSurvivorSupportChecked(
      fields,
      "survivorIncomeTreatment.applyIncomeGrowth",
      assumptions.survivorIncomeTreatment.applyIncomeGrowth
    );
    setSurvivorSupportValue(
      fields,
      "survivorIncomeTreatment.maxReliancePercent",
      assumptions.survivorIncomeTreatment.maxReliancePercent
    );
    setSurvivorSupportValue(
      fields,
      "survivorScenario.survivorContinuesWorking",
      assumptions.survivorScenario.survivorContinuesWorking
    );
    setSurvivorSupportValue(
      fields,
      "survivorScenario.expectedSurvivorWorkReductionPercent",
      assumptions.survivorScenario.expectedSurvivorWorkReductionPercent
    );
    setSurvivorSupportValue(
      fields,
      "survivorScenario.survivorIncomeStartDelayMonths",
      assumptions.survivorScenario.survivorIncomeStartDelayMonths
    );
    setSurvivorSupportValue(
      fields,
      "survivorScenario.survivorEarnedIncomeGrowthRatePercent",
      assumptions.survivorScenario.survivorEarnedIncomeGrowthRatePercent
    );
    setSurvivorSupportValue(
      fields,
      "survivorScenario.survivorRetirementHorizonYears",
      assumptions.survivorScenario.survivorRetirementHorizonYears
    );
    setSurvivorSupportChecked(
      fields,
      "supportTreatment.includeEssentialSupport",
      assumptions.supportTreatment.includeEssentialSupport
    );
    setSurvivorSupportChecked(
      fields,
      "supportTreatment.includeDiscretionarySupport",
      assumptions.supportTreatment.includeDiscretionarySupport
    );
    setSurvivorSupportChecked(
      fields,
      "supportTreatment.includeTransitionNeeds",
      assumptions.supportTreatment.includeTransitionNeeds
    );
    setSurvivorSupportValue(
      fields,
      "supportTreatment.supportDurationYears",
      assumptions.supportTreatment.supportDurationYears
    );
    setSurvivorSupportChecked(
      fields,
      "riskFlags.flagHighSurvivorIncomeReliance",
      assumptions.riskFlags.flagHighSurvivorIncomeReliance
    );
    setSurvivorSupportValue(
      fields,
      "riskFlags.highRelianceThresholdPercent",
      assumptions.riskFlags.highRelianceThresholdPercent
    );
    syncSurvivorSupportPreview(fields, linkedRecord);
  }

  function populateEducationFields(fields, assumptions, linkedRecord) {
    fields.currentAssumptions = assumptions;
    setEducationDefaultProfile(fields, assumptions.globalTreatmentProfile);
    setEducationChecked(
      fields,
      "fundingTreatment.includeEducationFunding",
      assumptions.fundingTreatment.includeEducationFunding
    );
    setEducationValue(
      fields,
      "fundingTreatment.fundingTargetPercent",
      assumptions.fundingTreatment.fundingTargetPercent
    );
    setEducationValue(
      fields,
      "fundingTreatment.educationStartAge",
      assumptions.fundingTreatment.educationStartAge
    );
    setEducationChecked(
      fields,
      "fundingTreatment.includeProjectedDependents",
      assumptions.fundingTreatment.includeProjectedDependents
    );
    setEducationChecked(
      fields,
      "fundingTreatment.applyEducationInflation",
      assumptions.fundingTreatment.applyEducationInflation
    );
    setEducationChecked(
      fields,
      "riskFlags.flagMissingDependentDetails",
      assumptions.riskFlags.flagMissingDependentDetails
    );
    setEducationChecked(
      fields,
      "riskFlags.flagProjectedDependentsIncluded",
      assumptions.riskFlags.flagProjectedDependentsIncluded
    );
    syncEducationPreview(fields, linkedRecord);
  }

  function syncRecommendationPreview(fields) {
    const guardrails = getRecommendationDraftGuardrails(fields);
    fields.currentAssumptions = guardrails;
    const profileLabel = RECOMMENDATION_PROFILE_LABELS[guardrails.recommendationProfile] || RECOMMENDATION_PROFILE_LABELS.balanced;

    if (fields.preview?.currentMode) {
      fields.preview.currentMode.textContent = profileLabel;
    }
    if (fields.preview?.engineStatus) {
      fields.preview.engineStatus.textContent = "Not active yet";
    }
    if (fields.preview?.savedFor) {
      fields.preview.savedFor.textContent = "Future LENS recommendation logic";
    }
  }

  function populateRecommendationGuardrailFields(fields, guardrails) {
    fields.currentAssumptions = guardrails;
    setRecommendationEnabled(fields, guardrails.enabled);
    setRecommendationDefaultProfile(fields, guardrails.recommendationProfile);
    setRecommendationValue(
      fields,
      "riskThresholds.assetReliance.warningThresholdPercent",
      guardrails.riskThresholds.assetReliance.warningThresholdPercent
    );
    setRecommendationValue(
      fields,
      "riskThresholds.illiquidAssetReliance.warningThresholdPercent",
      guardrails.riskThresholds.illiquidAssetReliance.warningThresholdPercent
    );
    setRecommendationValue(
      fields,
      "riskThresholds.survivorIncomeReliance.warningThresholdPercent",
      guardrails.riskThresholds.survivorIncomeReliance.warningThresholdPercent
    );
    setRecommendationValue(
      fields,
      "rangeConstraints.lowerBound.source",
      guardrails.rangeConstraints.lowerBound.source
    );
    setRecommendationValue(
      fields,
      "rangeConstraints.lowerBound.tolerancePercent",
      guardrails.rangeConstraints.lowerBound.tolerancePercent
    );
    setRecommendationValue(
      fields,
      "rangeConstraints.upperBound.source",
      guardrails.rangeConstraints.upperBound.source
    );
    setRecommendationValue(
      fields,
      "rangeConstraints.upperBound.tolerancePercent",
      guardrails.rangeConstraints.upperBound.tolerancePercent
    );
    setRecommendationChecked(
      fields,
      "riskFlags.flagMissingCriticalInputs",
      guardrails.riskFlags.flagMissingCriticalInputs
    );
    setRecommendationChecked(
      fields,
      "riskFlags.flagHeavyAssetReliance",
      guardrails.riskFlags.flagHeavyAssetReliance
    );
    setRecommendationChecked(
      fields,
      "riskFlags.flagHeavySurvivorIncomeReliance",
      guardrails.riskFlags.flagHeavySurvivorIncomeReliance
    );
    setRecommendationChecked(
      fields,
      "riskFlags.flagGroupCoverageReliance",
      guardrails.riskFlags.flagGroupCoverageReliance
    );
    syncRecommendationPreview(fields);
  }

  function setFieldsDisabled(fields, sliders, disabled) {
    Object.keys(fields).forEach(function (fieldName) {
      fields[fieldName].disabled = Boolean(disabled);
    });
    Object.keys(sliders || {}).forEach(function (fieldName) {
      sliders[fieldName].disabled = Boolean(disabled);
    });
  }

  function setHealthcareExpenseFieldsDisabled(fields, disabled) {
    Object.keys(fields).forEach(function (fieldName) {
      fields[fieldName].disabled = Boolean(disabled);
    });
  }

  function setMethodFieldsDisabled(fields, disabled) {
    Object.keys(fields).forEach(function (fieldName) {
      fields[fieldName].disabled = Boolean(disabled);
    });
  }

  function setGrowthFieldsDisabled(fields, sliders, disabled) {
    Object.keys(fields).forEach(function (fieldName) {
      fields[fieldName].disabled = Boolean(disabled);
    });
    Object.keys(sliders || {}).forEach(function (fieldName) {
      sliders[fieldName].disabled = Boolean(disabled);
    });
  }

  function setPolicyTypeReturnFieldsDisabled(fields, disabled) {
    if (fields.enabled) {
      fields.enabled.disabled = Boolean(disabled);
    }
    if (fields.profile) {
      fields.profile.disabled = Boolean(disabled);
    }
    if (fields.resetButton) {
      fields.resetButton.disabled = Boolean(disabled);
    }
    Object.keys(fields.values || {}).forEach(function (fieldPath) {
      getSurvivorSupportFieldControls(fields, fieldPath).forEach(function (field) {
        field.disabled = Boolean(disabled);
      });
    });
  }

  function setAssetTreatmentFieldsDisabled(fields, disabled) {
    (fields.defaultProfileButtons || []).forEach(function (button) {
      button.disabled = Boolean(disabled);
    });

    ["include", "growth", "growthSlider", "preset", "tax", "haircut"].forEach(function (groupName) {
      const fieldLists = fields.fieldLists?.[groupName] || {};
      Object.keys(fieldLists).forEach(function (fieldName) {
        (fieldLists[fieldName] || []).forEach(function (field) {
          field.disabled = Boolean(disabled);
        });
      });
    });

    ["label", "value", "include", "preset", "tax", "haircut"].forEach(function (groupName) {
      Object.keys(fields.custom?.[groupName] || {}).forEach(function (fieldName) {
        fields.custom[groupName][fieldName].disabled = Boolean(disabled) || !CUSTOM_ASSET_TREATMENT_USES_PMI_INPUT;
      });
    });
  }

  function setExistingCoverageFieldsDisabled(fields, disabled) {
    (fields.defaultProfileButtons || []).forEach(function (button) {
      button.disabled = Boolean(disabled);
    });

    Object.keys(fields.values || {}).forEach(function (fieldPath) {
      getExistingCoverageFieldControls(fields, fieldPath).forEach(function (field) {
        field.disabled = Boolean(disabled);
      });
    });
  }

  function setDebtTreatmentFieldsDisabled(fields, disabled) {
    (fields.defaultProfileButtons || []).forEach(function (button) {
      button.disabled = Boolean(disabled);
    });

    Object.keys(fields.mortgage || {}).forEach(function (fieldName) {
      fields.mortgage[fieldName].disabled = Boolean(disabled);
    });

    ["include", "mode", "payoff"].forEach(function (groupName) {
      Object.keys(fields[groupName] || {}).forEach(function (fieldName) {
        fields[groupName][fieldName].disabled = Boolean(disabled);
      });
    });
  }

  function setSurvivorSupportFieldsDisabled(fields, disabled) {
    (fields.defaultProfileButtons || []).forEach(function (button) {
      button.disabled = Boolean(disabled);
    });

    if (fields.resetButton) {
      fields.resetButton.disabled = Boolean(disabled);
    }

    Object.keys(fields.values || {}).forEach(function (fieldPath) {
      fields.values[fieldPath].disabled = Boolean(disabled);
    });
  }

  function setEducationFieldsDisabled(fields, disabled) {
    (fields.defaultProfileButtons || []).forEach(function (button) {
      button.disabled = Boolean(disabled);
    });

    Object.keys(fields.values || {}).forEach(function (fieldPath) {
      fields.values[fieldPath].disabled = Boolean(disabled);
    });
  }

  function setRecommendationGuardrailFieldsDisabled(fields, disabled) {
    if (fields.enabled) {
      fields.enabled.disabled = Boolean(disabled);
    }

    (fields.defaultProfileButtons || []).forEach(function (button) {
      button.disabled = Boolean(disabled);
    });

    Object.keys(fields.values || {}).forEach(function (fieldPath) {
      fields.values[fieldPath].disabled = Boolean(disabled);
    });
  }

  function syncSliderFromNumber(fields, sliders, fieldName, shouldFormat) {
    const field = fields[fieldName];
    const slider = sliders[fieldName];
    const rawValue = String(field?.value || "").trim();

    if (!field || !slider || !rawValue) {
      return;
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return;
    }

    const clampedValue = clampRateValue(number);
    const formattedValue = formatRateInputValue(clampedValue);
    slider.value = formattedValue;
    updateRateSliderProgress(slider);

    if (shouldFormat || clampedValue !== number) {
      field.value = formattedValue;
    }
  }

  function syncNumberFromSlider(fields, sliders, fieldName) {
    const field = fields[fieldName];
    const slider = sliders[fieldName];

    if (!field || !slider) {
      return;
    }

    const number = Number(slider.value);
    const clampedValue = Number.isFinite(number)
      ? clampRateValue(number)
      : DEFAULT_INFLATION_ASSUMPTIONS[fieldName];
    const formattedValue = formatRateInputValue(clampedValue);

    slider.value = formattedValue;
    field.value = formattedValue;
    updateRateSliderProgress(slider);
  }

  function syncGrowthSliderFromNumber(fields, sliders, fieldName, shouldFormat) {
    const field = fields[fieldName];
    const slider = sliders[fieldName];
    const rawValue = String(field?.value || "").trim();

    if (!field || !slider || !rawValue) {
      return;
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return;
    }

    const clampedValue = clampGrowthRateValue(number);
    const formattedValue = formatRateInputValue(clampedValue);
    slider.value = formattedValue;
    updateRateSliderProgress(slider);

    if (shouldFormat || clampedValue !== number) {
      field.value = formattedValue;
    }
  }

  function syncGrowthNumberFromSlider(fields, sliders, fieldName) {
    const field = fields[fieldName];
    const slider = sliders[fieldName];

    if (!field || !slider) {
      return;
    }

    const number = Number(slider.value);
    const clampedValue = Number.isFinite(number)
      ? clampGrowthRateValue(number)
      : DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS[fieldName];
    const formattedValue = formatRateInputValue(clampedValue);

    slider.value = formattedValue;
    field.value = formattedValue;
    updateRateSliderProgress(slider);
  }

  function updateRateSliderProgress(slider) {
    if (!slider) {
      return;
    }

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const value = Number(slider.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || max <= min) {
      slider.style.setProperty("--analysis-setup-slider-progress", "0%");
      return;
    }

    const clampedValue = Math.min(Math.max(value, min), max);
    const progressPercent = ((clampedValue - min) / (max - min)) * 100;
    slider.style.setProperty("--analysis-setup-slider-progress", `${progressPercent}%`);
  }

  function applyAssetTreatmentPreset(fields, itemKey, linkedRecord) {
    const presetKey = String(getAssetTreatmentField(fields, "preset", itemKey)?.value || "").trim();
    const preset = ASSET_TREATMENT_PRESETS[presetKey];

    if (!preset || presetKey === "custom") {
      getAssetTreatmentFieldList(fields, "taxTreatment", itemKey).forEach(function (field) {
        syncTaxTreatmentPill(field, preset?.taxTreatment || "custom");
      });
      syncAssetTreatmentPreview(fields, itemKey, linkedRecord);
      return;
    }

    setAssetTreatmentFieldsChecked(fields, "include", itemKey, preset.include);
    getAssetTreatmentFieldList(fields, "taxTreatment", itemKey).forEach(function (field) {
      syncTaxTreatmentPill(field, preset.taxTreatment);
    });
    setAssetTreatmentFieldsValue(fields, "tax", itemKey, formatHaircutInputValue(preset.taxDragPercent));
    setAssetTreatmentFieldsValue(fields, "haircut", itemKey, formatHaircutInputValue(preset.liquidityHaircutPercent));

    syncAssetTreatmentPreview(fields, itemKey, linkedRecord);
  }

  function applyCustomAssetTreatmentPreset(fields, customAssetId) {
    const presetKey = String(fields.custom.preset[customAssetId]?.value || "").trim();
    const preset = ASSET_TREATMENT_PRESETS[presetKey];

    if (!preset || presetKey === "custom") {
      syncTaxTreatmentPill(fields.custom.taxTreatment[customAssetId], preset?.taxTreatment || "custom");
      syncCustomAssetTreatmentPreview(fields, customAssetId);
      return;
    }

    if (fields.custom.include[customAssetId]) {
      fields.custom.include[customAssetId].checked = Boolean(preset.include);
    }
    syncTaxTreatmentPill(fields.custom.taxTreatment[customAssetId], preset.taxTreatment);
    if (fields.custom.tax[customAssetId]) {
      fields.custom.tax[customAssetId].value = formatHaircutInputValue(preset.taxDragPercent);
    }
    if (fields.custom.haircut[customAssetId]) {
      fields.custom.haircut[customAssetId].value = formatHaircutInputValue(preset.liquidityHaircutPercent);
    }

    syncCustomAssetTreatmentPreview(fields, customAssetId);
  }

  function applyAssetTreatmentProfile(fields, profile, linkedRecord) {
    const normalizedProfile = normalizeAssetDefaultProfile(profile, "custom");
    const profileDefaults = ASSET_TREATMENT_PROFILE_DEFAULTS[normalizedProfile];
    setAssetDefaultProfile(fields, normalizedProfile);

    if (!profileDefaults) {
      return;
    }

    getVisibleAssetTreatmentItemKeys(fields).forEach(function (itemKey) {
      const defaults = profileDefaults.assets[itemKey] || getAssetTreatmentDefaultForKey(itemKey);

      setAssetTreatmentFieldsChecked(fields, "include", itemKey, defaults.include);
      setAssetTreatmentFieldsValue(fields, "preset", itemKey, normalizeAssetTreatmentPreset(
        defaults.treatmentPreset,
        getAssetTreatmentDefaultForKey(itemKey).treatmentPreset
      ));
      getAssetTreatmentFieldList(fields, "taxTreatment", itemKey).forEach(function (field) {
        syncTaxTreatmentPill(field, defaults.taxTreatment);
      });
      setAssetTreatmentGrowthFields(fields, itemKey, createAssetGrowthSavedFields({}, itemKey, normalizedProfile));
      setAssetTreatmentFieldsValue(fields, "tax", itemKey, formatHaircutInputValue(defaults.taxDragPercent));
      setAssetTreatmentFieldsValue(fields, "haircut", itemKey, formatHaircutInputValue(defaults.liquidityHaircutPercent));

      syncAssetTreatmentPreview(fields, itemKey, linkedRecord);
    });

    const customAssetId = DEFAULT_CUSTOM_ASSET_TREATMENT.id;
    const customDefaults = profileDefaults.customAsset || DEFAULT_CUSTOM_ASSET_TREATMENT;
    if (!CUSTOM_ASSET_TREATMENT_USES_PMI_INPUT) {
      syncCustomAssetTreatmentPreview(fields, customAssetId);
      return;
    }

    if (fields.custom.include[customAssetId]) {
      fields.custom.include[customAssetId].checked = Boolean(customDefaults.include);
    }
    if (fields.custom.preset[customAssetId]) {
      fields.custom.preset[customAssetId].value = normalizeAssetTreatmentPreset(
        customDefaults.treatmentPreset,
        DEFAULT_CUSTOM_ASSET_TREATMENT.treatmentPreset
      );
    }
    syncTaxTreatmentPill(fields.custom.taxTreatment[customAssetId], customDefaults.taxTreatment);
    if (fields.custom.tax[customAssetId]) {
      fields.custom.tax[customAssetId].value = formatHaircutInputValue(customDefaults.taxDragPercent);
    }
    if (fields.custom.haircut[customAssetId]) {
      fields.custom.haircut[customAssetId].value = formatHaircutInputValue(customDefaults.liquidityHaircutPercent);
    }
    syncCustomAssetTreatmentPreview(fields, customAssetId);
  }

  function applyExistingCoverageProfile(fields, profile, linkedRecord) {
    const normalizedProfile = normalizeCoverageTreatmentProfile(profile, "custom");
    const profileDefaults = EXISTING_COVERAGE_PROFILE_DEFAULTS[normalizedProfile];
    const current = getExistingCoverageDraftAssumptions(fields);
    setExistingCoverageDefaultProfile(fields, normalizedProfile);

    if (!profileDefaults) {
      fields.currentAssumptions = {
        ...current,
        globalTreatmentProfile: normalizedProfile
      };
      syncExistingCoveragePreview(fields, linkedRecord);
      return;
    }

    const nextAssumptions = {
      ...current,
      globalTreatmentProfile: normalizedProfile,
      groupCoverageTreatment: {
        ...current.groupCoverageTreatment,
        ...profileDefaults.groupCoverageTreatment
      },
      pendingCoverageTreatment: {
        ...current.pendingCoverageTreatment,
        ...profileDefaults.pendingCoverageTreatment
      },
      unknownCoverageTreatment: {
        ...current.unknownCoverageTreatment,
        ...profileDefaults.unknownCoverageTreatment
      }
    };
    fields.currentAssumptions = nextAssumptions;

    setExistingCoverageChecked(fields, "groupCoverageTreatment.include", nextAssumptions.groupCoverageTreatment.include);
    setExistingCoverageValue(
      fields,
      "groupCoverageTreatment.reliabilityDiscountPercent",
      nextAssumptions.groupCoverageTreatment.reliabilityDiscountPercent
    );
    setExistingCoverageChecked(fields, "pendingCoverageTreatment.include", nextAssumptions.pendingCoverageTreatment.include);
    setExistingCoverageChecked(fields, "unknownCoverageTreatment.include", nextAssumptions.unknownCoverageTreatment.include);
    setExistingCoverageValue(
      fields,
      "unknownCoverageTreatment.reliabilityDiscountPercent",
      nextAssumptions.unknownCoverageTreatment.reliabilityDiscountPercent
    );
    syncExistingCoveragePreview(fields, linkedRecord);
  }

  function applyDebtTreatmentProfile(fields, profile, linkedRecord) {
    const normalizedProfile = normalizeDebtTreatmentProfile(profile, "custom");
    const profileDefaults = DEBT_TREATMENT_PROFILE_DEFAULTS[normalizedProfile];
    const current = getDebtTreatmentDraftAssumptions(fields);
    setDebtTreatmentDefaultProfile(fields, normalizedProfile);

    if (!profileDefaults) {
      fields.currentAssumptions = {
        ...current,
        globalTreatmentProfile: normalizedProfile
      };
      syncDebtTreatmentPreview(fields, linkedRecord);
      return;
    }

    const nextAssumptions = {
      ...current,
      schemaVersion: DEBT_TREATMENT_SCHEMA_VERSION,
      globalTreatmentProfile: normalizedProfile,
      mortgageTreatment: {
        ...current.mortgageTreatment,
        ...profileDefaults.mortgageTreatment
      },
      debtCategoryTreatment: {}
    };

    getDebtCategoryTreatmentItems().forEach(function (item) {
      nextAssumptions.debtCategoryTreatment[item.key] = {
        ...(current.debtCategoryTreatment?.[item.key] || {}),
        ...(profileDefaults.debtCategoryTreatment[item.key]
          || DEFAULT_DEBT_TREATMENT_ASSUMPTIONS.debtCategoryTreatment[item.key]
          || createDefaultDebtCategoryTreatment())
      };
    });

    populateDebtTreatmentFields(fields, nextAssumptions, linkedRecord);
  }

  function applySurvivorSupportProfile(fields, profile, linkedRecord) {
    const normalizedProfile = normalizeSurvivorSupportProfile(profile, "custom");
    const profileDefaults = SURVIVOR_SUPPORT_PROFILE_DEFAULTS[normalizedProfile];
    const current = getSurvivorSupportDraftAssumptions(fields);
    setSurvivorSupportDefaultProfile(fields, normalizedProfile);

    if (!profileDefaults) {
      fields.currentAssumptions = {
        ...current,
        globalTreatmentProfile: normalizedProfile
      };
      syncSurvivorSupportPreview(fields, linkedRecord);
      return;
    }

    const nextAssumptions = {
      ...current,
      globalTreatmentProfile: normalizedProfile,
      survivorIncomeTreatment: {
        ...current.survivorIncomeTreatment,
        ...profileDefaults.survivorIncomeTreatment,
        includeSurvivorIncome: current.survivorIncomeTreatment.includeSurvivorIncome
      },
      survivorScenario: {
        ...current.survivorScenario,
        ...profileDefaults.survivorScenario
      },
      supportTreatment: {
        ...current.supportTreatment,
        ...profileDefaults.supportTreatment,
        includeEssentialSupport: current.supportTreatment.includeEssentialSupport,
        includeDiscretionarySupport: current.supportTreatment.includeDiscretionarySupport,
        includeTransitionNeeds: current.supportTreatment.includeTransitionNeeds
      },
      riskFlags: {
        ...current.riskFlags,
        ...profileDefaults.riskFlags
      }
    };

    populateSurvivorSupportFields(fields, nextAssumptions, linkedRecord);
  }

  function applyEducationProfile(fields, profile, linkedRecord) {
    const normalizedProfile = normalizeEducationProfile(profile, "custom");
    const profileDefaults = EDUCATION_PROFILE_DEFAULTS[normalizedProfile];
    const current = getEducationDraftAssumptions(fields);
    setEducationDefaultProfile(fields, normalizedProfile);

    if (!profileDefaults) {
      fields.currentAssumptions = {
        ...current,
        globalTreatmentProfile: normalizedProfile
      };
      syncEducationPreview(fields, linkedRecord);
      return;
    }

    const nextAssumptions = {
      ...current,
      globalTreatmentProfile: normalizedProfile,
      fundingTreatment: {
        ...current.fundingTreatment,
        ...profileDefaults.fundingTreatment,
        useExistingEducationSavingsOffset: false
      },
      educationSavingsTreatment: {
        existingEducationSavingsValue: null,
        includeAsOffset: false,
        taxDragPercent: 0,
        liquidityHaircutPercent: 0
      },
      riskFlags: {
        ...current.riskFlags,
        ...profileDefaults.riskFlags
      }
    };

    populateEducationFields(fields, nextAssumptions, linkedRecord);
  }

  function applyRecommendationProfile(fields, profile) {
    const normalizedProfile = normalizeRecommendationProfile(profile, "custom");
    const profileDefaults = RECOMMENDATION_PROFILE_DEFAULTS[normalizedProfile];
    const current = getRecommendationDraftGuardrails(fields);
    setRecommendationDefaultProfile(fields, normalizedProfile);

    if (!profileDefaults) {
      fields.currentAssumptions = {
        ...current,
        recommendationProfile: normalizedProfile
      };
      syncRecommendationPreview(fields);
      return;
    }

    const nextGuardrails = {
      ...current,
      recommendationProfile: normalizedProfile,
      riskThresholds: {
        assetReliance: {
          ...current.riskThresholds.assetReliance,
          ...profileDefaults.riskThresholds.assetReliance
        },
        illiquidAssetReliance: {
          ...current.riskThresholds.illiquidAssetReliance,
          ...profileDefaults.riskThresholds.illiquidAssetReliance
        },
        survivorIncomeReliance: {
          ...current.riskThresholds.survivorIncomeReliance,
          ...profileDefaults.riskThresholds.survivorIncomeReliance
        }
      },
      riskFlags: {
        ...current.riskFlags,
        ...profileDefaults.riskFlags
      }
    };

    populateRecommendationGuardrailFields(fields, nextGuardrails);
  }

  function readValidatedAssumptions(fields) {
    const nextAssumptions = {
      enabled: Boolean(fields.enabled?.checked)
    };

    for (let index = 0; index < RATE_FIELDS.length; index += 1) {
      const fieldName = RATE_FIELDS[index];
      const field = fields[fieldName];
      const rawValue = String(field?.value || "").trim();
      const label = RATE_LABELS[fieldName];

      if (!rawValue) {
        return {
          error: `${label} is required. Enter a value from ${MIN_RATE}% to ${MAX_RATE}%.`
        };
      }

      const number = Number(rawValue);
      if (!Number.isFinite(number)) {
        return {
          error: `${label} must be a numeric percentage.`
        };
      }

      if (number < MIN_RATE || number > MAX_RATE) {
        return {
          error: `${label} must be between ${MIN_RATE}% and ${MAX_RATE}%.`
        };
      }

      nextAssumptions[fieldName] = Number(number.toFixed(2));
    }

    const targetAgeField = fields[FINAL_EXPENSE_TARGET_AGE_FIELD];
    if (targetAgeField) {
      const rawTargetAge = String(targetAgeField.value || "").trim();
      if (!rawTargetAge) {
        return {
          error: `Final expense target age is required. Enter a value from ${MIN_FINAL_EXPENSE_TARGET_AGE} to ${MAX_FINAL_EXPENSE_TARGET_AGE}.`
        };
      }

      const targetAge = Number(rawTargetAge);
      if (!Number.isFinite(targetAge)) {
        return {
          error: "Final expense target age must be numeric."
        };
      }

      if (targetAge < MIN_FINAL_EXPENSE_TARGET_AGE || targetAge > MAX_FINAL_EXPENSE_TARGET_AGE) {
        return {
          error: `Final expense target age must be between ${MIN_FINAL_EXPENSE_TARGET_AGE} and ${MAX_FINAL_EXPENSE_TARGET_AGE}.`
        };
      }

      nextAssumptions.finalExpenseTargetAge = Number(targetAge.toFixed(2));
    } else {
      nextAssumptions.finalExpenseTargetAge = DEFAULT_INFLATION_ASSUMPTIONS.finalExpenseTargetAge;
    }

    return {
      value: {
        ...nextAssumptions,
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readValidatedHealthcareExpenseAssumptions(fields) {
    const rawProjectionYears = String(fields.projectionYears?.value || "").trim();
    const projectionYears = normalizeHealthcareProjectionYearsValue(
      rawProjectionYears,
      DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.projectionYears
    );

    return {
      value: {
        enabled: Boolean(fields.enabled?.checked),
        projectionYears,
        includeOneTimeHealthcareExpenses: Boolean(fields.includeOneTimeHealthcareExpenses?.checked),
        oneTimeProjectionMode: DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS.oneTimeProjectionMode,
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readValidatedMethodDefaults(fields) {
    const nextDefaults = {};

    for (let index = 0; index < METHOD_DEFAULT_FIELDS.length; index += 1) {
      const fieldName = METHOD_DEFAULT_FIELDS[index];
      const field = fields[fieldName];
      const rawValue = String(field?.value || "").trim();
      const label = METHOD_DEFAULT_LABELS[fieldName];

      if (!rawValue) {
        return {
          error: `${label} is required. Enter a value from ${MIN_METHOD_YEARS} to ${MAX_METHOD_YEARS}.`
        };
      }

      const number = Number(rawValue);
      if (!Number.isFinite(number)) {
        return {
          error: `${label} must be a numeric year value.`
        };
      }

      if (!Number.isInteger(number)) {
        return {
          error: `${label} must be a whole number of years.`
        };
      }

      if (number < MIN_METHOD_YEARS || number > MAX_METHOD_YEARS) {
        return {
          error: `${label} must be between ${MIN_METHOD_YEARS} and ${MAX_METHOD_YEARS}.`
        };
      }

      nextDefaults[fieldName] = number;
    }

    nextDefaults.assetOffsetSource = getAnalysisSetupAssetOffsetSource();
    nextDefaults.needsIncludeOffsetAssets = fields.needsIncludeOffsetAssets
      ? Boolean(fields.needsIncludeOffsetAssets.checked)
      : DEFAULT_METHOD_DEFAULTS.needsIncludeOffsetAssets;

    return {
      value: {
        dimeIncomeYears: nextDefaults.dimeIncomeYears,
        needsSupportYears: nextDefaults.needsSupportYears,
        hlvProjectionYears: nextDefaults.hlvProjectionYears,
        needsIncludeOffsetAssets: nextDefaults.needsIncludeOffsetAssets,
        assetOffsetSource: nextDefaults.assetOffsetSource,
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readValidatedGrowthAndReturnAssumptions(fields) {
    const nextAssumptions = {
      enabled: Boolean(fields.enabled?.checked),
      returnBasis: normalizeGrowthReturnBasis(
        fields.returnBasis?.value,
        DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS.returnBasis
      )
    };

    for (let index = 0; index < GROWTH_RATE_FIELDS.length; index += 1) {
      const fieldName = GROWTH_RATE_FIELDS[index];
      const field = fields[fieldName];
      const rawValue = String(field?.value || "").trim();
      const label = GROWTH_RATE_LABELS[fieldName];

      if (!rawValue) {
        return {
          error: `${label} is required. Enter a value from ${MIN_GROWTH_RATE}% to ${MAX_GROWTH_RATE}%.`
        };
      }

      const number = Number(rawValue);
      if (!Number.isFinite(number)) {
        return {
          error: `${label} must be a numeric percentage.`
        };
      }

      if (number < MIN_GROWTH_RATE || number > MAX_GROWTH_RATE) {
        return {
          error: `${label} must be between ${MIN_GROWTH_RATE}% and ${MAX_GROWTH_RATE}%.`
        };
      }

      nextAssumptions[fieldName] = Number(number.toFixed(2));
    }

    return {
      value: {
        ...nextAssumptions,
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readOptionalPolicyReturnPercent(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return {
        value: POLICY_TYPE_RETURN_REQUIRED_ZERO_FIELDS.includes(fieldPath) ? 0 : null
      };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_RECOMMENDATION_PERCENT || number > MAX_RECOMMENDATION_PERCENT) {
      return {
        error: `${label} must be between ${MIN_RECOMMENDATION_PERCENT}% and ${MAX_RECOMMENDATION_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readValidatedPolicyTypeReturnAssumptions(fields) {
    const profile = normalizePolicyReturnProfile(
      fields.profile?.value,
      DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS.profile
    );
    if (!POLICY_RETURN_PROFILE_KEYS.includes(profile)) {
      return {
        error: "Policy Type Return Assumptions profile must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const values = {};
    const fieldPaths = Object.keys(POLICY_TYPE_RETURN_FIELD_LABELS);
    for (let index = 0; index < fieldPaths.length; index += 1) {
      const fieldPath = fieldPaths[index];
      const fieldResult = readOptionalPolicyReturnPercent(
        fields,
        fieldPath,
        POLICY_TYPE_RETURN_FIELD_LABELS[fieldPath]
      );
      if (fieldResult.error) {
        return fieldResult;
      }
      values[fieldPath] = fieldResult.value;
    }

    return {
      value: {
        enabled: Boolean(fields.enabled?.checked),
        profile,
        termLife: {
          cashValueReturnPercent: values["termLife.cashValueReturnPercent"]
        },
        wholeLife: {
          guaranteedGrowthPercent: values["wholeLife.guaranteedGrowthPercent"],
          dividendCreditPercent: values["wholeLife.dividendCreditPercent"]
        },
        universalLife: {
          currentCreditingPercent: values["universalLife.currentCreditingPercent"],
          guaranteedCreditingPercent: values["universalLife.guaranteedCreditingPercent"]
        },
        indexedUniversalLife: {
          assumedCreditingPercent: values["indexedUniversalLife.assumedCreditingPercent"],
          capRatePercent: values["indexedUniversalLife.capRatePercent"],
          participationRatePercent: values["indexedUniversalLife.participationRatePercent"],
          floorRatePercent: values["indexedUniversalLife.floorRatePercent"]
        },
        variableUniversalLife: {
          grossReturnPercent: values["variableUniversalLife.grossReturnPercent"],
          netReturnPercent: values["variableUniversalLife.netReturnPercent"]
        },
        source: "analysis-setup",
        lastUpdatedAt: new Date().toISOString()
      }
    };
  }

  function readValidatedAssetTreatmentAssumptions(fields) {
    const sourceDrivenEnabled = getAnalysisSetupAssetOffsetSource() === ASSET_OFFSET_SOURCE_TREATED;
    const defaultProfile = getAssetDefaultProfile(fields);
    if (!ASSET_TREATMENT_DEFAULT_PROFILE_KEYS.includes(defaultProfile)) {
      return {
        error: "Asset Treatment default settings must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const currentAssumptions = isPlainObject(fields.currentAssumptions)
      ? fields.currentAssumptions
      : DEFAULT_ASSET_TREATMENT_ASSUMPTIONS;
    const currentAssets = isPlainObject(currentAssumptions.assets)
      ? currentAssumptions.assets
      : {};
    const nextAssumptions = {
      enabled: sourceDrivenEnabled,
      defaultProfile,
      assets: {},
      customAssets: Array.isArray(currentAssumptions.customAssets)
        ? currentAssumptions.customAssets.map(function (asset) {
          return isPlainObject(asset) ? { ...asset } : asset;
        })
        : DEFAULT_ASSET_TREATMENT_ASSUMPTIONS.customAssets.map(function (asset) {
          return { ...asset };
        }),
      assetGrowthProjectionAssumptions: readAssetGrowthProjectionAssumptionsFromFields(
        fields,
        currentAssumptions
      )
    };

    ASSET_TREATMENT_ITEMS.forEach(function (item) {
      const currentAsset = isPlainObject(currentAssets[item.key])
        ? currentAssets[item.key]
        : getAssetTreatmentDefaultForKey(item.key);
      nextAssumptions.assets[item.key] = {
        ...currentAsset,
        ...createAssetGrowthSavedFields(currentAsset, item.key, defaultProfile, {
          preserveTaxonomyDefault: false
        })
      };
    });

    const visibleItemKeys = getVisibleAssetTreatmentItemKeys(fields);
    for (let index = 0; index < visibleItemKeys.length; index += 1) {
      const itemKey = visibleItemKeys[index];
      const item = getAssetTreatmentItemByKey(itemKey) || { key: itemKey, label: itemKey };
      const preset = String(getAssetTreatmentField(fields, "preset", itemKey)?.value || "").trim();
      const rawTax = String(getAssetTreatmentField(fields, "tax", itemKey)?.value || "").trim();
      const rawHaircut = String(getAssetTreatmentField(fields, "haircut", itemKey)?.value || "").trim();

      if (!ASSET_TREATMENT_PRESET_KEYS.includes(preset)) {
        return {
          error: `${item.label} treatment must be a valid preset.`
        };
      }

      if (!rawTax) {
        return {
          error: `${item.label} tax is required. Enter a value from ${MIN_ASSET_TREATMENT_PERCENT}% to ${MAX_ASSET_TREATMENT_PERCENT}%.`
        };
      }

      if (!rawHaircut) {
        return {
          error: `${item.label} haircut is required. Enter a value from ${MIN_ASSET_TREATMENT_PERCENT}% to ${MAX_ASSET_TREATMENT_PERCENT}%.`
        };
      }

      const tax = Number(rawTax);
      const haircut = Number(rawHaircut);
      if (!Number.isFinite(tax)) {
        return {
          error: `${item.label} tax must be a numeric percentage.`
        };
      }

      if (!Number.isFinite(haircut)) {
        return {
          error: `${item.label} haircut must be a numeric percentage.`
        };
      }

      if (tax < MIN_ASSET_TREATMENT_PERCENT || tax > MAX_ASSET_TREATMENT_PERCENT) {
        return {
          error: `${item.label} tax must be between ${MIN_ASSET_TREATMENT_PERCENT}% and ${MAX_ASSET_TREATMENT_PERCENT}%.`
        };
      }

      if (haircut < MIN_ASSET_TREATMENT_PERCENT || haircut > MAX_ASSET_TREATMENT_PERCENT) {
        return {
          error: `${item.label} haircut must be between ${MIN_ASSET_TREATMENT_PERCENT}% and ${MAX_ASSET_TREATMENT_PERCENT}%.`
        };
      }

      const currentAsset = isPlainObject(currentAssets[item.key])
        ? currentAssets[item.key]
        : getAssetTreatmentDefaultForKey(item.key);
      nextAssumptions.assets[item.key] = {
        include: Boolean(getAssetTreatmentField(fields, "include", itemKey)?.checked),
        treatmentPreset: preset,
        taxTreatment: normalizeTaxTreatment(
          ASSET_TREATMENT_PRESETS[preset]?.taxTreatment,
          "custom"
        ),
        taxDragPercent: Number(tax.toFixed(2)),
        liquidityHaircutPercent: Number(haircut.toFixed(2)),
        ...readVisibleAssetGrowthSavedFields(fields, item.key, currentAsset, defaultProfile)
      };
    }

    const customAssetId = DEFAULT_CUSTOM_ASSET_TREATMENT.id;
    if (!fields.custom.label[customAssetId]) {
      return {
        value: {
          ...nextAssumptions,
          lastUpdatedAt: new Date().toISOString(),
          source: "analysis-setup"
        }
      };
    }

    const customLabel = String(fields.custom.label[customAssetId]?.value || "").trim();
    const rawCustomValue = String(fields.custom.value[customAssetId]?.value || "").trim();
    const customPreset = String(fields.custom.preset[customAssetId]?.value || "").trim();
    const rawCustomTax = String(fields.custom.tax[customAssetId]?.value || "").trim();
    const rawCustomHaircut = String(fields.custom.haircut[customAssetId]?.value || "").trim();
    const customInclude = Boolean(fields.custom.include[customAssetId]?.checked);

    if (!ASSET_TREATMENT_PRESET_KEYS.includes(customPreset)) {
      return {
        error: "Other / Custom Asset treatment must be a valid preset."
      };
    }

    if (!rawCustomTax) {
      return {
        error: "Other / Custom Asset tax drag is required. Enter a value from 0% to 100%."
      };
    }

    if (!rawCustomHaircut) {
      return {
        error: "Other / Custom Asset haircut is required. Enter a value from 0% to 100%."
      };
    }

    const customTax = Number(rawCustomTax);
    const customHaircut = Number(rawCustomHaircut);
    if (!Number.isFinite(customTax)) {
      return {
        error: "Other / Custom Asset tax drag must be a numeric percentage."
      };
    }

    if (!Number.isFinite(customHaircut)) {
      return {
        error: "Other / Custom Asset haircut must be a numeric percentage."
      };
    }

    if (customTax < MIN_ASSET_TREATMENT_PERCENT || customTax > MAX_ASSET_TREATMENT_PERCENT) {
      return {
        error: "Other / Custom Asset tax drag must be between 0% and 100%."
      };
    }

    if (customHaircut < MIN_ASSET_TREATMENT_PERCENT || customHaircut > MAX_ASSET_TREATMENT_PERCENT) {
      return {
        error: "Other / Custom Asset haircut must be between 0% and 100%."
      };
    }

    const customEstimatedValue = rawCustomValue ? Number(rawCustomValue.replace(/[$,\s]/g, "")) : null;
    if (rawCustomValue && (!Number.isFinite(customEstimatedValue) || customEstimatedValue < 0)) {
      return {
        error: "Other / Custom Asset estimated value must be a non-negative number."
      };
    }

    if ((customInclude || rawCustomValue) && !customLabel) {
      return {
        error: "Other / Custom Asset label is required when the custom row is used."
      };
    }

    nextAssumptions.customAssets = [
      {
        id: customAssetId,
        label: customLabel || DEFAULT_CUSTOM_ASSET_TREATMENT.label,
        estimatedValue: customEstimatedValue,
        include: customInclude,
        treatmentPreset: customPreset,
        taxTreatment: normalizeTaxTreatment(
          ASSET_TREATMENT_PRESETS[customPreset]?.taxTreatment,
          "custom"
        ),
        taxDragPercent: Number(customTax.toFixed(2)),
        liquidityHaircutPercent: Number(customHaircut.toFixed(2))
      }
    ];

    return {
      value: {
        ...nextAssumptions,
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readRequiredCoverageTreatmentPercent(fields, fieldPath, label, fallback) {
    const field = fields.values?.[fieldPath];
    if (!field) {
      return { value: fallback };
    }

    const rawValue = String(field.value || "").trim();
    if (!rawValue) {
      return {
        error: `${label} is required. Enter a value from ${MIN_COVERAGE_TREATMENT_PERCENT}% to ${MAX_COVERAGE_TREATMENT_PERCENT}%.`
      };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_COVERAGE_TREATMENT_PERCENT || number > MAX_COVERAGE_TREATMENT_PERCENT) {
      return {
        error: `${label} must be between ${MIN_COVERAGE_TREATMENT_PERCENT}% and ${MAX_COVERAGE_TREATMENT_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readOptionalCoverageTermGuardrail(fields) {
    const field = fields.values?.["individualTermTreatment.excludeIfExpiresWithinYears"];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return { value: null };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: "Term expiration guardrail must be a numeric year value."
      };
    }

    if (number < MIN_COVERAGE_TERM_GUARDRAIL_YEARS || number > MAX_COVERAGE_TERM_GUARDRAIL_YEARS) {
      return {
        error: `Term expiration guardrail must be between ${MIN_COVERAGE_TERM_GUARDRAIL_YEARS} and ${MAX_COVERAGE_TERM_GUARDRAIL_YEARS} years.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readValidatedExistingCoverageAssumptions(fields) {
    const defaultProfile = getExistingCoverageDefaultProfile(fields);
    if (!COVERAGE_TREATMENT_PROFILE_KEYS.includes(defaultProfile)) {
      return {
        error: "Existing Coverage Treatment default settings must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const current = getExistingCoverageDraftAssumptions(fields);
    const groupDiscount = readRequiredCoverageTreatmentPercent(
      fields,
      "groupCoverageTreatment.reliabilityDiscountPercent",
      "Group / employer coverage reliability discount",
      current.groupCoverageTreatment.reliabilityDiscountPercent
    );
    if (groupDiscount.error) {
      return groupDiscount;
    }

    const unknownDiscount = readRequiredCoverageTreatmentPercent(
      fields,
      "unknownCoverageTreatment.reliabilityDiscountPercent",
      "Unknown coverage reliability discount",
      current.unknownCoverageTreatment.reliabilityDiscountPercent
    );
    if (unknownDiscount.error) {
      return unknownDiscount;
    }

    const termGuardrail = readOptionalCoverageTermGuardrail(fields);
    if (termGuardrail.error) {
      return termGuardrail;
    }

    const currentIndividualTermTreatment = current.individualTermTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment;
    const currentPermanentTreatment = current.permanentCoverageTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.permanentCoverageTreatment;
    const currentPendingTreatment = current.pendingCoverageTreatment || DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.pendingCoverageTreatment;
    return {
      value: {
        enabled: false,
        globalTreatmentProfile: defaultProfile,
        includeExistingCoverage: readExistingCoverageDraftBoolean(
          fields,
          "includeExistingCoverage",
          current.includeExistingCoverage
        ),
        groupCoverageTreatment: {
          include: readExistingCoverageDraftBoolean(
            fields,
            "groupCoverageTreatment.include",
            current.groupCoverageTreatment?.include
          ),
          reliabilityDiscountPercent: groupDiscount.value,
          portabilityRequired: Boolean(current.groupCoverageTreatment?.portabilityRequired)
        },
        individualTermTreatment: {
          include: Boolean(currentIndividualTermTreatment.include),
          reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
            currentIndividualTermTreatment.reliabilityDiscountPercent,
            DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.individualTermTreatment.reliabilityDiscountPercent
          ),
          excludeIfExpiresWithinYears: termGuardrail.value
        },
        permanentCoverageTreatment: {
          include: Boolean(currentPermanentTreatment.include),
          reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
            currentPermanentTreatment.reliabilityDiscountPercent,
            DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.permanentCoverageTreatment.reliabilityDiscountPercent
          )
        },
        pendingCoverageTreatment: {
          include: readExistingCoverageDraftBoolean(
            fields,
            "pendingCoverageTreatment.include",
            currentPendingTreatment.include
          ),
          reliabilityDiscountPercent: normalizeCoverageTreatmentPercent(
            currentPendingTreatment.reliabilityDiscountPercent,
            DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS.pendingCoverageTreatment.reliabilityDiscountPercent
          )
        },
        unknownCoverageTreatment: {
          include: readExistingCoverageDraftBoolean(
            fields,
            "unknownCoverageTreatment.include",
            current.unknownCoverageTreatment?.include
          ),
          reliabilityDiscountPercent: unknownDiscount.value
        },
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readRequiredDebtPayoffPercent(field, label) {
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return {
        error: `${label} is required. Enter a value from ${MIN_DEBT_PAYOFF_PERCENT}% to ${MAX_DEBT_PAYOFF_PERCENT}%.`
      };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_DEBT_PAYOFF_PERCENT || number > MAX_DEBT_PAYOFF_PERCENT) {
      return {
        error: `${label} must be between ${MIN_DEBT_PAYOFF_PERCENT}% and ${MAX_DEBT_PAYOFF_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readOptionalDebtSupportYears(field) {
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return { value: null };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: "Mortgage payment support years must be a numeric year value."
      };
    }

    if (number < MIN_DEBT_SUPPORT_YEARS || number > MAX_DEBT_SUPPORT_YEARS) {
      return {
        error: `Mortgage payment support years must be between ${MIN_DEBT_SUPPORT_YEARS} and ${MAX_DEBT_SUPPORT_YEARS}.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readValidatedDebtTreatmentAssumptions(fields) {
    const defaultProfile = getDebtTreatmentDefaultProfile(fields);
    if (!DEBT_TREATMENT_PROFILE_KEYS.includes(defaultProfile)) {
      return {
        error: "Debt & Mortgage Treatment default settings must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const mortgageMode = String(fields.mortgage?.mode?.value || "").trim();
    if (!MORTGAGE_TREATMENT_MODES.includes(mortgageMode)) {
      return {
        error: "Mortgage treatment must be Payoff or Support."
      };
    }

    const mortgagePayoff = readRequiredDebtPayoffPercent(
      fields.mortgage?.payoffPercent,
      "Mortgage payoff percent"
    );
    if (mortgagePayoff.error) {
      return mortgagePayoff;
    }

    const supportYears = readOptionalDebtSupportYears(fields.mortgage?.paymentSupportYears);
    if (supportYears.error) {
      return supportYears;
    }

    const nextAssumptions = {
      schemaVersion: DEBT_TREATMENT_SCHEMA_VERSION,
      enabled: true,
      globalTreatmentProfile: defaultProfile,
      mortgageTreatment: {
        mode: mortgageMode,
        include: Boolean(fields.mortgage?.include?.checked),
        payoffPercent: mortgagePayoff.value,
        paymentSupportYears: supportYears.value
      },
      debtCategoryTreatment: {}
    };

    const debtCategoryTreatmentItems = getDebtCategoryTreatmentItems();
    for (let index = 0; index < debtCategoryTreatmentItems.length; index += 1) {
      const item = debtCategoryTreatmentItems[index];
      const mode = String(fields.mode[item.key]?.value || "").trim();
      if (!DEBT_CATEGORY_TREATMENT_MODES.includes(mode)) {
        return {
          error: `${item.label} treatment mode must be Payoff, Exclude, or Custom.`
        };
      }

      const payoff = readRequiredDebtPayoffPercent(
        fields.payoff[item.key],
        `${item.label} payoff percent`
      );
      if (payoff.error) {
        return payoff;
      }

      nextAssumptions.debtCategoryTreatment[item.key] = {
        include: Boolean(fields.include[item.key]?.checked),
        mode,
        payoffPercent: payoff.value
      };
    }

    return {
      value: {
        ...nextAssumptions,
        source: "analysis-setup"
      }
    };
  }

  function readRequiredSurvivorSupportPercent(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return {
        error: `${label} is required. Enter a value from ${MIN_SURVIVOR_SUPPORT_PERCENT}% to ${MAX_SURVIVOR_SUPPORT_PERCENT}%.`
      };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_SURVIVOR_SUPPORT_PERCENT || number > MAX_SURVIVOR_SUPPORT_PERCENT) {
      return {
        error: `${label} must be between ${MIN_SURVIVOR_SUPPORT_PERCENT}% and ${MAX_SURVIVOR_SUPPORT_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readOptionalSurvivorSupportPercent(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return { value: null };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_SURVIVOR_SUPPORT_PERCENT || number > MAX_SURVIVOR_SUPPORT_PERCENT) {
      return {
        error: `${label} must be between ${MIN_SURVIVOR_SUPPORT_PERCENT}% and ${MAX_SURVIVOR_SUPPORT_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readOptionalSurvivorSupportYears(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return { value: null };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric year value.`
      };
    }

    if (number < MIN_SURVIVOR_SUPPORT_YEARS) {
      return {
        error: `${label} must be ${MIN_SURVIVOR_SUPPORT_YEARS} or greater.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readOptionalSurvivorSupportNonNegativeNumber(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return { value: null };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric value.`
      };
    }

    if (number < 0) {
      return {
        error: `${label} must be 0 or greater.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readValidatedSurvivorSupportAssumptions(fields) {
    const defaultProfile = getSurvivorSupportDefaultProfile(fields);
    if (!SURVIVOR_SUPPORT_PROFILE_KEYS.includes(defaultProfile)) {
      return {
        error: "Survivor & Support Assumptions default settings must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const maxReliance = readRequiredSurvivorSupportPercent(
      fields,
      "survivorIncomeTreatment.maxReliancePercent",
      "Maximum reliance on survivor income"
    );
    if (maxReliance.error) {
      return maxReliance;
    }

    const workReduction = readOptionalSurvivorSupportPercent(
      fields,
      "survivorScenario.expectedSurvivorWorkReductionPercent",
      "Expected survivor work reduction"
    );
    if (workReduction.error) {
      return workReduction;
    }

    const startDelay = readOptionalSurvivorSupportNonNegativeNumber(
      fields,
      "survivorScenario.survivorIncomeStartDelayMonths",
      "Survivor income start delay"
    );
    if (startDelay.error) {
      return startDelay;
    }

    const incomeGrowth = readOptionalSurvivorSupportPercent(
      fields,
      "survivorScenario.survivorEarnedIncomeGrowthRatePercent",
      "Survivor income growth"
    );
    if (incomeGrowth.error) {
      return incomeGrowth;
    }

    const incomeHorizon = readOptionalSurvivorSupportNonNegativeNumber(
      fields,
      "survivorScenario.survivorRetirementHorizonYears",
      "Survivor income horizon"
    );
    if (incomeHorizon.error) {
      return incomeHorizon;
    }

    const supportDuration = readOptionalSurvivorSupportYears(
      fields,
      "supportTreatment.supportDurationYears",
      "Support duration override"
    );
    if (supportDuration.error) {
      return supportDuration;
    }

    const highRelianceThreshold = readRequiredSurvivorSupportPercent(
      fields,
      "riskFlags.highRelianceThresholdPercent",
      "High survivor income reliance threshold"
    );
    if (highRelianceThreshold.error) {
      return highRelianceThreshold;
    }

    const current = getSurvivorSupportDraftAssumptions(fields);
    return {
      value: {
        enabled: false,
        globalTreatmentProfile: defaultProfile,
        survivorIncomeTreatment: {
          includeSurvivorIncome: readSurvivorSupportDraftBoolean(
            fields,
            "survivorIncomeTreatment.includeSurvivorIncome",
            current.survivorIncomeTreatment.includeSurvivorIncome
          ),
          applyStartDelay: readSurvivorSupportDraftBoolean(
            fields,
            "survivorIncomeTreatment.applyStartDelay",
            current.survivorIncomeTreatment.applyStartDelay
          ),
          applyIncomeGrowth: readSurvivorSupportDraftBoolean(
            fields,
            "survivorIncomeTreatment.applyIncomeGrowth",
            current.survivorIncomeTreatment.applyIncomeGrowth
          ),
          maxReliancePercent: maxReliance.value,
          incomeOffsetYears: normalizeSurvivorSupportYears(
            current.survivorIncomeTreatment.incomeOffsetYears,
            DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.survivorIncomeTreatment.incomeOffsetYears
          )
        },
        survivorScenario: {
          survivorContinuesWorking: readSurvivorSupportDraftBooleanOrNull(
            fields,
            "survivorScenario.survivorContinuesWorking",
            current.survivorScenario.survivorContinuesWorking
          ),
          expectedSurvivorWorkReductionPercent: workReduction.value,
          survivorIncomeStartDelayMonths: startDelay.value,
          survivorEarnedIncomeGrowthRatePercent: incomeGrowth.value,
          survivorRetirementHorizonYears: incomeHorizon.value
        },
        supportTreatment: {
          includeEssentialSupport: readSurvivorSupportDraftBoolean(
            fields,
            "supportTreatment.includeEssentialSupport",
            current.supportTreatment.includeEssentialSupport
          ),
          includeDiscretionarySupport: readSurvivorSupportDraftBoolean(
            fields,
            "supportTreatment.includeDiscretionarySupport",
            current.supportTreatment.includeDiscretionarySupport
          ),
          includeTransitionNeeds: readSurvivorSupportDraftBoolean(
            fields,
            "supportTreatment.includeTransitionNeeds",
            current.supportTreatment.includeTransitionNeeds
          ),
          supportDurationYears: supportDuration.value
        },
        riskFlags: {
          flagHighSurvivorIncomeReliance: readSurvivorSupportDraftBoolean(
            fields,
            "riskFlags.flagHighSurvivorIncomeReliance",
            current.riskFlags.flagHighSurvivorIncomeReliance
          ),
          highRelianceThresholdPercent: highRelianceThreshold.value
        },
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readRequiredEducationPercent(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return {
        error: `${label} is required. Enter a value from ${MIN_EDUCATION_PERCENT}% to ${MAX_EDUCATION_PERCENT}%.`
      };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_EDUCATION_PERCENT || number > MAX_EDUCATION_PERCENT) {
      return {
        error: `${label} must be between ${MIN_EDUCATION_PERCENT}% and ${MAX_EDUCATION_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readEducationStartAge(fields) {
    const field = fields.values?.["fundingTreatment.educationStartAge"];
    return {
      value: normalizeEducationStartAge(field?.value, DEFAULT_EDUCATION_START_AGE)
    };
  }

  function readValidatedEducationAssumptions(fields) {
    const defaultProfile = getEducationDefaultProfile(fields);
    if (!EDUCATION_PROFILE_KEYS.includes(defaultProfile)) {
      return {
        error: "Education Assumptions default settings must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const fundingTarget = readRequiredEducationPercent(
      fields,
      "fundingTreatment.fundingTargetPercent",
      "Education funding target percent"
    );
    if (fundingTarget.error) {
      return fundingTarget;
    }

    const educationStartAge = readEducationStartAge(fields);
    const current = getEducationDraftAssumptions(fields);
    return {
      value: {
        enabled: false,
        globalTreatmentProfile: defaultProfile,
        fundingTreatment: {
          includeEducationFunding: readEducationDraftBoolean(
            fields,
            "fundingTreatment.includeEducationFunding",
            current.fundingTreatment.includeEducationFunding
          ),
          fundingTargetPercent: fundingTarget.value,
          educationStartAge: educationStartAge.value,
          includeProjectedDependents: readEducationDraftBoolean(
            fields,
            "fundingTreatment.includeProjectedDependents",
            current.fundingTreatment.includeProjectedDependents
          ),
          applyEducationInflation: readEducationDraftBoolean(
            fields,
            "fundingTreatment.applyEducationInflation",
            current.fundingTreatment.applyEducationInflation
          ),
          useExistingEducationSavingsOffset: false
        },
        educationSavingsTreatment: {
          existingEducationSavingsValue: null,
          includeAsOffset: false,
          taxDragPercent: 0,
          liquidityHaircutPercent: 0
        },
        riskFlags: {
          flagMissingDependentDetails: readEducationDraftBoolean(
            fields,
            "riskFlags.flagMissingDependentDetails",
            current.riskFlags.flagMissingDependentDetails
          ),
          flagProjectedDependentsIncluded: readEducationDraftBoolean(
            fields,
            "riskFlags.flagProjectedDependentsIncluded",
            current.riskFlags.flagProjectedDependentsIncluded
          )
        },
        lastUpdatedAt: new Date().toISOString(),
        source: "analysis-setup"
      }
    };
  }

  function readRequiredRecommendationPercent(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    if (!rawValue) {
      return {
        error: `${label} is required. Enter a value from ${MIN_RECOMMENDATION_PERCENT}% to ${MAX_RECOMMENDATION_PERCENT}%.`
      };
    }

    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      return {
        error: `${label} must be a numeric percentage.`
      };
    }

    if (number < MIN_RECOMMENDATION_PERCENT || number > MAX_RECOMMENDATION_PERCENT) {
      return {
        error: `${label} must be between ${MIN_RECOMMENDATION_PERCENT}% and ${MAX_RECOMMENDATION_PERCENT}%.`
      };
    }

    return {
      value: Number(number.toFixed(2))
    };
  }

  function readRequiredRecommendationRangeSource(fields, fieldPath, label) {
    const field = fields.values?.[fieldPath];
    const rawValue = String(field?.value || "").trim();
    const normalizedSource = normalizeRecommendationRangeSource(rawValue, null);
    if (!normalizedSource) {
      return {
        error: `${label} must be DIME, Needs Analysis, or Human Life Value.`
      };
    }

    return {
      value: normalizedSource
    };
  }

  function readValidatedRecommendationGuardrails(fields) {
    const recommendationProfile = getRecommendationDefaultProfile(fields);
    if (!RECOMMENDATION_PROFILE_KEYS.includes(recommendationProfile)) {
      return {
        error: "Recommendation Guardrails profile must be Conservative, Balanced, Aggressive, or Custom."
      };
    }

    const assetRelianceThreshold = readRequiredRecommendationPercent(
      fields,
      "riskThresholds.assetReliance.warningThresholdPercent",
      "Asset reliance warning threshold"
    );
    if (assetRelianceThreshold.error) {
      return assetRelianceThreshold;
    }

    const illiquidAssetRelianceThreshold = readRequiredRecommendationPercent(
      fields,
      "riskThresholds.illiquidAssetReliance.warningThresholdPercent",
      "Illiquid asset reliance warning threshold"
    );
    if (illiquidAssetRelianceThreshold.error) {
      return illiquidAssetRelianceThreshold;
    }

    const survivorIncomeRelianceThreshold = readRequiredRecommendationPercent(
      fields,
      "riskThresholds.survivorIncomeReliance.warningThresholdPercent",
      "Survivor income reliance warning threshold"
    );
    if (survivorIncomeRelianceThreshold.error) {
      return survivorIncomeRelianceThreshold;
    }

    const lowerBoundSource = readRequiredRecommendationRangeSource(
      fields,
      "rangeConstraints.lowerBound.source",
      "Lower bound source"
    );
    if (lowerBoundSource.error) {
      return lowerBoundSource;
    }

    const lowerBoundTolerance = readRequiredRecommendationPercent(
      fields,
      "rangeConstraints.lowerBound.tolerancePercent",
      "Lower bound tolerance"
    );
    if (lowerBoundTolerance.error) {
      return lowerBoundTolerance;
    }

    const upperBoundSource = readRequiredRecommendationRangeSource(
      fields,
      "rangeConstraints.upperBound.source",
      "Upper bound source"
    );
    if (upperBoundSource.error) {
      return upperBoundSource;
    }

    const upperBoundTolerance = readRequiredRecommendationPercent(
      fields,
      "rangeConstraints.upperBound.tolerancePercent",
      "Upper bound tolerance"
    );
    if (upperBoundTolerance.error) {
      return upperBoundTolerance;
    }

    const current = getRecommendationDraftGuardrails(fields);
    return {
      value: {
        enabled: Boolean(current.enabled),
        source: "analysis-setup",
        lastUpdatedAt: new Date().toISOString(),
        recommendationProfile,
        riskThresholds: {
          assetReliance: {
            warningThresholdPercent: assetRelianceThreshold.value
          },
          illiquidAssetReliance: {
            warningThresholdPercent: illiquidAssetRelianceThreshold.value
          },
          survivorIncomeReliance: {
            warningThresholdPercent: survivorIncomeRelianceThreshold.value
          }
        },
        rangeConstraints: {
          lowerBound: {
            source: lowerBoundSource.value,
            tolerancePercent: lowerBoundTolerance.value
          },
          upperBound: {
            source: upperBoundSource.value,
            tolerancePercent: upperBoundTolerance.value
          },
          conflictHandling: normalizeRecommendationConflictHandling(
            current.rangeConstraints.conflictHandling,
            DEFAULT_RECOMMENDATION_GUARDRAILS.rangeConstraints.conflictHandling
          )
        },
        riskFlags: {
          flagMissingCriticalInputs: readRecommendationDraftBoolean(
            fields,
            "riskFlags.flagMissingCriticalInputs",
            current.riskFlags.flagMissingCriticalInputs
          ),
          flagHeavyAssetReliance: readRecommendationDraftBoolean(
            fields,
            "riskFlags.flagHeavyAssetReliance",
            current.riskFlags.flagHeavyAssetReliance
          ),
          flagHeavySurvivorIncomeReliance: readRecommendationDraftBoolean(
            fields,
            "riskFlags.flagHeavySurvivorIncomeReliance",
            current.riskFlags.flagHeavySurvivorIncomeReliance
          ),
          flagGroupCoverageReliance: readRecommendationDraftBoolean(
            fields,
            "riskFlags.flagGroupCoverageReliance",
            current.riskFlags.flagGroupCoverageReliance
          )
        }
      }
    };
  }

  function saveAnalysisSetupSettings(fields, sliders, healthcareExpenseFields, methodFields, growthFields, growthSliders, policyReturnFields, assetTreatmentFields, existingCoverageFields, debtTreatmentFields, survivorSupportFields, educationFields, recommendationGuardrailFields, linkedRecord, validationMessage, statusMessage) {
    const clientRecords = LensApp.clientRecords || {};
    const shouldSaveHealthcareExpense = hasHealthcareExpenseFields(healthcareExpenseFields);
    const shouldSavePolicyReturns = hasPolicyTypeReturnFields(policyReturnFields);
    const shouldSaveAssetTreatment = hasAssetTreatmentFields(assetTreatmentFields);
    const shouldSaveExistingCoverage = hasExistingCoverageFields(existingCoverageFields);
    const shouldSaveDebtTreatment = hasDebtTreatmentFields(debtTreatmentFields);
    const shouldSaveSurvivorSupport = hasSurvivorSupportFields(survivorSupportFields);
    const shouldSaveEducation = hasEducationFields(educationFields);
    const shouldSaveRecommendationGuardrails = hasRecommendationGuardrailFields(recommendationGuardrailFields);

    RATE_FIELDS.forEach(function (fieldName) {
      syncSliderFromNumber(fields, sliders, fieldName, true);
    });

    const finalExpenseTargetAgeField = fields[FINAL_EXPENSE_TARGET_AGE_FIELD];
    const finalExpenseTargetAgeRaw = String(finalExpenseTargetAgeField?.value || "").trim();
    const finalExpenseTargetAgeNumber = Number(finalExpenseTargetAgeRaw);
    if (
      finalExpenseTargetAgeField
      && finalExpenseTargetAgeRaw
      && Number.isFinite(finalExpenseTargetAgeNumber)
      && finalExpenseTargetAgeNumber >= MIN_FINAL_EXPENSE_TARGET_AGE
      && finalExpenseTargetAgeNumber <= MAX_FINAL_EXPENSE_TARGET_AGE
    ) {
      finalExpenseTargetAgeField.value = formatHaircutInputValue(finalExpenseTargetAgeNumber);
    }

    resetHlvProjectionYearsToDefault(methodFields, linkedRecord);
    if (shouldSaveHealthcareExpense) {
      clampHealthcareExpenseProjectionYearsField(healthcareExpenseFields);
    }

    METHOD_DEFAULT_FIELDS.forEach(function (fieldName) {
      const field = methodFields[fieldName];
      const rawValue = String(field?.value || "").trim();
      const number = Number(rawValue);
      if (field && rawValue && Number.isFinite(number) && number >= MIN_METHOD_YEARS && number <= MAX_METHOD_YEARS) {
        field.value = formatHaircutInputValue(number);
      }
    });

    GROWTH_RATE_FIELDS.forEach(function (fieldName) {
      syncGrowthSliderFromNumber(growthFields, growthSliders, fieldName, true);
    });

    if (shouldSavePolicyReturns) {
      Object.keys(policyReturnFields.values || {}).forEach(function (fieldPath) {
        const field = policyReturnFields.values[fieldPath];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        if (
          field
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_RECOMMENDATION_PERCENT
          && number <= MAX_RECOMMENDATION_PERCENT
        ) {
          field.value = formatHaircutInputValue(number);
        }
      });
    }

    if (shouldSaveAssetTreatment) {
      getVisibleAssetTreatmentItemKeys(assetTreatmentFields).forEach(function (itemKey) {
        ["tax", "haircut"].forEach(function (groupName) {
          getAssetTreatmentFieldList(assetTreatmentFields, groupName, itemKey).forEach(function (field) {
            const rawValue = String(field?.value || "").trim();
            const number = Number(rawValue);
            if (
              field
              && rawValue
              && Number.isFinite(number)
              && number >= MIN_ASSET_TREATMENT_PERCENT
              && number <= MAX_ASSET_TREATMENT_PERCENT
            ) {
              field.value = formatHaircutInputValue(number);
            }
          });
        });
      });

      const customAssetId = DEFAULT_CUSTOM_ASSET_TREATMENT.id;
      ["tax", "haircut", "value"].forEach(function (groupName) {
        const field = assetTreatmentFields.custom[groupName][customAssetId];
        const rawValue = String(field?.value || "").trim().replace(/[$,\s]/g, "");
        const number = Number(rawValue);
        const isValidPercent = groupName !== "value"
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_ASSET_TREATMENT_PERCENT
          && number <= MAX_ASSET_TREATMENT_PERCENT;
        const isValidValue = groupName === "value"
          && rawValue
          && Number.isFinite(number)
          && number >= 0;

        if (field && (isValidPercent || isValidValue)) {
          field.value = formatHaircutInputValue(number);
        }
      });
    }

    if (shouldSaveExistingCoverage) {
      [
        "groupCoverageTreatment.reliabilityDiscountPercent",
        "unknownCoverageTreatment.reliabilityDiscountPercent",
        "individualTermTreatment.excludeIfExpiresWithinYears"
      ].forEach(function (fieldPath) {
        const field = existingCoverageFields.values[fieldPath];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        const maxValue = fieldPath === "individualTermTreatment.excludeIfExpiresWithinYears"
          ? MAX_COVERAGE_TERM_GUARDRAIL_YEARS
          : MAX_COVERAGE_TREATMENT_PERCENT;
        if (
          field
          && rawValue
          && Number.isFinite(number)
          && number >= 0
          && number <= maxValue
        ) {
          field.value = formatHaircutInputValue(number);
        }
      });
    }

    if (shouldSaveDebtTreatment) {
      ["payoffPercent", "paymentSupportYears"].forEach(function (fieldName) {
        const field = debtTreatmentFields.mortgage[fieldName];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        const maxValue = fieldName === "paymentSupportYears" ? MAX_DEBT_SUPPORT_YEARS : MAX_DEBT_PAYOFF_PERCENT;
        if (field && rawValue && Number.isFinite(number) && number >= 0 && number <= maxValue) {
          field.value = formatHaircutInputValue(number);
        }
      });

      getDebtCategoryTreatmentItems().forEach(function (item) {
        const field = debtTreatmentFields.payoff[item.key];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        if (
          field
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_DEBT_PAYOFF_PERCENT
          && number <= MAX_DEBT_PAYOFF_PERCENT
        ) {
          field.value = formatHaircutInputValue(number);
        }
      });
    }

    if (shouldSaveSurvivorSupport) {
      [
        "survivorIncomeTreatment.maxReliancePercent",
        "survivorScenario.expectedSurvivorWorkReductionPercent",
        "survivorScenario.survivorIncomeStartDelayMonths",
        "survivorScenario.survivorEarnedIncomeGrowthRatePercent",
        "survivorScenario.survivorRetirementHorizonYears",
        "supportTreatment.supportDurationYears",
        "riskFlags.highRelianceThresholdPercent"
      ].forEach(function (fieldPath) {
        const field = survivorSupportFields.values[fieldPath];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        const isPercentField = fieldPath === "survivorIncomeTreatment.maxReliancePercent"
          || fieldPath === "survivorScenario.expectedSurvivorWorkReductionPercent"
          || fieldPath === "survivorScenario.survivorEarnedIncomeGrowthRatePercent"
          || fieldPath === "riskFlags.highRelianceThresholdPercent";
        const isValid = field
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_SURVIVOR_SUPPORT_YEARS
          && (!isPercentField || number <= MAX_SURVIVOR_SUPPORT_PERCENT);
        if (isValid) {
          field.value = formatHaircutInputValue(number);
        }
      });
    }

    if (shouldSaveEducation) {
      [
        "fundingTreatment.fundingTargetPercent",
        "fundingTreatment.educationStartAge"
      ].forEach(function (fieldPath) {
        const field = educationFields.values[fieldPath];
        const rawValue = String(field?.value || "").trim().replace(/[$,\s]/g, "");
        const number = Number(rawValue);
        const isPercentField = fieldPath === "fundingTreatment.fundingTargetPercent";
        const isStartAgeField = fieldPath === "fundingTreatment.educationStartAge";
        const roundedStartAge = isStartAgeField ? Math.round(number) : null;
        const isValid = field
          && rawValue
          && Number.isFinite(number)
          && number >= (isStartAgeField ? MIN_EDUCATION_START_AGE : MIN_EDUCATION_NUMBER)
          && (!isPercentField || number <= MAX_EDUCATION_PERCENT)
          && (!isStartAgeField || (
            roundedStartAge >= MIN_EDUCATION_START_AGE
            && roundedStartAge <= MAX_EDUCATION_START_AGE
          ));
        if (isValid) {
          field.value = isStartAgeField
            ? String(roundedStartAge)
            : formatHaircutInputValue(number);
        }
      });
    }

    if (shouldSaveRecommendationGuardrails) {
      [
        "riskThresholds.assetReliance.warningThresholdPercent",
        "riskThresholds.illiquidAssetReliance.warningThresholdPercent",
        "riskThresholds.survivorIncomeReliance.warningThresholdPercent"
      ].forEach(function (fieldPath) {
        const field = recommendationGuardrailFields.values[fieldPath];
        const rawValue = String(field?.value || "").trim().replace(/[$,\s]/g, "");
        const number = Number(rawValue);
        const isValid = field
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_RECOMMENDATION_PERCENT
          && number <= MAX_RECOMMENDATION_PERCENT;
        if (isValid) {
          field.value = formatHaircutInputValue(number);
        }
      });
    }

    const validatedInflation = readValidatedAssumptions(fields);

    if (validatedInflation.error) {
      setMessage(validationMessage, validatedInflation.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedHealthcareExpense = shouldSaveHealthcareExpense
      ? readValidatedHealthcareExpenseAssumptions(healthcareExpenseFields)
      : null;

    const validatedMethodDefaults = readValidatedMethodDefaults(methodFields);

    if (validatedMethodDefaults.error) {
      setMessage(validationMessage, validatedMethodDefaults.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedGrowth = readValidatedGrowthAndReturnAssumptions(growthFields);

    if (validatedGrowth.error) {
      setMessage(validationMessage, validatedGrowth.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedPolicyReturns = shouldSavePolicyReturns
      ? readValidatedPolicyTypeReturnAssumptions(policyReturnFields)
      : null;

    if (validatedPolicyReturns?.error) {
      setMessage(validationMessage, validatedPolicyReturns.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedAssetTreatment = shouldSaveAssetTreatment
      ? readValidatedAssetTreatmentAssumptions(assetTreatmentFields)
      : null;

    if (validatedAssetTreatment?.error) {
      setMessage(validationMessage, validatedAssetTreatment.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedExistingCoverage = shouldSaveExistingCoverage
      ? readValidatedExistingCoverageAssumptions(existingCoverageFields)
      : null;

    if (validatedExistingCoverage?.error) {
      setMessage(validationMessage, validatedExistingCoverage.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedDebtTreatment = shouldSaveDebtTreatment
      ? readValidatedDebtTreatmentAssumptions(debtTreatmentFields)
      : null;

    if (validatedDebtTreatment?.error) {
      setMessage(validationMessage, validatedDebtTreatment.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedSurvivorSupport = shouldSaveSurvivorSupport
      ? readValidatedSurvivorSupportAssumptions(survivorSupportFields)
      : null;

    if (validatedSurvivorSupport?.error) {
      setMessage(validationMessage, validatedSurvivorSupport.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedEducation = shouldSaveEducation
      ? readValidatedEducationAssumptions(educationFields)
      : null;

    if (validatedEducation?.error) {
      setMessage(validationMessage, validatedEducation.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const validatedRecommendationGuardrails = shouldSaveRecommendationGuardrails
      ? readValidatedRecommendationGuardrails(recommendationGuardrailFields)
      : null;

    if (validatedRecommendationGuardrails?.error) {
      setMessage(validationMessage, validatedRecommendationGuardrails.error, "error");
      setStatus(statusMessage, "Analysis Setup settings were not saved.", "error");
      return null;
    }

    const linkedCaseRef = String(linkedRecord?.caseRef || "").trim();
    if (!linkedCaseRef || typeof clientRecords.updateClientRecordByCaseRef !== "function") {
      setMessage(validationMessage, "Link a client profile before saving Analysis Setup settings.", "error");
      setStatus(statusMessage, "No linked profile available.", "error");
      return null;
    }

    const updatedRecord = clientRecords.updateClientRecordByCaseRef(linkedCaseRef, function (currentRecord) {
      const currentSettings = isPlainObject(currentRecord.analysisSettings)
        ? currentRecord.analysisSettings
        : {};
      const valuationDateResult = resolveAnalysisValuationDateForSave(currentSettings);
      const healthcareExpenseAssumptions = validatedHealthcareExpense?.value || {
        ...getHealthcareExpenseAssumptions({ analysisSettings: currentSettings }),
        source: "analysis-setup"
      };

      return {
        ...currentRecord,
        analysisSettings: {
          ...currentSettings,
          valuationDate: valuationDateResult.valuationDate,
          inflationAssumptions: validatedInflation.value,
          healthcareExpenseAssumptions,
          methodDefaults: validatedMethodDefaults.value,
          growthAndReturnAssumptions: validatedGrowth.value,
          ...(validatedPolicyReturns ? { policyTypeReturnAssumptions: validatedPolicyReturns.value } : {}),
          ...(validatedAssetTreatment ? { assetTreatmentAssumptions: validatedAssetTreatment.value } : {}),
          ...(validatedExistingCoverage ? { existingCoverageAssumptions: validatedExistingCoverage.value } : {}),
          ...(validatedDebtTreatment ? { debtTreatmentAssumptions: validatedDebtTreatment.value } : {}),
          ...(validatedSurvivorSupport ? { survivorSupportAssumptions: validatedSurvivorSupport.value } : {}),
          ...(validatedEducation ? { educationAssumptions: validatedEducation.value } : {}),
          ...(validatedRecommendationGuardrails ? { recommendationGuardrails: validatedRecommendationGuardrails.value } : {})
        }
      };
    });

    if (!updatedRecord) {
      setMessage(validationMessage, "Analysis Setup settings could not be saved to the linked profile.", "error");
      setStatus(statusMessage, "Save failed.", "error");
      return null;
    }

    clientRecords.setLinkedCaseRef?.(updatedRecord.caseRef || linkedCaseRef);
    clientRecords.setLinkedRecordId?.(updatedRecord.id);
    populateFields(fields, getInflationAssumptions(updatedRecord), sliders);
    populateMethodFields(methodFields, getMethodDefaults(updatedRecord));
    populateGrowthFields(growthFields, getGrowthAndReturnAssumptions(updatedRecord), growthSliders);
    if (shouldSavePolicyReturns) {
      populatePolicyTypeReturnFields(policyReturnFields, getPolicyTypeReturnAssumptions(updatedRecord));
    }
    if (shouldSaveAssetTreatment) {
      populateAssetTreatmentFields(assetTreatmentFields, getAssetTreatmentAssumptions(updatedRecord), updatedRecord);
    }
    if (shouldSaveExistingCoverage) {
      populateExistingCoverageFields(existingCoverageFields, getExistingCoverageAssumptions(updatedRecord), updatedRecord);
    }
    if (shouldSaveDebtTreatment) {
      populateDebtTreatmentFields(debtTreatmentFields, getDebtTreatmentAssumptions(updatedRecord), updatedRecord);
    }
    if (shouldSaveSurvivorSupport) {
      populateSurvivorSupportFields(survivorSupportFields, getSurvivorSupportAssumptions(updatedRecord), updatedRecord);
    }
    if (shouldSaveEducation) {
      populateEducationFields(educationFields, getEducationAssumptions(updatedRecord), updatedRecord);
    }
    if (shouldSaveRecommendationGuardrails) {
      populateRecommendationGuardrailFields(recommendationGuardrailFields, getRecommendationGuardrails(updatedRecord));
    }
    setMessage(validationMessage, "", "neutral");
    setStatus(statusMessage, "Analysis Setup settings saved.", "success");
    return updatedRecord;
  }

  function initializeAnalysisSetup() {
    const page = document.querySelector(".analysis-setup-page");
    if (!page) {
      return;
    }

    let linkedRecord = resolveLinkedProfileRecord();
    renderAssetTreatmentRows(linkedRecord);
    renderDebtTreatmentRows();

    const fields = getFieldMap();
    const sliders = getSliderMap();
    const healthcareExpenseFields = getHealthcareExpenseFieldMap();
    const methodFields = getMethodFieldMap();
    const growthFields = getGrowthFieldMap();
    const growthSliders = getGrowthSliderMap();
    const policyReturnFields = getPolicyTypeReturnFieldMap();
    const assetTreatmentFields = getAssetTreatmentFieldMap();
    const existingCoverageFields = getExistingCoverageFieldMap();
    const debtTreatmentFields = getDebtTreatmentFieldMap();
    const survivorSupportFields = getSurvivorSupportFieldMap();
    const educationFields = getEducationFieldMap();
    const recommendationGuardrailFields = getRecommendationGuardrailFieldMap();
    const saveButton = document.querySelector("[data-analysis-setup-save]");
    const applyButton = document.querySelector("[data-analysis-setup-apply]");
    const statusMessage = document.querySelector("[data-analysis-setup-status]");
    const validationMessage = document.querySelector("[data-analysis-setup-validation]");
    const linkedState = document.querySelector("[data-analysis-setup-linked-state]");
    const setupShell = document.querySelector(".analysis-setup-shell");
    const headerToggle = document.querySelector("[data-analysis-setup-header-toggle]");
    const headerToggleLabel = document.querySelector("[data-analysis-setup-header-toggle-label]");
    const viewTabs = Array.from(document.querySelectorAll("[data-analysis-setup-view-tab]"));
    const viewPanels = Array.from(document.querySelectorAll("[data-analysis-setup-view-panel]"));
    const viewGrid = document.querySelector("[data-analysis-setup-view-grid]");
    const syncAnalysisSetupViewFromHash = function (options) {
      setAnalysisSetupView(
        getAnalysisSetupViewFromHash(),
        viewTabs,
        viewPanels,
        viewGrid,
        {
          scrollToView: Boolean(options?.scrollToView),
          instantScroll: Boolean(options?.instantScroll)
        }
      );
    };

    syncAnalysisSetupViewFromHash({
      scrollToView: Boolean(window.location.hash),
      instantScroll: true
    });
    bindAnalysisSetupViewScrollSync(viewTabs, viewPanels, viewGrid);
    viewTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        setAnalysisSetupView(
          tab.getAttribute("data-analysis-setup-view-tab"),
          viewTabs,
          viewPanels,
          viewGrid,
          { updateHash: true, scrollToView: true }
        );
      });
    });
    window.addEventListener("hashchange", function () {
      syncAnalysisSetupViewFromHash({ scrollToView: true });
    });

    populateFields(fields, getInflationAssumptions(linkedRecord), sliders);
    populateHealthcareExpenseFields(healthcareExpenseFields, getHealthcareExpenseAssumptions(linkedRecord));
    populateMethodFields(methodFields, getMethodDefaults(linkedRecord));
    populateGrowthFields(growthFields, getGrowthAndReturnAssumptions(linkedRecord), growthSliders);
    populatePolicyTypeReturnFields(policyReturnFields, getPolicyTypeReturnAssumptions(linkedRecord));
    populateAssetTreatmentFields(assetTreatmentFields, getAssetTreatmentAssumptions(linkedRecord), linkedRecord);
    populateExistingCoverageFields(existingCoverageFields, getExistingCoverageAssumptions(linkedRecord), linkedRecord);
    populateDebtTreatmentFields(debtTreatmentFields, getDebtTreatmentAssumptions(linkedRecord), linkedRecord);
    populateSurvivorSupportFields(survivorSupportFields, getSurvivorSupportAssumptions(linkedRecord), linkedRecord);
    populateEducationFields(educationFields, getEducationAssumptions(linkedRecord), linkedRecord);
    populateRecommendationGuardrailFields(recommendationGuardrailFields, getRecommendationGuardrails(linkedRecord));

    if (setupShell && headerToggle) {
      headerToggle.addEventListener("click", function () {
        const isCollapsed = setupShell.classList.toggle("is-header-collapsed");
        headerToggle.setAttribute("aria-expanded", String(!isCollapsed));
        headerToggle.title = isCollapsed ? "Expand setup header" : "Collapse setup header";
        if (headerToggleLabel) {
          headerToggleLabel.textContent = isCollapsed ? "Expand setup header" : "Collapse setup header";
        }
      });
    }

    if (!linkedRecord) {
      setFieldsDisabled(fields, sliders, true);
      setHealthcareExpenseFieldsDisabled(healthcareExpenseFields, true);
      setMethodFieldsDisabled(methodFields, true);
      setGrowthFieldsDisabled(growthFields, growthSliders, true);
      setPolicyTypeReturnFieldsDisabled(policyReturnFields, true);
      setAssetTreatmentFieldsDisabled(assetTreatmentFields, true);
      setExistingCoverageFieldsDisabled(existingCoverageFields, true);
      setDebtTreatmentFieldsDisabled(debtTreatmentFields, true);
      setSurvivorSupportFieldsDisabled(survivorSupportFields, true);
      setEducationFieldsDisabled(educationFields, true);
      setRecommendationGuardrailFieldsDisabled(recommendationGuardrailFields, true);
      if (saveButton) {
        saveButton.disabled = true;
      }
      if (applyButton) {
        applyButton.disabled = false;
        applyButton.textContent = "Continue";
        applyButton.addEventListener("click", function () {
          window.location.href = "analysis-estimate.html";
        });
      }
      if (linkedState) {
        linkedState.textContent = "No linked profile";
      }
      setStatus(statusMessage, "Settings require a linked profile. Continue without saving.", "error");
      return;
    }

    setFieldsDisabled(fields, sliders, false);
    setHealthcareExpenseFieldsDisabled(healthcareExpenseFields, false);
    setMethodFieldsDisabled(methodFields, false);
    setGrowthFieldsDisabled(growthFields, growthSliders, false);
    setPolicyTypeReturnFieldsDisabled(policyReturnFields, false);
    setAssetTreatmentFieldsDisabled(assetTreatmentFields, false);
    setExistingCoverageFieldsDisabled(existingCoverageFields, false);
    setDebtTreatmentFieldsDisabled(debtTreatmentFields, false);
    setSurvivorSupportFieldsDisabled(survivorSupportFields, false);
    setEducationFieldsDisabled(educationFields, false);
    setRecommendationGuardrailFieldsDisabled(recommendationGuardrailFields, false);
    if (saveButton) {
      saveButton.disabled = false;
    }
    if (applyButton) {
      applyButton.disabled = false;
    }
    if (linkedState) {
      const profileName = String(linkedRecord.displayName || linkedRecord.clientName || "Linked profile").trim();
      linkedState.textContent = profileName;
    }
    setStatus(statusMessage, "Analysis Setup settings save to the linked profile.", "neutral");

    function markUnsaved() {
      setMessage(validationMessage, "", "neutral");
      setStatus(statusMessage, "Unsaved Analysis Setup changes.", "neutral");
    }

    fields.enabled?.addEventListener("change", function () {
      markUnsaved();
    });
    fields.resetButton?.addEventListener("click", function () {
      populateFields(fields, DEFAULT_INFLATION_ASSUMPTIONS, sliders);
      markUnsaved();
    });

    RATE_FIELDS.forEach(function (fieldName) {
      fields[fieldName]?.addEventListener("input", function () {
        syncSliderFromNumber(fields, sliders, fieldName, false);
        markUnsaved();
      });

      fields[fieldName]?.addEventListener("change", function () {
        syncSliderFromNumber(fields, sliders, fieldName, true);
        markUnsaved();
      });

      sliders[fieldName]?.addEventListener("input", function () {
        syncNumberFromSlider(fields, sliders, fieldName);
        markUnsaved();
      });
    });

    fields[FINAL_EXPENSE_TARGET_AGE_FIELD]?.addEventListener("input", markUnsaved);
    fields[FINAL_EXPENSE_TARGET_AGE_FIELD]?.addEventListener("change", function () {
      const rawValue = String(fields[FINAL_EXPENSE_TARGET_AGE_FIELD]?.value || "").trim();
      const number = Number(rawValue);
      if (
        rawValue
        && Number.isFinite(number)
        && number >= MIN_FINAL_EXPENSE_TARGET_AGE
        && number <= MAX_FINAL_EXPENSE_TARGET_AGE
      ) {
        fields[FINAL_EXPENSE_TARGET_AGE_FIELD].value = formatHaircutInputValue(number);
      }
      markUnsaved();
    });

    healthcareExpenseFields.enabled?.addEventListener("change", markUnsaved);
    healthcareExpenseFields.includeOneTimeHealthcareExpenses?.addEventListener("change", markUnsaved);
    healthcareExpenseFields.projectionYears?.addEventListener("input", function () {
      const field = healthcareExpenseFields.projectionYears;
      const sanitizedValue = sanitizeNumericTextValue(field?.value);
      if (field && field.value !== sanitizedValue) {
        field.value = sanitizedValue;
      }
      markUnsaved();
    });
    healthcareExpenseFields.projectionYears?.addEventListener("change", function () {
      clampHealthcareExpenseProjectionYearsField(healthcareExpenseFields);
      markUnsaved();
    });

    METHOD_DEFAULT_FIELDS.forEach(function (fieldName) {
      methodFields[fieldName]?.addEventListener("input", function () {
        const field = methodFields[fieldName];
        const sanitizedValue = sanitizeNumericTextValue(field?.value);
        if (field && field.value !== sanitizedValue) {
          field.value = sanitizedValue;
        }
        markUnsaved();
      });

      methodFields[fieldName]?.addEventListener("change", function () {
        if (fieldName === "hlvProjectionYears") {
          resetHlvProjectionYearsToDefault(methodFields, linkedRecord);
        }

        const field = methodFields[fieldName];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        if (field && rawValue && Number.isFinite(number) && number >= MIN_METHOD_YEARS && number <= MAX_METHOD_YEARS) {
          field.value = formatHaircutInputValue(number);
        }
        markUnsaved();
      });
    });

    methodFields.needsIncludeOffsetAssets?.addEventListener("change", function () {
      markUnsaved();
    });

    methodFields.resetButton?.addEventListener("click", function () {
      populateDefaultMethodFields(methodFields, linkedRecord);
      markUnsaved();
    });

    growthFields.enabled?.addEventListener("change", function () {
      markUnsaved();
    });
    growthFields.returnBasis?.addEventListener("change", function () {
      markUnsaved();
    });
    growthFields.resetButton?.addEventListener("click", function () {
      populateGrowthFields(growthFields, DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS, growthSliders);
      markUnsaved();
    });

    GROWTH_RATE_FIELDS.forEach(function (fieldName) {
      growthFields[fieldName]?.addEventListener("input", function () {
        syncGrowthSliderFromNumber(growthFields, growthSliders, fieldName, false);
        markUnsaved();
      });

      growthFields[fieldName]?.addEventListener("change", function () {
        syncGrowthSliderFromNumber(growthFields, growthSliders, fieldName, true);
        markUnsaved();
      });

      growthSliders[fieldName]?.addEventListener("input", function () {
        syncGrowthNumberFromSlider(growthFields, growthSliders, fieldName);
        markUnsaved();
      });
    });

    policyReturnFields.enabled?.addEventListener("change", markUnsaved);
    policyReturnFields.profile?.addEventListener("change", markUnsaved);
    policyReturnFields.resetButton?.addEventListener("click", function () {
      populatePolicyTypeReturnFields(policyReturnFields, DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS);
      markUnsaved();
    });
    Object.keys(policyReturnFields.values || {}).forEach(function (fieldPath) {
      const field = policyReturnFields.values[fieldPath];
      if (!field) {
        return;
      }

      const syncPolicyReturnChange = function () {
        if (policyReturnFields.profile) {
          policyReturnFields.profile.value = "custom";
        }
        markUnsaved();
      };

      field.addEventListener("input", function () {
        syncPolicyReturnChange();
      });

      field.addEventListener("change", function () {
        const rawValue = String(field.value || "").trim();
        const number = Number(rawValue);
        if (
          rawValue
          && Number.isFinite(number)
          && number >= MIN_RECOMMENDATION_PERCENT
          && number <= MAX_RECOMMENDATION_PERCENT
        ) {
          field.value = formatHaircutInputValue(number);
        }
        syncPolicyReturnChange();
      });
    });

    (existingCoverageFields.defaultProfileButtons || []).forEach(function (button) {
      button.addEventListener("click", function () {
        const profile = String(button.getAttribute("data-analysis-coverage-profile") || "").trim();
        applyExistingCoverageProfile(existingCoverageFields, profile, linkedRecord);
        markUnsaved();
      });
    });

    (debtTreatmentFields.defaultProfileButtons || []).forEach(function (button) {
      button.addEventListener("click", function () {
        const profile = String(button.getAttribute("data-analysis-debt-profile") || "").trim();
        applyDebtTreatmentProfile(debtTreatmentFields, profile, linkedRecord);
        markUnsaved();
      });
    });

    (survivorSupportFields.defaultProfileButtons || []).forEach(function (button) {
      button.addEventListener("click", function () {
        const profile = String(button.getAttribute("data-analysis-survivor-profile") || "").trim();
        applySurvivorSupportProfile(survivorSupportFields, profile, linkedRecord);
        markUnsaved();
      });
    });

    survivorSupportFields.resetButton?.addEventListener("click", function () {
      applySurvivorSupportProfile(
        survivorSupportFields,
        DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS.globalTreatmentProfile,
        linkedRecord
      );
      markUnsaved();
    });

    (educationFields.defaultProfileButtons || []).forEach(function (button) {
      button.addEventListener("click", function () {
        const profile = String(button.getAttribute("data-analysis-education-profile") || "").trim();
        applyEducationProfile(educationFields, profile, linkedRecord);
        markUnsaved();
      });
    });

    (recommendationGuardrailFields.defaultProfileButtons || []).forEach(function (button) {
      button.addEventListener("click", function () {
        const profile = String(button.getAttribute("data-analysis-recommendation-profile") || "").trim();
        applyRecommendationProfile(recommendationGuardrailFields, profile);
        markUnsaved();
      });
    });

    recommendationGuardrailFields.enabled?.addEventListener("change", function () {
      syncRecommendationPreview(recommendationGuardrailFields);
      markUnsaved();
    });

    (assetTreatmentFields.defaultProfileButtons || []).forEach(function (button) {
      button.addEventListener("click", function () {
        const profile = String(button.getAttribute("data-analysis-asset-default-profile") || "").trim();
        applyAssetTreatmentProfile(assetTreatmentFields, profile, linkedRecord);
        markUnsaved();
      });
    });

    assetTreatmentFields.assetGrowthProjection?.mode?.addEventListener("change", function () {
      markUnsaved();
    });
    assetTreatmentFields.assetGrowthProjection?.projectionYears?.addEventListener("input", function () {
      markUnsaved();
    });
    assetTreatmentFields.assetGrowthProjection?.projectionYears?.addEventListener("change", function () {
      clampAssetGrowthProjectionYearsField(assetTreatmentFields);
      markUnsaved();
    });

    Object.keys(existingCoverageFields.values || {}).forEach(function (fieldPath) {
      const fieldsForPath = getExistingCoverageFieldControls(existingCoverageFields, fieldPath);
      if (!fieldsForPath.length) {
        return;
      }

      const syncCoverageChange = function () {
        setExistingCoverageDefaultProfile(existingCoverageFields, "custom");
        syncExistingCoveragePreview(existingCoverageFields, linkedRecord);
        markUnsaved();
      };

      fieldsForPath.forEach(function (field) {
        field.addEventListener("input", function () {
          if (fieldPath === "individualTermTreatment.excludeIfExpiresWithinYears") {
            const sanitizedValue = sanitizeNumericTextValue(field.value);
            if (field.value !== sanitizedValue) {
              field.value = sanitizedValue;
            }
          }
          syncExistingCoverageFieldControls(existingCoverageFields, fieldPath, field);
          syncCoverageChange();
        });

        field.addEventListener("change", function () {
          const rawValue = String(field.value || "").trim();
          const number = Number(rawValue);
          const isTermGuardrail = fieldPath === "individualTermTreatment.excludeIfExpiresWithinYears";
          const maxValue = isTermGuardrail
            ? MAX_COVERAGE_TERM_GUARDRAIL_YEARS
            : MAX_COVERAGE_TREATMENT_PERCENT;
          if (field.type !== "checkbox" && rawValue && Number.isFinite(number) && number >= 0 && number <= maxValue) {
            field.value = formatHaircutInputValue(number);
          }
          syncExistingCoverageFieldControls(existingCoverageFields, fieldPath, field);
          syncCoverageChange();
        });
      });
    });

    Object.keys(debtTreatmentFields.mortgage || {}).forEach(function (fieldName) {
      const field = debtTreatmentFields.mortgage[fieldName];
      if (!field) {
        return;
      }

      const syncDebtChange = function () {
        setDebtTreatmentDefaultProfile(debtTreatmentFields, "custom");
        syncDebtSupportYearsVisibility(debtTreatmentFields);
        syncDebtTreatmentPreview(debtTreatmentFields, linkedRecord);
        markUnsaved();
      };

      field.addEventListener("input", function () {
        if (fieldName === "paymentSupportYears") {
          const sanitizedValue = sanitizeNumericTextValue(field.value);
          if (field.value !== sanitizedValue) {
            field.value = sanitizedValue;
          }
        }
        syncDebtChange();
      });

      field.addEventListener("change", function () {
        if (fieldName === "mode") {
          const mode = String(field.value || "").trim();
          if (mode === "support") {
            if (debtTreatmentFields.mortgage.include) {
              debtTreatmentFields.mortgage.include.checked = false;
            }
            if (debtTreatmentFields.mortgage.payoffPercent) {
              debtTreatmentFields.mortgage.payoffPercent.value = "0";
            }
          } else if (mode === "payoff") {
            if (debtTreatmentFields.mortgage.include) {
              debtTreatmentFields.mortgage.include.checked = true;
            }
            if (debtTreatmentFields.mortgage.payoffPercent) {
              debtTreatmentFields.mortgage.payoffPercent.value = "100";
            }
          }
        }

        const rawValue = String(field.value || "").trim();
        const number = Number(rawValue);
        const maxValue = fieldName === "paymentSupportYears" ? MAX_DEBT_SUPPORT_YEARS : MAX_DEBT_PAYOFF_PERCENT;
        if (field.type !== "checkbox" && rawValue && Number.isFinite(number) && number >= 0 && number <= maxValue) {
          field.value = formatHaircutInputValue(number);
        }
        syncDebtChange();
      });
    });

    getDebtCategoryTreatmentItems().forEach(function (item) {
      const syncDebtRowChange = function () {
        setDebtTreatmentDefaultProfile(debtTreatmentFields, "custom");
        syncDebtTreatmentPreview(debtTreatmentFields, linkedRecord);
        markUnsaved();
      };

      debtTreatmentFields.include[item.key]?.addEventListener("change", syncDebtRowChange);
      debtTreatmentFields.mode[item.key]?.addEventListener("change", function () {
        const mode = String(debtTreatmentFields.mode[item.key]?.value || "").trim();
        if (mode === "exclude") {
          setDebtCategoryChecked(debtTreatmentFields, item.key, false);
          setDebtCategoryValue(debtTreatmentFields, "payoff", item.key, 0);
        } else if (mode === "payoff") {
          setDebtCategoryChecked(debtTreatmentFields, item.key, true);
          setDebtCategoryValue(debtTreatmentFields, "payoff", item.key, 100);
        }
        syncDebtRowChange();
      });
      debtTreatmentFields.payoff[item.key]?.addEventListener("input", syncDebtRowChange);
      debtTreatmentFields.payoff[item.key]?.addEventListener("change", function () {
        const field = debtTreatmentFields.payoff[item.key];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        if (
          field
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_DEBT_PAYOFF_PERCENT
          && number <= MAX_DEBT_PAYOFF_PERCENT
        ) {
          field.value = formatHaircutInputValue(number);
        }
        syncDebtRowChange();
      });
    });

    Object.keys(survivorSupportFields.values || {}).forEach(function (fieldPath) {
      const fieldsForPath = getSurvivorSupportFieldControls(survivorSupportFields, fieldPath);
      if (!fieldsForPath.length) {
        return;
      }

      const syncSurvivorSupportChange = function () {
        setSurvivorSupportDefaultProfile(survivorSupportFields, "custom");
        syncSurvivorSupportPreview(survivorSupportFields, linkedRecord);
        markUnsaved();
      };

      fieldsForPath.forEach(function (field) {
        field.addEventListener("input", function () {
          if (
            fieldPath === "supportTreatment.supportDurationYears"
            || fieldPath === "survivorScenario.survivorIncomeStartDelayMonths"
            || fieldPath === "survivorScenario.survivorRetirementHorizonYears"
          ) {
            const sanitizedValue = sanitizeNumericTextValue(field.value);
            if (field.value !== sanitizedValue) {
              field.value = sanitizedValue;
            }
          }
          syncSurvivorSupportFieldControls(survivorSupportFields, fieldPath, field);
          syncSurvivorSupportChange();
        });

        field.addEventListener("change", function () {
          const rawValue = String(field.value || "").trim();
          const number = Number(rawValue);
          const isPercentField = fieldPath === "survivorIncomeTreatment.maxReliancePercent"
            || fieldPath === "survivorScenario.expectedSurvivorWorkReductionPercent"
            || fieldPath === "survivorScenario.survivorEarnedIncomeGrowthRatePercent"
            || fieldPath === "riskFlags.highRelianceThresholdPercent";
          const isOptionalYearsField = fieldPath === "supportTreatment.supportDurationYears"
            || fieldPath === "survivorScenario.survivorIncomeStartDelayMonths"
            || fieldPath === "survivorScenario.survivorRetirementHorizonYears";

          if (
            field.type !== "checkbox"
            && field.tagName !== "SELECT"
            && rawValue
            && Number.isFinite(number)
            && number >= MIN_SURVIVOR_SUPPORT_YEARS
            && (!isPercentField || number <= MAX_SURVIVOR_SUPPORT_PERCENT)
            && (isPercentField || isOptionalYearsField)
          ) {
            field.value = formatHaircutInputValue(number);
          }
          syncSurvivorSupportFieldControls(survivorSupportFields, fieldPath, field);
          syncSurvivorSupportChange();
        });
      });
    });

    Object.keys(educationFields.values || {}).forEach(function (fieldPath) {
      const field = educationFields.values[fieldPath];
      if (!field) {
        return;
      }

      const syncEducationChange = function () {
        setEducationDefaultProfile(educationFields, "custom");
        syncEducationPreview(educationFields, linkedRecord);
        markUnsaved();
      };

      field.addEventListener("input", function () {
        if (fieldPath === "fundingTreatment.educationStartAge") {
          const sanitizedValue = String(field.value || "").replace(/[^0-9.]/g, "");
          if (field.value !== sanitizedValue) {
            field.value = sanitizedValue;
          }
        }
        syncEducationChange();
      });

      field.addEventListener("change", function () {
        const rawValue = String(field.value || "").trim().replace(/[$,\s]/g, "");
        const number = Number(rawValue);
        const isPercentField = fieldPath === "fundingTreatment.fundingTargetPercent";
        const isStartAgeField = fieldPath === "fundingTreatment.educationStartAge";
        const roundedStartAge = isStartAgeField ? Math.round(number) : null;
        const isOptionalNumberField = isStartAgeField;

        if (
          field.type !== "checkbox"
          && rawValue
          && Number.isFinite(number)
          && number >= (isStartAgeField ? MIN_EDUCATION_START_AGE : MIN_EDUCATION_NUMBER)
          && (!isPercentField || number <= MAX_EDUCATION_PERCENT)
          && (!isStartAgeField || (
            roundedStartAge >= MIN_EDUCATION_START_AGE
            && roundedStartAge <= MAX_EDUCATION_START_AGE
          ))
          && (isPercentField || isOptionalNumberField)
        ) {
          field.value = isStartAgeField
            ? String(roundedStartAge)
            : formatHaircutInputValue(number);
        }
        syncEducationChange();
      });
    });

    Object.keys(recommendationGuardrailFields.values || {}).forEach(function (fieldPath) {
      const field = recommendationGuardrailFields.values[fieldPath];
      if (!field) {
        return;
      }

      const syncRecommendationChange = function () {
        setRecommendationDefaultProfile(recommendationGuardrailFields, "custom");
        syncRecommendationPreview(recommendationGuardrailFields);
        markUnsaved();
      };

      field.addEventListener("input", function () {
        syncRecommendationChange();
      });

      field.addEventListener("change", function () {
        const rawValue = String(field.value || "").trim().replace(/[$,\s]/g, "");
        const number = Number(rawValue);
        const isPercentField = fieldPath.indexOf("riskThresholds.") === 0
          || fieldPath === "rangeConstraints.lowerBound.tolerancePercent"
          || fieldPath === "rangeConstraints.upperBound.tolerancePercent";

        if (
          field.type !== "checkbox"
          && field.tagName !== "SELECT"
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_RECOMMENDATION_PERCENT
          && number <= MAX_RECOMMENDATION_PERCENT
          && isPercentField
        ) {
          field.value = formatHaircutInputValue(number);
        }
        syncRecommendationChange();
      });
    });

    getVisibleAssetTreatmentItemKeys(assetTreatmentFields).forEach(function (itemKey) {
      getAssetTreatmentFieldList(assetTreatmentFields, "include", itemKey).forEach(function (field) {
        field.addEventListener("change", function () {
          setAssetTreatmentFieldsChecked(assetTreatmentFields, "include", itemKey, field.checked);
          setAssetDefaultProfile(assetTreatmentFields, "custom");
          syncAssetTreatmentPreview(assetTreatmentFields, itemKey, linkedRecord);
          markUnsaved();
        });
      });

      getAssetTreatmentFieldList(assetTreatmentFields, "preset", itemKey).forEach(function (field) {
        field.addEventListener("change", function () {
          setAssetTreatmentFieldsValue(assetTreatmentFields, "preset", itemKey, field.value);
          setAssetDefaultProfile(assetTreatmentFields, "custom");
          applyAssetTreatmentPreset(assetTreatmentFields, itemKey, linkedRecord);
          markUnsaved();
        });
      });

      getAssetTreatmentFieldList(assetTreatmentFields, "growthSlider", itemKey).forEach(function (field) {
        const syncFromSlider = function () {
          const number = Number(field.value);
          const growthValue = normalizeAssetGrowthRatePercent(number, 0);
          setAssetTreatmentGrowthFields(assetTreatmentFields, itemKey, {
            assumedAnnualGrowthRatePercent: growthValue,
            assumedAnnualGrowthRateSource: ASSET_GROWTH_RATE_SOURCE_ADVISOR,
            assumedAnnualGrowthRateProfile: "custom"
          });
          setAssetDefaultProfile(assetTreatmentFields, "custom");
          markUnsaved();
        };

        field.addEventListener("input", syncFromSlider);
        field.addEventListener("change", syncFromSlider);
      });

      getAssetTreatmentFieldList(assetTreatmentFields, "growth", itemKey).forEach(function (field) {
        field.addEventListener("input", function () {
          syncAssetTreatmentFieldValueFromSource(assetTreatmentFields, "growth", itemKey, field);
          markAssetTreatmentGrowthFieldsAsAdvisor(assetTreatmentFields, itemKey);

          const rawValue = String(field?.value || "").trim();
          const number = Number(rawValue);
          if (rawValue && Number.isFinite(number)) {
            getAssetTreatmentFieldList(assetTreatmentFields, "growthSlider", itemKey).forEach(function (slider) {
              slider.value = normalizeAssetGrowthRatePercent(number, 0);
              updateRateSliderProgress(slider);
            });
          }

          setAssetDefaultProfile(assetTreatmentFields, "custom");
          markUnsaved();
        });

        field.addEventListener("change", function () {
          const rawValue = String(field?.value || "").trim();
          const number = Number(rawValue);
          const growthFields = rawValue && Number.isFinite(number)
            ? {
              assumedAnnualGrowthRatePercent: normalizeAssetGrowthRatePercent(number, 0),
              assumedAnnualGrowthRateSource: ASSET_GROWTH_RATE_SOURCE_ADVISOR,
              assumedAnnualGrowthRateProfile: "custom"
            }
            : createAssetGrowthSavedFields({}, itemKey, getAssetDefaultProfile(assetTreatmentFields));

          setAssetTreatmentGrowthFields(assetTreatmentFields, itemKey, growthFields);
          setAssetDefaultProfile(assetTreatmentFields, growthFields.assumedAnnualGrowthRateSource === ASSET_GROWTH_RATE_SOURCE_ADVISOR
            ? "custom"
            : getAssetDefaultProfile(assetTreatmentFields));
          markUnsaved();
        });
      });

      ["tax", "haircut"].forEach(function (groupName) {
        getAssetTreatmentFieldList(assetTreatmentFields, groupName, itemKey).forEach(function (field) {
          field.addEventListener("input", function () {
            syncAssetTreatmentFieldValueFromSource(assetTreatmentFields, groupName, itemKey, field);
            setAssetDefaultProfile(assetTreatmentFields, "custom");
            syncAssetTreatmentPreview(assetTreatmentFields, itemKey, linkedRecord);
            markUnsaved();
          });

          field.addEventListener("change", function () {
            const rawValue = String(field?.value || "").trim();
            const number = Number(rawValue);
            if (
              field
              && rawValue
              && Number.isFinite(number)
              && number >= MIN_ASSET_TREATMENT_PERCENT
              && number <= MAX_ASSET_TREATMENT_PERCENT
            ) {
              field.value = formatHaircutInputValue(number);
            }
            syncAssetTreatmentFieldValueFromSource(assetTreatmentFields, groupName, itemKey, field);
            setAssetDefaultProfile(assetTreatmentFields, "custom");
            syncAssetTreatmentPreview(assetTreatmentFields, itemKey, linkedRecord);
            markUnsaved();
          });
        });
      });
    });

    const customAssetId = DEFAULT_CUSTOM_ASSET_TREATMENT.id;
    assetTreatmentFields.custom.label[customAssetId]?.addEventListener("input", function () {
      setAssetDefaultProfile(assetTreatmentFields, "custom");
      markUnsaved();
    });
    assetTreatmentFields.custom.value[customAssetId]?.addEventListener("input", function () {
      setAssetDefaultProfile(assetTreatmentFields, "custom");
      syncCustomAssetTreatmentPreview(assetTreatmentFields, customAssetId);
      markUnsaved();
    });
    assetTreatmentFields.custom.value[customAssetId]?.addEventListener("change", function () {
      const field = assetTreatmentFields.custom.value[customAssetId];
      const rawValue = String(field?.value || "").trim().replace(/[$,\s]/g, "");
      const number = Number(rawValue);
      if (field && rawValue && Number.isFinite(number) && number >= 0) {
        field.value = formatHaircutInputValue(number);
      }
      setAssetDefaultProfile(assetTreatmentFields, "custom");
      syncCustomAssetTreatmentPreview(assetTreatmentFields, customAssetId);
      markUnsaved();
    });
    assetTreatmentFields.custom.include[customAssetId]?.addEventListener("change", function () {
      setAssetDefaultProfile(assetTreatmentFields, "custom");
      syncCustomAssetTreatmentPreview(assetTreatmentFields, customAssetId);
      markUnsaved();
    });
    assetTreatmentFields.custom.preset[customAssetId]?.addEventListener("change", function () {
      setAssetDefaultProfile(assetTreatmentFields, "custom");
      applyCustomAssetTreatmentPreset(assetTreatmentFields, customAssetId);
      markUnsaved();
    });
    ["tax", "haircut"].forEach(function (groupName) {
      assetTreatmentFields.custom[groupName][customAssetId]?.addEventListener("input", function () {
        setAssetDefaultProfile(assetTreatmentFields, "custom");
        syncCustomAssetTreatmentPreview(assetTreatmentFields, customAssetId);
        markUnsaved();
      });

      assetTreatmentFields.custom[groupName][customAssetId]?.addEventListener("change", function () {
        const field = assetTreatmentFields.custom[groupName][customAssetId];
        const rawValue = String(field?.value || "").trim();
        const number = Number(rawValue);
        if (
          field
          && rawValue
          && Number.isFinite(number)
          && number >= MIN_ASSET_TREATMENT_PERCENT
          && number <= MAX_ASSET_TREATMENT_PERCENT
        ) {
          field.value = formatHaircutInputValue(number);
        }
        setAssetDefaultProfile(assetTreatmentFields, "custom");
        syncCustomAssetTreatmentPreview(assetTreatmentFields, customAssetId);
        markUnsaved();
      });
    });

    saveButton?.addEventListener("click", function () {
      linkedRecord = saveAnalysisSetupSettings(
        fields,
        sliders,
        healthcareExpenseFields,
        methodFields,
        growthFields,
        growthSliders,
        policyReturnFields,
        assetTreatmentFields,
        existingCoverageFields,
        debtTreatmentFields,
        survivorSupportFields,
        educationFields,
        recommendationGuardrailFields,
        linkedRecord,
        validationMessage,
        statusMessage
      ) || linkedRecord;
    });

    applyButton?.addEventListener("click", function () {
      const updatedRecord = saveAnalysisSetupSettings(
        fields,
        sliders,
        healthcareExpenseFields,
        methodFields,
        growthFields,
        growthSliders,
        policyReturnFields,
        assetTreatmentFields,
        existingCoverageFields,
        debtTreatmentFields,
        survivorSupportFields,
        educationFields,
        recommendationGuardrailFields,
        linkedRecord,
        validationMessage,
        statusMessage
      );
      if (!updatedRecord) {
        return;
      }

      window.location.href = "analysis-estimate.html";
    });
  }

  document.addEventListener("DOMContentLoaded", initializeAnalysisSetup);

  LensApp.analysisSetup = Object.assign(LensApp.analysisSetup || {}, {
    DEFAULT_INFLATION_ASSUMPTIONS,
    DEFAULT_HEALTHCARE_EXPENSE_ASSUMPTIONS,
    DEFAULT_METHOD_DEFAULTS,
    DEFAULT_GROWTH_AND_RETURN_ASSUMPTIONS,
    DEFAULT_POLICY_TYPE_RETURN_ASSUMPTIONS,
    DEFAULT_ASSET_TREATMENT_ASSUMPTIONS,
    DEFAULT_EXISTING_COVERAGE_ASSUMPTIONS,
    DEFAULT_DEBT_TREATMENT_ASSUMPTIONS,
    DEFAULT_SURVIVOR_SUPPORT_ASSUMPTIONS,
    DEFAULT_EDUCATION_ASSUMPTIONS,
    DEFAULT_RECOMMENDATION_GUARDRAILS,
    normalizeAnalysisDateOnlyValue,
    resolveAnalysisValuationDateForSave,
    getInflationAssumptions,
    getHealthcareExpenseAssumptions,
    getMethodDefaults,
    getGrowthAndReturnAssumptions,
    getPolicyTypeReturnAssumptions,
    getAssetTreatmentAssumptions,
    getExistingCoverageAssumptions,
    getDebtCategoryTreatmentItems,
    getDebtTreatmentAssumptions,
    getSurvivorSupportAssumptions,
    getEducationAssumptions,
    getRecommendationGuardrails
  });
})();
