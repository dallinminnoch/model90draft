(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: income-net-income Lens block module.
  // Purpose: define the net-income block contract, source fields, and pure builder.
  // Non-goals: no DOM reads, no persistence, no page wiring.

  const NET_INCOME_BLOCK_ID = "income-net-income";
  const NET_INCOME_BLOCK_TYPE = "income.net-income.current-pmi";
  const NET_INCOME_BLOCK_VERSION = 1;

  // Current active linked PMI raw fields used or emitted by the net-income card.
  // These are intentionally source-field names, not canonical Lens bucket names.
  const NET_INCOME_BLOCK_SOURCE_FIELDS = Object.freeze({
    grossAnnualIncome: "grossAnnualIncome",
    netAnnualIncome: "netAnnualIncome",
    netAnnualIncomeManualOverride: "netAnnualIncomeManualOverride",
    bonusVariableAnnualIncome: "bonusVariableIncome",
    annualEmployerBenefitsValue: "employerBenefitsValue",
    insuredRetirementHorizonYears: "yearsUntilRetirement",
    incomeGrowthRatePercent: "incomeGrowthRate",
    spouseOrPartnerIncomeApplicability: "spouseOrPartnerIncomeApplicability",
    spouseOrPartnerGrossAnnualIncome: "spouseIncome",
    spouseOrPartnerNetAnnualIncome: "spouseNetAnnualIncome",
    spouseOrPartnerNetAnnualIncomeManualOverride: "spouseNetAnnualIncomeManualOverride"
  });

  const NET_INCOME_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: NET_INCOME_BLOCK_ID,
    blockType: NET_INCOME_BLOCK_TYPE,
    blockVersion: NET_INCOME_BLOCK_VERSION,
    outputs: {
      grossAnnualIncome: {
        type: "number|null",
        canonicalDestination: "incomeBasis.insuredGrossAnnualIncome",
        meaning: "Current insured gross annual income available to the net-income card."
      },
      netAnnualIncome: {
        type: "number|null",
        canonicalDestination: "incomeBasis.insuredNetAnnualIncome",
        meaning: "Current insured net annual income if the page calculation or manual override has produced it."
      },
      bonusVariableAnnualIncome: {
        type: "number|null",
        canonicalDestination: "incomeBasis.bonusVariableAnnualIncome",
        meaning: "Current annual bonus or variable income that should remain separate from the insured net-income field."
      },
      annualEmployerBenefitsValue: {
        type: "number|null",
        canonicalDestination: "incomeBasis.annualEmployerBenefitsValue",
        meaning: "Current annual employer-provided benefits value that contributes to future income-replacement analysis."
      },
      annualIncomeReplacementBase: {
        type: "number|null",
        canonicalDestination: "incomeBasis.annualIncomeReplacementBase",
        meaning: "Neutral annual income-replacement base for future analysis, not a total need or recommendation."
      },
      spouseOrPartnerGrossAnnualIncome: {
        type: "number|null",
        canonicalDestination: "incomeBasis.spouseOrPartnerGrossAnnualIncome",
        meaning: "Current spouse or partner gross annual income available to the net-income card."
      },
      spouseOrPartnerNetAnnualIncome: {
        type: "number|null",
        canonicalDestination: "incomeBasis.spouseOrPartnerNetAnnualIncome",
        meaning: "Current spouse or partner net annual income if the page calculation or manual override has produced it."
      },
      insuredRetirementHorizonYears: {
        type: "number|null",
        canonicalDestination: "incomeBasis.insuredRetirementHorizonYears",
        meaning: "Current insured working-years horizon captured on the Income and Economic Value card."
      },
      incomeGrowthRatePercent: {
        type: "number|null",
        canonicalDestination: "assumptions.economicAssumptions.incomeGrowthRatePercent",
        meaning: "Current annual income growth assumption stored separately from the neutral annual income-replacement base."
      }
    }
  });

  function getSpouseOrPartnerIncomeApplicability(sourceData) {
    const normalizedApplicability = String(
      sourceData && sourceData[NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerIncomeApplicability] || ""
    ).trim().toLowerCase();

    return normalizedApplicability === "separate" ? "separate" : "not_applicable";
  }

  function createAnnualIncomeReplacementBase(insuredNetAnnualIncome, bonusVariableAnnualIncome, annualEmployerBenefitsValue) {
    if (insuredNetAnnualIncome == null) {
      return null;
    }

    return insuredNetAnnualIncome
      + (bonusVariableAnnualIncome == null ? 0 : bonusVariableAnnualIncome)
      + (annualEmployerBenefitsValue == null ? 0 : annualEmployerBenefitsValue);
  }

  function createNetIncomeBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const spouseOrPartnerIncomeApplicability = getSpouseOrPartnerIncomeApplicability(data);
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const createBlockOutput = lensAnalysis.createBlockOutput;
    const createOutputMetadata = lensAnalysis.createOutputMetadata;
    const createReportedNumericOutputMetadata = lensAnalysis.createReportedNumericOutputMetadata;

    const outputs = {
      grossAnnualIncome: toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.grossAnnualIncome]),
      netAnnualIncome: toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.netAnnualIncome]),
      bonusVariableAnnualIncome: toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.bonusVariableAnnualIncome]),
      annualEmployerBenefitsValue: toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.annualEmployerBenefitsValue]),
      spouseOrPartnerGrossAnnualIncome: spouseOrPartnerIncomeApplicability === "separate"
        ? toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerGrossAnnualIncome])
        : null,
      spouseOrPartnerNetAnnualIncome: spouseOrPartnerIncomeApplicability === "separate"
        ? toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerNetAnnualIncome])
        : null,
      annualIncomeReplacementBase: null,
      insuredRetirementHorizonYears: toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.insuredRetirementHorizonYears]),
      incomeGrowthRatePercent: toOptionalNumber(data[NET_INCOME_BLOCK_SOURCE_FIELDS.incomeGrowthRatePercent])
    };
    outputs.annualIncomeReplacementBase = createAnnualIncomeReplacementBase(
      outputs.netAnnualIncome,
      outputs.bonusVariableAnnualIncome,
      outputs.annualEmployerBenefitsValue
    );

    const annualIncomeReplacementBaseMetadata = createOutputMetadata({
      sourceType: outputs.annualIncomeReplacementBase == null ? "missing" : "calculated",
      confidence: outputs.annualIncomeReplacementBase == null
        ? "unknown"
        : (data[NET_INCOME_BLOCK_SOURCE_FIELDS.netAnnualIncomeManualOverride] === true
          ? "calculated_from_manual_and_reported_inputs"
          : "calculated_from_reported_inputs"),
      rawField: [
        NET_INCOME_BLOCK_SOURCE_FIELDS.netAnnualIncome,
        NET_INCOME_BLOCK_SOURCE_FIELDS.bonusVariableAnnualIncome,
        NET_INCOME_BLOCK_SOURCE_FIELDS.annualEmployerBenefitsValue
      ].join("+"),
      canonicalDestination: NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.annualIncomeReplacementBase.canonicalDestination
    });
    const spouseOrPartnerGrossAnnualIncomeMetadata = spouseOrPartnerIncomeApplicability !== "separate"
      ? createOutputMetadata({
          sourceType: "not_applicable",
          confidence: "not_applicable",
          rawField: NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerGrossAnnualIncome,
          canonicalDestination: NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.spouseOrPartnerGrossAnnualIncome.canonicalDestination
        })
      : createReportedNumericOutputMetadata(
          outputs.spouseOrPartnerGrossAnnualIncome,
          NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerGrossAnnualIncome,
          NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.spouseOrPartnerGrossAnnualIncome.canonicalDestination
        );
    const spouseOrPartnerNetAnnualIncomeMetadata = createOutputMetadata({
      sourceType: spouseOrPartnerIncomeApplicability !== "separate"
        ? "not_applicable"
        : (outputs.spouseOrPartnerNetAnnualIncome == null
          ? "missing"
          : (data[NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerNetAnnualIncomeManualOverride] === true ? "manual_override" : "calculated")),
      confidence: spouseOrPartnerIncomeApplicability !== "separate"
        ? "not_applicable"
        : (outputs.spouseOrPartnerNetAnnualIncome == null
          ? "unknown"
          : (data[NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerNetAnnualIncomeManualOverride] === true ? "user_edited" : "estimated")),
      rawField: NET_INCOME_BLOCK_SOURCE_FIELDS.spouseOrPartnerNetAnnualIncome,
      canonicalDestination: NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.spouseOrPartnerNetAnnualIncome.canonicalDestination
    });

    return createBlockOutput({
      blockId: NET_INCOME_BLOCK_ID,
      blockType: NET_INCOME_BLOCK_TYPE,
      blockVersion: NET_INCOME_BLOCK_VERSION,
      outputs,
      outputMetadata: {
        grossAnnualIncome: createReportedNumericOutputMetadata(
          outputs.grossAnnualIncome,
          NET_INCOME_BLOCK_SOURCE_FIELDS.grossAnnualIncome,
          NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.grossAnnualIncome.canonicalDestination
        ),
        netAnnualIncome: createOutputMetadata({
          sourceType: outputs.netAnnualIncome == null
            ? "missing"
            : (data[NET_INCOME_BLOCK_SOURCE_FIELDS.netAnnualIncomeManualOverride] === true ? "manual_override" : "calculated"),
          confidence: outputs.netAnnualIncome == null
            ? "unknown"
            : (data[NET_INCOME_BLOCK_SOURCE_FIELDS.netAnnualIncomeManualOverride] === true ? "user_edited" : "estimated"),
          rawField: NET_INCOME_BLOCK_SOURCE_FIELDS.netAnnualIncome,
          canonicalDestination: NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.netAnnualIncome.canonicalDestination
        }),
        bonusVariableAnnualIncome: createReportedNumericOutputMetadata(
          outputs.bonusVariableAnnualIncome,
          NET_INCOME_BLOCK_SOURCE_FIELDS.bonusVariableAnnualIncome,
          NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.bonusVariableAnnualIncome.canonicalDestination
        ),
        annualEmployerBenefitsValue: createReportedNumericOutputMetadata(
          outputs.annualEmployerBenefitsValue,
          NET_INCOME_BLOCK_SOURCE_FIELDS.annualEmployerBenefitsValue,
          NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.annualEmployerBenefitsValue.canonicalDestination
        ),
        annualIncomeReplacementBase: annualIncomeReplacementBaseMetadata,
        spouseOrPartnerGrossAnnualIncome: spouseOrPartnerGrossAnnualIncomeMetadata,
        spouseOrPartnerNetAnnualIncome: spouseOrPartnerNetAnnualIncomeMetadata,
        insuredRetirementHorizonYears: createReportedNumericOutputMetadata(
          outputs.insuredRetirementHorizonYears,
          NET_INCOME_BLOCK_SOURCE_FIELDS.insuredRetirementHorizonYears,
          NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.insuredRetirementHorizonYears.canonicalDestination
        ),
        incomeGrowthRatePercent: createReportedNumericOutputMetadata(
          outputs.incomeGrowthRatePercent,
          NET_INCOME_BLOCK_SOURCE_FIELDS.incomeGrowthRatePercent,
          NET_INCOME_BLOCK_OUTPUT_CONTRACT.outputs.incomeGrowthRatePercent.canonicalDestination
        )
      }
    });
  }

  lensAnalysis.NET_INCOME_BLOCK_ID = NET_INCOME_BLOCK_ID;
  lensAnalysis.NET_INCOME_BLOCK_TYPE = NET_INCOME_BLOCK_TYPE;
  lensAnalysis.NET_INCOME_BLOCK_VERSION = NET_INCOME_BLOCK_VERSION;
  lensAnalysis.NET_INCOME_BLOCK_SOURCE_FIELDS = NET_INCOME_BLOCK_SOURCE_FIELDS;
  lensAnalysis.NET_INCOME_BLOCK_OUTPUT_CONTRACT = NET_INCOME_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createNetIncomeBlockOutput = createNetIncomeBlockOutput;
})();
