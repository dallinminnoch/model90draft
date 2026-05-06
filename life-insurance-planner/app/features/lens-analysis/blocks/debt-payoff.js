(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: debt-payoff Lens block module.
  // Purpose: define the debt-payoff block contract, source fields, and pure builder.
  // Non-goals: no DOM reads, no persistence, no page wiring.

  const DEBT_PAYOFF_BLOCK_ID = "debt-payoff";
  const DEBT_PAYOFF_BLOCK_TYPE = "debt.payoff.current-pmi";
  const DEBT_PAYOFF_BLOCK_VERSION = 1;

  const DEBT_PAYOFF_BLOCK_SOURCE_FIELDS = Object.freeze({
    mortgageBalance: "mortgageBalance",
    otherRealEstateLoanBalance: "otherRealEstateLoans",
    autoLoanBalance: "autoLoans",
    creditCardBalance: "creditCardDebt",
    studentLoanBalance: "studentLoans",
    personalLoanBalance: "personalLoans",
    outstandingTaxLiabilities: "taxLiabilities",
    businessDebtBalance: "businessDebt",
    otherDebtPayoffNeeds: "otherLoanObligations",
    totalDebtPayoffNeed: "totalDebtPayoffNeed",
    totalDebtPayoffNeedManualOverride: "totalDebtPayoffNeedManualOverride"
  });

  const DEBT_RECORDS_SOURCE_FIELD = "debtRecords";

  const DEBT_RECORD_COMPATIBILITY_OUTPUTS = Object.freeze([
    "otherRealEstateLoanBalance",
    "autoLoanBalance",
    "creditCardBalance",
    "studentLoanBalance",
    "personalLoanBalance",
    "outstandingTaxLiabilities",
    "businessDebtBalance",
    "otherDebtPayoffNeeds"
  ]);

  const COMPATIBILITY_OUTPUT_BY_DEBT_TYPE = Object.freeze({
    heloc: "otherRealEstateLoanBalance",
    homeEquityLoan: "otherRealEstateLoanBalance",
    secondMortgage: "otherRealEstateLoanBalance",
    otherPropertyLoan: "otherRealEstateLoanBalance",
    investmentPropertyMortgage: "otherRealEstateLoanBalance",
    landLoan: "otherRealEstateLoanBalance",
    constructionLoan: "otherRealEstateLoanBalance",
    autoLoan: "autoLoanBalance",
    autoLease: "autoLoanBalance",
    secondVehicleLoan: "autoLoanBalance",
    secondVehicleLease: "autoLoanBalance",
    motorcycleLoan: "autoLoanBalance",
    rvLoan: "autoLoanBalance",
    boatLoan: "autoLoanBalance",
    aircraftLoan: "autoLoanBalance",
    creditCard: "creditCardBalance",
    storeCard: "creditCardBalance",
    chargeCard: "creditCardBalance",
    personalLoan: "personalLoanBalance",
    securedPersonalLoan: "personalLoanBalance",
    unsecuredLineOfCredit: "personalLoanBalance",
    debtConsolidationLoan: "personalLoanBalance",
    federalStudentLoan: "studentLoanBalance",
    privateStudentLoan: "studentLoanBalance",
    parentPlusLoan: "studentLoanBalance",
    studentLoanRefinance: "studentLoanBalance",
    irsTaxDebt: "outstandingTaxLiabilities",
    stateTaxDebt: "outstandingTaxLiabilities",
    propertyTaxDebt: "outstandingTaxLiabilities",
    legalJudgment: "outstandingTaxLiabilities",
    courtOrderedDebt: "outstandingTaxLiabilities",
    backTaxes: "outstandingTaxLiabilities",
    businessLoan: "businessDebtBalance",
    businessLineOfCredit: "businessDebtBalance",
    sbaLoan: "businessDebtBalance",
    commercialMortgage: "businessDebtBalance",
    accountsPayableBusinessObligation: "businessDebtBalance",
    businessEquipmentLoan: "businessDebtBalance"
  });

  const COMPATIBILITY_OUTPUT_BY_DEBT_CATEGORY = Object.freeze({
    realEstateSecuredDebt: "otherRealEstateLoanBalance",
    securedConsumerDebt: "autoLoanBalance",
    educationDebt: "studentLoanBalance",
    medicalDebt: "otherDebtPayoffNeeds",
    taxLegalDebt: "outstandingTaxLiabilities",
    businessDebt: "businessDebtBalance",
    privatePersonalDebt: "otherDebtPayoffNeeds",
    consumerFinanceDebt: "otherDebtPayoffNeeds",
    otherDebt: "otherDebtPayoffNeeds"
  });

  const BLOCKED_DEBT_RECORD_COMPATIBILITY_KEYS = Object.freeze([
    "primaryResidenceMortgage",
    "primaryResidenceEquity",
    "realEstateEquity",
    "otherRealEstateEquity",
    "equity"
  ]);

  const DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: DEBT_PAYOFF_BLOCK_ID,
    blockType: DEBT_PAYOFF_BLOCK_TYPE,
    blockVersion: DEBT_PAYOFF_BLOCK_VERSION,
    outputs: {
      mortgageBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.mortgageBalance",
        meaning: "Outstanding mortgage balance that could require payoff."
      },
      otherRealEstateLoanBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.otherRealEstateLoanBalance",
        meaning: "Outstanding non-primary real-estate debt balance."
      },
      autoLoanBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.autoLoanBalance",
        meaning: "Outstanding auto-loan balance."
      },
      creditCardBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.creditCardBalance",
        meaning: "Outstanding credit-card balance."
      },
      studentLoanBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.studentLoanBalance",
        meaning: "Outstanding student-loan balance."
      },
      personalLoanBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.personalLoanBalance",
        meaning: "Outstanding personal-loan balance."
      },
      outstandingTaxLiabilities: {
        type: "number|null",
        canonicalDestination: "debtPayoff.outstandingTaxLiabilities",
        meaning: "Outstanding tax liabilities that may need payoff."
      },
      businessDebtBalance: {
        type: "number|null",
        canonicalDestination: "debtPayoff.businessDebtBalance",
        meaning: "Outstanding business-debt balance."
      },
      otherDebtPayoffNeeds: {
        type: "number|null",
        canonicalDestination: "debtPayoff.otherDebtPayoffNeeds",
        meaning: "Other named debt or payoff obligations not captured by another balance field."
      },
      totalDebtPayoffNeed: {
        type: "number|null",
        canonicalDestination: "debtPayoff.totalDebtPayoffNeed",
        meaning: "Current card-level total across all reported debt payoff balances or a manual override of that card total."
      }
    }
  });

  function createTotalDebtPayoffNeedMetadata(outputValue, rawField, canonicalDestination, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const manualOverride = normalizedOptions.manualOverride === true;

    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null
        ? "missing"
        : (manualOverride ? "user-input" : "calculated"),
      confidence: outputValue == null
        ? "unknown"
        : (manualOverride ? "reported" : "calculated_from_reported_inputs"),
      rawField,
      canonicalDestination
    });
  }

  function normalizeDebtRecordString(value) {
    return String(value == null ? "" : value).trim();
  }

  function findDebtLibraryEntry(typeKey) {
    const normalizedTypeKey = normalizeDebtRecordString(typeKey);
    const debtLibrary = lensAnalysis.debtLibrary && typeof lensAnalysis.debtLibrary === "object"
      ? lensAnalysis.debtLibrary
      : {};

    if (!normalizedTypeKey || typeof debtLibrary.findDebtLibraryEntry !== "function") {
      return null;
    }

    return debtLibrary.findDebtLibraryEntry(normalizedTypeKey);
  }

  function resolveDebtRecordCompatibilityOutput(debtRecord) {
    const safeDebtRecord = debtRecord && typeof debtRecord === "object" ? debtRecord : {};
    const typeKey = normalizeDebtRecordString(safeDebtRecord.typeKey);
    const categoryKey = normalizeDebtRecordString(safeDebtRecord.categoryKey);
    const sourceKey = normalizeDebtRecordString(safeDebtRecord.sourceKey);
    const libraryEntry = findDebtLibraryEntry(typeKey);

    if (
      BLOCKED_DEBT_RECORD_COMPATIBILITY_KEYS.indexOf(typeKey) !== -1
      || BLOCKED_DEBT_RECORD_COMPATIBILITY_KEYS.indexOf(categoryKey) !== -1
      || BLOCKED_DEBT_RECORD_COMPATIBILITY_KEYS.indexOf(sourceKey) !== -1
      || !libraryEntry
      || libraryEntry.isAddable === false
      || libraryEntry.isHousingFieldOwned === true
      || (categoryKey && libraryEntry.categoryKey !== categoryKey)
    ) {
      return null;
    }

    return COMPATIBILITY_OUTPUT_BY_DEBT_TYPE[typeKey]
      || COMPATIBILITY_OUTPUT_BY_DEBT_CATEGORY[libraryEntry.categoryKey]
      || "otherDebtPayoffNeeds";
  }

  function createDebtRecordCompatibilityOutputs(debtRecords, toOptionalNumber) {
    const outputs = DEBT_RECORD_COMPATIBILITY_OUTPUTS.reduce(function (values, outputKey) {
      values[outputKey] = null;
      return values;
    }, {});

    if (!Array.isArray(debtRecords)) {
      return outputs;
    }

    debtRecords.forEach(function (debtRecord) {
      const compatibilityOutput = resolveDebtRecordCompatibilityOutput(debtRecord);
      const currentBalance = toOptionalNumber(debtRecord && debtRecord.currentBalance);

      if (!compatibilityOutput || currentBalance == null || currentBalance <= 0) {
        return;
      }

      outputs[compatibilityOutput] = (outputs[compatibilityOutput] || 0) + currentBalance;
    });

    return outputs;
  }

  function sumDebtPayoffOutputs(outputs) {
    const values = [
      outputs.mortgageBalance,
      outputs.otherRealEstateLoanBalance,
      outputs.autoLoanBalance,
      outputs.creditCardBalance,
      outputs.studentLoanBalance,
      outputs.personalLoanBalance,
      outputs.outstandingTaxLiabilities,
      outputs.businessDebtBalance,
      outputs.otherDebtPayoffNeeds
    ];
    const hasAnyValue = values.some(function (value) {
      return value != null;
    });

    if (!hasAnyValue) {
      return null;
    }

    return values.reduce(function (total, value) {
      return total + (value == null ? 0 : value);
    }, 0);
  }

  function createDebtPayoffBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createReportedNumericOutputMetadata = lensAnalysis.createReportedNumericOutputMetadata;
    const debtRecordsAreSourceOfTruth = Array.isArray(data[DEBT_RECORDS_SOURCE_FIELD]);
    const debtRecordCompatibilityOutputs = createDebtRecordCompatibilityOutputs(
      data[DEBT_RECORDS_SOURCE_FIELD],
      toOptionalNumber
    );

    const outputs = {
      mortgageBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.mortgageBalance]),
      otherRealEstateLoanBalance: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.otherRealEstateLoanBalance
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.otherRealEstateLoanBalance]),
      autoLoanBalance: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.autoLoanBalance
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.autoLoanBalance]),
      creditCardBalance: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.creditCardBalance
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.creditCardBalance]),
      studentLoanBalance: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.studentLoanBalance
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.studentLoanBalance]),
      personalLoanBalance: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.personalLoanBalance
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.personalLoanBalance]),
      outstandingTaxLiabilities: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.outstandingTaxLiabilities
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.outstandingTaxLiabilities]),
      businessDebtBalance: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.businessDebtBalance
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.businessDebtBalance]),
      otherDebtPayoffNeeds: debtRecordsAreSourceOfTruth
        ? debtRecordCompatibilityOutputs.otherDebtPayoffNeeds
        : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.otherDebtPayoffNeeds]),
      totalDebtPayoffNeed: null
    };
    outputs.totalDebtPayoffNeed = debtRecordsAreSourceOfTruth
      ? sumDebtPayoffOutputs(outputs)
      : toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.totalDebtPayoffNeed]);

    return createBlockOutput({
      blockId: DEBT_PAYOFF_BLOCK_ID,
      blockType: DEBT_PAYOFF_BLOCK_TYPE,
      blockVersion: DEBT_PAYOFF_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        mortgageBalance: createReportedNumericOutputMetadata(
          outputs.mortgageBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.mortgageBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.mortgageBalance.canonicalDestination
        ),
        otherRealEstateLoanBalance: createReportedNumericOutputMetadata(
          outputs.otherRealEstateLoanBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.otherRealEstateLoanBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.otherRealEstateLoanBalance.canonicalDestination
        ),
        autoLoanBalance: createReportedNumericOutputMetadata(
          outputs.autoLoanBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.autoLoanBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.autoLoanBalance.canonicalDestination
        ),
        creditCardBalance: createReportedNumericOutputMetadata(
          outputs.creditCardBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.creditCardBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.creditCardBalance.canonicalDestination
        ),
        studentLoanBalance: createReportedNumericOutputMetadata(
          outputs.studentLoanBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.studentLoanBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.studentLoanBalance.canonicalDestination
        ),
        personalLoanBalance: createReportedNumericOutputMetadata(
          outputs.personalLoanBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.personalLoanBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.personalLoanBalance.canonicalDestination
        ),
        outstandingTaxLiabilities: createReportedNumericOutputMetadata(
          outputs.outstandingTaxLiabilities,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.outstandingTaxLiabilities,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.outstandingTaxLiabilities.canonicalDestination
        ),
        businessDebtBalance: createReportedNumericOutputMetadata(
          outputs.businessDebtBalance,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.businessDebtBalance,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.businessDebtBalance.canonicalDestination
        ),
        otherDebtPayoffNeeds: createReportedNumericOutputMetadata(
          outputs.otherDebtPayoffNeeds,
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.otherDebtPayoffNeeds,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.otherDebtPayoffNeeds.canonicalDestination
        ),
        totalDebtPayoffNeed: createTotalDebtPayoffNeedMetadata(
          outputs.totalDebtPayoffNeed,
          debtRecordsAreSourceOfTruth ? DEBT_RECORDS_SOURCE_FIELD : DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.totalDebtPayoffNeed,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.totalDebtPayoffNeed.canonicalDestination,
          {
            manualOverride: !debtRecordsAreSourceOfTruth && data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.totalDebtPayoffNeedManualOverride] === true
          }
        )
      }
    });
  }

  lensAnalysis.DEBT_PAYOFF_BLOCK_ID = DEBT_PAYOFF_BLOCK_ID;
  lensAnalysis.DEBT_PAYOFF_BLOCK_TYPE = DEBT_PAYOFF_BLOCK_TYPE;
  lensAnalysis.DEBT_PAYOFF_BLOCK_VERSION = DEBT_PAYOFF_BLOCK_VERSION;
  lensAnalysis.DEBT_PAYOFF_BLOCK_SOURCE_FIELDS = DEBT_PAYOFF_BLOCK_SOURCE_FIELDS;
  lensAnalysis.DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT = DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createDebtPayoffBlockOutput = createDebtPayoffBlockOutput;
})();
