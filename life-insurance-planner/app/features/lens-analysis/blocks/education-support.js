(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: education-support Lens block module.
  // Purpose: define the current PMI education-support block contract, source
  // fields, and pure builder for neutral education funding facts.
  // Non-goals: no DOM reads, no persistence, no inflation, no timing
  // projection, no present-value discounting, no offsets, and no recommendation
  // logic.

  const EDUCATION_SUPPORT_BLOCK_ID = "education-support";
  const EDUCATION_SUPPORT_BLOCK_TYPE = "education.support.current-pmi";
  const EDUCATION_SUPPORT_BLOCK_VERSION = 1;

  const EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS = Object.freeze({
    linkedDependentCount: "childrenNeedingFunding",
    perLinkedDependentEducationFunding: "estimatedCostPerChild",
    sameEducationFundingForDesiredAdditionalDependents: "sameEducationFunding",
    desiredAdditionalDependentCount: "projectedDependentsCount",
    perDesiredAdditionalDependentEducationFunding: "projectedEducationFundingPerDependent"
  });

  const EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: EDUCATION_SUPPORT_BLOCK_ID,
    blockType: EDUCATION_SUPPORT_BLOCK_TYPE,
    blockVersion: EDUCATION_SUPPORT_BLOCK_VERSION,
    outputs: {
      linkedDependentCount: {
        type: "number|null",
        canonicalDestination: "educationSupport.linkedDependentCount",
        meaning: "Linked/current profile dependent count used for neutral education funding."
      },
      desiredAdditionalDependentCount: {
        type: "number|null",
        canonicalDestination: "educationSupport.desiredAdditionalDependentCount",
        meaning: "Additional planned dependent count used for neutral education funding."
      },
      perLinkedDependentEducationFunding: {
        type: "number|null",
        canonicalDestination: "educationSupport.perLinkedDependentEducationFunding",
        meaning: "Education funding amount per linked/current dependent."
      },
      perDesiredAdditionalDependentEducationFunding: {
        type: "number|null",
        canonicalDestination: "educationSupport.perDesiredAdditionalDependentEducationFunding",
        meaning: "Education funding amount per additional planned dependent."
      },
      sameEducationFundingForDesiredAdditionalDependents: {
        type: "boolean|null",
        canonicalDestination: "educationSupport.sameEducationFundingForDesiredAdditionalDependents",
        meaning: "Whether additional planned dependents use the same per-dependent funding amount."
      },
      linkedDependentEducationFundingNeed: {
        type: "number|null",
        canonicalDestination: "educationSupport.linkedDependentEducationFundingNeed",
        meaning: "Neutral linked/current dependent lump-sum education funding target. Not inflation-projected, present-valued, offset-adjusted, or a recommendation."
      },
      desiredAdditionalDependentEducationFundingNeed: {
        type: "number|null",
        canonicalDestination: "educationSupport.desiredAdditionalDependentEducationFundingNeed",
        meaning: "Neutral additional planned dependent lump-sum education funding target. Not inflation-projected, present-valued, offset-adjusted, or a recommendation."
      },
      totalEducationFundingNeed: {
        type: "number|null",
        canonicalDestination: "educationSupport.totalEducationFundingNeed",
        meaning: "Neutral lump-sum education funding target across linked and additional planned dependents. Not inflation-projected, present-valued, offset-adjusted, or a recommendation."
      }
    }
  });

  function toOptionalBoolean(value) {
    if (value == null || value === "") {
      return null;
    }

    if (typeof value === "boolean") {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === "yes" || normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "no" || normalized === "false" || normalized === "0") {
      return false;
    }

    return null;
  }

  function createLinkedProfileNumericOutputMetadata(outputValue, rawField, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "linked-profile",
      confidence: outputValue == null ? "unknown" : "reported",
      rawField: rawField,
      canonicalDestination: canonicalDestination
    });
  }

  function createUserReportedMetadata(outputValue, rawField, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "user-input",
      confidence: outputValue == null ? "unknown" : "reported",
      rawField: rawField,
      canonicalDestination: canonicalDestination
    });
  }

  function createCalculatedEducationNeedMetadata(outputValue, rawField, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "calculated",
      confidence: outputValue == null ? "unknown" : "calculated_from_reported_inputs",
      rawField: rawField,
      canonicalDestination: canonicalDestination
    });
  }

  function multiplyNullableFactors(countValue, amountValue) {
    if (countValue == null || amountValue == null) {
      return null;
    }

    return countValue * amountValue;
  }

  function sumNullableSubtotals(leftValue, rightValue) {
    if (leftValue == null && rightValue == null) {
      return null;
    }

    return (leftValue == null ? 0 : leftValue) + (rightValue == null ? 0 : rightValue);
  }

  function createEducationSupportBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;

    const outputs = {
      linkedDependentCount: toOptionalNumber(data[EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.linkedDependentCount]),
      desiredAdditionalDependentCount: toOptionalNumber(data[EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.desiredAdditionalDependentCount]),
      perLinkedDependentEducationFunding: toOptionalNumber(data[EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.perLinkedDependentEducationFunding]),
      perDesiredAdditionalDependentEducationFunding: toOptionalNumber(data[EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.perDesiredAdditionalDependentEducationFunding]),
      sameEducationFundingForDesiredAdditionalDependents: toOptionalBoolean(data[EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.sameEducationFundingForDesiredAdditionalDependents]),
      linkedDependentEducationFundingNeed: null,
      desiredAdditionalDependentEducationFundingNeed: null,
      totalEducationFundingNeed: null
    };

    outputs.linkedDependentEducationFundingNeed = multiplyNullableFactors(
      outputs.linkedDependentCount,
      outputs.perLinkedDependentEducationFunding
    );
    outputs.desiredAdditionalDependentEducationFundingNeed = multiplyNullableFactors(
      outputs.desiredAdditionalDependentCount,
      outputs.perDesiredAdditionalDependentEducationFunding
    );
    outputs.totalEducationFundingNeed = sumNullableSubtotals(
      outputs.linkedDependentEducationFundingNeed,
      outputs.desiredAdditionalDependentEducationFundingNeed
    );

    return createBlockOutput({
      blockId: EDUCATION_SUPPORT_BLOCK_ID,
      blockType: EDUCATION_SUPPORT_BLOCK_TYPE,
      blockVersion: EDUCATION_SUPPORT_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        linkedDependentCount: createLinkedProfileNumericOutputMetadata(
          outputs.linkedDependentCount,
          EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.linkedDependentCount,
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.linkedDependentCount.canonicalDestination
        ),
        desiredAdditionalDependentCount: createLinkedProfileNumericOutputMetadata(
          outputs.desiredAdditionalDependentCount,
          EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.desiredAdditionalDependentCount,
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.desiredAdditionalDependentCount.canonicalDestination
        ),
        perLinkedDependentEducationFunding: createUserReportedMetadata(
          outputs.perLinkedDependentEducationFunding,
          EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.perLinkedDependentEducationFunding,
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.perLinkedDependentEducationFunding.canonicalDestination
        ),
        perDesiredAdditionalDependentEducationFunding: createUserReportedMetadata(
          outputs.perDesiredAdditionalDependentEducationFunding,
          EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.perDesiredAdditionalDependentEducationFunding,
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.perDesiredAdditionalDependentEducationFunding.canonicalDestination
        ),
        sameEducationFundingForDesiredAdditionalDependents: createUserReportedMetadata(
          outputs.sameEducationFundingForDesiredAdditionalDependents,
          EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.sameEducationFundingForDesiredAdditionalDependents,
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.sameEducationFundingForDesiredAdditionalDependents.canonicalDestination
        ),
        linkedDependentEducationFundingNeed: createCalculatedEducationNeedMetadata(
          outputs.linkedDependentEducationFundingNeed,
          [
            EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.linkedDependentCount,
            EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.perLinkedDependentEducationFunding
          ].join("*"),
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.linkedDependentEducationFundingNeed.canonicalDestination
        ),
        desiredAdditionalDependentEducationFundingNeed: createCalculatedEducationNeedMetadata(
          outputs.desiredAdditionalDependentEducationFundingNeed,
          [
            EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.desiredAdditionalDependentCount,
            EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS.perDesiredAdditionalDependentEducationFunding
          ].join("*"),
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.desiredAdditionalDependentEducationFundingNeed.canonicalDestination
        ),
        totalEducationFundingNeed: createCalculatedEducationNeedMetadata(
          outputs.totalEducationFundingNeed,
          "linkedDependentEducationFundingNeed+desiredAdditionalDependentEducationFundingNeed",
          EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT.outputs.totalEducationFundingNeed.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.EDUCATION_SUPPORT_BLOCK_ID = EDUCATION_SUPPORT_BLOCK_ID;
  lensAnalysis.EDUCATION_SUPPORT_BLOCK_TYPE = EDUCATION_SUPPORT_BLOCK_TYPE;
  lensAnalysis.EDUCATION_SUPPORT_BLOCK_VERSION = EDUCATION_SUPPORT_BLOCK_VERSION;
  lensAnalysis.EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS = EDUCATION_SUPPORT_BLOCK_SOURCE_FIELDS;
  lensAnalysis.EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT = EDUCATION_SUPPORT_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createEducationSupportBlockOutput = createEducationSupportBlockOutput;
})();
