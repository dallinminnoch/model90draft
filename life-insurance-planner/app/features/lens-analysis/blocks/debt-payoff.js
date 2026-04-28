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

  function createDebtPayoffBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createReportedNumericOutputMetadata = lensAnalysis.createReportedNumericOutputMetadata;

    const outputs = {
      mortgageBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.mortgageBalance]),
      otherRealEstateLoanBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.otherRealEstateLoanBalance]),
      autoLoanBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.autoLoanBalance]),
      creditCardBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.creditCardBalance]),
      studentLoanBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.studentLoanBalance]),
      personalLoanBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.personalLoanBalance]),
      outstandingTaxLiabilities: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.outstandingTaxLiabilities]),
      businessDebtBalance: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.businessDebtBalance]),
      otherDebtPayoffNeeds: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.otherDebtPayoffNeeds]),
      totalDebtPayoffNeed: toOptionalNumber(data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.totalDebtPayoffNeed])
    };

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
          DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.totalDebtPayoffNeed,
          DEBT_PAYOFF_BLOCK_OUTPUT_CONTRACT.outputs.totalDebtPayoffNeed.canonicalDestination,
          {
            manualOverride: data[DEBT_PAYOFF_BLOCK_SOURCE_FIELDS.totalDebtPayoffNeedManualOverride] === true
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
