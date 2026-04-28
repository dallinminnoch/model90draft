(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: non-housing-ongoing-support Lens block module.
  // Purpose: define the non-housing ongoing-support block contract, source
  // fields, and pure builder for neutral current non-housing support facts.
  // Non-goals: no DOM reads, no persistence, no scenario logic, and no
  // recommendation logic.

  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID = "non-housing-ongoing-support";
  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_TYPE = "non-housing.ongoing-support.current-pmi";
  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_VERSION = 1;

  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS = Object.freeze({
    monthlyOtherInsuranceCost: "insuranceCost",
    monthlyHealthcareOutOfPocketCost: "healthcareOutOfPocketCost",
    monthlyFoodCost: "foodCost",
    monthlyTransportationCost: "transportationCost",
    monthlyChildcareAndDependentCareCost: "childcareDependentCareCost",
    monthlyPhoneAndInternetCost: "phoneInternetCost",
    monthlyHouseholdSuppliesCost: "householdSuppliesCost",
    monthlyOtherHouseholdExpenses: "otherHouseholdExpenses",
    monthlyTravelAndDiscretionaryCost: "travelDiscretionaryCost",
    monthlySubscriptionsCost: "subscriptionsCost"
  });

  const NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID,
    blockType: NON_HOUSING_ONGOING_SUPPORT_BLOCK_TYPE,
    blockVersion: NON_HOUSING_ONGOING_SUPPORT_BLOCK_VERSION,
    outputs: {
      monthlyOtherInsuranceCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyOtherInsuranceCost",
        meaning: "Current monthly non-housing insurance cost."
      },
      monthlyHealthcareOutOfPocketCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyHealthcareOutOfPocketCost",
        meaning: "Current monthly out-of-pocket healthcare cost."
      },
      monthlyFoodCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyFoodCost",
        meaning: "Current monthly food and grocery cost."
      },
      monthlyTransportationCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyTransportationCost",
        meaning: "Current monthly transportation cost."
      },
      monthlyChildcareAndDependentCareCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyChildcareAndDependentCareCost",
        meaning: "Current monthly childcare and dependent-care cost."
      },
      monthlyPhoneAndInternetCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyPhoneAndInternetCost",
        meaning: "Current monthly phone and internet cost."
      },
      monthlyHouseholdSuppliesCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyHouseholdSuppliesCost",
        meaning: "Current monthly household essentials and supplies cost."
      },
      monthlyOtherHouseholdExpenses: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyOtherHouseholdExpenses",
        meaning: "Current monthly other household expenses likely to continue."
      },
      monthlyNonHousingEssentialSupportCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyNonHousingEssentialSupportCost",
        meaning: "Current baseline non-housing survivor-support cost, excluding discretionary personal spending by default."
      },
      annualNonHousingEssentialSupportCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.annualNonHousingEssentialSupportCost",
        meaning: "Current annualized baseline non-housing survivor-support cost."
      },
      monthlyTravelAndDiscretionaryCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyTravelAndDiscretionaryCost",
        meaning: "Current monthly entertainment and travel spending stored separately as discretionary context."
      },
      monthlySubscriptionsCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlySubscriptionsCost",
        meaning: "Current monthly recurring personal spending stored separately as discretionary context."
      },
      monthlyDiscretionaryPersonalSpending: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyDiscretionaryPersonalSpending",
        meaning: "Current monthly discretionary personal spending stored separately from baseline survivor support."
      },
      annualDiscretionaryPersonalSpending: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.annualDiscretionaryPersonalSpending",
        meaning: "Current annualized discretionary personal spending stored separately from baseline survivor support."
      }
    }
  });

  function sumOptionalValues(values) {
    const safeValues = Array.isArray(values) ? values : [];
    let hasValue = false;
    let total = 0;

    safeValues.forEach(function (value) {
      if (value == null) {
        return;
      }

      hasValue = true;
      total += value;
    });

    return hasValue ? total : null;
  }

  function annualizeMonthlyValue(monthlyValue) {
    return monthlyValue == null ? null : monthlyValue * 12;
  }

  function createNonHousingOngoingSupportBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createReportedNumericOutputMetadata = lensAnalysis.createReportedNumericOutputMetadata;
    const createCalculatedNumericOutputMetadata = lensAnalysis.createCalculatedNumericOutputMetadata;

    const outputs = {
      monthlyOtherInsuranceCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherInsuranceCost]),
      monthlyHealthcareOutOfPocketCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHealthcareOutOfPocketCost]),
      monthlyFoodCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyFoodCost]),
      monthlyTransportationCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyTransportationCost]),
      monthlyChildcareAndDependentCareCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyChildcareAndDependentCareCost]),
      monthlyPhoneAndInternetCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyPhoneAndInternetCost]),
      monthlyHouseholdSuppliesCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHouseholdSuppliesCost]),
      monthlyOtherHouseholdExpenses: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherHouseholdExpenses]),
      monthlyTravelAndDiscretionaryCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyTravelAndDiscretionaryCost]),
      monthlySubscriptionsCost: toOptionalNumber(data[NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlySubscriptionsCost]),
      monthlyNonHousingEssentialSupportCost: null,
      annualNonHousingEssentialSupportCost: null,
      monthlyDiscretionaryPersonalSpending: null,
      annualDiscretionaryPersonalSpending: null
    };

    outputs.monthlyNonHousingEssentialSupportCost = sumOptionalValues([
      outputs.monthlyOtherInsuranceCost,
      outputs.monthlyHealthcareOutOfPocketCost,
      outputs.monthlyFoodCost,
      outputs.monthlyTransportationCost,
      outputs.monthlyChildcareAndDependentCareCost,
      outputs.monthlyPhoneAndInternetCost,
      outputs.monthlyHouseholdSuppliesCost,
      outputs.monthlyOtherHouseholdExpenses
    ]);
    outputs.annualNonHousingEssentialSupportCost = annualizeMonthlyValue(outputs.monthlyNonHousingEssentialSupportCost);
    outputs.monthlyDiscretionaryPersonalSpending = sumOptionalValues([
      outputs.monthlyTravelAndDiscretionaryCost,
      outputs.monthlySubscriptionsCost
    ]);
    outputs.annualDiscretionaryPersonalSpending = annualizeMonthlyValue(outputs.monthlyDiscretionaryPersonalSpending);

    return createBlockOutput({
      blockId: NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID,
      blockType: NON_HOUSING_ONGOING_SUPPORT_BLOCK_TYPE,
      blockVersion: NON_HOUSING_ONGOING_SUPPORT_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        monthlyOtherInsuranceCost: createReportedNumericOutputMetadata(
          outputs.monthlyOtherInsuranceCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherInsuranceCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyOtherInsuranceCost.canonicalDestination
        ),
        monthlyHealthcareOutOfPocketCost: createReportedNumericOutputMetadata(
          outputs.monthlyHealthcareOutOfPocketCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHealthcareOutOfPocketCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyHealthcareOutOfPocketCost.canonicalDestination
        ),
        monthlyFoodCost: createReportedNumericOutputMetadata(
          outputs.monthlyFoodCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyFoodCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyFoodCost.canonicalDestination
        ),
        monthlyTransportationCost: createReportedNumericOutputMetadata(
          outputs.monthlyTransportationCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyTransportationCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyTransportationCost.canonicalDestination
        ),
        monthlyChildcareAndDependentCareCost: createReportedNumericOutputMetadata(
          outputs.monthlyChildcareAndDependentCareCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyChildcareAndDependentCareCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyChildcareAndDependentCareCost.canonicalDestination
        ),
        monthlyPhoneAndInternetCost: createReportedNumericOutputMetadata(
          outputs.monthlyPhoneAndInternetCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyPhoneAndInternetCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyPhoneAndInternetCost.canonicalDestination
        ),
        monthlyHouseholdSuppliesCost: createReportedNumericOutputMetadata(
          outputs.monthlyHouseholdSuppliesCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHouseholdSuppliesCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyHouseholdSuppliesCost.canonicalDestination
        ),
        monthlyOtherHouseholdExpenses: createReportedNumericOutputMetadata(
          outputs.monthlyOtherHouseholdExpenses,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherHouseholdExpenses,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyOtherHouseholdExpenses.canonicalDestination
        ),
        monthlyNonHousingEssentialSupportCost: createCalculatedNumericOutputMetadata(
          outputs.monthlyNonHousingEssentialSupportCost,
          [
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherInsuranceCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHealthcareOutOfPocketCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyFoodCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyTransportationCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyChildcareAndDependentCareCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyPhoneAndInternetCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHouseholdSuppliesCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherHouseholdExpenses
          ].join("+"),
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyNonHousingEssentialSupportCost.canonicalDestination
        ),
        annualNonHousingEssentialSupportCost: createCalculatedNumericOutputMetadata(
          outputs.annualNonHousingEssentialSupportCost,
          "monthlyNonHousingEssentialSupportCost",
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.annualNonHousingEssentialSupportCost.canonicalDestination
        ),
        monthlyTravelAndDiscretionaryCost: createReportedNumericOutputMetadata(
          outputs.monthlyTravelAndDiscretionaryCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyTravelAndDiscretionaryCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyTravelAndDiscretionaryCost.canonicalDestination
        ),
        monthlySubscriptionsCost: createReportedNumericOutputMetadata(
          outputs.monthlySubscriptionsCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlySubscriptionsCost,
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlySubscriptionsCost.canonicalDestination
        ),
        monthlyDiscretionaryPersonalSpending: createCalculatedNumericOutputMetadata(
          outputs.monthlyDiscretionaryPersonalSpending,
          [
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyTravelAndDiscretionaryCost,
            NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlySubscriptionsCost
          ].join("+"),
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyDiscretionaryPersonalSpending.canonicalDestination
        ),
        annualDiscretionaryPersonalSpending: createCalculatedNumericOutputMetadata(
          outputs.annualDiscretionaryPersonalSpending,
          "monthlyDiscretionaryPersonalSpending",
          NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.annualDiscretionaryPersonalSpending.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID = NON_HOUSING_ONGOING_SUPPORT_BLOCK_ID;
  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_TYPE = NON_HOUSING_ONGOING_SUPPORT_BLOCK_TYPE;
  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_VERSION = NON_HOUSING_ONGOING_SUPPORT_BLOCK_VERSION;
  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS = NON_HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS;
  lensAnalysis.NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT = NON_HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createNonHousingOngoingSupportBlockOutput = createNonHousingOngoingSupportBlockOutput;
})();
