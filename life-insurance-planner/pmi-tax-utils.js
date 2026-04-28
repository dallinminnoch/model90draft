(function attachLensPmiTaxUtils(global) {
  function clonePayrollRows(defaultRows) {
    return defaultRows.map((row) => ({
      ...row,
      thresholds: row && row.thresholds ? { ...row.thresholds } : undefined
    }));
  }

  function cloneSimpleConfig(defaultConfig) {
    return Object.fromEntries(
      Object.entries(defaultConfig).map(([key, value]) => [key, String(value || "").trim()])
    );
  }

  function readStoredStandardDeductionConfig(storageKey, defaultConfig) {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!stored || typeof stored !== "object") {
        return cloneSimpleConfig(defaultConfig);
      }

      const nextConfig = cloneSimpleConfig(defaultConfig);
      Object.keys(nextConfig).forEach((key) => {
        const storedValue = String(stored[key] || "").trim();
        if (storedValue) {
          nextConfig[key] = storedValue;
        }
      });
      return nextConfig;
    } catch (_error) {
      return cloneSimpleConfig(defaultConfig);
    }
  }

  function getStandardDeductionSplit(options) {
    const {
      filingStatus,
      deductionAmount,
      primaryIncome,
      spouseIncome
    } = options;

    const amount = Math.max(0, Number(deductionAmount) || 0);
    if (!amount) {
      return { primary: 0, spouse: 0 };
    }

    if (filingStatus === "Married Filing Separately") {
      return { primary: amount, spouse: amount };
    }

    if (filingStatus === "Married Filing Jointly") {
      const combinedIncome = Math.max(0, Number(primaryIncome) || 0) + Math.max(0, Number(spouseIncome) || 0);
      if (!combinedIncome) {
        return { primary: amount, spouse: 0 };
      }

      return {
        primary: amount * ((Number(primaryIncome) || 0) / combinedIncome),
        spouse: amount * ((Number(spouseIncome) || 0) / combinedIncome)
      };
    }

    return { primary: amount, spouse: 0 };
  }

  function readStoredPayrollConfig(options) {
    const {
      storageKey,
      defaultRows,
      isAdditionalMedicareTaxName,
      getDefaultAdditionalMedicareThresholds
    } = options;

    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!Array.isArray(stored) || !stored.length) {
        return clonePayrollRows(defaultRows);
      }

      return stored.map((row) => ({
        name: String(row?.name || "").trim(),
        rate: String(row?.rate || "").trim(),
        wageBase: String(row?.wageBase || "").trim(),
        thresholds: isAdditionalMedicareTaxName(row?.name)
          ? {
              ...getDefaultAdditionalMedicareThresholds(),
              ...(row?.thresholds && typeof row.thresholds === "object" ? row.thresholds : {})
            }
          : undefined
      }));
    } catch (_error) {
      return clonePayrollRows(defaultRows);
    }
  }

  function getSelectedBracketRate(field, parsePercentLikeNumber) {
    if (!field || field instanceof RadioNodeList) {
      return 0;
    }
    return parsePercentLikeNumber(field.value);
  }

  function getAdditionalMedicareThreshold(options) {
    const {
      filingStatus,
      payrollRows,
      parseCurrencyLikeNumber,
      getDefaultAdditionalMedicareThresholds
    } = options;

    const row = payrollRows.find((item) => String(item?.name || "").trim().toLowerCase() === "additional medicare") || null;
    const thresholds = row?.thresholds && typeof row.thresholds === "object"
      ? { ...getDefaultAdditionalMedicareThresholds(), ...row.thresholds }
      : getDefaultAdditionalMedicareThresholds();

    return parseCurrencyLikeNumber(thresholds[String(filingStatus || "").trim()] || thresholds.Single);
  }

  function allocateCombinedTax(totalTax, primaryIncome, spouseIncome) {
    const combinedIncome = primaryIncome + spouseIncome;
    if (!combinedIncome) {
      return { primary: 0, spouse: 0 };
    }

    return {
      primary: totalTax * (primaryIncome / combinedIncome),
      spouse: totalTax * (spouseIncome / combinedIncome)
    };
  }

  function getBracketTaxAmounts(options) {
    const {
      filingStatus,
      primaryTaxableIncome,
      spouseTaxableIncome,
      primaryRate,
      spouseRate
    } = options;

    if (filingStatus === "Married Filing Jointly") {
      const combinedTaxableIncome = primaryTaxableIncome + spouseTaxableIncome;
      const combinedTax = combinedTaxableIncome * primaryRate;
      return allocateCombinedTax(combinedTax, primaryTaxableIncome, spouseTaxableIncome);
    }

    return {
      primary: primaryTaxableIncome * primaryRate,
      spouse: filingStatus === "Married Filing Separately" ? spouseTaxableIncome * spouseRate : 0
    };
  }

  function getProgressiveTaxAmount(taxableIncome, bracketRows, parseCurrencyLikeNumber, parsePercentLikeNumber) {
    const income = Math.max(0, Number(taxableIncome) || 0);
    if (!income || !Array.isArray(bracketRows) || !bracketRows.length) {
      return 0;
    }

    const normalizedRows = bracketRows
      .map((row) => ({
        minIncome: Math.max(0, parseCurrencyLikeNumber(row?.minIncome)),
        maxIncome: String(row?.maxIncome || "").trim()
          ? Math.max(0, parseCurrencyLikeNumber(row?.maxIncome))
          : Number.POSITIVE_INFINITY,
        rate: Math.max(0, parsePercentLikeNumber(row?.rate))
      }))
      .sort((left, right) => left.minIncome - right.minIncome);

    return normalizedRows.reduce((total, row) => {
      if (income <= row.minIncome) {
        return total;
      }

      const taxableSlice = Math.max(0, Math.min(income, row.maxIncome) - row.minIncome);
      if (!taxableSlice) {
        return total;
      }

      return total + (taxableSlice * row.rate);
    }, 0);
  }

  function getProgressiveBracketTaxAmounts(options) {
    const {
      filingStatus,
      primaryTaxableIncome,
      spouseTaxableIncome,
      primaryBracketRows,
      spouseBracketRows,
      parseCurrencyLikeNumber,
      parsePercentLikeNumber
    } = options;

    if (filingStatus === "Married Filing Jointly") {
      const combinedTaxableIncome = primaryTaxableIncome + spouseTaxableIncome;
      const combinedTax = getProgressiveTaxAmount(
        combinedTaxableIncome,
        primaryBracketRows,
        parseCurrencyLikeNumber,
        parsePercentLikeNumber
      );
      return allocateCombinedTax(combinedTax, primaryTaxableIncome, spouseTaxableIncome);
    }

    return {
      primary: getProgressiveTaxAmount(
        primaryTaxableIncome,
        primaryBracketRows,
        parseCurrencyLikeNumber,
        parsePercentLikeNumber
      ),
      spouse: filingStatus === "Married Filing Separately"
        ? getProgressiveTaxAmount(
            spouseTaxableIncome,
            spouseBracketRows,
            parseCurrencyLikeNumber,
            parsePercentLikeNumber
          )
        : 0
    };
  }

  function getPayrollTaxAmounts(options) {
    const {
      filingStatus,
      primaryEarnedIncome,
      spouseEarnedIncome,
      primaryTaxableIncome,
      spouseTaxableIncome,
      payrollRows,
      parseCurrencyLikeNumber,
      parsePercentLikeNumber,
      getDefaultAdditionalMedicareThresholds
    } = options;
    const primaryIncome = Math.max(0, Number(primaryEarnedIncome ?? primaryTaxableIncome) || 0);
    const spouseIncome = Math.max(0, Number(spouseEarnedIncome ?? spouseTaxableIncome) || 0);

    const findRow = (name) => payrollRows.find((row) => String(row?.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()) || null;
    const socialSecurityRow = findRow("Social Security");
    const medicareRow = findRow("Medicare");
    const additionalMedicareRow = findRow("Additional Medicare");
    const socialSecurityRate = parsePercentLikeNumber(socialSecurityRow?.rate);
    const medicareRate = parsePercentLikeNumber(medicareRow?.rate);
    const additionalMedicareRate = parsePercentLikeNumber(additionalMedicareRow?.rate);
    const socialSecurityWageBase = parseCurrencyLikeNumber(socialSecurityRow?.wageBase) || Number.POSITIVE_INFINITY;
    const additionalMedicareThreshold = getAdditionalMedicareThreshold({
      filingStatus,
      payrollRows,
      parseCurrencyLikeNumber,
      getDefaultAdditionalMedicareThresholds
    });

    const primarySocialSecurityTax = Math.min(primaryIncome, socialSecurityWageBase) * socialSecurityRate;
    const spouseSocialSecurityTax = Math.min(spouseIncome, socialSecurityWageBase) * socialSecurityRate;
    const primaryMedicareTax = primaryIncome * medicareRate;
    const spouseMedicareTax = spouseIncome * medicareRate;

    let primaryAdditionalMedicareTax = 0;
    let spouseAdditionalMedicareTax = 0;

    if (filingStatus === "Married Filing Jointly") {
      const combinedIncome = primaryIncome + spouseIncome;
      const combinedAdditionalMedicareBase = Math.max(0, combinedIncome - additionalMedicareThreshold);
      if (combinedIncome > 0 && combinedAdditionalMedicareBase > 0) {
        primaryAdditionalMedicareTax =
          combinedAdditionalMedicareBase * additionalMedicareRate * (primaryIncome / combinedIncome);
        spouseAdditionalMedicareTax =
          combinedAdditionalMedicareBase * additionalMedicareRate * (spouseIncome / combinedIncome);
      }
    } else if (filingStatus === "Married Filing Separately") {
      primaryAdditionalMedicareTax = Math.max(0, primaryIncome - additionalMedicareThreshold) * additionalMedicareRate;
      spouseAdditionalMedicareTax = Math.max(0, spouseIncome - additionalMedicareThreshold) * additionalMedicareRate;
    } else {
      primaryAdditionalMedicareTax = Math.max(0, primaryIncome - additionalMedicareThreshold) * additionalMedicareRate;
      spouseAdditionalMedicareTax = spouseIncome > 0
        ? Math.max(0, spouseIncome - getAdditionalMedicareThreshold({
            filingStatus: "Single",
            payrollRows,
            parseCurrencyLikeNumber,
            getDefaultAdditionalMedicareThresholds
          })) * additionalMedicareRate
        : 0;
    }

    return {
      primary: primarySocialSecurityTax + primaryMedicareTax + primaryAdditionalMedicareTax,
      spouse: spouseSocialSecurityTax + spouseMedicareTax + spouseAdditionalMedicareTax
    };
  }

  function getNetIncome(grossIncome, federalTax, stateTax, payrollTax) {
    return Math.max(0, grossIncome - federalTax - stateTax - payrollTax);
  }

  global.LensPmiTaxUtils = {
    clonePayrollRows,
    cloneSimpleConfig,
    readStoredPayrollConfig,
    readStoredStandardDeductionConfig,
    getSelectedBracketRate,
    getAdditionalMedicareThreshold,
    getStandardDeductionSplit,
    getBracketTaxAmounts,
    getProgressiveTaxAmount,
    getProgressiveBracketTaxAmounts,
    getPayrollTaxAmounts,
    getNetIncome
  };
})(window);
