(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});
  const lensAnalysisDev = LensApp.lensAnalysisDev || (LensApp.lensAnalysisDev = {});

  // TEMP DEV ONLY: Lens pipeline inspection.
  // Remove or replace before production.

  const DEBUG_QUERY_PARAM = "lensIncomeDebug";
  const PANEL_ID = "lens-income-debug-panel";
  const STYLE_ID = "lens-income-debug-style";
  const TABLE_BODY_ID = "lens-income-debug-table-body";
  const SUMMARY_ID = "lens-income-debug-summary";
  const ASSET_DEBUG_OUTPUT_ID = "lens-asset-debug-output";
  const NET_INCOME_BLOCK_ID = lensAnalysis.NET_INCOME_BLOCK_ID || "income-net-income";
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
  const DEBUG_SCRIPT_LOADS = {};

  const HOUSING_RUNTIME_ONLY_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "housingStatus",
      destinationField: null
    }),
    Object.freeze({
      sourceOutputKey: "mortgageBalance",
      destinationField: null
    }),
    Object.freeze({
      sourceOutputKey: "monthlyAssociatedHousingCosts",
      destinationField: null
    })
  ]);

  // TEMP DEBUG/AUDIT ONLY.
  // These rows help compare the current authoritative housing-card total
  // against an independently recomputed monthly support total.
  const HOUSING_AUDIT_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "monthlyHousingSupportCost",
      destinationField: null
    }),
    Object.freeze({
      sourceOutputKey: "recomputedMonthlyHousingSupportCost",
      destinationField: null
    }),
    Object.freeze({
      sourceOutputKey: "housingSupportCostVariance",
      destinationField: null
    }),
    Object.freeze({
      sourceOutputKey: "housingSupportCostMatches",
      destinationField: null
    })
  ]);

  const INCOME_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "grossAnnualIncome",
      destinationField: "insuredGrossAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "netAnnualIncome",
      destinationField: "insuredNetAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "bonusVariableAnnualIncome",
      destinationField: "bonusVariableAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "annualEmployerBenefitsValue",
      destinationField: "annualEmployerBenefitsValue"
    }),
    Object.freeze({
      sourceOutputKey: "annualIncomeReplacementBase",
      destinationField: "annualIncomeReplacementBase"
    }),
    Object.freeze({
      sourceOutputKey: "spouseOrPartnerGrossAnnualIncome",
      destinationField: "spouseOrPartnerGrossAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "spouseOrPartnerNetAnnualIncome",
      destinationField: "spouseOrPartnerNetAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "insuredRetirementHorizonYears",
      destinationField: "insuredRetirementHorizonYears"
    })
  ]);

  const ECONOMIC_ASSUMPTIONS_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "incomeGrowthRatePercent",
      destinationField: "incomeGrowthRatePercent"
    })
  ]);

  const TAX_CONTEXT_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "maritalStatus",
      destinationField: "maritalStatus"
    }),
    Object.freeze({
      sourceOutputKey: "filingStatus",
      destinationField: "filingStatus"
    }),
    Object.freeze({
      sourceOutputKey: "stateOfResidence",
      destinationField: "stateOfResidence"
    }),
    Object.freeze({
      sourceOutputKey: "primaryDeductionMethod",
      destinationField: "primaryDeductionMethod"
    }),
    Object.freeze({
      sourceOutputKey: "spouseDeductionMethod",
      destinationField: "spouseDeductionMethod"
    }),
    Object.freeze({
      sourceOutputKey: "primaryItemizedDeductionAmount",
      destinationField: "primaryItemizedDeductionAmount"
    }),
    Object.freeze({
      sourceOutputKey: "spouseItemizedDeductionAmount",
      destinationField: "spouseItemizedDeductionAmount"
    })
  ]);

  const DEBT_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "mortgageBalance",
      destinationField: "mortgageBalance"
    }),
    Object.freeze({
      sourceOutputKey: "otherRealEstateLoanBalance",
      destinationField: "otherRealEstateLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "autoLoanBalance",
      destinationField: "autoLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "creditCardBalance",
      destinationField: "creditCardBalance"
    }),
    Object.freeze({
      sourceOutputKey: "studentLoanBalance",
      destinationField: "studentLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "personalLoanBalance",
      destinationField: "personalLoanBalance"
    }),
    Object.freeze({
      sourceOutputKey: "outstandingTaxLiabilities",
      destinationField: "outstandingTaxLiabilities"
    }),
    Object.freeze({
      sourceOutputKey: "businessDebtBalance",
      destinationField: "businessDebtBalance"
    }),
    Object.freeze({
      sourceOutputKey: "otherDebtPayoffNeeds",
      destinationField: "otherDebtPayoffNeeds"
    }),
    Object.freeze({
      sourceOutputKey: "totalDebtPayoffNeed",
      destinationField: "totalDebtPayoffNeed"
    })
  ]);

  const ONGOING_SUPPORT_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "monthlyMortgagePayment",
      destinationField: "monthlyMortgagePayment"
    }),
    Object.freeze({
      sourceOutputKey: "mortgageRemainingTermMonths",
      destinationField: "mortgageRemainingTermMonths"
    }),
    Object.freeze({
      sourceOutputKey: "mortgageInterestRatePercent",
      destinationField: "mortgageInterestRatePercent"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyRentOrHousingPayment",
      destinationField: "monthlyRentOrHousingPayment"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyOtherRenterHousingCost",
      destinationField: "monthlyOtherRenterHousingCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyUtilities",
      destinationField: "monthlyUtilities"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHousingInsurance",
      destinationField: "monthlyHousingInsurance"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyPropertyTax",
      destinationField: "monthlyPropertyTax"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHoaCost",
      destinationField: "monthlyHoaCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyMaintenanceAndRepairs",
      destinationField: "monthlyMaintenanceAndRepairs"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHousingSupportCost",
      destinationField: "monthlyHousingSupportCost"
    }),
    Object.freeze({
      sourceOutputKey: "annualHousingSupportCost",
      destinationField: "annualHousingSupportCost"
    })
  ]);

  const NON_HOUSING_ONGOING_SUPPORT_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "monthlyOtherInsuranceCost",
      destinationField: "monthlyOtherInsuranceCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHealthcareOutOfPocketCost",
      destinationField: "monthlyHealthcareOutOfPocketCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyFoodCost",
      destinationField: "monthlyFoodCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyTransportationCost",
      destinationField: "monthlyTransportationCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyChildcareAndDependentCareCost",
      destinationField: "monthlyChildcareAndDependentCareCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyPhoneAndInternetCost",
      destinationField: "monthlyPhoneAndInternetCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyHouseholdSuppliesCost",
      destinationField: "monthlyHouseholdSuppliesCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyOtherHouseholdExpenses",
      destinationField: "monthlyOtherHouseholdExpenses"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyNonHousingEssentialSupportCost",
      destinationField: "monthlyNonHousingEssentialSupportCost"
    }),
    Object.freeze({
      sourceOutputKey: "annualNonHousingEssentialSupportCost",
      destinationField: "annualNonHousingEssentialSupportCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyTravelAndDiscretionaryCost",
      destinationField: "monthlyTravelAndDiscretionaryCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlySubscriptionsCost",
      destinationField: "monthlySubscriptionsCost"
    }),
    Object.freeze({
      sourceOutputKey: "monthlyDiscretionaryPersonalSpending",
      destinationField: "monthlyDiscretionaryPersonalSpending"
    }),
    Object.freeze({
      sourceOutputKey: "annualDiscretionaryPersonalSpending",
      destinationField: "annualDiscretionaryPersonalSpending"
    })
  ]);

  const ONGOING_SUPPORT_COMPOSITION_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      destinationField: "monthlyTotalEssentialSupportCost"
    }),
    Object.freeze({
      destinationField: "annualTotalEssentialSupportCost"
    })
  ]);

  const EDUCATION_SUPPORT_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "linkedDependentCount",
      destinationField: "linkedDependentCount"
    }),
    Object.freeze({
      sourceOutputKey: "desiredAdditionalDependentCount",
      destinationField: "desiredAdditionalDependentCount"
    }),
    Object.freeze({
      sourceOutputKey: "perLinkedDependentEducationFunding",
      destinationField: "perLinkedDependentEducationFunding"
    }),
    Object.freeze({
      sourceOutputKey: "perDesiredAdditionalDependentEducationFunding",
      destinationField: "perDesiredAdditionalDependentEducationFunding"
    }),
    Object.freeze({
      sourceOutputKey: "sameEducationFundingForDesiredAdditionalDependents",
      destinationField: "sameEducationFundingForDesiredAdditionalDependents"
    }),
    Object.freeze({
      sourceOutputKey: "linkedDependentEducationFundingNeed",
      destinationField: "linkedDependentEducationFundingNeed"
    }),
    Object.freeze({
      sourceOutputKey: "desiredAdditionalDependentEducationFundingNeed",
      destinationField: "desiredAdditionalDependentEducationFundingNeed"
    }),
    Object.freeze({
      sourceOutputKey: "totalEducationFundingNeed",
      destinationField: "totalEducationFundingNeed"
    })
  ]);

  const FINAL_EXPENSES_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "funeralAndBurialCost",
      destinationField: "funeralAndBurialCost"
    }),
    Object.freeze({
      sourceOutputKey: "medicalEndOfLifeCost",
      destinationField: "medicalEndOfLifeCost"
    }),
    Object.freeze({
      sourceOutputKey: "estateSettlementCost",
      destinationField: "estateSettlementCost"
    }),
    Object.freeze({
      sourceOutputKey: "otherFinalExpenses",
      destinationField: "otherFinalExpenses"
    }),
    Object.freeze({
      sourceOutputKey: "totalFinalExpenseNeed",
      destinationField: "totalFinalExpenseNeed"
    })
  ]);

  const TRANSITION_NEEDS_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "survivorLiquidityBuffer",
      destinationField: "survivorLiquidityBuffer"
    }),
    Object.freeze({
      sourceOutputKey: "desiredEmergencyFund",
      destinationField: "desiredEmergencyFund"
    }),
    Object.freeze({
      sourceOutputKey: "housingTransitionReserve",
      destinationField: "housingTransitionReserve"
    }),
    Object.freeze({
      sourceOutputKey: "otherTransitionNeeds",
      destinationField: "otherTransitionNeeds"
    }),
    Object.freeze({
      sourceOutputKey: "totalTransitionNeed",
      destinationField: "totalTransitionNeed"
    })
  ]);

  const EXISTING_COVERAGE_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "profilePolicyCount",
      destinationField: "profilePolicyCount"
    }),
    Object.freeze({
      sourceOutputKey: "individualProfileCoverageTotal",
      destinationField: "individualProfileCoverageTotal"
    }),
    Object.freeze({
      sourceOutputKey: "groupProfileCoverageTotal",
      destinationField: "groupProfileCoverageTotal"
    }),
    Object.freeze({
      sourceOutputKey: "unclassifiedProfileCoverageTotal",
      destinationField: "unclassifiedProfileCoverageTotal"
    }),
    Object.freeze({
      sourceOutputKey: "totalProfileCoverage",
      destinationField: "totalProfileCoverage"
    }),
    Object.freeze({
      sourceOutputKey: "coverageSource",
      destinationField: "coverageSource"
    }),
    Object.freeze({
      sourceOutputKey: "totalExistingCoverage",
      destinationField: "totalExistingCoverage"
    })
  ]);

  function createOffsetAssetDebugFields() {
    const assetKeys = [
      "cashSavings",
      "currentEmergencyFund",
      "brokerageAccounts",
      "retirementAccounts",
      "realEstateEquity",
      "businessValue"
    ];
    const fields = assetKeys.reduce(function (nextFields, assetKey) {
      ["value", "includeInOffset", "liquidityType", "availablePercent", "availableValue"].forEach(function (fieldKey) {
        nextFields.push(Object.freeze({
          sourceOutputKey: assetKey + "." + fieldKey,
          destinationField: assetKey + "." + fieldKey
        }));
      });
      return nextFields;
    }, []);

    fields.push(
      Object.freeze({
        sourceOutputKey: "assetDataConfidence",
        destinationField: "assetDataConfidence"
      }),
      Object.freeze({
        sourceOutputKey: "totalReportedAssetValue",
        destinationField: "totalReportedAssetValue"
      }),
      Object.freeze({
        sourceOutputKey: "totalIncludedAssetValue",
        destinationField: "totalIncludedAssetValue"
      }),
      Object.freeze({
        sourceOutputKey: "totalAvailableOffsetAssetValue",
        destinationField: "totalAvailableOffsetAssetValue"
      })
    );

    return Object.freeze(fields);
  }

  const OFFSET_ASSETS_DEBUG_FIELDS = createOffsetAssetDebugFields();

  const SURVIVOR_SCENARIO_DEBUG_FIELDS = Object.freeze([
    Object.freeze({
      sourceOutputKey: "survivorContinuesWorking",
      destinationField: "survivorContinuesWorking"
    }),
    Object.freeze({
      sourceOutputKey: "expectedSurvivorWorkReductionPercent",
      destinationField: "expectedSurvivorWorkReductionPercent"
    }),
    Object.freeze({
      sourceOutputKey: "survivorGrossAnnualIncome",
      destinationField: "survivorGrossAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "survivorNetAnnualIncome",
      destinationField: "survivorNetAnnualIncome"
    }),
    Object.freeze({
      sourceOutputKey: "survivorIncomeStartDelayMonths",
      destinationField: "survivorIncomeStartDelayMonths"
    }),
    Object.freeze({
      sourceOutputKey: "survivorEarnedIncomeGrowthRatePercent",
      destinationField: "survivorEarnedIncomeGrowthRatePercent"
    }),
    Object.freeze({
      sourceOutputKey: "survivorRetirementHorizonYears",
      destinationField: "survivorRetirementHorizonYears"
    }),
    Object.freeze({
      sourceOutputKey: "survivorNetIncomeTaxBasis",
      destinationField: "survivorNetIncomeTaxBasis"
    })
  ]);

  function isLensIncomeDebugEnabled(locationLike) {
    const search = locationLike && typeof locationLike.search === "string" ? locationLike.search : "";
    const value = new URLSearchParams(search).get(DEBUG_QUERY_PARAM);
    const normalizedValue = String(value || "").trim().toLowerCase();
    return normalizedValue === "1" || normalizedValue === "true" || normalizedValue === "income";
  }

  function formatDebugValue(value) {
    if (value == null || value === "") {
      return "null";
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return "[unserializable]";
      }
    }

    return String(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getNestedDebugValue(source, path) {
    const pathParts = String(path || "").split(".").filter(Boolean);
    if (!source || typeof source !== "object" || !pathParts.length) {
      return null;
    }

    return pathParts.reduce(function (value, pathPart) {
      if (!value || typeof value !== "object") {
        return null;
      }

      return value[pathPart];
    }, source);
  }

  function appendBucketInspectionRows(rows, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const blockOutput = normalizedOptions.blockOutput && typeof normalizedOptions.blockOutput === "object"
      ? normalizedOptions.blockOutput
      : {};
    const runtimeOutputs = blockOutput.outputs && typeof blockOutput.outputs === "object"
      ? blockOutput.outputs
      : {};
    const runtimeOutputMetadata = blockOutput.outputMetadata && typeof blockOutput.outputMetadata === "object"
      ? blockOutput.outputMetadata
      : {};
    const normalizedBucket = normalizedOptions.normalizedBucket && typeof normalizedOptions.normalizedBucket === "object"
      ? normalizedOptions.normalizedBucket
      : {};
    const normalizationMetadata = normalizedOptions.normalizationMetadata && typeof normalizedOptions.normalizationMetadata === "object"
      ? normalizedOptions.normalizationMetadata
      : {};
    const normalizationFieldMetadata = normalizationMetadata.fields && typeof normalizationMetadata.fields === "object"
      ? normalizationMetadata.fields
      : {};
    const sourceBlockId = normalizationMetadata.sourceBlockId || blockOutput.blockId || null;
    const runtimeSection = normalizedOptions.runtimeSection || "Runtime Block Output";

    normalizedOptions.fields.forEach(function (field) {
      const runtimeMetadata = runtimeOutputMetadata[field.sourceOutputKey] || {};
      const hasNormalizedField = Boolean(field.destinationField);
      const normalizedFieldMetadata = hasNormalizedField
        ? (normalizationFieldMetadata[field.destinationField] || {})
        : {};

      rows.push({
        section: runtimeSection,
        field: field.sourceOutputKey,
        value: runtimeOutputs[field.sourceOutputKey],
        sourceBlock: blockOutput.blockId || null,
        confidence: runtimeMetadata.confidence || null
      });

      if (!hasNormalizedField) {
        return;
      }

      rows.push({
        section: normalizedOptions.normalizedSection,
        field: field.destinationField,
        value: getNestedDebugValue(normalizedBucket, field.destinationField),
        sourceBlock: normalizedFieldMetadata.sourceBlockId || sourceBlockId,
        confidence: normalizedFieldMetadata.confidence || null
      });

      rows.push({
        section: "Normalization Metadata",
        field: field.destinationField,
        value: normalizedFieldMetadata.sourceType || null,
        sourceBlock: normalizedFieldMetadata.sourceBlockId || sourceBlockId,
        confidence: normalizedFieldMetadata.confidence || null
      });
    });
  }

  function appendNormalizedBucketRows(rows, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const normalizedBucket = normalizedOptions.normalizedBucket && typeof normalizedOptions.normalizedBucket === "object"
      ? normalizedOptions.normalizedBucket
      : {};
    const normalizationMetadata = normalizedOptions.normalizationMetadata && typeof normalizedOptions.normalizationMetadata === "object"
      ? normalizedOptions.normalizationMetadata
      : {};
    const normalizationFieldMetadata = normalizationMetadata.fields && typeof normalizationMetadata.fields === "object"
      ? normalizationMetadata.fields
      : {};
    const sourceBlockId = normalizationMetadata.sourceBlockId || null;

    normalizedOptions.fields.forEach(function (field) {
      const normalizedFieldMetadata = normalizationFieldMetadata[field.destinationField] || {};

      rows.push({
        section: normalizedOptions.normalizedSection,
        field: field.destinationField,
        value: getNestedDebugValue(normalizedBucket, field.destinationField),
        sourceBlock: normalizedFieldMetadata.sourceBlockId || sourceBlockId,
        confidence: normalizedFieldMetadata.confidence || null
      });

      rows.push({
        section: "Normalization Metadata",
        field: field.destinationField,
        value: normalizedFieldMetadata.sourceType || null,
        sourceBlock: normalizedFieldMetadata.sourceBlockId || sourceBlockId,
        confidence: normalizedFieldMetadata.confidence || null
      });
    });
  }

  function createInspectionRows(blockOutputs, lensModel) {
    const safeBlockOutputs = blockOutputs && typeof blockOutputs === "object" ? blockOutputs : {};
    const rows = [];

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[NET_INCOME_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.incomeBasis,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.incomeBasis,
      normalizedSection: "Normalized incomeBasis",
      fields: INCOME_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[NET_INCOME_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.assumptions && lensModel.assumptions.economicAssumptions,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.assumptions && lensModel.normalizationMetadata.assumptions.economicAssumptions,
      normalizedSection: "Normalized assumptions.economicAssumptions",
      fields: ECONOMIC_ASSUMPTIONS_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[TAX_CONTEXT_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.assumptions && lensModel.assumptions.taxContext,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.assumptions && lensModel.normalizationMetadata.assumptions.taxContext,
      runtimeSection: "Runtime tax-context",
      normalizedSection: "Normalized assumptions.taxContext",
      fields: TAX_CONTEXT_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[DEBT_PAYOFF_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.debtPayoff,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.debtPayoff,
      normalizedSection: "Normalized debtPayoff",
      fields: DEBT_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[HOUSING_ONGOING_SUPPORT_BLOCK_ID],
      normalizedBucket: null,
      normalizationMetadata: null,
      runtimeSection: "Runtime housing context",
      normalizedSection: "Runtime housing context",
      fields: HOUSING_RUNTIME_ONLY_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[HOUSING_ONGOING_SUPPORT_BLOCK_ID],
      normalizedBucket: null,
      normalizationMetadata: null,
      runtimeSection: "Runtime housing audit",
      normalizedSection: "Runtime housing audit",
      fields: HOUSING_AUDIT_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[HOUSING_ONGOING_SUPPORT_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.ongoingSupport,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.ongoingSupport,
      normalizedSection: "Normalized ongoingSupport",
      fields: ONGOING_SUPPORT_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.ongoingSupport,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.ongoingSupport,
      runtimeSection: "Runtime non-housing-ongoing-support",
      normalizedSection: "Normalized ongoingSupport",
      fields: NON_HOUSING_ONGOING_SUPPORT_DEBUG_FIELDS
    });

    appendNormalizedBucketRows(rows, {
      normalizedBucket: lensModel && lensModel.ongoingSupport,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.ongoingSupport,
      normalizedSection: "Normalized ongoingSupport",
      fields: ONGOING_SUPPORT_COMPOSITION_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[EDUCATION_SUPPORT_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.educationSupport,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.educationSupport,
      runtimeSection: "Runtime education-support",
      normalizedSection: "Normalized educationSupport",
      fields: EDUCATION_SUPPORT_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[FINAL_EXPENSES_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.finalExpenses,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.finalExpenses,
      runtimeSection: "Runtime final-expenses",
      normalizedSection: "Normalized finalExpenses",
      fields: FINAL_EXPENSES_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[TRANSITION_NEEDS_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.transitionNeeds,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.transitionNeeds,
      runtimeSection: "Runtime transition-needs",
      normalizedSection: "Normalized transitionNeeds",
      fields: TRANSITION_NEEDS_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[EXISTING_COVERAGE_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.existingCoverage,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.existingCoverage,
      runtimeSection: "Runtime existing-coverage",
      normalizedSection: "Normalized existingCoverage",
      fields: EXISTING_COVERAGE_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[OFFSET_ASSETS_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.offsetAssets,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.offsetAssets,
      runtimeSection: "Runtime offset-assets",
      normalizedSection: "Normalized offsetAssets",
      fields: OFFSET_ASSETS_DEBUG_FIELDS
    });

    appendBucketInspectionRows(rows, {
      blockOutput: safeBlockOutputs[SURVIVOR_SCENARIO_BLOCK_ID],
      normalizedBucket: lensModel && lensModel.survivorScenario,
      normalizationMetadata: lensModel && lensModel.normalizationMetadata && lensModel.normalizationMetadata.survivorScenario,
      runtimeSection: "Runtime survivor-scenario",
      normalizedSection: "Normalized survivorScenario",
      fields: SURVIVOR_SCENARIO_DEBUG_FIELDS
    });

    return rows;
  }

  function createSummaryText(blockOutputs, lensModel) {
    const safeBlockOutputs = blockOutputs && typeof blockOutputs === "object" ? blockOutputs : {};
    const availableBlocks = [NET_INCOME_BLOCK_ID, TAX_CONTEXT_BLOCK_ID, DEBT_PAYOFF_BLOCK_ID, HOUSING_ONGOING_SUPPORT_BLOCK_ID, NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID, EDUCATION_SUPPORT_BLOCK_ID, FINAL_EXPENSES_BLOCK_ID, TRANSITION_NEEDS_BLOCK_ID, EXISTING_COVERAGE_BLOCK_ID, OFFSET_ASSETS_BLOCK_ID, SURVIVOR_SCENARIO_BLOCK_ID].filter(function (blockId) {
      return safeBlockOutputs[blockId];
    });
    return "Runtime blocks: " + (availableBlocks.length ? availableBlocks.join(", ") : "none");
  }

  function getAssetDebugOutputNode() {
    return document.getElementById(ASSET_DEBUG_OUTPUT_ID);
  }

  function writeAssetDebugOutput(payload) {
    const outputNode = getAssetDebugOutputNode();
    if (!outputNode) {
      return;
    }

    outputNode.textContent = typeof payload === "string"
      ? payload
      : JSON.stringify(payload, null, 2);
  }

  function loadDebugScriptOnce(id, src) {
    if (document.getElementById(id)) {
      return Promise.resolve();
    }

    if (DEBUG_SCRIPT_LOADS[id]) {
      return DEBUG_SCRIPT_LOADS[id];
    }

    DEBUG_SCRIPT_LOADS[id] = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("Failed to load debug script: " + src));
      };
      document.head.appendChild(script);
    });

    return DEBUG_SCRIPT_LOADS[id];
  }

  function ensureNeedsComparisonDebugDependencies() {
    const loadSteps = [];

    if (!lensAnalysis.analysisMethods || typeof lensAnalysis.analysisMethods.runNeedsAnalysis !== "function") {
      loadSteps.push(loadDebugScriptOnce(
        "lens-debug-analysis-methods-script",
        "../app/features/lens-analysis/analysis-methods.js"
      ));
    }

    if (!lensAnalysis.analysisSettingsAdapter || typeof lensAnalysis.analysisSettingsAdapter.createAnalysisMethodSettings !== "function") {
      loadSteps.push(loadDebugScriptOnce(
        "lens-debug-analysis-settings-adapter-script",
        "../app/features/lens-analysis/analysis-settings-adapter.js"
      ));
    }

    return Promise.all(loadSteps);
  }

  function getCurrentDebugRuntimeBlockOutputs() {
    const runtime = LensApp.lensAnalysisRuntime && typeof LensApp.lensAnalysisRuntime === "object"
      ? LensApp.lensAnalysisRuntime
      : {};

    return runtime.blockOutputs && typeof runtime.blockOutputs === "object"
      ? runtime.blockOutputs
      : {};
  }

  function getAssetFactsDebugSourceCases() {
    return [
      {
        name: "Case 1 - new scalar fields",
        expectedDefaultAssetIds: [
          "default_cashAndCashEquivalents",
          "default_taxableBrokerageInvestments",
          "default_primaryResidenceEquity"
        ],
        sourceData: {
          cashAndCashEquivalents: 100000,
          taxableBrokerageInvestments: 250000,
          primaryResidenceEquity: 500000
        }
      },
      {
        name: "Case 2 - legacy alias fields",
        expectedDefaultAssetIds: [
          "default_cashAndCashEquivalents",
          "default_taxableBrokerageInvestments",
          "default_primaryResidenceEquity"
        ],
        sourceData: {
          cashSavings: 100000,
          brokerageAccounts: 250000,
          realEstateEquity: 500000
        }
      },
      {
        name: "Case 3 - default scalar plus assetRecords[]",
        expectedRecordAssetIds: [
          "default_taxableBrokerageInvestments",
          "asset_joint_brokerage_001"
        ],
        sourceData: {
          taxableBrokerageInvestments: 250000,
          assetRecords: [
            {
              assetId: "asset_joint_brokerage_001",
              categoryKey: "taxableBrokerageInvestments",
              typeKey: "jointBrokerageAccount",
              label: "Joint Brokerage Account",
              currentValue: 80000,
              isDefaultAsset: false,
              isCustomAsset: false
            },
            {
              assetId: "asset_joint_brokerage_001",
              categoryKey: "taxableBrokerageInvestments",
              typeKey: "duplicateBrokerageRecord",
              label: "Duplicate Brokerage Record",
              currentValue: 5000,
              isDefaultAsset: false,
              isCustomAsset: false
            },
            {
              assetId: "asset_invalid_missing_category",
              label: "Invalid Missing Category",
              currentValue: 12000
            }
          ]
        }
      }
    ];
  }

  function runAssetFactsDebugSample() {
    const createAssetFactsFromSourceData = lensAnalysis.createAssetFactsFromSourceData;
    const taxonomy = lensAnalysis.assetTaxonomy && typeof lensAnalysis.assetTaxonomy === "object"
      ? lensAnalysis.assetTaxonomy
      : null;

    if (typeof createAssetFactsFromSourceData !== "function") {
      writeAssetDebugOutput({
        status: "unavailable",
        message: "createAssetFactsFromSourceData is not loaded on this page."
      });
      return;
    }

    const cases = getAssetFactsDebugSourceCases().map(function (sampleCase) {
      const result = createAssetFactsFromSourceData(sampleCase.sourceData);
      const assetIds = Array.isArray(result.assets)
        ? result.assets.map(function (asset) {
          return asset.assetId;
        })
        : [];

      return {
        name: sampleCase.name,
        expectedDefaultAssetIds: sampleCase.expectedDefaultAssetIds || null,
        expectedRecordAssetIds: sampleCase.expectedRecordAssetIds || null,
        actualAssetIds: assetIds,
        result
      };
    });

    writeAssetDebugOutput({
      status: "assetFacts sample complete",
      note: "Local sample objects only. No profile records, storage, or offsetAssets were mutated.",
      taxonomyLoaded: Boolean(taxonomy && Array.isArray(taxonomy.DEFAULT_ASSET_CATEGORIES)),
      cases
    });
  }

  function getAssetTreatmentSampleAssetFacts() {
    const createAssetFactsFromSourceData = lensAnalysis.createAssetFactsFromSourceData;
    const sourceData = {
      cashAndCashEquivalents: 100000,
      taxableBrokerageInvestments: 250000,
      primaryResidenceEquity: 500000,
      assetRecords: [
        {
          assetId: "asset_joint_brokerage_001",
          categoryKey: "taxableBrokerageInvestments",
          typeKey: "jointBrokerageAccount",
          label: "Joint Brokerage Account",
          currentValue: 80000
        }
      ]
    };

    if (typeof createAssetFactsFromSourceData === "function") {
      const result = createAssetFactsFromSourceData(sourceData);
      if (result && Array.isArray(result.assets) && result.assets.length) {
        return result;
      }
    }

    return {
      assets: [
        {
          assetId: "default_cashAndCashEquivalents",
          categoryKey: "cashAndCashEquivalents",
          typeKey: "default_cashAndCashEquivalents",
          label: "Cash & Cash Equivalents",
          currentValue: 100000,
          source: "debug-sample",
          sourceKey: "cashAndCashEquivalents",
          isDefaultAsset: true,
          isCustomAsset: false,
          hasPmiSource: true,
          legacySourceKeys: ["cashSavings"],
          metadata: { recordSource: "debug-fallback" }
        },
        {
          assetId: "default_taxableBrokerageInvestments",
          categoryKey: "taxableBrokerageInvestments",
          typeKey: "default_taxableBrokerageInvestments",
          label: "Taxable Brokerage / Investments",
          currentValue: 250000,
          source: "debug-sample",
          sourceKey: "taxableBrokerageInvestments",
          isDefaultAsset: true,
          isCustomAsset: false,
          hasPmiSource: true,
          legacySourceKeys: ["brokerageAccounts"],
          metadata: { recordSource: "debug-fallback" }
        },
        {
          assetId: "default_primaryResidenceEquity",
          categoryKey: "primaryResidenceEquity",
          typeKey: "default_primaryResidenceEquity",
          label: "Primary Residence Equity",
          currentValue: 500000,
          source: "debug-sample",
          sourceKey: "primaryResidenceEquity",
          isDefaultAsset: true,
          isCustomAsset: false,
          hasPmiSource: true,
          legacySourceKeys: ["realEstateEquity"],
          metadata: { recordSource: "debug-fallback" }
        }
      ],
      totalReportedAssetValue: 850000,
      metadata: {
        source: "debug-fallback",
        note: "Used because createAssetFactsFromSourceData returned no assets or was unavailable."
      }
    };
  }

  function getAssetTreatmentDebugAssumptions() {
    return {
      enabled: true,
      source: "debug-sample",
      defaultProfile: "debug-sample",
      assets: {
        cashAndCashEquivalents: {
          include: true,
          taxDragPercent: 0,
          liquidityHaircutPercent: 0
        },
        taxableBrokerageInvestments: {
          include: true,
          taxDragPercent: 15,
          liquidityHaircutPercent: 5
        },
        primaryResidenceEquity: {
          include: false,
          taxDragPercent: 0,
          liquidityHaircutPercent: 100
        }
      }
    };
  }

  function createEmptyTreatedAssetOffsetsPreview(warnings, metadata) {
    return {
      assets: [],
      totalRawAssetValue: null,
      totalIncludedRawValue: null,
      totalTreatedAssetValue: null,
      excludedAssetValue: null,
      warnings: Array.isArray(warnings) ? warnings : [],
      trace: [],
      metadata: Object.assign({
        source: "asset-treatment-calculations",
        consumedByMethods: false
      }, metadata && typeof metadata === "object" ? metadata : {})
    };
  }

  function createTreatedAssetOffsetsPreview(calculationResult, metadata) {
    const safeResult = calculationResult && typeof calculationResult === "object"
      ? calculationResult
      : {};

    return {
      assets: Array.isArray(safeResult.assets) ? safeResult.assets : [],
      totalRawAssetValue: safeResult.totalRawAssetValue ?? null,
      totalIncludedRawValue: safeResult.totalIncludedRawValue ?? null,
      totalTreatedAssetValue: safeResult.totalTreatedAssetValue ?? null,
      excludedAssetValue: safeResult.excludedAssetValue ?? null,
      warnings: Array.isArray(safeResult.warnings) ? safeResult.warnings : [],
      trace: Array.isArray(safeResult.trace) ? safeResult.trace : [],
      metadata: Object.assign({}, safeResult.metadata || {}, {
        source: "asset-treatment-calculations",
        consumedByMethods: false
      }, metadata && typeof metadata === "object" ? metadata : {})
    };
  }

  function getCurrentLinkedRecordForAssetDebug() {
    const clientRecords = LensApp.clientRecords || {};
    return typeof clientRecords.getCurrentLinkedRecord === "function"
      ? clientRecords.getCurrentLinkedRecord()
      : null;
  }

  function resolveProtectionModelingDataForAssetDebug(record) {
    if (record?.protectionModeling?.data && typeof record.protectionModeling.data === "object") {
      return {
        data: record.protectionModeling.data,
        source: "record.protectionModeling.data"
      };
    }

    const entries = Array.isArray(record?.protectionModelingEntries)
      ? record.protectionModelingEntries
      : [];
    const latestEntryData = entries.length ? entries[entries.length - 1]?.data : null;
    return latestEntryData && typeof latestEntryData === "object"
      ? {
        data: latestEntryData,
        source: "record.protectionModelingEntries.latest.data"
      }
      : {
        data: null,
        source: "unavailable"
      };
  }

  function getAssetTreatmentAssumptionsForAssetDebug(record) {
    const assumptions = record?.analysisSettings?.assetTreatmentAssumptions;
    return assumptions && typeof assumptions === "object" ? assumptions : null;
  }

  function buildTreatedAssetOffsetsPreview() {
    const calculateAssetTreatment = lensAnalysis.calculateAssetTreatment;
    const createAssetFactsFromSourceData = lensAnalysis.createAssetFactsFromSourceData;
    const linkedRecord = getCurrentLinkedRecordForAssetDebug();
    const sourceDataResolution = resolveProtectionModelingDataForAssetDebug(linkedRecord);
    const sourceData = sourceDataResolution.data;
    const assetFactsSource = sourceDataResolution.source;
    const assetTreatmentAssumptions = getAssetTreatmentAssumptionsForAssetDebug(linkedRecord);
    const warnings = [];

    if (typeof createAssetFactsFromSourceData !== "function") {
      warnings.push({
        code: "missing-asset-facts-normalizer",
        message: "createAssetFactsFromSourceData is not loaded on this page."
      });
    }

    if (typeof calculateAssetTreatment !== "function") {
      warnings.push({
        code: "missing-asset-treatment-helper",
        message: "calculateAssetTreatment is not loaded on this page."
      });
    }

    if (!linkedRecord) {
      warnings.push({
        code: "missing-linked-record",
        message: "No linked profile record is available for the debug preview."
      });
    }

    if (!sourceData) {
      warnings.push({
        code: "missing-protection-modeling-data",
        message: "No saved protectionModeling.data source was available for assetFacts."
      });
    }

    if (!assetTreatmentAssumptions) {
      warnings.push({
        code: "missing-asset-treatment-assumptions",
        message: "No saved analysisSettings.assetTreatmentAssumptions were found; helper defaults are not treated as saved advisor assumptions."
      });
    }

    if (typeof createAssetFactsFromSourceData !== "function" || typeof calculateAssetTreatment !== "function" || !sourceData) {
      return {
        status: "treatedAssetOffsets preview unavailable",
        note: "Debug-only preview. No profile records, storage, offsetAssets, or analysis methods were mutated.",
        treatedAssetOffsets: createEmptyTreatedAssetOffsetsPreview(warnings, {
          previewSource: "dev-income-debug",
          modelLevel: false,
          assetFactsSource,
          assumptionsSource: assetTreatmentAssumptions
            ? "record.analysisSettings.assetTreatmentAssumptions"
            : "unavailable"
        })
      };
    }

    const assetFacts = createAssetFactsFromSourceData(sourceData);
    const result = calculateAssetTreatment({
      assetFacts,
      assetTreatmentAssumptions: assetTreatmentAssumptions || {},
      options: {
        source: "dev-income-debug-treatedAssetOffsets-preview"
      }
    });
    const treatedAssetOffsets = createTreatedAssetOffsetsPreview(result, {
      previewSource: "dev-income-debug",
      modelLevel: false,
      assetFactsSource,
      assumptionsSource: assetTreatmentAssumptions
        ? "record.analysisSettings.assetTreatmentAssumptions"
        : "unavailable",
      assetFactsAssetCount: Array.isArray(assetFacts.assets) ? assetFacts.assets.length : 0,
      linkedRecordId: linkedRecord?.id || null,
      linkedCaseRef: linkedRecord?.caseRef || null
    });

    if (warnings.length) {
      treatedAssetOffsets.warnings = warnings.concat(treatedAssetOffsets.warnings || []);
    }

    return {
      status: "treatedAssetOffsets preview complete",
      note: "Debug-only preview. This output is not saved, not attached to legacy offsetAssets, and does not change DIME, Needs, HLV, Step 3, or recommendations.",
      treatedAssetOffsets
    };
  }

  function runAssetTreatmentDebugSample() {
    const calculateAssetTreatment = lensAnalysis.calculateAssetTreatment;

    if (typeof calculateAssetTreatment !== "function") {
      writeAssetDebugOutput({
        status: "unavailable",
        message: "Asset treatment helper is not loaded on this page."
      });
      return;
    }

    const assetFacts = getAssetTreatmentSampleAssetFacts();
    const assetTreatmentAssumptions = getAssetTreatmentDebugAssumptions();
    const result = calculateAssetTreatment({
      assetFacts,
      assetTreatmentAssumptions,
      options: {
        source: "dev-income-debug"
      }
    });

    writeAssetDebugOutput({
      status: "asset treatment sample complete",
      note: "Local sample objects only. No profile records, storage, offsetAssets, or analysis methods were mutated.",
      totalTreatedAssetValue: result.totalTreatedAssetValue,
      warnings: result.warnings,
      trace: result.trace,
      assets: result.assets,
      metadata: result.metadata
    });
  }

  function runTreatedAssetOffsetsPreview() {
    writeAssetDebugOutput(buildTreatedAssetOffsetsPreview());
  }

  function getCurrentLegacyOffsetAssetsForAssetDebug() {
    const createLensModelFromBlockOutputs = lensAnalysis.createLensModelFromBlockOutputs;
    const runtime = LensApp.lensAnalysisRuntime && typeof LensApp.lensAnalysisRuntime === "object"
      ? LensApp.lensAnalysisRuntime
      : {};
    const blockOutputs = runtime.blockOutputs && typeof runtime.blockOutputs === "object"
      ? runtime.blockOutputs
      : {};

    if (typeof createLensModelFromBlockOutputs !== "function") {
      return {
        offsetAssets: null,
        source: "unavailable",
        warnings: [
          {
            code: "missing-lens-normalizer",
            message: "createLensModelFromBlockOutputs is not loaded on this page."
          }
        ]
      };
    }

    const lensModel = createLensModelFromBlockOutputs(blockOutputs);
    return {
      offsetAssets: lensModel && typeof lensModel.offsetAssets === "object" ? lensModel.offsetAssets : null,
      source: "LensApp.lensAnalysisRuntime.blockOutputs",
      warnings: []
    };
  }

  function summarizeLegacyOffsetAssets(offsetAssets, source, warnings) {
    const safeOffsetAssets = offsetAssets && typeof offsetAssets === "object" ? offsetAssets : {};
    const assetKeys = [
      "cashSavings",
      "currentEmergencyFund",
      "brokerageAccounts",
      "retirementAccounts",
      "realEstateEquity",
      "businessValue"
    ];
    const assets = assetKeys.reduce(function (summary, assetKey) {
      const asset = safeOffsetAssets[assetKey] && typeof safeOffsetAssets[assetKey] === "object"
        ? safeOffsetAssets[assetKey]
        : null;

      if (!asset) {
        return summary;
      }

      const hasAnyValue = [
        asset.value,
        asset.includeInOffset,
        asset.liquidityType,
        asset.availablePercent,
        asset.availableValue
      ].some(function (value) {
        return value !== null && value !== undefined && value !== "";
      });

      if (!hasAnyValue) {
        return summary;
      }

      summary.push({
        assetKey,
        value: asset.value ?? null,
        includeInOffset: asset.includeInOffset ?? null,
        liquidityType: asset.liquidityType ?? null,
        availablePercent: asset.availablePercent ?? null,
        availableValue: asset.availableValue ?? null
      });
      return summary;
    }, []);

    return {
      source,
      totalReportedAssetValue: safeOffsetAssets.totalReportedAssetValue ?? null,
      totalIncludedAssetValue: safeOffsetAssets.totalIncludedAssetValue ?? null,
      totalAvailableOffsetAssetValue: safeOffsetAssets.totalAvailableOffsetAssetValue ?? null,
      assetCount: assets.length,
      assets,
      warnings: Array.isArray(warnings) ? warnings : []
    };
  }

  function summarizeTreatedAssetOffsets(treatedAssetOffsets) {
    const safeTreatedAssetOffsets = treatedAssetOffsets && typeof treatedAssetOffsets === "object"
      ? treatedAssetOffsets
      : {};
    const assets = Array.isArray(safeTreatedAssetOffsets.assets)
      ? safeTreatedAssetOffsets.assets
      : [];
    const warnings = Array.isArray(safeTreatedAssetOffsets.warnings)
      ? safeTreatedAssetOffsets.warnings
      : [];

    return {
      source: safeTreatedAssetOffsets.metadata?.source || "asset-treatment-calculations",
      totalRawAssetValue: safeTreatedAssetOffsets.totalRawAssetValue ?? null,
      totalIncludedRawValue: safeTreatedAssetOffsets.totalIncludedRawValue ?? null,
      totalTreatedAssetValue: safeTreatedAssetOffsets.totalTreatedAssetValue ?? null,
      excludedAssetValue: safeTreatedAssetOffsets.excludedAssetValue ?? null,
      assetCount: assets.length,
      warningCount: warnings.length,
      warnings,
      metadata: safeTreatedAssetOffsets.metadata || null
    };
  }

  function createAssetOffsetComparisonDelta(legacyOffsetAssets, newTreatedAssetOffsets) {
    const legacyTotal = legacyOffsetAssets.totalAvailableOffsetAssetValue;
    const treatedTotal = newTreatedAssetOffsets.totalTreatedAssetValue;
    const hasLegacyTotal = legacyTotal !== null && legacyTotal !== undefined;
    const hasTreatedTotal = treatedTotal !== null && treatedTotal !== undefined;

    return {
      treatedMinusLegacyAvailableOffset: hasLegacyTotal && hasTreatedTotal
        ? treatedTotal - legacyTotal
        : null,
      legacyTotalAvailableOffsetAssetValue: hasLegacyTotal ? legacyTotal : null,
      newTotalTreatedAssetValue: hasTreatedTotal ? treatedTotal : null,
      canCompare: hasLegacyTotal && hasTreatedTotal,
      note: hasLegacyTotal && hasTreatedTotal
        ? "New treated total minus legacy totalAvailableOffsetAssetValue."
        : "Delta not calculated because one or both totals are unavailable; missing totals are kept as null."
    };
  }

  function runAssetOffsetComparisonDebug() {
    const legacyResolution = getCurrentLegacyOffsetAssetsForAssetDebug();
    const legacyOffsetAssets = summarizeLegacyOffsetAssets(
      legacyResolution.offsetAssets,
      legacyResolution.source,
      legacyResolution.warnings
    );
    const treatedPreviewPayload = buildTreatedAssetOffsetsPreview();
    const newTreatedAssetOffsets = summarizeTreatedAssetOffsets(treatedPreviewPayload.treatedAssetOffsets);

    writeAssetDebugOutput({
      status: "asset offset comparison complete",
      legacyOffsetAssets,
      newTreatedAssetOffsets,
      delta: createAssetOffsetComparisonDelta(legacyOffsetAssets, newTreatedAssetOffsets),
      consumedByMethods: false,
      note: "Debug-only comparison. This debug result is not saved, not attached to legacy offsetAssets, and does not change production method outputs."
    });
  }

  function createNeedsDebugFallbackSettings() {
    return {
      needsSupportDurationYears: 10,
      includeExistingCoverageOffset: true,
      includeOffsetAssets: true,
      assetOffsetSource: "legacy",
      fallbackToLegacyOffsetAssets: true,
      includeTransitionNeeds: true,
      includeDiscretionarySupport: false,
      includeSurvivorIncomeOffset: true
    };
  }

  function createCurrentLensModelForNeedsDebug() {
    const createLensModelFromBlockOutputs = lensAnalysis.createLensModelFromBlockOutputs;
    const linkedRecord = getCurrentLinkedRecordForAssetDebug();
    const sourceDataResolution = resolveProtectionModelingDataForAssetDebug(linkedRecord);
    const blockOutputs = getCurrentDebugRuntimeBlockOutputs();
    const warnings = [];

    if (typeof createLensModelFromBlockOutputs !== "function") {
      warnings.push({
        code: "missing-lens-normalizer",
        message: "createLensModelFromBlockOutputs is not loaded on this page."
      });
      return {
        lensModel: null,
        linkedRecord,
        sourceDataSource: sourceDataResolution.source,
        warnings
      };
    }

    const lensModel = createLensModelFromBlockOutputs(blockOutputs, {
      sourceData: sourceDataResolution.data
    });
    const treatedPreviewPayload = buildTreatedAssetOffsetsPreview();

    if (lensModel && typeof lensModel === "object" && treatedPreviewPayload.treatedAssetOffsets) {
      lensModel.treatedAssetOffsets = Object.assign({}, treatedPreviewPayload.treatedAssetOffsets, {
        metadata: Object.assign({}, treatedPreviewPayload.treatedAssetOffsets.metadata || {}, {
          source: "dev-income-debug-needs-comparison",
          consumedByMethods: false,
          debugConsumedByNeedsComparison: true,
          debugOnly: true
        })
      });
    }

    return {
      lensModel,
      linkedRecord,
      sourceDataSource: sourceDataResolution.source,
      treatedPreviewStatus: treatedPreviewPayload.status,
      treatedPreviewWarnings: treatedPreviewPayload.treatedAssetOffsets?.warnings || [],
      warnings
    };
  }

  function createNeedsDebugMethodSettings(lensModel, linkedRecord) {
    const adapter = lensAnalysis.analysisSettingsAdapter;
    const warnings = [];

    if (!adapter || typeof adapter.createAnalysisMethodSettings !== "function") {
      warnings.push({
        code: "missing-analysis-settings-adapter",
        message: "analysis-settings-adapter.js is not loaded; fallback Needs settings were used for debug comparison."
      });
      return {
        needsSettings: createNeedsDebugFallbackSettings(),
        warnings,
        trace: []
      };
    }

    const methodSettings = adapter.createAnalysisMethodSettings({
      analysisSettings: linkedRecord?.analysisSettings,
      lensModel,
      profileRecord: linkedRecord
    });

    return {
      needsSettings: Object.assign(
        createNeedsDebugFallbackSettings(),
        methodSettings?.needsAnalysisSettings || {}
      ),
      warnings: Array.isArray(methodSettings?.warnings) ? methodSettings.warnings : warnings,
      trace: Array.isArray(methodSettings?.trace) ? methodSettings.trace : []
    };
  }

  function findAssetOffsetTraceRow(needsResult) {
    const trace = Array.isArray(needsResult?.trace) ? needsResult.trace : [];
    return trace.find(function (row) {
      return row && row.key === "assetOffset";
    }) || null;
  }

  function summarizeNeedsAssetOffsetRun(needsResult) {
    const assetOffsetTrace = findAssetOffsetTraceRow(needsResult);
    const traceInputs = assetOffsetTrace && typeof assetOffsetTrace.inputs === "object"
      ? assetOffsetTrace.inputs
      : {};

    return {
      assetOffsetSource: needsResult?.assumptions?.assetOffsetSource ?? traceInputs.assetOffsetSource ?? null,
      effectiveAssetOffsetSource: needsResult?.assumptions?.effectiveAssetOffsetSource ?? traceInputs.effectiveAssetOffsetSource ?? null,
      selectedAssetOffsetValue: traceInputs.selectedAssetOffsetValue ?? needsResult?.commonOffsets?.assetOffset ?? null,
      totalNeed: needsResult?.grossNeed ?? null,
      existingCoverage: needsResult?.commonOffsets?.existingCoverageOffset ?? null,
      netCoverageGap: needsResult?.netCoverageGap ?? null,
      warnings: Array.isArray(needsResult?.warnings) ? needsResult.warnings : [],
      assetOffsetTrace
    };
  }

  function createNeedsAssetOffsetComparisonDelta(legacyRun, treatedRun) {
    const legacyAssetOffset = Number(legacyRun.selectedAssetOffsetValue);
    const treatedAssetOffset = Number(treatedRun.selectedAssetOffsetValue);
    const legacyGap = Number(legacyRun.netCoverageGap);
    const treatedGap = Number(treatedRun.netCoverageGap);

    return {
      assetOffsetDifference: Number.isFinite(legacyAssetOffset) && Number.isFinite(treatedAssetOffset)
        ? treatedAssetOffset - legacyAssetOffset
        : null,
      netCoverageGapDifference: Number.isFinite(legacyGap) && Number.isFinite(treatedGap)
        ? treatedGap - legacyGap
        : null
    };
  }

  function runNeedsAssetOffsetComparisonDebug() {
    writeAssetDebugOutput({
      status: "needs asset offset comparison loading",
      note: "Loading debug-only analysis method dependencies if they are not already present."
    });

    ensureNeedsComparisonDebugDependencies()
      .then(function () {
        const runNeedsAnalysis = lensAnalysis.analysisMethods?.runNeedsAnalysis;
        const modelResult = createCurrentLensModelForNeedsDebug();

        if (typeof runNeedsAnalysis !== "function") {
          writeAssetDebugOutput({
            status: "needs asset offset comparison unavailable",
            message: "runNeedsAnalysis is not loaded on this page.",
            warnings: modelResult.warnings
          });
          return;
        }

        if (!modelResult.lensModel) {
          writeAssetDebugOutput({
            status: "needs asset offset comparison unavailable",
            message: "Lens model could not be built from the current debug runtime.",
            warnings: modelResult.warnings
          });
          return;
        }

        const settingsResult = createNeedsDebugMethodSettings(modelResult.lensModel, modelResult.linkedRecord);
        const baseNeedsSettings = settingsResult.needsSettings;
        const legacySettings = Object.assign({}, baseNeedsSettings, {
          assetOffsetSource: "legacy"
        });
        const treatedSettings = Object.assign({}, baseNeedsSettings, {
          assetOffsetSource: "treated"
        });
        const legacyResult = runNeedsAnalysis(modelResult.lensModel, legacySettings);
        const treatedResult = runNeedsAnalysis(modelResult.lensModel, treatedSettings);
        const legacy = summarizeNeedsAssetOffsetRun(legacyResult);
        const treated = summarizeNeedsAssetOffsetRun(treatedResult);
        const adapterDefaults = lensAnalysis.analysisSettingsAdapter?.DEFAULT_NEEDS_ANALYSIS_SETTINGS || {};

        writeAssetDebugOutput({
          status: "needs asset offset comparison complete",
          legacy,
          treated,
          delta: createNeedsAssetOffsetComparisonDelta(legacy, treated),
          stepThreeDefaultAssetOffsetSource: adapterDefaults.assetOffsetSource || null,
          debugContext: {
            linkedRecordId: modelResult.linkedRecord?.id || null,
            linkedCaseRef: modelResult.linkedRecord?.caseRef || null,
            sourceDataSource: modelResult.sourceDataSource,
            treatedPreviewStatus: modelResult.treatedPreviewStatus,
            treatedPreviewWarningCount: modelResult.treatedPreviewWarnings.length,
            methodSettingsWarnings: settingsResult.warnings,
            methodSettingsTrace: settingsResult.trace
          },
          note: "Debug-only comparison. No defaults, profile records, Step 3 rendering, or production calculation paths were changed."
        });
      })
      .catch(function (error) {
        writeAssetDebugOutput({
          status: "needs asset offset comparison failed",
          message: error && error.message ? error.message : String(error)
        });
      });
  }

  function clearAssetDebugOutput() {
    writeAssetDebugOutput("");
  }

  function bindAssetDebugControls(panel) {
    if (!panel || panel.getAttribute("data-asset-debug-bound") === "true") {
      return;
    }

    panel.addEventListener("click", function (event) {
      const actionButton = event.target && event.target.closest
        ? event.target.closest("[data-asset-debug-action]")
        : null;

      if (!actionButton || !panel.contains(actionButton)) {
        return;
      }

      const action = actionButton.getAttribute("data-asset-debug-action");
      if (action === "asset-facts") {
        runAssetFactsDebugSample();
      } else if (action === "asset-treatment") {
        runAssetTreatmentDebugSample();
      } else if (action === "treated-asset-offsets-preview") {
        runTreatedAssetOffsetsPreview();
      } else if (action === "asset-offset-comparison") {
        runAssetOffsetComparisonDebug();
      } else if (action === "needs-offset-comparison") {
        runNeedsAssetOffsetComparisonDebug();
      } else if (action === "clear") {
        clearAssetDebugOutput();
      }
    });

    panel.setAttribute("data-asset-debug-bound", "true");
  }

  function ensureDebugStyles() {
    if (!document || document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + PANEL_ID + " {",
      "  position: fixed;",
      "  right: 16px;",
      "  bottom: 16px;",
      "  width: min(760px, calc(100vw - 32px));",
      "  max-height: 44vh;",
      "  overflow: auto;",
      "  z-index: 9999;",
      "  padding: 12px;",
      "  border: 1px solid #1f2937;",
      "  border-radius: 10px;",
      "  background: rgba(255, 255, 255, 0.97);",
      "  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);",
      "  color: #111827;",
      "  font: 12px/1.4 Consolas, 'SFMono-Regular', Menlo, monospace;",
      "}",
      "#" + PANEL_ID + " h2 {",
      "  margin: 0 0 6px;",
      "  font-size: 13px;",
      "}",
      "#" + PANEL_ID + " p {",
      "  margin: 0 0 10px;",
      "}",
      "#" + PANEL_ID + " table {",
      "  width: 100%;",
      "  border-collapse: collapse;",
      "}",
      "#" + PANEL_ID + " th,",
      "#" + PANEL_ID + " td {",
      "  padding: 6px 8px;",
      "  border: 1px solid #d1d5db;",
      "  text-align: left;",
      "  vertical-align: top;",
      "}",
      "#" + PANEL_ID + " th {",
      "  position: sticky;",
      "  top: 0;",
      "  background: #f3f4f6;",
      "}",
      "#" + PANEL_ID + " td {",
      "  background: #ffffff;",
      "  word-break: break-word;",
      "}",
      "#" + PANEL_ID + " [data-null='true'] {",
      "  color: #6b7280;",
      "}",
      "#" + PANEL_ID + " .lens-asset-debug {",
      "  margin-top: 12px;",
      "  padding-top: 10px;",
      "  border-top: 1px solid #d1d5db;",
      "}",
      "#" + PANEL_ID + " .lens-asset-debug-actions {",
      "  display: flex;",
      "  flex-wrap: wrap;",
      "  gap: 6px;",
      "  margin: 8px 0;",
      "}",
      "#" + PANEL_ID + " .lens-asset-debug-actions button {",
      "  border: 1px solid #9ca3af;",
      "  border-radius: 6px;",
      "  background: #f9fafb;",
      "  color: #111827;",
      "  cursor: pointer;",
      "  font: inherit;",
      "  padding: 5px 8px;",
      "}",
      "#" + PANEL_ID + " .lens-asset-debug-output {",
      "  min-height: 72px;",
      "  max-height: 220px;",
      "  overflow: auto;",
      "  margin: 0;",
      "  padding: 8px;",
      "  border: 1px solid #d1d5db;",
      "  border-radius: 6px;",
      "  background: #111827;",
      "  color: #e5e7eb;",
      "  white-space: pre-wrap;",
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function ensureDebugPanel() {
    if (!document || !document.body) {
      return null;
    }

    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      bindAssetDebugControls(panel);
      return panel;
    }

    ensureDebugStyles();

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = [
      "<h2>TEMP DEV ONLY: Lens pipeline inspection. Remove or replace before production.</h2>",
      "<p id=\"" + SUMMARY_ID + "\"></p>",
      "<table>",
      "  <thead>",
      "    <tr>",
      "      <th>Section</th>",
      "      <th>Field</th>",
      "      <th>Value</th>",
      "      <th>Source Block</th>",
      "      <th>Confidence</th>",
      "    </tr>",
      "  </thead>",
      "  <tbody id=\"" + TABLE_BODY_ID + "\"></tbody>",
      "</table>",
      "<section class=\"lens-asset-debug\" aria-label=\"Asset Facts and Asset Treatment Debug\">",
      "  <h2>Asset Facts / Asset Treatment Debug</h2>",
      "  <p>Debug samples and linked-record preview only. These controls do not save records, mutate offsetAssets, or run production analysis methods.</p>",
      "  <div class=\"lens-asset-debug-actions\">",
      "    <button type=\"button\" data-asset-debug-action=\"asset-facts\">Run Asset Facts Sample</button>",
      "    <button type=\"button\" data-asset-debug-action=\"asset-treatment\">Run Asset Treatment Sample</button>",
      "    <button type=\"button\" data-asset-debug-action=\"treated-asset-offsets-preview\">Run Treated Asset Offsets Preview</button>",
      "    <button type=\"button\" data-asset-debug-action=\"asset-offset-comparison\">Compare Legacy vs Treated Offsets</button>",
      "    <button type=\"button\" data-asset-debug-action=\"needs-offset-comparison\">Compare Needs Legacy vs Treated</button>",
      "    <button type=\"button\" data-asset-debug-action=\"clear\">Clear Asset Debug Output</button>",
      "  </div>",
      "  <pre class=\"lens-asset-debug-output\" id=\"" + ASSET_DEBUG_OUTPUT_ID + "\" aria-live=\"polite\"></pre>",
      "</section>"
    ].join("");
    bindAssetDebugControls(panel);
    document.body.appendChild(panel);
    return panel;
  }

  function refreshLensIncomeDebugPanel(runtimeNamespace) {
    if (!isLensIncomeDebugEnabled(window.location)) {
      return null;
    }

    const createLensModelFromBlockOutputs = lensAnalysis.createLensModelFromBlockOutputs;
    if (typeof createLensModelFromBlockOutputs !== "function") {
      return null;
    }

    const panel = ensureDebugPanel();
    if (!panel) {
      return null;
    }

    const runtime = runtimeNamespace && typeof runtimeNamespace === "object"
      ? runtimeNamespace
      : (LensApp.lensAnalysisRuntime || {});
    const blockOutputs = runtime.blockOutputs && typeof runtime.blockOutputs === "object"
      ? runtime.blockOutputs
      : {};
    const lensModel = createLensModelFromBlockOutputs(blockOutputs);
    const rows = createInspectionRows(blockOutputs, lensModel);
    const summaryNode = document.getElementById(SUMMARY_ID);
    const tableBody = document.getElementById(TABLE_BODY_ID);

    if (summaryNode) {
      summaryNode.textContent = createSummaryText(blockOutputs, lensModel);
    }

    if (tableBody) {
      tableBody.innerHTML = rows.map(function (row) {
        const valueText = formatDebugValue(row.value);
        const sourceBlockText = formatDebugValue(row.sourceBlock);
        const confidenceText = formatDebugValue(row.confidence);
        return [
          "<tr>",
          "  <td>" + escapeHtml(row.section) + "</td>",
          "  <td>" + escapeHtml(row.field) + "</td>",
          "  <td data-null=\"" + (valueText === "null" ? "true" : "false") + "\">" + escapeHtml(valueText) + "</td>",
          "  <td data-null=\"" + (sourceBlockText === "null" ? "true" : "false") + "\">" + escapeHtml(sourceBlockText) + "</td>",
          "  <td data-null=\"" + (confidenceText === "null" ? "true" : "false") + "\">" + escapeHtml(confidenceText) + "</td>",
          "</tr>"
        ].join("");
      }).join("");
    }

    return {
      blockOutputs: blockOutputs,
      lensModel: lensModel,
      incomeBasis: lensModel.incomeBasis,
      ongoingSupport: lensModel.ongoingSupport,
      educationSupport: lensModel.educationSupport,
      finalExpenses: lensModel.finalExpenses,
      transitionNeeds: lensModel.transitionNeeds,
      existingCoverage: lensModel.existingCoverage,
      offsetAssets: lensModel.offsetAssets,
      survivorScenario: lensModel.survivorScenario,
      debtPayoff: lensModel.debtPayoff,
      normalizationMetadata: lensModel.normalizationMetadata || null
    };
  }

  function mountLensIncomeDebugPanel(runtimeNamespace) {
    if (!isLensIncomeDebugEnabled(window.location)) {
      return null;
    }

    ensureDebugPanel();
    return refreshLensIncomeDebugPanel(runtimeNamespace);
  }

  lensAnalysisDev.DEBUG_QUERY_PARAM = DEBUG_QUERY_PARAM;
  lensAnalysisDev.isLensIncomeDebugEnabled = isLensIncomeDebugEnabled;
  lensAnalysisDev.mountLensIncomeDebugPanel = mountLensIncomeDebugPanel;
  lensAnalysisDev.refreshLensIncomeDebugPanel = refreshLensIncomeDebugPanel;
})();
