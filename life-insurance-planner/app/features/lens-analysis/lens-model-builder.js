(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis saved-data builder.
  // Purpose: derive the canonical Lens model from saved linked profile /
  // protectionModeling source data without depending on active PMI DOM fields.
  // Non-goals: no DOM reads, no storage writes/reads, no recommendation logic,
  // no coverage-gap math, and no legacy analysis bucket dependency.

  const SURVIVOR_NET_INCOME_TAX_BASIS = "Qualifying Surviving Spouse";

  function createWarning(code, message, details) {
    return {
      code,
      message,
      ...(details && typeof details === "object" ? { details } : {})
    };
  }

  function addWarning(warnings, code, message, details) {
    warnings.push(createWarning(code, message, details));
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function clonePlainObject(value) {
    return isPlainObject(value) ? { ...value } : {};
  }

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function isBlankValue(value) {
    return value == null || normalizeString(value) === "";
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

  function getFirstPresent(source, fieldNames) {
    const safeSource = source && typeof source === "object" ? source : {};
    const names = Array.isArray(fieldNames) ? fieldNames : [];

    for (let index = 0; index < names.length; index += 1) {
      const fieldName = names[index];
      if (Object.prototype.hasOwnProperty.call(safeSource, fieldName) && !isBlankValue(safeSource[fieldName])) {
        return safeSource[fieldName];
      }
    }

    return null;
  }

  function normalizeYesNoBoolean(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "boolean") {
      return value;
    }

    const normalized = normalizeString(value).toLowerCase();
    if (normalized === "yes" || normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "no" || normalized === "false" || normalized === "0") {
      return false;
    }

    return null;
  }

  function isTrue(value) {
    return value === true || normalizeString(value).toLowerCase() === "true";
  }

  function clampPercent(value) {
    const number = toOptionalNumber(value);
    if (number == null) {
      return null;
    }

    return Math.min(100, Math.max(0, number));
  }

  function getSavedSurvivorSupportAssumptions(profileRecord) {
    const analysisSettings = isPlainObject(profileRecord?.analysisSettings)
      ? profileRecord.analysisSettings
      : {};
    return isPlainObject(analysisSettings.survivorSupportAssumptions)
      ? analysisSettings.survivorSupportAssumptions
      : null;
  }

  function getExplicitSurvivorScenarioAssumptions(profileRecord) {
    const survivorSupport = getSavedSurvivorSupportAssumptions(profileRecord);
    const survivorScenario = isPlainObject(survivorSupport?.survivorScenario)
      ? survivorSupport.survivorScenario
      : null;
    if (!survivorScenario) {
      return null;
    }

    const hasExplicitValue = [
      "survivorContinuesWorking",
      "expectedSurvivorWorkReductionPercent",
      "survivorIncomeStartDelayMonths",
      "survivorEarnedIncomeGrowthRatePercent",
      "survivorRetirementHorizonYears"
    ].some(function (fieldName) {
      return Object.prototype.hasOwnProperty.call(survivorScenario, fieldName)
        && !isBlankValue(survivorScenario[fieldName]);
    });

    return hasExplicitValue ? survivorScenario : null;
  }

  function getScenarioAssumptionValue(survivorScenario, fieldName, fallback) {
    return survivorScenario && Object.prototype.hasOwnProperty.call(survivorScenario, fieldName)
      && !isBlankValue(survivorScenario[fieldName])
      ? survivorScenario[fieldName]
      : fallback;
  }

  function hasScenarioAssumptionValue(survivorScenario, fieldName) {
    return Boolean(
      survivorScenario
      && Object.prototype.hasOwnProperty.call(survivorScenario, fieldName)
      && !isBlankValue(survivorScenario[fieldName])
    );
  }

  function resolveSourceData(input, warnings) {
    const options = input && typeof input === "object" ? input : {};
    const profileRecord = isPlainObject(options.profileRecord) ? options.profileRecord : {};
    const protectionModelingPayload = isPlainObject(options.protectionModelingPayload)
      ? options.protectionModelingPayload
      : null;

    if (isPlainObject(options.sourceData)) {
      return {
        sourceData: clonePlainObject(options.sourceData),
        source: "sourceData"
      };
    }

    if (isPlainObject(protectionModelingPayload?.data)) {
      return {
        sourceData: clonePlainObject(protectionModelingPayload.data),
        source: "protectionModelingPayload.data"
      };
    }

    if (isPlainObject(profileRecord?.protectionModeling?.data)) {
      return {
        sourceData: clonePlainObject(profileRecord.protectionModeling.data),
        source: "profileRecord.protectionModeling.data"
      };
    }

    addWarning(
      warnings,
      "missing-source-data",
      "No saved protectionModeling source data was found; builder used an empty source object."
    );

    return {
      sourceData: {},
      source: "empty"
    };
  }

  function getProfileNumber(profileRecord, fieldNames) {
    const value = getFirstPresent(profileRecord, fieldNames);
    return toOptionalNumber(value);
  }

  function hasStructuredDependentDetailsSource(profileRecord) {
    const dependentDetails = profileRecord?.dependentDetails;
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

  function getProfileCurrentDependentCount(profileRecord, profileFieldNames) {
    const getCurrentDependentCount = LensApp.clientRecords?.getCurrentDependentCount;
    if (hasStructuredDependentDetailsSource(profileRecord) && typeof getCurrentDependentCount === "function") {
      return getCurrentDependentCount(profileRecord);
    }

    return getProfileNumber(profileRecord, profileFieldNames);
  }

  function getLinkedDependentCount(profileRecord, sourceData, fieldName, profileFieldNames, warnings) {
    const profileValue = getProfileNumber(profileRecord, profileFieldNames);
    if (profileValue != null) {
      return profileValue;
    }

    const savedValue = toOptionalNumber(sourceData[fieldName]);
    if (savedValue != null) {
      addWarning(
        warnings,
        "linked-profile-dependent-fallback",
        "Linked profile dependent count was unavailable; saved PMI dependent count was used.",
        { fieldName }
      );
      return savedValue;
    }

    return null;
  }

  function getLinkedCurrentDependentCount(profileRecord, sourceData, fieldName, profileFieldNames, warnings) {
    const profileValue = getProfileCurrentDependentCount(profileRecord, profileFieldNames);
    if (profileValue != null) {
      return profileValue;
    }

    const savedValue = toOptionalNumber(sourceData[fieldName]);
    if (savedValue != null) {
      addWarning(
        warnings,
        "linked-profile-dependent-fallback",
        "Linked profile dependent count was unavailable; saved PMI dependent count was used.",
        { fieldName }
      );
      return savedValue;
    }

    return null;
  }

  function getCoveragePolicies(profileRecord, warnings) {
    if (!profileRecord || !isPlainObject(profileRecord)) {
      addWarning(
        warnings,
        "missing-profile-record",
        "No linked profile record was provided; profile-linked coverage and dependent facts may be incomplete."
      );
      return [];
    }

    if (!Array.isArray(profileRecord.coveragePolicies)) {
      return [];
    }

    return profileRecord.coveragePolicies
      .filter(function (policy) {
        return policy && typeof policy === "object";
      })
      .map(function (policy) {
        return { ...policy };
      });
  }

  function getMaritalStatus(profileRecord, sourceData) {
    return normalizeString(
      getFirstPresent(profileRecord, ["maritalStatus", "linkedMaritalStatusDisplay"])
      || getFirstPresent(sourceData, ["linkedMaritalStatusDisplay", "maritalStatus"])
    );
  }

  function getStateOfResidence(profileRecord, sourceData) {
    return normalizeString(
      getFirstPresent(sourceData, ["stateOfResidence"])
      || getFirstPresent(profileRecord, ["state", "stateOfResidence"])
    ).toUpperCase();
  }

  function getIncomeCalculationMode(sourceData, profileRecord) {
    const maritalStatus = getMaritalStatus(profileRecord, sourceData);
    const filingStatus = normalizeString(sourceData.filingStatus);

    if (maritalStatus === "Married" && filingStatus === "Married Filing Jointly") {
      return "joint";
    }

    if (maritalStatus === "Married" && filingStatus === "Married Filing Separately") {
      return "separate";
    }

    return "single";
  }

  function getDeductionMethodValue(value) {
    return normalizeString(value).toLowerCase() === "itemized" ? "itemized" : "standard";
  }

  function getIncomeTaxCalculations() {
    return lensAnalysis.incomeTaxCalculations || {};
  }

  function resolveTaxConfig(input) {
    const taxConfig = input && typeof input === "object" ? input.taxConfig : null;
    if (isPlainObject(taxConfig)) {
      return taxConfig;
    }

    const incomeTaxCalculations = getIncomeTaxCalculations();
    if (typeof incomeTaxCalculations.createDefaultPmiTaxConfig === "function") {
      return incomeTaxCalculations.createDefaultPmiTaxConfig({
        taxUtils: global.LensPmiTaxUtils || null
      });
    }

    return null;
  }

  function pushResultWarnings(warnings, result) {
    const resultWarnings = Array.isArray(result?.warnings) ? result.warnings : [];
    resultWarnings.forEach(function (warning) {
      if (warning && typeof warning === "object") {
        warnings.push(warning);
      }
    });
  }

  function calculateCurrentNetIncomeValues(input, sourceData, profileRecord, warnings) {
    const incomeTaxCalculations = getIncomeTaxCalculations();
    if (typeof incomeTaxCalculations.calculateCurrentNetIncomeValues !== "function") {
      addWarning(
        warnings,
        "tax-recomputation-unavailable",
        "Net-income recomputation was skipped because the shared income-tax helper is unavailable.",
        { context: "income-net-income" }
      );
      return null;
    }

    const result = incomeTaxCalculations.calculateCurrentNetIncomeValues({
      sourceData,
      profileRecord,
      taxConfig: resolveTaxConfig(input)
    });
    pushResultWarnings(warnings, result);

    return {
      primary: result?.primaryNetAnnualIncome,
      spouse: result?.spouseNetAnnualIncome
    };
  }

  function calculateSurvivorNetIncome(input, sourceData, profileRecord, grossIncome, warnings) {
    const incomeTaxCalculations = getIncomeTaxCalculations();
    if (typeof incomeTaxCalculations.calculateSurvivorNetIncome !== "function") {
      addWarning(
        warnings,
        "tax-recomputation-unavailable",
        "Survivor net-income recomputation was skipped because the shared income-tax helper is unavailable.",
        { context: "survivor-scenario" }
      );
      return null;
    }

    const result = incomeTaxCalculations.calculateSurvivorNetIncome({
      sourceData,
      profileRecord,
      grossIncome,
      filingStatus: SURVIVOR_NET_INCOME_TAX_BASIS,
      taxConfig: resolveTaxConfig(input)
    });
    pushResultWarnings(warnings, result);
    return result?.netAnnualIncome ?? null;
  }

  function calculateTotalDebtPayoffNeed(sourceData) {
    const fields = [
      "mortgageBalance",
      "otherRealEstateLoans",
      "autoLoans",
      "creditCardDebt",
      "studentLoans",
      "personalLoans",
      "taxLiabilities",
      "businessDebt",
      "otherLoanObligations"
    ];
    let hasAnyValue = false;
    let total = 0;

    fields.forEach(function (fieldName) {
      const value = toOptionalNumber(sourceData[fieldName]);
      if (value == null) {
        return;
      }

      hasAnyValue = true;
      total += value;
    });

    return hasAnyValue ? total : null;
  }

  function createIncomeBlockSource(input, sourceData, profileRecord, warnings) {
    const incomeCalculationMode = getIncomeCalculationMode(sourceData, profileRecord);
    const primaryNetManualOverride = isTrue(sourceData.netAnnualIncomeManualOverride);
    const spouseNetManualOverride = isTrue(sourceData.spouseNetAnnualIncomeManualOverride);
    const primaryGrossIncome = toOptionalNumber(sourceData.grossAnnualIncome);
    const spouseGrossIncome = toOptionalNumber(sourceData.spouseIncome);
    const shouldRecomputePrimaryNet = !primaryNetManualOverride && primaryGrossIncome != null;
    const shouldRecomputeSpouseNet = incomeCalculationMode === "separate"
      && !spouseNetManualOverride
      && spouseGrossIncome != null;
    const netValues = shouldRecomputePrimaryNet || shouldRecomputeSpouseNet
      ? calculateCurrentNetIncomeValues(input, sourceData, profileRecord, warnings)
      : null;
    const selectedPrimaryNetIncome = primaryNetManualOverride
      ? sourceData.netAnnualIncome
      : (shouldRecomputePrimaryNet ? netValues?.primary : null);
    const selectedSpouseNetIncome = incomeCalculationMode === "separate"
      ? (spouseNetManualOverride
        ? sourceData.spouseNetAnnualIncome
        : (shouldRecomputeSpouseNet ? netValues?.spouse : null))
      : null;
    const source = {
      grossAnnualIncome: sourceData.grossAnnualIncome,
      netAnnualIncome: selectedPrimaryNetIncome,
      netAnnualIncomeManualOverride: primaryNetManualOverride,
      bonusVariableIncome: sourceData.bonusVariableIncome,
      employerBenefitsValue: sourceData.employerBenefitsValue,
      yearsUntilRetirement: sourceData.yearsUntilRetirement,
      incomeGrowthRate: sourceData.incomeGrowthRate,
      spouseOrPartnerIncomeApplicability: incomeCalculationMode === "separate" ? "separate" : "not_applicable",
      spouseIncome: incomeCalculationMode === "separate" ? sourceData.spouseIncome : null,
      spouseNetAnnualIncome: selectedSpouseNetIncome,
      spouseNetAnnualIncomeManualOverride: incomeCalculationMode === "separate" && spouseNetManualOverride
    };

    if (!primaryNetManualOverride && !isBlankValue(sourceData.netAnnualIncome) && primaryGrossIncome == null) {
      addWarning(
        warnings,
        "saved-calculated-net-income-ignored",
        "Saved insured net annual income was ignored because it was not marked as a manual override and gross income was unavailable for recomputation."
      );
    }

    if (
      incomeCalculationMode === "separate"
      && !spouseNetManualOverride
      && !isBlankValue(sourceData.spouseNetAnnualIncome)
      && spouseGrossIncome == null
    ) {
      addWarning(
        warnings,
        "saved-calculated-spouse-net-income-ignored",
        "Saved spouse net annual income was ignored because it was not marked as a manual override and spouse gross income was unavailable for recomputation."
      );
    }

    if (source.netAnnualIncome == null && primaryGrossIncome != null) {
      addWarning(
        warnings,
        "net-income-missing",
        "Insured net annual income was not saved and could not be recomputed; annualIncomeReplacementBase may remain null."
      );
    }

    return source;
  }

  function createTaxContextSource(sourceData, profileRecord) {
    const primaryDeductionMethod = getDeductionMethodValue(sourceData.deductionMethod);
    const spouseDeductionMethod = getDeductionMethodValue(sourceData.spouseDeductionMethod);

    return {
      linkedMaritalStatusDisplay: getMaritalStatus(profileRecord, sourceData),
      filingStatus: sourceData.filingStatus,
      stateOfResidence: getStateOfResidence(profileRecord, sourceData),
      deductionMethod: primaryDeductionMethod,
      spouseDeductionMethod,
      yearlyTaxDeductions: primaryDeductionMethod === "itemized" ? sourceData.yearlyTaxDeductions : null,
      spouseYearlyTaxDeductions: spouseDeductionMethod === "itemized" ? sourceData.spouseYearlyTaxDeductions : null
    };
  }

  function createDebtPayoffSource(sourceData) {
    const manualOverride = isTrue(sourceData.totalDebtPayoffNeedManualOverride);
    return {
      mortgageBalance: sourceData.mortgageBalance,
      otherRealEstateLoans: sourceData.otherRealEstateLoans,
      autoLoans: sourceData.autoLoans,
      creditCardDebt: sourceData.creditCardDebt,
      studentLoans: sourceData.studentLoans,
      personalLoans: sourceData.personalLoans,
      taxLiabilities: sourceData.taxLiabilities,
      businessDebt: sourceData.businessDebt,
      otherLoanObligations: sourceData.otherLoanObligations,
      totalDebtPayoffNeed: manualOverride
        ? sourceData.totalDebtPayoffNeed
        : calculateTotalDebtPayoffNeed(sourceData),
      totalDebtPayoffNeedManualOverride: manualOverride
    };
  }

  function getHousingSupportCalculations() {
    return lensAnalysis.housingSupportCalculations || {};
  }

  function getHousingMaintenanceRows(input) {
    const builderInput = input && typeof input === "object" ? input : {};
    const builderOptions = builderInput.options && typeof builderInput.options === "object"
      ? builderInput.options
      : {};

    if (Array.isArray(builderOptions.housingMaintenanceRows)) {
      return builderOptions.housingMaintenanceRows;
    }

    if (Array.isArray(builderOptions.maintenanceRows)) {
      return builderOptions.maintenanceRows;
    }

    if (Array.isArray(builderInput.housingMaintenanceRows)) {
      return builderInput.housingMaintenanceRows;
    }

    if (Array.isArray(builderInput.maintenanceRows)) {
      return builderInput.maintenanceRows;
    }

    return null;
  }

  function shouldWarnAboutDefaultHousingMaintenanceRows(sourceData) {
    const housingStatus = normalizeString(sourceData.housingStatus);
    return (housingStatus === "Homeowner" || housingStatus === "Owns Free and Clear")
      && !isBlankValue(sourceData.homeSquareFootage);
  }

  function createHousingSource(input, sourceData, warnings) {
    const housingSupportCalculations = getHousingSupportCalculations();
    if (typeof housingSupportCalculations.calculateHousingSupportInputs === "function") {
      const maintenanceRows = getHousingMaintenanceRows(input);
      const housingCalculationResult = housingSupportCalculations.calculateHousingSupportInputs(
        sourceData,
        maintenanceRows ? { maintenanceRows } : {}
      );

      if (Array.isArray(housingCalculationResult?.warnings)) {
        housingCalculationResult.warnings.forEach(function (warning) {
          warnings.push(warning);
        });
      }

      if (!maintenanceRows && shouldWarnAboutDefaultHousingMaintenanceRows(sourceData)) {
        addWarning(
          warnings,
          "housing-maintenance-config-defaulted",
          "Saved-data housing support used the default maintenance table because no external housing maintenance rows were supplied to the builder."
        );
      }

      return housingCalculationResult?.blockSourceData || {};
    }

    const hasRawHousingData = [
      "housingStatus",
      "mortgageBalance",
      "mortgageTermRemainingYears",
      "mortgageTermRemainingMonths",
      "mortgageInterestRate",
      "monthlyHousingCost",
      "otherMonthlyRenterHousingCosts",
      "utilitiesCost",
      "housingInsuranceCost",
      "propertyTax",
      "monthlyHoaCost",
      "homeSquareFootage",
      "homeAgeYears"
    ].some(function (fieldName) {
      return !isBlankValue(sourceData[fieldName]);
    });

    const hasSavedHousingSupportTotal = isTrue(sourceData.calculatedMonthlyMortgagePaymentManualOverride)
      || !isBlankValue(sourceData.calculatedMonthlyMortgagePayment);

    if (hasRawHousingData && !hasSavedHousingSupportTotal) {
      addWarning(
        warnings,
        "housing-recomputation-unavailable",
        "Saved-data builder passed raw housing fields but did not recompute page-local housing support totals. Extract the active PMI housing helpers before relying on saved-data housing totals.",
        {
          missingHelpers: [
            "calculateMortgagePaymentOnlyAmount",
            "syncAssociatedMonthlyCostsField",
            "syncMaintenanceRecommendationField",
            "syncMonthlyMortgagePaymentField"
          ]
        }
      );
    }

    return {
      housingStatus: sourceData.housingStatus,
      mortgageBalance: sourceData.mortgageBalance,
      monthlyMortgagePaymentOnly: isTrue(sourceData.monthlyMortgagePaymentOnlyManualOverride)
        ? sourceData.monthlyMortgagePaymentOnly
        : null,
      monthlyMortgagePaymentOnlyManualOverride: isTrue(sourceData.monthlyMortgagePaymentOnlyManualOverride),
      mortgageTermRemainingYears: sourceData.mortgageTermRemainingYears,
      mortgageTermRemainingMonths: sourceData.mortgageTermRemainingMonths,
      mortgageInterestRate: sourceData.mortgageInterestRate,
      monthlyHousingCost: sourceData.monthlyHousingCost,
      otherMonthlyRenterHousingCosts: sourceData.otherMonthlyRenterHousingCosts,
      utilitiesCost: sourceData.utilitiesCost,
      housingInsuranceCost: sourceData.housingInsuranceCost,
      propertyTax: sourceData.propertyTax,
      monthlyHoaCost: sourceData.monthlyHoaCost,
      monthlyMaintenanceRecommendation: isTrue(sourceData.monthlyMaintenanceRecommendationManualOverride)
        ? sourceData.monthlyMaintenanceRecommendation
        : null,
      monthlyMaintenanceRecommendationManualOverride: isTrue(sourceData.monthlyMaintenanceRecommendationManualOverride),
      associatedMonthlyCosts: isTrue(sourceData.associatedMonthlyCostsManualOverride)
        ? sourceData.associatedMonthlyCosts
        : null,
      associatedMonthlyCostsManualOverride: isTrue(sourceData.associatedMonthlyCostsManualOverride),
      calculatedMonthlyMortgagePayment: isTrue(sourceData.calculatedMonthlyMortgagePaymentManualOverride)
        ? sourceData.calculatedMonthlyMortgagePayment
        : sourceData.calculatedMonthlyMortgagePayment,
      calculatedMonthlyMortgagePaymentManualOverride: isTrue(sourceData.calculatedMonthlyMortgagePaymentManualOverride)
    };
  }

  function createNonHousingSource(sourceData) {
    return {
      insuranceCost: sourceData.insuranceCost,
      healthcareOutOfPocketCost: sourceData.healthcareOutOfPocketCost,
      foodCost: sourceData.foodCost,
      transportationCost: sourceData.transportationCost,
      childcareDependentCareCost: sourceData.childcareDependentCareCost,
      phoneInternetCost: sourceData.phoneInternetCost,
      householdSuppliesCost: sourceData.householdSuppliesCost,
      otherHouseholdExpenses: sourceData.otherHouseholdExpenses,
      travelDiscretionaryCost: sourceData.travelDiscretionaryCost,
      subscriptionsCost: sourceData.subscriptionsCost
    };
  }

  function parseSameEducationFundingFlag(value) {
    if (value == null || normalizeString(value) === "") {
      return null;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }

      if (value === 0) {
        return false;
      }

      return null;
    }

    const normalized = normalizeString(value).toLowerCase();
    if (["yes", "y", "true", "1", "same"].includes(normalized)) {
      return true;
    }

    if (["no", "n", "false", "0", "different"].includes(normalized)) {
      return false;
    }

    return null;
  }

  function useSameEducationFunding(sourceData) {
    const parsedFlag = parseSameEducationFundingFlag(sourceData.sameEducationFunding);
    return parsedFlag == null ? true : parsedFlag;
  }

  function createEducationSource(sourceData, profileRecord, warnings) {
    const sameFunding = useSameEducationFunding(sourceData);
    const projectedFunding = sameFunding
      ? sourceData.estimatedCostPerChild
      : sourceData.projectedEducationFundingPerDependent;

    return {
      childrenNeedingFunding: getLinkedCurrentDependentCount(
        profileRecord,
        sourceData,
        "childrenNeedingFunding",
        ["dependentsCount", "dependentCount"],
        warnings
      ),
      estimatedCostPerChild: sourceData.estimatedCostPerChild,
      sameEducationFunding: sameFunding ? "Yes" : "No",
      projectedDependentsCount: getLinkedDependentCount(
        profileRecord,
        sourceData,
        "projectedDependentsCount",
        ["projectedDependentsCount", "desiredDependentsCount"],
        warnings
      ),
      projectedEducationFundingPerDependent: projectedFunding
    };
  }

  function createFinalExpensesSource(sourceData) {
    return {
      funeralBurialEstimate: sourceData.funeralBurialEstimate,
      medicalEndOfLifeCosts: sourceData.medicalEndOfLifeCosts,
      estateSettlementCosts: sourceData.estateSettlementCosts,
      otherFinalExpenses: sourceData.otherFinalExpenses
    };
  }

  function createTransitionNeedsSource(sourceData) {
    return {
      immediateLiquidityBuffer: sourceData.immediateLiquidityBuffer,
      desiredEmergencyFund: sourceData.desiredEmergencyFund,
      relocationReserve: sourceData.relocationReserve,
      otherTransitionNeeds: sourceData.otherTransitionNeeds
    };
  }

  function createOffsetAssetsSource(sourceData) {
    const source = {};
    const assetDefinitions = Array.isArray(lensAnalysis.OFFSET_ASSET_DEFINITIONS)
      ? lensAnalysis.OFFSET_ASSET_DEFINITIONS
      : [];

    assetDefinitions.forEach(function (assetDefinition) {
      source[assetDefinition.valueField] = sourceData[assetDefinition.valueField];
      source[assetDefinition.includeField] = sourceData[assetDefinition.includeField];
      source[assetDefinition.liquidityField] = sourceData[assetDefinition.liquidityField];
      source[assetDefinition.percentField] = sourceData[assetDefinition.percentField];
    });
    source.assetsConfidenceLevel = sourceData.assetsConfidenceLevel;
    return source;
  }

  function createSurvivorScenarioSource(input, sourceData, profileRecord, warnings) {
    const survivorSupport = getSavedSurvivorSupportAssumptions(profileRecord);
    const survivorScenarioAssumptions = getExplicitSurvivorScenarioAssumptions(profileRecord);
    const survivorIncomeTreatment = isPlainObject(survivorSupport?.survivorIncomeTreatment)
      ? survivorSupport.survivorIncomeTreatment
      : {};
    const survivorContinuesWorking = normalizeYesNoBoolean(getScenarioAssumptionValue(
      survivorScenarioAssumptions,
      "survivorContinuesWorking",
      sourceData.survivorContinuesWorking
    ));
    const expectedWorkReductionPercent = clampPercent(getScenarioAssumptionValue(
      survivorScenarioAssumptions,
      "expectedSurvivorWorkReductionPercent",
      sourceData.spouseExpectedWorkReductionAtDeath
    ));
    const scenarioDrivesSurvivorIncome = hasScenarioAssumptionValue(
      survivorScenarioAssumptions,
      "survivorContinuesWorking"
    ) || hasScenarioAssumptionValue(
      survivorScenarioAssumptions,
      "expectedSurvivorWorkReductionPercent"
    );
    const sourceSurvivorGrossIncome = toOptionalNumber(sourceData.survivorIncome);
    let survivorGrossIncome = sourceSurvivorGrossIncome;
    const survivorNetManualOverride = scenarioDrivesSurvivorIncome
      ? false
      : isTrue(sourceData.survivorNetAnnualIncomeManualOverride);
    let survivorNetIncome = survivorNetManualOverride ? sourceData.survivorNetAnnualIncome : null;

    if (scenarioDrivesSurvivorIncome && survivorContinuesWorking === true) {
      const spouseGrossIncome = toOptionalNumber(sourceData.spouseIncome);
      if (spouseGrossIncome != null) {
        const reductionPercent = expectedWorkReductionPercent == null ? 0 : expectedWorkReductionPercent;
        survivorGrossIncome = Math.max(0, spouseGrossIncome * (1 - reductionPercent / 100));
      }
    } else if (scenarioDrivesSurvivorIncome && survivorContinuesWorking === false) {
      survivorGrossIncome = null;
    }

    if (
      survivorContinuesWorking === true
      && !survivorNetManualOverride
      && survivorGrossIncome != null
    ) {
      const calculatedSurvivorNetIncome = calculateSurvivorNetIncome(
        input,
        sourceData,
        profileRecord,
        survivorGrossIncome,
        warnings
      );

      if (calculatedSurvivorNetIncome != null) {
        survivorNetIncome = calculatedSurvivorNetIncome;
      }
    }

    if (
      scenarioDrivesSurvivorIncome
      && survivorContinuesWorking === true
      && survivorNetIncome == null
      && !isBlankValue(sourceData.survivorNetAnnualIncome)
    ) {
      survivorNetIncome = sourceData.survivorNetAnnualIncome;
    }

    if (survivorContinuesWorking === false) {
      survivorNetIncome = null;
    }

    if (
      survivorContinuesWorking === true
      && !scenarioDrivesSurvivorIncome
      && (!Object.prototype.hasOwnProperty.call(sourceData, "survivorIncomeManualOverride")
        || !Object.prototype.hasOwnProperty.call(sourceData, "survivorNetAnnualIncomeManualOverride"))
    ) {
      addWarning(
        warnings,
        "survivor-manual-state-not-persisted",
        "Saved survivor gross/net income values do not carry full DOM manual/suggested state; metadata may be less precise than active PMI runtime metadata."
      );
    }

    const rawStartDelayMonths = getScenarioAssumptionValue(
      survivorScenarioAssumptions,
      "survivorIncomeStartDelayMonths",
      sourceData.survivorIncomeStartDelayMonths
    );
    const startDelayMonths = survivorIncomeTreatment.applyStartDelay === false
      ? 0
      : rawStartDelayMonths;

    return {
      survivorContinuesWorking,
      spouseExpectedWorkReductionAtDeath: expectedWorkReductionPercent,
      survivorIncome: survivorGrossIncome,
      survivorIncomeManualOverride: scenarioDrivesSurvivorIncome ? false : isTrue(sourceData.survivorIncomeManualOverride),
      survivorNetAnnualIncome: survivorNetIncome,
      survivorNetAnnualIncomeManualOverride: survivorNetManualOverride,
      survivorIncomeStartDelayMonths: startDelayMonths,
      spouseIncomeGrowthRate: getScenarioAssumptionValue(
        survivorScenarioAssumptions,
        "survivorEarnedIncomeGrowthRatePercent",
        sourceData.spouseIncomeGrowthRate
      ),
      spouseYearsUntilRetirement: getScenarioAssumptionValue(
        survivorScenarioAssumptions,
        "survivorRetirementHorizonYears",
        sourceData.spouseYearsUntilRetirement
      ),
      survivorNetIncomeTaxBasis: SURVIVOR_NET_INCOME_TAX_BASIS
    };
  }

  function createSavedProtectionModelingBlockSourceObjects(input, warnings) {
    const safeWarnings = Array.isArray(warnings) ? warnings : [];
    const options = input && typeof input === "object" ? input : {};
    const hasProfileRecord = isPlainObject(options.profileRecord);
    const profileRecord = hasProfileRecord ? options.profileRecord : {};
    const resolvedSource = resolveSourceData(options, safeWarnings);
    const sourceData = resolvedSource.sourceData;

    if (!hasProfileRecord) {
      addWarning(
        safeWarnings,
        "missing-profile-record",
        "No linked profile record was provided; profile-linked coverage and dependent facts may be incomplete."
      );
    }

    return {
      sourceData,
      sourceResolution: resolvedSource.source,
      blockSourceObjects: {
        "income-net-income": createIncomeBlockSource(options, sourceData, profileRecord, safeWarnings),
        "tax-context": createTaxContextSource(sourceData, profileRecord),
        "debt-payoff": createDebtPayoffSource(sourceData),
        "housing-ongoing-support": createHousingSource(options, sourceData, safeWarnings),
        "non-housing-ongoing-support": createNonHousingSource(sourceData),
        "education-support": createEducationSource(sourceData, profileRecord, safeWarnings),
        "final-expenses": createFinalExpensesSource(sourceData),
        "transition-needs": createTransitionNeedsSource(sourceData),
        "existing-coverage": {
          coveragePolicies: getCoveragePolicies(profileRecord, safeWarnings)
        },
        "offset-assets": createOffsetAssetsSource(sourceData),
        "survivor-scenario": createSurvivorScenarioSource(options, sourceData, profileRecord, safeWarnings)
      }
    };
  }

  function getBlockBuilders() {
    return {
      "income-net-income": lensAnalysis.createNetIncomeBlockOutput,
      "tax-context": lensAnalysis.createTaxContextBlockOutput,
      "debt-payoff": lensAnalysis.createDebtPayoffBlockOutput,
      "housing-ongoing-support": lensAnalysis.createHousingOngoingSupportBlockOutput,
      "non-housing-ongoing-support": lensAnalysis.createNonHousingOngoingSupportBlockOutput,
      "education-support": lensAnalysis.createEducationSupportBlockOutput,
      "final-expenses": lensAnalysis.createFinalExpensesBlockOutput,
      "transition-needs": lensAnalysis.createTransitionNeedsBlockOutput,
      "existing-coverage": lensAnalysis.createExistingCoverageBlockOutput,
      "offset-assets": lensAnalysis.createOffsetAssetsBlockOutput,
      "survivor-scenario": lensAnalysis.createSurvivorScenarioBlockOutput
    };
  }

  function buildBlockOutputs(blockSourceObjects, warnings) {
    const safeWarnings = Array.isArray(warnings) ? warnings : [];
    const blockOutputs = {};
    const blockBuilders = getBlockBuilders();

    Object.keys(blockSourceObjects).forEach(function (blockId) {
      const builder = blockBuilders[blockId];
      if (typeof builder !== "function") {
        addWarning(
          safeWarnings,
          "missing-block-builder",
          "Lens block builder is unavailable; block output was skipped.",
          { blockId }
        );
        return;
      }

      blockOutputs[blockId] = builder(blockSourceObjects[blockId]);
    });

    return blockOutputs;
  }

  function createEmptyTreatedAssetOffsets(warnings, metadata) {
    const safeWarnings = Array.isArray(warnings) ? warnings : [];
    const safeMetadata = isPlainObject(metadata) ? metadata : {};

    return {
      assets: [],
      totalRawAssetValue: null,
      totalIncludedRawValue: null,
      totalTreatedAssetValue: null,
      excludedAssetValue: null,
      warnings: safeWarnings,
      trace: [],
      metadata: {
        ...safeMetadata,
        source: "lens-model-preparation",
        consumedByMethods: false
      }
    };
  }

  function resolveAssetTreatmentAssumptions(input) {
    const builderInput = input && typeof input === "object" ? input : {};
    const directAnalysisSettings = isPlainObject(builderInput.analysisSettings)
      ? builderInput.analysisSettings
      : null;
    const profileRecord = isPlainObject(builderInput.profileRecord) ? builderInput.profileRecord : {};
    const profileAnalysisSettings = isPlainObject(profileRecord.analysisSettings)
      ? profileRecord.analysisSettings
      : null;
    const analysisSettings = directAnalysisSettings || profileAnalysisSettings || {};

    return isPlainObject(analysisSettings.assetTreatmentAssumptions)
      ? analysisSettings.assetTreatmentAssumptions
      : null;
  }

  function createPreparedTreatedAssetOffsets(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const assetFacts = isPlainObject(safeLensModel.assetFacts) ? safeLensModel.assetFacts : null;
    const assetTreatmentAssumptions = resolveAssetTreatmentAssumptions(input);
    const calculateAssetTreatment = lensAnalysis.calculateAssetTreatment;

    if (!assetFacts || !Array.isArray(assetFacts.assets)) {
      return createEmptyTreatedAssetOffsets(
        [
          createWarning(
            "missing-asset-facts",
            "assetFacts.assets is missing; treated asset offsets were not calculated."
          )
        ],
        { reason: "missing-asset-facts" }
      );
    }

    if (!assetTreatmentAssumptions) {
      return createEmptyTreatedAssetOffsets(
        [
          createWarning(
            "missing-asset-treatment-assumptions",
            "Analysis Setup assetTreatmentAssumptions are missing; treated asset offsets were not calculated."
          )
        ],
        {
          reason: "missing-asset-treatment-assumptions",
          assetCount: assetFacts.assets.length
        }
      );
    }

    if (typeof calculateAssetTreatment !== "function") {
      return createEmptyTreatedAssetOffsets(
        [
          createWarning(
            "missing-asset-treatment-helper",
            "calculateAssetTreatment is unavailable; treated asset offsets were not calculated."
          )
        ],
        {
          reason: "missing-asset-treatment-helper",
          assetCount: assetFacts.assets.length
        }
      );
    }

    const result = calculateAssetTreatment({
      assetFacts,
      assetTreatmentAssumptions,
      options: {
        source: "lens-model-preparation",
        consumedByMethods: false
      }
    });
    const resultMetadata = isPlainObject(result?.metadata) ? result.metadata : {};

    return {
      assets: Array.isArray(result?.assets) ? result.assets : [],
      totalRawAssetValue: result?.totalRawAssetValue ?? null,
      totalIncludedRawValue: result?.totalIncludedRawValue ?? null,
      totalTreatedAssetValue: result?.totalTreatedAssetValue ?? null,
      excludedAssetValue: result?.excludedAssetValue ?? null,
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      trace: Array.isArray(result?.trace) ? result.trace : [],
      metadata: {
        ...resultMetadata,
        source: "lens-model-preparation",
        calculationSource: resultMetadata.source || "asset-treatment-calculations",
        consumedByMethods: false
      }
    };
  }

  function buildLensModelFromSavedProtectionModeling(input) {
    const warnings = [];
    const builderInput = input && typeof input === "object" ? input : {};
    const sourceResult = createSavedProtectionModelingBlockSourceObjects(builderInput, warnings);
    const blockOutputs = buildBlockOutputs(sourceResult.blockSourceObjects, warnings);
    const createLensModelFromBlockOutputs = lensAnalysis.createLensModelFromBlockOutputs;
    let lensModel = null;

    if (typeof createLensModelFromBlockOutputs !== "function") {
      addWarning(
        warnings,
        "missing-lens-normalizer",
        "createLensModelFromBlockOutputs is unavailable; normalized Lens model could not be built."
      );
    } else {
      lensModel = createLensModelFromBlockOutputs(blockOutputs, {
        sourceData: sourceResult.sourceData
      });

      if (isPlainObject(lensModel)) {
        lensModel.treatedAssetOffsets = createPreparedTreatedAssetOffsets(lensModel, builderInput);
      }
    }

    return {
      lensModel,
      blockOutputs,
      warnings
    };
  }

  lensAnalysis.SURVIVOR_NET_INCOME_TAX_BASIS = SURVIVOR_NET_INCOME_TAX_BASIS;
  lensAnalysis.createSavedProtectionModelingBlockSourceObjects = createSavedProtectionModelingBlockSourceObjects;
  lensAnalysis.buildLensModelFromSavedProtectionModeling = buildLensModelFromSavedProtectionModeling;
})(window);
