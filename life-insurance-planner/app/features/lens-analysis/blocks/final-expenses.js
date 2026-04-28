(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: final-expenses Lens block module.
  // Purpose: define the current PMI final-expenses block contract, source
  // fields, and pure builder for neutral lump-sum final-expense facts.
  // Non-goals: no DOM reads, no persistence, no inflation, no present-value
  // discounting, no offsets, and no recommendation logic.

  const FINAL_EXPENSES_BLOCK_ID = "final-expenses";
  const FINAL_EXPENSES_BLOCK_TYPE = "final-expenses.current-pmi";
  const FINAL_EXPENSES_BLOCK_VERSION = 1;

  const FINAL_EXPENSES_BLOCK_SOURCE_FIELDS = Object.freeze({
    funeralAndBurialCost: "funeralBurialEstimate",
    medicalEndOfLifeCost: "medicalEndOfLifeCosts",
    estateSettlementCost: "estateSettlementCosts",
    otherFinalExpenses: "otherFinalExpenses"
  });

  const FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: FINAL_EXPENSES_BLOCK_ID,
    blockType: FINAL_EXPENSES_BLOCK_TYPE,
    blockVersion: FINAL_EXPENSES_BLOCK_VERSION,
    outputs: {
      funeralAndBurialCost: {
        type: "number|null",
        canonicalDestination: "finalExpenses.funeralAndBurialCost",
        meaning: "One-time funeral and burial cost estimate."
      },
      medicalEndOfLifeCost: {
        type: "number|null",
        canonicalDestination: "finalExpenses.medicalEndOfLifeCost",
        meaning: "One-time medical end-of-life cost estimate."
      },
      estateSettlementCost: {
        type: "number|null",
        canonicalDestination: "finalExpenses.estateSettlementCost",
        meaning: "One-time estate settlement cost estimate."
      },
      otherFinalExpenses: {
        type: "number|null",
        canonicalDestination: "finalExpenses.otherFinalExpenses",
        meaning: "Other narrow one-time final expenses not captured by the named final-expense fields."
      },
      totalFinalExpenseNeed: {
        type: "number|null",
        canonicalDestination: "finalExpenses.totalFinalExpenseNeed",
        meaning: "Neutral lump-sum final expense target. Not inflation-adjusted, offset-adjusted, present-valued, or a recommendation."
      }
    }
  });

  function sumNullableFinalExpenseComponents(values) {
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

  function createFinalExpensesBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createReportedNumericOutputMetadata = lensAnalysis.createReportedNumericOutputMetadata;
    const createCalculatedNumericOutputMetadata = lensAnalysis.createCalculatedNumericOutputMetadata;

    const outputs = {
      funeralAndBurialCost: toOptionalNumber(data[FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.funeralAndBurialCost]),
      medicalEndOfLifeCost: toOptionalNumber(data[FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.medicalEndOfLifeCost]),
      estateSettlementCost: toOptionalNumber(data[FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.estateSettlementCost]),
      otherFinalExpenses: toOptionalNumber(data[FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.otherFinalExpenses]),
      totalFinalExpenseNeed: null
    };

    outputs.totalFinalExpenseNeed = sumNullableFinalExpenseComponents([
      outputs.funeralAndBurialCost,
      outputs.medicalEndOfLifeCost,
      outputs.estateSettlementCost,
      outputs.otherFinalExpenses
    ]);

    return createBlockOutput({
      blockId: FINAL_EXPENSES_BLOCK_ID,
      blockType: FINAL_EXPENSES_BLOCK_TYPE,
      blockVersion: FINAL_EXPENSES_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        funeralAndBurialCost: createReportedNumericOutputMetadata(
          outputs.funeralAndBurialCost,
          FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.funeralAndBurialCost,
          FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT.outputs.funeralAndBurialCost.canonicalDestination
        ),
        medicalEndOfLifeCost: createReportedNumericOutputMetadata(
          outputs.medicalEndOfLifeCost,
          FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.medicalEndOfLifeCost,
          FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT.outputs.medicalEndOfLifeCost.canonicalDestination
        ),
        estateSettlementCost: createReportedNumericOutputMetadata(
          outputs.estateSettlementCost,
          FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.estateSettlementCost,
          FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT.outputs.estateSettlementCost.canonicalDestination
        ),
        otherFinalExpenses: createReportedNumericOutputMetadata(
          outputs.otherFinalExpenses,
          FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.otherFinalExpenses,
          FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT.outputs.otherFinalExpenses.canonicalDestination
        ),
        totalFinalExpenseNeed: createCalculatedNumericOutputMetadata(
          outputs.totalFinalExpenseNeed,
          [
            FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.funeralAndBurialCost,
            FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.medicalEndOfLifeCost,
            FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.estateSettlementCost,
            FINAL_EXPENSES_BLOCK_SOURCE_FIELDS.otherFinalExpenses
          ].join("+"),
          FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT.outputs.totalFinalExpenseNeed.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.FINAL_EXPENSES_BLOCK_ID = FINAL_EXPENSES_BLOCK_ID;
  lensAnalysis.FINAL_EXPENSES_BLOCK_TYPE = FINAL_EXPENSES_BLOCK_TYPE;
  lensAnalysis.FINAL_EXPENSES_BLOCK_VERSION = FINAL_EXPENSES_BLOCK_VERSION;
  lensAnalysis.FINAL_EXPENSES_BLOCK_SOURCE_FIELDS = FINAL_EXPENSES_BLOCK_SOURCE_FIELDS;
  lensAnalysis.FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT = FINAL_EXPENSES_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createFinalExpensesBlockOutput = createFinalExpensesBlockOutput;
})();
