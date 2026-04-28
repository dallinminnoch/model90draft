(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis housing support calculation helpers.
  // Purpose: keep active PMI pages and saved-data Lens model building aligned
  // on neutral housing-support block inputs without reading DOM or storage.
  // Non-goals: no persistence, no recommendation math, no coverage-gap math,
  // and no transition-needs suggestion ownership.

  const DEFAULT_HOUSING_MAINTENANCE_ROWS = Object.freeze([
    Object.freeze({ label: "Under 1,500 sq ft", minSqFt: "0", maxSqFt: "1499", age0To10: "120", age11To25: "180", age26To40: "260", age41Plus: "360" }),
    Object.freeze({ label: "1,500-2,499 sq ft", minSqFt: "1500", maxSqFt: "2499", age0To10: "165", age11To25: "235", age26To40: "325", age41Plus: "430" }),
    Object.freeze({ label: "2,500-3,499 sq ft", minSqFt: "2500", maxSqFt: "3499", age0To10: "215", age11To25: "295", age26To40: "395", age41Plus: "520" }),
    Object.freeze({ label: "3,500+ sq ft", minSqFt: "3500", maxSqFt: "", age0To10: "285", age11To25: "375", age26To40: "490", age41Plus: "635" })
  ]);

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

  function normalizeCalculatedDisplayValue(value) {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function normalizeMaintenanceConfigRow(row) {
    if (!row || typeof row !== "object") {
      return null;
    }

    return {
      label: normalizeString(row.label),
      minSqFt: normalizeString(row.minSqFt).replace(/[^0-9]/g, ""),
      maxSqFt: normalizeString(row.maxSqFt).replace(/[^0-9]/g, ""),
      age0To10: normalizeString(row.age0To10).replace(/[^0-9.]/g, ""),
      age11To25: normalizeString(row.age11To25).replace(/[^0-9.]/g, ""),
      age26To40: normalizeString(row.age26To40).replace(/[^0-9.]/g, ""),
      age41Plus: normalizeString(row.age41Plus).replace(/[^0-9.]/g, "")
    };
  }

  function normalizeMaintenanceRows(rows) {
    const sourceRows = Array.isArray(rows) && rows.length
      ? rows
      : DEFAULT_HOUSING_MAINTENANCE_ROWS;
    const normalizedRows = sourceRows.map(normalizeMaintenanceConfigRow).filter(Boolean);

    return normalizedRows.length
      ? normalizedRows
      : DEFAULT_HOUSING_MAINTENANCE_ROWS.map(function (row) {
          return normalizeMaintenanceConfigRow(row);
        }).filter(Boolean);
  }

  function getMaintenanceAgeBand(ageYears) {
    if (ageYears <= 10) {
      return "age0To10";
    }
    if (ageYears <= 25) {
      return "age11To25";
    }
    if (ageYears <= 40) {
      return "age26To40";
    }
    return "age41Plus";
  }

  function parseHomeAgeYears(value) {
    const rawValue = normalizeString(value);
    if (!rawValue) {
      return 0;
    }

    return Math.max(0, Math.round(parseCurrencyLikeNumber(rawValue)));
  }

  function getHousingStatusContext(sourceData) {
    const rawHousingStatus = normalizeString(sourceData && sourceData.housingStatus);

    return {
      rawHousingStatus: rawHousingStatus || null,
      hasSelectedHousingStatus: Boolean(rawHousingStatus),
      isHomeownerWithMortgage: rawHousingStatus === "Homeowner",
      isOwner: rawHousingStatus === "Homeowner" || rawHousingStatus === "Owns Free and Clear",
      isRenter: rawHousingStatus === "Renter"
    };
  }

  function calculateMortgageRemainingTermMonths(sourceData) {
    const years = Math.max(0, Math.round(parseCurrencyLikeNumber(sourceData?.mortgageTermRemainingYears)));
    const months = Math.min(11, Math.max(0, Math.round(parseCurrencyLikeNumber(sourceData?.mortgageTermRemainingMonths))));

    if (!years && !months) {
      return null;
    }

    return (years * 12) + months;
  }

  function calculateMortgagePaymentOnlyAmount(sourceData, housingStatusContext) {
    if (!housingStatusContext.isHomeownerWithMortgage) {
      return null;
    }

    const principal = parseCurrencyLikeNumber(sourceData?.mortgageBalance);
    const totalMonths = calculateMortgageRemainingTermMonths(sourceData);
    const annualRate = parseCurrencyLikeNumber(sourceData?.mortgageInterestRate);

    if (!principal || !totalMonths) {
      return null;
    }

    if (!annualRate) {
      return principal / totalMonths;
    }

    const monthlyRate = annualRate / 1200;
    if (!monthlyRate) {
      return principal / totalMonths;
    }

    return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -totalMonths)));
  }

  function calculateMaintenanceRecommendationAmount(sourceData, options, housingStatusContext) {
    if (!housingStatusContext.isOwner) {
      return null;
    }

    const squareFootageLabel = normalizeString(sourceData?.homeSquareFootage);
    if (!squareFootageLabel) {
      return null;
    }

    const homeAgeYears = parseHomeAgeYears(sourceData?.homeAgeYears);
    const matchingRow = normalizeMaintenanceRows(options?.maintenanceRows).find(function (row) {
      return normalizeString(row?.label) === squareFootageLabel;
    });

    if (!matchingRow) {
      return null;
    }

    return parseCurrencyLikeNumber(matchingRow[getMaintenanceAgeBand(homeAgeYears)]);
  }

  function calculateAssociatedMonthlyCostsAmount(sourceData, housingStatusContext, monthlyMaintenanceAndRepairs) {
    if (!housingStatusContext.hasSelectedHousingStatus) {
      return null;
    }

    const monthlyUtilities = parseCurrencyLikeNumber(sourceData?.utilitiesCost);
    const monthlyHousingInsurance = parseCurrencyLikeNumber(sourceData?.housingInsuranceCost);

    if (housingStatusContext.isRenter) {
      const monthlyRent = parseCurrencyLikeNumber(sourceData?.monthlyHousingCost);
      const monthlyOtherRenterHousingCosts = parseCurrencyLikeNumber(sourceData?.otherMonthlyRenterHousingCosts);
      const renterAssociatedTotal = monthlyRent + monthlyUtilities + monthlyHousingInsurance + monthlyOtherRenterHousingCosts;
      return renterAssociatedTotal > 0 ? renterAssociatedTotal : null;
    }

    const monthlyHoaCost = parseCurrencyLikeNumber(sourceData?.monthlyHoaCost);
    const monthlyPropertyTax = parseCurrencyLikeNumber(sourceData?.propertyTax);
    const maintenanceValue = parseCurrencyLikeNumber(monthlyMaintenanceAndRepairs);
    const homeownerAssociatedTotal = monthlyUtilities + monthlyPropertyTax + monthlyHousingInsurance + maintenanceValue + monthlyHoaCost;

    return homeownerAssociatedTotal > 0 ? homeownerAssociatedTotal : null;
  }

  function getFinalCalculatedFieldValue(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const manualOverride = normalizedOptions.manualOverride === true;
    const manualValue = toOptionalNumber(normalizedOptions.manualValue);

    return manualOverride
      ? manualValue
      : normalizeCalculatedDisplayValue(normalizedOptions.calculatedValue);
  }

  function calculateMonthlyHousingSupportCost(monthlyMortgagePayment, associatedMonthlyCosts) {
    const totalBurden = parseCurrencyLikeNumber(monthlyMortgagePayment) + parseCurrencyLikeNumber(associatedMonthlyCosts);
    return totalBurden > 0 ? totalBurden : null;
  }

  function calculateHousingSupportInputs(sourceData, options) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const warnings = [];
    const housingStatusContext = getHousingStatusContext(data);
    const mortgagePaymentManualOverride = housingStatusContext.isHomeownerWithMortgage
      && isTrue(data.monthlyMortgagePaymentOnlyManualOverride);
    const maintenanceManualOverride = housingStatusContext.isOwner
      && isTrue(data.monthlyMaintenanceRecommendationManualOverride);
    const associatedCostsManualOverride = housingStatusContext.isHomeownerWithMortgage
      && isTrue(data.associatedMonthlyCostsManualOverride);
    const monthlySupportManualOverride = housingStatusContext.hasSelectedHousingStatus
      && isTrue(data.calculatedMonthlyMortgagePaymentManualOverride);

    const calculatedMortgagePaymentOnly = normalizeCalculatedDisplayValue(
      calculateMortgagePaymentOnlyAmount(data, housingStatusContext)
    );
    const calculatedMaintenanceRecommendation = normalizeCalculatedDisplayValue(
      calculateMaintenanceRecommendationAmount(data, normalizedOptions, housingStatusContext)
    );
    const monthlyMortgagePaymentOnly = getFinalCalculatedFieldValue({
      calculatedValue: calculatedMortgagePaymentOnly,
      manualOverride: mortgagePaymentManualOverride,
      manualValue: data.monthlyMortgagePaymentOnly
    });
    const monthlyMaintenanceRecommendation = getFinalCalculatedFieldValue({
      calculatedValue: calculatedMaintenanceRecommendation,
      manualOverride: maintenanceManualOverride,
      manualValue: data.monthlyMaintenanceRecommendation
    });
    const calculatedAssociatedMonthlyCosts = normalizeCalculatedDisplayValue(
      calculateAssociatedMonthlyCostsAmount(data, housingStatusContext, monthlyMaintenanceRecommendation)
    );
    const associatedMonthlyCosts = getFinalCalculatedFieldValue({
      calculatedValue: calculatedAssociatedMonthlyCosts,
      manualOverride: associatedCostsManualOverride,
      manualValue: data.associatedMonthlyCosts
    });
    const calculatedMonthlyHousingSupportCost = normalizeCalculatedDisplayValue(
      calculateMonthlyHousingSupportCost(monthlyMortgagePaymentOnly, associatedMonthlyCosts)
    );
    const calculatedMonthlyMortgagePayment = getFinalCalculatedFieldValue({
      calculatedValue: calculatedMonthlyHousingSupportCost,
      manualOverride: monthlySupportManualOverride,
      manualValue: data.calculatedMonthlyMortgagePayment
    });

    const values = {
      housingStatus: housingStatusContext.rawHousingStatus,
      monthlyMortgagePayment: monthlyMortgagePaymentOnly,
      mortgageRemainingTermMonths: housingStatusContext.isHomeownerWithMortgage
        ? calculateMortgageRemainingTermMonths(data)
        : null,
      mortgageInterestRatePercent: housingStatusContext.isHomeownerWithMortgage
        ? toOptionalNumber(data.mortgageInterestRate)
        : null,
      monthlyRentOrHousingPayment: housingStatusContext.isRenter
        ? toOptionalNumber(data.monthlyHousingCost)
        : null,
      monthlyOtherRenterHousingCost: housingStatusContext.isRenter
        ? toOptionalNumber(data.otherMonthlyRenterHousingCosts)
        : null,
      monthlyUtilities: housingStatusContext.hasSelectedHousingStatus
        ? toOptionalNumber(data.utilitiesCost)
        : null,
      monthlyHousingInsurance: housingStatusContext.hasSelectedHousingStatus
        ? toOptionalNumber(data.housingInsuranceCost)
        : null,
      monthlyPropertyTax: housingStatusContext.isOwner
        ? toOptionalNumber(data.propertyTax)
        : null,
      monthlyHoaCost: housingStatusContext.isOwner
        ? toOptionalNumber(data.monthlyHoaCost)
        : null,
      monthlyMaintenanceAndRepairs: monthlyMaintenanceRecommendation,
      monthlyAssociatedHousingCosts: associatedMonthlyCosts,
      monthlyHousingSupportCost: calculatedMonthlyMortgagePayment,
      annualHousingSupportCost: calculatedMonthlyMortgagePayment == null
        ? null
        : calculatedMonthlyMortgagePayment * 12,
      calculatedMortgagePaymentOnly,
      calculatedMaintenanceRecommendation,
      calculatedAssociatedMonthlyCosts,
      calculatedMonthlyHousingSupportCost,
      calculatedMonthlyMortgagePayment,
      monthlyMortgagePaymentOnly,
      monthlyMaintenanceRecommendation,
      associatedMonthlyCosts
    };

    const blockSourceData = {
      housingStatus: data.housingStatus,
      mortgageBalance: data.mortgageBalance,
      monthlyMortgagePaymentOnly: values.monthlyMortgagePaymentOnly,
      monthlyMortgagePaymentOnlyManualOverride: mortgagePaymentManualOverride,
      mortgageTermRemainingYears: data.mortgageTermRemainingYears,
      mortgageTermRemainingMonths: data.mortgageTermRemainingMonths,
      mortgageInterestRate: data.mortgageInterestRate,
      monthlyHousingCost: data.monthlyHousingCost,
      otherMonthlyRenterHousingCosts: data.otherMonthlyRenterHousingCosts,
      utilitiesCost: data.utilitiesCost,
      housingInsuranceCost: data.housingInsuranceCost,
      propertyTax: data.propertyTax,
      monthlyHoaCost: data.monthlyHoaCost,
      monthlyMaintenanceRecommendation: values.monthlyMaintenanceRecommendation,
      monthlyMaintenanceRecommendationManualOverride: maintenanceManualOverride,
      associatedMonthlyCosts: values.associatedMonthlyCosts,
      associatedMonthlyCostsManualOverride: associatedCostsManualOverride,
      calculatedMonthlyMortgagePayment: values.calculatedMonthlyMortgagePayment,
      calculatedMonthlyMortgagePaymentManualOverride: monthlySupportManualOverride
    };

    return {
      values,
      blockSourceData,
      warnings
    };
  }

  lensAnalysis.housingSupportCalculations = {
    DEFAULT_HOUSING_MAINTENANCE_ROWS,
    calculateHousingSupportInputs
  };
})(window);
