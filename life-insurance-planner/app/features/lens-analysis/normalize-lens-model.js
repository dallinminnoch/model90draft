(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis feature module.
  // Purpose: translate runtime block outputs into the canonical Lens model.
  // Non-goals: no DOM reads, no persistence, no formulas, no page wiring.

  const INCOME_NET_INCOME_BLOCK_ID = lensAnalysis.NET_INCOME_BLOCK_ID || "income-net-income";
  const DEBT_PAYOFF_BLOCK_ID = lensAnalysis.DEBT_PAYOFF_BLOCK_ID || "debt-payoff";
  const HOUSING_ONGOING_SUPPORT_BLOCK_ID = lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_ID || "housing-ongoing-support";
  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID = lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID || "non-housing-ongoing-support";
  const EDUCATION_SUPPORT_BLOCK_ID = lensAnalysis.EDUCATION_SUPPORT_BLOCK_ID || "education-support";
  const FINAL_EXPENSES_BLOCK_ID = lensAnalysis.FINAL_EXPENSES_BLOCK_ID || "final-expenses";
  const TRANSITION_NEEDS_BLOCK_ID = lensAnalysis.TRANSITION_NEEDS_BLOCK_ID || "transition-needs";
  const EXISTING_COVERAGE_BLOCK_ID = lensAnalysis.EXISTING_COVERAGE_BLOCK_ID || "existing-coverage";
  const OFFSET_ASSETS_BLOCK_ID = lensAnalysis.OFFSET_ASSETS_BLOCK_ID || "offset-assets";
  const SURVIVOR_SCENARIO_BLOCK_ID = lensAnalysis.SURVIVOR_SCENARIO_BLOCK_ID || "survivor-scenario";
  const TAX_CONTEXT_BLOCK_ID = lensAnalysis.TAX_CONTEXT_BLOCK_ID || "tax-context";
  const ONGOING_SUPPORT_COMPOSITION_BLOCK_ID = "ongoingSupport-composition";
  const ONGOING_SUPPORT_COMPOSITION_BLOCK_TYPE = "bucket-composition";
  const BLOCKED_DEBT_FACT_KEYS = Object.freeze([
    "primaryResidenceEquity",
    "realEstateEquity",
    "otherRealEstateEquity"
  ]);
  const SCALAR_FINAL_EXPENSE_SOURCE_FIELDS = Object.freeze([
    Object.freeze({
      sourceKey: "funeralBurialEstimate",
      typeKey: "funeralBurialEstimate",
      categoryKey: "funeralBurial"
    }),
    Object.freeze({
      sourceKey: "medicalEndOfLifeCosts",
      typeKey: "medicalEndOfLifeCosts",
      categoryKey: "medicalFinalExpense"
    }),
    Object.freeze({
      sourceKey: "estateSettlementCosts",
      typeKey: "estateSettlementCosts",
      categoryKey: "estateSettlement"
    }),
    Object.freeze({
      sourceKey: "otherFinalExpenses",
      typeKey: "otherFinalExpenses",
      categoryKey: "otherFinalExpense"
    })
  ]);
  const EXPENSE_RECORDS_SOURCE_PATH = "protectionModeling.data.expenseRecords";
  const EXPENSE_FREQUENCY_ANNUALIZATION_FACTORS = Object.freeze({
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    semiAnnual: 2,
    annual: 1
  });

  // This pass normalizes the currently proven runtime block outputs into the
  // canonical incomeBasis, debtPayoff, ongoingSupport, educationSupport,
  // finalExpenses, transitionNeeds, existingCoverage, offsetAssets,
  // survivorScenario, tax-context, and assumptions destinations.
  const INCOME_BASIS_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "grossAnnualIncome",
      destinationField: "insuredGrossAnnualIncome",
      sourceMetadataKey: "grossAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "netAnnualIncome",
      destinationField: "insuredNetAnnualIncome",
      sourceMetadataKey: "netAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "bonusVariableAnnualIncome",
      destinationField: "bonusVariableAnnualIncome",
      sourceMetadataKey: "bonusVariableAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "annualEmployerBenefitsValue",
      destinationField: "annualEmployerBenefitsValue",
      sourceMetadataKey: "annualEmployerBenefitsValue"
    }),
    Object.freeze({
      sourceOutputKey: "annualIncomeReplacementBase",
      destinationField: "annualIncomeReplacementBase",
      sourceMetadataKey: "annualIncomeReplacementBase"
    }),
    Object.freeze({
      sourceOutputKey: "spouseOrPartnerGrossAnnualIncome",
      destinationField: "spouseOrPartnerGrossAnnualIncome",
      sourceMetadataKey: "spouseOrPartnerGrossAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "spouseOrPartnerNetAnnualIncome",
      destinationField: "spouseOrPartnerNetAnnualIncome",
      sourceMetadataKey: "spouseOrPartnerNetAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "insuredRetirementHorizonYears",
      destinationField: "insuredRetirementHorizonYears",
      sourceMetadataKey: "insuredRetirementHorizonYears"
    })
  ]);

  const ECONOMIC_ASSUMPTIONS_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "incomeGrowthRatePercent",
      destinationField: "incomeGrowthRatePercent",
      sourceMetadataKey: "incomeGrowthRatePercent"
    })
  ]);

  const TAX_CONTEXT_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "maritalStatus",
      destinationField: "maritalStatus",
      sourceMetadataKey: "maritalStatus",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "filingStatus",
      destinationField: "filingStatus",
      sourceMetadataKey: "filingStatus",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "stateOfResidence",
      destinationField: "stateOfResidence",
      sourceMetadataKey: "stateOfResidence",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "primaryDeductionMethod",
      destinationField: "primaryDeductionMethod",
      sourceMetadataKey: "primaryDeductionMethod",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "spouseDeductionMethod",
      destinationField: "spouseDeductionMethod",
      sourceMetadataKey: "spouseDeductionMethod",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "primaryItemizedDeductionAmount",
      destinationField: "primaryItemizedDeductionAmount",
      sourceMetadataKey: "primaryItemizedDeductionAmount"
    }),
    Object.freeze({
      sourceOutputKey: "spouseItemizedDeductionAmount",
      destinationField: "spouseItemizedDeductionAmount",
      sourceMetadataKey: "spouseItemizedDeductionAmount"
    })
  ]);

  const DEBT_PAYOFF_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "mortgageBalance",
      destinationField: "mortgageBalance",
      sourceMetadataKey: "mortgageBalance"
    }),
    Object.freeze({
      sourceOutputKey: "otherRealEstateLoanBalance",
      destinationField: "otherRealEstateLoanBalance",
      sourceMetadataKey: "otherRealEstateLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "autoLoanBalance",
      destinationField: "autoLoanBalance",
      sourceMetadataKey: "autoLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "creditCardBalance",
      destinationField: "creditCardBalance",
      sourceMetadataKey: "creditCardBalance"
    }),
    Object.freeze({
      sourceOutputKey: "studentLoanBalance",
      destinationField: "studentLoanBalance",
      sourceMetadataKey: "studentLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "personalLoanBalance",
      destinationField: "personalLoanBalance",
      sourceMetadataKey: "personalLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "outstandingTaxLiabilities",
      destinationField: "outstandingTaxLiabilities",
      sourceMetadataKey: "outstandingTaxLiabilities"
    }),
    Object.freeze({
      sourceOutputKey: "businessDebtBalance",
      destinationField: "businessDebtBalance",
      sourceMetadataKey: "businessDebtBalance"
    }),
    Object.freeze({
      sourceOutputKey: "otherDebtPayoffNeeds",
      destinationField: "otherDebtPayoffNeeds",
      sourceMetadataKey: "otherDebtPayoffNeeds"
    }),
    Object.freeze({
      sourceOutputKey: "totalDebtPayoffNeed",
      destinationField: "totalDebtPayoffNeed",
      sourceMetadataKey: "totalDebtPayoffNeed"
    })
  ]);

  const ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "monthlyMortgagePayment",
      destinationField: "monthlyMortgagePayment",
      sourceMetadataKey: "monthlyMortgagePayment"
    }),
    Object.freeze({
      sourceOutputKey: "mortgageRemainingTermMonths",
      destinationField: "mortgageRemainingTermMonths",
      sourceMetadataKey: "mortgageRemainingTermMonths"
    }),
    Object.freeze({
      sourceOutputKey: "mortgageInterestRatePercent",
      destinationField: "mortgageInterestRatePercent",
      sourceMetadataKey: "mortgageInterestRatePercent"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyRentOrHousingPayment",
      destinationField: "monthlyRentOrHousingPayment",
      sourceMetadataKey: "monthlyRentOrHousingPayment"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyOtherRenterHousingCost",
      destinationField: "monthlyOtherRenterHousingCost",
      sourceMetadataKey: "monthlyOtherRenterHousingCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyUtilities",
      destinationField: "monthlyUtilities",
      sourceMetadataKey: "monthlyUtilities"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHousingInsurance",
      destinationField: "monthlyHousingInsurance",
      sourceMetadataKey: "monthlyHousingInsurance"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyPropertyTax",
      destinationField: "monthlyPropertyTax",
      sourceMetadataKey: "monthlyPropertyTax"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHoaCost",
      destinationField: "monthlyHoaCost",
      sourceMetadataKey: "monthlyHoaCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyMaintenanceAndRepairs",
      destinationField: "monthlyMaintenanceAndRepairs",
      sourceMetadataKey: "monthlyMaintenanceAndRepairs"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHousingSupportCost",
      destinationField: "monthlyHousingSupportCost",
      sourceMetadataKey: "monthlyHousingSupportCost"
    }),
    Object.freeze({
      sourceOutputKey: "annualHousingSupportCost",
      destinationField: "annualHousingSupportCost",
      sourceMetadataKey: "annualHousingSupportCost"
    })
  ]);

  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "monthlyOtherInsuranceCost",
      destinationField: "monthlyOtherInsuranceCost",
      sourceMetadataKey: "monthlyOtherInsuranceCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHealthcareOutOfPocketCost",
      destinationField: "monthlyHealthcareOutOfPocketCost",
      sourceMetadataKey: "monthlyHealthcareOutOfPocketCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyFoodCost",
      destinationField: "monthlyFoodCost",
      sourceMetadataKey: "monthlyFoodCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyTransportationCost",
      destinationField: "monthlyTransportationCost",
      sourceMetadataKey: "monthlyTransportationCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyChildcareAndDependentCareCost",
      destinationField: "monthlyChildcareAndDependentCareCost",
      sourceMetadataKey: "monthlyChildcareAndDependentCareCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyPhoneAndInternetCost",
      destinationField: "monthlyPhoneAndInternetCost",
      sourceMetadataKey: "monthlyPhoneAndInternetCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHouseholdSuppliesCost",
      destinationField: "monthlyHouseholdSuppliesCost",
      sourceMetadataKey: "monthlyHouseholdSuppliesCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyOtherHouseholdExpenses",
      destinationField: "monthlyOtherHouseholdExpenses",
      sourceMetadataKey: "monthlyOtherHouseholdExpenses"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyNonHousingEssentialSupportCost",
      destinationField: "monthlyNonHousingEssentialSupportCost",
      sourceMetadataKey: "monthlyNonHousingEssentialSupportCost"
    }),
    Object.freeze({
      sourceOutputKey: "annualNonHousingEssentialSupportCost",
      destinationField: "annualNonHousingEssentialSupportCost",
      sourceMetadataKey: "annualNonHousingEssentialSupportCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyTravelAndDiscretionaryCost",
      destinationField: "monthlyTravelAndDiscretionaryCost",
      sourceMetadataKey: "monthlyTravelAndDiscretionaryCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlySubscriptionsCost",
      destinationField: "monthlySubscriptionsCost",
      sourceMetadataKey: "monthlySubscriptionsCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyDiscretionaryPersonalSpending",
      destinationField: "monthlyDiscretionaryPersonalSpending",
      sourceMetadataKey: "monthlyDiscretionaryPersonalSpending"
    }),
    Object.freeze({
      sourceOutputKey: "annualDiscretionaryPersonalSpending",
      destinationField: "annualDiscretionaryPersonalSpending",
      sourceMetadataKey: "annualDiscretionaryPersonalSpending"
    })
  ]);

  const EDUCATION_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "linkedDependentCount",
      destinationField: "linkedDependentCount",
      sourceMetadataKey: "linkedDependentCount"
    }),
    Object.freeze({
      sourceOutputKey: "desiredAdditionalDependentCount",
      destinationField: "desiredAdditionalDependentCount",
      sourceMetadataKey: "desiredAdditionalDependentCount"
    }),
    Object.freeze({
      sourceOutputKey: "perLinkedDependentEducationFunding",
      destinationField: "perLinkedDependentEducationFunding",
      sourceMetadataKey: "perLinkedDependentEducationFunding"
    }),
    Object.freeze({
      sourceOutputKey: "perDesiredAdditionalDependentEducationFunding",
      destinationField: "perDesiredAdditionalDependentEducationFunding",
      sourceMetadataKey: "perDesiredAdditionalDependentEducationFunding"
    }),
    Object.freeze({
      sourceOutputKey: "sameEducationFundingForDesiredAdditionalDependents",
      destinationField: "sameEducationFundingForDesiredAdditionalDependents",
      sourceMetadataKey: "sameEducationFundingForDesiredAdditionalDependents",
      valueType: "boolean"
    }),
    Object.freeze({
      sourceOutputKey: "linkedDependentEducationFundingNeed",
      destinationField: "linkedDependentEducationFundingNeed",
      sourceMetadataKey: "linkedDependentEducationFundingNeed"
    }),
    Object.freeze({
      sourceOutputKey: "desiredAdditionalDependentEducationFundingNeed",
      destinationField: "desiredAdditionalDependentEducationFundingNeed",
      sourceMetadataKey: "desiredAdditionalDependentEducationFundingNeed"
    }),
    Object.freeze({
      sourceOutputKey: "totalEducationFundingNeed",
      destinationField: "totalEducationFundingNeed",
      sourceMetadataKey: "totalEducationFundingNeed"
    })
  ]);

  const FINAL_EXPENSES_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "funeralAndBurialCost",
      destinationField: "funeralAndBurialCost",
      sourceMetadataKey: "funeralAndBurialCost"
    }),
    Object.freeze({
      sourceOutputKey: "medicalEndOfLifeCost",
      destinationField: "medicalEndOfLifeCost",
      sourceMetadataKey: "medicalEndOfLifeCost"
    }),
    Object.freeze({
      sourceOutputKey: "estateSettlementCost",
      destinationField: "estateSettlementCost",
      sourceMetadataKey: "estateSettlementCost"
    }),
    Object.freeze({
      sourceOutputKey: "otherFinalExpenses",
      destinationField: "otherFinalExpenses",
      sourceMetadataKey: "otherFinalExpenses"
    }),
    Object.freeze({
      sourceOutputKey: "totalFinalExpenseNeed",
      destinationField: "totalFinalExpenseNeed",
      sourceMetadataKey: "totalFinalExpenseNeed"
    })
  ]);

  const TRANSITION_NEEDS_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "survivorLiquidityBuffer",
      destinationField: "survivorLiquidityBuffer",
      sourceMetadataKey: "survivorLiquidityBuffer"
    }),
    Object.freeze({
      sourceOutputKey: "desiredEmergencyFund",
      destinationField: "desiredEmergencyFund",
      sourceMetadataKey: "desiredEmergencyFund"
    }),
    Object.freeze({
      sourceOutputKey: "housingTransitionReserve",
      destinationField: "housingTransitionReserve",
      sourceMetadataKey: "housingTransitionReserve"
    }),
    Object.freeze({
      sourceOutputKey: "otherTransitionNeeds",
      destinationField: "otherTransitionNeeds",
      sourceMetadataKey: "otherTransitionNeeds"
    }),
    Object.freeze({
      sourceOutputKey: "totalTransitionNeed",
      destinationField: "totalTransitionNeed",
      sourceMetadataKey: "totalTransitionNeed"
    })
  ]);

  const EXISTING_COVERAGE_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "profilePolicySummaries",
      destinationField: "profilePolicySummaries",
      sourceMetadataKey: "profilePolicySummaries",
      valueType: "array"
    }),
    Object.freeze({
      sourceOutputKey: "profilePolicyCount",
      destinationField: "profilePolicyCount",
      sourceMetadataKey: "profilePolicyCount"
    }),
    Object.freeze({
      sourceOutputKey: "individualProfileCoverageTotal",
      destinationField: "individualProfileCoverageTotal",
      sourceMetadataKey: "individualProfileCoverageTotal"
    }),
    Object.freeze({
      sourceOutputKey: "groupProfileCoverageTotal",
      destinationField: "groupProfileCoverageTotal",
      sourceMetadataKey: "groupProfileCoverageTotal"
    }),
    Object.freeze({
      sourceOutputKey: "unclassifiedProfileCoverageTotal",
      destinationField: "unclassifiedProfileCoverageTotal",
      sourceMetadataKey: "unclassifiedProfileCoverageTotal"
    }),
    Object.freeze({
      sourceOutputKey: "totalProfileCoverage",
      destinationField: "totalProfileCoverage",
      sourceMetadataKey: "totalProfileCoverage"
    }),
    Object.freeze({
      sourceOutputKey: "coverageSource",
      destinationField: "coverageSource",
      sourceMetadataKey: "coverageSource",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "totalExistingCoverage",
      destinationField: "totalExistingCoverage",
      sourceMetadataKey: "totalExistingCoverage"
    })
  ]);

  function createOffsetAssetNormalizationFields(assetKey) {
    return [
      Object.freeze({
        sourceOutputKey: assetKey + ".value",
        destinationField: assetKey + ".value",
        sourceMetadataKey: assetKey + ".value"
      }),
      Object.freeze({
        sourceOutputKey: assetKey + ".includeInOffset",
        destinationField: assetKey + ".includeInOffset",
        sourceMetadataKey: assetKey + ".includeInOffset",
        valueType: "boolean"
      }),
      Object.freeze({
        sourceOutputKey: assetKey + ".liquidityType",
        destinationField: assetKey + ".liquidityType",
        sourceMetadataKey: assetKey + ".liquidityType",
        valueType: "string"
      }),
      Object.freeze({
        sourceOutputKey: assetKey + ".availablePercent",
        destinationField: assetKey + ".availablePercent",
        sourceMetadataKey: assetKey + ".availablePercent"
      }),
      Object.freeze({
        sourceOutputKey: assetKey + ".availableValue",
        destinationField: assetKey + ".availableValue",
        sourceMetadataKey: assetKey + ".availableValue"
      })
    ];
  }

  const OFFSET_ASSETS_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    ...createOffsetAssetNormalizationFields("cashSavings"),
    ...createOffsetAssetNormalizationFields("currentEmergencyFund"),
    ...createOffsetAssetNormalizationFields("brokerageAccounts"),
    ...createOffsetAssetNormalizationFields("retirementAccounts"),
    ...createOffsetAssetNormalizationFields("realEstateEquity"),
    ...createOffsetAssetNormalizationFields("businessValue"),
    Object.freeze({
      sourceOutputKey: "assetDataConfidence",
      destinationField: "assetDataConfidence",
      sourceMetadataKey: "assetDataConfidence",
      valueType: "string"
    }),
    Object.freeze({
      sourceOutputKey: "totalReportedAssetValue",
      destinationField: "totalReportedAssetValue",
      sourceMetadataKey: "totalReportedAssetValue"
    }),
    Object.freeze({
      sourceOutputKey: "totalIncludedAssetValue",
      destinationField: "totalIncludedAssetValue",
      sourceMetadataKey: "totalIncludedAssetValue"
    }),
    Object.freeze({
      sourceOutputKey: "totalAvailableOffsetAssetValue",
      destinationField: "totalAvailableOffsetAssetValue",
      sourceMetadataKey: "totalAvailableOffsetAssetValue"
    })
  ]);

  const SURVIVOR_SCENARIO_BLOCK_OUTPUT_NORMALIZATION_MAP = Object.freeze([
    Object.freeze({
      sourceOutputKey: "survivorContinuesWorking",
      destinationField: "survivorContinuesWorking",
      sourceMetadataKey: "survivorContinuesWorking",
      valueType: "boolean"
    }),
    Object.freeze({
      sourceOutputKey: "expectedSurvivorWorkReductionPercent",
      destinationField: "expectedSurvivorWorkReductionPercent",
      sourceMetadataKey: "expectedSurvivorWorkReductionPercent"
    }),
    Object.freeze({
      sourceOutputKey: "survivorGrossAnnualIncome",
      destinationField: "survivorGrossAnnualIncome",
      sourceMetadataKey: "survivorGrossAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "survivorNetAnnualIncome",
      destinationField: "survivorNetAnnualIncome",
      sourceMetadataKey: "survivorNetAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "survivorIncomeStartDelayMonths",
      destinationField: "survivorIncomeStartDelayMonths",
      sourceMetadataKey: "survivorIncomeStartDelayMonths"
    }),
    Object.freeze({
      sourceOutputKey: "survivorEarnedIncomeGrowthRatePercent",
      destinationField: "survivorEarnedIncomeGrowthRatePercent",
      sourceMetadataKey: "survivorEarnedIncomeGrowthRatePercent"
    }),
    Object.freeze({
      sourceOutputKey: "survivorRetirementHorizonYears",
      destinationField: "survivorRetirementHorizonYears",
      sourceMetadataKey: "survivorRetirementHorizonYears"
    }),
    Object.freeze({
      sourceOutputKey: "survivorNetIncomeTaxBasis",
      destinationField: "survivorNetIncomeTaxBasis",
      sourceMetadataKey: "survivorNetIncomeTaxBasis",
      valueType: "string"
    })
  ]);

  function clonePlainValue(value) {
    if (Array.isArray(value)) {
      return value.map(clonePlainValue);
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.keys(value).reduce(function (nextValue, key) {
      nextValue[key] = clonePlainValue(value[key]);
      return nextValue;
    }, {});
  }

  function createEmptyLensModelInstance() {
    if (typeof lensAnalysis.createEmptyLensModel === "function") {
      return lensAnalysis.createEmptyLensModel();
    }

    if (lensAnalysis.EMPTY_LENS_MODEL && typeof lensAnalysis.EMPTY_LENS_MODEL === "object") {
      return clonePlainValue(lensAnalysis.EMPTY_LENS_MODEL);
    }

    throw new Error("Lens schema is unavailable. Load schema.js before normalize-lens-model.js.");
  }

  function toOptionalNumber(value) {
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

  function toOptionalBoolean(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "boolean") {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === "yes" || normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "no" || normalized === "false" || normalized === "0") {
      return false;
    }

    return null;
  }

  function toOptionalNonNegativeNumber(value) {
    const numericValue = toOptionalNumber(value);
    return numericValue == null || numericValue < 0 ? null : numericValue;
  }

  function getAssetTaxonomy() {
    const taxonomy = lensAnalysis.assetTaxonomy && typeof lensAnalysis.assetTaxonomy === "object"
      ? lensAnalysis.assetTaxonomy
      : {};
    const categories = Array.isArray(taxonomy.DEFAULT_ASSET_CATEGORIES)
      ? taxonomy.DEFAULT_ASSET_CATEGORIES
      : [];

    return {
      categories,
      legacyAliases: taxonomy.LEGACY_ASSET_SOURCE_ALIASES && typeof taxonomy.LEGACY_ASSET_SOURCE_ALIASES === "object"
        ? taxonomy.LEGACY_ASSET_SOURCE_ALIASES
        : {},
      taxonomySource: categories.length ? "asset-taxonomy" : "unavailable"
    };
  }

  function getAssetCategorySourceKeys(category) {
    const sourceKeys = [];
    const normalizedCategory = category && typeof category === "object" ? category : {};

    if (normalizedCategory.defaultPmiSourceKey) {
      sourceKeys.push(normalizedCategory.defaultPmiSourceKey);
    }

    if (Array.isArray(normalizedCategory.legacySourceKeys)) {
      normalizedCategory.legacySourceKeys.forEach(function (sourceKey) {
        if (sourceKey) {
          sourceKeys.push(sourceKey);
        }
      });
    }

    return sourceKeys.filter(function (sourceKey, index) {
      return sourceKeys.indexOf(sourceKey) === index;
    });
  }

  function hasUsableAssetSourceValue(sourceData, sourceKey) {
    if (!sourceData || typeof sourceData !== "object" || !sourceKey) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(sourceData, sourceKey)) {
      return false;
    }

    const rawValue = sourceData[sourceKey];
    return rawValue != null && String(rawValue).trim() !== "";
  }

  function getFirstAssetSourceEntry(sourceData, sourceKeys) {
    const keys = Array.isArray(sourceKeys) ? sourceKeys : [];

    for (let index = 0; index < keys.length; index += 1) {
      const sourceKey = keys[index];
      if (!hasUsableAssetSourceValue(sourceData, sourceKey)) {
        continue;
      }

      const currentValue = toOptionalNumber(sourceData[sourceKey]);
      if (currentValue == null) {
        continue;
      }

      return {
        sourceKey,
        currentValue
      };
    }

    return null;
  }

  function normalizeAssetRecordString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeAssetRecordToken(value) {
    return normalizeAssetRecordString(value)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function getTaxonomyCategoryByKey(taxonomy, categoryKey) {
    const safeTaxonomy = taxonomy && typeof taxonomy === "object" ? taxonomy : {};
    const categories = Array.isArray(safeTaxonomy.categories) ? safeTaxonomy.categories : [];
    const safeCategoryKey = normalizeAssetRecordString(categoryKey);

    if (!safeCategoryKey) {
      return null;
    }

    return categories.find(function (category) {
      return category && category.categoryKey === safeCategoryKey;
    }) || null;
  }

  function createAssetFactWarning(code, message, details) {
    return {
      code,
      message,
      details: details || null
    };
  }

  function createDefaultAssetRecordId(categoryKey) {
    return "default_" + categoryKey;
  }

  function createFallbackAssetRecordId(record, index) {
    const safeRecord = record && typeof record === "object" ? record : {};
    const categoryToken = normalizeAssetRecordToken(safeRecord.categoryKey) || "uncategorized";
    const typeToken = normalizeAssetRecordToken(safeRecord.typeKey || safeRecord.label) || "asset";
    const positionToken = Number.isInteger(index) ? index + 1 : 1;

    return "asset_record_" + categoryToken + "_" + typeToken + "_" + positionToken;
  }

  function createAssetFactFromCategory(category, sourceEntry, legacyAliases) {
    const safeCategory = category && typeof category === "object" ? category : {};
    const safeSourceEntry = sourceEntry && typeof sourceEntry === "object" ? sourceEntry : {};
    const categoryKey = String(safeCategory.categoryKey || "").trim();
    const sourceKey = String(safeSourceEntry.sourceKey || "").trim();
    const legacyAlias = legacyAliases && sourceKey && legacyAliases[sourceKey]
      ? legacyAliases[sourceKey]
      : null;

    return {
      assetId: createDefaultAssetRecordId(categoryKey),
      categoryKey,
      typeKey: createDefaultAssetRecordId(categoryKey),
      label: String(safeCategory.label || categoryKey).trim(),
      group: String(safeCategory.group || "custom").trim(),
      currentValue: safeSourceEntry.currentValue,
      source: "protectionModeling.data",
      hasPmiSource: true,
      sourceKey,
      isDefaultAsset: true,
      isCustomAsset: false,
      legacySourceKeys: Array.isArray(safeCategory.legacySourceKeys)
        ? safeCategory.legacySourceKeys.slice()
        : [],
      notes: safeCategory.notes || null,
      metadata: {
        sourceType: "user-input",
        confidence: "reported",
        canonicalDestination: "assetFacts.assets",
        recordSource: "default-scalar-field",
        defaultPmiSourceKey: safeCategory.defaultPmiSourceKey || null,
        hasCurrentPmiSource: safeCategory.hasCurrentPmiSource === true,
        description: safeCategory.description || null,
        defaultTreatmentBias: safeCategory.defaultTreatmentBias || null,
        legacyAliasNote: legacyAlias && legacyAlias.note ? legacyAlias.note : null
      }
    };
  }

  function createAssetFactFromAssetRecord(assetRecord, index, taxonomy) {
    const safeAssetRecord = assetRecord && typeof assetRecord === "object" ? assetRecord : {};
    const warnings = [];
    const categoryKey = normalizeAssetRecordString(safeAssetRecord.categoryKey);
    const taxonomyCategory = getTaxonomyCategoryByKey(taxonomy, categoryKey);
    const taxonomyAvailable = taxonomy && Array.isArray(taxonomy.categories) && taxonomy.categories.length > 0;
    const rawValue = safeAssetRecord.currentValue !== undefined
      ? safeAssetRecord.currentValue
      : safeAssetRecord.rawValue !== undefined
        ? safeAssetRecord.rawValue
        : safeAssetRecord.value;
    const currentValue = toOptionalNumber(rawValue);

    if (!categoryKey) {
      warnings.push(createAssetFactWarning(
        "missing-asset-record-category",
        "Asset record is missing a categoryKey.",
        { index }
      ));
    } else if (taxonomyAvailable && !taxonomyCategory) {
      warnings.push(createAssetFactWarning(
        "unknown-asset-record-category",
        "Asset record categoryKey is not present in the asset taxonomy.",
        { index, categoryKey }
      ));
    }

    if (currentValue == null) {
      warnings.push(createAssetFactWarning(
        "missing-asset-record-value",
        "Asset record is missing a numeric currentValue.",
        { index, categoryKey: categoryKey || null }
      ));
    }

    if (warnings.length) {
      return {
        asset: null,
        warnings
      };
    }

    const assetId = normalizeAssetRecordString(safeAssetRecord.assetId)
      || createFallbackAssetRecordId(safeAssetRecord, index);
    const typeKey = normalizeAssetRecordString(safeAssetRecord.typeKey)
      || normalizeAssetRecordString(taxonomyCategory && taxonomyCategory.categoryKey)
      || categoryKey;
    const label = normalizeAssetRecordString(safeAssetRecord.label)
      || normalizeAssetRecordString(taxonomyCategory && taxonomyCategory.label)
      || typeKey
      || categoryKey;
    const sourceKey = normalizeAssetRecordString(safeAssetRecord.sourceKey) || null;
    const metadata = safeAssetRecord.metadata && typeof safeAssetRecord.metadata === "object"
      ? clonePlainValue(safeAssetRecord.metadata)
      : {};

    return {
      asset: {
        assetId,
        categoryKey,
        typeKey,
        label,
        group: normalizeAssetRecordString(safeAssetRecord.group)
          || normalizeAssetRecordString(taxonomyCategory && taxonomyCategory.group)
          || "custom",
        currentValue,
        source: "protectionModeling.data.assetRecords",
        hasPmiSource: true,
        sourceKey,
        isDefaultAsset: safeAssetRecord.isDefaultAsset === true,
        isCustomAsset: safeAssetRecord.isCustomAsset === true || categoryKey === "otherCustomAsset",
        legacySourceKeys: Array.isArray(safeAssetRecord.legacySourceKeys)
          ? safeAssetRecord.legacySourceKeys.slice()
          : [],
        notes: normalizeAssetRecordString(safeAssetRecord.notes)
          || normalizeAssetRecordString(taxonomyCategory && taxonomyCategory.notes)
          || null,
        metadata: Object.assign({}, metadata, {
          sourceType: "user-input",
          confidence: metadata.confidence || "reported",
          canonicalDestination: "assetFacts.assets",
          recordSource: "assetRecords",
          sourceIndex: Number.isInteger(index) ? index : null,
          taxonomyCategoryLabel: taxonomyCategory && taxonomyCategory.label ? taxonomyCategory.label : null,
          defaultTreatmentBias: taxonomyCategory && taxonomyCategory.defaultTreatmentBias
            ? taxonomyCategory.defaultTreatmentBias
            : null
        })
      },
      warnings
    };
  }

  function createAssetFactsFromAssetRecords(sourceData, taxonomy) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const sourceRecords = Array.isArray(safeSourceData.assetRecords) ? safeSourceData.assetRecords : [];
    const assets = [];
    const warnings = [];

    sourceRecords.forEach(function (assetRecord, index) {
      const result = createAssetFactFromAssetRecord(assetRecord, index, taxonomy);
      warnings.push.apply(warnings, result.warnings);

      if (result.asset) {
        assets.push(result.asset);
      }
    });

    return {
      assets,
      sourceRecordCount: sourceRecords.length,
      acceptedRecordCount: assets.length,
      invalidRecordCount: sourceRecords.length - assets.length,
      warnings
    };
  }

  function markDuplicateAssetIds(assets) {
    const seenAssetIds = {};
    const duplicateAssetIds = [];

    assets.forEach(function (asset) {
      const assetId = asset && asset.assetId ? asset.assetId : null;
      if (!assetId) {
        return;
      }

      if (seenAssetIds[assetId]) {
        if (duplicateAssetIds.indexOf(assetId) === -1) {
          duplicateAssetIds.push(assetId);
        }
        asset.metadata = Object.assign({}, asset.metadata, {
          duplicateAssetId: true
        });
        return;
      }

      seenAssetIds[assetId] = true;
    });

    return duplicateAssetIds;
  }

  function createAssetFactsFromSourceData(sourceData) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const taxonomy = getAssetTaxonomy();
    const assets = [];
    const omittedNoSourceCategoryKeys = [];

    taxonomy.categories.forEach(function (category) {
      const sourceKeys = getAssetCategorySourceKeys(category);
      const sourceEntry = getFirstAssetSourceEntry(safeSourceData, sourceKeys);

      if (sourceEntry) {
        assets.push(createAssetFactFromCategory(category, sourceEntry, taxonomy.legacyAliases));
        return;
      }

      if (category && category.categoryKey && category.hasCurrentPmiSource !== true) {
        omittedNoSourceCategoryKeys.push(category.categoryKey);
      }
    });

    const assetRecordsProjection = createAssetFactsFromAssetRecords(safeSourceData, taxonomy);
    assets.push.apply(assets, assetRecordsProjection.assets);
    const duplicateAssetIds = markDuplicateAssetIds(assets);

    return {
      assets,
      totalReportedAssetValue: sumOptionalBucketComponents(assets.map(function (asset) {
        return asset.currentValue;
      })),
      metadata: {
        source: "protectionModeling.data",
        taxonomySource: taxonomy.taxonomySource,
        omittedNoSourceCategoryKeys,
        assetRecordsSource: "protectionModeling.data.assetRecords",
        assetRecordCount: assetRecordsProjection.sourceRecordCount,
        acceptedAssetRecordCount: assetRecordsProjection.acceptedRecordCount,
        invalidAssetRecordCount: assetRecordsProjection.invalidRecordCount,
        duplicateAssetIds,
        warnings: assetRecordsProjection.warnings
      }
    };
  }

  function applyAssetFactsProjection(lensModel, options) {
    const safeLensModel = lensModel && typeof lensModel === "object" ? lensModel : {};
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const projection = createAssetFactsFromSourceData(normalizedOptions.sourceData);

    if (!safeLensModel.assetFacts || typeof safeLensModel.assetFacts !== "object") {
      safeLensModel.assetFacts = {};
    }

    safeLensModel.assetFacts.assets = projection.assets;
    safeLensModel.assetFacts.totalReportedAssetValue = projection.totalReportedAssetValue;
    safeLensModel.assetFacts.metadata = projection.metadata;

    return projection.metadata;
  }

  function normalizeDebtRecordString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeDebtRecordToken(value) {
    return normalizeDebtRecordString(value)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function isBlockedDebtFactKey(value) {
    return BLOCKED_DEBT_FACT_KEYS.indexOf(normalizeDebtRecordString(value)) !== -1;
  }

  function getDebtTaxonomy() {
    const taxonomy = lensAnalysis.debtTaxonomy && typeof lensAnalysis.debtTaxonomy === "object"
      ? lensAnalysis.debtTaxonomy
      : {};
    const categories = Array.isArray(taxonomy.DEFAULT_DEBT_CATEGORIES)
      ? taxonomy.DEFAULT_DEBT_CATEGORIES
      : [];
    const scalarSourceFields = Array.isArray(taxonomy.CURRENT_PMI_DEBT_SOURCE_FIELDS)
      ? taxonomy.CURRENT_PMI_DEBT_SOURCE_FIELDS
      : [];

    return {
      categories,
      scalarSourceFields,
      taxonomySource: categories.length ? "debt-taxonomy" : "unavailable"
    };
  }

  function getDebtLibraryEntry(typeKey) {
    const normalizedTypeKey = normalizeDebtRecordString(typeKey);
    if (!normalizedTypeKey) {
      return null;
    }

    const debtLibrary = lensAnalysis.debtLibrary && typeof lensAnalysis.debtLibrary === "object"
      ? lensAnalysis.debtLibrary
      : {};

    if (typeof debtLibrary.findDebtLibraryEntry === "function") {
      return debtLibrary.findDebtLibraryEntry(normalizedTypeKey);
    }

    const entries = Array.isArray(debtLibrary.DEBT_LIBRARY_ENTRIES)
      ? debtLibrary.DEBT_LIBRARY_ENTRIES
      : [];
    return entries.find(function (entry) {
      return entry
        && (entry.typeKey === normalizedTypeKey || entry.libraryEntryKey === normalizedTypeKey);
    }) || null;
  }

  function getDebtCategoryByKey(taxonomy, categoryKey) {
    const safeTaxonomy = taxonomy && typeof taxonomy === "object" ? taxonomy : {};
    const categories = Array.isArray(safeTaxonomy.categories) ? safeTaxonomy.categories : [];
    const normalizedCategoryKey = normalizeDebtRecordString(categoryKey);

    if (!normalizedCategoryKey) {
      return null;
    }

    return categories.find(function (category) {
      return category && category.categoryKey === normalizedCategoryKey;
    }) || null;
  }

  function createDebtFactWarning(code, message, details) {
    return {
      code,
      message,
      details: details || null
    };
  }

  function hasUsableDebtSourceValue(sourceData, sourceKey) {
    if (!sourceData || typeof sourceData !== "object" || !sourceKey) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(sourceData, sourceKey)) {
      return false;
    }

    const rawValue = sourceData[sourceKey];
    return rawValue != null && String(rawValue).trim() !== "";
  }

  function createScalarDebtFactId(sourceKey) {
    return "scalar_debt_" + (normalizeDebtRecordToken(sourceKey) || "unknown");
  }

  function createFallbackDebtRecordFactId(debtRecord, index) {
    const safeDebtRecord = debtRecord && typeof debtRecord === "object" ? debtRecord : {};
    const categoryToken = normalizeDebtRecordToken(safeDebtRecord.categoryKey) || "uncategorized";
    const typeToken = normalizeDebtRecordToken(safeDebtRecord.typeKey || safeDebtRecord.label) || "debt";
    const positionToken = Number.isInteger(index) ? index + 1 : 1;

    return "debt_record_" + categoryToken + "_" + typeToken + "_" + positionToken;
  }

  function createDebtFactFromScalarSource(sourceData, sourceField, taxonomy) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const safeSourceField = sourceField && typeof sourceField === "object" ? sourceField : {};
    const sourceKey = normalizeDebtRecordString(safeSourceField.sourceKey);
    const warnings = [];

    if (!sourceKey || !hasUsableDebtSourceValue(safeSourceData, sourceKey)) {
      return {
        debt: null,
        warnings
      };
    }

    const categoryKey = normalizeDebtRecordString(safeSourceField.categoryKey);
    const taxonomyCategory = getDebtCategoryByKey(taxonomy, categoryKey);
    const currentBalance = toOptionalNumber(safeSourceData[sourceKey]);

    if (isBlockedDebtFactKey(sourceKey) || isBlockedDebtFactKey(categoryKey)) {
      warnings.push(createDebtFactWarning(
        "equity-scalar-debt-source-rejected",
        "Equity fields are not debt facts and were not projected into debtFacts.",
        { sourceKey, categoryKey }
      ));
    }

    if (!categoryKey) {
      warnings.push(createDebtFactWarning(
        "missing-scalar-debt-category",
        "Scalar debt source metadata is missing a categoryKey.",
        { sourceKey }
      ));
    } else if (!taxonomyCategory) {
      warnings.push(createDebtFactWarning(
        "unknown-scalar-debt-category",
        "Scalar debt source categoryKey is not present in the debt taxonomy.",
        { sourceKey, categoryKey }
      ));
    }

    if (currentBalance == null) {
      warnings.push(createDebtFactWarning(
        "invalid-scalar-debt-balance",
        "Scalar debt source is missing a numeric balance.",
        { sourceKey, categoryKey }
      ));
    } else if (currentBalance < 0) {
      warnings.push(createDebtFactWarning(
        "negative-scalar-debt-balance",
        "Scalar debt source had a negative balance and was not projected into debtFacts.",
        { sourceKey, categoryKey }
      ));
    }

    if (warnings.length) {
      return {
        debt: null,
        warnings
      };
    }

    return {
      debt: {
        debtFactId: createScalarDebtFactId(sourceKey),
        categoryKey,
        typeKey: sourceKey,
        label: normalizeDebtRecordString(safeSourceField.label) || sourceKey,
        currentBalance,
        minimumMonthlyPayment: null,
        interestRatePercent: null,
        remainingTermMonths: null,
        securedBy: null,
        sourceKey,
        source: "protectionModeling.data",
        isHousingFieldOwned: safeSourceField.isHousingFieldOwned === true,
        isScalarCompatibilityDebt: true,
        isRepeatableDebtRecord: false,
        isCustomDebt: false,
        metadata: {
          sourceType: "user-input",
          confidence: "reported",
          canonicalDestination: "debtFacts.debts",
          recordSource: "scalar-compatibility-field",
          owner: normalizeDebtRecordString(safeSourceField.owner) || null,
          taxonomyCategoryLabel: taxonomyCategory && taxonomyCategory.label ? taxonomyCategory.label : null,
          duplicateProtection: safeSourceField.duplicateProtection || null
        }
      },
      warnings
    };
  }

  function createDebtFactFromDebtRecord(debtRecord, index, taxonomy) {
    const safeDebtRecord = debtRecord && typeof debtRecord === "object" ? debtRecord : {};
    const warnings = [];
    const categoryKey = normalizeDebtRecordString(safeDebtRecord.categoryKey);
    const typeKey = normalizeDebtRecordString(safeDebtRecord.typeKey);
    const taxonomyCategory = getDebtCategoryByKey(taxonomy, categoryKey);
    const libraryEntry = getDebtLibraryEntry(typeKey);
    const currentBalance = toOptionalNumber(safeDebtRecord.currentBalance);
    const debtId = normalizeDebtRecordString(safeDebtRecord.debtId);

    if (
      isBlockedDebtFactKey(categoryKey)
      || isBlockedDebtFactKey(typeKey)
      || isBlockedDebtFactKey(safeDebtRecord.sourceKey)
    ) {
      warnings.push(createDebtFactWarning(
        "equity-debt-record-rejected",
        "Equity fields are not debt facts and were not projected into debtFacts.",
        { index, categoryKey: categoryKey || null, typeKey: typeKey || null }
      ));
    }

    if (typeKey === "primaryResidenceMortgage" || (libraryEntry && libraryEntry.isHousingFieldOwned === true)) {
      warnings.push(createDebtFactWarning(
        "protected-mortgage-debt-record-rejected",
        "Primary residence mortgage debtRecords are ignored because mortgageBalance is the housing-owned source.",
        { index, debtId: debtId || null, typeKey: typeKey || null, ownedByField: libraryEntry?.ownedByField || "mortgageBalance" }
      ));
    }

    if (libraryEntry && libraryEntry.isAddable === false) {
      warnings.push(createDebtFactWarning(
        "non-addable-debt-record-rejected",
        "Non-addable debt library entries are not projected into debtFacts.",
        { index, debtId: debtId || null, typeKey: typeKey || null }
      ));
    }

    if (!categoryKey) {
      warnings.push(createDebtFactWarning(
        "missing-debt-record-category",
        "Debt record is missing a categoryKey.",
        { index, debtId: debtId || null }
      ));
    } else if (!taxonomyCategory) {
      warnings.push(createDebtFactWarning(
        "unknown-debt-record-category",
        "Debt record categoryKey is not present in the debt taxonomy.",
        { index, debtId: debtId || null, categoryKey }
      ));
    }

    if (!typeKey) {
      warnings.push(createDebtFactWarning(
        "missing-debt-record-type",
        "Debt record is missing a typeKey.",
        { index, debtId: debtId || null, categoryKey: categoryKey || null }
      ));
    } else if (!libraryEntry) {
      warnings.push(createDebtFactWarning(
        "unknown-debt-record-type",
        "Debt record typeKey is not present in the debt library.",
        { index, debtId: debtId || null, typeKey }
      ));
    } else if (categoryKey && libraryEntry.categoryKey !== categoryKey) {
      warnings.push(createDebtFactWarning(
        "debt-record-category-type-mismatch",
        "Debt record categoryKey does not match the debt library entry categoryKey.",
        {
          index,
          debtId: debtId || null,
          typeKey,
          categoryKey,
          expectedCategoryKey: libraryEntry.categoryKey
        }
      ));
    }

    if (currentBalance == null) {
      warnings.push(createDebtFactWarning(
        "missing-debt-record-balance",
        "Debt record is missing a numeric currentBalance.",
        { index, debtId: debtId || null, categoryKey: categoryKey || null, typeKey: typeKey || null }
      ));
    } else if (currentBalance < 0) {
      warnings.push(createDebtFactWarning(
        "negative-debt-record-balance",
        "Debt record had a negative currentBalance and was not projected into debtFacts.",
        { index, debtId: debtId || null, categoryKey: categoryKey || null, typeKey: typeKey || null }
      ));
    }

    if (warnings.length) {
      return {
        debt: null,
        warnings
      };
    }

    const metadata = safeDebtRecord.metadata && typeof safeDebtRecord.metadata === "object"
      ? clonePlainValue(safeDebtRecord.metadata)
      : {};
    const libraryEntryKey = normalizeDebtRecordString(
      metadata.libraryEntryKey || safeDebtRecord.libraryEntryKey || typeKey
    );

    return {
      debt: {
        debtFactId: debtId || createFallbackDebtRecordFactId(safeDebtRecord, index),
        categoryKey,
        typeKey,
        label: normalizeDebtRecordString(safeDebtRecord.label)
          || normalizeDebtRecordString(libraryEntry && libraryEntry.label)
          || typeKey,
        currentBalance,
        minimumMonthlyPayment: toOptionalNonNegativeNumber(safeDebtRecord.minimumMonthlyPayment),
        interestRatePercent: toOptionalNonNegativeNumber(safeDebtRecord.interestRatePercent),
        remainingTermMonths: toOptionalNonNegativeNumber(safeDebtRecord.remainingTermMonths),
        securedBy: normalizeDebtRecordString(safeDebtRecord.securedBy) || null,
        sourceKey: normalizeDebtRecordString(safeDebtRecord.sourceKey) || null,
        source: "protectionModeling.data.debtRecords",
        isHousingFieldOwned: false,
        isScalarCompatibilityDebt: false,
        isRepeatableDebtRecord: true,
        isCustomDebt: safeDebtRecord.isCustomDebt === true || typeKey === "customDebt" || categoryKey === "otherDebt",
        metadata: Object.assign({}, metadata, {
          sourceType: "user-input",
          confidence: metadata.confidence || "reported",
          canonicalDestination: "debtFacts.debts",
          recordSource: "debtRecords",
          sourceIndex: Number.isInteger(index) ? index : null,
          taxonomyCategoryLabel: taxonomyCategory && taxonomyCategory.label ? taxonomyCategory.label : null,
          libraryEntryKey,
          libraryLabel: libraryEntry && libraryEntry.label ? libraryEntry.label : null
        })
      },
      warnings
    };
  }

  function createDebtFactsFromDebtRecords(sourceData, taxonomy) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const sourceRecords = Array.isArray(safeSourceData.debtRecords) ? safeSourceData.debtRecords : [];
    const debts = [];
    const warnings = [];

    sourceRecords.forEach(function (debtRecord, index) {
      const result = createDebtFactFromDebtRecord(debtRecord, index, taxonomy);
      warnings.push.apply(warnings, result.warnings);

      if (result.debt) {
        debts.push(result.debt);
      }
    });

    return {
      debts,
      sourceRecordCount: sourceRecords.length,
      acceptedRecordCount: debts.length,
      invalidRecordCount: sourceRecords.length - debts.length,
      warnings
    };
  }

  function markDuplicateDebtFactIds(debts) {
    const seenDebtIds = {};
    const duplicateDebtIds = [];

    debts.forEach(function (debt) {
      const debtFactId = debt && debt.debtFactId ? debt.debtFactId : null;
      if (!debtFactId) {
        return;
      }

      if (seenDebtIds[debtFactId]) {
        if (duplicateDebtIds.indexOf(debtFactId) === -1) {
          duplicateDebtIds.push(debtFactId);
        }
        debt.metadata = Object.assign({}, debt.metadata, {
          duplicateDebtId: true
        });
        return;
      }

      seenDebtIds[debtFactId] = true;
    });

    return duplicateDebtIds;
  }

  function createDebtFactsFromSourceData(sourceData) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const taxonomy = getDebtTaxonomy();
    const debts = [];
    const warnings = [];

    taxonomy.scalarSourceFields.forEach(function (sourceField) {
      const result = createDebtFactFromScalarSource(safeSourceData, sourceField, taxonomy);
      warnings.push.apply(warnings, result.warnings);

      if (result.debt) {
        debts.push(result.debt);
      }
    });

    const debtRecordsProjection = createDebtFactsFromDebtRecords(safeSourceData, taxonomy);
    debts.push.apply(debts, debtRecordsProjection.debts);
    warnings.push.apply(warnings, debtRecordsProjection.warnings);
    const duplicateDebtIds = markDuplicateDebtFactIds(debts);

    duplicateDebtIds.forEach(function (debtId) {
      warnings.push(createDebtFactWarning(
        "duplicate-debt-fact-id",
        "Multiple debt facts share the same debtFactId; records were kept and marked for review.",
        { debtFactId: debtId }
      ));
    });

    const manualTotalDebtPayoffOverride = toOptionalBoolean(safeSourceData.totalDebtPayoffNeedManualOverride) === true;

    return {
      debts,
      totalReportedDebtBalance: sumOptionalBucketComponents(debts.map(function (debt) {
        return debt.currentBalance;
      })),
      metadata: {
        source: "protectionModeling.data",
        taxonomySource: taxonomy.taxonomySource,
        scalarDebtSource: "scalar-compatibility-fields",
        debtRecordsSource: "protectionModeling.data.debtRecords",
        scalarDebtSourceFieldCount: taxonomy.scalarSourceFields.length,
        acceptedScalarDebtCount: debts.filter(function (debt) {
          return debt && debt.isScalarCompatibilityDebt === true;
        }).length,
        debtRecordCount: debtRecordsProjection.sourceRecordCount,
        acceptedDebtRecordCount: debtRecordsProjection.acceptedRecordCount,
        invalidDebtRecordCount: debtRecordsProjection.invalidRecordCount,
        duplicateDebtIds,
        manualTotalDebtPayoffOverride,
        manualTotalDebtPayoffNeed: manualTotalDebtPayoffOverride
          ? toOptionalNumber(safeSourceData.totalDebtPayoffNeed)
          : null,
        manualOverrideSource: manualTotalDebtPayoffOverride
          ? "debtPayoff.totalDebtPayoffNeed"
          : null,
        warnings
      }
    };
  }

  function applyDebtFactsProjection(lensModel, options) {
    const safeLensModel = lensModel && typeof lensModel === "object" ? lensModel : {};
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const projection = createDebtFactsFromSourceData(normalizedOptions.sourceData);

    if (!safeLensModel.debtFacts || typeof safeLensModel.debtFacts !== "object") {
      safeLensModel.debtFacts = {};
    }

    safeLensModel.debtFacts.debts = projection.debts;
    safeLensModel.debtFacts.totalReportedDebtBalance = projection.totalReportedDebtBalance;
    safeLensModel.debtFacts.metadata = projection.metadata;

    return projection.metadata;
  }

  function normalizeExpenseRecordString(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeExpenseRecordToken(value) {
    return normalizeExpenseRecordString(value)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function getExpenseTaxonomy() {
    const taxonomy = lensAnalysis.expenseTaxonomy && typeof lensAnalysis.expenseTaxonomy === "object"
      ? lensAnalysis.expenseTaxonomy
      : {};
    const categories = Array.isArray(taxonomy.DEFAULT_EXPENSE_CATEGORIES)
      ? taxonomy.DEFAULT_EXPENSE_CATEGORIES
      : [];

    return {
      categories,
      taxonomySource: categories.length ? "expense-taxonomy" : "unavailable"
    };
  }

  function getExpenseCategoryByKey(taxonomy, categoryKey) {
    const safeTaxonomy = taxonomy && typeof taxonomy === "object" ? taxonomy : {};
    const categories = Array.isArray(safeTaxonomy.categories) ? safeTaxonomy.categories : [];
    const safeCategoryKey = normalizeExpenseRecordString(categoryKey);

    if (!safeCategoryKey) {
      return null;
    }

    return categories.find(function (category) {
      return category && category.categoryKey === safeCategoryKey;
    }) || null;
  }

  function getExpenseLibraryEntry(typeKey) {
    const expenseLibrary = lensAnalysis.expenseLibrary && typeof lensAnalysis.expenseLibrary === "object"
      ? lensAnalysis.expenseLibrary
      : {};

    if (typeof expenseLibrary.getExpenseLibraryEntry === "function") {
      return expenseLibrary.getExpenseLibraryEntry(typeKey);
    }

    const entries = Array.isArray(expenseLibrary.EXPENSE_LIBRARY_ENTRIES)
      ? expenseLibrary.EXPENSE_LIBRARY_ENTRIES
      : [];
    const safeTypeKey = normalizeExpenseRecordString(typeKey);
    return entries.find(function (entry) {
      return entry && entry.typeKey === safeTypeKey;
    }) || null;
  }

  function hasUsableExpenseSourceValue(sourceData, sourceKey) {
    if (!sourceData || typeof sourceData !== "object" || !sourceKey) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(sourceData, sourceKey)) {
      return false;
    }

    const rawValue = sourceData[sourceKey];
    return rawValue != null && String(rawValue).trim() !== "";
  }

  function createExpenseFactWarning(code, message, details) {
    return {
      code,
      message,
      details: details || null
    };
  }

  function createScalarExpenseFactId(sourceKey) {
    return "scalar_expense_" + (normalizeExpenseRecordToken(sourceKey) || "unknown");
  }

  function createExpenseRecordFactId(expenseRecord, index) {
    const safeExpenseRecord = expenseRecord && typeof expenseRecord === "object" ? expenseRecord : {};
    const expenseRecordId = normalizeExpenseRecordString(safeExpenseRecord.expenseId)
      || normalizeExpenseRecordString(safeExpenseRecord.id)
      || ("expense_record_" + (index + 1));

    return "expense_record_" + (normalizeExpenseRecordToken(expenseRecordId) || (index + 1));
  }

  function normalizeExpenseFrequencyStrict(frequency) {
    const normalizedFrequency = normalizeExpenseRecordString(frequency);
    const taxonomy = lensAnalysis.expenseTaxonomy && typeof lensAnalysis.expenseTaxonomy === "object"
      ? lensAnalysis.expenseTaxonomy
      : {};

    if (typeof taxonomy.isValidExpenseFrequency === "function") {
      return taxonomy.isValidExpenseFrequency(normalizedFrequency) ? normalizedFrequency : null;
    }

    if (normalizedFrequency === "oneTime"
      || Object.prototype.hasOwnProperty.call(EXPENSE_FREQUENCY_ANNUALIZATION_FACTORS, normalizedFrequency)) {
      return normalizedFrequency;
    }

    return null;
  }

  function normalizeExpenseTermTypeStrict(termType) {
    const normalizedTermType = normalizeExpenseRecordString(termType);
    const taxonomy = lensAnalysis.expenseTaxonomy && typeof lensAnalysis.expenseTaxonomy === "object"
      ? lensAnalysis.expenseTaxonomy
      : {};

    if (typeof taxonomy.isValidExpenseTermType === "function") {
      return taxonomy.isValidExpenseTermType(normalizedTermType) ? normalizedTermType : null;
    }

    return ["ongoing", "fixedYears", "untilAge", "untilDate", "oneTime"].indexOf(normalizedTermType) === -1
      ? null
      : normalizedTermType;
  }

  function normalizeOptionalExpenseRecordNumber(value) {
    const numericValue = toOptionalNumber(value);
    return numericValue == null || numericValue < 0 ? null : numericValue;
  }

  function calculateRepeatableExpenseAmounts(amount, frequency) {
    if (frequency === "oneTime") {
      return {
        annualizedAmount: null,
        oneTimeAmount: amount
      };
    }

    const factor = EXPENSE_FREQUENCY_ANNUALIZATION_FACTORS[frequency];
    return {
      annualizedAmount: Number.isFinite(factor) ? amount * factor : null,
      oneTimeAmount: null
    };
  }

  function isCustomExpenseRecord(typeKey, record, libraryEntry) {
    return typeKey === "customExpenseRecord"
      || record?.isCustomExpense === true
      || libraryEntry?.isCustomType === true;
  }

  function createExpenseFactFromExpenseRecord(expenseRecord, index, taxonomy) {
    const safeExpenseRecord = expenseRecord && typeof expenseRecord === "object" ? expenseRecord : {};
    const warnings = [];
    const rawTypeKey = normalizeExpenseRecordString(safeExpenseRecord.typeKey);
    const hasCustomFallback = safeExpenseRecord.isCustomExpense === true || rawTypeKey === "customExpenseRecord";
    const typeKey = rawTypeKey || (hasCustomFallback ? "customExpenseRecord" : "");
    const libraryEntry = typeKey ? getExpenseLibraryEntry(typeKey) : null;
    const customRecord = isCustomExpenseRecord(typeKey, safeExpenseRecord, libraryEntry);
    const categoryKey = normalizeExpenseRecordString(safeExpenseRecord.categoryKey)
      || (customRecord ? "customExpense" : normalizeExpenseRecordString(libraryEntry?.categoryKey));
    const taxonomyCategory = getExpenseCategoryByKey(taxonomy, categoryKey);
    const amount = toOptionalNumber(safeExpenseRecord.amount);
    const frequency = normalizeExpenseFrequencyStrict(safeExpenseRecord.frequency);
    const termType = normalizeExpenseTermTypeStrict(safeExpenseRecord.termType);
    const details = {
      index,
      expenseId: normalizeExpenseRecordString(safeExpenseRecord.expenseId) || null,
      typeKey: typeKey || null,
      categoryKey: categoryKey || null
    };

    if (!typeKey) {
      warnings.push(createExpenseFactWarning(
        "missing-expense-record-type",
        "Expense record is missing a typeKey and was not projected into expenseFacts.",
        details
      ));
    } else if (!libraryEntry) {
      warnings.push(createExpenseFactWarning(
        "unknown-expense-record-type",
        "Expense record typeKey is not present in the expense library.",
        details
      ));
    }

    if (libraryEntry && (libraryEntry.isProtected === true || libraryEntry.isScalarFieldOwned === true)) {
      warnings.push(createExpenseFactWarning(
        "protected-scalar-expense-record-rejected",
        "Protected scalar-owned final expense rows must remain single-source scalar fields and were not projected from expenseRecords.",
        details
      ));
    } else if (libraryEntry && libraryEntry.isAddable !== true) {
      warnings.push(createExpenseFactWarning(
        "non-addable-expense-record-rejected",
        "Expense record typeKey is not addable and was not projected into expenseFacts.",
        details
      ));
    }

    if (!categoryKey) {
      warnings.push(createExpenseFactWarning(
        "missing-expense-record-category",
        "Expense record is missing a categoryKey.",
        details
      ));
    } else if (!taxonomyCategory) {
      warnings.push(createExpenseFactWarning(
        "unknown-expense-record-category",
        "Expense record categoryKey is not present in the expense taxonomy.",
        details
      ));
    } else if (libraryEntry && !customRecord && libraryEntry.categoryKey !== categoryKey) {
      warnings.push(createExpenseFactWarning(
        "expense-record-category-type-mismatch",
        "Expense record categoryKey does not match the expense library entry categoryKey.",
        Object.assign({}, details, { expectedCategoryKey: libraryEntry.categoryKey })
      ));
    }

    if (amount == null) {
      warnings.push(createExpenseFactWarning(
        "missing-expense-record-amount",
        "Expense record is missing a numeric amount.",
        details
      ));
    } else if (amount < 0) {
      warnings.push(createExpenseFactWarning(
        "negative-expense-record-amount",
        "Expense record has a negative amount and was not projected into expenseFacts.",
        details
      ));
    }

    if (!frequency) {
      warnings.push(createExpenseFactWarning(
        "invalid-expense-record-frequency",
        "Expense record frequency is not present in the expense taxonomy.",
        details
      ));
    }

    if (!termType) {
      warnings.push(createExpenseFactWarning(
        "invalid-expense-record-term-type",
        "Expense record termType is not present in the expense taxonomy.",
        details
      ));
    }

    if (warnings.length) {
      return {
        expense: null,
        warnings
      };
    }

    const normalizedAmounts = calculateRepeatableExpenseAmounts(amount, frequency);
    const expenseFactId = createExpenseRecordFactId(safeExpenseRecord, index);
    const expenseRecordId = normalizeExpenseRecordString(safeExpenseRecord.expenseId)
      || normalizeExpenseRecordString(safeExpenseRecord.id)
      || null;
    const termYears = termType === "fixedYears"
      ? normalizeOptionalExpenseRecordNumber(safeExpenseRecord.termYears)
      : null;
    const endAge = termType === "untilAge"
      ? normalizeOptionalExpenseRecordNumber(safeExpenseRecord.endAge)
      : null;
    const endDate = termType === "untilDate"
      ? (normalizeExpenseRecordString(safeExpenseRecord.endDate) || null)
      : null;

    return {
      expense: {
        expenseFactId,
        expenseRecordId,
        typeKey,
        categoryKey,
        label: normalizeExpenseRecordString(safeExpenseRecord.label)
          || normalizeExpenseRecordString(libraryEntry?.label)
          || normalizeExpenseRecordString(taxonomyCategory?.label)
          || (customRecord ? "Custom Expense" : typeKey),
        domain: normalizeExpenseRecordString(taxonomyCategory?.domain) || null,
        amount,
        frequency,
        termType,
        termYears,
        endAge,
        endDate,
        source: EXPENSE_RECORDS_SOURCE_PATH,
        sourceKey: "expenseRecords",
        sourcePath: EXPENSE_RECORDS_SOURCE_PATH + "[" + index + "]",
        sourceIndex: index,
        isDefaultExpense: false,
        isScalarFieldOwned: false,
        isProtected: false,
        isAddable: true,
        isRepeatableExpenseRecord: true,
        isCustomExpense: customRecord,
        isFinalExpenseComponent: taxonomyCategory?.isFinalExpenseComponent === true,
        isHealthcareSensitive: taxonomyCategory?.isHealthcareSensitive === true,
        defaultInflationRole: normalizeExpenseRecordString(taxonomyCategory?.defaultInflationRole) || null,
        uiAvailability: normalizeExpenseRecordString(libraryEntry?.uiAvailability) || null,
        annualizedAmount: normalizedAmounts.annualizedAmount,
        oneTimeAmount: normalizedAmounts.oneTimeAmount,
        metadata: {
          sourceType: "user-input",
          confidence: "reported",
          canonicalDestination: "expenseFacts.expenses",
          recordSource: "expenseRecords",
          sourceIndex: index,
          taxonomyCategoryLabel: taxonomyCategory && taxonomyCategory.label ? taxonomyCategory.label : null,
          libraryEntryKey: normalizeExpenseRecordString(libraryEntry?.libraryEntryKey) || typeKey,
          libraryLabel: libraryEntry && libraryEntry.label ? libraryEntry.label : null
        }
      },
      warnings
    };
  }

  function createExpenseFactsFromExpenseRecords(sourceData, taxonomy) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const sourceRecords = Array.isArray(safeSourceData.expenseRecords)
      ? safeSourceData.expenseRecords
      : [];
    const expenses = [];
    const warnings = [];

    sourceRecords.forEach(function (expenseRecord, index) {
      const result = createExpenseFactFromExpenseRecord(expenseRecord, index, taxonomy);
      warnings.push.apply(warnings, result.warnings);

      if (result.expense) {
        expenses.push(result.expense);
      }
    });

    return {
      expenses,
      sourceRecordCount: sourceRecords.length,
      acceptedRecordCount: expenses.length,
      invalidRecordCount: sourceRecords.length - expenses.length,
      warnings
    };
  }

  function createExpenseFactFromScalarSource(sourceData, sourceField, taxonomy) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const safeSourceField = sourceField && typeof sourceField === "object" ? sourceField : {};
    const sourceKey = normalizeExpenseRecordString(safeSourceField.sourceKey);
    const typeKey = normalizeExpenseRecordString(safeSourceField.typeKey);
    const warnings = [];

    if (!sourceKey || !hasUsableExpenseSourceValue(safeSourceData, sourceKey)) {
      return {
        expense: null,
        warnings
      };
    }

    const libraryEntry = getExpenseLibraryEntry(typeKey);
    const categoryKey = normalizeExpenseRecordString(libraryEntry?.categoryKey)
      || normalizeExpenseRecordString(safeSourceField.categoryKey);
    const taxonomyCategory = getExpenseCategoryByKey(taxonomy, categoryKey);
    const amount = toOptionalNumber(safeSourceData[sourceKey]);

    if (!libraryEntry) {
      warnings.push(createExpenseFactWarning(
        "unknown-scalar-expense-type",
        "Scalar expense source typeKey is not present in the expense library.",
        { sourceKey, typeKey }
      ));
    }

    if (!categoryKey) {
      warnings.push(createExpenseFactWarning(
        "missing-scalar-expense-category",
        "Scalar expense source metadata is missing a categoryKey.",
        { sourceKey, typeKey }
      ));
    } else if (!taxonomyCategory) {
      warnings.push(createExpenseFactWarning(
        "unknown-scalar-expense-category",
        "Scalar expense source categoryKey is not present in the expense taxonomy.",
        { sourceKey, typeKey, categoryKey }
      ));
    }

    if (amount == null) {
      warnings.push(createExpenseFactWarning(
        "invalid-scalar-expense-amount",
        "Scalar expense source is missing a numeric amount.",
        { sourceKey, typeKey, categoryKey: categoryKey || null }
      ));
    } else if (amount < 0) {
      warnings.push(createExpenseFactWarning(
        "negative-scalar-expense-amount",
        "Scalar expense source had a negative amount and was not projected into expenseFacts.",
        { sourceKey, typeKey, categoryKey: categoryKey || null }
      ));
    }

    if (warnings.length) {
      return {
        expense: null,
        warnings
      };
    }

    return {
      expense: {
        expenseFactId: createScalarExpenseFactId(sourceKey),
        typeKey,
        categoryKey,
        label: normalizeExpenseRecordString(libraryEntry?.label)
          || normalizeExpenseRecordString(taxonomyCategory?.label)
          || typeKey,
        domain: normalizeExpenseRecordString(taxonomyCategory?.domain) || null,
        amount,
        frequency: normalizeExpenseRecordString(libraryEntry?.defaultFrequency) || "oneTime",
        termType: normalizeExpenseRecordString(libraryEntry?.defaultTermType) || "oneTime",
        source: "protectionModeling.data",
        sourceKey,
        sourcePath: normalizeExpenseRecordString(libraryEntry?.sourcePath)
          || ("protectionModeling.data." + sourceKey),
        ownedByField: normalizeExpenseRecordString(libraryEntry?.ownedByField) || sourceKey,
        isDefaultExpense: libraryEntry?.isDefaultExpense === true,
        isScalarFieldOwned: libraryEntry?.isScalarFieldOwned === true,
        isProtected: libraryEntry?.isProtected === true,
        isAddable: false,
        isRepeatableExpenseRecord: false,
        isFinalExpenseComponent: taxonomyCategory?.isFinalExpenseComponent === true,
        isHealthcareSensitive: taxonomyCategory?.isHealthcareSensitive === true,
        defaultInflationRole: normalizeExpenseRecordString(taxonomyCategory?.defaultInflationRole) || null,
        uiAvailability: normalizeExpenseRecordString(libraryEntry?.uiAvailability) || null,
        metadata: {
          sourceType: "user-input",
          confidence: "reported",
          canonicalDestination: "expenseFacts.expenses",
          recordSource: "final-expense-scalar-field",
          sourceIndex: null,
          taxonomyCategoryLabel: taxonomyCategory && taxonomyCategory.label ? taxonomyCategory.label : null,
          libraryEntryKey: normalizeExpenseRecordString(libraryEntry?.libraryEntryKey) || typeKey,
          libraryLabel: libraryEntry && libraryEntry.label ? libraryEntry.label : null,
          duplicateProtection: libraryEntry?.duplicateProtection || null
        }
      },
      warnings
    };
  }

  function getExpenseFactTotalAmount(expense) {
    if (!expense || typeof expense !== "object") {
      return null;
    }

    if (expense.isRepeatableExpenseRecord === true) {
      if (expense.frequency === "oneTime") {
        return toOptionalNumber(expense.oneTimeAmount);
      }

      return toOptionalNumber(expense.annualizedAmount);
    }

    return toOptionalNumber(expense.amount);
  }

  function getExpenseFactOneTimeAmount(expense) {
    if (!expense || typeof expense !== "object") {
      return null;
    }

    if (expense.isRepeatableExpenseRecord === true) {
      return expense.frequency === "oneTime" ? toOptionalNumber(expense.oneTimeAmount) : null;
    }

    return expense.frequency === "oneTime" ? toOptionalNumber(expense.amount) : null;
  }

  function getExpenseFactAnnualRecurringAmount(expense) {
    if (!expense || typeof expense !== "object" || expense.isRepeatableExpenseRecord !== true) {
      return null;
    }

    return expense.frequency === "oneTime" ? null : toOptionalNumber(expense.annualizedAmount);
  }

  function sumExpenseFacts(expenses, predicate, amountSelector) {
    return sumOptionalBucketComponents(expenses
      .filter(predicate)
      .map(amountSelector));
  }

  function calculateExpenseFactsTotalsByBucket(expenses) {
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const totalsByBucket = {};

    safeExpenses.forEach(function (expense) {
      const categoryKey = normalizeExpenseRecordString(expense?.categoryKey);
      const amount = getExpenseFactTotalAmount(expense);

      if (!categoryKey || amount == null) {
        return;
      }

      totalsByBucket[categoryKey] = sumOptionalBucketComponents([
        totalsByBucket[categoryKey],
        amount
      ]);
    });

    ["medicalFinalExpense", "funeralBurial", "estateSettlement", "otherFinalExpense"].forEach(function (categoryKey) {
      if (!Object.prototype.hasOwnProperty.call(totalsByBucket, categoryKey)) {
        totalsByBucket[categoryKey] = null;
      }
    });

    totalsByBucket.totalScalarFinalExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.isFinalExpenseComponent === true && expense.isScalarFieldOwned === true;
      },
      getExpenseFactTotalAmount
    );
    totalsByBucket.totalRepeatableFinalExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.isFinalExpenseComponent === true && expense.isRepeatableExpenseRecord === true;
      },
      getExpenseFactTotalAmount
    );
    totalsByBucket.totalFinalExpense = sumOptionalBucketComponents([
      totalsByBucket.totalScalarFinalExpense,
      totalsByBucket.totalRepeatableFinalExpense
    ]);
    totalsByBucket.totalHealthcareSensitiveExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.isHealthcareSensitive === true;
      },
      getExpenseFactTotalAmount
    );
    totalsByBucket.totalNonMedicalFinalExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.isFinalExpenseComponent === true && expense.isHealthcareSensitive !== true;
      },
      getExpenseFactTotalAmount
    );
    totalsByBucket.totalHealthcareExpense = totalsByBucket.totalHealthcareSensitiveExpense;
    totalsByBucket.totalAnnualRecurringExpense = sumExpenseFacts(
      safeExpenses,
      function () {
        return true;
      },
      getExpenseFactAnnualRecurringAmount
    );
    totalsByBucket.totalOneTimeExpense = sumExpenseFacts(
      safeExpenses,
      function () {
        return true;
      },
      getExpenseFactOneTimeAmount
    );
    totalsByBucket.totalAnnualHealthcareExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.isHealthcareSensitive === true;
      },
      getExpenseFactAnnualRecurringAmount
    );
    totalsByBucket.totalOneTimeHealthcareExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.isHealthcareSensitive === true;
      },
      getExpenseFactOneTimeAmount
    );
    totalsByBucket.totalAnnualLivingExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.domain === "living";
      },
      getExpenseFactAnnualRecurringAmount
    );
    totalsByBucket.totalAnnualEducationExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.domain === "education";
      },
      getExpenseFactAnnualRecurringAmount
    );
    totalsByBucket.totalAnnualBusinessExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.domain === "business";
      },
      getExpenseFactAnnualRecurringAmount
    );
    totalsByBucket.totalAnnualCustomExpense = sumExpenseFacts(
      safeExpenses,
      function (expense) {
        return expense.domain === "custom";
      },
      getExpenseFactAnnualRecurringAmount
    );

    return totalsByBucket;
  }

  function createExpenseFactsFromSourceData(sourceData) {
    const safeSourceData = sourceData && typeof sourceData === "object" ? sourceData : {};
    const taxonomy = getExpenseTaxonomy();
    const expenses = [];
    const scalarExpenses = [];
    const warnings = [];

    SCALAR_FINAL_EXPENSE_SOURCE_FIELDS.forEach(function (sourceField) {
      const result = createExpenseFactFromScalarSource(safeSourceData, sourceField, taxonomy);
      warnings.push.apply(warnings, result.warnings);

      if (result.expense) {
        expenses.push(result.expense);
        scalarExpenses.push(result.expense);
      }
    });

    const expenseRecordsProjection = createExpenseFactsFromExpenseRecords(safeSourceData, taxonomy);
    expenses.push.apply(expenses, expenseRecordsProjection.expenses);
    warnings.push.apply(warnings, expenseRecordsProjection.warnings);

    return {
      expenses,
      totalsByBucket: calculateExpenseFactsTotalsByBucket(expenses),
      metadata: {
        source: "protectionModeling.data",
        taxonomySource: taxonomy.taxonomySource,
        librarySource: lensAnalysis.expenseLibrary ? "expense-library" : "unavailable",
        scalarExpenseSource: "final-expense-scalar-fields",
        expenseRecordsSource: expenseRecordsProjection.sourceRecordCount ? EXPENSE_RECORDS_SOURCE_PATH : null,
        scalarExpenseSourceFieldCount: SCALAR_FINAL_EXPENSE_SOURCE_FIELDS.length,
        acceptedScalarExpenseCount: scalarExpenses.length,
        sourceExpenseRecordCount: expenseRecordsProjection.sourceRecordCount,
        acceptedExpenseRecordCount: expenseRecordsProjection.acceptedRecordCount,
        invalidExpenseRecordCount: expenseRecordsProjection.invalidRecordCount,
        warnings
      }
    };
  }

  function applyExpenseFactsProjection(lensModel, options) {
    const safeLensModel = lensModel && typeof lensModel === "object" ? lensModel : {};
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const projection = createExpenseFactsFromSourceData(normalizedOptions.sourceData);

    if (!safeLensModel.expenseFacts || typeof safeLensModel.expenseFacts !== "object") {
      safeLensModel.expenseFacts = {};
    }

    safeLensModel.expenseFacts.expenses = projection.expenses;
    safeLensModel.expenseFacts.totalsByBucket = projection.totalsByBucket;
    safeLensModel.expenseFacts.metadata = projection.metadata;

    return projection.metadata;
  }

  function normalizeBlockOutputValue(value, mapping) {
    const normalizedMapping = mapping && typeof mapping === "object" ? mapping : {};

    if (normalizedMapping.valueType === "boolean") {
      return toOptionalBoolean(value);
    }

    if (normalizedMapping.valueType === "string") {
      const normalized = String(value == null ? "" : value).trim();
      return normalized || null;
    }

    if (normalizedMapping.valueType === "array") {
      return Array.isArray(value) ? clonePlainValue(value) : [];
    }

    return toOptionalNumber(value);
  }

  function setBucketFieldValue(targetBucket, destinationField, value) {
    const path = String(destinationField || "").split(".").filter(Boolean);
    if (!targetBucket || typeof targetBucket !== "object" || !path.length) {
      return;
    }

    let cursor = targetBucket;
    path.slice(0, -1).forEach(function (pathPart) {
      if (!cursor[pathPart] || typeof cursor[pathPart] !== "object" || Array.isArray(cursor[pathPart])) {
        cursor[pathPart] = {};
      }
      cursor = cursor[pathPart];
    });

    cursor[path[path.length - 1]] = value;
  }

  function cloneOutputMetadata(outputMetadata, metadataKey, blockOutput) {
    if (!outputMetadata || typeof outputMetadata !== "object" || !metadataKey) {
      return null;
    }

    const sourceMetadata = outputMetadata[metadataKey];
    if (!sourceMetadata || typeof sourceMetadata !== "object") {
      return null;
    }

    const nextMetadata = clonePlainValue(sourceMetadata);
    nextMetadata.sourceBlockId = blockOutput && typeof blockOutput.blockId === "string"
      ? blockOutput.blockId
      : null;
    nextMetadata.sourceBlockType = blockOutput && typeof blockOutput.blockType === "string"
      ? blockOutput.blockType
      : null;
    return nextMetadata;
  }

  function normalizeBucketFromBlockOutput(targetBucket, blockOutputs, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const safeBlockOutputs = blockOutputs && typeof blockOutputs === "object" ? blockOutputs : {};
    const sources = Array.isArray(normalizedOptions.sources) && normalizedOptions.sources.length
      ? normalizedOptions.sources
      : [normalizedOptions];
    const hasSingleSource = sources.length === 1;
    const primaryBlockOutput = hasSingleSource
      ? safeBlockOutputs[sources[0].blockId]
      : null;
    const bucketNormalizationMetadata = {
      sourceBlockId: primaryBlockOutput && typeof primaryBlockOutput.blockId === "string"
        ? primaryBlockOutput.blockId
        : null,
      sourceBlockType: primaryBlockOutput && typeof primaryBlockOutput.blockType === "string"
        ? primaryBlockOutput.blockType
        : null,
      fields: {}
    };

    sources.forEach(function (source) {
      const blockOutput = safeBlockOutputs[source.blockId];
      const outputValues = blockOutput && typeof blockOutput.outputs === "object"
        ? blockOutput.outputs
        : {};
      const outputMetadata = blockOutput && typeof blockOutput.outputMetadata === "object"
        ? blockOutput.outputMetadata
        : {};

      source.mapping.forEach(function (mapping) {
        setBucketFieldValue(
          targetBucket,
          mapping.destinationField,
          normalizeBlockOutputValue(
            outputValues[mapping.sourceOutputKey],
            mapping
          )
        );
        bucketNormalizationMetadata.fields[mapping.destinationField] = cloneOutputMetadata(
          outputMetadata,
          mapping.sourceMetadataKey,
          blockOutput
        );
      });
    });

    return bucketNormalizationMetadata;
  }

  function sumOptionalBucketComponents(values) {
    let hasAnyValue = false;
    let total = 0;

    values.forEach(function (value) {
      const numericValue = toOptionalNumber(value);
      if (numericValue == null) {
        return;
      }

      hasAnyValue = true;
      total += numericValue;
    });

    return hasAnyValue ? total : null;
  }

  function createBucketCompositionMetadata(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const componentFields = Array.isArray(normalizedOptions.componentFields)
      ? normalizedOptions.componentFields.filter(Boolean)
      : [];
    const value = normalizedOptions.value;

    return {
      sourceType: value == null ? "missing" : "calculated",
      confidence: value == null ? "unknown" : "calculated_from_bucket_components",
      rawField: componentFields.length ? componentFields.join(" + ") : null,
      canonicalDestination: normalizedOptions.canonicalDestination || null,
      sourceBlockId: ONGOING_SUPPORT_COMPOSITION_BLOCK_ID,
      sourceBlockType: ONGOING_SUPPORT_COMPOSITION_BLOCK_TYPE
    };
  }

  function applyOngoingSupportComposition(targetBucket, normalizationMetadata) {
    const safeTargetBucket = targetBucket && typeof targetBucket === "object" ? targetBucket : {};
    const safeNormalizationMetadata = normalizationMetadata && typeof normalizationMetadata === "object"
      ? normalizationMetadata
      : {};
    const fieldMetadata = safeNormalizationMetadata.fields && typeof safeNormalizationMetadata.fields === "object"
      ? safeNormalizationMetadata.fields
      : (safeNormalizationMetadata.fields = {});

    const monthlyTotalEssentialSupportCost = sumOptionalBucketComponents([
      safeTargetBucket.monthlyHousingSupportCost,
      safeTargetBucket.monthlyNonHousingEssentialSupportCost
    ]);
    const annualTotalEssentialSupportCost = monthlyTotalEssentialSupportCost == null
      ? null
      : monthlyTotalEssentialSupportCost * 12;

    safeTargetBucket.monthlyTotalEssentialSupportCost = monthlyTotalEssentialSupportCost;
    safeTargetBucket.annualTotalEssentialSupportCost = annualTotalEssentialSupportCost;

    fieldMetadata.monthlyTotalEssentialSupportCost = createBucketCompositionMetadata({
      value: monthlyTotalEssentialSupportCost,
      componentFields: ["monthlyHousingSupportCost", "monthlyNonHousingEssentialSupportCost"],
      canonicalDestination: "ongoingSupport.monthlyTotalEssentialSupportCost"
    });
    fieldMetadata.annualTotalEssentialSupportCost = createBucketCompositionMetadata({
      value: annualTotalEssentialSupportCost,
      componentFields: ["monthlyTotalEssentialSupportCost"],
      canonicalDestination: "ongoingSupport.annualTotalEssentialSupportCost"
    });
  }

  function createLensModelFromBlockOutputs(blockOutputs, options) {
    const lensModel = createEmptyLensModelInstance();
    const incomeBasisNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.incomeBasis, blockOutputs, {
      blockId: INCOME_NET_INCOME_BLOCK_ID,
      mapping: INCOME_BASIS_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const debtPayoffNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.debtPayoff, blockOutputs, {
      blockId: DEBT_PAYOFF_BLOCK_ID,
      mapping: DEBT_PAYOFF_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const ongoingSupportNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.ongoingSupport, blockOutputs, {
      sources: [
        {
          blockId: HOUSING_ONGOING_SUPPORT_BLOCK_ID,
          mapping: ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP
        },
        {
          blockId: NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID,
          mapping: NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP
        }
      ]
    });
    const educationSupportNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.educationSupport, blockOutputs, {
      blockId: EDUCATION_SUPPORT_BLOCK_ID,
      mapping: EDUCATION_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const finalExpensesNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.finalExpenses, blockOutputs, {
      blockId: FINAL_EXPENSES_BLOCK_ID,
      mapping: FINAL_EXPENSES_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const transitionNeedsNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.transitionNeeds, blockOutputs, {
      blockId: TRANSITION_NEEDS_BLOCK_ID,
      mapping: TRANSITION_NEEDS_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const existingCoverageNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.existingCoverage, blockOutputs, {
      blockId: EXISTING_COVERAGE_BLOCK_ID,
      mapping: EXISTING_COVERAGE_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const offsetAssetsNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.offsetAssets, blockOutputs, {
      blockId: OFFSET_ASSETS_BLOCK_ID,
      mapping: OFFSET_ASSETS_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const survivorScenarioNormalizationMetadata = normalizeBucketFromBlockOutput(lensModel.survivorScenario, blockOutputs, {
      blockId: SURVIVOR_SCENARIO_BLOCK_ID,
      mapping: SURVIVOR_SCENARIO_BLOCK_OUTPUT_NORMALIZATION_MAP
    });
    const economicAssumptionsNormalizationMetadata = normalizeBucketFromBlockOutput(
      lensModel.assumptions.economicAssumptions,
      blockOutputs,
      {
        blockId: INCOME_NET_INCOME_BLOCK_ID,
        mapping: ECONOMIC_ASSUMPTIONS_BLOCK_OUTPUT_NORMALIZATION_MAP
      }
    );
    const taxContextNormalizationMetadata = normalizeBucketFromBlockOutput(
      lensModel.assumptions.taxContext,
      blockOutputs,
      {
        blockId: TAX_CONTEXT_BLOCK_ID,
        mapping: TAX_CONTEXT_BLOCK_OUTPUT_NORMALIZATION_MAP
      }
    );
    applyOngoingSupportComposition(lensModel.ongoingSupport, ongoingSupportNormalizationMetadata);
    const assetFactsNormalizationMetadata = applyAssetFactsProjection(lensModel, options);
    const debtFactsNormalizationMetadata = applyDebtFactsProjection(lensModel, options);
    const expenseFactsNormalizationMetadata = applyExpenseFactsProjection(lensModel, options);

    // Provenance stays outside the canonical bucket facts so future formulas
    // can read canonical buckets directly without mixing data and metadata.
    lensModel.normalizationMetadata = {
      incomeBasis: incomeBasisNormalizationMetadata,
      debtPayoff: debtPayoffNormalizationMetadata,
      debtFacts: debtFactsNormalizationMetadata,
      expenseFacts: expenseFactsNormalizationMetadata,
      ongoingSupport: ongoingSupportNormalizationMetadata,
      educationSupport: educationSupportNormalizationMetadata,
      finalExpenses: finalExpensesNormalizationMetadata,
      transitionNeeds: transitionNeedsNormalizationMetadata,
      existingCoverage: existingCoverageNormalizationMetadata,
      assetFacts: assetFactsNormalizationMetadata,
      offsetAssets: offsetAssetsNormalizationMetadata,
      survivorScenario: survivorScenarioNormalizationMetadata,
      assumptions: {
        taxContext: taxContextNormalizationMetadata,
        economicAssumptions: economicAssumptionsNormalizationMetadata
      }
    };

    return lensModel;
  }

  lensAnalysis.INCOME_NET_INCOME_BLOCK_ID = INCOME_NET_INCOME_BLOCK_ID;
  lensAnalysis.DEBT_PAYOFF_BLOCK_ID = DEBT_PAYOFF_BLOCK_ID;
  lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_ID = HOUSING_ONGOING_SUPPORT_BLOCK_ID;
  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID = NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID;
  lensAnalysis.EDUCATION_SUPPORT_BLOCK_ID = EDUCATION_SUPPORT_BLOCK_ID;
  lensAnalysis.FINAL_EXPENSES_BLOCK_ID = FINAL_EXPENSES_BLOCK_ID;
  lensAnalysis.TRANSITION_NEEDS_BLOCK_ID = TRANSITION_NEEDS_BLOCK_ID;
  lensAnalysis.EXISTING_COVERAGE_BLOCK_ID = EXISTING_COVERAGE_BLOCK_ID;
  lensAnalysis.OFFSET_ASSETS_BLOCK_ID = OFFSET_ASSETS_BLOCK_ID;
  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_ID = SURVIVOR_SCENARIO_BLOCK_ID;
  lensAnalysis.TAX_CONTEXT_BLOCK_ID = TAX_CONTEXT_BLOCK_ID;
  lensAnalysis.INCOME_BASIS_BLOCK_OUTPUT_NORMALIZATION_MAP = INCOME_BASIS_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.ECONOMIC_ASSUMPTIONS_BLOCK_OUTPUT_NORMALIZATION_MAP = ECONOMIC_ASSUMPTIONS_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.TAX_CONTEXT_BLOCK_OUTPUT_NORMALIZATION_MAP = TAX_CONTEXT_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.DEBT_PAYOFF_BLOCK_OUTPUT_NORMALIZATION_MAP = DEBT_PAYOFF_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP = ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP = NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.EDUCATION_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP = EDUCATION_SUPPORT_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.FINAL_EXPENSES_BLOCK_OUTPUT_NORMALIZATION_MAP = FINAL_EXPENSES_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.TRANSITION_NEEDS_BLOCK_OUTPUT_NORMALIZATION_MAP = TRANSITION_NEEDS_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.EXISTING_COVERAGE_BLOCK_OUTPUT_NORMALIZATION_MAP = EXISTING_COVERAGE_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.OFFSET_ASSETS_BLOCK_OUTPUT_NORMALIZATION_MAP = OFFSET_ASSETS_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_OUTPUT_NORMALIZATION_MAP = SURVIVOR_SCENARIO_BLOCK_OUTPUT_NORMALIZATION_MAP;
  lensAnalysis.createAssetFactsFromSourceData = createAssetFactsFromSourceData;
  lensAnalysis.applyAssetFactsProjection = applyAssetFactsProjection;
  lensAnalysis.createDebtFactsFromSourceData = createDebtFactsFromSourceData;
  lensAnalysis.applyDebtFactsProjection = applyDebtFactsProjection;
  lensAnalysis.createExpenseFactsFromSourceData = createExpenseFactsFromSourceData;
  lensAnalysis.applyExpenseFactsProjection = applyExpenseFactsProjection;
  lensAnalysis.createLensModelFromBlockOutputs = createLensModelFromBlockOutputs;
})();
