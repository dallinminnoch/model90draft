(function (global) {
  const LensApp = global.LensApp || (global.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: Lens income/tax calculation helper.
  // Purpose: provide a reusable, DOM-free income/tax path for saved-data Lens
  // builds. Tax formulas stay in LensPmiTaxUtils; this module supplies the
  // shared PMI tax context/config orchestration.
  // Non-goals: no DOM reads, no storage writes, no recommendation logic, no
  // DIME/Needs/HLV formulas, and no gross-income fallback.

  const TAX_STORAGE_KEYS = Object.freeze({
    federalTaxBrackets: "lensFederalTaxBrackets",
    standardDeductions: "lensStandardDeductions",
    stateTaxBrackets: "lensStateIncomeTaxBrackets",
    payrollTaxConfig: "lensPayrollTaxConfig"
  });

  const DEFAULT_FEDERAL_ROWS_BY_STATUS = Object.freeze({
    "Single": Object.freeze([
      Object.freeze({ rate: "10%", minIncome: "0", maxIncome: "12400" }),
      Object.freeze({ rate: "12%", minIncome: "12401", maxIncome: "50400" }),
      Object.freeze({ rate: "22%", minIncome: "50401", maxIncome: "105700" }),
      Object.freeze({ rate: "24%", minIncome: "105701", maxIncome: "201775" }),
      Object.freeze({ rate: "32%", minIncome: "201776", maxIncome: "256225" }),
      Object.freeze({ rate: "35%", minIncome: "256226", maxIncome: "640600" }),
      Object.freeze({ rate: "37%", minIncome: "640601", maxIncome: "" })
    ]),
    "Married Filing Jointly": Object.freeze([
      Object.freeze({ rate: "10%", minIncome: "0", maxIncome: "24800" }),
      Object.freeze({ rate: "12%", minIncome: "24801", maxIncome: "100800" }),
      Object.freeze({ rate: "22%", minIncome: "100801", maxIncome: "211400" }),
      Object.freeze({ rate: "24%", minIncome: "211401", maxIncome: "403550" }),
      Object.freeze({ rate: "32%", minIncome: "403551", maxIncome: "512450" }),
      Object.freeze({ rate: "35%", minIncome: "512451", maxIncome: "768700" }),
      Object.freeze({ rate: "37%", minIncome: "768701", maxIncome: "" })
    ]),
    "Married Filing Separately": Object.freeze([
      Object.freeze({ rate: "10%", minIncome: "0", maxIncome: "12400" }),
      Object.freeze({ rate: "12%", minIncome: "12401", maxIncome: "50400" }),
      Object.freeze({ rate: "22%", minIncome: "50401", maxIncome: "105700" }),
      Object.freeze({ rate: "24%", minIncome: "105701", maxIncome: "201775" }),
      Object.freeze({ rate: "32%", minIncome: "201776", maxIncome: "256225" }),
      Object.freeze({ rate: "35%", minIncome: "256226", maxIncome: "384350" }),
      Object.freeze({ rate: "37%", minIncome: "384351", maxIncome: "" })
    ]),
    "Head of Household": Object.freeze([
      Object.freeze({ rate: "10%", minIncome: "0", maxIncome: "17700" }),
      Object.freeze({ rate: "12%", minIncome: "17701", maxIncome: "67500" }),
      Object.freeze({ rate: "22%", minIncome: "67501", maxIncome: "105700" }),
      Object.freeze({ rate: "24%", minIncome: "105701", maxIncome: "201750" }),
      Object.freeze({ rate: "32%", minIncome: "201751", maxIncome: "256200" }),
      Object.freeze({ rate: "35%", minIncome: "256201", maxIncome: "640600" }),
      Object.freeze({ rate: "37%", minIncome: "640601", maxIncome: "" })
    ]),
    "Qualifying Surviving Spouse": Object.freeze([
      Object.freeze({ rate: "10%", minIncome: "0", maxIncome: "24800" }),
      Object.freeze({ rate: "12%", minIncome: "24801", maxIncome: "100800" }),
      Object.freeze({ rate: "22%", minIncome: "100801", maxIncome: "211400" }),
      Object.freeze({ rate: "24%", minIncome: "211401", maxIncome: "403550" }),
      Object.freeze({ rate: "32%", minIncome: "403551", maxIncome: "512450" }),
      Object.freeze({ rate: "35%", minIncome: "512451", maxIncome: "768700" }),
      Object.freeze({ rate: "37%", minIncome: "768701", maxIncome: "" })
    ])
  });

  const LEGACY_SINGLE_FEDERAL_ROWS = Object.freeze([
    Object.freeze({ rate: "10%", minIncome: "0", maxIncome: "11600" }),
    Object.freeze({ rate: "12%", minIncome: "11601", maxIncome: "47150" }),
    Object.freeze({ rate: "22%", minIncome: "47151", maxIncome: "100525" }),
    Object.freeze({ rate: "24%", minIncome: "100526", maxIncome: "191950" }),
    Object.freeze({ rate: "32%", minIncome: "191951", maxIncome: "243725" }),
    Object.freeze({ rate: "35%", minIncome: "243726", maxIncome: "609350" }),
    Object.freeze({ rate: "37%", minIncome: "609351", maxIncome: "" })
  ]);

  const DEFAULT_STANDARD_DEDUCTIONS = Object.freeze({
    "Single": "16100",
    "Married Filing Jointly": "32200",
    "Married Filing Separately": "16100",
    "Head of Household": "24150",
    "Qualifying Surviving Spouse": "32200"
  });

  const DEFAULT_STATE_TAX_ROWS = Object.freeze([
    Object.freeze({ rate: "5%", minIncome: "0", maxIncome: "50000" }),
    Object.freeze({ rate: "6.5%", minIncome: "50001", maxIncome: "100000" }),
    Object.freeze({ rate: "8%", minIncome: "100001", maxIncome: "" })
  ]);

  const NO_INCOME_TAX_STATES = Object.freeze(["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"]);

  const DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS = Object.freeze({
    "Single": "200000",
    "Married Filing Jointly": "250000",
    "Married Filing Separately": "125000",
    "Head of Household": "200000",
    "Qualifying Surviving Spouse": "250000"
  });

  const DEFAULT_PAYROLL_ROWS = Object.freeze([
    Object.freeze({ name: "Social Security", rate: "6.2%", wageBase: "176100" }),
    Object.freeze({ name: "Medicare", rate: "1.45%", wageBase: "" }),
    Object.freeze({
      name: "Additional Medicare",
      rate: "0.9%",
      wageBase: "",
      thresholds: DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS
    })
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

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

  function parseCurrencyLikeNumber(value) {
    const optionalValue = toOptionalNumber(value);
    return optionalValue == null ? 0 : optionalValue;
  }

  function parsePercentLikeNumber(value) {
    return parseCurrencyLikeNumber(value) / 100;
  }

  function cloneRow(row) {
    return {
      ...row,
      ...(row?.thresholds && typeof row.thresholds === "object" ? { thresholds: { ...row.thresholds } } : {})
    };
  }

  function cloneRows(rows) {
    return Array.isArray(rows) ? rows.map(cloneRow) : [];
  }

  function cloneRowsByStatus(rowsByStatus) {
    return Object.keys(rowsByStatus || {}).reduce(function (result, status) {
      result[status] = cloneRows(rowsByStatus[status]);
      return result;
    }, {});
  }

  function cloneSimpleConfig(config) {
    return Object.keys(config || {}).reduce(function (result, key) {
      result[key] = normalizeString(config[key]);
      return result;
    }, {});
  }

  function getFirstPresent(source, fieldNames) {
    const safeSource = isPlainObject(source) ? source : {};
    const names = Array.isArray(fieldNames) ? fieldNames : [];

    for (let index = 0; index < names.length; index += 1) {
      const fieldName = names[index];
      if (Object.prototype.hasOwnProperty.call(safeSource, fieldName) && !isBlankValue(safeSource[fieldName])) {
        return safeSource[fieldName];
      }
    }

    return null;
  }

  function getTaxUtils(taxConfig) {
    return taxConfig?.taxUtils || global.LensPmiTaxUtils || {};
  }

  function safeReadJson(storage, key) {
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }

    try {
      return JSON.parse(storage.getItem(key) || "null");
    } catch (_error) {
      return null;
    }
  }

  function rowsMatch(leftRows, rightRows) {
    if (!Array.isArray(leftRows) || !Array.isArray(rightRows) || leftRows.length !== rightRows.length) {
      return false;
    }

    return leftRows.every(function (row, index) {
      const rightRow = rightRows[index] || {};
      return normalizeString(row?.rate) === normalizeString(rightRow?.rate)
        && normalizeString(row?.minIncome) === normalizeString(rightRow?.minIncome)
        && normalizeString(row?.maxIncome) === normalizeString(rightRow?.maxIncome);
    });
  }

  function isAdditionalMedicareTaxName(value) {
    return normalizeString(value).toLowerCase() === "additional medicare";
  }

  function getDefaultAdditionalMedicareThresholds(taxConfig) {
    return function () {
      return {
        ...DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS,
        ...(isPlainObject(taxConfig?.defaultAdditionalMedicareThresholds)
          ? taxConfig.defaultAdditionalMedicareThresholds
          : {})
      };
    };
  }

  function createDefaultPmiTaxConfig(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    return {
      taxUtils: normalizedOptions.taxUtils || global.LensPmiTaxUtils || null,
      federalTaxBracketsByStatus: cloneRowsByStatus(DEFAULT_FEDERAL_ROWS_BY_STATUS),
      federalTaxBracketsRaw: null,
      standardDeductions: cloneSimpleConfig(DEFAULT_STANDARD_DEDUCTIONS),
      stateTaxConfigsByState: {},
      defaultStateTaxRows: cloneRows(DEFAULT_STATE_TAX_ROWS),
      noIncomeTaxStates: NO_INCOME_TAX_STATES.slice(),
      payrollRows: cloneRows(DEFAULT_PAYROLL_ROWS),
      defaultAdditionalMedicareThresholds: cloneSimpleConfig(DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS)
    };
  }

  function readStoredStandardDeductions(storage, taxUtils) {
    if (typeof taxUtils.readStoredStandardDeductionConfig === "function" && storage === global.localStorage) {
      return taxUtils.readStoredStandardDeductionConfig(
        TAX_STORAGE_KEYS.standardDeductions,
        DEFAULT_STANDARD_DEDUCTIONS
      );
    }

    const stored = safeReadJson(storage, TAX_STORAGE_KEYS.standardDeductions);
    const nextConfig = cloneSimpleConfig(DEFAULT_STANDARD_DEDUCTIONS);
    if (!isPlainObject(stored)) {
      return nextConfig;
    }

    Object.keys(nextConfig).forEach(function (key) {
      const storedValue = normalizeString(stored[key]);
      if (storedValue) {
        nextConfig[key] = storedValue;
      }
    });
    return nextConfig;
  }

  function readStoredPayrollRows(storage, taxUtils) {
    if (typeof taxUtils.readStoredPayrollConfig === "function" && storage === global.localStorage) {
      return taxUtils.readStoredPayrollConfig({
        storageKey: TAX_STORAGE_KEYS.payrollTaxConfig,
        defaultRows: cloneRows(DEFAULT_PAYROLL_ROWS),
        isAdditionalMedicareTaxName,
        getDefaultAdditionalMedicareThresholds: function () {
          return cloneSimpleConfig(DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS);
        }
      });
    }

    const stored = safeReadJson(storage, TAX_STORAGE_KEYS.payrollTaxConfig);
    if (!Array.isArray(stored) || !stored.length) {
      return cloneRows(DEFAULT_PAYROLL_ROWS);
    }

    return stored.map(function (row) {
      return {
        name: normalizeString(row?.name),
        rate: normalizeString(row?.rate),
        wageBase: normalizeString(row?.wageBase),
        thresholds: isAdditionalMedicareTaxName(row?.name)
          ? {
              ...DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS,
              ...(isPlainObject(row?.thresholds) ? row.thresholds : {})
            }
          : undefined
      };
    });
  }

  function createPmiTaxConfigFromStorage(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const storage = normalizedOptions.storage || null;
    const taxUtils = normalizedOptions.taxUtils || global.LensPmiTaxUtils || null;
    const config = createDefaultPmiTaxConfig({ taxUtils });
    const storedFederalRows = safeReadJson(storage, TAX_STORAGE_KEYS.federalTaxBrackets);
    const storedStateConfigs = safeReadJson(storage, TAX_STORAGE_KEYS.stateTaxBrackets);

    config.federalTaxBracketsRaw = storedFederalRows;
    config.standardDeductions = readStoredStandardDeductions(storage, getTaxUtils(config));
    config.payrollRows = readStoredPayrollRows(storage, getTaxUtils(config));
    config.stateTaxConfigsByState = isPlainObject(storedStateConfigs) ? { ...storedStateConfigs } : {};

    return config;
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
    const filingStatus = normalizeString(sourceData?.filingStatus);

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

  function getFederalTaxBracketRowsForStatus(taxConfig, filingStatus) {
    const normalizedStatus = normalizeString(filingStatus);
    const rawConfig = taxConfig?.federalTaxBracketsRaw;
    const defaultConfig = taxConfig?.federalTaxBracketsByStatus || DEFAULT_FEDERAL_ROWS_BY_STATUS;

    if (Array.isArray(rawConfig)) {
      return cloneRows(rawConfig);
    }

    if (isPlainObject(rawConfig) && Array.isArray(rawConfig[normalizedStatus])) {
      return normalizedStatus !== "Single" && rowsMatch(rawConfig[normalizedStatus], LEGACY_SINGLE_FEDERAL_ROWS)
        ? cloneRows(defaultConfig[normalizedStatus])
        : cloneRows(rawConfig[normalizedStatus]);
    }

    return cloneRows(defaultConfig[normalizedStatus] || DEFAULT_FEDERAL_ROWS_BY_STATUS.Single);
  }

  function getStateTaxConfigForState(taxConfig, stateCode, filingStatus) {
    const normalizedCode = normalizeString(stateCode).toUpperCase();
    const normalizedFilingStatus = normalizeString(filingStatus);
    const noIncomeTaxStates = new Set(
      Array.isArray(taxConfig?.noIncomeTaxStates) ? taxConfig.noIncomeTaxStates : NO_INCOME_TAX_STATES
    );
    const defaultRows = cloneRows(taxConfig?.defaultStateTaxRows || DEFAULT_STATE_TAX_ROWS);
    const defaultConfig = {
      hasIncomeTax: !noIncomeTaxStates.has(normalizedCode),
      mode: "brackets",
      flatRate: "",
      rows: noIncomeTaxStates.has(normalizedCode) ? [] : defaultRows
    };

    if (!normalizedCode || !normalizedFilingStatus) {
      return { hasIncomeTax: false, mode: "brackets", flatRate: "", rows: [] };
    }

    const storedStateConfig = taxConfig?.stateTaxConfigsByState?.[normalizedCode];
    if (isPlainObject(storedStateConfig)) {
      const hasIncomeTax = storedStateConfig.hasIncomeTax === false ? false : true;
      const mode = normalizeString(storedStateConfig.mode) === "flat" ? "flat" : "brackets";
      const flatRate = normalizeString(storedStateConfig.flatRate);
      const filings = isPlainObject(storedStateConfig.filings) ? storedStateConfig.filings : {};
      const rows = Array.isArray(filings[normalizedFilingStatus]) ? filings[normalizedFilingStatus] : [];
      return {
        hasIncomeTax,
        mode,
        flatRate,
        rows: hasIncomeTax ? (rows.length ? cloneRows(rows) : defaultConfig.rows) : []
      };
    }

    return defaultConfig;
  }

  function getStandardDeductionAmount(taxConfig, filingStatus) {
    const standardDeductions = taxConfig?.standardDeductions || DEFAULT_STANDARD_DEDUCTIONS;
    return parseCurrencyLikeNumber(standardDeductions[filingStatus] || DEFAULT_STANDARD_DEDUCTIONS[filingStatus]);
  }

  function getEffectiveDeductionValues(sourceData, profileRecord, taxConfig, taxUtils) {
    const filingStatus = normalizeString(sourceData?.filingStatus);
    const incomeCalculationMode = getIncomeCalculationMode(sourceData, profileRecord);
    const primaryGrossIncome = parseCurrencyLikeNumber(sourceData?.grossAnnualIncome);
    const spouseGrossIncome = parseCurrencyLikeNumber(sourceData?.spouseIncome);
    const primaryMethod = getDeductionMethodValue(sourceData?.deductionMethod);
    const spouseMethod = getDeductionMethodValue(sourceData?.spouseDeductionMethod);
    const standardDeductionAmount = getStandardDeductionAmount(taxConfig, filingStatus);

    if (incomeCalculationMode === "joint") {
      return {
        primary: primaryMethod === "itemized"
          ? parseCurrencyLikeNumber(sourceData?.yearlyTaxDeductions)
          : standardDeductionAmount,
        spouse: 0
      };
    }

    const split = taxUtils.getStandardDeductionSplit({
      filingStatus,
      deductionAmount: standardDeductionAmount,
      primaryIncome: primaryGrossIncome,
      spouseIncome: spouseGrossIncome
    });

    return {
      primary: primaryMethod === "itemized"
        ? parseCurrencyLikeNumber(sourceData?.yearlyTaxDeductions)
        : split.primary,
      spouse: spouseMethod === "itemized"
        ? parseCurrencyLikeNumber(sourceData?.spouseYearlyTaxDeductions)
        : split.spouse
    };
  }

  function getTaxableIncomeValues(sourceData, profileRecord, taxConfig, taxUtils) {
    const incomeCalculationMode = getIncomeCalculationMode(sourceData, profileRecord);
    const primaryGrossIncome = parseCurrencyLikeNumber(sourceData?.grossAnnualIncome);
    const spouseGrossIncome = parseCurrencyLikeNumber(sourceData?.spouseIncome);
    const deductions = getEffectiveDeductionValues(sourceData, profileRecord, taxConfig, taxUtils);

    if (incomeCalculationMode === "joint") {
      const combinedGrossIncome = primaryGrossIncome + spouseGrossIncome;
      const combinedTaxableIncome = Math.max(0, combinedGrossIncome - deductions.primary);

      if (!combinedGrossIncome) {
        return {
          incomeCalculationMode,
          combined: combinedTaxableIncome,
          primary: combinedTaxableIncome,
          spouse: 0
        };
      }

      return {
        incomeCalculationMode,
        combined: combinedTaxableIncome,
        primary: combinedTaxableIncome * (primaryGrossIncome / combinedGrossIncome),
        spouse: combinedTaxableIncome * (spouseGrossIncome / combinedGrossIncome)
      };
    }

    const primaryTaxableIncome = Math.max(0, primaryGrossIncome - deductions.primary);
    const spouseTaxableIncome = Math.max(0, spouseGrossIncome - deductions.spouse);
    return {
      incomeCalculationMode,
      combined: primaryTaxableIncome + spouseTaxableIncome,
      primary: primaryTaxableIncome,
      spouse: spouseTaxableIncome
    };
  }

  function getMissingItemizedDeductionFields(sourceData, profileRecord) {
    const incomeCalculationMode = getIncomeCalculationMode(sourceData, profileRecord);
    const primaryMethod = getDeductionMethodValue(sourceData?.deductionMethod);
    const spouseMethod = getDeductionMethodValue(sourceData?.spouseDeductionMethod);
    const missing = [];

    if (primaryMethod === "itemized" && toOptionalNumber(sourceData?.yearlyTaxDeductions) == null) {
      missing.push("yearlyTaxDeductions");
    }

    if (
      incomeCalculationMode === "separate"
      && spouseMethod === "itemized"
      && toOptionalNumber(sourceData?.spouseYearlyTaxDeductions) == null
    ) {
      missing.push("spouseYearlyTaxDeductions");
    }

    return missing;
  }

  function validateTaxInputs(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const taxConfig = normalizedOptions.taxConfig || {};
    const sourceData = isPlainObject(normalizedOptions.sourceData) ? normalizedOptions.sourceData : {};
    const profileRecord = isPlainObject(normalizedOptions.profileRecord) ? normalizedOptions.profileRecord : {};
    const taxUtils = getTaxUtils(taxConfig);
    const filingStatus = normalizeString(normalizedOptions.filingStatus);
    const stateOfResidence = normalizeString(normalizedOptions.stateOfResidence);
    const federalRows = getFederalTaxBracketRowsForStatus(taxConfig, filingStatus);
    const payrollRows = Array.isArray(taxConfig.payrollRows) ? taxConfig.payrollRows : null;
    const missing = [];

    if (!filingStatus) missing.push("filingStatus");
    if (!stateOfResidence) missing.push("stateOfResidence");
    if (typeof taxUtils.getStandardDeductionSplit !== "function") missing.push("getStandardDeductionSplit");
    if (typeof taxUtils.getProgressiveTaxAmount !== "function") missing.push("getProgressiveTaxAmount");
    if (typeof taxUtils.getProgressiveBracketTaxAmounts !== "function") missing.push("getProgressiveBracketTaxAmounts");
    if (typeof taxUtils.getBracketTaxAmounts !== "function") missing.push("getBracketTaxAmounts");
    if (typeof taxUtils.getPayrollTaxAmounts !== "function") missing.push("getPayrollTaxAmounts");
    if (typeof taxUtils.getNetIncome !== "function") missing.push("getNetIncome");
    if (!taxConfig.standardDeductions) missing.push("standardDeductions");
    if (!Array.isArray(federalRows) || !federalRows.length) missing.push("federalTaxBracketsByStatus[" + filingStatus + "]");
    if (!payrollRows) missing.push("payrollRows");
    getMissingItemizedDeductionFields(sourceData, profileRecord).forEach(function (fieldName) {
      missing.push(fieldName);
    });

    return {
      canCalculate: missing.length === 0,
      missing,
      taxUtils,
      federalRows,
      payrollRows
    };
  }

  function calculateCurrentNetIncomeValues(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const sourceData = isPlainObject(normalizedOptions.sourceData) ? normalizedOptions.sourceData : {};
    const profileRecord = isPlainObject(normalizedOptions.profileRecord) ? normalizedOptions.profileRecord : {};
    const taxConfig = isPlainObject(normalizedOptions.taxConfig)
      ? normalizedOptions.taxConfig
      : createDefaultPmiTaxConfig({ taxUtils: global.LensPmiTaxUtils });
    const warnings = [];
    const filingStatus = normalizeString(sourceData.filingStatus);
    const stateOfResidence = getStateOfResidence(profileRecord, sourceData);
    const validation = validateTaxInputs({
      taxConfig,
      filingStatus,
      stateOfResidence,
      sourceData,
      profileRecord
    });

    if (!validation.canCalculate) {
      addWarning(
        warnings,
        "tax-recomputation-unavailable",
        "Net-income recomputation was skipped because reusable tax helpers/config were incomplete.",
        {
          context: "income-net-income",
          missing: validation.missing
        }
      );
      return {
        primaryNetAnnualIncome: null,
        spouseNetAnnualIncome: null,
        warnings
      };
    }

    const taxUtils = validation.taxUtils;
    const taxableIncomeValues = getTaxableIncomeValues(sourceData, profileRecord, taxConfig, taxUtils);
    const primaryGrossIncome = parseCurrencyLikeNumber(sourceData.grossAnnualIncome);
    const spouseGrossIncome = parseCurrencyLikeNumber(sourceData.spouseIncome);
    const stateConfig = getStateTaxConfigForState(taxConfig, stateOfResidence, filingStatus);
    const federalTaxes = taxUtils.getProgressiveBracketTaxAmounts({
      filingStatus,
      primaryTaxableIncome: taxableIncomeValues.primary,
      spouseTaxableIncome: taxableIncomeValues.spouse,
      primaryBracketRows: validation.federalRows,
      spouseBracketRows: validation.federalRows,
      parseCurrencyLikeNumber,
      parsePercentLikeNumber
    });
    const stateTaxes = stateConfig.mode === "flat"
      ? taxUtils.getBracketTaxAmounts({
          filingStatus,
          primaryTaxableIncome: taxableIncomeValues.primary,
          spouseTaxableIncome: taxableIncomeValues.spouse,
          primaryRate: parsePercentLikeNumber(stateConfig.flatRate),
          spouseRate: parsePercentLikeNumber(stateConfig.flatRate)
        })
      : taxUtils.getProgressiveBracketTaxAmounts({
          filingStatus,
          primaryTaxableIncome: taxableIncomeValues.primary,
          spouseTaxableIncome: taxableIncomeValues.spouse,
          primaryBracketRows: Array.isArray(stateConfig.rows) ? stateConfig.rows : [],
          spouseBracketRows: Array.isArray(stateConfig.rows) ? stateConfig.rows : [],
          parseCurrencyLikeNumber,
          parsePercentLikeNumber
        });
    const payrollTaxes = taxUtils.getPayrollTaxAmounts({
      filingStatus,
      primaryEarnedIncome: primaryGrossIncome,
      spouseEarnedIncome: spouseGrossIncome,
      primaryTaxableIncome: primaryGrossIncome,
      spouseTaxableIncome: spouseGrossIncome,
      payrollRows: validation.payrollRows,
      parseCurrencyLikeNumber,
      parsePercentLikeNumber,
      getDefaultAdditionalMedicareThresholds: getDefaultAdditionalMedicareThresholds(taxConfig)
    });
    const combinedNetIncome = taxUtils.getNetIncome(
      primaryGrossIncome + spouseGrossIncome,
      federalTaxes.primary + federalTaxes.spouse,
      stateTaxes.primary + stateTaxes.spouse,
      payrollTaxes.primary + payrollTaxes.spouse
    );

    return {
      primaryNetAnnualIncome: taxableIncomeValues.incomeCalculationMode === "joint"
        ? combinedNetIncome
        : taxUtils.getNetIncome(primaryGrossIncome, federalTaxes.primary, stateTaxes.primary, payrollTaxes.primary),
      spouseNetAnnualIncome: taxableIncomeValues.incomeCalculationMode === "separate"
        ? taxUtils.getNetIncome(spouseGrossIncome, federalTaxes.spouse, stateTaxes.spouse, payrollTaxes.spouse)
        : null,
      warnings,
      taxSnapshot: {
        incomeCalculationMode: taxableIncomeValues.incomeCalculationMode,
        federalTaxes,
        stateTaxes,
        payrollTaxes,
        taxableIncome: taxableIncomeValues
      }
    };
  }

  function calculateSurvivorNetIncome(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const sourceData = isPlainObject(normalizedOptions.sourceData) ? normalizedOptions.sourceData : {};
    const profileRecord = isPlainObject(normalizedOptions.profileRecord) ? normalizedOptions.profileRecord : {};
    const taxConfig = isPlainObject(normalizedOptions.taxConfig)
      ? normalizedOptions.taxConfig
      : createDefaultPmiTaxConfig({ taxUtils: global.LensPmiTaxUtils });
    const warnings = [];
    const filingStatus = normalizeString(normalizedOptions.filingStatus || "Qualifying Surviving Spouse");
    const stateOfResidence = getStateOfResidence(profileRecord, sourceData);
    const grossIncome = toOptionalNumber(normalizedOptions.grossIncome);
    const validation = validateTaxInputs({
      taxConfig,
      filingStatus,
      stateOfResidence
    });

    if (grossIncome == null) {
      return {
        netAnnualIncome: null,
        warnings
      };
    }

    if (!validation.canCalculate) {
      addWarning(
        warnings,
        "tax-recomputation-unavailable",
        "Survivor net-income recomputation was skipped because reusable tax helpers/config were incomplete.",
        {
          context: "survivor-scenario",
          missing: validation.missing
        }
      );
      return {
        netAnnualIncome: null,
        warnings
      };
    }

    const taxUtils = validation.taxUtils;
    const stateConfig = getStateTaxConfigForState(taxConfig, stateOfResidence, filingStatus);
    const standardDeduction = getStandardDeductionAmount(taxConfig, filingStatus);
    const taxableIncome = Math.max(0, grossIncome - standardDeduction);
    const federalTax = taxUtils.getProgressiveTaxAmount(
      taxableIncome,
      validation.federalRows,
      parseCurrencyLikeNumber,
      parsePercentLikeNumber
    );
    const stateTax = stateConfig.mode === "flat"
      ? taxableIncome * parsePercentLikeNumber(stateConfig.flatRate)
      : taxUtils.getProgressiveTaxAmount(
          taxableIncome,
          Array.isArray(stateConfig.rows) ? stateConfig.rows : [],
          parseCurrencyLikeNumber,
          parsePercentLikeNumber
        );
    const payrollTax = taxUtils.getPayrollTaxAmounts({
      filingStatus,
      primaryEarnedIncome: grossIncome,
      spouseEarnedIncome: 0,
      primaryTaxableIncome: grossIncome,
      spouseTaxableIncome: 0,
      payrollRows: validation.payrollRows,
      parseCurrencyLikeNumber,
      parsePercentLikeNumber,
      getDefaultAdditionalMedicareThresholds: getDefaultAdditionalMedicareThresholds(taxConfig)
    }).primary;

    return {
      netAnnualIncome: taxUtils.getNetIncome(grossIncome, federalTax, stateTax, payrollTax),
      warnings,
      taxSnapshot: {
        federalTax,
        stateTax,
        payrollTax,
        taxableIncome,
        standardDeduction
      }
    };
  }

  function calculatePmiIncomeBasisFromSourceData(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const sourceData = isPlainObject(normalizedOptions.sourceData) ? normalizedOptions.sourceData : {};
    const result = calculateCurrentNetIncomeValues(normalizedOptions);
    const primaryNetAnnualIncome = result.primaryNetAnnualIncome;
    const annualIncomeReplacementBase = primaryNetAnnualIncome == null
      ? null
      : primaryNetAnnualIncome
        + (toOptionalNumber(sourceData.bonusVariableIncome) == null ? 0 : toOptionalNumber(sourceData.bonusVariableIncome))
        + (toOptionalNumber(sourceData.employerBenefitsValue) == null ? 0 : toOptionalNumber(sourceData.employerBenefitsValue));

    return {
      primaryNetAnnualIncome,
      spouseNetAnnualIncome: result.spouseNetAnnualIncome,
      annualIncomeReplacementBase,
      warnings: result.warnings || [],
      taxSnapshot: result.taxSnapshot || null
    };
  }

  lensAnalysis.incomeTaxCalculations = Object.assign(
    lensAnalysis.incomeTaxCalculations || {},
    {
      TAX_STORAGE_KEYS,
      DEFAULT_FEDERAL_ROWS_BY_STATUS,
      DEFAULT_STANDARD_DEDUCTIONS,
      DEFAULT_STATE_TAX_ROWS,
      DEFAULT_PAYROLL_ROWS,
      DEFAULT_ADDITIONAL_MEDICARE_THRESHOLDS,
      createDefaultPmiTaxConfig,
      createPmiTaxConfigFromStorage,
      getFederalTaxBracketRowsForStatus,
      getStateTaxConfigForState,
      calculateCurrentNetIncomeValues,
      calculateSurvivorNetIncome,
      calculatePmiIncomeBasisFromSourceData
    }
  );
})(window);
