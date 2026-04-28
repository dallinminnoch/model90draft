(function () {
  const LensApp = window.LensApp || (window.LensApp = {});
  const lensAnalysis = LensApp.lensAnalysis || (LensApp.lensAnalysis = {});

  // Owner: lens-analysis feature module.
  // Purpose: provide shared block-output helpers and the runtime collector seam.
  // Load this before any block-specific modules in app/features/lens-analysis/blocks/.
  // Non-goals: no DOM reads, no persistence, no formula execution, no page wiring.

  const DEFAULT_BLOCK_OUTPUT_VERSION = 1;

  function toOptionalNumber(value) {
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

  function createBlockOutput(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};

    return {
      blockId: String(normalizedOptions.blockId || "").trim(),
      blockType: String(normalizedOptions.blockType || "").trim(),
      blockVersion: Number(normalizedOptions.blockVersion) || DEFAULT_BLOCK_OUTPUT_VERSION,
      outputs: normalizedOptions.outputs && typeof normalizedOptions.outputs === "object"
        ? { ...normalizedOptions.outputs }
        : {},
      outputMetadata: normalizedOptions.outputMetadata && typeof normalizedOptions.outputMetadata === "object"
        ? { ...normalizedOptions.outputMetadata }
        : {}
    };
  }

  function createOutputMetadata(options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    return {
      sourceType: String(normalizedOptions.sourceType || "missing").trim(),
      confidence: String(normalizedOptions.confidence || "unknown").trim(),
      rawField: normalizedOptions.rawField == null ? null : String(normalizedOptions.rawField).trim(),
      canonicalDestination: normalizedOptions.canonicalDestination == null ? null : String(normalizedOptions.canonicalDestination).trim()
    };
  }

  function createReportedNumericOutputMetadata(outputValue, rawField, canonicalDestination) {
    return createOutputMetadata({
      sourceType: outputValue == null ? "missing" : "user-input",
      confidence: outputValue == null ? "unknown" : "reported",
      rawField: rawField,
      canonicalDestination: canonicalDestination
    });
  }

  function createCalculatedNumericOutputMetadata(outputValue, rawField, canonicalDestination, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const isManualOverride = normalizedOptions.manualOverride === true;

    return createOutputMetadata({
      sourceType: outputValue == null
        ? "missing"
        : (isManualOverride ? "manual_override" : "calculated"),
      confidence: outputValue == null
        ? "unknown"
        : (isManualOverride ? "user_edited" : "calculated_from_reported_inputs"),
      rawField: rawField,
      canonicalDestination: canonicalDestination
    });
  }

  function upsertRuntimeBlockOutput(runtimeNamespace, blockOutput) {
    const namespace = runtimeNamespace && typeof runtimeNamespace === "object" ? runtimeNamespace : null;
    const nextBlockOutput = blockOutput && typeof blockOutput === "object" ? blockOutput : null;
    const blockId = String(nextBlockOutput?.blockId || "").trim();

    if (!namespace || !nextBlockOutput || !blockId) {
      return null;
    }

    if (!namespace.blockOutputs || typeof namespace.blockOutputs !== "object") {
      namespace.blockOutputs = {};
    }

    namespace.blockOutputs[blockId] = nextBlockOutput;
    return namespace.blockOutputs[blockId];
  }

  lensAnalysis.DEFAULT_BLOCK_OUTPUT_VERSION = DEFAULT_BLOCK_OUTPUT_VERSION;
  lensAnalysis.toOptionalNumber = toOptionalNumber;
  lensAnalysis.createBlockOutput = createBlockOutput;
  lensAnalysis.createOutputMetadata = createOutputMetadata;
  lensAnalysis.createReportedNumericOutputMetadata = createReportedNumericOutputMetadata;
  lensAnalysis.createCalculatedNumericOutputMetadata = createCalculatedNumericOutputMetadata;
  lensAnalysis.upsertRuntimeBlockOutput = upsertRuntimeBlockOutput;
})();
