(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: tax-context Lens block module.
  // Purpose: capture neutral current tax filing/state/deduction context from
  // the active PMI form. No tax formulas or recommendation logic live here.

  const TAX_CONTEXT_BLOCK_ID = "tax-context";
  const TAX_CONTEXT_BLOCK_TYPE = "tax-context.current-pmi";
  const TAX_CONTEXT_BLOCK_VERSION = 1;

  const TAX_CONTEXT_BLOCK_SOURCE_FIELDS = Object.freeze({
    maritalStatus: "linkedMaritalStatusDisplay",
    filingStatus: "filingStatus",
    stateOfResidence: "stateOfResidence",
    primaryDeductionMethod: "deductionMethod",
    spouseDeductionMethod: "spouseDeductionMethod",
    primaryItemizedDeductionAmount: "yearlyTaxDeductions",
    spouseItemizedDeductionAmount: "spouseYearlyTaxDeductions"
  });

  const TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: TAX_CONTEXT_BLOCK_ID,
    blockType: TAX_CONTEXT_BLOCK_TYPE,
    blockVersion: TAX_CONTEXT_BLOCK_VERSION,
    outputs: {
      maritalStatus: {
        type: "string|null",
        canonicalDestination: "assumptions.taxContext.maritalStatus",
        meaning: "Current linked profile marital status context displayed in the PMI tax card."
      },
      filingStatus: {
        type: "string|null",
        canonicalDestination: "assumptions.taxContext.filingStatus",
        meaning: "Current selected tax filing status."
      },
      stateOfResidence: {
        type: "string|null",
        canonicalDestination: "assumptions.taxContext.stateOfResidence",
        meaning: "Current selected state of residence for tax context."
      },
      primaryDeductionMethod: {
        type: "string|null",
        canonicalDestination: "assumptions.taxContext.primaryDeductionMethod",
        meaning: "Current primary deduction method selection."
      },
      spouseDeductionMethod: {
        type: "string|null",
        canonicalDestination: "assumptions.taxContext.spouseDeductionMethod",
        meaning: "Current spouse/partner deduction method selection."
      },
      primaryItemizedDeductionAmount: {
        type: "number|null",
        canonicalDestination: "assumptions.taxContext.primaryItemizedDeductionAmount",
        meaning: "Current primary itemized deduction amount when provided."
      },
      spouseItemizedDeductionAmount: {
        type: "number|null",
        canonicalDestination: "assumptions.taxContext.spouseItemizedDeductionAmount",
        meaning: "Current spouse/partner itemized deduction amount when provided."
      }
    }
  });

  function toOptionalString(value) {
    const normalized = String(value == null ? "" : value).trim();
    return normalized || null;
  }

  function toOptionalStateCode(value) {
    const normalized = toOptionalString(value);
    return normalized ? normalized.toUpperCase() : null;
  }

  function createStringMetadata(outputValue, rawField, canonicalDestination, options = {}) {
    const sourceType = options.sourceType || "user-input";
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : sourceType,
      confidence: outputValue == null ? "unknown" : "reported",
      rawField,
      canonicalDestination
    });
  }

  function createNumericMetadata(outputValue, rawField, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "user-input",
      confidence: outputValue == null ? "unknown" : "reported",
      rawField,
      canonicalDestination
    });
  }

  function createTaxContextBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const sourceFields = TAX_CONTEXT_BLOCK_SOURCE_FIELDS;
    const toOptionalNumber = lensAnalysis.toOptionalNumber;

    const outputs = {
      maritalStatus: toOptionalString(data[sourceFields.maritalStatus]),
      filingStatus: toOptionalString(data[sourceFields.filingStatus]),
      stateOfResidence: toOptionalStateCode(data[sourceFields.stateOfResidence]),
      primaryDeductionMethod: toOptionalString(data[sourceFields.primaryDeductionMethod]),
      spouseDeductionMethod: toOptionalString(data[sourceFields.spouseDeductionMethod]),
      primaryItemizedDeductionAmount: toOptionalNumber(data[sourceFields.primaryItemizedDeductionAmount]),
      spouseItemizedDeductionAmount: toOptionalNumber(data[sourceFields.spouseItemizedDeductionAmount])
    };

    return lensAnalysis.createBlockOutput({
      blockId: TAX_CONTEXT_BLOCK_ID,
      blockType: TAX_CONTEXT_BLOCK_TYPE,
      blockVersion: TAX_CONTEXT_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        maritalStatus: createStringMetadata(
          outputs.maritalStatus,
          sourceFields.maritalStatus,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.maritalStatus.canonicalDestination,
          { sourceType: "linked-profile" }
        ),
        filingStatus: createStringMetadata(
          outputs.filingStatus,
          sourceFields.filingStatus,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.filingStatus.canonicalDestination
        ),
        stateOfResidence: createStringMetadata(
          outputs.stateOfResidence,
          sourceFields.stateOfResidence,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.stateOfResidence.canonicalDestination
        ),
        primaryDeductionMethod: createStringMetadata(
          outputs.primaryDeductionMethod,
          sourceFields.primaryDeductionMethod,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.primaryDeductionMethod.canonicalDestination
        ),
        spouseDeductionMethod: createStringMetadata(
          outputs.spouseDeductionMethod,
          sourceFields.spouseDeductionMethod,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.spouseDeductionMethod.canonicalDestination
        ),
        primaryItemizedDeductionAmount: createNumericMetadata(
          outputs.primaryItemizedDeductionAmount,
          sourceFields.primaryItemizedDeductionAmount,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.primaryItemizedDeductionAmount.canonicalDestination
        ),
        spouseItemizedDeductionAmount: createNumericMetadata(
          outputs.spouseItemizedDeductionAmount,
          sourceFields.spouseItemizedDeductionAmount,
          TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT.outputs.spouseItemizedDeductionAmount.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.TAX_CONTEXT_BLOCK_ID = TAX_CONTEXT_BLOCK_ID;
  lensAnalysis.TAX_CONTEXT_BLOCK_TYPE = TAX_CONTEXT_BLOCK_TYPE;
  lensAnalysis.TAX_CONTEXT_BLOCK_VERSION = TAX_CONTEXT_BLOCK_VERSION;
  lensAnalysis.TAX_CONTEXT_BLOCK_SOURCE_FIELDS = TAX_CONTEXT_BLOCK_SOURCE_FIELDS;
  lensAnalysis.TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT = TAX_CONTEXT_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createTaxContextBlockOutput = createTaxContextBlockOutput;
})();
