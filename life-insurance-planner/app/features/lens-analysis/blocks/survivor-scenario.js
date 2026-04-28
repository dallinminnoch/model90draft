(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: survivor-scenario Lens block module.
  // Purpose: define the current PMI survivor-scenario block contract, source
  // fields, and pure builder for neutral post-death survivor assumptions.
  // Non-goals: no DOM reads, no persistence, no incomeBasis writes, no survivor
  // income offsetting, no coverage-gap math, and no recommendation logic.

  const SURVIVOR_SCENARIO_BLOCK_ID = "survivor-scenario";
  const SURVIVOR_SCENARIO_BLOCK_TYPE = "survivor-scenario.current-pmi";
  const SURVIVOR_SCENARIO_BLOCK_VERSION = 1;

  const SURVIVOR_SCENARIO_BLOCK_SOURCE_FIELDS = Object.freeze({
    survivorContinuesWorking: "survivorContinuesWorking",
    expectedSurvivorWorkReductionPercent: "spouseExpectedWorkReductionAtDeath",
    survivorGrossAnnualIncome: "survivorIncome",
    survivorGrossAnnualIncomeManualOverride: "survivorIncomeManualOverride",
    survivorNetAnnualIncome: "survivorNetAnnualIncome",
    survivorNetAnnualIncomeManualOverride: "survivorNetAnnualIncomeManualOverride",
    survivorIncomeStartDelayMonths: "survivorIncomeStartDelayMonths",
    survivorEarnedIncomeGrowthRatePercent: "spouseIncomeGrowthRate",
    survivorRetirementHorizonYears: "spouseYearsUntilRetirement",
    survivorNetIncomeTaxBasis: "survivorNetIncomeTaxBasis"
  });

  const SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: SURVIVOR_SCENARIO_BLOCK_ID,
    blockType: SURVIVOR_SCENARIO_BLOCK_TYPE,
    blockVersion: SURVIVOR_SCENARIO_BLOCK_VERSION,
    outputs: {
      survivorContinuesWorking: {
        type: "boolean|null",
        canonicalDestination: "survivorScenario.survivorContinuesWorking",
        meaning: "Raw survivor work-continuation assumption after death."
      },
      expectedSurvivorWorkReductionPercent: {
        type: "number|null",
        canonicalDestination: "survivorScenario.expectedSurvivorWorkReductionPercent",
        meaning: "Expected survivor work reduction at death, if survivor work continues."
      },
      survivorGrossAnnualIncome: {
        type: "number|null",
        canonicalDestination: "survivorScenario.survivorGrossAnnualIncome",
        meaning: "Post-death survivor gross annual income assumption."
      },
      survivorNetAnnualIncome: {
        type: "number|null",
        canonicalDestination: "survivorScenario.survivorNetAnnualIncome",
        meaning: "Post-death survivor net annual income assumption."
      },
      survivorIncomeStartDelayMonths: {
        type: "number|null",
        canonicalDestination: "survivorScenario.survivorIncomeStartDelayMonths",
        meaning: "Expected delay before survivor income starts after death."
      },
      survivorEarnedIncomeGrowthRatePercent: {
        type: "number|null",
        canonicalDestination: "survivorScenario.survivorEarnedIncomeGrowthRatePercent",
        meaning: "Survivor earned-income growth assumption."
      },
      survivorRetirementHorizonYears: {
        type: "number|null",
        canonicalDestination: "survivorScenario.survivorRetirementHorizonYears",
        meaning: "Survivor years until retirement or income exhaustion."
      },
      survivorNetIncomeTaxBasis: {
        type: "string|null",
        canonicalDestination: "survivorScenario.survivorNetIncomeTaxBasis",
        meaning: "Internal survivor net-income tax basis used for autofill."
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

  function toOptionalString(value) {
    const normalized = String(value == null ? "" : value).trim();
    return normalized || null;
  }

  function isManualOverride(value) {
    return value === true || String(value || "").trim().toLowerCase() === "true";
  }

  function createScenarioMetadata(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    return lensAnalysis.createOutputMetadata({
      sourceType: normalizedOptions.sourceType,
      confidence: normalizedOptions.confidence,
      rawField: normalizedOptions.rawField,
      canonicalDestination: normalizedOptions.canonicalDestination
    });
  }

  function createReportedMetadata(outputValue, rawField, canonicalDestination, applicability) {
    if (applicability === false) {
      return createScenarioMetadata({
        sourceType: "not_applicable",
        confidence: "not_applicable",
        rawField,
        canonicalDestination
      });
    }

    return createScenarioMetadata({
      sourceType: outputValue == null ? "missing" : "user-input",
      confidence: outputValue == null ? "unknown" : "reported",
      rawField,
      canonicalDestination
    });
  }

  function createCalculatedIncomeMetadata(outputValue, rawField, canonicalDestination, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const applicability = normalizedOptions.applicability;
    const manualOverride = normalizedOptions.manualOverride === true;
    const calculatedConfidence = normalizedOptions.calculatedConfidence || "calculated_from_reported_inputs";

    if (applicability === false) {
      return createScenarioMetadata({
        sourceType: "not_applicable",
        confidence: "not_applicable",
        rawField,
        canonicalDestination
      });
    }

    return createScenarioMetadata({
      sourceType: outputValue == null
        ? "missing"
        : (manualOverride ? "user-input" : "calculated"),
      confidence: outputValue == null
        ? "unknown"
        : (manualOverride ? "reported" : calculatedConfidence),
      rawField,
      canonicalDestination
    });
  }

  function createTaxBasisMetadata(outputValue, rawField, canonicalDestination, applicability) {
    if (applicability === false) {
      return createScenarioMetadata({
        sourceType: "not_applicable",
        confidence: "not_applicable",
        rawField,
        canonicalDestination
      });
    }

    return createScenarioMetadata({
      sourceType: outputValue == null ? "missing" : "calculated",
      confidence: outputValue == null ? "unknown" : "default_survivor_tax_basis",
      rawField,
      canonicalDestination
    });
  }

  function getDependentNumericValue(data, sourceField, survivorContinuesWorking) {
    if (survivorContinuesWorking !== true) {
      return null;
    }

    return lensAnalysis.toOptionalNumber(data[sourceField]);
  }

  function createSurvivorScenarioBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const sourceFields = SURVIVOR_SCENARIO_BLOCK_SOURCE_FIELDS;
    const survivorContinuesWorking = toOptionalBoolean(data[sourceFields.survivorContinuesWorking]);
    const survivorScenarioApplies = survivorContinuesWorking === true;
    const survivorScenarioNotApplicable = survivorContinuesWorking === false;

    const outputs = {
      survivorContinuesWorking,
      expectedSurvivorWorkReductionPercent: getDependentNumericValue(data, sourceFields.expectedSurvivorWorkReductionPercent, survivorContinuesWorking),
      survivorGrossAnnualIncome: getDependentNumericValue(data, sourceFields.survivorGrossAnnualIncome, survivorContinuesWorking),
      survivorNetAnnualIncome: getDependentNumericValue(data, sourceFields.survivorNetAnnualIncome, survivorContinuesWorking),
      survivorIncomeStartDelayMonths: getDependentNumericValue(data, sourceFields.survivorIncomeStartDelayMonths, survivorContinuesWorking),
      survivorEarnedIncomeGrowthRatePercent: getDependentNumericValue(data, sourceFields.survivorEarnedIncomeGrowthRatePercent, survivorContinuesWorking),
      survivorRetirementHorizonYears: getDependentNumericValue(data, sourceFields.survivorRetirementHorizonYears, survivorContinuesWorking),
      survivorNetIncomeTaxBasis: null
    };

    if (survivorScenarioApplies && (outputs.survivorGrossAnnualIncome != null || outputs.survivorNetAnnualIncome != null)) {
      outputs.survivorNetIncomeTaxBasis = toOptionalString(data[sourceFields.survivorNetIncomeTaxBasis]);
    }

    const grossManualOverride = isManualOverride(data[sourceFields.survivorGrossAnnualIncomeManualOverride]);
    const netManualOverride = isManualOverride(data[sourceFields.survivorNetAnnualIncomeManualOverride]);

    return lensAnalysis.createBlockOutput({
      blockId: SURVIVOR_SCENARIO_BLOCK_ID,
      blockType: SURVIVOR_SCENARIO_BLOCK_TYPE,
      blockVersion: SURVIVOR_SCENARIO_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        survivorContinuesWorking: createReportedMetadata(
          outputs.survivorContinuesWorking,
          sourceFields.survivorContinuesWorking,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorContinuesWorking.canonicalDestination,
          true
        ),
        expectedSurvivorWorkReductionPercent: createReportedMetadata(
          outputs.expectedSurvivorWorkReductionPercent,
          sourceFields.expectedSurvivorWorkReductionPercent,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.expectedSurvivorWorkReductionPercent.canonicalDestination,
          !survivorScenarioNotApplicable
        ),
        survivorGrossAnnualIncome: createCalculatedIncomeMetadata(
          outputs.survivorGrossAnnualIncome,
          sourceFields.survivorGrossAnnualIncome,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorGrossAnnualIncome.canonicalDestination,
          {
            applicability: !survivorScenarioNotApplicable,
            manualOverride: grossManualOverride,
            calculatedConfidence: "calculated_from_spouse_income_work_reduction"
          }
        ),
        survivorNetAnnualIncome: createCalculatedIncomeMetadata(
          outputs.survivorNetAnnualIncome,
          sourceFields.survivorNetAnnualIncome,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorNetAnnualIncome.canonicalDestination,
          {
            applicability: !survivorScenarioNotApplicable,
            manualOverride: netManualOverride,
            calculatedConfidence: "calculated_from_tax_inputs"
          }
        ),
        survivorIncomeStartDelayMonths: createReportedMetadata(
          outputs.survivorIncomeStartDelayMonths,
          sourceFields.survivorIncomeStartDelayMonths,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorIncomeStartDelayMonths.canonicalDestination,
          !survivorScenarioNotApplicable
        ),
        survivorEarnedIncomeGrowthRatePercent: createReportedMetadata(
          outputs.survivorEarnedIncomeGrowthRatePercent,
          sourceFields.survivorEarnedIncomeGrowthRatePercent,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorEarnedIncomeGrowthRatePercent.canonicalDestination,
          !survivorScenarioNotApplicable
        ),
        survivorRetirementHorizonYears: createReportedMetadata(
          outputs.survivorRetirementHorizonYears,
          sourceFields.survivorRetirementHorizonYears,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorRetirementHorizonYears.canonicalDestination,
          !survivorScenarioNotApplicable
        ),
        survivorNetIncomeTaxBasis: createTaxBasisMetadata(
          outputs.survivorNetIncomeTaxBasis,
          sourceFields.survivorNetIncomeTaxBasis,
          SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT.outputs.survivorNetIncomeTaxBasis.canonicalDestination,
          !survivorScenarioNotApplicable
        )
      }
    });
  }

  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_ID = SURVIVOR_SCENARIO_BLOCK_ID;
  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_TYPE = SURVIVOR_SCENARIO_BLOCK_TYPE;
  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_VERSION = SURVIVOR_SCENARIO_BLOCK_VERSION;
  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_SOURCE_FIELDS = SURVIVOR_SCENARIO_BLOCK_SOURCE_FIELDS;
  lensAnalysis.SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT = SURVIVOR_SCENARIO_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createSurvivorScenarioBlockOutput = createSurvivorScenarioBlockOutput;
})();
