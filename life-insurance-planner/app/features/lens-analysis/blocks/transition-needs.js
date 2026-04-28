(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: transition-needs Lens block module.
  // Purpose: define the current PMI transition-needs block contract, source
  // fields, and pure builder for neutral one-time survivor transition needs.
  // Non-goals: no DOM reads, no persistence, no offsets, no inflation,
  // no present-value discounting, and no recommendation logic.

  const TRANSITION_NEEDS_BLOCK_ID = "transition-needs";
  const TRANSITION_NEEDS_BLOCK_TYPE = "transition-needs.current-pmi";
  const TRANSITION_NEEDS_BLOCK_VERSION = 1;

  const TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS = Object.freeze({
    survivorLiquidityBuffer: "immediateLiquidityBuffer",
    desiredEmergencyFund: "desiredEmergencyFund",
    housingTransitionReserve: "relocationReserve",
    otherTransitionNeeds: "otherTransitionNeeds"
  });

  const TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: TRANSITION_NEEDS_BLOCK_ID,
    blockType: TRANSITION_NEEDS_BLOCK_TYPE,
    blockVersion: TRANSITION_NEEDS_BLOCK_VERSION,
    outputs: {
      survivorLiquidityBuffer: {
        type: "number|null",
        canonicalDestination: "transitionNeeds.survivorLiquidityBuffer",
        meaning: "Short-term survivor cash need for the immediate aftermath of death."
      },
      desiredEmergencyFund: {
        type: "number|null",
        canonicalDestination: "transitionNeeds.desiredEmergencyFund",
        meaning: "Longer-term survivor emergency reserve target after the initial transition period."
      },
      housingTransitionReserve: {
        type: "number|null",
        canonicalDestination: "transitionNeeds.housingTransitionReserve",
        meaning: "One-time housing transition or relocation reserve."
      },
      otherTransitionNeeds: {
        type: "number|null",
        canonicalDestination: "transitionNeeds.otherTransitionNeeds",
        meaning: "Other one-time survivor transition needs not captured by the named transition fields."
      },
      totalTransitionNeed: {
        type: "number|null",
        canonicalDestination: "transitionNeeds.totalTransitionNeed",
        meaning: "Neutral lump-sum survivor transition need. Not offset-adjusted, inflation-adjusted, present-valued, or a recommendation."
      }
    }
  });

  function sumNullableTransitionNeedComponents(values) {
    let hasAnyValue = false;
    let total = 0;

    values.forEach(function (value) {
      if (value == null) {
        return;
      }

      hasAnyValue = true;
      total += value;
    });

    return hasAnyValue ? total : null;
  }

  function createTransitionNeedsBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createReportedNumericOutputMetadata = lensAnalysis.createReportedNumericOutputMetadata;
    const createCalculatedNumericOutputMetadata = lensAnalysis.createCalculatedNumericOutputMetadata;

    const outputs = {
      survivorLiquidityBuffer: toOptionalNumber(data[TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.survivorLiquidityBuffer]),
      desiredEmergencyFund: toOptionalNumber(data[TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.desiredEmergencyFund]),
      housingTransitionReserve: toOptionalNumber(data[TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.housingTransitionReserve]),
      otherTransitionNeeds: toOptionalNumber(data[TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.otherTransitionNeeds]),
      totalTransitionNeed: null
    };

    outputs.totalTransitionNeed = sumNullableTransitionNeedComponents([
      outputs.survivorLiquidityBuffer,
      outputs.desiredEmergencyFund,
      outputs.housingTransitionReserve,
      outputs.otherTransitionNeeds
    ]);

    return createBlockOutput({
      blockId: TRANSITION_NEEDS_BLOCK_ID,
      blockType: TRANSITION_NEEDS_BLOCK_TYPE,
      blockVersion: TRANSITION_NEEDS_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        survivorLiquidityBuffer: createReportedNumericOutputMetadata(
          outputs.survivorLiquidityBuffer,
          TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.survivorLiquidityBuffer,
          TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT.outputs.survivorLiquidityBuffer.canonicalDestination
        ),
        desiredEmergencyFund: createReportedNumericOutputMetadata(
          outputs.desiredEmergencyFund,
          TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.desiredEmergencyFund,
          TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT.outputs.desiredEmergencyFund.canonicalDestination
        ),
        housingTransitionReserve: createReportedNumericOutputMetadata(
          outputs.housingTransitionReserve,
          TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.housingTransitionReserve,
          TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT.outputs.housingTransitionReserve.canonicalDestination
        ),
        otherTransitionNeeds: createReportedNumericOutputMetadata(
          outputs.otherTransitionNeeds,
          TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.otherTransitionNeeds,
          TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT.outputs.otherTransitionNeeds.canonicalDestination
        ),
        totalTransitionNeed: createCalculatedNumericOutputMetadata(
          outputs.totalTransitionNeed,
          [
            TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.survivorLiquidityBuffer,
            TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.desiredEmergencyFund,
            TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.housingTransitionReserve,
            TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS.otherTransitionNeeds
          ].join("+"),
          TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT.outputs.totalTransitionNeed.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.TRANSITION_NEEDS_BLOCK_ID = TRANSITION_NEEDS_BLOCK_ID;
  lensAnalysis.TRANSITION_NEEDS_BLOCK_TYPE = TRANSITION_NEEDS_BLOCK_TYPE;
  lensAnalysis.TRANSITION_NEEDS_BLOCK_VERSION = TRANSITION_NEEDS_BLOCK_VERSION;
  lensAnalysis.TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS = TRANSITION_NEEDS_BLOCK_SOURCE_FIELDS;
  lensAnalysis.TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT = TRANSITION_NEEDS_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createTransitionNeedsBlockOutput = createTransitionNeedsBlockOutput;
})();
