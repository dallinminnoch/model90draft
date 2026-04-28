(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: offset-assets Lens block module.
  // Purpose: define the current PMI offset-assets block contract, source
  // fields, and pure builder for neutral current asset/availability facts.
  // Non-goals: no DOM reads, no persistence, no coverage-policy data, no asset
  // subtraction, no coverage-gap math, and no recommendation logic.

  const OFFSET_ASSETS_BLOCK_ID = "offset-assets";
  const OFFSET_ASSETS_BLOCK_TYPE = "offset-assets.current-pmi";
  const OFFSET_ASSETS_BLOCK_VERSION = 1;

  const OFFSET_ASSET_DEFINITIONS = Object.freeze([
    Object.freeze({
      sourceKey: "cashSavings",
      canonicalKey: "cashSavings",
      valueField: "cashSavings",
      includeField: "cashSavingsIncludeInOffset",
      liquidityField: "cashSavingsLiquidityType",
      percentField: "cashSavingsPercentAvailable",
      label: "Cash / Savings"
    }),
    Object.freeze({
      sourceKey: "emergencyFund",
      canonicalKey: "currentEmergencyFund",
      valueField: "emergencyFund",
      includeField: "emergencyFundIncludeInOffset",
      liquidityField: "emergencyFundLiquidityType",
      percentField: "emergencyFundPercentAvailable",
      label: "Current Emergency Fund"
    }),
    Object.freeze({
      sourceKey: "brokerageAccounts",
      canonicalKey: "brokerageAccounts",
      valueField: "brokerageAccounts",
      includeField: "brokerageAccountsIncludeInOffset",
      liquidityField: "brokerageAccountsLiquidityType",
      percentField: "brokerageAccountsPercentAvailable",
      label: "Brokerage Accounts"
    }),
    Object.freeze({
      sourceKey: "retirementAssets",
      canonicalKey: "retirementAccounts",
      valueField: "retirementAssets",
      includeField: "retirementAssetsIncludeInOffset",
      liquidityField: "retirementAssetsLiquidityType",
      percentField: "retirementAssetsPercentAvailable",
      label: "Retirement Accounts"
    }),
    Object.freeze({
      sourceKey: "realEstateEquity",
      canonicalKey: "realEstateEquity",
      valueField: "realEstateEquity",
      includeField: "realEstateEquityIncludeInOffset",
      liquidityField: "realEstateEquityLiquidityType",
      percentField: "realEstateEquityPercentAvailable",
      label: "Real Estate Equity"
    }),
    Object.freeze({
      sourceKey: "businessValue",
      canonicalKey: "businessValue",
      valueField: "businessValue",
      includeField: "businessValueIncludeInOffset",
      liquidityField: "businessValueLiquidityType",
      percentField: "businessValuePercentAvailable",
      label: "Business Value"
    })
  ]);

  const OFFSET_ASSETS_BLOCK_SOURCE_FIELDS = Object.freeze(
    OFFSET_ASSET_DEFINITIONS.reduce(function (sourceFields, assetDefinition) {
      sourceFields[assetDefinition.sourceKey] = Object.freeze({
        value: assetDefinition.valueField,
        includeInOffset: assetDefinition.includeField,
        liquidityType: assetDefinition.liquidityField,
        availablePercent: assetDefinition.percentField
      });
      return sourceFields;
    }, {
      assetDataConfidence: "assetsConfidenceLevel"
    })
  );

  function createAssetOutputContract() {
    return OFFSET_ASSET_DEFINITIONS.reduce(function (contract, assetDefinition) {
      const canonicalPrefix = "offsetAssets." + assetDefinition.canonicalKey;
      const outputPrefix = assetDefinition.canonicalKey + ".";

      contract[outputPrefix + "value"] = {
        type: "number|null",
        canonicalDestination: canonicalPrefix + ".value",
        meaning: assetDefinition.label + " current reported value."
      };
      contract[outputPrefix + "includeInOffset"] = {
        type: "boolean|null",
        canonicalDestination: canonicalPrefix + ".includeInOffset",
        meaning: "Raw advisor/user decision about whether this asset may be modeled as an offset later."
      };
      contract[outputPrefix + "liquidityType"] = {
        type: "string|null",
        canonicalDestination: canonicalPrefix + ".liquidityType",
        meaning: "Raw selected liquidity type for this asset."
      };
      contract[outputPrefix + "availablePercent"] = {
        type: "number|null",
        canonicalDestination: canonicalPrefix + ".availablePercent",
        meaning: "Raw percent available for survivor needs / offset modeling."
      };
      contract[outputPrefix + "availableValue"] = {
        type: "number|null",
        canonicalDestination: canonicalPrefix + ".availableValue",
        meaning: "Neutral calculated available value for this asset. Not subtracted from needs in this block."
      };
      return contract;
    }, {
      assetDataConfidence: {
        type: "string|null",
        canonicalDestination: "offsetAssets.assetDataConfidence",
        meaning: "Raw confidence value for the current asset data, when present."
      },
      totalReportedAssetValue: {
        type: "number|null",
        canonicalDestination: "offsetAssets.totalReportedAssetValue",
        meaning: "Sum of all reported current asset values, regardless of include-in-offset decision."
      },
      totalIncludedAssetValue: {
        type: "number|null",
        canonicalDestination: "offsetAssets.totalIncludedAssetValue",
        meaning: "Sum of raw reported values only for assets explicitly included in offset modeling."
      },
      totalAvailableOffsetAssetValue: {
        type: "number|null",
        canonicalDestination: "offsetAssets.totalAvailableOffsetAssetValue",
        meaning: "Sum of calculated available asset values. This is neutral input data, not a recommendation offset."
      }
    });
  }

  const OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT = Object.freeze({
    blockId: OFFSET_ASSETS_BLOCK_ID,
    blockType: OFFSET_ASSETS_BLOCK_TYPE,
    blockVersion: OFFSET_ASSETS_BLOCK_VERSION,
    outputs: Object.freeze(createAssetOutputContract())
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

  function calculateAvailableAssetValue(assetOutput) {
    if (assetOutput.includeInOffset === false) {
      return 0;
    }

    if (assetOutput.includeInOffset !== true) {
      return null;
    }

    if (assetOutput.value == null || assetOutput.availablePercent == null) {
      return null;
    }

    return assetOutput.value * assetOutput.availablePercent / 100;
  }

  function sumNullableValues(values) {
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

  function sumIncludedAssetValues(assetOutputs) {
    let hasIncludedValue = false;
    let total = 0;

    assetOutputs.forEach(function (assetOutput) {
      if (assetOutput.includeInOffset !== true || assetOutput.value == null) {
        return;
      }

      hasIncludedValue = true;
      total += assetOutput.value;
    });

    return hasIncludedValue ? total : null;
  }

  function createReportedOutputMetadata(outputValue, rawField, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "user-input",
      confidence: outputValue == null ? "unknown" : "reported",
      rawField,
      canonicalDestination
    });
  }

  function createCalculatedOutputMetadata(outputValue, rawField, canonicalDestination) {
    return lensAnalysis.createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "calculated",
      confidence: outputValue == null ? "unknown" : "calculated_from_reported_inputs",
      rawField,
      canonicalDestination
    });
  }

  function getAssetOutputKey(assetDefinition, fieldKey) {
    return assetDefinition.canonicalKey + "." + fieldKey;
  }

  function createOffsetAssetsBlockOutput(sourceData) {
    const data = sourceData && typeof sourceData === "object" ? sourceData : {};
    const toOptionalNumber = lensAnalysis.toOptionalNumber;
    const outputs = {};
    const outputMetadata = {};
    const assetOutputs = [];

    OFFSET_ASSET_DEFINITIONS.forEach(function (assetDefinition) {
      const assetOutput = {
        value: toOptionalNumber(data[assetDefinition.valueField]),
        includeInOffset: toOptionalBoolean(data[assetDefinition.includeField]),
        liquidityType: toOptionalString(data[assetDefinition.liquidityField]),
        availablePercent: toOptionalNumber(data[assetDefinition.percentField]),
        availableValue: null
      };
      assetOutput.availableValue = calculateAvailableAssetValue(assetOutput);
      assetOutputs.push(assetOutput);

      ["value", "includeInOffset", "liquidityType", "availablePercent", "availableValue"].forEach(function (fieldKey) {
        const outputKey = getAssetOutputKey(assetDefinition, fieldKey);
        outputs[outputKey] = assetOutput[fieldKey];
      });

      outputMetadata[getAssetOutputKey(assetDefinition, "value")] = createReportedOutputMetadata(
        assetOutput.value,
        assetDefinition.valueField,
        OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs[getAssetOutputKey(assetDefinition, "value")].canonicalDestination
      );
      outputMetadata[getAssetOutputKey(assetDefinition, "includeInOffset")] = createReportedOutputMetadata(
        assetOutput.includeInOffset,
        assetDefinition.includeField,
        OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs[getAssetOutputKey(assetDefinition, "includeInOffset")].canonicalDestination
      );
      outputMetadata[getAssetOutputKey(assetDefinition, "liquidityType")] = createReportedOutputMetadata(
        assetOutput.liquidityType,
        assetDefinition.liquidityField,
        OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs[getAssetOutputKey(assetDefinition, "liquidityType")].canonicalDestination
      );
      outputMetadata[getAssetOutputKey(assetDefinition, "availablePercent")] = createReportedOutputMetadata(
        assetOutput.availablePercent,
        assetDefinition.percentField,
        OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs[getAssetOutputKey(assetDefinition, "availablePercent")].canonicalDestination
      );
      outputMetadata[getAssetOutputKey(assetDefinition, "availableValue")] = createCalculatedOutputMetadata(
        assetOutput.availableValue,
        [
          assetDefinition.valueField,
          assetDefinition.includeField,
          assetDefinition.percentField
        ].join("+"),
        OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs[getAssetOutputKey(assetDefinition, "availableValue")].canonicalDestination
      );
    });

    outputs.assetDataConfidence = toOptionalString(data[OFFSET_ASSETS_BLOCK_SOURCE_FIELDS.assetDataConfidence]);
    outputs.totalReportedAssetValue = sumNullableValues(assetOutputs.map(function (assetOutput) {
      return assetOutput.value;
    }));
    outputs.totalIncludedAssetValue = sumIncludedAssetValues(assetOutputs);
    outputs.totalAvailableOffsetAssetValue = sumNullableValues(assetOutputs.map(function (assetOutput) {
      return assetOutput.availableValue;
    }));

    outputMetadata.assetDataConfidence = createReportedOutputMetadata(
      outputs.assetDataConfidence,
      OFFSET_ASSETS_BLOCK_SOURCE_FIELDS.assetDataConfidence,
      OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs.assetDataConfidence.canonicalDestination
    );
    outputMetadata.totalReportedAssetValue = createCalculatedOutputMetadata(
      outputs.totalReportedAssetValue,
      OFFSET_ASSET_DEFINITIONS.map(function (assetDefinition) {
        return assetDefinition.valueField;
      }).join("+"),
      OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs.totalReportedAssetValue.canonicalDestination
    );
    outputMetadata.totalIncludedAssetValue = createCalculatedOutputMetadata(
      outputs.totalIncludedAssetValue,
      OFFSET_ASSET_DEFINITIONS.map(function (assetDefinition) {
        return assetDefinition.valueField + " when " + assetDefinition.includeField + " is Yes";
      }).join("+"),
      OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs.totalIncludedAssetValue.canonicalDestination
    );
    outputMetadata.totalAvailableOffsetAssetValue = createCalculatedOutputMetadata(
      outputs.totalAvailableOffsetAssetValue,
      OFFSET_ASSET_DEFINITIONS.map(function (assetDefinition) {
        return getAssetOutputKey(assetDefinition, "availableValue");
      }).join("+"),
      OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT.outputs.totalAvailableOffsetAssetValue.canonicalDestination
    );

    return lensAnalysis.createBlockOutput({
      blockId: OFFSET_ASSETS_BLOCK_ID,
      blockType: OFFSET_ASSETS_BLOCK_TYPE,
      blockVersion: OFFSET_ASSETS_BLOCK_VERSION,
      outputs,
      outputMetadata
    });
  }

  lensAnalysis.OFFSET_ASSETS_BLOCK_ID = OFFSET_ASSETS_BLOCK_ID;
  lensAnalysis.OFFSET_ASSETS_BLOCK_TYPE = OFFSET_ASSETS_BLOCK_TYPE;
  lensAnalysis.OFFSET_ASSETS_BLOCK_VERSION = OFFSET_ASSETS_BLOCK_VERSION;
  lensAnalysis.OFFSET_ASSET_DEFINITIONS = OFFSET_ASSET_DEFINITIONS;
  lensAnalysis.OFFSET_ASSETS_BLOCK_SOURCE_FIELDS = OFFSET_ASSETS_BLOCK_SOURCE_FIELDS;
  lensAnalysis.OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT = OFFSET_ASSETS_BLOCK_OUTPUT_CONTRACT;
  lensAnalysis.createOffsetAssetsBlockOutput = createOffsetAssetsBlockOutput;
})();
