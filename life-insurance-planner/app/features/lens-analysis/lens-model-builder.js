(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis saved-data builder.
  // Purpose: derive the canonical Lens model from saved linked profile /
  // protectionModeling source data without depending on active PMI DOM fields.
  // Non-goals: no DOM reads, no storage writes/reads, no recommendation logic,
  // no coverage-gap math, and no legacy analysis bucket dependency.

  const SURVIVOR_NET_INCOME_TAX_BASIS = "Qualifying Surviving Spouse";
  const ASSET_OFFSET_SOURCE_TREATED = "treated";
  const TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH = "treatedExistingCoverageOffset.totalTreatedCoverageOffset";
  const TREATED_DEBT_DIME_NON_MORTGAGE_SOURCE_PATH = "treatedDebtPayoff.dime.nonMortgageDebtAmount";
  const TREATED_DEBT_DIME_MORTGAGE_SOURCE_PATH = "treatedDebtPayoff.dime.mortgageAmount";
  const TREATED_DEBT_NEEDS_PAYOFF_SOURCE_PATH = "treatedDebtPayoff.needs.debtPayoffAmount";
  const ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR = "currentDollarOnly";
  const ASSET_GROWTH_PROJECTION_MODE_REPORTING_ONLY = "reportingOnly";
  const ASSET_GROWTH_PROJECTION_MODE_PROJECTED_OFFSETS = "projectedOffsets";
  const ASSET_GROWTH_PROJECTION_MIN_YEARS = 0;
  const ASSET_GROWTH_PROJECTION_MAX_YEARS = 60;
  const ASSET_GROWTH_PROJECTION_CONSUMPTION_STATUS = "saved-only";
  const CASH_RESERVE_CONSUMPTION_STATUS = "saved-only";
  const CASH_RESERVE_MODE_METHOD_ACTIVE_FUTURE = "methodActiveFuture";
  const DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS = Object.freeze({
    applyStartDelay: true,
    survivorContinuesWorking: true,
    expectedSurvivorWorkReductionPercent: 25,
    survivorIncomeStartDelayMonths: 3,
    survivorEarnedIncomeGrowthRatePercent: 0,
    survivorRetirementHorizonYears: null
  });
  const LEGACY_SURVIVOR_TREATMENT_FIELD_NAMES = Object.freeze([
    "survivorContinuesWorking",
    "spouseExpectedWorkReductionAtDeath",
    "survivorIncome",
    "survivorNetAnnualIncome",
    "survivorIncomeStartDelayMonths",
    "spouseIncomeGrowthRate",
    "spouseYearsUntilRetirement",
    "survivorIncomeManualOverride",
    "survivorNetAnnualIncomeManualOverride",
    "incomeReplacementDuration",
    "expenseReductionAtDeath",
    "childDependencyDuration"
  ]);

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

  function cloneSerializable(value) {
    if (value == null) {
      return value;
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return value;
    }
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

  function getSurvivorSupportAssumptionContext(profileRecord) {
    const survivorSupport = getSavedSurvivorSupportAssumptions(profileRecord);
    const savedSurvivorScenario = isPlainObject(survivorSupport?.survivorScenario)
      ? survivorSupport.survivorScenario
      : {};
    const savedSurvivorIncomeTreatment = isPlainObject(survivorSupport?.survivorIncomeTreatment)
      ? survivorSupport.survivorIncomeTreatment
      : {};
    const defaultedFields = [];

    function getAssumptionValue(source, fieldName, fallback, sourcePath) {
      if (Object.prototype.hasOwnProperty.call(source, fieldName) && !isBlankValue(source[fieldName])) {
        return source[fieldName];
      }

      defaultedFields.push(sourcePath);
      return fallback;
    }

    function getBooleanAssumptionValue(source, fieldName, fallback, sourcePath) {
      if (typeof source[fieldName] === "boolean") {
        return source[fieldName];
      }

      if (Object.prototype.hasOwnProperty.call(source, fieldName) && !isBlankValue(source[fieldName])) {
        const normalized = normalizeYesNoBoolean(source[fieldName]);
        if (normalized != null) {
          return normalized;
        }
      }

      defaultedFields.push(sourcePath);
      return fallback;
    }

    return {
      source: survivorSupport
        ? "analysis-setup"
        : "defaulted-analysis-setup-survivor-support",
      defaulted: !survivorSupport,
      defaultedFields,
      survivorIncomeTreatment: {
        applyStartDelay: getBooleanAssumptionValue(
          savedSurvivorIncomeTreatment,
          "applyStartDelay",
          DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS.applyStartDelay,
          "analysisSettings.survivorSupportAssumptions.survivorIncomeTreatment.applyStartDelay"
        )
      },
      survivorScenario: {
        survivorContinuesWorking: getBooleanAssumptionValue(
          savedSurvivorScenario,
          "survivorContinuesWorking",
          DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS.survivorContinuesWorking,
          "analysisSettings.survivorSupportAssumptions.survivorScenario.survivorContinuesWorking"
        ),
        expectedSurvivorWorkReductionPercent: getAssumptionValue(
          savedSurvivorScenario,
          "expectedSurvivorWorkReductionPercent",
          DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS.expectedSurvivorWorkReductionPercent,
          "analysisSettings.survivorSupportAssumptions.survivorScenario.expectedSurvivorWorkReductionPercent"
        ),
        survivorIncomeStartDelayMonths: getAssumptionValue(
          savedSurvivorScenario,
          "survivorIncomeStartDelayMonths",
          DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS.survivorIncomeStartDelayMonths,
          "analysisSettings.survivorSupportAssumptions.survivorScenario.survivorIncomeStartDelayMonths"
        ),
        survivorEarnedIncomeGrowthRatePercent: getAssumptionValue(
          savedSurvivorScenario,
          "survivorEarnedIncomeGrowthRatePercent",
          DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS.survivorEarnedIncomeGrowthRatePercent,
          "analysisSettings.survivorSupportAssumptions.survivorScenario.survivorEarnedIncomeGrowthRatePercent"
        ),
        survivorRetirementHorizonYears: getAssumptionValue(
          savedSurvivorScenario,
          "survivorRetirementHorizonYears",
          DEFAULT_MODEL_SURVIVOR_INCOME_PREP_ASSUMPTIONS.survivorRetirementHorizonYears,
          "analysisSettings.survivorSupportAssumptions.survivorScenario.survivorRetirementHorizonYears"
        )
      }
    };
  }

  function collectIgnoredLegacySurvivorFields(sourceData) {
    const safeSource = sourceData && typeof sourceData === "object" ? sourceData : {};
    return LEGACY_SURVIVOR_TREATMENT_FIELD_NAMES.filter(function (fieldName) {
      return Object.prototype.hasOwnProperty.call(safeSource, fieldName)
        && !isBlankValue(safeSource[fieldName]);
    });
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

  function parseDependentDetails(profileRecord) {
    const dependentDetails = profileRecord?.dependentDetails;
    if (Array.isArray(dependentDetails)) {
      return dependentDetails;
    }

    if (typeof dependentDetails !== "string") {
      return [];
    }

    const normalizedDetails = dependentDetails.trim();
    if (!normalizedDetails) {
      return [];
    }

    try {
      const parsedDetails = JSON.parse(normalizedDetails);
      return Array.isArray(parsedDetails) ? parsedDetails : [];
    } catch (_error) {
      return [];
    }
  }

  function createEducationCurrentDependentDetails(profileRecord) {
    return parseDependentDetails(profileRecord)
      .map(function (detail, index) {
        if (!isPlainObject(detail)) {
          return null;
        }

        const dateOfBirth = normalizeString(detail.dateOfBirth || detail.birthDate);
        if (!dateOfBirth) {
          return null;
        }

        const dependentRow = {
          index,
          dateOfBirth
        };
        const id = normalizeString(detail.id);
        if (id) {
          dependentRow.id = id;
        }

        return dependentRow;
      })
      .filter(Boolean);
  }

  function createProfileFacts(profileRecord) {
    const hasDateOfBirth = Object.prototype.hasOwnProperty.call(profileRecord || {}, "dateOfBirth");
    const rawDateOfBirth = normalizeString(profileRecord?.dateOfBirth);
    const normalizedDateOfBirth = normalizeDateOnlyValue(rawDateOfBirth);
    const status = normalizedDateOfBirth
      ? "valid"
      : (rawDateOfBirth ? "invalid" : "missing");

    return {
      clientDateOfBirth: normalizedDateOfBirth,
      clientDateOfBirthSourcePath: hasDateOfBirth ? "profileRecord.dateOfBirth" : null,
      clientDateOfBirthStatus: status
    };
  }

  function attachProfileFacts(lensModel, profileRecord) {
    if (!isPlainObject(lensModel)) {
      return lensModel;
    }

    return {
      ...lensModel,
      profileFacts: {
        ...clonePlainObject(lensModel.profileFacts),
        ...createProfileFacts(profileRecord)
      }
    };
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

  function attachEducationCurrentDependentDetails(lensModel, profileRecord) {
    if (!isPlainObject(lensModel)) {
      return lensModel;
    }

    const currentDependentDetails = createEducationCurrentDependentDetails(profileRecord);
    if (!currentDependentDetails.length) {
      return lensModel;
    }

    return {
      ...lensModel,
      educationSupport: {
        ...clonePlainObject(lensModel.educationSupport),
        currentDependentDetails
      }
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
    const survivorSupportContext = getSurvivorSupportAssumptionContext(profileRecord);
    const survivorScenarioAssumptions = survivorSupportContext.survivorScenario;
    const survivorIncomeTreatment = survivorSupportContext.survivorIncomeTreatment;
    const survivorContinuesWorking = normalizeYesNoBoolean(
      survivorScenarioAssumptions.survivorContinuesWorking
    );
    const expectedWorkReductionPercent = clampPercent(
      survivorScenarioAssumptions.expectedSurvivorWorkReductionPercent
    );
    const spouseGrossIncome = toOptionalNumber(sourceData.spouseIncome);
    const sourceSurvivorGrossIncome = toOptionalNumber(sourceData.survivorIncome);
    const sourceSurvivorNetIncome = toOptionalNumber(sourceData.survivorNetAnnualIncome);
    const ignoredLegacySurvivorFields = collectIgnoredLegacySurvivorFields(sourceData);
    let survivorGrossIncome = null;
    let survivorNetIncome = null;
    let survivorIncomeSource = "missing-spouse-income";
    let survivorIncomeDerivedFromSpouseIncome = false;
    const legacySurvivorIncomeFallbackUsed = false;
    const fallbackReasons = [];
    const derivationWarnings = [];

    function addDerivationWarning(code, message, details) {
      derivationWarnings.push(createWarning(code, message, details));
    }

    if (survivorSupportContext.defaulted) {
      const warningDetails = {
        source: "analysisSettings.survivorSupportAssumptions",
        survivorSupportAssumptionsSource: survivorSupportContext.source,
        defaultedFields: survivorSupportContext.defaultedFields
      };
      addWarning(
        warnings,
        "missing-survivor-support-assumptions-defaulted",
        "Survivor & Support assumptions were missing; model builder used explicit Analysis Setup defaults.",
        warningDetails
      );
      addDerivationWarning(
        "missing-survivor-support-assumptions-defaulted",
        "Survivor & Support assumptions were missing; explicit Analysis Setup defaults were used.",
        warningDetails
      );
    }

    if (ignoredLegacySurvivorFields.length > 0) {
      const warningDetails = {
        ignoredLegacySurvivorFields,
        replacementSource: "analysisSettings.survivorSupportAssumptions"
      };
      addWarning(
        warnings,
        "legacy-survivor-fields-ignored",
        "Legacy PMI survivor treatment fields were ignored; Survivor & Support assumptions own survivor treatment.",
        warningDetails
      );
      addDerivationWarning(
        "legacy-survivor-fields-ignored",
        "Legacy PMI survivor treatment fields were ignored for survivor income preparation.",
        warningDetails
      );
    }

    if (survivorContinuesWorking === true) {
      if (spouseGrossIncome != null) {
        const reductionPercent = expectedWorkReductionPercent == null ? 0 : expectedWorkReductionPercent;
        survivorGrossIncome = Math.max(0, spouseGrossIncome * (1 - reductionPercent / 100));
        survivorIncomeSource = "derived-from-spouse-income";
        survivorIncomeDerivedFromSpouseIncome = true;
      } else {
        fallbackReasons.push("missing-spouse-income");
        addDerivationWarning(
          "missing-spouse-income-for-survivor-income-derivation",
          "Spouse income was unavailable, so survivor income could not be derived. Legacy survivor income fields were not used.",
          { sourcePath: "protectionModeling.data.spouseIncome" }
        );
      }
    } else if (survivorContinuesWorking === false) {
      survivorGrossIncome = null;
      survivorIncomeSource = "suppressed-survivor-not-working";
    }

    if (
      survivorContinuesWorking === true
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

    if (survivorContinuesWorking === false) {
      survivorNetIncome = null;
      survivorIncomeSource = "suppressed-survivor-not-working";
    }

    const rawStartDelayMonths = survivorScenarioAssumptions.survivorIncomeStartDelayMonths;
    const applyStartDelay = survivorIncomeTreatment.applyStartDelay !== false;
    const startDelayMonths = applyStartDelay === false
      ? 0
      : rawStartDelayMonths;
    const survivorIncomeDerivation = {
      survivorIncomeSource,
      rawSpouseIncome: spouseGrossIncome,
      rawSpouseIncomeSourcePath: "protectionModeling.data.spouseIncome",
      rawLegacySurvivorGrossIncome: sourceSurvivorGrossIncome,
      rawLegacySurvivorNetIncome: sourceSurvivorNetIncome,
      survivorIncomeDerivedFromSpouseIncome,
      legacySurvivorIncomeFallbackUsed,
      survivorContinuesWorking,
      expectedSurvivorWorkReductionPercent: expectedWorkReductionPercent,
      adjustedSurvivorGrossIncome: survivorGrossIncome,
      survivorNetAnnualIncomePrepared: survivorNetIncome == null ? null : toOptionalNumber(survivorNetIncome),
      survivorNetIncomeManualOverride: false,
      scenarioAssumptionsApplied: true,
      survivorSupportAssumptionsSource: survivorSupportContext.source,
      survivorSupportAssumptionsDefaulted: survivorSupportContext.defaulted,
      defaultedSurvivorSupportFields: survivorSupportContext.defaultedFields,
      ignoredLegacySurvivorFields,
      applyStartDelay,
      rawSurvivorIncomeStartDelayMonths: rawStartDelayMonths == null ? null : toOptionalNumber(rawStartDelayMonths),
      survivorIncomeStartDelayMonths: startDelayMonths == null ? null : toOptionalNumber(startDelayMonths),
      fallbackReasons,
      warnings: derivationWarnings,
      sourcePaths: [
        "protectionModeling.data.spouseIncome",
        "analysisSettings.survivorSupportAssumptions.survivorScenario.survivorContinuesWorking",
        "analysisSettings.survivorSupportAssumptions.survivorScenario.expectedSurvivorWorkReductionPercent",
        "analysisSettings.survivorSupportAssumptions.survivorIncomeTreatment.applyStartDelay",
        "analysisSettings.survivorSupportAssumptions.survivorScenario.survivorIncomeStartDelayMonths"
      ]
    };

    return {
      survivorContinuesWorking,
      spouseExpectedWorkReductionAtDeath: expectedWorkReductionPercent,
      survivorIncome: survivorGrossIncome,
      survivorIncomeManualOverride: false,
      survivorNetAnnualIncome: survivorNetIncome,
      survivorNetAnnualIncomeManualOverride: false,
      survivorIncomeStartDelayMonths: startDelayMonths,
      spouseIncomeGrowthRate: survivorScenarioAssumptions.survivorEarnedIncomeGrowthRatePercent,
      spouseYearsUntilRetirement: survivorScenarioAssumptions.survivorRetirementHorizonYears,
      survivorNetIncomeTaxBasis: SURVIVOR_NET_INCOME_TAX_BASIS,
      survivorIncomeDerivation
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

  function createEmptyTreatedExistingCoverageOffset(warnings, metadata) {
    const safeWarnings = Array.isArray(warnings) ? warnings : [];
    const safeMetadata = isPlainObject(metadata) ? metadata : {};

    return {
      policies: [],
      totalRawCoverage: null,
      totalIncludedRawCoverage: null,
      totalTreatedCoverageOffset: null,
      excludedCoverageValue: null,
      policyCount: 0,
      includedPolicyCount: 0,
      excludedPolicyCount: 0,
      totalsByTreatmentKind: {},
      warnings: safeWarnings,
      trace: [],
      metadata: {
        ...safeMetadata,
        source: "lens-model-preparation",
        consumedByMethods: false
      }
    };
  }

  function createDebtTreatmentMethodConsumptionMetadata(options) {
    const preparedDimeNonMortgageDebtAmount = toOptionalNumber(options?.preparedDimeNonMortgageDebtAmount);
    const preparedDimeMortgageAmount = toOptionalNumber(options?.preparedDimeMortgageAmount);
    const preparedNeedsDebtPayoffAmount = toOptionalNumber(options?.preparedNeedsDebtPayoffAmount);
    const dimeDebtConsumesTreatedDebt = preparedDimeNonMortgageDebtAmount != null
      && preparedDimeNonMortgageDebtAmount >= 0;
    const dimeMortgageConsumesTreatedDebt = preparedDimeMortgageAmount != null
      && preparedDimeMortgageAmount >= 0;
    const dimeConsumesTreatedDebt = dimeDebtConsumesTreatedDebt || dimeMortgageConsumesTreatedDebt;
    const needsConsumesTreatedDebt = preparedNeedsDebtPayoffAmount != null && preparedNeedsDebtPayoffAmount >= 0;
    const consumedByMethodNames = [];
    if (dimeConsumesTreatedDebt) {
      consumedByMethodNames.push("dime");
    }
    if (needsConsumesTreatedDebt) {
      consumedByMethodNames.push("needs");
    }

    return {
      consumedByMethods: consumedByMethodNames.length > 0,
      consumedByMethodNames,
      methodConsumption: {
        dime: dimeConsumesTreatedDebt,
        needs: needsConsumesTreatedDebt,
        hlv: false
      },
      currentMethodSourcePaths: {
        dimeDebt: dimeDebtConsumesTreatedDebt
          ? TREATED_DEBT_DIME_NON_MORTGAGE_SOURCE_PATH
          : "debtPayoff",
        dimeMortgage: dimeMortgageConsumesTreatedDebt
          ? TREATED_DEBT_DIME_MORTGAGE_SOURCE_PATH
          : "debtPayoff.mortgageBalance",
        needsDebtPayoff: needsConsumesTreatedDebt
          ? TREATED_DEBT_NEEDS_PAYOFF_SOURCE_PATH
          : "debtPayoff"
      },
      methodDebtSourcePath: consumedByMethodNames.length ? "partial-method-consumption" : "debtPayoff",
      dimeDebtSourcePath: dimeDebtConsumesTreatedDebt
        ? TREATED_DEBT_DIME_NON_MORTGAGE_SOURCE_PATH
        : "debtPayoff",
      dimeMortgageSourcePath: dimeMortgageConsumesTreatedDebt
        ? TREATED_DEBT_DIME_MORTGAGE_SOURCE_PATH
        : "debtPayoff.mortgageBalance",
      needsDebtSourcePath: needsConsumesTreatedDebt
        ? TREATED_DEBT_NEEDS_PAYOFF_SOURCE_PATH
        : "debtPayoff"
    };
  }

  function createEmptyTreatedDebtPayoff(warnings, metadata) {
    const safeWarnings = Array.isArray(warnings) ? warnings : [];
    const safeMetadata = isPlainObject(metadata) ? metadata : {};
    const methodConsumptionMetadata = createDebtTreatmentMethodConsumptionMetadata();

    return {
      rawEquivalentDefault: false,
      treatmentApplied: false,
      source: null,
      fallbackSource: null,
      dime: {
        nonMortgageDebtAmount: null,
        mortgageAmount: null,
        totalDebtAndMortgageAmount: null
      },
      needs: {
        debtPayoffAmount: null,
        mortgagePayoffAmount: null,
        nonMortgageDebtAmount: null
      },
      rawTotals: {
        totalDebtBalance: null,
        mortgageBalance: null,
        nonMortgageDebtBalance: null,
        excludedDebtAmount: null,
        deferredDebtAmount: null
      },
      excludedDebtAmount: null,
      deferredDebtAmount: null,
      debts: [],
      warnings: safeWarnings,
      trace: {
        debts: [],
        rawEquivalentDefault: false,
        treatmentApplied: false,
        source: null,
        fallbackSource: null,
        manualTotalDebtPayoffOverride: false
      },
      metadata: {
        ...safeMetadata,
        source: "lens-model-preparation",
        preparationSource: "lens-model-preparation",
        ...methodConsumptionMetadata,
        warnings: safeWarnings
      }
    };
  }

  function createMortgageSupportFacts(lensModel) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const ongoingSupport = isPlainObject(safeLensModel.ongoingSupport)
      ? safeLensModel.ongoingSupport
      : {};

    return {
      monthlyMortgagePayment: ongoingSupport.monthlyMortgagePayment,
      monthlyMortgagePaymentSourcePath: "ongoingSupport.monthlyMortgagePayment",
      mortgageRemainingTermMonths: ongoingSupport.mortgageRemainingTermMonths,
      mortgageRemainingTermMonthsSourcePath: "ongoingSupport.mortgageRemainingTermMonths"
    };
  }

  function resolveAnalysisSettings(input) {
    const builderInput = input && typeof input === "object" ? input : {};
    const directAnalysisSettings = isPlainObject(builderInput.analysisSettings)
      ? builderInput.analysisSettings
      : null;
    const profileRecord = isPlainObject(builderInput.profileRecord) ? builderInput.profileRecord : {};
    const profileAnalysisSettings = isPlainObject(profileRecord.analysisSettings)
      ? profileRecord.analysisSettings
      : null;
    const analysisSettings = directAnalysisSettings || profileAnalysisSettings || {};

    return analysisSettings;
  }

  function resolveExistingCoverageTreatmentAssumptions(input) {
    const analysisSettings = resolveAnalysisSettings(input);

    return isPlainObject(analysisSettings.existingCoverageAssumptions)
      ? analysisSettings.existingCoverageAssumptions
      : {};
  }

  function normalizeDateOnlyValue(value) {
    if (value == null || value === "") {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return [
        String(value.getUTCFullYear()).padStart(4, "0"),
        String(value.getUTCMonth() + 1).padStart(2, "0"),
        String(value.getUTCDate()).padStart(2, "0")
      ].join("-");
    }

    const match = normalizeString(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      Number.isNaN(date.getTime())
      || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }

    return [
      String(year).padStart(4, "0"),
      String(monthIndex + 1).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");
  }

  function resolveExistingCoverageTreatmentValuationDate(input, existingCoverageAssumptions) {
    const builderInput = input && typeof input === "object" ? input : {};
    const options = isPlainObject(builderInput.options) ? builderInput.options : {};
    const analysisSettings = resolveAnalysisSettings(input);
    const assumptions = isPlainObject(existingCoverageAssumptions) ? existingCoverageAssumptions : {};
    const candidates = [
      { value: options.valuationDate, source: "input.options.valuationDate" },
      { value: builderInput.valuationDate, source: "input.valuationDate" },
      { value: analysisSettings.valuationDate, source: "analysisSettings.valuationDate" },
      {
        value: assumptions.valuationDate,
        source: "analysisSettings.existingCoverageAssumptions.valuationDate",
        deprecated: true
      },
      {
        value: assumptions.asOfDate,
        source: "analysisSettings.existingCoverageAssumptions.asOfDate",
        deprecated: true
      }
    ];
    const warnings = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (isBlankValue(candidate.value)) {
        continue;
      }

      const valuationDate = normalizeDateOnlyValue(candidate.value);
      if (valuationDate) {
        const deprecatedWarningCode = "deprecated-existing-coverage-valuation-date-fallback";
        if (candidate.deprecated) {
          warnings.push(createWarning(
            deprecatedWarningCode,
            "Existing coverage treatment used a deprecated existing coverage valuation date because the shared Planning As-Of Date was unavailable.",
            {
              source: candidate.source,
              replacementSource: "analysisSettings.valuationDate"
            }
          ));
        }

        return {
          valuationDate,
          valuationDateSource: candidate.source,
          valuationDateDefaulted: false,
          valuationDateWarningCode: candidate.deprecated
            ? deprecatedWarningCode
            : (warnings[0]?.code || null),
          warnings
        };
      }

      warnings.push(createWarning(
        "invalid-existing-coverage-valuation-date",
        "Existing coverage treatment ignored an invalid valuation date.",
        {
          source: candidate.source
        }
      ));
    }

    if (!isBlankValue(assumptions.lastUpdatedAt)) {
      warnings.push(createWarning(
        "ignored-existing-coverage-last-updated-at-valuation-date",
        "Existing coverage treatment ignored existingCoverageAssumptions.lastUpdatedAt because saved timestamps are not Planning As-Of Dates.",
        {
          source: "analysisSettings.existingCoverageAssumptions.lastUpdatedAt"
        }
      ));
    }

    const warningCode = warnings.some(function (warning) {
      return warning?.code === "invalid-existing-coverage-valuation-date";
    })
      ? "invalid-existing-coverage-valuation-date"
      : "missing-existing-coverage-valuation-date";
    warnings.push(createWarning(
      warningCode,
      "Existing coverage treatment has no valid Planning As-Of Date; date-sensitive pending and term guardrail treatment may not be applied.",
      {
        source: "analysisSettings.valuationDate"
      }
    ));

    return {
      valuationDate: null,
      valuationDateSource: "unavailable",
      valuationDateDefaulted: false,
      valuationDateWarningCode: warningCode,
      warnings
    };
  }

  function resolveTreatmentCoveragePolicies(input) {
    const builderInput = input && typeof input === "object" ? input : {};
    const profileRecord = isPlainObject(builderInput.profileRecord) ? builderInput.profileRecord : null;
    if (!profileRecord) {
      return {
        policies: null,
        reason: "missing-profile-record",
        sourcePath: "profileRecord.coveragePolicies"
      };
    }

    if (!Array.isArray(profileRecord.coveragePolicies)) {
      return {
        policies: null,
        reason: "missing-coverage-policies",
        sourcePath: "profileRecord.coveragePolicies"
      };
    }

    return {
      policies: profileRecord.coveragePolicies
        .filter(function (policy) {
          return policy && typeof policy === "object";
        })
        .map(function (policy) {
          return { ...policy };
        }),
      reason: "",
      sourcePath: "profileRecord.coveragePolicies"
    };
  }

  function getForwardAssetOffsetSource() {
    return ASSET_OFFSET_SOURCE_TREATED;
  }

  function resolveAssetTreatmentAssumptions(input) {
    const analysisSettings = resolveAnalysisSettings(input);

    return isPlainObject(analysisSettings.assetTreatmentAssumptions)
      ? analysisSettings.assetTreatmentAssumptions
      : {};
  }

  function normalizeAssetGrowthProjectionModeForModel(value, warnings) {
    const normalized = normalizeString(value);
    if (
      normalized === ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR
      || normalized === ASSET_GROWTH_PROJECTION_MODE_REPORTING_ONLY
      || normalized === ASSET_GROWTH_PROJECTION_MODE_PROJECTED_OFFSETS
    ) {
      return normalized;
    }

    if (normalized) {
      addWarning(
        warnings,
        "invalid-asset-growth-projection-mode",
        "Asset growth projection mode was invalid and defaulted to current-dollar only.",
        { received: normalized, defaultValue: ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR }
      );
    }

    return ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR;
  }

  function normalizeAssetGrowthProjectionYearsForModel(value, warnings) {
    const parsed = toOptionalNumber(value);
    if (parsed == null) {
      addWarning(
        warnings,
        "invalid-asset-growth-projection-years",
        "Asset growth projection years was missing or invalid and defaulted to 0.",
        { received: value, defaultValue: ASSET_GROWTH_PROJECTION_MIN_YEARS }
      );
      return ASSET_GROWTH_PROJECTION_MIN_YEARS;
    }

    const clamped = Math.min(
      ASSET_GROWTH_PROJECTION_MAX_YEARS,
      Math.max(ASSET_GROWTH_PROJECTION_MIN_YEARS, parsed)
    );
    if (clamped !== parsed) {
      addWarning(
        warnings,
        "asset-growth-projection-years-clamped",
        "Asset growth projection years was outside the supported 0-60 range and was clamped.",
        {
          received: parsed,
          min: ASSET_GROWTH_PROJECTION_MIN_YEARS,
          max: ASSET_GROWTH_PROJECTION_MAX_YEARS,
          used: clamped
        }
      );
    }

    return Number(clamped.toFixed(6));
  }

  function resolveAssetGrowthProjectionContext(assetTreatmentAssumptions) {
    const savedProjectionAssumptions = isPlainObject(assetTreatmentAssumptions?.assetGrowthProjectionAssumptions)
      ? assetTreatmentAssumptions.assetGrowthProjectionAssumptions
      : {};
    const warnings = [];
    const sourceMode = normalizeAssetGrowthProjectionModeForModel(
      savedProjectionAssumptions.mode,
      warnings
    );
    const savedProjectionYears = normalizeAssetGrowthProjectionYearsForModel(
      savedProjectionAssumptions.projectionYears,
      warnings
    );
    const context = {
      sourceMode,
      sourceModeSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode",
      consumptionStatus: ASSET_GROWTH_PROJECTION_CONSUMPTION_STATUS,
      consumedByMethods: false,
      projectionYears: ASSET_GROWTH_PROJECTION_MIN_YEARS,
      projectionYearsSource: "assetGrowthProjectionAssumptions.currentDollarOnly",
      projectionMode: ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR,
      warnings
    };

    if (sourceMode === ASSET_GROWTH_PROJECTION_MODE_REPORTING_ONLY) {
      context.projectionYears = savedProjectionYears;
      context.projectionYearsSource = "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.projectionYears";
      context.projectionMode = ASSET_GROWTH_PROJECTION_MODE_REPORTING_ONLY;
      addWarning(
        context.warnings,
        "asset-growth-projection-reporting-only",
        "Projected asset growth uses saved reporting-only projection years and is not consumed by current methods."
      );
      return context;
    }

    if (sourceMode === ASSET_GROWTH_PROJECTION_MODE_PROJECTED_OFFSETS) {
      context.projectionYearsSource = "assetGrowthProjectionAssumptions.projectedOffsets-future-inactive";
      context.projectionMode = "projectedOffsetsFutureInactive";
      addWarning(
        context.warnings,
        "asset-growth-projected-offsets-future-inactive",
        "Projected offsets mode is saved for future use only and is not consumed by current methods."
      );
      return context;
    }

    addWarning(
      context.warnings,
      "asset-growth-projection-current-dollar-only",
      "Asset growth projection mode is current-dollar only; projected asset values use a 0-year current-dollar default."
    );
    return context;
  }

  function createPreparedTreatedAssetOffsets(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const assetOffsetSource = getForwardAssetOffsetSource();
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
        {
          reason: "missing-asset-facts",
          assetOffsetSource
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
          assetCount: assetFacts.assets.length,
          assetOffsetSource
        }
      );
    }

    const effectiveAssetTreatmentAssumptions = {
      ...assetTreatmentAssumptions,
      enabled: true
    };

    const result = calculateAssetTreatment({
      assetFacts,
      assetTreatmentAssumptions: effectiveAssetTreatmentAssumptions,
      options: {
        source: "lens-model-preparation",
        consumedByMethods: true
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
        assetOffsetSource,
        savedAssumptionsEnabled: assetTreatmentAssumptions.enabled === true,
        assumptionsEnabled: true,
        consumedByMethods: true
      }
    };
  }

  function createPreparedProjectedAssetGrowth(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const analysisSettings = resolveAnalysisSettings(input);
    const assetFacts = isPlainObject(safeLensModel.assetFacts) ? safeLensModel.assetFacts : null;
    const assetTreatmentAssumptions = resolveAssetTreatmentAssumptions(input);
    const calculateAssetGrowthProjection = lensAnalysis.calculateAssetGrowthProjection;
    const projectionContext = resolveAssetGrowthProjectionContext(assetTreatmentAssumptions);
    const projectionYears = projectionContext.projectionYears;
    const projectionYearsSource = projectionContext.projectionYearsSource;
    const modelWarnings = [
      createWarning(
        "asset-growth-projection-saved-only",
        "Projected asset growth values are prepared for future reporting only and are not consumed by current methods."
      ),
      ...projectionContext.warnings
    ];
    const modelTraceFields = {
      sourceMode: projectionContext.sourceMode,
      projectionMode: projectionContext.projectionMode,
      projectionYears,
      projectionYearsSource,
      sourceModeSource: projectionContext.sourceModeSource,
      consumptionStatus: projectionContext.consumptionStatus,
      consumedByMethods: false
    };

    if (!assetFacts || !Array.isArray(assetFacts.assets)) {
      return {
        source: "asset-growth-projection-calculations",
        ...modelTraceFields,
        currentTotalAssetValue: 0,
        projectedTotalAssetValue: 0,
        totalProjectedGrowthAmount: 0,
        includedCategoryCount: 0,
        excludedCategoryCount: 0,
        reviewWarningCount: 0,
        includedCategories: [],
        excludedCategories: [],
        warnings: [
          createWarning(
            "missing-asset-facts",
            "assetFacts.assets is missing; saved-only projected asset growth values were not prepared."
          ),
          ...modelWarnings
        ],
        trace: null
      };
    }

    if (typeof calculateAssetGrowthProjection !== "function") {
      return {
        source: "asset-growth-projection-calculations",
        ...modelTraceFields,
        currentTotalAssetValue: 0,
        projectedTotalAssetValue: 0,
        totalProjectedGrowthAmount: 0,
        includedCategoryCount: 0,
        excludedCategoryCount: assetFacts.assets.length,
        reviewWarningCount: 0,
        includedCategories: [],
        excludedCategories: [],
        warnings: [
          createWarning(
            "missing-asset-growth-projection-helper",
            "calculateAssetGrowthProjection is unavailable; saved-only projected asset growth values were not prepared."
          ),
          ...modelWarnings
        ],
        trace: null
      };
    }

    const result = calculateAssetGrowthProjection({
      assetFacts,
      assetTreatmentAssumptions,
      assetTaxonomy: lensAnalysis.assetTaxonomy,
      projectionYears,
      projectionYearsSource,
      valuationDate: analysisSettings.valuationDate,
      valuationDateSource: analysisSettings.valuationDate ? "analysisSettings.valuationDate" : null
    });
    const helperWarnings = Array.isArray(result?.warnings) ? cloneSerializable(result.warnings) : [];

    return {
      source: result?.source || "asset-growth-projection-calculations",
      ...modelTraceFields,
      projectionYears: result?.projectionYears ?? projectionYears,
      projectionYearsSource: result?.projectionYearsSource || projectionYearsSource,
      currentTotalAssetValue: result?.currentTotalAssetValue ?? 0,
      projectedTotalAssetValue: result?.projectedTotalAssetValue ?? 0,
      totalProjectedGrowthAmount: result?.totalProjectedGrowthAmount ?? 0,
      includedCategoryCount: result?.includedCategoryCount ?? 0,
      excludedCategoryCount: result?.excludedCategoryCount ?? 0,
      reviewWarningCount: result?.reviewWarningCount ?? 0,
      includedCategories: Array.isArray(result?.includedCategories)
        ? cloneSerializable(result.includedCategories)
        : [],
      excludedCategories: Array.isArray(result?.excludedCategories)
        ? cloneSerializable(result.excludedCategories)
        : [],
      warnings: helperWarnings.concat(modelWarnings),
      trace: cloneSerializable({
        ...result,
        ...modelTraceFields,
        projectionYears: result?.projectionYears ?? projectionYears,
        projectionYearsSource: result?.projectionYearsSource || projectionYearsSource,
        warnings: helperWarnings.concat(modelWarnings)
      }),
      valuationDate: result?.valuationDate || null,
      valuationDateSource: result?.valuationDateSource || null
    };
  }

  function createEmptyProjectedAssetOffset(warnings, metadata) {
    const safeWarnings = Array.isArray(warnings) ? warnings : [];
    const safeMetadata = isPlainObject(metadata) ? metadata : {};
    const currentTreatedAssetOffset = toOptionalNumber(safeMetadata.currentTreatedAssetOffset) ?? 0;

    return {
      source: "projected-asset-offset-calculations",
      calculationVersion: null,
      currentTreatedAssetOffset,
      eligibleTreatedBase: 0,
      projectedTreatedValue: 0,
      projectedGrowthAdjustment: 0,
      effectiveProjectedAssetOffset: currentTreatedAssetOffset,
      projectionYears: 0,
      projectionYearsSource: "assetGrowthProjectionAssumptions.projectionYears",
      sourceMode: normalizeString(safeMetadata.sourceMode) || ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR,
      sourceModeSource: "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode",
      projectionMode: normalizeString(safeMetadata.projectionMode)
        || normalizeString(safeMetadata.sourceMode)
        || ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR,
      consumptionStatus: ASSET_GROWTH_PROJECTION_CONSUMPTION_STATUS,
      consumedByMethods: false,
      activationStatus: "future-inactive",
      includedCategoryCount: 0,
      excludedCategoryCount: 0,
      includedCategories: [],
      excludedCategories: [],
      warnings: safeWarnings,
      trace: null,
      metadata: {
        ...safeMetadata,
        source: "lens-model-preparation",
        calculationSource: "projected-asset-offset-calculations",
        savedDataShapeChanged: false,
        consumedByMethods: false,
        activationStatus: "future-inactive"
      }
    };
  }

  function createPreparedProjectedAssetOffset(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const treatedAssetOffsets = isPlainObject(safeLensModel.treatedAssetOffsets)
      ? safeLensModel.treatedAssetOffsets
      : null;
    const assetTreatmentAssumptions = resolveAssetTreatmentAssumptions(input);
    const projectionAssumptions = isPlainObject(assetTreatmentAssumptions.assetGrowthProjectionAssumptions)
      ? assetTreatmentAssumptions.assetGrowthProjectionAssumptions
      : {};
    const sourceMode = normalizeString(projectionAssumptions.mode)
      || ASSET_GROWTH_PROJECTION_MODE_CURRENT_DOLLAR;
    const projectionMode = sourceMode === ASSET_GROWTH_PROJECTION_MODE_PROJECTED_OFFSETS
      ? "projectedOffsetsFutureInactive"
      : sourceMode;
    const currentTreatedAssetOffset = toOptionalNumber(treatedAssetOffsets?.totalTreatedAssetValue) ?? 0;
    const modelWarnings = [
      createWarning(
        "projected-asset-offset-inactive-model-prep",
        "Projected asset offset is prepared as an inactive future candidate and is not consumed by current methods."
      ),
      createWarning(
        "treated-asset-offsets-remain-current-source",
        "Current methods continue to consume treatedAssetOffsets.totalTreatedAssetValue."
      )
    ];
    const calculateProjectedAssetOffset = lensAnalysis.calculateProjectedAssetOffset;

    if (!treatedAssetOffsets) {
      return createEmptyProjectedAssetOffset(
        [
          createWarning(
            "missing-treated-asset-offsets",
            "treatedAssetOffsets is missing; inactive projected asset offset candidate was not prepared."
          ),
          ...modelWarnings
        ],
        {
          reason: "missing-treated-asset-offsets",
          currentTreatedAssetOffset,
          sourceMode,
          projectionMode
        }
      );
    }

    if (typeof calculateProjectedAssetOffset !== "function") {
      return createEmptyProjectedAssetOffset(
        [
          createWarning(
            "missing-projected-asset-offset-helper",
            "calculateProjectedAssetOffset is unavailable; inactive projected asset offset candidate was not prepared."
          ),
          ...modelWarnings
        ],
        {
          reason: "missing-projected-asset-offset-helper",
          currentTreatedAssetOffset,
          sourceMode,
          projectionMode
        }
      );
    }

    const result = calculateProjectedAssetOffset({
      treatedAssetOffsets,
      assetTreatmentAssumptions,
      assetGrowthProjectionAssumptions: projectionAssumptions,
      assetTaxonomy: lensAnalysis.assetTaxonomy
    });
    const resultMetadata = isPlainObject(result?.metadata) ? result.metadata : {};
    const helperWarnings = Array.isArray(result?.warnings) ? cloneSerializable(result.warnings) : [];
    const combinedWarnings = helperWarnings.concat(modelWarnings);

    return {
      source: result?.source || "projected-asset-offset-calculations",
      calculationVersion: result?.calculationVersion ?? null,
      currentTreatedAssetOffset: result?.currentTreatedAssetOffset ?? currentTreatedAssetOffset,
      eligibleTreatedBase: result?.eligibleTreatedBase ?? 0,
      projectedTreatedValue: result?.projectedTreatedValue ?? 0,
      projectedGrowthAdjustment: result?.projectedGrowthAdjustment ?? 0,
      effectiveProjectedAssetOffset: result?.effectiveProjectedAssetOffset ?? currentTreatedAssetOffset,
      projectionYears: result?.projectionYears ?? 0,
      projectionYearsSource: result?.projectionYearsSource || "assetGrowthProjectionAssumptions.projectionYears",
      projectionYearsDefaulted: result?.projectionYearsDefaulted === true,
      projectionYearsClamped: result?.projectionYearsClamped === true,
      sourceMode: result?.sourceMode || sourceMode,
      sourceModeSource: result?.sourceModeSource
        || "assetTreatmentAssumptions.assetGrowthProjectionAssumptions.mode",
      projectionMode: result?.projectionMode || projectionMode,
      consumptionStatus: result?.consumptionStatus || ASSET_GROWTH_PROJECTION_CONSUMPTION_STATUS,
      consumedByMethods: false,
      activationStatus: result?.activationStatus || "future-inactive",
      includedCategoryCount: result?.includedCategoryCount ?? 0,
      excludedCategoryCount: result?.excludedCategoryCount ?? 0,
      includedCategories: Array.isArray(result?.includedCategories)
        ? cloneSerializable(result.includedCategories)
        : [],
      excludedCategories: Array.isArray(result?.excludedCategories)
        ? cloneSerializable(result.excludedCategories)
        : [],
      warnings: combinedWarnings,
      trace: cloneSerializable({
        ...result,
        consumedByMethods: false,
        activationStatus: result?.activationStatus || "future-inactive",
        warnings: combinedWarnings
      }),
      metadata: {
        ...resultMetadata,
        source: "lens-model-preparation",
        calculationSource: resultMetadata.source || "projected-asset-offset-calculations",
        inputBasis: resultMetadata.inputBasis || "treatedAssetOffsets",
        savedDataShapeChanged: false,
        consumedByMethods: false,
        activationStatus: result?.activationStatus || "future-inactive"
      }
    };
  }

  function createPreparedCashReserveProjection(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const analysisSettings = resolveAnalysisSettings(input);
    const assetFacts = isPlainObject(safeLensModel.assetFacts) ? safeLensModel.assetFacts : null;
    const assetTreatmentAssumptions = resolveAssetTreatmentAssumptions(input);
    const cashReserveAssumptions = isPlainObject(assetTreatmentAssumptions.cashReserveAssumptions)
      ? assetTreatmentAssumptions.cashReserveAssumptions
      : {};
    const calculateCashReserveProjection = lensAnalysis.calculateCashReserveProjection;
    const enabled = cashReserveAssumptions.enabled === true;
    const modelWarnings = [
      createWarning(
        "cash-reserve-projection-reporting-only",
        "Cash reserve projection is prepared for reporting only and is not consumed by current methods."
      ),
      createWarning(
        "cash-reserve-not-consumed-by-current-methods",
        "Cash reserve projection does not affect current DIME, Needs, or Human Life Value outputs."
      ),
      createWarning(
        "treated-asset-offsets-unchanged",
        "Current treated asset offsets remain current-dollar/current treatment based."
      )
    ];

    if (!enabled) {
      modelWarnings.push(createWarning(
        "cash-reserve-projection-disabled",
        "Cash reserve assumptions are disabled; model prep retained a reporting-only trace with no current-output impact."
      ));
    }

    if (cashReserveAssumptions.mode === CASH_RESERVE_MODE_METHOD_ACTIVE_FUTURE) {
      modelWarnings.push(createWarning(
        "method-active-future-inactive",
        "Cash reserve method-active mode is a future enum only and is not consumed by current methods."
      ));
    }

    if (typeof calculateCashReserveProjection !== "function") {
      return {
        source: "cash-reserve-calculations",
        applied: false,
        enabled,
        consumedByMethods: false,
        consumptionStatus: CASH_RESERVE_CONSUMPTION_STATUS,
        mode: normalizeString(cashReserveAssumptions.mode) || "reportingOnly",
        reserveMethod: normalizeString(cashReserveAssumptions.reserveMethod) || "monthsOfEssentialExpenses",
        reserveMonths: 0,
        fixedReserveAmount: 0,
        expenseBasis: normalizeString(cashReserveAssumptions.expenseBasis) || "essentialSupport",
        monthlyReserveBasis: 0,
        monthlyReserveBasisSourcePaths: [],
        requiredReserveAmount: 0,
        applyToAssetScope: normalizeString(cashReserveAssumptions.applyToAssetScope) || "cashAndCashEquivalents",
        excludeEmergencyFundAssets: cashReserveAssumptions.excludeEmergencyFundAssets !== false,
        includeHealthcareExpenses: cashReserveAssumptions.includeHealthcareExpenses === true,
        includeDiscretionaryExpenses: cashReserveAssumptions.includeDiscretionaryExpenses === true,
        totalCashEquivalentValue: 0,
        totalExplicitEmergencyFundValue: 0,
        totalRestrictedOrEscrowedCashValue: 0,
        totalBusinessReserveValue: 0,
        emergencyFundReservedAmount: 0,
        remainingReserveNeededAfterEmergencyFund: 0,
        cashAvailableAboveReserve: 0,
        totalReservedAmount: 0,
        totalAvailableAfterReserve: 0,
        includedAssets: [],
        excludedAssets: [],
        reviewAssets: [],
        warnings: [
          createWarning(
            "missing-cash-reserve-helper",
            "calculateCashReserveProjection is unavailable; reporting-only cash reserve projection was not prepared."
          ),
          ...modelWarnings
        ],
        valuationDate: analysisSettings.valuationDate || null,
        valuationDateSource: analysisSettings.valuationDate ? "analysisSettings.valuationDate" : null,
        trace: null
      };
    }

    const helperInput = {
      assetFacts,
      cashReserveAssumptions,
      ongoingSupport: isPlainObject(safeLensModel.ongoingSupport) ? safeLensModel.ongoingSupport : {},
      assetTaxonomy: lensAnalysis.assetTaxonomy,
      assetLibrary: lensAnalysis.assetLibrary,
      valuationDate: analysisSettings.valuationDate,
      valuationDateSource: analysisSettings.valuationDate ? "analysisSettings.valuationDate" : null
    };
    const result = calculateCashReserveProjection(helperInput);
    const helperWarnings = Array.isArray(result?.warnings) ? cloneSerializable(result.warnings) : [];
    const combinedWarnings = helperWarnings.concat(modelWarnings);

    return {
      source: result?.source || "cash-reserve-calculations",
      calculationVersion: result?.calculationVersion ?? null,
      applied: enabled && result?.applied === true,
      enabled: result?.enabled === true,
      consumedByMethods: false,
      consumptionStatus: CASH_RESERVE_CONSUMPTION_STATUS,
      mode: result?.mode || "reportingOnly",
      reserveMethod: result?.reserveMethod || "monthsOfEssentialExpenses",
      reserveMonths: result?.reserveMonths ?? 0,
      fixedReserveAmount: result?.fixedReserveAmount ?? 0,
      expenseBasis: result?.expenseBasis || "essentialSupport",
      monthlyReserveBasis: result?.monthlyReserveBasis ?? 0,
      monthlyReserveBasisSourcePaths: Array.isArray(result?.monthlyReserveBasisSourcePaths)
        ? cloneSerializable(result.monthlyReserveBasisSourcePaths)
        : [],
      requiredReserveAmount: result?.requiredReserveAmount ?? 0,
      applyToAssetScope: result?.applyToAssetScope || "cashAndCashEquivalents",
      excludeEmergencyFundAssets: result?.excludeEmergencyFundAssets !== false,
      includeHealthcareExpenses: result?.includeHealthcareExpenses === true,
      includeDiscretionaryExpenses: result?.includeDiscretionaryExpenses === true,
      totalCashEquivalentValue: result?.totalCashEquivalentValue ?? 0,
      totalExplicitEmergencyFundValue: result?.totalExplicitEmergencyFundValue ?? 0,
      totalRestrictedOrEscrowedCashValue: result?.totalRestrictedOrEscrowedCashValue ?? 0,
      totalBusinessReserveValue: result?.totalBusinessReserveValue ?? 0,
      emergencyFundReservedAmount: result?.emergencyFundReservedAmount ?? 0,
      remainingReserveNeededAfterEmergencyFund: result?.remainingReserveNeededAfterEmergencyFund ?? 0,
      cashAvailableAboveReserve: result?.cashAvailableAboveReserve ?? 0,
      totalReservedAmount: result?.totalReservedAmount ?? 0,
      totalAvailableAfterReserve: result?.totalAvailableAfterReserve ?? 0,
      includedAssets: Array.isArray(result?.includedAssets)
        ? cloneSerializable(result.includedAssets)
        : [],
      excludedAssets: Array.isArray(result?.excludedAssets)
        ? cloneSerializable(result.excludedAssets)
        : [],
      reviewAssets: Array.isArray(result?.reviewAssets)
        ? cloneSerializable(result.reviewAssets)
        : [],
      warnings: combinedWarnings,
      valuationDate: result?.valuationDate || null,
      valuationDateSource: result?.valuationDateSource || null,
      trace: cloneSerializable({
        ...result,
        applied: enabled && result?.applied === true,
        consumedByMethods: false,
        consumptionStatus: CASH_RESERVE_CONSUMPTION_STATUS,
        warnings: combinedWarnings
      })
    };
  }

  function createPreparedTreatedExistingCoverageOffset(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const existingCoverage = isPlainObject(safeLensModel.existingCoverage)
      ? safeLensModel.existingCoverage
      : {};
    const existingCoverageAssumptions = resolveExistingCoverageTreatmentAssumptions(input);
    const valuationDateResult = resolveExistingCoverageTreatmentValuationDate(
      input,
      existingCoverageAssumptions
    );
    const valuationDateWarnings = Array.isArray(valuationDateResult.warnings)
      ? valuationDateResult.warnings
      : [];
    const coveragePolicyResult = resolveTreatmentCoveragePolicies(input);
    const calculateExistingCoverageTreatment = lensAnalysis.calculateExistingCoverageTreatment;

    if (!Array.isArray(coveragePolicyResult.policies)) {
      return createEmptyTreatedExistingCoverageOffset(
        [
          ...valuationDateWarnings,
          createWarning(
            coveragePolicyResult.reason,
            "profileRecord.coveragePolicies is unavailable; treated existing coverage offset was not calculated."
          )
        ],
        {
          reason: coveragePolicyResult.reason,
          coveragePolicySourcePath: coveragePolicyResult.sourcePath,
          rawExistingCoverageTotal: existingCoverage.totalExistingCoverage ?? null,
          methodOffsetSourcePath: "existingCoverage.totalExistingCoverage",
          valuationDate: valuationDateResult.valuationDate,
          valuationDateSource: valuationDateResult.valuationDateSource,
          valuationDateDefaulted: valuationDateResult.valuationDateDefaulted === true,
          valuationDateWarningCode: valuationDateResult.valuationDateWarningCode || null
        }
      );
    }

    if (typeof calculateExistingCoverageTreatment !== "function") {
      return createEmptyTreatedExistingCoverageOffset(
        [
          ...valuationDateWarnings,
          createWarning(
            "missing-existing-coverage-treatment-helper",
            "calculateExistingCoverageTreatment is unavailable; treated existing coverage offset was not calculated."
          )
        ],
        {
          reason: "missing-existing-coverage-treatment-helper",
          coveragePolicyCount: coveragePolicyResult.policies.length,
          coveragePolicySourcePath: coveragePolicyResult.sourcePath,
          rawExistingCoverageTotal: existingCoverage.totalExistingCoverage ?? null,
          methodOffsetSourcePath: "existingCoverage.totalExistingCoverage",
          valuationDate: valuationDateResult.valuationDate,
          valuationDateSource: valuationDateResult.valuationDateSource,
          valuationDateDefaulted: valuationDateResult.valuationDateDefaulted === true,
          valuationDateWarningCode: valuationDateResult.valuationDateWarningCode || null
        }
      );
    }

    const result = calculateExistingCoverageTreatment({
      coveragePolicies: coveragePolicyResult.policies,
      existingCoverageAssumptions,
      options: {
        valuationDate: valuationDateResult.valuationDate,
        source: "lens-model-preparation",
        consumedByMethods: true
      }
    });
    const policies = Array.isArray(result?.policies) ? result.policies : [];
    const resultMetadata = isPlainObject(result?.metadata) ? result.metadata : {};
    const includedPolicyCount = policies.filter(function (policy) {
      return policy?.included === true;
    }).length;

    return {
      policies,
      totalRawCoverage: result?.totalRawCoverage ?? null,
      totalIncludedRawCoverage: result?.totalIncludedRawCoverage ?? null,
      totalTreatedCoverageOffset: result?.totalTreatedCoverageOffset ?? null,
      excludedCoverageValue: result?.excludedCoverageValue ?? null,
      policyCount: policies.length,
      includedPolicyCount,
      excludedPolicyCount: policies.length - includedPolicyCount,
      totalsByTreatmentKind: isPlainObject(result?.totalsByTreatmentKind)
        ? result.totalsByTreatmentKind
        : {},
      warnings: [
        ...valuationDateWarnings,
        ...(Array.isArray(result?.warnings) ? result.warnings : [])
      ],
      trace: Array.isArray(result?.trace) ? result.trace : [],
      metadata: {
        ...resultMetadata,
        source: "lens-model-preparation",
        calculationSource: resultMetadata.calculationSource || "existing-coverage-treatment-calculations",
        coveragePolicySourcePath: coveragePolicyResult.sourcePath,
        rawExistingCoverageTotal: existingCoverage.totalExistingCoverage ?? null,
        methodOffsetSourcePath: TREATED_EXISTING_COVERAGE_OFFSET_SOURCE_PATH,
        valuationDate: valuationDateResult.valuationDate,
        valuationDateSource: valuationDateResult.valuationDateSource,
        valuationDateDefaulted: valuationDateResult.valuationDateDefaulted === true,
        valuationDateWarningCode: valuationDateResult.valuationDateWarningCode || null,
        consumedByMethods: true
      }
    };
  }

  function resolveDebtTreatmentAssumptions(input) {
    const analysisSettings = resolveAnalysisSettings(input);

    return isPlainObject(analysisSettings.debtTreatmentAssumptions)
      ? analysisSettings.debtTreatmentAssumptions
      : {};
  }

  function createPreparedTreatedDebtPayoff(lensModel, input) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const debtFacts = isPlainObject(safeLensModel.debtFacts) ? safeLensModel.debtFacts : null;
    const debtPayoff = isPlainObject(safeLensModel.debtPayoff) ? safeLensModel.debtPayoff : {};
    const debtTreatmentAssumptions = resolveDebtTreatmentAssumptions(input);
    const calculateDebtTreatment = lensAnalysis.calculateDebtTreatment;

    if (typeof calculateDebtTreatment !== "function") {
      return createEmptyTreatedDebtPayoff(
        [
          createWarning(
            "missing-debt-treatment-helper",
            "calculateDebtTreatment is unavailable; treated debt payoff values were not prepared."
          )
        ],
        {
          reason: "missing-debt-treatment-helper",
          debtFactCount: Array.isArray(debtFacts?.debts) ? debtFacts.debts.length : null,
          rawDebtPayoffTotal: debtPayoff.totalDebtPayoffNeed ?? null
        }
      );
    }

    const result = calculateDebtTreatment({
      debtFacts,
      debtPayoff,
      debtTreatmentAssumptions,
      mortgageSupportFacts: createMortgageSupportFacts(safeLensModel),
      options: {
        source: "lens-model-preparation",
        consumedByMethods: false
      }
    });
    const resultMetadata = isPlainObject(result?.metadata) ? result.metadata : {};
    const methodConsumptionMetadata = createDebtTreatmentMethodConsumptionMetadata({
      preparedDimeNonMortgageDebtAmount: result?.dime?.nonMortgageDebtAmount,
      preparedDimeMortgageAmount: result?.dime?.mortgageAmount,
      preparedNeedsDebtPayoffAmount: result?.needs?.debtPayoffAmount
    });
    const methodTreatmentApplied = methodConsumptionMetadata.consumedByMethods === true;
    const assumptionsTreatmentApplied = result?.treatmentApplied === true;

    return {
      rawEquivalentDefault: result?.rawEquivalentDefault === true,
      treatmentApplied: methodTreatmentApplied || assumptionsTreatmentApplied,
      source: result?.source || null,
      fallbackSource: result?.fallbackSource || null,
      dime: isPlainObject(result?.dime) ? cloneSerializable(result.dime) : {
        nonMortgageDebtAmount: null,
        mortgageAmount: null,
        totalDebtAndMortgageAmount: null
      },
      needs: isPlainObject(result?.needs) ? cloneSerializable(result.needs) : {
        debtPayoffAmount: null,
        mortgagePayoffAmount: null,
        nonMortgageDebtAmount: null
      },
      rawTotals: isPlainObject(result?.rawTotals) ? cloneSerializable(result.rawTotals) : {
        totalDebtBalance: null,
        mortgageBalance: null,
        nonMortgageDebtBalance: null,
        excludedDebtAmount: null,
        deferredDebtAmount: null
      },
      excludedDebtAmount: result?.excludedDebtAmount ?? null,
      deferredDebtAmount: result?.deferredDebtAmount ?? null,
      debts: Array.isArray(result?.debts) ? cloneSerializable(result.debts) : [],
      warnings: Array.isArray(result?.warnings) ? cloneSerializable(result.warnings) : [],
      trace: isPlainObject(result?.trace) ? cloneSerializable(result.trace) : {},
      metadata: {
        ...resultMetadata,
        preparationSource: "lens-model-preparation",
        calculationSource: resultMetadata.source || "debt-treatment-calculations",
        assumptionsSource: resultMetadata.assumptionsSource || null,
        rawEquivalentDefault: result?.rawEquivalentDefault === true,
        treatmentApplied: methodTreatmentApplied || assumptionsTreatmentApplied,
        methodTreatmentApplied,
        assumptionsTreatmentApplied,
        ...methodConsumptionMetadata,
        source: result?.source || resultMetadata.source || null,
        fallbackSource: result?.fallbackSource || null,
        warnings: Array.isArray(result?.warnings) ? cloneSerializable(result.warnings) : []
      }
    };
  }

  function attachSurvivorIncomeDerivationMetadata(lensModel, sourceResult) {
    const safeLensModel = isPlainObject(lensModel) ? lensModel : {};
    const blockSourceObjects = isPlainObject(sourceResult?.blockSourceObjects)
      ? sourceResult.blockSourceObjects
      : {};
    const survivorSource = isPlainObject(blockSourceObjects["survivor-scenario"])
      ? blockSourceObjects["survivor-scenario"]
      : {};
    const derivation = isPlainObject(survivorSource.survivorIncomeDerivation)
      ? survivorSource.survivorIncomeDerivation
      : null;

    if (!derivation) {
      return safeLensModel;
    }

    safeLensModel.survivorScenario = {
      ...(isPlainObject(safeLensModel.survivorScenario) ? safeLensModel.survivorScenario : {}),
      survivorIncomeDerivation: cloneSerializable(derivation)
    };
    return safeLensModel;
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
        lensModel = attachProfileFacts(lensModel, builderInput.profileRecord);
        lensModel = attachEducationCurrentDependentDetails(lensModel, builderInput.profileRecord);
        lensModel = attachSurvivorIncomeDerivationMetadata(lensModel, sourceResult);
        lensModel.treatedAssetOffsets = createPreparedTreatedAssetOffsets(lensModel, builderInput);
        lensModel.projectedAssetGrowth = createPreparedProjectedAssetGrowth(lensModel, builderInput);
        lensModel.projectedAssetOffset = createPreparedProjectedAssetOffset(lensModel, builderInput);
        lensModel.cashReserveProjection = createPreparedCashReserveProjection(lensModel, builderInput);
        lensModel.treatedExistingCoverageOffset = createPreparedTreatedExistingCoverageOffset(lensModel, builderInput);
        lensModel.treatedDebtPayoff = createPreparedTreatedDebtPayoff(lensModel, builderInput);
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
