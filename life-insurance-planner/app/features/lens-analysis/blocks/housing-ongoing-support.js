(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: housing-ongoing-support Lens block module.
  // Purpose: define the current housing-support block contract, source fields,
  // and pure builder for neutral current housing facts.
  // Non-goals: no DOM reads, no persistence, no future housing-need formulas,
  // no mortgage payoff strategy, and no recommendation logic.

  const HOUSING_ONGOING_SUPPORT_BLOCK_ID = "housing-ongoing-support";
  const HOUSING_ONGOING_SUPPORT_BLOCK_TYPE = "housing.ongoing-support.current-pmi";
  const HOUSING_ONGOING_SUPPORT_BLOCK_VERSION = 1;

  const HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS = Object.freeze({
    housingStatus: "housingStatus",
    mortgageBalance: "mortgageBalance",
    monthlyMortgagePayment: "monthlyMortgagePaymentOnly",
    monthlyMortgagePaymentManualOverride: "monthlyMortgagePaymentOnlyManualOverride",
    mortgageTermRemainingYears: "mortgageTermRemainingYears",
    mortgageTermRemainingMonths: "mortgageTermRemainingMonths",
    mortgageInterestRatePercent: "mortgageInterestRate",
    monthlyRentOrHousingPayment: "monthlyHousingCost",
    monthlyOtherRenterHousingCost: "otherMonthlyRenterHousingCosts",
    monthlyUtilities: "utilitiesCost",
    monthlyHousingInsurance: "housingInsuranceCost",
    monthlyPropertyTax: "propertyTax",
    monthlyHoaCost: "monthlyHoaCost",
    monthlyMaintenanceAndRepairs: "monthlyMaintenanceRecommendation",
    monthlyMaintenanceAndRepairsManualOverride: "monthlyMaintenanceRecommendationManualOverride",
    monthlyAssociatedHousingCosts: "associatedMonthlyCosts",
    monthlyAssociatedHousingCostsManualOverride: "associatedMonthlyCostsManualOverride",
    monthlyHousingSupportCost: "calculatedMonthlyMortgagePayment",
    monthlyHousingSupportCostManualOverride: "calculatedMonthlyMortgagePaymentManualOverride"
  });

  const HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: HOUSING_ONGOING_SUPPORT_BLOCK_ID,
    blockType: HOUSING_ONGOING_SUPPORT_BLOCK_TYPE,
    blockVersion: HOUSING_ONGOING_SUPPORT_BLOCK_VERSION,
    outputs: {
      housingStatus: {
        type: "string|null",
        canonicalDestination: null,
        meaning: "Current housing-status context captured on the Housing Costs card."
      },
      mortgageBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.mortgageBalance",
        meaning: "Current mortgage balance carried as housing context while debt payoff continues to own the canonical balance bucket."
      },
      monthlyMortgagePayment: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyMortgagePayment",
        meaning: "Current monthly mortgage payment excluding property tax and housing insurance."
      },
      mortgageRemainingTermMonths: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.mortgageRemainingTermMonths",
        meaning: "Current mortgage timing fact in months, preserved for future timeline analysis."
      },
      mortgageInterestRatePercent: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.mortgageInterestRatePercent",
        meaning: "Current mortgage interest rate percent for context only, not a trigger for analysis here."
      },
      monthlyRentOrHousingPayment: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyRentOrHousingPayment",
        meaning: "Current monthly rent or equivalent renter housing payment."
      },
      monthlyOtherRenterHousingCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyOtherRenterHousingCost",
        meaning: "Renter-only recurring monthly housing support component for costs not already included in rent, utilities, or renter/housing insurance."
      },
      monthlyUtilities: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyUtilities",
        meaning: "Current monthly utilities cost."
      },
      monthlyHousingInsurance: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyHousingInsurance",
        meaning: "Current monthly housing-insurance cost, including renter insurance when captured there."
      },
      monthlyPropertyTax: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyPropertyTax",
        meaning: "Current monthly property-tax cost."
      },
      monthlyHoaCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyHoaCost",
        meaning: "Current monthly HOA cost."
      },
      monthlyMaintenanceAndRepairs: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyMaintenanceAndRepairs",
        meaning: "Current monthly maintenance and repairs cost from the card-level recommendation or manual override."
      },
      monthlyAssociatedHousingCosts: {
        type: "number|null",
        canonicalDestination: null,
        meaning: "Current grouped associated monthly housing costs from the Housing Costs card. UI subtotal and runtime/debug helper only; not a canonical analysis input."
      },
      monthlyHousingSupportCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.monthlyHousingSupportCost",
        meaning: "Current housing support cost before any future payoff or timeline adjustments."
      },
      annualHousingSupportCost: {
        type: "number|null",
        canonicalDestination: "ongoingSupport.annualHousingSupportCost",
        meaning: "Current annualized housing support cost derived from the current monthly housing support cost."
      },
      // TEMP DEBUG/AUDIT ONLY.
      // This does not drive recommendations, normalization, or analysis.
      recomputedMonthlyHousingSupportCost: {
        type: "number|null",
        canonicalDestination: null,
        meaning: "Debug-only recomputation of the current monthly housing support cost from the most granular current monthly facts."
      },
      housingSupportCostVariance: {
        type: "number|null",
        canonicalDestination: null,
        meaning: "Debug-only variance between the authoritative card total and the independently recomputed housing support cost."
      },
      housingSupportCostMatches: {
        type: "boolean|null",
        canonicalDestination: null,
        meaning: "Debug-only match flag for the authoritative card total versus the independently recomputed housing support cost."
      }
    }
  });

  function getHousingStatusContext(sourceData) {
    const rawHousingStatus = String(
      sourceData && sourceData[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.housingStatus] || ""
    ).trim();

    if (rawHousingStatus === "Homeowner") {
      return {
        rawHousingStatus: rawHousingStatus,
        hasSelectedHousingStatus: true,
        isHomeownerWithMortgage: true,
        isOwner: true,
        isRenter: false,
        hasMortgage: true
      };
    }

    if (rawHousingStatus === "Owns Free and Clear") {
      return {
        rawHousingStatus: rawHousingStatus,
        hasSelectedHousingStatus: true,
        isHomeownerWithMortgage: false,
        isOwner: true,
        isRenter: false,
        hasMortgage: false
      };
    }

    if (rawHousingStatus === "Renter") {
      return {
        rawHousingStatus: rawHousingStatus,
        hasSelectedHousingStatus: true,
        isHomeownerWithMortgage: false,
        isOwner: false,
        isRenter: true,
        hasMortgage: false
      };
    }

    return {
      rawHousingStatus: null,
      hasSelectedHousingStatus: false,
      isHomeownerWithMortgage: false,
      isOwner: false,
      isRenter: false,
      hasMortgage: false
    };
  }

  function toOptionalWholeNumber(value) {
    const numericValue = lensAnalysis.toOptionalNumber(value);
    return numericValue == null ? null : Math.max(0, Math.round(numericValue));
  }

  function createMortgageRemainingTermMonths(yearsValue, monthsValue) {
    const years = toOptionalWholeNumber(yearsValue);
    const months = toOptionalWholeNumber(monthsValue);

    if (years == null && months == null) {
      return null;
    }

    return (years == null ? 0 : years * 12) + (months == null ? 0 : months);
  }

  function createAnnualHousingSupportCost(monthlyHousingSupportCost) {
    return monthlyHousingSupportCost == null ? null : monthlyHousingSupportCost * 12;
  }

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

  // TEMP DEBUG/AUDIT ONLY.
  // This recomputation exists only to detect drift between the current Housing
  // Costs card total and the most granular monthly facts we currently surface.
  // It does not override the authoritative card total, normalization, or any
  // future recommendation logic.
  // The grouped associated-costs value is only used as a fallback when those
  // finer-grained facts are absent, so the audit does not guarantee double
  // counting against today's card semantics.
  function createRecomputedMonthlyHousingSupportCost(outputs, housingStatusContext) {
    if (!outputs || typeof outputs !== "object" || !housingStatusContext || housingStatusContext.hasSelectedHousingStatus !== true) {
      return null;
    }

    if (housingStatusContext.isHomeownerWithMortgage) {
      const homeownerWithMortgageTotal = sumOptionalValues([
        outputs.monthlyMortgagePayment,
        outputs.monthlyPropertyTax,
        outputs.monthlyHousingInsurance,
        outputs.monthlyHoaCost,
        outputs.monthlyUtilities,
        outputs.monthlyMaintenanceAndRepairs
      ]);

      return homeownerWithMortgageTotal == null
        ? outputs.monthlyAssociatedHousingCosts
        : homeownerWithMortgageTotal;
    }

    if (housingStatusContext.isOwner) {
      const ownerWithoutMortgageTotal = sumOptionalValues([
        outputs.monthlyPropertyTax,
        outputs.monthlyHousingInsurance,
        outputs.monthlyHoaCost,
        outputs.monthlyUtilities,
        outputs.monthlyMaintenanceAndRepairs
      ]);

      return ownerWithoutMortgageTotal == null
        ? outputs.monthlyAssociatedHousingCosts
        : ownerWithoutMortgageTotal;
    }

    if (housingStatusContext.isRenter) {
      const renterTotal = sumOptionalValues([
        outputs.monthlyRentOrHousingPayment,
        outputs.monthlyUtilities,
        outputs.monthlyHousingInsurance,
        outputs.monthlyOtherRenterHousingCost
      ]);

      return renterTotal == null
        ? outputs.monthlyAssociatedHousingCosts
        : renterTotal;
    }

    return null;
  }

  function createHousingSupportCostVariance(authoritativeMonthlyHousingSupportCost, recomputedMonthlyHousingSupportCost) {
    if (authoritativeMonthlyHousingSupportCost == null || recomputedMonthlyHousingSupportCost == null) {
      return null;
    }

    return authoritativeMonthlyHousingSupportCost - recomputedMonthlyHousingSupportCost;
  }

  function createHousingSupportCostMatches(authoritativeMonthlyHousingSupportCost, recomputedMonthlyHousingSupportCost) {
    if (authoritativeMonthlyHousingSupportCost == null && recomputedMonthlyHousingSupportCost == null) {
      return true;
    }

    if (authoritativeMonthlyHousingSupportCost == null || recomputedMonthlyHousingSupportCost == null) {
      return null;
    }

    return Math.abs(authoritativeMonthlyHousingSupportCost - recomputedMonthlyHousingSupportCost) <= 0.01;
  }

  function createApplicableReportedMetadata(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const createOutputMetadata = lensAnalysis.createOutputMetadata;

    if (normalizedOptions.applicable !== true) {
      return createOutputMetadata({
        sourceType: "not_applicable",
        confidence: "not_applicable",
        rawField: normalizedOptions.rawField,
        canonicalDestination: normalizedOptions.canonicalDestination
      });
    }

    if (normalizedOptions.outputValue == null) {
      return createOutputMetadata({
        sourceType: "missing",
        confidence: "unknown",
        rawField: normalizedOptions.rawField,
        canonicalDestination: normalizedOptions.canonicalDestination
      });
    }

    return createOutputMetadata({
      sourceType: "user-input",
      confidence: "reported",
      rawField: normalizedOptions.rawField,
      canonicalDestination: normalizedOptions.canonicalDestination
    });
  }

  function createApplicableCalculatedMetadata(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const createOutputMetadata = lensAnalysis.createOutputMetadata;

    if (normalizedOptions.applicable !== true) {
      return createOutputMetadata({
        sourceType: "not_applicable",
        confidence: "not_applicable",
        rawField: normalizedOptions.rawField,
        canonicalDestination: normalizedOptions.canonicalDestination
      });
    }

    if (normalizedOptions.outputValue == null) {
      return createOutputMetadata({
        sourceType: "missing",
        confidence: "unknown",
        rawField: normalizedOptions.rawField,
        canonicalDestination: normalizedOptions.canonicalDestination
      });
    }

    return createOutputMetadata({
      sourceType: normalizedOptions.manualOverride === true ? "manual_override" : "calculated",
      confidence: normalizedOptions.manualOverride === true
        ? "user_edited"
        : (normalizedOptions.calculatedConfidence || "calculated_from_reported_inputs"),
      rawField: normalizedOptions.rawField,
      canonicalDestination: normalizedOptions.canonicalDestination
    });
  }

  function createHousingOngoingSupportBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createOutputMetadata = lensAnalysis.createOutputMetadata;
    const housingStatusContext = getHousingStatusContext(data);

    const monthlyPropertyTax = housingStatusContext.isOwner
      ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyPropertyTax])
      : null;
    const monthlyHousingSupportCost = housingStatusContext.hasSelectedHousingStatus
      ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingSupportCost])
      : null;

    const outputs = {
      housingStatus: housingStatusContext.rawHousingStatus,
      mortgageBalance: housingStatusContext.isHomeownerWithMortgage
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageBalance])
        : null,
      monthlyMortgagePayment: housingStatusContext.isHomeownerWithMortgage
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMortgagePayment])
        : null,
      mortgageRemainingTermMonths: housingStatusContext.isHomeownerWithMortgage
        ? createMortgageRemainingTermMonths(
            data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageTermRemainingYears],
            data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageTermRemainingMonths]
          )
        : null,
      mortgageInterestRatePercent: housingStatusContext.isHomeownerWithMortgage
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageInterestRatePercent])
        : null,
      monthlyRentOrHousingPayment: housingStatusContext.isRenter
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyRentOrHousingPayment])
        : null,
      monthlyOtherRenterHousingCost: housingStatusContext.isRenter
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherRenterHousingCost])
        : null,
      monthlyUtilities: housingStatusContext.hasSelectedHousingStatus
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyUtilities])
        : null,
      monthlyHousingInsurance: housingStatusContext.hasSelectedHousingStatus
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingInsurance])
        : null,
      monthlyPropertyTax: monthlyPropertyTax,
      monthlyHoaCost: housingStatusContext.isOwner
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHoaCost])
        : null,
      monthlyMaintenanceAndRepairs: housingStatusContext.isOwner
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMaintenanceAndRepairs])
        : null,
      monthlyAssociatedHousingCosts: housingStatusContext.hasSelectedHousingStatus
        ? toOptionalNumber(data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyAssociatedHousingCosts])
        : null,
      monthlyHousingSupportCost: monthlyHousingSupportCost,
      annualHousingSupportCost: createAnnualHousingSupportCost(monthlyHousingSupportCost)
    };
    const recomputedMonthlyHousingSupportCost = createRecomputedMonthlyHousingSupportCost(outputs, housingStatusContext);
    outputs.recomputedMonthlyHousingSupportCost = recomputedMonthlyHousingSupportCost;
    outputs.housingSupportCostVariance = createHousingSupportCostVariance(
      outputs.monthlyHousingSupportCost,
      recomputedMonthlyHousingSupportCost
    );
    outputs.housingSupportCostMatches = createHousingSupportCostMatches(
      outputs.monthlyHousingSupportCost,
      recomputedMonthlyHousingSupportCost
    );

    return createBlockOutput({
      blockId: HOUSING_ONGOING_SUPPORT_BLOCK_ID,
      blockType: HOUSING_ONGOING_SUPPORT_BLOCK_TYPE,
      blockVersion: HOUSING_ONGOING_SUPPORT_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        housingStatus: createOutputMetadata({
          sourceType: outputs.housingStatus == null ? "missing" : "user-input",
          confidence: outputs.housingStatus == null ? "unknown" : "reported",
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.housingStatus,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.housingStatus.canonicalDestination
        }),
        mortgageBalance: createApplicableReportedMetadata({
          applicable: housingStatusContext.isHomeownerWithMortgage,
          outputValue: outputs.mortgageBalance,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageBalance,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.mortgageBalance.canonicalDestination
        }),
        monthlyMortgagePayment: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.isHomeownerWithMortgage,
          outputValue: outputs.monthlyMortgagePayment,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMortgagePayment,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyMortgagePayment.canonicalDestination,
          manualOverride: data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMortgagePaymentManualOverride] === true
        }),
        mortgageRemainingTermMonths: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.isHomeownerWithMortgage,
          outputValue: outputs.mortgageRemainingTermMonths,
          rawField: [
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageTermRemainingYears,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageTermRemainingMonths
          ].join("+"),
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.mortgageRemainingTermMonths.canonicalDestination
        }),
        mortgageInterestRatePercent: createApplicableReportedMetadata({
          applicable: housingStatusContext.isHomeownerWithMortgage,
          outputValue: outputs.mortgageInterestRatePercent,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.mortgageInterestRatePercent,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.mortgageInterestRatePercent.canonicalDestination
        }),
        monthlyRentOrHousingPayment: createApplicableReportedMetadata({
          applicable: housingStatusContext.isRenter,
          outputValue: outputs.monthlyRentOrHousingPayment,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyRentOrHousingPayment,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyRentOrHousingPayment.canonicalDestination
        }),
        monthlyOtherRenterHousingCost: createApplicableReportedMetadata({
          applicable: housingStatusContext.isRenter,
          outputValue: outputs.monthlyOtherRenterHousingCost,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherRenterHousingCost,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyOtherRenterHousingCost.canonicalDestination
        }),
        monthlyUtilities: createApplicableReportedMetadata({
          applicable: housingStatusContext.hasSelectedHousingStatus,
          outputValue: outputs.monthlyUtilities,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyUtilities,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyUtilities.canonicalDestination
        }),
        monthlyHousingInsurance: createApplicableReportedMetadata({
          applicable: housingStatusContext.hasSelectedHousingStatus,
          outputValue: outputs.monthlyHousingInsurance,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingInsurance,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyHousingInsurance.canonicalDestination
        }),
        monthlyPropertyTax: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.isOwner,
          outputValue: outputs.monthlyPropertyTax,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyPropertyTax,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyPropertyTax.canonicalDestination
        }),
        monthlyHoaCost: createApplicableReportedMetadata({
          applicable: housingStatusContext.isOwner,
          outputValue: outputs.monthlyHoaCost,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHoaCost,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyHoaCost.canonicalDestination
        }),
        monthlyMaintenanceAndRepairs: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.isOwner,
          outputValue: outputs.monthlyMaintenanceAndRepairs,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMaintenanceAndRepairs,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyMaintenanceAndRepairs.canonicalDestination,
          manualOverride: data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMaintenanceAndRepairsManualOverride] === true
        }),
        monthlyAssociatedHousingCosts: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.hasSelectedHousingStatus,
          outputValue: outputs.monthlyAssociatedHousingCosts,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyAssociatedHousingCosts,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyAssociatedHousingCosts.canonicalDestination,
          manualOverride: data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyAssociatedHousingCostsManualOverride] === true
        }),
        monthlyHousingSupportCost: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.hasSelectedHousingStatus,
          outputValue: outputs.monthlyHousingSupportCost,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingSupportCost,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.monthlyHousingSupportCost.canonicalDestination,
          manualOverride: data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingSupportCostManualOverride] === true
        }),
        annualHousingSupportCost: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.hasSelectedHousingStatus,
          outputValue: outputs.annualHousingSupportCost,
          rawField: HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingSupportCost,
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.annualHousingSupportCost.canonicalDestination,
          calculatedConfidence: data[HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingSupportCostManualOverride] === true
            ? "calculated_from_manual_and_reported_inputs"
            : "calculated_from_reported_inputs"
        }),
        recomputedMonthlyHousingSupportCost: createApplicableCalculatedMetadata({
          applicable: housingStatusContext.hasSelectedHousingStatus,
          outputValue: outputs.recomputedMonthlyHousingSupportCost,
          rawField: [
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMortgagePayment,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyPropertyTax,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingInsurance,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHoaCost,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyUtilities,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyMaintenanceAndRepairs,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyAssociatedHousingCosts,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyRentOrHousingPayment,
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyOtherRenterHousingCost
          ].join("+"),
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.recomputedMonthlyHousingSupportCost.canonicalDestination
        }),
        housingSupportCostVariance: createOutputMetadata({
          sourceType: outputs.housingSupportCostVariance == null ? "missing" : "calculated",
          confidence: outputs.housingSupportCostVariance == null ? "unknown" : "debug_audit_only",
          rawField: "monthlyHousingSupportCost-recomputedMonthlyHousingSupportCost",
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.housingSupportCostVariance.canonicalDestination
        }),
        housingSupportCostMatches: createOutputMetadata({
          sourceType: outputs.housingSupportCostMatches == null ? "missing" : "calculated",
          confidence: outputs.housingSupportCostMatches == null ? "unknown" : "debug_audit_only",
          rawField: [
            HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS.monthlyHousingSupportCost,
            "recomputedMonthlyHousingSupportCost"
          ].join("~"),
          canonicalDestination: HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.housingSupportCostMatches.canonicalDestination
        })
      }
    });
  }

  lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_ID = HOUSING_ONGOING_SUPPORT_BLOCK_ID;
  lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_TYPE = HOUSING_ONGOING_SUPPORT_BLOCK_TYPE;
  lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_VERSION = HOUSING_ONGOING_SUPPORT_BLOCK_VERSION;
  lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS = HOUSING_ONGOING_SUPPORT_BLOCK_SOURCE_FIELDS;
  lensAnalysis.HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT = HOUSING_ONGOING_SUPPORT_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createHousingOngoingSupportBlockOutput = createHousingOngoingSupportBlockOutput;
})();
